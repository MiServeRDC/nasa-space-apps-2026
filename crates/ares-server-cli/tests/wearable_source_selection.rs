#![forbid(unsafe_code)]

//! Regression and contract verification tests for Problem 1:
//! Hardware Wearable source selection, non-overwrite by 20 Hz ticks,
//! explicit hardware provenance, detector integration, and sensor loss detection.

use ares_core_types::telemetry::{AlertSeverity, BiometricsSource};
use ares_server_cli::ws_server::{SharedMissionState, TelemetrySourceMode, WEARABLE_STALE_TIMEOUT};
use ares_telemetry_ingest::wearable_packet::*;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

fn create_test_state() -> Arc<SharedMissionState> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("parent of crates")
        .parent()
        .expect("repo root")
        .join("data/bidmc");
    SharedMissionState::from_data_dir(&manifest_dir).expect("initialize SharedMissionState")
}

fn sample_wearable_packet(node_id: u8, seq: u32, hr_bpm: f64) -> WearableSensorPacket {
    let hr_bpm_x100 = (hr_bpm * 100.0) as u16;
    let packet = WearableSensorPacket {
        sync_word: WEARABLE_SYNC_WORD,
        node_id,
        channel_mask: WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM,
        sequence_num: seq,
        uptime_ms: seq * 1000,
        supervisor_restart_count: 0,
        hr_bpm_x100,
        spo2_pct_x100: 9800,
        resp_brpm_x100: 1600,
        rr_interval_ms_x10: 0,
        sqi_score_x10000: 9500,
        imu_rms_g: 0.02,
        flags: 0,
        crc16_ccitt: 0,
    };
    WearableSensorPacket::decode_and_verify(&packet.to_le_bytes_with_crc())
        .expect("valid test packet")
}

#[test]
fn test_wearable_not_overwritten_by_replay_ticks_and_hardware_provenance() {
    let state = create_test_state();

    // 1. Initially in RecordedReplay mode
    assert_eq!(state.source_mode(), TelemetrySourceMode::RecordedReplay);
    let initial = state.latest_snapshot().expect("initial snapshot");
    assert_eq!(initial.source_record_id, "bidmc_01");
    assert_eq!(
        initial.provenance_manifest.biometrics_source,
        BiometricsSource::RecordedTerrestrialBidmcCsv
    );

    // 2. Ingest wearable packet (HR = 123.0)
    let pkt = sample_wearable_packet(1, 1, 123.0);
    let res = state.ingest_wearable_packet(&pkt);
    assert!(res.is_some(), "wearable packet must be accepted");

    // 3. Immediately verify snapshot reflects wearable data and hardware provenance
    let snap_after_ingest = state.latest_snapshot().expect("snapshot after ingest");
    assert_eq!(snap_after_ingest.source_record_id, "hubris_node_01");
    assert_eq!(snap_after_ingest.biometrics.heart_rate_bpm, Some(123.0));
    assert_eq!(
        snap_after_ingest.provenance_manifest.biometrics_source,
        BiometricsSource::HardwareWearable
    );
    assert_eq!(state.source_mode(), TelemetrySourceMode::LiveWearableHardware);

    // 4. Advance 20 Hz ticks for 100 iterations (5.0 seconds of publication time)
    for _ in 0..100 {
        let ticked = state
            .advance_tick(Duration::from_millis(50))
            .expect("advance_tick must succeed");
        // Vitals must remain locked to wearable sensor; CSV replay data must NEVER overwrite it!
        assert_eq!(ticked.source_record_id, "hubris_node_01");
        assert_eq!(ticked.biometrics.heart_rate_bpm, Some(123.0));
        assert_eq!(
            ticked.provenance_manifest.biometrics_source,
            BiometricsSource::HardwareWearable
        );
    }

    // 5. Verify snapshot after all ticks
    let final_snap = state.latest_snapshot().expect("final snapshot");
    assert_eq!(final_snap.source_record_id, "hubris_node_01");
    assert_eq!(final_snap.biometrics.heart_rate_bpm, Some(123.0));
    assert_eq!(
        final_snap.provenance_manifest.biometrics_source,
        BiometricsSource::HardwareWearable
    );
}

