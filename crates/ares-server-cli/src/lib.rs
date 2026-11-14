//! `ares-server-cli`: Dual-Transport Tokio Orchestrator (`axum` 20 Hz WebSocket + `FastMCP` stdio).

pub mod fastmcp_router;
pub mod mcp_stdio;
pub mod wire_contract;
pub mod ws_server;
