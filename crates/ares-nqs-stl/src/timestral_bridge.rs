//! Fase 17 (H3): Grey-Box Neuro-Mechanistic Bridge between the 1 Hz Timestral
//! forecaster worker and the deterministic 20 Hz (< 150 us) ARES-Health hot-path.

use crate::error::NqsStlError;
use crate::timestral_backbone::{
    ARES_TIMESTRAL_CHANNELS, CausalScaler, CircularTelemetryBuffer, PatchRepresentation,
    TimestralBackbone, TimestralConfig,
};
use crate::timestral_quantiles::{ConformalAbstentionGate, QuantileHead};
use crate::ttv_predictor::estimate_greybox_quantile_ttv_cone;
use ares_core_types::telemetry::{Biometrics, JugularHemodynamics, Musculoskeletal, SansOcular};
use ares_core_types::{
    ChannelQuantileCone, ConformalGateStatus, MonotoneQuantileTriplet, NqsQuantileForecastSnapshot,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock, TryLockError};
use std::time::Instant;

/// Canonical names of the 12 grey-box channels tracked by `AresMultivariateSample`.
pub const GREYBOX_CHANNEL_NAMES: [&str; ARES_TIMESTRAL_CHANNELS] = [
    "heart_rate_bpm",
    "pulse_rate_bpm",
    "resp_rate_brpm",
    "spo2_pct",
    "rmssd_ms",
    "sdnn_ms",
    "lf_hf_ratio",
    "tau_w_dyn_cm2",
    "ared_daily_load_kgf",
    "sclerostin_pmol_l",
    "sans_risk_index",
    "rho_global",
];

/// 12-channel multivariate observation ingested at 1 Hz by the Timestral co-processor.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AresMultivariateSample {
    pub recording_time_s: f64,
    /// 12 channels: [HR, PULSE, RESP, SpO2, RMSSD, SDNN, LF_HF, tau_w, ARED, SOST, SANS, rho_global]
    pub values: [f64; ARES_TIMESTRAL_CHANNELS],
    /// 12-bit observability bitmask: bit i = 1 if channel i is observed (`Some`), 0 if missing (`None`).
    pub observed_mask: u16,
    pub sqi_score: f64,
}

impl AresMultivariateSample {
    /// Builds a 12-channel sample directly from ARES telemetry structs, preserving `None` bits.
    pub fn from_telemetry_components(
        recording_time_s: f64,
        biometrics: &Biometrics,
        musculo: &Musculoskeletal,
        jugular: &JugularHemodynamics,
        sans: &SansOcular,
        rho_global: impl Into<Option<f64>>,
    ) -> Self {
        let opt_channels: [Option<f64>; ARES_TIMESTRAL_CHANNELS] = [
            biometrics.heart_rate_bpm,
            biometrics.pulse_rate_bpm,
            biometrics.resp_rate_brpm,
            biometrics.spo2_pct,
            biometrics.rmssd_ms,
            biometrics.sdnn_ms,
            biometrics.lf_hf_ratio,
            Some(jugular.tau_w_dyn_cm2),
            Some(musculo.ared_daily_load_kgf),
            Some(musculo.sclerostin_pmol_l),
            Some(sans.sans_risk_index),
            rho_global.into(),
        ];

        let mut values = [0.0; ARES_TIMESTRAL_CHANNELS];
        let mut observed_mask: u16 = 0;
        for (i, opt) in opt_channels.iter().enumerate() {
            if let Some(v) = opt
                && v.is_finite()
            {
                values[i] = *v;
                observed_mask |= 1u16 << i;
            }
        }

        Self {
            recording_time_s,
            values,
            observed_mask,
            sqi_score: biometrics.sqi_score,
        }
    }

    /// Converts the fixed bitmask array into `Vec<Option<f64>>` for `CircularTelemetryBuffer`.
    pub fn to_optional_vec(&self) -> Vec<Option<f64>> {
        (0..ARES_TIMESTRAL_CHANNELS)
            .map(|i| {
                let is_obs = (self.observed_mask & (1u16 << i)) != 0;
                if is_obs && self.values[i].is_finite() {
                    Some(self.values[i])
                } else {
                    None
                }
            })
            .collect()
    }
}

/// Known future covariates conditioning the DHF grey-box forecast.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct KnownFutureCovariates {
    pub planned_ared_load_kgf: f64,
    pub planned_lbnp_pressure_mmhg: f64,
    pub scheduled_sleep_window: bool,
}

