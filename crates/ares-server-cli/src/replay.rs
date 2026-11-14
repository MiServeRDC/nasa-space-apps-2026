//! Deterministic PhysioNet BIDMC v1.0.0 numerics replay (`data/bidmc/`).
//!
//! PROVISIONAL OWNERSHIP: `crates/ares-telemetry-ingest` (`@LelloXV`) owns
//! telemetry ingestion. This module is the minimum reader Block G needs to make
//! `/ws/telemetry` emit recorded vitals instead of a scenario generator, and it
//! must be replaced by `ares_telemetry_ingest::bidmc_replayer` once that crate
//! is merged. It is kept deliberately small for that reason: parse, verify,
//! index by second. No DSP, no SQI, no resampling.
//!
//! Rules enforced here come from `Issue #4` and the `telemetry-replay-verifier`
//! skill:
//! * SHA-256 of every CSV is verified against `data/bidmc/MANIFEST.json` before
//!   a single row is trusted.
//! * Headers and cells are whitespace-trimmed: the raw columns are
//!   `Time [s]`, ` HR`, ` PULSE`, ` RESP`, ` SpO2` (columns 2-5 carry a leading
//!   space).
//! * `NaN` and empty cells become `None`, never `0.0` and never a fabricated
//!   healthy reading. The affected channel names are listed in
//!   [`BidmcSample::missing_channels`].
//! * `Time [s]` is carried as-is in `relative_recording_time_s`. No original
//!   clinical wall-clock timestamp is ever invented.
//! * The native rate is [`NATIVE_RATE_HZ`] (1 Hz) whatever the UI tick rate is.
//! * Records are never concatenated: one `BidmcRecord` is one 8-minute patient.

use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use sha2::{Digest, Sha256};

/// True acquisition rate of the BIDMC `*_Numerics.csv` files.
pub const NATIVE_RATE_HZ: f64 = 1.0;

/// The four recorded channels, in schema spelling, in CSV column order.
pub const RECORDED_CHANNELS: [&str; 4] = [
    "heart_rate_bpm",
    "pulse_rate_bpm",
    "respiration_rate_brpm",
    "spo2_percent",
];

/// Raw CSV headers, in order, before whitespace trimming.
const RAW_HEADERS: [&str; 5] = ["Time [s]", " HR", " PULSE", " RESP", " SpO2"];

/// One recorded second. Every channel is `Option`: `None` is a missing sample.
#[derive(Debug, Clone, PartialEq)]
pub struct BidmcSample {
    /// `Time [s]` exactly as recorded (0..=480 for the bundled records).
    pub relative_time_s: f64,
    pub heart_rate_bpm: Option<f64>,
    pub pulse_rate_bpm: Option<f64>,
    pub respiration_rate_brpm: Option<f64>,
    pub spo2_percent: Option<f64>,
    /// Names of the channels that are `None` at this second, schema spelling.
    pub missing_channels: Vec<&'static str>,
}

impl BidmcSample {
    fn new(relative_time_s: f64, values: [Option<f64>; 4]) -> Self {
        let missing_channels = RECORDED_CHANNELS
            .iter()
            .zip(values)
            .filter(|(_, value)| value.is_none())
            .map(|(name, _)| *name)
            .collect();
        Self {
            relative_time_s,
            heart_rate_bpm: values[0],
            pulse_rate_bpm: values[1],
            respiration_rate_brpm: values[2],
            spo2_percent: values[3],
            missing_channels,
        }
    }
}

/// One verified BIDMC numerics recording, held in memory for replay.
#[derive(Debug, Clone, PartialEq)]
pub struct BidmcRecord {
    record_id: String,
    astronaut_id: &'static str,
    samples: Vec<BidmcSample>,
}

impl BidmcRecord {
    /// Loads `<data_dir>/<record_id>_Numerics.csv` after verifying it against
    /// `<data_dir>/MANIFEST.json`.
    pub fn load(data_dir: &Path, record_id: &str) -> Result<Self, ReplayError> {
        let manifest = Manifest::load(&data_dir.join("MANIFEST.json"))?;
        let entry = manifest.record(record_id)?;
        let csv_path = data_dir.join(&entry.file);

        let bytes = fs::read(&csv_path).map_err(|source| ReplayError::Io {
            path: csv_path.clone(),
            source,
        })?;
        let digest = hex_sha256(&bytes);
        if digest != entry.sha256 {
            return Err(ReplayError::DigestMismatch {
                path: csv_path,
                expected: entry.sha256,
                found: digest,
            });
        }

        let text = String::from_utf8(bytes).map_err(|_| ReplayError::NotUtf8 {
            path: csv_path.clone(),
        })?;
        let samples = parse_numerics(&text, &csv_path)?;
        if samples.len() != entry.rows {
            return Err(ReplayError::RowCountMismatch {
                path: csv_path,
                expected: entry.rows,
                found: samples.len(),
            });
        }

        Ok(Self {
            record_id: record_id.to_string(),
            astronaut_id: subject_id(record_id)?,
            samples,
        })
    }

