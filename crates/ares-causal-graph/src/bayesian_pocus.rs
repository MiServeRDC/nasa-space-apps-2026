//! Fase 07 (C3): Osservatore Bayesiano POCUS a 2 Stadi (`Invariante Entry 002`).

use ares_core_types::constants::PRE_POCUS_MAX_THROMBUS_PROB;
use ares_core_types::telemetry::{JugularHemodynamics, Musculoskeletal};
use serde::{Deserialize, Serialize};

/// Risultato della stima Bayesiana a 2 stadi per la trombosi della vena giugulare interna.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PocusPosteriorEstimate {
    /// Probabilita di stasi venosa severa (Stadio 1, in [0.0, 1.0]).
    pub stasis_probability: f64,
    /// Probabilita a posteriori di trombo endoluminale (limitata a <= 0.45 senza POCUS, >= 0.92 con POCUS+).
    pub thrombus_posterior: f64,
    /// Indica se e richiesta un'ispezione ecografica POCUS immediata.
    pub pocus_inspection_required: bool,
}

/// Calcola la stima Bayesiana a 2 stadi (Invariante Entry 002).
#[inline]
pub fn evaluate_two_stage_bayesian_pocus(
    jugular: &JugularHemodynamics,
    musculo: &Musculoskeletal,
    radiation_msv_d: f64,
) -> PocusPosteriorEstimate {
    let shear_deficit = ((1.8 - jugular.tau_w_dyn_cm2) / 1.2).clamp(0.0, 1.0);
    let secretome_deficit = (1.0 - musculo.mqi_index).clamp(0.0, 1.0);
    let rad_factor = (radiation_msv_d / 5.0).clamp(0.0, 1.0);

    let stasis_probability =
        (0.55 * shear_deficit + 0.30 * secretome_deficit + 0.15 * rad_factor).clamp(0.02, 0.99);

    // Stadio 1: Prior emodinamico pre-POCUS (rigorosamente <= 0.45 in assenza di conferma B-mode)
    let pre_pocus_prior = (0.42 * stasis_probability).min(PRE_POCUS_MAX_THROMBUS_PROB);

    // Stadio 2: Aggiornamento Bayesiano con Likelihood Ratio ecografico (LR+ = 24.0)
    let thrombus_posterior = if jugular.pocus_thrombus_confirmed {
        let prior_odds = pre_pocus_prior.max(0.35) / (1.0 - pre_pocus_prior.max(0.35));
        let post_odds = prior_odds * 24.0;
        (post_odds / (1.0 + post_odds)).clamp(0.92, 0.995)
    } else {
        pre_pocus_prior
    };

    PocusPosteriorEstimate {
        stasis_probability,
        thrombus_posterior,
        pocus_inspection_required: stasis_probability >= 0.50 && !jugular.pocus_thrombus_confirmed,
    }
}

/// Osservatore Bayesiano a 2 stadi per la stratificazione clinica tra stasi giugulare e trombo occlusivo.
#[derive(Debug, Default, Clone, Copy)]
pub struct BayesianPocusObserver;

impl BayesianPocusObserver {
    #[inline]
    pub fn new() -> Self {
        Self
    }

    #[inline]
    pub fn evaluate(
        &self,
        jugular: &JugularHemodynamics,
        musculo: &Musculoskeletal,
        radiation_msv_d: f64,
    ) -> PocusPosteriorEstimate {
        evaluate_two_stage_bayesian_pocus(jugular, musculo, radiation_msv_d)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::telemetry::JugularFlowGrade;

    fn sample_musculo_severe() -> Musculoskeletal {
        Musculoskeletal {
            ared_daily_load_kgf: 0.0,
            soleus_csa_pct: 72.0,
            echo_intensity_au: 92.0,
            mqi_index: 0.25,
            sclerostin_pmol_l: 64.0,
            urinary_calcium_mg_d: 340.0,
            gai_pct: 15.8,
        }
    }

    #[test]
    fn test_bayesian_pocus_stage1_caps_at_045_without_ultrasound() {
        let musculo = sample_musculo_severe();
        let jugular = JugularHemodynamics {
            ijv_csa_mm2: 95.0,
            ijv_vmax_cm_s: 3.8,
            tau_w_dyn_cm2: 0.40,
            flow_grade: JugularFlowGrade::StagnantBidirectional,
            pocus_thrombus_confirmed: false,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
        };

        let est = evaluate_two_stage_bayesian_pocus(&jugular, &musculo, 4.5);
        assert!(
            est.thrombus_posterior <= 0.45,
            "Expected Stage-1 pre-POCUS thrombus posterior <= 0.45, got {}",
            est.thrombus_posterior
        );
        assert!(est.pocus_inspection_required);
    }

    #[test]
    fn test_bayesian_pocus_stage2_exceeds_092_with_confirmed_thrombus() {
        let musculo = sample_musculo_severe();
        let jugular = JugularHemodynamics {
            ijv_csa_mm2: 95.0,
            ijv_vmax_cm_s: 2.5,
            tau_w_dyn_cm2: 0.40,
            flow_grade: JugularFlowGrade::OccludedThrombus,
            pocus_thrombus_confirmed: true,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
        };

        let observer = BayesianPocusObserver::new();
        let est = observer.evaluate(&jugular, &musculo, 3.0);
        assert!(
            est.thrombus_posterior >= 0.92,
            "Expected Stage-2 post-POCUS thrombus posterior >= 0.92, got {}",
            est.thrombus_posterior
        );
        assert!(!est.pocus_inspection_required);
    }
}
