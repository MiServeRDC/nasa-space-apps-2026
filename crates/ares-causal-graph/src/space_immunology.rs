//! Neuro-endocrine dysregulation and viral reactivation risk (VZV / EBV / CMV) in spaceflight module (Gap 4).

use ares_core_types::constants::sanitize_f64;
use ares_core_types::medical_360::RadiationArsState;
use ares_core_types::telemetry::{NeuroImmuneViral, SpotPoctPanel};

/// Astronaut immunocompetence state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImmuneReactivationStage {
    LatentDormant,
    AllodynamicVulnerability,
    SubclinicalSheddingLikely,
    ActiveReactivationClinical,
}

/// Computes the composite neuro-endocrine stress index (0.0..1.0)
/// integrating cortisol, POCT samples, and vagal HRV expression.
#[inline]
pub fn compute_neuroendocrine_stress_score(
    rmssd_ms: Option<f64>,
    poct: Option<&SpotPoctPanel>,
    sleep_pressure_s: f64,
) -> f64 {
    let vagal_suppression = match rmssd_ms {
        Some(rmssd) if rmssd.is_finite() && rmssd > 0.0 => {
            (1.0 - rmssd / 42.0).clamp(0.0, 1.0)
        }
        _ => 0.50, // Fallback null-honesty on unmeasured HRV
    };

    let cortisol_factor = if let Some(panel) = poct
        && let Some(cort) = panel.salivary_cortisol_nmol_l
        && cort.is_finite()
    {
        ((cort - 8.0) / 22.0).clamp(0.0, 1.0)
    } else {
        0.30 * sleep_pressure_s
    };

    let nlr_factor = if let Some(panel) = poct
        && let Some(nlr) = panel.neutrophil_lymphocyte_ratio
        && nlr.is_finite()
    {
        ((nlr - 2.50) / 4.00).clamp(0.0, 1.0)
    } else {
        0.10
    };

    (0.40 * vagal_suppression + 0.35 * cortisol_factor + 0.25 * nlr_factor).clamp(0.05, 1.0)
}

/// Computes the Th1/Th2 cytokine balance (Crucian et al. 2018).
/// In nominal flight Th1/Th2 = 1.0; with immune dysfunction it drops to 0.25 (Th2 predominance).
#[inline]
pub fn compute_th1_th2_balance(stress_score: f64, rad_load_factor: f64) -> f64 {
    let depression = (0.55 * stress_score + 0.45 * rad_load_factor).clamp(0.0, 0.90);
    (1.0 - depression).clamp(0.10, 1.20)
}

/// Computes the viral reactivation probability (VZV / EBV / CMV) as a percentage (0..100%).
#[inline]
pub fn compute_viral_reactivation_risk_pct(
    stress_score: f64,
    th1_th2_ratio: f64,
    radiation_dose_rate_msv_d: f64,
    poct: Option<&SpotPoctPanel>,
) -> f64 {
    let rad_stress = (radiation_dose_rate_msv_d / 3.0).clamp(0.0, 1.0);
    let th2_shift_penalty = (1.0 - th1_th2_ratio).max(0.0);

    let mut risk_pct = (0.45 * stress_score + 0.35 * th2_shift_penalty + 0.20 * rad_stress) * 100.0;

    // Direct biological finding from salivary POCT qPCR (> 100 copies/mL)
    if let Some(panel) = poct
        && let Some(copies) = panel.viral_reactivation_copies_ml
        && copies > 100.0
    {
        risk_pct = (risk_pct + 35.0).min(98.0);
    }

    risk_pct.clamp(5.0, 99.0)
}

/// Generates the complete `NeuroImmuneViral` telemetry.
pub fn compute_neuro_immune_viral_state(
    rmssd_ms: Option<f64>,
    radiation_dose_rate_msv_d: f64,
    sleep_pressure_s: f64,
    poct: Option<&SpotPoctPanel>,
    containment_active: bool,
) -> NeuroImmuneViral {
    let stress = compute_neuroendocrine_stress_score(rmssd_ms, poct, sleep_pressure_s);
    let rad_load = (radiation_dose_rate_msv_d / 5.0).clamp(0.0, 1.0);
    let th1_th2 = compute_th1_th2_balance(stress, rad_load);
    let risk_pct = compute_viral_reactivation_risk_pct(stress, th1_th2, radiation_dose_rate_msv_d, poct);

    let shedding_suspected = risk_pct >= 60.0;

    NeuroImmuneViral {
        neuroendocrine_stress_score: stress,
        th1_th2_cytokine_ratio: th1_th2,
        viral_reactivation_risk_pct: risk_pct,
        vzv_ebv_active_shedding_suspected: shedding_suspected,
        infection_containment_active: containment_active,
    }
}

