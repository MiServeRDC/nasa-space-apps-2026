#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ares_causal_graph::eclss_differential::{
    evaluate_coupled_habitat_crew_co2, HypercapniaRootCause,
};
use ares_core_types::medical_360::LbnpBaselineState;
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularFlowGrade, JugularHemodynamics,
    Musculoskeletal, NqsStlMargins, SafetyGates, StressTestScenarioInput,
};
use ares_medops_playbooks::playbooks::select_candidate_playbook_ext;
use ares_medops_playbooks::safety_gates::{
    enforce_hard_clinical_safety_gates_ext, enforce_hard_clinical_safety_gates_with_lbnp_baseline,
};

fn sample_playbook_with_anticoag() -> ActivePlaybook {
    ActivePlaybook {
        playbook_id: "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS".to_string(),
        title: "Confirmed IJV Thrombus".to_string(),
        causal_chain_summary: vec!["Ultrasound verified intraluminal thrombus".to_string()],
        safety_gates: SafetyGates::default(),
        actions: vec![
            CountermeasureAction {
                action_id: "ACT_ADMINISTER_ENOXAPARIN_ANTICOAG".to_string(),
                label: "Administer Enoxaparin 1 mg/kg SC".to_string(),
                category: "PHARMACOLOGICAL_ANTICOAGULANT".to_string(),
                delta_rho_per_hour: 0.28,
            },
            CountermeasureAction {
                action_id: "ACT_SERIAL_POCUS_SURVEILLANCE".to_string(),
                label: "Repeat Jugular POCUS in 12h".to_string(),
                category: "DIAGNOSTIC_IMAGING".to_string(),
                delta_rho_per_hour: 0.12,
            },
        ],
    }
}

fn nominal_musculo() -> Musculoskeletal {
    Musculoskeletal {
        ared_daily_load_kgf: 125.0,
        soleus_csa_pct: 95.0,
        echo_intensity_au: 50.0,
        mqi_index: 0.88,
        sclerostin_pmol_l: 25.0,
        urinary_calcium_mg_d: 190.0,
        gai_pct: 5.0,
    }
}

fn nominal_scenario() -> StressTestScenarioInput {
    StressTestScenarioInput {
        source_record_id: "bidmc_01".to_string(),
        flight_day: 120,
        ared_daily_load_kgf: 125.0,
        radiation_dose_rate_msv_d: 0.45,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
        pocus_thrombus_confirmed: true,
        systolic_bp_drop_mmhg: 5.0,
    }
}

#[test]
fn gate1_thrombocytopenia_blocks_anticoagulation_despite_confirmed_thrombus() {
    let biometrics = Biometrics {
        heart_rate_bpm: Some(78.0),
        sbp_mmhg: Some(122.0),
        dbp_mmhg: Some(78.0),
        platelet_count_k_ul: Some(62.0), // < 75.0 k/uL contraindication floor
        ..Biometrics::default()
    };

    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 85.0,
        ijv_vmax_cm_s: 4.2,
        tau_w_dyn_cm2: 0.85,
        flow_grade: JugularFlowGrade::OccludedThrombus,
        pocus_thrombus_confirmed: true,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
    };

    let outcome = enforce_hard_clinical_safety_gates_ext(
        sample_playbook_with_anticoag(),
        &biometrics,
        &nominal_musculo(),
        &jugular,
        &nominal_scenario(),
        None,
        None,
        None,
    );

    assert!(
        outcome.safety_gates.anticoagulant_lock_active,
        "Anticoagulant lock must be active when platelets < 75 k/uL"
    );
    assert!(
        outcome.safety_gates.anticoagulant_contraindicated_bleeding_risk,
        "Bleeding risk flag must be active"
    );

    let has_pharmacological = outcome.actions.iter().any(|a| {
        a.action_id == "ACT_ADMINISTER_ENOXAPARIN_ANTICOAG"
            || a.category.contains("PHARMACOLOGICAL_ANTICOAGULANT")
    });
    assert!(!has_pharmacological, "Pharmacological anticoagulants must be stripped");

    let has_warning = outcome.actions.iter().any(|a| {
        a.action_id == "ACT_ANTICOAG_CONTRAINDICATED_THROMBOCYTOPENIA_RISK"
    });
    assert!(
        has_warning,
        "Must inject ACT_ANTICOAG_CONTRAINDICATED_THROMBOCYTOPENIA_RISK warning action"
    );
}

