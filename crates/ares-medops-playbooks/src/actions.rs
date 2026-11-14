//! Concrete actions a playbook step can prescribe.
//!
//! Actions are typed (not free text) so the safety gates can find and remove
//! forbidden ones reliably.

use serde::{Deserialize, Serialize};

/// What kind of intervention an action is. Gates filter on this.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActionKind {
    /// Diagnostic measurement (POCUS scan, vitals check).
    Diagnostic,
    /// Physical countermeasure (LBNP, NMES, exercise).
    Physical,
    /// High-impact plyometric exercise (blocked by Gate 3).
    PlyometricExercise,
    /// Systemic anticoagulant (blocked by Gate 1 unless thrombus confirmed).
    Anticoagulant,
    /// Nutrition / hydration.
    Nutrition,
    /// Habitat or suit hardware command.
    Hardware,
    /// Crew or ground notification, clearance change.
    Operational,
}

/// One instruction shown to the Crew Medical Officer.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Action {
    /// Stable machine code, e.g. `AUTO_VENT_LBNP_CHAMBER_0_MMHG`.
    pub code: &'static str,
    pub kind: ActionKind,
    /// Human-readable instruction for the cockpit.
    pub instruction: String,
    /// Expected NQS-STL robustness gain per hour. Filled later by `ares-nqs-stl`.
    pub expected_delta_rho_per_hour: Option<f64>,
}

impl Action {
    pub fn new(code: &'static str, kind: ActionKind, instruction: impl Into<String>) -> Self {
        Self {
            code,
            kind,
            instruction: instruction.into(),
            expected_delta_rho_per_hour: None,
        }
    }
}
