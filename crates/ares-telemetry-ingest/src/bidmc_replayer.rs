//! Phase 03 (B1): Deterministic replay of PhysioNet BIDMC v1.0.0 (`1 Hz`, `0..480 s`).
//!
//! Strictly respects Issue #4 (`@MiServeRDC`) and the `telemetry-replay-verifier` skill:
//! 1. Mandatory trimming of leading spaces in the CSV headers (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`).
//! 2. Explicit preservation of `Option<f64>::None` for the 13 missing samples in `bidmc_01_Numerics.csv`
//!    without ever replacing them with `0.0` or fictitious healthy values.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq)]
pub enum IngestError {
    #[error("cannot read BIDMC CSV file '{path}': {reason}")]
    CsvIoError { path: String, reason: String },

    #[error("invalid BIDMC CSV header in '{path}': found '{found}'")]
    InvalidCsvHeader { path: String, found: String },

    #[error("BIDMC dataset '{record_id}' contains no valid rows")]
    EmptyDataset { record_id: String },

    #[error("invalid 'Time [s]' timestamp at line {line}: '{raw}'")]
    InvalidTimestamp { line: usize, raw: String },

    #[error("invalid wearable packet length: expected {expected} bytes, found {actual}")]
    InvalidWearablePacketLength { expected: usize, actual: usize },

    #[error("invalid wearable sync word: found 0x{found:04X}")]
    InvalidWearableSyncWord { found: u16 },

    #[error("invalid wearable CRC-16-CCITT: expected 0x{expected:04X}, found 0x{found:04X}")]
    InvalidWearableCrc { expected: u16, found: u16 },

    #[error("GATHER DSP module error: {0}")]
    Dsp(#[from] crate::radar_csi_dsp::DspError),
}

/// Single 1 Hz numeric sample extracted from `bidmc_*_Numerics.csv`.
#[derive(Debug, Clone, PartialEq)]
pub struct BidmcNumericRow {
    pub record_id: String,
    pub relative_time_s: f64,
    pub hr_bpm: Option<f64>,
    pub pulse_bpm: Option<f64>,
    pub resp_brpm: Option<f64>,
    pub spo2_pct: Option<f64>,
    pub missing_channels: Vec<String>,
}

/// In-memory deterministic replay engine for a BIDMC recording (`481` rows, `0..480 s`).
#[derive(Debug, Clone)]
pub struct BidmcReplayer {
    record_id: String,
    rows: Vec<BidmcNumericRow>,
    cursor_idx: usize,
}

impl BidmcReplayer {
    /// Loads and validates a `bidmc_*_Numerics.csv` file, trimming the spaces
    /// in the headers (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`) and preserving missing values as `None`.
    pub fn from_csv_path(record_id: &str, path: &Path) -> Result<Self, IngestError> {
        let file = File::open(path).map_err(|e| IngestError::CsvIoError {
            path: path.display().to_string(),
            reason: e.to_string(),
        })?;
        let reader = BufReader::new(file);
        Self::from_buf_read(record_id, &path.display().to_string(), reader)
    }

    /// Loads and validates a BIDMC CSV stream from any `BufRead` (also useful for in-memory tests).
    pub fn from_buf_read<R: BufRead>(
        record_id: &str,
        source_label: &str,
        reader: R,
    ) -> Result<Self, IngestError> {
        let mut lines = reader.lines();

        let header_line = lines
            .next()
            .ok_or_else(|| IngestError::EmptyDataset {
                record_id: record_id.to_string(),
            })?
            .map_err(|e| IngestError::CsvIoError {
                path: source_label.to_string(),
                reason: e.to_string(),
            })?;

        let headers: Vec<&str> = header_line.split(',').map(str::trim).collect();
        if headers != ["Time [s]", "HR", "PULSE", "RESP", "SpO2"] {
            return Err(IngestError::InvalidCsvHeader {
                path: source_label.to_string(),
                found: header_line,
            });
        }

        let mut rows = Vec::with_capacity(481);
        for (idx, line_res) in lines.enumerate() {
            let line_num = idx + 2;
            let line = line_res.map_err(|e| IngestError::CsvIoError {
                path: source_label.to_string(),
                reason: e.to_string(),
            })?;
            if line.trim().is_empty() {
                continue;
            }
            let cols: Vec<&str> = line.split(',').map(str::trim).collect();
            let raw_time = cols.first().copied().unwrap_or("");
            let relative_time_s = raw_time.parse::<f64>().map_err(|_| {
                IngestError::InvalidTimestamp {
                    line: line_num,
                    raw: raw_time.to_string(),
                }
            })?;

            let mut missing_channels = Vec::new();
            let hr_bpm = Self::parse_nullable_channel(
                cols.get(1).copied(),
                "heart_rate_bpm",
                &mut missing_channels,
            );
            let pulse_bpm = Self::parse_nullable_channel(
                cols.get(2).copied(),
                "pulse_rate_bpm",
                &mut missing_channels,
            );
            let resp_brpm = Self::parse_nullable_channel(
                cols.get(3).copied(),
                "resp_rate_brpm",
                &mut missing_channels,
            );
            let spo2_pct = Self::parse_nullable_channel(
                cols.get(4).copied(),
                "spo2_pct",
                &mut missing_channels,
            );

            rows.push(BidmcNumericRow {
                record_id: record_id.to_string(),
                relative_time_s,
                hr_bpm,
                pulse_bpm,
                resp_brpm,
                spo2_pct,
                missing_channels,
            });
        }

        if rows.is_empty() {
            return Err(IngestError::EmptyDataset {
                record_id: record_id.to_string(),
            });
        }

        Ok(Self {
            record_id: record_id.to_string(),
            rows,
            cursor_idx: 0,
        })
    }

