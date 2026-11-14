//! Phase 14 acceptance: JSON-RPC 2.0 conformance and the `< 150 token`
//! Context-Mode budget on every tool answer, in every clinical state.

#![allow(clippy::panic)]

use ares_medops_playbooks::ClinicalState;
use ares_medops_playbooks::state::{Jugular, Lbnp, Musculoskeletal, Vitals};
use ares_server_cli::mcp_stdio::{
    MAX_RESULT_BYTES, PROTOCOL_VERSION, TOKEN_BUDGET, handle_request,
};
use ares_server_cli::mission::{MissionState, StressTestRequest};
use serde_json::{Value, json};

/// A named clinical regime and the mission state that reproduces it.
type Regime = (&'static str, fn() -> MissionState);

/// Bytes per token used to turn the token budget into a byte budget.
const BYTES_PER_TOKEN: usize = 4;

fn mission() -> MissionState {
    MissionState::new("ASTRO-01", "SIM-TEST").unwrap_or_else(|e| panic!("engine builds: {e}"))
}

fn request(mission: &mut MissionState, method: &str, params: Value) -> Value {
    let line = json!({"jsonrpc": "2.0", "id": 7, "method": method, "params": params}).to_string();
    let raw = handle_request(mission, &line).unwrap_or_else(|| panic!("{method} must answer"));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("{method} must return JSON: {e}"))
}

fn call(mission: &mut MissionState, name: &str, arguments: Value) -> Value {
    request(
        mission,
        "tools/call",
        json!({"name": name, "arguments": arguments}),
    )
}

fn result_text(response: &Value) -> String {
    response["result"]["content"][0]["text"]
        .as_str()
        .unwrap_or_else(|| panic!("tool result must carry text content: {response}"))
        .to_string()
}

/// Every gate fires: no POCUS confirmation, LBNP session with tachycardia,
/// post-landing gait asymmetry over 12 percent.
fn all_gates_firing() -> ClinicalState {
    ClinicalState {
        vitals: Vitals {
            heart_rate_bpm: Some(132.0),
            spo2_percent: Some(95.0),
            respiration_rate_brpm: Some(22.0),
        },
        jugular: Jugular {
            ijv_csa_cm2: Some(2.4),
            ijv_velocity_max_cm_s: Some(2.1),
            wall_shear_stress_dyn_cm2: Some(1.3),
            pocus_thrombus_confirmed: None,
        },
        lbnp: Lbnp {
            active: true,
            chamber_pressure_mmhg: Some(-30.0),
            baseline_systolic_bp_mmhg: Some(120.0),
            current_systolic_bp_mmhg: Some(96.0),
        },
        musculoskeletal: Musculoskeletal {
            gait_asymmetry_index_pct: Some(19.4),
            soleus_volume_loss_pct: Some(7.5),
            bmd_loss_pct_per_month: Some(1.8),
            post_landing: true,
        },
        ..ClinicalState::default()
    }
}

fn with_state(state: ClinicalState) -> MissionState {
    let mut mission = mission();
    mission
        .apply_stress_test(&StressTestRequest {
            clinical_state: Some(state),
            ..StressTestRequest::default()
        })
        .unwrap_or_else(|e| panic!("state accepted: {e:?}"));
    mission
}