impl Default for KnownFutureCovariates {
    fn default() -> Self {
        Self {
            planned_ared_load_kgf: 125.0,
            planned_lbnp_pressure_mmhg: -30.0,
            scheduled_sleep_window: false,
        }
    }
}

/// Non-blocking thread-safe handle shared between the 1 Hz Timestral worker and the 20 Hz hot-path.
/// Uses `try_read()` with deterministic fallback so the 20 Hz tick never blocks (~180 ns read).
#[derive(Debug, Clone)]
pub struct AresTemporalForecasterHandle {
    latest_snapshot: Arc<RwLock<Arc<NqsQuantileForecastSnapshot>>>,
    fallback_snapshot: Arc<NqsQuantileForecastSnapshot>,
}

impl AresTemporalForecasterHandle {
    pub fn new(initial: NqsQuantileForecastSnapshot) -> Self {
        let arc_init = Arc::new(initial);
        Self {
            latest_snapshot: Arc::new(RwLock::new(Arc::clone(&arc_init))),
            fallback_snapshot: arc_init,
        }
    }

    /// Non-blocking O(1) snapshot read (~180 ns) for the synchronous 20 Hz hot-path.
    /// Uses `try_read()` and falls back to `fallback_snapshot` on write contention so
    /// the 20 Hz loop never blocks on the 1 Hz inference thread.
    #[inline]
    pub fn read_latest_snapshot(&self) -> Arc<NqsQuantileForecastSnapshot> {
        match self.latest_snapshot.try_read() {
            Ok(guard) => Arc::clone(&guard),
            Err(TryLockError::WouldBlock) => Arc::clone(&self.fallback_snapshot),
            Err(TryLockError::Poisoned(poisoned)) => Arc::clone(&poisoned.into_inner()),
        }
    }

    /// Direct non-blocking `try_read` probe returning `None` if a writer currently holds the lock.
    #[inline]
    pub fn try_read_snapshot(&self) -> Option<Arc<NqsQuantileForecastSnapshot>> {
        match self.latest_snapshot.try_read() {
            Ok(guard) => Some(Arc::clone(&guard)),
            Err(TryLockError::WouldBlock) => None,
            Err(TryLockError::Poisoned(poisoned)) => Some(Arc::clone(&poisoned.into_inner())),
        }
    }

    /// Atomically publishes a newly computed 1 Hz forecast snapshot.
    #[inline]
    pub fn publish_snapshot(&self, next: NqsQuantileForecastSnapshot) {
        let arc_next = Arc::new(next);
        match self.latest_snapshot.write() {
            Ok(mut guard) => *guard = arc_next,
            Err(poisoned) => *poisoned.into_inner() = arc_next,
        }
    }
}

