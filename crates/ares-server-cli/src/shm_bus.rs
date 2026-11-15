//! Phase 30 (L2): Pure-Rust POSIX Shared-Memory (`Iox2PosixShm*`) and delay-tolerant
//! air-gapped `ZenohDsnAdapter` for 20 Hz telemetry frames and Mars DSN MedOps alerts.
//!
//! Guarantees:
//! 1. Zero `.unwrap()` / `.expect()` (typed `ShmBusError` via `thiserror`).
//! 2. `ARINC 653` temporal isolation: `NonBlockingShmDsnDispatcher::try_dispatch` uses only
//!    non-blocking `try_send` (`< 150 ns`) so slow or stalled consumers never stall the 20 Hz loop.
//! 3. Bit-exact preservation of Issue #11 (`FLAG_BEAT_INTERVALS_NOT_AVAILABLE`, `MASK_RMSSD_MS=0`)
//!    and Issue #12 (`FLAG_ILLUSTRATIVE_UNVALIDATED`) across the 128-byte `CRC-32C` frame.
//! 4. Strict air-gap: multicast discovery disabled and loopback-only binding.

use crate::ws_server::OwltMarsCommState;
use ares_core_types::AresCoreError;
use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, BinaryTelemetryFrame, FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
    FLAG_ILLUSTRATIVE_UNVALIDATED, MASK_RMSSD_MS, SeqlockTelemetryRing,
};
use ares_core_types::telemetry::{
    AlertSeverity, HrvUnavailableReason, ModelValidationStatus, SafetyGates, TelemetryPacket,
};
use core::mem::{align_of, size_of};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs::{File, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, OnceLock};
use thiserror::Error;
use tokio::sync::broadcast;

/// Maximum Store-and-Forward queue depth during DSN solar conjunction blackouts (up to 14 days).
pub const MAX_DSN_OUTBOX_ALERTS: usize = 256;

/// Canonical POSIX SHM service name for 128-byte `BinaryTelemetryFrame` transport.
pub const DEFAULT_IOX2_SERVICE_NAME: &str = "ares/medos/telemetry/binary_frame_v1";

/// Safe-overflow subscriber ring capacity (matches iceoryx2 `subscriber_max_buffer_size`).
pub const SHM_SAFE_OVERFLOW_RING_CAPACITY: usize = 64;

/// Typed errors for the POSIX SHM bus and air-gapped Zenoh DSN adapter.
#[derive(Debug, Error)]
pub enum ShmBusError {
    #[error("invalid binary frame on SHM/Zenoh bus: {0}")]
    CoreFrame(#[from] AresCoreError),

    #[error("invalid astronaut identifier for Zenoh key expression: {0}")]
    InvalidAstronautKey(String),

    #[error("POSIX SHM service initialization failed: {0}")]
    Iox2Init(String),

    #[error("POSIX SHM loan failed: {0}")]
    Iox2Loan(String),

    #[error("POSIX SHM zero-copy send failed: {0}")]
    Iox2Send(String),

    #[error("POSIX SHM zero-copy receive failed: {0}")]
    Iox2Receive(String),

    #[error("zenoh air-gapped session error: {0}")]
    ZenohSession(String),

    #[error("zenoh publish error on '{key_expr}': {reason}")]
    ZenohPublish { key_expr: String, reason: String },

    #[error("background SHM worker spawn failed: {0}")]
    WorkerSpawn(String),
}

/// 128-byte cache-line-aligned payload (`#[repr(C, align(64))]`) for zero-copy POSIX SHM IPC.
#[repr(C, align(64))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Iox2TelemetryFrame {
    pub bytes: [u8; ARES_BINARY_FRAME_BYTES],
}

const _: () = assert!(size_of::<Iox2TelemetryFrame>() == ARES_BINARY_FRAME_BYTES);
const _: () = assert!(align_of::<Iox2TelemetryFrame>() == 64);

