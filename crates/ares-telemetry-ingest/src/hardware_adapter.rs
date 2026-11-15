//! Air-gapped, safe-Rust hardware transport adapters for spacecraft buses.
//!
//! Provides deterministic ring-queued offline implementations for:
//! - BLE Bio-Monitor Wearable (`DeterministicMockBleAdapter`)
//! - UART ECLSS / Suit Serial (`DeterministicMockUartEclssAdapter`)
//! - UVC POCUS Diagnostic Probe (`DeterministicMockUvcPocusAdapter`)
//!
//! All adapters enforce CRC-16-CCITT (`0x1021`) frame validation and
//! Signal Quality Index (SQI) gating (`SQI_MIN_VALID_THRESHOLD = 0.70`)
//! with zero `unsafe`, zero OS driver FFI, and zero network sockets.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::VecDeque;

use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;
use ares_core_types::telemetry::StressTestScenarioInput;
use serde::{Deserialize, Serialize};

use crate::bidmc_replayer::IngestError;
use crate::sqi_filter::SqiFilter;
use crate::wearable_packet::{
    WEARABLE_PACKET_BYTES, WEARABLE_SYNC_WORD, WearableSensorPacket, compute_crc16_ccitt,
};

/// Default link liveness timeout in milliseconds when no valid frame is received.
pub const DEFAULT_LINK_TIMEOUT_MS: u64 = 5_000;

/// Default bounded capacity for deterministic offline ring queues.
pub const DEFAULT_RING_CAPACITY: usize = 64;

/// Sync word for UART ECLSS binary wire frames (`0xEC15`).
pub const UART_ECLSS_SYNC_WORD: u16 = 0xEC15;

/// Fixed byte length for UART ECLSS binary wire frames.
pub const UART_ECLSS_FRAME_BYTES: usize = 80;

/// Sync word for UVC POCUS metadata binary wire frames (`0x5043`, "PC").
pub const UVC_POCUS_SYNC_WORD: u16 = 0x5043;

/// Fixed byte length for UVC POCUS metadata binary wire frames.
pub const UVC_POCUS_FRAME_BYTES: usize = 52;

/// Spacecraft hardware bus classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SpacecraftBusKind {
    BleBioMonitorWearable,
    UartEclssSuitSerial,
    UvcPocusDiagnosticProbe,
}

/// Serializable wearable telemetry frame produced by BLE bio-monitor adapters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WearableTelemetryFrame {
    pub timestamp_ms: u64,
    pub node_id: u8,
    pub sequence_num: u32,
    pub uptime_ms: u32,
    pub supervisor_restart_count: u16,
    pub seu_recovery_event: bool,
    pub eva_suit_node: bool,
    pub hr_bpm: Option<f64>,
    pub spo2_pct: Option<f64>,
    pub resp_brpm: Option<f64>,
    pub rmssd_ms: Option<f64>,
    pub imu_rms_g: Option<f32>,
    pub sqi_score: f64,
    pub quality_flags: Vec<String>,
}

/// Unified hardware ingest envelope emitted by `HardwareTransportAdapter`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum HardwareIngestEnvelope {
    Wearable(WearableTelemetryFrame),
    EclssAtmosphere {
        timestamp_ms: u64,
        cabin_ppco2_mmhg: f64,
        helmet_ppco2_mmhg: Option<f64>,
        cabin_pressure_psi: f64,
        cabin_o2_pct: f64,
        nh3_ppm: f64,
        co_ppm: f64,
        hcn_ppm: f64,
    },
    UvcPocusMetadata {
        timestamp_ms: u64,
        probe_frequency_mhz: f64,
        b_mode_snr_db: f64,
        jugular_thrombus_confirmed: Option<bool>,
        efast_lung_sliding_left: Option<bool>,
        efast_lung_sliding_right: Option<bool>,
        efast_barcode_sign: Option<bool>,
        efast_pericardial_effusion_mm: Option<f64>,
        efast_morison_free_fluid: Option<bool>,
        bladder_volume_ml: Option<f64>,
    },
}

/// Safe-Rust hardware transport adapter abstraction for spacecraft telemetry buses.
pub trait HardwareTransportAdapter: Send + Sync {
    fn bus_kind(&self) -> SpacecraftBusKind;
    fn adapter_id(&self) -> &str;
    fn poll_next_envelope(&mut self) -> Result<Option<HardwareIngestEnvelope>, IngestError>;
    fn link_healthy(&self, now_timestamp_ms: u64) -> bool;
}

fn push_ring_frame(queue: &mut VecDeque<Vec<u8>>, capacity: usize, frame: Vec<u8>) {
    if capacity == 0 {
        return;
    }
    while queue.len() >= capacity {
        queue.pop_front();
    }
    queue.push_back(frame);
}