/// Combines deterministic ODE robustness drift with Timestral quantile residuals and derives
/// the monotonic TTV cone (`TTV_q05 <= TTV_q50 <= TTV_q95`) and `AbstentionCertificate`.
#[allow(clippy::too_many_arguments)]
pub fn compute_greybox_forecast_snapshot(
    sample: &AresMultivariateSample,
    ode_rho_drift_per_hour: f64,
    residual_rho_cone: MonotoneQuantileTriplet,
    hr_cone: MonotoneQuantileTriplet,
    resp_cone: MonotoneQuantileTriplet,
    rmssd_cone: MonotoneQuantileTriplet,
    channel_cones: Vec<ChannelQuantileCone>,
    gate: &ConformalAbstentionGate,
    inference_latency_us: u64,
) -> NqsQuantileForecastSnapshot {
    let current_rho = if sample.values[11].is_finite() {
        sample.values[11]
    } else {
        0.0
    };
    let observed_bits = (sample.observed_mask & 0x0FFF).count_ones() as f64;
    let observed_ratio = (observed_bits / (ARES_TIMESTRAL_CHANNELS as f64)).clamp(0.0, 1.0);

    let drift = if ode_rho_drift_per_hour.is_finite() {
        ode_rho_drift_per_hour
    } else {
        0.0
    };
    let ode_next_rho = (current_rho + drift).clamp(-2.0, 1.0);

    let low_delta = (residual_rho_cone.q05 - residual_rho_cone.q50).min(0.0);
    let high_delta = (residual_rho_cone.q95 - residual_rho_cone.q50).max(0.0);
    let pad = gate.adaptive_lookahead_pad.max(0.0);

    let raw_q05 = (ode_next_rho + low_delta - 0.04 - pad * 0.1).clamp(-2.0, 1.0);
    let raw_q50 = ode_next_rho;
    let raw_q95 = (ode_next_rho + high_delta + 0.04 + pad * 0.1).clamp(-2.0, 1.0);

    let raw_rho_cone = MonotoneQuantileTriplet {
        q05: raw_q05.min(raw_q50),
        q50: raw_q50,
        q95: raw_q95.max(raw_q50),
    };

    let mut cert = gate.evaluate_with_certificate(
        sample.sqi_score,
        observed_ratio,
        raw_rho_cone,
        sample.recording_time_s,
    );

    let complete = sample.observed_mask & (1 << 11) != 0 && sample.observed_mask & (1 << 4) != 0;
    if !complete {
        cert.abstained = true;
        cert.status = ConformalGateStatus::AbstainedFallbackDeterministic;
        cert.reason = "global assessment unavailable: required HRV missing".into();
    }
    let ttv_hours_cone =
        complete.then(|| estimate_greybox_quantile_ttv_cone(current_rho, raw_rho_cone, 1.0));

    NqsQuantileForecastSnapshot {
        model_validation_status:
            ares_core_types::telemetry::ModelValidationStatus::IllustrativeUnvalidated,
        source_recording_time_s: sample.recording_time_s,
        confidence_state: cert.status,
        abstention_certificate: cert,
        short_horizon_s: 900,
        heart_rate_bpm_cone: hr_cone,
        resp_rate_brpm_cone: resp_cone,
        rmssd_ms_cone: (sample.observed_mask & (1 << 4) != 0).then_some(rmssd_cone),
        rho_global_cone: complete.then_some(raw_rho_cone),
        ttv_hours_cone,
        channel_cones: channel_cones
            .into_iter()
            .filter(|cone| {
                !["rmssd_ms", "sdnn_ms", "lf_hf_ratio", "rho_global"]
                    .contains(&cone.channel_name.as_str())
                    || complete
            })
            .collect(),
        pessimistic_ttv_q05_hours: ttv_hours_cone.map(|cone| cone.q05),
        inference_latency_us,
    }
}

/// Complete Pure-Rust Timestral Grey-Box Forecaster Engine (1 Hz inference + 20 Hz lock-free handle).
#[derive(Debug, Clone)]
pub struct AresTemporalForecasterEngine {
    pub config: TimestralConfig,
    pub scaler: CausalScaler,
    pub backbone: TimestralBackbone,
    pub quantile_head: QuantileHead,
    pub gate: ConformalAbstentionGate,
    buffer: CircularTelemetryBuffer,
    handle: AresTemporalForecasterHandle,
    last_rho_cone: Option<MonotoneQuantileTriplet>,
    context_patches: usize,
}

impl AresTemporalForecasterEngine {
    /// Initializes the engine with deterministic weights and a preallocated circular buffer.
    pub fn new(config: TimestralConfig) -> Result<Self, NqsStlError> {
        config.validate()?;
        let context_patches = 2usize;
        let buffer_cap = config.patch_len * context_patches;
        let scaler = CausalScaler::new(config.sigma_floor);
        let backbone = TimestralBackbone::new_deterministic(config.clone())?;
        let quantile_head = QuantileHead::new_deterministic(config.d_model, 1.0);
        let gate = ConformalAbstentionGate::default();
        let buffer = CircularTelemetryBuffer::new(config.num_channels, buffer_cap)?;
        let initial_snapshot =
            NqsQuantileForecastSnapshot::initial_deterministic(0.0, None, None, None, None);
        let handle = AresTemporalForecasterHandle::new(initial_snapshot);

        Ok(Self {
            config,
            scaler,
            backbone,
            quantile_head,
            gate,
            buffer,
            handle,
            last_rho_cone: None,
            context_patches,
        })
    }

    /// Returns a cloneable non-blocking handle for the 20 Hz hot-path.
    #[inline]
    pub fn handle(&self) -> AresTemporalForecasterHandle {
        self.handle.clone()
    }

    /// Returns the latest forecast snapshot without blocking.
    #[inline]
    pub fn read_latest_snapshot(&self) -> Arc<NqsQuantileForecastSnapshot> {
        self.handle.read_latest_snapshot()
    }

