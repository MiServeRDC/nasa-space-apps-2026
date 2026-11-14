//! Per-subject streaming anomaly detector on the recorded vitals (HR, SpO2, RESP) at 1 Hz.
//!
//! Three complementary rules run against a personal baseline learned per channel
//! with `CausalScaler` (median, MAD * 1.4826):
//! 1. sustained robust z-score (abrupt excursions),
//! 2. tabular CUSUM on the z-score (slow drifts),
//! 3. Mahalanobis distance over (HR, SpO2, RESP) (anomalous combinations),
//!
//! plus a consecutive-missing-sample rule for detached sensors. A channel that
//! does not yet have enough valid samples keeps learning instead of being
//! silently excluded, and reports `evaluable = false` until its baseline exists.
//! Every rule needs a current sample: when a signal stops, the channel and the
//! joint check become non-evaluable and their alert runs reset, so an alarm is
//! never held on evidence that is no longer being measured.
//!
//! All thresholds are nominal: 1 Hz vitals are autocorrelated and quantized, so
//! the Gaussian / chi-square levels they are named after are not calibrated
//! false-alarm rates. Measured rates are in `docs/evaluation/ANOMALY_DETECTOR_EVAL.md`.

use crate::timestral_backbone::{CausalScaler, ChannelCausalStats};
use ares_core_types::{
    AnomalyDetectorKind, AnomalyStatus, ChannelAnomalyState, VitalsAnomalyReport,
};
use std::collections::VecDeque;

/// Number of monitored channels: HR, SpO2, RESP.
pub const MONITORED_VITALS: usize = 3;
pub const HR: usize = 0;
pub const SPO2: usize = 1;
pub const RESP: usize = 2;

const CHANNEL_IDS: [&str; MONITORED_VITALS] = ["heart_rate_bpm", "spo2_pct", "resp_rate_brpm"];
const CHANNEL_LABELS: [&str; MONITORED_VITALS] = ["HR", "SpO2", "RESP"];
const CHANNEL_UNITS: [&str; MONITORED_VITALS] = ["bpm", "%", "brpm"];
pub const JOINT_CHANNEL_ID: &str = "joint_hr_spo2_resp";

/// Detector parameters. Defaults were fixed on the development records only.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VitalsAnomalyConfig {
    /// Samples a channel must have been offered before its baseline can freeze.
    pub baseline_window_s: usize,
    /// Valid samples a channel must have collected before its baseline can freeze.
    /// A channel short of them keeps learning instead of being excluded.
    pub min_baseline_observed: usize,
    /// Upper bound on the retained baseline rows per channel (bounds memory when
    /// a channel takes a long time to reach `min_baseline_observed`).
    pub max_baseline_samples: usize,
    /// Lower bound on the robust sigma per channel (bpm, %, brpm): the source is
    /// integer-quantized, so a flat baseline would otherwise give MAD = 0.
    pub sigma_floor: [f64; MONITORED_VITALS],
    pub z_attention: f64,
    pub z_alarm: f64,
    pub attention_persist_s: u32,
    pub alarm_persist_s: u32,
    /// CUSUM reference value (allowance) in sigma units.
    pub cusum_k: f64,
    pub cusum_attention: f64,
    pub cusum_alarm: f64,
    /// Squared-distance thresholds (nominal chi-square, 3 dof: 99.9% and 99.999%).
    pub mahalanobis_attention_d2: f64,
    pub mahalanobis_alarm_d2: f64,
    /// Shrinkage of the baseline correlation matrix toward identity.
    pub correlation_shrinkage: f64,
    pub dropout_attention_s: u32,
    pub dropout_alarm_s: u32,
}

impl Default for VitalsAnomalyConfig {
    fn default() -> Self {
        Self {
            baseline_window_s: 120,
            min_baseline_observed: 60,
            max_baseline_samples: 480,
            sigma_floor: [3.0, 1.0, 2.0],
            z_attention: 3.0,
            z_alarm: 4.0,
            attention_persist_s: 5,
            alarm_persist_s: 10,
            cusum_k: 1.0,
            cusum_attention: 30.0,
            cusum_alarm: 60.0,
            mahalanobis_attention_d2: 16.27,
            mahalanobis_alarm_d2: 25.90,
            correlation_shrinkage: 0.3,
            dropout_attention_s: 5,
            dropout_alarm_s: 15,
        }
    }
}

