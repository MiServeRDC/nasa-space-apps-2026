//! Phase 13 (G1) + Blocks H & I: Axum HTTP/WebSocket server at 20 Hz on `127.0.0.1:8080`,
//! `/api/stress-test` API, Timestral 1 Hz -> 20 Hz bridge, and ARES-HyperGraph / ARES-DatasetGraph.

use crate::edge_llm_bridge::{
    CopilotAskRequest, CopilotAskResponse, EdgeCopilotError, EdgeLlmConfig,
    execute_edge_copilot_turn,
};
use crate::fastmcp_router::{JsonRpcRequest, JsonRpcResponse, handle_fastmcp_jsonrpc_request};
use crate::wire_contract::{
    AnomalyInjectionRequest, StressTestPatchRequest, WirePacketContext, WireTelemetryPacket,
};
use ares_causal_graph::acute_emergencies::{
    AcuteAbdomenNomInput, AcuteEmergencyTriageInput, AcuteUrinaryRetentionInput, AnaphylaxisInput,
    DentalMaxillofacialInput, EvaMskSpineInput, HemorrhagicTraumaInput, MicrogravityCprInput,
    OcularEmergencyInput, PelvicUrogynInput, TorsoShockInput, evaluate_acute_emergencies_triage,
};
use ares_causal_graph::adhg_graph::{AdhgCausalEngine, AdhgNodeKind};
use ares_causal_graph::behavioral_bmed::{BMedScreeningInput, evaluate_bmed_state};
use ares_causal_graph::biokg_reasoner::{NormativeClinicalGrounding, ground_adhg_node_o1};
use ares_causal_graph::circadian_cognitive::{CircadianCognitiveState, MarsCircadianOscillator};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_causal_graph::eclss_differential::{
    HypercapniaRootCause, evaluate_coupled_habitat_crew_co2,
};
use ares_causal_graph::error::CausalGraphError;
use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state_ext;
use ares_causal_graph::hypergraph_spatial::{
    AnatomicalRegionSubgraph, AnatomicalRiskInputs, BodyHeatmap, DeonticModality,
    HabitatDeonticAssessment, HabitatEnvironmentState, HabitatZoneDeonticPolicy, HabitatZoneId,
    MARS_SOL_SECONDS, MissionLongitudinalCompactor, PhysiologicalTick, ZoneTransitionMarkovModel,
};
use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
use ares_causal_graph::orthostatic_fluid::compute_orthostatic_fluid_state;
use ares_causal_graph::radiation_ars::evaluate_radiation_ars_with_gates;
use ares_causal_graph::renal_nephrolithiasis::compute_renal_nephrolithiasis_state;
use ares_causal_graph::sex_physiology::evaluate_sex_physiology;
use ares_causal_graph::space_immunology::compute_neuro_immune_viral_state;
use ares_causal_graph::space_pharmacology::{
    MedicalConsumableInventory, evaluate_pharmacology_sepsis_state,
};
use ares_causal_graph::toxicology_dcs::evaluate_from_scenario_input;
use ares_core_types::anomaly::{
    AnomalyStatus, EWMA_SHORT_HORIZONS_SECONDS, ForecastMethod, ShortHorizonCone,
    VitalsAnomalyReport,
};
use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, BinaryFrameMeta, BinaryTelemetryFrame, DEONTIC_EIMO_AUTONOMOUS,
    DEONTIC_EVA_FORBIDDEN, DEONTIC_SHELTER_MANDATORY, DEONTIC_VIOLATES_POLICY,
    PARTITION_ALL_NOMINAL, SeqlockTelemetryRing,
};
use ares_core_types::constants::{
    ECLSS_PPCO2_EMERGENCY_MMHG, MAX_SAFE_CABIN_PPCO2_MMHG, sanitize_f64,
};
use ares_core_types::medical_360::{
    AcuteEmergencyState, Aerospace360ScenarioInput, AerospaceMedical360State,
    CrewBiologicalProfile, EclssCoupledSummary, LbnpBaselineState, PocusPelvicScan,
};
use ares_core_types::security::{AuditChainRecord, CrewRole, MedOpsAuditLogger};
use ares_core_types::telemetry::{
    AlertSeverity, Biometrics, BiometricsSource, CountermeasureAction, ProvenanceManifest,
    ScenarioOverlayMode, SpotPoctPanel, StressTestScenarioInput, SystemPhase, TelemetryPacket,
};
use ares_core_types::{AbstentionCertificate, NqsQuantileForecastSnapshot};
use ares_medops_playbooks::playbooks::{select_active_playbook_360, select_candidate_playbook_ext};
use ares_medops_playbooks::pocus_multiorgan::{PocusEfastScan, PocusRenalBladderScan};
use ares_medops_playbooks::safety_gates::{
    enforce_all_clinical_safety_gates_360, enforce_hard_clinical_safety_gates_with_lbnp_baseline,
    resolve_effective_platelets_k_ul,
};
use ares_nqs_stl::NqsEngine;
use ares_nqs_stl::error::NqsStlError;
use ares_nqs_stl::ewma_forecaster::EwmaResidualForecaster;
use ares_nqs_stl::mri_index::evaluate_nqs_stl_and_mri_ext;
use ares_nqs_stl::timestral_backbone::{ARES_TIMESTRAL_CHANNELS, TimestralConfig};
use ares_nqs_stl::timestral_bridge::{
    AresMultivariateSample, AresTemporalForecasterEngine, KnownFutureCovariates,
};
use ares_nqs_stl::vitals_anomaly::VitalsAnomalyDetector;
use ares_security_privacy::audit_chain::Sha256AuditLogger;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use ares_telemetry_ingest::anomaly_injection::{AnomalyInjection, InjectedAnomalyKind};
use ares_telemetry_ingest::bidmc_replayer::{BidmcNumericRow, BidmcReplayer, IngestError};
use ares_telemetry_ingest::scenario_overlay::biometrics_with_signal_quality;
use ares_telemetry_ingest::sqi_filter::{SqiEvaluation, SqiFilter};
use ares_telemetry_ingest::wearable_packet::{ValidatedTelemetryFrame, WearableSensorPacket};
use axum::body::Bytes;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderValue, Request, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use ares_storage_lsah::{LsahStorageConfig, LsahStorageEngine, LsahStorageError, LsahStorageStatusDto};
use std::time::{Duration, Instant};
use thiserror::Error;
use tokio::sync::broadcast;

/// Canonical base epoch matching pinned contract fixtures (`2026-11-14T12:00:00Z`).
const CONTRACT_BASE_EPOCH_MS: u64 = 1_794_657_600_000;

/// ARINC 653 logical partition identifiers for `ARES-MedOS`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PartitionId {
    TelemetryIngest,
    CausalOdeStl,
    TimestralForecaster,
    MedOpsUiShell,
}

impl PartitionId {
    #[inline]
    pub const fn label(self) -> &'static str {
        match self {
            Self::TelemetryIngest => "INGEST",
            Self::CausalOdeStl => "CAUSAL_ODE_STL",
            Self::TimestralForecaster => "TIMESTRAL",
            Self::MedOpsUiShell => "MEDOPS_SHELL",
        }
    }
}

/// Runtime health status for a single ARINC 653 partition.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Arinc653PartitionHealth {
    pub id: PartitionId,
    pub label: String,
    pub healthy: bool,
    pub last_latency_us: u64,
}

/// Deep-space One-Way Light Time (OWLT) Mars communication state (`NASA-STD-3001 [V1 3006]`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OwltMarsCommState {
    pub owlt_seconds: f32,
    pub eimo_autonomous_active: bool,
    pub blackout_active: bool,
    pub label: String,
}

/// Primary telemetry source selection mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default, clap::ValueEnum)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TelemetrySourceMode {
    /// Deterministic replay from a terrestrial CSV dataset (e.g. PhysioNet BIDMC v1.0.0).
    #[default]
    RecordedReplay,
    /// Live hardware streaming from wearable nodes (e.g. Oxide Hubris / Embassy via Tier C).
    LiveWearableHardware,
}

/// Maximum timeout without wearable packets before signaling sensor loss (3.0 seconds).
pub const WEARABLE_STALE_TIMEOUT: Duration = Duration::from_secs(3);

/// Unified OS status bar state exposed by both Tauri IPC and `GET /api/os-status`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OsStatusBarState {
    pub shell_name: String,
    pub shell_version: String,
    pub transport_mode: String,
    pub host_os: String,
    pub host_arch: String,
    pub air_gapped: bool,
    pub ws_mirror_active: bool,
    pub engine_tick_latency_us: u64,
    pub target_ipc_budget_us: u64,
    pub sol_number: u32,
    pub mission_elapsed_s: f64,
    pub owlt: OwltMarsCommState,
    pub partitions: Vec<Arinc653PartitionHealth>,
    pub habitat_zone: HabitatZoneId,
    pub violates_policy: bool,
    pub eva_airlock_forbidden: bool,
    pub storm_shelter_mandatory: bool,
    pub radiation_dose_rate_msv_d: f64,
    pub seu_restart_count: u16,
    pub hrv_unavailable: bool,
    pub model_validation_status: ares_core_types::telemetry::ModelValidationStatus,
}

/// Typed initialization errors for the `ares-server-cli` runtime.
#[derive(Debug, Error)]
pub enum ServerRuntimeError {
    #[error("telemetry ingest error: {0}")]
    Ingest(#[from] IngestError),
    #[error("timestral / NQS-STL error: {0}")]
    NqsStl(#[from] NqsStlError),
    #[error("causal / hypergraph error: {0}")]
    CausalGraph(#[from] CausalGraphError),
}

/// Why a demo anomaly injection request was refused.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum InjectAnomalyError {
    #[error("personal baseline still being learned ({samples}/{required} s); retry afterwards")]
    BaselineLearning { samples: u32, required: u32 },
    #[error(
        "the event lasts {duration_s} s but only {seconds_left} s are left before the record restarts and the personal baseline is re-learned; retry after the restart"
    )]
    CrossesRecordRestart { duration_s: u64, seconds_left: u64 },
    #[error("mission state unavailable")]
    StateUnavailable,
}

/// Returns the initial nominal scenario for mission startup.
#[inline]
pub fn default_scenario_input() -> StressTestScenarioInput {
    StressTestScenarioInput {
        source_record_id: "bidmc_01".to_string(),
        flight_day: 45,
        ared_daily_load_kgf: 128.0,
        radiation_dose_rate_msv_d: 0.45,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
        pocus_thrombus_confirmed: false,
        systolic_bp_drop_mmhg: 3.0,
    }
}

/// Resolves in O(1) the primary ADHG node associated with the active MedOps Playbook.
#[inline]
pub fn primary_adhg_node_for_playbook(playbook_id: &str) -> AdhgNodeKind {
    match playbook_id {
        "PLAYBOOK_01_VENOUS_STASIS_LBNP" => AdhgNodeKind::IjvVenousStasisShearStress,
        "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS" => AdhgNodeKind::PocusThrombusPosterior,
        "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED" => AdhgNodeKind::AredMechanicalLoad,
        "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION" => AdhgNodeKind::SansTranslaminarGradient,
        "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS" => AdhgNodeKind::CansRadiationOxidativeStress,
        "PLAYBOOK_06_HYPOXEMIA_DESATURATION"
        | "PLAYBOOK_07_HEART_RATE_ANOMALY"
        | "PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS"
        | "PLAYBOOK_07_ACUTE_TACHYCARDIA"
        | "PLAYBOOK_08_SENSOR_SIGNAL_LOSS"
        | "PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK"
        | "PLAYBOOK_08_ACUTE_BRADYPNEA_RESPIRATORY"
        | "PLAYBOOK_09_MULTIPARAMETER_DETERIORATION"
        | "PLAYBOOK_09_MULTICHANNEL_CARDIORESPIRATORY_DRIFT" => {
            AdhgNodeKind::EndothelialProtectiveSecretome
        }
        "PLAYBOOK_10_RENAL_LITHIASIS" => AdhgNodeKind::RenalSupersaturationRsr,
        "PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING" => AdhgNodeKind::PlasmaVolumeOrthostatic,
        "PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE" => AdhgNodeKind::MarsCircadianCognitiveFatigue,
        "PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR" => AdhgNodeKind::NeuroImmuneViralReactivation,
        "PLAYBOOK_14_CO2_SCRUBBER_SANS" => AdhgNodeKind::CabinHypercapniaEnv,
        "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE" => AdhgNodeKind::EndothelialProtectiveSecretome,
        _ => AdhgNodeKind::AredMechanicalLoad,
    }
}

/// Runs a single deterministic cycle (GATHER -> EVALUATE -> ACT) in < 150 microseconds.
pub fn compute_mission_telemetry_tick(
    replayer: &mut BidmcReplayer,
    sqi_filter: &mut SqiFilter,
    adhg_engine: &mut AdhgCausalEngine,
    scenario: &StressTestScenarioInput,
    mission_elapsed_s: f64,
) -> TelemetryPacket {
    let row = replayer.next_row().clone();
    let eval = sqi_filter.evaluate_row_detailed(&row);
    let biometrics = biometrics_with_signal_quality(&row, scenario, &eval);
    let circadian_osc = MarsCircadianOscillator::default();
    compute_mission_telemetry_tick_from_row(
        &row,
        biometrics,
        adhg_engine,
        &circadian_osc,
        scenario,
        2.3,
        mission_elapsed_s,
        false,
        None,
        None,
        None,
        VitalsContext::default(),
        Runtime360Overrides::default(),
    )
    .0
}

/// Vitals anomaly inputs of one tick: the latest detector report, whether
/// the row carries a synthetic injected event, and an optional source override.
#[derive(Debug, Clone, Copy, Default)]
struct VitalsContext<'a> {
    report: Option<&'a VitalsAnomalyReport>,
    injected: bool,
    source_override: Option<BiometricsSource>,
}

/// Live Phase-1 / 360-degree runtime overrides passed into tick evaluation.
#[derive(Debug, Clone)]
struct Runtime360Overrides {
    helmet_ppco2_override_mmhg: Option<f64>,
    affected_crew_count: usize,
    platelet_count_k_ul: Option<f64>,
    lbnp_baseline: Option<LbnpBaselineState>,
    crew_profile: CrewBiologicalProfile,
    pelvic_pocus: Option<PocusPelvicScan>,
    medical_360_scenario: Option<Aerospace360ScenarioInput>,
    medical_inventory: MedicalConsumableInventory,
}