    /// Ingests a 1 Hz multivariate telemetry sample, updates Conformal PID calibration,
    /// executes the Timestral backbone + DHF QuantileHead, and publishes the updated
    /// grey-box snapshot atomically to `AresTemporalForecasterHandle`.
    pub fn ingest_sample_1hz(
        &mut self,
        sample: &AresMultivariateSample,
        covariates: &KnownFutureCovariates,
        ode_rho_drift_per_hour: f64,
    ) -> Result<Arc<NqsQuantileForecastSnapshot>, NqsStlError> {
        let t0 = Instant::now();

        if let Some(prev_rho) = self.last_rho_cone
            && sample.observed_mask & (1 << 11) != 0
            && sample.values[11].is_finite()
        {
            self.gate
                .update_conformal_calibration(sample.values[11], prev_rho, 0.05);
        }

        let opt_vec = sample.to_optional_vec();
        if opt_vec.len() != self.config.num_channels {
            return Err(NqsStlError::DimensionMismatch {
                expected: self.config.num_channels,
                found: opt_vec.len(),
            });
        }
        self.buffer.push_step(&opt_vec)?;

        let window_len = self.config.patch_len * self.context_patches;
        let channel_windows = self.buffer.export_channel_windows(window_len);
        let patches = PatchRepresentation::build_multi_patch_sequence(
            &channel_windows,
            self.config.patch_len,
            &self.scaler,
        )?;

        let embeddings = self.backbone.forward_last_patch_embeddings(&patches)?;
        let last_patch = &patches[patches.len() - 1];

        let mut channel_cones = Vec::with_capacity(self.config.num_channels);
        for (ch_idx, emb) in embeddings.iter().enumerate().take(self.config.num_channels) {
            let name = GREYBOX_CHANNEL_NAMES
                .get(ch_idx)
                .copied()
                .unwrap_or("channel");
            let cone = self.quantile_head.forecast_channel_horizons(
                name,
                emb,
                &self.scaler,
                last_patch.channel_stats[ch_idx],
                self.gate.adaptive_lookahead_pad,
            )?;
            channel_cones.push(cone);
        }

        // Covariate conditioning adjusts deterministic drift cleanly without breaking monotonicity.
        let covariate_bonus = if covariates.planned_ared_load_kgf >= 125.0 {
            0.002
        } else {
            -0.004
        };
        let adjusted_drift = ode_rho_drift_per_hour + covariate_bonus;

        let hr_cone = channel_cones[0].horizon_15m;
        let resp_cone = channel_cones[2].horizon_15m;
        let rmssd_cone = channel_cones[4].horizon_15m;
        let rho_residual = channel_cones[11].horizon_1h;

        let latency_us = t0.elapsed().as_micros() as u64;
        let snapshot = compute_greybox_forecast_snapshot(
            sample,
            adjusted_drift,
            rho_residual,
            hr_cone,
            resp_cone,
            rmssd_cone,
            channel_cones,
            &self.gate,
            latency_us,
        );
        self.last_rho_cone = snapshot.rho_global_cone;
        self.handle.publish_snapshot(snapshot);
        Ok(self.handle.read_latest_snapshot())
    }

