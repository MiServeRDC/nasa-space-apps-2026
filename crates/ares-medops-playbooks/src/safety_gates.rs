//! Fase 11 (E2) & Fase 41 (N4): Macchina a stati deterministica dei 4 Hard Clinical Safety Gates.

use crate::playbooks_bmed::apply_gate7_bmed_guards;
use crate::pocus_multiorgan::PocusEfastScan;
pub use crate::safety_gates_360::enforce_extended_360_safety_gates;
use ares_causal_graph::space_pharmacology::MedicalConsumableInventory;
use ares_core_types::constants::{
    GAI_MAX_SAFE_PCT, LBNP_MAX_SAFE_HR_BPM, LBNP_MAX_SYS_BP_DROP_MMHG,
    LBNP_MAX_VASOVAGAL_HR_DROP_BPM, LBNP_MIN_SAFE_HR_BRADYCARDIA_BPM, SHOCK_INDEX_ATTENTION,
    SHOCK_INDEX_CRITICAL, sanitize_f64,
};
use ares_core_types::medical_360::{
    BMedTriageClass, BehavioralHealthState, CrewBiologicalProfile, ExtendedSafetyGates,
    LbnpBaselineState, RadiationArsState,
};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularHemodynamics, Musculoskeletal,
    SafetyGates, SpotPoctPanel, StressTestScenarioInput,
};

pub use ares_core_types::constants::ECLSS_PPCO2_ACTION_LIMIT_MMHG;

pub const PLATELET_ABSOLUTE_CONTRAINDICATION_K_UL: f64 = 75.0;
pub const RADIATION_ACUTE_THRESHOLD_MSV_D: f64 = 10.0;
pub const PLATELET_RADIATION_SAFE_FLOOR_K_UL: f64 = 100.0;
pub const LBNP_MIN_SAFE_PULSE_PRESSURE_MMHG: f64 = 25.0;

/// Restituisce `true` se l'azione rappresenta una terapia anticoagulante sistemica
/// (escludendo le azioni di override di sicurezza clinica).
#[inline]
pub fn is_systemic_anticoagulant_action(a: &CountermeasureAction) -> bool {
    let cat = a.category.as_str();
    if cat == "CLINICAL_SAFETY_GATE_OVERRIDE" {
        return false;
    }
    let id = a.action_id.as_str();
    cat == "PHARMACOLOGICAL_ANTICOAGULANT"
        || id.contains("ANTICOAG")
        || id.contains("ENOXAPARIN")
        || id.contains("APX")
        || id.contains("APIXABAN")
        || id.contains("RIVAROXABAN")
        || id.contains("HEPARIN")
}

/// Risolve deterministicamente la conta piastrinica effettiva (k/uL) secondo la gerarchia
/// di sicurezza clinica: override esplicito stress-test, altrimenti il minimo conservativo
/// tra POCT, biometria corrente e predizione nadir ARS.
#[inline]
pub fn resolve_effective_platelets_k_ul(
    stress_override: Option<f64>,
    poct: Option<&SpotPoctPanel>,
    bio_current: Option<f64>,
    ars_predicted_plt: Option<f64>,
) -> Option<f64> {
    if let Some(v) = stress_override.filter(|v| v.is_finite() && *v >= 0.0) {
        return Some(sanitize_f64(v, 0.0).clamp(0.0, 1500.0));
    }
    [
        poct.and_then(|p| p.platelet_count_k_ul),
        bio_current,
        ars_predicted_plt,
    ]
    .into_iter()
    .flatten()
    .filter(|v| v.is_finite() && *v >= 0.0)
    .map(|v| sanitize_f64(v, 0.0).clamp(0.0, 1500.0))
    .reduce(f64::min)
}

