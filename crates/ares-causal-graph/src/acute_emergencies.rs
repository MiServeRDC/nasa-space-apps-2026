#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Domain 3: Acute Emergencies, Non-Operative 0g Surgery, Dental, Ocular,
//! Anaphylaxis, Microgravity CPR, Acute Urinary Retention & Pelvic/Urogyn Triage.
//!
//! All outputs embed `ModelValidationStatus::IllustrativeUnvalidated` until
//! validated against prospective clinical or flight-analog datasets.

use ares_core_types::medical_360::PocusPelvicScan;
use ares_core_types::telemetry::{Biometrics, ModelValidationStatus};
use serde::{Deserialize, Serialize};

/// Computes Shock Index (`HR / SBP`) when both vitals are finite and `SBP > 0`.
#[inline]
pub fn compute_shock_index(biometrics: &Biometrics) -> Option<f64> {
    match (biometrics.heart_rate_bpm, biometrics.sbp_mmhg) {
        (Some(hr), Some(sbp)) if hr.is_finite() && sbp.is_finite() && hr >= 0.0 && sbp > 0.0 => {
            Some(hr / sbp)
        }
        _ => None,
    }
}

/// Input for Playbook #17: Hemorrhagic Trauma & TXA Window (`<= 3.0 h`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct HemorrhagicTraumaInput {
    pub external_trauma_or_laceration: bool,
    pub active_arterial_bleed: bool,
    pub injury_hours_elapsed: Option<f64>,
    pub active_intravascular_thrombosis: bool,
}

/// Evaluation result for Playbook #17.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HemorrhagicTraumaEval {
    pub triggered: bool,
    pub shock_index: Option<f64>,
    pub txa_eligible: bool,
    pub txa_blocked_reason: Option<String>,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates external hemorrhagic trauma and the 3-hour TXA administration window.
