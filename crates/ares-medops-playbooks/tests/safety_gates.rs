//! Tests for the 3 Hard Clinical Safety Gates and the playbook engine.
#![allow(clippy::panic)]

use ares_medops_playbooks::actions::ActionKind;
use ares_medops_playbooks::playbooks::{self, PlaybookStep};
use ares_medops_playbooks::state::ClinicalState;
use ares_medops_playbooks::{
    ClinicalThresholds, GateId, MedOpsEngine, Playbook, PlaybookError, PlaybookId, PlaybookRun,
};

fn engine() -> MedOpsEngine {
    match MedOpsEngine::new(ClinicalThresholds::default()) {
        Ok(e) => e,
        Err(e) => panic!("engine must build: {e}"),
    }
}

fn has_action(d: &ares_medops_playbooks::SafePlaybookDecision, code: &str) -> bool {
    d.steps
        .iter()
        .flat_map(|s| s.actions.iter())
        .any(|a| a.code == code)
}

// ---------- triggers ----------

#[test]
fn nominal_state_triggers_nothing() {
    let report = engine().evaluate(&ClinicalState::default());
    assert!(report.decisions.is_empty());
    assert!(report.priority_actions.is_empty());
    assert!(report.anticoagulant_lock_active);
}

#[test]
fn low_shear_triggers_playbook_01() {
    let mut s = ClinicalState::default();
    s.jugular.wall_shear_stress_dyn_cm2 = Some(3.2);
    assert_eq!(
        engine().evaluate(&s).triggered_ids(),
        vec![PlaybookId::P01VenousStasisLbnp]
    );
}

#[test]
fn shear_exactly_at_threshold_does_not_trigger() {
    let mut s = ClinicalState::default();
    s.jugular.wall_shear_stress_dyn_cm2 = Some(4.0);
    assert!(engine().evaluate(&s).decisions.is_empty());
}

#[test]
fn nan_is_treated_as_missing() {
    let mut s = ClinicalState::default();
    s.jugular.wall_shear_stress_dyn_cm2 = Some(f64::NAN);
    assert!(engine().evaluate(&s).decisions.is_empty());
}

#[test]
fn confirmed_thrombus_replaces_stasis_playbook() {
    let mut s = ClinicalState::default();
    s.jugular.wall_shear_stress_dyn_cm2 = Some(2.0);
    s.jugular.pocus_thrombus_confirmed = Some(true);
    assert_eq!(
        engine().evaluate(&s).triggered_ids(),
        vec![PlaybookId::P02ConfirmedIjvThrombus]
    );
}

#[test]
fn sans_needs_both_co2_and_onsd() {
    let e = engine();
    let mut s = ClinicalState::default();
    s.environment.cabin_ppco2_mmhg = Some(4.0);
    assert!(e.evaluate(&s).decisions.is_empty());
    s.neuro_ocular.optic_nerve_sheath_diameter_mm = Some(6.1);
    assert_eq!(
        e.evaluate(&s).triggered_ids(),
        vec![PlaybookId::P04SansTranslaminarMitigation]
    );
}

#[test]
fn playbooks_sorted_by_urgency() {
    let mut s = ClinicalState::default();
    s.musculoskeletal.soleus_volume_loss_pct = Some(5.0);
    s.jugular.wall_shear_stress_dyn_cm2 = Some(3.0);
    s.environment.ambient_radiation_rate_ugy_h = Some(5000.0);
    assert_eq!(
        engine().evaluate(&s).triggered_ids(),
        vec![
            PlaybookId::P05SpeRadiationShelterCans,
            PlaybookId::P01VenousStasisLbnp,
            PlaybookId::P03SarcopeniaOsteopeniaAred,
        ]
    );
}

// ---------- Gate 1 ----------

#[test]
fn gate1_blocks_anticoagulant_when_pocus_negative() {
    let mut s = ClinicalState::default();
    s.jugular.pocus_thrombus_confirmed = Some(false);
    let d = engine().propose(&s, PlaybookId::P02ConfirmedIjvThrombus);
    let d = d.unwrap_or_else(|| panic!("playbook exists"));
    assert!(d.anticoagulant_lock_active);
    assert!(!has_action(&d, "START_ANTICOAGULATION"));
    let g1 = d
        .interventions
        .iter()
        .find(|i| i.gate == GateId::AnticoagulantLock);
    let g1 = g1.unwrap_or_else(|| panic!("gate 1 must fire"));
    assert_eq!(g1.removed_actions, vec!["START_ANTICOAGULATION"]);
    assert!(g1.added_actions.iter().any(|a| a.code == "LBNP_SESSION"));
}

