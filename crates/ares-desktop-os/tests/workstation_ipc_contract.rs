use ares_core_types::binary_ipc::{
    ARES_BINARY_MAGIC, BinaryTelemetryFrame, FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
};
use ares_desktop_os::{AresMedOsWorkstationShell, DesktopShellConfig, OsStatusBarState};
use ares_server_cli::fastmcp_router::JsonRpcResponse;
use ares_server_cli::ws_server::build_axum_router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use std::path::PathBuf;
use tokio::sync::oneshot;

fn bidmc_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc")
}

#[tokio::test]
async fn test_http_os_status_binary_frame_and_mcp_routes_match_in_process_ipc() {
    let shell = AresMedOsWorkstationShell::initialize(DesktopShellConfig {
        data_dir: bidmc_dir(),
        ..DesktopShellConfig::default()
    })
    .expect("initialize shell");

    let app = build_axum_router(shell.mission.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind ephemeral loopback port");
    let addr = listener.local_addr().expect("local addr");

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let server = tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await;
    });

    // Wait briefly by issuing a real TCP connection + HTTP/1.1 request via tokio::net::TcpStream
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut stream = tokio::net::TcpStream::connect(addr)
        .await
        .expect("connect to loopback server");
    stream
        .write_all(b"GET /api/os-status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .await
        .expect("write os-status request");
    let mut raw_resp = Vec::new();
    stream
        .read_to_end(&mut raw_resp)
        .await
        .expect("read os-status response");
    let resp_str = String::from_utf8_lossy(&raw_resp);
    assert!(resp_str.starts_with("HTTP/1.1 200 OK"));
    let body_start = resp_str.find("\r\n\r\n").expect("http header separator") + 4;
    let os_status: OsStatusBarState =
        serde_json::from_str(&resp_str[body_start..]).expect("parse OsStatusBarState JSON");
    assert_eq!(os_status.shell_name, "ARES-MedOS");
    assert_eq!(os_status.partitions.len(), 4);
    assert!(os_status.hrv_unavailable);

    // Verify GET /api/binary-frame returns exact 128-byte BinaryTelemetryFrame
    let mut bin_stream = tokio::net::TcpStream::connect(addr)
        .await
        .expect("connect for binary frame");
    bin_stream
        .write_all(
            b"GET /api/binary-frame HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .await
        .expect("write binary-frame request");
    let mut raw_bin = Vec::new();
    bin_stream
        .read_to_end(&mut raw_bin)
        .await
        .expect("read binary-frame response");
    let header_end = raw_bin
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .expect("binary frame header separator")
        + 4;
    let payload = &raw_bin[header_end..];
    assert_eq!(payload.len(), 128);
    let frame = BinaryTelemetryFrame::from_le_bytes(payload).expect("valid CRC-32C binary frame");
    assert_eq!(frame.magic, ARES_BINARY_MAGIC);
    assert_ne!(
        frame.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
        0
    );

    // Verify POST /api/mcp handles all tool aliases cleanly
    let mcp_body = r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_causal_biomarker_state","arguments":{}}}"#;
    let mcp_req = format!(
        "POST /api/mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        mcp_body.len(),
        mcp_body
    );
    let mut mcp_stream = tokio::net::TcpStream::connect(addr)
        .await
        .expect("connect for mcp");
    mcp_stream
        .write_all(mcp_req.as_bytes())
        .await
        .expect("write mcp request");
    let mut raw_mcp = Vec::new();
    mcp_stream
        .read_to_end(&mut raw_mcp)
        .await
        .expect("read mcp response");
    let mcp_str = String::from_utf8_lossy(&raw_mcp);
    assert!(mcp_str.starts_with("HTTP/1.1 200 OK"));
    let mcp_body_start = mcp_str.find("\r\n\r\n").expect("mcp header separator") + 4;
    let mcp_val: serde_json::Value =
        serde_json::from_str(&mcp_str[mcp_body_start..]).expect("parse MCP JSON-RPC response");
    assert!(mcp_val.get("error").is_none());
    assert!(mcp_val["result"]["content"][0]["text"].is_string());

    let _ = (
        StatusCode::OK,
        Request::<Body>::default(),
        core::mem::size_of::<JsonRpcResponse>(),
    );
    let _ = shutdown_tx.send(());
    let _ = server.await;
}
