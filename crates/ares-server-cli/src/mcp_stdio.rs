//! Transport 2 (phase 14): native FastMCP JSON-RPC 2.0 server on `stdio`.
//!
//! Newline-delimited JSON-RPC 2.0 in on `stdin`, one response per line out on
//! `stdout`. Nothing else may ever reach `stdout`: all logging goes to `stderr`
//! (see [`crate::mcp_stdio::serve_stdio`]), otherwise the MCP pipe is corrupted.
//!
//! Context-Mode compression invariant: the local quantized copilot never sees
//! waveforms or raw arithmetic. Every tool answer is a compact semantic summary
//! of what the deterministic Rust engine already decided, bounded by
//! [`MAX_RESULT_BYTES`], and carries explicit provenance (`prov`). Values the
//! engine cannot compute yet (`rho`, `sigma`, TTV, MRI) are `null` with a
//! `*_source` tag: the copilot must never be handed an invented number.
//!
//! The three macro-tools are the ones in `crates/ares-server-cli/README.md` and
//! in the `mcp-builder` skill. NOTE: `docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`
//! phase 14 lists four differently named tools (`get_crew_health_summary`,
//! `explain_causal_anomaly`, `simulate_countermeasure_impact`,
//! `get_medops_playbook`); the two documents disagree and the team must pick one.
//! The README/skill naming is implemented here because it matches the tools the
//! current engine can answer without `ares-causal-graph`.

use std::sync::Arc;

use ares_medops_playbooks::state::finite;
use ares_medops_playbooks::{ClinicalState, ClinicalThresholds, MedOpsReport, PlaybookId};
use serde_json::{Map, Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::RwLock;

use crate::mission::MissionState;
use crate::telemetry::{GateStatus, UI_REFRESH_RATE_HZ};

/// Token budget of one tool result (master plan, Block G).
pub const TOKEN_BUDGET: usize = 150;

/// Byte proxy for [`TOKEN_BUDGET`]: 600 B <= 150 token at 4 B/token, the figure
/// the master plan uses. Enforced on every tool result by [`fit_to_budget`].
pub const MAX_RESULT_BYTES: usize = 600;

/// MCP revision this server implements.
pub const PROTOCOL_VERSION: &str = "2025-06-18";

/// Revisions accepted when a client asks for one explicitly.
const SUPPORTED_PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];

pub const SERVER_NAME: &str = "ares-health-medops";

/// Longest instruction text handed to the copilot, in characters.
const MAX_INSTRUCTION_CHARS: usize = 200;

/// Organ systems [`query_organ_robustness`] knows, each mapped to the boundaries
/// the deterministic engine can actually compare today.
const ORGAN_SYSTEMS: [&str; 5] = [
    "CARDIOVASCULAR",
    "VENOUS",
    "MUSCULOSKELETAL",
    "NEURO_OCULAR",
    "RADIATION",
];

const TOOL_NAMES: [&str; 3] = [
    "get_astronaut_health_summary",
    "query_organ_robustness",
    "trigger_medops_action_playbook",
];

/// Reads JSON-RPC lines from `stdin` until EOF, answering on `stdout`.
pub async fn serve_stdio(mission: Arc<RwLock<MissionState>>) -> anyhow::Result<()> {
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut stdout = tokio::io::stdout();
    tracing::info!(
        tools = TOOL_NAMES.len(),
        budget_bytes = MAX_RESULT_BYTES,
        "FastMCP stdio server ready"
    );

    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let response = {
            let mut guard = mission.write().await;
            handle_request(&mut guard, &line)
        };
        if let Some(response) = response {
            stdout.write_all(response.as_bytes()).await?;
            stdout.write_all(b"\n").await?;
            stdout.flush().await?;
        }
    }
    Ok(())
}

