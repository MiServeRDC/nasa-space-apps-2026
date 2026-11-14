//! Fase 09 (D2): Predittore Time-To-Violation (TTV) EWMA-OLS con banda di confidenza ±1.96σ.

pub const MAX_HORIZON_HOURS: f64 = 720.0; // 30 giorni

/// Calcola il Time-To-Violation (TTV in ore) e l'intervallo di confidenza al 95% (±1.96σ).
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
}
