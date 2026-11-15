//! Phase 33 (L5): Offline Clinical Calibration, Anti-Leakage Verification, and
//! Fail-Closed Validation Manifest CLI (`ares-calibrate`).
//!
//! Executes strictly subject-disjoint evaluation on bundled PhysioNet BIDMC
//! (`train=bidmc_02`, `cal=bidmc_01`, `test=bidmc_03`), probes external
//! PhysioNet / NASA OSDR / DLR HDBR Parquet/WFDB adapters cleanly, verifies
//! `SostRk4SensitivityAudit` and Bayesian POCUS structural bounds, initializes
//! `AresTemporalForecasterEngine::new_with_optional_checkpoint`, and emits a
//! fail-closed `ModelValidationStatus` without fabricated metrics or clinical claims.

use anyhow::{Context, Result, bail};
use ares_causal_graph::bayesian_pocus::{
    BayesianPocusStructuralAudit, audit_bayesian_pocus_structural_bounds,
};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_causal_graph::parquet_adapters::{
    AdapterExecutionOutcome, AdapterStatus, BidmcParquetAdapter, DlrHdbAdapter,
    NasaOsdrOmicsAdapter, PhysioNetWaveformAdapter, verify_file_sha256,
};
use ares_core_types::telemetry::{ModelValidationStatus, ValidationManifest};
use ares_core_types::{DHF_HORIZONS_SECONDS, MonotoneQuantileTriplet};
use ares_nqs_stl::calibration_harness::{
    CalibrationAuditReport, CalibrationSamplePair, HorizonEvaluationStatus,
    assign_subject_split_role, evaluate_horizon_cells, resolve_validation_status_fail_closed,
    run_sost_rk4_sensitivity_audit, verify_anti_leakage_invariants,
};
use ares_nqs_stl::error::SplitRole;
use ares_nqs_stl::timestral_backbone::{ARES_TIMESTRAL_CHANNELS, TimestralConfig};
use ares_nqs_stl::timestral_bridge::{AresTemporalForecasterEngine, DEFAULT_TIMESTRAL_MODEL_ID};
use ares_telemetry_ingest::bidmc_replayer::BidmcReplayer;
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const MIN_OBSERVED_CONTEXT_STEPS: usize = 60;
const SHORT_BIDMC_HORIZONS_S: [u32; 4] = [15, 30, 60, 120];

#[derive(Debug, Parser)]
#[command(
    name = "ares-calibrate",
    about = "Phase 33 (L5) ARES-MedOS offline calibration, anti-leakage audit, and fail-closed validation CLI"
)]
struct CliArgs {
    /// Directory containing bundled `bidmc_01..03_Numerics.csv` and `MANIFEST.json`.
    #[arg(long, default_value = "data/bidmc")]
    bidmc_dir: PathBuf,

    /// Optional external root containing `physionet/`, `nasa_osdr/`, `dlr_hdbr/` datasets.
    #[arg(long)]
    external_root: Option<PathBuf>,

    /// Optional external signed `ValidationManifest` JSON file.
    #[arg(long)]
    validation_manifest: Option<PathBuf>,

    /// Optional directory containing SafeTensors checkpoints (`MANIFEST.json`).
    #[arg(long)]
    models_dir: Option<PathBuf>,

    /// Optional path to write full machine-readable calibration audit JSON.
    #[arg(long)]
    output_json: Option<PathBuf>,

    /// Optional path to write concise Markdown audit summary.
    #[arg(long)]
    output_md: Option<PathBuf>,

    /// Run deterministic offline verification without requiring external cohorts or writing defaults.
    #[arg(long, default_value_t = false)]
    verify_only: bool,
}

#[derive(Debug, Deserialize)]
struct BidmcManifestFile {
    records: Vec<BidmcManifestRecord>,
}

#[derive(Debug, Deserialize)]
struct BidmcManifestRecord {
    record_id: String,
    file: String,
    sha256: String,
}

#[derive(Debug, Serialize)]
struct CalibrateCliReport {
    schema_version: u32,
    verify_only: bool,
    bidmc_sha256_verified_files: usize,
    timestral_model_id: String,
    timestral_checkpoint_origin: String,
    adapters: Vec<AdapterExecutionOutcome>,
    bayesian_pocus_audit: BayesianPocusStructuralAudit,
    calibration_audit: CalibrationAuditReport,
    resolved_validation_status: ModelValidationStatus,
}

fn resolve_workspace_path(path: &Path) -> PathBuf {
    if path.exists() || path.is_absolute() {
        return path.to_path_buf();
    }
    let manifest_fallback = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join(path);
    if manifest_fallback.exists() {
        manifest_fallback
    } else {
        path.to_path_buf()
    }
}