#[derive(Debug, Clone, Default)]
struct ChannelState {
    /// Baseline rows, retained (and kept index-aligned across channels) until the
    /// joint correlation has been computed.
    baseline_buf: VecDeque<Option<f64>>,
    baseline_observed: usize,
    baseline_offered: usize,
    stats: Option<ChannelCausalStats>,
    last_value: Option<f64>,
    last_z: Option<f64>,
    z_attention_run: u32,
    z_alarm_run: u32,
    cusum_pos: f64,
    cusum_neg: f64,
    cusum_pos_run: u32,
    cusum_neg_run: u32,
    missing_run: u32,
}

impl ChannelState {
    /// True once this channel has its own frozen baseline.
    #[inline]
    fn has_baseline(&self) -> bool {
        self.stats.is_some()
    }

    /// Breaks every "condition held for N consecutive seconds" counter. CUSUM
    /// accumulators survive a blip but are dropped once the gap is a real dropout.
    fn suspend(&mut self, gap_invalidates_drift: bool) {
        self.last_z = None;
        self.z_attention_run = 0;
        self.z_alarm_run = 0;
        self.cusum_pos_run = 0;
        self.cusum_neg_run = 0;
        if gap_invalidates_drift {
            self.cusum_pos = 0.0;
            self.cusum_neg = 0.0;
        }
    }
}

/// Streaming detector for one subject. Feed exactly one sample per native second.
#[derive(Debug, Clone)]
pub struct VitalsAnomalyDetector {
    config: VitalsAnomalyConfig,
    channels: [ChannelState; MONITORED_VITALS],
    samples_seen: usize,
    correlation_inverse: [[f64; 3]; 3],
    correlation_ready: bool,
    joint_attention_run: u32,
    joint_alarm_run: u32,
}

impl Default for VitalsAnomalyDetector {
    fn default() -> Self {
        Self::new(VitalsAnomalyConfig::default())
    }
}

const IDENTITY: [[f64; 3]; 3] = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];

impl VitalsAnomalyDetector {
    pub fn new(config: VitalsAnomalyConfig) -> Self {
        Self {
            config,
            channels: Default::default(),
            samples_seen: 0,
            correlation_inverse: IDENTITY,
            correlation_ready: false,
            joint_attention_run: 0,
            joint_alarm_run: 0,
        }
    }

    /// True once every channel has a frozen baseline and the joint check is armed.
    #[inline]
    pub fn baseline_ready(&self) -> bool {
        self.correlation_ready
    }

    /// Ingests one 1 Hz sample `[HR, SpO2, RESP]` and returns the per-channel status.
    pub fn update(
        &mut self,
        recording_time_s: f64,
        sample: [Option<f64>; MONITORED_VITALS],
    ) -> VitalsAnomalyReport {
        let sample = sample.map(|v| v.filter(|x| x.is_finite()));
        let cfg = self.config;
        self.samples_seen = self.samples_seen.saturating_add(1);
        let learning = !self.correlation_ready;

        for (idx, ch) in self.channels.iter_mut().enumerate() {
            let value = sample[idx];
            ch.last_value = value;
            ch.missing_run = if value.is_some() {
                0
            } else {
                ch.missing_run.saturating_add(1)
            };
            if learning {
                ch.baseline_offered = ch.baseline_offered.saturating_add(1);
                ch.baseline_buf.push_back(value);
                if value.is_some() {
                    ch.baseline_observed += 1;
                }
                if ch.baseline_buf.len() > cfg.max_baseline_samples
                    && ch.baseline_buf.pop_front().flatten().is_some()
                {
                    ch.baseline_observed -= 1;
                }
                // Per-channel freeze: a channel with too few valid samples keeps
                // learning rather than losing its baseline for the whole session.
                if !ch.has_baseline()
                    && ch.baseline_offered >= cfg.baseline_window_s
                    && ch.baseline_observed >= cfg.min_baseline_observed
                {
                    let rows: Vec<Option<f64>> = ch.baseline_buf.iter().copied().collect();
                    let (_, _, stats) = CausalScaler::new(cfg.sigma_floor[idx]).scale_patch_channel(&rows);
                    ch.stats = Some(stats);
                }
            }
        }

        if learning && self.channels.iter().all(ChannelState::has_baseline) {
            self.correlation_inverse = self.baseline_correlation_inverse();
            self.correlation_ready = true;
            for ch in &mut self.channels {
                ch.baseline_buf = VecDeque::new();
            }
        }

        self.update_statistics(sample);
        self.build_report(recording_time_s)
    }

