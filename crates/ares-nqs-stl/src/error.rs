//! Typed error definitions for `ares-nqs-stl` (zero-panic production policy).

use ares_core_types::AresCoreError;
use thiserror::Error;

/// Domain errors for NQS-STL, Timestral Backbone, Monotone Quantiles, and Conformal Gate.
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

    #[error("core contract error: {0}")]
    Core(#[from] AresCoreError),
}
