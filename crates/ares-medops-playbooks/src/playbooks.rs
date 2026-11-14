//! Fase 10 (E1): Esecutore deterministico Type-1 Crystallized dei 5 Playbook MedOps (#01-#05).

use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularHemodynamics, Musculoskeletal,
    NqsStlMargins, SafetyGates,
};

/// Seleziona deterministicamente il Playbook candidato prima dell'applicazione finale dei Safety Gates.
#[inline]
pub fn select_candidate_playbook(
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    nqs: &NqsStlMargins,
    causal_chain_summary: Vec<String>,
) -> ActivePlaybook {
    let default_gates = SafetyGates {
        anticoagulant_lock_active: !jugular.pocus_thrombus_confirmed,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active: musculo.gai_pct > 12.0,
    };

    // Priorita 1: Trombo giugulare confermato al POCUS B-Mode (#02)
    if jugular.pocus_thrombus_confirmed {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS".to_string(),
            title: "Playbook #02: POCUS-Confirmed IJV Thrombosis Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_ANTICOAG_ENOXAPARIN".to_string(),
                    label: "Initiate weight-adjusted Enoxaparin / Apixaban (POCUS thrombus verified)".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.22,
                },
                CountermeasureAction {
                    action_id: "ACT_SUSPEND_VALSALVA_ARED".to_string(),
                    label: "Suspend high-Valsalva heavy ARED squats to prevent thrombus embolization".to_string(),
                    category: "MECHANICAL_RESTRICTION".to_string(),
                    delta_rho_per_hour: 0.15,
                },
            ],
        };
    }

    // Priorita 2: Allerta Radiazioni Solari CSA CANS (#05)
    if biometrics.radiation_dose_rate_msv_d > 1.5 {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS".to_string(),
            title: "Playbook #05: CSA CANS Solar Particle Event Storm Shelter Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_STORM_SHELTER_INGRESS".to_string(),
                    label: "Relocate crew to polyethylene/water-shielded habitat core immediately".to_string(),
                    category: "RADIATION_ALARA".to_string(),
                    delta_rho_per_hour: 0.28,
                },
                CountermeasureAction {
                    action_id: "ACT_ENDOTHELIAL_ANTIOXIDANT".to_string(),
                    label: "Administer endothelial antioxidant & B-Complex radioprotective protocol".to_string(),
                    category: "METABOLIC_COUNTERMEASURE".to_string(),
                    delta_rho_per_hour: 0.09,
                },
            ],
        };
    }

    // Priorita 3: Stasi Venosa Giugulare / Shear Stress Critico senza trombo (#01)
    if nqs.rho_tau_w < 0.15 {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_01_VENOUS_STASIS_LBNP".to_string(),
            title: "Playbook #01: Non-Pharmacological IJV Stasis Reversal (LBNP + Calf Pump)".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_LBNP_MINUS_30_MMHG".to_string(),
                    label: "Activate Lower Body Negative Pressure (LBNP) at -30 mmHg for 45 min with active calf contractions".to_string(),
                    category: "PHYSICAL_HEMODYNAMIC".to_string(),
                    delta_rho_per_hour: 0.19,
                },
                CountermeasureAction {
                    action_id: "ACT_POCUS_NECK_SCAN".to_string(),
                    label: "Perform bilateral B-Mode & Doppler POCUS compression exam of Internal Jugular Vein".to_string(),
                    category: "DIAGNOSTIC_VERIFICATION".to_string(),
                    delta_rho_per_hour: 0.12,
                },
            ],
        };
    }

    // Priorita 4: Rischio Neuro-Oculare SANS (#04)
    if nqs.rho_sans < 0.20 {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION".to_string(),
            title: "Playbook #04: SANS Translaminar Pressure & Venous Decongestion Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![CountermeasureAction {
                action_id: "ACT_VENOUS_THIGH_CUFFS".to_string(),
                label: "Apply calibrated lower-extremity Venous Thigh Cuffs (50 mmHg) + nocturnal LBNP".to_string(),
                category: "PHYSICAL_HEMODYNAMIC".to_string(),
                delta_rho_per_hour: 0.14,
            }],
        };
    }

    // Default / Priorita 5: Ottimizzazione Meccanotrasduzione ARED & Osso (#03)
    ActivePlaybook {
        playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED".to_string(),
        title: "Playbook #03: Frost Mechanostat ARED Loading & Renal Stone Prevention".to_string(),
        causal_chain_summary,
        safety_gates: default_gates,
        actions: vec![
            CountermeasureAction {
                action_id: "ACT_ARED_FROST_LOAD".to_string(),
                label: "Maintain ARED resistive squat/heel-raise load >= 125 kgf (> 1000 microstrain)".to_string(),
                category: "MECHANICAL_COUNTERMEASURE".to_string(),
                delta_rho_per_hour: 0.11,
            },
            CountermeasureAction {
                action_id: "ACT_HYDRATION_CITRATE".to_string(),
                label: "Maintain fluid intake >= 2.8 L/day + potassium citrate to buffer urinary calcium".to_string(),
                category: "METABOLIC_COUNTERMEASURE".to_string(),
                delta_rho_per_hour: 0.07,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::telemetry::JugularFlowGrade;

    fn sample_biometrics(rad_msv_d: f64) -> Biometrics {
        Biometrics {
            heart_rate_bpm: Some(68.0),
            pulse_rate_bpm: Some(67.0),
            resp_rate_brpm: Some(14.0),
            spo2_pct: Some(98.0),
            rmssd_ms: Some(44.0),
            sdnn_ms: Some(58.0),
            pnn50_pct: Some(22.0),
            lf_hf_ratio: Some(1.8),
            vocal_f0_hz: Some(118.0),
            vocal_jitter_pct: Some(0.5),
            radiation_dose_rate_msv_d: rad_msv_d,
            sqi_score: 0.92,
            missing_channels: vec![],
        }
    }

    fn sample_musculo() -> Musculoskeletal {
        Musculoskeletal {
            ared_daily_load_kgf: 125.0,
            soleus_csa_pct: 96.0,
            echo_intensity_au: 52.0,
            mqi_index: 0.88,
            sclerostin_pmol_l: 25.0,
            urinary_calcium_mg_d: 185.0,
            gai_pct: 5.5,
        }
    }

    fn sample_jugular(tau_w: f64, pocus_confirmed: bool) -> JugularHemodynamics {
        JugularHemodynamics {
            ijv_csa_mm2: 78.0,
            ijv_vmax_cm_s: 5.2,
            tau_w_dyn_cm2: tau_w,
            flow_grade: if pocus_confirmed {
                JugularFlowGrade::OccludedThrombus
            } else {
                JugularFlowGrade::StagnantBidirectional
            },
            pocus_thrombus_confirmed: pocus_confirmed,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
        }
    }

    fn sample_nqs(rho_tau_w: f64, rho_sans: f64) -> NqsStlMargins {
        NqsStlMargins {
            rho_tau_w,
            rho_ared: 0.85,
            rho_sost: 0.80,
            rho_rmssd: 0.75,
            rho_sans,
            rho_global: rho_tau_w.min(rho_sans),
            ttv_hours: 120.0,
            ttv_ci95_low_hours: 90.0,
            ttv_ci95_high_hours: 150.0,
            mri_pct: 72.0,
        }
    }

    #[test]
    fn test_playbook_01_selected_on_low_tau_w_without_thrombus() {
        let bio = sample_biometrics(0.45);
        let musc = sample_musculo();
        let jug = sample_jugular(0.85, false);
        let nqs = sample_nqs(-0.22, 0.65);

        let pb = select_candidate_playbook(&bio, &musc, &jug, &nqs, vec!["stasis".to_string()]);
        assert_eq!(pb.playbook_id, "PLAYBOOK_01_VENOUS_STASIS_LBNP");
        assert!(pb.safety_gates.anticoagulant_lock_active);
        assert!(pb.actions.iter().any(|a| a.action_id == "ACT_LBNP_MINUS_30_MMHG"));
    }

    #[test]
    fn test_playbook_02_selected_only_when_pocus_thrombus_confirmed() {
        let bio = sample_biometrics(0.45);
        let musc = sample_musculo();
        let jug = sample_jugular(0.60, true);
        let nqs = sample_nqs(-0.38, 0.60);

        let pb = select_candidate_playbook(&bio, &musc, &jug, &nqs, vec!["thrombus".to_string()]);
        assert_eq!(pb.playbook_id, "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS");
        assert!(!pb.safety_gates.anticoagulant_lock_active);
        assert_eq!(pb.actions[0].action_id, "ACT_ANTICOAG_ENOXAPARIN");
    }

    #[test]
    fn test_playbook_03_04_and_05_priority_selection() {
        let musc = sample_musculo();
        let jug = sample_jugular(2.40, false);

        // Playbook #05 on SPE radiation > 1.5 mSv/d
        let bio_rad = sample_biometrics(3.2);
        let nqs_nom = sample_nqs(0.75, 0.75);
        let pb05 = select_candidate_playbook(&bio_rad, &musc, &jug, &nqs_nom, vec![]);
        assert_eq!(pb05.playbook_id, "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS");

        // Playbook #04 on SANS margin < 0.20
        let bio_nom = sample_biometrics(0.4);
        let nqs_sans = sample_nqs(0.65, 0.10);
        let pb04 = select_candidate_playbook(&bio_nom, &musc, &jug, &nqs_sans, vec![]);
        assert_eq!(pb04.playbook_id, "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION");

        // Playbook #03 default when tau_w and sans are nominal
        let pb03 = select_candidate_playbook(&bio_nom, &musc, &jug, &nqs_nom, vec![]);
        assert_eq!(pb03.playbook_id, "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED");
    }
}
