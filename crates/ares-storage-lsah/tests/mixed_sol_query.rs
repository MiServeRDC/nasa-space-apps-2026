use ares_storage_lsah::config::{
    compute_storage_crc32_ieee, compute_storage_crc32c_castagnoli, verify_segment_checksum,
    LsahStorageConfig,
};
use ares_storage_lsah::hot_ring::{
    HotLsahSlot, VALID_HR_BPM, VALID_PULSE_BPM, VALID_RESP_RPM, VALID_SPO2_PCT,
};
use ares_storage_lsah::slots_to_record_batch;
use ares_storage_lsah::warm_trait::WarmColumnarVectorBackend;
use ares_storage_lsah::{ArrowIpcZstdHnswBackend, LsahAccessRole, LsahStorageEngine};
use tempfile::TempDir;

fn make_test_slot(seq: u64, sol: u16, crew_id: &str, hr: f64) -> HotLsahSlot {
    let mut s = HotLsahSlot::zeroed();
    s.sequence_id = seq;
    s.timestamp_unix_ms = 1_760_000_000_000 + (seq as i64) * 1_000;
    s.mission_sol = sol;
    s.set_crew_id(crew_id);
    s.hr_bpm = hr;
    s.pulse_bpm = hr - 0.5;
    s.resp_rpm = 14.0;
    s.spo2_pct = 98.5;
    s.validity_mask = VALID_HR_BPM | VALID_PULSE_BPM | VALID_RESP_RPM | VALID_SPO2_PCT;
    s.update_crc32c();
    s
}

#[test]
fn test_storage_crc_ieee_and_castagnoli_known_vectors() {
    let test_bytes = b"123456789";

    // Known standard test vector for 123456789:
    // IEEE 802.3 CRC-32: 0xCBF43926
    let ieee = compute_storage_crc32_ieee(test_bytes);
    assert_eq!(
        ieee, 0xCBF4_3926,
        "IEEE 802.3 CRC-32 mismatch for b'123456789'"
    );

    // Castagnoli CRC-32C: 0xE3069283
    let castagnoli = compute_storage_crc32c_castagnoli(test_bytes);
    assert_eq!(
        castagnoli, 0xE306_9283,
        "Castagnoli CRC-32C mismatch for b'123456789'"
    );

    // verify_segment_checksum strictly enforces IEEE 802.3 CRC-32 storage policy
    assert!(
        verify_segment_checksum(test_bytes, ieee),
        "verify_segment_checksum must accept valid IEEE CRC-32"
    );
    assert!(
        !verify_segment_checksum(test_bytes, castagnoli),
        "verify_segment_checksum must reject non-IEEE polynomial (Castagnoli is reserved for wire frames)"
    );

    // Corrupted checksum must be rejected
    assert!(
        !verify_segment_checksum(test_bytes, 0xDEAD_BEEF),
        "verify_segment_checksum must reject corrupted checksum"
    );
}

