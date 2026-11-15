//! Wire-contract DTOs unifying the 20-Phase ARES-Health engine (`Timestral`,
//! `ARES-HyperGraph`, `NQS-STL`, `MedOps`) with `contracts/telemetry_schema.json`
//! and the `ares-cockpit` UI client.

use ares_core_types::telemetry::{
    ActivePlaybook, AlertSeverity, BiometricsSource, CountermeasureAction, HrvUnavailableReason,
    JugularFlowGrade, ModelValidationStatus, ProvenanceManifest, SafetyGates, ScenarioOverlayMode,
    StressTestScenarioInput, SystemPhase, TelemetryPacket, TtvIntervalKind,
};
use ares_telemetry_ingest::anomaly_injection::InjectedAnomalyKind;
use serde::{Deserialize, Deserializer, Serialize};

fn deserialize_anomaly_kind<'de, D>(deserializer: D) -> Result<Option<InjectedAnomalyKind>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    match opt.as_deref() {
        None | Some("CLEAR") => Ok(None),
        Some(other) => {
            let quoted = serde_json::Value::String(other.to_string());
            serde_json::from_value::<InjectedAnomalyKind>(quoted)
                .map(Some)
                .map_err(serde::de::Error::custom)
        }
    }
}

/// Request body for `POST /api/inject-anomaly` and Tauri `ipc_inject_anomaly`.
/// `kind: null` or `"CLEAR"` clears the active synthetic anomaly injection.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct AnomalyInjectionRequest {
    #[serde(default, deserialize_with = "deserialize_anomaly_kind")]
    pub kind: Option<InjectedAnomalyKind>,
    #[serde(default)]
    pub magnitude: Option<f64>,
}

/// Canonical base epoch matching pinned contract fixtures (`2026-11-14T12:00:00Z`).
const CONTRACT_BASE_EPOCH_MS: u64 = 1_794_657_600_000;

/// Partial or full What-If payload accepted by `POST /api/stress-test`.
/// Accepts both the 8-field `StressTestScenarioInput` (`what_if_request.json`)
/// and the 4-field cockpit patch (`cabin_ppco2_mmhg`, `ared_workload_pct`,
/// `lbnp_pressure_mmhg`, `mission_elapsed_days`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct StressTestPatchRequest {
    /// Apply mission or crew context without changing the current overlay mode.
    pub preserve_overlay: bool,
    pub source_record_id: Option<String>,
    pub flight_day: Option<u32>,
    pub mission_elapsed_days: Option<f64>,
    pub ared_daily_load_kgf: Option<f64>,
    pub ared_workload_pct: Option<f64>,
    pub radiation_dose_rate_msv_d: Option<f64>,
    pub lbnp_active: Option<bool>,
    pub lbnp_pressure_mmhg: Option<f64>,
    pub pocus_thrombus_confirmed: Option<bool>,
    pub systolic_bp_drop_mmhg: Option<f64>,
    pub cabin_ppco2_mmhg: Option<f64>,
    #[serde(default)]
    pub helmet_ppco2_mmhg: Option<f64>,
    #[serde(default)]
    pub affected_crew_count: Option<usize>,
    #[serde(default)]
    pub platelet_count_k_ul: Option<f64>,
    #[serde(default)]
    pub efast_scan: Option<ares_medops_playbooks::pocus_multiorgan::PocusEfastScan>,
    #[serde(default)]
    pub renal_pocus: Option<ares_medops_playbooks::pocus_multiorgan::PocusRenalBladderScan>,
    #[serde(default)]
    pub clear_pocus_scans: Option<bool>,
    #[serde(default)]
    pub crew_profile: Option<ares_core_types::medical_360::CrewBiologicalProfile>,
    #[serde(default)]
    pub pelvic_pocus: Option<ares_core_types::medical_360::PocusPelvicScan>,
    #[serde(default)]
    pub medical_360_scenario: Option<ares_core_types::medical_360::Aerospace360ScenarioInput>,
}

