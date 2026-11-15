//! Development-only proper interval-score comparison. Never loads held-out subjects.
use ares_nqs_stl::ewma_forecaster::{EWMA_HORIZONS_S, EWMA_NOMINAL_COVERAGE};
use ares_nqs_stl::{AresMultivariateSample, EwmaForecasterConfig, EwmaResidualForecaster};
use ares_server_cli::anomaly_eval::{Split, load_records, split_of};
use std::{collections::VecDeque, path::Path};
#[derive(Clone, Default)]
struct Score {
    hits: u64,
    n: u64,
    width: f64,
    interval_score: f64,
    queue: VecDeque<Option<(f64, f64)>>,
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let records = load_records(&[&root.join("data/bidmc"), &root.join("data/bidmc_eval")])?;
    let mut total = vec![vec![vec![Score::default(); 5]; 3]; 2];
    for record in records
        .iter()
        .filter(|r| split_of(r.number) == Split::Development)
    {
        let scaled = EwmaForecasterConfig {
            horizon_scaled_width: true,
            ..Default::default()
        };
        let mut arms = [
            EwmaResidualForecaster::default(),
            EwmaResidualForecaster::new(scaled),
        ];
        let mut scores = vec![vec![vec![Score::default(); 5]; 3]; 2];
        for row in &record.rows {
            let observed = [row.hr_bpm, row.pulse_bpm, row.resp_brpm, row.spo2_pct];
            let mut values = [0.0; 12];
            let mut mask = 0;
            for (i, x) in observed.iter().enumerate() {
                if let Some(x) = x {
                    values[i] = *x;
                    mask |= 1 << i;
                }
            }
            for (a, arm) in arms.iter_mut().enumerate() {
                for (c, &channel) in [0, 2, 3].iter().enumerate() {
                    for (i, &h) in EWMA_HORIZONS_S.iter().enumerate() {
                        let s = &mut scores[a][c][i];
                        if s.queue.len() >= h
                            && let Some(Some((lo, hi))) = s.queue.pop_front()
                            && let Some(x) = observed[channel]
                        {
                            s.hits += u64::from(x >= lo && x <= hi);
                            s.n += 1;
                            s.width += hi - lo;
                            // Proper central 90% interval score (Winkler), same units as the channel.
                            s.interval_score += hi - lo
                                + (2.0 / (1.0 - EWMA_NOMINAL_COVERAGE))
                                    * ((lo - x).max(0.0) + (x - hi).max(0.0));
                        }
                    }
                }
                arm.ingest_sample_1hz(&AresMultivariateSample {
                    recording_time_s: row.relative_time_s,
                    values,
                    observed_mask: mask,
                    sqi_score: 1.0,
                });
                for (c, &channel) in [0, 2, 3].iter().enumerate() {
                    for (h, score) in scores[a][c].iter_mut().enumerate() {
                        score
                            .queue
                            .push_back(arm.cone(channel, h).map(|x| (x.q05, x.q95)));
                    }
                }
            }
        }
        for a in 0..2 {
            for c in 0..3 {
                for h in 0..5 {
                    let s = &scores[a][c][h];
                    let t = &mut total[a][c][h];
                    t.hits += s.hits;
                    t.n += s.n;
                    t.width += s.width;
                    t.interval_score += s.interval_score;
                }
            }
        }
    }
    println!(
        "# Development-only forecast controller comparison\n\nNo held-out subjects evaluated; no automatic selection or tuning. Lower interval score is better, within the same channel/horizon.\n\n| Arm | Channel | Horizon | Coverage | Width | Interval score | Scored |\n|---|---|---:|---:|---:|---:|---:|"
    );
    for (a, arm) in total.iter().enumerate() {
        for (c, ch) in arm.iter().enumerate() {
            for (h, s) in ch.iter().enumerate() {
                let n = s.n.max(1) as f64;
                println!(
                    "| {} | {} | {} | {:.2}% | {:.3} | {:.3} | {} |",
                    ["existing", "horizon-scaled candidate"][a],
                    ["HR", "RESP", "SpO2"][c],
                    EWMA_HORIZONS_S[h],
                    100.0 * s.hits as f64 / n,
                    s.width / n,
                    s.interval_score / n,
                    s.n
                );
            }
        }
    }
    Ok(())
}
