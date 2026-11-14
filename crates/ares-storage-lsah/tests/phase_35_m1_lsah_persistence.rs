use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_core_types::telemetry::ModelValidationStatus;
use ares_security_privacy::{EphemeralDsnKey, Sha256AuditLogger};
use ares_storage_lsah::{
    ArrowIpcZstdHnswBackend, COLD_HEADER_BYTES, ColdTierArchiver, DsnDownlinkOutbox,
    DsnPriorityTier, HotLsahSlot, HotRingBuffer, LsahAccessRole, LsahStorageConfig,
    LsahStorageEngine, LsahStorageError, OutboxDescriptor, PocusEmbeddingOrigin,
    PocusHemodynamicContext, PocusSignatureRecord, PocusSimilarityQuery,
    QUALITY_BEAT_INTERVALS_NOT_AVAILABLE, VALID_HR_BPM, VALID_PULSE_BPM, VALID_RESP_RPM,
    VALID_RMSSD_MS, VALID_SPO2_PCT, VALID_VOCAL_BIOMARKERS, WarmColumnarVectorBackend,
    WarmSegmentMeta, compute_crc32c, extract_pocus_feature_vector, slots_to_record_batch,
    synthesize_procedural_ijv_bmode, validate_airgapped_lsah_dir,
};
use ares_telemetry_ingest::BidmcReplayer;
use arrow_array::Array;
use arrow_array::cast::AsArray;
use arrow_array::types::{Float32Type, Float64Type, UInt32Type};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tempfile::TempDir;

fn sample_slot(seq: u64, sol: u16, crew_id: &str, with_vocal: bool) -> HotLsahSlot {
    let mut slot = HotLsahSlot::zeroed();
    slot.sequence_id = seq;
    slot.timestamp_unix_ms = 1_760_000_000_000 + (seq as i64) * 50;
    slot.mission_sol = sol;
    slot.set_crew_id(crew_id);
    slot.hr_bpm = 72.0 + (seq % 7) as f64;
    slot.pulse_bpm = 71.5 + (seq % 5) as f64;
    slot.resp_rpm = 15.0;
    slot.spo2_pct = 98.0;
    slot.tau_w_dyn_cm2 = 2.45;
    slot.ijv_csa_cm2 = 0.78;
    slot.ijv_vmax_cm_s = 14.2;
    slot.rho_min_global = 0.35;
    slot.mri_score = 89.0;
    slot.sqi_score = 0.94;
    slot.validity_mask = VALID_HR_BPM | VALID_PULSE_BPM | VALID_RESP_RPM | VALID_SPO2_PCT;
    slot.quality_flags_mask = QUALITY_BEAT_INTERVALS_NOT_AVAILABLE;

    if with_vocal {
        slot.vocal_jitter_pct = 0.62;
        slot.vocal_shimmer_db = 0.35;
        slot.vocal_hnr_db = 18.5;
        slot.validity_mask |= VALID_VOCAL_BIOMARKERS;
    }

    slot.update_crc32c();
    slot
}

#[test]
fn m1_t01_hot_ring_zero_alloc_and_wrap_invariants() {
    assert_eq!(core::mem::size_of::<HotLsahSlot>(), 256);
    assert_eq!(core::mem::align_of::<HotLsahSlot>(), 64);

    let mut seu_slot = sample_slot(1, 1, "ARES-CDR-01", false);
    assert!(seu_slot.verify_crc32c());
    seu_slot.hr_bpm += 0.25;
    assert!(
        !seu_slot.verify_crc32c(),
        "SEU single-field bit-flip must invalidate slot CRC-32C"
    );

    let ring = HotRingBuffer::new(2_400);
    assert_eq!(ring.capacity(), 2_400);
    let initial_ptr = ring.slots_ptr_addr();

    for seq in 1..=10_000_u64 {
        let s = sample_slot(seq, 1, "ARES-CDR-01", false);
        ring.push(s);
    }

    assert_eq!(
        ring.slots_ptr_addr(),
        initial_ptr,
        "HotRingBuffer buffer address must never reallocate after initialization"
    );
    assert_eq!(ring.len(), 2_400);
    assert_eq!(ring.total_pushed(), 10_000);

    let recent = ring.snapshot_recent(2_400);
    assert_eq!(recent.len(), 2_400);
    assert_eq!(recent.first().map(|s| s.sequence_id), Some(7_601));
    assert_eq!(recent.last().map(|s| s.sequence_id), Some(10_000));
    assert!(recent.iter().all(HotLsahSlot::verify_crc32c));
}

