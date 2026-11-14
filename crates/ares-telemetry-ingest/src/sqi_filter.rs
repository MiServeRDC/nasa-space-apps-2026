//! Fase 04 (B2): Filtro di qualita del segnale Spectral/Energy Entropy SQI (>= 0.70)
//! Numeric quality heuristic only; not a waveform SQI or HRV estimator.

use crate::bidmc_replayer::BidmcNumericRow;

const WINDOW_LEN: usize = 16;
const EPSILON: f64 = 1e-12;

/// Numeric quality heuristic with a fixed-size history.
#[derive(Debug, Clone)]
pub struct SqiFilter {
    diff_energy_ring: [f64; WINDOW_LEN],
    write_idx: usize,
    last_hr_bpm: Option<f64>,
}

impl Default for SqiFilter {
    fn default() -> Self {
        Self {
            diff_energy_ring: [1.0; WINDOW_LEN],
            write_idx: 0,
            last_hr_bpm: None,
        }
    }
}

impl SqiFilter {
    #[inline]
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns numeric quality and unavailable RMSSD (no beat intervals in this source).
    #[inline]
    pub fn evaluate_row(&mut self, row: &BidmcNumericRow) -> (f64, Option<f64>) {
        let diff_sq = match (row.hr_bpm, self.last_hr_bpm) {
            (Some(curr), Some(prev)) => {
                let d = curr - prev;
                d * d + 0.25
            }
            _ => 1.0,
        };
        if row.hr_bpm.is_some() {
            self.last_hr_bpm = row.hr_bpm;
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
        let f_miss = (row.missing_channels.len() as f64 / 4.0).clamp(0.0, 1.0);
        let sqi = (0.96 - 0.14 * h_norm - 0.18 * f_miss).clamp(0.0, 1.0);

        // Monitor numerics contain no beat intervals: HRV is always unavailable.
        (sqi, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bidmc_replayer::BidmcReplayer;
    use std::path::PathBuf;

    #[test]
    fn test_sqi_filter_remains_above_070_on_nominal_bidmc_rows() {
        let csv_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/bidmc/bidmc_02_Numerics.csv");
        let Ok(replayer) = BidmcReplayer::from_csv_path("bidmc_02", &csv_path) else {
            panic!("Failed to load bidmc_02");
        };
        let mut filter = SqiFilter::new();
        for row in replayer.rows() {
            let (sqi, rmssd) = filter.evaluate_row(row);
            assert!(sqi >= 0.75, "Expected SQI >= 0.75 on clean row, got {sqi}");
            assert!(rmssd.is_none());
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
        let (sqi, rmssd) = filter.evaluate_row(&degraded_row);
        assert!(sqi.is_finite() && (0.0..=1.0).contains(&sqi));
        assert!(rmssd.is_none());
    }
}
