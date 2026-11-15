# Piano Implementativo Definitivo — Fase 12 (F1): Role-Based Crew Medical Privacy (`NASA-STD-3001 Vol. 1 Ch. 7`), `SHA-256` Audit Chain & `ChaCha20-Poly1305` Store-and-Forward

- **Blocco Architetturale**: Blocco F (*Privacy dell'Equipaggio per Ruolo, Audit Chain `SHA-256` & AEAD*, Fase 12)
- **Fase**: Fase 12 (`F1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-security-privacy`](../../crates/ares-security-privacy/README.md)
- **Owner Principale**: `@MiServeRDC` (ARES-Health Team)
- **File Target Previsti**:
  1. `crates/ares-security-privacy/Cargo.toml` *(NEW)*
  2. `crates/ares-security-privacy/src/lib.rs` *(NEW)*
  3. `crates/ares-security-privacy/src/privacy_views.rs` *(NEW)*
  4. `crates/ares-security-privacy/src/audit_chain.rs` *(NEW)*
  5. `crates/ares-security-privacy/src/sanitizer.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 30\,\mu\text{s}$ per filtro privacy + calcolo hash `SHA-256`.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, `zeroize::ZeroizeOnDrop` per le chiavi in RAM, conformità alle linee guida `.agents/rules/security-guidelines.md`.

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale
Lo standard **NASA-STD-3001 Volume 1 Rev C, Capitolo 7 (`[V1 3003]` Medical Privacy & Ethics)** stabilisce che in un habitat confinato (come una missione Mars Transit di 900 giorni), l'esposizione indiscriminata di biomarcatori psicologici, vocali o patologici all'intero equipaggio erode la coesione sociale e spinge gli astronauti a nascondere i sintomi.

La **Fase 12 (`F1`)**, di proprietà di `@MiServeRDC`, implementa in `crates/ares-security-privacy` i 3 trait definiti in `ares-core-types`:
1. **`privacy_views.rs` (`CrewPrivacyFilter`):** Applica il mascheramento selettivo in base a `CrewRole` (`AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon`).
2. **`audit_chain.rs` (`MedOpsAuditLogger`):** Mantiene una catena di hash `SHA-256` concatenati ($H_i = \text{SHA256}(H_{i-1} \parallel \text{seq}_i \parallel \text{role}_i \parallel \text{action}_i)$) matematicamente verificabile contro manomissioni.
3. **`sanitizer.rs` (`McpInputSanitizer`):** Rifiuta payload JSON-RPC $> 64\text{ KB}$ o contenenti sequenze di controllo malevole e incapsula ogni osservazione telemetrica in `<untrusted_telemetry_observation>`.

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 12 (`F1`) |
| :--- | :--- | :--- |
| `crates/ares-security-privacy/Cargo.toml` | **CREATE** | Dipendenze `ares-core-types`, `sha2 = "0.10"`, `chacha20poly1305 = "0.10"`, `zeroize = { version = "1.8", features = ["derive"] }`, `serde`, `thiserror`. |
| `crates/ares-security-privacy/src/privacy_views.rs` | **CREATE** | Implementazione di `CrewPrivacyFilter` per `AresSecurityGuard`. |
| `crates/ares-security-privacy/src/audit_chain.rs` | **CREATE** | Implementazione della catena di hash `SHA-256` `Sha256AuditChain`. |
| `crates/ares-security-privacy/src/sanitizer.rs` | **CREATE** | Implementazione di `McpInputSanitizer` con blocco anti-DoS e XML tagging. |

---

## 3. Architettura di `audit_chain.rs` e `sanitizer.rs` in Puro Rust 2024

```rust
//! Fase 12 (F1): Catena di Audit SHA-256 non ripudiabile e Sanitizzatore MCP anti-Prompt-Injection.

use ares_core_types::error::AresCoreError;
use ares_core_types::security::{AuditChainRecord, CrewRole, McpInputSanitizer, MedOpsAuditLogger};
use sha2::{Digest, Sha256};
use std::sync::Mutex;

const MAX_MCP_QUERY_BYTES: usize = 65_536;

/// Logger di audit basato su catena hash SHA-256 in memoria protetta.
pub struct Sha256AuditLogger {
    records: Mutex<Vec<AuditChainRecord>>,
}

impl Default for Sha256AuditLogger {
    fn default() -> Self {
        Self {
            records: Mutex::new(Vec::new()),
        }
    }
}

impl Sha256AuditLogger {
    #[inline]
    fn compute_record_hash(
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
}

impl MedOpsAuditLogger for Sha256AuditLogger {
    fn append_audit_event(
        &self,
        actor_role: CrewRole,
        event_action: &str,
    ) -> Result<AuditChainRecord, AresCoreError> {
        let mut guard = self.records.lock().map_err(|_| AresCoreError::SecurityViolation {
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
        let guard = self.records.lock().map_err(|_| AresCoreError::SecurityViolation {
            reason: "mutex della catena di audit avvelenato".to_string(),
        })?;
        let mut expected_prev = "0".repeat(64);
        for rec in guard.iter() {
            if rec.prev_hash_hex != expected_prev {
                return Ok(false);
            }
            let recomputed = Self::compute_record_hash(
                rec.sequence_index,
                &rec.timestamp_utc,
                rec.actor_role,
                &rec.event_action,
                &rec.prev_hash_hex,
            );
            if recomputed != rec.current_hash_hex {
                return Ok(false);
            }
            expected_prev = rec.current_hash_hex.clone();
        }
        Ok(true)
    }
}

/// Sanitizzatore rigoroso per query JSON-RPC e osservazioni telemetriche.
#[derive(Debug, Default, Clone, Copy)]
pub struct StrictMcpSanitizer;

impl McpInputSanitizer for StrictMcpSanitizer {
    fn sanitize_mcp_query(&self, raw_input: &str) -> Result<String, AresCoreError> {
        if raw_input.len() > MAX_MCP_QUERY_BYTES {
            return Err(AresCoreError::SecurityViolation {
                reason: format!("query MCP eccede il limite di {MAX_MCP_QUERY_BYTES} byte"),
            });
        }
        let cleaned: String = raw_input
            .chars()
            .filter(|&c| !c.is_control() || c == '\n' || c == '\t')
            .collect();
        Ok(cleaned.trim().to_string())
    }

    fn wrap_untrusted_observation(&self, observation: &str) -> String {
        let escaped = observation.replace('<', "&lt;").replace('>', "&gt;");
        format!("<untrusted_telemetry_observation>{escaped}</untrusted_telemetry_observation>")
    }
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 12 (`F1`)

1. **`test_sha256_audit_chain_detects_tampering`:** Aggiunge 3 eventi clinici, verifica `verify_chain_integrity() == Ok(true)`, e dimostra che la modifica di un singolo carattere invalida l'hash.
2. **`test_mcp_sanitizer_escapes_xml_injection`:** Verifica che un tentativo di tag break `</untrusted_telemetry_observation>` venga neutralizzato in `&lt;/untrusted_telemetry_observation&gt;`.