#[test]
fn gate1_acute_radiation_with_borderline_platelets_blocks_anticoagulation() {
    let biometrics = Biometrics {
        heart_rate_bpm: Some(85.0),
        sbp_mmhg: Some(120.0),
        dbp_mmhg: Some(78.0),
        radiation_dose_rate_msv_d: 14.5, // > 10.0 mSv/d acute solar particle event
        platelet_count_k_ul: Some(92.0), // < 100.0 k/uL under acute radiation
        ..Biometrics::default()
    };

    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 90.0,
        ijv_vmax_cm_s: 3.5,
        tau_w_dyn_cm2: 0.70,
        flow_grade: JugularFlowGrade::OccludedThrombus,
        pocus_thrombus_confirmed: true,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
    };

    let outcome = enforce_hard_clinical_safety_gates_ext(
        sample_playbook_with_anticoag(),
        &biometrics,
        &nominal_musculo(),
        &jugular,
        &nominal_scenario(),
        None,
        None,
        None,
    );

    assert!(outcome.safety_gates.anticoagulant_lock_active);
    assert!(outcome.safety_gates.anticoagulant_contraindicated_bleeding_risk);
}

#[test]
fn gate2_pulse_pressure_narrowing_triggers_lbnp_auto_vent() {
    // SBP 110 mmHg (10 mmHg drop from 120 baseline, under 15 mmHg SBP drop limit)
    // HR 98 bpm (under 115 bpm ceiling)
    // DBP 92 mmHg -> Pulse Pressure = 18 mmHg (< 25 mmHg threshold!)
    let biometrics = Biometrics {
        heart_rate_bpm: Some(98.0),
        sbp_mmhg: Some(110.0),
        dbp_mmhg: Some(92.0),
        ..Biometrics::default()
    };

    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 65.0,
        ijv_vmax_cm_s: 12.0,
        tau_w_dyn_cm2: 1.8,
        flow_grade: JugularFlowGrade::NormalContinuous,
        pocus_thrombus_confirmed: false,
        lbnp_active: true,
        lbnp_pressure_mmhg: -35.0,
    };

    let mut scenario = nominal_scenario();
    scenario.lbnp_active = true;
    scenario.systolic_bp_drop_mmhg = 10.0;

    let outcome = enforce_hard_clinical_safety_gates_ext(
        sample_playbook_with_anticoag(),
        &biometrics,
        &nominal_musculo(),
        &jugular,
        &scenario,
        None,
        None,
        None,
    );

    assert!(
        outcome.safety_gates.lbnp_auto_vent_triggered,
        "Pulse pressure narrowing < 25 mmHg must trigger LBNP auto-vent"
    );

    let has_pp_label = outcome.actions.iter().any(|a| {
        a.action_id == "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
            && a.label.contains("Pulse Pressure Narrowing")
    });
    assert!(
        has_pp_label,
        "Must inject ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG with pulse pressure narrowing label"
    );
}

#[test]
fn gate2_sensor_blackout_during_active_lbnp_triggers_failsafe_vent() {
    let biometrics = Biometrics {
        heart_rate_bpm: None,
        sbp_mmhg: None,
        dbp_mmhg: None,
        missing_channels: vec!["wearable_sensor_loss".to_string()],
        ..Biometrics::default()
    };

    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 65.0,
        ijv_vmax_cm_s: 12.0,
        tau_w_dyn_cm2: 1.8,
        flow_grade: JugularFlowGrade::NormalContinuous,
        pocus_thrombus_confirmed: false,
        lbnp_active: true,
        lbnp_pressure_mmhg: -40.0,
    };

    let mut scenario = nominal_scenario();
    scenario.lbnp_active = true;

    let outcome = enforce_hard_clinical_safety_gates_ext(
        sample_playbook_with_anticoag(),
        &biometrics,
        &nominal_musculo(),
        &jugular,
        &scenario,
        None,
        None,
        None,
    );

    assert!(
        outcome.safety_gates.lbnp_auto_vent_triggered,
        "Telemetry dropout during active LBNP must fail-safe auto-vent to 0 mmHg"
    );

    let has_failsafe_label = outcome.actions.iter().any(|a| {
        a.action_id == "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
            && a.label.contains("Sensor Dropout Fail-Safe")
    });
    assert!(has_failsafe_label, "Vent action label must indicate Sensor Dropout Fail-Safe");
}

#[test]
fn coupled_eclss_scrubber_saturation_distinguished_from_crew_pathology() {
    let biometrics = Biometrics {
        heart_rate_bpm: Some(112.0),
        cabin_ppco2_mmhg: Some(5.4), // > 4.0 mmHg limit
        ..Biometrics::default()
    };

    let diag = evaluate_coupled_habitat_crew_co2(&biometrics, 3);
    assert_eq!(
        diag.root_cause,
        HypercapniaRootCause::EnvironmentalEclssScrubberSaturation
    );
    assert!(
        diag.causal_chain
            .contains(&"ECLSS_CO2_SCRUBBER_SATURATION".to_string()),
        "Causal chain must attribute anomaly to ECLSS scrubber saturation"
    );
}

