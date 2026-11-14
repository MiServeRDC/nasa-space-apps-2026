//! Fase 07 (C3): Osservatore Bayesiano POCUS a 2 Stadi (`Invariante Entry 002`).

use ares_core_types::constants::PRE_POCUS_MAX_THROMBUS_PROB;
use ares_core_types::telemetry::{JugularHemodynamics, Musculoskeletal};
use serde::{Deserialize, Serialize};

/// Risultato della stima Bayesiana a 2 stadi per la trombosi della vena giugulare interna.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PocusPosteriorEstimate {
    /// Legacy name: illustrative stasis score in [0,1], not a calibrated probability.
    pub stasis_probability: f64,
    pub model_validation_status: ares_core_types::telemetry::ModelValidationStatus,
    /// Legacy name: illustrative score using fixed priors/LR/clamps; not clinical probability.
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
        model_validation_status:
            ares_core_types::telemetry::ModelValidationStatus::IllustrativeUnvalidated,
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

/// Structural audit summary of `evaluate_two_stage_bayesian_pocus` across its input domain.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BayesianPocusStructuralAudit {
    pub pre_pocus_min_observed: f64,
    pub pre_pocus_max_observed: f64,
    pub pre_pocus_cap: f64,
    pub post_pocus_min_observed: f64,
    pub post_pocus_max_observed: f64,
    pub post_pocus_floor: f64,
    pub post_pocus_ceiling: f64,
    pub uncalibrated_empty_gap: (f64, f64),
    pub grid_samples_evaluated: usize,
    pub empty_gap_invariants_hold: bool,
}

/// Sweeps the admissible `(tau_w, MQI, radiation_msv_d, pocus_thrombus_confirmed)` grid to verify
/// the pre-POCUS cap (`0.45`), post-POCUS floor (`0.92`), and structurally empty gap `(0.45, 0.92)`.
pub fn audit_bayesian_pocus_structural_bounds() -> BayesianPocusStructuralAudit {
    use ares_core_types::telemetry::JugularFlowGrade;

    let tau_grid = [0.0, 0.3, 0.6, 1.0, 1.2, 1.5, 1.8, 2.5, 3.5];
    let mqi_grid = [0.0, 0.15, 0.25, 0.5, 0.75, 1.0];
    let rad_grid = [0.0, 0.45, 1.5, 3.0, 5.0, 8.0];

    let mut pre_min = f64::INFINITY;
    let mut pre_max = f64::NEG_INFINITY;
    let mut post_min = f64::INFINITY;
    let mut post_max = f64::NEG_INFINITY;
    let mut samples = 0usize;
    let mut gap_violated = false;

    for &tau_w in &tau_grid {
        for &mqi in &mqi_grid {
            for &rad in &rad_grid {
                for confirmed in [false, true] {
                    let jugular = JugularHemodynamics {
                        ijv_csa_mm2: 72.0,
                        ijv_vmax_cm_s: 6.0,
                        tau_w_dyn_cm2: tau_w,
                        flow_grade: if confirmed {
                            JugularFlowGrade::OccludedThrombus
                        } else {
                            JugularFlowGrade::StagnantBidirectional
                        },
                        pocus_thrombus_confirmed: confirmed,
                        lbnp_active: false,
                        lbnp_pressure_mmhg: 0.0,
                    };
                    let musculo = Musculoskeletal {
                        ared_daily_load_kgf: 100.0,
                        soleus_csa_pct: 85.0,
                        echo_intensity_au: 60.0,
                        mqi_index: mqi,
                        sclerostin_pmol_l: 30.0,
                        urinary_calcium_mg_d: 200.0,
                        gai_pct: 7.0,
                    };
                    let est = evaluate_two_stage_bayesian_pocus(&jugular, &musculo, rad);
                    let p = est.thrombus_posterior;
                    samples += 1;
                    if p > PRE_POCUS_MAX_THROMBUS_PROB && p < 0.92 {
                        gap_violated = true;
                    }
                    if confirmed {
                        post_min = post_min.min(p);
                        post_max = post_max.max(p);
                        if !(0.92..=0.995).contains(&p) {
                            gap_violated = true;
                        }
                    } else {
                        pre_min = pre_min.min(p);
                        pre_max = pre_max.max(p);
                        if p > PRE_POCUS_MAX_THROMBUS_PROB {
                            gap_violated = true;
                        }
                    }
                }
            }
        }
    }

    BayesianPocusStructuralAudit {
        pre_pocus_min_observed: pre_min,
        pre_pocus_max_observed: pre_max,
        pre_pocus_cap: PRE_POCUS_MAX_THROMBUS_PROB,
        post_pocus_min_observed: post_min,
        post_pocus_max_observed: post_max,
        post_pocus_floor: 0.92,
        post_pocus_ceiling: 0.995,
        uncalibrated_empty_gap: (PRE_POCUS_MAX_THROMBUS_PROB, 0.92),
        grid_samples_evaluated: samples,
        empty_gap_invariants_hold: !gap_violated,
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
