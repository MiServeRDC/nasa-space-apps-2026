//! Shared contract types for the per-subject vitals anomaly detector and the
//! short-horizon EWMA forecaster (`ares-nqs-stl`), consumed by the MedOps
//! playbook selector, the wire contract, and the cockpit.

use crate::{AresCoreError, MonotoneQuantileTriplet};
use serde::{Deserialize, Serialize};

/// Short-horizon EWMA forecast horizons in seconds (`+5 s, +10 s, +30 s, +60 s, +120 s`).
pub const EWMA_SHORT_HORIZONS_SECONDS: [u32; 5] = [5, 10, 30, 60, 120];

/// Per-channel anomaly status, ordered by severity.
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnomalyStatus {
    #[default]
    Normal,
    Attention,
    Alarm,
}

/// Which statistical rule produced the reported status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnomalyDetectorKind {
    /// Sustained robust z-score (median / MAD) against the personal baseline.
    RobustZScore,
    /// Tabular CUSUM on the robust z-score (slow drift).
    CusumDrift,
    /// Mahalanobis distance over (HR, SpO2, RESP) (anomalous combination).
    Mahalanobis,
    /// Consecutive missing samples (detached or failed sensor).
    SensorDropout,
}

/// Status of one monitored channel (or of the joint multivariate check).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelAnomalyState {
    /// `heart_rate_bpm`, `spo2_pct`, `resp_rate_brpm` or `joint_hr_spo2_resp`.
    pub channel: String,
    pub status: AnomalyStatus,
    /// False when the physiological rules cannot run right now: the personal
    /// baseline of this channel is not frozen yet, or there is no current sample.
    /// Sensor-dropout alerting stays active regardless of this flag, and a
    /// non-evaluable channel is never reported as a quiet `Normal`.
    pub evaluable: bool,
    pub detector: Option<AnomalyDetectorKind>,
    pub value: Option<f64>,
    pub baseline_median: Option<f64>,
    pub baseline_sigma: Option<f64>,
    pub z_score: Option<f64>,
    /// Seconds for which the reported condition has been continuously true.
    pub duration_s: f64,
    /// Human-readable reason, e.g. "SpO2 -4.0 sigma vs personal baseline for 90 s".
    pub reason: String,
}

/// Full detector output for one native 1 Hz sample.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct VitalsAnomalyReport {
    pub recording_time_s: f64,
    /// False until every monitored channel has a frozen personal baseline and
    /// the joint check is armed. Channels learn independently, so a channel whose
    /// early samples were missing keeps learning instead of being excluded.
    pub baseline_ready: bool,
    pub baseline_samples: u32,
    pub baseline_required: u32,
    pub overall: AnomalyStatus,
    /// Squared Mahalanobis distance of (HR, SpO2, RESP), when all three are observed.
    pub mahalanobis_d2: Option<f64>,
    /// Order: heart_rate_bpm, spo2_pct, resp_rate_brpm, joint_hr_spo2_resp.
    pub channels: Vec<ChannelAnomalyState>,
}

impl VitalsAnomalyReport {
    /// Most severe channel entry (first one wins on ties), if any is not `Normal`.
    pub fn dominant(&self) -> Option<&ChannelAnomalyState> {
        let mut best: Option<&ChannelAnomalyState> = None;
        for ch in &self.channels {
            if ch.status > best.map_or(AnomalyStatus::Normal, |b| b.status) {
                best = Some(ch);
            }
        }
        best
    }
}

/// How the published forecast snapshot was produced.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ForecastMethod {
    /// Cold-start deterministic fallback before Timestral or EWMA inference runs.
    #[default]
    DeterministicColdStart,
    /// Timestral grey-box 1 Hz forecaster (`+15m, +1h, +6h, +24h`).
    TimestralGreyBox1Hz,
    /// EWMA level with intervals taken from empirical quantiles of its own past residuals (`+5s..+120s`).
    EwmaEmpiricalResidualQuantiles,
    /// Dual-engine coexistence: Timestral grey-box long horizons plus EWMA empirical short horizons.
    HybridTimestralAndEwmaShortHorizon,
}

/// Short-horizon forecast of one channel across `+5 s, +10 s, +30 s, +60 s, +120 s`.
/// A horizon is `None` until enough out-of-sample residuals for that horizon have been observed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShortHorizonCone {
    pub channel_name: String,
    pub ewma_level: f64,
    pub horizon_5s: Option<MonotoneQuantileTriplet>,
    pub horizon_10s: Option<MonotoneQuantileTriplet>,
    pub horizon_30s: Option<MonotoneQuantileTriplet>,
    pub horizon_60s: Option<MonotoneQuantileTriplet>,
    pub horizon_120s: Option<MonotoneQuantileTriplet>,
}

impl ShortHorizonCone {
    /// Verifies finite `ewma_level` and non-crossing monotonicity across all populated short horizons.
    pub fn assert_monotone(&self) -> Result<(), AresCoreError> {
        if !self.ewma_level.is_finite() {
            return Err(AresCoreError::NonFiniteValue {
                field: "ShortHorizonCone.ewma_level",
            });
        }
        for triplet in [
            self.horizon_5s,
            self.horizon_10s,
            self.horizon_30s,
            self.horizon_60s,
            self.horizon_120s,
        ]
        .into_iter()
        .flatten()
        {
            triplet.assert_monotone()?;
        }
        Ok(())
    }
}
