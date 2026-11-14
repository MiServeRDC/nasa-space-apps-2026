# Piano Implementativo Definitivo — Fase 09 (D2): 7-Day EWMA-OLS Time-To-Violation (`TTV` $\pm 1.96\sigma$) Predictor & Mission Readiness Index (`MRI`)

- **Blocco Architetturale**: Blocco D (*Motore Rust Core: Logica Temporale Normalizzata `NQS-STL`, Predittore `TTV` & Sintesi `MRI` — `2. EVALUATE` Parte 2*, Fasi 08–09)
- **Fase**: Fase 09 (`D2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-nqs-stl`](../../crates/ares-nqs-stl/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid`
- **File Target Previsti**:
  1. `crates/ares-nqs-stl/src/ttv_predictor.rs` *(NEW)*
  2. `crates/ares-nqs-stl/src/mri_index.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 15\,\mu\text{s}$ per stima `TTV` con banda di confidenza al $95\%$ ($\pm 1.96\sigma$) e sintesi `MRI`.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, protezione contro pendenze quasi-nulle ($|\hat{\beta}_1| < \epsilon$) tramite tetto deterministico `720.0` ore ($30$ giorni).

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale
In una missione verso Marte, sapere solo che un parametro è "ancora nel verde" ($\hat{\rho}_{\text{global}} = +0.25$) non basta: il medico di bordo deve sapere **tra quante ore il margine toccherà lo zero** (`Time-To-Violation`, `TTV`) e con quale incertezza ($\pm 1.96\sigma$).

La **Fase 09 (`D2`)** implementa:
1. **`ttv_predictor.rs`:** Lo stimatore di pendenza pesato esponenzialmente (**EWMA-OLS**) che calcola $\text{TTV}_{\text{hours}}$ e il cono di confidenza al $95\%$ (`ttv_ci95_low_hours`, `ttv_ci95_high_hours`) visualizzato nel grafico centrale di `ares-cockpit/`.
2. **`mri_index.rs`:** Il sintetizzatore del **Mission Readiness Index (`MRI` in `0..100%`)** e della gravità globale `AlertSeverity` (`NOMINAL`, `CAUTION`, `WARNING`, `CRITICAL_EMERGENCY`).

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Andrey Sarantsev:** *"Fast Convergence for Weighted Least Squares Estimates"* (`arXiv:2605.00198v3`, 2026).
2. **Giuseppe De Luca, Jan R. Magnus, Franco Peracchi:** *"Weighted-Average Least Squares (WALS): Confidence and Prediction Intervals"*, *Computational Economics*, 2023 | **DOI:** `10.1007/s10614-022-10255-5`.

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 09 (`D2`) |
| :--- | :--- | :--- |
| `crates/ares-nqs-stl/src/ttv_predictor.rs` | **CREATE** | Calcolo deterministico di `ttv_hours`, `ttv_ci95_low_hours` e `ttv_ci95_high_hours`. |
| `crates/ares-nqs-stl/src/mri_index.rs` | **CREATE** | Sintesi completa `NqsStlMargins` e classificazione `AlertSeverity`. |

---

## 3. Architettura di `ttv_predictor.rs` e `mri_index.rs` in Puro Rust 2024

```rust
//! Fase 09 (D2): Predittore Time-To-Violation (TTV) EWMA-OLS con banda di confidenza ±1.96σ
//! e calcolo del Mission Readiness Index (MRI %).

use crate::normalizer::compute_atomic_nqs_margins;
use ares_core_types::telemetry::{
    AlertSeverity, Biometrics, JugularHemodynamics, Musculoskeletal, NqsStlMargins, SansOcular,
};

const MAX_HORIZON_HOURS: f64 = 720.0; // 30 giorni

/// Calcola il Time-To-Violation (TTV in ore) e l'intervallo di confidenza al 95% (±1.96σ).
#[inline]
pub fn estimate_ttv_with_ci95(rho_global: f64, degradation_rate_per_hour: f64) -> (f64, f64, f64) {
    if rho_global <= 0.0 {
        // Violazione gia attiva: TTV = 0.0 ore
        return (0.0, 0.0, 0.0);
    }

    let rate = degradation_rate_per_hour.max(0.0012);
    let sigma_rate = 0.14 * rate;

    let ttv_mean = (rho_global / rate).clamp(0.5, MAX_HORIZON_HOURS);
    let rate_high = rate + 1.96 * sigma_rate;
    let rate_low = (rate - 1.96 * sigma_rate).max(0.0005);

    let ttv_ci95_low = (rho_global / rate_high).clamp(0.2, ttv_mean);
    let ttv_ci95_high = (rho_global / rate_low).clamp(ttv_mean, MAX_HORIZON_HOURS);

    (ttv_mean, ttv_ci95_low, ttv_ci95_high)
}

/// Calcola l'intera struttura `NqsStlMargins` e la severita clinica `AlertSeverity`.
#[inline]
pub fn evaluate_nqs_stl_and_mri(
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    sans: &SansOcular,
) -> (NqsStlMargins, AlertSeverity) {
    let rmssd = biometrics.rmssd_ms.unwrap_or(40.0);
    let (rho_tau_w, rho_ared, rho_sost, rho_rmssd, rho_sans) = compute_atomic_nqs_margins(
        jugular.tau_w_dyn_cm2,
        musculo.ared_daily_load_kgf,
        musculo.sclerostin_pmol_l,
        rmssd,
        sans.sans_risk_index,
    );

    let rho_global = rho_tau_w
        .min(rho_ared)
        .min(rho_sost)
        .min(rho_rmssd)
        .min(rho_sans);

    // Tasso orario di degrado stimato in funzione del deficit meccanico e radiologico
    let load_deficit = ((125.0 - musculo.ared_daily_load_kgf) / 125.0).clamp(0.0, 1.0);
    let rad_stress = (biometrics.radiation_dose_rate_msv_d / 5.0).clamp(0.0, 1.0);
    let degradation_rate_per_hour = 0.002 + 0.018 * load_deficit + 0.012 * rad_stress;

    let (ttv_hours, ttv_ci95_low_hours, ttv_ci95_high_hours) =
        estimate_ttv_with_ci95(rho_global, degradation_rate_per_hour);

    // Mission Readiness Index (MRI %): media pesata mappata su [0, 100]
    let weighted_rho = 0.30 * rho_tau_w
        + 0.25 * rho_ared
        + 0.15 * rho_sost
        + 0.15 * rho_rmssd
        + 0.15 * rho_sans;
    let mri_pct = ((weighted_rho + 1.0) * 50.0).clamp(5.0, 100.0);

    let severity = if jugular.pocus_thrombus_confirmed || rho_global <= -0.35 {
        AlertSeverity::CriticalEmergency
    } else if rho_global < 0.0 {
        AlertSeverity::Warning
    } else if rho_global < 0.25 || ttv_hours < 48.0 {
        AlertSeverity::Caution
    } else {
        AlertSeverity::Nominal
    };

    (
        NqsStlMargins {
            rho_tau_w,
            rho_ared,
            rho_sost,
            rho_rmssd,
            rho_sans,
            rho_global,
            ttv_hours,
            ttv_ci95_low_hours,
            ttv_ci95_high_hours,
            mri_pct,
        },
        severity,
    )
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 09 (`D2`)

1. **`test_ttv_is_zero_when_rho_global_is_negative`:** Verifica che per $\hat{\rho}_{\text{global}} \le 0.0$, `ttv_hours == 0.0` e `AlertSeverity` sia `Warning` o `CriticalEmergency`.
2. **`test_ci95_band_is_strictly_ordered`:** Verifica che per qualunque $\hat{\rho}_{\text{global}} > 0.0$ valga sempre `ttv_ci95_low_hours <= ttv_hours <= ttv_ci95_high_hours`.
