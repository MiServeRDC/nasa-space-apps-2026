//! Offline evaluation of `VitalsAnomalyDetector` on BIDMC records with injected
//! events, against a fixed-threshold monitor. Deterministic: no randomness other
//! than a fixed-seed bootstrap for the confidence intervals.
//!
//! Attribution is paired: each injected run is compared second by second with the
//! clean run of the same record, and an event counts as detected only when an
//! alert is active in the injected run and not in the clean run. Alerts that the
//! record raises on its own can therefore never be credited as detections.

use ares_core_types::{AnomalyDetectorKind, AnomalyStatus};
use ares_nqs_stl::ewma_forecaster::EwmaResidualForecaster;
use ares_nqs_stl::timestral_backbone::ARES_TIMESTRAL_CHANNELS;
use ares_nqs_stl::timestral_bridge::AresMultivariateSample;
use ares_nqs_stl::vitals_anomaly::{VitalsAnomalyConfig, VitalsAnomalyDetector};
use ares_telemetry_ingest::anomaly_injection::{AnomalyInjection, InjectedAnomalyKind};
use ares_telemetry_ingest::bidmc_replayer::{BidmcNumericRow, BidmcReplayer, IngestError};
use std::fmt::Write as _;
use std::path::Path;

/// Event onsets (s) used for every record and event kind.
pub const EVAL_ONSETS_S: [f64; 3] = [180.0, 240.0, 300.0];
/// Alerts closer than this are merged into one episode when counting alert episodes.
pub const EPISODE_MERGE_GAP_S: usize = 30;
const BOOTSTRAP_RESAMPLES: usize = 2000;
const BOOTSTRAP_SEED: u64 = 0x00A2_E5C0_FFEE_2026;

/// Fixed adult monitor limits used as the comparator (same 10 s persistence as
/// the detector's alarm level).
pub const FIXED_SPO2_LOW: f64 = 90.0;
pub const FIXED_HR_HIGH: f64 = 120.0;
pub const FIXED_HR_LOW: f64 = 50.0;
pub const FIXED_RESP_HIGH: f64 = 30.0;
pub const FIXED_RESP_LOW: f64 = 8.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Split {
    /// Records looked at while fixing the detector parameters.
    Development,
    /// Records never used to choose any parameter.
    HeldOut,
}

/// `bidmc_01`, `bidmc_02` (development in `data/bidmc/MANIFEST.json`) and 04-13 are
/// development; `bidmc_03` (held-out in the manifest) and 14-53 are held out.
pub fn split_of(record_number: u32) -> Split {
    if record_number == 3 || record_number >= 14 {
        Split::HeldOut
    } else {
        Split::Development
    }
}

#[derive(Debug, Clone)]
pub struct EvalRecord {
    pub number: u32,
    pub rows: Vec<BidmcNumericRow>,
}

/// Loads `bidmc_NN_Numerics.csv` for NN in 1..=53 from the given directories.
pub fn load_records(dirs: &[&Path]) -> Result<Vec<EvalRecord>, IngestError> {
    let mut records = Vec::new();
    for number in 1..=53u32 {
        let file = format!("bidmc_{number:02}_Numerics.csv");
        if let Some(path) = dirs.iter().map(|d| d.join(&file)).find(|p| p.is_file()) {
            let replayer = BidmcReplayer::from_csv_path(&format!("bidmc_{number:02}"), &path)?;
            records.push(EvalRecord {
                number,
                rows: replayer.rows().to_vec(),
            });
        }
    }
    Ok(records)
}

/// Alert state of every arm at one second.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct Flags {
    /// The detector reports every monitored channel as having a frozen baseline.
    baseline_ready: bool,
    ares_attention: bool,
    ares_alarm: bool,
    fixed_alarm: bool,
    dropout_attention: bool,
    dropout_alarm: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Arm {
    AresAttention,
    AresAlarm,
    FixedAlarm,
    DropoutAttention,
    DropoutAlarm,
}

