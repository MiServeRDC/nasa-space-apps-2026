//! Fase 16 (H2): Direct Multi-Horizon Forecasting (DHF) Non-Crossing Monotone QuantileHead
//! and Adaptive Conformal Abstention Gate (Conformal PID / ACI) for ARES-Health.

use crate::error::NqsStlError;
use crate::timestral_backbone::{CausalScaler, ChannelCausalStats};
use ares_core_types::{
    AbstentionCertificate, ChannelQuantileCone, ConformalGateStatus, MonotoneQuantileTriplet,
};
use serde::{Deserialize, Serialize};

/// Type alias preserving compatibility with plan references.
pub type ForecastConfidenceState = ConformalGateStatus;

/// Type alias preserving compatibility with plan references.
pub type MonotoneQuantileHead = QuantileHead;

/// Canonical 7-node quantile grid centered at median index 3 (tau = 0.50):
/// [0.01, 0.05, 0.25, 0.50, 0.75, 0.95, 0.99].
pub const CANONICAL_QUANTILE_LEVELS: [f64; 7] = [0.01, 0.05, 0.25, 0.50, 0.75, 0.95, 0.99];
pub const CANONICAL_MEDIAN_INDEX: usize = 3;
pub const CANONICAL_Q05_INDEX: usize = 1;
pub const CANONICAL_Q95_INDEX: usize = 5;

/// Horizon names corresponding to DHF_HORIZONS_SECONDS (+15m, +1h, +6h, +24h).
pub const DHF_HORIZON_SCALE_MULTIPLIERS: [f64; 4] = [1.0, 1.35, 1.85, 2.50];

/// Numerically stable, non-overflowing softplus: ln(1 + exp(x)) > 0.
/// Non-finite inputs are sanitized to 0.0; large inputs are clamped to avoid `f64::INFINITY`.
#[inline]
pub fn stable_softplus(x: f64) -> f64 {
    let clean_x = if x.is_finite() {
        x.clamp(-500.0, 500.0)
    } else {
        0.0
    };
    clean_x.max(0.0) + (-clean_x.abs()).exp().ln_1p()
}

/// Direct Multi-Horizon Forecasting (DHF) Quantile Head guaranteeing algebraic non-crossing:
/// q05 <= q50 <= q95 for every horizon (+15m, +1h, +6h, +24h) and any finite/extreme input.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuantileHead {
    pub spread_scale_gamma: f64,
    pub d_model: usize,
    /// Deterministic projection weights of shape [4 horizons * 7 quantile logits][d_model].
    proj_weights: Vec<f64>,
}

impl Default for QuantileHead {
    fn default() -> Self {
        Self::new_deterministic(32, 1.0)
    }
}

impl QuantileHead {
    /// Builds a deterministic DHF QuantileHead for a given backbone embedding width `d_model`.
    pub fn new_deterministic(d_model: usize, spread_scale_gamma: f64) -> Self {
        let dim = d_model.max(1);
        let rows = 4 * 7;
        let mut proj_weights = Vec::with_capacity(rows * dim);
        let inv_sqrt = 1.0 / (dim as f64).sqrt();
        for r in 0..rows {
            for c in 0..dim {
                // Deterministic pseudo-orthogonal sinusoid pattern
                let phase = ((r * 31 + c * 17) as f64) * 0.37;
                proj_weights.push(phase.sin() * 0.25 * inv_sqrt);
            }
        }
        Self {
            spread_scale_gamma: if spread_scale_gamma.is_finite() {
                spread_scale_gamma.max(1e-4)
            } else {
                1.0
            },
            d_model: dim,
            proj_weights,
        }
    }