fn verify_bidmc_manifest_checksums(bidmc_dir: &Path) -> Result<usize> {
    let manifest_path = bidmc_dir.join("MANIFEST.json");
    let raw = fs::read_to_string(&manifest_path)
        .with_context(|| format!("failed reading BIDMC manifest at {}", manifest_path.display()))?;
    let manifest: BidmcManifestFile = serde_json::from_str(&raw)
        .with_context(|| format!("invalid BIDMC MANIFEST.json at {}", manifest_path.display()))?;

    let mut verified = 0usize;
    for rec in &manifest.records {
        let csv_path = bidmc_dir.join(&rec.file);
        verify_file_sha256(&csv_path, &rec.sha256).with_context(|| {
            format!(
                "SHA-256 verification failed for record {} at {}",
                rec.record_id,
                csv_path.display()
            )
        })?;
        verified += 1;
    }
    if verified < 3 {
        bail!(
            "expected at least 3 verified BIDMC records in {}, found {}",
            manifest_path.display(),
            verified
        );
    }
    Ok(verified)
}

type DisjointBidmcDataset = (Vec<CalibrationSamplePair>, BTreeMap<SplitRole, Vec<String>>);

fn build_subject_disjoint_bidmc_samples(
    bidmc_dir: &Path,
    horizons_s: &[u32],
) -> Result<DisjointBidmcDataset> {
    let records = ["bidmc_02", "bidmc_01", "bidmc_03"];
    let mut samples = Vec::new();
    let mut split_subjects: BTreeMap<SplitRole, Vec<String>> = BTreeMap::new();

    for record_id in records {
        let role = assign_subject_split_role(record_id);
        split_subjects
            .entry(role)
            .or_default()
            .push(record_id.to_string());

        let csv_path = bidmc_dir.join(format!("{record_id}_Numerics.csv"));
        let replayer = BidmcReplayer::from_csv_path(record_id, &csv_path)
            .with_context(|| format!("failed loading BIDMC CSV {}", csv_path.display()))?;
        let rows = replayer.rows();

        for &horizon_s in horizons_s {
            let h_usize = usize::try_from(horizon_s)
                .with_context(|| format!("horizon {horizon_s} exceeds usize"))?;
            if rows.len() <= MIN_OBSERVED_CONTEXT_STEPS + h_usize {
                continue;
            }
            for origin_idx in (MIN_OBSERVED_CONTEXT_STEPS..rows.len() - h_usize).step_by(h_usize) {
                let target_idx = origin_idx + h_usize;
                let origin_row = &rows[origin_idx];
                let target_row = &rows[target_idx];
                let (Some(y_origin), Some(y_target)) = (origin_row.hr_bpm, target_row.hr_bpm) else {
                    continue;
                };
                if !y_origin.is_finite() || !y_target.is_finite() {
                    continue;
                }

                // Causal trailing context summary over [origin - 60 .. origin] strictly backward in time.
                let ctx_start = origin_idx - MIN_OBSERVED_CONTEXT_STEPS;
                let mut sum = 0.0_f64;
                let mut count = 0usize;
                let mut missing = 0usize;
                for r in &rows[ctx_start..=origin_idx] {
                    if let Some(hr) = r.hr_bpm
                        && hr.is_finite()
                    {
                        sum += hr;
                        count += 1;
                    } else {
                        missing += 1;
                    }
                    if r.pulse_bpm.is_none() {
                        missing += 1;
                    }
                    if r.spo2_pct.is_none() {
                        missing += 1;
                    }
                }
                if count < MIN_OBSERVED_CONTEXT_STEPS / 2 {
                    continue;
                }
                let mean_hr = sum / (count as f64);
                let spread = 6.0_f64 + 0.08_f64 * f64::from(horizon_s);
                let raw_cone = MonotoneQuantileTriplet::from_median_and_spreads(
                    mean_hr, spread, spread,
                );
                let total_slots = (MIN_OBSERVED_CONTEXT_STEPS + 1) * 3;
                let missing_ratio = (missing as f64 / total_slots as f64).clamp(0.0, 1.0);

                let pair = CalibrationSamplePair::real_recorded(
                    record_id,
                    role,
                    origin_row.relative_time_s,
                    target_row.relative_time_s,
                    horizon_s,
                )
                .with_observation("hr_bpm", y_origin, y_target, raw_cone, missing_ratio)
                .with_warmup_state(MIN_OBSERVED_CONTEXT_STEPS, false);
                samples.push(pair);
            }
        }
    }

    Ok((samples, split_subjects))
}

