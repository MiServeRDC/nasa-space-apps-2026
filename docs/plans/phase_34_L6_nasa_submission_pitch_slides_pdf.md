# Piano Implementativo Definitivo — Fase 34 (L6): Official NASA Space Apps 2026 Submission Package, Typst 7-Slide Deck, Dual Video Scripts & Document Sync

- **Blocco Architetturale**: Blocco L (*Operational Deployment, Edge AI Copilot, Clinical Calibration & NASA Space Apps 2026 Submission*, Fasi 29–34)
- **Fase**: Fase 34 (`L6` — Chiusura Finale Blocco L e Consegna Ufficiale di Gara)
- **Stato**: `PLANNED (READY FOR EXECUTION)`
- **Documenti Normativi & Audit di Riferimento**:
  - [09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md)
  - [11_Official_Submission_Guide_and_Ready_To_Paste_Form.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/11_Official_Submission_Guide_and_Ready_To_Paste_Form.md)
  - [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md)
  - [PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md)
  - [scientific_references.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/scientific_references.md)
- **Crate & Moduli Sorgente Referenziati**:
  - Backend Rust (`8` crate): `crates/ares-core-types`, `crates/ares-telemetry-ingest`, `crates/ares-causal-graph`, `crates/ares-nqs-stl`, `crates/ares-medops-playbooks`, `crates/ares-security-privacy`, [main.rs (ares-server-cli)](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/crates/ares-server-cli/src/main.rs), [main.rs (ares-desktop-os)](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/crates/ares-desktop-os/src/main.rs)
  - Cockpit Frontend & Shell `ARES-MedOS`: [App.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/App.tsx), [OsSystemStatusBar.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/os-shell/OsSystemStatusBar.tsx), [OsCommandPalette.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/os-shell/OsCommandPalette.tsx), [ProvenanceInspector.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/provenance/ProvenanceInspector.tsx), [WhatIfConsole.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/whatif-console/WhatIfConsole.tsx), [PlaybookRunner.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx)
  - Script & Dataset Reali: [launch_ares_medos.sh](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/scripts/launch_ares_medos.sh), [run_block_k_suite.sh](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/scripts/run_block_k_suite.sh), [agent_probe.sh](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/scripts/agent_probe.sh), [MANIFEST.json](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/data/bidmc/MANIFEST.json)
- **Piani Precedenti Collegati**:
  - [phase_21_J1](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md), [phase_22_J2](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md), [phase_23_J3](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md), [phase_24_J4](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) (`Blocco J: ARES-MedOS`)
  - [BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md), [phase_25_K1](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_25_K1_property_based_numerical_ode_stl_verification.md), [phase_26_K2](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md), [phase_27_K3](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_27_K3_full_stack_contract_cockpit_ipc_mcp_e2e.md), [phase_28_K4](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/plans/phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md) (`Blocco K: Verification & Benchmarks`)
  - Fasi `29–33` (`L1`–`L5`: Operational Deployment `--mode live`, Air-Gapped Quantized Edge LLM Copilot, Offline Voice/TTS Copilot, Multi-Record Replay & Phase 33 Subject-Disjoint Clinical Calibration Gate)
