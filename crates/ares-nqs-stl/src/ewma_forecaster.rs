//! Short-horizon EWMA forecaster with intervals from its own out-of-sample residuals.
//!
//! Coexists alongside the Timestral 1 Hz grey-box forecaster (`timestral_bridge`):
//! Timestral provides long-horizon cones (`+15m, +1h, +6h, +24h`), while this
//! module produces empirical short-horizon cones across `+5s, +10s, +30s, +60s, +120s`
//! (`short_horizon_cones` and `short_horizon_abstention`) with automatic interval
//! withdrawal on sensor dropout (`> max_stale_s` seconds missing).

use crate::timestral_backbone::ARES_TIMESTRAL_CHANNELS;
use crate::timestral_bridge::{
    AresMultivariateSample, AresTemporalForecasterHandle, GREYBOX_CHANNEL_NAMES,
};
use ares_core_types::telemetry::ModelValidationStatus;
use ares_core_types::{
    AbstentionCertificate, ConformalGateStatus, ForecastMethod, MonotoneQuantileTriplet,
    NqsQuantileForecastSnapshot, ShortHorizonCone,
};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Instant;

/// Forecast horizons in seconds (= samples at the native 1 Hz rate).
pub const EWMA_HORIZONS_S: [usize; 5] = [5, 10, 30, 60, 120];
/// Nominal coverage of the published `[q05, q95]` interval.
pub const EWMA_NOMINAL_COVERAGE: f64 = 0.90;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EwmaForecasterConfig {
    /// EWMA smoothing factor (weight of the newest sample).
    pub alpha: f64,
    /// Number of most recent residuals kept per channel and horizon.
    pub residual_window: usize,
    /// Residuals required before an interval is published for a horizon.
    pub min_residuals: usize,
    /// Step of the online width adaptation: after each scored interval the width
    /// multiplier is scaled by exp(gamma * (miss - 0.10)), in the spirit of adaptive
    /// conformal inference (Gibbs and Candes 2021). 0 keeps the raw quantiles.
    /// Chosen on the development records only.
    pub width_gamma: f64,
    /// Experimental delay-aware gain: scale the feedback step by the horizon.
    /// Compare on development records before enabling in production.
    pub horizon_scaled_width: bool,
    /// Seconds without a sample after which a channel is stale: its level no
    /// longer describes the present, so its intervals are withdrawn instead of
    /// being published from pre-blackout data.
    pub max_stale_s: usize,
}

impl Default for EwmaForecasterConfig {
    fn default() -> Self {
        Self {
            alpha: 0.2,
            residual_window: 240,
            min_residuals: 30,
            width_gamma: 0.1,
            horizon_scaled_width: false,
            max_stale_s: 10,
        }
    }
}

#[derive(Debug, Clone)]
struct ChannelEwma {
    level: Option<f64>,
    /// Level after each of the last `120` steps (index 0 = oldest).
    level_history: VecDeque<Option<f64>>,
    residuals: [VecDeque<f64>; 5],
    /// Interval published at each of the last `h` steps, per horizon.
    issued: [VecDeque<Option<(f64, f64)>>; 5],
    hits: [u32; 5],
    evaluated: [u32; 5],
    /// Intervals computed at the latest step, per horizon.
    current: [Option<MonotoneQuantileTriplet>; 5],
    /// Interval width multiplier per horizon, adapted online from scored intervals.
    width_scale: [f64; 5],
    /// Steps since this channel was last observed (0 = observed at this step).
    steps_since_observed: usize,
    /// True when `steps_since_observed` exceeds `max_stale_s`.
    stale: bool,
    /// Consecutive non-stale steps; a horizon is publishable only once the level
    /// has been fresh for at least that many seconds, so one sample after a
    /// blackout cannot revive a longer-horizon interval.
    fresh_run: usize,
}

impl Default for ChannelEwma {
    fn default() -> Self {
        Self {
            level: None,
            level_history: VecDeque::new(),
            residuals: Default::default(),
            issued: Default::default(),
            hits: [0; 5],
            evaluated: [0; 5],
            current: [None; 5],
            width_scale: [1.0; 5],
            steps_since_observed: 0,
            // Nothing observed yet: a channel is stale until its first sample.
            stale: true,
            fresh_run: 0,
        }
    }
}

/// EWMA forecaster publishing `+5s..+120s` short-horizon empirical residual cones.
#[derive(Debug, Clone)]
pub struct EwmaResidualForecaster {
    config: EwmaForecasterConfig,
    channels: Vec<ChannelEwma>,
    handle: AresTemporalForecasterHandle,
}

