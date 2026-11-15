//! Fase 21 (J1): Zero-Copy Binary Telemetry Protocol (`#[repr(C, align(64))]`
//! `BinaryTelemetryFrame` da 128 byte) e ring buffer lock-free SPMC Seqlock.

use crate::NqsQuantileForecastSnapshot;
use crate::error::AresCoreError;
use crate::telemetry::{
    AlertSeverity, HrvUnavailableReason, ModelValidationStatus, ScenarioOverlayMode,
    TelemetryPacket,
};
use core::mem::{align_of, offset_of, size_of};
use core::sync::atomic::{AtomicU64, Ordering, fence};

pub const ARES_BINARY_MAGIC: u32 = 0x4152_4553; // "ARES"
pub const ARES_BINARY_VERSION: u16 = 1;
pub const ARES_BINARY_FRAME_BYTES: usize = 128;

// Partition status bits (ARINC 653 Health Monitor).
pub const PARTITION_TELEMETRY_INGEST: u8 = 1 << 0;
pub const PARTITION_CAUSAL_ODE_STL: u8 = 1 << 1;
pub const PARTITION_TIMESTRAL_FORECASTER: u8 = 1 << 2;
pub const PARTITION_MEDOPS_UI_SHELL: u8 = 1 << 3;
pub const PARTITION_ALL_NOMINAL: u8 = PARTITION_TELEMETRY_INGEST
    | PARTITION_CAUSAL_ODE_STL
    | PARTITION_TIMESTRAL_FORECASTER
    | PARTITION_MEDOPS_UI_SHELL;

// Deontic habitat mask bits (`deontic_habitat_mask`).
pub const DEONTIC_ZONE_MASK: u8 = 0x07;
pub const DEONTIC_VIOLATES_POLICY: u8 = 1 << 3;
pub const DEONTIC_EVA_FORBIDDEN: u8 = 1 << 4;
pub const DEONTIC_SHELTER_MANDATORY: u8 = 1 << 5;
pub const DEONTIC_EIMO_AUTONOMOUS: u8 = 1 << 6;

// Validity bitmask (`1` = finite present value, `0` = None / f32::NAN).
pub const MASK_HR_BPM: u32 = 1 << 0;
pub const MASK_PULSE_BPM: u32 = 1 << 1;
pub const MASK_RESP_BRPM: u32 = 1 << 2;
pub const MASK_SPO2_PCT: u32 = 1 << 3;
pub const MASK_RMSSD_MS: u32 = 1 << 4;
pub const MASK_MRI_SCORE: u32 = 1 << 5;
pub const MASK_CRS_SCORE: u32 = 1 << 6;
pub const MASK_SANS_RISK: u32 = 1 << 7;
pub const MASK_IJV_SHEAR_PA: u32 = 1 << 8;
pub const MASK_SOST_PG_ML: u32 = 1 << 9;
pub const MASK_RADIATION_MSV_D: u32 = 1 << 10;
pub const MASK_NQS_MIN_RHO: u32 = 1 << 11;
pub const MASK_TTV_Q05_DAYS: u32 = 1 << 12;
pub const MASK_TTV_Q50_DAYS: u32 = 1 << 13;
pub const MASK_TTV_Q95_DAYS: u32 = 1 << 14;
pub const MASK_OWLT_DELAY_SEC: u32 = 1 << 15;

// Quality and clinical safety flags (`quality_flags_mask`).
pub const FLAG_WHAT_IF_ACTIVE: u32 = 1 << 0;
pub const FLAG_POCUS_CONFIRMED: u32 = 1 << 1;
pub const FLAG_LBNP_ACTIVE: u32 = 1 << 2;
pub const FLAG_GATE1_ANTICOAG_LOCK: u32 = 1 << 3;
pub const FLAG_GATE2_LBNP_VENT: u32 = 1 << 4;
pub const FLAG_GATE3_EVA_DAMPING: u32 = 1 << 5;
pub const FLAG_BEAT_INTERVALS_NOT_AVAILABLE: u32 = 1 << 6;
pub const FLAG_ILLUSTRATIVE_UNVALIDATED: u32 = 1 << 7;
pub const FLAG_CHANNEL_NAN_DROPOUT: u32 = 1 << 8;
pub const FLAG_CONFORMAL_ABSTAINED: u32 = 1 << 9;
pub const FLAG_SEU_RECOVERY_ACTIVE: u32 = 1 << 10;
pub const FLAG_TERRESTRIAL_BENCHMARKED_ONLY: u32 = 1 << 11;
pub const FLAG_GATE4A_DECOMPRESSION_LOCK: u32 = 1 << 12;
pub const FLAG_GATE4B_EVA_NO_GO: u32 = 1 << 13;

/// Reflected Castagnoli CRC-32C polynomial (`0x1EDC6F41` -> `0x82F63B78`).
const CRC32C_POLY_REFLECTED: u32 = 0x82F6_3B78;

/// Computes Castagnoli CRC-32C deterministically without external crates or heap allocations.
#[inline]
pub fn compute_crc32c(bytes: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in bytes {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (CRC32C_POLY_REFLECTED & mask);
        }
    }
    !crc
}

/// Metadata supplied alongside a `TelemetryPacket` to construct a `BinaryTelemetryFrame`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BinaryFrameMeta {
    pub seq: u64,
    pub timestamp_ms: u64,
    pub partition_status: u8,
    pub deontic_habitat_mask: u8,
    pub crs_score: Option<f64>,
    pub owlt_delay_sec: f32,
    pub ipc_latency_ns: u32,
    pub conformal_abstained: bool,
    pub seu_recovery_active: bool,
    pub include_derived_models: bool,
}

impl Default for BinaryFrameMeta {
    fn default() -> Self {
        Self {
            seq: 0,
            timestamp_ms: 0,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask: 0,
            crs_score: None,
            owlt_delay_sec: 852.0, // Nominal Mars 14m 12s OWLT
            ipc_latency_ns: 0,
            conformal_abstained: false,
            seu_recovery_active: false,
            include_derived_models: true,
        }
    }
}

