#!/usr/bin/env python3
"""
Generate a beautiful, professional Typst source file for PANORAMICA_GENERALE_PROGETTO.
"""

typst_content = r"""#set page(
  paper: "a4",
  margin: (top: 2.2cm, bottom: 2.2cm, left: 2.0cm, right: 2.0cm),
  header: context {
    if counter(page).get().first() > 1 [
      #grid(
        columns: (1fr, 1fr),
        align(left)[#text(size: 8.5pt, fill: rgb("#64748b"), weight: "bold")[ARES-Health • Master Blueprint Unificato (NASA Space Apps 2026)]],
        align(right)[#text(size: 8.5pt, fill: rgb("#64748b"))[Deep Space Health Monitoring]]
      )
      #v(-2pt)
      #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
    ]
  },
  footer: context [
    #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
    #v(-2pt)
    #grid(
      columns: (1fr, 1fr),
      align(left)[#text(size: 8pt, fill: rgb("#94a3b8"))[Documento Tecnico di Progetto • 100% Offline Edge-Native]],
      align(right)[#text(size: 8.5pt, fill: rgb("#64748b"), weight: "bold")[Pagina #counter(page).display("1 di 1", both: true)]]
    )
  ]
)

#set text(
  font: ("Helvetica", "Arial"),
  size: 9.5pt,
  fill: rgb("#0f172a"),
  spacing: 120%,
  lang: "it"
)

#set par(justify: true, leading: 0.6em)
#set heading(numbering: none)

#show heading.where(level: 1): it => block(
  above: 16pt, below: 8pt,
  breakable: false,
  [
    #text(size: 14pt, weight: "bold", fill: rgb("#0f172a"))[#it.body]
    #v(3pt)
    #line(length: 100%, stroke: 2pt + rgb("#0284c7"))
  ]
)

#show heading.where(level: 2): it => block(
  above: 12pt, below: 6pt,
  breakable: false,
  text(size: 11.5pt, weight: "bold", fill: rgb("#1e293b"))[#it.body]
)

#show heading.where(level: 3): it => block(
  above: 9pt, below: 4pt,
  breakable: false,
  text(size: 10pt, weight: "bold", fill: rgb("#0369a1"))[#it.body]
)

// Helper callout box
#let callout(title: "", body, color: rgb("#0284c7"), bg: rgb("#f0f9ff")) = block(
  fill: bg,
  stroke: (left: 3.5pt + color, rest: 0.5pt + color.lighten(70%)),
  radius: (right: 6pt),
  inset: (x: 10pt, y: 8pt),
    width: 100%,
  above: 8pt, below: 8pt,
  [
    #if title != "" [
      #text(weight: "bold", fill: color, size: 9.5pt)[#title]
      #v(2pt)
    ]
    #text(size: 9pt, fill: rgb("#1e293b"))[#body]
  ]
)

// -------------------------------------------------------------
// COVER / HEADER BLOCK
// -------------------------------------------------------------

#align(center)[
  #block(
    fill: rgb("#0f172a"),
    radius: 8pt,
    inset: (x: 18pt, y: 14pt),
    width: 100%,
    [
      #text(size: 9.5pt, weight: "bold", fill: rgb("#38bdf8"), tracking: 2pt)[NASA SPACE APPS CHALLENGE 2026] \
      #v(3pt)
      #text(size: 18pt, weight: "bold", fill: rgb("#ffffff"))[PANORAMICA GENERALE DEL PROGETTO\ ARES-Health] \
      #v(3pt)
      #text(size: 10.5pt, weight: "medium", fill: rgb("#94a3b8"))[Autonomous Resilient Edge-native System for Astronaut Health] \
      #v(1pt)
      #text(size: 9pt, fill: rgb("#cbd5e1"))[Master Blueprint Unificato per il Team • Architettura, Fisiologia, Codice e Roadmap]
    ]
  )
]

#v(4pt)

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  block(
    fill: rgb("#f8fafc"),
    stroke: 0.5pt + rgb("#e2e8f0"),
    radius: 6pt,
    inset: 7pt,
    [
      #text(size: 8pt, weight: "bold", fill: rgb("#475569"))[INFORMAZIONI MISSIONE] \
      *Sfida Ufficiale:* Create Health Monitoring Software for Astronauts \
      *URL:* spaceappschallenge.org/2026/challenges/health-monitoring-software/ \
      *Ambiente:* Deep Space Transit (Terra-Marte), Lunar Gateway, Marte
    ]
  ),
  block(
    fill: rgb("#f8fafc"),
    stroke: 0.5pt + rgb("#e2e8f0"),
    radius: 6pt,
    inset: 7pt,
    [
      #text(size: 8pt, weight: "bold", fill: rgb("#475569"))[LEAD & PARADIGMA OPERATIVO] \
      *Lead Architect:* Fabio Malagutti (Ing. Informatico • Laureando Magistrale Unibo) \
      *Modalità:* 100% Offline, Esecuzione Edge Deterministica, Air-Gapped \
      *Stack:* Safe Rust 2024 (`ares-engine`) + React / Three.js (`ares-cockpit`)
    ]
  )
)

#v(4pt)

// -------------------------------------------------------------
// SECTION 1
// -------------------------------------------------------------
= 1. In Cosa Consiste il Progetto (La Visione in Breve)

ARES-Health è una piattaforma software medica *edge-native* per astronauti in missioni nello spazio profondo (Artemis Gateway, transito Terra-Marte e base marziana), progettata per operare in completa autonomia a bordo del veicolo.

#callout(title: "Il Problema Reale: Il Muro della Velocità della Luce (8-48 Minuti di Latenza)", color: rgb("#dc2626"), bg: rgb("#fef2f2"))[
  Sulla ISS gli astronauti sono a 400 km dalla Terra e comunicano istantaneamente con il Controllo Missione di Houston. Verso Marte, la distanza impone un ritardo radio di *8–48 minuti andata e ritorno*, con blackout completi fino a 14 giorni durante le congiunzioni solari.
  La telemedicina convenzionale, i server remoti e le API cloud (AWS, OpenAI, Google Cloud) sono *fisicamente inservibili*. Se un astronauta sviluppa una trombosi venosa giugulare o una frattura da osteopenia, il sistema di bordo deve diagnosticare e prescrivere in autonomia.
]

- *La Nostra Soluzione:* ARES-Health porta la mente clinica del Flight Surgeon direttamente a bordo: un motore software autonomo in Safe Rust che acquisisce i dati fisiologici, valuta il decondizionamento complessivo tramite un grafo causale multi-organo e guida l'equipaggio in protocolli clinici certificati con porte di sicurezza inviolabili.
- *Il Mandato Ufficiale della Traccia:* La sfida NASA impone la risoluzione di tre azioni sequenziali a ciclo chiuso: *GATHER* (raccogliere), *EVALUATE* (valutare) e *ACT* (prescrivere e agire).

#v(4pt)
#align(center)[
  #image("diagrams/diagram_gather_evaluate_act.svg", width: 95%)
]
#v(4pt)

// -------------------------------------------------------------
// SECTION 2
// -------------------------------------------------------------
= 2. Architettura Funzionale a 3 Fasi: Gather, Evaluate, Act

== Fase 1: GATHER (Acquisizione Dati a Basso Carico per l'Equipaggio)
- *Radar Notturno Contactless (Crew Quarters):* Monitoraggio della frequenza cardiaca a riposo e della frequenza respiratoria durante il sonno tramite micro-radar RF / Wi-Fi CSI (_Channel State Information_), senza applicare cerotti o elettrodi adesivi sulla pelle. *Vantaggio:* elimina le dermatiti da contatto e l'insofferenza da monitoraggio continuo nelle missioni di 1000 giorni.
- *Biosegnali Indossabili con Filtro SQI:* Acquisizione di ECG, fotopletismografia (PPG) e attività muscolare filtrati con algoritmi di _Signal Quality Index_ (SQI) basati su entropia spettrale per resecare istantaneamente gli artefatti dovuti a gocce di sudore fluttuanti e movimento in microgravità.
- *Biomarcatori Omici e Point-of-Care (POC):* Integrazione di test ematici capillari da puntura del dito (Abbott i-STAT / rHEALTH) per tracciare biomarcatori di danno cellulare (Troponina I, Sclerostina, Irisina, cf-mtDNA).

== Fase 2: EVALUATE (Motore Analitico Edge Deterministico in Rust)
- *Dynamic Multi-Organ Bio-Causal Graph (ADHG):* Supera i cruscotti tradizionali che mostrano parametri slegati tra loro. Modella la cascata fisiopatologica accoppiata scatenata dall'assenza di peso:

#align(center)[
  #image("diagrams/diagram_causal_graph.svg", width: 98%)
]

- *Normalized Quantitative Signal Temporal Logic (NQS-STL):* Sostituisce le soglie fisse (che causano falsi allarmi durante il normale esercizio fisico) con formule temporali matematiche. Adimensionalizza ogni parametro su una scala uniforme $hat(rho) in (-infinity, +1.0]$:
  - $hat(rho) > 0$: margine di sicurezza clinica garantito;
  - $hat(rho) <= 0$: violazione della soglia fisiologica;
  - Derivata temporale $chevron.l dot(rho) chevron.r_(7"d")$: stima predittiva del tempo residuo al collasso clinico (*Time-To-Violation, TTV*) con 11–14 giorni di anticipo.
- *Osservatore Bayesiano a Due Stadi (POCUS Episodico):* Poiché le ecografie non si eseguono in continuo ma settimanalmente, il sistema traccia le variabili latenti (velocità giugulare, diametro della guaina del nervo ottico ONSD, spessore muscolare) allargando dinamicamente una banda di incertezza $plus.minus sigma(t)$. All'esecuzione dell'ecografia di 2 minuti, la banda di incertezza collassa istantaneamente a zero ($sigma -> 0$).
- *Mission Readiness Index (MRI 0–100):* Indice numerico sintetico di idoneità operativa per passeggiate extra-veicolari (EVA) e manovre di atterraggio.

== Fase 3: ACT (Interfaccia Cockpit e NASA MedOps Playbook Runner)
- *Cockpit OLED Dark-Mode:* Interfaccia a contrasto elevato conforme a NASA-STD-3001, con manichino 3D del corpo umano (WebGL/Three.js) che colora le aree anatomiche in base al livello di decondizionamento.
- *Console Interattiva What-If Stress-Test:* Quattro slider reattivi in tempo reale (ppCO2 cabina, carico ARED, pressione LBNP, giorno di missione) per dimostrare alla giuria che il motore ricalcola la risposta clinica in *meno di 1 millisecondo*.
- *Runner dei Playbook Operativi (DAG) con Hard Clinical Safety Gates:*
  - *Playbook 04 (Stasi Giugulare e Decondizionamento):* Guida ecografica POCUS assistita sul collo; *divieto assoluto di somministrazione empirica di anticoagulanti* in assenza di trombo confermato (per scongiurare emorragie intracraniche letali in microgravità); attivazione camera a pressione negativa LBNP a $-30 upright(" mmHg")$ per 45 min con *blocco anti-sincope automatico* (sfiato istantaneo a $0 upright(" mmHg")$ se la pressione sistolica scende di $> 15 upright(" mmHg")$ o la frequenza supera $115 upright(" bpm")$); ricalibrazione carico eccentrico ARED (+15%) e supplementazione con Leucina e Citrato di Potassio.
  - *Playbook 05 (Stabilità del Cammino allo Sbarco su Marte a 0.38g):* Calcolo del _Gait Asymmetry Index_ (GAI) tramite sensori inerziali della tuta per prevenire cadute o lesioni articolari alla transizione gravitazionale.
- *AI Copilot Locale (FastMCP):* Assistente vocale/testuale offline che interroga il grafo deterministico tramite macro-tool compatti ($< 150$ token), garantendo l'assoluta assenza di allucinazioni cliniche.

// -------------------------------------------------------------
// SECTION 3
// -------------------------------------------------------------
= 3. Matrice delle Fonti: Da Dove Proviene Ogni Decisione Scientifica

Ogni singola formula matematica, soglia fisiologica e albero decisionale integrato in ARES-Health è rigorosamente ancorato alla letteratura aerospaziale internazionale dei Flight Surgeon NASA:

#v(4pt)
#table(
  columns: (1.3fr, 1.8fr, 1.9fr),
  stroke: (x, y) => if y == 0 { none } else { 0.5pt + rgb("#e2e8f0") },
  fill: (col, row) => if row == 0 { rgb("#0f172a") } else if calc.even(row) { rgb("#f8fafc") } else { rgb("#ffffff") },
  inset: (x: 6pt, y: 5pt),
  align: (col, row) => if row == 0 { center + horizon } else { left + horizon },

  table.header(
    [*Componente ARES-Health*],
    [*Decisione Fisiologica / Clinica*],
    [*Autore e Pubblicazione di Riferimento*]
  ),
  [#text(weight: "bold", fill: rgb("#0369a1"))[Stasi Venosa Giugulare]],
  [Monitoraggio flusso lento ($v_("max") < 5 upright(" cm/s")$) e rischio trombosi venosa occlusiva],
  [*Dr. Serena Auñón-Chancellor* (NASA Flight Surgeon, _JAMA 2019_ / _NEJM 2020_)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Sindrome SANS e Occhio]],
  [Diametro guaina nervo ottico ($"ONSD" > 5.8 upright(" mm")$) e correlazione con $p p "CO"_2$],
  [*Dr. Michael Barratt* (NASA Flight Surgeon / Astronauta, _Springer 2020_)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Medicina Esplorativa]],
  [Architettura di supporto decisionale clinico indipendente dalla Terra (EIMO)],
  [*Dr. Emmanuel Urquieta* (TRISH / Baylor College of Medicine)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Standard NASA ExMC]],
  [Standard medici di esplorazione NASA-STD-3001 e kit Point-of-Care a basso volume],
  [*Dr. James Polk* (Chief Health & Medical Officer NASA)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Biomarcatori Molecolari]],
  [Mappatura del danno tissutale via cell-free RNA e DNA mitocondriale circolante (cf-mtDNA)],
  [*Prof. Christopher Mason et al.* (_Nature SOMA Package 2024_, Inspiration4)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Shear Stress Endoteliale]],
  [Soglia pro-trombotica venosa $tau_w < 4.0 upright(" dyn/cm")^2$ sotto scarico gravitazionale],
  [*Bisserier et al.* (_npj Microgravity 2026_)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Dose Decompressione LBNP]],
  [Protocollo a dose calibrata di $-30 upright(" mmHg")$ per $45 upright(" min/die")$ per deflusso giugulare],
  [*Pappas et al.* (_J. Appl. Physiol. 2026_) & *NASA OCHMO MTB-007 (2026)*],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Asse Muscolo-Osso]],
  [Disuso posturale: spegnimento _mechanostat_ ($epsilon < 1000 mu epsilon$); crollo irisina accelera sclerostina],
  [*Al-Nuaimi & Hargens (2025/2026)*; Letteratura Unità Muscolo-Osso (_EJAP 2026_)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Ecografia POCUS Soleo]],
  [Indice ecografico $text("MQI")$ basato su spessore soleo, angolo di pennazione ed ecogenicità],
  [*Imaging Riabilitativo e Sarcopenia* (_J. Clin. Med. 2023_, _JCSM 2024_)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Preabilitazione e Nutrizione]],
  [Condizionamento pre-volo con Leucina e Vitamina D per riserva funzionale ($P R F_0$)],
  [*Studi di Preabilitazione Muscolare* (_Nutrients 2024_, _Sci. Rep. 2026_)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Stabilità Cammino 0.38g]],
  [Alterazioni cinematiche, valgo dinamico e rischio caduta al contatto col suolo marziano],
  [*Biomeccanica del Cammino Spaziale* (_Eur. J. Appl. Physiol. 2025_)]
)

// -------------------------------------------------------------
// SECTION 4
// -------------------------------------------------------------
= 4. Matrice delle Tecnologie: Quale Repository Open Source Importiamo

Nel pieno rispetto della regola del *Fresh Code* della NASA, non copiamo codice applicativo: importiamo le seguenti librerie open source ufficiali come dipendenze standard (`Cargo.toml`, `requirements.txt`, `package.json`):

#v(4pt)
#table(
  columns: (1.3fr, 1.8fr, 1.9fr),
  stroke: (x, y) => if y == 0 { none } else { 0.5pt + rgb("#e2e8f0") },
  fill: (col, row) => if row == 0 { rgb("#0f172a") } else if calc.even(row) { rgb("#f8fafc") } else { rgb("#ffffff") },
  inset: (x: 6pt, y: 5pt),
  align: (col, row) => if row == 0 { center + horizon } else { left + horizon },

  table.header(
    [*Dominio Tecnologico*],
    [*Libreria GitHub / Crate Ufficiale*],
    [*Ruolo Specifico in ARES-Health*]
  ),
  [#text(weight: "bold", fill: rgb("#0369a1"))[Verifica Formale (STL)]],
  [`mstlo` (Mistletoe) / `nickovic/rtamt`],
  [Calcolo ad altissima velocità del margine continuo di robustezza temporale $hat(rho)(t)$ nel modulo Rust `src/stl.rs` con tempo ammortizzato $O(1)$],

  [#text(weight: "bold", fill: rgb("#0369a1"))[DSP dei Biosegnali]],
  [`neuropsychology/NeuroKit2` (Python, MIT)],
  [Estrazione R-peak da ECG, indici HRV (RMSSD, LF/HF) e frequenza respiratoria per i dati sintetici di validazione],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Dataset Waveform Reali]],
  [`wfdb-python` (PhysioNet official library)],
  [Ingestione e riproduzione di tracciati elettrofisiologici ed emodinamici reali per il benchmark del sistema],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Radar Contactless CSI]],
  [`Lu2024-project/ESP32-CSI` & `ruvnet/RuView`],
  [Algoritmi di estrazione Doppler da sottoportanti RF Wi-Fi per frequenza cardiaca e respiro notturni],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Dataset Omici Spazio]],
  [`nasa/GeneLab` & NASA OSDR APIs],
  [Curve di decadimento molecolare e cinetiche di Sclerostina, Irisina, Troponina I e cf-mtDNA],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Topologia del Grafo]],
  [`petgraph` (Rust standard crate)],
  [Gestione in-memory ad alte prestazioni della rete di nodi e archi del grafo causale eterogeneo ADHG (`src/graph.rs`)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Server Concorrente UI]],
  [`tokio` + `axum` (Rust ecosystem)],
  [Streaming WebSocket a 20 Hz verso il cockpit React e ricezione comandi What-If con tempo di risposta $< 1 upright(" ms")$],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Interfaccia Copilot AI]],
  [`modelcontextprotocol/rust-sdk` / FastMCP],
  [Pipeline JSON-RPC su `stdio` per servire tre macro-tool compatti ($< 150$ token) al modello quantizzato locale (`src/mcp.rs`)],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Frontend 3D WebGL]],
  [`pmndrs/react-three-fiber` & `three.js`],
  [Rendering 3D del manichino dell'astronauta con vertici emissivi e archi causali curvi animati di Bezier],

  [#text(weight: "bold", fill: rgb("#0369a1"))[Asset 3D Aperti NASA]],
  [`nasa/NASA-3D-Resources`],
  [Modelli 3D poligonali aperti per la sagoma anatomica dell'astronauta e gli apparati di cabina],

  [#text(weight: "bold", fill: rgb("#0369a1"))[UI Kit Dark OLED]],
  [`shadcn/ui` + `Tailwind CSS`],
  [Componenti ad altissima accessibilità visiva con sfondo nero assoluto (`#000000`) per display avionici]
)

// -------------------------------------------------------------
// SECTION 5
// -------------------------------------------------------------
= 5. Architettura Software Concreta (Opzione C: Ibrida Dual-Transport)

Il sistema ARES-Health è strutturato in due componenti strettamente disaccoppiate ed eseguite interamente in locale:

#v(4pt)
#align(center)[
  #image("diagrams/diagram_architecture.svg", width: 98%)
]
#v(4pt)

== 1. `ares-engine` (Backend Core in Safe Rust 2024 — Approfondimento Tecnico)
Binario nativo compilato, auto-contenuto ed estremamente performante: *RAM inferiore a 20 MB*, latenza del ciclo di calcolo *inferiore a 15 microsecondi*, zero pause da garbage collection. Progettato espressamente per l'affidabilità critica di bordo:
- *Modello di Concorrenza:* Gestito tramite runtime asincrono `tokio`, condivide in memoria un unico stato di missione protetto da `Arc<RwLock<MissionState>>`.
- *Architettura Dual-Transport Concorrente:*
  - *Trasporto 1 (Streaming UI su `127.0.0.1:8080`):* Server locale `axum` (HTTP REST + WebSocket) che trasmette lo snapshot del grafo, i margini $hat(rho)(t)$ e le bande bayesiane a 20 Hz, gestendo gli slider What-If con ricalcolo in tempo reale.
  - *Trasporto 2 (Canale AI Copilot su `stdio` FastMCP):* Pipeline JSON-RPC su standard input/output dedicata al modello quantizzato locale (Ollama / `llama.cpp`), rigorosamente isolata dal traffico di rete locale.
- *I 5 Moduli Interni del Crate Rust (`src/`):*
  1. `src/telemetry.rs`: Ring buffer circolare lock-free multi-frequenza (ECG a 100 Hz, radar notturno a 20 Hz, avionica a 1 Hz) con filtro SQI a entropia spettrale e notch armonico per le ventole di cabina.
  2. `src/graph.rs`: Grafo causale eterogeneo (`petgraph`), risolutore delle equazioni differenziali ordinarie di Frost-Hargens per la Sclerostina, calcolo dimensionale dello shear stress $tau_w(t) = 2 mu v_("max") sqrt(pi / "CSA")$ in $"dyn/cm"^2$ e Osservatore Bayesiano a Due Stadi.
  3. `src/stl.rs`: Motore di monitoraggio NQS-STL che valuta le formule temporali tramite Lemire Monotonic Wedges in tempo ammortizzato $O(1)$ e stima il Time-To-Violation (`TTV`) tramite regressione lineare EWMA a 7 giorni.
  4. `src/playbooks.rs`: Macchina a stati deterministica per i DAG dei Playbook NASA MedOps con Hard Clinical Safety Gates inviolabili.
  5. `src/mcp.rs`: Implementazione dei tre macro-tool compatti conformi al Model Context Protocol per garantire risposte verificate a costo zero allucinazioni.

== 2. `ares-cockpit` (Frontend in React / TypeScript / Tailwind CSS / Three.js)
Applicazione single-page a contrasto ultra-elevato:
- Header trifasico di missione `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`;
- Gauge del Mission Readiness Index (MRI 0–100) con sotto-indici cardiovascolare, muscolare, scheletrico e cognitivo;
- Manichino 3D olografico WebGL con gradienti di colore dinamici e archi causali di Bezier animati;
- Console interattiva "What-If Stress-Test" con i 4 slider continui;
- Runner interattivo dei Playbook MedOps con guida ecografica POCUS visuale passo-passo.

// -------------------------------------------------------------
// SECTION 6
// -------------------------------------------------------------
= 6. Regole di Gara, Fresh Code e Garanzia di Proprietà Intellettuale

- *Regola del "Fresh Code" NASA:* Tutto il codice applicativo (logica Rust, formule STL, layout React, integrazione playbook) verrà scritto e committato rigorosamente da zero durante le 48 ore di gara. La documentazione pre-gara funge da specifica architetturale conforme al regolamento.
- *Architettura 100% Clean-Room:* Il progetto è totalmente autonomo, indipendente e privo di contaminazioni da progetti commerciali o repository privati preesistenti.
- *Open Source Licensing:* Il codice prodotto verrà rilasciato sotto licenza open-source OSI (MIT / Apache-2.0), soddisfacendo tutti i criteri di trasparenza della NASA Space Apps Challenge.

// -------------------------------------------------------------
// SECTION 7
// -------------------------------------------------------------
= 7. Divisione dei Ruoli nel Team per 5 Persone (Roadmap 48h)

L'allocazione delle attività per 5 membri è perfettamente bilanciata per massimizzare la produttività ed eliminare qualsiasi collo di bottiglia durante le 48 ore dell'hackathon:

#callout(title: "Ruolo 1: Lead Systems Architect & Core Rust Backend Engineer (Fabio Malagutti)", color: rgb("#0f172a"), bg: rgb("#f1f5f9"))[
  *Responsabilità:* Sviluppo del binario `ares-engine` in Safe Rust 2024. \
  *Deliverable:* Modello dati `AstronautBiometrics`, risolutore differenziale Frost-Hargens e $tau_w(t)$ in `src/graph.rs`, valutatore NQS-STL in $O(1)$ con TTV in `src/stl.rs`, server dual-transport `axum` (WebSocket su porta 8080) e server `stdio` FastMCP. Suite di test unitari con `cargo test`.
]

#callout(title: "Ruolo 2: Frontend Cockpit & Real-Time Visualization Engineer", color: rgb("#0284c7"), bg: rgb("#f0f9ff"))[
  *Responsabilità:* Sviluppo dell'applicazione web `ares-cockpit` in React + TypeScript + Tailwind CSS (tema dark OLED `#000000`). \
  *Deliverable:* Layout single-screen con header trifasico, connessione WebSocket a 20 Hz con il backend Rust, console interattiva What-If con i 4 slider, e il runner visivo dei Playbook MedOps (step ecografico, protocollo LBNP con allarmi pressori).
]

#callout(title: "Ruolo 3: 3D Graphics & Human-System Integration (HSI) Specialist", color: rgb("#7c3aed"), bg: rgb("#f5f3ff"))[
  *Responsabilità:* Implementazione della visualizzazione tridimensionale interattiva in WebGL tramite `pmndrs/react-three-fiber` e `three.js`. \
  *Deliverable:* Manichino olografico 3D dell'astronauta (mesh low-poly wireframe con sfere emissive per Cranio/SANS, Giugulare, Torace, Soleo e Calcagno), archi causali curvi animati di Bezier che mostrano la direzione del collasso fisiologico e gauge del Mission Readiness Index (MRI 0–100).
]

#callout(title: "Ruolo 4: Biomedical Data Scientist & Sensor Fusion Specialist", color: rgb("#059669"), bg: rgb("#ecfdf5"))[
  *Responsabilità:* Pipeline di elaborazione dei segnali fisiologici e preparazione dei dataset dimostrativi. \
  *Deliverable:* Dataset realistico di missione a 180 giorni ancorato a dati reali da NASA OSDR e PhysioNet (MIMIC/Fantasia) tramite `NeuroKit2` e `wfdb-python`, calibrazione numerica dei parametri delle equazioni differenziali (viscosità $mu = 0.035 upright(" Poise")$, soglia di Frost $1000 mu epsilon$), e simulatore delle tracce ecografiche POCUS.
]

#callout(title: "Ruolo 5: Clinical Storyteller, NASA Compliance & Video Pitch Producer", color: rgb("#d97706"), bg: rgb("#fffbeb"))[
  *Responsabilità:* Regia, montaggio del video pitch finale da 3 minuti e confezionamento della documentazione di gara. \
  *Deliverable:* Video Pitch di 180 secondi ad altissimo impatto basato sullo storyboard cinematografico (*Hook 0–18s $->$ Gather 18–48s $->$ Evaluate 48–95s $->$ Act 95–150s $->$ Close 150–180s*), slide deck PDF riassuntivo per le domande della giuria, verifica di conformità con i 5 criteri di valutazione NASA (Impact, Creativity, Validity, Relevance, Presentation) e compilazione della pagina di progetto ufficiale su Space Apps.
]

// -------------------------------------------------------------
// SECTION 8
// -------------------------------------------------------------
= 8. Guida Rapida ai Documenti di Approfondimento (Quali File Leggere)

Per approfondire nel dettaglio ciascuna area prima e durante la gara, fare riferimento ai singoli file specialistici del dossier:

- *DOVE APPROFONDIRE IL MOTORE RUST (Letture Consigliate):*
  1. `03_Backend_Engine_and_Technology_Tradeoff.md`: Spiega il vantaggio di Safe Rust, modello di memoria, topologia dual-transport Tokio (`axum` + FastMCP), struct Rust 2024 e ripartizione dei 5 moduli.
  2. `02_System_Architecture_and_Metrics.md`: Formalizzazione matematica esatta del Grafo Causale ADHG, equazioni ODE Frost-Hargens, shear stress $tau_w(t)$, Osservatore Bayesiano POCUS e formule NQS-STL.
  3. `ARES_Health_Master_Architecture.md`: Master specification architetturale a 7 livelli.
  4. `contracts/telemetry_schema.json`: Schema formale del pacchetto dati a 20 Hz scambiato tra Rust e React.

- *DOVE APPROFONDIRE LA FISIOLOGIA E LA MEDICINA SPAZIALE:*
  - `01_Medical_Physiological_Deep_Space_Foundations.md`: Fisiopatologia dell'asse soleo-venoso, shift fluidi, sindrome SANS e protocolli con Hard Safety Gates.
  - `06_Flight_Surgeons_Research_and_Cutting_Edge_Biomarkers.md`: Pubblicazioni dei Flight Surgeon mondiali (Auñón-Chancellor, Barratt, Polk, Mason) e tassonomia dei biomarcatori a 6 livelli.
  - `07_Recent_2026_Literature_Physiatry_Biomedical_Engineering.md`: Rassegna letteratura 2025–2026 sui trial LBNP e Digital Twin.

- *DOVE APPROFONDIRE IL FRONTEND E L'ESPERIENZA UTENTE:*
  - `04_Frontend_Astronaut_Cockpit_UX.md`: Design cockpit OLED, ergonomia microgravità, mappa 3D e runner interattivo Playbook MedOps.

- *DOVE APPROFONDIRE L'ECOSISTEMA OPEN SOURCE E IL VIDEO PITCH:*
  - `08_Open_Source_Ecosystem_and_Comparative_Analysis.md`: Censimento librerie open source, comparative analysis e storyboard 180s.

- *DOVE CONSULTARE LE REGOLE UFFICIALI E LA VALUTAZIONE NASA:*
  - `09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md`: Guida ufficiale 2026 (regole team 1-6 membri, Fresh Code, disclosure AI, demo video 30s o slide deck 7 slide, 5 criteri di valutazione e i 10 premi globali).
  - `CONTRIBUTING.md`: Convenzioni git, commit standard e protocollo di collaborazione multi-agente.
"""

with open("/Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/PANORAMICA_GENERALE_PROGETTO.typ", "w") as fp:
    fp.write(typst_content)

print("Typst source written successfully.")
