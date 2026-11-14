//! `ares-engine`: the dual-transport orchestrator of ARES-Health.
//!
//! ```bash
//! ares-engine serve                 # axum 20 Hz WebSocket on 127.0.0.1:8080
//! ares-engine mcp                   # FastMCP JSON-RPC 2.0 on stdio
//! ares-engine dual                  # both, over one shared MissionState
//! ares-engine serve --addr 127.0.0.1:9090
//! ares-engine serve --replay bidmc_01   # pure BIDMC terrestrial replay
//! ```
//!
//! Logs always go to `stderr`, never to `stdout`: in `mcp` and `dual` mode
//! `stdout` is the JSON-RPC pipe and a single stray line would corrupt it.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use ares_server_cli::mcp_stdio;
use ares_server_cli::mission::MissionState;
use ares_server_cli::replay::BidmcRecord;
use ares_server_cli::ws_server::{AppState, serve_until};
use clap::{Parser, Subcommand};
use tokio::sync::RwLock;
use tracing_subscriber::EnvFilter;

/// Default crew member the engine monitors (`contracts/telemetry_schema.json`).
const DEFAULT_ASTRONAUT: &str = "ASTRO-01";

/// Scenario identifier used when no BIDMC record is replayed.
const DEFAULT_SOURCE_RECORD: &str = "SIM-WHATIF-CONSOLE";

#[derive(Debug, Parser)]
#[command(
    name = "ares-engine",
    about = "ARES-Health deterministic MedOps engine: axum 20 Hz WebSocket + stdio FastMCP",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    /// Loopback address for the axum server. Non-loopback addresses are refused.
    #[arg(long, default_value = "127.0.0.1:8080", global = true)]
    addr: SocketAddr,

    #[arg(long, default_value = DEFAULT_ASTRONAUT, global = true)]
    astronaut: String,

    #[arg(long, default_value = DEFAULT_SOURCE_RECORD, global = true)]
    source_record: String,

    /// Replay a verified BIDMC v1.0.0 record (`bidmc_01`, `bidmc_02`,
    /// `bidmc_03`) instead of running the scenario generator alone. The stream
    /// then starts as a pure terrestrial replay and `--astronaut` and
    /// `--source-record` are taken from the record itself.
    #[arg(long, global = true)]
    replay: Option<String>,

    /// Directory holding the BIDMC CSVs and their `MANIFEST.json`.
    #[arg(long, default_value = "data/bidmc", global = true)]
    data_dir: PathBuf,
}

#[derive(Debug, Clone, Copy, Subcommand)]
enum Command {
    /// Run the axum WebSocket/REST server only (default).
    Serve,
    /// Run the FastMCP stdio server only.
    Mcp,
    /// Run both transports over one shared mission state.
    Dual,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    let mission = Arc::new(RwLock::new(match &cli.replay {
        Some(record_id) => {
            let record = BidmcRecord::load(&cli.data_dir, record_id)?;
            tracing::info!(
                record = record.record_id(),
                subject = record.astronaut_id(),
                samples = record.len(),
                "BIDMC replay loaded, SHA-256 verified against MANIFEST.json"
            );
            MissionState::with_recorded_source(record)?
        }
        None => MissionState::new(cli.astronaut.clone(), cli.source_record.clone())?,
    }));

    match cli.command.unwrap_or(Command::Serve) {
        Command::Serve => {
            serve_until(cli.addr, AppState::new(mission), shutdown_signal()).await?;
        }
        Command::Mcp => {
            mcp_stdio::serve_stdio(mission).await?;
        }
        Command::Dual => {
            let http = tokio::spawn(serve_until(
                cli.addr,
                AppState::new(Arc::clone(&mission)),
                shutdown_signal(),
            ));
            // stdin EOF ends the MCP transport, which ends the process.
            let mcp_result = mcp_stdio::serve_stdio(mission).await;
            http.abort();
            mcp_result?;
        }
    }
    Ok(())
}

/// Resolves on Ctrl-C so the WebSocket clients are closed cleanly.
async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!(%error, "failed to listen for ctrl-c, shutdown disabled");
        std::future::pending::<()>().await;
    }
}
