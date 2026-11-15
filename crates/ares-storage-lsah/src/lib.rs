#![forbid(unsafe_code)]

//! `ares-storage-lsah` — Block M Phase 35 (`M1`, GitHub Issue #26).
//!
//! 3-Tier Lifetime Surveillance of Astronaut Health (LSAH) Persistence Engine:
//! 1. Hot Tier (RAM): Zero-post-init-allocation 256-byte cache-aligned `HotRingBuffer`
//!    + wait-free double-buffered `WarmStagingSwapBuffer`.
//! 2. Warm Tier (Local SSD): Modular `WarmColumnarVectorBackend` with default
//!    `ArrowIpcZstdHnswBackend` (Arrow 58.4.0 IPC v2 + Zstd + deterministic HNSW)
//!    and optional `--features lancedb-warm` (`LanceDbEmbeddedWarmBackend`).
//! 3. Cold Tier (AEAD DSN Archive): `ChaCha20-Poly1305` chunks with persisted monotonic
//!    96-bit nonces, bidirectional `Sha256AuditLogger` AAD binding, and priority DSN outbox.

pub mod cold_aead_archive;
pub mod config;
pub mod dsn_outbox;
pub mod error;
pub mod flusher;
pub mod hnsw_index;
pub mod hot_ring;
pub mod pocus_signature;
pub mod privacy_query;
pub mod schema;
pub mod warm_arrow_ipc;
pub mod warm_lancedb;
pub mod warm_trait;

pub use cold_aead_archive::{
    COLD_FORMAT_VERSION_LEGACY_V1, COLD_FORMAT_VERSION_V2, COLD_HEADER_BYTES, ColdChunkHeader,
    ColdSealResult, ColdTierArchiver, OpenedColdChunk,
};
pub use config::{
    CrcAlgorithmUsed, LsahStorageConfig, atomic_write_bytes, compute_crc32c,
    validate_airgapped_lsah_dir, verify_crc32c_with_v1_ieee_fallback,
};
pub use dsn_outbox::{DsnDownlinkOutbox, DsnPriorityTier, OutboxDescriptor};
pub use error::LsahStorageError;
pub use flusher::{AsyncWarmBatchFlusherHandle, flush_staging_synchronously};
pub use hnsw_index::{HnswFilter, HnswNode, HnswVectorIndex};
pub use hot_ring::{
    GATE_ANTICOAG_LOCK, GATE_LBNP_VENT, GATE_MARTIAN_GAI_LOCK, HotLsahSlot, HotRingBuffer,
    PROVENANCE_HARDWARE_EDGE, PROVENANCE_PHYSIONET_BIDMC, PROVENANCE_SCENARIO_OVERLAY,
    QUALITY_BEAT_INTERVALS_NOT_AVAILABLE, QUALITY_LOW_SQI, VALID_HR_BPM, VALID_PULSE_BPM,
    VALID_RADAR_CSI, VALID_RESP_RPM, VALID_RMSSD_MS, VALID_SBP_DBP_MMHG, VALID_SPO2_PCT,
    VALID_VOCAL_BIOMARKERS, VALIDATION_CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW,
    VALIDATION_ILLUSTRATIVE_UNVALIDATED, VALIDATION_INTERNALLY_BENCHMARKED_TERRESTRIAL,
    WarmStagingSwapBuffer, WelfordEmergencySummary,
};
pub use pocus_signature::{
    PocusEmbeddingOrigin, PocusHemodynamicContext, PocusSignatureRecord,
    extract_pocus_feature_vector, synthesize_procedural_ijv_bmode,
};
pub use privacy_query::{
    HotTelemetryView, LsahAccessRole, project_hot_slots_for_role, project_record_batches_for_role,
};
pub use schema::{
    lsah_pocus_signatures_schema, lsah_telemetry_schema, pocus_records_to_record_batch,
    slots_to_record_batch,
};
pub use warm_arrow_ipc::{
    ArrowIpcZstdHnswBackend, WARM_MANIFEST_FORMAT_VERSION_LEGACY_V1,
    WARM_MANIFEST_FORMAT_VERSION_V2, WarmRecoveryReport,
};
pub use warm_lancedb::LANCEDB_WARM_COMPILED;
pub use warm_trait::{
    PocusSimilarityHit, PocusSimilarityQuery, WarmColumnarVectorBackend, WarmSegmentMeta,
};

