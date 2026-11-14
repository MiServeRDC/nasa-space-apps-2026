# Team Coordination, Multi-Agent Workflow & Ownership Guide
## Gold-Standard Human + LLM Agent Collaboration (`MiServeRDC/nasa-space-apps-2026`)

**Repository:** `https://github.com/MiServeRDC/nasa-space-apps-2026`  
**Integration Branch:** `main`  
**Verification Gate:** `./scripts/agent_probe.sh --fast`  

---

## 1. Why This Repository Uses the Harness² Multi-Agent Gold Standard

When 5 engineers simultaneously use autonomous AI coding agents (Google Antigravity, OpenAI Codex, Claude Code, Cursor, GitHub Copilot) during a 48-hour hackathon, three failure modes typically occur:
1. **Context Amnesia Between Sessions/Teammates:** Agents on different machines do not know what architectural decisions or mathematical fixes were made by another teammate an hour ago.
2. **Git Merge Conflicts on Monolithic Files:** Two agents editing the same `main.rs` or `App.tsx` create destructive merge conflicts.
3. **Unverified Hallucinations:** An agent introduces `.unwrap()` panics, changes JSON field names, or violates clinical safety gates.

We eliminate all three failure modes via:
* **Two-Tier Persistent Memory (`memory-bank/`):** Every agent reads `memory-bank/projectbrief.md`, `systemPatterns.md`, and `activeContext.md` at session start and updates `activeContext.md` / `progress.md` before pushing.
* **Strict Physical Crate & Directory Isolation (`crates/*` + `ares-cockpit/src/modules/*`):** Each teammate owns dedicated directories enforced by `.github/CODEOWNERS`.
* **Contract-First Coupling (`contracts/telemetry_schema.json` & `crates/ares-core-types`):** Modules communicate exclusively through immutable data contracts.
* **Deterministic Verification Probe (`./scripts/agent_probe.sh`):** Automated pre-commit script verifying zero panics, JSON contract validity, Memory Bank integrity, and clean workspace state.

---

## 2. Team Ownership & Working Branch Matrix

| Team Member | GitHub Handle | Working Branch | Primary Owned Crates / Directories | Secondary / Review Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Fabio Malagutti** | `@fabiomalagutti27-droid` | `work/fabiomalagutti27-droid` | `crates/ares-core-types/`<br>`crates/ares-causal-graph/`<br>`crates/ares-nqs-stl/`<br>`contracts/telemetry_schema.json` | Overall System Architecture, Clinical Biomechanics ODEs, Final Integration |
| **Alessandro** | `@MiServeRDC` | `work/MiServeRDC` | `crates/ares-security-privacy/`<br>`docs/REFERENCES.md`<br>`.github/` | Crew Medical Privacy Governance (`NASA-STD-3001 Vol. 1 Ch. 7`), SHA-256 Audit Chain, Encrypted Store-and-Forward DSN Sync, Security Review |
| **Lello** | `@LelloXV` | `work/LelloXV` | `crates/ares-telemetry-ingest/` | Multi-Modal Telemetry Ring Buffer, Contactless Doppler Radar & Vocal DSP, `CSA CANS` Neutron Dosimetry, Spectral Entropy `SQI >= 0.70` Filter |
| **Carolina** | `@carolina2910` | `work/carolina2910` | `ares-cockpit/`<br>`diagrams/` | React 19 OLED `#000000` Cockpit UX, Tri-Phase Mandate Header, Three.js 3D Anatomical Heatmap, What-If Stress-Test Console |
| **Fertech** | `@fertech02` | `work/fertech02` | `crates/ares-medops-playbooks/`<br>`crates/ares-server-cli/` | NASA MedOps Playbooks #01–#05 DAG State Machines, Hard Clinical Safety Gates, `axum` $20\text{ Hz}$ WebSocket + `stdio` FastMCP Copilot |

---

## 3. Step-by-Step Git & Agentic Workflow for Every Teammate

### Step 1: Sync Your Branch with `main` & Read Memory Bank
Before starting a task or prompting your AI agent:
```bash
git fetch origin
git checkout work/<your-github-username>
git merge origin/main
```
Instruct your AI agent:
> *"Read `AGENTS.md`, `memory-bank/projectbrief.md`, `memory-bank/systemPatterns.md`, and `memory-bank/activeContext.md` before writing any code. Work strictly inside my assigned crate/module directory."*

### Step 2: Develop Against `contracts/telemetry_schema.json`
* Never rename or remove fields in `contracts/telemetry_schema.json` without team coordination.
* In Rust crates, never use `.unwrap()` or `.expect()` in production code (`src/`). Always return typed `Result<T, AresError>`.

### Step 3: Run the Deterministic Agent Probe Before Committing
```bash
./scripts/agent_probe.sh --fast
```
If the probe passes with `0 errors`, update `memory-bank/activeContext.md` and `memory-bank/progress.md`, commit using **Conventional Commits** (`feat(causal-graph): ...`, `fix(security): ...`, `docs(dossier): ...`), and push:
```bash
git add -A
git commit -m "feat(<module>): <concise description>"
git push origin work/<your-github-username>
```

### Step 4: Merge into `main`
Open a Pull Request into `main` (or fast-forward merge once `./scripts/agent_probe.sh --fast` passes) and notify the team so everyone can rebase/merge `origin/main` into their working branch.