impl Default for EwmaResidualForecaster {
    fn default() -> Self {
        Self::new(EwmaForecasterConfig::default())
    }
}

impl EwmaResidualForecaster {
    /// Number of retained history/residual/issued entries (diagnostic, not byte size).
    pub fn retained_sample_count(&self) -> usize {
        self.channels.iter().map(|c| c.level_history.len()
            + c.residuals.iter().map(VecDeque::len).sum::<usize>()
            + c.issued.iter().map(VecDeque::len).sum::<usize>()).sum()
    }
    pub fn new(config: EwmaForecasterConfig) -> Self {
        let initial =
            NqsQuantileForecastSnapshot::initial_deterministic(0.0, None, None, None, None);
        Self {
            config,
            channels: vec![ChannelEwma::default(); ARES_TIMESTRAL_CHANNELS],
            handle: AresTemporalForecasterHandle::new(initial),
        }
    }

    #[inline]
    pub fn handle(&self) -> AresTemporalForecasterHandle {
        self.handle.clone()
    }

    /// `(covered, evaluated)` for the intervals already scored on later observations.
    pub fn coverage_counts(&self, channel_idx: usize, horizon_idx: usize) -> (u32, u32) {
        self.channels.get(channel_idx).map_or((0, 0), |c| {
            let h = horizon_idx.min(EWMA_HORIZONS_S.len() - 1);
            (c.hits[h], c.evaluated[h])
        })
    }

    /// Current interval for one channel and horizon, if enough residuals exist.
    pub fn cone(&self, channel_idx: usize, horizon_idx: usize) -> Option<MonotoneQuantileTriplet> {
        let h = horizon_idx.min(EWMA_HORIZONS_S.len() - 1);
        self.channels.get(channel_idx)?.current[h]
    }

    /// True when the channel has no recent sample, so nothing may be published for it.
    pub fn is_stale(&self, channel_idx: usize) -> bool {
        self.channels.get(channel_idx).is_none_or(|c| c.stale)
    }

    fn compute_cone(&self, channel_idx: usize, horizon_idx: usize) -> Option<MonotoneQuantileTriplet> {
        let ch = self.channels.get(channel_idx)?;
        if ch.stale || ch.fresh_run < EWMA_HORIZONS_S[horizon_idx] {
            return None;
        }
        let level = ch.level?;
        let residuals = &ch.residuals[horizon_idx];
        if residuals.len() < self.config.min_residuals.max(2) {
            return None;
        }
        let mut sorted: Vec<f64> = residuals.iter().copied().collect();
        sorted.sort_by(f64::total_cmp);
        let tail = (1.0 - EWMA_NOMINAL_COVERAGE) / 2.0;
        let scale = ch.width_scale[horizon_idx];
        let median = quantile_sorted(&sorted, 0.50);
        let q50 = level + median;
        let q05 = q50 - scale * (median - quantile_sorted(&sorted, tail));
        let q95 = q50 + scale * (quantile_sorted(&sorted, 1.0 - tail) - median);
        Some(MonotoneQuantileTriplet {
            q05: q05.min(q50),
            q50,
            q95: q95.max(q50),
        })
    }

