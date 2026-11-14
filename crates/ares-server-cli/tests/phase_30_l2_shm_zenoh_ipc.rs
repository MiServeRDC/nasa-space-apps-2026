#![cfg(feature = "shm-ipc")]

use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, BinaryTelemetryFrame, FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
    FLAG_ILLUSTRATIVE_UNVALIDATED, MASK_RMSSD_MS,
};
use ares_server_cli::shm_bus::{
    DsnMedOpsAlertEnvelope, Iox2PosixShmPublisher, Iox2PosixShmSubscriber, Iox2TelemetryFrame,
    MAX_DSN_OUTBOX_ALERTS, NonBlockingShmDsnDispatcher, SHM_SAFE_OVERFLOW_RING_CAPACITY,
    ZenohDsnAdapter, sanitize_astronaut_id_for_keyexpr, zenoh_medops_alerts_keyexpr,
    zenoh_vitals_frame_keyexpr,
};
use ares_server_cli::ws_server::{OwltMarsCommState, SharedMissionState};
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn workspace_bidmc_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("data")
        .join("bidmc")
}

#[test]
fn shm_publisher_subscriber_roundtrip_and_safe_overflow_ring() {
    let svc = format!("ares/test/l2/shm_roundtrip_{}", std::process::id());
    let publisher = Iox2PosixShmPublisher::open_or_create(&svc).expect("open publisher");
    let subscriber = Iox2PosixShmSubscriber::open_or_create(&svc).expect("open subscriber");

    let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("init state");
    let mut last_seq = 0u64;

    // Publish more than SHM_SAFE_OVERFLOW_RING_CAPACITY to verify safe-overflow ring eviction.
    for _ in 0..(SHM_SAFE_OVERFLOW_RING_CAPACITY + 16) {
        let _ = state.advance_tick(Duration::from_millis(50)).expect("tick");
        let raw = state.latest_binary_frame_bytes().expect("raw 128B frame");
        assert_eq!(raw.len(), ARES_BINARY_FRAME_BYTES);
        let decoded = BinaryTelemetryFrame::from_le_bytes(&raw).expect("valid crc32c");
        last_seq = decoded.seq;
        publisher
            .publish_zero_copy(&decoded)
            .expect("publish zero copy");
    }

    assert!(publisher.overflow_evictions() >= 16);

    let received = subscriber
        .receive_latest_verified()
        .expect("receive ok")
        .expect("frame present");
    assert_eq!(received.seq, last_seq);
    assert_ne!(
        received.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
        0
    );
    assert_eq!(received.validity_mask & MASK_RMSSD_MS, 0);
    assert_ne!(
        received.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED,
        0
    );

    let wrapped = Iox2TelemetryFrame::from_binary_frame(&received);
    assert_eq!(
        wrapped.decode_verified().expect("decode ok").to_le_bytes(),
        received.to_le_bytes()
    );
}

#[test]
fn zenoh_keyexpr_sanitizer_blocks_wildcards_and_slashes() {
    assert_eq!(
        sanitize_astronaut_id_for_keyexpr("AST-01_cmd").expect("valid id"),
        "ast-01_cmd"
    );
    assert!(sanitize_astronaut_id_for_keyexpr("ast/*/cmd").is_err());
    assert!(sanitize_astronaut_id_for_keyexpr("ast/**") .is_err());
    assert!(sanitize_astronaut_id_for_keyexpr("ast?01").is_err());
    assert!(sanitize_astronaut_id_for_keyexpr("").is_err());

    assert_eq!(
        zenoh_vitals_frame_keyexpr("CREW-01").expect("keyexpr"),
        "ares/crew/crew-01/vitals/frame"
    );
    assert_eq!(
        zenoh_medops_alerts_keyexpr("CREW-01").expect("keyexpr"),
        "ares/crew/crew-01/alerts/medops"
    );
}

