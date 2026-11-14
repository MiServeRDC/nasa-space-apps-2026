use ares_core_types::telemetry::ModelValidationStatus;
use ares_nqs_stl::timestral_backbone::{
    ARES_TIMESTRAL_CHANNELS, CausalScaler, TimestralConfig,
};
use ares_nqs_stl::timestral_bridge::{
    AresMultivariateSample, AresTemporalForecasterEngine, KnownFutureCovariates,
};
use ares_nqs_stl::timestral_quantiles::QuantileHead;
use ares_nqs_stl::timestral_safetensors::{
    CheckpointOrigin, ModelArtifactEntry, ModelsManifest, SafeTensorDtype, SafeTensorsArchive,
    compute_sha256_hex, decode_tensor_view_to_f64, load_timestral_or_deterministic_fallback,
    load_verified_timestral_checkpoint, serialize_deterministic_timestral_checkpoint,
    serialize_f64_map_to_safetensors,
};
use ares_nqs_stl::NqsStlError;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_test_dir(tag: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let dir = std::env::temp_dir().join(format!(
        "ares_l4_safetensors_{tag}_{}_{}",
        std::process::id(),
        nanos
    ));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn compact_cfg() -> TimestralConfig {
    TimestralConfig {
        num_channels: ARES_TIMESTRAL_CHANNELS,
        patch_len: 4,
        d_model: 16,
        n_heads: 4,
        d_ff: 32,
        num_layers: 2,
        ..TimestralConfig::default()
    }
}

fn write_manifest(dir: &Path, model_id: &str, file: &str, sha256: &str, cfg: &TimestralConfig) {
    let manifest = ModelsManifest {
        schema_version: 1,
        evidence_boundary: "Test SafeTensors manifest (ILLUSTRATIVE_UNVALIDATED)".to_string(),
        artifacts: vec![ModelArtifactEntry {
            model_id: model_id.to_string(),
            file: file.to_string(),
            artifact_kind: "SAFETENSORS_V1_WEIGHTS".to_string(),
            bundled: true,
            sha256: sha256.to_string(),
            expected_config: Some(cfg.clone()),
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            notes: None,
        }],
    };
    let json = serde_json::to_string_pretty(&manifest).expect("serialize manifest");
    fs::write(dir.join("MANIFEST.json"), json).expect("write MANIFEST.json");
}

#[test]
fn valid_f64_f32_and_bf16_roundtrip_and_monotone_inference() {
    let cfg = compact_cfg();
    for dtype in [
        SafeTensorDtype::F64,
        SafeTensorDtype::F32,
        SafeTensorDtype::BF16,
    ] {
        let dir = temp_test_dir(dtype.as_tag());
        let bytes =
            serialize_deterministic_timestral_checkpoint(&cfg, dtype.clone(), 1.25)
                .expect("serialize checkpoint");
        let sha = compute_sha256_hex(&bytes);
        fs::write(dir.join("timestral.safetensors"), &bytes).expect("write safetensors");
        write_manifest(&dir, "timestral-dhf-v1", "timestral.safetensors", &sha, &cfg);

        let bundle = load_verified_timestral_checkpoint(&dir, "timestral-dhf-v1", &cfg)
            .expect("load verified safetensors");
        assert_eq!(
            bundle.model_validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
        match &bundle.origin {
            CheckpointOrigin::LoadedVerifiedSafeTensors {
                model_id,
                sha256_hex,
                parameter_count,
                ..
            } => {
                assert_eq!(model_id, "timestral-dhf-v1");
                assert_eq!(sha256_hex, &sha);
                assert_eq!(*parameter_count, 6_913);
            }
            other => panic!("expected LoadedVerifiedSafeTensors, got {other:?}"),
        }

        let mut engine = AresTemporalForecasterEngine::new_with_optional_checkpoint(
            cfg.clone(),
            Some(&dir),
        )
        .expect("init engine with verified checkpoint");
        assert!(engine.checkpoint_origin().is_verified_safetensors());

        let cov = KnownFutureCovariates::default();
        for step in 0..1_000usize {
            let sample = AresMultivariateSample {
                recording_time_s: step as f64,
                values: [
                    72.0 + ((step % 15) as f64) * 0.3,
                    71.5,
                    15.0,
                    98.0,
                    41.0,
                    50.0,
                    1.3,
                    1.75,
                    125.0,
                    25.0,
                    0.22,
                    0.45 - ((step % 10) as f64) * 0.005,
                ],
                observed_mask: 0x0FFF,
                sqi_score: 0.92,
            };
            let snap = engine
                .ingest_sample_1hz(&sample, &cov, -0.004)
                .expect("1hz inference");
            snap.assert_monotone()
                .expect("loaded weights must preserve non-crossing quantiles");
            assert_eq!(
                snap.model_validation_status,
                ModelValidationStatus::IllustrativeUnvalidated
            );
        }

        let _ = fs::remove_dir_all(&dir);
    }
}

#[test]
fn sha256_mismatch_triggers_error_before_parse_and_clean_fallback() {
    let cfg = compact_cfg();
    let dir = temp_test_dir("sha_mismatch");

    // Corrupt header length prefix AND tamper with bytes; SHA-256 check must reject BEFORE SafeTensors parse!
    let mut bytes =
        serialize_deterministic_timestral_checkpoint(&cfg, SafeTensorDtype::F32, 1.0)
            .expect("serialize checkpoint");
    let expected_sha = compute_sha256_hex(&bytes);
    // Flip a bit in the 8-byte header length prefix so SafeTensors parsing would fail if reached.
    bytes[0] ^= 0x01;
    fs::write(dir.join("timestral.safetensors"), &bytes).expect("write tampered safetensors");
    write_manifest(
        &dir,
        "timestral-dhf-v1",
        "timestral.safetensors",
        &expected_sha,
        &cfg,
    );

    let err = load_verified_timestral_checkpoint(&dir, "timestral-dhf-v1", &cfg)
        .expect_err("tampered bytes must fail SHA-256 check");
    assert!(
        matches!(err, NqsStlError::CheckpointSha256Mismatch { .. }),
        "expected CheckpointSha256Mismatch prior to header parse, got {err:?}"
    );

    let fallback_bundle =
        load_timestral_or_deterministic_fallback(cfg.clone(), Some(&dir), "timestral-dhf-v1")
            .expect("fallback must succeed without panic");
    assert!(fallback_bundle.origin.is_deterministic_stub());
    assert_eq!(
        fallback_bundle.model_validation_status,
        ModelValidationStatus::IllustrativeUnvalidated
    );

    let engine = AresTemporalForecasterEngine::new_with_optional_checkpoint(cfg, Some(&dir))
        .expect("engine fallback must succeed");
    assert!(engine.checkpoint_origin().is_deterministic_stub());

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn corrupted_header_shape_nan_and_gamma_reject_without_panic() {
    let cfg = compact_cfg();

    // 1. Truncated header
    assert!(matches!(
        SafeTensorsArchive::deserialize(&[16, 0, 0, 0, 0, 0, 0, 0, b'{']),
        Err(NqsStlError::CheckpointFormatError { .. })
    ));

    // 2. Shape mismatch via decode_tensor_view_to_f64
    let wrong_shape_buf = serialize_f64_map_to_safetensors(
        &[("w", &[15, 8], &vec![0.1; 15 * 8])],
        SafeTensorDtype::F32,
        None,
    )
    .expect("serialize wrong shape");
    let archive = SafeTensorsArchive::deserialize(&wrong_shape_buf).expect("parse archive");
    let view = archive.tensor("w").expect("tensor w");
    assert!(matches!(
        decode_tensor_view_to_f64("w", view, &[16, 8]),
        Err(NqsStlError::CheckpointShapeMismatch { .. })
    ));

    // 3. NaN / Inf rejection in F32 and BF16
    let nan_buf = serialize_f64_map_to_safetensors(
        &[("w", &[2], &[1.0, f64::NAN])],
        SafeTensorDtype::F32,
        None,
    )
    .expect("serialize NaN");
    let nan_archive = SafeTensorsArchive::deserialize(&nan_buf).expect("parse nan archive");
    assert!(matches!(
        decode_tensor_view_to_f64("w", nan_archive.tensor("w").expect("w"), &[2]),
        Err(NqsStlError::CheckpointNonFiniteWeight { .. })
    ));

    let inf_bf16 = serialize_f64_map_to_safetensors(
        &[("w", &[2], &[1.0, f64::INFINITY])],
        SafeTensorDtype::BF16,
        None,
    )
    .expect("serialize Inf BF16");
    let inf_archive = SafeTensorsArchive::deserialize(&inf_bf16).expect("parse inf archive");
    assert!(matches!(
        decode_tensor_view_to_f64("w", inf_archive.tensor("w").expect("w"), &[2]),
        Err(NqsStlError::CheckpointNonFiniteWeight { .. })
    ));

    // 4. QuantileHead spread_scale_gamma <= 0 or < 1e-4 rejected
    assert!(matches!(
        QuantileHead::from_loaded_weights(16, 0.0, vec![0.0; 28 * 16]),
        Err(NqsStlError::InvalidConfig { .. })
    ));
    assert!(matches!(
        QuantileHead::from_loaded_weights(16, 1e-5, vec![0.0; 28 * 16]),
        Err(NqsStlError::InvalidConfig { .. })
    ));

    // 5. Full checkpoint with NaN weight fails verification and triggers DeterministicStub fallback
    let dir = temp_test_dir("nan_ckpt");
    let mut bad_ckpt =
        serialize_deterministic_timestral_checkpoint(&cfg, SafeTensorDtype::F64, 1.0)
            .expect("serialize valid ckpt");
    // Overwrite last 8 bytes (quantile_head.spread_scale_gamma = 1.0) with 0.0 f64
    let len = bad_ckpt.len();
    bad_ckpt[len - 8..len].copy_from_slice(&0.0_f64.to_le_bytes());
    let bad_sha = compute_sha256_hex(&bad_ckpt);
    fs::write(dir.join("timestral.safetensors"), &bad_ckpt).expect("write bad gamma ckpt");
    write_manifest(&dir, "timestral-dhf-v1", "timestral.safetensors", &bad_sha, &cfg);

    assert!(matches!(
        load_verified_timestral_checkpoint(&dir, "timestral-dhf-v1", &cfg),
        Err(NqsStlError::InvalidConfig { .. })
    ));
    let fallback =
        load_timestral_or_deterministic_fallback(cfg, Some(&dir), "timestral-dhf-v1")
            .expect("fallback on invalid gamma");
    assert!(fallback.origin.is_deterministic_stub());

    let _ = fs::remove_dir_all(&dir);
    let _ = CausalScaler::default();
}

#[test]
fn workspace_assets_models_manifest_triggers_clean_deterministic_fallback() {
    let models_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets/models");
    let manifest_str =
        fs::read_to_string(models_dir.join("MANIFEST.json")).expect("read assets/models/MANIFEST.json");
    let manifest: ModelsManifest =
        serde_json::from_str(&manifest_str).expect("parse assets/models/MANIFEST.json");
    assert_eq!(manifest.schema_version, 1);
    assert!(manifest
        .artifacts
        .iter()
        .any(|a| a.model_id == "timestral-dhf-v1" && !a.bundled));
    assert!(manifest
        .artifacts
        .iter()
        .any(|a| a.file == "ggml-tiny.en-q5_1.bin" && !a.bundled));

    let engine = AresTemporalForecasterEngine::new_with_optional_checkpoint(
        TimestralConfig::default(),
        Some(&models_dir),
    )
    .expect("missing unbundled weights must degrade cleanly to deterministic stub");
    assert!(engine.checkpoint_origin().is_deterministic_stub());
}
