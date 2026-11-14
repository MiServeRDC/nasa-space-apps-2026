//! Fase 14 (G2): Server Nativo FastMCP JSON-RPC 2.0 su `stdio` con compressione Context-Mode (< 150 token).

pub use crate::fastmcp_router::{JsonRpcRequest, JsonRpcResponse, handle_fastmcp_jsonrpc_request};
use crate::ws_server::{FastMcpRuntimeContext, SharedMissionState};
use ares_causal_graph::adhg_graph::AdhgNodeKind;
use ares_causal_graph::biokg_reasoner::ground_adhg_node_o1;
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_causal_graph::hypergraph_spatial::{
    AnatomicalRegionSubgraph, AnatomicalRiskInputs, HabitatEnvironmentState,
    HabitatZoneDeonticPolicy, HabitatZoneId,
};
use ares_core_types::NqsQuantileForecastSnapshot;
use ares_core_types::security::McpInputSanitizer;
use ares_core_types::anomaly::VitalsAnomalyReport;
use ares_core_types::telemetry::TelemetryPacket;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::sync::Arc;

/// Gestisce una richiesta JSON-RPC 2.0 in modalita Context-Mode (< 150 token / <= 600 byte)
/// usando un singolo `TelemetryPacket` e il grafo canonico dei 24 dataset.
pub fn handle_mcp_jsonrpc_request<S: McpInputSanitizer>(
    req: &JsonRpcRequest,
    latest_packet: &TelemetryPacket,
    sanitizer: &S,
) -> JsonRpcResponse {
    let mut sub = AnatomicalRegionSubgraph::new();
    let heatmap = sub.compute_body_heatmap(&AnatomicalRiskInputs {
        sans_index: Some(latest_packet.sans_ocular.sans_risk_index),
        tau_w_dyn_cm2: Some(latest_packet.jugular_hemodynamics.tau_w_dyn_cm2),
        rmssd_ms: latest_packet.biometrics.rmssd_ms,
        sost_pmol_l: Some(latest_packet.musculoskeletal.sclerostin_pmol_l),
        mqi_deficit_fraction: Some((1.0 - latest_packet.musculoskeletal.mqi_index).clamp(0.0, 1.0)),
        gai_pct: Some(latest_packet.musculoskeletal.gai_pct),
    });
    let policy = HabitatZoneDeonticPolicy::default();
    let habitat_assessment = policy.evaluate(&HabitatEnvironmentState {
        current_zone: HabitatZoneId::SleepQuarters,
        radiation_dose_rate_msv_d: latest_packet.biometrics.radiation_dose_rate_msv_d,
        gai_pct: latest_packet.musculoskeletal.gai_pct,
        pocus_thrombus_confirmed: latest_packet.jugular_hemodynamics.pocus_thrombus_confirmed,
        lbnp_dwell_s: 0.0,
        sleep_quarters_noise_dba: 44.0,
    });
    let quantile_snapshot = Arc::new(NqsQuantileForecastSnapshot::initial_deterministic(
        latest_packet.relative_recording_time_s,
        latest_packet.nqs_stl.rho_global,
        latest_packet.nqs_stl.ttv_hours,
        latest_packet.nqs_stl.ttv_ci95_low_hours,
        latest_packet.nqs_stl.ttv_ci95_high_hours,
    ));
    let ctx = FastMcpRuntimeContext {
        latest_packet: latest_packet.clone(),
        quantile_snapshot,
        vitals_anomaly: VitalsAnomalyReport::default(),
        heatmap,
        habitat_assessment,
        grounding: *ground_adhg_node_o1(AdhgNodeKind::AredMechanicalLoad),
        dataset_graph: Arc::new(AresUnifiedDatasetGraph::build_core()),
    };
    handle_fastmcp_jsonrpc_request(req, &ctx, sanitizer)
}

