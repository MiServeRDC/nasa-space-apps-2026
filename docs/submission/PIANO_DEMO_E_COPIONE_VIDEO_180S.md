# ARES-Health // Piano Dimostrativo Cockpit e Copione Video Pitch (180 Secondi)
## NASA Space Apps Challenge 2026 — Track: Health Monitoring Software for Astronauts
### Team: ARES-Health // Lead Systems Architect: Fabio Malagutti

---

# PARTE 1: PROGETTAZIONE DELL'UTILIZZO DEL SITO WEB (DEMO WORKFLOW)

Questa sezione definisce la coreografia esatta per la navigazione interattiva del cockpit durante una sessione dimostrativa live davanti ai giudici o durante la registrazione dello schermo (tramite software come OpenScreen o OBS Studio).

## 1.1 Principi Guida della Dimostrazione
1. **Nessun Clic Casuale:** Ogni interazione dimostra un requisito specifico della traccia NASA o un vincolo fisiologico reale (microgravità, latenza radio, decondizionamento).
2. **Evidenziare l'Edge Computing:** Mostrare fin dai primi secondi che la piattaforma è 100% autonoma, priva di chiamate verso cloud esterni (air-gapped) e con reattività a latenza zero.
3. **Mostrare la Sicurezza Clinica (Safety Gating):** Il valore differenziale di ARES-Health rispetto a una dashboard convenzionale risiede nei suoi **Hard Clinical Safety Gates**, che impediscono all'equipaggio o all'automazione di compiere errori medici fatali.

---

## 1.2 Coreografia di Navigazione in 4 Atti

### Atto 0: Setup Iniziale e Framing (Secondi 0 - 15)
* **Vista:** Schermata iniziale a tutto schermo con tema Dark OLED `#000000`.
* **Azione del Presentatore:**
  1. Indicare la barra di stato superiore: mostrare il badge `AIR-GAPPED EDGE NATIVE`, il tempo di latenza radio `OWLT: 14m 12s` e il ticker di telemetria `LIVE 20 HZ`.
  2. Commutare la modalità in `OPERATIONAL`: disattivare l'autorotazione della vista 3D per trasmettere immediatamente l'approccio orientato alla concentrazione clinica (NASA-STD-3001).
* **Messaggio Chiave:** *"Siamo a metà rotta verso Marte. Houston è a 14 minuti luce di distanza. La telemedicina è impossibile: il sistema deve ragionare e proteggere l'astronauta in locale."*

### Atto 1: Fase GATHER — Integrità Telemetrica e Gestione dei Dropout (Secondi 15 - 45)
* **Vista:** Cliccare sul deck `1. GATHER` e aprire i tracciati telemetrici 2D.
* **Azione del Presentatore:**
  1. Selezionare il soggetto `BIDMC-SUBJECT-01`.
  2. Mostrare i segnali ad alta frequenza (ECG, PPG, Respirazione) renderizzati sul canvas con revision gating.
  3. Evidenziare la scheda dei parametri vitali: mostrare che dove i sensori presentano interruzioni o mancano dati di battito, il sistema mostra **`MISSING`** o **`BEAT_INTERVALS_NOT_AVAILABLE`** (con la linea del grafico che si solleva, *pen-lift*), **senza mai forzare a zero (0.0)** il valore.
  4. Mostrare il punteggio **SQI &ge; 0.70**: spiegare che gli artefatti di movimento vengono scartati prima di contaminare la catena diagnostica.
* **Messaggio Chiave:** *"Un software medico aerospaziale affidabile non inventa mai dati sintetici quando un elettrodo si stacca. Riconosce il dato mancante e degrada lo stato in modo sicuro."*

### Atto 2: Fase EVALUATE — Gemello Digitale 3D e Simulazione What-If (Secondi 45 - 95)
* **Vista:** Cliccare su `2. EVALUATE` e visualizzare il gemello digitale 3D.
* **Azione del Presentatore:**
  1. Mostrare il corpo anatomico: illustrare come la ridistribuzione dei fluidi in microgravità (cephalad shift) venga visualizzata tramite gli **archi causali di Bézier** che connettono le estremità inferiori alla vena giugulare e agli occhi.
  2. Isolare il sistema Cardiovascolare e zoomare sul collo: fare clic sul nodo giugulare (`UBERON:0001585`) per aprire il pannello di dettaglio con la tensione tangenziale di parete $\tau_w = 0.62\text{ dyn/cm}^2$ (sotto la soglia di Virchow di $1.0\text{ dyn/cm}^2$).
  3. Aprire la console **What-If** sul lato destro e manipolare gli slider:
     - Spostare `Cabin ppCO2` da $0.3$ a $4.8\text{ mmHg}$ (simulazione ipercapnia).
     - Ridurre `ARED Exercise Load` al $30\%$ (deficit carico meccanico su osso e muscolo).
     - Portare `Mission Day` a $180\text{ giorni}$.
  4. Mostrare l'aggiornamento istantaneo: in **meno di 1 millisecondo**, le equazioni ODE di Frost-Hargens ricalcolano lo stato, l'indice di rischio composito (MRI) sale e compaiono i coni quantilici predittivi EWMA-OLS a 24 ore.
