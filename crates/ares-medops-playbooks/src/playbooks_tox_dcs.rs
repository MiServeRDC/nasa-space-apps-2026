#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Deterministic MedOps Playbooks #27 (Aerospace Toxicology Exposure) and
//! #28 (EVA Decompression Sickness & Suit Emergencies).

use ares_causal_graph::toxicology_dcs::{
    DcsClassification, LcvgThermalEmergency, Nh3Severity, ToxicologyDcsAssessment,
};
use ares_core_types::telemetry::{ActivePlaybook, CountermeasureAction, SafetyGates};

/// Numeric identifier for Playbook #27: Aerospace Toxicology Exposure.
pub const PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE: u16 = 27;
/// Numeric identifier for Playbook #28: EVA DCS and Suit Emergency.
pub const PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY: u16 = 28;

/// Builds Playbook #27 (`PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE`, `u16 = 27`)
/// when any spacecraft toxicology, combustion pyrolysis, lunar dust, or Martian perchlorate
/// trigger is active.
pub fn build_playbook_27_aerospace_toxicology(
    assessment: &ToxicologyDcsAssessment,
    base_gates: SafetyGates,
) -> Option<ActivePlaybook> {
    let mut actions = Vec::new();
    let mut causal_chain_summary = assessment.causal_chain.clone();

    // 1. Anhydrous Ammonia (NH3): 1h SMAC = 25 ppm, IDLH = 300 ppm.
    if assessment.nh3_severity != Nh3Severity::Nominal {
        actions.push(CountermeasureAction {
            action_id: "ACT_TOX_DON_PBA_QDM_ISOLATE_THERMAL_LOOP".to_string(),
            label: "Don PBA/QDM immediately and isolate leaking NH3 thermal control loop"
                .to_string(),
            category: "ENVIRONMENTAL_ISOLATION".to_string(),
            delta_rho_per_hour: 0.30,
        });
        actions.push(CountermeasureAction {
            action_id: "ACT_TOX_OCULAR_DERMAL_DECONTAMINATION".to_string(),
            label: "Perform closed-loop ocular/dermal saline decontamination for NH3 exposure"
                .to_string(),
            category: "DECONTAMINATION".to_string(),
            delta_rho_per_hour: 0.22,
        });
        actions.push(CountermeasureAction {
            action_id: "ACT_TOX_HUMIDIFIED_O2_BRONCHODILATOR_LARYNGOSPASM_WATCH".to_string(),
            label: "Administer humidified O2, inhaled bronchodilator, and monitor for laryngospasm"
                .to_string(),
            category: "AIRWAY_RESPIRATORY_SUPPORT".to_string(),
            delta_rho_per_hour: 0.25,
        });
    }

    // 2. Hydrazine / MMH (> 0.01 ppm) -> Pyridoxine (Vitamin B6) 25 mg/kg IV (up to 5 g).
    if assessment.mmh_pyridoxine_indicated {
        actions.push(CountermeasureAction {
            action_id: "ACT_TOX_PYRIDOXINE_VITAMIN_B6_25MG_KG_IV".to_string(),
            label: format!(
                "Administer Pyridoxine (Vitamin B6) {:.0} mg IV (25 mg/kg, max 5 g) to restore GAD PLP",
                assessment.pyridoxine_dose_mg
            ),
            category: "TOXICOLOGY_ANTIDOTE".to_string(),
            delta_rho_per_hour: 0.35,
        });
    }

    // 3. Nitrogen Tetroxide (N2O4 / NO2 > 1.0 ppm) -> 72h pulmonary edema surveillance + MetHb check.
    if assessment.n2o4_pulmonary_surveillance_72h {
        actions.push(CountermeasureAction {
            action_id: "ACT_TOX_N2O4_72H_DELAYED_PULMONARY_EDEMA_SURVEILLANCE".to_string(),
            label: "Mandate 72-hour serial lung POCUS B-line surveillance for delayed N2O4 pulmonary edema".to_string(),
            category: "DIAGNOSTIC_SURVEILLANCE".to_string(),
            delta_rho_per_hour: 0.20,
        });
    }

    if assessment.methylene_blue_indicated {
        actions.push(CountermeasureAction {
            action_id: "ACT_TOX_METHYLENE_BLUE_1_2MG_KG_IV".to_string(),
            label: "Administer Methylene Blue 1-2 mg/kg IV for symptomatic methemoglobinemia (>= 15%)".to_string(),
            category: "TOXICOLOGY_ANTIDOTE".to_string(),
            delta_rho_per_hour: 0.32,
        });
    } else if assessment.methylene_blue_blocked_g6pd {
        causal_chain_summary.push(
            "GATE 5B BLOCK: Methylene Blue contraindicated in G6PD deficiency; substituting Ascorbic Acid + 100% O2".to_string(),
        );
        actions.push(CountermeasureAction {
            action_id: "ACT_TOX_ASCORBIC_ACID_100PCT_O2_G6PD_SAFE".to_string(),
            label: "Gate 5B G6PD-safe substitution: High-dose Ascorbic Acid + 100% O2 (Methylene Blue blocked)".to_string(),
            category: "TOXICOLOGY_ANTIDOTE".to_string(),
            delta_rho_per_hour: 0.24,
        });
    }

    // 4. Combustion Pyrolysis (CO > 35 ppm, HCN > 4.7 ppm, HCl > 5.0 ppm).
    if assessment.pyrolysis_co_exposure {
        actions.push(CountermeasureAction {
            action_id: "ACT_PYROLYSIS_DON_PBA_100PCT_NORMOBARIC_O2".to_string(),
            label: "Don PBA and deliver 100% normobaric O2 for accelerated COHb washout"
                .to_string(),
            category: "AIRWAY_RESPIRATORY_SUPPORT".to_string(),
            delta_rho_per_hour: 0.28,
        });
    }

    if assessment.hydroxocobalamin_indicated {
        actions.push(CountermeasureAction {
            action_id: "ACT_PYROLYSIS_HYDROXOCOBALAMIN_5G_IV_CYANOKIT".to_string(),
            label: "Administer Hydroxocobalamin 5 g IV (Cyanokit) for HCN or CO + lactate >= 8.0 mmol/L without inducing MetHb".to_string(),
            category: "TOXICOLOGY_ANTIDOTE".to_string(),
            delta_rho_per_hour: 0.36,
        });
    }

    // 5. Lunar Silicate Dust & Martian Perchlorates (ClO4-).
    if assessment.lunar_dust_lavage_indicated {
        actions.push(CountermeasureAction {
            action_id: "ACT_REGOLITH_HEPA_SUITPORT_WASHOUT_SALINE_NASAL_OCULAR_LAVAGE"
                .to_string(),
            label: "Execute HEPA suitport dust washout and sterile saline nasal/ocular lavage"
                .to_string(),
            category: "DECONTAMINATION".to_string(),
            delta_rho_per_hour: 0.18,
        });
    }

    if assessment.perchlorate_rfd_exceeded {
        actions.push(CountermeasureAction {
            action_id: "ACT_PERCHLORATE_ORAL_KI_SUPPLEMENT_TSH_AND_MARROW_CBC_MONITOR"
                .to_string(),
            label: "Start oral KI competitive NIS thyroid protection, TSH tracking, and marrow CBC surveillance".to_string(),
            category: "ENDOCRINE_HEMATOLOGIC_MONITOR".to_string(),
            delta_rho_per_hour: 0.16,
        });
    }

    if actions.is_empty() {
        return None;
    }

    Some(ActivePlaybook {
        playbook_id: "PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE".to_string(),
        title: "Playbook #27: Aerospace Toxicology, Pyrolysis & Regolith Exposure Protocol"
            .to_string(),
        causal_chain_summary,
        safety_gates: base_gates,
        actions,
    })
}