#[test]
fn m1_t02_issue_11_null_bitmap_roundtrip_fidelity() -> Result<(), Box<dyn std::error::Error>> {
    let csv_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/bidmc/bidmc_01_Numerics.csv");
    let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path)?;
    assert_eq!(replayer.len(), 481);

    let mut slots = Vec::with_capacity(replayer.len());
    for (idx, row) in replayer.rows().iter().enumerate() {
        let mut s = HotLsahSlot::zeroed();
        s.sequence_id = (idx + 1) as u64;
        s.timestamp_unix_ms = 1_760_000_000_000 + (row.relative_time_s as i64) * 1_000;
        s.mission_sol = 1;
        s.set_crew_id("ARES-CDR-01");
        s.quality_flags_mask = QUALITY_BEAT_INTERVALS_NOT_AVAILABLE;

        let mut mask = 0u32;
        if let Some(hr) = row.hr_bpm {
            s.hr_bpm = hr;
            mask |= VALID_HR_BPM;
        }
        if let Some(pulse) = row.pulse_bpm {
            s.pulse_bpm = pulse;
            mask |= VALID_PULSE_BPM;
        }
        if let Some(resp) = row.resp_brpm {
            s.resp_rpm = resp;
            mask |= VALID_RESP_RPM;
        }
        if let Some(spo2) = row.spo2_pct {
            s.spo2_pct = spo2;
            mask |= VALID_SPO2_PCT;
        }
        // Issue #11: 1 Hz numeric stream has no IBI -> rmssd_ms remains invalid (Arrow NULL).
        assert_eq!(mask & VALID_RMSSD_MS, 0);
        s.validity_mask = mask;
        s.update_crc32c();
        slots.push(s);
    }

    let tmp = TempDir::new()?;
    let mut cfg = LsahStorageConfig::with_root_dir(tmp.path());
    cfg.warm_batch_size = 500;
    let engine = LsahStorageEngine::open(cfg)?;

    for s in slots {
        engine.push_slot(s);
    }
    engine.flush_warm_now()?;

    let warm_batches = engine.query_warm_sol_range("ARES-CDR-01", 1, 1, LsahAccessRole::FlightSurgeon)?;
    let key = EphemeralDsnKey::from_bytes([0x42; 32]);
    let seal = engine.seal_sol_to_cold(1, &key, DsnPriorityTier::NominalSol, 1_760_000_500_000)?;
    let opened = engine.open_cold_chunk(&seal.chunk_path, &key, LsahAccessRole::FlightSurgeon)?;

    for batches in [&warm_batches, &opened.batches] {
        let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
        assert_eq!(total_rows, 481);

        let rmssd_nulls: usize = batches
            .iter()
            .map(|b| b.column_by_name("rmssd_ms").map(|c| c.null_count()).unwrap_or(0))
            .sum();
        let pulse_nulls: usize = batches
            .iter()
            .map(|b| b.column_by_name("pulse_bpm").map(|c| c.null_count()).unwrap_or(0))
            .sum();
        let spo2_nulls: usize = batches
            .iter()
            .map(|b| b.column_by_name("spo2_pct").map(|c| c.null_count()).unwrap_or(0))
            .sum();

        assert_eq!(rmssd_nulls, 481, "Issue #11: every 1 Hz rmssd_ms must be Arrow NULL");
        assert_eq!(pulse_nulls, 13, "bidmc_01_Numerics.csv has 13 missing PULSE samples");
        assert_eq!(spo2_nulls, 13, "bidmc_01_Numerics.csv has 13 missing SpO2 samples");

        for b in batches {
            let pulse_arr = b
                .column_by_name("pulse_bpm")
                .ok_or("missing pulse_bpm")?
                .as_primitive::<Float64Type>();
            for i in 0..pulse_arr.len() {
                if !pulse_arr.is_null(i) {
                    assert!(pulse_arr.value(i) > 0.0, "must never impute missing value to 0.0");
                }
            }
            let qflags = b
                .column_by_name("quality_flags_mask")
                .ok_or("missing quality_flags_mask")?
                .as_primitive::<UInt32Type>();
            for i in 0..qflags.len() {
                assert_ne!(qflags.value(i) & QUALITY_BEAT_INTERVALS_NOT_AVAILABLE, 0);
            }
        }
    }

    Ok(())
}