    fn update_channels_1hz(&mut self, sample: &AresMultivariateSample) {
        let alpha = self.config.alpha.clamp(0.01, 1.0);
        let window = self.config.residual_window.max(self.config.min_residuals);
        let max_h = EWMA_HORIZONS_S[EWMA_HORIZONS_S.len() - 1];
        let width_gamma = self.config.width_gamma.max(0.0);
        let max_stale = self.config.max_stale_s;

        for idx in 0..self.channels.len() {
            let observed = (sample.observed_mask & (1u16 << idx)) != 0;
            let value = (observed && sample.values[idx].is_finite()).then_some(sample.values[idx]);

            // 1. Score forecasts issued h steps ago: strictly out-of-sample.
            let ch = &mut self.channels[idx];
            if let Some(x) = value {
                for (h_idx, &h) in EWMA_HORIZONS_S.iter().enumerate() {
                    let n = ch.level_history.len();
                    if n >= h
                        && let Some(past_level) = ch.level_history[n - h]
                    {
                        ch.residuals[h_idx].push_back(x - past_level);
                        if ch.residuals[h_idx].len() > window {
                            ch.residuals[h_idx].pop_front();
                        }
                    }
                    let m = ch.issued[h_idx].len();
                    if m >= h
                        && let Some((lo, hi)) = ch.issued[h_idx][m - h]
                    {
                        ch.evaluated[h_idx] += 1;
                        let covered = x >= lo && x <= hi;
                        if covered {
                            ch.hits[h_idx] += 1;
                        }
                        // Widen after a miss, narrow slightly after a hit.
                        let target = 1.0 - EWMA_NOMINAL_COVERAGE;
                        let miss = if covered { 0.0 } else { 1.0 };
                        let gamma = if self.config.horizon_scaled_width {
                            width_gamma / h as f64
                        } else { width_gamma };
                        ch.width_scale[h_idx] = (ch.width_scale[h_idx]
                            * (gamma * (miss - target)).exp())
                        .clamp(0.5, 20.0);
                    }
                }
                // 2. Update the level. After a gap long enough to make the channel
                // stale the EWMA restarts instead of blending pre-blackout data.
                let resumed = ch.stale;
                ch.level = Some(match ch.level {
                    Some(l) if !resumed => alpha * x + (1.0 - alpha) * l,
                    _ => x,
                });
                ch.steps_since_observed = 0;
            } else {
                ch.steps_since_observed = ch.steps_since_observed.saturating_add(1);
            }
            ch.stale = ch.steps_since_observed > max_stale;
            ch.fresh_run = if ch.stale {
                0
            } else {
                ch.fresh_run.saturating_add(1)
            };
            // A stale level must not become the reference of a later residual.
            let level = if ch.stale { None } else { ch.level };
            ch.level_history.push_back(level);
            if ch.level_history.len() > max_h {
                ch.level_history.pop_front();
            }
            // 3. Record the interval published now, to be scored h steps later.
            for (h_idx, &h) in EWMA_HORIZONS_S.iter().enumerate() {
                let cone = self.compute_cone(idx, h_idx);
                let ch = &mut self.channels[idx];
                ch.current[h_idx] = cone;
                ch.issued[h_idx].push_back(cone.map(|c| (c.q05, c.q95)));
                if ch.issued[h_idx].len() > h {
                    ch.issued[h_idx].pop_front();
                }
            }
        }
    }

    fn build_short_horizon_outputs(
        &self,
        sample: &AresMultivariateSample,
    ) -> (Vec<ShortHorizonCone>, AbstentionCertificate) {
        let observed = |idx: usize| (sample.observed_mask & (1u16 << idx)) != 0;
        // Horizon index 3 corresponds to +60 s ([5, 10, 30, 60, 120]).
        let readiness_idx = 3;
        let stale_channels: Vec<&str> = (0..self.channels.len())
            .filter(|&idx| observed(idx) || self.channels[idx].level.is_some())
            .filter(|&idx| self.channels[idx].stale)
            .filter_map(|idx| GREYBOX_CHANNEL_NAMES.get(idx).copied())
            .collect();
        let hr = self.cone(0, readiness_idx);
        let resp = self.cone(2, readiness_idx);
        let ready = hr.is_some() && resp.is_some();
        let residuals_hr = self.channels[0].residuals[readiness_idx].len();
        let (hits, evaluated) = self.coverage_counts(0, readiness_idx);
        let status = if ready {
            ConformalGateStatus::HeuristicGateAccepted
        } else {
            ConformalGateStatus::AbstainedFallbackDeterministic
        };
        let reason = if ready {
            format!(
                "EWMA +5s..+120s empirical residual cones active; HR +60s coverage {hits}/{evaluated}"
            )
        } else if !stale_channels.is_empty() {
            format!(
                "intervals withdrawn: no recent samples on {} (stale after {} s)",
                stale_channels.join(", "),
                self.config.max_stale_s
            )
        } else {
            format!(
                "warming up: {residuals_hr}/{} out-of-sample 60 s residuals; no interval published",
                self.config.min_residuals
            )
        };
        let observed_bits = (sample.observed_mask & 0x0FFF).count_ones() as f64;

        let short_horizon_cones = (0..self.channels.len())
            .filter(|&idx| !self.channels[idx].stale)
            .filter_map(|idx| {
                Some(ShortHorizonCone {
                    channel_name: GREYBOX_CHANNEL_NAMES.get(idx)?.to_string(),
                    ewma_level: self.channels[idx].level?,
                    horizon_5s: self.cone(idx, 0),
                    horizon_10s: self.cone(idx, 1),
                    horizon_30s: self.cone(idx, 2),
                    horizon_60s: self.cone(idx, 3),
                    horizon_120s: self.cone(idx, 4),
                })
            })
            .collect();

        let cert = AbstentionCertificate {
            abstained: !ready,
            status,
            reason,
            empirical_coverage_error: if evaluated > 0 {
                (f64::from(hits) / f64::from(evaluated) - EWMA_NOMINAL_COVERAGE).abs()
            } else {
                0.0
            },
            adaptive_alpha_t: 1.0 - EWMA_NOMINAL_COVERAGE,
            interval_width: hr.map_or(0.0, |c| c.interval_width()),
            sqi_score: sample.sqi_score,
            missing_ratio: 1.0 - observed_bits / (ARES_TIMESTRAL_CHANNELS as f64),
            timestamp_s: sample.recording_time_s,
        };

        (short_horizon_cones, cert)
    }

