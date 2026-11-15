//! Typed error domain of `ares-causal-graph` (Block I, Phases 18-20).
//!
//! Every fallible operation of the `ARES-HyperGraph` layers (Welford longitudinal
//! compaction, 16-byte evidence descriptors, unified dataset graph ingestion and
//! `graphify` export) returns `Result<_, CausalGraphError>`. No production path
//! panics: fallible checks propagate typed errors cleanly.

use std::path::PathBuf;
use thiserror::Error;

/// Errors raised by the causal, spatial, ontological and dataset graph layers.
#[derive(Debug, Error)]
pub enum CausalGraphError {
    /// A Martian Sol index exceeds the preallocated mission capacity.
    #[error("sol {sol} exceeds the preallocated mission capacity of {capacity} sols")]
    MissionCapacityExceeded { sol: u32, capacity: u32 },

    /// A Martian Sol was observed out of chronological order.
    #[error("sol {sol} is older than the last compacted sol {last_sol}")]
    NonMonotonicSol { sol: u32, last_sol: u32 },

    /// A numeric argument is non-finite or outside its admissible domain.
    #[error("invalid argument `{name}`: {reason}")]
    InvalidArgument { name: &'static str, reason: String },

    /// A 16-byte evidence descriptor failed its CRC-8 integrity check.
    #[error("evidence descriptor CRC-8 mismatch: stored 0x{stored:02x}, computed 0x{computed:02x}")]
    DescriptorCrcMismatch { stored: u8, computed: u8 },

    /// Filesystem I/O failure while reading a dataset or writing an export.
    #[error("I/O error on `{path}`: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// A CSV file is malformed (missing header column, bad row, etc.).
    #[error("CSV parse error in `{file}` line {line}: {reason}")]
    CsvParse {
        file: String,
        line: usize,
        reason: String,
    },

    /// JSON serialization failure during the `graphify` export.
    #[error("JSON serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),

    /// A node identifier or keyword is not present in the graph.
    #[error("unknown graph node `{0}`")]
    UnknownNode(String),

    /// No undirected path connects the two requested nodes.
    #[error("no path between `{from}` and `{to}`")]
    NoPath { from: String, to: String },

    /// An ontology CURIE does not match its declared prefix grammar.
    #[error("malformed ontology CURIE `{0}`")]
    MalformedCurie(String),

    /// SHA-256 checksum verification failed against a dataset MANIFEST.json.
    #[error("manifest SHA-256 mismatch for `{path}`: expected {expected}, computed {computed}")]
    ManifestChecksumMismatch {
        path: PathBuf,
        expected: String,
        computed: String,
    },

    /// A `.parquet` dataset was encountered without `--features parquet-ingest` support.
    #[error("parquet ingestion requested for `{path}` without `parquet-ingest` support enabled")]
    ParquetFeatureDisabled { path: PathBuf },

    /// A columnar or tabular dataset record failed structural parsing.
    #[error("columnar parse error in `{file}`: {reason}")]
    ColumnarParse { file: String, reason: String },
}

impl CausalGraphError {
    /// Wraps an `std::io::Error` with the offending path.
    #[inline]
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}
