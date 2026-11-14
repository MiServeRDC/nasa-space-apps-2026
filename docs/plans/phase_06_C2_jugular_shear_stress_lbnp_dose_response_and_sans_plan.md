# Piano Implementativo Definitivo — Fase 06 (C2): Dimensional Jugular Wall Shear Stress ($\tau_w(t)$), Graded LBNP Dose-Response & SANS Translaminar Coupling

- **Blocco Architetturale**: Blocco C (*Motore Rust Core: Fisiopatologia Differenziale & Grafo Causale `ADHG` — `2. EVALUATE` Parte 1*, Fasi 05–07)
- **Fase**: Fase 06 (`C2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-causal-graph`](../../crates/ares-causal-graph/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid`
- **File Target Previsti**:
  1. `crates/ares-causal-graph/src/hemodynamics.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 10\,\mu\text{s}$ per valutazione emodinamica giugulare e oculare `SANS` (zero allocazioni heap).
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, rispetto rigoroso dell'invariante dimensionale `Entry 001` ($\tau_w$ in $\text{dyn/cm}^2$).

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale
La **Fase 06 (`C2`)** implementa nel Motore Rust Core l'accoppiamento fisico tra la pompa venosa crurale del soleo ($\text{MQI}$ calcolato nella Fase 05), lo shift cefalico dei fluidi in microgravità, lo stress ossidativo endoteliale da radiazioni (`CSA CANS`), la contromisura a pressione negativa inferiore (`LBNP` a $-30\text{ mmHg}$) e la sindrome neuro-oculare `SANS`.

Il modulo rispetta rigorosamente l'**Invariante Anti-Regressione `Entry 001`** di `memory-bank/experienceLog.md`:
* Il raggio equivalente della vena giugulare interna è estratto tramite radice quadrata dall'area trasversa ($r_{\text{eff}}(t) = \sqrt{\text{IJV\_CSA}_{\text{cm}^2}(t) / \pi}$), garantendo che lo shear stress di parete $\tau_w(t)$ abbia l'esatta dimensione fisica di una pressione/sforzo di taglio ($\text{dyn/cm}^2$).

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Karina Marshall-Goebel, S.S. Laurie, M.B. Stenger et al. (NASA JSC):**
   * *Titolo:* *"Assessment of Jugular Venous Blood Flow Stasis and Thrombosis During Spaceflight"*, *JAMA Network Open*, 2(11):e1915011, 2019 | **DOI:** `10.1001/jamanetworkopen.2019.15011` | **PMCID:** `PMC6902784`.
2. **Journal of Applied Physiology (2026) & Studio Dose-Risposta LBNP (Settembre 2026):**
   * *Titolo:* *"Case study: dose-dependent internal jugular vein response to lower body negative pressure"*, *J. Appl. Physiol.*, 2026 | **DOI:** `10.1152/japplphysiol.00018.2026`.
3. **Shigehiko Ogoh, Ai Hirasawa, Shigeki Shibata (JAXA / Toyo Univ.):**
   * *Titolo:* *"Influence of head-up tilt and lower body negative pressure on the internal jugular vein"*, *Physiological Reports*, 2022 | **DOI:** `10.14814/phy2.15248`.
4. **Chinese Academy of Sciences — Shanghai Institute of Nutrition and Health (Luglio 2026):**
   * *Titolo:* *"航天微重力环境下血管结构和功能的影响及其力学生物学最新进展"*, *Chinese Bulletin of Life Sciences*, 2026 (`5-2026-0038`).
5. **NASA OSDR `OSD-818` & DLR `SANS-CM`:** Modello translaminare di pressione intraoculare/intracranica e spessore coroideale ($\Delta\text{CT}$).

### 1.3 Equazioni Fisiche Esatte
1. **Shear Stress Giugulare ($\tau_w(t)$ in $\text{dyn/cm}^2$):**
   Convertendo $\text{IJV\_CSA}_{\text{mm}^2}(t)$ in $\text{cm}^2$ ($\text{IJV\_CSA}_{\text{cm}^2} = \text{IJV\_CSA}_{\text{mm}^2} / 100.0$):
   $$\tau_w(t) = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\frac{\pi}{\text{IJV\_CSA}_{\text{cm}^2}(t)}}, \qquad \mu = 0.035\text{ Poise}$$
2. **Risposta Dose-Dipendente a `LBNP` ($P_{\text{LBNP}} \in [-30, 0]\text{ mmHg}$) e Qualità del Soleo ($\text{MQI}$):**
   $$\text{IJV\_CSA}_{\text{mm}^2}(t) = \text{CSA}_{\mu g,\text{max}} \cdot \Big(1.0 - 0.34 \cdot \frac{|P_{\text{LBNP}}(t)|}{30.0} - 0.28 \cdot \text{MQI}(t)\Big)$$

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 06 (`C2`) |
| :--- | :--- | :--- |
| `crates/ares-causal-graph/src/hemodynamics.rs` | **CREATE** | Funzione pura `compute_tau_w_dyn_cm2`, `compute_jugular_and_sans_state` e classificazione `JugularFlowGrade`. |

---

## 3. Architettura di `hemodynamics.rs` in Puro Rust 2024