    /// Ingests one 1 Hz sample and returns only the short-horizon (`+5s..+120s`) cones
    /// and short-horizon abstention certificate for merging with Timestral snapshots.
    pub fn ingest_short_horizon_1hz(
        &mut self,
        sample: &AresMultivariateSample,
    ) -> (Vec<ShortHorizonCone>, AbstentionCertificate) {
        self.update_channels_1hz(sample);
        self.build_short_horizon_outputs(sample)
    }

    /// Ingests one 1 Hz sample, scores earlier forecasts against it, updates the
    /// EWMA levels and publishes a standalone `NqsQuantileForecastSnapshot`.
    pub fn ingest_sample_1hz(
        &mut self,
        sample: &AresMultivariateSample,
    ) -> Arc<NqsQuantileForecastSnapshot> {
        let t0 = Instant::now();
        self.update_channels_1hz(sample);
        let snapshot = self.build_snapshot(sample, t0.elapsed().as_micros() as u64);
        self.handle.publish_snapshot(snapshot);
        self.handle.read_latest_snapshot()
    }

    fn build_snapshot(
        &self,
        sample: &AresMultivariateSample,
        inference_latency_us: u64,
    ) -> NqsQuantileForecastSnapshot {
        let observed = |idx: usize| (sample.observed_mask & (1u16 << idx)) != 0;
        let last = EWMA_HORIZONS_S.len() - 1;
        let readiness_idx = 3;
        let hr = self.cone(0, readiness_idx);
        let resp = self.cone(2, readiness_idx);
        let degenerate = |idx: usize, fallback: f64| {
            let level = self.channels[idx].level.unwrap_or(fallback);
            MonotoneQuantileTriplet {
                q05: level,
                q50: level,
                q95: level,
            }
        };

        let (short_horizon_cones, cert) = self.build_short_horizon_outputs(sample);

        NqsQuantileForecastSnapshot {
            model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            source_recording_time_s: sample.recording_time_s,
            confidence_state: cert.status,
            abstention_certificate: cert.clone(),
            short_horizon_s: EWMA_HORIZONS_S[last] as u32,
            heart_rate_bpm_cone: hr.unwrap_or_else(|| degenerate(0, 72.0)),
            resp_rate_brpm_cone: resp.unwrap_or_else(|| degenerate(2, 14.0)),
            rmssd_ms_cone: if observed(4) {
                self.cone(4, readiness_idx)
            } else {
                None
            },
            rho_global_cone: if observed(11) && observed(4) {
                self.cone(11, readiness_idx)
            } else {
                None
            },
            ttv_hours_cone: None,
            channel_cones: Vec::new(),
            pessimistic_ttv_q05_hours: None,
            inference_latency_us,
            forecast_method: ForecastMethod::EwmaEmpiricalResidualQuantiles,
            ewma_short_horizon_max_s: EWMA_HORIZONS_S[last] as u32,
            short_horizon_cones,
            short_horizon_abstention: Some(cert),
        }
    }
}

