//! Fase 10 (E1) & Fase 41 (N4): Esecutore deterministico Type-1 Crystallized dei 15 Playbook MedOps (#01-#15).

use crate::pocus_multiorgan::{PocusEfastScan, PocusRenalBladderScan};
use ares_core_types::constants::{ECLSS_PPCO2_ACTION_LIMIT_MMHG, MAX_SAFE_CABIN_PPCO2_MMHG};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularHemodynamics, Musculoskeletal,
    NqsStlMargins, SafetyGates,
};
use ares_core_types::{AnomalyDetectorKind, AnomalyStatus, VitalsAnomalyReport};

/// Seleziona deterministicamente il Playbook candidato secondo la gerarchia clinica rigorosa (Carbon Condition 9):
/// 1. Trauma / Shock / Pneumotorace (#15)
/// 2. Allarmi Fisiologici Acuti Vitals (#06, #07, #09)
/// 3. Urgenze d'Organo (#02 Trombo IJV, #10 Litiasi Renale, #14 Ipercapnia ECLSS)
/// 4. Rischi Subacuti / Cronici (#05 Radiazioni, #01 Stasi IJV, #04 SANS, #11 Fluid Loading Marte, #12 Circadiano Sol, #13 Immunologia, #08 Perdita Sensore, #03 ARED Base)
#[inline]
#[allow(clippy::too_many_arguments)]
pub fn select_candidate_playbook_ext(
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    nqs: &NqsStlMargins,
    mut causal_chain_summary: Vec<String>,
    efast: Option<&PocusEfastScan>,
    renal_pocus: Option<&PocusRenalBladderScan>,
    vitals_report: Option<&VitalsAnomalyReport>,
    _flight_sol: u32,
    fatigue_score: Option<f64>,
    immune_risk_pct: Option<f64>,
) -> ActivePlaybook {
    let default_gates = SafetyGates {
        anticoagulant_lock_active: !jugular.pocus_thrombus_confirmed,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active: musculo.gai_pct > 12.0,
        gate4_invasive_decompression_locked: true,
        gate4_eva_fitness_no_go: false,
        ..SafetyGates::default()
    };

    // LIVELLO 1: Trauma, Barotrauma da Decompressione o Shock Severo (Playbook #15)
    let shock_index = biometrics.sbp_mmhg.and_then(|sbp| {
        if sbp > 0.0 {
            Some(biometrics.heart_rate_bpm.unwrap_or(72.0) / sbp)
        } else {
            None
        }
    });
    let trauma_finding = efast.is_some_and(|e| e.has_any_trauma_finding());
    let shock_severe = shock_index.is_some_and(|si| si >= 1.20);
    if trauma_finding || shock_severe {
        if let Some(e) = efast {
            if e.is_pneumothorax_verified() {
                causal_chain_summary.push("eFAST confirmed pneumothorax: absent lung sliding and M-mode barcode".to_string());
            } else if e.has_abdominal_free_fluid() {
                causal_chain_summary.push("eFAST confirmed abdominal free fluid in peritoneal windows".to_string());
            } else if e.has_pericardial_tamponade_risk() {
                causal_chain_summary.push("eFAST confirmed pericardial effusion with tamponade risk".to_string());
            }
        }
        if shock_severe {
            causal_chain_summary.push("Severe cardiovascular shock: Shock Index >= 1.20".to_string());
        }
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE".to_string(),
            title: "Playbook #15: eFAST Thoraco-Abdominal Trauma Triage & Needle Thoracostomy Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_RAPID_5_WINDOW_EFAST_SCAN".to_string(),
                    label: "Execute systematic eFAST ultrasound protocol (RUQ, LUQ, pelvic, subxiphoid, bilateral thoracic)".to_string(),
                    category: "DIAGNOSTIC_VERIFICATION".to_string(),
                    delta_rho_per_hour: 0.0,
                },
                CountermeasureAction {
                    action_id: "ACT_PLEURAL_M_MODE_BARCODE_VERIFY".to_string(),
                    label: "Obtain thoracic M-mode clips over 2nd intercostal mid-clavicular line to assess seashore vs barcode sign".to_string(),
                    category: "DIAGNOSTIC_VERIFICATION".to_string(),
                    delta_rho_per_hour: 0.0,
                },
                CountermeasureAction {
                    action_id: "ACT_NEEDLE_DECOMPRESSION_2ND_ICL".to_string(),
                    label: "Perform emergency needle decompression 2nd intercostal mid-clavicular line (requires Gate 4 confirmation)".to_string(),
                    category: "INVASIVE_PROCEDURE".to_string(),
                    delta_rho_per_hour: 0.35,
                },
                CountermeasureAction {
                    action_id: "ACT_INTRAVENOUS_ACCESS_AND_AUTOTRANSFUSION".to_string(),
                    label: "Establish bilateral large-bore peripheral access and prepare closed autotransfusion set".to_string(),
                    category: "CLINICAL_COUNTERMEASURE".to_string(),
                    delta_rho_per_hour: 0.20,
                },
            ],
        };
    }

    // LIVELLO 2: Allarmi Fisiologici Acuti Vitals (#06 Desaturazione, #07 Frequenza Cardiaca, #09 Multiparametrico)
    if let Some(acute_pb) = vitals_report
        .and_then(|report| select_vitals_anomaly_playbook(report, default_gates))
        .filter(|pb| pb.playbook_id != "PLAYBOOK_08_SENSOR_SIGNAL_LOSS")
    {
        return acute_pb;
    }

    // LIVELLO 3: Urgenze d'Organo (#02 Trombo IJV, #10 Litiasi Renale, #14 Ipercapnia ECLSS)
    // 3A: Trombo giugulare confermato al POCUS B-Mode (#02)
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
                    category: "PHARMACOLOGICAL_ANTICOAGULANT".to_string(),
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

    // 3B: Rischio Litiasi Renale / Ritenzione Vescicale (#10)
    let renal_critical = nqs.rho_renal.is_some_and(|r| r < 0.20)
        || renal_pocus.is_some_and(|r| r.is_colic_risk() || r.is_urinary_retention());
    if renal_critical {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_10_RENAL_LITHIASIS".to_string(),
            title: "Playbook #10: Renal Lithiasis Hydration, Citrate Buffering & Bladder Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_POCUS_RENAL_BLADDER_SCAN".to_string(),
                    label: "Execute guided renal and bladder ultrasound (assess hydronephrosis and bladder volume)".to_string(),
                    category: "DIAGNOSTIC_VERIFICATION".to_string(),
                    delta_rho_per_hour: 0.12,
                },
                CountermeasureAction {
                    action_id: "ACT_ORAL_HYDRATION_BOLUS_1000ML".to_string(),
                    label: "Administer 1.0 L balanced oral electrolyte solution over 60 minutes".to_string(),
                    category: "METABOLIC_COUNTERMEASURE".to_string(),
                    delta_rho_per_hour: 0.25,
                },
                CountermeasureAction {
                    action_id: "ACT_PHARMACOLOGICAL_POTASSIUM_CITRATE_30MEQ".to_string(),
                    label: "Initiate Potassium Citrate 30 mEq PO daily to alkalinize urine and chelate calcium".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.18,
                },
                CountermeasureAction {
                    action_id: "ACT_ANALGESIA_KETOROLAC_AND_TAMSULOSIN".to_string(),
                    label: "Administer Ketorolac 10 mg IM/IV + Tamsulosin 0.4 mg PO for ureteral smooth muscle relaxation".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.15,
                },
            ],
        };
    }

    // 3C: Ipercapnia Ambientale Cabin/Helmet ppCO2 (#14)
    let effective_ppco2 = biometrics
        .cabin_ppco2_mmhg
        .into_iter()
        .chain(biometrics.helmet_ppco2_mmhg)
        .fold(None::<f64>, |acc, v| Some(acc.map_or(v, |a| a.max(v))));
    // Tier 2 (> 4.0 mmHg) triggers immediate scrubber override regardless of SANS;
    // Tier 1 (> 3.0 mmHg) triggers when SANS is elevated (sans_risk_index > 0.35 <=> rho_sans < 0.64).
    let sans_elevated = nqs.rho_sans < 0.64;
    if effective_ppco2.is_some_and(|co2| co2 > ECLSS_PPCO2_ACTION_LIMIT_MMHG)
        || (effective_ppco2.is_some_and(|co2| co2 > MAX_SAFE_CABIN_PPCO2_MMHG) && sans_elevated)
    {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_14_CO2_SCRUBBER_SANS".to_string(),
            title: "Playbook #14: Cabin ppCO2 Hypercapnia Scrubbing & Ocular Vasodilation Mitigation".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_INSPECT_CDRA_DESICCANT_BEDS".to_string(),
                    label: "Verify Carbon Dioxide Removal Assembly cycle timing and inspect backup LiOH canisters".to_string(),
                    category: "ENVIRONMENTAL_CHECK".to_string(),
                    delta_rho_per_hour: 0.30,
                },
                CountermeasureAction {
                    action_id: "ACT_DEPLOY_PORTABLE_CABIN_FANS".to_string(),
                    label: "Install supplementary duct fans in crew sleeping quarters to eliminate microgravity CO2 pockets".to_string(),
                    category: "ENVIRONMENTAL_CHECK".to_string(),
                    delta_rho_per_hour: 0.15,
                },
                CountermeasureAction {
                    action_id: "ACT_SERIAL_SANS_OCULAR_MONITORING".to_string(),
                    label: "Acquire repeat optic nerve sheath ultrasound (ONSD) and tonometry intraocular pressure".to_string(),
                    category: "DIAGNOSTIC_VERIFICATION".to_string(),
                    delta_rho_per_hour: 0.10,
                },
            ],
        };
    }

    // LIVELLO 4: Rischi Subacuti / Cronici
    // 4A: Allerta Radiazioni Solari SPE CSA CANS (#05)
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

    // 4B: Stasi Venosa Giugulare / Shear Stress Critico (#01)
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

    // 4C: Rischio Neuro-Oculare SANS (#04)
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

    // 4D: Rischio Emodinamico Collasso Ortostatico Marte 0.38g (#11)
    if nqs.rho_orthostatic.is_some_and(|o| o < 0.25) {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING".to_string(),
            title: "Playbook #11: Mars Entry 0.38g Pre-Landing Fluid Loading & Orthostatic Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_ISOTONIC_SALT_WATER_LOADING_15ML_KG".to_string(),
                    label: "Ingest 15 mL/kg body mass of isotonic electrolyte solution within 2 hours of entry burn".to_string(),
                    category: "METABOLIC_COUNTERMEASURE".to_string(),
                    delta_rho_per_hour: 0.28,
                },
                CountermeasureAction {
                    action_id: "ACT_DON_ANTI_G_COMPRESSION_GARMENT".to_string(),
                    label: "Don inflatable abdominal-thigh compression garment set to 35-45 mmHg gradient".to_string(),
                    category: "PHYSICAL_HEMODYNAMIC".to_string(),
                    delta_rho_per_hour: 0.22,
                },
                CountermeasureAction {
                    action_id: "ACT_SEATED_BAROREFLEX_CHALLENGE".to_string(),
                    label: "Perform active 3-minute seated orthostatic baroreflex test with continuous BP monitoring".to_string(),
                    category: "CLINICAL_ASSESSMENT".to_string(),
                    delta_rho_per_hour: 0.10,
                },
            ],
        };
    }

    // 4E: Desincronizzazione Circadiana Sol Marte & Fatica Cognitiva (#12)
    let circadian_risk = nqs.rho_circadian.is_some_and(|c| c < 0.25)
        || fatigue_score.is_some_and(|f| f > 0.55);
    if circadian_risk {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE".to_string(),
            title: "Playbook #12: Mars Sol Circadian Phototherapy, Blue Enrichment & Sleep Hygiene".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_MELANOPIC_LIGHT_480NM_450LUX".to_string(),
                    label: "Deliver 45 minutes of 480 nm blue-enriched light (> 450 EDI lux) immediately upon waking".to_string(),
                    category: "ENVIRONMENTAL_CHECK".to_string(),
                    delta_rho_per_hour: 0.20,
                },
                CountermeasureAction {
                    action_id: "ACT_BLUE_DEPLETION_EVENING_FILTER".to_string(),
                    label: "Enforce optical blue-blocking eyewear (< 10 lux melanopic) starting 2 hours prior to scheduled sleep".to_string(),
                    category: "ENVIRONMENTAL_CHECK".to_string(),
                    delta_rho_per_hour: 0.15,
                },
                CountermeasureAction {
                    action_id: "ACT_ECLSS_BERTH_ACOUSTIC_MITIGATION".to_string(),
                    label: "Deploy active noise cancellation and verify sleeping berth acoustic levels < 48 dBA".to_string(),
                    category: "ENVIRONMENTAL_CHECK".to_string(),
                    delta_rho_per_hour: 0.10,
                },
            ],
        };
    }

    // 4F: Disregolazione Immunitaria & Riattivazione Virale (#13)
    let immune_risk = nqs.rho_immune.is_some_and(|i| i < 0.25)
        || immune_risk_pct.is_some_and(|im| im >= 60.0);
    if immune_risk {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR".to_string(),
            title: "Playbook #13: Spaceflight Immune Dysregulation & Latent Herpesvirus Reactivation Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_CLINICAL_DERMATOMIC_INSPECTION".to_string(),
                    label: "Perform targeted examination of cranial nerves (V1 ophthalmic branch) and thoracic dermatomes".to_string(),
                    category: "CLINICAL_ASSESSMENT".to_string(),
                    delta_rho_per_hour: 0.10,
                },
                CountermeasureAction {
                    action_id: "ACT_VALACYCLOVIR_ANTIVIRAL_THERAPY".to_string(),
                    label: "Initiate Oral Valacyclovir 1000 mg TID for 7 days (cleared by Gate 1 non-anticoagulant filter)".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.25,
                },
                CountermeasureAction {
                    action_id: "ACT_HABITAT_AIR_SURFACE_SANITIZATION".to_string(),
                    label: "Boost photocatalytic oxidation and HEPA filtration cycle in crew living quarters".to_string(),
                    category: "ENVIRONMENTAL_CHECK".to_string(),
                    delta_rho_per_hour: 0.12,
                },
            ],
        };
    }

    // 4G: Segnale Sensore Perso (Playbook #08)
    if let Some(dropout_pb) =
        vitals_report.and_then(|report| select_vitals_anomaly_playbook(report, default_gates))
    {
        return dropout_pb;
    }

    // 4H / Default: Ottimizzazione Meccanotrasduzione ARED & Osso (#03)
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

