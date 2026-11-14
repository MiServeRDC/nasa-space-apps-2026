//! Modulo di dinamica del volume plasmatico, viscosita ematica variabile ed emolisi spaziale MARROW (Gap 2).

use ares_core_types::constants::{
    BLOOD_VISCOSITY_POISE, SHOCK_INDEX_ATTENTION, SHOCK_INDEX_CRITICAL, sanitize_f64,
};
use ares_core_types::telemetry::{OrthostaticFluid, SpotPoctPanel};

/// Viscosita cinematica/dinamica del plasma umano a 37°C in Poise.
pub const PLASMA_MU_POISE: f64 = 0.012;

/// Coefficiente esponenziale empirico di concentrazione eritrocitaria (Rand et al. 1964).
pub const ALPHA_HCT: f64 = 0.023;

/// Baseline ematocrito ed emoglobina pre-volo nominali standard.
pub const HCT_BASELINE_PCT: f64 = 44.0;
pub const HB_BASELINE_G_DL: f64 = 15.0;

/// Calcola la viscosita apparente del sangue intero mu(Hct) in Poise.
/// In assenza di ematocrito noto, ripiega deterministicamente sul default clinico di 0.035 Poise.
#[inline]
pub fn compute_apparent_blood_viscosity_poise(hematocrit_pct: Option<f64>) -> f64 {
    match hematocrit_pct {
        Some(hct) if hct.is_finite() && hct > 10.0 && hct < 75.0 => {
            let mu = PLASMA_MU_POISE * (ALPHA_HCT * hct).exp();
            sanitize_f64(mu, BLOOD_VISCOSITY_POISE).clamp(0.020, 0.065)
        }
        _ => BLOOD_VISCOSITY_POISE,
    }
}

/// Calcola la variazione percentuale del volume plasmatico (Delta PV %) secondo il riflesso di Gauer-Henry,
/// l'emolisi da microgravita MARROW (+54%) o formula di Dill & Costill da POCT.
#[inline]
pub fn compute_plasma_volume_delta_pct(
    flight_day: u32,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
) -> f64 {
    // Se sono disponibili Hb e Hct misurati da POCT, applica la formula esatta di Dill & Costill (1974)
    if let Some(panel) = poct
        && let (Some(hct_post), Some(hb_post)) = (panel.hematocrit_pct, panel.hemoglobin_g_dl)
        && hct_post.is_finite() && hb_post.is_finite() && hb_post > 5.0 && hct_post > 15.0
    {
        let ratio_hb = HB_BASELINE_G_DL / hb_post;
        let ratio_cells = (1.0 - (hct_post / 100.0)) / (1.0 - (HCT_BASELINE_PCT / 100.0));
        let delta_measured = 100.0 * (ratio_hb * ratio_cells - 1.0);
        return sanitize_f64(delta_measured, -12.0).clamp(-30.0, 15.0);
    }

    // Altrimenti applica il modello cinetico Gauer-Henry esponenziale
    let fd = flight_day as f64;
    let gauer_henry_contraction = -13.5 * (1.0 - (-fd / 3.0).exp());
    let fluid_load_restoration = if pre_landing_fluid_load_completed {
        9.5
    } else {
        0.0
    };
    (gauer_henry_contraction + fluid_load_restoration).clamp(-25.0, 10.0)
}

/// Calcola l'ematocrito effettivo (Hct %), considerando l'emolisi cronica MARROW (+54% distruzione RBC).
#[inline]
pub fn compute_effective_hematocrit_pct(flight_day: u32, poct: Option<&SpotPoctPanel>) -> f64 {
    if let Some(panel) = poct
        && let Some(hct) = panel.hematocrit_pct
        && hct.is_finite() && hct > 15.0
    {
        return hct.clamp(20.0, 65.0);
    }
    let fd = (flight_day as f64).min(250.0);
    // Emolisi spaziale MARROW (Trudel et al. 2022 Nature Medicine): -0.025% per Sol di volo
    let hemolysis_drift = -0.025 * fd;
    (HCT_BASELINE_PCT + hemolysis_drift).clamp(32.0, 52.0)
}

/// Calcola lo Shock Index (HR / SBP).
#[inline]
pub fn compute_shock_index(hr_bpm: Option<f64>, sbp_mmhg: Option<f64>) -> Option<f64> {
    match (hr_bpm, sbp_mmhg) {
        (Some(hr), Some(sbp)) if hr.is_finite() && sbp.is_finite() && sbp > 30.0 => {
            Some((hr / sbp).clamp(0.2, 3.5))
        }
        _ => None,
    }
}

/// Calcola lo stato ortostatico e di volemia completo `OrthostaticFluid`.
pub fn compute_orthostatic_fluid_state(
    flight_day: u32,
    hr_bpm: Option<f64>,
    sbp_mmhg: Option<f64>,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
) -> OrthostaticFluid {
    let delta_pv = compute_plasma_volume_delta_pct(flight_day, pre_landing_fluid_load_completed, poct);
    let hct = compute_effective_hematocrit_pct(flight_day, poct);
    let apparent_viscosity = compute_apparent_blood_viscosity_poise(Some(hct));
    let shock_index = compute_shock_index(hr_bpm, sbp_mmhg).unwrap_or(0.68);

    // Rischio collasso ortostatico (0..100%)
    let mut collapse_risk = (-delta_pv * 2.5).max(5.0);
    if shock_index >= SHOCK_INDEX_CRITICAL {
        collapse_risk = collapse_risk.max(85.0);
    } else if shock_index >= SHOCK_INDEX_ATTENTION {
        collapse_risk = collapse_risk.max(55.0);
    }
    if pre_landing_fluid_load_completed {
        collapse_risk = (collapse_risk - 35.0).max(8.0);
    }

    OrthostaticFluid {
        plasma_volume_delta_pct: delta_pv,
        apparent_blood_viscosity_poise: apparent_viscosity,
        hematocrit_pct: hct,
        shock_index,
        orthostatic_collapse_risk_pct: collapse_risk.clamp(0.0, 100.0),
        pre_landing_fluid_load_completed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_viscosity_scales_with_hematocrit() {
        let mu_anemia = compute_apparent_blood_viscosity_poise(Some(35.0));
        let mu_nominal = compute_apparent_blood_viscosity_poise(Some(45.0));
        let mu_polycythemia = compute_apparent_blood_viscosity_poise(Some(55.0));

        assert!(mu_anemia < mu_nominal);
        assert!(mu_nominal < mu_polycythemia);

        // Fallback on None
        assert_eq!(compute_apparent_blood_viscosity_poise(None), BLOOD_VISCOSITY_POISE);
    }

    #[test]
    fn test_fluid_loading_reduces_collapse_risk() {
        let unconditioned = compute_orthostatic_fluid_state(180, Some(110.0), Some(95.0), false, None);
        let conditioned = compute_orthostatic_fluid_state(180, Some(110.0), Some(95.0), true, None);

        assert!(unconditioned.plasma_volume_delta_pct < conditioned.plasma_volume_delta_pct);
        assert!(unconditioned.orthostatic_collapse_risk_pct > conditioned.orthostatic_collapse_risk_pct);
    }
}