fn is_link_alive(
    last_valid_timestamp_ms: Option<u64>,
    now_timestamp_ms: u64,
    link_timeout_ms: u64,
) -> bool {
    match last_valid_timestamp_ms {
        Some(last) => {
            now_timestamp_ms >= last && now_timestamp_ms.saturating_sub(last) <= link_timeout_ms
        }
        None => false,
    }
}

/// Binary wire frame for `DeterministicMockUartEclssAdapter` with CRC-16-CCITT (`0x1021`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UartEclssWireFrame {
    pub timestamp_ms: u64,
    pub cabin_ppco2_mmhg: f64,
    pub helmet_ppco2_mmhg: Option<f64>,
    pub cabin_pressure_psi: f64,
    pub cabin_o2_pct: f64,
    pub nh3_ppm: f64,
    pub co_ppm: f64,
    pub hcn_ppm: f64,
    pub sqi_score_x10000: u16,
}

impl UartEclssWireFrame {
    /// Serializes the ECLSS frame into 80 little-endian bytes with trailing CRC-16-CCITT.
    pub fn to_le_bytes_with_crc(&self) -> [u8; UART_ECLSS_FRAME_BYTES] {
        let mut buf = [0u8; UART_ECLSS_FRAME_BYTES];
        buf[0..2].copy_from_slice(&UART_ECLSS_SYNC_WORD.to_le_bytes());
        buf[2] = u8::from(self.helmet_ppco2_mmhg.is_some());
        buf[3] = 0;
        buf[4..6].copy_from_slice(&self.sqi_score_x10000.to_le_bytes());
        buf[6..14].copy_from_slice(&self.timestamp_ms.to_le_bytes());
        buf[14..22].copy_from_slice(&self.cabin_ppco2_mmhg.to_le_bytes());
        buf[22..30].copy_from_slice(&self.helmet_ppco2_mmhg.unwrap_or(0.0).to_le_bytes());
        buf[30..38].copy_from_slice(&self.cabin_pressure_psi.to_le_bytes());
        buf[38..46].copy_from_slice(&self.cabin_o2_pct.to_le_bytes());
        buf[46..54].copy_from_slice(&self.nh3_ppm.to_le_bytes());
        buf[54..62].copy_from_slice(&self.co_ppm.to_le_bytes());
        buf[62..70].copy_from_slice(&self.hcn_ppm.to_le_bytes());
        // Bytes 70..78 reserved zero-padded for future ECLSS channels.
        let crc = compute_crc16_ccitt(&buf[0..78]);
        buf[78..80].copy_from_slice(&crc.to_le_bytes());
        buf
    }

    /// Decodes and verifies length, sync word (`0xEC15`), and CRC-16-CCITT (`0x1021`).
    pub fn decode_and_verify(bytes: &[u8]) -> Result<Self, IngestError> {
        if bytes.len() != UART_ECLSS_FRAME_BYTES {
            return Err(IngestError::InvalidWearablePacketLength {
                expected: UART_ECLSS_FRAME_BYTES,
                actual: bytes.len(),
            });
        }
        let sync_word = u16::from_le_bytes([bytes[0], bytes[1]]);
        if sync_word != UART_ECLSS_SYNC_WORD {
            return Err(IngestError::InvalidWearableSyncWord { found: sync_word });
        }
        let expected_crc = compute_crc16_ccitt(&bytes[0..78]);
        let found_crc = u16::from_le_bytes([bytes[78], bytes[79]]);
        if expected_crc != found_crc {
            return Err(IngestError::InvalidWearableCrc {
                expected: expected_crc,
                found: found_crc,
            });
        }
        let has_helmet = bytes[2] != 0;
        let sqi_score_x10000 = u16::from_le_bytes([bytes[4], bytes[5]]);
        let timestamp_ms = u64::from_le_bytes([
            bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13],
        ]);
        let cabin_ppco2_mmhg = f64::from_le_bytes([
            bytes[14], bytes[15], bytes[16], bytes[17], bytes[18], bytes[19], bytes[20], bytes[21],
        ]);
        let helmet_raw = f64::from_le_bytes([
            bytes[22], bytes[23], bytes[24], bytes[25], bytes[26], bytes[27], bytes[28], bytes[29],
        ]);
        let cabin_pressure_psi = f64::from_le_bytes([
            bytes[30], bytes[31], bytes[32], bytes[33], bytes[34], bytes[35], bytes[36], bytes[37],
        ]);
        let cabin_o2_pct = f64::from_le_bytes([
            bytes[38], bytes[39], bytes[40], bytes[41], bytes[42], bytes[43], bytes[44], bytes[45],
        ]);
        let nh3_ppm = f64::from_le_bytes([
            bytes[46], bytes[47], bytes[48], bytes[49], bytes[50], bytes[51], bytes[52], bytes[53],
        ]);
        let co_ppm = f64::from_le_bytes([
            bytes[54], bytes[55], bytes[56], bytes[57], bytes[58], bytes[59], bytes[60], bytes[61],
        ]);
        let hcn_ppm = f64::from_le_bytes([
            bytes[62], bytes[63], bytes[64], bytes[65], bytes[66], bytes[67], bytes[68], bytes[69],
        ]);
        Ok(Self {
            timestamp_ms,
            cabin_ppco2_mmhg,
            helmet_ppco2_mmhg: if has_helmet && helmet_raw.is_finite() {
                Some(helmet_raw)
            } else {
                None
            },
            cabin_pressure_psi,
            cabin_o2_pct,
            nh3_ppm,
            co_ppm,
            hcn_ppm,
            sqi_score_x10000,
        })
    }

    #[inline]
    pub fn sqi_score(&self) -> f64 {
        (f64::from(self.sqi_score_x10000) / 10_000.0).clamp(0.0, 1.0)
    }
}

