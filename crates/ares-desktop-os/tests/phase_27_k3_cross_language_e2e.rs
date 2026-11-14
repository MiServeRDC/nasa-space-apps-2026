use ares_causal_graph::hypergraph_spatial::HabitatZoneId;
use ares_core_types::NqsQuantileForecastSnapshot;
use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, ARES_BINARY_MAGIC, ARES_BINARY_VERSION, BinaryFrameMeta,
    BinaryTelemetryFrame, DEONTIC_EIMO_AUTONOMOUS, DEONTIC_EVA_FORBIDDEN,
    DEONTIC_SHELTER_MANDATORY, DEONTIC_VIOLATES_POLICY, FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
    FLAG_CHANNEL_NAN_DROPOUT, FLAG_GATE1_ANTICOAG_LOCK, FLAG_GATE2_LBNP_VENT,
    FLAG_GATE3_EVA_DAMPING, FLAG_ILLUSTRATIVE_UNVALIDATED, FLAG_LBNP_ACTIVE,
    FLAG_SEU_RECOVERY_ACTIVE, FLAG_WHAT_IF_ACTIVE, MASK_HR_BPM, MASK_IJV_SHEAR_PA, MASK_MRI_SCORE,
    MASK_OWLT_DELAY_SEC, MASK_PULSE_BPM, MASK_RADIATION_MSV_D, MASK_RESP_BRPM, MASK_RMSSD_MS,
    MASK_SANS_RISK, MASK_SOST_PG_ML, MASK_SPO2_PCT, PARTITION_ALL_NOMINAL, compute_crc32c,
};
use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_core_types::telemetry::{
    ActivePlaybook, AlertSeverity, Biometrics, BiometricsSource, CountermeasureAction,
    HrvUnavailableReason, JugularFlowGrade, JugularHemodynamics, ModelValidationStatus,
    Musculoskeletal, NqsStlMargins, ProvenanceManifest, SafetyGates, SansOcular,
    ScenarioOverlayMode, StressTestScenarioInput, SystemPhase, TelemetryPacket, TtvIntervalKind,
};
use ares_desktop_os::{AresMedOsWorkstationShell, DesktopShellConfig};
use ares_server_cli::wire_contract::{StressTestPatchRequest, WireTelemetryPacket};
use ares_telemetry_ingest::bidmc_replayer::BidmcReplayer;
use ares_telemetry_ingest::wearable_packet::{
    WEARABLE_SYNC_WORD, WFLAG_EVA_SUIT_NODE, WFLAG_SEU_RECOVERY_EVENT, WMASK_HR_BPM,
    WMASK_IMU_RMS, WMASK_RESP_BRPM, WMASK_SPO2_PCT, WearableSensorPacket,
};
use serde_json::{Value, json};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

fn bidmc_dir() -> PathBuf {
    repo_root().join("data").join("bidmc")
}

