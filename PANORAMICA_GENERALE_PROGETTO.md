# PANORAMICA GENERALE DEL PROGETTO: ARES-Health

> Evidence status (issue #12): scenario-derived physiology, risk/readiness scores and forecast ranges are illustrative and clinically unvalidated. Historical calibration, certification, universal-threshold and outcome claims below are not established. Use [the current evidence audit](docs/architecture/MODEL_EVIDENCE_AUDIT.md) for source applicability, parameters and permitted wording. Recorded terrestrial measurements remain distinct from simulation.
## Master Blueprint Unificato per il Team (NASA Space Apps Challenge 2026)

**Progetto:** ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health)  
**Lead Architect:** Fabio Malagutti (Ingegnere Informatico • Laureando Magistrale @ Università di Bologna)  
**Sfida Ufficiale NASA:** "Create Health Monitoring Software for Astronauts on Space Missions"  
**URL Ufficiale:** https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/  
**Ambiente di Missione:** Transito Terra-Marte, Deep Space Habitat, Lunar Gateway, Superficie Marziana  
**Modalità Operativa:** 100% Offline, Esecuzione Edge Deterministica, Air-Gapped, Zero Dipendenze Cloud  

---

## 1. In Cosa Consiste il Progetto (La Visione in Breve)

ARES-Health è una piattaforma software medica edge-native per astronauti in missioni nello spazio profondo, progettata per operare in completa autonomia a bordo della navicella.

* **Il Problema Reale (Il Muro della Velocità della Luce):**  
  Sulla ISS gli astronauti comunicano in tempo reale con i medici di Houston. Verso Marte il segnale radio impiega da **8 a 48 minuti andata e ritorno** (con blackout fino a 14 giorni durante le congiunzioni solari). La telemedicina terrestre e i cloud convenzionali (AWS, OpenAI, Google Cloud) sono fisicamente inservibili.
* **La Nostra Soluzione:**  
  ARES-Health porta la mente del Flight Surgeon a bordo: un motore software autonomo in Safe Rust che raccoglie i dati fisiologici, valuta il decondizionamento complessivo tramite un grafo causale e guida l'astronauta in protocolli clinici esecutivi (Playbook).
* **Il Mandato Ufficiale della Traccia:**  
  La traccia NASA richiede tre azioni imperative: **GATHER** (raccogliere), **EVALUATE** (valutare) e **ACT** (agire).

---

## 2. Architettura Funzionale a 3 Fasi: Gather, Evaluate, Act

### Fase 1: GATHER (Acquisizione Dati a Basso Carico per l'Equipaggio)
* **Radar Notturno Contactless (Crew Quarters):**  
  Monitoraggio della frequenza cardiaca a riposo e della frequenza respiratoria durante il sonno tramite micro-radar RF / Wi-Fi CSI (Channel State Information), senza sensori adesivi a contatto con la pelle.  
  *Vantaggio:* Elimina le dermatiti da contatto e l'insofferenza da monitoraggio h24.
* **Biosegnali Indossabili con Filtro SQI:**  
  Acquisizione di ECG, fotopletismografia (PPG) e attività muscolare filtrati con algoritmi di Signal Quality Index (SQI) basati su entropia spettrale per scartare gli artefatti da sudore fluttuante e movimento in microgravità.
* **Biomarcatori Omici e Point-of-Care (POC):**  
  Integrazione di test capillari da puntura del dito (Abbott i-STAT / rHEALTH) per tracciare biomarcatori di danno tissutale (Troponina I, Sclerostina, Irisina, cf-mtDNA).

### Fase 2: EVALUATE (Motore Analitico Edge Deterministico in Rust)
* **Dynamic Multi-Organ Bio-Causal Graph (ADHG):**  
  Supera i cruscotti tradizionali che mostrano grafici slegati tra loro. Collega le variabili di cabina e l'assenza di peso a una cascata fisiopatologica interconnessa:
  * Atrofia del muscolo soleo/gastrocnemio $\to$
  * Crollo dell'Irisina circolante $\to$
  * Iperattivazione della Sclerostina ossea (modello Frost-Hargens) $\to$
  * Osteopenia accelerata (calcagno e vertebre L1-L4) con ipercalciuria renale $\to$
  * Collasso della capacitanza venosa crurale e perdita di secretoma vasoprotettivo (miR-126) $\to$
  * Ristagno e stasi nella vena giugulare interna (IJV) con rischio di trombosi venosa occlusiva ($\tau_w < 4.0\text{ dyn/cm}^2$).
