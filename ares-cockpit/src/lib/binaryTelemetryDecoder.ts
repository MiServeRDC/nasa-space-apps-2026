// Zero-copy DataView decoder & deterministic encoder for the 128-byte little-endian
// ARES-MedOS BinaryTelemetryFrame ABI (Phase 21 J1 / Phase 23 J3).
// Strict Mode: zero emojis, strict nullability (missing channels never coerced to 0).

import type {
  ActivePlaybook,
  AlarmLevel,
  ConformalGateStatus,
  CountermeasureAction,
  ModelValidationStatus,
  TelemetryPacket,
} from '../types/telemetry';

export const ARES_BINARY_MAGIC = 0x41524553; // "ARES"
export const ARES_BINARY_SCHEMA_VERSION = 1;
export const ARES_BINARY_FRAME_BYTES = 128;
export const ARES_BINARY_CRC_OFFSET = 104;

// ARINC-653 partition health bits (`partition_status` byte at offset 6)
export const PARTITION_TELEMETRY_INGEST = 1 << 0;
export const PARTITION_CAUSAL_ODE_STL = 1 << 1;
export const PARTITION_TIMESTRAL_FORECASTER = 1 << 2;
export const PARTITION_MEDOPS_UI_SHELL = 1 << 3;
export const PARTITION_ALL_HEALTHY_MASK = 0x0f;

// Habitat Deontic mask (`deontic_habitat_mask` byte at offset 7)
export const DEONTIC_ZONE_CODE_MASK = 0x07;
export const DEONTIC_VIOLATES_POLICY = 1 << 3;
export const DEONTIC_EVA_FORBIDDEN = 1 << 4;
export const DEONTIC_SHELTER_MANDATORY = 1 << 5;
export const DEONTIC_EIMO_AUTONOMOUS_ACTIVE = 1 << 6;

export const HABITAT_ZONE_NAMES = [
  'SLEEP_QUARTERS',
  'ARED_EXERCISE_BAY',
  'LBNP_CHAMBER',
  'MEDOPS_ULTRASOUND_BAY',
  'RADIATION_STORM_SHELTER',
  'EVA_AIRLOCK',
] as const;

export type HabitatZoneCodeName = (typeof HABITAT_ZONE_NAMES)[number];

// `validity_mask` bits (offset 24..28): 1 = finite present, 0 = null / NaN
export const MASK_HR_BPM = 1 << 0;
export const MASK_PULSE_BPM = 1 << 1;
export const MASK_RESP_BRPM = 1 << 2;
export const MASK_SPO2_PCT = 1 << 3;
export const MASK_RMSSD_MS = 1 << 4;
export const MASK_MRI_SCORE = 1 << 5;
export const MASK_CRS_SCORE = 1 << 6;
export const MASK_SANS_RISK = 1 << 7;
export const MASK_IJV_SHEAR_PA = 1 << 8;
export const MASK_SOST_PG_ML = 1 << 9;
export const MASK_RADIATION_MSV_D = 1 << 10;
export const MASK_NQS_MIN_RHO = 1 << 11;
export const MASK_TTV_Q05_DAYS = 1 << 12;
export const MASK_TTV_Q50_DAYS = 1 << 13;
export const MASK_TTV_Q95_DAYS = 1 << 14;
export const MASK_OWLT_DELAY_SEC = 1 << 15;

// `quality_flags_mask` bits (offset 28..32)
export const FLAG_WHAT_IF_ACTIVE = 1 << 0;
export const FLAG_POCUS_CONFIRMED = 1 << 1;
export const FLAG_LBNP_ACTIVE = 1 << 2;
export const FLAG_GATE1_ANTICOAG_LOCK = 1 << 3;
export const FLAG_GATE2_LBNP_VENT = 1 << 4;
export const FLAG_GATE3_EVA_DAMPING = 1 << 5;
export const FLAG_BEAT_INTERVALS_NOT_AVAILABLE = 1 << 6;
export const FLAG_ILLUSTRATIVE_UNVALIDATED = 1 << 7;
export const FLAG_CHANNEL_NAN_DROPOUT = 1 << 8;
export const FLAG_CONFORMAL_ABSTAINED = 1 << 9;
export const FLAG_SEU_RECOVERY_ACTIVE = 1 << 10;
export const FLAG_TERRESTRIAL_BENCHMARKED_ONLY = 1 << 11;
export const FLAG_GATE4A_DECOMPRESSION_LOCK = 1 << 12;
export const FLAG_GATE4B_EVA_NO_GO = 1 << 13;

export const PLAYBOOK_ID_BY_CODE: Record<number, string> = {
  0: 'NONE',
  1: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
  2: 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS',
  3: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
  4: 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION',
  5: 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS',
  6: 'PLAYBOOK_06_HYPOXEMIA_DESATURATION',
  7: 'PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS',
  8: 'PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK',
  9: 'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION',
  10: 'PLAYBOOK_10_RENAL_LITHIASIS',
  11: 'PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING',
  12: 'PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE',
  13: 'PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR',
  14: 'PLAYBOOK_14_CO2_SCRUBBER_SANS',
  15: 'PLAYBOOK_15_EFAST_TRAUMA_TRIAGE',
};

