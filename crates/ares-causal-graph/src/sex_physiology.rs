//! Sex-differentiated aerospace physiology, anthropometry, CKD-EPI 2021 eGFR,
//! and NSCR-2022 sex/age REID radiosensitivity scaling.

use ares_core_types::constants::sanitize_f64;
use ares_core_types::medical_360::{BiologicalSex, CrewBiologicalProfile};
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

/// Reference female baseline hematocrit (%) when no individual baseline is recorded.
pub const FEMALE_DEFAULT_HCT_PCT: f64 = 39.0;
/// Reference male baseline hematocrit (%) when no individual baseline is recorded.
pub const MALE_DEFAULT_HCT_PCT: f64 = 44.0;
/// Reference female baseline hemoglobin (g/dL) when no individual baseline is recorded.
pub const FEMALE_DEFAULT_HB_G_DL: f64 = 13.0;
/// Reference male baseline hemoglobin (g/dL) when no individual baseline is recorded.
pub const MALE_DEFAULT_HB_G_DL: f64 = 15.0;

/// Returns sex-calibrated baseline hematocrit (%) or the crew member's individual baseline.
#[inline]
pub fn effective_baseline_hct_pct(profile: &CrewBiologicalProfile) -> f64 {
    profile.effective_baseline_hct_pct()
}

/// Returns sex-calibrated baseline hemoglobin (g/dL) or the crew member's individual baseline.
#[inline]
pub fn effective_baseline_hb_g_dl(profile: &CrewBiologicalProfile) -> f64 {
    profile.effective_baseline_hb_g_dl()
}

/// DuBois body surface area (m^2): `0.007184 * mass_kg^0.425 * height_cm^0.725`.
#[inline]
pub fn bsa_dubois_m2(profile: &CrewBiologicalProfile) -> f64 {
    profile.bsa_dubois_m2()
}

/// Race-free CKD-EPI 2021 estimated glomerular filtration rate (mL/min/1.73m^2).
///
/// Equation:
/// `142 * min(Scr/kappa, 1)^alpha * max(Scr/kappa, 1)^(-1.200) * 0.9938^Age * [1.012 if Female]`
/// with `kappa = 0.7` (Female) / `0.9` (Male) and `alpha = -0.241` (Female) / `-0.302` (Male).
#[inline]
pub fn estimated_egfr_ckd_epi_2021(
    profile: &CrewBiologicalProfile,
    creatinine_mg_dl: f64,
) -> f64 {
    let scr = sanitize_f64(creatinine_mg_dl, 1.0).clamp(0.2, 20.0);
    let age = sanitize_f64(profile.age_years, 38.0).clamp(18.0, 100.0);

    let (kappa, alpha, sex_factor) = match profile.biological_sex {
        BiologicalSex::Female => (0.7, -0.241, 1.012),
        BiologicalSex::Male => (0.9, -0.302, 1.0),
    };

    let ratio = scr / kappa;
    let egfr = 142.0
        * ratio.min(1.0).powf(alpha)
        * ratio.max(1.0).powf(-1.200)
        * 0.9938_f64.powf(age)
        * sex_factor;

    sanitize_f64(egfr, 90.0).clamp(2.0, 200.0)
}

/// Literature-calibrated NSCR-2022 sex- and age-dependent REID radiosensitivity multiplier.
///
/// Calibrated so a 35-year-old `Female` at `600.0 mSv` maps to the NASA-STD-3001 `[V1 3009]`
/// `~3.0%` mean REID benchmark (`multiplier = 1.00`), while an age-matched `Male` scales by `0.72`
/// reflecting excess female breast, lung, and ovarian radiogenic risk.
#[inline]
pub fn compute_sex_age_reid_multiplier(sex: BiologicalSex, age_at_exposure_years: f64) -> f64 {
    let age = sanitize_f64(age_at_exposure_years, 35.0).clamp(20.0, 75.0);
    let age_factor = (1.0 - 0.012 * (age - 35.0)).clamp(0.55, 1.35);
    let sex_factor = match sex {
        BiologicalSex::Female => 1.00,
        BiologicalSex::Male => 0.72,
    };
    sanitize_f64(sex_factor * age_factor, 1.0).clamp(0.35, 1.50)
}

