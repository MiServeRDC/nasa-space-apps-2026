//! Phase 32 (L4): Air-gapped asynchronous Edge LLM bridge (`Ollama` `/api/chat` and
//! `llama.cpp` `/v1/chat/completions`) over `tokio::net::TcpStream` with 8-tool `FastMCP`
//! Context-Mode loop (`<= 600 B`), `StrictMcpSanitizer` XML spotlighting, Gate 1-3 & Issue #11
//! post-generation verification, and deterministic `< 400 us` Type-1 fallback (`OfflineTemplateCopilot`).

use crate::fastmcp_router::{JsonRpcRequest, handle_fastmcp_jsonrpc_request};
use crate::ws_server::FastMcpRuntimeContext;
use ares_core_types::error::AresCoreError;
use ares_core_types::security::{CrewRole, McpInputSanitizer, MedOpsAuditLogger};
use ares_core_types::telemetry::{HrvUnavailableReason, ModelValidationStatus, SafetyGates};
use ares_security_privacy::audit_chain::Sha256AuditLogger;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::{Duration, Instant};
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// Hard non-negotiable end-to-end latency deadline for local Edge LLM turns.
pub const HARD_MAX_EDGE_LLM_TIMEOUT_MS: u64 = 2_500;

/// Maximum number of tool-calling rounds per crew query.
pub const MAX_FASTMCP_TOOL_ROUNDS: usize = 2;

