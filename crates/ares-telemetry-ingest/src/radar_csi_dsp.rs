//! Phase 31 (L3): Contactless Doppler demodulation RF 60 GHz mmWave / 5.2 GHz Wi-Fi CSI,
//! 60/120 Hz SOS biquad IIR notch bank for ECLSS fans and cardiorespiratory estimation.

use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const SPEED_OF_LIGHT_M_S: f64 = 299_792_458.0;
pub const RADAR_DECIMATED_HZ: f64 = 25.0;
pub const RADAR_RING_LEN: usize = 512;
const STABILITY_MARGIN: f64 = 1e-11;
const IQ_POWER_EPSILON: f64 = 1e-12;
const MIN_INBAND_POWER_MM2: f64 = 1e-6;
const RESP_MIN_HZ: f64 = 0.10;
const RESP_MAX_HZ: f64 = 0.60;
const CARD_MIN_HZ: f64 = 0.80;
const CARD_MAX_HZ: f64 = 2.50;

/// Deterministic configuration and processing errors for the Level-1 GATHER DSP modules.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum DspError {
    #[error("invalid radar sample rate: {sample_rate_hz} Hz (expected [50.0, 2000.0] Hz)")]
    InvalidRadarSampleRate { sample_rate_hz: f64 },

    #[error("invalid RF carrier frequency: {carrier_hz} Hz (expected finite value > 1.0e6 Hz)")]
    InvalidCarrierFrequency { carrier_hz: f64 },

    #[error("invalid biquad filter Q factor: {q_factor} (expected finite value > 0.1)")]
    InvalidFilterQualityFactor { q_factor: f64 },

    #[error("unstable IIR biquad section under Jury criterion (a1={a1}, a2={a2}): poles outside the unit circle")]
    UnstableBiquadPoles { a1: f64, a2: f64 },

    #[error("unsupported PCM audio sample rate: {sample_rate_hz} Hz (expected 16000 or 48000 Hz)")]
    UnsupportedAudioSampleRate { sample_rate_hz: u32 },

    #[error("PCM audio frame too short: received {len} samples, at least {min_required} required")]
    AudioFrameTooShort { len: usize, min_required: usize },

    #[error("unsupported waveform sample rate for Pan-Tompkins: {sample_rate_hz} Hz (allowed [125.0, 500.0] Hz)")]
    UnsupportedWaveformSampleRate { sample_rate_hz: f64 },
}

/// RF carrier band for the exact wavelength computation lambda = c / f_c.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum RadarCarrierBand {
    /// Night cabin mmWave radar at 60.0 GHz (lambda ~= 4.9965 mm).
    MmWave60Ghz,
    /// Wi-Fi CSI subcarrier 802.11a/n/ac at 5.20 GHz (lambda ~= 57.6524 mm).
    WifiCsi5Ghz,
    /// Validated custom carrier (> 1 MHz).
    Custom { carrier_hz: f64 },
}

impl RadarCarrierBand {
    pub fn wavelength_m(self) -> Result<f64, DspError> {
        let fc = match self {
            Self::MmWave60Ghz => 60.0e9,
            Self::WifiCsi5Ghz => 5.20e9,
            Self::Custom { carrier_hz } => carrier_hz,
        };
        if !fc.is_finite() || fc <= 1.0e6 {
            return Err(DspError::InvalidCarrierFrequency { carrier_hz: fc });
        }
        Ok(SPEED_OF_LIGHT_M_S / fc)
    }
}

/// Second-order IIR biquad section in Direct-Form II Transposed (DF2T) form.
/// 100% stack allocation, zero heap, pole stability verified with the Jury criterion.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BiquadSos {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    s1: f64,
    s2: f64,
}

