# Piano Progettuale Master a Fasi e Blocchi — Motore & Backend Rust di ARES-Health

- **Tag di Tracciabilita**: `[FABIO, IMPLEMENTATION]` | `[ARES-HEALTH, RUST-CORE-ENGINE]`
- **Stato**: PIANO DEFINITIVO PRONTO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Ispirazione Metodologica**: Gold Standard di `spatiotemporal-mcp-engine` (`memory-bank/progress.md`, `docs/architecture/IMPLEMENTATION_STACK.md`, `docs/plans/phase_*.md`, `scripts/agent_probe.sh`)
- **Budget Latenza Hot-Path (Valutazione Completa Grafo ADHG + ODE RK4 + NQS-STL + Playbook DAG)**: $< 150\,\mu\text{s}$ (`P99` in-memory per tick)
- **Budget Latenza Endpoint Stress-Test (`POST /api/stress-test` -> Broadcast WebSocket)**: $< 1.0\text{ ms}$
- **Budget Token Context-Mode (`FastMCP stdio`)**: $< 150\text{ token}$ ($\le 600\text{ byte}$ JSON serializzato per risposta)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione (`crates/*/src/`), `thiserror` per tutti i crate di libreria (`1..6`), `anyhow` esclusivamente nel binario `crates/ares-server-cli`.

---

## 1. Chiarimento Architetturale: Qual e il "Motore Rust" e a Quale Crate Appartiene?

Nel progetto **ARES-Health**, la componente Rust si distingue in:

1. **Il "Motore Rust" Core (Il Cuore Matematico, Fisiopatologico e Temporale — Owner: `@fabiomalagutti27-droid`):**
   È l'equivalente diretto di `core-types` + `vision-engine` + `spatiotemporal-db` nel tuo progetto `spatiotemporal-mcp-engine`. Appartiene esattamente a **3 Crate**:
   * **`crates/ares-core-types`** (*Blocco A — Fasi 1–2*): Contratto tipi, costanti normative `NASA-STD-3001` e trait di sicurezza.
   * **`crates/ares-causal-graph`** (*Blocco C — Fasi 5–7*): Grafo causale `ADHG` (`petgraph`), solutore RK4 ODE Frost-Hargens, shear stress venoso giugulare $\tau_w(t)$ e osservatore Bayesiano a 2 stadi POCUS.
   * **`crates/ares-nqs-stl`** (*Blocco D — Fasi 8–9*): Monitor online $O(1)$ `NQS-STL` (cuneo monotono di Lemire-Donzé), predittore `TTV` EWMA-OLS a 7 giorni con banda $\pm 1.96\sigma$ e sintetizzatore `MRI`.

2. **I 4 Crate di Pipeline del Backend Rust (che alimentano ed espongono il Motore Core):**
   * **`crates/ares-telemetry-ingest`** (*Blocco B — Fasi 3–4, Owner: `@LelloXV`*): Replay CSV deterministico `BIDMC v1.0.0` a `1 Hz`, filtro `SQI >= 0.70` e overlay di scenario.
   * **`crates/ares-medops-playbooks`** (*Blocco E — Fasi 10–11, Owner: `@fertech02`*): Esecutore DAG *Type 1 Crystallized* dei Playbook `#01–#05` e applicazione dei **3 Hard Clinical Safety Gates**.
   * **`crates/ares-security-privacy`** (*Blocco F — Fase 12, Owner: `@MiServeRDC`*): Viste privacy per ruolo (`NASA-STD-3001 Vol. 1 Ch. 7`), Audit Chain `SHA-256`, cifratura `ChaCha20-Poly1305` e scudo Prompt Injection.
   * **`crates/ares-server-cli`** (*Blocco G — Fasi 13–14, Owner: `@fertech02`*): Server WebSocket/REST `axum` a `20 Hz` (`127.0.0.1:8080`) + server `stdio` **FastMCP JSON-RPC 2.0**.

