//! Extended 360-degree NQS-STL predicates, radiation/ARS normalizers, and temporal window helpers.

use std::collections::VecDeque;

use ares_causal_graph::radiation_ars::{
    ARS_CYTOKINE_FILGRASTIM_DOSE_THRESHOLD_GY, ARS_DEFAULT_ANC_BASELINE_K_UL,
    ARS_DEFAULT_PLT_BASELINE_K_UL, ARS_PLATELET_GATE_LOCK_K_UL, ARS_SEVERE_NEUTROPENIA_ANC_K_UL,
    NASA_STD_3001_CAREER_EFFECTIVE_LIMIT_MSV,
};
use ares_core_types::constants::{ECLSS_PPCO2_ACTION_LIMIT_MMHG, sanitize_f64};
use ares_core_types::medical_360::{AerospaceMedical360State, RadiationArsState};
use ares_core_types::telemetry::{AlertSeverity, ModelValidationStatus};
use serde::{Deserialize, Serialize};

use crate::normalizer::{PredicatePolarity, normalize_predicate_nqs};

/// Nominal career effective dose baseline (mSv) for NQS normalization.
pub const STL360_RADIATION_CAREER_NOMINAL_MSV: f64 = 50.0;

/// Nominal acute BFO dose baseline (Gy) for NQS normalization.
pub const STL360_RADIATION_BFO_NOMINAL_GY: f64 = 0.05;

/// Nominal cabin ppCO2 baseline (mmHg) for NQS normalization.
pub const STL360_ECLSS_PPCO2_NOMINAL_MMHG: f64 = 2.0;

/// Normalizes cumulative mission effective dose (mSv) against NASA-STD-3001 `[V1 3009]` (600.0 mSv).
#[inline]
pub fn normalize_radiation_career_dose_margin(cumulative_mission_dose_msv: f64) -> f64 {
    normalize_predicate_nqs(
        cumulative_mission_dose_msv,
        STL360_RADIATION_CAREER_NOMINAL_MSV,
        NASA_STD_3001_CAREER_EFFECTIVE_LIMIT_MSV,
        PredicatePolarity::LowerIsSafer,
    )
}

/// Normalizes acute BFO dose (Gy) against the 2.0 Gy Filgrastim cytokine threshold.
#[inline]
pub fn normalize_radiation_bfo_margin(estimated_acute_bfo_dose_gy: f64) -> f64 {
    normalize_predicate_nqs(
        estimated_acute_bfo_dose_gy,
        STL360_RADIATION_BFO_NOMINAL_GY,
        ARS_CYTOKINE_FILGRASTIM_DOSE_THRESHOLD_GY,
        PredicatePolarity::LowerIsSafer,
    )
}

/// Normalizes predicted ANC (K/uL) against severe neutropenia threshold (0.50 K/uL).
#[inline]
pub fn normalize_anc_margin(predicted_anc_k_ul: f64) -> f64 {
    normalize_predicate_nqs(
        predicted_anc_k_ul,
        ARS_DEFAULT_ANC_BASELINE_K_UL,
        ARS_SEVERE_NEUTROPENIA_ANC_K_UL,
        PredicatePolarity::HigherIsSafer,
    )
}

/// Normalizes predicted platelet count (K/uL) against Gate 1/5/6 lock threshold (75.0 K/uL).
#[inline]
pub fn normalize_plt_margin(predicted_plt_k_ul: f64) -> f64 {
    normalize_predicate_nqs(
        predicted_plt_k_ul,
        ARS_DEFAULT_PLT_BASELINE_K_UL,
        ARS_PLATELET_GATE_LOCK_K_UL,
        PredicatePolarity::HigherIsSafer,
    )
}

/// Composite NQS-STL conjunction (`min`) across all `RadiationArsState` safety predicates.
#[inline]
pub fn normalize_radiation_ars_composite_margin(ars: &RadiationArsState) -> f64 {
    let rho_career = normalize_radiation_career_dose_margin(ars.cumulative_mission_dose_msv);
    let rho_bfo = normalize_radiation_bfo_margin(ars.estimated_acute_bfo_dose_gy);
    let rho_anc = normalize_anc_margin(ars.predicted_anc_k_ul);
    let rho_plt = normalize_plt_margin(ars.predicted_plt_k_ul);

    let mut composite = rho_career.min(rho_bfo).min(rho_anc).min(rho_plt);
    if ars.febrile_neutropenia_emergency {
        composite = composite.min(-1.0);
    }
    composite
}

/// Normalizes cabin ppCO2 (mmHg) against NASA-STD-3001 `[V2 6004]` action limit (4.0 mmHg).
#[inline]
pub fn normalize_eclss_ppco2_margin(ppco2_mmhg: f64) -> f64 {
    normalize_predicate_nqs(
        ppco2_mmhg,
        STL360_ECLSS_PPCO2_NOMINAL_MMHG,
        ECLSS_PPCO2_ACTION_LIMIT_MMHG,
        PredicatePolarity::LowerIsSafer,
    )
}

/// Timestamped NQS-STL margin sample for temporal operator evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct StlTimedMargin {
    pub timestamp_s: f64,
    pub margin: f64,
}

