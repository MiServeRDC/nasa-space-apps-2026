use ares_core_types::{ConformalGateStatus, MonotoneQuantileTriplet};
use ares_nqs_stl::sliding_window::LemireMinWedge;
use ares_nqs_stl::timestral_backbone::{CausalScaler, ChannelCausalStats, PatchRepresentation};
use ares_nqs_stl::timestral_quantiles::{ConformalAbstentionGate, QuantileHead, stable_softplus};
use std::collections::VecDeque;

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    #[inline]
    fn next_f64(&mut self, min: f64, max: f64) -> f64 {
        let unit = ((self.next_u64() >> 11) as f64) / ((1u64 << 53) as f64);
        min + unit * (max - min)
    }

    #[inline]
    fn next_range_usize(&mut self, upper: usize) -> usize {
        (self.next_u64() % (upper as u64)) as usize
    }

    fn next_adversarial_f64(&mut self) -> f64 {
        match self.next_range_usize(12) {
            0 => 0.0,
            1 => -0.0,
            2 => f64::NAN,
            3 => f64::INFINITY,
            4 => f64::NEG_INFINITY,
            5 => self.next_f64(-1e12, 1e12),
            6 => 1e12,
            7 => -1e12,
            _ => self.next_f64(-500.0, 500.0),
        }
    }
}

#[test]
fn k1_10000_adversarial_dhf_quantile_head_non_crossing_trials() {
    let mut rng = SplitMix64::new(0x1000_D4F0_90A7_0001);
    let scaler = CausalScaler::default();
    let d_model = 32usize;

    for trial in 0..10_000usize {
        let gamma = match trial % 5 {
            0 => 1e-4,
            1 => 25.0,
            2 => f64::NAN,
            _ => rng.next_f64(1e-3, 12.0),
        };
        let head = QuantileHead::new_deterministic(d_model, gamma);

        // Construct adversarial 7-logit vector (all-zeros, alternating missing/Inf, extreme scales, random).
        let logits: [f64; 7] = match trial % 6 {
            0 => [0.0; 7],
            1 => [
                1e12,
                f64::NAN,
                -1e12,
                f64::INFINITY,
                f64::NEG_INFINITY,
                0.0,
                1e12,
            ],
            2 => [
                f64::NEG_INFINITY,
                -1e9,
                -1e6,
                0.0,
                1e6,
                1e9,
                f64::INFINITY,
            ],
            _ => core::array::from_fn(|_| rng.next_adversarial_f64()),
        };

        let q7 = head.project_seven_quantiles(&logits);
        for (i, w) in q7.windows(2).enumerate() {
            assert!(
                w[0].is_finite() && w[1].is_finite(),
                "trial {trial}: non-finite q7[{i}..={}]: {q7:?}",
                i + 1
            );
            assert!(
                w[0] <= w[1],
                "trial {trial}: quantile crossing in q7 at {i}: {} > {}",
                w[0],
                w[1]
            );
        }

        let stats = ChannelCausalStats {
            median: if trial % 17 == 0 {
                f64::NAN
            } else {
                rng.next_f64(-500.0, 500.0)
            },
            mad_scale: if trial % 19 == 0 {
                0.0
            } else {
                rng.next_f64(1e-4, 80.0)
            },
            observed_ratio: rng.next_f64(0.0, 1.0),
        };
        let conformal_pad = if trial % 23 == 0 {
            f64::INFINITY
        } else {
            rng.next_f64(0.0, 3.0)
        };

        let triplet = head.project_denormalized_triplet(&logits, &scaler, stats, conformal_pad);
        assert!(
            triplet.assert_monotone().is_ok(),
            "trial {trial}: denormalized triplet failed monotonicity: {triplet:?}"
        );
        assert!(triplet.q05 <= triplet.q50 && triplet.q50 <= triplet.q95);

        // Full 4-horizon DHF forecast (+15m, +1h, +6h, +24h) on extreme/alternating embeddings.
        let embedding: Vec<f64> = match trial % 4 {
            0 => vec![0.0; d_model],
            1 => (0..d_model)
                .map(|i| if i % 2 == 0 { 1e12 } else { f64::NAN })
                .collect(),
            2 => (0..d_model)
                .map(|i| if i % 2 == 0 { -1e12 } else { f64::INFINITY })
                .collect(),
            _ => (0..d_model).map(|_| rng.next_adversarial_f64()).collect(),
        };

        let cone = head
            .forecast_channel_horizons("heart_rate_bpm", &embedding, &scaler, stats, conformal_pad)
            .unwrap_or_else(|e| panic!("trial {trial}: forecast_channel_horizons failed: {e}"));

        assert!(
            cone.assert_monotone().is_ok(),
            "trial {trial}: DHF multi-horizon cone crossed: {cone:?}"
        );
        for (h_label, h) in [
            ("+15m", cone.horizon_15m),
            ("+1h", cone.horizon_1h),
            ("+6h", cone.horizon_6h),
            ("+24h", cone.horizon_24h),
        ] {
            assert!(
                h.q05.is_finite() && h.q50.is_finite() && h.q95.is_finite(),
                "trial {trial} ({h_label}): non-finite quantile {h:?}"
            );
            assert!(
                h.q05 <= h.q50 && h.q50 <= h.q95,
                "trial {trial} ({h_label}): crossing {h:?}"
            );
        }

        // Verify stable_softplus non-negativity and finiteness on adversarial inputs.
        for &x in &logits {
            let sp = stable_softplus(x);
            assert!(sp.is_finite() && sp >= 0.0);
        }
    }

    // Verify CausalScaler + PatchRepresentation under alternating missing channels.
    let mut alt_channels: Vec<Vec<Option<f64>>> = (0..4).map(|_| Vec::with_capacity(32)).collect();
    for step in 0..32usize {
        for (ch, vec) in alt_channels.iter_mut().enumerate() {
            let v = if (step + ch) % 2 == 0 {
                None
            } else {
                Some(70.0 + (step as f64) * 0.5)
            };
            vec.push(v);
        }
    }
    let patch = PatchRepresentation::from_multivariate_window(&alt_channels, 32, &scaler)
        .unwrap_or_else(|e| panic!("alternating missing patch failed: {e}"));
    for feat in &patch.dual_features_per_channel {
        assert_eq!(feat.len(), 64);
        assert!(feat.iter().all(|v| v.is_finite()));
    }
}

