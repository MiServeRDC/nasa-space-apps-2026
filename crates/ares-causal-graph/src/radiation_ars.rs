//! SPE biodosimetry, Acute Radiation Syndrome (ARS), and hematologic nadir kinetics causal module.

use ares_core_types::constants::sanitize_f64;
use ares_core_types::medical_360::{RadiationArsInput, RadiationArsState};
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

/// NASA-STD-3001 [V1 3009] universal sex-neutral career effective dose limit (mSv).
pub const NASA_STD_3001_CAREER_EFFECTIVE_LIMIT_MSV: f64 = 600.0;

/// NASA Blood-Forming Organ (BFO) 30-day deterministic ARS threshold (mGy-Eq).
pub const NASA_BFO_30_DAY_LIMIT_MGY_EQ: f64 = 250.0;

/// Acute BFO dose threshold (Gy) for myeloid cytokine (Filgrastim / G-CSF) therapy.
pub const ARS_CYTOKINE_FILGRASTIM_DOSE_THRESHOLD_GY: f64 = 2.0;

/// Severe neutropenia Absolute Neutrophil Count (ANC) threshold (K/uL).
pub const ARS_SEVERE_NEUTROPENIA_ANC_K_UL: f64 = 0.50;

/// Platelet threshold (K/uL) below which Gate 1 (anticoagulation), Gate 5 (NSAIDs),
/// and Gate 6 (non-emergent invasive procedures) lock.
pub const ARS_PLATELET_GATE_LOCK_K_UL: f64 = 75.0;

/// Core temperature threshold (C) for febrile neutropenia emergency when ANC < 0.50 K/uL.
pub const ARS_FEBRILE_TEMP_THRESHOLD_C: f64 = 38.0;

/// Default baseline Absolute Lymphocyte Count (K/uL).
pub const ARS_DEFAULT_ALC_BASELINE_K_UL: f64 = 2.1;

/// Default baseline Absolute Neutrophil Count (K/uL).
pub const ARS_DEFAULT_ANC_BASELINE_K_UL: f64 = 4.2;

/// Default baseline Platelet count (K/uL).
pub const ARS_DEFAULT_PLT_BASELINE_K_UL: f64 = 240.0;

/// SPE flux threshold (mSv/d) requiring immediate polyethylene/water-wall storm shelter.
pub const ARS_STORM_SHELTER_FLUX_MSV_D: f64 = 10.0;

/// Playbook 26 numeric identifier (`PLAYBOOK_26_ACUTE_RADIATION_SYNDROME`).
pub const PLAYBOOK_26_ACUTE_RADIATION_SYNDROME: u16 = 26;

/// Countermeasure action identifiers for Playbook 26.
pub const ACT_ARS_STORM_SHELTER_POLYETHYLENE_WATER_WALL: &str =
    "ACT_ARS_STORM_SHELTER_POLYETHYLENE_WATER_WALL";
pub const ACT_ARS_ONDANSETRON_4MG_IV_ODT: &str = "ACT_ARS_ONDANSETRON_4MG_IV_ODT";
pub const ACT_ARS_FILGRASTIM_GCSF_5MCG_KG_SC: &str = "ACT_ARS_FILGRASTIM_GCSF_5MCG_KG_SC";
pub const ACT_ARS_FEBRILE_NEUTROPENIA_EMPIRIC_ANTIMICROBIALS: &str =
    "ACT_ARS_FEBRILE_NEUTROPENIA_EMPIRIC_ANTIMICROBIALS";

/// Safety gate signals derived from ARS hematologic nadir kinetics.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RadiationArsGateSignals {
    /// Gate 1: Contraindicates systemic anticoagulants when PLT < 75.0 K/uL.
    pub gate1_anticoagulant_contraindicated: bool,
    /// Gate 5A: Locks Ketorolac & systemic NSAIDs when PLT < 75.0 K/uL.
    pub gate5_nsaid_bleeding_locked: bool,
    /// Gate 6: Locks non-emergent invasive procedures when ANC < 0.50 K/uL or PLT < 75.0 K/uL.
    pub gate6_radiation_neutropenic_invasive_locked: bool,
    /// Career effective dose >= 600.0 mSv.
    pub career_effective_limit_exceeded: bool,
    /// Acute BFO dose >= 250.0 mGy-Eq (0.25 Gy).
    pub bfo_30_day_limit_exceeded: bool,
}

