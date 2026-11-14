#![forbid(unsafe_code)]

//! Entrypoint CLI per `ares-server-cli` (Dual-Transport: Axum 20 Hz WebSocket + FastMCP stdio + Timestral 1 Hz + ARES-DatasetGraph).

use anyhow::{Context, Result, ensure};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_server_cli::anomaly_eval::{Split, evaluate_split, load_records, render_markdown};
use ares_server_cli::mcp_stdio::run_mcp_stdio_loop;
use ares_server_cli::ws_server::{SharedMissionState, build_axum_router};
use clap::{Parser, ValueEnum};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum ServerMode {
    /// Avvia sia il server Axum HTTP/WebSocket (20 Hz) + worker Timestral 1 Hz sia il loop FastMCP su `stdio`.
    WsAndMcp,
    /// Avvia solo il server Axum HTTP/WebSocket su `127.0.0.1:8080` + worker Timestral 1 Hz.
    WsOnly,
    /// Avvia solo il server FastMCP JSON-RPC 2.0 su `stdio`.
    McpOnly,
    /// Esegue replay completo (7 crate + Timestral + HyperGraph), genera ed esporta il grafo a 24 dataset su disco e verifica tutti i file.
    SmokeTest,
    /// Costruisce `AresUnifiedDatasetGraph` (24 dataset + slice BIDMC) ed esporta i 4 file del knowledge graph su disco.
    BuildGraph,
    /// Valuta il detector di anomalie sui vitali con eventi iniettati sui record BIDMC e scrive il report Markdown.
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
    /// Modalita operativa del server.
    #[arg(long, value_enum, default_value_t = ServerMode::WsAndMcp)]
    pub mode: ServerMode,

    /// Indirizzo di bind per il server HTTP/WebSocket (Zero-Trust loopback di default).
    #[arg(long, default_value = "127.0.0.1:8080")]
    pub bind: String,

    /// Percorso della directory contenente i file CSV PhysioNet BIDMC v1.0.0.
    #[arg(long, default_value = "data/bidmc")]
    pub data_dir: PathBuf,

    /// Percorso della root del repository per l'esportazione di `data/knowledge_graph/` e `graphify-out/`.
    #[arg(long)]
    pub repo_root: Option<PathBuf>,

    /// Directory con i record BIDMC aggiuntivi (04-53) usati solo da `--mode eval-anomaly`.
    #[arg(long, default_value = "data/bidmc_eval")]
    pub eval_dir: PathBuf,

    /// Sottoinsieme di record da valutare con `--mode eval-anomaly`.
    #[arg(long, value_enum, default_value_t = EvalSplitArg::All)]
    pub eval_split: EvalSplitArg,

    /// File Markdown di output per `--mode eval-anomaly` (stampa su stdout se assente).
    #[arg(long)]
    pub eval_out: Option<PathBuf>,

    /// Enable local telemetry recording in this directory (off when omitted).
    #[arg(long)]
    pub storage_dir: Option<PathBuf>,
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

fn export_and_verify_graph_bundle(graph: &AresUnifiedDatasetGraph, repo_root: &Path) -> Result<()> {
    let stats = graph
        .export_graphify_bundle(repo_root)
        .context("impossibile esportare il knowledge graph su disco")?;

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
            format!("file grafo atteso non trovato su disco: {}", path.display())
        })?;
        ensure!(
            meta.len() > 0,
            "file grafo vuoto su disco: {}",
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
        "ARES-DatasetGraph esportato e verificato su disco"
    );
    Ok(())
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
    ensure!(args.storage_dir.is_none() || matches!(args.mode, ServerMode::WsOnly | ServerMode::WsAndMcp),
        "--storage-dir requires ws-only or ws-and-mcp mode");
    let repo_root = resolve_repo_root(args.repo_root.as_deref(), &args.data_dir);

    if args.mode == ServerMode::BuildGraph {
        let bidmc_opt = args.data_dir.is_dir().then_some(args.data_dir.as_path());
        let graph = AresUnifiedDatasetGraph::build_with_bidmc_dir(bidmc_opt)
            .context("errore durante la costruzione di AresUnifiedDatasetGraph")?;
        export_and_verify_graph_bundle(&graph, &repo_root)?;
        return Ok(());
    }

    if args.mode == ServerMode::EvalAnomaly {
        let records = load_records(&[args.data_dir.as_path(), args.eval_dir.as_path()])
            .context("impossibile caricare i record BIDMC per la valutazione")?;
        ensure!(!records.is_empty(), "nessun record BIDMC trovato");
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
                        .with_context(|| format!("impossibile creare {parent:?}"))?;
                }
                std::fs::write(path, &markdown)
                    .with_context(|| format!("impossibile scrivere {path:?}"))?;
            }
            None => print!("{markdown}"),
        }
        return Ok(());
    }

    let state = SharedMissionState::from_data_dir(&args.data_dir)
        .with_context(|| format!("impossibile inizializzare i dataset da {:?}", args.data_dir))?;

    match args.mode {
        ServerMode::BuildGraph | ServerMode::EvalAnomaly => unreachable!(),
        ServerMode::SmokeTest => {
            let mut last_pkt = None;
            for _ in 0..20 {
                last_pkt = Some(
                    state
                        .advance_tick(Duration::from_millis(50))
                        .context("errore durante il tick 20 Hz di smoke-test")?,
                );
            }
            let q_snap = state
                .run_1hz_timestral_step()
                .context("errore durante l'inferenza Timestral 1 Hz di smoke-test")?;
            let pkt = last_pkt.context("nessun TelemetryPacket generato nello smoke-test")?;
            let ctx = state
                .fastmcp_context()
                .context("contesto FastMCP non disponibile nello smoke-test")?;

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
                "ARES-Health smoke test completo (7 crate + Timestral + ARES-HyperGraph + ARES-DatasetGraph) completato con successo"
            );
            Ok(())
        }
        ServerMode::McpOnly => tokio::task::spawn_blocking(move || run_mcp_stdio_loop(state))
            .await
            .context("join error sul task stdio FastMCP")?
            .context("errore I/O nel loop stdio FastMCP"),
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

            let app = build_axum_router(Arc::clone(&state));
            let listener = tokio::net::TcpListener::bind(&args.bind)
                .await
                .with_context(|| format!("impossibile eseguire il bind su {}", args.bind))?;
            tracing::info!(bind = %args.bind, "Server Axum 20 Hz + Timestral 1 Hz attivo");
            let shutdown_state = Arc::clone(&state);
            let result = axum::serve(listener, app).with_graceful_shutdown(async move {
                if let Err(error) = tokio::signal::ctrl_c().await {
                    tracing::error!(%error, "failed waiting for shutdown signal");
                }
                shutdown_state.request_shutdown();
            }).await;
            ticker.abort(); forecaster.abort();
            let _ = ticker.await; let _ = forecaster.await;
            state.shutdown_storage().await.context("failed draining local telemetry storage")?;
            result.context("errore runtime nel server Axum")
        }
    }
}