#[test]
fn test_mixed_sol_batch_partitioning_and_query_isolation() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let cfg = LsahStorageConfig::with_root_dir(tmp.path());
    let backend = ArrowIpcZstdHnswBackend::open(&cfg)?;

    // Create a multi-sol batch with mixed crew and sols:
    // Row 0: Sol 1, ARES-CDR-01
    // Row 1: Sol 2, ARES-CDR-01
    // Row 2: Sol 2, ARES-EV1-02
    // Row 3: Sol 3, ARES-CDR-01
    let slots = vec![
        make_test_slot(1, 1, "ARES-CDR-01", 70.0),
        make_test_slot(2, 2, "ARES-CDR-01", 75.0),
        make_test_slot(3, 2, "ARES-EV1-02", 80.0),
        make_test_slot(4, 3, "ARES-CDR-01", 85.0),
    ];

    let multi_sol_batch = slots_to_record_batch(&slots)?;
    assert_eq!(multi_sol_batch.num_rows(), 4);

    // Append batch to backend - append_telemetry_batch internally partitions by mission_sol
    let _last_meta = backend.append_telemetry_batch(&multi_sol_batch)?;
    let segments = backend.committed_segments();
    assert_eq!(segments.len(), 3, "Batch spanning 3 sols must produce 3 segments");
    let total_rows: usize = segments.iter().map(|s| s.row_count).sum();
    assert_eq!(total_rows, 4, "Total rows across all segments must equal 4");

    // 1. Query Sol 1 for ARES-CDR-01 -> exactly 1 row
    let sol1_cdr = backend.read_telemetry_sol_range("ARES-CDR-01", 1, 1)?;
    let count1: usize = sol1_cdr.iter().map(|b| b.num_rows()).sum();
    assert_eq!(count1, 1, "Querying Sol 1 for CDR-01 must return exactly 1 row");

    // 2. Query Sol 2 for ARES-CDR-01 -> exactly 1 row
    let sol2_cdr = backend.read_telemetry_sol_range("ARES-CDR-01", 2, 2)?;
    let count2: usize = sol2_cdr.iter().map(|b| b.num_rows()).sum();
    assert_eq!(count2, 1, "Querying Sol 2 for CDR-01 must return exactly 1 row");

    // 3. Query Sol 2 for ARES-EV1-02 -> exactly 1 row
    let sol2_ev1 = backend.read_telemetry_sol_range("ARES-EV1-02", 2, 2)?;
    let count_ev1: usize = sol2_ev1.iter().map(|b| b.num_rows()).sum();
    assert_eq!(count_ev1, 1, "Querying Sol 2 for EV1-02 must return exactly 1 row");

    // 4. Query Sol 1..=2 for ARES-CDR-01 -> exactly 2 rows
    let sol1_2_cdr = backend.read_telemetry_sol_range("ARES-CDR-01", 1, 2)?;
    let count1_2: usize = sol1_2_cdr.iter().map(|b| b.num_rows()).sum();
    assert_eq!(count1_2, 2, "Querying Sol 1..=2 for CDR-01 must return exactly 2 rows");

    // 5. Query Sol 4 (non-existent) -> exactly 0 rows
    let sol4_cdr = backend.read_telemetry_sol_range("ARES-CDR-01", 4, 4)?;
    let count4: usize = sol4_cdr.iter().map(|b| b.num_rows()).sum();
    assert_eq!(count4, 0, "Querying non-existent Sol 4 must return 0 rows");

    // 6. Query Sol 1..=3 for ARES-CDR-01 -> exactly 3 rows
    let sol1_3_cdr = backend.read_telemetry_sol_range("ARES-CDR-01", 1, 3)?;
    let count1_3: usize = sol1_3_cdr.iter().map(|b| b.num_rows()).sum();
    assert_eq!(count1_3, 3, "Querying Sol 1..=3 for CDR-01 must return exactly 3 rows");

    Ok(())
}

#[test]
fn test_mixed_sol_engine_push_and_query_flow() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = TempDir::new()?;
    let mut cfg = LsahStorageConfig::with_root_dir(tmp.path());
    cfg.warm_batch_size = 2; // small batch size to trigger flushes
    let engine = LsahStorageEngine::open(cfg)?;

    // Push two slots belonging to Sol 1 and Sol 2 in the same flush window
    engine.push_slot(make_test_slot(1, 1, "ARES-CDR-01", 68.0));
    engine.push_slot(make_test_slot(2, 2, "ARES-CDR-01", 72.0));
    engine.flush_warm_now()?;

    // Query engine at FlightSurgeon role for Sol 1
    let batches_sol1 = engine.query_warm_sol_range("ARES-CDR-01", 1, 1, LsahAccessRole::FlightSurgeon)?;
    let rows_sol1: usize = batches_sol1.iter().map(|b| b.num_rows()).sum();
    assert_eq!(rows_sol1, 1, "Engine warm query for Sol 1 must return exactly 1 row");

    // Query engine at FlightSurgeon role for Sol 2
    let batches_sol2 = engine.query_warm_sol_range("ARES-CDR-01", 2, 2, LsahAccessRole::FlightSurgeon)?;
    let rows_sol2: usize = batches_sol2.iter().map(|b| b.num_rows()).sum();
    assert_eq!(rows_sol2, 1, "Engine warm query for Sol 2 must return exactly 1 row");

    Ok(())
}
