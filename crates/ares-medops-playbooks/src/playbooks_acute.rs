#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Domain 3 Acute Microgravity Emergency Playbooks (`PLAYBOOK_17`..`PLAYBOOK_25` & `PLAYBOOK_30`).
//!
//! Deterministic `ActivePlaybook` builders and priority selector backed by
//! `ares_causal_graph::acute_emergencies`.

use ares_causal_graph::acute_emergencies::{
    AcuteAbdomenNomEval, AcuteEmergencyTriageInput, AcuteUrinaryRetentionEval, AnaphylaxisEval,
    DentalMaxillofacialEval, EvaMskSpineEval, HemorrhagicTraumaEval, MicrogravityCprEval,
    OcularEmergencyEval, PelvicEmergencyCategory, PelvicUrogynEval, TorsoShockEval,
    evaluate_acute_emergencies_triage,
};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, SafetyGates,
};

#[inline]
fn action(id: &str, label: &str, category: &str, delta_rho_per_hour: f64) -> CountermeasureAction {
    CountermeasureAction {
        action_id: id.to_string(),
        label: label.to_string(),
        category: category.to_string(),
        delta_rho_per_hour,
    }
}

/// Builds `PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA`.
pub fn build_playbook_17_hemorrhagic_trauma(
    eval: &HemorrhagicTraumaEval,
    mut gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    gates.anticoagulant_lock_active = true;
    gates.anticoagulant_contraindicated_bleeding_risk = true;

    let mut actions = vec![action(
        "ACT_TRAUMA_CAT_TOURNIQUET_AND_QUIKCLOT_KAOLIN",
        "Apply CAT tourniquet proximal to arterial bleed and QuikClot kaolin hemostatic dressing",
        "HEMORRHAGE_CONTROL",
        0.35,
    )];

    if eval.txa_eligible {
        causal_chain.push("Hemorrhagic trauma within <= 3.0 h TXA window".to_string());
        actions.push(action(
            "ACT_HEMORRHAGE_TXA_1G_IV_WITHIN_3H",
            "Administer Tranexamic Acid (TXA) 1 g IV over 10 min within 3.0 h of injury",
            "PHARMACOLOGICAL_HEMOSTATIC",
            0.25,
        ));
    } else if let Some(reason) = &eval.txa_blocked_reason {
        causal_chain.push(reason.clone());
    }

    actions.push(action(
        "ACT_BALANCED_RESUSCITATION_WARM_CRYSTALLOID_CALCIUM",
        "Balanced resuscitation with warmed isotonic crystalloid and calcium replacement",
        "RESUSCITATION",
        0.20,
    ));

    ActivePlaybook {
        playbook_id: "PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA".to_string(),
        title: "Playbook #17: Hemorrhagic Trauma & TXA Window Protocol".to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS`.
pub fn build_playbook_18_torso_shock(
    eval: &TorsoShockEval,
    mut gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    gates.anticoagulant_lock_active = true;
    gates.anticoagulant_contraindicated_bleeding_risk = true;

    let mut actions = Vec::new();
    if eval.tamponade_risk {
        causal_chain.push("eFAST pericardial tamponade risk detected".to_string());
        actions.push(action(
            "ACT_POCUS_GUIDED_PERICARDIOCENTESIS_CLOSED_SYRINGE",
            "Perform POCUS-guided closed 3-way stopcock pericardiocentesis with pigtail drain (0g aerosol containment)",
            "INVASIVE_PROCEDURE",
            0.40,
        ));
    }
    if eval.hemoperitoneum_shock {
        causal_chain.push(
            "eFAST hemoperitoneum with shock: permissive hypotension target SBP 80-90 mmHg"
                .to_string(),
        );
        actions.push(action(
            "ACT_HEMOPERITONEUM_TXA_PELVIC_BINDER_PERMISSIVE_HYPOTENSION",
            "Initiate TXA, pelvic binder stabilization, and permissive hypotension (target SBP 80-90 mmHg)",
            "HEMORRHAGE_CONTROL",
            0.30,
        ));
    }

    ActivePlaybook {
        playbook_id: "PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS".to_string(),
        title: "Playbook #18: Torso Shock, Pericardiocentesis & Hemoperitoneum Protocol".to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G`.
pub fn build_playbook_19_acute_abdomen_0g(
    eval: &AcuteAbdomenNomEval,
    gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    if eval.open_laparotomy_forbidden_in_0g {
        causal_chain.push("0g Non-Operative Management (NOM): open laparotomy forbidden".to_string());
    }
    let mut actions = vec![
        action(
            "ACT_ABDOMEN_0G_ANTIBIOTIC_FIRST_ERTAPENEM_OR_PIPTAZO",
            "Initiate antibiotic-first NOM: Ertapenem 1 g IV/IM q24h or Piperacillin-Tazobactam (Gate 5 allergy check)",
            "PHARMACOLOGICAL_ANTIMICROBIAL",
            0.25,
        ),
        action(
            "ACT_BOWEL_REST_NG_SUCTION_IV_HYDRATION",
            "Enforce NPO bowel rest, closed nasogastric decompression suction, and IV hydration",
            "CLINICAL_COUNTERMEASURE",
            0.15,
        ),
    ];
    if eval.percutaneous_drain_indicated {
        actions.push(action(
            "ACT_POCUS_PERCUTANEOUS_ABSCESS_CHOLECYSTOSTOMY_DRAIN",
            "Perform POCUS-guided percutaneous abscess or cholecystostomy drainage",
            "INVASIVE_PROCEDURE",
            0.25,
        ));
    }

    ActivePlaybook {
        playbook_id: "PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G".to_string(),
        title: "Playbook #19: Conservative 0g Acute Abdomen (NOM) Protocol".to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE`.
pub fn build_playbook_20_eva_msk_spine(
    eval: &EvaMskSpineEval,
    mut gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    if eval.eva_no_go {
        gates.gate4_eva_fitness_no_go = true;
        causal_chain.push("EVA musculoskeletal/spine injury: Gate 4 EVA No-Go active".to_string());
    }
    let mut actions = vec![
        action(
            "ACT_EVA_GLOVE_HUT_DECOMPRESSION_SPLINT",
            "Remove EVA glove/HUT pressure source, splint affected extremity, and inspect neurovascular status",
            "MECHANICAL_INTERVENTION",
            0.15,
        ),
        action(
            "ACT_LUMBAR_DISC_NEURO_CAUDA_EQUINA_SCREEN",
            "Perform focused L1-L5 radiculopathy and cauda equina neurological screen",
            "DIAGNOSTIC_VERIFICATION",
            0.05,
        ),
    ];
    if eval.femoral_neck_fracture_high_risk {
        actions.push(action(
            "ACT_FEMORAL_NECK_TRACTION_SPLINT_NON_WEIGHT_BEARING",
            "Apply femoral traction splint and enforce strict non-weight-bearing immobilization",
            "MECHANICAL_INTERVENTION",
            0.20,
        ));
    }
    actions.push(action(
        "ACT_MSK_MULTIMODAL_ANALGESIA_ACETAMINOPHEN_FENTANYL",
        "Administer multimodal analgesia (Acetaminophen / Intranasal Fentanyl; Ketorolac gated by Gate 5)",
        "PHARMACOLOGICAL_ANALGESIA",
        0.10,
    ));

    ActivePlaybook {
        playbook_id: "PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE".to_string(),
        title: "Playbook #20: EVA Musculoskeletal, Lumbar Spine & Femoral Fracture Protocol"
            .to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY`.
pub fn build_playbook_21_dental_maxillofacial(
    eval: &DentalMaxillofacialEval,
    mut gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    let mut actions = vec![
        action(
            "ACT_DENTAL_IRM_ZINC_OXIDE_EUGENOL_TEMP_FILLING",
            "Place IRM zinc oxide-eugenol temporary restoration for barodontalgia or crown/root defect",
            "DENTAL_INTERVENTION",
            0.10,
        ),
        action(
            "ACT_DENTAL_INFERIOR_ALVEOLAR_LIDOCAINE_BLOCK",
            "Administer inferior alveolar nerve block with Lidocaine for acute dental pain control",
            "PHARMACOLOGICAL_ANALGESIA",
            0.10,
        ),
        action(
            "ACT_DENTAL_ABSCESS_AMOX_CLAV_OR_CLINDAMYCIN",
            "Initiate Amoxicillin-Clavulanate or Clindamycin (Gate 5 allergy check) for odontogenic abscess",
            "PHARMACOLOGICAL_ANTIMICROBIAL",
            0.15,
        ),
        action(
            "ACT_DENTAL_EXTRACTION_SUCTION_CONTAINMENT",
            "Prepare closed-suction microgravity dental extraction containment kit if refractory",
            "DENTAL_INTERVENTION",
            0.10,
        ),
    ];

    if eval.ludwigs_angina_airway_emergency {
        gates.gate4_eva_fitness_no_go = true;
        causal_chain.push(
            "Ludwig's angina submandibular airway threat: early i-gel airway & Gate 4 EVA No-Go"
                .to_string(),
        );
        actions.insert(
            0,
            action(
                "ACT_LUDWIGS_ANGINA_EARLY_IGEL_AIRWAY_AND_IV_ANTIBIOTICS",
                "PRIORITY: Secure early i-gel supraglottic airway and broad-spectrum IV antibiotics for Ludwig's angina",
                "AIRWAY_EMERGENCY",
                0.35,
            ),
        );
    }

    ActivePlaybook {
        playbook_id: "PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY".to_string(),
        title: "Playbook #21: Dental & Maxillofacial Emergency (Ludwig's Angina) Protocol"
            .to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN`.
pub fn build_playbook_22_ocular_emergency(
    eval: &OcularEmergencyEval,
    gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    let mut actions = vec![action(
        "ACT_OCULAR_TOPICAL_TETRACAINE_ANESTHETIC",
        "Instill topical Tetracaine ophthalmic anesthetic to facilitate examination",
        "PHARMACOLOGICAL_ANALGESIA",
        0.05,
    )];

    if !eval.zero_pressure_fox_shield_required {
        actions.push(action(
            "ACT_OCULAR_CLOSED_LOOP_0G_MORGAN_LENS_IRRIGATION",
            "Irrigate via closed-loop 0g Morgan Lens (>= 1000-2000 mL) until conjunctival pH 7.0-7.4",
            "OCULAR_DECONTAMINATION",
            0.30,
        ));
    }

    actions.push(action(
        "ACT_FLUORESCEIN_SLIT_LAMP_SEIDEL_PERFORATION_CHECK",
        "Perform fluorescein slit-lamp exam and Seidel test for globe perforation",
        "DIAGNOSTIC_VERIFICATION",
        0.05,
    ));

    if eval.zero_pressure_fox_shield_required {
        causal_chain.push("Seidel perforation positive: rigid Fox eye shield, zero globe pressure".to_string());
        actions.push(action(
            "ACT_OCULAR_RIGID_FOX_SHIELD_ZERO_PRESSURE",
            "Apply rigid Fox eye shield with strictly zero pressure; abort irrigation",
            "OCULAR_PROTECTION",
            0.25,
        ));
    }

    actions.push(action(
        "ACT_ERYTHROMYCIN_OR_MOXIFLOXACIN_OPHTHALMIC",
        "Administer Erythromycin ointment or Moxifloxacin ophthalmic drops",
        "PHARMACOLOGICAL_ANTIMICROBIAL",
        0.10,
    ));

    ActivePlaybook {
        playbook_id: "PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN".to_string(),
        title: "Playbook #22: Ocular Foreign Body, Chemical Burn & Seidel Check Protocol"
            .to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY`.
pub fn build_playbook_23_anaphylaxis(
    _eval: &AnaphylaxisEval,
    gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    causal_chain.push("Anaphylaxis with airway/hemodynamic compromise: IM epinephrine priority 0".to_string());
    let actions = vec![
        action(
            "ACT_ANAPHYLAXIS_EPINEPHRINE_03_05MG_IM_THIGH",
            "IMMEDIATE (Index 0): Administer Epinephrine 0.3-0.5 mg IM anterolateral thigh q5-15 min",
            "EMERGENCY_RESUSCITATION",
            0.45,
        ),
        action(
            "ACT_AIRWAY_100PCT_O2_AND_IGEL_SUPRAGLOTTIC_READY",
            "Deliver 100% O2 and stage i-gel supraglottic airway",
            "AIRWAY_EMERGENCY",
            0.20,
        ),
        action(
            "ACT_SALBUTAMOL_BRONCHODILATOR_MDI_SPACER",
            "Administer Salbutamol MDI via spacer for persistent bronchospasm",
            "PHARMACOLOGICAL_BRONCHODILATOR",
            0.15,
        ),
        action(
            "ACT_ADJUNCT_DIPHENHYDRAMINE_FAMOTIDINE_METHYLPREDNISOLONE",
            "Administer adjunct Diphenhydramine, Famotidine, and Methylprednisolone",
            "PHARMACOLOGICAL_ADJUNCT",
            0.10,
        ),
        action(
            "ACT_ISOTONIC_CRYSTALLOID_BOLUS_20ML_KG",
            "Infuse 20 mL/kg isotonic crystalloid bolus for anaphylactic hypotension",
            "RESUSCITATION",
            0.15,
        ),
    ];

    ActivePlaybook {
        playbook_id: "PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY".to_string(),
        title: "Playbook #23: Anaphylaxis & Airway Emergency Protocol".to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR`.
pub fn build_playbook_24_microgravity_cpr(
    _eval: &MicrogravityCprEval,
    gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    causal_chain.push(
        "Pulseless cardiac arrest in 0g: immediate Evetts-Russomano/Handstand CPR, CMRS & AED hull isolation"
            .to_string(),
    );
    let actions = vec![
        action(
            "ACT_0G_CPR_IMMEDIATE_EVETTS_RUSSOMANO_OR_HANDSTAND",
            "Initiate immediate 0g chest compressions (100-120/min, 50 mm depth) via Evetts-Russomano or Handstand technique",
            "EMERGENCY_RESUSCITATION",
            0.50,
        ),
        action(
            "ACT_DEPLOY_CMRS_RESTRAINT_STRAPS",
            "Deploy Crew Medical Restraint System (CMRS) straps to stabilize patient and rescuer",
            "MECHANICAL_INTERVENTION",
            0.20,
        ),
        action(
            "ACT_AED_ELECTRICAL_ISOLATION_FROM_HULL_BEFORE_SHOCK",
            "Verify AED electrical isolation from spacecraft hull before shock delivery",
            "ELECTRICAL_SAFETY_CRITICAL",
            0.30,
        ),
        action(
            "ACT_IGEL_AIRWAY_ETCO2_CAPNOGRAPHY",
            "Insert i-gel supraglottic airway and monitor quantitative EtCO2 capnography",
            "AIRWAY_EMERGENCY",
            0.15,
        ),
        action(
            "ACT_ACLS_EPINEPHRINE_1MG_IV_IO_AMIODARONE_300MG",
            "Administer ACLS Epinephrine 1 mg IV/IO q3-5min and Amiodarone 300 mg for refractory VF/pVT",
            "PHARMACOLOGICAL_ACLS",
            0.25,
        ),
    ];

    ActivePlaybook {
        playbook_id: "PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR".to_string(),
        title: "Playbook #24: Microgravity Cardiac Arrest & 0g CPR Protocol".to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS`.
pub fn build_playbook_25_aur(
    eval: &AcuteUrinaryRetentionEval,
    gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    causal_chain.push("POCUS bladder volume >= 500.0 mL: acute urinary retention".to_string());
    let mut actions = vec![
        action(
            "ACT_AUR_STERILE_CLOSED_FOLEY_CATHETERIZATION",
            "Perform sterile closed-system Foley catheterization with gradual decompression in 0g",
            "UROLOGICAL_INTERVENTION",
            0.30,
        ),
        action(
            "ACT_AUR_TAMSULOSIN_04MG_STOP_ANTICHOLINERGICS",
            "Initiate Tamsulosin 0.4 mg PO daily and discontinue anticholinergic medications",
            "PHARMACOLOGICAL_UROLOGY",
            0.15,
        ),
    ];

    if eval.suprapubic_cystostomy_indicated {
        if eval.suprapubic_locked_by_gate6_thrombocytopenia {
            causal_chain.push(
                "Gate 6 thrombocytopenia lock: suprapubic cystostomy deferred (PLT < 75 K/uL)"
                    .to_string(),
            );
        } else {
            actions.push(action(
                "ACT_POCUS_GUIDED_SUPRAPUBIC_CYSTOSTOMY",
                "Perform POCUS-guided suprapubic cystostomy for failed urethral catheterization",
                "INVASIVE_PROCEDURE",
                0.25,
            ));
        }
    }

    ActivePlaybook {
        playbook_id: "PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS".to_string(),
        title: "Playbook #25: Acute Urinary Retention (AUR) POCUS Protocol".to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Builds `PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS`.
pub fn build_playbook_30_pelvic_urogyn(
    eval: &PelvicUrogynEval,
    gates: SafetyGates,
    mut causal_chain: Vec<String>,
) -> ActivePlaybook {
    let mut actions = Vec::new();
    match eval.category {
        PelvicEmergencyCategory::EctopicOrHemorrhagicShock => {
            causal_chain.push("Pelvic POCUS ectopic pregnancy or hemorrhagic cyst shock".to_string());
            actions.push(action(
                "ACT_ECTOPIC_HEMORRHAGE_TXA_IV_RESUSCITATION_TELE_SURGICAL_CONSULT",
                "Administer TXA, isotonic IV resuscitation, and urgent tele-surgical consultation",
                "EMERGENCY_RESUSCITATION",
                0.35,
            ));
        }
        PelvicEmergencyCategory::OvarianTorsion => {
            causal_chain.push("Pelvic POCUS ovarian torsion suspected".to_string());
            actions.push(action(
                "ACT_OVARIAN_TORSION_ANALGESIA_ULTRASOUND_DETORSION_PROTOCOL",
                "Provide analgesia and initiate ultrasound-guided detorsion / tele-gynecologic protocol",
                "GYNECOLOGIC_EMERGENCY",
                0.25,
            ));
        }
        PelvicEmergencyCategory::ComplicatedFemaleUti => {
            causal_chain.push("Female febrile UTI / pyelonephritis".to_string());
            actions.push(action(
                "ACT_FEMALE_UTI_CEFTRIAXONE_OR_CIPROFLOXACIN_HYDRATION",
                "Initiate Ceftriaxone or Ciprofloxacin (Gate 5 check) with aggressive hydration",
                "PHARMACOLOGICAL_ANTIMICROBIAL",
                0.20,
            ));
        }
        PelvicEmergencyCategory::None => {}
    }

    ActivePlaybook {
        playbook_id: "PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS".to_string(),
        title: "Playbook #30: Female Pelvic & Urogyn POCUS Triage Protocol".to_string(),
        causal_chain_summary: causal_chain,
        safety_gates: gates,
        actions,
    }
}

/// Selects and builds the highest-priority acute Domain 3 `ActivePlaybook` if any criterion triggers.
pub fn select_acute_playbook(
    biometrics: &Biometrics,
    input: &AcuteEmergencyTriageInput,
    safety_gates: SafetyGates,
    causal_chain: Vec<String>,
) -> Option<ActivePlaybook> {
    let summary = evaluate_acute_emergencies_triage(biometrics, input);
    match summary.active_acute_playbook_code? {
        24 => Some(build_playbook_24_microgravity_cpr(
            &summary.cpr,
            safety_gates,
            causal_chain,
        )),
        23 => Some(build_playbook_23_anaphylaxis(
            &summary.anaphylaxis,
            safety_gates,
            causal_chain,
        )),
        17 => Some(build_playbook_17_hemorrhagic_trauma(
            &summary.hemorrhage,
            safety_gates,
            causal_chain,
        )),
        18 => Some(build_playbook_18_torso_shock(
            &summary.torso_shock,
            safety_gates,
            causal_chain,
        )),
        22 => Some(build_playbook_22_ocular_emergency(
            &summary.ocular,
            safety_gates,
            causal_chain,
        )),
        21 => Some(build_playbook_21_dental_maxillofacial(
            &summary.dental,
            safety_gates,
            causal_chain,
        )),
        30 => Some(build_playbook_30_pelvic_urogyn(
            &summary.pelvic,
            safety_gates,
            causal_chain,
        )),
        19 => Some(build_playbook_19_acute_abdomen_0g(
            &summary.acute_abdomen,
            safety_gates,
            causal_chain,
        )),
        25 => Some(build_playbook_25_aur(
            &summary.aur,
            safety_gates,
            causal_chain,
        )),
        20 => Some(build_playbook_20_eva_msk_spine(
            &summary.eva_msk,
            safety_gates,
            causal_chain,
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_causal_graph::acute_emergencies::{
        AcuteAbdomenNomInput, AcuteUrinaryRetentionInput, AnaphylaxisInput,
        DentalMaxillofacialInput, EvaMskSpineInput, HemorrhagicTraumaInput,
        MicrogravityCprInput, OcularEmergencyInput, PelvicUrogynInput, TorsoShockInput,
    };
    use ares_core_types::medical_360::PocusPelvicScan;

    fn nominal_biometrics() -> Biometrics {
        Biometrics {
            heart_rate_bpm: Some(74.0),
            sbp_mmhg: Some(118.0),
            spo2_pct: Some(98.0),
            ..Biometrics::default()
        }
    }

    fn has_action(pb: &ActivePlaybook, action_id: &str) -> bool {
        pb.actions.iter().any(|a| a.action_id == action_id)
    }

    #[test]
    fn selects_playbook_17_with_and_without_txa_window() {
        let mut bio = nominal_biometrics();
        bio.sbp_mmhg = Some(82.0);
        let mut input = AcuteEmergencyTriageInput {
            hemorrhage: HemorrhagicTraumaInput {
                external_trauma_or_laceration: true,
                active_arterial_bleed: true,
                injury_hours_elapsed: Some(1.5),
                active_intravascular_thrombosis: false,
            },
            ..AcuteEmergencyTriageInput::default()
        };

        let pb_ok = select_acute_playbook(&bio, &input, SafetyGates::default(), vec![]);
        assert!(pb_ok.as_ref().is_some_and(|p| p.playbook_id == "PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA"));
        assert!(pb_ok.as_ref().is_some_and(|p| has_action(p, "ACT_HEMORRHAGE_TXA_1G_IV_WITHIN_3H")));

        input.hemorrhage.injury_hours_elapsed = Some(4.0);
        let pb_late = select_acute_playbook(&bio, &input, SafetyGates::default(), vec![]);
        assert!(pb_late.as_ref().is_some_and(|p| !has_action(p, "ACT_HEMORRHAGE_TXA_1G_IV_WITHIN_3H")));
    }

    #[test]
    fn selects_playbook_18_19_20_21_22() {
        let mut bio = nominal_biometrics();
        bio.heart_rate_bpm = Some(112.0);
        bio.sbp_mmhg = Some(100.0);

        let pb18 = select_acute_playbook(
            &bio,
            &AcuteEmergencyTriageInput {
                torso_shock: TorsoShockInput {
                    pericardial_effusion_mm: 14.0,
                    efast_abdominal_free_fluid: true,
                    ..TorsoShockInput::default()
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb18.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS"
                && has_action(p, "ACT_POCUS_GUIDED_PERICARDIOCENTESIS_CLOSED_SYRINGE")
                && has_action(p, "ACT_HEMOPERITONEUM_TXA_PELVIC_BINDER_PERMISSIVE_HYPOTENSION")
        }));

        let pb19 = select_acute_playbook(
            &nominal_biometrics(),
            &AcuteEmergencyTriageInput {
                acute_abdomen: AcuteAbdomenNomInput {
                    rlq_or_ruq_syndrome: true,
                    appendiceal_diameter_mm: Some(7.5),
                    appendiceal_non_compressible: true,
                    pocus_abscess_or_distended_gallbladder: true,
                    ..AcuteAbdomenNomInput::default()
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb19.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G"
                && has_action(p, "ACT_ABDOMEN_0G_ANTIBIOTIC_FIRST_ERTAPENEM_OR_PIPTAZO")
                && has_action(p, "ACT_POCUS_PERCUTANEOUS_ABSCESS_CHOLECYSTOSTOMY_DRAIN")
        }));

        let pb20 = select_acute_playbook(
            &nominal_biometrics(),
            &AcuteEmergencyTriageInput {
                eva_msk: EvaMskSpineInput {
                    partial_g_fall: true,
                    bmd_loss_pct: 6.2,
                    hip_or_femoral_neck_pain: true,
                    ..EvaMskSpineInput::default()
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb20.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE"
                && p.safety_gates.gate4_eva_fitness_no_go
                && has_action(p, "ACT_FEMORAL_NECK_TRACTION_SPLINT_NON_WEIGHT_BEARING")
        }));

        let pb21 = select_acute_playbook(
            &nominal_biometrics(),
            &AcuteEmergencyTriageInput {
                dental: DentalMaxillofacialInput {
                    submandibular_airway_threat: true,
                    ..DentalMaxillofacialInput::default()
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb21.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY"
                && p.safety_gates.gate4_eva_fitness_no_go
                && has_action(p, "ACT_LUDWIGS_ANGINA_EARLY_IGEL_AIRWAY_AND_IV_ANTIBIOTICS")
        }));

        let pb22 = select_acute_playbook(
            &nominal_biometrics(),
            &AcuteEmergencyTriageInput {
                ocular: OcularEmergencyInput {
                    chemical_splash_nh3_lioh_propellant: true,
                    seidel_perforation_positive: false,
                    ..OcularEmergencyInput::default()
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb22.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN"
                && has_action(p, "ACT_OCULAR_CLOSED_LOOP_0G_MORGAN_LENS_IRRIGATION")
        }));
    }

    #[test]
    fn selects_playbook_23_24_25_30_with_exact_actions() {
        let mut anaph_bio = nominal_biometrics();
        anaph_bio.spo2_pct = Some(87.0);
        let pb23 = select_acute_playbook(
            &anaph_bio,
            &AcuteEmergencyTriageInput {
                anaphylaxis: AnaphylaxisInput {
                    post_allergen_exposure: true,
                    acute_urticaria_or_angioedema: true,
                    bronchospasm_or_stridor: true,
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb23.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY"
                && p.actions.first().is_some_and(|a| {
                    a.action_id == "ACT_ANAPHYLAXIS_EPINEPHRINE_03_05MG_IM_THIGH"
                })
        }));

        let pb24 = select_acute_playbook(
            &nominal_biometrics(),
            &AcuteEmergencyTriageInput {
                cpr: MicrogravityCprInput {
                    pulseless_cardiac_arrest: true,
                    ..MicrogravityCprInput::default()
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb24.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR"
                && has_action(p, "ACT_0G_CPR_IMMEDIATE_EVETTS_RUSSOMANO_OR_HANDSTAND")
                && has_action(p, "ACT_AED_ELECTRICAL_ISOLATION_FROM_HULL_BEFORE_SHOCK")
        }));

        let pb25 = select_acute_playbook(
            &nominal_biometrics(),
            &AcuteEmergencyTriageInput {
                aur: AcuteUrinaryRetentionInput {
                    bladder_volume_ml: Some(550.0),
                    catheterization_failed_or_stricture: true,
                    platelet_count_k_ul: Some(150.0),
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb25.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS"
                && has_action(p, "ACT_AUR_STERILE_CLOSED_FOLEY_CATHETERIZATION")
                && has_action(p, "ACT_POCUS_GUIDED_SUPRAPUBIC_CYSTOSTOMY")
        }));

        let pb30 = select_acute_playbook(
            &nominal_biometrics(),
            &AcuteEmergencyTriageInput {
                pelvic: PelvicUrogynInput {
                    pelvic_pocus: PocusPelvicScan {
                        performed: true,
                        adnexal_whirlpool_sign: true,
                        ..PocusPelvicScan::default()
                    },
                    febrile_or_flank_pain: false,
                },
                ..AcuteEmergencyTriageInput::default()
            },
            SafetyGates::default(),
            vec![],
        );
        assert!(pb30.as_ref().is_some_and(|p| {
            p.playbook_id == "PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS"
                && has_action(p, "ACT_OVARIAN_TORSION_ANALGESIA_ULTRASOUND_DETORSION_PROTOCOL")
        }));
    }
}