/// Consolidated sex-differentiated physiological baseline summary with explicit epistemic status.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SexPhysiologySummary {
    pub biological_sex: BiologicalSex,
    pub effective_hct_pct: f64,
    pub effective_hb_g_dl: f64,
    pub bsa_m2: f64,
    pub estimated_egfr_ml_min: f64,
    pub reid_multiplier: f64,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates sex-calibrated hematology, BSA, CKD-EPI 2021 eGFR, and REID radiosensitivity.
pub fn evaluate_sex_physiology(
    profile: &CrewBiologicalProfile,
    creatinine_mg_dl: f64,
) -> SexPhysiologySummary {
    SexPhysiologySummary {
        biological_sex: profile.biological_sex,
        effective_hct_pct: effective_baseline_hct_pct(profile),
        effective_hb_g_dl: effective_baseline_hb_g_dl(profile),
        bsa_m2: bsa_dubois_m2(profile),
        estimated_egfr_ml_min: estimated_egfr_ckd_epi_2021(profile, creatinine_mg_dl),
        reid_multiplier: compute_sex_age_reid_multiplier(
            profile.biological_sex,
            profile.age_years,
        ),
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_effective_baselines_match_male_and_female_defaults() {
        let male = CrewBiologicalProfile::default();
        assert_eq!(effective_baseline_hct_pct(&male), MALE_DEFAULT_HCT_PCT);
        assert_eq!(effective_baseline_hb_g_dl(&male), MALE_DEFAULT_HB_G_DL);

        let female = CrewBiologicalProfile::female_default();
        assert_eq!(effective_baseline_hct_pct(&female), FEMALE_DEFAULT_HCT_PCT);
        assert_eq!(effective_baseline_hb_g_dl(&female), FEMALE_DEFAULT_HB_G_DL);

        let custom = CrewBiologicalProfile {
            baseline_hematocrit_pct: Some(41.5),
            baseline_hemoglobin_g_dl: Some(13.8),
            ..CrewBiologicalProfile::female_default()
        };
        assert_eq!(effective_baseline_hct_pct(&custom), 41.5);
        assert_eq!(effective_baseline_hb_g_dl(&custom), 13.8);
    }

    #[test]
    fn test_bsa_dubois_m2_physiological_range() {
        let male = CrewBiologicalProfile::default();
        let female = CrewBiologicalProfile::female_default();
        let bsa_m = bsa_dubois_m2(&male);
        let bsa_f = bsa_dubois_m2(&female);

        assert!((bsa_m - 1.926).abs() < 0.02, "male BSA={bsa_m}");
        assert!((bsa_f - 1.682).abs() < 0.02, "female BSA={bsa_f}");
        assert!(bsa_m > bsa_f);
    }

    #[test]
    fn test_ckd_epi_2021_egfr_sex_and_creatinine_response() {
        let male = CrewBiologicalProfile {
            age_years: 40.0,
            ..CrewBiologicalProfile::default()
        };
        let female = CrewBiologicalProfile {
            age_years: 40.0,
            ..CrewBiologicalProfile::female_default()
        };

        let egfr_m_normal = estimated_egfr_ckd_epi_2021(&male, 0.9);
        let egfr_f_normal = estimated_egfr_ckd_epi_2021(&female, 0.7);
        assert!(egfr_m_normal > 90.0 && egfr_m_normal < 130.0);
        assert!(egfr_f_normal > 90.0 && egfr_f_normal < 130.0);

        let egfr_f_aki = estimated_egfr_ckd_epi_2021(&female, 2.5);
        assert!(egfr_f_aki < 35.0, "expected AKI eGFR < 35, got {egfr_f_aki}");
    }

    #[test]
    fn test_reid_multiplier_calibration_and_validation_status() {
        let f_35 = compute_sex_age_reid_multiplier(BiologicalSex::Female, 35.0);
        let m_35 = compute_sex_age_reid_multiplier(BiologicalSex::Male, 35.0);
        assert!((f_35 - 1.00).abs() < 1e-9);
        assert!((m_35 - 0.72).abs() < 1e-9);
        assert!(f_35 > m_35);

        let f_55 = compute_sex_age_reid_multiplier(BiologicalSex::Female, 55.0);
        assert!(f_55 < f_35);

        let summary = evaluate_sex_physiology(&CrewBiologicalProfile::female_default(), 0.8);
        assert_eq!(
            summary.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
    }
}