interface BinaryPlaybookDefaultMeta {
  playbook_id: string;
  title: string;
  total_steps: number;
  step_instruction: string;
  causal_chain_summary: string[];
  actions: CountermeasureAction[];
}

export const BINARY_PLAYBOOK_DEFAULTS: Record<number, BinaryPlaybookDefaultMeta> = {
  1: {
    playbook_id: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    title: 'Playbook #01: Microgravity Venous Stasis & LBNP',
    total_steps: 3,
    step_instruction:
      'Execute 30 min LBNP at -25 mmHg with active optical/BP auto-vent safety guard',
    causal_chain_summary: [
      '0g_fluid_shift -> IJV_cross_section_enlargement',
      'IJV_stasis -> wall_shear_stress_drop -> elevated_thrombosis_risk',
    ],
    actions: [
      {
        action_id: 'LBNP_25_MMHG_30M',
        label: 'LBNP -25 mmHg (30 min)',
        category: 'MECHANICAL_LBNP',
        delta_rho_per_hour: 0.14,
      },
      {
        action_id: 'BILATERAL_IJV_POCUS_SWEEP',
        label: 'Bilateral IJV Compression POCUS',
        category: 'DIAGNOSTIC_IMAGING',
        delta_rho_per_hour: 0.02,
      },
    ],
  },
  2: {
    playbook_id: 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS',
    title: 'Playbook #02: Confirmed IJV Thrombus Gate & Anticoagulant Guard',
    total_steps: 3,
    step_instruction:
      'Engage anticoagulant safety lock until POCUS thrombus confirmation and flight-surgeon authorization',
    causal_chain_summary: [
      'IJV_stasis -> retrograde_flow_vortex -> POCUS_confirmed_thrombus',
      'Thrombus_detected -> Gate1_anticoagulant_lock_verified',
    ],
    actions: [
      {
        action_id: 'POCUS_COMPRESSIBILITY_CONFIRM',
        label: 'Confirm POCUS Non-Compressibility',
        category: 'DIAGNOSTIC_IMAGING',
        delta_rho_per_hour: 0.01,
      },
      {
        action_id: 'ACT_ANTICOAG_ENOXAPARIN',
        label: 'Enoxaparin 1 mg/kg SC (Gate 1 Locked)',
        category: 'PHARMACOLOGICAL_ANTICOAGULANT',
        delta_rho_per_hour: 0.18,
      },
    ],
  },
  3: {
    playbook_id: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
    title: 'Playbook #03: ARED Resistive Loading & Osteopenia Countermeasure',
    total_steps: 3,
    step_instruction:
      'Schedule ARED squat/deadlift eccentric loading protocol to suppress sclerostin surge',
    causal_chain_summary: [
      '0.38g_or_0g_unloading -> osteocyte_sclerostin_surge',
      'Sclerostin_elevation -> Wnt_inhibition -> trabecular_BMD_loss',
    ],
    actions: [
      {
        action_id: 'ARED_RESISTIVE_PROTOCOL_A',
        label: 'ARED Resistive Loading (45 min)',
        category: 'EXERCISE_RESISTIVE',
        delta_rho_per_hour: 0.16,
      },
      {
        action_id: 'TARGETED_PROTEIN_VITD_SUPPLEMENT',
        label: 'Protein + VitD3/Calcium Countermeasure',
        category: 'NUTRITIONAL_SUPPLEMENT',
        delta_rho_per_hour: 0.05,
      },
    ],
  },
  4: {
    playbook_id: 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION',
    title: 'Playbook #04: SANS Translaminar Pressure & Choroidal Guard',
    total_steps: 3,
    step_instruction:
      'Deploy evening Chibis/LBNP cephalad unloading and restrict high-strain Valsalva ARED sets',
    causal_chain_summary: [
      'Cephalad_venous_congestion + CO2_vasodilation -> ICP_rise',
      'Translaminar_gradient_inversion -> RNFL_choroidal_edema_SANS',
    ],
    actions: [
      {
        action_id: 'EVENING_LBNP_CHIBIS_PROTOCOL',
        label: 'Evening LBNP -20 mmHg Cephalad Unloading',
        category: 'MECHANICAL_LBNP',
        delta_rho_per_hour: 0.12,
      },
      {
        action_id: 'MODULATE_CABIN_CO2_SCRUBBING',
        label: 'Boost CDRA CO2 Scrubbing (< 2.0 mmHg)',
        category: 'ENVIRONMENTAL_ECLSS',
        delta_rho_per_hour: 0.09,
      },
    ],
  },
  5: {
    playbook_id: 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS',
    title: 'Playbook #05: SPE Solar Particle Storm Shelter & CANS Shielding',
    total_steps: 3,
    step_instruction:
      'MANDATORY: Relocate crew to Radiation Storm Shelter immediately; forbid EVA airlock egress',
    causal_chain_summary: [
      'Solar_particle_event -> acute_dose_rate_spike (> 10 mSv/d)',
      'Deontic_constraint -> EVA_forbidden_shelter_mandatory',
    ],
    actions: [
      {
        action_id: 'SHELTER_PROTOCOL_WATER_WALL',
        label: 'Storm Shelter Hydrogenated Water-Wall Posture',
        category: 'RADIATION_SHELTER',
        delta_rho_per_hour: 0.28,
      },
      {
        action_id: 'EVA_AIRLOCK_HARD_LOCKOUT',
        label: 'Lockout EVA Airlock Egress (Deontic Gate)',
        category: 'DEONTIC_HABITAT_LOCK',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  6: {
    playbook_id: 'PLAYBOOK_06_HYPOXEMIA_DESATURATION',
    title: 'Playbook #06: Acute Hypoxemia / SpO2 Desaturation Response',
    total_steps: 3,
    step_instruction:
      'Verify pulse oximeter probe seating, assess cabin O2/ppCO2, and initiate supplemental O2 titration if confirmed',
    causal_chain_summary: [
      'SpO2_drop_below_baseline -> alveolar_hypoventilation_or_hypoxia',
      'Multichannel_check -> rule_out_motion_or_probe_detach',
    ],
    actions: [
      {
        action_id: 'VERIFY_OXIMETER_AND_CABIN_PPO2',
        label: 'Verify Pulse Oximeter Perfusion & Cabin ppO2',
        category: 'HYPOXEMIA_TRIAGE',
        delta_rho_per_hour: 0.18,
      },
      {
        action_id: 'SUPPLEMENTAL_O2_TITRATION',
        label: 'Initiate Supplemental O2 Titration (Target >= 94%)',
        category: 'OXYGEN_THERAPY',
        delta_rho_per_hour: 0.24,
      },
    ],
  },
  7: {
    playbook_id: 'PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS',
    title: 'Playbook #07: Sustained Tachycardia & Autonomic Stress Evaluation',
    total_steps: 3,
    step_instruction:
      'Evaluate sustained HR elevation above personal baseline; correlate orthostatic load, hydration, and fever/pain',
    causal_chain_summary: [
      'Sustained_HR_z_score -> sympathetic_or_hemodynamic_stress',
      'Baroreflex_demand -> intravascular_volume_or_workload_check',
    ],
    actions: [
      {
        action_id: 'ASSESS_REST_HYDRATION_ORTHOSTATIC',
        label: 'Pause Exertion & Assess Hydration / Orthostatic Stress',
        category: 'AUTONOMIC_STABILIZATION',
        delta_rho_per_hour: 0.16,
      },
      {
        action_id: 'CAPTURE_12LEAD_AND_BP_CHECK',
        label: 'Acquire Resting Rhythm Strip & Cuff Blood Pressure',
        category: 'CARDIAC_DIAGNOSTICS',
        delta_rho_per_hour: 0.14,
      },
    ],
  },
  8: {
    playbook_id: 'PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK',
    title: 'Playbook #08: Sensor Detachment & Signal Quality Recovery',
    total_steps: 2,
    step_instruction:
      'Abstain automated alarms on degraded signal; inspect ECG electrodes and SpO2 optical clip before clinical escalation',
    causal_chain_summary: [
      'Sensor_dropout_or_low_SQI -> unreliable_physiological_estimate',
      'Epistemic_guard -> reseat_transducers_before_treatment',
    ],
    actions: [
      {
        action_id: 'RESEAT_SPO2_AND_ECG_LEADS',
        label: 'Reseat SpO2 Finger Clip & Clean/Replace ECG Electrodes',
        category: 'SENSOR_MAINTENANCE',
        delta_rho_per_hour: 0.12,
      },
    ],
  },
  9: {
    playbook_id: 'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION',
    title: 'Playbook #09: Multiparameter Acute Cardiorespiratory Deterioration',
    total_steps: 3,
    step_instruction:
      'Concurrent HR/SpO2 Mahalanobis excursion detected: perform immediate crew medical assessment and ground surgeon consult',
    causal_chain_summary: [
      'Joint_HR_SpO2_Mahalanobis_D2 -> acute_cardiorespiratory_decompensation',
      'Combined_autonomic_hypoxic_load -> urgent_multimodal_intervention',
    ],
    actions: [
      {
        action_id: 'AIRWAY_BREATHING_CIRCULATION_CHECK',
        label: 'Execute Immediate ABC Assessment & Supplemental O2',
        category: 'CRITICAL_RESPONSE',
        delta_rho_per_hour: 0.30,
      },
      {
        action_id: 'FLIGHT_SURGEON_TELEMEDICINE_CALL',
        label: 'Establish Priority Ground Flight Surgeon Consultation',
        category: 'TELEMEDICINE_ESCALATION',
        delta_rho_per_hour: 0.20,
      },
    ],
  },
};

export const ALERT_LEVEL_BY_CODE: Record<number, AlarmLevel> = {
  0: 'NOMINAL',
  1: 'DATA_DEGRADED_MISSING_CHANNELS',
  2: 'ADVISORY',
  3: 'WARNING',
  4: 'CRITICAL',
};

export interface DecodedBinaryTelemetryFrame {
  magic: number;
  schema_version: number;
  partition_status: number;
  deontic_habitat_mask: number;
  seq: number;
  timestamp_ms: number;
  validity_mask: number;
  quality_flags_mask: number;
  hr_bpm: number | null;
  pulse_bpm: number | null;
  resp_brpm: number | null;
  spo2_pct: number | null;
  rmssd_ms: number | null;
  mri_score: number | null;
  crs_score: number | null;
  sans_risk: number | null;
  ijv_shear_pa: number | null;
  sost_pg_ml: number | null;
  radiation_msv_d: number | null;
  nqs_min_rho: number | null;
  ttv_q05_days: number | null;
  ttv_q50_days: number | null;
  ttv_q95_days: number | null;
  owlt_delay_sec: number | null;
  active_playbook_id: number;
  active_alert_code: number;
  ipc_latency_ns: number;
  crc32c: number;
  // Derived convenience flags for OS Chrome & clinical invariants
  hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE' | null;
  illustrative_unvalidated: boolean;
  habitat_zone_code: number;
  habitat_zone: HabitatZoneCodeName;
  violates_policy: boolean;
  eva_airlock_forbidden: boolean;
  storm_shelter_mandatory: boolean;
  eimo_autonomous_active: boolean;
  partitions_healthy_count: number;
}

export interface EncodeTestBinaryFrameInput {
  schema_version: number;
  partition_status: number;
  deontic_habitat_mask: number;
  seq: number;
  timestamp_ms: number;
  quality_flags_mask: number;
  hr_bpm: number | null;
  pulse_bpm: number | null;
  resp_brpm: number | null;
  spo2_pct: number | null;
  rmssd_ms: number | null;
  mri_score: number | null;
  crs_score: number | null;
  sans_risk: number | null;
  ijv_shear_pa: number | null;
  sost_pg_ml: number | null;
  radiation_msv_d: number | null;
  nqs_min_rho: number | null;
  ttv_q05_days: number | null;
  ttv_q50_days: number | null;
  ttv_q95_days: number | null;
  owlt_delay_sec: number | null;
  active_playbook_id: number;
  active_alert_code: number;
  ipc_latency_ns: number;
}

// Precomputed Castagnoli CRC-32C lookup table (reflected polynomial 0x82F63B78).
const CRC32C_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 1) !== 0 ? 0x82f63b78 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/** Computes Castagnoli CRC-32C (init 0xFFFFFFFF, xorout 0xFFFFFFFF) over `bytes[0..length]`. */
export function computeCrc32c(bytes: Uint8Array, length: number = ARES_BINARY_CRC_OFFSET): number {
  let crc = 0xffffffff;
  const limit = Math.min(length, bytes.byteLength);
  for (let i = 0; i < limit; i += 1) {
    crc = CRC32C_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readU64LittleEndian(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 4294967296 + lo;
}

function writeU64LittleEndian(view: DataView, offset: number, value: number): void {
  const safe = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  const lo = safe >>> 0;
  const hi = Math.floor(safe / 4294967296) >>> 0;
  view.setUint32(offset, lo, true);
  view.setUint32(offset + 4, hi, true);
}

function readMaskedFloat32(
  view: DataView,
  byteOffset: number,
  validityMask: number,
  bit: number,
): number | null {
  if ((validityMask & bit) === 0) return null;
  const val = view.getFloat32(byteOffset, true);
  return Number.isFinite(val) ? val : null;
}

function writeMaskedFloat32(
  view: DataView,
  byteOffset: number,
  value: number | null,
  bit: number,
  validityMask: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    view.setFloat32(byteOffset, value, true);
    return validityMask | bit;
  }
  view.setFloat32(byteOffset, Number.NaN, true);
  return validityMask & ~bit;
}

function countHealthyPartitions(partitionStatus: number): number {
  let count = 0;
  if ((partitionStatus & PARTITION_TELEMETRY_INGEST) !== 0) count += 1;
  if ((partitionStatus & PARTITION_CAUSAL_ODE_STL) !== 0) count += 1;
  if ((partitionStatus & PARTITION_TIMESTRAL_FORECASTER) !== 0) count += 1;
  if ((partitionStatus & PARTITION_MEDOPS_UI_SHELL) !== 0) count += 1;
  return count;
}

/**
 * Zero-copy DataView decoder for the 128-byte little-endian `BinaryTelemetryFrame`.
 * Returns `null` if size, magic (`0x41524553`), schema version, or CRC-32C check fails.
 * Preserves strict nullability (`null` when `validity_mask` bit is 0 or `BEAT_INTERVALS_NOT_AVAILABLE`).
 */
export function decodeBinaryTelemetryFrame(
  input: ArrayBuffer | Uint8Array,
): DecodedBinaryTelemetryFrame | null {
  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input);

  if (bytes.byteLength !== ARES_BINARY_FRAME_BYTES) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== ARES_BINARY_MAGIC) {
    return null;
  }

  const schema_version = view.getUint16(4, true);
  if (schema_version !== ARES_BINARY_SCHEMA_VERSION) {
    return null;
  }

  const expectedCrc = computeCrc32c(bytes, ARES_BINARY_CRC_OFFSET);
  const crc32c = view.getUint32(ARES_BINARY_CRC_OFFSET, true);
  if (crc32c !== expectedCrc) {
    return null;
  }

  const partition_status = view.getUint8(6);
  const deontic_habitat_mask = view.getUint8(7);
  const seq = readU64LittleEndian(view, 8);
  const timestamp_ms = readU64LittleEndian(view, 16);
  const validity_mask = view.getUint32(24, true);
  const quality_flags_mask = view.getUint32(28, true);

  const beatIntervalsUnavailable =
    (quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) !== 0;

  const hr_bpm = readMaskedFloat32(view, 32, validity_mask, MASK_HR_BPM);
  const pulse_bpm = readMaskedFloat32(view, 36, validity_mask, MASK_PULSE_BPM);
  const resp_brpm = readMaskedFloat32(view, 40, validity_mask, MASK_RESP_BRPM);
  const spo2_pct = readMaskedFloat32(view, 44, validity_mask, MASK_SPO2_PCT);
  const rawRmssd = readMaskedFloat32(view, 48, validity_mask, MASK_RMSSD_MS);
  // Enforce Issue #11 invariant: RMSSD is never valid when beat intervals are unavailable.
  const rmssd_ms = beatIntervalsUnavailable ? null : rawRmssd;
  const mri_score = readMaskedFloat32(view, 52, validity_mask, MASK_MRI_SCORE);
  const crs_score = readMaskedFloat32(view, 56, validity_mask, MASK_CRS_SCORE);
  const sans_risk = readMaskedFloat32(view, 60, validity_mask, MASK_SANS_RISK);
  const ijv_shear_pa = readMaskedFloat32(view, 64, validity_mask, MASK_IJV_SHEAR_PA);
  const sost_pg_ml = readMaskedFloat32(view, 68, validity_mask, MASK_SOST_PG_ML);
  const radiation_msv_d = readMaskedFloat32(view, 72, validity_mask, MASK_RADIATION_MSV_D);
  const nqs_min_rho = readMaskedFloat32(view, 76, validity_mask, MASK_NQS_MIN_RHO);
  const ttv_q05_days = readMaskedFloat32(view, 80, validity_mask, MASK_TTV_Q05_DAYS);
  const ttv_q50_days = readMaskedFloat32(view, 84, validity_mask, MASK_TTV_Q50_DAYS);
  const ttv_q95_days = readMaskedFloat32(view, 88, validity_mask, MASK_TTV_Q95_DAYS);
  const owlt_delay_sec = readMaskedFloat32(view, 92, validity_mask, MASK_OWLT_DELAY_SEC);

  const active_playbook_id = view.getUint16(96, true);
  const active_alert_code = view.getUint16(98, true);
  const ipc_latency_ns = view.getUint32(100, true);

  const habitat_zone_code = deontic_habitat_mask & DEONTIC_ZONE_CODE_MASK;
  const habitat_zone =
    HABITAT_ZONE_NAMES[habitat_zone_code] ?? 'MEDOPS_ULTRASOUND_BAY';

  return {
    magic,
    schema_version,
    partition_status,
    deontic_habitat_mask,
    seq,
    timestamp_ms,
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
    active_playbook_id,
    active_alert_code,
    ipc_latency_ns,
    crc32c,
    hrv_unavailable_reason: beatIntervalsUnavailable
      ? 'BEAT_INTERVALS_NOT_AVAILABLE'
      : null,
    illustrative_unvalidated:
      (quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED) !== 0,
    habitat_zone_code,
    habitat_zone,
    violates_policy: (deontic_habitat_mask & DEONTIC_VIOLATES_POLICY) !== 0,
    eva_airlock_forbidden: (deontic_habitat_mask & DEONTIC_EVA_FORBIDDEN) !== 0,
    storm_shelter_mandatory: (deontic_habitat_mask & DEONTIC_SHELTER_MANDATORY) !== 0,
    eimo_autonomous_active:
      (deontic_habitat_mask & DEONTIC_EIMO_AUTONOMOUS_ACTIVE) !== 0,
    partitions_healthy_count: countHealthyPartitions(partition_status),
  };
}

/**
 * Deterministic 128-byte little-endian encoder helper for self-tests and parity checks.
 */
export function encodeTestBinaryTelemetryFrame(
  overrides: Partial<EncodeTestBinaryFrameInput> = {},
): ArrayBuffer {
  const defaults: EncodeTestBinaryFrameInput = {
    schema_version: ARES_BINARY_SCHEMA_VERSION,
    partition_status: PARTITION_ALL_HEALTHY_MASK,
    deontic_habitat_mask: 3 | DEONTIC_EIMO_AUTONOMOUS_ACTIVE,
    seq: 1,
    timestamp_ms: 1794657600000,
    quality_flags_mask:
      FLAG_BEAT_INTERVALS_NOT_AVAILABLE | FLAG_ILLUSTRATIVE_UNVALIDATED,
    hr_bpm: 78,
    pulse_bpm: 77,
    resp_brpm: 16,
    spo2_pct: 98,
    rmssd_ms: null,
    mri_score: null,
    crs_score: 0.25,
    sans_risk: 0.18,
    ijv_shear_pa: 0.62,
    sost_pg_ml: 34.5,
    radiation_msv_d: 0.45,
    nqs_min_rho: null,
    ttv_q05_days: null,
    ttv_q50_days: null,
    ttv_q95_days: null,
    owlt_delay_sec: 852,
    active_playbook_id: 3,
    active_alert_code: 1,
    ipc_latency_ns: 24000,
  };

  const cfg: EncodeTestBinaryFrameInput = { ...defaults, ...overrides };
  const buffer = new ArrayBuffer(ARES_BINARY_FRAME_BYTES);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint32(0, ARES_BINARY_MAGIC, true);
  view.setUint16(4, cfg.schema_version, true);
  view.setUint8(6, cfg.partition_status & 0xff);
  view.setUint8(7, cfg.deontic_habitat_mask & 0xff);
  writeU64LittleEndian(view, 8, cfg.seq);
  writeU64LittleEndian(view, 16, cfg.timestamp_ms);

  let validityMask = 0;
  validityMask = writeMaskedFloat32(view, 32, cfg.hr_bpm, MASK_HR_BPM, validityMask);
  validityMask = writeMaskedFloat32(view, 36, cfg.pulse_bpm, MASK_PULSE_BPM, validityMask);
  validityMask = writeMaskedFloat32(view, 40, cfg.resp_brpm, MASK_RESP_BRPM, validityMask);
  validityMask = writeMaskedFloat32(view, 44, cfg.spo2_pct, MASK_SPO2_PCT, validityMask);

  const effectiveRmssd =
    (cfg.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) !== 0
      ? null
      : cfg.rmssd_ms;
  validityMask = writeMaskedFloat32(view, 48, effectiveRmssd, MASK_RMSSD_MS, validityMask);
  validityMask = writeMaskedFloat32(view, 52, cfg.mri_score, MASK_MRI_SCORE, validityMask);
  validityMask = writeMaskedFloat32(view, 56, cfg.crs_score, MASK_CRS_SCORE, validityMask);
  validityMask = writeMaskedFloat32(view, 60, cfg.sans_risk, MASK_SANS_RISK, validityMask);
  validityMask = writeMaskedFloat32(view, 64, cfg.ijv_shear_pa, MASK_IJV_SHEAR_PA, validityMask);
  validityMask = writeMaskedFloat32(view, 68, cfg.sost_pg_ml, MASK_SOST_PG_ML, validityMask);
  validityMask = writeMaskedFloat32(view, 72, cfg.radiation_msv_d, MASK_RADIATION_MSV_D, validityMask);
  validityMask = writeMaskedFloat32(view, 76, cfg.nqs_min_rho, MASK_NQS_MIN_RHO, validityMask);
  validityMask = writeMaskedFloat32(view, 80, cfg.ttv_q05_days, MASK_TTV_Q05_DAYS, validityMask);
  validityMask = writeMaskedFloat32(view, 84, cfg.ttv_q50_days, MASK_TTV_Q50_DAYS, validityMask);
  validityMask = writeMaskedFloat32(view, 88, cfg.ttv_q95_days, MASK_TTV_Q95_DAYS, validityMask);
  validityMask = writeMaskedFloat32(view, 92, cfg.owlt_delay_sec, MASK_OWLT_DELAY_SEC, validityMask);

  view.setUint32(24, validityMask >>> 0, true);
  view.setUint32(28, cfg.quality_flags_mask >>> 0, true);

  view.setUint16(96, cfg.active_playbook_id, true);
  view.setUint16(98, cfg.active_alert_code, true);
  view.setUint32(100, cfg.ipc_latency_ns >>> 0, true);

  const crc = computeCrc32c(bytes, ARES_BINARY_CRC_OFFSET);
  view.setUint32(ARES_BINARY_CRC_OFFSET, crc, true);

  return buffer;
}

/**
 * Merges a decoded 128-byte `BinaryTelemetryFrame` into an existing `TelemetryPacket`
 * without converting missing channels (`null`) to `0`.
 */
export function mergeBinaryFrameIntoPacket(
  prev: TelemetryPacket,
  frame: DecodedBinaryTelemetryFrame,
): TelemetryPacket {
  const missing: string[] = [];
  if (frame.hr_bpm === null) missing.push('heart_rate_bpm');
  if (frame.pulse_bpm === null) missing.push('pulse_rate_bpm');
  if (frame.resp_brpm === null) missing.push('respiration_rate_brpm');
  if (frame.spo2_pct === null) missing.push('spo2_percent');
  if (frame.rmssd_ms === null) missing.push('hrv_rmssd_ms');

  const flags: string[] = [];
  if (frame.hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE') {
    flags.push('BEAT_INTERVALS_NOT_AVAILABLE');
  }
  if (
    (frame.quality_flags_mask & FLAG_CHANNEL_NAN_DROPOUT) !== 0 ||
    frame.pulse_bpm === null ||
    frame.spo2_pct === null
  ) {
    flags.push('CHANNEL_NAN_DROPOUT');
  }
  if (frame.illustrative_unvalidated) {
    flags.push('ILLUSTRATIVE_UNVALIDATED');
  }
  if ((frame.quality_flags_mask & FLAG_CONFORMAL_ABSTAINED) !== 0) {
    flags.push('CONFORMAL_ABSTAINED');
  }

  const alarmLevel =
    ALERT_LEVEL_BY_CODE[frame.active_alert_code] ?? prev.safety_margins.alarm_level;

  const nextHemodynamics =
    prev.hemodynamics !== null && prev.hemodynamics !== undefined
      ? {
          ...prev.hemodynamics,
          wall_shear_stress_dyn_cm2:
            frame.ijv_shear_pa !== null
              ? frame.ijv_shear_pa * 10
              : prev.hemodynamics.wall_shear_stress_dyn_cm2,
          sans_risk_index:
            frame.sans_risk !== null
              ? frame.sans_risk
              : prev.hemodynamics.sans_risk_index,
          pocus_thrombus_confirmed:
            (frame.quality_flags_mask & FLAG_POCUS_CONFIRMED) !== 0,
          lbnp_active: (frame.quality_flags_mask & FLAG_LBNP_ACTIVE) !== 0,
        }
      : prev.hemodynamics;

  const nextMusculoskeletal =
    prev.musculoskeletal !== null && prev.musculoskeletal !== undefined
      ? {
          ...prev.musculoskeletal,
          // 1 pmol/L ~= 22.5 pg/mL (22.5 kDa sclerostin)
          sclerostin_pmol_l:
            frame.sost_pg_ml !== null
              ? frame.sost_pg_ml / 22.5
              : prev.musculoskeletal.sclerostin_pmol_l,
        }
      : prev.musculoskeletal;

  const safetyGates = {
    anticoagulant_lock_active:
      (frame.quality_flags_mask & FLAG_GATE1_ANTICOAG_LOCK) !== 0,
    lbnp_auto_vent_armed:
      (frame.quality_flags_mask & FLAG_GATE2_LBNP_VENT) !== 0,
    eva_suit_damping_active:
      (frame.quality_flags_mask & FLAG_GATE3_EVA_DAMPING) !== 0,
    gate4_invasive_decompression_locked:
      (frame.quality_flags_mask & FLAG_GATE4A_DECOMPRESSION_LOCK) !== 0,
    gate4_eva_fitness_no_go:
      (frame.quality_flags_mask & FLAG_GATE4B_EVA_NO_GO) !== 0,
  };

  const binaryDefault = BINARY_PLAYBOOK_DEFAULTS[frame.active_playbook_id];
  let nextPlaybook: ActivePlaybook | null = prev.active_playbook ?? null;
  if (binaryDefault) {
    const samePlaybook = prev.active_playbook?.playbook_id === binaryDefault.playbook_id;
    nextPlaybook = {
      playbook_id: binaryDefault.playbook_id,
      title: (samePlaybook ? prev.active_playbook?.title : undefined) ?? binaryDefault.title,
      current_step: samePlaybook ? (prev.active_playbook?.current_step ?? 1) : 1,
      total_steps:
        (samePlaybook ? prev.active_playbook?.total_steps : undefined) ?? binaryDefault.total_steps,
      step_instruction:
        (samePlaybook ? prev.active_playbook?.step_instruction : undefined) ??
        binaryDefault.step_instruction,
      causal_chain_summary:
        (samePlaybook &&
        prev.active_playbook?.causal_chain_summary &&
        prev.active_playbook.causal_chain_summary.length > 0
          ? prev.active_playbook.causal_chain_summary
          : undefined) ?? binaryDefault.causal_chain_summary,
      actions:
        (samePlaybook &&
        prev.active_playbook?.actions &&
        prev.active_playbook.actions.length > 0
          ? prev.active_playbook.actions
          : undefined) ?? binaryDefault.actions,
      safety_gates: safetyGates,
    };
  } else if (prev.active_playbook !== null && prev.active_playbook !== undefined) {
    nextPlaybook = {
      ...prev.active_playbook,
      playbook_id:
        PLAYBOOK_ID_BY_CODE[frame.active_playbook_id] ??
        prev.active_playbook.playbook_id,
      safety_gates: safetyGates,
    };
  }

  const modelValidationStatus: ModelValidationStatus =
    (frame.quality_flags_mask & FLAG_TERRESTRIAL_BENCHMARKED_ONLY) !== 0
      ? 'INTERNALLY_BENCHMARKED_TERRESTRIAL'
      : frame.illustrative_unvalidated
        ? 'ILLUSTRATIVE_UNVALIDATED'
        : prev.model_validation_status ?? 'ILLUSTRATIVE_UNVALIDATED';

  const prevConformal = prev.timestral_quantiles?.conformal_status;
  const conformalStatus: ConformalGateStatus | undefined =
    (frame.quality_flags_mask & FLAG_CONFORMAL_ABSTAINED) !== 0
      ? 'ABSTAINED_FALLBACK_DETERMINISTIC'
      : prevConformal === 'ABSTAINED_FALLBACK_DETERMINISTIC' ||
          prevConformal === 'ABSTAINED_FALLBACK' ||
          prevConformal === 'AbstainedFallbackDeterministic'
        ? 'ABSTAINED_FALLBACK_DETERMINISTIC'
        : prevConformal === 'HEURISTIC_GATE_ACCEPTED' ||
            prevConformal === 'HeuristicGateAccepted' ||
            prevConformal === 'CALIBRATED_QUANTILE_CONE' ||
            frame.ttv_q50_days !== null
          ? 'HEURISTIC_GATE_ACCEPTED'
          : undefined;

  const hasTtvRange =
    frame.ttv_q05_days !== null ||
    frame.ttv_q50_days !== null ||
    frame.ttv_q95_days !== null;

  return {
    ...prev,
    timestamp_ms: frame.timestamp_ms,
    model_validation_status: modelValidationStatus,
    biometrics: {
      ...prev.biometrics,
      heart_rate_bpm: frame.hr_bpm,
      pulse_rate_bpm: frame.pulse_bpm,
      respiration_rate_brpm: frame.resp_brpm,
      spo2_percent: frame.spo2_pct,
      hrv_rmssd_ms: frame.rmssd_ms,
      hrv_unavailable_reason: frame.hrv_unavailable_reason,
      radiation_dose_rate_msv_d:
        frame.radiation_msv_d ?? prev.biometrics.radiation_dose_rate_msv_d,
      missing_channels: missing,
      quality_flags: flags,
    },
    hemodynamics: nextHemodynamics,
    musculoskeletal: nextMusculoskeletal,
    safety_margins: {
      ...prev.safety_margins,
      med_stl_rho_robustness: frame.nqs_min_rho,
      mission_readiness_index: frame.mri_score,
      time_to_violation_days: frame.ttv_q50_days,
      ttv_most_likely_days: frame.ttv_q50_days,
      ttv_p5_days: frame.ttv_q05_days,
      ttv_p95_days: frame.ttv_q95_days,
      ttv_interval_kind: hasTtvRange
        ? (prev.safety_margins.ttv_interval_kind ?? 'ILLUSTRATIVE_SCENARIO_RANGE')
        : prev.safety_margins.ttv_interval_kind,
      alarm_level: alarmLevel,
    },
    active_playbook: nextPlaybook,
    hypergraph_spatial: {
      ...(prev.hypergraph_spatial ?? {}),
      habitat_zone: frame.habitat_zone,
    },
    timestral_quantiles: {
      ...(prev.timestral_quantiles ?? {}),
      model_validation_status: modelValidationStatus,
      confidence_state: conformalStatus,
      conformal_status: conformalStatus,
      ttv_q05_days: frame.ttv_q05_days,
      ttv_q50_days: frame.ttv_q50_days,
      ttv_q95_days: frame.ttv_q95_days,
    },
    quality_flags: flags,
  };
}

/** Deterministic self-test verifying 128-byte layout, nullability, and CRC-32C rejection. */
export function runBinaryTelemetrySelfTest(): { passed: boolean; details: string[] } {
  const details: string[] = [];

  const buf = encodeTestBinaryTelemetryFrame({
    pulse_bpm: null,
    spo2_pct: null,
    rmssd_ms: 42.5, // must be nulled by FLAG_BEAT_INTERVALS_NOT_AVAILABLE
    quality_flags_mask:
      FLAG_BEAT_INTERVALS_NOT_AVAILABLE |
      FLAG_ILLUSTRATIVE_UNVALIDATED |
      FLAG_CHANNEL_NAN_DROPOUT,
  });

  if (buf.byteLength !== ARES_BINARY_FRAME_BYTES) {
    details.push(`Expected 128 bytes, got ${buf.byteLength}`);
    return { passed: false, details };
  }

  const decoded = decodeBinaryTelemetryFrame(buf);
  if (!decoded) {
    details.push('Failed to decode valid 128-byte BinaryTelemetryFrame');
    return { passed: false, details };
  }
  if (decoded.pulse_bpm !== null || decoded.spo2_pct !== null) {
    details.push('Missing BIDMC channels were coerced instead of staying null');
    return { passed: false, details };
  }
  if (
    decoded.rmssd_ms !== null ||
    decoded.hrv_unavailable_reason !== 'BEAT_INTERVALS_NOT_AVAILABLE'
  ) {
    details.push('Issue #11 BEAT_INTERVALS_NOT_AVAILABLE invariant violated');
    return { passed: false, details };
  }

  // Flip 1 bit in payload and verify CRC-32C rejects corrupted frame
  const corrupted = new Uint8Array(buf.slice(0));
  corrupted[32] ^= 0x01;
  if (decodeBinaryTelemetryFrame(corrupted) !== null) {
    details.push('CRC-32C failed to reject single-bit corruption');
    return { passed: false, details };
  }

  details.push('128B ABI roundtrip OK');
  details.push('validity_mask null preservation OK');
  details.push('BEAT_INTERVALS_NOT_AVAILABLE invariant OK');
  details.push('Castagnoli CRC-32C SEU rejection OK');
  return { passed: true, details };
}