```mermaid
flowchart TD
    subgraph Blocco_A["BLOCCO A: crates/ares-core-types (@fabiomalagutti27-droid)"]
        F1["Fase 1 (A1): Struct TelemetryPacket, ProvenanceManifest & Nullable Fields"]
        F2["Fase 2 (A2): Costanti NASA-STD-3001, Errori thiserror & Trait Sicurezza"]
    end

    subgraph Blocco_B["BLOCCO B: crates/ares-telemetry-ingest (@LelloXV)"]
        F3["Fase 3 (B1): Parser Replay BIDMC v1.0.0 (1 Hz, Trim Header, 13 Nulls in bidmc_01)"]
        F4["Fase 4 (B2): Filtro Entropia Spettrale SQI >= 0.70 & Scenario Overlay Merger"]
    end

    subgraph Motore_Core["MOTORE RUST CORE: crates/ares-causal-graph & crates/ares-nqs-stl (@fabiomalagutti27-droid)"]
        F5["Fase 5 (C1): ODE RK4 Frost-Hargens (SOST), Indice MQI & GAI (0.38g)"]
        F6["Fase 6 (C2): Emodinamica Giugulare tau_w(t), Dose-Risposta LBNP & SANS"]
        F7["Fase 7 (C3): Grafo Causale ADHG (petgraph) & Osservatore Bayesiano POCUS 2-Stadi"]
        F8["Fase 8 (D1): Valutatore Online O(1) NQS-STL (Cuneo Monotono di Lemire)"]
        F9["Fase 9 (D2): Predittore TTV EWMA-OLS 7-Giorni (±1.96σ) & Sintesi MRI"]
    end

    subgraph Blocco_E_F["BLOCCO E & F: Playbooks & Security (@fertech02 & @MiServeRDC)"]
        F10["Fase 10 (E1): DAG Type-1 Crystallized Playbooks #01-#05"]
        F11["Fase 11 (E2): I 3 Hard Clinical Safety Gates (Anticoag Lock, LBNP Vent, EVA Suit)"]
        F12["Fase 12 (F1): Role-Based Privacy Views, Audit SHA-256 & ChaCha20-Poly1305"]
    end

    subgraph Blocco_G["BLOCCO G: crates/ares-server-cli (@fertech02)"]
        F13["Fase 13 (G1): Server Axum WebSocket 20 Hz & POST /api/stress-test (< 1 ms)"]
        F14["Fase 14 (G2): Server FastMCP JSON-RPC 2.0 stdio (< 150 Token Context-Mode)"]
    end

    F1 --> F2
    F2 --> F3
    F2 --> F5
    F2 --> F12
    F3 --> F4
    F5 --> F6 --> F7
    F4 --> F7
    F7 --> F8 --> F9
    F9 --> F10 --> F11
    F12 --> F11
    F11 --> F13 --> F14
```

---

## 2. Progettazione Profonda Blocco per Blocco e Fase per Fase

---

### BLOCCO A — Fondamenta Contrattuali, Costanti Normative & Trait di Sicurezza
* **Crate:** [`crates/ares-core-types`](../../crates/ares-core-types/README.md)
* **Owner Principale:** `@fabiomalagutti27-droid`
* **Dipendenze Esterne:** `serde`, `serde_json`, `thiserror` (zero dipendenze interne)

#### Fase 1 (`A1`): Strutture Contrattuali `TelemetryPacket`, `ProvenanceManifest` e Campi Nullable
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-core-types/src/lib.rs`
  * `crates/ares-core-types/src/telemetry.rs`
* **Specifica Tecnica:**
  * Implementa le struct immutabili e serializzabili che rispecchiano 1:1 [`contracts/telemetry_schema.json`](../../contracts/telemetry_schema.json):
    * `ProvenanceManifest` con enum `BiometricsSource { RecordedTerrestrialBidmcCsv, SimulatedScenarioInput }`, `biometrics_native_rate_hz: f64` (`1.0`), `ui_refresh_rate_hz: f64` (`20.0`), e `ScenarioOverlayMode::DerivedAndSimulated`.
    * `Biometrics` con campi `Option<f64>` per supportare nativamente i campioni mancanti (`null` in JSON) di `bidmc_01_Numerics.csv` (`heart_rate_bpm`, `pulse_rate_bpm`, `resp_rate_brpm`, `spo2_pct`, `rmssd_ms`, `sdnn_ms`, `pnn50_pct`, `lf_hf_ratio`) più `missing_channels: Vec<String>` e `sqi_score: f64`.
    * `Musculoskeletal`, `JugularHemodynamics`, `SansOcular`, `NqsStlMargins`, `ActivePlaybook`, `SafetyGates`, `CountermeasureAction`.
* **Gate di Verifica (`cargo test -p ares-core-types`):**
  * Test di round-trip JSON (`serde_json::to_string` $\leftrightarrow$ `serde_json::from_str`) verificando che un pacchetto con `pulse_rate_bpm: None` e `spo2_pct: None` serializzi esattamente `"pulse_rate_bpm": null, "spo2_pct": null` senza panici.

#### Fase 2 (`A2`): Costanti Fisiche `NASA-STD-3001`, Gerarchia Errori `thiserror` e Trait `security.rs`
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-core-types/src/constants.rs`
  * `crates/ares-core-types/src/error.rs`
  * `crates/ares-core-types/src/security.rs`
