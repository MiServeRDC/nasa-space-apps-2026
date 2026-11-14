//! Fase 13 (G1): Server HTTP/WebSocket Axum a 20 Hz su `127.0.0.1:8080` e API `/api/stress-test`.

use ares_causal_graph::adhg_graph::AdhgCausalEngine;
use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state;
use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
use ares_core_types::security::{CrewRole, MedOpsAuditLogger};
use ares_core_types::telemetry::{
    Biometrics, BiometricsSource, ProvenanceManifest, ScenarioOverlayMode, StressTestScenarioInput,
    SystemPhase, TelemetryPacket,
};
use ares_medops_playbooks::playbooks::select_candidate_playbook;
use ares_medops_playbooks::safety_gates::enforce_hard_clinical_safety_gates;
use ares_nqs_stl::mri_index::evaluate_nqs_stl_and_mri;
use ares_security_privacy::audit_chain::Sha256AuditLogger;
use ares_telemetry_ingest::bidmc_replayer::{BidmcNumericRow, BidmcReplayer, IngestError};
use ares_telemetry_ingest::scenario_overlay::biometrics_with_signal_quality;
use ares_telemetry_ingest::sqi_filter::SqiFilter;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::Duration;
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
fn compute_mission_telemetry_tick(
    row: &BidmcNumericRow,
    biometrics: Biometrics,
    adhg_engine: &mut AdhgCausalEngine,
    scenario: &StressTestScenarioInput,
    mission_elapsed_s: f64,
) -> TelemetryPacket {
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

    let system_phase = if nqs_stl.rho_global < 0.0 || jugular.pocus_thrombus_confirmed {
        SystemPhase::Act
    } else {
        SystemPhase::Evaluate
    };

    TelemetryPacket {
        timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
        mission_Elapsed_seconds: mission_elapsed_s,
        relative_recording_time_s: row.relative_time_s,
        source_record_id: row.record_id.clone(),
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
    replay_elapsed: Duration,
    signal_quality: (f64, Option<f64>),
    pub latest_packet: TelemetryPacket,
}

impl MissionRuntimeInner {
    fn sample_index(&self) -> usize {
        (self.replay_elapsed.as_secs() % self.replayer.len() as u64) as usize
    }

    fn compute_packet(&mut self) -> TelemetryPacket {
        let row = self.replayer.row_at_second(self.sample_index());
        let biometrics = biometrics_with_signal_quality(row, &self.scenario, self.signal_quality);
        compute_mission_telemetry_tick(
            row,
            biometrics,
            &mut self.adhg_engine,
            &self.scenario,
            self.replay_elapsed.as_secs_f64(),
        )
    }
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
        let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path)?;
        let mut sqi_filter = SqiFilter::default();
        let first_row = replayer.row_at_second(0);
        let signal_quality = sqi_filter.evaluate_row(first_row);
        let mut adhg_engine = AdhgCausalEngine::new();
        let scenario = default_scenario_input();
        let latest_packet = compute_mission_telemetry_tick(
            first_row,
            biometrics_with_signal_quality(first_row, &scenario, signal_quality),
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
                replay_elapsed: Duration::ZERO,
                signal_quality,
                latest_packet,
            }),
            tx,
            audit_logger,
        }))
    }

    /// Advance the replay clock and publish a frame. Only native samples enter the SQI filter.
    pub fn advance_tick(&self, dt: Duration) -> Option<TelemetryPacket> {
        let mut guard = self.inner.write().ok()?;
        let previous_second = guard.replay_elapsed.as_secs();
        guard.replay_elapsed = guard.replay_elapsed.checked_add(dt)?;
        let current_second = guard.replay_elapsed.as_secs();
        let MissionRuntimeInner {
            replayer,
            sqi_filter,
            signal_quality,
            ..
        } = &mut *guard;
        let record_len = replayer.len() as u64;
        for second in (previous_second..current_second).map(|second| second + 1) {
            let index = (second % record_len) as usize;
            if index == 0 {
                *sqi_filter = SqiFilter::default();
            }
            *signal_quality = sqi_filter.evaluate_row(replayer.row_at_second(index));
        }
        let packet = guard.compute_packet();
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
        let packet = guard.compute_packet();
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
        let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path).expect("load bidmc_01");
        let mut sqi_filter = SqiFilter::default();
        let mut adhg_engine = AdhgCausalEngine::new();
        let scenario = default_scenario_input();

        let row = replayer.row_at_second(0);
        let quality = sqi_filter.evaluate_row(row);

        // Warm-up tick
        let _ = compute_mission_telemetry_tick(
            row,
            biometrics_with_signal_quality(row, &scenario, quality),
            &mut adhg_engine,
            &scenario,
            0.0,
        );

        let iterations = 50_u32;
        let start = Instant::now();
        let mut last_pkt = None;
        for i in 1..=iterations {
            last_pkt = Some(compute_mission_telemetry_tick(
                row,
                biometrics_with_signal_quality(row, &scenario, quality),
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
            let (sqi, _) = expected_sqi.evaluate_row(row);
            for offset in 0..20 {
                let packet = if second == 0 && offset == 0 {
                    state.latest_snapshot().expect("initial frame")
                } else {
                    state.advance_tick(frame).expect("tick");
                    serde_json::from_str::<TelemetryPacket>(&stream.try_recv().expect("broadcast"))
                        .expect("packet JSON")
                };
                assert_eq!(packet.relative_recording_time_s, second as f64);
                assert_eq!(packet.source_record_id, row.record_id);
                assert_eq!(packet.biometrics.pulse_rate_bpm, row.pulse_bpm);
                assert_eq!(packet.biometrics.spo2_pct, row.spo2_pct);
                assert_eq!(packet.biometrics.missing_channels, row.missing_channels);
                assert!((packet.biometrics.sqi_score - sqi).abs() < 1e-12);
                assert_eq!(packet.provenance_manifest.biometrics_native_rate_hz, 1.0);
                assert_eq!(packet.provenance_manifest.ui_refresh_rate_hz, 20.0);
                if second == 1 && offset == 7 {
                    let _extra_client = state.tx.subscribe();
                    let mut scenario = default_scenario_input();
                    scenario.flight_day += 1;
                    let updated = state.apply_stress_test(scenario).expect("What-If");
                    assert_eq!(updated.relative_recording_time_s, 1.0);
                    assert_eq!(
                        updated.mission_Elapsed_seconds,
                        packet.mission_Elapsed_seconds
                    );
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
        let (first_sqi, _) = SqiFilter::default().evaluate_row(replay.row_at_second(0));
        assert_eq!(wrapped.biometrics.sqi_score, first_sqi);
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
}