/// Builds Playbook #28 (`PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY`, `u16 = 28`)
/// when Parmitano helmet water intrusion, Type I/II DCS/AGE, Conkin pre-breathe lock,
/// or LCVG thermal failure is active.
pub fn build_playbook_28_eva_dcs_and_suit_emergency(
    assessment: &ToxicologyDcsAssessment,
    mut base_gates: SafetyGates,
) -> Option<ActivePlaybook> {
    let mut actions = Vec::new();
    let causal_chain_summary = assessment.causal_chain.clone();

    // Priority index 0: Parmitano Helmet Water Intrusion Immediate Abort.
    if assessment.parmitano_water_intrusion_emergency {
        base_gates.gate4_eva_fitness_no_go = true;
        actions.push(CountermeasureAction {
            action_id: "ACT_EVA_PARMITANO_WATER_INTRUSION_IMMEDIATE_ABORT".to_string(),
            label: "PARMITANO PROTOCOL: Abort EVA immediately, minimize head-nod water migration, translate to airlock and prepare post-repress airway suction".to_string(),
            category: "EVA_SUIT_LIFE_THREAT_ABORT".to_string(),
            delta_rho_per_hour: 0.45,
        });
    }

    // Type II Neurological/Chokes DCS or Arterial Gas Embolism (AGE).
    match assessment.dcs_classification {
        DcsClassification::TypeIINeuroChokesOrAge => {
            base_gates.gate4_eva_fitness_no_go = true;
            actions.push(CountermeasureAction {
                action_id: "ACT_DCS_TYPE2_AGE_HYPERBARIC_RECOMPRESSION_BTA_AIRLOCK".to_string(),
                label: "Initiate 100% O2 + airlock hyperbaric recompression via Bends Treatment Adapter (22.7 psi / USN TT6), IV crystalloid, and Foley if spinal retention".to_string(),
                category: "HYPERBARIC_EMERGENCY".to_string(),
                delta_rho_per_hour: 0.40,
            });
        }
        DcsClassification::TypeIJointPainOrHighVge => {
            base_gates.gate4_eva_fitness_no_go = true;
            actions.push(CountermeasureAction {
                action_id: "ACT_DCS_ABORT_EVA_100PCT_O2_SPLINT_IMMOBILIZE".to_string(),
                label: "Abort EVA for Spencer VGE >= 3 or Type I DCS: 100% O2, joint immobilization, and serial Doppler/neuro checks".to_string(),
                category: "EVA_DECOMPRESSION_ABORT".to_string(),
                delta_rho_per_hour: 0.30,
            });
        }
        DcsClassification::None => {}
    }

    // Conkin 360-min Tissue Ratio > 1.40 EVA Pre-breathe Lock.
    if assessment.eva_prebreathe_locked {
        base_gates.gate4_eva_fitness_no_go = true;
        actions.push(CountermeasureAction {
            action_id: "ACT_EVA_PREBREATHE_LOCK_CAMPOUT_OR_ISLE_PROTOCOL".to_string(),
            label: format!(
                "EVA LOCK: Conkin R360 ({:.2} > 1.40) requires campout / ISLE exercise 100% O2 pre-breathe before depressurization",
                assessment.haldane_tissue_ratio_r360
            ),
            category: "EVA_PREBREATHE_LOCK".to_string(),
            delta_rho_per_hour: 0.25,
        });
    }

    // LCVG Thermal Failure.
    match assessment.lcvg_thermal_emergency {
        LcvgThermalEmergency::Hyperthermia => {
            base_gates.gate4_eva_fitness_no_go = true;
            actions.push(CountermeasureAction {
                action_id: "ACT_EVA_HYPERTHERMIA_STOP_EXERTION_SHADE_SUIT_SUBLIMATOR_BACKUP"
                    .to_string(),
                label: "Stop exertion, move to thermal shade, switch LCVG/sublimator backup, and abort EVA if core temp remains >= 39.0 C".to_string(),
                category: "EVA_THERMAL_EMERGENCY".to_string(),
                delta_rho_per_hour: 0.28,
            });
        }
        LcvgThermalEmergency::Hypothermia => {
            base_gates.gate4_eva_fitness_no_go = true;
            actions.push(CountermeasureAction {
                action_id: "ACT_EVA_HYPOTHERMIA_ABORT_ACTIVE_REWARMING".to_string(),
                label: "Abort EVA for hypothermia (core temp <= 35.0 C), return to airlock, and initiate active external/warmed-fluid rewarming".to_string(),
                category: "EVA_THERMAL_EMERGENCY".to_string(),
                delta_rho_per_hour: 0.28,
            });
        }
        LcvgThermalEmergency::PumpFaultNormothermic | LcvgThermalEmergency::Nominal => {}
    }

    if actions.is_empty() {
        return None;
    }

    Some(ActivePlaybook {
        playbook_id: "PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY".to_string(),
        title: "Playbook #28: EVA Decompression Sickness, Pre-Breathe Lock & Suit Emergency"
            .to_string(),
        causal_chain_summary,
        safety_gates: base_gates,
        actions,
    })
}

