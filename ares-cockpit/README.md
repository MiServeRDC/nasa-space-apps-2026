# `ares-cockpit` — Microgravity OLED Astronaut Cockpit & 3D Deconditioning Heatmap

**Assigned Owner:** `@carolina2910` (`work/carolina2910`)  
**Standards:** `NASA-STD-3001 Vol. 2 Rev F ([V2 6001], [V2 7043], [V2 10001])` & `MIL-STD-1472H`  

## Modular UI Structure (`src/modules/`)
1. `header-triphase/`: Illuminates `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]` + Earth-Mars communication latency simulator (`0.5s ISS` vs. `14m 22s Mars Transit` vs. `Solar Conjunction Blackout`).
2. `mri-and-stl/`: Composite Mission Readiness Index ($\text{MRI} \in [0, 100]$) gauge and NQS-STL $\hat{\rho}_k(t)$ chart with shaded Two-Stage Bayesian POCUS uncertainty bands ($\pm 1.96\,\sigma(t)$) and 14-day EWMA `TTV` forecast.
3. `body-3d-heatmap/`: Interactive `Three.js` / `@react-three/fiber` 3D anatomical mesh highlighting Soleus $\text{MQI}$, Calcaneus/Femoral `SOST` osteopenia, Jugular $\tau_w$ stasis, and Optic $\text{ONSD}$ SANS with causal bezier arcs.
4. `playbook-runner/`: Deterministic NASA MedOps Playbook #04 & #05 interactive DAG runner with visible Hard Clinical Safety Gate lock badges.
5. `whatif-console/`: Live `< 1 ms` What-If Stress-Test sliders (`ppCO2`, `ARED Load`, `LBNP Pressure`, `Mission Day`) + bottom voice/text Local FastMCP AI Copilot bar.


## Quickstart

Requires Node.js 20+ (`winget install OpenJS.NodeJS.LTS`).

```bash
cd ares-cockpit
npm install
npm run dev      # http://127.0.0.1:5173
npm run lint     # TypeScript strict type-check
npm run build
```

## Data Flow

* `src/lib/useTelemetry.ts` connects to `ws://127.0.0.1:8080/ws` (`ares-server-cli`). Incoming frames must match `contracts/telemetry_schema.json` (mirrored in `src/types/telemetry.ts`). What-If slider changes are sent back as `{ "type": "what_if", ... }`.
* When the engine is offline the cockpit falls back to `src/lib/scenario.ts`, a deterministic local preview model. Every value it produces is tagged `SIMULATED_SCENARIO_INPUT` / `DERIVED_COMPUTED`; the authoritative evaluators remain in `ares-causal-graph` and `ares-nqs-stl`.
* Null channels are rendered as `UNAVAILABLE`, never coerced to 0 (experienceLog Entry 006).

## Safety Gates in the UI

* Gate 1: Playbook #05 anticoagulation step stays LOCKED unless the POCUS finding is `CONFIRMED`.
* Gate 2: LBNP auto-vents to 0 mmHg when SBP drops > 15 mmHg or HR > 115 bpm, with an `AUTO_VENT_LBNP_CHAMBER` alert.

### Fernando server integration (issues #8 and #22)

Start Fernando's server from its own checkout at commit
[`4b5d86f`](https://github.com/MiServeRDC/nasa-space-apps-2026/commit/4b5d86f)
with `cargo run --manifest-path crates/ares-server-cli/Cargo.toml --bin ares-engine -- serve --replay bidmc_01`.
Then run `npm ci` and `npm run dev` in this cockpit. Vite forwards
`/ws/telemetry` and `/api/stress-test` to the server on loopback port 8080.
Keep the server replay mode unchanged until opting in to its What-If overlay.
The four supported sliders are sent as a POST after opt-in and on reconnect.
Crew sex, signal noise and scan controls remain local simulation inputs.

In Gather, expect BIDMC terrestrial ICU provenance, a 1 Hz recording clock,
and unavailable PULSE and SpO2 at seconds 111–123. Forecast and readiness can
also be unavailable. The ECG, anatomy and other local previews are simulations.

Sources: [Fernando's public wire contract and fixtures](https://github.com/MiServeRDC/nasa-space-apps-2026/pull/22),
[Carolina's cockpit baseline](https://github.com/MiServeRDC/nasa-space-apps-2026/commit/2da0989)
and [PhysioNet BIDMC v1.0.0](https://physionet.org/content/bidmc/1.0.0/).
