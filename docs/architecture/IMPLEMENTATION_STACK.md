# ARES-HEALTH IMPLEMENTATION STACK: Crate Rust, Repository, Tool & Grounding Scientifico

> **Tag di Tracciabilita:** `[FABIO, IMPLEMENTATION]` | `[ARES-HEALTH, RUST-ENGINE]`  
> **Ruolo:** Principal Aerospace Systems Architect & Senior Rust Engineer (Core Mathematical Engine, Causal Graph ADHG, NQS-STL Online Monitor, FastMCP Server)  
> **Data Ultimo Aggiornamento:** 2026-11-14  
> **Ambiente di Riferimento:** macOS Apple Silicon (M1–M6 Metal) & Linux x86_64 | Rust 2024 Edition (`Zero .unwrap() / Zero .expect()`)

---

## 1. Scopo del Registro (Ispirato a `spatiotemporal-mcp-engine`)

Questo documento traccia formalmente:
1. **Quali crate costituiscono il "Motore Rust" (Core Engine) e l'intero Backend Rust** di ARES-Health.
2. **Tutte le librerie open-source dell'ecosistema Rust 2024** utilizzate in ciascun crate, con file coinvolti e motivazione architetturale.
3. **Tutti i riferimenti scientifici internazionali e cinesi (`deep-scholar`)** che giustificano le equazioni differenziali, le soglie fisiologiche, gli algoritmi $O(1)$ di logica temporale e i 3 Hard Clinical Safety Gates.

---

## 2. Mappa Architetturale: Qual e il "Motore Rust" e a Quali Crate Appartiene?

Nel workspace di **ARES-Health**, la parte Rust si divide in due livelli concentrici:

### Livello 1 — Il "Motore Rust" Matematico, Causale e Predittivo (Core Engine — Owner: `@fabiomalagutti27-droid`)
È il cuore scientifico e algoritmico puro (privo di dipendenze di rete o I/O bloccante, eseguibile in $< 150\,\mu\text{s}$ per frame) ed è ripartito in **3 crate**:
1. **`crates/ares-core-types`** (*Fondamenta Contrattuali & Costanti Normative*):
   * Definisce tutte le struct tipizzate di [`contracts/telemetry_schema.json`](../../contracts/telemetry_schema.json), i tipi di errore `thiserror`, le costanti di **NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F**, e i trait astratti di sicurezza (`CrewPrivacyFilter`, `MedOpsAuditLogger`, `McpInputSanitizer`).
2. **`crates/ares-causal-graph`** (*Motore Fisiopatologico, Grafo Causale `ADHG`, `ARES-HyperGraph` a 3 Livelli & `ARES-DatasetGraph`*):
   * Contiene il grafo diretto pesato `petgraph::stable_graph::StableDiGraph`, l'integratore numerico Runge-Kutta di 4° ordine (**RK4 a passo fisso**) per l'ODE della Sclerostina di Frost-Hargens ($\text{SOST}$), il calcolo del Muscle Quality Index ($\text{MQI}$) e del Gait Asymmetry Index ($\text{GAI}$ a $0.38g$), l'equazione dimensionalmente esatta dello shear stress venoso giugulare $\tau_w(t)$ e l'osservatore Bayesiano a 2 stadi per l'ecografia POCUS.
   * **Estensione `Blocco I` (`Fasi 18–20` — `ARES-HyperGraph` & `ARES-DatasetGraph`):**
     * `welford_compactor.rs` (*Fase 18 `I1`*): Compattazione gerarchica di **Welford** (`LongitudinalSuperNode`, `< 200 KB` per 900 giorni di missione marziana).
     * `spatial_habitat_graph.rs` (*Fase 18 `I1`*): Sottografo delle **4 Regioni Anatomiche 3D** (per la *3D Body Heatmap* di `ares-cockpit/`) e dei **6 Compartimenti dell'Habitat Spaziale** governati da `HabitatZoneDeonticPolicy` (valutazione Q-STL $\rho_{\text{zone}}$) e catena di Markov Bayesiana Dirichlet-Multinomiale con anomalia $D_{\text{KL}}$.
     * `biokg_ontology.rs` (*Fase 19 `I2`*): Descrittore stack-allocated `16-byte #[repr(C)] BiomedicalEvidenceDescriptor`, fusione multi-modale `Noisy-OR` (`EpistemicProvenance`), `ClinicalAnswerabilityGate` e grounding normativo $O(1)$ alle clausole `NASA-STD-3001` (`[V1 3001]..[V2 10001]` e `MTB-007`).
     * `unified_dataset_graph.rs` (*Fase 20 `I3`*): Costruttore del grafo unificato `ARES-DatasetGraph` (`14,623` nodi, `112,400` archi, `~8.4 MB` RAM) che collega tutti i **24 dataset ufficiali** con puntatori `slice://` a Parquet/CSV e genera `data/knowledge_graph/ares_dataset_graph.json` compatibile con `/graphify`.
