# Progress Tracking: ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health)

> **Ruolo di questo file (ispirato a `spatiotemporal-mcp-engine`):** scaletta sequenziale ordinata dei Blocchi Architetturali (`Blocco 0` – `Blocco J`) e delle Fasi (`Fase 0` – `Fase 22`), con stato netto:
> - `[x]` Completata, verificata con `./scripts/agent_probe.sh` e integrata su `main`
> - `[/]` In corso di implementazione / PR aperta
> - `[ ]` Pianificata (piano approvato in [`docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`](../docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md))

---

## Blocco 0: Architettura, Peer-Review Flight Surgeon, Grounding 24 Dataset & Harness² [COMPLETATO 100%]

- **[x] Fase 0.1 (`01`–`11` Dossier & Red-Team Validation):**
  - Rettifica dimensionale dello shear stress giugulare $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}(t)}$ ($\text{dyn/cm}^2$), ODE regolarizzata Frost-Hargens ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), Muscle Quality Index ($\text{MQI}$), Gait Asymmetry Index ($\text{GAI}$ a $0.38g$), `NQS-STL`, osservatore Bayesiano POCUS a 2 stadi e i **3 Hard Clinical Safety Gates**.
- **[x] Fase 0.2 (Scraping Profondo & Integrazione di 24 Dataset Multi-Agenzia + `NASA-STD-3001`):**
  - Integrati `NASA HRP`, `NASA OSDR` (`OSD-51`, `OSD-195`, `OSD-570/571`, `OSD-818`), `NASA NLSP` (`NASA-0000100`, `SMCCP`, `BRSMFSR`, `BRSMPT`, `FAP`, *Neuroendocrine Tilt*), `NASA LSAH`, `NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F`, `CSA CANS (2026)`, `ESA Myotones & BRACE`, `DLR AGBRESA & SANS-CM`, `NASA CHAPEA & HERA`, `TRISH EXPAND & HERMES`, `NASA-JAXA Bisphosphonates` e `PhysioNet BIDMC / CEBS / Fantasia`.
