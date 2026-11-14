# `ares-server-cli` — Dual-Transport Tokio Orchestrator (`axum` $20\text{ Hz}$ WebSocket + `stdio` FastMCP)

**Assigned Owner:** `@fertech02` (`work/fertech02`)  

## Scope
1. Concurrent `tokio` runtime managing shared mission state (`Arc<RwLock<MissionState>>`).
2. **`axum` Loopback Server (`127.0.0.1:8080`):** Streams $20\text{ Hz}$ `AstronautTelemetryFrame` updates over WebSocket to `ares-cockpit` and processes real-time What-If Stress-Test Console slider commands (`Cabin ppCO2`, `ARED Workload`, `LBNP Pressure`, `Mission Day`) in $< 1\text{ ms}$.
3. **Dedicated `stdio` JSON-RPC 2.0 FastMCP Server:** Serves 3 compact macro-tools (`get_astronaut_health_summary`, `query_organ_robustness`, `trigger_medops_action_playbook`) strictly bounded under `< 150 tokens` and `< 50 microseconds` to the local quantized AI copilot.
