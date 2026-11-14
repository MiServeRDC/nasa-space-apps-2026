# ARES-Health — Registro delle Fonti Scientifiche, Dataset Multi-Agenzia, Standard NASA e Modelli Matematici

> Issue #12 correction: this is a historical bibliography, not proof of parameter-level validation. See [MODEL_EVIDENCE_AUDIT.md](architecture/MODEL_EVIDENCE_AUDIT.md) for checked source scope. In particular, current fixed-rate TTV is not a fitted 7-day EWMA-OLS and its bands are not calibrated 95% intervals; deterministic Timestral weights do not establish forecast accuracy.

Questo documento tiene traccia di tutte le basi teoriche, articoli scientifici peer-reviewed (internazionali e cinesi, verificati tramite il protocollo `deep-scholar`), standard tecnici aerospaziali (`NASA-STD-3001`, `NASA OCHMO MTB-007`), RFC/FIPS crittografiche, dataset clinici e spaziali multi-agenzia (24 fonti ufficiali NASA, CSA, ESA, DLR, TRISH, JAXA, PhysioNet, UCI) e modelli matematici su cui è fondata l'architettura di **ARES-Health** (*Autonomous Resilient Edge-native System for Astronaut Health* — NASA Space Apps Challenge 2026).

---

## 1. Emodinamica Venosa Giugulare (`IJV`), Trombosi in Microgravità, Dose-Risposta `LBNP` e Sindrome Neuro-Oculare (`SANS`) (Blocco C: Fasi 06–07)