/// Selects the highest-priority Playbook between #28 (Parmitano / Type II DCS) and #27 (Toxicology).
pub fn select_toxicology_or_eva_playbook(
    assessment: &ToxicologyDcsAssessment,
    base_gates: SafetyGates,
) -> Option<ActivePlaybook> {
    // Immediate EVA suit drowning or Type II DCS/AGE outranks everything.
    if assessment.parmitano_water_intrusion_emergency
        || assessment.dcs_classification == DcsClassification::TypeIINeuroChokesOrAge
    {
        return build_playbook_28_eva_dcs_and_suit_emergency(assessment, base_gates);
    }

    // Acute inhalation toxicology outranks non-life-threatening EVA pre-breathe locks.
    let acute_tox = assessment.nh3_severity != Nh3Severity::Nominal
        || assessment.mmh_pyridoxine_indicated
        || assessment.n2o4_pulmonary_surveillance_72h
        || assessment.methylene_blue_indicated
        || assessment.methylene_blue_blocked_g6pd
        || assessment.pyrolysis_co_exposure
        || assessment.hydroxocobalamin_indicated;

    if acute_tox {
        return build_playbook_27_aerospace_toxicology(assessment, base_gates);
    }

    if let Some(pb28) = build_playbook_28_eva_dcs_and_suit_emergency(assessment, base_gates) {
        return Some(pb28);
    }

    build_playbook_27_aerospace_toxicology(assessment, base_gates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_causal_graph::toxicology_dcs::{evaluate_toxicology_dcs, ToxicologyDcsInput};

    #[test]
    fn playbook_27_emits_exact_action_ids_and_respects_g6pd_block() {
        let input = ToxicologyDcsInput {
            nh3_ppm: 40.0,
            mmh_ppm: 0.03,
            no2_ppm: 2.0,
            methemoglobin_pct: 20.0,
            co_ppm: 50.0,
            lactate_mmol_l: Some(8.5),
            lunar_dust_exposure: true,
            perchlorate_exposure_mg_kg_d: 0.002,
            g6pd_deficient: true,
            ..Default::default()
        };
        let assessment = evaluate_toxicology_dcs(&input);
        let pb = build_playbook_27_aerospace_toxicology(&assessment, SafetyGates::default())
            .expect("playbook 27 must activate");

        assert_eq!(pb.playbook_id, "PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE");
        let ids: Vec<&str> = pb.actions.iter().map(|a| a.action_id.as_str()).collect();
        assert!(ids.contains(&"ACT_TOX_DON_PBA_QDM_ISOLATE_THERMAL_LOOP"));
        assert!(ids.contains(&"ACT_TOX_OCULAR_DERMAL_DECONTAMINATION"));
        assert!(ids.contains(&"ACT_TOX_HUMIDIFIED_O2_BRONCHODILATOR_LARYNGOSPASM_WATCH"));
        assert!(ids.contains(&"ACT_TOX_PYRIDOXINE_VITAMIN_B6_25MG_KG_IV"));
        assert!(ids.contains(&"ACT_TOX_N2O4_72H_DELAYED_PULMONARY_EDEMA_SURVEILLANCE"));
        assert!(!ids.contains(&"ACT_TOX_METHYLENE_BLUE_1_2MG_KG_IV"));
        assert!(ids.contains(&"ACT_TOX_ASCORBIC_ACID_100PCT_O2_G6PD_SAFE"));
        assert!(ids.contains(&"ACT_PYROLYSIS_DON_PBA_100PCT_NORMOBARIC_O2"));
        assert!(ids.contains(&"ACT_PYROLYSIS_HYDROXOCOBALAMIN_5G_IV_CYANOKIT"));
        assert!(ids.contains(&"ACT_REGOLITH_HEPA_SUITPORT_WASHOUT_SALINE_NASAL_OCULAR_LAVAGE"));
        assert!(ids.contains(&"ACT_PERCHLORATE_ORAL_KI_SUPPLEMENT_TSH_AND_MARROW_CBC_MONITOR"));
    }

    #[test]
    fn playbook_28_parmitano_water_intrusion_is_priority_index_zero() {
        let input = ToxicologyDcsInput {
            helmet_water_intrusion_detected: true,
            spencer_vge_grade: 3,
            lcvg_pump_fault: true,
            core_temp_c: Some(39.2),
            ..Default::default()
        };
        let assessment = evaluate_toxicology_dcs(&input);
        let pb = select_toxicology_or_eva_playbook(&assessment, SafetyGates::default())
            .expect("playbook 28 must activate");

        assert_eq!(pb.playbook_id, "PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY");
        assert_eq!(
            pb.actions[0].action_id,
            "ACT_EVA_PARMITANO_WATER_INTRUSION_IMMEDIATE_ABORT"
        );
        assert!(pb.safety_gates.gate4_eva_fitness_no_go);
        let ids: Vec<&str> = pb.actions.iter().map(|a| a.action_id.as_str()).collect();
        assert!(ids.contains(&"ACT_DCS_ABORT_EVA_100PCT_O2_SPLINT_IMMOBILIZE"));
        assert!(ids.contains(&"ACT_EVA_HYPERTHERMIA_STOP_EXERTION_SHADE_SUIT_SUBLIMATOR_BACKUP"));
    }

    #[test]
    fn playbook_28_type2_dcs_triggers_bta_hyperbaric_recompression() {
        let input = ToxicologyDcsInput {
            dcs_type2_neuro_or_age: true,
            lcvg_pump_fault: true,
            core_temp_c: Some(34.6),
            ..Default::default()
        };
        let assessment = evaluate_toxicology_dcs(&input);
        let pb = build_playbook_28_eva_dcs_and_suit_emergency(&assessment, SafetyGates::default())
            .expect("playbook 28 must activate");

        let ids: Vec<&str> = pb.actions.iter().map(|a| a.action_id.as_str()).collect();
        assert!(ids.contains(&"ACT_DCS_TYPE2_AGE_HYPERBARIC_RECOMPRESSION_BTA_AIRLOCK"));
        assert!(ids.contains(&"ACT_EVA_HYPOTHERMIA_ABORT_ACTIVE_REWARMING"));
    }
}
