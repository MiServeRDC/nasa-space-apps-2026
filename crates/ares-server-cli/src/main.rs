#![forbid(unsafe_code)]

//! CLI entrypoint for `ares-server-cli` (Dual-Transport: Axum 20 Hz WebSocket + FastMCP stdio + Timestral 1 Hz + ARES-DatasetGraph).

use anyhow::{Context, Result, ensure};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_server_cli::anomaly_eval::{Split, evaluate_split, load_records, render_markdown};
use ares_server_cli::mcp_stdio::run_mcp_stdio_loop;
use ares_server_cli::frontend::with_frontend;
use ares_server_cli::ws_server::{SharedMissionState, build_axum_router};
use clap::{Parser, ValueEnum};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum ServerMode {
    /// Starts both the Axum HTTP/WebSocket server (20 Hz) + Timestral 1 Hz worker and the FastMCP loop on `stdio`.
    WsAndMcp,
    /// Starts only the Axum HTTP/WebSocket server (loopback by default) and the 1 Hz forecasting worker.
    WsOnly,
    /// Starts only the FastMCP JSON-RPC 2.0 server on `stdio`.
    McpOnly,
    /// Runs the full replay (7 crates + Timestral + HyperGraph), generates and exports the 24-dataset graph to disk, and verifies all files.
    SmokeTest,
    /// Builds `AresUnifiedDatasetGraph` (24 datasets + BIDMC slice) and exports the 4 knowledge graph files to disk.
    BuildGraph,
    /// Evaluates the vitals anomaly detector with injected events on the BIDMC records and writes the Markdown report.
    EvalAnomaly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum EvalSplitArg {
    Dev,
    HeldOut,
    All,
}

#[derive(Debug, Parser)]
#[command(
    name = "ares-server-cli",
    version,
    about = "ARES-Health Dual-Transport Orchestrator (20 Hz Axum WebSocket + FastMCP stdio + Timestral + ARES-DatasetGraph)"
)]
pub struct CliArgs {
    /// Server operational mode.
    #[arg(long, value_enum, default_value_t = ServerMode::WsAndMcp)]
    pub mode: ServerMode,

    /// Bind address for the HTTP/WebSocket server (Zero-Trust loopback by default).
    #[arg(long, default_value = "127.0.0.1:8080")]
    pub bind: String,

    /// Serve a built cockpit directory from the same HTTP/WebSocket process.
    #[arg(long)]
    pub frontend_dir: Option<PathBuf>,

    /// Path to the directory containing the PhysioNet BIDMC v1.0.0 CSV files.
    #[arg(long, default_value = "data/bidmc")]
    pub data_dir: PathBuf,

    /// Path to the repository root for exporting `data/knowledge_graph/` and `graphify-out/`.
    #[arg(long)]
    pub repo_root: Option<PathBuf>,

    /// Directory with the additional BIDMC records (04-53) used only by `--mode eval-anomaly`.
    #[arg(long, default_value = "data/bidmc_eval")]
    pub eval_dir: PathBuf,

    /// Subset of records to evaluate with `--mode eval-anomaly`.
    #[arg(long, value_enum, default_value_t = EvalSplitArg::All)]
    pub eval_split: EvalSplitArg,

    /// Output Markdown file for `--mode eval-anomaly` (prints to stdout if absent).
    #[arg(long)]
    pub eval_out: Option<PathBuf>,

    /// Enable local telemetry recording in this directory (off when omitted).
    #[arg(long)]
    pub storage_dir: Option<PathBuf>,

    /// Primary telemetry input source mode (recorded-replay or live-wearable-hardware).
    #[arg(long, value_enum, default_value_t = ares_server_cli::ws_server::TelemetrySourceMode::RecordedReplay)]
    pub source: ares_server_cli::ws_server::TelemetrySourceMode,
}