/// Full ARS evaluation including state, gate signals, and recommended countermeasures.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RadiationArsAssessment {
    pub state: RadiationArsState,
    pub gates: RadiationArsGateSignals,
    pub recommended_actions: Vec<String>,
    pub playbook_26_active: bool,
}

/// Andrews lymphocyte depletion biodosimetry (`12h <= dt <= 48h` post-SPE).
///
/// Calibrated to Goans & Waselenko (1997) / AFRRI Andrews nomogram:
/// `k_l_per_day = (alc_0 / alc_t).ln() / (t_hours / 24.0)`
/// `dose_gy = (k_l_per_day / 0.265).clamp(0.0, 10.0)`
///
/// Returns `None` if `t_hours` is outside `[12.0, 48.0]` or any input is non-finite / `<= 0.0`.
#[inline]
pub fn estimate_dose_andrews_lymphocyte_gy(
    alc_t_k_ul: f64,
    t_hours: f64,
    alc_baseline_k_ul: Option<f64>,
) -> Option<f64> {
    if !alc_t_k_ul.is_finite() || alc_t_k_ul <= 0.0 {
        return None;
    }
    if !t_hours.is_finite() || !(12.0..=48.0).contains(&t_hours) {
        return None;
    }
    let alc_0 = alc_baseline_k_ul
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(ARS_DEFAULT_ALC_BASELINE_K_UL);

    let depletion_ln = (alc_0 / alc_t_k_ul).ln().max(0.0);
    let k_l_per_day = depletion_ln / (t_hours / 24.0);
    Some((k_l_per_day / 0.265).clamp(0.0, 10.0))
}

/// Prodromal time-to-emesis biodosimetry:
/// `d_emesis_gy = 2.45 * h^(-0.71)` for `h > 0.0`.
///
/// Returns `None` if `emesis_onset_hours_post_spe` is non-finite or `<= 0.0`.
#[inline]
pub fn estimate_dose_emesis_onset_gy(emesis_onset_hours_post_spe: f64) -> Option<f64> {
    if !emesis_onset_hours_post_spe.is_finite() || emesis_onset_hours_post_spe <= 0.0 {
        return None;
    }
    Some((2.45 * emesis_onset_hours_post_spe.powf(-0.71)).clamp(0.0, 10.0))
}

/// Conservative biodosimetry fusion (`max`) between Andrews lymphocyte depletion
/// and prodromal time-to-emesis onset.
#[inline]
pub fn fuse_spe_biodosimetry_gy(input: &RadiationArsInput) -> f64 {
    let d_andrews = match (input.alc_t_k_ul, input.alc_hours_post_spe) {
        (Some(alc), Some(hours)) => {
            estimate_dose_andrews_lymphocyte_gy(alc, hours, input.alc_baseline_k_ul)
        }
        _ => None,
    };
    let d_emesis = input
        .emesis_onset_hours_post_spe
        .and_then(estimate_dose_emesis_onset_gy);

    match (d_andrews, d_emesis) {
        (Some(a), Some(e)) => a.max(e),
        (Some(a), None) => a,
        (None, Some(e)) => e,
        (None, None) => 0.0,
    }
}

/// Deterministic platelet nadir kinetics `PLT(t, D_SPE)`.
///
/// Models a 5.0-day megakaryocyte shoulder followed by dose-dependent depletion
/// to `plt_nadir = baseline_plt * (-0.58 * d_gy).exp()` at
/// `t_nadir = (22.0 - 2.2 * d_gy).clamp(8.0, 22.0)` days, then marrow recovery.
#[inline]
pub fn predicted_plt_k_ul(days_post_spe: f64, d_gy: f64, baseline_plt_k_ul: f64) -> f64 {
    let d = sanitize_f64(d_gy, 0.0).clamp(0.0, 10.0);
    let t = sanitize_f64(days_post_spe, 0.0).max(0.0);
    let base = sanitize_f64(baseline_plt_k_ul, ARS_DEFAULT_PLT_BASELINE_K_UL).max(1.0);

    if d <= 0.0 {
        return base;
    }

    let t_nadir = (22.0 - 2.2 * d).clamp(8.0, 22.0);
    let plt_nadir = base * (-0.58 * d).exp();

    if t <= 5.0 {
        base
    } else if t <= t_nadir {
        let u = ((t - 5.0) / (t_nadir - 5.0)).clamp(0.0, 1.0);
        let w = 0.5 * (1.0 - (std::f64::consts::PI * u).cos());
        base + (plt_nadir - base) * w
    } else {
        let rec_tau = 14.0 + 4.0 * d;
        let target = if d >= 6.0 { base * 0.5 } else { base };
        plt_nadir + (target - plt_nadir) * (1.0 - (-(t - t_nadir) / rec_tau).exp())
    }
}