/// Applica in modo inflessibile i 4 Hard Clinical Safety Gates al Playbook candidato
/// con supporto per la baseline emodinamica pre-LBNP dinamica.
#[inline]
#[allow(clippy::too_many_arguments)]
pub fn enforce_hard_clinical_safety_gates_with_lbnp_baseline(
    mut playbook: ActivePlaybook,
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    scenario: &StressTestScenarioInput,
    efast: Option<&PocusEfastScan>,
    fatigue_index: Option<f64>,
    shock_index: Option<f64>,
    lbnp_baseline: Option<LbnpBaselineState>,
) -> ActivePlaybook {
    let platelet_contraindicated = biometrics
        .platelet_count_k_ul
        .is_some_and(|plt| plt < PLATELET_ABSOLUTE_CONTRAINDICATION_K_UL);
    let acute_radiation_contraindicated = biometrics.radiation_dose_rate_msv_d
        > RADIATION_ACUTE_THRESHOLD_MSV_D
        && biometrics
            .platelet_count_k_ul
            .is_none_or(|plt| plt < PLATELET_RADIATION_SAFE_FLOOR_K_UL);
    let bleeding_risk_active = platelet_contraindicated || acute_radiation_contraindicated;
    let anticoagulant_lock_active = !jugular.pocus_thrombus_confirmed || bleeding_risk_active;

    let ref_sbp = lbnp_baseline.map_or(120.0, |b| b.pre_lbnp_sbp_baseline_mmhg);
    let sbp_drop = biometrics.sbp_mmhg.map_or(scenario.systolic_bp_drop_mmhg, |sbp| {
        (ref_sbp - sbp).max(scenario.systolic_bp_drop_mmhg)
    });
    let pulse_pressure_narrowed = match (biometrics.sbp_mmhg, biometrics.dbp_mmhg) {
        (Some(sbp), Some(dbp)) if sbp > 0.0 => (sbp - dbp) < LBNP_MIN_SAFE_PULSE_PRESSURE_MMHG,
        _ => false,
    };
    let explicit_sensor_loss = biometrics
        .missing_channels
        .iter()
        .any(|ch| ch == "wearable_sensor_loss" || ch == "sensor_dropout");
    let dual_vital_blackout = biometrics.heart_rate_bpm.is_none() && biometrics.sbp_mmhg.is_none();
    let single_vital_missing_under_lbnp = jugular.lbnp_active
        && (biometrics.heart_rate_bpm.is_none()
            || (biometrics.sbp_mmhg.is_none()
                && scenario.systolic_bp_drop_mmhg <= 0.0
                && lbnp_baseline.is_some()));
    let sensor_dropout_critical =
        explicit_sensor_loss || dual_vital_blackout || single_vital_missing_under_lbnp;
    let hr_exceeded = biometrics
        .heart_rate_bpm
        .is_some_and(|hr_val| hr_val > LBNP_MAX_SAFE_HR_BPM);
    let vasovagal_bradycardia = jugular.lbnp_active
        && biometrics.heart_rate_bpm.is_some_and(|hr_val| {
            hr_val < LBNP_MIN_SAFE_HR_BRADYCARDIA_BPM
                || lbnp_baseline.is_some_and(|b| {
                    (b.pre_lbnp_hr_baseline_bpm - hr_val) > LBNP_MAX_VASOVAGAL_HR_DROP_BPM
                })
        });

    let pre_syncope_detected = jugular.lbnp_active
        && (sbp_drop > LBNP_MAX_SYS_BP_DROP_MMHG
            || hr_exceeded
            || vasovagal_bradycardia
            || pulse_pressure_narrowed
            || sensor_dropout_critical);
    let eva_suit_damping_active = musculo.gai_pct > GAI_MAX_SAFE_PCT;

    // Calcolo del Shock Index per Gate 4
    let computed_si = shock_index.or_else(|| {
        if let (Some(hr_val), Some(sbp_val)) = (biometrics.heart_rate_bpm, biometrics.sbp_mmhg) {
            if sbp_val > 0.0 {
                Some(hr_val / sbp_val)
            } else {
                None
            }
        } else {
            None
        }
    });

    // Gate 4A: Interlock Decompressione Toracica Invasiva (Needle Thoracostomy)
    // Sbloccata solo se:
    // 1) POCUS eFAST conferma assenza lung sliding + barcode M-mode / lung point, OPPURE
    // 2) Override vitale d'emergenza: Shock Index >= 1.20 e SpO2 < 85% (collasso tensivo immediato)
    let pneumothorax_verified = efast.is_some_and(|e| e.is_pneumothorax_verified());
    let spo2 = biometrics.spo2_pct.unwrap_or(98.0);
    let vital_collapse_override =
        computed_si.is_some_and(|si| si >= SHOCK_INDEX_CRITICAL) && spo2 < 85.0;
    let gate4_invasive_decompression_locked = !pneumothorax_verified && !vital_collapse_override;

    // Gate 4B: Interlock Idoneita Operativa EVA (Fitness-for-Duty)
    let cognitive_fatigued = fatigue_index.unwrap_or(0.0) >= 0.75;
    let si_elevated = computed_si.is_some_and(|si| si >= SHOCK_INDEX_ATTENTION);
    let gate4_eva_fitness_no_go = eva_suit_damping_active || cognitive_fatigued || si_elevated;

    let max_co2 = match (biometrics.cabin_ppco2_mmhg, biometrics.helmet_ppco2_mmhg) {
        (Some(c), Some(h)) => Some(c.max(h)),
        (Some(c), None) => Some(c),
        (None, Some(h)) => Some(h),
        (None, None) => None,
    };
    let eclss_alert = max_co2.is_some_and(|ppco2| ppco2 > ECLSS_PPCO2_ACTION_LIMIT_MMHG);

    playbook.safety_gates = SafetyGates {
        anticoagulant_lock_active,
        anticoagulant_contraindicated_bleeding_risk: bleeding_risk_active,
        lbnp_auto_vent_armed: true,
        lbnp_auto_vent_triggered: pre_syncope_detected,
        eva_suit_damping_active,
        gate4_invasive_decompression_locked,
        gate4_eva_fitness_no_go,
        eclss_environmental_co2_alert: eclss_alert,
    };

    // Gate 1: Rimuove categoricamente qualsiasi farmaco anticoagulante se POCUS non conferma trombo
    // o se sussiste controindicazione emorragica / trombocitopenia
    if anticoagulant_lock_active {
        playbook.actions.retain(|a| !is_systemic_anticoagulant_action(a));

        if bleeding_risk_active && jugular.pocus_thrombus_confirmed {
            playbook.actions.insert(
                0,
                CountermeasureAction {
                    action_id: "ACT_ANTICOAG_CONTRAINDICATED_THROMBOCYTOPENIA_RISK".to_string(),
                    label: "CONTRAINDICATION LOCK: Systemic Anticoagulation Blocked (Hemorrhagic Risk)".to_string(),
                    category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                    delta_rho_per_hour: 0.0,
                },
            );
        }
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

    // Gate 4A: Se bloccato, rimuove procedure toraciche invasive (toracostomia ad ago / drenaggio)
    if gate4_invasive_decompression_locked {
        playbook.actions.retain(|a| {
            !a.action_id.contains("THORACOSTOMY") && !a.action_id.contains("NEEDLE_DECOMPRESSION")
        });
    }

    // Gate 4B: Se non idoneo EVA, inietta blocco critico EVA
    if gate4_eva_fitness_no_go
        && !playbook
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK")
    {
        playbook.actions.insert(
            0,
            CountermeasureAction {
                action_id: "ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK".to_string(),
                label: format!(
                    "SAFETY GATE 4 TRIGGERED: EVA NO-GO LOCK ACTIVE (GAI={:.1}%, Fatigue={:.2}, SI={})",
                    musculo.gai_pct,
                    fatigue_index.unwrap_or(0.0),
                    computed_si.map_or("N/A".to_string(), |s| format!("{:.2}", s))
                ),
                category: "CRITICAL_SAFETY_LOCK".to_string(),
                delta_rho_per_hour: 0.0,
            },
        );
    }

    // Gate 2: Se viene rilevato rischio pre-sincopale durante LBNP, sfiata immediatamente a 0 mmHg (priorita assoluta al vertice)
    if pre_syncope_detected {
        playbook.actions.retain(|a| {
            !a.action_id.contains("LBNP_MAINTAIN")
                && !a.action_id.contains("LBNP_ESCALATE")
                && !a.action_id.contains("ACT_LBNP_MINUS_")
        });
        let hr_display = biometrics
            .heart_rate_bpm
            .map_or_else(|| "N/A".to_string(), |v| format!("{v:.0} bpm"));
        let vent_label = if sensor_dropout_critical {
            "SAFETY GATE 2 TRIGGERED: Emergency LBNP Auto-Vent to 0 mmHg (Sensor Dropout Fail-Safe)".to_string()
        } else if pulse_pressure_narrowed {
            format!(
                "SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (Pulse Pressure Narrowing < 25 mmHg, SBP drop {:.1} mmHg)",
                sbp_drop
            )
        } else if vasovagal_bradycardia {
            format!(
                "SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (Vasovagal Bradycardia HR {} / SBP drop {:.1} mmHg)",
                hr_display, sbp_drop
            )
        } else {
            format!(
                "SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (SBP drop {:.1} mmHg / HR {})",
                sbp_drop, hr_display
            )
        };
        playbook.actions.insert(
            0,
            CountermeasureAction {
                action_id: "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG".to_string(),
                label: vent_label,
                category: "HARD_SAFETY_GATE_OVERRIDE".to_string(),
                delta_rho_per_hour: 0.35,
            },
        );
    }

    playbook
}

/// Applica in modo inflessibile i 4 Hard Clinical Safety Gates al Playbook candidato.
#[inline]
#[allow(clippy::too_many_arguments)]
pub fn enforce_hard_clinical_safety_gates_ext(
    playbook: ActivePlaybook,
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    scenario: &StressTestScenarioInput,
    efast: Option<&PocusEfastScan>,
    fatigue_index: Option<f64>,
    shock_index: Option<f64>,
) -> ActivePlaybook {
    enforce_hard_clinical_safety_gates_with_lbnp_baseline(
        playbook,
        biometrics,
        musculo,
        jugular,
        scenario,
        efast,
        fatigue_index,
        shock_index,
        None,
    )
}

/// Applica in modo inflessibile i 4 Hard Clinical Safety Gates al Playbook candidato (firma standard).
#[inline]
pub fn enforce_hard_clinical_safety_gates(
    playbook: ActivePlaybook,
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    scenario: &StressTestScenarioInput,
) -> ActivePlaybook {
    enforce_hard_clinical_safety_gates_ext(
        playbook, biometrics, musculo, jugular, scenario, None, None, None,
    )
}

/// Unified enforcement pipeline for Core Gates 1-4 and Extended Aerospace 360 Gates 5-7.
#[allow(clippy::too_many_arguments)]
pub fn enforce_all_clinical_safety_gates_360(
    playbook: ActivePlaybook,
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    scenario: &StressTestScenarioInput,
    efast: Option<&PocusEfastScan>,
    fatigue_index: Option<f64>,
    shock_index: Option<f64>,
    lbnp_baseline: Option<LbnpBaselineState>,
    poct: Option<&SpotPoctPanel>,
    profile: Option<&CrewBiologicalProfile>,
    radiation_ars: Option<&RadiationArsState>,
    inventory: Option<&MedicalConsumableInventory>,
    mission_sol: f64,
    cumulative_habitat_gcr_gy: f64,
    current_qtc_ms: Option<f64>,
    gi_ulcer_history_or_bleed: bool,
    behavioral_health: Option<&BehavioralHealthState>,
) -> (ActivePlaybook, ExtendedSafetyGates) {
    let mut pb = enforce_hard_clinical_safety_gates_with_lbnp_baseline(
        playbook,
        biometrics,
        musculo,
        jugular,
        scenario,
        efast,
        fatigue_index,
        shock_index,
        lbnp_baseline,
    );

    let default_profile = CrewBiologicalProfile::default();
    let effective_profile = profile.unwrap_or(&default_profile);
    let (gated_pb, mut ext_gates) = enforce_extended_360_safety_gates(
        pb,
        biometrics,
        poct,
        effective_profile,
        radiation_ars,
        inventory,
        mission_sol,
        cumulative_habitat_gcr_gy,
        current_qtc_ms,
        shock_index,
        gi_ulcer_history_or_bleed,
    );
    pb = gated_pb;

    if let Some(bmed) = behavioral_health {
        let should_enforce_gate7 = pb.playbook_id == "PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS"
            || bmed.organic_delirium_mimic_detected
            || bmed.airlock_software_lockout_active
            || bmed.triage_classification != BMedTriageClass::Nominal;
        if should_enforce_gate7 {
            let qtc = current_qtc_ms.unwrap_or(410.0);
            pb = apply_gate7_bmed_guards(pb, bmed, qtc);
            ext_gates.gate7_bmed_delirium_or_restraint_guard_active =
                bmed.organic_delirium_mimic_detected
                    || bmed.airlock_software_lockout_active
                    || bmed.triage_classification != BMedTriageClass::Nominal;
        }
    }

    (pb, ext_gates)
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
                gate4_invasive_decompression_locked: true,
                gate4_eva_fitness_no_go: false,
                ..SafetyGates::default()
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
            sbp_mmhg: None,
            dbp_mmhg: None,
            ptt_ms: None,
            core_temp_celsius: None,
            skin_temp_celsius: None,
            sleep_stage_code: None,
            melanopic_edi_lux: None,
            personal_dose_rate_ugy_h: None,
            let_quality_factor: None,
            suit_metabolic_watts: None,
            helmet_ppco2_mmhg: None,
            cabin_ppco2_mmhg: None,
            platelet_count_k_ul: None,
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
                .all(|a| !is_systemic_anticoagulant_action(a))
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

    #[test]
    fn test_gate4a_strips_needle_decompression_without_pocus_or_vital_collapse() {
        let mut pb = dummy_playbook_with_anticoag();
        pb.actions.push(CountermeasureAction {
            action_id: "ACT_NEEDLE_DECOMPRESSION_2ND_ICL".to_string(),
            label: "Emergent needle decompression".to_string(),
            category: "INVASIVE_PROCEDURE".to_string(),
            delta_rho_per_hour: 0.0,
        });

        let bio = dummy_bio(80.0);
        let musc = dummy_musculo(5.0);
        let jug = dummy_jugular(false, false);
        let scen = dummy_scenario(false, false, 0.0);

        // Sin POCUS -> bloccato
        let enforced = enforce_hard_clinical_safety_gates(pb.clone(), &bio, &musc, &jug, &scen);
        assert!(enforced.safety_gates.gate4_invasive_decompression_locked);
        assert!(enforced.actions.iter().all(|a| !a.action_id.contains("NEEDLE_DECOMPRESSION")));

        // Con POCUS pneumotorace verificato -> sbloccato
        let efast = PocusEfastScan {
            lung_sliding_absent: true,
            m_mode_barcode_sign_confirmed: true,
            ..Default::default()
        };
        let unlocked_pocus = enforce_hard_clinical_safety_gates_ext(
            pb.clone(), &bio, &musc, &jug, &scen, Some(&efast), None, None,
        );
        assert!(!unlocked_pocus.safety_gates.gate4_invasive_decompression_locked);
        assert!(unlocked_pocus.actions.iter().any(|a| a.action_id.contains("NEEDLE_DECOMPRESSION")));

        // Con collasso vitale immediato (Shock Index >= 1.20 e SpO2 < 85%) -> sbloccato
        let bio_collapse = Biometrics {
            sbp_mmhg: Some(90.0), // SI = 130 / 90 = 1.44 >= 1.20
            spo2_pct: Some(82.0), // SpO2 < 85%
            ..dummy_bio(130.0)
        };
        let unlocked_vital = enforce_hard_clinical_safety_gates_ext(
            pb, &bio_collapse, &musc, &jug, &scen, None, None, None,
        );
        assert!(!unlocked_vital.safety_gates.gate4_invasive_decompression_locked);
    }

    #[test]
    fn test_gate4b_injects_eva_no_go_on_cognitive_fatigue_or_elevated_shock_index() {
        let pb = dummy_playbook_with_anticoag();
        let bio = dummy_bio(72.0);
        let musc = dummy_musculo(5.0);
        let jug = dummy_jugular(false, false);
        let scen = dummy_scenario(false, false, 0.0);

        // Fatica elevata (>= 0.75)
        let enforced_fatigue = enforce_hard_clinical_safety_gates_ext(
            pb.clone(), &bio, &musc, &jug, &scen, None, Some(0.82), None,
        );
        assert!(enforced_fatigue.safety_gates.gate4_eva_fitness_no_go);
        assert_eq!(
            enforced_fatigue.actions[0].action_id,
            "ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK"
        );

        // Shock Index elevato (>= 0.90)
        let enforced_si = enforce_hard_clinical_safety_gates_ext(
            pb, &bio, &musc, &jug, &scen, None, None, Some(0.95),
        );
        assert!(enforced_si.safety_gates.gate4_eva_fitness_no_go);
        assert_eq!(
            enforced_si.actions[0].action_id,
            "ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK"
        );
    }

    #[test]
    fn test_enforce_all_clinical_safety_gates_360_integrates_gates_1_through_7() {
        let mut pb = dummy_playbook_with_anticoag();
        pb.playbook_id = "PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS".to_string();
        pb.actions.push(CountermeasureAction {
            action_id: "ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK".to_string(),
            label: "CMRS restraint".to_string(),
            category: "BEHAVIORAL_SAFETY".to_string(),
            delta_rho_per_hour: 0.10,
        });
        pb.actions.push(CountermeasureAction {
            action_id: "ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM".to_string(),
            label: "Haloperidol".to_string(),
            category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
            delta_rho_per_hour: 0.15,
        });

        let bio = dummy_bio(88.0);
        let musc = dummy_musculo(5.0);
        let jug = dummy_jugular(false, false);
        let scen = dummy_scenario(false, false, 0.0);
        let bmed = BehavioralHealthState {
            acute_agitation_or_psychosis: true,
            organic_delirium_mimic_detected: true,
            imminent_harm_to_self_or_vehicle: false,
            triage_classification: BMedTriageClass::SecondaryOrganicToxicMetabolicDelirium,
            ..BehavioralHealthState::default()
        };

        let (gated, ext) = enforce_all_clinical_safety_gates_360(
            pb,
            &bio,
            &musc,
            &jug,
            &scen,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            10.0,
            0.05,
            Some(490.0),
            false,
            Some(&bmed),
        );

        assert!(gated.safety_gates.anticoagulant_lock_active);
        assert!(ext.gate7_bmed_delirium_or_restraint_guard_active);
        assert!(!gated.actions.iter().any(|a| a.action_id == "ACT_ANTICOAG_ENOXAPARIN"));
        assert!(!gated.actions.iter().any(|a| a.action_id == "ACT_BMED_CMRS_RESTRAINT_Q15MIN_NEUROVASCULAR_CHECK"));
        assert!(!gated.actions.iter().any(|a| a.action_id == "ACT_BMED_HALOPERIDOL_5MG_PLUS_LORAZEPAM_2MG_IM"));
        assert!(gated.actions.iter().any(|a| a.action_id == "ACT_GATE7_TREAT_REVERSIBLE_ORGANIC_DELIRIUM_CAUSE_FIRST"));
        assert!(gated.actions.iter().any(|a| a.action_id == "ACT_BMED_KETAMINE_1_2MG_KG_IM_DISSOCIATIVE"));
    }
}
