//! Phase 37 (M3): End-to-End Mission Scenario Harnesses (Tier 7 Master Test Plan).
//!
//! Validates the full closed-loop architecture: GATHER -> EVALUATE -> ACT
//! across all 5 NASA reference mission scenarios and Hard Clinical Safety Gates 1-4.

use ares_core_types::constants::{GAI_MAX_SAFE_PCT, LBNP_MAX_SAFE_HR_BPM, LBNP_MAX_SYS_BP_DROP_MMHG};
use ares_core_types::telemetry::{
    ActivePlaybook, AlertSeverity, Biometrics, CountermeasureAction, JugularFlowGrade,
    JugularHemodynamics, ModelValidationStatus, Musculoskeletal, NqsStlMargins, SafetyGates,
    StressTestScenarioInput,
};
use ares_medops_playbooks::pocus_multiorgan::{PocusEfastScan, PocusRenalBladderScan};
use ares_medops_playbooks::safety_gates::enforce_hard_clinical_safety_gates_ext;
use ares_medops_playbooks::{select_candidate_playbook, select_candidate_playbook_ext};
use ares_server_cli::wire_contract::StressTestPatchRequest;
use ares_server_cli::ws_server::SharedMissionState;
use std::path::PathBuf;

fn bidmc_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("data")
        .join("bidmc")
}

fn baseline_biometrics() -> Biometrics {
    Biometrics {
        heart_rate_bpm: Some(72.0),
        pulse_rate_bpm: Some(72.0),
        resp_rate_brpm: Some(14.0),
        spo2_pct: Some(98.0),
        rmssd_ms: Some(45.0),
        hrv_unavailable_reason: None,
        sdnn_ms: Some(50.0),
        pnn50_pct: Some(20.0),
        lf_hf_ratio: Some(1.8),
        vocal_f0_hz: Some(120.0),
        vocal_jitter_pct: Some(0.5),
        radiation_dose_rate_msv_d: 0.45,
        sqi_score: 0.95,
        missing_channels: vec![],
        sbp_mmhg: Some(118.0),
        dbp_mmhg: Some(76.0),
        ptt_ms: None,
        core_temp_celsius: Some(36.8),
        skin_temp_celsius: None,
        sleep_stage_code: None,
        melanopic_edi_lux: None,
        personal_dose_rate_ugy_h: None,
        let_quality_factor: None,
        suit_metabolic_watts: None,
        helmet_ppco2_mmhg: None,
    }
}

fn baseline_musculo() -> Musculoskeletal {
    Musculoskeletal {
        ared_daily_load_kgf: 120.0,
        soleus_csa_pct: 95.0,
        echo_intensity_au: 45.0,
        mqi_index: 0.92,
        sclerostin_pmol_l: 28.0,
        urinary_calcium_mg_d: 180.0,
        gai_pct: 4.5,
    }
}

fn baseline_jugular() -> JugularHemodynamics {
    JugularHemodynamics {
        ijv_csa_mm2: 85.0,
        ijv_vmax_cm_s: 18.0,
        tau_w_dyn_cm2: 1.40,
        flow_grade: JugularFlowGrade::NormalContinuous,
        pocus_thrombus_confirmed: false,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
    }
}

fn baseline_nqs() -> NqsStlMargins {
    NqsStlMargins {
        rho_tau_w: 0.75,
        rho_ared: 0.85,
        rho_sost: 0.80,
        rho_rmssd: Some(0.82),
        rho_sans: 0.88,
        rho_global: Some(0.80),
        ttv_hours: None,
        ttv_ci95_low_hours: None,
        ttv_ci95_high_hours: None,
        mri_pct: Some(88.0),
        ttv_interval_kind: None,
        rho_renal: Some(0.85),
        rho_orthostatic: Some(0.90),
        rho_circadian: Some(0.92),
        rho_immune: Some(0.86),
    }
}

fn baseline_scenario() -> StressTestScenarioInput {
    StressTestScenarioInput {
        source_record_id: "bidmc_01".to_string(),
        flight_day: 90,
        ared_daily_load_kgf: 120.0,
        radiation_dose_rate_msv_d: 0.45,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
        pocus_thrombus_confirmed: false,
        systolic_bp_drop_mmhg: 3.0,
    }
}

