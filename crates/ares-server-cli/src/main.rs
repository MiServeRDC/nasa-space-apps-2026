//! Entrypoint CLI per `ares-server-cli` (Dual-Transport: Axum 20 Hz WebSocket + FastMCP stdio).

use anyhow::{Context, Result};
use ares_server_cli::mcp_stdio::run_mcp_stdio_loop;
use ares_server_cli::ws_server::{SharedMissionState, build_axum_router};
use clap::{Parser, ValueEnum};
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum ServerMode {
    /// Avvia sia il server Axum HTTP/WebSocket (20 Hz) sia il loop FastMCP su `stdio`.
    WsAndMcp,
    /// Avvia solo il server Axum HTTP/WebSocket su `127.0.0.1:8080`.
    WsOnly,
    /// Avvia solo il server FastMCP JSON-RPC 2.0 su `stdio`.
    McpOnly,
    /// Esegue un ciclo deterministico di smoke-test e termina con codice 0.
    SmokeTest,
}

#[derive(Debug, Parser)]
#[command(
    name = "ares-server-cli",
    version,
    about = "ARES-Health Dual-Transport Orchestrator (20 Hz Axum WebSocket + FastMCP stdio)"
)]
pub struct CliArgs {
    /// Modalita operativa del server.
    #[arg(long, value_enum, default_value_t = ServerMode::WsAndMcp)]
    pub mode: ServerMode,

    /// Indirizzo di bind per il server HTTP/WebSocket (Zero-Trust loopback di default).
    #[arg(long, default_value = "127.0.0.1:8080")]
    pub bind: String,

    /// Percorso della directory contenente i file CSV PhysioNet BIDMC v1.0.0.
    #[arg(long, default_value = "data/bidmc")]
    pub data_dir: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Invariante mcp-builder: tutti i log diagnostici vanno rigorosamente su stderr
    // per non corrompere mai lo stream JSON-RPC 2.0 su stdout.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .init();

    let args = CliArgs::parse();
    let state = SharedMissionState::from_data_dir(&args.data_dir)
        .with_context(|| format!("impossibile inizializzare i dataset da {:?}", args.data_dir))?;

    match args.mode {
        ServerMode::SmokeTest => {
            let pkt = state
                .advance_tick(Duration::from_millis(50))
                .context("errore durante il calcolo del tick di smoke-test")?;
            tracing::info!(
                astronaut_id = %pkt.astronaut_id,
                source_record_id = %pkt.source_record_id,
                mri_pct = pkt.nqs_stl.mri_pct,
                playbook_id = %pkt.active_playbook.playbook_id,
                "ARES-Health smoke test completato con successo"
            );
            Ok(())
        }
        ServerMode::McpOnly => tokio::task::spawn_blocking(move || run_mcp_stdio_loop(state))
            .await
            .context("join error sul task stdio FastMCP")?
            .context("errore I/O nel loop stdio FastMCP"),
        ServerMode::WsOnly | ServerMode::WsAndMcp => {
            let ticker_state = state.clone();
            tokio::spawn(async move {
                let frame_period = Duration::from_millis(50);
                let mut interval = tokio::time::interval_at(
                    tokio::time::Instant::now() + frame_period,
                    frame_period,
                );
                loop {
                    interval.tick().await;
                    let _ = ticker_state.advance_tick(frame_period);
                }
            });

            if args.mode == ServerMode::WsAndMcp {
                let mcp_state = state.clone();
                tokio::task::spawn_blocking(move || {
                    let _ = run_mcp_stdio_loop(mcp_state);
                });
            }

            let app = build_axum_router(state);
            let listener = tokio::net::TcpListener::bind(&args.bind)
                .await
                .with_context(|| format!("impossibile eseguire il bind su {}", args.bind))?;
            tracing::info!(bind = %args.bind, "Server Axum 20 Hz attivo");
            axum::serve(listener, app)
                .await
                .context("errore runtime nel server Axum")
        }
    }
}
