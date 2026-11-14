//! Fase 06 (C2): Emodinamica venosa giugulare dimensionalmente esatta (tau_w in dyn/cm^2),
//! curva dose-risposta della camera LBNP e indice translaminare SANS.

use ares_core_types::constants::{BLOOD_VISCOSITY_POISE, sanitize_f64};
use ares_core_types::telemetry::{
    JugularFlowGrade, JugularHemodynamics, Musculoskeletal, SansOcular, StressTestScenarioInput,
};
use std::f64::consts::PI;

/// Calcola lo shear stress di parete della vena giugulare interna (in dyn/cm^2):
/// tau_w = 2 * mu * v_max * sqrt(pi / CSA_cm2).
#[inline]
pub fn compute_tau_w_dyn_cm2(vmax_cm_s: f64, ijv_csa_mm2: f64) -> f64 {
    let vmax = sanitize_f64(vmax_cm_s, 0.0).max(0.0);
    let csa_mm2 = sanitize_f64(ijv_csa_mm2, 50.0).max(5.0);
    let csa_cm2 = csa_mm2 / 100.0;
    2.0 * BLOOD_VISCOSITY_POISE * vmax * (PI / csa_cm2).sqrt()
}

/// Calcola lo stato emodinamico giugulare (`JugularHemodynamics`) e oculare (`SansOcular`).
#[inline]
pub fn compute_jugular_and_sans_state(
    musculo: &Musculoskeletal,
    scenario: &StressTestScenarioInput,
) -> (JugularHemodynamics, SansOcular) {
    let lbnp_mag = if scenario.lbnp_active {
        sanitize_f64(scenario.lbnp_pressure_mmhg.abs(), 30.0).clamp(0.0, 45.0)
    } else {
        0.0
    };
    let lbnp_norm = (lbnp_mag / 30.0).clamp(0.0, 1.2);
    let rad_stress = (scenario.radiation_dose_rate_msv_d / 5.0).clamp(0.0, 1.0);

    // Area trasversa IJV (mm^2): dilatazione in microgravita contrastata da MQI soleo e LBNP
    let ijv_csa_mm2 =
        (96.0 * (1.0 - 0.28 * musculo.mqi_index - 0.34 * lbnp_norm + 0.08 * rad_stress))
            .clamp(32.0, 118.0);

    // Velocita di picco IJV (cm/s): sostenuta da pompa crurale MQI e gradiente idrostatico LBNP
    let ijv_vmax_cm_s = (3.2 + 9.8 * musculo.mqi_index + 7.4 * lbnp_norm - 1.8 * rad_stress)
        .clamp(1.5, 24.0);

    let tau_w_dyn_cm2 = compute_tau_w_dyn_cm2(ijv_vmax_cm_s, ijv_csa_mm2);

    let flow_grade = if scenario.pocus_thrombus_confirmed {
        JugularFlowGrade::OccludedThrombus
    } else if ijv_vmax_cm_s < 3.5 {
        JugularFlowGrade::Retrograde
    } else if ijv_vmax_cm_s < 6.0 || tau_w_dyn_cm2 < 1.20 {
        JugularFlowGrade::StagnantBidirectional
    } else if ijv_vmax_cm_s < 11.0 {
        JugularFlowGrade::PulsatileReduced
    } else {
        JugularFlowGrade::NormalContinuous
    };

    let jugular = JugularHemodynamics {
        ijv_csa_mm2,
        ijv_vmax_cm_s,
        tau_w_dyn_cm2,
        flow_grade,
        pocus_thrombus_confirmed: scenario.pocus_thrombus_confirmed,
        lbnp_active: scenario.lbnp_active,
        lbnp_pressure_mmhg: if scenario.lbnp_active { -lbnp_mag } else { 0.0 },
    };

    // Calcolo biomarcatori SANS (congestione venosa cefalica -> aumento ONSD e spessore coroideale)
    let venous_congestion = ((ijv_csa_mm2 - 38.0) / 62.0).clamp(0.0, 1.0);
    let onsd_mm = (5.05 + 1.35 * venous_congestion).clamp(4.8, 6.8);
    let choroidal_delta_um = (12.0 + 58.0 * venous_congestion).clamp(5.0, 85.0);
    let sans_risk_index = (0.45 * ((onsd_mm - 5.0) / 1.4)
        + 0.35 * (choroidal_delta_um / 70.0)
        + 0.20 * venous_congestion)
        .clamp(0.05, 0.98);

    let sans = SansOcular {
        onsd_mm,
        choroidal_delta_um,
        sans_risk_index,
    };

    (jugular, sans)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mechanotransduction::compute_musculoskeletal_state;

    #[test]
    fn test_tau_w_dimensional_accuracy() {
        // r = 0.5 cm => CSA = pi * 0.25 = 0.78539816 cm^2 = 78.539816 mm^2
        // tau_w = 2 * 0.035 * 10.0 / 0.5 = 1.40 dyn/cm^2
        let tau_w = compute_tau_w_dyn_cm2(10.0, 78.53981633974483);
        assert!(
            (tau_w - 1.40).abs() < 1e-3,
            "Expected tau_w = 1.40 dyn/cm^2, got {}",
            tau_w
        );
    }

    #[test]
    fn test_lbnp_activation_restores_tau_w_above_critical_threshold() {
        let musculo = compute_musculoskeletal_state(120, 0.0);
        let base_scenario = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 120,
            ared_daily_load_kgf: 0.0,
            radiation_dose_rate_msv_d: 2.5,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 4.0,
        };
        let (jugular_no_lbnp, sans_no_lbnp) =
            compute_jugular_and_sans_state(&musculo, &base_scenario);
        assert!(
            jugular_no_lbnp.tau_w_dyn_cm2 < 1.20,
            "Expected critical stasis tau_w < 1.20 without LBNP, got {}",
            jugular_no_lbnp.tau_w_dyn_cm2
        );

        let mut lbnp_scenario = base_scenario;
        lbnp_scenario.lbnp_active = true;
        lbnp_scenario.lbnp_pressure_mmhg = -30.0;

        let (jugular_with_lbnp, sans_with_lbnp) =
            compute_jugular_and_sans_state(&musculo, &lbnp_scenario);
        assert!(jugular_with_lbnp.ijv_csa_mm2 < jugular_no_lbnp.ijv_csa_mm2);
        assert!(
            jugular_with_lbnp.tau_w_dyn_cm2 > 1.20,
            "Expected LBNP -30 mmHg to restore tau_w > 1.20 dyn/cm^2, got {}",
            jugular_with_lbnp.tau_w_dyn_cm2
        );
        assert!(sans_with_lbnp.sans_risk_index < sans_no_lbnp.sans_risk_index);
    }
}
