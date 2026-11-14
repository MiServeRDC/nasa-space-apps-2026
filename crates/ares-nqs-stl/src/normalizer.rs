//! Fase 08 (D1): Normalizzatore adimensionale NQS-STL (Invariante Entry 004).

use ares_core_types::constants::{
    ARED_CRITICAL_LOAD_KGF, ARED_NOMINAL_LOAD_KGF, RMSSD_CRITICAL_MS, RMSSD_NOMINAL_MS,
    SANS_CRITICAL_INDEX, SANS_NOMINAL_INDEX, SOST_CRITICAL_PMOL_L, SOST_NOMINAL_PMOL_L,
    TAU_W_CRITICAL_DYN_CM2, TAU_W_NOMINAL_DYN_CM2, sanitize_f64,
};

/// Direzione di sicurezza del predicato fisiologico.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PredicatePolarity {
    /// Valori piu alti sono piu sicuri (es. tau_w, ARED load, RMSSD, MQI).
    HigherIsSafer,
    /// Valori piu bassi sono piu sicuri (es. Sclerostina SOST, SANS Risk, Dose Radiazioni).
    LowerIsSafer,
}

/// Normalizza un predicato atomico x(t) nella semantica quantitativa adimensionale NQS-STL:
/// +1.0 = baseline nominale, 0.0 = soglia critica, < 0.0 = violazione attiva.
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

/// Calcola i 5 margini atomici NQS-STL istantanei senza mai sostituire `rmssd_ms: None` con proxy.
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
        assert!(r_rmssd.is_some_and(|v| (v - 1.0).abs() < 1e-12));
        assert!((r_sans - 1.0).abs() < 1e-12);

        let (_, _, _, r_none, _) = compute_atomic_nqs_margins(2.80, 125.0, 24.0, None, 0.15);
        assert_eq!(r_none, None);
    }
}
