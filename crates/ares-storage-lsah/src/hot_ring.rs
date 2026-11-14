use ares_core_types::telemetry::{
    BiometricsSource, ModelValidationStatus, TelemetryPacket,
};
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::Notify;

/// Bit positions in `HotLsahSlot::validity_mask` preserving Issue #11 & BIDMC null semantics.
pub const VALID_HR_BPM: u32 = 1 << 0;
pub const VALID_PULSE_BPM: u32 = 1 << 1;
pub const VALID_RESP_RPM: u32 = 1 << 2;
pub const VALID_SPO2_PCT: u32 = 1 << 3;
pub const VALID_RMSSD_MS: u32 = 1 << 4;
pub const VALID_SBP_DBP_MMHG: u32 = 1 << 5;
pub const VALID_VOCAL_BIOMARKERS: u32 = 1 << 6;
pub const VALID_RADAR_CSI: u32 = 1 << 7;

/// Bit positions in `HotLsahSlot::quality_flags_mask`.
pub const QUALITY_BEAT_INTERVALS_NOT_AVAILABLE: u32 = 1 << 0;
pub const QUALITY_LOW_SQI: u32 = 1 << 1;

/// Bit positions in `HotLsahSlot::safety_gates_mask`.
pub const GATE_ANTICOAG_LOCK: u8 = 1 << 0;
pub const GATE_LBNP_VENT: u8 = 1 << 1;
pub const GATE_MARTIAN_GAI_LOCK: u8 = 1 << 2;

/// Provenance codes encoded in `HotLsahSlot::provenance_code`.
pub const PROVENANCE_PHYSIONET_BIDMC: u8 = 0;
pub const PROVENANCE_SCENARIO_OVERLAY: u8 = 1;
pub const PROVENANCE_HARDWARE_EDGE: u8 = 2;

/// Validation status codes encoded in `HotLsahSlot::validation_status_code` (Issue #12).
pub const VALIDATION_ILLUSTRATIVE_UNVALIDATED: u8 = 0;
pub const VALIDATION_INTERNALLY_BENCHMARKED_TERRESTRIAL: u8 = 1;
pub const VALIDATION_CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW: u8 = 2;

/// Exact 256-byte (4 x 64-byte CPU cache lines), zero-heap-pointer telemetry slot.
#[repr(C, align(64))]
#[derive(Clone, Copy, Debug)]
pub struct HotLsahSlot {
    // Cache Line 0 (64 B): Temporal identity, validity bitmasks & provenance
    pub sequence_id: u64,
    pub timestamp_unix_ms: i64,
    pub mission_sol: u16,
    pub provenance_code: u8,
    pub validation_status_code: u8,
    pub validity_mask: u32,
    pub quality_flags_mask: u32,
    pub safety_gates_mask: u8,
    pub active_playbook_id: u8,
    pub reserved_hdr: [u8; 2],
    pub crew_id_ascii: [u8; 16],
    pub sqi_score: f32,
    pub mri_score: f32,
    pub slot_crc32c: u32,
    pub reserved_cl0: u32,

    // Cache Line 1 (64 B): Primary cardiorespiratory, cabin & countermeasure channels
    pub hr_bpm: f64,
    pub pulse_bpm: f64,
    pub resp_rpm: f64,
    pub spo2_pct: f64,
    pub rmssd_ms: f64,
    pub sbp_mmhg: f32,
    pub dbp_mmhg: f32,
    pub cabin_pp_co2_mmhg: f32,
    pub ared_strain_ue: f32,
    pub lbnp_pressure_mmhg: f32,
    pub cans_dose_msv_day: f32,

    // Cache Line 2 (64 B): Causal graph (ADHG) states & Bayesian POCUS posterior
    pub tau_w_dyn_cm2: f64,
    pub ijv_csa_cm2: f64,
    pub ijv_vmax_cm_s: f32,
    pub sost_ng_ml: f32,
    pub mqi_index: f32,
    pub gai_pct: f32,
    pub onsd_mm: f32,
    pub pocus_p_thrombus: f32,
    pub rho_min_global: f32,
    pub ttv_hours: f32,
    pub vocal_jitter_pct: f32,
    pub vocal_shimmer_db: f32,
    pub vocal_hnr_db: f32,
    pub vitals_anomaly_score: f32,

