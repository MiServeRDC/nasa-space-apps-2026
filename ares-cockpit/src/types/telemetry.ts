// TypeScript contract aligned with contracts/telemetry_schema.json and ares-server-cli snapshots.
// Nullable channels stay `number | null`: missing samples are NEVER coerced to 0 (experienceLog Entry 006).

export type BiometricsSource =
  | 'RECORDED_TERRESTRIAL_BIDMC_CSV'
  | 'RECORDED_TERRESTRIAL_WAVEFORM'
  | 'SIMULATED_SCENARIO_INPUT';

export type ScenarioOverlayMode =
  | 'NONE_PURE_REPLAY'
  | 'SIMULATED_WHATIF_SCENARIO'
  | 'DERIVED_AND_SIMULATED';

export type ChannelProvenance = 'SIMULATED_SCENARIO_INPUT' | 'DERIVED_COMPUTED' | 'UNAVAILABLE';

export type DataOrigin =
  | 'RECORDED_TERRESTRIAL_BIDMC_CSV'
  | 'RECORDED_TERRESTRIAL_WAVEFORM'
  | 'DERIVED_FROM_RECORDED_BIDMC'
  | 'DERIVED_FROM_HYBRID_SCENARIO'
  | 'DERIVED_COMPUTED'
  | 'SIMULATED_SCENARIO_INPUT'
  | 'UNAVAILABLE';

export type FreshnessStatus =
  | 'FRESH'
  | 'HOLD_LAST_VALID'
  | 'HELD_STALE'
  | 'UNAVAILABLE'
  | 'INVALID';

export type AlarmLevel =
  | 'NOMINAL'
  | 'ADVISORY'
  | 'WARNING'
  | 'CRITICAL'
  | 'DATA_DEGRADED_MISSING_CHANNELS';

export interface ProvenanceManifest {
  biometrics_source: BiometricsSource;
  biometrics_native_rate_hz: number;
  ui_refresh_rate_hz: number;
  scenario_overlay_mode: ScenarioOverlayMode;
  dataset_provenance?: string;
  manifest_sha256_verified?: boolean;
  biological_context_refs?: string[];
}

export interface Biometrics {
  heart_rate_bpm: number | null;
  pulse_rate_bpm: number | null;
  respiration_rate_brpm: number | null;
  spo2_percent: number | null;
  rr_interval_ms?: number | null;
  hrv_rmssd_ms?: number | null;
  hrv_unavailable_reason?: string | null;
  core_temp_celsius?: number | null;
  sqi_score?: number | null;
  radiation_dose_rate_msv_d?: number | null;
  missing_channels?: string[];
  quality_flags?: string[];
}

export interface Hemodynamics {
  provenance: ChannelProvenance;
  ijv_csa_cm2: number | null;
  ijv_velocity_max_cm_s: number | null;
  wall_shear_stress_dyn_cm2: number | null;
  pocus_thrombus_confirmed: boolean | null;
  thrombosis_risk_score: number | null;
  flow_grade?: string | null;
  lbnp_active?: boolean | null;
  lbnp_pressure_mmhg?: number | null;
  onsd_mm?: number | null;
  sans_risk_index?: number | null;
}

export interface Musculoskeletal {
  provenance: ChannelProvenance;
  soleus_thickness_mm: number | null;
  pennation_angle_deg: number | null;
  bone_resorption_rate_pct: number | null;
  mechanotransductive_index: number | null;
  soleus_volume_loss_pct?: number | null;
  bmd_loss_pct_per_month?: number | null;
  gait_asymmetry_index_pct?: number | null;
  post_landing?: boolean | null;
  ared_daily_load_kgf?: number | null;
  soleus_csa_pct?: number | null;
  mqi_index?: number | null;
  sclerostin_pmol_l?: number | null;
  gai_pct?: number | null;
}

export interface Environment {
  provenance: 'SIMULATED_SCENARIO_INPUT' | 'UNAVAILABLE';
  cabin_co2_ppm: number | null;
  cabin_ppco2_mmhg?: number | null;
  cabin_o2_kpa: number | null;
  ambient_radiation_rate_ugy_h: number | null;
  cumulative_radiation_mgy: number | null;
}

export interface SafetyMargins {
  provenance: 'DERIVED_FROM_RECORDED_BIDMC' | 'DERIVED_FROM_HYBRID_SCENARIO' | 'UNAVAILABLE';
  med_stl_rho_robustness: number | null;
  time_to_violation_days?: number | null;
  ttv_most_likely_days?: number | null;
  ttv_p5_days?: number | null;
  ttv_p95_days?: number | null;
  ttv_horizon_days?: number | null;
  ttv_no_crossing_within_horizon?: boolean;
  mission_readiness_index: number | null;
  alarm_level: AlarmLevel;
  pending_sources?: string[];
  per_predicate_rho?: Record<string, number | null>;
}

export interface ActivePlaybook {
  playbook_id: string;
  title?: string;
  current_step?: number;
  total_steps?: number;
  step_instruction?: string;
  causal_chain_summary?: string[];
  safety_gates?: {
    anticoagulant_lock_active: boolean;
    lbnp_auto_vent_armed: boolean;
    eva_suit_damping_active: boolean;
  };
}

export interface HypergraphSpatialSummary {
  anatomical_cells?: Array<{
    region_id: string;
    uberon_id: string;
    risk_intensity: number;
  }>;
  habitat_zone?: string;
}

export interface TimestralQuantilesSummary {
  conformal_status?: string;
  ttv_q05_days?: number | null;
  ttv_q50_days?: number | null;
  ttv_q95_days?: number | null;
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
  quality_flags?: string[];
  hypergraph_spatial?: HypergraphSpatialSummary | null;
  timestral_quantiles?: TimestralQuantilesSummary | null;
  is_local_simulation?: boolean;
}

export interface IndicatorMetadata {
  id: string;
  label: string;
  valueText: string;
  origin: DataOrigin;
  freshness: FreshnessStatus;
  nativeRateHz: number | null;
  measurementTimeS: number | null;
  ageMs: number | null;
  availabilityReason: string | null;
  qualityFlags: string[];
}
