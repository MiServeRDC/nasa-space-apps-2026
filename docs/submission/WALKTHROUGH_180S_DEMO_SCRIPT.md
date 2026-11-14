# ARES-Health: 180-Second Technical & Clinical Walkthrough Script

- **Format Target:** Extended Technical & Local Judging Walkthrough (`<= 180.000 s`; final cue closes at `00:02:59,400`)
- **Subtitle Track:** [WALKTHROUGH_180S_SUBTITLES_EN.srt](WALKTHROUGH_180S_SUBTITLES_EN.srt) (36 sequential SubRip cues, English, `<= 00:03:00,000`)
- **Reproducibility:** Every screen and command below can be executed locally offline against the repository workspace.
- **Evidence Honesty Contract:** Strictly separates `RECORDED_TERRESTRIAL_BIDMC_CSV` from `ILLUSTRATIVE_UNVALIDATED` scenario models per [MODEL_EVIDENCE_AUDIT.md](../architecture/MODEL_EVIDENCE_AUDIT.md).

---

## Reproducible Environment Setup

```bash
cd /Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026

# Option A: Native Tauri v2 Workstation Shell (ARES-MedOS)
./scripts/launch_ares_medos.sh --desktop

# Option B: Loopback Axum WS/MCP + Vite Cockpit
cargo run -p ares-server-cli -- --mode ws-and-mcp --data-dir data/bidmc
# Or unified browser launcher: ./scripts/launch_ares_medos.sh --web
```

---

## 5-Act Choreography (`00:00.000` - `02:59.400`)

