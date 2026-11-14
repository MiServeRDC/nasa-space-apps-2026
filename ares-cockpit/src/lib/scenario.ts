// Local deterministic What-If scenario model (front-end preview).
// Every value produced here is SIMULATED_SCENARIO_INPUT or DERIVED_COMPUTED and is labelled as such in the UI.
// The authoritative evaluators live in crates/ares-causal-graph and crates/ares-nqs-stl.

import type { AlarmLevel, TelemetryPacket } from '../types/telemetry';
import { deriveOfflineActivePlaybook } from './playbookCatalog';

export const BLOOD_VISCOSITY_POISE = 0.035;
export const LBNP_SBP_DROP_LIMIT_MMHG = 15;
export const SQI_REJECT_THRESHOLD = 0.6;

export type CrewSex = 'MALE' | 'FEMALE';

export interface SexThresholds {
  sbpBase: number;
  hrBase: number;
  hrLimit: number;
  lbnpSbpSens: number;
  ijvBaseCsa: number;
  ijvCriticalCsa: number;
  tauWNominal: number;
  tauWCritical: number;
  vmaxCritical: number;
  onsdNominal: number;
  onsdCritical: number;
  ppco2Nominal: number;
  ppco2Critical: number;
  soleusNominal: number;
  soleusCritical: number;
  sclerostinNominal: number;
  sclerostinCritical: number;
  gaiNominal: number;
  gaiCritical: number;
  spo2Nominal: number;
  spo2Critical: number;
}

/** Sex-specific anthropometric baselines and clinical thresholds (NASA HRP / NASA-STD-3001). */
export const SEX_PROFILES: Record<CrewSex, SexThresholds> = {
  MALE: {
    sbpBase: 120,
    hrBase: 66,
    hrLimit: 115,
    lbnpSbpSens: 1.0,
    ijvBaseCsa: 0.75,
    ijvCriticalCsa: 2.5,
    tauWNominal: 8.0,
    tauWCritical: 4.0,
    vmaxCritical: 5.0,
    onsdNominal: 5.0,
    onsdCritical: 5.8,
    ppco2Nominal: 2.0,
    ppco2Critical: 4.0,
    soleusNominal: 16.0,
    soleusCritical: 12.0,
    sclerostinNominal: 30,
    sclerostinCritical: 50,
    gaiNominal: 2,
    gaiCritical: 10,
    spo2Nominal: 98,
    spo2Critical: 90,
  },
  FEMALE: {
    sbpBase: 112,
    hrBase: 72,
    hrLimit: 120,
    lbnpSbpSens: 1.18, // higher orthostatic intolerance sensitivity under LBNP
    ijvBaseCsa: 0.62,
    ijvCriticalCsa: 2.2,
    tauWNominal: 8.5,
    tauWCritical: 4.2,
    vmaxCritical: 5.0,
    onsdNominal: 4.8,
    onsdCritical: 5.5,
    ppco2Nominal: 2.0,
    ppco2Critical: 4.0,
    soleusNominal: 14.0,
    soleusCritical: 10.5,
    sclerostinNominal: 26,
    sclerostinCritical: 44,
    gaiNominal: 2,
    gaiCritical: 10,
    spo2Nominal: 98,
    spo2Critical: 90,
  },
};

export interface WhatIf {
  sex: CrewSex;           // biological sex for anthropometric & threshold scaling
  ppco2_mmhg: number;     // cabin CO2 partial pressure, mmHg
  ared_load_pct: number;  // ARED resistive load, % of prescribed target
  lbnp_mmhg: number;      // lower body negative pressure, 0 .. -50 mmHg
  mission_day: number;    // mission elapsed day
  artifact_level: number; // 0..1 sensor contamination (sweat, ECLSS fan vibration, motion)
}

export const DEFAULT_WHATIF: WhatIf = {
  sex: 'MALE',
  ppco2_mmhg: 2.5,
  ared_load_pct: 60,
  lbnp_mmhg: 0,
  mission_day: 60,
  artifact_level: 0.1,
};

