use crate::config::{
    CrcAlgorithmUsed, LsahStorageConfig, atomic_write_bytes, compute_crc32c,
    validate_airgapped_lsah_dir, verify_crc32c_with_v1_ieee_fallback,
};
use crate::error::LsahStorageError;
use crate::hnsw_index::{HnswFilter, HnswVectorIndex};
use crate::pocus_signature::PocusSignatureRecord;
use crate::schema::pocus_records_to_record_batch;
use crate::warm_trait::{
    PocusSimilarityHit, PocusSimilarityQuery, WarmColumnarVectorBackend, WarmSegmentMeta,
};
use arrow_array::cast::AsArray;
use arrow_array::types::{UInt16Type, UInt64Type};
use arrow_array::{BooleanArray, RecordBatch};
use arrow_ipc::CompressionType;
use arrow_ipc::reader::FileReader;
use arrow_ipc::writer::{FileWriter, IpcWriteOptions};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub const WARM_MANIFEST_FORMAT_VERSION_LEGACY_V1: u8 = 1;
pub const WARM_MANIFEST_FORMAT_VERSION_V2: u8 = 2;

fn default_manifest_v1() -> u8 {
    WARM_MANIFEST_FORMAT_VERSION_LEGACY_V1
}

/// Summary of crash-recovery actions taken when opening `ArrowIpcZstdHnswBackend`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WarmRecoveryReport {
    pub purged_tmp_files: Vec<String>,
    pub valid_segments_recovered: usize,
    pub quarantined_corrupt_segments: Vec<String>,
    pub pocus_signatures_recovered: usize,
    #[serde(default)]
    pub orphaned_segments_reclaimed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyWarmSegmentMeta {
    segment_id: u64,
    mission_sol: u16,
    relative_path: String,
    row_count: usize,
    compressed_bytes: u64,
    crc32c: u32,
    min_sequence_id: u64,
    max_sequence_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyManifestPayload {
    next_segment_id: u64,
    pocus_dim: usize,
    segments: Vec<LegacyWarmSegmentMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacySignedManifest {
    payload: LegacyManifestPayload,
    crc32c: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct ManifestPayload {
    next_segment_id: u64,
    pocus_dim: usize,
    segments: Vec<WarmSegmentMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SignedManifest {
    #[serde(default = "default_manifest_v1")]
    format_version: u8,
    payload: ManifestPayload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    canonical_entries_json: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    legacy_ieee_segment_ids: Vec<u64>,
    crc32c: u32,
}

struct WarmArrowState {
    next_segment_id: u64,
    segments: Vec<WarmSegmentMeta>,
    legacy_ieee_segment_ids: HashSet<u64>,
    pocus_records: HashMap<u64, PocusSignatureRecord>,
    hnsw: HnswVectorIndex,
}

/// Default offline Warm backend: Apache Arrow IPC File v2 + Zstd compression + deterministic pure-Rust HNSW.
pub struct ArrowIpcZstdHnswBackend {
    warm_dir: PathBuf,
    manifest_path: PathBuf,
    pocus_arrow_path: PathBuf,
    hnsw_bin_path: PathBuf,
    pocus_dim: usize,
    state: Mutex<WarmArrowState>,
}

impl ArrowIpcZstdHnswBackend {
    /// Opens or initializes the Warm Arrow IPC + HNSW store, purging uncommitted `.tmp` artifacts
    /// and quarantining any CRC-32C-corrupted segment without panicking.
    pub fn open_with_report(
        cfg: &LsahStorageConfig,
    ) -> Result<(Self, WarmRecoveryReport), LsahStorageError> {
        let root = cfg.validate()?;
        let root = validate_airgapped_lsah_dir(&root)?;
        let warm_dir = root.join("warm").join("arrow_ipc");
        fs::create_dir_all(&warm_dir)?;

        let manifest_path = root.join("MANIFEST.lsah.json");
        let pocus_arrow_path = warm_dir.join(format!("pocus_signatures_d{}.arrow.zst", cfg.pocus_embedding_dim));
        let hnsw_bin_path = warm_dir.join(format!("pocus_hnsw_d{}.hnsw.bin", cfg.pocus_embedding_dim));

        let mut report = WarmRecoveryReport::default();

        // 1) Purge uncommitted crash-leftover `.tmp` files in `warm_dir` and root.
        for dir in [&warm_dir, &root] {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|name| name.ends_with(".tmp"))
                    {
                        let _ = fs::remove_file(&path);
                        report.purged_tmp_files.push(path.display().to_string());
                    }
                }
            }
        }

        // 2) Load and CRC-verify manifest if present.
        let mut next_segment_id = 1u64;
        let mut recovered_segments = Vec::new();
        let mut legacy_ieee_segment_ids = HashSet::new();
        if manifest_path.exists() {
            let raw = fs::read(&manifest_path)?;
            let (next_id, segments, allow_legacy_for_manifest, manifest_legacy_ids) =
                match serde_json::from_slice::<SignedManifest>(&raw) {
                    Ok(signed) => {
                        if signed.format_version >= WARM_MANIFEST_FORMAT_VERSION_V2 {
                            let raw_json = signed.canonical_entries_json.as_deref().ok_or_else(|| {
                                LsahStorageError::InvalidConfig(
                                    "v2 warm manifest missing canonical_entries_json".to_string(),
                                )
                            })?;
                            if let Err(err) = verify_crc32c_with_v1_ieee_fallback(
                                raw_json.as_bytes(),
                                signed.crc32c,
                                false,
                            ) {
                                return Err(match err {
                                    LsahStorageError::CrcMismatch { expected, computed, .. } => {
                                        LsahStorageError::CrcMismatch {
                                            artifact: manifest_path.display().to_string(),
                                            expected,
                                            computed,
                                        }
                                    }
                                    other => other,
                                });
                            }
                            let canonical_payload: ManifestPayload = serde_json::from_str(raw_json)?;
                            if canonical_payload != signed.payload {
                                return Err(LsahStorageError::InvalidConfig(
                                    "v2 warm manifest payload mismatch against canonical_entries_json"
                                        .to_string(),
                                ));
                            }
                            let leg_set: HashSet<u64> =
                                signed.legacy_ieee_segment_ids.into_iter().collect();
                            (
                                signed.payload.next_segment_id,
                                signed.payload.segments,
                                false,
                                leg_set,
                            )
                        } else if signed.format_version == WARM_MANIFEST_FORMAT_VERSION_LEGACY_V1 {
                            let payload_bytes = serde_json::to_vec(&signed.payload)?;
                            if verify_crc32c_with_v1_ieee_fallback(
                                &payload_bytes,
                                signed.crc32c,
                                true,
                            )
                            .is_ok()
                            {
                                (
                                    signed.payload.next_segment_id,
                                    signed.payload.segments,
                                    true,
                                    HashSet::new(),
                                )
                            } else {
                                // Fallback: verify against legacy schema (v1 without min/max sol bounds)
                                let legacy: LegacySignedManifest = serde_json::from_slice(&raw)?;
                                let leg_bytes = serde_json::to_vec(&legacy.payload)?;
                                if let Err(err) = verify_crc32c_with_v1_ieee_fallback(
                                    &leg_bytes,
                                    legacy.crc32c,
                                    true,
                                ) {
                                    return Err(match err {
                                        LsahStorageError::CrcMismatch {
                                            expected, computed, ..
                                        } => LsahStorageError::CrcMismatch {
                                            artifact: manifest_path.display().to_string(),
                                            expected,
                                            computed,
                                        },
                                        other => other,
                                    });
                                }
                                let segs = legacy
                                    .payload
                                    .segments
                                    .into_iter()
                                    .map(|s| WarmSegmentMeta {
                                        segment_id: s.segment_id,
                                        mission_sol: s.mission_sol,
                                        min_mission_sol: None,
                                        max_mission_sol: None,
                                        relative_path: s.relative_path,
                                        row_count: s.row_count,
                                        compressed_bytes: s.compressed_bytes,
                                        crc32c: s.crc32c,
                                        min_sequence_id: s.min_sequence_id,
                                        max_sequence_id: s.max_sequence_id,
                                    })
                                    .collect();
                                (legacy.payload.next_segment_id, segs, true, HashSet::new())
                            }
                        } else {
                            return Err(LsahStorageError::InvalidConfig(format!(
                                "unsupported warm manifest format_version {}",
                                signed.format_version
                            )));
                        }
                    }
                    Err(err) => return Err(LsahStorageError::Json(err)),
                };
            next_segment_id = next_id;

            for seg in segments {
                let seg_path = warm_dir.join(&seg.relative_path);
                let allow_legacy =
                    allow_legacy_for_manifest || manifest_legacy_ids.contains(&seg.segment_id);
                match Self::verify_segment_file_crc_with_fallback(
                    &seg_path,
                    seg.crc32c,
                    allow_legacy,
                ) {
                    Ok(algo) => {
                        if algo == CrcAlgorithmUsed::LegacyIeeeV1 {
                            legacy_ieee_segment_ids.insert(seg.segment_id);
                        }
                        recovered_segments.push(seg);
                    }
                    Err(_) => {
                        report.quarantined_corrupt_segments.push(seg.relative_path);
                    }
                }
            }
            report.valid_segments_recovered = recovered_segments.len();
        }

        // 2b) Orphan GC: delete any `sol_*_seg_*.arrow.zst` in `warm_dir` not referenced in manifest.
        {
            let referenced: HashSet<&str> = recovered_segments
                .iter()
                .map(|s| s.relative_path.as_str())
                .collect();
            if let Ok(entries) = fs::read_dir(&warm_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str())
                        && name.starts_with("sol_")
                        && name.contains("_seg_")
                        && name.ends_with(".arrow.zst")
                        && !referenced.contains(name)
                        && fs::remove_file(&path).is_ok()
                    {
                        report.orphaned_segments_reclaimed += 1;
                    }
                }
            }
        }

        // 3) Recover POCUS metadata sidecar + HNSW index if present.
        let pocus_meta_path = warm_dir.join(format!("pocus_records_d{}.json", cfg.pocus_embedding_dim));
        let mut pocus_records = HashMap::new();
        if pocus_meta_path.exists() {
            let raw = fs::read(&pocus_meta_path)?;
            let list: Vec<PocusSignatureRecord> = serde_json::from_slice(&raw)?;
            for rec in list {
                pocus_records.insert(rec.signature_id, rec);
            }
        }

        let hnsw = if hnsw_bin_path.exists() {
            HnswVectorIndex::load_verified(&hnsw_bin_path)?
        } else {
            let mut idx = HnswVectorIndex::new(cfg.pocus_embedding_dim)?;
            for rec in pocus_records.values() {
                idx.insert(
                    rec.signature_id,
                    rec.mission_sol,
                    rec.crew_id.clone(),
                    rec.anatomical_target_uberon.clone(),
                    rec.feature_vector.clone(),
                )?;
            }
            idx
        };
        report.pocus_signatures_recovered = pocus_records.len();

        let backend = Self {
            warm_dir,
            manifest_path,
            pocus_arrow_path,
            hnsw_bin_path,
            pocus_dim: cfg.pocus_embedding_dim,
            state: Mutex::new(WarmArrowState {
                next_segment_id,
                segments: recovered_segments,
                legacy_ieee_segment_ids,
                pocus_records,
                hnsw,
            }),
        };

        // Persist cleaned manifest if any corrupt segments were quarantined during recovery.
        if !report.quarantined_corrupt_segments.is_empty() {
            let state = backend.state.lock();
            backend.persist_manifest_locked(&state)?;
        }

        Ok((backend, report))
    }

    /// Convenience constructor discarding the recovery report.
    pub fn open(cfg: &LsahStorageConfig) -> Result<Self, LsahStorageError> {
        let (backend, _) = Self::open_with_report(cfg)?;
        Ok(backend)
    }

    /// Verifies a segment file's CRC-32C (Castagnoli) against its expected digest.
    pub fn verify_segment_file_crc(path: &Path, expected_crc: u32) -> Result<(), LsahStorageError> {
        Self::verify_segment_file_crc_with_fallback(path, expected_crc, false).map(|_| ())
    }

    /// Verifies a segment file's checksum with optional v1 IEEE 802.3 fallback.
    pub fn verify_segment_file_crc_with_fallback(
        path: &Path,
        expected_crc: u32,
        allow_legacy_ieee: bool,
    ) -> Result<CrcAlgorithmUsed, LsahStorageError> {
        let bytes = fs::read(path)?;
        verify_crc32c_with_v1_ieee_fallback(&bytes, expected_crc, allow_legacy_ieee).map_err(|err| {
            match err {
                LsahStorageError::CrcMismatch { expected, computed, .. } => {
                    LsahStorageError::CrcMismatch {
                        artifact: path.display().to_string(),
                        expected,
                        computed,
                    }
                }
                other => other,
            }
        })
    }

    fn persist_manifest_locked(&self, state: &WarmArrowState) -> Result<(), LsahStorageError> {
        let payload = ManifestPayload {
            next_segment_id: state.next_segment_id,
            pocus_dim: self.pocus_dim,
            segments: state.segments.clone(),
        };
        let canonical_json = serde_json::to_string(&payload)?;
        let crc32c = compute_crc32c(canonical_json.as_bytes());
        let mut legacy_ids: Vec<u64> = state
            .segments
            .iter()
            .filter(|s| state.legacy_ieee_segment_ids.contains(&s.segment_id))
            .map(|s| s.segment_id)
            .collect();
        legacy_ids.sort_unstable();
        let signed = SignedManifest {
            format_version: WARM_MANIFEST_FORMAT_VERSION_V2,
            payload,
            canonical_entries_json: Some(canonical_json),
            legacy_ieee_segment_ids: legacy_ids,
            crc32c,
        };
        let encoded = serde_json::to_vec_pretty(&signed)?;
        atomic_write_bytes(&self.manifest_path, &encoded)
    }

    fn encode_batch_arrow_ipc_zstd(batch: &RecordBatch) -> Result<Vec<u8>, LsahStorageError> {
        let mut buf = Vec::new();
        let options = IpcWriteOptions::default()
            .try_with_compression(Some(CompressionType::ZSTD))?;
        let mut writer = FileWriter::try_new_with_options(&mut buf, &batch.schema(), options)?;
        writer.write(batch)?;
        writer.finish()?;
        Ok(buf)
    }

    fn decode_batches_arrow_ipc(bytes: &[u8]) -> Result<Vec<RecordBatch>, LsahStorageError> {
        let reader = FileReader::try_new(Cursor::new(bytes), None)?;
        let mut out = Vec::new();
        for item in reader {
            out.push(item?);
        }
        Ok(out)
    }

    /// Returns all currently committed segment descriptors.
    pub fn committed_segments(&self) -> Vec<WarmSegmentMeta> {
        self.state.lock().segments.clone()
    }

    /// Returns the Warm directory path.
    pub fn warm_dir(&self) -> &Path {
        &self.warm_dir
    }
}