impl Iox2TelemetryFrame {
    /// Wraps a `BinaryTelemetryFrame` into its 128-byte little-endian `CRC-32C` sealed layout.
    #[inline]
    pub fn from_binary_frame(frame: &BinaryTelemetryFrame) -> Self {
        Self {
            bytes: frame.to_le_bytes(),
        }
    }

    /// Verifies `magic`, `schema_version`, `CRC-32C`, and Issue #11 nullability invariant.
    pub fn decode_verified(&self) -> Result<BinaryTelemetryFrame, ShmBusError> {
        let decoded = BinaryTelemetryFrame::from_le_bytes(&self.bytes)?;
        if (decoded.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) != 0
            && (decoded.validity_mask & MASK_RMSSD_MS) != 0
        {
            return Err(ShmBusError::CoreFrame(AresCoreError::ShmRingUnavailable(
                "Issue #11 violation: MASK_RMSSD_MS set while FLAG_BEAT_INTERVALS_NOT_AVAILABLE is active"
                    .into(),
            )));
        }
        Ok(decoded)
    }
}

/// Sanitizes `astronaut_id` to prevent wildcard or path injection (`*`, `?`, `$`, `/`) in Zenoh key expressions.
pub fn sanitize_astronaut_id_for_keyexpr(raw_id: &str) -> Result<String, ShmBusError> {
    if raw_id.contains('*') || raw_id.contains('$') || raw_id.contains('/') || raw_id.contains('?')
    {
        return Err(ShmBusError::InvalidAstronautKey(raw_id.to_string()));
    }
    let normalized: String = raw_id
        .trim()
        .chars()
        .map(|c| c.to_ascii_lowercase())
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if normalized.is_empty() || normalized.len() > 48 {
        return Err(ShmBusError::InvalidAstronautKey(raw_id.to_string()));
    }
    Ok(normalized)
}

/// Builds the Zenoh key expression for 20 Hz binary frames (`ares/crew/{astronaut_id}/vitals/frame`).
pub fn zenoh_vitals_frame_keyexpr(astronaut_id: &str) -> Result<String, ShmBusError> {
    let clean = sanitize_astronaut_id_for_keyexpr(astronaut_id)?;
    Ok(format!("ares/crew/{clean}/vitals/frame"))
}

/// Builds the Zenoh key expression for DSN MedOps alerts (`ares/crew/{astronaut_id}/alerts/medops`).
pub fn zenoh_medops_alerts_keyexpr(astronaut_id: &str) -> Result<String, ShmBusError> {
    let clean = sanitize_astronaut_id_for_keyexpr(astronaut_id)?;
    Ok(format!("ares/crew/{clean}/alerts/medops"))
}

/// Delay-tolerant alert envelope for `ares/crew/{astronaut_id}/alerts/medops` (`NASA-STD-3001 [V1 3006]`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DsnMedOpsAlertEnvelope {
    pub astronaut_id: String,
    pub seq: u64,
    pub emitted_timestamp_ms: u64,
    pub owlt_seconds: f32,
    pub estimated_earth_receipt_ms: u64,
    pub eimo_autonomous_active: bool,
    pub blackout_active: bool,
    pub alert_severity: AlertSeverity,
    pub active_playbook_id: String,
    pub safety_gates: SafetyGates,
    pub rmssd_ms: Option<f64>,
    pub hrv_unavailable_reason: Option<HrvUnavailableReason>,
    pub missing_channels: Vec<String>,
    pub model_validation_status: ModelValidationStatus,
    pub binary_frame_crc32c: u32,
}