impl BiquadSos {
    #[inline]
    pub const fn identity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            s1: 0.0,
            s2: 0.0,
        }
    }

    pub fn from_coefficients(
        b0: f64,
        b1: f64,
        b2: f64,
        a1: f64,
        a2: f64,
    ) -> Result<Self, DspError> {
        let coeffs_finite = [b0, b1, b2, a1, a2].into_iter().all(f64::is_finite);
        if !coeffs_finite
            || a2.abs() >= (1.0 - STABILITY_MARGIN)
            || a1.abs() >= (1.0 + a2 - STABILITY_MARGIN)
        {
            return Err(DspError::UnstableBiquadPoles { a1, a2 });
        }
        Ok(Self {
            b0,
            b1,
            b2,
            a1,
            a2,
            s1: 0.0,
            s2: 0.0,
        })
    }

    /// Designs a narrow IIR notch filter at frequency `notch_hz`.
    /// If `notch_hz >= 0.495 * sample_rate_hz` (above Nyquist), returns `identity()`.
    pub fn design_notch(
        sample_rate_hz: f64,
        notch_hz: f64,
        q_factor: f64,
    ) -> Result<Self, DspError> {
        if !sample_rate_hz.is_finite() || !(50.0..=2000.0).contains(&sample_rate_hz) {
            return Err(DspError::InvalidRadarSampleRate { sample_rate_hz });
        }
        if !q_factor.is_finite() || q_factor <= 0.1 {
            return Err(DspError::InvalidFilterQualityFactor { q_factor });
        }
        if !notch_hz.is_finite() || notch_hz <= 0.0 || notch_hz >= 0.495 * sample_rate_hz {
            return Ok(Self::identity());
        }
        let w0 = 2.0 * core::f64::consts::PI * notch_hz / sample_rate_hz;
        let alpha = w0.sin() / (2.0 * q_factor);
        let inv_a0 = 1.0 / (1.0 + alpha);
        let b0 = inv_a0;
        let b1 = -2.0 * w0.cos() * inv_a0;
        let b2 = inv_a0;
        let a1 = b1;
        let a2 = (1.0 - alpha) * inv_a0;
        Self::from_coefficients(b0, b1, b2, a1, a2)
    }

    /// Designs a 2nd-order Butterworth band-pass filter pre-warped with the bilinear transform.
    pub fn design_bandpass_2nd(
        sample_rate_hz: f64,
        low_hz: f64,
        high_hz: f64,
    ) -> Result<Self, DspError> {
        if !sample_rate_hz.is_finite() || !(25.0..=2000.0).contains(&sample_rate_hz) {
            return Err(DspError::InvalidRadarSampleRate { sample_rate_hz });
        }
        if !low_hz.is_finite()
            || !high_hz.is_finite()
            || low_hz <= 0.0
            || high_hz <= low_hz
            || high_hz >= 0.495 * sample_rate_hz
        {
            return Err(DspError::InvalidFilterQualityFactor { q_factor: 0.0 });
        }
        let omega_l = (core::f64::consts::PI * low_hz / sample_rate_hz).tan();
        let omega_h = (core::f64::consts::PI * high_hz / sample_rate_hz).tan();
        let omega0_sq = omega_l * omega_h;
        let delta_omega = (omega_h - omega_l).max(1e-6);
        let inv_a0 = 1.0 / (1.0 + delta_omega + omega0_sq);
        let b0 = delta_omega * inv_a0;
        let b1 = 0.0;
        let b2 = -delta_omega * inv_a0;
        let a1 = 2.0 * (omega0_sq - 1.0) * inv_a0;
        let a2 = (1.0 - delta_omega + omega0_sq) * inv_a0;
        Self::from_coefficients(b0, b1, b2, a1, a2)
    }

    /// Progetta un filtro Butterworth passa-alto del 2o ordine con trasformata bilineare.
    pub fn design_highpass_2nd(sample_rate_hz: f64, cutoff_hz: f64) -> Result<Self, DspError> {
        if !sample_rate_hz.is_finite() || !(25.0..=2000.0).contains(&sample_rate_hz) {
            return Err(DspError::InvalidRadarSampleRate { sample_rate_hz });
        }
        if !cutoff_hz.is_finite() || cutoff_hz <= 0.0 || cutoff_hz >= 0.495 * sample_rate_hz {
            return Err(DspError::InvalidFilterQualityFactor { q_factor: 0.0 });
        }
        let k = (core::f64::consts::PI * cutoff_hz / sample_rate_hz).tan();
        let sqrt2 = core::f64::consts::SQRT_2;
        let k2 = k * k;
        let inv_a0 = 1.0 / (1.0 + sqrt2 * k + k2);
        let b0 = inv_a0;
        let b1 = -2.0 * inv_a0;
        let b2 = inv_a0;
        let a1 = 2.0 * (k2 - 1.0) * inv_a0;
        let a2 = (1.0 - sqrt2 * k + k2) * inv_a0;
        Self::from_coefficients(b0, b1, b2, a1, a2)
    }

    /// Checks whether the poles strictly satisfy |p_{1,2}| < 1.
    #[inline]
    pub fn poles_inside_unit_circle(&self) -> bool {
        self.a2.abs() < (1.0 - STABILITY_MARGIN)
            && self.a1.abs() < (1.0 + self.a2 - STABILITY_MARGIN)
    }

    /// Returns `true` if the section is configured as an identity bypass (e.g. Nyquist guard).
    #[inline]
    pub fn is_identity(&self) -> bool {
        (self.b0 - 1.0).abs() < 1e-12
            && self.b1.abs() < 1e-12
            && self.b2.abs() < 1e-12
            && self.a1.abs() < 1e-12
            && self.a2.abs() < 1e-12
    }

    /// O(1) Direct-Form II Transposed update without allocations.
    #[inline]
    pub fn step(&mut self, x: f64) -> f64 {
        let x_safe = if x.is_finite() { x } else { 0.0 };
        let y = self.b0 * x_safe + self.s1;
        self.s1 = self.b1 * x_safe - self.a1 * y + self.s2;
        self.s2 = self.b2 * x_safe - self.a2 * y;
        y
    }
}