/// The core phase 14 invariant, over the three clinical regimes.
#[test]
fn every_tool_answer_fits_the_token_budget() {
    let calls = [
        ("get_astronaut_health_summary", json!({})),
        ("query_organ_robustness", json!({"organ_system": "VENOUS"})),
        (
            "query_organ_robustness",
            json!({"organ_system": "MUSCULOSKELETAL"}),
        ),
        (
            "query_organ_robustness",
            json!({"organ_system": "CARDIOVASCULAR"}),
        ),
        (
            "query_organ_robustness",
            json!({"organ_system": "NEURO_OCULAR"}),
        ),
        (
            "query_organ_robustness",
            json!({"organ_system": "RADIATION"}),
        ),
        (
            "trigger_medops_action_playbook",
            json!({"playbook_id": "PB01"}),
        ),
        (
            "trigger_medops_action_playbook",
            json!({"playbook_id": "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS"}),
        ),
        (
            "trigger_medops_action_playbook",
            json!({"playbook_id": "PB05"}),
        ),
    ];

    let regimes: [Regime; 3] = [
        ("nominal", mission),
        ("all gates firing", || with_state(all_gates_firing())),
        ("all channels missing", || {
            with_state(ClinicalState::default())
        }),
    ];

    assert_eq!(MAX_RESULT_BYTES, TOKEN_BUDGET * BYTES_PER_TOKEN);

    for (regime, build) in regimes {
        for (name, arguments) in &calls {
            let mut mission = build();
            let response = call(&mut mission, name, arguments.clone());
            let text = result_text(&response);

            assert!(
                text.len() <= MAX_RESULT_BYTES,
                "{regime}/{name}: {} bytes exceeds the {MAX_RESULT_BYTES} B budget: {text}",
                text.len()
            );
            let payload: Value = serde_json::from_str(&text)
                .unwrap_or_else(|e| panic!("{regime}/{name} text must be JSON: {e}"));
            assert!(
                payload.get("prov").is_some(),
                "{regime}/{name} must state its provenance: {text}"
            );
            assert_eq!(response["jsonrpc"], "2.0");
            assert_eq!(response["id"], 7);
            assert_eq!(response["result"]["isError"], false);
        }
    }
}

#[test]
fn health_summary_reports_gates_and_missing_channels() {
    let mut mission = with_state(all_gates_firing());
    let text = result_text(&call(
        &mut mission,
        "get_astronaut_health_summary",
        json!({}),
    ));
    let payload: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("json: {e}"));

    assert_eq!(payload["alarm_level"], "CRITICAL");
    assert_eq!(payload["gates"]["anticoagulation_locked"], true);
    assert_eq!(payload["gates"]["lbnp_autosafe_vent"], true);
    assert_eq!(payload["gates"]["gait_suit_damping_pct"], 25.0);
    // Never invented: the MRI needs ares-nqs-stl.
    assert_eq!(payload["mission_readiness_index"], Value::Null);
    assert_eq!(payload["mri_source"], "PENDING_ARES_NQS_STL");
    // PPG is not modelled by the scenario generator and must be declared.
    let missing = payload["missing_channels"].to_string();
    assert!(missing.contains("pulse_rate_bpm"), "{missing}");
}

#[test]
fn degraded_data_is_declared_not_filled_in() {
    let mut mission = with_state(ClinicalState::default());
    let text = result_text(&call(
        &mut mission,
        "get_astronaut_health_summary",
        json!({}),
    ));
    let payload: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("json: {e}"));

    assert_eq!(payload["alarm_level"], "DATA_DEGRADED_MISSING_CHANNELS");
    // Gate 1 stays locked when POCUS never confirmed anything.
    assert_eq!(payload["gates"]["anticoagulation_locked"], true);
}

#[test]
fn organ_robustness_leaves_unverifiable_boundaries_null() {
    let mut mission = with_state(ClinicalState::default());
    let text = result_text(&call(
        &mut mission,
        "query_organ_robustness",
        json!({"organ_system": "VENOUS"}),
    ));
    let payload: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("json: {e}"));

    assert_eq!(payload["rho"], Value::Null);
    assert_eq!(payload["rho_source"], "PENDING_ARES_NQS_STL");
    for entry in payload["margins"]
        .as_array()
        .unwrap_or_else(|| panic!("margins array: {text}"))
    {
        assert_eq!(entry["v"], Value::Null, "{entry}");
        assert_eq!(
            entry["ok"],
            Value::Null,
            "missing channel is not 'ok': {entry}"
        );
    }
}

#[test]
fn triggering_a_playbook_returns_the_gated_first_step() {
    let mut mission = with_state(all_gates_firing());
    let text = result_text(&call(
        &mut mission,
        "trigger_medops_action_playbook",
        json!({"playbook_id": "PB02"}),
    ));
    let payload: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("json: {e}"));

    assert_eq!(payload["playbook"], "PB02");
    assert_eq!(payload["step"], 1);
    assert!(payload["of"].as_u64().unwrap_or(0) >= 1, "{text}");
    assert!(!payload["do"].as_str().unwrap_or("").is_empty(), "{text}");
    // Gate 1 strips the anticoagulant from playbook #02 without POCUS proof.
    assert_eq!(payload["gates"]["anticoagulation_locked"], true);
    assert!(
        !payload["removed"]
            .as_array()
            .unwrap_or(&Vec::new())
            .is_empty(),
        "gate 1 must report the actions it removed: {text}"
    );
    assert_eq!(payload["prov"], "DERIVED_COMPUTED");
}

