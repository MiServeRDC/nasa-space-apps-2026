# AGENTS.md: Universal AI Agent Instruction & Repository Specification
## ARES-Health (NASA Space Apps Challenge 2026)

This file is the single source of truth for all autonomous AI coding agents (Google Antigravity, Claude Code, OpenAI Codex, Cursor, Windsurf, GitHub Copilot) operating within this repository.

---

## 1. Project Identity & Mission Domain

* **Project Name:** ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health)
* **Lead Architect:** Fabio Malagutti (Computer Engineer • M.Sc. Student @ University of Bologna)
* **Challenge Track:** NASA Space Apps Challenge 2026 — "Create Health Monitoring Software for Astronauts on Space Missions"
* **Target Environment:** Moon-to-Mars Transit, Lunar Gateway, Deep Space Habitat, Martian Surface (0.38g)
* **Core Operational Constraint:** Earth-Mars round-trip radio communication takes **8 to 48 minutes**. Standard telemedicine and terrestrial cloud computing are physically impossible. The platform must be **100% edge-native, deterministic, and air-gapped**.
* **Official Mandate:** Implement a closed-loop system across three distinct phases: **GATHER $\to$ EVALUATE $\to$ ACT**.

---

## 2. Strict Project Invariants (Non-Negotiable)

1. **Air-Gapped Edge Execution (Zero Cloud Dependency):**  
   Never generate code that makes outbound HTTP calls to external AI cloud APIs (OpenAI, Anthropic, AWS, GCP). All reasoning and decision-making run locally on spacecraft compute hardware.
2. **NASA Space Apps "Fresh Code" Rule:**  
   All core application logic (Rust causal graph, STL evaluators, React UI, playbook runners) is written fresh during the hackathon. Standard open-source libraries (`petgraph`, `tokio`, `axum`, `mstlo`, `three.js`) and public datasets (NASA OSDR, PhysioNet) are fully permissible as external dependencies.
3. **Clean-Room Open-Source Independence:**  
   This repository is an unencumbered, standalone open-source system (MIT / Apache-2.0). Never import, reference, or assume the existence of external proprietary or private projects.
4. **Physical & Mathematical Dimensional Rigor:**  
   Always maintain exact physical units in code and equations:
   * Endothelial wall shear stress: $\tau_w(t) = 2\mu \cdot v_{\max}(t)\sqrt{\frac{\pi}{\text{CSA}(t)}}$ in $\text{dyn/cm}^2$ (with $\mu \approx 0.035\text{ Poise}$).
   * Periosteal mechanical strain: $\varepsilon_{\text{ARED}}$ in microstrain ($\mu\varepsilon$, Frost Mechanostat threshold $= 1000\ \mu\varepsilon$).
   * Normalized Signal Temporal Logic: $\hat{\rho}_k(t) \in (-\infty, +1.0]$ dimensionless margin.
5. **Hard Clinical Safety Gates:**  
   * **Anticoagulation Restriction:** Never administer systemic anticoagulants for slow venous flow alone; anticoagulants require POCUS confirmation of an intraluminal thrombus to prevent fatal traumatic intracranial hemorrhage in microgravity.
   * **LBNP Anti-Syncope Guardrail:** Automatically vent the negative pressure chamber to $0\text{ mmHg}$ if systolic blood pressure drops by $> 15\text{ mmHg}$ or heart rate exceeds $115\text{ bpm}$.
6. **Formatting Invariant:**  
   STRICTLY ZERO EMOJIS anywhere in code, markdown documentation, or commit messages.

---

## 3. Technology Stack, 7-Crate Modular Topology & Memory Bank Protocol

### 3.1 Memory Bank Protocol (Mandatory for All AI Agents)
Before writing or modifying any code:
1. **Read `memory-bank/projectbrief.md`, `memory-bank/systemPatterns.md`, and `memory-bank/activeContext.md`.**
2. **Consult `memory-bank/experienceLog.md`** to prevent re-introducing past failure modes.
3. **Respect `.github/CODEOWNERS` and `docs/team/TEAM_COORDINATION_AND_OWNERSHIP.md`:** Work strictly inside your assigned crate/module directory on your working branch (`work/<username>`).
4. **Before every commit or merge to `main`, run `./scripts/agent_probe.sh --fast`** and update `memory-bank/activeContext.md` and `memory-bank/progress.md`.

