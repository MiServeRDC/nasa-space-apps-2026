import type { TelemetryPacket } from '../types/telemetry';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNullOrNum = (v: unknown): boolean => v === null || isNum(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const BIOMETRICS_SOURCES = new Set([
  'RECORDED_TERRESTRIAL_BIDMC_CSV',
  'RECORDED_TERRESTRIAL_WAVEFORM',
  'SIMULATED_SCENARIO_INPUT',
]);

const ALARM_LEVELS = new Set([
  'NOMINAL',
  'ADVISORY',
  'WARNING',
  'CRITICAL',
  'DATA_DEGRADED_MISSING_CHANNELS',
]);

/** Runtime validator matching contracts/telemetry_schema.json. Invalid packets are rejected before touching UI state. */
export function isValidTelemetryPacket(raw: unknown): raw is TelemetryPacket {
  if (!isObj(raw)) return false;
  if (!isNum(raw.timestamp_ms) || !isNum(raw.relative_recording_time_s)) return false;
  if (!isStr(raw.source_record_id) || !isStr(raw.astronaut_id)) return false;

  const pm = raw.provenance_manifest;
  if (!isObj(pm)) return false;
  if (!isStr(pm.biometrics_source) || !BIOMETRICS_SOURCES.has(pm.biometrics_source)) return false;
  if (!isNum(pm.biometrics_native_rate_hz) || !isNum(pm.ui_refresh_rate_hz)) return false;
  if (pm.scenario_overlay_mode !== 'NONE_PURE_REPLAY' && pm.scenario_overlay_mode !== 'SIMULATED_WHATIF_SCENARIO') {
    return false;
  }

  const bio = raw.biometrics;
  if (!isObj(bio)) return false;
  if (
    !isNullOrNum(bio.heart_rate_bpm) ||
    !isNullOrNum(bio.pulse_rate_bpm) ||
    !isNullOrNum(bio.respiration_rate_brpm) ||
    !isNullOrNum(bio.spo2_percent)
  ) {
    return false;
  }

  const sm = raw.safety_margins;
  if (!isObj(sm)) return false;
  if (sm.provenance !== 'DERIVED_FROM_RECORDED_BIDMC' && sm.provenance !== 'DERIVED_FROM_HYBRID_SCENARIO') {
    return false;
  }
  if (!isNullOrNum(sm.med_stl_rho_robustness) || !isNullOrNum(sm.mission_readiness_index)) return false;
  if (!isStr(sm.alarm_level) || !ALARM_LEVELS.has(sm.alarm_level)) return false;

  return true;
}