#[tokio::test]
async fn zenoh_airgap_rejects_multicast_and_queues_blackout_outbox() {
    assert!(ZenohDsnAdapter::open_air_gapped(Some("udp/224.0.0.1:7447")).await.is_err());
    assert!(ZenohDsnAdapter::open_air_gapped(Some("tcp/0.0.0.0:7447")).await.is_err());

    let mut adapter = ZenohDsnAdapter::open_air_gapped(Some("tcp/127.0.0.1:7447"))
        .await
        .expect("loopback air-gapped adapter");
    let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("init state");
    let pkt = state.latest_snapshot().expect("packet");
    let raw = state.latest_binary_frame_bytes().expect("raw frame");
    let frame = BinaryTelemetryFrame::from_le_bytes(&raw).expect("frame");
    let alerts_key = zenoh_medops_alerts_keyexpr(&pkt.astronaut_id).expect("keyexpr");
    let mut rx = adapter.subscribe(&alerts_key).expect("subscribe ok");

    let blackout_owlt = OwltMarsCommState {
        owlt_seconds: 852.0,
        eimo_autonomous_active: true,
        blackout_active: true,
        label: "DSN CONJUNCTION BLACKOUT".to_string(),
    };

    // Overflow MAX_DSN_OUTBOX_ALERTS intentionally during blackout and ensure bounded memory.
    for _ in 0..(MAX_DSN_OUTBOX_ALERTS + 10) {
        let env = DsnMedOpsAlertEnvelope::from_tick(&pkt, &frame, &blackout_owlt);
        let emitted = adapter
            .publish_or_buffer_medops_alert(env, true)
            .await
            .expect("buffer during blackout");
        assert_eq!(emitted, 0);
    }
    assert_eq!(adapter.buffered_blackout_alerts(), MAX_DSN_OUTBOX_ALERTS);

    // Clear blackout and flush bounded queue.
    let clear_owlt = OwltMarsCommState {
        owlt_seconds: 852.0,
        eimo_autonomous_active: true,
        blackout_active: false,
        label: "OWLT: 14m 12s (EIMO AUTONOMOUS)".to_string(),
    };
    let clear_env = DsnMedOpsAlertEnvelope::from_tick(&pkt, &frame, &clear_owlt);
    let flushed = adapter
        .publish_or_buffer_medops_alert(clear_env, true)
        .await
        .expect("flush ok");
    assert_eq!(flushed, MAX_DSN_OUTBOX_ALERTS + 1);
    assert_eq!(adapter.buffered_blackout_alerts(), 0);
    assert!(rx.try_recv().is_ok());
}

#[tokio::test]
async fn non_blocking_dispatcher_is_wait_free_and_wired_into_shared_state() {
    let svc = format!("ares/test/l2/dispatcher_{}", std::process::id());
    let dispatcher = NonBlockingShmDsnDispatcher::spawn_default(&svc).expect("spawn dispatcher");
    let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("init state");
    let pkt = state.latest_snapshot().expect("packet");
    let raw = state.latest_binary_frame_bytes().expect("raw frame");
    let frame = BinaryTelemetryFrame::from_le_bytes(&raw).expect("frame");
    let owlt = OwltMarsCommState {
        owlt_seconds: 852.0,
        eimo_autonomous_active: true,
        blackout_active: false,
        label: "OWLT: 14m 12s (EIMO AUTONOMOUS)".to_string(),
    };

    let t0 = Instant::now();
    for _ in 0..200 {
        dispatcher.try_dispatch(&pkt, &frame, &owlt, false);
    }
    let avg_us = t0.elapsed().as_secs_f64() * 1_000_000.0 / 200.0;
    assert!(
        avg_us < 50.0,
        "Non-blocking dispatch must stay strictly within non-blocking budget, got {avg_us:.2} us"
    );

    assert!(state.shm_dispatcher.is_some());
    let _ = state.advance_tick(Duration::from_millis(50)).expect("tick");
}
