import type {
  AbstentionCertificate,
  ActivePlaybook,
  AlarmLevel,
  Biometrics,
  BiometricsSource,
  ChannelProvenance,
  ChannelQuantileCone,
  ConformalGateStatus,
  CountermeasureAction,
  DataOrigin,
  Environment,
  FreshnessStatus,
  HeatmapCellWire,
  Hemodynamics,
  HypergraphSpatialSummary,
  IndicatorMetadata,
  ModelValidationStatus,
  MonotoneQuantileTriplet,
  Musculoskeletal,
  ProvenanceManifest,
  SafetyMargins,
  ScenarioOverlayMode,
  TelemetryPacket,
  TimestralQuantilesSummary,
  TtvIntervalKind,
} from '../types/telemetry';

type JsonRecord = Record<string, unknown>;

const BIOMETRICS_SOURCES = new Set<string>([
  'RECORDED_TERRESTRIAL_BIDMC_CSV',
  'RECORDED_TERRESTRIAL_WAVEFORM',
  'SIMULATED_SCENARIO_INPUT',
]);

const SCENARIO_OVERLAY_MODES = new Set<string>([
  'NONE_PURE_REPLAY',
  'SIMULATED_WHATIF_SCENARIO',
  'DERIVED_AND_SIMULATED',
]);

const ASTRONAUT_IDS = new Set<string>([
  'ASTRO-01',
  'ASTRO-02',
  'ASTRO-03',
  'ASTRO-04',
  'BIDMC-SUBJECT-01',
  'BIDMC-SUBJECT-02',
  'BIDMC-SUBJECT-03',
  'ARES-CDR-01',
  'ARES-CDR-02',
  'ARES-CDR-03',
  'ARES-CDR-04',
]);

const ALARM_LEVELS = new Set<string>([
  'NOMINAL',
  'ADVISORY',
  'WARNING',
  'CRITICAL',
  'DATA_DEGRADED_MISSING_CHANNELS',
  'CAUTION',
  'CRITICAL_EMERGENCY',
]);

const SAFETY_PROVENANCE = new Set<string>([
  'DERIVED_FROM_RECORDED_BIDMC',
  'DERIVED_FROM_HYBRID_SCENARIO',
  'UNAVAILABLE',
]);