/// Handles one JSON-RPC 2.0 request line. `None` for notifications (no `id`),
/// which must stay silent. Pure apart from the mission state it may mutate.
pub fn handle_request(mission: &mut MissionState, line: &str) -> Option<String> {
    let request: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(error) => {
            return Some(error_response(
                Value::Null,
                -32700,
                &format!("parse error: {error}"),
            ));
        }
    };

    let id = request.get("id").cloned();
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    let params = request.get("params").cloned().unwrap_or(Value::Null);

    // Notification: no id, so no response may be written.
    let id = id?;

    let outcome = match method {
        "initialize" => Ok(initialize(&params)),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(tools_list()),
        "tools/call" => call_tool(mission, &params),
        other => Err(RpcError::method_not_found(other)),
    };

    Some(match outcome {
        Ok(result) => success_response(id, result),
        Err(error) => error_response(id, error.code, &error.message),
    })
}

fn initialize(params: &Value) -> Value {
    let requested = params.get("protocolVersion").and_then(Value::as_str);
    let negotiated = match requested {
        Some(version) if SUPPORTED_PROTOCOL_VERSIONS.contains(&version) => version,
        _ => PROTOCOL_VERSION,
    };
    json!({
        "protocolVersion": negotiated,
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
        "instructions": "Deterministic ARES-Health MedOps engine. Answers are pre-computed semantic summaries under 150 tokens; null values are unavailable, never estimate them."
    })
}

fn tools_list() -> Value {
    json!({ "tools": [
        {
            "name": TOOL_NAMES[0],
            "description": "Crew health summary: alarm_level, mission_readiness_index (null until NQS-STL), missing_channels, provenance manifest, triggered playbooks (PB01-PB05) and the 3 Hard Clinical Safety Gates. 'prov' is the data provenance.",
            "inputSchema": {
                "type": "object",
                "properties": { "astronaut_id": { "type": "string", "description": "Defaults to the monitored crew member." } },
                "additionalProperties": false
            }
        },
        {
            "name": TOOL_NAMES[1],
            "description": "Per-organ robustness. rho / sigma_1_96 / ttv_days stay null until ares-nqs-stl lands; 'margins' carries the boundary comparisons the engine computes today (ok=null means unverifiable because the channel is missing).",
            "inputSchema": {
                "type": "object",
                "properties": { "organ_system": { "type": "string", "enum": ORGAN_SYSTEMS } },
                "required": ["organ_system"],
                "additionalProperties": false
            }
        },
        {
            "name": TOOL_NAMES[2],
            "description": "Gates a playbook through the 3 Hard Clinical Safety Gates, makes it the active run and returns its current step instruction plus the gate locks. Accepts PLAYBOOK_01_.. codes or the short PB01-PB05 tags.",
            "inputSchema": {
                "type": "object",
                "properties": { "playbook_id": { "type": "string", "enum": playbook_enum() } },
                "required": ["playbook_id"],
                "additionalProperties": false
            }
        }
    ]})
}

fn playbook_enum() -> Vec<String> {
    PlaybookId::ALL
        .iter()
        .flat_map(|id| [id.code().to_string(), short_tag(*id).to_string()])
        .collect()
}

fn call_tool(mission: &mut MissionState, params: &Value) -> Result<Value, RpcError> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing tool name"))?;
    let args = params.get("arguments").cloned().unwrap_or(Value::Null);

    let text = match name {
        "get_astronaut_health_summary" => health_summary(mission, &args)?,
        "query_organ_robustness" => organ_robustness(mission, &args)?,
        "trigger_medops_action_playbook" => trigger_playbook(mission, &args)?,
        other => return Err(RpcError::invalid_params(&format!("unknown tool {other}"))),
    };

    Ok(json!({ "content": [{ "type": "text", "text": text }], "isError": false }))
}

// --- Tool 1 ------------------------------------------------------------------

