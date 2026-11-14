//! Fase 24 (J4): Framing binario per nodi wearable Tier C (Oxide Hubris / Embassy)
//! con verifica CRC-16-CCITT (0x1021), tracciamento restart SEU (`supervisor_restart_count`),
//! conversione in `BidmcNumericRow` / `ValidatedTelemetryFrame` e preservazione nullabilita HRV.

use crate::bidmc_replayer::{BidmcNumericRow, IngestError};
use crate::scenario_overlay::biometrics_with_signal_quality;
use crate::sqi_filter::{SqiEvaluation, SqiFilter};
use ares_core_types::telemetry::{Biometrics, HrvUnavailableReason, StressTestScenarioInput};
use core::mem::{align_of, offset_of, size_of};

pub const WEARABLE_SYNC_WORD: u16 = 0xAA55;
pub const WEARABLE_PACKET_BYTES: usize = 32;

pub const WMASK_RR_INTERVAL: u8 = 1 << 0;
pub const WMASK_HR_BPM: u8 = 1 << 1;
pub const WMASK_SPO2_PCT: u8 = 1 << 2;
pub const WMASK_RESP_BRPM: u8 = 1 << 3;
pub const WMASK_IMU_RMS: u8 = 1 << 4;

pub const WFLAG_SEU_RECOVERY_EVENT: u16 = 1 << 0;
pub const WFLAG_BLE_RETRANSMIT: u16 = 1 << 1;
pub const WFLAG_EVA_SUIT_NODE: u16 = 1 << 2;

/// Pacchetto binario fisso da 32 byte generato da nodi Tier C (`Oxide Hubris` / `Embassy`).
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WearableSensorPacket {
    pub sync_word: u16,
    pub node_id: u8,
    pub channel_mask: u8,
    pub sequence_num: u32,
    pub uptime_ms: u32,
    pub supervisor_restart_count: u16,
    pub hr_bpm_x100: u16,
    pub spo2_pct_x100: u16,
    pub resp_brpm_x100: u16,
    pub rr_interval_ms_x10: u16,
    pub sqi_score_x10000: u16,
    pub imu_rms_g: f32,
    pub flags: u16,
    pub crc16_ccitt: u16,
}

const _: () = assert!(size_of::<WearableSensorPacket>() == WEARABLE_PACKET_BYTES);
const _: () = assert!(align_of::<WearableSensorPacket>() == 4);
const _: () = assert!(offset_of!(WearableSensorPacket, sync_word) == 0);
const _: () = assert!(offset_of!(WearableSensorPacket, sequence_num) == 4);
const _: () = assert!(offset_of!(WearableSensorPacket, uptime_ms) == 8);
const _: () = assert!(offset_of!(WearableSensorPacket, supervisor_restart_count) == 12);
const _: () = assert!(offset_of!(WearableSensorPacket, imu_rms_g) == 24);
const _: () = assert!(offset_of!(WearableSensorPacket, crc16_ccitt) == 30);

/// Frame telemetrico validato ottenuto dalla decodifica di un `WearableSensorPacket`.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidatedTelemetryFrame {
    pub row: BidmcNumericRow,
    pub biometrics: Biometrics,
    pub sqi_evaluation: SqiEvaluation,
    pub node_id: u8,
    pub sequence_num: u32,
    pub uptime_ms: u32,
    pub supervisor_restart_count: u16,
    pub seu_recovery_event: bool,
    pub eva_suit_node: bool,
    pub imu_rms_g: Option<f32>,
}

