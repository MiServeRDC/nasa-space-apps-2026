//! Playbooks #01-#05 as pre-compiled DAGs ("Type 1 Crystallized"), plus their triggers.
//!
//! Numbering follows `docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`, phase 10.
//! NOTE: `ARES_Health_Master_Architecture.md` numbers them differently (stasis as #04,
//! Mars gait as #05). The team must pick one; here Mars gait is Gate 3, not a playbook.

use serde::{Deserialize, Serialize};

use crate::actions::{Action, ActionKind};
use crate::error::PlaybookError;
use crate::state::{ClinicalState, finite};
use crate::thresholds::ClinicalThresholds;

/// The five MedOps playbooks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum PlaybookId {
    #[serde(rename = "PLAYBOOK_01_VENOUS_STASIS_LBNP")]
    P01VenousStasisLbnp,
    #[serde(rename = "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS")]
    P02ConfirmedIjvThrombus,
    #[serde(rename = "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED")]
    P03SarcopeniaOsteopeniaAred,
    #[serde(rename = "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION")]
    P04SansTranslaminarMitigation,
    #[serde(rename = "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS")]
    P05SpeRadiationShelterCans,
}

impl PlaybookId {
    pub const ALL: [PlaybookId; 5] = [
        PlaybookId::P01VenousStasisLbnp,
        PlaybookId::P02ConfirmedIjvThrombus,
        PlaybookId::P03SarcopeniaOsteopeniaAred,
        PlaybookId::P04SansTranslaminarMitigation,
        PlaybookId::P05SpeRadiationShelterCans,
    ];

    /// Stable code used in JSON and in the cockpit (`active_playbook.playbook_id`).
    pub fn code(self) -> &'static str {
        match self {
            PlaybookId::P01VenousStasisLbnp => "PLAYBOOK_01_VENOUS_STASIS_LBNP",
            PlaybookId::P02ConfirmedIjvThrombus => "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS",
            PlaybookId::P03SarcopeniaOsteopeniaAred => "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED",
            PlaybookId::P04SansTranslaminarMitigation => "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION",
            PlaybookId::P05SpeRadiationShelterCans => "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS",
        }
    }

    /// Urgency rank, lower runs first. Acute life threats before chronic deconditioning.
    pub fn urgency(self) -> u8 {
        match self {
            PlaybookId::P05SpeRadiationShelterCans => 0,
            PlaybookId::P02ConfirmedIjvThrombus => 1,
            PlaybookId::P04SansTranslaminarMitigation => 2,
            PlaybookId::P01VenousStasisLbnp => 3,
            PlaybookId::P03SarcopeniaOsteopeniaAred => 4,
        }
    }
}

/// One node of a playbook DAG.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlaybookStep {
    pub id: u8,
    pub title: &'static str,
    /// Ids of steps that must be completed before this one.
    pub depends_on: Vec<u8>,
    pub actions: Vec<Action>,
}

/// A validated playbook. `steps` is stored in a topological order.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Playbook {
    pub id: PlaybookId,
    pub steps: Vec<PlaybookStep>,
}

impl Playbook {
    /// Validates the DAG (unique ids, known dependencies, no cycles) and sorts the
    /// steps topologically. Ties are broken by step id, so the order is deterministic.
    pub fn new(id: PlaybookId, steps: Vec<PlaybookStep>) -> Result<Self, PlaybookError> {
        let name = id.code();
        let known: Vec<u8> = steps.iter().map(|s| s.id).collect();

        for (i, step) in steps.iter().enumerate() {
            if known[..i].contains(&step.id) {
                return Err(PlaybookError::DuplicateStep {
                    playbook: name,
                    step: step.id,
                });
            }
            if let Some(missing) = step.depends_on.iter().find(|d| !known.contains(d)) {
                return Err(PlaybookError::UnknownDependency {
                    playbook: name,
                    step: step.id,
                    missing: *missing,
                });
            }
        }

        // Kahn's algorithm, always picking the smallest ready id.
        let mut remaining = steps;
        let mut ordered: Vec<PlaybookStep> = Vec::with_capacity(remaining.len());
        while !remaining.is_empty() {
            let done: Vec<u8> = ordered.iter().map(|s| s.id).collect();
            let next = remaining
                .iter()
                .enumerate()
                .filter(|(_, s)| s.depends_on.iter().all(|d| done.contains(d)))
                .min_by_key(|(_, s)| s.id)
                .map(|(i, _)| i);
            match next {
                Some(i) => ordered.push(remaining.remove(i)),
                None => return Err(PlaybookError::Cycle { playbook: name }),
            }
        }

        Ok(Self { id, steps: ordered })
    }