/// Sliding-window temporal STL evaluator supporting `G_[t-W, t]` (always),
/// `F_[t-W, t]` (eventually), and continuous violation dwell duration.
#[derive(Debug, Clone)]
pub struct StlTemporalWindow {
    window_s: f64,
    samples: VecDeque<StlTimedMargin>,
}

impl StlTemporalWindow {
    /// Creates a new temporal window of `window_s` seconds (clamped to `>= 1.0`).
    pub fn new(window_s: f64) -> Self {
        let w = sanitize_f64(window_s, 60.0).max(1.0);
        Self {
            window_s: w,
            samples: VecDeque::new(),
        }
    }

    /// Returns the configured window duration in seconds.
    #[inline]
    pub fn window_seconds(&self) -> f64 {
        self.window_s
    }

    /// Returns the number of active samples currently inside the window.
    #[inline]
    pub fn len(&self) -> usize {
        self.samples.len()
    }

    /// Returns true if the window contains no samples.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    /// Pushes a `(timestamp_s, margin)` sample, evicting samples older than `timestamp_s - window_s`.
    /// Non-finite timestamps or margins are safely ignored.
    pub fn push_sample(&mut self, timestamp_s: f64, margin: f64) {
        if !timestamp_s.is_finite() || !margin.is_finite() {
            return;
        }
        if let Some(last) = self.samples.back()
            && timestamp_s < last.timestamp_s
        {
            self.samples.clear();
        }
        self.samples.push_back(StlTimedMargin {
            timestamp_s,
            margin: margin.clamp(-2.0, 1.0),
        });

        let cutoff = timestamp_s - self.window_s;
        while let Some(front) = self.samples.front() {
            if front.timestamp_s < cutoff {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }

    /// STL `G_[t-W, t] (rho)`: minimum margin across the active window.
    #[inline]
    pub fn globally_min(&self) -> Option<f64> {
        self.samples
            .iter()
            .map(|s| s.margin)
            .reduce(f64::min)
    }

    /// STL `F_[t-W, t] (rho)`: maximum margin across the active window.
    #[inline]
    pub fn eventually_max(&self) -> Option<f64> {
        self.samples
            .iter()
            .map(|s| s.margin)
            .reduce(f64::max)
    }

    /// Continuous trailing duration (seconds) during which `margin < 0.0`.
    pub fn violation_dwell_seconds(&self) -> f64 {
        let Some(latest) = self.samples.back() else {
            return 0.0;
        };
        if latest.margin >= 0.0 {
            return 0.0;
        }
        let mut earliest_violating_t = latest.timestamp_s;
        for sample in self.samples.iter().rev() {
            if sample.margin < 0.0 {
                earliest_violating_t = sample.timestamp_s;
            } else {
                break;
            }
        }
        (latest.timestamp_s - earliest_violating_t).max(0.0)
    }

    /// Returns true if the predicate has been continuously violated for at least `min_dwell_s`.
    #[inline]
    pub fn is_sustained_violation(&self, min_dwell_s: f64) -> bool {
        let required = sanitize_f64(min_dwell_s, 0.0).max(0.0);
        self.violation_dwell_seconds() >= required && self.samples.back().is_some_and(|s| s.margin < 0.0)
    }
}

/// Summary of 360-degree NQS-STL margins across extended aerospace medical domains.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Stl360MarginsSummary {
    pub rho_radiation_career: Option<f64>,
    pub rho_radiation_bfo: Option<f64>,
    pub rho_radiation_anc: Option<f64>,
    pub rho_radiation_plt: Option<f64>,
    pub rho_radiation_ars: Option<f64>,
    pub rho_eclss_co2: Option<f64>,
    pub rho_360_min: Option<f64>,
    pub severity: AlertSeverity,
    pub validation_status: ModelValidationStatus,
}

impl Default for Stl360MarginsSummary {
    fn default() -> Self {
        Self {
            rho_radiation_career: None,
            rho_radiation_bfo: None,
            rho_radiation_anc: None,
            rho_radiation_plt: None,
            rho_radiation_ars: None,
            rho_eclss_co2: None,
            rho_360_min: None,
            severity: AlertSeverity::Nominal,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Evaluates 360-degree NQS-STL margins from `AerospaceMedical360State`.
pub fn evaluate_stl_360_margins(state_360: Option<&AerospaceMedical360State>) -> Stl360MarginsSummary {
    let Some(s360) = state_360 else {
        return Stl360MarginsSummary::default();
    };

    let (rho_radiation_career, rho_radiation_bfo, rho_radiation_anc, rho_radiation_plt, rho_radiation_ars) =
        match s360.radiation_ars.as_ref() {
            Some(ars) => (
                Some(normalize_radiation_career_dose_margin(ars.cumulative_mission_dose_msv)),
                Some(normalize_radiation_bfo_margin(ars.estimated_acute_bfo_dose_gy)),
                Some(normalize_anc_margin(ars.predicted_anc_k_ul)),
                Some(normalize_plt_margin(ars.predicted_plt_k_ul)),
                Some(normalize_radiation_ars_composite_margin(ars)),
            ),
            None => (None, None, None, None, None),
        };

    let rho_eclss_co2 = s360
        .eclss_coupled
        .as_ref()
        .map(|eclss| normalize_eclss_ppco2_margin(eclss.max_ppco2_mmhg));

    let mut rho_360_min: Option<f64> = None;
    for candidate in [rho_radiation_ars, rho_eclss_co2].into_iter().flatten() {
        rho_360_min = Some(match rho_360_min {
            Some(curr) => curr.min(candidate),
            None => candidate,
        });
    }

    let febrile_emergency = s360
        .radiation_ars
        .as_ref()
        .is_some_and(|ars| ars.febrile_neutropenia_emergency);

    let severity = if febrile_emergency || rho_360_min.is_some_and(|r| r <= -0.35) {
        AlertSeverity::CriticalEmergency
    } else if rho_360_min.is_some_and(|r| r < 0.0) {
        AlertSeverity::Warning
    } else if rho_360_min.is_some_and(|r| r < 0.25) {
        AlertSeverity::Caution
    } else {
        AlertSeverity::Nominal
    };

    Stl360MarginsSummary {
        rho_radiation_career,
        rho_radiation_bfo,
        rho_radiation_anc,
        rho_radiation_plt,
        rho_radiation_ars,
        rho_eclss_co2,
        rho_360_min,
        severity,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_causal_graph::radiation_ars::evaluate_radiation_ars;
    use ares_core_types::medical_360::{EclssCoupledSummary, RadiationArsInput};

    #[test]
    fn test_radiation_normalizers_map_nominal_and_critical_boundaries() {
        assert!((normalize_radiation_career_dose_margin(50.0) - 1.0).abs() < 1e-6);
        assert!(normalize_radiation_career_dose_margin(600.0).abs() < 1e-6);
        assert!(normalize_radiation_career_dose_margin(750.0) < 0.0);

        assert!((normalize_radiation_bfo_margin(0.05) - 1.0).abs() < 1e-6);
        assert!(normalize_radiation_bfo_margin(2.0).abs() < 1e-6);
        assert!(normalize_radiation_bfo_margin(3.0) < 0.0);

        assert!((normalize_anc_margin(4.2) - 1.0).abs() < 1e-6);
        assert!(normalize_anc_margin(0.50).abs() < 1e-6);
        assert!(normalize_anc_margin(0.25) < 0.0);

        assert!((normalize_plt_margin(240.0) - 1.0).abs() < 1e-6);
        assert!(normalize_plt_margin(75.0).abs() < 1e-6);
        assert!(normalize_plt_margin(45.0) < 0.0);
    }

    #[test]
    fn test_stl_temporal_window_globally_eventually_and_dwell() {
        let mut win = StlTemporalWindow::new(30.0);
        win.push_sample(0.0, 0.8);
        win.push_sample(10.0, -0.2);
        win.push_sample(20.0, -0.4);
        win.push_sample(30.0, -0.5);

        let g = win.globally_min();
        assert!(g.is_some());
        if let Some(g_val) = g {
            assert!((g_val - (-0.5)).abs() < 1e-6);
        }
        let f = win.eventually_max();
        assert!(f.is_some());
        if let Some(f_val) = f {
            assert!((f_val - 0.8).abs() < 1e-6);
        }
        assert!((win.violation_dwell_seconds() - 20.0).abs() < 1e-6);
        assert!(win.is_sustained_violation(15.0));
        assert!(!win.is_sustained_violation(25.0));

        // Eviction of t=0.0 sample at t=35.0
        win.push_sample(35.0, -0.6);
        assert_eq!(win.len(), 4);
        let f_after = win.eventually_max();
        assert!(f_after.is_some());
        if let Some(f_after_val) = f_after {
            assert!((f_after_val - (-0.2)).abs() < 1e-6);
        }
    }

    #[test]
    fn test_evaluate_stl_360_margins_with_febrile_neutropenia_and_eclss() {
        let ars_input = RadiationArsInput {
            alc_t_k_ul: Some(0.95),
            alc_hours_post_spe: Some(24.0),
            alc_baseline_k_ul: Some(2.1),
            emesis_onset_hours_post_spe: None,
            days_post_spe: 12.6,
            cumulative_mission_dose_msv: 400.0,
            core_temp_c: Some(38.5),
        };
        let ars_state = evaluate_radiation_ars(&ars_input, 1.0, None, None);

        let state_360 = AerospaceMedical360State {
            radiation_ars: Some(ars_state),
            eclss_coupled: Some(EclssCoupledSummary {
                max_ppco2_mmhg: 3.5,
                ..EclssCoupledSummary::default()
            }),
            ..AerospaceMedical360State::default()
        };

        let summary = evaluate_stl_360_margins(Some(&state_360));
        assert_eq!(summary.severity, AlertSeverity::CriticalEmergency);
        assert!(summary.rho_radiation_ars.is_some_and(|r| r <= -1.0));
        assert!(summary.rho_eclss_co2.is_some_and(|r| r > 0.0 && r < 0.5));
        assert_eq!(
            summary.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );
    }
}