struct MockSlowSsdBackend {
    stall: Duration,
    batches_written: AtomicUsize,
}

impl WarmColumnarVectorBackend for MockSlowSsdBackend {
    fn backend_name(&self) -> &'static str {
        "mock-slow-ssd"
    }

    fn append_telemetry_batch(
        &self,
        batch: &arrow_array::RecordBatch,
    ) -> Result<WarmSegmentMeta, LsahStorageError> {
        std::thread::sleep(self.stall);
        let id = self.batches_written.fetch_add(1, Ordering::Relaxed) as u64 + 1;
        Ok(WarmSegmentMeta {
            segment_id: id,
            mission_sol: 1,
            relative_path: format!("mock_{id}.arrow.zst"),
            row_count: batch.num_rows(),
            compressed_bytes: 512,
            crc32c: 0,
            min_sequence_id: 1,
            max_sequence_id: batch.num_rows() as u64,
        })
    }

    fn read_telemetry_sol_range(
        &self,
        _crew_id: &str,
        _sol_start: u16,
        _sol_end: u16,
    ) -> Result<Vec<arrow_array::RecordBatch>, LsahStorageError> {
        Ok(Vec::new())
    }

    fn upsert_pocus_signature(&self, record: &PocusSignatureRecord) -> Result<u64, LsahStorageError> {
        Ok(record.signature_id)
    }

    fn search_similar_pocus(
        &self,
        _query: &PocusSimilarityQuery,
    ) -> Result<Vec<ares_storage_lsah::PocusSimilarityHit>, LsahStorageError> {
        Ok(Vec::new())
    }

    fn flush_and_sync(&self) -> Result<(), LsahStorageError> {
        Ok(())
    }

    fn warm_stats(&self) -> (usize, u64, usize) {
        (self.batches_written.load(Ordering::Relaxed), 0, 0)
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn m1_t03_slow_ssd_stall_never_blocks_20hz_ingestion() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let mut cfg = LsahStorageConfig::with_root_dir(tmp.path());
    cfg.warm_batch_size = 16;
    cfg.warm_flush_interval_ms = 20;

    let slow_backend = Arc::new(MockSlowSsdBackend {
        stall: Duration::from_millis(180),
        batches_written: AtomicUsize::new(0),
    });
    let engine = LsahStorageEngine::open_with_backend(cfg, slow_backend.clone())?;
    engine.start_background_flusher();

    let mut max_push_dur = Duration::ZERO;
    let mut durations = Vec::with_capacity(200);

    // Push 200 frames rapidly while the background flusher hits 180 ms SSD stalls.
    for seq in 1..=200_u64 {
        let slot = sample_slot(seq, 1, "ARES-CDR-01", false);
        let t0 = Instant::now();
        engine.push_slot(slot);
        let dt = t0.elapsed();
        durations.push(dt);
        if dt > max_push_dur {
            max_push_dur = dt;
        }
        if seq == 16 {
            // Give the flusher a brief moment to enter the 180ms sleep on bank 0.
            tokio::time::sleep(Duration::from_millis(15)).await;
        }
    }

    durations.sort();
    let p99 = durations[(durations.len() * 99) / 100];
    assert!(
        p99 < Duration::from_micros(50),
        "p99 push_slot latency {:?} exceeded 50 us",
        p99
    );
    assert!(
        max_push_dur < Duration::from_millis(5),
        "producer tick was blocked by 180ms SSD stall: max {:?}",
        max_push_dur
    );

    let coalesced = engine.staging().warm_coalesced_frames();
    assert!(
        coalesced > 0,
        "overflow during 180ms stall across >2 swap banks must fold into warm_coalesced_frames"
    );

    engine.stop_background_flusher().await;
    assert!(slow_backend.batches_written.load(Ordering::Relaxed) >= 1);
    Ok(())
}

