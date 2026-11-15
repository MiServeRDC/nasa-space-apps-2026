# `ares-cockpit` — Microgravity OLED Astronaut Cockpit & 3D Deconditioning Heatmap

**Standards:** `NASA-STD-3001 Vol. 2 Rev F ([V2 6001], [V2 7043], [V2 10001])` & `MIL-STD-1472H`

## Modular UI Structure (`src/modules/`)
1. `header-triphase/`: Illuminates `1. GATHER -> 2. EVALUATE -> 3. ACT` + Earth-Mars communication latency simulator (`0.5s ISS` vs. `14m 22s Mars Transit` vs. `Solar Conjunction Blackout`) with `aria-current="page"` and `>= 44px` touch ergonomics.
2. `vitals-anomaly/`: Per-subject 1 Hz vital-signs anomaly detector (`VitalsAnomalyPanel.tsx`) and controlled synthetic fault injection (`DESATURATION_*`, `TACHYCARDIA_*`, `SENSOR_DETACH`, `COMBINED_SUBTLE`, `CLEAR`) via Tauri IPC / HTTP.
3. `mri-and-stl/`: Composite Mission Readiness Index (`MRI in [0, 100]`) gauge and dual-band quantile cone viewer (`+15m/+1h/+6h/+24h` Timestral grey-box cones alongside `+5s/+10s/+30s/+60s/+120s` EWMA residual cones) with strict Issue #11 abstention preservation.
4. `body-3d-heatmap/`: 5-source unified `Three.js` / `@react-three/fiber` 3D anatomical cockpit supporting both static `CC BY-SA 4.0` Z-Anatomy `.glb` meshes (`public/anatomy/`, air-gapped `MeshoptDecoder` without external CDN) and `MALE`/`FEMALE` procedural rig + `NasaGlbAssetLayer`, UBERON 5-node/6-arc hypergraph projection, null-safe pure-replay inspection, neon-lime trauma pins, and offline optical RGB skin triage (`AiInjuryModal.tsx` / `vlmInjuryEngine.ts`).
5. `playbook-runner/`: Deterministic NASA MedOps Playbook `#01..#15` interactive runner (`#01..#05` deep-space + `#06..#09` acute vitals) with visible Hard Clinical Safety Gate lock badges.
6. `whatif-console/` & `os-shell/`: Live `< 1 ms` What-If Stress-Test sliders (`ppCO2`, `ARED Load`, `LBNP Pressure`, `Mission Day`) + expandable `OsSystemStatusBar`, `ProvenanceBanner`, `OsVoiceCopilot`, and `Cmd+K` / `Alt+Space` `OsCommandPalette`.

## Quickstart

The approved medical-blue cockpit loads optional 3D/portal/studio/dialog code on
demand, using local chunks. Anatomy offers Auto/Lite/Standard/High quality, honors
reduced motion, pauses behind overlays/offscreen and retains the chosen profile.
The unused 20 Hz preview pauses during ordinary live telemetry; alarm processing
is unchanged. System diagnostics are in the expandable system details section.
See [optimization operations](../docs/operations/PROJECT_OPTIMIZATION.md) for local
recording, browser regression checks and measurement limits.

Requires Node.js 20+.

```bash
cd ares-cockpit
npm install
npm run dev      # http://127.0.0.1:5173
npm run lint     # TypeScript strict type-check
npm run build
node --experimental-strip-types --test tests/*.test.ts
```

## Data Flow & Epistemic Provenance

* `src/lib/useTelemetry.ts` supports dual transport (`TAURI_NATIVE_IPC` zero-copy `128 B` `BinaryTelemetryFrame` + `BROWSER_WEBSOCKET` `GET /api/snapshot`, `ws://127.0.0.1:8080/ws/telemetry`, `POST /api/stress-test`, and `POST /api/inject-anomaly` / `ipc_inject_anomaly`).
* All incoming JSON frames pass through `isValidTelemetryPayload` and `normalizeTelemetryPacket` (`src/lib/telemetryValidation.ts`), supporting `BIDMC-SUBJECT-01..53`, `ASTRO-01..04`, and `ARES-CDR-01..04`.
* When the engine is offline the cockpit falls back to `src/lib/scenario.ts`, a deterministic local preview model clearly isolated from recorded BIDMC telemetry.
* Null channels (`pulse_rate_bpm`, `spo2_percent`, `hrv_rmssd_ms`, `time_to_violation_days`) are rendered explicitly as `MISSING` or `UNAVAILABLE (BEAT_INTERVALS_NOT_AVAILABLE)` / `UNAVAILABLE (NO R-R)` and are never coerced to 0 or `> 100 d`.
* Optical skin triage (`src/lib/vlmInjuryEngine.ts`) uses an offline HTML5 `<canvas>` RGB pixel heuristic (`OPTICAL_RGB_HEURISTIC_V1`), strictly tagged `ILLUSTRATIVE_UNVALIDATED` (non-diagnostic, zero cloud uploads, zero fabricated confidence percentages).

## Safety Gates in the UI

* Gate 1: Systemic anticoagulants stay LOCKED unless the POCUS finding is `CONFIRMED`.
* Gate 2: LBNP auto-vents to `0 mmHg` when SBP drops `> 15 mmHg` or `HR > 115 bpm`.
* Gate 3: Martian `0.38g` EVA suit ankle damping (`+25%`) engages when `GAI > 12.0%`.

## Asset Isolation & Interface Hierarchy Notes

* Static 3D `.glb` meshes under `ares-cockpit/public/anatomy/` are derived from **Z-Anatomy / BodyParts3D** under `CC BY-SA 4.0` (see `public/anatomy/ATTRIBUTION.md` and `public/anatomy/LICENSE-CC-BY-SA-4.0.txt`) and remain strictly isolated as static public runtime assets from `MIT OR Apache-2.0` source code.
* Interface hierarchy & progressive disclosure notes: the phase title leads the cockpit while What-If controls use native HTML `<details>` disclosures; connection, alerts, provenance, and voice/status chrome remain visible. Design references reviewed: [Vercel UI SDK](https://github.com/vercel-labs/ui) (`Apache-2.0`, native HTML disclosures only, zero external packages imported), [WHOOP Home](https://www.whoop.com/us/en/thelocker/the-all-new-whoop-home-screen/), and [Oura Vitals](https://support.ouraring.com/hc/en-us/articles/360058599753-How-to-Use-the-Oura-App) (clean-room hierarchy study for separating current bedside vitals from recorded historical trends; zero external assets or code copied).