#[test]
fn initialize_negotiates_the_protocol_version() {
    let mut mission = mission();
    let supported = request(
        &mut mission,
        "initialize",
        json!({"protocolVersion": "2024-11-05"}),
    );
    assert_eq!(supported["result"]["protocolVersion"], "2024-11-05");

    let unknown = request(
        &mut mission,
        "initialize",
        json!({"protocolVersion": "1999-01-01"}),
    );
    assert_eq!(unknown["result"]["protocolVersion"], PROTOCOL_VERSION);
    assert_eq!(
        unknown["result"]["capabilities"]["tools"]["listChanged"],
        false
    );
}

#[test]
fn tools_list_exposes_the_three_macro_tools() {
    let mut mission = mission();
    let response = request(&mut mission, "tools/list", Value::Null);
    let tools = response["result"]["tools"]
        .as_array()
        .unwrap_or_else(|| panic!("tools array: {response}"));
    let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
    assert_eq!(
        names,
        vec![
            "get_astronaut_health_summary",
            "query_organ_robustness",
            "trigger_medops_action_playbook"
        ]
    );
    for tool in tools {
        assert_eq!(tool["inputSchema"]["type"], "object", "{tool}");
    }
}

#[test]
fn notifications_stay_silent() {
    let mut mission = mission();
    let line = json!({"jsonrpc": "2.0", "method": "notifications/initialized"}).to_string();
    assert_eq!(handle_request(&mut mission, &line), None);
}

#[test]
fn protocol_errors_use_the_json_rpc_codes() {
    let mut mission = mission();

    let malformed = handle_request(&mut mission, "{not json")
        .unwrap_or_else(|| panic!("parse errors must answer"));
    let malformed: Value = serde_json::from_str(&malformed).unwrap_or_else(|e| panic!("json: {e}"));
    assert_eq!(malformed["error"]["code"], -32700);
    assert_eq!(malformed["id"], Value::Null);

    let unknown_method = request(&mut mission, "resources/list", Value::Null);
    assert_eq!(unknown_method["error"]["code"], -32601);

    let unknown_tool = call(&mut mission, "get_everything", json!({}));
    assert_eq!(unknown_tool["error"]["code"], -32602);

    let bad_organ = call(
        &mut mission,
        "query_organ_robustness",
        json!({"organ_system": "SPLEEN"}),
    );
    assert_eq!(bad_organ["error"]["code"], -32602);

    let missing_arg = call(&mut mission, "query_organ_robustness", json!({}));
    assert_eq!(missing_arg["error"]["code"], -32602);

    let bad_playbook = call(
        &mut mission,
        "trigger_medops_action_playbook",
        json!({"playbook_id": "PB42"}),
    );
    assert_eq!(bad_playbook["error"]["code"], -32602);

    let wrong_crew = call(
        &mut mission,
        "get_astronaut_health_summary",
        json!({"astronaut_id": "ASTRO-04"}),
    );
    assert_eq!(wrong_crew["error"]["code"], -32602);

    let ping = request(&mut mission, "ping", Value::Null);
    assert_eq!(ping["result"], json!({}));
}

/// Phase 14 latency target: `< 500 us` per MCP answer. Averaged over many calls
/// so a scheduler hiccup on a loaded box cannot flip the result.
#[test]
fn tool_answers_stay_inside_the_latency_budget() {
    const ITERATIONS: u32 = 1000;
    const BUDGET_US: u128 = 500;

    let mut mission = with_state(all_gates_firing());
    let line = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "get_astronaut_health_summary", "arguments": {}}
    })
    .to_string();

    let started = std::time::Instant::now();
    for _ in 0..ITERATIONS {
        let answer = handle_request(&mut mission, &line);
        assert!(answer.is_some());
    }
    let mean_us = started.elapsed().as_micros() / u128::from(ITERATIONS);
    println!("mean MCP answer latency: {mean_us} us");
    assert!(mean_us < BUDGET_US, "{mean_us} us exceeds {BUDGET_US} us");
}
