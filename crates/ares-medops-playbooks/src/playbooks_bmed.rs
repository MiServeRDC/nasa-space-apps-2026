//! Behavioral Medicine (BMed) Playbook #29 (`PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS`)
//! and Gate 7A / 7B / 7C deterministic clinical safety enforcement.

use ares_core_types::medical_360::{BMedTriageClass, BehavioralHealthState};
use ares_core_types::telemetry::{ActivePlaybook, CountermeasureAction, SafetyGates};

pub const PLAYBOOK_29_CODE: u16 = 29;
pub const PLAYBOOK_29_ID: &str = "PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS";
pub const PLAYBOOK_29_TITLE: &str =
    "Playbook #29: Acute Psychiatric Crisis, Delirium Exclusion & 0g Rapid Tranquilization";

pub const QTC_BMED_KETAMINE_SUBSTITUTION_MS: f64 = 470.0;

pub const ACT_GATE7_TREAT_REVERSIBLE_ORGANIC_DELIRIUM_CAUSE_FIRST: &str =
    "ACT_GATE7_TREAT_REVERSIBLE_ORGANIC_DELIRIUM_CAUSE_FIRST";
pub const ACT_BMED_VERBAL_DEESCALATION_1ON1_WATCH_AIRLOCK_LOCKOUT: &str =
    "ACT_BMED_VERBAL_DEESCALATION_1ON1_WATCH_AIRLOCK_LOCKOUT";
pub const ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK: &str =
    "ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK";
pub const ACT_BMED_OLANZAPINE_5_10MG_ODT: &str = "ACT_BMED_OLANZAPINE_5_10MG_ODT";
pub const ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM: &str =
    "ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM";
pub const ACT_BMED_MIDAZOLAM_5MG_INTRANASAL: &str = "ACT_BMED_MIDAZOLAM_5MG_INTRANASAL";
pub const ACT_BMED_KETAMINE_1_2MG_KG_IM_DISSOCIATIVE: &str =
    "ACT_BMED_KETAMINE_1_2MG_KG_IM_DISSOCIATIVE";

fn action_organic_delirium_first() -> CountermeasureAction {
    CountermeasureAction {
        action_id: ACT_GATE7_TREAT_REVERSIBLE_ORGANIC_DELIRIUM_CAUSE_FIRST.to_string(),
        label: "Gate 7A: Treat reversible organic/toxic-metabolic delirium cause first (O2, ECLSS CO2 scrubber, sepsis antibiotics, or toxicant isolation) before primary psychiatric diagnosis".to_string(),
        category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
        delta_rho_per_hour: 0.45,
    }
}

fn action_verbal_deescalation_airlock_lockout() -> CountermeasureAction {
    CountermeasureAction {
        action_id: ACT_BMED_VERBAL_DEESCALATION_1ON1_WATCH_AIRLOCK_LOCKOUT.to_string(),
        label: "Non-confrontational verbal de-escalation, 1-on-1 crew watch, software interlock on airlock/depressurization/propellant valves, and sharp/pharmaceutical locker securing".to_string(),
        category: "BEHAVIORAL_SAFETY".to_string(),
        delta_rho_per_hour: 0.25,
    }
}

fn action_cmrs_restraint() -> CountermeasureAction {
    CountermeasureAction {
        action_id: ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK.to_string(),
        label: "Gate 7B authorized CMRS restraint with mandatory q15min neurovascular and airway check (imminent harm to self or vehicle)".to_string(),
        category: "RESTRAINT_PROTOCOL".to_string(),
        delta_rho_per_hour: 0.20,
    }
}

fn action_olanzapine_odt() -> CountermeasureAction {
    CountermeasureAction {
        action_id: ACT_BMED_OLANZAPINE_5_10MG_ODT.to_string(),
        label: "Administer Olanzapine 5-10 mg ODT (rapid oral dissolving tablet; zero 0g liquid aspiration risk)".to_string(),
        category: "PHARMACOLOGICAL_TRANQUILIZATION".to_string(),
        delta_rho_per_hour: 0.30,
    }
}

fn action_midazolam_intranasal() -> CountermeasureAction {
    CountermeasureAction {
        action_id: ACT_BMED_MIDAZOLAM_5MG_INTRANASAL.to_string(),
        label: "Administer Midazolam 5 mg intranasal via atomized mucosal delivery (zero 0g needle-stick hazard)".to_string(),
        category: "PHARMACOLOGICAL_TRANQUILIZATION".to_string(),
        delta_rho_per_hour: 0.32,
    }
}