impl Flags {
    fn get(&self, arm: Arm) -> bool {
        match arm {
            Arm::AresAttention => self.ares_attention,
            Arm::AresAlarm => self.ares_alarm,
            Arm::FixedAlarm => self.fixed_alarm,
            Arm::DropoutAttention => self.dropout_attention,
            Arm::DropoutAlarm => self.dropout_alarm,
        }
    }
}

/// Fixed-limit comparator with the same persistence as the detector alarm level.
#[derive(Debug, Clone, Default)]
struct FixedThresholdMonitor {
    runs: [u32; 3],
}

impl FixedThresholdMonitor {
    fn update(&mut self, sample: [Option<f64>; 3], persist_s: u32) -> bool {
        let out_of_limits = [
            sample[0].map(|v| !(FIXED_HR_LOW..=FIXED_HR_HIGH).contains(&v)),
            sample[1].map(|v| v < FIXED_SPO2_LOW),
            sample[2].map(|v| !(FIXED_RESP_LOW..=FIXED_RESP_HIGH).contains(&v)),
        ];
        for (run, state) in self.runs.iter_mut().zip(out_of_limits) {
            match state {
                Some(true) => *run = run.saturating_add(1),
                Some(false) => *run = 0,
                None => {} // missing sample: hold, like the detector
            }
        }
        self.runs.iter().any(|&r| r >= persist_s)
    }
}

/// First second at which the detector reported every channel armed, if ever.
fn baseline_armed_at(trace: &[Flags]) -> Option<usize> {
    trace.iter().position(|f| f.baseline_ready)
}

/// Runs both monitors over a record, optionally with one injected event.
fn run_trace(rows: &[BidmcNumericRow], injection: Option<AnomalyInjection>) -> Vec<Flags> {
    let config = VitalsAnomalyConfig::default();
    let mut detector = VitalsAnomalyDetector::new(config);
    let mut fixed = FixedThresholdMonitor::default();
    rows.iter()
        .enumerate()
        .map(|(t, recorded)| {
            let row = match injection {
                Some(inj) => inj.apply(recorded, t as f64),
                None => recorded.clone(),
            };
            let sample = [row.hr_bpm, row.spo2_pct, row.resp_brpm];
            let report = detector.update(t as f64, sample);
            let mut flags = Flags {
                baseline_ready: report.baseline_ready,
                fixed_alarm: fixed.update(sample, config.alarm_persist_s),
                ..Flags::default()
            };
            for ch in &report.channels {
                let dropout = ch.detector == Some(AnomalyDetectorKind::SensorDropout);
                let (attention, alarm) = if dropout {
                    (&mut flags.dropout_attention, &mut flags.dropout_alarm)
                } else {
                    (&mut flags.ares_attention, &mut flags.ares_alarm)
                };
                *attention |= ch.status >= AnomalyStatus::Attention;
                *alarm |= ch.status == AnomalyStatus::Alarm;
            }
            flags
        })
        .collect()
}

/// Detection delay (s) of one event for one arm, by paired comparison with the clean run.
fn detection_delay(
    clean: &[Flags],
    injected: &[Flags],
    injection: AnomalyInjection,
    arm: Arm,
) -> Option<f64> {
    let start = injection.onset_s as usize;
    let end = ((injection.onset_s + injection.kind.duration_s()) as usize).min(injected.len());
    (start..end)
        .find(|&t| injected[t].get(arm) && !clean[t].get(arm))
        .map(|t| t as f64 - injection.onset_s)
}

/// Alert episodes and alert seconds of one arm on a clean trace from `from_s` on.
fn episodes_and_alert_seconds(trace: &[Flags], arm: Arm, from_s: usize) -> (u32, u32) {
    let mut episodes = 0;
    let mut alert_seconds = 0;
    let mut last_active: Option<usize> = None;
    for (t, flags) in trace.iter().enumerate().skip(from_s) {
        if flags.get(arm) {
            alert_seconds += 1;
            if last_active.is_none_or(|prev| t - prev > EPISODE_MERGE_GAP_S) {
                episodes += 1;
            }
            last_active = Some(t);
        }
    }
    (episodes, alert_seconds)
}