/// Deterministic Absolute Neutrophil Count kinetics `ANC(t, D_SPE)`.
///
/// Models an abortive granulocyte spike (`days 1..3`) followed by exponential decay
/// to `anc_nadir = baseline_anc * (-0.85 * d_gy).exp()`, then myeloid recovery.
#[inline]
pub fn predicted_anc_k_ul(days_post_spe: f64, d_gy: f64, baseline_anc_k_ul: f64) -> f64 {
    let d = sanitize_f64(d_gy, 0.0).clamp(0.0, 10.0);
    let t = sanitize_f64(days_post_spe, 0.0).max(0.0);
    let base = sanitize_f64(baseline_anc_k_ul, ARS_DEFAULT_ANC_BASELINE_K_UL).max(0.1);

    if d <= 0.0 {
        return base;
    }

    let t_nadir = (18.0 - 1.8 * d).clamp(6.0, 18.0);
    let anc_nadir = base * (-0.85 * d).exp();

    if t <= 1.0 {
        base
    } else if t <= 3.0 {
        let spike_amp = 0.25 * d.min(4.0);
        let phase = std::f64::consts::PI * (t - 1.0) / 2.0;
        base * (1.0 + spike_amp * phase.sin())
    } else if t <= t_nadir {
        let u = ((t - 3.0) / (t_nadir - 3.0)).clamp(0.0, 1.0);
        base * (-0.85 * d * u).exp()
    } else {
        let rec_tau = 12.0 + 3.0 * d;
        anc_nadir + (base - anc_nadir) * (1.0 - (-(t - t_nadir) / rec_tau).exp())
    }
}