fn action_haloperidol_lorazepam_im() -> CountermeasureAction {
    CountermeasureAction {
        action_id: ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM.to_string(),
        label: "Administer Haloperidol 5 mg + Lorazepam 2 mg IM for severe uncooperative agitation (QTc < 470 ms verified)".to_string(),
        category: "PHARMACOLOGICAL_TRANQUILIZATION".to_string(),
        delta_rho_per_hour: 0.35,
    }
}

fn action_ketamine_im_qtc_fallback() -> CountermeasureAction {
    CountermeasureAction {
        action_id: ACT_BMED_KETAMINE_1_2MG_KG_IM_DISSOCIATIVE.to_string(),
        label: "Gate 5B/7C QTc >= 470 ms substitution: Ketamine 1-2 mg/kg IM dissociative tranquilization with mandatory continuous SpO2/capnography and i-gel airway standby".to_string(),
        category: "PHARMACOLOGICAL_TRANQUILIZATION".to_string(),
        delta_rho_per_hour: 0.38,
    }
}

#[inline]
fn is_qtc_prolonging_bmed_drug(action_id: &str) -> bool {
    action_id == ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM
        || action_id == ACT_BMED_OLANZAPINE_5_10MG_ODT
}

/// Builds `PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS` (`u16 = 29`) with Gate 7A/7B/7C and Gate 5B QTc rules.
pub fn build_playbook_29_bmed_crisis(
    bmed: &BehavioralHealthState,
    cooperative_for_oral_odt: bool,
    effective_qtc_ms: Option<f64>,
    base_gates: SafetyGates,
    mut causal_chain_summary: Vec<String>,
) -> ActivePlaybook {
    let qtc_ms = effective_qtc_ms
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(410.0);
    let qtc_prolonged = qtc_ms >= QTC_BMED_KETAMINE_SUBSTITUTION_MS;
    let organic_delirium = bmed.organic_delirium_mimic_detected
        || bmed.triage_classification == BMedTriageClass::SecondaryOrganicToxicMetabolicDelirium;

    let mut actions = Vec::new();

    if organic_delirium {
        causal_chain_summary.push(
            "Gate 7A: Organic/toxic-metabolic delirium mimic detected; treat reversible hypoxia/hypercapnia/hyperthermia/lactate/toxicant first".to_string(),
        );
        actions.push(action_organic_delirium_first());
    }

    actions.push(action_verbal_deescalation_airlock_lockout());

    if bmed.imminent_harm_to_self_or_vehicle {
        causal_chain_summary.push(
            "Gate 7B: Imminent harm to self or vehicle; CMRS restraint q15min neurovascular check authorized".to_string(),
        );
        actions.push(action_cmrs_restraint());
    }

    if qtc_prolonged {
        causal_chain_summary.push(format!(
            "Gate 5B/7C: QTc {qtc_ms:.0} ms >= 470 ms; substituted Ketamine IM + continuous SpO2/capnography + i-gel airway standby"
        ));
        actions.push(action_ketamine_im_qtc_fallback());
    } else if cooperative_for_oral_odt {
        actions.push(action_olanzapine_odt());
    } else {
        actions.push(action_midazolam_intranasal());
        actions.push(action_haloperidol_lorazepam_im());
    }

    let playbook = ActivePlaybook {
        playbook_id: PLAYBOOK_29_ID.to_string(),
        title: PLAYBOOK_29_TITLE.to_string(),
        causal_chain_summary,
        safety_gates: base_gates,
        actions,
    };

    apply_gate7_bmed_guards(playbook, bmed, qtc_ms)
}