const CHANNEL_PROVENANCE = new Set<string>([
  'SIMULATED_SCENARIO_INPUT',
  'DERIVED_COMPUTED',
  'UNAVAILABLE',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumInRange(value: unknown, min: number, max: number, required: boolean): boolean {
  if (value === undefined) return !required;
  if (value === null) return true;
  return isFiniteNum(value) && value >= min && value <= max;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeAlarmLevel(raw: string): AlarmLevel {
  if (raw === 'CAUTION') return 'ADVISORY';
  if (raw === 'CRITICAL_EMERGENCY') return 'CRITICAL';
  if (
    raw === 'NOMINAL' ||
    raw === 'ADVISORY' ||
    raw === 'WARNING' ||
    raw === 'CRITICAL' ||
    raw === 'DATA_DEGRADED_MISSING_CHANNELS'
  ) {
    return raw;
  }
  return 'DATA_DEGRADED_MISSING_CHANNELS';
}

function firstDefined(...values: unknown[]): unknown {
  for (const v of values) {
    if (v !== undefined) return v;
  }
  return undefined;
}

function validateBiometricsObject(bio: JsonRecord, requireCoreKeys: boolean): boolean {
  const hr = bio.heart_rate_bpm;
  const pulse = firstDefined(bio.pulse_rate_bpm, bio.pulse_bpm);
  const resp = firstDefined(bio.respiration_rate_brpm, bio.resp_rate_brpm);
  const spo2 = firstDefined(bio.spo2_percent, bio.spo2_pct);
  const rr = bio.rr_interval_ms;
  const hrv = firstDefined(bio.hrv_rmssd_ms, bio.rmssd_ms);
  const temp = bio.core_temp_celsius;

  if (!isNullableNumInRange(hr, 20, 240, requireCoreKeys)) return false;
  if (!isNullableNumInRange(pulse, 20, 240, requireCoreKeys)) return false;
  if (!isNullableNumInRange(resp, 2, 60, requireCoreKeys)) return false;
  if (!isNullableNumInRange(spo2, 50, 100, requireCoreKeys)) return false;
  if (!isNullableNumInRange(rr, 250, 2000, false)) return false;
  if (!isNullableNumInRange(hrv, 2, 200, false)) return false;
  if (!isNullableNumInRange(temp, 34, 42, false)) return false;

  if (bio.missing_channels !== undefined && !isStringArray(bio.missing_channels)) {
    return false;
  }
  if (bio.quality_flags !== undefined && !isStringArray(bio.quality_flags)) {
    return false;
  }
  if (
    bio.hrv_unavailable_reason !== undefined &&
    bio.hrv_unavailable_reason !== null &&
    typeof bio.hrv_unavailable_reason !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * Strict runtime schema guard for incoming WebSocket / HTTP telemetry packets.
 * Supports both nested `contracts/telemetry_schema.json` frames and `ares-server-cli`
 * snapshot/Rust DTO payloads while rejecting malformed, out-of-range, or wrong-enum frames.
 */
export function isValidTelemetryPayload(data: unknown): boolean {
  if (!isRecord(data)) return false;

  const hasValidTsMs = typeof data.timestamp_ms === 'number' && Number.isInteger(data.timestamp_ms);
  const hasValidTsUtc = typeof data.timestamp_utc === 'string' && data.timestamp_utc.trim().length > 0;
  if (!hasValidTsMs && !hasValidTsUtc) return false;

  if (!isFiniteNum(data.relative_recording_time_s) || data.relative_recording_time_s < 0) {
    return false;
  }
  if (typeof data.source_record_id !== 'string' || data.source_record_id.trim().length === 0) {
    return false;
  }
  if (typeof data.astronaut_id !== 'string' || !ASTRONAUT_IDS.has(data.astronaut_id)) {
    return false;
  }
  if (
    data.mission_elapsed_days !== undefined &&
    data.mission_elapsed_days !== null &&
    !isFiniteNum(data.mission_elapsed_days)
  ) {
    return false;
  }

  // Provenance manifest (nested or flat fallback)
  const pmSource = isRecord(data.provenance_manifest) ? data.provenance_manifest : data;
  if (
    typeof pmSource.biometrics_source !== 'string' ||
    !BIOMETRICS_SOURCES.has(pmSource.biometrics_source)
  ) {
    return false;
  }
  if (
    !isFiniteNum(pmSource.biometrics_native_rate_hz) ||
    pmSource.biometrics_native_rate_hz <= 0
  ) {
    return false;
  }
  if (!isFiniteNum(pmSource.ui_refresh_rate_hz) || pmSource.ui_refresh_rate_hz <= 0) {
    return false;
  }
  if (
    typeof pmSource.scenario_overlay_mode !== 'string' ||
    !SCENARIO_OVERLAY_MODES.has(pmSource.scenario_overlay_mode)
  ) {
    return false;
  }

  // Biometrics (nested `biometrics` object or flat root fields)
  if (data.biometrics !== undefined) {
    if (!isRecord(data.biometrics)) return false;
    if (!validateBiometricsObject(data.biometrics, true)) return false;
  } else {
    const hasFlatBio =
      'heart_rate_bpm' in data ||
      'spo2_percent' in data ||
      'spo2_pct' in data ||
      'pulse_rate_bpm' in data ||
      'pulse_bpm' in data;
    if (!hasFlatBio || !validateBiometricsObject(data, false)) return false;
  }

  // Safety margins (`safety_margins` nested, `nqs_stl` Rust DTO, or flat fields)
  if (data.safety_margins !== undefined) {
    if (!isRecord(data.safety_margins)) return false;
    const sm = data.safety_margins;
    if (typeof sm.provenance !== 'string' || !SAFETY_PROVENANCE.has(sm.provenance)) {
      return false;
    }
    if (typeof sm.alarm_level !== 'string' || !ALARM_LEVELS.has(sm.alarm_level)) {
      return false;
    }
    if (sm.med_stl_rho_robustness !== null && !isFiniteNum(sm.med_stl_rho_robustness)) {
      return false;
    }
    if (!isNullableNumInRange(sm.mission_readiness_index, 0, 100, false)) {
      return false;
    }
    const ttvCandidate = firstDefined(sm.time_to_violation_days, sm.ttv_days, sm.ttv_most_likely_days);
    if (ttvCandidate !== undefined && ttvCandidate !== null && (!isFiniteNum(ttvCandidate) || ttvCandidate < 0)) {
      return false;
    }
  } else if (data.nqs_stl !== undefined) {
    if (!isRecord(data.nqs_stl)) return false;
    const nqs = data.nqs_stl;
    if (nqs.rho_global !== undefined && nqs.rho_global !== null && !isFiniteNum(nqs.rho_global)) {
      return false;
    }
    if (!isNullableNumInRange(nqs.mri_pct, 0, 100, false)) {
      return false;
    }
    const rawAlarm = data.alert_severity ?? data.alarm_level;
    if (typeof rawAlarm !== 'string' || !ALARM_LEVELS.has(rawAlarm)) {
      return false;
    }
  } else {
    const rawAlarm = data.alert_severity ?? data.alarm_level;
    if (typeof rawAlarm !== 'string' || !ALARM_LEVELS.has(rawAlarm)) {
      return false;
    }
  }

  // Optional blocks must be plain objects or null when present
  const hemo = data.hemodynamics ?? data.jugular_hemodynamics;
  if (hemo !== undefined && hemo !== null) {
    if (!isRecord(hemo)) return false;
    if (hemo.provenance !== undefined && (typeof hemo.provenance !== 'string' || !CHANNEL_PROVENANCE.has(hemo.provenance))) {
      return false;
    }
  }

  if (data.musculoskeletal !== undefined && data.musculoskeletal !== null) {
    if (!isRecord(data.musculoskeletal)) return false;
    if (
      data.musculoskeletal.provenance !== undefined &&
      (typeof data.musculoskeletal.provenance !== 'string' || !CHANNEL_PROVENANCE.has(data.musculoskeletal.provenance))
    ) {
      return false;
    }
  }

  if (data.environment !== undefined && data.environment !== null) {
    if (!isRecord(data.environment)) return false;
  }

  if (data.active_playbook !== undefined && data.active_playbook !== null) {
    if (!isRecord(data.active_playbook) || typeof data.active_playbook.playbook_id !== 'string') {
      return false;
    }
  }

  if (data.quality_flags !== undefined && !isStringArray(data.quality_flags)) {
    return false;
  }

  return true;
}

function asNullableNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asNullableBoolean(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (item && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

const RR_DEPENDENT_CONE_CHANNELS = new Set<string>([
  'rmssd_ms',
  'sdnn_ms',
  'lf_hf_ratio',
  'rho_global',
]);

/**
 * Logarithmic time transform anchoring t=0..86400s (+15m, +1h, +6h, +24h)
 * without compressing short-horizon Timestral cones:
 * xi(dt) = ln(1 + dt / 900) / ln(1 + 86400 / 900) in [0, 1].
 */
export function computeLogHorizonXi(deltaSeconds: number): number {
  const tau0 = 900;
  const maxHorizonS = 86400;
  const clamped = Math.max(0, Math.min(maxHorizonS, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  return Math.log(1 + clamped / tau0) / Math.log(1 + maxHorizonS / tau0);
}

/**
 * Validates strict non-crossing quantile monotonicity (q05 <= q50 <= q95).
 * Rejects NaN, Infinity, or crossing triplets (`AresCoreError::QuantileCrossing`).
 */
export function parseMonotoneQuantileTriplet(raw: unknown): MonotoneQuantileTriplet | null {
  if (!isRecord(raw)) return null;
  const q05 = raw.q05;
  const q50 = raw.q50;
  const q95 = raw.q95;
  if (!isFiniteNum(q05) || !isFiniteNum(q50) || !isFiniteNum(q95)) {
    return null;
  }
  const eps = 1e-6;
  if (q05 > q50 + eps || q50 > q95 + eps) {
    return null;
  }
  return {
    q05: Math.min(q05, q50),
    q50,
    q95: Math.max(q50, q95),
  };
}

/**
 * Normalizes Adaptive Conformal Gate status, mapping legacy `CALIBRATED_QUANTILE_CONE`
 * strictly to `HEURISTIC_GATE_ACCEPTED` per Issue #12 (`MODEL_EVIDENCE_AUDIT.md`).
 */
export function normalizeConformalGateStatus(raw: unknown): ConformalGateStatus | undefined {
  if (
    raw === 'HEURISTIC_GATE_ACCEPTED' ||
    raw === 'HeuristicGateAccepted' ||
    raw === 'CALIBRATED_QUANTILE_CONE' ||
    raw === 'CalibratedQuantileCone'
  ) {
    return 'HEURISTIC_GATE_ACCEPTED';
  }
  if (
    raw === 'ABSTAINED_FALLBACK_DETERMINISTIC' ||
    raw === 'AbstainedFallbackDeterministic' ||
    raw === 'ABSTAINED_FALLBACK'
  ) {
    return 'ABSTAINED_FALLBACK_DETERMINISTIC';
  }
  return undefined;
}

export function normalizeModelValidationStatus(raw: unknown): ModelValidationStatus {
  if (
    raw === 'INTERNALLY_BENCHMARKED_TERRESTRIAL' ||
    raw === 'InternallyBenchmarkedTerrestrial'
  ) {
    return 'INTERNALLY_BENCHMARKED_TERRESTRIAL';
  }
  if (
    raw === 'CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW' ||
    raw === 'ClinicallyCalibratedSubjectToReview'
  ) {
    return 'CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW';
  }
  if (isRecord(raw)) {
    if ('INTERNALLY_BENCHMARKED_TERRESTRIAL' in raw || 'InternallyBenchmarkedTerrestrial' in raw) {
      return 'INTERNALLY_BENCHMARKED_TERRESTRIAL';
    }
    if ('CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW' in raw || 'ClinicallyCalibratedSubjectToReview' in raw) {
      return 'CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW';
    }
  }
  return 'ILLUSTRATIVE_UNVALIDATED';
}

export function normalizeTtvIntervalKind(raw: unknown): TtvIntervalKind | null {
  if (raw === 'ILLUSTRATIVE_SCENARIO_RANGE' || raw === 'IllustrativeScenarioRange') {
    return 'ILLUSTRATIVE_SCENARIO_RANGE';
  }
  return null;
}

export function normalizeCountermeasureActions(raw: unknown): CountermeasureAction[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CountermeasureAction[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (
      typeof item.action_id !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.category !== 'string' ||
      !isFiniteNum(item.delta_rho_per_hour)
    ) {
      continue;
    }
    out.push({
      action_id: item.action_id,
      label: item.label,
      category: item.category,
      delta_rho_per_hour: item.delta_rho_per_hour,
    });
  }
  return out;
}

export function normalizeTimestralQuantiles(
  raw: unknown,
  opts: {
    hrvUnavailableReason?: string | null;
    hrvRmssdMs?: number | null;
  } = {},
): TimestralQuantilesSummary | null {
  if (!isRecord(raw)) return null;

  const hrvUnavailable =
    opts.hrvUnavailableReason === 'BEAT_INTERVALS_NOT_AVAILABLE' ||
    opts.hrvRmssdMs === null;

  const confidenceState = normalizeConformalGateStatus(raw.confidence_state ?? raw.conformal_status);
  const conformalStatus = normalizeConformalGateStatus(raw.conformal_status ?? raw.confidence_state);

  let abstentionCertificate: AbstentionCertificate | null = null;
  if (isRecord(raw.abstention_certificate)) {
    const c = raw.abstention_certificate;
    const status = normalizeConformalGateStatus(c.status) ?? 'ABSTAINED_FALLBACK_DETERMINISTIC';
    abstentionCertificate = {
      abstained: typeof c.abstained === 'boolean' ? c.abstained : status === 'ABSTAINED_FALLBACK_DETERMINISTIC',
      status,
      reason: typeof c.reason === 'string' ? c.reason : 'unspecified gate diagnostic',
      empirical_coverage_error: isFiniteNum(c.empirical_coverage_error) ? c.empirical_coverage_error : 0,
      adaptive_alpha_t: isFiniteNum(c.adaptive_alpha_t) ? c.adaptive_alpha_t : 0.1,
      interval_width: isFiniteNum(c.interval_width) ? c.interval_width : 0,
      sqi_score: isFiniteNum(c.sqi_score) ? c.sqi_score : 0,
      missing_ratio: isFiniteNum(c.missing_ratio) ? c.missing_ratio : 0,
      timestamp_s: isFiniteNum(c.timestamp_s) ? c.timestamp_s : 0,
    };
  }

  const rawChannelCones = Array.isArray(raw.channel_cones) ? raw.channel_cones : [];
  const channelCones: ChannelQuantileCone[] = [];
  for (const item of rawChannelCones) {
    if (!isRecord(item) || typeof item.channel_name !== 'string') continue;
    if (hrvUnavailable && RR_DEPENDENT_CONE_CHANNELS.has(item.channel_name)) {
      continue;
    }
    const h15m = parseMonotoneQuantileTriplet(item.horizon_15m);
    const h1h = parseMonotoneQuantileTriplet(item.horizon_1h);
    const h6h = parseMonotoneQuantileTriplet(item.horizon_6h);
    const h24h = parseMonotoneQuantileTriplet(item.horizon_24h);
    if (!h15m || !h1h || !h6h || !h24h) continue;
    channelCones.push({
      channel_name: item.channel_name,
      horizon_15m: h15m,
      horizon_1h: h1h,
      horizon_6h: h6h,
      horizon_24h: h24h,
    });
  }

  const ttvHoursCone = hrvUnavailable ? null : parseMonotoneQuantileTriplet(raw.ttv_hours_cone);
  const ttvQ05Days = hrvUnavailable
    ? null
    : asNullableNumber(raw.ttv_q05_days) ?? (ttvHoursCone ? ttvHoursCone.q05 / 24 : null);
  const ttvQ50Days = hrvUnavailable
    ? null
    : asNullableNumber(raw.ttv_q50_days) ?? (ttvHoursCone ? ttvHoursCone.q50 / 24 : null);
  const ttvQ95Days = hrvUnavailable
    ? null
    : asNullableNumber(raw.ttv_q95_days) ?? (ttvHoursCone ? ttvHoursCone.q95 / 24 : null);

  return {
    model_validation_status:
      raw.model_validation_status !== undefined
        ? normalizeModelValidationStatus(raw.model_validation_status)
        : 'ILLUSTRATIVE_UNVALIDATED',
    source_recording_time_s: isFiniteNum(raw.source_recording_time_s)
      ? raw.source_recording_time_s
      : undefined,
    confidence_state: confidenceState,
    conformal_status: conformalStatus,
    abstention_certificate: abstentionCertificate,
    short_horizon_s: isFiniteNum(raw.short_horizon_s) ? raw.short_horizon_s : undefined,
    heart_rate_bpm_cone: parseMonotoneQuantileTriplet(raw.heart_rate_bpm_cone),
    resp_rate_brpm_cone: parseMonotoneQuantileTriplet(raw.resp_rate_brpm_cone),
    rmssd_ms_cone: hrvUnavailable ? null : parseMonotoneQuantileTriplet(raw.rmssd_ms_cone),
    rho_global_cone: hrvUnavailable ? null : parseMonotoneQuantileTriplet(raw.rho_global_cone),
    ttv_hours_cone: ttvHoursCone,
    channel_cones: channelCones.length > 0 || Array.isArray(raw.channel_cones) ? channelCones : undefined,
    pessimistic_ttv_q05_hours: hrvUnavailable ? null : asNullableNumber(raw.pessimistic_ttv_q05_hours),
    inference_latency_us: isFiniteNum(raw.inference_latency_us) ? raw.inference_latency_us : undefined,
    ttv_q05_days: ttvQ05Days,
    ttv_q50_days: ttvQ50Days,
    ttv_q95_days: ttvQ95Days,
  };
}

export function normalizeHypergraphSpatial(raw: unknown): HypergraphSpatialSummary | null {
  if (!isRecord(raw)) return null;

  const cells: HeatmapCellWire[] = [];
  if (Array.isArray(raw.cells)) {
    for (const c of raw.cells) {
      if (!isRecord(c)) continue;
      if (
        typeof c.region !== 'string' ||
        typeof c.key !== 'string' ||
        typeof c.uberon_curie !== 'string' ||
        !Array.isArray(c.centroid) ||
        c.centroid.length !== 3 ||
        !c.centroid.every((n) => isFiniteNum(n)) ||
        !isFiniteNum(c.local_intensity) ||
        !isFiniteNum(c.propagated_intensity) ||
        typeof c.observed !== 'boolean'
      ) {
        continue;
      }
      cells.push({
        region: c.region,
        key: c.key,
        uberon_curie: c.uberon_curie,
        centroid: [c.centroid[0], c.centroid[1], c.centroid[2]],
        local_intensity: c.local_intensity,
        propagated_intensity: c.propagated_intensity,
        observed: c.observed,
      });
    }
  }

  const anatomicalCells = Array.isArray(raw.anatomical_cells)
    ? raw.anatomical_cells
        .filter(
          (ac): ac is { region_id: string; uberon_id: string; risk_intensity: number } =>
            isRecord(ac) &&
            typeof ac.region_id === 'string' &&
            typeof ac.uberon_id === 'string' &&
            isFiniteNum(ac.risk_intensity),
        )
        .map((ac) => ({
          region_id: ac.region_id,
          uberon_id: ac.uberon_id,
          risk_intensity: ac.risk_intensity,
        }))
    : undefined;

  return {
    hottest_region: typeof raw.hottest_region === 'string' ? raw.hottest_region : null,
    cells: cells.length > 0 || Array.isArray(raw.cells) ? cells : undefined,
    anatomical_cells: anatomicalCells,
    habitat_zone: typeof raw.habitat_zone === 'string' ? raw.habitat_zone : undefined,
    violates_policy: typeof raw.violates_policy === 'boolean' ? raw.violates_policy : undefined,
    rho_current_location: asNullableNumber(raw.rho_current_location),
    biokg_clause: typeof raw.biokg_clause === 'string' ? raw.biokg_clause : null,
  };
}

/**
 * Validates and normalizes any incoming backend snapshot or WebSocket frame into
 * the canonical `TelemetryPacket` shape without ever coercing `null` to `0`.
 */
export function normalizeTelemetryPacket(data: unknown): TelemetryPacket | null {
  if (!isValidTelemetryPayload(data)) return null;
  const d = data as JsonRecord;

  const timestampMs =
    typeof d.timestamp_ms === 'number' && Number.isInteger(d.timestamp_ms)
      ? d.timestamp_ms
      : (() => {
          const parsed = typeof d.timestamp_utc === 'string' ? Date.parse(d.timestamp_utc) : Number.NaN;
          return Number.isFinite(parsed) ? Math.round(parsed) : Date.now();
        })();

  const pmRaw = isRecord(d.provenance_manifest) ? d.provenance_manifest : d;
  const biometricsSource = pmRaw.biometrics_source as BiometricsSource;
  const rawOverlayMode = pmRaw.scenario_overlay_mode as ScenarioOverlayMode;
  const biologicalRefs = isStringArray(pmRaw.biological_context_refs)
    ? pmRaw.biological_context_refs
    : undefined;

  const isBidmc = biometricsSource === 'RECORDED_TERRESTRIAL_BIDMC_CSV';
  const manifestVerified =
    typeof pmRaw.manifest_sha256_verified === 'boolean'
      ? pmRaw.manifest_sha256_verified
      : isBidmc;
  const datasetProvenance =
    typeof pmRaw.dataset_provenance === 'string'
      ? pmRaw.dataset_provenance
      : isBidmc
        ? 'BIDMC v1.0.0'
        : 'SIMULATED_SCENARIO';

  const provenanceManifest: ProvenanceManifest = {
    biometrics_source: biometricsSource,
    biometrics_native_rate_hz: pmRaw.biometrics_native_rate_hz as number,
    ui_refresh_rate_hz: pmRaw.ui_refresh_rate_hz as number,
    scenario_overlay_mode: rawOverlayMode,
    dataset_provenance: datasetProvenance,
    manifest_sha256_verified: manifestVerified,
    biological_context_refs: biologicalRefs,
  };

  const bioRaw = isRecord(d.biometrics) ? d.biometrics : d;
  const hr = asNullableNumber(bioRaw.heart_rate_bpm);
  const pulse = asNullableNumber(bioRaw.pulse_rate_bpm ?? bioRaw.pulse_bpm);
  const resp = asNullableNumber(bioRaw.respiration_rate_brpm ?? bioRaw.resp_rate_brpm);
  const spo2 = asNullableNumber(bioRaw.spo2_percent ?? bioRaw.spo2_pct);
  const rr = asNullableNumber(bioRaw.rr_interval_ms);
  const hrv = asNullableNumber(bioRaw.hrv_rmssd_ms ?? bioRaw.rmssd_ms);
  const temp = asNullableNumber(bioRaw.core_temp_celsius);
  const sqi = asNullableNumber(bioRaw.sqi_score);
  const radDose = asNullableNumber(bioRaw.radiation_dose_rate_msv_d);

  const missingList = isStringArray(bioRaw.missing_channels) ? [...bioRaw.missing_channels] : [];
  if (hr === null) missingList.push('heart_rate_bpm');
  if (pulse === null) missingList.push('pulse_rate_bpm');
  if (resp === null) missingList.push('respiration_rate_brpm');
  if (spo2 === null) missingList.push('spo2_percent');
  if (hrv === null && isBidmc && !missingList.includes('hrv_rmssd_ms') && !missingList.includes('rmssd_ms')) {
    missingList.push('hrv_rmssd_ms');
  }

  const hrvReason =
    typeof bioRaw.hrv_unavailable_reason === 'string'
      ? bioRaw.hrv_unavailable_reason
      : hrv === null && isBidmc
        ? 'BEAT_INTERVALS_NOT_AVAILABLE'
        : null;

  const rawQualityFlags = [
    ...(isStringArray(d.quality_flags) ? d.quality_flags : []),
    ...(isStringArray(bioRaw.quality_flags) ? bioRaw.quality_flags : []),
  ];
  if (hrv === null && isBidmc) {
    rawQualityFlags.push('BEAT_INTERVALS_NOT_AVAILABLE');
  }
  if (manifestVerified && isBidmc) {
    rawQualityFlags.push('MANIFEST_SHA256_VERIFIED');
  }
  if (pulse === null || spo2 === null || hr === null || resp === null) {
    rawQualityFlags.push('CHANNEL_NAN_DROPOUT');
  }

  const biometrics: Biometrics = {
    heart_rate_bpm: hr,
    pulse_rate_bpm: pulse,
    respiration_rate_brpm: resp,
    spo2_percent: spo2,
    rr_interval_ms: rr,
    hrv_rmssd_ms: hrv,
    hrv_unavailable_reason: hrvReason,
    core_temp_celsius: temp,
    sqi_score: sqi,
    radiation_dose_rate_msv_d: radDose,
    missing_channels: dedupeStrings(missingList),
    quality_flags: dedupeStrings(rawQualityFlags),
  };

  // Hemodynamics (`hemodynamics` schema block OR Rust `jugular_hemodynamics` + `sans_ocular`)
  let hemodynamics: Hemodynamics | null = null;
  if (d.hemodynamics === null) {
    hemodynamics = null;
  } else if (isRecord(d.hemodynamics)) {
    const h = d.hemodynamics;
    hemodynamics = {
      provenance: (h.provenance as ChannelProvenance) ?? 'DERIVED_COMPUTED',
      ijv_csa_cm2: asNullableNumber(h.ijv_csa_cm2),
      ijv_velocity_max_cm_s: asNullableNumber(h.ijv_velocity_max_cm_s),
      wall_shear_stress_dyn_cm2: asNullableNumber(h.wall_shear_stress_dyn_cm2),
      pocus_thrombus_confirmed: asNullableBoolean(h.pocus_thrombus_confirmed),
      thrombosis_risk_score: asNullableNumber(h.thrombosis_risk_score),
      flow_grade: typeof h.flow_grade === 'string' ? h.flow_grade : null,
      lbnp_active: asNullableBoolean(h.lbnp_active),
      lbnp_pressure_mmhg: asNullableNumber(h.lbnp_pressure_mmhg),
      onsd_mm: asNullableNumber(h.onsd_mm),
      sans_risk_index: asNullableNumber(h.sans_risk_index),
    };
  } else if (isRecord(d.jugular_hemodynamics)) {
    const j = d.jugular_hemodynamics;
    const sans = isRecord(d.sans_ocular) ? d.sans_ocular : null;
    const csaMm2 = asNullableNumber(j.ijv_csa_mm2);
    hemodynamics = {
      provenance: 'DERIVED_COMPUTED',
      ijv_csa_cm2: csaMm2 !== null ? csaMm2 / 100 : null,
      ijv_velocity_max_cm_s: asNullableNumber(j.ijv_vmax_cm_s),
      wall_shear_stress_dyn_cm2: asNullableNumber(j.tau_w_dyn_cm2),
      pocus_thrombus_confirmed: asNullableBoolean(j.pocus_thrombus_confirmed),
      thrombosis_risk_score: null,
      flow_grade: typeof j.flow_grade === 'string' ? j.flow_grade : null,
      lbnp_active: asNullableBoolean(j.lbnp_active),
      lbnp_pressure_mmhg: asNullableNumber(j.lbnp_pressure_mmhg),
      onsd_mm: sans ? asNullableNumber(sans.onsd_mm) : null,
      sans_risk_index: sans ? asNullableNumber(sans.sans_risk_index) : null,
    };
  }

  // Musculoskeletal
  let musculoskeletal: Musculoskeletal | null = null;
  if (d.musculoskeletal === null) {
    musculoskeletal = null;
  } else if (isRecord(d.musculoskeletal)) {
    const m = d.musculoskeletal;
    musculoskeletal = {
      provenance: (m.provenance as ChannelProvenance) ?? 'DERIVED_COMPUTED',
      soleus_thickness_mm: asNullableNumber(m.soleus_thickness_mm),
      pennation_angle_deg: asNullableNumber(m.pennation_angle_deg),
      bone_resorption_rate_pct: asNullableNumber(m.bone_resorption_rate_pct),
      mechanotransductive_index: asNullableNumber(m.mechanotransductive_index ?? m.mqi_index),
      soleus_volume_loss_pct: asNullableNumber(m.soleus_volume_loss_pct),
      bmd_loss_pct_per_month: asNullableNumber(m.bmd_loss_pct_per_month),
      gait_asymmetry_index_pct: asNullableNumber(m.gait_asymmetry_index_pct ?? m.gai_pct),
      post_landing: asNullableBoolean(m.post_landing),
      ared_daily_load_kgf: asNullableNumber(m.ared_daily_load_kgf),
      soleus_csa_pct: asNullableNumber(m.soleus_csa_pct),
      mqi_index: asNullableNumber(m.mqi_index),
      sclerostin_pmol_l: asNullableNumber(m.sclerostin_pmol_l),
      gai_pct: asNullableNumber(m.gai_pct),
    };
  }

  // Environment
  let environment: Environment | null = null;
  if (d.environment === null) {
    environment = null;
  } else if (isRecord(d.environment)) {
    const e = d.environment;
    environment = {
      provenance: e.provenance === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SIMULATED_SCENARIO_INPUT',
      cabin_co2_ppm: asNullableNumber(e.cabin_co2_ppm),
      cabin_ppco2_mmhg: asNullableNumber(e.cabin_ppco2_mmhg),
      cabin_o2_kpa: asNullableNumber(e.cabin_o2_kpa),
      ambient_radiation_rate_ugy_h: asNullableNumber(e.ambient_radiation_rate_ugy_h),
      cumulative_radiation_mgy: asNullableNumber(e.cumulative_radiation_mgy),
    };
  }

  // Safety margins (`safety_margins` OR Rust `nqs_stl` + `alert_severity` OR flat fields)
  let safetyMargins: SafetyMargins;
  if (isRecord(d.safety_margins)) {
    const sm = d.safety_margins;
    const ttv = asNullableNumber(sm.time_to_violation_days ?? sm.ttv_days ?? sm.ttv_most_likely_days);
    safetyMargins = {
      provenance: sm.provenance as SafetyMargins['provenance'],
      med_stl_rho_robustness: asNullableNumber(sm.med_stl_rho_robustness),
      time_to_violation_days: ttv,
      ttv_most_likely_days: asNullableNumber(sm.ttv_most_likely_days) ?? ttv,
      ttv_p5_days: asNullableNumber(sm.ttv_p5_days),
      ttv_p95_days: asNullableNumber(sm.ttv_p95_days),
      ttv_horizon_days: asNullableNumber(sm.ttv_horizon_days),
      ttv_no_crossing_within_horizon: sm.ttv_no_crossing_within_horizon === true,
      ttv_interval_kind:
        normalizeTtvIntervalKind(sm.ttv_interval_kind) ??
        (ttv !== null ? 'ILLUSTRATIVE_SCENARIO_RANGE' : undefined),
      mission_readiness_index: asNullableNumber(sm.mission_readiness_index),
      alarm_level: normalizeAlarmLevel(String(sm.alarm_level)),
      pending_sources: isStringArray(sm.pending_sources) ? sm.pending_sources : undefined,
    };
  } else if (isRecord(d.nqs_stl)) {
    const nqs = d.nqs_stl;
    const ttvHours = asNullableNumber(nqs.ttv_hours);
    const ttvDays = asNullableNumber(d.ttv_days) ?? (ttvHours !== null ? ttvHours / 24 : null);
    const ttvLowHours = asNullableNumber(nqs.ttv_ci95_low_hours);
    const ttvHighHours = asNullableNumber(nqs.ttv_ci95_high_hours);
    const rawAlarm = String(d.alert_severity ?? d.alarm_level ?? 'NOMINAL');
    const hasMissingBiometrics = pulse === null || spo2 === null || hr === null || resp === null;
    const alarm = hasMissingBiometrics && rawAlarm === 'NOMINAL'
      ? 'DATA_DEGRADED_MISSING_CHANNELS'
      : normalizeAlarmLevel(rawAlarm);

    const perPred: Record<string, number | null> = {
      tau_w: asNullableNumber(nqs.rho_tau_w),
      ared: asNullableNumber(nqs.rho_ared),
      sclerostin: asNullableNumber(nqs.rho_sost),
      rmssd: asNullableNumber(nqs.rho_rmssd),
      sans: asNullableNumber(nqs.rho_sans),
    };

    safetyMargins = {
      provenance:
        rawOverlayMode === 'NONE_PURE_REPLAY'
          ? 'DERIVED_FROM_RECORDED_BIDMC'
          : 'DERIVED_FROM_HYBRID_SCENARIO',
      med_stl_rho_robustness: asNullableNumber(nqs.rho_global),
      time_to_violation_days: ttvDays,
      ttv_most_likely_days: ttvDays,
      ttv_p5_days: ttvLowHours !== null ? ttvLowHours / 24 : null,
      ttv_p95_days: ttvHighHours !== null ? ttvHighHours / 24 : null,
      ttv_interval_kind:
        normalizeTtvIntervalKind(nqs.ttv_interval_kind) ??
        (ttvDays !== null ? 'ILLUSTRATIVE_SCENARIO_RANGE' : undefined),
      mission_readiness_index: asNullableNumber(nqs.mri_pct),
      alarm_level: alarm,
      per_predicate_rho: perPred,
    };
  } else {
    const ttv = asNullableNumber(d.ttv_days ?? d.ttv_most_likely_days ?? d.time_to_violation_days);
    safetyMargins = {
      provenance:
        rawOverlayMode === 'NONE_PURE_REPLAY'
          ? 'DERIVED_FROM_RECORDED_BIDMC'
          : 'DERIVED_FROM_HYBRID_SCENARIO',
      med_stl_rho_robustness: asNullableNumber(d.med_stl_rho_robustness ?? d.rho_global),
      time_to_violation_days: ttv,
      ttv_most_likely_days: ttv,
      ttv_p5_days: asNullableNumber(d.ttv_p5_days),
      ttv_interval_kind:
        normalizeTtvIntervalKind(d.ttv_interval_kind) ??
        (ttv !== null ? 'ILLUSTRATIVE_SCENARIO_RANGE' : undefined),
      mission_readiness_index: asNullableNumber(d.mission_readiness_index ?? d.mri_pct),
      alarm_level: normalizeAlarmLevel(String(d.alarm_level ?? d.alert_severity ?? 'NOMINAL')),
    };
  }

  // Active Playbook
  let activePlaybook: ActivePlaybook | null = null;
  if (isRecord(d.active_playbook)) {
    const pb = d.active_playbook;
    activePlaybook = {
      playbook_id: String(pb.playbook_id),
      title: typeof pb.title === 'string' ? pb.title : undefined,
      current_step: typeof pb.current_step === 'number' ? pb.current_step : undefined,
      total_steps: typeof pb.total_steps === 'number' ? pb.total_steps : undefined,
      step_instruction: typeof pb.step_instruction === 'string' ? pb.step_instruction : undefined,
      causal_chain_summary: isStringArray(pb.causal_chain_summary) ? pb.causal_chain_summary : undefined,
      actions: normalizeCountermeasureActions(pb.actions),
      safety_gates: isRecord(pb.safety_gates)
        ? {
            anticoagulant_lock_active: Boolean(pb.safety_gates.anticoagulant_lock_active),
            lbnp_auto_vent_armed: Boolean(pb.safety_gates.lbnp_auto_vent_armed),
            eva_suit_damping_active: Boolean(pb.safety_gates.eva_suit_damping_active),
          }
        : undefined,
    };
  }

  const missionElapsedDays =
    d.mission_elapsed_days !== undefined
      ? asNullableNumber(d.mission_elapsed_days)
      : typeof d.flight_day === 'number' && Number.isFinite(d.flight_day)
        ? d.flight_day
        : typeof d.mission_Elapsed_seconds === 'number' && Number.isFinite(d.mission_Elapsed_seconds)
          ? d.mission_Elapsed_seconds / 86400
          : null;

  const modelValidationStatus =
    d.model_validation_status !== undefined
      ? normalizeModelValidationStatus(d.model_validation_status)
      : undefined;

  return {
    timestamp_ms: timestampMs,
    relative_recording_time_s: d.relative_recording_time_s as number,
    source_record_id: String(d.source_record_id),
    mission_elapsed_days: missionElapsedDays,
    astronaut_id: String(d.astronaut_id),
    model_validation_status: modelValidationStatus,
    provenance_manifest: provenanceManifest,
    biometrics,
    hemodynamics,
    musculoskeletal,
    environment,
    safety_margins: safetyMargins,
    active_playbook: activePlaybook,
    pocus_posterior: d.pocus_posterior !== undefined ? asNullableNumber(d.pocus_posterior) : undefined,
    causal_chain: isStringArray(d.causal_chain) ? d.causal_chain : undefined,
    quality_flags: biometrics.quality_flags,
    hypergraph_spatial: normalizeHypergraphSpatial(d.hypergraph_spatial),
    timestral_quantiles: normalizeTimestralQuantiles(d.timestral_quantiles, {
      hrvUnavailableReason: biometrics.hrv_unavailable_reason,
      hrvRmssdMs: biometrics.hrv_rmssd_ms,
    }),
    is_local_simulation: false,
  };
}

export function isPureRecordedReplay(packet: TelemetryPacket): boolean {
  return (
    !packet.is_local_simulation &&
    packet.provenance_manifest.biometrics_source === 'RECORDED_TERRESTRIAL_BIDMC_CSV' &&
    packet.provenance_manifest.scenario_overlay_mode === 'NONE_PURE_REPLAY'
  );
}

export function formatNullableMetric(
  value: number | null | undefined,
  decimals: number,
  options?: {
    channelName?: string;
    qualityFlags?: string[];
    missingChannels?: string[];
    isRhythmDependent?: boolean;
  },
): { text: string; unavailable: boolean; reason: string | null } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    const flags = options?.qualityFlags ?? [];
    const missing = options?.missingChannels ?? [];
    if (options?.isRhythmDependent || flags.includes('BEAT_INTERVALS_NOT_AVAILABLE')) {
      if (options?.isRhythmDependent) {
        return {
          text: 'UNAVAILABLE (BEAT_INTERVALS_NOT_AVAILABLE)',
          unavailable: true,
          reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
        };
      }
    }
    if (options?.channelName && missing.includes(options.channelName)) {
      return {
        text: 'MISSING',
        unavailable: true,
        reason: `${options.channelName} missing in source tick`,
      };
    }
    return {
      text: 'MISSING',
      unavailable: true,
      reason: 'Channel value is null/unavailable',
    };
  }
  return {
    text: value.toFixed(decimals),
    unavailable: false,
    reason: null,
  };
}

export interface FormattedTtv {
  primaryText: string;
  secondaryText: string;
  state: 'KNOWN' | 'NO_CROSSING_IN_HORIZON' | 'UNAVAILABLE';
}

/**
 * Formats Time-To-Violation without ever calling `Number(null)` or misrepresenting
 * missing/unsupported predictions as `> 100 d`.
 */
export function formatTimeToViolation(safety: SafetyMargins, qualityFlags: string[] = []): FormattedTtv {
  const ttv = safety.ttv_most_likely_days ?? safety.time_to_violation_days;
  const p5 = safety.ttv_p5_days;

  if (typeof ttv === 'number' && Number.isFinite(ttv)) {
    const rounded = ttv === 0 ? '0 d (NOW)' : `${ttv.toFixed(1)} d`;
    const p5Note =
      typeof p5 === 'number' && Number.isFinite(p5)
        ? `P5 worst-case: ${p5.toFixed(1)} d`
        : 'countermeasures held constant';
    return {
      primaryText: rounded,
      secondaryText: p5Note,
      state: 'KNOWN',
    };
  }

  if (safety.ttv_no_crossing_within_horizon === true && typeof safety.ttv_horizon_days === 'number') {
    return {
      primaryText: `NO CROSSING (<= ${safety.ttv_horizon_days} d)`,
      secondaryText: `Evaluated ${safety.ttv_horizon_days}-day horizon; no limit violation`,
      state: 'NO_CROSSING_IN_HORIZON',
    };
  }

  const noRr = qualityFlags.includes('BEAT_INTERVALS_NOT_AVAILABLE');
  return {
    primaryText: noRr ? 'UNAVAILABLE (NO R-R)' : 'N/A',
    secondaryText: noRr
      ? '8-min terrestrial BIDMC replay lacks beat-to-beat R-R and multi-day spaceflight baseline'
      : 'Prediction pending or unsupported by current stream',
    state: 'UNAVAILABLE',
  };
}

export function buildIndicatorMetadata(
  packet: TelemetryPacket,
  opts: {
    heldSample: boolean;
    heldAgeMs: number;
    isStale: boolean;
    hasRejectedFrame: boolean;
  },
): IndicatorMetadata[] {
  const pm = packet.provenance_manifest;
  const bio = packet.biometrics;
  const flags = dedupeStrings([
    ...(packet.quality_flags ?? []),
    ...(bio.quality_flags ?? []),
    ...(opts.heldSample ? ['HOLD_LAST_VALID'] : []),
  ]);
  const missing = bio.missing_channels ?? [];

  const bioOrigin: DataOrigin = packet.is_local_simulation
    ? 'SIMULATED_SCENARIO_INPUT'
    : pm.biometrics_source;

  const baseFreshness = (isMissing: boolean): FreshnessStatus => {
    if (opts.hasRejectedFrame && opts.isStale) return 'INVALID';
    if (isMissing) return 'UNAVAILABLE';
    if (opts.isStale) return 'HELD_STALE';
    if (opts.heldSample) return 'HOLD_LAST_VALID';
    return 'FRESH';
  };

  const indicators: IndicatorMetadata[] = [
    {
      id: 'heart_rate_bpm',
      label: 'Heart Rate (ECG)',
      valueText: bio.heart_rate_bpm !== null ? `${bio.heart_rate_bpm.toFixed(0)} bpm` : 'MISSING',
      origin: bio.heart_rate_bpm === null ? 'UNAVAILABLE' : bioOrigin,
      freshness: baseFreshness(bio.heart_rate_bpm === null),
      nativeRateHz: pm.biometrics_native_rate_hz,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: opts.heldSample ? opts.heldAgeMs : 0,
      availabilityReason:
        bio.heart_rate_bpm === null ? 'Channel missing in current tick' : `${pm.dataset_provenance ?? pm.biometrics_source}`,
      qualityFlags: flags,
    },
    {
      id: 'pulse_rate_bpm',
      label: 'Pulse Rate (PPG)',
      valueText: bio.pulse_rate_bpm !== null ? `${bio.pulse_rate_bpm.toFixed(0)} bpm` : 'MISSING',
      origin: bio.pulse_rate_bpm === null ? 'UNAVAILABLE' : bioOrigin,
      freshness: baseFreshness(bio.pulse_rate_bpm === null),
      nativeRateHz: pm.biometrics_native_rate_hz,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: opts.heldSample ? opts.heldAgeMs : 0,
      availabilityReason:
        bio.pulse_rate_bpm === null || missing.includes('pulse_rate_bpm')
          ? 'Missing/NaN PPG pulse sample in BIDMC CSV (never interpolated to 0)'
          : `${pm.dataset_provenance ?? pm.biometrics_source}`,
      qualityFlags: flags,
    },
    {
      id: 'spo2_percent',
      label: 'Blood Oxygen (SpO2)',
      valueText: bio.spo2_percent !== null ? `${bio.spo2_percent.toFixed(1)} %` : 'MISSING',
      origin: bio.spo2_percent === null ? 'UNAVAILABLE' : bioOrigin,
      freshness: baseFreshness(bio.spo2_percent === null),
      nativeRateHz: pm.biometrics_native_rate_hz,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: opts.heldSample ? opts.heldAgeMs : 0,
      availabilityReason:
        bio.spo2_percent === null || missing.includes('spo2_percent')
          ? 'Missing/NaN SpO2 sample in BIDMC CSV (never substituted with 98%)'
          : `${pm.dataset_provenance ?? pm.biometrics_source}`,
      qualityFlags: flags,
    },
    {
      id: 'respiration_rate_brpm',
      label: 'Respiration Rate',
      valueText: bio.respiration_rate_brpm !== null ? `${bio.respiration_rate_brpm.toFixed(1)} br/min` : 'MISSING',
      origin: bio.respiration_rate_brpm === null ? 'UNAVAILABLE' : bioOrigin,
      freshness: baseFreshness(bio.respiration_rate_brpm === null),
      nativeRateHz: pm.biometrics_native_rate_hz,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: opts.heldSample ? opts.heldAgeMs : 0,
      availabilityReason:
        bio.respiration_rate_brpm === null ? 'Missing/NaN RESP sample' : `${pm.dataset_provenance ?? pm.biometrics_source}`,
      qualityFlags: flags,
    },
    {
      id: 'hrv_rmssd_ms',
      label: 'HRV (RMSSD)',
      valueText:
        bio.hrv_rmssd_ms !== null && bio.hrv_rmssd_ms !== undefined
          ? `${bio.hrv_rmssd_ms.toFixed(1)} ms`
          : 'UNAVAILABLE (NO R-R)',
      origin: bio.hrv_rmssd_ms != null ? bioOrigin : 'UNAVAILABLE',
      freshness: baseFreshness(bio.hrv_rmssd_ms === null || bio.hrv_rmssd_ms === undefined),
      nativeRateHz: null,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: null,
      availabilityReason:
        bio.hrv_unavailable_reason ?? 'BEAT_INTERVALS_NOT_AVAILABLE (1 Hz numeric CSV lacks R-R intervals)',
      qualityFlags: flags,
    },
    {
      id: 'hemodynamics',
      label: 'Jugular Hemodynamics & SANS',
      valueText: packet.hemodynamics
        ? `tau_w ${packet.hemodynamics.wall_shear_stress_dyn_cm2?.toFixed(2) ?? 'N/A'} dyn/cm2`
        : 'UNAVAILABLE',
      origin: packet.hemodynamics ? packet.hemodynamics.provenance : 'UNAVAILABLE',
      freshness: packet.hemodynamics ? (opts.isStale ? 'HELD_STALE' : 'FRESH') : 'UNAVAILABLE',
      nativeRateHz: packet.hemodynamics ? pm.ui_refresh_rate_hz : null,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: null,
      availabilityReason: packet.hemodynamics
        ? `Overlay mode: ${pm.scenario_overlay_mode}`
        : 'Absent in pure terrestrial BIDMC replay (no ultrasound/microgravity scenario)',
      qualityFlags: flags,
    },
    {
      id: 'musculoskeletal',
      label: 'Musculoskeletal Axis',
      valueText: packet.musculoskeletal ? 'AVAILABLE' : 'UNAVAILABLE',
      origin: packet.musculoskeletal ? packet.musculoskeletal.provenance : 'UNAVAILABLE',
      freshness: packet.musculoskeletal ? (opts.isStale ? 'HELD_STALE' : 'FRESH') : 'UNAVAILABLE',
      nativeRateHz: packet.musculoskeletal ? pm.ui_refresh_rate_hz : null,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: null,
      availabilityReason: packet.musculoskeletal
        ? `Overlay mode: ${pm.scenario_overlay_mode}`
        : 'Absent in pure terrestrial BIDMC replay',
      qualityFlags: flags,
    },
    {
      id: 'time_to_violation_days',
      label: 'Time-To-Violation (TTV)',
      valueText: formatTimeToViolation(packet.safety_margins, flags).primaryText,
      origin:
        packet.safety_margins.time_to_violation_days != null || packet.safety_margins.ttv_most_likely_days != null
          ? packet.safety_margins.provenance
          : 'UNAVAILABLE',
      freshness:
        packet.safety_margins.time_to_violation_days != null ||
        packet.safety_margins.ttv_most_likely_days != null ||
        packet.safety_margins.ttv_no_crossing_within_horizon
          ? opts.isStale
            ? 'HELD_STALE'
            : 'FRESH'
          : 'UNAVAILABLE',
      nativeRateHz: null,
      measurementTimeS: packet.relative_recording_time_s,
      ageMs: null,
      availabilityReason: formatTimeToViolation(packet.safety_margins, flags).secondaryText,
      qualityFlags: flags,
    },
  ];

  return indicators;
}