/// Loop bloccante su `stdin`/`stdout` per il trasporto FastMCP JSON-RPC 2.0.
pub fn run_mcp_stdio_loop(state: Arc<SharedMissionState>) -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let sanitizer = StrictMcpSanitizer;

    for line_res in stdin.lock().lines() {
        let line = line_res?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<JsonRpcRequest>(&line) {
            Ok(req) => {
                if let Some(ctx) = state.fastmcp_context() {
                    handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer)
                } else {
                    JsonRpcResponse {
                        jsonrpc: "2.0",
                        id: req.id.unwrap_or(Value::Null),
                        result: None,
                        error: Some(json!({ "code": -32603, "message": "state unavailable" })),
                    }
                }
            }
            Err(e) => JsonRpcResponse {
                jsonrpc: "2.0",
                id: Value::Null,
                result: None,
                error: Some(json!({ "code": -32700, "message": format!("parse error: {e}") })),
            },
        };

        if let Ok(resp_str) = serde_json::to_string(&response) {
            writeln!(stdout, "{resp_str}")?;
            stdout.flush()?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
    use std::path::PathBuf;

    fn sample_state() -> Arc<SharedMissionState> {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("data")
            .join("bidmc");
        SharedMissionState::from_data_dir(&dir).expect("load bidmc state")
    }

    #[test]
    fn test_all_4_fastmcp_tools_respect_150_token_600_byte_cap() {
        let state = sample_state();
        let pkt = state.latest_snapshot().expect("latest packet");
        let sanitizer = StrictMcpSanitizer;

        let tools = [
            "get_crew_health_summary",
            "explain_causal_anomaly",
            "simulate_countermeasure_impact",
            "get_medops_playbook",
        ];

        for tool in tools {
            let req = JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                id: Some(json!(1)),
                method: "tools/call".to_string(),
                params: json!({ "name": tool, "arguments": {} }),
            };
            let resp = handle_mcp_jsonrpc_request(&req, &pkt, &sanitizer);
            assert!(resp.error.is_none(), "Unexpected error on tool {tool}");
            let result = resp.result.expect("result present");
            let text = result["content"][0]["text"]
                .as_str()
                .expect("text content string");
            assert!(
                text.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
                "Tool {tool} exceeded 600-byte Context-Mode cap: {} bytes",
                text.len()
            );
        }
    }

    #[test]
    fn test_explain_causal_anomaly_wraps_observations_in_xml_shield() {
        let state = sample_state();
        let pkt = state.latest_snapshot().expect("latest packet");
        let sanitizer = StrictMcpSanitizer;

        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(42)),
            method: "tools/call".to_string(),
            params: json!({ "name": "explain_causal_anomaly" }),
        };
        let resp = handle_mcp_jsonrpc_request(&req, &pkt, &sanitizer);
        let result = resp.result.expect("result present");
        let text = result["content"][0]["text"].as_str().expect("text string");
        let parsed: Value = serde_json::from_str(text).expect("valid json payload");
        let chain = parsed["adhg_chain"].as_array().expect("adhg_chain array");
        assert!(!chain.is_empty());
        for entry in chain {
            let s = entry.as_str().expect("string item");
            assert!(s.starts_with("<untrusted_telemetry_observation>"));
            assert!(s.ends_with("</untrusted_telemetry_observation>"));
        }
    }
    #[test]
    fn mcp_summary_and_projection_preserve_unavailable_assessment() {
        let packet = sample_state().latest_snapshot().expect("snapshot");
        for tool in ["get_crew_health_summary", "simulate_countermeasure_impact"] {
            let request = JsonRpcRequest {
                jsonrpc: "2.0".into(),
                id: Some(json!(1)),
                method: "tools/call".into(),
                params: json!({"name": tool}),
            };
            let response = handle_mcp_jsonrpc_request(&request, &packet, &StrictMcpSanitizer);
            let result = response.result.expect("tool result");
            let text = result["content"][0]["text"].as_str().expect("text payload");
            let payload: Value = serde_json::from_str(text).expect("valid payload");
            if tool == "get_crew_health_summary" {
                assert_eq!(payload.get("mri_pct"), Some(&Value::Null));
                assert_eq!(payload.get("rho_global"), Some(&Value::Null));
                assert_eq!(payload.get("ttv_h"), Some(&Value::Null));
                assert_eq!(
                    payload["hrv_unavailable_reason"],
                    "BEAT_INTERVALS_NOT_AVAILABLE"
                );
            } else {
                for field in [
                    "current_rho",
                    "projected_ttv_gain_h",
                    "lbnp_30mmhg_delta_rho_h",
                    "ared_125kgf_delta_rho_h",
                ] {
                    assert_eq!(payload.get(field), Some(&Value::Null));
                }
            }
        }
    }
}
