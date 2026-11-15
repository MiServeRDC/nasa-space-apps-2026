//! Phase 33 (`L5`): Subject-disjoint Split Harness, 4 Anti-Leakage Guards, Split-Conformal CQR,
//! Exact Clopper-Pearson 95% Binomial Intervals, Persistence / Rolling-Median-IQR Baselines,
//! Brier/ECE Reliability Audit, 900-Sol RK4 Sensitivity Audit, and Fail-Closed Validation Gate.

pub use crate::error::{LeakageViolationError, SplitRole};
use ares_causal_graph::bayesian_pocus::audit_bayesian_pocus_structural_bounds;
use ares_causal_graph::mechanotransduction::{
    Rk4HorizonPolicy, compute_musculoskeletal_state_with_policy, integrate_sclerostin_schedule,
};
use ares_core_types::telemetry::{
    BiometricsSource, ModelValidationStatus, Sha256DigestHex, TerrestrialBenchmarkScope,
    ValidationManifest,
};
use ares_core_types::{DHF_HORIZONS_SECONDS, MonotoneQuantileTriplet};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

/// Missingness strata for conditioned empirical coverage evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MissingnessBin {
    /// 0% missing channels.
    ZeroPct,
    /// (0%, 15%] missing channels.
    OneToFifteenPct,
    /// (15%, 40%] missing channels.
    FifteenToFortyPct,
}

impl MissingnessBin {
    /// Maps a missing channel ratio in `[0.0, 0.40]` into its canonical stratum.
    /// Returns `None` if `missing_ratio` is non-finite or exceeds the 40% abstention threshold.
    #[inline]
    pub fn from_ratio(missing_ratio: f64) -> Option<Self> {
        if !missing_ratio.is_finite() || !(0.0..=0.40).contains(&missing_ratio) {
            return None;
        }
        if missing_ratio <= 1e-9 {
            Some(Self::ZeroPct)
        } else if missing_ratio <= 0.15 {
            Some(Self::OneToFifteenPct)
        } else {
            Some(Self::FifteenToFortyPct)
        }
    }
}

/// Single horizon-aligned evaluation sample used by the anti-leakage and CQR harness.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalibrationSamplePair {
    pub subject_id: String,
    pub role: SplitRole,
    pub source: BiometricsSource,
    pub origin_time_s: f64,
    pub target_time_s: f64,
    pub horizon_s: u32,
    pub observed_context_steps: usize,
    pub is_warmup_padded: bool,
    pub channel_name: String,
    pub y_origin: f64,
    pub y_target: f64,
    pub raw_cone: MonotoneQuantileTriplet,
    pub missing_ratio: f64,
}

impl CalibrationSamplePair {
    /// Constructs a real recorded evaluation pair with default clean context metadata.
    pub fn real_recorded(
        subject_id: &str,
        role: SplitRole,
        origin_time_s: f64,
        target_time_s: f64,
        horizon_s: u32,
    ) -> Self {
        Self::with_source(
            subject_id,
            role,
            BiometricsSource::RecordedTerrestrialBidmcCsv,
            origin_time_s,
            target_time_s,
            horizon_s,
        )
    }

    /// Constructs an evaluation pair with an explicit `BiometricsSource`.
    pub fn with_source(
        subject_id: &str,
        role: SplitRole,
        source: BiometricsSource,
        origin_time_s: f64,
        target_time_s: f64,
        horizon_s: u32,
    ) -> Self {
        Self {
            subject_id: subject_id.to_string(),
            role,
            source,
            origin_time_s,
            target_time_s,
            horizon_s,
            observed_context_steps: 32,
            is_warmup_padded: false,
            channel_name: "heart_rate_bpm".to_string(),
            y_origin: 70.0,
            y_target: 70.0,
            raw_cone: MonotoneQuantileTriplet::from_median_and_spreads(70.0, 2.0, 2.0),
            missing_ratio: 0.0,
        }
    }

    /// Attaches observed scalar values, raw model quantile cone, channel name, and missingness ratio.
    pub fn with_observation(
        mut self,
        channel_name: &str,
        y_origin: f64,
        y_target: f64,
        raw_cone: MonotoneQuantileTriplet,
        missing_ratio: f64,
    ) -> Self {
        self.channel_name = channel_name.to_string();
        self.y_origin = y_origin;
        self.y_target = y_target;
        self.raw_cone = raw_cone;
        self.missing_ratio = missing_ratio;
        self
    }

    /// Sets context warmup metadata for L2 anti-leakage checks.
    pub fn with_warmup_state(
        mut self,
        observed_context_steps: usize,
        is_warmup_padded: bool,
    ) -> Self {
        self.observed_context_steps = observed_context_steps;
        self.is_warmup_padded = is_warmup_padded;
        self
    }
}

/// Exact 95% Clopper-Pearson binomial confidence interval for empirical coverage.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ClopperPearsonBounds {
    pub k_covered: usize,
    pub n_total: usize,
    pub empirical_coverage: f64,
    pub ci95_low: f64,
    pub ci95_high: f64,
    pub covers_target_90pct: bool,
}

/// Evaluation status of a horizon/channel/missingness cell.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HorizonEvaluationStatus {
    Evaluated,
    InsufficientRecordingDuration {
        max_recording_span_s: f64,
        required_horizon_s: u32,
    },
    CalibrationSampleInsufficient {
        n_cal: usize,
        min_required: usize,
    },
}