/// Per-record outcome: `delays[kind][onset][arm_slot]`, plus clean-run alert counts.
#[derive(Debug, Clone)]
struct RecordOutcome {
    number: u32,
    delays: Vec<[[Option<f64>; 3]; 3]>,
    /// Second at which the personal baseline armed on the clean run (`None`: never).
    baseline_armed_s: Option<usize>,
    monitored_s: u32,
    /// (episodes, alert seconds) for ARES attention, ARES alarm, fixed alarm, dropout alarm.
    clean: [(u32, u32); 4],
    /// EWMA interval (covered, evaluated) for [HR, PULSE, RESP, SpO2] x horizon.
    coverage: [[(u32, u32); 3]; 4],
}

fn evaluate_record(record: &EvalRecord) -> RecordOutcome {
    let clean = run_trace(&record.rows, None);
    // Monitoring starts when the detector itself says the baseline is armed, which
    // a channel with missing early samples can delay past `baseline_window_s`.
    let baseline_armed_s = baseline_armed_at(&clean);
    let monitoring_from = baseline_armed_s.unwrap_or(record.rows.len());
    let delays = InjectedAnomalyKind::ALL
        .iter()
        .map(|&kind| {
            let arms = if kind == InjectedAnomalyKind::SensorDetach {
                [Arm::DropoutAttention, Arm::DropoutAlarm, Arm::DropoutAlarm]
            } else {
                [Arm::AresAttention, Arm::AresAlarm, Arm::FixedAlarm]
            };
            EVAL_ONSETS_S.map(|onset_s| {
                let injection = AnomalyInjection { kind, onset_s };
                let injected = run_trace(&record.rows, Some(injection));
                arms.map(|arm| detection_delay(&clean, &injected, injection, arm))
            })
        })
        .collect();

    let mut forecaster = EwmaResidualForecaster::default();
    for row in &record.rows {
        let channels = [row.hr_bpm, row.pulse_bpm, row.resp_brpm, row.spo2_pct];
        let mut values = [0.0; ARES_TIMESTRAL_CHANNELS];
        let mut observed_mask = 0u16;
        for (i, v) in channels.iter().enumerate() {
            if let Some(v) = v.filter(|x| x.is_finite()) {
                values[i] = v;
                observed_mask |= 1 << i;
            }
        }
        forecaster.ingest_sample_1hz(&AresMultivariateSample {
            recording_time_s: row.relative_time_s,
            values,
            observed_mask,
            sqi_score: 1.0,
        });
    }
    // Forecaster channel order is [HR, PULSE, RESP, SpO2, ...]; horizons [1, 2, 3] = [+10s, +30s, +60s].
    let coverage = [0, 1, 2, 3].map(|ch| [1, 2, 3].map(|h| forecaster.coverage_counts(ch, h)));

    RecordOutcome {
        number: record.number,
        delays,
        baseline_armed_s,
        monitored_s: record.rows.len().saturating_sub(monitoring_from) as u32,
        clean: [
            Arm::AresAttention,
            Arm::AresAlarm,
            Arm::FixedAlarm,
            Arm::DropoutAlarm,
        ]
        .map(|arm| episodes_and_alert_seconds(&clean, arm, monitoring_from)),
        coverage,
    }
}

/// SplitMix64: small deterministic generator for the bootstrap.
fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// 95% percentile interval of `numerator / denominator` under a bootstrap that
/// resamples whole records (events of one record are not independent).
fn cluster_bootstrap_ci(per_record: &[(f64, f64)]) -> Option<(f64, f64)> {
    if per_record.len() < 2 {
        return None;
    }
    let mut state = BOOTSTRAP_SEED;
    let mut ratios: Vec<f64> = (0..BOOTSTRAP_RESAMPLES)
        .filter_map(|_| {
            let (mut num, mut den) = (0.0, 0.0);
            for _ in 0..per_record.len() {
                let pick = (splitmix64(&mut state) % per_record.len() as u64) as usize;
                num += per_record[pick].0;
                den += per_record[pick].1;
            }
            (den > 0.0).then(|| num / den)
        })
        .collect();
    if ratios.is_empty() {
        return None;
    }
    ratios.sort_by(f64::total_cmp);
    let at = |q: f64| ratios[((ratios.len() - 1) as f64 * q).round() as usize];
    Some((at(0.025), at(0.975)))
}

