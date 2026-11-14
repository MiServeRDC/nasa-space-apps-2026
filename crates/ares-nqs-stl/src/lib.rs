//! `ares-nqs-stl` -- Normalized Quantitative Semantics STL (`NQS-STL`),
//! O(1) Lemire-Donze monotonic wedge, EWMA-OLS & Grey-Box Timestral TTV predictor,
//! Mission Readiness Index (`MRI %`), and Pure-Rust Timestral Probabilistic Forecaster.

pub mod calibration_harness;
pub mod error;
pub mod mri_index;
pub mod normalizer;
pub mod sliding_window;
pub mod timestral_backbone;
pub mod timestral_bridge;
pub mod timestral_quantiles;
pub mod timestral_safetensors;
pub mod ttv_predictor;

// Module aliases preserving exact naming from phase_16_H2 and phase_17_H3 plans.
pub use timestral_bridge as async_forecaster_bridge;
pub use timestral_quantiles as quantile_cone;

pub use ares_core_types::{
    AbstentionCertificate, ChannelQuantileCone, ConformalGateStatus, MonotoneQuantileTriplet,
    NqsQuantileForecastSnapshot,
};
pub use calibration_harness::{
    CalibrationAuditReport, CalibrationSamplePair, ClopperPearsonBounds,
    ConformalizedQuantileCalibrator, HorizonCellMetrics, HorizonEvaluationStatus, MissingnessBin,
    PersistenceCqrBaseline, ProbabilisticCalibrationAudit, ReliabilityBinSummary,
    RollingMedianIqrBaseline, SostRk4SensitivityAudit, assign_subject_split_role,
    canonical_subject_id, clopper_pearson_exact_95, compute_brier_and_ece_10_bins,
    evaluate_horizon_cells, pinball_loss, regularized_incomplete_beta,
    resolve_validation_status_fail_closed, resolve_validation_status_with_report_hash,
    run_sost_rk4_sensitivity_audit, verify_anti_leakage_invariants, winkler_score,
};
pub use error::{LeakageViolationError, NqsStlError, SplitRole};
pub use mri_index::evaluate_nqs_stl_and_mri;
pub use sliding_window::LemireMinWedge;
pub use timestral_backbone::{
    ARES_TIMESTRAL_CHANNELS, CausalScaler, ChannelCausalStats, CircularTelemetryBuffer,
    DualAxisAttention, FusedSwiGlu, LayerKind, LinearLayer, PHYSIOLOGICAL_CHANNELS,
    PatchRepresentation, RmsNorm, SinCosRoPe, TimestralBackbone, TimestralBlockWeights,
    TimestralConfig,
};
pub use timestral_bridge::{
    AresMultivariateSample, AresTemporalForecasterEngine, AresTemporalForecasterHandle,
    DEFAULT_TIMESTRAL_MODEL_ID, KnownFutureCovariates, compute_greybox_forecast_snapshot,
};
pub use timestral_quantiles::{ConformalAbstentionGate, MonotoneQuantileHead, QuantileHead};
pub use timestral_safetensors::{
    CheckpointLoaderBackend, CheckpointOrigin, DETERMINISTIC_STUB_SEED_HEX,
    LoadedTimestralBundle, ModelArtifactEntry, ModelsManifest, SafeTensorDtype, SafeTensorView,
    SafeTensorsArchive, active_loader_backend, compute_sha256_hex, decode_tensor_view_to_f64,
    encode_f64_slice_as_dtype, load_timestral_or_deterministic_fallback,
    load_verified_timestral_checkpoint, serialize_deterministic_timestral_checkpoint,
    serialize_f64_map_to_safetensors, serialize_safetensors_v1,
};

use ares_core_types::telemetry::{
    AlertSeverity, Biometrics, JugularHemodynamics, Musculoskeletal, NqsStlMargins, SansOcular,
};
use std::sync::Arc;

/// Output of a single synchronous 20 Hz `NqsEngine::evaluate_tick` pass.
#[derive(Debug, Clone, PartialEq)]
pub struct NqsEngineEvaluation {
    pub margins: NqsStlMargins,
    pub severity: AlertSeverity,
    pub sliding_min_rho_global: Option<f64>,
    pub quantile_snapshot: Arc<NqsQuantileForecastSnapshot>,
    pub pessimistic_ttv_q05_hours: Option<f64>,
}

/// Unified NQS-STL + Timestral Grey-Box Engine combining:
/// - Instantaneous dimensionless NQS-STL margins & MRI %
/// - O(1) Lemire monotonic wedge sliding robustness over window `W`
/// - Non-blocking 20 Hz read of 1 Hz Timestral quantile cones & pessimistic TTV_q05
#[derive(Debug, Clone)]
pub struct NqsEngine {
    lemire_wedge: LemireMinWedge,
    forecaster_handle: AresTemporalForecasterHandle,
}

impl Default for NqsEngine {
    fn default() -> Self {
        Self::new(60.0)
    }
}

impl NqsEngine {
    /// Creates an `NqsEngine` with a standalone deterministic initial forecaster handle.
    pub fn new(sliding_window_s: f64) -> Self {
        let initial =
            NqsQuantileForecastSnapshot::initial_deterministic(0.0, None, None, None, None);
        Self {
            lemire_wedge: LemireMinWedge::new(sliding_window_s),
            forecaster_handle: AresTemporalForecasterHandle::new(initial),
        }
    }