/// Deterministic 128-byte cache-line-aligned binary telemetry frame (2x 64-byte cache lines).
/// Zero implicit compiler padding; identical ABI across Rust and TypeScript `DataView`.
#[repr(C, align(64))]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BinaryTelemetryFrame {
    pub magic: u32,
    pub schema_version: u16,
    pub partition_status: u8,
    pub deontic_habitat_mask: u8,
    pub seq: u64,
    pub timestamp_ms: u64,
    pub validity_mask: u32,
    pub quality_flags_mask: u32,
    pub hr_bpm: f32,
    pub pulse_bpm: f32,
    pub resp_brpm: f32,
    pub spo2_pct: f32,
    pub rmssd_ms: f32,
    pub mri_score: f32,
    pub crs_score: f32,
    pub sans_risk: f32,
    pub ijv_shear_pa: f32,
    pub sost_pg_ml: f32,
    pub radiation_msv_d: f32,
    pub nqs_min_rho: f32,
    pub ttv_q05_days: f32,
    pub ttv_q50_days: f32,
    pub ttv_q95_days: f32,
    pub owlt_delay_sec: f32,
    pub active_playbook_id: u16,
    pub active_alert_code: u16,
    pub ipc_latency_ns: u32,
    pub crc32c: u32,
    pub reserved: [u8; 20],
}

// Compile-time ABI layout verification (0 bytes implicit padding).
const _: () = assert!(size_of::<BinaryTelemetryFrame>() == ARES_BINARY_FRAME_BYTES);
const _: () = assert!(align_of::<BinaryTelemetryFrame>() == 64);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, magic) == 0);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, schema_version) == 4);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, partition_status) == 6);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, deontic_habitat_mask) == 7);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, seq) == 8);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, timestamp_ms) == 16);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, validity_mask) == 24);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, quality_flags_mask) == 28);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, hr_bpm) == 32);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, ijv_shear_pa) == 64);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, active_playbook_id) == 96);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, active_alert_code) == 98);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, ipc_latency_ns) == 100);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, crc32c) == 104);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, reserved) == 108);

#[inline]
fn encode_opt_f64_as_f32(opt: Option<f64>, bit: u32, mask: &mut u32) -> f32 {
    match opt {
        Some(v) if v.is_finite() => {
            let v32 = v as f32;
            if v32.is_finite() {
                *mask |= bit;
                v32
            } else {
                f32::NAN
            }
        }
        _ => f32::NAN,
    }
}

#[inline]
fn encode_finite_f64_as_f32(val: f64, bit: u32, mask: &mut u32) -> f32 {
    if val.is_finite() {
        let v32 = val as f32;
        if v32.is_finite() {
            *mask |= bit;
            return v32;
        }
    }
    f32::NAN
}

#[inline]
fn decode_opt_f32(mask: u32, bit: u32, val: f32) -> Option<f32> {
    if (mask & bit) != 0 && val.is_finite() {
        Some(val)
    } else {
        None
    }
}

#[inline]
pub fn playbook_id_to_u16(playbook_id: &str) -> u16 {
    if playbook_id.starts_with("PLAYBOOK_01") {
        1
    } else if playbook_id.starts_with("PLAYBOOK_02") {
        2
    } else if playbook_id.starts_with("PLAYBOOK_03") {
        3
    } else if playbook_id.starts_with("PLAYBOOK_04") {
        4
    } else if playbook_id.starts_with("PLAYBOOK_05") {
        5
    } else if playbook_id.starts_with("PLAYBOOK_06") {
        6
    } else if playbook_id.starts_with("PLAYBOOK_07") {
        7
    } else if playbook_id.starts_with("PLAYBOOK_08") {
        8
    } else if playbook_id.starts_with("PLAYBOOK_09") {
        9
    } else if playbook_id.starts_with("PLAYBOOK_10") {
        10
    } else if playbook_id.starts_with("PLAYBOOK_11") {
        11
    } else if playbook_id.starts_with("PLAYBOOK_12") {
        12
    } else if playbook_id.starts_with("PLAYBOOK_13") {
        13
    } else if playbook_id.starts_with("PLAYBOOK_14") {
        14
    } else if playbook_id.starts_with("PLAYBOOK_15") {
        15
    } else {
        0
    }
}

#[inline]
pub fn playbook_id_from_u16(code: u16) -> Option<&'static str> {
    match code {
        1 => Some("PLAYBOOK_01_VENOUS_STASIS_LBNP"),
        2 => Some("PLAYBOOK_02_CONFIRMED_IJV_THROMBUS"),
        3 => Some("PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED"),
        4 => Some("PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION"),
        5 => Some("PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS"),
        6 => Some("PLAYBOOK_06_HYPOXEMIA_DESATURATION"),
        7 => Some("PLAYBOOK_07_HEART_RATE_ANOMALY"),
        8 => Some("PLAYBOOK_08_SENSOR_SIGNAL_LOSS"),
        9 => Some("PLAYBOOK_09_MULTIPARAMETER_DETERIORATION"),
        10 => Some("PLAYBOOK_10_RENAL_LITHIASIS"),
        11 => Some("PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING"),
        12 => Some("PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE"),
        13 => Some("PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR"),
        14 => Some("PLAYBOOK_14_CO2_SCRUBBER_SANS"),
        15 => Some("PLAYBOOK_15_EFAST_TRAUMA_TRIAGE"),
        _ => None,
    }
}

#[inline]
pub fn alert_severity_to_u16(severity: AlertSeverity) -> u16 {
    match severity {
        AlertSeverity::Nominal => 0,
        AlertSeverity::DataDegradedMissingChannels => 1,
        AlertSeverity::Caution => 2,
        AlertSeverity::Warning => 3,
        AlertSeverity::CriticalEmergency => 4,
    }
}