fn percentile(values: &mut [f64], q: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    Some(values[((values.len() - 1) as f64 * q).round() as usize])
}

/// Recall, its CI and delay statistics for one arm over a set of event kinds.
#[derive(Debug, Clone, PartialEq)]
pub struct ArmSummary {
    pub events: u32,
    pub detected: u32,
    pub recall: f64,
    pub recall_ci95: Option<(f64, f64)>,
    pub median_delay_s: Option<f64>,
    pub p90_delay_s: Option<f64>,
}

fn summarize_arm(outcomes: &[RecordOutcome], kinds: &[usize], arm_slot: usize) -> ArmSummary {
    let mut per_record = Vec::with_capacity(outcomes.len());
    let mut delays = Vec::new();
    for o in outcomes {
        let (mut detected, mut events) = (0.0, 0.0);
        for &k in kinds {
            for onset in &o.delays[k] {
                events += 1.0;
                if let Some(d) = onset[arm_slot] {
                    detected += 1.0;
                    delays.push(d);
                }
            }
        }
        per_record.push((detected, events));
    }
    let events: f64 = per_record.iter().map(|p| p.1).sum();
    let detected: f64 = per_record.iter().map(|p| p.0).sum();
    ArmSummary {
        events: events as u32,
        detected: detected as u32,
        recall: if events > 0.0 { detected / events } else { 0.0 },
        recall_ci95: cluster_bootstrap_ci(&per_record),
        median_delay_s: percentile(&mut delays, 0.5),
        p90_delay_s: percentile(&mut delays, 0.9),
    }
}

/// Alert burden of one arm on the clean (un-injected) records.
#[derive(Debug, Clone, PartialEq)]
pub struct CleanSummary {
    pub episodes: u32,
    pub hours: f64,
    pub episodes_per_hour: f64,
    pub episodes_per_hour_ci95: Option<(f64, f64)>,
    pub alert_time_fraction: f64,
    pub records_with_alert: u32,
}

fn summarize_clean(outcomes: &[RecordOutcome], slot: usize) -> CleanSummary {
    let per_record: Vec<(f64, f64)> = outcomes
        .iter()
        .map(|o| (f64::from(o.clean[slot].0), f64::from(o.monitored_s) / 3600.0))
        .collect();
    let episodes: f64 = per_record.iter().map(|p| p.0).sum();
    let hours: f64 = per_record.iter().map(|p| p.1).sum();
    let alert_s: u32 = outcomes.iter().map(|o| o.clean[slot].1).sum();
    CleanSummary {
        episodes: episodes as u32,
        hours,
        episodes_per_hour: if hours > 0.0 { episodes / hours } else { 0.0 },
        episodes_per_hour_ci95: cluster_bootstrap_ci(&per_record),
        alert_time_fraction: if hours > 0.0 {
            f64::from(alert_s) / (hours * 3600.0)
        } else {
            0.0
        },
        records_with_alert: outcomes.iter().filter(|o| o.clean[slot].0 > 0).count() as u32,
    }
}

/// Aggregated results for one split.
#[derive(Debug, Clone)]
pub struct SplitReport {
    pub split: Split,
    pub record_numbers: Vec<u32>,
    /// Second at which the personal baseline armed, per record (median, max, never).
    pub baseline_armed_median_s: Option<usize>,
    pub baseline_armed_max_s: Option<usize>,
    pub records_never_armed: u32,
    /// One row per event kind: `[ARES attention, ARES alarm, fixed thresholds]`.
    pub per_kind: Vec<(InjectedAnomalyKind, [ArmSummary; 3])>,
    /// All physiological kinds pooled (sensor detach excluded).
    pub physiological: [ArmSummary; 3],
    /// Clean-record alert burden: ARES attention, ARES alarm, fixed, real dropouts.
    pub clean: [CleanSummary; 4],
    /// EWMA 90% interval coverage `[HR, PULSE, RESP, SpO2] x [10, 30, 60 s]`.
    pub ewma_coverage: [[(u32, u32); 3]; 4],
}