    /// Constructs a validated `QuantileHead` from checkpoint weights (`[28, d_model]`) and
    /// `spread_scale_gamma >= 1e-4`.
    pub fn from_loaded_weights(
        d_model: usize,
        spread_scale_gamma: f64,
        proj_weights: Vec<f64>,
    ) -> Result<Self, NqsStlError> {
        if d_model == 0 {
            return Err(NqsStlError::InvalidConfig {
                reason: "QuantileHead d_model must be > 0",
            });
        }
        if !spread_scale_gamma.is_finite() {
            return Err(NqsStlError::NonFiniteValue {
                field: "QuantileHead::spread_scale_gamma",
            });
        }
        if spread_scale_gamma < 1e-4 {
            return Err(NqsStlError::InvalidConfig {
                reason: "QuantileHead spread_scale_gamma must be >= 1e-4",
            });
        }
        let expected_len = 28usize.checked_mul(d_model).ok_or(NqsStlError::InvalidConfig {
            reason: "QuantileHead projection weight dimension overflow",
        })?;
        if proj_weights.len() != expected_len {
            return Err(NqsStlError::DimensionMismatch {
                expected: expected_len,
                found: proj_weights.len(),
            });
        }
        if proj_weights.iter().any(|w| !w.is_finite()) {
            return Err(NqsStlError::NonFiniteValue {
                field: "QuantileHead::proj_weights",
            });
        }
        Ok(Self {
            spread_scale_gamma,
            d_model,
            proj_weights,
        })
    }

    /// Projects a 7-logit vector into 7 strictly non-crossing quantiles via upper/lower
    /// triangular softplus accumulation anchored at the median (index 3).
    pub fn project_seven_quantiles(&self, raw_logits: &[f64; 7]) -> [f64; 7] {
        let gamma = self.spread_scale_gamma.max(1e-4);
        let mut out = [0.0; 7];
        let median = if raw_logits[CANONICAL_MEDIAN_INDEX].is_finite() {
            raw_logits[CANONICAL_MEDIAN_INDEX].clamp(-1e9, 1e9)
        } else {
            0.0
        };
        out[CANONICAL_MEDIAN_INDEX] = median;

        // Lower branch (j = m-1 down to 0): subtractive triangular accumulation
        let mut cum_lower = 0.0;
        for j in (0..CANONICAL_MEDIAN_INDEX).rev() {
            let delta_tau = CANONICAL_QUANTILE_LEVELS[j + 1] - CANONICAL_QUANTILE_LEVELS[j];
            let step = gamma * delta_tau * stable_softplus(raw_logits[j]);
            cum_lower += step;
            out[j] = median - cum_lower;
        }

        // Upper branch (i = m+1 up to 6): additive triangular accumulation
        let mut cum_upper = 0.0;
        for i in (CANONICAL_MEDIAN_INDEX + 1)..7 {
            let delta_tau = CANONICAL_QUANTILE_LEVELS[i] - CANONICAL_QUANTILE_LEVELS[i - 1];
            let step = gamma * delta_tau * stable_softplus(raw_logits[i]);
            cum_upper += step;
            out[i] = median + cum_upper;
        }

        out
    }

    /// Projects raw logits and denormalizes `(q05, q50, q95)` back to physical units via `sinh`.
    pub fn project_denormalized_triplet(
        &self,
        raw_logits: &[f64; 7],
        scaler: &CausalScaler,
        stats: ChannelCausalStats,
        conformal_padding: f64,
    ) -> MonotoneQuantileTriplet {
        let latent_q = self.project_seven_quantiles(raw_logits);
        let pad = if conformal_padding.is_finite() {
            conformal_padding.clamp(0.0, 4.0)
        } else {
            0.0
        };
        let q05 = scaler.denormalize_value(latent_q[CANONICAL_Q05_INDEX] - pad, stats);
        let q50 = scaler.denormalize_value(latent_q[CANONICAL_MEDIAN_INDEX], stats);
        let q95 = scaler.denormalize_value(latent_q[CANONICAL_Q95_INDEX] + pad, stats);

        MonotoneQuantileTriplet {
            q05: q05.min(q50),
            q50,
            q95: q95.max(q50),
        }
    }

