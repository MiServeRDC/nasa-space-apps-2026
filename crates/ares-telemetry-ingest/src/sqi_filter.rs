//! Fase 04 (B2): Filtro di qualita del segnale Spectral/Energy Entropy SQI (>= 0.70)
//! con mantenimento Zero-Order Hold dell'ultimo campione valido quando `SQI < 0.70`.
//!
//! Invariante Issue #11 (@MiServeRDC): per sorgenti numeriche 1 Hz (`BIDMC v1.0.0`) prive di
//! intervalli R-R beat-to-beat, non viene mai sintetizzato un RMSSD proxy da HR/RESP:
//! `rmssd_ms` resta esplicitamente `None` con flag `BEAT_INTERVALS_NOT_AVAILABLE`.

use crate::bidmc_replayer::BidmcNumericRow;
use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;

const WINDOW_LEN: usize = 16;
const EPSILON: f64 = 1e-12;

/// Risultato dettagliato della valutazione SQI e disponibilita HRV.
#[derive(Debug, Clone, PartialEq)]
pub struct SqiEvaluation {
    pub sqi_score: f64,
    pub rmssd_ms: Option<f64>,
    pub quality_flags: Vec<String>,
}

/// Valutatore O(1) di qualita del segnale (SQI) con memoria Zero-Order Hold per HRV reali.
#[derive(Debug, Clone)]
pub struct SqiFilter {
    diff_energy_ring: [f64; WINDOW_LEN],
    write_idx: usize,
    last_hr_bpm: Option<f64>,
    last_valid_rmssd_ms: Option<f64>,
}

impl Default for SqiFilter {
    fn default() -> Self {
        Self {
            diff_energy_ring: [1.0; WINDOW_LEN],
            write_idx: 0,
            last_hr_bpm: None,
            last_valid_rmssd_ms: None,
        }
    }
}

impl SqiFilter {
    #[inline]
    pub fn new() -> Self {
        Self::default()
    }

    /// Valuta il campione numerico con eventuale `rmssd_ms` misurato da stream beat-to-beat R-R.
    /// Se `raw_rmssd_ms` e `None`, `rmssd_ms` rimane `None` e viene emesso `BEAT_INTERVALS_NOT_AVAILABLE`.
    #[inline]
    pub fn evaluate_row_with_rmssd(
        &mut self,
        row: &BidmcNumericRow,
        raw_rmssd_ms: Option<f64>,
    ) -> SqiEvaluation {
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
        let sqi_score = (0.96 - 0.14 * h_norm - 0.18 * f_miss).clamp(0.0, 1.0);

        let mut quality_flags = Vec::new();
        let valid_input = raw_rmssd_ms.filter(|v| v.is_finite() && *v > 0.0);

        let rmssd_ms = if sqi_score >= SQI_MIN_VALID_THRESHOLD {
            if let Some(rmssd) = valid_input {
                self.last_valid_rmssd_ms = Some(rmssd);
                Some(rmssd)
            } else {
                quality_flags.push("BEAT_INTERVALS_NOT_AVAILABLE".to_string());
                None
            }
        } else {
            quality_flags.push("HOLD_LAST_VALID".to_string());
            if let Some(held) = self.last_valid_rmssd_ms {
                Some(held)
            } else {
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

    /// Valuta una riga BIDMC numerica 1 Hz restituendo SQI, `rmssd_ms: None` e `quality_flags`.
    #[inline]
    pub fn evaluate_row_detailed(&mut self, row: &BidmcNumericRow) -> SqiEvaluation {
        self.evaluate_row_with_rmssd(row, None)
    }

    /// Aggiorna la finestra con la riga BIDMC corrente e restituisce `(sqi_score, rmssd_ms)`.
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
