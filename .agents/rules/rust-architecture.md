# Rust Aerospace Architecture & Strict Coding Rules (ARES-Health)

## 1. Zero Panics in Production (DO-178C / NASA-STD-3001 Alignment)
- **Strict Prohibition of `.unwrap()` and `.expect()`:** Calling `.unwrap()`, `.expect()`, or `panic!()` is strictly forbidden in production library or server code (`crates/*/src/**`).
  - *Exception:* Permitted exclusively inside unit test blocks (`#[cfg(test)]`).
- **Typed Library Errors (`thiserror`):** Every library crate (`ares-core-types`, `ares-telemetry-ingest`, `ares-causal-graph`, `ares-nqs-stl`, `ares-medops-playbooks`, `ares-security-privacy`) must define strongly-typed error enums via `thiserror`.
- **Binary Context Errors (`anyhow`):** Permitted only in the top-level binary crate `crates/ares-server-cli`.

## 2. Dual-Transport Isolation & Deterministic Latency
- **Loopback UI Streaming (`axum` on `127.0.0.1:8080`):** Streams $20\text{ Hz}$ `AstronautTelemetryFrame` updates to `ares-cockpit` and processes What-If Stress-Test slider commands in $< 1\text{ ms}$.
- **Dedicated FastMCP Pipe (`stdio` JSON-RPC 2.0):** Serves compact macro-tools (`< 150 tokens` per response, `< 50 microseconds` execution) to the local quantized LLM copilot without contending with the WebSocket stream.
- **Shared State:** Both transports synchronize safely over `Arc<RwLock<MissionState>>`.

## 3. Contract-First Modular Coupling
- All 7 crates and the React cockpit must strictly conform to `contracts/telemetry_schema.json`.
- Never modify shared contract field names without updating `crates/ares-core-types` and running `./scripts/agent_probe.sh --fast`.
