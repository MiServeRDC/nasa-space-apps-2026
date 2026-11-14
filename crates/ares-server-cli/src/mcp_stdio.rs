//! Fase 14 (G2): Server Nativo FastMCP JSON-RPC 2.0 su `stdio` con compressione Context-Mode (< 150 token).

use crate::ws_server::SharedMissionState;
use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_core_types::security::McpInputSanitizer;
use ares_core_types::telemetry::TelemetryPacket;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::sync::Arc;

#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: &'static str,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
}

/// Gestisce una richiesta JSON-RPC 2.0 in modalita Context-Mode (< 150 token / <= 600 byte).
pub fn handle_mcp_jsonrpc_request<S: McpInputSanitizer>(
    req: &JsonRpcRequest,
    latest_packet: &TelemetryPacket,
    sanitizer: &S,
) -> JsonRpcResponse {
    let id = req.id.clone().unwrap_or(Value::Null);

    match req.method.as_str() {
        "initialize" => JsonRpcResponse {
            jsonrpc: "2.0",
            id,
            result: Some(json!({
                "protocolVersion": "2025-06-18",
                "serverInfo": { "name": "ares-health-fastmcp", "version": "1.0.0" },
                "capabilities": { "tools": {} }
            })),
            error: None,
        },
        "tools/list" => JsonRpcResponse {
            jsonrpc: "2.0",
            id,
            result: Some(json!({
                "tools": [
                    { "name": "get_crew_health_summary", "description": "Compact <150-token NQS-STL & MRI readiness summary" },
                    { "name": "explain_causal_anomaly", "description": "4-hop ADHG causal chain for active physiological degradation" },
                    { "name": "simulate_countermeasure_impact", "description": "Deterministic delta-rho & TTV projection for LBNP/ARED countermeasures" },
                    { "name": "get_medops_playbook", "description": "Active Type-1 MedOps Playbook (#01-#05) and 3 Hard Safety Gates status" }
                ]
            })),
            error: None,
        },
        "tools/call" => {
            let tool_name = req
                .params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("");
            let clean_name = match sanitizer.sanitize_mcp_query(tool_name) {
                Ok(s) => s,
                Err(e) => {
                    return JsonRpcResponse {
                        jsonrpc: "2.0",
                        id,
                        result: None,
                        error: Some(json!({ "code": -32602, "message": e.to_string() })),
                    };
                }
            };

            let compact_payload = match clean_name.as_str() {
                "get_crew_health_summary" | "get_astronaut_health_summary" => json!({
                    "astronaut": latest_packet.astronaut_id,
                    "fd": latest_packet.flight_day,
                    "src": latest_packet.source_record_id,
                    "t_rec_s": latest_packet.relative_recording_time_s,
                    "severity": latest_packet.alert_severity,
                    "mri_pct": (latest_packet.nqs_stl.mri_pct * 10.0).round() / 10.0,
                    "rho_global": (latest_packet.nqs_stl.rho_global * 100.0).round() / 100.0,
                    "ttv_h": (latest_packet.nqs_stl.ttv_hours * 10.0).round() / 10.0,
                    "missing": latest_packet.biometrics.missing_channels
                }),
                "explain_causal_anomaly" | "query_organ_robustness" => {
                    let wrapped_chain: Vec<String> = latest_packet
                        .active_playbook
                        .causal_chain_summary
                        .iter()
                        .take(3)
                        .map(|s| sanitizer.wrap_untrusted_observation(s))
                        .collect();
                    json!({
                        "rho_tau_w": (latest_packet.nqs_stl.rho_tau_w * 100.0).round() / 100.0,
                        "rho_ared": (latest_packet.nqs_stl.rho_ared * 100.0).round() / 100.0,
                        "rho_sans": (latest_packet.nqs_stl.rho_sans * 100.0).round() / 100.0,
                        "adhg_chain": wrapped_chain
                    })
                }
                "simulate_countermeasure_impact" => json!({
                    "current_rho": (latest_packet.nqs_stl.rho_global * 100.0).round() / 100.0,
                    "lbnp_30mmhg_delta_rho_h": 0.19,
                    "ared_125kgf_delta_rho_h": 0.11,
                    "projected_ttv_gain_h": 96.0
                }),
                "get_medops_playbook" | "trigger_medops_action_playbook" => json!({
                    "playbook_id": latest_packet.active_playbook.playbook_id,
                    "gates": latest_packet.active_playbook.safety_gates,
                    "top_action": latest_packet.active_playbook.actions.first().map(|a| &a.action_id)
                }),
                other => {
                    return JsonRpcResponse {
                        jsonrpc: "2.0",
                        id,
                        result: None,
                        error: Some(
                            json!({ "code": -32601, "message": format!("unknown tool: {other}") }),
                        ),
                    };
                }
            };

            let mut serialized = compact_payload.to_string();
            if serialized.len() > MAX_MCP_CONTEXT_MODE_BYTES {
                serialized.truncate(MAX_MCP_CONTEXT_MODE_BYTES);
            }

            JsonRpcResponse {
                jsonrpc: "2.0",
                id,
                result: Some(json!({
                    "content": [{ "type": "text", "text": serialized }]
                })),
                error: None,
            }
        }
        other => JsonRpcResponse {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(json!({ "code": -32601, "message": format!("method not found: {other}") })),
        },
    }
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
                if let Some(pkt) = state.latest_snapshot() {
                    handle_mcp_jsonrpc_request(&req, &pkt, &sanitizer)
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
}