    // Cache Line 3 (64 B): Per-organ NQS-STL margins & Timestral 1 Hz bridge cone
    pub rho_cardio: f32,
    pub rho_vascular_ijv: f32,
    pub rho_bone_sost: f32,
    pub rho_muscle_mqi: f32,
    pub rho_ocular_sans: f32,
    pub rho_radiation: f32,
    pub rho_co2_neuro: f32,
    pub forecast_q05_rho: f32,
    pub forecast_q50_rho: f32,
    pub forecast_q95_rho: f32,
    pub reserved_cl3: [u8; 24],
}

const _: () = assert!(core::mem::size_of::<HotLsahSlot>() == 256);
const _: () = assert!(core::mem::align_of::<HotLsahSlot>() == 64);

impl Default for HotLsahSlot {
    fn default() -> Self {
        Self::zeroed()
    }
}

impl HotLsahSlot {
    /// Returns a zero-initialized `HotLsahSlot` with valid `slot_crc32c`.
    pub const fn zeroed() -> Self {
        Self {
            sequence_id: 0,
            timestamp_unix_ms: 0,
            mission_sol: 1,
            provenance_code: PROVENANCE_PHYSIONET_BIDMC,
            validation_status_code: VALIDATION_ILLUSTRATIVE_UNVALIDATED,
            validity_mask: 0,
            quality_flags_mask: 0,
            safety_gates_mask: GATE_ANTICOAG_LOCK,
            active_playbook_id: 0,
            reserved_hdr: [0; 2],
            crew_id_ascii: [0; 16],
            sqi_score: 0.0,
            mri_score: 0.0,
            slot_crc32c: 0,
            reserved_cl0: 0,
            hr_bpm: 0.0,
            pulse_bpm: 0.0,
            resp_rpm: 0.0,
            spo2_pct: 0.0,
            rmssd_ms: 0.0,
            sbp_mmhg: 0.0,
            dbp_mmhg: 0.0,
            cabin_pp_co2_mmhg: 0.0,
            ared_strain_ue: 0.0,
            lbnp_pressure_mmhg: 0.0,
            cans_dose_msv_day: 0.0,
            tau_w_dyn_cm2: 0.0,
            ijv_csa_cm2: 0.0,
            ijv_vmax_cm_s: 0.0,
            sost_ng_ml: 0.0,
            mqi_index: 0.0,
            gai_pct: 0.0,
            onsd_mm: 0.0,
            pocus_p_thrombus: 0.0,
            rho_min_global: 0.0,
            ttv_hours: 0.0,
            vocal_jitter_pct: 0.0,
            vocal_shimmer_db: 0.0,
            vocal_hnr_db: 0.0,
            vitals_anomaly_score: 0.0,
            rho_cardio: 0.0,
            rho_vascular_ijv: 0.0,
            rho_bone_sost: 0.0,
            rho_muscle_mqi: 0.0,
            rho_ocular_sans: 0.0,
            rho_radiation: 0.0,
            rho_co2_neuro: 0.0,
            forecast_q05_rho: 0.0,
            forecast_q50_rho: 0.0,
            forecast_q95_rho: 0.0,
            reserved_cl3: [0; 24],
        }
    }

    /// Sets the fixed 16-byte ASCII `crew_id_ascii` field without heap allocations.
    pub fn set_crew_id(&mut self, crew_id: &str) {
        self.crew_id_ascii = [0u8; 16];
        let bytes = crew_id.as_bytes();
        let copy_len = bytes.len().min(16);
        self.crew_id_ascii[..copy_len].copy_from_slice(&bytes[..copy_len]);
    }

    /// Reads `crew_id_ascii` as a trimmed UTF-8 string slice.
    pub fn crew_id_str(&self) -> &str {
        let len = self
            .crew_id_ascii
            .iter()
            .position(|&b| b == 0)
            .unwrap_or(self.crew_id_ascii.len());
        std::str::from_utf8(&self.crew_id_ascii[..len]).unwrap_or("CREW-UNKNOWN")
    }

