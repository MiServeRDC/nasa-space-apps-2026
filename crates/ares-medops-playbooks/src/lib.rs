//! # ares-medops-playbooks
//!
//! Phase 3 (`ACT`) of ARES-Health: deterministic MedOps Playbooks #01-#05 and the
//! 3 Hard Clinical Safety Gates (master plan, Block E, phases 10-11).
//!
//! Flow of one evaluation:
//!
//! ```text
//! ClinicalState --> triggers (playbooks.rs) --> proposed Playbook DAGs
//!                                                  |
//!                                                  v
//!                    enforce_clinical_safety_gates (safety_gates.rs)
//!                                                  |
//!                                                  v
//!                                 SafePlaybookDecision / MedOpsReport
//! ```
//!
//! Design rules:
//! * Pure and deterministic: same input, same output. No I/O, no clock, no randomness.
//! * Fail-safe on missing data: a `None` (null) input never unlocks a restricted action.
//! * No `unwrap`, `expect` or `panic` (enforced by crate lints).
//!
//! The types in [`state`] are PROVISIONAL stand-ins until `ares-core-types` exists;
//! they mirror `contracts/telemetry_schema.json` plus the few gate inputs the
//! schema does not carry yet (LBNP chamber state, systolic BP, GAI, ONSD, ppCO2).

pub mod actions;
pub mod engine;
pub mod error;
pub mod playbooks;
pub mod runner;
pub mod safety_gates;
pub mod state;
pub mod thresholds;

pub use actions::{Action, ActionKind};
pub use engine::{MedOpsEngine, MedOpsReport};
pub use error::PlaybookError;
pub use playbooks::{Playbook, PlaybookId, PlaybookStep};
pub use runner::{ActivePlaybookView, PlaybookRun};
pub use safety_gates::{
    GateId, GateIntervention, SafePlaybookDecision, enforce_clinical_safety_gates,
};
pub use state::ClinicalState;
pub use thresholds::ClinicalThresholds;