fn build_telemetry_packet(
    with_hrv: bool,
    spo2_pct: Option<f64>,
    radiation_msv_d: f64,
    what_if: bool,
    alert_severity: AlertSeverity,
    playbook_id: &str,
) -> TelemetryPacket {
    let mut missing = Vec::new();
    if spo2_pct.is_none() {
        missing.push("spo2_pct".to_string());
    }
    if !with_hrv {
        missing.push("rmssd_ms".to_string());
    }

    let gates = SafetyGates {
        anticoagulant_lock_active: true,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active: what_if,
    };

    TelemetryPacket {
        timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
        mission_Elapsed_seconds: 120.0,
        relative_recording_time_s: 42.0,
        source_record_id: "bidmc_01".to_string(),
        flight_day: if what_if { 180 } else { 45 },
        astronaut_id: "ARES-CDR-01".to_string(),
        system_phase: if what_if {
            SystemPhase::Act
        } else {
            SystemPhase::Evaluate
        },
        alert_severity,
        model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        provenance_manifest: ProvenanceManifest {
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
            biometrics_native_rate_hz: 1.0,
            ui_refresh_rate_hz: 20.0,
            scenario_overlay_mode: if what_if {
                ScenarioOverlayMode::SimulatedWhatifScenario
            } else {
                ScenarioOverlayMode::DerivedAndSimulated
            },
            biological_context_refs: vec!["PhysioNet-BIDMC-v1.0.0".to_string()],
        },
        biometrics: Biometrics {
            heart_rate_bpm: Some(82.5),
            pulse_rate_bpm: Some(82.0),
            resp_rate_brpm: Some(16.0),
            spo2_pct,
            rmssd_ms: if with_hrv { Some(38.5) } else { None },
            hrv_unavailable_reason: if with_hrv {
                None
            } else {
                Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
            },
            sdnn_ms: if with_hrv { Some(52.0) } else { None },
            pnn50_pct: if with_hrv { Some(21.0) } else { None },
            lf_hf_ratio: if with_hrv { Some(1.8) } else { None },
            vocal_f0_hz: Some(118.0),
            vocal_jitter_pct: Some(0.45),
            radiation_dose_rate_msv_d: radiation_msv_d,
            sqi_score: 0.94,
            missing_channels: missing,
        },
        musculoskeletal: Musculoskeletal {
            ared_daily_load_kgf: if what_if { 15.0 } else { 128.0 },
            soleus_csa_pct: if what_if { 74.0 } else { 96.0 },
            echo_intensity_au: if what_if { 91.0 } else { 52.0 },
            mqi_index: if what_if { 0.38 } else { 0.90 },
            sclerostin_pmol_l: if what_if { 61.5 } else { 24.0 },
            urinary_calcium_mg_d: if what_if { 310.0 } else { 182.0 },
            gai_pct: if what_if { 14.5 } else { 4.8 },
        },
        jugular_hemodynamics: JugularHemodynamics {
            ijv_csa_mm2: 76.0,
            ijv_vmax_cm_s: 6.2,
            tau_w_dyn_cm2: 1.55,
            flow_grade: JugularFlowGrade::PulsatileReduced,
            pocus_thrombus_confirmed: false,
            lbnp_active: !what_if,
            lbnp_pressure_mmhg: if what_if { 0.0 } else { -30.0 },
        },
        sans_ocular: SansOcular {
            onsd_mm: 5.35,
            choroidal_delta_um: 28.0,
            sans_risk_index: 0.27,
        },
        nqs_stl: NqsStlMargins {
            rho_tau_w: 0.42,
            rho_ared: if what_if { -0.65 } else { 0.88 },
            rho_sost: if what_if { -0.45 } else { 0.82 },
            rho_rmssd: if with_hrv { Some(0.74) } else { None },
            rho_sans: 0.61,
            rho_global: if with_hrv {
                Some(if what_if { -0.65 } else { 0.42 })
            } else {
                None
            },
            ttv_hours: if with_hrv { Some(144.0) } else { None },
            ttv_ci95_low_hours: if with_hrv { Some(108.0) } else { None },
            ttv_ci95_high_hours: if with_hrv { Some(192.0) } else { None },
            mri_pct: if with_hrv { Some(81.0) } else { None },
            ttv_interval_kind: Some(TtvIntervalKind::IllustrativeScenarioRange),
        },
        active_playbook: ActivePlaybook {
            playbook_id: playbook_id.to_string(),
            title: "Contract Test Playbook".to_string(),
            causal_chain_summary: vec!["ARED_LOAD->SOST->BMD".to_string()],
            safety_gates: gates,
            actions: vec![CountermeasureAction {
                action_id: "ACT_TEST".to_string(),
                label: "Contract test action".to_string(),
                category: "PHYSICAL_HEMODYNAMIC".to_string(),
                delta_rho_per_hour: 0.15,
            }],
        },
    }
}