fn health_summary(mission: &MissionState, args: &Value) -> Result<String, RpcError> {
    if let Some(requested) = args.get("astronaut_id").and_then(Value::as_str)
        && requested != mission.astronaut_id()
    {
        return Err(RpcError::invalid_params(&format!(
            "unknown astronaut_id {requested}"
        )));
    }

    let packet = mission.packet();
    let mut obj = Map::new();
    obj.insert("astronaut_id".into(), json!(packet.astronaut_id));
    obj.insert(
        "alarm_level".into(),
        json!(packet.safety_margins.alarm_level),
    );
    obj.insert("mission_readiness_index".into(), Value::Null);
    obj.insert("mri_source".into(), json!("PENDING_ARES_NQS_STL"));
    obj.insert(
        "missing_channels".into(),
        json!(packet.biometrics.missing_channels),
    );
    obj.insert(
        "prov".into(),
        json!({
            "src": packet.provenance_manifest.biometrics_source,
            "native_hz": packet.provenance_manifest.biometrics_native_rate_hz,
            "ui_hz": UI_REFRESH_RATE_HZ,
            "overlay": packet.provenance_manifest.scenario_overlay_mode
        }),
    );
    obj.insert("playbooks".into(), json!(short_tags(&mission.evaluate())));
    obj.insert("gates".into(), gates_json(&packet.medops.gates));
    // `prov` and `gates` are never droppable: provenance and the safety-gate
    // locks must reach the copilot in every answer.
    Ok(fit_to_budget(obj, &["missing_channels", "playbooks"]))
}

// --- Tool 2 ------------------------------------------------------------------

fn organ_robustness(mission: &MissionState, args: &Value) -> Result<String, RpcError> {
    let organ = args
        .get("organ_system")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing organ_system"))?;
    if !ORGAN_SYSTEMS.contains(&organ) {
        return Err(RpcError::invalid_params(&format!(
            "unknown organ_system {organ}, expected one of {}",
            ORGAN_SYSTEMS.join(", ")
        )));
    }

    let report = mission.evaluate();
    let margins = organ_margins(organ, &mission.clinical(), mission.thresholds());
    let relevant: Vec<&str> = report
        .triggered_ids()
        .into_iter()
        .filter(|id| organ_of(*id) == organ)
        .map(short_tag)
        .collect();

    let mut obj = Map::new();
    obj.insert("organ_system".into(), json!(organ));
    obj.insert("rho".into(), Value::Null);
    obj.insert("sigma_1_96".into(), Value::Null);
    obj.insert("ttv_days".into(), Value::Null);
    obj.insert("rho_source".into(), json!("PENDING_ARES_NQS_STL"));
    obj.insert("margins".into(), Value::Array(margins));
    obj.insert("playbooks".into(), json!(relevant));
    obj.insert("prov".into(), json!("SIMULATED_SCENARIO_INPUT"));
    Ok(fit_to_budget(obj, &["margins", "playbooks"]))
}

/// One boundary comparison. `ok: null` means the channel is missing, so the
/// boundary cannot be verified (fail-safe, never reported as satisfied).
fn margin(key: &str, value: Option<f64>, limit: f64, safe_above: bool) -> Value {
    let ok = finite(value).map(|v| if safe_above { v >= limit } else { v <= limit });
    json!({ "k": key, "v": finite(value), "lim": limit, "ok": ok })
}

fn organ_margins(organ: &str, state: &ClinicalState, th: &ClinicalThresholds) -> Vec<Value> {
    let systolic_drop = match (
        finite(state.lbnp.baseline_systolic_bp_mmhg),
        finite(state.lbnp.current_systolic_bp_mmhg),
    ) {
        (Some(base), Some(now)) => Some(base - now),
        _ => None,
    };

    match organ {
        "CARDIOVASCULAR" => vec![
            margin(
                "hr_bpm",
                state.vitals.heart_rate_bpm,
                th.lbnp_max_heart_rate_bpm,
                false,
            ),
            margin(
                "sys_drop_mmhg",
                systolic_drop,
                th.lbnp_max_systolic_drop_mmhg,
                false,
            ),
        ],
        "VENOUS" => vec![
            margin(
                "tau_w",
                state.jugular.wall_shear_stress_dyn_cm2,
                th.stasis_wall_shear_stress_dyn_cm2,
                true,
            ),
            margin(
                "v_max",
                state.jugular.ijv_velocity_max_cm_s,
                th.stasis_velocity_max_cm_s,
                true,
            ),
        ],
        "MUSCULOSKELETAL" => vec![
            margin(
                "soleus_loss_pct",
                state.musculoskeletal.soleus_volume_loss_pct,
                th.sarcopenia_soleus_volume_loss_pct,
                false,
            ),
            margin(
                "bmd_loss_pct_mo",
                state.musculoskeletal.bmd_loss_pct_per_month,
                th.osteopenia_bmd_loss_pct_per_month,
                false,
            ),
            margin(
                "gai_pct",
                state.musculoskeletal.gait_asymmetry_index_pct,
                th.gait_asymmetry_max_pct,
                false,
            ),
        ],
        "NEURO_OCULAR" => vec![
            margin(
                "onsd_mm",
                state.neuro_ocular.optic_nerve_sheath_diameter_mm,
                th.sans_onsd_mm,
                false,
            ),
            margin(
                "ppco2_mmhg",
                state.environment.cabin_ppco2_mmhg,
                th.sans_ppco2_mmhg,
                false,
            ),
        ],
        _ => vec![margin(
            "dose_ugy_h",
            state.environment.ambient_radiation_rate_ugy_h,
            th.spe_dose_rate_ugy_h,
            false,
        )],
    }
}

