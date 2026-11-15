#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Modulo per la diagnosi differenziale accoppiata Habitat-Equipaggio (ECLSS vs. Patologia Individuale).
//!
//! Risolve il failure mode critico in cui la saturazione dello scrubber CO2 di bordo (CDRA / ammine)
//! produce ipercapnia e tachicardia compensatoria simultanea nell'equipaggio.
//! Distingue matematicamente il guasto ambientale dal collasso emodinamico/settico individuale.

use ares_core_types::telemetry::{Biometrics, CountermeasureAction};
use serde::{Deserialize, Serialize};

pub const NASA_STD_3001_PPCO2_ACTION_LIMIT_MMHG: f64 = 4.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HypercapniaRootCause {
    Nominal,
    EnvironmentalEclssScrubberSaturation,
    SuitOrHelmetVentilationFault,
    IsolatedCrewPathology,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoupledHabitatCrewDiagnosis {
    pub root_cause: HypercapniaRootCause,
    pub observed_ppco2_mmhg: Option<f64>,
    pub causal_summary: String,
    pub causal_chain: Vec<String>,
    pub recommended_override_actions: Vec<CountermeasureAction>,
}

/// Valuta la telemetria accoppiata habitat/ECLSS e i biometrici dell'astronauta per isolare
/// la saturazione dei filtri CO2 rispetto a patologie organiche cardiorespiratorie individuali.
pub fn evaluate_coupled_habitat_crew_co2(
    biometrics: &Biometrics,
    affected_crew_count: usize,
) -> CoupledHabitatCrewDiagnosis {
    let cabin_co2 = biometrics.cabin_ppco2_mmhg;
    let helmet_co2 = biometrics.helmet_ppco2_mmhg;
    let elevated_hr = biometrics.heart_rate_bpm.is_some_and(|hr| hr > 100.0);

    // Caso 1: La ppCO2 in cabina supera 4.0 mmHg (NASA-STD-3001)
    if let Some(c_co2) = cabin_co2.filter(|&c| c > NASA_STD_3001_PPCO2_ACTION_LIMIT_MMHG) {
        return CoupledHabitatCrewDiagnosis {
            root_cause: HypercapniaRootCause::EnvironmentalEclssScrubberSaturation,
            observed_ppco2_mmhg: Some(c_co2),
            causal_summary: format!(
                "ENVIRONMENTAL LIFE-SUPPORT ANOMALY: Cabin ppCO2 ({c_co2:.2} mmHg) exceeds NASA-STD-3001 4.0 mmHg ceiling. Crew tachycardia/hypercapnia is secondary to ECLSS CDRA/amine scrubber breakthrough, NOT isolated organic crew pathology."
            ),
            causal_chain: vec![
                "ECLSS_CO2_SCRUBBER_SATURATION".to_string(),
                "ELEVATED_INSPIRED_CABIN_PPCO2".to_string(),
                "SECONDARY_CREW_HYPERCAPNIC_TACHYCARDIA_AND_CEPHALAD_VASODILATION".to_string(),
            ],
            recommended_override_actions: vec![CountermeasureAction {
                action_id: "ACT_ECLSS_SWITCH_BACKUP_LIOH_OR_AMINE_BED".to_string(),
                label: "ECLSS PRIORITY: Switch Secondary CO2 Scrubber Bed / Deploy Contingency LiOH".to_string(),
                category: "ENVIRONMENTAL_LIFE_SUPPORT_INTERVENTION".to_string(),
                delta_rho_per_hour: 0.25,
            }],
        };
    }

    // Caso 2: ppCO2 elevata nel casco/tuta (> 4.0 mmHg)
    if let Some(h_co2) = helmet_co2.filter(|&h| h > NASA_STD_3001_PPCO2_ACTION_LIMIT_MMHG) {
        let is_multi_crew = affected_crew_count > 1;
        let root_cause = if is_multi_crew {
            HypercapniaRootCause::EnvironmentalEclssScrubberSaturation
        } else {
            HypercapniaRootCause::SuitOrHelmetVentilationFault
        };

        let cause_label = if is_multi_crew {
            "Habitat ECLSS Scrubber Saturation (multi-crew concurrent CO2 elevation)"
        } else {
            "Local Suit/Helmet Fan or Acoustic CO2 Washout Fault (cabin CO2 nominal/unreported)"
        };

        return CoupledHabitatCrewDiagnosis {
            root_cause,
            observed_ppco2_mmhg: Some(h_co2),
            causal_summary: format!(
                "EXOGENOUS CO2 REBREATHING DETECTED: Inspired/helmet ppCO2 ({h_co2:.2} mmHg > 4.0 mmHg). Attributed to {cause_label} rather than primary endogenous crew pathology."
            ),
            causal_chain: vec![
                if is_multi_crew {
                    "ECLSS_CO2_SCRUBBER_SATURATION".to_string()
                } else {
                    "LOCAL_VENTILATION_CO2_WASHOUT_FAILURE".to_string()
                },
                "EXOGENOUS_CO2_RETENTION".to_string(),
                "COMPENSATORY_SYMPATHETIC_TACHYCARDIA".to_string(),
            ],
            recommended_override_actions: vec![CountermeasureAction {
                action_id: "ACT_VERIFY_ECLSS_SCRUBBER_AND_SUIT_FAN_FLOW".to_string(),
                label: "LIFE SUPPORT CHECK: Verify ECLSS CO2 Scrubber & Local Airflow Washout".to_string(),
                category: "ENVIRONMENTAL_LIFE_SUPPORT_INTERVENTION".to_string(),
                delta_rho_per_hour: 0.20,
            }],
        };
    }

    // Caso 3: Atmosfera nominale (<= 4.0 mmHg), tachicardia attribuita a fisiologia individuale
    if elevated_hr {
        return CoupledHabitatCrewDiagnosis {
            root_cause: HypercapniaRootCause::IsolatedCrewPathology,
            observed_ppco2_mmhg: cabin_co2.or(helmet_co2),
            causal_summary: "Atmosphere ppCO2 nominal (<= 4.0 mmHg); ECLSS scrubber ruled out. Tachycardia/clinical signs attributed to individual crew physiology.".to_string(),
            causal_chain: vec![
                "ECLSS_ATMOSPHERE_NOMINAL".to_string(),
                "IDIOSYNCRATIC_CREW_HEMODYNAMIC_STRESS".to_string(),
            ],
            recommended_override_actions: Vec::new(),
        };
    }

    CoupledHabitatCrewDiagnosis {
        root_cause: HypercapniaRootCause::Nominal,
        observed_ppco2_mmhg: cabin_co2.or(helmet_co2),
        causal_summary: "Habitat ECLSS ppCO2 and crew cardiorespiratory indices within nominal flight bounds.".to_string(),
        causal_chain: vec!["NOMINAL_HABITAT_CREW_HOMEOSTASIS".to_string()],
        recommended_override_actions: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eclss_scrubber_saturation_diagnosed_on_high_cabin_ppco2() {
        let biometrics = Biometrics {
            heart_rate_bpm: Some(110.0),
            cabin_ppco2_mmhg: Some(5.2),
            ..Biometrics::default()
        };

        let diag = evaluate_coupled_habitat_crew_co2(&biometrics, 1);
        assert_eq!(
            diag.root_cause,
            HypercapniaRootCause::EnvironmentalEclssScrubberSaturation
        );
        assert!(diag
            .causal_chain
            .contains(&"ECLSS_CO2_SCRUBBER_SATURATION".to_string()));
        assert_eq!(diag.recommended_override_actions.len(), 1);
        assert_eq!(
            diag.recommended_override_actions[0].action_id,
            "ACT_ECLSS_SWITCH_BACKUP_LIOH_OR_AMINE_BED"
        );
    }

    #[test]
    fn test_helmet_co2_with_multi_crew_flags_eclss_saturation() {
        let biometrics = Biometrics {
            heart_rate_bpm: Some(105.0),
            helmet_ppco2_mmhg: Some(4.8),
            ..Biometrics::default()
        };

        let diag = evaluate_coupled_habitat_crew_co2(&biometrics, 3);
        assert_eq!(
            diag.root_cause,
            HypercapniaRootCause::EnvironmentalEclssScrubberSaturation
        );
    }

    #[test]
    fn test_helmet_co2_single_crew_flags_local_vent_fault() {
        let biometrics = Biometrics {
            heart_rate_bpm: Some(105.0),
            helmet_ppco2_mmhg: Some(4.8),
            ..Biometrics::default()
        };

        let diag = evaluate_coupled_habitat_crew_co2(&biometrics, 1);
        assert_eq!(
            diag.root_cause,
            HypercapniaRootCause::SuitOrHelmetVentilationFault
        );
    }

    #[test]
    fn test_nominal_co2_with_elevated_hr_flags_isolated_crew_pathology() {
        let biometrics = Biometrics {
            heart_rate_bpm: Some(115.0),
            cabin_ppco2_mmhg: Some(2.0),
            ..Biometrics::default()
        };

        let diag = evaluate_coupled_habitat_crew_co2(&biometrics, 1);
        assert_eq!(
            diag.root_cause,
            HypercapniaRootCause::IsolatedCrewPathology
        );
    }
}