### 3.2 Directory Topology
```
NASA_Space_Apps_2026/
├── AGENTS.md                        # Universal cross-agent specification (this file)
├── CLAUDE.md                        # Claude Code CLI entry point (imports AGENTS.md)
├── .cursorrules                     # Cursor IDE root rules
├── .cursor/rules/                   # Path-scoped rules (backend-rust.mdc, frontend-react.mdc)
├── .agents/                         # Rules, Skills, Workflows (/probe, /reflect), & Tool Guidance
├── .claude/skills/                  # Claude Code skills mirror
├── .gemini/skills/                  # Antigravity / Gemini skills mirror
├── .github/                         # CODEOWNERS, PR/Issue templates & Copilot instructions
├── memory-bank/                     # Persistent Two-Tier Agent Memory (Harness² Architecture)
│   ├── projectbrief.md              # Charter, T-Shaped 6-Domain Strategy & Team Roster
│   ├── systemPatterns.md            # Mathematical & Clinical Safety Gate Invariants
│   ├── techContext.md               # Tech stack & strict coding constraints
│   ├── activeContext.md             # Current focus & immediate next steps
│   ├── progress.md                  # Milestone tracker
│   ├── issuesBacklog.md             # Per-member task assignment
│   └── experienceLog.md             # Anti-recurrence failure mode log
├── crates/                          # 7 Decoupled Safe Rust Crates (Zero-Conflict Team Partition)
│   ├── ares-core-types/             # Shared JSON contract types, NASA-STD-3001 constants, Privacy traits
│   ├── ares-telemetry-ingest/       # Ring buffer, Doppler Radar/Vocal DSP, CANS neutron, SQI >= 0.70
│   ├── ares-causal-graph/           # ADHG petgraph, Frost-Hargens ODEs, Shear tau_w, Bayesian POCUS
│   ├── ares-nqs-stl/                # O(1) Lemire Wedge NQS-STL solver, EWMA-OLS TTV, MRI (0-100)
│   ├── ares-medops-playbooks/       # Playbooks #01-#05 DAG state machines & 3 Hard Safety Gates
│   ├── ares-security-privacy/       # Role-Based Crew Privacy Tiers, SHA-256 Audit Chain, AEAD DSN Sync
│   └── ares-server-cli/             # Dual-Transport Tokio binary (axum 20Hz WS + stdio FastMCP)
├── ares-cockpit/                    # React 19 + TypeScript + Tailwind #000000 OLED + Three.js 3D UI
├── contracts/
│   └── telemetry_schema.json        # Single Source of Truth 20 Hz Telemetry JSON Schema
├── scripts/
│   └── agent_probe.sh               # Deterministic Pre-Commit Verification Probe
├── docs/
│   ├── REFERENCES.md                # Team Literature & Dataset Attribution List
│   ├── architecture/                # CRATES_AND_MODULES_BLUEPRINT.md (Sub-Tracks & T-Shaped Strategy)
│   └── team/                        # TEAM_COORDINATION_AND_OWNERSHIP.md
├── PANORAMICA_GENERALE_PROGETTO.md  # All-in-one comprehensive project blueprint (Italian)
├── README.md                        # Master documentation index
└── (dossier specifications 00-11 and ARES_Health_Master_Architecture.md)
```

### Component Architecture
* **`ares-engine` (Backend Core in Safe Rust 2024):**
  * Runtime: Asynchronous `tokio` with shared state `Arc<RwLock<MissionState>>`.
  * Transport 1 (Cockpit UI): Local loopback `axum` HTTP REST + WebSocket on `127.0.0.1:8080` (streaming state at $20\text{ Hz}$, What-If slider latency $< 1\text{ ms}$).
  * Transport 2 (AI Copilot): Standard `stdio` JSON-RPC pipeline implementing FastMCP macro-tools ($< 150\text{ tokens}$).
  * Internal Modules: `src/telemetry.rs`, `src/graph.rs`, `src/stl.rs`, `src/playbooks.rs`, `src/mcp.rs`.
* **`ares-cockpit` (Astronaut Interface in React / TypeScript / Tailwind CSS / Three.js):**
  * Single-screen OLED theme (`#000000`) with high-contrast accessibility (NASA-STD-3001).
  * WebGL 3D anatomical deconditioning map (`pmndrs/react-three-fiber`).
  * What-If Stress-Test Console with real-time sliders (Cabin $ppCO_2$, ARED workload, LBNP pressure, mission day).
  * Interactive MedOps Playbook Runner with POCUS ultrasound overlay.

---

## 4. Standard Commands & Verification

### Rust Backend (`ares-engine`)
```bash
cargo check --workspace
cargo test --workspace -- --nocapture
cargo clippy --workspace -- -D warnings
cargo run --bin ares-engine
```

### Frontend Cockpit (`ares-cockpit`)
```bash
npm install
npm run lint
npm run build
npm run dev
```

### Academic Literature Search CLI (`deep-scholar`)
```bash
python3 .agents/skills/deep-scholar/scripts/search_academic.py --engine arxiv --query "microgravity jugular thrombosis" --limit 5
python3 .agents/skills/deep-scholar/scripts/search_academic.py --engine crossref --query "sclerostin mechanostat microgravity" --limit 5
```

---

## 5. Team Roles (5-Person Structure)

1. **Lead Systems Architect & Rust Backend Engineer (Fabio Malagutti):** Safe Rust core, ODE solver, NQS-STL monitor, dual-transport axum/FastMCP.
2. **Frontend Cockpit & Real-Time Visualization Engineer:** React/TypeScript single-screen dashboard, WebSocket integration, What-If console, MedOps runner.
3. **3D Graphics & Human-System Integration (HSI) Specialist:** Three.js / React-Three-Fiber anatomical wireframe mesh, emissive organ nodes, animated causal Bezier arcs.
4. **Biomedical Data Scientist & Sensor Fusion Specialist:** NASA OSDR / PhysioNet data pipelines, `NeuroKit2` DSP, ODE parameter calibration, POCUS waveform simulation.
5. **Clinical Storyteller, NASA Compliance & Video Pitch Producer:** 180-second pitch video production (Hook $\to$ Gather $\to$ Evaluate $\to$ Act $\to$ Close), documentation packaging, slide deck.