#[test]
fn m1_t04_crash_atomic_tmp_recovery_and_crc_quarantine() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let cfg = LsahStorageConfig::with_root_dir(tmp.path());

    let seg_paths: Vec<PathBuf> = {
        let backend = ArrowIpcZstdHnswBackend::open(&cfg)?;
        let s1: Vec<HotLsahSlot> = (1..=10).map(|i| sample_slot(i, 1, "ARES-CDR-01", false)).collect();
        let s2: Vec<HotLsahSlot> = (11..=20).map(|i| sample_slot(i, 1, "ARES-CDR-01", false)).collect();
        let m1 = backend.append_telemetry_batch(&slots_to_record_batch(&s1)?)?;
        let m2 = backend.append_telemetry_batch(&slots_to_record_batch(&s2)?)?;
        vec![
            backend.warm_dir().join(m1.relative_path),
            backend.warm_dir().join(m2.relative_path),
        ]
    };

    // Simulate crash artifacts: leftover .tmp file + 1-byte corruption in segment 2.
    let orphan_tmp = seg_paths[0]
        .parent()
        .ok_or("missing parent")?
        .join("sol_0001_seg_00000099.arrow.zst.tmp");
    fs::write(&orphan_tmp, b"partial-uncommitted-arrow")?;

    let mut corrupted_bytes = fs::read(&seg_paths[1])?;
    corrupted_bytes[12] ^= 0x80;
    fs::write(&seg_paths[1], &corrupted_bytes)?;

    let crc_err = ArrowIpcZstdHnswBackend::verify_segment_file_crc(&seg_paths[1], 0);
    assert!(matches!(crc_err, Err(LsahStorageError::CrcMismatch { .. })));

    let (engine, report) = LsahStorageEngine::open_with_report(cfg)?;
    assert!(!orphan_tmp.exists(), "orphan .tmp must be purged on startup");
    assert_eq!(report.purged_tmp_files.len(), 1);
    assert_eq!(report.quarantined_corrupt_segments.len(), 1);
    assert_eq!(report.valid_segments_recovered, 1);

    let recovered = engine.query_warm_sol_range("ARES-CDR-01", 1, 1, LsahAccessRole::FlightSurgeon)?;
    let rows: usize = recovered.iter().map(|b| b.num_rows()).sum();
    assert_eq!(rows, 10, "valid segment 1 must remain readable after quarantining segment 2");
    Ok(())
}

#[test]
fn m1_t05_hnsw_sol180_vs_sol1_ann_recall_and_determinism() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let cfg = LsahStorageConfig::with_root_dir(tmp.path());
    let backend = ArrowIpcZstdHnswBackend::open(&cfg)?;

    let mut records = Vec::with_capacity(500);
    for i in 0..500_usize {
        let sol = ((i * 180) / 500 + 1) as u16;
        let stasis = (sol as f32 / 180.0).clamp(0.0, 1.0);
        let thrombus = if sol >= 165 { (sol - 160) as f32 / 25.0 } else { 0.0 };
        let pixels = synthesize_procedural_ijv_bmode(64, 64, stasis, thrombus);
        let ctx = PocusHemodynamicContext {
            tau_w_dyn_cm2: 2.8 - (stasis as f64) * 1.9,
            ijv_csa_cm2: 0.70 + (stasis as f64) * 0.55,
            ijv_vmax_cm_s: 16.0 - stasis * 11.5,
            compressibility_ratio: 0.95 - thrombus * 0.65,
            lbnp_pressure_mmhg: if sol.is_multiple_of(5) { -25.0 } else { 0.0 },
            onsd_mm: 4.8 + stasis * 0.8,
            pocus_p_thrombus: 0.05 + thrombus * 0.40,
        };
        let rec = PocusSignatureRecord::from_procedural_bmode(
            (i + 1) as u64,
            1_760_000_000_000 + (i as i64) * 1000,
            sol,
            "ARES-CDR-01",
            "UBERON:0001585",
            &pixels,
            64,
            64,
            ctx,
            128,
        )?;
        backend.upsert_pocus_signature(&rec)?;
        records.push(rec);
    }

    // Query Sol 180 against Sol 1..=180 and also verify persisted reload determinism.
    let query_rec = &records[499];
    let query = PocusSimilarityQuery {
        crew_id: Some("ARES-CDR-01".to_string()),
        anatomical_target_uberon: Some("UBERON:0001585".to_string()),
        sol_min: None,
        sol_max: None,
        top_k: 5,
        query_vector: query_rec.feature_vector.clone(),
        current_ijv_csa_cm2: query_rec.context.ijv_csa_cm2,
        current_tau_w_dyn_cm2: query_rec.context.tau_w_dyn_cm2,
    };

    let t0 = Instant::now();
    let hits_run1 = backend.search_similar_pocus(&query)?;
    let search_elapsed = t0.elapsed();
    assert_eq!(hits_run1.len(), 5);
    assert!(
        search_elapsed < Duration::from_millis(5),
        "HNSW search took {:?}, expected sub-millisecond/low-ms",
        search_elapsed
    );

    // Exact brute-force cosine oracle for Recall@5 verification.
    let mut exact: Vec<(u64, f32)> = records
        .iter()
        .map(|r| {
            let cos: f32 = r
                .feature_vector
                .iter()
                .zip(query.query_vector.iter())
                .map(|(&a, &b)| a * b)
                .sum();
            (r.signature_id, cos)
        })
        .collect();
    exact.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let exact_top5: HashSet<u64> = exact.iter().take(5).map(|&(id, _)| id).collect();
    let hnsw_top5: HashSet<u64> = hits_run1.iter().map(|h| h.signature_id).collect();
    let recall_at_5 = exact_top5.intersection(&hnsw_top5).count() as f64 / 5.0;
    assert!(recall_at_5 >= 0.98, "Recall@5 was {recall_at_5} < 0.98");

    // Reload from persisted `.hnsw.bin` and verify bit-identical neighbor ordering.
    drop(backend);
    let reloaded = ArrowIpcZstdHnswBackend::open(&cfg)?;
    let hits_run2 = reloaded.search_similar_pocus(&query)?;
    let ids1: Vec<u64> = hits_run1.iter().map(|h| h.signature_id).collect();
    let ids2: Vec<u64> = hits_run2.iter().map(|h| h.signature_id).collect();
    assert_eq!(ids1, ids2, "persisted HNSW reload must yield identical ordering");

    // Also verify Sol 180 vs Sol 1..=7 baseline comparison query works.
    let baseline_query = PocusSimilarityQuery {
        sol_min: Some(1),
        sol_max: Some(7),
        ..query
    };
    let baseline_hits = reloaded.search_similar_pocus(&baseline_query)?;
    assert!(!baseline_hits.is_empty());
    assert!(baseline_hits.iter().all(|h| (1..=7).contains(&h.mission_sol)));

    Ok(())
}