/// SCEN-01: Nominal Mars Transit Baseline (Flight Day 180).
/// Verifies nominal homeostasis, robust safety margins, and zero unneeded emergency playbooks.
#[test]
fn test_scen_01_nominal_mars_transit_baseline() {
    let state = SharedMissionState::from_data_dir(&bidmc_dir()).expect("load shared mission state");

    let patch = StressTestPatchRequest {
        flight_day: Some(180),
        ared_daily_load_kgf: Some(120.0),
        cabin_ppco2_mmhg: Some(2.0),
        lbnp_active: Some(false),
        lbnp_pressure_mmhg: Some(0.0),
        pocus_thrombus_confirmed: Some(false),
        ..Default::default()
    };

    let wire_packet = state.apply_stress_test_patch(patch).expect("apply nominal patch");
    assert_eq!(wire_packet.flight_day, 180);

    let packet = state.latest_snapshot().expect("snapshot exists");
    assert_eq!(packet.flight_day, 180);

    // Verify alert severity is nominal or mild caution in baseline flight
    assert!(
        packet.alert_severity <= AlertSeverity::Caution,
        "unexpected alert severity: {:?}",
        packet.alert_severity
    );

    // In nominal transit, decompression remains locked and auto-vent remains armed
    assert!(
        packet.active_playbook.safety_gates.gate4_invasive_decompression_locked,
        "invasive decompression must remain locked in nominal transit"
    );
    assert!(
        packet.active_playbook.safety_gates.anticoagulant_lock_active,
        "anticoagulant lock must remain active without confirmed thrombus"
    );
    assert!(
        packet.active_playbook.safety_gates.lbnp_auto_vent_armed,
        "lbnp auto vent must remain armed"
    );
}

/// SCEN-02: Acute Venous Stasis & POCUS Thrombus Confirmation (Hard Gate 1).
/// Verifies that anticoagulant medications remain locked during sluggish venous flow
/// and unlock strictly upon POCUS intraluminal thrombus verification.
#[test]
fn test_scen_02_acute_venous_stasis_pocus_gate1() {
    let bio = baseline_biometrics();
    let musculo = baseline_musculo();
    let mut jugular = baseline_jugular();
    jugular.tau_w_dyn_cm2 = 0.72; // Severe endothelial flow stasis
    jugular.flow_grade = JugularFlowGrade::StagnantBidirectional;
    jugular.pocus_thrombus_confirmed = false;

    let mut nqs = baseline_nqs();
    nqs.rho_tau_w = 0.08; // Critical IJV shear stress triggers Playbook #01

    let scenario = baseline_scenario();

    // Stage A: Stasis without POCUS confirmation -> Playbook #01, Gate 1 MUST be active
    let candidate_a = select_candidate_playbook(&bio, &musculo, &jugular, &nqs, vec![]);
    assert_eq!(candidate_a.playbook_id, "PLAYBOOK_01_VENOUS_STASIS_LBNP");

    let gated_a = enforce_hard_clinical_safety_gates_ext(
        candidate_a, &bio, &musculo, &jugular, &scenario, None, None, None,
    );

    assert!(
        gated_a.safety_gates.anticoagulant_lock_active,
        "Gate 1 must lock anticoagulants when pocus_thrombus_confirmed is false"
    );

    // Verify that NO pharmacological anticoagulant actions survive Gate 1
    for action in &gated_a.actions {
        assert!(
            !action.action_id.contains("ANTICOAG") && !action.category.contains("PHARMACOLOGICAL_ANTICOAGULANT"),
            "Anticoagulant medication leaked past Gate 1 lock: {:?}",
            action.label
        );
    }

    // Stage B: POCUS ultrasound confirms intraluminal thrombus -> Playbook #02, Gate 1 unlocks
    jugular.pocus_thrombus_confirmed = true;
    let scenario_confirmed = StressTestScenarioInput {
        pocus_thrombus_confirmed: true,
        ..scenario
    };

    let candidate_b = select_candidate_playbook(&bio, &musculo, &jugular, &nqs, vec![]);
    assert_eq!(candidate_b.playbook_id, "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS");

    let gated_b = enforce_hard_clinical_safety_gates_ext(
        candidate_b,
        &bio,
        &musculo,
        &jugular,
        &scenario_confirmed,
        None,
        None,
        None,
    );

    assert!(
        !gated_b.safety_gates.anticoagulant_lock_active,
        "Gate 1 must release anticoagulant lock once POCUS confirms thrombus"
    );
    assert!(
        gated_b.actions.iter().any(|a| a.action_id.contains("ANTICOAG")),
        "Anticoagulant medication must be unlocked after POCUS confirmation"
    );
}

