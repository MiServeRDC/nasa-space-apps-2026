//! The 3 Hard Clinical Safety Gates (master plan, phase 11).
//!
//! Gates run AFTER a playbook is proposed and can only make it safer:
//! remove forbidden actions, add protective ones, or prepend priority actions.
//! They never add a restricted action. Missing data is handled fail-safe.

use serde::{Deserialize, Serialize};

use crate::actions::{Action, ActionKind};
use crate::playbooks::{Playbook, PlaybookId, PlaybookStep};
use crate::state::{ClinicalState, finite};
use crate::thresholds::ClinicalThresholds;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GateId {
    /// Gate 1: no anticoagulants without POCUS-confirmed thrombus.
    AnticoagulantLock,
    /// Gate 2: LBNP anti-syncope auto-vent.
    LbnpAutoVent,
    /// Gate 3: 0.38 g landing gait stability.
    EvaSuitDamping,
}

/// Record of one gate firing, for the cockpit and the audit chain.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GateIntervention {
    pub gate: GateId,
    pub reason: String,
    /// Codes of actions the gate removed from the playbook.
    pub removed_actions: Vec<&'static str>,
    /// Actions the gate added (priority or replacement).
    pub added_actions: Vec<Action>,
}

/// A playbook after all gates have been applied. This is what may be executed.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SafePlaybookDecision {
    pub playbook_id: PlaybookId,
    /// Actions that must run before any step (e.g. LBNP vent).
    pub priority_actions: Vec<Action>,
    pub steps: Vec<PlaybookStep>,
    pub interventions: Vec<GateIntervention>,
    pub anticoagulant_lock_active: bool,
    pub lbnp_auto_vent: bool,
    pub eva_suit_damping_active: bool,
}

/// Gate 1 status. Locked unless POCUS explicitly confirmed a thrombus.
pub fn anticoagulant_lock_active(state: &ClinicalState) -> bool {
    state.jugular.pocus_thrombus_confirmed != Some(true)
}

/// Gate 2. Returns the vent intervention when the guardrail trips.
/// Fail-safe: during an active session, missing HR or systolic BP also vents,
/// because the guardrail cannot be verified.
pub fn lbnp_guardrail(state: &ClinicalState, th: &ClinicalThresholds) -> Option<GateIntervention> {
    let lbnp = &state.lbnp;
    if !lbnp.active {
        return None;
    }

    let hr = finite(state.vitals.heart_rate_bpm);
    let drop = match (
        finite(lbnp.baseline_systolic_bp_mmhg),
        finite(lbnp.current_systolic_bp_mmhg),
    ) {
        (Some(base), Some(now)) => Some(base - now),
        _ => None,
    };

    let reason = match (drop, hr) {
        (Some(d), _) if d > th.lbnp_max_systolic_drop_mmhg => {
            format!(
                "systolic BP drop {d:.1} mmHg > {} mmHg",
                th.lbnp_max_systolic_drop_mmhg
            )
        }
        (_, Some(h)) if h > th.lbnp_max_heart_rate_bpm => {
            format!("heart rate {h:.0} bpm > {} bpm", th.lbnp_max_heart_rate_bpm)
        }
        (None, _) => "systolic BP unavailable during LBNP (fail-safe)".to_string(),
        (_, None) => "heart rate unavailable during LBNP (fail-safe)".to_string(),
        _ => return None,
    };

    Some(GateIntervention {
        gate: GateId::LbnpAutoVent,
        reason,
        removed_actions: Vec::new(),
        added_actions: vec![Action::new(
            "AUTO_VENT_LBNP_CHAMBER_0_MMHG",
            ActionKind::Hardware,
            "Vent LBNP chamber to 0 mmHg immediately. Supine position, recheck vitals.",
        )],
    })
}

/// Gate 3 trip condition. `Some(reason)` when plyometrics must be blocked.
/// Returns `(reason, measured_over_limit)`.
fn gait_trip(state: &ClinicalState, th: &ClinicalThresholds) -> Option<(String, bool)> {
    let m = &state.musculoskeletal;
    match finite(m.gait_asymmetry_index_pct) {
        Some(gai) if gai > th.gait_asymmetry_max_pct => Some((
            format!(
                "gait asymmetry index {gai:.1}% > {}%",
                th.gait_asymmetry_max_pct
            ),
            true,
        )),
        None if m.post_landing => Some((
            "post-landing gait asymmetry not measured (fail-safe)".to_string(),
            false,
        )),
        _ => None,
    }
}