/// Evaluates `RadiationArsState` from `RadiationArsInput` and baseline parameters.
pub fn evaluate_radiation_ars(
    input: &RadiationArsInput,
    sex_age_reid_multiplier: f64,
    baseline_anc_k_ul: Option<f64>,
    baseline_plt_k_ul: Option<f64>,
) -> RadiationArsState {
    let estimated_acute_bfo_dose_gy = fuse_spe_biodosimetry_gy(input);
    let days_post_spe = sanitize_f64(input.days_post_spe, 0.0).max(0.0);
    let cumulative_mission_dose_msv = sanitize_f64(input.cumulative_mission_dose_msv, 0.0).max(0.0);
    let reid_mult = sanitize_f64(sex_age_reid_multiplier, 1.0).max(0.1);

    let base_anc = baseline_anc_k_ul
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(ARS_DEFAULT_ANC_BASELINE_K_UL);
    let base_plt = baseline_plt_k_ul
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(ARS_DEFAULT_PLT_BASELINE_K_UL);

    let anc_k_ul = predicted_anc_k_ul(days_post_spe, estimated_acute_bfo_dose_gy, base_anc);
    let plt_k_ul = predicted_plt_k_ul(days_post_spe, estimated_acute_bfo_dose_gy, base_plt);

    let severe_neutropenia = anc_k_ul < ARS_SEVERE_NEUTROPENIA_ANC_K_UL;
    let febrile_neutropenia_emergency = severe_neutropenia
        && input
            .core_temp_c
            .is_some_and(|temp| temp.is_finite() && temp >= ARS_FEBRILE_TEMP_THRESHOLD_C);
    let filgrastim_indicated = estimated_acute_bfo_dose_gy >= ARS_CYTOKINE_FILGRASTIM_DOSE_THRESHOLD_GY
        || severe_neutropenia;

    RadiationArsState {
        cumulative_mission_dose_msv,
        estimated_acute_bfo_dose_gy,
        predicted_anc_k_ul: anc_k_ul,
        predicted_plt_k_ul: plt_k_ul,
        severe_neutropenia,
        febrile_neutropenia_emergency,
        filgrastim_indicated,
        sex_age_reid_multiplier: reid_mult,
        days_post_spe,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Evaluates full ARS state, safety gate signals (Gates 1, 5A, 6), and Playbook 26 actions.
pub fn evaluate_radiation_ars_with_gates(
    input: &RadiationArsInput,
    sex_age_reid_multiplier: f64,
    radiation_flux_msv_d: f64,
    baseline_anc_k_ul: Option<f64>,
    baseline_plt_k_ul: Option<f64>,
) -> RadiationArsAssessment {
    let state = evaluate_radiation_ars(
        input,
        sex_age_reid_multiplier,
        baseline_anc_k_ul,
        baseline_plt_k_ul,
    );

    let plt_locked = state.predicted_plt_k_ul < ARS_PLATELET_GATE_LOCK_K_UL;
    let gates = RadiationArsGateSignals {
        gate1_anticoagulant_contraindicated: plt_locked,
        gate5_nsaid_bleeding_locked: plt_locked,
        gate6_radiation_neutropenic_invasive_locked: state.severe_neutropenia || plt_locked,
        career_effective_limit_exceeded: state.cumulative_mission_dose_msv
            >= NASA_STD_3001_CAREER_EFFECTIVE_LIMIT_MSV,
        bfo_30_day_limit_exceeded: (state.estimated_acute_bfo_dose_gy * 1000.0)
            >= NASA_BFO_30_DAY_LIMIT_MGY_EQ,
    };

    let mut recommended_actions = Vec::new();
    let flux = sanitize_f64(radiation_flux_msv_d, 0.0).max(0.0);
    if flux > ARS_STORM_SHELTER_FLUX_MSV_D {
        recommended_actions.push(ACT_ARS_STORM_SHELTER_POLYETHYLENE_WATER_WALL.to_string());
    }
    if input.emesis_onset_hours_post_spe.is_some_and(|h| h.is_finite() && h > 0.0) {
        recommended_actions.push(ACT_ARS_ONDANSETRON_4MG_IV_ODT.to_string());
    }
    if state.filgrastim_indicated {
        recommended_actions.push(ACT_ARS_FILGRASTIM_GCSF_5MCG_KG_SC.to_string());
    }
    if state.febrile_neutropenia_emergency {
        recommended_actions.push(ACT_ARS_FEBRILE_NEUTROPENIA_EMPIRIC_ANTIMICROBIALS.to_string());
    }

    let playbook_26_active = !recommended_actions.is_empty()
        || gates.bfo_30_day_limit_exceeded
        || gates.gate6_radiation_neutropenic_invasive_locked;

    RadiationArsAssessment {
        state,
        gates,
        recommended_actions,
        playbook_26_active,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_andrews_biodosimetry_calibration_and_window_bounds() {
        // Outside [12h, 48h] returns None
        assert!(estimate_dose_andrews_lymphocyte_gy(1.0, 11.9, None).is_none());
        assert!(estimate_dose_andrews_lymphocyte_gy(1.0, 48.1, None).is_none());
        assert!(estimate_dose_andrews_lymphocyte_gy(0.0, 24.0, None).is_none());
        assert!(estimate_dose_andrews_lymphocyte_gy(f64::NAN, 24.0, None).is_none());

        // ALC(24h) = 1.0 K/uL -> ~2.8 Gy
        let d_high = estimate_dose_andrews_lymphocyte_gy(1.0, 24.0, None);
        assert!(d_high.is_some());
        if let Some(d) = d_high {
            assert!((d - 2.80).abs() < 0.05, "d_high={d}");
        }

        // ALC(24h) = 1.55 K/uL -> ~1.15 Gy
        let d_mid = estimate_dose_andrews_lymphocyte_gy(1.55, 24.0, None);
        assert!(d_mid.is_some());
        if let Some(d) = d_mid {
            assert!((d - 1.15).abs() < 0.05, "d_mid={d}");
        }

        // No depletion (ALC >= baseline) -> 0.0 Gy
        let d_zero = estimate_dose_andrews_lymphocyte_gy(2.4, 24.0, None);
        assert_eq!(d_zero, Some(0.0));
    }

    #[test]
    fn test_emesis_biodosimetry_and_conservative_max_fusion() {
        assert!(estimate_dose_emesis_onset_gy(0.0).is_none());
        assert!(estimate_dose_emesis_onset_gy(-1.0).is_none());

        let d_1h = estimate_dose_emesis_onset_gy(1.0);
        assert!(d_1h.is_some());
        if let Some(d) = d_1h {
            assert!((d - 2.45).abs() < 1e-6);
        }

        let d_half_h = estimate_dose_emesis_onset_gy(0.5);
        assert!(d_half_h.is_some());
        if let Some(d) = d_half_h {
            assert!(d >= 4.0);
        }

        let input = RadiationArsInput {
            alc_t_k_ul: Some(1.55),
            alc_hours_post_spe: Some(24.0),
            alc_baseline_k_ul: Some(2.1),
            emesis_onset_hours_post_spe: Some(0.5),
            days_post_spe: 1.0,
            cumulative_mission_dose_msv: 150.0,
            core_temp_c: Some(37.1),
        };
        let fused = fuse_spe_biodosimetry_gy(&input);
        if let Some(d) = d_half_h {
            assert!((fused - d).abs() < 1e-6);
        }
    }

    #[test]
    fn test_platelet_nadir_feeds_gates_1_5_6() {
        // 5-day megakaryocyte shoulder preserves baseline
        let plt_day4 = predicted_plt_k_ul(4.0, 2.0, 240.0);
        assert_eq!(plt_day4, 240.0);

        // At 2.0 Gy, t_nadir = 22.0 - 4.4 = 17.6 days, plt_nadir = 75.2 K/uL
        let plt_nadir_2gy = predicted_plt_k_ul(17.6, 2.0, 240.0);
        assert!((plt_nadir_2gy - 75.2367).abs() < 0.1, "plt={plt_nadir_2gy}");

        // Above 2.05 Gy crosses < 75.0 K/uL, locking Gates 1, 5A, and 6
        let t_nadir_21gy = 22.0 - 2.2 * 2.1;
        let input = RadiationArsInput {
            alc_t_k_ul: None,
            alc_hours_post_spe: None,
            alc_baseline_k_ul: None,
            emesis_onset_hours_post_spe: Some(1.2), // ~2.15 Gy
            days_post_spe: t_nadir_21gy,
            cumulative_mission_dose_msv: 620.0,
            core_temp_c: Some(37.2),
        };
        let assessment = evaluate_radiation_ars_with_gates(&input, 1.0, 15.0, None, None);
        assert!(assessment.state.predicted_plt_k_ul < 75.0);
        assert!(assessment.gates.gate1_anticoagulant_contraindicated);
        assert!(assessment.gates.gate5_nsaid_bleeding_locked);
        assert!(assessment.gates.gate6_radiation_neutropenic_invasive_locked);
        assert!(assessment.gates.career_effective_limit_exceeded);
        assert!(assessment.gates.bfo_30_day_limit_exceeded);
        assert_eq!(
            assessment.state.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
        assert!(assessment
            .recommended_actions
            .iter()
            .any(|a| a == ACT_ARS_STORM_SHELTER_POLYETHYLENE_WATER_WALL));
        assert!(assessment
            .recommended_actions
            .iter()
            .any(|a| a == ACT_ARS_ONDANSETRON_4MG_IV_ODT));
        assert!(assessment
            .recommended_actions
            .iter()
            .any(|a| a == ACT_ARS_FILGRASTIM_GCSF_5MCG_KG_SC));
        assert!(!assessment.state.febrile_neutropenia_emergency);
    }

    #[test]
    fn test_anc_abortive_spike_and_febrile_neutropenia_emergency() {
        // Abortive granulocyte spike at day 2
        let anc_day2 = predicted_anc_k_ul(2.0, 3.0, 4.2);
        assert!(anc_day2 > 4.2, "expected abortive spike at day 2, got {anc_day2}");

        // Nadir at 3.0 Gy: t_nadir = 18.0 - 5.4 = 12.6 days, anc_nadir = 4.2 * exp(-2.55) = 0.328 K/uL
        let input = RadiationArsInput {
            alc_t_k_ul: Some(0.95),
            alc_hours_post_spe: Some(24.0),
            alc_baseline_k_ul: Some(2.1),
            emesis_onset_hours_post_spe: None,
            days_post_spe: 12.6,
            cumulative_mission_dose_msv: 400.0,
            core_temp_c: Some(38.4),
        };
        let assessment = evaluate_radiation_ars_with_gates(&input, 1.0, 0.5, None, None);
        assert!(assessment.state.predicted_anc_k_ul < ARS_SEVERE_NEUTROPENIA_ANC_K_UL);
        assert!(assessment.state.severe_neutropenia);
        assert!(assessment.state.febrile_neutropenia_emergency);
        assert!(assessment.gates.gate6_radiation_neutropenic_invasive_locked);
        assert!(assessment
            .recommended_actions
            .iter()
            .any(|a| a == ACT_ARS_FEBRILE_NEUTROPENIA_EMPIRIC_ANTIMICROBIALS));
        assert!(assessment.playbook_26_active);
    }
}