    /// Shrunk correlation of the winsorized baseline z-scores, inverted in closed form.
    fn baseline_correlation_inverse(&self) -> [[f64; 3]; 3] {
        let (Some(s0), Some(s1), Some(s2)) = (
            self.channels[0].stats,
            self.channels[1].stats,
            self.channels[2].stats,
        ) else {
            return IDENTITY;
        };
        let stats = [s0, s1, s2];
        let mut cross = [[0.0_f64; 3]; 3];
        let mut rows = 0usize;
        for t in 0..self.channels[0].baseline_buf.len() {
            let mut z = [0.0_f64; 3];
            let mut complete = true;
            for ((zi, ch), st) in z.iter_mut().zip(&self.channels).zip(&stats) {
                match ch.baseline_buf.get(t).copied().flatten() {
                    Some(v) => *zi = ((v - st.median) / st.mad_scale).clamp(-3.0, 3.0),
                    None => complete = false,
                }
            }
            if !complete {
                continue;
            }
            rows += 1;
            for (row, zi) in cross.iter_mut().zip(z) {
                for (cell, zj) in row.iter_mut().zip(z) {
                    *cell += zi * zj;
                }
            }
        }
        if rows < self.config.min_baseline_observed {
            return IDENTITY;
        }
        let lambda = self.config.correlation_shrinkage.clamp(0.0, 1.0);
        let mut r = IDENTITY;
        for i in 0..3 {
            for j in 0..3 {
                if i != j {
                    let denom = (cross[i][i] * cross[j][j]).sqrt();
                    let rho = if denom > 0.0 { cross[i][j] / denom } else { 0.0 };
                    r[i][j] = (1.0 - lambda) * rho;
                }
            }
        }
        invert_3x3(&r).unwrap_or(IDENTITY)
    }

    fn update_statistics(&mut self, sample: [Option<f64>; MONITORED_VITALS]) {
        let cfg = self.config;
        let cusum_cap = cfg.cusum_alarm * 1.25;
        let mut z_vec = [None; MONITORED_VITALS];
        for (idx, ch) in self.channels.iter_mut().enumerate() {
            let (Some(stats), Some(value)) = (ch.stats, sample[idx]) else {
                ch.suspend(ch.missing_run >= cfg.dropout_attention_s);
                continue;
            };
            let raw_z = (value - stats.median) / stats.mad_scale;
            // SpO2 above the personal baseline is not a hazard: one-sided channel.
            let z = if idx == SPO2 { raw_z.min(0.0) } else { raw_z };
            ch.last_z = Some(z);
            z_vec[idx] = Some(z);

            ch.z_attention_run = if z.abs() >= cfg.z_attention {
                ch.z_attention_run.saturating_add(1)
            } else {
                0
            };
            ch.z_alarm_run = if z.abs() >= cfg.z_alarm {
                ch.z_alarm_run.saturating_add(1)
            } else {
                0
            };

            ch.cusum_pos = (ch.cusum_pos + z - cfg.cusum_k).clamp(0.0, cusum_cap);
            ch.cusum_neg = (ch.cusum_neg - z - cfg.cusum_k).clamp(0.0, cusum_cap);
            ch.cusum_pos_run = if ch.cusum_pos > 0.0 {
                ch.cusum_pos_run.saturating_add(1)
            } else {
                0
            };
            ch.cusum_neg_run = if ch.cusum_neg > 0.0 {
                ch.cusum_neg_run.saturating_add(1)
            } else {
                0
            };
        }

        // No current distance means no current evidence: the joint runs reset
        // instead of holding the last alarm through a signal loss.
        match self.mahalanobis_d2(z_vec) {
            Some(d) => {
                self.joint_attention_run = if d >= cfg.mahalanobis_attention_d2 {
                    self.joint_attention_run.saturating_add(1)
                } else {
                    0
                };
                self.joint_alarm_run = if d >= cfg.mahalanobis_alarm_d2 {
                    self.joint_alarm_run.saturating_add(1)
                } else {
                    0
                };
            }
            None => {
                self.joint_attention_run = 0;
                self.joint_alarm_run = 0;
            }
        }
    }