* **Specifica Tecnica:**
  * Definisce tutte le costanti fisiche e cliniche validate dal Flight Surgeon Review Board:
    * `BLOOD_VISCOSITY_POISE: f64 = 0.035;`
    * `FROST_MECHANOSTAT_STRAIN_UE: f64 = 1000.0;`
    * `TAU_W_NOMINAL_DYN_CM2: f64 = 2.8;` e `TAU_W_CRITICAL_DYN_CM2: f64 = 1.2;`
    * `SQI_MIN_THRESHOLD: f64 = 0.70;`
    * `LBNP_MAX_SYS_BP_DROP_MMHG: f64 = 15.0;` e `LBNP_MAX_HR_BPM: f64 = 115.0;`
    * `GAI_MAX_SAFE_PCT: f64 = 12.0;`
  * Definisce i trait disaccoppiati `CrewPrivacyFilter`, `MedOpsAuditLogger`, `McpInputSanitizer` e la struct a costo zero `NoOpSecurity` per consentire lo sviluppo parallelo indipendente di `crates/ares-security-privacy`.

---

### BLOCCO B — Motore di Replay Deterministico `BIDMC v1.0.0`, Filtro `SQI` & Scenario Overlay (`1. GATHER`)
* **Crate:** [`crates/ares-telemetry-ingest`](../../crates/ares-telemetry-ingest/README.md)
* **Owner Principale:** `@LelloXV` (con supporto contrattuale `@MiServeRDC` e `@fabiomalagutti27-droid`)
* **Dipendenze:** `ares-core-types`, `csv`, `serde`, `thiserror`

#### Fase 3 (`B1`): Parser CSV `BIDMC v1.0.0` (`1 Hz`, Header Trimming e Preservazione dei 13 `null` in `bidmc_01`)
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-telemetry-ingest/src/lib.rs`
  * `crates/ares-telemetry-ingest/src/bidmc_replayer.rs`
* **Grounding Scientifico (`deep-scholar`):**
  * Marco A. F. Pimentel et al., *"Toward a Robust Estimation of Respiratory Rate From Pulse Oximeters"*, *IEEE Trans. Biomed. Eng.*, 64(8):1914–1923, 2017 (`DOI: 10.1109/TBME.2016.2613124`, PhysioNet `ODC-By-1.0`).
* **Specifica Tecnica:**
  * Configura `csv::ReaderBuilder::new().trim(csv::Trim::All)` per rimuovere gli spazi iniziali presenti negli header originali (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`).
  * Converte ogni cella vuota o `"NaN"` in `Option<f64>::None` e registra il nome del canale in `missing_channels`.
  * Mantiene un indice ciclico deterministico sulle 481 righe (`0..480 s`) di `bidmc_01`, `bidmc_02` e `bidmc_03`, esponendo sia il passo nativo a `1 Hz` sia l'interpolazione di frame a `20 Hz` per la UI mantenendo `relative_recording_time_s` ancorato al tempo nativo del CSV.
* **Gate di Verifica (`cargo test -p ares-telemetry-ingest`):**
  * Test unitario che carica `data/bidmc/bidmc_01_Numerics.csv`, verifica esattamente `481` campioni, `relative_recording_time_s` da `0.0` a `480.0`, e conta esattamente **13 righe** con `pulse_rate_bpm.is_none()` e `spo2_pct.is_none()`.