pub fn evaluate_hemorrhagic_trauma(
    biometrics: &Biometrics,
    input: &HemorrhagicTraumaInput,
) -> HemorrhagicTraumaEval {
    let shock_index = compute_shock_index(biometrics);
    let si_elevated = shock_index.is_some_and(|si| si >= 0.90);
    let hypotensive = biometrics.sbp_mmhg.is_some_and(|sbp| sbp.is_finite() && sbp < 90.0);

    let triggered = input.active_arterial_bleed
        || (input.external_trauma_or_laceration && (si_elevated || hypotensive));

    let (txa_eligible, txa_blocked_reason) = if !triggered {
        (false, None)
    } else if input.active_intravascular_thrombosis {
        (
            false,
            Some("TXA contraindicated: active intravascular thrombosis".to_string()),
        )
    } else {
        match input.injury_hours_elapsed {
            Some(h) if h.is_finite() && (0.0..=3.0).contains(&h) => (true, None),
            Some(h) if h.is_finite() && h > 3.0 => (
                false,
                Some(format!(
                    "TXA window expired: {h:.2} h post-injury exceeds 3.0 h limit"
                )),
            ),
            _ => (
                false,
                Some("TXA blocked: injury onset time unknown or invalid".to_string()),
            ),
        }
    };

    HemorrhagicTraumaEval {
        triggered,
        shock_index,
        txa_eligible,
        txa_blocked_reason,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Input for Playbook #18: Torso Shock, Pericardial Tamponade & Hemoperitoneum.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct TorsoShockInput {
    pub pericardial_effusion_mm: f64,
    pub rv_diastolic_collapse: bool,
    pub efast_subxiphoid_pericardial_effusion: bool,
    pub efast_abdominal_free_fluid: bool,
    pub hemoperitoneum_detected: bool,
}

/// Evaluation result for Playbook #18.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TorsoShockEval {
    pub triggered: bool,
    pub tamponade_risk: bool,
    pub hemoperitoneum_shock: bool,
    pub shock_index: Option<f64>,
    pub permissive_hypotension_target_sbp_mmhg: Option<(f64, f64)>,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates pericardial tamponade risk and hemoperitoneum with shock.
pub fn evaluate_torso_shock(
    biometrics: &Biometrics,
    input: &TorsoShockInput,
) -> TorsoShockEval {
    let shock_index = compute_shock_index(biometrics);
    let si_elevated = shock_index.is_some_and(|si| si >= 0.90);

    let effusion_significant =
        input.pericardial_effusion_mm.is_finite() && input.pericardial_effusion_mm >= 10.0;
    let tamponade_risk =
        input.efast_subxiphoid_pericardial_effusion || effusion_significant || input.rv_diastolic_collapse;

    let hemoperitoneum_shock =
        (input.efast_abdominal_free_fluid || input.hemoperitoneum_detected) && si_elevated;

    let triggered = tamponade_risk || hemoperitoneum_shock;
    let permissive_hypotension_target_sbp_mmhg = if hemoperitoneum_shock {
        Some((80.0, 90.0))
    } else {
        None
    };

    TorsoShockEval {
        triggered,
        tamponade_risk,
        hemoperitoneum_shock,
        shock_index,
        permissive_hypotension_target_sbp_mmhg,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Input for Playbook #19: Conservative 0g Acute Abdomen (Non-Operative Management).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AcuteAbdomenNomInput {
    pub rlq_or_ruq_syndrome: bool,
    pub appendiceal_diameter_mm: Option<f64>,
    pub appendiceal_non_compressible: bool,
    pub cholelithiasis_or_wall_mm: Option<f64>,
    pub wbc_k_ul: Option<f64>,
    pub core_temp_c: Option<f64>,
    pub pocus_abscess_or_distended_gallbladder: bool,
}

/// Evaluation result for Playbook #19.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AcuteAbdomenNomEval {
    pub triggered: bool,
    pub appendicitis_criteria_met: bool,
    pub cholecystitis_criteria_met: bool,
    pub percutaneous_drain_indicated: bool,
    pub open_laparotomy_forbidden_in_0g: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates conservative 0g acute abdomen (NOM), explicitly forbidding open laparotomy in microgravity.
pub fn evaluate_acute_abdomen_0g(input: &AcuteAbdomenNomInput) -> AcuteAbdomenNomEval {
    let appendicitis_criteria_met = input.rlq_or_ruq_syndrome
        && input.appendiceal_non_compressible
        && input
            .appendiceal_diameter_mm
            .is_some_and(|d| d.is_finite() && d > 6.0);

    let inflammatory_response = input.wbc_k_ul.is_some_and(|w| w.is_finite() && w > 11.0)
        || input.core_temp_c.is_some_and(|t| t.is_finite() && t >= 38.0);

    let cholecystitis_criteria_met = input.rlq_or_ruq_syndrome
        && input
            .cholelithiasis_or_wall_mm
            .is_some_and(|w| w.is_finite() && w > 4.0)
        && inflammatory_response;

    let triggered = appendicitis_criteria_met || cholecystitis_criteria_met;

    AcuteAbdomenNomEval {
        triggered,
        appendicitis_criteria_met,
        cholecystitis_criteria_met,
        percutaneous_drain_indicated: triggered && input.pocus_abscess_or_distended_gallbladder,
        open_laparotomy_forbidden_in_0g: triggered,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Input for Playbook #20: EVA Musculoskeletal, Lumbar L1-L5 & Femoral Neck Fracture.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct EvaMskSpineInput {
    pub eva_glove_or_hut_trauma: bool,
    pub lumbar_l1_l5_radiculopathy: bool,
    pub cauda_equina_red_flags: bool,
    pub partial_g_fall: bool,
    pub bmd_loss_pct: f64,
    pub hip_or_femoral_neck_pain: bool,
}

/// Evaluation result for Playbook #20.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvaMskSpineEval {
    pub triggered: bool,
    pub femoral_neck_fracture_high_risk: bool,
    pub cauda_equina_urgent: bool,
    pub eva_no_go: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates EVA glove/HUT trauma, lumbar L1-L5 radiculopathy, and 0.38g hip/femoral neck fracture risk.
pub fn evaluate_eva_msk_spine_fracture(input: &EvaMskSpineInput) -> EvaMskSpineEval {
    let femoral_neck_fracture_high_risk = (input.partial_g_fall || input.hip_or_femoral_neck_pain)
        && input.bmd_loss_pct.is_finite()
        && input.bmd_loss_pct > 5.0;

    let triggered = input.eva_glove_or_hut_trauma
        || input.lumbar_l1_l5_radiculopathy
        || input.cauda_equina_red_flags
        || femoral_neck_fracture_high_risk;

    EvaMskSpineEval {
        triggered,
        femoral_neck_fracture_high_risk,
        cauda_equina_urgent: input.cauda_equina_red_flags,
        eva_no_go: triggered,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Input for Playbook #21: Dental & Maxillofacial Emergency (incl. Ludwig's Angina).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct DentalMaxillofacialInput {
    pub barodontalgia_or_pulpitis: bool,
    pub crown_or_root_fracture: bool,
    pub periapical_abscess: bool,
    pub submandibular_airway_threat: bool,
}

/// Evaluation result for Playbook #21.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DentalMaxillofacialEval {
    pub triggered: bool,
    pub ludwigs_angina_airway_emergency: bool,
    pub eva_no_go: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates dental emergencies and bilateral submandibular swelling (Ludwig's angina).
pub fn evaluate_dental_maxillofacial(input: &DentalMaxillofacialInput) -> DentalMaxillofacialEval {
    let triggered = input.barodontalgia_or_pulpitis
        || input.crown_or_root_fracture
        || input.periapical_abscess
        || input.submandibular_airway_threat;

    DentalMaxillofacialEval {
        triggered,
        ludwigs_angina_airway_emergency: input.submandibular_airway_threat,
        eva_no_go: input.submandibular_airway_threat,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Input for Playbook #22: Ocular Foreign Body, Chemical Burn & Seidel Check.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct OcularEmergencyInput {
    pub regolith_or_metallic_fb: bool,
    pub corneal_abrasion: bool,
    pub chemical_splash_nh3_lioh_propellant: bool,
    pub conjunctival_ph: Option<f64>,
    pub seidel_perforation_positive: bool,
}

/// Evaluation result for Playbook #22.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OcularEmergencyEval {
    pub triggered: bool,
    pub irrigation_required: bool,
    pub ph_neutralized: bool,
    pub irrigation_target_ph_range: (f64, f64),
    pub zero_pressure_fox_shield_required: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates ocular foreign body, chemical splash irrigation (target pH 7.0-7.4), and Seidel perforation.
pub fn evaluate_ocular_emergency(input: &OcularEmergencyInput) -> OcularEmergencyEval {
    let triggered = input.regolith_or_metallic_fb
        || input.corneal_abrasion
        || input.chemical_splash_nh3_lioh_propellant
        || input.seidel_perforation_positive;

    let ph_neutralized = input
        .conjunctival_ph
        .is_some_and(|ph| ph.is_finite() && (7.0..=7.4).contains(&ph));

    let irrigation_required =
        (input.chemical_splash_nh3_lioh_propellant || input.regolith_or_metallic_fb)
            && !input.seidel_perforation_positive
            && !ph_neutralized;

    OcularEmergencyEval {
        triggered,
        irrigation_required,
        ph_neutralized,
        irrigation_target_ph_range: (7.0, 7.4),
        zero_pressure_fox_shield_required: input.seidel_perforation_positive,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Input for Playbook #23: Anaphylaxis & Airway Emergency.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AnaphylaxisInput {
    pub post_allergen_exposure: bool,
    pub acute_urticaria_or_angioedema: bool,
    pub bronchospasm_or_stridor: bool,
}

/// Evaluation result for Playbook #23.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnaphylaxisEval {
    pub triggered: bool,
    pub immediate_im_epinephrine_required: bool,
    pub hypoxemic_airway_compromise: bool,
    pub hypotensive_shock: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates acute anaphylaxis criteria (urticaria/angioedema + SpO2 < 92% / stridor or SBP < 90 mmHg).
pub fn evaluate_anaphylaxis(
    biometrics: &Biometrics,
    input: &AnaphylaxisInput,
) -> AnaphylaxisEval {
    let hypoxemic_airway_compromise = input.bronchospasm_or_stridor
        || biometrics
            .spo2_pct
            .is_some_and(|spo2| spo2.is_finite() && spo2 < 92.0);
    let hypotensive_shock = biometrics
        .sbp_mmhg
        .is_some_and(|sbp| sbp.is_finite() && sbp < 90.0);

    let triggered = input.acute_urticaria_or_angioedema
        && (hypoxemic_airway_compromise || hypotensive_shock)
        && (input.post_allergen_exposure || hypoxemic_airway_compromise || hypotensive_shock);

    AnaphylaxisEval {
        triggered,
        immediate_im_epinephrine_required: triggered,
        hypoxemic_airway_compromise,
        hypotensive_shock,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Preferred microgravity CPR technique prior to/during CMRS deployment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MicrogravityCprTechnique {
    EvettsRussomanoOrHandstand,
    CmrsRestrainedStandard,
}

/// Input for Playbook #24: Microgravity Cardiac Arrest & CPR.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct MicrogravityCprInput {
    pub pulseless_cardiac_arrest: bool,
    pub cmrs_deployed: bool,
    pub shockable_rhythm_vf_pvt: bool,
}

/// Evaluation result for Playbook #24.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MicrogravityCprEval {
    pub triggered: bool,
    pub preferred_technique: MicrogravityCprTechnique,
    pub compression_rate_bpm_range: (u16, u16),
    pub compression_depth_mm: f64,
    pub cmrs_restraint_required: bool,
    pub aed_hull_isolation_required: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates pulseless cardiac arrest in microgravity (Evetts-Russomano / Handstand / CMRS / AED hull isolation).
pub fn evaluate_microgravity_cpr(
    biometrics: &Biometrics,
    input: &MicrogravityCprInput,
) -> MicrogravityCprEval {
    let zero_hr = biometrics
        .heart_rate_bpm
        .is_some_and(|hr| hr.is_finite() && hr == 0.0);
    let triggered = zero_hr || input.pulseless_cardiac_arrest;

    let preferred_technique = if input.cmrs_deployed {
        MicrogravityCprTechnique::CmrsRestrainedStandard
    } else {
        MicrogravityCprTechnique::EvettsRussomanoOrHandstand
    };

    MicrogravityCprEval {
        triggered,
        preferred_technique,
        compression_rate_bpm_range: (100, 120),
        compression_depth_mm: 50.0,
        cmrs_restraint_required: triggered && !input.cmrs_deployed,
        aed_hull_isolation_required: triggered,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Input for Playbook #25: Acute Urinary Retention (AUR) POCUS.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AcuteUrinaryRetentionInput {
    pub bladder_volume_ml: Option<f64>,
    pub catheterization_failed_or_stricture: bool,
    pub platelet_count_k_ul: Option<f64>,
}

/// Evaluation result for Playbook #25.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AcuteUrinaryRetentionEval {
    pub triggered: bool,
    pub suprapubic_cystostomy_indicated: bool,
    pub suprapubic_locked_by_gate6_thrombocytopenia: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates POCUS acute urinary retention (`bladder_volume_ml >= 500.0`).
pub fn evaluate_acute_urinary_retention(
    input: &AcuteUrinaryRetentionInput,
) -> AcuteUrinaryRetentionEval {
    let triggered = input
        .bladder_volume_ml
        .is_some_and(|v| v.is_finite() && v >= 500.0);
    let suprapubic_cystostomy_indicated = triggered && input.catheterization_failed_or_stricture;
    let suprapubic_locked_by_gate6_thrombocytopenia = suprapubic_cystostomy_indicated
        && input
            .platelet_count_k_ul
            .is_some_and(|plt| plt.is_finite() && plt < 75.0);

    AcuteUrinaryRetentionEval {
        triggered,
        suprapubic_cystostomy_indicated,
        suprapubic_locked_by_gate6_thrombocytopenia,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Clinical category for Playbook #30.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PelvicEmergencyCategory {
    None,
    EctopicOrHemorrhagicShock,
    OvarianTorsion,
    ComplicatedFemaleUti,
}

/// Input for Playbook #30: Female Pelvic & Urogyn POCUS Triage.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct PelvicUrogynInput {
    pub pelvic_pocus: PocusPelvicScan,
    pub febrile_or_flank_pain: bool,
}

/// Evaluation result for Playbook #30.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PelvicUrogynEval {
    pub triggered: bool,
    pub category: PelvicEmergencyCategory,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates female pelvic & urogyn POCUS emergencies (ectopic, ovarian torsion, hemorrhagic cyst, complicated UTI).
pub fn evaluate_pelvic_urogyn(
    biometrics: &Biometrics,
    input: &PelvicUrogynInput,
) -> PelvicUrogynEval {
    let si_elevated = compute_shock_index(biometrics).is_some_and(|si| si >= 0.90);
    let ectopic_or_ruptured_shock = input.pelvic_pocus.is_ectopic_pregnancy_emergency()
        || (input.pelvic_pocus.is_ruptured_hemorrhagic_cyst() && si_elevated);

    let category = if ectopic_or_ruptured_shock {
        PelvicEmergencyCategory::EctopicOrHemorrhagicShock
    } else if input.pelvic_pocus.is_ovarian_torsion_suspected() {
        PelvicEmergencyCategory::OvarianTorsion
    } else if input.pelvic_pocus.urine_leukocyte_nitrite_positive && input.febrile_or_flank_pain {
        PelvicEmergencyCategory::ComplicatedFemaleUti
    } else if input.pelvic_pocus.is_ruptured_hemorrhagic_cyst() {
        PelvicEmergencyCategory::EctopicOrHemorrhagicShock
    } else {
        PelvicEmergencyCategory::None
    };

    PelvicUrogynEval {
        triggered: category != PelvicEmergencyCategory::None,
        category,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

/// Combined acute triage input bundle across all Domain 3 evaluators.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AcuteEmergencyTriageInput {
    pub hemorrhage: HemorrhagicTraumaInput,
    pub torso_shock: TorsoShockInput,
    pub acute_abdomen: AcuteAbdomenNomInput,
    pub eva_msk: EvaMskSpineInput,
    pub dental: DentalMaxillofacialInput,
    pub ocular: OcularEmergencyInput,
    pub anaphylaxis: AnaphylaxisInput,
    pub cpr: MicrogravityCprInput,
    pub aur: AcuteUrinaryRetentionInput,
    pub pelvic: PelvicUrogynInput,
}

/// Combined acute triage output with prioritized `active_acute_playbook_code`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AcuteEmergencyTriageSummary {
    pub active_acute_playbook_code: Option<u16>,
    pub hemorrhage: HemorrhagicTraumaEval,
    pub torso_shock: TorsoShockEval,
    pub acute_abdomen: AcuteAbdomenNomEval,
    pub eva_msk: EvaMskSpineEval,
    pub dental: DentalMaxillofacialEval,
    pub ocular: OcularEmergencyEval,
    pub anaphylaxis: AnaphylaxisEval,
    pub cpr: MicrogravityCprEval,
    pub aur: AcuteUrinaryRetentionEval,
    pub pelvic: PelvicUrogynEval,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates all Domain 3 acute emergency evaluators and selects the highest-acuity playbook code.
pub fn evaluate_acute_emergencies_triage(
    biometrics: &Biometrics,
    input: &AcuteEmergencyTriageInput,
) -> AcuteEmergencyTriageSummary {
    let cpr = evaluate_microgravity_cpr(biometrics, &input.cpr);
    let anaphylaxis = evaluate_anaphylaxis(biometrics, &input.anaphylaxis);
    let hemorrhage = evaluate_hemorrhagic_trauma(biometrics, &input.hemorrhage);
    let torso_shock = evaluate_torso_shock(biometrics, &input.torso_shock);
    let ocular = evaluate_ocular_emergency(&input.ocular);
    let dental = evaluate_dental_maxillofacial(&input.dental);
    let pelvic = evaluate_pelvic_urogyn(biometrics, &input.pelvic);
    let acute_abdomen = evaluate_acute_abdomen_0g(&input.acute_abdomen);
    let aur = evaluate_acute_urinary_retention(&input.aur);
    let eva_msk = evaluate_eva_msk_spine_fracture(&input.eva_msk);

    let active_acute_playbook_code = if cpr.triggered {
        Some(24)
    } else if anaphylaxis.triggered {
        Some(23)
    } else if hemorrhage.triggered {
        Some(17)
    } else if torso_shock.triggered {
        Some(18)
    } else if ocular.triggered {
        Some(22)
    } else if dental.triggered {
        Some(21)
    } else if pelvic.triggered {
        Some(30)
    } else if acute_abdomen.triggered {
        Some(19)
    } else if aur.triggered {
        Some(25)
    } else if eva_msk.triggered {
        Some(20)
    } else {
        None
    };

    AcuteEmergencyTriageSummary {
        active_acute_playbook_code,
        hemorrhage,
        torso_shock,
        acute_abdomen,
        eva_msk,
        dental,
        ocular,
        anaphylaxis,
        cpr,
        aur,
        pelvic,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nominal_biometrics() -> Biometrics {
        Biometrics {
            heart_rate_bpm: Some(72.0),
            sbp_mmhg: Some(120.0),
            spo2_pct: Some(98.0),
            ..Biometrics::default()
        }
    }

    #[test]
    fn hemorrhage_txa_window_allows_within_3h_and_blocks_after_3h_or_thrombosis() {
        let mut bio = nominal_biometrics();
        bio.heart_rate_bpm = Some(110.0);
        bio.sbp_mmhg = Some(100.0);

        let within_3h = HemorrhagicTraumaInput {
            external_trauma_or_laceration: true,
            active_arterial_bleed: true,
            injury_hours_elapsed: Some(2.5),
            active_intravascular_thrombosis: false,
        };
        let eval_ok = evaluate_hemorrhagic_trauma(&bio, &within_3h);
        assert!(eval_ok.triggered);
        assert!(eval_ok.txa_eligible);
        assert_eq!(
            eval_ok.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );

        let after_3h = HemorrhagicTraumaInput {
            injury_hours_elapsed: Some(3.5),
            ..within_3h.clone()
        };
        let eval_late = evaluate_hemorrhagic_trauma(&bio, &after_3h);
        assert!(eval_late.triggered);
        assert!(!eval_late.txa_eligible);

        let with_thrombus = HemorrhagicTraumaInput {
            active_intravascular_thrombosis: true,
            ..within_3h
        };
        let eval_thrombus = evaluate_hemorrhagic_trauma(&bio, &with_thrombus);
        assert!(!eval_thrombus.txa_eligible);
    }

    #[test]
    fn torso_shock_detects_tamponade_and_hemoperitoneum_permissive_hypotension() {
        let mut bio = nominal_biometrics();
        bio.heart_rate_bpm = Some(110.0);
        bio.sbp_mmhg = Some(105.0);

        let input = TorsoShockInput {
            pericardial_effusion_mm: 12.0,
            rv_diastolic_collapse: true,
            efast_subxiphoid_pericardial_effusion: true,
            efast_abdominal_free_fluid: true,
            hemoperitoneum_detected: true,
        };
        let eval = evaluate_torso_shock(&bio, &input);
        assert!(eval.triggered);
        assert!(eval.tamponade_risk);
        assert!(eval.hemoperitoneum_shock);
        assert_eq!(eval.permissive_hypotension_target_sbp_mmhg, Some((80.0, 90.0)));
    }

    #[test]
    fn acute_abdomen_0g_forbids_open_laparotomy() {
        let input = AcuteAbdomenNomInput {
            rlq_or_ruq_syndrome: true,
            appendiceal_diameter_mm: Some(8.2),
            appendiceal_non_compressible: true,
            pocus_abscess_or_distended_gallbladder: true,
            ..AcuteAbdomenNomInput::default()
        };
        let eval = evaluate_acute_abdomen_0g(&input);
        assert!(eval.triggered);
        assert!(eval.appendicitis_criteria_met);
        assert!(eval.percutaneous_drain_indicated);
        assert!(eval.open_laparotomy_forbidden_in_0g);
    }

    #[test]
    fn eva_msk_and_dental_ludwigs_set_eva_no_go() {
        let msk = evaluate_eva_msk_spine_fracture(&EvaMskSpineInput {
            partial_g_fall: true,
            bmd_loss_pct: 6.5,
            hip_or_femoral_neck_pain: true,
            ..EvaMskSpineInput::default()
        });
        assert!(msk.triggered);
        assert!(msk.femoral_neck_fracture_high_risk);
        assert!(msk.eva_no_go);

        let dental = evaluate_dental_maxillofacial(&DentalMaxillofacialInput {
            submandibular_airway_threat: true,
            ..DentalMaxillofacialInput::default()
        });
        assert!(dental.triggered);
        assert!(dental.ludwigs_angina_airway_emergency);
        assert!(dental.eva_no_go);
    }

    #[test]
    fn ocular_seidel_positive_mandates_zero_pressure_fox_shield_and_no_irrigation() {
        let eval = evaluate_ocular_emergency(&OcularEmergencyInput {
            regolith_or_metallic_fb: true,
            seidel_perforation_positive: true,
            conjunctival_ph: Some(7.2),
            ..OcularEmergencyInput::default()
        });
        assert!(eval.triggered);
        assert!(eval.zero_pressure_fox_shield_required);
        assert!(!eval.irrigation_required);
    }

    #[test]
    fn anaphylaxis_and_microgravity_cpr_triggers_and_priority() {
        let mut arrest_bio = nominal_biometrics();
        arrest_bio.heart_rate_bpm = Some(0.0);

        let cpr = evaluate_microgravity_cpr(&arrest_bio, &MicrogravityCprInput::default());
        assert!(cpr.triggered);
        assert_eq!(cpr.preferred_technique, MicrogravityCprTechnique::EvettsRussomanoOrHandstand);
        assert!(cpr.cmrs_restraint_required);
        assert!(cpr.aed_hull_isolation_required);

        let mut anaph_bio = nominal_biometrics();
        anaph_bio.spo2_pct = Some(89.0);
        let anaph = evaluate_anaphylaxis(
            &anaph_bio,
            &AnaphylaxisInput {
                post_allergen_exposure: true,
                acute_urticaria_or_angioedema: true,
                bronchospasm_or_stridor: true,
            },
        );
        assert!(anaph.triggered);
        assert!(anaph.immediate_im_epinephrine_required);
    }

    #[test]
    fn aur_and_pelvic_pocus_triage_work() {
        let aur = evaluate_acute_urinary_retention(&AcuteUrinaryRetentionInput {
            bladder_volume_ml: Some(540.0),
            catheterization_failed_or_stricture: true,
            platelet_count_k_ul: Some(60.0),
        });
        assert!(aur.triggered);
        assert!(aur.suprapubic_cystostomy_indicated);
        assert!(aur.suprapubic_locked_by_gate6_thrombocytopenia);

        let pelvic = evaluate_pelvic_urogyn(
            &nominal_biometrics(),
            &PelvicUrogynInput {
                pelvic_pocus: PocusPelvicScan {
                    performed: true,
                    point_of_care_beta_hcg_positive: Some(true),
                    cul_de_sac_free_fluid_complex: true,
                    ..PocusPelvicScan::default()
                },
                febrile_or_flank_pain: false,
            },
        );
        assert!(pelvic.triggered);
        assert_eq!(pelvic.category, PelvicEmergencyCategory::EctopicOrHemorrhagicShock);
    }

    #[test]
    fn unified_triage_prioritizes_cpr_above_all_other_emergencies() {
        let mut bio = nominal_biometrics();
        bio.heart_rate_bpm = Some(0.0);
        bio.spo2_pct = Some(88.0);

        let summary = evaluate_acute_emergencies_triage(
            &bio,
            &AcuteEmergencyTriageInput {
                anaphylaxis: AnaphylaxisInput {
                    post_allergen_exposure: true,
                    acute_urticaria_or_angioedema: true,
                    bronchospasm_or_stridor: true,
                },
                aur: AcuteUrinaryRetentionInput {
                    bladder_volume_ml: Some(600.0),
                    ..AcuteUrinaryRetentionInput::default()
                },
                ..AcuteEmergencyTriageInput::default()
            },
        );
        assert_eq!(summary.active_acute_playbook_code, Some(24));
        assert_eq!(
            summary.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
    }
}
