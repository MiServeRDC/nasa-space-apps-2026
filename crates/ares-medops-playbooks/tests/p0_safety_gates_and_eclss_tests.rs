#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ares_causal_graph::eclss_differential::{
    evaluate_coupled_habitat_crew_co2, HypercapniaRootCause,
};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularFlowGrade, JugularHemodynamics,
    Musculoskeletal, SafetyGates, StressTestScenarioInput,
};
use ares_medops_playbooks::safety_gates::enforce_hard_clinical_safety_gates_ext;

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
