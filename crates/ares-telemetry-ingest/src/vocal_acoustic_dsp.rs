//! Fase 31 (L3): Estrazione biomarcatori acustici vocali in Puro Rust (stimatore YIN,
//! jitter, shimmer, HNR, inclinazione spettrale e pause ratio VAD per HERA/CHAPEA).

use crate::radar_csi_dsp::DspError;
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

pub const MAX_YIN_WORK_SAMPLES: usize = 1024;
pub const MAX_YIN_LAG: usize = 320;
pub const VAD_HISTORY_LEN: usize = 128;
pub const MAX_GLOTTAL_PEAKS: usize = 32;
const EFFECTIVE_SAMPLE_RATE_HZ: f64 = 16_000.0;
const EPSILON: f64 = 1e-12;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VocalAnalyzerConfig {
    pub sample_rate_hz: u32,
    pub f0_min_hz: f64,
    pub f0_max_hz: f64,
    pub yin_threshold: f64,
    pub yin_voiced_ceiling: f64,
    pub vad_rms_floor: f64,
    pub min_snr_db: f64,
}

impl Default for VocalAnalyzerConfig {
    fn default() -> Self {
        Self {
            sample_rate_hz: 16_000,
            f0_min_hz: 60.0,
            f0_max_hz: 400.0,
            yin_threshold: 0.15,
            yin_voiced_ceiling: 0.32,
            vad_rms_floor: 0.008,
            min_snr_db: 10.0,
        }
    }
}

/// Output tipizzato per singolo frame vocale; garantisce `None` su frame silenti o non vocalizzati.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VocalBiomarkerFrame {
    pub voiced: bool,
    pub vocal_f0_hz: Option<f64>,
    pub vocal_jitter_pct: Option<f64>,
    pub vocal_shimmer_pct: Option<f64>,
    pub vocal_shimmer_db: Option<f64>,
    pub hnr_db: Option<f64>,
    pub spectral_tilt_db: Option<f64>,
    pub pause_ratio: f64,
    pub frame_snr_db: f64,
    pub validation_status: ModelValidationStatus,
}

/// Analizzatore streaming zero-heap per biomarcatori acustici vocali.
#[derive(Debug, Clone)]
pub struct VocalAcousticAnalyzer {
    config: VocalAnalyzerConfig,
    noise_rms_floor: f64,
    vad_ring: [bool; VAD_HISTORY_LEN],
    vad_write_idx: usize,
    vad_count: usize,
    work_pcm_16k: [f64; MAX_YIN_WORK_SAMPLES],
    yin_diff: [f64; MAX_YIN_LAG],
    yin_cmndf: [f64; MAX_YIN_LAG],
}

impl VocalAcousticAnalyzer {
    pub fn new(config: VocalAnalyzerConfig) -> Result<Self, DspError> {
        if config.sample_rate_hz != 16_000 && config.sample_rate_hz != 48_000 {
            return Err(DspError::UnsupportedAudioSampleRate {
                sample_rate_hz: config.sample_rate_hz,
            });
        }
        if !config.f0_min_hz.is_finite()
            || !config.f0_max_hz.is_finite()
            || config.f0_min_hz < 20.0
            || config.f0_max_hz <= config.f0_min_hz
            || config.f0_max_hz > 1000.0
        {
            return Err(DspError::InvalidFilterQualityFactor {
                q_factor: config.f0_min_hz,
            });
        }
        if !config.yin_threshold.is_finite()
            || !config.yin_voiced_ceiling.is_finite()
            || config.yin_threshold <= 0.0
            || config.yin_voiced_ceiling < config.yin_threshold
            || config.yin_voiced_ceiling >= 1.0
        {
            return Err(DspError::InvalidFilterQualityFactor {
                q_factor: config.yin_threshold,
            });
        }
        if !config.vad_rms_floor.is_finite()
            || config.vad_rms_floor <= 0.0
            || !config.min_snr_db.is_finite()
            || config.min_snr_db < 0.0
        {
            return Err(DspError::InvalidFilterQualityFactor {
                q_factor: config.vad_rms_floor,
            });
        }

        let tau_max = ((EFFECTIVE_SAMPLE_RATE_HZ / config.f0_min_hz).ceil() as usize)
            .min(MAX_YIN_LAG - 1);
        if tau_max < 10 {
            return Err(DspError::InvalidFilterQualityFactor {
                q_factor: config.f0_min_hz,
            });
        }

        Ok(Self {
            config,
            noise_rms_floor: 1e-4,
            vad_ring: [false; VAD_HISTORY_LEN],
            vad_write_idx: 0,
            vad_count: 0,
            work_pcm_16k: [0.0; MAX_YIN_WORK_SAMPLES],
            yin_diff: [0.0; MAX_YIN_LAG],
            yin_cmndf: [0.0; MAX_YIN_LAG],
        })
    }

