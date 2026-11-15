#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Spaceflight ExMC pharmacology, 900-Sol radiolytic & thermal drug potency decay,
//! finite consumable inventory, and renal/sepsis causal evaluation.
//!
//! All kinetic constants remain explicitly marked [`ModelValidationStatus::IllustrativeUnvalidated`]
//! pending empirical flight-analog stability validation (Du et al. 2011; Wotring 2016).

use ares_core_types::constants::sanitize_f64;
use ares_core_types::medical_360::{
    BiologicalSex, CrewBiologicalProfile, PharmacologySepsisState,
};
use ares_core_types::telemetry::{ModelValidationStatus, SpotPoctPanel};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Minimum USP potency floor (%) below which a drug is considered subpotent.
pub const USP_POTENCY_FLOOR_PCT: f64 = 90.0;

/// Thermal decay rate per Sol for Amoxicillin-Clavulanate (illustrative, Du et al. 2011 / Wotring 2016).
pub const K_THERMAL_AMOX_CLAV_PER_SOL: f64 = 0.000_18;
/// Radiolytic decay rate per Gy for Amoxicillin-Clavulanate.
pub const K_RAD_AMOX_CLAV_PER_GY: f64 = 0.14;

/// Thermal decay rate per Sol for liquid Epinephrine.
pub const K_THERMAL_EPINEPHRINE_PER_SOL: f64 = 0.000_14;
/// Radiolytic decay rate per Gy for liquid Epinephrine.
pub const K_RAD_EPINEPHRINE_PER_GY: f64 = 0.11;

/// Thermal decay rate per Sol for lyophilized Ertapenem / Tranexamic Acid (TXA).
pub const K_THERMAL_LYOPHILIZED_PER_SOL: f64 = 0.000_04;
/// Radiolytic decay rate per Gy for lyophilized Ertapenem / Tranexamic Acid (TXA).
pub const K_RAD_LYOPHILIZED_PER_GY: f64 = 0.03;

/// Default thermal decay rate per Sol for uncalibrated liquid formulary items.
pub const K_THERMAL_DEFAULT_PER_SOL: f64 = 0.000_08;
/// Default radiolytic decay rate per Gy for uncalibrated liquid formulary items.
pub const K_RAD_DEFAULT_PER_GY: f64 = 0.06;

/// Result of evaluating 900-Sol thermal and radiolytic potency decay for a formulary item.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DrugPotencyEvaluation {
    pub drug_id: String,
    pub mission_sol: f64,
    pub cumulative_habitat_gcr_gy: f64,
    pub k_thermal_per_sol: f64,
    pub k_radiolytic_per_gy: f64,
    pub potency_pct: f64,
    pub is_subpotent: bool,
    pub lyophilized_backup_recommended: bool,
    pub validation_status: ModelValidationStatus,
}

/// Normalizes a drug identifier to uppercase ASCII with underscores for deterministic lookup.
#[inline]
pub fn normalize_drug_id(drug_id: &str) -> String {
    drug_id
        .trim()
        .to_ascii_uppercase()
        .replace(['-', ' '], "_")
}

/// Returns calibrated `(k_thermal_per_sol, k_radiolytic_per_gy)` constants for a formulary drug.
#[inline]
pub fn drug_decay_constants(drug_id: &str) -> (f64, f64) {
    let norm = normalize_drug_id(drug_id);
    if norm.contains("AMOXICILLIN") || norm.contains("CLAVULANATE") || norm.contains("AUGMENTIN") {
        (K_THERMAL_AMOX_CLAV_PER_SOL, K_RAD_AMOX_CLAV_PER_GY)
    } else if norm.contains("EPINEPHRINE") {
        (K_THERMAL_EPINEPHRINE_PER_SOL, K_RAD_EPINEPHRINE_PER_GY)
    } else if norm.contains("ERTAPENEM") || norm.contains("TXA") || norm.contains("TRANEXAMIC") {
        (K_THERMAL_LYOPHILIZED_PER_SOL, K_RAD_LYOPHILIZED_PER_GY)
    } else {
        (K_THERMAL_DEFAULT_PER_SOL, K_RAD_DEFAULT_PER_GY)
    }
}

