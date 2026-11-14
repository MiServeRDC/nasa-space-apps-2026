//! Modulo di disregolazione neuro-endocrina e rischio riattivazione virale (VZV / EBV / CMV) in volo spaziale (Gap 4).

use ares_core_types::telemetry::{NeuroImmuneViral, SpotPoctPanel};

/// Stato di immunocompetenza dell'astronauta.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImmuneReactivationStage {
    LatentDormant,
    AllodynamicVulnerability,
    SubclinicalSheddingLikely,
    ActiveReactivationClinical,
}

/// Calcola l'indice di stress neuro-endocrino composito (0.0..1.0)
/// integrando cortisolo, prelievi POCT ed espressione vagale HRV.
#[inline]
pub fn compute_neuroendocrine_stress_score(
    rmssd_ms: Option<f64>,
    poct: Option<&SpotPoctPanel>,
    sleep_pressure_s: f64,
) -> f64 {
    let vagal_suppression = match rmssd_ms {
        Some(rmssd) if rmssd.is_finite() && rmssd > 0.0 => {
            (1.0 - rmssd / 42.0).clamp(0.0, 1.0)
        }
        _ => 0.50, // Fallback null-honesty on unmeasured HRV
    };

    let cortisol_factor = if let Some(panel) = poct
        && let Some(cort) = panel.salivary_cortisol_nmol_l
        && cort.is_finite()
    {
        ((cort - 8.0) / 22.0).clamp(0.0, 1.0)
    } else {
        0.30 * sleep_pressure_s
    };

    let nlr_factor = if let Some(panel) = poct
        && let Some(nlr) = panel.neutrophil_lymphocyte_ratio
        && nlr.is_finite()
    {
        ((nlr - 2.50) / 4.00).clamp(0.0, 1.0)
    } else {
        0.10
    };

    (0.40 * vagal_suppression + 0.35 * cortisol_factor + 0.25 * nlr_factor).clamp(0.05, 1.0)
}

/// Calcola il bilancio citochinico Th1/Th2 (Crucian et al. 2018).
/// In volo nominale Th1/Th2 = 1.0; con disfunzione immunitaria scende a 0.25 (predominanza Th2).
#[inline]
pub fn compute_th1_th2_balance(stress_score: f64, rad_load_factor: f64) -> f64 {
    let depression = (0.55 * stress_score + 0.45 * rad_load_factor).clamp(0.0, 0.90);
    (1.0 - depression).clamp(0.10, 1.20)
}

/// Calcola la probabilita di riattivazione virale (VZV / EBV / CMV) in percentuale (0..100%).
#[inline]
pub fn compute_viral_reactivation_risk_pct(
    stress_score: f64,
    th1_th2_ratio: f64,
    radiation_dose_rate_msv_d: f64,
    poct: Option<&SpotPoctPanel>,
) -> f64 {
    let rad_stress = (radiation_dose_rate_msv_d / 3.0).clamp(0.0, 1.0);
    let th2_shift_penalty = (1.0 - th1_th2_ratio).max(0.0);

    let mut risk_pct = (0.45 * stress_score + 0.35 * th2_shift_penalty + 0.20 * rad_stress) * 100.0;

    // Riscontro biologico diretto da POCT qPCR salivare (> 100 copies/mL)
    if let Some(panel) = poct
        && let Some(copies) = panel.viral_reactivation_copies_ml
        && copies > 100.0
    {
        risk_pct = (risk_pct + 35.0).min(98.0);
    }

    risk_pct.clamp(5.0, 99.0)
}

/// Genera la telemetria completa `NeuroImmuneViral`.
pub fn compute_neuro_immune_viral_state(
    rmssd_ms: Option<f64>,
    radiation_dose_rate_msv_d: f64,
    sleep_pressure_s: f64,
    poct: Option<&SpotPoctPanel>,
    containment_active: bool,
) -> NeuroImmuneViral {
    let stress = compute_neuroendocrine_stress_score(rmssd_ms, poct, sleep_pressure_s);
    let rad_load = (radiation_dose_rate_msv_d / 5.0).clamp(0.0, 1.0);
    let th1_th2 = compute_th1_th2_balance(stress, rad_load);
    let risk_pct = compute_viral_reactivation_risk_pct(stress, th1_th2, radiation_dose_rate_msv_d, poct);

    let shedding_suspected = risk_pct >= 60.0;

    NeuroImmuneViral {
        neuroendocrine_stress_score: stress,
        th1_th2_cytokine_ratio: th1_th2,
        viral_reactivation_risk_pct: risk_pct,
        vzv_ebv_active_shedding_suspected: shedding_suspected,
        infection_containment_active: containment_active,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_immune_risk_scales_with_stress_and_poct() {
        let nominal = compute_neuro_immune_viral_state(Some(45.0), 0.45, 0.20, None, false);
        assert!(!nominal.vzv_ebv_active_shedding_suspected);
        assert!(nominal.viral_reactivation_risk_pct < 60.0);

        let stressed_panel = SpotPoctPanel {
            salivary_cortisol_nmol_l: Some(28.0),
            neutrophil_lymphocyte_ratio: Some(4.8),
            viral_reactivation_copies_ml: Some(250.0),
            ..SpotPoctPanel::default()
        };
        let compromised = compute_neuro_immune_viral_state(Some(18.0), 1.8, 0.85, Some(&stressed_panel), false);
        assert!(compromised.vzv_ebv_active_shedding_suspected);
        assert!(compromised.viral_reactivation_risk_pct > 70.0);
    }
}