* **Messaggio Chiave:** *"Non è un'animazione statica: sotto c'è un motore in Safe Rust che risolve sistemi differenziali accoppiati in tempo reale, proiettando dove si troverà la salute dell'astronauta tra 24 ore."*

### Atto 3: Fase ACT — MedOps Playbooks e i 4 Hard Safety Gates (Secondi 95 - 155)
* **Vista:** Cliccare su `3. ACT` ed entrare nel catalogo dei Playbook.
* **Azione del Presentatore (Momento Cruciale della Demo):**
  1. Selezionare il **Playbook #02: Internal Jugular Vein Thrombosis & Stasis**.
  2. **Dimostrazione Hard Gate 1 (Anticoagulazione):**
     - Puntare il cursore sul pulsante di somministrazione dell'anticoagulante sistemico (Eparina). Il pulsante è **BLOCCATO IN ROSSO (`GATE 1 LOCKED: POCUS REQUIRED`)**.
     - Spiegare il motivo: somministrare eparina per la sola stasi venosa in microgravità aumenterebbe a dismisura il rischio di emorragia cerebrale fatale in caso di trauma cranico.
     - Cliccare su *"Esegui Scansione POCUS"*: aprire la finestra dell'ecografo guidato e simulare la compressione venosa con visualizzazione del trombo intraluminale.
     - Mostrare che solo ORA il cancello di sicurezza commuta in verde e sblocca la procedura farmacologica.
  3. **Dimostrazione Hard Gate 2 (Anti-Sincope LBNP):**
     - Mostrare la contromisura LBNP (Lower Body Negative Pressure) a $-30\text{ mmHg}$.
     - Simulare una caduta improvvisa della pressione sistolica $> 15\text{ mmHg}$.
     - Mostrare che scatta l'allarme **`GATE 2 AUTO-VENT TRIGGERED`**: la camera a vuoto viene sfiatata istantaneamente a $0\text{ mmHg}$ per prevenire la sincope acuta dell'astronauta.
* **Messaggio Chiave:** *"ARES non è solo un monitor: è un guardiano clinico che applica interblocchi deterministici non bypassabili, salvaguardando l'equipaggio quando lo stress è massimo."*

### Atto 4: Chiusura e Audit Crittografico (Secondi 155 - 180)
* **Vista:** Aprire il drawer laterale `Audit & Provenance` (o premere `Cmd+K`).
* **Azione del Presentatore:**
  1. Mostrare la catena crittografica con hash SHA-256: ogni allarme, ogni scansione POCUS e ogni sfiato di emergenza è concatenato in un registro immutabile.
  2. Mostrare il pulsante del Deep Space Network (DSN) Portal: i log sono pronti per l'invio batch cifrato verso terra al prossimo aggancio radio.
* **Messaggio Chiave:** *"Tutto il codice è open-source, verificato con 167 test e privo di panic a runtime. Questa è l'assistenza sanitaria per il futuro dell'esplorazione umana di Marte."*

---

# PARTE 2: COPIONE VIDEO UFFICIALE (180 SECONDI / 3 MINUTI)

- **Target Durata:** Esattamente `03:00.000` (180 secondi).
- **Stile Visivo:** Ritmo serrato, montaggio dinamico, transizioni nette, interfaccia Dark OLED ad alto impatto.
- **Tono della Voce:** Autorevole, calmo, scientificamente rigoroso ma coinvolgente ed epico.

---

### SCENA 1: L'INNEASCO & IL VINCOLO DEEP SPACE (00:00 - 00:25)
- **Timecode:** `00:00` - `00:25` (Durata: 25s)
- **Video / Schermo:**
  - `00:00 - 00:06`: Animazione grafica o ripresa dello spazio profondo con la navicella in rotta verso Marte. Compare in sovrimpressione: *DISTANZA DALLA TERRA: 225 MILIONI DI KM &bull; RITARDO COMUNICAZIONE: 24 MINUTI*.
  - `00:06 - 00:15`: Transizione rapida sullo schermo del cockpit ARES-Health attivo al buio. Primo piano sul badge `OWLT: 14m 12s (AUTONOMOUS) [NASA-STD-3001]`.
  - `00:15 - 00:25`: Zoom out che rivela l'interfaccia single-screen completa a 20 Hz, con le forme d'onda che pulsano e il gemello 3D al centro.
