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
    wake_shutdown: Arc<tokio::sync::Notify>,
    flushed_batches: Arc<AtomicU64>,
    flushed_rows: Arc<AtomicU64>,
    failures: Arc<AtomicU64>,
    task: Option<JoinHandle<Result<(), LsahStorageError>>>,
}

impl AsyncWarmBatchFlusherHandle {
    /// Spawns the background flusher loop on the active Tokio runtime.
    pub fn spawn(
        staging: Arc<WarmStagingSwapBuffer>,
        backend: Arc<dyn WarmColumnarVectorBackend>,
        flush_interval: Duration,
    ) -> Self {
        let shutdown = Arc::new(AtomicBool::new(false));
        let wake_shutdown = Arc::new(tokio::sync::Notify::new());
        let shutdown_signal = Arc::clone(&wake_shutdown);
        let flushed_batches = Arc::new(AtomicU64::new(0));
        let flushed_rows = Arc::new(AtomicU64::new(0));
        let failures = Arc::new(AtomicU64::new(0));

        let shutdown_bg = Arc::clone(&shutdown);
        let batches_bg = Arc::clone(&flushed_batches);
        let rows_bg = Arc::clone(&flushed_rows);
        let failures_bg = Arc::clone(&failures);
        let notifier = staging.notifier();

        let task = tokio::spawn(async move {
            let mut local_buf = Vec::with_capacity(staging.batch_size());
            loop {
                let deadline_reached = tokio::select! {
                    _ = notifier.notified() => false,
                    _ = tokio::time::sleep(flush_interval) => true,
                };

                let force_partial = deadline_reached || shutdown_bg.load(Ordering::Acquire);
                loop {
                    let count = staging.take_ready_batch(force_partial, &mut local_buf);
                    if count == 0 {
                        break;
                    }
                    let slots = std::mem::take(&mut local_buf);
                    let backend_ref = Arc::clone(&backend);
                    let res = tokio::task::spawn_blocking(move || {
                        let result = slots_to_record_batch(&slots)
                            .and_then(|batch| backend_ref.append_telemetry_batch(&batch));
                        (slots, result)
                    })
                    .await;

                    let result = match res {
                        Ok((slots, result)) => {
                            local_buf = slots;
                            result
                        }
                        Err(error) => Err(LsahStorageError::Backend(error.to_string())),
                    };
                    staging.finish_batch(result.is_ok());
                    match result {
                        Ok(meta) => {
                            batches_bg.fetch_add(1, Ordering::Relaxed);
                            rows_bg.fetch_add(meta.row_count as u64, Ordering::Relaxed);
                        }
                        Err(error) => {
                            failures_bg.fetch_add(1, Ordering::Relaxed);
                            if shutdown_bg.load(Ordering::Acquire) {
                                return Err(LsahStorageError::FlushIncomplete {
                                    pending_rows: staging.pending_rows(),
                                    reason: error.to_string(),
                                });
                            }
                            // A bounded retained bank prevents unbounded RAM growth.
                            // Rate-limit failures even if producers keep notifying.
                            tokio::select! {
                                _ = tokio::time::sleep(flush_interval) => {},
                                _ = shutdown_signal.notified() => {},
                            }
                            break;
                        }
                    }
                }

                if shutdown_bg.load(Ordering::Acquire) && staging.pending_rows() == 0 {
                    return tokio::task::spawn_blocking(move || backend.flush_and_sync())
                        .await
                        .map_err(|error| LsahStorageError::Backend(error.to_string()))?;
                }
            }
        });

        Self {
            shutdown,
            wake_shutdown,
            flushed_batches,
            flushed_rows,
            failures,
            task: Some(task),
        }
    }

    pub fn flushed_batches(&self) -> u64 {
        self.flushed_batches.load(Ordering::Relaxed)
    }

    pub fn flushed_rows(&self) -> u64 {
        self.flushed_rows.load(Ordering::Relaxed)
    }

    pub fn failures(&self) -> u64 {
        self.failures.load(Ordering::Relaxed)
    }

    /// Signals graceful shutdown, wakes the flusher, and awaits final drain completion.
    pub async fn shutdown(
        mut self,
        staging: &WarmStagingSwapBuffer,
    ) -> Result<(), LsahStorageError> {
        self.shutdown.store(true, Ordering::Release);
        self.wake_shutdown.notify_one();
        staging.notifier().notify_one();
        if let Some(handle) = self.task.take() {
            return handle
                .await
                .map_err(|error| LsahStorageError::Backend(error.to_string()))?;
        }
        Ok(())
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
        let result =
            slots_to_record_batch(&buf).and_then(|batch| backend.append_telemetry_batch(&batch));
        staging.finish_batch(result.is_ok());
        last_meta = Some(result?);
    }
    Ok(last_meta)
}
