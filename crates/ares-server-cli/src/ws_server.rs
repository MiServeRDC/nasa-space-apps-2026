//! Fase 13 (G1) + Blocchi H & I: Server HTTP/WebSocket Axum a 20 Hz su `127.0.0.1:8080`,
//! API `/api/stress-test`, bridge Timestral 1 Hz -> 20 Hz e ARES-HyperGraph / ARES-DatasetGraph.

use crate::fastmcp_router::{JsonRpcRequest, JsonRpcResponse, handle_fastmcp_jsonrpc_request};
use crate::wire_contract::{StressTestPatchRequest, WirePacketContext, WireTelemetryPacket};
use ares_causal_graph::adhg_graph::{AdhgCausalEngine, AdhgNodeKind};
use ares_causal_graph::biokg_reasoner::{NormativeClinicalGrounding, ground_adhg_node_o1};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_causal_graph::error::CausalGraphError;
use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state;
use ares_causal_graph::hypergraph_spatial::{
    AnatomicalRegionSubgraph, AnatomicalRiskInputs, BodyHeatmap, DeonticModality,
    HabitatDeonticAssessment, HabitatEnvironmentState, HabitatZoneDeonticPolicy, HabitatZoneId,
    MARS_SOL_SECONDS, MissionLongitudinalCompactor, PhysiologicalTick, ZoneTransitionMarkovModel,
};
use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
use ares_core_types::NqsQuantileForecastSnapshot;
use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, BinaryFrameMeta, BinaryTelemetryFrame, DEONTIC_EIMO_AUTONOMOUS,
    DEONTIC_EVA_FORBIDDEN, DEONTIC_SHELTER_MANDATORY, DEONTIC_VIOLATES_POLICY,
    PARTITION_ALL_NOMINAL, SeqlockTelemetryRing,
};
use ares_core_types::security::{CrewRole, MedOpsAuditLogger};
use ares_core_types::telemetry::{
    Biometrics, BiometricsSource, ProvenanceManifest, ScenarioOverlayMode, StressTestScenarioInput,
    SystemPhase, TelemetryPacket,
};
use ares_medops_playbooks::playbooks::select_candidate_playbook;
use ares_medops_playbooks::safety_gates::enforce_hard_clinical_safety_gates;
use ares_nqs_stl::NqsEngine;
use ares_nqs_stl::error::NqsStlError;
use ares_nqs_stl::mri_index::evaluate_nqs_stl_and_mri;
use ares_nqs_stl::timestral_backbone::{ARES_TIMESTRAL_CHANNELS, TimestralConfig};
use ares_nqs_stl::timestral_bridge::{
    AresMultivariateSample, AresTemporalForecasterEngine, KnownFutureCovariates,
};
use ares_security_privacy::audit_chain::Sha256AuditLogger;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
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

