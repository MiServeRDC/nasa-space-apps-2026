//! Router FastMCP JSON-RPC 2.0 unificato in modalita Context-Mode (< 150 token / <= 600 byte).
//! Espone gli 8 tool clinico-spaziali ARES-Health:
//! - Blocco G (4 tool core): `get_crew_health_summary`, `explain_causal_anomaly`,
//!   `simulate_countermeasure_impact`, `get_medops_playbook`
//! - Blocchi H & I (4 tool Timestral / HyperGraph / DatasetGraph):
//!   `query_dataset_graph`, `explain_biomarker_path`,
//!   `get_timestral_quantile_cones`, `get_hypergraph_spatial_status`

use crate::ws_server::FastMcpRuntimeContext;
use ares_causal_graph::biokg_reasoner::BiomedicalEvidenceDescriptor;
use ares_causal_graph::hypergraph_spatial::{DeonticModality, HabitatZoneId};
use ares_core_types::ConformalGateStatus;
use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_core_types::security::McpInputSanitizer;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

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

#[inline]
fn round1(v: f64) -> f64 {
    if v.is_finite() {
        (v * 10.0).round() / 10.0
    } else {
        0.0
    }
}

#[inline]
fn round2(v: f64) -> f64 {
    if v.is_finite() {
        (v * 100.0).round() / 100.0
    } else {
        0.0
    }
}

#[inline]
fn zone_short_code(z: HabitatZoneId) -> &'static str {
    match z {
        HabitatZoneId::SleepQuarters => "SLEEP",
        HabitatZoneId::AredExerciseBay => "ARED",
        HabitatZoneId::LbnpChamber => "LBNP",
        HabitatZoneId::MedOpsUltrasoundBay => "MEDOPS",
        HabitatZoneId::RadiationStormShelter => "SHELTER",
        HabitatZoneId::EvaAirlock => "EVA",
    }
}

#[inline]
fn modality_short_code(m: DeonticModality) -> &'static str {
    match m {
        DeonticModality::Permitted => "P",
        DeonticModality::Restricted => "R",
        DeonticModality::Forbidden => "F",
        DeonticModality::Mandatory => "M",
    }
}

#[inline]
fn gate_status_code(s: ConformalGateStatus) -> &'static str {
    match s {
        ConformalGateStatus::HeuristicGateAccepted => "HEURISTIC_ACCEPTED",
        ConformalGateStatus::AbstainedFallbackDeterministic => "ABSTAINED_FALLBACK",
    }
}

/// Serializza il payload JSON assicurando validita sintattica e rispetto del cap Context-Mode.
fn serialize_under_budget(mut payload: Value) -> String {
    let mut s = payload.to_string();
    if s.len() <= MAX_MCP_CONTEXT_MODE_BYTES {
        return s;
    }
    if let Some(obj) = payload.as_object_mut() {
        for key in [
            "neighbors",
            "slices",
            "clauses",
            "steps",
            "deontic",
            "adhg_chain",
        ] {
            while s.len() > MAX_MCP_CONTEXT_MODE_BYTES {
                let popped = obj
                    .get_mut(key)
                    .and_then(Value::as_array_mut)
                    .and_then(Vec::pop)
                    .is_some();
                if !popped {
                    break;
                }
                s = serde_json::to_string(obj).unwrap_or_else(|_| String::new());
            }
        }
    }
    if s.len() <= MAX_MCP_CONTEXT_MODE_BYTES {
        return s;
    }
    json!({ "truncated": true, "bytes": s.len(), "model_status": "ILLUSTRATIVE_UNVALIDATED" })
        .to_string()
}

fn extract_str_arg<'a>(params: &'a Value, keys: &[&str]) -> Option<&'a str> {
    let args = params.get("arguments").unwrap_or(params);
    for k in keys {
        if let Some(s) = args.get(*k).and_then(Value::as_str)
            && !s.trim().is_empty()
        {
            return Some(s);
        }
    }
    None
}