fn assert_opt_f32_parity(label: &str, rust_val: Option<f32>, ts_val: &Value) {
    match rust_val {
        None => assert!(
            ts_val.is_null(),
            "{label}: expected strict null in TypeScript, got {ts_val}"
        ),
        Some(expected) => {
            let actual_f64 = ts_val
                .as_f64()
                .unwrap_or_else(|| panic!("{label}: expected number in TS, got {ts_val}"));
            let actual = actual_f64 as f32;
            assert_eq!(
                actual.to_bits(),
                expected.to_bits(),
                "{label}: f32 bit mismatch (rust={expected} [0x{:08x}], ts={actual} [0x{:08x}])",
                expected.to_bits(),
                actual.to_bits()
            );
        }
    }
}

fn assert_frame_parity(label: &str, rust_frame: &BinaryTelemetryFrame, ts_obj: &Value) {
    assert_eq!(ts_obj["magic"].as_u64(), Some(u64::from(rust_frame.magic)), "{label}.magic");
    assert_eq!(
        ts_obj["schema_version"].as_u64(),
        Some(u64::from(rust_frame.schema_version)),
        "{label}.schema_version"
    );
    assert_eq!(
        ts_obj["partition_status"].as_u64(),
        Some(u64::from(rust_frame.partition_status)),
        "{label}.partition_status"
    );
    assert_eq!(
        ts_obj["deontic_habitat_mask"].as_u64(),
        Some(u64::from(rust_frame.deontic_habitat_mask)),
        "{label}.deontic_habitat_mask"
    );
    assert_eq!(ts_obj["seq"].as_u64(), Some(rust_frame.seq), "{label}.seq");
    assert_eq!(
        ts_obj["timestamp_ms"].as_u64(),
        Some(rust_frame.timestamp_ms),
        "{label}.timestamp_ms"
    );
    assert_eq!(
        ts_obj["validity_mask"].as_u64(),
        Some(u64::from(rust_frame.validity_mask)),
        "{label}.validity_mask"
    );
    assert_eq!(
        ts_obj["quality_flags_mask"].as_u64(),
        Some(u64::from(rust_frame.quality_flags_mask)),
        "{label}.quality_flags_mask"
    );
    assert_eq!(
        ts_obj["active_playbook_id"].as_u64(),
        Some(u64::from(rust_frame.active_playbook_id)),
        "{label}.active_playbook_id"
    );
    assert_eq!(
        ts_obj["active_alert_code"].as_u64(),
        Some(u64::from(rust_frame.active_alert_code)),
        "{label}.active_alert_code"
    );
    assert_eq!(
        ts_obj["ipc_latency_ns"].as_u64(),
        Some(u64::from(rust_frame.ipc_latency_ns)),
        "{label}.ipc_latency_ns"
    );
    assert_eq!(
        ts_obj["crc32c"].as_u64(),
        Some(u64::from(rust_frame.crc32c)),
        "{label}.crc32c"
    );

    assert_opt_f32_parity(&format!("{label}.hr_bpm"), rust_frame.hr_opt(), &ts_obj["hr_bpm"]);
    assert_opt_f32_parity(
        &format!("{label}.pulse_bpm"),
        rust_frame.pulse_opt(),
        &ts_obj["pulse_bpm"],
    );
    assert_opt_f32_parity(
        &format!("{label}.resp_brpm"),
        rust_frame.resp_opt(),
        &ts_obj["resp_brpm"],
    );
    assert_opt_f32_parity(
        &format!("{label}.spo2_pct"),
        rust_frame.spo2_opt(),
        &ts_obj["spo2_pct"],
    );
    assert_opt_f32_parity(
        &format!("{label}.rmssd_ms"),
        rust_frame.rmssd_opt(),
        &ts_obj["rmssd_ms"],
    );
    assert_opt_f32_parity(
        &format!("{label}.mri_score"),
        rust_frame.mri_opt(),
        &ts_obj["mri_score"],
    );
    assert_opt_f32_parity(
        &format!("{label}.crs_score"),
        rust_frame.crs_opt(),
        &ts_obj["crs_score"],
    );
    assert_opt_f32_parity(
        &format!("{label}.sans_risk"),
        rust_frame.sans_risk_opt(),
        &ts_obj["sans_risk"],
    );
    assert_opt_f32_parity(
        &format!("{label}.ijv_shear_pa"),
        rust_frame.ijv_shear_pa_opt(),
        &ts_obj["ijv_shear_pa"],
    );
    assert_opt_f32_parity(
        &format!("{label}.sost_pg_ml"),
        rust_frame.sost_pg_ml_opt(),
        &ts_obj["sost_pg_ml"],
    );
    assert_opt_f32_parity(
        &format!("{label}.radiation_msv_d"),
        rust_frame.radiation_msv_d_opt(),
        &ts_obj["radiation_msv_d"],
    );
    assert_opt_f32_parity(
        &format!("{label}.nqs_min_rho"),
        rust_frame.nqs_min_rho_opt(),
        &ts_obj["nqs_min_rho"],
    );
    assert_opt_f32_parity(
        &format!("{label}.ttv_q05_days"),
        rust_frame.ttv_q05_days_opt(),
        &ts_obj["ttv_q05_days"],
    );
    assert_opt_f32_parity(
        &format!("{label}.ttv_q50_days"),
        rust_frame.ttv_q50_days_opt(),
        &ts_obj["ttv_q50_days"],
    );
    assert_opt_f32_parity(
        &format!("{label}.ttv_q95_days"),
        rust_frame.ttv_q95_days_opt(),
        &ts_obj["ttv_q95_days"],
    );
    assert_opt_f32_parity(
        &format!("{label}.owlt_delay_sec"),
        rust_frame.owlt_delay_sec_opt(),
        &ts_obj["owlt_delay_sec"],
    );
}

