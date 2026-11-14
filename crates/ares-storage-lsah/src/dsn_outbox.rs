use crate::config::{atomic_write_bytes, compute_crc32c, validate_airgapped_lsah_dir};
use crate::error::LsahStorageError;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Priority tiers for Deep Space Network (DSN) Store-and-Forward downlink scheduling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum DsnPriorityTier {
    /// Safety Gate trips or confirmed thrombus alerts.
    CriticalAlert = 0,
    /// Episodic POCUS ultrasound signature archives.
    PocusSignature = 1,
    /// Nominal Sol telemetry batches.
    NominalSol = 2,
}

/// Queue entry representing a sealed Cold archive chunk staged for Earth-Mars OWLT downlink.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutboxDescriptor {
    pub chunk_seq: u64,
    pub mission_sol: u16,
    pub priority_tier: DsnPriorityTier,
    pub chunk_filename: String,
    pub payload_bytes: u64,
    pub created_unix_ms: i64,
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OutboxPayload {
    entries: Vec<OutboxDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SignedOutbox {
    payload: OutboxPayload,
    crc32c: u32,
}

/// Priority-ordered, crash-atomic DSN Store-and-Forward downlink outbox.
pub struct DsnDownlinkOutbox {
    queue_path: PathBuf,
    entries: Mutex<Vec<OutboxDescriptor>>,
}

impl DsnDownlinkOutbox {
    /// Opens or initializes `<root_dir>/dsn_outbox/outbox_queue.json`.
    pub fn open(root_dir: &Path) -> Result<Self, LsahStorageError> {
        let root = validate_airgapped_lsah_dir(root_dir)?;
        let outbox_dir = root.join("dsn_outbox");
        fs::create_dir_all(&outbox_dir)?;
        let queue_path = outbox_dir.join("outbox_queue.json");

        let entries = if queue_path.exists() {
            let raw = fs::read(&queue_path)?;
            let signed: SignedOutbox = serde_json::from_slice(&raw)?;
            let payload_bytes = serde_json::to_vec(&signed.payload)?;
            let computed = compute_crc32c(&payload_bytes);
            if computed != signed.crc32c {
                return Err(LsahStorageError::CrcMismatch {
                    artifact: queue_path.display().to_string(),
                    expected: signed.crc32c,
                    computed,
                });
            }
            signed.payload.entries
        } else {
            Vec::new()
        };

        Ok(Self {
            queue_path,
            entries: Mutex::new(entries),
        })
    }

    fn persist_locked(&self, entries: &[OutboxDescriptor]) -> Result<(), LsahStorageError> {
        let payload = OutboxPayload {
            entries: entries.to_vec(),
        };
        let payload_bytes = serde_json::to_vec(&payload)?;
        let crc32c = compute_crc32c(&payload_bytes);
        let signed = SignedOutbox { payload, crc32c };
        let encoded = serde_json::to_vec_pretty(&signed)?;
        atomic_write_bytes(&self.queue_path, &encoded)
    }

    /// Enqueues a Cold chunk descriptor (idempotent by `chunk_seq`) and persists atomically.
    pub fn enqueue(&self, descriptor: OutboxDescriptor) -> Result<(), LsahStorageError> {
        let mut guard = self.entries.lock();
        if !guard.iter().any(|e| e.chunk_seq == descriptor.chunk_seq) {
            guard.push(descriptor);
            guard.sort_by_key(|e| (e.priority_tier, e.mission_sol, e.chunk_seq));
            self.persist_locked(&guard)?;
        }
        Ok(())
    }

    /// Selects unacknowledged chunks in strict `(priority_tier ASC, mission_sol ASC, chunk_seq ASC)`
    /// order fitting inside the `max_bytes` DSN downlink pass budget.
    pub fn drain_for_dsn_window(&self, max_bytes: u64) -> Vec<OutboxDescriptor> {
        let guard = self.entries.lock();
        let mut pending: Vec<OutboxDescriptor> = guard
            .iter()
            .filter(|e| !e.acknowledged)
            .cloned()
            .collect();
        pending.sort_by_key(|e| (e.priority_tier, e.mission_sol, e.chunk_seq));

        let mut selected = Vec::new();
        let mut used = 0u64;
        for item in pending {
            if used.saturating_add(item.payload_bytes) <= max_bytes {
                used = used.saturating_add(item.payload_bytes);
                selected.push(item);
            }
        }
        selected
    }

    /// Idempotently marks acknowledged chunks and compacts/persists the outbox queue.
    pub fn acknowledge_chunks(&self, chunk_seqs: &[u64]) -> Result<usize, LsahStorageError> {
        let mut guard = self.entries.lock();
        let mut newly_acked = 0usize;
        for entry in guard.iter_mut() {
            if !entry.acknowledged && chunk_seqs.contains(&entry.chunk_seq) {
                entry.acknowledged = true;
                newly_acked += 1;
            }
        }
        if newly_acked > 0 {
            self.persist_locked(&guard)?;
        }
        Ok(newly_acked)
    }

    /// Returns count of unacknowledged downlink descriptors.
    pub fn pending_count(&self) -> usize {
        self.entries
            .lock()
            .iter()
            .filter(|e| !e.acknowledged)
            .count()
    }

    /// Returns total descriptors (pending + acknowledged).
    pub fn total_count(&self) -> usize {
        self.entries.lock().len()
    }
}