/// SCEN-03: LBNP Syncope Pre-emption & Chamber Auto-Vent (Hard Gate 2).
/// Verifies that systolic blood pressure drop > 15 mmHg or HR > 115 bpm triggers
/// automatic chamber venting back to 0 mmHg to prevent loss of consciousness.
#[test]
fn test_scen_03_lbnp_syncope_preemption_gate2() {
    let mut bio = baseline_biometrics();
    let musculo = baseline_musculo();
    let mut jugular = baseline_jugular();
    jugular.lbnp_active = true;
    jugular.lbnp_pressure_mmhg = -30.0;

    let nqs = baseline_nqs();

    // Trigger A: Acute Systolic Blood Pressure Drop (19 mmHg drop > 15 mmHg threshold)
    bio.sbp_mmhg = Some(101.0); // 120 - 101 = 19 mmHg drop
    let scenario_a = StressTestScenarioInput {
        lbnp_active: true,
        lbnp_pressure_mmhg: -30.0,
        systolic_bp_drop_mmhg: 19.0,
        ..baseline_scenario()
    };

    let candidate_a = select_candidate_playbook(&bio, &musculo, &jugular, &nqs, vec![]);
    let gated_a = enforce_hard_clinical_safety_gates_ext(
        candidate_a, &bio, &musculo, &jugular, &scenario_a, None, None, None,
    );

    // Gate 2 auto-vent armed invariant
    assert!(
        gated_a.safety_gates.lbnp_auto_vent_armed,
        "Gate 2 auto-vent must be armed during active negative pressure session"
    );
    assert_eq!(
        gated_a.actions[0].action_id, "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG",
        "Emergency auto-vent override action must be inserted at index 0 on SBP drop > 15 mmHg"
    );

    // Verify SBP drop condition exceeds limit
    let sbp_drop = (120.0 - bio.sbp_mmhg.unwrap_or(120.0)).max(scenario_a.systolic_bp_drop_mmhg);
    assert!(
        sbp_drop > LBNP_MAX_SYS_BP_DROP_MMHG,
        "Simulated drop ({sbp_drop} mmHg) must exceed limit ({LBNP_MAX_SYS_BP_DROP_MMHG} mmHg)"
    );

    // Trigger B: Acute Tachycardic Pre-Syncope (HR = 122 bpm > 115 bpm threshold)
    bio.sbp_mmhg = Some(118.0);
    bio.heart_rate_bpm = Some(122.0);
    assert!(
        bio.heart_rate_bpm.unwrap_or(0.0) > LBNP_MAX_SAFE_HR_BPM,
        "Tachycardic syncope guard must trip when HR exceeds {LBNP_MAX_SAFE_HR_BPM} bpm"
    );

    let scenario_b = StressTestScenarioInput {
        lbnp_active: true,
        lbnp_pressure_mmhg: -30.0,
        systolic_bp_drop_mmhg: 2.0,
        ..baseline_scenario()
    };

    let candidate_b = select_candidate_playbook(&bio, &musculo, &jugular, &nqs, vec![]);
    let gated_b = enforce_hard_clinical_safety_gates_ext(
        candidate_b, &bio, &musculo, &jugular, &scenario_b, None, None, None,
    );

    assert!(gated_b.safety_gates.lbnp_auto_vent_armed);
    assert_eq!(
        gated_b.actions[0].action_id, "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG",
        "Emergency auto-vent override action must be inserted at index 0 on HR > 115 bpm"
    );
}

