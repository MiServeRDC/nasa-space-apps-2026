use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, BinaryTelemetryFrame, FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
    FLAG_ILLUSTRATIVE_UNVALIDATED, MASK_RMSSD_MS,
};
use ares_desktop_os::ipc_bridge::{
    RawBinaryFrameSink, RecordingBinaryFrameSink, emit_next_seqlock_frame,
};
use ares_desktop_os::voice_whisper::{
    OfflineVoiceError, SAMPLE_RATE_16KHZ, transcribe_pcm16_16khz_offline,
};
use ares_desktop_os::{
    AresMedOsWorkstationShell, DesktopShellConfig, resolve_medos_data_dir,
};
use std::path::Path;
use std::time::Duration;

fn crate_root() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn resolve_medos_data_dir_finds_workspace_bidmc_and_rejects_missing() {
    let resolved = resolve_medos_data_dir(None).expect("resolve default workspace data/bidmc");
    assert!(resolved.join("bidmc_01_Numerics.csv").is_file());

    let err = resolve_medos_data_dir(Some(Path::new("/nonexistent/ares/bidmc/path")));
    assert!(err.is_err());
}

#[test]
fn tauri_capabilities_and_binary_icons_satisfy_release_bundle_requirements() {
    let cap_path = crate_root().join("capabilities").join("default.json");
    let cap_raw = std::fs::read_to_string(&cap_path).expect("read capabilities/default.json");
    let cap_json: serde_json::Value = serde_json::from_str(&cap_raw).expect("parse capability");
    assert_eq!(cap_json["windows"], serde_json::json!(["medos-primary"]));
    assert!(!cap_raw.contains("core:shell:allow-open"));

    let icons_dir = crate_root().join("icons");
    for png in ["32x32.png", "128x128.png", "128x128@2x.png"] {
        let bytes = std::fs::read(icons_dir.join(png)).expect("read png");
        assert!(bytes.len() > 32, "{png} must not be a 0-byte stub");
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n", "{png} PNG header");
    }

    let icns = std::fs::read(icons_dir.join("icon.icns")).expect("read icon.icns");
    assert!(icns.len() > 16);
    assert_eq!(&icns[..4], b"icns");

    let ico = std::fs::read(icons_dir.join("icon.ico")).expect("read icon.ico");
    assert!(ico.len() > 22);
    assert_eq!(&ico[..4], &[0, 0, 1, 0]);
}

#[test]
fn headless_128b_binary_sink_preserves_crc32c_and_issue_11_12() {
    let data_dir = resolve_medos_data_dir(None).expect("data dir");
    let shell = AresMedOsWorkstationShell::initialize(DesktopShellConfig {
        data_dir,
        ..DesktopShellConfig::default()
    })
    .expect("initialize shell");

    let _ = shell.advance_tick(Duration::from_millis(50)).expect("tick");
    let sink = RecordingBinaryFrameSink::new();
    let written = emit_next_seqlock_frame(&shell.ring, &sink).expect("emit raw 128B frame");
    assert_eq!(written, ARES_BINARY_FRAME_BYTES);

    let captured = sink.captured_frames().expect("captured");
    assert_eq!(captured.len(), 1);
    assert_eq!(captured[0].len(), 128);
    let decoded = BinaryTelemetryFrame::from_le_bytes(&captured[0]).expect("valid crc32c frame");
    assert_ne!(
        decoded.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
        0
    );
    assert_eq!(decoded.validity_mask & MASK_RMSSD_MS, 0);
    assert_ne!(decoded.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED, 0);

    // Reject non-128-byte frames.
    assert!(sink.emit_raw_frame(&[0u8; 64]).is_err());
}