impl Default for Runtime360Overrides {
    fn default() -> Self {
        Self {
            helmet_ppco2_override_mmhg: None,
            affected_crew_count: 1,
            platelet_count_k_ul: None,
            lbnp_baseline: None,
            crew_profile: CrewBiologicalProfile::default(),
            pelvic_pocus: None,
            medical_360_scenario: None,
            medical_inventory: MedicalConsumableInventory::mars_exmc_baseline(),
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn compute_mission_telemetry_tick_from_row(
    row: &BidmcNumericRow,
    mut biometrics: Biometrics,
    adhg_engine: &mut AdhgCausalEngine,
    circadian_osc: &MarsCircadianOscillator,
    scenario: &StressTestScenarioInput,
    cabin_ppco2_mmhg: f64,
    mission_elapsed_s: f64,
    what_if_active: bool,
    mut spot_poct: Option<SpotPoctPanel>,
    efast_scan: Option<&PocusEfastScan>,
    renal_pocus: Option<&PocusRenalBladderScan>,
    vitals: VitalsContext<'_>,
    overrides: Runtime360Overrides,
) -> (TelemetryPacket, f64, Vec<String>) {
    let sanitized_cabin_co2 = sanitize_f64(cabin_ppco2_mmhg, 2.2);
    biometrics.cabin_ppco2_mmhg = Some(sanitized_cabin_co2);
    let sanitized_helmet_co2 = overrides
        .helmet_ppco2_override_mmhg
        .or(biometrics.helmet_ppco2_mmhg)
        .map_or(sanitized_cabin_co2, |v| sanitize_f64(v, sanitized_cabin_co2));
    biometrics.helmet_ppco2_mmhg = Some(sanitized_helmet_co2);

    let effective_platelets = resolve_effective_platelets_k_ul(
        overrides.platelet_count_k_ul,
        spot_poct.as_ref(),
        biometrics.platelet_count_k_ul,
        None,
    );
    if let Some(plt) = effective_platelets {
        biometrics.platelet_count_k_ul = Some(plt);
        if let Some(ref mut poct) = spot_poct {
            poct.platelet_count_k_ul = Some(plt);
        }
    }

    // 2. EVALUATE (Part 1): Musculoskeletal RK4 ODE + Multi-Organ Modules Block N (Condition 5)
    let musculo = compute_musculoskeletal_state(scenario.flight_day, scenario.ared_daily_load_kgf);
    let effective_sbp = biometrics
        .sbp_mmhg
        .or_else(|| what_if_active.then_some((120.0 - scenario.systolic_bp_drop_mmhg).max(65.0)));
    let orthostatic = compute_orthostatic_fluid_state(
        scenario.flight_day,
        biometrics.heart_rate_bpm,
        effective_sbp,
        false,
        spot_poct.as_ref(),
    );
    let (jugular, sans) = compute_jugular_and_sans_state_ext(
        &musculo,
        scenario,
        Some(orthostatic.apparent_blood_viscosity_poise),
        Some(cabin_ppco2_mmhg),
    );
    let renal = compute_renal_nephrolithiasis_state(
        musculo.urinary_calcium_mg_d,
        2.4,
        cabin_ppco2_mmhg,
        false,
        spot_poct.as_ref(),
        renal_pocus.is_some_and(|r| r.is_colic_risk()),
        renal_pocus.map_or(110.0, |r| r.post_void_bladder_volume_ml),
    );
    let circadian = circadian_osc.evaluate_state(
        mission_elapsed_s,
        biometrics.melanopic_edi_lux,
        biometrics.vocal_jitter_pct,
        spot_poct.as_ref(),
    );
    let immune = compute_neuro_immune_viral_state(
        biometrics.rmssd_ms,
        biometrics.radiation_dose_rate_msv_d,
        circadian.homeostatic_sleep_pressure_s,
        spot_poct.as_ref(),
        false,
    );

    let (pocus_est, causal_chain) = adhg_engine.update_and_extract_causal_chain_ext(
        &musculo,
        &jugular,
        &sans,
        biometrics.radiation_dose_rate_msv_d,
        cabin_ppco2_mmhg,
        Some(&renal),
        Some(&orthostatic),
        Some(&circadian),
        Some(&immune),
    );

    // 2. EVALUATE (Part 2): 10-predicate normalized NQS-STL margins and Mission Readiness Index
    let (nqs_stl, nqs_severity) = evaluate_nqs_stl_and_mri_ext(
        &biometrics,
        &musculo,
        &jugular,
        &sans,
        Some(&renal),
        Some(&orthostatic),
        Some(&circadian),
        Some(&immune),
    );
    let anomaly_status = vitals.report.map_or(AnomalyStatus::Normal, |r| r.overall);
    let alert_severity = nqs_severity.max(match anomaly_status {
        AnomalyStatus::Normal => AlertSeverity::Nominal,
        AnomalyStatus::Attention => AlertSeverity::Caution,
        AnomalyStatus::Alarm => AlertSeverity::Warning,
    });

    // 3. ACT: Deterministic Playbook #01-#30 selection, coupled ECLSS diagnosis, and Safety Gates 1-7
    let eclss_diag =
        evaluate_coupled_habitat_crew_co2(&biometrics, overrides.affected_crew_count);
    let max_ppco2_mmhg = biometrics
        .cabin_ppco2_mmhg
        .into_iter()
        .chain(biometrics.helmet_ppco2_mmhg)
        .fold(0.0_f64, f64::max);
    let scrubber_override_active = matches!(
        eclss_diag.root_cause,
        HypercapniaRootCause::EnvironmentalEclssScrubberSaturation
            | HypercapniaRootCause::SuitOrHelmetVentilationFault
    );
    let root_cause_label = match eclss_diag.root_cause {
        HypercapniaRootCause::Nominal => "Nominal",
        HypercapniaRootCause::EarlyEnvironmentalSansWarning => "EarlyEnvironmentalSansWarning",
        HypercapniaRootCause::EnvironmentalEclssScrubberSaturation => {
            "EnvironmentalEclssScrubberSaturation"
        }
        HypercapniaRootCause::SuitOrHelmetVentilationFault => "SuitOrHelmetVentilationFault",
        HypercapniaRootCause::IsolatedCrewPathology => "IsolatedCrewPathology",
    }
    .to_string();
    let eclss_summary = EclssCoupledSummary {
        max_ppco2_mmhg,
        cabin_ppco2_mmhg: biometrics.cabin_ppco2_mmhg,
        helmet_ppco2_mmhg: biometrics.helmet_ppco2_mmhg,
        affected_crew_count: overrides.affected_crew_count,
        root_cause_label,
        scrubber_override_active,
        emergency_pba_o2_mask_required: max_ppco2_mmhg >= ECLSS_PPCO2_EMERGENCY_MMHG,
        validation_status:
            ares_core_types::telemetry::ModelValidationStatus::IllustrativeUnvalidated,
    };

    // Phase 2 (6 Aerospace 360 Domains)
    let creatinine_mg_dl = spot_poct
        .as_ref()
        .and_then(|p| p.creatinine_mg_dl)
        .unwrap_or(0.9);
    let sex_physio = evaluate_sex_physiology(&overrides.crew_profile, creatinine_mg_dl);

    let s360 = overrides.medical_360_scenario.as_ref();
    let radiation_ars_state = s360.and_then(|s| s.radiation_ars.as_ref()).map(|rad_in| {
        evaluate_radiation_ars_with_gates(
            rad_in,
            sex_physio.reid_multiplier,
            biometrics.radiation_dose_rate_msv_d,
            None,
            effective_platelets,
        )
        .state
    });

    let (acute_triage_input, acute_emergency_state) =
        if s360.is_some() || overrides.pelvic_pocus.is_some() {
            let s_ref = s360.cloned().unwrap_or_default();
            let acute_in = AcuteEmergencyTriageInput {
                cpr: MicrogravityCprInput {
                    pulseless_cardiac_arrest: s_ref.pulseless_cardiac_arrest,
                    ..Default::default()
                },
                anaphylaxis: AnaphylaxisInput {
                    post_allergen_exposure: s_ref.anaphylaxis_suspected,
                    acute_urticaria_or_angioedema: s_ref.anaphylaxis_suspected,
                    bronchospasm_or_stridor: s_ref.anaphylaxis_suspected,
                },
                hemorrhage: HemorrhagicTraumaInput {
                    external_trauma_or_laceration: s_ref.active_arterial_hemorrhage,
                    active_arterial_bleed: s_ref.active_arterial_hemorrhage,
                    injury_hours_elapsed: s_ref.injury_hours_elapsed,
                    active_intravascular_thrombosis: jugular.pocus_thrombus_confirmed,
                },
                torso_shock: TorsoShockInput {
                    efast_subxiphoid_pericardial_effusion: efast_scan
                        .is_some_and(|e| e.subxiphoid_pericardial_effusion),
                    efast_abdominal_free_fluid: efast_scan
                        .is_some_and(|e| e.morison_pouch_free_fluid),
                    ..Default::default()
                },
                acute_abdomen: AcuteAbdomenNomInput {
                    rlq_or_ruq_syndrome: s_ref.acute_abdomen_nom_suspected,
                    wbc_k_ul: spot_poct.as_ref().and_then(|p| p.wbc_k_ul),
                    core_temp_c: biometrics.core_temp_celsius,
                    ..Default::default()
                },
                eva_msk: EvaMskSpineInput {
                    eva_glove_or_hut_trauma: s_ref.eva_musculoskeletal_trauma,
                    bmd_loss_pct: (1.0 - musculo.mqi_index).max(0.0) * 10.0,
                    ..Default::default()
                },
                dental: DentalMaxillofacialInput {
                    submandibular_airway_threat: s_ref.dental_ludwigs_angina_threat,
                    periapical_abscess: s_ref.dental_ludwigs_angina_threat,
                    ..Default::default()
                },
                ocular: OcularEmergencyInput {
                    chemical_splash_nh3_lioh_propellant: s_ref.ocular_chemical_or_fb_injury,
                    seidel_perforation_positive: s_ref.seidel_perforation_positive,
                    ..Default::default()
                },
                aur: AcuteUrinaryRetentionInput {
                    bladder_volume_ml: renal_pocus.map(|r| r.post_void_bladder_volume_ml),
                    platelet_count_k_ul: effective_platelets,
                    ..Default::default()
                },
                pelvic: PelvicUrogynInput {
                    pelvic_pocus: overrides.pelvic_pocus.unwrap_or_default(),
                    febrile_or_flank_pain: biometrics
                        .core_temp_celsius
                        .is_some_and(|t| t >= 38.0),
                },
            };
            let acute_summary = evaluate_acute_emergencies_triage(&biometrics, &acute_in);
            let acute_state = AcuteEmergencyState {
                shock_index: acute_summary
                    .hemorrhage
                    .shock_index
                    .or(Some(orthostatic.shock_index)),
                pulseless_cardiac_arrest: s_ref.pulseless_cardiac_arrest,
                anaphylaxis_suspected: s_ref.anaphylaxis_suspected,
                active_arterial_hemorrhage: s_ref.active_arterial_hemorrhage,
                injury_hours_elapsed: s_ref.injury_hours_elapsed,
                acute_abdomen_nom_suspected: s_ref.acute_abdomen_nom_suspected,
                dental_ludwigs_angina_threat: s_ref.dental_ludwigs_angina_threat,
                ocular_chemical_or_fb_injury: s_ref.ocular_chemical_or_fb_injury,
                seidel_perforation_positive: s_ref.seidel_perforation_positive,
                eva_musculoskeletal_trauma: s_ref.eva_musculoskeletal_trauma,
                acute_urinary_retention_ml: renal_pocus.map(|r| r.post_void_bladder_volume_ml),
                pelvic_emergency_flag: acute_summary.pelvic.triggered,
                active_acute_playbook_code: acute_summary.active_acute_playbook_code,
                validation_status:
                    ares_core_types::telemetry::ModelValidationStatus::IllustrativeUnvalidated,
            };
            (Some(acute_in), Some(acute_state))
        } else {
            (None, None)
        };

    let tox_assessment = s360.map(|s| {
        evaluate_from_scenario_input(s, &biometrics, spot_poct.as_ref(), &overrides.crew_profile)
    });
    let toxicology_dcs_state = tox_assessment.as_ref().map(|t| t.state.clone());

    let mission_sol = scenario.flight_day as f64;
    let cumulative_habitat_gcr_gy = 0.0;
    let current_qtc_ms = s360.and_then(|s| s.current_qtc_ms);
    let gi_ulcer_history_or_bleed = s360.is_some_and(|s| s.gi_ulcer_history_or_bleed);
    let sepsis_source_identified = s360.is_some_and(|s| s.suspected_infection);
    let pharmacology_sepsis_state = evaluate_pharmacology_sepsis_state(
        &overrides.crew_profile,
        spot_poct.as_ref(),
        biometrics.resp_rate_brpm,
        effective_sbp,
        biometrics.dbp_mmhg,
        biometrics.core_temp_celsius,
        Some(circadian.pvt_lapse_probability),
        sepsis_source_identified,
        current_qtc_ms,
        mission_sol,
        cumulative_habitat_gcr_gy,
        Some(&overrides.medical_inventory),
    );

    let bmed_state = s360.map(|s| {
        let toxicant_active = toxicology_dcs_state.as_ref().is_some_and(|t| {
            t.nh3_ppm >= 25.0
                || t.mmh_ppm >= 0.2
                || t.no2_ppm >= 1.0
                || t.co_ppm >= 35.0
                || t.hcn_ppm >= 4.7
                || t.methemoglobin_pct >= 10.0
        });
        let bmed_in = BMedScreeningInput {
            phq9_score: s.phq9_score,
            gad7_score: s.gad7_score,
            cssrs_suicidal_ideation_level: s.cssrs_suicidal_ideation_level,
            acute_agitation_or_psychosis: s.acute_agitation_or_psychosis,
            imminent_harm_to_self_or_vehicle: s.imminent_harm_to_self_or_vehicle,
            spo2_pct: biometrics.spo2_pct,
            max_ppco2_mmhg: Some(max_ppco2_mmhg),
            core_temp_c: biometrics.core_temp_celsius,
            lactate_mmol_l: spot_poct.as_ref().and_then(|p| p.lactate_mmol_l),
            toxicant_active,
            circadian_cognitive: Some(CircadianCognitiveState::from(&circadian)),
        };
        evaluate_bmed_state(&bmed_in).state
    });

    let mut candidate_playbook = select_active_playbook_360(
        &biometrics,
        &musculo,
        &jugular,
        &nqs_stl,
        causal_chain.clone(),
        efast_scan,
        renal_pocus,
        vitals.report,
        scenario.flight_day,
        Some(circadian.pvt_lapse_probability),
        Some(immune.viral_reactivation_risk_pct),
        Some(&overrides.crew_profile),
        spot_poct.as_ref(),
        radiation_ars_state.as_ref(),
        acute_triage_input.as_ref(),
        tox_assessment.as_ref(),
        bmed_state.as_ref(),
        true,
        current_qtc_ms.or(Some(pharmacology_sepsis_state.effective_qtc_ms)),
        sepsis_source_identified,
    )
    .unwrap_or_else(|| {
        select_candidate_playbook_ext(
            &biometrics,
            &musculo,
            &jugular,
            &nqs_stl,
            causal_chain.clone(),
            efast_scan,
            renal_pocus,
            vitals.report,
            scenario.flight_day,
            Some(circadian.pvt_lapse_probability),
            Some(immune.viral_reactivation_risk_pct),
        )
    });
    if scrubber_override_active && !eclss_diag.recommended_override_actions.is_empty() {
        let mut merged = Vec::with_capacity(
            eclss_diag.recommended_override_actions.len() + candidate_playbook.actions.len(),
        );
        for act in eclss_diag.recommended_override_actions {
            if !merged
                .iter()
                .any(|existing: &CountermeasureAction| existing.action_id == act.action_id)
            {
                merged.push(act);
            }
        }
        for act in candidate_playbook.actions {
            if !merged.iter().any(|existing| existing.action_id == act.action_id) {
                merged.push(act);
            }
        }
        candidate_playbook.actions = merged;
    }
    let (active_playbook, extended_safety_gates) = enforce_all_clinical_safety_gates_360(
        candidate_playbook,
        &biometrics,
        &musculo,
        &jugular,
        scenario,
        efast_scan,
        Some(circadian.pvt_lapse_probability),
        Some(orthostatic.shock_index),
        overrides.lbnp_baseline,
        spot_poct.as_ref(),
        Some(&overrides.crew_profile),
        radiation_ars_state.as_ref(),
        Some(&overrides.medical_inventory),
        mission_sol,
        cumulative_habitat_gcr_gy,
        current_qtc_ms,
        gi_ulcer_history_or_bleed,
        bmed_state.as_ref(),
    );

    let system_phase = if nqs_stl.has_known_violation()
        || jugular.pocus_thrombus_confirmed
        || anomaly_status == AnomalyStatus::Alarm
    {
        SystemPhase::Act
    } else {
        SystemPhase::Evaluate
    };

    let packet = TelemetryPacket {
        timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
        mission_Elapsed_seconds: mission_elapsed_s,
        relative_recording_time_s: row.relative_time_s,
        source_record_id: row.record_id.clone(),
        flight_day: scenario.flight_day,
        astronaut_id: "ARES-CDR-01".to_string(),
        system_phase,
        alert_severity,
        model_validation_status:
            ares_core_types::telemetry::ModelValidationStatus::IllustrativeUnvalidated,
        provenance_manifest: ProvenanceManifest {
            biometrics_source: if let Some(src) = vitals.source_override {
                src
            } else if vitals.injected {
                BiometricsSource::SimulatedScenarioInput
            } else {
                BiometricsSource::RecordedTerrestrialBidmcCsv
            },
            biometrics_native_rate_hz: 1.0,
            ui_refresh_rate_hz: 20.0,
            scenario_overlay_mode: if what_if_active {
                ScenarioOverlayMode::SimulatedWhatifScenario
            } else {
                ScenarioOverlayMode::NonePureReplay
            },
            biological_context_refs: vec![
                "PhysioNet-BIDMC-v1.0.0".to_string(),
                "NASA-OSDR-OSD-51-195-818".to_string(),
                "NASA-NLSP-0000100".to_string(),
                "NASA-STD-3001-V1C-V2F".to_string(),
            ],
        },
        biometrics,
        musculoskeletal: musculo,
        jugular_hemodynamics: jugular,
        sans_ocular: sans,
        nqs_stl,
        active_playbook,
        spot_poct,
        renal_nephrolithiasis: Some(renal),
        orthostatic_fluid: Some(orthostatic),
        mars_circadian_sleep: Some(circadian),
        neuro_immune_viral: Some(immune),
        aerospace_360: Some(AerospaceMedical360State {
            crew_profile: overrides.crew_profile.clone(),
            lbnp_baseline: overrides.lbnp_baseline,
            eclss_coupled: Some(eclss_summary),
            radiation_ars: radiation_ars_state,
            acute_emergency: acute_emergency_state,
            toxicology_dcs: toxicology_dcs_state,
            pharmacology_sepsis: Some(pharmacology_sepsis_state),
            behavioral_health: bmed_state,
            extended_safety_gates,
        }),
    };
    (packet, pocus_est.thrombus_posterior, causal_chain)
}

/// Immutable snapshot extracted for the FastMCP router (< 150 tokens Context-Mode).
#[derive(Debug, Clone)]
pub struct FastMcpRuntimeContext {
    pub latest_packet: TelemetryPacket,
    pub quantile_snapshot: Arc<NqsQuantileForecastSnapshot>,
    pub vitals_anomaly: VitalsAnomalyReport,
    pub heatmap: BodyHeatmap,
    pub habitat_assessment: HabitatDeonticAssessment,
    pub grounding: NormativeClinicalGrounding,
    pub dataset_graph: Arc<AresUnifiedDatasetGraph>,
}

/// Coherent publication data. Captured under the mission lock; JSON conversion
/// and encoding happen only after that lock has been released.
struct MissionWireSnapshot {
    latest_quantile_snapshot: Arc<NqsQuantileForecastSnapshot>,
    latest_anomaly: VitalsAnomalyReport,
    replay_elapsed: Duration,
    injection: Option<AnomalyInjection>,
    latest_heatmap: BodyHeatmap,
    latest_habitat_assessment: HabitatDeonticAssessment,
    latest_grounding: NormativeClinicalGrounding,
    latest_packet: TelemetryPacket,
    scenario: StressTestScenarioInput,
    what_if_active: bool,
    cabin_ppco2_mmhg: f64,
    latest_pocus_posterior: f64,
    latest_causal_chain: Vec<String>,
    latest_recompute_latency_us: u64,
}

impl MissionWireSnapshot {
    fn into_wire_packet(self) -> WireTelemetryPacket {
        let timestral_quantiles =
            serde_json::to_value(&*self.latest_quantile_snapshot).unwrap_or(serde_json::Value::Null);
        let mut vitals_anomaly =
            serde_json::to_value(&self.latest_anomaly).unwrap_or(serde_json::Value::Null);
        if let Some(obj) = vitals_anomaly.as_object_mut() {
            let now_s = self.replay_elapsed.as_secs() as f64;
            let injection = self.injection.filter(|i| i.is_active(now_s)).map(|i| {
                serde_json::json!({
                    "kind": i.kind,
                    "description": i.kind.description(),
                    "onset_s": i.onset_s,
                    "elapsed_s": now_s - i.onset_s,
                    "duration_s": i.kind.duration_s(),
                })
            });
            obj.insert("injection".to_string(), serde_json::json!(injection));
        }
        let hypergraph_spatial = serde_json::json!({
            "hottest_region": self.latest_heatmap.hottest_region,
            "cells": self.latest_heatmap.cells,
            "habitat_zone": self.latest_habitat_assessment.current_zone,
            "violates_policy": self.latest_habitat_assessment.violates_policy,
            "rho_current_location": self.latest_habitat_assessment.rho_current_location,
            "biokg_clause": self.latest_grounding.normative_clause.official_code(),
        });
        WireTelemetryPacket::from_context(WirePacketContext {
            packet: &self.latest_packet,
            scenario: &self.scenario,
            what_if_active: self.what_if_active,
            cabin_ppco2_mmhg: self.cabin_ppco2_mmhg,
            pocus_posterior: self.latest_pocus_posterior,
            causal_chain: self.latest_causal_chain,
            timestral_quantiles,
            vitals_anomaly,
            hypergraph_spatial,
            recompute_latency_us: self.latest_recompute_latency_us,
        })
    }
}

/// Internal mutable state protected by RwLock for the 20 Hz pipeline, Timestral 1 Hz, and HyperGraph.
pub struct MissionRuntimeInner {
    pub replayer: BidmcReplayer,
    pub sqi_filter: SqiFilter,
    pub signal_quality: SqiEvaluation,
    pub adhg_engine: AdhgCausalEngine,
    pub scenario: StressTestScenarioInput,
    pub replay_elapsed: Duration,
    pub mission_elapsed_s: f64,
    pub what_if_active: bool,
    pub cabin_ppco2_mmhg: f64,
    pub latest_pocus_posterior: f64,
    pub latest_causal_chain: Vec<String>,
    pub latest_recompute_latency_us: u64,
    pub latest_packet: TelemetryPacket,
    pub nqs_engine: NqsEngine,
    pub forecaster_engine: AresTemporalForecasterEngine,
    pub ewma_forecaster: EwmaResidualForecaster,
    pub latest_short_horizon_cones: Vec<ShortHorizonCone>,
    pub latest_short_horizon_abstention: Option<AbstentionCertificate>,
    pub has_timestral_inference: bool,
    pub anomaly_detector: VitalsAnomalyDetector,
    pub latest_anomaly: VitalsAnomalyReport,
    /// Synthetic demo event currently scheduled on the replay clock, if any.
    pub injection: Option<AnomalyInjection>,
    pub longitudinal_compactor: MissionLongitudinalCompactor,
    pub anatomical_subgraph: AnatomicalRegionSubgraph,
    pub latest_heatmap: BodyHeatmap,
    pub habitat_policy: HabitatZoneDeonticPolicy,
    pub habitat_state: HabitatEnvironmentState,
    pub latest_habitat_assessment: HabitatDeonticAssessment,
    pub zone_markov: ZoneTransitionMarkovModel,
    pub latest_quantile_snapshot: Arc<NqsQuantileForecastSnapshot>,
    pub latest_grounding: NormativeClinicalGrounding,
    pub circadian_oscillator: MarsCircadianOscillator,
    pub spot_poct: Option<SpotPoctPanel>,
    pub tick_counter: u64,
    pub seu_restart_count: u16,
    pub owlt_delay_sec: f32,
    pub eimo_autonomous_active: bool,
    pub last_timestral_latency_us: u64,
    pub last_ingest_latency_us: u64,
    pub source_mode: TelemetrySourceMode,
    pub last_wearable_packet_time: Option<Instant>,
    pub active_wearable_node: Option<u8>,
    pub last_wearable_sequence: Option<u32>,
    pub last_wearable_uptime_ms: Option<u32>,
    pub wearable_stale: bool,
    pub helmet_ppco2_override_mmhg: Option<f64>,
    pub affected_crew_count: usize,
    pub affected_crew_count_overridden: bool,
    pub platelet_count_k_ul: Option<f64>,
    pub lbnp_baseline: Option<LbnpBaselineState>,
    pub last_valid_sbp_hr: (f64, f64),
    pub efast_scan: Option<PocusEfastScan>,
    pub renal_pocus: Option<PocusRenalBladderScan>,
    pub crew_profile: CrewBiologicalProfile,
    pub pelvic_pocus: Option<PocusPelvicScan>,
    pub medical_360_scenario: Option<Aerospace360ScenarioInput>,
    pub medical_inventory: MedicalConsumableInventory,
}

impl MissionRuntimeInner {
    fn runtime_360_overrides(&self) -> Runtime360Overrides {
        Runtime360Overrides {
            helmet_ppco2_override_mmhg: self.helmet_ppco2_override_mmhg,
            affected_crew_count: self.affected_crew_count,
            platelet_count_k_ul: self.platelet_count_k_ul,
            lbnp_baseline: self.lbnp_baseline,
            crew_profile: self.crew_profile.clone(),
            pelvic_pocus: self.pelvic_pocus,
            medical_360_scenario: self.medical_360_scenario.clone(),
            medical_inventory: self.medical_inventory.clone(),
        }
    }

    fn refresh_pre_lbnp_vitals_baseline(&mut self) {
        if !self.scenario.lbnp_active {
            if let Some(sbp) = self
                .latest_packet
                .biometrics
                .sbp_mmhg
                .filter(|v| v.is_finite() && *v > 0.0)
            {
                self.last_valid_sbp_hr.0 = sbp;
            }
            if let Some(hr) = self
                .latest_packet
                .biometrics
                .heart_rate_bpm
                .filter(|v| v.is_finite() && *v > 0.0)
            {
                self.last_valid_sbp_hr.1 = hr;
            }
        }
    }

    fn merge_short_horizon_into_snapshot(&mut self) {
        let mut snap = (*self.latest_quantile_snapshot).clone();
        snap.ewma_short_horizon_max_s =
            EWMA_SHORT_HORIZONS_SECONDS[EWMA_SHORT_HORIZONS_SECONDS.len() - 1];
        snap.short_horizon_cones = self.latest_short_horizon_cones.clone();
        snap.short_horizon_abstention = self.latest_short_horizon_abstention.clone();
        snap.forecast_method = if !snap.short_horizon_cones.is_empty() {
            if self.has_timestral_inference {
                ForecastMethod::HybridTimestralAndEwmaShortHorizon
            } else {
                ForecastMethod::EwmaEmpiricalResidualQuantiles
            }
        } else if self.has_timestral_inference {
            ForecastMethod::TimestralGreyBox1Hz
        } else {
            ForecastMethod::DeterministicColdStart
        };
        self.latest_quantile_snapshot = Arc::new(snap);
    }

    /// Row at the current replay second, with the active synthetic event (if any)
    /// applied, and whether it was modified by that event.
    fn current_replay_row(&self) -> (BidmcNumericRow, bool) {
        let second = self.replay_elapsed.as_secs();
        let total_rows = self.replayer.len().max(1) as u64;
        let recorded = self.replayer.row_at_second((second % total_rows) as usize);
        match self.injection {
            Some(injection) if injection.is_active(second as f64) => {
                (injection.apply(recorded, second as f64), true)
            }
            _ => (recorded.clone(), false),
        }
    }

    fn ingest_short_horizon_sample(&mut self) {
        let pkt = &self.latest_packet;
        let sample = AresMultivariateSample::from_telemetry_components(
            pkt.relative_recording_time_s,
            &pkt.biometrics,
            &pkt.musculoskeletal,
            &pkt.jugular_hemodynamics,
            &pkt.sans_ocular,
            pkt.nqs_stl.rho_global,
        );
        let (cones, abstention) = self.ewma_forecaster.ingest_short_horizon_1hz(&sample);
        self.latest_short_horizon_cones = cones;
        self.latest_short_horizon_abstention = Some(abstention);
    }

    fn update_hypergraph_and_nqs_hot_path(&mut self) {
        let eval = {
            let pkt = &self.latest_packet;
            self.nqs_engine.evaluate_tick_ext(
                pkt.relative_recording_time_s,
                &pkt.biometrics,
                &pkt.musculoskeletal,
                &pkt.jugular_hemodynamics,
                &pkt.sans_ocular,
                pkt.renal_nephrolithiasis.as_ref(),
                pkt.orthostatic_fluid.as_ref(),
                pkt.mars_circadian_sleep.as_ref(),
                pkt.neuro_immune_viral.as_ref(),
            )
        };
        self.latest_packet.nqs_stl = eval.margins;
        self.latest_quantile_snapshot = eval.quantile_snapshot;
        self.merge_short_horizon_into_snapshot();
        let pkt = &self.latest_packet;

        let tick = PhysiologicalTick {
            tau_w_dyn_cm2: pkt.jugular_hemodynamics.tau_w_dyn_cm2,
            sost_pmol_l: pkt.musculoskeletal.sclerostin_pmol_l,
            mqi: pkt.musculoskeletal.mqi_index,
            sans_index: pkt.sans_ocular.sans_risk_index,
            rho_global: pkt.nqs_stl.rho_global,
        };
        let _ = self
            .longitudinal_compactor
            .observe(self.mission_elapsed_s, &tick);

        let risk_inputs = AnatomicalRiskInputs {
            sans_index: Some(pkt.sans_ocular.sans_risk_index),
            tau_w_dyn_cm2: Some(pkt.jugular_hemodynamics.tau_w_dyn_cm2),
            rmssd_ms: pkt.biometrics.rmssd_ms,
            sost_pmol_l: Some(pkt.musculoskeletal.sclerostin_pmol_l),
            mqi_deficit_fraction: Some((1.0 - pkt.musculoskeletal.mqi_index).clamp(0.0, 1.0)),
            gai_pct: Some(pkt.musculoskeletal.gai_pct),
        };
        self.latest_heatmap = self.anatomical_subgraph.compute_body_heatmap(&risk_inputs);

        let next_zone = if pkt.biometrics.radiation_dose_rate_msv_d > 1.5 {
            HabitatZoneId::RadiationStormShelter
        } else if pkt.jugular_hemodynamics.pocus_thrombus_confirmed {
            HabitatZoneId::MedOpsUltrasoundBay
        } else if self.scenario.lbnp_active {
            HabitatZoneId::LbnpChamber
        } else {
            HabitatZoneId::SleepQuarters
        };
        if next_zone != self.habitat_state.current_zone {
            self.zone_markov
                .record_transition(self.habitat_state.current_zone, next_zone);
            self.habitat_state.current_zone = next_zone;
        }
        self.habitat_state.radiation_dose_rate_msv_d = pkt.biometrics.radiation_dose_rate_msv_d;
        self.habitat_state.gai_pct = pkt.musculoskeletal.gai_pct;
        self.habitat_state.pocus_thrombus_confirmed =
            pkt.jugular_hemodynamics.pocus_thrombus_confirmed;

        self.latest_habitat_assessment = self.habitat_policy.evaluate(&self.habitat_state);
        let adhg_node = primary_adhg_node_for_playbook(&pkt.active_playbook.playbook_id);
        self.latest_grounding = *ground_adhg_node_o1(adhg_node);
    }

    fn capture_wire(&self) -> MissionWireSnapshot {
        MissionWireSnapshot {
            latest_quantile_snapshot: self.latest_quantile_snapshot.clone(),
            latest_anomaly: self.latest_anomaly.clone(),
            replay_elapsed: self.replay_elapsed,
            injection: self.injection,
            latest_heatmap: self.latest_heatmap.clone(),
            latest_habitat_assessment: self.latest_habitat_assessment.clone(),
            latest_grounding: self.latest_grounding,
            latest_packet: self.latest_packet.clone(),
            scenario: self.scenario.clone(),
            what_if_active: self.what_if_active,
            cabin_ppco2_mmhg: self.cabin_ppco2_mmhg,
            latest_pocus_posterior: self.latest_pocus_posterior,
            latest_causal_chain: self.latest_causal_chain.clone(),
            latest_recompute_latency_us: self.latest_recompute_latency_us,
        }
    }

    fn run_1hz_timestral_inference(
        &mut self,
    ) -> Result<Arc<NqsQuantileForecastSnapshot>, NqsStlError> {
        let pkt = &self.latest_packet;
        let sample = AresMultivariateSample::from_telemetry_components(
            pkt.relative_recording_time_s,
            &pkt.biometrics,
            &pkt.musculoskeletal,
            &pkt.jugular_hemodynamics,
            &pkt.sans_ocular,
            pkt.nqs_stl.rho_global,
        );
        let covariates = KnownFutureCovariates {
            planned_ared_load_kgf: self.scenario.ared_daily_load_kgf,
            planned_lbnp_pressure_mmhg: self.scenario.lbnp_pressure_mmhg,
            scheduled_sleep_window: self.habitat_state.current_zone == HabitatZoneId::SleepQuarters,
        };
        let ode_drift = if self.scenario.ared_daily_load_kgf < 100.0 {
            -0.012
        } else {
            -0.002
        };
        let t_start = Instant::now();
        let snap = self
            .forecaster_engine
            .ingest_sample_1hz(&sample, &covariates, ode_drift)?;
        self.last_timestral_latency_us = t_start.elapsed().as_micros() as u64;
        self.has_timestral_inference = true;
        self.latest_quantile_snapshot = Arc::clone(&snap);
        self.merge_short_horizon_into_snapshot();
        Ok(Arc::clone(&self.latest_quantile_snapshot))
    }

    fn build_binary_frame(&self, ipc_latency_ns: u32) -> BinaryTelemetryFrame {
        let p = &self.latest_packet;
        let offset_ms = if p.relative_recording_time_s.is_finite() {
            (p.relative_recording_time_s.max(0.0) * 1000.0).round() as u64
        } else {
            0
        };
        let timestamp_ms = CONTRACT_BASE_EPOCH_MS.saturating_add(offset_ms);
        let zone = self.latest_habitat_assessment.current_zone;
        let eva_forbidden = self
            .latest_habitat_assessment
            .verdict(HabitatZoneId::EvaAirlock)
            .modality
            == DeonticModality::Forbidden;
        let shelter_mandatory = self
            .latest_habitat_assessment
            .verdict(HabitatZoneId::RadiationStormShelter)
            .modality
            == DeonticModality::Mandatory;

        let mut deontic_habitat_mask = (zone as u8) & 0x07;
        if self.latest_habitat_assessment.violates_policy {
            deontic_habitat_mask |= DEONTIC_VIOLATES_POLICY;
        }
        if eva_forbidden {
            deontic_habitat_mask |= DEONTIC_EVA_FORBIDDEN;
        }
        if shelter_mandatory {
            deontic_habitat_mask |= DEONTIC_SHELTER_MANDATORY;
        }
        if self.eimo_autonomous_active {
            deontic_habitat_mask |= DEONTIC_EIMO_AUTONOMOUS;
        }

        let meta = BinaryFrameMeta {
            seq: self.tick_counter,
            timestamp_ms,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask,
            crs_score: if self.what_if_active {
                Some(self.latest_pocus_posterior)
            } else {
                None
            },
            owlt_delay_sec: self.owlt_delay_sec,
            ipc_latency_ns,
            conformal_abstained: self.latest_quantile_snapshot.abstention_certificate.abstained,
            seu_recovery_active: self.seu_restart_count > 0,
            include_derived_models: self.what_if_active,
        };
        BinaryTelemetryFrame::from_telemetry_packet(p, Some(&self.latest_quantile_snapshot), meta)
    }

    fn owlt_comm_state(&self) -> OwltMarsCommState {
        let mins = (self.owlt_delay_sec / 60.0).floor() as u32;
        let secs = (self.owlt_delay_sec % 60.0).round() as u32;
        let owlt_label = if self.eimo_autonomous_active {
            format!("OWLT: {mins}m {secs:02}s (EIMO AUTONOMOUS)")
        } else {
            format!("OWLT: {:.1}s (LEO NOMINAL)", self.owlt_delay_sec)
        };
        OwltMarsCommState {
            owlt_seconds: self.owlt_delay_sec,
            eimo_autonomous_active: self.eimo_autonomous_active,
            blackout_active: false,
            label: owlt_label,
        }
    }

    fn build_os_status_bar_state(
        &self,
        shell_name: &str,
        shell_version: &str,
        transport_mode: &str,
        air_gapped: bool,
        ws_mirror_active: bool,
    ) -> OsStatusBarState {
        let eva_forbidden = self
            .latest_habitat_assessment
            .verdict(HabitatZoneId::EvaAirlock)
            .modality
            == DeonticModality::Forbidden;
        let shelter_mandatory = self
            .latest_habitat_assessment
            .verdict(HabitatZoneId::RadiationStormShelter)
            .modality
            == DeonticModality::Mandatory;
        let sol_offset = (self.mission_elapsed_s / MARS_SOL_SECONDS).floor().max(0.0) as u32;
        let sol_number = self.latest_packet.flight_day.saturating_add(sol_offset);
        let owlt = self.owlt_comm_state();

        OsStatusBarState {
            shell_name: shell_name.to_string(),
            shell_version: shell_version.to_string(),
            transport_mode: transport_mode.to_string(),
            host_os: std::env::consts::OS.to_string(),
            host_arch: std::env::consts::ARCH.to_string(),
            air_gapped,
            ws_mirror_active,
            engine_tick_latency_us: self.latest_recompute_latency_us,
            target_ipc_budget_us: 50,
            sol_number,
            mission_elapsed_s: self.mission_elapsed_s,
            owlt,
            partitions: vec![
                Arinc653PartitionHealth {
                    id: PartitionId::TelemetryIngest,
                    label: PartitionId::TelemetryIngest.label().to_string(),
                    healthy: true,
                    last_latency_us: self.last_ingest_latency_us,
                },
                Arinc653PartitionHealth {
                    id: PartitionId::CausalOdeStl,
                    label: PartitionId::CausalOdeStl.label().to_string(),
                    healthy: true,
                    last_latency_us: self.latest_recompute_latency_us,
                },
                Arinc653PartitionHealth {
                    id: PartitionId::TimestralForecaster,
                    label: PartitionId::TimestralForecaster.label().to_string(),
                    healthy: true,
                    last_latency_us: self.last_timestral_latency_us,
                },
                Arinc653PartitionHealth {
                    id: PartitionId::MedOpsUiShell,
                    label: PartitionId::MedOpsUiShell.label().to_string(),
                    healthy: true,
                    last_latency_us: 25,
                },
            ],
            habitat_zone: self.latest_habitat_assessment.current_zone,
            violates_policy: self.latest_habitat_assessment.violates_policy,
            eva_airlock_forbidden: eva_forbidden,
            storm_shelter_mandatory: shelter_mandatory,
            radiation_dose_rate_msv_d: self.latest_packet.biometrics.radiation_dose_rate_msv_d,
            seu_restart_count: self.seu_restart_count,
            hrv_unavailable: self.latest_packet.biometrics.rmssd_ms.is_none(),
            model_validation_status: self.latest_packet.model_validation_status,
        }
    }
}

/// State shared between the Axum HTTP/WebSocket server, the Timestral 1 Hz co-processor,
/// the zero-copy Seqlock binary ring buffer, and the FastMCP server on `stdio`.
struct RuntimeStorage {
    engine: Arc<LsahStorageEngine>,
    // An OS lease prevents simultaneous CLI/desktop writers from sharing a root.
    _lease: std::fs::File,
}

pub struct SharedMissionState {
    shutdown: tokio::sync::watch::Sender<bool>,
    publication: std::sync::Mutex<()>,
    storage: RwLock<Option<Arc<RuntimeStorage>>>,
    storage_sequence: AtomicU64,
    storage_accepting: AtomicBool,
    pub inner: RwLock<MissionRuntimeInner>,
    pub tx: broadcast::Sender<String>,
    pub binary_ring: Arc<SeqlockTelemetryRing<64>>,
    pub audit_logger: Sha256AuditLogger,
    pub dataset_graph: Arc<AresUnifiedDatasetGraph>,
    pub edge_llm_config: RwLock<EdgeLlmConfig>,
    #[cfg(feature = "shm-ipc")]
    pub shm_dispatcher: Option<crate::shm_bus::NonBlockingShmDsnDispatcher>,
}

/// Enforces the safety invariants for the wearable-hardware standby state:
/// zeroes the vital channels to None, sets sqi_score to 0.0, adds "wearable_sensor_loss"
/// and elevates the alarm severity to DataDegradedMissingChannels.
pub fn enforce_awaiting_wearable_hardware_packet(packet: &mut TelemetryPacket) {
    packet.source_record_id = "awaiting_wearable_hardware".to_string();
    packet.provenance_manifest.biometrics_source = BiometricsSource::HardwareWearable;
    packet.biometrics.heart_rate_bpm = None;
    packet.biometrics.pulse_rate_bpm = None;
    packet.biometrics.spo2_pct = None;
    packet.biometrics.resp_rate_brpm = None;
    packet.biometrics.sqi_score = 0.0;
    if !packet
        .biometrics
        .missing_channels
        .iter()
        .any(|c| c == "wearable_sensor_loss")
    {
        packet
            .biometrics
            .missing_channels
            .push("wearable_sensor_loss".to_string());
    }
    packet.alert_severity = packet
        .alert_severity
        .max(AlertSeverity::DataDegradedMissingChannels);
}

impl SharedMissionState {
    pub fn request_shutdown(&self) {
        self.shutdown.send_replace(true);
    }

    /// Explicitly sets the primary telemetry source mode.
    /// Coherently resets the detector, EWMA, and SQI baselines.
    pub fn set_source_mode(&self, mode: TelemetrySourceMode) {
        let Ok(mut guard) = self.inner.write() else {
            return;
        };
        if guard.source_mode != mode {
            guard.source_mode = mode;
            guard.sqi_filter = SqiFilter::default();
            guard.anomaly_detector = VitalsAnomalyDetector::default();
            guard.ewma_forecaster = EwmaResidualForecaster::default();
            guard.latest_short_horizon_cones.clear();
            guard.latest_short_horizon_abstention = None;
            if mode == TelemetrySourceMode::LiveWearableHardware {
                if guard.active_wearable_node.is_none() {
                    guard.wearable_stale = true;
                    guard.last_wearable_packet_time = None;
                    enforce_awaiting_wearable_hardware_packet(&mut guard.latest_packet);
                } else {
                    let now = Instant::now();
                    let is_stale = guard
                        .last_wearable_packet_time
                        .is_none_or(|t| now.duration_since(t) > WEARABLE_STALE_TIMEOUT);
                    guard.wearable_stale = is_stale;
                    if is_stale {
                        enforce_awaiting_wearable_hardware_packet(&mut guard.latest_packet);
                    }
                }
            }
        }
    }

    /// Returns the currently active telemetry source mode.
    pub fn source_mode(&self) -> TelemetrySourceMode {
        self.inner
            .read()
            .map_or(TelemetrySourceMode::RecordedReplay, |g| g.source_mode)
    }
    pub async fn enable_storage_at(&self, path: &Path) -> Result<(), LsahStorageError> {
        self.enable_storage(LsahStorageConfig::with_root_dir(path)).await
    }
    /// Enable explicit, local-only recording. Open/recovery runs outside Tokio
    /// workers; ordinary read-only test constructors never create a store.
    pub async fn enable_storage(&self, config: LsahStorageConfig) -> Result<(), LsahStorageError> {
        if self.storage.read().map_err(|e| LsahStorageError::Backend(e.to_string()))?.is_some() {
            return Err(LsahStorageError::InvalidConfig("storage already enabled".into()));
        }
        let (engine, lease) = tokio::task::spawn_blocking(move || {
            let root = config.validate()?;
            std::fs::create_dir_all(&root)?;
            let lease = std::fs::OpenOptions::new().read(true).write(true).create(true).truncate(false)
                .open(root.join(".writer.lock"))?;
            lease.try_lock().map_err(|e| LsahStorageError::Backend(format!("storage writer lease unavailable: {e}")))?;
            let engine = LsahStorageEngine::open(config)?;
            Ok::<_, LsahStorageError>((engine,lease))
        }).await
            .map_err(|e| LsahStorageError::Backend(e.to_string()))??;
        let mut storage = self.storage.write().map_err(|e| LsahStorageError::Backend(e.to_string()))?;
        if storage.is_some() {
            return Err(LsahStorageError::InvalidConfig("storage already enabled".into()));
        }
        self.storage_sequence.store(engine.max_sequence_id(), Ordering::Release);
        engine.start_background_flusher();
        *storage = Some(Arc::new(RuntimeStorage {engine:Arc::new(engine),_lease:lease}));
        self.storage_accepting.store(true, Ordering::Release);
        Ok(())
    }

    /// Called while the mission writer owns the current ordered sample. This
    /// stages fixed-size rows in RAM; no filesystem work occurs on the hot path.
    fn persist_packet(&self, packet: &TelemetryPacket) {
        if !self.storage_accepting.load(Ordering::Acquire) { return; }
        if let Ok(storage) = self.storage.read()
            && let Some(engine) = storage.as_ref()
        {
            let sequence = self.storage_sequence.fetch_add(1, Ordering::AcqRel) + 1;
            let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.as_millis().min(i64::MAX as u128) as i64);
            let sol = ((packet.mission_Elapsed_seconds / MARS_SOL_SECONDS).floor() + 1.0)
                .clamp(1.0, f64::from(u16::MAX)) as u16;
            engine.engine.push_telemetry_packet(sequence, timestamp, sol, packet);
        }
    }

    pub fn storage_status(&self) -> Option<LsahStorageStatusDto> {
        let storage = self.storage.read().ok()?.clone();
        storage.map(|s| s.engine.status())
    }

    pub async fn shutdown_storage(&self) -> Result<(), LsahStorageError> {
        // Synchronize with producers before the final drain.
        {
            let _writer = self.inner.write().map_err(|e| LsahStorageError::Backend(e.to_string()))?;
            self.storage_accepting.store(false, Ordering::Release);
        }
        let engine = self.storage.read().map_err(|e| LsahStorageError::Backend(e.to_string()))?.clone();
        if let Some(engine) = engine {
            engine.engine.stop_background_flusher().await?;
            let engine_ref = Arc::clone(&engine);
            tokio::task::spawn_blocking(move || engine_ref.engine.flush_warm_now()).await
                .map_err(|e| LsahStorageError::Backend(e.to_string()))??;
        }
        Ok(())
    }

    /// Initializes the shared state by loading `bidmc_01..03_Numerics.csv`,
    /// initializing Timestral (Block H), `ARES-HyperGraph`, and `ARES-DatasetGraph` (Block I).
    pub fn from_data_dir(data_dir: &Path) -> Result<Arc<Self>, ServerRuntimeError> {
        let csv_path = data_dir.join("bidmc_01_Numerics.csv");
        let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path)?;
        let mut sqi_filter = SqiFilter::default();
        let mut adhg_engine = AdhgCausalEngine::new();
        let scenario = default_scenario_input();
        let first_row = replayer.row_at_second(0).clone();
        let signal_quality = sqi_filter.evaluate_row_detailed(&first_row);
        let first_biometrics = biometrics_with_signal_quality(&first_row, &scenario, &signal_quality);
        let mut anomaly_detector = VitalsAnomalyDetector::default();
        let latest_anomaly = anomaly_detector.update(
            first_row.relative_time_s,
            [first_row.hr_bpm, first_row.spo2_pct, first_row.resp_brpm],
        );
        let circadian_oscillator = MarsCircadianOscillator::default();
        let (latest_packet, latest_pocus_posterior, latest_causal_chain) =
            compute_mission_telemetry_tick_from_row(
                &first_row,
                first_biometrics,
                &mut adhg_engine,
                &circadian_oscillator,
                &scenario,
                2.3,
                0.0,
                false,
                None,
                None,
                None,
                VitalsContext {
                    report: Some(&latest_anomaly),
                    injected: false,
                    source_override: None,
                },
                Runtime360Overrides::default(),
            );

        let timestral_cfg = TimestralConfig {
            num_channels: ARES_TIMESTRAL_CHANNELS,
            patch_len: 4,
            d_model: 16,
            n_heads: 4,
            d_ff: 32,
            num_layers: 2,
            ..TimestralConfig::default()
        };
        let mut forecaster_engine = AresTemporalForecasterEngine::new(timestral_cfg)?;
        let mut ewma_forecaster = EwmaResidualForecaster::default();
        let mut nqs_engine = NqsEngine::with_forecaster_handle(60.0, forecaster_engine.handle());

        let mut longitudinal_compactor = MissionLongitudinalCompactor::new(900)?;
        let mut anatomical_subgraph = AnatomicalRegionSubgraph::new();
        let habitat_policy = HabitatZoneDeonticPolicy::default();
        let habitat_state = HabitatEnvironmentState {
            current_zone: HabitatZoneId::SleepQuarters,
            radiation_dose_rate_msv_d: latest_packet.biometrics.radiation_dose_rate_msv_d,
            gai_pct: latest_packet.musculoskeletal.gai_pct,
            pocus_thrombus_confirmed: latest_packet.jugular_hemodynamics.pocus_thrombus_confirmed,
            lbnp_dwell_s: 0.0,
            sleep_quarters_noise_dba: 44.0,
        };
        let latest_habitat_assessment = habitat_policy.evaluate(&habitat_state);
        let zone_markov = ZoneTransitionMarkovModel::default();

        // Deterministic warm-up of 8 samples at 1 Hz to calibrate the initial quantile cone.
        let mut latest_short_horizon_cones = Vec::new();
        let mut latest_short_horizon_abstention = None;
        for step in 0..8 {
            let sample = AresMultivariateSample::from_telemetry_components(
                step as f64,
                &latest_packet.biometrics,
                &latest_packet.musculoskeletal,
                &latest_packet.jugular_hemodynamics,
                &latest_packet.sans_ocular,
                latest_packet.nqs_stl.rho_global,
            );
            let _ = forecaster_engine.ingest_sample_1hz(
                &sample,
                &KnownFutureCovariates::default(),
                -0.002,
            )?;
            if step == 0 {
                let (cones, abstention) = ewma_forecaster.ingest_short_horizon_1hz(&sample);
                latest_short_horizon_cones = cones;
                latest_short_horizon_abstention = Some(abstention);
            }
        }
        let eval = nqs_engine.evaluate_tick_ext(
            latest_packet.relative_recording_time_s,
            &latest_packet.biometrics,
            &latest_packet.musculoskeletal,
            &latest_packet.jugular_hemodynamics,
            &latest_packet.sans_ocular,
            latest_packet.renal_nephrolithiasis.as_ref(),
            latest_packet.orthostatic_fluid.as_ref(),
            latest_packet.mars_circadian_sleep.as_ref(),
            latest_packet.neuro_immune_viral.as_ref(),
        );
        let mut initial_snap = (*eval.quantile_snapshot).clone();
        initial_snap.ewma_short_horizon_max_s =
            EWMA_SHORT_HORIZONS_SECONDS[EWMA_SHORT_HORIZONS_SECONDS.len() - 1];
        initial_snap.short_horizon_cones = latest_short_horizon_cones.clone();
        initial_snap.short_horizon_abstention = latest_short_horizon_abstention.clone();
        initial_snap.forecast_method = ForecastMethod::HybridTimestralAndEwmaShortHorizon;
        let latest_quantile_snapshot = Arc::new(initial_snap);
        let _ = longitudinal_compactor.observe(
            0.0,
            &PhysiologicalTick {
                tau_w_dyn_cm2: latest_packet.jugular_hemodynamics.tau_w_dyn_cm2,
                sost_pmol_l: latest_packet.musculoskeletal.sclerostin_pmol_l,
                mqi: latest_packet.musculoskeletal.mqi_index,
                sans_index: latest_packet.sans_ocular.sans_risk_index,
                rho_global: latest_packet.nqs_stl.rho_global,
            },
        );
        let latest_heatmap = anatomical_subgraph.compute_body_heatmap(&AnatomicalRiskInputs {
            sans_index: Some(latest_packet.sans_ocular.sans_risk_index),
            tau_w_dyn_cm2: Some(latest_packet.jugular_hemodynamics.tau_w_dyn_cm2),
            rmssd_ms: latest_packet.biometrics.rmssd_ms,
            sost_pmol_l: Some(latest_packet.musculoskeletal.sclerostin_pmol_l),
            mqi_deficit_fraction: Some(
                (1.0 - latest_packet.musculoskeletal.mqi_index).clamp(0.0, 1.0),
            ),
            gai_pct: Some(latest_packet.musculoskeletal.gai_pct),
        });
        let latest_grounding = *ground_adhg_node_o1(primary_adhg_node_for_playbook(
            &latest_packet.active_playbook.playbook_id,
        ));

        let dataset_graph = Arc::new(AresUnifiedDatasetGraph::build_with_bidmc_dir(Some(
            data_dir,
        ))?);

        let (tx, _) = broadcast::channel(128);
        let audit_logger = Sha256AuditLogger::default();
        let _ = audit_logger.append_audit_event(
            CrewRole::CrewMedicalOfficer,
            "INITIALIZE_ARES_MISSION_RUNTIME_WITH_TIMESTRAL_HYPERGRAPH",
        );

        let binary_ring = Arc::new(SeqlockTelemetryRing::<64>::new());
        let edge_llm_config = RwLock::new(EdgeLlmConfig::default());
        #[cfg(feature = "shm-ipc")]
        let shm_dispatcher = crate::shm_bus::NonBlockingShmDsnDispatcher::spawn_default(
            crate::shm_bus::DEFAULT_IOX2_SERVICE_NAME,
        )
        .ok();
        let initial_sbp_hr = (
            latest_packet
                .biometrics
                .sbp_mmhg
                .filter(|v| v.is_finite() && *v > 0.0)
                .unwrap_or(120.0),
            latest_packet
                .biometrics
                .heart_rate_bpm
                .filter(|v| v.is_finite() && *v > 0.0)
                .unwrap_or(72.0),
        );

        let shared = Arc::new(Self {
            inner: RwLock::new(MissionRuntimeInner {
                replayer,
                sqi_filter,
                signal_quality,
                adhg_engine,
                scenario,
                replay_elapsed: Duration::ZERO,
                mission_elapsed_s: 0.0,
                what_if_active: false,
                cabin_ppco2_mmhg: 2.3,
                latest_pocus_posterior,
                latest_causal_chain,
                latest_recompute_latency_us: 0,
                latest_packet,
                nqs_engine,
                forecaster_engine,
                ewma_forecaster,
                latest_short_horizon_cones,
                latest_short_horizon_abstention,
                has_timestral_inference: true,
                anomaly_detector,
                latest_anomaly,
                injection: None,
                longitudinal_compactor,
                anatomical_subgraph,
                latest_heatmap,
                habitat_policy,
                habitat_state,
                latest_habitat_assessment,
                zone_markov,
                latest_quantile_snapshot,
                latest_grounding,
                circadian_oscillator,
                spot_poct: None,
                tick_counter: 0,
                seu_restart_count: 0,
                owlt_delay_sec: 852.0,
                eimo_autonomous_active: true,
                last_timestral_latency_us: 0,
                last_ingest_latency_us: 0,
                source_mode: TelemetrySourceMode::RecordedReplay,
                last_wearable_packet_time: None,
                active_wearable_node: None,
                last_wearable_sequence: None,
                last_wearable_uptime_ms: None,
                wearable_stale: false,
                helmet_ppco2_override_mmhg: None,
                affected_crew_count: 1,
                affected_crew_count_overridden: false,
                platelet_count_k_ul: None,
                lbnp_baseline: None,
                last_valid_sbp_hr: initial_sbp_hr,
                efast_scan: None,
                renal_pocus: None,
                crew_profile: CrewBiologicalProfile::default(),
                pelvic_pocus: None,
                medical_360_scenario: None,
                medical_inventory: MedicalConsumableInventory::mars_exmc_baseline(),
            }),
            tx,
            binary_ring,
            audit_logger,
            dataset_graph,
            publication: std::sync::Mutex::new(()),
            shutdown: tokio::sync::watch::channel(false).0,
            storage: RwLock::new(None),
            storage_sequence: AtomicU64::new(0),
            storage_accepting: AtomicBool::new(false),
            edge_llm_config,
            #[cfg(feature = "shm-ipc")]
            shm_dispatcher,
        });
        shared.publish_latest_binary_frame(0);
        Ok(shared)
    }

    /// Publishes the current state into the lock-free `SeqlockTelemetryRing<64>`.
    pub fn publish_latest_binary_frame(&self, ipc_latency_ns: u32) {
        if let Ok(guard) = self.inner.read() {
            let frame = guard.build_binary_frame(ipc_latency_ns);
            self.binary_ring.publish(&frame);
        }
    }

    /// Reads the latest 128-byte `BinaryTelemetryFrame` from the Seqlock ring (zero-copy).
    pub fn latest_binary_frame(&self) -> Option<BinaryTelemetryFrame> {
        if let Ok(frame) = self.binary_ring.read_latest() {
            return Some(frame);
        }
        self.inner.read().ok().map(|g| g.build_binary_frame(0))
    }

    /// Reads the latest 128-byte serialized frame bytes.
    pub fn latest_binary_frame_bytes(&self) -> Option<[u8; ARES_BINARY_FRAME_BYTES]> {
        if let Ok(bytes) = self.binary_ring.read_latest_bytes() {
            return Some(bytes);
        }
        self.inner
            .read()
            .ok()
            .map(|g| g.build_binary_frame(0).to_le_bytes())
    }

    /// Processes a Tier C `WearableSensorPacket` (Oxide Hubris / Embassy), updating SQI,
    /// `seu_restart_count`, causal state, anomaly detector, and publishing a 128-byte `BinaryTelemetryFrame`.
    pub fn ingest_wearable_packet(
        &self,
        packet: &WearableSensorPacket,
    ) -> Option<ValidatedTelemetryFrame> {
        let start = Instant::now();
        let mut guard = self.inner.write().ok()?;

        // Transition to LiveWearableHardware if not already active
        if guard.source_mode != TelemetrySourceMode::LiveWearableHardware {
            guard.source_mode = TelemetrySourceMode::LiveWearableHardware;
            guard.sqi_filter = SqiFilter::default();
            guard.anomaly_detector = VitalsAnomalyDetector::default();
            guard.ewma_forecaster = EwmaResidualForecaster::default();
            guard.latest_short_horizon_cones.clear();
            guard.latest_short_horizon_abstention = None;
        }

        // Supervisor restart and sequence monotonicity check
        let is_restart = packet.supervisor_restart_count > guard.seu_restart_count;
        if is_restart {
            guard.seu_restart_count = packet.supervisor_restart_count;
            guard.last_wearable_sequence = None;
        } else if guard
            .last_wearable_sequence
            .is_some_and(|last_seq| packet.sequence_num <= last_seq)
            && guard.active_wearable_node == Some(packet.node_id)
        {
            // Out-of-order or duplicate packet: drop to avoid corrupting EWMA / detector state
            return None;
        }

        let scenario = guard.scenario.clone();
        let validated = packet.to_validated_frame(
            &format!("hubris_node_{:02}", packet.node_id),
            &scenario,
            &mut guard.sqi_filter,
        );
        guard.signal_quality = validated.sqi_evaluation.clone();
        guard.tick_counter = guard.tick_counter.saturating_add(1);
        guard.last_wearable_packet_time = Some(Instant::now());
        guard.active_wearable_node = Some(packet.node_id);
        guard.last_wearable_sequence = Some(packet.sequence_num);
        guard.last_wearable_uptime_ms = Some(packet.uptime_ms);
        guard.wearable_stale = false;

        // Process anomaly detector and short-horizon forecaster at native sample arrival rate
        let ingest_start = Instant::now();
        guard.latest_anomaly = guard.anomaly_detector.update(
            validated.row.relative_time_s,
            [validated.row.hr_bpm, validated.row.spo2_pct, validated.row.resp_brpm],
        );
        guard.last_ingest_latency_us = ingest_start.elapsed().as_micros() as u64;

        let elapsed = guard.mission_elapsed_s;
        let what_if_active = guard.what_if_active;
        let cabin_ppco2_mmhg = guard.cabin_ppco2_mmhg;
        let spot_poct = guard.spot_poct.clone();
        let anomaly_report = guard.latest_anomaly.clone();
        let overrides = guard.runtime_360_overrides();

        let inner = &mut *guard;
        let (telemetry_packet, pocus_posterior, causal_chain) =
            compute_mission_telemetry_tick_from_row(
                &validated.row,
                validated.biometrics.clone(),
                &mut inner.adhg_engine,
                &inner.circadian_oscillator,
                &scenario,
                cabin_ppco2_mmhg,
                elapsed,
                what_if_active,
                spot_poct,
                inner.efast_scan.as_ref(),
                inner.renal_pocus.as_ref(),
                VitalsContext {
                    report: Some(&anomaly_report),
                    injected: false,
                    source_override: Some(BiometricsSource::HardwareWearable),
                },
                overrides,
            );
        guard.latest_packet = telemetry_packet;
        guard.refresh_pre_lbnp_vitals_baseline();
        guard.latest_pocus_posterior = pocus_posterior;
        guard.latest_causal_chain = causal_chain;
        guard.latest_grounding = *ground_adhg_node_o1(primary_adhg_node_for_playbook(
            &guard.latest_packet.active_playbook.playbook_id,
        ));
        guard.ingest_short_horizon_sample();
        guard.update_hypergraph_and_nqs_hot_path();
        guard.latest_recompute_latency_us = start.elapsed().as_micros() as u64;

        self.persist_packet(&guard.latest_packet);

        let frame = guard.build_binary_frame((start.elapsed().as_nanos()).min(u128::from(u32::MAX)) as u32);
        self.binary_ring.publish(&frame);
        #[cfg(feature = "shm-ipc")]
        if let Some(dispatcher) = &self.shm_dispatcher {
            let owlt = guard.owlt_comm_state();
            dispatcher.try_dispatch(&guard.latest_packet, &frame, &owlt, true);
        }
        let _ = self.audit_logger.append_audit_event(
            CrewRole::CrewMedicalOfficer,
            &format!(
                "HUBRIS_WEARABLE_INGEST:NODE={}:SEQ={}:SEU_RESTARTS={}",
                packet.node_id, packet.sequence_num, packet.supervisor_restart_count
            ),
        );

        let wire = (self.tx.receiver_count() > 0).then(|| guard.capture_wire());
        drop(guard);
        if let Some(wire) = wire
            && let Ok(json_str) = serde_json::to_string(&wire.into_wire_packet())
        {
            let _ = self.tx.send(json_str);
        }

        Some(validated)
    }

    /// Projects the unified `OsStatusBarState` for both Tauri IPC and `GET /api/os-status`.
    pub fn os_status_bar_state(
        &self,
        shell_name: &str,
        shell_version: &str,
        transport_mode: &str,
        air_gapped: bool,
        ws_mirror_active: bool,
    ) -> Option<OsStatusBarState> {
        self.inner.read().ok().map(|g| {
            g.build_os_status_bar_state(
                shell_name,
                shell_version,
                transport_mode,
                air_gapped,
                ws_mirror_active,
            )
        })
    }

    /// Advances the replay clock (`dt`, typically `50 ms` at 20 Hz), keeping
    /// the recorded BIDMC channels locked to the native `1 Hz` cadence (`1000 ms`).
    pub fn advance_tick(&self, dt: Duration) -> Option<TelemetryPacket> {
        let _publication = self.publication.lock().ok()?;
        let start = Instant::now();
        let mut guard = self.inner.write().ok()?;

        if guard.source_mode == TelemetrySourceMode::LiveWearableHardware {
            let now = Instant::now();
            let is_stale = guard.active_wearable_node.is_none()
                || guard
                    .last_wearable_packet_time
                    .is_none_or(|t| now.duration_since(t) > WEARABLE_STALE_TIMEOUT);
            guard.wearable_stale = is_stale;
            guard.replay_elapsed = guard.replay_elapsed.saturating_add(dt);
            guard.mission_elapsed_s = guard.replay_elapsed.as_secs_f64();
            guard.tick_counter = guard.tick_counter.saturating_add(1);

            let is_sleep = guard.habitat_state.current_zone == HabitatZoneId::SleepQuarters;
            guard.circadian_oscillator.step_state(
                dt.as_secs_f64() / 3600.0,
                is_sleep,
                0.85,
                250.0,
            );

            if guard.active_wearable_node.is_none() {
                enforce_awaiting_wearable_hardware_packet(&mut guard.latest_packet);
                let updated_playbook = enforce_hard_clinical_safety_gates_with_lbnp_baseline(
                    guard.latest_packet.active_playbook.clone(),
                    &guard.latest_packet.biometrics,
                    &guard.latest_packet.musculoskeletal,
                    &guard.latest_packet.jugular_hemodynamics,
                    &guard.scenario,
                    guard.efast_scan.as_ref(),
                    guard
                        .latest_packet
                        .mars_circadian_sleep
                        .as_ref()
                        .map(|c| c.pvt_lapse_probability),
                    guard
                        .latest_packet
                        .orthostatic_fluid
                        .as_ref()
                        .map(|o| o.shock_index),
                    guard.lbnp_baseline,
                );
                if updated_playbook.safety_gates.lbnp_auto_vent_triggered {
                    guard.latest_packet.jugular_hemodynamics.lbnp_active = false;
                }
                guard.latest_packet.active_playbook = updated_playbook;
            } else if is_stale {
                guard.latest_packet.alert_severity =
                    guard.latest_packet.alert_severity.max(AlertSeverity::DataDegradedMissingChannels);
                if !guard.latest_packet.biometrics.missing_channels.iter().any(|c| c == "wearable_sensor_loss") {
                    guard.latest_packet.biometrics.missing_channels.push("wearable_sensor_loss".to_string());
                }
                let updated_playbook = enforce_hard_clinical_safety_gates_with_lbnp_baseline(
                    guard.latest_packet.active_playbook.clone(),
                    &guard.latest_packet.biometrics,
                    &guard.latest_packet.musculoskeletal,
                    &guard.latest_packet.jugular_hemodynamics,
                    &guard.scenario,
                    guard.efast_scan.as_ref(),
                    guard
                        .latest_packet
                        .mars_circadian_sleep
                        .as_ref()
                        .map(|c| c.pvt_lapse_probability),
                    guard
                        .latest_packet
                        .orthostatic_fluid
                        .as_ref()
                        .map(|o| o.shock_index),
                    guard.lbnp_baseline,
                );
                if updated_playbook.safety_gates.lbnp_auto_vent_triggered {
                    guard.latest_packet.jugular_hemodynamics.lbnp_active = false;
                }
                guard.latest_packet.active_playbook = updated_playbook;
            }

            guard.update_hypergraph_and_nqs_hot_path();
            guard.latest_recompute_latency_us = start.elapsed().as_micros() as u64;

            self.persist_packet(&guard.latest_packet);

            let bin_frame = guard.build_binary_frame(
                start.elapsed().as_nanos().min(u128::from(u32::MAX)) as u32,
            );
            self.binary_ring.publish(&bin_frame);
            #[cfg(feature = "shm-ipc")]
            if let Some(dispatcher) = &self.shm_dispatcher {
                let owlt = guard.owlt_comm_state();
                dispatcher.try_dispatch(&guard.latest_packet, &bin_frame, &owlt, false);
            }

            let snapshot_packet = guard.latest_packet.clone();
            let wire = (self.tx.receiver_count() > 0).then(|| guard.capture_wire());
            drop(guard);
            if let Some(wire) = wire
                && let Ok(json_str) = serde_json::to_string(&wire.into_wire_packet())
            {
                let _ = self.tx.send(json_str);
            }
            return Some(snapshot_packet);
        }

        let previous_second = guard.replay_elapsed.as_secs();
        guard.replay_elapsed = guard.replay_elapsed.saturating_add(dt);
        let current_second = guard.replay_elapsed.as_secs();
        let total_rows = guard.replayer.len().max(1) as u64;
        let new_native_sample = current_second != previous_second;
        // The record restarts whenever the replay clock enters a new cycle of the
        // recording (comparing cycles also covers a multi-second clock jump).
        let record_restarted =
            new_native_sample && current_second / total_rows != previous_second / total_rows;

        let now_s = current_second as f64;
        if record_restarted
            || guard.injection.is_some_and(|i| now_s >= i.onset_s + i.kind.duration_s())
        {
            guard.injection = None;
        }

        let (row, injected) = guard.current_replay_row();

        if new_native_sample {
            let ingest_start = Instant::now();
            if record_restarted {
                guard.sqi_filter = SqiFilter::default();
                guard.anomaly_detector = VitalsAnomalyDetector::default();
                guard.ewma_forecaster = EwmaResidualForecaster::default();
                guard.latest_short_horizon_cones.clear();
                guard.latest_short_horizon_abstention = None;
            }
            guard.signal_quality = guard.sqi_filter.evaluate_row_detailed(&row);
            guard.latest_anomaly = guard
                .anomaly_detector
                .update(row.relative_time_s, [row.hr_bpm, row.spo2_pct, row.resp_brpm]);
            guard.last_ingest_latency_us = ingest_start.elapsed().as_micros() as u64;
        }

        let is_sleep = guard.habitat_state.current_zone == HabitatZoneId::SleepQuarters;
        guard.circadian_oscillator.step_state(
            dt.as_secs_f64() / 3600.0,
            is_sleep,
            0.85,
            250.0,
        );
        let biometrics =
            biometrics_with_signal_quality(&row, &guard.scenario, &guard.signal_quality);
        guard.mission_elapsed_s = guard.replay_elapsed.as_secs_f64();
        guard.tick_counter = guard.tick_counter.saturating_add(1);
        let elapsed = guard.mission_elapsed_s;
        let scenario = guard.scenario.clone();
        let what_if_active = guard.what_if_active;
        let cabin_ppco2_mmhg = guard.cabin_ppco2_mmhg;
        let spot_poct = guard.spot_poct.clone();
        let anomaly_report = guard.latest_anomaly.clone();
        let overrides = guard.runtime_360_overrides();

        let inner = &mut *guard;
        let (packet, pocus_posterior, causal_chain) = compute_mission_telemetry_tick_from_row(
            &row,
            biometrics,
            &mut inner.adhg_engine,
            &inner.circadian_oscillator,
            &scenario,
            cabin_ppco2_mmhg,
            elapsed,
            what_if_active,
            spot_poct,
            inner.efast_scan.as_ref(),
            inner.renal_pocus.as_ref(),
            VitalsContext {
                report: Some(&anomaly_report),
                injected,
                source_override: None,
            },
            overrides,
        );
        guard.latest_packet = packet;
        guard.refresh_pre_lbnp_vitals_baseline();
        guard.latest_pocus_posterior = pocus_posterior;
        guard.latest_causal_chain = causal_chain;
        guard.latest_grounding = *ground_adhg_node_o1(primary_adhg_node_for_playbook(
            &guard.latest_packet.active_playbook.playbook_id,
        ));
        if new_native_sample {
            guard.ingest_short_horizon_sample();
        }
        guard.update_hypergraph_and_nqs_hot_path();
        guard.latest_recompute_latency_us = start.elapsed().as_micros() as u64;

        self.persist_packet(&guard.latest_packet);

        let bin_frame = guard.build_binary_frame(
            start.elapsed().as_nanos().min(u128::from(u32::MAX)) as u32,
        );
        self.binary_ring.publish(&bin_frame);
        #[cfg(feature = "shm-ipc")]
        if let Some(dispatcher) = &self.shm_dispatcher {
            let owlt = guard.owlt_comm_state();
            dispatcher.try_dispatch(&guard.latest_packet, &bin_frame, &owlt, false);
        }

        let snapshot_packet = guard.latest_packet.clone();
        let wire = (self.tx.receiver_count() > 0).then(|| guard.capture_wire());
        drop(guard);
        if let Some(wire) = wire
            && let Ok(json_str) = serde_json::to_string(&wire.into_wire_packet())
        {
            let _ = self.tx.send(json_str);
        }
        Some(snapshot_packet)
    }

    /// Runs one step of the asynchronous Timestral co-processor at 1 Hz.
    pub fn run_1hz_timestral_step(&self) -> Option<Arc<NqsQuantileForecastSnapshot>> {
        let mut guard = self.inner.write().ok()?;
        guard.run_1hz_timestral_inference().ok()
    }

    /// Latest conformal + EWMA short-horizon forecast snapshot.
    pub fn latest_forecast_snapshot(&self) -> Option<Arc<NqsQuantileForecastSnapshot>> {
        self.inner
            .read()
            .ok()
            .map(|g| Arc::clone(&g.latest_quantile_snapshot))
    }

    /// Latest per-channel vitals anomaly report.
    pub fn latest_vitals_anomaly(&self) -> Option<VitalsAnomalyReport> {
        self.inner.read().ok().map(|g| g.latest_anomaly.clone())
    }

    /// Schedules (or clears, with `None`) a synthetic demo event starting at the next
    /// replayed second. Refused while the personal baseline is still being learned,
    /// and refused when the event would still be running when the record restarts.
    pub fn inject_anomaly(
        &self,
        kind: Option<InjectedAnomalyKind>,
    ) -> Result<Option<AnomalyInjection>, InjectAnomalyError> {
        let mut guard = self
            .inner
            .write()
            .map_err(|_| InjectAnomalyError::StateUnavailable)?;
        let Some(kind) = kind else {
            guard.injection = None;
            let _ = self
                .audit_logger
                .append_audit_event(CrewRole::CrewMedicalOfficer, "DEMO_ANOMALY_INJECTION_CLEARED");
            return Ok(None);
        };
        if !guard.latest_anomaly.baseline_ready {
            return Err(InjectAnomalyError::BaselineLearning {
                samples: guard.latest_anomaly.baseline_samples,
                required: guard.latest_anomaly.baseline_required,
            });
        }
        let now_s = guard.replay_elapsed.as_secs();
        let total_rows = guard.replayer.len().max(1) as u64;
        let onset_s = now_s + 1;
        let duration_s = kind.duration_s().ceil().max(0.0) as u64;
        let next_restart_s = (now_s / total_rows + 1) * total_rows;
        if onset_s + duration_s > next_restart_s {
            return Err(InjectAnomalyError::CrossesRecordRestart {
                duration_s,
                seconds_left: next_restart_s.saturating_sub(onset_s),
            });
        }
        let injection = AnomalyInjection {
            kind,
            onset_s: onset_s as f64,
        };
        guard.injection = Some(injection);
        let _ = self.audit_logger.append_audit_event(
            CrewRole::CrewMedicalOfficer,
            &format!("DEMO_ANOMALY_INJECTION:{}:ONSET_S={:.0}", kind.label(), injection.onset_s),
        );
        Ok(Some(injection))
    }

    /// Schedules or clears a synthetic demo event and returns the current `WireTelemetryPacket`.
    pub fn inject_anomaly_wire(
        &self,
        kind: Option<InjectedAnomalyKind>,
    ) -> Result<WireTelemetryPacket, InjectAnomalyError> {
        let _publication = self.publication.lock().map_err(|_| InjectAnomalyError::StateUnavailable)?;
        let _ = self.inject_anomaly(kind)?;
        let wire = self
            .latest_wire_snapshot()
            .ok_or(InjectAnomalyError::StateUnavailable)?;
        if self.tx.receiver_count() > 0
            && let Ok(json_str) = serde_json::to_string(&wire)
        {
            let _ = self.tx.send(json_str);
        }
        Ok(wire)
    }

    /// Applies a new complete What-If scenario without advancing the BIDMC cursor (`1 Hz`).
    pub fn apply_stress_test(
        &self,
        new_scenario: StressTestScenarioInput,
    ) -> Option<TelemetryPacket> {
        self.apply_stress_test_patch(StressTestPatchRequest::from(new_scenario))?;
        self.latest_snapshot()
    }

    /// Applies a complete or partial What-If payload in < 1 ms without advancing `replay_elapsed`.
    pub fn apply_stress_test_patch(
        &self,
        patch: StressTestPatchRequest,
    ) -> Option<WireTelemetryPacket> {
        let _publication = self.publication.lock().ok()?;
        let start = Instant::now();
        let mut guard = self.inner.write().ok()?;
        let mut next_ppco2 = guard.cabin_ppco2_mmhg;
        let was_lbnp_active = guard.scenario.lbnp_active;
        let new_scenario = patch.apply_onto(&guard.scenario, &mut next_ppco2);
        guard.scenario = new_scenario.clone();
        guard.cabin_ppco2_mmhg = next_ppco2;
        if let Some(helmet_co2) = patch.helmet_ppco2_mmhg {
            guard.helmet_ppco2_override_mmhg =
                Some(sanitize_f64(helmet_co2, next_ppco2).clamp(0.0, 30.0));
        }
        if let Some(count) = patch.affected_crew_count {
            guard.affected_crew_count = count.clamp(1, 16);
            guard.affected_crew_count_overridden = true;
        } else if !guard.affected_crew_count_overridden {
            guard.affected_crew_count = if next_ppco2 > MAX_SAFE_CABIN_PPCO2_MMHG {
                4
            } else {
                1
            };
        }
        if let Some(plt) = patch.platelet_count_k_ul {
            guard.platelet_count_k_ul = Some(sanitize_f64(plt, 250.0).clamp(0.0, 1500.0));
        }
        if patch.clear_pocus_scans == Some(true) {
            guard.efast_scan = None;
            guard.renal_pocus = None;
            guard.pelvic_pocus = None;
        }
        if let Some(efast) = patch.efast_scan {
            guard.efast_scan = Some(efast);
        }
        if let Some(renal) = patch.renal_pocus {
            guard.renal_pocus = Some(renal);
        }
        if let Some(profile) = patch.crew_profile.clone() {
            guard.crew_profile = profile;
        }
        if let Some(pelvic) = patch.pelvic_pocus {
            guard.pelvic_pocus = Some(pelvic);
        }
        if let Some(scenario_360) = patch.medical_360_scenario.clone() {
            guard.medical_360_scenario = Some(scenario_360);
        }
        if !was_lbnp_active && new_scenario.lbnp_active {
            let ts = (guard.mission_elapsed_s.max(0.0) * 1000.0) as u64;
            guard.lbnp_baseline = Some(LbnpBaselineState {
                pre_lbnp_sbp_baseline_mmhg: guard.last_valid_sbp_hr.0,
                pre_lbnp_hr_baseline_bpm: guard.last_valid_sbp_hr.1,
                captured_at_timestamp_ms: ts,
            });
        } else if !new_scenario.lbnp_active {
            guard.lbnp_baseline = None;
        }
        guard.what_if_active = true;

        if guard.source_mode == TelemetrySourceMode::LiveWearableHardware {
            let elapsed = guard.mission_elapsed_s;
            let spot_poct = guard.spot_poct.clone();
            let anomaly_report = guard.latest_anomaly.clone();
            let mut current_biometrics = if guard.active_wearable_node.is_none() {
                let mut b = ares_core_types::Biometrics::default();
                b.missing_channels.push("wearable_sensor_loss".to_string());
                b
            } else {
                guard.latest_packet.biometrics.clone()
            };
            current_biometrics.radiation_dose_rate_msv_d =
                new_scenario.radiation_dose_rate_msv_d.clamp(0.0, 50.0);
            let source_record_id = guard.latest_packet.source_record_id.clone();
            let current_row = BidmcNumericRow {
                record_id: source_record_id.clone(),
                relative_time_s: elapsed,
                hr_bpm: current_biometrics.heart_rate_bpm,
                pulse_bpm: current_biometrics.pulse_rate_bpm,
                spo2_pct: current_biometrics.spo2_pct,
                resp_brpm: current_biometrics.resp_rate_brpm,
                missing_channels: current_biometrics.missing_channels.clone(),
            };
            let overrides = guard.runtime_360_overrides();
            let inner = &mut *guard;
            let (mut packet, pocus_posterior, causal_chain) = compute_mission_telemetry_tick_from_row(
                &current_row,
                current_biometrics,
                &mut inner.adhg_engine,
                &inner.circadian_oscillator,
                &new_scenario,
                next_ppco2,
                elapsed,
                true,
                spot_poct,
                inner.efast_scan.as_ref(),
                inner.renal_pocus.as_ref(),
                VitalsContext {
                    report: Some(&anomaly_report),
                    injected: false,
                    source_override: Some(BiometricsSource::HardwareWearable),
                },
                overrides,
            );

            packet.source_record_id = source_record_id;
            packet.provenance_manifest.biometrics_source = BiometricsSource::HardwareWearable;
            if guard.active_wearable_node.is_none() {
                enforce_awaiting_wearable_hardware_packet(&mut packet);
            }

            guard.latest_packet = packet;
            guard.latest_pocus_posterior = pocus_posterior;
            guard.latest_causal_chain = causal_chain;
            guard.latest_grounding = *ground_adhg_node_o1(primary_adhg_node_for_playbook(
                &guard.latest_packet.active_playbook.playbook_id,
            ));
            guard.update_hypergraph_and_nqs_hot_path();
            let _ = guard.run_1hz_timestral_inference();
            guard.latest_recompute_latency_us = start.elapsed().as_micros() as u64;

            let bin_frame = guard.build_binary_frame(
                start.elapsed().as_nanos().min(u128::from(u32::MAX)) as u32,
            );
            self.binary_ring.publish(&bin_frame);
            #[cfg(feature = "shm-ipc")]
            if let Some(dispatcher) = &self.shm_dispatcher {
                let owlt = guard.owlt_comm_state();
                dispatcher.try_dispatch(&guard.latest_packet, &bin_frame, &owlt, true);
            }

            let captured = guard.capture_wire();
            drop(guard);
            let wire_snapshot = captured.into_wire_packet();
            let _ = self.audit_logger.append_audit_event(
                CrewRole::CrewMedicalOfficer,
                &format!(
                    "STRESS_TEST_UPDATE:FD={}:ARED={:.0}:RAD={:.2}:POCUS={}",
                    new_scenario.flight_day,
                    new_scenario.ared_daily_load_kgf,
                    new_scenario.radiation_dose_rate_msv_d,
                    new_scenario.pocus_thrombus_confirmed
                ),
            );
            if let Ok(json_str) = serde_json::to_string(&wire_snapshot) {
                let _ = self.tx.send(json_str);
            }
            return Some(wire_snapshot);
        }

        let (row, injected) = guard.current_replay_row();
        let biometrics =
            biometrics_with_signal_quality(&row, &new_scenario, &guard.signal_quality);
        let elapsed = guard.mission_elapsed_s;
        let anomaly_report = guard.latest_anomaly.clone();
        let spot_poct = guard.spot_poct.clone();
        let overrides = guard.runtime_360_overrides();

        let inner = &mut *guard;
        let (packet, pocus_posterior, causal_chain) = compute_mission_telemetry_tick_from_row(
            &row,
            biometrics,
            &mut inner.adhg_engine,
            &inner.circadian_oscillator,
            &new_scenario,
            next_ppco2,
            elapsed,
            true,
            spot_poct,
            inner.efast_scan.as_ref(),
            inner.renal_pocus.as_ref(),
            VitalsContext {
                report: Some(&anomaly_report),
                injected,
                source_override: None,
            },
            overrides,
        );
        guard.latest_packet = packet;
        guard.refresh_pre_lbnp_vitals_baseline();
        guard.latest_pocus_posterior = pocus_posterior;
        guard.latest_causal_chain = causal_chain;
        guard.latest_grounding = *ground_adhg_node_o1(primary_adhg_node_for_playbook(
            &guard.latest_packet.active_playbook.playbook_id,
        ));
        guard.update_hypergraph_and_nqs_hot_path();
        let _ = guard.run_1hz_timestral_inference();
        guard.latest_recompute_latency_us = start.elapsed().as_micros() as u64;

        let bin_frame = guard.build_binary_frame(
            start.elapsed().as_nanos().min(u128::from(u32::MAX)) as u32,
        );
        self.binary_ring.publish(&bin_frame);
        #[cfg(feature = "shm-ipc")]
        if let Some(dispatcher) = &self.shm_dispatcher {
            let owlt = guard.owlt_comm_state();
            dispatcher.try_dispatch(&guard.latest_packet, &bin_frame, &owlt, true);
        }

        let captured = guard.capture_wire();
        drop(guard);
        let wire_snapshot = captured.into_wire_packet();
        let _ = self.audit_logger.append_audit_event(
            CrewRole::CrewMedicalOfficer,
            &format!(
                "STRESS_TEST_UPDATE:FD={}:ARED={:.0}:RAD={:.2}:POCUS={}",
                new_scenario.flight_day,
                new_scenario.ared_daily_load_kgf,
                new_scenario.radiation_dose_rate_msv_d,
                new_scenario.pocus_thrombus_confirmed
            ),
        );
        if let Ok(json_str) = serde_json::to_string(&wire_snapshot) {
            let _ = self.tx.send(json_str);
        }
        Some(wire_snapshot)
    }

    /// Reads a copy of the last computed `TelemetryPacket`.
    pub fn latest_snapshot(&self) -> Option<TelemetryPacket> {
        self.inner.read().ok().map(|g| g.latest_packet.clone())
    }

    /// Reads a copy of the last `WireTelemetryPacket` compatible with `contracts/telemetry_schema.json`.
    pub fn latest_wire_snapshot(&self) -> Option<WireTelemetryPacket> {
        let snapshot = self.inner.read().ok()?.capture_wire();
        Some(snapshot.into_wire_packet())
    }

    /// Extracts the complete, compact context for the `FastMCP` router (< 150 tokens).
    pub fn fastmcp_context(&self) -> Option<FastMcpRuntimeContext> {
        let guard = self.inner.read().ok()?;
        Some(FastMcpRuntimeContext {
            latest_packet: guard.latest_packet.clone(),
            quantile_snapshot: Arc::clone(&guard.latest_quantile_snapshot),
            vitals_anomaly: guard.latest_anomaly.clone(),
            heatmap: guard.latest_heatmap.clone(),
            habitat_assessment: guard.latest_habitat_assessment.clone(),
            grounding: guard.latest_grounding,
            dataset_graph: Arc::clone(&self.dataset_graph),
        })
    }

    /// Updates the Edge LLM configuration cleanly at runtime.
    pub fn set_edge_llm_config(&self, config: EdgeLlmConfig) {
        if let Ok(mut guard) = self.edge_llm_config.write() {
            *guard = config;
        }
    }

    /// Executes an air-gapped Edge LLM Copilot query with deterministic Type-1 fallback.
    pub async fn ask_edge_copilot(
        &self,
        req: CopilotAskRequest,
    ) -> Result<CopilotAskResponse, EdgeCopilotError> {
        let ctx = self.fastmcp_context().ok_or_else(|| EdgeCopilotError::Transport {
            reason: "mission runtime state lock unavailable".to_string(),
        })?;
        let cfg = self
            .edge_llm_config
            .read()
            .map_err(|_| EdgeCopilotError::Transport {
                reason: "edge LLM config lock unavailable".to_string(),
            })?
            .clone();
        execute_edge_copilot_turn(&req, &ctx, &cfg, &self.audit_logger).await
    }
}

async fn loopback_cors_middleware(req: Request<axum::body::Body>, next: Next) -> Response {
    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Content-Type"),
    );
    res
}

