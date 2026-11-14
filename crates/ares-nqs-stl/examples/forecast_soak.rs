//! Synthetic stress comparison only. No tuning, clinical labels or held-out data.
use ares_nqs_stl::ewma_forecaster::EWMA_HORIZONS_S;
use ares_nqs_stl::{AresMultivariateSample, EwmaForecasterConfig, EwmaResidualForecaster};
use std::collections::VecDeque;

#[derive(Clone, Default)]
struct Score {
    covered: u64,
    evaluated: u64,
    width: f64,
    queue: VecDeque<Option<(f64, f64)>>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let hours = std::env::args()
        .nth(1)
        .map(|s| s.parse::<usize>())
        .transpose()?
        .unwrap_or(8);
    if !(1..=24).contains(&hours) {
        return Err("hours must be in 1..=24".into());
    }
    println!(
        "# Synthetic streaming forecast stress comparison\n\nDuration: {hours} h per scenario. Development-fixed defaults; no tuning.\nThree arms: existing adaptive-width EWMA, raw residual quantiles and a horizon-scaled experimental candidate.\nThis is not clinical validation or a replacement for subject-held-out evaluation.\n"
    );
    println!(
        "| Scenario | Arm | Channel | Horizon (s) | Coverage | Mean width | Scored | Max retained entries |\n|---|---|---|---:|---:|---:|---:|---:|"
    );
    for scenario in ["stationary", "drift", "dropouts"] {
        let raw = EwmaForecasterConfig {
            width_gamma: 0.0,
            ..Default::default()
        };
        let scaled = EwmaForecasterConfig {
            horizon_scaled_width: true,
            ..Default::default()
        };
        let mut arms = [
            EwmaResidualForecaster::default(),
            EwmaResidualForecaster::new(raw),
            EwmaResidualForecaster::new(scaled),
        ];
        let mut scores = vec![vec![vec![Score::default(); 5]; 3]; 3];
        let mut retained = [0; 3];
        let mut rng = 42u64;
        for t in 0..hours * 3600 {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
            let noise = ((rng >> 32) as u32 as f64 / u32::MAX as f64 - 0.5) * 2.0;
            // Explicit artificial trend, not a physiological/circadian model.
            let drift = if scenario == "drift" {
                t as f64 / 3600.0
            } else {
                0.0
            };
            let observed = scenario != "dropouts" || !(1800..1830).contains(&(t % 3600));
            let mut values = [0.0; 12];
            values[0] = 72.0 + noise * 3.0 + drift;
            values[1] = values[0];
            values[2] = 16.0 + noise;
            values[3] = 97.0 + noise * 0.5;
            let sample = AresMultivariateSample {
                recording_time_s: t as f64,
                values,
                observed_mask: if observed { 15 } else { 0 },
                sqi_score: if observed { 1.0 } else { 0.0 },
            };
            for (arm_idx, arm) in arms.iter_mut().enumerate() {
                // Independently score only forecasts issued h steps earlier,
                // before ingesting this step. Never score a newly fitted interval.
                for (slot, &channel) in [0, 2, 3].iter().enumerate() {
                    for (h_idx, &h) in EWMA_HORIZONS_S.iter().enumerate() {
                        let score = &mut scores[arm_idx][slot][h_idx];
                        if score.queue.len() >= h
                            && let Some(Some((lo, hi))) = score.queue.pop_front()
                            && observed
                        {
                            score.evaluated += 1;
                            score.covered +=
                                u64::from(values[channel] >= lo && values[channel] <= hi);
                            score.width += hi - lo;
                        }
                    }
                }
                arm.ingest_sample_1hz(&sample);
                retained[arm_idx] = retained[arm_idx].max(arm.retained_sample_count());
                for (slot, &channel) in [0, 2, 3].iter().enumerate() {
                    for (h, score) in scores[arm_idx][slot].iter_mut().enumerate() {
                        score
                            .queue
                            .push_back(arm.cone(channel, h).map(|c| (c.q05, c.q95)));
                        // Cross-check the production scoring against the independent queue.
                        let (hits, count) = arm.coverage_counts(channel, h);
                        if (u64::from(hits), u64::from(count)) != (score.covered, score.evaluated) {
                            return Err(
                                "forecast scoring disagrees with independent chronological scorer"
                                    .into(),
                            );
                        }
                    }
                }
            }
        }
        for a in 0..3 {
            for (c, name) in ["HR", "RESP", "SpO2"].iter().enumerate() {
                for (h, &seconds) in EWMA_HORIZONS_S.iter().enumerate() {
                    let s = &scores[a][c][h];
                    let n = s.evaluated.max(1) as f64;
                    println!(
                        "| {scenario} | {} | {name} | {seconds} | {:.2}% | {:.3} | {} | {} |",
                        ["adaptive", "raw quantiles", "horizon-scaled candidate"][a],
                        100.0 * s.covered as f64 / n,
                        s.width / n,
                        s.evaluated,
                        retained[a]
                    );
                }
            }
        }
    }
    Ok(())
}