#### Fase 4 (`B2`): Filtro Anti-Artefatto da Movimento (`SQI >= 0.70`) & Fusione Scenario ("What-If Console")
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-telemetry-ingest/src/sqi_filter.rs`
  * `crates/ares-telemetry-ingest/src/scenario_overlay.rs`
* **Specifica Tecnica:**
  * Calcola lo Spectral Entropy Signal Quality Index:
    $$\text{SQI}(t) = 1.0 - \frac{-\sum_{f} P_{\text{norm}}(f) \ln P_{\text{norm}}(f)}{\ln N_f} \in [0.0, 1.0]$$
  * Se $\text{SQI}(t) < 0.70$ durante un transitorio motorio, mantiene l'ultimo stato emodinamico valido (*Zero-Order Hold*) evitando falsi trigger sul grafo causale.
  * Unisce il record `RECORDED_TERRESTRIAL_BIDMC_CSV` con la struct `ScenarioOverlayInput` (slider `ared_daily_load_kgf`, `radiation_dose_rate_msv_d`, `lbnp_active`, `lbnp_pressure_mmhg`, `pocus_thrombus_confirmed`, `flight_day`).

---

### BLOCCO C — Il Cuore del Motore Rust: Fisiopatologia Differenziale & Grafo Causale `ADHG` (`2. EVALUATE` - Parte 1)
* **Crate:** [`crates/ares-causal-graph`](../../crates/ares-causal-graph/README.md)
* **Owner Principale:** `@fabiomalagutti27-droid`
* **Dipendenze:** `ares-core-types`, `petgraph`, `serde`, `thiserror`

#### Fase 5 (`C1`): Solutore ODE RK4 di Frost-Hargens ($\text{SOST}$), Muscle Quality Index ($\text{MQI}$) e $\text{GAI}$ ($0.38g$)
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-causal-graph/src/lib.rs`
  * `crates/ares-causal-graph/src/mechanotransduction.rs`
* **Grounding Scientifico (`deep-scholar`):**
  * Frost (*Anat. Rec.* 2003, $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), Robling et al. (*J. Biol. Chem.* 2008), Prof. Francesco Pegreffi (*Ultrasound Muscle Quality Index & Gait Asymmetry*), `NASA OSDR OSD-195` & `NLSP SMCCP/BRSMFSR`.
* **Equazioni Implementate in Rust (RK4 a passo fisso $\Delta t$, zero allocazioni heap):**
  1. **ODE Regolarizzata della Sclerostina ($\text{SOST}$):**
     $$\frac{d[\text{SOST}]}{dt} = k_{\text{prod}} \cdot \frac{1}{1 + \left(\frac{\varepsilon_{\text{mech}}(t)}{\varepsilon_{\text{Frost}}}\right)^\gamma} - k_{\text{deg}} \cdot [\text{SOST}](t)$$
     dove $\varepsilon_{\text{mech}}(t) = \alpha_{\text{ARED}} \cdot F_{\text{ARED}}(t)$, $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$, $\gamma = 2.0$, $k_{\text{prod}} = 18.5\text{ pmol/(L}\cdot\text{d)}$, $k_{\text{deg}} = 0.28\text{ d}^{-1}$.
  2. **Muscle Quality Index ($\text{MQI}$) del Soleo:**
     $$\text{MQI}(t) = \text{clamp}\!\left(1.0 - 0.35 \cdot \frac{E_{\text{echo}}(t) - E_0}{E_{\text{crit}} - E_0} - 0.65 \cdot \frac{\text{CSA}_0 - \text{CSA}_{\text{soleus}}(t)}{\text{CSA}_0 - \text{CSA}_{\text{crit}}}, \; 0.0, \; 1.0\right)$$
  3. **Gait Asymmetry Index ($\text{GAI}$) per l'Atterraggio Marziano a $0.38g$:**
     $$\text{GAI}(t) = 100 \cdot \frac{|F_{\text{peak,L}}(t) - F_{\text{peak,R}}(t)|}{\frac{1}{2}(F_{\text{peak,L}}(t) + F_{\text{peak,R}}(t))} + \beta_{\text{MQI}} \cdot (1.0 - \text{MQI}(t)) \quad [\%]$$