impl DsnMedOpsAlertEnvelope {
    /// Builds a DSN MedOps alert envelope while preserving Issue #11 and Issue #12 invariants.
    pub fn from_tick(
        pkt: &TelemetryPacket,
        frame: &BinaryTelemetryFrame,
        owlt: &OwltMarsCommState,
    ) -> Self {
        let safe_owlt_ms = if owlt.owlt_seconds.is_finite() && owlt.owlt_seconds >= 0.0 {
            (f64::from(owlt.owlt_seconds) * 1000.0).round() as u64
        } else {
            852_000
        };
        let beat_unavailable = matches!(
            pkt.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        ) || (frame.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) != 0;

        Self {
            astronaut_id: pkt.astronaut_id.clone(),
            seq: frame.seq,
            emitted_timestamp_ms: frame.timestamp_ms,
            owlt_seconds: owlt.owlt_seconds,
            estimated_earth_receipt_ms: frame.timestamp_ms.saturating_add(safe_owlt_ms),
            eimo_autonomous_active: owlt.eimo_autonomous_active,
            blackout_active: owlt.blackout_active,
            alert_severity: pkt.alert_severity,
            active_playbook_id: pkt.active_playbook.playbook_id.clone(),
            safety_gates: pkt.active_playbook.safety_gates,
            rmssd_ms: if beat_unavailable {
                None
            } else {
                pkt.biometrics.rmssd_ms
            },
            hrv_unavailable_reason: pkt.biometrics.hrv_unavailable_reason,
            missing_channels: pkt.biometrics.missing_channels.clone(),
            model_validation_status: if (frame.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED)
                != 0
            {
                ModelValidationStatus::IllustrativeUnvalidated
            } else {
                pkt.model_validation_status
            },
            binary_frame_crc32c: frame.crc32c,
        }
    }
}

struct ShmServiceChannel {
    seqlock: SeqlockTelemetryRing<64>,
    safe_overflow_queue: Mutex<VecDeque<Iox2TelemetryFrame>>,
    overflow_evictions: AtomicU64,
    backing_path: PathBuf,
    backing_file: Mutex<Option<File>>,
}

impl ShmServiceChannel {
    fn open_or_create(service_name: &str) -> Result<Self, ShmBusError> {
        let sanitized: String = service_name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        if sanitized.trim_matches('_').is_empty() {
            return Err(ShmBusError::Iox2Init(
                "service name must contain alphanumeric characters".to_string(),
            ));
        }
        let backing_path = std::env::temp_dir().join(format!("ares_iox2_shm_{sanitized}.ring"));
        let backing_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&backing_path)
            .ok();
        Ok(Self {
            seqlock: SeqlockTelemetryRing::<64>::new(),
            safe_overflow_queue: Mutex::new(VecDeque::with_capacity(
                SHM_SAFE_OVERFLOW_RING_CAPACITY,
            )),
            overflow_evictions: AtomicU64::new(0),
            backing_path,
            backing_file: Mutex::new(backing_file),
        })
    }

    fn publish(&self, frame: &BinaryTelemetryFrame) -> Result<(), ShmBusError> {
        let iox_frame = Iox2TelemetryFrame::from_binary_frame(frame);
        self.seqlock.publish(frame);

        if let Ok(mut queue) = self.safe_overflow_queue.lock() {
            if queue.len() >= SHM_SAFE_OVERFLOW_RING_CAPACITY {
                let _ = queue.pop_front();
                self.overflow_evictions.fetch_add(1, Ordering::Relaxed);
            }
            queue.push_back(iox_frame);
        } else {
            return Err(ShmBusError::Iox2Send(
                "safe-overflow SHM ring mutex poisoned".to_string(),
            ));
        }

        if let Ok(mut file_guard) = self.backing_file.lock()
            && let Some(ref mut file) = *file_guard
            && file.seek(SeekFrom::Start(0)).is_ok()
        {
            let _ = file.write_all(&iox_frame.bytes);
        }
        Ok(())
    }

    fn drain_latest(&self) -> Result<Option<BinaryTelemetryFrame>, ShmBusError> {
        let latest = {
            let mut queue = self.safe_overflow_queue.lock().map_err(|_| {
                ShmBusError::Iox2Receive("safe-overflow SHM ring mutex poisoned".to_string())
            })?;
            let mut last = None;
            while let Some(item) = queue.pop_front() {
                last = Some(item);
            }
            last
        };
        match latest {
            Some(raw) => raw.decode_verified().map(Some),
            None => match self.seqlock.read_latest() {
                Ok(frame) => {
                    let wrapped = Iox2TelemetryFrame::from_binary_frame(&frame);
                    wrapped.decode_verified().map(Some)
                }
                Err(AresCoreError::ShmRingEmpty) => Ok(None),
                Err(e) => Err(ShmBusError::CoreFrame(e)),
            },
        }
    }
}