#[test]
fn gate1_blocks_anticoagulant_when_pocus_missing() {
    let s = ClinicalState::default(); // pocus_thrombus_confirmed = None
    let d = engine().propose(&s, PlaybookId::P02ConfirmedIjvThrombus);
    let d = d.unwrap_or_else(|| panic!("playbook exists"));
    assert!(!has_action(&d, "START_ANTICOAGULATION"));
    assert!(has_action(&d, "STEP_BLOCKED_BY_SAFETY_GATE"));
    assert_eq!(d.steps.len(), 4, "step numbering must stay stable");
}

#[test]
fn gate1_allows_anticoagulant_and_revokes_eva_when_confirmed() {
    let mut s = ClinicalState::default();
    s.jugular.pocus_thrombus_confirmed = Some(true);
    let report = engine().evaluate(&s);
    let d = &report.decisions[0];
    assert!(!d.anticoagulant_lock_active);
    assert!(has_action(d, "START_ANTICOAGULATION"));
    assert!(has_action(d, "EVA_CLEARANCE_REVOKED"));
}

#[test]
fn no_playbook_ever_contains_anticoagulant_without_confirmation() {
    let e = engine();
    let mut s = ClinicalState::default();
    s.jugular.pocus_thrombus_confirmed = Some(false);
    for id in PlaybookId::ALL {
        let d = e
            .propose(&s, id)
            .unwrap_or_else(|| panic!("playbook exists"));
        let any = d
            .steps
            .iter()
            .flat_map(|st| st.actions.iter())
            .any(|a| a.kind == ActionKind::Anticoagulant);
        assert!(!any, "{} leaked an anticoagulant", id.code());
    }
}

// ---------- Gate 2 ----------

fn lbnp_state(baseline: f64, current: f64, hr: f64) -> ClinicalState {
    let mut s = ClinicalState::default();
    s.lbnp.active = true;
    s.lbnp.chamber_pressure_mmhg = Some(-30.0);
    s.lbnp.baseline_systolic_bp_mmhg = Some(baseline);
    s.lbnp.current_systolic_bp_mmhg = Some(current);
    s.vitals.heart_rate_bpm = Some(hr);
    s
}

fn vents(s: &ClinicalState) -> bool {
    engine()
        .evaluate(s)
        .priority_actions
        .iter()
        .any(|a| a.code == "AUTO_VENT_LBNP_CHAMBER_0_MMHG")
}

#[test]
fn gate2_stable_session_does_not_vent() {
    assert!(!vents(&lbnp_state(120.0, 110.0, 90.0)));
}

#[test]
fn gate2_vents_on_systolic_drop_over_15() {
    assert!(vents(&lbnp_state(120.0, 104.0, 90.0)));
}

#[test]
fn gate2_drop_exactly_15_does_not_vent() {
    assert!(!vents(&lbnp_state(120.0, 105.0, 90.0)));
}

#[test]
fn gate2_vents_on_heart_rate_over_115() {
    assert!(vents(&lbnp_state(120.0, 118.0, 116.0)));
}

#[test]
fn gate2_vents_when_data_missing_during_session() {
    let mut s = lbnp_state(120.0, 118.0, 90.0);
    s.vitals.heart_rate_bpm = None;
    assert!(vents(&s));
    let mut s = lbnp_state(120.0, 118.0, 90.0);
    s.lbnp.current_systolic_bp_mmhg = None;
    assert!(vents(&s));
}

#[test]
fn gate2_ignored_when_lbnp_inactive() {
    let mut s = lbnp_state(120.0, 80.0, 150.0);
    s.lbnp.active = false;
    assert!(!vents(&s));
}

#[test]
fn gate2_vent_is_first_priority_action_inside_playbook() {
    let mut s = lbnp_state(120.0, 100.0, 90.0);
    s.jugular.wall_shear_stress_dyn_cm2 = Some(3.0);
    let report = engine().evaluate(&s);
    assert_eq!(
        report.decisions[0].priority_actions[0].code,
        "AUTO_VENT_LBNP_CHAMBER_0_MMHG"
    );
    assert!(report.decisions[0].lbnp_auto_vent);
}

// ---------- Gate 3 ----------

#[test]
fn gate3_blocks_plyometrics_and_tunes_suit_when_gai_over_12() {
    let mut s = ClinicalState::default();
    s.musculoskeletal.post_landing = true;
    s.musculoskeletal.gait_asymmetry_index_pct = Some(14.0);
    s.musculoskeletal.soleus_volume_loss_pct = Some(4.0);
    let report = engine().evaluate(&s);
    let d = &report.decisions[0];
    assert_eq!(d.playbook_id, PlaybookId::P03SarcopeniaOsteopeniaAred);
    assert!(!has_action(d, "PLYOMETRIC_IMPACT_PROTOCOL"));
    assert!(has_action(d, "ARED_ECCENTRIC_INCREASE"));
    assert!(d.eva_suit_damping_active);
    assert!(
        report
            .priority_actions
            .iter()
            .any(|a| a.code == "EVA_SUIT_DAMPING_INCREASE")
    );
}