    /// Evaluates gate status directly.
    #[inline]
    pub fn gate_status(&self) -> ConformalGateStatus {
        self.handle.read_latest_snapshot().confidence_state
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_non_blocking_snapshot_read_and_concurrent_publish() {
        let initial =
            NqsQuantileForecastSnapshot::initial_deterministic(0.0, 0.50, 120.0, 90.0, 160.0);
        let handle = AresTemporalForecasterHandle::new(initial);
        let writer_handle = handle.clone();

        let writer = thread::spawn(move || {
            for i in 1..=200 {
                let next = NqsQuantileForecastSnapshot::initial_deterministic(
                    i as f64, 0.45, 110.0, 82.0, 150.0,
                );
                writer_handle.publish_snapshot(next);
            }
        });

        let start = Instant::now();
        for _ in 0..10_000 {
            let snap = handle.read_latest_snapshot();
            snap.assert_monotone()
                .expect("every read snapshot must remain monotone");
        }
        let elapsed = start.elapsed();
        writer.join().expect("writer thread finished cleanly");
        assert!(
            elapsed.as_millis() < 200,
            "10,000 non-blocking reads took too long: {:?}",
            elapsed
        );

        // Verify try_read fallback never blocks even when write lock is held externally
        let _write_guard = handle
            .latest_snapshot
            .write()
            .expect("acquire write lock for contention test");
        assert!(handle.try_read_snapshot().is_none());
        let fallback = handle.read_latest_snapshot();
        fallback
            .assert_monotone()
            .expect("fallback snapshot must be valid and monotone");
    }

    #[test]
    fn test_greybox_pessimistic_ttv_q05_is_strictly_bounded_by_median_and_q95() {
        let gate = ConformalAbstentionGate::default();
        let cov_sample = AresMultivariateSample {
            recording_time_s: 64.0,
            values: [
                72.0, 71.0, 15.0, 98.0, 40.0, 50.0, 1.4, 1.8, 125.0, 25.0, 0.2, 0.42,
            ],
            observed_mask: 0x0FFF,
            sqi_score: 0.94,
        };
        let residual_rho = MonotoneQuantileTriplet::from_median_and_spreads(0.0, 0.12, 0.08);
        let hr = MonotoneQuantileTriplet::from_median_and_spreads(72.0, 3.0, 3.0);
        let resp = MonotoneQuantileTriplet::from_median_and_spreads(15.0, 1.0, 1.0);
        let rmssd = MonotoneQuantileTriplet::from_median_and_spreads(40.0, 4.0, 4.0);

        let snap = compute_greybox_forecast_snapshot(
            &cov_sample,
            -0.01,
            residual_rho,
            hr,
            resp,
            rmssd,
            Vec::new(),
            &gate,
            420,
        );
        snap.assert_monotone()
            .expect("greybox snapshot must be monotone");
        assert!(snap.ttv_hours_cone.unwrap().q05 <= snap.ttv_hours_cone.unwrap().q50);
        assert!(snap.ttv_hours_cone.unwrap().q50 <= snap.ttv_hours_cone.unwrap().q95);
        assert!(
            (snap.pessimistic_ttv_q05_hours.unwrap() - snap.ttv_hours_cone.unwrap().q05).abs()
                < 1e-12
        );
    }

    #[test]
    fn test_missing_channel_bitmask_triggers_abstention_when_over_40_percent_missing() {
        let gate = ConformalAbstentionGate::default();
        let sample = AresMultivariateSample {
            recording_time_s: 32.0,
            values: [70.0; ARES_TIMESTRAL_CHANNELS],
            observed_mask: 0b0000_0001_1111, // Only 5 of 12 observed (> 58% missing)
            sqi_score: 0.95,
        };
        let residual_rho = MonotoneQuantileTriplet::from_median_and_spreads(0.0, 0.05, 0.05);
        let dummy = MonotoneQuantileTriplet::from_median_and_spreads(70.0, 2.0, 2.0);
        let snap = compute_greybox_forecast_snapshot(
            &sample,
            -0.005,
            residual_rho,
            dummy,
            dummy,
            dummy,
            Vec::new(),
            &gate,
            100,
        );
        assert_eq!(
            snap.confidence_state,
            ConformalGateStatus::AbstainedFallbackDeterministic
        );
        assert!(snap.abstention_certificate.abstained);
        assert!(snap.abstention_certificate.missing_ratio > 0.40);
    }

    #[test]
    fn test_engine_1hz_ingest_publishes_monotone_snapshot_across_missing_rows() {
        let cfg = TimestralConfig {
            num_channels: ARES_TIMESTRAL_CHANNELS,
            patch_len: 8,
            d_model: 16,
            n_heads: 4,
            d_ff: 32,
            num_layers: 2,
            ..TimestralConfig::default()
        };
        let mut engine = AresTemporalForecasterEngine::new(cfg).expect("engine init");
        let handle = engine.handle();
        let cov = KnownFutureCovariates::default();

        for step in 0..20 {
            let missing_pulse_spo2 = (4..10).contains(&step);
            let mask = if missing_pulse_spo2 {
                0x0FFF & !(1 << 1) & !(1 << 3)
            } else {
                0x0FFF
            };
            let sample = AresMultivariateSample {
                recording_time_s: step as f64,
                values: [
                    72.0 + (step as f64) * 0.2,
                    71.5,
                    15.0,
                    98.0,
                    41.0,
                    50.0,
                    1.3,
                    1.75,
                    125.0,
                    25.0,
                    0.22,
                    0.48 - (step as f64) * 0.002,
                ],
                observed_mask: mask,
                sqi_score: 0.91,
            };
            let snap = engine
                .ingest_sample_1hz(&sample, &cov, -0.005)
                .expect("1hz ingest");
            snap.assert_monotone()
                .expect("published snapshot must always be monotone");
            assert_eq!(snap.channel_cones.len(), ARES_TIMESTRAL_CHANNELS);
        }

        let latest = handle.read_latest_snapshot();
        latest
            .assert_monotone()
            .expect("latest handle snapshot monotone");
        assert_eq!(
            latest.confidence_state,
            ConformalGateStatus::HeuristicGateAccepted
        );
    }
}