impl BinaryTelemetryFrame {
    /// Encodes a `TelemetryPacket` and optional `NqsQuantileForecastSnapshot` into
    /// a CRC-32C sealed 128-byte `BinaryTelemetryFrame`, preserving all `Option::None`
    /// invariants (`BEAT_INTERVALS_NOT_AVAILABLE` and `BIDMC` missing channels).
    pub fn from_telemetry_packet(
        pkt: &TelemetryPacket,
        quantile_snapshot: Option<&NqsQuantileForecastSnapshot>,
        meta: BinaryFrameMeta,
    ) -> Self {
        let mut validity_mask: u32 = 0;

        let hr_bpm = encode_opt_f64_as_f32(
            pkt.biometrics.heart_rate_bpm,
            MASK_HR_BPM,
            &mut validity_mask,
        );
        let pulse_bpm = encode_opt_f64_as_f32(
            pkt.biometrics.pulse_rate_bpm,
            MASK_PULSE_BPM,
            &mut validity_mask,
        );
        let resp_brpm = encode_opt_f64_as_f32(
            pkt.biometrics.resp_rate_brpm,
            MASK_RESP_BRPM,
            &mut validity_mask,
        );
        let spo2_pct = encode_opt_f64_as_f32(
            pkt.biometrics.spo2_pct,
            MASK_SPO2_PCT,
            &mut validity_mask,
        );
        let rmssd_ms = encode_opt_f64_as_f32(
            pkt.biometrics.rmssd_ms,
            MASK_RMSSD_MS,
            &mut validity_mask,
        );

        let mri_score = encode_opt_f64_as_f32(
            pkt.nqs_stl.mri_pct,
            MASK_MRI_SCORE,
            &mut validity_mask,
        );

        let derived_crs = meta.crs_score.or_else(|| {
            if meta.include_derived_models {
                Some(
                    pkt.nqs_stl
                        .rho_global
                        .map(|r| (1.0 - r).clamp(0.0, 1.0))
                        .unwrap_or_else(|| pkt.sans_ocular.sans_risk_index.clamp(0.0, 1.0)),
                )
            } else {
                None
            }
        });
        let crs_score = encode_opt_f64_as_f32(derived_crs, MASK_CRS_SCORE, &mut validity_mask);

        let sans_risk = if meta.include_derived_models {
            encode_finite_f64_as_f32(
                pkt.sans_ocular.sans_risk_index,
                MASK_SANS_RISK,
                &mut validity_mask,
            )
        } else {
            f32::NAN
        };

        // 1 dyn/cm^2 = 0.1 Pa
        let ijv_shear_pa = if meta.include_derived_models {
            encode_finite_f64_as_f32(
                pkt.jugular_hemodynamics.tau_w_dyn_cm2 * 0.1,
                MASK_IJV_SHEAR_PA,
                &mut validity_mask,
            )
        } else {
            f32::NAN
        };

        // Sclerostin (~22.5 kDa): 1 pmol/L ~= 22.5 pg/mL
        let sost_pg_ml = if meta.include_derived_models {
            encode_finite_f64_as_f32(
                pkt.musculoskeletal.sclerostin_pmol_l * 22.5,
                MASK_SOST_PG_ML,
                &mut validity_mask,
            )
        } else {
            f32::NAN
        };

        let radiation_msv_d = encode_finite_f64_as_f32(
            pkt.biometrics.radiation_dose_rate_msv_d,
            MASK_RADIATION_MSV_D,
            &mut validity_mask,
        );

        let nqs_min_rho = encode_opt_f64_as_f32(
            pkt.nqs_stl.rho_global,
            MASK_NQS_MIN_RHO,
            &mut validity_mask,
        );

        let (ttv_q05_h, ttv_q50_h, ttv_q95_h) = if let Some(q) = quantile_snapshot {
            if let Some(cone) = q.ttv_hours_cone {
                (Some(cone.q05), Some(cone.q50), Some(cone.q95))
            } else {
                (None, None, None)
            }
        } else {
            (
                pkt.nqs_stl.ttv_ci95_low_hours,
                pkt.nqs_stl.ttv_hours,
                pkt.nqs_stl.ttv_ci95_high_hours,
            )
        };

        let ttv_q05_days = encode_opt_f64_as_f32(
            ttv_q05_h.map(|h| h / 24.0),
            MASK_TTV_Q05_DAYS,
            &mut validity_mask,
        );
        let ttv_q50_days = encode_opt_f64_as_f32(
            ttv_q50_h.map(|h| h / 24.0),
            MASK_TTV_Q50_DAYS,
            &mut validity_mask,
        );
        let ttv_q95_days = encode_opt_f64_as_f32(
            ttv_q95_h.map(|h| h / 24.0),
            MASK_TTV_Q95_DAYS,
            &mut validity_mask,
        );

        let owlt_delay_sec = encode_finite_f64_as_f32(
            f64::from(meta.owlt_delay_sec),
            MASK_OWLT_DELAY_SEC,
            &mut validity_mask,
        );

        let mut quality_flags_mask: u32 = 0;
        if matches!(
            pkt.provenance_manifest.scenario_overlay_mode,
            ScenarioOverlayMode::SimulatedWhatifScenario | ScenarioOverlayMode::DerivedAndSimulated
        ) {
            quality_flags_mask |= FLAG_WHAT_IF_ACTIVE;
        }
        if pkt.jugular_hemodynamics.pocus_thrombus_confirmed {
            quality_flags_mask |= FLAG_POCUS_CONFIRMED;
        }
        if pkt.jugular_hemodynamics.lbnp_active {
            quality_flags_mask |= FLAG_LBNP_ACTIVE;
        }
        if pkt.active_playbook.safety_gates.anticoagulant_lock_active {
            quality_flags_mask |= FLAG_GATE1_ANTICOAG_LOCK;
        }
        if pkt.active_playbook.safety_gates.lbnp_auto_vent_armed {
            quality_flags_mask |= FLAG_GATE2_LBNP_VENT;
        }
        if pkt.active_playbook.safety_gates.eva_suit_damping_active {
            quality_flags_mask |= FLAG_GATE3_EVA_DAMPING;
        }
        if pkt.active_playbook.safety_gates.gate4_invasive_decompression_locked {
            quality_flags_mask |= FLAG_GATE4A_DECOMPRESSION_LOCK;
        }
        if pkt.active_playbook.safety_gates.gate4_eva_fitness_no_go {
            quality_flags_mask |= FLAG_GATE4B_EVA_NO_GO;
        }
        if matches!(
            pkt.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        ) || pkt.biometrics.rmssd_ms.is_none()
        {
            quality_flags_mask |= FLAG_BEAT_INTERVALS_NOT_AVAILABLE;
        }
        match pkt.model_validation_status {
            ModelValidationStatus::IllustrativeUnvalidated => {
                quality_flags_mask |= FLAG_ILLUSTRATIVE_UNVALIDATED;
            }
            ModelValidationStatus::InternallyBenchmarkedTerrestrial { .. } => {
                // Keep FLAG_ILLUSTRATIVE_UNVALIDATED active alongside FLAG_TERRESTRIAL_BENCHMARKED_ONLY
                // so cockpit displays indicate spaceflight physiological models remain unvalidated.
                quality_flags_mask |=
                    FLAG_ILLUSTRATIVE_UNVALIDATED | FLAG_TERRESTRIAL_BENCHMARKED_ONLY;
            }
            ModelValidationStatus::ClinicallyCalibratedSubjectToReview => {}
        }
        if !pkt.biometrics.missing_channels.is_empty() {
            quality_flags_mask |= FLAG_CHANNEL_NAN_DROPOUT;
        }
        if meta.conformal_abstained
            || quantile_snapshot.is_some_and(|q| q.abstention_certificate.abstained)
        {
            quality_flags_mask |= FLAG_CONFORMAL_ABSTAINED;
        }
        if meta.seu_recovery_active {
            quality_flags_mask |= FLAG_SEU_RECOVERY_ACTIVE;
        }

        let mut frame = Self {
            magic: ARES_BINARY_MAGIC,
            schema_version: ARES_BINARY_VERSION,
            partition_status: meta.partition_status,
            deontic_habitat_mask: meta.deontic_habitat_mask,
            seq: meta.seq,
            timestamp_ms: meta.timestamp_ms,
            validity_mask,
            quality_flags_mask,
            hr_bpm,
            pulse_bpm,
            resp_brpm,
            spo2_pct,
            rmssd_ms,
            mri_score,
            crs_score,
            sans_risk,
            ijv_shear_pa,
            sost_pg_ml,
            radiation_msv_d,
            nqs_min_rho,
            ttv_q05_days,
            ttv_q50_days,
            ttv_q95_days,
            owlt_delay_sec,
            active_playbook_id: playbook_id_to_u16(&pkt.active_playbook.playbook_id),
            active_alert_code: alert_severity_to_u16(pkt.alert_severity),
            ipc_latency_ns: meta.ipc_latency_ns,
            crc32c: 0,
            reserved: [0u8; 20],
        };
        let bytes = frame.to_le_bytes();
        frame.crc32c = u32::from_le_bytes([bytes[104], bytes[105], bytes[106], bytes[107]]);
        frame
    }