/// Linear-interpolated quantile of an ascending, non-empty slice.
fn quantile_sorted(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let pos = q.clamp(0.0, 1.0) * (sorted.len() - 1) as f64;
    let lo = pos.floor() as usize;
    let hi = pos.ceil() as usize;
    sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(t: usize, hr: Option<f64>) -> AresMultivariateSample {
        let mut values = [0.0; ARES_TIMESTRAL_CHANNELS];
        let mut observed_mask = 0b0100u16; // RESP always observed
        values[2] = 16.0 + [0.0, 1.0, 0.0, -1.0][t % 4];
        if let Some(v) = hr {
            values[0] = v;
            observed_mask |= 1;
        }
        AresMultivariateSample {
            recording_time_s: t as f64,
            values,
            observed_mask,
            sqi_score: 0.9,
        }
    }

    /// Deterministic pseudo-noise in [-3, 3] bpm.
    fn noise(t: usize) -> f64 {
        ((t * 7919) % 13) as f64 / 2.0 - 3.0
    }

    #[test]
    fn abstains_until_enough_out_of_sample_residuals_then_publishes_monotone_cones() {
        let mut f = EwmaResidualForecaster::default();
        let mut snap = f.ingest_sample_1hz(&sample(0, Some(80.0)));
        assert!(snap.abstention_certificate.abstained);
        assert_eq!(
            snap.forecast_method,
            ForecastMethod::EwmaEmpiricalResidualQuantiles
        );
        for t in 1..89 {
            snap = f.ingest_sample_1hz(&sample(t, Some(80.0 + noise(t))));
        }
        // 60 s horizon needs 60 steps of history plus 30 residuals: ready at step 90.
        assert!(snap.abstention_certificate.abstained);
        snap = f.ingest_sample_1hz(&sample(89, Some(80.0 + noise(89))));
        assert!(!snap.abstention_certificate.abstained);
        snap.assert_monotone().expect("monotone");
        assert!(snap.channel_cones.is_empty() && snap.ttv_hours_cone.is_none());
        assert_eq!(snap.short_horizon_s, 120);
        assert_eq!(snap.ewma_short_horizon_max_s, 120);
        let hr = &snap.short_horizon_cones[0];
        assert_eq!(hr.channel_name, "heart_rate_bpm");
        assert!(hr.horizon_5s.is_some() && hr.horizon_10s.is_some() && hr.horizon_60s.is_some());
        assert!(hr.horizon_120s.is_none());

        // 120 s horizon needs 120 steps of history plus 30 residuals: ready at step 150.
        for t in 90..150 {
            snap = f.ingest_sample_1hz(&sample(t, Some(80.0 + noise(t))));
        }
        snap.assert_monotone().expect("monotone at 150s");
        assert!(snap.short_horizon_cones[0].horizon_120s.is_some());
    }

    /// During a blackout the gate must abstain and withdraw the intervals,
    /// instead of accepting a cone built from pre-blackout data.
    #[test]
    fn blackout_withdraws_intervals_and_abstains_consistently() {
        let mut f = EwmaResidualForecaster::default();
        let mut snap = f.ingest_sample_1hz(&sample(0, Some(80.0)));
        for t in 1..200 {
            snap = f.ingest_sample_1hz(&sample(t, Some(80.0 + noise(t))));
        }
        assert!(!snap.abstention_certificate.abstained);
        assert!(!snap.short_horizon_cones.is_empty());

        // A short gap is tolerated: the level is still recent.
        for t in 200..205 {
            snap = f.ingest_sample_1hz(&AresMultivariateSample {
                recording_time_s: t as f64,
                values: [0.0; ARES_TIMESTRAL_CHANNELS],
                observed_mask: 0,
                sqi_score: 0.9,
            });
        }
        assert!(!snap.abstention_certificate.abstained);

        for t in 205..305 {
            snap = f.ingest_sample_1hz(&AresMultivariateSample {
                recording_time_s: t as f64,
                values: [0.0; ARES_TIMESTRAL_CHANNELS],
                observed_mask: 0,
                sqi_score: 0.9,
            });
        }
        assert!(snap.abstention_certificate.abstained);
        assert_eq!(
            snap.confidence_state,
            ConformalGateStatus::AbstainedFallbackDeterministic
        );
        assert!(snap.short_horizon_cones.is_empty());
        assert!(f.cone(0, 3).is_none() && f.cone(2, 3).is_none());
        assert!(
            snap.abstention_certificate
                .reason
                .contains("intervals withdrawn"),
            "{}",
            snap.abstention_certificate.reason
        );

        // Nothing was scored during the blackout: coverage counters stand still.
        let before = f.coverage_counts(0, 3);
        snap = f.ingest_sample_1hz(&sample(305, Some(80.0)));
        assert_eq!(f.coverage_counts(0, 3), before);
        assert!(
            snap.abstention_certificate.abstained,
            "one sample does not restore a 60 s interval"
        );
    }

    #[test]
    fn intervals_cover_a_stationary_signal_close_to_nominal_and_skip_missing_samples() {
        let mut f = EwmaResidualForecaster::default();
        for t in 0..1500 {
            let hr = (t % 50 != 7).then(|| 80.0 + noise(t));
            f.ingest_sample_1hz(&sample(t, hr));
        }
        for h_idx in 0..5 {
            let (hits, evaluated) = f.coverage_counts(0, h_idx);
            assert!(evaluated > 1000);
            let coverage = f64::from(hits) / f64::from(evaluated);
            assert!((0.85..=0.97).contains(&coverage), "h{h_idx}: {coverage}");
        }
        // A channel that was never observed has no level and no cone.
        assert_eq!(f.coverage_counts(3, 3), (0, 0));
        assert!(f.cone(3, 3).is_none());
    }
}
