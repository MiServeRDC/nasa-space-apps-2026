//! Transport 1 (phase 13): `axum` loopback server, 20 Hz WebSocket broadcast and
//! the sub-millisecond What-If Stress-Test Console endpoint.
//!
//! Routes:
//! * `GET  /ws/telemetry`            - 20 Hz `TelemetryPacket` stream.
//! * `POST /api/stress-test`         - console patch, recomputes and broadcasts.
//! * `POST /api/playbook/activate`   - gate and arm a playbook.
//! * `POST /api/playbook/execute-step` - the `[EXECUTE STEP]` button.
//! * `GET  /api/snapshot`            - one frame (cockpit cold start, probes).
//! * `GET  /api/health`              - liveness.
//!
//! One serialization per tick is shared by every client through a broadcast
//! channel, so N cockpit tabs cost one `serde_json` pass, not N.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use ares_medops_playbooks::{ActivePlaybookView, PlaybookId};
use axum::Json;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Router, serve};
use serde::{Deserialize, Serialize};
use tokio::sync::{RwLock, broadcast};
use tokio::time::MissedTickBehavior;

use crate::mission::{MissionState, ScenarioRejection, StressTestRequest};
use crate::telemetry::{TelemetryPacket, UI_REFRESH_RATE_HZ};

/// 20 Hz: one frame every 50 ms. Kept in sync with [`UI_REFRESH_RATE_HZ`] by
/// `tick_period_matches_ui_rate` in `tests/http_api.rs`.
pub const TICK: Duration = Duration::from_millis(50);

/// Frames a slow client may fall behind before it is told it lagged.
const BROADCAST_CAPACITY: usize = 64;

/// Handler state: the shared mission plus the pre-serialized frame fan-out.
#[derive(Clone)]
pub struct AppState {
    mission: Arc<RwLock<MissionState>>,
    frames: broadcast::Sender<Arc<str>>,
}

