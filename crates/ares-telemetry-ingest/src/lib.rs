//! `ares-telemetry-ingest` — Blocco B (`1. GATHER`, Fasi 03 B1 & 04 B2).
//!
//! Esporta il motore di replay deterministico `BIDMC v1.0.0` (`bidmc_replayer`),
//! il filtro di qualità del segnale ad entropia spettrale di Shannon (`sqi_filter`)
//! e il combinatore di scenario (`scenario_overlay`).

pub mod bidmc_replayer;
pub mod scenario_overlay;
pub mod sqi_filter;

pub use bidmc_replayer::{BidmcNumericRow, BidmcReplayer, IngestError};
pub use scenario_overlay::{
    biometrics_with_signal_quality, merge_biometrics_with_rmssd, merge_biometrics_with_scenario,
};
pub use sqi_filter::{SqiEvaluation, SqiFilter};