/// Binary wire frame for `DeterministicMockUvcPocusAdapter` with CRC-16-CCITT (`0x1021`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UvcPocusWireFrame {
    pub timestamp_ms: u64,
    pub probe_frequency_mhz: f64,
    pub b_mode_snr_db: f64,
    pub jugular_thrombus_confirmed: Option<bool>,
    pub efast_lung_sliding_left: Option<bool>,
    pub efast_lung_sliding_right: Option<bool>,
    pub efast_barcode_sign: Option<bool>,
    pub efast_pericardial_effusion_mm: Option<f64>,
    pub efast_morison_free_fluid: Option<bool>,
    pub bladder_volume_ml: Option<f64>,
    pub sqi_score_x10000: u16,
}

fn encode_opt_bool(v: Option<bool>) -> u8 {
    match v {
        None => 0,
        Some(false) => 1,
        Some(true) => 2,
    }
}

fn decode_opt_bool(raw: u8) -> Option<bool> {
    match raw {
        1 => Some(false),
        2 => Some(true),
        _ => None,
    }
}

impl UvcPocusWireFrame {
    /// Serializes the UVC POCUS frame into 52 little-endian bytes with trailing CRC-16-CCITT.
    pub fn to_le_bytes_with_crc(&self) -> [u8; UVC_POCUS_FRAME_BYTES] {
        let mut buf = [0u8; UVC_POCUS_FRAME_BYTES];
        buf[0..2].copy_from_slice(&UVC_POCUS_SYNC_WORD.to_le_bytes());
        buf[2..4].copy_from_slice(&self.sqi_score_x10000.to_le_bytes());
        buf[4..12].copy_from_slice(&self.timestamp_ms.to_le_bytes());
        buf[12..20].copy_from_slice(&self.probe_frequency_mhz.to_le_bytes());
        buf[20..28].copy_from_slice(&self.b_mode_snr_db.to_le_bytes());
        buf[28] = encode_opt_bool(self.jugular_thrombus_confirmed);
        buf[29] = encode_opt_bool(self.efast_lung_sliding_left);
        buf[30] = encode_opt_bool(self.efast_lung_sliding_right);
        buf[31] = encode_opt_bool(self.efast_barcode_sign);
        buf[32] = encode_opt_bool(self.efast_morison_free_fluid);
        let mut opt_f64_mask: u8 = 0;
        if self.efast_pericardial_effusion_mm.is_some() {
            opt_f64_mask |= 1 << 0;
        }
        if self.bladder_volume_ml.is_some() {
            opt_f64_mask |= 1 << 1;
        }
        buf[33] = opt_f64_mask;
        buf[34..42].copy_from_slice(
            &self
                .efast_pericardial_effusion_mm
                .unwrap_or(0.0)
                .to_le_bytes(),
        );
        buf[42..50].copy_from_slice(&self.bladder_volume_ml.unwrap_or(0.0).to_le_bytes());
        let crc = compute_crc16_ccitt(&buf[0..50]);
        buf[50..52].copy_from_slice(&crc.to_le_bytes());
        buf
    }

