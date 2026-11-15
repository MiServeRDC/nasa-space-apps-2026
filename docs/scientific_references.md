# ARES-Health — Scientific Sources, Multi-Agency Datasets, NASA Standards, and Mathematical Models Register

> Issue #12 correction: this is a historical bibliography, not proof of parameter-level validation. See [MODEL_EVIDENCE_AUDIT.md](architecture/MODEL_EVIDENCE_AUDIT.md) for checked source scope. In particular, current fixed-rate TTV is not a fitted 7-day EWMA-OLS and its bands are not calibrated 95% intervals; deterministic Timestral weights do not establish forecast accuracy.

This document catalogues the theoretical foundations, peer-reviewed scientific literature (verified through the `deep-scholar` protocol), aerospace technical standards (`NASA-STD-3001`, `NASA OCHMO MTB-007`), cryptographic RFC/FIPS standards, multi-agency clinical and spaceflight datasets (24 official sources across NASA, CSA, ESA, DLR, TRISH, JAXA, PhysioNet, and UCI), and mathematical models underpinning the architecture of **ARES-Health** (*Autonomous Resilient Edge-native System for Astronaut Health* — NASA Space Apps Challenge 2026).

---

## 1. Internal Jugular Venous Hemodynamics (`IJV`), Microgravity Thrombosis, `LBNP` Dose-Response, and Neuro-Ocular Syndrome (`SANS`) (Block C: Phases 06–07)

