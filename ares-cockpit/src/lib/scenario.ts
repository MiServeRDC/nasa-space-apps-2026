// Local deterministic What-If scenario model.
// Every value produced here is SIMULATED_SCENARIO_INPUT or DERIVED_COMPUTED and is labelled as such in the UI.
// It is a front-end preview only: the authoritative evaluators live in crates/ares-causal-graph and crates/ares-nqs-stl.

import type { AlarmLevel, TelemetryPacket } from '../types/telemetry';

export const BLOOD_VISCOSITY_POISE = 0.035;
export const LBNP_SBP_DROP_LIMIT_MMHG = 15;
export const LBNP_HR_LIMIT_BPM = 115;

export interface WhatIf {
  ppco2_mmhg: number;   // cabin CO2 partial pressure, mmHg
  ared_load_pct: number; // ARED resistive load, % of body-weight-equivalent target
  lbnp_mmhg: number;    // lower body negative pressure, 0 .. -50 mmHg
  mission_day: number;  // mission elapsed day
}

export const DEFAULT_WHATIF: WhatIf = { ppco2_mmhg: 2.5, ared_load_pct: 60, lbnp_mmhg: 0, mission_day: 184 };

/** Endothelial wall shear stress tau_w = 2 mu v_max sqrt(pi / CSA), dyn/cm^2 (experienceLog Entry 001). */
export function wallShearStress(vMaxCmS: number, csaCm2: number): number {
  return 2 * BLOOD_VISCOSITY_POISE * vMaxCmS * Math.sqrt(Math.PI / csaCm2);
}