- **Owner Principale**: `@fabiomalagutti27-droid` (con verifica collegiale `@carolina2910`, `@fertech02`, `@LelloXV`, `@MiServeRDC`)
- **File Target Previsti**:
  1. `docs/submission/NASA_2026_7_SLIDE_DECK.typ` *(NEW — sorgente Typst `0.15.1` widescreen `16:9` OLED `#000000`, zero rete, esattamente `7` slide in lingua inglese)*
  2. `docs/submission/NASA_2026_7_SLIDE_DECK.pdf` *(GENERATED — deck PDF deterministico per Format Option B, verificato a `7` pagine esatte)*
  3. `docs/submission/PITCH_30S_STORYBOARD.md` *(NEW — regia frame-by-frame `<= 30.0 s` Format Option A con cue di cattura `ARES-MedOS`)*
  4. `docs/submission/PITCH_30S_SUBTITLES_EN.srt` *(NEW — sottotitoli inglesi SubRip validati con timecode massimo `<= 00:00:30,000`)*
  5. `docs/submission/WALKTHROUGH_180S_DEMO_SCRIPT.md` *(NEW — coreografia tecnica riproducibile terminale + cockpit `<= 180.0 s`)*
  6. `docs/submission/WALKTHROUGH_180S_SUBTITLES_EN.srt` *(NEW — sottotitoli inglesi SubRip validati con timecode massimo `<= 00:03:00,000`)*
  7. `docs/submission/NASA_SUBMISSION_PORTAL_READY.md` *(NEW — blocchi inglesi copy-paste conformi a Issue `#12`, AI & Runtime MCP Disclosure, Fresh-Code/OSI License Audit e Matrice a 24 fonti)*
  8. `docs/submission/PANORAMICA_GENERALE_PROGETTO.typ` *(NEW — sorgente Typst sincronizzata ai Blocchi `A–L`, 8 crate e `MODEL_EVIDENCE_AUDIT.md`)*
  9. [PANORAMICA_GENERALE_PROGETTO.pdf](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.pdf) *(REGENERATED — rigenerazione deterministica che elimina l'esportazione storica pre-Issue `#12`)*
  10. [PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md) *(SYNC — allineamento architetturale a 8 crate, `ARES-MedOS`, Blocco K e Blocco L)*
  11. `scripts/build_submission_docs.sh` *(NEW — pipeline di compilazione Typst `/opt/homebrew/bin/typst` + 6 gate deterministici CI)*
  12. [scientific_references.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/scientific_references.md) *(UPDATE Sezione 11 — standard tipografici, SubRip `.srt`, ISO 32000-2 e portali NASA Space Apps 2026)*
- **Budget Esecuzione & Invarianti di Conformita**:
  - **Toolchain Locale Verificata**: `/opt/homebrew/bin/typst` (`typst 0.15.1`), `/usr/bin/python3` (`stdlib` pura, zero dipendenze esterne mancanti come `pdfinfo`/`qpdf`/`pypdf` sull'host macOS)
  - **Tempo Totale Build + 6 Gate (`scripts/build_submission_docs.sh`)**: `< 2.5 s` completamente offline (`SOURCE_DATE_EPOCH=1794670800`)
  - **Invariante Onesta Scientifica (`Issue #12`)**: Separazione tassativa tra osservazioni terrestri registrate (`RECORDED_TERRESTRIAL_BIDMC_CSV`) e modelli di scenario illustrativi (`ILLUSTRATIVE_UNVALIDATED`, `ILLUSTRATIVE_SCENARIO_RANGE`, `HEURISTIC_GATE_ACCEPTED`), preservando `null` / `BEAT_INTERVALS_NOT_AVAILABLE` su HRV assente. Zero emoji in tutti i file.

---

## 1. Executive Summary & Scientific / Regulatory Grounding

### 1.1 Obiettivo: Trasformare il Sistema Verificato (Blocchi A–L) in un Pacchetto di Sottomissione NASA Riproducibile, Auditabile e Conforme a Issue `#12`

Con il completamento dei Blocchi `A–K` (`126/126` test passanti su `28` suite e `8` crate Rust, `0` `.unwrap()`/`.expect()` in produzione, pipeline 1-tick `--release` a `p99.9 = 5.58 us`, `SeqlockTelemetryRing` a `p50 = 42.0 ns`) e l'integrazione operativa del Blocco `L` (`Fasi 29–33`: modalita `--mode live`, Edge AI Copilot quantizzato locale, Voice Copilot offline e protocollo di calibrazione clinica *subject-disjoint*), la **Fase 34 (`L6`)** chiude l'ultimo anello critico per la valutazione locale e globale della **NASA Space Apps Challenge 2026**: la coerenza documentale, visiva e normativa di tutti gli artefatti di consegna.

Dall'ispezione puntuale del workspace emergono quattro criticita reali che la Fase 34 (`L6`) risolve in modo deterministico:
1. **Eliminazione dei PDF Storici Non Qualificati ([MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md#L74)):** Nella root del repository risiede un file binario storico [PANORAMICA_GENERALE_PROGETTO.pdf](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.pdf) (`460,103 B`, generato il `13 Nov` prima dell'audit `Issue #12` e dei Blocchi `H–L`), affiancato da un secondo export storico (`ARES-Health — Playbook di Utilizzo delle Fonti NASA e Guida Operativa alle 48 Ore di Gara.pdf`). Parallelamente, [PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md#L136-L148) descrive ancora la topologia iniziale monolitica (`ares-engine/src/*.rs`) anziche il workspace effettivo a `8` crate + `ARES-MedOS`.
2. **Riconciliazione del Linguaggio del Modulo di Sottomissione ([11_Official_Submission_Guide_and_Ready_To_Paste_Form.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/11_Official_Submission_Guide_and_Ready_To_Paste_Form.md#L80-L116)):** I testi *ready-to-paste* redatti in Fase 0 contengono formulazioni antecedenti a `Issue #11` e `Issue #12` (es. riferimenti a *7-day EWMA-OLS*, *95% CI*, *DFT spectral entropy SQI* o *validates/calibrates* su parametri di scenario non addestrati). In `docs/submission/NASA_SUBMISSION_PORTAL_READY.md` ogni campo viene riallineato al contratto [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md#L25-L73).
3. **Copertura Simultanea dei Due Formati Demo Ufficiali NASA ([09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md#L76-L101)):** Copertura deterministica sia di **Option A** (*Video Pitch* $\le 30.0\text{ s}$ con sottotitoli inglesi `.srt` certificati al millisecondo), sia di **Option B** (*Slide Deck* inglese rigorosamente $\le 7$ slide generato da codice `Typst 0.15.1`), oltre al **Walkthrough Tecnico Esteso** ($\le 180.0\text{ s}$) per la giuria tecnica e i *Global Award Judges*.
4. **Allineamento dei Flag CLI tra `main` (Blocco K) e Blocco L:** Sul branch corrente, [crates/ares-server-cli/src/main.rs](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/crates/ares-server-cli/src/main.rs#L11-L23) espone `--mode <ws-and-mcp|ws-only|mcp-only|smoke-test|build-graph>`, [crates/ares-desktop-os/src/main.rs](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/crates/ares-desktop-os/src/main.rs#L11-L17) espone `--mode <desktop|desktop-smoke-test>`, e [scripts/launch_ares_medos.sh](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/scripts/launch_ares_medos.sh#L6-L9) espone `--desktop | --web | --verify` (mentre `--mode live` e introdotto/aliasato nel Blocco L, [activeContext.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/memory-bank/activeContext.md#L62)). Gli script demo e di verifica di Fase 34 documentano e supportano entrambi gli entrypoint senza ambiguita.

### 1.2 Mappatura Formale sui 5 Criteri di Valutazione Ufficiali NASA (`5 x 20% = 100%`)

Ogni artefatto della Fase 34 (`L6`) ottimizza una funzione obiettivo multi-criterio pesata uniformemente sui cinque pilastri ufficiali ([09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md#L105-L142)):

$$S_{\text{NASA}} = 0.20\,S_{\text{Impact}} + 0.20\,S_{\text{Creativity}} + 0.20\,S_{\text{Validity}} + 0.20\,S_{\text{Relevance}} + 0.20\,S_{\text{Presentation}}$$

| Criterio NASA (`Peso`) | Evidenza Tecnica Verificabile nel Workspace `ARES-Health` | Artefatti di Fase 34 (`L6`) che lo Dimostrano |
| :--- | :--- | :--- |
| **1. Impact (`20%`)** | Autonomia medica *Earth-Independent Medical Operations* (`EIMO`, `NASA-STD-3001 [V1 3006]`) sotto latenza radio Terra-Marte $t_{\text{RTT}} \in [8, 48]\text{ min}$ e blackout di `14` giorni; ricadute terrestri per terapie intensive rurali offline, spedizioni polari/sottomarine e sarcopenia da allettamento. | `Slide 1`, `Slide 5`, `Slide 7`; `PITCH_30S` (`00:00–00:05`, `00:25–00:30`); Campo 2 & 3 Portal Bundle. |
| **2. Creativity (`20%`)** | Shell `ARES-MedOS` in Safe Rust (`8` crate), frame binario cache-aligned `128 B` `BinaryTelemetryFrame` (`SeqlockTelemetryRing` `42 ns`), logica temporale `NQS-STL` $O(1)$ (`LemireMinWedge`), co-processore `Timestral` non-crossing e palette `Alt+Space` `FastMCP` (`<= 600 B` / `< 150 token`) + Voice Copilot offline. | `Slide 4`, `Slide 6`; `WALKTHROUGH_180S` Atto II & Atto IV. |
| **3. Validity (`20%`)** | Omogeneita dimensionale CGS $\tau_w(t) = 2\mu v_{\max}\sqrt{\pi/\text{CSA}}$ (`dyn/cm^2`), convergenza $O(h^4)$ RK4 di Richardson (`ratio >= 14.5`), `126+` test (`proptest` `10,000` casi, chaos SEU `CRC-16`/`CRC-32C`), preservazione rigorosa di `null` (`BEAT_INTERVALS_NOT_AVAILABLE`) e trasparenza epistemica `ILLUSTRATIVE_UNVALIDATED` ([MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md)). | `Slide 2`, `Slide 3`, `Slide 4`, `Slide 7` + Badge persistente su tutte le 7 slide; `WALKTHROUGH_180S` Atto I & Atto V. |
| **4. Relevance (`20%`)** | Chiusura completa del ciclo canonico **`GATHER -> EVALUATE -> ACT`**, copertura dei 5 rischi `RIDGE` e tracciabilita esplicita di `24` fonti multi-agenzia (`NASA HRP`, `OSDR`, `NLSP`, `LSAH`, `NASA-STD-3001`, `CSA CANS/Bio-Monitor`, `ESA Myotones/BRACE`, `DLR`, `TRISH`, `JAXA`, `PhysioNet BIDMC`). | `Slide 2` (`GATHER`), `Slide 3–4` (`EVALUATE`), `Slide 5` (`ACT`), `Slide 7` (`24-Dataset Matrix`); Tabella Master Portal Bundle. |
| **5. Presentation (`20%`)** | Estetica aerospaziale OLED `#000000` ad alto contrasto (`[V2 10001]`), deck `16:9` Typst compilato a `7` pagine esatte, video pitch `<= 30.0 s` e walkthrough `<= 180.0 s` con sottotitoli inglesi `.srt` sincronizzati e repository riproducibile con un singolo comando. | `NASA_2026_7_SLIDE_DECK.pdf`, `PITCH_30S_*`, `WALKTHROUGH_180S_*`, `PANORAMICA_GENERALE_PROGETTO.pdf`. |

---

## 2. Decisioni Architetturali & Tabella Completa dei File Coinvolti

### 2.1 Scelte di Progetto Non Negoziabili per la Pipeline Documentale Offline

1. **Zero Dipendenze di Rete in Typst (`Air-Gapped Compilation`):**
   Il compilatore locale verificato `/opt/homebrew/bin/typst` (`typst 0.15.1`) non deve mai tentare download da `packages.typst.org` (che fallirebbero in ambienti CI air-gapped). Pertanto `NASA_2026_7_SLIDE_DECK.typ` e `PANORAMICA_GENERALE_PROGETTO.typ` implementano il layout `16:9` e `A4` direttamente in puro linguaggio Typst nativo (ispirato strutturalmente ai pattern dichiarativi di `touying` e `polylux`, senza `#import "@preview/..."` remoti).
2. **Doppio Oracolo per il Conteggio Pagine PDF (`Typst Query` + `Python Stdlib ISO 32000-2`):**
   L'ispezione dell'ambiente macOS mostra che `pdfinfo`, `qpdf` e `pypdf` non sono preinstallati di default, mentre `/opt/homebrew/bin/typst` e `/usr/bin/python3` sono presenti. `scripts/build_submission_docs.sh` implementa quindi una **verifica a doppio oracolo indipendente**:
   - **Oracolo 1 (Semantico Typst):** etichetta `#metadata((total_pages: ...)) <deck-meta>` interrogata via `typst query --root . ... "<deck-meta>" --field value --one`;
   - **Oracolo 2 (Strutturale Binario PDF):** parser Python 3 `stdlib` (`zlib` + scansione dizionari `/Type /Pages` e `/Type /Page` con decompressione `FlateDecode` per *object streams* PDF 1.5+, affiancato da `pdfinfo`/`qpdf`/`pypdf` se presenti sull'host CI) che verifica fisicamente `N_pages == 7` sul file `.pdf` emesso.
3. **Gate Condizionale di Onesta Clinica (`Issue #12` / Fase 33):**
   Tutti i documenti di sottomissione espongono esplicitamente lo stato `ILLUSTRATIVE_UNVALIDATED` per le uscite di scenario e `ILLUSTRATIVE_SCENARIO_RANGE` per i coni `TTV`. Solo qualora la Fase 33 (`L5`) produca su disco un manifesto validato `data/calibration/phase_33_validation_manifest.json` con `"status": "QUALIFIED_CALIBRATED"` e metriche *out-of-sample subject-disjoint* verificate, lo script consente l'aggiornamento controllato delle sole metriche effettivamente calibrate, mantenendo invariato il divieto assoluto di dichiarare certificazione clinica o *fitness-for-duty*.

### 2.2 Tabella File Target della Fase 34 (`L6`)

| File Target | Tipo | Ruolo Specifico nella Fase 34 (`L6`) |
| :--- | :---: | :--- |
| `docs/submission/NASA_2026_7_SLIDE_DECK.typ` | `NEW` | Sorgente Typst `0.15.1` widescreen `16:9` (`#000000` OLED) per il Pitch Deck ufficiale inglese da `7` slide (Format Option B), con metadato `<deck-meta>` e badge `ILLUSTRATIVE_UNVALIDATED`. |
| `docs/submission/NASA_2026_7_SLIDE_DECK.pdf` | `GENERATED` | Artefatto PDF deterministico (`--creation-timestamp 1794670800`) verificato automaticamente a `7` pagine esatte. |
| `docs/submission/PITCH_30S_STORYBOARD.md` | `NEW` | Storyboard tecnico-visivo al millisecondo (`00:00–00:05`, `00:05–00:15`, `00:15–00:25`, `00:25–00:30`, `<= 30.0 s`) per Format Option A. |
| `docs/submission/PITCH_30S_SUBTITLES_EN.srt` | `NEW` | Sottotitoli inglesi SubRip per il pitch da 30s (`max_end <= 00:00:30,000`, `<= 20 CPS`, zero emoji). |
| `docs/submission/WALKTHROUGH_180S_DEMO_SCRIPT.md` | `NEW` | Script operativo riproducibile da `180 s` (terminale + `ARES-MedOS` cockpit, `bidmc_01` `null` honesty, What-If `< 1 ms`, Safety Gates `1/2/3`, `Alt+Space` FastMCP + Voice Copilot, `MODEL_EVIDENCE_AUDIT.md`). |
| `docs/submission/WALKTHROUGH_180S_SUBTITLES_EN.srt` | `NEW` | Sottotitoli inglesi SubRip per il walkthrough da 180s (`max_end <= 00:03:00,000`). |
| `docs/submission/NASA_SUBMISSION_PORTAL_READY.md` | `NEW` | Testi inglesi definitivi pronti per il portale NASA Space Apps 2026, riconciliati con [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md), AI Disclosure duale, Fresh-Code/OSI Audit e Matrice a 24 fonti. |
| `docs/submission/PANORAMICA_GENERALE_PROGETTO.typ` | `NEW` | Sorgente Typst `A4` del blueprint generale italiano aggiornato a `8` crate, `Blocchi A–L`, `ARES-MedOS` e audit `Issue #12`. |
| [PANORAMICA_GENERALE_PROGETTO.pdf](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.pdf) | `REGEN` | Rigenera il PDF obsoleto della root eliminando il disallineamento segnalato in [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md#L74). |
| [PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md) | `SYNC` | Aggiorna la sezione architetturale da monolitica (`src/*.rs`) alla reale topologia a `8` crate (`Blocchi A–L`), `126+` test e `ARES-MedOS`. |
| `scripts/build_submission_docs.sh` | `NEW` | Script POSIX/Bash + Python 3 stdlib che compila i `.typ` e valida tutti i `6` gate di conformita (`L6-01`..`L6-06`). |
| [scientific_references.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/scientific_references.md) | `UPDATE` | Aggiunge la **Sezione 11** con citazioni formali per `typst/typst`, `touying`/`polylux`, SubRip `.srt`, ISO 32000-2 e linee guida NASA Space Apps 2026. |

---

## 3. Specifiche Architetturali di Dettaglio dei 5 Deliverable (`A`–`E`)

### 3.1 Deliverable A: Typst 7-Slide English Competition Pitch Deck (`docs/submission/NASA_2026_7_SLIDE_DECK.typ` $\to$ `.pdf`)

#### 3.1.1 Geometria Pagina, Palette OLED Aerospaziale e Contratto Visivo
Il deck rispetta simultaneamente la palette ufficiale del dossier ([09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md#L171)) e i token CSS di [index.css](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/index.css#L5-L15):
- **Formato Pagina:** `paper: "presentation-16-9"` (`841.89pt x 473.56pt`), margini `{ top: 34pt, bottom: 26pt, x: 28pt }`, sfondo puro `rgb("#000000")`.
- **Token Cromatici:**
  - `oled-bg`: `#000000` | `panel-bg`: `#0A0A0A` | `border-line`: `#1F2937`
  - `accent-cyan` (*Nominal / Telemetry / IPC*): `#06B6D4`
  - `accent-amber` (*Advisory / Scenario Provenance / Evidence Status*): `#F59E0B`
  - `accent-red` (*Critical Violation / Safety Gate Lock*): `#EF4444`
  - `accent-ok` (*Verified Checksum / Gate Armed*): `#4ADE80`
  - `text-primary`: `#F3F4F6` | `text-muted`: `#9CA3AF`
- **Header & Footer Persistenti (Replica di [OsSystemStatusBar.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/os-shell/OsSystemStatusBar.tsx#L193-L294)):**
  - *Header Superiore:* `ARES-HEALTH // ARES-MEDOS v0.1` | `NASA SPACE APPS 2026: HEALTH MONITORING SOFTWARE` | Pillar tag (`GATHER` / `EVALUATE` / `ACT` / `ARCHITECTURE` / `TRACEABILITY`) | Pagina `k / 7`.
  - *Footer Inferiore Persistente (Audit `Issue #12`):* Badge ambra `#F59E0B` presente su **tutte le 7 slide**:
    `EVIDENCE AUDIT (ISSUE #12): RECORDED BIDMC v1.0.0 != ILLUSTRATIVE_UNVALIDATED SCENARIO MODELS | NOT CLINICALLY VALIDATED OR FITNESS-FOR-DUTY`

#### 3.1.2 Mappatura Rigorosa Slide-by-Slide (`Slide 1` – `Slide 7`)

| Slide | Titolo Ufficiale (Inglese) | Contenuto Tecnico, Equazioni & Metriche Verificate da Includere | Criteri NASA Coperti |
| :---: | :--- | :--- | :--- |
| **1** | **Title & The 8–48 Min Mars Latency Hook** | **ARES-Health**: *Autonomous Resilient Edge-native System for Astronaut Health*. Team `MiServeRDC/nasa-space-apps-2026` (Lead: Fabio Malagutti, Univ. of Bologna, 5-member team). Barriera fisica della luce: $t_{\text{OWLT}} \in [4, 24]\text{ min}$ ($t_{\text{RTT}} \in [8, 48]\text{ min}$) + `14-day` solar conjunction blackout (`NASA CHAPEA`, `NASA-STD-3001 [V1 3006]` EIMO). Ciclo chiuso `100%` air-gapped: `GATHER -> EVALUATE -> ACT`. Licenza `MIT OR Apache-2.0`. | `Impact`, `Presentation` |
| **2** | **GATHER — BIDMC Live Replay, SQI & Multi-Modal Telemetry** | Replay deterministico `1 Hz` su `PhysioNet BIDMC v1.0.0` (`bidmc_01..03_Numerics.csv`, `481` righe `0..480 s`, SHA-256 in `data/bidmc/MANIFEST.json`) disaccoppiato dallo stream UI a `20 Hz`. Onesta dei dati mancanti (`Issue #4` & `Issue #11`): `13` valori `PULSE`/`SpO2` assenti in `bidmc_01` preservati come `null`/`MISSING` (mai `0.0`); `rmssd_ms: None` con `BEAT_INTERVALS_NOT_AVAILABLE` senza R-R nativi. Schema bus multimodale: radar contactless (`CEBS`), pacchetto wearable `32 B` (`CRC-16-CCITT` + contatore SEU `Hubris`), dosimetria neutronica `CSA CANS` (`mSv/d`) ed euristica numerica `SQI >= 0.70` con ZOH `30 s`. | `Relevance`, `Validity` |
| **3** | **EVALUATE I — ADHG Muscle-Bone-Vascular ODEs & BioKG** | Grafo causale diretto `ADHG` (`petgraph::StableDiGraph` in `ares-causal-graph`) contestualizzato su `OSD-51`, `OSD-195`, `OSD-818`, `ESA Myotones`, `Marshall-Goebel JAMA 2019` (*modelli di scenario illustrativi*). ODE di scenario della Sclerostina RK4 ($O(h^4)$ Richardson `ratio >= 14.5`, $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), indicatori illustrativi `MQI` e `GAI` (`0.38g`). Shear stress endoteliale CGS dimensionalmente esatto: $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}_{\text{cm}^2}(t)}$ ($\mu = 0.035\text{ Poise}$, `dyn/cm^2`). Osservatore di scenario POCUS a 2 stadi ($P_{\text{pre}} \le 0.45$) + `BiomedicalEvidenceDescriptor` (`16 B`, `CRC-8`) e `ARES-DatasetGraph` (`110` nodi, `326` archi Biolink). | `Validity`, `Creativity` |
| **4** | **EVALUATE II — NQS-STL $O(1)$ Lemire Wedge & Timestral Cones** | Normalizzazione adimensionale `NQS-STL`: $\hat{\rho}_k(t) = \operatorname{clamp}(s_k(x_k(t)-x_{k,\text{crit}})/|x_{k,\text{nom}}-x_{k,\text{crit}}|, -2.0, +1.0)$. Operatore temporale $\Box_{[t-W,t]}\hat{\rho}_k$ calcolato in $O(1)$ ammortizzato ($\le 3$ confronti/campione) con `LemireMinWedge` (verificato contro oracolo $O(W)$ su `2,000` sequenze). Co-processore Pure-Rust `Timestral` (`CausalScaler` `asinh`/`sinh` + maschera canali mancanti) con testa quantilica monotona `QuantileHead`: $q_{0.05} \le q_{0.50} \le q_{0.95}$ via `stable_softplus` (`0` incroci su `10,000` input avversi `proptest`), gate `HEURISTIC_GATE_ACCEPTED` e cono di sensibilita `ILLUSTRATIVE_SCENARIO_RANGE` per `TTV` (distinto da intervalli di confidenza calibrati al `95%`). | `Creativity`, `Validity` |
| **5** | **ACT — Type-1 MedOps Playbooks & 3 Hard Clinical Safety Gates** | Cristallizzazione progressiva (`ares-medops-playbooks`): Playbook `#01–#05` compilati come DAG deterministici Type-1 in Safe Rust (`< 20 us`), zero LLM nel loop decisionale critico. **Gate 1 (Anticoagulation Lock):** farmaci anticoagulanti bloccati (`GATE 1 LOCKED`) in stasi isolata senza `pocus_thrombus_confirmed == true`. **Gate 2 (LBNP Anti-Syncope Auto-Vent):** sfiato immediato a `0 mmHg` durante scenario LBNP `-30 mmHg` se $\Delta\text{SBP} > 15\text{ mmHg}$ o $\text{HR} > 115\text{ bpm}$. **Gate 3 ($0.38g$ Mars Gait Guardrail):** se $\text{GAI}_{0.38g} > 12\%$, attiva `+25%` smorzamento caviglia/ginocchio tuta EVA (`eva_suit_damping_active = true`). | `Impact`, `Relevance` |
| **6** | **ARES-MedOS Edge Architecture — 8-Crate Rust, 128B IPC, FastMCP & Copilot** | Workspace Safe Rust 2024 a `8` crate (`0` `.unwrap()`/`.expect()` in produzione, `126+` test Blocco K+L), shell `Tauri v2` `ares-desktop-os` + cockpit React 19 OLED `#000000` (`[V2 10001]`, `[V2 10022]`, `[V2 10152]`), manifesti Tier B/C (`Asterinas` Framekernel, `COSMIC` Wayland Kiosk, `Oxide Hubris`). Frame `128 B` `#[repr(C, align(64))] BinaryTelemetryFrame` (`Castagnoli CRC-32C`) su `SeqlockTelemetryRing` (`p50 = 42.0 ns`, `p99.9 = 84.0 ns`; 1-tick pipeline `p99.9 = 5.58 us`; compattatore `900-Sol` `167.4 KB`). Palette `Alt+Space` `FastMCP` (`8` tool `<= 600 B` / `< 150 token`, scudo `<untrusted_telemetry_observation>`, catena `SHA-256`, AEAD `ChaCha20-Poly1305`) + Edge LLM quantizzato locale & Voice Copilot offline limitati alla sola spiegazione testuale/vocale. | `Creativity`, `Presentation` |
| **7** | **24-Dataset Multi-Agency Traceability, Honest Evidence & Earth Spin-Offs** | Tabella sintetica delle `24` fonti multi-agenzia: NASA (`HRP`, `OSDR OSD-51/195/570/571/818`, `NLSP NASA-0000100`, `LSAH`, `CHAPEA`, `HERA`, `NASA-STD-3001 Vol. 1 & 2`), CSA (`CANS 2026`, `Bio-Monitor`, `Vascular`, `MARROW`), ESA/DLR/JAXA/TRISH (`Myotones`, `BRACE`, `:envihab`, `Bisphosphonates`, `EXPAND`), PhysioNet/UCI (`BIDMC v1.0.0`, `CEBS`, `Fantasia`, `PPG-DaLiA`). Quadro a 3 colonne di [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md): (1) *Recorded Replay*, (2) *Illustrative Scenario Models*, (3) *Phase 33 Subject-Disjoint Validation Protocol*. Spin-off terrestri: ICU rurale offline, medicina estrema e tele-riabilitazione geriatrica. | `Relevance`, `Impact`, `Validity` |

#### 3.1.3 Scheletro Tecnico Typst `0.15.1` (`docs/submission/NASA_2026_7_SLIDE_DECK.typ`)

```typst
// docs/submission/NASA_2026_7_SLIDE_DECK.typ
// Compilabile 100% offline con Typst 0.15.1 (/opt/homebrew/bin/typst) — Zero pacchetti di rete, Zero emoji.

#let evidence-status = sys.inputs.at("evidence_status", default: "ILLUSTRATIVE_UNVALIDATED")

#let oled-black   = rgb("#000000")
#let panel-dark   = rgb("#0A0A0A")
#let border-line  = rgb("#1F2937")
#let cyan-nom     = rgb("#06B6D4")
#let amber-warn   = rgb("#F59E0B")
#let red-crit     = rgb("#EF4444")
#let green-ok     = rgb("#4ADE80")
#let text-main    = rgb("#F3F4F6")
#let text-muted   = rgb("#9CA3AF")

#set document(
  title: "ARES-Health: Official NASA Space Apps Challenge 2026 7-Slide Deck",
  author: "Fabio Malagutti & ARES-Health Team (University of Bologna)",
)

#set page(
  paper: "presentation-16-9",
  fill: oled-black,
  margin: (top: 34pt, bottom: 28pt, x: 28pt),
  header: context {
    let pg = counter(page).get().first()
    block(width: 100%, stroke: (bottom: 0.75pt + border-line), inset: (bottom: 5pt))[
      #set text(size: 8.5pt, fill: text-muted, font: ("SF Mono", "Menlo", "DejaVu Sans Mono"))
      #grid(
        columns: (1fr, auto, auto),
        align: (left, center, right),
        [#strong(text(fill: cyan-nom)[ARES-MEDOS v0.1]) | NASA SPACE APPS 2026 — ASTRONAUT HEALTH MONITORING],
        [AIR-GAPPED SAFE RUST 2024 | OWLT 4-24 MIN EIMO \[V1 3006\]],
        [#text(fill: text-main)[SLIDE #pg / 7]],
      )
    ]
  },
  footer: context {
    let total = counter(page).final().first()
    [
      #metadata((total_pages: total, evidence_status: evidence-status)) <deck-meta>
      #block(width: 100%, stroke: (top: 0.75pt + border-line), inset: (top: 5pt))[
        #set text(size: 7.5pt, font: ("SF Mono", "Menlo", "DejaVu Sans Mono"))
        #grid(
          columns: (auto, 1fr, auto),
          gutter: 8pt,
          align: (left, left, right),
          box(stroke: 0.6pt + amber-warn, inset: (x: 4pt, y: 2pt), radius: 2pt)[
            #text(fill: amber-warn, weight: "bold")[MODEL STATUS: #evidence-status]
          ],
          text(fill: text-muted)[
            Recorded BIDMC v1.0.0 numerics remain distinct from illustrative scenario models (MODEL_EVIDENCE_AUDIT.md). Not clinically certified.
          ],
          text(fill: cyan-nom)[MIT OR Apache-2.0 | MiServeRDC/nasa-space-apps-2026],
        )
      ]
    ]
  },
)

#set text(fill: text-main, size: 10.5pt, font: ("Helvetica Neue", "Inter", "Arial"))

#let ares-card(title, badge-text, badge-color, body) = block(
  width: 100%,
  fill: panel-dark,
  stroke: 0.8pt + border-line,
  radius: 4pt,
  inset: 9pt,
)[
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    text(size: 10pt, weight: "bold", fill: cyan-nom)[#title],
    box(stroke: 0.6pt + badge-color, inset: (x: 4pt, y: 1.5pt), radius: 2pt)[
      #text(size: 7pt, fill: badge-color, font: ("SF Mono", "Menlo", "DejaVu Sans Mono"))[#badge-text]
    ],
  )
  #v(4pt)
  #body
]

#let ares-slide(pillar, title, subtitle, content, break-after: true) = {
  block(width: 100%)[
    #text(size: 8pt, fill: amber-warn, weight: "bold", font: ("SF Mono", "Menlo", "DejaVu Sans Mono"))[#pillar]
    #v(2pt)
    #text(size: 17pt, weight: "bold", fill: text-main)[#title]
    #v(2pt)
    #text(size: 9.5pt, fill: text-muted)[#subtitle]
    #v(6pt)
    #content
  ]
  if break-after { pagebreak() }
}

// Seguono esattamente 7 invocazioni di #ares-slide(...) (l'ultima con break-after: false)
// garantendo strutturalmente counter(page).final().first() == 7.
```

Comando deterministico di compilazione e asserzione automatica del conteggio pagine:
```bash
SOURCE_DATE_EPOCH=1794670800 /opt/homebrew/bin/typst compile \
  --root . \
  --creation-timestamp 1794670800 \
  --input evidence_status=ILLUSTRATIVE_UNVALIDATED \
  docs/submission/NASA_2026_7_SLIDE_DECK.typ \
  docs/submission/NASA_2026_7_SLIDE_DECK.pdf

/opt/homebrew/bin/typst query \
  --root . \
  --input evidence_status=ILLUSTRATIVE_UNVALIDATED \
  docs/submission/NASA_2026_7_SLIDE_DECK.typ "<deck-meta>" \
  --field value | python3 -c "import json,sys; d=json.load(sys.stdin); assert len(d)==7 and all(x['total_pages']==7 for x in d), d"
```

---

### 3.2 Deliverable B: 30-Second Pitch Video Storyboard & English Subtitles (`docs/submission/PITCH_30S_STORYBOARD.md` + `PITCH_30S_SUBTITLES_EN.srt`)

#### 3.2.1 Vincoli Temporali & Regia Frame-by-Frame (`60 fps`, Durata Totale `29.800 s <= 30.000 s`)
Per prevenire qualsiasi penalizzazione o squalifica da arrotondamento dei player web (`YouTube` / `Vimeo` arrotondano `30.05 s` a `0:31`, [09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md#L80)), l'ultimo fotogramma audio/sottotitolo chiude tassativamente a `00:00:29,800` (`1,788` frame a `60 fps`, con `200 ms` di tail nero prima del cut hard a `00:00:30,000`).

| Finestra (`s`) | Frame (`@60fps`) | Scena & Cattura Live `ARES-MedOS` (`1920x1080`, OLED `#000000`) | Azione UI / Overlay Compositing | Audio Voiceover & Sottotitolo Inglese |
| :---: | :---: | :--- | :--- | :--- |
| **`00.0–05.0`** | `0000–0300` | Zoom macro su [OsSystemStatusBar.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/os-shell/OsSystemStatusBar.tsx#L194-L243) attiva in modalita nativa (`./scripts/launch_ares_medos.sh --desktop` / `--mode live`). | Evidenziazione ciano/ambra su `OWLT: 14m 12s (EIMO AUTONOMOUS) [V1 3006]`, `MEDOS SHELL: TAURI IPC (<0.05ms)` e badge `ILLUSTRATIVE_UNVALIDATED`. | *"En route to Mars, a 48-minute round-trip radio blackout makes cloud telemedicine impossible. Astronauts need autonomous medical software on board."* |
| **`05.0–15.0`** | `0300–0900` | Split-transition: vista `GATHER` ([App.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/App.tsx#L448-L505)) in replay reale `bidmc_01_Numerics.csv` (`RECORDED BIDMC`, `BEAT_INTERVALS_NOT_AVAILABLE`), poi switch istantaneo a `EVALUATE -> 3D Body Layers` (`BodyHeatmap`) e pressione `Alt+Space` che apre [OsCommandPalette.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/os-shell/OsCommandPalette.tsx#L514-L565). | Callout lower-third: `8-CRATE SAFE RUST | 128B SEQLOCK IPC (42 ns) | FASTMCP <150 TOKENS`. | *"ARES-Health runs 100% air-gapped in Safe Rust—replaying real BIDMC telemetry with strict null honesty while coupling multi-organ deconditioning in a 3D OLED cockpit."* |
| **`15.0–25.0`** | `0900–1500` | Trascinamento live degli slider di [WhatIfConsole.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/whatif-console/WhatIfConsole.tsx#L82-L95) (`OVERLAY: ON`, `Mission Day -> 180 d`, `ARED Exercise Load -> 35%`) + tab `FORECAST` (`StlChart` + `PredicateBars` con $\tau_w$ e `NQS-STL` $\hat{\rho}(t) < 0$). | Callout matematico: `tau_w = 2*mu*vmax*sqrt(pi/CSA) [dyn/cm2] | O(1) Lemire NQS-STL | Timestral [q05,q50,q95]`. | *"Sub-millisecond What-If stress tests run Frost-Hargens and jugular shear ODEs, O(1) Signal Temporal Logic, and non-crossing Timestral forecast cones across 24 agency sources."* |
| **`25.0–29.8`** | `1500–1788` | Tab `ACT` ([PlaybookRunner.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx#L37-L85)): `GATE 1 LOCKED` (`NO ANTICOAGULANT WITHOUT POCUS THROMBUS`) + banner rosso `LBNP AUTO-VENTED FOR YOUR SAFETY` a `0 mmHg` + end-card `GATHER -> EVALUATE -> ACT`. | Titolo finale con URL repository e licenza `MIT / Apache-2.0`. Cut netto a `00:00:30,000`. | *"Deterministic MedOps playbooks enforce POCUS anticoagulant locks and LBNP anti-syncope auto-venting. ARES-Health: Gather, Evaluate, Act."* |

#### 3.2.2 File SubRip Validato (`docs/submission/PITCH_30S_SUBTITLES_EN.srt`)

```srt
1
00:00:00,150 --> 00:00:02,650
En route to Mars, a 48-minute round-trip
radio delay blocks cloud telemedicine.

2
00:00:02,750 --> 00:00:04,950
Astronauts need autonomous, air-gapped
decision support directly on board.

3
00:00:05,050 --> 00:00:09,800
ARES-Health runs 100% offline in Safe Rust,
replaying recorded BIDMC telemetry at 1 Hz

4
00:00:09,900 --> 00:00:14,900
with strict null honesty and a 3D OLED
cockpit backed by FastMCP (<150 tokens).

5
00:00:15,000 --> 00:00:20,100
Sub-millisecond What-If sliders evaluate
coupled muscle-bone-jugular scenario ODEs,

6
00:00:20,200 --> 00:00:24,950
O(1) Signal Temporal Logic margins, and
non-crossing Timestral forecast cones.

7
00:00:25,050 --> 00:00:27,850
Type-1 MedOps playbooks enforce POCUS clot
locks and LBNP anti-syncope auto-venting.

8
00:00:27,950 --> 00:00:29,800
ARES-Health: Gather, Evaluate, Act.
Open-source edge autonomy for deep space.
```

---

### 3.3 Deliverable C: 180-Second Deep Technical Walkthrough Demo Script (`docs/submission/WALKTHROUGH_180S_DEMO_SCRIPT.md` + `WALKTHROUGH_180S_SUBTITLES_EN.srt`)

#### 3.3.1 Coreografia Riproducibile Terminale + Cockpit in 5 Atti (`00:00` – `02:59,400`)

Lo script di walkthrough e progettato in modo che qualunque giudice tecnico NASA possa replicare identicamente ogni schermata sul proprio terminale locale:

| Atto & Timecode | Comandi Terminale & Interazioni Esatte nel Cockpit `ARES-MedOS` | Invarianti Tecnici & Clinici Mostrati a Schermo |
| :--- | :--- | :--- |
| **Atto I (`00:00–00:38`)**<br>*Avvio `ARES-MedOS` & Replay `BIDMC` con Null Honesty (`GATHER`)* | 1. Terminale split-top: esecuzione di `./scripts/launch_ares_medos.sh --desktop` (o `cargo run -p ares-server-cli -- --mode live` / `--mode ws-and-mcp` con `--data-dir data/bidmc`).<br>2. Nel Cockpit ([App.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/App.tsx#L448-L505)), apertura di `INSPECT PROVENANCE` in [ProvenanceInspector.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/provenance/ProvenanceInspector.tsx#L137-L240). | - Checksum `MANIFEST_SHA256_VERIFIED` su `bidmc_01_Numerics.csv` (`481` righe `0..480 s`, `1.0 Hz native @ 20 Hz UI`).<br>- Contatore `128B BIN #...` in `OsSystemStatusBar` (`CRC-32C`).<br>- I `13` campioni mancanti di `PULSE`/`SpO2` compaiono come `MISSING` (mai `0.0`); `HRV (RMSSD)` mostra `UNAVAILABLE (BEAT_INTERVALS_NOT_AVAILABLE)` e lo stato d'allarme resta `DATA_DEGRADED_MISSING_CHANNELS`. |
| **Atto II (`00:38–01:15`)**<br>*Perturbazione What-If `< 1 ms`, ODE Accoppiate & Coni `Timestral` (`EVALUATE`)* | 1. In [WhatIfConsole.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/whatif-console/WhatIfConsole.tsx#L40-L95), click su `OVERLAY: ON`, spostamento `Mission Day` a `180 d`, `ARED Exercise Load` a `30%`, `Cabin CO2` a `4.8 mmHg`.<br>2. Passaggio in `EVALUATE` attraverso le 4 sub-tab: `BODY_3D` $\to$ `MUSCLE_BONE` $\to$ `POCUS` $\to$ `FORECAST`. | - La striscia `RECORDED 1 HZ HISTORY (IMMUTABLE UNDER WHAT-IF SLIDERS)` dimostra l'invarianza del cursore `1 Hz` sotto `POST /api/stress-test` (`p99.9 = 5.58 us`).<br>- Visualizzazione cascata illustrativa: riduzione carico `ARED` $\to$ aumento `SOST` (`pmol/L`) $\to$ calo `MQI` e rialzo `GAI` (`0.38g`) $\to$ dilatazione `IJV_CSA` e crollo di $\tau_w < 1.20\text{ dyn/cm}^2$ + aumento `ONSD`.<br>- In `FORECAST`: cuneo $O(1)$ `LemireMinWedge`, coni monotoni `[q05, q50, q95]`, `HEURISTIC_GATE_ACCEPTED` e intervallo `ILLUSTRATIVE_SCENARIO_RANGE`. |
| **Atto III (`01:15–01:55`)**<br>*Playbook MedOps `#04`/`#05` & I 3 Hard Clinical Safety Gates (`ACT`)* | 1. Switch alla tab `ACT` ([PlaybookRunner.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx#L27-L85)): selezione `PB #04` (*SANS / ONSD*) e `PB #05` (*Jugular Venous Stasis / Thrombosis*).<br>2. Avanzamento allo Step 4 con `POCUS thrombus: ABSENT` $\to$ pulsante bloccato; switch a `CONFIRMED` $\to$ sblocco.<br>3. Impostazione `LBNP Leg Pressure` a `-30 mmHg` fino al trigger pressorio/cardiaco $\to$ auto-vent a `0 mmHg`. | - **Safety Gate 1:** `LOCKED: NO ANTICOAGULANT WITHOUT POCUS THROMBUS` (`GATE 1 LOCKED`), prevenendo emorragia intracranica da impatto in EVA.<br>- **Safety Gate 2:** `LBNP AUTO-VENTED FOR YOUR SAFETY` (`Chamber vented from -30 mmHg to 0 mmHg` per $\Delta\text{SBP} > 15\text{ mmHg}$ o $\text{HR} > 115\text{ bpm}$).<br>- **Safety Gate 3:** con $\text{GAI}_{0.38g} > 12\%$, attivazione `eva_suit_damping_active: true` (`+25%` smorzamento esocheletrico caviglia a `0.38g`). |
| **Atto IV (`01:55–02:32`)**<br>*Palette `Alt+Space` `FastMCP` (`< 150 Token`) & Edge AI / Voice Copilot* | 1. Pressione scorciatoia `Alt+Space` per aprire [OsCommandPalette.tsx](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ares-cockpit/src/modules/os-shell/OsCommandPalette.tsx#L295-L752).<br>2. Esecuzione sequenziale di `[1] query_dataset_graph` (`OSD-51`), `[2] explain_biomarker_path` (`OSD-818` $\to$ `bm_hr`), `[3] get_timestral_quantile_cones` e `[8] get_medops_playbook`.<br>3. Interrogazione vocale/testuale del Copilot Edge locale (`Blocco L`). | - Ogni risposta JSON mostra `<= 600 B (~<150 tokens)`, latenza in microsecondi (`TAURI_NATIVE_IPC` / `HTTP_FASTMCP`), grounding `NASA-STD-3001` e tag `<untrusted_telemetry_observation>` contro *Indirect Prompt Injection*.<br>- L'LLM quantizzato locale e il sintetizzatore vocale offline traducono in linguaggio naturale l'output deterministico senza mai alterare numeri, soglie o Safety Gates. |
| **Atto V (`02:32–02:59.4`)**<br>*Trasparenza Epistemica `MODEL_EVIDENCE_AUDIT.md` & Certificazione CI* | 1. Focus sul badge `ILLUSTRATIVE_UNVALIDATED` nella barra `ARES-MedOS` e apertura split di [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md) + esecuzione rapida di `./scripts/build_submission_docs.sh --verify`. | - Distinzione netta tra misure terrestri registrate (`BIDMC`), contesto biologico multi-agenzia (`24` fonti) e modelli di scenario non validati clinicamente.<br>- Riepilogo metriche di verifica: `8` crate Rust, `126+` test, `0` panic, `7/7` slide compilate e pacchetto open-source `MIT OR Apache-2.0`. |

#### 3.3.2 Struttura Temporale SubRip (`docs/submission/WALKTHROUGH_180S_SUBTITLES_EN.srt`)
Il file `.srt` del walkthrough e suddiviso in `36` blocchi sequenziali da `~4.5–5.0 s` ciascuno (`<= 2` righe per cue, `<= 44` caratteri/riga, velocita di lettura media `16.8 CPS`), con primo cue `00:00:00,200 --> 00:00:04,800` e ultimo cue `36` fissato a `00:02:55,100 --> 00:02:59,400` (strettamente `< 00:03:00,000`).

---

### 3.4 Deliverable D: NASA Portal Submission Bundle, AI/Fresh-Code Disclosure & Multi-Agency Traceability (`docs/submission/NASA_SUBMISSION_PORTAL_READY.md`)

Questo documento sostituisce le formulazioni pre-audit di [11_Official_Submission_Guide_and_Ready_To_Paste_Form.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/11_Official_Submission_Guide_and_Ready_To_Paste_Form.md) con blocchi inglesi pronti per il copia-incolla nel portale ufficiale `spaceappschallenge.org` (zero link `file://` locali nei blocchi da incollare, zero emoji, conformita rigorosa a [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md)):

1. **Field 1 — Project Title & Metadata:**
   `ARES-Health: Autonomous Resilient Edge-native System for Astronaut Health` — Track: *Create Health Monitoring Software for Astronauts on Space Missions*.
2. **Field 2 — High-Level Summary (`<= 100` words strict version + `<= 150` words extended version):**
   Espone il vincolo fisico dei `8–48 min` di ritardo radio verso Marte, l'architettura `100%` offline in Safe Rust (`8` crate, `ARES-MedOS` `128 B` Seqlock IPC + cockpit 3D OLED `#000000`), il ciclo `Gather -> Evaluate -> Act` su replay reale `PhysioNet BIDMC v1.0.0` con preservazione rigorosa dei `null` (`BEAT_INTERVALS_NOT_AVAILABLE`), i modelli accoppiati di scenario muscolo-osso-giugulare-SANS (`NQS-STL` $O(1)$ + `Timestral` coni monotoni) e i `3 Hard Clinical Safety Gates`, dichiarando esplicitamente che i modelli di scenario sono `ILLUSTRATIVE_UNVALIDATED` e non sostituiscono la validazione clinica o il medico di volo.
3. **Field 3 — Detailed Project Description (`Gather -> Evaluate -> Act` + Verification Metrics + Evidence Boundary):**
   - Riporta le metriche reali verificate dal codice: `8` crate Rust 2024, `126+` test automatici (`Blocco K` + `Blocco L`), `0` `.unwrap()`/`.expect()` in produzione, pipeline 1-tick `--release` `p50 = 2.12 us / p99.9 = 5.58 us`, `SeqlockTelemetryRing` `p50 = 42.0 ns`, compattatore di Welford a `900 Sol` in `167,352 B` (`< 200 KB`), grafo `ARES-DatasetGraph` (`24` dataset catalogati, `110` nodi, `326` archi Biolink).
   - Sostituisce le vecchie diciture pre-Issue `#12`: usa *"numeric HR-difference entropy quality heuristic"* (non DFT), *"illustrative scenario range"* (non 95% CI), *"heuristic gate accepted (`HEURISTIC_GATE_ACCEPTED`)"* (non calibrated conformal coverage) e mantiene separati i dati `BIDMC` registrati dai modelli illustrativi.
4. **Field 4 — Complete AI Transparency & Runtime MCP Disclosure (2 Livelli):**
   - **4.A Runtime On-Board AI Architecture:** L'assistente vocale/testuale locale (modello quantizzato air-gapped via `FastMCP` `stdio` / HTTP loopback) riceve payload strutturati `<= 600 byte` (`< 150 token`) sanitizzati con tag `<untrusted_telemetry_observation>`. Nessun calcolo numerico ODE, margine `NQS-STL`, cono `Timestral` o Safety Gate viene mai delegato all'LLM; in assenza del runtime LLM locale il sistema degrada senza interruzioni a template deterministici compilati in Rust.
   - **4.B Software Engineering & Pre-Hackathon AI Assistance Disclosure:** Dichiarazione trasparente degli assistenti AI utilizzati dal team umano (Google Antigravity, Anthropic Claude Code, OpenAI Codex, GitHub Copilot, Cursor) per sintesi bibliografica, verifica dimensionale CGS, *property-based red-teaming* (`proptest`), scaffolding di test e redazione documentale, sotto verifica ingegneristica e controllo umano integrale del team.
5. **Field 5 — Fresh-Code & OSI Open-Source License Audit:**
   - Rilascio duale sotto licenze approvate OSI **`MIT OR Apache-2.0`**.
   - Tabella completa di audit delle dipendenze open-source pubbliche: crate Rust (`tokio`, `axum`, `petgraph`, `serde`, `clap`, `chacha20poly1305`, `sha2`, `zeroize`, `tauri`, `proptest` — tutte `MIT` / `Apache-2.0`), pacchetti frontend (`react`, `three`, `@react-three/fiber`, `tailwindcss`, `vite` — `MIT`), toolchain documentale (`typst` `Apache-2.0`) e licenze dataset (`PhysioNet BIDMC v1.0.0` `ODC-By-1.0`, `PPG-DaLiA` `CC BY 4.0`, `NASA OSDR / NLSP / HRP / STD-3001` US Federal Public Domain / Open Data).
6. **Field 6 — Master 24-Dataset Multi-Agency Traceability Matrix (con Colonna `Evidence Scope`):**
   Integra tutte le `24` fonti di [11_Official_Submission_Guide_and_Ready_To_Paste_Form.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/11_Official_Submission_Guide_and_Ready_To_Paste_Form.md#L42-L70) (`NASA HRP ARCHeR / Venous Haemostasis / Zero T2 / CIPHER`, `OSDR OSD-51 / OSD-195 / OSD-570 / OSD-571 / OSD-818`, `PhysioNet BIDMC v1.0.0 / CEBS / Fantasia`, `UCI PPG-DaLiA`, `NLSP NASA-0000100: BRSMFSR / BRSMPT / SMCCP`, `LSAH`, `NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F`, `NASA OCHMO MTB-007`, `CSA CANS / Bio-Monitor / Vascular / MARROW`, `ESA Myotones / BRACE`, `DLR :envihab AGBRESA / SANS-CM`, `CHAPEA`, `HERA`, `TRISH EXPAND`, `NASA-JAXA Bisphosphonates`), aggiungendo per ciascuna la colonna tassativa **`Evidence Role per MODEL_EVIDENCE_AUDIT.md`** (`RECORDED_REPLAY_INPUT`, `BIOLOGICAL_CONTEXT_ONLY`, `NORMATIVE_REQUIREMENT_CONTEXT`, `CATALOG_GRAPH_METADATA`) cosi da non confondere mai un riferimento bibliografico/omico con un dataset di calibrazione clinica prospettica.

---

### 3.5 Deliverable E: Sincronizzazione Documentale, Rigenerazione `PANORAMICA_GENERALE_PROGETTO.pdf` & CI Gate (`scripts/build_submission_docs.sh`)

#### 3.5.1 Allineamento di [PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md) e `docs/submission/PANORAMICA_GENERALE_PROGETTO.typ`
Per eliminare la divergenza segnalata in [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md#L74):
1. [PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md) viene aggiornato nelle Sezioni `2`, `4`, `5` e `8` per riflettere:
   - tutti i **12 Blocchi Architetturali (`Blocco 0` – `Blocco L`, `Fasi 01–34`)**;
   - gli **`8` crate Safe Rust 2024** (`ares-core-types`, `ares-telemetry-ingest`, `ares-causal-graph`, `ares-nqs-stl`, `ares-medops-playbooks`, `ares-security-privacy`, `ares-server-cli`, `ares-desktop-os`) al posto della vecchia descrizione pre-workspace (`src/telemetry.rs`, `src/graph.rs`, ecc.);
   - la shell `ARES-MedOS` (`BinaryTelemetryFrame` `128 B`, `SeqlockTelemetryRing`, `OsSystemStatusBar`, `OsCommandPalette`), il co-processore `Timestral` (`Blocco H`), `ARES-HyperGraph` + `ARES-DatasetGraph` (`Blocco I`), la suite di certificazione `Blocco K` (`126/126` test + benchmark `--release`) e il `Blocco L` (Edge AI/Voice Copilot, protocollo di calibrazione Fase 33 e pacchetto di sottomissione Fase 34);
   - le qualificazioni obbligatorie di `Issue #11` (`BEAT_INTERVALS_NOT_AVAILABLE`) e `Issue #12` (`ILLUSTRATIVE_UNVALIDATED`, `ILLUSTRATIVE_SCENARIO_RANGE`).
2. `docs/submission/PANORAMICA_GENERALE_PROGETTO.typ` formatta in modo nativo Typst `A4` l'intero blueprint aggiornato (con riquadro di avviso `Issue #12` in prima pagina, equazioni tipografate in Math Mode, tabelle degli 8 crate, delle 24 fonti e dei benchmark Block K/L) e compila deterministicamente sopra [PANORAMICA_GENERALE_PROGETTO.pdf](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.pdf), garantendo che nessun PDF pre-audit rimanga obsoleto nel repository (e archiviando o rigenerando eventuali esportazioni PDF storiche secondarie presenti in root).

#### 3.5.2 Architettura Completa di `scripts/build_submission_docs.sh` (I 6 Gate Deterministici `L6-01`..`L6-06`)

```bash
#!/usr/bin/env bash
# ==============================================================================
# scripts/build_submission_docs.sh
# Phase 34 (L6): Deterministic Typst Compiler & 6-Gate Submission CI Verifier
# Zero network calls. Zero emojis. Compatible with macOS & Linux CI.
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1794670800}"
TYPST_BIN="${TYPST_BIN:-/opt/homebrew/bin/typst}"
if [ ! -x "$TYPST_BIN" ]; then
    TYPST_BIN="$(command -v typst || true)"
fi
if [ -z "$TYPST_BIN" ] || [ ! -x "$TYPST_BIN" ]; then
    echo "[FAILED] Gate L6-01: typst binary not found at /opt/homebrew/bin/typst or PATH." >&2
    exit 1
fi

# Determina lo stato di validazione clinica dal manifesto opzionale di Fase 33 (L5)
EVIDENCE_STATUS="ILLUSTRATIVE_UNVALIDATED"
if [ -f "data/calibration/phase_33_validation_manifest.json" ]; then
    EVIDENCE_STATUS="$(python3 -c '
import json
m = json.load(open("data/calibration/phase_33_validation_manifest.json", encoding="utf-8"))
print("QUALIFIED_CALIBRATED" if m.get("all_gates_passed") is True and m.get("status") == "QUALIFIED_CALIBRATED" else "ILLUSTRATIVE_UNVALIDATED")
')"
fi

echo "[L6-01] Compiling Typst 7-Slide Deck & PANORAMICA_GENERALE_PROGETTO.pdf (status=${EVIDENCE_STATUS})..."
"$TYPST_BIN" compile \
    --root "$ROOT_DIR" \
    --creation-timestamp "$SOURCE_DATE_EPOCH" \
    --input "evidence_status=${EVIDENCE_STATUS}" \
    docs/submission/NASA_2026_7_SLIDE_DECK.typ \
    docs/submission/NASA_2026_7_SLIDE_DECK.pdf

"$TYPST_BIN" compile \
    --root "$ROOT_DIR" \
    --creation-timestamp "$SOURCE_DATE_EPOCH" \
    --input "evidence_status=${EVIDENCE_STATUS}" \
    docs/submission/PANORAMICA_GENERALE_PROGETTO.typ \
    PANORAMICA_GENERALE_PROGETTO.pdf

DECK_QUERY_JSON="$("$TYPST_BIN" query \
    --root "$ROOT_DIR" \
    --input "evidence_status=${EVIDENCE_STATUS}" \
    docs/submission/NASA_2026_7_SLIDE_DECK.typ "<deck-meta>" \
    --field value)"

echo "[L6-02..L6-06] Running Python 3 stdlib verification suite (PDF pages, SRT bounds, Zero-Emoji, Evidence Audit, Links)..."
python3 - "$ROOT_DIR" "$EVIDENCE_STATUS" "$DECK_QUERY_JSON" <<'PY'
import json
import pathlib
import re
import sys
import urllib.parse
import zlib

root = pathlib.Path(sys.argv[1]).resolve()
evidence_status = sys.argv[2]
deck_query = json.loads(sys.argv[3])

# ------------------------------------------------------------------------------
# Gate L6-02: Exact 7-Page Assertion on NASA_2026_7_SLIDE_DECK.pdf (Dual Oracle)
# ------------------------------------------------------------------------------
assert len(deck_query) == 7 and all(item.get("total_pages") == 7 for item in deck_query), (
    f"Gate L6-02 FAILED (Typst metadata oracle): expected 7 pages, got {deck_query}"
)

def count_pdf_pages_stdlib(pdf_path: pathlib.Path) -> int:
    raw = pdf_path.read_bytes()
    assert raw.startswith(b"%PDF-1.") or raw.startswith(b"%PDF-2."), f"Invalid PDF header in {pdf_path}"
    corpus = [raw]
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, flags=re.DOTALL):
        chunk = m.group(1)
        try:
            corpus.append(zlib.decompress(chunk))
        except zlib.error:
            pass
    joined = b"\n".join(corpus)
    leaf_pages = len(re.findall(rb"/Type\s*/Page\b(?!s)", joined))
    counts = [int(val) for pair in re.findall(rb"/Type\s*/Pages\b[^>]*?/Count\s+(\d+)|/Count\s+(\d+)\s+[^>]*?/Type\s*/Pages\b", joined) for val in pair if val]
    root_count = max(counts) if counts else leaf_pages
    assert leaf_pages == root_count, f"PDF page tree mismatch in {pdf_path}: leaf={leaf_pages}, count={root_count}"
    return leaf_pages

deck_pages = count_pdf_pages_stdlib(root / "docs/submission/NASA_2026_7_SLIDE_DECK.pdf")
assert deck_pages == 7, f"Gate L6-02 FAILED (Binary PDF oracle): expected 7 pages, got {deck_pages}"
panoramica_pages = count_pdf_pages_stdlib(root / "PANORAMICA_GENERALE_PROGETTO.pdf")
assert panoramica_pages >= 4, f"Gate L6-02 FAILED: PANORAMICA_GENERALE_PROGETTO.pdf too short ({panoramica_pages} pages)"
print(f"[PASSED] Gate L6-02: NASA_2026_7_SLIDE_DECK.pdf == {deck_pages} pages; PANORAMICA_GENERALE_PROGETTO.pdf == {panoramica_pages} pages.")

# ------------------------------------------------------------------------------
# Gate L6-03: SubRip (.srt) Timecode Syntax, Strict Monotonicity & Upper Bounds
# ------------------------------------------------------------------------------
TC_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$")

def to_ms(h: str, m: str, s: str, ms: str) -> int:
    h_i, m_i, s_i, ms_i = int(h), int(m), int(s), int(ms)
    assert m_i < 60 and s_i < 60 and ms_i < 1000, f"Malformed timecode component: {h}:{m}:{s},{ms}"
    return ((h_i * 3600) + (m_i * 60) + s_i) * 1000 + ms_i

def verify_srt(path: pathlib.Path, max_ms: int) -> int:
    text = path.read_text(encoding="utf-8")
    assert not text.startswith("\ufeff"), f"{path}: UTF-8 BOM forbidden in .srt"
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    assert len(blocks) >= 5, f"{path}: expected >= 5 subtitle cues, got {len(blocks)}"
    prev_end = 0
    for expected_idx, block in enumerate(blocks, start=1):
        lines = block.splitlines()
        assert len(lines) >= 2, f"{path} cue #{expected_idx}: missing text lines"
        assert lines[0].strip() == str(expected_idx), f"{path}: expected index {expected_idx}, got {lines[0]!r}"
        m = TC_RE.match(lines[1].strip())
        assert m is not None, f"{path} cue #{expected_idx}: invalid SRT timecode {lines[1]!r}"
        t_start = to_ms(*m.groups()[:4])
        t_end = to_ms(*m.groups()[4:])
        assert prev_end <= t_start < t_end <= max_ms, (
            f"{path} cue #{expected_idx}: timecode violation prev_end={prev_end} start={t_start} end={t_end} max={max_ms}"
        )
        caption_lines = lines[2:]
        assert 1 <= len(caption_lines) <= 2, f"{path} cue #{expected_idx}: max 2 lines per subtitle"
        assert all(0 < len(ln.strip()) <= 48 for ln in caption_lines), f"{path} cue #{expected_idx}: line length out of bounds"
        prev_end = t_end
    return prev_end

end_30s = verify_srt(root / "docs/submission/PITCH_30S_SUBTITLES_EN.srt", 30_000)
end_180s = verify_srt(root / "docs/submission/WALKTHROUGH_180S_SUBTITLES_EN.srt", 180_000)
print(f"[PASSED] Gate L6-03: SRT bounds verified (30s end={end_30s} ms <= 30000 ms; 180s end={end_180s} ms <= 180000 ms).")

# ------------------------------------------------------------------------------
# Gate L6-04: Strict Zero-Emoji Invariant Scan
# ------------------------------------------------------------------------------
EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "]"
)

submission_text_files = sorted((root / "docs/submission").glob("*.*")) + [
    root / "PANORAMICA_GENERALE_PROGETTO.md",
    root / "scripts/build_submission_docs.sh",
]
for fpath in submission_text_files:
    if fpath.suffix.lower() == ".pdf":
        continue
    content = fpath.read_text(encoding="utf-8")
    hit = EMOJI_RE.search(content)
    assert hit is None, f"Gate L6-04 FAILED: prohibited emoji U+{ord(hit.group(0)):04X} in {fpath}"
print(f"[PASSED] Gate L6-04: Zero emojis across {len(submission_text_files)} submission files.")

# ------------------------------------------------------------------------------
# Gate L6-05: MODEL_EVIDENCE_AUDIT.md / Issue #12 Consistency Gate
# ------------------------------------------------------------------------------
FORBIDDEN_UNQUALIFIED_RE = re.compile(
    r"(?<!not\s)(?<!never\s)(?<!non\s)\b("
    r"clinically\s+certified|fda-cleared|flight-certified|certified\s+for\s+flight|"
    r"95%\s*ci\s+calibrated|calibrated\s+95%\s+confidence|guaranteed\s+worst-case|"
    r"certificato\s+clinicamente"
    r")\b",
    flags=re.IGNORECASE,
)

if evidence_status == "ILLUSTRATIVE_UNVALIDATED":
    for must_have_token_file in [
        root / "docs/submission/NASA_2026_7_SLIDE_DECK.typ",
        root / "docs/submission/NASA_SUBMISSION_PORTAL_READY.md",
        root / "docs/submission/PANORAMICA_GENERALE_PROGETTO.typ",
    ]:
        txt = must_have_token_file.read_text(encoding="utf-8")
        assert "ILLUSTRATIVE_UNVALIDATED" in txt, f"Gate L6-05 FAILED: missing ILLUSTRATIVE_UNVALIDATED in {must_have_token_file}"
        assert "BEAT_INTERVALS_NOT_AVAILABLE" in txt, f"Gate L6-05 FAILED: missing BEAT_INTERVALS_NOT_AVAILABLE in {must_have_token_file}"
        bad = FORBIDDEN_UNQUALIFIED_RE.search(txt)
        assert bad is None, f"Gate L6-05 FAILED: prohibited unvalidated claim {bad.group(0)!r} in {must_have_token_file}"
print(f"[PASSED] Gate L6-05: Evidence-audit honesty contract verified (mode={evidence_status}).")

# ------------------------------------------------------------------------------
# Gate L6-06: Internal file:// & Relative Link Integrity Verification
# ------------------------------------------------------------------------------
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)\s]+)\)")
md_targets = sorted((root / "docs/submission").glob("*.md")) + [
    root / "PANORAMICA_GENERALE_PROGETTO.md",
    root / "README.md",
]
checked_links = 0
for md_file in md_targets:
    md_text = md_file.read_text(encoding="utf-8")
    if md_file.name == "NASA_SUBMISSION_PORTAL_READY.md":
        assert "file://" not in md_text, "Portal copy-paste file must not contain local file:// URIs"
    for raw_target in LINK_RE.findall(md_text):
        if raw_target.startswith(("http://", "https://", "mailto:", "conversation://", "#")):
            continue
        clean = raw_target.split("#", 1)[0]
        if clean.startswith("file://"):
            parsed_path = pathlib.Path(urllib.parse.unquote(urllib.parse.urlparse(clean).path))
        else:
            parsed_path = (md_file.parent / clean).resolve()
        assert parsed_path.exists(), f"Gate L6-06 FAILED: broken link {raw_target!r} in {md_file} -> {parsed_path}"
        checked_links += 1
print(f"[PASSED] Gate L6-06: {checked_links} internal Markdown / file:// links verified on disk.")
PY
```

---

## 4. Deliverable F: Nuovi Riferimenti Open-Source, Tipografici e Normativi per la Sezione 11 di [scientific_references.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/scientific_references.md)

La seguente sezione e progettata per essere aggiunta in coda a [scientific_references.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/scientific_references.md#L267-L298) come **Sezione 11**:

| Repository / Standard / Portale | Citazione Bibliografica, URL Ufficiale & Licenza | Ruolo Architetturale nella Fase 34 (`L6`) |
| :--- | :--- | :--- |
| **`typst/typst` (`v0.15.1`)** | Laurenz Madje, Martin Haug, *"Typst: A Programmable Markup-Based Typesetting System for the Sciences"* (TU Berlin, 2022) — `https://github.com/typst/typst` (`Apache-2.0`); Reproducible Builds `SOURCE_DATE_EPOCH` Spec (`https://reproducible-builds.org/specs/source-date-epoch/`). | Compilazione deterministica bit-riproducibile (`--creation-timestamp`) offline di `NASA_2026_7_SLIDE_DECK.pdf` e `PANORAMICA_GENERALE_PROGETTO.pdf` + introspezione strutturale via `typst query`. |
| **`touying-typ/touying` & `polylux-typ/polylux`** | `https://github.com/touying-typ/touying` (`MIT`) & `https://github.com/polylux-typ/polylux` (`MIT`). | Pattern architetturali dichiarativi per slide deck tecnici widescreen `16:9` in Typst, adattati in modalita *zero-network self-contained* per rispettare l'invariante air-gapped. |
| **SubRip (`.srt`) & W3C `WCAG 2.2` (`SC 1.2.2`)** | Matroska SubRip `S_TEXT/UTF8` Technical Specification (`https://www.matroska.org/technical/subtitles.html`); W3C *Web Content Accessibility Guidelines (WCAG) 2.2*, Success Criterion `1.2.2` (*Captions Prerecorded*, `https://www.w3.org/TR/WCAG22/`); BBC Subtitle Guidelines ($\le 20\text{ CPS}$, $\le 2$ righe). | Specifiche formali per la validazione automatica dei timecode (`<= 00:00:30,000` e `<= 00:03:00,000`), della monotonicita temporale e della leggibilita dei sottotitoli inglesi obbligatori. |
| **ISO 32000-2:2020 (PDF 2.0) & Open PDF Verifiers (`qpdf`, `poppler`, `pypdf`)** | ISO 32000-2:2020 (*Document management — Portable document format — Part 2: PDF 2.0*, `/Pages` `/Count` & `/Type /Page` tree); `https://github.com/qpdf/qpdf` (`Apache-2.0`); `https://poppler.freedesktop.org/` (`pdfinfo`, `GPL-2.0`); `https://github.com/py-pdf/pypdf` (`BSD-3-Clause`). | Fondamento del doppio oracolo di conteggio pagine (`count_pdf_pages_stdlib` con decompressione `FlateDecode` `zlib` + cross-check opzionale `qpdf`/`pdfinfo`/`pypdf`) per certificare `N_pages == 7`. |
| **NASA Space Apps Challenge 2026 Official Track & Submission Directives** | Challenge Portal: `https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/`; Official Resources: `https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources`; Project Submission Guide: `https://www.spaceappschallenge.org/resources/project-submission-guide/`; OSI Permissive Licenses (`https://opensource.org/licenses`, `MIT` & `Apache-2.0`). | Vincoli ufficiali di eleggibilita ai Global Awards: `<= 30s` video vs `<= 7` slide inglesi, Fresh Code Rule, AI Transparency Disclosure obbligatoria e tracciabilita dei dataset NASA, CSA ed ESA. |

---

## 5. Sequenza Operativa di Esecuzione (Step-by-Step per gli Agenti in Write Mode)

Quando questo piano verra approvato per l'esecuzione:
1. **Step 1 — Sincronizzazione Blueprint Master ([PANORAMICA_GENERALE_PROGETTO.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.md)):** Aggiornare l'architettura da monolitica agli `8` crate reali (`Blocchi A–L`), `ARES-MedOS`, `126+` test e vincoli `Issue #11`/`#12`, quindi redigere `docs/submission/PANORAMICA_GENERALE_PROGETTO.typ`.
2. **Step 2 — Creazione Deck `16:9` OLED (`docs/submission/NASA_2026_7_SLIDE_DECK.typ`):** Implementare le `7` slide inglesi con palette `#000000` / `#06B6D4` / `#F59E0B` / `#EF4444`, formule dimensionalmente esatte, metriche `Blocco K/L` e badge persistente `ILLUSTRATIVE_UNVALIDATED`.
3. **Step 3 — Creazione Script Video Duali & Sottotitoli `.srt` (`PITCH_30S_*` e `WALKTHROUGH_180S_*`):** Scrivere i due storyboard coreografati sui componenti reali di `ares-cockpit` e i due file `.srt` inglesi entro `30,000 ms` e `180,000 ms`.
4. **Step 4 — Creazione Bundle Portale NASA & Sezione 11 Bibliografica:** Scrivere `docs/submission/NASA_SUBMISSION_PORTAL_READY.md` (privo di `file://` e conforme a [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md)) e aggiungere la Sezione 11 a [scientific_references.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/scientific_references.md).
5. **Step 5 — Automazione CI (`scripts/build_submission_docs.sh`) & Aggancio a [agent_probe.sh](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/scripts/agent_probe.sh):** Compilare i due PDF deterministici, verificare tutti i `6` gate `L6-01`..`L6-06`, rimuovere/archiviare eventuali PDF pre-audit obsoleti ed eseguire `./scripts/agent_probe.sh --all` seguito dall'aggiornamento di [activeContext.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/memory-bank/activeContext.md) e [progress.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/memory-bank/progress.md).

---

## 6. Matrice di Verifica & Criteri di Accettazione (Fase 34 / `L6`)

| ID Gate | Comando di Esecuzione | Invariante Verificato | Soglia Tassativa di Passaggio |
| :--- | :--- | :--- | :--- |
| `L6-01` | `./scripts/build_submission_docs.sh` (Step Typst) | Compilazione offline deterministica (`SOURCE_DATE_EPOCH`) di `NASA_2026_7_SLIDE_DECK.typ` e `PANORAMICA_GENERALE_PROGETTO.typ` con `/opt/homebrew/bin/typst` (`0.15.1`) | Exit code `0`, entrambi i file `.pdf` validi (`%PDF-`) e `> 0 B` |
| `L6-02` | Doppio oracolo `typst query <deck-meta>` + `count_pdf_pages_stdlib` | Conteggio esatto delle pagine di `docs/submission/NASA_2026_7_SLIDE_DECK.pdf` (Format Option B NASA) | `N_pages == 7` esatti su entrambi gli oracoli (`0` overflow) |
| `L6-03` | Parser Python `verify_srt` in `scripts/build_submission_docs.sh` | Validita sintattica SubRip UTF-8, monotonicita $t_{\text{start}, i} < t_{\text{end}, i} \le t_{\text{start}, i+1}$, `<= 2` righe/cue e limiti superiori rigorosi | `PITCH_30S <= 00:00:30,000` (`30,000 ms`) e `WALKTHROUGH_180S <= 00:03:00,000` (`180,000 ms`) |
| `L6-04` | Scansione Unicode `EMOJI_RE` su `docs/submission/*`, `PANORAMICA_GENERALE_PROGETTO.md`, `scripts/build_submission_docs.sh` | Rispetto assoluto della *Formatting Invariant* #6 di [AGENTS.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/AGENTS.md#L33-L34) | `0` codepoint emoji rilevati |
| `L6-05` | Audit semantico `Issue #12` (`FORBIDDEN_UNQUALIFIED_RE` + token obbligatori) | Presenza di `ILLUSTRATIVE_UNVALIDATED` e `BEAT_INTERVALS_NOT_AVAILABLE`; assenza di claim non validati (*"clinically certified"*, *"95% CI calibrated"*) salvo manifesto qualificato di Fase 33 | `100%` conforme a [MODEL_EVIDENCE_AUDIT.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/docs/architecture/MODEL_EVIDENCE_AUDIT.md) |
| `L6-06` | Link-checker interno + `./scripts/agent_probe.sh --fast` | Zero link relativi o `file://` spezzati; zero `file://` nei blocchi portale; workspace Rust e Memory Bank integri | `0` link rotti e `agent_probe.sh` exit code `0` |