use ares_core_types::security::MedOpsAuditLogger;
use ares_core_types::telemetry::TelemetryPacket;
use ares_security_privacy::{EphemeralDsnKey, Sha256AuditLogger};
use arrow_array::RecordBatch;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

/// Aggregate health & occupancy telemetry for `/api/lsah/status`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LsahStorageStatusDto {
    pub active_backend: String,
    pub hot_frames_occupied: usize,
    pub hot_capacity_frames: usize,
    pub total_pushed_frames: u64,
    pub warm_segments_committed: usize,
    pub warm_compressed_bytes: u64,
    pub pocus_vectors_indexed: usize,
    pub warm_coalesced_frames: u64,
    pub cold_highest_chunk_seq: u64,
    pub dsn_outbox_pending: usize,
    pub warm_pending_rows: usize,
    pub warm_flush_failures: u64,
}

/// Compact FastMCP Context-Mode status payload (`<= 600` bytes).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastMcpLsahStatusCompact {
    pub backend: String,
    pub hot_frames: usize,
    pub warm_segments: usize,
    pub pocus_vectors: usize,
    pub cold_chunks: u64,
    pub dsn_pending: usize,
    pub audit_head_prefix: String,
}

/// Compact FastMCP Context-Mode POCUS ANN match (`<= 600` bytes across top-3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastMcpPocusMatchCompact {
    pub sol: u16,
    pub cos_sim: f32,
    pub d_csa: f64,
    pub d_tau: f64,
    pub origin: String,
    pub gate1_locked: bool,
}

/// Compact FastMCP Context-Mode POCUS search response (`<= 600` bytes).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastMcpPocusSearchCompact {
    pub validation: String,
    pub matches: Vec<FastMcpPocusMatchCompact>,
}

/// Unified 3-Tier LSAH Persistence Engine facade.
pub struct LsahStorageEngine {
    config: LsahStorageConfig,
    hot_ring: Arc<HotRingBuffer>,
    staging: Arc<WarmStagingSwapBuffer>,
    warm: Arc<dyn WarmColumnarVectorBackend>,
    cold: Mutex<ColdTierArchiver>,
    outbox: Arc<DsnDownlinkOutbox>,
    audit_logger: Arc<Sha256AuditLogger>,
    flusher: Mutex<Option<AsyncWarmBatchFlusherHandle>>,
}

impl LsahStorageEngine {
    /// Opens the default `ArrowIpcZstdHnswBackend` 3-tier engine and returns crash-recovery details.
    pub fn open_with_report(
        config: LsahStorageConfig,
    ) -> Result<(Self, WarmRecoveryReport), LsahStorageError> {
        config.validate()?;
        let (backend, report) = ArrowIpcZstdHnswBackend::open_with_report(&config)?;
        let engine = Self::open_with_backend(config, Arc::new(backend))?;
        Ok((engine, report))
    }

    /// Opens the default 3-tier engine, discarding the recovery report.
    pub fn open(config: LsahStorageConfig) -> Result<Self, LsahStorageError> {
        let (engine, _) = Self::open_with_report(config)?;
        Ok(engine)
    }

    /// Opens the 3-tier engine with a caller-supplied `WarmColumnarVectorBackend`
    /// (such as `LanceDbEmbeddedWarmBackend` or a latency-injected mock backend).
    pub fn open_with_backend(
        config: LsahStorageConfig,
        warm: Arc<dyn WarmColumnarVectorBackend>,
    ) -> Result<Self, LsahStorageError> {
        let root = config.validate()?;
        let hot_ring = Arc::new(HotRingBuffer::new(config.hot_capacity_frames));
        let staging = Arc::new(WarmStagingSwapBuffer::new(config.warm_batch_size));
        let cold = ColdTierArchiver::open(&root, config.key_epoch_id, config.zstd_cold_level)?;
        let outbox = Arc::new(DsnDownlinkOutbox::open(&root)?);
        let audit_logger = Arc::new(Sha256AuditLogger::new());

        Ok(Self {
            config,
            hot_ring,
            staging,
            warm,
            cold: Mutex::new(cold),
            outbox,
            audit_logger,
            flusher: Mutex::new(None),
        })
    }