#### Fase 6 (`C2`): Emodinamica Venosa Giugulare ($\tau_w(t)$), Curva Dose-Risposta `LBNP` e Accoppiamento `SANS`
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-causal-graph/src/hemodynamics.rs`
* **Grounding Scientifico (`deep-scholar`):**
  * Marshall-Goebel et al. (*JAMA Netw. Open* 2019, `PMC6902784`), *Journal of Applied Physiology* (2026, `DOI: 10.1152/japplphysiol.00018.2026`), Ogoh et al. (*Physiol. Rep.* 2022, `DOI: 10.14814/phy2.15248`), Chinese Academy of Sciences SINH (*Chinese Bulletin of Life Sciences* 2026, `5-2026-0038`), `NASA OSDR OSD-818` (*Translaminar Model for SANS*).
* **Equazioni Implementate in Rust:**
  1. **Shear Stress di Parete Giugulare ($\tau_w$) Dimensionalmente Esatto ($\text{dyn/cm}^2$):**
     $$\tau_w(t) = \frac{4 \cdot \mu \cdot v_{\max}(t)}{2 \cdot r_{\text{eff}}(t)} = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\frac{\pi}{\text{IJV\_CSA}(t)}}$$
     con $\mu = 0.035\text{ Poise}$, $v_{\max}(t)$ in $\text{cm/s}$ e $\text{IJV\_CSA}(t)$ in $\text{cm}^2$ ($\text{mm}^2 / 100$).
  2. **Effetto Dose-Risposta della Camera `LBNP` ($P_{\text{LBNP}} \in [-30, 0]\text{ mmHg}$) e Pompa Crurale del Soleo ($\text{MQI}$):**
     $$\text{IJV\_CSA}(t) = \text{IJV\_CSA}_{\mu g, 0} \cdot \Big(1.0 - \kappa_{\text{LBNP}} \cdot \frac{|P_{\text{LBNP}}(t)|}{30.0} - \kappa_{\text{soleus}} \cdot \text{MQI}(t)\Big)$$
  3. **Gradiente Translaminare e Indice Composito `SANS` (`OSD-818` + `DLR SANS-CM`):**
     $$\text{SANS\_Risk}(t) = \text{clamp}\!\left(w_{\text{ONSD}} \frac{\text{ONSD}(t) - 5.0}{1.5} + w_{\text{CT}} \frac{\Delta\text{CT}(t)}{80.0} + w_{\text{IJV}} \frac{\text{IJV\_CSA}(t) - 35.0}{65.0}, \; 0.0, \; 1.0\right)$$

#### Fase 7 (`C3`): Grafo Causale Eterogeneo `ADHG` (`petgraph`) & Osservatore Bayesiano POCUS a 2 Stadi
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-causal-graph/src/adhg_graph.rs`
  * `crates/ares-causal-graph/src/bayesian_pocus.rs`
* **Specifica Tecnica:**
  * Costruisce un `petgraph::stable_graph::StableDiGraph<CausalNode, CausalEdge>` con 12 nodi fisiologici (`AredLoad`, `SoleusMqi`, `SclerostinSost`, `RenalCalcium`, `CalfVenousCompliance`, `EndothelialSecretome`, `RadiationDoseCans`, `IjvCrossSection`, `JugularShearStress`, `PocusThrombusPosterior`, `SansTranslaminarIndex`, `AutonomicVagalRmssd`).
  * **Osservatore Bayesiano a 2 Stadi (`bayesian_pocus.rs`):**
    * **Stadio 1 (Pre-POCUS — Solo Stasi Emodinamica):** Anche con $\tau_w < 1.2\text{ dyn/cm}^2$ e $v_{\max} < 5.0\text{ cm/s}$, la probabilità di trombo occlusivo è limitata superiormente a $P(\text{Thrombus} \mid \text{Stasis}) \le 0.45$ (insufficiente per sbloccare anticoagulanti, ma sufficiente per richiedere ispezione POCUS immediata e `LBNP` fisica).
    * **Stadio 2 (Post-POCUS — Conferma Ecografica B-Mode Non-Comprimibile):** L'aggiornamento con il rapporto di verosimiglianza ecografico ($\text{LR}_+ = 24.0$) porta $P(\text{Thrombus} \mid \text{POCUS}_+) \ge 0.92$, unico stato autorizzato a sbloccare il **Hard Safety Gate 1**.

---