/// Evaluates 900-Sol thermal and galactic cosmic ray (GCR) radiolytic drug potency decay:
/// `potency_pct = 100.0 * exp(-(k_thermal_per_sol * mission_sol + k_radiolytic_per_gy * cumulative_habitat_gcr_gy))`.
#[inline]
pub fn evaluate_drug_potency(
    drug_id: &str,
    mission_sol: f64,
    cumulative_habitat_gcr_gy: f64,
) -> DrugPotencyEvaluation {
    let sol = sanitize_f64(mission_sol, 0.0).max(0.0);
    let gcr_gy = sanitize_f64(cumulative_habitat_gcr_gy, 0.0).max(0.0);
    let (k_thermal_per_sol, k_radiolytic_per_gy) = drug_decay_constants(drug_id);
    let exponent = -(k_thermal_per_sol * sol + k_radiolytic_per_gy * gcr_gy);
    let potency_pct = (100.0 * exponent.exp()).clamp(0.0, 100.0);
    let is_subpotent = potency_pct < USP_POTENCY_FLOOR_PCT;

    DrugPotencyEvaluation {
        drug_id: normalize_drug_id(drug_id),
        mission_sol: sol,
        cumulative_habitat_gcr_gy: gcr_gy,
        k_thermal_per_sol,
        k_radiolytic_per_gy,
        potency_pct,
        is_subpotent,
        lyophilized_backup_recommended: is_subpotent,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Finite ExMC medical consumable inventory with deterministic unit tracking.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MedicalConsumableInventory {
    pub units: BTreeMap<String, u32>,
}

impl Default for MedicalConsumableInventory {
    fn default() -> Self {
        Self::mars_exmc_baseline()
    }
}

impl MedicalConsumableInventory {
    /// Creates an empty consumable inventory.
    pub fn new() -> Self {
        Self {
            units: BTreeMap::new(),
        }
    }

    /// Creates a baseline Mars 900-Sol ExMC medical formulary inventory.
    pub fn mars_exmc_baseline() -> Self {
        let mut units = BTreeMap::new();
        for (id, count) in [
            ("AMOXICILLIN_CLAVULANATE", 40_u32),
            ("EPINEPHRINE", 12),
            ("ERTAPENEM", 20),
            ("TXA", 16),
            ("PIPERACILLIN_TAZOBACTAM", 24),
            ("CEFEPIME", 24),
            ("CLINDAMYCIN", 20),
            ("LEVOFLOXACIN", 20),
            ("METRONIDAZOLE", 24),
            ("KETOROLAC", 15),
            ("TAMSULOSIN", 30),
            ("ACETAMINOPHEN", 100),
            ("FENTANYL", 16),
            ("NOREPINEPHRINE", 12),
            ("CRYSTALLOID_500ML", 40),
            ("MAGNESIUM_SULFATE_2G", 16),
            ("ASCORBIC_ACID_IV", 12),
            ("LORAZEPAM", 20),
            ("FILGRASTIM", 14),
            ("ONDANSETRON", 24),
            ("HALOPERIDOL", 10),
        ] {
            units.insert(id.to_string(), count);
        }
        Self { units }
    }

    /// Returns the remaining unit count for `drug_id` (0 if absent).
    #[inline]
    pub fn remaining_units(&self, drug_id: &str) -> u32 {
        let key = normalize_drug_id(drug_id);
        self.units.get(&key).copied().unwrap_or(0)
    }

    /// Returns `true` when `remaining_units(drug_id) == 0`.
    #[inline]
    pub fn is_depleted(&self, drug_id: &str) -> bool {
        self.remaining_units(drug_id) == 0
    }

    /// Sets the unit count for `drug_id`.
    #[inline]
    pub fn set_units(&mut self, drug_id: &str, count: u32) {
        self.units.insert(normalize_drug_id(drug_id), count);
    }

    /// Attempts to consume `count` units of `drug_id`, returning `true` on success.
    #[inline]
    pub fn consume_units(&mut self, drug_id: &str, count: u32) -> bool {
        let key = normalize_drug_id(drug_id);
        if let Some(existing) = self.units.get_mut(&key)
            && *existing >= count
        {
            *existing -= count;
            return true;
        }
        false
    }
}

/// Race-free CKD-EPI 2021 creatinine eGFR equation (mL/min/1.73m^2).
#[inline]
pub fn estimated_egfr_ckd_epi_2021(profile: &CrewBiologicalProfile, creatinine_mg_dl: f64) -> f64 {
    let scr = sanitize_f64(creatinine_mg_dl, 1.0).clamp(0.1, 25.0);
    let age = sanitize_f64(profile.age_years, 38.0).clamp(18.0, 100.0);
    let (kappa, alpha, sex_factor) = match profile.biological_sex {
        BiologicalSex::Female => (0.7, -0.241, 1.012),
        BiologicalSex::Male => (0.9, -0.302, 1.0),
    };
    let ratio = scr / kappa;
    142.0
        * ratio.min(1.0).powf(alpha)
        * ratio.max(1.0).powf(-1.200)
        * 0.9938_f64.powf(age)
        * sex_factor
}

/// Computes the bedside qSOFA score (`0..=3`):
/// - Respiratory rate >= 22 breaths/min (+1)
/// - Systolic BP <= 100 mmHg (+1)
/// - Altered mentation / severe fatigue index >= 0.80 (+1)
#[inline]
pub fn compute_qsofa_score(
    resp_rate_bpm: Option<f64>,
    sbp_mmhg: Option<f64>,
    altered_mentation_or_fatigue: Option<f64>,
) -> u8 {
    let rr_pt = u8::from(resp_rate_bpm.is_some_and(|rr| rr.is_finite() && rr >= 22.0));
    let sbp_pt = u8::from(sbp_mmhg.is_some_and(|sbp| sbp.is_finite() && sbp <= 100.0));
    let ment_pt =
        u8::from(altered_mentation_or_fatigue.is_some_and(|m| m.is_finite() && m >= 0.80));
    rr_pt + sbp_pt + ment_pt
}

/// Evaluates whether clinical infection criteria are present from temperature, WBC, or explicit source.
#[inline]
pub fn is_suspected_infection(
    core_temp_c: Option<f64>,
    poct: Option<&SpotPoctPanel>,
    source_identified: bool,
) -> bool {
    let temp_abnormal = core_temp_c.is_some_and(|t| t.is_finite() && !(36.0..=38.3).contains(&t));
    let wbc_abnormal = poct
        .and_then(|p| p.wbc_k_ul)
        .is_some_and(|w| w.is_finite() && !(4.0..=12.0).contains(&w));
    temp_abnormal || wbc_abnormal || source_identified
}

/// Evaluates the unified [`PharmacologySepsisState`] for telemetry and Gate 5 integration.
#[allow(clippy::too_many_arguments)]
pub fn evaluate_pharmacology_sepsis_state(
    profile: &CrewBiologicalProfile,
    poct: Option<&SpotPoctPanel>,
    resp_rate_bpm: Option<f64>,
    sbp_mmhg: Option<f64>,
    dbp_mmhg: Option<f64>,
    core_temp_c: Option<f64>,
    altered_mentation_or_fatigue: Option<f64>,
    source_identified: bool,
    current_qtc_ms: Option<f64>,
    mission_sol: f64,
    cumulative_habitat_gcr_gy: f64,
    inventory: Option<&MedicalConsumableInventory>,
) -> PharmacologySepsisState {
    let qsofa_score = compute_qsofa_score(resp_rate_bpm, sbp_mmhg, altered_mentation_or_fatigue);
    let suspected_infection = is_suspected_infection(core_temp_c, poct, source_identified);
    let lactate_elevated = poct
        .and_then(|p| p.lactate_mmol_l)
        .is_some_and(|l| l.is_finite() && l > 2.0);
    let sepsis_protocol_active = suspected_infection && (qsofa_score >= 2 || lactate_elevated);

    let map_mmhg = match (sbp_mmhg, dbp_mmhg) {
        (Some(sbp), Some(dbp)) if sbp.is_finite() && dbp.is_finite() => {
            Some((sbp + 2.0 * dbp) / 3.0)
        }
        _ => None,
    };
    let lactate_shock = poct
        .and_then(|p| p.lactate_mmol_l)
        .is_some_and(|l| l.is_finite() && l >= 4.0);
    let septic_shock_active =
        sepsis_protocol_active && (map_mmhg.is_some_and(|m| m < 65.0) || lactate_shock);

    let body_mass_kg = sanitize_f64(profile.body_mass_kg, 75.0).clamp(30.0, 200.0);
    let recommended_crystalloid_bolus_ml = if sepsis_protocol_active {
        30.0 * body_mass_kg
    } else {
        0.0
    };

    let estimated_egfr_ml_min = poct
        .and_then(|p| p.creatinine_mg_dl)
        .filter(|cr| cr.is_finite() && *cr > 0.0)
        .map(|cr| estimated_egfr_ckd_epi_2021(profile, cr));

    let effective_qtc_ms = current_qtc_ms
        .or(profile.baseline_qtc_ms)
        .filter(|q| q.is_finite() && *q > 0.0)
        .unwrap_or(410.0);

    let tracked_drugs = [
        "AMOXICILLIN_CLAVULANATE",
        "EPINEPHRINE",
        "ERTAPENEM",
        "TXA",
        "PIPERACILLIN_TAZOBACTAM",
        "CEFEPIME",
    ];
    let mut lowest_potency = 100.0_f64;
    let mut depleted_or_subpotent_drugs = Vec::new();
    for drug in tracked_drugs {
        let eval = evaluate_drug_potency(drug, mission_sol, cumulative_habitat_gcr_gy);
        lowest_potency = lowest_potency.min(eval.potency_pct);
        let depleted = inventory.is_some_and(|inv| inv.is_depleted(drug));
        if eval.is_subpotent || depleted {
            depleted_or_subpotent_drugs.push(eval.drug_id);
        }
    }

    PharmacologySepsisState {
        qsofa_score,
        suspected_infection,
        sepsis_protocol_active,
        septic_shock_active,
        recommended_crystalloid_bolus_ml,
        effective_qtc_ms,
        estimated_egfr_ml_min,
        lowest_formulary_potency_pct: lowest_potency,
        depleted_or_subpotent_drugs,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn radiolytic_potency_decay_matches_calibrated_sol_480_and_900() {
        let amox_sol_0 = evaluate_drug_potency("Amoxicillin-Clavulanate", 0.0, 0.0);
        assert!((amox_sol_0.potency_pct - 100.0).abs() < 1e-6);
        assert!(!amox_sol_0.is_subpotent);
        assert_eq!(
            amox_sol_0.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );

        // Sol 480 with ~0.14 Gy cumulative GCR crosses < 90.0% USP floor
        let amox_sol_480 = evaluate_drug_potency("Amoxicillin-Clavulanate", 480.0, 0.14);
        assert!(
            amox_sol_480.potency_pct < USP_POTENCY_FLOOR_PCT,
            "expected < 90% at Sol 480, got {}",
            amox_sol_480.potency_pct
        );
        assert!(amox_sol_480.is_subpotent);
        assert!(amox_sol_480.lyophilized_backup_recommended);

        // Liquid Epinephrine decays slower than Amoxicillin-Clavulanate
        let epi_sol_480 = evaluate_drug_potency("Epinephrine", 480.0, 0.14);
        assert!(epi_sol_480.potency_pct > amox_sol_480.potency_pct);

        // Lyophilized Ertapenem and TXA remain > 96% at Sol 900
        let ertapenem_900 = evaluate_drug_potency("Ertapenem", 900.0, 0.10);
        let txa_900 = evaluate_drug_potency("TXA", 900.0, 0.10);
        assert!(
            ertapenem_900.potency_pct > 96.0,
            "expected > 96% at Sol 900, got {}",
            ertapenem_900.potency_pct
        );
        assert!(txa_900.potency_pct > 96.0);
        assert!(!ertapenem_900.is_subpotent);
    }

    #[test]
    fn finite_inventory_tracks_consumption_and_depletion() {
        let mut inv = MedicalConsumableInventory::mars_exmc_baseline();
        assert_eq!(inv.remaining_units("Epinephrine"), 12);
        assert!(!inv.is_depleted("Epinephrine"));

        assert!(inv.consume_units("Epinephrine", 12));
        assert_eq!(inv.remaining_units("Epinephrine"), 0);
        assert!(inv.is_depleted("Epinephrine"));
        assert!(!inv.consume_units("Epinephrine", 1));
    }

    #[test]
    fn ckd_epi_2021_egfr_and_sepsis_state_evaluation() {
        let male = CrewBiologicalProfile::default();
        let egfr_normal = estimated_egfr_ckd_epi_2021(&male, 1.0);
        assert!(egfr_normal > 90.0 && egfr_normal < 115.0);

        let egfr_aki = estimated_egfr_ckd_epi_2021(&male, 1.8);
        assert!(egfr_aki < 60.0);

        let poct = SpotPoctPanel {
            creatinine_mg_dl: Some(1.1),
            lactate_mmol_l: Some(4.2),
            wbc_k_ul: Some(15.4),
            ..Default::default()
        };
        let state = evaluate_pharmacology_sepsis_state(
            &male,
            Some(&poct),
            Some(24.0),
            Some(92.0),
            Some(50.0),
            Some(38.9),
            Some(0.85),
            true,
            None,
            500.0,
            0.15,
            None,
        );
        assert_eq!(state.qsofa_score, 3);
        assert!(state.suspected_infection);
        assert!(state.sepsis_protocol_active);
        assert!(state.septic_shock_active);
        assert!((state.recommended_crystalloid_bolus_ml - 2250.0).abs() < 1e-6);
        assert!(state
            .depleted_or_subpotent_drugs
            .contains(&"AMOXICILLIN_CLAVULANATE".to_string()));
    }
}
