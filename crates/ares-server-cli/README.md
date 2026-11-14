# `ares-server-cli` — Dual-Transport Tokio Orchestrator (`axum` $20\text{ Hz}$ WebSocket + `stdio` FastMCP)

**Assigned Owner:** `@fertech02` (`work/fertech02`)  

## Scope
1. Concurrent `tokio` runtime managing shared mission state (`Arc<RwLock<MissionState>>`).
2. **`axum` Loopback Server (`127.0.0.1:8080`):** Streams $20\text{ Hz}$ `AstronautTelemetryFrame` updates over WebSocket to `ares-cockpit` and processes real-time What-If Stress-Test Console slider commands (`Cabin ppCO2`, `ARED Workload`, `LBNP Pressure`, `Mission Day`) in $< 1\text{ ms}$.
3. **Dedicated `stdio` JSON-RPC 2.0 FastMCP Server:** Serves 3 compact macro-tools (`get_astronaut_health_summary`, `query_organ_robustness`, `trigger_medops_action_playbook`) strictly bounded under `< 150 tokens` and `< 50 microseconds` to the local quantized AI copilot.

---

## Implemented Surface (Phases 13-14)

Binary: `ares-engine` (`cargo run -p ares-server-cli --bin ares-engine -- <mode>`).

| Mode | Transport | Notes |
| :--- | :--- | :--- |
| `serve` (default) | `axum` on `127.0.0.1:8080` | 20 Hz WebSocket + REST |
| `mcp` | JSON-RPC 2.0 on `stdio` | `stdout` carries frames only, logs go to `stderr` |
| `dual` | both | one shared `Arc<RwLock<MissionState>>`, ends on `stdin` EOF |

Global flags: `--addr` (loopback only), `--astronaut`, `--source-record`.

### Transport 1: `axum` (`src/ws_server.rs`)

| Route | Purpose |
| :--- | :--- |
| `GET /ws/telemetry` | 20 Hz `TelemetryPacket` stream; the first frame is sent on connect, not on the next tick |
| `POST /api/stress-test` | What-If console patch, recomputes and broadcasts at once; answers `recompute_latency_us` |
| `POST /api/playbook/activate` | Gates a playbook and makes it the active run |
| `POST /api/playbook/execute-step` | The cockpit `[EXECUTE STEP]` button; refuses skipped or out-of-DAG steps with `409` |
| `GET /api/telemetry` | One frame, for cockpit cold start and probes |
| `GET /api/health` | Liveness, stream rate, connected WebSocket clients |

One `serde_json` pass per tick is shared by all clients through a `tokio::sync::broadcast`
channel. Slider values are range-checked before the state is touched, so a rejected request
(`400`, `{"field","message"}`) leaves the mission state unchanged. Binding a non-loopback
address is refused outright (zero-trust).

Stress-test body (all fields optional, unknown fields rejected):
`cabin_ppco2_mmhg` (0..20), `ared_workload_pct` (0..200), `lbnp_pressure_mmhg` (-60..0),
`mission_elapsed_days` (0..1000), `clinical_state` (full engine-input replacement, for the
POCUS, landing and vitals inputs the four sliders do not cover).

### Transport 2: FastMCP (`src/mcp_stdio.rs`)

`initialize` (version negotiation), `ping`, `tools/list`, `tools/call`; notifications stay
silent; protocol errors use `-32700`, `-32601`, `-32602`. The three macro-tools are
`get_astronaut_health_summary`, `query_organ_robustness` and
`trigger_medops_action_playbook`. Every result is bounded by `MAX_RESULT_BYTES = 600`
(150 token at 4 B/token) and carries a `prov` provenance field; measured worst case so far
is 376 B (about 94 token). Playbooks are tagged `PB01`-`PB05` over MCP to save tokens
(the HTTP API uses the full `PLAYBOOK_0x_...` contract codes).

### Provenance and honest gaps

The packet follows `contracts/telemetry_schema.json`. Fields that need crates which do not
exist yet are emitted as `null` with an explicit source tag instead of being invented:

* `med_stl_rho_robustness`, `time_to_violation_days`, `mission_readiness_index`,
  and the MCP `rho` / `sigma_1_96` / `ttv_days`: `PENDING_ARES_NQS_STL` (phases 8-9).
* `thrombosis_risk_score`: needs the two-stage Bayesian POCUS observer (phase 7).
* `biometrics.pulse_rate_bpm`: always `null` and always listed in `missing_channels`; the
  scenario generator does not model PPG. It feeds no trigger and no gate, so it does not
  degrade the alarm tier.
* `ared_workload_pct` is recorded and echoed but moves no clinical value: the workload to
  bone/muscle dose-response is the Frost-Hargens ODE of `ares-causal-graph` (phase 5).
* `alarm_level` is a documented provisional mapping over the MedOps report
  (`src/telemetry.rs`), to be replaced by the NQS-STL synthesis of phase 9.
* Clinical input is the `SIMULATED_SCENARIO_INPUT` console state until
  `ares-telemetry-ingest` provides the deterministic BIDMC v1.0.0 replay (phase 3).
* Fields marked EXTENSION in `src/telemetry.rs` are not in the contract yet and must be
  folded into it when `ares-core-types` defines the shared structs.

The MCP tool names follow this README and the `mcp-builder` skill.
`docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md` phase 14 lists four differently named tools
(`get_crew_health_summary`, `explain_causal_anomaly`, `simulate_countermeasure_impact`,
`get_medops_playbook`); the two documents disagree and the team must settle on one list.

### Verification

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

28 tests: MCP token budget, latency and JSON-RPC conformance across three clinical regimes
(`tests/mcp_budget.rs`), HTTP contract, validation, sub-millisecond recompute and the
step state machine (`tests/http_api.rs`), real loopback socket at 20 Hz plus the
non-loopback refusal (`tests/ws_stream.rs`), budget and parsing helpers (`src/mcp_stdio.rs`).

Measured on a debug build: `338 us` for `POST /api/stress-test` recompute and broadcast
(budget `< 1 ms`), `111 us` mean per MCP answer (budget `< 500 us`), worst-case tool result
`376 B` / about `94 token` (budget `< 150 token`).
