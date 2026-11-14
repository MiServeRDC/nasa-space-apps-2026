use thiserror::Error;

/// Typed error hierarchy for the 3-tier LSAH persistence engine (`crates/ares-storage-lsah`).
#[derive(Debug, Error)]
pub enum LsahStorageError {
    #[error("air-gap violation: storage path '{0}' uses forbidden remote URI scheme or parent traversal")]
    ForbiddenStoragePath(String),

    #[error("invalid LSAH configuration: {0}")]
    InvalidConfig(String),

    #[error("POCUS vector dimension mismatch: expected {expected}, got {actual}")]
    EmbeddingDimensionMismatch { expected: usize, actual: usize },

    #[error("non-finite floating point value in POCUS feature vector at index {index}")]
    NonFiniteEmbeddingValue { index: usize },

    #[error("invalid POCUS input: {0}")]
    InvalidPocusInput(String),

    #[error("Arrow columnar error: {0}")]
    Arrow(#[from] arrow_schema::ArrowError),

    #[error("storage I/O or Zstandard error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("CRC-32C integrity mismatch in {artifact}: expected 0x{expected:08x}, computed 0x{computed:08x}")]
    CrcMismatch {
        artifact: String,
        expected: u32,
        computed: u32,
    },

    #[error("AEAD nonce reuse refused: chunk_seq {attempted} <= watermark {watermark} in epoch {epoch}")]
    NonceReuseDetected {
        epoch: u16,
        attempted: u64,
        watermark: u64,
    },

    #[error("Cold chunk AEAD authentication failed (ciphertext, nonce, or Sha256AuditLogger AAD tampered)")]
    ColdAeadAuthenticationFailed,

    #[error("audit chain linkage tamper or mismatch: {0}")]
    AuditTamperDetected(String),

    #[error("invalid Cold chunk header: {0}")]
    InvalidColdHeader(String),

    #[error("audit chain or security layer error: {0}")]
    Security(#[from] ares_core_types::error::AresCoreError),

    #[error("backend error: {0}")]
    Backend(String),
}
