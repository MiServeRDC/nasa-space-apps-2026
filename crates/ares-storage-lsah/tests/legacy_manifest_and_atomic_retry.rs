use ares_storage_lsah::config::{compute_storage_crc32_ieee, LsahStorageConfig};
use ares_storage_lsah::warm_arrow_ipc::ArrowIpcZstdHnswBackend;
use ares_storage_lsah::warm_trait::WarmColumnarVectorBackend;
use arrow_array::cast::AsArray;
use arrow_array::types::UInt16Type;
use arrow_array::{Float32Array, RecordBatch, StringArray, UInt16Array, UInt64Array};
use arrow_ipc::CompressionType;
use arrow_ipc::writer::{FileWriter, IpcWriteOptions};
use arrow_schema::{DataType, Field, Schema};
use std::fs;
use std::sync::Arc;

fn build_test_schema() -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("sequence_id", DataType::UInt64, false),
        Field::new("mission_sol", DataType::UInt16, false),
        Field::new("crew_id", DataType::Utf8, false),
        Field::new("heart_rate_bpm", DataType::Float32, true),
    ]))
}

fn encode_ipc_zstd(batch: &RecordBatch) -> Vec<u8> {
    let mut buf = Vec::new();
    let options = IpcWriteOptions::default()
        .try_with_compression(Some(CompressionType::ZSTD))
        .expect("ipc options");
    let mut writer =
        FileWriter::try_new_with_options(&mut buf, &batch.schema(), options).expect("ipc writer");
    writer.write(batch).expect("write batch");
    writer.finish().expect("finish writer");
    buf
}

#[test]
fn test_legacy_manifest_crc_and_unpartitioned_sol_query() -> Result<(), Box<dyn std::error::Error>> {
    let schema = build_test_schema();

    // Segment contains rows for Sol 1 and Sol 2
    let seq = Arc::new(UInt64Array::from(vec![1, 2]));
    let sol = Arc::new(UInt16Array::from(vec![1, 2]));
    let crew = Arc::new(StringArray::from(vec!["CREW_01", "CREW_01"]));
    let hr = Arc::new(Float32Array::from(vec![Some(72.0), Some(85.0)]));
    let batch = RecordBatch::try_new(schema, vec![seq, sol, crew, hr])?;

    let encoded = encode_ipc_zstd(&batch);
    let seg_crc = compute_storage_crc32_ieee(&encoded);

    let tmp = tempfile::tempdir()?;
    let root = tmp.path().join("ares_storage");
    let warm_dir = root.join("warm").join("arrow_ipc");
    fs::create_dir_all(&warm_dir)?;

    let seg_name = "sol_0001_seg_00000001.arrow.zst";
    fs::write(warm_dir.join(seg_name), &encoded)?;

    // Legacy manifest without min_mission_sol / max_mission_sol
    let payload_str = format!(
        r#"{{"next_segment_id":2,"pocus_dim":128,"segments":[{{"segment_id":1,"mission_sol":1,"relative_path":"{}","row_count":2,"compressed_bytes":{},"crc32c":{},"min_sequence_id":1,"max_sequence_id":2}}]}}"#,
        seg_name,
        encoded.len(),
        seg_crc
    );
    let manifest_crc = compute_storage_crc32_ieee(payload_str.as_bytes());
    let manifest_json = format!(
        r#"{{"payload":{},"crc32c":{}}}"#,
        payload_str, manifest_crc
    );

    let manifest_path = root.join("MANIFEST.lsah.json");
    fs::write(&manifest_path, manifest_json)?;

    let cfg = LsahStorageConfig::with_root_dir(&root);
    let (backend, report) = ArrowIpcZstdHnswBackend::open_with_report(&cfg)?;

    assert_eq!(backend.committed_segments().len(), 1);
    assert_eq!(report.valid_segments_recovered, 1);
    assert!(report.quarantined_corrupt_segments.is_empty());

    // Legacy unpartitioned segment has mission_sol = 1, but contains data for Sol 2.
    // Querying sol_start: 2, sol_end: 2 must NOT prune the legacy segment,
    // and must return the row for Sol 2!
    let sol2_batches = backend.read_telemetry_sol_range("CREW_01", 2, 2)?;
    assert_eq!(sol2_batches.len(), 1);
    assert_eq!(sol2_batches[0].num_rows(), 1);

    let sol_col = sol2_batches[0]
        .column_by_name("mission_sol")
        .unwrap()
        .as_primitive::<UInt16Type>();
    assert_eq!(sol_col.value(0), 2);

    Ok(())
}