#[test]
fn k1_lemire_min_wedge_2000_randomized_sequences_oracle_equivalence() {
    let mut rng = SplitMix64::new(0x2000_1E31_8E00_0002);

    for trial in 0..2_000usize {
        let seq_len = 1 + rng.next_range_usize(192);
        let window_s = rng.next_f64(1.0, 60.0);
        let mut wedge = LemireMinWedge::new(window_s);
        let mut oracle: VecDeque<(f64, f64)> = VecDeque::new();

        let mut t = 0.0_f64;
        for step in 0..seq_len {
            // Mix unit 1 Hz steps and irregular non-decreasing dt steps.
            if step > 0 {
                let dt = if trial % 3 == 0 {
                    1.0
                } else {
                    rng.next_f64(0.1, 3.5)
                };
                t += dt;
            }
            let val = match rng.next_range_usize(10) {
                0 => 0.0,
                1 => -1.0,
                2 => 1.0,
                _ => rng.next_f64(-100.0, 100.0),
            };

            let got = wedge.push_and_evaluate(t, val);
            oracle.push_back((t, val));
            let cutoff = t - window_s;
            while let Some(&(front_t, _)) = oracle.front() {
                if front_t < cutoff {
                    oracle.pop_front();
                } else {
                    break;
                }
            }
            let expected = oracle
                .iter()
                .map(|&(_, v)| v)
                .fold(f64::INFINITY, f64::min);

            assert!(
                (got - expected).abs() < 1e-12,
                "trial {trial} step {step} (t={t:.4}, W={window_s:.4}): Lemire={got} vs oracle={expected}"
            );
        }

        // Verify rewind reset clears prior window cleanly when t jumps backward.
        if t > 0.0 {
            let reset = wedge.push_and_evaluate(0.0, 0.42);
            assert!((reset - 0.42).abs() < 1e-12);
            assert_eq!(wedge.len(), 1);
        }
    }
}

