use crate::error::LsahStorageError;
use crate::hot_ring::{HotLsahSlot, WarmStagingSwapBuffer};
use crate::schema::slots_to_record_batch;
use crate::warm_trait::{WarmColumnarVectorBackend, WarmSegmentMeta};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tokio::task::JoinHandle;

/// Asynchronous background flusher draining `WarmStagingSwapBuffer` into `WarmColumnarVectorBackend`
/// inside `tokio::task::spawn_blocking`, keeping the 20 Hz ingestion loop completely non-blocking.
pub struct AsyncWarmBatchFlusherHandle {
    shutdown: Arc<AtomicBool>,
    flushed_batches: Arc<AtomicU64>,
    flushed_rows: Arc<AtomicU64>,
    task: Option<JoinHandle<()>>,
}

impl AsyncWarmBatchFlusherHandle {
    /// Spawns the background flusher loop on the active Tokio runtime.
    pub fn spawn(
        staging: Arc<WarmStagingSwapBuffer>,
        backend: Arc<dyn WarmColumnarVectorBackend>,
        flush_interval: Duration,
    ) -> Self {
        let shutdown = Arc::new(AtomicBool::new(false));
        let flushed_batches = Arc::new(AtomicU64::new(0));
        let flushed_rows = Arc::new(AtomicU64::new(0));

        let shutdown_bg = Arc::clone(&shutdown);
        let batches_bg = Arc::clone(&flushed_batches);
        let rows_bg = Arc::clone(&flushed_rows);
        let notifier = staging.notifier();

        let task = tokio::spawn(async move {
            let mut local_buf = Vec::with_capacity(staging.batch_size());
            loop {
                tokio::select! {
                    _ = notifier.notified() => {}
                    _ = tokio::time::sleep(flush_interval) => {}
                }

                let force_partial = shutdown_bg.load(Ordering::Acquire);
                loop {
                    let count = staging.take_ready_batch(force_partial, &mut local_buf);
                    if count == 0 {
                        break;
                    }
                    let slots = std::mem::take(&mut local_buf);
                    let backend_ref = Arc::clone(&backend);
                    let res = tokio::task::spawn_blocking(move || {
                        let batch = slots_to_record_batch(&slots)?;
                        backend_ref.append_telemetry_batch(&batch)
                    })
                    .await;

                    if let Ok(Ok(meta)) = res {
                        batches_bg.fetch_add(1, Ordering::Relaxed);
                        rows_bg.fetch_add(meta.row_count as u64, Ordering::Relaxed);
                    }
                    local_buf = Vec::with_capacity(staging.batch_size());
                }

                if shutdown_bg.load(Ordering::Acquire) {
                    break;
                }
            }
        });

        Self {
            shutdown,
            flushed_batches,
            flushed_rows,
            task: Some(task),
        }
    }

    pub fn flushed_batches(&self) -> u64 {
        self.flushed_batches.load(Ordering::Relaxed)
    }

    pub fn flushed_rows(&self) -> u64 {
        self.flushed_rows.load(Ordering::Relaxed)
    }

    /// Signals graceful shutdown, wakes the flusher, and awaits final drain completion.
    pub async fn shutdown(mut self, staging: &WarmStagingSwapBuffer) {
        self.shutdown.store(true, Ordering::Release);
        staging.notifier().notify_one();
        if let Some(handle) = self.task.take() {
            let _ = handle.await;
        }
    }
}

/// Synchronously drains any staged slots into `backend` (used by `flush_warm_now` and tests).
pub fn flush_staging_synchronously(
    staging: &WarmStagingSwapBuffer,
    backend: &dyn WarmColumnarVectorBackend,
    force_partial: bool,
) -> Result<Option<WarmSegmentMeta>, LsahStorageError> {
    let mut buf: Vec<HotLsahSlot> = Vec::with_capacity(staging.batch_size());
    let mut last_meta = None;
    loop {
        let count = staging.take_ready_batch(force_partial, &mut buf);
        if count == 0 {
            break;
        }
        let batch = slots_to_record_batch(&buf)?;
        last_meta = Some(backend.append_telemetry_batch(&batch)?);
    }
    Ok(last_meta)
}