/// Calcola il checksum CRC-16-CCITT (polinomio `0x1021`, valore iniziale `0xFFFF`).
#[inline]
pub fn compute_crc16_ccitt(bytes: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &b in bytes {
        crc ^= u16::from(b) << 8;
        for _ in 0..8 {
            if (crc & 0x8000) != 0 {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

impl WearableSensorPacket {
    /// Serializza il pacchetto nei 32 byte little-endian calcolando automaticamente il CRC-16-CCITT.
    pub fn to_le_bytes_with_crc(&self) -> [u8; WEARABLE_PACKET_BYTES] {
        let mut buf = [0u8; WEARABLE_PACKET_BYTES];
        buf[0..2].copy_from_slice(&self.sync_word.to_le_bytes());
        buf[2] = self.node_id;
        buf[3] = self.channel_mask;
        buf[4..8].copy_from_slice(&self.sequence_num.to_le_bytes());
        buf[8..12].copy_from_slice(&self.uptime_ms.to_le_bytes());
        buf[12..14].copy_from_slice(&self.supervisor_restart_count.to_le_bytes());
        buf[14..16].copy_from_slice(&self.hr_bpm_x100.to_le_bytes());
        buf[16..18].copy_from_slice(&self.spo2_pct_x100.to_le_bytes());
        buf[18..20].copy_from_slice(&self.resp_brpm_x100.to_le_bytes());
        buf[20..22].copy_from_slice(&self.rr_interval_ms_x10.to_le_bytes());
        buf[22..24].copy_from_slice(&self.sqi_score_x10000.to_le_bytes());
        buf[24..28].copy_from_slice(&self.imu_rms_g.to_le_bytes());
        buf[28..30].copy_from_slice(&self.flags.to_le_bytes());
        let crc = compute_crc16_ccitt(&buf[0..30]);
        buf[30..32].copy_from_slice(&crc.to_le_bytes());
        buf
    }

    /// Alias compatibile di `to_le_bytes_with_crc`.
    #[inline]
    pub fn to_le_bytes(&self) -> [u8; WEARABLE_PACKET_BYTES] {
        self.to_le_bytes_with_crc()
    }

    /// Decodifica e verifica `sync_word` e `CRC-16-CCITT` senza panici.
    pub fn decode_and_verify(bytes: &[u8]) -> Result<Self, IngestError> {
        if bytes.len() != WEARABLE_PACKET_BYTES {
            return Err(IngestError::InvalidWearablePacketLength {
                expected: WEARABLE_PACKET_BYTES,
                actual: bytes.len(),
            });
        }
        let sync_word = u16::from_le_bytes([bytes[0], bytes[1]]);
        if sync_word != WEARABLE_SYNC_WORD {
            return Err(IngestError::InvalidWearableSyncWord { found: sync_word });
        }
        let expected_crc = compute_crc16_ccitt(&bytes[0..30]);
        let found_crc = u16::from_le_bytes([bytes[30], bytes[31]]);
        if expected_crc != found_crc {
            return Err(IngestError::InvalidWearableCrc {
                expected: expected_crc,
                found: found_crc,
            });
        }
        Ok(Self {
            sync_word,
            node_id: bytes[2],
            channel_mask: bytes[3],
            sequence_num: u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
            uptime_ms: u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]),
            supervisor_restart_count: u16::from_le_bytes([bytes[12], bytes[13]]),
            hr_bpm_x100: u16::from_le_bytes([bytes[14], bytes[15]]),
            spo2_pct_x100: u16::from_le_bytes([bytes[16], bytes[17]]),
            resp_brpm_x100: u16::from_le_bytes([bytes[18], bytes[19]]),
            rr_interval_ms_x10: u16::from_le_bytes([bytes[20], bytes[21]]),
            sqi_score_x10000: u16::from_le_bytes([bytes[22], bytes[23]]),
            imu_rms_g: f32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]),
            flags: u16::from_le_bytes([bytes[28], bytes[29]]),
            crc16_ccitt: found_crc,
        })
    }

    /// Alias compatibile di `decode_and_verify`.
    #[inline]
    pub fn from_le_bytes(bytes: &[u8]) -> Result<Self, IngestError> {
        Self::decode_and_verify(bytes)
    }

    /// Converte il pacchetto verificato in una riga canonica `BidmcNumericRow`
    /// preservando come `None` i canali non attivi in `channel_mask`.
    pub fn to_bidmc_numeric_row(&self, record_id: &str) -> BidmcNumericRow {
        let mut missing_channels = Vec::new();
        let hr_bpm = if (self.channel_mask & WMASK_HR_BPM) != 0 {
            Some(f64::from(self.hr_bpm_x100) / 100.0)
        } else {
            missing_channels.push("heart_rate_bpm".to_string());
            None
        };
        missing_channels.push("pulse_rate_bpm".to_string());
        let resp_brpm = if (self.channel_mask & WMASK_RESP_BRPM) != 0 {
            Some(f64::from(self.resp_brpm_x100) / 100.0)
        } else {
            missing_channels.push("resp_rate_brpm".to_string());
            None
        };
        let spo2_pct = if (self.channel_mask & WMASK_SPO2_PCT) != 0 {
            Some(f64::from(self.spo2_pct_x100) / 100.0)
        } else {
            missing_channels.push("spo2_pct".to_string());
            None
        };

        BidmcNumericRow {
            record_id: record_id.to_string(),
            relative_time_s: f64::from(self.uptime_ms) / 1000.0,
            hr_bpm,
            pulse_bpm: None,
            resp_brpm,
            spo2_pct,
            missing_channels,
        }
    }

    /// Converte il pacchetto verificato in `Biometrics`, mantenendo `rmssd_ms: None`
    /// e `BeatIntervalsNotAvailable` ogni volta che `WMASK_RR_INTERVAL` e 0.
    pub fn to_biometrics(&self, radiation_dose_rate_msv_d: f64) -> Biometrics {
        let mut missing_channels = Vec::new();
        let heart_rate_bpm = if (self.channel_mask & WMASK_HR_BPM) != 0 {
            Some(f64::from(self.hr_bpm_x100) / 100.0)
        } else {
            missing_channels.push("heart_rate_bpm".to_string());
            None
        };
        let spo2_pct = if (self.channel_mask & WMASK_SPO2_PCT) != 0 {
            Some(f64::from(self.spo2_pct_x100) / 100.0)
        } else {
            missing_channels.push("spo2_pct".to_string());
            None
        };
        let resp_rate_brpm = if (self.channel_mask & WMASK_RESP_BRPM) != 0 {
            Some(f64::from(self.resp_brpm_x100) / 100.0)
        } else {
            missing_channels.push("resp_rate_brpm".to_string());
            None
        };
        let has_rr = (self.channel_mask & WMASK_RR_INTERVAL) != 0 && self.rr_interval_ms_x10 > 0;
        if !has_rr {
            missing_channels.push("rmssd_ms".to_string());
        }
        Biometrics {
            heart_rate_bpm,
            pulse_rate_bpm: None,
            resp_rate_brpm,
            spo2_pct,
            rmssd_ms: None,
            hrv_unavailable_reason: if has_rr {
                None
            } else {
                Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
            },
            sdnn_ms: None,
            pnn50_pct: None,
            lf_hf_ratio: None,
            vocal_f0_hz: None,
            vocal_jitter_pct: None,
            radiation_dose_rate_msv_d,
            sqi_score: (f64::from(self.sqi_score_x10000) / 10_000.0).clamp(0.0, 1.0),
            missing_channels,
        }
    }

    /// Converte il pacchetto verificato in un `ValidatedTelemetryFrame` completo
    /// integrando il filtro SQI e lo scenario operativo.
    pub fn to_validated_frame(
        &self,
        record_id: &str,
        scenario: &StressTestScenarioInput,
        sqi_filter: &mut SqiFilter,
    ) -> ValidatedTelemetryFrame {
        let row = self.to_bidmc_numeric_row(record_id);
        let mut sqi_evaluation = sqi_filter.evaluate_row_detailed(&row);
        if (self.flags & WFLAG_SEU_RECOVERY_EVENT) != 0 {
            sqi_evaluation
                .quality_flags
                .push("HUBRIS_SEU_SUPERVISOR_RECOVERY".to_string());
        }
        let biometrics = biometrics_with_signal_quality(&row, scenario, &sqi_evaluation);
        let imu_rms_g = if (self.channel_mask & WMASK_IMU_RMS) != 0 && self.imu_rms_g.is_finite() {
            Some(self.imu_rms_g)
        } else {
            None
        };
        ValidatedTelemetryFrame {
            row,
            biometrics,
            sqi_evaluation,
            node_id: self.node_id,
            sequence_num: self.sequence_num,
            uptime_ms: self.uptime_ms,
            supervisor_restart_count: self.supervisor_restart_count,
            seu_recovery_event: (self.flags & WFLAG_SEU_RECOVERY_EVENT) != 0,
            eva_suit_node: (self.flags & WFLAG_EVA_SUIT_NODE) != 0,
            imu_rms_g,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_wearable_packet(with_rr: bool, seu_restarts: u16) -> WearableSensorPacket {
        let mut mask = WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM | WMASK_IMU_RMS;
        let mut flags = WFLAG_EVA_SUIT_NODE;
        if with_rr {
            mask |= WMASK_RR_INTERVAL;
        }
        if seu_restarts > 0 {
            flags |= WFLAG_SEU_RECOVERY_EVENT;
        }
        WearableSensorPacket {
            sync_word: WEARABLE_SYNC_WORD,
            node_id: 7,
            channel_mask: mask,
            sequence_num: 1024,
            uptime_ms: 42_500,
            supervisor_restart_count: seu_restarts,
            hr_bpm_x100: 7450,
            spo2_pct_x100: 9840,
            resp_brpm_x100: 1550,
            rr_interval_ms_x10: if with_rr { 8050 } else { 0 },
            sqi_score_x10000: 9200,
            imu_rms_g: 0.14,
            flags,
            crc16_ccitt: 0,
        }
    }

    #[test]
    fn test_wearable_sensor_packet_32_bytes_and_crc16_ccitt_roundtrip() {
        assert_eq!(size_of::<WearableSensorPacket>(), 32);
        assert_eq!(align_of::<WearableSensorPacket>(), 4);

        let pkt = sample_wearable_packet(false, 2);
        let raw = pkt.to_le_bytes_with_crc();
        assert_eq!(raw.len(), 32);

        let decoded = WearableSensorPacket::decode_and_verify(&raw).expect("valid CRC roundtrip");
        assert_eq!(decoded.sync_word, WEARABLE_SYNC_WORD);
        assert_eq!(decoded.node_id, 7);
        assert_eq!(decoded.supervisor_restart_count, 2);
        assert_eq!(decoded.hr_bpm_x100, 7450);

        // Single-bit flip (SEU fault simulation) anywhere in payload must fail CRC
        for byte_idx in 0..30 {
            let mut corrupted = raw;
            corrupted[byte_idx] ^= 0x04;
            let err = WearableSensorPacket::decode_and_verify(&corrupted);
            if byte_idx < 2 {
                assert!(matches!(err, Err(IngestError::InvalidWearableSyncWord { .. })));
            } else {
                assert!(matches!(err, Err(IngestError::InvalidWearableCrc { .. })));
            }
        }
    }

    #[test]
    fn test_wearable_packet_tracks_seu_supervisor_restarts_and_null_hrv_policy() {
        let pkt = sample_wearable_packet(false, 3);
        let raw = pkt.to_le_bytes();
        let decoded = WearableSensorPacket::from_le_bytes(&raw).expect("valid packet");

        let bio = decoded.to_biometrics(0.55);
        assert_eq!(bio.heart_rate_bpm, Some(74.5));
        assert_eq!(bio.spo2_pct, Some(98.4));
        assert_eq!(bio.resp_rate_brpm, Some(15.5));
        assert_eq!(bio.rmssd_ms, None);
        assert_eq!(
            bio.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        );
        assert!(bio.missing_channels.contains(&"rmssd_ms".to_string()));

        let mut sqi = SqiFilter::new();
        let scenario = StressTestScenarioInput {
            source_record_id: "hubris_node_07".to_string(),
            flight_day: 60,
            ared_daily_load_kgf: 125.0,
            radiation_dose_rate_msv_d: 0.55,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 2.0,
        };
        let validated = decoded.to_validated_frame("hubris_node_07", &scenario, &mut sqi);
        assert_eq!(validated.supervisor_restart_count, 3);
        assert!(validated.seu_recovery_event);
        assert!(validated.eva_suit_node);
        assert!(validated
            .sqi_evaluation
            .quality_flags
            .iter()
            .any(|f| f == "HUBRIS_SEU_SUPERVISOR_RECOVERY"));
        assert!((validated.row.relative_time_s - 42.5).abs() < 1e-6);
    }
}
