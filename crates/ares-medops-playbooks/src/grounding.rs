//! Fase 19/20 (Blocco I): Grounding normativo `NASA-STD-3001`, `ClinicalAnswerabilityGate`
//! e verifica deontica dell'habitat (`HabitatZoneDeonticPolicy`) sui Playbook MedOps (`#01-#05`).

use crate::safety_gates::is_systemic_anticoagulant_action;
use ares_causal_graph::adhg_graph::AdhgNodeKind;
use ares_causal_graph::biokg_reasoner::{
    BiomedicalEvidenceDescriptor, ClinicalAnswerabilityGate, EpistemicProvenance,
    NormativeClauseId, evaluate_clinical_answerability_gate, ground_adhg_node_o1,
};
use ares_causal_graph::hypergraph_spatial::{
    AnatomicalRegionId, HabitatDeonticAssessment, HabitatEnvironmentState, HabitatZoneDeonticPolicy,
    HabitatZoneId,
};
use ares_core_types::telemetry::ActivePlaybook;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use thiserror::Error;

/// Errori tipizzati del dominio Playbooks & Safety Gates (`ares-medops-playbooks`).
#[derive(Debug, Error)]
pub enum PlaybookError {
    /// Identificativo Playbook non riconosciuto nel catalogo Type-1 (`#01..#05`).
    #[error("unknown MedOps playbook id `{0}`")]
    UnknownPlaybookId(String),

    /// Tentativo di sblocco farmacologico bloccato dal ClinicalAnswerabilityGate / MTB-007.
    #[error("playbook `{playbook_id}` blocked by {enforced_clause}: {reason}")]
    BlockedByClinicalGate {
        playbook_id: String,
        enforced_clause: String,
        reason: String,
    },
}

/// Ancoraggio normativo ed epistemico O(1) per un Playbook MedOps cristallizzato.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlaybookNormativeGrounding {
    pub playbook_id: Cow<'static, str>,
    pub playbook_number: u8,
    pub primary_adhg_node: AdhgNodeKind,
    pub normative_clause: NormativeClauseId,
    pub anatomical_region: AnatomicalRegionId,
    pub target_habitat_zone: HabitatZoneId,
    pub descriptor: BiomedicalEvidenceDescriptor,
    pub citation: Cow<'static, str>,
}

