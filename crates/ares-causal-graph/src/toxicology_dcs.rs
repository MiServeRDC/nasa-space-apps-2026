#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Aerospace Toxicology (NASA SMAC/IDLH, MMH/N2O4/Pyrolysis, Lunar Dust & Martian Perchlorate NIS),
//! 8-Compartment Haldane Nitrogen Washout / Conkin 360-min Tissue Ratio, Spencer VGE,
//! and EVA Suit Emergencies (Parmitano Helmet Water Intrusion & LCVG Thermal Failure).
//!
//! All outputs carry `ModelValidationStatus::IllustrativeUnvalidated` unless replaced
//! by an externally validated flight certification manifest.

use ares_core_types::constants::sanitize_f64;
use ares_core_types::medical_360::{
    Aerospace360ScenarioInput, CrewBiologicalProfile, ToxicologyDcsState,
};
use ares_core_types::telemetry::{Biometrics, ModelValidationStatus, SpotPoctPanel};
use serde::{Deserialize, Serialize};
use std::f64::consts::LN_2;

/// NASA 1-hour Spacecraft Maximum Allowable Concentration (SMAC) for anhydrous ammonia (ppm).
pub const NH3_SMAC_1H_PPM: f64 = 25.0;
/// Immediately Dangerous to Life or Health (IDLH) ceiling for anhydrous ammonia (ppm).
pub const NH3_IDLH_PPM: f64 = 300.0;
/// Action threshold for monomethylhydrazine (MMH) / hydrazine vapor exposure (ppm).
pub const MMH_ACTION_THRESHOLD_PPM: f64 = 0.01;
/// Action threshold for nitrogen tetroxide (N2O4 / NO2) inhalation (ppm).
pub const N2O4_ACTION_THRESHOLD_PPM: f64 = 1.0;
/// Methemoglobinemia threshold (%) triggering Methylene Blue (unless G6PD-deficient).
pub const METHEMOGLOBIN_METHYLENE_BLUE_THRESHOLD_PCT: f64 = 15.0;
/// Carbon monoxide (CO) pyrolysis action threshold (ppm).
pub const CO_PYROLYSIS_THRESHOLD_PPM: f64 = 35.0;
/// Hydrogen cyanide (HCN) pyrolysis action threshold (ppm).
pub const HCN_PYROLYSIS_THRESHOLD_PPM: f64 = 4.7;
/// Hydrogen chloride (HCl) pyrolysis action threshold (ppm).
pub const HCL_PYROLYSIS_THRESHOLD_PPM: f64 = 5.0;
/// Empirical cyanide antidote (Hydroxocobalamin) plasma lactate threshold during CO/smoke exposure (mmol/L).
pub const PYROLYSIS_EMPIRICAL_LACTATE_THRESHOLD_MMOL_L: f64 = 8.0;
/// EPA / NASA Reference Dose (RfD) for Martian perchlorate (ClO4-) exposure (mg/kg/day).
pub const PERCHLORATE_EPA_NASA_RFD_MG_KG_D: f64 = 0.0007;

/// 8-Compartment Haldane tissue half-times (minutes).
pub const HALF_TIMES_MIN: [f64; 8] = [5.0, 10.0, 20.0, 40.0, 80.0, 120.0, 240.0, 360.0];
/// Alveolar water vapor pressure at 37 C (47 mmHg = 0.909 psi).
pub const ALVEOLAR_WATER_VAPOR_PSI: f64 = 0.909;
/// Conkin 360-minute tissue ratio ceiling for safe EVA decompression without pre-breathe lock.
pub const CONKIN_R360_EVA_LOCK_THRESHOLD: f64 = 1.40;
/// Minimum clamped suit pressure (psi) for Conkin tissue ratio denominator.
pub const MIN_SUIT_PRESSURE_PSI: f64 = 2.0;
/// EVA LCVG hyperthermia core temperature threshold (C).
pub const EVA_HYPERTHERMIA_CORE_TEMP_C: f64 = 39.0;
/// EVA LCVG hypothermia core temperature threshold (C).
pub const EVA_HYPOTHERMIA_CORE_TEMP_C: f64 = 35.0;