    /// Creates an `NqsEngine` attached to an active 1 Hz `AresTemporalForecasterHandle`.
    pub fn with_forecaster_handle(
        sliding_window_s: f64,
        forecaster_handle: AresTemporalForecasterHandle,
    ) -> Self {
        Self {
            lemire_wedge: LemireMinWedge::new(sliding_window_s),
            forecaster_handle,
        }
    }

    /// Returns a clone of the non-blocking forecaster handle.
    #[inline]
    pub fn forecaster_handle(&self) -> AresTemporalForecasterHandle {
        self.forecaster_handle.clone()
    }

    /// Synchronous 20 Hz hot-path evaluation: never blocks on neural inference.
    /// Reads the latest 1 Hz Timestral snapshot via `try_read` and merges `TTV_q05`
    /// when the conformal abstention gate is calibrated.
    pub fn evaluate_tick(
        &mut self,
        recording_time_s: f64,
        biometrics: &Biometrics,
        musculo: &Musculoskeletal,
        jugular: &JugularHemodynamics,
        sans: &SansOcular,
    ) -> NqsEngineEvaluation {
        let (mut margins, severity) = evaluate_nqs_stl_and_mri(biometrics, musculo, jugular, sans);
        let sliding_min_rho_global = if let Some(rho) = margins.rho_global {
            Some(self.lemire_wedge.push_and_evaluate(recording_time_s, rho))
        } else {
            self.lemire_wedge.clear();
            None
        };
        let quantile_snapshot = self.forecaster_handle.read_latest_snapshot();
        let pessimistic_ttv_q05_hours = margins.ttv_ci95_low_hours.map(|low| {
            if quantile_snapshot.confidence_state == ConformalGateStatus::HeuristicGateAccepted {
                quantile_snapshot
                    .ttv_hours_cone
                    .map_or(low, |cone| low.min(cone.q05))
            } else {
                low
            }
        });
        margins.ttv_ci95_low_hours = pessimistic_ttv_q05_hours;

        NqsEngineEvaluation {
            margins,
            severity,
            sliding_min_rho_global,
            quantile_snapshot,
            pessimistic_ttv_q05_hours,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::telemetry::JugularFlowGrade;

    #[test]
    fn test_nqs_engine_integrates_lemire_wedge_and_non_blocking_forecaster_handle() {
        let cfg = TimestralConfig {
            num_channels: ARES_TIMESTRAL_CHANNELS,
            patch_len: 4,
            d_model: 16,
            n_heads: 4,
            d_ff: 32,
            num_layers: 2,
            ..TimestralConfig::default()
        };
        let mut forecaster = AresTemporalForecasterEngine::new(cfg).expect("forecaster init");
        let mut engine = NqsEngine::with_forecaster_handle(60.0, forecaster.handle());

        let bio = Biometrics {
            heart_rate_bpm: Some(74.0),
            pulse_rate_bpm: None,
            resp_rate_brpm: Some(15.0),
            spo2_pct: None,
            rmssd_ms: Some(44.0),
            hrv_unavailable_reason: None,
            sdnn_ms: Some(50.0),
            pnn50_pct: Some(20.0),
            lf_hf_ratio: Some(1.3),
            vocal_f0_hz: Some(120.0),
            vocal_jitter_pct: Some(0.4),
            radiation_dose_rate_msv_d: 0.4,
            sqi_score: 0.92,
            missing_channels: vec!["pulse_rate_bpm".to_string(), "spo2_pct".to_string()],
        };
        let musculo = Musculoskeletal {
            ared_daily_load_kgf: 128.0,
            soleus_csa_pct: 96.0,
            echo_intensity_au: 48.0,
            mqi_index: 0.88,
            sclerostin_pmol_l: 24.5,
            urinary_calcium_mg_d: 185.0,
            gai_pct: 5.5,
        };
        let jugular = JugularHemodynamics {
            ijv_csa_mm2: 66.0,
            ijv_vmax_cm_s: 12.0,
            tau_w_dyn_cm2: 1.9,
            flow_grade: JugularFlowGrade::NormalContinuous,
            pocus_thrombus_confirmed: false,
            lbnp_active: true,
            lbnp_pressure_mmhg: -30.0,
        };
        let sans = SansOcular {
            onsd_mm: 5.2,
            choroidal_delta_um: 22.0,
            sans_risk_index: 0.22,
        };

        let cov = KnownFutureCovariates::default();
        for t in 0..8 {
            let sample = AresMultivariateSample::from_telemetry_components(
                t as f64, &bio, &musculo, &jugular, &sans, 0.45,
            );
            forecaster
                .ingest_sample_1hz(&sample, &cov, -0.005)
                .expect("ingest 1hz");
        }

        let eval = engine.evaluate_tick(8.0, &bio, &musculo, &jugular, &sans);
        eval.quantile_snapshot
            .assert_monotone()
            .expect("snapshot monotone");
        assert!(eval.pessimistic_ttv_q05_hours.is_some_and(|v| v >= 0.0));
        assert!(eval.sliding_min_rho_global.unwrap() <= eval.margins.rho_global.unwrap() + 1e-12);
    }
}