/// Gate 3 as a standalone intervention (used by the engine even with no playbook).
pub fn gait_guardrail(state: &ClinicalState, th: &ClinicalThresholds) -> Option<GateIntervention> {
    let (reason, over_limit) = gait_trip(state, th)?;
    let added = if over_limit {
        vec![
            Action::new(
                "EVA_SUIT_DAMPING_INCREASE",
                ActionKind::Hardware,
                format!(
                    "Increase EVA suit ankle/knee damping by {}%.",
                    th.suit_damping_increase_pct
                ),
            ),
            Action::new(
                "CLOSED_CHAIN_NEUROMUSCULAR_RETRAINING",
                ActionKind::Physical,
                "Closed-chain neuromuscular retraining before any surface EVA traverse.",
            ),
        ]
    } else {
        vec![Action::new(
            "IMU_GAIT_ASSESSMENT",
            ActionKind::Diagnostic,
            "Run suit IMU gait asymmetry assessment before surface activity.",
        )]
    };
    Some(GateIntervention {
        gate: GateId::EvaSuitDamping,
        reason,
        removed_actions: Vec::new(),
        added_actions: added,
    })
}

/// Removes every action of `kind` from the steps. A step left empty gets a
/// placeholder so step numbering shown in the cockpit stays stable.
fn strip_kind(steps: &mut [PlaybookStep], kind: ActionKind, gate_note: &str) -> Vec<&'static str> {
    let mut removed = Vec::new();
    for step in steps.iter_mut() {
        let before = step.actions.len();
        step.actions.retain(|a| {
            let forbidden = a.kind == kind;
            if forbidden {
                removed.push(a.code);
            }
            !forbidden
        });
        if before > 0 && step.actions.is_empty() {
            step.actions.push(Action::new(
                "STEP_BLOCKED_BY_SAFETY_GATE",
                ActionKind::Operational,
                gate_note.to_string(),
            ));
        }
    }
    removed
}

/// Applies the 3 gates to a proposed playbook. Pure function.
pub fn enforce_clinical_safety_gates(
    state: &ClinicalState,
    th: &ClinicalThresholds,
    proposed: &Playbook,
) -> SafePlaybookDecision {
    let mut steps = proposed.steps.clone();
    let mut interventions = Vec::new();
    let mut priority_actions = Vec::new();

    // Gate 1
    let anticoag_locked = anticoagulant_lock_active(state);
    if anticoag_locked {
        let removed = strip_kind(
            &mut steps,
            ActionKind::Anticoagulant,
            "Anticoagulation blocked: no POCUS-confirmed thrombus (Gate 1).",
        );
        if !removed.is_empty() {
            interventions.push(GateIntervention {
                gate: GateId::AnticoagulantLock,
                reason: "POCUS has not confirmed a non-compressible thrombus".to_string(),
                removed_actions: removed,
                added_actions: vec![
                    Action::new(
                        "LBNP_SESSION",
                        ActionKind::Physical,
                        format!(
                            "Physical protocol: LBNP at {} mmHg.",
                            th.lbnp_session_pressure_mmhg
                        ),
                    ),
                    Action::new(
                        "SOLEUS_ISOMETRIC_NMES",
                        ActionKind::Physical,
                        "Physical protocol: soleus contractions / calf NMES.",
                    ),
                ],
            });
        }
    }

    // Gate 2
    let vent = lbnp_guardrail(state, th);
    let lbnp_auto_vent = vent.is_some();
    if let Some(v) = vent {
        priority_actions.extend(v.added_actions.iter().cloned());
        interventions.push(v);
    }

    // Gate 3
    let gait = gait_guardrail(state, th);
    let eva_suit_damping_active = gait.as_ref().is_some_and(|g| {
        g.added_actions
            .iter()
            .any(|a| a.code == "EVA_SUIT_DAMPING_INCREASE")
    });
    if let Some(mut g) = gait {
        g.removed_actions = strip_kind(
            &mut steps,
            ActionKind::PlyometricExercise,
            "High-impact exercise blocked until gait is stable (Gate 3).",
        );
        priority_actions.extend(g.added_actions.iter().cloned());
        interventions.push(g);
    }

    SafePlaybookDecision {
        playbook_id: proposed.id,
        priority_actions,
        steps,
        interventions,
        anticoagulant_lock_active: anticoag_locked,
        lbnp_auto_vent,
        eva_suit_damping_active,
    }
}
