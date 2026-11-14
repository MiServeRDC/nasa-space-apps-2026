//! # ares-server-cli
//!
//! Block G of ARES-Health (master plan phases 13-14): the dual-transport
//! orchestrator that exposes the deterministic Rust engine to its two consumers.
//!
//! ```text
//!                       Arc<RwLock<MissionState>>
//!                   (ClinicalState + MedOpsEngine + PlaybookRun)
//!                         |                       |
//!        transport 1      |                       |      transport 2
//!   axum 127.0.0.1:8080   |                       |   stdio JSON-RPC 2.0
//!   GET  /ws/telemetry  <-+ 20 Hz broadcast       +-> 3 FastMCP macro-tools
//!   POST /api/stress-test (< 1 ms recompute)          (<= 600 B / < 150 token)
//! ```
//!
//! Invariants:
//! * The HTTP listener binds loopback only ([`ws_server::serve`] rejects any
//!   non-loopback address): zero-trust, no cloud, fully offline.
//! * `stdout` carries JSON-RPC frames and nothing else; every log line goes to
//!   `stderr`, otherwise the MCP pipe is corrupted.
//! * Every telemetry field and every MCP answer carries explicit provenance.
//!   Values the engine cannot compute yet stay `null` and are never invented.
//! * Recorded channels are owned by [`replay`]: a What-If console input can
//!   never overwrite a BIDMC sample, and never advances the replay clock.
//! * No `unwrap`, `expect` or `panic` in `src/` (enforced by crate lints).

pub mod mcp_stdio;
pub mod mission;
pub mod replay;
pub mod telemetry;
pub mod ws_server;

pub use mission::{MissionState, ScenarioOverlay, StressTestRequest};
pub use replay::{BidmcRecord, BidmcSample, ReplayError};
pub use telemetry::{SourceMode, TelemetryPacket};
