// docs/submission/PANORAMICA_GENERALE_PROGETTO.typ
// Offline Typst 0.15.1 A4 Blueprint synced to 8-Crate Safe Rust 2024 + ARES-MedOS + Blocks A-L + Issue #11/#12.
// Zero remote package imports. Zero Unicode emojis.

#let evidence-status = sys.inputs.at("evidence_status", default: "ILLUSTRATIVE_UNVALIDATED")

#let slate-dark  = rgb("#0f172a")
#let slate-mid   = rgb("#334155")
#let slate-muted = rgb("#64748b")
#let border-col  = rgb("#cbd5e1")
#let cyan-accent = rgb("#0284c7")
#let amber-col   = rgb("#b45309")
#let amber-bg    = rgb("#fffbeb")
#let info-bg     = rgb("#f0f9ff")

#set document(
  title: "ARES-Health — Panoramica Generale del Progetto (Blocchi A-L)",
  author: "Fabio Malagutti & ARES-Health Team (University of Bologna)",
)

#set page(
  paper: "a4",
  margin: (top: 2.0cm, bottom: 2.0cm, left: 1.8cm, right: 1.8cm),
  header: context {
    if counter(page).get().first() > 1 [
      #grid(
        columns: (1fr, auto),
        align(left)[#text(size: 8pt, fill: slate-muted, weight: "bold")[ARES-Health | ARES-MedOS v0.1 (NASA Space Apps 2026)]],
        align(right)[#text(size: 8pt, fill: amber-col, weight: "bold")[STATUS: #evidence-status]],
      )
      #v(-2pt)
      #line(length: 100%, stroke: 0.5pt + border-col)
    ]
  },
  footer: context [
    #line(length: 100%, stroke: 0.5pt + border-col)
    #v(-2pt)
    #grid(
      columns: (1fr, auto),
      align(left)[#text(size: 7.5pt, fill: slate-muted)[100% Offline Safe Rust 2024 | MIT OR Apache-2.0 | MODEL_EVIDENCE_AUDIT.md]],
      align(right)[#text(size: 8pt, fill: slate-muted, weight: "bold")[Pagina #counter(page).display("1 di 1", both: true)]],
    )
  ],
)

#set text(
  font: ("Helvetica Neue", "Helvetica", "Arial"),
  size: 9.2pt,
  fill: slate-dark,
  lang: "it",
)
#set par(justify: true, leading: 0.55em)
#set heading(numbering: none)

#show heading.where(level: 1): it => block(
  above: 14pt,
  below: 6pt,
  breakable: false,
  [
    #text(size: 13pt, weight: "bold", fill: slate-dark)[#it.body]
    #v(2pt)
    #line(length: 100%, stroke: 1.5pt + cyan-accent)
  ],
)

#show heading.where(level: 2): it => block(
  above: 10pt,
  below: 4pt,
  breakable: false,
  text(size: 10.5pt, weight: "bold", fill: cyan-accent)[#it.body],
)

#let callout(title: "", body, color: cyan-accent, bg: info-bg) = block(
  fill: bg,
  stroke: (left: 3.5pt + color, rest: 0.5pt + border-col),
  radius: (right: 4pt),
  inset: (x: 10pt, y: 7pt),
  width: 100%,
  above: 6pt,
  below: 6pt,
  [
    #if title != "" [
      #text(weight: "bold", fill: color, size: 9pt)[#title]
      #v(2pt)
    ]
    #text(size: 8.6pt, fill: slate-dark)[#body]
  ],
)

// ============================================================================
// COVER HEADER
// ============================================================================
#align(center)[
  #text(size: 8.5pt, weight: "bold", fill: cyan-accent)[NASA SPACE APPS CHALLENGE 2026 — CREATE HEALTH MONITORING SOFTWARE FOR ASTRONAUTS]
  #v(3pt)
  #text(size: 20pt, weight: "bold", fill: slate-dark)[ARES-Health & ARES-MedOS v0.1]
  #v(2pt)
  #text(size: 10.5pt, fill: slate-mid)[Autonomous Resilient Edge-native System for Astronaut Health]
  #v(4pt)
  #text(size: 8.5pt, fill: slate-muted)[
    Lead Architect: Fabio Malagutti (Univ. of Bologna) | Team: `MiServeRDC/nasa-space-apps-2026` | Licenza: `MIT OR Apache-2.0`
  ]
]