    /// Decodes and verifies length, sync word (`0x5043`), and CRC-16-CCITT (`0x1021`).
    pub fn decode_and_verify(bytes: &[u8]) -> Result<Self, IngestError> {
        if bytes.len() != UVC_POCUS_FRAME_BYTES {
            return Err(IngestError::InvalidWearablePacketLength {
                expected: UVC_POCUS_FRAME_BYTES,
                actual: bytes.len(),
            });
        }
        let sync_word = u16::from_le_bytes([bytes[0], bytes[1]]);
        if sync_word != UVC_POCUS_SYNC_WORD {
            return Err(IngestError::InvalidWearableSyncWord { found: sync_word });
        }
        let expected_crc = compute_crc16_ccitt(&bytes[0..50]);
        let found_crc = u16::from_le_bytes([bytes[50], bytes[51]]);
        if expected_crc != found_crc {
            return Err(IngestError::InvalidWearableCrc {
                expected: expected_crc,
                found: found_crc,
            });
        }
        let sqi_score_x10000 = u16::from_le_bytes([bytes[2], bytes[3]]);
        let timestamp_ms = u64::from_le_bytes([
            bytes[4], bytes[5], bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11],
        ]);
        let probe_frequency_mhz = f64::from_le_bytes([
            bytes[12], bytes[13], bytes[14], bytes[15], bytes[16], bytes[17], bytes[18], bytes[19],
        ]);
        let b_mode_snr_db = f64::from_le_bytes([
            bytes[20], bytes[21], bytes[22], bytes[23], bytes[24], bytes[25], bytes[26], bytes[27],
        ]);
        let opt_f64_mask = bytes[33];
        let effusion_raw = f64::from_le_bytes([
            bytes[34], bytes[35], bytes[36], bytes[37], bytes[38], bytes[39], bytes[40], bytes[41],
        ]);
        let bladder_raw = f64::from_le_bytes([
            bytes[42], bytes[43], bytes[44], bytes[45], bytes[46], bytes[47], bytes[48], bytes[49],
        ]);
        Ok(Self {
            timestamp_ms,
            probe_frequency_mhz,
            b_mode_snr_db,
            jugular_thrombus_confirmed: decode_opt_bool(bytes[28]),
            efast_lung_sliding_left: decode_opt_bool(bytes[29]),
            efast_lung_sliding_right: decode_opt_bool(bytes[30]),
            efast_barcode_sign: decode_opt_bool(bytes[31]),
            efast_morison_free_fluid: decode_opt_bool(bytes[32]),
            efast_pericardial_effusion_mm: if (opt_f64_mask & (1 << 0)) != 0
                && effusion_raw.is_finite()
            {
                Some(effusion_raw)
            } else {
                None
            },
            bladder_volume_ml: if (opt_f64_mask & (1 << 1)) != 0 && bladder_raw.is_finite() {
                Some(bladder_raw)
            } else {
                None
            },
            sqi_score_x10000,
        })
    }

    #[inline]
    pub fn sqi_score(&self) -> f64 {
        (f64::from(self.sqi_score_x10000) / 10_000.0).clamp(0.0, 1.0)
    }
}

/// Deterministic offline ring-queued adapter for BLE bio-monitor wearables.
#[derive(Debug, Clone)]
pub struct DeterministicMockBleAdapter {
    adapter_id: String,
    ring_queue: VecDeque<Vec<u8>>,
    ring_capacity: usize,
    sqi_filter: SqiFilter,
    scenario: StressTestScenarioInput,
    last_valid_timestamp_ms: Option<u64>,
    link_timeout_ms: u64,
    crc_error_count: u64,
    sqi_dropped_count: u64,
}

impl DeterministicMockBleAdapter {
    pub fn new(adapter_id: impl Into<String>) -> Self {
        let adapter_id = adapter_id.into();
        let scenario = StressTestScenarioInput {
            source_record_id: adapter_id.clone(),
            flight_day: 0,
            ared_daily_load_kgf: 0.0,
            radiation_dose_rate_msv_d: 0.0,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 0.0,
        };
        Self {
            adapter_id,
            ring_queue: VecDeque::with_capacity(DEFAULT_RING_CAPACITY),
            ring_capacity: DEFAULT_RING_CAPACITY,
            sqi_filter: SqiFilter::new(),
            scenario,
            last_valid_timestamp_ms: None,
            link_timeout_ms: DEFAULT_LINK_TIMEOUT_MS,
            crc_error_count: 0,
            sqi_dropped_count: 0,
        }
    }

    pub fn with_ring_capacity(mut self, capacity: usize) -> Self {
        self.ring_capacity = capacity.max(1);
        self
    }

    pub fn with_link_timeout_ms(mut self, timeout_ms: u64) -> Self {
        self.link_timeout_ms = timeout_ms;
        self
    }

    pub fn push_raw_frame(&mut self, raw_bytes: Vec<u8>) {
        push_ring_frame(&mut self.ring_queue, self.ring_capacity, raw_bytes);
    }

    pub fn push_packet(&mut self, packet: &WearableSensorPacket) {
        let mut normalized = *packet;
        normalized.sync_word = WEARABLE_SYNC_WORD;
        let bytes: [u8; WEARABLE_PACKET_BYTES] = normalized.to_le_bytes_with_crc();
        self.push_raw_frame(bytes.to_vec());
    }

    pub fn queued_len(&self) -> usize {
        self.ring_queue.len()
    }

    pub fn crc_error_count(&self) -> u64 {
        self.crc_error_count
    }

    pub fn sqi_dropped_count(&self) -> u64 {
        self.sqi_dropped_count
    }
}

impl HardwareTransportAdapter for DeterministicMockBleAdapter {
    fn bus_kind(&self) -> SpacecraftBusKind {
        SpacecraftBusKind::BleBioMonitorWearable
    }

    fn adapter_id(&self) -> &str {
        &self.adapter_id
    }

