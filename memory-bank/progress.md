# Progress Tracking: ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health)

> **Ruolo di questo file (ispirato a `spatiotemporal-mcp-engine`):** scaletta sequenziale ordinata dei Blocchi Architetturali (`Blocco 0` – `Blocco K`) e delle Fasi (`Fase 0` – `Fase 28`), con stato netto:
> - `[x]` Completata, verificata con `./scripts/agent_probe.sh` e integrata su `main`
> - `[/]` In corso di implementazione / PR aperta
> - `[ ]` Pianificata (piano approvato in [`docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`](../docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md))

---

## Cockpit update (2026-11-14)

Revised Gather, Evaluate and Act on `work/LelloXV`. Gather shows one current reading per vital, Evaluate uses the atlas from `6abbabf` with manual markers, and Act highlights the current step. The frontend build and browser checks passed. The fast probe could not run its Rust checks because Cargo was unavailable.

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

## Unificazione Frontend Astronaut Cockpit & Multi-Branch (`ares-cockpit/`, `contracts/fixtures/`, `crates/` — Full Team) [COMPLETATO]
- [x] **Cockpit UI (`@carolina2910` `2da0989` + Fixes #8/#13/#22):** Unified `ares-cockpit/` React 19 UI wired to `ws://127.0.0.1:8080/ws/telemetry`, `GET /api/snapshot`, `POST /api/stress-test` with strict runtime schema validation, pure replay vs What-If separation, provenance/freshness inspector, null-safe TTV/RMSSD/SpO2 rendering, 3D Anatomical Heatmap, `NQS-STL` quantile cone, and `contracts/fixtures/`.
- [x] **Multi-Branch Backend Sync (`@MiServeRDC`, `@LelloXV`, `@fertech02`):** Integrated `BEAT_INTERVALS_NOT_AVAILABLE` / `rmssd_ms: None` propagation, Issue #12 evidence audit (`IllustrativeUnvalidated` / `IllustrativeScenarioRange`), `1 Hz` BIDMC CSV replay cadence decoupled from `20 Hz` WebSocket broadcast + cursor-invariant `POST /api/stress-test`, and `WireTelemetryPacket` + `StressTestPatchRequest` verified with `./scripts/agent_probe.sh --all`, `--mode smoke-test`, and cockpit `npm run lint` + `npm run build`.

---

## Blocco J: `ARES-MedOS` Pure-Rust Mission Workstation OS Shell, Zero-Copy IPC & Multi-Tier Space OS Partitioning (Fasi 21–24) [COMPLETED (TESTED) — 103/103 Workspace Tests across 8 Crates]
> **Studio di Fattibilita:** [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md)  
> **Piano Master Aggiornato:** [`docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`](../docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md) (11 Blocchi / 28 Fasi)
- [x] **Fase 21 (`J1`):** [`phase_21_J1_zero_copy_binary_ipc_shm_protocol.md`](../docs/plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md) — `128`-byte `#[repr(C, align(64))] BinaryTelemetryFrame` (`validity_mask` null-safe per `BEAT_INTERVALS_NOT_AVAILABLE`, Castagnoli `CRC-32C` `104..108`) in `crates/ares-core-types/src/binary_ipc.rs`, lock-free SPMC `SeqlockTelemetryRing` in `crates/ares-server-cli/src/shm_bus.rs`, e adattatore opzionale `--features shm-ipc` (`COMPLETED (TESTED)`).
- [x] **Fase 22 (`J2`):** [`phase_22_J2_ares_desktop_os_tauri_native_shell.md`](../docs/plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md) — `crates/ares-desktop-os` (`Tauri v2`, `~30–50 MB` RAM, Apple Silicon Metal / Linux Vulkan, `SharedMissionState` in-process + mirror HTTP/WS `127.0.0.1:8080` con `/api/os-status`, `/api/binary-frame`, `/api/mcp`, `Channel<Response>`, feature gate `tauri-runtime` per CI headless e `--mode desktop-smoke-test`) (`COMPLETED (TESTED)`).
- [x] **Fase 23 (`J3`):** [`phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md`](../docs/plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md) — Decoder `DataView` `binaryTelemetryDecoder.ts` (`computeCrc32c`), Dual-Transport `useTelemetry.ts` (`TAURI_NATIVE_IPC` vs `BROWSER_WEBSOCKET`), `ares-cockpit/src/modules/os-shell/OsSystemStatusBar.tsx` (`#000000` OLED, Sol clock, OWLT `4–24 min`, `ARINC 653`, zona deontica, `CANS`) e `OsCommandPalette.tsx` (`Alt+Space` / `Cmd+K` per tutti gli 8 tool `FastMCP`) (`COMPLETED (TESTED)`).
- [x] **Fase 24 (`J4`):** [`phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md`](../docs/plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — `WearableSensorPacket` (`32 B` `#[repr(C)]` CRC-16-CCITT + `Oxide Hubris` `supervisor_restart_count`) in `crates/ares-telemetry-ingest/src/wearable_packet.rs`, manifesti dichiarativi `deploy/medos/` (`Asterinas` `14.0%` TCB, `cosmic-comp` Wayland Kiosk `120 Hz`, `Hubris`/`Embassy` MCU) e `scripts/launch_ares_medos.sh` (`COMPLETED (TESTED)`).

---

## Blocco K: System-Wide Verification, Clinical Chaos & `NASA-STD-3001` Certification Harness (Fasi 25–28) [COMPLETED — 23/23 K1–K4 & 126/126 Workspace Tests Passing]
> **Architettura Master & Matrice Cross-Crate:** [`docs/plans/BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md`](../docs/plans/BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md) | **Runner:** [`scripts/run_block_k_suite.sh`](../scripts/run_block_k_suite.sh)  
- [x] **Fase 25 (`K1` — Verificato):** [`phase_25_K1_property_based_numerical_ode_stl_verification.md`](../docs/plans/phase_25_K1_property_based_numerical_ode_stl_verification.md) — `12` test deterministici property-based in `ares-core-types/tests/phase_25_k1_binary_abi_props.rs` (`5`), `ares-causal-graph/tests/phase_25_k1_math_properties.rs` (`4`) e `ares-nqs-stl/tests/phase_25_k1_timestral_stl_props.rs` (`3`): Richardson RK4 $O(h^4)$, $\tau_w(t)$ CGS homogeneity, non-crossing DHF $q_{0.05} \le q_{0.50} \le q_{0.95}$ su `10,000` traiettorie, `2,000` sequenze `LemireMinWedge`, e layout `16 B` / `128 B` + `SeqlockTelemetryRing<64>` SPMC (`4,096` frame).
- [x] **Fase 26 (`K2` — Verificato):** [`phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md`](../docs/plans/phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md) — `6` test chaos/SEU/crypto in `ares-telemetry-ingest/tests/phase_26_k2_chaos_dropout_seu.rs` (`3`) e `ares-security-privacy/tests/phase_26_k2_crypto_audit_chaos.rs` (`3`): hardening `sqi_filter.rs` & `scenario_overlay.rs` su `NaN`/`Inf` e ZOH `30s`, `481`-riga `bidmc_01` `BEAT_INTERVALS_NOT_AVAILABLE`, SEU bit-flip su `32 B` `WearableSensorPacket` + 5 restart Hubris, `ChaCha20-Poly1305` tamper rejection, `100`-entry `Sha256AuditLogger` index pinpointing e `StrictMcpSanitizer` `<untrusted_telemetry_observation>`.
- [x] **Fase 27 (`K3` — Verificato):** [`phase_27_K3_full_stack_contract_cockpit_ipc_mcp_e2e.md`](../docs/plans/phase_27_K3_full_stack_contract_cockpit_ipc_mcp_e2e.md) — `3` test E2E in `ares-desktop-os/tests/phase_27_k3_cross_language_e2e.rs` (`2`) e `ares-server-cli/tests/phase_27_k3_http_ws_mcp_contract.rs` (`1`): parity binaria bit-exact Rust `BinaryTelemetryFrame` <-> TypeScript `decodeBinaryTelemetryFrame` (`node --experimental-strip-types`), rejection 1-bit flip, `AresMedOsWorkstationShell` dual-clock + `ipc_post_stress_test` cursor invariance, 24 dataset, e Axum HTTP/WS (`GET /api/snapshot`, `/api/os-status`, `/api/binary-frame`, `POST /api/stress-test`, `/ws/telemetry`, `POST /api/mcp` su tutti gli `8` tool `FastMCP` `<= 600 B`).
- [x] **Fase 28 (`K4` — Verificato):** [`phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md`](../docs/plans/phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md) — `2` test di certificazione in `ares-desktop-os/tests/phase_28_k4_nasa_std_3001_bench.rs`: matrice normativa `NASA-STD-3001 Vol. 1 & 2` (`[V1 3001]`–`[V2 10152]`) e benchmark `--release` (`N=1,000`): `SeqlockTelemetryRing::read_latest_bytes` (`p50=42.0 ns, p99=42.0 ns, p99.9=84.0 ns`), `read_latest`+CRC32C (`p50=791.0 ns, p99=916.0 ns, p99.9=959.0 ns`), `DatasetGraph` query (`p50=16.25 us, p99.9=70.83 us`), shortest path (`p50=16.33 us, p99.9=31.21 us`), `BioKG` O(1) (`p50=41.0 ns, p99.9=83.0 ns`), 1-tick pipeline (`p50=2.12 us, p99=2.25 us, p99.9=5.58 us`), compattatore `900-Sol` (`167,352 B < 200 KB`), e `AresUnifiedDatasetGraph` (`RAM_est=196,264 B < 10 MB`, `JSON=122,023 B < 15 MB`).

## Issue #11 & Issue #12: HRV Validity and Model Evidence Status (`origin/main` integrated)
- [x] **Issue #11 / PR #20 (`187b933`):** Remove numeric-derived/default HRV; preserve unavailable full assessments (`BEAT_INTERVALS_NOT_AVAILABLE`), degraded alarm state, and known hazard routing.
- [x] **Issue #12 (`b4ca916`):** Output/formula/calibration evidence register (`docs/architecture/MODEL_EVIDENCE_AUDIT.md`), machine-readable `IllustrativeUnvalidated` / `IllustrativeScenarioRange` status, and dossier corrections.
- [ ] Qualified domain review and target-population/outcome calibration (pending clinical review; scenario models remain illustrative).