#callout(
  title: "AVVISO EPISTEMICO OBBLIGATORIO (ISSUE #11 & ISSUE #12 — MODEL_EVIDENCE_AUDIT.md)",
  color: amber-col,
  bg: amber-bg,
)[
  *Stato Macchina Corrente:* `#evidence-status`. Le osservazioni terrestri `PhysioNet BIDMC v1.0.0` (`RECORDED_TERRESTRIAL_BIDMC_CSV`) sono tenute rigorosamente distinte dai modelli fisiologici e predittivi di scenario, i quali sono *illustrativi e non validati clinicamente* (`ILLUSTRATIVE_SCENARIO_RANGE`, `HEURISTIC_GATE_ACCEPTED`). Sui tracciati numerici `1 Hz` `BIDMC` privi di intervalli R-R nativi, `rmssd_ms` resta `null` (`BEAT_INTERVALS_NOT_AVAILABLE`) e la severita resta `DATA_DEGRADED_MISSING_CHANNELS`. Questo prototipo non costituisce dispositivo certificato o idoneita al volo.
]

= 1. Problema Operativo e Visione Edge-Native

In orbita terrestre bassa (ISS) il controllo medico da Houston opera quasi in tempo reale. Durante le missioni verso la Luna e Marte (`NASA CHAPEA`, `NASA-STD-3001 Vol. 1 [V1 3006]` *Earth-Independent Medical Operations — EIMO*), la latenza della luce impone un ritardo di propagazione `OWLT` compreso tra *4 e 24 minuti* (*8–48 minuti andata e ritorno*) con blackout completi fino a *14 giorni* nelle congiunzioni solari. La telemedicina cloud convenzionale e fisicamente inutilizzabile.

*ARES-Health* realizza una workstation clinica offline, air-gapped e deterministica in *Safe Rust 2024* (`8` crate, `0` `.unwrap()`/`.expect()` in produzione) affiancata da una shell nativa `Tauri v2` e da un cockpit React 19 OLED puro `#000000` (`ARES-MedOS`), chiudendo a bordo il ciclo canonico *`GATHER -> EVALUATE -> ACT`*.

= 2. Architettura Funzionale `GATHER -> EVALUATE -> ACT`

== 2.1 Fase 1 — GATHER (`crates/ares-telemetry-ingest`)
- *Replay Deterministico `PhysioNet BIDMC v1.0.0`:* `BidmcReplayer` riproduce `bidmc_01..03_Numerics.csv` (`481` righe `0..480 s` a `1.0 Hz`, `ODC-By-1.0`), verificati tramite `SHA-256` contro `data/bidmc/MANIFEST.json`, rimuovendo gli spazi iniziali dagli header e mantenendo il disaccoppiamento tra frequenza nativa `1 Hz` e stream UI `20 Hz`.
- *Integrita sui Valori Mancanti:* I `13` campioni mancanti di `PULSE`/`SpO2` in `bidmc_01` restano `Option<f64>::None` (`null` / `MISSING`), mai sostituiti da `0.0`. Senza intervalli battito-battito, `rmssd_ms` resta `None` con motivo `BEAT_INTERVALS_NOT_AVAILABLE`.
- *Euristica SQI & ZOH (`sqi_filter.rs`):* Euristica di entropia sulle differenze di HR su `16` campioni ($0.96 - 0.14 h_"norm" - 0.18 f_"miss"$) con *Zero-Order Hold* limitato a `30 s` (`HOLD_LAST_VALID` -> `HELD_STALE` -> `UNAVAILABLE`).
- *DSP Pure-Rust Level-1 (`Fase 31 / L3`):* Demodulazione radar I/Q `60/5.2 GHz` con cascata biquad notch `60/120 Hz` Jury-stable per ventole ECLSS (`radar_csi_dsp.rs`), estrazione vocale `YIN` $F_0$/`HNR`/jitter/shimmer con `None` su silenzio (`vocal_acoustic_dsp.rs`), estrattore R-R Pan-Tompkins `125-500 Hz` + filtro ectopici di Malik `+/-20%` (`waveform_rr_extractor.rs`), e pacchetto wearable `32 B` `WearableSensorPacket` (`CRC-16-CCITT` + contatore restart `Oxide Hubris`).

== 2.2 Fase 2 — EVALUATE (`crates/ares-causal-graph` & `crates/ares-nqs-stl`)
- *Meccanotrasduzione Muscolo-Osso (`mechanotransduction.rs`):* ODE di scenario della Sclerostina integrata con *RK4 a 12 passi fissi* (convergenza $O(h^4)$ Richardson `ratio >= 14.5`):
  $ (d["SOST"]) / (d t) = k_"prod" / (1 + (epsilon_"mech" / epsilon_"Frost")^2) - k_"deg" ["SOST"], quad epsilon_"Frost" = 1000 mu epsilon $
  accoppiata agli indicatori illustrativi `MQI`, calcio urinario e asimmetria del passo marziano `GAI` (`0.38g`).