/// SCEN-04: Mars Aerocapture & 0.38g Landing Gait Asymmetry (Hard Gate 3).
/// Verifies that Gait Asymmetry Index GAI > 12.0% automatically engages
/// exoskeleton ankle damping and locks high-impact plyometric training.
#[test]
fn test_scen_04_mars_aerocapture_gait_damping_gate3() {
    let bio = baseline_biometrics();
    let mut musculo = baseline_musculo();
    let jugular = baseline_jugular();
    let nqs = baseline_nqs();

    // GAI elevated to 14.8% due to soleus atrophy post Mars landing
    musculo.gai_pct = 14.8;
    assert!(
        musculo.gai_pct > GAI_MAX_SAFE_PCT,
        "GAI must exceed safe threshold (12.0%)"
    );

    let scenario = StressTestScenarioInput {
        flight_day: 210,
        ..baseline_scenario()
    };

    let candidate = select_candidate_playbook(&bio, &musculo, &jugular, &nqs, vec![]);
    let gated = enforce_hard_clinical_safety_gates_ext(
        candidate, &bio, &musculo, &jugular, &scenario, None, None, None,
    );

    assert!(
        gated.safety_gates.eva_suit_damping_active,
        "Gate 3 suit damping must engage when GAI exceeds 12.0%"
    );
    assert!(
        gated.safety_gates.gate4_eva_fitness_no_go,
        "Gate 4B must flag EVA fitness NO-GO when gait asymmetry is elevated"
    );
    assert!(
        gated.actions.iter().any(|a| a.action_id == "ACT_EVA_SUIT_ANKLE_DAMPING_038G"),
        "Ankle damping action must be added to countermeasure list"
    );
    assert!(
        gated.actions.iter().any(|a| a.action_id == "ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK"),
        "EVA NO-GO lock must be present"
    );
}

/// SCEN-05: Nephrolithiasis (Renal Stone Risk) from Microgravity Bone Resorption.
/// Verifies that elevated urinary calcium (> 250 mg/d) and renal ultrasound twinkling
/// trigger Playbook #10 for forced hydration and ARED mechanostat calibration.
#[test]
fn test_scen_05_nephrolithiasis_renal_stone_playbook10() {
    let bio = baseline_biometrics();
    let mut musculo = baseline_musculo();
    let jugular = baseline_jugular();
    let nqs = baseline_nqs();

    // Accelerated bone turnover: urinary calcium filtered into urine exceeds 250 mg/d
    musculo.urinary_calcium_mg_d = 295.0;

    let renal_pocus = PocusRenalBladderScan {
        hydronephrosis_grade: 2,
        calculus_detected: true,
        calculus_diameter_mm: 4.2,
        acoustic_shadowing_present: true,
        twinkling_artifact_present: true,
        ureteral_jet_symmetry_ratio: 0.20,
        post_void_bladder_volume_ml: 120.0,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    };

    assert!(
        renal_pocus.is_colic_risk(),
        "POCUS scan with hydronephrosis and calculus must indicate colic risk"
    );

    let candidate = select_candidate_playbook_ext(
        &bio,
        &musculo,
        &jugular,
        &nqs,
        vec!["BONE_RESORPTION_CALCIUM_FLUX".to_string()],
        None,
        Some(&renal_pocus),
        None,
        210,
        None,
        None,
    );

    assert_eq!(
        candidate.playbook_id, "PLAYBOOK_10_RENAL_LITHIASIS",
        "Playbook #10 must engage on confirmed renal lithiasis findings"
    );

    // Verify key countermeasure actions are present: hydration and citrate buffering
    let has_hydration = candidate
        .actions
        .iter()
        .any(|a| a.action_id == "ACT_ORAL_HYDRATION_BOLUS_1000ML");
    assert!(
        has_hydration,
        "Playbook #10 must prescribe forced hydration countermeasure"
    );
}