| Act & Timecode | Terminal Commands & Exact `ARES-MedOS` Interactions | Technical & Clinical Invariants Shown on Screen |
| :--- | :--- | :--- |
| **Act I (`00:00 - 00:38`)**<br>*Launch `ARES-MedOS` & `BIDMC` Replay with Null Honesty (`GATHER`)* | 1. Top split terminal: run `./scripts/launch_ares_medos.sh --desktop` (or `cargo run -p ares-server-cli -- --mode ws-and-mcp --data-dir data/bidmc`).<br>2. In the cockpit ([App.tsx](../../ares-cockpit/src/App.tsx)), open `INSPECT PROVENANCE` inside [ProvenanceInspector.tsx](../../ares-cockpit/src/modules/provenance/ProvenanceInspector.tsx) on `bidmc_01_Numerics.csv`. | - `SHA-256` checksum verification against `data/bidmc/MANIFEST.json` (`481` rows `0..480 s`, `1.0 Hz` native replay decoupled from `20 Hz` UI stream).<br>- `OsSystemStatusBar` shows `ARINC-653 HM: 4/4 PARTITIONS NOMINAL`, `128B BIN #...` (`CRC-32C`), `OWLT: 14m 12s (EIMO AUTONOMOUS) [V1 3006]`, and `ILLUSTRATIVE_UNVALIDATED`.<br>- The `13` missing `PULSE`/`SpO2` samples render as `MISSING` (never `0.0`); `HRV (RMSSD)` displays `BEAT_INTERVALS_NOT_AVAILABLE` and alarm stays `DATA_DEGRADED_MISSING_CHANNELS`. |
| **Act II (`00:38 - 01:15`)**<br>*Sub-Millisecond What-If Perturbation, Coupled ODEs & `Timestral` Cones (`EVALUATE`)* | 1. In [WhatIfConsole.tsx](../../ares-cockpit/src/modules/whatif-console/WhatIfConsole.tsx), click `OVERLAY: ON`, drag `Mission Day` to `180 d`, `ARED Exercise Load` to `30%`, and `Cabin CO2` to `4.8 mmHg`.<br>2. Step through `EVALUATE` sub-views: `BODY_3D` ([BodyHeatmap.tsx](../../ares-cockpit/src/modules/body-3d-heatmap/BodyHeatmap.tsx)), `MUSCLE_BONE`, `POCUS`, and `FORECAST` ([MriAndStl.tsx](../../ares-cockpit/src/modules/mri-and-stl/MriAndStl.tsx)). | - `POST /api/stress-test` recomputes scenario state in `< 1 ms` (1-tick `--release` pipeline `p99.9 = 5.58 us`) without advancing or mutating the `1 Hz` recorded `BIDMC` cursor.<br>- Illustrative cascade updates live: ARED deficit raises RK4 scenario `SOST` (`pmol/L`), degrades `MQI`, elevates `0.38g` `GAI`, dilates `IJV_CSA`, and drops CGS wall shear stress $\tau_w = 2\mu v_{\max}\sqrt{\pi/\text{CSA}}$.<br>- `FORECAST` displays $O(1)$ `LemireMinWedge` margins, monotone `[q05, q50, q95]` `Timestral` cones, `HEURISTIC_GATE_ACCEPTED`, and `ILLUSTRATIVE_SCENARIO_RANGE` (`TTV`). |
| **Act III (`01:15 - 01:55`)**<br>*Type-1 MedOps Playbooks `#01-#05` & 3 Hard Clinical Safety Gates (`ACT`)* | 1. Switch to `ACT` ([PlaybookRunner.tsx](../../ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx)): inspect `PB #01` (*Venous Stasis LBNP*) and `PB #04` (*SANS Translaminar*).<br>2. Verify `GATE 1 ANTICOAG: LOCKED (POCUS REQUIRED)` while `POCUS thrombus` is unconfirmed, then toggle `POCUS CONFIRMED` to show explicit Gate 1 unlock (`PB #02`).<br>3. Set `LBNP Leg Pressure` toward `-30 mmHg` and trigger the hemodynamic drop condition to fire Gate 2 auto-vent (`0 mmHg`). | - **Safety Gate 1:** Blocks empirical anticoagulants without `pocus_thrombus_confirmed == true` (`LOCKED`), preventing EVA trauma hemorrhage.<br>- **Safety Gate 2:** `GATE 2 AUTO-VENT TRIGGERED` vents `-30 mmHg` LBNP chamber to `0 mmHg` if $\Delta\text{SBP} > 15\text{ mmHg}$ or $\text{HR} > 115\text{ bpm}$.<br>- **Safety Gate 3:** When `GAI > 12%`, `eva_suit_damping_active` switches to `ACTIVE (+25% ANKLE)` for `0.38g` Martian EVA gait protection. |
| **Act IV (`01:55 - 02:32`)**<br>*`Alt+Space` `FastMCP` Palette (`< 150 Tokens`) & Air-Gapped Edge/Voice Copilot* | 1. Press `Alt+Space` to open [OsCommandPalette.tsx](../../ares-cockpit/src/modules/os-shell/OsCommandPalette.tsx).<br>2. Execute `[1] query_dataset_graph` (`OSD-51`), `[2] explain_biomarker_path` (`OSD-818` -> `bm_hr`), `[3] get_timestral_quantile_cones`, and `[8] get_medops_playbook`.<br>3. Invoke [OsVoiceCopilot.tsx](../../ares-cockpit/src/modules/os-shell/OsVoiceCopilot.tsx) (`"Explain current jugular status"`) to demonstrate local voice/text summarization. | - Every `FastMCP` tool payload stays strictly `<= 600 B` (`< 150 tokens`), returns microsecond latency (`TAURI_NATIVE_IPC` / `HTTP_FASTMCP`), and wraps untrusted telemetry in `<untrusted_telemetry_observation>` ([sanitizer.rs](../../crates/ares-security-privacy/src/sanitizer.rs)).<br>- Local quantized LLM / Type-1 deterministic fallback (`OfflineTemplateCopilot`) explains deterministic outputs without altering ODEs or Safety Gates (`DO-178C` DAL-E boundary). |
| **Act V (`02:32 - 02:59.4`)**<br>*Epistemic Transparency (`MODEL_EVIDENCE_AUDIT.md`) & Reproducible CI Verification* | 1. Highlight the `ILLUSTRATIVE_UNVALIDATED` badge alongside [MODEL_EVIDENCE_AUDIT.md](../architecture/MODEL_EVIDENCE_AUDIT.md).<br>2. Run `./scripts/build_submission_docs.sh` and `./scripts/agent_probe.sh --fast` in the terminal split. | - Clear three-way boundary: (1) recorded `BIDMC` replay, (2) 24-source biological/normative context (`AresUnifiedDatasetGraph`: `110` nodes, `326` Biolink edges), and (3) `ILLUSTRATIVE_UNVALIDATED` scenario models awaiting Phase 33 subject-disjoint calibration.<br>- Clean verification exit (`0` `.unwrap()`/`.expect()`, `7`-page Typst deck, `6/6` submission gates passed, `MIT OR Apache-2.0`). |