    /// All actions of the playbook, in step order.
    pub fn actions(&self) -> impl Iterator<Item = &Action> {
        self.steps.iter().flat_map(|s| s.actions.iter())
    }
}

fn step(id: u8, title: &'static str, depends_on: &[u8], actions: Vec<Action>) -> PlaybookStep {
    PlaybookStep {
        id,
        title,
        depends_on: depends_on.to_vec(),
        actions,
    }
}

/// Builds the DAG of a playbook with the given thresholds.
pub fn build(id: PlaybookId, th: &ClinicalThresholds) -> Result<Playbook, PlaybookError> {
    use ActionKind::*;
    let lbnp = th.lbnp_session_pressure_mmhg;

    let steps = match id {
        PlaybookId::P01VenousStasisLbnp => vec![
            step(
                1,
                "Confirm stasis with POCUS",
                &[],
                vec![Action::new(
                    "POCUS_IJV_COMPRESSION_SCAN",
                    Diagnostic,
                    "POCUS scan of the internal jugular vein: CSA, peak velocity, compressibility.",
                )],
            ),
            step(
                2,
                "LBNP decompression",
                &[1],
                vec![Action::new(
                    "LBNP_SESSION",
                    Physical,
                    format!(
                        "Start LBNP session at {lbnp} mmHg. Gate 2 anti-syncope guardrail armed."
                    ),
                )],
            ),
            step(
                3,
                "Calf muscle pump",
                &[1],
                vec![Action::new(
                    "SOLEUS_ISOMETRIC_NMES",
                    Physical,
                    "Isometric soleus contractions or calf NMES to restore venous return.",
                )],
            ),
            step(
                4,
                "Hydration",
                &[1],
                vec![Action::new(
                    "ORAL_HYDRATION",
                    Nutrition,
                    "Oral fluid loading per CMO protocol.",
                )],
            ),
            step(
                5,
                "Reassess",
                &[2, 3, 4],
                vec![Action::new(
                    "POCUS_IJV_REASSESS",
                    Diagnostic,
                    "Repeat POCUS: verify wall shear stress back above stasis threshold.",
                )],
            ),
        ],
        PlaybookId::P02ConfirmedIjvThrombus => vec![
            step(
                1,
                "Escalate",
                &[],
                vec![Action::new(
                    "NOTIFY_CMO_FLIGHT_SURGEON",
                    Operational,
                    "Notify CMO; queue store-and-forward packet to Flight Surgeon.",
                )],
            ),
            step(
                2,
                "Revoke EVA clearance",
                &[1],
                vec![Action::new(
                    "EVA_CLEARANCE_REVOKED",
                    Operational,
                    "Set EVA_CLEARANCE = REVOKED.",
                )],
            ),
            step(
                3,
                "Anticoagulation",
                &[1],
                vec![Action::new(
                    "START_ANTICOAGULATION",
                    Anticoagulant,
                    "Start anticoagulation per Flight Surgeon protocol (Gate 1 checked).",
                )],
            ),
            step(
                4,
                "Follow-up",
                &[3],
                vec![Action::new(
                    "POCUS_THROMBUS_FOLLOWUP",
                    Diagnostic,
                    "Scheduled POCUS follow-up of the thrombus.",
                )],
            ),
        ],
        PlaybookId::P03SarcopeniaOsteopeniaAred => vec![
            step(
                1,
                "Measure muscle quality",
                &[],
                vec![Action::new(
                    "POCUS_SOLEUS_MQI",
                    Diagnostic,
                    "POCUS soleus thickness and pennation angle (Muscle Quality Index).",
                )],
            ),
            step(
                2,
                "ARED eccentric loading",
                &[1],
                vec![Action::new(
                    "ARED_ECCENTRIC_INCREASE",
                    Physical,
                    format!(
                        "Increase ARED eccentric load by {}%.",
                        th.ared_eccentric_increase_pct
                    ),
                )],
            ),
            step(
                3,
                "Bone impact loading",
                &[1],
                vec![Action::new(
                    "PLYOMETRIC_IMPACT_PROTOCOL",
                    PlyometricExercise,
                    "High-impact plyometric jump protocol for calcaneus loading.",
                )],
            ),
            step(
                4,
                "Nutrition",
                &[1],
                vec![Action::new(
                    "LEUCINE_POTASSIUM_CITRATE",
                    Nutrition,
                    "Leucine supplementation and potassium citrate per CMO protocol.",
                )],
            ),
            step(
                5,
                "Reassess",
                &[2, 3, 4],
                vec![Action::new(
                    "MUSCULOSKELETAL_REASSESS",
                    Diagnostic,
                    "Repeat soleus and BMD estimate.",
                )],
            ),
        ],
        PlaybookId::P04SansTranslaminarMitigation => vec![
            step(
                1,
                "Lower cabin CO2",
                &[],
                vec![Action::new(
                    "ECLSS_CO2_SCRUBBING_BOOST",
                    Hardware,
                    "Command ECLSS CO2 scrubbing boost; target reached within 2 h.",
                )],
            ),
            step(
                2,
                "Measure ONSD",
                &[],
                vec![Action::new(
                    "POCUS_ONSD_SCAN",
                    Diagnostic,
                    "Trans-orbital POCUS optic nerve sheath diameter.",
                )],
            ),
            step(
                3,
                "Visual check",
                &[1, 2],
                vec![Action::new(
                    "VISUAL_ACUITY_CHECK",
                    Diagnostic,
                    "Visual acuity and Amsler grid test.",
                )],
            ),
            step(
                4,
                "Escalate",
                &[3],
                vec![Action::new(
                    "NOTIFY_FLIGHT_SURGEON_SANS",
                    Operational,
                    "Queue SANS report to Flight Surgeon.",
                )],
            ),
        ],
        PlaybookId::P05SpeRadiationShelterCans => vec![
            step(
                1,
                "Shelter",
                &[],
                vec![Action::new(
                    "ENTER_STORM_SHELTER",
                    Operational,
                    "All crew to the radiation storm shelter now.",
                )],
            ),
            step(
                2,
                "Suspend EVA",
                &[],
                vec![Action::new(
                    "EVA_SUSPENDED",
                    Operational,
                    "Suspend all EVA until the event ends.",
                )],
            ),
            step(
                3,
                "Dosimetry",
                &[1],
                vec![Action::new(
                    "LOG_CANS_DOSIMETRY",
                    Diagnostic,
                    "Log cumulative dose from CANS dosimeter.",
                )],
            ),
            step(
                4,
                "All clear",
                &[1, 3],
                vec![Action::new(
                    "SHELTER_EXIT_WHEN_CLEAR",
                    Operational,
                    "Leave shelter only when dose rate is back below threshold.",
                )],
            ),
        ],
    };

    Playbook::new(id, steps)
}

