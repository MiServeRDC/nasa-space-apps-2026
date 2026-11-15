//! Fase 05 (C1): Meccanotrasduzione muscolo-osso, ODE RK4 di Frost-Hargens per la Sclerostina (SOST),
//! Ultrasound Muscle Quality Index (MQI) e Gait Asymmetry Index (GAI a 0.38g).

use std::cell::Cell;

use ares_core_types::constants::{
    ARED_NOMINAL_LOAD_KGF, FROST_MECHANOSTAT_STRAIN_UE, SOST_HILL_EXPONENT, sanitize_f64,
};
use ares_core_types::telemetry::Musculoskeletal;
use serde::{Deserialize, Serialize};

thread_local! {
    static LAST_BONE_EVAL: Cell<Option<(u64, u64, Musculoskeletal)>> = const { Cell::new(None) };
}

const K_PROD_SOST: f64 = 18.5; // pmol/(L * day)
const K_DEG_SOST: f64 = 0.28; // 1 / day
const ARED_TO_MICROSTRAIN: f64 = 11.2; // 125 kgf -> 1400 microstrain (> 1000 ue Frost threshold)

/// Integration horizon policy for the Frost-Hargens Sclerostin RK4 solver.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Rk4HorizonPolicy {
    /// Exact legacy compatibility: 12 steps with dt clamped to [0.2, 5.0] days (max 60 effective days).
    Bounded60DaysLegacy,
    /// Adaptive integration without the 60-day cap: N = ceil(fd / max_dt_days), dt <= max_dt_days.
    AdaptiveUnbounded { max_dt_days: f64 },
}

/// Derivata temporale d[SOST]/dt (in pmol/(L * day)) secondo il modello regolarizzato di Frost-Hargens.
#[inline]
pub fn sost_ode_rhs(sost_pmol_l: f64, ared_load_kgf: f64) -> f64 {
    let load = sanitize_f64(ared_load_kgf, 0.0).max(0.0);
    let strain_ue = ARED_TO_MICROSTRAIN * load;
    let ratio = (strain_ue / FROST_MECHANOSTAT_STRAIN_UE).powf(SOST_HILL_EXPONENT);
    let hill_suppression = 1.0 / (1.0 + ratio);
    K_PROD_SOST * hill_suppression - K_DEG_SOST * sost_pmol_l.max(0.0)
}

/// Integratore Runge-Kutta di 4° ordine (RK4) a passo fisso `dt_days` per la Sclerostina.
#[inline]
pub fn step_sclerostin_rk4(current_sost: f64, ared_load_kgf: f64, dt_days: f64) -> f64 {
    let dt = sanitize_f64(dt_days, 0.1).clamp(0.0, 5.0);
    let y0 = sanitize_f64(current_sost, 24.0).clamp(10.0, 120.0);

    let k1 = sost_ode_rhs(y0, ared_load_kgf);
    let k2 = sost_ode_rhs(y0 + 0.5 * dt * k1, ared_load_kgf);
    let k3 = sost_ode_rhs(y0 + 0.5 * dt * k2, ared_load_kgf);
    let k4 = sost_ode_rhs(y0 + dt * k3, ared_load_kgf);

    (y0 + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)).clamp(12.0, 95.0)
}

/// Stima il fattore protettivo endoteliale del secretoma muscolare (Irisina / miR-126-3p) in `[0.0, 1.0]`.
#[inline]
pub fn irisin_protective_factor(mqi_index: f64) -> f64 {
    sanitize_f64(mqi_index, 0.5).clamp(0.0, 1.0)
}