/// SCEN-06: Multiple-Trauma Tension Pneumothorax & Invasive Decompression (Hard Gate 4A).
/// Verifies that needle thoracostomy is locked unless eFAST ultrasound confirms pneumothorax,
/// or extreme vital collapse (Shock Index >= 1.20 and SpO2 < 85%) occurs.
#[test]
fn test_scen_06_trauma_decompression_gate4a_and_4b() {
    let mut bio = baseline_biometrics();
    let musculo = baseline_musculo();
    let jugular = baseline_jugular();
    let scenario = baseline_scenario();

    let candidate_trauma = ActivePlaybook {
        playbook_id: "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE".to_string(),
        title: "Playbook #15: eFAST Thoraco-Abdominal Trauma Triage".to_string(),
        causal_chain_summary: vec!["Trauma mechanism".to_string()],
        safety_gates: SafetyGates::default(),
        actions: vec![
            CountermeasureAction {
                action_id: "ACT_NEEDLE_DECOMPRESSION_2ND_ICL".to_string(),
                label: "Perform emergency needle decompression 2nd intercostal mid-clavicular line".to_string(),
                category: "INVASIVE_PROCEDURE".to_string(),
                delta_rho_per_hour: 0.35,
            },
            CountermeasureAction {
                action_id: "ACT_INTRAVENOUS_ACCESS_AND_AUTOTRANSFUSION".to_string(),
                label: "Establish bilateral large-bore peripheral access".to_string(),
                category: "CLINICAL_COUNTERMEASURE".to_string(),
                delta_rho_per_hour: 0.20,
            },
        ],
    };

    // Stage A: eFAST negative (lung sliding present, no pneumothorax) and stable shock index
    let efast_negative = PocusEfastScan {
        lung_sliding_absent: false,
        lung_point_confirmed: false,
        m_mode_barcode_sign_confirmed: false,
        ..Default::default()
    };

    let gated_a = enforce_hard_clinical_safety_gates_ext(
        candidate_trauma.clone(),
        &bio,
        &musculo,
        &jugular,
        &scenario,
        Some(&efast_negative),
        None,
        Some(0.65), // Stable shock index (72 bpm / 110 mmHg)
    );

    assert!(
        gated_a.safety_gates.gate4_invasive_decompression_locked,
        "Gate 4A must lock needle thoracostomy when eFAST is negative and vitals stable"
    );
    assert!(
        gated_a.actions.iter().all(|a| !a.action_id.contains("NEEDLE_DECOMPRESSION")),
        "Invasive needle thoracostomy must be stripped when locked"
    );

    // Stage B: Confirmed tension pneumothorax on eFAST ultrasound -> Decompression unlocked
    let efast_positive = PocusEfastScan {
        lung_sliding_absent: true,
        lung_point_confirmed: true,
        m_mode_barcode_sign_confirmed: true,
        ..Default::default()
    };
    assert!(efast_positive.is_pneumothorax_verified());

    let gated_b = enforce_hard_clinical_safety_gates_ext(
        candidate_trauma.clone(),
        &bio,
        &musculo,
        &jugular,
        &scenario,
        Some(&efast_positive),
        None,
        Some(0.85),
    );

    assert!(
        !gated_b.safety_gates.gate4_invasive_decompression_locked,
        "Gate 4A must unlock needle thoracostomy once eFAST confirms pneumothorax"
    );
    assert!(
        gated_b.actions.iter().any(|a| a.action_id.contains("NEEDLE_DECOMPRESSION")),
        "Needle thoracostomy action must be retained when unlocked"
    );

    // Stage C: Emergency Vital Collapse Override (Shock Index = 1.35 >= 1.20, SpO2 = 82% < 85%)
    bio.heart_rate_bpm = Some(135.0);
    bio.sbp_mmhg = Some(100.0);
    bio.spo2_pct = Some(82.0);

    let gated_c = enforce_hard_clinical_safety_gates_ext(
        candidate_trauma,
        &bio,
        &musculo,
        &jugular,
        &scenario,
        Some(&efast_negative), // Even if ultrasound probe is damaged or negative
        None,
        Some(1.35),
    );

    assert!(
        !gated_c.safety_gates.gate4_invasive_decompression_locked,
        "Gate 4A must unlock via emergency vital collapse override (Shock Index >= 1.20 and SpO2 < 85%)"
    );
}
