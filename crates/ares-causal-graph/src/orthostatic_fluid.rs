//! Plasma volume dynamics, variable blood viscosity, and MARROW spaceflight hemolysis module (Gap 2).

use ares_core_types::constants::{
    BLOOD_VISCOSITY_POISE, SHOCK_INDEX_ATTENTION, SHOCK_INDEX_CRITICAL, sanitize_f64,
};
use ares_core_types::medical_360::{BiologicalSex, CrewBiologicalProfile};
use ares_core_types::telemetry::{ModelValidationStatus, OrthostaticFluid, SpotPoctPanel};
use serde::{Deserialize, Serialize};

/// Sex-calibrated post-flight / 0.38g orthostatic susceptibility multiplier
/// (Waters et al. 2002, Harm et al. 2001).
pub const MALE_ORTHOSTATIC_SUSCEPTIBILITY_FACTOR: f64 = 1.00;
pub const FEMALE_ORTHOSTATIC_SUSCEPTIBILITY_FACTOR: f64 = 1.22;

/// Kinematic/dynamic viscosity of human plasma at 37°C in Poise.
pub const PLASMA_MU_POISE: f64 = 0.012;

/// Empirical exponential coefficient of erythrocyte concentration (Rand et al. 1964).
pub const ALPHA_HCT: f64 = 0.023;

/// Standard nominal pre-flight hematocrit and hemoglobin baseline.
pub const HCT_BASELINE_PCT: f64 = 44.0;
pub const HB_BASELINE_G_DL: f64 = 15.0;

/// Computes the apparent whole-blood viscosity mu(Hct) in Poise.
/// In the absence of a known hematocrit, deterministically falls back to the clinical default of 0.035 Poise.
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

/// Computes the percentage change in plasma volume (Delta PV %) according to the Gauer-Henry reflex,
/// MARROW microgravity hemolysis (+54%) or the Dill & Costill formula from POCT, calibrated on the biological profile.
#[inline]
pub fn compute_plasma_volume_delta_pct_for_profile(
    flight_day: u32,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
) -> f64 {
    let hb_0 = profile.effective_baseline_hb_g_dl();
    let hct_0 = profile.effective_baseline_hct_pct();

    // If measured Hb and Hct from POCT are available, apply the exact Dill & Costill (1974) formula
    if let Some(panel) = poct
        && let (Some(hct_post), Some(hb_post)) = (panel.hematocrit_pct, panel.hemoglobin_g_dl)
        && hct_post.is_finite()
        && hb_post.is_finite()
        && hb_post > 5.0
        && hct_post > 15.0
        && hct_0 < 99.0
    {
        let ratio_hb = hb_0 / hb_post;
        let ratio_cells = (1.0 - (hct_post / 100.0)) / (1.0 - (hct_0 / 100.0));
        let delta_measured = 100.0 * (ratio_hb * ratio_cells - 1.0);
        return sanitize_f64(delta_measured, -12.0).clamp(-30.0, 15.0);
    }

    // Otherwise apply the exponential Gauer-Henry kinetic model
    let fd = flight_day as f64;
    let gauer_henry_contraction = -13.5 * (1.0 - (-fd / 3.0).exp());
    let fluid_load_restoration = if pre_landing_fluid_load_completed {
        9.5
    } else {
        0.0
    };
    (gauer_henry_contraction + fluid_load_restoration).clamp(-25.0, 10.0)
}

/// Computes the percentage change in plasma volume (Delta PV %) according to the Gauer-Henry reflex,
/// l'emolisi da microgravita MARROW (+54%) o formula di Dill & Costill da POCT.
#[inline]
pub fn compute_plasma_volume_delta_pct(
    flight_day: u32,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
) -> f64 {
    compute_plasma_volume_delta_pct_for_profile(
        flight_day,
        pre_landing_fluid_load_completed,
        poct,
        &CrewBiologicalProfile::default(),
    )
}

/// Computes the effective hematocrit (Hct %) calibrated on the biological profile, accounting for chronic MARROW hemolysis.
#[inline]
pub fn compute_effective_hematocrit_pct_for_profile(
    flight_day: u32,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
) -> f64 {
    if let Some(panel) = poct
        && let Some(hct) = panel.hematocrit_pct
        && hct.is_finite()
        && hct > 15.0
    {
        return hct.clamp(20.0, 65.0);
    }
    let fd = (flight_day as f64).min(250.0);
    // MARROW spaceflight hemolysis (Trudel et al. 2022 Nature Medicine): -0.025% per flight Sol
    let hemolysis_drift = -0.025 * fd;
    (profile.effective_baseline_hct_pct() + hemolysis_drift).clamp(30.0, 52.0)
}