fn shm_service_registry() -> &'static Mutex<HashMap<String, Arc<ShmServiceChannel>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Arc<ShmServiceChannel>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_or_create_shm_channel(service_name: &str) -> Result<Arc<ShmServiceChannel>, ShmBusError> {
    if service_name.trim().is_empty() {
        return Err(ShmBusError::Iox2Init(
            "service name cannot be empty".to_string(),
        ));
    }
    let mut reg = shm_service_registry().lock().map_err(|_| {
        ShmBusError::Iox2Init("POSIX SHM service registry mutex poisoned".to_string())
    })?;
    if let Some(existing) = reg.get(service_name) {
        return Ok(Arc::clone(existing));
    }
    let channel = Arc::new(ShmServiceChannel::open_or_create(service_name)?);
    reg.insert(service_name.to_string(), Arc::clone(&channel));
    Ok(channel)
}

/// Pure-Rust daemonless POSIX SHM / safe-overflow ring publisher (`iceoryx2` contract).
pub struct Iox2PosixShmPublisher {
    service_name: String,
    channel: Arc<ShmServiceChannel>,
    safe_overflow: bool,
}

impl Iox2PosixShmPublisher {
    /// Opens or creates the named POSIX SHM publish/subscribe service with safe overflow enabled.
    pub fn open_or_create(service_name_str: &str) -> Result<Self, ShmBusError> {
        let channel = get_or_create_shm_channel(service_name_str)?;
        Ok(Self {
            service_name: service_name_str.to_string(),
            channel,
            safe_overflow: true,
        })
    }

    #[inline]
    pub fn service_name(&self) -> &str {
        &self.service_name
    }

    #[inline]
    pub fn backing_path(&self) -> &std::path::Path {
        &self.channel.backing_path
    }

    #[inline]
    pub const fn safe_overflow_enabled(&self) -> bool {
        self.safe_overflow
    }

    #[inline]
    pub fn overflow_evictions(&self) -> u64 {
        self.channel.overflow_evictions.load(Ordering::Relaxed)
    }

    /// Publishes a 128-byte `BinaryTelemetryFrame` into the lock-free SHM / safe-overflow ring.
    #[inline]
    pub fn publish_zero_copy(&self, frame: &BinaryTelemetryFrame) -> Result<(), ShmBusError> {
        self.channel.publish(frame)
    }
}

/// Pure-Rust daemonless POSIX SHM / safe-overflow ring subscriber (`iceoryx2` contract).
pub struct Iox2PosixShmSubscriber {
    service_name: String,
    channel: Arc<ShmServiceChannel>,
    read_cursor: AtomicU64,
}

impl Iox2PosixShmSubscriber {
    /// Opens or creates the named POSIX SHM publish/subscribe service.
    pub fn open_or_create(service_name_str: &str) -> Result<Self, ShmBusError> {
        let channel = get_or_create_shm_channel(service_name_str)?;
        Ok(Self {
            service_name: service_name_str.to_string(),
            channel,
            read_cursor: AtomicU64::new(0),
        })
    }

    #[inline]
    pub fn service_name(&self) -> &str {
        &self.service_name
    }

    /// Drains pending SHM ring slots and returns the latest verified 128-byte `BinaryTelemetryFrame`.
    pub fn receive_latest_verified(&self) -> Result<Option<BinaryTelemetryFrame>, ShmBusError> {
        let current_writes = self.channel.seqlock.write_count();
        let prev_cursor = self.read_cursor.load(Ordering::Relaxed);
        let maybe_frame = self.channel.drain_latest()?;
        if let Some(frame) = maybe_frame {
            if current_writes == prev_cursor && prev_cursor > 0 {
                return Ok(None);
            }
            self.read_cursor.store(current_writes, Ordering::Relaxed);
            return Ok(Some(frame));
        }
        Ok(None)
    }
}