```rust
//! Fase 06 (C2): Emodinamica venosa giugulare dimensionalmente esatta (tau_w in dyn/cm^2),
//! curva dose-risposta della camera LBNP e indice translaminare SANS.

use ares_core_types::constants::{BLOOD_VISCOSITY_POISE, sanitize_f64};
use ares_core_types::telemetry::{
    JugularFlowGrade, JugularHemodynamics, Musculoskeletal, SansOcular, StressTestScenarioInput,
};
use std::f64::consts::PI;

/// Calcola lo shear stress di parete della vena giugulare interna (in dyn/cm^2):
/// tau_w = 2 * mu * v_max * sqrt(pi / CSA_cm2).
#[inline]
pub fn compute_tau_w_dyn_cm2(vmax_cm_s: f64, ijv_csa_mm2: f64) -> f64 {
    let vmax = sanitize_f64(vmax_cm_s, 0.0).max(0.0);
    let csa_mm2 = sanitize_f64(ijv_csa_mm2, 50.0).max(5.0);
    let csa_cm2 = csa_mm2 / 100.0;
    2.0 * BLOOD_VISCOSITY_POISE * vmax * (PI / csa_cm2).sqrt()
}

/// Calcola lo stato emodinamico giugulare (`JugularHemodynamics`) e oculare (`SansOcular`).
#[inline]
pub fn compute_jugular_and_sans_state(
    musculo: &Musculoskeletal,
    scenario: &StressTestScenarioInput,
) -> (JugularHemodynamics, SansOcular) {
    let lbnp_mag = if scenario.lbnp_active {
        sanitize_f64(scenario.lbnp_pressure_mmhg.abs(), 30.0).clamp(0.0, 45.0)
    } else {
        0.0
    };
    let lbnp_norm = (lbnp_mag / 30.0).clamp(0.0, 1.2);
    let rad_stress = (scenario.radiation_dose_rate_msv_d / 5.0).clamp(0.0, 1.0);

    // Area trasversa IJV (mm^2): dilatazione in microgravita contrastata da MQI soleo e LBNP
    let ijv_csa_mm2 = (96.0 * (1.0 - 0.28 * musculo.mqi_index - 0.34 * lbnp_norm + 0.08 * rad_stress))
        .clamp(32.0, 118.0);

    // Velocita di picco IJV (cm/s): sostenuta da pompa crurale MQI e gradiente idrostatico LBNP
    let ijv_vmax_cm_s = (3.2 + 9.8 * musculo.mqi_index + 7.4 * lbnp_norm - 1.8 * rad_stress)
        .clamp(1.5, 24.0);

    let tau_w_dyn_cm2 = compute_tau_w_dyn_cm2(ijv_vmax_cm_s, ijv_csa_mm2);

    let flow_grade = if scenario.pocus_thrombus_confirmed {
        JugularFlowGrade::OccludedThrombus
    } else if ijv_vmax_cm_s < 3.5 {
        JugularFlowGrade::Retrograde
    } else if ijv_vmax_cm_s < 6.0 || tau_w_dyn_cm2 < 1.20 {
        JugularFlowGrade::StagnantBidirectional
    } else if ijv_vmax_cm_s < 11.0 {
        JugularFlowGrade::PulsatileReduced
    } else {
        JugularFlowGrade::NormalContinuous
    };

    let jugular = JugularHemodynamics {
        ijv_csa_mm2,
        ijv_vmax_cm_s,
        tau_w_dyn_cm2,
        flow_grade,
        pocus_thrombus_confirmed: scenario.pocus_thrombus_confirmed,
        lbnp_active: scenario.lbnp_active,
        lbnp_pressure_mmhg: if scenario.lbnp_active { -lbnp_mag } else { 0.0 },
    };

    // Calcolo biomarcatori SANS (congestione venosa cefalica -> aumento ONSD e spessore coroideale)
    let venous_congestion = ((ijv_csa_mm2 - 38.0) / 62.0).clamp(0.0, 1.0);
    let onsd_mm = (5.05 + 1.35 * venous_congestion).clamp(4.8, 6.8);
    let choroidal_delta_um = (12.0 + 58.0 * venous_congestion).clamp(5.0, 85.0);
    let sans_risk_index = (0.45 * ((onsd_mm - 5.0) / 1.4)
        + 0.35 * (choroidal_delta_um / 70.0)
        + 0.20 * venous_congestion)
        .clamp(0.05, 0.98);

    let sans = SansOcular {
        onsd_mm,
        choroidal_delta_um,
        sans_risk_index,
    };

    (jugular, sans)
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 06 (`C2`)

1. **`test_tau_w_dimensional_accuracy`:** Verifica analiticamente che per $v_{\max} = 10.0\text{ cm/s}$ e $\text{IJV\_CSA} = 78.54\text{ mm}^2$ ($0.7854\text{ cm}^2$, raggio $r = 0.5\text{ cm}$), $\tau_w = 2 \cdot 0.035 \cdot 10.0 / 0.5 = 1.40\text{ dyn/cm}^2$ con errore $< 10^{-3}$.
2. **`test_lbnp_activation_restores_tau_w_above_critical_threshold`:** Verifica che l'attivazione di `LBNP` a $-30\text{ mmHg}$ riduca `ijv_csa_mm2` e riporti `tau_w_dyn_cm2` sopra la soglia critica di $1.20\text{ dyn/cm}^2$.