fn render_markdown_summary(report: &CalibrateCliReport) -> String {
    let mut md = String::new();
    md.push_str("# ARES-MedOS Phase 33 (L5) Calibration & Anti-Leakage Audit\n\n");
    md.push_str(&format!(
        "- **Verify Only Mode**: `{}`\n",
        report.verify_only
    ));
    md.push_str(&format!(
        "- **BIDMC SHA-256 Verified Files**: `{}`\n",
        report.bidmc_sha256_verified_files
    ));
    md.push_str(&format!(
        "- **Timestral Model ID**: `{}` (`{}`)\n",
        report.timestral_model_id, report.timestral_checkpoint_origin
    ));
    md.push_str(&format!(
        "- **Anti-Leakage L1-L4 Verified**: `{}`\n",
        report.calibration_audit.anti_leakage_verified
    ));
    md.push_str(&format!(
        "- **SOST RK4 Sensitivity Invariant**: `const_load_diff={:.6} pmol/L step_change_diff={:.6} pmol/L dt={:.4} d`\n",
        report
            .calibration_audit
            .sost_rk4_sensitivity
            .max_constant_load_diff_pmol_l_up_to_1000d,
        report
            .calibration_audit
            .sost_rk4_sensitivity
            .max_step_change_load_diff_pmol_l_at_sol_180,
        report
            .calibration_audit
            .sost_rk4_sensitivity
            .adaptive_substep_dt_days
    ));
    md.push_str(&format!(
        "- **Bayesian POCUS Empty Gap `(0.45, 0.92)` Holds**: `{}` (`grid_samples={}`)\n",
        report.bayesian_pocus_audit.empty_gap_invariants_hold,
        report.bayesian_pocus_audit.grid_samples_evaluated
    ));
    md.push_str(&format!(
        "- **Resolved Model Validation Status**: `{:?}`\n\n",
        report.resolved_validation_status
    ));

    md.push_str("## Parquet / Cohort Adapters\n\n");
    for adapter in &report.adapters {
        md.push_str(&format!(
            "- `{}`: `{:?}`\n",
            adapter.adapter_name, adapter.status
        ));
    }

    md.push_str("\n## Horizon Evaluation Cells\n\n");
    for cell in &report.calibration_audit.horizon_cells {
        md.push_str(&format!(
            "- `{} s` ({} / {:?}): `{:?}` (winkler_a10={:?})\n",
            cell.horizon_s,
            cell.channel_name,
            cell.missingness_bin,
            cell.status,
            cell.winkler_score_alpha_10
        ));
    }
    md
}

