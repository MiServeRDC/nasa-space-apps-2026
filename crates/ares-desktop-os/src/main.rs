#![forbid(unsafe_code)]

//! Entrypoint binario per `crates/ares-desktop-os` (`ARES-MedOS` Workstation Shell).

use anyhow::{Context, Result};
use ares_desktop_os::{
    AresMedOsWorkstationShell, DesktopShellConfig, resolve_medos_data_dir,
};
use ares_server_cli::ws_server::build_axum_router;
use clap::{Parser, ValueEnum};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum DesktopMode {
    /// Starts the in-process 8-crate workstation runtime (1 Hz Timestral + 20 Hz Seqlock + 127.0.0.1:8080 HTTP/WS mirror).
    Desktop,
    /// Starts the native desktop shell configuration (`medos-primary`, 128B raw IPC bridge + loopback mirror).
    NativeWindow,
    /// Initializes all 8 crates, replays BIDMC + Hubris wearable SEU packet, verifies 128B Seqlock frames and all 8 FastMCP tools.
    DesktopSmokeTest,
}

#[derive(Debug, Parser)]
#[command(
    name = "ares-desktop-os",
    version,
    about = "ARES-MedOS Pure-Rust Workstation OS Shell (Phases 21-32)"
)]
pub struct DesktopCliArgs {
    #[arg(long, value_enum, default_value_t = DesktopMode::Desktop)]
    pub mode: DesktopMode,

    /// Shorthand to select `native-window` mode cleanly from scripts.
    #[arg(long, default_value_t = false)]
    pub native: bool,

    #[arg(long)]
    pub data_dir: Option<PathBuf>,

    #[arg(long, default_value = "127.0.0.1:8080")]
    pub bind: String,

    #[arg(long, default_value_t = 20)]
    pub telemetry_hz: u32,

    /// Enable explicit local telemetry persistence (not used by smoke tests).
    #[arg(long)]
    pub storage_dir: Option<PathBuf>,
}

fn spawn_workstation_loops(rt: &tokio::runtime::Runtime, shell: Arc<AresMedOsWorkstationShell>, bind_addr: String) -> Vec<tokio::task::JoinHandle<()>> {
    let period_ms = (1000 / u64::from(shell.config.telemetry_hz.max(1))).max(10);
    let tick_shell = Arc::clone(&shell);
    let ticker = rt.spawn(async move {
        let frame_period = Duration::from_millis(period_ms);
        let mut interval = tokio::time::interval_at(
            tokio::time::Instant::now() + frame_period,
            frame_period,
        );
        loop {
            interval.tick().await;
            let _ = tick_shell.advance_tick(frame_period);
        }
    });

    let timestral_shell = Arc::clone(&shell);
    let forecaster = rt.spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            let worker = Arc::clone(&timestral_shell);
            let _ = tokio::task::spawn_blocking(move || {
                let _ = worker.mission.run_1hz_timestral_step();
            })
            .await;
        }
    });

    let server = rt.spawn(async move {
        let app = build_axum_router(shell.mission.clone());
        match tokio::net::TcpListener::bind(&bind_addr).await {
            Ok(listener) => {
                shell.ws_mirror_bound.store(true, Ordering::Relaxed);
                tracing::info!(
                    bind = %bind_addr,
                    "ARES-MedOS Workstation Shell active with 128B Seqlock + HTTP/WS loopback mirror"
                );
                if let Err(err) = axum::serve(listener, app).await {
                    tracing::error!(error = %err, "Axum loopback mirror runtime exited");
                }
            }
            Err(err) => {
                tracing::warn!(
                    bind = %bind_addr,
                    error = %err,
                    "loopback mirror port already bound; continuing with in-process Seqlock IPC"
                );
            }
        }
    });
    vec![ticker, forecaster, server]
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .init();

    let args = DesktopCliArgs::parse();
    let effective_mode = if args.native {
        DesktopMode::NativeWindow
    } else {
        args.mode
    };
    anyhow::ensure!(args.storage_dir.is_none() || effective_mode != DesktopMode::DesktopSmokeTest,
        "--storage-dir is not supported in desktop-smoke-test mode");
    let data_dir = resolve_medos_data_dir(args.data_dir.as_deref())
        .context("failed locating BIDMC data directory")?;

    let config = DesktopShellConfig {
        data_dir,
        enable_loopback_ws_mirror: true,
        loopback_bind_addr: args.bind.clone(),
        telemetry_hz: args.telemetry_hz.max(1),
        air_gapped_csp_enforced: true,
    };

    let shell = Arc::new(
        AresMedOsWorkstationShell::initialize(config)
            .context("failed to initialize AresMedOsWorkstationShell")?,
    );

    match effective_mode {
        DesktopMode::DesktopSmokeTest => {
            let report = shell
                .run_desktop_smoke_test()
                .context("ARES-MedOS desktop smoke test failed")?;
            let json = serde_json::to_string_pretty(&report)
                .context("failed to serialize smoke test report")?;
            println!("{json}");
            Ok(())
        }
        DesktopMode::Desktop => {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .context("failed building Tokio multi-thread runtime")?;
            if let Some(path) = args.storage_dir {
                rt.block_on(shell.mission.enable_storage_at(&path))
                    .context("failed opening local telemetry storage")?;
            }
            let tasks = spawn_workstation_loops(&rt, Arc::clone(&shell), args.bind);
            let result = rt.block_on(async {
                tokio::signal::ctrl_c().await.context("failed waiting for shutdown signal")
            });
            shell.mission.request_shutdown();
            rt.block_on(async {
                for task in tasks { task.abort(); let _ = task.await; }
                shell.mission.shutdown_storage().await
            }).context("failed draining local telemetry storage")?;
            result
        }
        DesktopMode::NativeWindow => {
            #[cfg(feature = "tauri-native")]
            {
                let spec = ares_desktop_os::ipc_bridge::tauri_commands::verify_native_shell_ready(&shell)
                    .context("native workstation shell verification failed")?;
                tracing::info!(
                    window = spec.label,
                    width = spec.width,
                    height = spec.height,
                    commands = spec.registered_commands,
                    air_gapped_csp = spec.air_gapped_csp,
                    "ARES-MedOS native desktop window bridge initialized"
                );
            }
            #[cfg(not(feature = "tauri-native"))]
            {
                tracing::warn!(
                    "native-window requested without `--features tauri-native`; running headless 128B Seqlock bridge + loopback mirror"
                );
            }

            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .context("failed building Tokio multi-thread runtime")?;
            if let Some(path) = args.storage_dir {
                rt.block_on(shell.mission.enable_storage_at(&path))
                    .context("failed opening local telemetry storage")?;
            }
            let tasks = spawn_workstation_loops(&rt, Arc::clone(&shell), args.bind);
            let result = rt.block_on(async {
                tokio::signal::ctrl_c().await.context("failed waiting for shutdown signal")
            });
            shell.mission.request_shutdown();
            rt.block_on(async {
                for task in tasks { task.abort(); let _ = task.await; }
                shell.mission.shutdown_storage().await
            }).context("failed draining local telemetry storage")?;
            result
        }
    }
}