- **Voce Narrante (Italiano):**
  > *"A 200 milioni di chilometri dalla Terra, un messaggio radio impiega oltre 20 minuti per viaggiare in una sola direzione.
  > Se un astronauta accusa un malore improvviso durante il transito verso Marte, la telemedicina da Houston è fisicamente impossibile.
  > Non esiste il cloud. Non c'è margine per le allucinazioni dei modelli linguistici.
  > Serve un sistema interamente a bordo, deterministico e autonomo: questo è ARES-Health."*
- **Testo in Sovrimpressione (Lower Thirds):**
  - `ARES-Health // Autonomous Resilient Edge-native System`
  - `Zero Cloud Dependency &bull; Air-Gapped Edge Execution`

---

### SCENA 2: FASE 1 — GATHER (ACQUISIZIONE & RIGORE DEI DATI) (00:25 - 00:55)
- **Timecode:** `00:25` - `00:55` (Durata: 30s)
- **Video / Schermo:**
  - `00:25 - 00:35`: Clic sul deck `GATHER`. Primo piano sul canvas 2D ad alta frequenza che traccia ECG, fotopletismografia PPG e respirazione.
  - `00:35 - 00:45`: Il mouse evidenzia il filtro di qualità `SQI: 0.94 [PASS]` e poi un intervallo con sensore staccato: la traccia si interrompe (*pen-lift*) e il valore diventa `MISSING`, senza mai crollare a `0.0`.
  - `00:45 - 00:55`: Inquadratura della tabella numerica dei parametri vitali (SBP, DBP, SpO2, HR) con certificazione di provenienza dai dataset di riferimento PhysioNet BIDMC v1.0.0.
- **Voce Narrante (Italiano):**
  > *"Il ciclo autonomo inizia dalla fase GATHER.
  > ARES riceve i flussi cardiorespiratori a 125 Hertz, validando ogni campione con indici di qualità morfologica e spettrale.
  > Ma soprattutto, applica un principio di onestà clinica assoluta: se un canale perde il segnale, non genera falsi zeri e non allucina numeri di default.
  > Riconosce il dato mancante, solleva la penna virtuale del tracciato e preserva la catena diagnostica da falsi allarmi disastrosi."*
- **Testo in Sovrimpressione (Lower Thirds):**
  - `GATHER Phase &bull; 125 Hz Raw Ingestion &bull; SQI >= 0.70`
  - `Issue #11 Strict Missingness Preservation &bull; Zero False Zeros`

---

### SCENA 3: FASE 2 — EVALUATE (GEMELLO 3D & MOTORE DIFFERENZIALE RUST) (00:55 - 01:40)
- **Timecode:** `00:55` - `01:40` (Durata: 45s)
- **Video / Schermo:**
  - `00:55 - 01:08`: Clic su `EVALUATE`. Lo stage 3D mostra il gemello digitale anatomico (passaggio fluido tra atlante maschile Z-Anatomy e femminile HRA). Si illuminano gli archi causali di Bézier che mostrano il sangue che risale verso la testa.
  - `01:08 - 01:20`: Clic sulla vena giugulare interna (`UBERON:0001585`): compare la scheda con la formula idrodinamica di Poiseuille-Womersley per la shear stress endoteliale (&tau;<sub>w</sub> = 0.62 dyn/cm&sup2;).
  - `01:20 - 01:40`: Apertura della console What-If. Il presentatore trascina lo slider di `Cabin ppCO2` a $4.8\text{ mmHg}$ e abbassa il carico dell'allenamento resistivo ARED.
  - Lo schermo mostra l'aggiornamento simultaneo in $< 1\text{ ms}$: il calcolo ODE di Frost-Hargens modella il riassorbimento osseo, il Mission Risk Index (MRI) sale e compaiono i coni quantilici predittivi EWMA-OLS a 24 ore.
- **Voce Narrante (Italiano):**
  > *"Nella fase EVALUATE entra in gioco il cuore computazionale di ARES: un motore in Safe Rust che fa girare un ipergrafo causale e risolve in tempo reale sistemi di equazioni differenziali ordinarie.
  > Il gemello 3D mappa nello spazio anatomico il decondizionamento della microgravità: la ridistribuzione dei fluidi, la dilatazione giugulare e il crollo dello shear stress endoteliale.
  > Con la console What-If, l'equipaggio può simulare istantaneamente qualsiasi perturbazione: aumentiamo la CO2 in cabina e riduciamo l'esercizio ARED.
  > In meno di un millisecondo, le equazioni di Frost e Hargens ricalcolano l'evoluzione clinica, tracciando le traiettorie predittive fino a 24 ore."*
- **Testo in Sovrimpressione (Lower Thirds):**
  - `EVALUATE Phase &bull; Safe Rust Differential Engine (p99 < 1 ms)`
  - `Frost-Hargens Coupled ODEs &bull; O(1) Lemire Wedge NQS-STL`

---