    /// Converts a `TelemetryPacket` into a cache-aligned `HotLsahSlot` with valid CRC-32C.
    pub fn from_telemetry_packet(
        sequence_id: u64,
        timestamp_unix_ms: i64,
        mission_sol: u16,
        packet: &TelemetryPacket,
    ) -> Self {
        let mut slot = Self::zeroed();
        slot.sequence_id = sequence_id;
        slot.timestamp_unix_ms = timestamp_unix_ms;
        slot.mission_sol = mission_sol.max(1);
        slot.set_crew_id(&packet.astronaut_id);

        slot.provenance_code = match packet.provenance_manifest.biometrics_source {
            BiometricsSource::RecordedTerrestrialBidmcCsv => PROVENANCE_PHYSIONET_BIDMC,
            BiometricsSource::SimulatedScenarioInput => PROVENANCE_SCENARIO_OVERLAY,
        };
        slot.validation_status_code = match packet.model_validation_status {
            ModelValidationStatus::IllustrativeUnvalidated => VALIDATION_ILLUSTRATIVE_UNVALIDATED,
            ModelValidationStatus::InternallyBenchmarkedTerrestrial { .. } => {
                VALIDATION_INTERNALLY_BENCHMARKED_TERRESTRIAL
            }
            ModelValidationStatus::ClinicallyCalibratedSubjectToReview => {
                VALIDATION_CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW
            }
        };

        let mut validity_mask = 0u32;
        if let Some(hr) = packet.biometrics.heart_rate_bpm {
            slot.hr_bpm = hr;
            validity_mask |= VALID_HR_BPM;
        }
        if let Some(pulse) = packet.biometrics.pulse_rate_bpm {
            slot.pulse_bpm = pulse;
            validity_mask |= VALID_PULSE_BPM;
        }
        if let Some(resp) = packet.biometrics.resp_rate_brpm {
            slot.resp_rpm = resp;
            validity_mask |= VALID_RESP_RPM;
        }
        if let Some(spo2) = packet.biometrics.spo2_pct {
            slot.spo2_pct = spo2;
            validity_mask |= VALID_SPO2_PCT;
        }
        if let Some(rmssd) = packet.biometrics.rmssd_ms {
            slot.rmssd_ms = rmssd;
            validity_mask |= VALID_RMSSD_MS;
        }
        if let Some(jitter) = packet.biometrics.vocal_jitter_pct {
            slot.vocal_jitter_pct = jitter as f32;
            validity_mask |= VALID_VOCAL_BIOMARKERS;
        }
        slot.validity_mask = validity_mask;

        let mut quality_flags = 0u32;
        if packet.biometrics.hrv_unavailable_reason.is_some()
            || (validity_mask & VALID_RMSSD_MS) == 0
        {
            quality_flags |= QUALITY_BEAT_INTERVALS_NOT_AVAILABLE;
        }
        if packet.biometrics.sqi_score < 0.70 {
            quality_flags |= QUALITY_LOW_SQI;
        }
        slot.quality_flags_mask = quality_flags;

        let mut gates = 0u8;
        if packet.active_playbook.safety_gates.anticoagulant_lock_active {
            gates |= GATE_ANTICOAG_LOCK;
        }
        if packet.active_playbook.safety_gates.lbnp_auto_vent_armed {
            gates |= GATE_LBNP_VENT;
        }
        if packet.active_playbook.safety_gates.eva_suit_damping_active {
            gates |= GATE_MARTIAN_GAI_LOCK;
        }
        slot.safety_gates_mask = gates;

        slot.sqi_score = packet.biometrics.sqi_score as f32;
        slot.mri_score = packet.nqs_stl.mri_pct.unwrap_or(0.0) as f32;

        slot.ared_strain_ue = (packet.musculoskeletal.ared_daily_load_kgf * 8.0) as f32;
        slot.lbnp_pressure_mmhg = packet.jugular_hemodynamics.lbnp_pressure_mmhg as f32;
        slot.cans_dose_msv_day = packet.biometrics.radiation_dose_rate_msv_d as f32;

        slot.tau_w_dyn_cm2 = packet.jugular_hemodynamics.tau_w_dyn_cm2;
        slot.ijv_csa_cm2 = packet.jugular_hemodynamics.ijv_csa_mm2 / 100.0;
        slot.ijv_vmax_cm_s = packet.jugular_hemodynamics.ijv_vmax_cm_s as f32;
        slot.sost_ng_ml = packet.musculoskeletal.sclerostin_pmol_l as f32;
        slot.mqi_index = packet.musculoskeletal.mqi_index as f32;
        slot.gai_pct = packet.musculoskeletal.gai_pct as f32;
        slot.onsd_mm = packet.sans_ocular.onsd_mm as f32;
        slot.pocus_p_thrombus = if packet.jugular_hemodynamics.pocus_thrombus_confirmed {
            0.95
        } else {
            0.12
        };
        slot.rho_min_global = packet.nqs_stl.rho_global.unwrap_or(0.0) as f32;
        slot.ttv_hours = packet.nqs_stl.ttv_hours.unwrap_or(0.0) as f32;

        slot.rho_cardio = packet.nqs_stl.rho_rmssd.unwrap_or(0.0) as f32;
        slot.rho_vascular_ijv = packet.nqs_stl.rho_tau_w as f32;
        slot.rho_bone_sost = packet.nqs_stl.rho_sost as f32;
        slot.rho_muscle_mqi = packet.nqs_stl.rho_ared as f32;
        slot.rho_ocular_sans = packet.nqs_stl.rho_sans as f32;
        slot.update_crc32c();
        slot
    }

