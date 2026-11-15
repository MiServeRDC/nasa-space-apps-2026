use crate::config::{LsahStorageConfig, atomic_write_bytes, validate_airgapped_lsah_dir};
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
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// Summary of crash-recovery actions taken when opening `ArrowIpcZstdHnswBackend`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WarmRecoveryReport {
    pub purged_tmp_files: Vec<String>,
    pub valid_segments_recovered: usize,
    pub quarantined_corrupt_segments: Vec<String>,
    pub pocus_signatures_recovered: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManifestPayload {
    next_segment_id: u64,
    pocus_dim: usize,
    segments: Vec<WarmSegmentMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SignedManifest {
    payload: ManifestPayload,
    crc32c: u32,
}

struct WarmArrowState {
    next_segment_id: u64,
    segments: Vec<WarmSegmentMeta>,
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
        if manifest_path.exists() {
            let raw = fs::read(&manifest_path)?;
            let (next_id, segments) = match serde_json::from_slice::<SignedManifest>(&raw) {
                Ok(signed) => {
                    let payload_bytes = serde_json::to_vec(&signed.payload)?;
                    let computed = crate::config::compute_storage_crc32_ieee(&payload_bytes);
                    if computed == signed.crc32c {
                        (signed.payload.next_segment_id, signed.payload.segments)
                    } else {
                        // Fallback: verify against legacy schema (v1 without min/max sol bounds)
                        let legacy: LegacySignedManifest = serde_json::from_slice(&raw)?;
                        let leg_bytes = serde_json::to_vec(&legacy.payload)?;
                        let leg_computed = crate::config::compute_storage_crc32_ieee(&leg_bytes);
                        if leg_computed != legacy.crc32c {
                            return Err(LsahStorageError::CrcMismatch {
                                artifact: manifest_path.display().to_string(),
                                expected: signed.crc32c,
                                computed,
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
                        (legacy.payload.next_segment_id, segs)
                    }
                }
                Err(err) => return Err(LsahStorageError::Json(err)),
            };
            next_segment_id = next_id;

            for seg in segments {
                let seg_path = warm_dir.join(&seg.relative_path);
                match Self::verify_segment_file_crc(&seg_path, seg.crc32c) {
                    Ok(()) => {
                        recovered_segments.push(seg);
                    }
                    Err(_) => {
                        report.quarantined_corrupt_segments.push(seg.relative_path);
                    }
                }
            }
            report.valid_segments_recovered = recovered_segments.len();
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

    /// Verifies a segment file's CRC-32 (IEEE 802.3) against its expected digest.
    pub fn verify_segment_file_crc(path: &Path, expected_crc: u32) -> Result<(), LsahStorageError> {
        let bytes = fs::read(path)?;
        if !crate::config::verify_segment_checksum(&bytes, expected_crc) {
            let computed = crate::config::compute_storage_crc32_ieee(&bytes);
            return Err(LsahStorageError::CrcMismatch {
                artifact: path.display().to_string(),
                expected: expected_crc,
                computed,
            });
        }
        Ok(())
    }

    fn persist_manifest_locked(&self, state: &WarmArrowState) -> Result<(), LsahStorageError> {
        let payload = ManifestPayload {
            next_segment_id: state.next_segment_id,
            pocus_dim: self.pocus_dim,
            segments: state.segments.clone(),
        };
        let payload_bytes = serde_json::to_vec(&payload)?;
        let crc32c = crate::config::compute_storage_crc32_ieee(&payload_bytes);
        let signed = SignedManifest { payload, crc32c };
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
            let crc32 = crate::config::compute_storage_crc32_ieee(&encoded);
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
        let matching_segments: Vec<WarmSegmentMeta> = {
            let guard = self.state.lock();
            guard
                .segments
                .iter()
                .filter(|s| {
                    if let (Some(min_s), Some(max_s)) = (s.min_mission_sol, s.max_mission_sol) {
                        min_s <= sol_end && max_s >= sol_start
                    } else {
                        // Unconstrained legacy segment: retain and filter row-by-row
                        true
                    }
                })
                .cloned()
                .collect()
        };

        let mut batches = Vec::new();
        for seg in matching_segments {
            let seg_path = self.warm_dir.join(&seg.relative_path);
            let bytes = fs::read(&seg_path)?;
            if !crate::config::verify_segment_checksum(&bytes, seg.crc32c) {
                let computed = crate::config::compute_storage_crc32_ieee(&bytes);
                return Err(LsahStorageError::CrcMismatch {
                    artifact: seg_path.display().to_string(),
                    expected: seg.crc32c,
                    computed,
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
