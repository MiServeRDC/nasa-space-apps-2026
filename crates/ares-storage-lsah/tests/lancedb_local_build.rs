#![cfg(feature = "lancedb-warm")]

use ares_storage_lsah::config::LsahStorageConfig;
use ares_storage_lsah::hot_ring::{HotLsahSlot, VALID_HR_BPM};
use ares_storage_lsah::pocus_signature::{PocusHemodynamicContext, PocusSignatureRecord};
use ares_storage_lsah::schema::slots_to_record_batch;
use ares_storage_lsah::warm_lancedb::backend::LanceDbEmbeddedWarmBackend;
use ares_storage_lsah::warm_trait::WarmColumnarVectorBackend;
use arrow_array::RecordBatch;
use futures::TryStreamExt;
use lancedb::query::ExecutableQuery;
use std::path::Path;

// Reading through the SDK deliberately does not use the adapter's currently
// unfinished read/search methods. This qualifies the patched dependency and the
// real adapter write path, without claiming that optional adapter is complete.
async fn persisted_rows(dir: &Path) -> Result<Vec<RecordBatch>, Box<dyn std::error::Error>> {
    let db = lancedb::connect(dir.to_string_lossy().as_ref())
        .execute()
        .await?;
    let table = db.open_table("lsah_telemetry_frames").execute().await?;
    Ok(table.query().execute().await?.try_collect().await?)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_only_adapter_writes_and_reopens_actual_nullable_telemetry()
-> Result<(), Box<dyn std::error::Error>> {
    let temp = tempfile::tempdir()?;
    let config = LsahStorageConfig::with_root_dir(temp.path().join("local-store"));
    let backend = LanceDbEmbeddedWarmBackend::open_async(&config).await?;
    let dir = backend.local_dir().to_path_buf();
    let mut slot = HotLsahSlot::zeroed();
    slot.sequence_id = 1;
    slot.set_crew_id("ARES-TEST-01");
    slot.hr_bpm = 72.0;
    slot.validity_mask = VALID_HR_BPM;
    slot.update_crc32c();
    let batch = slots_to_record_batch(&[slot])?;
    let backend = tokio::task::spawn_blocking(move || {
        let meta = backend.append_telemetry_batch(&batch)?;
        assert_eq!(meta.row_count, 1);
        assert_eq!(meta.min_sequence_id, 1);
        Ok::<_, ares_storage_lsah::error::LsahStorageError>(backend)
    })
    .await??;
    drop(backend);
    let rows = persisted_rows(&dir).await?;
    assert_eq!(rows.iter().map(RecordBatch::num_rows).sum::<usize>(), 1);
    for batch in &rows {
        assert_eq!(
            batch
                .column_by_name("rmssd_ms")
                .expect("HRV column")
                .null_count(),
            batch.num_rows()
        );
        assert_eq!(
            batch
                .column_by_name("hr_bpm")
                .expect("HR column")
                .null_count(),
            0
        );
    }
    // Reopening and appending must use the existing table rather than recreate it.
    let reopened = LanceDbEmbeddedWarmBackend::open_async(&config).await?;
    slot.sequence_id = 2;
    slot.update_crc32c();
    let second = slots_to_record_batch(&[slot])?;
    tokio::task::spawn_blocking(move || reopened.append_telemetry_batch(&second)).await??;
    let rows = persisted_rows(&dir).await?;
    assert_eq!(rows.iter().map(RecordBatch::num_rows).sum::<usize>(), 2);
    assert!(temp.path().join("local-store/warm/lancedb").is_dir());
    Ok(())
}

#[tokio::test]
async fn local_only_adapter_refuses_remote_storage_roots_before_connecting() {
    for remote in [
        "s3://ares",
        "gs://ares",
        "db://ares",
        "https://example.com/ares",
    ] {
        let config = LsahStorageConfig::with_root_dir(remote);
        let result = LanceDbEmbeddedWarmBackend::open_async(&config).await;
        assert!(
            matches!(
                result,
                Err(ares_storage_lsah::error::LsahStorageError::ForbiddenStoragePath(_))
            ),
            "{remote} must be refused"
        );
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn local_only_pocus_creation_and_append_persist_simulation_provenance()
-> Result<(), Box<dyn std::error::Error>> {
    let temp = tempfile::tempdir()?;
    let config = LsahStorageConfig::with_root_dir(temp.path().join("pocus-store"));
    let backend = std::sync::Arc::new(LanceDbEmbeddedWarmBackend::open_async(&config).await?);
    let dir = backend.local_dir().to_path_buf();
    let pixels = (0_u8..64).collect::<Vec<_>>();
    for signature_id in [1, 2] {
        let record = PocusSignatureRecord::from_procedural_bmode(
            signature_id,
            1000,
            1,
            "ARES-TEST-01",
            "UBERON:0001586",
            &pixels,
            8,
            8,
            PocusHemodynamicContext::default(),
            config.pocus_embedding_dim,
        )?;
        let writer = std::sync::Arc::clone(&backend);
        assert_eq!(
            tokio::task::spawn_blocking(move || writer.upsert_pocus_signature(&record)).await??,
            signature_id
        );
    }
    drop(backend);
    let db = lancedb::connect(dir.to_string_lossy().as_ref())
        .execute()
        .await?;
    let table = db.open_table("lsah_pocus_signatures").execute().await?;
    assert_eq!(table.count_rows(None).await?, 2);
    let rows: Vec<RecordBatch> = table.query().execute().await?.try_collect().await?;
    for batch in rows {
        let status = batch
            .column_by_name("validation_status")
            .expect("status")
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()
            .expect("string status");
        let origin = batch
            .column_by_name("embedding_origin")
            .expect("origin")
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()
            .expect("string origin");
        for i in 0..batch.num_rows() {
            assert_eq!(status.value(i), "ILLUSTRATIVE_UNVALIDATED");
            assert_eq!(origin.value(i), "PROCEDURAL_BMODE_SIMULATION");
        }
    }
    Ok(())
}