#[test]
fn test_wearable_detector_integration_and_null_hrv_preservation() {
    let state = create_test_state();

    // Ingest successive wearable packets to drive the anomaly detector
    for seq in 1..=10 {
        let pkt = sample_wearable_packet(1, seq, 75.0 + seq as f64);
        let validated = state.ingest_wearable_packet(&pkt);
        assert!(validated.is_some());
    }

    let snap = state.latest_snapshot().expect("latest snapshot");
    assert_eq!(snap.biometrics.heart_rate_bpm, Some(85.0));
    // Verify Issue #11 invariant: WMASK_RR_INTERVAL == 0 keeps RMSSD as None
    assert_eq!(snap.biometrics.rmssd_ms, None);
    assert!(snap.biometrics.hrv_unavailable_reason.is_some());

    // Verify binary frame consistency (active_alert_code is 1: DataDegradedMissingChannels due to missing RMSSD)
    let bin = state.latest_binary_frame().expect("latest binary frame");
    assert_eq!(bin.active_alert_code, 1);
    assert_ne!(bin.validity_mask & 1, 0); // HR bit valid
}

#[test]
fn test_wearable_duplicate_and_out_of_order_rejection() {
    let state = create_test_state();

    let p1 = sample_wearable_packet(1, 10, 80.0);
    assert!(state.ingest_wearable_packet(&p1).is_some());

    // Duplicate sequence number must be dropped
    let p1_dup = sample_wearable_packet(1, 10, 80.0);
    assert!(state.ingest_wearable_packet(&p1_dup).is_none());

    // Out-of-order sequence number (seq 9 < 10) must be dropped
    let p_old = sample_wearable_packet(1, 9, 80.0);
    assert!(state.ingest_wearable_packet(&p_old).is_none());

    // Forward monotonic sequence (seq 11 > 10) must be accepted
    let p2 = sample_wearable_packet(1, 11, 82.0);
    assert!(state.ingest_wearable_packet(&p2).is_some());
}

#[test]
fn test_wearable_sensor_loss_timeout_and_recovery() {
    let state = create_test_state();

    // 1. Ingest wearable packet
    let p1 = sample_wearable_packet(2, 1, 90.0);
    assert!(state.ingest_wearable_packet(&p1).is_some());
    assert_eq!(state.source_mode(), TelemetrySourceMode::LiveWearableHardware);

    // 2. Immediately active, missing_channels does not have wearable_sensor_loss
    let snap = state.latest_snapshot().expect("snapshot");
    assert!(
        !snap
            .biometrics
            .missing_channels
            .iter()
            .any(|c| c == "wearable_sensor_loss"),
        "sensor loss flag must not be present initially"
    );

    // 3. Simulate passage of time exceeding WEARABLE_STALE_TIMEOUT (3.0s)
    // We can simulate this by setting last_wearable_packet_time into the past
    if let Ok(mut guard) = state.inner.write() {
        guard.last_wearable_packet_time =
            Some(std::time::Instant::now() - WEARABLE_STALE_TIMEOUT - Duration::from_millis(500));
    }

    // 4. Advance tick: must detect sensor loss and mark DataDegradedMissingChannels
    let ticked = state
        .advance_tick(Duration::from_millis(50))
        .expect("tick succeeds");
    assert_eq!(
        ticked.alert_severity,
        AlertSeverity::DataDegradedMissingChannels
    );
    assert!(
        ticked
            .biometrics
            .missing_channels
            .iter()
            .any(|c| c == "wearable_sensor_loss"),
        "missing_channels must include wearable_sensor_loss"
    );
    // Crucially: it must NOT have switched back to CSV!
    assert_eq!(ticked.source_record_id, "hubris_node_02");
    assert_eq!(
        ticked.provenance_manifest.biometrics_source,
        BiometricsSource::HardwareWearable
    );

    // 5. Recovery: new packet arrives
    let p2 = sample_wearable_packet(2, 2, 92.0);
    assert!(state.ingest_wearable_packet(&p2).is_some());
    let recovered = state.latest_snapshot().expect("recovered snapshot");
    assert_eq!(recovered.biometrics.heart_rate_bpm, Some(92.0));
    assert_eq!(
        recovered.provenance_manifest.biometrics_source,
        BiometricsSource::HardwareWearable
    );
}

#[test]
fn test_explicit_source_mode_switch_and_baseline_reset() {
    let state = create_test_state();

    // Start in wearable mode
    let p = sample_wearable_packet(1, 1, 110.0);
    assert!(state.ingest_wearable_packet(&p).is_some());
    assert_eq!(state.source_mode(), TelemetrySourceMode::LiveWearableHardware);

    // Explicitly switch back to RecordedReplay
    state.set_source_mode(TelemetrySourceMode::RecordedReplay);
    assert_eq!(state.source_mode(), TelemetrySourceMode::RecordedReplay);

    // After switching to Replay, advance_tick advances CSV replay
    let ticked = state
        .advance_tick(Duration::from_millis(50))
        .expect("ticked");
    assert_eq!(ticked.source_record_id, "bidmc_01");
    assert_eq!(
        ticked.provenance_manifest.biometrics_source,
        BiometricsSource::RecordedTerrestrialBidmcCsv
    );
}