/// Errori tipizzati di inizializzazione del runtime `ares-server-cli`.
#[derive(Debug, Error)]
pub enum ServerRuntimeError {
    #[error("telemetry ingest error: {0}")]
    Ingest(#[from] IngestError),
    #[error("timestral / NQS-STL error: {0}")]
    NqsStl(#[from] NqsStlError),
    #[error("causal / hypergraph error: {0}")]
    CausalGraph(#[from] CausalGraphError),
}

/// Restituisce lo scenario nominale iniziale per l'avvio della missione.
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

/// Risolve in O(1) il nodo ADHG primario associato al Playbook MedOps attivo.
#[inline]
pub fn primary_adhg_node_for_playbook(playbook_id: &str) -> AdhgNodeKind {
    match playbook_id {
        "PLAYBOOK_01_VENOUS_STASIS_LBNP" => AdhgNodeKind::IjvVenousStasisShearStress,
        "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS" => AdhgNodeKind::PocusThrombusPosterior,
        "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED" => AdhgNodeKind::AredMechanicalLoad,
        "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION" => AdhgNodeKind::SansTranslaminarGradient,
        "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS" => AdhgNodeKind::CansRadiationOxidativeStress,
        _ => AdhgNodeKind::AredMechanicalLoad,
    }
}

/// Esegue un singolo ciclo deterministico (GATHER -> EVALUATE -> ACT) in < 150 microsecondi.
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
    compute_mission_telemetry_tick_from_row(
        &row,
        biometrics,
        adhg_engine,
        scenario,
        mission_elapsed_s,
        false,
    )
    .0
}

fn compute_mission_telemetry_tick_from_row(
    row: &BidmcNumericRow,
    biometrics: Biometrics,
    adhg_engine: &mut AdhgCausalEngine,
    scenario: &StressTestScenarioInput,
    mission_elapsed_s: f64,
    what_if_active: bool,
) -> (TelemetryPacket, f64, Vec<String>) {
    // 2. EVALUATE (Parte 1): ODE RK4 Frost-Hargens, Shear Stress Giugulare tau_w, SANS e Grafo ADHG
    let musculo = compute_musculoskeletal_state(scenario.flight_day, scenario.ared_daily_load_kgf);
    let (jugular, sans) = compute_jugular_and_sans_state(&musculo, scenario);
    let (pocus_est, causal_chain) = adhg_engine.update_and_extract_causal_chain(
        &musculo,
        &jugular,
        &sans,
        biometrics.radiation_dose_rate_msv_d,
    );

    // 2. EVALUATE (Parte 2): Margini normalizzati NQS-STL, TTV +/- 1.96 sigma e Mission Readiness Index
    let (nqs_stl, alert_severity) =
        evaluate_nqs_stl_and_mri(&biometrics, &musculo, &jugular, &sans);

    // 3. ACT: Selezione Playbook #01-#05 e applicazione inflessibile dei 3 Hard Clinical Safety Gates
    let candidate_playbook = select_candidate_playbook(
        &biometrics,
        &musculo,
        &jugular,
        &nqs_stl,
        causal_chain.clone(),
    );
    let active_playbook = enforce_hard_clinical_safety_gates(
        candidate_playbook,
        &biometrics,
        &musculo,
        &jugular,
        scenario,
    );

    let system_phase = if nqs_stl.has_known_violation() || jugular.pocus_thrombus_confirmed {
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
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
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
    };
    (packet, pocus_est.thrombus_posterior, causal_chain)
}

/// Snapshot immutabile estratto per il router FastMCP (< 150 token Context-Mode).
#[derive(Debug, Clone)]
pub struct FastMcpRuntimeContext {
    pub latest_packet: TelemetryPacket,
    pub quantile_snapshot: Arc<NqsQuantileForecastSnapshot>,
    pub heatmap: BodyHeatmap,
    pub habitat_assessment: HabitatDeonticAssessment,
    pub grounding: NormativeClinicalGrounding,
    pub dataset_graph: Arc<AresUnifiedDatasetGraph>,
}

/// Stato mutabile interno protetto da RwLock per la pipeline a 20 Hz, Timestral 1 Hz e HyperGraph.
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
    pub longitudinal_compactor: MissionLongitudinalCompactor,
    pub anatomical_subgraph: AnatomicalRegionSubgraph,
    pub latest_heatmap: BodyHeatmap,
    pub habitat_policy: HabitatZoneDeonticPolicy,
    pub habitat_state: HabitatEnvironmentState,
    pub latest_habitat_assessment: HabitatDeonticAssessment,
    pub zone_markov: ZoneTransitionMarkovModel,
    pub latest_quantile_snapshot: Arc<NqsQuantileForecastSnapshot>,
    pub latest_grounding: NormativeClinicalGrounding,
    pub tick_counter: u64,
    pub seu_restart_count: u16,
    pub owlt_delay_sec: f32,
    pub eimo_autonomous_active: bool,
    pub last_timestral_latency_us: u64,
    pub last_ingest_latency_us: u64,
}

impl MissionRuntimeInner {
    fn update_hypergraph_and_nqs_hot_path(&mut self) {
        let eval = {
            let pkt = &self.latest_packet;
            self.nqs_engine.evaluate_tick(
                pkt.relative_recording_time_s,
                &pkt.biometrics,
                &pkt.musculoskeletal,
                &pkt.jugular_hemodynamics,
                &pkt.sans_ocular,
            )
        };
        self.latest_packet.nqs_stl = eval.margins;
        self.latest_quantile_snapshot = eval.quantile_snapshot;
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

    fn to_wire_packet(&self) -> WireTelemetryPacket {
        let timestral_quantiles =
            serde_json::to_value(&*self.latest_quantile_snapshot).unwrap_or(serde_json::Value::Null);
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
            causal_chain: self.latest_causal_chain.clone(),
            timestral_quantiles,
            hypergraph_spatial,
            recompute_latency_us: self.latest_recompute_latency_us,
        })
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
        self.latest_quantile_snapshot = Arc::clone(&snap);
        Ok(snap)
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