    /// Direct Multi-Horizon Forecasting (DHF) from a channel's latent embedding `h`:
    /// emits non-crossing `[q05, q50, q95]` cones across +15m, +1h, +6h, +24h.
    pub fn forecast_channel_horizons(
        &self,
        channel_name: &str,
        latent_embedding: &[f64],
        scaler: &CausalScaler,
        stats: ChannelCausalStats,
        conformal_padding: f64,
    ) -> Result<ChannelQuantileCone, NqsStlError> {
        if latent_embedding.len() != self.d_model {
            return Err(NqsStlError::DimensionMismatch {
                expected: self.d_model,
                found: latent_embedding.len(),
            });
        }

        let mut triplets = [MonotoneQuantileTriplet {
            q05: 0.0,
            q50: 0.0,
            q95: 0.0,
        }; 4];

        for (h_idx, &horizon_scale) in DHF_HORIZON_SCALE_MULTIPLIERS.iter().enumerate() {
            let mut raw_logits = [0.0; 7];
            for (q_idx, logit) in raw_logits.iter_mut().enumerate() {
                let row_idx = h_idx * 7 + q_idx;
                let row = &self.proj_weights[row_idx * self.d_model..(row_idx + 1) * self.d_model];
                let dot: f64 = row
                    .iter()
                    .zip(latent_embedding.iter())
                    .map(|(&w, &e)| if e.is_finite() { w * e } else { 0.0 })
                    .sum();
                *logit = if q_idx == CANONICAL_MEDIAN_INDEX {
                    dot * 0.25
                } else {
                    dot + 0.3 * horizon_scale
                };
            }
            triplets[h_idx] = self.project_denormalized_triplet(
                &raw_logits,
                scaler,
                stats,
                conformal_padding * horizon_scale,
            );
        }

        Ok(ChannelQuantileCone {
            channel_name: channel_name.to_string(),
            horizon_15m: triplets[0],
            horizon_1h: triplets[1],
            horizon_6h: triplets[2],
            horizon_24h: triplets[3],
        })
    }
}

/// Adaptive Conformal Inference / Conformal PID Gate (Angelopoulos et al. 2023).
/// Tracks empirical miscoverage error `err_t = I(y_t not in [q05, q95]) - alpha`
/// and emits `AbstentionCertificate` when interval width, coverage drift, SQI, or
/// missingness exceed clinical safety bounds.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ConformalAbstentionGate {
    pub min_sqi_threshold: f64,
    pub max_missing_ratio: f64,
    pub max_rho_cone_width: f64,
    pub conformal_miscoverage_alpha: f64,
    pub max_coverage_drift: f64,
    pub adaptive_alpha_t: f64,
    pub adaptive_lookahead_pad: f64,
    pub ema_coverage_error: f64,
    pub cumulative_coverage_error: f64,
    pub last_coverage_error: f64,
    pub update_count: u64,
}

impl Default for ConformalAbstentionGate {
    fn default() -> Self {
        Self {
            min_sqi_threshold: 0.70,
            max_missing_ratio: 0.40,
            max_rho_cone_width: 1.25,
            conformal_miscoverage_alpha: 0.10, // Target 90% coverage [q05, q95]
            max_coverage_drift: 0.35,
            adaptive_alpha_t: 0.10,
            adaptive_lookahead_pad: 0.0,
            ema_coverage_error: 0.0,
            cumulative_coverage_error: 0.0,
            last_coverage_error: 0.0,
            update_count: 0,
        }
    }
}

impl ConformalAbstentionGate {
    /// Updates Conformal PID calibration state with the realized observation `y_t`.
    /// Computes `err_t = I(y_t not in [q05, q95]) - alpha` and adjusts both
    /// `adaptive_alpha_t` (ACI) and `adaptive_lookahead_pad` (PID integral/proportional).
    pub fn update_conformal_calibration(
        &mut self,
        realized_value: f64,
        previous_cone: MonotoneQuantileTriplet,
        learning_rate_eta: f64,
    ) -> f64 {
        let eta = if learning_rate_eta.is_finite() {
            learning_rate_eta.clamp(0.0, 0.5)
        } else {
            0.05
        };

        let is_miscovered = !realized_value.is_finite()
            || !previous_cone.is_monotone()
            || realized_value < previous_cone.q05
            || realized_value > previous_cone.q95;

        let indicator = if is_miscovered { 1.0 } else { 0.0 };
        let err_t = indicator - self.conformal_miscoverage_alpha;

        self.last_coverage_error = err_t;
        self.cumulative_coverage_error =
            (self.cumulative_coverage_error + err_t).clamp(-50.0, 50.0);
        self.ema_coverage_error = 0.85 * self.ema_coverage_error + 0.15 * err_t;
        self.update_count += 1;

        // ACI update: alpha_{t+1} = alpha_t + eta * (alpha - indicator)
        self.adaptive_alpha_t = (self.adaptive_alpha_t - eta * err_t).clamp(0.01, 0.50);

        // Conformal PID padding update (proportional + damped integral)
        let pid_delta = eta * (err_t + 0.05 * self.cumulative_coverage_error);
        self.adaptive_lookahead_pad = (self.adaptive_lookahead_pad + pid_delta).clamp(0.0, 1.5);
        err_t
    }

