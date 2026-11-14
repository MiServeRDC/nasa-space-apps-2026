//! Typed error definitions for `ares-nqs-stl` (zero-panic production policy).

use ares_core_types::AresCoreError;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Split role for subject-disjoint calibration and out-of-sample evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SplitRole {
    Train,
    Calibration,
    HeldOutTest,
}

/// Formal anti-leakage invariant violations (Phase 33 L5 / Gate 3).
#[derive(Debug, Error, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LeakageViolationError {
    #[error("subject '{subject_id}' overlaps across splits ({first_role:?} vs {second_role:?})")]
    SubjectOverlapAcrossSplits {
        subject_id: String,
        first_role: SplitRole,
        second_role: SplitRole,
    },

    #[error("warmup copy or duplicate timestamp for '{subject_id}' at origin {origin_time_s}s")]
    WarmupCopyOrDuplicateTimestamp {
        subject_id: String,
        origin_time_s: f64,
    },

    #[error(
        "overlapping evaluation window for '{subject_id}': prev_target={prev_target_time_s}s > next_origin={next_origin_time_s}s"
    )]
    OverlappingWindowAcrossBoundary {
        subject_id: String,
        prev_target_time_s: f64,
        next_origin_time_s: f64,
    },

    #[error(
        "horizon target mismatch: declared +{declared_horizon_s}s, realized delta {realized_delta_s}s"
    )]
    HorizonTargetMismatch {
        declared_horizon_s: u32,
        realized_delta_s: f64,
    },

    #[error("synthetic data forbidden in calibration/benchmarking for subject '{subject_id}'")]
    SyntheticDataForbiddenInCalibration { subject_id: String },
}

/// Domain errors for NQS-STL, Timestral Backbone, Monotone Quantiles, Conformal Gate,
/// SafeTensors Checkpoint Loader (L4), and Calibration Anti-Leakage Harness (L5).
#[derive(Debug, Error, Clone, PartialEq)]
pub enum NqsStlError {
    #[error("invalid Timestral configuration: {reason}")]
    InvalidConfig { reason: &'static str },

    #[error("dimension mismatch: expected {expected}, found {found}")]
    DimensionMismatch { expected: usize, found: usize },

    #[error("insufficient patches or empty window in telemetry buffer")]
    EmptyPatchWindow,

    #[error("non-finite value detected in '{field}'")]
    NonFiniteValue { field: &'static str },

    #[error("checkpoint file or manifest missing at '{path}'")]
    CheckpointMissing { path: String },

    #[error("checkpoint I/O or manifest parse error: {reason}")]
    CheckpointFormatError { reason: String },

    #[error(
        "checkpoint SHA-256 mismatch for '{model_id}': expected {expected}, computed {computed}"
    )]
    CheckpointSha256Mismatch {
        model_id: String,
        expected: String,
        computed: String,
    },

    #[error("checkpoint tensor '{tensor}' missing in safetensors archive")]
    CheckpointMissingTensor { tensor: String },

    #[error(
        "checkpoint tensor '{tensor}' shape mismatch: expected {expected:?}, found {found:?}"
    )]
    CheckpointShapeMismatch {
        tensor: String,
        expected: Vec<usize>,
        found: Vec<usize>,
    },

    #[error("checkpoint tensor '{tensor}' contains non-finite (NaN/Inf) weight")]
    CheckpointNonFiniteWeight { tensor: String },

    #[error("checkpoint tensor '{tensor}' has unsupported dtype '{dtype}'")]
    CheckpointUnsupportedDtype { tensor: String, dtype: String },

    #[error("safetensors loader feature is disabled at compile time")]
    CheckpointLoaderDisabled,

    #[error("anti-leakage invariant violation: {0}")]
    LeakageViolation(#[from] LeakageViolationError),

    #[error("core contract error: {0}")]
    Core(#[from] AresCoreError),
}