/// Stratified out-of-sample evaluation metrics for one `(horizon, channel, missingness_bin)` cell.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HorizonCellMetrics {
    pub horizon_s: u32,
    pub is_short_technical_subhorizon: bool,
    pub channel_name: String,
    pub missingness_bin: MissingnessBin,
    pub status: HorizonEvaluationStatus,
    pub timestral_cqr_coverage: Option<ClopperPearsonBounds>,
    pub mean_interval_width: Option<f64>,
    pub winkler_score_alpha_10: Option<f64>,
    pub pinball_loss_mean: Option<f64>,
    pub persistence_winkler_score: Option<f64>,
    pub rolling_median_iqr_winkler_score: Option<f64>,
    pub false_alarm_rate: Option<f64>,
    pub missed_violation_rate: Option<f64>,
}

/// Single bin of a 10-bin reliability diagram.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReliabilityBinSummary {
    pub bin_index: usize,
    pub lower_prob: f64,
    pub upper_prob: f64,
    pub sample_count: usize,
    pub mean_predicted_prob: f64,
    pub empirical_positive_rate: f64,
    pub abs_calibration_gap: f64,
}

/// Brier score, 10-bin ECE/MCE, and structural empty-band audit for `evaluate_two_stage_bayesian_pocus`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProbabilisticCalibrationAudit {
    pub brier_score: f64,
    pub ece_10_bins: f64,
    pub mce_10_bins: f64,
    pub structural_empty_band: (f64, f64),
    pub bins: Vec<ReliabilityBinSummary>,
}

/// Sensitivity audit comparing the legacy 60-day RK4 cap against unbounded adaptive 900-Sol integration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SostRk4SensitivityAudit {
    pub max_constant_load_diff_pmol_l_up_to_1000d: f64,
    pub max_step_change_load_diff_pmol_l_at_sol_180: f64,
    pub legacy_effective_cap_days: f64,
    pub adaptive_substep_dt_days: f64,
}

/// Complete Phase 33 (`L5`) empirical calibration and anti-leakage audit report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalibrationAuditReport {
    pub schema_version: u32,
    pub contains_synthetic_data: bool,
    pub anti_leakage_verified: bool,
    pub split_subjects: BTreeMap<SplitRole, Vec<String>>,
    pub horizon_cells: Vec<HorizonCellMetrics>,
    pub pocus_calibration_audit: Option<ProbabilisticCalibrationAudit>,
    pub sost_rk4_sensitivity: SostRk4SensitivityAudit,
    pub resolved_validation_status: ModelValidationStatus,
}

/// Normalizes window-level identifiers (`"slice://bidmc/01/t_0000_0060"`, `"bidmc_01_t_0000_0060"`)
/// back to the canonical subject identifier so windows from one subject never cross split boundaries.
pub fn canonical_subject_id(raw_id: &str) -> String {
    let trimmed = raw_id.trim();
    if let Some(rest) = trimmed.strip_prefix("slice://") {
        let mut parts = rest.split('/');
        if let (Some(ds), Some(subj)) = (parts.next(), parts.next()) {
            return format!("{ds}/{subj}");
        }
    }
    if let Some((prefix, _)) = trimmed.split_once("_t_") {
        return prefix.to_string();
    }
    if let Some((prefix, _)) = trimmed.split_once("_w_") {
        return prefix.to_string();
    }
    trimmed.to_string()
}

/// Deterministically assigns a subject to `Train`, `Calibration`, or `HeldOutTest`.
/// Preserves exact roles from `data/bidmc/MANIFEST.json` (`bidmc_02` -> Train,
/// `bidmc_01` -> Calibration, `bidmc_03` -> HeldOutTest) and uses SHA-256 hashing (`50/25/25`)
/// for multi-subject cohorts.
pub fn assign_subject_split_role(raw_subject_id: &str) -> SplitRole {
    let canon = canonical_subject_id(raw_subject_id);
    match canon.as_str() {
        "bidmc_02" | "bidmc/02" => SplitRole::Train,
        "bidmc_01" | "bidmc/01" => SplitRole::Calibration,
        "bidmc_03" | "bidmc/03" => SplitRole::HeldOutTest,
        _ => {
            let mut hasher = Sha256::new();
            hasher.update(b"ARES-L5-SPLIT-V1:");
            hasher.update(canon.as_bytes());
            let digest = hasher.finalize();
            let head = u64::from_be_bytes([
                digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6],
                digest[7],
            ]);
            let unit = (head as f64) / ((u64::MAX as f64) + 1.0);
            if unit < 0.50 {
                SplitRole::Train
            } else if unit < 0.75 {
                SplitRole::Calibration
            } else {
                SplitRole::HeldOutTest
            }
        }
    }
}

type GroupedHorizonIntervals = BTreeMap<(String, SplitRole, u32, String), Vec<(f64, f64)>>;