pub fn evaluate_split(records: &[EvalRecord], split: Split) -> SplitReport {
    let outcomes: Vec<RecordOutcome> = records
        .iter()
        .filter(|r| split_of(r.number) == split)
        .map(evaluate_record)
        .collect();
    let per_kind = InjectedAnomalyKind::ALL
        .iter()
        .enumerate()
        .map(|(k, &kind)| (kind, [0, 1, 2].map(|slot| summarize_arm(&outcomes, &[k], slot))))
        .collect();
    let physiological_kinds: Vec<usize> = InjectedAnomalyKind::ALL
        .iter()
        .enumerate()
        .filter(|(_, k)| **k != InjectedAnomalyKind::SensorDetach)
        .map(|(i, _)| i)
        .collect();
    let mut ewma_coverage = [[(0u32, 0u32); 3]; 4];
    for o in &outcomes {
        for (agg_channel, record_channel) in ewma_coverage.iter_mut().zip(&o.coverage) {
            for (agg, scored) in agg_channel.iter_mut().zip(record_channel) {
                agg.0 += scored.0;
                agg.1 += scored.1;
            }
        }
    }
    let mut armed: Vec<usize> = outcomes.iter().filter_map(|o| o.baseline_armed_s).collect();
    armed.sort_unstable();
    SplitReport {
        split,
        record_numbers: outcomes.iter().map(|o| o.number).collect(),
        baseline_armed_median_s: armed.get(armed.len() / 2).copied(),
        baseline_armed_max_s: armed.last().copied(),
        records_never_armed: (outcomes.len() - armed.len()) as u32,
        per_kind,
        physiological: [0, 1, 2].map(|slot| summarize_arm(&outcomes, &physiological_kinds, slot)),
        clean: [0, 1, 2, 3].map(|slot| summarize_clean(&outcomes, slot)),
        ewma_coverage,
    }
}

fn pct(x: f64) -> String {
    format!("{:.0}%", x * 100.0)
}

fn recall_cell(s: &ArmSummary) -> String {
    let ci = s
        .recall_ci95
        .map_or(String::new(), |(lo, hi)| format!(" [{}-{}]", pct(lo), pct(hi)));
    format!("{} ({}/{}){ci}", pct(s.recall), s.detected, s.events)
}

fn delay_cell(s: &ArmSummary) -> String {
    match (s.median_delay_s, s.p90_delay_s) {
        (Some(m), Some(p)) => format!("{m:.0} / {p:.0}"),
        _ => "n/a".to_string(),
    }
}