#[test]
fn k2_conformal_abstention_gate_motion_artifact_chaos_and_convergence() {
    let mut rng = SplitMix64::new(0xC0AF_083A_A857_0003);

    // 1. Sustained prediction drift / motion-artifact burst -> EMA exceeds max_coverage_drift (0.35).
    let mut gate = ConformalAbstentionGate::default();
    let tight_cone = MonotoneQuantileTriplet::from_median_and_spreads(0.75, 0.05, 0.05);

    let initial_cert = gate.evaluate_with_certificate(0.95, 1.0, tight_cone, 0.0);
    assert!(!initial_cert.abstained);
    assert_eq!(initial_cert.status, ConformalGateStatus::HeuristicGateAccepted);

    let mut prev_pad = gate.adaptive_lookahead_pad;
    let mut abstained_at_step = None;
    for step in 1..=30usize {
        // Inject severe motion-artifact out-of-cone residuals (|y - q50| > 3 * width).
        let burst_val = if step % 2 == 0 { -1.5 } else { 2.5 };
        let err_t = gate.update_conformal_calibration(burst_val, tight_cone, 0.12);
        assert!(err_t > 0.0);
        assert!(gate.adaptive_lookahead_pad >= prev_pad);
        prev_pad = gate.adaptive_lookahead_pad;

        let cert = gate.evaluate_with_certificate(0.92, 0.98, tight_cone, step as f64);
        if cert.abstained && abstained_at_step.is_none() {
            abstained_at_step = Some(step);
        }
    }

    assert!(
        abstained_at_step.is_some(),
        "ConformalAbstentionGate failed to abstain during sustained out-of-cone burst"
    );
    assert!(gate.ema_coverage_error.abs() > gate.max_coverage_drift);
    assert!(gate.adaptive_alpha_t < 0.10); // ACI tightened alpha_t
    assert!(gate.adaptive_lookahead_pad > 0.0);

    let final_burst_cert = gate.evaluate_with_certificate(0.92, 0.98, tight_cone, 31.0);
    assert!(final_burst_cert.abstained);
    assert_eq!(
        final_burst_cert.status,
        ConformalGateStatus::AbstainedFallbackDeterministic
    );

    // 2. Recovery phase: in-cone observations reduce EMA coverage error below drift threshold.
    for step in 32..=120usize {
        let in_cone_y = rng.next_f64(0.71, 0.79);
        let _ = gate.update_conformal_calibration(in_cone_y, tight_cone, 0.12);
        let _ = step;
    }
    assert!(gate.ema_coverage_error.abs() < gate.max_coverage_drift);
    let recovered_cert = gate.evaluate_with_certificate(0.93, 1.0, tight_cone, 121.0);
    assert!(!recovered_cert.abstained);
    assert_eq!(recovered_cert.status, ConformalGateStatus::HeuristicGateAccepted);

    // 3. Sensor failure chaos bursts: SQI < 0.70, missing > 40%, excessive width > 1.25, non-finite inputs.
    let fresh = ConformalAbstentionGate::default();
    let low_sqi = fresh.evaluate_with_certificate(0.42, 1.0, tight_cone, 10.0);
    assert!(low_sqi.abstained);
    assert_eq!(low_sqi.status, ConformalGateStatus::AbstainedFallbackDeterministic);

    let high_missing = fresh.evaluate_with_certificate(0.95, 0.55, tight_cone, 11.0);
    assert!(high_missing.abstained);
    assert_eq!(high_missing.status, ConformalGateStatus::AbstainedFallbackDeterministic);

    let wide_cone = MonotoneQuantileTriplet::from_median_and_spreads(0.5, 0.80, 0.80);
    let too_wide = fresh.evaluate_with_certificate(0.95, 1.0, wide_cone, 12.0);
    assert!(too_wide.abstained);
    assert_eq!(too_wide.status, ConformalGateStatus::AbstainedFallbackDeterministic);

    let nan_sqi = fresh.evaluate_with_certificate(f64::NAN, f64::NAN, tight_cone, f64::NAN);
    assert!(nan_sqi.abstained);
    assert!(nan_sqi.sqi_score.is_finite() && nan_sqi.timestamp_s.is_finite());
}
