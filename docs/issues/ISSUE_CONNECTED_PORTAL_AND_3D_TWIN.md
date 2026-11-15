# Issue: Unificazione Connected Mission Portal, OpenScreen Studio e Rotatable Dual-Gender 3D Anatomical Twin

## 1. Identificativo e Obiettivi
* **Titolo Issue:** [FEAT] Connected Mission Portal, OpenScreen Studio & Rotatable Dual-Gender 3D Anatomical Twin (Fasi 30-31 / M1-M2)
* **Branch Target:** `main`
* **Modulo / Ambito:** `ares-cockpit/` (React 19 + TypeScript + Tailwind CSS + Three.js / React-Three-Fiber) e documentazione architetturale (`docs/plans/`, `memory-bank/`)
* **Stato:** Implementato, verificato ed integrato senza conflitti con i Blocchi J, K, L, M, N pushati da ARES-Health Core Engineering Team.

---

## 2. Sintesi Esecutiva
Nell'ambito della sfida NASA Space Apps Challenge 2026 ("Create Health Monitoring Software for Astronauts on Space Missions"), la missione verso Marte affronta una latenza radio unidirezionale da 8 a 48 minuti (OWLT). Questo rende fisicamente impossibile la telemedicina sincrona terrestre e impone un'architettura rigorosamente edge-native a bordo veicolo.

