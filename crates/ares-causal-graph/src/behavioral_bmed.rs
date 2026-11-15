//! Behavioral Medicine (BMed), Gate 7A mandatory organic/toxic-metabolic delirium exclusion,
//! and circadian-cognitive behavioral risk coupling.

use crate::circadian_cognitive::CircadianCognitiveState;
use ares_core_types::medical_360::{BMedTriageClass, BehavioralHealthState};
use ares_core_types::telemetry::ModelValidationStatus;

pub const PHQ9_MODERATE_THRESHOLD: u8 = 10;
pub const PHQ9_SEVERE_THRESHOLD: u8 = 20;
pub const GAD7_MODERATE_THRESHOLD: u8 = 10;
pub const GAD7_SEVERE_THRESHOLD: u8 = 15;
pub const CSSRS_ACTIVE_IDEATION_THRESHOLD: u8 = 3;

pub const DELIRIUM_SPO2_HYPOXEMIA_PCT: f64 = 90.0;
pub const DELIRIUM_MAX_PPCO2_MMHG: f64 = 4.0;
pub const DELIRIUM_CORE_TEMP_HYPERTHERMIA_C: f64 = 38.3;
pub const DELIRIUM_LACTATE_MMOL_L: f64 = 2.0;

pub const CIRCADIAN_SLEEP_DEBT_MILD_HOURS: f64 = 4.0;
pub const CIRCADIAN_FATIGUE_INDEX_MILD: f64 = 0.45;

/// Input parameters for Behavioral Medicine (BMed) screening and Gate 7A delirium exclusion.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct BMedScreeningInput {
    pub phq9_score: Option<u8>,
    pub gad7_score: Option<u8>,
    pub cssrs_suicidal_ideation_level: Option<u8>,
    pub acute_agitation_or_psychosis: bool,
    pub imminent_harm_to_self_or_vehicle: bool,
    pub spo2_pct: Option<f64>,
    pub max_ppco2_mmhg: Option<f64>,
    pub core_temp_c: Option<f64>,
    pub lactate_mmol_l: Option<f64>,
    pub toxicant_active: bool,
    pub circadian_cognitive: Option<CircadianCognitiveState>,
}