    fn poll_next_envelope(&mut self) -> Result<Option<HardwareIngestEnvelope>, IngestError> {
        while let Some(raw_bytes) = self.ring_queue.pop_front() {
            let pkt = match WearableSensorPacket::decode_and_verify(&raw_bytes) {
                Ok(p) => p,
                Err(e) => {
                    self.crc_error_count += 1;
                    return Err(e);
                }
            };
            let packet_sqi = (f64::from(pkt.sqi_score_x10000) / 10_000.0).clamp(0.0, 1.0);
            let validated = pkt.to_validated_frame(&self.adapter_id, &self.scenario, &mut self.sqi_filter);
            if packet_sqi < SQI_MIN_VALID_THRESHOLD
                || validated.sqi_evaluation.sqi_score < SQI_MIN_VALID_THRESHOLD
            {
                self.sqi_dropped_count += 1;
                continue;
            }
            let timestamp_ms = u64::from(validated.uptime_ms);
            self.last_valid_timestamp_ms = Some(timestamp_ms);
            return Ok(Some(HardwareIngestEnvelope::Wearable(
                WearableTelemetryFrame {
                    timestamp_ms,
                    node_id: validated.node_id,
                    sequence_num: validated.sequence_num,
                    uptime_ms: validated.uptime_ms,
                    supervisor_restart_count: validated.supervisor_restart_count,
                    seu_recovery_event: validated.seu_recovery_event,
                    eva_suit_node: validated.eva_suit_node,
                    hr_bpm: validated.row.hr_bpm,
                    spo2_pct: validated.row.spo2_pct,
                    resp_brpm: validated.row.resp_brpm,
                    rmssd_ms: validated.sqi_evaluation.rmssd_ms,
                    imu_rms_g: validated.imu_rms_g,
                    sqi_score: packet_sqi.min(validated.sqi_evaluation.sqi_score),
                    quality_flags: validated.sqi_evaluation.quality_flags,
                },
            )));
        }
        Ok(None)
    }

    fn link_healthy(&self, now_timestamp_ms: u64) -> bool {
        is_link_alive(
            self.last_valid_timestamp_ms,
            now_timestamp_ms,
            self.link_timeout_ms,
        )
    }
}

/// Deterministic offline ring-queued adapter for UART ECLSS / EVA suit serial telemetry.
#[derive(Debug, Clone)]
pub struct DeterministicMockUartEclssAdapter {
    adapter_id: String,
    ring_queue: VecDeque<Vec<u8>>,
    ring_capacity: usize,
    last_valid_timestamp_ms: Option<u64>,
    link_timeout_ms: u64,
    crc_error_count: u64,
    sqi_dropped_count: u64,
}

impl DeterministicMockUartEclssAdapter {
    pub fn new(adapter_id: impl Into<String>) -> Self {
        Self {
            adapter_id: adapter_id.into(),
            ring_queue: VecDeque::with_capacity(DEFAULT_RING_CAPACITY),
            ring_capacity: DEFAULT_RING_CAPACITY,
            last_valid_timestamp_ms: None,
            link_timeout_ms: DEFAULT_LINK_TIMEOUT_MS,
            crc_error_count: 0,
            sqi_dropped_count: 0,
        }
    }

    pub fn with_ring_capacity(mut self, capacity: usize) -> Self {
        self.ring_capacity = capacity.max(1);
        self
    }

    pub fn with_link_timeout_ms(mut self, timeout_ms: u64) -> Self {
        self.link_timeout_ms = timeout_ms;
        self
    }

    pub fn push_raw_frame(&mut self, raw_bytes: Vec<u8>) {
        push_ring_frame(&mut self.ring_queue, self.ring_capacity, raw_bytes);
    }

    pub fn push_frame(&mut self, frame: &UartEclssWireFrame) {
        self.push_raw_frame(frame.to_le_bytes_with_crc().to_vec());
    }

    pub fn queued_len(&self) -> usize {
        self.ring_queue.len()
    }

    pub fn crc_error_count(&self) -> u64 {
        self.crc_error_count
    }

    pub fn sqi_dropped_count(&self) -> u64 {
        self.sqi_dropped_count
    }
}

impl HardwareTransportAdapter for DeterministicMockUartEclssAdapter {
    fn bus_kind(&self) -> SpacecraftBusKind {
        SpacecraftBusKind::UartEclssSuitSerial
    }

    fn adapter_id(&self) -> &str {
        &self.adapter_id
    }