/** NQS-STL normalized predicate in (-inf, +1] (experienceLog Entry 004). sign = +1 when higher is safer. */
export function nqs(x: number, nominal: number, critical: number): number {
  const s = nominal >= critical ? 1 : -1;
  return Math.min(1, (s * (x - critical)) / Math.abs(nominal - critical));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ScenarioState {
  hr: number;
  sbp: number;
  sbpBaseline: number;
  spo2: number;
  resp: number;
  csa: number;
  vmax: number;
  tauW: number;
  soleusMm: number;
  boneResorptionPct: number;
  onsdMm: number;
  rho: Record<'tau_w' | 'hr' | 'spo2' | 'soleus' | 'ppco2' | 'onsd', number>;
  rhoMin: number;
  mri: number;
  sigma: number;
}

/** Deterministic physiological state for a given What-If configuration (no noise: pure function of inputs). */
export function evaluate(w: WhatIf): ScenarioState {
  const day = w.mission_day;
  const lbnp = Math.abs(w.lbnp_mmhg);
  const decon = 1 - Math.exp(-day / 220); // 0 .. 1 adaptation to microgravity
  const aredProtect = clamp(w.ared_load_pct / 100, 0, 1.5);

  // Cephalad fluid shift: IJV distends and slows; LBNP pulls volume caudally.
  const csa = clamp(0.9 + 1.4 * decon - 0.025 * lbnp, 0.3, 5.5);
  const vmax = clamp(22 - 15 * decon + 0.3 * lbnp, 1, 90);
  const tauW = wallShearStress(vmax, csa);

  const sbpBaseline = 118 - 6 * decon;
  const sbp = sbpBaseline - lbnp * (0.35 + 0.35 * decon);
  const hr = 66 + 6 * decon + lbnp * (0.6 + 0.9 * decon) + 4 * Math.max(0, w.ppco2_mmhg - 3);
  const spo2 = clamp(98.5 - 0.6 * Math.max(0, w.ppco2_mmhg - 3), 85, 100);
  const resp = 14 + 1.8 * Math.max(0, w.ppco2_mmhg - 2.5);

  const soleusMm = clamp(16 - 5 * decon * (1 - 0.6 * Math.min(aredProtect, 1)), 5, 25);
  const boneResorptionPct = clamp(1.6 * decon * (1.2 - 0.8 * Math.min(aredProtect, 1)), 0, 5);
  const onsdMm = 5.0 + 1.1 * decon + 0.15 * Math.max(0, w.ppco2_mmhg - 3) - 0.01 * lbnp;

  const rho = {
    tau_w: nqs(tauW, 2.0, 0.5),
    hr: nqs(hr, 70, LBNP_HR_LIMIT_BPM),
    spo2: nqs(spo2, 98, 90),
    soleus: nqs(soleusMm, 16, 11),
    ppco2: nqs(w.ppco2_mmhg, 2.0, 4.0),
    onsd: nqs(onsdMm, 5.0, 6.2),
  };
  const values = Object.values(rho);
  const rhoMin = Math.min(...values);
  const mean = values.reduce((a, b) => a + clamp(b, -1, 1), 0) / values.length;
  const mri = clamp(Math.round(100 * (0.6 * (1 + mean) / 2 + 0.4 * clamp(rhoMin, 0, 1))), 0, 100);
  const sigma = 0.04 + 0.08 * decon; // Bayesian POCUS observer uncertainty grows without fresh scans

  return { hr, sbp, sbpBaseline, spo2, resp, csa, vmax, tauW, soleusMm, boneResorptionPct, onsdMm, rho, rhoMin, mri, sigma };
}

export function alarmFor(rhoMin: number | null): AlarmLevel {
  if (rhoMin === null) return 'DATA_DEGRADED_MISSING_CHANNELS';
  if (rhoMin < 0) return 'CRITICAL';
  if (rhoMin < 0.2) return 'WARNING';
  if (rhoMin < 0.4) return 'ADVISORY';
  return 'NOMINAL';
}

/** Forward projection of rho_min with current countermeasures held constant; first day below 0, capped at 100. */
export function timeToViolationDays(w: WhatIf): number | null {
  for (let k = 0; k <= 100; k++) {
    if (evaluate({ ...w, mission_day: w.mission_day + k }).rhoMin < 0) return k;
  }
  return null;
}

export function buildPacket(w: WhatIf, tick: number, thrombusConfirmed: boolean | null): TelemetryPacket {
  const s = evaluate(w);
  const ttv = timeToViolationDays(w);
  return {
    timestamp_ms: Date.now(),
    relative_recording_time_s: tick / 20,
    source_record_id: `SIM-SCENARIO-MARS-${Math.round(w.mission_day)}`,
    mission_elapsed_days: w.mission_day,
    astronaut_id: 'ASTRO-01',
    provenance_manifest: {
      biometrics_source: 'SIMULATED_SCENARIO_INPUT',
      biometrics_native_rate_hz: 20,
      ui_refresh_rate_hz: 20,
      scenario_overlay_mode: 'SIMULATED_WHATIF_SCENARIO',
    },
    biometrics: {
      heart_rate_bpm: s.hr,
      pulse_rate_bpm: s.hr,
      respiration_rate_brpm: s.resp,
      spo2_percent: s.spo2,
      rr_interval_ms: null,
      hrv_rmssd_ms: null,
      core_temp_celsius: null,
      missing_channels: [],
    },
    hemodynamics: {
      provenance: 'DERIVED_COMPUTED',
      ijv_csa_cm2: s.csa,
      ijv_velocity_max_cm_s: s.vmax,
      wall_shear_stress_dyn_cm2: s.tauW,
      pocus_thrombus_confirmed: thrombusConfirmed,
      thrombosis_risk_score: clamp(1 - (s.rho.tau_w + 1) / 2, 0, 1),
    },
    musculoskeletal: {
      provenance: 'DERIVED_COMPUTED',
      soleus_thickness_mm: s.soleusMm,
      pennation_angle_deg: clamp(12 + (s.soleusMm - 11), 8, 35),
      bone_resorption_rate_pct: s.boneResorptionPct,
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
      mission_readiness_index: s.mri,
      alarm_level: alarmFor(s.rhoMin),
    },
    active_playbook: null,
  };
}