fn resolve_repo_root(explicit: Option<&Path>, data_dir: &Path) -> PathBuf {
    if let Some(root) = explicit {
        return root.to_path_buf();
    }
    if let Some(parent) = data_dir.parent()
        && parent.file_name().and_then(|n| n.to_str()) == Some("data")
        && let Some(grandparent) = parent.parent()
    {
        if grandparent.as_os_str().is_empty() {
            return PathBuf::from(".");
        }
        return grandparent.to_path_buf();
    }
    PathBuf::from(".")
}

async fn wait_for_shutdown() -> std::io::Result<()> {
    #[cfg(unix)]
    {
        let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! {
            result = tokio::signal::ctrl_c() => result,
            _ = terminate.recv() => Ok(()),
        }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await
}

fn export_and_verify_graph_bundle(graph: &AresUnifiedDatasetGraph, repo_root: &Path) -> Result<()> {
    let stats = graph
        .export_graphify_bundle(repo_root)
        .context("cannot export the knowledge graph to disk")?;

    let expected_paths = [
        repo_root
            .join("data")
            .join("knowledge_graph")
            .join("ares_dataset_graph.json"),
        repo_root
            .join("data")
            .join("knowledge_graph")
            .join("GRAPH_REPORT.md"),
        repo_root.join("graphify-out").join("graph.json"),
        repo_root.join("graphify-out").join("GRAPH_REPORT.md"),
    ];

    let mut sizes = Vec::with_capacity(expected_paths.len());
    for path in &expected_paths {
        let meta = std::fs::metadata(path).with_context(|| {
            format!("expected graph file not found on disk: {}", path.display())
        })?;
        ensure!(
            meta.len() > 0,
            "empty graph file on disk: {}",
            path.display()
        );
        sizes.push((path.display().to_string(), meta.len()));
    }

    tracing::info!(
        nodes = stats.node_count,
        edges = stats.edge_count,
        datasets = stats.dataset_count,
        communities = stats.community_count,
        slices = stats.time_window_slice_count,
        god_nodes = ?stats.god_node_ids,
        files = ?sizes,
        "ARES-DatasetGraph exported and verified on disk"
    );
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    // mcp-builder invariant: all diagnostic logs must go strictly to stderr
    // to never corrupt the JSON-RPC 2.0 stream on stdout.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .init();

    let args = CliArgs::parse();
    ensure!(args.frontend_dir.is_none() || matches!(args.mode, ServerMode::WsOnly | ServerMode::WsAndMcp),
        "--frontend-dir requires ws-only or ws-and-mcp mode");
    ensure!(args.storage_dir.is_none() || matches!(args.mode, ServerMode::WsOnly | ServerMode::WsAndMcp),
        "--storage-dir requires ws-only or ws-and-mcp mode");
    let repo_root = resolve_repo_root(args.repo_root.as_deref(), &args.data_dir);

    if args.mode == ServerMode::BuildGraph {
        let bidmc_opt = args.data_dir.is_dir().then_some(args.data_dir.as_path());
        let graph = AresUnifiedDatasetGraph::build_with_bidmc_dir(bidmc_opt)
            .context("failed building AresUnifiedDatasetGraph")?;
        export_and_verify_graph_bundle(&graph, &repo_root)?;
        return Ok(());
    }

    if args.mode == ServerMode::EvalAnomaly {
        let records = load_records(&[args.data_dir.as_path(), args.eval_dir.as_path()])
            .context("cannot load BIDMC records for evaluation")?;
        ensure!(!records.is_empty(), "no BIDMC records found");
        let splits: &[Split] = match args.eval_split {
            EvalSplitArg::Dev => &[Split::Development],
            EvalSplitArg::HeldOut => &[Split::HeldOut],
            EvalSplitArg::All => &[Split::HeldOut, Split::Development],
        };
        let reports: Vec<_> = splits.iter().map(|s| evaluate_split(&records, *s)).collect();
        let markdown = render_markdown(&reports);
        match &args.eval_out {
            Some(path) => {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)
                        .with_context(|| format!("cannot create {parent:?}"))?;
                }
                std::fs::write(path, &markdown)
                    .with_context(|| format!("cannot write {path:?}"))?;
            }
            None => print!("{markdown}"),
        }
        return Ok(());
    }

    let state = SharedMissionState::from_data_dir(&args.data_dir)
        .with_context(|| format!("cannot initialize datasets from {:?}", args.data_dir))?;
    state.set_source_mode(args.source);

    match args.mode {
        ServerMode::BuildGraph | ServerMode::EvalAnomaly => unreachable!(),
        ServerMode::SmokeTest => {
            let mut last_pkt = None;
            for _ in 0..20 {
                last_pkt = Some(
                    state
                        .advance_tick(Duration::from_millis(50))
                        .context("failed during the 20 Hz smoke-test tick")?,
                );
            }
            let q_snap = state
                .run_1hz_timestral_step()
                .context("failed during 1 Hz Timestral smoke-test inference")?;
            let pkt = last_pkt.context("no TelemetryPacket generated during smoke test")?;
            let ctx = state
                .fastmcp_context()
                .context("FastMCP context unavailable during smoke test")?;

            export_and_verify_graph_bundle(&state.dataset_graph, &repo_root)?;

            tracing::info!(
                astronaut_id = %pkt.astronaut_id,
                source_record_id = %pkt.source_record_id,
                mri_pct = ?pkt.nqs_stl.mri_pct,
                playbook_id = %pkt.active_playbook.playbook_id,
                timestral_gate = ?q_snap.confidence_state,
                pessimistic_ttv_q05_h = ?q_snap.pessimistic_ttv_q05_hours,
                hottest_uberon = %ctx.heatmap.hottest_region.uberon_curie(),
                biokg_clause = %ctx.grounding.normative_clause.official_code(),
                "ARES-Health smoke test (7 core crates + Timestral + ARES-HyperGraph + ARES-DatasetGraph) completed successfully"
            );
            Ok(())
        }
        ServerMode::McpOnly => tokio::task::spawn_blocking(move || run_mcp_stdio_loop(state))
            .await
            .context("join error in FastMCP stdio task")?
            .context("I/O error in FastMCP stdio loop"),
        ServerMode::WsOnly | ServerMode::WsAndMcp => {
            if let Some(path) = args.storage_dir {
                state.enable_storage(ares_storage_lsah::LsahStorageConfig::with_root_dir(path)).await
                    .context("failed opening local telemetry storage")?;
            }
            let ticker_state = state.clone();
            let ticker = tokio::spawn(async move {
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

            let timestral_state = state.clone();
            let forecaster = tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(1));
                loop {
                    interval.tick().await;
                    let worker_state = timestral_state.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        let _ = worker_state.run_1hz_timestral_step();
                    })
                    .await;
                }
            });

            if args.mode == ServerMode::WsAndMcp {
                let mcp_state = state.clone();
                std::thread::Builder::new().name("ares-mcp-stdio".into()).spawn(move || {
                    let _ = run_mcp_stdio_loop(mcp_state);
                }).context("failed starting MCP stdio thread")?;
            }

            let api = build_axum_router(Arc::clone(&state));
            let app = match args.frontend_dir.as_deref() {
                Some(dir) => with_frontend(api, dir).context("invalid frontend directory")?,
                None => api,
            };
            let listener = tokio::net::TcpListener::bind(&args.bind)
                .await
                .with_context(|| format!("cannot bind to {}", args.bind))?;
            tracing::info!(bind = %args.bind, "Axum 20 Hz server and 1 Hz forecasting worker active");
            let shutdown_state = Arc::clone(&state);
            let result = axum::serve(listener, app).with_graceful_shutdown(async move {
                if let Err(error) = wait_for_shutdown().await {
                    tracing::error!(%error, "failed waiting for shutdown signal");
                }
                shutdown_state.request_shutdown();
            }).await;
            ticker.abort(); forecaster.abort();
            let _ = ticker.await; let _ = forecaster.await;
            state.shutdown_storage().await.context("failed draining local telemetry storage")?;
            result.context("Axum server runtime error")
        }
    }
}
