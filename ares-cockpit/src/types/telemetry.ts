// TypeScript contract aligned with contracts/telemetry_schema.json, crates/ares-server-cli/src/wire_contract.rs,
// crates/ares-core-types, and crates/ares-causal-graph.
// Nullable channels stay `number | null`: missing samples are NEVER coerced to 0 (Issue #11).

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

export type ModelValidationStatus =
  | 'ILLUSTRATIVE_UNVALIDATED'
  | 'INTERNALLY_BENCHMARKED_TERRESTRIAL'
  | 'CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW';

export type TtvIntervalKind = 'ILLUSTRATIVE_SCENARIO_RANGE';

export type HrvUnavailableReason = 'BEAT_INTERVALS_NOT_AVAILABLE';

export type ConformalGateStatus =
  | 'HEURISTIC_GATE_ACCEPTED'
  | 'ABSTAINED_FALLBACK_DETERMINISTIC';

export type CrystallizedPlaybookId =
  | 'PLAYBOOK_01_VENOUS_STASIS_LBNP'
  | 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS'
  | 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED'
  | 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION'
  | 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS'
  | 'PLAYBOOK_06_HYPOXEMIA_DESATURATION'
  | 'PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS'
  | 'PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK'
  | 'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION'
  | 'PLAYBOOK_10_RENAL_LITHIASIS'
  | 'PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING'
  | 'PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE'
  | 'PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR'
  | 'PLAYBOOK_14_CO2_SCRUBBER_SANS'
  | 'PLAYBOOK_15_EFAST_TRAUMA_TRIAGE';

export type AnomalyStatus = 'NORMAL' | 'ATTENTION' | 'ALARM';

export type AnomalyDetectorKind =
  | 'ROBUST_Z_SCORE'
  | 'CUSUM_DRIFT'
  | 'MAHALANOBIS'
  | 'SENSOR_DROPOUT';

export interface ChannelAnomalyState {
  channel: string;
  status: AnomalyStatus;
  /** False when the channel has no frozen baseline yet or no current sample: NORMAL then means "not assessed". */
  evaluable: boolean;
  detector: AnomalyDetectorKind | string | null;
  value: number | null;
  baseline_median: number | null;
  baseline_sigma: number | null;
  z_score: number | null;
  duration_s: number;
  reason: string;
}

export interface VitalsAnomalyInjection {
  kind: string;
  description: string;
  onset_s: number;
  elapsed_s: number;
  duration_s: number;
}

/** Engine anomaly detector output (`vitals_anomaly` block of the wire packet). */
export interface VitalsAnomalyReport {
  recording_time_s: number;
  baseline_ready: boolean;
  baseline_samples: number;
  baseline_required: number;
  overall: AnomalyStatus;
  mahalanobis_d2: number | null;
  channels: ChannelAnomalyState[];
  injection: VitalsAnomalyInjection | null;
}

export type ForecastMethod =
  | 'DETERMINISTIC_COLD_START'
  | 'TIMESTRAL_GREY_BOX_1HZ'
  | 'EWMA_EMPIRICAL_RESIDUAL_QUANTILES'
  | 'HYBRID_TIMESTRAL_AND_EWMA_SHORT_HORIZON';

export interface ShortHorizonCone {
  channel_name: string;
  ewma_level?: number;
  horizon_5s: MonotoneQuantileTriplet | null;
  horizon_10s: MonotoneQuantileTriplet | null;
  horizon_30s: MonotoneQuantileTriplet | null;
  horizon_60s: MonotoneQuantileTriplet | null;
  horizon_120s: MonotoneQuantileTriplet | null;
}

export interface SafetyGatesState {
  anticoagulant_lock_active: boolean;
  lbnp_auto_vent_armed: boolean;
  eva_suit_damping_active: boolean;
  gate4_invasive_decompression_locked?: boolean;
  gate4_eva_fitness_no_go?: boolean;
}

export interface CountermeasureAction {
  action_id: string;
  label: string;
  category: string;
  delta_rho_per_hour: number;
}

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
  hrv_unavailable_reason?: HrvUnavailableReason | string | null;
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
  ttv_interval_kind?: TtvIntervalKind | null;
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
  safety_gates?: SafetyGatesState;
  actions?: CountermeasureAction[];
}