/// Calcola lo stato muscoloscheletrico completo (`Musculoskeletal`) in funzione del giorno di volo
/// (`flight_day`) e del carico giornaliero `ARED` (`ared_daily_load_kgf`).
#[inline]
pub fn compute_musculoskeletal_state(
    flight_day: u32,
    ared_daily_load_kgf: f64,
) -> Musculoskeletal {
    let day_key = u64::from(flight_day);
    let load_bits = ared_daily_load_kgf.to_bits();

    if let Some(cached) = LAST_BONE_EVAL.with(|cell| match cell.get() {
        Some((cached_day, cached_load_bits, state))
            if cached_day == day_key && cached_load_bits == load_bits =>
        {
            Some(state)
        }
        _ => None,
    }) {
        return cached;
    }

    let state = compute_musculoskeletal_state_with_policy(
        flight_day,
        ared_daily_load_kgf,
        Rk4HorizonPolicy::AdaptiveUnbounded { max_dt_days: 0.5 },
    );

    LAST_BONE_EVAL.with(|cell| {
        cell.set(Some((day_key, load_bits, state)));
    });

    state
}

/// Computes musculoskeletal state with an explicit RK4 horizon integration policy (`Bounded60DaysLegacy`
/// or `AdaptiveUnbounded`) to avoid silently capping long-duration trajectories at 60 effective days.
#[inline]
pub fn compute_musculoskeletal_state_with_policy(
    flight_day: u32,
    ared_daily_load_kgf: f64,
    policy: Rk4HorizonPolicy,
) -> Musculoskeletal {
    let load = sanitize_f64(ared_daily_load_kgf, ARED_NOMINAL_LOAD_KGF).clamp(0.0, 250.0);
    let load_deficit_ratio =
        ((ARED_NOMINAL_LOAD_KGF - load) / ARED_NOMINAL_LOAD_KGF).clamp(0.0, 1.0);
    let fd = (flight_day as f64).clamp(1.0, 1000.0);
    let exposure_factor = 1.0 - (-fd / 45.0).exp();

    // Area trasversa del soleo (% rispetto alla baseline pre-volo)
    let soleus_csa_pct = (100.0 - 28.0 * load_deficit_ratio * exposure_factor).clamp(65.0, 100.0);

    // Ecogenicita ultrasonografica mio-steatosica (scala 0..255 AU, baseline = 48 AU)
    let echo_intensity_au = (48.0 + 46.0 * load_deficit_ratio * exposure_factor).clamp(40.0, 140.0);

    // Muscle Quality Index (MQI in [0.0, 1.0], Prof. Pegreffi)
    let echo_penalty = ((echo_intensity_au - 48.0) / (110.0 - 48.0)).clamp(0.0, 1.0);
    let csa_penalty = ((100.0 - soleus_csa_pct) / (100.0 - 70.0)).clamp(0.0, 1.0);
    let mqi_index = (1.0 - 0.35 * echo_penalty - 0.65 * csa_penalty).clamp(0.15, 1.0);

    // Integrazione RK4 della Sclerostina sul tempo di missione equivalente
    let mut sost = 22.5;
    match policy {
        Rk4HorizonPolicy::Bounded60DaysLegacy => {
            let steps = 12;
            let dt = (fd / steps as f64).clamp(0.2, 5.0);
            for _ in 0..steps {
                sost = step_sclerostin_rk4(sost, load, dt);
            }
        }
        Rk4HorizonPolicy::AdaptiveUnbounded { max_dt_days } => {
            let max_dt = sanitize_f64(max_dt_days, 0.5).clamp(0.05, 1.0);
            let steps = ((fd / max_dt).ceil() as usize).max(1);
            let dt = fd / (steps as f64);
            for _ in 0..steps {
                sost = step_sclerostin_rk4(sost, load, dt);
            }
        }
    }

    // Calciuria renale secondaria al riassorbimento osseo (mg/d)
    let urinary_calcium_mg_d = (175.0 + 4.2 * (sost - 22.5).max(0.0)).clamp(140.0, 420.0);

    // Gait Asymmetry Index (GAI %) per l'atterraggio a 0.38g (Hard Safety Gate 3 se > 12%)
    let gai_pct = (3.5 + 16.5 * (1.0 - mqi_index)).clamp(2.0, 28.0);

    Musculoskeletal {
        ared_daily_load_kgf: load,
        soleus_csa_pct,
        echo_intensity_au,
        mqi_index,
        sclerostin_pmol_l: sost,
        urinary_calcium_mg_d,
        gai_pct,
    }
}