/// Computes the effective hematocrit (Hct %), accounting for chronic MARROW hemolysis (+54% RBC destruction).
#[inline]
pub fn compute_effective_hematocrit_pct(flight_day: u32, poct: Option<&SpotPoctPanel>) -> f64 {
    compute_effective_hematocrit_pct_for_profile(
        flight_day,
        poct,
        &CrewBiologicalProfile::default(),
    )
}

/// Computes the Shock Index (HR / SBP).
#[inline]
pub fn compute_shock_index(hr_bpm: Option<f64>, sbp_mmhg: Option<f64>) -> Option<f64> {
    match (hr_bpm, sbp_mmhg) {
        (Some(hr), Some(sbp)) if hr.is_finite() && sbp.is_finite() && sbp > 30.0 => {
            Some((hr / sbp).clamp(0.2, 3.5))
        }
        _ => None,
    }
}

/// Returns the sex-specific post-flight / 0.38g orthostatic susceptibility factor.
#[inline]
pub const fn orthostatic_susceptibility_factor(sex: BiologicalSex) -> f64 {
    match sex {
        BiologicalSex::Male => MALE_ORTHOSTATIC_SUSCEPTIBILITY_FACTOR,
        BiologicalSex::Female => FEMALE_ORTHOSTATIC_SUSCEPTIBILITY_FACTOR,
    }
}

/// Computes the complete orthostatic and volemic state `OrthostaticFluid` for a specific biological profile.
pub fn compute_orthostatic_fluid_state_for_profile(
    flight_day: u32,
    hr_bpm: Option<f64>,
    sbp_mmhg: Option<f64>,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
) -> OrthostaticFluid {
    let delta_pv = compute_plasma_volume_delta_pct_for_profile(
        flight_day,
        pre_landing_fluid_load_completed,
        poct,
        profile,
    );
    let hct = compute_effective_hematocrit_pct_for_profile(flight_day, poct, profile);
    let apparent_viscosity = compute_apparent_blood_viscosity_poise(Some(hct));
    let shock_index = compute_shock_index(hr_bpm, sbp_mmhg).unwrap_or(0.68);
    let susceptibility = orthostatic_susceptibility_factor(profile.biological_sex);

    // Orthostatic collapse risk (0..100%)
    let mut collapse_risk = (-delta_pv * 2.5).max(5.0);
    if shock_index >= SHOCK_INDEX_CRITICAL {
        collapse_risk = collapse_risk.max(85.0);
    } else if shock_index >= SHOCK_INDEX_ATTENTION {
        collapse_risk = collapse_risk.max(55.0);
    }
    if pre_landing_fluid_load_completed {
        collapse_risk = (collapse_risk - 35.0).max(8.0);
    }
    collapse_risk *= susceptibility;

    OrthostaticFluid {
        plasma_volume_delta_pct: delta_pv,
        apparent_blood_viscosity_poise: apparent_viscosity,
        hematocrit_pct: hct,
        shock_index,
        orthostatic_collapse_risk_pct: collapse_risk.clamp(0.0, 100.0),
        pre_landing_fluid_load_completed,
    }
}

/// Computes the complete orthostatic and volemic state `OrthostaticFluid`.
pub fn compute_orthostatic_fluid_state(
    flight_day: u32,
    hr_bpm: Option<f64>,
    sbp_mmhg: Option<f64>,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
) -> OrthostaticFluid {
    compute_orthostatic_fluid_state_for_profile(
        flight_day,
        hr_bpm,
        sbp_mmhg,
        pre_landing_fluid_load_completed,
        poct,
        &CrewBiologicalProfile::default(),
    )
}

/// Profile-aware orthostatic evaluation with prophylaxis recommendation and epistemic status.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OrthostaticFluidProfileEvaluation {
    pub fluid_state: OrthostaticFluid,
    pub orthostatic_susceptibility_factor: f64,
    pub early_compression_and_salt_prophylaxis_recommended: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates fluid shift and orthostatic intolerance for a specific crew biological profile.
