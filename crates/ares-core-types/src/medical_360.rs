//! 360-degree aerospace medical domain DTOs, safety gates, and epistemic
//! provenance structures for Phase 1 & Phase 2 (`AerospaceMedical360State`).

use crate::constants::sanitize_f64;
use crate::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

fn default_age_years() -> f64 {
    38.0
}

fn default_body_mass_kg() -> f64 {
    75.0
}

fn default_height_cm() -> f64 {
    178.0
}

fn default_lowest_potency_pct() -> f64 {
    100.0
}

fn default_effective_qtc_ms() -> f64 {
    410.0
}

fn default_nis_uptake_fraction() -> f64 {
    1.0
}

/// Biological sex profile for sex-calibrated hematology, orthostasis,
/// pharmacokinetics, and REID radiation sensitivity scaling.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum BiologicalSex {
    #[default]
    Male,
    Female,
}

/// Hormonal contraceptive regimen for prothrombotic VTE/IJV risk modulation.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContraceptiveRegimen {
    #[default]
    None,
    CombinedEthinylestradiolCoc,
    ProgestinOnlyOral,
    LevonorgestrelIud,
    SubdermalImplant,
}

/// Crew biological and pharmacogenomic profile (backward-compatible defaults).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CrewBiologicalProfile {
    pub biological_sex: BiologicalSex,
    #[serde(default = "default_age_years")]
    pub age_years: f64,
    #[serde(default = "default_body_mass_kg")]
    pub body_mass_kg: f64,
    #[serde(default = "default_height_cm")]
    pub height_cm: f64,
    pub baseline_hematocrit_pct: Option<f64>,
    pub baseline_hemoglobin_g_dl: Option<f64>,
    pub contraceptive_regimen: ContraceptiveRegimen,
    pub drug_allergies: Vec<String>,
    pub g6pd_deficient: bool,
    pub baseline_qtc_ms: Option<f64>,
}

impl Default for CrewBiologicalProfile {
    fn default() -> Self {
        Self {
            biological_sex: BiologicalSex::Male,
            age_years: default_age_years(),
            body_mass_kg: default_body_mass_kg(),
            height_cm: default_height_cm(),
            baseline_hematocrit_pct: None,
            baseline_hemoglobin_g_dl: None,
            contraceptive_regimen: ContraceptiveRegimen::None,
            drug_allergies: Vec::new(),
            g6pd_deficient: false,
            baseline_qtc_ms: None,
        }
    }
}

impl CrewBiologicalProfile {
    /// Reference female crew anthropometric profile (62.0 kg, 165.0 cm).
    pub fn female_default() -> Self {
        Self {
            biological_sex: BiologicalSex::Female,
            age_years: 36.0,
            body_mass_kg: 62.0,
            height_cm: 165.0,
            baseline_hematocrit_pct: None,
            baseline_hemoglobin_g_dl: None,
            contraceptive_regimen: ContraceptiveRegimen::None,
            drug_allergies: Vec::new(),
            g6pd_deficient: false,
            baseline_qtc_ms: None,
        }
    }

    /// Returns sex-calibrated baseline hematocrit (%) if no individual baseline is set.
    #[inline]
    pub fn effective_baseline_hct_pct(&self) -> f64 {
        match self.baseline_hematocrit_pct {
            Some(v) if v.is_finite() && v > 0.0 => v,
            _ => match self.biological_sex {
                BiologicalSex::Male => 44.0,
                BiologicalSex::Female => 39.0,
            },
        }
    }

    /// Returns sex-calibrated baseline hemoglobin (g/dL) if no individual baseline is set.
    #[inline]
    pub fn effective_baseline_hb_g_dl(&self) -> f64 {
        match self.baseline_hemoglobin_g_dl {
            Some(v) if v.is_finite() && v > 0.0 => v,
            _ => match self.biological_sex {
                BiologicalSex::Male => 15.0,
                BiologicalSex::Female => 13.0,
            },
        }
    }

    /// DuBois body surface area (m^2).
    #[inline]
    pub fn bsa_dubois_m2(&self) -> f64 {
        let mass = sanitize_f64(self.body_mass_kg, 75.0).clamp(30.0, 200.0);
        let height = sanitize_f64(self.height_cm, 178.0).clamp(120.0, 230.0);
        0.007_184 * mass.powf(0.425) * height.powf(0.725)
    }