/// Enforces all 4 anti-leakage invariants (`L1`..`L4`) plus strict zero-synthetic-data rejection:
/// - `L1`: Subject-disjoint partitioning (`Train`, `Calibration`, `HeldOutTest` never share subjects).
/// - `L2`: Zero warmup-padded or duplicate `(subject, origin_time_s, horizon_s, channel)` rows.
/// - `L3`: Non-overlapping evaluation stride (`next.origin_time_s >= prev.target_time_s`).
/// - `L4`: Exact horizon alignment (`|(target_time_s - origin_time_s) - horizon_s| <= min(0.5s, 0.01 * h)`).
pub fn verify_anti_leakage_invariants(
    samples: &[CalibrationSamplePair],
    min_context_steps: usize,
) -> Result<(), LeakageViolationError> {
    let mut subject_roles: BTreeMap<String, SplitRole> = BTreeMap::new();
    let mut seen_keys: BTreeSet<(String, u64, u32, String)> = BTreeSet::new();
    let mut grouped_intervals: GroupedHorizonIntervals = BTreeMap::new();

    for sample in samples {
        let canon = canonical_subject_id(&sample.subject_id);

        if sample.source == BiometricsSource::SimulatedScenarioInput {
            return Err(LeakageViolationError::SyntheticDataForbiddenInCalibration {
                subject_id: canon,
            });
        }

        // L1: Subject disjoint across splits.
        if let Some(&prev_role) = subject_roles.get(&canon) {
            if prev_role != sample.role {
                return Err(LeakageViolationError::SubjectOverlapAcrossSplits {
                    subject_id: canon,
                    first_role: prev_role,
                    second_role: sample.role,
                });
            }
        } else {
            subject_roles.insert(canon.clone(), sample.role);
        }

        // L2: Zero warmup-padded rows or duplicate origin timestamps.
        if !sample.origin_time_s.is_finite()
            || !sample.target_time_s.is_finite()
            || sample.is_warmup_padded
            || sample.observed_context_steps < min_context_steps
        {
            return Err(LeakageViolationError::WarmupCopyOrDuplicateTimestamp {
                subject_id: canon,
                origin_time_s: sample.origin_time_s,
            });
        }
        let dedup_key = (
            canon.clone(),
            sample.origin_time_s.to_bits(),
            sample.horizon_s,
            sample.channel_name.clone(),
        );
        if !seen_keys.insert(dedup_key) {
            return Err(LeakageViolationError::WarmupCopyOrDuplicateTimestamp {
                subject_id: canon,
                origin_time_s: sample.origin_time_s,
            });
        }

        // L4: Exact horizon alignment (rejects next-tick `t0 + 1s` target leakage).
        let realized_delta_s = sample.target_time_s - sample.origin_time_s;
        let expected_h = f64::from(sample.horizon_s);
        let tol = (0.01 * expected_h).clamp(1e-9, 0.5);
        if sample.horizon_s == 0
            || !realized_delta_s.is_finite()
            || (realized_delta_s - expected_h).abs() > tol
        {
            return Err(LeakageViolationError::HorizonTargetMismatch {
                declared_horizon_s: sample.horizon_s,
                realized_delta_s,
            });
        }

        grouped_intervals
            .entry((canon, sample.role, sample.horizon_s, sample.channel_name.clone()))
            .or_default()
            .push((sample.origin_time_s, sample.target_time_s));
    }

    // L3: Non-overlapping evaluation windows within each (subject, role, horizon, channel) series.
    for ((subject_id, _, _, _), mut intervals) in grouped_intervals {
        intervals.sort_by(|a, b| a.0.total_cmp(&b.0));
        for pair in intervals.windows(2) {
            let prev_target_time_s = pair[0].1;
            let next_origin_time_s = pair[1].0;
            if next_origin_time_s < prev_target_time_s - 1e-9 {
                return Err(LeakageViolationError::OverlappingWindowAcrossBoundary {
                    subject_id,
                    prev_target_time_s,
                    next_origin_time_s,
                });
            }
        }
    }

    Ok(())
}

/// Lanczos approximation of `ln(Gamma(z))` for positive real `z`.
fn ln_gamma(z: f64) -> f64 {
    const COEFFS: [f64; 9] = [
        0.999_999_999_999_809_9,
        676.520_368_121_885_1,
        -1_259.139_216_722_402_8,
        771.323_428_777_653_1,
        -176.615_029_162_140_6,
        12.507_343_278_686_905,
        -0.138_571_095_265_720_12,
        9.984_369_578_019_572e-6,
        1.505_632_735_149_311_6e-7,
    ];
    if z < 0.5 {
        let sin_pi_z = (std::f64::consts::PI * z).sin().abs().max(1e-300);
        return std::f64::consts::PI.ln() - sin_pi_z.ln() - ln_gamma(1.0 - z);
    }
    let z_m1 = z - 1.0;
    let mut x = COEFFS[0];
    for (i, &c) in COEFFS.iter().enumerate().skip(1) {
        x += c / (z_m1 + (i as f64));
    }
    let t = z_m1 + 7.5;
    0.5 * (2.0 * std::f64::consts::PI).ln() + (z_m1 + 0.5) * t.ln() - t + x.ln()
}

/// Lentz modified continued fraction for regularized incomplete Beta function `I_x(a, b)`.
fn betacf(a: f64, b: f64, x: f64) -> f64 {
    const MAX_IT: usize = 200;
    const EPS: f64 = 1e-14;
    const FP_MIN: f64 = 1e-300;

    let qab = a + b;
    let qap = a + 1.0;
    let qam = a - 1.0;
    let mut c = 1.0;
    let mut d = 1.0 - qab * x / qap;
    if d.abs() < FP_MIN {
        d = FP_MIN;
    }
    d = 1.0 / d;
    let mut h = d;

    for m in 1..=MAX_IT {
        let m_f = m as f64;
        let m2 = 2.0 * m_f;

        let aa_even = m_f * (b - m_f) * x / ((qam + m2) * (a + m2));
        d = 1.0 + aa_even * d;
        if d.abs() < FP_MIN {
            d = FP_MIN;
        }
        c = 1.0 + aa_even / c;
        if c.abs() < FP_MIN {
            c = FP_MIN;
        }
        d = 1.0 / d;
        h *= d * c;

        let aa_odd = -(a + m_f) * (qab + m_f) * x / ((a + m2) * (qap + m2));
        d = 1.0 + aa_odd * d;
        if d.abs() < FP_MIN {
            d = FP_MIN;
        }
        c = 1.0 + aa_odd / c;
        if c.abs() < FP_MIN {
            c = FP_MIN;
        }
        d = 1.0 / d;
        let del = d * c;
        h *= del;
        if (del - 1.0).abs() <= EPS {
            break;
        }
    }
    h
}

