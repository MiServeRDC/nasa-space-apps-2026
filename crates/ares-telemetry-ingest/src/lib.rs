#![forbid(unsafe_code)]

//! `ares-telemetry-ingest` — Block B (`1. GATHER`, Phases 03 B1, 04 B2 & Phase 31 L3).
//!
//! Exports the deterministic `BIDMC v1.0.0` replay engine (`bidmc_replayer`),
//! Shannon spectral entropy signal quality filter (`sqi_filter`),
//! scenario combiner (`scenario_overlay`), contactless Doppler radar
//! demodulation (`radar_csi_dsp`), YIN vocal acoustic biomarkers (`vocal_acoustic_dsp`),
//! and Pan-Tompkins R-R 125-500 Hz extractor (`waveform_rr_extractor`).

pub mod anomaly_injection;
pub mod bidmc_replayer;
pub mod hardware_adapter;
pub mod radar_csi_dsp;
pub mod scenario_overlay;
pub mod sqi_filter;
pub mod vocal_acoustic_dsp;
pub mod waveform_rr_extractor;
pub mod wearable_packet;

pub use anomaly_injection::{AnomalyInjection, InjectedAnomalyKind, InjectionProfile};
pub use bidmc_replayer::{BidmcNumericRow, BidmcReplayer, IngestError};
pub use hardware_adapter::*;
pub use radar_csi_dsp::{
    BiquadSos, DspError, RADAR_DECIMATED_HZ, RADAR_RING_LEN, RadarCarrierBand, RadarCsiConfig,
    RadarCsiProcessor, RadarVitalEstimate, SPEED_OF_LIGHT_M_S,
};
pub use scenario_overlay::{
    GatherDspOverlay, biometrics_with_signal_quality, merge_biometrics_with_gather_dsp,
    merge_biometrics_with_rmssd, merge_biometrics_with_scenario,
};
pub use sqi_filter::{SqiEvaluation, SqiFilter};
pub use vocal_acoustic_dsp::{
    MAX_GLOTTAL_PEAKS, MAX_YIN_LAG, MAX_YIN_WORK_SAMPLES, VAD_HISTORY_LEN, VocalAcousticAnalyzer,
    VocalAnalyzerConfig, VocalBiomarkerFrame,
};
pub use waveform_rr_extractor::{
    DetectedQrsBeat, MAX_MWI_WINDOW, MAX_SIGNAL_HISTORY, NN_RING_CAPACITY, PanTompkinsConfig,
    SEARCHBACK_CANDIDATES, TimeDomainHrvMetrics, WaveformRrExtractor,
};
pub use wearable_packet::{
    ValidatedTelemetryFrame, WEARABLE_PACKET_BYTES, WEARABLE_SYNC_WORD, WearableSensorPacket,
    compute_crc16_ccitt,
};