/// Detailed BMed evaluation output including Gate 7A organic mimic causes and validation provenance.
#[derive(Debug, Clone, PartialEq)]
pub struct BMedEvaluation {
    pub state: BehavioralHealthState,
    pub organic_delirium_causes: Vec<String>,
    pub severe_depression: bool,
    pub severe_anxiety: bool,
    pub active_suicidal_ideation: bool,
    pub circadian_fatigue_aggravated: bool,
    pub gate7_bmed_delirium_or_restraint_guard_active: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates Gate 7A organic/toxic-metabolic delirium mimics and BMed triage classification.
pub fn evaluate_bmed_state(input: &BMedScreeningInput) -> BMedEvaluation {
    let mut organic_causes = Vec::new();

    if input
        .spo2_pct
        .is_some_and(|v| v.is_finite() && v < DELIRIUM_SPO2_HYPOXEMIA_PCT)
    {
        organic_causes.push("hypoxemia_spo2_lt_90".to_string());
    }
    if input
        .max_ppco2_mmhg
        .is_some_and(|v| v.is_finite() && v > DELIRIUM_MAX_PPCO2_MMHG)
    {
        organic_causes.push("hypercapnia_ppco2_gt_4_0_mmhg".to_string());
    }
    if input
        .core_temp_c
        .is_some_and(|v| v.is_finite() && v > DELIRIUM_CORE_TEMP_HYPERTHERMIA_C)
    {
        organic_causes.push("hyperthermia_core_temp_gt_38_3_c".to_string());
    }
    if input
        .lactate_mmol_l
        .is_some_and(|v| v.is_finite() && v > DELIRIUM_LACTATE_MMOL_L)
    {
        organic_causes.push("hyperlactatemia_lactate_gt_2_0_mmol_l".to_string());
    }
    if input.toxicant_active {
        organic_causes.push("toxicant_exposure_active".to_string());
    }

    let organic_delirium_mimic_detected = !organic_causes.is_empty();

    let moderate_depression = input
        .phq9_score
        .is_some_and(|s| s >= PHQ9_MODERATE_THRESHOLD);
    let severe_depression = input
        .phq9_score
        .is_some_and(|s| s >= PHQ9_SEVERE_THRESHOLD);
    let moderate_anxiety = input
        .gad7_score
        .is_some_and(|s| s >= GAD7_MODERATE_THRESHOLD);
    let severe_anxiety = input
        .gad7_score
        .is_some_and(|s| s >= GAD7_SEVERE_THRESHOLD);
    let active_suicidal_ideation = input
        .cssrs_suicidal_ideation_level
        .is_some_and(|lvl| lvl >= CSSRS_ACTIVE_IDEATION_THRESHOLD);

    let circadian_fatigue_aggravated = input.circadian_cognitive.is_some_and(|cc| {
        (cc.sleep_debt_hours.is_finite() && cc.sleep_debt_hours >= CIRCADIAN_SLEEP_DEBT_MILD_HOURS)
            || (cc.cognitive_fatigue_index.is_finite()
                && cc.cognitive_fatigue_index >= CIRCADIAN_FATIGUE_INDEX_MILD)
    });

    let mild_psych_symptoms = input.phq9_score.is_some_and(|s| s >= 5)
        || input.gad7_score.is_some_and(|s| s >= 5)
        || input.cssrs_suicidal_ideation_level.is_some_and(|lvl| lvl >= 1);

    // Gate 7A: Mandatory organic/toxic-metabolic delirium exclusion before primary psychiatric diagnosis.
    let triage_classification = if input.acute_agitation_or_psychosis && organic_delirium_mimic_detected {
        BMedTriageClass::SecondaryOrganicToxicMetabolicDelirium
    } else if input.imminent_harm_to_self_or_vehicle {
        BMedTriageClass::ImminentSelfOrVehicleHarmCrisis
    } else if input.acute_agitation_or_psychosis || active_suicidal_ideation {
        BMedTriageClass::PrimaryAcutePsychiatricCrisis
    } else if moderate_depression || moderate_anxiety {
        BMedTriageClass::ModerateDepressionOrAnxiety
    } else if mild_psych_symptoms || circadian_fatigue_aggravated {
        BMedTriageClass::MildAdjustmentOrFatigue
    } else {
        BMedTriageClass::Nominal
    };

    let crisis_active = matches!(
        triage_classification,
        BMedTriageClass::SecondaryOrganicToxicMetabolicDelirium
            | BMedTriageClass::PrimaryAcutePsychiatricCrisis
            | BMedTriageClass::ImminentSelfOrVehicleHarmCrisis
    );

    let airlock_software_lockout_active =
        crisis_active || input.imminent_harm_to_self_or_vehicle || active_suicidal_ideation;
    let cmrs_restraint_authorized = input.imminent_harm_to_self_or_vehicle;
    let gate7_active =
        (input.acute_agitation_or_psychosis && organic_delirium_mimic_detected) || crisis_active;

    let state = BehavioralHealthState {
        phq9_score: input.phq9_score,
        gad7_score: input.gad7_score,
        cssrs_suicidal_ideation_level: input.cssrs_suicidal_ideation_level,
        acute_agitation_or_psychosis: input.acute_agitation_or_psychosis,
        imminent_harm_to_self_or_vehicle: input.imminent_harm_to_self_or_vehicle,
        organic_delirium_mimic_detected,
        triage_classification,
        airlock_software_lockout_active,
        cmrs_restraint_authorized,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    };

    BMedEvaluation {
        state,
        organic_delirium_causes: organic_causes,
        severe_depression,
        severe_anxiety,
        active_suicidal_ideation,
        circadian_fatigue_aggravated,
        gate7_bmed_delirium_or_restraint_guard_active: gate7_active,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::circadian_cognitive::MarsCircadianOscillator;

    #[test]
    fn nominal_state_has_illustrative_status_and_no_lockout() {
        let eval = evaluate_bmed_state(&BMedScreeningInput::default());
        assert_eq!(eval.state.triage_classification, BMedTriageClass::Nominal);
        assert!(!eval.state.airlock_software_lockout_active);
        assert!(!eval.state.cmrs_restraint_authorized);
        assert!(!eval.gate7_bmed_delirium_or_restraint_guard_active);
        assert_eq!(
            eval.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
        assert_eq!(
            eval.state.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
    }

    #[test]
    fn circadian_fatigue_couples_to_mild_adjustment_or_fatigue() {
        let mut osc = MarsCircadianOscillator::default();
        osc.step_state(18.0, false, 0.0, 10.0);
        let cog = osc.evaluate_cognitive_state(10_000.0, None, Some(0.8), None);
        assert!(cog.cognitive_fatigue_index >= CIRCADIAN_FATIGUE_INDEX_MILD);

        let eval = evaluate_bmed_state(&BMedScreeningInput {
            circadian_cognitive: Some(cog),
            ..BMedScreeningInput::default()
        });
        assert!(eval.circadian_fatigue_aggravated);
        assert_eq!(
            eval.state.triage_classification,
            BMedTriageClass::MildAdjustmentOrFatigue
        );
    }

    #[test]
    fn phq9_gad7_and_cssrs_thresholds_classify_correctly() {
        let mod_eval = evaluate_bmed_state(&BMedScreeningInput {
            phq9_score: Some(21),
            gad7_score: Some(16),
            ..BMedScreeningInput::default()
        });
        assert_eq!(
            mod_eval.state.triage_classification,
            BMedTriageClass::ModerateDepressionOrAnxiety
        );
        assert!(mod_eval.severe_depression);
        assert!(mod_eval.severe_anxiety);
        assert!(!mod_eval.state.airlock_software_lockout_active);

        let cssrs_eval = evaluate_bmed_state(&BMedScreeningInput {
            cssrs_suicidal_ideation_level: Some(3),
            ..BMedScreeningInput::default()
        });
        assert!(cssrs_eval.active_suicidal_ideation);
        assert_eq!(
            cssrs_eval.state.triage_classification,
            BMedTriageClass::PrimaryAcutePsychiatricCrisis
        );
        assert!(cssrs_eval.state.airlock_software_lockout_active);
        assert!(!cssrs_eval.state.cmrs_restraint_authorized);
    }

    #[test]
    fn gate7a_excludes_organic_delirium_mimics_before_primary_psychosis() {
        let mimics = [
            BMedScreeningInput {
                acute_agitation_or_psychosis: true,
                spo2_pct: Some(88.5),
                ..BMedScreeningInput::default()
            },
            BMedScreeningInput {
                acute_agitation_or_psychosis: true,
                max_ppco2_mmhg: Some(4.5),
                ..BMedScreeningInput::default()
            },
            BMedScreeningInput {
                acute_agitation_or_psychosis: true,
                core_temp_c: Some(38.9),
                ..BMedScreeningInput::default()
            },
            BMedScreeningInput {
                acute_agitation_or_psychosis: true,
                lactate_mmol_l: Some(2.4),
                ..BMedScreeningInput::default()
            },
            BMedScreeningInput {
                acute_agitation_or_psychosis: true,
                toxicant_active: true,
                ..BMedScreeningInput::default()
            },
        ];

        for input in &mimics {
            let eval = evaluate_bmed_state(input);
            assert_eq!(
                eval.state.triage_classification,
                BMedTriageClass::SecondaryOrganicToxicMetabolicDelirium
            );
            assert!(eval.state.organic_delirium_mimic_detected);
            assert!(eval.gate7_bmed_delirium_or_restraint_guard_active);
            assert!(eval.state.airlock_software_lockout_active);
            assert!(!eval.state.cmrs_restraint_authorized);
            assert!(!eval.organic_delirium_causes.is_empty());
        }
    }

    #[test]
    fn imminent_harm_authorizes_cmrs_restraint_and_airlock_lockout() {
        let eval = evaluate_bmed_state(&BMedScreeningInput {
            acute_agitation_or_psychosis: true,
            imminent_harm_to_self_or_vehicle: true,
            ..BMedScreeningInput::default()
        });
        assert_eq!(
            eval.state.triage_classification,
            BMedTriageClass::ImminentSelfOrVehicleHarmCrisis
        );
        assert!(eval.state.cmrs_restraint_authorized);
        assert!(eval.state.airlock_software_lockout_active);
        assert!(eval.gate7_bmed_delirium_or_restraint_guard_active);
    }

    #[test]
    fn non_finite_inputs_do_not_trigger_false_organic_delirium() {
        let eval = evaluate_bmed_state(&BMedScreeningInput {
            acute_agitation_or_psychosis: true,
            spo2_pct: Some(f64::NAN),
            max_ppco2_mmhg: Some(f64::INFINITY),
            core_temp_c: Some(f64::NEG_INFINITY),
            lactate_mmol_l: Some(f64::NAN),
            ..BMedScreeningInput::default()
        });
        assert!(!eval.state.organic_delirium_mimic_detected);
        assert_eq!(
            eval.state.triage_classification,
            BMedTriageClass::PrimaryAcutePsychiatricCrisis
        );
    }
}