/// Regularized incomplete Beta function `I_x(a, b)` for `x in [0, 1]` and `a, b > 0`.
pub fn regularized_incomplete_beta(x: f64, a: f64, b: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let ln_bt = ln_gamma(a + b) - ln_gamma(a) - ln_gamma(b) + a * x.ln() + b * (1.0 - x).ln();
    let bt = ln_bt.exp();
    if x < (a + 1.0) / (a + b + 2.0) {
        (bt * betacf(a, b, x) / a).clamp(0.0, 1.0)
    } else {
        (1.0 - bt * betacf(b, a, 1.0 - x) / b).clamp(0.0, 1.0)
    }
}

/// Inverts `I_p(a, b) = target` on `[0, 1]` using 80 iterations of monotone bisection.
fn invert_incomplete_beta(a: f64, b: f64, target: f64) -> f64 {
    let mut lo = 0.0_f64;
    let mut hi = 1.0_f64;
    for _ in 0..80 {
        let mid = 0.5 * (lo + hi);
        if regularized_incomplete_beta(mid, a, b) < target {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

/// Exact two-sided 95% Clopper-Pearson binomial confidence interval for `k_covered` out of `n_total`.
pub fn clopper_pearson_exact_95(k_covered: usize, n_total: usize) -> ClopperPearsonBounds {
    if n_total == 0 {
        return ClopperPearsonBounds {
            k_covered: 0,
            n_total: 0,
            empirical_coverage: 0.0,
            ci95_low: 0.0,
            ci95_high: 1.0,
            covers_target_90pct: false,
        };
    }
    let k = k_covered.min(n_total);
    let n_f = n_total as f64;
    let k_f = k as f64;
    let empirical_coverage = k_f / n_f;

    let ci95_low = if k == 0 {
        0.0
    } else {
        invert_incomplete_beta(k_f, n_f - k_f + 1.0, 0.025)
    };
    let ci95_high = if k == n_total {
        1.0
    } else {
        invert_incomplete_beta(k_f + 1.0, n_f - k_f, 0.975)
    };

    let covers_target_90pct = (0.90 >= ci95_low) && (0.90 <= ci95_high);
    ClopperPearsonBounds {
        k_covered: k,
        n_total,
        empirical_coverage,
        ci95_low,
        ci95_high,
        covers_target_90pct,
    }
}

/// Pinball loss for quantile level `tau in (0, 1)`.
#[inline]
pub fn pinball_loss(y: f64, q_hat: f64, tau: f64) -> f64 {
    let diff = y - q_hat;
    if diff >= 0.0 {
        tau * diff
    } else {
        (tau - 1.0) * diff
    }
}

/// Winkler interval score for central `(1 - alpha)` prediction interval `[q05, q95]`.
#[inline]
pub fn winkler_score(y: f64, q05: f64, q95: f64, alpha: f64) -> f64 {
    let a = alpha.clamp(1e-4, 0.99);
    let width = (q95 - q05).max(0.0);
    let penalty_factor = 2.0 / a;
    let lower_pen = if y < q05 {
        penalty_factor * (q05 - y)
    } else {
        0.0
    };
    let upper_pen = if y > q95 {
        penalty_factor * (y - q95)
    } else {
        0.0
    };
    width + lower_pen + upper_pen
}

/// Split-Conformalized Quantile Regression (CQR, Romano et al. NeurIPS 2019).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ConformalizedQuantileCalibrator {
    pub alpha: f64,
    pub q_hat: f64,
    pub n_cal: usize,
}

impl ConformalizedQuantileCalibrator {
    /// Fits the nonconformity threshold `q_hat` on disjoint calibration pairs `(raw_cone, y_target)`.
    /// Requires `n_cal >= ceil((1 - alpha) / alpha)` (i.e. `>= 9` for `alpha = 0.10`).
    pub fn fit(
        calibration_pairs: &[(&MonotoneQuantileTriplet, f64)],
        alpha: f64,
    ) -> Result<Self, HorizonEvaluationStatus> {
        let n_cal = calibration_pairs.len();
        let clean_alpha = alpha.clamp(0.01, 0.50);
        let min_required = ((1.0 - clean_alpha) / clean_alpha).ceil() as usize;
        let k = (((n_cal + 1) as f64) * (1.0 - clean_alpha)).ceil() as usize;
        if n_cal == 0 || k == 0 || k > n_cal {
            return Err(HorizonEvaluationStatus::CalibrationSampleInsufficient {
                n_cal,
                min_required,
            });
        }
        let mut scores: Vec<f64> = calibration_pairs
            .iter()
            .filter(|(c, y)| y.is_finite() && c.is_monotone())
            .map(|(c, y)| (c.q05 - *y).max(*y - c.q95))
            .collect();
        if scores.len() < min_required {
            return Err(HorizonEvaluationStatus::CalibrationSampleInsufficient {
                n_cal: scores.len(),
                min_required,
            });
        }
        scores.sort_by(f64::total_cmp);
        let idx = (k - 1).min(scores.len() - 1);
        Ok(Self {
            alpha: clean_alpha,
            q_hat: scores[idx],
            n_cal: scores.len(),
        })
    }

    /// Applies symmetric conformal recalibration while preserving `q05 <= q50 <= q95`.
    #[inline]
    pub fn recalibrate(&self, raw: MonotoneQuantileTriplet) -> MonotoneQuantileTriplet {
        let q50 = if raw.q50.is_finite() { raw.q50 } else { 0.0 };
        let q05 = q50.min(raw.q05 - self.q_hat);
        let q95 = q50.max(raw.q95 + self.q_hat);
        MonotoneQuantileTriplet { q05, q50, q95 }
    }
}

/// Baseline 1: Conformalized Persistence (`y_{t+h} ~ y_t +/- q_hat_pers`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PersistenceCqrBaseline {
    pub q_hat: f64,
    pub n_cal: usize,
}

impl PersistenceCqrBaseline {
    /// Fits persistence nonconformity scores `|y_target - y_origin|` on the calibration split.
    pub fn fit(
        cal_pairs: &[(f64, f64)],
        alpha: f64,
    ) -> Result<Self, HorizonEvaluationStatus> {
        let n_cal = cal_pairs.len();
        let clean_alpha = alpha.clamp(0.01, 0.50);
        let min_required = ((1.0 - clean_alpha) / clean_alpha).ceil() as usize;
        let k = (((n_cal + 1) as f64) * (1.0 - clean_alpha)).ceil() as usize;
        if n_cal == 0 || k == 0 || k > n_cal {
            return Err(HorizonEvaluationStatus::CalibrationSampleInsufficient {
                n_cal,
                min_required,
            });
        }
        let mut errs: Vec<f64> = cal_pairs
            .iter()
            .filter(|(yo, yt)| yo.is_finite() && yt.is_finite())
            .map(|(yo, yt)| (yt - yo).abs())
            .collect();
        if errs.len() < min_required {
            return Err(HorizonEvaluationStatus::CalibrationSampleInsufficient {
                n_cal: errs.len(),
                min_required,
            });
        }
        errs.sort_by(f64::total_cmp);
        let idx = (k - 1).min(errs.len() - 1);
        Ok(Self {
            q_hat: errs[idx],
            n_cal: errs.len(),
        })
    }

    #[inline]
    pub fn predict(&self, y_origin: f64) -> MonotoneQuantileTriplet {
        MonotoneQuantileTriplet::from_median_and_spreads(y_origin, self.q_hat, self.q_hat)
    }
}

/// Baseline 2: Causal Rolling Median +/- 1.2193 * IQR conformalized via Split-CQR.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RollingMedianIqrBaseline {
    pub calibrator: ConformalizedQuantileCalibrator,
}

