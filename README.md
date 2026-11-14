# ARES-Health: Autonomous Resilient Edge-native System for Astronaut Health

> Evidence status (issue #12): scenario-derived physiology, risk/readiness scores and forecast ranges are illustrative and clinically unvalidated. Historical calibration, certification, universal-threshold and outcome claims below are not established. Use [the current evidence audit](docs/architecture/MODEL_EVIDENCE_AUDIT.md) for source applicability, parameters and permitted wording. Recorded terrestrial measurements remain distinct from simulation.
## NASA Space Apps Challenge 2026 Master Dossier

**Candidate & Lead Architect:** Fabio Malagutti (Computer Engineer • M.Sc. Student @ University of Bologna)  
**Location:** Bologna, Italy  
**Competition:** NASA Space Apps Challenge 2026 (November 14–15, 2026)  
**Official Challenge Track:** "Create Health Monitoring Software for Astronauts on Space Missions"  
**Official URL:** https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/  
**Mission Domain:** Moon-to-Mars Transit, Deep Space Habitat, Lunar Gateway, Martian Surface Operations  
**Operating Principles:** 100% Offline, Deterministic Edge Execution, Air-Gapped, Zero-Cloud Dependency  

---

## 1. Project Overview & Architectural Vision

ARES-Health is an offline hackathon prototype for physiological replay, illustrative scenario modeling and guided decision-support workflows. It is not clinically validated, certified, or a substitute for a medical officer.

The current backend combines recorded terrestrial BIDMC numerics with separately identified scenario models, graph summaries and experimental deterministic forecasting. Unsupported HRV and dependent complete assessments remain unavailable. NASA research and standards provide context; they do not validate our coefficients, probabilities, readiness scores or forecast coverage.

Current evidence status, formulas, limitations and validation requirements are in [MODEL_EVIDENCE_AUDIT.md](docs/architecture/MODEL_EVIDENCE_AUDIT.md). The dossier below includes historical design proposals and should not be read as a list of measured or validated capabilities.

---

## 2. Dossier Structure

This folder contains the complete, rigorous architectural, clinical, and software engineering specification for ARES-Health:

* [PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md)  
  *Master Blueprint Unificato: documento all-in-one a punti che riassume l'intero progetto, la provenienza di ogni decisione scientifica, le librerie open source importate, l'architettura tecnica e i ruoli nel team.*
* [00_Executive_Summary_and_Challenge.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/00_Executive_Summary_and_Challenge.md)  
  *Official challenge prompt breakdown, deep space communication constraints, evaluation criteria, and strategic positioning.*
* [01_Medical_Physiological_Deep_Space_Foundations.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/01_Medical_Physiological_Deep_Space_Foundations.md)  
  *Deep physiatric and space medicine analysis: sarcopenia, osteopenia, muscle-bone mechanotransduction, cephalic fluid shifts, internal jugular vein thrombosis, SANS, and master clinical metrics.*
* [02_System_Architecture_and_Metrics.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/02_System_Architecture_and_Metrics.md)  
  *Systems engineering specification: multi-modal telemetry bus, contactless RF radar, the Dynamic Multi-Organ Bio-Causal Graph (ADHG), and formal Medical Signal Temporal Logic (Med-STL).*
* [03_Backend_Engine_and_Technology_Tradeoff.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/03_Backend_Engine_and_Technology_Tradeoff.md)  
  *Comparative analysis of Rust vs. Python vs. Hybrid architecture; why building the core engine in Safe Rust provides an insurmountable competitive edge; and strict intellectual property (IP) protection guidelines.*
* [04_Frontend_Astronaut_Cockpit_UX.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/04_Frontend_Astronaut_Cockpit_UX.md)  
  *Human-System Integration (HSI) in microgravity: OLED high-contrast cockpit, Mission Readiness Index (MRI) composite gauge, 3D anatomical deconditioning heatmap, and interactive MedOps playbook runner.*
* [05_Official_NASA_Challenge_Brief_and_Resources.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/05_Official_NASA_Challenge_Brief_and_Resources.md)  
  *Archival and deconstruction of the official NASA Space Apps Challenge prompt, 5 spaceflight hazards (RIDGE), and open NASA/CSA/ESA repositories (OSDR federated `cgene,alsda,esa`, NLSP Experiments & `NASA-0000100`, LSAH longitudinal epidemiology, NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F, CSA CANS 2026, ESA Myotones 2026, NTRS, DONKI, PhysioNet).*
* [06_Flight_Surgeons_Research_and_Cutting_Edge_Biomarkers.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/06_Flight_Surgeons_Research_and_Cutting_Edge_Biomarkers.md)  
  *Exhaustive research survey of global Flight Surgeons (Auñón-Chancellor, Barratt, Urquieta, Polk, Mason/Nature SOMA 2024), cutting-edge multi-omics biomarkers, and the Master 6-Tier Deep Space Parameter Taxonomy.*
* [07_Recent_2026_Literature_Physiatry_Biomedical_Engineering.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/07_Recent_2026_Literature_Physiatry_Biomedical_Engineering.md)  
  *Systematic review of 2025–2026 peer-reviewed space medicine papers: dose-response LBNP trials in microgravity, endothelial mechanobiology, sclerostin dysregulation, and Astronaut Digital Twin architectures.*
* [08_Open_Source_Ecosystem_and_Comparative_Analysis.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/08_Open_Source_Ecosystem_and_Comparative_Analysis.md)  
  *Survey of global open-source libraries (Signal Temporal Logic, NeuroKit2, ESP32-CSI radar, NASA OSDR), hackathon rule compliance, and deep comparative landscape analysis (superpowers vs. engineering trade-offs).*
* [09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md)  
  *Official 2026 NASA Space Apps Challenge guide: prompt deconstruction, 1-6 member team rules, Fresh Code policy, AI disclosure guidelines, 30s video vs. 7-slide deliverables, and the 5 core judging criteria rubric.*
* [10_Gemini_Argon_Review_and_Validation_Prompt.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/10_Gemini_Argon_Review_and_Validation_Prompt.md)  
  *Master peer-review and validation prompt for frontier reasoning LLM instances (Gemini Argon), designed for comprehensive engineering, clinical, and competitive red-teaming.*
* [11_Official_Submission_Guide_and_Ready_To_Paste_Form.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/11_Official_Submission_Guide_and_Ready_To_Paste_Form.md)  
  *Complete NASA Space Apps Project Submission Guide compliance manual, full traceability matrix of mandatory NASA, CSA, and ESA datasets (HRP Risks, ARCHeR, Venous Haemostasis, Zero T2, CIPHER, OSDR federated `cgene,alsda,esa` [OSD-51/195/570/571/818], NLSP Experiments [`BRSMFSR`, `BRSMPT`, `NASA-0000100`], LSAH longitudinal epidemiology, NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F, CSA CANS 2026, Bio-Monitor, Vascular Aging, MARROW, ESA Myotones 2026, BRACE), ready-to-paste English submission form fields, and dual 30s/180s demo scripts.*
* [CONTRIBUTING.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/CONTRIBUTING.md)  
  *Team and multi-agent development workflow: git branching, Conventional Commits standard, offline execution rules, and cross-agent verification.*
* [docs/architecture/CRATES_AND_MODULES_BLUEPRINT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/CRATES_AND_MODULES_BLUEPRINT.md)  
  *Modular 7-Crate Rust Workspace & React Cockpit blueprint, analysis of the 6 NASA Challenge sub-tracks ("mini-tracce"), 24-dataset coverage matrix, and the T-Shaped Hub-and-Spoke winning strategy.*
* [docs/team/TEAM_COORDINATION_AND_OWNERSHIP.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/team/TEAM_COORDINATION_AND_OWNERSHIP.md)  
  *Gold-Standard 5-Person + Multi-Agent LLM Collaboration Guide (`memory-bank/`, `.github/CODEOWNERS`, `scripts/agent_probe.sh`, and zero-conflict crate ownership).*
* [docs/REFERENCES.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/REFERENCES.md)  
  *Team research reading list, evidence boundaries, candidate open-source libraries, and attribution guidelines.*
* [contracts/telemetry_schema.json](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/contracts/telemetry_schema.json)  
  *Single source of truth JSON Schema for 20 Hz telemetry exchanged between ares-engine (Rust) and ares-cockpit (React / Three.js).*

### Team Collaboration & Working Branches (`MiServeRDC/nasa-space-apps-2026`)
`main` is the shared integration branch. Each collaborator also has a dedicated working branch:

| GitHub Username | Working Branch |
| :--- | :--- |
| `@LelloXV` | `work/LelloXV` |
| `@MiServeRDC` | `work/MiServeRDC` |
| `@carolina2910` | `work/carolina2910` |
| `@fabiomalagutti27-droid` | `work/fabiomalagutti27-droid` |
| `@fertech02` | `work/fertech02` |

---

## 3. Technology Stack & Clean-Room Open-Source Mandate

### Recommended Hackathon Implementation: Dual-Transport Hybrid Architecture
* **Core Engine (`ares-engine` in Safe Rust):** High-speed, deterministic backend managing the Dynamic Multi-Organ Bio-Causal Graph (ADHG), the Normalized Quantitative Semantics STL solver (NQS-STL, $\hat{\rho} \in (-\infty, +1.0]$), the Two-Stage Bayesian POCUS State Observer, and concurrent dual-transport communication (`axum` WebSocket/REST on `127.0.0.1:8080` for the UI + `stdio` FastMCP for the local AI copilot).
* **Astronaut Cockpit (`ares-cockpit` in React / TypeScript / Tailwind CSS / Three.js):** Microgravity-optimized dark OLED mission dashboard featuring the tri-phase header (`[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`), Mission Readiness Index, 3D anatomical deconditioning map, live What-If Stress-Test Console, and interactive NASA MedOps Playbook Runner with Hard Clinical Safety Gates.

### Clean-Room Open-Source & Fresh-Code Compliance Mandate
ARES-Health is a 100% standalone, clean-room, open-source aerospace medical project with zero external proprietary dependencies. In strict accordance with NASA Space Apps Challenge regulations, all first-party code was developed fresh for the hackathon under dual `MIT OR Apache-2.0` (`LICENSE`, `LICENSE-APACHE`). 3D anatomical meshes in `ares-cockpit/public/anatomy/*.glb` are attributed under `CC-BY-SA-4.0` (Z-Anatomy / DBCLS BodyParts3D, see `public/anatomy/ATTRIBUTION.md`).

---

## 4. Multi-Agent AI Compatibility (2026 Universal Workspace Standard)

This workspace is natively pre-configured for autonomous AI coding agents across multiple providers:
* [AGENTS.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/AGENTS.md): Universal root rulebook recognized by OpenAI Codex, Google Antigravity, OpenHands, and general-purpose agents.
* [CLAUDE.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/CLAUDE.md): Dedicated entry point and command cheat-sheet for Anthropic Claude Code CLI.
* [.cursorrules](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/.cursorrules) & `.cursor/rules/`: Path-scoped rules for Cursor IDE (`backend-rust.mdc` and `frontend-react.mdc`).
* `.github/copilot-instructions.md`: Instructions for GitHub Copilot.
* **Agent Skills (`.agents/skills/`, mirrored across `.claude/skills/`, `.gemini/skills/`, and `skills/`):**
  - `rust-pro`: Advanced Safe Rust systems engineering, zero-copy concurrency, and zero-panic error handling.
  - `mcp-builder`: FastMCP JSON-RPC 2.0 `stdio` architecture, transport isolation, and `< 150 token` Context-Mode compression.
  - `context7`: Real-time API documentation lookup (`npx ctx7`) for `axum`, `tokio`, `petgraph`, `three.js`, and `@react-three/fiber`.
  - `security-auditor`: Role-Based Crew Medical Privacy (`NASA-STD-3001 Vol. 1 Ch. 7`), Prompt Injection Shield, ChaCha20-Poly1305 AEAD, and SHA-256 Audit Chain (`crates/ares-security-privacy`).
  - `telemetry-replay-verifier`: Enforces reproducible PhysioNet `BIDMC v1.0.0` CSV replay (`data/bidmc/`), leading-whitespace header parsing, explicit `null`/`UNAVAILABLE` missing-value handling, and provenance separation (`Issue #4`).
  - `ui-ux-pro-max`: Searchable UI/UX design intelligence (`scripts/search.py`) with 79 styles, 192 palettes, 119 accessibility guidelines, and `react`/`html-tailwind`/`threejs` stack rules.
  - `frontend-design`: High-contrast OLED dark UI (`#000000`), React 19, Tailwind, Three.js WebGL.
  - `git-standard`: Conventional Commits standard and clean team branching.