/// Organ system each playbook belongs to.
fn organ_of(id: PlaybookId) -> &'static str {
    match id {
        PlaybookId::P01VenousStasisLbnp | PlaybookId::P02ConfirmedIjvThrombus => "VENOUS",
        PlaybookId::P03SarcopeniaOsteopeniaAred => "MUSCULOSKELETAL",
        PlaybookId::P04SansTranslaminarMitigation => "NEURO_OCULAR",
        PlaybookId::P05SpeRadiationShelterCans => "RADIATION",
    }
}

// --- Tool 3 ------------------------------------------------------------------

fn trigger_playbook(mission: &mut MissionState, args: &Value) -> Result<String, RpcError> {
    let raw = args
        .get("playbook_id")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing playbook_id"))?;
    let id = parse_playbook_id(raw)
        .ok_or_else(|| RpcError::invalid_params(&format!("unknown playbook_id {raw}")))?;

    let view = mission
        .activate_playbook(id)
        .ok_or_else(|| RpcError::invalid_params("playbook not compiled"))?;
    let removed: Vec<&str> = mission
        .active_decision()
        .map(|d| {
            d.interventions
                .iter()
                .flat_map(|g| g.removed_actions.iter().copied())
                .collect()
        })
        .unwrap_or_default();
    let gates = GateStatus::from_report(&mission.evaluate(), mission.thresholds());

    let mut obj = Map::new();
    obj.insert("playbook".into(), json!(short_tag(id)));
    obj.insert("step".into(), json!(view.current_step));
    obj.insert("of".into(), json!(view.total_steps));
    obj.insert(
        "do".into(),
        json!(clip(&view.step_instruction, MAX_INSTRUCTION_CHARS)),
    );
    obj.insert("gates".into(), gates_json(&gates));
    obj.insert("removed".into(), json!(removed));
    obj.insert("prov".into(), json!("DERIVED_COMPUTED"));
    Ok(fit_to_budget(obj, &["removed"]))
}

// --- Shared helpers ----------------------------------------------------------

/// Gate block named exactly as the `mcp-builder` skill specifies.
fn gates_json(gates: &GateStatus) -> Value {
    json!({
        "anticoagulation_locked": gates.anticoagulation_locked,
        "lbnp_autosafe_vent": gates.lbnp_autosafe_vent,
        "gait_suit_damping_pct": gates.gait_suit_damping_pct
    })
}

/// `PB01`..`PB05`: the playbook codes cost ~35 tokens each, the tags cost 1.
pub fn short_tag(id: PlaybookId) -> &'static str {
    match id {
        PlaybookId::P01VenousStasisLbnp => "PB01",
        PlaybookId::P02ConfirmedIjvThrombus => "PB02",
        PlaybookId::P03SarcopeniaOsteopeniaAred => "PB03",
        PlaybookId::P04SansTranslaminarMitigation => "PB04",
        PlaybookId::P05SpeRadiationShelterCans => "PB05",
    }
}

fn short_tags(report: &MedOpsReport) -> Vec<&'static str> {
    report.triggered_ids().into_iter().map(short_tag).collect()
}

