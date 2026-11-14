//! `ares-server-cli`: Dual-Transport Tokio Orchestrator (`axum` 20 Hz WebSocket + `FastMCP` stdio).

pub mod mcp_stdio;
pub mod ws_server;