    /// Squared Mahalanobis distance, or `None` when the joint check cannot be
    /// evaluated right now (baseline not armed, or any channel without a sample).
    fn mahalanobis_d2(&self, z: [Option<f64>; MONITORED_VITALS]) -> Option<f64> {
        if !self.correlation_ready {
            return None;
        }
        let z = [z[0]?, z[1]?, z[2]?];
        let inv = &self.correlation_inverse;
        let mut d2 = 0.0;
        for (row, zi) in inv.iter().zip(z) {
            for (cell, zj) in row.iter().zip(z) {
                d2 += zi * cell * zj;
            }
        }
        Some(d2.max(0.0))
    }

    fn build_report(&self, recording_time_s: f64) -> VitalsAnomalyReport {
        let cfg = &self.config;
        let mut channels: Vec<ChannelAnomalyState> =
            (0..MONITORED_VITALS).map(|idx| self.channel_state(idx)).collect();

        let d2 = self.mahalanobis_d2([
            self.channels[0].last_z,
            self.channels[1].last_z,
            self.channels[2].last_z,
        ]);
        channels.push(self.joint_state(d2));

        let overall = channels
            .iter()
            .map(|c| c.status)
            .max()
            .unwrap_or(AnomalyStatus::Normal);
        VitalsAnomalyReport {
            recording_time_s,
            baseline_ready: self.baseline_ready(),
            baseline_samples: self.samples_seen.min(cfg.baseline_window_s) as u32,
            baseline_required: cfg.baseline_window_s as u32,
            overall,
            mahalanobis_d2: d2,
            channels,
        }
    }

    fn channel_state(&self, idx: usize) -> ChannelAnomalyState {
        let cfg = &self.config;
        let ch = &self.channels[idx];
        let label = CHANNEL_LABELS[idx];
        let unit = CHANNEL_UNITS[idx];
        // Physiological rules need both a baseline and a current sample. Sensor
        // dropout is reported independently of this flag.
        let evaluable = ch.has_baseline() && ch.last_value.is_some();

        let mut status = AnomalyStatus::Normal;
        let mut detector = None;
        let mut duration_s = 0.0;
        let mut reason = if !ch.has_baseline() {
            format!(
                "{label} learning personal baseline ({}/{} valid samples over {} s)",
                ch.baseline_observed, cfg.min_baseline_observed, ch.baseline_offered
            )
        } else if ch.last_value.is_none() {
            format!("{label} has no current sample: physiological checks paused")
        } else {
            format!("{label} within personal baseline")
        };

        // Candidates in tie-break priority order: dropout, z-score, CUSUM.
        let dropout = level(ch.missing_run, cfg.dropout_attention_s, cfg.dropout_alarm_s);
        if dropout > status {
            status = dropout;
            detector = Some(AnomalyDetectorKind::SensorDropout);
            duration_s = f64::from(ch.missing_run);
            reason = format!("{label} sensor signal missing for {} s", ch.missing_run);
        }

        if let (Some(stats), Some(z)) = (ch.stats, ch.last_z) {
            let z_status = if ch.z_alarm_run >= cfg.alarm_persist_s {
                AnomalyStatus::Alarm
            } else if ch.z_attention_run >= cfg.attention_persist_s {
                AnomalyStatus::Attention
            } else {
                AnomalyStatus::Normal
            };
            if z_status > status {
                status = z_status;
                detector = Some(AnomalyDetectorKind::RobustZScore);
                duration_s = f64::from(ch.z_attention_run);
                reason = format!(
                    "{label} {z:+.1} sigma vs personal baseline ({:.0} {unit}) for {} s",
                    stats.median, ch.z_attention_run
                );
            }

            let (cusum, run, direction) = if ch.cusum_pos >= ch.cusum_neg {
                (ch.cusum_pos, ch.cusum_pos_run, "up")
            } else {
                (ch.cusum_neg, ch.cusum_neg_run, "down")
            };
            let cusum_status = if cusum >= cfg.cusum_alarm {
                AnomalyStatus::Alarm
            } else if cusum >= cfg.cusum_attention {
                AnomalyStatus::Attention
            } else {
                AnomalyStatus::Normal
            };
            if cusum_status > status {
                status = cusum_status;
                detector = Some(AnomalyDetectorKind::CusumDrift);
                duration_s = f64::from(run);
                reason = format!(
                    "{label} drifting {direction} for {run} s (CUSUM {cusum:.0}, now {z:+.1} sigma vs baseline {:.0} {unit})",
                    stats.median
                );
            }
        }

        ChannelAnomalyState {
            channel: CHANNEL_IDS[idx].to_string(),
            status,
            evaluable,
            detector,
            value: ch.last_value,
            baseline_median: ch.stats.map(|s| s.median),
            baseline_sigma: ch.stats.map(|s| s.mad_scale),
            z_score: ch.last_z,
            duration_s,
            reason,
        }
    }

