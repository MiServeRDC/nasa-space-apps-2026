use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const BIDMC_NATIVE_RATE_HZ: u32 = 1;
pub const UI_REFRESH_RATE_HZ: u32 = 20;
pub const BIDMC_SOURCE: &str = "RECORDED_TERRESTRIAL_BIDMC_CSV";
const SAMPLE_COUNT: usize = 481;
const FRAMES_PER_SAMPLE: u64 = (UI_REFRESH_RATE_HZ / BIDMC_NATIVE_RATE_HZ) as u64;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BidmcRecord {
    Bidmc01,
    Bidmc02,
    Bidmc03,
}

impl BidmcRecord {
    fn csv(self) -> &'static [u8] {
        match self {
            Self::Bidmc01 => include_bytes!("../../../data/bidmc/bidmc_01_Numerics.csv"),
            Self::Bidmc02 => include_bytes!("../../../data/bidmc/bidmc_02_Numerics.csv"),
            Self::Bidmc03 => include_bytes!("../../../data/bidmc/bidmc_03_Numerics.csv"),
        }
    }
}

#[derive(Debug, Error)]
pub enum ReplayError {
    #[error("invalid BIDMC CSV: {0}")]
    Csv(#[from] csv::Error),
    #[error("expected recording time {expected} s, found {actual} s")]
    Timestamp { expected: usize, actual: i64 },
    #[error("expected 481 BIDMC samples, found {0}")]
    SampleCount(usize),
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Sample {
    pub source_record_id: BidmcRecord,
    pub relative_recording_time_s: usize,
    pub heart_rate_bpm: Option<f64>,
    pub pulse_rate_bpm: Option<f64>,
    pub resp_rate_brpm: Option<f64>,
    pub spo2_pct: Option<f64>,
    pub missing_channels: Vec<&'static str>,
}

#[derive(Deserialize)]
struct CsvRow {
    #[serde(rename = "Time [s]")]
    time: i64,
    #[serde(rename = "HR")]
    hr: String,
    #[serde(rename = "PULSE")]
    pulse: String,
    #[serde(rename = "RESP")]
    resp: String,
    #[serde(rename = "SpO2")]
    spo2: String,
}

fn measurement(raw: &str, channel: &'static str, missing: &mut Vec<&'static str>) -> Option<f64> {
    let value = raw.parse::<f64>().ok().filter(|value| value.is_finite());
    if value.is_none() {
        missing.push(channel);
    }
    value
}

/// One terrestrial ICU recording. Each replay loops independently.
pub struct BidmcReplay {
    samples: Box<[Sample; SAMPLE_COUNT]>,
}

impl BidmcReplay {
    pub fn load(record: BidmcRecord) -> Result<Self, ReplayError> {
        let mut csv = csv::ReaderBuilder::new()
            .trim(csv::Trim::All)
            .from_reader(record.csv());
        let mut samples = Vec::with_capacity(SAMPLE_COUNT);
        for (expected, row) in csv.deserialize::<CsvRow>().enumerate() {
            let row = row?;
            if usize::try_from(row.time) != Ok(expected) {
                return Err(ReplayError::Timestamp {
                    expected,
                    actual: row.time,
                });
            }
            let mut missing_channels = Vec::new();
            samples.push(Sample {
                source_record_id: record,
                relative_recording_time_s: expected,
                heart_rate_bpm: measurement(&row.hr, "heart_rate_bpm", &mut missing_channels),
                pulse_rate_bpm: measurement(&row.pulse, "pulse_rate_bpm", &mut missing_channels),
                resp_rate_brpm: measurement(&row.resp, "resp_rate_brpm", &mut missing_channels),
                spo2_pct: measurement(&row.spo2, "spo2_pct", &mut missing_channels),
                missing_channels,
            });
        }
        let samples = samples
            .into_boxed_slice()
            .try_into()
            .map_err(|samples: Box<[Sample]>| ReplayError::SampleCount(samples.len()))?;
        Ok(Self { samples })
    }

    pub fn samples(&self) -> &[Sample] {
        self.samples.as_slice()
    }

    /// Look up a native sample by elapsed replay seconds, wrapping after the last row.
    pub fn sample_at(&self, replay_second: u64) -> &Sample {
        &self.samples[(replay_second % SAMPLE_COUNT as u64) as usize]
    }

    /// Hold the recorded sample between native ticks. UI frames are not new measurements.
    pub fn sample_for_ui_frame(&self, frame: u64) -> &Sample {
        self.sample_at(frame / FRAMES_PER_SAMPLE)
    }
}
