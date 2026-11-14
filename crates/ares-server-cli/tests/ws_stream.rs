//! Phase 13 acceptance for the live stream: a real loopback socket must deliver
//! frames at 20 Hz, a stress-test patch must reach clients immediately, and the
//! zero-trust bind rule must hold.
//!
//! It also holds the two live halves of the contract verification: a 1 Hz
//! recording streamed at 20 Hz must still show one sample per second, and a
//! reconnecting cockpit must get the current What-If overlay back at once.

#![allow(clippy::panic)]

use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use ares_server_cli::mission::MissionState;
use ares_server_cli::replay::BidmcRecord;
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
        Self::serve(mission).await
    }

    /// A server replaying the verified `bidmc_01` record.
    async fn start_replay() -> Self {
        let data_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc");
        let record = BidmcRecord::load(&data_dir, "bidmc_01")
            .unwrap_or_else(|e| panic!("bidmc_01 loads: {e}"));
        let mission = MissionState::with_recorded_source(record)
            .unwrap_or_else(|e| panic!("engine builds: {e}"));
        Self::serve(mission).await
    }

    async fn serve(mission: MissionState) -> Self {
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

    let posted = Instant::now();
    post_stress_test(harness.addr, "{\"cabin_ppco2_mmhg\":6.1}").await;

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

/// Sends one `POST /api/stress-test` over a raw socket and asserts it was
/// accepted. Raw TCP keeps the test free of an HTTP client dependency.
async fn post_stress_test(addr: SocketAddr, body: &str) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let request = format!(
        "POST /api/stress-test HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let mut stream = tokio::net::TcpStream::connect(addr)
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

/// Contract verification: the stream runs at 20 Hz but a 1 Hz recording must
/// still advance one recorded sample per second, and never be resampled or
/// interpolated into a fake 20 Hz acquisition.
#[tokio::test]
async fn replay_keeps_one_sample_per_second_under_a_twenty_hertz_stream() {
    let harness = Harness::start_replay().await;
    let mut socket = connect(harness.addr).await;

    // Count the frames carrying each distinct recorded second over ~2 s.
    let mut frames_per_second: BTreeMap<u64, usize> = BTreeMap::new();
    let started = Instant::now();
    while started.elapsed() < Duration::from_millis(2_100) {
        let frame = next_frame(&mut socket).await;
        assert_eq!(
            frame["provenance_manifest"]["biometrics_native_rate_hz"], 1.0,
            "the recording is 1 Hz whatever the stream rate is"
        );
        assert_eq!(frame["provenance_manifest"]["ui_refresh_rate_hz"], 20.0);
        assert_eq!(frame["source_record_id"], "bidmc_01");

        let recorded = frame["relative_recording_time_s"]
            .as_f64()
            .unwrap_or_else(|| panic!("frame carries a recorded time: {frame}"));
        assert_eq!(
            recorded.fract(),
            0.0,
            "a numerics sample sits on a whole second, got {recorded}"
        );
        *frames_per_second.entry(recorded as u64).or_default() += 1;
    }

    let seconds: Vec<u64> = frames_per_second.keys().copied().collect();
    assert!(
        seconds.len() >= 2,
        "about 2 s of stream must cross a sample boundary, saw {seconds:?}"
    );
    assert!(
        seconds.windows(2).all(|w| w[1] == w[0] + 1),
        "recorded seconds must advance one at a time: {seconds:?}"
    );

    // Every second that was fully inside the window must carry many frames:
    // that is the 20 Hz stream resending the same 1 Hz sample, as intended.
    if let Some(second) = seconds.get(1) {
        let frames = frames_per_second.get(second).copied().unwrap_or_default();
        assert!(
            frames >= 10,
            "recorded second {second} was sent {frames} times, expected about 20"
        );
    }

    harness.stop().await;
}

/// Contract verification: a cockpit that reconnects must get the current
/// What-If overlay in its cold-start frame, without having to re-POST it.
#[tokio::test]
async fn reconnect_restores_the_current_whatif_overlay() {
    let harness = Harness::start_replay().await;

    let mut socket = connect(harness.addr).await;
    let cold_start = next_frame(&mut socket).await;
    assert_eq!(
        cold_start["provenance_manifest"]["scenario_overlay_mode"], "NONE_PURE_REPLAY",
        "a fresh replay claims nothing simulated"
    );
    assert!(cold_start["environment"].is_null());

    post_stress_test(
        harness.addr,
        "{\"cabin_ppco2_mmhg\":5.4,\"lbnp_pressure_mmhg\":-35.0}",
    )
    .await;

    // Drop the socket the way a browser reload does, then reconnect.
    drop(socket);
    let mut reconnected = connect(harness.addr).await;
    let frame = next_frame(&mut reconnected).await;

    assert_eq!(
        frame["provenance_manifest"]["scenario_overlay_mode"], "SIMULATED_WHATIF_SCENARIO",
        "the overlay must survive a reconnect"
    );
    assert_eq!(frame["environment"]["cabin_ppco2_mmhg"], 5.4);
    assert_eq!(
        frame["safety_margins"]["provenance"],
        "DERIVED_FROM_HYBRID_SCENARIO"
    );
    // The recorded channels are still the recording's own.
    assert_eq!(
        frame["provenance_manifest"]["biometrics_source"],
        "RECORDED_TERRESTRIAL_BIDMC_CSV"
    );

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