    fn joint_state(&self, d2: Option<f64>) -> ChannelAnomalyState {
        let cfg = &self.config;
        // The runs only advance while `d2` is available, so a reported status
        // always refers to a distance measured on the current sample.
        let status = if self.joint_alarm_run >= cfg.alarm_persist_s {
            AnomalyStatus::Alarm
        } else if self.joint_attention_run >= cfg.attention_persist_s {
            AnomalyStatus::Attention
        } else {
            AnomalyStatus::Normal
        };
        let z = |i: usize| self.channels[i].last_z.unwrap_or(0.0);
        let reason = match (status, d2) {
            (AnomalyStatus::Normal, Some(_)) => "combination within personal baseline".to_string(),
            (AnomalyStatus::Normal, None) => {
                let blocked: Vec<&str> = (0..MONITORED_VITALS)
                    .filter(|&i| self.channels[i].last_z.is_none())
                    .map(|i| CHANNEL_LABELS[i])
                    .collect();
                if blocked.is_empty() {
                    "joint check unavailable: personal baseline not armed".to_string()
                } else {
                    format!(
                        "joint check unavailable: {} not currently assessable",
                        blocked.join(", ")
                    )
                }
            }
            (_, d) => format!(
                "anomalous combination HR {:+.1}, SpO2 {:+.1}, RESP {:+.1} sigma (D2 {:.1} >= {:.1}) for {} s",
                z(HR),
                z(SPO2),
                z(RESP),
                d.unwrap_or_default(),
                cfg.mahalanobis_attention_d2,
                self.joint_attention_run
            ),
        };
        ChannelAnomalyState {
            channel: JOINT_CHANNEL_ID.to_string(),
            status,
            evaluable: d2.is_some(),
            detector: (status != AnomalyStatus::Normal).then_some(AnomalyDetectorKind::Mahalanobis),
            value: None,
            baseline_median: None,
            baseline_sigma: None,
            z_score: None,
            duration_s: f64::from(self.joint_attention_run),
            reason,
        }
    }
}

#[inline]
fn level(run: u32, attention: u32, alarm: u32) -> AnomalyStatus {
    if run >= alarm {
        AnomalyStatus::Alarm
    } else if run >= attention {
        AnomalyStatus::Attention
    } else {
        AnomalyStatus::Normal
    }
}

