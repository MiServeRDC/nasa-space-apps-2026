use crate::config::{LsahStorageConfig, atomic_write_bytes, compute_crc32c, validate_airgapped_lsah_dir};
use crate::error::LsahStorageError;
use crate::hnsw_index::{HnswFilter, HnswVectorIndex};
use crate::pocus_signature::PocusSignatureRecord;
use crate::schema::pocus_records_to_record_batch;
use crate::warm_trait::{
    PocusSimilarityHit, PocusSimilarityQuery, WarmColumnarVectorBackend, WarmSegmentMeta,
};
use arrow_array::cast::AsArray;
use arrow_array::types::{UInt16Type, UInt64Type};
use arrow_array::{Array, BooleanArray, RecordBatch};
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
            let signed: SignedManifest = serde_json::from_slice(&raw)?;
            let payload_bytes = serde_json::to_vec(&signed.payload)?;
            let computed = compute_crc32c(&payload_bytes);
            if computed != signed.crc32c {
                return Err(LsahStorageError::CrcMismatch {
                    artifact: manifest_path.display().to_string(),
                    expected: signed.crc32c,
                    computed,
                });
            }
            next_segment_id = signed.payload.next_segment_id;

            for seg in signed.payload.segments {
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

    /// Verifies a segment file's CRC-32C against its expected digest.
    pub fn verify_segment_file_crc(path: &Path, expected_crc: u32) -> Result<(), LsahStorageError> {
        let bytes = fs::read(path)?;
        let computed = compute_crc32c(&bytes);
        if computed != expected_crc {
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
        let crc32c = compute_crc32c(&payload_bytes);
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
        let seq_col = batch
            .column_by_name("sequence_id")
            .ok_or_else(|| LsahStorageError::Backend("missing sequence_id column".to_string()))?
            .as_primitive::<UInt64Type>();

        let mission_sol = sol_col.value(0);
        let mut min_seq = u64::MAX;
        let mut max_seq = 0u64;
        for i in 0..seq_col.len() {
            let s = seq_col.value(i);
            min_seq = min_seq.min(s);
            max_seq = max_seq.max(s);
        }

        let encoded = Self::encode_batch_arrow_ipc_zstd(batch)?;
        let crc32c = compute_crc32c(&encoded);
        let compressed_bytes = encoded.len() as u64;

        let mut guard = self.state.lock();
        let seg_id = guard.next_segment_id;

        let rel_name = format!("sol_{mission_sol:04}_seg_{seg_id:08}.arrow.zst");
        let seg_path = self.warm_dir.join(&rel_name);
        atomic_write_bytes(&seg_path, &encoded)?;

        let meta = WarmSegmentMeta {
            segment_id: seg_id,
            mission_sol,
            relative_path: rel_name,
            row_count: batch.num_rows(),
            compressed_bytes,
            crc32c,
            min_sequence_id: min_seq,
            max_sequence_id: max_seq,
        };
        guard.segments.push(meta.clone());
        guard.next_segment_id = seg_id.saturating_add(1);
        if let Err(error) = self.persist_manifest_locked(&guard) {
            guard.segments.pop();
            guard.next_segment_id = seg_id;
            return Err(error);
        }
        Ok(meta)
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
                .filter(|s| s.mission_sol >= sol_start && s.mission_sol <= sol_end)
                .cloned()
                .collect()
        };

        let mut batches = Vec::new();
        for seg in matching_segments {
            let seg_path = self.warm_dir.join(&seg.relative_path);
            let bytes = fs::read(&seg_path)?;
            let computed = compute_crc32c(&bytes);
            if computed != seg.crc32c {
                return Err(LsahStorageError::CrcMismatch {
                    artifact: seg_path.display().to_string(),
                    expected: seg.crc32c,
                    computed,
                });
            }

            let decoded = Self::decode_batches_arrow_ipc(&bytes)?;
            for batch in decoded {
                if crew_id.is_empty() || crew_id == "*" {
                    batches.push(batch);
                } else {
                    let crew_col = batch
                        .column_by_name("crew_id")
                        .ok_or_else(|| {
                            LsahStorageError::Backend("missing crew_id column".to_string())
                        })?
                        .as_string::<i32>();
                    let mask: BooleanArray = (0..crew_col.len())
                        .map(|i| Some(crew_col.value(i) == crew_id))
                        .collect();
                    let filtered = arrow_select::filter::filter_record_batch(&batch, &mask)?;
                    if filtered.num_rows() > 0 {
                        batches.push(filtered);
                    }
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