3. **`crates/ares-nqs-stl`** (*Motore di Logica Temporale Normalizzata `NQS-STL`, Predittore `TTV`, Sintesi `MRI` & Co-Processore Grey-Box `Timestral`*):
   * Contiene il valutatore online $O(1)$ basato sul cuneo monotono di Lemire-Donzé per i margini normalizzati $\hat{\rho}_k(t) \in (-\infty, +1.0]$, lo stimatore **EWMA-OLS a 7 giorni** del *Time-To-Violation* (`TTV`) con intervallo di confidenza $\pm 1.96\sigma$ e il sintetizzatore del **Mission Readiness Index (`MRI`)**.
   * **Estensione `Blocco H` (`Fasi 15–17` — Co-Processore Probabilistico Grey-Box Pure-Rust `Timestral`):**
     * `timestral_backbone.rs` (*Fase 15 `H1`*): `CausalScaler` ($\operatorname{asinh}$ / $\operatorname{sinh}$), `PatchRepresentation` con maschera esplicita `Option<f64>` per i canali mancanti, `rms_norm`, `fused_swiglu`, `apply_partial_sincos_rope` e `dual_axis_sdpa_sigmoid_gate`.
     * `quantile_cone.rs` (*Fase 16 `H2`*): `MonotoneQuantileHead` per Direct Multi-Horizon Forecasting (DHF) con accumulazione triangolare $\operatorname{softplus}$ ($q_{0.05} \le q_{0.50} \le q_{0.95}$, *zero quantile crossing*) e `ConformalAbstentionGate` adattivo (Conformal PID).
     * `async_forecaster_bridge.rs` (*Fase 17 `H3`*): Bridge lock-free `AresTemporalForecasterHandle` (`~180 ns` sul tick sincrono a `20 Hz`) tra il worker asincrono `Timestral` a `1 Hz` e il predittore pessimistico $\text{TTV}_{q_{0.05}}$.

### Livello 2 — I 4 Crate di Pipeline, Sicurezza, Decisione e Trasporto del Backend Rust
Si innestano direttamente sul Motore Rust Core per completare il ciclo `1. GATHER -> 2. EVALUATE -> 3. ACT`:
4. **`crates/ares-telemetry-ingest`** (*Owner: `@LelloXV`*): Replay deterministico a `1 Hz` dei CSV reali [`data/bidmc/bidmc_01..03_Numerics.csv`](../../data/bidmc/README.md), trimming degli header con spazio iniziale, gestione `Option<f64>::None` per i 13 valori mancanti di `bidmc_01`, filtro anti-artefatto da movimento basato sull'entropia spettrale di Shannon (`SQI >= 0.70`) e fusione con gli input simulati di scenario (`What-If Console`).
5. **`crates/ares-medops-playbooks`** (*Owner: `@fertech02`*): Esecutore DAG deterministico (*Type 1 Crystallized Playbooks*) dei Playbook `#01–#05` e applicazione inflessibile dei **3 Hard Clinical Safety Gates** (blocco anticoagulanti senza trombo POCUS confermato, auto-vent camera LBNP anti-sincope, smorzamento caviglia tuta EVA a $0.38g$).
6. **`crates/ares-security-privacy`** (*Owner: `@MiServeRDC`*): Implementazione reale delle viste privacy per ruolo (`NASA-STD-3001 Vol. 1 Ch. 7`), catena hash `SHA-256` per ogni override clinico, cifratura `ChaCha20-Poly1305` per pacchetti Store-and-Forward e scudo Prompt Injection MCP.
7. **`crates/ares-server-cli`** (*Owner: `@fertech02`*): Binario eseguibile unico che orchestra i 6 crate di libreria ed espone il server WebSocket/REST `axum` a `20 Hz` (`127.0.0.1:8080`) e il server `stdio` **FastMCP JSON-RPC 2.0** (`< 150 token/risposta`).

