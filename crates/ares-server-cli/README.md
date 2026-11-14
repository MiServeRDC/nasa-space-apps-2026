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

Global flags: `--addr` (loopback only), `--astronaut`, `--source-record`,
`--replay <record_id>` (`bidmc_01` | `bidmc_02` | `bidmc_03`), `--data-dir`
(default `data/bidmc`).

`--data-dir` is resolved against the working directory, so run the replay from the repo
root:

```bash
# pure terrestrial BIDMC replay, the mode the cockpit integrates against
cargo run --manifest-path crates/ares-server-cli/Cargo.toml --bin ares-engine -- \
  serve --replay bidmc_01
```

### Transport 1: `axum` (`src/ws_server.rs`)

| Route | Purpose |
| :--- | :--- |
| `GET /ws/telemetry` | 20 Hz `TelemetryPacket` stream; the first frame is sent on connect, not on the next tick |
| `POST /api/stress-test` | What-If console patch, recomputes and broadcasts at once; answers `recompute_latency_us` |
| `POST /api/playbook/activate` | Gates a playbook and makes it the active run |
| `POST /api/playbook/execute-step` | The cockpit `[EXECUTE STEP]` button; refuses skipped or out-of-DAG steps with `409` |
| `GET /api/snapshot` | One frame, for cockpit cold start and probes |
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

### The public wire format

`contracts/telemetry_schema.json` is the contract, and `contracts/fixtures/` holds two real
engine outputs that both sides validate against:

| Fixture | Mode |
| :--- | :--- |
| `telemetry_bidmc_replay.json` | pure replay of `bidmc_01` at second `111` (inside the missing-channel gap) |
| `telemetry_whatif_overlay.json` | the same second with the What-If console engaged |

They are generated, never hand-written. After an intentional contract change:

```bash
ARES_WRITE_FIXTURES=1 cargo test --test contract_fixtures
```

`tests/contract_fixtures.rs` validates both against the schema with the `jsonschema` crate
(a dev-dependency: nothing is shipped) and fails if the engine output drifts from the
committed files.

### Source modes

`src/telemetry.rs::SourceMode` decides every provenance tag in a frame:

| Mode | `biometrics_source` | `native_rate_hz` | `scenario_overlay_mode` | `safety_margins.provenance` | simulated blocks |
| :--- | :--- | :--- | :--- | :--- | :--- |
| pure replay | `RECORDED_TERRESTRIAL_BIDMC_CSV` | `1.0` | `NONE_PURE_REPLAY` | `DERIVED_FROM_RECORDED_BIDMC` | `null` |
| replay + What-If | `RECORDED_TERRESTRIAL_BIDMC_CSV` | `1.0` | `SIMULATED_WHATIF_SCENARIO` | `DERIVED_FROM_HYBRID_SCENARIO` | present |
| simulated only | `SIMULATED_SCENARIO_INPUT` | `20.0` | `SIMULATED_WHATIF_SCENARIO` | `DERIVED_FROM_HYBRID_SCENARIO` | present |

Two invariants hold by construction rather than by convention:

* The replay position is a pure function of elapsed wall-clock time, so a
  `POST /api/stress-test` cannot advance or rewind the recording.
* In recorded mode the four recorded channels are written from the current sample *after*
  the console state is applied, so a console patch can never forge a recorded value. A
  `clinical_state` replacement carrying a fabricated HR is accepted and then ignored for
  those four channels.

A pure replay also refuses to claim what an 8-minute terrestrial recording cannot support:
`mission_elapsed_days`, `time_to_violation_days`, `hemodynamics`, `musculoskeletal` and
`environment` all stay `null`.

### BIDMC replay (`src/replay.rs`)

PROVISIONAL: `crates/ares-telemetry-ingest` (`@LelloXV`) owns ingestion, and this module is
the minimum reader Block G needs to stream recorded vitals. It must be replaced by
`ares_telemetry_ingest::bidmc_replayer` once that crate merges.

Per `Issue #4` and the `telemetry-replay-verifier` skill: the CSV SHA-256 is verified
against `data/bidmc/MANIFEST.json` before any row is trusted; headers and cells are
whitespace-trimmed (` HR`, ` PULSE`, ` RESP`, ` SpO2`); `NaN` and empty cells become `null`
and are named in `biometrics.missing_channels`, never `0.0` and never carried over;
`Time [s]` is carried as-is in `relative_recording_time_s`; the native rate is `1.0 Hz`
whatever the UI tick rate is; and records are never concatenated.