impl WarmColumnarVectorBackend for ArrowIpcZstdHnswBackend {
    fn max_sequence_id(&self) -> u64 {
        self.state.lock().segments.iter().map(|s| s.max_sequence_id).max().unwrap_or(0)
    }
    fn backend_name(&self) -> &'static str {
        "arrow-ipc-zstd-hnsw"
    }

    fn append_telemetry_batch(
        &self,
        batch: &RecordBatch,
    ) -> Result<WarmSegmentMeta, LsahStorageError> {
        if batch.num_rows() == 0 {
            return Err(LsahStorageError::InvalidConfig(
                "cannot append empty telemetry RecordBatch".to_string(),
            ));
        }

        let sol_col = batch
            .column_by_name("mission_sol")
            .ok_or_else(|| LsahStorageError::Backend("missing mission_sol column".to_string()))?
            .as_primitive::<UInt16Type>();

        let mut distinct_sols: Vec<u16> = Vec::new();
        for i in 0..sol_col.len() {
            let s = sol_col.value(i);
            if !distinct_sols.contains(&s) {
                distinct_sols.push(s);
            }
        }

        if distinct_sols.is_empty() {
            return Err(LsahStorageError::InvalidConfig(
                "cannot append empty telemetry RecordBatch".to_string(),
            ));
        }

        struct PreparedPartition {
            sol: u16,
            row_count: usize,
            min_seq: u64,
            max_seq: u64,
            encoded: Vec<u8>,
            crc32: u32,
        }

        let mut prepared = Vec::with_capacity(distinct_sols.len());

        for &sol in &distinct_sols {
            let sub_batch = if distinct_sols.len() == 1 {
                batch.clone()
            } else {
                let mask: BooleanArray = (0..sol_col.len())
                    .map(|i| Some(sol_col.value(i) == sol))
                    .collect();
                arrow_select::filter::filter_record_batch(batch, &mask)?
            };

            if sub_batch.num_rows() == 0 {
                continue;
            }

            let sub_seq_col = sub_batch
                .column_by_name("sequence_id")
                .ok_or_else(|| {
                    LsahStorageError::Backend("missing sequence_id column".to_string())
                })?
                .as_primitive::<UInt64Type>();

            let mut min_seq = u64::MAX;
            let mut max_seq = 0u64;
            for i in 0..sub_seq_col.len() {
                let s = sub_seq_col.value(i);
                min_seq = min_seq.min(s);
                max_seq = max_seq.max(s);
            }

            let encoded = Self::encode_batch_arrow_ipc_zstd(&sub_batch)?;
            let crc32 = compute_crc32c(&encoded);
            prepared.push(PreparedPartition {
                sol,
                row_count: sub_batch.num_rows(),
                min_seq,
                max_seq,
                encoded,
                crc32,
            });
        }

        if prepared.is_empty() {
            return Err(LsahStorageError::Backend("no partitions to write".to_string()));
        }

        // Atomic write-and-commit discipline:
        // Write all partition files first. If any partition write fails,
        // clean up all written files for this batch without modifying in-memory state or manifest.
        let mut guard = self.state.lock();
        let base_seg_id = guard.next_segment_id;
        let mut written_paths = Vec::new();
        let mut new_metas = Vec::new();

        let mut write_err = None;
        for (idx, p) in prepared.iter().enumerate() {
            let seg_id = base_seg_id.saturating_add(idx as u64);
            let rel_name = format!("sol_{:04}_seg_{:08}.arrow.zst", p.sol, seg_id);
            let seg_path = self.warm_dir.join(&rel_name);
            match atomic_write_bytes(&seg_path, &p.encoded) {
                Ok(()) => {
                    written_paths.push(seg_path);
                    new_metas.push(WarmSegmentMeta {
                        segment_id: seg_id,
                        mission_sol: p.sol,
                        min_mission_sol: Some(p.sol),
                        max_mission_sol: Some(p.sol),
                        relative_path: rel_name,
                        row_count: p.row_count,
                        compressed_bytes: p.encoded.len() as u64,
                        crc32c: p.crc32,
                        min_sequence_id: p.min_seq,
                        max_sequence_id: p.max_seq,
                    });
                }
                Err(err) => {
                    write_err = Some(err);
                    break;
                }
            }
        }

        if let Some(err) = write_err {
            for path in written_paths {
                let _ = fs::remove_file(path);
            }
            return Err(err);
        }

        // Stage into state and persist manifest atomically
        guard.segments.extend(new_metas.clone());
        guard.next_segment_id = base_seg_id.saturating_add(new_metas.len() as u64);

        if let Err(err) = self.persist_manifest_locked(&guard) {
            let rollback_len = guard.segments.len().saturating_sub(new_metas.len());
            guard.segments.truncate(rollback_len);
            guard.next_segment_id = base_seg_id;
            for path in written_paths {
                let _ = fs::remove_file(path);
            }
            return Err(err);
        }

        new_metas.last().cloned().ok_or_else(|| {
            LsahStorageError::Backend("no partitions committed".to_string())
        })
    }

    fn read_telemetry_sol_range(
        &self,
        crew_id: &str,
        sol_start: u16,
        sol_end: u16,
    ) -> Result<Vec<RecordBatch>, LsahStorageError> {
        let matching_segments: Vec<(WarmSegmentMeta, bool)> = {
            let guard = self.state.lock();
            guard
                .segments
                .iter()
                .filter(|s| {
                    let min_ok = s.min_mission_sol.is_none_or(|min_s| min_s <= sol_end);
                    let max_ok = s.max_mission_sol.is_none_or(|max_s| max_s >= sol_start);
                    min_ok && max_ok
                })
                .map(|s| (s.clone(), guard.legacy_ieee_segment_ids.contains(&s.segment_id)))
                .collect()
        };

        let mut batches = Vec::new();
        for (seg, allow_legacy) in matching_segments {
            let seg_path = self.warm_dir.join(&seg.relative_path);
            let bytes = fs::read(&seg_path)?;
            if let Err(err) =
                verify_crc32c_with_v1_ieee_fallback(&bytes, seg.crc32c, allow_legacy)
            {
                return Err(match err {
                    LsahStorageError::CrcMismatch { expected, computed, .. } => {
                        LsahStorageError::CrcMismatch {
                            artifact: seg_path.display().to_string(),
                            expected,
                            computed,
                        }
                    }
                    other => other,
                });
            }

            let decoded = Self::decode_batches_arrow_ipc(&bytes)?;
            for batch in decoded {
                let sol_col = batch
                    .column_by_name("mission_sol")
                    .ok_or_else(|| {
                        LsahStorageError::Backend("missing mission_sol column".to_string())
                    })?
                    .as_primitive::<UInt16Type>();

                let crew_col = if crew_id.is_empty() || crew_id == "*" {
                    None
                } else {
                    Some(
                        batch
                            .column_by_name("crew_id")
                            .ok_or_else(|| {
                                LsahStorageError::Backend("missing crew_id column".to_string())
                            })?
                            .as_string::<i32>(),
                    )
                };

                let mask: BooleanArray = (0..batch.num_rows())
                    .map(|i| {
                        let sol = sol_col.value(i);
                        let sol_match = sol >= sol_start && sol <= sol_end;
                        let crew_match = match crew_col {
                            Some(cc) => cc.value(i) == crew_id,
                            None => true,
                        };
                        Some(sol_match && crew_match)
                    })
                    .collect();

                let filtered = arrow_select::filter::filter_record_batch(&batch, &mask)?;
                if filtered.num_rows() > 0 {
                    batches.push(filtered);
                }
            }
        }
        Ok(batches)
    }

    fn upsert_pocus_signature(
        &self,
        record: &PocusSignatureRecord,
    ) -> Result<u64, LsahStorageError> {
        if record.feature_vector.len() != self.pocus_dim {
            return Err(LsahStorageError::EmbeddingDimensionMismatch {
                expected: self.pocus_dim,
                actual: record.feature_vector.len(),
            });
        }

        let mut guard = self.state.lock();
        guard.hnsw.insert(
            record.signature_id,
            record.mission_sol,
            record.crew_id.clone(),
            record.anatomical_target_uberon.clone(),
            record.feature_vector.clone(),
        )?;
        guard
            .pocus_records
            .insert(record.signature_id, record.clone());

        let mut ordered: Vec<PocusSignatureRecord> = guard.pocus_records.values().cloned().collect();
        ordered.sort_by_key(|r| r.signature_id);

        let batch = pocus_records_to_record_batch(&ordered, self.pocus_dim)?;
        let arrow_bytes = Self::encode_batch_arrow_ipc_zstd(&batch)?;
        atomic_write_bytes(&self.pocus_arrow_path, &arrow_bytes)?;

        let pocus_meta_path = self
            .warm_dir
            .join(format!("pocus_records_d{}.json", self.pocus_dim));
        let meta_json = serde_json::to_vec(&ordered)?;
        atomic_write_bytes(&pocus_meta_path, &meta_json)?;

        guard.hnsw.save_atomic(&self.hnsw_bin_path)?;
        Ok(record.signature_id)
    }

    fn search_similar_pocus(
        &self,
        query: &PocusSimilarityQuery,
    ) -> Result<Vec<PocusSimilarityHit>, LsahStorageError> {
        let filter = HnswFilter {
            crew_id: query.crew_id.clone(),
            anatomical_target_uberon: query.anatomical_target_uberon.clone(),
            sol_min: query.sol_min,
            sol_max: query.sol_max,
        };
        let has_filter = filter.crew_id.is_some()
            || filter.anatomical_target_uberon.is_some()
            || filter.sol_min.is_some()
            || filter.sol_max.is_some();

        let guard = self.state.lock();
        let neighbors = guard.hnsw.search(
            &query.query_vector,
            query.top_k,
            if has_filter { Some(&filter) } else { None },
        )?;

        let mut hits = Vec::with_capacity(neighbors.len());
        for (sig_id, cos_sim) in neighbors {
            if let Some(rec) = guard.pocus_records.get(&sig_id) {
                hits.push(PocusSimilarityHit {
                    signature_id: sig_id,
                    mission_sol: rec.mission_sol,
                    crew_id: rec.crew_id.clone(),
                    anatomical_target_uberon: rec.anatomical_target_uberon.clone(),
                    cosine_similarity: cos_sim,
                    delta_ijv_csa_cm2: query.current_ijv_csa_cm2 - rec.context.ijv_csa_cm2,
                    delta_tau_w_dyn_cm2: query.current_tau_w_dyn_cm2 - rec.context.tau_w_dyn_cm2,
                    historical_pocus_p_thrombus: rec.context.pocus_p_thrombus,
                    embedding_origin: rec.embedding_origin,
                    validation_status: rec.validation_status_str().to_string(),
                    // Hard Safety Gate 1 invariant: ANN similarity can NEVER unlock anticoagulation.
                    advisory_only_gate1_locked: true,
                });
            }
        }
        Ok(hits)
    }

    fn flush_and_sync(&self) -> Result<(), LsahStorageError> {
        let guard = self.state.lock();
        self.persist_manifest_locked(&guard)?;
        if let Ok(dir) = File::open(&self.warm_dir) {
            let _ = dir.sync_all();
        }
        Ok(())
    }

    fn warm_stats(&self) -> (usize, u64, usize) {
        let guard = self.state.lock();
        let bytes: u64 = guard.segments.iter().map(|s| s.compressed_bytes).sum();
        (guard.segments.len(), bytes, guard.pocus_records.len())
    }
}
