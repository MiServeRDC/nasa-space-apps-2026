//! Modulo circadiano a due processi (S+C) su Sol marziano (24.66h), debito di sonno,
//! fototerapia melanopica e probabilita di lapse psicomotorio PVT-B (Gap 3).

use ares_core_types::constants::{
    MARS_SOL_SECONDS, MELANOPIC_LUX_THERAPY_MIN, sanitize_f64,
};
use ares_core_types::telemetry::{MarsCircadianSleep, ModelValidationStatus, SpotPoctPanel};
use std::f64::consts::PI;

/// Compact circadian and cognitive fatigue state for BMed behavioral coupling.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CircadianCognitiveState {
    pub sleep_debt_hours: f64,
    pub cognitive_fatigue_index: f64,
    pub pvt_lapse_probability: f64,
    pub cognitive_readiness_score: f64,
    pub melanopic_light_therapy_active: bool,
    pub validation_status: ModelValidationStatus,
}

impl From<&MarsCircadianSleep> for CircadianCognitiveState {
    fn from(sleep: &MarsCircadianSleep) -> Self {
        Self {
            sleep_debt_hours: sleep.sleep_debt_hours,
            cognitive_fatigue_index: (1.0 - sleep.cognitive_readiness_score).clamp(0.0, 1.0),
            pvt_lapse_probability: sleep.pvt_lapse_probability,
            cognitive_readiness_score: sleep.cognitive_readiness_score,
            melanopic_light_therapy_active: sleep.melanopic_light_therapy_active,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

/// Periodo circadiano intrinseco endogeno umano medio in ore (Czeisler et al. 1999 Science).
pub const TAO_ENDO_HOURS: f64 = 24.18;

/// Costanti di tempo per accumulo (veglia) e dissipazione (sonno) della pressione omeostatica S (ore).
pub const TAU_WAKE_HOURS: f64 = 18.2;
pub const TAU_SLEEP_HOURS: f64 = 4.2;

/// Stato interno completo dell'oscillatore circadiano e della pressione omeostatica.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MarsCircadianOscillator {
    pub homeostatic_s: f64,
    pub circadian_phase_rad: f64,
    pub cumulative_sleep_debt_hours: f64,
}

impl Default for MarsCircadianOscillator {
    fn default() -> Self {
        Self {
            homeostatic_s: 0.20,
            circadian_phase_rad: 0.0,
            cumulative_sleep_debt_hours: 0.0,
        }
    }
}

impl MarsCircadianOscillator {
    /// Esegue uno step di avanzamento temporale dt_hours sul Sol marziano.
    pub fn step_state(
        &mut self,
        dt_hours: f64,
        is_sleeping: bool,
        sleep_quality: f64,
        melanopic_edi_lux: f64,
    ) {
        let dt = sanitize_f64(dt_hours, 0.05).clamp(0.0001, 12.0);
        let lux = sanitize_f64(melanopic_edi_lux, 0.0).max(0.0);

        // Processo S: pressione omeostatica
        if is_sleeping {
            let eta = sanitize_f64(sleep_quality, 0.85).clamp(0.30, 1.0);
            self.homeostatic_s = (self.homeostatic_s * (-dt * eta / TAU_SLEEP_HOURS).exp()).clamp(0.05, 1.0);
            self.cumulative_sleep_debt_hours = (self.cumulative_sleep_debt_hours - dt * 0.5).max(0.0);
        } else {
            self.homeostatic_s = (1.0 - (1.0 - self.homeostatic_s) * (-dt / TAU_WAKE_HOURS).exp()).clamp(0.0, 1.0);
            if dt > 0.5 {
                self.cumulative_sleep_debt_hours = (self.cumulative_sleep_debt_hours + dt * 0.05).clamp(0.0, 24.0);
            }
        }

        // Processo C: velocita angolare endogena + modulazione PRC da luce melanopica
        let omega_endo = (2.0 * PI) / TAO_ENDO_HOURS;
        let prc = self.circadian_phase_rad.sin();
        let light_drive = 0.085 * prc * (1.0 + lux / 50.0).ln();
        let d_phi = (omega_endo + light_drive) * dt;
        self.circadian_phase_rad = (self.circadian_phase_rad + d_phi).rem_euclid(2.0 * PI);
    }

    /// Calcola la frazione di Sol marziano corrente [0.0, 1.0).
    #[inline]
    pub fn compute_mars_sol_fraction(mission_elapsed_s: f64) -> f64 {
        let elapsed = sanitize_f64(mission_elapsed_s, 0.0).max(0.0);
        (elapsed % MARS_SOL_SECONDS) / MARS_SOL_SECONDS
    }

    /// Calcola il disallineamento di fase (in radianti) rispetto al ciclo solare marziano.
    #[inline]
    pub fn compute_phase_misalignment(&self, mission_elapsed_s: f64) -> f64 {
        let sol_frac = Self::compute_mars_sol_fraction(mission_elapsed_s);
        let mars_solar_angle = sol_frac * 2.0 * PI;
        let delta = (self.circadian_phase_rad - mars_solar_angle).sin().atan2(
            (self.circadian_phase_rad - mars_solar_angle).cos(),
        );
        delta.abs()
    }

    /// Valuta il termine circadiano armonico C(t) in [-1.0, 1.0].
    #[inline]
    pub fn evaluate_circadian_process_c(&self) -> f64 {
        let phi = self.circadian_phase_rad;
        (0.88 * (phi - 0.78).cos() + 0.12 * (2.0 * phi - 1.25).cos()).clamp(-1.0, 1.0)
    }

    /// Calcola la probabilita di lapse psicomotorio PVT-B (Dinges & Basner 2011) in [0.0, 1.0].
    #[inline]
    pub fn compute_pvt_lapse_probability(
        &self,
        vocal_jitter_pct: Option<f64>,
        poct: Option<&SpotPoctPanel>,
    ) -> f64 {
        let c = self.evaluate_circadian_process_c();
        let circadian_vulnerability = (1.0 - c) / 2.0;
        let sleep_debt_factor = (self.cumulative_sleep_debt_hours / 12.0).clamp(0.0, 1.0);

        let mut p_lapse = 0.45 * self.homeostatic_s + 0.35 * circadian_vulnerability + 0.20 * sleep_debt_factor;

        if let Some(jitter) = vocal_jitter_pct
            && jitter.is_finite() && jitter > 0.65
        {
            p_lapse += 0.12;
        }

        if let Some(panel) = poct
            && let Some(lapses) = panel.pvt_lapses_count
        {
            p_lapse = (p_lapse * 0.60 + (f64::from(lapses) * 0.08).min(0.40)).min(1.0);
        }

        p_lapse.clamp(0.02, 0.98)
    }

    /// Genera la telemetria completa `MarsCircadianSleep`.
    pub fn evaluate_state(
        &self,
        mission_elapsed_s: f64,
        melanopic_edi_lux: Option<f64>,
        vocal_jitter_pct: Option<f64>,
        poct: Option<&SpotPoctPanel>,
    ) -> MarsCircadianSleep {
        let sol_frac = Self::compute_mars_sol_fraction(mission_elapsed_s);
        let c = self.evaluate_circadian_process_c();
        let pvt_prob = self.compute_pvt_lapse_probability(vocal_jitter_pct, poct);
        let cognitive_readiness = (1.0 - pvt_prob).clamp(0.02, 1.0);
        let lux = melanopic_edi_lux.unwrap_or(0.0);
        let therapy_active = lux >= MELANOPIC_LUX_THERAPY_MIN;

        MarsCircadianSleep {
            mars_sol_fraction: sol_frac,
            homeostatic_sleep_pressure_s: self.homeostatic_s,
            circadian_phase_c: c,
            sleep_debt_hours: self.cumulative_sleep_debt_hours,
            pvt_lapse_probability: pvt_prob,
            cognitive_readiness_score: cognitive_readiness,
            melanopic_light_therapy_active: therapy_active,
        }
    }

    /// Evaluates a compact `CircadianCognitiveState` for downstream BMed behavioral coupling.
    pub fn evaluate_cognitive_state(
        &self,
        mission_elapsed_s: f64,
        melanopic_edi_lux: Option<f64>,
        vocal_jitter_pct: Option<f64>,
        poct: Option<&SpotPoctPanel>,
    ) -> CircadianCognitiveState {
        let sleep = self.evaluate_state(mission_elapsed_s, melanopic_edi_lux, vocal_jitter_pct, poct);
        CircadianCognitiveState::from(&sleep)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circadian_oscillator_step_and_pvt_lapse() {
        let mut osc = MarsCircadianOscillator::default();
        assert!((osc.homeostatic_s - 0.20).abs() < 1e-6);

        // Advance 16 hours of wakefulness
        osc.step_state(16.0, false, 0.0, 20.0);
        assert!(osc.homeostatic_s > 0.50);

        let sleep_eval = osc.evaluate_state(120_000.0, Some(500.0), Some(0.45), None);
        assert!(sleep_eval.melanopic_light_therapy_active);
        assert!(sleep_eval.cognitive_readiness_score > 0.0);

        let cog_state = osc.evaluate_cognitive_state(120_000.0, Some(500.0), Some(0.45), None);
        assert_eq!(cog_state.validation_status, ModelValidationStatus::IllustrativeUnvalidated);
        assert!((cog_state.sleep_debt_hours - sleep_eval.sleep_debt_hours).abs() < 1e-9);
        assert!((cog_state.cognitive_fatigue_index - (1.0 - sleep_eval.cognitive_readiness_score)).abs() < 1e-9);
    }
}