/** Endothelial wall shear stress tau_w = 2 mu v_max sqrt(pi / CSA), dyn/cm^2 (experienceLog Entry 001). */
export function wallShearStress(vMaxCmS: number, csaCm2: number): number {
  return 2 * BLOOD_VISCOSITY_POISE * vMaxCmS * Math.sqrt(Math.PI / csaCm2);
}

/** NQS-STL normalized predicate in (-inf, +1] (experienceLog Entry 004). */
export function nqs(x: number, nominal: number, critical: number): number {
  const s = nominal >= critical ? 1 : -1;
  return Math.min(1, (s * (x - critical)) / Math.abs(nominal - critical));
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type PredicateKey = 'tau_w' | 'onsd' | 'ppco2' | 'soleus' | 'sclerostin' | 'gai' | 'hr' | 'spo2';

export interface ScenarioState {
  decon: number;
  hr: number; sbp: number; sbpBaseline: number; spo2: number; resp: number;
  sqi: number; hrAccepted: boolean;
  csa: number; vmax: number; tauW: number;
  onsdMm: number; onsdSigmaMm: number; daysSinceScan: number;
  soleusMm: number; soleusLossPct: number; irisin: number; sclerostin: number;
  bmdLossPct: number; gaiPct: number;
  rho: Record<PredicateKey, number>;
  worst: PredicateKey;
  rhoMin: number; mri: number; sigma: number;
}

/** Deterministic physiological state for a given What-If configuration. */
export function evaluate(w: WhatIf, lastScanDay: number = w.mission_day): ScenarioState {
  const P = SEX_PROFILES[w.sex];
  const day = w.mission_day;
  const lbnp = Math.abs(w.lbnp_mmhg);
  const decon = 1 - Math.exp(-day / 220);
  const ared = clamp(w.ared_load_pct / 100, 0, 1.5);
  const aredEff = Math.min(ared, 1);

  // 1. Cephalad fluid shift (~2 L): IJV distends and slows. LBNP pulls volume caudally.
  const csa = clamp(P.ijvBaseCsa + 1.55 * decon - 0.03 * lbnp, 0.3, 5.5);
  const vmax = clamp(50 - 38 * decon + 0.6 * lbnp, 1, 90);
  const tauW = wallShearStress(vmax, csa);

  // 2. Cardiovascular response (sex-adjusted baseline & orthostatic sensitivity).
  const sbpBaseline = P.sbpBase - 6 * decon;
  const sbp = sbpBaseline - lbnp * (0.25 + 0.2 * decon) * P.lbnpSbpSens;
  const hr = P.hrBase + 6 * decon + lbnp * (0.4 + 0.5 * decon) * P.lbnpSbpSens + 4 * Math.max(0, w.ppco2_mmhg - 3);
  const spo2 = clamp(98.5 - 0.6 * Math.max(0, w.ppco2_mmhg - 3), 85, 100);
  const resp = 14 + 1.8 * Math.max(0, w.ppco2_mmhg - 2.5);

  // 3. Signal quality (spectral SQI): contaminated samples are rejected before any diagnosis.
  const sqi = clamp(0.97 - 0.6 * w.artifact_level, 0, 1);
  const hrAccepted = sqi >= SQI_REJECT_THRESHOLD;

  // 4. SANS: cabin ppCO2 + jugular stasis -> optic nerve sheath distension.
  const onsdMm = P.onsdNominal - 0.1 + 0.8 * decon + 0.35 * Math.max(0, w.ppco2_mmhg - 2.5) + 0.25 * Math.max(0, csa - 1.5) - 0.008 * lbnp;
  const daysSinceScan = Math.max(0, day - lastScanDay);
  const onsdSigmaMm = 0.02 + 0.03 * daysSinceScan;

  // 5. Muscle-bone axis: soleus -1.5 %/month unloaded, irisin down, sclerostin up, BMD loss.
  const soleusLossPct = clamp(1.5 * (day / 30) * (1 - 0.7 * aredEff), 0, 50);
  const soleusMm = P.soleusNominal * (1 - soleusLossPct / 100);
  const irisin = clamp(4.5 - 0.12 * soleusLossPct, 0.5, 6);
  const sclerostin = P.sclerostinNominal * (1 + 1.0 * decon * (1 - 0.6 * aredEff)) * Math.sqrt(4.5 / irisin);
  const bmdLossPct = clamp((day / 30) * 0.9 * clamp(sclerostin / P.sclerostinNominal - 0.7, 0, 3), 0, 30);
  const gaiPct = P.gaiNominal + 0.6 * soleusLossPct;

  const rho: Record<PredicateKey, number> = {
    tau_w: nqs(tauW, P.tauWNominal, P.tauWCritical),
    onsd: nqs(onsdMm, P.onsdNominal, P.onsdCritical),
    ppco2: nqs(w.ppco2_mmhg, P.ppco2Nominal, P.ppco2Critical),
    soleus: nqs(soleusMm, P.soleusNominal, P.soleusCritical),
    sclerostin: nqs(sclerostin, P.sclerostinNominal, P.sclerostinCritical),
    gai: nqs(gaiPct, P.gaiNominal, P.gaiCritical),
    hr: nqs(hr, P.hrBase + 4, P.hrLimit),
    spo2: nqs(spo2, P.spo2Nominal, P.spo2Critical),
  };
  const entries = Object.entries(rho) as [PredicateKey, number][];
  const [worst, rhoMin] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  const mean = entries.reduce((a, [, v]) => a + clamp(v, -1, 1), 0) / entries.length;
  const mri = clamp(Math.round(100 * (0.6 * (1 + mean) / 2 + 0.4 * clamp(rhoMin, 0, 1))), 0, 100);
  const sigma = 0.03 + 0.012 * daysSinceScan;

  return {
    decon, hr, sbp, sbpBaseline, spo2, resp, sqi, hrAccepted, csa, vmax, tauW,
    onsdMm, onsdSigmaMm, daysSinceScan, soleusMm, soleusLossPct, irisin, sclerostin, bmdLossPct, gaiPct,
    rho, worst, rhoMin, mri, sigma,
  };
}

export function alarmFor(rhoMin: number | null): AlarmLevel {
  if (rhoMin === null) return 'DATA_DEGRADED_MISSING_CHANNELS';
  if (rhoMin < 0) return 'CRITICAL';
  if (rhoMin < 0.2) return 'WARNING';
  if (rhoMin < 0.4) return 'ADVISORY';
  return 'NOMINAL';
}

/** Forward projection of rho_min with countermeasures held constant; first day below 0, capped at 100. */
export function timeToViolationDays(w: WhatIf, lastScanDay: number): number | null {
  for (let k = 0; k <= 100; k++) {
    if (evaluate({ ...w, mission_day: w.mission_day + k }, lastScanDay).rhoMin < 0) return k;
  }
  return null;
}

export function buildPacket(w: WhatIf, tick: number, thrombus: boolean | null, lastScanDay: number): TelemetryPacket {
  const s = evaluate(w, lastScanDay);
  const P = SEX_PROFILES[w.sex];
  const ttv = timeToViolationDays(w, lastScanDay);

  const sansStress = clamp((1 - s.rho.onsd) / 2, 0, 1);
  const ijvStress = clamp((1 - s.rho.tau_w) / 2, 0, 1);
  const soleusStress = clamp((1 - Math.min(s.rho.soleus, s.rho.sclerostin)) / 2, 0, 1);
  const heartStress = s.hrAccepted ? clamp((s.hr - P.hrBase) / (P.hrLimit - P.hrBase), 0, 1) : 0;
  const cnsStress = clamp((w.ppco2_mmhg - P.ppco2Nominal) / (P.ppco2Critical - P.ppco2Nominal), 0, 1);

  const spatialCells = [
    {
      region: 'EyeOcularSans',
      key: 'eye_ocular_sans',
      uberon_curie: 'UBERON:0000970',
      centroid: [0.0, 0.82, 0.05] as [number, number, number],
      local_intensity: sansStress,
      propagated_intensity: clamp(Math.max(sansStress, 0.4 * ijvStress), 0, 1),
      observed: true,
    },
    {
      region: 'InternalJugularVein',
      key: 'internal_jugular_vein',
      uberon_curie: 'UBERON:0001586',
      centroid: [-0.06, 0.62, 0.04] as [number, number, number],
      local_intensity: ijvStress,
      propagated_intensity: clamp(Math.max(ijvStress, 0.55 * heartStress), 0, 1),
      observed: true,
    },
    {
      region: 'HeartCardioAutonomic',
      key: 'heart_cardio_autonomic',
      uberon_curie: 'UBERON:0000948',
      centroid: [0.0, 0.3, 0.02] as [number, number, number],
      local_intensity: heartStress,
      propagated_intensity: clamp(Math.max(heartStress, 0.3 * soleusStress, 0.3 * cnsStress), 0, 1),
      observed: s.hrAccepted,
    },
    {
      region: 'SoleusCalcaneus',
      key: 'soleus_calcaneus',
      uberon_curie: 'UBERON:0001389',
      centroid: [0.0, -0.65, -0.03] as [number, number, number],
      local_intensity: soleusStress,
      propagated_intensity: soleusStress,
      observed: true,
    },
    {
      region: 'BrainVestibularCns',
      key: 'brain_vestibular_cns',
      uberon_curie: 'UBERON:0000955',
      centroid: [0.0, 0.9, -0.02] as [number, number, number],
      local_intensity: cnsStress,
      propagated_intensity: clamp(Math.max(cnsStress, 0.35 * ijvStress, 0.25 * soleusStress), 0, 1),
      observed: true,
    },
  ];
  const hottestCell = spatialCells.reduce((best, cur) =>
    cur.propagated_intensity > best.propagated_intensity ? cur : best,
  );

  const activePlaybook = deriveOfflineActivePlaybook({
    rhoTauW: s.rho.tau_w,
    rhoSans: s.rho.onsd,
    gaiPct: s.gaiPct,
    thrombusConfirmed: thrombus,
    radiationDoseRateMsvD: 0.5,
    lbnpMmhg: w.lbnp_mmhg,
    hrBpm: s.hrAccepted ? s.hr : null,
    sbpDropMmhg: s.sbpBaseline - s.sbp,
  });

  const qSpreadHr = 4.5 + s.sigma * 12;
  const qSpreadResp = 1.6 + s.sigma * 4;

  return {
    timestamp_ms: Date.now(),
    relative_recording_time_s: tick / 20,
    source_record_id: `SIM-SCENARIO-MARS-${Math.round(w.mission_day)}`,
    mission_elapsed_days: w.mission_day,
    astronaut_id: w.sex === 'FEMALE' ? 'ASTRO-02' : 'ASTRO-01',
    model_validation_status: 'ILLUSTRATIVE_UNVALIDATED',
    provenance_manifest: {
      biometrics_source: 'SIMULATED_SCENARIO_INPUT',
      biometrics_native_rate_hz: 20,
      ui_refresh_rate_hz: 20,
      scenario_overlay_mode: 'SIMULATED_WHATIF_SCENARIO',
      dataset_provenance: 'LOCAL_WHATIF_SIMULATOR',
      manifest_sha256_verified: false,
    },
    biometrics: {
      heart_rate_bpm: s.hrAccepted ? s.hr : null,
      pulse_rate_bpm: s.hrAccepted ? s.hr : null,
      respiration_rate_brpm: s.resp,
      spo2_percent: s.spo2,
      rr_interval_ms: null,
      hrv_rmssd_ms: null,
      hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
      core_temp_celsius: null,
      sqi_score: s.sqi,
      missing_channels: s.hrAccepted ? ['rr_interval_ms', 'hrv_rmssd_ms'] : ['heart_rate_bpm', 'pulse_rate_bpm', 'rr_interval_ms', 'hrv_rmssd_ms'],
      quality_flags: s.hrAccepted
        ? ['LOCAL_OFFLINE_SIMULATION', 'BEAT_INTERVALS_NOT_AVAILABLE']
        : ['LOCAL_OFFLINE_SIMULATION', 'SQI_REJECTED', 'BEAT_INTERVALS_NOT_AVAILABLE'],
    },
    hemodynamics: {
      provenance: 'DERIVED_COMPUTED',
      ijv_csa_cm2: s.csa,
      ijv_velocity_max_cm_s: s.vmax,
      wall_shear_stress_dyn_cm2: s.tauW,
      pocus_thrombus_confirmed: thrombus,
      thrombosis_risk_score: clamp(1 - (s.rho.tau_w + 1) / 2, 0, 1),
    },
    musculoskeletal: {
      provenance: 'DERIVED_COMPUTED',
      soleus_thickness_mm: s.soleusMm,
      pennation_angle_deg: clamp(12 + (s.soleusMm - 11), 8, 35),
      bone_resorption_rate_pct: clamp(0.9 * (s.sclerostin / P.sclerostinNominal - 0.7), 0, 5),
      mechanotransductive_index: clamp(w.ared_load_pct / 100, 0, 1),
    },
    environment: {
      provenance: 'SIMULATED_SCENARIO_INPUT',
      cabin_co2_ppm: clamp(w.ppco2_mmhg * 1316, 300, 10000),
      cabin_o2_kpa: 21.0,
      ambient_radiation_rate_ugy_h: 20.8,
      cumulative_radiation_mgy: clamp(w.mission_day * 0.5, 0, 2000),
    },
    safety_margins: {
      provenance: 'DERIVED_FROM_HYBRID_SCENARIO',
      med_stl_rho_robustness: s.rhoMin,
      time_to_violation_days: ttv,
      ttv_most_likely_days: ttv,
      ttv_horizon_days: 100,
      ttv_no_crossing_within_horizon: ttv === null,
      ttv_interval_kind: ttv !== null ? 'ILLUSTRATIVE_SCENARIO_RANGE' : undefined,
      mission_readiness_index: s.mri,
      alarm_level: s.hrAccepted ? alarmFor(s.rhoMin) : 'DATA_DEGRADED_MISSING_CHANNELS',
      per_predicate_rho: { ...s.rho },
    },
    active_playbook: activePlaybook,
    hypergraph_spatial: {
      hottest_region: hottestCell.region,
      cells: spatialCells,
      habitat_zone: w.lbnp_mmhg < 0 ? 'LBNP_CHAMBER' : w.ared_load_pct > 50 ? 'ARED_EXERCISE_BAY' : 'SLEEP_QUARTERS',
      violates_policy: false,
      rho_current_location: s.rhoMin,
      biokg_clause: null,
    },
    timestral_quantiles: {
      model_validation_status: 'ILLUSTRATIVE_UNVALIDATED',
      confidence_state: 'ABSTAINED_FALLBACK_DETERMINISTIC',
      conformal_status: 'ABSTAINED_FALLBACK_DETERMINISTIC',
      forecast_method: 'HYBRID_TIMESTRAL_AND_EWMA_SHORT_HORIZON',
      ewma_short_horizon_max_s: 120,
      abstention_certificate: {
        abstained: true,
        status: 'ABSTAINED_FALLBACK_DETERMINISTIC',
        reason: 'LOCAL_WHATIF_SIMULATOR_NO_CONFORMAL_CALIBRATION_AND_NO_RR_INTERVALS',
        empirical_coverage_error: 0,
        adaptive_alpha_t: 0.1,
        interval_width: qSpreadHr * 2,
        sqi_score: s.sqi,
        missing_ratio: s.hrAccepted ? 0.25 : 0.5,
        timestamp_s: tick / 20,
      },
      short_horizon_s: 900,
      heart_rate_bpm_cone: s.hrAccepted
        ? { q05: s.hr - qSpreadHr, q50: s.hr, q95: s.hr + qSpreadHr }
        : null,
      resp_rate_brpm_cone: {
        q05: Math.max(4, s.resp - qSpreadResp),
        q50: s.resp,
        q95: s.resp + qSpreadResp,
      },
      rmssd_ms_cone: null,
      rho_global_cone: null,
      ttv_hours_cone: null,
      channel_cones: [
        ...(s.hrAccepted
          ? [
              {
                channel_name: 'hr_bpm',
                horizon_15m: { q05: s.hr - qSpreadHr * 0.4, q50: s.hr, q95: s.hr + qSpreadHr * 0.4 },
                horizon_1h: { q05: s.hr - qSpreadHr * 0.7, q50: s.hr, q95: s.hr + qSpreadHr * 0.7 },
                horizon_6h: { q05: s.hr - qSpreadHr, q50: s.hr, q95: s.hr + qSpreadHr },
                horizon_24h: { q05: s.hr - qSpreadHr * 1.3, q50: s.hr, q95: s.hr + qSpreadHr * 1.3 },
              },
            ]
          : []),
        {
          channel_name: 'resp_brpm',
          horizon_15m: { q05: Math.max(4, s.resp - qSpreadResp * 0.4), q50: s.resp, q95: s.resp + qSpreadResp * 0.4 },
          horizon_1h: { q05: Math.max(4, s.resp - qSpreadResp * 0.7), q50: s.resp, q95: s.resp + qSpreadResp * 0.7 },
          horizon_6h: { q05: Math.max(4, s.resp - qSpreadResp), q50: s.resp, q95: s.resp + qSpreadResp },
          horizon_24h: { q05: Math.max(4, s.resp - qSpreadResp * 1.3), q50: s.resp, q95: s.resp + qSpreadResp * 1.3 },
        },
      ],
      short_horizon_cones: [
        ...(s.hrAccepted
          ? [
              {
                channel_name: 'hr_bpm',
                ewma_level: s.hr,
                horizon_5s: { q05: s.hr - 1.5, q50: s.hr, q95: s.hr + 1.5 },
                horizon_10s: { q05: s.hr - 2.2, q50: s.hr, q95: s.hr + 2.2 },
                horizon_30s: { q05: s.hr - 3.6, q50: s.hr, q95: s.hr + 3.6 },
                horizon_60s: { q05: s.hr - 5.0, q50: s.hr, q95: s.hr + 5.0 },
                horizon_120s: { q05: s.hr - 6.8, q50: s.hr, q95: s.hr + 6.8 },
              },
            ]
          : []),
        {
          channel_name: 'resp_brpm',
          ewma_level: s.resp,
          horizon_5s: { q05: Math.max(4, s.resp - 0.6), q50: s.resp, q95: s.resp + 0.6 },
          horizon_10s: { q05: Math.max(4, s.resp - 0.9), q50: s.resp, q95: s.resp + 0.9 },
          horizon_30s: { q05: Math.max(4, s.resp - 1.4), q50: s.resp, q95: s.resp + 1.4 },
          horizon_60s: { q05: Math.max(4, s.resp - 2.0), q50: s.resp, q95: s.resp + 2.0 },
          horizon_120s: { q05: Math.max(4, s.resp - 2.8), q50: s.resp, q95: s.resp + 2.8 },
        },
      ],
      short_horizon_abstention: 'LOCAL_WHATIF_UNCONFORMALIZED_EWMA_PREVIEW',
      ttv_q05_days: null,
      ttv_q50_days: null,
      ttv_q95_days: null,
    },
    vitals_anomaly: null,
    quality_flags: s.hrAccepted
      ? ['LOCAL_OFFLINE_SIMULATION', 'BEAT_INTERVALS_NOT_AVAILABLE']
      : ['LOCAL_OFFLINE_SIMULATION', 'SQI_REJECTED', 'BEAT_INTERVALS_NOT_AVAILABLE'],
    is_local_simulation: true,
  };
}
