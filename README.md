# ARES-Health

## Abstract

Long-duration exploration missions expose crews to space radiation, isolation and confinement, altered gravity, and a hostile closed environment, producing immune, musculoskeletal, cardiovascular, and behavioral deconditioning. Beyond lunar distance, the speed-of-light barrier makes real-time ground support impossible: Earth–Mars one-way latency is 4–24 minutes (an 8–48 minute round trip), and solar conjunction imposes communication blackouts of up to two weeks every ~26 months. Any architecture that depends on cloud APIs or Internet-hosted models is therefore invalid for deep space.

**ARES-Health** addresses this by relocating the entire *gather -> evaluate -> act* loop onto the vehicle as a deterministic, offline edge system. A Safe-Rust engine ingests multimodal biosignals, models non-linear multi-organ coupling on an Astronaut Dynamic Health Graph (ADHG), quantifies a continuous margin of safety with Normalized Quantitative Semantics Signal Temporal Logic (NQS-STL), and emits deterministic, gated countermeasures through NASA MedOps playbooks. A microgravity-optimized React cockpit renders the results as a Mission Readiness Index, a 3D anatomical deconditioning map, and an interactive playbook runner. The system runs with zero external dependencies.

---

## Table of Contents

1. [Mission & Challenge](#1-mission--challenge)
2. [Problem Statement](#2-problem-statement)
3. [The Three Mandates: Gather, Evaluate, Act](#3-the-three-mandates-gather-evaluate-act)
4. [System Architecture](#4-system-architecture)
5. [Repository Structure](#5-repository-structure)
6. [Rust Workspace: Crate Roster](#6-rust-workspace-crate-roster)
7. [Quickstart](#7-quickstart)
8. [Data, Provenance & Evidence Boundary](#8-data-provenance--evidence-boundary)
9. [Compliance, Licensing & Clean-Room Mandate](#9-compliance-licensing--clean-room-mandate)
10. [Team](#10-team)
11. [References & Data Sources](#11-references--data-sources)

---

## 1. Mission & Challenge

| Field | Value |
| :--- | :--- |
| **Project** | ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health) |
| **Competition** | NASA Space Apps Challenge 2026 (November 14–15, 2026) |
| **Challenge track** | [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) |
| **Mission domain** | Earth–Mars transit (1000-day class), Lunar Gateway, Martian surface operations |
| **Core constraint** | 100% air-gapped, zero-cloud, deterministic autonomous execution |

> *"Your challenge is to build a health monitoring software that gathers health indicators and enables astronauts to evaluate and act on the status of their health."* — Official NASA prompt.

---

## 2. Problem Statement

The defining engineering constraint is the **speed-of-light latency barrier**, which forbids any ground-in-the-loop clinical workflow:

```
+------------------+        8 - 48 min round-trip delay        +-----------------------+
|  EARTH MCC       | <=======================================> |  DEEP SPACE HABITAT   |
|  Flight Surgeons |          (cloud APIs impossible)          |  Autonomous Astronaut |
+------------------+                                           +-----------------------+
                                                                           |
                                                                           v
                                                               +-----------------------+
                                                               |      ARES-HEALTH      |
                                                               |  Air-Gapped Edge Core |
                                                               +-----------------------+
```

- **Lunar orbit (Gateway):** ~1.3 s one-way — telemedicine is strained but possible.
- **Mars transit & surface:** 4–24 min one-way — autonomy is mandatory.
- **Solar conjunction:** full blackouts up to ~2 weeks every ~26 months.

**Design consequence.** All sensing, inference, decision support, and audit logging execute on-vehicle. Ground synchronization, when a link exists, is **store-and-forward** over an encrypted packet, never a runtime dependency.

---

## 3. The Three Mandates: Gather, Evaluate, Act

ARES-Health decomposes the NASA prompt into three sequential phases, mirrored across the codebase.

### 3.1 GATHER — multimodal acquisition
Ingests heterogeneous biosignals (heart rate, ECG, respiration, core temperature, sleep) and fuses them with environmental stressors (cabin CO2, acoustic load, cumulative radiation dose, mission-elapsed microgravity days). Deterministic BIDMC replay, a Shannon spectral-entropy Signal Quality Index (SQI), and explicit missing-value handling filter motion artifacts and sensor decoupling without silent imputation.

### 3.2 EVALUATE — predictive, coupled diagnostics
Transcends static thresholds by modeling non-linear coupling between organ systems on the **Astronaut Dynamic Health Graph (ADHG)**: how muscle atrophy drives bone loss, and how cephalic fluid shifts plus loss of the calf muscle pump raise venous-stasis and thrombotic risk. A continuous quantitative margin of safety is computed with **NQS-STL** (`rho_hat ∈ (−∞, +1.0]`), and a 7-day EWMA-OLS Time-To-Violation (TTV) forecast feeds a composite **Mission Readiness Index** (`MRI ∈ [0, 100]`).

### 3.3 ACT — deterministic, gated countermeasures
Emits actionable countermeasures through NASA MedOps playbooks (#01–#05) implemented as deterministic state machines, each protected by **Hard Clinical Safety Gates** (for example: no empirical anticoagulation without POCUS-confirmed thrombus). Outputs span adaptive resistive-exercise prescriptions, medical-kit posology, environmental adjustments, and step-by-step ultrasound probe guidance.

---

## 4. System Architecture

ARES-Health is a **dual-transport hybrid**: a Safe-Rust core engine and a React cockpit, communicating over two concurrent, isolated channels.

```
                       ARES-ENGINE  (Safe Rust / Tokio)
   +-----------------------------------------------------------------------+
   |  GATHER            EVALUATE                        ACT                 |
   |  telemetry-ingest  causal-graph (ADHG)  nqs-stl    medops-playbooks    |
   |  (BIDMC + SQI)     Frost-Hargens ODE    Lemire O(1)   + Safety Gates   |
   |                    Bayesian POCUS       TTV / MRI                      |
   |                                                                       |
   |  core-types   .   storage-lsah (hot/warm/cold)   .   security-privacy |
   +---------------+-------------------------------------+-----------------+
                   | axum REST + 20 Hz WebSocket         | stdio FastMCP
                   | 127.0.0.1:8080                      | JSON-RPC 2.0 (<150 tok)
                   v                                     v
        ARES-COCKPIT (React 19 / TS / Three.js)    Local quantized AI copilot
        MRI gauge | 3D deconditioning map |        (offline, context-mode)
        What-If Stress-Test Console | Playbook Runner
```

- **Core engine (`ares-server-cli`):** a Tokio orchestrator running an `axum` REST + 20 Hz WebSocket server on `127.0.0.1:8080` for the cockpit and the sub-millisecond What-If Stress-Test Console, **concurrently** with a dedicated `stdio` JSON-RPC 2.0 FastMCP server (<150 tokens per response) for a local, quantized AI copilot. The two transports are fully isolated.
- **Cockpit (`ares-cockpit`):** React 19 + TypeScript + Tailwind CSS v4 + Three.js / React-Three-Fiber, a high-contrast OLED dark dashboard with a tri-phase header `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`.
- **Native shell (`ares-desktop-os`):** an optional pure-Rust mission-workstation OS shell with a seqlock 128-byte binary IPC bridge and a FastMCP command-palette runtime.

Telemetry on the wire is governed by a single source of truth, [`contracts/telemetry_schema.json`](contracts/telemetry_schema.json); all Rust/React exchange must conform to it.

---

## 5. Repository Structure

```
NASA_Space_Apps_2026/
├── crates/                  # Rust backend — the ares-engine workspace (9 crates)
├── ares-cockpit/            # React cockpit — astronaut UI, 3D digital twin
├── contracts/               # JSON Schemas and interface contracts (telemetry_schema.json)
├── data/                    # Physiological test datasets (BIDMC / PhysioNet, knowledge graph)
├── scripts/                 # Test, probe, and build scripts (.sh, .py, .mjs)
│
├── docs/                    # Technical and clinical documentation
│   ├── dossier/             # The 12 numbered dossier files (00_ … 11_)
│   ├── architecture/        # System, cockpit, and crate blueprints; evidence audit
│   ├── team/                # Ownership and task coordination
│   ├── submission/          # NASA submission package, Typst and PDF deliverables
│   └── REFERENCES.md         # Bibliography: papers, standards, and datasets
│
├── memory-bank/             # Context and tracking files for AI coding agents
│
├── .github/                 # CI/CD workflows, CODEOWNERS, issue templates
├── .agents/ .claude/ .gemini/ # Agent prompt configuration and skill extensions
│
├── Cargo.toml               # Rust workspace manifest
├── Cargo.lock
├── LICENSE / LICENSE-APACHE # Dual MIT OR Apache-2.0
├── AGENTS.md                # Universal AI-agent specification
└── README.md                # This file — project showcase and entry point
```

---

## 6. Rust Workspace: Crate Roster

The backend is partitioned into **nine decoupled Safe-Rust crates** so that teammates can implement, test, and verify subsystems in parallel with near-zero merge conflict. The original seven-crate core (`core-types` through `server-cli`) was later extended with `desktop-os` and `storage-lsah`.

| Crate | Phase / Role | Core responsibility |
| :--- | :--- | :--- |
| `ares-core-types` | Foundation | Telemetry contracts, provenance manifest, NASA-STD-3001 boundary constants, typed errors, and abstract `CrewPrivacyFilter` / `MedOpsAuditLogger` traits. |
| `ares-telemetry-ingest` | **GATHER** | Deterministic PhysioNet BIDMC v1.0.0 CSV replayer, Shannon spectral-entropy SQI filter (`SQI >= 0.70`), and scenario-overlay merger with explicit null handling. |
| `ares-causal-graph` | **EVALUATE (2A)** | ADHG via `petgraph`, regularized Frost-Hargens sclerostin/irisin ODEs (RK4), ultrasound Muscle Quality Index, dimensional jugular wall shear stress, and a Two-Stage Bayesian POCUS state observer. |
| `ares-nqs-stl` | **EVALUATE (2B)** | `O(1)` Lemire monotonic-wedge NQS-STL evaluator (`rho_hat ∈ (−∞, +1.0]`), 7-day EWMA-OLS Time-To-Violation, and composite Mission Readiness Index. |
| `ares-medops-playbooks` | **ACT** | Deterministic state machines for NASA MedOps Playbooks #01–#05 enforcing the three Hard Clinical Safety Gates. |
| `ares-security-privacy` | Governance | Role-based crew privacy views (NASA-STD-3001 Vol. 1 Ch. 7), SHA-256 hash-chain audit logging, ChaCha20-Poly1305 store-and-forward AEAD, and a FastMCP prompt shield. |
| `ares-storage-lsah` | Persistence | Three-tier LSAH store: zero-alloc hot ring, modular Arrow/LanceDB + HNSW warm store, and ChaCha20-Poly1305 cold DSN archive. |
| `ares-server-cli` | Transport | Dual-transport Tokio orchestrator: `axum` 20 Hz WebSocket + REST, and native FastMCP JSON-RPC 2.0 over `stdio`. |
| `ares-desktop-os` | Native shell | Pure-Rust mission-workstation OS shell, seqlock 128-byte binary IPC bridge, and FastMCP command-palette runtime. |

---

## 7. Quickstart

### Rust core

```bash
cargo check --workspace                       # type-check all crates
cargo test  --workspace -- --nocapture        # run the test suite
cargo clippy --workspace -- -D warnings        # strict lint gate
cargo run --bin ares-server-cli               # launch the dual-transport engine
```

### React cockpit

```bash
cd ares-cockpit
npm install
npm run dev        # Vite dev server on 127.0.0.1:5173
npm run lint       # tsc -b --noEmit
npm run build      # production build
```

---

## 8. Data, Provenance & Evidence Boundary

- **Primary terrestrial data:** PhysioNet **BIDMC v1.0.0** numerics (`data/bidmc/`, with a held-out `data/bidmc_eval/` split and a `MANIFEST.json` provenance record). These are **recorded terrestrial measurements**, kept strictly separate from simulated scenario overlays.
- **Scenario physiology:** illustrative, generated for demonstration. It is **not** measured data and carries no clinical validity.
- **Provenance tagging:** every value is tagged by origin; missing values are preserved as explicit `null` / `UNAVAILABLE` rather than imputed (Issue #4).
- **Validation status:** coefficients, probabilities, readiness scores, and forecast coverage are **unvalidated**. NASA research and standards provide *context and grounding*, not validation of ARES-Health's outputs. The governing document is [`MODEL_EVIDENCE_AUDIT.md`](docs/architecture/MODEL_EVIDENCE_AUDIT.md).

---

## 9. Compliance, Licensing & Clean-Room Mandate

ARES-Health is a standalone, clean-room, open-source project with zero external proprietary dependencies, developed fresh for the hackathon in accordance with NASA Space Apps Fresh-Code rules.

### Licensing

ARES-Health is dual-licensed under either of:

- **MIT License** ([`LICENSE`](LICENSE))
- **Apache License, Version 2.0** ([`LICENSE-APACHE`](LICENSE-APACHE))

at your option. `SPDX-License-Identifier: MIT OR Apache-2.0`. Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work, as defined in the Apache-2.0 license, shall be dual-licensed as above, without any additional terms or conditions. The dual MIT OR Apache-2.0 track is the standard Rust-ecosystem licensing model: MIT maximizes permissive reuse while Apache-2.0 adds an explicit patent grant.

### Clean-room mandate

- **Fresh code only.** All source was written from scratch during the hackathon window. No pre-existing proprietary code, no prior unpublished team code, and no code of uncertain provenance was incorporated.
- **No proprietary or cloud dependencies.** 100% offline edge execution with zero external cloud services. Every third-party crate and frontend package is itself open-source and license-compatible with MIT OR Apache-2.0 (permissive licenses only; no copyleft contamination).
- **NASA material is grounding, not source.** NASA standards, datasets, and literature are used for context and grounding only; no NASA or third-party copyrighted code is redistributed in this repository.
- **Provenance preserved.** All external datasets retain their original provenance tags and upstream licenses, and are cited in Section 11.

---

## 10. Team

ARES-Health is built by a cross-university team for NASA Space Apps Challenge 2026.

| Name | Affiliation | Contact |
| :--- | :--- | :--- |
| Fabio Malaguti | Università di Bologna | fabiomalagutti27@gmail.com |
| Alessandro Nicolini | Università di Bologna | alessandronicolini@gmail.com |
| Carolina Bonafè | Università di Bologna | carolinabonafe02@gmail.com |
| Leonardo Perrone | KU Leuven | leonardo.perrone02@gmail.com |
| Fernando Alonzi | KU Leuven | alonzifernando209@gmail.com |

---

## 11. References & Data Sources

Grounding standards, datasets, and literature. Full annotated reading list with evidence boundaries: [`docs/REFERENCES.md`](docs/REFERENCES.md).

### Standards & official resources
- NASA Space Apps 2026 — [Challenge statement](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) and [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).
- NASA — [Five hazards of human spaceflight](https://www.nasa.gov/hrp/hazards/); [Human spaceflight risks](https://www.nasa.gov/hrp/risks/).
- NASA-STD-3001 — [Vol. 1 Rev C: Crew Health](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1); [Vol. 2 Rev F: Human Factors, Habitability & Environmental Health](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2).
- NASA — [OSDR federated search (`cgene, alsda, esa`)](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study); [LSAH](https://nlsp.nasa.gov/resources/lsah).
- CSA — [CANS: monitoring radiation for astronaut health (Feb 2026)](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp).
- ESA — [Myotones (Sept 2026, ISS Expedition 75)](https://www.esa.int/ESA_Multimedia/Images/2026/09/Myotones_Studying_muscle_adaptation_to_weightlessness).
- PhysioNet — [CEBS database (ECG, breathing, seismocardiograms)](https://physionet.org/content/cebsdb/1.0.0/).

### Selected peer-reviewed literature
- Overbey et al. (2024). Space Omics and Medical Atlas (SOMA). *Nature*. https://doi.org/10.1038/s41586-024-07639-y
- Balali et al. (2025). Wearable cardiovascular monitoring in 17 cosmonauts. *npj Microgravity*. https://doi.org/10.1038/s41526-025-00522-8
- Davis-Wilson et al. (2025). Missing smartwatch data and HRV. *JMIR*. https://doi.org/10.2196/53645
- Ebert et al. (2026). Autonomous procedural guidance (AMOS) on the ISS. https://doi.org/10.1177/15305627261422798
- De Martino et al. (2026). Interconnected physiological systems. *Frontiers in Network Physiology*. https://doi.org/10.3389/fnetp.2026.1867627

---

*ARES-Health is a NASA Space Apps Challenge 2026 research prototype. It is not a certified medical device and must not be used for real clinical decision-making. See the evidence-status notice at the top of this document.*
