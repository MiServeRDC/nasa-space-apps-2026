//! Fase 10 (E1): Esecutore deterministico Type-1 Crystallized dei 5 Playbook MedOps (#01-#05).

use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularHemodynamics, Musculoskeletal,
    NqsStlMargins, SafetyGates,
};
use ares_core_types::{AnomalyDetectorKind, AnomalyStatus, VitalsAnomalyReport};

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
                    label:
                        "Initiate weight-adjusted Enoxaparin / Apixaban (POCUS thrombus verified)"
                            .to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.22,
                },
                CountermeasureAction {
                    action_id: "ACT_SUSPEND_VALSALVA_ARED".to_string(),
                    label:
                        "Suspend high-Valsalva heavy ARED squats to prevent thrombus embolization"
                            .to_string(),
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
                    label: "Relocate crew to polyethylene/water-shielded habitat core immediately"
                        .to_string(),
                    category: "RADIATION_ALARA".to_string(),
                    delta_rho_per_hour: 0.28,
                },
                CountermeasureAction {
                    action_id: "ACT_ENDOTHELIAL_ANTIOXIDANT".to_string(),
                    label:
                        "Administer endothelial antioxidant & B-Complex radioprotective protocol"
                            .to_string(),
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
            title: "Playbook #04: SANS Translaminar Pressure & Venous Decongestion Protocol"
                .to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![CountermeasureAction {
                action_id: "ACT_VENOUS_THIGH_CUFFS".to_string(),
                label:
                    "Apply calibrated lower-extremity Venous Thigh Cuffs (50 mmHg) + nocturnal LBNP"
                        .to_string(),
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

/// Acute vitals playbook (#06-#09) for an ALARM-level anomaly report, or `None`.
///
/// Acute cardiorespiratory alarms pre-empt the chronic deconditioning playbooks.
/// Physiological alarms outrank sensor dropouts; the detector reason becomes the
/// first entry of the causal chain. `delta_rho_per_hour` is 0.0: no modelled
/// effect on the NQS-STL margin is claimed for these first-response checks.
pub fn select_vitals_anomaly_playbook(
    report: &VitalsAnomalyReport,
    safety_gates: SafetyGates,
) -> Option<ActivePlaybook> {
    let alarm = |channel: &str, dropout: bool| {
        report.channels.iter().find(|c| {
            c.channel == channel
                && c.status == AnomalyStatus::Alarm
                && (c.detector == Some(AnomalyDetectorKind::SensorDropout)) == dropout
        })
    };
    let action = |id: &str, label: &str, category: &str| CountermeasureAction {
        action_id: id.to_string(),
        label: label.to_string(),
        category: category.to_string(),
        delta_rho_per_hour: 0.0,
    };
    let (trigger, playbook_id, title, actions) = if let Some(c) = alarm("spo2_pct", false) {
        (
            c,
            "PLAYBOOK_06_HYPOXEMIA_DESATURATION",
            "Playbook #06: Desaturation Below Personal Baseline",
            vec![
                action(
                    "ACT_VERIFY_SPO2_PROBE",
                    "Verify SpO2 probe position and perfusion; re-seat and re-read",
                    "DIAGNOSTIC_VERIFICATION",
                ),
                action(
                    "ACT_AIRWAY_BREATHING_CHECK",
                    "Check airway, breathing effort and respiratory rate; position crew member upright",
                    "CLINICAL_ASSESSMENT",
                ),
                action(
                    "ACT_CABIN_ATMOSPHERE_CHECK",
                    "Check cabin ppO2 / ppCO2 and scrubber status",
                    "ENVIRONMENTAL_CHECK",
                ),
                action(
                    "ACT_SUPPLEMENTAL_OXYGEN",
                    "Start supplemental oxygen per medical checklist if desaturation is confirmed",
                    "CLINICAL_COUNTERMEASURE",
                ),
            ],
        )
    } else if let Some(c) = alarm("heart_rate_bpm", false) {
        (
            c,
            "PLAYBOOK_07_HEART_RATE_ANOMALY",
            "Playbook #07: Heart Rate Outside Personal Baseline",
            vec![
                action(
                    "ACT_STOP_EXERTION",
                    "Stop exercise or LBNP session and rest in a restrained position",
                    "MECHANICAL_RESTRICTION",
                ),
                action(
                    "ACT_ECG_RHYTHM_CHECK",
                    "Acquire ECG rhythm strip and cross-check PPG pulse rate",
                    "DIAGNOSTIC_VERIFICATION",
                ),
                action(
                    "ACT_SYMPTOM_HYDRATION_CHECK",
                    "Assess symptoms, hydration and temperature; recheck after 5 min of rest",
                    "CLINICAL_ASSESSMENT",
                ),
            ],
        )
    } else if let Some(c) =
        alarm("resp_rate_brpm", false).or_else(|| alarm("joint_hr_spo2_resp", false))
    {
        (
            c,
            "PLAYBOOK_09_MULTIPARAMETER_DETERIORATION",
            "Playbook #09: Cardiorespiratory Pattern Outside Personal Baseline",
            vec![
                action(
                    "ACT_FULL_VITALS_REASSESSMENT",
                    "Repeat full vital signs set manually (HR, SpO2, RESP, blood pressure, temperature)",
                    "CLINICAL_ASSESSMENT",
                ),
                action(
                    "ACT_SENSOR_CROSS_CHECK",
                    "Cross-check sensors against a second device",
                    "DIAGNOSTIC_VERIFICATION",
                ),
                action(
                    "ACT_QUEUE_FLIGHT_SURGEON_REPORT",
                    "Queue store-and-forward report to the flight surgeon",
                    "COMMUNICATION",
                ),
            ],
        )
    } else {
        let c = ["spo2_pct", "heart_rate_bpm", "resp_rate_brpm"]
            .into_iter()
            .find_map(|ch| alarm(ch, true))?;
        (
            c,
            "PLAYBOOK_08_SENSOR_SIGNAL_LOSS",
            "Playbook #08: Vital Sign Sensor Signal Loss",
            vec![
                action(
                    "ACT_RESEAT_SENSOR",
                    "Re-seat or replace the sensor and check the cable / wireless link",
                    "DIAGNOSTIC_VERIFICATION",
                ),
                action(
                    "ACT_MANUAL_SPOT_CHECK",
                    "Take a manual spot measurement until the signal is restored",
                    "CLINICAL_ASSESSMENT",
                ),
            ],
        )
    };
    Some(ActivePlaybook {
        playbook_id: playbook_id.to_string(),
        title: title.to_string(),
        causal_chain_summary: vec![trigger.reason.clone()],
        safety_gates,
        actions,
    })
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
            hrv_unavailable_reason: None,
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
            rho_rmssd: Some(0.75),
            rho_sans,
            rho_global: Some(rho_tau_w.min(rho_sans)),
            ttv_hours: Some(120.0),
            ttv_ci95_low_hours: Some(90.0),
            ttv_ci95_high_hours: Some(150.0),
            mri_pct: Some(72.0),
            ttv_interval_kind: Some(
                ares_core_types::telemetry::TtvIntervalKind::IllustrativeScenarioRange,
            ),
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
        assert!(
            pb.actions
                .iter()
                .any(|a| a.action_id == "ACT_LBNP_MINUS_30_MMHG")
        );
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

    fn anomaly_report(entries: &[(&str, AnomalyStatus, AnomalyDetectorKind)]) -> VitalsAnomalyReport {
        VitalsAnomalyReport {
            recording_time_s: 200.0,
            baseline_ready: true,
            baseline_samples: 120,
            baseline_required: 120,
            overall: entries.iter().map(|e| e.1).max().unwrap_or_default(),
            mahalanobis_d2: None,
            channels: entries
                .iter()
                .map(|(channel, status, detector)| ares_core_types::ChannelAnomalyState {
                    channel: (*channel).to_string(),
                    status: *status,
                    evaluable: true,
                    detector: Some(*detector),
                    value: None,
                    baseline_median: None,
                    baseline_sigma: None,
                    z_score: None,
                    duration_s: 20.0,
                    reason: format!("{channel} reason"),
                })
                .collect(),
        }
    }

    #[test]
    fn test_vitals_alarm_selects_acute_playbook_and_physiology_outranks_dropout() {
        use AnomalyDetectorKind::{CusumDrift, Mahalanobis, RobustZScore, SensorDropout};
        use AnomalyStatus::{Alarm, Attention};
        let gates = SafetyGates {
            anticoagulant_lock_active: true,
            lbnp_auto_vent_armed: true,
            eva_suit_damping_active: false,
        };
        let pick = |entries: &[(&str, AnomalyStatus, AnomalyDetectorKind)]| {
            select_vitals_anomaly_playbook(&anomaly_report(entries), gates).map(|p| p.playbook_id)
        };
        assert_eq!(pick(&[("spo2_pct", Attention, RobustZScore)]), None);
        assert_eq!(
            pick(&[
                ("heart_rate_bpm", Alarm, SensorDropout),
                ("spo2_pct", Alarm, CusumDrift)
            ])
            .as_deref(),
            Some("PLAYBOOK_06_HYPOXEMIA_DESATURATION")
        );
        assert_eq!(
            pick(&[("heart_rate_bpm", Alarm, RobustZScore)]).as_deref(),
            Some("PLAYBOOK_07_HEART_RATE_ANOMALY")
        );
        assert_eq!(
            pick(&[("spo2_pct", Alarm, SensorDropout)]).as_deref(),
            Some("PLAYBOOK_08_SENSOR_SIGNAL_LOSS")
        );
        assert_eq!(
            pick(&[("joint_hr_spo2_resp", Alarm, Mahalanobis)]).as_deref(),
            Some("PLAYBOOK_09_MULTIPARAMETER_DETERIORATION")
        );
        let pb = select_vitals_anomaly_playbook(
            &anomaly_report(&[("spo2_pct", Alarm, RobustZScore)]),
            gates,
        )
        .expect("playbook");
        assert_eq!(pb.causal_chain_summary, vec!["spo2_pct reason".to_string()]);
        assert_eq!(pb.safety_gates, gates);
    }
}