/// Anhydrous ammonia exposure severity classification.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Nh3Severity {
    #[default]
    Nominal,
    SmacExceeded,
    IdlhCritical,
}

/// Decompression sickness / arterial gas embolism clinical classification.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum DcsClassification {
    #[default]
    None,
    TypeIJointPainOrHighVge,
    TypeIINeuroChokesOrAge,
}

/// EVA Liquid Cooling and Ventilation Garment (LCVG) thermal emergency state.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum LcvgThermalEmergency {
    #[default]
    Nominal,
    PumpFaultNormothermic,
    Hyperthermia,
    Hypothermia,
}

/// 8-compartment Haldane nitrogen tension state (psi).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HaldaneCompartmentState {
    pub p_t_psi: [f64; 8],
    pub validation_status: ModelValidationStatus,
}

impl Default for HaldaneCompartmentState {
    fn default() -> Self {
        Self::new_equilibrated(14.7, 0.79)
    }
}

impl HaldaneCompartmentState {
    /// Initializes all 8 tissue compartments equilibrated to `(p_ambient_psi - 0.909) * f_in2`.
    pub fn new_equilibrated(p_ambient_psi: f64, f_in2: f64) -> Self {
        let p_alv = alveolar_n2_pressure_psi(p_ambient_psi, f_in2);
        Self {
            p_t_psi: [p_alv; 8],
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }

    /// Advances all 8 Haldane tissue compartments over `dt_min` minutes at `p_ambient_psi` and `f_in2`.
    pub fn step_washout(&mut self, p_ambient_psi: f64, f_in2: f64, dt_min: f64) {
        let dt = sanitize_f64(dt_min, 0.0).max(0.0);
        if dt == 0.0 {
            return;
        }
        let p_alv = alveolar_n2_pressure_psi(p_ambient_psi, f_in2);
        for (i, &half_time) in HALF_TIMES_MIN.iter().enumerate() {
            let decay = (-LN_2 * dt / half_time).exp();
            self.p_t_psi[i] = p_alv + (self.p_t_psi[i] - p_alv) * decay;
        }
    }

    /// Computes Conkin 360-minute tissue ratio: `p_t[7] / p_suit_psi.max(2.0)`.
    #[inline]
    pub fn conkin_tissue_ratio_r360(&self, p_suit_psi: f64) -> f64 {
        let denom = sanitize_f64(p_suit_psi, 4.3).max(MIN_SUIT_PRESSURE_PSI);
        sanitize_f64(self.p_t_psi[7], 0.0) / denom
    }

    /// Returns true when Conkin `TR > 1.40`, requiring EVA pre-breathe lock.
    #[inline]
    pub fn is_eva_prebreathe_locked(&self, p_suit_psi: f64) -> bool {
        self.conkin_tissue_ratio_r360(p_suit_psi) > CONKIN_R360_EVA_LOCK_THRESHOLD
    }
}

/// Computes alveolar inspired nitrogen partial pressure (psi):
/// `p_alv_n2_psi = (p_ambient_psi - 0.909).max(0.0) * f_in2.clamp(0.0, 1.0)`.
#[inline]
pub fn alveolar_n2_pressure_psi(p_ambient_psi: f64, f_in2: f64) -> f64 {
    let p_amb = sanitize_f64(p_ambient_psi, 14.7).max(0.0);
    let frac = sanitize_f64(f_in2, 0.79).clamp(0.0, 1.0);
    (p_amb - ALVEOLAR_WATER_VAPOR_PSI).max(0.0) * frac
}

/// Computes competitive Sodium-Iodide Symporter (NIS) thyroid iodide uptake fraction:
/// `1.0 / (1.0 + cl_o4_conc_um / (1.5 * iodide_conc_um))`.
#[inline]
pub fn compute_nis_thyroid_uptake_fraction(cl_o4_conc_um: f64, iodide_conc_um: f64) -> f64 {
    let clo4 = sanitize_f64(cl_o4_conc_um, 0.0).max(0.0);
    if clo4 == 0.0 {
        return 1.0;
    }
    let iodide = sanitize_f64(iodide_conc_um, 0.1).max(1e-6);
    1.0 / (1.0 + clo4 / (1.5 * iodide))
}

/// Input parameters for aerospace toxicology, Haldane/Conkin DCS, and EVA suit emergency evaluation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ToxicologyDcsInput {
    pub nh3_ppm: f64,
    pub mmh_ppm: f64,
    pub no2_ppm: f64,
    pub co_ppm: f64,
    pub hcn_ppm: f64,
    pub hcl_ppm: f64,
    pub methemoglobin_pct: f64,
    pub lactate_mmol_l: Option<f64>,
    pub lunar_dust_exposure: bool,
    pub perchlorate_exposure_mg_kg_d: f64,
    pub cl_o4_conc_um: Option<f64>,
    pub iodide_conc_um: Option<f64>,
    pub wbc_k_ul: Option<f64>,
    pub platelet_count_k_ul: Option<f64>,
    pub cabin_pressure_psi: f64,
    pub cabin_f_in2: f64,
    pub suit_pressure_psi: f64,
    pub prebreathe_o2_minutes: f64,
    pub spencer_vge_grade: u8,
    pub dcs_type1_joint_pain: bool,
    pub dcs_type2_neuro_or_age: bool,
    pub helmet_water_intrusion_detected: bool,
    pub lcvg_pump_fault: bool,
    pub core_temp_c: Option<f64>,
    pub body_mass_kg: f64,
    pub g6pd_deficient: bool,
}