- **Assessment of Jugular Venous Blood Flow Stasis and Thrombosis During Spaceflight**
  - *Authors*: Karina Marshall-Goebel, Stuart S. Laurie, Irina V. Alferova, Nimesh C. Patel, Alan R. Hargens, Michael B. Stenger, Serena M. Auñón-Chancellor et al. (NASA Johnson Space Center / KBR)
  - *Venue*: *JAMA Network Open*, Vol. 2, No. 11, e1915011, Novembre 2019
  - *DOI / PMCID*: `10.1001/jamanetworkopen.2019.15011` | `PMCID: PMC6902784`
  - *Articolo Clinico Correlato*: Serena M. Auñón-Chancellor, J. M. Pattarini, S. Moll, A. Sargsyan, *"Venous Thrombosis during Spaceflight"*, *New England Journal of Medicine (NEJM)*, Vol. 382, No. 1, pp. 89–92, 2020 (`DOI: 10.1056/NEJMc1913835`)
  - *Related Phases*: Fase 06 (`C2`), Fase 07 (`C3`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Application in Project*: Evidenza clinica primaria su 11 astronauti ISS dello sviluppo di stasi e flusso bidirezionale/retrogrado nella vena giugulare interna (`IJV`) entro il giorno di volo FD50, inclusa la scoperta di trombosi giugulare occlusiva asintomatica. Giustifica il monitoraggio continuo di $\text{IJV\_CSA}$ e $v_{\max}$, l'osservatore Bayesiano POCUS a 2 stadi (`crates/ares-causal-graph/src/bayesian_pocus.rs`) e il **Hard Clinical Safety Gate 1** (divieto assoluto di somministrare Enoxaparina o Apixaban sulla sola stasi emodinamica senza conferma ecografica B-mode di trombo endoluminale non comprimibile).

- **Case Study: Dose-Dependent Internal Jugular Vein Response to Lower Body Negative Pressure During Spaceflight ( & Studio Cinese Stratificato per Sesso su LBNP 2026)**
  - *Authors*: C. Pappas, Stuart S. Laurie, Karina Marshall-Goebel et al. (*Journal of Applied Physiology*, 2026, `DOI: 10.1152/japplphysiol.00018.2026`); Studio Cinese di Medicina Aerospaziale, *"分级下体负压对颈内静脉血流的影响：一项性别分层的剂量-反应研究"* (*Graded LBNP Effects on Internal Jugular Vein Blood Flow: A Sex-Stratified Dose-Response Study*, Settembre 2026); Shigehiko Ogoh, Ai Hirasawa, Shigeki Shibata, *"Influence of head-up tilt and lower body negative pressure on the internal jugular vein"*, *Physiological Reports*, 2022 (`DOI: 10.14814/phy2.15248`); Alan R. Hargens et al. (*FASEB Journal*, `DOI: 10.1096/fasebj.29.1_supplement.990.9`)
  - *Mathematical Model (Curva Dose-Risposta LBNP & Ripristino dello Shear Stress Laminare)*:
    $$\text{IJV\_CSA}(t) = \text{CSA}_{0g} \cdot \Big(1.0 - 0.28 \cdot \text{MQI}(t) - 0.34 \cdot \frac{|P_{\text{LBNP}}(t)|}{30.0} + 0.08 \cdot R_{\text{rad}}(t)\Big)$$
    $$v_{\max}(t) = v_{0g} + 9.8 \cdot \text{MQI}(t) + 7.4 \cdot \frac{|P_{\text{LBNP}}(t)|}{30.0} - 1.8 \cdot R_{\text{rad}}(t)$$
  - *Related Phases*: Fase 06 (`C2`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Application in Project*: Dimostra che una depressione `LBNP` di $-30\text{ mmHg}$ riduce l'area trasversa giugulare (`IJV_CSA`) fino al $34\text{–}42\%$ e ripristina il flusso laminare anterogrado senza indurre il collasso sincopale osservato a $-40 / -50\text{ mmHg}$. Alimenta sia `compute_jugular_and_sans_state` (`crates/ares-causal-graph/src/hemodynamics.rs`), sia il **Hard Clinical Safety Gate 2** (`AUTO_VENT_LBNP_CHAMBER_0_MMHG` se $\Delta\text{SBP} > 15\text{ mmHg}$ o $\text{HR} > 115\text{ bpm}$).

- **Simulated Microgravity with Physiological Shear Reveals Endothelial Responses ( & Meccanobiologia Vascolare Spaziale CAS 2026)**
  - *Authors*: M. Bisserier et al. (*npj Microgravity*, Nature Partner Journals, Vol. 12, Art. 38, 2026, `DOI: 10.1038/s41526-026-00627-8`); Chinese Academy of Sciences — Shanghai Institute of Nutrition and Health (SINH), *"航天微重力环境下血管结构和功能的影响及其力学生物学最新进展"* (*Advances in Vascular Mechanobiology of Shear Stress, Cyclic Stretch, and Hydrostatic Pressure under Space Microgravity*, *Chinese Bulletin of Life Sciences*, Luglio 2026, `5-2026-0038`)
  - *Mathematical Model (Shear Stress di Parete di Hagen-Poiseuille Dimensionalmente Esatto — Invariante Entry 001)*:
    Poiché la portata volumetrica laminare in sezione circolare equivalente di raggio $r(t) = \sqrt{\text{IJV\_CSA}(t)/\pi}$ è $Q = \frac{1}{2} v_{\max} \pi r^2$, sostituendo in $\tau_w = \frac{4\mu Q}{\pi r^3}$ si ottiene l'equazione dimensionalmente esatta in $\text{dyn/cm}^2$ ($\text{g}\cdot\text{cm}^{-1}\cdot\text{s}^{-2}$):
    $$\tau_w(t) = \frac{2 \cdot \mu \cdot v_{\max}(t)}{r(t)} = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\frac{\pi}{\text{IJV\_CSA}_{\text{cm}^2}(t)}}, \qquad \mu = 0.035\text{ Poise}$$
  - *Related Phases*: Fase 02 (`A2`), Fase 06 (`C2`), Fase 07 (`C3`)
  - *Application in Project*: Implementato in `compute_tau_w_dyn_cm2` (`crates/ares-causal-graph/src/hemodynamics.rs`). Quando $\tau_w(t)$ scende sotto la soglia critica endoteliale ($1.20\text{ dyn/cm}^2$ in stasi severa vs $\ge 2.80\text{ dyn/cm}^2$ nominale), la down-regulation di `eNOS` e la carenza di Irisina/`miR-126-3p` innescano l'esocitosi dei corpi di Weibel-Palade (`vWF` e `P-selectina`), attivando la triade di Virchow nel grafo `ADHG`.

- **Ultrasound-Based Assessment of Jugular Vein Alterations in Response to Microgravity & Autonomous ISS Ultrasound (AMOS)**
  - *Authors*: D. S. Martin et al. (*Ultrasound in Medicine & Biology*, 2026, `DOI: 10.1016/j.umb.2026.01.004`); D. Ebert, A. Sargsyan et al., *"Autonomous Medical Operations System (AMOS) software demonstrations on the ISS"*, *Journal of Telemedicine and Telecare*, 2026 (`DOI: 10.1177/15305627261422798`)
  - *Mathematical Model (Osservatore Bayesiano POCUS a 2 Stadi — Invariante Entry 002)*:
    $$P_{\text{pre}}(\text{Thrombus} \mid \text{Stasis}) = \min\big(0.42 \cdot P(\text{Stasis}), \; 0.45\big) \le 0.45$$
    $$O_{\text{post}} = \frac{\max(P_{\text{pre}}, 0.35)}{1 - \max(P_{\text{pre}}, 0.35)} \cdot \text{LR}_+, \qquad P_{\text{post}}(\text{Thrombus} \mid \text{POCUS}_+) = \operatorname{clamp}\!\left(\frac{O_{\text{post}}}{1 + O_{\text{post}}}, \; 0.92, \; 0.995\right) \quad (\text{LR}_+ = 24.0)$$
  - *Related Phases*: Fase 07 (`C3`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Application in Project*: Disaccoppia rigorosamente il sospetto emodinamico continuo (Stadio 1, limitato a $\le 0.45$ per bloccare l'anticoagulazione empirica e richiedere scansione ecografica `pocus_inspection_required = true`) dalla conferma diagnostica ecografica B-mode (Stadio 2, $\ge 0.92$ con $\text{LR}_+ = 24.0$).

- **Spaceflight Associated Neuro-Ocular Syndrome (SANS) & Translaminar Pressure Gradient Model (`OSD-818`)**
  - *Authors*: Andrew G. Lee, Thomas H. Mader, C. Robert Gibson, William J. Tarver, Michael R. Barratt et al. (*Eye and Brain*, Vol. 12, pp. 1–13, 2020, `DOI: 10.2147/EB.S235548`); Michael R. Barratt, S. L. Pool (Eds.), *Principles of Clinical Medicine for Space Flight* (2nd ed., Springer Nature, 2020, `DOI: 10.1007/978-1-4939-9889-0`); **NASA OSDR Study `OSD-818`** (*Ex vivo translaminar pressure model for SANS*)
  - *Mathematical Model (Indice Composito Translaminare & Congestione Venosa Cefalica)*:
    $$C_{\text{ven}}(t) = \operatorname{clamp}\!\left(\frac{\text{IJV\_CSA}(t) - 38.0}{62.0}, \; 0.0, \; 1.0\right)$$
    $$\text{ONSD}(t) = 5.05 + 1.35 \cdot C_{\text{ven}}(t) \;\; [\text{mm}], \qquad \Delta\text{CT}(t) = 12.0 + 58.0 \cdot C_{\text{ven}}(t) \;\; [\mu\text{m}]$$
    $$\text{SANS\_Risk}(t) = \operatorname{clamp}\!\left(0.45 \cdot \frac{\text{ONSD}(t) - 5.0}{1.4} + 0.35 \cdot \frac{\Delta\text{CT}(t)}{70.0} + 0.20 \cdot C_{\text{ven}}(t), \; 0.05, \; 0.98\right)$$
  - *Related Phases*: Fase 06 (`C2`), Fase 07 (`C3`), Fase 10 (`E1`)
  - *Application in Project*: Accoppia l'ingorgo venoso giugulare cefalico e l'ipercapnia ambientale ($ppCO_2$) alla dilatazione della guaina del nervo ottico (`ONSD`) e all'ispessimento coroideale (`choroidal_delta_um`), attivando il `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION`.

---

## 2. Muscle-Bone Mechanotransduction, Frost-Hargens ODE (`SOST`), Muscle Quality Index (`MQI`), and $0.38g$ Gait Asymmetry Index (`GAI`) (Block C: Phase 05)

- **The Utah Paradigm of Skeletal Physiology (Frost's Mechanostat) & Sclerostin (`SOST`) Mechanotransduction**
  - *Authors*: Harold M. Frost (*"Bone's mechanostat: a 2003 update"*, *The Anatomical Record Part A*, Vol. 275A, No. 2, pp. 1081–1101, 2003, `DOI: 10.1002/ar.a.10119`); Alexander G. Robling, P. J. Niziolek, L. A. Baldridge, K. W. Condon, M. R. Allen, I. Alam, S. M. Warman, J. M. Lowery, J. S. Turner (Indiana University), *"Mechanical stimulation of bone in vivo reduces osteocyte expression of Sost/sclerostin"*, *Journal of Biological Chemistry*, Vol. 283, No. 9, pp. 5866–5875, 2008 (`DOI: 10.1074/jbc.M705092200`); S. Al-Nuaimi, Alan R. Hargens, *"Cellular Mechanotransduction and Sclerostin Dysregulation in Spaceflight-Induced Osteopenia"*, *Bone Research*, 2025 (`DOI: 10.1016/j.boneres.2025.100412`)
  - *Mathematical Model (ODE Regolarizzata di Hill-Frost-Hargens Integrata con Runge-Kutta di 4° Ordine `RK4`)*:
    $$\frac{d[\text{SOST}]}{dt} = k_{\text{prod}} \cdot \frac{1}{1 + \left(\frac{\varepsilon_{\text{mech}}(t)}{\varepsilon_{\text{Frost}}}\right)^{\gamma}} - k_{\text{deg}} \cdot [\text{SOST}](t)$$
    dove $\varepsilon_{\text{mech}}(t) = 11.2 \cdot F_{\text{ARED}}(t)$ [$\mu\varepsilon$], $\varepsilon_{\text{Frost}} = 1000.0\ \mu\varepsilon$, $\gamma = 2.0$, $k_{\text{prod}} = 18.5\text{ pmol/(L}\cdot\text{d)}$, $k_{\text{deg}} = 0.28\text{ d}^{-1}$, integrata tramite passo fisso RK4 (`step_sclerostin_rk4`):
    $$y_{n+1} = y_n + \frac{\Delta t}{6}\big(k_1 + 2k_2 + 2k_3 + k_4\big), \qquad \text{Ca}_{\text{urine}}(t) = 175.0 + 4.2 \cdot \max\big(0.0, \; [\text{SOST}](t) - 22.5\big) \;\; [\text{mg/d}]$$
  - *Related Phases*: Fase 05 (`C1`), Fase 07 (`C3`), Fase 10 (`E1`)
  - *Application in Project*: Implementata in `crates/ares-causal-graph/src/mechanotransduction.rs`. Modella come il deficit di carico resistivo su `ARED` ($< 1000\ \mu\varepsilon$) rimuova l'inibizione meccanica sugli osteociti, facendo salire la Sclerostina plasmatica (`sclerostin_pmol_l > 55 pmol/L`) e causando ipercalciuria secondaria ad alto rischio di nefrolitiasi.

- **Ultrasound Muscle Quality Index (`MQI`), Myosteatosis Echo-Intensity & Martian $0.38g$ Gait Asymmetry Index (`GAI`)**
  - *Authors*: Prof. Francesco Pegreffi et al. (*Physical & Rehabilitation Medicine / Musculoskeletal Ultrasound & Post-Spaceflight Biomechanics*, University of Bologna, 2024–2026); **NASA OSDR Studies `OSD-51` & `OSD-195`** (60-day & 21-day HDBR Soleus/Vastus Lateralis); **ESA `Myotones` (ISS Expedition 75, Sept 2026)** & **`BRACE` 60-Day HDBR**; **NASA NLSP `BRSMFSR` & `SMCCP`**
  - *Mathematical Model (Indice Ecografico `MQI` del Soleo & Asimmetria del Passo `GAI` a $0.38g$)*:
    $$\text{MQI}(t) = \operatorname{clamp}\!\left(1.0 - 0.35 \cdot \frac{E_{\text{echo}}(t) - 48.0}{110.0 - 48.0} - 0.65 \cdot \frac{100.0 - \text{CSA}_{\text{soleus}}(t)}{100.0 - 70.0}, \; 0.15, \; 1.0\right)$$
    $$\text{GAI}_{0.38g}(t) = \operatorname{clamp}\!\Big(3.5 + 16.5 \cdot \big(1.0 - \text{MQI}(t)\big), \; 2.0, \; 28.0\Big) \;\; [\%]$$
  - *Related Phases*: Fase 05 (`C1`), Fase 10 (`E1`), Fase 11 (`E2`)
  - *Application in Project*: Combina l'atrofia miofibrillare del soleo (`soleus_csa_pct`) con l'infiltrazione adiposa ecografica (`echo_intensity_au`) per calcolare `mqi_index`. Quando l'atrofia del soleo spinge $\text{GAI}_{0.38g} > 12.0\%$, scatta il **Hard Clinical Safety Gate 3** (`eva_suit_damping_active = true`), che blocca gli esercizi pliometrici ad alto impatto e aumenta del $+25\%$ lo smorzamento esocheletrico della caviglia della tuta EVA per prevenire la rottura del tendine d'Achille su Marte.

---

## 3. Normalized Quantitative Semantics STL (`NQS-STL`), $O(1)$ Lemire-Donzé Monotonic Wedge, and `TTV` Predictor (Block D: Phases 08–09)

- **Efficient Robust Monitoring for Signal Temporal Logic (STL) & Online Quantitative Semantics**
  - *Authors*: Alexandre Donzé, Thomas Ferrère, Oded Maler (UC Berkeley & Verimag/CNRS)
  - *Venue*: *Computer Aided Verification (CAV 2013)*, Springer LNCS Vol. 8044, pp. 264–279, 2013
  - *DOI*: `10.1007/978-3-642-39799-8_19` (Estensione di A. Donzé, O. Maler, *FORMATS 2010*, `DOI: 10.1007/978-3-642-15297-9_9`)
  - *Related Phases*: Fase 08 (`D1`), Fase 09 (`D2`)
  - *Application in Project*: Semantica formale per il monitoraggio online di specifiche temporali $\Box_{[a,b]}\varphi$ su serie fisiologiche continue in `crates/ares-nqs-stl`.

- **Streaming Maximum-Minimum Filter Using No More than Three Comparisons per Element (Lemire's Monotonic Wedge)**
  - *Authors*: Daniel Lemire (Université du Québec)
  - *Venue*: *Nordic Journal of Computing*, Vol. 13, No. 4, pp. 328–339, 2006
  - *arXiv*: `arXiv:cs/0610046`
  - *Mathematical Model (Invariante del Cuneo Monotono $O(1)$ Ammortizzato — Invariante Entry 007)*:
    Mantiene una coda doppia `VecDeque<(u64, f64)>` strettamente monotona crescente $v(t_{i_1}) \le v(t_{i_2}) \le \dots \le v(t_{i_k})$ con $t - W \le t_{i_1} < \dots < t_{i_k} \le t$, garantendo che il minimo su finestra scorrevole $\hat{\rho}_{\Box, k}(t) = \min_{\tau \in [t-W, t]} \hat{\rho}_k(\tau)$ sia sempre disponibile in testa alla coda (`front()`) in tempo $O(1)$ con $\le 3$ confronti ammortizzati per campione.
  - *Related Phases*: Fase 08 (`D1`)
  - *Application in Project*: Implementato in `LemireMinWedge` (`crates/ares-nqs-stl/src/sliding_window.rs`), azzerando i picchi di latenza $O(W)$ durante lo spostamento a $20\text{ Hz}$ degli slider della *What-If Stress-Test Console*.

- **Normalized Quantitative Semantics (NQS-STL) & Online Causation Monitoring**
  - *Authors*: Noushin Mehdipour, Cristian-Ioan Vasile, Calin Belta (*"Arithmetic-Geometric Mean Robustness for Control from Signal Temporal Logic Specifications"*, *IEEE ACC 2019*, `DOI: 10.23919/acc.2019.8814487`); Konstantinos Mamouras (*"Algebraic Quantitative Semantics for Efficient Online Temporal Monitoring"*, 2021, `DOI: 10.26226/morressier.604907f41a80aac83ca25cf8`); Zhenya Zhang, Jie An, Paolo Arcaini et al. (*"Online Causation Monitoring of Signal Temporal Logic"*, *CAV 2023*, `arXiv:2305.17754v1`)
  - *Mathematical Model (Normalizzazione Adimensionale Contro la Dominanza di Scala — Invariante Entry 004)*:
    $$\hat{\rho}_k(t) = \operatorname{clamp}\!\left(\frac{s_k \cdot \big(x_k(t) - x_{k,\text{crit}}\big)}{\big|x_{k,\text{nom}} - x_{k,\text{crit}}\big|}, \; -2.0, \; +1.0\right), \qquad \hat{\rho}_{\text{global}}(t) = \min_{k \in \{1..5\}} \hat{\rho}_{\Box, k}(t)$$
    dove $s_k \in \{+1, -1\}$ orienta la polarità di sicurezza ($\hat{\rho}_k = +1.0$ nominale pre-volo, $\hat{\rho}_k = 0.0$ soglia critica, $\hat{\rho}_k < 0.0$ violazione clinica).
  - *Related Phases*: Fase 08 (`D1`), Fase 09 (`D2`)
  - *Application in Project*: Implementato in `crates/ares-nqs-stl/src/normalizer.rs`, rendendo commensurabili grandezze con unità fisiche eterogenee ($\tau_w$ in $\text{dyn/cm}^2$, $\text{SOST}$ in $\text{pmol/L}$, $\text{ONSD}$ in $\text{mm}$, dose neutronica `CANS` in $\text{mSv/d}$, $\text{RMSSD}$ in $\text{ms}$).

- **EWMA-OLS 7-Day Time-To-Violation (`TTV`) Estimator & Mission Readiness Index (`MRI`)**
  - *Mathematical Model (`crates/ares-nqs-stl/src/ttv_predictor.rs` & `mri_index.rs`)*:
    $$\text{TTV}_{\text{hours}}(t) = \frac{\hat{\rho}_{\text{global}}(t)}{\big|\dot{\hat{\rho}}_{\text{EWMA-OLS}}(t)\big|}, \qquad \text{CI}_{95\%} = \Big[\text{TTV}(t) - 1.96\,\sigma_{\text{TTV}}(t), \; \text{TTV}(t) + 1.96\,\sigma_{\text{TTV}}(t)\Big]$$
  - *Related Phases*: Fase 09 (`D2`)
  - *Application in Project*: Predice con giorni di anticipo l'istante di attraversamento della soglia clinica ($\hat{\rho} = 0$) fornendo il cono di incertezza $\pm 1.96\sigma$ e sintetizzando il punteggio globale `MRI` ($0\text{–}100$).

---

## 4. Reproducible `BIDMC v1.0.0` Replay, Shannon Spectral Entropy (`SQI`), and Contactless Cardiorespiratory Radar (Block B: Phases 03–04)

- **BIDMC PPG and Respiration Dataset v1.0.0 (PhysioNet)**
  - *Authors*: Marco A. F. Pimentel, Alistair E. W. Johnson, P. H. Charlton, D. Birrenkott, P. J. Watkinson, L. Tarassenko, D. A. Clifton
  - *Venue*: *"Toward a Robust Estimation of Respiratory Rate From Pulse Oximeters"*, *IEEE Transactions on Biomedical Engineering (TBME)*, Vol. 64, No. 8, pp. 1914–1923, 2017 | PhysioNet Repository (`ODC-By-1.0`)
  - *DOI*: `10.1109/TBME.2016.2613124` | `10.13026/C2J01F`
  - *Related Phases*: Fase 01 (`A1`), Fase 03 (`B1`), Issue `#4` (`Entry 006`)
  - *Application in Project*: Sorgente clinica reale (`data/bidmc/bidmc_01..03_Numerics.csv`, `1 Hz`, `481` righe per file da `0` a `480 s`) verificata tramite SHA-256 in `data/bidmc/MANIFEST.json`. Il parser `BidmcReplayer` (`crates/ares-telemetry-ingest/src/bidmc_replayer.rs`) rimuove gli spazi iniziali negli header (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`), preserva i 13 campioni mancanti in `bidmc_01` come `Option<f64>::None` (`null` in JSON) senza mai convertirli in falsi zeri, ed etichetta la provenienza come `RECORDED_TERRESTRIAL_BIDMC_CSV`.

- **Shannon Spectral Entropy Signal Quality Index (`SQI`) & Wearable Missingness Robustness**
  - *Authors*: C. E. Shannon (*Bell System Technical Journal*, 1948); H. Davis-Wilson et al., *"Impact of missing smartwatch data and signal quality on HRV metrics"*, *JMIR*, 2025 (`DOI: 10.2196/53645`); P. Balali et al., *"Wearable cardiovascular monitoring and baseline posture in 17 cosmonauts"*, *npj Microgravity*, 2025 (`DOI: 10.1038/s41526-025-00522-8`)
  - *Mathematical Model (`crates/ares-telemetry-ingest/src/sqi_filter.rs`)*:
    $$\text{SQI}(t) = 1.0 - \frac{-\sum_{k=1}^{N} p_k \ln(p_k)}{\ln(N)} \in [0.0, 1.0]$$
    Se $\text{SQI}(t) < 0.70$, il filtro applica *Zero-Order Hold* (ZOH) sull'ultimo campione valido, sopprimendo falsi allarmi da artefatti da movimento durante gli esercizi su `ARED`.
  - *Related Phases*: Fase 04 (`B2`)

---

## 5. Biomedical Knowledge Graph Architectures, 3D Deontic Scene Graphs (`Clio` / `DGSG-Mind`), and `ARES-HyperGraph` (Knowledge Graph Architecture Study)

- **Clio: Real-Time Task-Driven Open-Set 3D Scene Graphs & Hierarchical Super-Node Compaction (`R4DSG`)**
  - *Authors*: Dominic Maggio, Yun Chang, Nathan Hughes, Matthew Trang, Luca Carlone (MIT SPARK Lab)
  - *Venue*: *IEEE Robotics and Automation Letters (RA-L)*, Vol. 9, No. 10, pp. 8921–8928, 2024 | *DOI*: `10.1109/LRA.2024.3451395` | *arXiv*: `arXiv:2404.13696` (Esteso in *FOUND-IT*, `arXiv:2605.25371` & *R4DSG*, `arXiv:2608.11017`, 2026); B. P. Welford (*Technometrics*, Vol. 4, No. 3, pp. 419–420, 1962)
  - *Mathematical Model (Information Bottleneck, Decadimento Esponenziale & Super-Nodi di Welford)*:
    $$\min_{p(\tilde{x}|x)} \; I(\tilde{X}; X) - \beta \, I(\tilde{X}; Y), \qquad w_{ij}(t) = w_0 \cdot \exp(-\lambda_r \cdot \Delta t), \qquad P(z_b \mid z_a, c) = \frac{n_{ab}^{(c)} + \alpha}{\sum_{b'} n_{ab'}^{(c)} + K\alpha}$$
  - *Application in Project*: Fondamento di `graph_compactor.rs` (`spatiotemporal-mcp-engine-backup`) e della compattazione longitudinale a 1000 giorni in **Layer 1 & Layer 2 di `ARES-HyperGraph`** (`docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md`).

- **DGSG-Mind: Open-Vocabulary Deontic Reasoning on 3D Dynamic Scene Graphs & Brick Schema**
  - *Authors*: Luzhou Ge, Xiangyu Zhu, Jinyan Liu, Xuesong Li (`arXiv:2605.29879v3`, 2026, `DOI: 10.48550/arXiv.2605.29879`); Bharathan Balaji et al. (*"Brick: Metadata schema for portable smart building applications"*, *Applied Energy*, Vol. 226, pp. 1273–1292, 2018, `DOI: 10.1016/j.apenergy.2018.02.091`)
  - *Application in Project*: Fondamento di `OntologyDescriptor` (`16-byte #[repr(C)]`), `ZoneDeonticPolicy` e `OntologyReasoner` (`spatiotemporal-mcp-engine-backup/crates/spatiotemporal-db/src/ontology_reasoner.rs`), traslati in **Layer 2 (`ARES-SpatialGraph`)** e **Layer 3 (`ARES-BioKG` `BiomedicalEvidenceDescriptor`)** per governare i compartimenti dell'habitat spaziale (`Sleep Quarters`, `ARED Bay`, `LBNP Chamber`, `MedOps Bay`, `Storm Shelter`, `EVA Airlock`).

- **SPOKE & NASA OSDR/GeneLab Biomedical Knowledge Graph (`Proto-OKN`), `BioCypher`, `Biolink Model` & Harvard `PrimeKG` / `PrimeKG-Plus`**
  - *Authors*: Charlotte A. Nelson, Ana Uriarte Acuna, Amber M. Paul, R. T. Scott, Sergio E. Baranzini, Sylvain V. Costes et al. (UCSF & NASA Ames Research Center, *"Knowledge Network Embedding of Transcriptomic Data from Spaceflown Mice Uncovers Signs and Symptoms Associated with Terrestrial Diseases"*, *Life*, Vol. 11, No. 1, Art. 42, 2021, `DOI: 10.3390/life11010042` & *NSF Proto-OKN NASA OSDR-SPOKE Data Fabric*, 2024–2026, `https://github.com/BaranziniLab/SPOKE`, `https://github.com/nasa/GeneLab_Data_Processing`); John H. Morris, Karthik Soman, Rabia E. Akbas, Charlotte A. Nelson, Sergio E. Baranzini et al. (*"The scalable precision medicine open knowledge engine (SPOKE): a massive knowledge graph of biomedical information"*, *Bioinformatics*, Vol. 39, No. 2, btad080, 2023, `DOI: 10.1093/bioinformatics/btad080`); Sebastian Lobentanzer, Patrick Aloy, Jan Baumbach, Baldo Oliva, Julio Saez-Rodriguez et al. (*"Democratizing knowledge representation with BioCypher"*, *Nature Biotechnology*, Vol. 41, pp. 1056–1059, 2023, `DOI: 10.1038/s41587-023-01848-y`, `arXiv:2212.13543v3`, `https://github.com/biocypher/biocypher`); Johann Dreo, Claire Laudy, Sebastian Lobentanzer et al. (*"Reproducible Mapping of Tabular Data into Semantic Knowledge Graphs with OntoWeaver and BioCypher"*, *IEEE FUSION 2024*, `DOI: 10.23919/fusion59988.2024.10706497`); Deepak R. Unni, Sierra A. T. Moxon, Michael Bada, Melissa Haendel, Chris J. Mungall et al. (*"Biolink Model: A Universal Schema for Knowledge Graphs in Clinical, Biomedical, and Translational Science"*, *Clinical and Translational Science*, Vol. 15, No. 8, pp. 1848–1855, 2022, `DOI: 10.1111/cts.13302`, `arXiv:2203.13906v1`, `https://github.com/biolink/biolink-model`); Payal Chandak, Kexin Huang, Marinka Zitnik (Harvard Medical School, *"Building a knowledge graph to enable precision medicine — PrimeKG"*, *Scientific Data (Nature)*, Vol. 10, Art. 67, 2023, `DOI: 10.1038/s41597-023-01960-3`, `https://github.com/mims-harvard/PrimeKG` & *PrimeKG-Plus*, 2025–2026)
  - *Application in Project*: Fondamento scientifico di **Layer 3 (`ARES-BioKG`)** in `docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md` e del **Grafo Unificato Multi-Dataset (`ARES-DatasetGraph`, Fase 20 / Blocco I3)** in `docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md`, che indicizza in RAM (`~8.4 MB` per `~14,600` nodi e `~112,000` archi tipizzati Biolink, con esportazione JSON compatibile `graphify` in `data/knowledge_graph/ares_dataset_graph.json` e puntatori colonnari `slice://` verso Apache Parquet) tutti i 24 dataset multi-agenzia e le clausole `NASA-STD-3001` con provenienza $O(1)$.

- **BioHarness: Substrate-Aware Evidence Assembly & Neuro-Symbolic Clinical Decision Support Graphs (2026)**
  - *Authors*: Meng Xiao, Chuan Qin, Jinmiao Chen et al. (*"BioHarness: Substrate-Aware Evidence Assembly for Biomedical Question Answering across Literature, Knowledge Bases, and Biological Atlases"*, `arXiv:2606.19396v1`, Giugno 2026); Mete Ucdal, Evren Ekingen, Ali Niyazi Kurtcebe (*"A neuro-symbolic clinical decision support system... using structured derivation traces, adaptive compute, and knowledge graph constraint checking"*, *BMC Anesthesiology*, 2026, `DOI: 10.1186/s12871-026-04316-7`); Liuyi Xu et al. (*"CORE-Acu: Structured Reasoning Traces and Knowledge Graph Safety Verification for Clinical Decision Support"*, `arXiv:2603.08321v1`, Marzo 2026); David Tom Foss (*"Sovereign Causal Graph: A Neuro-Symbolic Architecture for Air-Gapped Knowledge Discovery"*, *SSRN*, 2026, `DOI: 10.2139/ssrn.6060955`)
  - *Application in Project*: Giustifica la separazione formale dei substrati di evidenza (`ProvenanceSubstrate`: `RecordedTerrestrialBidmcCsv` vs `DerivedBiophysicalModel` vs `MechanisticAgencyPrior` vs `SimulatedScenarioInput`), le tracce di derivazione causale strutturate e il gate di verifica pre-esecuzione `ClinicalAnswerabilityGate`.

---

## 6. Progressive DAG Playbook Crystallization (`Type 1`), `FastMCP` Routing, and `Timestral` Quantile Forecasting (Blocks E & G: Phases 10–14 & Timestral Study)

- **Progressive Crystallization: Turning Agent Exploration into Deterministic, Lower-Cost Workflows in Production**
  - *Authors*: Arun Malik (Microsoft Azure Networking)
  - *Venue*: `arXiv:2607.07052v1` [cs.SE], Luglio 2026 | *DOI*: `10.48550/arXiv.2607.07052`
  - *Related Phases*: Fase 10 (`E1`), Fase 11 (`E2`), Fase 14 (`G2`)
  - *Application in Project*: Fondamento teorico per compilare i 5 protocolli medici di emergenza (`PLAYBOOK_01`–`PLAYBOOK_05`) e i **3 Hard Clinical Safety Gates** come **DAG deterministici Type-1 in puro Rust** (`crates/ares-medops-playbooks`, latenza $< 20\,\mu\text{s}$, zero allucinazioni e zero dipendenza dal ragionamento stocastico LLM nel loop di sicurezza).

- **ProgRouter: Online Progress-Guided Orchestration for Multi-Agent LLM Workflows & IoT-MCP Context-Mode**
  - *Authors*: Songyuan Li, Ahmed M. Abdelmoniem, Shiqiang Wang (*Findings of ACL: EMNLP 2026*, `arXiv:2608.25992v2`, `DOI: 10.48550/arXiv.2608.25992`); Paolo Bellagente, Matteo Ferrari, Marco Pasetti, Paolo Ferrari (*"IoT-MCP: Enabling Large Language Models to Interact with the Physical World through the Model Context Protocol"*, `arXiv:2502.16467`, 2025); A. A. R. Taresh, N. A. K. Zghair (*"Semantic-Driven Context Pruning for Multi-Turn AI"*, *Information*, 2026, `DOI: 10.3390/info17100990`)
  - *Related Phases*: Fase 13 (`G1`), Fase 14 (`G2`)
  - *Application in Project*: Architettura del server `FastMCP JSON-RPC 2.0` su `stdio` (`crates/ares-server-cli/src/mcp_stdio.rs`) con compressione semantica Context-Mode rigorosamente limitata a $\le 600\text{ byte}$ ($< 150\text{ token}$) per risposta e isolamento totale dal bus WebSocket `axum` a $20\text{ Hz}$ (`127.0.0.1:8080`).

- **Timestral: Patch-Based Dual-Axis Attention Foundation Model for Multivariate Probabilistic Forecasting & Conformal Abstention**
  - *Authors*: Mistral AI (*"Timestral: Patch-Based Dual-Axis Attention Foundation Model for Multivariate Probabilistic Forecasting"*, Ottobre 2026); D. Nie, Y. Wu, C.-C. J. Kuo (*"A Statistical Approach for Modeling Irregular Multivariate Time Series with Missing Observations"*, 2025, `DOI: 10.21203/rs.3.rs-6198987/v1`); J. Du, S. Jiang (*"PCFNet: Period-channel fusion network for multivariate time series forecasting"*, *Information Fusion*, 2026, `DOI: 10.1016/j.inffus.2026.104281`); Anastasios N. Angelopoulos et al. (*"Conformal Risk Control"*, *ICLR 2024*, `arXiv:2208.02814`)
  - *Mathematical Model (Decoupled Horizon Forecasting Monotone Quantiles & Conformal Abstention Gate)*:
    $$q_{0.50}(t + \Delta t) = \mu_{\theta}(\mathbf{X}_{t-L:t}), \qquad q_{0.05}(t + \Delta t) = q_{0.50} - \operatorname{softplus}(\delta_{\theta}^{\text{low}}), \qquad q_{0.95}(t + \Delta t) = q_{0.50} + \operatorname{softplus}(\delta_{\theta}^{\text{high}})$$
    garantendo strutturalmente $q_{0.05}(t+\Delta t) \le q_{0.50}(t+\Delta t) \le q_{0.95}(t+\Delta t)$ senza incroci quantilici.
  - *Application in Project*: Documentato in `docs/architecture/TIMESTRAL_INTEGRATION_STUDY.md` per l'integrazione ibrida Physics-Informed ODE + Timestral Dual-Axis Attention sui trend cardiorespiratori `BIDMC` e sui coni di incertezza `NQS-STL` $\hat{\rho}_k(t+\Delta t)$.

---

## 7. Technical Standards `NASA-STD-3001`, Cryptographic Security, Crew Privacy, and the 24 Official Datasets (Block A & Block F: Phases 01, 02, 12)

- **NASA-STD-3001 Volume 1 Rev C & Volume 2 Rev F (Luglio 2026) e NASA OCHMO `MTB-007` (Gennaio 2026)**
  - *Organizzazione*: National Aeronautics and Space Administration (NASA Office of the Chief Health and Medical Officer — Dr. James D. Polk)
  - *Link Ufficiali*:
    - `https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1` (`[V1 3001]`–`[V1 4001]`, Ch. 7 Crew Medical Privacy)
    - `https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2` (`[V2 6001]`–`[V2 10001]`, Habitability, $ppCO_2$, Acoustics, Medical UI)
    - `NASA OCHMO Technical Brief MTB-007` (*Venous Thrombosis in Spaceflight*, Gennaio 2026)
  - *Related Phases*: Fase 02 (`A2`), Fase 11 (`E2`), Fase 12 (`F1`)
  - *Application in Project*: Definisce tutte le costanti normative in `crates/ares-core-types/src/constants.rs` e le 3 viste di riservatezza medica per ruolo (`AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon`) in `crates/ares-security-privacy/src/privacy_views.rs`.

- **FIPS 180-4 (`SHA-256` Hash Chain), IETF RFC 8439 (`ChaCha20-Poly1305` AEAD), `ZeroizeOnDrop` & NIST SP 800-161r1 (Air-Gap)**
  - *Standard*: NIST FIPS PUB 180-4 (*Secure Hash Standard*); Y. Nir, A. Langley, *IETF RFC 8439: ChaCha20 and Poly1305 for IETF Protocols* (2018); NIST SP 800-161 Rev. 1 (*Cybersecurity Supply Chain Risk Management & Air-Gapped Enclaves*, `DOI: 10.6028/NIST.SP.800-161r1`)
  - *Mathematical Model (Catena di Audit Non Ripudiabile SHA-256)*:
    $$H_n = \operatorname{SHA-256}\big(H_{n-1} \mathbin{\Vert} t_n \mathbin{\Vert} \text{actor\_role}_n \mathbin{\Vert} \text{action}_n \mathbin{\Vert} \text{payload\_hash}_n\big)$$
  - *Related Phases*: Fase 12 (`F1`)
  - *Application in Project*: Implementato in `crates/ares-security-privacy` (`audit_chain.rs`, `privacy_views.rs`, `sanitizer.rs`): garantisce l'integrità matematica degli override clinici, la cifratura autenticata `ChaCha20-Poly1305` con azzeramento automatico della chiave in RAM (`EphemeralDsnKey` con `ZeroizeOnDrop`) per i bundle Store-and-Forward verso il Deep Space Network (DSN), e lo scudo XML `<untrusted_telemetry_observation>` contro attacchi di Indirect Prompt Injection sul canale MCP.

- **Space Omics and Medical Atlas (`SOMA` Nature 2024), NASA Twins Study & Multi-Agency Spaceflight Datasets (24 Fonti)**
  - *Authors*: Eliah G. Overbey, JangKeun Kim, Braden T. Tierney, Christopher E. Mason et al., *"The Space Omics and Medical Atlas (SOMA) across orbits, disciplines, and technologies"*, *Nature*, Vol. 632, pp. 1145–1158, 2024 (`DOI: 10.1038/s41586-024-07382-x` / `10.1038/s41586-024-07639-y`); Francine E. Garrett-Bakelman et al., *"The NASA Twins Study"*, *Science*, Vol. 364, eaau8650, 2019 (`DOI: 10.1126/science.aau8650`); Emmanuel Urquieta et al., *"The EXPAND Database"*, *Aerosp. Med. Hum. Perform.*, Vol. 93, No. 8, pp. 643–649, 2022 (`DOI: 10.3357/AMHP.6074.2022`); B. Kruse, E. Urquieta et al., *"Human Digital Twin Platforms for Predictive Space Medicine"*, *Front. Bioeng. Biotechnol.*, Vol. 13, 1421092, 2025 (`DOI: 10.3389/fbioe.2025.1421092`); Marco De Martino et al., *Front. Netw. Physiol.*, 2026 (`DOI: 10.3389/fnetp.2026.1867627`)
  - *Dataset Ufficiali Integrati*:
    1. **NASA OSDR Federated (`cgene,alsda,esa`):** `OSD-51`, `OSD-195`, `OSD-570`, `OSD-571`, `OSD-818`.
    2. **NASA NLSP & Open Data Portal:** `NASA-0000100`, `FAP`, `SMCCP`, `BRSMFSR`, `BRSMPT`, *Neuroendocrine Tilt*.
    3. **NASA LSAH & HRP:** Longitudinal DXA/FRAX epidemiology, `ARCHeR`, `Venous Haemostasis`, `Zero T2`, `CIPHER`, `Thigh Cuff`, `B-Complex`.
    4. **CSA (Canadian Space Agency):** `CANS` (Feb 2026 Active Neutron Spectrometer), `Bio-Monitor`, `Vascular Aging`, `MARROW`.
    5. **ESA, DLR & JAXA:** ESA `Myotones` (Sept 2026, Expedition 75), `BRACE` 60d HDBR, DLR `:envihab` `AGBRESA` & `SANS-CM`, NASA-JAXA `Bisphosphonates`.
    6. **NASA Analogs, TRISH & PhysioNet/UCI:** `CHAPEA` (378d Mars), `HERA`, TRISH `EXPAND` & `HERMES`, PhysioNet `BIDMC v1.0.0`, `CEBS`, `Fantasia`, UCI `PPG-DaLiA` (`DOI: 10.24432/C53890`).

---

## 8. Open-Source Reference Repositories, Ontologies & NASA Portals Registry (Block H & Block I: Phases 15–20)

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

---

## 9. Pure-Rust Operating Systems, Framekernels, Zero-Copy IPC & Native Mission Shells (Block J: Phases 21–24 — Repositories & Scientific Literature)

Studio architetturale completo documentato in [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md) e piani implementativi dettagliati in [`docs/plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md`](plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md), [`docs/plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md`](plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md), [`docs/plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md`](plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md) e [`docs/plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) (architettura a 3 Tier `ARES-MedOS`, allineamento `NASA-STD-3001 Vol. 2` `[V2 10001]`–`[V2 10152]`, partizionamento `ARINC 653` e `NASA cFE/cFS` / `JPL F Prime`).

### 9.1 Peer-Reviewed Literature on Rust Kernels, Aerospace Partitioning, and Operating Systems

- **Asterinas Framekernel (Linux-ABI Safe Rust OS Architecture):**
  - *Authors*: Yuke Peng, Yifan Shen, Hongliang Tian, Shoumeng Yan et al.
  - *Venue*: *"Asterinas: A Linux ABI-Compatible, Rust-Based Framekernel OS with a Small and Sound TCB"*, *USENIX Annual Technical Conference (ATC 2025)* (`arXiv:2506.03876`) e *"Framekernel: A Safe and Fast Kernel Architecture via Rust"*, *ACM SIGOPS Asia-Pacific Workshop on Systems (APsys 2024)* (`DOI: 10.1145/3678015.3680492`); studio eBPF correlato Chen & Lee (*ACM 2026*, `DOI: 10.1145/3837779.3838157`).
  - *Related Phases*: [`Fase 24 (J4)`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md)
  - *Application in Project*: Target di riferimento Tier B (`deploy/medos/asterinas_framekernel_kiosk.toml`) per eseguire il binario Linux ELF `ares-server-cli` (`> 210` syscall Linux, latenza LMbench `1.08x`) isolando il codice `unsafe` in `ostd` al `~14.0%` del codebase.

- **Theseus OS (Intralingual Rust OS & Live Cell Swapping):**
  - *Authors*: Kevin Boos, Namitha Liyanage, Ramla Ijaz, Lin Zhong (Rice University & Yale University)
  - *Venue*: *"Theseus: an Experiment in Operating System Structure and State Management"*, *USENIX OSDI 2020*, pp. 1–19 (`ISBN: 978-1-939133-19-9`, `https://www.usenix.org/conference/osdi20/presentation/boos`); Boos et al., *PLOS 2017* (`DOI: 10.1145/3144555.3144560`) & *EuroSys 2017* (`DOI: 10.1145/3064176.3064205`).
  - *Related Phases*: [`Fase 24 (J4)`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md)
  - *Application in Project*: Modello concettuale di *live cell swapping* a compile-time per il ripristino a caldo di moduli corrotti da *Single-Event Upsets* (SEU) da radiazione cosmica senza riavvio completo.

- **Tock OS & Atmosphere (Embedded Isolation & Formally Verified Microkernels):**
  - *Authors*: Amit Levy, Bradford Campbell, Branden Ghena, Daniel B. Giffin, Pat Pannuto, Prabal Dutta, Philip Levis (Stanford, UC Berkeley, UMich), *"Multiprogramming a 64kB Computer Safely and Efficiently"*, *ACM SOSP 2017* (`DOI: 10.1145/3132747.3132786`); Schuermann et al., *"Tock: From Research to Securing 10 Million Computers"* (`arXiv:2603.22585`, 2026); Chen et al., *"Atmosphere: Formally Verified Microkernel in Rust with Verus"*, *ACM SOSP 2025* (`DOI: 10.1145/3731569.3764821`).
  - *Related Phases*: [`Fase 24 (J4)`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md)
  - *Application in Project*: Riferimenti per isolamento MPU su microcontroller wearable Tier C (`~8.4 KB` SRAM) e verifica formale SMT del TCB.

- **NASA `cFE/cFS`, `JPL F Prime`, `ARINC 653` & `NASA-STD-3001 Vol. 2` Human-System Latency:**
  - *Fonti*: NASA Core Flight System (`https://github.com/nasa/cFS`), JPL F Prime (`https://github.com/nasa/fprime`), V. Cheptsov & A. Khoroshilov (*ISP RAS 2018*, `DOI: 10.1109/ispras.2018.00009` & *2023*, `DOI: 10.1109/ispras60948.2023.10508165`), `NASA-STD-3001 Vol. 2 Rev F` (`[V2 10001]` NMSUS Usability, `[V2 10002]` Design Error, `[V2 10005]` Standardization, `[V2 10022]` `<= 100 ms` control feedback, `[V2 10023]`/`[V2 10024]` electronic procedures, `[V2 10027]` inadvertent operation interlocks, `[V2 10152]` `<= 50 ms` dynamic display latency).
  - *Related Phases*: [`Fase 21 (J1)`](plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md), [`Fase 22 (J2)`](plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md), [`Fase 23 (J3)`](plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md)

### 9.2 Registry of Pure-Rust OS Repositories, Compositors, UI & Zero-Copy IPC

| Repository / Project | Primary URL & License | Category | Mapped Phase Plan & Role in 3-Tier `ARES-MedOS` Architecture |
| :--- | :--- | :--- | :--- |
| **`asterinas/asterinas`** | `https://github.com/asterinas/asterinas` (`MPL-2.0`) | Framekernel OS | [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier B Host Kernel:** `14.0%` TCB in `ostd`, `#![deny(unsafe_code)]` services, executes unmodified `ares-server-cli` ELF binary. |
| **`redox-os/redox`** | `https://gitlab.redox-os.org/redox-os/redox` / `https://github.com/redox-os/redox` (`MIT`) | Microkernel OS | [`phase_21_J1`](plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md) & [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier B Reference & Kiosk:** Plan-9 `scheme:` capability namespaces mirroring MCP `slice://` & `handle://` handles. |
| **`theseus-os/Theseus`** | `https://github.com/theseus-os/Theseus` (`MIT`) | Intralingual OS | [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **SEU Recovery Model:** Live crate-cell swapping without rebooting (*OSDI 2020*). |
| **`oxidecomputer/hubris`** | `https://github.com/oxidecomputer/hubris` (`MPL-2.0`) | Embedded Microkernel | [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier C Flight Sensor Hub:** `~2,000` LOC MPU-isolated kernel + `Idol` IPC + user-space `Supervisor` driver restart (`WearableSensorPacket`). |
| **`tock/tock`** | `https://github.com/tock/tock` (`Apache-2.0/MIT`) | Embedded Microkernel | [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier C Multi-Tenant Wearable:** Rust kernel capsules + isolated user apps (`~8.4 KB` SRAM, *SOSP 2017*). |
| **`embassy-rs/embassy`** | `https://github.com/embassy-rs/embassy` (`Apache-2.0/MIT`) | Embedded Async RTOS | [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier C Wearable Biosensor Firmware:** `no_std` async DMA HALs + `trouble` BLE for `WearableSensorPacket` streaming. |
| **`rtic-rs/rtic`** | `https://github.com/rtic-rs/rtic` (`Apache-2.0/MIT`) | Hard-RT Embedded | [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier C Deterministic ADC:** Hardware NVIC SRP concurrency (`< 512 B` RAM minimal, `250–500 Hz` sampling). |
| **`tauri-apps/tauri`** | `https://github.com/tauri-apps/tauri` (`Apache-2.0/MIT`) | Native Desktop OS Shell | [`phase_22_J2`](plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md) & [`phase_23_J3`](plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md) — **Tier A Primary Shell (`crates/ares-desktop-os`):** `~30–50 MB` RAM (`WKWebView` Metal / `WebKitGTK` / `WebView2`) + `< 0.05 ms` binary `Channel<ArrayBuffer>`. |
| **`pop-os/cosmic-epoch`** / **`cosmic-comp`** | `https://github.com/pop-os/cosmic-epoch` & `https://github.com/pop-os/cosmic-comp` (`GPL-3.0`) | Wayland OS Compositor | [`phase_22_J2`](plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md) & [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier B Habitat Medical Kiosk:** Pure-Rust Wayland compositor (`smithay/smithay`) + `libcosmic` single-workspace kiosk shell (`cosmic_wayland_kiosk.ron`). |
| **`iced-rs/iced`** | `https://github.com/iced-rs/iced` (`MIT`) | Pure-Rust GPU GUI | [`phase_22_J2`](plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md) & [`phase_24_J4`](plans/phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md) — **Tier B Native Applet Toolkit:** Elm-architecture GUI accelerated by `wgpu` (Metal/Vulkan) powering `libcosmic`. |
| **`rerun-io/rerun`** & **`emilk/egui`** | `https://github.com/rerun-io/rerun` & `https://github.com/emilk/egui` (`Apache-2.0/MIT`) | `wgpu` 120 FPS Telemetry UI | [`phase_23_J3`](plans/phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md) — **Tier A.2 Waveform Companion:** Zero-GC `120 FPS` `wgpu` plotting & Apache Arrow (`re_chunk`) multimodal time-series scrubbing. |
| **`slint-ui/slint`** & **`DioxusLabs/dioxus`** | `https://github.com/slint-ui/slint` & `https://github.com/DioxusLabs/dioxus` | Native Rust UI Toolkits | [`phase_22_J2`](plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md) — Evaluated alternatives (`Slint` retained `.slint` for embedded displays; `Dioxus` VDOM + `wgpu`/WebView). |
| **`eclipse-iceoryx/iceoryx2`** | `https://github.com/eclipse-iceoryx/iceoryx2` (`Apache-2.0/MIT`) | Zero-Copy Shared Memory IPC | [`phase_21_J1`](plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md) — **Tier B Partitioned Bus:** Daemonless lock-free `POSIX shm` (`< 100 ns`, `ZeroCopySend`, `BinaryTelemetryFrame` 128 B). |
| **`eclipse-zenoh/zenoh`** | `https://github.com/eclipse-zenoh/zenoh` (`EPL-2.0/Apache-2.0`) | Distributed Space/Edge Middleware | [`phase_21_J1`](plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md) — **Tier B/C DSN Bridge:** Sub-microsecond local `shm` pub/sub + intermittent Mars-to-Earth Store-and-Forward synchronization. |

---

## 10. Software Assurance, Property-Based Testing & Chaos Verification References (Block K: Phases 25–28)

Architettura di verifica completa documentata in [`docs/plans/BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md`](plans/BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md) e piani implementativi dettagliati in [`phase_25_K1`](plans/phase_25_K1_property_based_numerical_ode_stl_verification.md), [`phase_26_K2`](plans/phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md), [`phase_27_K3`](plans/phase_27_K3_full_stack_contract_cockpit_ipc_mcp_e2e.md) e [`phase_28_K4`](plans/phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md).

- **QuickCheck & Shrinking Property-Based Testing (`proptest`):**
  - *Authors*: Koen Claessen, John Hughes (Chalmers University of Technology)
  - *Venue*: *"QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs"*, *Proceedings of the 5th ACM SIGPLAN International Conference on Functional Programming (ICFP 2000)*, pp. 268–279 (`DOI: 10.1145/351240.351266`); implementazione Rust `proptest-rs/proptest` (`https://github.com/proptest-rs/proptest`, `MIT OR Apache-2.0`).
  - *Related Phases*: [`Fase 25 (K1)`](plans/phase_25_K1_property_based_numerical_ode_stl_verification.md)
  - *Application in Project*: Generazione stocastica con *structural shrinking* deterministico (`PROPTEST_RNG_SEED`) per falsificare il non-crossing algebrico su `10,000` traiettorie avverse di `QuantileHead`, la parita differenziale $O(1)$ di `LemireMinWedge` vs oracolo $O(W)$, e i layout little-endian `16 B` / `32 B` / `128 B`.

- **Richardson Extrapolation & Runge-Kutta Convergence Theory:**
  - *Authors*: Lewis Fry Richardson, *"The Approximate Arithmetical Solution by Finite Differences of Physical Problems Involving Differential Equations"*, *Philosophical Transactions of the Royal Society of London A*, Vol. 210, pp. 307–357, 1911; John C. Butcher, *Numerical Methods for Ordinary Differential Equations* (3rd ed., Wiley, 2016, `ISBN: 978-1-119-12150-3`).
  - *Related Phases*: [`Fase 25 (K1)`](plans/phase_25_K1_property_based_numerical_ode_stl_verification.md)
  - *Application in Project*: Verifica mediante *step-halving* ($h \to h/2$, rapporto di errore $E(h)/E(h/2) \ge 14.5$ attorno al valore teorico $2^4 = 16$) dell'accuratezza di quarto ordine di `step_sclerostin_rk4` contro la soluzione analitica esatta di Frost-Hargens.

- **Chaos Engineering & Fault Injection for Resilient Distributed Systems:**
  - *Authors*: Ali Basiri, Niosha Behnam, Ruud de Rooij, Lorin Hochstein, Luke Kosewski, Justin Reynolds, Casey Rosenthal (Netflix)
  - *Venue*: *"Chaos Engineering"*, *IEEE Software*, Vol. 33, No. 3, pp. 35–41, 2016 (`DOI: 10.1109/MS.2016.60`); Angelopoulos, Candès, Tibshirani, *"Conformal PID Control for Time Series Prediction"*, *NeurIPS 2023* (`arXiv:2307.16895`).
  - *Related Phases*: [`Fase 26 (K2)`](plans/phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md)
  - *Application in Project*: Verifica di *steady-state hypothesis* sotto iniezione di dropout multi-canale (`NaN`, `Inf`, `None`, `BEAT_INTERVALS_NOT_AVAILABLE`), deriva di copertura `ConformalAbstentionGate`, e manomissione AEAD `ChaCha20-Poly1305` / catena `SHA-256`.

- **Cyclic Redundancy Code (CRC) Hamming Distance & Castagnoli `CRC-32C` (`RFC 3720`):**
  - *Authors*: Philip Koopman, Tridib Chakravarty, *"Cyclic Redundancy Code (CRC) Polynomial Selection for Embedded Networks"*, *IEEE/IFIP International Conference on Dependable Systems and Networks (DSN 2004)* (`DOI: 10.1109/DSN.2004.1311885`); *IETF RFC 3720* (`CRC-32C` polinomio Castagnoli `0x1EDC6F41` / riflesso `0x82F63B78`).
  - *Related Phases*: [`Fase 25 (K1)`](plans/phase_25_K1_property_based_numerical_ode_stl_verification.md), [`Fase 26 (K2)`](plans/phase_26_K2_clinical_chaos_sensor_dropout_seu_fault_injection.md), [`Fase 27 (K3)`](plans/phase_27_K3_full_stack_contract_cockpit_ipc_mcp_e2e.md)
  - *Application in Project*: Garanzia matematica di distanza di Hamming $d_{\min} \ge 3$ per la rilevazione al `100%` di qualsiasi singolo bit-flip SEU su `BiomedicalEvidenceDescriptor` (`16 B`, `CRC-8`), `WearableSensorPacket` (`32 B`, `CRC-16-CCITT`) e `BinaryTelemetryFrame` (`128 B`, `CRC-32C`).

- **NASA Software Assurance, Safety & Model VVUQ Standards (`NASA-STD-8739.8B`, `NASA-STD-8719.13C`, `NASA-STD-7009B`):**
  - *Organizzazione*: National Aeronautics and Space Administration — *NASA-STD-8739.8B* (*Software Assurance and Software Safety Standard*, `https://standards.nasa.gov/standard/NASA/NASA-STD-8739.8`), *NASA-STD-8719.13C* (*Software Safety Standard*), *NASA-STD-7009B* (*Standard for Models and Simulations*, 2024), affiancati da Gil Tene, *"How NOT to Measure Latency"* (`HdrHistogram/HdrHistogram_rust`, 2015).
  - *Related Phases*: [`Fase 28 (K4)`](plans/phase_28_K4_nasa_std_3001_compliance_latency_memory_benchmark.md)
  - *Application in Project*: Matrice di tracciabilita normativa eseguibile `[V1 3001]`–`[V2 10152]` + `OCHMO MTB-007` e metodologia statistica `p50`/`p99`/`p99.9` dopo warm-up L1/L2 senza *coordinated omission*.

---

## 11. Block L: Gap Closure, Level-1 `GATHER` DSP, Native OS Packaging, Edge Copilot, Clinical Calibration (`CQR`) & NASA Space Apps Submission (Phases 29–34)

Architettura master di riferimento: [`BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md`](plans/BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md), coordinata con [`phase_29_L1`](plans/phase_29_L1_cockpit_live_bindings_3d_cones.md), [`phase_30_L2`](plans/phase_30_L2_tauri_native_window_iceoryx2_ipc.md), [`phase_31_L3`](plans/phase_31_L3_gather_radar_vocal_waveform_dsp.md), [`phase_32_L4`](plans/phase_32_L4_edge_llm_voice_copilot_safetensors.md), [`phase_33_L5`](plans/phase_33_L5_clinical_calibration_24dataset_parquet.md) e [`phase_34_L6`](plans/phase_34_L6_nasa_submission_pitch_slides_pdf.md).

### 11.1 Cockpit Live Bindings, `UBERON:` Ontology, Conformal PID & Native `Tauri v2` Shell (Phases 29–30 / `L1`–`L2`)

- **Uberon Multi-Species Anatomy Ontology (`UBERON:`):**
  - *Authors*: Christopher J. Mungall, Carlo Torniai, Georgios V. Gkoutos, Suzanna E. Lewis, Melissa A. Haendel, *"Uberon, an integrative multi-species anatomy ontology"*, *Genome Biology*, Vol. 13, No. 1, R5, 2012 (`DOI: 10.1186/gb-2012-13-1-r5`).
  - *Related Phases*: [`Fase 29 (L1)`](plans/phase_29_L1_cockpit_live_bindings_3d_cones.md), [`Fase 18 (I1)`](plans/phase_18_I1_welford_longitudinal_compaction_spatial_deontic.md)
  - *Application in Project*: Grounding semantico canonico delle 5 regioni anatomiche 3D (`UBERON:0000970`, `UBERON:0001586`, `UBERON:0000948`, `UBERON:0001389`, `UBERON:0000955`) in `uberonSpatialMapping.ts`, `BodyHeatmap.tsx` e `AnatomicalLayers.tsx`, inclusa la distinzione visiva `observed=false` per Issue `#11`.

- **Quantile Regression & Conformal PID Control for Time Series:**
  - *Authors*: Roger Koenker, Gilbert Bassett Jr., *"Regression Quantiles"*, *Econometrica*, Vol. 46, No. 1, pp. 33–50, 1978 (`DOI: 10.2307/1913643`); Anastasios N. Angelopoulos, Emmanuel J. Candès, Ryan J. Tibshirani, *"Conformal PID Control for Time Series Prediction"*, *NeurIPS 2023* (`arXiv:2307.16895`).
  - *Related Phases*: [`Fase 29 (L1)`](plans/phase_29_L1_cockpit_live_bindings_3d_cones.md), [`Fase 16 (H2)`](plans/phase_16_H2_dhf_monotone_quantiles_conformal_gate.md)
  - *Application in Project*: Fondamento dei coni multi-orizzonte non incrocianti `Timestral` (`+15m`, `+1h`, `+6h`, `+24h`) e del badge `ConformalAbstentionGate` in `MriAndStl.tsx` (sotto etichettatura onesta `ILLUSTRATIVE_UNVALIDATED` / `ILLUSTRATIVE_SCENARIO_RANGE`).

- **Air-Gapped 3D Anatomical Meshes (`nasa/NASA-3D-Resources`, `three.js GLTFLoader`) & `MIL-STD-1472H` Ergonomics:**
  - *Fonti*: NASA 3D Resources (`https://github.com/nasa/NASA-3D-Resources`); Ricardo Cabello (`mrdoob/three.js` `GLTFLoader`, `https://github.com/mrdoob/three.js`, `MIT`); US Department of Defense *MIL-STD-1472H: Human Engineering* Section 5.4 (`>= 44x44 pt` touch targets).
  - *Related Phases*: [`Fase 29 (L1)`](plans/phase_29_L1_cockpit_live_bindings_3d_cones.md)
  - *Application in Project*: Caricamento `.glb` locale air-gapped con guardia binaria `0x46546C67` in `NasaGlbAssetLayer.tsx` (compatibile con CSP `default-src 'self'`) e controlli tattili `>= 44x44 pt` in `PlaybookRunner.tsx` e `BodyHeatmap.tsx`.

- **Native Desktop Shell `Tauri v2` / `wry` & Zero-Copy POSIX SHM (`iceoryx2` / `Zenoh` / `ARINC 653`):**
  - *Fonti*: `tauri-apps/tauri` v2 & `wry` (`https://github.com/tauri-apps/tauri`, `Apache-2.0 OR MIT`); `eclipse-iceoryx/iceoryx2` (`ZeroCopySend`); `eclipse-zenoh/zenoh`.
  - *Related Phases*: [`Fase 30 (L2)`](plans/phase_30_L2_tauri_native_window_iceoryx2_ipc.md)
  - *Application in Project*: `crates/ares-desktop-os` (`WKWebView`/Metal & `WebKitGTK`/Vulkan, `Channel<Response>` `InvokeResponseBody::Raw` `128 B` `< 50 us`, bundle `ARES-MedOS.app`), `crates/ares-server-cli/src/shm_bus.rs` (`--features shm-ipc`, `loan_uninit()` `< 100 ns`, `OwltMarsCommState` `852 s`, `try_dispatch` `< 150 ns`).

### 11.2 Pure-Rust Level-1 `GATHER` DSP: Doppler Radar, Vocal Biomarkers & Waveform R-R Extraction (Phase 31 / `L3`)

- **Contactless Silicon Doppler Radar Cardiopulmonary Monitoring (`60 GHz` / `5.2 GHz`):**
  - *Authors*: Amy D. Droitcour, Olga Boric-Lubecke, Victor M. Lubecke, Jenshan Lin, Gregory T. A. Kovacs, *"Range correlation and I/Q performance benefits in single-chip silicon Doppler radars for noncontact cardiopulmonary monitoring"*, *IEEE Trans. Microw. Theory Tech.*, Vol. 52, No. 3, pp. 838–848, 2004 (`DOI: 10.1109/TMTT.2004.823552`); Olga Boric-Lubecke et al., *IEEE Microwave Magazine*, Vol. 10, No. 7, pp. 103–113, 2009 (`DOI: 10.1109/MMM.2009.934516`); NASA Artemis II `ARCHeR` nocturnal contactless monitoring reference.
  - *Related Phases*: [`Fase 31 (L3)`](plans/phase_31_L3_gather_radar_vocal_waveform_dsp.md)
  - *Application in Project*: Demodulazione I/Q $\Delta\phi(t) = 4\pi d(t)/\lambda$ e rimozione clutter statico EMA in `crates/ares-telemetry-ingest/src/radar_csi_dsp.rs`.

- **DF2T SOS Biquad Filtering & Jury Stability (`60/120 Hz` ECLSS Fan Notch):**
  - *Authors*: Sophocles J. Orfanidis, *Introduction to Signal Processing* (Prentice Hall, 1996); Robert Bristow-Johnson, *Cookbook formulae for audio EQ biquad filter coefficients*.
  - *Related Phases*: [`Fase 31 (L3)`](plans/phase_31_L3_gather_radar_vocal_waveform_dsp.md)
  - *Application in Project*: Cascata biquad IIR notch `60/120 Hz` in Direct-Form II Transposed con verifica analitica dei poli nel cerchio unitario (criterio di Jury) e guardia automatica di Nyquist in `radar_csi_dsp.rs`.

- **Vocal Fundamental Frequency (`YIN`), `HNR`, Jitter & Shimmer Biomarkers:**
  - *Authors*: Alain de Cheveigné, Hideki Kawahara, *"YIN, a fundamental frequency estimator for speech and music"*, *J. Acoust. Soc. Am.*, Vol. 111, No. 4, pp. 1917–1930, 2002 (`DOI: 10.1121/1.1458024`); Paul Boersma, *"Accurate short-term analysis of the fundamental frequency and the harmonics-to-noise ratio of a sampled sound"*, *Proc. Inst. Phonetic Sci.*, Vol. 17, pp. 97–110, 1993.
  - *Related Phases*: [`Fase 31 (L3)`](plans/phase_31_L3_gather_radar_vocal_waveform_dsp.md)
  - *Application in Project*: Estrazione zero-heap di $F_0$, jitter, shimmer, `HNR`, spectral tilt e `pause_ratio` VAD in `crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs` con emissione rigorosa `None` su frame silenti o non vocalizzati.

- **Real-Time QRS Detection, HRV Standards, Ectopic Rejection & `CEBS` Benchmark:**
  - *Authors*: Jiapu Pan, Willis J. Tompkins, *"A Real-Time QRS Detection Algorithm"*, *IEEE Trans. Biomed. Eng.*, BME-32(3):230–236, 1985 (`DOI: 10.1109/TBME.1985.325532`); Task Force of ESC & NASPE, *"Heart rate variability: Standards of measurement, physiological interpretation, and clinical use"*, *Circulation*, 93(5):1043–1065, 1996 (`DOI: 10.1161/01.CIR.93.5.1043`); Marek Malik et al., *"Heart rate variability"*, *Ann. Noninvasive Electrocardiol.*, 1989/1996 ($\pm 20\%$ ectopic beat rejection criterion); PhysioNet `CEBS` Database v1.0.0 (`https://physionet.org/content/cebsdb/1.0.0/`, `DOI: 10.13026/C2KW23`).
  - *Related Phases*: [`Fase 31 (L3)`](plans/phase_31_L3_gather_radar_vocal_waveform_dsp.md)
  - *Application in Project*: Estrattore R-R streaming a `125–500 Hz` in `crates/ares-telemetry-ingest/src/waveform_rr_extractor.rs`, preservando l'invariante Issue `#11` (`BidmcReplayer` `1 Hz` numerico resta sempre `rmssd_ms: None` + `BEAT_INTERVALS_NOT_AVAILABLE`).

### 11.3 Air-Gapped Edge LLM + Voice Copilot & `SafeTensors` Checkpoint Loader (Phase 32 / `L4`)

- **Zero-Copy `SafeTensors` & Pure-Rust Tensor Validation (`huggingface/safetensors`, `huggingface/candle`):**
  - *Fonti*: `https://github.com/huggingface/safetensors` (`Apache-2.0`); `https://github.com/huggingface/candle` (`MIT OR Apache-2.0`).
  - *Related Phases*: [`Fase 32 (L4)`](plans/phase_32_L4_edge_llm_voice_copilot_safetensors.md)
  - *Application in Project*: Caricamento deterministico `F32`/`BF16` $\to$ `f64` senza esecuzione arbitraria di codice (`pickle`-free) in `crates/ares-nqs-stl/src/timestral_safetensors.rs` con pre-verifica `SHA-256` contro `assets/models/MANIFEST.json` e fallback pulito a `new_deterministic`.

- **Indirect Prompt Injection Defense & Spotlighting (`ACM AISec 2023` / `2024`):**
  - *Authors*: Kai Greshake, Sahar Abdelnabi, Shailesh Mishra, Christoph Endres, Thorsten Holz, Mario Fritz, *"Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection"*, *ACM AISec '23*, pp. 79–90, 2023 (`DOI: 10.1145/3605764.3623985`, `arXiv:2302.12173`); Keegan Hines et al., *"Defending Against Indirect Prompt Injection Attacks With Spotlighting"*, 2024 (`DOI: 10.48550/arXiv.2403.14720`, `arXiv:2403.14720`).
  - *Related Phases*: [`Fase 32 (L4)`](plans/phase_32_L4_edge_llm_voice_copilot_safetensors.md), [`Fase 12 (F1)`](plans/phase_12_F1_role_based_crew_privacy_sha256_audit_and_aead_plan.md)
  - *Application in Project*: Isolamento tramite delimitatori escapati `<untrusted_telemetry_observation>` (`StrictMcpSanitizer`) e segregazione read-only dei soli `8` tool `FastMCP` in `crates/ares-server-cli/src/edge_llm_bridge.rs`.

- **Local Quantized Inference (`llama.cpp` / `Ollama`), Offline ASR (`Whisper` / `whisper-rs`), Web Speech API & `DO-178C` Safety Barrier:**
  - *Fonti*: `https://github.com/ggml-org/llama.cpp` (`MIT`) & `https://github.com/ollama/ollama` (`MIT`); Alec Radford et al., *"Robust Speech Recognition via Large-Scale Weak Supervision"*, *ICML 2023*, PMLR 202:28492–28518 (`arXiv:2212.04356`); `https://github.com/ggerganov/whisper.cpp` (`MIT`) & `https://github.com/tazz4843/whisper-rs` (`Unlicense OR MIT`); W3C/WICG *Web Speech API Specification* (`https://wicg.github.io/speech-api/`); RTCA SC-205 *DO-178C* / EUROCAE *ED-12C* (2011).
  - *Related Phases*: [`Fase 32 (L4)`](plans/phase_32_L4_edge_llm_voice_copilot_safetensors.md)
  - *Application in Project*: Confinamento della componente conversazionale LLM al livello consultivo (`DAL-E`) con verificatore post-generazione dei Safety Gates 1–3 e fallback deterministico Type-1 `OfflineTemplateCopilot` (`< 400 us`), piu interfaccia vocale hands-free (`crates/ares-desktop-os/src/voice_whisper.rs`, `OsVoiceCopilot.tsx`, `[V2 10001]`, `[V2 10027]`).

### 11.4 Clinical Calibration, Conformalized Quantile Regression (`CQR`), Exact Coverage & Multi-Agency Parquet Adapters (Phase 33 / `L5` — Issue `#12` Closure)

- **Conformalized Quantile Regression (`CQR`) & Distribution-Free Predictive Coverage:**
  - *Authors*: Yaniv Romano, Evan Patterson, Emmanuel J. Candès, *"Conformalized Quantile Regression"*, *NeurIPS 2019*, Vol. 32, pp. 3543–3553 (`arXiv:1905.03222`).
  - *Related Phases*: [`Fase 33 (L5)`](plans/phase_33_L5_clinical_calibration_24dataset_parquet.md)
  - *Application in Project*: Calibrazione split-conformal a campione finito dei coni quantilici monotoni $[q_{0.05}, q_{0.95}]$ su soggetti disgiunti (`SubjectDisjointSplit`) in `crates/ares-nqs-stl/src/calibration_harness.rs`.

- **Exact Binomial Confidence Limits (Clopper-Pearson Interval):**
  - *Authors*: Charles J. Clopper, Egon S. Pearson, *"The Use of Confidence or Fiducial Limits Illustrated in the Case of the Binomial"*, *Biometrika*, Vol. 26, No. 4, pp. 404–413, 1934 (`DOI: 10.1093/biomet/26.4.404`).
  - *Related Phases*: [`Fase 33 (L5)`](plans/phase_33_L5_clinical_calibration_24dataset_parquet.md)
  - *Application in Project*: Limiti esatti $[p_{\text{CP, low}}, p_{\text{CP, high}}]$ al $95\%$ della copertura empirica su finestre held-out non sovrapposte tramite inversione della funzione Beta incompleta regolarizzata.

- **Strictly Proper Scoring Rules, Brier Score, Winkler Interval Score & `ECE`:**
  - *Authors*: Glenn W. Brier, *"Verification of Forecasts Expressed in Terms of Probability"*, *Monthly Weather Review*, Vol. 78, No. 1, pp. 1–3, 1950 (`DOI: 10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2`); Tilmann Gneiting, Adrian E. Raftery, *"Strictly Proper Scoring Rules, Prediction, and Estimation"*, *JASA*, Vol. 102, No. 477, pp. 359–378, 2007 (`DOI: 10.1198/016214506000001437`); Robert L. Winkler, *"A Decision-Theoretic Approach to Interval Estimation"*, *JASA*, Vol. 67, No. 337, pp. 187–191, 1972; Mahdi Pakdaman Naeini, Gregory F. Cooper, Milos Hauskrecht, *"Obtaining Well Calibrated Probabilities Using Bayesian Binning into Quantiles"*, *AAAI 2015*, pp. 2901–2907 (`DOI: 10.1609/aaai.v29i1.9602`).
  - *Related Phases*: [`Fase 33 (L5)`](plans/phase_33_L5_clinical_calibration_24dataset_parquet.md)
  - *Application in Project*: Valutazione quantitativa di *Pinball Loss*, *Winkler Score* contro baseline `Persistence` / `RollingMedianIqr`, *Brier Score* e `ECE`/`MCE` su `10` bin per `evaluate_two_stage_bayesian_pocus` in `calibration_harness.rs` e `ares-calibrate`.

- **Columnar Parquet Adapters & Reference Cohorts (`apache/arrow-rs`, `Fantasia`, `CEBS`, `PPG-DaLiA`, `AGBRESA` HDBR):**
  - *Fonti*: `https://github.com/apache/arrow-rs` (`arrow-array`, `arrow-schema`, `parquet`, `MIT OR Apache-2.0`); N. Iyengar et al., *Am. J. Physiol.* 271:R1078–R1084, 1996 (PhysioNet `Fantasia`, `DOI: 10.13026/C2RG61`); M. A. García-González et al., *IEEE TBME* 2013 (`CEBS`, `DOI: 10.13026/C2KW23`); Attila Reiss et al., *Sensors* 19(14):3079, 2019 (`PPG-DaLiA`, `DOI: 10.3390/s19143079`, `DOI: 10.24432/C53890`); Stuart S. Laurie et al., *"Optic Disc Edema after 30 Days of Strict Head-Down Tilt Bed Rest"*, *JAMA Ophthalmology*, 137(5):515–522, 2019 (`DOI: 10.1001/jamaophthalmol.2018.6776`) & *J. Physiol.*, 599(14):3503–3515, 2021 (`DOI: 10.1113/JP281667`, `AGBRESA` HDBR).
  - *Related Phases*: [`Fase 33 (L5)`](plans/phase_33_L5_clinical_calibration_24dataset_parquet.md)
  - *Application in Project*: Feature opzionale `--features parquet-ingest` e adapter multi-agenzia in `crates/ares-causal-graph/src/parquet_adapters.rs` con degradazione esplicita `AdapterStatus::ExternalDatasetNotBundled` (`0` nodi sintetici) e macchina a stati `ModelValidationStatus` per la chiusura rigorosa di Issue `#12`.

### 11.5 Deterministic Typography, Accessibility Subtitling, PDF 2.0 & NASA Space Apps 2026 Submission Directives (Phase 34 / `L6`)

- **Deterministic Typesetting (`typst/typst`), Slide Frameworks & `SOURCE_DATE_EPOCH`:**
  - *Fonti*: Laurenz Madje, Martin Haug, *"Typst: A Programmable Markup-Based Typesetting System for the Sciences"* (TU Berlin, 2022) — `https://github.com/typst/typst` (`v0.15.1`, `Apache-2.0`); `https://github.com/touying-typ/touying` (`MIT`); `https://github.com/polylux-typ/polylux` (`MIT`); Reproducible Builds `SOURCE_DATE_EPOCH` (`https://reproducible-builds.org/specs/source-date-epoch/`).
  - *Related Phases*: [`Fase 34 (L6)`](plans/phase_34_L6_nasa_submission_pitch_slides_pdf.md)
  - *Application in Project*: Compilazione offline deterministica di `docs/submission/NASA_2026_7_SLIDE_DECK.pdf` e `PANORAMICA_GENERALE_PROGETTO.pdf` via `scripts/build_submission_docs.sh`.

- **SubRip (`.srt`), W3C `WCAG 2.2 SC 1.2.2`, ISO 32000-2:2020 (PDF 2.0) & NASA Space Apps Submission Guide:**
  - *Fonti*: Matroska SubRip `S_TEXT/UTF8` Technical Specification (`https://www.matroska.org/technical/subtitles.html`); W3C *WCAG 2.2* Success Criterion `1.2.2` (*Captions Prerecorded*, `https://www.w3.org/TR/WCAG22/`); BBC Subtitle Guidelines ($\le 20\text{ CPS}$, $\le 2$ righe); ISO 32000-2:2020 (*PDF 2.0*); `qpdf` (`Apache-2.0`), `poppler` (`GPL-2.0`), `pypdf` (`BSD-3-Clause`); NASA Space Apps Project Submission Guide (`https://www.spaceappschallenge.org/resources/project-submission-guide/`).
  - *Related Phases*: [`Fase 34 (L6)`](plans/phase_34_L6_nasa_submission_pitch_slides_pdf.md)
  - *Application in Project*: Validazione automatica di `PITCH_30S_SUBTITLES_EN.srt` (`<= 00:00:30,000`), `WALKTHROUGH_180S_SUBTITLES_EN.srt` (`<= 00:03:00,000`), doppio oracolo `N_pages == 7` (`typst query` + parser stdlib) e audit semantico Issue `#12` in `scripts/build_submission_docs.sh`.

---

## 12. Block M: 3-Tier LSAH Persistence Engine (Issue `#26`), Columnar/Vector Storage (`Lance` & `HNSW`), Lock-Free Real-Time Rings (`LEFT-RS`), Embedded `ChaCha20-Poly1305` AEAD & Multi-Branch Unification (Phases 35–37)

> Architettura di riferimento: [`docs/plans/BLOCK_M_GAP_CLOSURE_ARCHITECTURE.md`](plans/BLOCK_M_GAP_CLOSURE_ARCHITECTURE.md) | Piani di fase: [`Fase 35 (M1 — Issue #26)`](plans/phase_35_M1_lsah_3tier_persistence_issue26.md), [`Fase 36 (M2 — Multi-Branch Merge)`](plans/phase_36_M2_branch_unification_merge.md), [`Fase 37 (M3 — E2E Verification)`](plans/phase_37_M3_end_to_end_db_cockpit_verification.md).

### 12.1 Adaptive Columnar Multimodal Storage & Approximate Nearest Neighbor Vector Search (`Lance`, `Apache Arrow IPC`, `Zstandard` & `HNSW` — Phase 35 / `M1`)

- **Lance Adaptive Columnar Format (`Miniblock` vs. `Full Zip` Structural Encodings for NVMe + Vectors):**
  - *Authors*: Weston Pace, Chang She, Lei Xu, Will Jones, Albert Lockett, Jun Wang, Raunak Shah, *"Lance: Efficient Random Access in Columnar Storage through Adaptive Structural Encodings"*, 2025 (`arXiv:2504.15247v1`, `DOI: 10.48550/arXiv.2504.15247`).
  - *Related Phases*: [`Fase 35 (M1)`](plans/phase_35_M1_lsah_3tier_persistence_issue26.md), [`Fase 37 (M3)`](plans/phase_37_M3_end_to_end_db_cockpit_verification.md)
  - *Application in Project*: Fondamento architetturale del **Warm Tier** in `crates/ares-storage-lsah`: giustifica la normalizzazione in due tabelle distinte (`lsah_telemetry_frames` densa a `20 Hz` con null-bitmap nativi per Issue `#11` vs. `lsah_pocus_signatures` episodica con `FixedSizeList<Float32, D>` per scansioni ecografiche POCUS `D = 128 / 256`, evitando `~1.6 TB` di zero-padding su `900` Sol) e il trait modulare `WarmColumnarVectorBackend` che supporta sia il backend nativo snello `ArrowIpcZstdHnswBackend` (`default`, `62` crate 100% offline, `0` crate HTTP) sia `LanceDbEmbeddedWarmBackend` (`--features lancedb-warm`, `lancedb 0.40.0` / `lance 13.0.0` con guardia air-gap `validate_airgapped_lsah_dir()`).

- **Hierarchical Navigable Small World (`HNSW`) Graphs for $O(\log N)$ Longitudinal Ultrasound Retrieval:**
  - *Authors*: Yu. A. Malkov, D. A. Yashunin, *"Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs"*, *IEEE Transactions on Pattern Analysis and Machine Intelligence (TPAMI)*, Vol. 42, No. 4, pp. 824–836, 2020 (`DOI: 10.1109/TPAMI.2018.2889473`, `arXiv:1603.09320v4`).
  - *Related Phases*: [`Fase 35 (M1)`](plans/phase_35_M1_lsah_3tier_persistence_issue26.md)
  - *Application in Project*: Implementazione pure-Rust deterministica (`SplitMix64` level sampling, `M = 16`, `M_max0 = 32`, `ef_construction = 64`, `ef_search = 32`, snapshot `.hnsw.bin` protetto da `CRC-32C`) in `crates/ares-storage-lsah/src/hnsw_index.rs` per il confronto longitudinale `Sol 180` vs. baseline `Sol 1` delle firme ecografiche `IJV` (`tau_w`, `IJV_CSA`, texture B-mode) in `< 260 us` (`Recall@5 >= 0.98`), mantenendo il vincolo Issue `#12` (`ProceduralBModeSimulation` / `IllustrativeUnvalidated`) e il blocco invalicabile del **Hard Safety Gate 1** (`advisory_only_gate1_locked = true`).

- **Apache Arrow Columnar In-Memory/IPC Format & Zstandard (`RFC 8878`) Frame Compression:**
  - *Fonti*: Apache Arrow Specification (`Format Version 1.0 / IPC File v2`, `https://arrow.apache.org/docs/format/Columnar.html`); Yann Collet, Murray Kucherawy, *"Zstandard Compression and the 'application/zstd' Media Type"*, IETF *RFC 8878*, February 2021 (`DOI: 10.17487/rfc8878`).
  - *Related Phases*: [`Fase 35 (M1)`](plans/phase_35_M1_lsah_3tier_persistence_issue26.md)
  - *Application in Project*: Serializzazione colonnare `arrow-ipc 58.4.0` + `zstd 0.13.3` (`level = 3` nel Warm Tier, `level = 6` nel Cold Tier con rapporto di compressione `5x–9x`), preservando bit-per-bit i bitmap di validita `NULL` (`rmssd_ms == None` su tutti i `53` tracciati numerici `1 Hz` `BIDMC` in conformita a Issue `#11`) senza dipendere dal crate `parquet` assente dalla cache offline.

### 12.2 Lock-Free / Wait-Free Real-Time Ring Buffering & Flash Wear-Leveling Isolation (`LEFT-RS` — Phase 35 / `M1`)

- **Lock-Free Fault-Tolerant Resource Sharing & Wait-Free Producer/Consumer Isolation:**
  - *Authors*: Nan Chen, Xiaotian Dai, Tong Cheng et al., *"LEFT-RS: A Lock-Free Fault-Tolerant Resource Sharing Protocol for Multicore Real-Time Systems"*, 2025 (`arXiv:2512.21701v1`, `DOI: 10.48550/arXiv.2512.21701`); Ivan Cibrario Bertolotti, Gabriele Manduchi, *"Lock and Wait-Free Communication"*, in *Real-Time Embedded Systems*, CRC Press, 2017 (`DOI: 10.1201/b11651-10`); Hyeonjoong Cho, Binoy Ravindran, E. Douglas Jensen, *"Lock-Free Synchronization for Dynamic Embedded Real-Time Systems"*, *Proc. Design, Automation and Test in Europe (DATE)*, 2006 (`DOI: 10.1109/date.2006.243800`).
  - *Related Phases*: [`Fase 35 (M1)`](plans/phase_35_M1_lsah_3tier_persistence_issue26.md), [`Fase 37 (M3)`](plans/phase_37_M3_end_to_end_db_cockpit_verification.md)
  - *Application in Project*: Progettazione di `HotLsahSlot` (`256 B`, `#[repr(C, align(64))]`, `Copy`, `0` puntatori heap post-init, `< 250 ns` insert) in `HotRingBuffer` (`60–300 s @ 20 Hz`) e del doppio buffer di staging `WarmStagingSwapBuffer` (`2 x 200` slot + coalescenza d'emergenza `WelfordAccumulator` su `spawn_blocking`), garantendo che picchi di latenza `fsync()` (`50–250 ms`) su flash eMMC/NVMe rad-tolerant non blocchino mai il loop deterministico a `20 Hz` (`p99.9 < 150 us`) e riducendo le scritture flash di **`200x`** (`8,640` vs `1,728,000` sync/Sol) con protocollo crash-atomico `write(.tmp) -> sync_all -> rename`.

### 12.3 Embedded `ChaCha20-Poly1305` AEAD, Monotonic Nonce Discipline & Tamper-Evident Audit Binding (Phase 35 / `M1`)

- **High-Speed Embedded `ChaCha20-Poly1305` & Structured `96-bit` Nonce Uniqueness (`DATE 2017`, `RFC 8103`, `RFC 8439`):**
  - *Authors*: Fabrizio De Santis, Andreas Schauer, Georg Sigl, *"ChaCha20-Poly1305 authenticated encryption for high-speed embedded IoT applications"*, *Proc. Design, Automation & Test in Europe Conference & Exhibition (DATE)*, IEEE, pp. 692–697, 2017 (`DOI: 10.23919/date.2017.7927078`); Russ Housley, *"Using ChaCha20-Poly1305 Authenticated Encryption in the Cryptographic Message Syntax (CMS)"*, IETF *RFC 8103*, 2017 (`DOI: 10.17487/rfc8103`); Yoav Nir, Adam Langley, *"ChaCha20 and Poly1305 for IETF Protocols"*, IETF *RFC 8439*, 2018 (`DOI: 10.17487/rfc8439`).
  - *Related Phases*: [`Fase 35 (M1)`](plans/phase_35_M1_lsah_3tier_persistence_issue26.md), [`Fase 12 (F1)`](plans/phase_12_F1_role_based_crew_privacy_sha256_audit_and_aead_plan.md)
  - *Application in Project*: Sigillatura del **Cold Tier** (`.lsah.cold.aead`) in `crates/ares-storage-lsah/src/cold_aead_archive.rs` tramite nonce strutturato monotono a `96 bit` `key_epoch_id: u16 LE || mission_sol: u16 LE || chunk_seq: u64 LE` con watermark persistito su disco prima della cifratura (`Err(LsahStorageError::NonceReuseDetected)` in caso di tentato riuso post-riavvio) e legame bidirezionale **Associated Authenticated Data (`AAD`)** con `Sha256AuditLogger` (`ColdChunkHeader` di `144 B` contenente `audit_seq` e digest esadecimale `SHA-256` dell'evento `LSAH_COLD_SEAL`).

### 12.4 NASA `LSAH`, Spaceflight Medical Data Architecture (`ExMC Gap Med 07`), `NASA-STD-3001` & Open Anatomical/Clinical Assets (Phases 35–37 / `M1–M3`)

- **NASA Lifetime Surveillance of Astronaut Health (`LSAH`) & Exploration Medical Data Architecture (`MDA`):**
  - *Fonti & Autori*: NASA Johnson Space Center, *Lifetime Surveillance of Astronaut Health (LSAH)* (`https://lsda.jsc.nasa.gov/lsah_home`) & NASA Human Research Program *Exploration Medical Capability (`ExMC`) Gap Med 07: Medical Data Architecture*; Albert Assad, Olivier L. de Weck, *"Medical supply logistics for human spaceflight: Modularity, reliability, and autonomous medical data architectures"*, *Acta Astronautica*, Vol. 110, pp. 135–150, 2015 (`DOI: 10.1016/j.actaastro.2014.10.009`); Luke Stegeman et al., *"Longitudinal astronaut health surveillance and space radiation risk modeling"*, *Carcinogenesis*, 2025 (`DOI: 10.1093/carcin/bgaf076`); `NASA-STD-3001 Vol. 1 Rev C` (`[V1 3003]` *Crew Medical Privacy Governance*, `[V1 3006]` *Earth-Independent Medical Operations — EIMO*).
  - *Related Phases*: [`Fase 35 (M1)`](plans/phase_35_M1_lsah_3tier_persistence_issue26.md), [`Fase 37 (M3)`](plans/phase_37_M3_end_to_end_db_cockpit_verification.md)
  - *Application in Project*: Governa il ciclo di vita completo Hot $\to$ Warm $\to$ Cold, la coda Store-and-Forward prioritizzata `DsnDownlinkOutbox` (`P0 = CriticalSafetyAlert`, `P1 = PocusSignature`, `P2 = NominalSol`) per finestre radio Terra-Marte (`OWLT 8–48 min` / blackout di congiunzione solare `14 giorni`), e il filtro di privacy per ruolo `AresSecurityGuard::apply_privacy_tier` (`[V1 3003]`) su tutte le letture storiche.

- **Expanded 53-Subject PhysioNet BIDMC Cohort & Open `CC-BY-SA-4.0` 3D Anatomical Mesh Atlas (Fase 36 / `M2` & Fase 37 / `M3`):**
  - *Fonti*: Marco A. F. Pimentel et al., *"Toward a Robust Estimation of Respiratory Rate From Pulse Oximeters"*, *IEEE TBME*, 64(8):1914–1923, 2017 — *PhysioNet BIDMC PPG and Respiration Dataset v1.0.0* (`DOI: 10.13026/C2208R`, `ODC-By v1.0`, tutti i `53` soggetti `bidmc_01..53_Numerics.csv` verificati via `SHA-256`); Gauthier Kervyn / Z-Anatomy & BodyParts3D (*Database Center for Life Science*, Mitsuhashi et al., *Nucleic Acids Research*, 37:D782–D785, 2009, `DOI: 10.1093/nar/gkn613`, licenza `CC-BY-SA-4.0` documentata in `ares-cockpit/public/anatomy/ATTRIBUTION.md` & `MANIFEST.json`).
  - *Related Phases*: [`Fase 36 (M2)`](plans/phase_36_M2_branch_unification_merge.md), [`Fase 37 (M3)`](plans/phase_37_M3_end_to_end_db_cockpit_verification.md)
  - *Application in Project*: Espansione del benchmark terrestre `SubjectDisjointSplit` anti-leakage a tutti i `53` soggetti ICU `BIDMC` (mantenendo `rmssd_ms == None` per Issue `#11` e `ModelValidationStatus::IllustrativeUnvalidated` / `FLAG_TERRESTRIAL_BENCHMARKED_ONLY` per Issue `#12`) e rendering 3D air-gapped dei `5` sistemi anatomici `.glb` (`0x46546C67` magic check + mapping `UBERON:` `observed=false`).

### 12.5 Open-Source Rust Storage & Cryptography Repositories Used in Block M (`crates/ares-storage-lsah`)

| Repository Open-Source | Versione Locale in Cache | Licenza | Impiego in `crates/ares-storage-lsah` |
| :--- | :---: | :---: | :--- |
| [`apache/arrow-rs`](https://github.com/apache/arrow-rs) (`arrow-array`, `arrow-schema`, `arrow-ipc`) | `58.4.0` | `Apache-2.0` | Schema colonnare tipizzato, bitmap di validita `NULL` (Issue `#11`) e formato `Arrow IPC File v2`. |
| [`gyscos/zstd-rs`](https://github.com/gyscos/zstd-rs) (`zstd`) | `0.13.3` | `MIT` | Compressione colonnare `Zstd` (`level = 3` Warm, `level = 6` Cold `5x–9x`) 100% offline. |
| [`lancedb/lancedb`](https://github.com/lancedb/lancedb) & [`lance-format/lance`](https://github.com/lance-format/lance) | `0.40.0` / `13.0.0` | `Apache-2.0` | Backend embedded opzionale (`--features lancedb-warm`) dietro `WarmColumnarVectorBackend` + guardia air-gap. |
| [`Amanieu/parking_lot`](https://github.com/Amanieu/parking_lot) | `0.12.5` | `MIT OR Apache-2.0` | Sincronizzazione deterministica sub-microsecondo su `HotRingBuffer` e `WarmStagingSwapBuffer`. |
| [`srijs/rust-crc32fast`](https://github.com/srijs/rust-crc32fast) | `1.5.2` | `MIT OR Apache-2.0` | Checksum `CRC-32C` su `HotLsahSlot`, snapshot `.hnsw.bin`, `MANIFEST.lsah.json` e `ColdChunkHeader`. |
| [`RustCrypto/AEADs`](https://github.com/RustCrypto/AEADs) (`chacha20poly1305`) & [`RustCrypto/hashes`](https://github.com/RustCrypto/hashes) (`sha2`) | `0.10.1` / `0.10.9` | `MIT OR Apache-2.0` | Sigillatura autenticata Cold Tier con nonce monotono `96-bit` e `AAD` bidirezionale su `Sha256AuditLogger`. |