#[test]
fn m1_t06_issue_12_provenance_and_gate1_lock_immutability() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let engine = LsahStorageEngine::open(LsahStorageConfig::with_root_dir(tmp.path()))?;

    let pixels = synthesize_procedural_ijv_bmode(64, 64, 0.9, 0.85);
    let ctx = PocusHemodynamicContext {
        tau_w_dyn_cm2: 0.72,
        ijv_csa_cm2: 1.35,
        ijv_vmax_cm_s: 3.4,
        compressibility_ratio: 0.25,
        lbnp_pressure_mmhg: 0.0,
        onsd_mm: 5.7,
        pocus_p_thrombus: 0.45,
    };
    let rec = PocusSignatureRecord::from_procedural_bmode(
        1,
        1_760_000_000_000,
        180,
        "ARES-CDR-01",
        "UBERON:0001585",
        &pixels,
        64,
        64,
        ctx,
        128,
    )?;

    assert_eq!(rec.embedding_origin, PocusEmbeddingOrigin::ProceduralBModeSimulation);
    assert_eq!(rec.validation_status, ModelValidationStatus::IllustrativeUnvalidated);
    assert!(rec.anticoagulant_gate_locked);

    engine.upsert_pocus_signature(&rec)?;

    let query_vec = extract_pocus_feature_vector(&pixels, 64, 64, &ctx, 128)?;
    let hits = engine.search_similar_pocus(&PocusSimilarityQuery {
        crew_id: Some("ARES-CDR-01".to_string()),
        anatomical_target_uberon: None,
        sol_min: None,
        sol_max: None,
        top_k: 1,
        query_vector: query_vec,
        current_ijv_csa_cm2: ctx.ijv_csa_cm2,
        current_tau_w_dyn_cm2: ctx.tau_w_dyn_cm2,
    })?;

    assert_eq!(hits.len(), 1);
    assert!((hits[0].cosine_similarity - 1.0).abs() < 1e-4);
    assert_eq!(hits[0].embedding_origin, PocusEmbeddingOrigin::ProceduralBModeSimulation);
    assert_eq!(hits[0].validation_status, "ILLUSTRATIVE_UNVALIDATED");
    assert!(
        hits[0].advisory_only_gate1_locked,
        "Hard Safety Gate 1 must stay locked even on cosine_similarity == 1.0"
    );
    Ok(())
}