#[test]
fn test_atomic_multi_sol_batch_partitioning() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = tempfile::tempdir()?;
    let root = tmp.path().join("ares_storage");
    let cfg = LsahStorageConfig::with_root_dir(&root);
    let backend = ArrowIpcZstdHnswBackend::open(&cfg)?;

    let schema = build_test_schema();
    // 2 samples across 2 distinct sols
    let seq = Arc::new(UInt64Array::from(vec![101, 102]));
    let sol = Arc::new(UInt16Array::from(vec![1, 2]));
    let crew = Arc::new(StringArray::from(vec!["CREW_02", "CREW_02"]));
    let hr = Arc::new(Float32Array::from(vec![Some(70.0), Some(75.0)]));
    let batch = RecordBatch::try_new(schema, vec![seq, sol, crew, hr])?;

    backend.append_telemetry_batch(&batch)?;

    assert_eq!(backend.committed_segments().len(), 2);

    let sol1 = backend.read_telemetry_sol_range("CREW_02", 1, 1)?;
    assert_eq!(sol1.len(), 1);
    assert_eq!(sol1[0].num_rows(), 1);

    let sol2 = backend.read_telemetry_sol_range("CREW_02", 2, 2)?;
    assert_eq!(sol2.len(), 1);
    assert_eq!(sol2[0].num_rows(), 1);

    let both = backend.read_telemetry_sol_range("CREW_02", 1, 2)?;
    let total_rows: usize = both.iter().map(|b| b.num_rows()).sum();
    assert_eq!(total_rows, 2, "must contain exactly 2 rows for 2 samples, no duplicate partitions");

    Ok(())
}