    /// Evaluates heuristic gate criteria and emits a complete `AbstentionCertificate`.
    pub fn evaluate_with_certificate(
        &self,
        sqi_score: f64,
        observed_ratio: f64,
        rho_cone: MonotoneQuantileTriplet,
        timestamp_s: f64,
    ) -> AbstentionCertificate {
        let clean_sqi = if sqi_score.is_finite() {
            sqi_score.clamp(0.0, 1.0)
        } else {
            0.0
        };
        let clean_obs = if observed_ratio.is_finite() {
            observed_ratio.clamp(0.0, 1.0)
        } else {
            0.0
        };
        let missing_ratio = (1.0 - clean_obs).clamp(0.0, 1.0);
        let width = rho_cone.interval_width();

        let reason = if !rho_cone.is_monotone() {
            Some("quantile cone failed monotonicity or finiteness check")
        } else if clean_sqi < self.min_sqi_threshold {
            Some("numeric SQI below configured scenario threshold")
        } else if missing_ratio > self.max_missing_ratio {
            Some("missing telemetry ratio exceeded 40% limit")
        } else if width > self.max_rho_cone_width {
            Some("scenario interval width exceeded configured bound")
        } else if self.ema_coverage_error.abs() > self.max_coverage_drift {
            Some("online residual diagnostic exceeded configured bound")
        } else {
            None
        };

        let (abstained, status, reason_str) = match reason {
            Some(msg) => (
                true,
                ConformalGateStatus::AbstainedFallbackDeterministic,
                msg.to_string(),
            ),
            None => (
                false,
                ConformalGateStatus::HeuristicGateAccepted,
                "heuristic gate accepted; empirical coverage and clinical utility unvalidated"
                    .to_string(),
            ),
        };

        AbstentionCertificate {
            abstained,
            status,
            reason: reason_str,
            empirical_coverage_error: self.ema_coverage_error,
            adaptive_alpha_t: self.adaptive_alpha_t,
            interval_width: width,
            sqi_score: clean_sqi,
            missing_ratio,
            timestamp_s: if timestamp_s.is_finite() {
                timestamp_s
            } else {
                0.0
            },
        }
    }