        let mins = (self.owlt_delay_sec / 60.0).floor() as u32;
        let secs = (self.owlt_delay_sec % 60.0).round() as u32;
        let owlt_label = if self.eimo_autonomous_active {
            format!("OWLT: {mins}m {secs:02}s (EIMO AUTONOMOUS)")
        } else {
            format!("OWLT: {:.1}s (LEO NOMINAL)", self.owlt_delay_sec)
        };

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
            owlt: OwltMarsCommState {
                owlt_seconds: self.owlt_delay_sec,
                eimo_autonomous_active: self.eimo_autonomous_active,
                blackout_active: false,
                label: owlt_label,
            },
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

/// Stato condiviso tra il server Axum HTTP/WebSocket, il co-processore Timestral 1 Hz,
/// il ring buffer binario zero-copy Seqlock e il server FastMCP su `stdio`.
pub struct SharedMissionState {
    pub inner: RwLock<MissionRuntimeInner>,
    pub tx: broadcast::Sender<String>,
    pub binary_ring: Arc<SeqlockTelemetryRing<64>>,
    pub audit_logger: Sha256AuditLogger,
    pub dataset_graph: Arc<AresUnifiedDatasetGraph>,
}

impl SharedMissionState {
    /// Inizializza lo stato condiviso caricando `bidmc_01..03_Numerics.csv`,
    /// inizializzando Timestral (Blocco H), `ARES-HyperGraph` e `ARES-DatasetGraph` (Blocco I).
    pub fn from_data_dir(data_dir: &Path) -> Result<Arc<Self>, ServerRuntimeError> {
        let csv_path = data_dir.join("bidmc_01_Numerics.csv");
        let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path)?;
        let mut sqi_filter = SqiFilter::default();
        let mut adhg_engine = AdhgCausalEngine::new();
        let scenario = default_scenario_input();
        let first_row = replayer.row_at_second(0).clone();
        let signal_quality = sqi_filter.evaluate_row_detailed(&first_row);
        let first_biometrics = biometrics_with_signal_quality(&first_row, &scenario, &signal_quality);
        let (latest_packet, latest_pocus_posterior, latest_causal_chain) =
            compute_mission_telemetry_tick_from_row(
                &first_row,
                first_biometrics,
                &mut adhg_engine,
                &scenario,
                0.0,
                false,
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

        // Warm-up deterministico di 8 campioni a 1 Hz per calibrare il cono quantilico iniziale.
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
        }
        let eval = nqs_engine.evaluate_tick(
            latest_packet.relative_recording_time_s,
            &latest_packet.biometrics,
            &latest_packet.musculoskeletal,
            &latest_packet.jugular_hemodynamics,
            &latest_packet.sans_ocular,
        );
        let latest_quantile_snapshot = eval.quantile_snapshot;
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
                longitudinal_compactor,
                anatomical_subgraph,
                latest_heatmap,
                habitat_policy,
                habitat_state,
                latest_habitat_assessment,
                zone_markov,
                latest_quantile_snapshot,
                latest_grounding,
                tick_counter: 0,
                seu_restart_count: 0,
                owlt_delay_sec: 852.0,
                eimo_autonomous_active: true,
                last_timestral_latency_us: 0,
                last_ingest_latency_us: 0,
            }),
            tx,
            binary_ring,
            audit_logger,
            dataset_graph,
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
    /// `seu_restart_count`, causal state, and publishing a 128-byte `BinaryTelemetryFrame`.
    pub fn ingest_wearable_packet(
        &self,
        packet: &WearableSensorPacket,
    ) -> Option<ValidatedTelemetryFrame> {
        let start = Instant::now();
        let mut guard = self.inner.write().ok()?;
        let scenario = guard.scenario.clone();
        let validated = packet.to_validated_frame(
            &format!("hubris_node_{:02}", packet.node_id),
            &scenario,
            &mut guard.sqi_filter,
        );
        guard.seu_restart_count = guard
            .seu_restart_count
            .max(validated.supervisor_restart_count);
        guard.signal_quality = validated.sqi_evaluation.clone();
        guard.tick_counter = guard.tick_counter.saturating_add(1);
        let elapsed = guard.mission_elapsed_s;
        let what_if_active = guard.what_if_active;

        let (telemetry_packet, pocus_posterior, causal_chain) =
            compute_mission_telemetry_tick_from_row(
                &validated.row,
                validated.biometrics.clone(),
                &mut guard.adhg_engine,
                &scenario,
                elapsed,
                what_if_active,
            );
        guard.latest_packet = telemetry_packet;
        guard.latest_pocus_posterior = pocus_posterior;
        guard.latest_causal_chain = causal_chain;
        guard.update_hypergraph_and_nqs_hot_path();
        guard.last_ingest_latency_us = start.elapsed().as_micros() as u64;
        guard.latest_recompute_latency_us = guard.last_ingest_latency_us;

        let frame = guard.build_binary_frame((start.elapsed().as_nanos()).min(u128::from(u32::MAX)) as u32);
        self.binary_ring.publish(&frame);
        let _ = self.audit_logger.append_audit_event(
            CrewRole::CrewMedicalOfficer,
            &format!(
                "HUBRIS_WEARABLE_INGEST:NODE={}:SEQ={}:SEU_RESTARTS={}",
                packet.node_id, packet.sequence_num, packet.supervisor_restart_count
            ),
        );
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

    /// Avanza il clock di replay (`dt`, tipicamente `50 ms` a 20 Hz), mantenendo
    /// i canali registrati BIDMC bloccati alla cadenza nativa di `1 Hz` (`1000 ms`).
    pub fn advance_tick(&self, dt: Duration) -> Option<TelemetryPacket> {
        let start = Instant::now();
        let mut guard = self.inner.write().ok()?;
        let previous_second = guard.replay_elapsed.as_secs();
        guard.replay_elapsed = guard.replay_elapsed.saturating_add(dt);
        let current_second = guard.replay_elapsed.as_secs();
        let total_rows = guard.replayer.len().max(1) as u64;
        let sample_index = (current_second % total_rows) as usize;
        let row = guard.replayer.row_at_second(sample_index).clone();

        if current_second != previous_second {
            let ingest_start = Instant::now();
            if sample_index == 0 {
                guard.sqi_filter = SqiFilter::default();
            }
            guard.signal_quality = guard.sqi_filter.evaluate_row_detailed(&row);
            guard.last_ingest_latency_us = ingest_start.elapsed().as_micros() as u64;
        }

        let biometrics =
            biometrics_with_signal_quality(&row, &guard.scenario, &guard.signal_quality);
        guard.mission_elapsed_s = guard.replay_elapsed.as_secs_f64();
        guard.tick_counter = guard.tick_counter.saturating_add(1);
        let elapsed = guard.mission_elapsed_s;
        let scenario = guard.scenario.clone();
        let what_if_active = guard.what_if_active;

        let (packet, pocus_posterior, causal_chain) = compute_mission_telemetry_tick_from_row(
            &row,
            biometrics,
            &mut guard.adhg_engine,
            &scenario,
            elapsed,
            what_if_active,
        );
        guard.latest_packet = packet;
        guard.latest_pocus_posterior = pocus_posterior;
        guard.latest_causal_chain = causal_chain;
        guard.update_hypergraph_and_nqs_hot_path();
        guard.latest_recompute_latency_us = start.elapsed().as_micros() as u64;

        let bin_frame = guard.build_binary_frame(
            start.elapsed().as_nanos().min(u128::from(u32::MAX)) as u32,
        );
        self.binary_ring.publish(&bin_frame);

        let snapshot_packet = guard.latest_packet.clone();
        if self.tx.receiver_count() > 0
            && let Ok(json_str) = serde_json::to_string(&guard.to_wire_packet())
        {
            let _ = self.tx.send(json_str);
        }
        Some(snapshot_packet)
    }

    /// Esegue uno step del co-processore asincrono Timestral a 1 Hz.
    pub fn run_1hz_timestral_step(&self) -> Option<Arc<NqsQuantileForecastSnapshot>> {
        let mut guard = self.inner.write().ok()?;
        guard.run_1hz_timestral_inference().ok()
    }

    /// Applica un nuovo scenario What-If completo senza avanzare il cursore BIDMC (`1 Hz`).
    pub fn apply_stress_test(
        &self,
        new_scenario: StressTestScenarioInput,
    ) -> Option<TelemetryPacket> {
        self.apply_stress_test_patch(StressTestPatchRequest::from(new_scenario))?;
        self.latest_snapshot()
    }

    /// Applica un payload What-If completo o parziale in < 1 ms senza avanzare `replay_elapsed`.
    pub fn apply_stress_test_patch(
        &self,
        patch: StressTestPatchRequest,
    ) -> Option<WireTelemetryPacket> {
        let start = Instant::now();
        let mut guard = self.inner.write().ok()?;
        let mut next_ppco2 = guard.cabin_ppco2_mmhg;
        let new_scenario = patch.apply_onto(&guard.scenario, &mut next_ppco2);
        guard.scenario = new_scenario.clone();
        guard.cabin_ppco2_mmhg = next_ppco2;
        guard.what_if_active = true;

        let total_rows = guard.replayer.len().max(1) as u64;
        let sample_index = (guard.replay_elapsed.as_secs() % total_rows) as usize;
        let row = guard.replayer.row_at_second(sample_index).clone();
        let biometrics =
            biometrics_with_signal_quality(&row, &new_scenario, &guard.signal_quality);
        let elapsed = guard.mission_elapsed_s;

        let (packet, pocus_posterior, causal_chain) = compute_mission_telemetry_tick_from_row(
            &row,
            biometrics,
            &mut guard.adhg_engine,
            &new_scenario,
            elapsed,
            true,
        );
        guard.latest_packet = packet;
        guard.latest_pocus_posterior = pocus_posterior;
        guard.latest_causal_chain = causal_chain;
        guard.update_hypergraph_and_nqs_hot_path();
        let _ = guard.run_1hz_timestral_inference();
        guard.latest_recompute_latency_us = start.elapsed().as_micros() as u64;

        let bin_frame = guard.build_binary_frame(
            start.elapsed().as_nanos().min(u128::from(u32::MAX)) as u32,
        );
        self.binary_ring.publish(&bin_frame);

        let wire_snapshot = guard.to_wire_packet();
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

    /// Legge una copia dell'ultimo `TelemetryPacket` calcolato.
    pub fn latest_snapshot(&self) -> Option<TelemetryPacket> {
        self.inner.read().ok().map(|g| g.latest_packet.clone())
    }

    /// Legge una copia dell'ultimo `WireTelemetryPacket` compatibile con `contracts/telemetry_schema.json`.
    pub fn latest_wire_snapshot(&self) -> Option<WireTelemetryPacket> {
        self.inner.read().ok().map(|g| g.to_wire_packet())
    }

    /// Estrae il contesto completo e compatto per il router `FastMCP` (< 150 token).
    pub fn fastmcp_context(&self) -> Option<FastMcpRuntimeContext> {
        let guard = self.inner.read().ok()?;
        Some(FastMcpRuntimeContext {
            latest_packet: guard.latest_packet.clone(),
            quantile_snapshot: Arc::clone(&guard.latest_quantile_snapshot),
            heatmap: guard.latest_heatmap.clone(),
            habitat_assessment: guard.latest_habitat_assessment.clone(),
            grounding: guard.latest_grounding,
            dataset_graph: Arc::clone(&self.dataset_graph),
        })
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

/// Costruisce il router Axum con `/ws/telemetry`, `GET /api/snapshot`,
/// `POST /api/stress-test`, `GET /api/os-status`, `GET /api/binary-frame` e `POST /api/mcp`.
pub fn build_axum_router(state: Arc<SharedMissionState>) -> Router {
    Router::new()
        .route("/ws/telemetry", get(ws_telemetry_handler))
        .route("/api/snapshot", get(get_snapshot_handler))
        .route("/api/os-status", get(get_os_status_handler))
        .route("/api/binary-frame", get(get_binary_frame_handler))
        .route(
            "/api/mcp",
            post(post_mcp_handler).options(cors_preflight_handler),
        )
        .route(
            "/api/stress-test",
            post(post_stress_test_handler).options(cors_preflight_handler),
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

async fn ws_telemetry_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<SharedMissionState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_client(socket, state))
}

async fn handle_ws_client(mut socket: WebSocket, state: Arc<SharedMissionState>) {
    if let Some(initial) = state.latest_wire_snapshot()
        && let Ok(text) = serde_json::to_string(&initial)
        && socket.send(Message::Text(text.into())).await.is_err()
    {
        return;
    }

    let mut rx = state.tx.subscribe();
    while let Ok(payload) = rx.recv().await {
        if socket.send(Message::Text(payload.into())).await.is_err() {
            break;
        }
    }
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
        assert!(
            avg_us < 150.0,
            "Expected average tick latency < 150 us, got {avg_us:.2} us"
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
}
