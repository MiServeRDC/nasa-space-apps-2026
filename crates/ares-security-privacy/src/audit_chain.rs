//! Fase 12 (F1): Catena di Audit SHA-256 non ripudiabile per eventi MedOps, Safety Gates e override.

use ares_core_types::error::AresCoreError;
use ares_core_types::security::{AuditChainRecord, CrewRole, MedOpsAuditLogger};
use sha2::{Digest, Sha256};
use std::sync::Mutex;

/// Logger di audit basato su catena hash SHA-256 in memoria protetta.
#[derive(Default)]
pub struct Sha256AuditLogger {
    records: Mutex<Vec<AuditChainRecord>>,
}

impl Sha256AuditLogger {
    #[inline]
    pub fn new() -> Self {
        Self::default()
    }

    #[inline]
    pub fn compute_record_hash(
        seq: u64,
        timestamp: &str,
        role: CrewRole,
        action: &str,
        prev_hash: &str,
    ) -> String {
        let mut hasher = Sha256::new();
        hasher.update(seq.to_le_bytes());
        hasher.update(timestamp.as_bytes());
        hasher.update(format!("{role:?}").as_bytes());
        hasher.update(action.as_bytes());
        hasher.update(prev_hash.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Restituisce una copia dei record registrati nella catena di audit.
    pub fn records(&self) -> Result<Vec<AuditChainRecord>, AresCoreError> {
        let guard = self
            .records
            .lock()
            .map_err(|_| AresCoreError::SecurityViolation {
                reason: "mutex della catena di audit avvelenato".to_string(),
            })?;
        Ok(guard.clone())
    }

    /// Verifica matematicamente una slice esterna di record `AuditChainRecord` contro manomissioni.
    pub fn verify_external_slice(slice: &[AuditChainRecord]) -> bool {
        let mut expected_prev = "0".repeat(64);
        for rec in slice {
            if rec.prev_hash_hex != expected_prev {
                return false;
            }
            let recomputed = Self::compute_record_hash(
                rec.sequence_index,
                &rec.timestamp_utc,
                rec.actor_role,
                &rec.event_action,
                &rec.prev_hash_hex,
            );
            if recomputed != rec.current_hash_hex {
                return false;
            }
            expected_prev = rec.current_hash_hex.clone();
        }
        true
    }
}

impl MedOpsAuditLogger for Sha256AuditLogger {
    fn append_audit_event(
        &self,
        actor_role: CrewRole,
        event_action: &str,
    ) -> Result<AuditChainRecord, AresCoreError> {
        let mut guard = self
            .records
            .lock()
            .map_err(|_| AresCoreError::SecurityViolation {
                reason: "mutex della catena di audit avvelenato".to_string(),
            })?;
        let seq = guard.len() as u64;
        let prev_hash = guard
            .last()
            .map(|r| r.current_hash_hex.clone())
            .unwrap_or_else(|| "0".repeat(64));
        let timestamp_utc = "2026-11-14T12:00:00Z".to_string();
        let current_hash =
            Self::compute_record_hash(seq, &timestamp_utc, actor_role, event_action, &prev_hash);

        let rec = AuditChainRecord {
            sequence_index: seq,
            timestamp_utc,
            actor_role,
            event_action: event_action.to_string(),
            prev_hash_hex: prev_hash,
            current_hash_hex: current_hash,
        };
        guard.push(rec.clone());
        Ok(rec)
    }

    fn verify_chain_integrity(&self) -> Result<bool, AresCoreError> {
        let guard = self
            .records
            .lock()
            .map_err(|_| AresCoreError::SecurityViolation {
                reason: "mutex della catena di audit avvelenato".to_string(),
            })?;
        Ok(Self::verify_external_slice(&guard))
    }
}