fn write_split(out: &mut String, report: &SplitReport) {
    let name = match report.split {
        Split::Development => "Development records",
        Split::HeldOut => "Held-out records",
    };
    let hours = report.clean[0].hours;
    let _ = writeln!(
        out,
        "## {name} (n = {}, {:.2} h monitored after baseline)\n",
        report.record_numbers.len(),
        hours
    );
    let ids: Vec<String> = report.record_numbers.iter().map(|n| format!("{n:02}")).collect();
    let _ = writeln!(out, "Records: {}.\n", ids.join(", "));
    let _ = writeln!(
        out,
        "Personal baseline armed at second {} (median) and {} (worst); {} record(s) never armed it. Monitoring and injected events are counted from each record's own arming second, and an event injected before it counts as a miss.\n",
        report.baseline_armed_median_s.map_or("n/a".to_string(), |s| s.to_string()),
        report.baseline_armed_max_s.map_or("n/a".to_string(), |s| s.to_string()),
        report.records_never_armed
    );

    let _ = writeln!(out, "### Recall and detection delay on injected events\n");
    let _ = writeln!(
        out,
        "Recall as detected/injected with 95% record-level bootstrap interval. Delay is median / 90th percentile in seconds from event onset, over detected events only.\n"
    );
    let _ = writeln!(
        out,
        "| Injected event | ARES attention: recall | delay | ARES alarm: recall | delay | Fixed thresholds: recall | delay |"
    );
    let _ = writeln!(out, "|---|---|---|---|---|---|---|");
    for (kind, arms) in &report.per_kind {
        if *kind == InjectedAnomalyKind::SensorDetach {
            continue;
        }
        let _ = writeln!(
            out,
            "| {} | {} | {} | {} | {} | {} | {} |",
            kind.description(),
            recall_cell(&arms[0]),
            delay_cell(&arms[0]),
            recall_cell(&arms[1]),
            delay_cell(&arms[1]),
            recall_cell(&arms[2]),
            delay_cell(&arms[2]),
        );
    }
    let p = &report.physiological;
    let _ = writeln!(
        out,
        "| **All physiological events** | **{}** | {} | **{}** | {} | **{}** | {} |\n",
        recall_cell(&p[0]),
        delay_cell(&p[0]),
        recall_cell(&p[1]),
        delay_cell(&p[1]),
        recall_cell(&p[2]),
        delay_cell(&p[2]),
    );

    if let Some((kind, arms)) = report
        .per_kind
        .iter()
        .find(|(k, _)| *k == InjectedAnomalyKind::SensorDetach)
    {
        let _ = writeln!(
            out,
            "Sensor detach ({}): the missing-sample rule is the same in both systems, so there is nothing to compare. Attention (5 s): {}, delay {} s. Alarm (15 s): {}, delay {} s.\n",
            kind.description(),
            recall_cell(&arms[0]),
            delay_cell(&arms[0]),
            recall_cell(&arms[1]),
            delay_cell(&arms[1]),
        );
    }

    let _ = writeln!(out, "### Alerts on the clean (un-injected) records\n");
    let _ = writeln!(
        out,
        "The records carry no clinical annotations, so these are alerts with no injected cause, not confirmed false alarms. Episodes closer than {EPISODE_MERGE_GAP_S} s are merged.\n"
    );
    let _ = writeln!(
        out,
        "| System | Episodes | Episodes per hour [95% CI] | Time in alert | Records with at least one alert |"
    );
    let _ = writeln!(out, "|---|---|---|---|---|");
    for (label, c) in [
        "ARES attention or higher",
        "ARES alarm",
        "Fixed thresholds",
        "Real sensor dropouts (>= 15 s, both systems)",
    ]
    .iter()
    .zip(&report.clean)
    {
        let ci = c
            .episodes_per_hour_ci95
            .map_or(String::new(), |(lo, hi)| format!(" [{lo:.1}-{hi:.1}]"));
        let _ = writeln!(
            out,
            "| {label} | {} | {:.1}{ci} | {:.1}% | {}/{} |",
            c.episodes,
            c.episodes_per_hour,
            c.alert_time_fraction * 100.0,
            c.records_with_alert,
            report.record_numbers.len(),
        );
    }

    let _ = writeln!(out, "\n### EWMA forecaster: empirical coverage of the nominal 90% interval\n");
    let _ = writeln!(out, "| Channel | +10 s | +30 s | +60 s |");
    let _ = writeln!(out, "|---|---|---|---|");
    for (label, row) in ["HR", "PULSE", "RESP", "SpO2"].iter().zip(&report.ewma_coverage) {
        let cell = |(hits, n): (u32, u32)| {
            if n == 0 {
                "n/a".to_string()
            } else {
                format!("{:.1}% (n = {n})", f64::from(hits) / f64::from(n) * 100.0)
            }
        };
        let _ = writeln!(out, "| {label} | {} | {} | {} |", cell(row[0]), cell(row[1]), cell(row[2]));
    }
    let _ = writeln!(out);
}

