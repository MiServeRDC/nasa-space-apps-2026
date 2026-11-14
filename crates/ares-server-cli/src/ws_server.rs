//! Fase 13 (G1) + Blocchi H & I: Server HTTP/WebSocket Axum a 20 Hz su `127.0.0.1:8080`,
//! API `/api/stress-test`, bridge Timestral 1 Hz -> 20 Hz e ARES-HyperGraph / ARES-DatasetGraph.

use ares_causal_graph::adhg_graph::{AdhgCausalEngine, AdhgNodeKind};
use ares_causal_graph::biokg_reasoner::{NormativeClinicalGrounding, ground_adhg_node_o1};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_causal_graph::error::CausalGraphError;
use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state;
use ares_causal_graph::hypergraph_spatial::{
    AnatomicalRegionSubgraph, AnatomicalRiskInputs, BodyHeatmap, HabitatDeonticAssessment,
    HabitatEnvironmentState, HabitatZoneDeonticPolicy, HabitatZoneId, MissionLongitudinalCompactor,
    PhysiologicalTick, ZoneTransitionMarkovModel,
};
use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
use ares_core_types::NqsQuantileForecastSnapshot;
use ares_core_types::security::{CrewRole, MedOpsAuditLogger};
use ares_core_types::telemetry::{
    BiometricsSource, ProvenanceManifest, ScenarioOverlayMode, StressTestScenarioInput,
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
use ares_telemetry_ingest::bidmc_replayer::{BidmcReplayer, IngestError};
use ares_telemetry_ingest::scenario_overlay::merge_biometrics_with_scenario;
use ares_telemetry_ingest::sqi_filter::SqiFilter;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use std::path::Path;
use std::sync::{Arc, RwLock};
use thiserror::Error;
use tokio::sync::broadcast;

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
    // 1. GATHER: Preleva riga reale 1 Hz da BIDMC v1.0.0 e applica filtro SQI >= 0.70
    let row = replayer.next_row().clone();
    let biometrics = merge_biometrics_with_scenario(&row, scenario, sqi_filter);

    // 2. EVALUATE (Parte 1): ODE RK4 Frost-Hargens, Shear Stress Giugulare tau_w, SANS e Grafo ADHG
    let musculo = compute_musculoskeletal_state(scenario.flight_day, scenario.ared_daily_load_kgf);
    let (jugular, sans) = compute_jugular_and_sans_state(&musculo, scenario);
    let (_pocus_est, causal_chain) = adhg_engine.update_and_extract_causal_chain(
        &musculo,
        &jugular,
        &sans,
        biometrics.radiation_dose_rate_msv_d,
    );

    // 2. EVALUATE (Parte 2): Margini normalizzati NQS-STL, TTV +/- 1.96 sigma e Mission Readiness Index
    let (nqs_stl, alert_severity) =
        evaluate_nqs_stl_and_mri(&biometrics, &musculo, &jugular, &sans);

    // 3. ACT: Selezione Playbook #01-#05 e applicazione inflessibile dei 3 Hard Clinical Safety Gates
    let candidate_playbook =
        select_candidate_playbook(&biometrics, &musculo, &jugular, &nqs_stl, causal_chain);
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

    TelemetryPacket {
        timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
        mission_Elapsed_seconds: mission_elapsed_s,
        relative_recording_time_s: row.relative_time_s,
        source_record_id: row.record_id,
        flight_day: scenario.flight_day,
        astronaut_id: "ARES-CDR-01".to_string(),
        system_phase,
        alert_severity,
        provenance_manifest: ProvenanceManifest {
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
            biometrics_native_rate_hz: 1.0,
            ui_refresh_rate_hz: 20.0,
            scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
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
    }
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
    pub adhg_engine: AdhgCausalEngine,
    pub scenario: StressTestScenarioInput,
    pub mission_elapsed_s: f64,
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
        let snap = self
            .forecaster_engine
            .ingest_sample_1hz(&sample, &covariates, ode_drift)?;
        self.latest_quantile_snapshot = Arc::clone(&snap);
        Ok(snap)
    }
}

/// Stato condiviso tra il server Axum HTTP/WebSocket, il co-processore Timestral 1 Hz
/// e il server FastMCP su `stdio`.
pub struct SharedMissionState {
    pub inner: RwLock<MissionRuntimeInner>,
    pub tx: broadcast::Sender<String>,
    pub audit_logger: Sha256AuditLogger,
    pub dataset_graph: Arc<AresUnifiedDatasetGraph>,
}

impl SharedMissionState {
    /// Inizializza lo stato condiviso caricando `bidmc_01..03_Numerics.csv`,
    /// inizializzando Timestral (Blocco H), `ARES-HyperGraph` e `ARES-DatasetGraph` (Blocco I).
    pub fn from_data_dir(data_dir: &Path) -> Result<Arc<Self>, ServerRuntimeError> {
        let csv_path = data_dir.join("bidmc_01_Numerics.csv");
        let mut replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path)?;
        let mut sqi_filter = SqiFilter::default();
        let mut adhg_engine = AdhgCausalEngine::new();
        let scenario = default_scenario_input();
        let latest_packet = compute_mission_telemetry_tick(
            &mut replayer,
            &mut sqi_filter,
            &mut adhg_engine,
            &scenario,
            0.0,
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

        Ok(Arc::new(Self {
            inner: RwLock::new(MissionRuntimeInner {
                replayer,
                sqi_filter,
                adhg_engine,
                scenario,
                mission_elapsed_s: 0.0,
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
            }),
            tx,
            audit_logger,
            dataset_graph,
        }))
    }