impl From<StressTestScenarioInput> for StressTestPatchRequest {
    fn from(s: StressTestScenarioInput) -> Self {
        Self {
            preserve_overlay: false,
            source_record_id: Some(s.source_record_id),
            flight_day: Some(s.flight_day),
            mission_elapsed_days: None,
            ared_daily_load_kgf: Some(s.ared_daily_load_kgf),
            ared_workload_pct: None,
            radiation_dose_rate_msv_d: Some(s.radiation_dose_rate_msv_d),
            lbnp_active: Some(s.lbnp_active),
            lbnp_pressure_mmhg: Some(s.lbnp_pressure_mmhg),
            pocus_thrombus_confirmed: Some(s.pocus_thrombus_confirmed),
            systolic_bp_drop_mmhg: Some(s.systolic_bp_drop_mmhg),
            cabin_ppco2_mmhg: None,
            helmet_ppco2_mmhg: None,
            affected_crew_count: None,
            platelet_count_k_ul: None,
            efast_scan: None,
            renal_pocus: None,
            clear_pocus_scans: None,
            crew_profile: None,
            pelvic_pocus: None,
            medical_360_scenario: None,
        }
    }
}

impl StressTestPatchRequest {
    /// Applies non-null override fields onto `current` without touching
    /// recorded BIDMC CSV channels or advancing the replay cursor.
    pub fn apply_onto(
        &self,
        current: &StressTestScenarioInput,
        current_ppco2_mmhg: &mut f64,
    ) -> StressTestScenarioInput {
        let mut next = current.clone();
        if let Some(ref record_id) = self.source_record_id {
            next.source_record_id = record_id.clone();
        }
        if let Some(day) = self.flight_day {
            next.flight_day = day;
        } else if let Some(days) = self.mission_elapsed_days
            && days.is_finite()
        {
            next.flight_day = days.round().clamp(1.0, 1200.0) as u32;
        }
        if let Some(load) = self.ared_daily_load_kgf {
            if load.is_finite() {
                next.ared_daily_load_kgf = load.max(0.0);
            }
        } else if let Some(pct) = self.ared_workload_pct
            && pct.is_finite()
        {
            next.ared_daily_load_kgf = (pct.clamp(0.0, 200.0) / 100.0) * 180.0;
        }
        if let Some(dose) = self.radiation_dose_rate_msv_d
            && dose.is_finite()
        {
            next.radiation_dose_rate_msv_d = dose.max(0.0);
        }
        if let Some(pressure) = self.lbnp_pressure_mmhg
            && pressure.is_finite()
        {
            next.lbnp_pressure_mmhg = pressure;
            if self.lbnp_active.is_none() {
                next.lbnp_active = pressure.abs() > f64::EPSILON;
            }
        }
        if let Some(active) = self.lbnp_active {
            next.lbnp_active = active;
        }
        if let Some(confirmed) = self.pocus_thrombus_confirmed {
            next.pocus_thrombus_confirmed = confirmed;
        }
        if let Some(drop_mmhg) = self.systolic_bp_drop_mmhg
            && drop_mmhg.is_finite()
        {
            next.systolic_bp_drop_mmhg = drop_mmhg.max(0.0);
        }
        if let Some(ppco2) = self.cabin_ppco2_mmhg
            && ppco2.is_finite()
        {
            *current_ppco2_mmhg = ppco2.clamp(0.2, 7.6);
        }
        next
    }
}

/// Schema-compatible biometrics DTO preserving both `contracts/telemetry_schema.json`
/// field names and internal Rust aliases.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireBiometrics {
    pub heart_rate_bpm: Option<f64>,
    pub pulse_rate_bpm: Option<f64>,
    pub respiration_rate_brpm: Option<f64>,
    pub resp_rate_brpm: Option<f64>,
    pub spo2_percent: Option<f64>,
    pub spo2_pct: Option<f64>,
    pub hrv_rmssd_ms: Option<f64>,
    pub rmssd_ms: Option<f64>,
    pub hrv_unavailable_reason: Option<HrvUnavailableReason>,
    pub rr_interval_ms: Option<f64>,
    pub core_temp_celsius: Option<f64>,
    pub sdnn_ms: Option<f64>,
    pub pnn50_pct: Option<f64>,
    pub lf_hf_ratio: Option<f64>,
    pub vocal_f0_hz: Option<f64>,
    pub vocal_jitter_pct: Option<f64>,
    pub radiation_dose_rate_msv_d: f64,
    pub sqi_score: f64,
    pub missing_channels: Vec<String>,
    pub quality_flags: Vec<String>,
}

