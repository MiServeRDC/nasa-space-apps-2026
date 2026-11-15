# ARES-Health: Master Project Overview

> **Evidence Status (Issue #11 & Issue #12):** Terrestrial `PhysioNet BIDMC v1.0.0` recordings (`RECORDED_TERRESTRIAL_BIDMC_CSV`) are strictly segregated from scenario-derived physiological and predictive models, which remain **illustrative and clinically unvalidated** (`ILLUSTRATIVE_UNVALIDATED`, `ILLUSTRATIVE_SCENARIO_RANGE`, `HEURISTIC_GATE_ACCEPTED`). On purely numerical `1 Hz` `BIDMC` records lacking native R-R intervals, `rmssd_ms` remains `null` (`BEAT_INTERVALS_NOT_AVAILABLE`) and is never imputed with healthy default values. Consult [MODEL_EVIDENCE_AUDIT.md](docs/architecture/MODEL_EVIDENCE_AUDIT.md) for the complete register of mathematical equations, bounds, and required clinical validation work.

## Unified Master Blueprint (NASA Space Apps Challenge 2026)

- **Project Name:** **ARES-Health** (*Autonomous Resilient Edge-native System for Astronaut Health*) / **`ARES-MedOS v0.1`** Workstation
- **Lead Architect:** Fabio Malagutti (`@fabiomalagutti27-droid`, University of Bologna)
- **Team (`MiServeRDC/nasa-space-apps-2026`):** `@fabiomalagutti27-droid`, `@carolina2910`, `@fertech02`, `@LelloXV`, `@MiServeRDC`
- **Official NASA Challenge:** *"Create Health Monitoring Software for Astronauts on Space Missions"* (`https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/`)
- **Operational Domain:** Earth-to-Mars Transit, Deep Space Habitat, Lunar Gateway, Martian Surface (`0.38g`)
- **Operational Principles:** 100% Offline, Air-Gapped, Zero Cloud Dependencies, Safe Rust 2024 (`8` crates, zero `.unwrap()`/`.expect()` in production code), **`MIT OR Apache-2.0`** Dual License

---

## 1. Mission Vision & Operational Challenge

In Low Earth Orbit (ISS), astronauts benefit from near-real-time telemedicine with flight surgeons in Houston. Beyond cislunar space, the physics of deep-space communications renders cloud computing and terrestrial telemedicine impossible:

- **Speed-of-Light Latency Barrier:** During Earth-Mars transit, one-way light time (`OWLT`) ranges between **4 and 24 minutes** (**8 to 48 minutes round-trip**), with complete blackout periods lasting up to **14 days** during solar conjunctions (`NASA CHAPEA`, `NASA-STD-3001 Vol. 1 [V1 3006]` *Earth-Independent Medical Operations — EIMO*).
- **The 5 `RIDGE` Hazards:** *Radiation*, *Isolation/Confinement*, *Distance from Earth*, *Gravity fields* ($0g \to 0.38g$), and *Hostile closed Environment*.
- **Canonical NASA Mandate:** Close the loop directly on board across three distinct phases: **`GATHER -> EVALUATE -> ACT`**, preserving honest telemetry missingness and enforcing deterministic safety interlocks.

---

## 2. Functional Loop: `GATHER -> EVALUATE -> ACT` (Real Implementation)

### Phase 1: `GATHER` (`crates/ares-telemetry-ingest`)
- **Deterministic `PhysioNet BIDMC v1.0.0` Replayer (`bidmc_replayer.rs`):** `1.0 Hz` ingestion of numerical records `bidmc_01..03_Numerics.csv` (`481` rows `0..480 s`, `ODC-By-1.0`), verified by `SHA-256` against `data/bidmc/MANIFEST.json`, trimming leading-whitespace headers (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`), and decoupled from the `20 Hz` UI streaming loop.
- **Honest Missingness Handling (Issue #4 & Issue #11):** The `13` missing samples of `PULSE`/`SpO2` in `bidmc_01` remain `Option<f64>::None` (`null` / `MISSING`), never substituted with `0.0`. On purely numerical `1 Hz` records, `rmssd_ms` and dependent HRV parameters remain `None` with explicit provenance `BEAT_INTERVALS_NOT_AVAILABLE` and degraded severity `DATA_DEGRADED_MISSING_CHANNELS`.
- **Numerical Signal Quality Heuristic & ZOH (`sqi_filter.rs`):** Computes a Shannon spectral entropy heuristic on HR differences over a 16-sample window ($0.96 - 0.14\,h_{\text{norm}} - 0.18\,f_{\text{miss}}$) with bounded *Zero-Order Hold* (`30 s`: `HOLD_LAST_VALID` $\to$ `HELD_STALE` $\to$ `UNAVAILABLE`).
- **Level-1 Pure-Rust DSP (`Phase 31 / L3`):** `60/5.2 GHz` I/Q radar demodulator with Jury-stable `60/120 Hz` biquad notch cascade for ECLSS ventilation fan suppression (`radar_csi_dsp.rs`), `YIN` voice biomarker extractor ($F_0$, `HNR`, jitter, shimmer, returning `None` on silence, `vocal_acoustic_dsp.rs`), Pan-Tompkins `125–500 Hz` R-R extractor with Malik $\pm 20\%$ ectopic filter (`waveform_rr_extractor.rs`), and `32 B` `WearableSensorPacket` with `CRC-16-CCITT` and Oxide Hubris reboot counter.

### Phase 2: `EVALUATE` (`crates/ares-causal-graph` & `crates/ares-nqs-stl`)
- **`ADHG` Causal Graph & Scenario Models (`crates/ares-causal-graph`):**
  - *Muscle-Bone Mechanotransduction (`mechanotransduction.rs`):* Sclerostin (`SOST`, `pmol/L`, Frost threshold $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$) scenario ODE integrated via **12 fixed-step RK4** ($O(h^4)$ convergence verified by Richardson step-halving `ratio >= 14.5`), coupled with illustrative `MQI`, urinary calcium, and `GAI` (`0.38g`) proxies.
  - *CGS Jugular Hemodynamics & `SANS` (`hemodynamics.rs`):* Dimensionally exact endothelial wall shear stress $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}_{\text{cm}^2}(t)}$ ($\mu = 0.035\text{ Poise}$, `dyn/cm^2`) and translaminar scenario proxy for `ONSD`/`SANS`.
  - *Two-Stage Bayesian `POCUS` Observer (`bayesian_pocus.rs`):* Stage 1 is capped at $P_{\text{pre}} \le 0.45$ under isolated hemodynamic stasis; only verified non-compressible intraluminal thrombus (`pocus_thrombus_confirmed == true`) triggers Stage 2 (`LR+ = 24.0`, clamped to `0.92..0.995`).
  - *`ARES-HyperGraph` & `AresUnifiedDatasetGraph`:* Welford longitudinal compaction (`900 Sol` mission in `167,352 B < 200 KB`), `5` 3D anatomical regions (`UBERON:`), `6` deontic habitat zones with Markov $D_{\text{KL}}$, `16 B` `#[repr(C, align(16))] BiomedicalEvidenceDescriptor` (`CRC-8`, `O(1)` lookup `41.0 ns p50`), and unified multi-dataset graph (`110` nodes, `326` Biolink edges, `24` cataloged datasets, `27` `BIDMC` slices, with optional `--features parquet-ingest` adapters).
- **`NQS-STL` $O(1)$ Solver & `Timestral` Co-Processor (`crates/ares-nqs-stl`):**
  - Dimensionless normalization on `[-2.0, +1.0]` and sliding-window temporal operator $\Box_{[t-W,t]}\hat{\rho}_k$ computed in amortized $O(1)$ time via `LemireMinWedge` (benchmarked against $O(W)$ oracle across `2,000` sequences).
  - Pure-Rust `TimestralBackbone` co-processor (`CausalScaler` `asinh`/`sinh`, explicit missing-channel mask, `RmsNorm`, `FusedSwiGlu`, `SinCosRoPe`, `DualAxisAttention`, `SHA-256` verified `SafeTensors` loader with deterministic fallback), and monotonic `QuantileHead` ($q_{0.05} \le q_{0.50} \le q_{0.95}$, `0` crossings across `10,000` `proptest` trajectories).
  - `ConformalAbstentionGate` (`HEURISTIC_GATE_ACCEPTED` / `ABSTAINED_FALLBACK`), `TTV` forecast intervals tagged `ILLUSTRATIVE_SCENARIO_RANGE` (`0.5..720 h`), and subject-disjoint `CQR` + Clopper-Pearson + Brier/ECE calibration harness (`calibration_harness.rs`, Phase 33 `L5`) required before any transition away from `ILLUSTRATIVE_UNVALIDATED`.

### Phase 3: `ACT` (`crates/ares-medops-playbooks`, `ares-security-privacy`, `ares-server-cli`, `ares-desktop-os`, `ares-cockpit`)
- **5 Type-1 Crystallized Playbooks (`playbooks.rs`, `< 20 us`, zero generative LLM in the critical clinical loop):**
  1. `PLAYBOOK_01_VENOUS_STASIS_LBNP` (`-30 mmHg` LBNP for `45 min` + calf muscle pump + serial IJV POCUS scanning)
  2. `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS` (anticoagulation unlocked ONLY upon B-mode POCUS thrombus confirmation + immediate cessation of Valsalva squats on ARED)
  3. `PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED` (ARED mechanical load `>= 125 kgf` / `> 1000` microstrain + oral hydration `>= 2.8 L/d` with potassium citrate)
  4. `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION` (lower-extremity venoconstrictive thigh cuffs `50 mmHg` + nighttime LBNP session)
  5. `PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS` (immediate storm shelter ingress if `CSA CANS > 1.5 mSv/d` + endothelial radioprotection)
- **3 Hard Clinical Safety Gates (`safety_gates.rs`):**
  - *Gate 1 (Anticoagulation Interlock):* Strictly locks systemic anticoagulant delivery if `pocus_thrombus_confirmed != true` (`GATE 1 LOCKED`).
  - *Gate 2 (LBNP Anti-Syncope Auto-Vent):* Immediately vents negative pressure chamber to `0 mmHg` if $\Delta\text{SBP} > 15\text{ mmHg}$ or $\text{HR} > 115\text{ bpm}$.
  - *Gate 3 (`0.38g` Mars Suit Damping):* Engages `+25%` EVA suit ankle/knee actuator damping if `GAI > 12%`.
- **Security, Privacy & Audit (`ares-security-privacy`):** 3-tier Role-Based Crew Medical Privacy (`AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon`), tamper-evident `SHA-256` audit chain (`Sha256AuditLogger`), `ChaCha20-Poly1305` AEAD encryption with `ZeroizeOnDrop` (`EphemeralDsnKey`), and `<untrusted_telemetry_observation>` containment boundary (`StrictMcpSanitizer`) preventing *Indirect Prompt Injection*.

---

## 3. Concrete Topology: 8-Crate Safe Rust Workspace + `ARES-MedOS`

The production architecture organizes functionality into **8 Safe Rust 2024 crates** and the **`ares-cockpit`** frontend (`React 19`, `TypeScript 5.7`, `Tailwind CSS 4`, `Three.js` / `@react-three/fiber`):

| Crate / Module | Core Architectural Responsibility |
| :--- | :--- |
| `crates/ares-core-types` | Telemetry contracts (`TelemetryPacket`, `ProvenanceManifest`), `NASA-STD-3001` constants, `BinaryTelemetryFrame` (`128 B` `#[repr(C, align(64))]`, `CRC-32C`), `Timestral` types, and `ModelValidationStatus`. |
| `crates/ares-telemetry-ingest` | `BIDMC v1.0.0` replay (`1 Hz`, `null`-safe), `SQI` filter, What-If overlay, `WearableSensorPacket` (`32 B` `CRC-16`), and pure DSP modules (`radar_csi_dsp`, `vocal_acoustic_dsp`, `waveform_rr_extractor`). |
| `crates/ares-causal-graph` | `ADHG` causal graph (`petgraph`), RK4 Sclerostin ODE, CGS $\tau_w$ shear stress, POCUS observer, `ARES-HyperGraph` (Welford `900 Sol`, `UBERON:`, deontic zones), `BioKG` (`16 B`), `AresUnifiedDatasetGraph` (`24` sources), and `parquet_adapters`. |
| `crates/ares-nqs-stl` | `NQS-STL` normalizer, $O(1)$ `LemireMinWedge`, `TimestralBackbone` + monotonic `QuantileHead`, `ConformalAbstentionGate`, `SafeTensors` `SHA-256` loader, and `calibration_harness` (Phase 33 `L5`). |
| `crates/ares-medops-playbooks` | Type-1 DAG playbook runner (`#01–#05`), 3 Hard Clinical Safety Gates, and normative grounding to `NASA-STD-3001` & `OCHMO MTB-007`. |
| `crates/ares-security-privacy` | Role-based medical privacy (`NASA-STD-3001 Ch. 7`), `SHA-256` audit chain, `ChaCha20-Poly1305` AEAD (`ZeroizeOnDrop`), and `StrictMcpSanitizer`. |
| `crates/ares-server-cli` | `axum` dual-transport server (`127.0.0.1:8080`, `20 Hz` WS + REST `/api/snapshot`, `/api/stress-test`, `/api/os-status`, `/api/binary-frame`, `/api/mcp`), `FastMCP` `stdio` (`8` tools `<= 600 B`), `SeqlockTelemetryRing`, `edge_llm_bridge`, and `ares-calibrate`. |
| `crates/ares-desktop-os` | Native `Tauri v2` `ARES-MedOS` shell (`Channel<Response>` `128 B`, `--mode desktop` / `desktop-smoke-test`, offline `whisper-rs` hook). |
| `ares-cockpit/` | Pure `#000000` OLED cockpit (`[V2 10001]`): `OsSystemStatusBar`, `OsCommandPalette` (`Alt+Space`), `OsVoiceCopilot`, `ProvenanceInspector`, `BodyHeatmap` (`UBERON:` + `.glb` security guard), `WhatIfConsole`, `MriAndStl`, `PlaybookRunner`. |
| `deploy/medos/` & `scripts/` | Tier B/C manifests (`Asterinas`, `COSMIC` Wayland Kiosk, `Oxide Hubris`), `launch_ares_medos.sh`, `run_block_k_suite.sh`, `agent_probe.sh`, `build_submission_docs.sh`. |

---

## 4. Development Progress & Verified Metrics

- **Blocks `A–K` (`Phases 01–28`):** Verified on `main` with **`126/126` passing tests across `28` suites**, zero Clippy warnings, and zero `.unwrap()`/`.expect()` in production code (`crates/*/src/`).
- **`--release` Performance Benchmarks (`N = 1,000`, Block K4):**
  - `SeqlockTelemetryRing::read_latest_bytes`: `p50 = 42.0 ns`, `p99 = 42.0 ns`, `p99.9 = 84.0 ns` (`+ CRC-32C`: `p50 = 791.0 ns`, `p99.9 = 959.0 ns`).
  - Full single-tick pipeline latency: `p50 = 2.12 us`, `p99 = 2.25 us`, `p99.9 = 5.58 us`.
  - `AresUnifiedDatasetGraph`: query `p50 = 16.25 us`, shortest path `p50 = 16.33 us`, `BioKG` O(1) `p50 = 41.0 ns`, estimated RAM `196,264 B` (`< 10 MB`).
  - `900 Sol` longitudinal compactor: `167,352 B` (`< 200 KB`).
- **Block `L` (`Phases 29–34` / `L1–L6`):** Cockpit live bindings (`L1`), native `Tauri v2` window + `shm_bus` (`L2`), Level-1 `GATHER` pure DSP (`L3`), Edge LLM + Voice Copilot + `SafeTensors` (`L4`), Parquet adapters + subject-disjoint `CQR` calibration harness (`L5`), and deterministic NASA Space Apps 2026 packaging pipeline (`L6`).

---

## 5. Multi-Agency Evidence Matrix (`24` Cataloged Datasets)

Inside `AresUnifiedDatasetGraph` (`data/knowledge_graph/GRAPH_REPORT.md`: `110` nodes, `326` Biolink edges, `24` cataloged datasets, `27` `BIDMC` slices) and throughout the submission dossier, every resource maintains its explicit epistemic role according to [MODEL_EVIDENCE_AUDIT.md](docs/architecture/MODEL_EVIDENCE_AUDIT.md):

| Category / Space Agency | Resources & Identifiers | Formal Evidence Role in `ARES-Health` |
| :--- | :--- | :--- |
| **PhysioNet (Primary Replay)** | `BIDMC v1.0.0` (`bidmc_01..03`, `ODC-By-1.0`) | `RECORDED_REPLAY_INPUT`: real `1 Hz` source, `SHA-256` verified, `13` missing samples preserved. |
| **NASA OSDR / GeneLab** | `OSD-51`, `OSD-195`, `OSD-570`, `OSD-571`, `OSD-635`, `OSD-818`, `Rodent Research RR-1..RR-10` | `BIOLOGICAL_CONTEXT_ONLY`: transcriptomic mechanisms, *ex vivo* SANS and endothelial pathways in `BioKG`. |
| **NASA HRP, NLSP, LSAH & Analogs** | `HRP Risks`, `ARCHeR`, `Zero T2`, `CIPHER`, `NASA-0000100` (`BRSMFSR`, `BRSMPT`), `LSAH`, `CHAPEA`, `HERA` | `CATALOG_GRAPH_METADATA` / `NORMATIVE_REQUIREMENT_CONTEXT`. |
| **NASA Standards** | `NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F`, `OCHMO MTB-007`, `NSRL GCR`, `ISS Acoustic` | `NORMATIVE_REQUIREMENT_CONTEXT`: clauses `[V1 3001]`–`[V2 10152]`, privacy tiers, and EIMO protocols. |
| **CSA, ESA, DLR, JAXA, TRISH** | `CSA CANS (2026)`, `Bio-Monitor`, `Vascular`, `MARROW`, `ESA Myotones`, `BRACE`, `AGBRESA`, `MARS-500`, `SIRIUS`, `EXPAND`, `Bisphosphonates` | `BIOLOGICAL_CONTEXT_ONLY` / `BIOMEDICAL_SCHEMA_CONTEXT`. |
| **Terrestrial Benchmarks (PhysioNet / NIH / UCI)** | `CEBS`, `Fantasia`, `PPG-DaLiA`, `MIT-BIH`, `PTB-XL`, `MIMIC-IV`, `HiRID`, `Tilt Table`, `MESA`, `SHHS`, `Look AHEAD`, `GTEA` | `TECH_BENCHMARK_ONLY` / `CATALOG_GRAPH_METADATA` (including Phase 33 Parquet targets). |

---

## 6. Hackathon Rules, Fresh Code, AI Disclosure & Official Links

- **Fresh Code & Licensing:** All codebase software (`crates/`, `ares-cockpit/`, `scripts/`) is released under the permissive dual license **`MIT OR Apache-2.0`** ([LICENSE](LICENSE)), relying solely on standard open-source dependencies (`tokio`, `axum`, `petgraph`, `tauri`, `react`, `three`) and cited public datasets.
- **AI Transparency & Disclosure:** The optional local LLM (`edge_llm_bridge.rs` / `FastMCP` `<= 600 B`) operates strictly in a read-only consultative role (`DAL-E`), bounded by `<untrusted_telemetry_observation>` with `< 400 us` deterministic fallback; zero ODE simulations or safety-critical clinical gates are delegated to generative models.
- **Key Reference Documents:**
  - [MODEL_EVIDENCE_AUDIT.md](docs/architecture/MODEL_EVIDENCE_AUDIT.md) — Authoritative Evidence Ledger (Issue #12)
  - [docs/scientific_references.md](docs/scientific_references.md) — Peer-Reviewed Bibliography & Standards (Sections `1–11`)
  - [docs/plans/BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md](docs/plans/BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md) — Block L Architecture (`Phases 29–34`)
  - [docs/submission/NASA_2026_7_SLIDE_DECK.typ](docs/submission/NASA_2026_7_SLIDE_DECK.typ) & [docs/submission/NASA_SUBMISSION_PORTAL_READY.md](docs/submission/NASA_SUBMISSION_PORTAL_READY.md) — Official NASA Space Apps 2026 Submission Package
  - [09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md) & [11_Official_Submission_Guide_and_Ready_To_Paste_Form.md](11_Official_Submission_Guide_and_Ready_To_Paste_Form.md)
  - [contracts/telemetry_schema.json](contracts/telemetry_schema.json) — Shared Rust / TypeScript Telemetry Schema
