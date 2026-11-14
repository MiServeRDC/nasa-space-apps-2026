//! Fase 12 (F1): Governance della Privacy Medica per Ruolo (`NASA-STD-3001 Vol. 1 Rev C Ch. 7 [V1 3003]`)
//! e Cifratura Autenticata Store-and-Forward `ChaCha20-Poly1305` con chiavi effimere `ZeroizeOnDrop`.

use crate::audit_chain::Sha256AuditLogger;
use crate::sanitizer::StrictMcpSanitizer;
use ares_core_types::error::AresCoreError;
use ares_core_types::security::{
    AuditChainRecord, CrewPrivacyFilter, CrewRole, McpInputSanitizer, MedOpsAuditLogger,
};
use ares_core_types::telemetry::{AlertSeverity, TelemetryPacket};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Chiave simmetrica effimera a 256 bit per il canale Store-and-Forward Deep Space Network (DSN).
/// Viene azzerata automaticamente in RAM al rilascio (`ZeroizeOnDrop`).
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct EphemeralDsnKey {
    key_bytes: [u8; 32],
}

impl EphemeralDsnKey {
    #[inline]
    pub fn from_bytes(key_bytes: [u8; 32]) -> Self {
        Self { key_bytes }
    }

    #[inline]
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.key_bytes
    }
}

/// Pacchetto clinico cifrato `ChaCha20-Poly1305` per downlink asincrono verso il Flight Surgeon a Terra.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EncryptedStoreAndForwardBundle {
    pub astronaut_id: String,
    pub flight_day: u32,
    pub nonce_bytes: [u8; 12],
    pub aad_metadata: String,
    pub ciphertext: Vec<u8>,
}

/// Guardia unificata di sicurezza e privacy per `ARES-Health` (`@MiServeRDC`).
#[derive(Default)]
pub struct AresSecurityGuard {
    audit_logger: Sha256AuditLogger,
    sanitizer: StrictMcpSanitizer,
    astronaut_vocal_consent_granted: bool,
}

impl AresSecurityGuard {
    #[inline]
    pub fn new(astronaut_vocal_consent_granted: bool) -> Self {
        Self {
            audit_logger: Sha256AuditLogger::default(),
            sanitizer: StrictMcpSanitizer,
            astronaut_vocal_consent_granted,
        }
    }

    /// Sigilla e cifra un `TelemetryPacket` filtrato per il Flight Surgeon usando `ChaCha20-Poly1305`
    /// con metadati missione vincolati come Associated Authenticated Data (AAD).
    pub fn seal_store_and_forward_packet(
        &self,
        packet: &TelemetryPacket,
        key: &EphemeralDsnKey,
        nonce_bytes: [u8; 12],
    ) -> Result<EncryptedStoreAndForwardBundle, AresCoreError> {
        let filtered = self.filter_packet_for_role(packet, CrewRole::GroundFlightSurgeon)?;
        let plaintext = serde_json::to_vec(&filtered)
            .map_err(|e| AresCoreError::ContractSerialization(e.to_string()))?;
        let aad_metadata = format!(
            "ARES-DSN|astronaut={}|fd={}|src={}",
            filtered.astronaut_id, filtered.flight_day, filtered.source_record_id
        );

        let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(
                nonce,
                Payload {
                    msg: &plaintext,
                    aad: aad_metadata.as_bytes(),
                },
            )
            .map_err(|_| AresCoreError::SecurityViolation {
                reason: "cifratura AEAD ChaCha20-Poly1305 fallita".to_string(),
            })?;

        Ok(EncryptedStoreAndForwardBundle {
            astronaut_id: filtered.astronaut_id,
            flight_day: filtered.flight_day,
            nonce_bytes,
            aad_metadata,
            ciphertext,
        })
    }

    /// Verifica l'autenticità AAD e decifra un `EncryptedStoreAndForwardBundle`.
    pub fn open_store_and_forward_packet(
        &self,
        bundle: &EncryptedStoreAndForwardBundle,
        key: &EphemeralDsnKey,
    ) -> Result<TelemetryPacket, AresCoreError> {
        let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));
        let nonce = Nonce::from_slice(&bundle.nonce_bytes);
        let plaintext = cipher
            .decrypt(
                nonce,
                Payload {
                    msg: &bundle.ciphertext,
                    aad: bundle.aad_metadata.as_bytes(),
                },
            )
            .map_err(|_| AresCoreError::SecurityViolation {
                reason: "autenticazione AEAD ChaCha20-Poly1305 fallita: AAD o ciphertext manomesso"
                    .to_string(),
            })?;

        serde_json::from_slice(&plaintext)
            .map_err(|e| AresCoreError::ContractSerialization(e.to_string()))
    }
}

impl CrewPrivacyFilter for AresSecurityGuard {
    fn filter_packet_for_role(
        &self,
        packet: &TelemetryPacket,
        role: CrewRole,
    ) -> Result<TelemetryPacket, AresCoreError> {
        let mut out = packet.clone();
        let life_safety_breach = out.nqs_stl.has_known_violation()
            || out.alert_severity == AlertSeverity::CriticalEmergency
            || out.jugular_hemodynamics.pocus_thrombus_confirmed;

        match role {
            CrewRole::AstronautSelf => {
                // L'astronauta ha visibilità completa sui propri biomarcatori personali e vocali.
            }
            CrewRole::CrewMedicalOfficer | CrewRole::GroundFlightSurgeon => {
                // Secondo NASA-STD-3001 Vol. 1 Ch. 7 [V1 3003], i biomarcatori vocali/psicologici
                // grezzi restano mascherati a meno di consenso esplicito o violazione salvavita (rho < 0).
                if !self.astronaut_vocal_consent_granted && !life_safety_breach {
                    out.biometrics.vocal_f0_hz = None;
                    out.biometrics.vocal_jitter_pct = None;
                }
            }
        }
        Ok(out)
    }
}

impl MedOpsAuditLogger for AresSecurityGuard {
    fn append_audit_event(
        &self,
        actor_role: CrewRole,
        event_action: &str,
    ) -> Result<AuditChainRecord, AresCoreError> {
        self.audit_logger
            .append_audit_event(actor_role, event_action)
    }

    fn verify_chain_integrity(&self) -> Result<bool, AresCoreError> {
        self.audit_logger.verify_chain_integrity()
    }
}

impl McpInputSanitizer for AresSecurityGuard {
    fn sanitize_mcp_query(&self, raw_input: &str) -> Result<String, AresCoreError> {
        self.sanitizer.sanitize_mcp_query(raw_input)
    }

    fn wrap_untrusted_observation(&self, observation: &str) -> String {
        self.sanitizer.wrap_untrusted_observation(observation)
    }
}