/// Compact held-out comparison at alarm level, sized for one slide.
fn write_slide_summary(out: &mut String, report: &SplitReport) {
    let ares = &report.physiological[1];
    let fixed = &report.physiological[2];
    let (ares_clean, fixed_clean) = (&report.clean[1], &report.clean[2]);
    let rate = |c: &CleanSummary| {
        let ci = c
            .episodes_per_hour_ci95
            .map_or(String::new(), |(lo, hi)| format!(" [{lo:.1}-{hi:.1}]"));
        format!("{:.1}{ci}", c.episodes_per_hour)
    };
    let delay = |s: &ArmSummary| s.median_delay_s.map_or("n/a".to_string(), |d| format!("{d:.0} s"));
    let _ = writeln!(
        out,
        "## Summary for slides: held-out records (n = {}, {} injected physiological events)\n",
        report.record_numbers.len(),
        ares.events
    );
    let _ = writeln!(out, "| Metric | ARES personal baseline (alarm level) | Fixed thresholds |");
    let _ = writeln!(out, "|---|---|---|");
    let _ = writeln!(
        out,
        "| Recall on injected events [95% CI] | {} | {} |",
        recall_cell(ares),
        recall_cell(fixed)
    );
    let _ = writeln!(
        out,
        "| Median time to detection (detected events) | {} | {} |",
        delay(ares),
        delay(fixed)
    );
    let _ = writeln!(
        out,
        "| Alert episodes per hour on un-injected data [95% CI] | {} | {} |",
        rate(ares_clean),
        rate(fixed_clean)
    );
    let _ = writeln!(
        out,
        "| Time in alert on un-injected data | {:.1}% | {:.1}% |\n",
        ares_clean.alert_time_fraction * 100.0,
        fixed_clean.alert_time_fraction * 100.0
    );
    let _ = writeln!(
        out,
        "Read with the limits at the end of this file: the events are synthetic and defined relative to each subject, and the alerts on un-injected data are not adjudicated.\n"
    );
}