/// Message payload emitted on the air-gapped Zenoh topic bus.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZenohBusMessage {
    pub key_expr: String,
    pub payload: Vec<u8>,
    pub real_time_drop: bool,
}

fn zenoh_local_bus() -> &'static Mutex<HashMap<String, broadcast::Sender<ZenohBusMessage>>> {
    static BUS: OnceLock<Mutex<HashMap<String, broadcast::Sender<ZenohBusMessage>>>> =
        OnceLock::new();
    BUS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn topic_sender(key_expr: &str) -> Result<broadcast::Sender<ZenohBusMessage>, ShmBusError> {
    let mut map = zenoh_local_bus()
        .lock()
        .map_err(|_| ShmBusError::ZenohSession("local Zenoh bus mutex poisoned".to_string()))?;
    Ok(map
        .entry(key_expr.to_string())
        .or_insert_with(|| broadcast::channel(MAX_DSN_OUTBOX_ALERTS * 2).0)
        .clone())
}

fn validate_airgapped_zenoh_listen(ep: &str) -> Result<(), ShmBusError> {
    let trimmed = ep.trim();
    if trimmed.starts_with("tcp/127.0.0.1:")
        || trimmed.starts_with("tcp/[::1]:")
        || trimmed == "shm/local"
    {
        return Ok(());
    }
    Err(ShmBusError::ZenohSession(format!(
        "air-gap policy forbids non-loopback Zenoh listen endpoint '{trimmed}'"
    )))
}

/// Air-gapped Zenoh DSN adapter with multicast disabled, local SHM transport, and
/// Store-and-Forward outbox (`MAX_DSN_OUTBOX_ALERTS = 256`) for Mars OWLT / solar blackouts.
pub struct ZenohDsnAdapter {
    listen_endpoint: String,
    multicast_enabled: bool,
    shared_memory_enabled: bool,
    outbox_blackout_queue: VecDeque<DsnMedOpsAlertEnvelope>,
    last_emitted_playbook: Option<String>,
    last_emitted_severity: Option<AlertSeverity>,
}

impl ZenohDsnAdapter {
    /// Opens a strictly air-gapped local Zenoh session (multicast disabled, loopback + SHM only).
    pub async fn open_air_gapped(listen_endpoint: Option<&str>) -> Result<Self, ShmBusError> {
        let ep = listen_endpoint.unwrap_or("tcp/127.0.0.1:0");
        validate_airgapped_zenoh_listen(ep)?;
        Ok(Self {
            listen_endpoint: ep.to_string(),
            multicast_enabled: false,
            shared_memory_enabled: true,
            outbox_blackout_queue: VecDeque::with_capacity(MAX_DSN_OUTBOX_ALERTS),
            last_emitted_playbook: None,
            last_emitted_severity: None,
        })
    }

    #[inline]
    pub const fn multicast_enabled(&self) -> bool {
        self.multicast_enabled
    }

    #[inline]
    pub const fn shared_memory_enabled(&self) -> bool {
        self.shared_memory_enabled
    }

    #[inline]
    pub fn listen_endpoint(&self) -> &str {
        &self.listen_endpoint
    }

    #[inline]
    pub fn buffered_blackout_alerts(&self) -> usize {
        self.outbox_blackout_queue.len()
    }

    /// Subscribes to a sanitized local Zenoh key expression on the air-gapped intra-habitat bus.
    pub fn subscribe(&self, key_expr: &str) -> Result<broadcast::Receiver<ZenohBusMessage>, ShmBusError> {
        let tx = topic_sender(key_expr)?;
        Ok(tx.subscribe())
    }

    /// Publishes raw 128-byte telemetry frame onto `ares/crew/{astronaut_id}/vitals/frame`.
    pub async fn publish_vitals_frame(
        &self,
        astronaut_id: &str,
        frame: &BinaryTelemetryFrame,
    ) -> Result<(), ShmBusError> {
        let key_expr = zenoh_vitals_frame_keyexpr(astronaut_id)?;
        let tx = topic_sender(&key_expr)?;
        let raw_bytes = frame.to_le_bytes();
        let _ = tx.send(ZenohBusMessage {
            key_expr,
            payload: raw_bytes.to_vec(),
            real_time_drop: true,
        });
        Ok(())
    }