    /// Starts the background Tokio Warm batch flusher if not already running.
    pub fn start_background_flusher(&self) {
        let mut guard = self.flusher.lock();
        if guard.is_none() {
            let handle = AsyncWarmBatchFlusherHandle::spawn(
                Arc::clone(&self.staging),
                Arc::clone(&self.warm),
                Duration::from_millis(self.config.warm_flush_interval_ms),
            );
            *guard = Some(handle);
        }
    }

    pub fn max_sequence_id(&self) -> u64 {
        self.warm.max_sequence_id()
    }

    /// Stops the background Tokio Warm batch flusher and drains remaining staged slots.
    pub async fn stop_background_flusher(&self) -> Result<(), LsahStorageError> {
        let handle = self.flusher.lock().take();
        if let Some(h) = handle {
            return h.shutdown(&self.staging).await;
        }
        let warm = Arc::clone(&self.warm);
        tokio::task::spawn_blocking(move || warm.flush_and_sync()).await
            .map_err(|e| LsahStorageError::Backend(e.to_string()))?
    }

    /// Zero-allocation 20 Hz ingestion entry point: inserts into `HotRingBuffer` and stages
    /// into `WarmStagingSwapBuffer` without waiting on disk I/O.
    #[inline]
    pub fn push_slot(&self, slot: HotLsahSlot) -> u64 {
        let total = self.hot_ring.push(slot);
        self.staging.push_for_warm_flush(&slot);
        total
    }

    /// Converts and ingests a `TelemetryPacket` into Hot RAM and Warm swap staging.
    pub fn push_telemetry_packet(
        &self,
        sequence_id: u64,
        timestamp_unix_ms: i64,
        mission_sol: u16,
        packet: &TelemetryPacket,
    ) -> u64 {
        let slot =
            HotLsahSlot::from_telemetry_packet(sequence_id, timestamp_unix_ms, mission_sol, packet);
        self.push_slot(slot)
    }

    /// Synchronously flushes any staged slots (including partial banks) to the Warm backend.
    pub fn flush_warm_now(&self) -> Result<Option<WarmSegmentMeta>, LsahStorageError> {
        flush_staging_synchronously(&self.staging, self.warm.as_ref(), true)
    }

    /// Upserts an episodic POCUS ultrasound signature into Warm storage + HNSW index.
    pub fn upsert_pocus_signature(
        &self,
        record: &PocusSignatureRecord,
    ) -> Result<u64, LsahStorageError> {
        self.warm.upsert_pocus_signature(record)
    }

    /// Executes O(log N) ANN similarity search for POCUS longitudinal comparison.
    pub fn search_similar_pocus(
        &self,
        query: &PocusSimilarityQuery,
    ) -> Result<Vec<PocusSimilarityHit>, LsahStorageError> {
        self.warm.search_similar_pocus(query)
    }

    /// Queries the Hot-tier ring buffer with `[V1 3003]` role-based vocal masking.
    pub fn query_hot_window(
        &self,
        max_frames: usize,
        role: LsahAccessRole,
    ) -> Result<Vec<HotTelemetryView>, LsahStorageError> {
        let slots = self.hot_ring.snapshot_recent(max_frames);
        project_hot_slots_for_role(&slots, role, &self.audit_logger)
    }

    /// Queries Warm-tier Arrow `RecordBatch`es for a crew member and Sol range with `[V1 3003]` masking.
    pub fn query_warm_sol_range(
        &self,
        crew_id: &str,
        sol_start: u16,
        sol_end: u16,
        role: LsahAccessRole,
    ) -> Result<Vec<RecordBatch>, LsahStorageError> {
        let raw = self.warm.read_telemetry_sol_range(crew_id, sol_start, sol_end)?;
        project_record_batches_for_role(&raw, role, &self.audit_logger, "WARM")
    }

