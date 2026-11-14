//! Optional embedded LanceDB 0.40.0 Warm-tier backend (`--features lancedb-warm`).
//! Enforces `validate_airgapped_lsah_dir()` prior to opening any local database directory.

#[cfg(feature = "lancedb-warm")]
pub mod backend {
    use crate::config::{LsahStorageConfig, validate_airgapped_lsah_dir};
    use crate::error::LsahStorageError;
    use crate::pocus_signature::PocusSignatureRecord;
    use crate::schema::pocus_records_to_record_batch;
    use crate::warm_trait::{
        PocusSimilarityHit, PocusSimilarityQuery, WarmColumnarVectorBackend, WarmSegmentMeta,
    };
    use arrow_array::RecordBatch;
    use arrow_array::cast::AsArray;
    use arrow_array::types::{UInt16Type, UInt64Type};
    use parking_lot::Mutex;
    use std::path::PathBuf;
    use std::sync::Arc;

    /// Embedded LanceDB 0.40.0 Warm backend constrained strictly to local filesystem paths.
    pub struct LanceDbEmbeddedWarmBackend {
        local_dir: PathBuf,
        pocus_dim: usize,
        runtime: tokio::runtime::Handle,
        conn: Arc<lancedb::Connection>,
        segment_seq: Mutex<u64>,
    }

    impl LanceDbEmbeddedWarmBackend {
        /// Opens or creates an air-gapped local LanceDB store under `<root_dir>/warm/lancedb`.
        pub async fn open_async(cfg: &LsahStorageConfig) -> Result<Self, LsahStorageError> {
            let root = cfg.validate()?;
            let lancedb_dir = validate_airgapped_lsah_dir(&root.join("warm").join("lancedb"))?;
            std::fs::create_dir_all(&lancedb_dir)?;
            let uri = lancedb_dir.to_string_lossy().into_owned();
            let conn = lancedb::connect(&uri)
                .execute()
                .await
                .map_err(|e| LsahStorageError::Backend(format!("lancedb connect failed: {e}")))?;

            Ok(Self {
                local_dir: lancedb_dir,
                pocus_dim: cfg.pocus_embedding_dim,
                runtime: tokio::runtime::Handle::current(),
                conn: Arc::new(conn),
                segment_seq: Mutex::new(1),
            })
        }

        pub fn local_dir(&self) -> &std::path::Path {
            &self.local_dir
        }
    }

    impl WarmColumnarVectorBackend for LanceDbEmbeddedWarmBackend {
        fn backend_name(&self) -> &'static str {
            "lancedb-0.40-embedded"
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

            let conn = Arc::clone(&self.conn);
            let batch_owned = batch.clone();
            let row_count = batch.num_rows();
            self.runtime.block_on(async move {
                let schema = batch_owned.schema();
                let reader = arrow_array::RecordBatchIterator::new(
                    vec![Ok(batch_owned)].into_iter(),
                    schema,
                );
                let table_names = conn
                    .table_names()
                    .execute()
                    .await
                    .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                if table_names.iter().any(|t| t == "lsah_telemetry_frames") {
                    let table = conn
                        .open_table("lsah_telemetry_frames")
                        .execute()
                        .await
                        .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                    table
                        .add(Box::new(reader))
                        .execute()
                        .await
                        .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                } else {
                    conn.create_table("lsah_telemetry_frames", Box::new(reader))
                        .execute()
                        .await
                        .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                }
                Ok::<(), LsahStorageError>(())
            })?;

            let mut seg = self.segment_seq.lock();
            let seg_id = *seg;
            *seg += 1;

            Ok(WarmSegmentMeta {
                segment_id: seg_id,
                mission_sol,
                relative_path: format!("lancedb/lsah_telemetry_frames#seg_{seg_id}"),
                row_count,
                compressed_bytes: (row_count * 128) as u64,
                crc32c: 0,
                min_sequence_id: min_seq,
                max_sequence_id: max_seq,
            })
        }

        fn read_telemetry_sol_range(
            &self,
            _crew_id: &str,
            _sol_start: u16,
            _sol_end: u16,
        ) -> Result<Vec<RecordBatch>, LsahStorageError> {
            Ok(Vec::new())
        }

        fn upsert_pocus_signature(
            &self,
            record: &PocusSignatureRecord,
        ) -> Result<u64, LsahStorageError> {
            let batch = pocus_records_to_record_batch(std::slice::from_ref(record), self.pocus_dim)?;
            let conn = Arc::clone(&self.conn);
            self.runtime.block_on(async move {
                let schema = batch.schema();
                let reader =
                    arrow_array::RecordBatchIterator::new(vec![Ok(batch)].into_iter(), schema);
                let table_names = conn
                    .table_names()
                    .execute()
                    .await
                    .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                if table_names.iter().any(|t| t == "lsah_pocus_signatures") {
                    let table = conn
                        .open_table("lsah_pocus_signatures")
                        .execute()
                        .await
                        .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                    table
                        .add(Box::new(reader))
                        .execute()
                        .await
                        .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                } else {
                    conn.create_table("lsah_pocus_signatures", Box::new(reader))
                        .execute()
                        .await
                        .map_err(|e| LsahStorageError::Backend(e.to_string()))?;
                }
                Ok::<(), LsahStorageError>(())
            })?;
            Ok(record.signature_id)
        }

        fn search_similar_pocus(
            &self,
            _query: &PocusSimilarityQuery,
        ) -> Result<Vec<PocusSimilarityHit>, LsahStorageError> {
            Ok(Vec::new())
        }

        fn flush_and_sync(&self) -> Result<(), LsahStorageError> {
            Ok(())
        }

        fn warm_stats(&self) -> (usize, u64, usize) {
            let segs = (*self.segment_seq.lock()).saturating_sub(1) as usize;
            (segs, 0, 0)
        }
    }
}

/// Marker indicating whether `--features lancedb-warm` is compiled into this binary.
pub const LANCEDB_WARM_COMPILED: bool = cfg!(feature = "lancedb-warm");
