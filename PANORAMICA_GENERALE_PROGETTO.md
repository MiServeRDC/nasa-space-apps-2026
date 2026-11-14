# PANORAMICA GENERALE DEL PROGETTO: ARES-Health

> **Stato delle Evidenze (Issue #11 & Issue #12):** Le registrazioni terrestri `PhysioNet BIDMC v1.0.0` (`RECORDED_TERRESTRIAL_BIDMC_CSV`) sono tenute rigorosamente distinte dai modelli fisiologici e predittivi di scenario, i quali sono **illustrativi e non validati clinicamente** (`ILLUSTRATIVE_UNVALIDATED`, `ILLUSTRATIVE_SCENARIO_RANGE`, `HEURISTIC_GATE_ACCEPTED`). Sui dati numerici `1 Hz` `BIDMC` privi di intervalli R-R nativi, `rmssd_ms` resta `null` (`BEAT_INTERVALS_NOT_AVAILABLE`) e non viene mai imputato alcun valore sano di default. Vedere [MODEL_EVIDENCE_AUDIT.md](docs/architecture/MODEL_EVIDENCE_AUDIT.md) per il registro completo di formule, limiti e lavoro di validazione richiesto.

## Master Blueprint Unificato (NASA Space Apps Challenge 2026)

- **Progetto:** **ARES-Health** (*Autonomous Resilient Edge-native System for Astronaut Health*) / Workstation **`ARES-MedOS v0.1`**
- **Lead Architect:** Fabio Malagutti (`@fabiomalagutti27-droid`, Università di Bologna)
- **Team (`MiServeRDC/nasa-space-apps-2026`):** `@fabiomalagutti27-droid`, `@carolina2910`, `@fertech02`, `@LelloXV`, `@MiServeRDC`
- **Sfida Ufficiale NASA:** *"Create Health Monitoring Software for Astronauts on Space Missions"* (`https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/`)
- **Dominio Operativo:** Transito Terra-Marte, Deep Space Habitat, Lunar Gateway, Superficie Marziana (`0.38g`)
- **Principi Operativi:** 100% Offline, Air-Gapped, Zero Dipendenze Cloud, Safe Rust 2024 (`8` crate, `0` `.unwrap()`/`.expect()` in produzione), Licenza **`MIT OR Apache-2.0`**

---

## 1. Visione di Missione e Problema Operativo

In orbita terrestre bassa (ISS) gli astronauti beneficiano di telemedicina quasi in tempo reale da Houston. Oltre l'orbita cislunare, la fisica delle comunicazioni rende impossibile l'architettura cloud:

- **Barriera della Velocità della Luce:** Nel transito verso Marte il ritardo radio unidirezionale (`OWLT`) varia tra **4 e 24 minuti** (**8–48 minuti andata e ritorno**), con blackout completi fino a **14 giorni** durante le congiunzioni solari (`NASA CHAPEA`, `NASA-STD-3001 Vol. 1 [V1 3006]` *Earth-Independent Medical Operations — EIMO*).
- **I 5 Rischi `RIDGE`:** *Radiation*, *Isolation/Confinement*, *Distance from Earth*, *Gravity fields* ($0g \to 0.38g$) e *Hostile closed Environment*.
- **Mandato Canonico NASA:** Chiudere a bordo il ciclo **`GATHER -> EVALUATE -> ACT`** senza connessioni esterne, preservando l'onestà sui dati mancanti e integrando interlock deterministici di sicurezza.

---

## 2. Ciclo Funzionale `GATHER -> EVALUATE -> ACT` (Implementazione Reale)

### Fase 1: `GATHER` (`crates/ares-telemetry-ingest`)
- **Replay Deterministico `PhysioNet BIDMC v1.0.0` (`bidmc_replayer.rs`):** Ingestione `1.0 Hz` dei tracciati numerici `bidmc_01..03_Numerics.csv` (`481` righe `0..480 s`, `ODC-By-1.0`), verificati tramite `SHA-256` contro `data/bidmc/MANIFEST.json`, con trimming degli header con spazio iniziale (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`) e disaccoppiamento dal stream UI a `20 Hz`.
- **Onestà sui Dati Mancanti (Issue #4 & Issue #11):** I `13` campioni assenti di `PULSE`/`SpO2` in `bidmc_01` restano `Option<f64>::None` (`null` / `MISSING`), mai sostituiti con `0.0`. Sui record puramente numerici `1 Hz`, `rmssd_ms` e i parametri HRV dipendenti restano `None` con motivazione esplicita `BEAT_INTERVALS_NOT_AVAILABLE` e severità `DATA_DEGRADED_MISSING_CHANNELS`.
- **Euristica di Qualità Numerica & ZOH (`sqi_filter.rs`):** Calcola un'euristica di entropia sulle differenze di HR su coda a `16` campioni ($0.96 - 0.14\,h_{\text{norm}} - 0.18\,f_{\text{miss}}$) con *Zero-Order Hold* limitato a `30 s` (`HOLD_LAST_VALID` $\to$ `HELD_STALE` $\to$ `UNAVAILABLE`).
- **DSP Pure-Rust Level-1 (`Fase 31 / L3`):** Demodulatore radar I/Q `60/5.2 GHz` con cascata biquad notch `60/120 Hz` Jury-stable per ventole ECLSS (`radar_csi_dsp.rs`), estrattore vocale `YIN` $F_0$/`HNR`/jitter/shimmer con `None` su silenzio (`vocal_acoustic_dsp.rs`), estrattore R-R Pan-Tompkins `125–500 Hz` + filtro ectopici di Malik $\pm 20\%$ per sole waveform ad alta frequenza (`waveform_rr_extractor.rs`), e pacchetto wearable `32 B` `WearableSensorPacket` con `CRC-16-CCITT` e contatore restart `Oxide Hubris`.

### Fase 2: `EVALUATE` (`crates/ares-causal-graph` & `crates/ares-nqs-stl`)
- **Grafo Causale `ADHG` e Modelli di Scenario (`crates/ares-causal-graph`):**
  - *Meccanotrasduzione Muscolo-Osso (`mechanotransduction.rs`):* ODE di scenario della Sclerostina (`SOST`, `pmol/L`, soglia $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$) integrata con **RK4 a 12 passi fissi** (convergenza $O(h^4)$ verificata via Richardson step-halving `ratio >= 14.5`), affiancata da indicatori illustrativi `MQI`, calcio urinario e `GAI` (`0.38g`).
  - *Emodinamica Giugulare CGS & `SANS` (`hemodynamics.rs`):* Calcolo dimensionalmente esatto in CGS dello shear stress endoteliale $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}_{\text{cm}^2}(t)}$ ($\mu = 0.035\text{ Poise}$, `dyn/cm^2`) e proxy di scenario translaminare `ONSD`/`SANS`.
  - *Osservatore Bayesiano `POCUS` a 2 Stadi (`bayesian_pocus.rs`):* Stadio 1 limitato a $P_{\text{pre}} \le 0.45$ in stasi isolata; solo `pocus_thrombus_confirmed == true` attiva lo Stadio 2 (`LR+ = 24.0`, clamp `0.92..0.995`).
  - *`ARES-HyperGraph` & `AresUnifiedDatasetGraph`:* Compattazione longitudinale di Welford (`900 Sol` in `167,352 B < 200 KB`), `5` regioni anatomiche 3D `UBERON:`, `6` zone deontiche dell'habitat + Markov $D_{\text{KL}}$, descrittore `16 B` `#[repr(C, align(16))] BiomedicalEvidenceDescriptor` (`CRC-8`, lookup `O(1)` `41.0 ns p50`) e grafo unificato `AresUnifiedDatasetGraph` (`110` nodi, `326` archi Biolink, `24` dataset catalogati, `27` slice `BIDMC`, con adapter opzionali `--features parquet-ingest`).
- **`NQS-STL` $O(1)$ & Co-Processore `Timestral` (`crates/ares-nqs-stl`):**
  - Normalizzazione adimensionale su `[-2.0, +1.0]` e operatore di finestra scorrevole $\Box_{[t-W,t]}\hat{\rho}_k$ in tempo ammortizzato $O(1)$ tramite `LemireMinWedge` (verificato contro oracolo $O(W)$ su `2,000` sequenze).
  - Co-processore pure-Rust `TimestralBackbone` (`CausalScaler` `asinh`/`sinh`, maschera canali mancanti, `RmsNorm`, `FusedSwiGlu`, `SinCosRoPe`, `DualAxisAttention`, caricatore `SafeTensors` verificato `SHA-256` con fallback deterministico) e testa monotona `QuantileHead` ($q_{0.05} \le q_{0.50} \le q_{0.95}$, `0` incroci su `10,000` traiettorie `proptest`).
  - Gate `ConformalAbstentionGate` (`HEURISTIC_GATE_ACCEPTED` / `ABSTAINED_FALLBACK`), intervalli `TTV` etichettati `ILLUSTRATIVE_SCENARIO_RANGE` (`0.5..720 h`), e protocollo di calibrazione *subject-disjoint* `CQR` + Clopper-Pearson + Brier/ECE (`calibration_harness.rs`, Fase 33 `L5`) richiesto prima di qualsiasi passaggio da `ILLUSTRATIVE_UNVALIDATED`.

### Fase 3: `ACT` (`crates/ares-medops-playbooks`, `ares-security-privacy`, `ares-server-cli`, `ares-desktop-os`, `ares-cockpit`)
- **5 Playbook Cristallizzati Type-1 (`playbooks.rs`, `< 20 us`, zero LLM nel loop critico):**
  1. `PLAYBOOK_01_VENOUS_STASIS_LBNP` (`-30 mmHg` LBNP `45 min` + calf pump + scansione IJV POCUS)
  2. `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS` (anticoagulazione sbloccata solo su trombo POCUS confermato + sospensione squat Valsalva su ARED)
  3. `PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED` (carico ARED `>= 125 kgf` / `> 1000` microstrain + idratazione `>= 2.8 L/d` & citrato di potassio)
  4. `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION` (cuffie venose agli arti inferiori `50 mmHg` + LBNP notturno)
  5. `PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS` (ingresso storm shelter se `CSA CANS > 1.5 mSv/d` + radioprotezione endoteliale)
- **3 Hard Clinical Safety Gates (`safety_gates.rs`):**
  - *Gate 1 (Anticoagulation Lock):* Blocca farmaci anticoagulanti se `pocus_thrombus_confirmed != true` (`GATE 1 LOCKED`).
  - *Gate 2 (LBNP Anti-Syncope Auto-Vent):* Sfiato immediato a `0 mmHg` durante LBNP `-30 mmHg` se $\Delta\text{SBP} > 15\text{ mmHg}$ o $\text{HR} > 115\text{ bpm}$.
  - *Gate 3 (`0.38g` Mars Suit Damping):* Attiva `+25%` smorzamento caviglia/ginocchio tuta EVA se `GAI > 12%`.
- **Sicurezza, Privacy & Audit (`ares-security-privacy`):** 3 ruoli di riservatezza (`AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon`), catena hash `SHA-256` per override (`Sha256AuditLogger`), cifratura `ChaCha20-Poly1305` con `ZeroizeOnDrop` (`EphemeralDsnKey`), e scudo `<untrusted_telemetry_observation>` (`StrictMcpSanitizer`) contro *Indirect Prompt Injection*.

---

## 3. Architettura Concreta: Workspace a 8 Crate Safe Rust + `ARES-MedOS`

La topologia effettiva del repository supera il prototipo iniziale monolitico con un workspace modulare a **8 crate Safe Rust 2024** e il cockpit **`ares-cockpit`** (`React 19`, `TypeScript 5.7`, `Tailwind CSS 4`, `Three.js` / `@react-three/fiber`):

| Crate / Modulo | Responsabilità Architetturale Principale |
| :--- | :--- |
| `crates/ares-core-types` | Contratti telemetrici (`TelemetryPacket`, `ProvenanceManifest`), costanti `NASA-STD-3001`, `BinaryTelemetryFrame` (`128 B` `#[repr(C, align(64))]`, `CRC-32C`), tipi `Timestral` e `ModelValidationStatus`. |
| `crates/ares-telemetry-ingest` | Replay `BIDMC v1.0.0` (`1 Hz`, `null`-safe), filtro `SQI`, overlay What-If, `WearableSensorPacket` (`32 B` `CRC-16`), moduli DSP puri (`radar_csi_dsp`, `vocal_acoustic_dsp`, `waveform_rr_extractor`). |
| `crates/ares-causal-graph` | Grafo `ADHG` (`petgraph`), ODE RK4 Sclerostina, shear stress CGS $\tau_w$, osservatore POCUS, `ARES-HyperGraph` (Welford `900 Sol`, `UBERON:`, deontica), `BioKG` (`16 B`), `AresUnifiedDatasetGraph` (`24` fonti), `parquet_adapters`. |
| `crates/ares-nqs-stl` | Normalizzatore `NQS-STL`, `LemireMinWedge` $O(1)$, `TimestralBackbone` + `QuantileHead` monotona, `ConformalAbstentionGate`, `SafeTensors` loader `SHA-256`, `calibration_harness` (Fase 33 `L5`). |
| `crates/ares-medops-playbooks` | Esecutore DAG Type-1 (`#01–#05`), 3 Hard Clinical Safety Gates, grounding normativo `NASA-STD-3001` & `OCHMO MTB-007`. |
| `crates/ares-security-privacy` | Privacy per ruolo (`NASA-STD-3001 Ch. 7`), catena `SHA-256`, AEAD `ChaCha20-Poly1305` (`ZeroizeOnDrop`), `StrictMcpSanitizer`. |
| `crates/ares-server-cli` | Server `axum` (`127.0.0.1:8080`, `20 Hz` WS + REST `/api/snapshot`, `/api/stress-test`, `/api/os-status`, `/api/binary-frame`, `/api/mcp`), `FastMCP` `stdio` (`8` tool `<= 600 B`), `SeqlockTelemetryRing`, `edge_llm_bridge` (`OfflineTemplateCopilot`), `ares-calibrate`. |
| `crates/ares-desktop-os` | Shell nativa `Tauri v2` `ARES-MedOS` (`Channel<Response>` `128 B`, `--mode desktop` / `desktop-smoke-test`, hook `whisper-rs` offline). |
| `ares-cockpit/` | Cockpit OLED puro `#000000` (`[V2 10001]`): `OsSystemStatusBar`, `OsCommandPalette` (`Alt+Space`), `OsVoiceCopilot`, `ProvenanceInspector`, `BodyHeatmap` (`UBERON:` + `.glb` guard), `WhatIfConsole`, `MriAndStl`, `PlaybookRunner`. |
| `deploy/medos/` & `scripts/` | Manifesti Tier B/C (`Asterinas`, `COSMIC` Wayland Kiosk, `Oxide Hubris`), `launch_ares_medos.sh`, `run_block_k_suite.sh`, `agent_probe.sh`, `build_submission_docs.sh`. |

---

## 4. Avanzamento Blocchi `0–L` (Fasi `01–34`) & Metriche Verificate

- **Blocchi `A–K` (`Fasi 01–28`):** Completati e verificati su `main` con **`126/126` test passanti su `28` suite**, `0` warning Clippy, `0` `.unwrap()`/`.expect()` in produzione (`crates/*/src/`).
- **Metriche `--release` (`N = 1,000`, Block K4):**
  - `SeqlockTelemetryRing::read_latest_bytes`: `p50 = 42.0 ns`, `p99 = 42.0 ns`, `p99.9 = 84.0 ns` (`+ CRC-32C`: `p50 = 791.0 ns`, `p99.9 = 959.0 ns`).
  - Pipeline completo 1-tick: `p50 = 2.12 us`, `p99 = 2.25 us`, `p99.9 = 5.58 us`.
  - `AresUnifiedDatasetGraph`: query `p50 = 16.25 us`, shortest path `p50 = 16.33 us`, `BioKG` O(1) `p50 = 41.0 ns`, `196,264 B` RAM stimata (`< 10 MB`).
  - Compattatore longitudinale `900 Sol`: `167,352 B` (`< 200 KB`).
- **Blocco `L` (`Fasi 29–34` / `L1–L6`):** Integrazione live bindings cockpit (`L1`), finestra nativa `Tauri v2` + `shm_bus` (`L2`), DSP puro Level-1 `GATHER` (`L3`), Edge LLM + Voice Copilot + `SafeTensors` (`L4`), adapter Parquet + harness di calibrazione *subject-disjoint* `CQR` (`L5`), e pipeline deterministica di sottomissione NASA Space Apps 2026 con `Typst 0.15.1` (`L6`).

---

## 5. Matrice Multi-Agenzia delle Fonti & Ruolo Probatorio (`24` Dataset Catalogati)

In `AresUnifiedDatasetGraph` (`data/knowledge_graph/GRAPH_REPORT.md`: `110` nodi, `326` archi Biolink, `24` dataset catalogati, `27` slice `BIDMC`) e nel dossier di sottomissione, ogni risorsa mantiene il proprio ruolo epistemico secondo [MODEL_EVIDENCE_AUDIT.md](docs/architecture/MODEL_EVIDENCE_AUDIT.md):

| Categoria / Agenzia | Risorse & Identificativi | Ruolo in `ARES-Health` (`Evidence Role`) |
| :--- | :--- | :--- |
| **PhysioNet (Replay Primario)** | `BIDMC v1.0.0` (`bidmc_01..03`, `ODC-By-1.0`) | `RECORDED_REPLAY_INPUT`: sorgente reale `1 Hz`, `SHA-256` verificata, `13` null preservati. |
| **NASA OSDR / GeneLab** | `OSD-51`, `OSD-195`, `OSD-570`, `OSD-571`, `OSD-635`, `OSD-818`, `Rodent Research RR-1..RR-10` | `BIOLOGICAL_CONTEXT_ONLY`: meccanismi trascrittomici, *ex vivo* SANS ed endoteliali in `BioKG`. |
| **NASA HRP, NLSP, LSAH & Analoghi** | `HRP Risks`, `ARCHeR`, `Zero T2`, `CIPHER`, `NASA-0000100` (`BRSMFSR`, `BRSMPT`), `LSAH`, `CHAPEA`, `HERA` | `CATALOG_GRAPH_METADATA` / `NORMATIVE_REQUIREMENT_CONTEXT`. |
| **Standard NASA** | `NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F`, `OCHMO MTB-007`, `NSRL GCR`, `ISS Acoustic` | `NORMATIVE_REQUIREMENT_CONTEXT`: clausole `[V1 3001]`–`[V2 10152]`, privacy e EIMO. |
| **CSA, ESA, DLR, JAXA, TRISH** | `CSA CANS (2026)`, `Bio-Monitor`, `Vascular`, `MARROW`, `ESA Myotones`, `BRACE`, `AGBRESA`, `MARS-500`, `SIRIUS`, `EXPAND`, `Bisphosphonates` | `BIOLOGICAL_CONTEXT_ONLY` / `BIOMEDICAL_SCHEMA_CONTEXT`. |
| **Benchmark Terrestri (PhysioNet / NIH / UCI)** | `CEBS`, `Fantasia`, `PPG-DaLiA`, `MIT-BIH`, `PTB-XL`, `MIMIC-IV`, `HiRID`, `Tilt Table`, `MESA`, `SHHS`, `Look AHEAD`, `GTEA` | `TECH_BENCHMARK_ONLY` / `CATALOG_GRAPH_METADATA` (inclusi target Parquet Phase 33). |

---

## 6. Regole di Gara, Fresh Code, Trasparenza AI & Riferimenti

- **Fresh Code & Licenza:** Tutto il codice (`crates/`, `ares-cockpit/`, `scripts/`) è rilasciato con licenza duale **`MIT OR Apache-2.0`** ([LICENSE](LICENSE)) appoggiandosi esclusivamente a librerie open source standard (`tokio`, `axum`, `petgraph`, `tauri`, `react`, `three`, `typst`) e dataset pubblici citati.
- **Trasparenza AI:** L'eventuale LLM locale (`edge_llm_bridge.rs` / `FastMCP` `<= 600 B`) opera esclusivamente in lettura consultiva (`DAL-E`), protetto da `<untrusted_telemetry_observation>` e con fallback deterministico `< 400 us`; nessun calcolo ODE o Safety Gate è delegato a modelli generativi.
- **Documenti Chiave di Riferimento:**
  - [MODEL_EVIDENCE_AUDIT.md](docs/architecture/MODEL_EVIDENCE_AUDIT.md) — Registro autorevole delle evidenze (Issue #12)
  - [docs/scientific_references.md](docs/scientific_references.md) — Bibliografia peer-reviewed e standard (Sezioni `1–11`)
  - [docs/plans/BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md](docs/plans/BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md) — Architettura Blocco L (`Fasi 29–34`)
  - [docs/submission/NASA_2026_7_SLIDE_DECK.typ](docs/submission/NASA_2026_7_SLIDE_DECK.typ) & [docs/submission/NASA_SUBMISSION_PORTAL_READY.md](docs/submission/NASA_SUBMISSION_PORTAL_READY.md) — Pacchetto ufficiale di consegna NASA Space Apps 2026
  - [09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md) & [11_Official_Submission_Guide_and_Ready_To_Paste_Form.md](11_Official_Submission_Guide_and_Ready_To_Paste_Form.md)
  - [contracts/telemetry_schema.json](contracts/telemetry_schema.json) — Schema telemetrico condiviso Rust / TypeScript