    /// Seals all Warm telemetry batches for `mission_sol` into a Cold `ChaCha20-Poly1305` archive
    /// chunk linked to `Sha256AuditLogger`, and enqueues the chunk in `DsnDownlinkOutbox`.
    pub fn seal_sol_to_cold(
        &self,
        mission_sol: u16,
        key: &EphemeralDsnKey,
        priority_tier: DsnPriorityTier,
        created_unix_ms: i64,
    ) -> Result<ColdSealResult, LsahStorageError> {
        let batches = self
            .warm
            .read_telemetry_sol_range("*", mission_sol, mission_sol)?;
        let res = {
            let mut cold_guard = self.cold.lock();
            cold_guard.seal_sol_to_cold_archive(
                mission_sol,
                &batches,
                key,
                &self.audit_logger,
                None,
                created_unix_ms,
            )?
        };
        self.outbox.enqueue(OutboxDescriptor {
            chunk_seq: res.header.chunk_seq,
            mission_sol,
            priority_tier,
            chunk_filename: res.chunk_filename.clone(),
            payload_bytes: res.total_file_bytes,
            created_unix_ms,
            acknowledged: false,
        })?;
        Ok(res)
    }

    /// Opens and verifies a Cold AEAD archive chunk and applies `[V1 3003]` role projection.
    pub fn open_cold_chunk(
        &self,
        chunk_path: &Path,
        key: &EphemeralDsnKey,
        role: LsahAccessRole,
    ) -> Result<OpenedColdChunk, LsahStorageError> {
        let mut opened = ColdTierArchiver::open_cold_archive_chunk_verified(
            chunk_path,
            key,
            &self.audit_logger,
        )?;
        opened.batches = project_record_batches_for_role(
            &opened.batches,
            role,
            &self.audit_logger,
            "COLD",
        )?;
        Ok(opened)
    }

    /// Returns current 3-tier status metrics.
    pub fn status(&self) -> LsahStorageStatusDto {
        let (warm_segments, warm_bytes, pocus_vectors) = self.warm.warm_stats();
        let cold_highest_chunk_seq = self.cold.lock().highest_sealed_chunk_seq();
        LsahStorageStatusDto {
            active_backend: self.warm.backend_name().to_string(),
            hot_frames_occupied: self.hot_ring.len(),
            hot_capacity_frames: self.hot_ring.capacity(),
            total_pushed_frames: self.hot_ring.total_pushed(),
            warm_segments_committed: warm_segments,
            warm_compressed_bytes: warm_bytes,
            pocus_vectors_indexed: pocus_vectors,
            warm_coalesced_frames: self.staging.warm_coalesced_frames(),
            cold_highest_chunk_seq,
            dsn_outbox_pending: self.outbox.pending_count(),
            warm_pending_rows: self.staging.pending_rows(),
            warm_flush_failures: self.flusher.lock().as_ref().map_or(0, |f| f.failures()),
        }
    }

    /// Builds a compact FastMCP Context-Mode status payload (`<= 600 bytes` JSON).
    pub fn compact_mcp_status(&self) -> FastMcpLsahStatusCompact {
        let st = self.status();
        let head_prefix = self
            .audit_logger
            .records()
            .ok()
            .and_then(|r| r.last().map(|rec| rec.current_hash_hex.chars().take(12).collect()))
            .unwrap_or_else(|| "000000000000".to_string());

        FastMcpLsahStatusCompact {
            backend: st.active_backend,
            hot_frames: st.hot_frames_occupied,
            warm_segments: st.warm_segments_committed,
            pocus_vectors: st.pocus_vectors_indexed,
            cold_chunks: st.cold_highest_chunk_seq,
            dsn_pending: st.dsn_outbox_pending,
            audit_head_prefix: head_prefix,
        }
    }

    /// Builds a compact FastMCP Context-Mode top-3 POCUS similarity payload (`<= 600 bytes` JSON).
    pub fn compact_mcp_pocus_search(
        &self,
        mut query: PocusSimilarityQuery,
    ) -> Result<FastMcpPocusSearchCompact, LsahStorageError> {
        query.top_k = query.top_k.min(3);
        let hits = self.search_similar_pocus(&query)?;
        let matches = hits
            .into_iter()
            .map(|h| FastMcpPocusMatchCompact {
                sol: h.mission_sol,
                cos_sim: (h.cosine_similarity * 1000.0).round() / 1000.0,
                d_csa: (h.delta_ijv_csa_cm2 * 1000.0).round() / 1000.0,
                d_tau: (h.delta_tau_w_dyn_cm2 * 1000.0).round() / 1000.0,
                origin: h.embedding_origin.compact_code().to_string(),
                gate1_locked: h.advisory_only_gate1_locked,
            })
            .collect();

        Ok(FastMcpPocusSearchCompact {
            validation: "ILLUSTRATIVE_UNVALIDATED".to_string(),
            matches,
        })
    }