    /// Evaluates whether the quantile cone satisfies configured numerical criteria, not validated clinical confidence.
    #[inline]
    pub fn evaluate_gate(
        &self,
        sqi_score: f64,
        observed_ratio: f64,
        rho_cone: MonotoneQuantileTriplet,
    ) -> ConformalGateStatus {
        self.evaluate_with_certificate(sqi_score, observed_ratio, rho_cone, 0.0)
            .status
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_monotone_quantile_head_never_crosses_across_500_extreme_inputs() {
        let head = QuantileHead::new_deterministic(16, 1.0);
        let scaler = CausalScaler::default();
        let stats = ChannelCausalStats {
            median: 72.0,
            mad_scale: 4.5,
            observed_ratio: 0.9,
        };

        for step in 0..500 {
            let s = step as f64;
            let raw_logits: [f64; 7] = match step % 5 {
                0 => [1e9, -1e9, 500.0, -300.0, -500.0, 1e9, -1e9],
                1 => [
                    f64::NAN,
                    f64::INFINITY,
                    -f64::INFINITY,
                    0.0,
                    f64::NAN,
                    100.0,
                    -100.0,
                ],
                2 => [
                    (s * 1.7).sin() * 100.0,
                    (s * 2.3).cos() * 100.0,
                    -s,
                    s * 0.01 - 2.5,
                    -s * 0.5,
                    (s * 0.9).tan().clamp(-1e6, 1e6),
                    -1e5,
                ],
                3 => [
                    -50.0 * s,
                    -40.0 * s,
                    -30.0 * s,
                    0.0,
                    -20.0 * s,
                    -10.0 * s,
                    -5.0 * s,
                ],
                _ => [50.0, 25.0, 10.0, -12.0, -80.0, -150.0, -300.0],
            };

            let q7 = head.project_seven_quantiles(&raw_logits);
            for w in q7.windows(2) {
                assert!(
                    w[0] <= w[1] && w[0].is_finite() && w[1].is_finite(),
                    "Quantile crossing at step {}: {:?}",
                    step,
                    q7
                );
            }

            let triplet = head.project_denormalized_triplet(&raw_logits, &scaler, stats, 0.05);
            triplet
                .assert_monotone()
                .expect("denormalized triplet must never cross");
        }
    }

    #[test]
    fn test_dhf_multi_horizon_channel_cone_non_crossing() {
        let head = QuantileHead::new_deterministic(16, 1.0);
        let scaler = CausalScaler::default();
        let stats = ChannelCausalStats {
            median: 68.0,
            mad_scale: 3.2,
            observed_ratio: 1.0,
        };
        let emb: Vec<f64> = (0..16).map(|i| (i as f64) * 0.15 - 1.0).collect();
        let cone = head
            .forecast_channel_horizons("heart_rate_bpm", &emb, &scaler, stats, 0.02)
            .expect("horizon forecast should succeed");
        cone.assert_monotone()
            .expect("all 4 horizons must be monotone");
        // Uncertainty widens or stays bounded from +15m to +24h
        assert!(cone.horizon_24h.interval_width() >= cone.horizon_15m.interval_width() * 0.9);
    }

    #[test]
    fn test_conformal_abstention_gate_triggers_certificate_on_sensor_failure_and_drift() {
        let mut gate = ConformalAbstentionGate::default();
        let tight_cone = MonotoneQuantileTriplet::from_median_and_spreads(0.50, 0.10, 0.10);

        // Numerical criteria pass; this is not a calibration claim.
        let nom_cert = gate.evaluate_with_certificate(0.92, 0.95, tight_cone, 10.0);
        assert!(!nom_cert.abstained);
        assert_eq!(nom_cert.status, ConformalGateStatus::HeuristicGateAccepted);

        // 1. Sensor failure: SQI drops below 0.70
        let low_sqi_cert = gate.evaluate_with_certificate(0.55, 1.0, tight_cone, 11.0);
        assert!(low_sqi_cert.abstained);
        assert_eq!(
            low_sqi_cert.status,
            ConformalGateStatus::AbstainedFallbackDeterministic
        );
        assert!(low_sqi_cert.reason.contains("SQI"));

        // 2. Sensor failure: >40% missing channels (observed_ratio = 0.50)
        let missing_cert = gate.evaluate_with_certificate(0.95, 0.50, tight_cone, 12.0);
        assert!(missing_cert.abstained);
        assert_eq!(
            missing_cert.status,
            ConformalGateStatus::AbstainedFallbackDeterministic
        );

        // 3. Repeated miscoverage causes adaptive_lookahead_pad expansion and coverage drift abstention
        let initial_pad = gate.adaptive_lookahead_pad;
        for t in 0..15 {
            // Realized value 5.0 lies far outside [0.40, 0.60]
            let err = gate.update_conformal_calibration(5.0, tight_cone, 0.10);
            assert!((err - 0.90).abs() < 1e-12);
            if t == 0 {
                assert!(gate.adaptive_lookahead_pad > initial_pad);
            }
        }
        let drift_cert = gate.evaluate_with_certificate(0.95, 1.0, tight_cone, 30.0);
        assert!(drift_cert.abstained);
        assert!(drift_cert.reason.contains("residual diagnostic"));
    }
    #[test]
    fn gate_acceptance_before_updates_does_not_claim_calibration() {
        let gate = ConformalAbstentionGate::default();
        assert_eq!(gate.update_count, 0);
        let cone = MonotoneQuantileTriplet::from_median_and_spreads(0.5, 0.1, 0.1);
        let cert = gate.evaluate_with_certificate(0.95, 1.0, cone, 0.0);
        assert!(!cert.abstained);
        assert_eq!(cert.status, ConformalGateStatus::HeuristicGateAccepted);
        assert!(cert.reason.contains("unvalidated"));
    }
}