    #[inline]
    fn parse_nullable_channel(
        raw_cell: Option<&str>,
        channel_name: &'static str,
        missing: &mut Vec<String>,
    ) -> Option<f64> {
        match raw_cell {
            Some(s) if !s.is_empty() && !s.eq_ignore_ascii_case("nan") => match s.parse::<f64>() {
                Ok(v) if v.is_finite() => Some(v),
                _ => {
                    missing.push(channel_name.to_string());
                    None
                }
            },
            _ => {
                missing.push(channel_name.to_string());
                None
            }
        }
    }

    /// Returns the total number of loaded 1 Hz samples (481 for `0..480 s`).
    #[inline]
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    /// Returns the current sample and cyclically advances the cursor (`0..len`).
    #[inline]
    pub fn next_row(&mut self) -> &BidmcNumericRow {
        let idx = self.cursor_idx % self.rows.len();
        self.cursor_idx = (self.cursor_idx + 1) % self.rows.len();
        &self.rows[idx]
    }

    /// Deterministic direct access by relative second `0..=480`.
    #[inline]
    pub fn row_at_second(&self, second_idx: usize) -> &BidmcNumericRow {
        let clamped = second_idx.min(self.rows.len().saturating_sub(1));
        &self.rows[clamped]
    }

    /// Returns the immutable slice of all loaded rows.
    #[inline]
    pub fn rows(&self) -> &[BidmcNumericRow] {
        &self.rows
    }

    #[inline]
    pub fn record_id(&self) -> &str {
        &self.record_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::path::PathBuf;

    fn bidmc_data_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc")
    }

    #[test]
    fn test_bidmc_01_loads_481_rows_and_13_missing_pulse_spo2() {
        let csv_path = bidmc_data_dir().join("bidmc_01_Numerics.csv");
        let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path);
        assert!(replayer.is_ok(), "Failed to load bidmc_01_Numerics.csv");
        let Ok(replayer) = replayer else {
            return;
        };

        assert_eq!(replayer.record_id(), "bidmc_01");
        assert_eq!(replayer.len(), 481);
        assert!(!replayer.is_empty());
        assert!((replayer.row_at_second(0).relative_time_s - 0.0).abs() < f64::EPSILON);
        assert!((replayer.row_at_second(480).relative_time_s - 480.0).abs() < f64::EPSILON);

        let missing_pulse_count = replayer
            .rows()
            .iter()
            .filter(|r| r.pulse_bpm.is_none())
            .count();
        let missing_spo2_count = replayer
            .rows()
            .iter()
            .filter(|r| r.spo2_pct.is_none())
            .count();
        assert_eq!(missing_pulse_count, 13);
        assert_eq!(missing_spo2_count, 13);

        for row in replayer.rows().iter().filter(|r| r.pulse_bpm.is_none()) {
            assert!(row.missing_channels.contains(&"pulse_rate_bpm".to_string()));
            assert!(row.missing_channels.contains(&"spo2_pct".to_string()));
        }
    }

    #[test]
    fn test_bidmc_02_and_03_have_zero_missing_values() {
        for (rec_id, filename) in [
            ("bidmc_02", "bidmc_02_Numerics.csv"),
            ("bidmc_03", "bidmc_03_Numerics.csv"),
        ] {
            let csv_path = bidmc_data_dir().join(filename);
            let replayer = BidmcReplayer::from_csv_path(rec_id, &csv_path);
            assert!(replayer.is_ok(), "Failed to load {filename}");
            let Ok(replayer) = replayer else {
                return;
            };

            assert_eq!(replayer.len(), 481);
            let any_missing = replayer
                .rows()
                .iter()
                .any(|r| !r.missing_channels.is_empty());
            assert!(!any_missing, "Expected 0 missing channels in {rec_id}");
        }
    }

    #[test]
    fn test_bidmc_replayer_cyclic_cursor_and_header_validation() {
        let csv_path = bidmc_data_dir().join("bidmc_02_Numerics.csv");
        let Ok(mut replayer) = BidmcReplayer::from_csv_path("bidmc_02", &csv_path) else {
            panic!("Failed to load bidmc_02");
        };

        let first_time = replayer.next_row().relative_time_s;
        assert!((first_time - 0.0).abs() < f64::EPSILON);
        for _ in 1..481 {
            let _ = replayer.next_row();
        }
        let wrapped_time = replayer.next_row().relative_time_s;
        assert!((wrapped_time - 0.0).abs() < f64::EPSILON);

        let bad_csv = Cursor::new("WrongHeader,HR,PULSE\n0,80,80\n");
        let err = BidmcReplayer::from_buf_read("bad", "memory", bad_csv);
        assert!(matches!(err, Err(IngestError::InvalidCsvHeader { .. })));
    }
}