### BLOCCO D — Logica Temporale Normalizzata `NQS-STL`, Predittore `TTV` & Sintesi `MRI` (`2. EVALUATE` - Parte 2)
* **Crate:** [`crates/ares-nqs-stl`](../../crates/ares-nqs-stl/README.md)
* **Owner Principale:** `@fabiomalagutti27-droid`
* **Dipendenze:** `ares-core-types`, `ares-causal-graph`, `serde`, `thiserror`

#### Fase 8 (`D1`): Valutatore Online $O(1)$ `NQS-STL` con Cuneo Monotono di Lemire-Donzé
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-nqs-stl/src/lib.rs`
  * `crates/ares-nqs-stl/src/normalizer.rs`
  * `crates/ares-nqs-stl/src/sliding_window.rs`
* **Grounding Scientifico (`deep-scholar`):**
  * Donzé, Ferrère & Maler (CAV 2013, `DOI: 10.1007/978-3-642-39799-8_19`), Lemire (*Nordic J. Comput.* 2006, `arXiv:cs/0610046`), Zhang et al. (CAV 2023, `arXiv:2305.17754v1`).
* **Equazioni Implementate in Rust:**
  1. **Normalizzazione Atomica Adimensionale (`normalizer.rs`):**
     $$\hat{\rho}_k(t) = \text{clamp}\!\left(s_k \cdot \frac{x_k(t) - x_{k,\text{crit}}}{|x_{k,\text{nom}} - x_{k,\text{crit}}|}, \; -2.0, \; +1.0\right)$$
     dove $s_k = +1$ per metriche "più alto è meglio" ($\tau_w$, $F_{\text{ARED}}$, $\text{MQI}$, $\text{RMSSD}$) e $s_k = -1$ per metriche "più basso è meglio" ($\text{SOST}$, $\text{SANS\_Risk}$, $\dot{D}_{\text{rad}}$).
  2. **Operatore Temporale $\Box_{[t-W, t]}$ in Tempo $O(1)$ (`sliding_window.rs`):**
     Usa un `VecDeque<(f64, f64)>` monotono crescente per mantenere il minimo su finestra mobile $\hat{\rho}_{\Box, k}(t) = \min_{\tau \in [t-W, t]} \hat{\rho}_k(\tau)$ con al più 3 confronti per campione.
  3. **Robustezza Globale Congiunta:**
     $$\hat{\rho}_{\text{global}}(t) = \min_{k \in \{1..5\}} \hat{\rho}_{\Box, k}(t)$$

#### Fase 9 (`D2`): Stimatore `TTV` (Time-To-Violation) EWMA-OLS a 7 Giorni ($\pm 1.96\sigma$) e Calcolo `MRI`
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-nqs-stl/src/ttv_predictor.rs`
  * `crates/ares-nqs-stl/src/mri_index.rs`
* **Equazioni Implementate in Rust:**
  * Stima la pendenza $\hat{\beta}_1(t) = \frac{d\hat{\rho}_{\text{global}}}{dt}$ e la deviazione standard dei residui $\hat{\sigma}_{\beta_1}$ tramite minimi quadrati pesati esponenzialmente (EWMA-OLS).
  * Se $\hat{\beta}_1(t) < -\epsilon$:
    $$\text{TTV}_{\text{hours}}(t) = \frac{\hat{\rho}_{\text{global}}(t)}{|\hat{\beta}_1(t)|}, \qquad \text{CI}_{95\%} = \left[\frac{\hat{\rho}_{\text{global}}(t)}{|\hat{\beta}_1(t)| + 1.96\hat{\sigma}_{\beta_1}}, \; \frac{\hat{\rho}_{\text{global}}(t)}{\max(\epsilon, |\hat{\beta}_1(t)| - 1.96\hat{\sigma}_{\beta_1})}\right]$$

---

### BLOCCO E — Motore Decisionale MedOps Playbooks & I 3 Hard Clinical Safety Gates (`3. ACT`)
* **Crate:** [`crates/ares-medops-playbooks`](../../crates/ares-medops-playbooks/README.md)
* **Owner Principale:** `@fertech02` (con revisione clinica/architetturale `@fabiomalagutti27-droid` e `@MiServeRDC`)
* **Dipendenze:** `ares-core-types`, `ares-causal-graph`, `ares-nqs-stl`, `serde`, `thiserror`