- **Assessment of Jugular Venous Blood Flow Stasis and Thrombosis During Spaceflight**
  - *Autori*: Karina Marshall-Goebel, Stuart S. Laurie, Irina V. Alferova, Nimesh C. Patel, Alan R. Hargens, Michael B. Stenger, Serena M. Auñón-Chancellor et al. (NASA Johnson Space Center / KBR)
  - *Venue*: *JAMA Network Open*, Vol. 2, No. 11, e1915011, Novembre 2019
  - *DOI / PMCID*: `10.1001/jamanetworkopen.2019.15011` | `PMCID: PMC6902784`
  - *Articolo Clinico Correlato*: Serena M. Auñón-Chancellor, J. M. Pattarini, S. Moll, A. Sargsyan, *"Venous Thrombosis during Spaceflight"*, *New England Journal of Medicine (NEJM)*, Vol. 382, No. 1, pp. 89–92, 2020 (`DOI: 10.1056/NEJMc1913835`)
  - *Fasi Collegate*: Fase 06 (`C2`), Fase 07 (`C3`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Applicazione nel Progetto*: Evidenza clinica primaria su 11 astronauti ISS dello sviluppo di stasi e flusso bidirezionale/retrogrado nella vena giugulare interna (`IJV`) entro il giorno di volo FD50, inclusa la scoperta di trombosi giugulare occlusiva asintomatica. Giustifica il monitoraggio continuo di $\text{IJV\_CSA}$ e $v_{\max}$, l'osservatore Bayesiano POCUS a 2 stadi (`crates/ares-causal-graph/src/bayesian_pocus.rs`) e il **Hard Clinical Safety Gate 1** (divieto assoluto di somministrare Enoxaparina o Apixaban sulla sola stasi emodinamica senza conferma ecografica B-mode di trombo endoluminale non comprimibile).

- **Case Study: Dose-Dependent Internal Jugular Vein Response to Lower Body Negative Pressure During Spaceflight ( & Studio Cinese Stratificato per Sesso su LBNP 2026)**
  - *Autori*: C. Pappas, Stuart S. Laurie, Karina Marshall-Goebel et al. (*Journal of Applied Physiology*, 2026, `DOI: 10.1152/japplphysiol.00018.2026`); Studio Cinese di Medicina Aerospaziale, *"分级下体负压对颈内静脉血流的影响：一项性别分层的剂量-反应研究"* (*Graded LBNP Effects on Internal Jugular Vein Blood Flow: A Sex-Stratified Dose-Response Study*, Settembre 2026); Shigehiko Ogoh, Ai Hirasawa, Shigeki Shibata, *"Influence of head-up tilt and lower body negative pressure on the internal jugular vein"*, *Physiological Reports*, 2022 (`DOI: 10.14814/phy2.15248`); Alan R. Hargens et al. (*FASEB Journal*, `DOI: 10.1096/fasebj.29.1_supplement.990.9`)
  - *Modello Matematico (Curva Dose-Risposta LBNP & Ripristino dello Shear Stress Laminare)*:
    $$\text{IJV\_CSA}(t) = \text{CSA}_{0g} \cdot \Big(1.0 - 0.28 \cdot \text{MQI}(t) - 0.34 \cdot \frac{|P_{\text{LBNP}}(t)|}{30.0} + 0.08 \cdot R_{\text{rad}}(t)\Big)$$
    $$v_{\max}(t) = v_{0g} + 9.8 \cdot \text{MQI}(t) + 7.4 \cdot \frac{|P_{\text{LBNP}}(t)|}{30.0} - 1.8 \cdot R_{\text{rad}}(t)$$
  - *Fasi Collegate*: Fase 06 (`C2`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Applicazione nel Progetto*: Dimostra che una depressione `LBNP` di $-30\text{ mmHg}$ riduce l'area trasversa giugulare (`IJV_CSA`) fino al $34\text{–}42\%$ e ripristina il flusso laminare anterogrado senza indurre il collasso sincopale osservato a $-40 / -50\text{ mmHg}$. Alimenta sia `compute_jugular_and_sans_state` (`crates/ares-causal-graph/src/hemodynamics.rs`), sia il **Hard Clinical Safety Gate 2** (`AUTO_VENT_LBNP_CHAMBER_0_MMHG` se $\Delta\text{SBP} > 15\text{ mmHg}$ o $\text{HR} > 115\text{ bpm}$).

- **Simulated Microgravity with Physiological Shear Reveals Endothelial Responses ( & Meccanobiologia Vascolare Spaziale CAS 2026)**
  - *Autori*: M. Bisserier et al. (*npj Microgravity*, Nature Partner Journals, Vol. 12, Art. 38, 2026, `DOI: 10.1038/s41526-026-00627-8`); Chinese Academy of Sciences — Shanghai Institute of Nutrition and Health (SINH), *"航天微重力环境下血管结构和功能的影响及其力学生物学最新进展"* (*Advances in Vascular Mechanobiology of Shear Stress, Cyclic Stretch, and Hydrostatic Pressure under Space Microgravity*, *Chinese Bulletin of Life Sciences*, Luglio 2026, `5-2026-0038`)
  - *Modello Matematico (Shear Stress di Parete di Hagen-Poiseuille Dimensionalmente Esatto — Invariante Entry 001)*:
    Poiché la portata volumetrica laminare in sezione circolare equivalente di raggio $r(t) = \sqrt{\text{IJV\_CSA}(t)/\pi}$ è $Q = \frac{1}{2} v_{\max} \pi r^2$, sostituendo in $\tau_w = \frac{4\mu Q}{\pi r^3}$ si ottiene l'equazione dimensionalmente esatta in $\text{dyn/cm}^2$ ($\text{g}\cdot\text{cm}^{-1}\cdot\text{s}^{-2}$):
    $$\tau_w(t) = \frac{2 \cdot \mu \cdot v_{\max}(t)}{r(t)} = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\frac{\pi}{\text{IJV\_CSA}_{\text{cm}^2}(t)}}, \qquad \mu = 0.035\text{ Poise}$$
  - *Fasi Collegate*: Fase 02 (`A2`), Fase 06 (`C2`), Fase 07 (`C3`)
  - *Applicazione nel Progetto*: Implementato in `compute_tau_w_dyn_cm2` (`crates/ares-causal-graph/src/hemodynamics.rs`). Quando $\tau_w(t)$ scende sotto la soglia critica endoteliale ($1.20\text{ dyn/cm}^2$ in stasi severa vs $\ge 2.80\text{ dyn/cm}^2$ nominale), la down-regulation di `eNOS` e la carenza di Irisina/`miR-126-3p` innescano l'esocitosi dei corpi di Weibel-Palade (`vWF` e `P-selectina`), attivando la triade di Virchow nel grafo `ADHG`.

- **Ultrasound-Based Assessment of Jugular Vein Alterations in Response to Microgravity & Autonomous ISS Ultrasound (AMOS)**
  - *Autori*: D. S. Martin et al. (*Ultrasound in Medicine & Biology*, 2026, `DOI: 10.1016/j.umb.2026.01.004`); D. Ebert, A. Sargsyan et al., *"Autonomous Medical Operations System (AMOS) software demonstrations on the ISS"*, *Journal of Telemedicine and Telecare*, 2026 (`DOI: 10.1177/15305627261422798`)
  - *Modello Matematico (Osservatore Bayesiano POCUS a 2 Stadi — Invariante Entry 002)*:
    $$P_{\text{pre}}(\text{Thrombus} \mid \text{Stasis}) = \min\big(0.42 \cdot P(\text{Stasis}), \; 0.45\big) \le 0.45$$
    $$O_{\text{post}} = \frac{\max(P_{\text{pre}}, 0.35)}{1 - \max(P_{\text{pre}}, 0.35)} \cdot \text{LR}_+, \qquad P_{\text{post}}(\text{Thrombus} \mid \text{POCUS}_+) = \operatorname{clamp}\!\left(\frac{O_{\text{post}}}{1 + O_{\text{post}}}, \; 0.92, \; 0.995\right) \quad (\text{LR}_+ = 24.0)$$
  - *Fasi Collegate*: Fase 07 (`C3`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Applicazione nel Progetto*: Disaccoppia rigorosamente il sospetto emodinamico continuo (Stadio 1, limitato a $\le 0.45$ per bloccare l'anticoagulazione empirica e richiedere scansione ecografica `pocus_inspection_required = true`) dalla conferma diagnostica ecografica B-mode (Stadio 2, $\ge 0.92$ con $\text{LR}_+ = 24.0$).

- **Spaceflight Associated Neuro-Ocular Syndrome (SANS) & Translaminar Pressure Gradient Model (`OSD-818`)**
  - *Autori*: Andrew G. Lee, Thomas H. Mader, C. Robert Gibson, William J. Tarver, Michael R. Barratt et al. (*Eye and Brain*, Vol. 12, pp. 1–13, 2020, `DOI: 10.2147/EB.S235548`); Michael R. Barratt, S. L. Pool (Eds.), *Principles of Clinical Medicine for Space Flight* (2nd ed., Springer Nature, 2020, `DOI: 10.1007/978-1-4939-9889-0`); **NASA OSDR Study `OSD-818`** (*Ex vivo translaminar pressure model for SANS*)
  - *Modello Matematico (Indice Composito Translaminare & Congestione Venosa Cefalica)*:
    $$C_{\text{ven}}(t) = \operatorname{clamp}\!\left(\frac{\text{IJV\_CSA}(t) - 38.0}{62.0}, \; 0.0, \; 1.0\right)$$
    $$\text{ONSD}(t) = 5.05 + 1.35 \cdot C_{\text{ven}}(t) \;\; [\text{mm}], \qquad \Delta\text{CT}(t) = 12.0 + 58.0 \cdot C_{\text{ven}}(t) \;\; [\mu\text{m}]$$
    $$\text{SANS\_Risk}(t) = \operatorname{clamp}\!\left(0.45 \cdot \frac{\text{ONSD}(t) - 5.0}{1.4} + 0.35 \cdot \frac{\Delta\text{CT}(t)}{70.0} + 0.20 \cdot C_{\text{ven}}(t), \; 0.05, \; 0.98\right)$$
  - *Fasi Collegate*: Fase 06 (`C2`), Fase 07 (`C3`), Fase 10 (`E1`)
  - *Applicazione nel Progetto*: Accoppia l'ingorgo venoso giugulare cefalico e l'ipercapnia ambientale ($ppCO_2$) alla dilatazione della guaina del nervo ottico (`ONSD`) e all'ispessimento coroideale (`choroidal_delta_um`), attivando il `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION`.

---

## 2. Meccanotrasduzione Muscolo-Osso, ODE di Frost-Hargens (`SOST`), Qualità Muscolare (`MQI`) e Asimmetria del Passo a $0.38g$ (`GAI`) (Blocco C: Fase 05)

- **The Utah Paradigm of Skeletal Physiology (Frost's Mechanostat) & Sclerostin (`SOST`) Mechanotransduction**
  - *Autori*: Harold M. Frost (*"Bone's mechanostat: a 2003 update"*, *The Anatomical Record Part A*, Vol. 275A, No. 2, pp. 1081–1101, 2003, `DOI: 10.1002/ar.a.10119`); Alexander G. Robling, P. J. Niziolek, L. A. Baldridge, K. W. Condon, M. R. Allen, I. Alam, S. M. Warman, J. M. Lowery, J. S. Turner (Indiana University), *"Mechanical stimulation of bone in vivo reduces osteocyte expression of Sost/sclerostin"*, *Journal of Biological Chemistry*, Vol. 283, No. 9, pp. 5866–5875, 2008 (`DOI: 10.1074/jbc.M705092200`); S. Al-Nuaimi, Alan R. Hargens, *"Cellular Mechanotransduction and Sclerostin Dysregulation in Spaceflight-Induced Osteopenia"*, *Bone Research*, 2025 (`DOI: 10.1016/j.boneres.2025.100412`)
  - *Modello Matematico (ODE Regolarizzata di Hill-Frost-Hargens Integrata con Runge-Kutta di 4° Ordine `RK4`)*:
    $$\frac{d[\text{SOST}]}{dt} = k_{\text{prod}} \cdot \frac{1}{1 + \left(\frac{\varepsilon_{\text{mech}}(t)}{\varepsilon_{\text{Frost}}}\right)^{\gamma}} - k_{\text{deg}} \cdot [\text{SOST}](t)$$
    dove $\varepsilon_{\text{mech}}(t) = 11.2 \cdot F_{\text{ARED}}(t)$ [$\mu\varepsilon$], $\varepsilon_{\text{Frost}} = 1000.0\ \mu\varepsilon$, $\gamma = 2.0$, $k_{\text{prod}} = 18.5\text{ pmol/(L}\cdot\text{d)}$, $k_{\text{deg}} = 0.28\text{ d}^{-1}$, integrata tramite passo fisso RK4 (`step_sclerostin_rk4`):
    $$y_{n+1} = y_n + \frac{\Delta t}{6}\big(k_1 + 2k_2 + 2k_3 + k_4\big), \qquad \text{Ca}_{\text{urine}}(t) = 175.0 + 4.2 \cdot \max\big(0.0, \; [\text{SOST}](t) - 22.5\big) \;\; [\text{mg/d}]$$
  - *Fasi Collegate*: Fase 05 (`C1`), Fase 07 (`C3`), Fase 10 (`E1`)
  - *Applicazione nel Progetto*: Implementata in `crates/ares-causal-graph/src/mechanotransduction.rs`. Modella come il deficit di carico resistivo su `ARED` ($< 1000\ \mu\varepsilon$) rimuova l'inibizione meccanica sugli osteociti, facendo salire la Sclerostina plasmatica (`sclerostin_pmol_l > 55 pmol/L`) e causando ipercalciuria secondaria ad alto rischio di nefrolitiasi.

- **Ultrasound Muscle Quality Index (`MQI`), Myosteatosis Echo-Intensity & Martian $0.38g$ Gait Asymmetry Index (`GAI`)**
  - *Autori*: Prof. Francesco Pegreffi et al. (*Physical & Rehabilitation Medicine / Musculoskeletal Ultrasound & Post-Spaceflight Biomechanics*, University of Bologna, 2024–2026); **NASA OSDR Studies `OSD-51` & `OSD-195`** (60-day & 21-day HDBR Soleus/Vastus Lateralis); **ESA `Myotones` (ISS Expedition 75, Sept 2026)** & **`BRACE` 60-Day HDBR**; **NASA NLSP `BRSMFSR` & `SMCCP`**
  - *Modello Matematico (Indice Ecografico `MQI` del Soleo & Asimmetria del Passo `GAI` a $0.38g$)*:
    $$\text{MQI}(t) = \operatorname{clamp}\!\left(1.0 - 0.35 \cdot \frac{E_{\text{echo}}(t) - 48.0}{110.0 - 48.0} - 0.65 \cdot \frac{100.0 - \text{CSA}_{\text{soleus}}(t)}{100.0 - 70.0}, \; 0.15, \; 1.0\right)$$
    $$\text{GAI}_{0.38g}(t) = \operatorname{clamp}\!\Big(3.5 + 16.5 \cdot \big(1.0 - \text{MQI}(t)\big), \; 2.0, \; 28.0\Big) \;\; [\%]$$
  - *Fasi Collegate*: Fase 05 (`C1`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Applicazione nel Progetto*: Combina l'atrofia miofibrillare del soleo (`soleus_csa_pct`) con l'infiltrazione adiposa ecografica (`echo_intensity_au`) per calcolare `mqi_index`. Quando l'atrofia del soleo spinge $\text{GAI}_{0.38g} > 12.0\%$, scatta il **Hard Clinical Safety Gate 3** (`eva_suit_damping_active = true`), che blocca gli esercizi pliometrici ad alto impatto e aumenta del $+25\%$ lo smorzamento esocheletrico della caviglia della tuta EVA per prevenire la rottura del tendine d'Achille su Marte.

---

## 3. Logica Temporale Quantitativa Normalizzata (`NQS-STL`), Cuneo Monotono $O(1)$ di Lemire-Donzé e Predittore `TTV` (Blocco D: Fasi 08–09)

- **Efficient Robust Monitoring for Signal Temporal Logic (STL) & Online Quantitative Semantics**
  - *Autori*: Alexandre Donzé, Thomas Ferrère, Oded Maler (UC Berkeley & Verimag/CNRS)
  - *Venue*: *Computer Aided Verification (CAV 2013)*, Springer LNCS Vol. 8044, pp. 264–279, 2013
  - *DOI*: `10.1007/978-3-642-39799-8_19` (Estensione di A. Donzé, O. Maler, *FORMATS 2010*, `DOI: 10.1007/978-3-642-15297-9_9`)
  - *Fasi Collegate*: Fase 08 (`D1`), Fase 09 (`D2`)
  - *Applicazione nel Progetto*: Semantica formale per il monitoraggio online di specifiche temporali $\Box_{[a,b]}\varphi$ su serie fisiologiche continue in `crates/ares-nqs-stl`.

- **Streaming Maximum-Minimum Filter Using No More than Three Comparisons per Element (Lemire's Monotonic Wedge)**
  - *Autori*: Daniel Lemire (Université du Québec)
  - *Venue*: *Nordic Journal of Computing*, Vol. 13, No. 4, pp. 328–339, 2006
  - *arXiv*: `arXiv:cs/0610046`
  - *Modello Matematico (Invariante del Cuneo Monotono $O(1)$ Ammortizzato — Invariante Entry 007)*:
    Mantiene una coda doppia `VecDeque<(u64, f64)>` strettamente monotona crescente $v(t_{i_1}) \le v(t_{i_2}) \le \dots \le v(t_{i_k})$ con $t - W \le t_{i_1} < \dots < t_{i_k} \le t$, garantendo che il minimo su finestra scorrevole $\hat{\rho}_{\Box, k}(t) = \min_{\tau \in [t-W, t]} \hat{\rho}_k(\tau)$ sia sempre disponibile in testa alla coda (`front()`) in tempo $O(1)$ con $\le 3$ confronti ammortizzati per campione.
  - *Fasi Collegate*: Fase 08 (`D1`)
  - *Applicazione nel Progetto*: Implementato in `LemireMinWedge` (`crates/ares-nqs-stl/src/sliding_window.rs`), azzerando i picchi di latenza $O(W)$ durante lo spostamento a $20\text{ Hz}$ degli slider della *What-If Stress-Test Console*.

- **Normalized Quantitative Semantics (NQS-STL) & Online Causation Monitoring**
  - *Autori*: Noushin Mehdipour, Cristian-Ioan Vasile, Calin Belta (*"Arithmetic-Geometric Mean Robustness for Control from Signal Temporal Logic Specifications"*, *IEEE ACC 2019*, `DOI: 10.23919/acc.2019.8814487`); Konstantinos Mamouras (*"Algebraic Quantitative Semantics for Efficient Online Temporal Monitoring"*, 2021, `DOI: 10.26226/morressier.604907f41a80aac83ca25cf8`); Zhenya Zhang, Jie An, Paolo Arcaini et al. (*"Online Causation Monitoring of Signal Temporal Logic"*, *CAV 2023*, `arXiv:2305.17754v1`)
  - *Modello Matematico (Normalizzazione Adimensionale Contro la Dominanza di Scala — Invariante Entry 004)*:
    $$\hat{\rho}_k(t) = \operatorname{clamp}\!\left(\frac{s_k \cdot \big(x_k(t) - x_{k,\text{crit}}\big)}{\big|x_{k,\text{nom}} - x_{k,\text{crit}}\big|}, \; -2.0, \; +1.0\right), \qquad \hat{\rho}_{\text{global}}(t) = \min_{k \in \{1..5\}} \hat{\rho}_{\Box, k}(t)$$
    dove $s_k \in \{+1, -1\}$ orienta la polarità di sicurezza ($\hat{\rho}_k = +1.0$ nominale pre-volo, $\hat{\rho}_k = 0.0$ soglia critica, $\hat{\rho}_k < 0.0$ violazione clinica).
  - *Fasi Collegate*: Fase 08 (`D1`), Fase 09 (`D2`)
  - *Applicazione nel Progetto*: Implementato in `crates/ares-nqs-stl/src/normalizer.rs`, rendendo commensurabili grandezze con unità fisiche eterogenee ($\tau_w$ in $\text{dyn/cm}^2$, $\text{SOST}$ in $\text{pmol/L}$, $\text{ONSD}$ in $\text{mm}$, dose neutronica `CANS` in $\text{mSv/d}$, $\text{RMSSD}$ in $\text{ms}$).

- **EWMA-OLS 7-Day Time-To-Violation (`TTV`) Estimator & Mission Readiness Index (`MRI`)**
  - *Modello Matematico (`crates/ares-nqs-stl/src/ttv_predictor.rs` & `mri_index.rs`)*:
    $$\text{TTV}_{\text{hours}}(t) = \frac{\hat{\rho}_{\text{global}}(t)}{\big|\dot{\hat{\rho}}_{\text{EWMA-OLS}}(t)\big|}, \qquad \text{CI}_{95\%} = \Big[\text{TTV}(t) - 1.96\,\sigma_{\text{TTV}}(t), \; \text{TTV}(t) + 1.96\,\sigma_{\text{TTV}}(t)\Big]$$
  - *Fasi Collegate*: Fase 09 (`D2`)
  - *Applicazione nel Progetto*: Predice con giorni di anticipo l'istante di attraversamento della soglia clinica ($\hat{\rho} = 0$) fornendo il cono di incertezza $\pm 1.96\sigma$ e sintetizzando il punteggio globale `MRI` ($0\text{–}100$).

---

## 4. Replay Riproducibile `BIDMC v1.0.0`, Entropia Spettrale di Shannon (`SQI`) e Radar Cardiorespiratorio Contactless (Blocco B: Fasi 03–04)

- **BIDMC PPG and Respiration Dataset v1.0.0 (PhysioNet)**
  - *Autori*: Marco A. F. Pimentel, Alistair E. W. Johnson, P. H. Charlton, D. Birrenkott, P. J. Watkinson, L. Tarassenko, D. A. Clifton
  - *Venue*: *"Toward a Robust Estimation of Respiratory Rate From Pulse Oximeters"*, *IEEE Transactions on Biomedical Engineering (TBME)*, Vol. 64, No. 8, pp. 1914–1923, 2017 | PhysioNet Repository (`ODC-By-1.0`)
  - *DOI*: `10.1109/TBME.2016.2613124` | `10.13026/C2J01F`
  - *Fasi Collegate*: Fase 01 (`A1`), Fase 03 (`B1`), Issue `#4` (`Entry 006`)
  - *Applicazione nel Progetto*: Sorgente clinica reale (`data/bidmc/bidmc_01..03_Numerics.csv`, `1 Hz`, `481` righe per file da `0` a `480 s`) verificata tramite SHA-256 in `data/bidmc/MANIFEST.json`. Il parser `BidmcReplayer` (`crates/ares-telemetry-ingest/src/bidmc_replayer.rs`) rimuove gli spazi iniziali negli header (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`), preserva i 13 campioni mancanti in `bidmc_01` come `Option<f64>::None` (`null` in JSON) senza mai convertirli in falsi zeri, ed etichetta la provenienza come `RECORDED_TERRESTRIAL_BIDMC_CSV`.

- **Shannon Spectral Entropy Signal Quality Index (`SQI`) & Wearable Missingness Robustness**
  - *Autori*: C. E. Shannon (*Bell System Technical Journal*, 1948); H. Davis-Wilson et al., *"Impact of missing smartwatch data and signal quality on HRV metrics"*, *JMIR*, 2025 (`DOI: 10.2196/53645`); P. Balali et al., *"Wearable cardiovascular monitoring and baseline posture in 17 cosmonauts"*, *npj Microgravity*, 2025 (`DOI: 10.1038/s41526-025-00522-8`)
  - *Modello Matematico (`crates/ares-telemetry-ingest/src/sqi_filter.rs`)*:
    $$\text{SQI}(t) = 1.0 - \frac{-\sum_{k=1}^{N} p_k \ln(p_k)}{\ln(N)} \in [0.0, 1.0]$$
    Se $\text{SQI}(t) < 0.70$, il filtro applica *Zero-Order Hold* (ZOH) sull'ultimo campione valido, sopprimendo falsi allarmi da artefatti da movimento durante gli esercizi su `ARED`.
  - *Fasi Collegate*: Fase 04 (`B2`)

---

## 5. Architetture a Grafo di Conoscenza Biomedica, Scene Graph Deontici 3D (`Clio` / `DGSG-Mind`) e `ARES-HyperGraph` (Studio Architetturale Knowledge Graph)

- **Clio: Real-Time Task-Driven Open-Set 3D Scene Graphs & Hierarchical Super-Node Compaction (`R4DSG`)**
  - *Autori*: Dominic Maggio, Yun Chang, Nathan Hughes, Matthew Trang, Luca Carlone (MIT SPARK Lab)
  - *Venue*: *IEEE Robotics and Automation Letters (RA-L)*, Vol. 9, No. 10, pp. 8921–8928, 2024 | *DOI*: `10.1109/LRA.2024.3451395` | *arXiv*: `arXiv:2404.13696` (Esteso in *FOUND-IT*, `arXiv:2605.25371` & *R4DSG*, `arXiv:2608.11017`, 2026); B. P. Welford (*Technometrics*, Vol. 4, No. 3, pp. 419–420, 1962)
  - *Modello Matematico (Information Bottleneck, Decadimento Esponenziale & Super-Nodi di Welford)*:
    $$\min_{p(\tilde{x}|x)} \; I(\tilde{X}; X) - \beta \, I(\tilde{X}; Y), \qquad w_{ij}(t) = w_0 \cdot \exp(-\lambda_r \cdot \Delta t), \qquad P(z_b \mid z_a, c) = \frac{n_{ab}^{(c)} + \alpha}{\sum_{b'} n_{ab'}^{(c)} + K\alpha}$$
  - *Applicazione nel Progetto*: Fondamento di `graph_compactor.rs` (`spatiotemporal-mcp-engine-backup`) e della compattazione longitudinale a 1000 giorni in **Layer 1 & Layer 2 di `ARES-HyperGraph`** (`docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md`).

- **DGSG-Mind: Open-Vocabulary Deontic Reasoning on 3D Dynamic Scene Graphs & Brick Schema**
  - *Autori*: Luzhou Ge, Xiangyu Zhu, Jinyan Liu, Xuesong Li (`arXiv:2605.29879v3`, 2026, `DOI: 10.48550/arXiv.2605.29879`); Bharathan Balaji et al. (*"Brick: Metadata schema for portable smart building applications"*, *Applied Energy*, Vol. 226, pp. 1273–1292, 2018, `DOI: 10.1016/j.apenergy.2018.02.091`)
  - *Applicazione nel Progetto*: Fondamento di `OntologyDescriptor` (`16-byte #[repr(C)]`), `ZoneDeonticPolicy` e `OntologyReasoner` (`spatiotemporal-mcp-engine-backup/crates/spatiotemporal-db/src/ontology_reasoner.rs`), traslati in **Layer 2 (`ARES-SpatialGraph`)** e **Layer 3 (`ARES-BioKG` `BiomedicalEvidenceDescriptor`)** per governare i compartimenti dell'habitat spaziale (`Sleep Quarters`, `ARED Bay`, `LBNP Chamber`, `MedOps Bay`, `Storm Shelter`, `EVA Airlock`).

- **SPOKE & NASA OSDR/GeneLab Biomedical Knowledge Graph (`Proto-OKN`), `BioCypher`, `Biolink Model` & Harvard `PrimeKG` / `PrimeKG-Plus`**
  - *Autori*: Charlotte A. Nelson, Ana Uriarte Acuna, Amber M. Paul, R. T. Scott, Sergio E. Baranzini, Sylvain V. Costes et al. (UCSF & NASA Ames Research Center, *"Knowledge Network Embedding of Transcriptomic Data from Spaceflown Mice Uncovers Signs and Symptoms Associated with Terrestrial Diseases"*, *Life*, Vol. 11, No. 1, Art. 42, 2021, `DOI: 10.3390/life11010042` & *NSF Proto-OKN NASA OSDR-SPOKE Data Fabric*, 2024–2026, `https://github.com/BaranziniLab/SPOKE`, `https://github.com/nasa/GeneLab_Data_Processing`); John H. Morris, Karthik Soman, Rabia E. Akbas, Charlotte A. Nelson, Sergio E. Baranzini et al. (*"The scalable precision medicine open knowledge engine (SPOKE): a massive knowledge graph of biomedical information"*, *Bioinformatics*, Vol. 39, No. 2, btad080, 2023, `DOI: 10.1093/bioinformatics/btad080`); Sebastian Lobentanzer, Patrick Aloy, Jan Baumbach, Baldo Oliva, Julio Saez-Rodriguez et al. (*"Democratizing knowledge representation with BioCypher"*, *Nature Biotechnology*, Vol. 41, pp. 1056–1059, 2023, `DOI: 10.1038/s41587-023-01848-y`, `arXiv:2212.13543v3`, `https://github.com/biocypher/biocypher`); Johann Dreo, Claire Laudy, Sebastian Lobentanzer et al. (*"Reproducible Mapping of Tabular Data into Semantic Knowledge Graphs with OntoWeaver and BioCypher"*, *IEEE FUSION 2024*, `DOI: 10.23919/fusion59988.2024.10706497`); Deepak R. Unni, Sierra A. T. Moxon, Michael Bada, Melissa Haendel, Chris J. Mungall et al. (*"Biolink Model: A Universal Schema for Knowledge Graphs in Clinical, Biomedical, and Translational Science"*, *Clinical and Translational Science*, Vol. 15, No. 8, pp. 1848–1855, 2022, `DOI: 10.1111/cts.13302`, `arXiv:2203.13906v1`, `https://github.com/biolink/biolink-model`); Payal Chandak, Kexin Huang, Marinka Zitnik (Harvard Medical School, *"Building a knowledge graph to enable precision medicine — PrimeKG"*, *Scientific Data (Nature)*, Vol. 10, Art. 67, 2023, `DOI: 10.1038/s41597-023-01960-3`, `https://github.com/mims-harvard/PrimeKG` & *PrimeKG-Plus*, 2025–2026)
  - *Applicazione nel Progetto*: Fondamento scientifico di **Layer 3 (`ARES-BioKG`)** in `docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md` e del **Grafo Unificato Multi-Dataset (`ARES-DatasetGraph`, Fase 20 / Blocco I3)** in `docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md`, che indicizza in RAM (`~8.4 MB` per `~14,600` nodi e `~112,000` archi tipizzati Biolink, con esportazione JSON compatibile `graphify` in `data/knowledge_graph/ares_dataset_graph.json` e puntatori colonnari `slice://` verso Apache Parquet) tutti i 24 dataset multi-agenzia e le clausole `NASA-STD-3001` con provenienza $O(1)$.

- **BioHarness: Substrate-Aware Evidence Assembly & Neuro-Symbolic Clinical Decision Support Graphs (2026)**
  - *Autori*: Meng Xiao, Chuan Qin, Jinmiao Chen et al. (*"BioHarness: Substrate-Aware Evidence Assembly for Biomedical Question Answering across Literature, Knowledge Bases, and Biological Atlases"*, `arXiv:2606.19396v1`, Giugno 2026); Mete Ucdal, Evren Ekingen, Ali Niyazi Kurtcebe (*"A neuro-symbolic clinical decision support system... using structured derivation traces, adaptive compute, and knowledge graph constraint checking"*, *BMC Anesthesiology*, 2026, `DOI: 10.1186/s12871-026-04316-7`); Liuyi Xu et al. (*"CORE-Acu: Structured Reasoning Traces and Knowledge Graph Safety Verification for Clinical Decision Support"*, `arXiv:2603.08321v1`, Marzo 2026); David Tom Foss (*"Sovereign Causal Graph: A Neuro-Symbolic Architecture for Air-Gapped Knowledge Discovery"*, *SSRN*, 2026, `DOI: 10.2139/ssrn.6060955`)
  - *Applicazione nel Progetto*: Giustifica la separazione formale dei substrati di evidenza (`ProvenanceSubstrate`: `RecordedTerrestrialBidmcCsv` vs `DerivedBiophysicalModel` vs `MechanisticAgencyPrior` vs `SimulatedScenarioInput`), le tracce di derivazione causale strutturate e il gate di verifica pre-esecuzione `ClinicalAnswerabilityGate`.

---

## 6. Cristallizzazione Progressiva di Playbook DAG (`Type 1`), Routing `FastMCP` e Previsione Quantilica `Timestral` (Blocchi E & G: Fasi 10–14 & Studio Timestral)

- **Progressive Crystallization: Turning Agent Exploration into Deterministic, Lower-Cost Workflows in Production**
  - *Autori*: Arun Malik (Microsoft Azure Networking)
  - *Venue*: `arXiv:2607.07052v1` [cs.SE], Luglio 2026 | *DOI*: `10.48550/arXiv.2607.07052`
  - *Fasi Collegate*: Fase 10 (`E1`), Fase 11 (`E2`), Fase 14 (`G2`)
  - *Applicazione nel Progetto*: Fondamento teorico per compilare i 5 protocolli medici di emergenza (`PLAYBOOK_01`–`PLAYBOOK_05`) e i **3 Hard Clinical Safety Gates** come **DAG deterministici Type-1 in puro Rust** (`crates/ares-medops-playbooks`, latenza $< 20\,\mu\text{s}$, zero allucinazioni e zero dipendenza dal ragionamento stocastico LLM nel loop di sicurezza).

- **ProgRouter: Online Progress-Guided Orchestration for Multi-Agent LLM Workflows & IoT-MCP Context-Mode**
  - *Autori*: Songyuan Li, Ahmed M. Abdelmoniem, Shiqiang Wang (*Findings of ACL: EMNLP 2026*, `arXiv:2608.25992v2`, `DOI: 10.48550/arXiv.2608.25992`); Paolo Bellagente, Matteo Ferrari, Marco Pasetti, Paolo Ferrari (*"IoT-MCP: Enabling Large Language Models to Interact with the Physical World through the Model Context Protocol"*, `arXiv:2502.16467`, 2025); A. A. R. Taresh, N. A. K. Zghair (*"Semantic-Driven Context Pruning for Multi-Turn AI"*, *Information*, 2026, `DOI: 10.3390/info17100990`)
  - *Fasi Collegate*: Fase 13 (`G1`), Fase 14 (`G2`)
  - *Applicazione nel Progetto*: Architettura del server `FastMCP JSON-RPC 2.0` su `stdio` (`crates/ares-server-cli/src/mcp_stdio.rs`) con compressione semantica Context-Mode rigorosamente limitata a $\le 600\text{ byte}$ ($< 150\text{ token}$) per risposta e isolamento totale dal bus WebSocket `axum` a $20\text{ Hz}$ (`127.0.0.1:8080`).

- **Timestral: Patch-Based Dual-Axis Attention Foundation Model for Multivariate Probabilistic Forecasting & Conformal Abstention**
  - *Autori*: Mistral AI (*"Timestral: Patch-Based Dual-Axis Attention Foundation Model for Multivariate Probabilistic Forecasting"*, Ottobre 2026); D. Nie, Y. Wu, C.-C. J. Kuo (*"A Statistical Approach for Modeling Irregular Multivariate Time Series with Missing Observations"*, 2025, `DOI: 10.21203/rs.3.rs-6198987/v1`); J. Du, S. Jiang (*"PCFNet: Period-channel fusion network for multivariate time series forecasting"*, *Information Fusion*, 2026, `DOI: 10.1016/j.inffus.2026.104281`); Anastasios N. Angelopoulos et al. (*"Conformal Risk Control"*, *ICLR 2024*, `arXiv:2208.02814`)
  - *Modello Matematico (Decoupled Horizon Forecasting Monotone Quantiles & Conformal Abstention Gate)*:
    $$q_{0.50}(t + \Delta t) = \mu_{\theta}(\mathbf{X}_{t-L:t}), \qquad q_{0.05}(t + \Delta t) = q_{0.50} - \operatorname{softplus}(\delta_{\theta}^{\text{low}}), \qquad q_{0.95}(t + \Delta t) = q_{0.50} + \operatorname{softplus}(\delta_{\theta}^{\text{high}})$$
    garantendo strutturalmente $q_{0.05}(t+\Delta t) \le q_{0.50}(t+\Delta t) \le q_{0.95}(t+\Delta t)$ senza incroci quantilici.
  - *Applicazione nel Progetto*: Documentato in `docs/architecture/TIMESTRAL_INTEGRATION_STUDY.md` per l'integrazione ibrida Physics-Informed ODE + Timestral Dual-Axis Attention sui trend cardiorespiratori `BIDMC` e sui coni di incertezza `NQS-STL` $\hat{\rho}_k(t+\Delta t)$.

---

## 7. Standard Tecnici `NASA-STD-3001`, Sicurezza Crittografica, Privacy dell'Equipaggio e I 24 Dataset Ufficiali (Blocco A & Blocco F: Fasi 01, 02, 12)

- **NASA-STD-3001 Volume 1 Rev C & Volume 2 Rev F (Luglio 2026) e NASA OCHMO `MTB-007` (Gennaio 2026)**
  - *Organizzazione*: National Aeronautics and Space Administration (NASA Office of the Chief Health and Medical Officer — Dr. James D. Polk)
  - *Link Ufficiali*:
    - `https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1` (`[V1 3001]`–`[V1 4001]`, Ch. 7 Crew Medical Privacy)
    - `https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2` (`[V2 6001]`–`[V2 10001]`, Habitability, $ppCO_2$, Acoustics, Medical UI)
    - `NASA OCHMO Technical Brief MTB-007` (*Venous Thrombosis in Spaceflight*, Gennaio 2026)
  - *Fasi Collegate*: Fase 02 (`A2`), Fase 11 (`E2`), Fase 12 (`F1`)
  - *Applicazione nel Progetto*: Definisce tutte le costanti normative in `crates/ares-core-types/src/constants.rs` e le 3 viste di riservatezza medica per ruolo (`AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon`) in `crates/ares-security-privacy/src/privacy_views.rs`.

- **FIPS 180-4 (`SHA-256` Hash Chain), IETF RFC 8439 (`ChaCha20-Poly1305` AEAD), `ZeroizeOnDrop` & NIST SP 800-161r1 (Air-Gap)**
  - *Standard*: NIST FIPS PUB 180-4 (*Secure Hash Standard*); Y. Nir, A. Langley, *IETF RFC 8439: ChaCha20 and Poly1305 for IETF Protocols* (2018); NIST SP 800-161 Rev. 1 (*Cybersecurity Supply Chain Risk Management & Air-Gapped Enclaves*, `DOI: 10.6028/NIST.SP.800-161r1`)
  - *Modello Matematico (Catena di Audit Non Ripudiabile SHA-256)*:
    $$H_n = \operatorname{SHA-256}\big(H_{n-1} \mathbin{\Vert} t_n \mathbin{\Vert} \text{actor\_role}_n \mathbin{\Vert} \text{action}_n \mathbin{\Vert} \text{payload\_hash}_n\big)$$
  - *Fasi Collegate*: Fase 12 (`F1`)
  - *Applicazione nel Progetto*: Implementato in `crates/ares-security-privacy` (`audit_chain.rs`, `privacy_views.rs`, `sanitizer.rs`): garantisce l'integrità matematica degli override clinici, la cifratura autenticata `ChaCha20-Poly1305` con azzeramento automatico della chiave in RAM (`EphemeralDsnKey` con `ZeroizeOnDrop`) per i bundle Store-and-Forward verso il Deep Space Network (DSN), e lo scudo XML `<untrusted_telemetry_observation>` contro attacchi di Indirect Prompt Injection sul canale MCP.

- **Space Omics and Medical Atlas (`SOMA` Nature 2024), NASA Twins Study & Multi-Agency Spaceflight Datasets (24 Fonti)**
  - *Autori*: Eliah G. Overbey, JangKeun Kim, Braden T. Tierney, Christopher E. Mason et al., *"The Space Omics and Medical Atlas (SOMA) across orbits, disciplines, and technologies"*, *Nature*, Vol. 632, pp. 1145–1158, 2024 (`DOI: 10.1038/s41586-024-07382-x` / `10.1038/s41586-024-07639-y`); Francine E. Garrett-Bakelman et al., *"The NASA Twins Study"*, *Science*, Vol. 364, eaau8650, 2019 (`DOI: 10.1126/science.aau8650`); Emmanuel Urquieta et al., *"The EXPAND Database"*, *Aerosp. Med. Hum. Perform.*, Vol. 93, No. 8, pp. 643–649, 2022 (`DOI: 10.3357/AMHP.6074.2022`); B. Kruse, E. Urquieta et al., *"Human Digital Twin Platforms for Predictive Space Medicine"*, *Front. Bioeng. Biotechnol.*, Vol. 13, 1421092, 2025 (`DOI: 10.3389/fbioe.2025.1421092`); Marco De Martino et al., *Front. Netw. Physiol.*, 2026 (`DOI: 10.3389/fnetp.2026.1867627`)
  - *Dataset Ufficiali Integrati*:
    1. **NASA OSDR Federated (`cgene,alsda,esa`):** `OSD-51`, `OSD-195`, `OSD-570`, `OSD-571`, `OSD-818`.
    2. **NASA NLSP & Open Data Portal:** `NASA-0000100`, `FAP`, `SMCCP`, `BRSMFSR`, `BRSMPT`, *Neuroendocrine Tilt*.
    3. **NASA LSAH & HRP:** Longitudinal DXA/FRAX epidemiology, `ARCHeR`, `Venous Haemostasis`, `Zero T2`, `CIPHER`, `Thigh Cuff`, `B-Complex`.
    4. **CSA (Canadian Space Agency):** `CANS` (Feb 2026 Active Neutron Spectrometer), `Bio-Monitor`, `Vascular Aging`, `MARROW`.
    5. **ESA, DLR & JAXA:** ESA `Myotones` (Sept 2026, Expedition 75), `BRACE` 60d HDBR, DLR `:envihab` `AGBRESA` & `SANS-CM`, NASA-JAXA `Bisphosphonates`.
    6. **NASA Analogs, TRISH & PhysioNet/UCI:** `CHAPEA` (378d Mars), `HERA`, TRISH `EXPAND` & `HERMES`, PhysioNet `BIDMC v1.0.0`, `CEBS`, `Fantasia`, UCI `PPG-DaLiA` (`DOI: 10.24432/C53890`).

---

## 8. Open-Source Reference Repositories, Ontologies & NASA Portals Registry (Blocco H & Blocco I: Fasi 15–20)

| Repository / Ontology / Portal | Primary URL & Citation | Architectural Role in ARES-Health | Mapped Rust / Workspace Files |
| :--- | :--- | :--- | :--- |
| **`BaranziniLab/SPOKE`** | `https://github.com/BaranziniLab/SPOKE` — Morris et al., *Bioinformatics* 39(2):btad080 (2023), `DOI: 10.1093/bioinformatics/btad080`; Nelson et al., *Life* 11(1):42 (2021), `DOI: 10.3390/life11010042` | Bridges NASA OSDR spaceflight multi-omics studies (`OSD-51`, `OSD-195`, `OSD-818`, `OSD-570`, `OSD-635`, `OSD-379`, `OSD-48`) to anatomical targets, DEGs (`SOST`, `RANKL`, `VEGFA`, `ICAM1`, `NOS3`, `HIF1A`, `IL6`, `COL1A1`, `ACTA1`, `MYH7`, `PPARGC1A`, `BDNF`), and clinical phenotypes. | `crates/ares-causal-graph/src/dataset_graph.rs` |
| **`nasa/GeneLab_Data_Processing`** | `https://github.com/nasa/GeneLab_Data_Processing` & `https://osdr.nasa.gov/bio/repo/` | Standardized NASA OSDR / GeneLab differential expression ingestion (`log2FC`, FDR adjusted p-values) and spaceflight cohort grounding. | `crates/ares-causal-graph/src/dataset_graph.rs`, `crates/ares-causal-graph/src/biokg_reasoner.rs` |
| **`biocypher/biocypher`** (incl. OntoWeaver) | `https://github.com/biocypher/biocypher` — Lobentanzer et al., *Nature Biotechnology* 41:1056–1059 (2023), `DOI: 10.1038/s41587-023-01848-y`; Dreo et al., *IEEE FUSION* (2024) | Declarative `DatasetGraphAdapter` pattern (`BidmcCsvAdapter`) and strict formal ontology CURIE grounding (`UBERON:`, `LOINC:`, `MONDO:`, `HP:`, `HGNC:`). | `crates/ares-causal-graph/src/dataset_graph.rs`, `crates/ares-causal-graph/src/hypergraph_spatial.rs` |
| **`mims-harvard/PrimeKG`** | `https://github.com/mims-harvard/PrimeKG` — Chandak, Huang, Zitnik, *Scientific Data (Nature)* 10:67 (2023), `DOI: 10.1038/s41597-023-01960-3` | Nine multimodal precision-medicine node categories (`Dataset`, `SubjectCohort`, `TimeWindowSlice`, `Biomarker`, `GeneProtein`, `AnatomicalStructure`, `PathologyPhenotype`, `Countermeasure`, `NormativeClause`). | `crates/ares-causal-graph/src/dataset_graph.rs`, `crates/ares-medops-playbooks/src/grounding.rs` |
| **`biolink/biolink-model`** | `https://github.com/biolink/biolink-model` — Unni et al., *Clin. Transl. Sci.* 15(8):1848–1855 (2022), `DOI: 10.1111/cts.13302` | Standardized directed edge predicates (`biolink:measures_biomarker`, `biolink:shows_effect_size`, `biolink:causally_drives`, `biolink:correlated_with`, `biolink:expressed_in`, `biolink:mitigated_by`, `biolink:governed_by_shall`, `biolink:has_time_window_slice`). | `crates/ares-causal-graph/src/dataset_graph.rs` |
| **`mistralai/timestral`** | `https://github.com/mistralai/timestral` & `docs/architecture/TIMESTRAL_INTEGRATION_STUDY.md` | Non-crossing DHF monotone quantile cones ($[q_{0.05}, q_{0.50}, q_{0.95}]$), pessimistic $\text{TTV}_{q_{0.05}}$, and `ConformalAbstentionGate`. | `crates/ares-nqs-stl/src/` (Blocco H, Fasi 15–17) |
| **`petgraph/petgraph`** | `https://github.com/petgraph/petgraph` (`petgraph 0.7`, `StableDiGraph`) | In-memory directed property graphs for `ADHG` Layer 1, 3D `UBERON:` anatomical conduction subgraph, and the 24-dataset `ARES-DatasetGraph` with BFS shortest-path and community clustering. | `crates/ares-causal-graph/src/adhg_graph.rs`, `crates/ares-causal-graph/src/hypergraph_spatial.rs`, `crates/ares-causal-graph/src/dataset_graph.rs` |
| **`apache/arrow-rs`** | `https://github.com/apache/arrow-rs` (Apache Arrow & Parquet columnar specification) | Zero-copy columnar time-series storage layout paired with compact `slice://` URI handles (`slice://bidmc/01/t_0000_0060`) in `TimeWindowSlice` nodes so raw high-frequency waveforms never bloat RAM. | `crates/ares-causal-graph/src/dataset_graph.rs`, `docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md` |
| **`lancedb/lancedb`** | `https://github.com/lancedb/lancedb` (Hybrid Vector + Graph Storage Architecture) | Hot/Warm/Cold temporal decay storage pattern adapted to `WelfordAccumulator` + `LongitudinalSuperNode` (< 200 KB for 900 Martian Sols) and `graphify` disk bundle export (`data/knowledge_graph/ares_dataset_graph.json`, `graphify-out/graph.json`). | `crates/ares-causal-graph/src/hypergraph_spatial.rs`, `crates/ares-causal-graph/src/dataset_graph.rs` |
| **`huggingface/candle`** | `https://github.com/huggingface/candle` (Pure-Rust ML & Apple Metal / CUDA Tensor Backend) | Pure-Rust zero-Python tensor execution paradigm guiding hardware-aligned `#[repr(C, align(16))]` `BiomedicalEvidenceDescriptor` (16-byte) and edge inference abstractions. | `crates/ares-causal-graph/src/biokg_reasoner.rs`, `docs/architecture/IMPLEMENTATION_STACK.md` |

