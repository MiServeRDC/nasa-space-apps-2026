//! Phase 08 (D1): Dimensionless NQS-STL normalizer (Invariant Entry 004).

use ares_core_types::constants::{
    ARED_CRITICAL_LOAD_KGF, ARED_NOMINAL_LOAD_KGF, RMSSD_CRITICAL_MS, RMSSD_NOMINAL_MS,
    SANS_CRITICAL_INDEX, SANS_NOMINAL_INDEX, SOST_CRITICAL_PMOL_L, SOST_NOMINAL_PMOL_L,
    TAU_W_CRITICAL_DYN_CM2, TAU_W_NOMINAL_DYN_CM2, sanitize_f64,
};

/// Safety direction of the physiological predicate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PredicatePolarity {
    /// Higher values are safer (e.g. tau_w, ARED load, RMSSD, MQI).
    HigherIsSafer,
    /// Lower values are safer (e.g. Sclerostin SOST, SANS Risk, Radiation Dose).
    LowerIsSafer,
}

/// Normalizes an atomic predicate x(t) into the dimensionless NQS-STL quantitative semantics:
/// +1.0 = nominal baseline, 0.0 = critical threshold, < 0.0 = active violation.
#[inline]
pub fn normalize_predicate_nqs(
    value: f64,
    nominal: f64,
    critical: f64,
    polarity: PredicatePolarity,
) -> f64 {
    let x = sanitize_f64(value, critical);
    let denom = (nominal - critical).abs().max(1e-6);
    let sign = match polarity {
        PredicatePolarity::HigherIsSafer => 1.0,
        PredicatePolarity::LowerIsSafer => -1.0,
    };
    (sign * (x - critical) / denom).clamp(-2.0, 1.0)
}

/// Computes the 5 instantaneous atomic NQS-STL margins.
#[inline]
pub fn compute_atomic_nqs_margins(
    tau_w_dyn_cm2: f64,
    ared_load_kgf: f64,
    sost_pmol_l: f64,
    rmssd_ms: Option<f64>,
    sans_risk_index: f64,
) -> (f64, f64, f64, Option<f64>, f64) {
    let rho_tau_w = normalize_predicate_nqs(
        tau_w_dyn_cm2,
        TAU_W_NOMINAL_DYN_CM2,
        TAU_W_CRITICAL_DYN_CM2,
        PredicatePolarity::HigherIsSafer,
    );
    let rho_ared = normalize_predicate_nqs(
        ared_load_kgf,
        ARED_NOMINAL_LOAD_KGF,
        ARED_CRITICAL_LOAD_KGF,
        PredicatePolarity::HigherIsSafer,
    );
    let rho_sost = normalize_predicate_nqs(
        sost_pmol_l,
        SOST_NOMINAL_PMOL_L,
        SOST_CRITICAL_PMOL_L,
        PredicatePolarity::LowerIsSafer,
    );
    let rho_rmssd = rmssd_ms.filter(|x| x.is_finite() && *x > 0.0).map(|value| {
        normalize_predicate_nqs(
            value,
            RMSSD_NOMINAL_MS,
            RMSSD_CRITICAL_MS,
            PredicatePolarity::HigherIsSafer,
        )
    });
    let rho_sans = normalize_predicate_nqs(
        sans_risk_index,
        SANS_NOMINAL_INDEX,
        SANS_CRITICAL_INDEX,
        PredicatePolarity::LowerIsSafer,
    );

    (rho_tau_w, rho_ared, rho_sost, rho_rmssd, rho_sans)
}

/// Normalizes the renal margin rho_renal from the calcium oxalate RSR index (Nominal <= 1.5, Critical >= 4.5).
#[inline]
pub fn normalize_renal_rsr_margin(rsr: f64) -> f64 {
    normalize_predicate_nqs(rsr, 1.50, 4.50, PredicatePolarity::LowerIsSafer)
}

/// Normalizes the orthostatic margin rho_orthostatic from the Shock Index (Nominal = 0.65, Critical >= 1.20).
#[inline]
pub fn normalize_orthostatic_margin(shock_index: f64) -> f64 {
    normalize_predicate_nqs(shock_index, 0.65, 1.20, PredicatePolarity::LowerIsSafer)
}

/// Normalizes the circadian-cognitive margin rho_circadian from the PVT-B lapse probability (Nominal = 0.05, Critical >= 0.65).
#[inline]
pub fn normalize_circadian_margin(pvt_lapse_probability: f64) -> f64 {
    normalize_predicate_nqs(pvt_lapse_probability, 0.05, 0.65, PredicatePolarity::LowerIsSafer)
}

/// Normalizes the immune margin rho_immune from the viral reactivation risk % (Nominal <= 20%, Critical >= 75%).
#[inline]
pub fn normalize_immune_margin(viral_risk_pct: f64) -> f64 {
    normalize_predicate_nqs(viral_risk_pct, 20.0, 75.0, PredicatePolarity::LowerIsSafer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nqs_normalization_maps_nominal_to_plus_one_and_critical_to_zero() {
        let rho_nom = normalize_predicate_nqs(
            2.80,
            TAU_W_NOMINAL_DYN_CM2,
            TAU_W_CRITICAL_DYN_CM2,
            PredicatePolarity::HigherIsSafer,
        );
        let rho_crit = normalize_predicate_nqs(
            1.20,
            TAU_W_NOMINAL_DYN_CM2,
            TAU_W_CRITICAL_DYN_CM2,
            PredicatePolarity::HigherIsSafer,
        );
        let rho_viol = normalize_predicate_nqs(
            0.80,
            TAU_W_NOMINAL_DYN_CM2,
            TAU_W_CRITICAL_DYN_CM2,
            PredicatePolarity::HigherIsSafer,
        );

        assert!((rho_nom - 1.0).abs() < 1e-12);
        assert!(rho_crit.abs() < 1e-12);
        assert!((rho_viol - (-0.25)).abs() < 1e-12);
    }

    #[test]
    fn test_atomic_nqs_margins_eliminate_scale_dominance() {
        let (r_tau, r_ared, r_sost, r_rmssd, r_sans) =
            compute_atomic_nqs_margins(2.80, 125.0, 24.0, Some(48.0), 0.15);
        assert!((r_tau - 1.0).abs() < 1e-12);
        assert!((r_ared - 1.0).abs() < 1e-12);
        assert!((r_sost - 1.0).abs() < 1e-12);
        assert!((r_rmssd.unwrap() - 1.0).abs() < 1e-12);
        assert!((r_sans - 1.0).abs() < 1e-12);
    }
}
