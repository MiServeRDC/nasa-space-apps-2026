import type { AlarmLevel, BiometricsSource, TelemetryPacket } from '../types/telemetry';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const asNullOrNum = (v: unknown): number | null => (isNum(v) ? v : null);
const isStr = (v: unknown): v is string => typeof v === 'string';

const BIOMETRICS_SOURCES = new Set<BiometricsSource>([
  'RECORDED_TERRESTRIAL_BIDMC_CSV',
  'RECORDED_TERRESTRIAL_WAVEFORM',
  'SIMULATED_SCENARIO_INPUT',
]);

const ALARM_LEVELS = new Set<AlarmLevel>([
  'NOMINAL',
  'ADVISORY',
  'WARNING',
  'CRITICAL',
  'DATA_DEGRADED_MISSING_CHANNELS',
]);

/**
 * Normalizes and validates an incoming packet from /api/snapshot or /ws/telemetry.
 * Supports both contracts/telemetry_schema.json and the live Rust server DTO (timestamp_utc, nqs_stl, etc.).
 * Returns null if the payload is invalid so the caller keeps the last valid state.
 */
export function parseTelemetryPacket(raw: unknown): TelemetryPacket | null {
  if (!isObj(raw)) return null;
  if (!isStr(raw.source_record_id) || !isStr(raw.astronaut_id)) return null;
  if (!isNum(raw.relative_recording_time_s)) return null;

  const pm = raw.provenance_manifest;
  if (!isObj(pm) || !isStr(pm.biometrics_source) || !BIOMETRICS_SOURCES.has(pm.biometrics_source as BiometricsSource)) {
    return null;
  }
  if (!isNum(pm.biometrics_native_rate_hz) || !isNum(pm.ui_refresh_rate_hz)) return null;

  const bio = raw.biometrics;
  if (!isObj(bio)) return null;

  const timestampMs = isNum(raw.timestamp_ms)
    ? raw.timestamp_ms
    : isStr(raw.timestamp_utc)
      ? Date.parse(raw.timestamp_utc) || Date.now()
      : null;
  if (timestampMs === null) return null;

  const overlayRaw = pm.scenario_overlay_mode;
  const scenarioOverlayMode: 'NONE_PURE_REPLAY' | 'SIMULATED_WHATIF_SCENARIO' =
    overlayRaw === 'NONE_PURE_REPLAY' ? 'NONE_PURE_REPLAY' : 'SIMULATED_WHATIF_SCENARIO';

  // Map either schema-style `safety_margins` or live Rust `nqs_stl` + `alert_severity`.
  let safetyMargins: TelemetryPacket['safety_margins'] | null = null;
  if (isObj(raw.safety_margins)) {
    const sm = raw.safety_margins;
    if (!isStr(sm.alarm_level) || !ALARM_LEVELS.has(sm.alarm_level as AlarmLevel)) return null;
    safetyMargins = {
      provenance: sm.provenance === 'DERIVED_FROM_RECORDED_BIDMC' ? 'DERIVED_FROM_RECORDED_BIDMC' : 'DERIVED_FROM_HYBRID_SCENARIO',
      med_stl_rho_robustness: asNullOrNum(sm.med_stl_rho_robustness),
      time_to_violation_days: asNullOrNum(sm.time_to_violation_days),
      mission_readiness_index: asNullOrNum(sm.mission_readiness_index),
      alarm_level: sm.alarm_level as AlarmLevel,
    };
  } else if (isObj(raw.nqs_stl)) {
    const nqs = raw.nqs_stl;
    const sev = isStr(raw.alert_severity) && ALARM_LEVELS.has(raw.alert_severity as AlarmLevel)
      ? (raw.alert_severity as AlarmLevel)
      : 'NOMINAL';
    const ttvHours = asNullOrNum(nqs.ttv_hours);
    safetyMargins = {
      provenance: scenarioOverlayMode === 'NONE_PURE_REPLAY' ? 'DERIVED_FROM_RECORDED_BIDMC' : 'DERIVED_FROM_HYBRID_SCENARIO',
      med_stl_rho_robustness: asNullOrNum(nqs.rho_global),
      time_to_violation_days: ttvHours !== null ? ttvHours / 24 : null,
      mission_readiness_index: asNullOrNum(nqs.mri_pct),
      alarm_level: sev,
    };
  }
  if (!safetyMargins) return null;

  // Map either `hemodynamics` or live Rust `jugular_hemodynamics`.
  let hemodynamics: TelemetryPacket['hemodynamics'] = null;
  if (isObj(raw.hemodynamics)) {
    const h = raw.hemodynamics;
    hemodynamics = {
      provenance: 'DERIVED_COMPUTED',
      ijv_csa_cm2: asNullOrNum(h.ijv_csa_cm2),
      ijv_velocity_max_cm_s: asNullOrNum(h.ijv_velocity_max_cm_s),
      wall_shear_stress_dyn_cm2: asNullOrNum(h.wall_shear_stress_dyn_cm2),
      pocus_thrombus_confirmed: typeof h.pocus_thrombus_confirmed === 'boolean' ? h.pocus_thrombus_confirmed : null,
      thrombosis_risk_score: asNullOrNum(h.thrombosis_risk_score),
    };
  } else if (isObj(raw.jugular_hemodynamics)) {
    const jh = raw.jugular_hemodynamics;
    const csaMm2 = asNullOrNum(jh.ijv_csa_mm2);
    hemodynamics = {
      provenance: 'DERIVED_COMPUTED',
      ijv_csa_cm2: csaMm2 !== null ? csaMm2 / 100 : null,
      ijv_velocity_max_cm_s: asNullOrNum(jh.ijv_vmax_cm_s),
      wall_shear_stress_dyn_cm2: asNullOrNum(jh.tau_w_dyn_cm2),
      pocus_thrombus_confirmed: typeof jh.pocus_thrombus_confirmed === 'boolean' ? jh.pocus_thrombus_confirmed : null,
      thrombosis_risk_score: null,
    };
  }

  return {
    timestamp_ms: timestampMs,
    relative_recording_time_s: raw.relative_recording_time_s,
    source_record_id: raw.source_record_id,
    mission_elapsed_days: asNullOrNum(raw.mission_elapsed_days ?? raw.flight_day),
    astronaut_id: raw.astronaut_id,
    provenance_manifest: {
      biometrics_source: pm.biometrics_source as BiometricsSource,
      biometrics_native_rate_hz: pm.biometrics_native_rate_hz,
      ui_refresh_rate_hz: pm.ui_refresh_rate_hz,
      scenario_overlay_mode: scenarioOverlayMode,
    },
    biometrics: {
      heart_rate_bpm: asNullOrNum(bio.heart_rate_bpm),
      pulse_rate_bpm: asNullOrNum(bio.pulse_rate_bpm),
      respiration_rate_brpm: asNullOrNum(bio.respiration_rate_brpm ?? bio.resp_rate_brpm),
      spo2_percent: asNullOrNum(bio.spo2_percent ?? bio.spo2_pct),
      rr_interval_ms: asNullOrNum(bio.rr_interval_ms),
      hrv_rmssd_ms: asNullOrNum(bio.hrv_rmssd_ms ?? bio.rmssd_ms),
      core_temp_celsius: asNullOrNum(bio.core_temp_celsius),
      missing_channels: Array.isArray(bio.missing_channels) ? bio.missing_channels.filter(isStr) : [],
    },
    hemodynamics,
    musculoskeletal: isObj(raw.musculoskeletal)
      ? {
          provenance: 'DERIVED_COMPUTED',
          soleus_thickness_mm: asNullOrNum(raw.musculoskeletal.soleus_thickness_mm),
          pennation_angle_deg: asNullOrNum(raw.musculoskeletal.pennation_angle_deg),
          bone_resorption_rate_pct: asNullOrNum(raw.musculoskeletal.bone_resorption_rate_pct),
          mechanotransductive_index: asNullOrNum(raw.musculoskeletal.mechanotransductive_index ?? raw.musculoskeletal.mqi_index),
        }
      : null,
    environment: isObj(raw.environment)
      ? {
          provenance: 'SIMULATED_SCENARIO_INPUT',
          cabin_co2_ppm: asNullOrNum(raw.environment.cabin_co2_ppm),
          cabin_o2_kpa: asNullOrNum(raw.environment.cabin_o2_kpa),
          ambient_radiation_rate_ugy_h: asNullOrNum(raw.environment.ambient_radiation_rate_ugy_h),
          cumulative_radiation_mgy: asNullOrNum(raw.environment.cumulative_radiation_mgy),
        }
      : null,
    safety_margins: safetyMargins,
    active_playbook: null,
  };
}
