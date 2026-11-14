//! Full assessments require valid HRV; known non-HRV hazards remain visible.

use crate::normalizer::compute_atomic_nqs_margins;
use crate::ttv_predictor::estimate_ttv_with_ci95;
use ares_core_types::telemetry::{
    AlertSeverity, Biometrics, JugularHemodynamics, Musculoskeletal, NqsStlMargins, SansOcular,
};

/// Missing/invalid RMSSD cannot yield a complete composite or forecast.
pub fn evaluate_nqs_stl_and_mri(
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    sans: &SansOcular,
) -> (NqsStlMargins, AlertSeverity) {
    let (rho_tau_w, rho_ared, rho_sost, rho_rmssd, rho_sans) = compute_atomic_nqs_margins(
        jugular.tau_w_dyn_cm2,
        musculo.ared_daily_load_kgf,
        musculo.sclerostin_pmol_l,
        biometrics.rmssd_ms,
        sans.sans_risk_index,
    );
    let known_min = rho_tau_w.min(rho_ared).min(rho_sost).min(rho_sans);
    let rho_global = rho_rmssd.map(|rho| known_min.min(rho));

    // Existing scenario model; its uncertainty is not clinically calibrated (#12).
    let load_deficit = ((125.0 - musculo.ared_daily_load_kgf) / 125.0).clamp(0.0, 1.0);
    let rad_stress = (biometrics.radiation_dose_rate_msv_d / 5.0).clamp(0.0, 1.0);
    let degradation_rate_per_hour = 0.002 + 0.018 * load_deficit + 0.012 * rad_stress;
    let forecast = rho_global.map(|rho| estimate_ttv_with_ci95(rho, degradation_rate_per_hour));
    let ttv_hours = forecast.map(|(mean, _, _)| mean);
    let ttv_ci95_low_hours = forecast.map(|(_, low, _)| low);
    let ttv_ci95_high_hours = forecast.map(|(_, _, high)| high);
    let mri_pct = rho_rmssd.map(|rho| {
        let weighted =
            0.30 * rho_tau_w + 0.25 * rho_ared + 0.15 * rho_sost + 0.15 * rho + 0.15 * rho_sans;
        ((weighted + 1.0) * 50.0).clamp(5.0, 100.0)
    });

    // A partial assessment must not hide a known warning or emergency.
    let evaluated_min = rho_rmssd.map_or(known_min, |rho| known_min.min(rho));
    let severity = if jugular.pocus_thrombus_confirmed || evaluated_min <= -0.35 {
        AlertSeverity::CriticalEmergency
    } else if evaluated_min < 0.0 {
        AlertSeverity::Warning
    } else if rho_rmssd.is_none() {
        AlertSeverity::DataDegradedMissingChannels
    } else if evaluated_min < 0.25 || ttv_hours.is_some_and(|hours| hours < 48.0) {
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
            ttv_interval_kind: forecast
                .map(|_| ares_core_types::telemetry::TtvIntervalKind::IllustrativeScenarioRange),
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
            hrv_unavailable_reason: None,
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

        assert!(margins_nom.rho_global.is_some_and(|rho| rho > 0.0));
        assert!(margins_nom.mri_pct.is_some_and(|mri| mri > 75.0));
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

        assert!(margins_crit.rho_global.is_some_and(|rho| rho < 0.0));
        assert_eq!(margins_crit.ttv_hours, Some(0.0));
        assert_eq!(sev_crit, AlertSeverity::CriticalEmergency);
    }
    fn evaluate_hrv_input(
        rmssd: Option<f64>,
        tau: f64,
        confirmed: bool,
    ) -> (NqsStlMargins, AlertSeverity) {
        let mut bio = sample_biometrics(0.5);
        bio.rmssd_ms = rmssd;
        let musculo = compute_musculoskeletal_state(30, 130.0);
        let scenario = StressTestScenarioInput {
            source_record_id: "bidmc_01".into(),
            flight_day: 30,
            ared_daily_load_kgf: 130.0,
            radiation_dose_rate_msv_d: 0.5,
            lbnp_active: true,
            lbnp_pressure_mmhg: -30.0,
            pocus_thrombus_confirmed: confirmed,
            systolic_bp_drop_mmhg: 3.0,
        };
        let (mut jugular, sans) = compute_jugular_and_sans_state(&musculo, &scenario);
        jugular.tau_w_dyn_cm2 = tau;
        evaluate_nqs_stl_and_mri(&bio, &musculo, &jugular, &sans)
    }

    #[test]
    fn missing_and_invalid_hrv_never_produce_complete_assessments() {
        for input in [
            None,
            Some(f64::NAN),
            Some(f64::INFINITY),
            Some(f64::NEG_INFINITY),
            Some(0.0),
            Some(-1.0),
        ] {
            let (margins, severity) = evaluate_hrv_input(input, 2.8, false);
            assert_eq!(margins.rho_rmssd, None);
            assert_eq!(margins.rho_global, None);
            assert_eq!(margins.mri_pct, None);
            assert_eq!(margins.ttv_hours, None);
            assert_eq!(margins.ttv_ci95_low_hours, None);
            assert_eq!(margins.ttv_ci95_high_hours, None);
            assert_eq!(severity, AlertSeverity::DataDegradedMissingChannels);
            assert!(!margins.has_known_violation());
        }
    }

    #[test]
    fn known_hazards_are_not_hidden_by_missing_hrv() {
        let (warning, severity) = evaluate_hrv_input(None, 0.8, false);
        assert!(warning.has_known_violation());
        assert_eq!(warning.rho_global, None);
        assert_eq!(severity, AlertSeverity::Warning);
        let (_, severity) = evaluate_hrv_input(None, 0.1, false);
        assert_eq!(severity, AlertSeverity::CriticalEmergency);
        let (_, severity) = evaluate_hrv_input(None, 2.8, true);
        assert_eq!(severity, AlertSeverity::CriticalEmergency);
    }
}