/// Closed allowlist of the 8 read-only FastMCP Context-Mode tools.
pub const ALLOWED_FASTMCP_TOOLS: [&str; 8] = [
    "get_crew_health_summary",
    "explain_causal_anomaly",
    "simulate_countermeasure_impact",
    "get_medops_playbook",
    "query_dataset_graph",
    "explain_biomarker_path",
    "get_timestral_quantile_cones",
    "get_hypergraph_spatial_status",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EdgeLlmWireProtocol {
    /// Native Ollama chat API (`POST /api/chat`).
    OllamaChat,
    /// OpenAI-compatible `llama.cpp` `llama-server` API (`POST /v1/chat/completions`).
    LlamaCppOpenAiCompat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EdgeLlmConfig {
    /// Defaults to `"http://127.0.0.1:11434"`, overridable via `MACMINI_LLM_URL`.
    pub endpoint_url: String,
    pub protocol: EdgeLlmWireProtocol,
    pub model_tag: String,
    /// Explicitly permits RFC1918 habitat LAN subnets (e.g. dedicated Mac mini compute node).
    pub allow_rfc1918_lan: bool,
    /// When `true`, skips TCP I/O and executes `OfflineTemplateCopilot` directly (`< 400 us`).
    pub force_offline_template: bool,
    /// Structurally capped to `<= HARD_MAX_EDGE_LLM_TIMEOUT_MS` (`2500 ms`).
    pub timeout_ms: u64,
}

impl Default for EdgeLlmConfig {
    fn default() -> Self {
        let env_url = std::env::var("MACMINI_LLM_URL").ok();
        let allow_lan = env_url.is_some()
            || std::env::var("ARES_ALLOW_HABITAT_LAN")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
        Self {
            endpoint_url: env_url.unwrap_or_else(|| "http://127.0.0.1:11434".to_string()),
            protocol: EdgeLlmWireProtocol::OllamaChat,
            model_tag: "llama3.2:3b-instruct-q4_K_M".to_string(),
            allow_rfc1918_lan: allow_lan,
            force_offline_template: false,
            timeout_ms: 2_200,
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq)]
pub enum EdgeCopilotError {
    #[error("security / prompt sanitizer violation: {0}")]
    PromptSanitizer(#[from] AresCoreError),

    #[error("air-gap policy violation on endpoint '{endpoint}': {reason}")]
    AirGapViolation {
        endpoint: String,
        reason: &'static str,
    },

    #[error("local LLM transport error: {reason}")]
    Transport { reason: String },

    #[error("local LLM exceeded hard deadline of {timeout_ms} ms")]
    DeadlineExceeded { timeout_ms: u64 },

    #[error("disallowed FastMCP tool requested by model: {tool_name}")]
    DisallowedTool { tool_name: String },

    #[error("clinical safety gate invariant violated in generated text: {reason}")]
    SafetyBoundaryViolation { reason: &'static str },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CopilotExecutionMode {
    LocalEdgeLlm,
    DeterministicType1Fallback,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CopilotFallbackReason {
    OfflineModeConfigured,
    LlmUnreachable,
    DeadlineExceeded,
    InvalidModelResponse,
    SafetyGateViolationBlocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CopilotToolTrace {
    pub tool: String,
    pub latency_us: u64,
    pub byte_len: usize,
    #[serde(default)]
    pub wrapped_untrusted_xml: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CopilotAskRequest {
    #[serde(alias = "prompt")]
    pub query: String,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub preferred_tool_hint: Option<String>,
    #[serde(default)]
    pub what_if_active: bool,
    #[serde(default)]
    pub hands_free_concise: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CopilotAskResponse {
    pub answer_markdown: String,
    pub spoken_summary: String,
    pub execution_mode: CopilotExecutionMode,
    pub fallback_reason: Option<CopilotFallbackReason>,
    pub tools_invoked: Vec<CopilotToolTrace>,
    pub active_playbook_id: String,
    pub authoritative_safety_gates: SafetyGates,
    pub normative_clause: String,
    pub hrv_unavailable_reason: Option<HrvUnavailableReason>,
    pub model_validation_status: ModelValidationStatus,
    pub validation_disclosure: String,
    pub audit_hash_hex: String,
    pub total_latency_us: u64,
}

/// Statically validates an `http://IP:PORT/path` URL without performing external DNS resolution.
/// Permits loopback (`127.0.0.0/8`, `::1`, literal `localhost`) and optional RFC1918 LAN IPs.
pub fn validate_airgapped_socket_addr(
    endpoint_url: &str,
    allow_rfc1918_lan: bool,
) -> Result<(SocketAddr, String), EdgeCopilotError> {
    let trimmed = endpoint_url.trim();
    let rest = trimmed
        .strip_prefix("http://")
        .ok_or_else(|| EdgeCopilotError::AirGapViolation {
            endpoint: trimmed.to_string(),
            reason: "only plain http:// loopback or local air-gapped enclave LAN is permitted",
        })?;

    let (host_port, path) = match rest.find('/') {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        None => (rest, ""),
    };

    if host_port.contains('@') {
        return Err(EdgeCopilotError::AirGapViolation {
            endpoint: trimmed.to_string(),
            reason: "embedded URL credentials are forbidden",
        });
    }

    let (host_str, port_str) =
        host_port
            .rsplit_once(':')
            .ok_or_else(|| EdgeCopilotError::AirGapViolation {
                endpoint: trimmed.to_string(),
                reason: "explicit port in [1024, 65535] is required",
            })?;

    let port: u16 = port_str
        .parse()
        .map_err(|_| EdgeCopilotError::AirGapViolation {
            endpoint: trimmed.to_string(),
            reason: "invalid TCP port",
        })?;
    if port < 1024 {
        return Err(EdgeCopilotError::AirGapViolation {
            endpoint: trimmed.to_string(),
            reason: "privileged TCP ports < 1024 are disallowed",
        });
    }

    let trimmed_host = host_str.trim_start_matches('[').trim_end_matches(']');
    let ip: IpAddr = if trimmed_host.eq_ignore_ascii_case("localhost") {
        IpAddr::V4(Ipv4Addr::LOCALHOST)
    } else {
        trimmed_host
            .parse::<IpAddr>()
            .map_err(|_| EdgeCopilotError::AirGapViolation {
                endpoint: trimmed.to_string(),
                reason: "arbitrary DNS hostnames are forbidden; use 127.0.0.1 or explicit RFC1918 IP",
            })?
    };

    let is_allowed = match ip {
        IpAddr::V4(v4) => {
            !v4.is_unspecified()
                && !v4.is_multicast()
                && !v4.is_link_local()
                && (v4.is_loopback() || (allow_rfc1918_lan && v4.is_private()))
        }
        IpAddr::V6(v6) => {
            let is_ula = (v6.segments()[0] & 0xfe00) == 0xfc00;
            !v6.is_unspecified()
                && !v6.is_multicast()
                && (v6.is_loopback() || (allow_rfc1918_lan && is_ula))
        }
    };

    if !is_allowed {
        return Err(EdgeCopilotError::AirGapViolation {
            endpoint: trimmed.to_string(),
            reason: "IP address is outside loopback and authorized RFC1918 habitat LAN",
        });
    }

    Ok((SocketAddr::new(ip, port), path.to_string()))
}

/// Post-generation clinical invariant checker:
/// 1. Rejects systemic anticoagulant recommendations while Hard Safety Gate 1 is active
///    without an explicit lockout notice.
/// 2. Rejects fabricated numeric RMSSD in `ms` while `BeatIntervalsNotAvailable`.
pub fn verify_copilot_clinical_invariants(
    candidate_text: &str,
    ctx: &FastMcpRuntimeContext,
) -> Result<(), EdgeCopilotError> {
    let lower = candidate_text.to_ascii_lowercase();
    let gates = ctx.latest_packet.active_playbook.safety_gates;

    if gates.anticoagulant_lock_active {
        let mentions_anticoag = ["enoxaparin", "apixaban", "heparin", "warfarin", "dalteparin"]
            .iter()
            .any(|drug| lower.contains(drug));
        let states_locked = lower.contains("locked")
            || lower.contains("blocc")
            || lower.contains("prohibited")
            || lower.contains("do not administer")
            || lower.contains("contraindicated")
            || lower.contains("vietat");
        if mentions_anticoag && !states_locked {
            return Err(EdgeCopilotError::SafetyBoundaryViolation {
                reason: "Hard Safety Gate 1 active: systemic anticoagulants mentioned without explicit lockout notice",
            });
        }
    }

    if ctx.latest_packet.biometrics.hrv_unavailable_reason
        == Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        && lower.contains("rmssd")
        && (lower.contains(" ms") || lower.contains("ms)"))
        && !lower.contains("unavailable")
        && !lower.contains("null")
        && !lower.contains("beat_intervals_not_available")
    {
        return Err(EdgeCopilotError::SafetyBoundaryViolation {
            reason: "Issue #11 invariant: numeric RMSSD in ms fabricated while BEAT_INTERVALS_NOT_AVAILABLE",
        });
    }

    Ok(())
}

/// Truncates a spoken summary cleanly to `max_words` for microgravity TTS clarity.
pub fn truncate_spoken_words(text: &str, max_words: usize) -> String {
    let cleaned = text.replace(['*', '#', '`', '_', '~'], " ");
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    if words.len() <= max_words {
        return words.join(" ");
    }
    let prefix = words[..max_words].join(" ");
    format!("{prefix}.")
}

/// Deterministic Type-1 synthesizer (`< 400 us`): formats grounded clinical summaries directly
/// from the 8 FastMCP Context-Mode JSON payloads (`<= 600 B` each).
pub struct OfflineTemplateCopilot;

impl OfflineTemplateCopilot {
    /// Plans up to 3 read-only FastMCP tools relevant to the sanitized query.
    pub fn select_tools_for_query(
        sanitized_query: &str,
        hint: Option<&str>,
    ) -> Vec<(&'static str, Value)> {
        if let Some(h) = hint
            && let Some(&matched) = ALLOWED_FASTMCP_TOOLS.iter().find(|&&t| t == h)
        {
            return vec![(matched, json!({})), ("get_medops_playbook", json!({}))];
        }
        let q = sanitized_query.to_ascii_lowercase();
        let mut selected = vec![("get_crew_health_summary", json!({}))];
        if q.contains("cone")
            || q.contains("quantile")
            || q.contains("timestral")
            || q.contains("ttv")
        {
            selected.push(("get_timestral_quantile_cones", json!({})));
        } else if q.contains("osd-")
            || q.contains("dataset")
            || q.contains("spoke")
            || q.contains("bidmc")
        {
            let kw = if q.contains("osd-818") {
                "OSD-818"
            } else if q.contains("osd-195") {
                "OSD-195"
            } else {
                "OSD-51"
            };
            selected.push(("query_dataset_graph", json!({ "query": kw })));
        } else if q.contains("path") || q.contains("sost") || q.contains("osteopenia") {
            selected.push((
                "explain_biomarker_path",
                json!({ "from": "OSD-51", "to": "pheno_osteopenia" }),
            ));
        } else if q.contains("zone")
            || q.contains("shelter")
            || q.contains("eva")
            || q.contains("heatmap")
        {
            selected.push(("get_hypergraph_spatial_status", json!({})));
        } else if q.contains("lbnp") || q.contains("ared") || q.contains("countermeasure") {
            selected.push(("simulate_countermeasure_impact", json!({})));
        } else if q.contains("causal")
            || q.contains("shear")
            || q.contains("tau")
            || q.contains("ijv")
        {
            selected.push(("explain_causal_anomaly", json!({})));
        }
        selected.push(("get_medops_playbook", json!({})));
        selected.truncate(3);
        selected
    }

    /// Executes the planned FastMCP tools in-process and synthesizes Markdown + spoken summary.
    pub fn synthesize(
        sanitized_query: &str,
        hint: Option<&str>,
        ctx: &FastMcpRuntimeContext,
        sanitizer: &StrictMcpSanitizer,
    ) -> (String, String, Vec<CopilotToolTrace>) {
        let planned = Self::select_tools_for_query(sanitized_query, hint);
        let mut traces = Vec::with_capacity(planned.len());
        for (idx, (tool_name, args)) in planned.into_iter().enumerate() {
            let trace = invoke_allowlisted_tool(tool_name, args, idx + 1, ctx, sanitizer);
            if let Ok(t) = trace {
                traces.push(t);
            }
        }

        let pkt = &ctx.latest_packet;
        let gates = pkt.active_playbook.safety_gates;
        let hrv_note = match pkt.biometrics.hrv_unavailable_reason {
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable) => {
                "UNAVAILABLE (BEAT_INTERVALS_NOT_AVAILABLE)"
            }
            None => "OBSERVED",
        };
        let markdown = format!(
            "**[TYPE-1 DETERMINISTIC COPILOT | ILLUSTRATIVE_UNVALIDATED]**\n\
             - **Subject / Replay**: `{}` (`{}`, `t = {:.1} s`, FD `{}`)\n\
             - **Severity & Margins**: `{:?}` | `tau_w = {:.2} dyn/cm^2` (`rho_tau_w = {:.2}`) | `HRV`: `{}`\n\
             - **Active Playbook**: `{}` (Clause `{}`)\n\
             - **Hard Safety Gates**: Gate1 Anticoag Lock=`{}` | Gate2 LBNP Auto-Vent=`{}` | Gate3 EVA Damping=`{}`",
            pkt.astronaut_id,
            pkt.source_record_id,
            pkt.relative_recording_time_s,
            pkt.flight_day,
            pkt.alert_severity,
            pkt.jugular_hemodynamics.tau_w_dyn_cm2,
            pkt.nqs_stl.rho_tau_w,
            hrv_note,
            pkt.active_playbook.playbook_id,
            ctx.grounding.normative_clause.official_code(),
            gates.anticoagulant_lock_active,
            gates.lbnp_auto_vent_armed,
            gates.eva_suit_damping_active,
        );
        let spoken = truncate_spoken_words(
            &format!(
                "Deterministic status {:?}. Active playbook {}. Anticoagulant lock {}. Scenario model illustrative unvalidated.",
                pkt.alert_severity,
                pkt.active_playbook.playbook_id,
                if gates.anticoagulant_lock_active {
                    "engaged"
                } else {
                    "open"
                }
            ),
            25,
        );
        (markdown, spoken, traces)
    }
}

fn invoke_allowlisted_tool(
    tool_name: &str,
    args: Value,
    call_id: usize,
    ctx: &FastMcpRuntimeContext,
    sanitizer: &StrictMcpSanitizer,
) -> Result<CopilotToolTrace, EdgeCopilotError> {
    if !ALLOWED_FASTMCP_TOOLS.contains(&tool_name) {
        return Err(EdgeCopilotError::DisallowedTool {
            tool_name: tool_name.to_string(),
        });
    }
    let t0 = Instant::now();
    let req = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: Some(json!(call_id)),
        method: "tools/call".to_string(),
        params: json!({ "name": tool_name, "arguments": args }),
    };
    let resp = handle_fastmcp_jsonrpc_request(&req, ctx, sanitizer);
    let raw_text = resp
        .result
        .as_ref()
        .and_then(|r| r["content"][0]["text"].as_str())
        .unwrap_or("{}");
    Ok(CopilotToolTrace {
        tool: tool_name.to_string(),
        latency_us: t0.elapsed().as_micros() as u64,
        byte_len: raw_text.len(),
        wrapped_untrusted_xml: sanitizer.wrap_untrusted_observation(raw_text),
    })
}

fn fastmcp_tools_schema() -> Vec<Value> {
    ALLOWED_FASTMCP_TOOLS
        .iter()
        .map(|name| {
            json!({
                "type": "function",
                "function": {
                    "name": name,
                    "description": "Read-only ARES-Health FastMCP Context-Mode telemetry tool (<= 600 bytes).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string" },
                            "from": { "type": "string" },
                            "to": { "type": "string" }
                        }
                    }
                }
            })
        })
        .collect()
}

fn system_prompt_for_ctx(ctx: &FastMcpRuntimeContext, concise: bool) -> String {
    let length_note = if concise {
        "Keep answer under 60 words for hands-free EVA/POCUS audio."
    } else {
        "Keep answer concise and cite normative clauses."
    };
    format!(
        "You are the ARES-MedOS Air-Gapped Clinical Copilot (Advisory DAL-E). \
         Use ONLY facts observed inside <untrusted_telemetry_observation> tool outputs. \
         Do NOT fabricate missing HRV/RMSSD metrics when BEAT_INTERVALS_NOT_AVAILABLE. \
         Do NOT recommend systemic anticoagulants (enoxaparin, apixaban, heparin, warfarin) \
         unless Gate 1 anticoagulant_lock_active is explicitly false; if locked, state LOCKED. \
         Active playbook: {}. Model status: ILLUSTRATIVE_UNVALIDATED. {}",
        ctx.latest_packet.active_playbook.playbook_id, length_note
    )
}

fn parse_tool_arguments(raw_args: &Value) -> Value {
    match raw_args {
        Value::Object(_) => raw_args.clone(),
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({})),
        _ => json!({}),
    }
}

fn decode_chunked_body(raw: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos < raw.len() {
        let rel_end = raw[pos..].windows(2).position(|w| w == b"\r\n")?;
        let size_line = std::str::from_utf8(&raw[pos..pos + rel_end]).ok()?;
        let hex_part = size_line.split(';').next().unwrap_or("").trim();
        let chunk_len = usize::from_str_radix(hex_part, 16).ok()?;
        pos += rel_end + 2;
        if chunk_len == 0 {
            return Some(out);
        }
        if pos + chunk_len > raw.len() {
            return None;
        }
        out.extend_from_slice(&raw[pos..pos + chunk_len]);
        pos += chunk_len;
        if pos + 2 <= raw.len() && &raw[pos..pos + 2] == b"\r\n" {
            pos += 2;
        }
    }
    Some(out)
}

async fn post_local_http_json(
    addr: SocketAddr,
    base_path: &str,
    endpoint_suffix: &str,
    payload: &Value,
) -> Result<(u16, Value), EdgeCopilotError> {
    let mut stream = TcpStream::connect(addr)
        .await
        .map_err(|e| EdgeCopilotError::Transport {
            reason: e.to_string(),
        })?;

    let target_path = if base_path.is_empty() || base_path == "/" {
        endpoint_suffix.to_string()
    } else {
        format!("{}{}", base_path.trim_end_matches('/'), endpoint_suffix)
    };
    let body_bytes = serde_json::to_vec(payload).map_err(|e| EdgeCopilotError::Transport {
        reason: e.to_string(),
    })?;

    let req_head = format!(
        "POST {target_path} HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body_bytes.len()
    );
    let mut full_req = Vec::with_capacity(req_head.len() + body_bytes.len());
    full_req.extend_from_slice(req_head.as_bytes());
    full_req.extend_from_slice(&body_bytes);
    stream
        .write_all(&full_req)
        .await
        .map_err(|e| EdgeCopilotError::Transport {
            reason: e.to_string(),
        })?;
    let _ = stream.flush().await;

    let mut raw_buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 2048];
    let mut header_end_idx: Option<usize> = None;
    let mut content_length: Option<usize> = None;
    let mut is_chunked = false;

    loop {
        let n = stream
            .read(&mut chunk)
            .await
            .map_err(|e| EdgeCopilotError::Transport {
                reason: e.to_string(),
            })?;
        if n == 0 {
            break;
        }
        raw_buf.extend_from_slice(&chunk[..n]);
        if raw_buf.len() > 512 * 1024 {
            return Err(EdgeCopilotError::Transport {
                reason: "local LLM HTTP response exceeded 512 KB cap".to_string(),
            });
        }
        if header_end_idx.is_none()
            && let Some(pos) = raw_buf.windows(4).position(|w| w == b"\r\n\r\n")
        {
            let h_end = pos + 4;
            header_end_idx = Some(h_end);
            let header_str = String::from_utf8_lossy(&raw_buf[..pos]);
            for line in header_str.lines().skip(1) {
                if let Some((k, v)) = line.split_once(':') {
                    let key_lower = k.trim().to_ascii_lowercase();
                    if key_lower == "content-length" {
                        content_length = v.trim().parse::<usize>().ok();
                    } else if key_lower == "transfer-encoding"
                        && v.to_ascii_lowercase().contains("chunked")
                    {
                        is_chunked = true;
                    }
                }
            }
        }
        if let Some(h_end) = header_end_idx {
            if let Some(cl) = content_length
                && raw_buf.len() >= h_end + cl
            {
                break;
            }
            if is_chunked && raw_buf[h_end..].windows(5).any(|w| w == b"0\r\n\r\n") {
                break;
            }
        }
    }

    let h_end = header_end_idx.ok_or_else(|| EdgeCopilotError::Transport {
        reason: "incomplete HTTP response headers".to_string(),
    })?;
    let status_line = String::from_utf8_lossy(&raw_buf[..h_end])
        .lines()
        .next()
        .unwrap_or("")
        .to_string();
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(500);

    let raw_body = if let Some(cl) = content_length {
        let end = (h_end + cl).min(raw_buf.len());
        raw_buf[h_end..end].to_vec()
    } else if is_chunked {
        decode_chunked_body(&raw_buf[h_end..]).ok_or_else(|| EdgeCopilotError::Transport {
            reason: "malformed chunked HTTP body".to_string(),
        })?
    } else {
        raw_buf[h_end..].to_vec()
    };

    let parsed: Value =
        serde_json::from_slice(&raw_body).map_err(|e| EdgeCopilotError::Transport {
            reason: format!("invalid JSON from local LLM (HTTP {status_code}): {e}"),
        })?;
    Ok((status_code, parsed))
}

#[derive(Debug)]
struct ExtractedLlmMessage {
    content: String,
    tool_calls: Vec<(Option<String>, String, Value)>,
}

fn extract_llm_message(
    protocol: EdgeLlmWireProtocol,
    resp_json: &Value,
) -> Result<ExtractedLlmMessage, EdgeCopilotError> {
    let msg_val = match protocol {
        EdgeLlmWireProtocol::OllamaChat => resp_json.get("message"),
        EdgeLlmWireProtocol::LlamaCppOpenAiCompat => resp_json
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .and_then(|c| c.get("message")),
    }
    .ok_or_else(|| EdgeCopilotError::Transport {
        reason: "missing assistant message in local LLM JSON response".to_string(),
    })?;

    let content = msg_val
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let mut tool_calls = Vec::new();
    if let Some(arr) = msg_val.get("tool_calls").and_then(Value::as_array) {
        for tc in arr {
            let call_id = tc.get("id").and_then(Value::as_str).map(str::to_string);
            let func = tc.get("function").unwrap_or(tc);
            let name = func
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let args = func.get("arguments").map(parse_tool_arguments).unwrap_or_else(|| json!({}));
            if !name.is_empty() {
                tool_calls.push((call_id, name, args));
            }
        }
    }

    Ok(ExtractedLlmMessage {
        content,
        tool_calls,
    })
}

async fn run_local_http_tool_loop(
    addr: SocketAddr,
    base_path: &str,
    clean_query: &str,
    req: &CopilotAskRequest,
    ctx: &FastMcpRuntimeContext,
    config: &EdgeLlmConfig,
    sanitizer: &StrictMcpSanitizer,
) -> Result<(String, Vec<CopilotToolTrace>), EdgeCopilotError> {
    let tools_json = fastmcp_tools_schema();
    let mut messages = vec![
        json!({
            "role": "system",
            "content": system_prompt_for_ctx(ctx, req.hands_free_concise),
        }),
        json!({
            "role": "user",
            "content": clean_query,
        }),
    ];
    let mut traces = Vec::new();
    let mut call_seq = 1usize;

    let endpoint_suffix = match config.protocol {
        EdgeLlmWireProtocol::OllamaChat => "/api/chat",
        EdgeLlmWireProtocol::LlamaCppOpenAiCompat => "/v1/chat/completions",
    };

    for _round in 0..=MAX_FASTMCP_TOOL_ROUNDS {
        let body = match config.protocol {
            EdgeLlmWireProtocol::OllamaChat => json!({
                "model": config.model_tag,
                "messages": messages,
                "tools": tools_json,
                "stream": false,
                "options": { "temperature": 0.1 }
            }),
            EdgeLlmWireProtocol::LlamaCppOpenAiCompat => json!({
                "model": config.model_tag,
                "messages": messages,
                "tools": tools_json,
                "stream": false,
                "temperature": 0.1
            }),
        };

        let (status, resp_json) =
            post_local_http_json(addr, base_path, endpoint_suffix, &body).await?;
        if !(200..300).contains(&status) {
            return Err(EdgeCopilotError::Transport {
                reason: format!("local LLM returned HTTP {status}"),
            });
        }

        let extracted = extract_llm_message(config.protocol, &resp_json)?;
        if extracted.tool_calls.is_empty() {
            let trimmed = extracted.content.trim();
            if trimmed.is_empty() {
                return Err(EdgeCopilotError::Transport {
                    reason: "local LLM returned empty assistant content".to_string(),
                });
            }
            verify_copilot_clinical_invariants(trimmed, ctx)?;
            return Ok((trimmed.to_string(), traces));
        }

        messages.push(json!({
            "role": "assistant",
            "content": extracted.content,
            "tool_calls": extracted.tool_calls.iter().map(|(id, name, args)| {
                json!({
                    "id": id.clone().unwrap_or_else(|| format!("call_{name}")),
                    "type": "function",
                    "function": { "name": name, "arguments": args }
                })
            }).collect::<Vec<Value>>()
        }));

        for (call_id, tool_name, args) in extracted.tool_calls {
            let trace = invoke_allowlisted_tool(&tool_name, args, call_seq, ctx, sanitizer)?;
            call_seq += 1;
            let obs_xml = trace.wrapped_untrusted_xml.clone();
            traces.push(trace);
            let mut tool_msg = json!({
                "role": "tool",
                "name": tool_name,
                "content": obs_xml,
            });
            if let Some(id_str) = call_id
                && let Some(obj) = tool_msg.as_object_mut()
            {
                obj.insert("tool_call_id".to_string(), Value::String(id_str));
            }
            messages.push(tool_msg);
        }
    }

    Err(EdgeCopilotError::Transport {
        reason: "local LLM exceeded MAX_FASTMCP_TOOL_ROUNDS without final answer".to_string(),
    })
}

/// Executes an Edge Copilot turn with air-gap validation, sanitizer isolation, bounded
/// local LLM tool-calling (`<= 2500 ms`), clinical invariant verification, and deterministic
/// Type-1 fallback (`OfflineTemplateCopilot`).
pub async fn execute_edge_copilot_turn(
    req: &CopilotAskRequest,
    ctx: &FastMcpRuntimeContext,
    config: &EdgeLlmConfig,
    audit_logger: &Sha256AuditLogger,
) -> Result<CopilotAskResponse, EdgeCopilotError> {
    let started = Instant::now();
    let sanitizer = StrictMcpSanitizer;
    let clean_query = sanitizer.sanitize_mcp_query(&req.query)?;
    if clean_query.trim().is_empty() {
        return Err(EdgeCopilotError::PromptSanitizer(
            AresCoreError::SecurityViolation {
                reason: "empty copilot query rejected".to_string(),
            },
        ));
    }
    if clean_query
        .to_ascii_lowercase()
        .contains("</untrusted_telemetry_observation>")
    {
        return Err(EdgeCopilotError::PromptSanitizer(
            AresCoreError::SecurityViolation {
                reason: "xml delimiter breakout sequence rejected".to_string(),
            },
        ));
    }

    let mut fallback_reason = Some(CopilotFallbackReason::OfflineModeConfigured);
    let mut execution_mode = CopilotExecutionMode::DeterministicType1Fallback;
    let mut llm_result: Option<(String, Vec<CopilotToolTrace>)> = None;

    if !config.force_offline_template {
        let (addr, base_path) =
            validate_airgapped_socket_addr(&config.endpoint_url, config.allow_rfc1918_lan)?;
        let budget_ms = config.timeout_ms.clamp(50, HARD_MAX_EDGE_LLM_TIMEOUT_MS);
        let fut = run_local_http_tool_loop(
            addr,
            &base_path,
            &clean_query,
            req,
            ctx,
            config,
            &sanitizer,
        );
        match tokio::time::timeout(Duration::from_millis(budget_ms), fut).await {
            Ok(Ok((answer, traces))) => {
                execution_mode = CopilotExecutionMode::LocalEdgeLlm;
                fallback_reason = None;
                llm_result = Some((answer, traces));
            }
            Ok(Err(EdgeCopilotError::SafetyBoundaryViolation { .. })) => {
                let _ = audit_logger.append_audit_event(
                    CrewRole::CrewMedicalOfficer,
                    "EDGE_COPILOT_SAFETY_GATE_VIOLATION_BLOCKED",
                );
                fallback_reason = Some(CopilotFallbackReason::SafetyGateViolationBlocked);
            }
            Ok(Err(EdgeCopilotError::DisallowedTool { .. })) => {
                fallback_reason = Some(CopilotFallbackReason::InvalidModelResponse);
            }
            Ok(Err(EdgeCopilotError::Transport { .. })) => {
                fallback_reason = Some(CopilotFallbackReason::LlmUnreachable);
            }
            Ok(Err(_)) => {
                fallback_reason = Some(CopilotFallbackReason::InvalidModelResponse);
            }
            Err(_) => {
                fallback_reason = Some(CopilotFallbackReason::DeadlineExceeded);
            }
        }
    }

    let (answer_markdown, spoken_summary, tools_invoked) = match llm_result {
        Some((answer, traces)) => {
            let spoken = truncate_spoken_words(&answer, 25);
            (answer, spoken, traces)
        }
        None => OfflineTemplateCopilot::synthesize(
            &clean_query,
            req.preferred_tool_hint.as_deref(),
            ctx,
            &sanitizer,
        ),
    };

    let audit_action = match execution_mode {
        CopilotExecutionMode::LocalEdgeLlm => "EDGE_COPILOT_LOCAL_LLM_TURN",
        CopilotExecutionMode::DeterministicType1Fallback => "EDGE_COPILOT_QUERY_SYNTHESIZED",
    };
    let audit_hash_hex = audit_logger
        .append_audit_event(CrewRole::CrewMedicalOfficer, audit_action)
        .map(|rec| rec.current_hash_hex)
        .unwrap_or_default();

    Ok(CopilotAskResponse {
        answer_markdown,
        spoken_summary,
        execution_mode,
        fallback_reason,
        tools_invoked,
        active_playbook_id: ctx.latest_packet.active_playbook.playbook_id.clone(),
        authoritative_safety_gates: ctx.latest_packet.active_playbook.safety_gates,
        normative_clause: ctx.grounding.normative_clause.official_code().to_string(),
        hrv_unavailable_reason: ctx.latest_packet.biometrics.hrv_unavailable_reason,
        model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        validation_disclosure:
            "ILLUSTRATIVE_UNVALIDATED: scenario and forecast outputs are not clinically validated; deterministic Rust safety gates remain authoritative."
                .to_string(),
        audit_hash_hex,
        total_latency_us: started.elapsed().as_micros() as u64,
    })
}