async fn cors_preflight_handler() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn get_storage_status_handler(State(state): State<Arc<SharedMissionState>>) -> Response {
    match tokio::task::spawn_blocking(move || state.storage_status()).await {
        Ok(status) => Json(serde_json::json!({"enabled": status.is_some(), "status": status})).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStatusResponse {
    pub mode: TelemetrySourceMode,
    pub active_source_id: String,
    pub biometrics_source: BiometricsSource,
    pub is_stale: bool,
    pub last_wearable_sequence: Option<u32>,
    pub last_wearable_node: Option<u8>,
    pub supervisor_restart_count: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetSourceModeRequest {
    pub mode: TelemetrySourceMode,
}

async fn get_source_status_handler(State(state): State<Arc<SharedMissionState>>) -> Json<SourceStatusResponse> {
    let guard = state.inner.read().ok();
    let resp = match guard {
        Some(g) => SourceStatusResponse {
            mode: g.source_mode,
            active_source_id: g.latest_packet.source_record_id.clone(),
            biometrics_source: g.latest_packet.provenance_manifest.biometrics_source,
            is_stale: g.wearable_stale,
            last_wearable_sequence: g.last_wearable_sequence,
            last_wearable_node: g.active_wearable_node,
            supervisor_restart_count: g.seu_restart_count,
        },
        None => SourceStatusResponse {
            mode: TelemetrySourceMode::RecordedReplay,
            active_source_id: "unknown".to_string(),
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
            is_stale: false,
            last_wearable_sequence: None,
            last_wearable_node: None,
            supervisor_restart_count: 0,
        },
    };
    Json(resp)
}

async fn post_source_mode_handler(
    State(state): State<Arc<SharedMissionState>>,
    Json(payload): Json<SetSourceModeRequest>,
) -> StatusCode {
    state.set_source_mode(payload.mode);
    StatusCode::OK
}

/// Builds the Axum router with `/ws/telemetry`, `GET /api/snapshot`,
/// `POST /api/stress-test`, `POST /api/inject-anomaly`, `GET /api/os-status`,
/// `GET /api/binary-frame` and `POST /api/mcp`.
pub fn build_axum_router(state: Arc<SharedMissionState>) -> Router {
    Router::new()
        .route("/ws/telemetry", get(ws_telemetry_handler))
        .route("/api/snapshot", get(get_snapshot_handler))
        .route("/api/os-status", get(get_os_status_handler))
        .route("/api/storage-status", get(get_storage_status_handler))
        .route("/api/source-status", get(get_source_status_handler))
        .route(
            "/api/source-mode",
            post(post_source_mode_handler).options(cors_preflight_handler),
        )
        .route("/api/binary-frame", get(get_binary_frame_handler))
        .route("/api/audit-log", get(get_audit_log_handler))
        .route(
            "/api/mcp",
            post(post_mcp_handler).options(cors_preflight_handler),
        )
        .route(
            "/api/stress-test",
            post(post_stress_test_handler).options(cors_preflight_handler),
        )
        .route(
            "/api/inject-anomaly",
            post(post_inject_anomaly_handler).options(cors_preflight_handler),
        )
        .route(
            "/api/copilot/ask",
            post(post_copilot_ask_handler).options(cors_preflight_handler),
        )
        .route(
            "/api/copilot/stream",
            post(post_copilot_stream_handler).options(cors_preflight_handler),
        )
        .layer(middleware::from_fn(loopback_cors_middleware))
        .with_state(state)
}

async fn get_snapshot_handler(
    State(state): State<Arc<SharedMissionState>>,
) -> Result<Json<WireTelemetryPacket>, StatusCode> {
    state
        .latest_wire_snapshot()
        .map(Json)
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_os_status_handler(
    State(state): State<Arc<SharedMissionState>>,
) -> Result<Json<OsStatusBarState>, StatusCode> {
    state
        .os_status_bar_state(
            "ARES-MedOS",
            env!("CARGO_PKG_VERSION"),
            "BROWSER_WEBSOCKET",
            true,
            true,
        )
        .map(Json)
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_binary_frame_handler(
    State(state): State<Arc<SharedMissionState>>,
) -> Result<Response, StatusCode> {
    let bytes = state
        .latest_binary_frame_bytes()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut response = Bytes::copy_from_slice(&bytes).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    Ok(response)
}

async fn get_audit_log_handler(
    State(state): State<Arc<SharedMissionState>>,
) -> Result<Json<Vec<AuditChainRecord>>, StatusCode> {
    state
        .audit_logger
        .records()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn post_mcp_handler(
    State(state): State<Arc<SharedMissionState>>,
    Json(req): Json<JsonRpcRequest>,
) -> Result<Json<JsonRpcResponse>, StatusCode> {
    let ctx = state
        .fastmcp_context()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let sanitizer = StrictMcpSanitizer;
    Ok(Json(handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer)))
}

async fn post_stress_test_handler(
    State(state): State<Arc<SharedMissionState>>,
    Json(input): Json<StressTestPatchRequest>,
) -> Result<Json<WireTelemetryPacket>, StatusCode> {
    state
        .apply_stress_test_patch(input)
        .map(Json)
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)
}

async fn post_inject_anomaly_handler(
    State(state): State<Arc<SharedMissionState>>,
    Json(req): Json<AnomalyInjectionRequest>,
) -> Response {
    match state.inject_anomaly_wire(req.kind) {
        Ok(wire) => Json(wire).into_response(),
        Err(err) => {
            let code = match err {
                InjectAnomalyError::BaselineLearning { .. }
                | InjectAnomalyError::CrossesRecordRestart { .. } => StatusCode::CONFLICT,
                InjectAnomalyError::StateUnavailable => StatusCode::INTERNAL_SERVER_ERROR,
            };
            (code, Json(serde_json::json!({ "error": err.to_string() }))).into_response()
        }
    }
}

async fn post_copilot_ask_handler(
    State(state): State<Arc<SharedMissionState>>,
    Json(req): Json<CopilotAskRequest>,
) -> Response {
    match state.ask_edge_copilot(req).await {
        Ok(resp) => (StatusCode::OK, Json(resp)).into_response(),
        Err(err @ (EdgeCopilotError::PromptSanitizer(_) | EdgeCopilotError::AirGapViolation { .. })) => {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": err.to_string() })),
            )
                .into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn post_copilot_stream_handler(
    State(state): State<Arc<SharedMissionState>>,
    Json(req): Json<CopilotAskRequest>,
) -> Response {
    match state.ask_edge_copilot(req).await {
        Ok(resp) => {
            let mut sse = String::new();
            for trace in &resp.tools_invoked {
                if let Ok(trace_json) = serde_json::to_string(trace) {
                    sse.push_str("event: tool_trace\ndata: ");
                    sse.push_str(&trace_json);
                    sse.push_str("\n\n");
                }
            }
            for chunk in resp.answer_markdown.split_inclusive(' ') {
                if let Ok(delta_json) = serde_json::to_string(&serde_json::json!({ "delta": chunk }))
                {
                    sse.push_str("event: delta\ndata: ");
                    sse.push_str(&delta_json);
                    sse.push_str("\n\n");
                }
            }
            if let Ok(done_json) = serde_json::to_string(&resp) {
                sse.push_str("event: complete\ndata: ");
                sse.push_str(&done_json);
                sse.push_str("\n\n");
            }
            let mut response = axum::body::Body::from(sse).into_response();
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/event-stream"),
            );
            response.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-cache"),
            );
            response
        }
        Err(err @ (EdgeCopilotError::PromptSanitizer(_) | EdgeCopilotError::AirGapViolation { .. })) => {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": err.to_string() })),
            )
                .into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn ws_telemetry_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<SharedMissionState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_client(socket, state))
}

async fn handle_ws_client(mut socket: WebSocket, state: Arc<SharedMissionState>) {
    let mut shutdown = state.shutdown.subscribe();
    if *shutdown.borrow() { return; }
    if let Some(initial) = state.latest_wire_snapshot()
        && let Ok(text) = serde_json::to_string(&initial)
    {
        let sent = tokio::select! {
            _ = shutdown.changed() => false,
            result = socket.send(Message::Text(text.into())) => result.is_ok(),
        };
        if !sent { return; }
    }

    let mut rx = state.tx.subscribe();
    loop {
        let sent = tokio::select! {
            _ = shutdown.changed() => false,
            result = async {
                let Ok(payload) = rx.recv().await else { return false; };
                socket.send(Message::Text(payload.into())).await.is_ok()
            } => result,
        };
        if !sent { break; }
    }
    let _ = tokio::time::timeout(Duration::from_secs(1),socket.send(Message::Close(None))).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::telemetry::HrvUnavailableReason;
    use std::path::PathBuf;
    use std::time::Instant;

    fn workspace_bidmc_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("data")
            .join("bidmc")
    }

    #[test]
    fn test_full_pipeline_tick_executes_under_150_microseconds() {
        let csv_path = workspace_bidmc_dir().join("bidmc_01_Numerics.csv");
        let mut replayer =
            BidmcReplayer::from_csv_path("bidmc_01", &csv_path).expect("load bidmc_01");
        let mut sqi_filter = SqiFilter::default();
        let mut adhg_engine = AdhgCausalEngine::new();
        let scenario = default_scenario_input();

        // Warm-up tick
        let _ = compute_mission_telemetry_tick(
            &mut replayer,
            &mut sqi_filter,
            &mut adhg_engine,
            &scenario,
            0.0,
        );

        let iterations = 50_u32;
        let start = Instant::now();
        let mut last_pkt = None;
        for i in 1..=iterations {
            last_pkt = Some(compute_mission_telemetry_tick(
                &mut replayer,
                &mut sqi_filter,
                &mut adhg_engine,
                &scenario,
                f64::from(i) * 0.05,
            ));
        }
        let avg_us = start.elapsed().as_secs_f64() * 1_000_000.0 / f64::from(iterations);
        let budget_micros = if cfg!(debug_assertions) { 500.0 } else { 150.0 };
        assert!(
            avg_us < budget_micros,
            "Expected average tick latency < {budget_micros} us, got {avg_us:.2} us"
        );

        let pkt = last_pkt.expect("packet generated");
        assert_eq!(pkt.source_record_id, "bidmc_01");
        assert_eq!(
            pkt.provenance_manifest.biometrics_source,
            BiometricsSource::RecordedTerrestrialBidmcCsv
        );
    }

    #[test]
    fn test_shared_mission_state_integrates_timestral_and_hypergraph_under_budget() {
        let state =
            SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("init mission state");
        assert_eq!(state.dataset_graph.dataset_count(), 24);

        let start = Instant::now();
        for _ in 0..20 {
            state
                .advance_tick(Duration::from_millis(50))
                .expect("advance tick");
        }
        let avg_us = start.elapsed().as_secs_f64() * 1_000_000.0 / 20.0;
        assert!(
            avg_us < 150.0,
            "Expected SharedMissionState::advance_tick < 150 us, got {avg_us:.2} us"
        );

        let ctx = state.fastmcp_context().expect("fastmcp context");
        ctx.quantile_snapshot
            .assert_monotone()
            .expect("quantile snapshot monotone");
        assert_eq!(ctx.heatmap.cells.len(), 5);
        assert!(ctx.grounding.descriptor.verify_crc().is_ok());
    }

    #[test]
    fn test_stress_test_slider_change_switches_playbook_deterministically() {
        let state =
            SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("init mission state");
        let initial = state.latest_snapshot().expect("initial snapshot");
        assert_eq!(
            initial.active_playbook.playbook_id,
            "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED"
        );

        // Simulate severe unloading at FD 120 without LBNP and without POCUS thrombus
        let unloaded_scenario = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 120,
            ared_daily_load_kgf: 0.0,
            radiation_dose_rate_msv_d: 1.2,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 4.0,
        };
        let updated = state
            .apply_stress_test(unloaded_scenario)
            .expect("updated snapshot");
        assert_eq!(
            updated.active_playbook.playbook_id,
            "PLAYBOOK_01_VENOUS_STASIS_LBNP"
        );
        assert!(
            updated
                .active_playbook
                .safety_gates
                .anticoagulant_lock_active
        );
        assert!(
            state
                .audit_logger
                .verify_chain_integrity()
                .expect("audit chain valid")
        );
    }

    #[test]
    fn bidmc_clock_holds_frames_and_ignores_what_if_updates() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("BIDMC");
        let frame = Duration::from_millis(50);
        let mut stream = state.tx.subscribe();
        let mut expected_sqi = SqiFilter::default();
        let replay = BidmcReplayer::from_csv_path(
            "bidmc_01",
            &workspace_bidmc_dir().join("bidmc_01_Numerics.csv"),
        )
        .expect("record");
        for (second, row) in replay.rows().iter().enumerate() {
            let eval = expected_sqi.evaluate_row_detailed(row);
            for offset in 0..20 {
                let wire = if second == 0 && offset == 0 {
                    state.latest_wire_snapshot().expect("initial frame")
                } else {
                    state.advance_tick(frame).expect("tick");
                    serde_json::from_str::<WireTelemetryPacket>(&stream.try_recv().expect("broadcast"))
                        .expect("wire packet JSON")
                };
                assert_eq!(wire.relative_recording_time_s, second as f64);
                assert_eq!(wire.source_record_id, row.record_id);
                assert_eq!(wire.biometrics.pulse_rate_bpm, row.pulse_bpm);
                assert_eq!(wire.biometrics.spo2_pct, row.spo2_pct);
                assert_eq!(wire.biometrics.rmssd_ms, None);
                assert_eq!(
                    wire.biometrics.hrv_unavailable_reason,
                    Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
                );
                assert!(
                    wire.biometrics
                        .quality_flags
                        .iter()
                        .any(|flag| flag == "BEAT_INTERVALS_NOT_AVAILABLE")
                );
                assert!((wire.biometrics.sqi_score - eval.sqi_score).abs() < 1e-12);
                assert_eq!(wire.provenance_manifest.biometrics_native_rate_hz, 1.0);
                assert_eq!(wire.provenance_manifest.ui_refresh_rate_hz, 20.0);

                if second == 1 && offset == 7 {
                    let _extra_client = state.tx.subscribe();
                    let mut scenario = default_scenario_input();
                    scenario.flight_day += 1;
                    let updated = state
                        .apply_stress_test_patch(StressTestPatchRequest::from(scenario))
                        .expect("What-If");
                    assert_eq!(updated.relative_recording_time_s, 1.0);
                    assert_eq!(updated.mission_Elapsed_seconds, wire.mission_Elapsed_seconds);
                    assert_eq!(
                        state
                            .latest_snapshot()
                            .expect("snapshot")
                            .relative_recording_time_s,
                        1.0
                    );
                    stream.try_recv().expect("What-If broadcast");
                }
            }
        }
        let wrapped = state.advance_tick(frame).expect("wrap");
        assert_eq!(wrapped.relative_recording_time_s, 0.0);
        assert_eq!(wrapped.source_record_id, "bidmc_01");
        let first_eval = SqiFilter::default().evaluate_row_detailed(replay.row_at_second(0));
        assert_eq!(wrapped.biometrics.sqi_score, first_eval.sqi_score);
    }

    #[tokio::test]
    async fn test_axum_http_routes_snapshot_and_stress_test() {
        let state =
            SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("init mission state");
        let Json(snap) = get_snapshot_handler(State(state.clone()))
            .await
            .expect("GET /api/snapshot ok");
        assert_eq!(snap.astronaut_id, "BIDMC-SUBJECT-01");
        assert_eq!(
            snap.provenance_manifest.scenario_overlay_mode,
            ScenarioOverlayMode::NonePureReplay
        );
        assert!(snap.hemodynamics.is_none());
        assert!(snap.musculoskeletal.is_none());

        let mut scenario = default_scenario_input();
        scenario.pocus_thrombus_confirmed = true;
        let Json(updated) = post_stress_test_handler(
            State(state.clone()),
            Json(StressTestPatchRequest::from(scenario)),
        )
        .await
        .expect("POST /api/stress-test ok");
        assert_eq!(
            updated.active_playbook.playbook_id,
            "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS"
        );
        assert_eq!(
            updated.provenance_manifest.scenario_overlay_mode,
            ScenarioOverlayMode::SimulatedWhatifScenario
        );
        assert!(updated.hemodynamics.is_some());
        assert!(
            !updated
                .active_playbook
                .safety_gates
                .anticoagulant_lock_active
        );

        let _router = build_axum_router(state);
    }
    #[test]
    fn every_numeric_record_and_wrap_keeps_hrv_and_dependent_outputs_unavailable() {
        for record in ["bidmc_01", "bidmc_02", "bidmc_03"] {
            let path = workspace_bidmc_dir().join(format!("{record}_Numerics.csv"));
            let mut replayer =
                BidmcReplayer::from_csv_path(record, &path).expect("numeric fixture");
            let count = replayer.rows().len();
            let mut quality = SqiFilter::new();
            let mut graph = AdhgCausalEngine::new();
            let scenario = default_scenario_input();
            for i in 0..=count {
                let packet = compute_mission_telemetry_tick(
                    &mut replayer,
                    &mut quality,
                    &mut graph,
                    &scenario,
                    i as f64,
                );
                assert_eq!(packet.source_record_id, record);
                let value = serde_json::to_value(&packet).expect("serialize packet");
                for channel in ["rmssd_ms", "sdnn_ms", "pnn50_pct", "lf_hf_ratio"] {
                    assert_eq!(
                        value["biometrics"].get(channel),
                        Some(&serde_json::Value::Null)
                    );
                    assert!(
                        packet
                            .biometrics
                            .missing_channels
                            .iter()
                            .any(|x| x == channel)
                    );
                }
                assert_eq!(
                    value["biometrics"]["hrv_unavailable_reason"],
                    "BEAT_INTERVALS_NOT_AVAILABLE"
                );
                for field in [
                    "rho_rmssd",
                    "rho_global",
                    "mri_pct",
                    "ttv_hours",
                    "ttv_ci95_low_hours",
                    "ttv_ci95_high_hours",
                ] {
                    assert_eq!(value["nqs_stl"].get(field), Some(&serde_json::Value::Null));
                }
                assert_ne!(
                    packet.alert_severity,
                    ares_core_types::telemetry::AlertSeverity::Nominal
                );
                let decoded: TelemetryPacket =
                    serde_json::from_value(value).expect("roundtrip packet");
                assert_eq!(decoded, packet);
            }
        }
    }
    #[test]
    fn async_forecaster_and_compactor_preserve_missing_hrv() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");
        for _ in 0..12 {
            state
                .advance_tick(Duration::from_millis(50))
                .expect("tick");
            let snapshot = state.run_1hz_timestral_step().expect("forecaster step");
            assert!(snapshot.rmssd_ms_cone.is_none());
            assert!(snapshot.rho_global_cone.is_none());
            assert!(snapshot.ttv_hours_cone.is_none());
            assert!(snapshot.pessimistic_ttv_q05_hours.is_none());
            assert!(snapshot.abstention_certificate.abstained);
            assert!(!snapshot.channel_cones.iter().any(|cone| {
                ["rmssd_ms", "sdnn_ms", "lf_hf_ratio", "rho_global"]
                    .contains(&cone.channel_name.as_str())
            }));
            let packet = state.latest_snapshot().expect("packet");
            assert!(packet.nqs_stl.rho_global.is_none());
            assert!(packet.nqs_stl.ttv_hours.is_none());
        }
    }

    #[test]
    fn dual_horizon_timestral_and_ewma_cones_coexist_with_hrv_abstention_intact() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");
        for _ in 0..160 {
            state.advance_tick(Duration::from_secs(1)).expect("tick");
        }
        let snap = state
            .run_1hz_timestral_step()
            .expect("1Hz timestral inference");
        assert_eq!(
            snap.forecast_method,
            ForecastMethod::HybridTimestralAndEwmaShortHorizon
        );
        assert_eq!(snap.short_horizon_s, 900);
        assert_eq!(snap.ewma_short_horizon_max_s, 120);
        assert!(snap.abstention_certificate.abstained);
        assert!(snap.rmssd_ms_cone.is_none());
        assert!(snap.rho_global_cone.is_none());
        assert!(snap.ttv_hours_cone.is_none());
        assert_eq!(snap.channel_cones.len(), 8);
        assert!(!snap.short_horizon_cones.is_empty());
        snap.assert_monotone().expect("dual-horizon snapshot monotone");
        let hr_cone = snap
            .short_horizon_cones
            .iter()
            .find(|c| c.channel_name == "heart_rate_bpm")
            .expect("heart_rate_bpm short-horizon cone");
        assert!(hr_cone.horizon_5s.is_some());
        assert!(hr_cone.horizon_10s.is_some());
        assert!(hr_cone.horizon_30s.is_some());
        assert!(hr_cone.horizon_60s.is_some());
        assert!(hr_cone.horizon_120s.is_some());
    }

    #[test]
    fn injected_desaturation_raises_alarm_opens_playbook_06_and_is_tagged_synthetic() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");
        assert!(matches!(
            state.inject_anomaly(Some(InjectedAnomalyKind::DesaturationFast)),
            Err(InjectAnomalyError::BaselineLearning { .. })
        ));
        // bidmc_01 has no missing SpO2 in 0..240 s; learn the baseline for 150 s.
        for _ in 0..150 {
            state.advance_tick(Duration::from_secs(1)).expect("tick");
        }
        let before = state.latest_wire_snapshot().expect("wire");
        assert_eq!(before.vitals_anomaly["baseline_ready"], true);
        assert_eq!(before.vitals_anomaly["overall"], "NORMAL");
        assert_eq!(
            before.active_playbook.playbook_id,
            "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED"
        );

        let injection = state
            .inject_anomaly(Some(InjectedAnomalyKind::DesaturationFast))
            .expect("inject")
            .expect("scheduled");
        assert_eq!(injection.onset_s, 151.0);

        let mut alarm_delay_s = None;
        for step in 1..=60 {
            state.advance_tick(Duration::from_secs(1)).expect("tick");
            let wire = state.latest_wire_snapshot().expect("wire");
            assert_eq!(
                wire.provenance_manifest.biometrics_source,
                BiometricsSource::SimulatedScenarioInput
            );
            assert!(
                wire.biometrics
                    .quality_flags
                    .iter()
                    .any(|f| f == "INJECTED_SYNTHETIC_ANOMALY")
            );
            assert_eq!(wire.vitals_anomaly["injection"]["kind"], "DESATURATION_FAST");
            if wire.vitals_anomaly["overall"] == "ALARM" {
                assert_eq!(
                    wire.active_playbook.playbook_id,
                    "PLAYBOOK_06_HYPOXEMIA_DESATURATION"
                );
                assert_eq!(wire.alert_severity, AlertSeverity::Warning);
                assert_eq!(wire.system_phase, SystemPhase::Act);
                let reason = wire.active_playbook.causal_chain_summary[0].clone();
                assert!(reason.starts_with("SpO2 -"), "{reason}");
                alarm_delay_s = Some(step);
                break;
            }
        }
        assert!(alarm_delay_s.is_some_and(|s| s <= 30), "{alarm_delay_s:?}");

        let cleared_wire = state.inject_anomaly_wire(None).expect("clear wire");
        assert_eq!(cleared_wire.vitals_anomaly["overall"], "ALARM");
        state.advance_tick(Duration::from_secs(1)).expect("tick");
        let after = state.latest_wire_snapshot().expect("wire");
        assert_eq!(
            after.provenance_manifest.biometrics_source,
            BiometricsSource::RecordedTerrestrialBidmcCsv
        );
        assert!(after.vitals_anomaly["injection"].is_null());
    }

    #[test]
    fn injection_that_would_outlive_the_record_is_refused_and_the_restart_clears_it() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");
        for _ in 0..120 {
            state.advance_tick(Duration::from_secs(1)).expect("tick");
        }
        assert!(state.latest_vitals_anomaly().expect("report").baseline_ready);

        // Jump close to the end of the 481 s record.
        state.advance_tick(Duration::from_secs(360)).expect("jump");
        let err = state
            .inject_anomaly(Some(InjectedAnomalyKind::DesaturationFast))
            .expect_err("must be refused near the end of the record");
        assert_eq!(
            err,
            InjectAnomalyError::CrossesRecordRestart {
                duration_s: 100,
                seconds_left: 0,
            }
        );

        // Crossing the restart re-learns the baseline and leaves no event behind.
        state.advance_tick(Duration::from_secs(10)).expect("wrap");
        assert!(!state.latest_vitals_anomaly().expect("report").baseline_ready);
    }

    #[tokio::test]
    async fn audit_log_handler_exposes_verified_sha256_chain() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");
        let res = get_audit_log_handler(State(state.clone()))
            .await
            .expect("audit log handler must return 200 OK");
        let records = res.0;
        assert!(!records.is_empty(), "genesis audit record must exist");
        assert_eq!(records[0].sequence_index, 0);
        assert_eq!(records[0].prev_hash_hex, "0".repeat(64));
        let valid = state.audit_logger.verify_chain_integrity().expect("verify");
        assert!(valid, "chain integrity must be valid");
    }

    #[test]
    fn test_live_eclss_coupled_co2_scrubber_and_helmet_fault_wiring() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");

        // 1. Cabin ppCO2 > 4.0 mmHg -> EnvironmentalEclssScrubberSaturation + prepended override
        let wire_cabin = state
            .apply_stress_test_patch(StressTestPatchRequest {
                cabin_ppco2_mmhg: Some(4.8),
                ..StressTestPatchRequest::default()
            })
            .expect("cabin co2 patch");
        let a360 = wire_cabin
            .aerospace_360
            .as_ref()
            .expect("aerospace_360 populated");
        let eclss = a360.eclss_coupled.as_ref().expect("eclss_coupled populated");
        assert_eq!(
            eclss.root_cause_label,
            "EnvironmentalEclssScrubberSaturation"
        );
        assert!(eclss.scrubber_override_active);
        let snap_cabin = state.latest_snapshot().expect("snapshot");
        assert_eq!(snap_cabin.biometrics.cabin_ppco2_mmhg, Some(4.8));
        let override_count = wire_cabin
            .active_playbook
            .actions
            .iter()
            .filter(|a| a.action_id == "ACT_ECLSS_SWITCH_BACKUP_LIOH_OR_AMINE_BED")
            .count();
        assert_eq!(override_count, 1, "override action must be deduplicated");

        // 2. Cabin nominal (2.2 mmHg), helmet > 4.0 mmHg -> SuitOrHelmetVentilationFault
        let wire_helmet = state
            .apply_stress_test_patch(StressTestPatchRequest {
                cabin_ppco2_mmhg: Some(2.2),
                helmet_ppco2_mmhg: Some(5.2),
                ..StressTestPatchRequest::default()
            })
            .expect("helmet co2 patch");
        let eclss_h = wire_helmet
            .aerospace_360
            .as_ref()
            .expect("aerospace_360 populated")
            .eclss_coupled
            .as_ref()
            .expect("eclss_coupled populated");
        assert_eq!(eclss_h.root_cause_label, "SuitOrHelmetVentilationFault");
        assert!(eclss_h.scrubber_override_active);
        assert!(
            wire_helmet
                .active_playbook
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_VERIFY_ECLSS_SCRUBBER_AND_SUIT_FAN_FLOW")
        );
    }

    #[test]
    fn test_live_platelet_sync_and_pocus_scans_wiring() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");

        // Low platelets (< 50 k/uL) with nominal radiation must lock anticoagulants
        let wire_plt = state
            .apply_stress_test_patch(StressTestPatchRequest {
                platelet_count_k_ul: Some(42.0),
                radiation_dose_rate_msv_d: Some(1.0),
                pocus_thrombus_confirmed: Some(true),
                ..StressTestPatchRequest::default()
            })
            .expect("platelet patch");
        let snap_plt = state.latest_snapshot().expect("snapshot");
        assert_eq!(snap_plt.biometrics.platelet_count_k_ul, Some(42.0));
        assert!(wire_plt.active_playbook.safety_gates.anticoagulant_lock_active);
        assert!(
            wire_plt
                .active_playbook
                .safety_gates
                .anticoagulant_contraindicated_bleeding_risk
        );

        // eFAST scan with tension pneumothorax unlocks Gate 4A thoracostomy & selects PB15
        let efast = PocusEfastScan {
            lung_sliding_absent: true,
            m_mode_barcode_sign_confirmed: true,
            ..Default::default()
        };
        let wire_efast = state
            .apply_stress_test_patch(StressTestPatchRequest {
                platelet_count_k_ul: Some(250.0),
                efast_scan: Some(efast),
                renal_pocus: Some(PocusRenalBladderScan::default()),
                ..StressTestPatchRequest::default()
            })
            .expect("efast patch");
        assert_eq!(
            wire_efast.active_playbook.playbook_id,
            "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE"
        );
        assert!(
            !wire_efast
                .active_playbook
                .safety_gates
                .gate4_invasive_decompression_locked
        );

        // clear_pocus_scans resets eFAST and renal POCUS
        let wire_cleared = state
            .apply_stress_test_patch(StressTestPatchRequest {
                clear_pocus_scans: Some(true),
                ..StressTestPatchRequest::default()
            })
            .expect("clear pocus patch");
        assert_ne!(
            wire_cleared.active_playbook.playbook_id,
            "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE"
        );
    }

    #[test]
    fn test_live_lbnp_baseline_latching_and_wearable_timeout_gate2_rerun() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");

        // Rising edge !was_lbnp_active -> lbnp_active latches lbnp_baseline
        let wire_lbnp = state
            .apply_stress_test_patch(StressTestPatchRequest {
                lbnp_active: Some(true),
                lbnp_pressure_mmhg: Some(-30.0),
                ..StressTestPatchRequest::default()
            })
            .expect("lbnp patch");
        assert!(
            wire_lbnp
                .aerospace_360
                .as_ref()
                .and_then(|a| a.lbnp_baseline)
                .is_some(),
            "lbnp_baseline must latch on rising edge"
        );

        // Switch to LiveWearableHardware with no node -> advance_tick injects wearable_sensor_loss
        // and re-runs Gate 2, triggering auto-vent and setting lbnp_active = false
        state.set_source_mode(TelemetrySourceMode::LiveWearableHardware);
        let pkt = state
            .advance_tick(Duration::from_millis(50))
            .expect("advance_tick");
        assert!(
            pkt.biometrics
                .missing_channels
                .iter()
                .any(|c| c == "wearable_sensor_loss")
        );
        assert!(pkt.active_playbook.safety_gates.lbnp_auto_vent_triggered);
        assert!(!pkt.jugular_hemodynamics.lbnp_active);
    }

    #[test]
    fn test_phase2_360_stress_test_sepsis_16_ars_26_parmitano_28_gate5a_gate7a() {
        let state = SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("state");

        // 1. Parmitano #28 (Suit Water Intrusion)
        let wire_parmitano = state
            .apply_stress_test_patch(StressTestPatchRequest {
                medical_360_scenario: Some(Aerospace360ScenarioInput {
                    helmet_water_intrusion_detected: true,
                    ..Aerospace360ScenarioInput::default()
                }),
                ..StressTestPatchRequest::default()
            })
            .expect("parmitano patch");
        assert_eq!(
            wire_parmitano.active_playbook.playbook_id,
            "PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY"
        );

        // 2. ARS #26 (Acute Radiation Syndrome + Gate 6 lock)
        let wire_ars = state
            .apply_stress_test_patch(StressTestPatchRequest {
                medical_360_scenario: Some(Aerospace360ScenarioInput {
                    radiation_ars: Some(ares_core_types::medical_360::RadiationArsInput {
                        alc_t_k_ul: Some(0.35),
                        alc_hours_post_spe: Some(18.0),
                        alc_baseline_k_ul: Some(2.0),
                        emesis_onset_hours_post_spe: Some(1.5),
                        cumulative_mission_dose_msv: 2800.0,
                        days_post_spe: 18.0,
                        core_temp_c: Some(38.2),
                    }),
                    ..Aerospace360ScenarioInput::default()
                }),
                ..StressTestPatchRequest::default()
            })
            .expect("ars patch");
        assert_eq!(
            wire_ars.active_playbook.playbook_id,
            "PLAYBOOK_26_ACUTE_RADIATION_SYNDROME"
        );
        let a360_ars = wire_ars.aerospace_360.as_ref().expect("aerospace_360");
        assert!(
            a360_ars
                .extended_safety_gates
                .gate6_radiation_neutropenic_invasive_locked
        );

        // 3. Sepsis #16 (suspected_infection + elevated lactate)
        state.inner.write().expect("lock").spot_poct = Some(SpotPoctPanel {
            lactate_mmol_l: Some(3.2),
            wbc_k_ul: Some(15.5),
            creatinine_mg_dl: Some(1.9),
            platelet_count_k_ul: Some(60.0),
            ..Default::default()
        });
        let wire_sepsis = state
            .apply_stress_test_patch(StressTestPatchRequest {
                platelet_count_k_ul: Some(60.0),
                medical_360_scenario: Some(Aerospace360ScenarioInput {
                    suspected_infection: true,
                    gi_ulcer_history_or_bleed: true,
                    ..Aerospace360ScenarioInput::default()
                }),
                ..StressTestPatchRequest::default()
            })
            .expect("sepsis patch");
        assert_eq!(
            wire_sepsis.active_playbook.playbook_id,
            "PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK"
        );
        let a360_sep = wire_sepsis.aerospace_360.as_ref().expect("aerospace_360");
        assert!(
            a360_sep
                .pharmacology_sepsis
                .as_ref()
                .is_some_and(|p| p.sepsis_protocol_active)
        );

        // 3b. Ketorolac Gate 5A on Renal Colic (#10) with Cr 1.9 + PLT 60 + GI ulcer history
        state.inner.write().expect("lock").spot_poct = Some(SpotPoctPanel {
            creatinine_mg_dl: Some(1.9),
            platelet_count_k_ul: Some(60.0),
            ..Default::default()
        });
        let wire_gate5a = state
            .apply_stress_test_patch(StressTestPatchRequest {
                renal_pocus: Some(PocusRenalBladderScan {
                    hydronephrosis_grade: 2,
                    calculus_detected: true,
                    calculus_diameter_mm: 5.0,
                    twinkling_artifact_present: true,
                    post_void_bladder_volume_ml: 120.0,
                    ..Default::default()
                }),
                medical_360_scenario: Some(Aerospace360ScenarioInput {
                    suspected_infection: false,
                    gi_ulcer_history_or_bleed: true,
                    suit_pressure_psi: Some(14.7),
                    prebreathe_o2_minutes: Some(150.0),
                    ..Aerospace360ScenarioInput::default()
                }),
                ..StressTestPatchRequest::default()
            })
            .expect("gate5a patch");
        assert_eq!(
            wire_gate5a.active_playbook.playbook_id,
            "PLAYBOOK_10_RENAL_LITHIASIS"
        );
        assert!(
            wire_gate5a
                .aerospace_360
                .as_ref()
                .expect("aerospace_360")
                .extended_safety_gates
                .gate5_nsaid_renal_bleeding_locked
        );

        // 4. BMed Gate 7A delirium exclusion (hypercapnia > 4.0 mmHg + acute agitation -> organic mimic)
        state.inner.write().expect("lock").spot_poct = None;
        let wire_bmed = state
            .apply_stress_test_patch(StressTestPatchRequest {
                cabin_ppco2_mmhg: Some(4.6),
                platelet_count_k_ul: Some(250.0),
                medical_360_scenario: Some(Aerospace360ScenarioInput {
                    phq9_score: Some(18),
                    acute_agitation_or_psychosis: true,
                    ..Aerospace360ScenarioInput::default()
                }),
                ..StressTestPatchRequest::default()
            })
            .expect("bmed patch");
        let a360_bmed = wire_bmed.aerospace_360.as_ref().expect("aerospace_360");
        assert!(
            a360_bmed
                .behavioral_health
                .as_ref()
                .is_some_and(|b| b.organic_delirium_mimic_detected)
        );
        assert!(
            a360_bmed
                .extended_safety_gates
                .gate7_bmed_delirium_or_restraint_guard_active
        );
    }
}