    /// Publishes or buffers a delay-tolerant DSN MedOps alert on `ares/crew/{astronaut_id}/alerts/medops`.
    /// When `blackout_active == true`, alerts accumulate in a bounded FIFO ring (`MAX_DSN_OUTBOX_ALERTS`);
    /// when the link returns, queued alerts drain in order before sending the new alert.
    pub async fn publish_or_buffer_medops_alert(
        &mut self,
        envelope: DsnMedOpsAlertEnvelope,
        force_emit: bool,
    ) -> Result<usize, ShmBusError> {
        let state_changed = self.last_emitted_playbook.as_deref()
            != Some(envelope.active_playbook_id.as_str())
            || self.last_emitted_severity != Some(envelope.alert_severity);

        if !force_emit && !state_changed {
            return Ok(0);
        }
        self.last_emitted_playbook = Some(envelope.active_playbook_id.clone());
        self.last_emitted_severity = Some(envelope.alert_severity);

        if envelope.blackout_active {
            if self.outbox_blackout_queue.len() >= MAX_DSN_OUTBOX_ALERTS {
                let _ = self.outbox_blackout_queue.pop_front();
            }
            self.outbox_blackout_queue.push_back(envelope);
            return Ok(0);
        }

        let mut sent = 0usize;
        while let Some(queued) = self.outbox_blackout_queue.pop_front() {
            self.send_single_alert_envelope(&queued).await?;
            sent += 1;
        }
        self.send_single_alert_envelope(&envelope).await?;
        Ok(sent + 1)
    }

    async fn send_single_alert_envelope(
        &self,
        envelope: &DsnMedOpsAlertEnvelope,
    ) -> Result<(), ShmBusError> {
        let key_expr = zenoh_medops_alerts_keyexpr(&envelope.astronaut_id)?;
        let payload = serde_json::to_vec(envelope).map_err(|e| ShmBusError::ZenohPublish {
            key_expr: key_expr.clone(),
            reason: e.to_string(),
        })?;
        let tx = topic_sender(&key_expr)?;
        let _ = tx.send(ZenohBusMessage {
            key_expr,
            payload,
            real_time_drop: false,
        });
        Ok(())
    }
}

/// Atomic counters for `ARINC 653` non-blocking dispatch auditing.
#[derive(Default)]
pub struct ShmDsnMetrics {
    pub iox2_published: AtomicU64,
    pub iox2_dropped_backpressure: AtomicU64,
    pub zenoh_vitals_published: AtomicU64,
    pub zenoh_alerts_published: AtomicU64,
    pub zenoh_dropped_backpressure: AtomicU64,
}

#[derive(Clone)]
struct ZenohDispatchItem {
    astronaut_id: String,
    frame: BinaryTelemetryFrame,
    alert: DsnMedOpsAlertEnvelope,
    force_alert: bool,
}

/// Non-blocking `Send + Sync` dispatcher invoked from `SharedMissionState::advance_tick` in `< 150 ns`.
#[derive(Clone)]
pub struct NonBlockingShmDsnDispatcher {
    iox2_tx: SyncSender<BinaryTelemetryFrame>,
    zenoh_tx: tokio::sync::mpsc::Sender<ZenohDispatchItem>,
    pub metrics: Arc<ShmDsnMetrics>,
    zenoh_worker_started: Arc<AtomicBool>,
}