#### Fase 10 (`E1`): Esecutore DAG *Type 1 Crystallized* dei Playbook `#01–#05`
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-medops-playbooks/src/lib.rs`
  * `crates/ares-medops-playbooks/src/playbooks.rs`
* **Grounding Scientifico (`deep-scholar`):**
  * Arun Malik (*Progressive Crystallization*, `arXiv:2607.07052v1`, 2026) & Songyuan Li et al. (*ProgRouter*, EMNLP 2026, `arXiv:2608.25992v2`).
* **Specifica Tecnica:**
  * Valuta in $< 20\,\mu\text{s}$ i 5 Playbook pre-compilati (`PLAYBOOK_01_VENOUS_STASIS_LBNP`, `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS`, `PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED`, `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION`, `PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS`) calcolando per ogni azione l'impatto atteso $\Delta\hat{\rho}/\text{ora}$.

#### Fase 11 (`E2`): Macchina a Stati dei 3 Hard Clinical Safety Gates
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-medops-playbooks/src/safety_gates.rs`
* **Specifica Tecnica:**
  * Implementa la funzione pura verificabile `enforce_clinical_safety_gates(state, proposed_playbook) -> SafePlaybookDecision`:
    1. **Gate 1 (`anticoagulant_lock_active`):** `if !state.jugular.pocus_thrombus_confirmed`, rimuove forzatamente qualsiasi azione farmacologica anticoagulante e impone il protocollo fisico (`LBNP -30 mmHg` + contrazioni soleo).
    2. **Gate 2 (`lbnp_auto_vent_armed`):** `if state.lbnp_active && (sys_bp_drop > 15.0 || hr > 115.0)`, emette istantaneamente l'azione prioritaria `AUTO_VENT_LBNP_CHAMBER_0_MMHG`.
    3. **Gate 3 (`eva_suit_damping_active`):** `if state.musculoskeletal.gai_pct > 12.0`, blocca esercizi pliometrici ad alto impatto e attiva la calibrazione di smorzamento caviglia della tuta EVA a $0.38g$.

---

### BLOCCO F — Privacy dell'Equipaggio per Ruolo (`NASA-STD-3001`), Audit Chain `SHA-256` & AEAD
* **Crate:** [`crates/ares-security-privacy`](../../crates/ares-security-privacy/README.md)
* **Owner Principale:** `@MiServeRDC` (Alessandro)
* **Dipendenze:** `ares-core-types`, `sha2`, `chacha20poly1305`, `zeroize`, `serde`, `thiserror`

#### Fase 12 (`F1`): Implementazione Concreta dei Trait di Sicurezza, Viste Privacy e Catena Hash `SHA-256`
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-security-privacy/src/lib.rs`
  * `crates/ares-security-privacy/src/privacy_views.rs`
  * `crates/ares-security-privacy/src/audit_chain.rs`
  * `crates/ares-security-privacy/src/sanitizer.rs`
* **Specifica Tecnica:**
  * Implementa le 3 viste di riservatezza medica richieste da **NASA-STD-3001 Vol. 1 Rev C Ch. 7** (`PrivateAstronautView`, `CmoMedicalView`, `FlightSurgeonSyncPacket`).
  * Implementa la catena di audit non ripudiabile `SHA-256` per ogni decisione o override medico e la cifratura `ChaCha20-Poly1305` per i pacchetti Store-and-Forward destinati alla Terra.

---

### BLOCCO G — Server Dual-Transport Isolato (`Axum WebSocket 20 Hz` + `FastMCP stdio`)
* **Crate:** [`crates/ares-server-cli`](../../crates/ares-server-cli/README.md)
* **Owner Principale:** `@fertech02` (con integrazione `@fabiomalagutti27-droid` e `@carolina2910`)
* **Dipendenze:** Tutti i 6 crate di libreria + `tokio`, `axum`, `clap`, `anyhow`, `tracing`

#### Fase 13 (`G1`): Server `axum` WebSocket a `20 Hz` (`127.0.0.1:8080`) & Endpoint `POST /api/stress-test` (`< 1 ms`)
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-server-cli/src/main.rs`
  * `crates/ares-server-cli/src/ws_server.rs`