    pub fn hot_ring(&self) -> &HotRingBuffer {
        &self.hot_ring
    }

    pub fn staging(&self) -> &WarmStagingSwapBuffer {
        &self.staging
    }

    pub fn outbox(&self) -> &DsnDownlinkOutbox {
        &self.outbox
    }

    pub fn audit_logger(&self) -> &Sha256AuditLogger {
        &self.audit_logger
    }

    pub fn append_audit_event(
        &self,
        role: ares_core_types::security::CrewRole,
        action: &str,
    ) -> Result<ares_core_types::security::AuditChainRecord, LsahStorageError> {
        Ok(self.audit_logger.append_audit_event(role, action)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cold_aead_archive::{COLD_CODEC_ARROW_IPC_ZSTD_L6, COLD_MAGIC};
    use crate::config::{compute_storage_crc32_ieee, compute_storage_crc32c_castagnoli};
    use crate::hot_ring::{VALID_HR_BPM, VALID_PULSE_BPM, VALID_RESP_RPM, VALID_SPO2_PCT};
    use std::fs;
    use tempfile::TempDir;

    fn make_slot(seq: u64, sol: u16) -> HotLsahSlot {
        let mut s = HotLsahSlot::zeroed();
        s.sequence_id = seq;
        s.timestamp_unix_ms = 1_760_000_000_000 + (seq as i64) * 1_000;
        s.mission_sol = sol;
        s.set_crew_id("ARES-CDR-01");
        s.hr_bpm = 72.0;
        s.pulse_bpm = 71.5;
        s.resp_rpm = 14.0;
        s.spo2_pct = 98.5;
        s.validity_mask = VALID_HR_BPM | VALID_PULSE_BPM | VALID_RESP_RPM | VALID_SPO2_PCT;
        s.update_crc32c();
        s
    }

    #[test]
    fn castagnoli_v2_and_v1_ieee_fallback_verification() {
        let data = b"123456789";
        let castagnoli = compute_storage_crc32c_castagnoli(data);
        let ieee = compute_storage_crc32_ieee(data);
        assert_eq!(castagnoli, 0xE306_9283);
        assert_eq!(ieee, 0xCBF4_3926);
        assert_eq!(compute_crc32c(data), castagnoli);

        assert_eq!(
            verify_crc32c_with_v1_ieee_fallback(data, castagnoli, false).expect("v2 ok"),
            CrcAlgorithmUsed::CastagnoliV2
        );
        assert!(verify_crc32c_with_v1_ieee_fallback(data, ieee, false).is_err());
        assert_eq!(
            verify_crc32c_with_v1_ieee_fallback(data, ieee, true).expect("v1 fallback ok"),
            CrcAlgorithmUsed::LegacyIeeeV1
        );
        assert!(verify_crc32c_with_v1_ieee_fallback(data, 0xDEAD_BEEF, true).is_err());
    }

    #[test]
    fn cold_chunk_and_watermark_v2_strict_and_v1_legacy_fallback() {
        let nonce = ColdChunkHeader::build_deterministic_nonce(1, 3, 42);
        let mut v2 = ColdChunkHeader {
            magic: *COLD_MAGIC,
            format_version: u16::from(COLD_FORMAT_VERSION_V2),
            compression_codec: COLD_CODEC_ARROW_IPC_ZSTD_L6,
            key_epoch_id: 1,
            mission_sol: 3,
            chunk_seq: 42,
            nonce_96: nonce,
            audit_seq: 1,
            audit_chain_hash_ascii: [b'a'; 64],
            uncompressed_arrow_bytes: 100,
            ciphertext_plus_tag_bytes: 64,
            row_count: 5,
            created_unix_ms: 1_760_000_000_000,
            header_crc32c: 0,
        };
        let mut raw_v2 = v2.to_bytes();
        assert!(ColdChunkHeader::from_bytes(&raw_v2).is_ok());

        // v2 must reject IEEE CRC
        let ieee_v2 = compute_storage_crc32_ieee(&raw_v2[0..140]);
        raw_v2[140..144].copy_from_slice(&ieee_v2.to_le_bytes());
        assert!(ColdChunkHeader::from_bytes(&raw_v2).is_err());

        // v1 header with IEEE CRC must be accepted, while corrupt CRC is rejected
        let mut raw_v1 = v2.to_bytes();
        raw_v1[8..10].copy_from_slice(&u16::from(COLD_FORMAT_VERSION_LEGACY_V1).to_le_bytes());
        let ieee_v1 = compute_storage_crc32_ieee(&raw_v1[0..140]);
        raw_v1[140..144].copy_from_slice(&ieee_v1.to_le_bytes());
        let parsed_v1 = ColdChunkHeader::from_bytes(&raw_v1).expect("v1 legacy header ok");
        assert_eq!(parsed_v1.format_version, u16::from(COLD_FORMAT_VERSION_LEGACY_V1));

        raw_v1[140..144].copy_from_slice(&0xDEAD_BEEFu32.to_le_bytes());
        assert!(ColdChunkHeader::from_bytes(&raw_v1).is_err());

        // v1 cold_watermark.json (without `version`) with IEEE CRC loads cleanly
        let tmp = TempDir::new().expect("tempdir");
        let cold_dir = tmp.path().join("cold");
        fs::create_dir_all(&cold_dir).expect("create cold dir");
        let wm_payload = r#"{"key_epoch_id":1,"highest_sealed_chunk_seq":7}"#;
        let wm_crc = compute_storage_crc32_ieee(wm_payload.as_bytes());
        let wm_json = format!(r#"{{"payload":{wm_payload},"crc32c":{wm_crc}}}"#);
        fs::write(cold_dir.join("cold_watermark.json"), wm_json).expect("write v1 watermark");

        let archiver = ColdTierArchiver::open(tmp.path(), 1, 6).expect("open v1 watermark");
        assert_eq!(archiver.highest_sealed_chunk_seq(), 7);
    }

    #[test]
    fn warm_v2_manifest_orphan_gc_and_v1_upgrade() {
        let tmp = TempDir::new().expect("tempdir");
        let cfg = LsahStorageConfig::with_root_dir(tmp.path());
        let backend = ArrowIpcZstdHnswBackend::open(&cfg).expect("open warm");
        let batch = slots_to_record_batch(&[make_slot(1, 1)]).expect("batch");
        backend.append_telemetry_batch(&batch).expect("append");
        drop(backend);

        // Verify v2 manifest fields on disk
        let manifest_path = tmp.path().join("MANIFEST.lsah.json");
        let manifest_str = fs::read_to_string(&manifest_path).expect("read manifest");
        let v: serde_json::Value = serde_json::from_str(&manifest_str).expect("parse manifest");
        assert_eq!(
            v.get("format_version").and_then(|x| x.as_u64()),
            Some(u64::from(WARM_MANIFEST_FORMAT_VERSION_V2))
        );
        assert!(v.get("canonical_entries_json").and_then(|x| x.as_str()).is_some());

        // Plant orphaned segment and stale .tmp file in warm_dir
        let warm_dir = tmp.path().join("warm").join("arrow_ipc");
        let orphan_path = warm_dir.join("sol_0099_seg_00000099.arrow.zst");
        let tmp_path = warm_dir.join("sol_0099_seg_00000099.arrow.zst.tmp");
        fs::write(&orphan_path, b"orphan").expect("write orphan");
        fs::write(&tmp_path, b"stale_tmp").expect("write tmp");

        let (backend2, report) =
            ArrowIpcZstdHnswBackend::open_with_report(&cfg).expect("reopen with orphan gc");
        assert_eq!(report.valid_segments_recovered, 1);
        assert_eq!(report.orphaned_segments_reclaimed, 1);
        assert_eq!(report.purged_tmp_files.len(), 1);
        assert!(!orphan_path.exists());
        assert!(!tmp_path.exists());
        assert_eq!(backend2.committed_segments().len(), 1);
    }
}
