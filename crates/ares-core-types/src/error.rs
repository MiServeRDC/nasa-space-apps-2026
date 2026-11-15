//! Phase 02 (A2): Strongly-typed core domain errors (`thiserror::Error`).

use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq)]
pub enum AresCoreError {
    #[error("non-finite numeric value in field '{field}'")]
    NonFiniteValue { field: &'static str },

    #[error("argument outside the allowed physical range for '{field}': {value} (expected [{min}, {max}])")]
    OutOfPhysicalBounds {
        field: &'static str,
        value: f64,
        min: f64,
        max: f64,
    },

    #[error("security or medical privacy violation: {reason}")]
    SecurityViolation { reason: String },

    #[error("contract serialization/deserialization error: {0}")]
    ContractSerialization(String),

    #[error("quantile ordering violation: q05={q05}, q50={q50}, q95={q95}")]
    QuantileCrossing { q05: f64, q50: f64, q95: f64 },

    #[error("invalid binary frame length: expected {expected} bytes, found {actual}")]
    InvalidBinaryFrameLength { expected: usize, actual: usize },

    #[error("invalid binary frame magic number: found 0x{found:08X}")]
    InvalidBinaryFrameMagic { found: u32 },

    #[error("unsupported binary frame schema version: found {found}")]
    InvalidBinaryFrameVersion { found: u16 },

    #[error("invalid binary frame CRC-32C checksum: expected 0x{expected:08X}, found 0x{found:08X}")]
    InvalidBinaryFrameCrc { expected: u32, found: u32 },

    #[error("empty SHM/Seqlock ring buffer: no frame published")]
    ShmRingEmpty,

    #[error("inconsistent Seqlock ring buffer read after maximum attempts")]
    ShmRingTornReadExhausted,

    #[error("shared-memory transport unavailable: {0}")]
    ShmRingUnavailable(String),
}