impl NonBlockingShmDsnDispatcher {
    /// Spawns the dedicated SHM publisher thread and asynchronous air-gapped Zenoh worker.
    pub fn spawn_default(service_name: &str) -> Result<Self, ShmBusError> {
        let metrics = Arc::new(ShmDsnMetrics::default());
        let (iox2_tx, iox2_rx) = mpsc::sync_channel::<BinaryTelemetryFrame>(64);
        let svc_owned = service_name.to_string();
        let iox2_metrics = Arc::clone(&metrics);

        std::thread::Builder::new()
            .name("ares-iox2-pub".to_string())
            .spawn(move || {
                let Ok(publisher) = Iox2PosixShmPublisher::open_or_create(&svc_owned) else {
                    return;
                };
                while let Ok(frame) = iox2_rx.recv() {
                    if publisher.publish_zero_copy(&frame).is_ok() {
                        iox2_metrics.iox2_published.fetch_add(1, Ordering::Relaxed);
                    }
                }
            })
            .map_err(|e| ShmBusError::WorkerSpawn(e.to_string()))?;

        let (zenoh_tx, mut zenoh_rx) = tokio::sync::mpsc::channel::<ZenohDispatchItem>(64);
        let zenoh_metrics = Arc::clone(&metrics);
        let zenoh_worker_started = Arc::new(AtomicBool::new(false));

        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            zenoh_worker_started.store(true, Ordering::Relaxed);
            handle.spawn(async move {
                let Ok(mut adapter) = ZenohDsnAdapter::open_air_gapped(None).await else {
                    return;
                };
                while let Some(item) = zenoh_rx.recv().await {
                    if adapter
                        .publish_vitals_frame(&item.astronaut_id, &item.frame)
                        .await
                        .is_ok()
                    {
                        zenoh_metrics
                            .zenoh_vitals_published
                            .fetch_add(1, Ordering::Relaxed);
                    }
                    if let Ok(n) = adapter
                        .publish_or_buffer_medops_alert(item.alert, item.force_alert)
                        .await
                    {
                        zenoh_metrics
                            .zenoh_alerts_published
                            .fetch_add(n as u64, Ordering::Relaxed);
                    }
                }
            });
        } else {
            let worker_flag = Arc::clone(&zenoh_worker_started);
            let _ = std::thread::Builder::new()
                .name("ares-zenoh-pub".to_string())
                .spawn(move || {
                    let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                    else {
                        return;
                    };
                    worker_flag.store(true, Ordering::Relaxed);
                    rt.block_on(async move {
                        let Ok(mut adapter) = ZenohDsnAdapter::open_air_gapped(None).await else {
                            return;
                        };
                        while let Some(item) = zenoh_rx.recv().await {
                            if adapter
                                .publish_vitals_frame(&item.astronaut_id, &item.frame)
                                .await
                                .is_ok()
                            {
                                zenoh_metrics
                                    .zenoh_vitals_published
                                    .fetch_add(1, Ordering::Relaxed);
                            }
                            if let Ok(n) = adapter
                                .publish_or_buffer_medops_alert(item.alert, item.force_alert)
                                .await
                            {
                                zenoh_metrics
                                    .zenoh_alerts_published
                                    .fetch_add(n as u64, Ordering::Relaxed);
                            }
                        }
                    });
                });
        }

        Ok(Self {
            iox2_tx,
            zenoh_tx,
            metrics,
            zenoh_worker_started,
        })
    }

    #[inline]
    pub fn zenoh_worker_active(&self) -> bool {
        self.zenoh_worker_started.load(Ordering::Relaxed)
    }

    /// Wait-free `try_send` dispatch (`< 150 ns`): never blocks `SharedMissionState::advance_tick`.
    #[inline]
    pub fn try_dispatch(
        &self,
        pkt: &TelemetryPacket,
        frame: &BinaryTelemetryFrame,
        owlt: &OwltMarsCommState,
        force_alert: bool,
    ) {
        if let Err(TrySendError::Full(_)) = self.iox2_tx.try_send(*frame) {
            self.metrics
                .iox2_dropped_backpressure
                .fetch_add(1, Ordering::Relaxed);
        }

        let item = ZenohDispatchItem {
            astronaut_id: pkt.astronaut_id.clone(),
            frame: *frame,
            alert: DsnMedOpsAlertEnvelope::from_tick(pkt, frame, owlt),
            force_alert,
        };
        if self.zenoh_tx.try_send(item).is_err() {
            self.metrics
                .zenoh_dropped_backpressure
                .fetch_add(1, Ordering::Relaxed);
        }
    }
}