    pub fn analyze_pcm_f32(&mut self, pcm_mono: &[f32]) -> Result<VocalBiomarkerFrame, DspError> {
        let min_eff = self.min_effective_samples();
        let decimate = self.config.sample_rate_hz == 48_000;
        let min_required = if decimate { min_eff * 3 } else { min_eff };
        if pcm_mono.len() < min_required {
            return Err(DspError::AudioFrameTooShort {
                len: pcm_mono.len(),
                min_required,
            });
        }

        let n_eff = if decimate {
            let count = (pcm_mono.len() / 3).min(MAX_YIN_WORK_SAMPLES);
            for i in 0..count {
                let center = 3 * i;
                let prev = if center > 0 {
                    f64::from(pcm_mono[center - 1])
                } else {
                    f64::from(pcm_mono[0])
                };
                let curr = f64::from(pcm_mono[center]);
                let next = if center + 1 < pcm_mono.len() {
                    f64::from(pcm_mono[center + 1])
                } else {
                    curr
                };
                let s = 0.25 * Self::clean_sample(prev)
                    + 0.50 * Self::clean_sample(curr)
                    + 0.25 * Self::clean_sample(next);
                self.work_pcm_16k[i] = s;
            }
            count
        } else {
            let count = pcm_mono.len().min(MAX_YIN_WORK_SAMPLES);
            for (dst, &src) in self.work_pcm_16k[..count]
                .iter_mut()
                .zip(pcm_mono[..count].iter())
            {
                *dst = Self::clean_sample(f64::from(src));
            }
            count
        };

        Ok(self.analyze_work_buffer(n_eff))
    }

    pub fn analyze_pcm_f64(&mut self, pcm_mono: &[f64]) -> Result<VocalBiomarkerFrame, DspError> {
        let min_eff = self.min_effective_samples();
        let decimate = self.config.sample_rate_hz == 48_000;
        let min_required = if decimate { min_eff * 3 } else { min_eff };
        if pcm_mono.len() < min_required {
            return Err(DspError::AudioFrameTooShort {
                len: pcm_mono.len(),
                min_required,
            });
        }

        let n_eff = if decimate {
            let count = (pcm_mono.len() / 3).min(MAX_YIN_WORK_SAMPLES);
            for i in 0..count {
                let center = 3 * i;
                let prev = if center > 0 {
                    pcm_mono[center - 1]
                } else {
                    pcm_mono[0]
                };
                let curr = pcm_mono[center];
                let next = if center + 1 < pcm_mono.len() {
                    pcm_mono[center + 1]
                } else {
                    curr
                };
                let s = 0.25 * Self::clean_sample(prev)
                    + 0.50 * Self::clean_sample(curr)
                    + 0.25 * Self::clean_sample(next);
                self.work_pcm_16k[i] = s;
            }
            count
        } else {
            let count = pcm_mono.len().min(MAX_YIN_WORK_SAMPLES);
            for (dst, &src) in self.work_pcm_16k[..count]
                .iter_mut()
                .zip(pcm_mono[..count].iter())
            {
                *dst = Self::clean_sample(src);
            }
            count
        };

        Ok(self.analyze_work_buffer(n_eff))
    }

    #[inline]
    pub fn current_pause_ratio(&self) -> f64 {
        if self.vad_count == 0 {
            return 0.0;
        }
        let pauses = self.vad_ring[..self.vad_count]
            .iter()
            .filter(|&&is_pause| is_pause)
            .count();
        (pauses as f64) / (self.vad_count as f64)
    }

    #[inline]
    pub fn config(&self) -> VocalAnalyzerConfig {
        self.config
    }

    #[inline]
    fn clean_sample(x: f64) -> f64 {
        if x.is_finite() { x } else { 0.0 }
    }

