//! Fase 09 (D2): Calcolo del Mission Readiness Index (MRI %) e sintesi `NqsStlMargins`.

use crate::normalizer::compute_atomic_nqs_margins;
use crate::ttv_predictor::estimate_ttv_with_ci95;
use ares_core_types::telemetry::{
    AlertSeverity, Biometrics, JugularHemodynamics, Musculoskeletal, NqsStlMargins, SansOcular,
};

/// Calcola l'intera struttura `NqsStlMargins` e la severita clinica `AlertSeverity`.
#[inline]
pub fn evaluate_nqs_stl_and_mri(
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    sans: &SansOcular,
) -> (NqsStlMargins, AlertSeverity) {
    let rmssd = biometrics.rmssd_ms.unwrap_or(40.0);
    let (rho_tau_w, rho_ared, rho_sost, rho_rmssd, rho_sans) = compute_atomic_nqs_margins(
        jugular.tau_w_dyn_cm2,
        musculo.ared_daily_load_kgf,
        musculo.sclerostin_pmol_l,
        rmssd,
        sans.sans_risk_index,
    );

    let rho_global = rho_tau_w
        .min(rho_ared)
        .min(rho_sost)
        .min(rho_rmssd)
        .min(rho_sans);

    // Tasso orario di degrado stimato in funzione del deficit meccanico e radiologico
    let load_deficit = ((125.0 - musculo.ared_daily_load_kgf) / 125.0).clamp(0.0, 1.0);
    let rad_stress = (biometrics.radiation_dose_rate_msv_d / 5.0).clamp(0.0, 1.0);
    let degradation_rate_per_hour = 0.002 + 0.018 * load_deficit + 0.012 * rad_stress;

    let (ttv_hours, ttv_ci95_low_hours, ttv_ci95_high_hours) =
        estimate_ttv_with_ci95(rho_global, degradation_rate_per_hour);

    // Mission Readiness Index (MRI %): media pesata mappata su [0, 100]
    let weighted_rho = 0.30 * rho_tau_w
        + 0.25 * rho_ared
        + 0.15 * rho_sost
        + 0.15 * rho_rmssd
        + 0.15 * rho_sans;
    let mri_pct = ((weighted_rho + 1.0) * 50.0).clamp(5.0, 100.0);

    let severity = if jugular.pocus_thrombus_confirmed || rho_global <= -0.35 {
        AlertSeverity::CriticalEmergency
    } else if rho_global < 0.0 {
        AlertSeverity::Warning
    } else if rho_global < 0.25 || ttv_hours < 48.0 {
        AlertSeverity::Caution
    } else {
        AlertSeverity::Nominal
    };

    (
        NqsStlMargins {
            rho_tau_w,
            rho_ared,
            rho_sost,
            rho_rmssd,
            rho_sans,
            rho_global,
            ttv_hours,
            ttv_ci95_low_hours,
            ttv_ci95_high_hours,
            mri_pct,
        },
        severity,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state;
    use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
    use ares_core_types::telemetry::StressTestScenarioInput;

    fn sample_biometrics(rad_msv_d: f64) -> Biometrics {
        Biometrics {
            heart_rate_bpm: Some(68.0),
            pulse_rate_bpm: Some(67.0),
            resp_rate_brpm: Some(14.0),
            spo2_pct: Some(98.0),
            rmssd_ms: Some(46.0),
            sdnn_ms: Some(52.0),
            pnn50_pct: Some(24.0),
            lf_hf_ratio: Some(1.2),
            vocal_f0_hz: Some(118.0),
            vocal_jitter_pct: Some(0.45),
            radiation_dose_rate_msv_d: rad_msv_d,
            sqi_score: 0.94,
            missing_channels: Vec::new(),
        }
    }

    #[test]
    fn test_evaluate_nqs_stl_nominal_vs_critical() {
        let bio_nom = sample_biometrics(0.5);
        let musculo_nom = compute_musculoskeletal_state(30, 130.0);
        let scen_nom = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 30,
            ared_daily_load_kgf: 130.0,
            radiation_dose_rate_msv_d: 0.5,
            lbnp_active: true,
            lbnp_pressure_mmhg: -30.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 3.0,
        };
        let (jug_nom, sans_nom) = compute_jugular_and_sans_state(&musculo_nom, &scen_nom);
        let (margins_nom, sev_nom) =
            evaluate_nqs_stl_and_mri(&bio_nom, &musculo_nom, &jug_nom, &sans_nom);

        assert!(margins_nom.rho_global > 0.0);
        assert!(margins_nom.mri_pct > 75.0);
        assert_eq!(sev_nom, AlertSeverity::Nominal);

        // Scenario di scarico severo e trombo POCUS confermato
        let bio_crit = sample_biometrics(3.2);
        let musculo_crit = compute_musculoskeletal_state(120, 0.0);
        let scen_crit = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 120,
            ared_daily_load_kgf: 0.0,
            radiation_dose_rate_msv_d: 3.2,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: true,
            systolic_bp_drop_mmhg: 5.0,
        };
        let (jug_crit, sans_crit) = compute_jugular_and_sans_state(&musculo_crit, &scen_crit);
        let (margins_crit, sev_crit) =
            evaluate_nqs_stl_and_mri(&bio_crit, &musculo_crit, &jug_crit, &sans_crit);

        assert!(margins_crit.rho_global < 0.0);
        assert_eq!(margins_crit.ttv_hours, 0.0);
        assert_eq!(sev_crit, AlertSeverity::CriticalEmergency);
    }
}