- *Shear Stress Giugulare CGS & `SANS` (`hemodynamics.rs`):* Equazione dimensionalmente esatta in $"dyn/cm"^2$:
  $ tau_w (t) = 2 mu v_max (t) sqrt(pi / "IJV_CSA"_"cm^2" (t)), quad mu = 0.035 " Poise" $
  con proxy di scenario translaminare `ONSD`/`SANS` e osservatore Bayesiano POCUS a 2 stadi ($P_"pre" <= 0.45$, conferma B-mode con `LR+ = 24.0` nell'intervallo `0.92..0.995`).
- *`NQS-STL` $O(1)$ & Co-Processore `Timestral`:* Normalizzazione adimensionale su `[-2.0, +1.0]` con finestra scorrevole $O(1)$ (`LemireMinWedge`, verificato contro oracolo $O(W)$ su `2,000` sequenze). `TimestralBackbone` (`CausalScaler` `asinh`/`sinh`, maschera canali mancanti, `DualAxisAttention`, caricatore `SafeTensors` `SHA-256` con fallback deterministico) alimenta `QuantileHead`:
  $ q_0.05 = q_0.50 - "softplus"(delta_"low"), quad q_0.95 = q_0.50 + "softplus"(delta_"high") $
  garantendo $q_0.05 <= q_0.50 <= q_0.95$ su `10,000` traiettorie `proptest`. `ConformalAbstentionGate` emette `HEURISTIC_GATE_ACCEPTED` (`ABSTAINED_FALLBACK` se degradato); gli intervalli `TTV` sono qualificati `ILLUSTRATIVE_SCENARIO_RANGE` (`0.5..720 h`). La Fase 33 (`L5`) introduce l'harness *subject-disjoint* `CQR` + Clopper-Pearson + Brier/ECE (`calibration_harness.rs`).

== 2.3 Fase 3 — ACT (`crates/ares-medops-playbooks` & `ares-security-privacy`)
- *5 Playbook Type-1 (`< 20 us`, zero LLM nel loop critico):* `PLAYBOOK_01_VENOUS_STASIS_LBNP`, `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS`, `PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED`, `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION`, `PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS`.
- *3 Hard Clinical Safety Gates (`safety_gates.rs`):*
  1. *Gate 1 (Anticoagulation Lock):* Blocca anticoagulanti senza `pocus_thrombus_confirmed == true`.
  2. *Gate 2 (LBNP Anti-Syncope Auto-Vent):* Sfiata LBNP a `0 mmHg` se $Delta"SBP" > 15 " mmHg"$ o $"HR" > 115 " bpm"$.
  3. *Gate 3 (`0.38g` Mars Suit Damping):* Attiva `+25%` smorzamento tuta EVA se `GAI > 12%`.
- *Sicurezza Crittografica & Privacy:* `3` viste per ruolo (`NASA-STD-3001 Vol. 1 Ch. 7`), catena `SHA-256` per override (`Sha256AuditLogger`), cifratura `ChaCha20-Poly1305` con `ZeroizeOnDrop` e scudo `<untrusted_telemetry_observation>`.

= 3. Workspace a 8 Crate Safe Rust 2024 & `ARES-MedOS`

#table(
  columns: (auto, 1fr),
  stroke: 0.5pt + border-col,
  inset: 5pt,
  fill: (_, row) => if row == 0 { rgb("#e2e8f0") } else { white },
  [*Crate / Modulo*], [*Responsabilita Verificata (Blocchi A-L)*],
  [`ares-core-types`], [`TelemetryPacket`, `ProvenanceManifest`, `NASA-STD-3001`, `BinaryTelemetryFrame` (`128 B` `CRC-32C`), `ModelValidationStatus`],
  [`ares-telemetry-ingest`], [`BidmcReplayer` (`1 Hz`), `SqiFilter`, `WearableSensorPacket` (`32 B`), DSP Level-1 (`radar_csi_dsp`, `vocal_acoustic_dsp`, `waveform_rr_extractor`)],
  [`ares-causal-graph`], [`ADHG` (`petgraph`), ODE RK4 `SOST`, `tau_w` CGS, POCUS, `ARES-HyperGraph` (Welford `900 Sol`, `UBERON:`), `BioKG` (`16 B`), `DatasetGraph` (`24` fonti), Parquet adapters],
  [`ares-nqs-stl`], [`LemireMinWedge` $O(1)$, `TimestralBackbone`, `QuantileHead`, `ConformalAbstentionGate`, `SafeTensors` loader, `calibration_harness`],
  [`ares-medops-playbooks`], [Playbook DAG Type-1 `#01-#05`, 3 Hard Clinical Safety Gates, grounding `NASA-STD-3001` & `OCHMO MTB-007`],
  [`ares-security-privacy`], [`AresSecurityGuard`, `Sha256AuditLogger`, `ChaCha20-Poly1305` (`ZeroizeOnDrop`), `StrictMcpSanitizer`],
  [`ares-server-cli`], [`axum` `20 Hz` WS (`127.0.0.1:8080`), `FastMCP` (`8` tool `<= 600 B`), `SeqlockTelemetryRing`, `edge_llm_bridge`, `ares-calibrate`],
  [`ares-desktop-os`], [Shell nativa `Tauri v2` (`Channel<Response>` `128 B`), `--mode desktop` / `desktop-smoke-test`, hook `whisper-rs`],
  [`ares-cockpit/`], [React 19 + TypeScript + Three.js `#000000` OLED: `OsSystemStatusBar`, `OsCommandPalette` (`Alt+Space`), `OsVoiceCopilot`, `BodyHeatmap`, `WhatIfConsole`, `PlaybookRunner`],
)

