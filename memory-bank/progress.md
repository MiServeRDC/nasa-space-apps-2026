# Progress Tracking: ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health)

> **Ruolo di questo file (ispirato a `spatiotemporal-mcp-engine`):** scaletta sequenziale ordinata dei Blocchi Architetturali (`Blocco 0` – `Blocco H`) e delle Fasi (`Fase 0` – `Fase 16`), con stato netto:
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

## Roadmap di Implementazione del Motore & Backend Rust (Blocchi A–G, Fasi 1–14)

> **Piano di Riferimento Dettagliato:** [`docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`](../docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md)  
> **Stack & Riferimenti Scientifici (`deep-scholar`):** [`docs/architecture/IMPLEMENTATION_STACK.md`](../docs/architecture/IMPLEMENTATION_STACK.md)

### Blocco A: Fondamenta Contrattuali & Costanti Normative (`crates/ares-core-types` — `@fabiomalagutti27-droid`)
- [ ] **Fase 1 (`A1`):** Struct `TelemetryPacket`, `ProvenanceManifest`, `Biometrics` (con `Option<f64>` nullable e `missing_channels`), `Musculoskeletal`, `JugularHemodynamics`, `SansOcular`, `NqsStlMargins`, `ActivePlaybook`.
- [ ] **Fase 2 (`A2`):** Costanti fisiche e normative `NASA-STD-3001` (`constants.rs`), errori tipizzati `thiserror` (`error.rs`) e trait disaccoppiati `CrewPrivacyFilter`, `MedOpsAuditLogger`, `McpInputSanitizer` (`security.rs`).

### Blocco B: Replay Deterministico `BIDMC v1.0.0` & Filtro `SQI` (`crates/ares-telemetry-ingest` — `@LelloXV`)
- [ ] **Fase 3 (`B1`):** Parser CSV `bidmc_01..03_Numerics.csv` (`1 Hz`, `0..480 s`) con `csv::Trim::All` per gli header con spazio iniziale (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`) e preservazione dei 13 valori mancanti in `bidmc_01` come `None`.
- [ ] **Fase 4 (`B2`):** Filtro di qualità del segnale basato sull'entropia spettrale di Shannon (`SQI >= 0.70`, Zero-Order Hold su artefatti da movimento) e fusione con `ScenarioOverlayInput` (`What-If Console`).

### Blocco C [MOTORE RUST CORE]: Fisiopatologia Differenziale & Grafo Causale `ADHG` (`crates/ares-causal-graph` — `@fabiomalagutti27-droid`)
- [ ] **Fase 5 (`C1`):** Solutore numerico **RK4 a passo fisso** per l'ODE della Sclerostina di Frost-Hargens ($\text{SOST}$, $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), Muscle Quality Index ($\text{MQI}$) e Gait Asymmetry Index ($\text{GAI}$ a $0.38g$).
- [ ] **Fase 6 (`C2`):** Calcolo dimensionalmente esatto dello shear stress giugulare $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}(t)}$, curva dose-risposta `LBNP` ($-30\text{ mmHg}$) e indice translaminare `SANS` (`OSD-818`).
- [ ] **Fase 7 (`C3`):** Grafo causale diretto pesato `ADHG` (`petgraph::stable_graph::StableDiGraph`) a 12 nodi e **Osservatore Bayesiano POCUS a 2 Stadi** (tetto pre-POCUS $P \le 0.45$, conferma post-POCUS $P \ge 0.92$).

### Blocco D [MOTORE RUST CORE]: Logica Temporale `NQS-STL`, Predittore `TTV` & `MRI` (`crates/ares-nqs-stl` — `@fabiomalagutti27-droid`)
- [ ] **Fase 8 (`D1`):** Normalizzatore adimensionale `NQS-STL` $\hat{\rho}_k(t) \in (-\infty, +1.0]$ e valutatore online $O(1)$ su finestra scorrevole con **cuneo monotono di Lemire-Donzé** (`sliding_window.rs`).
- [ ] **Fase 9 (`D2`):** Stimatore **EWMA-OLS a 7 giorni** del *Time-To-Violation* (`TTV`) con intervallo di confidenza $\pm 1.96\sigma$ (`ttv_predictor.rs`) e calcolo del **Mission Readiness Index (`MRI`)** (`mri_index.rs`).

### Blocco E: Playbook Autonomi DAG & I 3 Hard Clinical Safety Gates (`crates/ares-medops-playbooks` — `@fertech02`)
- [ ] **Fase 10 (`E1`):** Esecutore DAG *Type 1 Crystallized* (`< 20 µs`) per i Playbook `#01–#05` ordinati per impatto $\Delta\hat{\rho}/\text{ora}$.
- [ ] **Fase 11 (`E2`):** Applicazione deterministica dei **3 Hard Clinical Safety Gates** (Gate 1: blocco anticoagulanti senza trombo POCUS; Gate 2: auto-vent `LBNP` a $0\text{ mmHg}$ se $\Delta\text{SBP} > 15\text{ mmHg}$ o $\text{HR} > 115\text{ bpm}$; Gate 3: smorzamento tuta EVA a $0.38g$ se $\text{GAI} > 12\%$).

### Blocco F: Privacy Medica per Ruolo (`NASA-STD-3001`), Audit `SHA-256` & AEAD (`crates/ares-security-privacy` — `@MiServeRDC`)
- [ ] **Fase 12 (`F1`):** Implementazione di `PrivateAstronautView`, `CmoMedicalView`, `FlightSurgeonSyncPacket`, catena hash `SHA-256` per override medici, cifratura `ChaCha20-Poly1305` e sanitizzazione `<untrusted_telemetry_observation>`.

### Blocco G: Server Dual-Transport Isolato (`crates/ares-server-cli` — `@fertech02`)
- [ ] **Fase 13 (`G1`):** Server HTTP/WebSocket `axum` su `127.0.0.1:8080` (`20 Hz` `/ws/telemetry` + `POST /api/stress-test` `< 1 ms`).
- [ ] **Fase 14 (`G2`):** Server nativo **FastMCP JSON-RPC 2.0 su `stdio`** con i 4 tool Context-Mode (`< 150 token/risposta`) e log isolati su `stderr`.

---

## Blocco H: Frontend Astronaut Cockpit & Pitch Finale (`ares-cockpit/` — `@carolina2910` & Team)
- [ ] **Fase 15 (`H1`):** Layout React 19 + Tailwind OLED `#000000` (`NASA-STD-3001 Vol. 2`), barra `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`, 3D Anatomical Heatmap (`Three.js`), grafico `NQS-STL` con cono $\pm 1.96\sigma$ e **What-If Stress-Test Console**.
- [ ] **Fase 16 (`H2`):** Verifica finale end-to-end (`./scripts/agent_probe.sh --all`) e registrazione video demo (180s + 30s).
