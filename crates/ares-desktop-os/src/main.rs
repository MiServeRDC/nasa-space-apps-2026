//! Entrypoint binario per `crates/ares-desktop-os` (`ARES-MedOS` Workstation Shell).

use anyhow::{Context, Result};
use ares_desktop_os::{AresMedOsWorkstationShell, DesktopShellConfig};
use ares_server_cli::ws_server::build_axum_router;
use clap::{Parser, ValueEnum};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum DesktopMode {
    /// Starts the in-process 8-crate workstation runtime (1 Hz Timestral + 20 Hz Seqlock + 127.0.0.1:8080 HTTP/WS mirror).
    Desktop,
    /// Initializes all 8 crates, replays BIDMC + Hubris wearable SEU packet, verifies 128B Seqlock frames and all 8 FastMCP tools.
    DesktopSmokeTest,
}

#[derive(Debug, Parser)]
#[command(
    name = "ares-desktop-os",
    version,
    about = "ARES-MedOS Pure-Rust Workstation OS Shell (Phases 21-24 / Block J)"
)]
pub struct DesktopCliArgs {
    #[arg(long, value_enum, default_value_t = DesktopMode::Desktop)]
    pub mode: DesktopMode,

    #[arg(long, default_value = "data/bidmc")]
    pub data_dir: PathBuf,

    #[arg(long, default_value = "127.0.0.1:8080")]
    pub bind: String,

    #[arg(long, default_value_t = 20)]
    pub telemetry_hz: u32,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .init();

    let args = DesktopCliArgs::parse();
    let config = DesktopShellConfig {
        data_dir: args.data_dir,
        enable_loopback_ws_mirror: true,
        loopback_bind_addr: args.bind.clone(),
        telemetry_hz: args.telemetry_hz.max(1),
        air_gapped_csp_enforced: true,
    };

    let shell = AresMedOsWorkstationShell::initialize(config)
        .context("failed to initialize AresMedOsWorkstationShell")?;

    match args.mode {
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
            let period_ms = (1000 / u64::from(shell.config.telemetry_hz.max(1))).max(10);
            let tick_shell = shell.clone();
            tokio::spawn(async move {
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

            let timestral_shell = shell.clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(1));
                loop {
                    interval.tick().await;
                    let worker = timestral_shell.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        let _ = worker.mission.run_1hz_timestral_step();
                    })
                    .await;
                }
            });

            let app = build_axum_router(shell.mission.clone());
            match tokio::net::TcpListener::bind(&args.bind).await {
                Ok(listener) => {
                    shell.ws_mirror_bound.store(true, Ordering::Relaxed);
                    tracing::info!(
                        bind = %args.bind,
                        "ARES-MedOS Workstation Shell active with 128B Seqlock + HTTP/WS loopback mirror"
                    );
                    axum::serve(listener, app)
                        .await
                        .context("Axum loopback mirror runtime failure")?;
                }
                Err(err) => {
                    tracing::warn!(
                        bind = %args.bind,
                        error = %err,
                        "loopback mirror port already bound; continuing with in-process Seqlock IPC"
                    );
                    tokio::signal::ctrl_c()
                        .await
                        .context("failed waiting for shutdown signal")?;
                }
            }
            Ok(())
        }
    }
}