/// Couples radiation BFO/lymphocyte and myeloid suppression (`RadiationArsState`)
/// into the neuro-endocrine-immune viral reactivation model.
pub fn compute_radiation_coupled_immune_state(
    rmssd_ms: Option<f64>,
    radiation_dose_rate_msv_d: f64,
    sleep_pressure_s: f64,
    poct: Option<&SpotPoctPanel>,
    containment_active: bool,
    ars: Option<&RadiationArsState>,
) -> NeuroImmuneViral {
    let stress = compute_neuroendocrine_stress_score(rmssd_ms, poct, sleep_pressure_s);
    let rate_load = (sanitize_f64(radiation_dose_rate_msv_d, 0.0) / 5.0).clamp(0.0, 1.0);

    let (bfo_gy, severe_neutropenia, febrile_emergency) = match ars {
        Some(rad) => (
            sanitize_f64(rad.estimated_acute_bfo_dose_gy, 0.0).max(0.0),
            rad.severe_neutropenia,
            rad.febrile_neutropenia_emergency,
        ),
        None => (0.0, false, false),
    };

    let acute_bfo_load = (bfo_gy / 2.0).clamp(0.0, 1.0);
    let effective_rad_load = rate_load.max(acute_bfo_load);
    let th1_th2 = compute_th1_th2_balance(stress, effective_rad_load);

    let mut risk_pct =
        compute_viral_reactivation_risk_pct(stress, th1_th2, radiation_dose_rate_msv_d, poct);
    if bfo_gy >= 0.25 {
        risk_pct += (bfo_gy * 12.0).min(30.0);
    }
    if severe_neutropenia {
        risk_pct += 15.0;
    }
    let risk_pct = risk_pct.clamp(5.0, 99.0);

    let shedding_suspected = risk_pct >= 60.0 || severe_neutropenia;
    let effective_containment = containment_active || febrile_emergency;

    NeuroImmuneViral {
        neuroendocrine_stress_score: stress,
        th1_th2_cytokine_ratio: th1_th2,
        viral_reactivation_risk_pct: risk_pct,
        vzv_ebv_active_shedding_suspected: shedding_suspected,
        infection_containment_active: effective_containment,
    }
}

/// Classifies the operational `ImmuneReactivationStage` from immune telemetry and ARS state.
#[inline]
pub fn classify_immune_reactivation_stage(
    state: &NeuroImmuneViral,
    ars: Option<&RadiationArsState>,
) -> ImmuneReactivationStage {
    let ars_severe = ars.is_some_and(|rad| rad.severe_neutropenia || rad.febrile_neutropenia_emergency);
    if ars_severe || (state.vzv_ebv_active_shedding_suspected && state.viral_reactivation_risk_pct >= 75.0) {
        ImmuneReactivationStage::ActiveReactivationClinical
    } else if state.vzv_ebv_active_shedding_suspected || state.viral_reactivation_risk_pct >= 60.0 {
        ImmuneReactivationStage::SubclinicalSheddingLikely
    } else if state.th1_th2_cytokine_ratio < 0.65 || state.neuroendocrine_stress_score >= 0.45 {
        ImmuneReactivationStage::AllodynamicVulnerability
    } else {
        ImmuneReactivationStage::LatentDormant
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::radiation_ars::evaluate_radiation_ars;
    use ares_core_types::medical_360::RadiationArsInput;

    #[test]
    fn test_immune_risk_scales_with_stress_and_poct() {
        let nominal = compute_neuro_immune_viral_state(Some(45.0), 0.45, 0.20, None, false);
        assert!(!nominal.vzv_ebv_active_shedding_suspected);
        assert!(nominal.viral_reactivation_risk_pct < 60.0);

        let stressed_panel = SpotPoctPanel {
            salivary_cortisol_nmol_l: Some(28.0),
            neutrophil_lymphocyte_ratio: Some(4.8),
            viral_reactivation_copies_ml: Some(250.0),
            ..SpotPoctPanel::default()
        };
        let compromised = compute_neuro_immune_viral_state(Some(18.0), 1.8, 0.85, Some(&stressed_panel), false);
        assert!(compromised.vzv_ebv_active_shedding_suspected);
        assert!(compromised.viral_reactivation_risk_pct > 70.0);
    }

    #[test]
    fn test_radiation_ars_coupling_suppresses_th1_th2_and_triggers_containment() {
        let ars_input = RadiationArsInput {
            alc_t_k_ul: Some(0.95),
            alc_hours_post_spe: Some(24.0),
            alc_baseline_k_ul: Some(2.1),
            emesis_onset_hours_post_spe: None,
            days_post_spe: 12.6,
            cumulative_mission_dose_msv: 420.0,
            core_temp_c: Some(38.3),
        };
        let ars_state = evaluate_radiation_ars(&ars_input, 1.0, None, None);
        assert!(ars_state.severe_neutropenia);
        assert!(ars_state.febrile_neutropenia_emergency);

        let baseline = compute_radiation_coupled_immune_state(Some(45.0), 0.45, 0.20, None, false, None);
        let coupled = compute_radiation_coupled_immune_state(
            Some(45.0),
            0.45,
            0.20,
            None,
            false,
            Some(&ars_state),
        );

        assert!(coupled.th1_th2_cytokine_ratio < baseline.th1_th2_cytokine_ratio);
        assert!(coupled.viral_reactivation_risk_pct > baseline.viral_reactivation_risk_pct);
        assert!(coupled.vzv_ebv_active_shedding_suspected);
        assert!(coupled.infection_containment_active);
        assert_eq!(
            classify_immune_reactivation_stage(&coupled, Some(&ars_state)),
            ImmuneReactivationStage::ActiveReactivationClinical
        );
    }
}
