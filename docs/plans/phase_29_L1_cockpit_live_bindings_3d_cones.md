# Piano Implementativo Definitivo — Fase 29 (L1): Cockpit Live Bindings, Multi-Horizon `Timestral` Quantile Cones & 3D `UBERON:` / Local `.glb` Quantitative Visualization (`ares-cockpit/`)

- **Blocco Architetturale**: Blocco L (*Authoritative Cockpit Live-Engine Wiring, Multi-Horizon Grey-Box Visual Analytics & Air-Gapped 3D Anatomical HSI*, Fase 29)
- **Fase**: Fase 29 (`L1`)
- **Stato**: `[x] COMPLETED (TESTED)` (`ares-cockpit` `npm run lint` + `vite build`, `15/15` Node tests across `7` suites)
- **Target Principali**: [`ares-cockpit/`](../../ares-cockpit/README.md) (`React 19` + `TypeScript 5.7` + `Tailwind CSS v4` + `Three.js 0.171` / `@react-three/fiber 9` / `@react-three/drei 10`), con contratti backend gia operativi in [`crates/ares-server-cli`](../../crates/ares-server-cli), [`crates/ares-medops-playbooks`](../../crates/ares-medops-playbooks), [`crates/ares-causal-graph`](../../crates/ares-causal-graph), [`crates/ares-nqs-stl`](../../crates/ares-nqs-stl), [`crates/ares-core-types`](../../crates/ares-core-types) e [`crates/ares-desktop-os`](../../crates/ares-desktop-os)
- **Piani & Audit di Riferimento**: [`phase_16_H2`](phase_16_H2_dhf_monotone_quantiles_conformal_gate.md), [`phase_17_H3`](phase_17_H3_async_1hz_forecaster_nqs_stl_bridge.md), [`phase_18_I1`](phase_18_I1_welford_longitudinal_compaction_spatial_deontic.md), [`phase_21_J1`](phase_21_J1_zero_copy_binary_ipc_shm_protocol.md), [`phase_22_J2`](phase_22_J2_ares_desktop_os_tauri_native_shell.md), [`phase_23_J3`](phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md), [`phase_28_K4`](phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md), [`MODEL_EVIDENCE_AUDIT.md`](../architecture/MODEL_EVIDENCE_AUDIT.md)
- **Owner Principale**: `ARES-Health Team` & `ARES-Health Team` (con verifica contratti `ARES-Health Team` e governance evidenze `@MiServeRDC`)
- **File Target Previsti**:
  1. `ares-cockpit/src/types/telemetry.ts` *(UPDATE — allineamento completo a `WireActivePlaybook`, `NqsQuantileForecastSnapshot`, `ChannelQuantileCone`, `AbstentionCertificate`, `HeatmapCell` `UBERON:`, `ModelValidationStatus` e `TtvIntervalKind`)*
  2. `ares-cockpit/src/lib/playbookCatalog.ts` *(NEW — catalogo deterministico offline/fallback allineato 1:1 ai 5 Playbook Type-1 `#01`–`#05` e ai 3 Hard Safety Gates di `crates/ares-medops-playbooks`)*
  3. `ares-cockpit/src/lib/telemetryValidation.ts` *(UPDATE — validazione runtime di monotonicita $q_{0.05} \le q_{0.50} \le q_{0.95}$, normalizzazione `actions: CountermeasureAction[]`, `hypergraph_spatial.cells`, `timestral_quantiles` e difesa in profondita Issue `#11` / Issue `#12`)*
  4. `ares-cockpit/src/lib/binaryTelemetryDecoder.ts` *(UPDATE — fusione deterministica `active_playbook_id` `0..5`, `FLAG_GATE1_ANTICOAG_LOCK`, `FLAG_GATE2_LBNP_VENT`, `FLAG_GATE3_EVA_DAMPING`, `FLAG_CONFORMAL_ABSTAINED` e tripletta `ttv_q05/q50/q95_days` anche quando `prev.active_playbook` e `null`)*
  5. `ares-cockpit/src/lib/scenario.ts` *(UPDATE — popolamento deterministico di `active_playbook` e `hypergraph_spatial` nel fallback `LOCAL_SIMULATION` quando il motore Rust e offline)*
  6. `ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx` *(UPDATE — binding diretto a `packet.active_playbook` per tutti i 5 Playbook `#01`–`#05`, visualizzazione live Gate 1/2/3, conferma interattiva trombo POCUS via `POST /api/stress-test` o Tauri `apply_what_if_patch`, touch target `>= 44x44 pt`)*
  7. `ares-cockpit/src/modules/mri-and-stl/MriAndStl.tsx` *(UPDATE — vista integrata Multi-Horizon `Timestral` Quantile Cone `+15m / +1h / +6h / +24h` + badge `ConformalAbstentionGate` + etichettatura esplicita `ILLUSTRATIVE_UNVALIDATED` / `ILLUSTRATIVE_SCENARIO_RANGE` / `BEAT_INTERVALS_NOT_AVAILABLE` + fallback locale)*
  8. `ares-cockpit/src/modules/body-3d-heatmap/uberonSpatialMapping.ts` *(NEW — proiezione affine $\Phi: [-1,+1]^3 \to \mathbb{R}^3_{\text{rig}}$, mapping colore/intensita `observed=false` per Issue `#11` e calcolo flusso sui 6 archi causali diretti di `AnatomicalRegionSubgraph`)*
  9. `ares-cockpit/src/modules/body-3d-heatmap/NasaGlbAssetLayer.tsx` *(NEW — loader locale air-gapped basato su `GLTFLoader` con verifica magic header binario `0x46546C67`, `GlbAssetErrorBoundary` e fallback procedurale a `0` errori di rete/CSP)*
  10. `ares-cockpit/src/modules/body-3d-heatmap/AnatomicalLayers.tsx` & `BodyHeatmap.tsx` *(UPDATE — pilotaggio quantitativo di mesh, nodi emissivi `UBERON:` e 6 archi `QuadraticBezierLine` da `packet.hypergraph_spatial.cells` + toggle opzionale mesh `.glb`)*
  11. `ares-cockpit/src/App.tsx` *(UPDATE — rimozione del banner passivo duplicato sotto `PlaybookRunner`, wiring unificato di Gate 1/2/3 nel pannello `ACT`, passaggio di `packet.timestral_quantiles` e `packet.hypergraph_spatial` ai moduli `EVALUATE`)*
  12. `ares-cockpit/public/models/manifest.json` & `ares-cockpit/public/models/README.md` *(NEW — manifesto SHA-256 e istruzioni di staging offline per asset `.glb` `nasa/NASA-3D-Resources` compatibili con CSP `default-src 'self'`)*
- **Budget Latenza, Rendering & HSI**:
  - **Feedback Discreto Conferma POCUS / Step MedOps (`POST /api/stress-test` / `apply_what_if_patch`)**: `< 1.0 ms` loopback HTTP, `< 0.20 ms` Tauri IPC (`> 100x` margine su `NASA-STD-3001 [V2 10022]` $\le 100\,\text{ms}$)
  - **Refresh Display Dinamico Coni `Timestral` & Heatmap 3D (`20 Hz`)**: budget frame `< 16.6 ms` (`60 FPS` WebGL su sfondo `#000000` OLED, ampiamente entro `NASA-STD-3001 [V2 10152]` $\le 50\,\text{ms}$)
  - **Dimensione Minima Controlli Tattili Critici (`MIL-STD-1472H` / `NASA-STD-3001 Vol. 2`)**: `>= 44x44 pt` (`min-h-[44px] min-w-[44px]`) per operativita in microgravita o con guanti IVA
- **Politica Strict Mode**: `tsc -b --noEmit` con `strict: true`, zero chiamate di rete esterne (`connect-src 'self'`), zero emoji in codice/documentazione/UI, preservazione integrale della nullabilita di Issue `#11` (`BEAT_INTERVALS_NOT_AVAILABLE`, mai convertire `null` in `0`) e della trasparenza epistemica di Issue `#12` (`ModelValidationStatus::IllustrativeUnvalidated`, `TtvIntervalKind::IllustrativeScenarioRange`).

---

## 1. Executive Summary & Scientific/Open-Source Grounding

### 1.1 Chiusura del Divario "Last-Mile" tra il Motore Rust a 8 Crate e il Cockpit React 19
Con il completamento dei Blocchi A–K (Fasi 01–28, `126/126` test passanti), il backend Safe Rust di ARES-Health (`ares-server-cli` e `ares-desktop-os`) calcola in `p99.9 = 5.58 us` ed emette a `20 Hz` (via JSON `WireTelemetryPacket` e via frame binario `128 B` `BinaryTelemetryFrame`) tre strutture quantitative avanzate che attualmente `ares-cockpit/` ignora o consuma solo parzialmente:

1. **Gap 1 — `PlaybookRunner.tsx` disaccoppiato dai 5 Playbook Cristallizzati e dai 3 Safety Gates:**
   - Attualmente [`PlaybookRunner.tsx`](../../ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx) codifica localmente in React solo 2 playbook statici (`PLAYBOOKS['#05']` — peraltro disallineato nell'ID rispetto al backend, dove il protocollo venoso e `#01`/`#02` mentre `#05` e il protocollo tempesta solare `CSA CANS` — e `PLAYBOOKS['#04']`), mentre [`App.tsx`](../../ares-cockpit/src/App.tsx) mostra `packet.active_playbook` solo come banner passivo sottostante e omette completamente il **Gate 3** (`eva_suit_damping_active` per asimmetria del passo marziano $\text{GAI} > 12\%$ a $0.38g$).
   - Il backend ([`playbooks.rs`](../../crates/ares-medops-playbooks/src/playbooks.rs), [`safety_gates.rs`](../../crates/ares-medops-playbooks/src/safety_gates.rs) e [`wire_contract.rs`](../../crates/ares-server-cli/src/wire_contract.rs)) emette invece `WireActivePlaybook` completo per tutti i **5 Playbook Type-1** (`PLAYBOOK_01`..`PLAYBOOK_05`), con `actions: CountermeasureAction[]` ordinate per $\Delta\hat{\rho}/\text{h}$, `causal_chain_summary`, e `safety_gates` (`anticoagulant_lock_active`, `lbnp_auto_vent_armed`, `eva_suit_damping_active`), replicati anche nei bit `FLAG_GATE1_ANTICOAG_LOCK`, `FLAG_GATE2_LBNP_VENT`, `FLAG_GATE3_EVA_DAMPING` e `active_playbook_id` (`0..5`) del frame binario da `128` byte ([`binary_ipc.rs`](../../crates/ares-core-types/src/binary_ipc.rs)).

2. **Gap 2 — `StlChart` in `MriAndStl.tsx` ricalcolato lato client anziche collegato a `NqsQuantileForecastSnapshot`:**
   - Attualmente [`MriAndStl.tsx`](../../ares-cockpit/src/modules/mri-and-stl/MriAndStl.tsx) ignora `packet.timestral_quantiles` e invoca un ciclo locale `evaluate({ ...whatIf, mission_day: x }, lastScanDay)` con banda gaussiana simmetrica $\pm 1.96\sigma$, mostrando un pannello vuoto durante il replay puro `BIDMC` anche per i canali effettivamente osservati (`heart_rate_bpm`, `resp_rate_brpm`).
   - Il worker asincrono `1 Hz` `Timestral` in [`ws_server.rs`](../../crates/ares-server-cli/src/ws_server.rs) popola invece `WireTelemetryPacket.timestral_quantiles` da `NqsQuantileForecastSnapshot` ([`crates/ares-core-types/src/lib.rs`](../../crates/ares-core-types/src/lib.rs)), fornendo i coni quantilici monotoni non-incrocianti $q_{0.05} \le q_{0.50} \le q_{0.95}$ su quattro orizzonti diretti (`+15m`, `+1h`, `+6h`, `+24h` in `channel_cones`), i coni sintetici `heart_rate_bpm_cone`, `resp_rate_brpm_cone`, `rmssd_ms_cone` (`Option`), `rho_global_cone` (`Option`), `ttv_hours_cone` (`Option`), il certificato diagnostico `AbstentionCertificate` (`HEURISTIC_GATE_ACCEPTED` vs `ABSTAINED_FALLBACK_DETERMINISTIC`) e lo stato `ModelValidationStatus::IllustrativeUnvalidated`.

3. **Gap 3 — `BodyHeatmap.tsx` & `AnatomicalLayers.tsx` privi di binding `UBERON:` e loader locale `.glb`:**
   - Attualmente la vista WebGL 3D legge esclusivamente lo stato derivato locale `ScenarioState` (`s.rho.tau_w`, `s.rho.onsd`, `s.rho.soleus`, `s.rho.sclerostin`) con 3 archi fissi, ignorando `packet.hypergraph_spatial` popolato da `AnatomicalRegionSubgraph::compute_body_heatmap` ([`hypergraph_spatial.rs`](../../crates/ares-causal-graph/src/hypergraph_spatial.rs)), che esporta 5 celle ontologiche `UBERON:` (`UBERON:0000970`, `UBERON:0001586`, `UBERON:0000948`, `UBERON:0001389`, `UBERON:0000955`) con `centroid`, `local_intensity`, `propagated_intensity`, `observed: bool`, `hottest_region`, `habitat_zone`, `violates_policy`, `rho_current_location` e `biokg_clause`, oltre ai 6 archi causali diretti con semantica max-product.

La **Fase 29 (`L1`)** salda definitivamente questi tre sottosistemi di `ares-cockpit/` ai flussi autorevoli del motore Rust (sia in modalita JSON WebSocket/HTTP sia in modalita binaria `128 B` `TAURI_NATIVE_IPC`), mantenendo intatto il fallback deterministico `LOCAL_SIMULATION` quando il backend non e attivo.

### 1.2 Riferimenti a Repository Pubblici, Ontologie, Standard NASA e Audit Epistemico

| Fonte / Repository / Standard | Riferimento Bibliografico / URL & Licenza | Contributo Specifico alla Fase 29 (`L1`) |
| :--- | :--- | :--- |
| **`nasa/NASA-3D-Resources`** | `https://github.com/nasa/NASA-3D-Resources` (NASA Public Domain / Open Source) | Sorgente pubblica di mesh `.glb`/`.gltf` spaziali (tute EVA/EMU, moduli habitat) caricate esclusivamente da disco locale (`ares-cockpit/public/models/`) tramite `GLTFLoader` air-gapped con fallback procedurale immediato. |
| **`mrdoob/three.js` (`GLTFLoader`) & `pmndrs/react-three-fiber`** | `https://github.com/mrdoob/three.js`, `https://github.com/pmndrs/react-three-fiber` (`MIT`) | Rendering dichiarativo WebGL su sfondo `#000000` OLED e parsing binario `.glb` (`magic = 0x46546C67`) senza dipendere da decoder Draco remoti (`gstatic.com`) incompatibili con CSP air-gapped. |
| **`UBERON` Multi-Species Anatomy Ontology** | Mungall et al., *Genome Biology* 2012 (`DOI: 10.1186/gb-2012-13-1-r5`) | Identificatori anatomici canonici `UBERON:0000970` (occhio/SANS), `UBERON:0001586` (vena giugulare interna — mai `UBERON:0001585`), `UBERON:0000948` (cuore), `UBERON:0001389` (soleo, con calcagno `UBERON:0001450`), `UBERON:0000955` (encefalo/vestibolare). |
| **Type-1 Crystallized Playbooks & `OCHMO MTB-007`** | Malik (2026, `arXiv:2607.07052v1`); Marshall-Goebel et al., *JAMA Netw. Open* 2019 (`DOI: 10.1001/jamanetworkopen.2019.15011`) | Esecuzione deterministica in UI dei 5 DAG clinici `#01`–`#05` e blocco categorico degli anticoagulanti (Gate 1) in assenza di conferma ecografica POCUS di trombo endoluminale. |
| **Monotone Quantiles & Adaptive Conformal Gate** | Koenker & Bassett (1978); Angelopoulos, Candes & Tibshirani, *NeurIPS* 2023 (`Conformal PID`) | Visualizzazione rigorosa di coni multi-orizzonte non-incrocianti ($q_{0.05} \le q_{0.50} \le q_{0.95}$) su `+15m`, `+1h`, `+6h`, `+24h` accoppiata allo stato del gate adattivo (`HEURISTIC_GATE_ACCEPTED` vs `ABSTAINED_FALLBACK_DETERMINISTIC`). |
| **`NASA-STD-3001 Vol. 2 Rev F` & `MIL-STD-1472H`** | Clauses `[V2 10001]`, `[V2 10002]`, `[V2 10005]`, `[V2 10022]`, `[V2 10027]`, `[V2 10152]`; `MIL-STD-1472H` §5.4 | Contrasto OLED `#000000` (`[V2 10001]`), prevenzione errori da canali `null` (`[V2 10002]`), coerenza multi-pannello (`[V2 10005]`), latenza comandi $\le 100\,\text{ms}$ (`[V2 10022]`), interlock Gate 1/2/3 (`[V2 10027]`), latenza display $\le 50\,\text{ms}$ (`[V2 10152]`), touch target $\ge 44 \times 44\,\text{pt}$. |
| **Issue `#11` & Issue `#12` (`MODEL_EVIDENCE_AUDIT.md`)** | Pimentel et al., *IEEE TBME* 2017; [`docs/architecture/MODEL_EVIDENCE_AUDIT.md`](../architecture/MODEL_EVIDENCE_AUDIT.md) | Divieto assoluto di convertire `null` in `0` (`BEAT_INTERVALS_NOT_AVAILABLE` su RMSSD) e obbligo di etichettare tutti gli output di scenario/previsione come `ILLUSTRATIVE_UNVALIDATED` / `ILLUSTRATIVE_SCENARIO_RANGE` (mai `"95% CI"` o `"calibrated"`). |

---

## 2. Architectural Decisions & Target Modules

### 2.1 Architettura del Flusso Dati Unificato (`Dual-Transport -> Validated Store -> 3 Live Cockpit Modules`)

```
+----------------------------------------------------------------------------------------+
|               BACKEND RUST ENGINE (ares-server-cli / ares-desktop-os)                  |
|  - WireTelemetryPacket (JSON: GET /api/snapshot, WS /ws/telemetry, POST /api/stress-test)|
|    * active_playbook (#01..#05, actions[], safety_gates, causal_chain_summary)         |
|    * timestral_quantiles (NqsQuantileForecastSnapshot: +15m/+1h/+6h/+24h, cert)        |
|    * hypergraph_spatial (cells[5] UBERON:, hottest_region, habitat_zone, biokg_clause) |
|  - BinaryTelemetryFrame (128 B LE: Tauri Channel<Response> / GET /api/binary-frame)    |
|    * active_playbook_id (0..5), FLAG_GATE1/2/3, ttv_q05/q50/q95_days, FLAG_CONFORMAL   |
+-------------------------------------------+--------------------------------------------+
                                            |
                                            v
+----------------------------------------------------------------------------------------+
|       FRONTEND CONTRACT & VALIDATION LAYER (ares-cockpit/src/lib/ & src/types/)        |
|  1. telemetry.ts           -> Tipi completi TS allineati a Rust serde                  |
|  2. telemetryValidation.ts -> Verifica q05<=q50<=q95, Issue #11 null guard, Issue #12  |
|  3. binaryTelemetryDecoder -> Merge 128B incrementale senza perdere cells/cones JSON   |
|  4. playbookCatalog.ts     -> Fallback deterministico #01..#05 quando engine offline   |
+-------------------+-------------------------------+------------------------------------+
                    |                               |
                    v                               v
+-----------------------------------+ +--------------------------------------------------+
| 1. PlaybookRunner.tsx (ACT)       | | 2. MriAndStl.tsx (EVALUATE -> FORECAST)          |
| - Live binding #01..#05 & actions | | - Multi-Horizon Timestral Fan (+15m..+24h)       |
| - Gate 1/2/3 interlocks [V2 10027]| | - ConformalAbstentionGate + AbstentionCertificate|
| - POCUS Tri-State -> POST / IPC   | | - Issue #11 rmssd_ms_cone=null -> NO R-R badge   |
| - >= 44x44 pt OLED touch targets  | | - Issue #12 ILLUSTRATIVE_UNVALIDATED / RANGE     |
+-----------------------------------+ +--------------------------------------------------+
                                                    |
                                                    v
                    +--------------------------------------------------------------------+
                    | 3. BodyHeatmap.tsx + AnatomicalLayers.tsx + NasaGlbAssetLayer.tsx  |
                    | - 5 Nodi UBERON: guidati da local_intensity & propagated_intensity |
                    | - observed=false (UBERON:0000948 senza R-R) -> stato UNOBSERVED    |
                    | - 6 Archi QuadraticBezierLine con flusso F_{u->v} = w_{uv} * L_u   |
                    | - Loader GLTFLoader locale (/models/*.glb, magic 0x46546C67)       |
                    |   con ErrorBoundary + fallback procedurale 100% CSP 'self'         |
                    +--------------------------------------------------------------------+
```

### 2.2 Decisioni Architetturali Chiave

1. **Eliminazione dello Stato Duplicato nei Playbook (`Single Source of Truth` + Modalita `LIVE ENGINE` vs `MANUAL REVIEW`):**
   - In `PlaybookRunner.tsx`, quando `packet.active_playbook` e presente (`ENGINE_LIVE` o simulatore locale arricchito), il componente opera di default in modalita **`FOLLOW LIVE ENGINE`**, mostrando esattamente `playbook_id`, `title`, `actions: CountermeasureAction[]` (con badge `category` e guadagno $\Delta\hat{\rho}/\text{h}$), `causal_chain_summary` e lo stato reale di `safety_gates` (`Gate 1`, `Gate 2`, `Gate 3`).
   - L'equipaggio puo ispezionare manualmente gli altri protocolli `#01`–`#05` tramite tab `>= 44x44 pt` (`INSPECT #01..#05`), ma un indicatore ad alto contrasto segnala sempre quale playbook e attualmente imposto dal motore deterministico Rust, con un pulsante `RETURN TO ACTIVE ENGINE PLAYBOOK` conforme a `NASA-STD-3001 [V2 10023]` e `[V2 10024]`.
   - La conferma ecografica POCUS (`UNSCANNED` / `ABSENT` / `CONFIRMED`) invia immediatamente `StressTestPatchRequest` (`pocus_thrombus_confirmed: boolean`) tramite `apply_what_if_patch` (Tauri IPC) o `POST /api/stress-test` (Axum loopback), facendo commutare il backend da `PLAYBOOK_01_VENOUS_STASIS_LBNP` (`Gate 1 LOCKED`) a `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS` (`Gate 1 UNLOCKED`, `ACT_ANTICOAG_ENOXAPARIN` abilitato) senza avanzare `relative_recording_time_s`.

2. **Onesta Epistemica Multi-Orizzonte nei Coni `Timestral` (Issue `#11` + Issue `#12`):**
   - In `MriAndStl.tsx`, `StlChart` viene esteso per ricevere `packet` (`timestral_quantiles`, `safety_margins`, `quality_flags`).
   - Quando `packet.timestral_quantiles` proviene dal motore Rust (`!packet.is_local_simulation`), la vista predefinita mostra i coni quantilici DHF su `+15m` (`900 s`), `+1h` (`3600 s`), `+6h` (`21600 s`) e `+24h` (`86400 s`).
   - **Gestione rigorosa del Replay Puro `BIDMC` (Issue `#11`):** Durante il replay puro terrestre `BIDMC` (`NONE_PURE_REPLAY`), `rmssd_ms_cone`, `rho_global_cone` e `ttv_hours_cone` sono `null` (`BEAT_INTERVALS_NOT_AVAILABLE`). Invece di nascondere l'intero modulo o inventare valori, il selettore canali consente di visualizzare i coni reali calcolati da `Timestral` sui canali registrati presenti (`heart_rate_bpm`, `resp_rate_brpm`), mentre selezionando `rmssd_ms` o `rho_global` viene mostrato un pannello esplicito `UNAVAILABLE (BEAT_INTERVALS_NOT_AVAILABLE)` senza mai tracciare `0.0`.
   - **Etichettatura obbligatoria Issue `#12`:** Ogni grafico e tooltip espone `MODEL STATUS: ILLUSTRATIVE_UNVALIDATED` e `INTERVAL KIND: ILLUSTRATIVE_SCENARIO_RANGE (NOMINAL q05-q50-q95)`, vietando stringhe ingannevoli quali `"95% CI"`, `"calibrated"` o `"guaranteed worst-case"`. L'eventuale stato legacy `'CALIBRATED_QUANTILE_CONE'` viene normalizzato in ingresso a `'HEURISTIC_GATE_ACCEPTED'`.

3. **Mappatura Spaziale `UBERON:` e Sicurezza CSP del Loader `.glb` Locale:**
   - I centroidi normalizzati $\mathbf{c} \in [-1, +1]^3$ di `crates/ares-causal-graph/src/hypergraph_spatial.rs` vengono trasformati nello spazio metrico del rig Three.js tramite un'applicazione affine fissa e invertibile $\Phi(\mathbf{c})$, ancorando i 5 nodi `UBERON:` e i 6 archi diretti di conduzione.
   - Qualora una cella abbia `observed === false` (caso canonico: `HeartCardioAutonomic` / `UBERON:0000948` quando `rmssd_ms` e `None` per `BEAT_INTERVALS_NOT_AVAILABLE`), il nodo 3D non usa mai il ciano nominale `#22d3ee`, bensi una codifica dedicata (`#6b7280` / bordo ambra `#facc15` tratteggiato con etichetta `UNOBSERVED [NO R-R]`), distinguendo inoltre `local_intensity` (non osservata) da `propagated_intensity` (rischio indotto a 1 hop da `SoleusCalcaneus`).
   - Per gli asset `.glb` opzionali (`nasa/NASA-3D-Resources` in `ares-cockpit/public/models/`), si utilizza `GLTFLoader` da `three/examples/jsm/loaders/GLTFLoader.js` (gia presente in `three@^0.171.0`, zero dipendenze esterne, zero fetch verso `gstatic.com` Draco CDN) preceduto da un pre-check `fetch('/models/<file>.glb')` same-origin che verifica i primi 4 byte `magic == 0x46546C67` (`"glTF"` little-endian). Questo previene l'errore classico di Vite SPA fallback (che altrimenti restituirebbe `index.html` con HTTP `200` quando il file `.glb` non e installato su disco) e rispetta al 100% la CSP di [`crates/ares-desktop-os/tauri.conf.json`](../../crates/ares-desktop-os/tauri.conf.json) (`default-src 'self'; connect-src 'self' ...`).

### 2.3 Tabella Completa dei Moduli Coinvolti e Tracciabilita `NASA-STD-3001`

| File / Modulo | Azione | Responsabilita Tecnica nella Fase 29 (`L1`) | Clausole `NASA-STD-3001` & Invarianti |
| :--- | :--- | :--- | :--- |
| `ares-cockpit/src/types/telemetry.ts` | **UPDATE** | Estende `ActivePlaybook`, `TimestralQuantilesSummary`, `HypergraphSpatialSummary`, `SafetyMargins` e `TelemetryPacket` con tutti i tipi `WireTelemetryPacket`. | `[V2 10002]`, Issue `#11`, Issue `#12` |
| `ares-cockpit/src/lib/playbookCatalog.ts` | **CREATE** | Definisce `CRYSTALLIZED_PLAYBOOK_CATALOG` (`#01`–`#05`) e `deriveOfflineActivePlaybook` in parita esatta con `playbooks.rs` e `safety_gates.rs`. | `[V2 10023]`, `[V2 10027]`, `OCHMO MTB-007` |
| `ares-cockpit/src/lib/telemetryValidation.ts` | **UPDATE** | Valida e normalizza `actions`, `timestral_quantiles` (verifica $q_{0.05} \le q_{0.50} \le q_{0.95}$), `hypergraph_spatial.cells`, `model_validation_status` e `ttv_interval_kind`. | `[V2 10002]`, Issue `#11`, Issue `#12` |
| `ares-cockpit/src/lib/binaryTelemetryDecoder.ts` | **UPDATE** | Garantisce che `mergeBinaryFrameIntoPacket` istanzi/aggiorni `active_playbook` (`1..5`), Gate 1/2/3 e `ABSTAINED_FALLBACK_DETERMINISTIC` a `20 Hz`. | `[V2 10152]`, Issue `#11`, Issue `#12` |
| `ares-cockpit/src/lib/scenario.ts` | **UPDATE** | Arricchisce `buildPacket` offline con `active_playbook`, `hypergraph_spatial` e coni illustrativi di fallback marcati `LOCAL_OFFLINE_SIMULATION`. | `[V2 10001]`, `[V2 10005]` |
| `ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx` | **UPDATE** | Esecutore interattivo live dei 5 Playbook `#01`–`#05`, stato Gate 1/2/3, trigger POCUS bidirezionale e controlli `min-h-[44px] min-w-[44px]`. | `[V2 10022]`, `[V2 10023]`, `[V2 10027]`, `MIL-STD-1472H` |
| `ares-cockpit/src/modules/mri-and-stl/MriAndStl.tsx` | **UPDATE** | Cono multi-orizzonte `Timestral` (`+15m`, `+1h`, `+6h`, `+24h`), diagnostica `ConformalAbstentionGate`, guardie Issue `#11`/`#12` e fallback locale. | `[V2 10001]`, `[V2 10002]`, `[V2 10152]`, Issue `#11`/`#12` |
| `ares-cockpit/src/modules/body-3d-heatmap/uberonSpatialMapping.ts` | **CREATE** | Trasformazione affine $\Phi$, mappatura `HeatmapCell` `UBERON:`, gestione `observed=false` e calcolo dei 6 archi di conduzione max-product. | `[V2 10002]`, Issue `#11`, Issue `#12` |
| `ares-cockpit/src/modules/body-3d-heatmap/NasaGlbAssetLayer.tsx` | **CREATE** | Loader locale `.glb` (`GLTFLoader` + verifica `0x46546C67` + `GlbAssetErrorBoundary`) con fallback istantaneo alle geometrie procedurali. | Air-Gap Invariant 1, CSP `tauri.conf.json` |
| `ares-cockpit/src/modules/body-3d-heatmap/AnatomicalLayers.tsx` & `BodyHeatmap.tsx` | **UPDATE** | Rendering quantitativo guidato da `hypergraph_spatial.cells`, badge `UBERON:`, HUD `hottest_region` / `habitat_zone` / `biokg_clause` e controlli `>= 44x44 pt`. | `[V2 10001]`, `[V2 10005]`, `[V2 10152]`, `MIL-STD-1472H` |
| `ares-cockpit/src/App.tsx` | **UPDATE** | Unifica il pannello `ACT` (Playbook + tutti i 3 Hard Safety Gates) e passa `packet` completo a `StlChart` e `BodyHeatmap`. | `[V2 10005]`, `[V2 10027]` |
| `ares-cockpit/public/models/manifest.json` | **CREATE** | Manifesto locale deterministicamente verificabile per gli asset `.glb` opzionali derivati da `nasa/NASA-3D-Resources`. | Air-Gap Invariant 1, Clean-Room Invariant 3 |

---

## 3. Mathematical Formulations & TypeScript Contracts

### 3.1 Formulazione Matematica dei Tre Sottosistemi Quantitative-Visual

#### A. Selezione Type-1 dei 5 Playbook e Macchina a Stati dei 3 Hard Clinical Safety Gates
Sia $P \in \{\text{PB}_{01}, \text{PB}_{02}, \text{PB}_{03}, \text{PB}_{04}, \text{PB}_{05}\}$ il playbook attivo emesso da `select_candidate_playbook` + `enforce_hard_clinical_safety_gates`:
$$\operatorname{Playbook}(\mathbf{x}) = \begin{cases}
\text{PB}_{02} & \text{se } \text{pocus\_thrombus\_confirmed} = \top \\
\text{PB}_{05} & \text{se } \neg\text{pocus} \land \dot{D}_{\text{rad}} > 1.5\,\text{mSv/d} \\
\text{PB}_{01} & \text{se } \neg\text{pocus} \land \dot{D}_{\text{rad}} \le 1.5 \land \hat{\rho}_{\tau_w} < 0.15 \\
\text{PB}_{04} & \text{se } \neg\text{pocus} \land \dot{D}_{\text{rad}} \le 1.5 \land \hat{\rho}_{\tau_w} \ge 0.15 \land \hat{\rho}_{\text{SANS}} < 0.20 \\
\text{PB}_{03} & \text{altrimenti}
\end{cases}$$
Con predicati di sicurezza salvavita (`[V2 10027]`):
$$\begin{aligned}
G_1(\text{AnticoagLock}) &\iff \neg\text{pocus\_thrombus\_confirmed} \implies \forall a \in \mathcal{A}(P),\; \text{ANTICOAG} \notin a.\text{id} \\
G_2(\text{LbnpAutoVent}) &\iff \text{lbnp\_active} \land \big(\Delta\text{SBP} > 15.0\,\text{mmHg} \lor \text{HR} > 115.0\,\text{bpm}\big) \implies a_0 = \text{ACT\_EMERGENCY\_LBNP\_AUTO\_VENT\_0\_MMHG} \\
G_3(\text{EvaSuitDamping}) &\iff \text{GAI}_{0.38g} > 12.0\% \implies \text{ACT\_EVA\_SUIT\_ANKLE\_DAMPING\_038G} \in \mathcal{A}(P)
\end{aligned}$$

#### B. Geometria Non-Incrociante dei Coni Quantilici Multi-Orizzonte `Timestral`
Per ciascun canale osservato $c$ e per ciascun orizzonte discreto $h_k \in \mathcal{H} = \{900\,\text{s}, 3600\,\text{s}, 21600\,\text{s}, 86400\,\text{s}\}$ (`+15m`, `+1h`, `+6h`, `+24h`), il `QuantileHead` Rust costruisce:
$$q_{0.50}(c, h_k) \in \mathbb{R}, \qquad q_{0.05}(c, h_k) = q_{0.50}(c, h_k) - \operatorname{softplus}(\delta_{L,k}) \le q_{0.50}(c, h_k) \le q_{0.50}(c, h_k) + \operatorname{softplus}(\delta_{U,k}) = q_{0.95}(c, h_k)$$
Per rappresentare visivamente senza compressione ottica quattro scale temporali che spaziano di un fattore $96\times$ ($900\,\text{s} \to 86400\,\text{s}$), l'ascissa SVG in `[PAD_L, W - PAD_R]` utilizza la trasformazione logaritmica monotona ancorata a $\Delta t = 0$:
$$\xi(\Delta t) = \frac{\ln\!\left(1 + \frac{\Delta t}{\tau_0}\right)}{\ln\!\left(1 + \frac{86400}{\tau_0}\right)} \in [0, 1], \qquad \tau_0 = 900\,\text{s}, \qquad x_{\text{svg}}(\Delta t) = x_0 + \xi(\Delta t)\cdot(x_{\max} - x_0)$$
che posiziona i nodi esattamente a $\xi(0) = 0.000$, $\xi(900) \approx 0.152$, $\xi(3600) \approx 0.352$, $\xi(21600) \approx 0.704$ e $\xi(86400) = 1.000$, garantendo leggibilita uniforme sia nel breve termine (`+15m`, `+1h`) sia sulle `24h`.

In conformita con Issue `#11`, se `hrv_unavailable_reason == "BEAT_INTERVALS_NOT_AVAILABLE"`:
$$\text{rmssd\_ms\_cone} = \varnothing, \quad \text{rho\_global\_cone} = \varnothing, \quad \text{ttv\_hours\_cone} = \varnothing$$
e il componente SVG non interpola mai alcun punto sostitutivo `0.0`.

#### C. Proiezione Affine 3D $\Phi$ dei Centroidi `UBERON:` e Propagazione Max-Product sugli Archi
Siano $V_{\text{UBERON}} = \{0, 1, 2, 3, 4\}$ le 5 regioni di `AnatomicalRegionSubgraph` con intensita locale $L_i \in [0, 1]$, stato di osservabilita $O_i \in \{\bot, \top\}$ e intensita propagata ad 1 hop:
$$I_i = \operatorname{clamp}\!\left(\max\!\Big(L_i,\; \max_{(j \to i) \in E} w_{ji} \cdot L_j\Big),\; 0.0,\; 1.0\right), \qquad F_{j \to i} = \operatorname{clamp}(w_{ji} \cdot L_j,\; 0.0,\; 1.0)$$
I centroidi normalizzati $\mathbf{c}_i = [x_n, y_n, z_n]^\top \in [-1, +1]^3$ esportati dal backend (`EyeOcularSans = [0.00, 0.82, 0.05]`, `InternalJugularVein = [-0.06, 0.62, 0.04]`, `HeartCardioAutonomic = [0.00, 0.30, 0.02]`, `SoleusCalcaneus = [0.00, -0.65, -0.03]`, `BrainVestibularCns = [0.00, 0.90, -0.02]`) vengono mappati sul sistema di riferimento metrico del corpo Three.js ($y \in [-0.75, +1.75]$) tramite l'applicazione affine:
$$\Phi(\mathbf{c}_i) = \begin{bmatrix} 1.00 & 0 & 0 \\ 0 & 1.32 & 0 \\ 0 & 0 & 1.10 \end{bmatrix} \begin{bmatrix} x_n \\ y_n \\ z_n \end{bmatrix} + \begin{bmatrix} 0.00 \\ 0.47 \\ 0.02 \end{bmatrix}$$
che proietta esattamente:
- `UBERON:0000955` (`BrainVestibularCns`, $y_n = 0.90$) $\mapsto y_{\text{rig}} = 1.658$ (cranio);
- `UBERON:0000970` (`EyeOcularSans`, $y_n = 0.82$) $\mapsto y_{\text{rig}} = 1.552$ (orbita/guaina nervo ottico);
- `UBERON:0001586` (`InternalJugularVein`, $y_n = 0.62$) $\mapsto y_{\text{rig}} = 1.288$ (vena giugulare cervicale);
- `UBERON:0000948` (`HeartCardioAutonomic`, $y_n = 0.30$) $\mapsto y_{\text{rig}} = 0.866$ (miocardio/plesso autonomico);
- `UBERON:0001389` (`SoleusCalcaneus`, $y_n = -0.65$) $\mapsto y_{\text{rig}} = -0.388$ (ventre muscolare del soleo, con anchor secondario calcaneare `UBERON:0001450` a $y = -0.710$).

La funzione cromatica $\mathcal{C}(I_i, O_i)$ rispetta rigorosamente `NASA-STD-3001 [V2 10002]` e Issue `#11`:
$$\mathcal{C}(I_i, O_i) = \begin{cases}
\texttt{\#6b7280}\;\text{(anello }\texttt{\#facc15}\text{ UNOBSERVED)} & \text{se } O_i = \bot \land I_i < 0.05 \\
\texttt{\#facc15}\;\text{(PROPAGATED ONLY, NO LOCAL R-R)} & \text{se } O_i = \bot \land I_i \ge 0.05 \\
\texttt{\#f43f5e}\;\text{(CRITICAL)} & \text{se } O_i = \top \land I_i \ge 0.75 \\
\texttt{\#fb923c}\;\text{(WARNING)} & \text{se } O_i = \top \land 0.50 \le I_i < 0.75 \\
\texttt{\#facc15}\;\text{(ADVISORY)} & \text{se } O_i = \top \land 0.25 \le I_i < 0.50 \\
\texttt{\#22d3ee}\;\text{(NOMINAL)} & \text{se } O_i = \top \land I_i < 0.25
\end{cases}$$

---

### 3.2 Contratti TypeScript Completi (`ares-cockpit/src/types/telemetry.ts`)

```typescript
// Estensioni Fase 29 (L1) in ares-cockpit/src/types/telemetry.ts
// Allineate bit-per-bit con crates/ares-core-types, crates/ares-causal-graph e crates/ares-server-cli/src/wire_contract.rs

export type ModelValidationStatus = 'ILLUSTRATIVE_UNVALIDATED';

export type TtvIntervalKind = 'ILLUSTRATIVE_SCENARIO_RANGE';

export type HrvUnavailableReason = 'BEAT_INTERVALS_NOT_AVAILABLE';

export type ConformalGateStatus =
  | 'HEURISTIC_GATE_ACCEPTED'
  | 'ABSTAINED_FALLBACK_DETERMINISTIC';

export type CrystallizedPlaybookId =
  | 'PLAYBOOK_01_VENOUS_STASIS_LBNP'
  | 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS'
  | 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED'
  | 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION'
  | 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS';

export interface SafetyGatesState {
  anticoagulant_lock_active: boolean;
  lbnp_auto_vent_armed: boolean;
  eva_suit_damping_active: boolean;
}

export interface CountermeasureAction {
  action_id: string;
  label: string;
  category: string;
  delta_rho_per_hour: number;
}

export interface ActivePlaybook {
  playbook_id: string;
  title?: string;
  current_step?: number;
  total_steps?: number;
  step_instruction?: string;
  causal_chain_summary?: string[];
  safety_gates?: SafetyGatesState;
  actions?: CountermeasureAction[];
}

export interface MonotoneQuantileTriplet {
  q05: number;
  q50: number;
  q95: number;
}

export interface ChannelQuantileCone {
  channel_name: string;
  horizon_15m: MonotoneQuantileTriplet;
  horizon_1h: MonotoneQuantileTriplet;
  horizon_6h: MonotoneQuantileTriplet;
  horizon_24h: MonotoneQuantileTriplet;
}

export interface AbstentionCertificate {
  abstained: boolean;
  status: ConformalGateStatus;
  reason: string;
  empirical_coverage_error: number;
  adaptive_alpha_t: number;
  interval_width: number;
  sqi_score: number;
  missing_ratio: number;
  timestamp_s: number;
}

export interface TimestralQuantilesSummary {
  model_validation_status?: ModelValidationStatus;
  source_recording_time_s?: number;
  confidence_state?: ConformalGateStatus;
  conformal_status?: string;
  abstention_certificate?: AbstentionCertificate | null;
  short_horizon_s?: number;
  heart_rate_bpm_cone?: MonotoneQuantileTriplet | null;
  resp_rate_brpm_cone?: MonotoneQuantileTriplet | null;
  rmssd_ms_cone?: MonotoneQuantileTriplet | null;
  rho_global_cone?: MonotoneQuantileTriplet | null;
  ttv_hours_cone?: MonotoneQuantileTriplet | null;
  channel_cones?: ChannelQuantileCone[];
  pessimistic_ttv_q05_hours?: number | null;
  inference_latency_us?: number;
  ttv_q05_days?: number | null;
  ttv_q50_days?: number | null;
  ttv_q95_days?: number | null;
}

export type AnatomicalRegionWireId =
  | 'EyeOcularSans'
  | 'InternalJugularVein'
  | 'HeartCardioAutonomic'
  | 'SoleusCalcaneus'
  | 'BrainVestibularCns';

export type AnatomicalHeatmapKey =
  | 'eye_ocular_sans'
  | 'internal_jugular_vein'
  | 'heart_cardio_autonomic'
  | 'soleus_calcaneus'
  | 'brain_vestibular_cns';

export type UberonCurie =
  | 'UBERON:0000970'
  | 'UBERON:0001586'
  | 'UBERON:0000948'
  | 'UBERON:0001389'
  | 'UBERON:0000955';

export interface HeatmapCellWire {
  region: AnatomicalRegionWireId | string;
  key: AnatomicalHeatmapKey | string;
  uberon_curie: UberonCurie | string;
  centroid: [number, number, number];
  local_intensity: number;
  propagated_intensity: number;
  observed: boolean;
}

export interface HypergraphSpatialSummary {
  hottest_region?: AnatomicalRegionWireId | string | null;
  cells?: HeatmapCellWire[];
  anatomical_cells?: Array<{
    region_id: string;
    uberon_id: string;
    risk_intensity: number;
  }>;
  habitat_zone?: string;
  violates_policy?: boolean;
  rho_current_location?: number | null;
  biokg_clause?: string | null;
}
```

*(In `SafetyMargins` si aggiunge `ttv_interval_kind?: TtvIntervalKind | null;`, mentre in `TelemetryPacket` si aggiungono `model_validation_status?: ModelValidationStatus;`, `pocus_posterior?: number | null;` e `causal_chain?: string[];`).*

---

### 3.3 Validazione Monotona, Nullability Guard & Catalogo Playbook (`telemetryValidation.ts` & `playbookCatalog.ts`)

```typescript
// Estratto logico per ares-cockpit/src/lib/telemetryValidation.ts

export function parseMonotoneQuantileTriplet(raw: unknown): MonotoneQuantileTriplet | null {
  if (!isRecord(raw)) return null;
  const q05 = raw.q05;
  const q50 = raw.q50;
  const q95 = raw.q95;
  if (!isFiniteNum(q05) || !isFiniteNum(q50) || !isFiniteNum(q95)) {
    return null;
  }
  const eps = 1e-6;
  if (q05 > q50 + eps || q50 > q95 + eps) {
    return null; // Rifiuta incroci quantilici (AresCoreError::QuantileCrossing)
  }
  return {
    q05: Math.min(q05, q50),
    q50,
    q95: Math.max(q50, q95),
  };
}

export function normalizeConformalGateStatus(raw: unknown): ConformalGateStatus | undefined {
  if (raw === 'HEURISTIC_GATE_ACCEPTED' || raw === 'CALIBRATED_QUANTILE_CONE') {
    // Issue #12: legacy CALIBRATED_QUANTILE_CONE e ammesso solo come alias di deserializzazione
    return 'HEURISTIC_GATE_ACCEPTED';
  }
  if (raw === 'ABSTAINED_FALLBACK_DETERMINISTIC' || raw === 'ABSTAINED_FALLBACK') {
    return 'ABSTAINED_FALLBACK_DETERMINISTIC';
  }
  return undefined;
}
```

Quando `biometrics.hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE'` (o `biometrics.hrv_rmssd_ms === null` su stream registrato `BIDMC`), `normalizeTimestralQuantiles` forza sempre:
- `rmssd_ms_cone: null`, `rho_global_cone: null`, `ttv_hours_cone: null`;
- rimozione difensiva da `channel_cones` di eventuali canali dipendenti da intervalli R-R (`rmssd_ms`, `sdnn_ms`, `lf_hf_ratio`, `rho_global`), preservando intatti `heart_rate_bpm`, `resp_rate_brpm`, `tau_w_dyn_cm2`, `sclerostin_pmol_l`, `sans_risk_index`.

In `ares-cockpit/src/lib/playbookCatalog.ts`, `CRYSTALLIZED_PLAYBOOK_CATALOG` espone i metadati canonici dei 5 Playbook (`PLAYBOOK_01_VENOUS_STASIS_LBNP` .. `PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS`) con codice breve (`#01`..`#05`), clausola `NASA-STD-3001` (`[V2 7043]` / `OCHMO MTB-007`, `[V1 3002]`, `[V2 6001]`, `[V1 4001]`) e azioni predefinite, usati:
1. da `binaryTelemetryDecoder.ts` quando un frame binario `128 B` aggiorna `active_playbook_id` (`1..5`) prima del successivo snapshot JSON;
2. da `scenario.ts` quando `link === 'LOCAL_SIMULATION'` (motore Rust disconnesso);
3. dai tab di consultazione manuale in `PlaybookRunner.tsx`.

---

### 3.4 Firme e Struttura dei Tre Moduli UI Principali

#### 1. `ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx`
```typescript
export interface PlaybookRunnerProps {
  activePlaybook: ActivePlaybook | null | undefined;
  isLiveEngine: boolean;
  thrombusConfirmed: boolean | null;
  ventEvent: string | null;
  syncLatencyUs: number | null;
  modelValidationStatus?: ModelValidationStatus;
  onConfirmPocusThrombus: (confirmed: boolean | null) => void;
  onRearmLbnp?: () => void;
}
```
- **Comportamento:**
  - Sincronizza il playbook visualizzato con `activePlaybook.playbook_id` quando `followLive === true`; espone 5 pulsanti `min-h-[44px] min-w-[44px]` (`#01 STASIS`, `#02 THROMBUS`, `#03 ARED/BONE`, `#04 SANS`, `#05 SPE RAD`) con indicatore `LIVE` sul protocollo selezionato dal motore.
  - Renderizza l'elenco `actions: CountermeasureAction[]` con checkbox/avanzamento step (`[DONE]`, `[ACTIVE]`, `[PENDING]`), categoria (`HARD_SAFETY_GATE_OVERRIDE`, `PHARMACOLOGICAL_UNLOCKED`, `PHYSICAL_HEMODYNAMIC`, `BIOMECHANICAL_SAFETY_GATE`, ecc.) e contributo $\Delta\hat{\rho}/\text{h}$ (etichettato come `illustrative policy delta` per Issue `#12`).
  - Se `safety_gates.anticoagulant_lock_active === true`, qualsiasi step farmacologico anticoagulante (nel caso l'operatore stia ispezionando manualmente `#02`) mostra il blocco hardware/software rosso `GATE 1 LOCKED: POCUS THROMBUS CONFIRMATION REQUIRED [V2 10027]` con pulsante disabilitato.
  - Include il pannello interattivo **Bilateral IJV POCUS Verification** con 3 pulsanti `min-h-[44px]` (`UNSCANNED`, `THROMBUS ABSENT`, `THROMBUS CONFIRMED`) che invocano `onConfirmPocusThrombus`, attivando immediatamente `POST /api/stress-test` / `apply_what_if_patch` e mostrando la latenza di ricalcolo (`syncLatencyUs`).

#### 2. `ares-cockpit/src/modules/mri-and-stl/MriAndStl.tsx` (`StlChart` + `TimestralQuantileConePanel`)
```typescript
export interface StlChartProps {
  packet: TelemetryPacket;
  whatIf: WhatIf;
  lastScanDay: number;
  isPureReplay?: boolean;
}
```
- **Comportamento:**
  - Espone una barra superiore con:
    1. Badge stato gate conforme: `HEURISTIC_GATE_ACCEPTED` (`border-nominal text-nominal`) oppure `ABSTAINED_FALLBACK_DETERMINISTIC` (`border-advisory text-advisory`), accompagnato da `SQI`, `missing_ratio` e `adaptive_alpha_t` letti da `abstention_certificate`.
    2. Badge epistemico obbligatorio Issue `#12`: `ILLUSTRATIVE_UNVALIDATED | ILLUSTRATIVE_SCENARIO_RANGE (NOT 95% CI)`.
    3. Selettore vista `min-h-[44px]`: `TIMESTRAL DHF (+15m..+24h)` vs `14-DAY SCENARIO PREVIEW`.
    4. Selettore canale `min-h-[44px]`: `rho_global`, `heart_rate_bpm`, `resp_rate_brpm`, `tau_w_dyn_cm2`, `sclerostin_pmol_l`, `sans_risk_index`, `rmssd_ms`.
  - Se il canale selezionato e `rmssd_ms` o `rho_global` e `hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE'` (oppure il relativo cono e `null`), renderizza un avviso strutturato ad alto contrasto su sfondo `#000000` (`UNAVAILABLE: BEAT_INTERVALS_NOT_AVAILABLE — 1 Hz numeric stream lacks R-R intervals; no proxy HRV or full global cone is fabricated`), lasciando tuttavia selezionabili `heart_rate_bpm` e `resp_rate_brpm` anche in `NONE_PURE_REPLAY`.
  - Per ogni canale valido in `channel_cones`, disegna il poligono chiuso non-incrociante tra `q05` e `q95` lungo $t_0, +15\text{m}, +1\text{h}, +6\text{h}, +24\text{h}$, la spezzata mediana `q50`, e la tabella compatta delle triplette $(q_{0.05}, q_{0.50}, q_{0.95})$ ai 4 orizzonti.

#### 3. `ares-cockpit/src/modules/body-3d-heatmap/` (`uberonSpatialMapping.ts`, `NasaGlbAssetLayer.tsx`, `BodyHeatmap.tsx`)
```typescript
export interface ResolvedUberonNode {
  region: AnatomicalRegionWireId;
  key: AnatomicalHeatmapKey;
  uberonCurie: UberonCurie;
  label: string;
  rigPosition: [number, number, number];
  localIntensity: number;
  propagatedIntensity: number;
  observed: boolean;
  isHottest: boolean;
  displayColor: string;
  statusTag: 'OBSERVED_LIVE' | 'UNOBSERVED_NO_RR' | 'PROPAGATED_ONLY' | 'LOCAL_FALLBACK';
}

export interface ResolvedConductionArc {
  from: AnatomicalHeatmapKey;
  to: AnatomicalHeatmapKey;
  fromPos: [number, number, number];
  midPos: [number, number, number];
  toPos: [number, number, number];
  mechanism: string;
  couplingWeight: number;
  fluxIntensity: number;
  sourceObserved: boolean;
  color: string;
}

export const GLTF_BINARY_MAGIC_LE = 0x46546c67; // ASCII "glTF" in little-endian

export function hasValidGlbMagicHeader(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  return magic === GLTF_BINARY_MAGIC_LE && version === 2;
}
```
- **Architettura Air-Gapped di `NasaGlbAssetLayer.tsx`:**
  - Legge `/models/manifest.json` (solo su richiesta esplicita dell'utente tramite il toggle `NASA LOCAL GLB OVERLAY` o se presente in cache locale), verifica `hasValidGlbMagicHeader(arrayBuffer)` per escludere risposte HTML di fallback di Vite, e parsa l'`ArrayBuffer` in memoria tramite `new GLTFLoader().parse(arrayBuffer, '/models/', onLoad, onError)` senza mai aprire richieste verso CDN esterni.
  - Avvolto in `GlbAssetErrorBoundary`: qualsiasi asset mancante o corrotto attiva istantaneamente il fallback ai 4 layer procedurali (`SkeletonLayer`, `VascularNeuroLayer`, `MusclesLayer`, `SkinLayer`) mostrando un badge informativo non bloccante `PROCEDURAL RIG ACTIVE (NO LOCAL .GLB INSTALLED)`.

---

## 4. Step-by-Step Implementation Checklist

- [ ] **Step 1 — Estensione Contratti TypeScript (`ares-cockpit/src/types/telemetry.ts`):**
  - Aggiungere `ModelValidationStatus`, `TtvIntervalKind`, `HrvUnavailableReason`, `ConformalGateStatus`, `CrystallizedPlaybookId`, `SafetyGatesState`, `CountermeasureAction`, `MonotoneQuantileTriplet`, `ChannelQuantileCone`, `AbstentionCertificate`, `HeatmapCellWire` ed estendere `ActivePlaybook`, `TimestralQuantilesSummary`, `HypergraphSpatialSummary`, `SafetyMargins` e `TelemetryPacket`.
- [ ] **Step 2 — Catalogo Playbook Deterministico (`ares-cockpit/src/lib/playbookCatalog.ts`):**
  - Creare `CRYSTALLIZED_PLAYBOOK_CATALOG` con i 5 Playbook (`#01`..`#05`) e `deriveOfflineActivePlaybook(whatIf, state, thrombusConfirmed)` allineati alle soglie e alle azioni di `crates/ares-medops-playbooks/src/playbooks.rs` e `safety_gates.rs`.
- [ ] **Step 3 — Validazione Runtime & Decoder Binario (`telemetryValidation.ts`, `binaryTelemetryDecoder.ts`, `scenario.ts`):**
  - Implementare `parseMonotoneQuantileTriplet`, `normalizeConformalGateStatus`, `normalizeTimestralQuantiles` (con guardia Issue `#11` su `BEAT_INTERVALS_NOT_AVAILABLE`), `normalizeActivePlaybook` (incluso `actions[]`) e `normalizeHypergraphSpatial` (incluso `cells[]` con `observed: boolean`).
  - Aggiornare `mergeBinaryFrameIntoPacket` in `binaryTelemetryDecoder.ts` affinche popoli `active_playbook` da `CRYSTALLIZED_PLAYBOOK_CATALOG` anche quando `prev.active_playbook === null` e normalizzi `FLAG_CONFORMAL_ABSTAINED` in `'ABSTAINED_FALLBACK_DETERMINISTIC'`.
  - Aggiornare `buildPacket` in `scenario.ts` per popolare `active_playbook` e `hypergraph_spatial` nel fallback `LOCAL_SIMULATION`.
- [ ] **Step 4 — Rifattorizzazione Live di `PlaybookRunner.tsx` e Pannello `ACT` in `App.tsx`:**
  - Sostituire i 2 playbook hardcoded in `PlaybookRunner.tsx` con il binding diretto a `packet.active_playbook` (`#01`–`#05`), catene causali ADHG, `actions: CountermeasureAction[]`, badge Gate 1/2/3 e conferma interattiva POCUS collegata a `POST /api/stress-test` / `apply_what_if_patch`.
  - Applicare `min-h-[44px] min-w-[44px]` a tutti i controlli interattivi su sfondo `#000000` OLED, rimuovere il banner passivo duplicato in `App.tsx` e aggiungere la card del **Gate 3** (`Martian 0.38g EVA Suit Ankle Damping`, `eva_suit_damping_active`) accanto a Gate 1 e Gate 2.
- [ ] **Step 5 — Coni Quantilici Multi-Orizzonte `Timestral` in `MriAndStl.tsx`:**
  - Implementare la vista `TIMESTRAL DHF (+15m, +1h, +6h, +24h)` con trasformazione logaritmica $\xi(\Delta t)$, poligono non-incrociante `[q05, q95]`, mediana `q50`, header `ConformalAbstentionGate` (`HEURISTIC_GATE_ACCEPTED` / `ABSTAINED_FALLBACK_DETERMINISTIC`), etichette obbligatorie Issue `#12` (`ILLUSTRATIVE_UNVALIDATED`, `ILLUSTRATIVE_SCENARIO_RANGE`) e guardia Issue `#11` (`BEAT_INTERVALS_NOT_AVAILABLE` quando `rmssd_ms_cone === null`), preservando il fallback `LOCAL_SIMULATION`.
- [ ] **Step 6 — Mapping Spaziale `UBERON:`, 6 Archi Diretti e Loader `.glb` Air-Gapped (`body-3d-heatmap/`):**
  - Creare `uberonSpatialMapping.ts` con la trasformazione affine $\Phi(\mathbf{c})$, la funzione colore $\mathcal{C}(I_i, O_i)$ (che distingue `observed === false` su `UBERON:0000948`) e i 6 archi diretti di `AnatomicalRegionSubgraph`.
  - Creare `NasaGlbAssetLayer.tsx` (`GLTFLoader.parse` + verifica `0x46546C67` + `GlbAssetErrorBoundary`) e `ares-cockpit/public/models/manifest.json` + `README.md` per le mesh locali `nasa/NASA-3D-Resources`.
  - Aggiornare `AnatomicalLayers.tsx`, `BodyHeatmap.tsx` e `App.tsx` per alimentare nodi emissivi, mesh anatomiche, 6 `QuadraticBezierLine` e l'inspector `UBERON:` / `biokg_clause` / `habitat_zone` direttamente da `packet.hypergraph_spatial`, con pulsanti `>= 44x44 pt`.
- [ ] **Step 7 — Verifica Statica, Unitaria ed End-to-End:**
  - Eseguire `npm --prefix ares-cockpit run lint`, `npm --prefix ares-cockpit run build`, la suite Vitest/Node e il probe completo `./scripts/agent_probe.sh --fast`, aggiornando `memory-bank/activeContext.md` e `memory-bank/progress.md`.

---

## 5. Deterministic Verification & Vitest/Playwright/TSC Tests

### 5.1 Gate Statico TypeScript & Bundle Air-Gapped (`TSC` + `Vite`)
```bash
npm --prefix ares-cockpit run lint     # tsc -b --noEmit (0 errori in strict mode)
npm --prefix ares-cockpit run build    # tsc -b && vite build (verifica bundle dist/ per Tauri v2)
```
- **Invariante verificato:** Zero `any` impliciti, zero import CDN esterni nel bundle generato `ares-cockpit/dist/assets/*.js`, piena compatibilita con la Content Security Policy `default-src 'self'; connect-src 'self' http://127.0.0.1:8080 ws://127.0.0.1:8080 ipc: http://ipc.localhost;` definita in `crates/ares-desktop-os/tauri.conf.json`.

### 5.2 Suite Deterministica Unitaria & Componenti (`Vitest` + `node --experimental-strip-types`)
Configurazione di `vitest` + `jsdom` + `@testing-library/react` in `ares-cockpit/vitest.config.ts` (affiancata da test di contratto puri eseguibili anche via `node --experimental-strip-types` in CI air-gapped senza browser):

1. **`ares-cockpit/src/modules/playbook-runner/__tests__/PlaybookRunner.live.test.tsx`:**
   - **Copertura dei 5 Playbook (`#01`–`#05`):** Inietta sequenzialmente `WireActivePlaybook` per `PLAYBOOK_01_VENOUS_STASIS_LBNP`, `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS`, `PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED`, `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION` e `PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS`, verificando il rendering di `title`, `actions[]`, `causal_chain_summary` e della modalita `FOLLOW LIVE ENGINE`.
   - **Verifica dei 3 Hard Clinical Safety Gates (`[V2 10027]`):**
     - Con `pocus_thrombus_confirmed: false` (`anticoagulant_lock_active: true`), verifica che `GATE 1 LOCKED` impedisca la conferma di qualsiasi azione anticoagulante.
     - Con `ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG` presente in `actions[0]`, verifica il banner prioritario `GATE 2 AUTO-VENT`.
     - Con `eva_suit_damping_active: true` (`GAI > 12%`), verifica il rendering di `GATE 3 ACTIVE` e dell'azione `ACT_EVA_SUIT_ANKLE_DAMPING_038G`.
   - **Conferma POCUS Bidirezionale & Touch Targets (`[V2 10022]`, `MIL-STD-1472H`):** Simula il click su `THROMBUS CONFIRMED`, verifica che `onConfirmPocusThrombus(true)` scatti esattamente una volta instradando il payload `pocus_thrombus_confirmed: true` verso `POST /api/stress-test` / `apply_what_if_patch`, e asserisce che ogni `<button>` interattivo possieda le classi ergonomiche `min-h-[44px]` e `min-w-[44px]`.

2. **`ares-cockpit/src/modules/mri-and-stl/__tests__/MriAndStl.timestral.test.tsx`:**
   - **Monotonicita Non-Incrociante su 4 Orizzonti:** Inietta un `NqsQuantileForecastSnapshot` con `channel_cones` (`+15m`, `+1h`, `+6h`, `+24h`) e verifica che i punti SVG generati rispettino $y_{\text{svg}}(q_{0.95}) \le y_{\text{svg}}(q_{0.50}) \le y_{\text{svg}}(q_{0.05})$ (asse Y invertito in coordinate SVG) e che triplette corrotte con $q_{0.05} > q_{0.50}$ vengano rigettate da `parseMonotoneQuantileTriplet` restituendo `null`.
   - **Invariante Issue `#11` (`BEAT_INTERVALS_NOT_AVAILABLE`):** Con `rmssd_ms_cone: null`, `rho_global_cone: null` e `hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE'`, verifica che selezionando `rmssd_ms` o `rho_global` compaia `BEAT_INTERVALS_NOT_AVAILABLE` senza alcun valore `0` o `0.0`, mentre selezionando `heart_rate_bpm` il cono `+15m..+24h` venga regolarmente visualizzato anche in `isPureReplay = true`.
   - **Invariante Issue `#12` (`MODEL_EVIDENCE_AUDIT.md`):** Verifica la presenza delle stringhe `ILLUSTRATIVE_UNVALIDATED` e `ILLUSTRATIVE_SCENARIO_RANGE`, la mappatura dell'alias legacy `'CALIBRATED_QUANTILE_CONE'` in `'HEURISTIC_GATE_ACCEPTED'`, e l'assenza totale nel DOM delle stringhe vietate `/95%\s*CI/i` e `/calibrated\s+probability/i`.

3. **`ares-cockpit/src/modules/body-3d-heatmap/__tests__/uberonSpatialAndGlb.test.ts`:**
   - **Esattezza Affine $\Phi$ e Ontologia `UBERON:`:** Verifica che `resolveUberonCells` mappi tutte le 5 regioni (`UBERON:0000970`, `UBERON:0001586`, `UBERON:0000948`, `UBERON:0001389`, `UBERON:0000955` — rifiutando o segnalando l'ID errato `UBERON:0001585`) alle quote anatomiche attese ($y_{\text{rig}} \in [-0.39, +1.66]$) e calcoli esattamente $F_{u \to v} = \operatorname{clamp}(w_{uv} L_u, 0, 1)$ su tutti i 6 archi di conduzione.
   - **Distinzione Visiva `observed: false` (Issue `#11`):** Verifica che una cella `HeartCardioAutonomic` (`UBERON:0000948`) con `local_intensity: 0.0` e `observed: false` riceva `statusTag === 'UNOBSERVED_NO_RR'` e colore `#6b7280` (mai il ciano nominale `#22d3ee`), e che con `propagated_intensity: 0.12` riceva `statusTag === 'PROPAGATED_ONLY'`.
   - **Guardia Binaria `.glb` contro SPA HTML Fallback:** Verifica che `hasValidGlbMagicHeader` accetti un header binario glTF v2 valido (`[0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, ...]`) e rifiuti immediatamente sia `<!doctype html>` (`0x6F64213C`) sia buffer troncati `< 12` byte, garantendo fallback deterministico a 0 eccezioni verso `AnatomicalLayers`.

### 5.3 Verifica End-to-End Browser & Certificazione Ergonomica HSI (`Playwright`)
File `ares-cockpit/e2e/phase29_cockpit_live.spec.ts` eseguito contro `cargo run -p ares-server-cli -- --mode ws-only` (`127.0.0.1:8080`) + `npm --prefix ares-cockpit run preview` (`127.0.0.1:4173`):

1. **`e2e_live_pocus_confirmation_unlocks_playbook_02_under_100ms_without_advancing_1hz_cursor`:**
   - Apre la fase `ACT`, verifica lo sfondo OLED `rgb(0, 0, 0)` (`[V2 10001]`), legge `T+{s}` nella `OsSystemStatusBar`, clicca `THROMBUS CONFIRMED` in `PlaybookRunner`, misura il tempo fino alla comparsa di `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS` e `GATE 1 OPEN` (`< 100 ms`, clausola `[V2 10022]`) e verifica che `RECORDED 1 HZ HISTORY` non abbia subito salti artificiali di cursore.
2. **`e2e_timestral_multi_horizon_cones_and_uberon_3d_inspector_preserve_issue_11_and_12`:**
   - Apre `EVALUATE -> 14-Day Safety Forecast`, verifica il rendering del cono `Timestral` `+15m / +1h / +6h / +24h` su `heart_rate_bpm`, seleziona `rmssd_ms` verificando il badge `BEAT_INTERVALS_NOT_AVAILABLE` e il badge `ILLUSTRATIVE_UNVALIDATED`.
   - Attiva `OVERLAY: ON`, apre `3D Body Layers`, seleziona il nodo `Internal Jugular Vein (UBERON:0001586)` e il nodo `Heart / Cardio-Autonomic (UBERON:0000948)`, verificando nel pannello dettagli la presenza del CURIE `UBERON:`, di `biokg_clause` e dello stato `UNOBSERVED (NO R-R)` per la componente autonomica locale.
3. **`e2e_zero_external_network_and_44pt_touch_targets_audit`:**
   - Intercetta `page.on('request')` asserendo che il `100%` degli URL appartenga a `127.0.0.1` (Invariant 1 Air-Gap) e misura `locator.boundingBox()` su tutti i pulsanti di controllo di `PlaybookRunner`, `MriAndStl` e `BodyHeatmap`, verificando `box.width >= 44 && box.height >= 44` (`MIL-STD-1472H` / `NASA-STD-3001 Vol. 2`).