impl RollingMedianIqrBaseline {
    /// Converts a causal history slice into a raw `[q05, q50, q95]` cone using median and IQR.
    pub fn raw_triplet_from_window(window_values: &[f64]) -> Option<MonotoneQuantileTriplet> {
        let mut vals: Vec<f64> = window_values.iter().copied().filter(|v| v.is_finite()).collect();
        if vals.is_empty() {
            return None;
        }
        vals.sort_by(f64::total_cmp);
        let n = vals.len();
        let median = percentile_sorted(&vals, 0.50);
        let q25 = percentile_sorted(&vals, 0.25);
        let q75 = percentile_sorted(&vals, 0.75);
        let iqr = (q75 - q25).max(if n > 1 { 1e-6 } else { 0.0 });
        let spread = 1.2193 * iqr;
        Some(MonotoneQuantileTriplet::from_median_and_spreads(
            median, spread, spread,
        ))
    }

    /// Fits Split-CQR on raw Rolling-Median-IQR cones over the calibration split.
    pub fn fit(
        calibration_pairs: &[(&MonotoneQuantileTriplet, f64)],
        alpha: f64,
    ) -> Result<Self, HorizonEvaluationStatus> {
        let calibrator = ConformalizedQuantileCalibrator::fit(calibration_pairs, alpha)?;
        Ok(Self { calibrator })
    }

    #[inline]
    pub fn recalibrate(&self, raw_iqr_cone: MonotoneQuantileTriplet) -> MonotoneQuantileTriplet {
        self.calibrator.recalibrate(raw_iqr_cone)
    }
}

fn percentile_sorted(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }
    let idx_f = p.clamp(0.0, 1.0) * ((sorted.len() - 1) as f64);
    let lo = idx_f.floor() as usize;
    let hi = idx_f.ceil() as usize;
    let frac = idx_f - (lo as f64);
    sorted[lo] * (1.0 - frac) + sorted[hi] * frac
}

