//! Fase 31 (L3): Rilevatore QRS Pan-Tompkins in Puro Rust per forme d'onda 125-500 Hz,
//! rigetto ectopie secondo Malik (+/- 20%) e calcolo RMSSD / SDNN / pNN50.
//!
//! INVARIANTE CRITICO ISSUE #11: I CSV numerici a 1 Hz (`BidmcReplayer`) non passano MAI
//! per questo modulo e mantengono rigorosamente `rmssd_ms: None` + `BEAT_INTERVALS_NOT_AVAILABLE`.

use crate::radar_csi_dsp::{BiquadSos, DspError};
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

pub const MAX_MWI_WINDOW: usize = 128;
pub const MAX_SIGNAL_HISTORY: usize = 256;
pub const NN_RING_CAPACITY: usize = 128;
pub const SEARCHBACK_CANDIDATES: usize = 16;
const EPSILON: f64 = 1e-12;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PanTompkinsConfig {
    pub sample_rate_hz: f64,
    pub refractory_period_ms: f64,
    pub rr_min_ms: f64,
    pub rr_max_ms: f64,
    pub malik_ectopic_quotient: f64,
    pub min_nn_intervals: usize,
    pub min_consecutive_pairs: usize,
}

impl PanTompkinsConfig {
    pub fn for_sample_rate(sample_rate_hz: f64) -> Result<Self, DspError> {
        if !sample_rate_hz.is_finite() || !(125.0..=500.0).contains(&sample_rate_hz) {
            return Err(DspError::UnsupportedWaveformSampleRate { sample_rate_hz });
        }
        Ok(Self {
            sample_rate_hz,
            refractory_period_ms: 200.0,
            rr_min_ms: 300.0,
            rr_max_ms: 2000.0,
            malik_ectopic_quotient: 0.20,
            min_nn_intervals: 8,
            min_consecutive_pairs: 6,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct DetectedQrsBeat {
    pub r_peak_time_s: f64,
    pub rr_interval_ms: Option<f64>,
    pub accepted_as_sinus_nn: bool,
    pub triggered_by_searchback: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TimeDomainHrvMetrics {
    pub valid_nn_count: usize,
    pub consecutive_pair_count: usize,
    pub rejected_ectopic_count: u64,
    pub mean_hr_bpm: Option<f64>,
    pub rmssd_ms: Option<f64>,
    pub sdnn_ms: Option<f64>,
    pub pnn50_pct: Option<f64>,
    pub validation_status: ModelValidationStatus,
}

#[derive(Debug, Clone, Copy, Default)]
struct CandidatePeak {
    sample_idx: u64,
    peaki: f64,
    max_slope: f64,
    refined_time_s: f64,
    valid: bool,
}

#[derive(Debug, Clone)]
pub struct WaveformRrExtractor {
    config: PanTompkinsConfig,
    bp_stage1: BiquadSos,
    bp_stage2: BiquadSos,
    deriv_ring: [f64; 5],
    deriv_idx: usize,
    mwi_len: usize,
    mwi_ring: [f64; MAX_MWI_WINDOW],
    mwi_idx: usize,
    mwi_running_sum: f64,
    filtered_history: [f64; MAX_SIGNAL_HISTORY],
    slope_history: [f64; MAX_SIGNAL_HISTORY],
    sample_counter: u64,
    warmup_samples: u64,
    warmup_max_mwi: f64,
    warmup_done: bool,
    prev_mwi_2: f64,
    prev_mwi_1: f64,
    spki: f64,
    npki: f64,
    threshold_i1: f64,
    threshold_i2: f64,
    last_qrs_sample: Option<u64>,
    last_qrs_time_s: Option<f64>,
    last_qrs_max_slope: f64,
    searchback_ring: [CandidatePeak; SEARCHBACK_CANDIDATES],
    searchback_write_idx: usize,
    prev_beat_was_valid_nn: bool,
    last_valid_nn_ms: Option<f64>,
    nn_ring: [f64; NN_RING_CAPACITY],
    nn_write_idx: usize,
    nn_len: usize,
    diff_nn_ring: [f64; NN_RING_CAPACITY],
    diff_write_idx: usize,
    diff_len: usize,
    rejected_ectopic_count: u64,
}

impl WaveformRrExtractor {
    pub fn new(config: PanTompkinsConfig) -> Result<Self, DspError> {
        if !config.sample_rate_hz.is_finite() || !(125.0..=500.0).contains(&config.sample_rate_hz) {
            return Err(DspError::UnsupportedWaveformSampleRate {
                sample_rate_hz: config.sample_rate_hz,
            });
        }
        if !config.refractory_period_ms.is_finite()
            || config.refractory_period_ms < 100.0
            || !config.rr_min_ms.is_finite()
            || !config.rr_max_ms.is_finite()
            || config.rr_min_ms <= 0.0
            || config.rr_max_ms <= config.rr_min_ms
            || !config.malik_ectopic_quotient.is_finite()
            || config.malik_ectopic_quotient <= 0.0
            || config.malik_ectopic_quotient >= 1.0
        {
            return Err(DspError::InvalidFilterQualityFactor {
                q_factor: config.malik_ectopic_quotient,
            });
        }

        let bp_stage1 = BiquadSos::design_bandpass_2nd(config.sample_rate_hz, 5.0, 15.0)?;
        let bp_stage2 = BiquadSos::design_bandpass_2nd(config.sample_rate_hz, 5.0, 15.0)?;
        let mwi_len = (0.150 * config.sample_rate_hz)
            .round()
            .clamp(8.0, MAX_MWI_WINDOW as f64) as usize;
        let warmup_samples = (1.5 * config.sample_rate_hz).round() as u64;

        Ok(Self {
            config,
            bp_stage1,
            bp_stage2,
            deriv_ring: [0.0; 5],
            deriv_idx: 0,
            mwi_len,
            mwi_ring: [0.0; MAX_MWI_WINDOW],
            mwi_idx: 0,
            mwi_running_sum: 0.0,
            filtered_history: [0.0; MAX_SIGNAL_HISTORY],
            slope_history: [0.0; MAX_SIGNAL_HISTORY],
            sample_counter: 0,
            warmup_samples,
            warmup_max_mwi: 0.0,
            warmup_done: false,
            prev_mwi_2: 0.0,
            prev_mwi_1: 0.0,
            spki: 0.0,
            npki: 0.0,
            threshold_i1: 0.0,
            threshold_i2: 0.0,
            last_qrs_sample: None,
            last_qrs_time_s: None,
            last_qrs_max_slope: 0.0,
            searchback_ring: [CandidatePeak::default(); SEARCHBACK_CANDIDATES],
            searchback_write_idx: 0,
            prev_beat_was_valid_nn: false,
            last_valid_nn_ms: None,
            nn_ring: [0.0; NN_RING_CAPACITY],
            nn_write_idx: 0,
            nn_len: 0,
            diff_nn_ring: [0.0; NN_RING_CAPACITY],
            diff_write_idx: 0,
            diff_len: 0,
            rejected_ectopic_count: 0,
        })
    }

    pub fn push_sample(&mut self, raw_ecg_mv: f64) -> Option<DetectedQrsBeat> {
        let x_safe = if raw_ecg_mv.is_finite() {
            raw_ecg_mv
        } else {
            0.0
        };
        let xf = self.bp_stage2.step(self.bp_stage1.step(x_safe));
        let hist_idx = (self.sample_counter as usize) % MAX_SIGNAL_HISTORY;
        self.filtered_history[hist_idx] = xf;

        self.deriv_ring[self.deriv_idx] = xf;
        let x_n = self.deriv_ring[self.deriv_idx];
        let x_n1 = self.deriv_ring[(self.deriv_idx + 4) % 5];
        let x_n3 = self.deriv_ring[(self.deriv_idx + 2) % 5];
        let x_n4 = self.deriv_ring[(self.deriv_idx + 1) % 5];
        self.deriv_idx = (self.deriv_idx + 1) % 5;

        let y_d = if self.sample_counter >= 4 {
            (self.config.sample_rate_hz / 8.0) * (-x_n4 - 2.0 * x_n3 + 2.0 * x_n1 + x_n)
        } else {
            0.0
        };
        self.slope_history[hist_idx] = y_d.abs();

        let y_sq = y_d * y_d;
        let oldest = self.mwi_ring[self.mwi_idx];
        self.mwi_ring[self.mwi_idx] = y_sq;
        self.mwi_idx = (self.mwi_idx + 1) % self.mwi_len;
        self.mwi_running_sum += y_sq - oldest;

        if self.sample_counter > 0 && self.sample_counter.is_multiple_of(1024) {
            self.mwi_running_sum = self.mwi_ring[..self.mwi_len].iter().sum();
        }
        let y_mwi = (self.mwi_running_sum / (self.mwi_len as f64)).max(0.0);

        let n = self.sample_counter;
        if !self.warmup_done {
            if y_mwi > self.warmup_max_mwi {
                self.warmup_max_mwi = y_mwi;
            }
            if n + 1 >= self.warmup_samples {
                self.warmup_done = true;
                self.spki = 0.80 * self.warmup_max_mwi;
                self.npki = 0.05 * self.warmup_max_mwi;
                self.update_thresholds();
            }
            self.prev_mwi_2 = self.prev_mwi_1;
            self.prev_mwi_1 = y_mwi;
            self.sample_counter = self.sample_counter.saturating_add(1);
            return None;
        }

        let mut detected_beat: Option<DetectedQrsBeat> = None;

        if n >= 2 && self.prev_mwi_1 > self.prev_mwi_2 && self.prev_mwi_1 >= y_mwi && self.prev_mwi_1 > 1e-12 {
            let peak_sample = n - 1;
            let peaki = self.prev_mwi_1;
            let max_slope = self.max_slope_in_window(peak_sample);
            let refined_time_s = self.refine_r_peak_time_s(peak_sample);

            if self.spki <= 1e-18 {
                self.spki = peaki;
                self.npki = 0.05 * peaki;
                self.update_thresholds();
            }

            let dt_from_last_ms = self.last_qrs_sample.map(|prev| {
                ((peak_sample.saturating_sub(prev)) as f64) * 1000.0 / self.config.sample_rate_hz
            });
            let in_refractory =
                dt_from_last_ms.is_some_and(|dt| dt < self.config.refractory_period_ms);

            if !in_refractory {
                if peaki >= self.threshold_i1 {
                    let is_t_wave = dt_from_last_ms.is_some_and(|dt| dt <= 360.0)
                        && self.last_qrs_max_slope > 0.0
                        && max_slope < 0.50 * self.last_qrs_max_slope;

                    if is_t_wave {
                        self.npki = 0.125 * peaki + 0.875 * self.npki;
                        self.update_thresholds();
                    } else {
                        self.spki = 0.125 * peaki + 0.875 * self.spki;
                        self.update_thresholds();
                        self.last_qrs_max_slope = max_slope;
                        detected_beat =
                            Some(self.register_qrs_beat(peak_sample, refined_time_s, false));
                    }
                } else {
                    self.push_searchback_candidate(CandidatePeak {
                        sample_idx: peak_sample,
                        peaki,
                        max_slope,
                        refined_time_s,
                        valid: true,
                    });
                    self.npki = 0.125 * peaki + 0.875 * self.npki;
                    self.update_thresholds();
                }
            }
        }

        if detected_beat.is_none()
            && let Some(prev_s) = self.last_qrs_sample
        {
            let elapsed_ms =
                ((n.saturating_sub(prev_s)) as f64) * 1000.0 / self.config.sample_rate_hz;
            let rr_avg_ms = self.recent_rr_avg_ms();
            if elapsed_ms > 1.66 * rr_avg_ms
                && let Some(cand) = self.find_best_searchback_candidate(prev_s)
            {
                self.spki = 0.25 * cand.peaki + 0.75 * self.spki;
                self.update_thresholds();
                self.last_qrs_max_slope = cand.max_slope;
                detected_beat =
                    Some(self.register_qrs_beat(cand.sample_idx, cand.refined_time_s, true));
            }
        }

        self.prev_mwi_2 = self.prev_mwi_1;
        self.prev_mwi_1 = y_mwi;
        self.sample_counter = self.sample_counter.saturating_add(1);
        detected_beat
    }

    pub fn push_block(&mut self, samples: &[f64]) -> TimeDomainHrvMetrics {
        for &s in samples {
            let _ = self.push_sample(s);
        }
        self.current_hrv_metrics()
    }

    pub fn current_hrv_metrics(&self) -> TimeDomainHrvMetrics {
        let valid_nn_count = self.nn_len;
        let consecutive_pair_count = self.diff_len;

        let mean_hr_bpm = if valid_nn_count >= 1 {
            let mean_nn = self.nn_ring[..valid_nn_count].iter().sum::<f64>()
                / (valid_nn_count as f64);
            if mean_nn > EPSILON {
                Some(60_000.0 / mean_nn)
            } else {
                None
            }
        } else {
            None
        };

        let ready = valid_nn_count >= self.config.min_nn_intervals
            && consecutive_pair_count >= self.config.min_consecutive_pairs
            && valid_nn_count >= 2;

        if !ready {
            return TimeDomainHrvMetrics {
                valid_nn_count,
                consecutive_pair_count,
                rejected_ectopic_count: self.rejected_ectopic_count,
                mean_hr_bpm,
                rmssd_ms: None,
                sdnn_ms: None,
                pnn50_pct: None,
                validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            };
        }

        let nn_slice = &self.nn_ring[..valid_nn_count];
        let mean_nn = nn_slice.iter().sum::<f64>() / (valid_nn_count as f64);
        let var_sum = nn_slice
            .iter()
            .map(|&nn| {
                let d = nn - mean_nn;
                d * d
            })
            .sum::<f64>();
        let sdnn_ms = (var_sum / ((valid_nn_count - 1) as f64)).sqrt();

        let diff_slice = &self.diff_nn_ring[..consecutive_pair_count];
        let sq_diff_sum = diff_slice.iter().map(|&d| d * d).sum::<f64>();
        let rmssd_ms = (sq_diff_sum / (consecutive_pair_count as f64)).sqrt();
        let nn50_count = diff_slice.iter().filter(|&&d| d.abs() > 50.0).count();
        let pnn50_pct = 100.0 * (nn50_count as f64) / (consecutive_pair_count as f64);

        TimeDomainHrvMetrics {
            valid_nn_count,
            consecutive_pair_count,
            rejected_ectopic_count: self.rejected_ectopic_count,
            mean_hr_bpm,
            rmssd_ms: Some(rmssd_ms),
            sdnn_ms: Some(sdnn_ms),
            pnn50_pct: Some(pnn50_pct),
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }

    #[inline]
    pub fn config(&self) -> PanTompkinsConfig {
        self.config
    }

    #[inline]
    fn update_thresholds(&mut self) {
        self.threshold_i1 = self.npki + 0.25 * (self.spki - self.npki);
        self.threshold_i2 = 0.50 * self.threshold_i1;
    }

    fn max_slope_in_window(&self, peak_sample: u64) -> f64 {
        let start = peak_sample.saturating_sub(self.mwi_len as u64);
        let mut max_s = 0.0;
        for s in start..=peak_sample {
            let val = self.slope_history[(s as usize) % MAX_SIGNAL_HISTORY];
            if val > max_s {
                max_s = val;
            }
        }
        max_s
    }

    fn refine_r_peak_time_s(&self, peak_sample: u64) -> f64 {
        let win_start = peak_sample.saturating_sub(self.mwi_len as u64).max(1);
        let win_end = peak_sample.saturating_sub(1).max(win_start);
        let mut best_sample = win_start;
        let mut best_abs = 0.0;
        for s in win_start..=win_end {
            let v = self.filtered_history[(s as usize) % MAX_SIGNAL_HISTORY].abs();
            if v > best_abs {
                best_abs = v;
                best_sample = s;
            }
        }

        let alpha = self.filtered_history[((best_sample - 1) as usize) % MAX_SIGNAL_HISTORY].abs();
        let beta = self.filtered_history[(best_sample as usize) % MAX_SIGNAL_HISTORY].abs();
        let gamma = self.filtered_history[((best_sample + 1) as usize) % MAX_SIGNAL_HISTORY].abs();
        let denom = 2.0 * (alpha - 2.0 * beta + gamma);
        let delta = if denom.abs() > EPSILON {
            ((alpha - gamma) / denom).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        ((best_sample as f64) + delta) / self.config.sample_rate_hz
    }

    fn push_searchback_candidate(&mut self, cand: CandidatePeak) {
        self.searchback_ring[self.searchback_write_idx] = cand;
        self.searchback_write_idx = (self.searchback_write_idx + 1) % SEARCHBACK_CANDIDATES;
    }

    fn find_best_searchback_candidate(&mut self, prev_qrs_sample: u64) -> Option<CandidatePeak> {
        let mut best_idx: Option<usize> = None;
        let mut best_peaki = self.threshold_i2;

        for (i, cand) in self.searchback_ring.iter().enumerate() {
            if !cand.valid || cand.sample_idx <= prev_qrs_sample {
                continue;
            }
            let dt_ms = ((cand.sample_idx - prev_qrs_sample) as f64) * 1000.0
                / self.config.sample_rate_hz;
            if dt_ms >= self.config.refractory_period_ms && cand.peaki > best_peaki {
                best_peaki = cand.peaki;
                best_idx = Some(i);
            }
        }

        if let Some(idx) = best_idx {
            let chosen = self.searchback_ring[idx];
            for cand in &mut self.searchback_ring {
                if cand.sample_idx <= chosen.sample_idx {
                    cand.valid = false;
                }
            }
            Some(chosen)
        } else {
            None
        }
    }

    fn recent_rr_avg_ms(&self) -> f64 {
        if self.nn_len == 0 {
            return 1000.0;
        }
        let count = self.nn_len.min(8);
        let mut sum = 0.0;
        for k in 1..=count {
            let idx = (self.nn_write_idx + NN_RING_CAPACITY - k) % NN_RING_CAPACITY;
            sum += self.nn_ring[idx];
        }
        sum / (count as f64)
    }

    fn median_last_5_nn(&self) -> Option<f64> {
        if self.nn_len == 0 {
            return None;
        }
        let count = self.nn_len.min(5);
        let mut buf = [0.0; 5];
        for (i, slot) in buf.iter_mut().take(count).enumerate() {
            let idx = (self.nn_write_idx + NN_RING_CAPACITY - 1 - i) % NN_RING_CAPACITY;
            *slot = self.nn_ring[idx];
        }
        let slice = &mut buf[..count];
        slice.sort_by(f64::total_cmp);
        if count % 2 == 1 {
            Some(slice[count / 2])
        } else {
            Some(0.5 * (slice[count / 2 - 1] + slice[count / 2]))
        }
    }

    fn register_qrs_beat(
        &mut self,
        peak_sample: u64,
        r_peak_time_s: f64,
        triggered_by_searchback: bool,
    ) -> DetectedQrsBeat {
        let prev_time = self.last_qrs_time_s;
        self.last_qrs_sample = Some(peak_sample);
        self.last_qrs_time_s = Some(r_peak_time_s);

        let Some(prev_t) = prev_time else {
            self.prev_beat_was_valid_nn = false;
            return DetectedQrsBeat {
                r_peak_time_s,
                rr_interval_ms: None,
                accepted_as_sinus_nn: false,
                triggered_by_searchback,
            };
        };

        let rr_ms = 1000.0 * (r_peak_time_s - prev_t);
        let in_physio_bounds = (self.config.rr_min_ms..=self.config.rr_max_ms).contains(&rr_ms);
        let malik_ok = self.median_last_5_nn().is_none_or(|med| {
            ((rr_ms - med).abs() / med) <= self.config.malik_ectopic_quotient
        });

        let accepted_as_sinus_nn = rr_ms.is_finite() && in_physio_bounds && malik_ok;

        if accepted_as_sinus_nn {
            self.nn_ring[self.nn_write_idx] = rr_ms;
            self.nn_write_idx = (self.nn_write_idx + 1) % NN_RING_CAPACITY;
            if self.nn_len < NN_RING_CAPACITY {
                self.nn_len += 1;
            }

            if self.prev_beat_was_valid_nn
                && let Some(prev_nn) = self.last_valid_nn_ms
            {
                self.diff_nn_ring[self.diff_write_idx] = rr_ms - prev_nn;
                self.diff_write_idx = (self.diff_write_idx + 1) % NN_RING_CAPACITY;
                if self.diff_len < NN_RING_CAPACITY {
                    self.diff_len += 1;
                }
            }
            self.last_valid_nn_ms = Some(rr_ms);
            self.prev_beat_was_valid_nn = true;
        } else {
            self.rejected_ectopic_count = self.rejected_ectopic_count.saturating_add(1);
            // Reset contiguity across ectopic/artifact rejection so no false delta-NN forms across gaps.
            self.prev_beat_was_valid_nn = false;
        }

        DetectedQrsBeat {
            r_peak_time_s,
            rr_interval_ms: Some(rr_ms),
            accepted_as_sinus_nn,
            triggered_by_searchback,
        }
    }
}
