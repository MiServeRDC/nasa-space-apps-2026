//! Unified FastMCP JSON-RPC 2.0 router in Context-Mode (< 150 tokens / <= 600 bytes).
//! Exposes the 8 ARES-Health clinical-space tools:
//! - Block G (4 core tools): `get_crew_health_summary`, `explain_causal_anomaly`,
//!   `simulate_countermeasure_impact`, `get_medops_playbook`
//! - Blocks H & I (4 Timestral / HyperGraph / DatasetGraph tools):
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

/// Serializes the JSON payload ensuring syntactic validity and compliance with the Context-Mode cap.
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

fn build_domain_summary_payload(domain: &str, packet: &ares_core_types::telemetry::TelemetryPacket) -> Value {
    let a360 = packet.aerospace_360.as_ref();
    match domain {
        "sex_physio" => {
            let p = a360.map(|a| &a.crew_profile);
            json!({
                "domain": "sex_physio",
                "astronaut": packet.astronaut_id,
                "sex": p.map(|c| c.biological_sex),
                "age_y": p.map(|c| round1(c.age_years)),
                "mass_kg": p.map(|c| round1(c.body_mass_kg)),
                "hct_pct": p.and_then(|c| c.baseline_hematocrit_pct).map(round1),
                "g6pd": p.map(|c| c.g6pd_deficient),
                "qtc_ms": p.and_then(|c| c.baseline_qtc_ms).map(round1)
            })
        }
        "radiation" => {
            let rad = a360.and_then(|a| a.radiation_ars.as_ref());
            let gate6 = a360.is_some_and(|a| a.extended_safety_gates.gate6_radiation_neutropenic_invasive_locked);
            json!({
                "domain": "radiation",
                "bfo_gy": rad.map(|r| round2(r.estimated_acute_bfo_dose_gy)),
                "cum_msv": rad.map(|r| round1(r.cumulative_mission_dose_msv)),
                "anc_k_ul": rad.map(|r| round2(r.predicted_anc_k_ul)),
                "plt_k_ul": rad.map(|r| round1(r.predicted_plt_k_ul)),
                "neutropenia": rad.map(|r| r.severe_neutropenia),
                "filgrastim": rad.map(|r| r.filgrastim_indicated),
                "gate6_lock": gate6
            })
        }
        "acute" => {
            let ac = a360.and_then(|a| a.acute_emergency.as_ref());
            json!({
                "domain": "acute",
                "pb_code": ac.and_then(|a| a.active_acute_playbook_code),
                "si": ac.and_then(|a| a.shock_index).map(round2),
                "cpr": ac.map(|a| a.pulseless_cardiac_arrest),
                "anaph": ac.map(|a| a.anaphylaxis_suspected),
                "hem": ac.map(|a| a.active_arterial_hemorrhage),
                "abd": ac.map(|a| a.acute_abdomen_nom_suspected),
                "pelvic": ac.map(|a| a.pelvic_emergency_flag),
                "aur_ml": ac.and_then(|a| a.acute_urinary_retention_ml).map(round1)
            })
        }
        "tox_dcs" => {
            let tox = a360.and_then(|a| a.toxicology_dcs.as_ref());
            json!({
                "domain": "tox_dcs",
                "nh3": tox.map(|t| round1(t.nh3_ppm)),
                "mmh": tox.map(|t| round2(t.mmh_ppm)),
                "co": tox.map(|t| round1(t.co_ppm)),
                "hcn": tox.map(|t| round1(t.hcn_ppm)),
                "methb_pct": tox.map(|t| round1(t.methemoglobin_pct)),
                "r360": tox.map(|t| round2(t.haldane_tissue_ratio_r360)),
                "spencer": tox.map(|t| t.spencer_vge_grade),
                "dcs2": tox.map(|t| t.dcs_type2_or_age_active),
                "water_helmet": tox.map(|t| t.helmet_water_intrusion_detected)
            })
        }
        "pharma_sepsis" => {
            let ps = a360.and_then(|a| a.pharmacology_sepsis.as_ref());
            let gates = a360.map(|a| a.extended_safety_gates);
            json!({
                "domain": "pharma_sepsis",
                "qsofa": ps.map(|p| p.qsofa_score),
                "sepsis": ps.map(|p| p.sepsis_protocol_active),
                "shock": ps.map(|p| p.septic_shock_active),
                "bolus_ml": ps.map(|p| round1(p.recommended_crystalloid_bolus_ml)),
                "egfr": ps.and_then(|p| p.estimated_egfr_ml_min).map(round1),
                "qtc_ms": ps.map(|p| round1(p.effective_qtc_ms)),
                "gate5_nsaid": gates.map(|g| g.gate5_nsaid_renal_bleeding_locked),
                "gate5_qtc": gates.map(|g| g.gate5_allergy_or_qtc_locked),
                "gate5_sub": gates.map(|g| g.gate5_formulary_substitution_active)
            })
        }
        "bmed" => {
            let bm = a360.and_then(|a| a.behavioral_health.as_ref());
            let gate7 = a360.is_some_and(|a| a.extended_safety_gates.gate7_bmed_delirium_or_restraint_guard_active);
            json!({
                "domain": "bmed",
                "triage": bm.map(|b| b.triage_classification),
                "delirium_mimic": bm.map(|b| b.organic_delirium_mimic_detected),
                "phq9": bm.and_then(|b| b.phq9_score),
                "gad7": bm.and_then(|b| b.gad7_score),
                "airlock_lock": bm.map(|b| b.airlock_software_lockout_active),
                "cmrs": bm.map(|b| b.cmrs_restraint_authorized),
                "gate7_guard": gate7
            })
        }
        other => json!({
            "domain": other,
            "known_domains": ["sex_physio", "radiation", "acute", "tox_dcs", "pharma_sepsis", "bmed"]
        }),
    }
}