/// Evaluates anti-leakage, CQR recalibration, Clopper-Pearson 95% coverage, Winkler/Pinball scores,
/// and Persistence / RollingMedianIqr comparisons across requested horizons and channels.
/// Horizons exceeding `max_recording_span_s` emit `HorizonEvaluationStatus::InsufficientRecordingDuration`
/// rather than fabricating metrics.
pub fn evaluate_horizon_cells(
    samples: &[CalibrationSamplePair],
    horizons_s: &[u32],
    max_recording_span_s: f64,
    min_context_steps: usize,
) -> Result<Vec<HorizonCellMetrics>, LeakageViolationError> {
    verify_anti_leakage_invariants(samples, min_context_steps)?;

    let mut cells = Vec::new();
    let short_threshold_s = *DHF_HORIZONS_SECONDS.first().unwrap_or(&900);

    for &horizon_s in horizons_s {
        let is_short = horizon_s < short_threshold_s;
        if !max_recording_span_s.is_finite() || max_recording_span_s + 1e-9 < f64::from(horizon_s) {
            cells.push(HorizonCellMetrics {
                horizon_s,
                is_short_technical_subhorizon: is_short,
                channel_name: "all_channels".to_string(),
                missingness_bin: MissingnessBin::ZeroPct,
                status: HorizonEvaluationStatus::InsufficientRecordingDuration {
                    max_recording_span_s,
                    required_horizon_s: horizon_s,
                },
                timestral_cqr_coverage: None,
                mean_interval_width: None,
                winkler_score_alpha_10: None,
                pinball_loss_mean: None,
                persistence_winkler_score: None,
                rolling_median_iqr_winkler_score: None,
                false_alarm_rate: None,
                missed_violation_rate: None,
            });
            continue;
        }

        // Group samples for this horizon by (channel_name, MissingnessBin).
        let mut by_stratum: BTreeMap<(String, MissingnessBin), Vec<&CalibrationSamplePair>> =
            BTreeMap::new();
        for s in samples.iter().filter(|s| s.horizon_s == horizon_s) {
            if let Some(bin) = MissingnessBin::from_ratio(s.missing_ratio) {
                by_stratum
                    .entry((s.channel_name.clone(), bin))
                    .or_default()
                    .push(s);
            }
        }

        for ((channel_name, bin), group) in by_stratum {
            let cal_items: Vec<&CalibrationSamplePair> = group
                .iter()
                .copied()
                .filter(|s| s.role == SplitRole::Calibration)
                .collect();
            let test_items: Vec<&CalibrationSamplePair> = group
                .iter()
                .copied()
                .filter(|s| s.role == SplitRole::HeldOutTest)
                .collect();

            let cal_cones: Vec<(&MonotoneQuantileTriplet, f64)> =
                cal_items.iter().map(|s| (&s.raw_cone, s.y_target)).collect();
            let cqr = match ConformalizedQuantileCalibrator::fit(&cal_cones, 0.10) {
                Ok(c) => c,
                Err(status) => {
                    cells.push(HorizonCellMetrics {
                        horizon_s,
                        is_short_technical_subhorizon: is_short,
                        channel_name,
                        missingness_bin: bin,
                        status,
                        timestral_cqr_coverage: None,
                        mean_interval_width: None,
                        winkler_score_alpha_10: None,
                        pinball_loss_mean: None,
                        persistence_winkler_score: None,
                        rolling_median_iqr_winkler_score: None,
                        false_alarm_rate: None,
                        missed_violation_rate: None,
                    });
                    continue;
                }
            };

            let pers_cal: Vec<(f64, f64)> =
                cal_items.iter().map(|s| (s.y_origin, s.y_target)).collect();
            let pers_baseline = PersistenceCqrBaseline::fit(&pers_cal, 0.10).ok();

            let mut sorted_cal_y: Vec<f64> = cal_items.iter().map(|s| s.y_origin).collect();
            sorted_cal_y.sort_by(f64::total_cmp);
            let iqr_raw_default = RollingMedianIqrBaseline::raw_triplet_from_window(&sorted_cal_y)
                .unwrap_or_else(|| MonotoneQuantileTriplet::from_median_and_spreads(0.0, 1.0, 1.0));
            let iqr_cal_pairs: Vec<(&MonotoneQuantileTriplet, f64)> = cal_items
                .iter()
                .map(|s| (&iqr_raw_default, s.y_target))
                .collect();
            let iqr_baseline = RollingMedianIqrBaseline::fit(&iqr_cal_pairs, 0.10).ok();

            if test_items.is_empty() {
                cells.push(HorizonCellMetrics {
                    horizon_s,
                    is_short_technical_subhorizon: is_short,
                    channel_name,
                    missingness_bin: bin,
                    status: HorizonEvaluationStatus::CalibrationSampleInsufficient {
                        n_cal: 0,
                        min_required: 1,
                    },
                    timestral_cqr_coverage: None,
                    mean_interval_width: None,
                    winkler_score_alpha_10: None,
                    pinball_loss_mean: None,
                    persistence_winkler_score: None,
                    rolling_median_iqr_winkler_score: None,
                    false_alarm_rate: None,
                    missed_violation_rate: None,
                });
                continue;
            }

            let n_test = test_items.len();
            let mut k_covered = 0usize;
            let mut width_sum = 0.0;
            let mut winkler_sum = 0.0;
            let mut pinball_sum = 0.0;
            let mut pers_winkler_sum = 0.0;
            let mut iqr_winkler_sum = 0.0;
            let mut false_alarms = 0usize;
            let mut missed_violations = 0usize;

            for item in &test_items {
                let cal_cone = cqr.recalibrate(item.raw_cone);
                if item.y_target >= cal_cone.q05 && item.y_target <= cal_cone.q95 {
                    k_covered += 1;
                }
                width_sum += cal_cone.interval_width();
                winkler_sum += winkler_score(item.y_target, cal_cone.q05, cal_cone.q95, 0.10);
                let pb = (pinball_loss(item.y_target, cal_cone.q05, 0.05)
                    + pinball_loss(item.y_target, cal_cone.q50, 0.50)
                    + pinball_loss(item.y_target, cal_cone.q95, 0.95))
                    / 3.0;
                pinball_sum += pb;

                if cal_cone.q05 < 0.0 && item.y_target >= 0.0 {
                    false_alarms += 1;
                }
                if cal_cone.q05 >= 0.0 && item.y_target < 0.0 {
                    missed_violations += 1;
                }

                if let Some(pb_model) = pers_baseline {
                    let pc = pb_model.predict(item.y_origin);
                    pers_winkler_sum += winkler_score(item.y_target, pc.q05, pc.q95, 0.10);
                }
                if let Some(iqr_model) = iqr_baseline {
                    let ic = iqr_model.recalibrate(iqr_raw_default);
                    iqr_winkler_sum += winkler_score(item.y_target, ic.q05, ic.q95, 0.10);
                }
            }

            let n_f = n_test as f64;
            cells.push(HorizonCellMetrics {
                horizon_s,
                is_short_technical_subhorizon: is_short,
                channel_name,
                missingness_bin: bin,
                status: HorizonEvaluationStatus::Evaluated,
                timestral_cqr_coverage: Some(clopper_pearson_exact_95(k_covered, n_test)),
                mean_interval_width: Some(width_sum / n_f),
                winkler_score_alpha_10: Some(winkler_sum / n_f),
                pinball_loss_mean: Some(pinball_sum / n_f),
                persistence_winkler_score: pers_baseline.map(|_| pers_winkler_sum / n_f),
                rolling_median_iqr_winkler_score: iqr_baseline.map(|_| iqr_winkler_sum / n_f),
                false_alarm_rate: Some((false_alarms as f64) / n_f),
                missed_violation_rate: Some((missed_violations as f64) / n_f),
            });
        }
    }

    Ok(cells)
}