/// Risolve in O(1) il grounding `ARES-BioKG` di tutti i 30 Playbook MedOps (`#01..#30`).
pub fn ground_playbook_normative(
    playbook_id: &str,
) -> Result<PlaybookNormativeGrounding, PlaybookError> {
    type PlaybookOverride = (&'static str, u8, Option<NormativeClauseId>, Option<&'static str>);
    let (node, override_pb): (AdhgNodeKind, Option<PlaybookOverride>) = match playbook_id {
        "PLAYBOOK_01_VENOUS_STASIS_LBNP" => (AdhgNodeKind::IjvVenousStasisShearStress, None),
        "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS" => (AdhgNodeKind::PocusThrombusPosterior, None),
        "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED" => (AdhgNodeKind::AredMechanicalLoad, None),
        "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION" => {
            (AdhgNodeKind::SansTranslaminarGradient, None)
        }
        "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS" => {
            (AdhgNodeKind::CansRadiationOxidativeStress, None)
        }
        "PLAYBOOK_06_HYPOXEMIA_DESATURATION" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some((
                "PLAYBOOK_06_HYPOXEMIA_DESATURATION",
                6,
                None,
                Some("NASA-STD-3001 [V1 3003] / ExMC Acute Hypoxemia Desaturation"),
            )),
        ),
        "PLAYBOOK_07_HEART_RATE_ANOMALY" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some((
                "PLAYBOOK_07_HEART_RATE_ANOMALY",
                7,
                None,
                Some("NASA-STD-3001 [V1 3003] / ExMC Cardiovascular Rhythm & Rate Anomaly"),
            )),
        ),
        "PLAYBOOK_08_SENSOR_SIGNAL_LOSS" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some((
                "PLAYBOOK_08_SENSOR_SIGNAL_LOSS",
                8,
                None,
                Some("NASA-STD-3001 [V2 10001] / ExMC Telemetry Sensor Dropout Fail-Safe"),
            )),
        ),
        "PLAYBOOK_09_MULTIPARAMETER_DETERIORATION" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some((
                "PLAYBOOK_09_MULTIPARAMETER_DETERIORATION",
                9,
                None,
                Some("NASA-STD-3001 [V1 3006] / ExMC Multiparameter Cardiorespiratory Deterioration"),
            )),
        ),
        "PLAYBOOK_10_RENAL_LITHIASIS" => (AdhgNodeKind::RenalSupersaturationRsr, None),
        "PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING" => {
            (AdhgNodeKind::PlasmaVolumeOrthostatic, None)
        }
        "PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE" => {
            (AdhgNodeKind::MarsCircadianCognitiveFatigue, None)
        }
        "PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR" => {
            (AdhgNodeKind::NeuroImmuneViralReactivation, None)
        }
        "PLAYBOOK_14_CO2_SCRUBBER_SANS" => (AdhgNodeKind::CabinHypercapniaEnv, None),
        "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE" => (
            AdhgNodeKind::PlasmaVolumeOrthostatic,
            Some((
                "PLAYBOOK_15_EFAST_TRAUMA_TRIAGE",
                15,
                Some(NormativeClauseId::V2_7043_MedicalCapability),
                Some("NASA-STD-3001 [V2 7043] / ExMC eFAST Thoracic Trauma & Needle Decompression"),
            )),
        ),
        "PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some((
                "PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK",
                16,
                Some(NormativeClauseId::V1_3006_AutonomousCmoSupport),
                Some("NASA-STD-3001 [V1 3006] / ExMC Surviving Sepsis & Spaceflight Pharmacology"),
            )),
        ),
        "PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA" => (
            AdhgNodeKind::PlasmaVolumeOrthostatic,
            Some((
                "PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA",
                17,
                Some(NormativeClauseId::V2_7043_MedicalCapability),
                Some("NASA-STD-3001 [V2 7043] / ExMC Hemorrhagic Trauma & TXA Capability"),
            )),
        ),
        "PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS" => (
            AdhgNodeKind::PlasmaVolumeOrthostatic,
            Some((
                "PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS",
                18,
                Some(NormativeClauseId::V2_7043_MedicalCapability),
                Some("NASA-STD-3001 [V2 7043] / ExMC eFAST Torso Shock & Pericardiocentesis"),
            )),
        ),
        "PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some((
                "PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G",
                19,
                Some(NormativeClauseId::V1_3006_AutonomousCmoSupport),
                Some("NASA-STD-3001 [V1 3006] / ExMC Conservative Acute Abdomen NOM in 0g"),
            )),
        ),
        "PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE" => (
            AdhgNodeKind::AredMechanicalLoad,
            Some((
                "PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE",
                20,
                Some(NormativeClauseId::V1_3002_MusculoskeletalAred),
                Some("NASA-STD-3001 [V1 3002] / ExMC EVA Musculoskeletal & Spine Stabilization"),
            )),
        ),
        "PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY" => (
            AdhgNodeKind::NeuroImmuneViralReactivation,
            Some((
                "PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY",
                21,
                Some(NormativeClauseId::V2_7043_MedicalCapability),
                Some("NASA-STD-3001 [V2 7043] / ExMC Dental & Maxillofacial Airway Emergency"),
            )),
        ),
        "PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN" => (
            AdhgNodeKind::SansTranslaminarGradient,
            Some((
                "PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN",
                22,
                Some(NormativeClauseId::V1_3003_PreventiveMonitoring),
                Some("NASA-STD-3001 [V1 3003] / ExMC Ocular Foreign Body & Chemical Burn Lavage"),
            )),
        ),
        "PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some((
                "PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY",
                23,
                Some(NormativeClauseId::V2_7043_MedicalCapability),
                Some("NASA-STD-3001 [V2 7043] / ExMC Anaphylaxis & Supraglottic Airway Capability"),
            )),
        ),
        "PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR" => (
            AdhgNodeKind::PlasmaVolumeOrthostatic,
            Some((
                "PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR",
                24,
                Some(NormativeClauseId::V2_7043_MedicalCapability),
                Some("NASA-STD-3001 [V2 7043] / ExMC Microgravity Evetts-Russomano CPR & AED"),
            )),
        ),
        "PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS" => (
            AdhgNodeKind::RenalSupersaturationRsr,
            Some((
                "PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS",
                25,
                Some(NormativeClauseId::V2_6026_RenalStoneHydration),
                Some("NASA-STD-3001 [V2 6026] / ExMC Acute Urinary Retention & POCUS Catheterization"),
            )),
        ),
        "PLAYBOOK_26_ACUTE_RADIATION_SYNDROME" => (
            AdhgNodeKind::CansRadiationOxidativeStress,
            Some((
                "PLAYBOOK_26_ACUTE_RADIATION_SYNDROME",
                26,
                Some(NormativeClauseId::V1_4001_RadiationProtection),
                Some("NASA-STD-3001 [V1 4001] / ExMC SPE Acute Radiation Syndrome Biodosimetry"),
            )),
        ),
        "PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE" => (
            AdhgNodeKind::CabinHypercapniaEnv,
            Some((
                "PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE",
                27,
                Some(NormativeClauseId::V2_6001_AcousticAndCo2Limits),
                Some("NASA-STD-3001 [V2 6001] / JSC SMAC Spacecraft Toxicology (NH3/MMH/N2O4/CO/HCN)"),
            )),
        ),
        "PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY" => (
            AdhgNodeKind::PlasmaVolumeOrthostatic,
            Some((
                "PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY",
                28,
                Some(NormativeClauseId::V1_3001_CrewHealth),
                Some("NASA-STD-3001 [V1 3001] / ExMC EVA Suit Water Intrusion & Type II DCS/AGE"),
            )),
        ),
        "PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS" => (
            AdhgNodeKind::MarsCircadianCognitiveFatigue,
            Some((
                "PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS",
                29,
                Some(NormativeClauseId::V1_3003_PreventiveMonitoring),
                Some("NASA-STD-3001 [V1 3003] / ExMC Behavioral Health & Organic Delirium Exclusion"),
            )),
        ),
        "PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS" => (
            AdhgNodeKind::RenalSupersaturationRsr,
            Some((
                "PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS",
                30,
                Some(NormativeClauseId::V1_3001_CrewHealth),
                Some("NASA-STD-3001 [V1 3001] / ExMC Sex-Specific Female Pelvic & Urogyn POCUS"),
            )),
        ),
        other => return Err(PlaybookError::UnknownPlaybookId(other.to_string())),
    };
    let g = ground_adhg_node_o1(node);
    let (resolved_id, resolved_num, resolved_clause, resolved_citation) = match override_pb {
        Some((id, num, clause_opt, cit_opt)) => {
            let clause = clause_opt.unwrap_or(g.normative_clause);
            let citation = cit_opt.unwrap_or_else(|| clause.official_code());
            (id, num, clause, citation)
        }
        None => (
            g.playbook_id,
            g.playbook_number,
            g.normative_clause,
            g.normative_clause.official_code(),
        ),
    };
    Ok(PlaybookNormativeGrounding {
        playbook_id: Cow::Borrowed(resolved_id),
        playbook_number: resolved_num,
        primary_adhg_node: g.adhg_node,
        normative_clause: resolved_clause,
        anatomical_region: g.anatomical_region,
        target_habitat_zone: g.habitat_zone,
        descriptor: g.descriptor,
        citation: Cow::Borrowed(resolved_citation),
    })
}

