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

* `src/lib/useTelemetry.ts` fetches cold-start state from `GET http://127.0.0.1:8080/api/snapshot`, subscribes to the 20 Hz stream at `ws://127.0.0.1:8080/ws/telemetry` (`ares-server-cli`), and forwards What-If overrides via `POST http://127.0.0.1:8080/api/stress-test` (re-syncing active overrides on open and reconnect).
* All incoming JSON frames pass through `isValidTelemetryPayload` and `normalizeTelemetryPacket` (`src/lib/telemetryValidation.ts`), supporting both `contracts/telemetry_schema.json` and `ares-server-cli` payloads while rejecting malformed frames without overwriting the last valid packet.
* When the engine is offline the cockpit falls back to `src/lib/scenario.ts`, a deterministic local preview model clearly isolated from recorded BIDMC telemetry.
* Null channels (`pulse_rate_bpm`, `spo2_percent`, `hrv_rmssd_ms`, `time_to_violation_days`) are rendered explicitly as `MISSING` or `UNAVAILABLE (BEAT_INTERVALS_NOT_AVAILABLE)` / `UNAVAILABLE (NO R-R)` and are never coerced to 0 or `> 100 d`.
* `src/modules/provenance/ProvenanceInspector.tsx` exposes dataset provenance (`BIDMC v1.0.0` / `MANIFEST SHA-256 verified`), `missing_channels`, `quality_flags` (`BEAT_INTERVALS_NOT_AVAILABLE`, `HOLD_LAST_VALID`), and an accessible per-indicator evidence drawer.

## Safety Gates in the UI

* Gate 1: Playbook #05 anticoagulation step stays LOCKED unless the POCUS finding is `CONFIRMED`.
* Gate 2: LBNP auto-vents to 0 mmHg when SBP drops > 15 mmHg or HR > 115 bpm, with an `AUTO_VENT_LBNP_CHAMBER` alert.
