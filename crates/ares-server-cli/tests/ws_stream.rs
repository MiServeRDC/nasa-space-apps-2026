//! Phase 13 acceptance for the live stream: a real loopback socket must deliver
//! frames at 20 Hz, a stress-test patch must reach clients immediately, and the
//! zero-trust bind rule must hold.

#![allow(clippy::panic)]

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use ares_server_cli::mission::MissionState;
use ares_server_cli::ws_server::{AppState, bind, serve_on};
use futures_util::StreamExt;
use serde_json::Value;
use tokio::sync::{RwLock, oneshot};
use tokio_tungstenite::tungstenite::Message;

/// Frames collected after the cold-start frame.
const SAMPLED_FRAMES: usize = 10;

struct Harness {
    addr: SocketAddr,
    stop: Option<oneshot::Sender<()>>,
    server: tokio::task::JoinHandle<()>,
}

impl Harness {
    async fn start() -> Self {
        let mission = MissionState::new("ASTRO-01", "SIM-TEST")
            .unwrap_or_else(|e| panic!("engine builds: {e}"));
        let state = AppState::new(Arc::new(RwLock::new(mission)));
        let listener = bind(
            "127.0.0.1:0"
                .parse()
                .unwrap_or_else(|e| panic!("addr: {e}")),
        )
        .await
        .unwrap_or_else(|e| panic!("loopback bind: {e}"));
        let addr = listener
            .local_addr()
            .unwrap_or_else(|e| panic!("bound addr: {e}"));
        let (stop, stopped) = oneshot::channel();
        let server = tokio::spawn(async move {
            let shutdown = async {
                let _ = stopped.await;
            };
            if let Err(error) = serve_on(listener, state, shutdown).await {
                panic!("server failed: {error}");
            }
        });
        Self {
            addr,
            stop: Some(stop),
            server,
        }
    }

    async fn stop(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        let _ = self.server.await;
    }
}

async fn connect(
    addr: SocketAddr,
) -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>> {
    let url = format!("ws://{addr}/ws/telemetry");
    let (socket, _) = tokio_tungstenite::connect_async(url)
        .await
        .unwrap_or_else(|e| panic!("websocket handshake: {e}"));
    socket
}

async fn next_frame(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> Value {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .unwrap_or_else(|_| panic!("frame timed out"))
            .unwrap_or_else(|| panic!("stream closed"))
            .unwrap_or_else(|e| panic!("frame error: {e}"));
        if let Message::Text(text) = message {
            return serde_json::from_str(&text).unwrap_or_else(|e| panic!("frame is JSON: {e}"));
        }
    }
}

#[tokio::test]
async fn stream_delivers_frames_at_twenty_hertz() {
    let harness = Harness::start().await;
    let mut socket = connect(harness.addr).await;

    // Cold start: the first frame must not wait for the next tick.
    let cold_start = Instant::now();
    let first = next_frame(&mut socket).await;
    assert!(
        cold_start.elapsed() < Duration::from_millis(50),
        "cold-start frame took {:?}",
        cold_start.elapsed()
    );
    assert_eq!(first["astronaut_id"], "ASTRO-01");
    assert_eq!(first["provenance_manifest"]["ui_refresh_rate_hz"], 20.0);

    let started = Instant::now();
    let mut timestamps = Vec::with_capacity(SAMPLED_FRAMES);
    for _ in 0..SAMPLED_FRAMES {
        let frame = next_frame(&mut socket).await;
        timestamps.push(
            frame["timestamp_ms"]
                .as_u64()
                .unwrap_or_else(|| panic!("frame carries a tick timestamp: {frame}")),
        );
    }
    let elapsed = started.elapsed();

    // 10 frames at 50 ms is 500 ms nominal; the window stays wide enough for a
    // loaded CI box while still failing a 1 Hz or an unthrottled stream.
    assert!(
        elapsed >= Duration::from_millis(350) && elapsed <= Duration::from_millis(1500),
        "{SAMPLED_FRAMES} frames took {elapsed:?}, expected about 500 ms"
    );
    assert!(
        timestamps.windows(2).all(|w| w[1] >= w[0]),
        "tick timestamps must not go backwards: {timestamps:?}"
    );

    socket
        .close(None)
        .await
        .unwrap_or_else(|e| panic!("clean close: {e}"));
    harness.stop().await;
}

#[tokio::test]
async fn stress_test_patch_reaches_clients_without_waiting_for_the_next_tick() {
    let harness = Harness::start().await;
    let mut socket = connect(harness.addr).await;
    let _cold_start = next_frame(&mut socket).await;

    let body = "{\"cabin_ppco2_mmhg\":6.1}";
    let request = format!(
        "POST /api/stress-test HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        harness.addr,
        body.len()
    );
    let posted = Instant::now();
    {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut stream = tokio::net::TcpStream::connect(harness.addr)
            .await
            .unwrap_or_else(|e| panic!("tcp connect: {e}"));
        stream
            .write_all(request.as_bytes())
            .await
            .unwrap_or_else(|e| panic!("post write: {e}"));
        // Read the response to completion: dropping the socket early would make
        // the server see a reset instead of a request.
        let mut response = String::new();
        tokio::time::timeout(Duration::from_secs(5), stream.read_to_string(&mut response))
            .await
            .unwrap_or_else(|_| panic!("post response timed out"))
            .unwrap_or_else(|e| panic!("post response: {e}"));
        assert!(
            response.starts_with("HTTP/1.1 200 OK"),
            "unexpected response: {response}"
        );
    }

    // The first frame carrying the new value must arrive well inside one tick.
    loop {
        let frame = next_frame(&mut socket).await;
        if frame["environment"]["cabin_ppco2_mmhg"] == 6.1 {
            break;
        }
        assert!(
            posted.elapsed() < Duration::from_millis(500),
            "patched value never reached the stream"
        );
    }

    harness.stop().await;
}

#[tokio::test]
async fn non_loopback_bind_is_refused() {
    let public: SocketAddr = "0.0.0.0:0".parse().unwrap_or_else(|e| panic!("addr: {e}"));
    let error = bind(public)
        .await
        .err()
        .unwrap_or_else(|| panic!("binding 0.0.0.0 must be refused"));
    assert!(error.to_string().contains("loopback only"), "{error}");
}