    fn poll_next_envelope(&mut self) -> Result<Option<HardwareIngestEnvelope>, IngestError> {
        while let Some(raw_bytes) = self.ring_queue.pop_front() {
            let decoded = match UartEclssWireFrame::decode_and_verify(&raw_bytes) {
                Ok(f) => f,
                Err(e) => {
                    self.crc_error_count += 1;
                    return Err(e);
                }
            };
            if decoded.sqi_score() < SQI_MIN_VALID_THRESHOLD {
                self.sqi_dropped_count += 1;
                continue;
            }
            self.last_valid_timestamp_ms = Some(decoded.timestamp_ms);
            return Ok(Some(HardwareIngestEnvelope::EclssAtmosphere {
                timestamp_ms: decoded.timestamp_ms,
                cabin_ppco2_mmhg: decoded.cabin_ppco2_mmhg,
                helmet_ppco2_mmhg: decoded.helmet_ppco2_mmhg,
                cabin_pressure_psi: decoded.cabin_pressure_psi,
                cabin_o2_pct: decoded.cabin_o2_pct,
                nh3_ppm: decoded.nh3_ppm,
                co_ppm: decoded.co_ppm,
                hcn_ppm: decoded.hcn_ppm,
            }));
        }
        Ok(None)
    }

    fn link_healthy(&self, now_timestamp_ms: u64) -> bool {
        is_link_alive(
            self.last_valid_timestamp_ms,
            now_timestamp_ms,
            self.link_timeout_ms,
        )
    }
}

/// Deterministic offline ring-queued adapter for UVC POCUS diagnostic ultrasound probes.
#[derive(Debug, Clone)]
pub struct DeterministicMockUvcPocusAdapter {
    adapter_id: String,
    ring_queue: VecDeque<Vec<u8>>,
    ring_capacity: usize,
    last_valid_timestamp_ms: Option<u64>,
    link_timeout_ms: u64,
    crc_error_count: u64,
    sqi_dropped_count: u64,
}

impl DeterministicMockUvcPocusAdapter {
    pub fn new(adapter_id: impl Into<String>) -> Self {
        Self {
            adapter_id: adapter_id.into(),
            ring_queue: VecDeque::with_capacity(DEFAULT_RING_CAPACITY),
            ring_capacity: DEFAULT_RING_CAPACITY,
            last_valid_timestamp_ms: None,
            link_timeout_ms: DEFAULT_LINK_TIMEOUT_MS,
            crc_error_count: 0,
            sqi_dropped_count: 0,
        }
    }

    pub fn with_ring_capacity(mut self, capacity: usize) -> Self {
        self.ring_capacity = capacity.max(1);
        self
    }

    pub fn with_link_timeout_ms(mut self, timeout_ms: u64) -> Self {
        self.link_timeout_ms = timeout_ms;
        self
    }

    pub fn push_raw_frame(&mut self, raw_bytes: Vec<u8>) {
        push_ring_frame(&mut self.ring_queue, self.ring_capacity, raw_bytes);
    }

    pub fn push_frame(&mut self, frame: &UvcPocusWireFrame) {
        self.push_raw_frame(frame.to_le_bytes_with_crc().to_vec());
    }

    pub fn queued_len(&self) -> usize {
        self.ring_queue.len()
    }

    pub fn crc_error_count(&self) -> u64 {
        self.crc_error_count
    }

    pub fn sqi_dropped_count(&self) -> u64 {
        self.sqi_dropped_count
    }
}

impl HardwareTransportAdapter for DeterministicMockUvcPocusAdapter {
    fn bus_kind(&self) -> SpacecraftBusKind {
        SpacecraftBusKind::UvcPocusDiagnosticProbe
    }

    fn adapter_id(&self) -> &str {
        &self.adapter_id
    }

    fn poll_next_envelope(&mut self) -> Result<Option<HardwareIngestEnvelope>, IngestError> {
        while let Some(raw_bytes) = self.ring_queue.pop_front() {
            let decoded = match UvcPocusWireFrame::decode_and_verify(&raw_bytes) {
                Ok(f) => f,
                Err(e) => {
                    self.crc_error_count += 1;
                    return Err(e);
                }
            };
            if decoded.sqi_score() < SQI_MIN_VALID_THRESHOLD {
                self.sqi_dropped_count += 1;
                continue;
            }
            self.last_valid_timestamp_ms = Some(decoded.timestamp_ms);
            return Ok(Some(HardwareIngestEnvelope::UvcPocusMetadata {
                timestamp_ms: decoded.timestamp_ms,
                probe_frequency_mhz: decoded.probe_frequency_mhz,
                b_mode_snr_db: decoded.b_mode_snr_db,
                jugular_thrombus_confirmed: decoded.jugular_thrombus_confirmed,
                efast_lung_sliding_left: decoded.efast_lung_sliding_left,
                efast_lung_sliding_right: decoded.efast_lung_sliding_right,
                efast_barcode_sign: decoded.efast_barcode_sign,
                efast_pericardial_effusion_mm: decoded.efast_pericardial_effusion_mm,
                efast_morison_free_fluid: decoded.efast_morison_free_fluid,
                bladder_volume_ml: decoded.bladder_volume_ml,
            }));
        }
        Ok(None)
    }