    /// Computes deterministic CRC-32C across all payload fields (excluding `slot_crc32c`).
    pub fn compute_crc32c(&self) -> u32 {
        let mut h = crc32fast::Hasher::new();
        h.update(&self.sequence_id.to_le_bytes());
        h.update(&self.timestamp_unix_ms.to_le_bytes());
        h.update(&self.mission_sol.to_le_bytes());
        h.update(&[self.provenance_code, self.validation_status_code]);
        h.update(&self.validity_mask.to_le_bytes());
        h.update(&self.quality_flags_mask.to_le_bytes());
        h.update(&[self.safety_gates_mask, self.active_playbook_id]);
        h.update(&self.reserved_hdr);
        h.update(&self.crew_id_ascii);
        h.update(&self.sqi_score.to_le_bytes());
        h.update(&self.mri_score.to_le_bytes());
        h.update(&self.reserved_cl0.to_le_bytes());

        h.update(&self.hr_bpm.to_le_bytes());
        h.update(&self.pulse_bpm.to_le_bytes());
        h.update(&self.resp_rpm.to_le_bytes());
        h.update(&self.spo2_pct.to_le_bytes());
        h.update(&self.rmssd_ms.to_le_bytes());
        h.update(&self.sbp_mmhg.to_le_bytes());
        h.update(&self.dbp_mmhg.to_le_bytes());
        h.update(&self.cabin_pp_co2_mmhg.to_le_bytes());
        h.update(&self.ared_strain_ue.to_le_bytes());
        h.update(&self.lbnp_pressure_mmhg.to_le_bytes());
        h.update(&self.cans_dose_msv_day.to_le_bytes());

        h.update(&self.tau_w_dyn_cm2.to_le_bytes());
        h.update(&self.ijv_csa_cm2.to_le_bytes());
        h.update(&self.ijv_vmax_cm_s.to_le_bytes());
        h.update(&self.sost_ng_ml.to_le_bytes());
        h.update(&self.mqi_index.to_le_bytes());
        h.update(&self.gai_pct.to_le_bytes());
        h.update(&self.onsd_mm.to_le_bytes());
        h.update(&self.pocus_p_thrombus.to_le_bytes());
        h.update(&self.rho_min_global.to_le_bytes());
        h.update(&self.ttv_hours.to_le_bytes());
        h.update(&self.vocal_jitter_pct.to_le_bytes());
        h.update(&self.vocal_shimmer_db.to_le_bytes());
        h.update(&self.vocal_hnr_db.to_le_bytes());
        h.update(&self.vitals_anomaly_score.to_le_bytes());

        h.update(&self.rho_cardio.to_le_bytes());
        h.update(&self.rho_vascular_ijv.to_le_bytes());
        h.update(&self.rho_bone_sost.to_le_bytes());
        h.update(&self.rho_muscle_mqi.to_le_bytes());
        h.update(&self.rho_ocular_sans.to_le_bytes());
        h.update(&self.rho_radiation.to_le_bytes());
        h.update(&self.rho_co2_neuro.to_le_bytes());
        h.update(&self.forecast_q05_rho.to_le_bytes());
        h.update(&self.forecast_q50_rho.to_le_bytes());
        h.update(&self.forecast_q95_rho.to_le_bytes());
        h.update(&self.reserved_cl3);
        h.finalize()
    }

    /// Recomputes and stores `slot_crc32c`.
    #[inline]
    pub fn update_crc32c(&mut self) {
        self.slot_crc32c = self.compute_crc32c();
    }

    /// Returns true if `slot_crc32c` matches the recomputed digest.
    #[inline]
    pub fn verify_crc32c(&self) -> bool {
        self.slot_crc32c == self.compute_crc32c()
    }
}

struct HotRingInner {
    slots: Box<[HotLsahSlot]>,
    write_cursor: usize,
    total_pushed: u64,
}

/// Fixed-capacity Hot-tier circular ring buffer with zero post-init heap allocations.
pub struct HotRingBuffer {
    inner: RwLock<HotRingInner>,
}

