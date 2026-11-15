//! Phase 04 (B2): Spectral/Energy Entropy signal quality filter SQI (>= 0.70)
//! with Zero-Order Hold retention of the last valid sample when `SQI < 0.70`.
//!
//! Issue #11 invariant (@MiServeRDC): for 1 Hz numeric sources (`BIDMC v1.0.0`) lacking
//! beat-to-beat R-R intervals, a proxy RMSSD is never synthesized from HR/RESP:
//! `rmssd_ms` remains explicitly `None` with the `BEAT_INTERVALS_NOT_AVAILABLE` flag.

use crate::bidmc_replayer::BidmcNumericRow;
use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;

const WINDOW_LEN: usize = 16;
const EPSILON: f64 = 1e-12;
pub const ZOH_MAX_HOLD_SECONDS: f64 = 30.0;

/// Detailed result of the SQI evaluation and HRV availability.
#[derive(Debug, Clone, PartialEq)]
pub struct SqiEvaluation {
    pub sqi_score: f64,
    pub rmssd_ms: Option<f64>,
    pub quality_flags: Vec<String>,
}

/// O(1) signal quality evaluator (SQI) with Zero-Order Hold memory for real HRV.
#[derive(Debug, Clone)]
pub struct SqiFilter {
    diff_energy_ring: [f64; WINDOW_LEN],
    write_idx: usize,
    last_hr_bpm: Option<f64>,
    last_valid_rmssd_ms: Option<f64>,
    last_valid_rmssd_time_s: Option<f64>,
}

impl Default for SqiFilter {
    fn default() -> Self {
        Self {
            diff_energy_ring: [1.0; WINDOW_LEN],
            write_idx: 0,
            last_hr_bpm: None,
            last_valid_rmssd_ms: None,
            last_valid_rmssd_time_s: None,
        }
    }
}

impl SqiFilter {
    #[inline]
    pub fn new() -> Self {
        Self::default()
    }

    /// Evaluates the numeric sample with an optional `rmssd_ms` measured from a beat-to-beat R-R stream.
    /// If `raw_rmssd_ms` is `None`, `rmssd_ms` remains `None` and `BEAT_INTERVALS_NOT_AVAILABLE` is emitted.
    #[inline]
    pub fn evaluate_row_with_rmssd(
        &mut self,
        row: &BidmcNumericRow,
        raw_rmssd_ms: Option<f64>,
    ) -> SqiEvaluation {
        let finite_hr = row.hr_bpm.filter(|v| v.is_finite());
        let diff_sq = match (finite_hr, self.last_hr_bpm) {
            (Some(curr), Some(prev)) => {
                let d = curr - prev;
                let e = d * d + 0.25;
                if e.is_finite() { e.min(1e12) } else { 1e12 }
            }
            _ => 1.0,
        };
        if let Some(curr) = finite_hr {
            self.last_hr_bpm = Some(curr);
        }

        self.diff_energy_ring[self.write_idx] = diff_sq;
        self.write_idx = (self.write_idx + 1) % WINDOW_LEN;

        let total_energy: f64 = self.diff_energy_ring.iter().sum::<f64>() + EPSILON;
        let mut entropy = 0.0;
        for &e in &self.diff_energy_ring {
            let p = (e + EPSILON) / total_energy;
            entropy -= p * p.ln();
        }
        let h_norm = (entropy / (WINDOW_LEN as f64).ln()).clamp(0.0, 1.0);
        let invalid_channels = [row.hr_bpm, row.pulse_bpm, row.resp_brpm, row.spo2_pct]
            .into_iter()
            .filter(|ch| !ch.is_some_and(f64::is_finite))
            .count();
        let miss_count = row.missing_channels.len().max(invalid_channels);
        let f_miss = (miss_count as f64 / 4.0).clamp(0.0, 1.0);
        let raw_sqi = 0.96 - 0.14 * h_norm - 0.18 * f_miss;
        let sqi_score = if raw_sqi.is_finite() {
            raw_sqi.clamp(0.0, 1.0)
        } else {
            0.0
        };

        let mut quality_flags = Vec::new();
        let valid_input = raw_rmssd_ms.filter(|v| v.is_finite() && *v > 0.0);

        let rmssd_ms = if sqi_score >= SQI_MIN_VALID_THRESHOLD {
            if let Some(rmssd) = valid_input {
                self.last_valid_rmssd_ms = Some(rmssd);
                self.last_valid_rmssd_time_s =
                    row.relative_time_s.is_finite().then_some(row.relative_time_s);
                Some(rmssd)
            } else {
                quality_flags.push("BEAT_INTERVALS_NOT_AVAILABLE".to_string());
                None
            }
        } else {
            quality_flags.push("HOLD_LAST_VALID".to_string());
            let within_zoh_window = match (self.last_valid_rmssd_ms, self.last_valid_rmssd_time_s)
            {
                (Some(held), Some(t0)) if row.relative_time_s.is_finite() => {
                    let elapsed = row.relative_time_s - t0;
                    if (0.0..=ZOH_MAX_HOLD_SECONDS).contains(&elapsed) {
                        Some(held)
                    } else {
                        None
                    }
                }
                _ => None,
            };
            if let Some(held) = within_zoh_window {
                Some(held)
            } else {
                if self.last_valid_rmssd_ms.is_some() {
                    quality_flags.push("ZOH_EXPIRED".to_string());
                    self.last_valid_rmssd_ms = None;
                    self.last_valid_rmssd_time_s = None;
                }
                quality_flags.push("BEAT_INTERVALS_NOT_AVAILABLE".to_string());
                None
            }
        };

        SqiEvaluation {
            sqi_score,
            rmssd_ms,
            quality_flags,
        }
    }

