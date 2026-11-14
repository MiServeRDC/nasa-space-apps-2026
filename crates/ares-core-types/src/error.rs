//! Fase 02 (A2): Errori fortemente tipizzati del dominio core (`thiserror::Error`).

use thiserror::Error;

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

    #[error("violazione monotonia quantilica: q05={q05}, q50={q50}, q95={q95}")]
    QuantileCrossing { q05: f64, q50: f64, q95: f64 },

    #[error("dimensione frame binario non valida: attesi {expected} byte, trovati {actual}")]
    InvalidBinaryFrameLength { expected: usize, actual: usize },

    #[error("magic number frame binario non valido: trovato 0x{found:08X}")]
    InvalidBinaryFrameMagic { found: u32 },

    #[error("versione schema frame binario non supportata: trovata {found}")]
    InvalidBinaryFrameVersion { found: u16 },

    #[error("checksum CRC-32C frame binario non valido: atteso 0x{expected:08X}, trovato 0x{found:08X}")]
    InvalidBinaryFrameCrc { expected: u32, found: u32 },

    #[error("ring buffer SHM/Seqlock vuoto: nessun frame pubblicato")]
    ShmRingEmpty,

    #[error("lettura inconsistente dal ring buffer Seqlock dopo tentativi massimi")]
    ShmRingTornReadExhausted,

    #[error("trasporto shared-memory non disponibile: {0}")]
    ShmRingUnavailable(String),
}