In `bidmc_01` seconds `111`-`123` `PULSE` and `SpO2` are missing. The stream reports both
as `null`, lists them in `missing_channels`, and sets
`alarm_level = DATA_DEGRADED_MISSING_CHANNELS`. `HR` and `RESP` keep streaming through the
gap.

### Provenance and honest gaps

Fields that need crates which do not exist yet are emitted as `null` with an explicit
source tag instead of being invented:

* `med_stl_rho_robustness`, `time_to_violation_days`, `mission_readiness_index`,
  and the MCP `rho` / `sigma_1_96` / `ttv_days`: `PENDING_ARES_NQS_STL` (phases 8-9).
* `thrombosis_risk_score`: needs the two-stage Bayesian POCUS observer (phase 7).
* `biometrics.pulse_rate_bpm`: recorded in replay mode; always `null` and listed in
  `missing_channels` in simulated-only mode, because the scenario generator does not model
  PPG. The engine reads `HR`, not the PPG pulse rate, so a missing `PULSE` alone does not
  degrade the alarm tier; the cockpit must still show it as unavailable.
* `biometrics.rr_interval_ms` and `hrv_rmssd_ms`: `null` under a 1 Hz numerics replay,
  which carries no beat-to-beat information. They need the 125 Hz waveforms.
* `ared_workload_pct` is recorded and echoed but moves no clinical value: the workload to
  bone/muscle dose-response is the Frost-Hargens ODE of `ares-causal-graph` (phase 5).
* `alarm_level` is a documented provisional mapping over the MedOps report
  (`src/telemetry.rs`), to be replaced by the NQS-STL synthesis of phase 9.
* Every property the schema names for `biometrics`, `hemodynamics`, `musculoskeletal`,
  `environment` and `safety_margins` is emitted, `null` where the engine cannot compute it,
  so a cockpit typed against the contract never reads `undefined` where the schema promises
  a field. `every_schema_property_of_an_emitted_block_is_present` in
  `tests/contract_fixtures.rs` enforces it.
* The four schema `musculoskeletal` fields (`soleus_thickness_mm`, `pennation_angle_deg`,
  `bone_resorption_rate_pct`, `mechanotransductive_index`) and `environment.cabin_o2_kpa`
  are all `null` today. None can be honestly derived from what the engine holds: the state
  tracks soleus volume loss against a pre-flight baseline, and turning that into a
  thickness in mm needs the regularized Frost-Hargens ODE of `ares-causal-graph`. The
  engine's own values are carried beside them as EXTENSION fields.
* Fields marked EXTENSION in `src/telemetry.rs` are not in the contract yet: `medops`,
  `safety_margins.pending_sources`, `environment.cabin_ppco2_mmhg`, the four engine
  `musculoskeletal` values (`soleus_volume_loss_pct`, `bmd_loss_pct_per_month`,
  `gait_asymmetry_index_pct`, `post_landing`) and `active_playbook.*`. The schema does not
  forbid extra properties, so a cockpit validating against it passes either way, but they
  must be agreed on the issue and folded into the contract before anyone depends on them.

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

45 tests: MCP token budget, latency and JSON-RPC conformance across three clinical regimes
(`tests/mcp_budget.rs`), HTTP contract, validation, sub-millisecond recompute and the
step state machine (`tests/http_api.rs`), schema validation of both fixtures, full schema
property coverage, plus the provenance and missing-channel rules
(`tests/contract_fixtures.rs`), real loopback socket
at 20 Hz, the 1 Hz-under-20 Hz replay cadence, What-If restore on reconnect and the
non-loopback refusal (`tests/ws_stream.rs`), CSV parsing, digest verification and the
13 degraded seconds (`src/replay.rs`), budget and parsing helpers (`src/mcp_stdio.rs`).

Measured on a debug build: `338 us` for `POST /api/stress-test` recompute and broadcast
(budget `< 1 ms`), `111 us` mean per MCP answer (budget `< 500 us`), worst-case tool result
`376 B` / about `94 token` (budget `< 150 token`).
