use ares_server_cli::ws_server::SharedMissionState;
use ares_storage_lsah::{ArrowIpcZstdHnswBackend, LsahStorageConfig, WarmColumnarVectorBackend};
use std::{path::Path, time::Duration};

fn data_dir() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc")
}

#[tokio::test]
async fn runtime_records_drains_and_resumes_sequences_after_reopen()
-> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let cfg = LsahStorageConfig::with_root_dir(dir.path().join("nested/store"));
    let state = SharedMissionState::from_data_dir(&data_dir())?;
    let crew = state
        .latest_snapshot()
        .expect("initial snapshot")
        .astronaut_id;
    assert!(state.storage_status().is_none());
    state.enable_storage(cfg.clone()).await?;
    let second = SharedMissionState::from_data_dir(&data_dir())?;
    assert!(
        second.enable_storage(cfg.clone()).await.is_err(),
        "a second writer must be rejected before recovery mutates files"
    );
    drop(second);
    for _ in 0..7 {
        assert!(state.advance_tick(Duration::from_millis(50)).is_some());
    }
    state.shutdown_storage().await?;
    assert_eq!(state.storage_status().map(|s| s.warm_pending_rows), Some(0));
    drop(state);
    let backend = ArrowIpcZstdHnswBackend::open_with_report(&cfg)?.0;
    assert_eq!(backend.max_sequence_id(), 7);
    let rows = backend.read_telemetry_sol_range(&crew, 1, 1)?;
    assert_eq!(rows.iter().map(|b| b.num_rows()).sum::<usize>(), 7);
    // Numeric-only replay must retain null HRV through persistence.
    assert!(rows.iter().all(|b| {
        b.column_by_name("rmssd_ms")
            .is_some_and(|c| c.null_count() == b.num_rows())
    }));
    drop(backend);
    let state = SharedMissionState::from_data_dir(&data_dir())?;
    state.enable_storage(cfg.clone()).await?;
    for _ in 0..3 {
        state.advance_tick(Duration::from_millis(50));
    }
    state.shutdown_storage().await?;
    drop(state);
    let backend = ArrowIpcZstdHnswBackend::open_with_report(&cfg)?.0;
    assert_eq!(backend.max_sequence_id(), 10);
    assert_eq!(
        backend
            .read_telemetry_sol_range(&crew, 1, 1)?
            .iter()
            .map(|b| b.num_rows())
            .sum::<usize>(),
        10
    );
    Ok(())
}