* **Normalized Quantitative Signal Temporal Logic (NQS-STL):**  
  Sostituisce le soglie fisse (che causano falsi allarmi durante l'esercizio) con formule temporali matematiche. Adimensionalizza ogni parametro su una scala uniforme $\hat{\rho} \in (-\infty, +1.0]$:
  * $\hat{\rho} > 0$: margine di sicurezza clinica;
  * $\hat{\rho} \le 0$: violazione della soglia critica;
  * Derivata temporale $\langle \dot{\rho} \rangle_{7\text{d}}$: stima del tempo residuo al collasso (Time-To-Violation, TTV) con 11-14 giorni di anticipo.
* **Osservatore Bayesiano a Due Stadi (POCUS Episodico):**  
  Poiché le ecografie non si fanno h24 ma settimanalmente, il sistema stima in continuo le variabili latenti (velocità giugulare, diametro del nervo ottico ONSD, qualità muscolare) allargando una banda di incertezza $\pm \sigma(t)$. All'esecuzione dell'ecografia di 2 minuti, la banda si contrae a zero ($\sigma \to 0$).
* **Mission Readiness Index (MRI 0–100):**  
  Indice sintetico globale di prontezza operativa (idoneità a EVA e manovre critiche).

### Fase 3: ACT (Interfaccia Cockpit e NASA MedOps Playbook Runner)
* **Cockpit OLED Dark-Mode:**  
  Interfaccia a contrasto elevato con manichino 3D del corpo umano (WebGL/Three.js) che colora le aree corporee in base al decondizionamento.
* **Console Interattiva What-If Stress-Test:**  
  Quattro slider in tempo reale (ppCO2 cabina, carico ARED, pressione LBNP, giorno di missione) per dimostrare alla giuria che il motore ricalcola la risposta clinica in meno di 1 millisecondo.
* **Runner dei Playbook Operativi (DAG) con Hard Clinical Safety Gates:**
  * **Playbook #04 (Stasi Giugulare e Decondizionamento):** Guida ecografica POCUS assistita sul collo; **divieto assoluto di anticoagulanti empirici** se non c'è un trombo confermato (per prevenire emorragie intracraniche letali da trauma); attivazione camera a pressione negativa LBNP a $-30\text{ mmHg}$ per 45 min con **blocco anti-sincope automatico** (sfiato a 0 mmHg se la pressione sistolica scende di 15 mmHg); ricalibrazione carico eccentrico ARED (+15%) e supplementazione con Leucina e Citrato di Potassio.
  * **Playbook #05 (Stabilità del Cammino allo Sbarco su Marte a 0.38g):** Calcolo del Gait Asymmetry Index (GAI) tramite sensori della tuta per prevenire cadute o lesioni articolari alla transizione gravitazionale.
* **AI Copilot Locale (FastMCP):**  
  Assistente di bordo offline che risponde a voce o testo interrogando il grafo deterministico tramite macro-tool compatti (< 150 token), garantendo l'assoluta assenza di allucinazioni mediche.

---

## 3. Matrice delle Fonti: Da Dove Proviene Ogni Decisione Scientifica

| Componente di ARES-Health                  | Decisione Fisiologica / Clinica Adottata                                                                                            | Articolo / Fonte Scientifica di Riferimento                                                  |
| :----------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **Stasi Venosa Giugulare**                 | Monitoraggio del flusso lento ($v_{\max} < 5\text{ cm/s}$) e del rischio di trombosi venosa occlusiva                               | **Dr. Serena Auñón-Chancellor** (NASA Flight Surgeon, *JAMA 2019* / *NEJM 2020*)             |
| **Sindrome SANS e Pressione Oculare**      | Monitoraggio del diametro della guaina del nervo ottico ($\text{ONSD} > 5.8\text{ mm}$) e correlazione con $ppCO_2$                 | **Dr. Michael Barratt** (NASA Flight Surgeon/Astronauta, *Springer 2020*)                    |
| **Supporto Decisionale Autonomo**          | Architettura di medicina indipendente dalla Terra per missioni esplorative (EIMO)                                                   | **Dr. Emmanuel Urquieta** (TRISH / Baylor College of Medicine)                               |
| **Standard di Prontezza e Requisiti ExMC** | Standard medici di esplorazione NASA-STD-3001 e diagnostica Point-of-Care a basso volume                                            | **Dr. James Polk** (Chief Health & Medical Officer NASA)                                     |
| **Biomarcatori Molecolari e cf-mtDNA**     | Mappatura del danno tissutale via cell-free RNA e DNA mitocondriale circolante                                                      | **Prof. Christopher Mason et al.** (*Nature SOMA Package 2024*, Inspiration4)                |
| **Shear Stress Endoteliale ($\tau_w$)**    | Soglia critica pro-trombotica venosa $\tau_w < 4.0\text{ dyn/cm}^2$ sotto scarico gravitazionale                                    | **Bisserier et al.** (*npj Microgravity 2026*)                                               |
| **Dose-Risposta Decompressione LBNP**      | Protocollo a dose calibrata di $-30\text{ mmHg}$ per $45\text{ min/die}$ per ripristinare il flusso giugulare                       | **Pappas et al.** (*Journal of Applied Physiology 2026*) & **NASA OCHMO MTB-007 (2026)**     |
| **Asse Funzionale Muscolo-Osso**           | Il disuso spegne il *mechanostat* ($\varepsilon < 1000\ \mu\varepsilon$); il calo di irisina accelera la sclerostina                | **Al-Nuaimi & Hargens (2025/2026)**; Letteratura su Unità Muscolo-Osso (*EJAP 2026*)         |
| **Qualità Muscolare ed Ecografia POCUS**   | Indice ecografico $\text{MQI}$ basato su spessore soleo ($\text{MT}$), angolo di pennazione ($\theta_{\text{penn}}$) ed ecogenicità | **Letteratura di Imaging Riabilitativo e Sarcopenia** (*J. Clin. Med. 2023*, *JCSM 2024*)    |
| **Preabilitazione e Nutrizione**           | Condizionamento pre-volo con Leucina e Vitamina D per costruire riserva funzionale ($PRF_0$)                                        | **Studi Clinici di Preabilitazione Muscolare** (*Nutrients 2024*, *Scientific Reports 2026*) |
| **Stabilità del Cammino a 0.38g**          | Alterazioni cinematiche, valgo dinamico e rischio di caduta al rientro su gravità parziale                                          | **Biomeccanica del Cammino e Fisiologia Articolare** (*Eur. J. Appl. Physiol. 2025*) & **NASA NLSP `BRSMFSR`** |
| **Archivio Federato Multi-Agenzia OSDR**   | Calibrazione congiunta multi-omica (`cgene`), fisiologica (`alsda`) e bed-rest (`esa`: `OSD-51`, `OSD-195`, `OSD-570/571`, `OSD-818`) | **NASA Open Science Data Repository** (`https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study`) |
| **Esperimenti Analoghi & Epidemiologia**   | Riflesso da stiramento (`BRSMFSR`), risposta neuroendocrina al tilt (guardrail LBNP) e recupero osseo DXA/FRAX post-volo (`LSAH`)    | **NASA Life Sciences Portal (`NLSP` / `NASA-0000100`) & `LSAH`** (`https://nlsp.nasa.gov/explore?dataType=EXPERIMENTS...`, `https://nlsp.nasa.gov/resources/lsah`) |
| **Standard Tecnici Ufficiali NASA**        | Requisiti obbligatori di salute equipaggio (`[V1 3001]–[V1 4001]`) e fattori umani/trend ambientali (`[V2 6001]–[V2 10001]`)         | **NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F (Jul 2026)** (`https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1`, `VOL_2`) |
| **Analoghi Marte/Isolamento & Commercial** | Validazione ritardo 22 min (378d Marte `CHAPEA`), biomarcatori vocali/sonno (`HERA`), POCUS (`TRISH EXPAND`) e Alendronato (`JAXA`) | **NASA `CHAPEA`, `HERA`, `DLR :envihab AGBRESA`, `TRISH EXPAND` (Mar 2026), `NASA-JAXA Bisphosphonates`, `PhysioNet CEBS` & `PPG-DaLiA`** |

---

## 4. Matrice delle Tecnologie: Quale Repository Open Source Importiamo

Nel pieno rispetto della regola del **Fresh Code** dell'hackathon, non copiamo codice applicativo di altri: importiamo le seguenti librerie open source ufficiali come dipendenze standard (`Cargo.toml`, `requirements.txt`, `package.json`):

| Dominio Tecnologico            | Nome Repository / Libreria GitHub                                       | Ruolo Specifico in ARES-Health                                                             | File di Riferimento nel Nostro Codice                  |
| :----------------------------- | :---------------------------------------------------------------------- | :----------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **Formal Verification (STL)**  | **`mstlo` (Mistletoe)** (Rust crate, arXiv 2026) & **`nickovic/rtamt`** | Calcolo ad altissima velocità del margine continuo di robustezza temporale $\hat{\rho}(t)$ | Dipendenza in `Cargo.toml` $\to$ modulo `src/stl.rs`   |
| **DSP dei Biosegnali**         | **`neuropsychology/NeuroKit2`** (Python, MIT)                           | Estrazione onde R-peak, indici HRV (RMSSD, LF/HF) e frequenza respiratoria da ECG          | Script di preprocessing e generazione dati di test     |
| **Dataset Clinici Waveform**   | **`wfdb-python`** (PhysioNet official library)                          | Ingestione e riproduzione di segnali elettrofisiologici reali di validazione               | Pipeline di test telemetrico                           |
| **Radar Contactless CSI**      | **`Lu2024-project/ESP32-CSI`** & **`ruvnet/RuView`**                    | Algoritmi di estrazione Doppler da sottoportanti RF per battito e respiro a riposo         | Modulo driver di simulazione radar cabina              |
| **Dataset Multi-Omici Spazio** | **`nasa/GeneLab`** & **NASA OSDR APIs**                                 | Curve di riferimento per Troponina I, Sclerostina, Irisina e cf-mtDNA                      | Driver dati di laboratorio di bordo                    |
| **Topologia del Grafo**        | **`petgraph`** (Rust community standard)                                | Gestione in memoria della rete di nodi e archi del grafo causale ADHG                      | Dipendenza in `Cargo.toml` $\to$ modulo `src/graph.rs` |
| **Server Concorrente UI**      | **`tokio`** + **`axum`** (Rust ecosystem)                               | Streaming WebSocket a 20 Hz verso il cockpit e ricezione comandi slider                    | Modulo `src/server.rs`                                 |
| **Interfaccia Copilot AI**     | **`modelcontextprotocol/rust-sdk`** / FastMCP                           | Protocollo standard JSON-RPC su stdio per servire macro-tool (< 150 token) a LLM locale    | Modulo `src/mcp.rs`                                    |
| **Frontend 3D e Rendering**    | **`pmndrs/react-three-fiber`** & **`three.js`**                         | Rendering WebGL del manichino anatomico 3D con gradienti termici di atrofia                | Componente `Astronaut3DModel.tsx`                      |
| **Asset 3D Aperti NASA**       | **`nasa/NASA-3D-Resources`**                                            | Mesh 3D aperte per veicoli, habitat e sagome anatomiche                                    | Cartella asset statici del cockpit                     |
| **UI Kit Dark-Mode**           | **`shadcn/ui`** + **`Tailwind CSS`**                                    | Componenti accessibili a contrasto elevato ottimizzati per display OLED                    | Cartella componenti UI del cockpit                     |

---

## 5. Architettura Software Concreta (Opzione C: Ibrida Dual-Transport)

Il sistema è strutturato in due componenti disaccoppiate:

```
+---------------------------------------+     +---------------------------------------+
|     ASTRONAUT COCKPIT (UI Layer)      |     |    ON-BOARD EDGE AI COPILOT (LLM)     |
|   React + TypeScript + Three.js 3D    |     |   Local Quantized Model (llama.cpp)   |
|   OLED Theme #000000 + Sliders        |     |   Zero Cloud - Zero Allucinazioni     |
+---------------------------------------+     +---------------------------------------+
                    ^                                             ^
                    | 20 Hz WebSocket + REST                      | JSON-RPC (FastMCP)
                    | (127.0.0.1:8080 Loopback)                   | (Dedicated stdio Pipe)
                    v                                             v
+-------------------------------------------------------------------------------------+
|                    ARES-ENGINE (Safe Rust Core Binary on Tokio)                     |
|                Shared Synchronized State: Arc<RwLock<MissionState>>                 |
|  * Dynamic Multi-Organ Bio-Causal Graph (ADHG) & Frost-Hargens ODE Solver           |
|  * Normalized Quantitative Semantics STL Evaluator (NQS-STL, O(1) Monotonic Wedge)  |
|  * Two-Stage Bayesian POCUS Observer & Deterministic MedOps Playbook State Machine  |
+-------------------------------------------------------------------------------------+
```

1. **`ares-engine` (Backend Core in Safe Rust 2024 — Approfondimento Tecnico):**  
   Binario nativo compilato, auto-contenuto ed estremamente performante (< 20 MB di RAM, latenza del ciclo di valutazione < 15 µs, zero garbage collection pauses). Progettato specificamente per l'avionica di bordo e l'isolamento air-gapped:
   * **Modello di Concorrenza:** Gestito tramite runtime asincrono `tokio`, condivide in memoria un unico stato di missione thread-safe protetto da `Arc<RwLock<MissionState>>`.
   * **Architettura Dual-Transport Concorrente:**
     - *Trasporto 1 (Streaming UI su `127.0.0.1:8080`):* Server locale `axum` (HTTP REST + WebSocket) che invia al Cockpit lo snapshot del grafo, i margini $\hat{\rho}(t)$ e le bande bayesiane a 20 Hz, ricevendo in tempo reale i comandi What-If con tempo di ricalcolo inferiore a 1 ms.
     - *Trasporto 2 (Canale AI Copilot su `stdio` FastMCP):* Pipeline JSON-RPC su standard input/output dedicata al modello quantizzato locale (Ollama / `llama.cpp`), isolata dal traffico grafico per evitare race condition sui descrittori di file.
   * **I 5 Moduli Interni del Motore Rust (`src/`):**
     - `src/telemetry.rs`: Ring buffer circolare lock-free multi-frequenza (100 Hz per ECG, 20 Hz per radar notturno, 1 Hz per avionica) con filtro SQI a entropia spettrale e notch armonico per le ventole ECLSS.
     - `src/graph.rs`: Grafo causale eterogeneo (basato su `petgraph`), risolutore delle equazioni differenziali ordinarie di Frost-Hargens per la Sclerostina con termine di clearance plasmatica, calcolo dimensionale esatto dello shear stress endoteliale $\tau_w(t) = 2\mu v_{\max}\sqrt{\pi/\text{CSA}}$ e Osservatore Bayesiano a Due Stadi per le ecografie POCUS episodiche.
     - `src/stl.rs`: Motore di monitoraggio Normalized Quantitative Semantics (NQS-STL) che valuta le formule temporali tramite Lemire Monotonic Wedges in tempo ammortizzato $O(1)$ su tre buffer (Hot a 1 s, Warm a 60 s, Cold a 1 h) e stima il Time-To-Violation (`TTV`) tramite regressione lineare EWMA-OLS a 7 giorni.
     - `src/playbooks.rs`: Macchina a stati finiti deterministica per i DAG dei Playbook NASA MedOps con Hard Clinical Safety Gates (blocco anticoagulanti in sola stasi e sfiato LBNP anti-sincope).
     - `src/mcp.rs`: Implementazione dei tre macro-tool compatti (< 150 token) conformi al Model Context Protocol per garantire inferenza locale a zero allucinazioni.

2. **`ares-cockpit` (Frontend in React / TypeScript / Tailwind CSS / Three.js):**  
   Applicazione a schermo singolo ottimizzata per la visualizzazione e l'interazione in microgravità:
   * Gauge del Mission Readiness Index (MRI 0-100) con 4 sotto-indici;
   * Manichino 3D del corpo umano con vertici colorati dinamicamente dal decondizionamento e archi causali di Bezier animati;
   * Console "What-If Stress-Test" con slider per dimostrare il ricalcolo in tempo reale ai giudici;
   * Runner interattivo dei Playbook MedOps con overlay grafico per ecografia POCUS.

---

## 6. Regole di Gara, Fresh Code e Garanzia di Proprietà Intellettuale

* **Regola del "Fresh Code" NASA:**  
  Tutto il codice applicativo (logica del grafo in Rust, formule STL, layout React, integrazione dei playbook) viene scritto da zero durante le 48 ore dell'evento. L'uso di compilatori, librerie esterne e dataset aperti della NASA è pienamente lecito e incoraggiato.
* **Architettura 100% Clean-Room:**  
  Il progetto è completamente autonomo, indipendente e privo di vincoli commerciali o brevettuali preesistenti.
* **Open Source License:**  
  Il repository finale verrà rilasciato con licenza open source standard (MIT / Apache-2.0), conforme ai requisiti della NASA Space Apps Challenge.

---

## 7. Divisione dei Ruoli nel Team per 5 Persone (Roadmap 48h)

Con un team di 5 persone, l'allocazione del lavoro è perfettamente bilanciata per coprire l'intera pipeline di sviluppo senza colli di bottiglia:

1. **Ruolo 1: Lead Systems Architect & Core Rust Backend Engineer (Fabio Malagutti):**  
   * *Responsabilità:* Sviluppo del binario `ares-engine` in Safe Rust 2024.
   * *Deliverable:* Modello dati `AstronautBiometrics`, risolutore differenziale Frost-Hargens e $\tau_w(t)$ in `src/graph.rs`, valutatore NQS-STL in $O(1)$ con TTV in `src/stl.rs`, server dual-transport `axum` (WebSocket su porta 8080) e server `stdio` FastMCP. Suite di test unitari (`cargo test`).
2. **Ruolo 2: Frontend Cockpit & Real-Time Visualization Engineer:**  
   * *Responsabilità:* Sviluppo dell'applicazione web `ares-cockpit` in React + TypeScript + Tailwind CSS (tema dark OLED `#000000`).
   * *Deliverable:* Layout single-screen con header trifasico `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`, connessione WebSocket a 20 Hz con il backend Rust, console interattiva What-If con i 4 slider, e il runner visivo dei Playbook MedOps (step ecografico, protocollo LBNP con allarmi pressori).
3. **Ruolo 3: 3D Graphics & Human-System Integration (HSI) Specialist:**  
   * *Responsabilità:* Implementazione della visualizzazione tridimensionale interattiva in WebGL tramite `pmndrs/react-three-fiber` e `three.js`.
   * *Deliverable:* Manichino olografico 3D dell'astronauta (mesh low-poly wireframe con sfere emissive per Cranio/SANS, Giugulare, Torace, Soleo e Calcagno), archi causali curvi animati di Bezier che mostrano la direzione del collasso fisiologico e gauge del Mission Readiness Index (MRI 0-100).
4. **Ruolo 4: Biomedical Data Scientist & Sensor Fusion Specialist:**  
   * *Responsabilità:* Pipeline di elaborazione dei segnali fisiologici e preparazione dei dataset dimostrativi.
   * *Deliverable:* Dataset realistico di missione a 180 giorni ancorato a dati reali da NASA OSDR e PhysioNet (MIMIC/Fantasia) tramite `NeuroKit2` e `wfdb-python`, calibrazione numerica dei parametri delle equazioni differenziali (viscosità $\mu = 0.035\text{ Poise}$, soglia di Frost $1000\ \mu\varepsilon$), e simulatore delle tracce ecografiche POCUS (spessore muscolare e angolo di pennazione).
5. **Ruolo 5: Clinical Storyteller, NASA Compliance & Video Pitch Producer:**  
   * *Responsabilità:* Regia, montaggio del video pitch finale da 3 minuti e confezionamento della documentazione di gara.
   * *Deliverable:* Video Pitch di 180 secondi ad altissimo impatto basato sullo storyboard cinematografico (*Hook 0-18s $\to$ Gather 18-48s $\to$ Evaluate 48-95s $\to$ Act 95-150s $\to$ Close 150-180s*), slide deck PDF riassuntivo per le domande della giuria, verifica di conformità con i 5 criteri di valutazione NASA (Impact, Creativity, Validity, Relevance, Presentation) e compilazione della pagina di progetto ufficiale su Space Apps.

---

## 8. Guida Rapida ai Documenti di Approfondimento (Quali File Leggere per Ciascun Tema)

Se tu o un membro del team volete approfondire specifici aspetti del sistema, ecco i file raccomandati:

* **DOVE APPROFONDIRE IL MOTORE RUST (Letture Consigliate):**
  1. [03_Backend_Engine_and_Technology_Tradeoff.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/03_Backend_Engine_and_Technology_Tradeoff.md): **File fondamentale per il lato software/Rust.** Spiega in dettaglio perché Safe Rust fornisce un vantaggio competitivo incolmabile rispetto a Python o C++, il modello di memoria, la topologia dual-transport Tokio (`axum` WebSocket + `stdio` FastMCP), le struct Rust 2024 complete (`AstronautBiometrics`, `MedSTLRobustness`, `HabitatAvionics`), e la ripartizione dei 5 moduli del crate `ares-engine`.
  2. [02_System_Architecture_and_Metrics.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/02_System_Architecture_and_Metrics.md): **File fondamentale per la matematica implementata in Rust.** Contiene la formalizzazione esatta del Grafo Causale Eterogeneo (ADHG), le equazioni differenziali ordinarie di Frost-Hargens per la Sclerostina, la formula dimensionale dello shear stress $\tau_w(t) = 2\mu v_{\max}\sqrt{\pi/\text{CSA}}$, l'Osservatore Bayesiano a Due Stadi per le ecografie POCUS e le formule matematiche NQS-STL.
  3. [ARES_Health_Master_Architecture.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/ARES_Health_Master_Architecture.md): Documento di master specification architetturale che descrive i 7 livelli completi del sistema aerospaziale.

* **DOVE APPROFONDIRE LA FISIOLOGIA E LA MEDICINA SPAZIALE:**
  * [01_Medical_Physiological_Deep_Space_Foundations.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/01_Medical_Physiological_Deep_Space_Foundations.md): Fisiopatologia approfondita dell'asse soleo-venoso, shift dei fluidi cefalici, sindrome SANS e protocolli clinici con Hard Safety Gates.
  * [06_Flight_Surgeons_Research_and_Cutting_Edge_Biomarkers.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/06_Flight_Surgeons_Research_and_Cutting_Edge_Biomarkers.md): Analisi delle pubblicazioni dei Flight Surgeon mondiali (Auñón-Chancellor, Barratt, Urquieta, Polk, Mason/Nature SOMA 2024) e la tassonomia dei biomarcatori a 6 livelli.
  * [07_Recent_2026_Literature_Physiatry_Biomedical_Engineering.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/07_Recent_2026_Literature_Physiatry_Biomedical_Engineering.md): Rassegna della letteratura 2025-2026 sui trial LBNP in microgravità e Digital Twin.

* **DOVE APPROFONDIRE IL FRONTEND E L'ESPERIENZA UTENTE:**
  * [04_Frontend_Astronaut_Cockpit_UX.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/04_Frontend_Astronaut_Cockpit_UX.md): Design del cockpit OLED, ergonomia in microgravità, mappa anatomica 3D e runner interattivo dei Playbook MedOps.

* **DOVE APPROFONDIRE L'ECOSISTEMA OPEN SOURCE E IL VIDEO PITCH:**
  * [08_Open_Source_Ecosystem_and_Comparative_Analysis.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/08_Open_Source_Ecosystem_and_Comparative_Analysis.md): Censimento delle librerie open source, analisi comparativa contro progetti simili e storyboard dettagliato da 180 secondi per il video pitch.

* **DOVE CONSULTARE LE REGOLE UFFICIALI E I CRITERI DI VALUTAZIONE NASA:**
  * [09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md): Guida ufficiale completa alla sfida 2026 (regole di team da 1 a 6 membri, Fresh Code policy, trasparenza e dichiarazione AI, formato demo obbligatorio video da 30s o slide deck da 7 slide, 5 criteri di valutazione e i 10 premi globali NASA).
  * [10_Gemini_Argon_Review_and_Validation_Prompt.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/10_Gemini_Argon_Review_and_Validation_Prompt.md): Prompt master di red-teaming e validazione esterna per modelli di frontiera.
  * [CONTRIBUTING.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/CONTRIBUTING.md): Protocolli di sviluppo multi-agente, convenzioni git e checklist di pre-commit.
  * [contracts/telemetry_schema.json](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/contracts/telemetry_schema.json): Schema JSON formale della telemetria a 20 Hz scambiata tra motore Rust e interfaccia grafica.