    /// Alias of `from_telemetry_packet` for Phase 33 (`L5`) encoder call sites.
    #[inline]
    pub fn encode_from_packet(
        pkt: &TelemetryPacket,
        quantile_snapshot: Option<&NqsQuantileForecastSnapshot>,
        meta: BinaryFrameMeta,
    ) -> Self {
        Self::from_telemetry_packet(pkt, quantile_snapshot, meta)
    }

    /// Serializes the frame to exact 128 little-endian bytes with Castagnoli CRC-32C at `104..108`.
    pub fn to_le_bytes(&self) -> [u8; ARES_BINARY_FRAME_BYTES] {
        let mut out = [0u8; ARES_BINARY_FRAME_BYTES];
        out[0..4].copy_from_slice(&self.magic.to_le_bytes());
        out[4..6].copy_from_slice(&self.schema_version.to_le_bytes());
        out[6] = self.partition_status;
        out[7] = self.deontic_habitat_mask;
        out[8..16].copy_from_slice(&self.seq.to_le_bytes());
        out[16..24].copy_from_slice(&self.timestamp_ms.to_le_bytes());
        out[24..28].copy_from_slice(&self.validity_mask.to_le_bytes());
        out[28..32].copy_from_slice(&self.quality_flags_mask.to_le_bytes());

        let floats = [
            self.hr_bpm,
            self.pulse_bpm,
            self.resp_brpm,
            self.spo2_pct,
            self.rmssd_ms,
            self.mri_score,
            self.crs_score,
            self.sans_risk,
            self.ijv_shear_pa,
            self.sost_pg_ml,
            self.radiation_msv_d,
            self.nqs_min_rho,
            self.ttv_q05_days,
            self.ttv_q50_days,
            self.ttv_q95_days,
            self.owlt_delay_sec,
        ];
        for (idx, val) in floats.into_iter().enumerate() {
            let start = 32 + idx * 4;
            out[start..start + 4].copy_from_slice(&val.to_le_bytes());
        }

        out[96..98].copy_from_slice(&self.active_playbook_id.to_le_bytes());
        out[98..100].copy_from_slice(&self.active_alert_code.to_le_bytes());
        out[100..104].copy_from_slice(&self.ipc_latency_ns.to_le_bytes());

        let crc = compute_crc32c(&out[0..104]);
        out[104..108].copy_from_slice(&crc.to_le_bytes());
        out
    }

    /// Alias of `to_le_bytes` for call-site ergonomics.
    #[inline]
    pub fn to_le_bytes_array(&self) -> [u8; ARES_BINARY_FRAME_BYTES] {
        self.to_le_bytes()
    }