#[test]
fn gate3_gai_exactly_12_is_allowed() {
    let mut s = ClinicalState::default();
    s.musculoskeletal.post_landing = true;
    s.musculoskeletal.gait_asymmetry_index_pct = Some(12.0);
    s.musculoskeletal.soleus_volume_loss_pct = Some(4.0);
    let d = &engine().evaluate(&s).decisions[0];
    assert!(has_action(d, "PLYOMETRIC_IMPACT_PROTOCOL"));
    assert!(!d.eva_suit_damping_active);
}

#[test]
fn gate3_missing_gai_after_landing_blocks_plyometrics_and_requests_measurement() {
    let mut s = ClinicalState::default();
    s.musculoskeletal.post_landing = true;
    s.musculoskeletal.soleus_volume_loss_pct = Some(4.0);
    let report = engine().evaluate(&s);
    let d = &report.decisions[0];
    assert!(!has_action(d, "PLYOMETRIC_IMPACT_PROTOCOL"));
    assert!(!d.eva_suit_damping_active);
    assert!(
        report
            .priority_actions
            .iter()
            .any(|a| a.code == "IMU_GAIT_ASSESSMENT")
    );
}

#[test]
fn gate3_fires_globally_without_any_playbook() {
    let mut s = ClinicalState::default();
    s.musculoskeletal.gait_asymmetry_index_pct = Some(20.0);
    let report = engine().evaluate(&s);
    assert!(report.decisions.is_empty());
    assert_eq!(report.global_interventions[0].gate, GateId::EvaSuitDamping);
}

// ---------- DAG validation and runner ----------

fn raw_step(id: u8, deps: &[u8]) -> PlaybookStep {
    PlaybookStep {
        id,
        title: "t",
        depends_on: deps.to_vec(),
        actions: Vec::new(),
    }
}

#[test]
fn dag_rejects_cycle() {
    let r = Playbook::new(
        PlaybookId::P01VenousStasisLbnp,
        vec![raw_step(1, &[2]), raw_step(2, &[1])],
    );
    assert!(matches!(r, Err(PlaybookError::Cycle { .. })));
}

#[test]
fn dag_rejects_unknown_dependency_and_duplicates() {
    let r = Playbook::new(PlaybookId::P01VenousStasisLbnp, vec![raw_step(1, &[9])]);
    assert!(matches!(
        r,
        Err(PlaybookError::UnknownDependency { missing: 9, .. })
    ));
    let r = Playbook::new(
        PlaybookId::P01VenousStasisLbnp,
        vec![raw_step(1, &[]), raw_step(1, &[])],
    );
    assert!(matches!(r, Err(PlaybookError::DuplicateStep { .. })));
}

#[test]
fn dag_orders_steps_topologically() {
    let p = Playbook::new(
        PlaybookId::P01VenousStasisLbnp,
        vec![raw_step(3, &[2]), raw_step(2, &[1]), raw_step(1, &[])],
    );
    let ids: Vec<u8> = p
        .map(|p| p.steps.iter().map(|s| s.id).collect())
        .unwrap_or_default();
    assert_eq!(ids, vec![1, 2, 3]);
}

#[test]
fn all_five_playbooks_compile() {
    let th = ClinicalThresholds::default();
    for id in PlaybookId::ALL {
        assert!(playbooks::build(id, &th).is_ok(), "{} failed", id.code());
    }
}

#[test]
fn runner_walks_steps_in_order_and_rejects_skips() {
    let mut s = ClinicalState::default();
    s.jugular.wall_shear_stress_dyn_cm2 = Some(3.0);
    let d = engine().evaluate(&s).decisions.remove(0);
    let mut run = PlaybookRun::new(d);

    let v = run.view();
    assert_eq!((v.current_step, v.total_steps), (1, 5));
    assert_eq!(v.playbook_id, "PLAYBOOK_01_VENOUS_STASIS_LBNP");

    assert!(matches!(
        run.execute_step(3),
        Err(PlaybookError::OutOfOrder {
            expected: 1,
            got: 3,
            ..
        })
    ));
    for id in 1..=5 {
        assert!(run.execute_step(id).is_ok());
    }
    assert!(run.is_complete());
    assert!(matches!(
        run.execute_step(5),
        Err(PlaybookError::AlreadyCompleted { .. })
    ));
    assert_eq!(run.view().step_instruction, "Playbook completed.");
}

#[test]
fn report_serializes_to_json() {
    let mut s = ClinicalState::default();
    s.jugular.wall_shear_stress_dyn_cm2 = Some(3.0);
    let json = serde_json::to_string(&engine().evaluate(&s)).unwrap_or_default();
    assert!(json.contains("PLAYBOOK_01_VENOUS_STASIS_LBNP"));
    assert!(json.contains("\"kind\":\"DIAGNOSTIC\""));
}