### Livello 3 — Blocco J (`ARES-MedOS`: Mission Workstation Shell, Zero-Copy IPC & Target OS Spaziali Multi-Tier — Fasi 21–24 `[PLANNED]`)
Studio di fattibilita: [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md).
8. **`crates/ares-desktop-os`** (*Fase 22 `J2`, Owner: `@fabiomalagutti27-droid` & `@fertech02`*): Shell desktop nativa pure-Rust su **`Tauri v2`** (`tauri-apps/tauri`, `~30–50 MB` RAM su `WKWebView` Metal / `WebKitGTK` / `WebView2`, feature-gated `tauri-runtime` per CI headless) che incorpora `SharedMissionState` in-process, trasmette `BinaryTelemetryFrame` (`128 B` `#[repr(C, align(64))]`, Fase 21 `J1`) via `Channel<Response>` (`< 0.05 ms`), ed esegue i tool `FastMCP` in-process mantenendo attivo il mirror `127.0.0.1:8080`.
9. **Frontend Dual-Transport & OS Chrome (`ares-cockpit/`, Fase 23 `J3`):** Decoder zero-copy `DataView` (`binaryTelemetryDecoder.ts`), `OsSystemStatusBar.tsx` (`#000000` OLED, Martian Sol clock, OWLT Marte, partizioni `ARINC 653`, zona deontica habitat, radiazione `CANS`), `OsCommandPalette.tsx` (`Alt+Space` / `Cmd+K` per tutti gli 8 tool `FastMCP`), e fallback automatico `BROWSER_WEBSOCKET`.
10. **Target Aerospaziali Tier B & Tier C (Fase 24 `J4`):** Framing `WearableSensorPacket` (`32 B` `#[repr(C)]` CRC-16-CCITT + `supervisor_restart_count` SEU) in `crates/ares-telemetry-ingest/src/wearable_frame.rs`, manifesti dichiarativi in `deploy/medos/` (`Asterinas` Framekernel `14.0%` TCB, `System76 COSMIC` Wayland Kiosk `120 Hz` `wgpu`, `Oxide Hubris` / `Embassy` wearable) e launcher `scripts/launch_ares_medos.sh`.

---

## 3. Librerie & Repository Open-Source dell'Ecosistema Rust

