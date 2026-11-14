// TypeScript mirror of contracts/telemetry_schema.json (single source of truth).
// Nullable channels stay `number | null`: missing samples are NEVER coerced to 0 (experienceLog Entry 006).

export type BiometricsSource =
  | 'RECORDED_TERRESTRIAL_BIDMC_CSV'
  | 'RECORDED_TERRESTRIAL_WAVEFORM'
  | 'SIMULATED_SCENARIO_INPUT';

export type ChannelProvenance = 'SIMULATED_SCENARIO_INPUT' | 'DERIVED_COMPUTED' | 'UNAVAILABLE';

export type AlarmLevel = 'NOMINAL' | 'ADVISORY' | 'WARNING' | 'CRITICAL' | 'DATA_DEGRADED_MISSING_CHANNELS';

export interface ProvenanceManifest {
  biometrics_source: BiometricsSource;
  biometrics_native_rate_hz: number;
  ui_refresh_rate_hz: number;
  scenario_overlay_mode: 'NONE_PURE_REPLAY' | 'SIMULATED_WHATIF_SCENARIO';
}

export interface Biometrics {
  heart_rate_bpm: number | null;
  pulse_rate_bpm: number | null;
  respiration_rate_brpm: number | null;
  spo2_percent: number | null;
  rr_interval_ms?: number | null;
  hrv_rmssd_ms?: number | null;
  core_temp_celsius?: number | null;
  missing_channels?: string[];
}

export interface Hemodynamics {
  provenance: ChannelProvenance;
  ijv_csa_cm2: number | null;
  ijv_velocity_max_cm_s: number | null;
  wall_shear_stress_dyn_cm2: number | null;
  pocus_thrombus_confirmed: boolean | null;
  thrombosis_risk_score: number | null;
}

export interface Musculoskeletal {
  provenance: ChannelProvenance;
  soleus_thickness_mm: number | null;
  pennation_angle_deg: number | null;
  bone_resorption_rate_pct: number | null;
  mechanotransductive_index: number | null;
}

export interface Environment {
  provenance: 'SIMULATED_SCENARIO_INPUT' | 'UNAVAILABLE';
  cabin_co2_ppm: number | null;
  cabin_o2_kpa: number | null;
  ambient_radiation_rate_ugy_h: number | null;
  cumulative_radiation_mgy: number | null;
}

export interface SafetyMargins {
  provenance: 'DERIVED_FROM_RECORDED_BIDMC' | 'DERIVED_FROM_HYBRID_SCENARIO';
  med_stl_rho_robustness: number | null;
  time_to_violation_days?: number | null;
  mission_readiness_index: number | null;
  alarm_level: AlarmLevel;
}

export interface ActivePlaybook {
  playbook_id: string;
  current_step: number;
  total_steps: number;
  step_instruction: string;
}

export interface TelemetryPacket {
  timestamp_ms: number;
  relative_recording_time_s: number;
  source_record_id: string;
  mission_elapsed_days?: number | null;
  astronaut_id: string;
  provenance_manifest: ProvenanceManifest;
  biometrics: Biometrics;
  hemodynamics?: Hemodynamics | null;
  musculoskeletal?: Musculoskeletal | null;
  environment?: Environment | null;
  safety_margins: SafetyMargins;
  active_playbook?: ActivePlaybook | null;
}