#[test]
fn test_partial_sol_bounds_independent_filtering() -> Result<(), Box<dyn std::error::Error>> {
    let schema = build_test_schema();

    // Segment with sol = 5
    let seq = Arc::new(UInt64Array::from(vec![501]));
    let sol = Arc::new(UInt16Array::from(vec![5]));
    let crew = Arc::new(StringArray::from(vec!["CREW_03"]));
    let hr = Arc::new(Float32Array::from(vec![Some(72.0)]));
    let batch = RecordBatch::try_new(schema, vec![seq, sol, crew, hr])?;

    let encoded = encode_ipc_zstd(&batch);
    let seg_crc = compute_storage_crc32_ieee(&encoded);

    let tmp = tempfile::tempdir()?;
    let root = tmp.path().join("ares_storage");
    let warm_dir = root.join("warm").join("arrow_ipc");
    fs::create_dir_all(&warm_dir)?;

    let seg_name = "sol_0005_seg_00000001.arrow.zst";
    fs::write(warm_dir.join(seg_name), &encoded)?;

    // Segment has min_mission_sol = Some(5), but max_mission_sol is omitted (None)
    let payload_str = format!(
        r#"{{"next_segment_id":2,"pocus_dim":128,"segments":[{{"segment_id":1,"mission_sol":5,"min_mission_sol":5,"relative_path":"{}","row_count":1,"compressed_bytes":{},"crc32c":{},"min_sequence_id":501,"max_sequence_id":501}}]}}"#,
        seg_name,
        encoded.len(),
        seg_crc
    );
    let manifest_crc = compute_storage_crc32_ieee(payload_str.as_bytes());
    let manifest_json = format!(r#"{{"payload":{},"crc32c":{}}}"#, payload_str, manifest_crc);

    let manifest_path = root.join("MANIFEST.lsah.json");
    fs::write(&manifest_path, manifest_json)?;

    let cfg = LsahStorageConfig::with_root_dir(&root);
    let (backend, _) = ArrowIpcZstdHnswBackend::open_with_report(&cfg)?;

    // Querying Sol 1..=4: with independent bound check, min_s (5) <= 4 is false.
    // The segment must be pruned!
    let out_of_range = backend.read_telemetry_sol_range("CREW_03", 1, 4)?;
    assert!(out_of_range.is_empty(), "segment with min_sol 5 must not match range 1..=4");

    // Querying Sol 5..=6: min_s (5) <= 6 is true, max_s is None (true). Must match.
    let in_range = backend.read_telemetry_sol_range("CREW_03", 5, 6)?;
    assert_eq!(in_range.len(), 1);
    assert_eq!(in_range[0].num_rows(), 1);

    Ok(())
}

#[test]
fn test_atomic_multi_sol_retry_after_write_failure() -> Result<(), Box<dyn std::error::Error>> {
    let tmp = tempfile::tempdir()?;
    let root = tmp.path().join("ares_storage");
    let cfg = LsahStorageConfig::with_root_dir(&root);
    let backend = ArrowIpcZstdHnswBackend::open(&cfg)?;

    let warm_dir = root.join("warm").join("arrow_ipc");
    let schema = build_test_schema();

    // 1. Commit baseline Sol 1 batch
    let seq_base = Arc::new(UInt64Array::from(vec![1]));
    let sol_base = Arc::new(UInt16Array::from(vec![1]));
    let crew_base = Arc::new(StringArray::from(vec!["CREW_04"]));
    let hr_base = Arc::new(Float32Array::from(vec![Some(65.0)]));
    let batch_base = RecordBatch::try_new(schema.clone(), vec![seq_base, sol_base, crew_base, hr_base])?;
    backend.append_telemetry_batch(&batch_base)?;
    assert_eq!(backend.committed_segments().len(), 1);

    // 2. Multi-sol batch spanning Sol 2 and Sol 3
    let seq = Arc::new(UInt64Array::from(vec![2, 3]));
    let sol = Arc::new(UInt16Array::from(vec![2, 3]));
    let crew = Arc::new(StringArray::from(vec!["CREW_04", "CREW_04"]));
    let hr = Arc::new(Float32Array::from(vec![Some(70.0), Some(75.0)]));
    let multi_batch = RecordBatch::try_new(schema, vec![seq, sol, crew, hr])?;

    // Fault injection: create a directory named `sol_0003_seg_00000003.arrow.zst`
    // so partition 1 (Sol 2, seg 2) writes, and partition 2 (Sol 3, seg 3) fails during atomic_write_bytes.
    let fault_blocker = warm_dir.join("sol_0003_seg_00000003.arrow.zst");
    fs::create_dir_all(&fault_blocker)?;

    let attempt = backend.append_telemetry_batch(&multi_batch);
    assert!(attempt.is_err(), "append_telemetry_batch must fail on injected collision");

    // Verify rollback: partition 1 file must be unlinked from disk
    let part1_path = warm_dir.join("sol_0002_seg_00000002.arrow.zst");
    assert!(!part1_path.exists(), "rolled back partition 1 file must not remain on disk");

    // Manifest must still have only 1 baseline segment
    assert_eq!(backend.committed_segments().len(), 1);

    // Sol 2 and Sol 3 queries must return empty
    let uncommitted = backend.read_telemetry_sol_range("CREW_04", 2, 3)?;
    assert!(uncommitted.is_empty(), "uncommitted failed write must return zero records");

    // 3. Clear fault and retry
    fs::remove_dir(&fault_blocker)?;
    backend.append_telemetry_batch(&multi_batch)?;

    // After retry, exactly 3 segments committed: baseline (seg 1), retry sol 2 (seg 2), retry sol 3 (seg 3)
    assert_eq!(backend.committed_segments().len(), 3);

    let committed_all = backend.read_telemetry_sol_range("CREW_04", 1, 3)?;
    let total_rows: usize = committed_all.iter().map(|b| b.num_rows()).sum();
    assert_eq!(total_rows, 3, "retried batch must commit cleanly without duplicate rows or gaps");

    Ok(())
}
