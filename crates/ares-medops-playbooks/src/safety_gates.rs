//! Fase 11 (E2): Macchina a stati deterministica dei 3 Hard Clinical Safety Gates.

use ares_core_types::constants::{
    GAI_MAX_SAFE_PCT, LBNP_MAX_SAFE_HR_BPM, LBNP_MAX_SYS_BP_DROP_MMHG,
};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularHemodynamics, Musculoskeletal,
    SafetyGates, StressTestScenarioInput,
};

/// Applica in modo inflessibile i 3 Hard Clinical Safety Gates al Playbook candidato.
#[inline]
pub fn enforce_hard_clinical_safety_gates(
    mut playbook: ActivePlaybook,
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    scenario: &StressTestScenarioInput,
) -> ActivePlaybook {
    let anticoagulant_lock_active = !jugular.pocus_thrombus_confirmed;
    let hr = biometrics.heart_rate_bpm.unwrap_or(72.0);
    let pre_syncope_detected = jugular.lbnp_active
        && (scenario.systolic_bp_drop_mmhg > LBNP_MAX_SYS_BP_DROP_MMHG
            || hr > LBNP_MAX_SAFE_HR_BPM);
    let eva_suit_damping_active = musculo.gai_pct > GAI_MAX_SAFE_PCT;

    playbook.safety_gates = SafetyGates {
        anticoagulant_lock_active,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active,
    };

    // Gate 1: Rimuove categoricamente qualsiasi farmaco anticoagulante se POCUS non conferma trombo
    if anticoagulant_lock_active {
        playbook.actions.retain(|a| {
            !a.action_id.contains("ANTICOAG") && !a.category.contains("PHARMACOLOGICAL")
        });
    }

    // Gate 2: Se viene rilevato rischio pre-sincopale durante LBNP, sfiata immediatamente a 0 mmHg
    if pre_syncope_detected {
        playbook.actions.insert(
            0,
            CountermeasureAction {
                action_id: "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG".to_string(),
                label: format!(
                    "SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (SBP drop {:.1} mmHg / HR {:.0} bpm)",
                    scenario.systolic_bp_drop_mmhg, hr
                ),
                category: "HARD_SAFETY_GATE_OVERRIDE".to_string(),
                delta_rho_per_hour: 0.35,
            },
        );
    }

    // Gate 3: Se GAI > 12%, aggiunge vincolo di smorzamento caviglia tuta EVA a 0.38g
    if eva_suit_damping_active {
        playbook.actions.push(CountermeasureAction {
            action_id: "ACT_EVA_SUIT_ANKLE_DAMPING_038G".to_string(),
            label: format!(
                "SAFETY GATE 3 ACTIVE: Lock plyometric impact & set Martian EVA suit ankle damping +25% (GAI = {:.1}% > 12.0%)",
                musculo.gai_pct
            ),
            category: "BIOMECHANICAL_SAFETY_GATE".to_string(),
            delta_rho_per_hour: 0.10,
        });
    }

    playbook
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::telemetry::JugularFlowGrade;

    fn dummy_playbook_with_anticoag() -> ActivePlaybook {
        ActivePlaybook {
            playbook_id: "PLAYBOOK_01_VENOUS_STASIS_LBNP".to_string(),
            title: "Test Playbook".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates {
                anticoagulant_lock_active: true,
                lbnp_auto_vent_armed: true,
                eva_suit_damping_active: false,
            },
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_ANTICOAG_ENOXAPARIN".to_string(),
                    label: "Unauthorized anticoagulant".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.22,
                },
                CountermeasureAction {
                    action_id: "ACT_LBNP_MINUS_30_MMHG".to_string(),
                    label: "LBNP -30 mmHg".to_string(),
                    category: "PHYSICAL_HEMODYNAMIC".to_string(),
                    delta_rho_per_hour: 0.19,
                },
            ],
        }
    }

    fn dummy_bio(hr: f64) -> Biometrics {
        Biometrics {
            heart_rate_bpm: Some(hr),
            pulse_rate_bpm: Some(hr),
            resp_rate_brpm: Some(15.0),
            spo2_pct: Some(98.0),
            rmssd_ms: Some(40.0),
            hrv_unavailable_reason: None,
            sdnn_ms: Some(50.0),
            pnn50_pct: Some(20.0),
            lf_hf_ratio: Some(2.0),
            vocal_f0_hz: Some(118.0),
            vocal_jitter_pct: Some(0.6),
            radiation_dose_rate_msv_d: 0.5,
            sqi_score: 0.90,
            missing_channels: vec![],
            quality_flags: vec![],
        }
    }

    fn dummy_musculo(gai_pct: f64) -> Musculoskeletal {
        Musculoskeletal {
            ared_daily_load_kgf: 80.0,
            soleus_csa_pct: 82.0,
            echo_intensity_au: 75.0,
            mqi_index: 0.55,
            sclerostin_pmol_l: 42.0,
            urinary_calcium_mg_d: 260.0,
            gai_pct,
        }
    }

    fn dummy_jugular(pocus: bool, lbnp_active: bool) -> JugularHemodynamics {
        JugularHemodynamics {
            ijv_csa_mm2: 88.0,
            ijv_vmax_cm_s: 4.5,
            tau_w_dyn_cm2: 0.85,
            flow_grade: JugularFlowGrade::StagnantBidirectional,
            pocus_thrombus_confirmed: pocus,
            lbnp_active,
            lbnp_pressure_mmhg: if lbnp_active { -30.0 } else { 0.0 },
        }
    }

    fn dummy_scenario(pocus: bool, lbnp_active: bool, sbp_drop: f64) -> StressTestScenarioInput {
        StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 90,
            ared_daily_load_kgf: 80.0,
            radiation_dose_rate_msv_d: 0.5,
            lbnp_active,
            lbnp_pressure_mmhg: -30.0,
            pocus_thrombus_confirmed: pocus,
            systolic_bp_drop_mmhg: sbp_drop,
        }
    }

    #[test]
    fn test_gate1_strips_anticoagulants_when_pocus_is_false() {
        let pb = dummy_playbook_with_anticoag();
        let bio = dummy_bio(72.0);
        let musc = dummy_musculo(6.0);
        let jug = dummy_jugular(false, false);
        let scen = dummy_scenario(false, false, 4.0);

        let enforced = enforce_hard_clinical_safety_gates(pb, &bio, &musc, &jug, &scen);
        assert!(enforced.safety_gates.anticoagulant_lock_active);
        assert!(
            enforced
                .actions
                .iter()
                .all(|a| !a.action_id.contains("ANTICOAG") && !a.category.contains("PHARMACOLOGICAL"))
        );
        assert_eq!(enforced.actions.len(), 1);
        assert_eq!(enforced.actions[0].action_id, "ACT_LBNP_MINUS_30_MMHG");
    }

    #[test]
    fn test_gate2_injects_auto_vent_when_sbp_drops_over_15_mmhg() {
        let pb = dummy_playbook_with_anticoag();
        let bio = dummy_bio(78.0);
        let musc = dummy_musculo(6.0);
        let jug = dummy_jugular(false, true);
        let scen = dummy_scenario(false, true, 18.5);

        let enforced = enforce_hard_clinical_safety_gates(pb, &bio, &musc, &jug, &scen);
        assert_eq!(
            enforced.actions[0].action_id,
            "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
        );
    }

    #[test]
    fn test_gate2_injects_auto_vent_when_hr_exceeds_115_bpm_and_gate3_on_gai() {
        let pb = dummy_playbook_with_anticoag();
        let bio = dummy_bio(122.0);
        let musc = dummy_musculo(15.2);
        let jug = dummy_jugular(false, true);
        let scen = dummy_scenario(false, true, 8.0);

        let enforced = enforce_hard_clinical_safety_gates(pb, &bio, &musc, &jug, &scen);
        assert_eq!(
            enforced.actions[0].action_id,
            "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
        );
        assert!(enforced.safety_gates.eva_suit_damping_active);
        assert!(
            enforced
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_EVA_SUIT_ANKLE_DAMPING_038G")
        );
    }
}