/// Integrates a time-varying daily ARED load schedule (`daily_ared_loads_kgf`) with sub-day RK4
/// substeps (`dt = 1.0 / substeps_per_day`), returning the end-of-day Sclerostin concentration
/// (`pmol/L`) for each day in the schedule.
pub fn integrate_sclerostin_schedule(
    initial_sost: f64,
    daily_ared_loads_kgf: &[f64],
    substeps_per_day: usize,
) -> Vec<f64> {
    if daily_ared_loads_kgf.is_empty() {
        return Vec::new();
    }
    let substeps = substeps_per_day.clamp(1, 24);
    let dt = 1.0 / (substeps as f64);
    let mut sost = sanitize_f64(initial_sost, 22.5).clamp(10.0, 120.0);
    let mut trajectory = Vec::with_capacity(daily_ared_loads_kgf.len());
    for &raw_load in daily_ared_loads_kgf {
        let load = sanitize_f64(raw_load, ARED_NOMINAL_LOAD_KGF).clamp(0.0, 250.0);
        for _ in 0..substeps {
            sost = step_sclerostin_rk4(sost, load, dt);
        }
        trajectory.push(sost);
    }
    trajectory
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sclerostin_rises_when_ared_load_drops_below_frost_threshold() {
        let unloaded = compute_musculoskeletal_state(90, 0.0);
        let nominal = compute_musculoskeletal_state(90, 135.0);

        assert!(
            unloaded.sclerostin_pmol_l > 55.0,
            "Expected unloaded SOST > 55 pmol/L, got {}",
            unloaded.sclerostin_pmol_l
        );
        assert!(
            nominal.sclerostin_pmol_l < 30.0,
            "Expected nominal SOST < 30 pmol/L, got {}",
            nominal.sclerostin_pmol_l
        );
        assert!(unloaded.urinary_calcium_mg_d > nominal.urinary_calcium_mg_d);
    }

    #[test]
    fn test_gai_exceeds_12_pct_under_severe_soleus_atrophy() {
        let state = compute_musculoskeletal_state(120, 0.0);
        assert!(
            state.mqi_index < 0.50,
            "Expected severe soleus atrophy MQI < 0.50, got {}",
            state.mqi_index
        );
        assert!(
            state.gai_pct > 12.0,
            "Expected Martian GAI > 12.0% to trigger Safety Gate 3, got {}",
            state.gai_pct
        );
        assert!(irisin_protective_factor(state.mqi_index) < 0.50);
    }

    #[test]
    fn test_rk4_handles_non_finite_inputs_safely() {
        let next = step_sclerostin_rk4(f64::NAN, f64::INFINITY, f64::NAN);
        assert!(next.is_finite());
        assert!((12.0..=95.0).contains(&next));
    }

    #[test]
    fn test_compute_musculoskeletal_state_cache_is_bit_identical_to_fresh_eval() {
        let cases = [(120_u32, 0.0_f64), (120_u32, 135.0_f64), (450_u32, 62.5_f64)];
        for (flight_day, load) in cases {
            let fresh = compute_musculoskeletal_state_with_policy(
                flight_day,
                load,
                Rk4HorizonPolicy::AdaptiveUnbounded { max_dt_days: 0.5 },
            );
            let first = compute_musculoskeletal_state(flight_day, load);
            let cached = compute_musculoskeletal_state(flight_day, load);

            for actual in [first, cached] {
                assert_eq!(actual.ared_daily_load_kgf.to_bits(), fresh.ared_daily_load_kgf.to_bits());
                assert_eq!(actual.soleus_csa_pct.to_bits(), fresh.soleus_csa_pct.to_bits());
                assert_eq!(actual.echo_intensity_au.to_bits(), fresh.echo_intensity_au.to_bits());
                assert_eq!(actual.mqi_index.to_bits(), fresh.mqi_index.to_bits());
                assert_eq!(actual.sclerostin_pmol_l.to_bits(), fresh.sclerostin_pmol_l.to_bits());
                assert_eq!(actual.urinary_calcium_mg_d.to_bits(), fresh.urinary_calcium_mg_d.to_bits());
                assert_eq!(actual.gai_pct.to_bits(), fresh.gai_pct.to_bits());
            }
        }
    }
}