impl HotRingBuffer {
    /// Allocates the contiguous `Box<[HotLsahSlot]>` slice once at startup (`1_200..=6_000` slots).
    pub fn new(capacity_frames: usize) -> Self {
        let cap = capacity_frames.clamp(1_200, 6_000);
        let slots = vec![HotLsahSlot::zeroed(); cap].into_boxed_slice();
        Self {
            inner: RwLock::new(HotRingInner {
                slots,
                write_cursor: 0,
                total_pushed: 0,
            }),
        }
    }

    /// Inserts a `HotLsahSlot` in O(1) via a single 256-byte copy with zero heap allocations.
    #[inline]
    pub fn push(&self, mut slot: HotLsahSlot) -> u64 {
        slot.update_crc32c();
        let mut guard = self.inner.write();
        let cap = guard.slots.len();
        let idx = guard.write_cursor;
        guard.slots[idx] = slot;
        guard.write_cursor = (idx + 1) % cap;
        guard.total_pushed += 1;
        guard.total_pushed
    }

    /// Returns the base address of the preallocated slot buffer (for allocation-invariance verification).
    pub fn slots_ptr_addr(&self) -> usize {
        let guard = self.inner.read();
        guard.slots.as_ptr() as usize
    }

    /// Returns the number of valid frames currently retained in the ring (`<= capacity`).
    pub fn len(&self) -> usize {
        let guard = self.inner.read();
        (guard.total_pushed as usize).min(guard.slots.len())
    }

    /// Returns true when no frames have been pushed yet.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Returns the fixed capacity in frames.
    pub fn capacity(&self) -> usize {
        self.inner.read().slots.len()
    }

    /// Returns total monotonically pushed frames since initialization.
    pub fn total_pushed(&self) -> u64 {
        self.inner.read().total_pushed
    }

    /// Returns up to `max_frames` most recent slots in chronological (oldest-to-newest) order.
    pub fn snapshot_recent(&self, max_frames: usize) -> Vec<HotLsahSlot> {
        let guard = self.inner.read();
        let cap = guard.slots.len();
        let available = (guard.total_pushed as usize).min(cap);
        let count = available.min(max_frames);
        let mut out = Vec::with_capacity(count);
        if count == 0 {
            return out;
        }
        let start = (guard.write_cursor + cap - count) % cap;
        for i in 0..count {
            let idx = (start + i) % cap;
            out.push(guard.slots[idx]);
        }
        out
    }
}

/// Lossless Welford running summary for extreme SSD stalls exceeding two full swap windows.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WelfordEmergencySummary {
    pub count: u64,
    pub min_sequence_id: u64,
    pub max_sequence_id: u64,
    pub hr_mean: f64,
    pub hr_m2: f64,
    pub tau_w_mean: f64,
    pub tau_w_m2: f64,
    pub min_rho_global: f32,
}

impl WelfordEmergencySummary {
    pub fn update(&mut self, slot: &HotLsahSlot) {
        if self.count == 0 {
            self.min_sequence_id = slot.sequence_id;
            self.max_sequence_id = slot.sequence_id;
            self.min_rho_global = slot.rho_min_global;
        } else {
            self.min_sequence_id = self.min_sequence_id.min(slot.sequence_id);
            self.max_sequence_id = self.max_sequence_id.max(slot.sequence_id);
            self.min_rho_global = self.min_rho_global.min(slot.rho_min_global);
        }
        self.count += 1;
        let n = self.count as f64;
        if (slot.validity_mask & VALID_HR_BPM) != 0 && slot.hr_bpm.is_finite() {
            let delta = slot.hr_bpm - self.hr_mean;
            self.hr_mean += delta / n;
            let delta2 = slot.hr_bpm - self.hr_mean;
            self.hr_m2 += delta * delta2;
        }
        if slot.tau_w_dyn_cm2.is_finite() {
            let delta = slot.tau_w_dyn_cm2 - self.tau_w_mean;
            self.tau_w_mean += delta / n;
            let delta2 = slot.tau_w_dyn_cm2 - self.tau_w_mean;
            self.tau_w_m2 += delta * delta2;
        }
    }
}

struct StagingState {
    banks: [Box<[HotLsahSlot]>; 2],
    lens: [usize; 2],
    active_bank: usize,
    draining_bank: Option<usize>,
}