#[test]
fn test_phase_27_k3_rust_typescript_binary_frame_bit_exact_parity() {
    // Frame A: Nominal 1 Hz frame with all vitals finite (using real BIDMC row #0 HR/RESP/PULSE/SpO2 + full HRV)
    let replayer = BidmcReplayer::from_csv_path("bidmc_01", &bidmc_dir().join("bidmc_01_Numerics.csv"))
        .expect("load bidmc_01");
    let row0 = replayer.row_at_second(0);
    let mut pkt_nominal = build_telemetry_packet(
        true,
        row0.spo2_pct.or(Some(98.0)),
        0.45,
        false,
        AlertSeverity::Nominal,
        "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED",
    );
    pkt_nominal.biometrics.heart_rate_bpm = row0.hr_bpm.or(Some(72.0));
    pkt_nominal.biometrics.pulse_rate_bpm = row0.pulse_bpm.or(Some(71.0));
    pkt_nominal.biometrics.resp_rate_brpm = row0.resp_brpm.or(Some(15.0));

    let q_snap = NqsQuantileForecastSnapshot::initial_deterministic(
        42.0,
        Some(0.42),
        Some(108.0),
        Some(144.0),
        Some(192.0),
    );
    let frame_a = BinaryTelemetryFrame::from_telemetry_packet(
        &pkt_nominal,
        Some(&q_snap),
        BinaryFrameMeta {
            seq: 101,
            timestamp_ms: 1_794_657_600_000,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask: (HabitatZoneId::SleepQuarters as u8) | DEONTIC_EIMO_AUTONOMOUS,
            crs_score: Some(0.18),
            owlt_delay_sec: 852.0,
            ipc_latency_ns: 1_250,
            conformal_abstained: false,
            seu_recovery_active: false,
            include_derived_models: true,
        },
    );

    // Frame B: Degraded BIDMC frame with rmssd_ms: None + spo2_pct: None (BEAT_INTERVALS_NOT_AVAILABLE)
    let pkt_degraded = build_telemetry_packet(
        false,
        None,
        0.45,
        false,
        AlertSeverity::DataDegradedMissingChannels,
        "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED",
    );
    let frame_b = BinaryTelemetryFrame::from_telemetry_packet(
        &pkt_degraded,
        None,
        BinaryFrameMeta {
            seq: 102,
            timestamp_ms: 1_794_657_601_000,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask: (HabitatZoneId::MedOpsUltrasoundBay as u8)
                | DEONTIC_EIMO_AUTONOMOUS,
            crs_score: None,
            owlt_delay_sec: 852.0,
            ipc_latency_ns: 1_400,
            conformal_abstained: false,
            seu_recovery_active: false,
            include_derived_models: true,
        },
    );
    assert_eq!(frame_b.validity_mask & MASK_RMSSD_MS, 0);
    assert_eq!(frame_b.validity_mask & MASK_SPO2_PCT, 0);
    assert_ne!(frame_b.validity_mask & MASK_HR_BPM, 0);
    assert_ne!(frame_b.validity_mask & MASK_PULSE_BPM, 0);
    assert_ne!(frame_b.validity_mask & MASK_RESP_BRPM, 0);
    assert_ne!(
        frame_b.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
        0
    );
    assert_ne!(frame_b.quality_flags_mask & FLAG_CHANNEL_NAN_DROPOUT, 0);
    assert_ne!(frame_b.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED, 0);

    // Frame C: Critical SPE radiation frame (> 1.5 mSv/d + EVA Airlock Forbidden + Storm Shelter Mandatory + What-If)
    let pkt_spe = build_telemetry_packet(
        false,
        Some(97.0),
        2.85,
        true,
        AlertSeverity::CriticalEmergency,
        "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS",
    );
    let frame_c = BinaryTelemetryFrame::from_telemetry_packet(
        &pkt_spe,
        None,
        BinaryFrameMeta {
            seq: 103,
            timestamp_ms: 1_794_657_602_000,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask: (HabitatZoneId::SleepQuarters as u8)
                | DEONTIC_VIOLATES_POLICY
                | DEONTIC_EVA_FORBIDDEN
                | DEONTIC_SHELTER_MANDATORY
                | DEONTIC_EIMO_AUTONOMOUS,
            crs_score: Some(0.64),
            owlt_delay_sec: 1_140.0,
            ipc_latency_ns: 980,
            conformal_abstained: false,
            seu_recovery_active: true,
            include_derived_models: true,
        },
    );
    assert_ne!(frame_c.quality_flags_mask & FLAG_WHAT_IF_ACTIVE, 0);
    assert_ne!(frame_c.quality_flags_mask & FLAG_GATE1_ANTICOAG_LOCK, 0);
    assert_ne!(frame_c.quality_flags_mask & FLAG_GATE2_LBNP_VENT, 0);
    assert_ne!(frame_c.quality_flags_mask & FLAG_GATE3_EVA_DAMPING, 0);
    assert_ne!(frame_c.quality_flags_mask & FLAG_SEU_RECOVERY_ACTIVE, 0);

    let frames = [("nominal", frame_a), ("degraded", frame_b), ("critical_spe", frame_c)];
    let mut byte_arrays = Vec::with_capacity(frames.len());
    for (name, frame) in &frames {
        let bytes = frame.to_le_bytes();
        assert_eq!(bytes.len(), ARES_BINARY_FRAME_BYTES, "{name} len");
        let crc_stored = u32::from_le_bytes([bytes[104], bytes[105], bytes[106], bytes[107]]);
        assert_eq!(crc_stored, compute_crc32c(&bytes[0..104]), "{name} crc");
        let roundtrip = BinaryTelemetryFrame::from_le_bytes(&bytes).expect("rust roundtrip");
        assert_eq!(roundtrip.magic, ARES_BINARY_MAGIC);
        assert_eq!(roundtrip.schema_version, ARES_BINARY_VERSION);
        byte_arrays.push(bytes.iter().map(|b| usize::from(*b)).collect::<Vec<usize>>());
    }

    let node_ver_out = Command::new("node")
        .arg("-v")
        .output()
        .expect("node binary must be installed to run Rust<->TS binary parity test");
    assert!(node_ver_out.status.success(), "node -v failed");
    let node_ver_str = String::from_utf8_lossy(&node_ver_out.stdout).trim().to_string();
    let major: u32 = node_ver_str
        .trim_start_matches('v')
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    assert!(
        major >= 22,
        "Expected Node >= 22 for --experimental-strip-types, got {node_ver_str}"
    );

    let payload_json = serde_json::to_string(&byte_arrays).expect("serialize byte vectors");
    let ts_script = r#"
import { strict as assert } from 'node:assert';
import {
  ARES_BINARY_FRAME_BYTES,
  ARES_BINARY_MAGIC,
  computeCrc32c,
  decodeBinaryTelemetryFrame,
} from './ares-cockpit/src/lib/binaryTelemetryDecoder.ts';

const inputs = JSON.parse(process.argv[1]);
assert.equal(inputs.length, 3);

const decodedFrames = [];
for (let idx = 0; idx < inputs.length; idx += 1) {
  const bytes = Uint8Array.from(inputs[idx]);
  assert.equal(bytes.byteLength, ARES_BINARY_FRAME_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const expectedCrc = computeCrc32c(bytes, 104);
  assert.equal(view.getUint32(104, true), expectedCrc);

  const decoded = decodeBinaryTelemetryFrame(bytes);
  assert.ok(decoded !== null, `frame ${idx} failed to decode`);
  assert.equal(decoded.magic, ARES_BINARY_MAGIC);
  assert.equal(decoded.crc32c, expectedCrc);

  // Flip 1 bit in header, 1 bit in float payload, and 1 bit in CRC -> must return null
  for (const offset of [0, 32, 104]) {
    const mutated = new Uint8Array(bytes);
    mutated[offset] ^= 0x01;
    assert.equal(
      decodeBinaryTelemetryFrame(mutated),
      null,
      `frame ${idx} offset ${offset} 1-bit flip must return null`
    );
  }
  decodedFrames.push(decoded);
}

// Specific checks on frame[1] (degraded) and frame[2] (critical SPE)
assert.equal(decodedFrames[1].rmssd_ms, null);
assert.equal(decodedFrames[1].spo2_pct, null);
assert.equal(decodedFrames[1].hrv_unavailable_reason, 'BEAT_INTERVALS_NOT_AVAILABLE');

assert.equal(decodedFrames[2].eva_airlock_forbidden, true);
assert.equal(decodedFrames[2].storm_shelter_mandatory, true);
assert.equal(decodedFrames[2].violates_policy, true);
assert.equal(decodedFrames[2].eimo_autonomous_active, true);
assert.equal(decodedFrames[2].illustrative_unvalidated, true);

process.stdout.write(JSON.stringify(decodedFrames));
"#;

    let out = Command::new("node")
        .current_dir(repo_root())
        .arg("--experimental-strip-types")
        .arg("--input-type=module")
        .arg("-e")
        .arg(ts_script)
        .arg(&payload_json)
        .output()
        .expect("execute node --experimental-strip-types parity check");

    assert!(
        out.status.success(),
        "Node TS parity script failed (status={}):\nstdout={}\nstderr={}",
        out.status,
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );

    let ts_decoded: Vec<Value> = serde_json::from_slice(&out.stdout)
        .expect("parse decoded frames JSON from TypeScript decoder");
    assert_eq!(ts_decoded.len(), 3);

    for (idx, (label, rust_frame)) in frames.iter().enumerate() {
        assert_frame_parity(label, rust_frame, &ts_decoded[idx]);
    }

    // Also assert derived flags on Frame A/B/C in Rust from TypeScript JSON
    assert_eq!(
        ts_decoded[0]["rmssd_ms"].as_f64().map(|v| v as f32),
        Some(38.5_f32)
    );
    assert_eq!(ts_decoded[0]["hrv_unavailable_reason"], Value::Null);
    assert_ne!(frame_a.validity_mask & MASK_MRI_SCORE, 0);
    assert_ne!(frame_a.validity_mask & MASK_IJV_SHEAR_PA, 0);
    assert_ne!(frame_a.validity_mask & MASK_SOST_PG_ML, 0);
    assert_ne!(frame_a.validity_mask & MASK_SANS_RISK, 0);
    assert_ne!(frame_a.validity_mask & MASK_RADIATION_MSV_D, 0);
    assert_ne!(frame_a.validity_mask & MASK_OWLT_DELAY_SEC, 0);
    assert_ne!(
        frame_a.quality_flags_mask & FLAG_LBNP_ACTIVE,
        0,
        "nominal frame preserves LBNP active flag"
    );
}

#[test]
fn test_phase_27_k3_workstation_shell_full_stack_seqlock_stress_test_fastmcp_and_24_datasets() {
    let shell = AresMedOsWorkstationShell::initialize(DesktopShellConfig {
        data_dir: bidmc_dir(),
        ..DesktopShellConfig::default()
    })
    .expect("initialize AresMedOsWorkstationShell");

    // 1. Replay 40 ticks at 20 Hz (2.0 s -> 2 real BIDMC 1 Hz ticks)
    let mut last_frame = None;
    for _ in 0..40 {
        last_frame = Some(
            shell
                .advance_tick(Duration::from_millis(50))
                .expect("advance_tick"),
        );
    }
    let frame_after_replay = last_frame.expect("frame produced");
    assert_eq!(frame_after_replay.magic, ARES_BINARY_MAGIC);

    // Verify 1 Hz BIDMC cursor advanced to 2.0 s
    let snap_before_stress: WireTelemetryPacket =
        serde_json::from_str(&shell.ipc_get_snapshot_json().expect("snapshot json"))
            .expect("parse WireTelemetryPacket");
    assert!(
        (snap_before_stress.relative_recording_time_s - 2.0).abs() < 1e-6,
        "expected relative_recording_time_s=2.0 after 40x50ms ticks, got {}",
        snap_before_stress.relative_recording_time_s
    );

    // 2. Ingest a Tier C WearableSensorPacket with SEU recovery event
    let wearable = WearableSensorPacket {
        sync_word: WEARABLE_SYNC_WORD,
        node_id: 2,
        channel_mask: WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM | WMASK_IMU_RMS,
        sequence_num: 4096,
        uptime_ms: 120_000,
        supervisor_restart_count: 2,
        hr_bpm_x100: 7850,
        spo2_pct_x100: 9780,
        resp_brpm_x100: 1550,
        rr_interval_ms_x10: 0,
        sqi_score_x10000: 9400,
        imu_rms_g: 0.14,
        flags: WFLAG_SEU_RECOVERY_EVENT | WFLAG_EVA_SUIT_NODE,
        crc16_ccitt: 0,
    };
    let raw_wearable = wearable.to_le_bytes_with_crc();
    let verified_wearable =
        WearableSensorPacket::decode_and_verify(&raw_wearable).expect("verify wearable CRC-16");
    let validated = shell
        .ingest_wearable_packet(&verified_wearable)
        .expect("ingest wearable packet");
    assert_eq!(validated.supervisor_restart_count, 2);

    // Verify SeqlockTelemetryRing<64> coherence
    assert!(shell.ring.write_count() >= 42);
    let ring_bytes = shell.ring.read_latest_bytes().expect("ring bytes");
    let ring_frame = shell.ring.read_latest().expect("ring decoded");
    assert_eq!(ring_bytes, ring_frame.to_le_bytes());
    assert_ne!(ring_frame.quality_flags_mask & FLAG_SEU_RECOVERY_ACTIVE, 0);
    assert_ne!(
        ring_frame.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
        0
    );

    // 3. Execute ipc_post_stress_test and assert replay cursor invariance
    let stress_input = StressTestScenarioInput {
        source_record_id: "bidmc_01".to_string(),
        flight_day: 165,
        ared_daily_load_kgf: 18.0,
        radiation_dose_rate_msv_d: 2.3,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
        pocus_thrombus_confirmed: false,
        systolic_bp_drop_mmhg: 4.0,
    };
    let after_stress = shell
        .ipc_post_stress_test(StressTestPatchRequest::from(stress_input))
        .expect("ipc_post_stress_test");
    assert_eq!(
        after_stress.relative_recording_time_s,
        snap_before_stress.relative_recording_time_s,
        "ipc_post_stress_test must not mutate 1 Hz BIDMC replay cursor"
    );
    assert!(after_stress.what_if_overlay.active);
    assert_eq!(
        after_stress.active_playbook.playbook_id,
        "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS"
    );

    let os_status = shell
        .ipc_get_os_status_bar_state()
        .expect("os_status_bar_state");
    assert!(os_status.eva_airlock_forbidden);
    assert!(os_status.storm_shelter_mandatory);
    assert_eq!(os_status.seu_restart_count, 2);
    assert_eq!(os_status.partitions.len(), 4);

    // 4. Invoke initialize, tools/list, and all 8 FastMCP tools (< 150 tokens / <= 600 bytes)
    let init_req = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} });
    let init_resp: Value = serde_json::from_str(
        &shell
            .ipc_invoke_fastmcp_tool(&init_req.to_string())
            .expect("mcp initialize"),
    )
    .expect("parse init resp");
    assert_eq!(init_resp["result"]["protocolVersion"], "2025-06-18");

    let list_req = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} });
    let list_resp: Value = serde_json::from_str(
        &shell
            .ipc_invoke_fastmcp_tool(&list_req.to_string())
            .expect("mcp tools/list"),
    )
    .expect("parse tools/list resp");
    assert_eq!(
        list_resp["result"]["tools"]
            .as_array()
            .expect("tools array")
            .len(),
        8
    );

    let tool_calls = [
        ("get_crew_health_summary", json!({})),
        ("explain_causal_anomaly", json!({})),
        ("simulate_countermeasure_impact", json!({})),
        ("get_medops_playbook", json!({})),
        ("query_dataset_graph", json!({ "query": "OSD-818" })),
        (
            "explain_biomarker_path",
            json!({ "from": "OSD-818", "to": "pheno_sans_papilledema" }),
        ),
        ("get_timestral_quantile_cones", json!({})),
        ("get_hypergraph_spatial_status", json!({})),
    ];

    for (idx, (name, args)) in tool_calls.iter().enumerate() {
        let req = json!({
            "jsonrpc": "2.0",
            "id": idx + 10,
            "method": "tools/call",
            "params": { "name": name, "arguments": args }
        });
        let raw_resp = shell
            .ipc_invoke_fastmcp_tool(&req.to_string())
            .expect("ipc_invoke_fastmcp_tool");
        let resp: Value = serde_json::from_str(&raw_resp).expect("parse jsonrpc");
        assert!(
            resp.get("error").is_none() || resp["error"].is_null(),
            "tool {name} returned error: {resp}"
        );
        let text = resp["result"]["content"][0]["text"]
            .as_str()
            .expect("content[0].text string");
        assert!(
            text.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
            "tool {name} payload {} bytes exceeded {MAX_MCP_CONTEXT_MODE_BYTES} byte Context-Mode cap",
            text.len()
        );
        let payload_json: Value =
            serde_json::from_str(text).expect("tool payload must be valid JSON");
        assert!(payload_json.is_object(), "tool {name} JSON must be object");
        assert_eq!(
            payload_json["model_status"], "ILLUSTRATIVE_UNVALIDATED",
            "tool {name} must carry model_status"
        );
    }

    // 5. Verify AresUnifiedDatasetGraph contains all 24 datasets and >= 27 BIDMC slices
    assert_eq!(shell.mission.dataset_graph.dataset_count(), 24);
    assert!(
        shell.mission.dataset_graph.time_window_slice_nodes().len() >= 27,
        "expected >= 27 BIDMC slice nodes"
    );
}