### SCENA 4: FASE 3 — ACT (PLAYBOOK MEDOPS & HARD SAFETY GATES) (01:40 - 02:30)
- **Timecode:** `01:40` - `02:30` (Durata: 50s)
- **Video / Schermo:**
  - `01:40 - 01:52`: Transizione su `ACT`. Si apre il catalogo dei 15 Playbook clinici di missione. Viene selezionato il **Playbook #02: Trombosi Venosa Giugulare e Stasi**.
  - `01:52 - 02:08`: **Focus sull'Hard Gate 1:** Il cursore tenta di selezionare la somministrazione di Eparina. L'azione è **BLOCCATA in rosso** con l'avviso: `HARD GATE 1 LOCKED: POCUS REQUIRED`.
  - `02:08 - 02:18`: Il medico attiva la finestra ecografica POCUS: esegue la compressione guidata della vena. Solo alla conferma visiva del trombo intraluminale, il cancello si sblocca in verde autorizzando il trattamento.
  - `02:18 - 02:30`: Dimostrazione rapida dell'**Hard Gate 2**: durante il protocollo LBNP a $-30\text{ mmHg}$, una simulata caduta pressoria (&Delta;SBP &gt; 15 mmHg) fa scattare l'auto-sfiato immediato della camera a vuoto a $0\text{ mmHg}$.
- **Voce Narrante (Italiano):**
  > *"Infine, la fase ACT: l'intervento.
  > ARES guida l'equipaggio attraverso 15 playbook clinici codificati come macchine a stati finiti.
  > Ma la vera innovazione sono i suoi 4 Hard Safety Gates, barriere di sicurezza non negoziabili derivate da NASA-STD-3001.
  > Di fronte a una stasi giugulare, il sistema blocca categoricamente gli anticoagulanti: somministrarli senza certezza ecografica esporrebbe l'astronauta a un'emorragia cerebrale fatale.
  > Solo quando l'ecografia POCUS guidata conferma la presenza del trombo, il cancello si apre.
  > E se durante una sessione LBNP la pressione crolla, l'Hard Gate 2 sfiata all'istante la camera a zero millimetri di mercurio, prevenendo la perdita di coscienza."*
- **Testo in Sovrimpressione (Lower Thirds):**
  - `ACT Phase &bull; 15 MedOps Playbooks &bull; 4 Hard Safety Gates`
  - `Hard Gate 1: No Anticoagulation without POCUS Thrombus`
  - `Hard Gate 2: LBNP Anti-Syncope Automatic Vent to 0 mmHg`

---

### SCENA 5: CHIUSURA, AUDIT & IMPATTO (02:30 - 03:00)
- **Timecode:** `02:30` - `03:00` (Durata: 30s)
- **Video / Schermo:**
  - `02:30 - 02:40`: Apertura del drawer `Audit & Provenance`: scorrimento rapido della catena di firme crittografiche SHA-256 che certificano l'integrità di ogni decisione clinica presa a bordo.
  - `02:40 - 02:50`: Sequenza rapida di verifica tecnica nel terminale: l'Agent Probe che conferma 0 unwrap/expect in Safe Rust, 167 test del cockpit superati e conformità NASA-STD-3001.
  - `02:50 - 03:00`: Logo finale ARES-Health con i crediti del team e il link al repository open-source. Fade out su nero.
- **Voce Narrante (Italiano):**
  > *"Ogni singola decisione, ogni allarme e ogni scansione viene registrata in una catena crittografica SHA-256, pronta per la sincronizzazione differita con la Terra via Deep Space Network.
  > 7 crate Safe Rust, 167 test automatizzati, zero crash a runtime, totale indipendenza dal cloud.
  > ARES-Health trasforma l'isolamento dello spazio profondo in resilienza clinica deterministica.
  > Perché su Marte, la vita dell'equipaggio non può dipendere da una connessione radio che non c'è."*
- **Testo in Sovrimpressione (Lower Thirds):**
  - `100% Open Source (MIT / Apache-2.0)`
  - `NASA Space Apps Challenge 2026 // ARES-Health`
  - `Lead Architect: Fabio Malagutti &bull; University of Bologna`

---

## 2.3 Note Tecniche per la Produzione Video
- **Risoluzione di Registrazione:** 1920x1080 (1080p a 60 FPS) o 4K a 60 FPS.
- **Browser per Registrare:** Google Chrome a schermo intero con zoom 100%, barra dei preferiti nascosta.
- **Microfono e Voce:** Registrazione pulita a 24-bit 48 kHz, con filtro de-esser e leggero compressore dinamico.
- **Musica di Sottofondo:** Traccia strumentale synth/orchestrale a volume moderato (-18 dB), con crescendo ritmico che parte all'inizio della Scena 3 (What-If) e raggiunge il culmine nella Scena 4 (Hard Gates).