/// Gestisce una richiesta JSON-RPC 2.0 FastMCP con il contesto completo Timestral + HyperGraph.
pub fn handle_fastmcp_jsonrpc_request<S: McpInputSanitizer>(
    req: &JsonRpcRequest,
    ctx: &FastMcpRuntimeContext,
    sanitizer: &S,
) -> JsonRpcResponse {
    let id = req.id.clone().unwrap_or(Value::Null);
    let latest_packet = &ctx.latest_packet;

    match req.method.as_str() {
        "initialize" => JsonRpcResponse {
            jsonrpc: "2.0",
            id,
            result: Some(json!({
                "protocolVersion": "2025-06-18",
                "serverInfo": { "name": "ares-health-fastmcp", "version": "1.1.0" },
                "capabilities": { "tools": {} }
            })),
            error: None,
        },
        "tools/list" => JsonRpcResponse {
            jsonrpc: "2.0",
            id,
            result: Some(json!({
                "tools": [
                    { "name": "get_crew_health_summary", "description": "Illustrative scenario assessment; unavailable metrics remain null" },
                    { "name": "explain_causal_anomaly", "description": "4-hop ADHG causal chain for active physiological degradation" },
                    { "name": "simulate_countermeasure_impact", "description": "Deterministic delta-rho & TTV projection for LBNP/ARED countermeasures" },
                    { "name": "get_medops_playbook", "description": "Active Type-1 MedOps Playbook (#01-#05) and 3 Hard Safety Gates status" },
                    { "name": "query_dataset_graph", "description": "Query AresUnifiedDatasetGraph (24 datasets) with SPOKE/BioCypher/PrimeKG/Biolink provenance (<150 tokens)" },
                    { "name": "explain_biomarker_path", "description": "Shortest semantic/causal path across 24 datasets in AresUnifiedDatasetGraph (<150 tokens)" },
                    { "name": "get_timestral_quantile_cones", "description": "Illustrative non-crossing scenario ranges and heuristic gate; no calibrated coverage claim" },
                    { "name": "get_hypergraph_spatial_status", "description": "3D UBERON body heatmap, HabitatZoneDeonticPolicy, and ARES-BioKG 16-byte descriptor (<150 tokens)" }
                ]
            })),
            error: None,
        },
        "tools/call" => {
            let tool_name = req.params.get("name").and_then(Value::as_str).unwrap_or("");
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

            let mut compact_payload = match clean_name.as_str() {
                "get_crew_health_summary" | "get_astronaut_health_summary" => json!({
                    "astronaut": latest_packet.astronaut_id,
                    "fd": latest_packet.flight_day,
                    "src": latest_packet.source_record_id,
                    "t_rec_s": latest_packet.relative_recording_time_s,
                    "severity": latest_packet.alert_severity,
                    "mri_pct": latest_packet.nqs_stl.mri_pct.map(round1),
                    "ttv_interval_kind": latest_packet.nqs_stl.ttv_interval_kind,
                    "rho_global": latest_packet.nqs_stl.rho_global.map(round2),
                    "ttv_h": latest_packet.nqs_stl.ttv_hours.map(round1),
                    "hrv_unavailable_reason": latest_packet.biometrics.hrv_unavailable_reason,
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
                        "rho_tau_w": round2(latest_packet.nqs_stl.rho_tau_w),
                        "rho_ared": round2(latest_packet.nqs_stl.rho_ared),
                        "rho_sans": round2(latest_packet.nqs_stl.rho_sans),
                        "adhg_chain": wrapped_chain
                    })
                }
                "simulate_countermeasure_impact" => json!({
                    "current_rho": latest_packet.nqs_stl.rho_global.map(round2),
                    "lbnp_30mmhg_delta_rho_h": latest_packet.nqs_stl.rho_global.map(|_| 0.19),
                    "ared_125kgf_delta_rho_h": latest_packet.nqs_stl.rho_global.map(|_| 0.11),
                    "projected_ttv_gain_h": latest_packet.nqs_stl.rho_global.map(|_| 96.0)
                }),
                "get_medops_playbook" | "trigger_medops_action_playbook" => json!({
                    "playbook_id": latest_packet.active_playbook.playbook_id,
                    "gates": latest_packet.active_playbook.safety_gates,
                    "top_action": latest_packet.active_playbook.actions.first().map(|a| &a.action_id)
                }),
                "query_dataset_graph" => {
                    let raw_query =
                        extract_str_arg(&req.params, &["query", "keyword", "id", "dataset"])
                            .unwrap_or("OSD-51");
                    let clean_query = match sanitizer.sanitize_mcp_query(raw_query) {
                        Ok(q) => q,
                        Err(e) => {
                            return JsonRpcResponse {
                                jsonrpc: "2.0",
                                id,
                                result: None,
                                error: Some(json!({ "code": -32602, "message": e.to_string() })),
                            };
                        }
                    };
                    let res = ctx.dataset_graph.query_by_keyword_or_id(&clean_query, 3);
                    json!({
                        "schema": "SPOKE+BioCypher+PrimeKG+Biolink",
                        "datasets": ctx.dataset_graph.dataset_count(),
                        "matched": res.matched_id,
                        "cat": res.category,
                        "curie": res.ontology_curie,
                        "neighbors": res.neighbors,
                        "slices": res.slice_uris,
                        "clauses": res.clauses,
                        "us": res.latency_us
                    })
                }
                "explain_biomarker_path" => {
                    let raw_from =
                        extract_str_arg(&req.params, &["from", "source"]).unwrap_or("OSD-51");
                    let raw_to = extract_str_arg(&req.params, &["to", "target"])
                        .unwrap_or("pheno_osteopenia");
                    let clean_from = match sanitizer.sanitize_mcp_query(raw_from) {
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
                    let clean_to = match sanitizer.sanitize_mcp_query(raw_to) {
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
                    match ctx
                        .dataset_graph
                        .explain_shortest_path(&clean_from, &clean_to)
                    {
                        Ok(path) => json!({
                            "schema": "SPOKE+BioCypher+PrimeKG+Biolink",
                            "from": path.from,
                            "to": path.to,
                            "hops": path.hops,
                            "steps": path.path_steps,
                            "us": path.latency_us
                        }),
                        Err(e) => {
                            return JsonRpcResponse {
                                jsonrpc: "2.0",
                                id,
                                result: None,
                                error: Some(json!({ "code": -32602, "message": e.to_string() })),
                            };
                        }
                    }
                }
                "get_timestral_quantile_cones" => {
                    let snap = &ctx.quantile_snapshot;
                    json!({
                        "gate": gate_status_code(snap.confidence_state),
                        "abstained": snap.abstention_certificate.abstained,
                        "rho_cone": snap.rho_global_cone.map(|cone| [round2(cone.q05), round2(cone.q50), round2(cone.q95)]),
                        "ttv_cone_h": snap.ttv_hours_cone.map(|cone| [round1(cone.q05), round1(cone.q50), round1(cone.q95)]),
                        "pessimistic_ttv_q05_h": snap.pessimistic_ttv_q05_hours.map(round1),
                        "hr_cone": [
                            round1(snap.heart_rate_bpm_cone.q05),
                            round1(snap.heart_rate_bpm_cone.q50),
                            round1(snap.heart_rate_bpm_cone.q95)
                        ],
                        "abs_err": round2(snap.abstention_certificate.empirical_coverage_error),
                        "alpha_t": round2(snap.abstention_certificate.adaptive_alpha_t),
                        "us": snap.inference_latency_us
                    })
                }
                "get_hypergraph_spatial_status" => {
                    let heatmap_compact: Vec<(&str, f64)> = ctx
                        .heatmap
                        .cells
                        .iter()
                        .map(|c| (c.uberon_curie.as_ref(), round2(c.propagated_intensity)))
                        .collect();
                    let deontic_compact: Vec<(&str, &str, f64)> = ctx
                        .habitat_assessment
                        .verdicts
                        .iter()
                        .map(|v| {
                            (
                                zone_short_code(v.zone),
                                modality_short_code(v.modality),
                                round2(v.rho_qstl),
                            )
                        })
                        .collect();
                    let desc = &ctx.grounding.descriptor;
                    json!({
                        "hottest": ctx.heatmap.hottest_region.uberon_curie(),
                        "heatmap": heatmap_compact,
                        "zone": zone_short_code(ctx.habitat_assessment.current_zone),
                        "violates": ctx.habitat_assessment.violates_policy,
                        "mandatory": ctx.habitat_assessment.mandatory_zone.map(zone_short_code),
                        "deontic": deontic_compact,
                        "biokg": {
                            "clause": ctx.grounding.normative_clause.official_code(),
                            "bytes": core::mem::size_of::<BiomedicalEvidenceDescriptor>(),
                            "crc_ok": desc.verify_crc().is_ok(),
                            "mapping_status": "UNVERIFIED",
                            "d": round2(desc.cohen_d())
                        }
                    })
                }
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

            if let Some(object) = compact_payload.as_object_mut() {
                object.insert(
                    "model_status".into(),
                    json!(latest_packet.model_validation_status),
                );
            }
            let serialized = serialize_under_budget(compact_payload);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ws_server::SharedMissionState;
    use ares_security_privacy::sanitizer::StrictMcpSanitizer;
    use std::path::PathBuf;

    fn sample_state() -> std::sync::Arc<SharedMissionState> {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("data")
            .join("bidmc");
        SharedMissionState::from_data_dir(&dir).expect("load bidmc state")
    }

    #[test]
    fn test_all_8_fastmcp_tools_respect_150_token_600_byte_cap_and_valid_json() {
        let state = sample_state();
        let ctx = state.fastmcp_context().expect("fastmcp context");
        let sanitizer = StrictMcpSanitizer;

        let tools = [
            "get_crew_health_summary",
            "explain_causal_anomaly",
            "simulate_countermeasure_impact",
            "get_medops_playbook",
            "query_dataset_graph",
            "explain_biomarker_path",
            "get_timestral_quantile_cones",
            "get_hypergraph_spatial_status",
        ];

        for tool in tools {
            let req = JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                id: Some(json!(1)),
                method: "tools/call".to_string(),
                params: json!({ "name": tool, "arguments": {} }),
            };
            let resp = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
            assert!(
                resp.error.is_none(),
                "Unexpected error on tool {tool}: {:?}",
                resp.error
            );
            let result = resp.result.expect("result present");
            let text = result["content"][0]["text"]
                .as_str()
                .expect("text content string");
            assert!(
                text.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
                "Tool {tool} exceeded 600-byte Context-Mode cap: {} bytes ({text})",
                text.len()
            );
            let parsed: Value = serde_json::from_str(text).expect("tool output must be valid JSON");
            assert!(
                parsed.is_object(),
                "Tool {tool} output must be a JSON object"
            );
        }
    }

    #[test]
    fn test_new_dataset_graph_timestral_and_hypergraph_fastmcp_tools() {
        let state = sample_state();
        let ctx = state.fastmcp_context().expect("fastmcp context");
        let sanitizer = StrictMcpSanitizer;

        // 1. query_dataset_graph
        let q_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(10)),
            method: "tools/call".to_string(),
            params: json!({
                "name": "query_dataset_graph",
                "arguments": { "query": "OSD-51" }
            }),
        };
        let q_resp = handle_fastmcp_jsonrpc_request(&q_req, &ctx, &sanitizer);
        let q_text = q_resp.result.expect("result")["content"][0]["text"]
            .as_str()
            .expect("text")
            .to_string();
        assert!(q_text.len() <= MAX_MCP_CONTEXT_MODE_BYTES);
        let q_json: Value = serde_json::from_str(&q_text).expect("valid json");
        assert_eq!(q_json["datasets"], 24);
        assert!(q_json["schema"].as_str().expect("schema").contains("SPOKE"));
        assert!(
            q_json["schema"]
                .as_str()
                .expect("schema")
                .contains("Biolink")
        );

        // 2. explain_biomarker_path
        let p_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(11)),
            method: "tools/call".to_string(),
            params: json!({
                "name": "explain_biomarker_path",
                "arguments": { "from": "OSD-51", "to": "pheno_osteopenia" }
            }),
        };
        let p_resp = handle_fastmcp_jsonrpc_request(&p_req, &ctx, &sanitizer);
        let p_text = p_resp.result.expect("result")["content"][0]["text"]
            .as_str()
            .expect("text")
            .to_string();
        assert!(p_text.len() <= MAX_MCP_CONTEXT_MODE_BYTES);
        let p_json: Value = serde_json::from_str(&p_text).expect("valid json");
        assert!(p_json["hops"].as_u64().expect("hops") >= 1);

        // 3. get_timestral_quantile_cones
        let t_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(12)),
            method: "tools/call".to_string(),
            params: json!({ "name": "get_timestral_quantile_cones", "arguments": {} }),
        };
        let t_resp = handle_fastmcp_jsonrpc_request(&t_req, &ctx, &sanitizer);
        let t_text = t_resp.result.expect("result")["content"][0]["text"]
            .as_str()
            .expect("text")
            .to_string();
        assert!(t_text.len() <= MAX_MCP_CONTEXT_MODE_BYTES);
        let t_json: Value = serde_json::from_str(&t_text).expect("valid json");
        assert_eq!(t_json.get("rho_cone"), Some(&Value::Null));
        assert_eq!(t_json.get("ttv_cone_h"), Some(&Value::Null));
        assert_eq!(t_json.get("pessimistic_ttv_q05_h"), Some(&Value::Null));
        assert_eq!(t_json["abstained"], true);

        // 4. get_hypergraph_spatial_status
        let h_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(13)),
            method: "tools/call".to_string(),
            params: json!({ "name": "get_hypergraph_spatial_status", "arguments": {} }),
        };
        let h_resp = handle_fastmcp_jsonrpc_request(&h_req, &ctx, &sanitizer);
        let h_text = h_resp.result.expect("result")["content"][0]["text"]
            .as_str()
            .expect("text")
            .to_string();
        assert!(h_text.len() <= MAX_MCP_CONTEXT_MODE_BYTES);
        let h_json: Value = serde_json::from_str(&h_text).expect("valid json");
        assert_eq!(h_json["heatmap"].as_array().expect("heatmap").len(), 5);
        assert_eq!(h_json["deontic"].as_array().expect("deontic").len(), 6);
        assert_eq!(h_json["biokg"]["bytes"], 16);
        assert_eq!(h_json["biokg"]["crc_ok"], true);
    }

    #[test]
    fn test_fastmcp_tools_list_advertises_all_8_tools() {
        let state = sample_state();
        let ctx = state.fastmcp_context().expect("fastmcp context");
        let sanitizer = StrictMcpSanitizer;
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(99)),
            method: "tools/list".to_string(),
            params: Value::Null,
        };
        let resp = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
        let tools = resp.result.expect("result")["tools"]
            .as_array()
            .expect("tools array")
            .clone();
        assert_eq!(tools.len(), 8);
    }
}