    /// Decodes and validates a 128-byte little-endian binary frame (`magic`, `schema_version`, `crc32c`).
    pub fn from_le_bytes(bytes: &[u8]) -> Result<Self, AresCoreError> {
        if bytes.len() != ARES_BINARY_FRAME_BYTES {
            return Err(AresCoreError::InvalidBinaryFrameLength {
                expected: ARES_BINARY_FRAME_BYTES,
                actual: bytes.len(),
            });
        }
        let magic = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        if magic != ARES_BINARY_MAGIC {
            return Err(AresCoreError::InvalidBinaryFrameMagic { found: magic });
        }
        let schema_version = u16::from_le_bytes([bytes[4], bytes[5]]);
        if schema_version != ARES_BINARY_VERSION {
            return Err(AresCoreError::InvalidBinaryFrameVersion {
                found: schema_version,
            });
        }

        let expected_crc = compute_crc32c(&bytes[0..104]);
        let found_crc = u32::from_le_bytes([bytes[104], bytes[105], bytes[106], bytes[107]]);
        if expected_crc != found_crc {
            return Err(AresCoreError::InvalidBinaryFrameCrc {
                expected: expected_crc,
                found: found_crc,
            });
        }

        let read_f32 = |offset: usize| -> f32 {
            f32::from_le_bytes([
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3],
            ])
        };

        let mut reserved = [0u8; 20];
        reserved.copy_from_slice(&bytes[108..128]);

        Ok(Self {
            magic,
            schema_version,
            partition_status: bytes[6],
            deontic_habitat_mask: bytes[7],
            seq: u64::from_le_bytes([
                bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14],
                bytes[15],
            ]),
            timestamp_ms: u64::from_le_bytes([
                bytes[16], bytes[17], bytes[18], bytes[19], bytes[20], bytes[21], bytes[22],
                bytes[23],
            ]),
            validity_mask: u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]),
            quality_flags_mask: u32::from_le_bytes([bytes[28], bytes[29], bytes[30], bytes[31]]),
            hr_bpm: read_f32(32),
            pulse_bpm: read_f32(36),
            resp_brpm: read_f32(40),
            spo2_pct: read_f32(44),
            rmssd_ms: read_f32(48),
            mri_score: read_f32(52),
            crs_score: read_f32(56),
            sans_risk: read_f32(60),
            ijv_shear_pa: read_f32(64),
            sost_pg_ml: read_f32(68),
            radiation_msv_d: read_f32(72),
            nqs_min_rho: read_f32(76),
            ttv_q05_days: read_f32(80),
            ttv_q50_days: read_f32(84),
            ttv_q95_days: read_f32(88),
            owlt_delay_sec: read_f32(92),
            active_playbook_id: u16::from_le_bytes([bytes[96], bytes[97]]),
            active_alert_code: u16::from_le_bytes([bytes[98], bytes[99]]),
            ipc_latency_ns: u32::from_le_bytes([bytes[100], bytes[101], bytes[102], bytes[103]]),
            crc32c: found_crc,
            reserved,
        })
    }

    #[inline]
    pub fn hr_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_HR_BPM, self.hr_bpm)
    }

    #[inline]
    pub fn pulse_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_PULSE_BPM, self.pulse_bpm)
    }

    #[inline]
    pub fn resp_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_RESP_BRPM, self.resp_brpm)
    }

    #[inline]
    pub fn spo2_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_SPO2_PCT, self.spo2_pct)
    }

    #[inline]
    pub fn rmssd_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_RMSSD_MS, self.rmssd_ms)
    }

    #[inline]
    pub fn mri_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_MRI_SCORE, self.mri_score)
    }

    #[inline]
    pub fn crs_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_CRS_SCORE, self.crs_score)
    }

    #[inline]
    pub fn sans_risk_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_SANS_RISK, self.sans_risk)
    }

    #[inline]
    pub fn ijv_shear_pa_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_IJV_SHEAR_PA, self.ijv_shear_pa)
    }

    #[inline]
    pub fn sost_pg_ml_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_SOST_PG_ML, self.sost_pg_ml)
    }

    #[inline]
    pub fn radiation_msv_d_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_RADIATION_MSV_D, self.radiation_msv_d)
    }

    #[inline]
    pub fn nqs_min_rho_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_NQS_MIN_RHO, self.nqs_min_rho)
    }

    #[inline]
    pub fn ttv_q05_days_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_TTV_Q05_DAYS, self.ttv_q05_days)
    }

    #[inline]
    pub fn ttv_q50_days_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_TTV_Q50_DAYS, self.ttv_q50_days)
    }

    #[inline]
    pub fn ttv_q95_days_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_TTV_Q95_DAYS, self.ttv_q95_days)
    }

    #[inline]
    pub fn owlt_delay_sec_opt(&self) -> Option<f32> {
        decode_opt_f32(self.validity_mask, MASK_OWLT_DELAY_SEC, self.owlt_delay_sec)
    }
}

const ARES_BINARY_FRAME_WORDS: usize = ARES_BINARY_FRAME_BYTES / core::mem::size_of::<u64>();

/// Cache-line-aligned slot for lock-free SPMC Seqlock ring buffer.
#[repr(C, align(64))]
struct SeqlockSlot {
    seq: AtomicU64,
    payload: [AtomicU64; ARES_BINARY_FRAME_WORDS],
}

/// Lock-free Single-Producer Multi-Consumer (SPMC) Seqlock ring buffer.
/// Guarantees zero producer blocking under UI stalls (ARINC 653 temporal isolation)
/// with 100% safe atomic word accesses (`#![forbid(unsafe_code)]`).
pub struct SeqlockTelemetryRing<const N: usize> {
    write_cursor: AtomicU64,
    slots: [SeqlockSlot; N],
}

impl<const N: usize> Default for SeqlockTelemetryRing<N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<const N: usize> SeqlockTelemetryRing<N> {
    /// Allocates an empty Seqlock ring buffer. `N` must be a non-zero power of two.
    pub fn new() -> Self {
        const { assert!(N > 0 && N.is_power_of_two()) };
        const { assert!(ARES_BINARY_FRAME_WORDS * 8 == ARES_BINARY_FRAME_BYTES) };
        Self {
            write_cursor: AtomicU64::new(0),
            slots: core::array::from_fn(|_| SeqlockSlot {
                seq: AtomicU64::new(0),
                payload: core::array::from_fn(|_| AtomicU64::new(0)),
            }),
        }
    }