/// Configuration of the Level-1 GATHER contactless Doppler processor.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RadarCsiConfig {
    pub sample_rate_hz: f64,
    pub carrier_band: RadarCarrierBand,
    pub eclss_fundamental_hz: f64,
    pub notch_q_factor: f64,
    pub clutter_tau_s: f64,
}

impl Default for RadarCsiConfig {
    fn default() -> Self {
        Self {
            sample_rate_hz: 250.0,
            carrier_band: RadarCarrierBand::MmWave60Ghz,
            eclss_fundamental_hz: 60.0,
            notch_q_factor: 30.0,
            clutter_tau_s: 15.0,
        }
    }
}

/// Contactless biometric estimate produced by the Doppler radar with SQI gate >= 0.70.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RadarVitalEstimate {
    pub displacement_mm: f64,
    pub unwrapped_phase_rad: f64,
    pub heart_rate_bpm: Option<f64>,
    pub resp_rate_brpm: Option<f64>,
    pub radar_sqi: f64,
    pub eclss_notch_active: [bool; 2],
    pub validation_status: ModelValidationStatus,
}

/// O(1) streaming processor for 60 GHz mmWave and 5.2 GHz Wi-Fi CSI Doppler radar.
#[derive(Debug, Clone)]
pub struct RadarCsiProcessor {
    config: RadarCsiConfig,
    wavelength_m: f64,
    alpha_dc: f64,
    dc_i: f64,
    dc_q: f64,
    iq_sample_count: u64,
    has_prev_phase: bool,
    prev_wrapped_phase: f64,
    unwrapped_phase_rad: f64,
    iq_notch_i: [BiquadSos; 2],
    iq_notch_q: [BiquadSos; 2],
    notch_60hz: BiquadSos,
    notch_120hz: BiquadSos,
    resp_bp_stage1: BiquadSos,
    resp_bp_stage2: BiquadSos,
    card_hp_stage1: BiquadSos,
    card_hp_stage2: BiquadSos,
    card_bp_stage1: BiquadSos,
    card_bp_stage2: BiquadSos,
    hp_alpha: f64,
    hp_prev_x: f64,
    hp_prev_y: f64,
    power_ema_alpha: f64,
    total_ac_power_mm2: f64,
    resp_power_mm2: f64,
    card_power_mm2: f64,
    decim_stride: usize,
    decim_counter: usize,
    effective_decim_hz: f64,
    resp_ring: [f64; RADAR_RING_LEN],
    card_ring: [f64; RADAR_RING_LEN],
    ring_write_idx: usize,
    ring_filled: usize,
    decim_since_eval: usize,
    cached_estimate: RadarVitalEstimate,
}

