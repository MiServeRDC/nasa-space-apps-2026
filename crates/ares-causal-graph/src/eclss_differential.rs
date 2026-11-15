#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Module for the coupled Habitat-Crew differential diagnosis (ECLSS vs. individual pathology).
//!
//! Resolves the critical failure mode where saturation of the onboard CO2 scrubber (CDRA / amines)
//! produces simultaneous hypercapnia and compensatory tachycardia in the crew.
//! Mathematically distinguishes the environmental fault from individual hemodynamic/septic collapse.

use ares_core_types::constants::{ECLSS_PPCO2_ACTION_LIMIT_MMHG, MAX_SAFE_CABIN_PPCO2_MMHG};
use ares_core_types::telemetry::{Biometrics, CountermeasureAction};
use serde::{Deserialize, Serialize};

pub const NASA_STD_3001_PPCO2_ACTION_LIMIT_MMHG: f64 = ECLSS_PPCO2_ACTION_LIMIT_MMHG;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HypercapniaRootCause {
    Nominal,
    EarlyEnvironmentalSansWarning,
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

/// Evaluates the coupled habitat/ECLSS telemetry and the astronaut biometrics to isolate
/// CO2 filter saturation from individual organic cardiorespiratory pathologies.
pub fn evaluate_coupled_habitat_crew_co2(
    biometrics: &Biometrics,
    affected_crew_count: usize,
) -> CoupledHabitatCrewDiagnosis {
    let cabin_co2 = biometrics.cabin_ppco2_mmhg;
    let helmet_co2 = biometrics.helmet_ppco2_mmhg;
    let elevated_hr = biometrics.heart_rate_bpm.is_some_and(|hr| hr > 100.0);

    // Case 1: Cabin ppCO2 exceeds 4.0 mmHg (NASA-STD-3001)
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

    // Case 2: Elevated ppCO2 in the helmet/suit (> 4.0 mmHg)
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

    // Case 2b: Tier 1 chronic attention band (3.0 < ppCO2 <= 4.0 mmHg, NASA-STD-3001 [V2 6004])
    let max_co2 = match (cabin_co2, helmet_co2) {
        (Some(c), Some(h)) => Some(c.max(h)),
        (Some(c), None) => Some(c),
        (None, Some(h)) => Some(h),
        (None, None) => None,
    };
    if let Some(co2) = max_co2
        .filter(|&v| v > MAX_SAFE_CABIN_PPCO2_MMHG && v <= NASA_STD_3001_PPCO2_ACTION_LIMIT_MMHG)
    {
        return CoupledHabitatCrewDiagnosis {
            root_cause: HypercapniaRootCause::EarlyEnvironmentalSansWarning,
            observed_ppco2_mmhg: Some(co2),
            causal_summary: format!(
                "TIER-1 CHRONIC CO2 / SANS WARNING: Observed ppCO2 ({co2:.2} mmHg) exceeds NASA-STD-3001 3.0 mmHg chronic ceiling while remaining at or below the 4.0 mmHg acute scrubber action limit."
            ),
            causal_chain: vec![
                "CHRONIC_PPCO2_ABOVE_3_MMHG_CEILING".to_string(),
                "HYPERCAPNIC_CEREBRAL_VASODILATION_SANS_RISK".to_string(),
            ],
            recommended_override_actions: vec![CountermeasureAction {
                action_id: "ACT_MONITOR_ECLSS_AND_SANS_TREND".to_string(),
                label: "ECLSS WATCH: Monitor CDRA/Amine Bed Efficiency & Crew SANS Biomarkers (>3.0 mmHg Tier 1)".to_string(),
                category: "ENVIRONMENTAL_SANS_PREVENTION".to_string(),
                delta_rho_per_hour: 0.10,
            }],
        };
    }

    // Case 3: Nominal atmosphere (<= 3.0 mmHg), tachycardia attributed to individual physiology
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

    #[test]
    fn test_tier1_chronic_co2_zone_flags_early_environmental_sans_warning() {
        for co2 in [3.1, 3.5, 4.0] {
            let cabin_bio = Biometrics {
                heart_rate_bpm: Some(78.0),
                cabin_ppco2_mmhg: Some(co2),
                ..Biometrics::default()
            };
            let diag = evaluate_coupled_habitat_crew_co2(&cabin_bio, 4);
            assert_eq!(
                diag.root_cause,
                HypercapniaRootCause::EarlyEnvironmentalSansWarning,
                "Expected EarlyEnvironmentalSansWarning at cabin ppCO2={co2}"
            );
            assert_eq!(diag.observed_ppco2_mmhg, Some(co2));
            assert_eq!(diag.recommended_override_actions.len(), 1);
        }

        let helmet_bio = Biometrics {
            heart_rate_bpm: Some(78.0),
            cabin_ppco2_mmhg: Some(2.1),
            helmet_ppco2_mmhg: Some(3.6),
            ..Biometrics::default()
        };
        let helmet_diag = evaluate_coupled_habitat_crew_co2(&helmet_bio, 1);
        assert_eq!(
            helmet_diag.root_cause,
            HypercapniaRootCause::EarlyEnvironmentalSansWarning
        );
        assert_eq!(helmet_diag.observed_ppco2_mmhg, Some(3.6));

        let boundary_nominal = Biometrics {
            heart_rate_bpm: Some(75.0),
            cabin_ppco2_mmhg: Some(3.0),
            ..Biometrics::default()
        };
        assert_eq!(
            evaluate_coupled_habitat_crew_co2(&boundary_nominal, 1).root_cause,
            HypercapniaRootCause::Nominal
        );
    }
}
