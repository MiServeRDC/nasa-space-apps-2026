//! Integration tests for `ares-server-cli`:
//! 1. Verifies all 8 FastMCP Context-Mode tools (< 150 tokens / <= 600 bytes valid JSON).
//! 2. Verifies that the generated physical knowledge graph files exist on disk in
//!    `data/knowledge_graph/` and `graphify-out/` and contain all 24 cataloged datasets.

use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use ares_server_cli::fastmcp_router::{JsonRpcRequest, handle_fastmcp_jsonrpc_request};
use ares_server_cli::ws_server::SharedMissionState;
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

#[test]
fn test_integration_fastmcp_8_tools_budget_and_provenance() {
    let bidmc_dir = repo_root().join("data").join("bidmc");
    let state = SharedMissionState::from_data_dir(&bidmc_dir).expect("load bidmc state");
    let ctx = state.fastmcp_context().expect("fastmcp context");
    let sanitizer = StrictMcpSanitizer;

    let cases = [
        ("get_crew_health_summary", json!({})),
        ("explain_causal_anomaly", json!({})),
        ("simulate_countermeasure_impact", json!({})),
        ("get_medops_playbook", json!({})),
        ("query_dataset_graph", json!({ "query": "OSD-818" })),
        (
            "explain_biomarker_path",
            json!({ "from": "CSA CANS", "to": "pheno_sans_papilledema" }),
        ),
        ("get_timestral_quantile_cones", json!({})),
        ("get_hypergraph_spatial_status", json!({})),
    ];

    for (tool, args) in cases {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(1)),
            method: "tools/call".to_string(),
            params: json!({ "name": tool, "arguments": args }),
        };
        let resp = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
        assert!(resp.error.is_none(), "Tool {tool} returned error: {:?}", resp.error);
        let text = resp.result.expect("result")["content"][0]["text"]
            .as_str()
            .expect("text payload")
            .to_string();
        assert!(
            text.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
            "Tool {tool} exceeded 600-byte (<150 token) cap: {} bytes",
            text.len()
        );
        let parsed: Value = serde_json::from_str(&text).expect("valid JSON");
        assert!(parsed.is_object(), "Tool {tool} must return JSON object");
    }
}

#[test]
fn test_integration_physical_knowledge_graph_files_exist_with_all_24_datasets() {
    let root = repo_root();
    let files = [
        root.join("data")
            .join("knowledge_graph")
            .join("ares_dataset_graph.json"),
        root.join("data")
            .join("knowledge_graph")
            .join("GRAPH_REPORT.md"),
        root.join("graphify-out").join("graph.json"),
        root.join("graphify-out").join("GRAPH_REPORT.md"),
    ];

    for path in &files {
        assert!(
            path.is_file(),
            "Expected generated knowledge graph artifact missing: {}",
            path.display()
        );
        let meta = fs::metadata(path).expect("metadata");
        assert!(meta.len() > 0, "Empty artifact: {}", path.display());
    }

    for json_path in [&files[0], &files[2]] {
        let raw = fs::read_to_string(json_path).expect("read graph json");
        let doc: Value = serde_json::from_str(&raw).expect("parse graph json");
        assert_eq!(doc["graph"]["name"], "ARES-DatasetGraph");
        assert_eq!(doc["graph"]["total_datasets"], "24");

        let nodes = doc["nodes"].as_array().expect("nodes array");
        let dataset_nodes: Vec<&Value> = nodes
            .iter()
            .filter(|n| n["category"] == "Dataset")
            .collect();
        assert_eq!(
            dataset_nodes.len(),
            24,
            "Expected all 24 Dataset nodes in {}",
            json_path.display()
        );

        let slice_nodes: Vec<&Value> = nodes
            .iter()
            .filter(|n| n["category"] == "TimeWindowSlice")
            .collect();
        assert!(
            slice_nodes.len() >= 27,
            "Expected >= 27 TimeWindowSlice nodes from BIDMC CSVs, got {}",
            slice_nodes.len()
        );

        let links = doc["links"].as_array().expect("links array");
        assert!(!links.is_empty(), "Expected non-empty links");
        assert!(
            !doc["god_nodes"].as_array().expect("god_nodes").is_empty(),
            "Expected non-empty god_nodes"
        );
        assert!(
            !doc["communities"].as_object().expect("communities").is_empty(),
            "Expected non-empty communities"
        );
    }
}