    #[inline]
    fn tau_bounds(&self) -> (usize, usize) {
        let tau_min = ((EFFECTIVE_SAMPLE_RATE_HZ / self.config.f0_max_hz).floor() as usize)
            .clamp(2, MAX_YIN_LAG - 3);
        let tau_max = ((EFFECTIVE_SAMPLE_RATE_HZ / self.config.f0_min_hz).ceil() as usize)
            .clamp(tau_min + 2, MAX_YIN_LAG - 1);
        (tau_min, tau_max)
    }

    #[inline]
    fn min_effective_samples(&self) -> usize {
        let (_, tau_max) = self.tau_bounds();
        tau_max + 64
    }

    fn record_vad(&mut self, is_pause: bool) -> f64 {
        self.vad_ring[self.vad_write_idx] = is_pause;
        self.vad_write_idx = (self.vad_write_idx + 1) % VAD_HISTORY_LEN;
        if self.vad_count < VAD_HISTORY_LEN {
            self.vad_count += 1;
        }
        self.current_pause_ratio()
    }

    fn unvoiced_frame(&mut self, frame_snr_db: f64, pause_ratio: f64) -> VocalBiomarkerFrame {
        VocalBiomarkerFrame {
            voiced: false,
            vocal_f0_hz: None,
            vocal_jitter_pct: None,
            vocal_shimmer_pct: None,
            vocal_shimmer_db: None,
            hnr_db: None,
            spectral_tilt_db: None,
            pause_ratio,
            frame_snr_db: if frame_snr_db.is_finite() {
                frame_snr_db
            } else {
                0.0
            },
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }

    fn analyze_work_buffer(&mut self, n_eff: usize) -> VocalBiomarkerFrame {
        let mean = self.work_pcm_16k[..n_eff].iter().sum::<f64>() / (n_eff as f64);
        let mut energy_sum = 0.0;
        for sample in &mut self.work_pcm_16k[..n_eff] {
            *sample -= mean;
            energy_sum += *sample * *sample;
        }
        let rms = (energy_sum / (n_eff as f64)).sqrt();
        let frame_snr_db =
            20.0 * ((rms + EPSILON) / (self.noise_rms_floor + EPSILON)).log10();

        if rms < self.config.vad_rms_floor {
            if rms > 0.0 {
                self.noise_rms_floor =
                    (0.90 * self.noise_rms_floor + 0.10 * rms).clamp(1e-5, self.config.vad_rms_floor);
            }
            let pause_ratio = self.record_vad(true);
            return self.unvoiced_frame(frame_snr_db, pause_ratio);
        }

        if frame_snr_db < self.config.min_snr_db {
            let pause_ratio = self.record_vad(true);
            return self.unvoiced_frame(frame_snr_db, pause_ratio);
        }

        let (tau_min, tau_max) = self.tau_bounds();
        let w = (n_eff.saturating_sub(tau_max + 1)).min(512);
        if w < 32 {
            let pause_ratio = self.record_vad(true);
            return self.unvoiced_frame(frame_snr_db, pause_ratio);
        }

        // YIN step 2: squared difference function d_t(tau).
        self.yin_diff[0] = 0.0;
        for tau in 1..=tau_max {
            let mut sum = 0.0;
            for j in 0..w {
                let d = self.work_pcm_16k[j] - self.work_pcm_16k[j + tau];
                sum += d * d;
            }
            self.yin_diff[tau] = sum;
        }

        // YIN step 3: cumulative mean normalized difference function (CMNDF).
        self.yin_cmndf[0] = 1.0;
        let mut running_sum = 0.0;
        for tau in 1..=tau_max {
            running_sum += self.yin_diff[tau];
            self.yin_cmndf[tau] = if running_sum > 1e-18 {
                self.yin_diff[tau] * (tau as f64) / running_sum
            } else {
                1.0
            };
        }

        // YIN step 4: absolute threshold search with local minimum refinement.
        let mut selected_tau: Option<usize> = None;
        let mut tau = tau_min;
        while tau < tau_max {
            if self.yin_cmndf[tau] < self.config.yin_threshold {
                while tau < tau_max && self.yin_cmndf[tau + 1] < self.yin_cmndf[tau] {
                    tau += 1;
                }
                selected_tau = Some(tau);
                break;
            }
            tau += 1;
        }

        if selected_tau.is_none() {
            let mut best_tau = tau_min;
            let mut best_val = self.yin_cmndf[tau_min];
            for cand in (tau_min + 1)..=tau_max {
                if self.yin_cmndf[cand] < best_val {
                    best_val = self.yin_cmndf[cand];
                    best_tau = cand;
                }
            }
            if best_val < self.config.yin_voiced_ceiling {
                selected_tau = Some(best_tau);
            }
        }

        let Some(tau_star) = selected_tau else {
            // Unvoiced fricative / broadband noise: adapt noise floor and emit None.
            self.noise_rms_floor =
                (0.85 * self.noise_rms_floor + 0.15 * rms).clamp(1e-5, 0.5);
            let pause_ratio = self.record_vad(true);
            return self.unvoiced_frame(frame_snr_db, pause_ratio);
        };

        // YIN step 5: parabolic sub-sample interpolation.
        let delta = if tau_star > 0 && tau_star < tau_max {
            let alpha = self.yin_cmndf[tau_star - 1];
            let beta = self.yin_cmndf[tau_star];
            let gamma = self.yin_cmndf[tau_star + 1];
            let denom = 2.0 * (alpha - 2.0 * beta + gamma);
            if denom.abs() > EPSILON {
                ((alpha - gamma) / denom).clamp(-0.5, 0.5)
            } else {
                0.0
            }
        } else {
            0.0
        };
        let tau_hat = (tau_star as f64) + delta;
        let f0_hz = EFFECTIVE_SAMPLE_RATE_HZ / tau_hat;
        if !f0_hz.is_finite()
            || f0_hz < self.config.f0_min_hz
            || f0_hz > self.config.f0_max_hz
        {
            let pause_ratio = self.record_vad(true);
            return self.unvoiced_frame(frame_snr_db, pause_ratio);
        }

        // Harmonics-to-Noise Ratio (Boersma 1993) at fundamental lag tau_star.
        let mut num = 0.0;
        let mut e0 = 0.0;
        let mut e1 = 0.0;
        for j in 0..w {
            let a = self.work_pcm_16k[j];
            let b = self.work_pcm_16k[j + tau_star];
            num += a * b;
            e0 += a * a;
            e1 += b * b;
        }
        let r_norm = (num / ((e0 * e1).sqrt() + EPSILON)).clamp(1e-4, 0.9999);
        let hnr_db = 10.0 * (r_norm / (1.0 - r_norm)).log10();

        if hnr_db < (self.config.min_snr_db * 0.5).min(6.0) {
            let pause_ratio = self.record_vad(true);
            return self.unvoiced_frame(frame_snr_db, pause_ratio);
        }

        let (jitter_pct, shimmer_pct, shimmer_db) =
            Self::compute_glottal_perturbations(&self.work_pcm_16k[..n_eff], tau_hat);
        let spectral_tilt_db = Self::compute_spectral_tilt_db(&self.work_pcm_16k[..n_eff]);

        let pause_ratio = self.record_vad(false);

        VocalBiomarkerFrame {
            voiced: true,
            vocal_f0_hz: Some(f0_hz),
            vocal_jitter_pct: jitter_pct,
            vocal_shimmer_pct: shimmer_pct,
            vocal_shimmer_db: shimmer_db,
            hnr_db: Some(hnr_db),
            spectral_tilt_db: Some(spectral_tilt_db),
            pause_ratio,
            frame_snr_db,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }

    fn compute_glottal_perturbations(
        samples: &[f64],
        tau_hat: f64,
    ) -> (Option<f64>, Option<f64>, Option<f64>) {
        let len = samples.len();
        if len < 4 || !tau_hat.is_finite() || tau_hat < 4.0 {
            return (None, None, None);
        }

        let mut peak_times = [0.0; MAX_GLOTTAL_PEAKS];
        let mut peak_amps = [0.0; MAX_GLOTTAL_PEAKS];
        let mut peak_count = 0usize;

        let first_end = ((1.25 * tau_hat).ceil() as usize).min(len.saturating_sub(2));
        if first_end < 2 {
            return (None, None, None);
        }

        let mut anchor_idx = 1usize;
        let mut anchor_val = samples[1];
        for (idx, &v) in samples.iter().enumerate().take(first_end + 1).skip(1) {
            if v > anchor_val {
                anchor_val = v;
                anchor_idx = idx;
            }
        }

        let half_tau = (0.5 * tau_hat).round().max(2.0) as usize;
        let record_peak = |idx: usize,
                           peak_times: &mut [f64; MAX_GLOTTAL_PEAKS],
                           peak_amps: &mut [f64; MAX_GLOTTAL_PEAKS],
                           peak_count: &mut usize| {
            if *peak_count >= MAX_GLOTTAL_PEAKS || idx == 0 || idx + 1 >= len {
                return;
            }
            let a = samples[idx - 1];
            let b = samples[idx];
            let c = samples[idx + 1];
            let denom = 2.0 * (a - 2.0 * b + c);
            let delta = if denom.abs() > EPSILON {
                ((a - c) / denom).clamp(-0.5, 0.5)
            } else {
                0.0
            };
            let t_sub = (idx as f64) + delta;
            let y_peak = b - 0.25 * (a - c) * delta;

            let trough_start = idx.saturating_sub(half_tau);
            let trough_end = (idx + half_tau).min(len - 1);
            let mut y_min = samples[trough_start];
            for &v in &samples[trough_start..=trough_end] {
                if v < y_min {
                    y_min = v;
                }
            }
            peak_times[*peak_count] = t_sub;
            peak_amps[*peak_count] = (y_peak - y_min).max(EPSILON);
            *peak_count += 1;
        };

        record_peak(anchor_idx, &mut peak_times, &mut peak_amps, &mut peak_count);
        let mut curr_t = peak_times[0];

        while peak_count < MAX_GLOTTAL_PEAKS {
            let expected = curr_t + tau_hat;
            if expected + 0.15 * tau_hat >= (len.saturating_sub(2)) as f64 {
                break;
            }
            let win_lo = (expected - 0.30 * tau_hat).floor().max(1.0) as usize;
            let win_hi = (expected + 0.30 * tau_hat)
                .ceil()
                .min((len.saturating_sub(2)) as f64) as usize;
            if win_lo > win_hi || win_hi >= len - 1 {
                break;
            }
            let mut best_idx = win_lo;
            let mut best_val = samples[win_lo];
            for (idx, &v) in samples.iter().enumerate().take(win_hi + 1).skip(win_lo) {
                if v > best_val {
                    best_val = v;
                    best_idx = idx;
                }
            }
            // Reject monotonic boundary ramps that are not genuine interior local maxima.
            if samples[best_idx] <= samples[best_idx - 1]
                || samples[best_idx] < samples[best_idx + 1]
            {
                break;
            }
            record_peak(best_idx, &mut peak_times, &mut peak_amps, &mut peak_count);
            curr_t = peak_times[peak_count - 1];
        }

        let period_count = peak_count.saturating_sub(1);
        if period_count < 3 {
            return (None, None, None);
        }

        let mut periods = [0.0; MAX_GLOTTAL_PEAKS];
        let mut period_sum = 0.0;
        let mut amp_sum = 0.0;
        for i in 0..period_count {
            let t = (peak_times[i + 1] - peak_times[i]).max(1.0);
            periods[i] = t;
            period_sum += t;
            amp_sum += peak_amps[i];
        }

        let mean_t = period_sum / (period_count as f64);
        let mean_a = amp_sum / (period_count as f64);

        let mut diff_t_sum = 0.0;
        let mut diff_a_sum = 0.0;
        let mut diff_adb_sum = 0.0;
        let pair_count = period_count - 1;
        for i in 0..pair_count {
            diff_t_sum += (periods[i + 1] - periods[i]).abs();
            diff_a_sum += (peak_amps[i + 1] - peak_amps[i]).abs();
            diff_adb_sum +=
                (20.0 * ((peak_amps[i + 1] + EPSILON) / (peak_amps[i] + EPSILON)).log10()).abs();
        }

        let jitter_pct = 100.0 * (diff_t_sum / (pair_count as f64)) / (mean_t + EPSILON);
        let shimmer_pct = 100.0 * (diff_a_sum / (pair_count as f64)) / (mean_a + EPSILON);
        let shimmer_db = diff_adb_sum / (pair_count as f64);

        (Some(jitter_pct), Some(shimmer_pct), Some(shimmer_db))
    }

    fn compute_spectral_tilt_db(samples: &[f64]) -> f64 {
        let dt = 1.0 / EFFECTIVE_SAMPLE_RATE_HZ;
        let rc = 1.0 / (2.0 * core::f64::consts::PI * 1000.0);
        let alpha_lp = dt / (rc + dt);

        let mut lp = 0.0;
        let mut e_low = 0.0;
        let mut e_high = 0.0;
        for &x in samples {
            lp += alpha_lp * (x - lp);
            let hp = x - lp;
            e_low += lp * lp;
            e_high += hp * hp;
        }
        10.0 * ((e_high + EPSILON) / (e_low + EPSILON)).log10()
    }
}