/// Accepts the full `PLAYBOOK_0x_...` code or the short `PB0x` tag.
pub fn parse_playbook_id(raw: &str) -> Option<PlaybookId> {
    PlaybookId::ALL
        .iter()
        .copied()
        .find(|id| id.code() == raw || short_tag(*id) == raw)
}

/// Clips to `max` characters on a char boundary, marking the cut.
fn clip(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        None => text.to_string(),
        Some((cut, _)) => {
            let mut clipped = text[..cut].to_string();
            clipped.push_str("...");
            clipped
        }
    }
}

/// Serializes within [`MAX_RESULT_BYTES`], dropping the listed keys in order
/// until it fits and flagging the loss with `trunc`. Deterministic: the same
/// object always yields the same text.
fn fit_to_budget(mut obj: Map<String, Value>, droppable: &[&str]) -> String {
    let mut to_drop = droppable.iter();
    loop {
        let encoded = Value::Object(obj.clone()).to_string();
        if encoded.len() <= MAX_RESULT_BYTES {
            return encoded;
        }
        match to_drop.next() {
            Some(key) => {
                obj.remove(*key);
                obj.insert("trunc".into(), Value::Bool(true));
            }
            None => {
                return json!({
                    "err": "RESULT_OVER_TOKEN_BUDGET",
                    "budget_bytes": MAX_RESULT_BYTES,
                    "alarm_level": obj.get("alarm_level").cloned().unwrap_or(Value::Null)
                })
                .to_string();
            }
        }
    }
}

struct RpcError {
    code: i64,
    message: String,
}

impl RpcError {
    fn invalid_params(message: &str) -> Self {
        Self {
            code: -32602,
            message: message.to_string(),
        }
    }

    fn method_not_found(method: &str) -> Self {
        Self {
            code: -32601,
            message: format!("method not found: {method}"),
        }
    }
}

fn success_response(id: Value, result: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

fn error_response(id: Value, code: i64, message: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }).to_string()
}

#[cfg(test)]
#[allow(clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn clip_cuts_on_char_boundary() {
        assert_eq!(clip("abcdef", 3), "abc...");
        assert_eq!(clip("abc", 10), "abc");
        // Multi-byte input must not be split mid-character.
        assert_eq!(
            clip("aeiou - \u{00e0}\u{00e8}\u{00ec}", 9),
            "aeiou - \u{00e0}..."
        );
    }

    #[test]
    fn budget_keeps_small_objects_verbatim() {
        let mut obj = Map::new();
        obj.insert("alarm_level".into(), json!("NOMINAL"));
        let encoded = fit_to_budget(obj, &["alarm_level"]);
        assert_eq!(encoded, "{\"alarm_level\":\"NOMINAL\"}");
    }

    #[test]
    fn budget_drops_listed_keys_until_it_fits() {
        let mut obj = Map::new();
        obj.insert("alarm_level".into(), json!("CRITICAL"));
        obj.insert("bulk".into(), json!("x".repeat(MAX_RESULT_BYTES)));
        let encoded = fit_to_budget(obj, &["bulk"]);
        assert!(encoded.len() <= MAX_RESULT_BYTES, "{} bytes", encoded.len());
        assert!(encoded.contains("\"trunc\":true"), "{encoded}");
        assert!(encoded.contains("CRITICAL"), "{encoded}");
    }

    #[test]
    fn budget_falls_back_when_nothing_can_be_dropped() {
        let mut obj = Map::new();
        obj.insert("alarm_level".into(), json!("WARNING"));
        obj.insert("bulk".into(), json!("x".repeat(MAX_RESULT_BYTES)));
        let encoded = fit_to_budget(obj, &[]);
        assert!(encoded.len() <= MAX_RESULT_BYTES, "{} bytes", encoded.len());
        assert!(encoded.contains("RESULT_OVER_TOKEN_BUDGET"), "{encoded}");
        assert!(encoded.contains("WARNING"), "{encoded}");
    }

    #[test]
    fn playbook_ids_parse_from_code_and_short_tag() {
        for id in PlaybookId::ALL {
            assert_eq!(parse_playbook_id(id.code()), Some(id));
            assert_eq!(parse_playbook_id(short_tag(id)), Some(id));
        }
        assert_eq!(parse_playbook_id("PB99"), None);
    }
}