    /// `source_record_id` for the telemetry packet, e.g. `bidmc_01`.
    pub fn record_id(&self) -> &str {
        &self.record_id
    }

    /// The `astronaut_id` enum member standing for this terrestrial subject.
    pub fn astronaut_id(&self) -> &'static str {
        self.astronaut_id
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    /// The sample recorded at `second`, by index.
    pub fn sample_at_index(&self, second: usize) -> Option<&BidmcSample> {
        self.samples.get(second)
    }

    /// The sample to show after `elapsed` of replay.
    ///
    /// The position is a pure function of elapsed time, which is what keeps the
    /// two console invariants structurally true rather than merely tested: a
    /// `POST /api/stress-test` cannot advance the replay, and re-reading the
    /// same second cannot rewrite recorded history.
    ///
    /// The 8-minute recording loops so the demo can run unattended; the loop
    /// restarts the same patient and never splices a different one.
    pub fn sample_at_elapsed(&self, elapsed: Duration) -> Option<&BidmcSample> {
        if self.samples.is_empty() {
            return None;
        }
        let second = usize::try_from(elapsed.as_secs() % self.samples.len() as u64).ok()?;
        self.samples.get(second)
    }
}

/// Parses the whole numerics CSV, trimming headers and cells.
fn parse_numerics(text: &str, path: &Path) -> Result<Vec<BidmcSample>, ReplayError> {
    let mut lines = text.lines().filter(|line| !line.trim().is_empty());
    let header = lines.next().ok_or_else(|| ReplayError::EmptyFile {
        path: path.to_path_buf(),
    })?;

    let found: Vec<&str> = header.split(',').map(str::trim).collect();
    let expected: Vec<&str> = RAW_HEADERS.iter().map(|h| h.trim()).collect();
    if found != expected {
        return Err(ReplayError::UnexpectedHeader {
            path: path.to_path_buf(),
            expected: expected.join(","),
            found: found.join(","),
        });
    }

    let mut samples = Vec::new();
    for (offset, line) in lines.enumerate() {
        let row = offset + 2; // 1-based, header consumed.
        let cells: Vec<&str> = line.split(',').map(str::trim).collect();
        if cells.len() != RAW_HEADERS.len() {
            return Err(ReplayError::UnexpectedColumnCount {
                path: path.to_path_buf(),
                row,
                expected: RAW_HEADERS.len(),
                found: cells.len(),
            });
        }

        let relative_time_s = parse_time(cells[0]).ok_or_else(|| ReplayError::UnparsableTime {
            path: path.to_path_buf(),
            row,
            value: cells[0].to_string(),
        })?;
        let expected_time = offset as f64;
        if (relative_time_s - expected_time).abs() > f64::EPSILON {
            return Err(ReplayError::NonContiguousTime {
                path: path.to_path_buf(),
                row,
                expected: expected_time,
                found: relative_time_s,
            });
        }

        samples.push(BidmcSample::new(
            relative_time_s,
            [
                parse_channel(cells[1]),
                parse_channel(cells[2]),
                parse_channel(cells[3]),
                parse_channel(cells[4]),
            ],
        ));
    }
    Ok(samples)
}

/// `Time [s]` must always be a finite number: a gap there means the file is not
/// the record the manifest describes.
fn parse_time(cell: &str) -> Option<f64> {
    cell.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// A channel cell. `NaN`, an empty cell, or anything non-finite is a missing
/// sample and stays missing: never 0.0, never carried over from the last row.
fn parse_channel(cell: &str) -> Option<f64> {
    if cell.is_empty() || cell.eq_ignore_ascii_case("nan") {
        return None;
    }
    cell.parse::<f64>().ok().filter(|v| v.is_finite())
}

fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    hex
}

/// The `astronaut_id` enum member for a terrestrial BIDMC subject. The schema
/// enumerates three, so an unknown record id is refused rather than mapped to a
/// crew member that does not exist.
fn subject_id(record_id: &str) -> Result<&'static str, ReplayError> {
    match record_id {
        "bidmc_01" => Ok("BIDMC-SUBJECT-01"),
        "bidmc_02" => Ok("BIDMC-SUBJECT-02"),
        "bidmc_03" => Ok("BIDMC-SUBJECT-03"),
        other => Err(ReplayError::UnknownRecord {
            record_id: other.to_string(),
        }),
    }
}