= 4. Benchmark Verificati (`Block K --release`, `N = 1,000`) & Copertura Blocchi `A-L`

- *Integrita Workspace:* `126/126` test passanti su `28` suite (`Blocchi A-K`) + suite `Blocco L`, `0` warning Clippy, `0` `.unwrap()`/`.expect()` in produzione (`crates/*/src/`).
- *Latenze & Memoria (`--release`):* `SeqlockTelemetryRing::read_latest_bytes` `p50 = 42.0 ns` (`p99.9 = 84.0 ns`); pipeline 1-tick `p50 = 2.12 us` (`p99.9 = 5.58 us`); `DatasetGraph` query `p50 = 16.25 us`; `BioKG` lookup `p50 = 41.0 ns`; compattatore `900 Sol` `167,352 B < 200 KB`; `AresUnifiedDatasetGraph` (`110` nodi, `326` archi Biolink) `196,264 B` RAM stimata.

= 5. Matrice Multi-Agenzia (`24` Dataset Catalogati) & Ruolo Probatorio

#table(
  columns: (auto, 1fr, auto),
  stroke: 0.5pt + border-col,
  inset: 4.5pt,
  fill: (_, row) => if row == 0 { rgb("#e2e8f0") } else { white },
  [*Agenzia*], [*Dataset / Standard Integrati*], [*Evidence Role*],
  [PhysioNet], [`BIDMC v1.0.0` (`bidmc_01..03`, `ODC-By-1.0`)], [`RECORDED_REPLAY_INPUT`],
  [NASA OSDR], [`OSD-51`, `OSD-195`, `OSD-570/571`, `OSD-635`, `OSD-818`, `RR-1..RR-10`], [`BIOLOGICAL_CONTEXT_ONLY`],
  [NASA HRP / NLSP / LSAH], [`HRP Risks`, `ARCHeR`, `Zero T2`, `CIPHER`, `NASA-0000100`, `LSAH`, `CHAPEA`, `HERA`], [`CATALOG_GRAPH_METADATA`],
  [NASA Standards], [`NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F`, `OCHMO MTB-007`, `NSRL GCR`], [`NORMATIVE_REQUIREMENT_CONTEXT`],
  [CSA / ESA / DLR / JAXA], [`CANS (2026)`, `Bio-Monitor`, `Vascular`, `MARROW`, `Myotones`, `BRACE`, `AGBRESA`, `Bisphosphonates`], [`BIOMEDICAL_SCHEMA_CONTEXT`],
  [PhysioNet / NIH / UCI], [`CEBS`, `Fantasia`, `PPG-DaLiA`, `MIT-BIH`, `PTB-XL`, `MIMIC-IV`, `HiRID`, `MESA`, `SHHS`, `Look AHEAD`, `GTEA`], [`TECH_BENCHMARK_ONLY` / `CATALOG`],
)

= 6. Conformita NASA Space Apps 2026 (`Fresh Code`, AI Disclosure & CI)

Tutto il codice sorgente originale e rilasciato sotto doppia licenza permissiva *`MIT OR Apache-2.0`* utilizzando esclusivamente librerie open source standard (`tokio`, `axum`, `petgraph`, `tauri`, `react`, `three`, `typst`) e dataset pubblici citati. L'eventuale Edge LLM locale (`edge_llm_bridge.rs`) e confinato in modalita consultiva (`DAL-E`) sui soli `8` tool `FastMCP` (`<= 600 B`), con scudo `<untrusted_telemetry_observation>` e fallback deterministico `< 400 us`. La pipeline `scripts/build_submission_docs.sh` certifica offline i PDF Typst, le tracce `.srt`, l'assenza di emoji e la conformita integrale a `MODEL_EVIDENCE_AUDIT.md`.