impl RadarCsiProcessor {
    pub fn new(config: RadarCsiConfig) -> Result<Self, DspError> {
        if !config.sample_rate_hz.is_finite() || !(50.0..=2000.0).contains(&config.sample_rate_hz) {
            return Err(DspError::InvalidRadarSampleRate {
                sample_rate_hz: config.sample_rate_hz,
            });
        }
        if !config.clutter_tau_s.is_finite() || config.clutter_tau_s <= 0.0 {
            return Err(DspError::InvalidFilterQualityFactor {
                q_factor: config.clutter_tau_s,
            });
        }
        if !config.eclss_fundamental_hz.is_finite() || config.eclss_fundamental_hz < 0.0 {
            return Err(DspError::InvalidFilterQualityFactor {
                q_factor: config.eclss_fundamental_hz,
            });
        }

        let wavelength_m = config.carrier_band.wavelength_m()?;
        let alpha_dc = 1.0 - (-1.0 / (config.sample_rate_hz * config.clutter_tau_s)).exp();

        let notch_60hz = BiquadSos::design_notch(
            config.sample_rate_hz,
            config.eclss_fundamental_hz,
            config.notch_q_factor,
        )?;
        let notch_120hz = BiquadSos::design_notch(
            config.sample_rate_hz,
            2.0 * config.eclss_fundamental_hz,
            config.notch_q_factor,
        )?;
        let iq_notch_i = [notch_60hz, notch_120hz];
        let iq_notch_q = [notch_60hz, notch_120hz];

        let eclss_notch_active = [!notch_60hz.is_identity(), !notch_120hz.is_identity()];

        let resp_bp_stage1 =
            BiquadSos::design_bandpass_2nd(config.sample_rate_hz, RESP_MIN_HZ, RESP_MAX_HZ)?;
        let resp_bp_stage2 =
            BiquadSos::design_bandpass_2nd(config.sample_rate_hz, RESP_MIN_HZ, RESP_MAX_HZ)?;
        let card_hp_stage1 = BiquadSos::design_highpass_2nd(config.sample_rate_hz, 0.75)?;
        let card_hp_stage2 = BiquadSos::design_highpass_2nd(config.sample_rate_hz, 0.75)?;
        let card_bp_stage1 =
            BiquadSos::design_bandpass_2nd(config.sample_rate_hz, CARD_MIN_HZ, CARD_MAX_HZ)?;
        let card_bp_stage2 =
            BiquadSos::design_bandpass_2nd(config.sample_rate_hz, CARD_MIN_HZ, CARD_MAX_HZ)?;

        let decim_stride = (config.sample_rate_hz / RADAR_DECIMATED_HZ)
            .round()
            .max(1.0) as usize;
        let effective_decim_hz = config.sample_rate_hz / (decim_stride as f64);

        let hp_rc = 1.0 / (2.0 * core::f64::consts::PI * 0.05);
        let dt = 1.0 / config.sample_rate_hz;
        let hp_alpha = hp_rc / (hp_rc + dt);
        let power_ema_alpha = 1.0 - (-1.0 / (config.sample_rate_hz * 4.0)).exp();

        Ok(Self {
            config,
            wavelength_m,
            alpha_dc,
            dc_i: 0.0,
            dc_q: 0.0,
            iq_sample_count: 0,
            has_prev_phase: false,
            prev_wrapped_phase: 0.0,
            unwrapped_phase_rad: 0.0,
            iq_notch_i,
            iq_notch_q,
            notch_60hz,
            notch_120hz,
            resp_bp_stage1,
            resp_bp_stage2,
            card_hp_stage1,
            card_hp_stage2,
            card_bp_stage1,
            card_bp_stage2,
            hp_alpha,
            hp_prev_x: 0.0,
            hp_prev_y: 0.0,
            power_ema_alpha,
            total_ac_power_mm2: 0.0,
            resp_power_mm2: 0.0,
            card_power_mm2: 0.0,
            decim_stride,
            decim_counter: 0,
            effective_decim_hz,
            resp_ring: [0.0; RADAR_RING_LEN],
            card_ring: [0.0; RADAR_RING_LEN],
            ring_write_idx: 0,
            ring_filled: 0,
            decim_since_eval: 0,
            cached_estimate: RadarVitalEstimate {
                displacement_mm: 0.0,
                unwrapped_phase_rad: 0.0,
                heart_rate_bpm: None,
                resp_rate_brpm: None,
                radar_sqi: 0.0,
                eclss_notch_active,
                validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            },
        })
    }