/// Enforces Gate 7A (organic delirium first), Gate 7B (strip CMRS restraint unless `imminent_harm_to_self_or_vehicle`),
/// and Gate 7C/5B (strip QTc-prolonging neuroleptics when `effective_qtc_ms >= 470 ms` and substitute Ketamine IM).
pub fn apply_gate7_bmed_guards(
    mut playbook: ActivePlaybook,
    bmed: &BehavioralHealthState,
    effective_qtc_ms: f64,
) -> ActivePlaybook {
    let organic_delirium = bmed.organic_delirium_mimic_detected
        || bmed.triage_classification == BMedTriageClass::SecondaryOrganicToxicMetabolicDelirium;

    if organic_delirium
        && !playbook
            .actions
            .iter()
            .any(|a| a.action_id == ACT_GATE7_TREAT_REVERSIBLE_ORGANIC_DELIRIUM_CAUSE_FIRST)
    {
        playbook.actions.insert(0, action_organic_delirium_first());
    }

    // Gate 7B: Strip CMRS restraint unless imminent_harm_to_self_or_vehicle == true.
    if !bmed.imminent_harm_to_self_or_vehicle {
        playbook
            .actions
            .retain(|a| a.action_id != ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK);
    }

    // Gate 7C + Gate 5B: Substitute Ketamine IM if QTc >= 470 ms.
    if effective_qtc_ms.is_finite() && effective_qtc_ms >= QTC_BMED_KETAMINE_SUBSTITUTION_MS {
        let had_qtc_drug = playbook
            .actions
            .iter()
            .any(|a| is_qtc_prolonging_bmed_drug(&a.action_id));
        if had_qtc_drug {
            playbook
                .actions
                .retain(|a| !is_qtc_prolonging_bmed_drug(&a.action_id));
        }
        if !playbook
            .actions
            .iter()
            .any(|a| a.action_id == ACT_BMED_KETAMINE_1_2MG_KG_IM_DISSOCIATIVE)
        {
            playbook.actions.push(action_ketamine_im_qtc_fallback());
        }
    }

    playbook
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gate7a_prepends_organic_delirium_action_and_gate7b_strips_restraint() {
        let bmed = BehavioralHealthState {
            acute_agitation_or_psychosis: true,
            organic_delirium_mimic_detected: true,
            imminent_harm_to_self_or_vehicle: false,
            triage_classification: BMedTriageClass::SecondaryOrganicToxicMetabolicDelirium,
            ..BehavioralHealthState::default()
        };

        let pb = build_playbook_29_bmed_crisis(
            &bmed,
            true,
            Some(415.0),
            SafetyGates::default(),
            Vec::new(),
        );

        assert_eq!(pb.playbook_id, PLAYBOOK_29_ID);
        assert_eq!(
            pb.actions[0].action_id,
            ACT_GATE7_TREAT_REVERSIBLE_ORGANIC_DELIRIUM_CAUSE_FIRST
        );
        assert!(
            pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_VERBAL_DEESCALATION_1ON1_WATCH_AIRLOCK_LOCKOUT)
        );
        assert!(
            pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_OLANZAPINE_5_10MG_ODT)
        );
        assert!(
            !pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK)
        );
    }

    #[test]
    fn gate7b_retains_cmrs_restraint_when_imminent_harm_present() {
        let bmed = BehavioralHealthState {
            acute_agitation_or_psychosis: true,
            imminent_harm_to_self_or_vehicle: true,
            triage_classification: BMedTriageClass::ImminentSelfOrVehicleHarmCrisis,
            ..BehavioralHealthState::default()
        };

        let pb = build_playbook_29_bmed_crisis(
            &bmed,
            false,
            Some(420.0),
            SafetyGates::default(),
            Vec::new(),
        );

        assert!(
            pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK)
        );
        assert!(
            pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_MIDAZOLAM_5MG_INTRANASAL)
        );
        assert!(
            pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM)
        );
    }

    #[test]
    fn gate7c_substitutes_ketamine_when_qtc_prolonged_and_strips_haloperidol_olanzapine() {
        let bmed = BehavioralHealthState {
            acute_agitation_or_psychosis: true,
            imminent_harm_to_self_or_vehicle: false,
            triage_classification: BMedTriageClass::PrimaryAcutePsychiatricCrisis,
            ..BehavioralHealthState::default()
        };

        let pb = build_playbook_29_bmed_crisis(
            &bmed,
            false,
            Some(485.0),
            SafetyGates::default(),
            Vec::new(),
        );

        assert!(
            pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_KETAMINE_1_2MG_KG_IM_DISSOCIATIVE)
        );
        assert!(
            !pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM)
        );
        assert!(
            !pb.actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_OLANZAPINE_5_10MG_ODT)
        );
    }

    #[test]
    fn apply_gate7_bmed_guards_strips_forged_restraint_and_qtc_drugs() {
        let bmed = BehavioralHealthState::default();
        let forged = ActivePlaybook {
            playbook_id: PLAYBOOK_29_ID.to_string(),
            title: PLAYBOOK_29_TITLE.to_string(),
            causal_chain_summary: Vec::new(),
            safety_gates: SafetyGates::default(),
            actions: vec![
                action_verbal_deescalation_airlock_lockout(),
                action_cmrs_restraint(),
                action_haloperidol_lorazepam_im(),
            ],
        };

        let guarded = apply_gate7_bmed_guards(forged, &bmed, 505.0);
        assert!(
            !guarded
                .actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK)
        );
        assert!(
            !guarded
                .actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM)
        );
        assert!(
            guarded
                .actions
                .iter()
                .any(|a| a.action_id == ACT_BMED_KETAMINE_1_2MG_KG_IM_DISSOCIATIVE)
        );
    }
}