impl Default for ToxicologyDcsInput {
    fn default() -> Self {
        Self {
            nh3_ppm: 0.0,
            mmh_ppm: 0.0,
            no2_ppm: 0.0,
            co_ppm: 0.0,
            hcn_ppm: 0.0,
            hcl_ppm: 0.0,
            methemoglobin_pct: 0.5,
            lactate_mmol_l: None,
            lunar_dust_exposure: false,
            perchlorate_exposure_mg_kg_d: 0.0,
            cl_o4_conc_um: None,
            iodide_conc_um: None,
            wbc_k_ul: None,
            platelet_count_k_ul: None,
            cabin_pressure_psi: 14.7,
            cabin_f_in2: 0.79,
            suit_pressure_psi: 4.3,
            prebreathe_o2_minutes: 0.0,
            spencer_vge_grade: 0,
            dcs_type1_joint_pain: false,
            dcs_type2_neuro_or_age: false,
            helmet_water_intrusion_detected: false,
            lcvg_pump_fault: false,
            core_temp_c: None,
            body_mass_kg: 75.0,
            g6pd_deficient: false,
        }
    }
}

/// Comprehensive causal assessment for Aerospace Toxicology, DCS, and EVA Suit Emergencies.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToxicologyDcsAssessment {
    pub nh3_severity: Nh3Severity,
    pub mmh_pyridoxine_indicated: bool,
    pub pyridoxine_dose_mg: f64,
    pub n2o4_pulmonary_surveillance_72h: bool,
    pub methylene_blue_indicated: bool,
    pub methylene_blue_blocked_g6pd: bool,
    pub pyrolysis_co_exposure: bool,
    pub hydroxocobalamin_indicated: bool,
    pub lunar_dust_lavage_indicated: bool,
    pub perchlorate_rfd_exceeded: bool,
    pub nis_thyroid_uptake_fraction: f64,
    pub marrow_cbc_cytopenia_alert: bool,
    pub haldane_state: HaldaneCompartmentState,
    pub haldane_tissue_ratio_r360: f64,
    pub eva_prebreathe_locked: bool,
    pub spencer_vge_grade: u8,
    pub dcs_classification: DcsClassification,
    pub parmitano_water_intrusion_emergency: bool,
    pub lcvg_thermal_emergency: LcvgThermalEmergency,
    pub state: ToxicologyDcsState,
    pub causal_chain: Vec<String>,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates aerospace toxicology, Haldane/Conkin DCS, Spencer VGE, and EVA suit emergencies.