    pub fn push_iq_sample(&mut self, in_phase: f64, quadrature: f64) -> RadarVitalEstimate {
        if !in_phase.is_finite() || !quadrature.is_finite() {
            self.cached_estimate.radar_sqi = (self.cached_estimate.radar_sqi * 0.90).clamp(0.0, 1.0);
            if self.cached_estimate.radar_sqi < SQI_MIN_VALID_THRESHOLD {
                self.cached_estimate.heart_rate_bpm = None;
                self.cached_estimate.resp_rate_brpm = None;
            }
            return self.cached_estimate;
        }

        self.iq_sample_count = self.iq_sample_count.saturating_add(1);
        let alpha = (1.0 / (self.iq_sample_count as f64)).max(self.alpha_dc);
        self.dc_i = (1.0 - alpha) * self.dc_i + alpha * in_phase;
        self.dc_q = (1.0 - alpha) * self.dc_q + alpha * quadrature;

        let ac_i = in_phase - self.dc_i;
        let ac_q = quadrature - self.dc_q;
        let i_stage1 = self.iq_notch_i[0].step(ac_i);
        let notched_i = self.iq_notch_i[1].step(i_stage1);
        let q_stage1 = self.iq_notch_q[0].step(ac_q);
        let notched_q = self.iq_notch_q[1].step(q_stage1);

        let p_dyn = notched_i * notched_i + notched_q * notched_q;
        if p_dyn >= IQ_POWER_EPSILON {
            let wrapped = notched_q.atan2(notched_i);
            if self.has_prev_phase {
                let two_pi = 2.0 * core::f64::consts::PI;
                let delta =
                    (wrapped - self.prev_wrapped_phase + core::f64::consts::PI).rem_euclid(two_pi)
                        - core::f64::consts::PI;
                self.unwrapped_phase_rad += delta;
            } else {
                self.has_prev_phase = true;
            }
            self.prev_wrapped_phase = wrapped;
        }

        let raw_disp_mm =
            1000.0 * (self.wavelength_m / (4.0 * core::f64::consts::PI)) * self.unwrapped_phase_rad;
        let disp_notched_mm = self.notch_120hz.step(self.notch_60hz.step(raw_disp_mm));

        let hp_y = self.hp_alpha * (self.hp_prev_y + disp_notched_mm - self.hp_prev_x);
        self.hp_prev_x = disp_notched_mm;
        self.hp_prev_y = hp_y;

        let resp_out = self
            .resp_bp_stage2
            .step(self.resp_bp_stage1.step(disp_notched_mm));
        let card_hp = self
            .card_hp_stage2
            .step(self.card_hp_stage1.step(disp_notched_mm));
        let card_out = self
            .card_bp_stage2
            .step(self.card_bp_stage1.step(card_hp));

        self.total_ac_power_mm2 = (1.0 - self.power_ema_alpha) * self.total_ac_power_mm2
            + self.power_ema_alpha * (hp_y * hp_y);
        self.resp_power_mm2 = (1.0 - self.power_ema_alpha) * self.resp_power_mm2
            + self.power_ema_alpha * (resp_out * resp_out);
        self.card_power_mm2 = (1.0 - self.power_ema_alpha) * self.card_power_mm2
            + self.power_ema_alpha * (card_out * card_out);

        self.cached_estimate.displacement_mm = if disp_notched_mm.is_finite() {
            disp_notched_mm
        } else {
            0.0
        };
        self.cached_estimate.unwrapped_phase_rad = if self.unwrapped_phase_rad.is_finite() {
            self.unwrapped_phase_rad
        } else {
            0.0
        };

        self.decim_counter += 1;
        if self.decim_counter >= self.decim_stride {
            self.decim_counter = 0;
            self.resp_ring[self.ring_write_idx] = if resp_out.is_finite() { resp_out } else { 0.0 };
            self.card_ring[self.ring_write_idx] = if card_out.is_finite() { card_out } else { 0.0 };
            self.ring_write_idx = (self.ring_write_idx + 1) % RADAR_RING_LEN;
            if self.ring_filled < RADAR_RING_LEN {
                self.ring_filled += 1;
            }
            self.decim_since_eval += 1;

            let eval_interval = (self.effective_decim_hz.round() as usize).max(10);
            if self.ring_filled >= 150 && self.decim_since_eval >= eval_interval {
                self.decim_since_eval = 0;
                self.recompute_vital_estimate();
            }
        }

        self.cached_estimate
    }