* **Specifica Tecnica:**
  * Esegue il bind esclusivo su `127.0.0.1:8080` (regola Zero-Trust).
  * Trasmette a `20 Hz` sul canale `/ws/telemetry` il `TelemetryPacket` aggiornato dal Motore Rust Core.
  * Espone `POST /api/stress-test` per ricevere le modifiche dagli slider della **What-If Stress-Test Console** di `ares-cockpit/`, ricalcolando in `< 1 ms` l'intero grafo `ADHG`, i margini `NQS-STL`, il `TTV` e i Playbook.

#### Fase 14 (`G2`): Server Nativo `FastMCP` JSON-RPC 2.0 su `stdio` (`< 150 Token Context-Mode`)
* **Stato:** `[ ] PIANIFICATA`
* **File Target:**
  * `crates/ares-server-cli/src/mcp_stdio.rs`
* **Specifica Tecnica:**
  * Legge richieste JSON-RPC 2.0 su `stdin` e scrive risposte su `stdout` (con `tracing` confinato su `stderr`).
  * Espone i 4 tool Context-Mode (`get_crew_health_summary`, `explain_causal_anomaly`, `simulate_countermeasure_impact`, `get_medops_playbook`) con risposte sintetiche rigorosamente `< 150 token`.

---

## 3. Matrice Riassuntiva di Tracciamento delle 14 Fasi (Stile `spatiotemporal-mcp-engine`)

| Blocco | Fase | Crate Target | Owner | Latenza Target | Stato |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Blocco A** | **Fase 1 (`A1`)** | `crates/ares-core-types` | `@fabiomalagutti27-droid` | `< 5 µs` (serde) | `[ ] PIANIFICATA` |
| **Blocco A** | **Fase 2 (`A2`)** | `crates/ares-core-types` | `@fabiomalagutti27-droid` | `0 ns` (`const`) | `[ ] PIANIFICATA` |
| **Blocco B** | **Fase 3 (`B1`)** | `crates/ares-telemetry-ingest` | `@LelloXV` | `< 20 µs/riga` | `[ ] PIANIFICATA` |
| **Blocco B** | **Fase 4 (`B2`)** | `crates/ares-telemetry-ingest` | `@LelloXV` | `< 15 µs` | `[ ] PIANIFICATA` |
| **Blocco C (Core)** | **Fase 5 (`C1`)** | `crates/ares-causal-graph` | `@fabiomalagutti27-droid` | `< 10 µs` (RK4) | `[ ] PIANIFICATA` |
| **Blocco C (Core)** | **Fase 6 (`C2`)** | `crates/ares-causal-graph` | `@fabiomalagutti27-droid` | `< 10 µs` | `[ ] PIANIFICATA` |
| **Blocco C (Core)** | **Fase 7 (`C3`)** | `crates/ares-causal-graph` | `@fabiomalagutti27-droid` | `< 25 µs` (ADHG) | `[ ] PIANIFICATA` |
| **Blocco D (Core)** | **Fase 8 (`D1`)** | `crates/ares-nqs-stl` | `@fabiomalagutti27-droid` | `< 10 µs` ($O(1)$) | `[ ] PIANIFICATA` |
| **Blocco D (Core)** | **Fase 9 (`D2`)** | `crates/ares-nqs-stl` | `@fabiomalagutti27-droid` | `< 15 µs` | `[ ] PIANIFICATA` |
| **Blocco E** | **Fase 10 (`E1`)** | `crates/ares-medops-playbooks` | `@fertech02` | `< 20 µs` (DAG) | `[ ] PIANIFICATA` |
| **Blocco E** | **Fase 11 (`E2`)** | `crates/ares-medops-playbooks` | `@fertech02` | `< 5 µs` (Gates) | `[ ] PIANIFICATA` |
| **Blocco F** | **Fase 12 (`F1`)** | `crates/ares-security-privacy` | `@MiServeRDC` | `< 30 µs` (SHA/AEAD)| `[ ] PIANIFICATA` |
| **Blocco G** | **Fase 13 (`G1`)** | `crates/ares-server-cli` | `@fertech02` | `< 1 ms` (WS 20Hz) | `[ ] PIANIFICATA` |
| **Blocco G** | **Fase 14 (`G2`)** | `crates/ares-server-cli` | `@fertech02` | `< 500 µs` (MCP) | `[ ] PIANIFICATA` |