    /// Evaluates a 1 Hz numeric BIDMC row returning SQI, `rmssd_ms: None`, and `quality_flags`.
    #[inline]
    pub fn evaluate_row_detailed(&mut self, row: &BidmcNumericRow) -> SqiEvaluation {
        self.evaluate_row_with_rmssd(row, None)
    }

    /// Updates the window with the current BIDMC row and returns `(sqi_score, rmssd_ms)`.
    #[inline]
    pub fn evaluate_row(&mut self, row: &BidmcNumericRow) -> (f64, Option<f64>) {
        let eval = self.evaluate_row_detailed(row);
        (eval.sqi_score, eval.rmssd_ms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bidmc_replayer::BidmcReplayer;
    use std::path::PathBuf;

    #[test]
    fn test_sqi_filter_remains_above_070_on_nominal_bidmc_rows_without_proxy_rmssd() {
        let csv_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc/bidmc_02_Numerics.csv");
        let Ok(replayer) = BidmcReplayer::from_csv_path("bidmc_02", &csv_path) else {
            panic!("Failed to load bidmc_02");
        };
        let mut filter = SqiFilter::new();
        for row in replayer.rows() {
            let eval = filter.evaluate_row_detailed(row);
            assert!(
                eval.sqi_score >= 0.75,
                "Expected SQI >= 0.75 on clean row, got {}",
                eval.sqi_score
            );
            assert_eq!(eval.rmssd_ms, None);
            assert!(
                eval.quality_flags
                    .iter()
                    .any(|f| f == "BEAT_INTERVALS_NOT_AVAILABLE")
            );
        }
    }

    #[test]
    fn test_sqi_degrades_gracefully_on_missing_channels_without_nan() {
        let mut filter = SqiFilter::new();
        let degraded_row = BidmcNumericRow {
            record_id: "bidmc_01".to_string(),
            relative_time_s: 120.0,
            hr_bpm: Some(92.0),
            pulse_bpm: None,
            resp_brpm: Some(24.0),
            spo2_pct: None,
            missing_channels: vec!["pulse_rate_bpm".to_string(), "spo2_pct".to_string()],
        };
        let eval = filter.evaluate_row_detailed(&degraded_row);
        assert!(eval.sqi_score.is_finite() && (0.0..=1.0).contains(&eval.sqi_score));
        assert_eq!(eval.rmssd_ms, None);
        assert!(
            eval.quality_flags
                .iter()
                .any(|f| f == "BEAT_INTERVALS_NOT_AVAILABLE")
        );
    }

    #[test]
    fn test_sqi_preserves_explicit_beat_interval_rmssd() {
        let mut filter = SqiFilter::new();
        let clean_row = BidmcNumericRow {
            record_id: "rr_stream".to_string(),
            relative_time_s: 1.0,
            hr_bpm: Some(68.0),
            pulse_bpm: Some(68.0),
            resp_brpm: Some(14.0),
            spo2_pct: Some(98.0),
            missing_channels: Vec::new(),
        };
        let eval = filter.evaluate_row_with_rmssd(&clean_row, Some(44.5));
        assert!(eval.sqi_score >= 0.75);
        assert_eq!(eval.rmssd_ms, Some(44.5));
        assert!(
            !eval
                .quality_flags
                .iter()
                .any(|f| f == "BEAT_INTERVALS_NOT_AVAILABLE")
        );
    }
}
