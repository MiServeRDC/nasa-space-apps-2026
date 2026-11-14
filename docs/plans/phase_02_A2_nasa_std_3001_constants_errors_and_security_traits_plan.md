# Piano Implementativo Definitivo — Fase 02 (A2): NASA-STD-3001 Constants, Typed Errors & Decoupled Security Traits

- **Blocco Architetturale**: Blocco A (*Fondamenta Contrattuali, Costanti Normative & Trait di Sicurezza*, Fasi 01–02)
- **Fase**: Fase 02 (`A2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-core-types`](../../crates/ares-core-types/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid` (con integrazione trait per `@MiServeRDC`)
- **File Target Previsti**:
  1. `crates/ares-core-types/src/constants.rs` *(NEW)*
  2. `crates/ares-core-types/src/error.rs` *(NEW)*
  3. `crates/ares-core-types/src/security.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $0\text{ ns}$ per le costanti (`const` inlined a tempo di compilazione), $< 50\text{ ns}$ per dispatch trait statico/dinamico.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, errori fortemente tipizzati `thiserror::Error`.

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale
Per evitare "numeri magici" sparsi nei vari crate e per consentire a `@MiServeRDC` di sviluppare `crates/ares-security-privacy` in totale autonomia senza bloccare `@LelloXV` (`ares-telemetry-ingest`) o `@fertech02` (`ares-server-cli`), la **Fase 02 (`A2`)** introduce:
1. **`constants.rs`**: Tutte le costanti fisiche, emodinamiche, biomeccaniche e normative derivanti da **NASA-STD-3001 Vol. 1 Rev C (`[V1 3001]–[V1 4001]`)** e **Vol. 2 Rev F (`[V2 6001]–[V2 10001]`)**, validate con `deep-scholar`.
2. **`error.rs`**: L'enumerazione `AresCoreError` basata su `thiserror` per la gestione sicura di valori fuori range, `NaN`/`Infinity` e violazioni di schema.
3. **`security.rs`**: I **3 Trait astratti di sicurezza e privacy medica** (`CrewPrivacyFilter`, `MedOpsAuditLogger`, `McpInputSanitizer`) con implementazione pass-through a costo zero `NoOpSecurity` (lo stesso identico pattern architetturale di `crates/core-types/src/security.rs` in `spatiotemporal-mcp-engine`).

### 1.2 Riferimenti Scientifici e Normativi (`deep-scholar`)
1. **NASA-STD-3001 Volume 1 Rev C (2023) & Volume 2 Rev F (Luglio 2026):**
   * *Clausole:* `[V1 3003]` (Crew Medical Privacy & Role-Based Access), `[V1 4001]` (Aerobic/Resistive Countermeasures), `[V2 6002]` (Radiation Monitoring & ALARA), `[V2 10001]` (Display Legibility & Alert Hierarchy).
2. **Frost Mechanostat & Hemodynamic Shear Stress Constants:**
   * Harold M. Frost (*Anat. Rec.* 2003: $\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$); Karina Marshall-Goebel et al. (*JAMA Netw. Open* 2019, `PMC6902784`: viscosità ematica $\mu = 0.035\text{ Poise}$, soglia stasi critica $v_{\max} < 5.0\text{ cm/s}$, $\tau_{w,\text{crit}} = 1.2\text{ dyn/cm}^2$).

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 02 (`A2`) |
| :--- | :--- | :--- |
| `crates/ares-core-types/src/constants.rs` | **CREATE** | Costanti `pub const` fisiche, fisiologiche e soglie `NASA-STD-3001` più helper di sanitizzazione `sanitize_f64`. |
| `crates/ares-core-types/src/error.rs` | **CREATE** | Tipo di errore `AresCoreError` (`thiserror::Error`). |
| `crates/ares-core-types/src/security.rs` | **CREATE** | Ruoli `CrewRole` (`AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon`), trait `CrewPrivacyFilter`, `MedOpsAuditLogger`, `McpInputSanitizer` e fallback `NoOpSecurity`. |

---

## 3. Architettura di `constants.rs`, `error.rs` e `security.rs` in Puro Rust 2024

```rust
//! Fase 02 (A2): Costanti fisiche/normative NASA-STD-3001, errori tipizzati e trait di sicurezza.

use crate::telemetry::TelemetryPacket;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// ============================================================================
// 1. COSTANTI FISICHE E NORMATIVE (NASA-STD-3001 VOL. 1 REV C & VOL. 2 REV F)
// ============================================================================

/// Viscosita dinamica media del sangue umano a 37°C in Poise (dyn·s/cm^2).
pub const BLOOD_VISCOSITY_POISE: f64 = 0.035;

/// Soglia di deformazione meccanica del meccanostato di Frost (microstrain).
pub const FROST_MECHANOSTAT_STRAIN_UE: f64 = 1000.0;

/// Esponente di Hill per l'inibizione meccanica della Sclerostina (Robling et al. 2008).
pub const SOST_HILL_EXPONENT: f64 = 2.0;

/// Shear stress giugulare nominale a 1g/baseline (dyn/cm^2) e soglia critica protrombotica.
pub const TAU_W_NOMINAL_DYN_CM2: f64 = 2.80;
pub const TAU_W_CRITICAL_DYN_CM2: f64 = 1.20;

/// Velocita di picco giugulare sotto la quale si configura stasi severa (cm/s).
pub const IJV_STASIS_VMAX_CM_S: f64 = 5.0;

/// Carico resistivo giornaliero ARED nominale e critico (kgf).
pub const ARED_NOMINAL_LOAD_KGF: f64 = 125.0;
pub const ARED_CRITICAL_LOAD_KGF: f64 = 55.0;

/// Sclerostina sierica nominale e critica (pmol/L).
pub const SOST_NOMINAL_PMOL_L: f64 = 24.0;
pub const SOST_CRITICAL_PMOL_L: f64 = 55.0;

/// RMSSD vagale nominale e critico (ms).
pub const RMSSD_NOMINAL_MS: f64 = 48.0;
pub const RMSSD_CRITICAL_MS: f64 = 20.0;

/// Indice composito SANS nominale e critico (adimensionale 0..1).
pub const SANS_NOMINAL_INDEX: f64 = 0.15;
pub const SANS_CRITICAL_INDEX: f64 = 0.70;

/// Soglia minima di qualita del segnale (Spectral Entropy SQI) per accettare derivati.
pub const SQI_MIN_VALID_THRESHOLD: f64 = 0.70;

/// Hard Safety Gate 1: Tetto massimo di probabilita a posteriori di trombo senza conferma POCUS.
pub const PRE_POCUS_MAX_THROMBUS_PROB: f64 = 0.45;

/// Hard Safety Gate 2: Limiti emodinamici anti-sincope durante camera LBNP a -30 mmHg.
pub const LBNP_MAX_SYS_BP_DROP_MMHG: f64 = 15.0;
pub const LBNP_MAX_SAFE_HR_BPM: f64 = 115.0;

/// Hard Safety Gate 3: Soglia massima di asimmetria del passo (GAI %) a 0.38g (Marte).
pub const GAI_MAX_SAFE_PCT: f64 = 12.0;

/// Limite massimo di token per singola risposta FastMCP Context-Mode (< 150 token ~= 600 byte).
pub const MAX_MCP_CONTEXT_MODE_BYTES: usize = 600;

/// Sanitizza un valore `f64` sostituendo `NaN` o `Infinity` con un valore sicuro di fallback.
#[inline]
pub fn sanitize_f64(val: f64, fallback: f64) -> f64 {
    if val.is_finite() {
        val
    } else {
        fallback
    }
}

// ============================================================================
// 2. ERRORI FORTEMENTE TIPIZZATI (THISERROR)
// ============================================================================

#[derive(Debug, Error, Clone, PartialEq)]
pub enum AresCoreError {
    #[error("valore numerico non finito rilevato nel campo '{field}'")]
    NonFiniteValue { field: &'static str },

    #[error("argomento fuori dall'intervallo fisico consentito per '{field}': {value} (atteso [{min}, {max}])")]
    OutOfPhysicalBounds {
        field: &'static str,
        value: f64,
        min: f64,
        max: f64,
    },

    #[error("violazione di sicurezza o privacy medica: {reason}")]
    SecurityViolation { reason: String },

    #[error("errore di serializzazione/deserializzazione del contratto: {0}")]
    ContractSerialization(String),
}

// ============================================================================
// 3. TRAIT DISACCOPPIATI DI SICUREZZA E PRIVACY (NASA-STD-3001 VOL. 1 CH. 7)
// ============================================================================

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
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 02 (`A2`)

1. **`test_sanitize_f64_rejects_nan_and_inf`:** Verifica che `f64::NAN`, `f64::INFINITY` e `f64::NEG_INFINITY` vengano sostituiti dal valore di fallback senza propagare `NaN` alle ODE.
2. **`test_noop_security_wraps_untrusted_observation`:** Verifica che `NoOpSecurity::wrap_untrusted_observation` incapsuli sempre le stringhe nel tag XML `<untrusted_telemetry_observation>`.