mod contract_unification_tests {
    use ares_core_types::telemetry::{
        AlertSeverity, HrvUnavailableReason, ScenarioOverlayMode, StressTestScenarioInput,
    };
    use ares_server_cli::wire_contract::{StressTestPatchRequest, WireTelemetryPacket};
    use ares_server_cli::ws_server::{SharedMissionState, build_axum_router};
    use serde_json::Value;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};

    fn repo_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    fn read_json_file(path: &Path) -> Value {
        let raw = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
        serde_json::from_str(&raw)
            .unwrap_or_else(|e| panic!("failed to parse JSON {}: {e}", path.display()))
    }

    fn type_matches(val: &Value, expected: &str) -> bool {
        match expected {
            "object" => val.is_object(),
            "array" => val.is_array(),
            "string" => val.is_string(),
            "number" => val.is_number(),
            "integer" => val.as_i64().is_some() || val.as_u64().is_some(),
            "boolean" => val.is_boolean(),
            "null" => val.is_null(),
            _ => true,
        }
    }

    fn validate_against_schema(schema: &Value, instance: &Value, path: &str, errors: &mut Vec<String>) {
        if let Some(type_node) = schema.get("type") {
            let ok = match type_node {
                Value::String(t) => type_matches(instance, t),
                Value::Array(arr) => arr
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|t| type_matches(instance, t)),
                _ => true,
            };
            if !ok {
                errors.push(format!("{path}: type mismatch (expected {type_node}, got {instance})"));
                return;
            }
        }

        if instance.is_null() {
            return;
        }

        if let Some(Value::Array(enum_vals)) = schema.get("enum")
            && !enum_vals.iter().any(|allowed| allowed == instance)
        {
            errors.push(format!("{path}: value {instance} not in enum {enum_vals:?}"));
        }

        if let Some(num) = instance.as_f64() {
            if let Some(min) = schema.get("minimum").and_then(Value::as_f64)
                && num < min - 1e-12
            {
                errors.push(format!("{path}: {num} < minimum {min}"));
            }
            if let Some(max) = schema.get("maximum").and_then(Value::as_f64)
                && num > max + 1e-12
            {
                errors.push(format!("{path}: {num} > maximum {max}"));
            }
        }

        if let Some(obj) = instance.as_object() {
            if let Some(Value::Array(req_fields)) = schema.get("required") {
                for req in req_fields.iter().filter_map(Value::as_str) {
                    if !obj.contains_key(req) {
                        errors.push(format!("{path}: missing required key '{req}'"));
                    }
                }
            }
            if let Some(Value::Object(props)) = schema.get("properties") {
                for (k, prop_schema) in props {
                    if let Some(child_val) = obj.get(k) {
                        let child_path = format!("{path}.{k}");
                        validate_against_schema(prop_schema, child_val, &child_path, errors);
                    }
                }
            }
        }

        if let Some(arr) = instance.as_array()
            && let Some(item_schema) = schema.get("items")
        {
            for (idx, item) in arr.iter().enumerate() {
                let item_path = format!("{path}[{idx}]");
                validate_against_schema(item_schema, item, &item_path, errors);
            }
        }
    }

    fn assert_matches_telemetry_schema(schema: &Value, payload: &Value, label: &str) {
        let mut errors = Vec::new();
        validate_against_schema(schema, payload, "$", &mut errors);
        assert!(
            errors.is_empty(),
            "{label} failed contracts/telemetry_schema.json validation:\n{}",
            errors.join("\n")
        );
    }

    async fn send_http_json(addr: std::net::SocketAddr, request: String) -> Value {
        let mut stream = TcpStream::connect(addr)
            .await
            .unwrap_or_else(|e| panic!("TCP connect to {addr} failed: {e}"));
        stream
            .write_all(request.as_bytes())
            .await
            .unwrap_or_else(|e| panic!("TCP write failed: {e}"));
        let mut raw = Vec::new();
        stream
            .read_to_end(&mut raw)
            .await
            .unwrap_or_else(|e| panic!("TCP read failed: {e}"));
        let text = String::from_utf8(raw)
            .unwrap_or_else(|e| panic!("non-UTF8 HTTP response: {e}"));
        let (head, body) = text
            .split_once("\r\n\r\n")
            .unwrap_or_else(|| panic!("malformed HTTP response: {text}"));
        assert!(
            head.starts_with("HTTP/1.1 200 OK") || head.starts_with("HTTP/1.0 200 OK"),
            "expected HTTP 200 OK, got:\n{head}\nbody={body}"
        );
        serde_json::from_str(body)
            .unwrap_or_else(|e| panic!("invalid JSON body: {e}\nbody={body}"))
    }

    #[test]
    fn contracts_fixtures_parse_and_validate_against_telemetry_schema() {
        let root = repo_root();
        let schema = read_json_file(&root.join("contracts/telemetry_schema.json"));

        for fixture_name in [
            "nominal_frame.json",
            "missing_channel_frame.json",
            "sans_alert_frame.json",
            "telemetry_bidmc_replay.json",
            "telemetry_whatif_overlay.json",
        ] {
            let val = read_json_file(&root.join("contracts/fixtures").join(fixture_name));
            assert_matches_telemetry_schema(&schema, &val, fixture_name);
        }

        let missing = read_json_file(&root.join("contracts/fixtures/missing_channel_frame.json"));
        assert_eq!(
            missing["biometrics"]["hrv_unavailable_reason"],
            "BEAT_INTERVALS_NOT_AVAILABLE"
        );
        assert_eq!(
            missing["safety_margins"]["alarm_level"],
            "DATA_DEGRADED_MISSING_CHANNELS"
        );

        let what_if_raw = read_json_file(&root.join("contracts/fixtures/what_if_request.json"));
        let scenario: StressTestScenarioInput = serde_json::from_value(what_if_raw.clone())
            .unwrap_or_else(|e| panic!("what_if_request.json must parse as StressTestScenarioInput: {e}"));
        let patch: StressTestPatchRequest = serde_json::from_value(what_if_raw)
            .unwrap_or_else(|e| panic!("what_if_request.json must parse as StressTestPatchRequest: {e}"));
        assert_eq!(scenario.source_record_id, "bidmc_01");
        assert_eq!(patch.flight_day, Some(scenario.flight_day));
    }

    #[tokio::test]
    async fn live_http_routes_emit_schema_valid_packets_preserve_1hz_cursor_and_flag_missing_rr() {
        let root = repo_root();
        let schema = read_json_file(&root.join("contracts/telemetry_schema.json"));
        let what_if_body = fs::read_to_string(root.join("contracts/fixtures/what_if_request.json"))
            .unwrap_or_else(|e| panic!("failed reading what_if_request.json: {e}"));

        let state = SharedMissionState::from_data_dir(&root.join("data/bidmc"))
            .unwrap_or_else(|e| panic!("SharedMissionState init failed: {e}"));

        // Advance exactly 25 frames (1.25s): relative_recording_time_s must now sit at 1.0 s.
        for _ in 0..25 {
            let _ = state.advance_tick(Duration::from_millis(50));
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .unwrap_or_else(|e| panic!("bind failed: {e}"));
        let addr = listener
            .local_addr()
            .unwrap_or_else(|e| panic!("local_addr failed: {e}"));
        let router = build_axum_router(state.clone());
        let server_handle = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let snapshot_val = send_http_json(
            addr,
            format!("GET /api/snapshot HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n"),
        )
        .await;
        assert_matches_telemetry_schema(&schema, &snapshot_val, "GET /api/snapshot");

        let snapshot_wire: WireTelemetryPacket = serde_json::from_value(snapshot_val)
            .unwrap_or_else(|e| panic!("snapshot JSON must deserialize into WireTelemetryPacket: {e}"));
        assert_eq!(snapshot_wire.relative_recording_time_s, 1.0);
        assert_eq!(
            snapshot_wire.provenance_manifest.scenario_overlay_mode,
            ScenarioOverlayMode::NonePureReplay
        );
        assert!(snapshot_wire.hemodynamics.is_none());
        assert!(snapshot_wire.musculoskeletal.is_none());
        assert!(snapshot_wire.environment.is_none());
        assert_eq!(snapshot_wire.biometrics.rmssd_ms, None);
        assert_eq!(snapshot_wire.biometrics.hrv_rmssd_ms, None);
        assert_eq!(
            snapshot_wire.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        );
        assert!(
            snapshot_wire
                .biometrics
                .quality_flags
                .iter()
                .any(|f| f == "BEAT_INTERVALS_NOT_AVAILABLE")
        );
        assert_eq!(
            snapshot_wire.alert_severity,
            AlertSeverity::DataDegradedMissingChannels
        );
        assert!(!snapshot_wire.nqs_stl_status.hrv_available);
        assert!(snapshot_wire.timestral_quantiles.is_object());
        assert!(snapshot_wire.hypergraph_spatial.is_object());

        let post_req = format!(
            "POST /api/stress-test HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            what_if_body.len(),
            what_if_body
        );
        let updated_val = send_http_json(addr, post_req).await;
        assert_matches_telemetry_schema(&schema, &updated_val, "POST /api/stress-test");

        let updated_wire: WireTelemetryPacket = serde_json::from_value(updated_val)
            .unwrap_or_else(|e| panic!("stress-test JSON must deserialize into WireTelemetryPacket: {e}"));
        // 1 Hz cursor invariance: POST /api/stress-test must NOT advance BIDMC replay past 1.0 s.
        assert_eq!(updated_wire.relative_recording_time_s, 1.0);
        assert_eq!(
            updated_wire.provenance_manifest.scenario_overlay_mode,
            ScenarioOverlayMode::SimulatedWhatifScenario
        );
        assert!(updated_wire.hemodynamics.is_some());
        assert!(updated_wire.musculoskeletal.is_some());
        assert!(updated_wire.environment.is_some());
        assert_eq!(
            updated_wire.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        );

        server_handle.abort();
    }
}