#[test]
fn gate2_dynamic_sbp_baseline_triggers_vent_and_strips_lbnp_minus_30() {
    // Baseline SBP = 145 mmHg, current SBP = 125 mmHg -> 20 mmHg drop (> 15 mmHg limit)
    // even though 125 mmHg > static 120 mmHg!
    let biometrics = Biometrics {
        heart_rate_bpm: Some(82.0),
        sbp_mmhg: Some(125.0),
        dbp_mmhg: Some(82.0),
        ..Biometrics::default()
    };
    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 72.0,
        ijv_vmax_cm_s: 4.5,
        tau_w_dyn_cm2: 0.90,
        flow_grade: JugularFlowGrade::StagnantBidirectional,
        pocus_thrombus_confirmed: false,
        lbnp_active: true,
        lbnp_pressure_mmhg: -30.0,
    };
    let mut scenario = nominal_scenario();
    scenario.lbnp_active = true;
    scenario.pocus_thrombus_confirmed = false;
    scenario.systolic_bp_drop_mmhg = 0.0;

    let mut pb = sample_playbook_with_anticoag();
    pb.actions.push(CountermeasureAction {
        action_id: "ACT_LBNP_MINUS_30_MMHG".to_string(),
        label: "Activate LBNP -30 mmHg".to_string(),
        category: "PHYSICAL_HEMODYNAMIC".to_string(),
        delta_rho_per_hour: 0.19,
    });

    let baseline = LbnpBaselineState {
        pre_lbnp_sbp_baseline_mmhg: 145.0,
        pre_lbnp_hr_baseline_bpm: 72.0,
        captured_at_timestamp_ms: 1_000,
    };

    let outcome = enforce_hard_clinical_safety_gates_with_lbnp_baseline(
        pb,
        &biometrics,
        &nominal_musculo(),
        &jugular,
        &scenario,
        None,
        None,
        None,
        Some(baseline),
    );

    assert!(outcome.safety_gates.lbnp_auto_vent_triggered);
    assert_eq!(
        outcome.actions[0].action_id,
        "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
    );
    assert!(
        outcome
            .actions
            .iter()
            .all(|a| !a.action_id.contains("ACT_LBNP_MINUS_")),
        "Gate 2 auto-vent must strip ACT_LBNP_MINUS_30_MMHG"
    );
}

#[test]
fn gate2_vasovagal_bradycardia_below_50_bpm_triggers_auto_vent() {
    let biometrics = Biometrics {
        heart_rate_bpm: Some(46.0), // < 50.0 bpm vasovagal floor
        sbp_mmhg: Some(115.0),
        dbp_mmhg: Some(72.0),
        ..Biometrics::default()
    };
    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 72.0,
        ijv_vmax_cm_s: 4.5,
        tau_w_dyn_cm2: 0.90,
        flow_grade: JugularFlowGrade::NormalContinuous,
        pocus_thrombus_confirmed: false,
        lbnp_active: true,
        lbnp_pressure_mmhg: -30.0,
    };
    let mut scenario = nominal_scenario();
    scenario.lbnp_active = true;
    scenario.systolic_bp_drop_mmhg = 5.0;

    let outcome = enforce_hard_clinical_safety_gates_with_lbnp_baseline(
        sample_playbook_with_anticoag(),
        &biometrics,
        &nominal_musculo(),
        &jugular,
        &scenario,
        None,
        None,
        None,
        None,
    );

    assert!(outcome.safety_gates.lbnp_auto_vent_triggered);
    assert_eq!(
        outcome.actions[0].action_id,
        "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
    );
}