#[test]
fn m1_t07_cold_aead_monotonic_nonce_refuses_reuse_across_restarts() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let key = EphemeralDsnKey::from_bytes([0x5A; 32]);
    let audit = Sha256AuditLogger::new();
    let batch = slots_to_record_batch(&[sample_slot(1, 1, "ARES-CDR-01", false)])?;

    {
        let mut archiver = ColdTierArchiver::open(tmp.path(), 1, 6)?;
        assert_eq!(archiver.next_chunk_seq(), 1);
        let seal1 = archiver.seal_sol_to_cold_archive(
            1,
            std::slice::from_ref(&batch),
            &key,
            &audit,
            None,
            1_760_000_000_000,
        )?;
        assert_eq!(seal1.header.chunk_seq, 1);
    }

    // Re-open from persisted `cold_watermark.json` after simulated restart.
    let mut reopened = ColdTierArchiver::open(tmp.path(), 1, 6)?;
    assert_eq!(reopened.highest_sealed_chunk_seq(), 1);
    assert_eq!(reopened.next_chunk_seq(), 2);

    let seal2 = reopened.seal_sol_to_cold_archive(
        2,
        std::slice::from_ref(&batch),
        &key,
        &audit,
        None,
        1_760_000_010_000,
    )?;
    assert_eq!(seal2.header.chunk_seq, 2);

    let replay_err = reopened.seal_sol_to_cold_archive(
        1,
        &[batch],
        &key,
        &audit,
        Some(1),
        1_760_000_020_000,
    );
    assert!(matches!(
        replay_err,
        Err(LsahStorageError::NonceReuseDetected {
            epoch: 1,
            attempted: 1,
            watermark: 2
        })
    ));
    Ok(())
}

#[test]
fn m1_t08_cold_aead_and_sha256_audit_chain_bidirectional_tamper_detection() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let key = EphemeralDsnKey::from_bytes([0x99; 32]);
    let audit = Sha256AuditLogger::new();
    let batch = slots_to_record_batch(&[sample_slot(1, 1, "ARES-CDR-01", false)])?;

    let mut archiver = ColdTierArchiver::open(tmp.path(), 1, 6)?;
    let seal = archiver.seal_sol_to_cold_archive(
        1,
        &[batch],
        &key,
        &audit,
        None,
        1_760_000_000_000,
    )?;

    // Baseline verification passes.
    let ok = ColdTierArchiver::open_cold_archive_chunk_verified(&seal.chunk_path, &key, &audit)?;
    assert_eq!(ok.header.chunk_seq, 1);

    let orig_bytes = fs::read(&seal.chunk_path)?;
    let records = audit.records()?;

    // (a) Flip 1 bit in ciphertext
    let p_a = tmp.path().join("tamper_a.cold.aead");
    let mut b_a = orig_bytes.clone();
    b_a[COLD_HEADER_BYTES + 2] ^= 0x01;
    fs::write(&p_a, &b_a)?;
    assert!(matches!(
        ColdTierArchiver::open_cold_archive_chunk_verified(&p_a, &key, &audit),
        Err(LsahStorageError::ColdAeadAuthenticationFailed)
    ));

    // (b) Flip 1 bit in nonce_96 (even if header CRC is recomputed, nonce mismatch / AEAD fails)
    let p_b = tmp.path().join("tamper_b.cold.aead");
    let mut b_b = orig_bytes.clone();
    b_b[24] ^= 0x01;
    let new_crc_b = compute_crc32c(&b_b[0..140]);
    b_b[140..144].copy_from_slice(&new_crc_b.to_le_bytes());
    fs::write(&p_b, &b_b)?;
    assert!(ColdTierArchiver::open_cold_archive_chunk_verified(&p_b, &key, &audit).is_err());

    // (c) Flip 1 bit in ColdChunkHeader.audit_chain_hash_ascii (AAD)
    let p_c = tmp.path().join("tamper_c.cold.aead");
    let mut b_c = orig_bytes.clone();
    b_c[44] ^= 0x01;
    let new_crc_c = compute_crc32c(&b_c[0..140]);
    b_c[140..144].copy_from_slice(&new_crc_c.to_le_bytes());
    fs::write(&p_c, &b_c)?;
    assert!(ColdTierArchiver::open_cold_archive_chunk_verified(&p_c, &key, &audit).is_err());

    // (d) Tamper corresponding entry in Sha256AuditLogger records
    let mut tampered_records = records;
    tampered_records[0].event_action = "LSAH_COLD_SEAL|FORGED".to_string();
    assert!(matches!(
        ColdTierArchiver::open_cold_archive_chunk_verified_with_records(
            &seal.chunk_path,
            &key,
            &tampered_records
        ),
        Err(LsahStorageError::AuditTamperDetected(_))
    ));

    Ok(())
}