export interface MonotoneQuantileTriplet {
  q05: number;
  q50: number;
  q95: number;
}

export interface ChannelQuantileCone {
  channel_name: string;
  horizon_15m: MonotoneQuantileTriplet;
  horizon_1h: MonotoneQuantileTriplet;
  horizon_6h: MonotoneQuantileTriplet;
  horizon_24h: MonotoneQuantileTriplet;
}

export interface AbstentionCertificate {
  abstained: boolean;
  status: ConformalGateStatus;
  reason: string;
  empirical_coverage_error: number;
  adaptive_alpha_t: number;
  interval_width: number;
  sqi_score: number;
  missing_ratio: number;
  timestamp_s: number;
}

export interface TimestralQuantilesSummary {
  model_validation_status?: ModelValidationStatus;
  source_recording_time_s?: number;
  confidence_state?: ConformalGateStatus;
  conformal_status?: string;
  abstention_certificate?: AbstentionCertificate | null;
  short_horizon_s?: number;
  forecast_method?: ForecastMethod;
  ewma_short_horizon_max_s?: number;
  short_horizon_cones?: ShortHorizonCone[];
  short_horizon_abstention?: string | AbstentionCertificate | null;
  heart_rate_bpm_cone?: MonotoneQuantileTriplet | null;
  resp_rate_brpm_cone?: MonotoneQuantileTriplet | null;
  rmssd_ms_cone?: MonotoneQuantileTriplet | null;
  rho_global_cone?: MonotoneQuantileTriplet | null;
  ttv_hours_cone?: MonotoneQuantileTriplet | null;
  channel_cones?: ChannelQuantileCone[];
  pessimistic_ttv_q05_hours?: number | null;
  inference_latency_us?: number;
  ttv_q05_days?: number | null;
  ttv_q50_days?: number | null;
  ttv_q95_days?: number | null;
}

export type AnatomicalRegionWireId =
  | 'EyeOcularSans'
  | 'InternalJugularVein'
  | 'HeartCardioAutonomic'
  | 'SoleusCalcaneus'
  | 'BrainVestibularCns';

export type AnatomicalHeatmapKey =
  | 'eye_ocular_sans'
  | 'internal_jugular_vein'
  | 'heart_cardio_autonomic'
  | 'soleus_calcaneus'
  | 'brain_vestibular_cns';

export type UberonCurie =
  | 'UBERON:0000970'
  | 'UBERON:0001586'
  | 'UBERON:0000948'
  | 'UBERON:0001389'
  | 'UBERON:0000955';

export interface HeatmapCellWire {
  region: AnatomicalRegionWireId | string;
  key: AnatomicalHeatmapKey | string;
  uberon_curie: UberonCurie | string;
  centroid: [number, number, number];
  local_intensity: number;
  propagated_intensity: number;
  observed: boolean;
}

export interface HypergraphSpatialSummary {
  hottest_region?: AnatomicalRegionWireId | string | null;
  cells?: HeatmapCellWire[];
  anatomical_cells?: Array<{
    region_id: string;
    uberon_id: string;
    risk_intensity: number;
  }>;
  habitat_zone?: string;
  violates_policy?: boolean;
  rho_current_location?: number | null;
  biokg_clause?: string | null;
}

export interface TelemetryPacket {
  timestamp_ms: number;
  relative_recording_time_s: number;
  source_record_id: string;
  mission_elapsed_days?: number | null;
  astronaut_id: string;
  model_validation_status?: ModelValidationStatus;
  provenance_manifest: ProvenanceManifest;
  biometrics: Biometrics;
  hemodynamics?: Hemodynamics | null;
  musculoskeletal?: Musculoskeletal | null;
  environment?: Environment | null;
  safety_margins: SafetyMargins;
  active_playbook?: ActivePlaybook | null;
  pocus_posterior?: number | null;
  causal_chain?: string[];
  quality_flags?: string[];
  hypergraph_spatial?: HypergraphSpatialSummary | null;
  timestral_quantiles?: TimestralQuantilesSummary | null;
  vitals_anomaly?: VitalsAnomalyReport | null;
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