fn run() -> Result<()> {
    let cli = CliArgs::parse();
    let bidmc_dir = resolve_workspace_path(&cli.bidmc_dir);
    let verified_files = verify_bidmc_manifest_checksums(&bidmc_dir)?;

    let mut graph = AresUnifiedDatasetGraph::build_with_bidmc_dir(Some(&bidmc_dir))
        .context("failed building baseline AresUnifiedDatasetGraph")?;

    let ext_root = cli
        .external_root
        .as_deref()
        .map(resolve_workspace_path)
        .unwrap_or_else(|| resolve_workspace_path(Path::new("data/external_cohorts_absent")));

    let adapters = vec![
        BidmcParquetAdapter {
            bundled_bidmc_dir: &bidmc_dir,
            external_bidmc_dir: cli.external_root.as_deref(),
            window_seconds: 60,
        }
        .ingest_with_status(&mut graph)
        .context("BIDMC parquet adapter failed")?,
        PhysioNetWaveformAdapter {
            physionet_root: &ext_root.join("physionet"),
            window_seconds: 60,
        }
        .ingest_with_status(&mut graph)
        .context("PhysioNet waveform adapter failed")?,
        NasaOsdrOmicsAdapter {
            osdr_root: &ext_root.join("nasa_osdr"),
        }
        .ingest_with_status(&mut graph)
        .context("NASA OSDR adapter failed")?,
        DlrHdbAdapter {
            dlr_hdbr_root: &ext_root.join("dlr_hdbr"),
        }
        .ingest_with_status(&mut graph)
        .context("DLR HDBR adapter failed")?,
    ];

    let timestral_cfg = TimestralConfig {
        num_channels: ARES_TIMESTRAL_CHANNELS,
        patch_len: 4,
        d_model: 16,
        n_heads: 4,
        d_ff: 32,
        num_layers: 2,
        ..TimestralConfig::default()
    };
    let models_dir_resolved = cli.models_dir.as_deref().map(resolve_workspace_path);
    let forecaster = AresTemporalForecasterEngine::new_with_optional_checkpoint(
        timestral_cfg,
        models_dir_resolved.as_deref(),
    )
    .context("failed initializing AresTemporalForecasterEngine")?;
    let checkpoint_origin = format!("{:?}", forecaster.checkpoint_origin());

    let mut all_horizons = Vec::with_capacity(SHORT_BIDMC_HORIZONS_S.len() + DHF_HORIZONS_SECONDS.len());
    all_horizons.extend_from_slice(&SHORT_BIDMC_HORIZONS_S);
    all_horizons.extend_from_slice(&DHF_HORIZONS_SECONDS);

    let (samples, split_subjects) =
        build_subject_disjoint_bidmc_samples(&bidmc_dir, &SHORT_BIDMC_HORIZONS_S)?;
    verify_anti_leakage_invariants(&samples, MIN_OBSERVED_CONTEXT_STEPS)
        .context("anti-leakage invariant verification L1-L4 failed")?;

    let horizon_cells =
        evaluate_horizon_cells(&samples, &all_horizons, 480.0, MIN_OBSERVED_CONTEXT_STEPS)
            .context("horizon cell evaluation failed")?;

    let sost_rk4_sensitivity = run_sost_rk4_sensitivity_audit();
    if !sost_rk4_sensitivity
        .max_constant_load_diff_pmol_l_up_to_1000d
        .is_finite()
        || !sost_rk4_sensitivity
            .max_step_change_load_diff_pmol_l_at_sol_180
            .is_finite()
    {
        bail!("SOST RK4 sensitivity audit returned non-finite numerical drift");
    }

    let bayesian_pocus_audit = audit_bayesian_pocus_structural_bounds();
    if !bayesian_pocus_audit.empty_gap_invariants_hold {
        bail!("Bayesian POCUS structural bounds empty gap (0.45, 0.92) violated");
    }

    let external_manifest: Option<ValidationManifest> = match cli.validation_manifest.as_ref() {
        Some(path) => {
            let resolved = resolve_workspace_path(path);
            let raw = fs::read_to_string(&resolved).with_context(|| {
                format!("failed reading validation manifest at {}", resolved.display())
            })?;
            Some(serde_json::from_str(&raw).with_context(|| {
                format!("invalid validation manifest JSON at {}", resolved.display())
            })?)
        }
        None => None,
    };

    let mut calibration_audit = CalibrationAuditReport {
        schema_version: 1,
        contains_synthetic_data: false,
        anti_leakage_verified: true,
        split_subjects,
        horizon_cells,
        pocus_calibration_audit: None,
        sost_rk4_sensitivity,
        resolved_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    };
    let resolved_status = resolve_validation_status_fail_closed(
        false,
        Some(&calibration_audit),
        external_manifest.as_ref(),
    );
    calibration_audit.resolved_validation_status = resolved_status;

    if cli.external_root.is_none()
        && matches!(
            resolved_status,
            ModelValidationStatus::ClinicallyCalibratedSubjectToReview
        )
    {
        bail!("fail-closed invariant violated: clinically calibrated status without external cohorts");
    }

    let evaluated_short_cells = calibration_audit
        .horizon_cells
        .iter()
        .filter(|c| matches!(c.status, HorizonEvaluationStatus::Evaluated))
        .count();
    let unbundled_external = adapters
        .iter()
        .filter(|a| matches!(a.status, AdapterStatus::ExternalDatasetNotBundled { .. }))
        .count();

    let full_report = CalibrateCliReport {
        schema_version: 1,
        verify_only: cli.verify_only,
        bidmc_sha256_verified_files: verified_files,
        timestral_model_id: DEFAULT_TIMESTRAL_MODEL_ID.to_string(),
        timestral_checkpoint_origin: checkpoint_origin,
        adapters,
        bayesian_pocus_audit,
        calibration_audit,
        resolved_validation_status: resolved_status,
    };

    if let Some(json_out) = &cli.output_json {
        if let Some(parent) = json_out.parent()
            && !parent.as_os_str().is_empty()
        {
            fs::create_dir_all(parent)?;
        }
        let body = serde_json::to_string_pretty(&full_report)?;
        fs::write(json_out, body)
            .with_context(|| format!("failed writing JSON audit to {}", json_out.display()))?;
    }

    if let Some(md_out) = &cli.output_md {
        if let Some(parent) = md_out.parent()
            && !parent.as_os_str().is_empty()
        {
            fs::create_dir_all(parent)?;
        }
        fs::write(md_out, render_markdown_summary(&full_report))
            .with_context(|| format!("failed writing Markdown audit to {}", md_out.display()))?;
    }

    let summary_json = serde_json::to_string_pretty(&full_report)?;
    println!(
        "[ARES-CALIBRATE] verify_only={} bidmc_sha256_ok={} evaluated_short_cells={} unbundled_external={} validation_status={:?}",
        full_report.verify_only,
        full_report.bidmc_sha256_verified_files,
        evaluated_short_cells,
        unbundled_external,
        full_report.resolved_validation_status
    );
    if !cli.verify_only {
        println!("{summary_json}");
    }

    Ok(())
}

fn main() -> Result<()> {
    run()
}