    #[inline]
    pub fn latest_estimate(&self) -> RadarVitalEstimate {
        self.cached_estimate
    }

    #[inline]
    pub fn config(&self) -> RadarCsiConfig {
        self.config
    }

    #[inline]
    pub fn notch_sections_stable(&self) -> bool {
        self.notch_60hz.poles_inside_unit_circle()
            && self.notch_120hz.poles_inside_unit_circle()
            && self.resp_bp_stage1.poles_inside_unit_circle()
            && self.resp_bp_stage2.poles_inside_unit_circle()
            && self.card_hp_stage1.poles_inside_unit_circle()
            && self.card_hp_stage2.poles_inside_unit_circle()
            && self.card_bp_stage1.poles_inside_unit_circle()
            && self.card_bp_stage2.poles_inside_unit_circle()
    }

    fn recompute_vital_estimate(&mut self) {
        let inband_power = self.resp_power_mm2 + self.card_power_mm2;
        if inband_power < MIN_INBAND_POWER_MM2 || self.total_ac_power_mm2 < MIN_INBAND_POWER_MM2 {
            self.cached_estimate.radar_sqi = 0.0;
            self.cached_estimate.heart_rate_bpm = None;
            self.cached_estimate.resp_rate_brpm = None;
            return;
        }

        let inband_ratio = (inband_power / (self.total_ac_power_mm2 + 1e-12)).clamp(0.0, 1.0);

        let resp_lag_min = (self.effective_decim_hz / RESP_MAX_HZ).floor().max(2.0) as usize;
        let resp_lag_max = (self.effective_decim_hz / RESP_MIN_HZ).ceil() as usize;
        let (resp_hz, resp_corr) = Self::estimate_dominant_freq_hz(
            &self.resp_ring,
            self.ring_write_idx,
            self.ring_filled,
            self.effective_decim_hz,
            resp_lag_min,
            resp_lag_max,
        );

        let card_lag_min = (self.effective_decim_hz / CARD_MAX_HZ).floor().max(2.0) as usize;
        let card_lag_max = (self.effective_decim_hz / CARD_MIN_HZ).ceil() as usize;
        let (card_hz, card_corr) = Self::estimate_dominant_freq_hz(
            &self.card_ring,
            self.ring_write_idx,
            self.ring_filled,
            self.effective_decim_hz,
            card_lag_min,
            card_lag_max,
        );

        let peak_corr = resp_corr.max(card_corr).clamp(0.0, 1.0);
        let sqi = (0.60 * peak_corr + 0.40 * inband_ratio).clamp(0.0, 1.0);
        self.cached_estimate.radar_sqi = sqi;

        if sqi >= SQI_MIN_VALID_THRESHOLD {
            self.cached_estimate.resp_rate_brpm = if resp_corr >= 0.45 {
                resp_hz.map(|f| f * 60.0)
            } else {
                None
            };
            self.cached_estimate.heart_rate_bpm = if card_corr >= 0.45 {
                card_hz.map(|f| f * 60.0)
            } else {
                None
            };
        } else {
            self.cached_estimate.resp_rate_brpm = None;
            self.cached_estimate.heart_rate_bpm = None;
        }
    }

