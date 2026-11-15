use ares_storage_lsah::{
    ArrowIpcZstdHnswBackend, HotLsahSlot, LsahStorageConfig, LsahStorageEngine, LsahStorageError,
    PocusSignatureRecord, PocusSimilarityHit, PocusSimilarityQuery, WarmColumnarVectorBackend,
    WarmSegmentMeta,
};
use arrow_array::RecordBatch;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tempfile::TempDir;

struct FailingBackend {
    inner: ArrowIpcZstdHnswBackend,
    fail: AtomicBool,
}
impl WarmColumnarVectorBackend for FailingBackend {
    fn backend_name(&self) -> &'static str {
        "fault-injection"
    }
    fn append_telemetry_batch(
        &self,
        batch: &RecordBatch,
    ) -> Result<WarmSegmentMeta, LsahStorageError> {
        if self.fail.load(Ordering::Acquire) {
            return Err(std::io::Error::other("injected disk failure").into());
        }
        self.inner.append_telemetry_batch(batch)
    }
    fn read_telemetry_sol_range(
        &self,
        crew: &str,
        start: u16,
        end: u16,
    ) -> Result<Vec<RecordBatch>, LsahStorageError> {
        self.inner.read_telemetry_sol_range(crew, start, end)
    }
    fn upsert_pocus_signature(&self, r: &PocusSignatureRecord) -> Result<u64, LsahStorageError> {
        self.inner.upsert_pocus_signature(r)
    }
    fn search_similar_pocus(
        &self,
        q: &PocusSimilarityQuery,
    ) -> Result<Vec<PocusSimilarityHit>, LsahStorageError> {
        self.inner.search_similar_pocus(q)
    }
    fn flush_and_sync(&self) -> Result<(), LsahStorageError> {
        self.inner.flush_and_sync()
    }
    fn warm_stats(&self) -> (usize, u64, usize) {
        self.inner.warm_stats()
    }
}
fn slot(seq: u64) -> HotLsahSlot {
    let mut s = HotLsahSlot::zeroed();
    s.sequence_id = seq;
    s.mission_sol = 1;
    s.set_crew_id("ASTRO-01");
    s
}
fn setup() -> Result<(TempDir, Arc<FailingBackend>, LsahStorageEngine), Box<dyn std::error::Error>>
{
    let dir = TempDir::new()?;
    let mut cfg = LsahStorageConfig::with_root_dir(dir.path());
    cfg.warm_batch_size = 4;
    cfg.warm_flush_interval_ms = 10;
    let backend = Arc::new(FailingBackend {
        inner: ArrowIpcZstdHnswBackend::open_with_report(&cfg)?.0,
        fail: AtomicBool::new(true),
    });
    let engine = LsahStorageEngine::open_with_backend(cfg, backend.clone())?;
    Ok((dir, backend, engine))
}
#[test]
fn synchronous_failure_retains_rows_for_retry() -> Result<(), Box<dyn std::error::Error>> {
    let (_dir, b, e) = setup()?;
    for n in 1..=3 {
        e.push_slot(slot(n));
    }
    assert!(e.flush_warm_now().is_err());
    assert_eq!(e.status().warm_pending_rows, 3);
    b.fail.store(false, Ordering::Release);
    e.flush_warm_now()?;
    assert_eq!(e.status().warm_pending_rows, 0);
    assert_eq!(
        b.inner
            .read_telemetry_sol_range("ASTRO-01", 1, 1)?
            .iter()
            .map(RecordBatch::num_rows)
            .sum::<usize>(),
        3
    );
    Ok(())
}
#[tokio::test]
async fn background_retries_and_flushes_partial_batches() -> Result<(), Box<dyn std::error::Error>>
{
    let (_dir, b, e) = setup()?;
    e.start_background_flusher();
    for n in 1..=3 {
        e.push_slot(slot(n));
    }
    tokio::time::timeout(Duration::from_secs(2), async {
        while e.status().warm_flush_failures == 0 {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
    })
    .await?;
    assert_eq!(e.status().warm_pending_rows, 3);
    b.fail.store(false, Ordering::Release);
    tokio::time::timeout(Duration::from_secs(2), async {
        while e.status().warm_pending_rows != 0 {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
    })
    .await?;
    e.stop_background_flusher().await?;
    assert_eq!(
        b.inner
            .read_telemetry_sol_range("ASTRO-01", 1, 1)?
            .iter()
            .map(RecordBatch::num_rows)
            .sum::<usize>(),
        3
    );
    Ok(())
}
#[tokio::test]
async fn failed_shutdown_reports_pending_rows_and_allows_recovery()
-> Result<(), Box<dyn std::error::Error>> {
    let (_dir, b, e) = setup()?;
    e.start_background_flusher();
    e.push_slot(slot(1));
    let result = tokio::time::timeout(Duration::from_secs(2), e.stop_background_flusher()).await?;
    assert!(matches!(
        result,
        Err(LsahStorageError::FlushIncomplete {
            pending_rows: 1,
            ..
        })
    ));
    b.fail.store(false, Ordering::Release);
    e.flush_warm_now()?;
    assert_eq!(e.status().warm_pending_rows, 0);
    Ok(())
}
#[test]
fn manifest_failure_does_not_duplicate_a_retried_segment() -> Result<(), Box<dyn std::error::Error>>
{
    let dir = TempDir::new()?;
    let cfg = LsahStorageConfig::with_root_dir(dir.path());
    let backend = ArrowIpcZstdHnswBackend::open_with_report(&cfg)?.0;
    let path = dir.path().join("MANIFEST.lsah.json");
    std::fs::create_dir(&path)?;
    let batch = ares_storage_lsah::slots_to_record_batch(&[slot(1)])?;
    assert!(backend.append_telemetry_batch(&batch).is_err());
    assert_eq!(backend.warm_stats().0, 0);
    std::fs::remove_dir(&path)?;
    backend.append_telemetry_batch(&batch)?;
    drop(backend);
    let (backend, _) = ArrowIpcZstdHnswBackend::open_with_report(&cfg)?;
    assert_eq!(
        backend
            .read_telemetry_sol_range("ASTRO-01", 1, 1)?
            .iter()
            .map(RecordBatch::num_rows)
            .sum::<usize>(),
        1
    );
    Ok(())
}

#[tokio::test]
async fn shutdown_interrupts_a_long_retry_backoff() -> Result<(), Box<dyn std::error::Error>> {
    for recover in [false, true] {
        let (_dir, b, _engine) = setup()?;
        let staging = Arc::new(ares_storage_lsah::WarmStagingSwapBuffer::new(4));
        let handle = ares_storage_lsah::AsyncWarmBatchFlusherHandle::spawn(
            staging.clone(),
            b.clone(),
            Duration::from_secs(3600),
        );
        for n in 1..=4 {
            staging.push_for_warm_flush(&slot(n));
        }
        tokio::time::timeout(Duration::from_secs(2), async {
            while handle.failures() == 0 {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
        })
        .await?;
        if recover {
            b.fail.store(false, Ordering::Release);
        }
        let result =
            tokio::time::timeout(Duration::from_secs(2), handle.shutdown(&staging)).await?;
        if recover {
            result?;
            assert_eq!(staging.pending_rows(), 0);
            assert_eq!(
                b.inner
                    .read_telemetry_sol_range("ASTRO-01", 1, 1)?
                    .iter()
                    .map(RecordBatch::num_rows)
                    .sum::<usize>(),
                4
            );
        } else {
            assert!(matches!(
                result,
                Err(LsahStorageError::FlushIncomplete {
                    pending_rows: 4,
                    ..
                })
            ));
        }
    }
    Ok(())
}
