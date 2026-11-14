//! `ares-server-cli`: Dual-Transport Tokio Orchestrator (`axum` 20 Hz WebSocket + `FastMCP` stdio).

pub mod anomaly_eval;
pub mod edge_llm_bridge;
pub mod fastmcp_router;
pub mod mcp_stdio;
#[cfg(feature = "shm-ipc")]
pub mod shm_bus;
pub mod wire_contract;
pub mod ws_server;
