//! Fase 13 (G1): Server HTTP/WebSocket Axum a 20 Hz su `127.0.0.1:8080` e API `/api/stress-test`.

use ares_causal_graph::adhg_graph::AdhgCausalEngine;
use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state;
use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
use ares_core_types::security::{CrewRole, MedOpsAuditLogger};
use ares_core_types::telemetry::{
    BiometricsSource, ProvenanceManifest, ScenarioOverlayMode, StressTestScenarioInput,
    SystemPhase, TelemetryPacket,
};
use ares_medops_playbooks::playbooks::select_candidate_playbook;
use ares_medops_playbooks::safety_gates::enforce_hard_clinical_safety_gates;
use ares_nqs_stl::mri_index::evaluate_nqs_stl_and_mri;
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
use tokio::sync::broadcast;

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

/// Esegue un singolo ciclo completo (GATHER -> EVALUATE -> ACT) in < 150 microsecondi.
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

    // 2. EVALUATE (Parte 2): Margini normalizzati NQS-STL, TTV ±1.96σ e Mission Readiness Index
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

/// Stato mutabile interno protetto da RwLock per la pipeline a 20 Hz e gli stress test.
pub struct MissionRuntimeInner {
    pub replayer: BidmcReplayer,
    pub sqi_filter: SqiFilter,
    pub adhg_engine: AdhgCausalEngine,
    pub scenario: StressTestScenarioInput,
    pub mission_elapsed_s: f64,
    pub latest_packet: TelemetryPacket,
}

/// Stato condiviso tra il server Axum HTTP/WebSocket e il server FastMCP su `stdio`.
pub struct SharedMissionState {
    pub inner: RwLock<MissionRuntimeInner>,
    pub tx: broadcast::Sender<String>,
    pub audit_logger: Sha256AuditLogger,
}

impl SharedMissionState {
    /// Inizializza lo stato condiviso caricando `bidmc_01_Numerics.csv` dalla directory specificata.
    pub fn from_data_dir(data_dir: &Path) -> Result<Arc<Self>, IngestError> {
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
        let (tx, _) = broadcast::channel(128);
        let audit_logger = Sha256AuditLogger::default();
        let _ = audit_logger.append_audit_event(
            CrewRole::CrewMedicalOfficer,
            "INITIALIZE_ARES_MISSION_RUNTIME",
        );

        Ok(Arc::new(Self {
            inner: RwLock::new(MissionRuntimeInner {
                replayer,
                sqi_filter,
                adhg_engine,
                scenario,
                mission_elapsed_s: 0.0,
                latest_packet,
            }),
            tx,
            audit_logger,
        }))
    }

    /// Avanza di un tick (`dt_s = 0.05` s a 20 Hz) e trasmette il pacchetto JSON sul canale broadcast.
    pub fn advance_tick(&self, dt_s: f64) -> Option<TelemetryPacket> {
        let mut guard = self.inner.write().ok()?;
        guard.mission_elapsed_s += dt_s;
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
        guard.latest_packet = packet.clone();
        if let Ok(json_str) = serde_json::to_string(&packet) {
            let _ = self.tx.send(json_str);
        }
        Some(packet)
    }

    /// Applica un nuovo scenario What-If in < 1 ms, aggiorna l'audit log SHA-256 e trasmette il pacchetto.
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
        guard.latest_packet = packet.clone();
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
        if let Ok(json_str) = serde_json::to_string(&packet) {
            let _ = self.tx.send(json_str);
        }
        Some(packet)
    }

    /// Legge una copia dell'ultimo `TelemetryPacket` calcolato.
    pub fn latest_snapshot(&self) -> Option<TelemetryPacket> {
        self.inner.read().ok().map(|g| g.latest_packet.clone())
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
}