/// Handles a FastMCP JSON-RPC 2.0 request with the full Timestral + HyperGraph context.
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
                    { "name": "get_medops_playbook", "description": "Active Type-1 MedOps Playbook (#01-#09) and 3 Hard Safety Gates status" },
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
                "get_crew_health_summary" | "get_astronaut_health_summary" => {
                    if let Some(domain) = extract_str_arg(&req.params, &["domain"]) {
                        build_domain_summary_payload(domain, latest_packet)
                    } else {
                        json!({
                            "astronaut": latest_packet.astronaut_id,
                            "fd": latest_packet.flight_day,
                            "src": latest_packet.source_record_id,
                            "t_rec_s": latest_packet.relative_recording_time_s,
                            "severity": latest_packet.alert_severity,
                            "vitals_anom": ctx.vitals_anomaly.overall,
                            "mri_pct": latest_packet.nqs_stl.mri_pct.map(round1),
                            "ttv_interval_kind": latest_packet.nqs_stl.ttv_interval_kind,
                            "rho_global": latest_packet.nqs_stl.rho_global.map(round2),
                            "ttv_h": latest_packet.nqs_stl.ttv_hours.map(round1),
                            "hrv_unavailable_reason": latest_packet.biometrics.hrv_unavailable_reason,
                            "missing": latest_packet.biometrics.missing_channels
                        })
                    }
                }
                "get_radiation_ars_biodosimetry" => {
                    build_domain_summary_payload("radiation", latest_packet)
                }
                "get_toxicology_dcs_status" => {
                    build_domain_summary_payload("tox_dcs", latest_packet)
                }
                "get_pharmacology_inventory_gate" => {
                    build_domain_summary_payload("pharma_sepsis", latest_packet)
                }
                "get_bmed_delirium_triage" => {
                    build_domain_summary_payload("bmed", latest_packet)
                }
                "get_eclss_differential" => {
                    let eclss = latest_packet
                        .aerospace_360
                        .as_ref()
                        .and_then(|a| a.eclss_coupled.as_ref());
                    json!({
                        "domain": "eclss",
                        "max_ppco2": eclss.map(|e| round2(e.max_ppco2_mmhg)),
                        "cabin_ppco2": eclss.and_then(|e| e.cabin_ppco2_mmhg).map(round2),
                        "helmet_ppco2": eclss.and_then(|e| e.helmet_ppco2_mmhg).map(round2),
                        "crew": eclss.map(|e| e.affected_crew_count),
                        "root_cause": eclss.map(|e| e.root_cause_label.as_str()),
                        "scrubber_override": eclss.map(|e| e.scrubber_override_active),
                        "pba_o2": eclss.map(|e| e.emergency_pba_o2_mask_required)
                    })
                }
                "explain_causal_anomaly"
                | "query_organ_robustness"
                | "query_causal_biomarker_state" => {
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
                "simulate_countermeasure_impact" | "evaluate_stl_safety_margins" => json!({
                    "current_rho": latest_packet.nqs_stl.rho_global.map(round2),
                    "lbnp_30mmhg_delta_rho_h": latest_packet.nqs_stl.rho_global.map(|_| 0.19),
                    "ared_125kgf_delta_rho_h": latest_packet.nqs_stl.rho_global.map(|_| 0.11),
                    "projected_ttv_gain_h": latest_packet.nqs_stl.rho_global.map(|_| 96.0)
                }),
                "get_medops_playbook"
                | "trigger_medops_action_playbook"
                | "get_active_medops_playbook" => {
                    if let Some(domain) = extract_str_arg(&req.params, &["domain"]) {
                        let ext = latest_packet
                            .aerospace_360
                            .as_ref()
                            .map(|a| a.extended_safety_gates);
                        json!({
                            "domain": domain,
                            "playbook_id": latest_packet.active_playbook.playbook_id,
                            "anticoag_lock": latest_packet.active_playbook.safety_gates.anticoagulant_lock_active,
                            "lbnp_vent": latest_packet.active_playbook.safety_gates.lbnp_auto_vent_triggered,
                            "gate5_nsaid": ext.map(|g| g.gate5_nsaid_renal_bleeding_locked),
                            "gate5_qtc": ext.map(|g| g.gate5_allergy_or_qtc_locked),
                            "gate6_rad": ext.map(|g| g.gate6_radiation_neutropenic_invasive_locked),
                            "gate7_bmed": ext.map(|g| g.gate7_bmed_delirium_or_restraint_guard_active),
                            "top_action": latest_packet.active_playbook.actions.first().map(|a| &a.action_id)
                        })
                    } else {
                        json!({
                            "playbook_id": latest_packet.active_playbook.playbook_id,
                            "gates": latest_packet.active_playbook.safety_gates,
                            "top_action": latest_packet.active_playbook.actions.first().map(|a| &a.action_id)
                        })
                    }
                }
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
                        "method": snap.forecast_method,
                        "horizon_s": snap.short_horizon_s,
                        "ewma_max_s": snap.ewma_short_horizon_max_s,
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

    #[test]
    fn test_phase2_domain_filters_and_dispatch_aliases_respect_600_byte_cap() {
        let state = sample_state();
        let ctx = state.fastmcp_context().expect("fastmcp context");
        let sanitizer = StrictMcpSanitizer;

        let domains = [
            "sex_physio",
            "radiation",
            "acute",
            "tox_dcs",
            "pharma_sepsis",
            "bmed",
        ];
        for domain in domains {
            for tool in ["get_crew_health_summary", "get_medops_playbook"] {
                let req = JsonRpcRequest {
                    jsonrpc: "2.0".to_string(),
                    id: Some(json!(200)),
                    method: "tools/call".to_string(),
                    params: json!({ "name": tool, "arguments": { "domain": domain } }),
                };
                let resp = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
                assert!(resp.error.is_none(), "error on {tool}/{domain}: {:?}", resp.error);
                let text = resp.result.expect("result")["content"][0]["text"]
                    .as_str()
                    .expect("text")
                    .to_string();
                assert!(
                    text.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
                    "{tool}/{domain} exceeded 600B: {}",
                    text.len()
                );
                let parsed: Value = serde_json::from_str(&text).expect("valid json");
                assert_eq!(parsed["domain"], domain);
            }
        }

        let aliases = [
            "get_radiation_ars_biodosimetry",
            "get_toxicology_dcs_status",
            "get_pharmacology_inventory_gate",
            "get_bmed_delirium_triage",
            "get_eclss_differential",
        ];
        for alias in aliases {
            let req = JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                id: Some(json!(201)),
                method: "tools/call".to_string(),
                params: json!({ "name": alias, "arguments": {} }),
            };
            let resp = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
            assert!(resp.error.is_none(), "error on {alias}: {:?}", resp.error);
            let text = resp.result.expect("result")["content"][0]["text"]
                .as_str()
                .expect("text")
                .to_string();
            assert!(
                text.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
                "{alias} exceeded 600B: {}",
                text.len()
            );
            let parsed: Value = serde_json::from_str(&text).expect("valid json");
            assert!(parsed.is_object());
        }
    }
}