#[test]
fn voice_asr_validates_pcm16_bounds_and_feature_gate() {
    // Reject wrong sample rate and empty silence.
    assert!(matches!(
        transcribe_pcm16_16khz_offline(&[100; 1600], 44_100, None),
        Err(OfflineVoiceError::InvalidSampleRate { .. })
    ));
    assert!(matches!(
        transcribe_pcm16_16khz_offline(&[0; 1600], SAMPLE_RATE_16KHZ, None),
        Err(OfflineVoiceError::SilenceOnly)
    ));

    // Valid speech-like 16 kHz burst (0.5 s sine-like oscillation).
    let pcm: Vec<i16> = (0..8_000)
        .map(|i| (((i as f32) * 0.12).sin() * 8_000.0) as i16)
        .collect();
    let res = transcribe_pcm16_16khz_offline(&pcm, SAMPLE_RATE_16KHZ, None);
    #[cfg(feature = "offline-voice")]
    {
        let tx = res.expect("offline voice transcript");
        assert!(!tx.transcript.is_empty());
        assert_eq!(tx.sample_rate_hz, SAMPLE_RATE_16KHZ);
        assert_eq!(tx.duration_ms, 500);
    }
    #[cfg(not(feature = "offline-voice"))]
    {
        assert_eq!(res, Err(OfflineVoiceError::FeatureDisabled));
    }
}

#[cfg(feature = "tauri-runtime")]
#[tokio::test]
async fn tauri_runtime_bridge_handles_all_ipc_commands_and_copilot() {
    use ares_desktop_os::ipc_bridge::HeadlessTauriBridge;
    use ares_server_cli::edge_llm_bridge::{CopilotAskRequest, EdgeLlmConfig};

    let data_dir = resolve_medos_data_dir(None).expect("data dir");
    let shell = AresMedOsWorkstationShell::initialize(DesktopShellConfig {
        data_dir,
        ..DesktopShellConfig::default()
    })
    .expect("initialize shell");
    shell.mission.set_edge_llm_config(EdgeLlmConfig {
        force_offline_template: true,
        endpoint_url: "http://127.0.0.1:11434".to_string(),
        allow_rfc1918_lan: false,
        ..EdgeLlmConfig::default()
    });

    let bridge = HeadlessTauriBridge::new(std::sync::Arc::new(shell));
    assert_eq!(bridge.command_names().len(), 8);
    assert!(bridge.command_names().contains(&"ipc_ask_edge_copilot"));
    assert!(bridge.command_names().contains(&"ipc_inject_anomaly"));
    assert!(bridge.command_names().contains(&"subscribe_binary_telemetry"));

    // Baseline learning is not yet complete at t=0, so injection must be cleanly refused.
    let early_err = bridge
        .ipc_inject_anomaly(ares_server_cli::wire_contract::AnomalyInjectionRequest {
            kind: Some(ares_telemetry_ingest::anomaly_injection::InjectedAnomalyKind::DesaturationFast),
            magnitude: None,
        })
        .expect_err("baseline not ready at t=0");
    assert!(early_err.to_string().contains("personal baseline"));

    let snapshot = bridge.get_full_wire_snapshot().expect("snapshot");
    assert_eq!(snapshot.biometrics.rmssd_ms, None);

    let os_bar = bridge.get_os_status_bar_state().expect("os status bar");
    assert_eq!(os_bar.transport_mode, "TAURI_NATIVE_IPC");

    let mcp_out = bridge
        .invoke_fastmcp_tool(r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_crew_health_summary","arguments":{}}}"#)
        .expect("mcp invoke");
    assert!(mcp_out.contains("get_crew_health_summary") || mcp_out.contains("result"));

    let sink = RecordingBinaryFrameSink::new();
    let n_bytes = bridge.subscribe_binary_telemetry(&sink).expect("binary sub");
    assert_eq!(n_bytes, ARES_BINARY_FRAME_BYTES);

    let copilot = bridge
        .ipc_ask_edge_copilot(CopilotAskRequest {
            query: "Summarize current playbook and safety gates".to_string(),
            ..CopilotAskRequest::default()
        })
        .await
        .expect("copilot turn");
    assert!(!copilot.answer_markdown.is_empty());
    assert!(!copilot.spoken_summary.is_empty());
}