    fn link_healthy(&self, now_timestamp_ms: u64) -> bool {
        is_link_alive(
            self.last_valid_timestamp_ms,
            now_timestamp_ms,
            self.link_timeout_ms,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wearable_packet::{
        WFLAG_EVA_SUIT_NODE, WMASK_HR_BPM, WMASK_IMU_RMS, WMASK_RESP_BRPM, WMASK_SPO2_PCT,
    };

    fn sample_wearable_packet(seq: u32, uptime_ms: u32, sqi_x10000: u16) -> WearableSensorPacket {
        WearableSensorPacket {
            sync_word: WEARABLE_SYNC_WORD,
            node_id: 7,
            channel_mask: WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM | WMASK_IMU_RMS,
            sequence_num: seq,
            uptime_ms,
            supervisor_restart_count: 0,
            hr_bpm_x100: 7200,
            spo2_pct_x100: 9850,
            resp_brpm_x100: 1400,
            rr_interval_ms_x10: 8330,
            sqi_score_x10000: sqi_x10000,
            imu_rms_g: 0.04,
            flags: WFLAG_EVA_SUIT_NODE,
            crc16_ccitt: 0,
        }
    }

    fn sample_eclss_frame(timestamp_ms: u64, sqi_x10000: u16) -> UartEclssWireFrame {
        UartEclssWireFrame {
            timestamp_ms,
            cabin_ppco2_mmhg: 2.3,
            helmet_ppco2_mmhg: Some(3.1),
            cabin_pressure_psi: 14.7,
            cabin_o2_pct: 20.9,
            nh3_ppm: 0.2,
            co_ppm: 0.5,
            hcn_ppm: 0.0,
            sqi_score_x10000: sqi_x10000,
        }
    }

    fn sample_pocus_frame(timestamp_ms: u64, sqi_x10000: u16) -> UvcPocusWireFrame {
        UvcPocusWireFrame {
            timestamp_ms,
            probe_frequency_mhz: 7.5,
            b_mode_snr_db: 28.4,
            jugular_thrombus_confirmed: Some(false),
            efast_lung_sliding_left: Some(true),
            efast_lung_sliding_right: Some(true),
            efast_barcode_sign: Some(false),
            efast_pericardial_effusion_mm: Some(0.0),
            efast_morison_free_fluid: Some(false),
            bladder_volume_ml: Some(185.0),
            sqi_score_x10000: sqi_x10000,
        }
    }

    #[test]
    fn ble_adapter_decodes_valid_frame_and_updates_liveness() -> Result<(), IngestError> {
        let mut adapter = DeterministicMockBleAdapter::new("ble-bio-01");
        assert_eq!(adapter.bus_kind(), SpacecraftBusKind::BleBioMonitorWearable);
        assert_eq!(adapter.adapter_id(), "ble-bio-01");
        assert!(!adapter.link_healthy(1_000));

        adapter.push_packet(&sample_wearable_packet(1, 1_000, 9_200));
        let env = adapter.poll_next_envelope()?;
        assert!(matches!(env, Some(HardwareIngestEnvelope::Wearable(_))));
        if let Some(HardwareIngestEnvelope::Wearable(frame)) = env {
            assert_eq!(frame.timestamp_ms, 1_000);
            assert_eq!(frame.node_id, 7);
            assert_eq!(frame.hr_bpm, Some(72.0));
            assert_eq!(frame.spo2_pct, Some(98.5));
            assert!(frame.sqi_score >= SQI_MIN_VALID_THRESHOLD);
        }

        assert!(adapter.link_healthy(1_000));
        assert!(adapter.link_healthy(6_000));
        assert!(!adapter.link_healthy(6_001));
        assert_eq!(adapter.poll_next_envelope()?, None);
        Ok(())
    }

    #[test]
    fn ble_adapter_rejects_corrupted_crc_and_gates_low_sqi() -> Result<(), IngestError> {
        let mut adapter = DeterministicMockBleAdapter::new("ble-bio-02");
        let mut raw = sample_wearable_packet(2, 2_000, 9_000)
            .to_le_bytes_with_crc()
            .to_vec();
        raw[15] ^= 0xFF; // Corrupt HR byte without updating CRC-16-CCITT
        adapter.push_raw_frame(raw);

        let err = adapter.poll_next_envelope();
        assert!(matches!(err, Err(IngestError::InvalidWearableCrc { .. })));
        assert_eq!(adapter.crc_error_count(), 1);
        assert!(!adapter.link_healthy(2_000));

        // Low SQI (0.69 < 0.70) must be gated out, while subsequent valid frame (0.70) passes.
        adapter.push_packet(&sample_wearable_packet(3, 3_000, 6_900));
        adapter.push_packet(&sample_wearable_packet(4, 4_000, 7_000));
        let env = adapter.poll_next_envelope()?;
        assert_eq!(adapter.sqi_dropped_count(), 1);
        assert!(matches!(
            env,
            Some(HardwareIngestEnvelope::Wearable(WearableTelemetryFrame {
                sequence_num: 4,
                ..
            }))
        ));
        Ok(())
    }

    #[test]
    fn uart_eclss_adapter_crc_and_sqi_gating() -> Result<(), IngestError> {
        let mut adapter = DeterministicMockUartEclssAdapter::new("uart-eclss-01");
        assert_eq!(adapter.bus_kind(), SpacecraftBusKind::UartEclssSuitSerial);

        let valid = sample_eclss_frame(10_000, 8_500);
        let low_sqi = sample_eclss_frame(11_000, 6_500);
        adapter.push_frame(&low_sqi);
        adapter.push_frame(&valid);

        let env = adapter.poll_next_envelope()?;
        assert_eq!(adapter.sqi_dropped_count(), 1);
        assert_eq!(
            env,
            Some(HardwareIngestEnvelope::EclssAtmosphere {
                timestamp_ms: 10_000,
                cabin_ppco2_mmhg: 2.3,
                helmet_ppco2_mmhg: Some(3.1),
                cabin_pressure_psi: 14.7,
                cabin_o2_pct: 20.9,
                nh3_ppm: 0.2,
                co_ppm: 0.5,
                hcn_ppm: 0.0,
            })
        );
        assert!(adapter.link_healthy(12_000));

        let mut bad_crc = valid.to_le_bytes_with_crc().to_vec();
        bad_crc[20] ^= 0x01;
        adapter.push_raw_frame(bad_crc);
        assert!(matches!(
            adapter.poll_next_envelope(),
            Err(IngestError::InvalidWearableCrc { .. })
        ));
        assert_eq!(adapter.crc_error_count(), 1);
        Ok(())
    }

    #[test]
    fn uvc_pocus_adapter_crc_sqi_and_ring_overflow() -> Result<(), IngestError> {
        let mut adapter = DeterministicMockUvcPocusAdapter::new("uvc-pocus-01")
            .with_ring_capacity(2)
            .with_link_timeout_ms(2_500);
        assert_eq!(
            adapter.bus_kind(),
            SpacecraftBusKind::UvcPocusDiagnosticProbe
        );

        // Push 3 frames into capacity-2 ring: oldest (1000) is evicted.
        adapter.push_frame(&sample_pocus_frame(1_000, 9_500));
        adapter.push_frame(&sample_pocus_frame(2_000, 5_000)); // low SQI -> gated
        adapter.push_frame(&sample_pocus_frame(3_000, 9_000));
        assert_eq!(adapter.queued_len(), 2);

        let env = adapter.poll_next_envelope()?;
        assert_eq!(adapter.sqi_dropped_count(), 1);
        assert!(matches!(
            env,
            Some(HardwareIngestEnvelope::UvcPocusMetadata {
                timestamp_ms: 3_000,
                jugular_thrombus_confirmed: Some(false),
                efast_lung_sliding_left: Some(true),
                bladder_volume_ml: Some(185.0),
                ..
            })
        ));
        assert!(adapter.link_healthy(5_500));
        assert!(!adapter.link_healthy(5_501));

        let mut bad_sync = sample_pocus_frame(4_000, 9_000)
            .to_le_bytes_with_crc()
            .to_vec();
        bad_sync[0] = 0x00;
        adapter.push_raw_frame(bad_sync);
        assert!(matches!(
            adapter.poll_next_envelope(),
            Err(IngestError::InvalidWearableSyncWord { .. })
        ));
        Ok(())
    }

    #[test]
    fn hardware_ingest_envelope_implements_serde_traits() {
        fn assert_serde<T: serde::Serialize + for<'de> serde::Deserialize<'de>>() {}
        assert_serde::<SpacecraftBusKind>();
        assert_serde::<WearableTelemetryFrame>();
        assert_serde::<HardwareIngestEnvelope>();
    }

    #[test]
    fn trait_objects_are_send_sync_and_polymorphic() -> Result<(), IngestError> {
        let mut ble = DeterministicMockBleAdapter::new("ble-poly");
        ble.push_packet(&sample_wearable_packet(10, 500, 9_500));

        let mut eclss = DeterministicMockUartEclssAdapter::new("uart-poly");
        eclss.push_frame(&sample_eclss_frame(600, 9_500));

        let mut pocus = DeterministicMockUvcPocusAdapter::new("uvc-poly");
        pocus.push_frame(&sample_pocus_frame(700, 9_500));

        let mut adapters: Vec<Box<dyn HardwareTransportAdapter>> =
            vec![Box::new(ble), Box::new(eclss), Box::new(pocus)];
        let mut envelopes = Vec::new();
        for adapter in &mut adapters {
            if let Some(env) = adapter.poll_next_envelope()? {
                envelopes.push(env);
            }
        }
        assert_eq!(envelopes.len(), 3);
        Ok(())
    }
}