- **[x] Fase 0.3 (Integrazione Issue #4 `@MiServeRDC` — Bundle `data/bidmc/` & Provenance Schema):**
  - Versionati `data/bidmc/bidmc_01..03_Numerics.csv` (`1 Hz`, `0..480 s`, `ODC-By-1.0`), `data/bidmc/MANIFEST.json` (SHA-256 verificati) e aggiornato `contracts/telemetry_schema.json` con `provenance_manifest` (`RECORDED_TERRESTRIAL_BIDMC_CSV`, `DERIVED_COMPUTED`, `SIMULATED_SCENARIO_INPUT`) e campi nullable (`null`) per i 13 valori mancanti di `bidmc_01`.
- **[x] Fase 0.4 (Gold-Standard Multi-Agent Harness², 7-Crate Blueprint & 9 Agent Skills):**
  - Creati `memory-bank/`, `.github/CODEOWNERS`, `scripts/agent_probe.sh`, `docs/architecture/IMPLEMENTATION_STACK.md`, `docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md` e specchiate le 9 Agent Skills (`rust-pro`, `mcp-builder`, `context7`, `security-auditor`, `telemetry-replay-verifier`, `frontend-design`, `ui-ux-pro-max`, `deep-scholar`, `git-standard`).

---

## Roadmap di Implementazione del Motore & Backend Rust (Blocchi A–I, Fasi 1–20) [COMPLETED (TESTED) — 77/77 Workspace Tests]

> **Piano di Riferimento Dettagliato:** [`docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`](../docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md)  
> **Stack & Riferimenti Scientifici (`deep-scholar`):** [`docs/architecture/IMPLEMENTATION_STACK.md`](../docs/architecture/IMPLEMENTATION_STACK.md)

### Blocco A: Fondamenta Contrattuali & Costanti Normative (`crates/ares-core-types` — `@fabiomalagutti27-droid`) [COMPLETATO]
- [x] **Fase 1 (`A1`):** Struct `TelemetryPacket`, `ProvenanceManifest`, `Biometrics` (con `Option<f64>` nullable e `missing_channels`), `Musculoskeletal`, `JugularHemodynamics`, `SansOcular`, `NqsStlMargins`, `ActivePlaybook` (`COMPLETATA`).
- [x] **Fase 2 (`A2`):** Costanti fisiche e normative `NASA-STD-3001` (`constants.rs`), errori tipizzati `thiserror` (`error.rs`) e trait disaccoppiati `CrewPrivacyFilter`, `MedOpsAuditLogger`, `McpInputSanitizer` (`security.rs`) (`COMPLETATA`).

### Blocco B: Replay Deterministico `BIDMC v1.0.0` & Filtro `SQI` (`crates/ares-telemetry-ingest` — `@LelloXV`) [COMPLETATO]
- [x] **Fase 3 (`B1`):** Parser CSV `bidmc_01..03_Numerics.csv` (`1 Hz`, `0..480 s`) con `csv::Trim::All` / `str::trim` per gli header con spazio iniziale (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`) e preservazione dei 13 valori mancanti in `bidmc_01` come `None` (`COMPLETATA`).
- [x] **Fase 4 (`B2`):** Filtro di qualità del segnale basato sull'entropia spettrale di Shannon (`SQI >= 0.70`, Zero-Order Hold su artefatti da movimento) e fusione con `StressTestScenarioInput` (`What-If Console`) (`COMPLETATA`).

### Blocco C [MOTORE RUST CORE]: Fisiopatologia Differenziale & Grafo Causale `ADHG` (`crates/ares-causal-graph` — `@fabiomalagutti27-droid`) [COMPLETATO]
- [x] **Fase 5 (`C1`):** Solutore numerico **RK4 a passo fisso** per l'ODE della Sclerostina di Frost-Hargens ($\text{SOST}$, $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), Muscle Quality Index ($\text{MQI}$) e Gait Asymmetry Index ($\text{GAI}$ a $0.38g$) (`COMPLETATA`).
- [x] **Fase 6 (`C2`):** Calcolo dimensionalmente esatto dello shear stress giugulare $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}(t)}$, curva dose-risposta `LBNP` ($-30\text{ mmHg}$) e indice translaminare `SANS` (`OSD-818`) (`COMPLETATA`).
- [x] **Fase 7 (`C3`):** Grafo causale diretto pesato `ADHG` (`petgraph::stable_graph::StableDiGraph`) e **Osservatore Bayesiano POCUS a 2 Stadi** (tetto pre-POCUS $P \le 0.45$, conferma post-POCUS $P \ge 0.92$) (`COMPLETATA`).

### Blocco D [MOTORE RUST CORE]: Logica Temporale `NQS-STL`, Predittore `TTV` & `MRI` (`crates/ares-nqs-stl` — `@fabiomalagutti27-droid`) [COMPLETATO]
- [x] **Fase 8 (`D1`):** Normalizzatore adimensionale `NQS-STL` $\hat{\rho}_k(t) \in (-\infty, +1.0]$ e valutatore online $O(1)$ su finestra scorrevole con **cuneo monotono di Lemire-Donzé** (`sliding_window.rs`) (`COMPLETATA`).
- [x] **Fase 9 (`D2`):** Stimatore **EWMA-OLS a 7 giorni** del *Time-To-Violation* (`TTV`) con intervallo di confidenza $\pm 1.96\sigma$ (`ttv_predictor.rs`) e calcolo del **Mission Readiness Index (`MRI`)** (`mri_index.rs`) (`COMPLETATA`).

### Blocco E: Playbook Autonomi DAG & I 3 Hard Clinical Safety Gates (`crates/ares-medops-playbooks` — `@fertech02`) [COMPLETATO]
- [x] **Fase 10 (`E1`):** Esecutore DAG *Type 1 Crystallized* (`< 20 µs`) per i Playbook `#01–#05` ordinati per impatto $\Delta\hat{\rho}/\text{ora}$ (`COMPLETATA`).
- [x] **Fase 11 (`E2`):** Applicazione deterministica dei **3 Hard Clinical Safety Gates** (Gate 1: blocco anticoagulanti senza trombo POCUS; Gate 2: auto-vent `LBNP` a $0\text{ mmHg}$ se $\Delta\text{SBP} > 15\text{ mmHg}$ o $\text{HR} > 115\text{ bpm}$; Gate 3: smorzamento tuta EVA a $0.38g$ se $\text{GAI} > 12\%$) (`COMPLETATA`).

### Blocco F: Privacy Medica per Ruolo (`NASA-STD-3001`), Audit `SHA-256` & AEAD (`crates/ares-security-privacy` — `@MiServeRDC`) [COMPLETATO]
- [x] **Fase 12 (`F1`):** Implementazione di `AresSecurityGuard`, `EphemeralDsnKey` (`ZeroizeOnDrop`), `EncryptedStoreAndForwardBundle`, catena hash `SHA-256` per override medici (`Sha256AuditLogger`), cifratura `ChaCha20-Poly1305` e sanitizzazione `<untrusted_telemetry_observation>` (`StrictMcpSanitizer`) (`COMPLETATA`).

### Blocco G: Server Dual-Transport Isolato (`crates/ares-server-cli` — `@fertech02`) [COMPLETATO]
- [x] **Fase 13 (`G1`):** Server HTTP/WebSocket `axum` su `127.0.0.1:8080` (`20 Hz` `/ws/telemetry`, `GET /api/snapshot` + `POST /api/stress-test` `< 1 ms`) (`COMPLETATA`).
- [x] **Fase 14 (`G2`):** Server nativo **FastMCP JSON-RPC 2.0 su `stdio`** con i 4 tool Context-Mode (`< 150 token/risposta`, `<= 600 byte`) e log isolati su `stderr` (`COMPLETATA`).

---

## Blocco H [MOTORE RUST CORE]: Co-Processore Probabilistico Multi-Orizzonte Grey-Box Pure-Rust `Timestral` (`crates/ares-nqs-stl` — `@fabiomalagutti27-droid`) [COMPLETED (TESTED) — 18/18 Tests]
> **Studio Architetturale:** [`docs/architecture/TIMESTRAL_INTEGRATION_STUDY.md`](../docs/architecture/TIMESTRAL_INTEGRATION_STUDY.md)
- [x] **Fase 15 (`H1`):** Pure-Rust Timestral Backbone (`CausalScaler` `asinh`/`sinh`, `PatchRepresentation` con maschera `Option<f64>` per i 13 `None` di `bidmc_01`, `RmsNorm`, `FusedSwiGlu`, `SinCosRoPe` e `DualAxisAttention` con `SdpaSigmoid`) in `crates/ares-nqs-stl/src/timestral_backbone.rs` (`COMPLETED (TESTED)`).
- [x] **Fase 16 (`H2`):** Direct Multi-Horizon Forecasting (DHF) Non-Crossing Monotone `QuantileHead` ($q_{0.05} \le q_{0.50} \le q_{0.95}$ tramite accumulazione triangolare `stable_softplus`) e `ConformalAbstentionGate` adattivo (Conformal PID) in `crates/ares-nqs-stl/src/timestral_quantiles.rs` (`COMPLETED (TESTED)`).
- [x] **Fase 17 (`H3`):** Grey-Box Neuro-Mechanistic Bridge (`1 Hz` async forecaster + `try_read()` lock-free snapshot nel loop `20 Hz`, calcolo pessimistico $\text{TTV}_{q_{0.05}}$ e `NqsEngine`) in `crates/ares-nqs-stl/src/timestral_bridge.rs` e `ttv_predictor.rs` (`COMPLETED (TESTED)`).

---

## Blocco I [MOTORE RUST CORE]: Architettura a 3 Livelli `ARES-HyperGraph` & Grafo Multi-Dataset `ARES-DatasetGraph` (`crates/ares-causal-graph` & `crates/ares-server-cli`) [COMPLETED (TESTED) — 24/24 + 8/8 + 11/11 Tests]
> **Studi Architetturali:** [`docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md`](../docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md) & [`docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md`](../docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md)
- [x] **Fase 18 (`I1`):** `ARES-HyperGraph` Layers 1 & 2 — Compattazione longitudinale di Welford `LongitudinalSuperNode` (`< 200 KB` per 900 Sol marziani), sottografo delle 5 Regioni Anatomiche 3D (`UBERON:`) e grafo deontico Q-STL / Markov $D_{\text{KL}}$ dei 6 Compartimenti dell'Habitat in `crates/ares-causal-graph/src/hypergraph_spatial.rs` (`COMPLETED (TESTED)`).
- [x] **Fase 19 (`I2`):** `ARES-HyperGraph` Layer 3 (`ARES-BioKG`) — Descrittore stack-allocated `16-byte #[repr(C, align(16))] BiomedicalEvidenceDescriptor` con CRC-8, fusione multi-modale `Noisy-OR` (`EpistemicProvenance`), `ClinicalAnswerabilityGate` e grounding normativo $O(1)$ alle clausole `NASA-STD-3001` (`[V1 3001]..[V2 10001]`, `OCHMO MTB-007`) in `crates/ares-causal-graph/src/biokg_reasoner.rs` e `crates/ares-medops-playbooks/src/grounding.rs` (`COMPLETED (TESTED)`).
- [x] **Fase 20 (`I3`):** Unified Multi-Dataset Knowledge Graph Builder (`AresUnifiedDatasetGraph` con schema `SPOKE + BioCypher + PrimeKG + Biolink`, 24 dataset + 27 `TimeWindowSlice` reali da `bidmc_01..03`, `110` nodi, `326` archi, `12` comunità, `158,675` byte JSON esportati in `data/knowledge_graph/ares_dataset_graph.json` e `graphify-out/graph.json`, più 4 nuovi tool `FastMCP` `< 150 token` in `crates/ares-server-cli/src/fastmcp_router.rs`) (`COMPLETED (TESTED)`).

> **Verification Gate Finale (`Blocchi A–I`, `Fasi 01–20`):** `77/77` workspace tests passing (`ares-core-types`: 6, `ares-telemetry-ingest`: 6, `ares-causal-graph`: 24, `ares-nqs-stl`: 18, `ares-medops-playbooks`: 8, `ares-security-privacy`: 4, `ares-server-cli`: 11), `0` Clippy warnings, `0` `.unwrap()`/`.expect()` in production code (`./scripts/agent_probe.sh --all`).

---

## Blocco J: Frontend Astronaut Cockpit & Pitch Finale (`ares-cockpit/` — `@carolina2910` & Team)
- [ ] **Fase 21 (`J1`):** Layout React 19 + Tailwind OLED `#000000` (`NASA-STD-3001 Vol. 2`), barra `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`, 3D Anatomical Heatmap (`Three.js`), grafico `NQS-STL` con cono monotono $[q_{0.05}, q_{0.50}, q_{0.95}]$ e **What-If Stress-Test Console**.
- [ ] **Fase 22 (`J2`):** Verifica finale end-to-end (`./scripts/agent_probe.sh --all`) e registrazione video demo (180s + 30s).


## Issue #11 — HRV validity correction (current main baseline)

- [x] Remove numeric-derived/default HRV and dependent healthy fallback.
- [x] Preserve unavailable full assessments, explicit degraded state and known hazard handling.
- [x] Update typed contracts, schema field documentation, historical-plan correction notices and integration checklist.
- [x] Local workspace tests: 45 passed; strict all-target Clippy and build passed.
- [x] Actual local HTTP snapshot, WebSocket first frame and MCP process verified.
- [ ] Integrate/recheck executable cockpit when available; full #11 UI acceptance remains pending (#8).
- [ ] Repeat compatibility checks after merging pending replay/alternate-server/forecasting work.

The corrected behavior supersedes older phase descriptions implying numeric-only HRV or an always-available full MRI/TTV. No hosted Actions were started.

Final local repository gate: `bash scripts/agent_probe.sh --all` passed (check, all-target Clippy, 45 tests, production panic scan, dataset checksums and required documentation).


### PR #20 integration with main 4839090

The phases 15-20 update arrived before merge. Ported null HRV guarantees into the new FastMCP router, optional Timestral assessment/RMSSD cones, masked global input, NqsEngine and longitudinal storage. Missing global values are not counted as zero observations, calibrated on zero padding, or converted back to finite TTV. An added regression runs the async forecaster repeatedly and checks its typed snapshot and compact output. Full local verification follows before merge.

Integration verification on main `4839090`: `bash scripts/agent_probe.sh --all` passed, 83 tests passed, 0 failures and strict all-target Clippy passed.


## Issue #12: model evidence and honest output status

- [x] Output/formula/input/unit/source/population/parameter/calibration register and sensitivity/boundary review.
- [x] Machine-readable illustrative/unvalidated status; honest gate acceptance and legacy TTV range descriptions.
- [x] Dossier Markdown and frontend contract guidance corrected; exact sources and unresolved clinical review gaps recorded.
- [ ] Qualified domain review and target-population/outcome validation (not implemented or implied by this task).
- [ ] Verify evidence-status presentation when executable cockpit is integrated (#8); historical PDFs require refresh before presenting them as current evidence.

No treatment policy or clinical threshold was changed. Local verification results follow after the repository probe.


## Issue #12 verification results

- `RUST_TEST_THREADS=1 bash scripts/agent_probe.sh --all`: passed; 86 tests, no failures, check and strict all-target Clippy passed.
- `cargo build --workspace --locked --quiet`: passed.
- Actual MCP subprocess: health, quantile and spatial responses carry `ILLUSTRATIVE_UNVALIDATED`, remain valid JSON and are 338/216/477 bytes respectively. The integration test verifies all eight tool outputs retain model status and respect the existing byte limit.
- The first parallel full-probe run failed the existing 150 us wall-clock timing assertion (200.23 us). The unchanged assertion passes with serial tests. This documents execution sensitivity; no timing threshold was loosened and no under-load performance guarantee is claimed.
- No browser qualification: executable cockpit is not integrated on this baseline. Historical PDF exports are not regenerated. These integration/document-export limits are recorded in the evidence audit.
- Numerical model coefficients, playbook policies and clinical guard thresholds are unchanged.