/// Which playbooks the current state triggers. Missing data never triggers anything
/// (the gates handle the fail-safe side).
pub fn triggered(state: &ClinicalState, th: &ClinicalThresholds) -> Vec<PlaybookId> {
    let mut out = Vec::new();
    let j = &state.jugular;
    let thrombus = j.pocus_thrombus_confirmed == Some(true);

    if thrombus {
        out.push(PlaybookId::P02ConfirmedIjvThrombus);
    } else {
        let low_shear = finite(j.wall_shear_stress_dyn_cm2)
            .is_some_and(|t| t < th.stasis_wall_shear_stress_dyn_cm2);
        let low_velocity =
            finite(j.ijv_velocity_max_cm_s).is_some_and(|v| v < th.stasis_velocity_max_cm_s);
        if low_shear || low_velocity {
            out.push(PlaybookId::P01VenousStasisLbnp);
        }
    }

    let m = &state.musculoskeletal;
    let sarcopenia =
        finite(m.soleus_volume_loss_pct).is_some_and(|v| v > th.sarcopenia_soleus_volume_loss_pct);
    let osteopenia =
        finite(m.bmd_loss_pct_per_month).is_some_and(|v| v > th.osteopenia_bmd_loss_pct_per_month);
    if sarcopenia || osteopenia {
        out.push(PlaybookId::P03SarcopeniaOsteopeniaAred);
    }

    let co2 = finite(state.environment.cabin_ppco2_mmhg).is_some_and(|v| v > th.sans_ppco2_mmhg);
    let onsd = finite(state.neuro_ocular.optic_nerve_sheath_diameter_mm)
        .is_some_and(|v| v > th.sans_onsd_mm);
    if co2 && onsd {
        out.push(PlaybookId::P04SansTranslaminarMitigation);
    }

    if finite(state.environment.ambient_radiation_rate_ugy_h)
        .is_some_and(|v| v > th.spe_dose_rate_ugy_h)
    {
        out.push(PlaybookId::P05SpeRadiationShelterCans);
    }

    out.sort_by_key(|id| id.urgency());
    out
}
