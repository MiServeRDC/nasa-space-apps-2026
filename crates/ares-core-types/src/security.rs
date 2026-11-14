//! Fase 02 (A2): Trait disaccoppiati di sicurezza e privacy medica (NASA-STD-3001 Vol. 1 Ch. 7).

use crate::error::AresCoreError;
use crate::telemetry::TelemetryPacket;
use serde::{Deserialize, Serialize};

/// Ruoli di accesso ai dati medici dell'equipaggio secondo NASA-STD-3001 Vol. 1 Rev C [V1 3003].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CrewRole {
    /// Singolo astronauta: vede la propria prontezza operativa e azioni guidate.
    AstronautSelf,
    /// Crew Medical Officer (CMO): accesso clinico completo di bordo.
    CrewMedicalOfficer,
    /// Flight Surgeon a Terra: riceve pacchetti sintetici cifrati Store-and-Forward.
    GroundFlightSurgeon,
}

/// Record immutabile nella catena di audit SHA-256 per decisioni/override medici.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditChainRecord {
    pub sequence_index: u64,
    pub timestamp_utc: String,
    pub actor_role: CrewRole,
    pub event_action: String,
    pub prev_hash_hex: String,
    pub current_hash_hex: String,
}

/// Trait per filtrare i campi sensibili del pacchetto telemetrico in base al ruolo (`CrewRole`).
pub trait CrewPrivacyFilter: Send + Sync {
    fn filter_packet_for_role(
        &self,
        packet: &TelemetryPacket,
        role: CrewRole,
    ) -> Result<TelemetryPacket, AresCoreError>;
}

/// Trait per la registrazione non ripudiabile (SHA-256 hash chain) di Playbook e override.
pub trait MedOpsAuditLogger: Send + Sync {
    fn append_audit_event(
        &self,
        actor_role: CrewRole,
        event_action: &str,
    ) -> Result<AuditChainRecord, AresCoreError>;

    fn verify_chain_integrity(&self) -> Result<bool, AresCoreError>;
}

/// Trait per la sanitizzazione degli input JSON-RPC e l'incapsulamento anti-Prompt-Injection.
pub trait McpInputSanitizer: Send + Sync {
    fn sanitize_mcp_query(&self, raw_input: &str) -> Result<String, AresCoreError>;
    fn wrap_untrusted_observation(&self, observation: &str) -> String;
}

/// Implementazione di default pass-through a costo zero per test isolati dei crate core.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoOpSecurity;

impl CrewPrivacyFilter for NoOpSecurity {
    fn filter_packet_for_role(
        &self,
        packet: &TelemetryPacket,
        _role: CrewRole,
    ) -> Result<TelemetryPacket, AresCoreError> {
        Ok(packet.clone())
    }
}

impl MedOpsAuditLogger for NoOpSecurity {
    fn append_audit_event(
        &self,
        actor_role: CrewRole,
        event_action: &str,
    ) -> Result<AuditChainRecord, AresCoreError> {
        Ok(AuditChainRecord {
            sequence_index: 0,
            timestamp_utc: "2026-11-14T00:00:00Z".to_string(),
            actor_role,
            event_action: event_action.to_string(),
            prev_hash_hex: "0".repeat(64),
            current_hash_hex: "0".repeat(64),
        })
    }

    fn verify_chain_integrity(&self) -> Result<bool, AresCoreError> {
        Ok(true)
    }
}

impl McpInputSanitizer for NoOpSecurity {
    fn sanitize_mcp_query(&self, raw_input: &str) -> Result<String, AresCoreError> {
        Ok(raw_input.trim().to_string())
    }

    fn wrap_untrusted_observation(&self, observation: &str) -> String {
        format!("<untrusted_telemetry_observation>{observation}</untrusted_telemetry_observation>")
    }
}