/// Seleziona deterministicamente il Playbook candidato (firma standard di retrocompatibilita).
#[inline]
pub fn select_candidate_playbook(
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    nqs: &NqsStlMargins,
    causal_chain_summary: Vec<String>,
) -> ActivePlaybook {
    select_candidate_playbook_ext(
        biometrics, musculo, jugular, nqs, causal_chain_summary, None, None, None, 0, None, None,
    )
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
            rho_renal: Some(0.44),
            rho_orthostatic: Some(0.65),
            rho_circadian: Some(0.81),
            rho_immune: Some(0.70),
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
            gate4_invasive_decompression_locked: true,
            gate4_eva_fitness_no_go: false,
            ..SafetyGates::default()
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

    #[test]
    fn test_playbook_10_to_15_and_strict_hierarchy() {
        let bio_nom = sample_biometrics(0.4);
        let musc = sample_musculo();
        let jug = sample_jugular(2.40, false);
        let nqs_nom = sample_nqs(0.75, 0.75);

        // Test Playbook #10 on low renal margin (< 0.20)
        let mut nqs_renal = nqs_nom;
        nqs_renal.rho_renal = Some(0.12);
        let pb10 = select_candidate_playbook_ext(
            &bio_nom, &musc, &jug, &nqs_renal, vec![], None, None, None, 0, None, None,
        );
        assert_eq!(pb10.playbook_id, "PLAYBOOK_10_RENAL_LITHIASIS");

        // Test Playbook #14 Tier 1 (> 3.0 mmHg + elevated SANS) and Tier 2 (> 4.0 mmHg override)
        let bio_co2_tier1 = Biometrics {
            cabin_ppco2_mmhg: Some(2.2),
            helmet_ppco2_mmhg: Some(3.8),
            ..bio_nom.clone()
        };
        let nqs_sans_elevated = sample_nqs(0.75, 0.55);
        let pb14_tier1 = select_candidate_playbook_ext(
            &bio_co2_tier1, &musc, &jug, &nqs_sans_elevated, vec![], None, None, None, 0, None, None,
        );
        assert_eq!(pb14_tier1.playbook_id, "PLAYBOOK_14_CO2_SCRUBBER_SANS");

        let bio_co2 = Biometrics {
            cabin_ppco2_mmhg: Some(2.2),
            helmet_ppco2_mmhg: Some(4.2),
            ..bio_nom.clone()
        };
        let pb14 = select_candidate_playbook_ext(
            &bio_co2, &musc, &jug, &nqs_nom, vec![], None, None, None, 0, None, None,
        );
        assert_eq!(pb14.playbook_id, "PLAYBOOK_14_CO2_SCRUBBER_SANS");

        // Test Playbook #11 on low orthostatic margin (< 0.25)
        let mut nqs_ortho = nqs_nom;
        nqs_ortho.rho_orthostatic = Some(0.18);
        let pb11 = select_candidate_playbook_ext(
            &bio_nom, &musc, &jug, &nqs_ortho, vec![], None, None, None, 0, None, None,
        );
        assert_eq!(pb11.playbook_id, "PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING");

        // Test Playbook #12 on low circadian margin (< 0.25) or fatigue (> 0.55)
        let mut nqs_circ = nqs_nom;
        nqs_circ.rho_circadian = Some(0.15);
        let pb12 = select_candidate_playbook_ext(
            &bio_nom, &musc, &jug, &nqs_circ, vec![], None, None, None, 0, None, None,
        );
        assert_eq!(pb12.playbook_id, "PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE");

        // Test Playbook #13 on low immune margin (< 0.25) or immune risk >= 60%
        let mut nqs_immune = nqs_nom;
        nqs_immune.rho_immune = Some(0.14);
        let pb13 = select_candidate_playbook_ext(
            &bio_nom, &musc, &jug, &nqs_immune, vec![], None, None, None, 0, None, None,
        );
        assert_eq!(pb13.playbook_id, "PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR");

        // Test Playbook #15 outranks everything (Trauma finding in eFAST)
        let efast_trauma = PocusEfastScan {
            lung_sliding_absent: true,
            m_mode_barcode_sign_confirmed: true,
            ..Default::default()
        };
        let pb15 = select_candidate_playbook_ext(
            &bio_co2, &musc, &jug, &nqs_renal, vec![], Some(&efast_trauma), None, None, 0, None, None,
        );
        assert_eq!(pb15.playbook_id, "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE");
    }
}
