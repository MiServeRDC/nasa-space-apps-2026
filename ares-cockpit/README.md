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