#[test]
fn m1_t09_nasa_std_3001_v1_3003_privacy_projection_on_warm_and_cold_reads() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let mut cfg = LsahStorageConfig::with_root_dir(tmp.path());
    cfg.warm_batch_size = 5;
    let engine = LsahStorageEngine::open(cfg)?;

    for seq in 1..=5_u64 {
        engine.push_slot(sample_slot(seq, 1, "ARES-CDR-01", true));
    }
    engine.flush_warm_now()?;

    let key = EphemeralDsnKey::from_bytes([0x11; 32]);
    let seal = engine.seal_sol_to_cold(1, &key, DsnPriorityTier::NominalSol, 1_760_000_000_000)?;

    for role in [LsahAccessRole::PeerAstronaut, LsahAccessRole::HabitatCommander] {
        let warm = engine.query_warm_sol_range("ARES-CDR-01", 1, 1, role)?;
        let cold = engine.open_cold_chunk(&seal.chunk_path, &key, role)?;
        for batches in [&warm, &cold.batches] {
            for col_name in ["vocal_jitter_pct", "vocal_shimmer_db", "vocal_hnr_db"] {
                let nulls: usize = batches
                    .iter()
                    .map(|b| b.column_by_name(col_name).map(|c| c.null_count()).unwrap_or(0))
                    .sum();
                assert_eq!(nulls, 5, "{col_name} must be masked for {role:?}");
            }
        }
    }

    let before_audit_len = engine.audit_logger().records()?.len();
    let warm_fs = engine.query_warm_sol_range("ARES-CDR-01", 1, 1, LsahAccessRole::FlightSurgeon)?;
    let cold_fs = engine.open_cold_chunk(&seal.chunk_path, &key, LsahAccessRole::FlightSurgeon)?;
    let after_audit_len = engine.audit_logger().records()?.len();
    assert_eq!(
        after_audit_len,
        before_audit_len + 2,
        "FlightSurgeon vocal biomarker reads must append audit events"
    );

    for batches in [&warm_fs, &cold_fs.batches] {
        let jitter = batches[0]
            .column_by_name("vocal_jitter_pct")
            .ok_or("missing vocal_jitter_pct")?
            .as_primitive::<Float32Type>();
        assert_eq!(jitter.null_count(), 0);
        assert!((jitter.value(0) - 0.62).abs() < 1e-5);
    }

    Ok(())
}

#[test]
fn m1_t10_airgap_uri_guard_blocks_remote_schemes() {
    let forbidden = [
        "s3://bucket/ares",
        "gs://mars/telemetry",
        "az://container/blob",
        "http://cloud.example/api",
        "https://cloud.example/api",
        "db://lancedb-cloud",
        "lance+rest://api.lancedb.com",
        "../../etc/passwd",
    ];

    for bad in forbidden {
        let res = validate_airgapped_lsah_dir(Path::new(bad));
        assert!(
            matches!(res, Err(LsahStorageError::ForbiddenStoragePath(_))),
            "expected ForbiddenStoragePath for '{bad}', got {res:?}"
        );
    }

    assert!(validate_airgapped_lsah_dir(Path::new("./data/ares_storage")).is_ok());
}