    /// Avanza di un tick (`dt_s = 0.05` s a 20 Hz) mantenendo il budget < 150 us.
    pub fn advance_tick(&self, dt_s: f64) -> Option<TelemetryPacket> {
        let mut guard = self.inner.write().ok()?;
        guard.mission_elapsed_s += dt_s;
        guard.tick_counter = guard.tick_counter.saturating_add(1);
        let elapsed = guard.mission_elapsed_s;
        let scenario = guard.scenario.clone();
        let packet = {
            let MissionRuntimeInner {
                replayer,
                sqi_filter,
                adhg_engine,
                ..
            } = &mut *guard;
            compute_mission_telemetry_tick(replayer, sqi_filter, adhg_engine, &scenario, elapsed)
        };
        guard.latest_packet = packet;
        guard.update_hypergraph_and_nqs_hot_path();

        let snapshot_packet = guard.latest_packet.clone();
        if let Ok(json_str) = serde_json::to_string(&snapshot_packet) {
            let _ = self.tx.send(json_str);
        }
        Some(snapshot_packet)
    }

    /// Esegue uno step del co-processore asincrono Timestral a 1 Hz.
    pub fn run_1hz_timestral_step(&self) -> Option<Arc<NqsQuantileForecastSnapshot>> {
        let mut guard = self.inner.write().ok()?;
        guard.run_1hz_timestral_inference().ok()
    }

    /// Applica un nuovo scenario What-If in < 1 ms, aggiorna HyperGraph e audit log SHA-256.
    pub fn apply_stress_test(
        &self,
        new_scenario: StressTestScenarioInput,
    ) -> Option<TelemetryPacket> {
        let mut guard = self.inner.write().ok()?;
        guard.scenario = new_scenario.clone();
        let elapsed = guard.mission_elapsed_s;
        let packet = {
            let MissionRuntimeInner {
                replayer,
                sqi_filter,
                adhg_engine,
                ..
            } = &mut *guard;
            compute_mission_telemetry_tick(
                replayer,
                sqi_filter,
                adhg_engine,
                &new_scenario,
                elapsed,
            )
        };
        guard.latest_packet = packet;
        guard.update_hypergraph_and_nqs_hot_path();
        let _ = guard.run_1hz_timestral_inference();

        let snapshot_packet = guard.latest_packet.clone();
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
        if let Ok(json_str) = serde_json::to_string(&snapshot_packet) {
            let _ = self.tx.send(json_str);
        }
        Some(snapshot_packet)
    }

    /// Legge una copia dell'ultimo `TelemetryPacket` calcolato.
    pub fn latest_snapshot(&self) -> Option<TelemetryPacket> {
        self.inner.read().ok().map(|g| g.latest_packet.clone())
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

/// Costruisce il router Axum con `/ws/telemetry`, `GET /api/snapshot` e `POST /api/stress-test`.
pub fn build_axum_router(state: Arc<SharedMissionState>) -> Router {
    Router::new()
        .route("/ws/telemetry", get(ws_telemetry_handler))
        .route("/api/snapshot", get(get_snapshot_handler))
        .route("/api/stress-test", post(post_stress_test_handler))
        .with_state(state)
}

async fn get_snapshot_handler(
    State(state): State<Arc<SharedMissionState>>,
) -> Result<Json<TelemetryPacket>, StatusCode> {
    state
        .latest_snapshot()
        .map(Json)
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)
}

async fn post_stress_test_handler(
    State(state): State<Arc<SharedMissionState>>,
    Json(input): Json<StressTestScenarioInput>,
) -> Result<Json<TelemetryPacket>, StatusCode> {
    state
        .apply_stress_test(input)
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
    if let Some(initial) = state.latest_snapshot()
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
            state.advance_tick(0.05).expect("advance tick");
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

    #[tokio::test]
    async fn test_axum_http_routes_snapshot_and_stress_test() {
        let state =
            SharedMissionState::from_data_dir(&workspace_bidmc_dir()).expect("init mission state");
        let Json(snap) = get_snapshot_handler(State(state.clone()))
            .await
            .expect("GET /api/snapshot ok");
        assert_eq!(snap.astronaut_id, "ARES-CDR-01");

        let mut scenario = default_scenario_input();
        scenario.pocus_thrombus_confirmed = true;
        let Json(updated) = post_stress_test_handler(State(state.clone()), Json(scenario))
            .await
            .expect("POST /api/stress-test ok");
        assert_eq!(
            updated.active_playbook.playbook_id,
            "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS"
        );
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
            state.advance_tick(0.05).expect("tick");
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