    /// Publishes a 128-byte frame without ever blocking on readers.
    #[allow(clippy::chunks_exact_to_as_chunks)]
    pub fn publish(&self, frame: &BinaryTelemetryFrame) {
        let idx = self.write_cursor.load(Ordering::Relaxed);
        let slot = &self.slots[(idx as usize) & (N - 1)];
        let prev_seq = slot.seq.load(Ordering::Relaxed);
        slot.seq.store(prev_seq.wrapping_add(1), Ordering::Release);
        fence(Ordering::Release);
        let raw = frame.to_le_bytes();
        for (word_slot, chunk) in slot.payload.iter().zip(raw.chunks_exact(8)) {
            let mut word_bytes = [0u8; 8];
            word_bytes.copy_from_slice(chunk);
            word_slot.store(u64::from_le_bytes(word_bytes), Ordering::Relaxed);
        }
        fence(Ordering::Release);
        slot.seq.store(prev_seq.wrapping_add(2), Ordering::Release);
        self.write_cursor
            .store(idx.wrapping_add(1), Ordering::Release);
    }

    /// Reads the latest consistent 128-byte raw payload without locking the producer.
    #[allow(clippy::chunks_exact_to_as_chunks)]
    pub fn read_latest_bytes(&self) -> Result<[u8; ARES_BINARY_FRAME_BYTES], AresCoreError> {
        let cursor = self.write_cursor.load(Ordering::Acquire);
        if cursor == 0 {
            return Err(AresCoreError::ShmRingEmpty);
        }
        let slot = &self.slots[((cursor - 1) as usize) & (N - 1)];
        for _ in 0..8 {
            let s1 = slot.seq.load(Ordering::Acquire);
            if (s1 & 1) != 0 {
                core::hint::spin_loop();
                continue;
            }
            let mut bytes = [0u8; ARES_BINARY_FRAME_BYTES];
            for (dst_chunk, word_slot) in bytes.chunks_exact_mut(8).zip(slot.payload.iter()) {
                let word = word_slot.load(Ordering::Relaxed);
                dst_chunk.copy_from_slice(&word.to_le_bytes());
            }
            fence(Ordering::Acquire);
            let s2 = slot.seq.load(Ordering::Relaxed);
            if s1 == s2 {
                return Ok(bytes);
            }
        }
        Err(AresCoreError::ShmRingTornReadExhausted)
    }

    /// Reads and validates the latest published `BinaryTelemetryFrame`.
    pub fn read_latest(&self) -> Result<BinaryTelemetryFrame, AresCoreError> {
        let bytes = self.read_latest_bytes()?;
        BinaryTelemetryFrame::from_le_bytes(&bytes)
    }