/// Explicit 1 Hz recorded stream block aligned with native BIDMC cadence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireBiometrics1Hz {
    pub native_rate_hz: f64,
    pub relative_recording_time_s: f64,
    pub heart_rate_bpm: Option<f64>,
    pub pulse_rate_bpm: Option<f64>,
    pub respiration_rate_brpm: Option<f64>,
    pub spo2_percent: Option<f64>,
    pub hrv_rmssd_ms: Option<f64>,
    pub hrv_unavailable_reason: Option<HrvUnavailableReason>,
    pub sqi_score: f64,
    pub missing_channels: Vec<String>,
    pub quality_flags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireHemodynamics {
    pub provenance: String,
    pub ijv_csa_cm2: f64,
    pub ijv_velocity_max_cm_s: f64,
    pub wall_shear_stress_dyn_cm2: f64,
    pub flow_grade: JugularFlowGrade,
    pub pocus_thrombus_confirmed: bool,
    pub thrombosis_risk_score: Option<f64>,
    pub lbnp_active: bool,
    pub lbnp_pressure_mmhg: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireMusculoskeletal {
    pub provenance: String,
    pub soleus_thickness_mm: f64,
    pub pennation_angle_deg: f64,
    pub bone_resorption_rate_pct: f64,
    pub mechanotransductive_index: f64,
    pub ared_daily_load_kgf: f64,
    pub soleus_csa_pct: f64,
    pub soleus_volume_loss_pct: f64,
    pub bmd_loss_pct_per_month: f64,
    pub gait_asymmetry_index_pct: Option<f64>,
    pub post_landing: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireEnvironment {
    pub provenance: String,
    pub cabin_co2_ppm: f64,
    pub cabin_ppco2_mmhg: f64,
    pub cabin_o2_kpa: f64,
    pub ambient_radiation_rate_ugy_h: f64,
    pub cumulative_radiation_mgy: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireSafetyMargins {
    pub provenance: String,
    pub med_stl_rho_robustness: Option<f64>,
    pub mission_readiness_index: Option<f64>,
    pub alarm_level: String,
    pub time_to_violation_days: Option<f64>,
    pub pending_sources: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireActivePlaybook {
    pub playbook_id: String,
    pub current_step: usize,
    pub total_steps: usize,
    pub step_instruction: String,
    pub title: String,
    pub causal_chain_summary: Vec<String>,
    pub safety_gates: SafetyGates,
    pub actions: Vec<CountermeasureAction>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireMedOpsGates {
    pub anticoagulation_locked: bool,
    pub gait_suit_damping_pct: f64,
    pub lbnp_autosafe_vent: bool,
    pub gate4_invasive_decompression_locked: bool,
    pub gate4_eva_fitness_no_go: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireMedOps {
    pub gates: WireMedOpsGates,
    pub triggered_playbooks: Vec<String>,
    pub priority_actions: Vec<String>,
    pub interventions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireCausalGraphState {
    pub pocus_posterior: f64,
    pub causal_chain: Vec<String>,
    pub active_nodes: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireNqsStlStatus {
    pub assessed: bool,
    pub hrv_available: bool,
    pub hrv_unavailable_reason: Option<HrvUnavailableReason>,
    pub rho_tau_w: f64,
    pub rho_ared: f64,
    pub rho_sost: f64,
    pub rho_rmssd: Option<f64>,
    pub rho_sans: f64,
    pub rho_global: Option<f64>,
    pub mri_pct: Option<f64>,
    pub ttv_hours: Option<f64>,
    pub ttv_ci95_low_hours: Option<f64>,
    pub ttv_ci95_high_hours: Option<f64>,
    pub ttv_interval_kind: Option<TtvIntervalKind>,
    pub alarm_level: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireWhatIfOverlay {
    pub active: bool,
    pub scenario: StressTestScenarioInput,
    pub cabin_ppco2_mmhg: f64,
}

/// Complete telemetry payload combining `contracts/telemetry_schema.json`
/// blocks with the 20-Phase ARES-Health (`Timestral`, `HyperGraph`) outputs.
#[allow(non_snake_case)]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireTelemetryPacket {
    pub timestamp_ms: u64,
    pub timestamp_utc: String,
    pub mission_Elapsed_seconds: f64,
    pub relative_recording_time_s: f64,
    pub source_record_id: String,
    pub mission_elapsed_days: Option<f64>,
    pub flight_day: u32,
    pub astronaut_id: String,
    pub system_phase: SystemPhase,
    pub alert_severity: AlertSeverity,
    pub model_validation_status: ModelValidationStatus,
    pub provenance_manifest: ProvenanceManifest,
    pub biometrics: WireBiometrics,
    pub biometrics_1hz: WireBiometrics1Hz,
    pub hemodynamics: Option<WireHemodynamics>,
    pub musculoskeletal: Option<WireMusculoskeletal>,
    pub environment: Option<WireEnvironment>,
    pub safety_margins: WireSafetyMargins,
    pub active_playbook: WireActivePlaybook,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vitals_playbook: Option<WireActivePlaybook>,
    pub medops: WireMedOps,
    pub causal_graph_state: WireCausalGraphState,
    pub nqs_stl_status: WireNqsStlStatus,
    pub what_if_overlay: WireWhatIfOverlay,
    pub nqs_stl: ares_core_types::telemetry::NqsStlMargins,
    pub sans_ocular: Option<ares_core_types::telemetry::SansOcular>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spot_poct: Option<ares_core_types::telemetry::SpotPoctPanel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renal_nephrolithiasis: Option<ares_core_types::telemetry::RenalNephrolithiasis>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orthostatic_fluid: Option<ares_core_types::telemetry::OrthostaticFluid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mars_circadian_sleep: Option<ares_core_types::telemetry::MarsCircadianSleep>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub neuro_immune_viral: Option<ares_core_types::telemetry::NeuroImmuneViral>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aerospace_360: Option<ares_core_types::medical_360::AerospaceMedical360State>,
    pub timestral_quantiles: serde_json::Value,
    /// Per-channel anomaly status (`VitalsAnomalyReport`) plus the active synthetic demo injection.
    #[serde(default)]
    pub vitals_anomaly: serde_json::Value,
    pub hypergraph_spatial: serde_json::Value,
    pub recompute_latency_us: u64,
}

fn schema_astronaut_id(source_record_id: &str) -> String {
    if let Some(suffix) = source_record_id.strip_prefix("bidmc_")
        && let Ok(num) = suffix.parse::<u32>()
        && (1..=53).contains(&num)
    {
        return format!("BIDMC-SUBJECT-{num:02}");
    }
    "ASTRO-01".to_string()
}

fn schema_alarm_level(severity: AlertSeverity) -> String {
    match severity {
        AlertSeverity::Nominal => "NOMINAL",
        AlertSeverity::DataDegradedMissingChannels => "DATA_DEGRADED_MISSING_CHANNELS",
        AlertSeverity::Caution => "ADVISORY",
        AlertSeverity::Warning => "WARNING",
        AlertSeverity::CriticalEmergency => "CRITICAL",
    }
    .to_string()
}

fn wire_active_playbook(pb: &ActivePlaybook) -> WireActivePlaybook {
    let total_steps = pb.actions.len().max(1);
    let step_instruction = pb
        .actions
        .first()
        .map(|a| a.label.clone())
        .unwrap_or_else(|| pb.title.clone());
    WireActivePlaybook {
        playbook_id: pb.playbook_id.clone(),
        current_step: 1,
        total_steps,
        step_instruction,
        title: pb.title.clone(),
        causal_chain_summary: pb.causal_chain_summary.clone(),
        safety_gates: pb.safety_gates,
        actions: pb.actions.clone(),
    }
}

/// Parameters required to materialize a contract-compliant `WireTelemetryPacket`
/// from an evaluated `TelemetryPacket` tick and runtime extensions.
pub struct WirePacketContext<'a> {
    pub packet: &'a TelemetryPacket,
    pub scenario: &'a StressTestScenarioInput,
    pub what_if_active: bool,
    pub cabin_ppco2_mmhg: f64,
    pub pocus_posterior: f64,
    pub causal_chain: Vec<String>,
    pub timestral_quantiles: serde_json::Value,
    pub vitals_anomaly: serde_json::Value,
    pub hypergraph_spatial: serde_json::Value,
    pub recompute_latency_us: u64,
}

impl WireTelemetryPacket {
    /// Projects a core `TelemetryPacket` + 20-Phase metadata onto the unified
    /// wire contract (`contracts/telemetry_schema.json` + cockpit DTOs).
    pub fn from_context(ctx: WirePacketContext<'_>) -> Self {
        let p = ctx.packet;
        let offset_ms = if p.relative_recording_time_s.is_finite() {
            (p.relative_recording_time_s.max(0.0) * 1000.0).round() as u64
        } else {
            0
        };
        let timestamp_ms = CONTRACT_BASE_EPOCH_MS.saturating_add(offset_ms);
        let alarm_level = schema_alarm_level(p.alert_severity);

        let scenario_overlay_mode = if ctx.what_if_active {
            ScenarioOverlayMode::SimulatedWhatifScenario
        } else {
            ScenarioOverlayMode::NonePureReplay
        };

        let mut provenance_manifest = p.provenance_manifest.clone();
        if provenance_manifest.biometrics_source != BiometricsSource::SimulatedScenarioInput
            && provenance_manifest.biometrics_source != BiometricsSource::HardwareWearable
        {
            provenance_manifest.biometrics_source = BiometricsSource::RecordedTerrestrialBidmcCsv;
        }
        provenance_manifest.scenario_overlay_mode = scenario_overlay_mode;

        let mut quality_flags = Vec::new();
        if p.biometrics.rmssd_ms.is_none() {
            quality_flags.push("BEAT_INTERVALS_NOT_AVAILABLE".to_string());
        }
        if !p.biometrics.missing_channels.is_empty() {
            quality_flags.push("CHANNEL_NAN_DROPOUT".to_string());
        }
        if provenance_manifest.biometrics_source == BiometricsSource::SimulatedScenarioInput {
            quality_flags.push("INJECTED_SYNTHETIC_ANOMALY".to_string());
        }

        let biometrics = WireBiometrics {
            heart_rate_bpm: p.biometrics.heart_rate_bpm,
            pulse_rate_bpm: p.biometrics.pulse_rate_bpm,
            respiration_rate_brpm: p.biometrics.resp_rate_brpm,
            resp_rate_brpm: p.biometrics.resp_rate_brpm,
            spo2_percent: p.biometrics.spo2_pct,
            spo2_pct: p.biometrics.spo2_pct,
            hrv_rmssd_ms: p.biometrics.rmssd_ms,
            rmssd_ms: p.biometrics.rmssd_ms,
            hrv_unavailable_reason: p.biometrics.hrv_unavailable_reason,
            rr_interval_ms: None,
            core_temp_celsius: None,
            sdnn_ms: p.biometrics.sdnn_ms,
            pnn50_pct: p.biometrics.pnn50_pct,
            lf_hf_ratio: p.biometrics.lf_hf_ratio,
            vocal_f0_hz: p.biometrics.vocal_f0_hz,
            vocal_jitter_pct: p.biometrics.vocal_jitter_pct,
            radiation_dose_rate_msv_d: p.biometrics.radiation_dose_rate_msv_d,
            sqi_score: p.biometrics.sqi_score,
            missing_channels: p.biometrics.missing_channels.clone(),
            quality_flags: quality_flags.clone(),
        };

        let biometrics_1hz = WireBiometrics1Hz {
            native_rate_hz: provenance_manifest.biometrics_native_rate_hz,
            relative_recording_time_s: p.relative_recording_time_s,
            heart_rate_bpm: p.biometrics.heart_rate_bpm,
            pulse_rate_bpm: p.biometrics.pulse_rate_bpm,
            respiration_rate_brpm: p.biometrics.resp_rate_brpm,
            spo2_percent: p.biometrics.spo2_pct,
            hrv_rmssd_ms: p.biometrics.rmssd_ms,
            hrv_unavailable_reason: p.biometrics.hrv_unavailable_reason,
            sqi_score: p.biometrics.sqi_score,
            missing_channels: p.biometrics.missing_channels.clone(),
            quality_flags,
        };

        let (hemodynamics, musculoskeletal, environment, sans_ocular, mission_elapsed_days) =
            if ctx.what_if_active {
                let hemo = WireHemodynamics {
                    provenance: "SIMULATED_SCENARIO_INPUT".to_string(),
                    ijv_csa_cm2: (p.jugular_hemodynamics.ijv_csa_mm2 / 100.0).clamp(0.2, 6.0),
                    ijv_velocity_max_cm_s: p.jugular_hemodynamics.ijv_vmax_cm_s.clamp(0.0, 100.0),
                    wall_shear_stress_dyn_cm2: p
                        .jugular_hemodynamics
                        .tau_w_dyn_cm2
                        .clamp(0.0, 50.0),
                    flow_grade: p.jugular_hemodynamics.flow_grade,
                    pocus_thrombus_confirmed: p.jugular_hemodynamics.pocus_thrombus_confirmed,
                    thrombosis_risk_score: Some(ctx.pocus_posterior.clamp(0.0, 1.0)),
                    lbnp_active: p.jugular_hemodynamics.lbnp_active,
                    lbnp_pressure_mmhg: p.jugular_hemodynamics.lbnp_pressure_mmhg,
                };
                let musculo = WireMusculoskeletal {
                    provenance: "SIMULATED_SCENARIO_INPUT".to_string(),
                    soleus_thickness_mm: (16.0 * (p.musculoskeletal.soleus_csa_pct / 100.0))
                        .clamp(5.0, 25.0),
                    pennation_angle_deg: (14.0 + 6.0 * p.musculoskeletal.mqi_index)
                        .clamp(8.0, 35.0),
                    bone_resorption_rate_pct: (p.musculoskeletal.urinary_calcium_mg_d / 200.0)
                        .clamp(0.0, 5.0),
                    mechanotransductive_index: p.musculoskeletal.mqi_index.clamp(0.0, 1.0),
                    ared_daily_load_kgf: p.musculoskeletal.ared_daily_load_kgf,
                    soleus_csa_pct: p.musculoskeletal.soleus_csa_pct,
                    soleus_volume_loss_pct: (100.0 - p.musculoskeletal.soleus_csa_pct).max(0.0),
                    bmd_loss_pct_per_month: (p.musculoskeletal.urinary_calcium_mg_d / 500.0)
                        .max(0.0),
                    gait_asymmetry_index_pct: Some(p.musculoskeletal.gai_pct),
                    post_landing: false,
                };
                let env = WireEnvironment {
                    provenance: "SIMULATED_SCENARIO_INPUT".to_string(),
                    cabin_co2_ppm: ((ctx.cabin_ppco2_mmhg / 760.0) * 1_000_000.0)
                        .clamp(300.0, 10_000.0),
                    cabin_ppco2_mmhg: ctx.cabin_ppco2_mmhg,
                    cabin_o2_kpa: 21.3,
                    ambient_radiation_rate_ugy_h: (ctx.scenario.radiation_dose_rate_msv_d * 1000.0
                        / 24.0)
                        .clamp(0.0, 50_000.0),
                    cumulative_radiation_mgy: (ctx.scenario.radiation_dose_rate_msv_d
                        * f64::from(ctx.scenario.flight_day))
                    .clamp(0.0, 2000.0),
                };
                (
                    Some(hemo),
                    Some(musculo),
                    Some(env),
                    Some(p.sans_ocular),
                    Some(f64::from(p.flight_day)),
                )
            } else {
                (None, None, None, None, None)
            };

        let mut pending_sources = Vec::new();
        if p.nqs_stl.rho_global.is_none() {
            pending_sources.push("PENDING_ARES_NQS_STL".to_string());
        }
        if !ctx.what_if_active {
            pending_sources.push("UNSUPPORTED_BY_TERRESTRIAL_RECORD".to_string());
        }

        let safety_margins = WireSafetyMargins {
            provenance: if ctx.what_if_active {
                "DERIVED_FROM_HYBRID_SCENARIO".to_string()
            } else {
                "DERIVED_FROM_RECORDED_BIDMC".to_string()
            },
            med_stl_rho_robustness: p.nqs_stl.rho_global,
            mission_readiness_index: p.nqs_stl.mri_pct.map(|m| m.clamp(0.0, 100.0)),
            alarm_level: alarm_level.clone(),
            time_to_violation_days: p.nqs_stl.ttv_hours.map(|h| (h / 24.0).clamp(0.0, 100.0)),
            pending_sources,
        };

        let active_playbook = wire_active_playbook(&p.active_playbook);
        let vitals_playbook = if ctx.vitals_anomaly["overall"] == "ALARM" {
            serde_json::from_value::<ares_core_types::VitalsAnomalyReport>(ctx.vitals_anomaly.clone())
                .ok()
                .and_then(|report| {
                    ares_medops_playbooks::playbooks::select_vitals_anomaly_playbook(
                        &report,
                        p.active_playbook.safety_gates,
                    )
                })
                .map(|playbook| wire_active_playbook(&playbook))
        } else {
            None
        };

        let medops = WireMedOps {
            gates: WireMedOpsGates {
                anticoagulation_locked: p.active_playbook.safety_gates.anticoagulant_lock_active,
                gait_suit_damping_pct: if p.active_playbook.safety_gates.eva_suit_damping_active {
                    25.0
                } else {
                    0.0
                },
                lbnp_autosafe_vent: p.active_playbook.safety_gates.lbnp_auto_vent_armed,
                gate4_invasive_decompression_locked: p
                    .active_playbook
                    .safety_gates
                    .gate4_invasive_decompression_locked,
                gate4_eva_fitness_no_go: p
                    .active_playbook
                    .safety_gates
                    .gate4_eva_fitness_no_go,
            },
            triggered_playbooks: vec![p.active_playbook.playbook_id.clone()],
            priority_actions: p
                .active_playbook
                .actions
                .iter()
                .map(|a| a.label.clone())
                .collect(),
            interventions: p
                .active_playbook
                .actions
                .iter()
                .map(|a| a.action_id.clone())
                .collect(),
        };

        let active_nodes = ctx.causal_chain.len().max(1);
        let causal_graph_state = WireCausalGraphState {
            pocus_posterior: ctx.pocus_posterior,
            causal_chain: ctx.causal_chain,
            active_nodes,
        };

        let nqs_stl_status = WireNqsStlStatus {
            assessed: p.nqs_stl.rho_global.is_some(),
            hrv_available: p.biometrics.rmssd_ms.is_some(),
            hrv_unavailable_reason: p.biometrics.hrv_unavailable_reason,
            rho_tau_w: p.nqs_stl.rho_tau_w,
            rho_ared: p.nqs_stl.rho_ared,
            rho_sost: p.nqs_stl.rho_sost,
            rho_rmssd: p.nqs_stl.rho_rmssd,
            rho_sans: p.nqs_stl.rho_sans,
            rho_global: p.nqs_stl.rho_global,
            mri_pct: p.nqs_stl.mri_pct,
            ttv_hours: p.nqs_stl.ttv_hours,
            ttv_ci95_low_hours: p.nqs_stl.ttv_ci95_low_hours,
            ttv_ci95_high_hours: p.nqs_stl.ttv_ci95_high_hours,
            ttv_interval_kind: p.nqs_stl.ttv_interval_kind,
            alarm_level,
        };

        let what_if_overlay = WireWhatIfOverlay {
            active: ctx.what_if_active,
            scenario: ctx.scenario.clone(),
            cabin_ppco2_mmhg: ctx.cabin_ppco2_mmhg,
        };

        Self {
            timestamp_ms,
            timestamp_utc: p.timestamp_utc.clone(),
            mission_Elapsed_seconds: p.mission_Elapsed_seconds,
            relative_recording_time_s: p.relative_recording_time_s,
            source_record_id: p.source_record_id.clone(),
            mission_elapsed_days,
            flight_day: p.flight_day,
            astronaut_id: schema_astronaut_id(&p.source_record_id),
            system_phase: p.system_phase,
            alert_severity: p.alert_severity,
            model_validation_status: p.model_validation_status,
            provenance_manifest,
            biometrics,
            biometrics_1hz,
            hemodynamics,
            musculoskeletal,
            environment,
            safety_margins,
            active_playbook,
            vitals_playbook,
            medops,
            causal_graph_state,
            nqs_stl_status,
            what_if_overlay,
            nqs_stl: p.nqs_stl,
            sans_ocular,
            spot_poct: p.spot_poct.clone(),
            renal_nephrolithiasis: p.renal_nephrolithiasis,
            orthostatic_fluid: p.orthostatic_fluid,
            mars_circadian_sleep: p.mars_circadian_sleep,
            neuro_immune_viral: p.neuro_immune_viral,
            aerospace_360: p.aerospace_360.clone(),
            timestral_quantiles: ctx.timestral_quantiles,
            vitals_anomaly: ctx.vitals_anomaly,
            hypergraph_spatial: ctx.hypergraph_spatial,
            recompute_latency_us: ctx.recompute_latency_us,
        }
    }
}
