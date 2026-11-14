# ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health)
## Documento Master di Sintesi Architetturale, Funzionalità e Snapshot di Progetto

* **Progetto:** ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health)
* **Sfida Globale:** NASA Space Apps Challenge 2026 — *"Create Health Monitoring Software for Astronauts on Space Missions"*
* **Target di Missione:** Esplorazione dello Spazio Profondo / Missione Umana su Marte (Transito e Permanenza su Superficie marziana a $0.38g$)
* **Vincolo Operativo Primario:** Latenza Radio Unidirezionale Terra-Marte (OWLT) da **8.2 a 48.1 minuti**; impossibilità fisica della telemedicina terrestre sincrona; obbligo di autonomia diagnostica, prognostica e terapeutica edge-native di bordo a zero dipendenze cloud.
* **Baseline di Codice Attuale:** Commit `18c2be3` su `main` (sincronizzato con `origin/main` e `origin/work/fabiomalagutti27-droid`).
* **Stato di Certificazione:** 100% Verificato — 205 test unitari/integrazione Rust passati su 39 suite (9 crate workspace), 21 test Cockpit Node passati su 7 suite, 0 warning Clippy (`-D warnings`), 4/4 sonde Agent Probe passate, zero emoji, zero `.unwrap()`/`.expect()` in produzione, layout memory bank conforme a 29 file.

---

## 1. Visione di Sistema e Allineamento con la Consegna NASA

La sfida proposta dalla NASA richiede lo sviluppo di un software di monitoraggio dello stato di salute degli astronauti capace di operare in scenari di missione prolungata. Nella navigazione verso Marte, la distanza Terra-veicolo spaziale (fino a 400 milioni di chilometri) introduce un ritardo di comunicazione che preclude qualsiasi intervento medico in tempo reale da parte del controllo missione (Flight Surgeons al Mission Control Center di Houston o Huntsville).

ARES-Health risponde a questo imperativo categorico attraverso un'architettura **Edge-Native Pure-Rust (edizione 2021/2024)** che opera interamente a bordo veicolo con zero interpreti o runtime esterni, garantendo:
1. **Zero Allocazioni e Concorrenza Lock-Free:** Bus dati a memoria condivisa (Seqlock Ring Buffer a 4.096 slot da 128 byte con Castagnoli CRC-32C) che assorbe flussi telemetrici a 20 Hz e pacchetti da sensori indossabili (Wearable Packet V2 a 64 byte a 500 Hz) con latenza di lettura di appena **42 nanosecondi**.
2. **Modellazione Fisiopatologica Multi-Sistema Causale:** Grafo causale diretto a 13 nodi (ADHG) che integra emodinamica giugulare cefalica (shear stress $\tau_w$), meccano-trasduzione ossea (solutore RK4 Frost-Hargens per la Sclerostina), rischio litiasi renale (Tiselius AP(CaOx) RSR calibrato a $\kappa=0.255$), spostamento dei fluidi ortostatico e microgravitario (Gauer-Henry $\Delta PV\%$ con emolisi continua MARROW $-0.025\%$/Sol), ciclo circadiano marziano a 24.66 ore (modello a due processi Borbély S+C) e dinamica immuno-neuroendocrina (stress cortisolo/DHEA e riattivazione virale latente VZV/EBV/CMV).
3. **Logica Temporale Quantitativa e Coni di Previsione Monotoni Non Incrociati:** Motore NQS-STL ($O(1)$ con cuneo monotono di Lemire-Donzé) per il calcolo continuo del *Time-To-Violation* (TTV a 7 giorni) e dell'indice di prontezza di missione (*Mission Readiness Index*, MRI), accoppiato al co-processore probabilistico *Timestral* che emette quantili monotoni $q_{0.05} \le q_{0.50} \le q_{0.95}$ con barriera di astensione conforme adattiva (Conformal PID).
4. **4 Hard Clinical Safety Gates Inviolabili a Tempo Zero:** Meccanismi di sicurezza deterministici che bloccano categoricamente terapie invasive o rischiose (es. blocco anticoagulanti sistemici senza evidenza ecografica POCUS; sfiato automatico LBNP; limitazione dinamica tuta EVA a $0.38g$; blocco toracostomia con ago salvo conferma eFAST).
5. **15 MedOps Playbook Tipo-1 Cristallizzati:** Procedure cliniche d'emergenza ed esecuzione deterministica DAG in meno di **20 microsecondi**, ordinate secondo precedenza clinica salvavita (Trauma/Shock > Vitals Acuti > Urgenze d'Organo > Cronici/Subacuti).
6. **Integrità Epistemica e Separazione dei Dati:** Risoluzione rigorosa delle Issue #11 e #12, con chiara marcatura machine-readable dei dati reali registrati a terra (PhysioNet BIDMC v1.0.0 a 1 Hz con assenza di RMSSD preservata come `BEAT_INTERVALS_NOT_AVAILABLE`) rispetto ai modelli di simulazione What-If (`IllustrativeUnvalidated` / `IllustrativeScenarioRange`).
7. **Piattaforma Cockpit & Telemedicina Asincrona Integrata:** Interfaccia utente ad altissima densità in React 19, TypeScript e Three.js, comprendente la vista Cockpit di bordo a 20 Hz, il Connected Mission Portal per il Ground Control con simulazione della latenza radio Terra-Marte, l'OpenScreen Multi-Track Studio con spring physics smoothing, e il rotatable dual-gender 3D biodigital twin a 360 gradi.

---

## 2. Analisi Approfondita dei Contributi del Team e Cronologia dei Commit

Il progetto è il frutto della stretta collaborazione di 5 ingegneri e ricercatori distribuiti su branch tematici coordinati:

| Collaboratore | Handle GitHub | Branch di Lavoro | Commit Totali | Aree Principali di Proprietà e Contributo |
| :--- | :--- | :--- | :--- | :--- |
| **Fabio Malagutti** | `@fabiomalagutti27-droid` | `main`, `work/fabiomalagutti27-droid` | **23** | Architettura dei 9 crate Rust, Block 0 (Harness², 24 dataset), Blocchi A-D (tipi base, replay BIDMC, ODE Sclerostina, NQS-STL Lemire), Blocco H (Timestral RoPE/DHF), Blocco I (ARES-HyperGraph & BioKG a 16 byte), Blocco J (ARES-MedOS, IPC 128B CRC-32C, Seqlock, Tauri v2), Blocco K (System testing K1-K4 property-based, chaos SEU, benchmark), Blocco L (L1-L6, GATHER DSP radar/acustica, calibrazione anti-leakage CQR, Typst PDF), Blocco M (LSAH 3-tier storage), Blocco N (Fasi 38-41: Exploration Wearables V2, Tiselius RSR litiasi renale, Gauer-Henry fluid-shift, Mars circadian 24.66h, POCUS multi-organo, Playbooks #10-#15, Safety Gate 4), e unificazione finale multi-branch (`18c2be3`). |
| **Alessandro Nicolini** | `@MiServeRDC` / `CasALEkkio` | `work/MiServeRDC` | **13** | Crate `ares-security-privacy` (Fase 12, cifratura ChaCha20-Poly1305, Store-and-Forward DSN, catena hash SHA-256 non ripudiabile `Sha256AuditLogger`), Issue #4 (ingestione bundle PhysioNet BIDMC v1.0.0), Issue #11 / PR #20 (preservazione dell'assenza di RMSSD, `BEAT_INTERVALS_NOT_AVAILABLE`), Issue #12 (audit epistemico `MODEL_EVIDENCE_AUDIT.md`), modelli 3D Z-Anatomy (.glb in `public/anatomy/`), Blocco O (`71cb524`, Issue #29: Connected Mission Portal, OpenScreen Studio, hotkeys Vercel UI, dual-gender rotatable 3D twin). |
| **Carolina Bonafè** | `@carolina2910` | `work/carolina2910` | **17** | Progettazione UI Astronaut Cockpit React 19, modulo orientamento anatomico 3D (`AtlasBody.tsx`), integrazione della modale di audit crittografico SHA-256 (`AuditChainModal.tsx`), triage visivo ottico offline Canvas per lesioni e ustioni (`vlmInjuryEngine.ts`, `AiInjuryModal.tsx`), modello di calcolo dell'ipercalciuria urinaria da riassorbimento scheletrico (`scenario.ts`), e documentazione guidata sui dataset della NASA. |
| **Leonardo Perrone** | `@LelloXV` / `Leonardo` | `work/LelloXV` | **6** | Replay deterministico dei dati BIDMC (`ares-telemetry-ingest`), disaccoppiamento temporale della frequenza nativa 1 Hz rispetto al broadcast 20 Hz con invarianza del cursore su `POST /api/stress-test`, sparkline SVG `VitalsTrend` con sollevamento penna (pen-lift) sui campioni mancanti, layout Bedside Monitor in modalità GATHER, e standardizzazione dei target touch a 48px (`min-h-12`). |
| **Fernando Alonzi** | `@fertech02` | `work/fertech02` | **2** | Server HTTP/WebSocket Axum e router FastMCP stdio (Blocco G), motore causale di rilevazione anomalie sui parametri vitali (`VitalsAnomalyDetector`) basato su CUSUM e distanza di Mahalanobis $D^2$, predittore EWMA a 5 orizzonti (+5..120s), endpoint di iniezione anomalie `POST /api/inject-anomaly`, suite di 50 registrazioni `data/bidmc_eval/bidmc_04..53`, e Playbook d'emergenza acuta #06-#09. |

### Cronologia Dettagliata dei Commit Rilevanti

1. `30c9bd2`–`e2eaa90` (`@MiServeRDC`): Preparazione del workspace per NASA Space Apps Challenge, documentazione iniziale e allineamento repository.
2. `1c39c9e` (`@fabiomalagutti27-droid`): Aggiunta del dossier completo ARES-Health, tracciabilità normativa NASA-STD-3001 e mappatura dei 24 dataset multi-agenzia.
3. `6b13c9a` (`@fabiomalagutti27-droid`): Integrazione del bundle PhysioNet BIDMC v1.0.0 (Issue #4), schema di provenienza e prime 9 agent skills per lo sviluppo autonomo.
4. `ef729f3` (`@fabiomalagutti27-droid`): Implementazione e verifica dei primi 7 crate Rust attraverso le Fasi 01–14 (Blocchi A–G, 40 test passati al 100%).
5. `99b38b8`–`187b933` (`@MiServeRDC`): Risoluzione dell'Issue #11 (PR #20), eliminazione dei valori fittizi di RMSSD dai log e corretta propagazione di `BEAT_INTERVALS_NOT_AVAILABLE` su tutti i canali telematici.
6. `b4ca916` (`@MiServeRDC`): Risoluzione dell'Issue #12, introduzione del registro di evidenza `MODEL_EVIDENCE_AUDIT.md` e dell'indicatore machine-readable `IllustrativeUnvalidated`.
7. `4839090` (`@fabiomalagutti27-droid`): Implementazione delle Fasi 15–20 (Blocchi H e I: co-processore neuro-meccanistico Timestral, ARES-HyperGraph a 3 livelli, descrittore bio-ontologico a 16 byte e Unified Dataset Knowledge Graph con 110 nodi e 326 archi Biolink).
8. `cb77d96` (`@fabiomalagutti27-droid`): Implementazione del Blocco J (Fasi 21–24: ARES-MedOS, shell di missione nativa pure-Rust basata su Tauri v2, bus IPC lock-free a memoria condivisa da 128 byte con Castagnoli CRC-32C).
9. `08b055a` (`@fabiomalagutti27-droid`): Implementazione e verifica del Blocco K (Fasi 25–28: suite completa di test property-based, chaos testing SEU, contratti full-stack E2E e benchmark di latenza in nanosecondi certificato NASA-STD-3001).
10. `9438df2` (`@fabiomalagutti27-droid`): Implementazione del Blocco L (Fasi 29–34: binding Cockpit 3D, bus IPC Iceoryx2/Zenoh, Level-1 GATHER DSP per radar e voce, Edge Voice Copilot SafeTensors, calibrazione clinica CQR anti-leakage e generazione dossier di sottomissione Typst PDF).
11. `92d21a3` (`@fabiomalagutti27-droid`): Implementazione del Blocco M (Fasi 35–37: nono crate `ares-storage-lsah` per la persistenza su 900 Sol a 3 tier, e unificazione dei branch di Fernando, Alessandro, Carolina e Leonardo).
12. `e8b095c` (`@fabiomalagutti27-droid`): Implementazione del Blocco N (Fasi 38–41: Exploration Wearable Suite V2 compresso a 64 byte, modello Tiselius AP(CaOx) RSR per calcolosi renale, Gauer-Henry fluid shift ed emolisi microgravitaria MARROW, modello circadiano marziano Borbély 24.66h, riattivazione virale neuro-immune, POCUS multi-organo UBERON, Playbooks #10-#15 e Hard Safety Gate 4).
13. `71cb524` (`@MiServeRDC` / CasALEkkio): Integrazione del Blocco O (Issue #29: Connected Mission Portal per Ground Control, OpenScreen Multi-Track Studio con fisica a molla, tasti rapidi Vercel UI e rotatable dual-gender 3D twin).
14. `18c2be3` (`@fabiomalagutti27-droid`): **Merge Multi-Branch Finale e Chiusura Issue #28:** Unificazione a 2 genitori nel DAG Git tra `71cb524` e `332c8d6` (`origin/work/carolina2910`), porting della modale di audit SHA-256 e delle stime renali/ottiche, prevenendo la regressione silente di 4.494 righe con test suite al 100% verde su tutto il workspace.

---

## 3. Architettura del Workspace Cargo (9 Crate Rust & Layout Repository)

Il backend di ARES-Health è strutturato in 9 crate Rust modulari, compilabili con zero warning e conformi alla policy `#![forbid(unsafe_code)]` (ad eccezione delle primitive atomiche o allineate a livello hardware isolate e verificate):

```
spatiotemporal-mcp-engine/  (o nasa-space-apps-2026/)
├── crates/
│   ├── ares-core-types/          # ABI binaria C (128B/64B/32B/16B), struct DTO, costanti NASA-STD-3001, trait disaccoppiati
│   ├── ares-telemetry-ingest/    # Ingestione BIDMC CSV 1Hz, filtro entropia SQI, pacchetti wearable Hubris/V2, GATHER DSP
│   ├── ares-causal-graph/        # Grafo causale ADHG 13 nodi, ODE Sclerostina RK4, Tiselius litiasi, ARES-HyperGraph & BioKG
│   ├── ares-nqs-stl/             # Logica temporale NQS-STL Lemire, stimatore TTV/MRI, co-processore Timestral RoPE/DHF
│   ├── ares-medops-playbooks/    # Esecutore DAG Type-1 Playbooks #01-#15, modulo POCUS multi-organo, 4 Hard Safety Gates
│   ├── ares-security-privacy/    # Controllo ruoli NASA-STD-3001, catena hash SHA-256 non ripudiabile, AEAD ChaCha20-Poly1305
│   ├── ares-server-cli/          # Server Axum HTTP/WS 20Hz, Seqlock SPMC, bus shm_bus.rs, e router FastMCP stdio (8 tool)
│   ├── ares-desktop-os/          # Shell di missione nativa pure-Rust basata su Tauri v2 con bridge IPC zero-copy
│   └── ares-storage-lsah/        # Storage epidemiologico 3-tier a lungo termine per 900 Sol (Hot ring, Warm Arrow/HNSW, Cold AEAD)
├── ares-cockpit/                 # Interfaccia utente React 19, TypeScript, Vite, Tailwind CSS, Three.js (21/21 test Node)
├── contracts/                    # Schema contrattuale telemetria JSON (telemetry_schema.json) e fixture multi-branch
├── data/
│   ├── bidmc/                    # PhysioNet BIDMC v1.0.0 CSV a 1 Hz con checksum SHA-256 verificati
│   ├── bidmc_eval/               # 50 registrazioni aggiuntive di valutazione BIDMC (bidmc_04..53)
│   └── knowledge_graph/          # Esportazione JSON del grafo ontologico unificato a 24 dataset
├── deploy/medos/                 # Manifesti dichiarativi per Asterinas OS Framekernel e COSMIC Wayland Kiosk
├── docs/                         # Documentazione architetturale, scientifica (Typst PDF), piani e tracking
└── scripts/                      # Runner di collaudo: agent_probe.sh, launch_ares_medos.sh, build_submission_docs.sh
```

---

## 4. Cronologia e Mappatura delle 43 Fasi di Sviluppo (Blocchi 0, A–N, O)

### Blocco 0: Peer-Review Flight Surgeon, Red-Team & Grounding 24 Dataset [COMPLETATO]
* **Fase 0.1:** Rettifica dimensionale dello shear stress giugulare $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}(t)}$ ($\text{dyn/cm}^2$), formulazione dell'ODE meccano-trasduttiva della Sclerostina di Frost-Hargens ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), e specifica dei primi 3 Hard Safety Gates.
* **Fase 0.2:** Scraping sistematico e mappatura di 24 repository ufficiali: NASA HRP, NASA OSDR, NASA LSAH, NASA-STD-3001 Vol 1 Rev C & Vol 2 Rev F, CSA CANS 2026, ESA Myotones & BRACE, DLR AGBRESA, CHAPEA, HERA, TRISH EXPAND e PhysioNet BIDMC.
* **Fase 0.3:** Ingestione del bundle PhysioNet BIDMC v1.0.0 a 1 Hz (`bidmc_01..03_Numerics.csv`) con checksum SHA-256 e schema di provenienza dati.
* **Fase 0.4:** Configurazione dell'Agentic Harness² con 9 developer skills (`rust-pro`, `context7`, `deep-scholar`, ecc.) e script deterministico `agent_probe.sh`.

### Blocchi A–G: Fondamenta del Motore Fisiopatologico Rust (Fasi 01–14) [COMPLETATO]
* **Fase 01–02 (Blocco A):** Tipi DTO core, struct `TelemetryPacket`, costanti fisiche aerospaziali e trait disaccoppiati di sicurezza.
* **Fase 03–04 (Blocco B):** Parser CSV BIDMC a 1 Hz con gestione whitespace, filtro qualità del segnale ad entropia spettrale di Shannon ($SQI \ge 0.70$) e fusione What-If.
* **Fase 05–07 (Blocco C):** Solutore numerico RK4 a passo fisso per la Sclerostina, calcolo dimensionalmente esatto di $\tau_w$, curva dose-risposta LBNP ($-30\text{ mmHg}$), e osservatore Bayesiano POCUS a due stadi.
* **Fase 08–09 (Blocco D):** Monitor Normalized Quantitative Semantics STL con cuneo Lemire-Donzé $O(1)$, stimatore TTV EWMA-OLS a 7 giorni e indice MRI.
* **Fase 10–11 (Blocco E):** Esecutore DAG cristallizzato Type-1 per Playbooks #01–#05 e i primi 3 Hard Clinical Safety Gates.
* **Fase 12 (Blocco F):** Privacy medica per ruoli, catena hash SHA-256 non ripudiabile per gli override clinici, cifratura autenticata ChaCha20-Poly1305.
* **Fase 13–14 (Blocco G):** Server asincrono Axum HTTP/WS a 20 Hz e server FastMCP JSON-RPC 2.0 stdio con i primi 4 tool Context-Mode.

### Blocco H: Co-Processore Probabilistico Grey-Box Timestral (Fasi 15–17) [COMPLETATO]
* **Fase 15 (H1):** Backbone tensoriale in puro Rust senza dipendenze Python: `CausalScaler` ($asinh/sinh$), maschera di campioni mancanti per i 13 valori nulli di `bidmc_01`, `RmsNorm`, `FusedSwiGlu`, `SinCosRoPe` (Rotary Position Embeddings) e `DualAxisAttention` con `SdpaSigmoid`.
* **Fase 16 (H2):** Direct Multi-Horizon Forecasting (DHF) con `QuantileHead` triangolare ad accumulo monotono (`stable_softplus`) per garantire $q_{0.05} \le q_{0.50} \le q_{0.95}$ senza incroci quantilici, accoppiato a una porta di astensione conforme adattiva (Conformal PID).
* **Fase 17 (H3):** Bridge asincrono neuro-meccanistico tra il modello probabilistico a 1 Hz e il loop telemetrico lock-free a 20 Hz tramite puntatore immutabile e `try_read()`.

### Blocco I: ARES-HyperGraph & Unified Dataset Knowledge Graph (Fasi 18–20) [COMPLETATO]
* **Fase 18 (I1):** Compattatore longitudinale di Welford a super-nodi ($< 200\text{ KB}$ per 900 Sol marziani), sottografo delle 5 regioni anatomiche 3D con identificativi UBERON standard, e grafo deontico Q-STL per i 6 compartimenti dell'habitat.
* **Fase 19 (I2):** Descrittore bio-ontologico ad alte prestazioni `BiomedicalEvidenceDescriptor` (16 byte, `#[repr(C, align(16))]`, CRC-8, Noisy-OR per la fusione delle evidenze e mapping $O(1)$ alle clausole di sicurezza NASA-STD-3001).
* **Fase 20 (I3):** Costruttore del grafo ontologico unificato multi-dataset basato sullo standard SPOKE/BioCypher/PrimeKG/Biolink: 110 nodi, 326 archi tipizzati, 12 comunità biologiche e 4 tool FastMCP aggiuntivi.

### Blocco J: ARES-MedOS Shell & IPC a Memoria Condivisa (Fasi 21–24) [COMPLETATO]
* **Fase 21 (J1):** Protocollo IPC zero-copy con frame binario da 128 byte (`#[repr(C, align(64))]`) e checksum Castagnoli CRC-32C, integrato con l'anello SPMC `SeqlockTelemetryRing`.
* **Fase 22 (J2):** Crate `ares-desktop-os` basato su Tauri v2 per l'esecuzione come applicazione desktop nativa a basso consumo di memoria (30–50 MB RAM).
* **Fase 23 (J3):** Decoder DataView in TypeScript per l'interfaccia Cockpit, status bar di sistema OLED (#000000) e command palette FastMCP (Cmd+K / Alt+Space).
* **Fase 24 (J4):** Pacchetto per sensori indossabili compatto a 32 byte per sistemi operativi embedded a tolleranza di guasto (Oxide Hubris MCU con recovery da Single Event Upset).

### Blocco K: System Verification, Chaos Testing & Certificazione NASA-STD-3001 (Fasi 25–28) [COMPLETATO]
* **Fase 25 (K1):** 12 test deterministici property-based (convergenza RK4 $O(h^4)$, omogeneità CGS dello shear stress, assenza di quantile crossing su 10.000 simulazioni).
* **Fase 26 (K2):** 6 test di chaos testing clinico e iniezione di guasti SEU (bit-flip cosmici casuali, tamper detection su ChaCha20-Poly1305, isolamento di manomissioni sulla catena SHA-256).
* **Fase 27 (K3):** 3 test end-to-end full-stack per la parità bit-exact Rust-TypeScript tra `BinaryTelemetryFrame` e il decoder web.
* **Fase 28 (K4):** Certificazione prestazionale NASA-STD-3001 con benchmark in nanosecondi (`read_latest_bytes` a 42 ns, tick completo di pipeline a 2.12 µs).

### Blocco L: Operational Gap Closure, DSP Level-1 & Video/Pitch Submission (Fasi 29–34) [COMPLETATO]
* **Fase 29 (L1):** Collegamento bidirezionale della Cockpit con i modelli 3D GLB locali e visualizzazione dei coni predittivi STL a +15m..+24h.
* **Fase 30 (L2):** Bus IPC di livello aerospaziale Iceoryx2 con supporto a Zenoh per la trasmissione Store-and-Forward su collegamenti Deep Space Network (DSN) con ritardo fino a 852 secondi.
* **Fase 31 (L3):** Moduli DSP Level-1 a zero allocazioni per l'elaborazione di radar a microonde (vital signs senza contatto a 60 GHz) e analisi acustica vocale (algoritmo YIN per jitter e shimmer).
* **Fase 32 (L4):** Loader SafeTensors per modelli Edge LLM air-gapped verificati tramite SHA-256, con Voice Copilot basato su Whisper offline.
* **Fase 33 (L5):** Harness di calibrazione clinica conformata (CQR) con suddivisione a soggetti disgiunti (anti-data-leakage) su 53 registrazioni BIDMC.
* **Fase 34 (L6):** Pipeline deterministica Typst 0.15.1 per la compilazione automatica del pitch deck a 7 slide e del dossier di sottomissione in PDF.

### Blocco M: 3-Tier LSAH Persistence & Unificazione Multi-Branch (Fasi 35–37) [COMPLETATO]
* **Fase 35 (M1):** Crate `ares-storage-lsah` per la persistenza su 900 Sol con architettura gerarchica: Hot tier ad anello con isolamento stall SSD, Warm tier Apache Arrow IPC v2 con indice vettoriale HNSW, Cold tier cifrato con ChaCha20-Poly1305.
* **Fase 36 (M2):** Unificazione dei contributi del team (rilevazione anomalie di Fernando, modelli Z-Anatomy di Alessandro, triage ottico di Carolina, cadenza 1 Hz e sparkline di Leonardo).
* **Fase 37 (M3):** Collaudo integrato di sistema e validazione dell'assenza totale di regressioni.

### Blocco N: Multisystem Exploration Medicine & Wearable Suite V2 (Fasi 38–41) [COMPLETATO]
* **Fase 38 (N1):** Pacchetto per sensori indossabili avanzati `ExplorationWearablePacketV2` a 64 byte con allineamento a 64 bit, frequenza fino a 500 Hz, misurazione continua della pressione non invasiva (cNIBP), temperatura corporea interna, ossimetria cerebrale/muscolare NIRS a due lunghezze d'onda e accumulatore R-R a 128 slot con filtro ectopico di Malik.
* **Fase 39 (N2):** Modello matematico di Tiselius AP(CaOx) RSR per il rischio di calcolosi renale da ipercalciuria e microgravità, accoppiato al modello emodinamico di Gauer-Henry con emolisi progressiva MARROW ($-0.025\%$/Sol) e viscosità dipendente dall'ematocrito.
* **Fase 40 (N3):** Modello circadiano a due processi di Borbély S+C adattato al giorno marziano di 24.66 ore, curve di risposta di fase alla luce melanopica a 480 nm, predizione dei lapse cognitivi PVT-B, e modello di riattivazione virale da stress immuno-neuroendocrino.
* **Fase 41 (N4):** Modulo POCUS multi-organo (giugulare, oculare SANS, renale con grading idronefrosi, ed eFAST traumatica), Playbooks #10–#15 e introduzione dell'Hard Clinical Safety Gate 4 (blocco toracostomia con ago salvo conferma ecografica M-mode; blocco idoneità EVA su instabilità vitale o fatica cognitiva).

### Blocco O: Connected Mission Portal, OpenScreen Studio & 3D Twin (Fasi 42–43) [COMPLETATO]
* **Fase 42 (O1):** Connected Mission Portal per il controllo missione a terra con simulazione della latenza radio Terra-Marte, OpenScreen Multi-Track Studio per la riproduzione telemetrica sincronizzata con fisica a molla, e scorciatoie da tastiera accessibili ispirate a Vercel UI.
* **Fase 43 (O2):** Gemello digitale 3D procedurale e rotatorio a 360 gradi con dimorfismo sessuale maschile/femminile, simulazione visiva pulsatile del cephalad fluid shift, smorzamento inerziale orbitale e piena compatibilità con i modelli Z-Anatomy.

---

## 5. Frontend Astronaut Cockpit & Ground Control (`ares-cockpit`)

L'interfaccia utente è realizzata in **React 19, TypeScript e Tailwind CSS** con rendering 3D tramite **Three.js e React-Three-Fiber**. È ottimizzata per display OLED a bordo veicolo spaziale con sfondo nero assoluto (`#000000`) per preservare l'adattamento al buio e minimizzare i consumi elettrici.

### Le 4 Viste di Missione Principali
1. **`VIEW_COCKPIT` (Cockpit Astronauta di Bordo):** Vista operativa in tempo reale a 20 Hz organizzata secondo il workflow tri-fasico NASA:
   - **GATHER:** Visualizzazione dei segnali vitali grezzi (ECG waveform, pulsossimetria, capnografia $ppCO_2$, temperatura, cNIBP), indicatori di qualità del segnale (SQI) con mascheramento degli artefatti da movimento e pannello Bedside Monitor con sparkline SVG a sollevamento penna (`VitalsTrend`).
   - **EVALUATE:** Navigazione tra i sistemi fisiologici (Emodinamica giugulare, Asse Muscolo-Scheletrico con readout dell'ipercalciuria e perdita BMD, Rischio Oculare SANS, Rischio Renale Tiselius, Stato Circadiano-Cognitivo e Immunitario), coni previsionali STL Lemire a +15m..+24h e gemello 3D anatomico.
   - **ACT:** Esecutore interattivo dei 15 MedOps Playbook con step-by-step guidato, checklist d'azione rapida, e barriere visive insuperabili per i 4 Safety Gates.
2. **`VIEW_PORTAL` (Connected Ground Telemedicine Portal):** Console dedicata ai Flight Surgeons terrestri, dotata di selettore della latenza orbitale Terra-Marte OWLT (da 8.2 a 48.1 min), monitor dello Store-and-Forward crittografico DSN, stazione di revisione POCUS asincrona e Atlante Scientifico completo per la consultazione dei 24 dataset.
3. **`VIEW_TWIN` (Rotatable 3D Biodigital Twin Viewport):** Visualizzatore a schermo intero del gemello digitale procedurale rotatorio a 360 gradi con controlli inerziali OrbitControls, commutazione morfometrica istantanea tra anatomia maschile e femminile (`MALE` / `FEMALE`), deformazione volumetrica per lo spostamento dei fluidi cefalici e sovrapposizione termica delle evidenze bio-ontologiche UBERON.
4. **`VIEW_STUDIO` (OpenScreen Multi-Track Studio):** Studio di riproduzione telemetrica avanzato basato sui principi dell'architettura open-source OpenScreen, dotato di cambio dinamico di layout (Split Screen, Picture-in-Picture, Focus View), scrubber temporale interattivo, tracciato elettrocardiografico a scorrimento continuo ed equazioni di smorzamento a molla per la telecamera ($m \ddot{x} + c \dot{x} + k(x - x_t) = 0$).

### Moduli Funzionali Chiave
* **Triage Ottico Offline (`vlmInjuryEngine.ts` & `AiInjuryModal.tsx`):** Modulo di analisi spettrale delle immagini di lesioni cutanee ed ustioni, eseguito interamente su HTML5 Canvas locale senza chiamate esterne (`OPTICAL_RGB_HEURISTIC_V1` sotto `ILLUSTRATIVE_UNVALIDATED`), integrato con filtri di controllo del contrasto e della gamma dinamica per richiedere la riacquisizione sotto luce ottimale.
* **Registro di Audit Crittografico SHA-256 (`AuditChainModal.tsx`):** Registro immutabile a prova di manomissione collegato alla rotta backend `GET /api/audit-log` per la conformità allo standard di non-ripudio NASA-STD-3001 Vol. 1 Cap. 7, con distinzione trasparente tra ledger di bordo reale e preview simulata.
* **Scorciatoie Globali da Tastiera (`KeyboardShortcutsModal.tsx`):** Overlay di guida rapida accessibile conforme agli standard NASA, attivabile tramite `?`, con supporto per la selezione rapida delle viste (`1` Cockpit, `2` Portal, `3` Twin, `4` Studio) e commutazione del sesso (`M`/`F`).
* **Copilot Vocale Offline (`OsVoiceCopilot.tsx`):** Interfaccia vocale hands-free guidata da router semantico locale per query telemetriche e dispatch di playbook in microgravità.

---

## 6. I 4 Hard Clinical Safety Gates di ARES-Health

I Safety Gate sono barriere algoritmiche e procedurali non oltrepassabili via software, progettate per impedire errori iatrogeni fatali causati da decondizionamento o stress cognitivo dell'equipaggio:

| Safety Gate | Denominazione Operativa | Condizione Clinica di Lockout | Meccanismo Deterministico di Enforcement | Standard Normativo di Riferimento |
| :--- | :--- | :--- | :--- | :--- |
| **Gate 1** | **Anticoagulation POCUS Lockout** | Trombosi venosa giugulare interna (IJV) sospettata su base clinica o stasi emodinamica ($\tau_w < 1.0\text{ dyn/cm}^2$). | Blocco software assoluto della somministrazione di anticoagulanti sistemici (es. Enoxaparina) fino alla conferma ecografica POCUS di trombo endoluminale documentato (probabilità a 2 stadi $P \ge 0.92$). Impedisce emorragie intracraniche letali da trauma cranico occulto. | NASA-STD-3001 Vol. 1 Rev C, OCHMO MTB-007 |
| **Gate 2** | **LBNP Anti-Syncope Auto-Vent** | Trattamento di decompressione della parte inferiore del corpo (LBNP a $-30\text{ mmHg}$) per contrastare il cephalad fluid shift e la sindrome SANS. | Apertura automatica istantanea delle valvole di sfiato della camera LBNP a $0\text{ mmHg}$ se la pressione arteriosa sistolica cala di oltre $15\text{ mmHg}$ ($\Delta\text{SBP} > 15$) o se la frequenza cardiaca supera i $115\text{ bpm}$. Previene il collasso presincopale ortostatico. | NASA HRP Risk of Orthostatic Intolerance, NASA-STD-3001 [V2 7038] |
| **Gate 3** | **Martian EVA Gait Damping Lock** | Camminata su superficie marziana a $0.38g$ dopo 6 mesi di transito in microgravità con atrofia del muscolo soleo. | Limitazione dinamica e smorzamento degli attuatori esoscheletrici della tuta spaziale se l'indice di asimmetria dell'andatura supera il 12% ($GAI > 12\%$), imponendo il rientro in modulo o la deambulazione assistita per prevenire fratture da stress del calcagno e cadute. | NASA HRP Bone Fracture Risk, NASA-STD-3001 [V1 3004] |
| **Gate 4A** | **Invasive Thoracic Decompression Lock** | Sospetto pneumotorace iperteso post-trauma o post-EVA. | Blocco dell'autorizzazione alla toracostomia con ago o inserimento di tubo toracico salvo evidenza ecografica M-mode del "segno del codice a barre" (assenza di lung sliding) su scansione eFAST o quadro di shock ostruttivo manifesto ($SI \ge 1.20, SpO_2 < 85\%$). | NASA-STD-3001 Vol. 1 Ch. 4 (Emergency Medical Care) |
| **Gate 4B** | **EVA Fitness-For-Duty Lockout** | Valutazione pre-EVA per attività extraveicolari su superficie o manutenzione esterna veicolo. | Stato NO-GO categorico all'apertura del portello se l'astronauta presenta instabilità emodinamica ($SI \ge 0.90$), fatica cognitiva o privazione di sonno ($P_{\text{lapse}} \ge 0.75$), o decondizionamento muscolare ($GAI > 12\%$). | NASA-STD-3001 Vol. 2 [V2 6001], Flight Rules Section 14 |

---

## 7. I 15 MedOps Playbook Tipo-1 Cristallizzati

Tutti i 15 playbook sono codificati come grafi aciclici diretti (DAG) in pura memoria e compilati in codice macchina. L'esecuzione completa di qualsiasi playbook richiede **meno di 20 microsecondi**, garantendo una risposta istantanea in emergenza:

| ID Playbook | Titolo Procedura Clinica | Bersaglio Fisiologico | Regola di Attivazione e Trigger STL | Tempo Esecuzione | Precedenza Clinica Deterministica |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **#01** | `PLAYBOOK_01_VENOUS_STASIS_LBNP` | Emodinamica IJV & Rischio Trombo | Stasi venosa giugulare ($\tau_w < 1.0\text{ dyn/cm}^2$, flusso retrogrado). | $< 15\ \mu\text{s}$ | Subacuta / Terapeutica (Priorità 5) |
| **#02** | `PLAYBOOK_02_SANS_OPTIC_SHEATH` | Pressione Intracranica & Diametro ONSD | Ipertensione endocranica ($\text{ONSD} > 5.8\text{ mm}$, cefalea, edema papillare). | $< 18\ \mu\text{s}$ | Urgenza d'Organo (Priorità 3) |
| **#03** | `PLAYBOOK_03_ARED_RESISTIVE_EXERCISE` | Atrofia Muscolo Soleo & Sclerostina | Decondizionamento muscolo-scheletrico ($\text{SOST} > 350\text{ pg/mL}$, soleo $< 10.5\text{ mm}$). | $< 14\ \mu\text{s}$ | Preventiva / Cronica (Priorità 6) |
| **#04** | `PLAYBOOK_04_POCUS_ULTRASOUND_EXAM` | Rilevazione e Diagnostica Ecografica | Protocollo di scansione guidata per IJV, nervo ottico, reni ed eFAST. | $< 16\ \mu\text{s}$ | Diagnostica di Supporto (Priorità 4) |
| **#05** | `PLAYBOOK_05_HYPERCAPNIA_SCRUBBER` | Frazione Inspirata di $CO_2$ in Cabina | Ipercapnia ambientale da accumulo ($ppCO_2 > 4.0\text{ mmHg}$). | $< 12\ \mu\text{s}$ | Ambientale / Tossicologica (Priorità 3) |
| **#06** | `PLAYBOOK_06_ACUTE_DESATURATION` | Saturazione Emoglobinica d'Ossigeno | Ipossia acuta rapida ($SpO_2 < 90\%$, $\Delta SpO_2 / \Delta t < -2\%/\text{s}$). | $< 10\ \mu\text{s}$ | Vitals Acuta d'Emergenza (Priorità 2) |
| **#07** | `PLAYBOOK_07_ACUTE_TACHYCARDIA` | Frequenza Cardiaca & Ritmo | Tachiaritmia instabile ($\text{HR} > 140\text{ bpm}$ a riposo con de-escalation). | $< 11\ \mu\text{s}$ | Vitals Acuta d'Emergenza (Priorità 2) |
| **#08** | `PLAYBOOK_08_SENSOR_REATTACHMENT` | Qualità Segnale Elettrofisiologico | Distacco elettrodo o caduta qualità ($SQI < 0.60$ per $> 15\text{ s}$). | $< 8\ \mu\text{s}$ | Integrità del Segnale (Priorità 6) |
| **#09** | `PLAYBOOK_09_SEPSIS_INFLAMMATORY` | Emodinamica Sistemica & Shock Index | Disfunzione microvascolare e shock settico ($SI \ge 1.0$, ipotensione). | $< 16\ \mu\text{s}$ | Vitals Acuta d'Emergenza (Priorità 2) |
| **#10** | `PLAYBOOK_10_RENAL_LITHIASIS_COLIC` | Reni, Ureteri e Vescica | Colica renale da litiasi calcica ($AP(\text{CaOx}) > 2.0$, dolore al fianco, ematuria). | $< 15\ \mu\text{s}$ | Urgenza d'Organo (Priorità 3) |
| **#11** | `PLAYBOOK_11_MARS_ENTRY_FLUID_LOAD` | Volume Intravascolare Pre-Atterraggio | Protocollo di carico idro-salino pre-ingresso gravitazionale su Marte a $0.38g$. | $< 14\ \mu\text{s}$ | Subacuta di Transizione (Priorità 5) |
| **#12** | `PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE` | Ritmo Sonno-Veglia & Vigilanza | Desincronizzazione circadiana marziana e privazione di sonno ($P_{\text{lapse}} > 0.60$). | $< 12\ \mu\text{s}$ | Preventiva Neuro-Cognitiva (Priorità 6) |
| **#13** | `PLAYBOOK_13_IMMUNE_VIRAL_CONTAINMENT` | Sistema Immunitario & Carica Virale | Riattivazione virale latente indotta da stress (Herpes Zoster, lesioni cutanee). | $< 15\ \mu\text{s}$ | Subacuta Infettiva (Priorità 5) |
| **#14** | `PLAYBOOK_14_CO2_SANS_MITIGATION` | Flusso Cerebrale & Ipertensione Venosa | Vasodilatazione cerebrale da $CO_2$ concomitante con stasi venosa e cefalea. | $< 13\ \mu\text{s}$ | Urgenza d'Organo (Priorità 3) |
| **#15** | `PLAYBOOK_15_EFAST_TRAUMA_TRIAGE` | Cavità Pleuro-Peritoneali & Pericardio | Trauma da impatto, decompressione cabina, sospetto pneumotorace o emotorace. | $< 18\ \mu\text{s}$ | **Massima Urgenza: Trauma / Shock (Priorità 1)** |

---

## 8. Grounding Scientifico, Ontologie e i 24 Dataset Multi-Agenzia

ARES-Health integra 24 banche dati e registri epidemiologici ufficiali delle maggiori agenzie spaziali e sanitarie mondiali:

| ID Dataset | Denominazione Ufficiale | Agenzia / Ente | Contenuto Clinico e Utilizzo nel Modello |
| :--- | :--- | :--- | :--- |
| **DS-01** | NASA Human Research Program (HRP) Risks | NASA | Tassonomia dei 30 rischi umani nello spazio profondo (radiazioni, isolamento, gravità, ambiente). |
| **DS-02** | NASA HRP ARCHeR | NASA | Registro di architettura delle contromisure per l'esplorazione spaziale. |
| **DS-03** | NASA HRP Venous Haemostasis Study | NASA | Dati ultrasonografici sul flusso IJV e stasi venosa in 11 astronauti su ISS. |
| **DS-04** | NASA HRP Zero T2 Study | NASA | Efficacia delle contromisure senza tapis roulant mediante cyclette e sollevamento pesi. |
| **DS-05** | NASA HRP CIPHER Project | NASA | Monitoraggio multi-sistema integrato per missioni fino a 365 giorni su ISS. |
| **DS-06** | NASA OSDR OSD-51 | NASA | Profilazione transcrittomica del tessuto muscolare scheletrico in microgravità. |
| **DS-07** | NASA OSDR OSD-195 | NASA | Microarray genomico sull'espressione genica delle cellule endoteliali venose. |
| **DS-08** | NASA OSDR OSD-570 / OSD-571 | NASA | Dati multi-omici sui campioni biologici della missione Inspiration4. |
| **DS-09** | NASA OSDR OSD-818 | NASA | Modello *ex vivo* translaminare per lo studio dello shear stress e della sindrome SANS. |
| **DS-10** | NASA NLSP NASA-0000100 | NASA | Archivio integrato di scienze della vita spaziale per lo studio del rimodellamento osseo. |
| **DS-11** | NASA NLSP Bed Rest Studies (BRSMFSR/BRSMPT)| NASA | Studi di immobilizzazione a letto prolungata con inclinazione a testa in giù (-6° HDT). |
| **DS-12** | NASA LSAH Longitudinal Epidemiology | NASA | Archivio epidemiologico longitudinale della salute degli astronauti (Mercury -> ISS). |
| **DS-13** | NASA-STD-3001 Volume 1 Rev C | NASA | Standard dei requisiti medici e di assistenza sanitaria dell'equipaggio. |
| **DS-14** | NASA-STD-3001 Volume 2 Rev F | NASA | Requisiti di progettazione del veicolo e dei sistemi di supporto vitale per la salute umana. |
| **DS-15** | CSA CANS 2026 | Agenzia Spaziale Canadese | Spettrometria di dosimetria neutronica continua e monitoraggio radiologico tissutale. |
| **DS-16** | CSA Bio-Monitor & Vascular Aging | Agenzia Spaziale Canadese | Rigidità arteriosa e monitoraggio continuo con indumento biometrico intelligente. |
| **DS-17** | CSA MARROW Study | Agenzia Spaziale Canadese | Quantificazione del tasso di emolisi microgravitaria primaria nei globuli rossi ($-0.025\%$/Sol). |
| **DS-18** | ESA Myotones (2026) | Agenzia Spaziale Europea | Proprietà viscoelastiche, tono e rigidità del muscolo soleo e gastrocnemio in volo. |
| **DS-19** | ESA BRACE Bed Rest Study | Agenzia Spaziale Europea | Valutazione dell'esercizio resistivo e dell'apporto nutrizionale contro l'atrofia muscolare. |
| **DS-20** | DLR :envihab AGBRESA Study | Agenzia Spaziale Tedesca | Centrifugazione a braccio corto a gravità artificiale continua vs intermittente. |
| **DS-21** | NASA CHAPEA 378-Day Mars Analog | NASA | Simulazione marziana terrestre di 378 giorni per lo stress cognitivo e l'interazione sociale. |
| **DS-22** | TRISH EXPAND & HERMES Databases | TRISH / Baylor College | Database di biomarcatori e parametri fisiologici per voli commerciali orbitali. |
| **DS-23** | NASA-JAXA Bisphosphonates Bed Rest | NASA / JAXA | Sperimentazione clinica di farmaci anti-riassorbimento osseo associati ad esercizio ARED. |
| **DS-24** | PhysioNet BIDMC PPG & Respiration v1.0.0 | PhysioNet / BIDMC | Registrazioni reali a terra (53 soggetti a 1 Hz) per la validazione di frequenza cardiaca e SpO2. |

---

## 9. Metriche di Qualità, Test e Certificazione di Sistema

Il software è stato validato tramite una batteria di test esaustiva:

| Parametro di Qualità | Valore Rilevato | Soglia Limite / Requisito | Stato di Conformità |
| :--- | :--- | :--- | :--- |
| **Rust Workspace Tests** | **205 passati / 0 falliti** | 100% pass rate su tutti i 9 crate | **CONFORME** |
| **Rust Clippy Warnings** | **0 avvisi / 0 errori** | Flag `-D warnings` applicato | **CONFORME** |
| **Cockpit TypeScript Tests** | **21 passati / 0 falliti** | 7 suite Node (`tests/*.test.ts`) | **CONFORME** |
| **TypeScript Typecheck** | **0 errori** | `tsc -b --noEmit` su 624 moduli | **CONFORME** |
| **Cockpit Production Build** | **Compilato in 2.02s** | Bundle Vite pronto per produzione | **CONFORME** |
| **Zero Panics Policy** | **0 invocazioni** | Vietati `.unwrap()` e `.expect()` in produzione | **CONFORME** |
| **Zero Unicode Emojis** | **0 caratteri rilevati** | Zero emoji o dingbat nei sorgenti | **CONFORME** |
| **Agent Probes (4/4)** | **Tutte e 4 superate** | Script deterministico `agent_probe.sh` | **CONFORME** |
| **Latenza Lettura IPC** | **42 nanosecondi** (p50/p99) | Budget massimo consentito: $1.000\text{ ns}$ | **ECCELLENTE** |
| **Latenza Tick Pipeline** | **2.12 microsecondi** (p50) | Budget massimo consentito: $50.000\ \mu\text{s}$ | **ECCELLENTE** |
| **Esecuzione MedOps Playbook**| **$< 20$ microsecondi** | Budget massimo consentito: $1.000\ \mu\text{s}$ | **ECCELLENTE** |
| **Compattazione 900 Sol** | **167.352 byte** | Limite massimo consentito: $< 200\text{ KB}$ | **CONFORME** |
| **Typst PDF Submission** | **Compilazione deterministica** | 7 slide esatte e dossier da 3 pagine | **CONFORME** |

---

## 10. Stato Attuale del Main (`18c2be3`) & Prossimi Passi

Il repository si trova in uno stato di **completa maturità e convergenza tecnica**:
* Il branch `main` e il tracking branch `origin/main` coincidono al commit `18c2be3`.
* Tutti i branch dei collaboratori (`work/MiServeRDC`, `work/carolina2910`, `work/LelloXV`, `work/fertech02`) sono stati integrati, armonizzati e collaudati senza alcun conflitto o regressione.
* Le Issue ufficiali su GitHub tracciano lo stato avanzato:
  - [Issue #28: ARES-Health Project Status & Final Architecture: Blocks A-N Complete](https://github.com/MiServeRDC/nasa-space-apps-2026/issues/28)
  - [Issue #29: Connected Mission Portal, OpenScreen Studio & Rotatable 3D Twin](https://github.com/MiServeRDC/nasa-space-apps-2026/issues/29)

### Azioni Consigliate per il Team
1. **Registrazione Video Pitch e Walkthrough (Fase L6):**
   - Utilizzare la suite OpenScreen Studio e la vista Cockpit con lo script `docs/submission/WALKTHROUGH_180S_DEMO_SCRIPT.md` e i file sottotitoli `.srt` già compilati.
2. **Preparazione Portale Sottomissione NASA Space Apps:**
   - Caricare il PDF generato `NASA_2026_7_SLIDE_DECK.pdf` e collegare il repository GitHub `MiServeRDC/nasa-space-apps-2026`.
3. **Mantenimento dell'Integrità Epistemica:**
   - Preservare in sede di esposizione e presentazione la netta distinzione etica e clinica sancita dalle Issue #11 e #12 tra le registrazioni reali e i modelli illustrativi di simulazione.