#[test]
fn gate2_hr_none_during_active_lbnp_triggers_failsafe_vent() {
    // Even if SBP is present, missing HR during active LBNP must fail-safe auto-vent
    // (no silent 72.0 bpm fallback).
    let biometrics = Biometrics {
        heart_rate_bpm: None,
        sbp_mmhg: Some(118.0),
        dbp_mmhg: Some(76.0),
        ..Biometrics::default()
    };
    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 72.0,
        ijv_vmax_cm_s: 4.5,
        tau_w_dyn_cm2: 0.90,
        flow_grade: JugularFlowGrade::NormalContinuous,
        pocus_thrombus_confirmed: false,
        lbnp_active: true,
        lbnp_pressure_mmhg: -30.0,
    };
    let mut scenario = nominal_scenario();
    scenario.lbnp_active = true;
    scenario.systolic_bp_drop_mmhg = 2.0;

    let outcome = enforce_hard_clinical_safety_gates_with_lbnp_baseline(
        sample_playbook_with_anticoag(),
        &biometrics,
        &nominal_musculo(),
        &jugular,
        &scenario,
        None,
        None,
        None,
        None,
    );

    assert!(outcome.safety_gates.lbnp_auto_vent_triggered);
    assert!(outcome.actions.iter().any(|a| {
        a.action_id == "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
            && a.label.contains("Sensor Dropout Fail-Safe")
    }));
}

#[test]
fn co2_tier1_vs_tier2_and_max_cabin_helmet_never_masked() {
    // Nominal cabin (2.2 mmHg) must NOT mask elevated helmet (5.5 mmHg) in Gate 4/ECLSS alert
    let bio_masked_test = Biometrics {
        heart_rate_bpm: Some(78.0),
        sbp_mmhg: Some(120.0),
        dbp_mmhg: Some(78.0),
        cabin_ppco2_mmhg: Some(2.2),
        helmet_ppco2_mmhg: Some(5.5),
        ..Biometrics::default()
    };
    let jugular = JugularHemodynamics {
        ijv_csa_mm2: 65.0,
        ijv_vmax_cm_s: 12.0,
        tau_w_dyn_cm2: 1.8,
        flow_grade: JugularFlowGrade::NormalContinuous,
        pocus_thrombus_confirmed: false,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
    };
    let enforced = enforce_hard_clinical_safety_gates_ext(
        sample_playbook_with_anticoag(),
        &bio_masked_test,
        &nominal_musculo(),
        &jugular,
        &nominal_scenario(),
        None,
        None,
        None,
    );
    assert!(
        enforced.safety_gates.eclss_environmental_co2_alert,
        "max(cabin=2.2, helmet=5.5) > 4.0 must trigger eclss_environmental_co2_alert"
    );

    // Playbook #14 Tier 1 (3.4 mmHg) requires elevated SANS (rho_sans < 0.64),
    // while Tier 2 (4.2 mmHg) triggers immediately even with nominal SANS (rho_sans = 0.85).
    let nqs_nominal = NqsStlMargins {
        rho_tau_w: 0.85,
        rho_ared: 0.85,
        rho_sost: 0.85,
        rho_rmssd: Some(0.85),
        rho_sans: 0.85,
        rho_global: Some(0.85),
        ttv_hours: Some(120.0),
        ttv_ci95_low_hours: Some(90.0),
        ttv_ci95_high_hours: Some(150.0),
        mri_pct: Some(72.0),
        ttv_interval_kind: None,
        rho_renal: None,
        rho_orthostatic: None,
        rho_circadian: None,
        rho_immune: None,
    };
    let bio_tier1 = Biometrics {
        cabin_ppco2_mmhg: Some(3.4),
        helmet_ppco2_mmhg: None,
        ..Biometrics::default()
    };
    let pb_tier1_nom_sans = select_candidate_playbook_ext(
        &bio_tier1,
        &nominal_musculo(),
        &jugular,
        &nqs_nominal,
        vec![],
        None,
        None,
        None,
        0,
        None,
        None,
    );
    assert_ne!(pb_tier1_nom_sans.playbook_id, "PLAYBOOK_14_CO2_SCRUBBER_SANS");

    let nqs_elevated_sans = NqsStlMargins {
        rho_sans: 0.55,
        ..nqs_nominal
    };
    let pb_tier1_elevated = select_candidate_playbook_ext(
        &bio_tier1,
        &nominal_musculo(),
        &jugular,
        &nqs_elevated_sans,
        vec![],
        None,
        None,
        None,
        0,
        None,
        None,
    );
    assert_eq!(pb_tier1_elevated.playbook_id, "PLAYBOOK_14_CO2_SCRUBBER_SANS");

    let bio_tier2 = Biometrics {
        cabin_ppco2_mmhg: Some(2.2),
        helmet_ppco2_mmhg: Some(4.2),
        ..Biometrics::default()
    };
    let pb_tier2 = select_candidate_playbook_ext(
        &bio_tier2,
        &nominal_musculo(),
        &jugular,
        &nqs_nominal,
        vec![],
        None,
        None,
        None,
        0,
        None,
        None,
    );
    assert_eq!(pb_tier2.playbook_id, "PLAYBOOK_14_CO2_SCRUBBER_SANS");
}