    /// Case-insensitive substring check against recorded drug allergies.
    #[inline]
    pub fn has_allergy(&self, token: &str) -> bool {
        let needle = token.trim().to_ascii_uppercase();
        if needle.is_empty() {
            return false;
        }
        self.drug_allergies
            .iter()
            .any(|a| a.to_ascii_uppercase().contains(&needle))
    }
}

/// Latched pre-LBNP hemodynamic baseline for dynamic Gate 2 SBP/HR drop evaluation.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct LbnpBaselineState {
    pub pre_lbnp_sbp_baseline_mmhg: f64,
    pub pre_lbnp_hr_baseline_bpm: f64,
    pub captured_at_timestamp_ms: u64,
}

/// Coupled habitat/suit ECLSS CO2 differential summary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct EclssCoupledSummary {
    pub max_ppco2_mmhg: f64,
    pub cabin_ppco2_mmhg: Option<f64>,
    pub helmet_ppco2_mmhg: Option<f64>,
    pub affected_crew_count: usize,
    pub root_cause_label: String,
    pub scrubber_override_active: bool,
    pub emergency_pba_o2_mask_required: bool,
    pub validation_status: ModelValidationStatus,
}

impl Default for EclssCoupledSummary {
    fn default() -> Self {
        Self {
            max_ppco2_mmhg: 2.2,
            cabin_ppco2_mmhg: Some(2.2),
            helmet_ppco2_mmhg: None,
            affected_crew_count: 0,
            root_cause_label: "Nominal".to_string(),
            scrubber_override_active: false,
            emergency_pba_o2_mask_required: false,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Input parameters for SPE biodosimetry and Acute Radiation Syndrome (ARS) kinetics.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct RadiationArsInput {
    pub alc_t_k_ul: Option<f64>,
    pub alc_hours_post_spe: Option<f64>,
    pub alc_baseline_k_ul: Option<f64>,
    pub emesis_onset_hours_post_spe: Option<f64>,
    pub days_post_spe: f64,
    pub cumulative_mission_dose_msv: f64,
    pub core_temp_c: Option<f64>,
}

/// Evaluated SPE biodosimetry and ARS hematologic nadir state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct RadiationArsState {
    pub cumulative_mission_dose_msv: f64,
    pub estimated_acute_bfo_dose_gy: f64,
    pub predicted_anc_k_ul: f64,
    pub predicted_plt_k_ul: f64,
    pub severe_neutropenia: bool,
    pub febrile_neutropenia_emergency: bool,
    pub filgrastim_indicated: bool,
    pub sex_age_reid_multiplier: f64,
    pub days_post_spe: f64,
    pub validation_status: ModelValidationStatus,
}

impl Default for RadiationArsState {
    fn default() -> Self {
        Self {
            cumulative_mission_dose_msv: 0.0,
            estimated_acute_bfo_dose_gy: 0.0,
            predicted_anc_k_ul: 4.2,
            predicted_plt_k_ul: 240.0,
            severe_neutropenia: false,
            febrile_neutropenia_emergency: false,
            filgrastim_indicated: false,
            sex_age_reid_multiplier: 1.0,
            days_post_spe: 0.0,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Acute surgical, trauma, anaphylaxis, microgravity CPR, and AUR triage state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AcuteEmergencyState {
    pub shock_index: Option<f64>,
    pub pulseless_cardiac_arrest: bool,
    pub anaphylaxis_suspected: bool,
    pub active_arterial_hemorrhage: bool,
    pub injury_hours_elapsed: Option<f64>,
    pub acute_abdomen_nom_suspected: bool,
    pub dental_ludwigs_angina_threat: bool,
    pub ocular_chemical_or_fb_injury: bool,
    pub seidel_perforation_positive: bool,
    pub eva_musculoskeletal_trauma: bool,
    pub acute_urinary_retention_ml: Option<f64>,
    pub pelvic_emergency_flag: bool,
    pub active_acute_playbook_code: Option<u16>,
    pub validation_status: ModelValidationStatus,
}

impl Default for AcuteEmergencyState {
    fn default() -> Self {
        Self {
            shock_index: None,
            pulseless_cardiac_arrest: false,
            anaphylaxis_suspected: false,
            active_arterial_hemorrhage: false,
            injury_hours_elapsed: None,
            acute_abdomen_nom_suspected: false,
            dental_ludwigs_angina_threat: false,
            ocular_chemical_or_fb_injury: false,
            seidel_perforation_positive: false,
            eva_musculoskeletal_trauma: false,
            acute_urinary_retention_ml: None,
            pelvic_emergency_flag: false,
            active_acute_playbook_code: None,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Aerospace toxicology, Haldane/Conkin DCS, Spencer VGE, and EVA suit emergency state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ToxicologyDcsState {
    pub nh3_ppm: f64,
    pub mmh_ppm: f64,
    pub no2_ppm: f64,
    pub co_ppm: f64,
    pub hcn_ppm: f64,
    pub hcl_ppm: f64,
    pub methemoglobin_pct: f64,
    pub perchlorate_exposure_mg_kg_d: f64,
    #[serde(default = "default_nis_uptake_fraction")]
    pub nis_thyroid_uptake_fraction: f64,
    pub haldane_tissue_ratio_r360: f64,
    pub spencer_vge_grade: u8,
    pub helmet_water_intrusion_detected: bool,
    pub lcvg_pump_fault: bool,
    pub eva_prebreathe_locked: bool,
    pub dcs_type2_or_age_active: bool,
    pub validation_status: ModelValidationStatus,
}

impl Default for ToxicologyDcsState {
    fn default() -> Self {
        Self {
            nh3_ppm: 0.0,
            mmh_ppm: 0.0,
            no2_ppm: 0.0,
            co_ppm: 0.0,
            hcn_ppm: 0.0,
            hcl_ppm: 0.0,
            methemoglobin_pct: 0.5,
            perchlorate_exposure_mg_kg_d: 0.0,
            nis_thyroid_uptake_fraction: default_nis_uptake_fraction(),
            haldane_tissue_ratio_r360: 1.0,
            spencer_vge_grade: 0,
            helmet_water_intrusion_detected: false,
            lcvg_pump_fault: false,
            eva_prebreathe_locked: false,
            dcs_type2_or_age_active: false,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Space pharmacology, radiolytic potency, formulary inventory, and real sepsis state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PharmacologySepsisState {
    pub qsofa_score: u8,
    pub suspected_infection: bool,
    pub sepsis_protocol_active: bool,
    pub septic_shock_active: bool,
    pub recommended_crystalloid_bolus_ml: f64,
    #[serde(default = "default_effective_qtc_ms")]
    pub effective_qtc_ms: f64,
    pub estimated_egfr_ml_min: Option<f64>,
    #[serde(default = "default_lowest_potency_pct")]
    pub lowest_formulary_potency_pct: f64,
    pub depleted_or_subpotent_drugs: Vec<String>,
    pub validation_status: ModelValidationStatus,
}

impl Default for PharmacologySepsisState {
    fn default() -> Self {
        Self {
            qsofa_score: 0,
            suspected_infection: false,
            sepsis_protocol_active: false,
            septic_shock_active: false,
            recommended_crystalloid_bolus_ml: 0.0,
            effective_qtc_ms: default_effective_qtc_ms(),
            estimated_egfr_ml_min: None,
            lowest_formulary_potency_pct: default_lowest_potency_pct(),
            depleted_or_subpotent_drugs: Vec::new(),
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Behavioral health (BMed) triage classification after Gate 7 organic delirium exclusion.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum BMedTriageClass {
    #[default]
    Nominal,
    MildAdjustmentOrFatigue,
    ModerateDepressionOrAnxiety,
    SecondaryOrganicToxicMetabolicDelirium,
    PrimaryAcutePsychiatricCrisis,
    ImminentSelfOrVehicleHarmCrisis,
}

/// Behavioral health (BMed), delirium exclusion, and CMRS restraint governance state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct BehavioralHealthState {
    pub phq9_score: Option<u8>,
    pub gad7_score: Option<u8>,
    pub cssrs_suicidal_ideation_level: Option<u8>,
    pub acute_agitation_or_psychosis: bool,
    pub imminent_harm_to_self_or_vehicle: bool,
    pub organic_delirium_mimic_detected: bool,
    pub triage_classification: BMedTriageClass,
    pub airlock_software_lockout_active: bool,
    pub cmrs_restraint_authorized: bool,
    pub validation_status: ModelValidationStatus,
}

impl Default for BehavioralHealthState {
    fn default() -> Self {
        Self {
            phq9_score: None,
            gad7_score: None,
            cssrs_suicidal_ideation_level: None,
            acute_agitation_or_psychosis: false,
            imminent_harm_to_self_or_vehicle: false,
            organic_delirium_mimic_detected: false,
            triage_classification: BMedTriageClass::Nominal,
            airlock_software_lockout_active: false,
            cmrs_restraint_authorized: false,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Female pelvic and urogyn POCUS scan input (`PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PocusPelvicScan {
    pub performed: bool,
    pub right_ovary_volume_ml: Option<f64>,
    pub left_ovary_volume_ml: Option<f64>,
    pub adnexal_whirlpool_sign: bool,
    pub ovarian_doppler_flow_absent: bool,
    pub cul_de_sac_free_fluid_complex: bool,
    pub urine_leukocyte_nitrite_positive: bool,
    pub point_of_care_beta_hcg_positive: Option<bool>,
    pub validation_status: ModelValidationStatus,
}

impl Default for PocusPelvicScan {
    fn default() -> Self {
        Self {
            performed: false,
            right_ovary_volume_ml: None,
            left_ovary_volume_ml: None,
            adnexal_whirlpool_sign: false,
            ovarian_doppler_flow_absent: false,
            cul_de_sac_free_fluid_complex: false,
            urine_leukocyte_nitrite_positive: false,
            point_of_care_beta_hcg_positive: None,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

impl PocusPelvicScan {
    /// Returns true when ovarian torsion is suspected via whirlpool sign or absent Doppler flow with enlargement.
    #[inline]
    pub fn is_ovarian_torsion_suspected(&self) -> bool {
        self.performed
            && (self.adnexal_whirlpool_sign
                || (self.ovarian_doppler_flow_absent
                    && self
                        .right_ovary_volume_ml
                        .into_iter()
                        .chain(self.left_ovary_volume_ml)
                        .any(|v| v.is_finite() && v > 15.0)))
    }

    /// Returns true when positive beta-hCG coincides with complex cul-de-sac free fluid.
    #[inline]
    pub fn is_ectopic_pregnancy_emergency(&self) -> bool {
        self.point_of_care_beta_hcg_positive == Some(true) && self.cul_de_sac_free_fluid_complex
    }

    /// Returns true when negative beta-hCG coincides with complex free fluid without torsion.
    #[inline]
    pub fn is_ruptured_hemorrhagic_cyst(&self) -> bool {
        self.point_of_care_beta_hcg_positive == Some(false)
            && self.cul_de_sac_free_fluid_complex
            && !self.is_ovarian_torsion_suspected()
    }
}

/// Extended safety gates (Gates 5A, 5B, 5C, 6, 7) carried inside `AerospaceMedical360State`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ExtendedSafetyGates {
    /// Gate 5A: Blocks Ketorolac & systemic NSAIDs in thrombocytopenia, AKI/eGFR <60, oliguria, dehydration, or allergy.
    pub gate5_nsaid_renal_bleeding_locked: bool,
    /// Gate 5B: Blocks QTc-prolonging or allergen-contraindicated drugs (QTc >= 500 ms, G6PD, beta-lactam allergy).
    pub gate5_allergy_or_qtc_locked: bool,
    /// Gate 5C: Flags subpotent (<90% USP radiolytic potency) or depleted stock requiring therapeutic substitution.
    pub gate5_formulary_substitution_active: bool,
    /// Gate 6: Locks non-emergent invasive procedures under ARS neutropenia (ANC < 0.5 K/uL) or PLT < 75 K/uL.
    pub gate6_radiation_neutropenic_invasive_locked: bool,
    /// Gate 7: Requires organic delirium exclusion before psychiatric classification and enforces CMRS/QTc/SpO2 rules.
    pub gate7_bmed_delirium_or_restraint_guard_active: bool,
}

/// Unified 360-degree aerospace medical state envelope attached to `TelemetryPacket`
/// and `WireTelemetryPacket`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AerospaceMedical360State {
    pub crew_profile: CrewBiologicalProfile,
    pub lbnp_baseline: Option<LbnpBaselineState>,
    pub eclss_coupled: Option<EclssCoupledSummary>,
    pub radiation_ars: Option<RadiationArsState>,
    pub acute_emergency: Option<AcuteEmergencyState>,
    pub toxicology_dcs: Option<ToxicologyDcsState>,
    pub pharmacology_sepsis: Option<PharmacologySepsisState>,
    pub behavioral_health: Option<BehavioralHealthState>,
    pub extended_safety_gates: ExtendedSafetyGates,
}

/// Companion normative reference enum for 360-degree domains (#16..=#30),
/// preserving `NormativeClauseId::ALL.len() == 10` for K4 benchmark compatibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Aerospace360ClauseRef {
    NasaStd3001V1_3009CareerRadiation,
    NasaStd3001V1_3003BehavioralPrivacy,
    NasaStd3001V2_6004Co2ActionLimit,
    NasaExMcFormularyAndRadiolysis,
    NasaSmaToxicologySmacIdlh,
    NasaEvaDcsConkinPrebreathe,
    NasaMicrogravityCprAndAirway,
    NasaAcuteNonOperative0gSurgery,
    NasaFemalePelvicAndUrogynPocus,
}

/// Stress-test scenario input DTO for Phase 2 360-degree domains.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Aerospace360ScenarioInput {
    pub radiation_ars: Option<RadiationArsInput>,
    pub pulseless_cardiac_arrest: bool,
    pub anaphylaxis_suspected: bool,
    pub active_arterial_hemorrhage: bool,
    pub injury_hours_elapsed: Option<f64>,
    pub acute_abdomen_nom_suspected: bool,
    pub dental_ludwigs_angina_threat: bool,
    pub ocular_chemical_or_fb_injury: bool,
    pub seidel_perforation_positive: bool,
    pub eva_musculoskeletal_trauma: bool,
    pub nh3_ppm: Option<f64>,
    pub mmh_ppm: Option<f64>,
    pub no2_ppm: Option<f64>,
    pub co_ppm: Option<f64>,
    pub hcn_ppm: Option<f64>,
    pub hcl_ppm: Option<f64>,
    pub methemoglobin_pct: Option<f64>,
    pub perchlorate_exposure_mg_kg_d: Option<f64>,
    pub spencer_vge_grade: Option<u8>,
    pub helmet_water_intrusion_detected: bool,
    pub lcvg_pump_fault: bool,
    pub cabin_pressure_psi: Option<f64>,
    pub suit_pressure_psi: Option<f64>,
    pub prebreathe_o2_minutes: Option<f64>,
    pub suspected_infection: bool,
    pub current_qtc_ms: Option<f64>,
    pub gi_ulcer_history_or_bleed: bool,
    pub phq9_score: Option<u8>,
    pub gad7_score: Option<u8>,
    pub cssrs_suicidal_ideation_level: Option<u8>,
    pub acute_agitation_or_psychosis: bool,
    pub imminent_harm_to_self_or_vehicle: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backward_compatible_empty_json_deserializes_with_illustrative_status() {
        let state: AerospaceMedical360State =
            serde_json::from_str("{}").expect("empty json deserializes");
        assert_eq!(state.crew_profile.biological_sex, BiologicalSex::Male);
        assert_eq!(state.crew_profile.effective_baseline_hct_pct(), 44.0);
        assert_eq!(state.crew_profile.effective_baseline_hb_g_dl(), 15.0);

        let female = CrewBiologicalProfile::female_default();
        assert_eq!(female.effective_baseline_hct_pct(), 39.0);
        assert_eq!(female.effective_baseline_hb_g_dl(), 13.0);

        let rad = RadiationArsState::default();
        assert_eq!(
            rad.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
        let tox = ToxicologyDcsState::default();
        assert_eq!(
            tox.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
    }

    #[test]
    fn pelvic_pocus_predicates_detect_torsion_ectopic_and_cyst() {
        let torsion = PocusPelvicScan {
            performed: true,
            adnexal_whirlpool_sign: true,
            ..Default::default()
        };
        assert!(torsion.is_ovarian_torsion_suspected());

        let ectopic = PocusPelvicScan {
            performed: true,
            point_of_care_beta_hcg_positive: Some(true),
            cul_de_sac_free_fluid_complex: true,
            ..Default::default()
        };
        assert!(ectopic.is_ectopic_pregnancy_emergency());
        assert!(!ectopic.is_ruptured_hemorrhagic_cyst());
    }
}