Tuttavia, per supportare i clinici di Terra (Ground Control Flight Surgeons a Houston/Huntsville) e consentire la revisione asincrona della telemetria, e stato sviluppato un ecosistema web integrato che unisce:
1. **Connected Mission Portal:** una vista web ad alta densita informativa per il Ground Control, con simulazione della latenza orbitale Terra-Marte, monitor dello Store-and-Forward crittografico DSN (Deep Space Network), e un Atlante Scientifico completo per la consultazione e il grounding dei 24 dataset multi-agenzia (NASA HRP, NASA OSDR, NASA LSAH, CSA CANS, ESA Myotones, DLR AGBRESA, PhysioNet BIDMC).
2. **OpenScreen Multi-Track Studio:** uno studio di riproduzione telemetrica ispirato all'architettura open-source di OpenScreen (`getopenscreen/openscreen`), con commutazione multi-traccia dinamica (Split View, Picture-in-Picture, Focus View), scrubber temporale, tracciato elettrocardiografico a scorrimento (EcgStrip) e spring-physics camera zooming.
3. **Modalita Scorciatoie da Tastiera Vercel UI:** un overlay accessibile ispirato a `vercel-labs/ui` con interazione modale nativa e supporto globale per tasti rapidi (`1`-`4` per le viste, `M`/`F` per il dimorfismo sessuale, `?` per l'indice dei tasti, `ESC` per chiusura).
4. **Rotatable Dual-Gender 3D Anatomical Biodigital Twin:** un gemello digitale 3D procedurale e rotatorio a 360 gradi con differenziazione morfometrica maschile/femminile (dimorfismo pelvico, gabbia toracica, masse muscolari scheletriche differenziali), simulazione pulsatile del cephalad fluid shift microgravitario, smorzamento inerziale orbitale (`dampingFactor: 0.05`), vincoli di zoom da 1.2m a 6.5m, e piena compatibilita null-safe sia per simulazioni microgravitarie sintetiche che per replay di dataset terrestri BIDMC (dove i parametri emodinamici microgravitari non sono presenti).

---

## 3. Riferimenti alle Ricerche ed Ispirazioni Open-Source
L'architettura e stata progettata attingendo a fonti aperte all'avanguardia:
1. **OpenScreen (`getopenscreen/openscreen`):** modello matematico di fisica a molla smorzata del secondo ordine per il movimento continuo della telecamera:
   $$m \ddot{x} + c \dot{x} + k(x - x_t) = 0$$
   con costanti di smorzamento calibrate ($k = 340\text{ N/m}$, $c = 38\text{ N}\cdot\text{s/m}$, $m = 0.85\text{ kg}$) implementate in `ares-cockpit/src/lib/motionSmoothing.ts`.
2. **Vercel UI (`vercel-labs/ui`):** principi di minimalismo funzionale, contrasto estremo su sfondo nero puro (`#000000` OLED per preservare la visione notturna e consumi minimi in microgravita), palette conforme a NASA-STD-3001, e accessibilita basata su tastiera senza dipendenze cloud.
3. **NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F:** conformita dimensionale esatta, touch target minimi di 44x44 punti, assenza di animazioni superflue che causino disorientamento neuro-vestibolare in microgravita.

---

## 4. Moduli Implementati e Struttura File

### 4.1 Navigazione Multi-Vista (`MissionSuiteNavbar.tsx`)
* Percorso: `ares-cockpit/src/modules/navigation/MissionSuiteNavbar.tsx`
* Funzionalita: barra di navigazione unificata in testa allo schermo che consente il passaggio istantaneo senza ricaricamento di pagina tra:
  - `VIEW_COCKPIT`: Dashboard Astronauta a bordo veicolo (20 Hz, latenza sub-millisecondo, streaming WebSocket locale `127.0.0.1:8080`).
  - `VIEW_PORTAL`: Ground Control Telemedicine & 24-Dataset Atlas.
  - `VIEW_TWIN`: Biodigital Twin 3D Viewport a pieno schermo.
  - `VIEW_STUDIO`: OpenScreen Multi-Track Telemetry Player.
* Fornisce indicatori di stato del collegamento (`ONLINE`, `DEGRADED`, `DISCONNECTED`), livello di allarme, identificativo dell'astronauta, selettore sesso (`MALE` / `FEMALE`), e pulsante di apertura modale scorciatoie (`?`).

### 4.2 Portale Telemedicina e Atlante Scientifico (`MissionPortal.tsx`)
* Percorso: `ares-cockpit/src/modules/portal/MissionPortal.tsx`
* Funzionalita:
  - Simulatore di latenza Deep Space Network (DSN) con buffer di ritardo programmabile da 4 a 24 minuti unidirezionali (OWLT).
  - Tele-Echography POCUS Review Station: visualizzatore di immagini ecografiche statiche e cinematiche per la conferma del trombo endoluminale alla giugulare interna (IJV) e dello spessore della guaina del nervo ottico (ONSD).
  - Atlante Scientifico Integrato dei 24 Dataset con schede descrittive per ciascun dataset, metadati OSDR, parametri di campionamento e clausole di conformita NASA-STD-3001.

### 4.3 Studio Multi-Traccia (`OpenScreenStudio.tsx`)
* Percorso: `ares-cockpit/src/modules/studio/OpenScreenStudio.tsx`
* Funzionalita:
  - Tre modalita di layout: `SPLIT` (schermo diviso 3D + telemetria), `PIP` (Picture-in-Picture con riquadro secondario flottante), e `FOCUS` (gemello 3D cinematico a schermo intero).
  - Scrubber temporale interattivo per la navigazione su traiettorie telemetriche storiche e scenari What-If.
  - Strip ECG a scorrimento con artefatto di movimento modulabile e indice di qualita del segnale (SQI).
  - Riquadro barre dei predicati temporali NQS-STL ($\hat{\rho}_k$).

### 4.4 Modale Scorciatoie da Tastiera (`KeyboardShortcutsModal.tsx`)
* Percorso: `ares-cockpit/src/modules/ui-primitives/KeyboardShortcutsModal.tsx`
* Funzionalita:
  - Componente modale accessibile conforme ai criteri Vercel UI.
  - Chiusura su click esterno all'overlay o su tasto `Escape`.
  - Elenco strutturato delle scorciatoie operative raggruppate per categoria (Navigazione Suite, Gemello 3D, Simulazione e Sistema).

### 4.5 Smorzamento del Movimento (`motionSmoothing.ts`)
* Percorso: `ares-cockpit/src/lib/motionSmoothing.ts`
* Funzionalita: solutore numerico a passo variabile per l'equazione della molla smorzata del secondo ordine per l'interpolazione fluida della telecamera e delle coordinate vettoriali 3D.

### 4.6 Gemello Anatomico Procedurale Dual-Gender (`AnatomicalLayers.tsx` & `BodyHeatmap.tsx`)
* Percorsi:
  - `ares-cockpit/src/modules/body-3d-heatmap/AnatomicalLayers.tsx`
  - `ares-cockpit/src/modules/body-3d-heatmap/BodyHeatmap.tsx`
* Funzionalita:
  - Supporto per doppio sesso biologico (`sex: CrewSex = 'MALE' | 'FEMALE'`).
  - Differenziazione anatomica procedurale:
    - Diametro e svasatura dell'ala iliaca e dell'apertura pelvica (pelvi androide vs ginecoide).
    - Ampiezza della cassa toracica e biacromiale.
    - Distribuzione volumetrica delle masse muscolari degli arti inferiori (soleo e gastrocnemio).
  - Simulazione del Cephalad Fluid Shift (`CephaladFluidShift`): flussi armonici pulsanti che evidenziano la ridistribuzione cefalica dei fluidi corporei in assenza del gradiente gravitazionale idrostatico di $1g$.
  - Integrazione OrbitControls con `enableDamping`, fattore di smorzamento `0.05`, e limiti di zoom rigorosamente compresi tra 1.2 e 6.5 metri.
  - Integrazione null-safe: parametro di scenario `s: ScenarioState | null`, che garantisce il perfetto rendering senza errori TypeScript o eccezioni a runtime anche durante il replay puro di registrazioni terrestri BIDMC (dove non sono calcolati i modelli emodinamici sintetici microgravitari).
  - Preservazione totale degli asset 3D e dei layer introdotti da ARES-Health Team: nodi anatomici UBERON (`uberonSpatialMapping.ts`), loader di file GLB Z-Anatomy (`NasaGlbAssetLayer.tsx`), e modale di diagnosi visiva delle lesioni (`AiInjuryModal.tsx`).

### 4.7 Integrazione nell'Applicazione Principale (`App.tsx`)
* Percorso: `ares-cockpit/src/App.tsx`
* Funzionalita:
  - Gestione dello stato della vista attiva (`activeView`: `VIEW_COCKPIT`, `VIEW_PORTAL`, `VIEW_TWIN`, `VIEW_STUDIO`).
  - Listener globale da tastiera per le scorciatoie veloci (`1-4`, `M/F`, `?`, `ESC`).
  - Preservazione completa di tutti i componenti recenti: `OsSystemStatusBar`, `OsCommandPalette`, `OsVoiceCopilot`, `VitalsAnomalyPanel`, ed `EnginePlaybookCard`.

---

## 5. Risultati della Verifica e Collaudo
Il sistema e stato sottoposto ad una batteria rigorosa di verifiche automatizzate:

1. **Verifica Integrita del Progetto (`./scripts/agent_probe.sh --fast`):**
   - Probe 1/4 (Divieto `.unwrap()` e `.expect()` nel codice di produzione Rust): PASSATO.
   - Probe 2/4 (Validazione schema telemetria e checksum SHA-256 BIDMC): PASSATO.
   - Probe 3/4 (Verifica `cargo check` e `cargo clippy` con 0 avvisi): PASSATO.
   - Probe 4/4 (Verifica presenza di tutti i 29 file di Memory Bank e governance): PASSATO.
2. **Controllo Tipi TypeScript (`tsc -b --noEmit` / `npm run lint`):**
   - Esito: 0 errori di compilazione, risolta ogni null-safety su `ScenarioState`.
3. **Compilazione Bundle di Produzione Cockpit (`npm run build` / Vite):**
   - Esito: compila con successo in 2.34 secondi con 623 moduli trasformati.
4. **Test di Regressione e Invarianti Cockpit (`node --test tests/*.test.ts`):**
   - Esito: 21 test passati su 21 in 7 suite, inclusa la verifica automatica dell'assenza totale di emoji in `src/`.
5. **Verifica Invariante ZERO EMOJI:**
   - Eseguito script di scansione su tutti i file modificati e aggiunti: 0 caratteri emoji rilevati.

---

## 6. Rispetto delle Invarianti Assolute di Progetto
* **Zero Emoji:** Nessuna emoji in codice, commenti, documentazione o commit.
* **Air-Gapped Edge Execution:** Nessuna dipendenza da API cloud esterne o chiamate HTTP verso l'esterno; tutto il rendering e la simulazione avvengono localmente a bordo macchina.
* **Hard Clinical Safety Gates:**
  - Gate 1: divieto di somministrazione di anticoagulanti sistemici senza evidenza ecografica POCUS di trombo endoluminale documentato.
  - Gate 2: sfiato automatico della camera di pressione negativa LBNP a 0 mmHg se la pressione sistolica cala di oltre 15 mmHg o se la frequenza cardiaca supera i 115 bpm.
  - Gate 3: smorzamento degli attuatori della tuta EVA su superficie marziana a $0.38g$ in caso di asimmetria del passo (GAI > 12%).