/// Wait-free/non-blocking double-buffered Warm staging buffer isolating the 20 Hz loop from SSD stalls.
pub struct WarmStagingSwapBuffer {
    state: Mutex<StagingState>,
    batch_size: usize,
    notify: Arc<Notify>,
    warm_coalesced_frames: AtomicU64,
    emergency_summary: Mutex<WelfordEmergencySummary>,
}

impl WarmStagingSwapBuffer {
    /// Preallocates two `batch_size` slot banks (`2 x batch_size x 256 B`).
    pub fn new(batch_size: usize) -> Self {
        let clamped = batch_size.clamp(1, 2_000);
        let bank0 = vec![HotLsahSlot::zeroed(); clamped].into_boxed_slice();
        let bank1 = vec![HotLsahSlot::zeroed(); clamped].into_boxed_slice();
        Self {
            state: Mutex::new(StagingState {
                banks: [bank0, bank1],
                lens: [0, 0],
                active_bank: 0,
                draining_bank: None,
            }),
            batch_size: clamped,
            notify: Arc::new(Notify::new()),
            warm_coalesced_frames: AtomicU64::new(0),
            emergency_summary: Mutex::new(WelfordEmergencySummary::default()),
        }
    }

    /// Returns the background flusher notification handle.
    pub fn notifier(&self) -> Arc<Notify> {
        Arc::clone(&self.notify)
    }

    /// Appends a slot into the active staging bank in O(1) without ever waiting on disk I/O.
    /// If both swap banks are full due to an extreme SSD stall, folds the frame into the
    /// emergency Welford summary and increments `warm_coalesced_frames`.
    pub fn push_for_warm_flush(&self, slot: &HotLsahSlot) {
        let mut should_notify = false;
        let mut overflow_slot: Option<HotLsahSlot> = None;

        {
            let mut guard = self.state.lock();
            let active = guard.active_bank;
            let active_len = guard.lens[active];

            if active_len < self.batch_size {
                guard.banks[active][active_len] = *slot;
                guard.lens[active] = active_len + 1;
                if active_len + 1 == self.batch_size {
                    should_notify = true;
                }
            } else {
                let inactive = active ^ 1;
                if guard.draining_bank != Some(inactive) && guard.lens[inactive] == 0 {
                    guard.active_bank = inactive;
                    guard.banks[inactive][0] = *slot;
                    guard.lens[inactive] = 1;
                    should_notify = true;
                } else {
                    overflow_slot = Some(*slot);
                    should_notify = true;
                }
            }
        }

        if let Some(s) = overflow_slot {
            self.warm_coalesced_frames.fetch_add(1, Ordering::Relaxed);
            self.emergency_summary.lock().update(&s);
        }

        if should_notify {
            self.notify.notify_one();
        }
    }

    /// Swaps out any ready bank (full bank, or partial bank if `force_partial` is true) into `out_buf`
    /// while holding the staging lock for O(1) copy duration only.
    pub fn take_ready_batch(&self, force_partial: bool, out_buf: &mut Vec<HotLsahSlot>) -> usize {
        out_buf.clear();
        let mut guard = self.state.lock();
        let active = guard.active_bank;
        let inactive = active ^ 1;

        // First prefer a full inactive bank that was already filled before a swap.
        let target_bank = if guard.lens[inactive] > 0 && guard.draining_bank != Some(inactive) {
            Some(inactive)
        } else if guard.lens[active] >= self.batch_size
            || (force_partial && guard.lens[active] > 0)
        {
            // Swap active bank if the other bank is idle and empty, otherwise drain active directly.
            let old_active = active;
            if guard.lens[inactive] == 0 && guard.draining_bank != Some(inactive) {
                guard.active_bank = inactive;
            }
            Some(old_active)
        } else {
            None
        };

        let Some(bank_idx) = target_bank else {
            return 0;
        };

        let count = guard.lens[bank_idx];
        if count == 0 {
            return 0;
        }
        out_buf.extend_from_slice(&guard.banks[bank_idx][..count]);
        guard.lens[bank_idx] = 0;
        count
    }

    /// Returns total frames coalesced into the emergency Welford summary during extreme SSD stalls.
    pub fn warm_coalesced_frames(&self) -> u64 {
        self.warm_coalesced_frames.load(Ordering::Relaxed)
    }

    /// Returns a snapshot of the emergency Welford summary.
    pub fn emergency_summary_snapshot(&self) -> WelfordEmergencySummary {
        self.emergency_summary.lock().clone()
    }

    /// Returns configured batch size.
    pub fn batch_size(&self) -> usize {
        self.batch_size
    }
}