/// Esito combinato della validazione BioKG + Deontica Habitat su un `ActivePlaybook`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlaybookGovernanceVerdict {
    pub grounding: PlaybookNormativeGrounding,
    pub answerability: ClinicalAnswerabilityGate,
    pub habitat_assessment: HabitatDeonticAssessment,
}

/// Valuta un `ActivePlaybook` rispetto a `EpistemicProvenance` (`ClinicalAnswerabilityGate`)
/// e `HabitatZoneDeonticPolicy`. Restituisce `Err(PlaybookError::BlockedByClinicalGate)`
/// se il playbook contiene azioni anticoagulanti senza conferma POCUS B-mode (`MTB-007`).
pub fn verify_playbook_governance(
    playbook: &ActivePlaybook,
    provenance: &EpistemicProvenance,
    missing_channels_count: usize,
    pocus_thrombus_confirmed: bool,
    habitat_state: &HabitatEnvironmentState,
    habitat_policy: &HabitatZoneDeonticPolicy,
) -> Result<PlaybookGovernanceVerdict, PlaybookError> {
    let grounding = ground_playbook_normative(&playbook.playbook_id)?;
    let requests_anticoagulation = playbook
        .actions
        .iter()
        .any(is_systemic_anticoagulant_action);
    let answerability = evaluate_clinical_answerability_gate(
        provenance,
        missing_channels_count,
        requests_anticoagulation,
        pocus_thrombus_confirmed,
        0.55,
    );
    if requests_anticoagulation
        && let ClinicalAnswerabilityGate::AbstainInsufficientData {
            enforced_clause,
            reason,
            ..
        } = &answerability
    {
        return Err(PlaybookError::BlockedByClinicalGate {
            playbook_id: playbook.playbook_id.clone(),
            enforced_clause: enforced_clause.to_string(),
            reason: reason.to_string(),
        });
    }
    let habitat_assessment = habitat_policy.evaluate(habitat_state);
    Ok(PlaybookGovernanceVerdict {
        grounding,
        answerability,
        habitat_assessment,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::telemetry::{CountermeasureAction, SafetyGates};

    #[test]
    fn test_ground_all_five_playbooks_o1() {
        for (pb_id, expected_num) in [
            ("PLAYBOOK_01_VENOUS_STASIS_LBNP", 1),
            ("PLAYBOOK_02_CONFIRMED_IJV_THROMBUS", 2),
            ("PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED", 3),
            ("PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION", 4),
            ("PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS", 5),
            ("PLAYBOOK_06_HYPOXEMIA_DESATURATION", 6),
            ("PLAYBOOK_07_HEART_RATE_ANOMALY", 7),
            ("PLAYBOOK_08_SENSOR_SIGNAL_LOSS", 8),
            ("PLAYBOOK_09_MULTIPARAMETER_DETERIORATION", 9),
            ("PLAYBOOK_10_RENAL_LITHIASIS", 10),
            ("PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING", 11),
            ("PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE", 12),
            ("PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR", 13),
            ("PLAYBOOK_14_CO2_SCRUBBER_SANS", 14),
            ("PLAYBOOK_15_EFAST_TRAUMA_TRIAGE", 15),
            ("PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK", 16),
            ("PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA", 17),
            ("PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS", 18),
            ("PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G", 19),
            ("PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE", 20),
            ("PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY", 21),
            ("PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN", 22),
            ("PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY", 23),
            ("PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR", 24),
            ("PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS", 25),
            ("PLAYBOOK_26_ACUTE_RADIATION_SYNDROME", 26),
            ("PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE", 27),
            ("PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY", 28),
            ("PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS", 29),
            ("PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS", 30),
        ] {
            let g = ground_playbook_normative(pb_id).unwrap();
            assert_eq!(g.playbook_id.as_ref(), pb_id);
            assert_eq!(g.playbook_number, expected_num);
            assert!(NormativeClauseId::ALL.contains(&g.normative_clause));
            assert!(!g.citation.is_empty());
            assert!(g.descriptor.verify_crc().is_ok());
        }
        assert_eq!(NormativeClauseId::ALL.len(), 10);
        for code in 1u16..=30 {
            let pb_id = ares_core_types::binary_ipc::playbook_id_from_u16(code).unwrap();
            let g = ground_playbook_normative(pb_id).unwrap();
            assert_eq!(g.playbook_number as u16, code);
            assert!(NormativeClauseId::ALL.contains(&g.normative_clause));
            assert!(!g.citation.is_empty());
        }
        assert!(matches!(
            ground_playbook_normative("PLAYBOOK_99_INVALID"),
            Err(PlaybookError::UnknownPlaybookId(_))
        ));
    }

    #[test]
    fn test_verify_playbook_governance_blocks_unverified_anticoagulation() {
        let pb = ActivePlaybook {
            playbook_id: "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS".to_string(),
            title: "Playbook #02".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates {
                anticoagulant_lock_active: true,
                lbnp_auto_vent_armed: true,
                eva_suit_damping_active: false,
                gate4_invasive_decompression_locked: true,
                gate4_eva_fitness_no_go: false,
                ..SafetyGates::default()
            },
            actions: vec![CountermeasureAction {
                action_id: "ACT_ANTICOAG_ENOXAPARIN".to_string(),
                label: "Anticoagulant".to_string(),
                category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                delta_rho_per_hour: 0.22,
            }],
        };
        let prov = EpistemicProvenance::from_modalities(Some(0.9), None, Some(0.8), Some(1.0));
        let hab = HabitatEnvironmentState {
            current_zone: HabitatZoneId::MedOpsUltrasoundBay,
            radiation_dose_rate_msv_d: 0.4,
            gai_pct: 5.0,
            pocus_thrombus_confirmed: false,
            lbnp_dwell_s: 0.0,
            sleep_quarters_noise_dba: 42.0,
        };
        let policy = HabitatZoneDeonticPolicy::default();

        let blocked = verify_playbook_governance(&pb, &prov, 0, false, &hab, &policy);
        match blocked {
            Err(PlaybookError::BlockedByClinicalGate {
                enforced_clause, ..
            }) => assert_eq!(enforced_clause, "NASA OCHMO MTB-007"),
            other => panic!("unexpected result: {other:?}"),
        }

        let prov_pocus = EpistemicProvenance::from_modalities(Some(0.9), Some(0.95), Some(0.8), Some(1.0));
        let allowed = verify_playbook_governance(&pb, &prov_pocus, 0, true, &hab, &policy).unwrap();
        assert!(matches!(
            allowed.answerability,
            ClinicalAnswerabilityGate::Answerable { .. }
        ));
    }

    #[test]
    fn test_verify_playbook_governance_allows_pb10_and_pb13_without_pocus_and_blocks_apx() {
        let prov = EpistemicProvenance::from_modalities(Some(0.9), None, Some(0.8), Some(1.0));
        let hab = HabitatEnvironmentState {
            current_zone: HabitatZoneId::MedOpsUltrasoundBay,
            radiation_dose_rate_msv_d: 0.4,
            gai_pct: 5.0,
            pocus_thrombus_confirmed: false,
            lbnp_dwell_s: 0.0,
            sleep_quarters_noise_dba: 42.0,
        };
        let policy = HabitatZoneDeonticPolicy::default();

        // Playbook #10 (Potassium Citrate + Ketorolac/Tamsulosin, category PHARMACOLOGICAL_UNLOCKED)
        let pb10 = ActivePlaybook {
            playbook_id: "PLAYBOOK_10_RENAL_LITHIASIS".to_string(),
            title: "Playbook #10".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates::default(),
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_PHARMACOLOGICAL_POTASSIUM_CITRATE_30MEQ".to_string(),
                    label: "Potassium Citrate".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.18,
                },
                CountermeasureAction {
                    action_id: "ACT_ANALGESIA_KETOROLAC_AND_TAMSULOSIN".to_string(),
                    label: "Ketorolac + Tamsulosin".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.15,
                },
            ],
        };
        let res10 = verify_playbook_governance(&pb10, &prov, 0, false, &hab, &policy);
        assert!(res10.is_ok(), "Playbook #10 must pass with pocus_thrombus_confirmed == false");

        // Playbook #13 (Valacyclovir, category PHARMACOLOGICAL_UNLOCKED)
        let pb13 = ActivePlaybook {
            playbook_id: "PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR".to_string(),
            title: "Playbook #13".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates::default(),
            actions: vec![CountermeasureAction {
                action_id: "ACT_PHARMACOLOGICAL_VALACYCLOVIR_500MG".to_string(),
                label: "Valacyclovir".to_string(),
                category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                delta_rho_per_hour: 0.16,
            }],
        };
        let res13 = verify_playbook_governance(&pb13, &prov, 0, false, &hab, &policy);
        assert!(res13.is_ok(), "Playbook #13 must pass with pocus_thrombus_confirmed == false");

        // ACT_APX_ORAL must be blocked when pocus_thrombus_confirmed == false
        let pb_apx = ActivePlaybook {
            playbook_id: "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS".to_string(),
            title: "Playbook #02 Apixaban".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates::default(),
            actions: vec![CountermeasureAction {
                action_id: "ACT_APX_ORAL".to_string(),
                label: "Apixaban oral".to_string(),
                category: "PHARMACOLOGICAL_ANTICOAGULANT".to_string(),
                delta_rho_per_hour: 0.22,
            }],
        };
        let blocked_apx = verify_playbook_governance(&pb_apx, &prov, 0, false, &hab, &policy);
        assert!(matches!(
            blocked_apx,
            Err(PlaybookError::BlockedByClinicalGate { .. })
        ));
    }
}
