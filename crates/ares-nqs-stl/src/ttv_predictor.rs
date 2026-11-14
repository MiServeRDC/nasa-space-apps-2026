//! Illustrative fixed-rate TTV sensitivity range (not a fitted EWMA-OLS or calibrated CI)
//! e calcolo del cono TTV Grey-Box pessimistico al 5° percentile (TTV_q05 <= TTV_q50 <= TTV_q95).

use ares_core_types::MonotoneQuantileTriplet;

pub const MAX_HORIZON_HOURS: f64 = 720.0; // 30 giorni

/// Computes the monotonic Grey-Box TTV cone [TTV_q05, TTV_q50, TTV_q95] in hours from the
/// current NQS robustness `rho_global` and the predicted lower/median/upper robustness cone.
/// `TTV_q05` is the pessimistic worst-case time-to-violation derived from `rho_cone.q05`.
#[inline]
pub fn estimate_greybox_quantile_ttv_cone(
    current_rho: f64,
    rho_cone: MonotoneQuantileTriplet,
    horizon_hours: f64,
) -> MonotoneQuantileTriplet {
    if !current_rho.is_finite() || current_rho <= 0.0 {
        return MonotoneQuantileTriplet {
            q05: 0.0,
            q50: 0.0,
            q95: 0.0,
        };
    }
    let dt = if horizon_hours.is_finite() {
        horizon_hours.max(0.25)
    } else {
        1.0
    };

    let drop_q05 = ((current_rho - rho_cone.q05) / dt).max(0.0020);
    let drop_q50 = ((current_rho - rho_cone.q50) / dt)
        .max(0.0012)
        .min(drop_q05);
    let drop_q95 = ((current_rho - rho_cone.q95) / dt)
        .max(0.0006)
        .min(drop_q50);

    let ttv_q05 = (current_rho / drop_q05).clamp(0.2, MAX_HORIZON_HOURS);
    let ttv_q50 = (current_rho / drop_q50).clamp(ttv_q05, MAX_HORIZON_HOURS);
    let ttv_q95 = (current_rho / drop_q95).clamp(ttv_q50, MAX_HORIZON_HOURS);

    MonotoneQuantileTriplet {
        q05: ttv_q05,
        q50: ttv_q50,
        q95: ttv_q95,
    }
}

/// Legacy API name. Returns a scenario TTV and illustrative sensitivity bounds.
/// The fixed 14% rate spread and 1.96 multiplier do not establish 95% coverage.
/// No historical EWMA/OLS fit or outcome calibration is performed here.
#[inline]
pub fn estimate_ttv_with_ci95(rho_global: f64, degradation_rate_per_hour: f64) -> (f64, f64, f64) {
    if rho_global <= 0.0 {
        // Violazione gia attiva: TTV = 0.0 ore
        return (0.0, 0.0, 0.0);
    }

    let rate = degradation_rate_per_hour.max(0.0012);
    let sigma_rate = 0.14 * rate;

    let ttv_mean = (rho_global / rate).clamp(0.5, MAX_HORIZON_HOURS);
    let rate_high = rate + 1.96 * sigma_rate;
    let rate_low = (rate - 1.96 * sigma_rate).max(0.0005);

    let ttv_ci95_low = (rho_global / rate_high).clamp(0.2, ttv_mean);
    let ttv_ci95_high = (rho_global / rate_low).clamp(ttv_mean, MAX_HORIZON_HOURS);

    (ttv_mean, ttv_ci95_low, ttv_ci95_high)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ttv_is_zero_when_rho_global_is_negative() {
        let (ttv, low, high) = estimate_ttv_with_ci95(-0.15, 0.01);
        assert_eq!(ttv, 0.0);
        assert_eq!(low, 0.0);
        assert_eq!(high, 0.0);
    }

    #[test]
    fn test_ci95_band_is_strictly_ordered() {
        for step in 1..=20 {
            let rho = step as f64 * 0.05;
            let (ttv, low, high) = estimate_ttv_with_ci95(rho, 0.012);
            assert!(low <= ttv, "Expected low ({}) <= ttv ({})", low, ttv);
            assert!(ttv <= high, "Expected ttv ({}) <= high ({})", ttv, high);
            assert!(high <= MAX_HORIZON_HOURS);
        }
    }
    #[test]
    fn scenario_range_has_documented_rate_sensitivity_and_clipping() {
        let slow = estimate_ttv_with_ci95(0.5, 0.01);
        let fast = estimate_ttv_with_ci95(0.5, 0.02);
        assert!((slow.0 - 50.0).abs() < 1e-12);
        assert!((fast.0 - 25.0).abs() < 1e-12);
        for (rho, rate) in [
            (1.0, 0.0),
            (1.0, -0.01),
            (1.0, 1e-9),
            (0.01, 10.0),
            (1.0, 0.1),
        ] {
            let (mean, lower, upper) = estimate_ttv_with_ci95(rho, rate);
            assert!(lower >= 0.2 && lower <= mean && mean <= upper && upper <= MAX_HORIZON_HOURS);
        }
        assert_eq!(estimate_ttv_with_ci95(0.0, 0.01), (0.0, 0.0, 0.0));
        // These are numerical sensitivity checks, not evidence of 95% coverage.
    }
}