pub fn evaluate_toxicology_dcs(input: &ToxicologyDcsInput) -> ToxicologyDcsAssessment {
    let mut causal_chain = Vec::new();

    let nh3 = sanitize_f64(input.nh3_ppm, 0.0).max(0.0);
    let nh3_severity = if nh3 >= NH3_IDLH_PPM {
        causal_chain.push(format!("NH3_IDLH_CRITICAL:{nh3:.1}_PPM"));
        Nh3Severity::IdlhCritical
    } else if nh3 > NH3_SMAC_1H_PPM {
        causal_chain.push(format!("NH3_1H_SMAC_EXCEEDED:{nh3:.1}_PPM"));
        Nh3Severity::SmacExceeded
    } else {
        Nh3Severity::Nominal
    };

    let mmh = sanitize_f64(input.mmh_ppm, 0.0).max(0.0);
    let mmh_pyridoxine_indicated = mmh > MMH_ACTION_THRESHOLD_PPM;
    let body_mass_kg = sanitize_f64(input.body_mass_kg, 75.0).clamp(30.0, 200.0);
    let pyridoxine_dose_mg = if mmh_pyridoxine_indicated {
        causal_chain.push(format!("MMH_HYDRAZINE_EXPOSURE:{mmh:.3}_PPM_GAD_PLP_DEPLETION"));
        (25.0 * body_mass_kg).min(5000.0)
    } else {
        0.0
    };

    let no2 = sanitize_f64(input.no2_ppm, 0.0).max(0.0);
    let met_hb = sanitize_f64(input.methemoglobin_pct, 0.5).clamp(0.0, 100.0);
    let n2o4_pulmonary_surveillance_72h = no2 > N2O4_ACTION_THRESHOLD_PPM;
    if n2o4_pulmonary_surveillance_72h {
        causal_chain.push(format!("N2O4_INHALATION:{no2:.2}_PPM_72H_EDEMA_SURVEILLANCE"));
    }

    let met_hb_elevated = met_hb >= METHEMOGLOBIN_METHYLENE_BLUE_THRESHOLD_PCT;
    let methylene_blue_blocked_g6pd = met_hb_elevated && input.g6pd_deficient;
    let methylene_blue_indicated = met_hb_elevated && !input.g6pd_deficient;
    if methylene_blue_blocked_g6pd {
        causal_chain.push(format!(
            "METHEMOGLOBINEMIA_{met_hb:.1}_PCT_G6PD_DEFICIENT_METHYLENE_BLUE_BLOCKED"
        ));
    } else if methylene_blue_indicated {
        causal_chain.push(format!("METHEMOGLOBINEMIA_{met_hb:.1}_PCT_METHYLENE_BLUE"));
    }

    let co = sanitize_f64(input.co_ppm, 0.0).max(0.0);
    let hcn = sanitize_f64(input.hcn_ppm, 0.0).max(0.0);
    let hcl = sanitize_f64(input.hcl_ppm, 0.0).max(0.0);
    let lactate = input.lactate_mmol_l.map(|v| sanitize_f64(v, 0.0).max(0.0));
    let pyrolysis_co_exposure =
        co > CO_PYROLYSIS_THRESHOLD_PPM || hcn > HCN_PYROLYSIS_THRESHOLD_PPM || hcl > HCL_PYROLYSIS_THRESHOLD_PPM;
    let hydroxocobalamin_indicated = hcn > HCN_PYROLYSIS_THRESHOLD_PPM
        || (co > CO_PYROLYSIS_THRESHOLD_PPM
            && lactate.is_some_and(|l| l >= PYROLYSIS_EMPIRICAL_LACTATE_THRESHOLD_MMOL_L));

    if pyrolysis_co_exposure {
        causal_chain.push(format!(
            "COMBUSTION_PYROLYSIS:CO={co:.1}_HCN={hcn:.1}_HCL={hcl:.1}"
        ));
    }
    if hydroxocobalamin_indicated {
        causal_chain.push("CYANIDE_TOXICITY_HYDROXOCOBALAMIN_5G_IV_INDICATED".to_string());
    }

    if input.lunar_dust_exposure {
        causal_chain.push("LUNAR_NANOPHASE_FE0_SILICATE_DUST_EXPOSURE".to_string());
    }

    let perchlorate = sanitize_f64(input.perchlorate_exposure_mg_kg_d, 0.0).max(0.0);
    let perchlorate_rfd_exceeded = perchlorate > PERCHLORATE_EPA_NASA_RFD_MG_KG_D;
    let iodide_um = input.iodide_conc_um.unwrap_or(0.10);
    // If explicit serum ClO4- concentration (uM) is omitted, map mg/kg/d exposure
    // deterministically to an illustrative uM concentration for NIS inhibition modeling.
    let cl_o4_um = input
        .cl_o4_conc_um
        .unwrap_or(perchlorate * 200.0);
    let nis_thyroid_uptake_fraction = compute_nis_thyroid_uptake_fraction(cl_o4_um, iodide_um);

    let marrow_cbc_cytopenia_alert = perchlorate_rfd_exceeded
        && (input.wbc_k_ul.is_some_and(|w| w.is_finite() && w < 3.5)
            || input
                .platelet_count_k_ul
                .is_some_and(|p| p.is_finite() && p < 150.0));

    if perchlorate_rfd_exceeded {
        causal_chain.push(format!(
            "MARTIAN_PERCHLORATE_NIS_INHIBITION:UPTAKE={nis_thyroid_uptake_fraction:.3}"
        ));
    }
    if marrow_cbc_cytopenia_alert {
        causal_chain.push("PERCHLORATE_MARROW_CBC_CYTOPENIA_ALERT".to_string());
    }

    let mut haldane_state =
        HaldaneCompartmentState::new_equilibrated(input.cabin_pressure_psi, input.cabin_f_in2);
    let prebreathe_min = sanitize_f64(input.prebreathe_o2_minutes, 0.0).max(0.0);
    if prebreathe_min > 0.0 {
        // 100% O2 pre-breathe (f_in2 = 0.0) at cabin pressure.
        haldane_state.step_washout(input.cabin_pressure_psi, 0.0, prebreathe_min);
    }
    let haldane_tissue_ratio_r360 = haldane_state.conkin_tissue_ratio_r360(input.suit_pressure_psi);
    let eva_prebreathe_locked = haldane_state.is_eva_prebreathe_locked(input.suit_pressure_psi);
    if eva_prebreathe_locked {
        causal_chain.push(format!(
            "CONKIN_R360_EVA_PREBREATHE_LOCKED:TR={haldane_tissue_ratio_r360:.2}"
        ));
    }

    let spencer_vge_grade = input.spencer_vge_grade.min(4);
    let dcs_classification = if input.dcs_type2_neuro_or_age {
        causal_chain.push("DCS_TYPE2_OR_PULMONARY_AGE_EMERGENCY".to_string());
        DcsClassification::TypeIINeuroChokesOrAge
    } else if spencer_vge_grade >= 3 || input.dcs_type1_joint_pain {
        causal_chain.push(format!("DCS_TYPE1_OR_SPENCER_VGE_GRADE_{spencer_vge_grade}"));
        DcsClassification::TypeIJointPainOrHighVge
    } else {
        DcsClassification::None
    };

    if input.helmet_water_intrusion_detected {
        causal_chain.push("EVA_PARMITANO_HELMET_WATER_INTRUSION_ABORT".to_string());
    }

    let lcvg_thermal_emergency = if input.lcvg_pump_fault {
        match input.core_temp_c.filter(|t| t.is_finite()) {
            Some(t) if t >= EVA_HYPERTHERMIA_CORE_TEMP_C => {
                causal_chain.push(format!("EVA_LCVG_HYPERTHERMIA:{t:.1}_C"));
                LcvgThermalEmergency::Hyperthermia
            }
            Some(t) if t <= EVA_HYPOTHERMIA_CORE_TEMP_C => {
                causal_chain.push(format!("EVA_LCVG_HYPOTHERMIA:{t:.1}_C"));
                LcvgThermalEmergency::Hypothermia
            }
            _ => {
                causal_chain.push("EVA_LCVG_PUMP_FAULT_NORMOTHERMIC".to_string());
                LcvgThermalEmergency::PumpFaultNormothermic
            }
        }
    } else {
        LcvgThermalEmergency::Nominal
    };

    let dcs_type2_or_age_active =
        dcs_classification == DcsClassification::TypeIINeuroChokesOrAge;

    let state = ToxicologyDcsState {
        nh3_ppm: nh3,
        mmh_ppm: mmh,
        no2_ppm: no2,
        co_ppm: co,
        hcn_ppm: hcn,
        hcl_ppm: hcl,
        methemoglobin_pct: met_hb,
        perchlorate_exposure_mg_kg_d: perchlorate,
        nis_thyroid_uptake_fraction,
        haldane_tissue_ratio_r360,
        spencer_vge_grade,
        helmet_water_intrusion_detected: input.helmet_water_intrusion_detected,
        lcvg_pump_fault: input.lcvg_pump_fault,
        eva_prebreathe_locked,
        dcs_type2_or_age_active,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    };

    ToxicologyDcsAssessment {
        nh3_severity,
        mmh_pyridoxine_indicated,
        pyridoxine_dose_mg,
        n2o4_pulmonary_surveillance_72h,
        methylene_blue_indicated,
        methylene_blue_blocked_g6pd,
        pyrolysis_co_exposure,
        hydroxocobalamin_indicated,
        lunar_dust_lavage_indicated: input.lunar_dust_exposure,
        perchlorate_rfd_exceeded,
        nis_thyroid_uptake_fraction,
        marrow_cbc_cytopenia_alert,
        haldane_state,
        haldane_tissue_ratio_r360,
        eva_prebreathe_locked,
        spencer_vge_grade,
        dcs_classification,
        parmitano_water_intrusion_emergency: input.helmet_water_intrusion_detected,
        lcvg_thermal_emergency,
        state,
        causal_chain,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Evaluates toxicology and DCS directly from `Aerospace360ScenarioInput`, `Biometrics`, `SpotPoctPanel`, and `CrewBiologicalProfile`.
pub fn evaluate_from_scenario_input(
    scenario: &Aerospace360ScenarioInput,
    biometrics: &Biometrics,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
) -> ToxicologyDcsAssessment {
    let cabin_psi = scenario.cabin_pressure_psi.unwrap_or(14.7);
    // Approximate normoxic cabin F_iN2: 0.79 at 14.7 psi, 0.66 at 8.2 psi exploration atmosphere.
    let cabin_f_in2 = if cabin_psi <= 9.0 { 0.66 } else { 0.79 };

    let input = ToxicologyDcsInput {
        nh3_ppm: scenario.nh3_ppm.unwrap_or(0.0),
        mmh_ppm: scenario.mmh_ppm.unwrap_or(0.0),
        no2_ppm: scenario.no2_ppm.unwrap_or(0.0),
        co_ppm: scenario.co_ppm.unwrap_or(0.0),
        hcn_ppm: scenario.hcn_ppm.unwrap_or(0.0),
        hcl_ppm: scenario.hcl_ppm.unwrap_or(0.0),
        methemoglobin_pct: scenario.methemoglobin_pct.unwrap_or(0.5),
        lactate_mmol_l: poct.and_then(|p| p.lactate_mmol_l),
        lunar_dust_exposure: false,
        perchlorate_exposure_mg_kg_d: scenario.perchlorate_exposure_mg_kg_d.unwrap_or(0.0),
        cl_o4_conc_um: None,
        iodide_conc_um: None,
        wbc_k_ul: poct.and_then(|p| p.wbc_k_ul),
        platelet_count_k_ul: biometrics.platelet_count_k_ul,
        cabin_pressure_psi: cabin_psi,
        cabin_f_in2,
        suit_pressure_psi: scenario.suit_pressure_psi.unwrap_or(4.3),
        prebreathe_o2_minutes: scenario.prebreathe_o2_minutes.unwrap_or(0.0),
        spencer_vge_grade: scenario.spencer_vge_grade.unwrap_or(0),
        dcs_type1_joint_pain: false,
        dcs_type2_neuro_or_age: false,
        helmet_water_intrusion_detected: scenario.helmet_water_intrusion_detected,
        lcvg_pump_fault: scenario.lcvg_pump_fault,
        core_temp_c: biometrics.core_temp_celsius,
        body_mass_kg: profile.body_mass_kg,
        g6pd_deficient: profile.g6pd_deficient,
    };

    evaluate_toxicology_dcs(&input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn haldane_conkin_matches_iss_14_7_psi_and_exploration_8_2_psi_references() {
        // 14.7 psi (79% N2 -> P_N2 = (14.7 - 0.909) * 0.79 = 10.89489 psi) -> 4.3 psi suit => TR ~ 2.53
        let iss = HaldaneCompartmentState::new_equilibrated(14.7, 0.79);
        let tr_iss = iss.conkin_tissue_ratio_r360(4.3);
        assert!(
            (tr_iss - 2.534).abs() < 0.02,
            "expected TR ~ 2.53, got {tr_iss}"
        );
        assert!(iss.is_eva_prebreathe_locked(4.3));

        // 8.2 psi / 34% O2 (66% N2 -> P_N2 = (8.2 - 0.909) * 0.66 = 4.81206 psi) -> 4.3 psi suit => TR ~ 1.12
        let explore = HaldaneCompartmentState::new_equilibrated(8.2, 0.66);
        let tr_explore = explore.conkin_tissue_ratio_r360(4.3);
        assert!(
            (tr_explore - 1.119).abs() < 0.02,
            "expected TR ~ 1.12, got {tr_explore}"
        );
        assert!(!explore.is_eva_prebreathe_locked(4.3));
    }

    #[test]
    fn haldane_washout_monotonically_reduces_tissue_ratio_on_100pct_o2() {
        let mut state = HaldaneCompartmentState::new_equilibrated(14.7, 0.79);
        let initial_r360 = state.conkin_tissue_ratio_r360(4.3);
        // 360 min of 100% O2 at 14.7 psi halves the 360-min compartment.
        state.step_washout(14.7, 0.0, 360.0);
        let after_360 = state.conkin_tissue_ratio_r360(4.3);
        assert!((after_360 - initial_r360 * 0.5).abs() < 1e-6);
        assert!(!state.is_eva_prebreathe_locked(4.3));
    }

    #[test]
    fn nis_thyroid_uptake_decreases_with_perchlorate_and_recovers_with_iodide() {
        let nominal = compute_nis_thyroid_uptake_fraction(0.0, 0.1);
        assert!((nominal - 1.0).abs() < 1e-9);

        let inhibited = compute_nis_thyroid_uptake_fraction(0.30, 0.10);
        // 1 / (1 + 0.30 / 0.15) = 1 / 3
        assert!((inhibited - (1.0 / 3.0)).abs() < 1e-9);

        let supplemented = compute_nis_thyroid_uptake_fraction(0.30, 1.0);
        assert!(supplemented > inhibited);
    }

    #[test]
    fn toxicology_thresholds_trigger_expected_antidotes_and_g6pd_block() {
        let input = ToxicologyDcsInput {
            nh3_ppm: 310.0,
            mmh_ppm: 0.05,
            no2_ppm: 2.5,
            methemoglobin_pct: 18.0,
            co_ppm: 45.0,
            lactate_mmol_l: Some(9.2),
            perchlorate_exposure_mg_kg_d: 0.002,
            wbc_k_ul: Some(2.8),
            body_mass_kg: 80.0,
            g6pd_deficient: true,
            helmet_water_intrusion_detected: true,
            lcvg_pump_fault: true,
            core_temp_c: Some(39.4),
            ..Default::default()
        };

        let out = evaluate_toxicology_dcs(&input);
        assert_eq!(out.nh3_severity, Nh3Severity::IdlhCritical);
        assert!(out.mmh_pyridoxine_indicated);
        assert!((out.pyridoxine_dose_mg - 2000.0).abs() < 1e-6);
        assert!(out.n2o4_pulmonary_surveillance_72h);
        assert!(!out.methylene_blue_indicated);
        assert!(out.methylene_blue_blocked_g6pd);
        assert!(out.pyrolysis_co_exposure);
        assert!(out.hydroxocobalamin_indicated);
        assert!(out.perchlorate_rfd_exceeded);
        assert!(out.marrow_cbc_cytopenia_alert);
        assert!(out.parmitano_water_intrusion_emergency);
        assert_eq!(out.lcvg_thermal_emergency, LcvgThermalEmergency::Hyperthermia);
        assert_eq!(
            out.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
        assert_eq!(
            out.state.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
    }
}