/// Renders the full Markdown report (protocol, tables, limitations).
pub fn render_markdown(reports: &[SplitReport]) -> String {
    let cfg = VitalsAnomalyConfig::default();
    let mut out = String::new();
    let _ = writeln!(out, "# Vitals anomaly detector: evaluation with injected events\n");
    let _ = writeln!(
        out,
        "Generated by `cargo run -p ares-server-cli -- --mode eval-anomaly`. Do not edit by hand: re-run the command.\n"
    );
    let _ = writeln!(out, "## Protocol\n");
    let _ = writeln!(
        out,
        "- Data: PhysioNet BIDMC v1.0.0 numerics (1 Hz, 481 s per record, adult ICU patients). `data/bidmc/` holds records 01-03, `data/bidmc_eval/` records 04-53."
    );
    let _ = writeln!(
        out,
        "- Split: development = 01, 02, 04-13; held-out = 03, 14-53. Detector parameters were fixed before any held-out result was computed."
    );
    let _ = writeln!(
        out,
        "- Detector: personal baseline from the first {} s (median, MAD x 1.4826, sigma floors {:?} for HR bpm / SpO2 % / RESP brpm), then frozen. Attention: |z| >= {} for {} s, CUSUM >= {} (k = {}), or D2 >= {} for {} s. Alarm: |z| >= {} for {} s, CUSUM >= {}, or D2 >= {} for {} s. SpO2 is one-sided (low only).",
        cfg.baseline_window_s,
        cfg.sigma_floor,
        cfg.z_attention,
        cfg.attention_persist_s,
        cfg.cusum_attention,
        cfg.cusum_k,
        cfg.mahalanobis_attention_d2,
        cfg.attention_persist_s,
        cfg.z_alarm,
        cfg.alarm_persist_s,
        cfg.cusum_alarm,
        cfg.mahalanobis_alarm_d2,
        cfg.alarm_persist_s,
    );
    let _ = writeln!(
        out,
        "- Comparator: fixed limits SpO2 < {FIXED_SPO2_LOW} %, HR outside {FIXED_HR_LOW}-{FIXED_HR_HIGH} bpm, RESP outside {FIXED_RESP_LOW}-{FIXED_RESP_HIGH} brpm, sustained {} s.",
        cfg.alarm_persist_s
    );
    let _ = writeln!(
        out,
        "- Injection: one event per run, added to the recorded signal as a ramp / hold / recovery offset, at onsets {:?} s (always after the baseline window). {} event kinds x {} onsets per record.",
        EVAL_ONSETS_S,
        InjectedAnomalyKind::ALL.len(),
        EVAL_ONSETS_S.len()
    );
    let _ = writeln!(
        out,
        "- Detection: an alert that is active in the injected run and not active at the same second of the clean run of the same record, between event onset and event end."
    );
    let _ = writeln!(
        out,
        "- Attention and alarm are attributed separately, so alarm recall can exceed attention recall when a record is already at attention level on its own at the time of the event."
    );
    let _ = writeln!(
        out,
        "- EWMA forecaster: run on the clean records, one fresh forecaster per record; an interval published at t for t + h is scored when the sample at t + h arrives. Its width-adaptation step was chosen on the development records."
    );
    let _ = writeln!(
        out,
        "- Intervals: percentile bootstrap, {BOOTSTRAP_RESAMPLES} resamples of whole records, fixed seed.\n"
    );
    if let Some(held_out) = reports.iter().find(|r| r.split == Split::HeldOut) {
        write_slide_summary(&mut out, held_out);
    }
    for report in reports {
        write_split(&mut out, report);
    }
    let _ = writeln!(out, "## Limits of this evaluation\n");
    for line in [
        "The events are synthetic offsets defined relative to each record's own signal. A detector that works relative to a personal baseline is favoured by construction over absolute limits; the comparison shows how large that effect is, not that fixed limits are wrong for the cases they were designed for.",
        "No coupling between channels is simulated (a real desaturation usually changes heart and respiratory rate too), and no motion artefact is injected.",
        "BIDMC subjects are critically ill adults in intensive care, not astronauts, and each record lasts 8 minutes. Alert rates per hour are extrapolated from 6-minute monitored segments and say nothing about circadian or multi-day drift, where a frozen baseline would need scheduled re-learning.",
        "Clean-record alerts cannot be split into true and false because the dataset has no event annotations.",
        "Events of the same record are correlated; the bootstrap resamples records for that reason, but the held-out set is still only a few tens of subjects.",
        "Thresholds named after Gaussian or chi-square quantiles are nominal: 1 Hz vitals are autocorrelated and integer-quantized.",
    ] {
        let _ = writeln!(out, "- {line}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn data_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc")
    }

    #[test]
    fn paired_attribution_never_credits_alerts_already_present_in_the_clean_run() {
        let injection = AnomalyInjection {
            kind: InjectedAnomalyKind::DesaturationFast,
            onset_s: 2.0,
        };
        let on = Flags {
            ares_alarm: true,
            ..Flags::default()
        };
        let clean = vec![on; 200];
        let injected = vec![on; 200];
        assert_eq!(detection_delay(&clean, &injected, injection, Arm::AresAlarm), None);
        let mut clean_off = vec![Flags::default(); 200];
        clean_off[2] = on;
        clean_off[3] = on;
        // Seconds 2 and 3 are active in both runs; the first attributable second is 4.
        assert_eq!(
            detection_delay(&clean_off, &injected, injection, Arm::AresAlarm),
            Some(2.0)
        );
    }

    #[test]
    fn episodes_are_merged_within_the_gap_and_baseline_seconds_are_excluded() {
        let on = Flags {
            fixed_alarm: true,
            ..Flags::default()
        };
        let mut trace = vec![Flags::default(); 300];
        for t in [10, 130, 131, 150, 250] {
            trace[t] = on;
        }
        assert_eq!(episodes_and_alert_seconds(&trace, Arm::FixedAlarm, 120), (2, 4));
    }

    #[test]
    fn bundled_records_evaluate_deterministically() {
        let records = load_records(&[&data_dir()]).expect("load");
        assert_eq!(records.len(), 3);
        let a = evaluate_split(&records, Split::Development);
        let b = evaluate_split(&records, Split::Development);
        assert_eq!(a.record_numbers, vec![1, 2]);
        assert_eq!(a.physiological, b.physiological);
        assert_eq!(a.physiological[0].events, 2 * 7 * 3);
        assert!(render_markdown(&[a]).contains("## Development records (n = 2"));
    }
}