/// The subset of `MANIFEST.json` the replayer needs.
struct Manifest {
    path: PathBuf,
    records: Vec<ManifestRecord>,
}

#[derive(Clone)]
struct ManifestRecord {
    record_id: String,
    file: String,
    sha256: String,
    rows: usize,
}

impl Manifest {
    fn load(path: &Path) -> Result<Self, ReplayError> {
        let text = fs::read_to_string(path).map_err(|source| ReplayError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|source| ReplayError::Manifest {
                path: path.to_path_buf(),
                message: source.to_string(),
            })?;

        let entries = json
            .get("records")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| ReplayError::Manifest {
                path: path.to_path_buf(),
                message: "missing \"records\" array".to_string(),
            })?;

        let mut records = Vec::with_capacity(entries.len());
        for entry in entries {
            let field = |name: &str| -> Result<String, ReplayError> {
                entry
                    .get(name)
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                    .ok_or_else(|| ReplayError::Manifest {
                        path: path.to_path_buf(),
                        message: format!("record entry missing string field \"{name}\""),
                    })
            };
            let rows = entry
                .get("rows")
                .and_then(serde_json::Value::as_u64)
                .and_then(|rows| usize::try_from(rows).ok())
                .ok_or_else(|| ReplayError::Manifest {
                    path: path.to_path_buf(),
                    message: "record entry missing integer field \"rows\"".to_string(),
                })?;
            records.push(ManifestRecord {
                record_id: field("record_id")?,
                file: field("file")?,
                sha256: field("sha256")?,
                rows,
            });
        }

        Ok(Self {
            path: path.to_path_buf(),
            records,
        })
    }

    fn record(&self, record_id: &str) -> Result<ManifestRecord, ReplayError> {
        self.records
            .iter()
            .find(|record| record.record_id == record_id)
            .cloned()
            .ok_or_else(|| ReplayError::Manifest {
                path: self.path.clone(),
                message: format!("no record \"{record_id}\" in manifest"),
            })
    }
}

/// Why a record could not be trusted. Loading fails loudly: a replay that
/// silently falls back to synthetic data is exactly what Issue #4 forbids.
#[derive(Debug)]
pub enum ReplayError {
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    NotUtf8 {
        path: PathBuf,
    },
    EmptyFile {
        path: PathBuf,
    },
    Manifest {
        path: PathBuf,
        message: String,
    },
    UnknownRecord {
        record_id: String,
    },
    DigestMismatch {
        path: PathBuf,
        expected: String,
        found: String,
    },
    RowCountMismatch {
        path: PathBuf,
        expected: usize,
        found: usize,
    },
    UnexpectedHeader {
        path: PathBuf,
        expected: String,
        found: String,
    },
    UnexpectedColumnCount {
        path: PathBuf,
        row: usize,
        expected: usize,
        found: usize,
    },
    UnparsableTime {
        path: PathBuf,
        row: usize,
        value: String,
    },
    NonContiguousTime {
        path: PathBuf,
        row: usize,
        expected: f64,
        found: f64,
    },
}

impl fmt::Display for ReplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io { path, source } => write!(f, "{}: {source}", path.display()),
            Self::NotUtf8 { path } => write!(f, "{}: not valid UTF-8", path.display()),
            Self::EmptyFile { path } => write!(f, "{}: file is empty", path.display()),
            Self::Manifest { path, message } => write!(f, "{}: {message}", path.display()),
            Self::UnknownRecord { record_id } => write!(
                f,
                "record \"{record_id}\" has no astronaut_id in the schema enum \
                 (expected bidmc_01, bidmc_02 or bidmc_03)"
            ),
            Self::DigestMismatch {
                path,
                expected,
                found,
            } => write!(
                f,
                "{}: SHA-256 mismatch, manifest says {expected} but file is {found}",
                path.display()
            ),
            Self::RowCountMismatch {
                path,
                expected,
                found,
            } => write!(
                f,
                "{}: manifest says {expected} rows, parsed {found}",
                path.display()
            ),
            Self::UnexpectedHeader {
                path,
                expected,
                found,
            } => write!(
                f,
                "{}: expected header [{expected}], found [{found}]",
                path.display()
            ),
            Self::UnexpectedColumnCount {
                path,
                row,
                expected,
                found,
            } => write!(
                f,
                "{}:{row}: expected {expected} columns, found {found}",
                path.display()
            ),
            Self::UnparsableTime { path, row, value } => write!(
                f,
                "{}:{row}: \"Time [s]\" is not a finite number: {value:?}",
                path.display()
            ),
            Self::NonContiguousTime {
                path,
                row,
                expected,
                found,
            } => write!(
                f,
                "{}:{row}: expected relative time {expected} s at 1 Hz, found {found} s",
                path.display()
            ),
        }
    }
}

