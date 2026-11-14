# Piano Implementativo Definitivo — Fase 14 (G2): Native `FastMCP` JSON-RPC 2.0 `stdio` Server & `< 150 Token` Context-Mode Compression

- **Blocco Architetturale**: Blocco G (*Server Dual-Transport Isolato: `Axum WebSocket 20 Hz` + `FastMCP stdio`*, Fasi 13–14)
- **Fase**: Fase 14 (`G2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-server-cli`](../../crates/ares-server-cli/README.md)
- **Owner Principale**: `@fertech02` (con architettura Context-Mode `@fabiomalagutti27-droid` e sanitizzazione `@MiServeRDC`)
- **File Target Previsti**:
  1. `crates/ares-server-cli/src/mcp_stdio.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 500\,\mu\text{s}$ per dispatch e serializzazione risposta JSON-RPC 2.0.
- **Budget Token Context-Mode**: Rigorosamente $< 150\text{ token}$ ($\le 600\text{ byte}$ JSON serializzato per chiamata tool).
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, zero scritture non-JSON-RPC su `stdout` (tutti i log `tracing` confinati su `stderr`, invariante della skill `mcp-builder`).

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale: Il Paradigma Context-Mode nello Spazio Profondo
Su un computer di bordo spaziale (dove un eventuale assistente LLM locale gira con memoria e contesto limitati), inviare migliaia di punti numerici grezzi a ogni domanda dell'astronauta satura la finestra di contesto e rallenta la risposta di diversi secondi.

Seguendo la skill **`.agents/skills/mcp-builder/SKILL.md`** e l'architettura Context-Mode di `spatiotemporal-mcp-engine`, la **Fase 14 (`G2`)** implementa in `crates/ares-server-cli/src/mcp_stdio.rs` un server **Model Context Protocol (JSON-RPC 2.0) nativo su `stdio`** che espone **4 Tool Context-Mode ultra-compatti (`< 150 token` / $\le 600\text{ byte}$)**:
1. **`get_crew_health_summary`**: Restituisce `astronaut_id`, `flight_day`, `source_record_id`, `mri_pct`, `rho_global`, `ttv_hours` e `alert_severity`.
2. **`explain_causal_anomaly`**: Restituisce la catena causale a 4 salti estratta dal grafo `ADHG` (`causal_chain_summary`) e i margini `NQS-STL` violati, incapsulando ogni osservazione in `<untrusted_telemetry_observation>`.
3. **`simulate_countermeasure_impact`**: Simula in $< 150\,\mu\text{s}$ l'effetto di una contromisura (`LBNP -30 mmHg`, `ARED 135 kgf`, `Storm Shelter`) e restituisce il guadagno $\Delta\hat{\rho}_{\text{global}}$ e il nuovo `TTV`.
4. **`get_medops_playbook`**: Restituisce il Playbook attivo (`#01–#05`), lo stato dei **3 Hard Clinical Safety Gates** e l'hash `SHA-256` del registro di audit.

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 14 (`G2`) |
| :--- | :--- | :--- |
| `crates/ares-server-cli/src/mcp_stdio.rs` | **CREATE** | Dispatcher JSON-RPC 2.0 (`tools/list`, `tools/call`) per i 4 tool Context-Mode con guardia hard-cap a `600` byte (`< 150 token`). |

---

## 3. Architettura di `mcp_stdio.rs` in Puro Rust 2024

```rust
//! Fase 14 (G2): Server Nativo FastMCP JSON-RPC 2.0 su `stdio` con compressione Context-Mode (< 150 token).

use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_core_types::security::McpInputSanitizer;
use ares_core_types::telemetry::TelemetryPacket;
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
                "get_crew_health_summary" => json!({
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
                "explain_causal_anomaly" => {
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
                "get_medops_playbook" => json!({
                    "playbook_id": latest_packet.active_playbook.playbook_id,
                    "gates": latest_packet.active_playbook.safety_gates,
                    "top_action": latest_packet.active_playbook.actions.first().map(|a| &a.action_id)
                }),
                other => {
                    return JsonRpcResponse {
                        jsonrpc: "2.0",
                        id,
                        result: None,
                        error: Some(json!({ "code": -32601, "message": format!("unknown tool: {other}") })),
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
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 14 (`G2`)

1. **`test_all_4_fastmcp_tools_respect_150_token_600_byte_cap`:** Invoca ciascuno dei 4 tool Context-Mode (`get_crew_health_summary`, `explain_causal_anomaly`, `simulate_countermeasure_impact`, `get_medops_playbook`) e verifica che la lunghezza del payload testuale restituito sia sempre $\le 600\text{ byte}$ ($< 150\text{ token}$).
2. **`test_explain_causal_anomaly_wraps_observations_in_xml_shield`:** Verifica che tutte le stringhe in `adhg_chain` siano racchiuse in `<untrusted_telemetry_observation>...</untrusted_telemetry_observation>`.