impl AppState {
    pub fn new(mission: Arc<RwLock<MissionState>>) -> Self {
        let (frames, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self { mission, frames }
    }

    pub fn mission(&self) -> &Arc<RwLock<MissionState>> {
        &self.mission
    }

    /// Serializes one frame and fans it out. Returns the frame for the caller.
    async fn tick(&self) -> Result<TelemetryPacket, serde_json::Error> {
        let packet = {
            let mission = self.mission.read().await;
            mission.packet()
        };
        let encoded: Arc<str> = Arc::from(serde_json::to_string(&packet)?);
        // Err only means nobody is subscribed yet.
        let _ = self.frames.send(encoded);
        Ok(packet)
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/ws/telemetry", get(ws_telemetry))
        .route("/api/stress-test", post(stress_test))
        .route("/api/playbook/activate", post(activate_playbook))
        .route("/api/playbook/execute-step", post(execute_step))
        .route("/api/snapshot", get(snapshot))
        .route("/api/health", get(health))
        .with_state(state)
}

/// Binds the TCP listener for the cockpit server.
///
/// Zero-trust rule: a non-loopback address is refused, so the engine is never
/// reachable off-host. Pass port 0 to let the OS pick one.
pub async fn bind(addr: SocketAddr) -> anyhow::Result<tokio::net::TcpListener> {
    if !addr.ip().is_loopback() {
        anyhow::bail!("refusing to bind {addr}: ARES-Health binds loopback only (zero-trust)");
    }
    Ok(tokio::net::TcpListener::bind(addr).await?)
}

/// Starts the 20 Hz producer and serves until `shutdown` resolves.
pub async fn serve_on(
    listener: tokio::net::TcpListener,
    state: AppState,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> anyhow::Result<()> {
    let bound = listener.local_addr()?;
    tracing::info!(%bound, hz = UI_REFRESH_RATE_HZ, "axum telemetry server listening");

    let broadcaster = tokio::spawn(broadcast_loop(state.clone()));
    let result = serve(listener, router(state))
        .with_graceful_shutdown(shutdown)
        .await;
    broadcaster.abort();
    result.map_err(Into::into)
}

/// [`bind`] followed by [`serve_on`]: what `ares-engine serve` runs.
pub async fn serve_until(
    addr: SocketAddr,
    state: AppState,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> anyhow::Result<()> {
    serve_on(bind(addr).await?, state, shutdown).await
}

/// The 20 Hz producer. Ticks are delayed, never bunched up, if a tick overruns.
async fn broadcast_loop(state: AppState) {
    let mut ticker = tokio::time::interval(TICK);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    loop {
        ticker.tick().await;
        if let Err(error) = state.tick().await {
            tracing::error!(%error, "telemetry frame serialization failed");
        }
    }
}

async fn ws_telemetry(upgrade: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    upgrade.on_upgrade(move |socket| stream_frames(socket, state))
}

async fn stream_frames(mut socket: WebSocket, state: AppState) {
    let mut frames = state.frames.subscribe();

    // Cold start: send the current frame immediately instead of waiting 50 ms.
    // The guard is dropped before the send: the lock is never held across await.
    let first = {
        let mission = state.mission.read().await;
        serde_json::to_string(&mission.packet())
    };
    if let Ok(frame) = first
        && socket.send(Message::text(frame)).await.is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            frame = frames.recv() => match frame {
                Ok(frame) => {
                    if socket.send(Message::text(frame.as_ref())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "websocket client lagged, frames dropped");
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                // The cockpit sends commands over HTTP, not over the socket.
                Some(Ok(_)) => {}
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StressTestResponse {
    /// Measured recompute + serialize time. Phase 13 budget: < 1000 us.
    pub recompute_latency_us: u64,
    pub packet: TelemetryPacket,
}

async fn stress_test(
    State(state): State<AppState>,
    Json(request): Json<StressTestRequest>,
) -> Result<Json<StressTestResponse>, ApiError> {
    let started = Instant::now();
    {
        let mut mission = state.mission.write().await;
        mission.apply_stress_test(&request)?;
    }
    let packet = state.tick().await.map_err(ApiError::serialization)?;
    let elapsed = u64::try_from(started.elapsed().as_micros()).unwrap_or(u64::MAX);
    Ok(Json(StressTestResponse {
        recompute_latency_us: elapsed,
        packet,
    }))
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivateRequest {
    pub playbook_id: PlaybookId,
}

async fn activate_playbook(
    State(state): State<AppState>,
    Json(request): Json<ActivateRequest>,
) -> Result<Json<ActivePlaybookView>, ApiError> {
    let view = {
        let mut mission = state.mission.write().await;
        mission.activate_playbook(request.playbook_id)
    };
    let view = view.ok_or_else(|| ApiError {
        status: StatusCode::NOT_FOUND,
        field: "playbook_id",
        message: "playbook not compiled".to_string(),
    })?;
    let _ = state.tick().await;
    Ok(Json(view))
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecuteStepRequest {
    pub playbook_id: PlaybookId,
    pub step_id: u8,
}

async fn execute_step(
    State(state): State<AppState>,
    Json(request): Json<ExecuteStepRequest>,
) -> Result<Json<ActivePlaybookView>, ApiError> {
    let view = {
        let mut mission = state.mission.write().await;
        mission.execute_step(request.playbook_id, request.step_id)
    };
    let view = view.map_err(|rejection| ApiError {
        status: StatusCode::CONFLICT,
        field: "step_id",
        message: rejection.to_string(),
    })?;
    let _ = state.tick().await;
    Ok(Json(view))
}

async fn snapshot(State(state): State<AppState>) -> Json<TelemetryPacket> {
    let mission = state.mission.read().await;
    Json(mission.packet())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
struct Health {
    status: &'static str,
    ui_refresh_rate_hz: f64,
    websocket_clients: usize,
}

async fn health(State(state): State<AppState>) -> Json<Health> {
    Json(Health {
        status: "OK",
        ui_refresh_rate_hz: UI_REFRESH_RATE_HZ,
        websocket_clients: state.frames.receiver_count(),
    })
}

/// Rejected request, rendered as `{"field":...,"message":...}`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ApiError {
    #[serde(skip)]
    status: StatusCode,
    field: &'static str,
    message: String,
}

impl ApiError {
    fn serialization(error: serde_json::Error) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            field: "packet",
            message: error.to_string(),
        }
    }
}

impl From<ScenarioRejection> for ApiError {
    fn from(rejection: ScenarioRejection) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            field: rejection.field,
            message: rejection.message,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self)).into_response()
    }
}