impl std::error::Error for ReplayError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
#[allow(clippy::panic)]
mod tests {
    use super::*;

    /// `data/bidmc/` relative to this crate.
    fn data_dir() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/bidmc")
            .to_path_buf()
    }

    fn record_01() -> BidmcRecord {
        match BidmcRecord::load(&data_dir(), "bidmc_01") {
            Ok(record) => record,
            Err(error) => panic!("bidmc_01 must load: {error}"),
        }
    }

    #[test]
    fn manifest_digest_and_row_count_are_verified() {
        let record = record_01();
        assert_eq!(record.len(), 481);
        assert_eq!(record.record_id(), "bidmc_01");
        assert_eq!(record.astronaut_id(), "BIDMC-SUBJECT-01");
    }

    #[test]
    fn leading_whitespace_headers_are_trimmed_and_first_row_parses() {
        let record = record_01();
        let first = match record.sample_at_index(0) {
            Some(sample) => sample,
            None => panic!("record has a first sample"),
        };
        assert_eq!(first.relative_time_s, 0.0);
        assert_eq!(first.heart_rate_bpm, Some(94.0));
        assert_eq!(first.pulse_rate_bpm, Some(93.0));
        assert_eq!(first.respiration_rate_brpm, Some(25.0));
        assert_eq!(first.spo2_percent, Some(97.0));
        assert!(first.missing_channels.is_empty());
    }

    /// Issue #4: the 13 `NaN` rows of bidmc_01 stay null and are named.
    #[test]
    fn the_thirteen_missing_seconds_stay_null_and_are_reported() {
        let record = record_01();
        let missing: Vec<f64> = (0..record.len())
            .filter_map(|second| record.sample_at_index(second))
            .filter(|sample| sample.pulse_rate_bpm.is_none() || sample.spo2_percent.is_none())
            .map(|sample| sample.relative_time_s)
            .collect();

        assert_eq!(missing.len(), 13, "bidmc_01 has 13 degraded seconds");
        assert_eq!(missing.first().copied(), Some(111.0));
        assert_eq!(missing.last().copied(), Some(123.0));

        for second in 111..=123 {
            let sample = match record.sample_at_index(second) {
                Some(sample) => sample,
                None => panic!("second {second} exists"),
            };
            assert_eq!(sample.pulse_rate_bpm, None, "PULSE at {second} s");
            assert_eq!(sample.spo2_percent, None, "SpO2 at {second} s");
            assert_eq!(
                sample.missing_channels,
                vec!["pulse_rate_bpm", "spo2_percent"],
            );
            // HR and RESP are recorded throughout the gap: never blanked.
            assert_eq!(sample.heart_rate_bpm, Some(92.0));
            assert!(sample.respiration_rate_brpm.is_some());
        }
    }

    #[test]
    fn replay_position_advances_one_sample_per_second_and_loops() {
        let record = record_01();
        let at = |ms: u64| {
            record
                .sample_at_elapsed(Duration::from_millis(ms))
                .map(|sample| sample.relative_time_s)
        };
        // 20 UI frames inside one second all carry the same recorded sample.
        assert_eq!(at(0), Some(0.0));
        assert_eq!(at(50), Some(0.0));
        assert_eq!(at(950), Some(0.0));
        assert_eq!(at(1_000), Some(1.0));
        assert_eq!(at(1_050), Some(1.0));
        // The 481-sample record wraps to its own start, never to another patient.
        assert_eq!(at(481_000), Some(0.0));
        assert_eq!(at(481_000 + 111_000), Some(111.0));
    }

    #[test]
    fn a_record_outside_the_schema_enum_is_refused() {
        let error = BidmcRecord::load(&data_dir(), "bidmc_99");
        assert!(error.is_err(), "unknown record must not load");
    }

    #[test]
    fn nan_and_empty_cells_are_missing_not_zero() {
        assert_eq!(parse_channel("NaN"), None);
        assert_eq!(parse_channel("nan"), None);
        assert_eq!(parse_channel(""), None);
        assert_eq!(parse_channel("inf"), None);
        assert_eq!(parse_channel("97"), Some(97.0));
    }
}