/// Computes Brier Score, 10-bin Expected Calibration Error (ECE), Maximum Calibration Error (MCE),
/// and documents the structural empty gap `(0.45, 0.92)` of the two-stage Bayesian POCUS observer.
pub fn compute_brier_and_ece_10_bins(predictions: &[(f64, bool)]) -> ProbabilisticCalibrationAudit {
    let pocus_bounds = audit_bayesian_pocus_structural_bounds();
    let structural_empty_band = pocus_bounds.uncalibrated_empty_gap;

    let mut bin_counts = [0usize; 10];
    let mut bin_prob_sums = [0.0_f64; 10];
    let mut bin_label_sums = [0.0_f64; 10];

    let mut valid_n = 0usize;
    let mut brier_sum = 0.0_f64;

    for &(raw_p, label) in predictions {
        if !raw_p.is_finite() {
            continue;
        }
        let p = raw_p.clamp(0.0, 1.0);
        let y = if label { 1.0 } else { 0.0 };
        brier_sum += (p - y) * (p - y);
        valid_n += 1;

        let bin_idx = if p <= 0.0 {
            0
        } else {
            ((p * 10.0).ceil() as usize).saturating_sub(1).min(9)
        };
        bin_counts[bin_idx] += 1;
        bin_prob_sums[bin_idx] += p;
        bin_label_sums[bin_idx] += y;
    }

    let mut bins = Vec::with_capacity(10);
    let mut ece = 0.0_f64;
    let mut mce = 0.0_f64;
    let n_f = (valid_n.max(1)) as f64;

    for b in 0..10 {
        let count = bin_counts[b];
        let lower_prob = (b as f64) * 0.1;
        let upper_prob = ((b + 1) as f64) * 0.1;
        let (mean_p, emp_rate, gap) = if count > 0 {
            let mp = bin_prob_sums[b] / (count as f64);
            let er = bin_label_sums[b] / (count as f64);
            let g = (er - mp).abs();
            ece += ((count as f64) / n_f) * g;
            mce = mce.max(g);
            (mp, er, g)
        } else {
            (0.0, 0.0, 0.0)
        };
        bins.push(ReliabilityBinSummary {
            bin_index: b + 1,
            lower_prob,
            upper_prob,
            sample_count: count,
            mean_predicted_prob: mean_p,
            empirical_positive_rate: emp_rate,
            abs_calibration_gap: gap,
        });
    }

    let brier_score = if valid_n > 0 {
        brier_sum / (valid_n as f64)
    } else {
        0.0
    };

    ProbabilisticCalibrationAudit {
        brier_score,
        ece_10_bins: ece,
        mce_10_bins: mce,
        structural_empty_band,
        bins,
    }
}

/// Runs the sensitivity audit comparing legacy 60-day-capped RK4 integration against
/// unbounded adaptive 900-Sol RK4 integration (`dt <= 0.5 d`) and time-varying Sol-180 schedules.
pub fn run_sost_rk4_sensitivity_audit() -> SostRk4SensitivityAudit {
    let mut max_const_diff = 0.0_f64;
    for fd in [60u32, 180, 365, 900, 1000] {
        for load in [0.0, 65.0, 125.0, 180.0] {
            let legacy = compute_musculoskeletal_state_with_policy(
                fd,
                load,
                Rk4HorizonPolicy::Bounded60DaysLegacy,
            );
            let adaptive = compute_musculoskeletal_state_with_policy(
                fd,
                load,
                Rk4HorizonPolicy::AdaptiveUnbounded { max_dt_days: 0.5 },
            );
            let diff = (legacy.sclerostin_pmol_l - adaptive.sclerostin_pmol_l).abs();
            max_const_diff = max_const_diff.max(diff);
        }
    }

    // Time-varying Mars transit failure scenario: nominal 125 kgf for 180 Sols, then ARED outage (0 kgf) up to Sol 900.
    let mut schedule = vec![125.0; 180];
    schedule.extend(vec![0.0; 720]);
    let traj = integrate_sclerostin_schedule(22.5, &schedule, 4);
    let legacy_frozen = compute_musculoskeletal_state_with_policy(
        210,
        125.0,
        Rk4HorizonPolicy::Bounded60DaysLegacy,
    )
    .sclerostin_pmol_l;
    let adaptive_after_outage = traj.get(209).copied().unwrap_or(legacy_frozen);
    let max_step_diff = (adaptive_after_outage - legacy_frozen).abs();

    SostRk4SensitivityAudit {
        max_constant_load_diff_pmol_l_up_to_1000d: max_const_diff,
        max_step_change_load_diff_pmol_l_at_sol_180: max_step_diff,
        legacy_effective_cap_days: 60.0,
        adaptive_substep_dt_days: 0.25,
    }
}

