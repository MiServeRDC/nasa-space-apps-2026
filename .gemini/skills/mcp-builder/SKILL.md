---
name: mcp-builder
description: Official architecture and best practices for building the ARES-Health Model Context Protocol (FastMCP) server in Safe Rust with JSON-RPC 2.0, async tools, and <150-token Context-Mode compression.
triggers:
  - build mcp server
  - model context protocol
  - fastmcp tools
  - json-rpc 2.0 framing
  - context-mode payload
  - ares-server-cli mcp
---

# MCP Builder: High-Performance Model Context Protocol Architecture (ARES-Health)

This skill guides the design, implementation, and verification of the native Rust Model Context Protocol (`FastMCP`) server inside `crates/ares-server-cli`. It enforces JSON-RPC 2.0 compliance, transport isolation from the `axum` WebSocket UI stream, and strict `< 150 token` Context-Mode compression so the on-board quantized LLM copilot never hallucinates.

## 1. Dual-Transport Isolation Invariant
1. **Transport 1 — `axum` HTTP/WebSocket (`127.0.0.1:8080`):** Dedicated to `ares-cockpit` UI streaming and `< 1 ms` What-If Stress-Test Console updates.
2. **Transport 2 — `stdio` JSON-RPC 2.0 (`FastMCP`):**
   - Reads newline-delimited JSON-RPC 2.0 requests from `stdin`.
   - Writes JSON-RPC 2.0 responses strictly to `stdout`.
   - **CRITICAL:** All `tracing` or diagnostic logs MUST be routed to `stderr` (`tracing_subscriber::fmt().with_writer(std::io::stderr)`). Writing any non-JSON text to `stdout` corrupts the MCP pipe.

## 2. Context-Mode Compression Invariant (`< 150 Tokens`)
The local edge LLM must never receive raw `125 Hz` / `1 Hz` waveform arrays or perform raw arithmetic diagnosis:
1. All differential equations (Frost-Hargens ODEs, dimensional wall shear stress $\tau_w$, NQS-STL robustness $\hat{\rho}_k$) and safety gates are computed deterministically in Safe Rust (`crates/ares-causal-graph`, `crates/ares-nqs-stl`, `crates/ares-medops-playbooks`).
2. Every MCP tool response must be a compact semantic JSON summary strictly bounded under **150 tokens** and executing in **< 50 microseconds**, always including explicit `data_provenance` (`RECORDED_TERRESTRIAL_BIDMC_CSV`, `DERIVED_COMPUTED`, or `SIMULATED_SCENARIO_INPUT`).

## 3. Canonical ARES-Health MCP Macro-Tools
1. `get_astronaut_health_summary(astronaut_id)`: Returns `MRI` (0-100), `alarm_level`, `missing_channels`, and active `provenance_manifest`.
2. `query_organ_robustness(organ_system)`: Returns NQS-STL $\hat{\rho}_k \in (-\infty, +1.0]$, Bayesian uncertainty $\pm 1.96\,\sigma_k$, and `time_to_violation_days` (or `null` during 8-minute terrestrial BIDMC replay).
3. `trigger_medops_action_playbook(playbook_id)`: Returns current deterministic step instruction and the lock status of the 3 Hard Clinical Safety Gates (`anticoagulation_locked`, `lbnp_autosafe_vent`, `gait_suit_damping_pct`).
