//! Fase 19/20 (Blocco I): Grounding normativo `NASA-STD-3001`, `ClinicalAnswerabilityGate`
//! e verifica deontica dell'habitat (`HabitatZoneDeonticPolicy`) sui Playbook MedOps (`#01-#05`).

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
}

/// Risolve in O(1) il grounding `ARES-BioKG` di uno dei 9 Playbook MedOps (`#01..#09`).
pub fn ground_playbook_normative(
    playbook_id: &str,
) -> Result<PlaybookNormativeGrounding, PlaybookError> {
    let (node, override_pb): (AdhgNodeKind, Option<(&'static str, u8)>) = match playbook_id {
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
            Some(("PLAYBOOK_06_HYPOXEMIA_DESATURATION", 6)),
        ),
        "PLAYBOOK_07_HEART_RATE_ANOMALY" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some(("PLAYBOOK_07_HEART_RATE_ANOMALY", 7)),
        ),
        "PLAYBOOK_08_SENSOR_SIGNAL_LOSS" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some(("PLAYBOOK_08_SENSOR_SIGNAL_LOSS", 8)),
        ),
        "PLAYBOOK_09_MULTIPARAMETER_DETERIORATION" => (
            AdhgNodeKind::EndothelialProtectiveSecretome,
            Some(("PLAYBOOK_09_MULTIPARAMETER_DETERIORATION", 9)),
        ),
        other => return Err(PlaybookError::UnknownPlaybookId(other.to_string())),
    };
    let g = ground_adhg_node_o1(node);
    let (resolved_id, resolved_num) = override_pb.unwrap_or((g.playbook_id, g.playbook_number));
    Ok(PlaybookNormativeGrounding {
        playbook_id: Cow::Borrowed(resolved_id),
        playbook_number: resolved_num,
        primary_adhg_node: g.adhg_node,
        normative_clause: g.normative_clause,
        anatomical_region: g.anatomical_region,
        target_habitat_zone: g.habitat_zone,
        descriptor: g.descriptor,
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
    let requests_anticoagulation = playbook.actions.iter().any(|a| {
        a.action_id.contains("ANTICOAG") || a.category.contains("PHARMACOLOGICAL")
    });
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
        ] {
            let g = ground_playbook_normative(pb_id).unwrap();
            assert_eq!(g.playbook_id.as_ref(), pb_id);
            assert_eq!(g.playbook_number, expected_num);
            assert!(g.descriptor.verify_crc().is_ok());
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
}
