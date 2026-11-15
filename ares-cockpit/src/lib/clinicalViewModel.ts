import type { DataOrigin, ModelValidationStatus, TelemetryPacket } from '../types/telemetry';

export type ClinicalAvailability = 'AVAILABLE' | 'UNAVAILABLE';
export type ClinicalDataMode = 'BACKEND_REPLAY' | 'BACKEND_HARDWARE' | 'BACKEND_SCENARIO' | 'LOCAL_PREVIEW';
export interface ClinicalMetric<Unit extends string = string> {
  value: number | null;
  unit: Unit;
  availability: ClinicalAvailability;
  reason: string | null;
  provenance: DataOrigin;
  sourceRecordId: string;
  timestampMs: number;
  validationStatus: ModelValidationStatus;
}

export const CLINICAL_PREDICATES = [
  { key: 'tau_w', label: 'IJV shear margin' },
  { key: 'ared', label: 'ARED load margin' },
  { key: 'sclerostin', label: 'Sclerostin margin' },
  { key: 'rmssd', label: 'HRV margin' },
  { key: 'sans', label: 'Ocular / SANS margin' },
] as const;

export function clinicalDataMode(packet: TelemetryPacket): ClinicalDataMode {
  if (packet.is_local_simulation) return 'LOCAL_PREVIEW';
  if (packet.provenance_manifest.scenario_overlay_mode !== 'NONE_PURE_REPLAY' ||
      packet.provenance_manifest.biometrics_source === 'SIMULATED_SCENARIO_INPUT') return 'BACKEND_SCENARIO';
  return packet.provenance_manifest.biometrics_source === 'HARDWARE_WEARABLE'
    ? 'BACKEND_HARDWARE' : 'BACKEND_REPLAY';
}

/** Display adapter: no fallback to scenario.ts, no physiological imputation. */
export function buildClinicalViewModel(packet: TelemetryPacket) {
  const mode = clinicalDataMode(packet);
  const metric = <U extends string>(raw: number | null | undefined, unit: U, provenance: DataOrigin): ClinicalMetric<U> => {
    const value = provenance !== 'UNAVAILABLE' && typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    return { value, unit, availability: value === null ? 'UNAVAILABLE' : 'AVAILABLE',
      reason: value === null ? 'Not supplied or not assessable for this source' : null,
      provenance, sourceRecordId: packet.source_record_id, timestampMs: packet.timestamp_ms,
      validationStatus: packet.model_validation_status ?? 'ILLUSTRATIVE_UNVALIDATED' };
  };
  const h = packet.hemodynamics, m = packet.musculoskeletal, e = packet.environment;
  const modelOrigin = packet.safety_margins.provenance;
  return {
    mode,
    source: packet.provenance_manifest.biometrics_source,
    mri: metric(packet.safety_margins.mission_readiness_index, '%', modelOrigin),
    rhoGlobal: metric(packet.safety_margins.med_stl_rho_robustness, 'rho', modelOrigin),
    predicates: CLINICAL_PREDICATES.map(p => ({ ...p,
      metric: metric(packet.safety_margins.per_predicate_rho?.[p.key], 'rho', modelOrigin) })),
    cabinO2: metric(e?.cabin_o2_kpa, 'kPa', e?.provenance ?? 'UNAVAILABLE'),
    cabinCo2: metric(e?.cabin_ppco2_mmhg, 'mmHg', e?.provenance ?? 'UNAVAILABLE'),
    radiationDose: metric(packet.biometrics.radiation_dose_rate_msv_d, 'mSv/d', packet.provenance_manifest.biometrics_source),
    cumulativeRadiation: metric(e?.cumulative_radiation_mgy, 'mGy', e?.provenance ?? 'UNAVAILABLE'),
    hrvRmssd: metric(packet.biometrics.hrv_rmssd_ms, 'ms', packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : packet.provenance_manifest.biometrics_source),
    sqi: metric(packet.biometrics.sqi_score, 'ratio', packet.provenance_manifest.biometrics_source),
    ijvCsa: metric(h?.ijv_csa_cm2, 'cm2', h?.provenance ?? 'UNAVAILABLE'),
    ijvVelocity: metric(h?.ijv_velocity_max_cm_s, 'cm/s', h?.provenance ?? 'UNAVAILABLE'),
    ijvShear: metric(h?.wall_shear_stress_dyn_cm2, 'dyn/cm2', h?.provenance ?? 'UNAVAILABLE'),
    onsd: metric(h?.onsd_mm, 'mm', h?.provenance ?? 'UNAVAILABLE'),
    aredLoad: metric(m?.ared_daily_load_kgf, 'kgf', m?.provenance ?? 'UNAVAILABLE'),
    renalRsr: metric(packet.renal_nephrolithiasis?.rsr_calcium_oxalate, 'ratio', 'DERIVED_COMPUTED'),
    renalColic: metric(packet.renal_nephrolithiasis?.renal_colic_risk_index, 'index', 'DERIVED_COMPUTED'),
    sclerostin: metric(m?.sclerostin_pmol_l, 'pmol/L', m?.provenance ?? 'UNAVAILABLE'),
    urinaryCalcium: metric(m?.urinary_calcium_mg_d, 'mg/d', m?.provenance ?? 'UNAVAILABLE'),
    boneLoss: metric(m?.bmd_loss_pct_per_month, '% / month', m?.provenance ?? 'UNAVAILABLE'),
  };
}

export function clinicalSourceLabel(packet: TelemetryPacket): string {
  const labels: Record<ClinicalDataMode, string> = {
    BACKEND_REPLAY: 'RECORDED TELEMETRY', BACKEND_HARDWARE: 'HARDWARE TELEMETRY',
    BACKEND_SCENARIO: 'SCENARIO OVERLAY', LOCAL_PREVIEW: 'LOCAL SCENARIO PREVIEW',
  };
  return labels[clinicalDataMode(packet)];
}

export function biometricsDataOrigin(packet: TelemetryPacket): DataOrigin {
  return packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : packet.provenance_manifest.biometrics_source;
}
