//! Phase 13 acceptance for the HTTP surface: the contract-shaped packet, the
//! `< 1 ms` What-If Stress-Test Console recompute, input validation at the trust
//! boundary and the `[EXECUTE STEP]` state machine.

#![allow(clippy::panic)]

use std::sync::Arc;

use ares_medops_playbooks::ClinicalState;
use ares_medops_playbooks::state::{Lbnp, Vitals};
use ares_server_cli::mission::MissionState;
use ares_server_cli::telemetry::UI_REFRESH_RATE_HZ;
use ares_server_cli::ws_server::{AppState, TICK, router};
use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tokio::sync::RwLock;
use tower::ServiceExt;

/// Phase 13 budget for `POST /api/stress-test`.
const STRESS_TEST_BUDGET_US: u64 = 1000;

fn app() -> Router {
    let mission =
        MissionState::new("ASTRO-01", "SIM-TEST").unwrap_or_else(|e| panic!("engine builds: {e}"));
    router(AppState::new(Arc::new(RwLock::new(mission))))
}

async fn send(app: &Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let builder = Request::builder().method(method).uri(uri);
    let request = match body {
        Some(payload) => builder
            .header("content-type", "application/json")
            .body(Body::from(payload.to_string())),
        None => builder.body(Body::empty()),
    }
    .unwrap_or_else(|e| panic!("request builds: {e}"));

    let response = app
        .clone()
        .oneshot(request)
        .await
        .unwrap_or_else(|e| panic!("router answers: {e}"));
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .unwrap_or_else(|e| panic!("body collects: {e}"))
        .to_bytes();
    // Handler errors are JSON; axum's own extractor rejections are plain text.
    let value = match (bytes.is_empty(), serde_json::from_slice(&bytes)) {
        (true, _) => Value::Null,
        (_, Ok(value)) => value,
        (_, Err(_)) => Value::String(String::from_utf8_lossy(&bytes).into_owned()),
    };
    (status, value)
}

#[test]
fn tick_period_matches_ui_rate() {
    let expected = (1000.0 / UI_REFRESH_RATE_HZ).round() as u128;
    assert_eq!(TICK.as_millis(), expected);
}

#[tokio::test]
async fn health_reports_the_stream_rate() {
    let (status, body) = send(&app(), "GET", "/api/health", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "OK");
    assert_eq!(body["ui_refresh_rate_hz"], UI_REFRESH_RATE_HZ);
}

#[tokio::test]
async fn snapshot_carries_every_field_the_contract_requires() {
    let (status, packet) = send(&app(), "GET", "/api/telemetry", None).await;
    assert_eq!(status, StatusCode::OK);

    for field in [
        "timestamp_ms",
        "relative_recording_time_s",
        "source_record_id",
        "astronaut_id",
        "provenance_manifest",
        "biometrics",
        "safety_margins",
    ] {
        assert!(packet.get(field).is_some(), "missing {field}: {packet}");
    }
    for field in [
        "heart_rate_bpm",
        "pulse_rate_bpm",
        "respiration_rate_brpm",
        "spo2_percent",
    ] {
        assert!(
            packet["biometrics"].get(field).is_some(),
            "missing biometrics.{field}"
        );
    }

    assert_eq!(
        packet["provenance_manifest"]["biometrics_source"],
        "SIMULATED_SCENARIO_INPUT"
    );
    assert_eq!(
        packet["provenance_manifest"]["ui_refresh_rate_hz"],
        UI_REFRESH_RATE_HZ
    );
    assert_eq!(packet["safety_margins"]["alarm_level"], "NOMINAL");
    // Never fabricated: these three need ares-nqs-stl.
    assert_eq!(
        packet["safety_margins"]["med_stl_rho_robustness"],
        Value::Null
    );
    assert_eq!(
        packet["safety_margins"]["time_to_violation_days"],
        Value::Null
    );
    assert_eq!(
        packet["safety_margins"]["mission_readiness_index"],
        Value::Null
    );
    assert_eq!(packet["active_playbook"], Value::Null);
}

