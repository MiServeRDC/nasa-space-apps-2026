//! Error type for the playbook engine.

use thiserror::Error;

/// Errors raised while building or running a playbook.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum PlaybookError {
    /// A step depends on a step id that does not exist in the same playbook.
    #[error("playbook {playbook}: step {step} depends on unknown step {missing}")]
    UnknownDependency {
        playbook: &'static str,
        step: u8,
        missing: u8,
    },

    /// Two steps in the same playbook share an id.
    #[error("playbook {playbook}: duplicate step id {step}")]
    DuplicateStep { playbook: &'static str, step: u8 },

    /// The step dependencies contain a cycle, so the playbook is not a DAG.
    #[error("playbook {playbook}: dependency cycle detected")]
    Cycle { playbook: &'static str },

    /// The run has already executed every step.
    #[error("playbook {playbook}: already completed")]
    AlreadyCompleted { playbook: &'static str },

    /// The caller tried to execute a step that is not the next one in order.
    #[error("playbook {playbook}: expected step {expected}, got {got}")]
    OutOfOrder {
        playbook: &'static str,
        expected: u8,
        got: u8,
    },
}