pub fn evaluate_fluid_shift_and_orthostasis_for_profile(
    flight_day: u32,
    hr_bpm: Option<f64>,
    sbp_mmhg: Option<f64>,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
) -> OrthostaticFluidProfileEvaluation {
    let fluid_state = compute_orthostatic_fluid_state_for_profile(
        flight_day,
        hr_bpm,
        sbp_mmhg,
        pre_landing_fluid_load_completed,
        poct,
        profile,
    );
    let susceptibility = orthostatic_susceptibility_factor(profile.biological_sex);
    let prophylaxis_threshold = match profile.biological_sex {
        BiologicalSex::Female => 25.0,
        BiologicalSex::Male => 30.0,
    };
    let early_prophylaxis = !pre_landing_fluid_load_completed
        && fluid_state.orthostatic_collapse_risk_pct >= prophylaxis_threshold;

    OrthostaticFluidProfileEvaluation {
        fluid_state,
        orthostatic_susceptibility_factor: susceptibility,
        early_compression_and_salt_prophylaxis_recommended: early_prophylaxis,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Backward-compatible fluid shift and orthostasis evaluation defaulting to `Male` profile.
pub fn evaluate_fluid_shift_and_orthostasis(
    flight_day: u32,
    hr_bpm: Option<f64>,
    sbp_mmhg: Option<f64>,
    pre_landing_fluid_load_completed: bool,
    poct: Option<&SpotPoctPanel>,
) -> OrthostaticFluidProfileEvaluation {
    evaluate_fluid_shift_and_orthostasis_for_profile(
        flight_day,
        hr_bpm,
        sbp_mmhg,
        pre_landing_fluid_load_completed,
        poct,
        &CrewBiologicalProfile::default(),
    )
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

    #[test]
    fn test_male_default_profile_is_bit_identical_to_legacy() {
        let poct = SpotPoctPanel {
            hematocrit_pct: Some(46.0),
            hemoglobin_g_dl: Some(15.8),
            ..Default::default()
        };
        let legacy = compute_orthostatic_fluid_state(120, Some(82.0), Some(118.0), false, Some(&poct));
        let profile = CrewBiologicalProfile::default();
        let for_profile = compute_orthostatic_fluid_state_for_profile(
            120,
            Some(82.0),
            Some(118.0),
            false,
            Some(&poct),
            &profile,
        );
        assert_eq!(legacy, for_profile);

        let eval_legacy =
            evaluate_fluid_shift_and_orthostasis(120, Some(82.0), Some(118.0), false, Some(&poct));
        let eval_profile = evaluate_fluid_shift_and_orthostasis_for_profile(
            120,
            Some(82.0),
            Some(118.0),
            false,
            Some(&poct),
            &profile,
        );
        assert_eq!(eval_legacy, eval_profile);
        assert_eq!(
            eval_legacy.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
    }

    #[test]
    fn test_female_dill_costill_and_orthostatic_susceptibility_multiplier() {
        let male = CrewBiologicalProfile::default();
        let female = CrewBiologicalProfile::female_default();

        // Same post-flight POCT values represent different %Delta_PV against 39%/13 vs 44%/15 baseline
        let poct = SpotPoctPanel {
            hematocrit_pct: Some(42.0),
            hemoglobin_g_dl: Some(14.2),
            ..Default::default()
        };
        let pv_male = compute_plasma_volume_delta_pct_for_profile(90, false, Some(&poct), &male);
        let pv_female = compute_plasma_volume_delta_pct_for_profile(90, false, Some(&poct), &female);
        assert!(pv_female < pv_male, "female PV={pv_female} male PV={pv_male}");

        let eval_m = evaluate_fluid_shift_and_orthostasis_for_profile(
            120,
            Some(85.0),
            Some(115.0),
            false,
            None,
            &male,
        );
        let eval_f = evaluate_fluid_shift_and_orthostasis_for_profile(
            120,
            Some(85.0),
            Some(115.0),
            false,
            None,
            &female,
        );
        assert!((eval_m.orthostatic_susceptibility_factor - 1.00).abs() < 1e-9);
        assert!((eval_f.orthostatic_susceptibility_factor - 1.22).abs() < 1e-9);
        assert!(
            eval_f.fluid_state.orthostatic_collapse_risk_pct
                > eval_m.fluid_state.orthostatic_collapse_risk_pct
        );
        assert!(eval_f.early_compression_and_salt_prophylaxis_recommended);
    }
}