    /// Total frames published so far.
    #[inline]
    pub fn write_count(&self) -> u64 {
        self.write_cursor.load(Ordering::Acquire)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::telemetry::{
        ActivePlaybook, Biometrics, BiometricsSource, CountermeasureAction, JugularFlowGrade,
        JugularHemodynamics, Musculoskeletal, NqsStlMargins, ProvenanceManifest, SafetyGates,
        SansOcular, SystemPhase, TtvIntervalKind,
    };
    use std::sync::Arc;
    use std::thread;

    fn sample_packet(with_hrv: bool, missing_pulse_spo2: bool) -> TelemetryPacket {
        let mut missing = Vec::new();
        if missing_pulse_spo2 {
            missing.push("pulse_rate_bpm".to_string());
            missing.push("spo2_pct".to_string());
        }
        if !with_hrv {
            missing.push("rmssd_ms".to_string());
        }
        TelemetryPacket {
            timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
            mission_Elapsed_seconds: 120.0,
            relative_recording_time_s: 42.0,
            source_record_id: "bidmc_01".to_string(),
            flight_day: 90,
            astronaut_id: "ARES-CDR-01".to_string(),
            system_phase: SystemPhase::Evaluate,
            alert_severity: AlertSeverity::Caution,
            model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            provenance_manifest: ProvenanceManifest {
                biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
                biometrics_native_rate_hz: 1.0,
                ui_refresh_rate_hz: 20.0,
                scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
                biological_context_refs: vec!["PhysioNet-BIDMC-v1.0.0".to_string()],
            },
            biometrics: Biometrics {
                heart_rate_bpm: Some(88.0),
                pulse_rate_bpm: if missing_pulse_spo2 { None } else { Some(87.0) },
                resp_rate_brpm: Some(16.0),
                spo2_pct: if missing_pulse_spo2 { None } else { Some(98.0) },
                rmssd_ms: if with_hrv { Some(36.5) } else { None },
                hrv_unavailable_reason: if with_hrv {
                    None
                } else {
                    Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
                },
                sdnn_ms: if with_hrv { Some(48.0) } else { None },
                pnn50_pct: if with_hrv { Some(16.0) } else { None },
                lf_hf_ratio: if with_hrv { Some(2.4) } else { None },
                vocal_f0_hz: Some(118.5),
                vocal_jitter_pct: Some(0.62),
                radiation_dose_rate_msv_d: 0.45,
                sqi_score: 0.88,
                missing_channels: missing,
                sbp_mmhg: Some(118.0),
                dbp_mmhg: Some(78.0),
                ptt_ms: Some(210.0),
                core_temp_celsius: Some(36.8),
                skin_temp_celsius: Some(33.5),
                sleep_stage_code: Some(2),
                melanopic_edi_lux: Some(450.0),
                personal_dose_rate_ugy_h: Some(18.5),
                let_quality_factor: Some(2.8),
                suit_metabolic_watts: Some(220.0),
                helmet_ppco2_mmhg: Some(2.1),
                cabin_ppco2_mmhg: None,
                platelet_count_k_ul: None,
            },
            musculoskeletal: Musculoskeletal {
                ared_daily_load_kgf: 125.0,
                soleus_csa_pct: 94.0,
                echo_intensity_au: 52.0,
                mqi_index: 0.84,
                sclerostin_pmol_l: 26.5,
                urinary_calcium_mg_d: 191.8,
                gai_pct: 6.1,
            },
            jugular_hemodynamics: JugularHemodynamics {
                ijv_csa_mm2: 68.0,
                ijv_vmax_cm_s: 11.4,
                tau_w_dyn_cm2: 1.71,
                flow_grade: JugularFlowGrade::NormalContinuous,
                pocus_thrombus_confirmed: false,
                lbnp_active: false,
                lbnp_pressure_mmhg: 0.0,
            },
            sans_ocular: SansOcular {
                onsd_mm: 5.4,
                choroidal_delta_um: 28.0,
                sans_risk_index: 0.31,
            },
            nqs_stl: NqsStlMargins {
                rho_tau_w: 0.32,
                rho_ared: 1.0,
                rho_sost: 0.92,
                rho_rmssd: if with_hrv { Some(0.59) } else { None },
                rho_sans: 0.71,
                rho_global: if with_hrv { Some(0.32) } else { None },
                ttv_hours: if with_hrv { Some(160.0) } else { None },
                ttv_ci95_low_hours: if with_hrv { Some(120.0) } else { None },
                ttv_ci95_high_hours: if with_hrv { Some(220.0) } else { None },
                mri_pct: if with_hrv { Some(82.5) } else { None },
                ttv_interval_kind: Some(TtvIntervalKind::IllustrativeScenarioRange),
                rho_renal: Some(0.44),
                rho_orthostatic: Some(0.65),
                rho_circadian: Some(0.81),
                rho_immune: Some(0.70),
            },
            active_playbook: ActivePlaybook {
                playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED".to_string(),
                title: "Playbook #03".to_string(),
                causal_chain_summary: vec!["ARED Load 125 kgf".to_string()],
                safety_gates: SafetyGates {
                    anticoagulant_lock_active: true,
                    lbnp_auto_vent_armed: true,
                    eva_suit_damping_active: false,
                    gate4_invasive_decompression_locked: true,
                    gate4_eva_fitness_no_go: false,
                    ..SafetyGates::default()
                },
                actions: vec![CountermeasureAction {
                    action_id: "ACT_ARED".to_string(),
                    label: "Maintain ARED".to_string(),
                    category: "MECHANICAL".to_string(),
                    delta_rho_per_hour: 0.11,
                }],
            },
            spot_poct: None,
            renal_nephrolithiasis: None,
            orthostatic_fluid: None,
            mars_circadian_sleep: None,
            neuro_immune_viral: None,
        }
    }

    #[test]
    fn test_binary_telemetry_frame_128b_layout_and_roundtrip() {
        assert_eq!(size_of::<BinaryTelemetryFrame>(), 128);
        assert_eq!(align_of::<BinaryTelemetryFrame>(), 64);
        assert_eq!(compute_crc32c(b"123456789"), 0xe306_9283);

        let pkt = sample_packet(true, false);
        let frame = BinaryTelemetryFrame::from_telemetry_packet(
            &pkt,
            None,
            BinaryFrameMeta {
                seq: 77,
                timestamp_ms: 1_794_657_642_000,
                partition_status: PARTITION_ALL_NOMINAL,
                deontic_habitat_mask: 0x41,
                crs_score: Some(0.24),
                owlt_delay_sec: 852.0,
                ipc_latency_ns: 420,
                conformal_abstained: false,
                seu_recovery_active: false,
                include_derived_models: true,
            },
        );
        let bytes = frame.to_le_bytes();
        assert_eq!(bytes.len(), 128);

        let decoded = BinaryTelemetryFrame::from_le_bytes(&bytes).expect("valid 128B roundtrip");
        assert_eq!(decoded.magic, ARES_BINARY_MAGIC);
        assert_eq!(decoded.schema_version, ARES_BINARY_VERSION);
        assert_eq!(decoded.seq, 77);
        assert_eq!(decoded.timestamp_ms, 1_794_657_642_000);
        assert_eq!(decoded.active_playbook_id, 3);
        assert_eq!(decoded.active_alert_code, 2);
        assert_eq!(decoded.hr_opt(), Some(88.0));
        assert_eq!(decoded.rmssd_opt(), Some(36.5));
        assert_eq!(decoded.mri_opt(), Some(82.5));
        assert_eq!(decoded.owlt_delay_sec_opt(), Some(852.0));
        assert!((decoded.ijv_shear_pa_opt().expect("shear") - 0.171).abs() < 1e-5);
        assert!(decoded.crc32c != 0);
    }

    #[test]
    fn test_binary_frame_preserves_none_via_validity_mask_and_flags() {
        let pkt = sample_packet(false, true);
        let frame =
            BinaryTelemetryFrame::from_telemetry_packet(&pkt, None, BinaryFrameMeta::default());
        let bytes = frame.to_le_bytes();
        let decoded = BinaryTelemetryFrame::from_le_bytes(&bytes).expect("decode valid frame");

        assert_eq!(decoded.validity_mask & MASK_PULSE_BPM, 0);
        assert_eq!(decoded.validity_mask & MASK_SPO2_PCT, 0);
        assert_eq!(decoded.validity_mask & MASK_RMSSD_MS, 0);
        assert_eq!(decoded.validity_mask & MASK_MRI_SCORE, 0);
        assert_eq!(decoded.validity_mask & MASK_NQS_MIN_RHO, 0);
        assert_eq!(decoded.validity_mask & MASK_TTV_Q50_DAYS, 0);
        assert_ne!(decoded.validity_mask & MASK_HR_BPM, 0);

        assert_ne!(
            decoded.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
            0
        );
        assert_ne!(
            decoded.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED,
            0
        );
        assert_ne!(decoded.quality_flags_mask & FLAG_CHANNEL_NAN_DROPOUT, 0);

        assert_eq!(decoded.pulse_opt(), None);
        assert_eq!(decoded.spo2_opt(), None);
        assert_eq!(decoded.rmssd_opt(), None);
        assert_eq!(decoded.mri_opt(), None);
        assert_eq!(decoded.nqs_min_rho_opt(), None);
        assert_eq!(decoded.ttv_q50_days_opt(), None);
        assert_eq!(decoded.hr_opt(), Some(88.0));
    }

    #[test]
    fn test_binary_frame_rejects_crc_magic_and_length_corruption() {
        let pkt = sample_packet(true, false);
        let frame =
            BinaryTelemetryFrame::from_telemetry_packet(&pkt, None, BinaryFrameMeta::default());
        let valid = frame.to_le_bytes();

        assert!(matches!(
            BinaryTelemetryFrame::from_le_bytes(&valid[..127]),
            Err(AresCoreError::InvalidBinaryFrameLength {
                expected: 128,
                actual: 127
            })
        ));

        let mut bad_magic = valid;
        bad_magic[0] ^= 0xFF;
        assert!(matches!(
            BinaryTelemetryFrame::from_le_bytes(&bad_magic),
            Err(AresCoreError::InvalidBinaryFrameMagic { .. })
        ));

        let mut bad_crc = valid;
        bad_crc[40] ^= 0x01; // Flip 1 bit in resp_brpm (SEU fault simulation)
        assert!(matches!(
            BinaryTelemetryFrame::from_le_bytes(&bad_crc),
            Err(AresCoreError::InvalidBinaryFrameCrc { .. })
        ));
    }

    #[test]
    fn test_seqlock_telemetry_ring_spmc_concurrent_zero_torn_reads() {
        let ring = Arc::new(SeqlockTelemetryRing::<64>::new());
        assert!(matches!(ring.read_latest(), Err(AresCoreError::ShmRingEmpty)));

        let base_pkt = sample_packet(false, false);
        let producer_ring = Arc::clone(&ring);
        let producer = thread::spawn(move || {
            for seq in 1..=5_000u64 {
                let frame = BinaryTelemetryFrame::from_telemetry_packet(
                    &base_pkt,
                    None,
                    BinaryFrameMeta {
                        seq,
                        timestamp_ms: 1_794_657_600_000 + seq * 50,
                        ..BinaryFrameMeta::default()
                    },
                );
                producer_ring.publish(&frame);
            }
        });

        let mut readers = Vec::new();
        for _ in 0..2 {
            let reader_ring = Arc::clone(&ring);
            readers.push(thread::spawn(move || {
                let mut observed = 0usize;
                for _ in 0..2_000 {
                    match reader_ring.read_latest() {
                        Ok(frame) => {
                            assert_eq!(frame.magic, ARES_BINARY_MAGIC);
                            assert_eq!(
                                frame.timestamp_ms,
                                1_794_657_600_000 + frame.seq * 50
                            );
                            observed += 1;
                        }
                        Err(AresCoreError::ShmRingEmpty | AresCoreError::ShmRingTornReadExhausted) => {}
                        Err(other) => panic!("unexpected ring error: {other}"),
                    }
                }
                observed
            }));
        }

        producer.join().expect("producer join");
        for handle in readers {
            let _ = handle.join().expect("reader join");
        }

        let latest = ring.read_latest().expect("latest frame present");
        assert_eq!(latest.seq, 5_000);
        assert_eq!(ring.write_count(), 5_000);
    }

    #[test]
    fn test_binary_frame_sets_terrestrial_benchmarked_flag_preserving_illustrative_bit() {
        use crate::telemetry::{Sha256DigestHex, TerrestrialBenchmarkScope};

        let mut pkt = sample_packet(true, false);
        pkt.model_validation_status = ModelValidationStatus::InternallyBenchmarkedTerrestrial {
            dataset_scope: TerrestrialBenchmarkScope::BidmcNumericsShortSubHorizon,
            coverage_pct: 91.2,
            brier_score: 0.12,
            artifact_sha256: Sha256DigestHex([0xAB; 32]),
        };

        let frame = BinaryTelemetryFrame::encode_from_packet(&pkt, None, BinaryFrameMeta::default());
        assert_ne!(frame.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED, 0);
        assert_ne!(
            frame.quality_flags_mask & FLAG_TERRESTRIAL_BENCHMARKED_ONLY,
            0
        );

        pkt.model_validation_status = ModelValidationStatus::ClinicallyCalibratedSubjectToReview;
        let cal_frame =
            BinaryTelemetryFrame::encode_from_packet(&pkt, None, BinaryFrameMeta::default());
        assert_eq!(
            cal_frame.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED,
            0
        );
        assert_eq!(
            cal_frame.quality_flags_mask & FLAG_TERRESTRIAL_BENCHMARKED_ONLY,
            0
        );
    }

    #[test]
    fn test_playbook_id_all_15_mapping_and_roundtrip() {
        let expected = [
            ("PLAYBOOK_01_VENOUS_STASIS_LBNP", 1),
            ("PLAYBOOK_02_CONFIRMED_IJV_THROMBUS", 2),
            ("PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED", 3),
            ("PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION", 4),
            ("PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS", 5),
            ("PLAYBOOK_06_HYPOXEMIA_DESATURATION", 6),
            ("PLAYBOOK_07_HEART_RATE_ANOMALY", 7),
            ("PLAYBOOK_08_SENSOR_SIGNAL_LOSS", 8),
            ("PLAYBOOK_09_MULTIPARAMETER_DETERIORATION", 9),
            ("PLAYBOOK_10_RENAL_LITHIASIS", 10),
            ("PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING", 11),
            ("PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE", 12),
            ("PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR", 13),
            ("PLAYBOOK_14_CO2_SCRUBBER_SANS", 14),
            ("PLAYBOOK_15_EFAST_TRAUMA_TRIAGE", 15),
        ];

        for (id, code) in expected {
            assert_eq!(playbook_id_to_u16(id), code);
            assert_eq!(playbook_id_from_u16(code), Some(id));
        }

        assert_eq!(playbook_id_to_u16("PLAYBOOK_99_UNKNOWN"), 0);
        assert_eq!(playbook_id_from_u16(0), None);
        assert_eq!(playbook_id_from_u16(16), None);
    }
}