#[tokio::test]
async fn stress_test_recomputes_under_one_millisecond() {
    let app = app();
    let (status, body) = send(
        &app,
        "POST",
        "/api/stress-test",
        Some(json!({"cabin_ppco2_mmhg": 5.2, "mission_elapsed_days": 184.0})),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let latency = body["recompute_latency_us"]
        .as_u64()
        .unwrap_or_else(|| panic!("latency reported: {body}"));
    assert!(
        latency < STRESS_TEST_BUDGET_US,
        "{latency} us exceeds the {STRESS_TEST_BUDGET_US} us budget"
    );

    let packet = &body["packet"];
    assert_eq!(packet["environment"]["cabin_ppco2_mmhg"], 5.2);
    assert_eq!(packet["mission_elapsed_days"], 184.0);
    // cabin_co2_ppm is derived from ppCO2 at 1 atm: 5.2 / 760 * 1e6.
    let ppm = packet["environment"]["cabin_co2_ppm"]
        .as_f64()
        .unwrap_or_else(|| panic!("derived ppm: {packet}"));
    assert!((ppm - 6842.1).abs() < 0.5, "{ppm}");
}

#[tokio::test]
async fn lbnp_slider_arms_gate_two_and_escalates_the_alarm() {
    let app = app();
    let tachycardic = ClinicalState {
        vitals: Vitals {
            heart_rate_bpm: Some(128.0),
            spo2_percent: Some(97.0),
            respiration_rate_brpm: Some(18.0),
        },
        lbnp: Lbnp {
            active: true,
            chamber_pressure_mmhg: Some(-30.0),
            baseline_systolic_bp_mmhg: Some(118.0),
            current_systolic_bp_mmhg: Some(112.0),
        },
        ..ClinicalState::default()
    };

    let (status, body) = send(
        &app,
        "POST",
        "/api/stress-test",
        Some(json!({"clinical_state": tachycardic, "lbnp_pressure_mmhg": -30.0})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let packet = &body["packet"];
    assert_eq!(packet["safety_margins"]["alarm_level"], "CRITICAL");
    assert_eq!(packet["medops"]["gates"]["lbnp_autosafe_vent"], true);
    let actions = packet["medops"]["priority_actions"].to_string();
    assert!(
        actions.contains("AUTO_VENT_LBNP_CHAMBER_0_MMHG"),
        "gate 2 must command the vent: {actions}"
    );
}

#[tokio::test]
async fn out_of_range_slider_is_rejected_and_changes_nothing() {
    let app = app();
    let (status, body) = send(
        &app,
        "POST",
        "/api/stress-test",
        Some(json!({"cabin_ppco2_mmhg": 99.0})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["field"], "cabin_ppco2_mmhg");

    let (_, packet) = send(&app, "GET", "/api/telemetry", None).await;
    assert_eq!(packet["environment"]["cabin_ppco2_mmhg"], 2.3);
}

#[tokio::test]
async fn unknown_slider_field_is_rejected() {
    let (status, _) = send(
        &app(),
        "POST",
        "/api/stress-test",
        Some(json!({"cabin_ppco2_ppm": 3000.0})),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn playbook_activation_then_steps_advance_in_dag_order() {
    let app = app();
    let (status, view) = send(
        &app,
        "POST",
        "/api/playbook/activate",
        Some(json!({"playbook_id": "PLAYBOOK_01_VENOUS_STASIS_LBNP"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(view["playbook_id"], "PLAYBOOK_01_VENOUS_STASIS_LBNP");
    assert_eq!(view["current_step"], 1);
    assert_eq!(view["total_steps"], 5);

    // The frame now carries the active run for the cockpit.
    let (_, packet) = send(&app, "GET", "/api/telemetry", None).await;
    assert_eq!(packet["active_playbook"]["current_step"], 1);

    let (status, view) = send(
        &app,
        "POST",
        "/api/playbook/execute-step",
        Some(json!({"playbook_id": "PLAYBOOK_01_VENOUS_STASIS_LBNP", "step_id": 1})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(view["current_step"], 2);

    // Steps may not be skipped.
    let (status, body) = send(
        &app,
        "POST",
        "/api/playbook/execute-step",
        Some(json!({"playbook_id": "PLAYBOOK_01_VENOUS_STASIS_LBNP", "step_id": 5})),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("expected step 2"),
        "{body}"
    );

    // A step for a playbook that is not the active one is refused.
    let (status, _) = send(
        &app,
        "POST",
        "/api/playbook/execute-step",
        Some(json!({"playbook_id": "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED", "step_id": 1})),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn execute_step_without_an_active_playbook_is_refused() {
    let (status, body) = send(
        &app(),
        "POST",
        "/api/playbook/execute-step",
        Some(json!({"playbook_id": "PLAYBOOK_01_VENOUS_STASIS_LBNP", "step_id": 1})),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["message"], "no active playbook");
}

/// The HTTP API speaks the contract codes only. The short `PB0x` tags exist for
/// the MCP token budget and are not accepted here.
#[tokio::test]
async fn http_api_requires_the_contract_playbook_code() {
    let (status, _) = send(
        &app(),
        "POST",
        "/api/playbook/activate",
        Some(json!({"playbook_id": "PB01"})),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}