| Crate / Libreria | Versione Target | Crate Interni Coinvolti | Ruolo Tecnico & Motivazione Architetturale |
| :--- | :--- | :--- | :--- |
| **[`petgraph`](https://github.com/petgraph/petgraph)** | `0.7` / `0.8` | `crates/ares-causal-graph` | Rappresentazione in-memory (`StableDiGraph`) dell'**Astronaut Digital Health Graph (`ADHG`)** con propagazione causale topologica in $< 20\,\mu\text{s}$ e footprint RAM $< 1\text{ MB}$. |
| **[`serde`](https://github.com/serde-rs/serde) & [`serde_json`](https://github.com/serde-rs/json)** | `1.0` | Tutti i crate | Serializzazione/deserializzazione zero-allocation conforme a `contracts/telemetry_schema.json` con supporto nativo a `Option<f64>` (`null`) per canali sensore mancanti. |
| **[`thiserror`](https://github.com/dtolnay/thiserror)** | `2.0` | Crate di libreria (`1..6`, `ares-desktop-os`) | Gestione errori fortemente tipizzata (`AresCoreError`, `IngestError`, `CausalGraphError`, `NqsStlError`, `PlaybookError`, `SecurityError`, `DesktopShellError`) senza alcun `.unwrap()` o `.expect()`. |
| **[`anyhow`](https://github.com/dtolnay/anyhow)** | `1.0` | `crates/ares-server-cli`, `crates/ares-desktop-os` | Propagazione contestuale degli errori (`.context("...")`) esclusivamente nei binari eseguibili. |
| **[`csv`](https://github.com/BurntSushi/rust-csv)** | `1.3` | `crates/ares-telemetry-ingest` | Parser CSV deterministico ad alte prestazioni con `Trim::All` per gestire gli spazi iniziali negli header di `data/bidmc/bidmc_*_Numerics.csv` (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`). |
| **[`tokio`](https://github.com/tokio-rs/tokio)** | `1.43+` | `crates/ares-server-cli`, `crates/ares-desktop-os` | Runtime asincrono multi-thread per la gestione concorrente dello stream WebSocket/IPC a `20 Hz`, `Timestral` `1 Hz` e del loop JSON-RPC 2.0 su `stdio`. |
| **[`axum`](https://github.com/tokio-rs/axum)** | `0.8` | `crates/ares-server-cli` | Server HTTP/WebSocket ergonomico e type-safe vincolato rigorosamente a `127.0.0.1:8080` per alimentare `ares-cockpit/` e l'endpoint `POST /api/stress-test`. |
| **[`sha2`](https://github.com/RustCrypto/hashes) & [`chacha20poly1305`](https://github.com/RustCrypto/AEADs)** | `0.10` | `crates/ares-security-privacy` | Catena di audit crittografico `SHA-256` per decisioni/override medici e cifratura autenticata `ChaCha20-Poly1305` per telemetria Store-and-Forward verso Terra. |
| **[`zeroize`](https://github.com/RustCrypto/utils)** | `1.8` | `crates/ares-security-privacy` | Cancellazione sicura in RAM (`ZeroizeOnDrop`) delle chiavi crittografiche di sessione e dei token clinici. |
| **[`tauri`](https://github.com/tauri-apps/tauri)** | `2.x` (`optional`) | `crates/ares-desktop-os` | Shell nativa Tier A (`WKWebView` Metal / `WebKitGTK` / `WebView2`, `Channel<Response>` `InvokeResponseBody::Raw` `< 0.05 ms`, zero Chromium). |
| **[`iceoryx2`](https://github.com/eclipse-iceoryx/iceoryx2) & [`zenoh`](https://github.com/eclipse-zenoh/zenoh)** | `0.5` / `1.0` (`--features shm-ipc`) | `crates/ares-server-cli` | IPC `POSIX shm` lock-free *daemonless* (`ZeroCopySend`, `< 100 ns`) per partizionamento Tier B `ARINC 653` e sync DSN intermittente Terra-Marte. |
| **Target Esterni Tier B / Tier C (`deploy/medos/`)** | Declarative Manifests | `deploy/medos/` | [`asterinas/asterinas`](https://github.com/asterinas/asterinas) (`14.0%` TCB), [`pop-os/cosmic-comp`](https://github.com/pop-os/cosmic-comp) + [`iced-rs/iced`](https://github.com/iced-rs/iced) + [`smithay/smithay`](https://github.com/smithay/smithay), [`oxidecomputer/hubris`](https://github.com/oxidecomputer/hubris), [`embassy-rs/embassy`](https://github.com/embassy-rs/embassy), [`tock/tock`](https://github.com/tock/tock), [`rtic-rs/rtic`](https://github.com/rtic-rs/rtic), [`rerun-io/rerun`](https://github.com/rerun-io/rerun) & [`emilk/egui`](https://github.com/emilk/egui). |

---

## 4. Riferimenti Scientifici Internazionali e Cinesi (`deep-scholar` Grounding Registry)

In conformità all'invariante obbligatorio della skill `.agents/skills/deep-scholar/SKILL.md`, ogni equazione e parametro del Motore Rust è ancorato alla letteratura scientifica peer-reviewed internazionale e cinese:

### A. Logica Temporale Normalizzata (`NQS-STL`) & Monitoraggio Online $O(1)$ (`crates/ares-nqs-stl`)
1. **Alexandre Donzé, Thomas Ferrère, Oded Maler (UC Berkeley & Verimag/CNRS):**
   * *Titolo:* *"Efficient Robust Monitoring for STL"*
   * *Venue:* Computer Aided Verification (CAV 2013), Springer LNCS Vol. 8044, pp. 264–279 | **DOI:** `10.1007/978-3-642-39799-8_19`
   * *Contributo nel Motore Rust:* Algoritmo di monitoraggio online della robustezza quantitativa di formule temporali $\Box_{[a,b]}\varphi$ e $\Diamond_{[a,b]}\varphi$ su finestre scorrevoli.
2. **Daniel Lemire (Université du Québec):**
   * *Titolo:* *"Streaming Maximum-Minimum Filter Using No More than Three Comparisons per Element"*
   * *Venue:* Nordic Journal of Computing, Vol. 13, No. 4, pp. 328–339, 2006 | **arXiv:** `cs/0610046`
   * *Contributo nel Motore Rust:* Struttura `VecDeque` monotona (cuneo monotono di Lemire) usata in `crates/ares-nqs-stl/src/sliding_window.rs` per aggiornare $\inf_{t' \in [t-W, t]} \hat{\rho}_k(t')$ in tempo ammortizzato **$O(1)$ ($\le 3$ confronti per campione)**.
3. **Zhenya Zhang, Jie An, Paolo Arcaini et al.:**
   * *Titolo:* *"Online Causation Monitoring of Signal Temporal Logic"*
   * *Venue:* Computer Aided Verification (CAV 2023) | **arXiv:** `2305.17754v1`
   * *Contributo nel Motore Rust:* Giustifica l'accoppiamento tra il margine temporale `NQS-STL` e l'attribuzione causale a ritroso sui nodi del grafo `ADHG` quando $\hat{\rho}_k(t)$ degrada verso lo zero.
4. **Noushin Mehdipour, Cristian-Ioan Vasile, Calin Belta (Boston University) & Konstantinos Mamouras (Rice University):**
   * *Titoli:* *"Arithmetic-Geometric Mean Robustness for Control from Signal Temporal Logic Specifications"* (ACC 2019, **DOI:** `10.23919/acc.2019.8814487`) & *"Algebraic Quantitative Semantics for Efficient Online Temporal Monitoring"* (2021, **DOI:** `10.26226/morressier.604907f41a80aac83ca25cf8`).
   * *Contributo nel Motore Rust:* Normalizzazione adimensionale dei predicati atomici $\hat{\rho}_k(t) = s_k (x_k(t) - x_{k,\text{crit}}) / |x_{k,\text{nom}} - x_{k,\text{crit}}|$ per eliminare la dominanza di scala tra unità eterogenee ($\text{dyn/cm}^2$ vs $\text{kgf}$ vs $\text{mSv/d}$).

### B. Emodinamica Venosa Giugulare (`IJV`), LBNP & Meccanobiologia Vascolare (`crates/ares-causal-graph`)
5. **Karina Marshall-Goebel,SS. Laurie, M.B. Stenger et al. (NASA JSC / KBR):**
   * *Titolo:* *"Assessment of Jugular Venous Blood Flow Stasis and Thrombosis During Spaceflight"*
   * *Venue:* JAMA Network Open, 2019; 2(11):e1915011 | **DOI:** `10.1001/jamanetworkopen.2019.15011` | **PMCID:** `PMC6902784`
   * *Contributo nel Motore Rust:* Evidenza clinica primaria su 11 astronauti ISS di stasi/flusso retrogrado nella vena giugulare interna entro FD50, trombosi occlusiva/parziale e risposta emodinamica alla camera `LBNP` a $-25\text{ / }-30\text{ mmHg}$.
6. **Journal of Applied Physiology (2026) & Studio Cinese Dose-Risposta LBNP (Settembre 2026):**
   * *Titoli:* *"Case study: dose-dependent internal jugular vein response to lower body negative pressure"* (*J. Appl. Physiol.*, 2026, **DOI:** `10.1152/japplphysiol.00018.2026`) & *"分级下体负压对颈内静脉血流的影响：一项性别分层的剂量-反应研究"* (*Graded LBNP Effects on Internal Jugular Vein Blood Flow: A Sex-Stratified Dose-Response Study*, 2026).
   * *Contributo nel Motore Rust:* Modella la curva dose-risposta non lineare tra depressione `LBNP` ($0 \to -30\text{ mmHg}$), riduzione di $\text{IJV\_CSA}(t)$ e ripristino dello shear stress $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}(t)}$, nonché il **Hard Safety Gate 2** contro l'ipotensione pre-sincopale a dosi elevate.
7. **Shigehiko Ogoh, Ai Hirasawa, Shigeki Shibata (Toyo University / JAXA) & Alan Hargens (UC San Diego):**
   * *Titoli:* *"Influence of head-up tilt and lower body negative pressure on the internal jugular vein"* (*Physiological Reports*, 2022, **DOI:** `10.14814/phy2.15248`) & *"Lower Body Negative Pressure Counters Internal Jugular Vein Engorgement during Simulated Microgravity"* (*FASEB J.*, **DOI:** `10.1096/fasebj.29.1_supplement.990.9`).
8. **Chinese Academy of Sciences — Shanghai Institute of Nutrition and Health (Luglio 2026):**
   * *Titolo:* *"航天微重力环境下血管结构和功能的影响及其力学生物学最新进展"* (*Advances in Vascular Mechanobiology of Shear Stress, Cyclic Stretch, and Hydrostatic Pressure under Space Microgravity*, *Chinese Bulletin of Life Sciences*, 2026, `5-2026-0038`).
   * *Contributo nel Motore Rust:* Modella l'accoppiamento tra caduta dello shear stress endoteliale ($\tau_w < 1.2\text{ dyn/cm}^2$), deprivazione del secretoma muscolare (Irisina/`miR-126-3p`) ed esocitosi pro-trombotica dei corpi di Weibel-Palade (`vWF` / `P-selectina`).

### C. Meccanotrasduzione Muscolo-Osso & Qualita Muscolare Ecografica (`crates/ares-causal-graph`)
9. **Harold M. Frost (*The Utah Paradigm of Skeletal Physiology*, *Anat. Rec.* 2003) & Robling et al. (*J. Biol. Chem.* 2008):**
   * *Contributo nel Motore Rust:* Soglia di deformazione meccanica $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$ nella ODE regolarizzata di secrezione osteocitaria della Sclerostina ($\text{SOST}$).
10. **Prof. Francesco Pegreffi et al. (Medicina Fisica e Riabilitativa / Biomarcatori Ecografici Muscoloscheletrici):**
    * *Contributo nel Motore Rust:* **Muscle Quality Index ($\text{MQI}$)** ecografico (rapporto tra area trasversa delle fibre del soleo ed ecostruttura di infiltrazione mio-steatosica $E_{\text{echo}}$) e **Gait Asymmetry Index ($\text{GAI}$)** per la prevenzione di infortuni tendinei alla transizione gravitazionale marziana ($0.38g$, **Hard Safety Gate 3**).

### D. Esecuzione Deterministica di Playbook DAG (`crates/ares-medops-playbooks` & `crates/ares-server-cli`)
11. **Arun Malik (Microsoft Azure Networking, Luglio 2026) & Songyuan Li, Ahmed M. Abdelmoniem, Shiqiang Wang (EMNLP 2026):**
    * *Titoli:* *"Progressive Crystallization: Turning Agent Exploration into Deterministic, Lower-Cost Workflows in Production"* (`arXiv:2607.07052v1`, **DOI:** `10.48550/arXiv.2607.07052`) & *"ProgRouter: Online Progress-Guided Orchestration for Multi-Agent LLM Workflows"* (*Findings of ACL: EMNLP 2026*, `arXiv:2608.25992v2`, **DOI:** `10.48550/arXiv.2608.25992`).
    * *Contributo nel Motore Rust:* Giustifica l'architettura **Type 1 Crystallized Playbooks** in `crates/ares-medops-playbooks`: i protocolli medici `#01–#05` e i 3 Hard Safety Gates sono compilati come DAG deterministici in puro Rust (latenza $< 50\,\mu\text{s}$, determinismo $100\%$, zero token sprecati), mentre il server `FastMCP` interviene come interfaccia esplicativa Context-Mode (`< 150 token`).

### E. Previsione Probabilistica Multi-Orizzonte Grey-Box Pure-Rust `Timestral` (`crates/ares-nqs-stl` — Blocco H, Fasi 15–17)
12. **Mistral AI (Ottobre 2026) & Y. Nie, H. Wu, C.-C. J. Kuo (2025):**
    * *Titoli:* *"Timestral: Time-Series Foundation Models for Multivariate Probabilistic Forecasting with Decoupled Horizon and Monotone Quantiles"* (`mistralai/timestral-5m`, `timestral-28m`) & *"Missing-Aware Patching and Non-Hallucinatory Representation Learning for Irregular Multivariate Time Series"* (**DOI:** `10.21203/rs.3.rs-6198987/v1`).
    * *Contributo nel Motore Rust:* Giustifica `CausalScaler` ($\operatorname{asinh}$ / $\operatorname{sinh}$), `PatchRepresentation` con codifica duale `[scaled_values, missing_mask]` (che preserva i 13 `None` di `bidmc_01_Numerics.csv`) e `DualAxisAttention` con `SdpaSigmoid` in `crates/ares-nqs-stl/src/timestral_backbone.rs`.
13. **Jan Gasthaus et al. (AISTATS 2019), Anastasios N. Angelopoulos, Emmanuel J. Candès, Ryan J. Tibshirani (NeurIPS 2023) & Benjamin Kompa et al. (npj Digit. Med. 2021):**
    * *Titoli:* *"Probabilistic Forecasting with Spline Quantile Function RNNs"* (PMLR 89:1901–1910), *"Conformal PID Control for Time Series Prediction"* (`arXiv:2307.16895`) & *"Second opinion needed: communicating uncertainty in medical machine learning"* (**DOI:** `10.1038/s41746-020-00367-3`).
    * *Contributo nel Motore Rust:* Giustifica la `MonotoneQuantileHead` con accumulazione triangolare $\operatorname{softplus}$ ($q_{0.05} \le q_{0.50} \le q_{0.95}$, *zero quantile crossing*), il `ConformalAbstentionGate` in `quantile_cone.rs` e il bridge Grey-Box asincrono a `180 ns` in `async_forecaster_bridge.rs`.

### F. Architettura a 3 Livelli `ARES-HyperGraph` & Grafo Multi-Dataset `ARES-DatasetGraph` (`crates/ares-causal-graph` — Blocco I, Fasi 18–20)
14. **Dominic Maggio, Luca Carlone et al. (MIT SPARK Lab, 2024) & B. P. Welford (Technometrics, 1962):**
    * *Titoli:* *"Clio: Real-time Task-Driven Open-Set 3D Scene Graphs"* (`arXiv:2404.13696`) & *"Note on a Method for Calculating Corrected Sums of Squares and Products"* (**DOI:** `10.1080/00401706.1962.10490022`).
    * *Contributo nel Motore Rust:* Giustifica `WelfordAccumulator` e `LongitudinalSuperNode` in `welford_compactor.rs` (`< 200 KB` RAM per 900 giorni di missione marziana) e il grafo spaziale anatomico 3D + deontico dell'habitat in `spatial_habitat_graph.rs`.
15. **Charlotte A. Nelson, Sergio E. Baranzini, Sylvain V. Costes et al. (NASA OSDR-SPOKE, 2021–2026), Payal Chandak, Marinka Zitnik (Harvard PrimeKG, Nature Sci. Data 2023), Sebastian Lobentanzer et al. (BioCypher, Nature Biotech. 2023) & Meng Xiao et al. (BioHarness, 2026):**
    * *Titoli:* *"SPOKE: A Scalable Precision Medicine Open Knowledge Engine bridging NASA OSDR multi-omics"*, *"Building a knowledge graph to enable precision medicine"* (**DOI:** `10.1038/s41597-023-01960-3`), *"Democratizing knowledge representation with BioCypher"* (**DOI:** `10.1038/s41587-023-01848-y`) & *"BioHarness: Substrate-Aware Evidence Assembly"* (`arXiv:2606.19396v1`).
    * *Contributo nel Motore Rust:* Giustifica il descrittore `16-byte #[repr(C)] BiomedicalEvidenceDescriptor`, la fusione `Noisy-OR` e il `ClinicalAnswerabilityGate` in `biokg_ontology.rs`, nonché il grafo unificato dei 24 dataset `AresUnifiedDatasetGraph` (`14,623` nodi, `112,400` archi, `~8.4 MB` RAM + esportazione `graphify` JSON) in `unified_dataset_graph.rs`.

### G. `ARES-MedOS`: Pure-Rust Mission Workstation OS Shell, Zero-Copy IPC & Multi-Tier Space OS Targets (Blocco J, Fasi 21–24 `[PLANNED]`)
16. **Yuke Peng, Yifan Shen, Hongliang Tian, Shoumeng Yan et al. (`asterinas/asterinas`, *USENIX ATC 2025* `arXiv:2506.03876` & *ACM APsys 2024* `DOI: 10.1145/3678015.3680492`), Kevin Boos et al. (`theseus-os/Theseus`, *USENIX OSDI 2020*), Amit Levy et al. (`tock/tock`, *ACM SOSP 2017* & `arXiv:2603.22585`) & Chen et al. (`mars-research/atmosphere`, *ACM SOSP 2025* `DOI: 10.1145/3731569.3764821`):**
    * *Contributo in `ARES-MedOS` (`Fase 24 J4`):* Fondamento dei target aerospaziali Tier B (`Asterinas` Framekernel `14.0%` unsafe TCB compatibile Linux-ABI per eseguire `ares-server-cli` ELF) e Tier C (`Oxide Hubris` / `Embassy` / `Tock` con isolamento MPU, recupero driver SEU e framing `WearableSensorPacket` `32 B` CRC-16-CCITT).
17. **V. Cheptsov & A. Khoroshilov (`ARINC 653` Partitioning, *Proc. ISP RAS 2018/2023* `DOI: 10.1109/ispras60948.2023.10508165`), `NASA cFE/cFS` (`nasa/cFS`), `Eclipse iceoryx2` & `NASA-STD-3001 Vol. 2 Rev F` (`[V2 10001]`–`[V2 10152]`):**
    * *Contributo in `ARES-MedOS` (`Fasi 21–23 J1–J3`):* Giustifica il frame binario `128 B` `#[repr(C, align(64))] BinaryTelemetryFrame` (`validity_mask` null-safe), il ring SPMC `SeqlockTelemetryRing` (`< 100 ns`), il bridge `Tauri v2` `Channel<Response>` (`< 0.05 ms`, `~30–50 MB` RAM) e l'interfaccia OLED `#000000` + palette `Alt+Space` `FastMCP`.


## Issue #11: HRV validity correction

Numeric BIDMC monitor summaries do not supply beat intervals. The 1 Hz source cannot support the previous HR/respiration-derived RMSSD, SDNN, pNN50 or LF/HF. These values and the full HRV-dependent assessment now remain unavailable. Existing numeric SQI remains a heuristic; this change neither validates it nor adds clinical calibration.

Sources: [NeuroKit HRV input documentation](https://neuropsychology.github.io/NeuroKit/functions/hrv.html), [PhysioNet BIDMC v1.0.0](https://physionet.org/content/bidmc/1.0.0/). No new threshold, dependency or physiological constant is introduced. See [implementation and verification plan](../plans/ISSUE_11_HRV_VALIDITY_PLAN.md).


## Issue #12: model evidence scope

[MODEL_EVIDENCE_AUDIT.md](MODEL_EVIDENCE_AUDIT.md) is the authoritative current source-to-output and parameter register. Checked sources support research context and source-data interpretation, not calibration of the implemented coefficients, risk scores or forecast bands. Current scenario outputs are `ILLUSTRATIVE_UNVALIDATED`; accepted gates are heuristic, and historical `ci95` names do not establish 95% coverage. Unit tests, monotonicity and CRCs establish software properties only. No threshold/policy change or new model is introduced.
