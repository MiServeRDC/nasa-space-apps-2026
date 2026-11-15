# ARES-Health: Official NASA Space Apps Challenge 2026 Portal Submission Bundle

> **Epistemic & Audit Notice (Issue #11 & Issue #12):** All copy-paste blocks below are aligned with `docs/architecture/MODEL_EVIDENCE_AUDIT.md`. Recorded `PhysioNet BIDMC v1.0.0` terrestrial numerics (`RECORDED_TERRESTRIAL_BIDMC_CSV`) remain strictly separated from illustrative scenario models (`ModelValidationStatus::IllustrativeUnvalidated`, `ILLUSTRATIVE_SCENARIO_RANGE`, `HEURISTIC_GATE_ACCEPTED`). On `1 Hz` numeric-only replay without beat intervals, HRV (`rmssd_ms`) remains `null` (`BEAT_INTERVALS_NOT_AVAILABLE`). This prototype is not clinically validated, certified, or fitness-for-duty.

---

## Field 1: Project Name & Competition Metadata

- **Project Title:** `ARES-Health: Autonomous Resilient Edge-native System for Astronaut Health`
- **Official Challenge Track:** *Create Health Monitoring Software for Astronauts on Space Missions*
- **Challenge Portal:** https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/
- **Open-Source Repository:** https://github.com/MiServeRDC/nasa-space-apps-2026
- **License:** `MIT OR Apache-2.0` (OSI-approved dual permissive license)
- **Team (`MiServeRDC/nasa-space-apps-2026`):** Fabio Malagutti (`@fabiomalagutti27-droid`, Lead Systems Architect, University of Bologna), `@carolina2910`, `@fertech02`, `@LelloXV`, `@MiServeRDC`

---

## Field 2: High-Level Project Summary

### Version A: Strict `<= 100`-Word Summary (97 words)

Deep-space Mars transits impose an 8-to-48-minute round-trip radio delay and 14-day solar conjunction blackouts, breaking cloud telemedicine. **ARES-Health** is a 100% offline, air-gapped Safe Rust (`9` crates) and React 19 OLED workstation (`ARES-MedOS`) implementing NASA's **Gather -> Evaluate -> Act** loop. It replays `SHA-256`-verified `BIDMC v1.0.0` telemetry with strict `null` honesty (`BEAT_INTERVALS_NOT_AVAILABLE`), evaluates sex-specific (`Male`/`Female`) physiological and coupled scenario models (`ModelValidationStatus::IllustrativeUnvalidated`) via $O(1)$ `NQS-STL` and monotone `Timestral` quantile cones, and enforces `30` deterministic MedOps playbooks (`#01..=#30`) guarded by `7` Hard Clinical Safety Gates (`4` Core + `3` Extended).

### Version B: Extended `<= 150`-Word Summary (146 words)

Deep-space missions to the Moon and Mars face an impassable 8-to-48-minute round-trip light-speed delay and up to 14 days of solar conjunction blackout, making Earth-based cloud monitoring unusable. **ARES-Health** (`ARES-MedOS`) is a 100% air-gapped, edge-native health monitoring platform built across a `9`-crate Safe Rust 2024 workspace and a pure-black `#000000` OLED cockpit. Following **Gather -> Evaluate -> Act**, it deterministically replays `PhysioNet BIDMC v1.0.0` recordings (`SHA-256` verified) while preserving missing samples and reporting `BEAT_INTERVALS_NOT_AVAILABLE` when beat intervals are absent. Sex-specific (`Male`/`Female`) aerospace physiology, coupled scenario ODEs (`SOST` RK4, CGS jugular shear stress, POCUS Bayesian observer), $O(1)$ `LemireMinWedge` `NQS-STL` margins, and non-crossing `Timestral` cones (`ModelValidationStatus::IllustrativeUnvalidated`, `HEURISTIC_GATE_ACCEPTED`) drive `30` deterministic MedOps playbooks (`#01..=#30`) across `6` aerospace medical domains, guarded by `7` Hard Clinical Safety Gates (`4` Core + `3` Extended) and a `< 150`-token `FastMCP` copilot.

---

## Field 3: Detailed Project Description & How It Works

### 1. Operational Problem Statement
In Low Earth Orbit, flight surgeons in Houston continuously monitor crew telemetry. On Artemis Lunar Gateway and Earth-Mars transit missions (`NASA CHAPEA`, `NASA-STD-3001 Vol. 1 [V1 3006]`), one-way light time (`OWLT`) reaches `4-24 min` (`8-48 min` round-trip) alongside two-week solar conjunction blackouts, and rapid medical evacuation is physically impossible. Conventional health dashboards fail in deep space because they (a) depend on cloud APIs, (b) display metrics in disconnected silos, (c) silently fabricate `0.0` or imputed baselines on missing telemetry, and (d) lack deterministic action guardrails.

### 2. Closed-Loop Architecture (`Gather -> Evaluate -> Act`)

#### Phase 1 — GATHER (Zero-Fabrication Telemetry Replay & Level-1 DSP)
- **Deterministic `PhysioNet BIDMC v1.0.0` Replay (`crates/ares-telemetry-ingest`):** Replays `bidmc_01..03_Numerics.csv` (`481` rows, `0..480 s`, `1.0 Hz` native cadence decoupled from the `20 Hz` cockpit stream), verified at startup via `SHA-256` against `data/bidmc/MANIFEST.json`. Leading whitespace in CSV headers (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`) is trimmed cleanly.
- **Strict Null Honesty (Issue #4 & Issue #11):** The `13` missing `PULSE`/`SpO2` samples in `bidmc_01` remain `Option<f64>::None` (`null` / `MISSING`) and are never zero-filled. Because `1 Hz` numerics provide no R-R beat intervals, `rmssd_ms` and dependent HRV metrics stay `None` with explicit reason `BEAT_INTERVALS_NOT_AVAILABLE` and alarm severity `DATA_DEGRADED_MISSING_CHANNELS`.
- **Numeric Quality Heuristic & Bounded ZOH:** `sqi_filter.rs` computes a hand-configured numeric HR-difference entropy quality heuristic (`0.96 - 0.14*h_norm - 0.18*f_miss` over a 16-sample ring) and bounds Zero-Order Hold (`HOLD_LAST_VALID`) to `30 s` before transitioning to `HELD_STALE` / `UNAVAILABLE`.
- **Level-1 Pure-Rust DSP & Wearable Framing (`Phase 31 / L3`):** Adds contactless `60/5.2 GHz` I/Q Doppler demodulation with Jury-stable `60/120 Hz` ECLSS fan notch biquads (`radar_csi_dsp.rs`), zero-heap `YIN` vocal $F_0$/HNR/jitter/shimmer extraction emitting `None` on silence (`vocal_acoustic_dsp.rs`), Pan-Tompkins `125-500 Hz` R-R extraction (`waveform_rr_extractor.rs`) for true beat-interval waveforms, `32 B` `WearableSensorPacket` (`CRC-16-CCITT` + `Oxide Hubris` `supervisor_restart_count`), and `CSA CANS` neutron dosimetry (`mSv/d`).

#### Phase 2 — EVALUATE (ADHG Scenario Models, `O(1)` NQS-STL & `Timestral`)
- **Multi-Organ ADHG & Scenario ODEs (`crates/ares-causal-graph`):** Uses `petgraph::StableDiGraph` (`ADHG`) plus contextual parameters from `NASA OSDR`, `ESA Myotones`, and `Marshall-Goebel et al. (JAMA 2019)`:
  - *Musculoskeletal Scenario ODE:* 12-step fixed-step `RK4` (`step_sclerostin_rk4`, verified to $O(h^4)$ Richardson ratio `>= 14.5`) modeling scenario Sclerostin (`SOST`, `pmol/L`) with Frost threshold `1000 microstrain`, illustrative `MQI`, urinary calcium, and Martian `0.38g` Gait Asymmetry Index (`GAI`).
  - *Dimensionally Exact CGS Jugular Shear Stress:* $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}_{\text{cm}^2}(t)}$ ($\mu = 0.035\text{ Poise}$, `dyn/cm^2`) paired with an illustrative ocular/SANS scenario index (`ONSD`, choroidal delta).
  - *Two-Stage Bayesian POCUS Scenario Observer:* Pre-ultrasound scenario score is capped at `P_pre <= 0.45`; only explicit `pocus_thrombus_confirmed == true` updates odds via scenario `LR+ = 24.0` (`0.92..0.995`).
- **3-Tier `ARES-HyperGraph` & `AresUnifiedDatasetGraph`:** Longitudinal `WelfordAccumulator` compaction (`900 Martian Sols` in `167,352 B < 200 KB`), `5` `UBERON:` 3D regions, `6` deontic habitat zones + Markov $D_{\text{KL}}$, `16 B` `#[repr(C, align(16))] BiomedicalEvidenceDescriptor` (`CRC-8`, `O(1)` lookup `41.0 ns p50`), and `AresUnifiedDatasetGraph` (`110` nodes, `326` Biolink edges, `24` cataloged datasets, `27` BIDMC `TimeWindowSlice`s).
- **O(1) `NQS-STL` & Non-Crossing `Timestral` (`crates/ares-nqs-stl`):** Non-dimensionalizes physiological predicates onto `[-2.0, +1.0]` and evaluates rolling windows in $O(1)$ amortized time (`<= 3` comparisons/sample) via `LemireMinWedge` (verified against an $O(W)$ oracle on `2,000` sequences). The Pure-Rust `TimestralBackbone` (`CausalScaler` `asinh`/`sinh`, missing-channel mask, `RmsNorm`, `FusedSwiGlu`, `SinCosRoPe`, `DualAxisAttention`, optional `SHA-256`-verified `SafeTensors` loader with clean deterministic fallback) feeds a monotone `QuantileHead` ($q_{0.05} \le q_{0.50} \le q_{0.95}$, `0` crossings across `10,000` `proptest` trials). `ConformalAbstentionGate` emits `HEURISTIC_GATE_ACCEPTED` (or `ABSTAINED_FALLBACK`), and `ttv_predictor.rs` reports `ILLUSTRATIVE_SCENARIO_RANGE` (`0.5..720 h`), never calibrated 95% confidence intervals.

#### Phase 3 — ACT (30 Deterministic MedOps Playbooks `#01..=#30` & 7 Hard Clinical Safety Gates)
- **Deterministic Type-1 Playbooks (`crates/ares-medops-playbooks`, `< 20 us`):** Covers `30` deterministic MedOps playbooks (`#01..=#30`) spanning Core Microgravity (`#01..=#15`: venous stasis LBNP, confirmed IJV thrombus, ARED sarcopenia/osteopenia, SANS mitigation, SPE radiation shelter, acute desaturation/tachycardia/sensor loss/deterioration, renal lithiasis, Mars entry fluid loading, circadian light hygiene, viral immune valacyclovir, CO2 scrubber SANS, eFAST trauma triage) and Aerospace 360 Domains (`#16..=#30`: sepsis/septic shock `#16`, hemorrhagic trauma TXA `#17`, torso shock pericardiocentesis `#18`, conservative acute abdomen `#19`, EVA spine fracture `#20`, dental emergency `#21`, ocular burn `#22`, anaphylaxis airway `#23`, microgravity CPR `#24`, acute urinary retention POCUS `#25`, acute radiation syndrome `#26`, aerospace toxicology `#27`, EVA DCS/suit emergency `#28`, BMed psychiatric crisis `#29`, and female pelvic/urogyn POCUS `#30`).
- **Sex-Specific Aerospace Physiology (`Male`/`Female`):** `CrewBiologicalProfile` (`BiologicalSex::Male` / `BiologicalSex::Female`, `ContraceptiveRegimen`, `g6pd_deficient`) calibrates hematology, orthostatic tolerance, pharmacokinetics, radiation sensitivity (`REID`), and pelvic/urogyn POCUS (`#30`).
- **7 Hard Clinical Safety Gates (`4` Core + `3` Extended, `safety_gates.rs` & `safety_gates_360.rs`):**
  - *Core Gate 1 (Anticoagulation & Thrombocytopenia Lock):* Prohibits systemic anticoagulants when `pocus_thrombus_confirmed != true`, platelets `< 75.0 K/uL`, or acute radiation `> 10.0 mSv/d` with platelets `< 100.0 K/uL` (`GATE 1 LOCKED`).
  - *Core Gate 2 (LBNP Anti-Syncope Auto-Vent):* Immediately vents LBNP chamber to `0 mmHg` on dynamic baseline $\Delta\text{SBP} > 15\text{ mmHg}$, $\text{HR} > 115\text{ bpm}$, vasovagal bradycardia, pulse pressure `< 25 mmHg`, or telemetry blackout.
  - *Core Gate 3 (`0.38g` Mars Suit Damping):* Activates `+25%` EVA ankle/knee damping when Martian `GAI > 12%`.
  - *Core Gate 4A / 4B (Thoracic Decompression & EVA Fitness-For-Duty):* Locks needle thoracostomy without eFAST pneumothorax verification or shock collapse override (`4A`), and enforces EVA NO-GO on hemodynamic/cognitive/GAI instability (`4B`).
  - *Extended Gate 5 (5A/5B/5C Space Pharmacology):* Locks Ketorolac/NSAIDs on renal/bleeding/allergy risk (`5A`), blocks G6PD/beta-lactam/additive QTc `>= 500 ms` drugs (`5B`), and substitutes subpotent (`< 90%` USP) or depleted 900-Sol formulary stock (`5C`).
  - *Extended Gate 6 (ARS Neutropenic/Thrombocytopenic Invasive Lock):* Blocks non-emergent invasive procedures when `ANC < 0.5 K/uL` or `PLT < 75 K/uL`.
  - *Extended Gate 7 (7A/7B/7C BMed Delirium Exclusion & Restraint Guard):* Mandates reversible organic delirium exclusion (hypoxia, CO2, sepsis, toxicants) before psychiatric diagnosis and enforces CMRS/QTc/SpO2 safeguards.
- **Crew Privacy, Audit Chain & Edge Security (`crates/ares-security-privacy`):** Role-based redaction (`AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon`, `[V1 3003]` BMed isolation), chained `SHA-256` override log (`Sha256AuditLogger`), and `ChaCha20-Poly1305` Store-and-Forward encryption (`EphemeralDsnKey` with `ZeroizeOnDrop`).

### 3. Verified Engineering & Performance Metrics (Block K `--release`)
- **Workspace Integrity:** `9` Safe Rust 2024 crates (`0` `.unwrap()`/`.expect()` in production `crates/*/src/`), `323` passing workspace tests across `34` non-zero suites (`0` failed, `0` ignored), `0` Clippy warnings.
- **Latency & Memory (`N = 1,000`, `--release`):**
  - `SeqlockTelemetryRing::read_latest_bytes`: `p50 = 42.0 ns`, `p99 = 42.0 ns`, `p99.9 = 84.0 ns` (`+ CRC-32C`: `p50 = 791.0 ns`, `p99.9 = 959.0 ns`).
  - Full 1-tick pipeline (`compute_mission_telemetry_tick`): `p50 = 2.12 us`, `p99 = 2.25 us`, `p99.9 = 5.58 us`.
  - `AresUnifiedDatasetGraph` keyword query: `p50 = 16.25 us`; shortest path: `p50 = 16.33 us`; `BioKG` O(1) lookup: `p50 = 41.0 ns`.
  - Longitudinal compactor (`900 Sol`): `167,352 B` (`< 200 KB`); `AresUnifiedDatasetGraph` RAM est.: `196,264 B` (`< 10 MB`).

### 4. Explicit Evidence Boundary (`MODEL_EVIDENCE_AUDIT.md`)
All musculoskeletal, jugular, ocular, readiness (`MRI`), `TTV` (`ILLUSTRATIVE_SCENARIO_RANGE`), and `Timestral` outputs are explicitly tagged `ILLUSTRATIVE_UNVALIDATED`. Passing Rust numerical and property-based tests verifies deterministic software behavior, unit consistency, and non-crossing quantile ordering; it does **not** establish prospective clinical accuracy, calibrated probabilities, or flight certification. Phase 33 (`L5`) introduces a `SubjectDisjointSplit` CQR + Clopper-Pearson + Brier/ECE harness (`ares-calibrate`) gating any future status transition.

---

## Field 4: Tools, Coding Languages, Hardware & Software Used

- **Core Backend & Edge OS (`9` Crates, Safe Rust Edition 2024, `#![forbid(unsafe_code)]`):** `ares-core-types`, `ares-telemetry-ingest`, `ares-causal-graph`, `ares-nqs-stl`, `ares-medops-playbooks`, `ares-security-privacy`, `ares-storage-lsah`, `ares-server-cli` (`tokio`, `axum` `127.0.0.1:8080`, `FastMCP` `stdio` + HTTP `/api/mcp`, optional `shm-ipc` / `iceoryx2`), `ares-desktop-os` (`Tauri v2`, `Channel<Response>` `128 B` binary IPC, optional `offline-voice` `whisper-rs`).
- **Astronaut Cockpit (`ares-cockpit/`):** React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4 (`#000000` OLED dark theme), Three.js / `@react-three/fiber` (3D `UBERON:` heatmap + local `.glb` loader with `0x46546C67` guard), `DataView` `BinaryTelemetryFrame` decoder with Castagnoli `CRC-32C`, `Alt+Space` `OsCommandPalette`, `30` MedOps Playbooks (`#01..=#30`), `7` Hard Clinical Safety Gates (`4` Core + `3` Extended), and Sex-Specific Aerospace Physiology (`Male`/`Female`).
- **Tier B/C Deployment Manifests (`deploy/medos/`):** Declarative specifications for `Asterinas` Framekernel (`14.0%` TCB), `System76 COSMIC` Wayland Kiosk, and `Oxide Hubris` / `Embassy` wearable sensor MCU (`32 B` `WearableSensorPacket`).
- **Documentation & Verification Toolchain:** `Typst 0.15.1` (`SOURCE_DATE_EPOCH=1794670800` offline PDFs), `Python 3` stdlib verification suite (`scripts/build_submission_docs.sh`), `proptest`, and `scripts/agent_probe.sh` / `scripts/run_block_k_suite.sh`.

---

## Field 5: Use of Super Intelligence (SI) / Artificial Intelligence (AI) Disclosure

### 5.A Runtime On-Board AI Architecture (Air-Gapped & Safety-Bounded)
- **Zero-LLM Critical Path:** All ODE integration (`RK4`), CGS hemodynamics, `NQS-STL` margins, `Timestral` quantile cones, and MedOps Playbook / Safety Gate transitions execute deterministically in Safe Rust without any LLM in the loop (`DO-178C` DAL-E separation).
- **Local `FastMCP` & Edge Copilot (`edge_llm_bridge.rs`):** An optional local quantized LLM (default `llama3.2:3b-instruct-q4_K_M` via `Ollama` / `llama.cpp` on loopback) and offline voice interface (`whisper-rs` / local Web Speech API) may summarize telemetry and explain deterministic playbooks by invoking the `8` read-only `FastMCP` tools (`<= 600 B` / `< 150 tokens` per response). All untrusted telemetry fields pass through `StrictMcpSanitizer` wrapped in escaped `<untrusted_telemetry_observation>` delimiters against Indirect Prompt Injection. When no local LLM runtime is active, the system seamlessly falls back to `OfflineTemplateCopilot` (`< 400 us`).

### 5.B Development-Time SI / AI Tools Disclosure
- **AI / SI Engineering Assistants Utilized:** Google Antigravity, Anthropic Claude Code, OpenAI Codex, GitHub Copilot, and Cursor IDE.
- **Scope of Usage:** Literature synthesis across open NASA/CSA/ESA resources, dimensional consistency cross-checks (CGS $\tau_w$), property-based red-teaming (`proptest`), TypeScript/Rust boilerplate scaffolding, unit/chaos test expansion, and deterministic Typst documentation formatting.
- **Human Engineering Accountability:** All mathematical models, epistemic boundaries (`MODEL_EVIDENCE_AUDIT.md`, Issue #11, Issue #12), safety gate logic, code reviews, and verification gates were directed, audited, and validated by the five human team members. Every equation, safety threshold, and OSDR accession was verified via deterministic CI probes (`cargo test --workspace`, `cargo clippy -- -D warnings`, `npm test`).

---

## Field 6: Fresh-Code & OSI Open-Source License Audit

All project source code (`crates/`, `ares-cockpit/`, `scripts/`, `docs/submission/`) was developed fresh for NASA Space Apps Challenge 2026 and is released under dual **`MIT OR Apache-2.0`** (`Cargo.toml`, `ares-cockpit/package.json`, `LICENSE`, `LICENSE-APACHE`).

| Layer / Dependency | License | Role in `ARES-Health` |
| :--- | :--- | :--- |
| `tokio`, `axum`, `serde`, `clap`, `thiserror`, `tracing` | `MIT` / `MIT OR Apache-2.0` | Async runtime, loopback HTTP/WS server, serialization, CLI |
| `petgraph`, `proptest`, `sha2`, `chacha20poly1305`, `zeroize` | `MIT OR Apache-2.0` | `ADHG` / `DatasetGraph`, property tests, FIPS 180-4 & RFC 8439 crypto |
| `tauri` (`v2`), `safetensors`, `arrow` / `parquet` (opt.) | `MIT OR Apache-2.0` | Native workstation shell, `SafeTensors` parser, Parquet adapters |
| `react`, `three`, `@react-three/fiber`, `tailwindcss`, `vite` | `MIT` | Pure `#000000` OLED cockpit & 3D `UBERON:` rendering |
| `3D Anatomical Meshes` (`public/anatomy/*.glb`) | `CC-BY-SA-4.0` | Z-Anatomy / DBCLS BodyParts3D (see public/anatomy/ATTRIBUTION.md) |
| `typst` (`0.15.1`) | `Apache-2.0` | Air-gapped deterministic PDF pitch deck & blueprint compilation |
| `PhysioNet BIDMC v1.0.0` (`data/bidmc/`) | `ODC-By-1.0` | Bundled `1 Hz` terrestrial numeric replay & missing-value validation |
| `NASA OSDR / HRP / NLSP / LSAH / NASA-STD-3001` | US Federal Open Data | Biological context, cohort metadata & human-system requirements |

---

## Field 7: Master Multi-Agency Data & Standards Traceability Matrix

Per `docs/architecture/MODEL_EVIDENCE_AUDIT.md`, every external dataset, investigation, and standard is tagged with its exact **Evidence Role** so biological context and catalog metadata are never conflated with prospective clinical validation.

| # | Agency / Source | Dataset / Resource ID | Official URL | Integration in `ARES-Health` | Evidence Role (`MODEL_EVIDENCE_AUDIT.md`) |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | **PhysioNet** | `BIDMC PPG & Respiration v1.0.0` (`bidmc_01..03`) | https://physionet.org/content/bidmc/1.0.0/ | `BidmcReplayer` `1 Hz` replay (`481` rows, `13` nulls, `27` `TimeWindowSlice`s) | `RECORDED_REPLAY_INPUT` |
| 2 | **NASA OSDR** | `OSD-51` (60d HDBR Soleus/VL Transcriptome) | https://osdr.nasa.gov/bio/repo/data/studies/OSD-51 | Grounds soleus myofibrillar downregulation node in `ADHG` & `DatasetGraph` | `BIOLOGICAL_CONTEXT_ONLY` |
| 3 | **NASA OSDR** | `OSD-195` (21d Bedrest Skeletal Muscle) | https://osdr.nasa.gov/bio/repo/data/studies/OSD-195 | Grounds early-phase disuse transcriptional context in `DatasetGraph` | `BIOLOGICAL_CONTEXT_ONLY` |
| 4 | **NASA OSDR** | `OSD-570` & `OSD-571` (Inspiration4 / SOMA) | https://osdr.nasa.gov/bio/repo/data/studies/OSD-570 | Grounds `cf-mtDNA` / `cfRNA` / endothelial stress biomarkers in `BioKG` | `BIOLOGICAL_CONTEXT_ONLY` |
| 5 | **NASA OSDR** | `OSD-635` (Spaceflight Multi-Omics SOMA) | https://osdr.nasa.gov/bio/repo/data/studies/OSD-635 | Cataloged orbital multi-omics reference in `AresUnifiedDatasetGraph` | `BIOLOGICAL_CONTEXT_ONLY` |
| 6 | **NASA OSDR** | `OSD-818` (*Ex Vivo* Translaminar SANS) | https://osdr.nasa.gov/bio/repo/data/studies/OSD-818 | Grounds `ICP - IOP` translaminar pressure context in `ADHG` | `BIOLOGICAL_CONTEXT_ONLY` |
| 7 | **NASA OSDR** | `Rodent Research RR-1..RR-10` (`OSD-48`, `OSD-379`) | https://osdr.nasa.gov/bio/repo/ | Cross-species osteocyte/muscle gene expression context in `DatasetGraph` | `BIOLOGICAL_CONTEXT_ONLY` |
| 8 | **NASA NLSP** | `NASA-0000100` (`BRSMFSR`, `BRSMPT`, `FAP`, `SMCCP`) | https://nlsp.nasa.gov/explore | Grounding for `0.38g` stretch reflex (`GAI`) & LBNP tilt guardrail context | `CATALOG_GRAPH_METADATA` |
| 9 | **NASA LSAH** | `LSAH` Longitudinal Epidemiology | https://nlsp.nasa.gov/resources/lsah | Longitudinal bone DXA/FRAX & SANS prior metadata in Cold Tier | `BIOLOGICAL_CONTEXT_ONLY` |
| 10 | **NASA HRP** | `HRP Risks`, `ARCHeR`, `Venous Haemostasis`, `Zero T2`, `CIPHER` | https://www.nasa.gov/hrp/risks/ | Maps `ADHG` nodes & Playbooks `#01-#05` to official HRP Risk IDs | `NORMATIVE_REQUIREMENT_CONTEXT` |
| 11 | **NASA Standards** | `NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F`, `OCHMO MTB-007` | https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1 | Enforces `[V1 3001]`-`[V2 10152]` latency, OLED UI, privacy & EIMO clauses | `NORMATIVE_REQUIREMENT_CONTEXT` |
| 12 | **NASA Analogs** | `CHAPEA` (378d Mars), `HERA`, `NSRL GCR`, `ISS Acoustic` | https://www.nasa.gov/humans-in-space/chapea/ | Validates `OWLT 4-24 min` EIMO UX, `ppCO2`/acoustic limits & `CANS` context | `NORMATIVE_REQUIREMENT_CONTEXT` |
| 13 | **CSA** | `CSA CANS` (Feb 2026 Neutron Spectrometer) | https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp | Real-time `radiation_dose_rate_msv_d` field & Playbook `#05` threshold | `BIOMEDICAL_SCHEMA_CONTEXT` |
| 14 | **CSA** | `Bio-Monitor`, `Vascular Aging`, `MARROW` | https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp | Continuous wearable & vascular stiffness schema context | `BIOMEDICAL_SCHEMA_CONTEXT` |
| 15 | **ESA** | `Myotones` (Sept 2026) & `BRACE` 60d HDBR | https://www.esa.int/ESA_Multimedia/Images/2026/09/Myotones_Studying_muscle_adaptation_to_weightlessness | Achilles tendon stiffness & soleus tone coupling context for `MQI` | `BIOLOGICAL_CONTEXT_ONLY` |
| 16 | **DLR / IBMP** | `:envihab` `AGBRESA` / `SANS-CM`, `MARS-500`, `SIRIUS-19/21` | https://www.dlr.de/en/research-and-transfer/projects-and-missions/bed-rest-studies | `-6 deg` HDBR + LBNP / isolation analog catalog nodes in `DatasetGraph` | `CATALOG_GRAPH_METADATA` |
| 17 | **NASA / TRISH / JAXA** | `EXPAND`, `HERMES`, `Bisphosphonates` | https://www.nasa.gov/hrp/the-translational-research-institute-for-space-health-trish/ | POCUS procedural context & renal citrate countermeasure grounding | `BIOLOGICAL_CONTEXT_ONLY` |
| 18 | **PhysioNet** | `CEBS` (`v1.0.0`) & `Fantasia` (`v1.0.0`) | https://physionet.org/content/cebsdb/1.0.0/ | Waveform R-R (`waveform_rr_extractor.rs`) & radar/ballistocardiography benchmark | `TECH_BENCHMARK_ONLY` |
| 19 | **PhysioNet** | `MIT-BIH Arrhythmia`, `PTB-XL`, `MIMIC-IV Demo`, `HiRID`, `Tilt Table` | https://physionet.org/ | Cataloged terrestrial clinical reference & Parquet adapter targets (Phase 33) | `CATALOG_GRAPH_METADATA` |
| 20 | **NHLBI / NIH / GT / UCI** | `MESA Sleep`, `SHHS`, `Look AHEAD`, `GTEA`, `PPG-DaLiA` (`CC BY 4.0`) | https://archive.ics.uci.edu/dataset/495/ppg+dalia | Nocturnal sleep/activity/motion-artifact `SQI` benchmark catalog nodes | `CATALOG_GRAPH_METADATA` |