#[test]
fn m1_t11_dsn_outbox_priority_ordering_and_ack_compaction() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let outbox = DsnDownlinkOutbox::open(tmp.path())?;

    // Enqueue out of priority order: P2 Nominal -> P1 POCUS -> P0 CriticalAlert
    outbox.enqueue(OutboxDescriptor {
        chunk_seq: 10,
        mission_sol: 1,
        priority_tier: DsnPriorityTier::NominalSol,
        chunk_filename: "sol_0001_chunk_10.lsah.cold.aead".to_string(),
        payload_bytes: 1_000,
        created_unix_ms: 1_000,
        acknowledged: false,
    })?;
    outbox.enqueue(OutboxDescriptor {
        chunk_seq: 11,
        mission_sol: 2,
        priority_tier: DsnPriorityTier::PocusSignature,
        chunk_filename: "sol_0002_chunk_11.lsah.cold.aead".to_string(),
        payload_bytes: 1_000,
        created_unix_ms: 2_000,
        acknowledged: false,
    })?;
    outbox.enqueue(OutboxDescriptor {
        chunk_seq: 12,
        mission_sol: 3,
        priority_tier: DsnPriorityTier::CriticalAlert,
        chunk_filename: "sol_0003_chunk_12.lsah.cold.aead".to_string(),
        payload_bytes: 1_000,
        created_unix_ms: 3_000,
        acknowledged: false,
    })?;

    let drained = outbox.drain_for_dsn_window(3_500);
    let seq_order: Vec<u64> = drained.iter().map(|d| d.chunk_seq).collect();
    assert_eq!(seq_order, vec![12, 11, 10], "must drain P0 -> P1 -> P2");

    assert_eq!(outbox.acknowledge_chunks(&[12, 11])?, 2);
    assert_eq!(outbox.acknowledge_chunks(&[12, 11])?, 0, "ACK must be idempotent");
    assert_eq!(outbox.pending_count(), 1);

    // Reopen from disk and confirm persisted ACK state.
    drop(outbox);
    let reopened = DsnDownlinkOutbox::open(tmp.path())?;
    assert_eq!(reopened.pending_count(), 1);
    let rem = reopened.drain_for_dsn_window(5_000);
    assert_eq!(rem.len(), 1);
    assert_eq!(rem[0].chunk_seq, 10);
    Ok(())
}

#[test]
fn m1_t12_engine_status_pocus_cold_and_fastmcp_600b_budget() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let mut cfg = LsahStorageConfig::with_root_dir(tmp.path());
    cfg.warm_batch_size = 10;
    let engine = LsahStorageEngine::open(cfg)?;

    for seq in 1..=10_u64 {
        engine.push_slot(sample_slot(seq, 1, "ARES-CDR-01", true));
    }
    engine.flush_warm_now()?;

    let pixels = synthesize_procedural_ijv_bmode(64, 64, 0.25, 0.0);
    let ctx = PocusHemodynamicContext::default();
    let rec = PocusSignatureRecord::from_procedural_bmode(
        1,
        1_760_000_000_000,
        1,
        "ARES-CDR-01",
        "UBERON:0001585",
        &pixels,
        64,
        64,
        ctx,
        128,
    )?;
    engine.upsert_pocus_signature(&rec)?;

    let key = EphemeralDsnKey::from_bytes([0x77; 32]);
    engine.seal_sol_to_cold(1, &key, DsnPriorityTier::PocusSignature, 1_760_000_000_000)?;

    let st = engine.status();
    assert_eq!(st.active_backend, "arrow-ipc-zstd-hnsw");
    assert_eq!(st.hot_frames_occupied, 10);
    assert_eq!(st.warm_segments_committed, 1);
    assert_eq!(st.pocus_vectors_indexed, 1);
    assert_eq!(st.cold_highest_chunk_seq, 1);
    assert_eq!(st.dsn_outbox_pending, 1);

    let mcp_status_json = serde_json::to_string(&engine.compact_mcp_status())?;
    assert!(
        mcp_status_json.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
        "FastMCP status exceeded 600 bytes: {} bytes",
        mcp_status_json.len()
    );

    let mcp_pocus = engine.compact_mcp_pocus_search(PocusSimilarityQuery {
        crew_id: Some("ARES-CDR-01".to_string()),
        anatomical_target_uberon: None,
        sol_min: None,
        sol_max: None,
        top_k: 3,
        query_vector: rec.feature_vector,
        current_ijv_csa_cm2: ctx.ijv_csa_cm2,
        current_tau_w_dyn_cm2: ctx.tau_w_dyn_cm2,
    })?;
    assert_eq!(mcp_pocus.matches.len(), 1);
    assert!(mcp_pocus.matches[0].gate1_locked);

    let mcp_pocus_json = serde_json::to_string(&mcp_pocus)?;
    assert!(
        mcp_pocus_json.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
        "FastMCP POCUS search exceeded 600 bytes: {} bytes",
        mcp_pocus_json.len()
    );

    Ok(())
}