fn invert_3x3(m: &[[f64; 3]; 3]) -> Option<[[f64; 3]; 3]> {
    let c = |r1: usize, c1: usize, r2: usize, c2: usize| m[r1][c1] * m[r2][c2] - m[r1][c2] * m[r2][c1];
    let cof = [
        [c(1, 1, 2, 2), -c(1, 0, 2, 2), c(1, 0, 2, 1)],
        [-c(0, 1, 2, 2), c(0, 0, 2, 2), -c(0, 0, 2, 1)],
        [c(0, 1, 1, 2), -c(0, 0, 1, 2), c(0, 0, 1, 1)],
    ];
    let det = m[0][0] * cof[0][0] + m[0][1] * cof[0][1] + m[0][2] * cof[0][2];
    if !det.is_finite() || det.abs() < 1e-9 {
        return None;
    }
    let mut inv = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            inv[i][j] = cof[j][i] / det;
        }
    }
    Some(inv)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Deterministic baseline with small integer wander around (80, 97, 16).
    fn baseline_sample(t: usize) -> [Option<f64>; 3] {
        let w = [0.0, 1.0, 0.0, -1.0][t % 4];
        let v = [0.0, 0.0, 1.0, 0.0, 0.0, -1.0][t % 6];
        [Some(80.0 + w), Some(97.0), Some(16.0 + v)]
    }

    fn warmed_up() -> VitalsAnomalyDetector {
        let mut det = VitalsAnomalyDetector::default();
        for t in 0..120 {
            let report = det.update(t as f64, baseline_sample(t));
            assert_eq!(report.overall, AnomalyStatus::Normal);
        }
        assert!(det.baseline_ready());
        det
    }

    #[test]
    fn stays_normal_on_stationary_signal_and_reports_baseline_progress() {
        let mut det = VitalsAnomalyDetector::default();
        let early = det.update(0.0, baseline_sample(0));
        assert!(!early.baseline_ready);
        assert_eq!(early.baseline_samples, 1);
        assert!(early.channels.iter().all(|c| !c.evaluable));
        let mut det = warmed_up();
        for t in 120..600 {
            let report = det.update(t as f64, baseline_sample(t));
            assert_eq!(report.overall, AnomalyStatus::Normal, "t={t}");
            assert!(report.channels.iter().all(|c| c.evaluable));
        }
    }

    #[test]
    fn abrupt_desaturation_escalates_to_alarm_with_readable_reason() {
        let mut det = warmed_up();
        let mut first_attention = None;
        let mut first_alarm = None;
        for t in 120..180 {
            let mut s = baseline_sample(t);
            s[SPO2] = Some(92.0);
            let report = det.update(t as f64, s);
            let spo2 = &report.channels[SPO2];
            if spo2.status >= AnomalyStatus::Attention && first_attention.is_none() {
                first_attention = Some(t - 120);
            }
            if spo2.status == AnomalyStatus::Alarm && first_alarm.is_none() {
                first_alarm = Some(t - 120);
                assert!(spo2.reason.starts_with("SpO2 -5.0 sigma vs personal baseline (97 %)"));
            }
        }
        assert_eq!(first_attention, Some(4));
        assert_eq!(first_alarm, Some(9));
    }

    #[test]
    fn slow_drift_is_caught_by_cusum_before_the_z_rule() {
        let mut det = warmed_up();
        let mut cusum_first = None;
        for t in 120..300 {
            let mut s = baseline_sample(t);
            // +7.5 bpm over 180 s: reaches only +2.5 sigma, below the z-score rule.
            s[HR] = s[HR].map(|v| v + (t - 120) as f64 / 24.0);
            let report = det.update(t as f64, s);
            let hr = &report.channels[HR];
            if hr.status >= AnomalyStatus::Attention && cusum_first.is_none() {
                assert_eq!(hr.detector, Some(AnomalyDetectorKind::CusumDrift));
                cusum_first = Some(t - 120);
            }
        }
        // z = t/72 exceeds k = 1 at t = 72 s; the sum (t-72)^2/144 reaches 30 at about 138 s,
        // when the signal is still below +2 sigma.
        assert!(cusum_first.is_some_and(|t| (130..145).contains(&t)), "{cusum_first:?}");
    }

    #[test]
    fn subthreshold_combination_is_flagged_only_by_mahalanobis() {
        let mut det = warmed_up();
        let mut last = None;
        for t in 120..140 {
            // Each channel at about 2.5-2.9 sigma: none reaches the z-score rule alone.
            let report = det.update(t as f64, [Some(88.0), Some(94.5), Some(21.0)]);
            last = Some(report);
        }
        let report = last.unwrap();
        for idx in [HR, SPO2, RESP] {
            assert_ne!(report.channels[idx].detector, Some(AnomalyDetectorKind::RobustZScore));
        }
        let joint = &report.channels[3];
        assert_eq!(joint.detector, Some(AnomalyDetectorKind::Mahalanobis));
        assert!(joint.status >= AnomalyStatus::Attention);
        assert!(report.mahalanobis_d2.is_some_and(|d| d >= 16.27));
    }

    #[test]
    fn sensor_dropout_is_reported_even_during_baseline_learning() {
        let mut det = VitalsAnomalyDetector::default();
        let mut report = det.update(0.0, baseline_sample(0));
        for t in 1..=15 {
            let mut s = baseline_sample(t);
            s[SPO2] = None;
            report = det.update(t as f64, s);
        }
        let spo2 = &report.channels[SPO2];
        assert_eq!(spo2.status, AnomalyStatus::Alarm);
        assert_eq!(spo2.detector, Some(AnomalyDetectorKind::SensorDropout));
        assert_eq!(spo2.reason, "SpO2 sensor signal missing for 15 s");
        assert_eq!(report.dominant().map(|c| c.channel.as_str()), Some("spo2_pct"));
    }

    #[test]
    fn spo2_above_baseline_never_alerts() {
        let mut det = VitalsAnomalyDetector::default();
        for t in 0..120 {
            det.update(t as f64, [Some(80.0), Some(93.0), Some(16.0)]);
        }
        for t in 120..300 {
            let report = det.update(t as f64, [Some(80.0), Some(100.0), Some(16.0)]);
            assert_eq!(report.overall, AnomalyStatus::Normal);
        }
    }

    /// Review finding 1: a channel whose early samples are missing must keep
    /// learning, must say it is not evaluable meanwhile, and must detect later.
    #[test]
    fn channel_missing_at_startup_keeps_learning_and_still_detects_afterwards() {
        let mut det = VitalsAnomalyDetector::default();
        for t in 0..80 {
            let mut s = baseline_sample(t);
            s[SPO2] = None;
            det.update(t as f64, s);
        }
        let report = det.update(80.0, baseline_sample(80));
        assert!(!report.channels[SPO2].evaluable);
        assert!(
            report.channels[SPO2].reason.contains("learning personal baseline"),
            "{}",
            report.channels[SPO2].reason
        );

        let mut ready_at = None;
        for t in 81..400 {
            let report = det.update(t as f64, baseline_sample(t));
            if report.baseline_ready && ready_at.is_none() {
                ready_at = Some(t);
            }
        }
        // HR and RESP froze at t = 120; SpO2 reaches its 60th valid sample at t = 139.
        assert_eq!(ready_at, Some(139));

        let mut alarm_at = None;
        for t in 400..460 {
            let mut s = baseline_sample(t);
            s[SPO2] = Some(70.0);
            let report = det.update(t as f64, s);
            if report.channels[SPO2].status == AnomalyStatus::Alarm && alarm_at.is_none() {
                alarm_at = Some(t - 400);
            }
        }
        // SpO2 at 70 % is about -27 sigma, so CUSUM reaches the alarm level first.
        assert!(
            alarm_at.is_some_and(|t| t <= 10),
            "late desaturation must still raise an alarm, got {alarm_at:?}"
        );
    }

    /// Review finding 2: an alarm must not survive the loss of the signals that
    /// produced it, and no reason may print a NaN distance.
    #[test]
    fn alarms_clear_when_the_signals_stop_instead_of_being_held() {
        let mut det = warmed_up();
        let mut report = det.update(120.0, [Some(88.0), Some(94.5), Some(21.0)]);
        for t in 121..145 {
            report = det.update(t as f64, [Some(88.0), Some(94.5), Some(21.0)]);
        }
        assert!(report.channels[3].status >= AnomalyStatus::Attention);
        assert!(report.channels[3].evaluable);

        for t in 145..175 {
            report = det.update(t as f64, [None, None, None]);
        }
        let joint = &report.channels[3];
        assert_eq!(joint.status, AnomalyStatus::Normal);
        assert!(!joint.evaluable);
        assert!(!joint.reason.contains("NaN"), "{}", joint.reason);
        assert!(joint.reason.contains("not currently assessable"), "{}", joint.reason);
        assert!(report.mahalanobis_d2.is_none());
        // Only the sensor loss remains, so the dropout rule drives the response.
        assert_eq!(
            report.dominant().map(|c| c.detector),
            Some(Some(AnomalyDetectorKind::SensorDropout))
        );
        for idx in [HR, SPO2, RESP] {
            assert!(!report.channels[idx].evaluable);
            assert_eq!(report.channels[idx].detector, Some(AnomalyDetectorKind::SensorDropout));
        }
    }

    /// A gap must also break the persistence counters, so one bad sample after a
    /// blackout cannot complete a run started before it.
    #[test]
    fn persistence_counters_restart_after_a_gap() {
        let mut det = warmed_up();
        for t in 120..129 {
            let mut s = baseline_sample(t);
            s[SPO2] = Some(92.0);
            det.update(t as f64, s);
        }
        for t in 129..160 {
            let mut s = baseline_sample(t);
            s[SPO2] = None;
            det.update(t as f64, s);
        }
        let mut s = baseline_sample(160);
        s[SPO2] = Some(92.0);
        let report = det.update(160.0, s);
        assert_eq!(report.channels[SPO2].status, AnomalyStatus::Normal);
        assert_eq!(report.channels[SPO2].z_score, Some(-5.0));
    }
}
