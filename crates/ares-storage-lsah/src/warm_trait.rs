use crate::error::LsahStorageError;
use crate::pocus_signature::{PocusEmbeddingOrigin, PocusSignatureRecord};
use arrow_array::RecordBatch;
use serde::{Deserialize, Serialize};

/// Metadata describing a committed Warm-tier columnar segment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WarmSegmentMeta {
    pub segment_id: u64,
    pub mission_sol: u16,
    #[serde(default)]
    pub min_mission_sol: Option<u16>,
    #[serde(default)]
    pub max_mission_sol: Option<u16>,
    pub relative_path: String,
    pub row_count: usize,
    pub compressed_bytes: u64,
    pub crc32c: u32,
    pub min_sequence_id: u64,
    pub max_sequence_id: u64,
}

/// Query request for O(log N) POCUS longitudinal similarity search (`Sol 180` vs `Sol 1`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PocusSimilarityQuery {
    pub crew_id: Option<String>,
    pub anatomical_target_uberon: Option<String>,
    pub sol_min: Option<u16>,
    pub sol_max: Option<u16>,
    pub top_k: usize,
    pub query_vector: Vec<f32>,
    pub current_ijv_csa_cm2: f64,
    pub current_tau_w_dyn_cm2: f64,
}

/// Similarity match returned by `WarmColumnarVectorBackend::search_similar_pocus`.
/// Enforces Issue #12 provenance and Hard Safety Gate 1 immutability (`advisory_only_gate1_locked`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PocusSimilarityHit {
    pub signature_id: u64,
    pub mission_sol: u16,
    pub crew_id: String,
    pub anatomical_target_uberon: String,
    pub cosine_similarity: f32,
    pub delta_ijv_csa_cm2: f64,
    pub delta_tau_w_dyn_cm2: f64,
    pub historical_pocus_p_thrombus: f32,
    pub embedding_origin: PocusEmbeddingOrigin,
    pub validation_status: String,
    /// Hard Safety Gate 1 invariant: always `true`; ANN similarity can never clear anticoagulation lock.
    pub advisory_only_gate1_locked: bool,
}

/// Backend-agnostic Warm-tier storage trait supporting `ArrowIpcZstdHnswBackend` (default)
/// and `LanceDbEmbeddedWarmBackend` (`--features lancedb-warm`).
pub trait WarmColumnarVectorBackend: Send + Sync {
    fn backend_name(&self) -> &'static str;

    fn append_telemetry_batch(
        &self,
        batch: &RecordBatch,
    ) -> Result<WarmSegmentMeta, LsahStorageError>;

    fn read_telemetry_sol_range(
        &self,
        crew_id: &str,
        sol_start: u16,
        sol_end: u16,
    ) -> Result<Vec<RecordBatch>, LsahStorageError>;

    fn upsert_pocus_signature(
        &self,
        record: &PocusSignatureRecord,
    ) -> Result<u64, LsahStorageError>;

    fn search_similar_pocus(
        &self,
        query: &PocusSimilarityQuery,
    ) -> Result<Vec<PocusSimilarityHit>, LsahStorageError>;

    fn flush_and_sync(&self) -> Result<(), LsahStorageError>;

    /// Returns total committed Warm telemetry segments and total compressed bytes.
    fn warm_stats(&self) -> (usize, u64, usize);

    /// Highest durably committed telemetry sequence, for restart-safe numbering.
    fn max_sequence_id(&self) -> u64 { 0 }
}