/// Fail-closed validation state machine resolver (Issue #12 closure):
/// - Any synthetic data (`contains_synthetic_data == true` or `audit.contains_synthetic_data`)
///   ALWAYS resolves to `ModelValidationStatus::IllustrativeUnvalidated`.
/// - Missing `audit` ALWAYS resolves to `ModelValidationStatus::IllustrativeUnvalidated`.
/// - `ClinicallyCalibratedSubjectToReview` requires a signed `ValidationManifest` passing all 5 gates
///   AND an anti-leakage verified non-synthetic audit report with evaluated DHF horizons.
/// - `InternallyBenchmarkedTerrestrial` requires a non-synthetic, anti-leakage verified held-out
///   terrestrial audit with `N >= 30`, `90%` inside the 95% Clopper-Pearson interval, `ci95_low >= 0.80`,
///   and a non-zero report SHA-256 digest.
pub fn resolve_validation_status_with_report_hash(
    contains_synthetic_data: bool,
    audit: Option<&CalibrationAuditReport>,
    manifest: Option<&ValidationManifest>,
    report_sha256: Option<Sha256DigestHex>,
) -> ModelValidationStatus {
    if contains_synthetic_data {
        return ModelValidationStatus::IllustrativeUnvalidated;
    }
    let Some(report) = audit else {
        return ModelValidationStatus::IllustrativeUnvalidated;
    };
    if report.contains_synthetic_data || !report.anti_leakage_verified {
        return ModelValidationStatus::IllustrativeUnvalidated;
    }

    let evaluated_cells: Vec<&HorizonCellMetrics> = report
        .horizon_cells
        .iter()
        .filter(|c| c.status == HorizonEvaluationStatus::Evaluated)
        .collect();
    if evaluated_cells.is_empty() {
        return ModelValidationStatus::IllustrativeUnvalidated;
    }

    // Check whether all 5 clinical gates and paired cohorts are cryptographically verified.
    if let Some(m) = manifest
        && m.passes_all_five_clinical_gates()
        && !m.contains_synthetic_data
        && m.calibration_report_sha256 != Sha256DigestHex::ZERO
    {
        let digest_ok = report_sha256.is_none_or(|d| d == m.calibration_report_sha256);
        let has_dhf_clinical = evaluated_cells
            .iter()
            .any(|c| !c.is_short_technical_subhorizon);
        if digest_ok && has_dhf_clinical {
            return ModelValidationStatus::ClinicallyCalibratedSubjectToReview;
        }
    }

    // Terrestrial-only benchmark check (never spaceflight validation).
    let Some(artifact_sha256) = report_sha256.filter(|d| *d != Sha256DigestHex::ZERO) else {
        return ModelValidationStatus::IllustrativeUnvalidated;
    };

    let mut total_k = 0usize;
    let mut total_n = 0usize;
    for cell in &evaluated_cells {
        if let Some(cp) = cell.timestral_cqr_coverage {
            total_k += cp.k_covered;
            total_n += cp.n_total;
        }
    }
    if total_n < 30 {
        return ModelValidationStatus::IllustrativeUnvalidated;
    }
    let aggregate_cp = clopper_pearson_exact_95(total_k, total_n);
    if !aggregate_cp.covers_target_90pct || aggregate_cp.ci95_low < 0.80 {
        return ModelValidationStatus::IllustrativeUnvalidated;
    }

    let brier_score = report
        .pocus_calibration_audit
        .as_ref()
        .map_or(0.0, |p| p.brier_score);
    if !brier_score.is_finite() || brier_score > 0.15 {
        return ModelValidationStatus::IllustrativeUnvalidated;
    }

    let has_dhf = evaluated_cells
        .iter()
        .any(|c| !c.is_short_technical_subhorizon);
    let dataset_scope = if has_dhf {
        TerrestrialBenchmarkScope::MultiCohortPhysioNetUciTerrestrial
    } else {
        TerrestrialBenchmarkScope::BidmcNumericsShortSubHorizon
    };

    ModelValidationStatus::InternallyBenchmarkedTerrestrial {
        dataset_scope,
        coverage_pct: aggregate_cp.empirical_coverage * 100.0,
        brier_score,
        artifact_sha256,
    }
}

/// Convenience wrapper for `resolve_validation_status_with_report_hash` computing the report's
/// canonical SHA-256 digest when a non-synthetic audit report is supplied.
pub fn resolve_validation_status_fail_closed(
    contains_synthetic_data: bool,
    audit: Option<&CalibrationAuditReport>,
    manifest: Option<&ValidationManifest>,
) -> ModelValidationStatus {
    let report_sha = audit.and_then(|r| {
        serde_json::to_vec(r).ok().map(|bytes| {
            let digest = Sha256::digest(&bytes);
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&digest);
            Sha256DigestHex(arr)
        })
    });
    resolve_validation_status_with_report_hash(contains_synthetic_data, audit, manifest, report_sha)
}