    fn estimate_dominant_freq_hz(
        ring: &[f64; RADAR_RING_LEN],
        write_idx: usize,
        filled: usize,
        decim_hz: f64,
        lag_min: usize,
        lag_max: usize,
    ) -> (Option<f64>, f64) {
        if filled < lag_min + 32 {
            return (None, 0.0);
        }
        let max_supported_lag = filled.saturating_sub(32).min(lag_max + 1);
        if max_supported_lag <= lag_min {
            return (None, 0.0);
        }

        let mut ordered = [0.0; RADAR_RING_LEN];
        let start = if filled < RADAR_RING_LEN {
            0
        } else {
            write_idx
        };
        let mut mean = 0.0;
        for (i, dst) in ordered.iter_mut().take(filled).enumerate() {
            let v = ring[(start + i) % RADAR_RING_LEN];
            *dst = v;
            mean += v;
        }
        mean /= filled as f64;
        for v in ordered.iter_mut().take(filled) {
            *v -= mean;
        }

        let scan_start = lag_min.saturating_sub(1).max(1);
        let scan_end = max_supported_lag;
        let mut corr = [0.0; RADAR_RING_LEN];
        let mut global_max = 0.0;
        let mut global_best_lag = lag_min;

        for lag in scan_start..=scan_end {
            let n_overlap = filled - lag;
            let mut num = 0.0;
            let mut e0 = 0.0;
            let mut e1 = 0.0;
            for i in 0..n_overlap {
                let a = ordered[i];
                let b = ordered[i + lag];
                num += a * b;
                e0 += a * a;
                e1 += b * b;
            }
            let denom = (e0 * e1).sqrt();
            let r = if denom > 1e-18 {
                (num / denom).clamp(-1.0, 1.0)
            } else {
                0.0
            };
            corr[lag] = r;
            if lag >= lag_min && lag <= scan_end.min(lag_max) && r > global_max {
                global_max = r;
                global_best_lag = lag;
            }
        }

        if global_max <= 0.0 {
            return (None, 0.0);
        }

        // Choose first local peak >= 90% of global_max to avoid period-doubling subharmonics.
        let mut chosen_lag = global_best_lag;
        let peak_threshold = 0.90 * global_max;
        let upper = scan_end.saturating_sub(1).min(lag_max);
        for lag in lag_min..=upper {
            if corr[lag] >= peak_threshold
                && corr[lag] >= corr[lag.saturating_sub(1)]
                && corr[lag] >= corr[lag + 1]
            {
                chosen_lag = lag;
                break;
            }
        }

        let chosen_corr = corr[chosen_lag];
        let delta = if chosen_lag > scan_start && chosen_lag < scan_end {
            let alpha = corr[chosen_lag - 1];
            let beta = corr[chosen_lag];
            let gamma = corr[chosen_lag + 1];
            let denom = 2.0 * (alpha - 2.0 * beta + gamma);
            if denom.abs() > 1e-12 {
                ((alpha - gamma) / denom).clamp(-0.5, 0.5)
            } else {
                0.0
            }
        } else {
            0.0
        };

        let tau_hat = (chosen_lag as f64) + delta;
        if tau_hat > 0.0 {
            (Some(decim_hz / tau_hat), chosen_corr)
        } else {
            (None, 0.0)
        }
    }
}
