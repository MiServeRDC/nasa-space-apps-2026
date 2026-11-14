# Technical Context & Stack Constraints: ARES-Health

## 1. Unified Technology Stack
* **Backend Core (`crates/*`):** Safe Rust (Edition 2021/2024), `tokio` async runtime, `axum` (HTTP REST + $20\text{ Hz}$ WebSocket on `127.0.0.1:8080`), `petgraph` (directed causal multigraph), `serde` / `serde_json`, `thiserror` (library crates), `anyhow` (binary crate `ares-server-cli` only), and `stdio` JSON-RPC 2.0 FastMCP server.
* **Frontend Astronaut Cockpit (`ares-cockpit/`):** React 19, TypeScript, Vite, Tailwind CSS (pure black `#000000` OLED circadian-safe palette compliant with `NASA-STD-3001 Vol. 2 Rev F [V2 10001]` and `MIL-STD-1472H`), Three.js / `@react-three/fiber` (3D anatomical deconditioning heatmap).
* **Single Source of Truth Contract:** `contracts/telemetry_schema.json` defines the exact $20\text{ Hz}$ JSON payload exchanged between `ares-engine` and `ares-cockpit`.

---

## 2. Strict Coding & Safety Rules
1. **Zero Panics in Production Rust:** `.unwrap()`, `.expect()`, and `panic!()` are strictly forbidden in `crates/*/src/**` outside `#[cfg(test)]` blocks. Verified automatically by `./scripts/agent_probe.sh`.
2. **100% Offline & Air-Gapped Execution:** Zero calls to external internet APIs (`openai.com`, `anthropic.com`, external CDNs) at runtime. Loopback binding strictly on `127.0.0.1`.
3. **FastMCP Context-Mode Token Cap:** Every MCP tool response returned to the local quantized LLM copilot must be strictly `< 150 tokens` and execute in `< 50 microseconds`.
4. **Clean-Room Open-Source Mandate:** 100% standalone MIT-licensed codebase (`MiServeRDC/nasa-space-apps-2026`) with zero references to external proprietary engines.
5. **Zero-Conflict Team Modularity:** Each of the 5 team members works in their assigned crate/module directory on `work/<username>` and runs `./scripts/agent_probe.sh --fast` before merging to `main`.
