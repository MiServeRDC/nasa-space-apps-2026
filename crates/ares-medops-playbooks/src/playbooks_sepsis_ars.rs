#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Real Sepsis & Septic Shock (`PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK`, code `16`)
//! and Acute Radiation Syndrome (`PLAYBOOK_26_ACUTE_RADIATION_SYNDROME`, code `26`).
//!
//! `PLAYBOOK_09_MULTIPARAMETER_DETERIORATION` remains untouched for non-infectious
//! undifferentiated multiparameter instability, while `PLAYBOOK_16` takes higher
//! clinical priority whenever infectious + `qSOFA >= 2` or `lactate > 2.0 mmol/L`
//! criteria are met.

use ares_causal_graph::space_pharmacology::{compute_qsofa_score, is_suspected_infection};
use ares_core_types::constants::sanitize_f64;
use ares_core_types::medical_360::{CrewBiologicalProfile, RadiationArsState};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, SafetyGates, SpotPoctPanel,
};

/// Binary IPC playbook code for `PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK`.
pub const PLAYBOOK_16_CODE: u16 = 16;
/// Binary IPC playbook code for `PLAYBOOK_26_ACUTE_RADIATION_SYNDROME`.
pub const PLAYBOOK_26_CODE: u16 = 26;

/// Returns `true` when Surviving Sepsis Campaign criteria are met:
/// `suspected_infection && (qsofa_score >= 2 || poct.lactate_mmol_l > 2.0)`.
#[inline]
pub fn is_sepsis_protocol_triggered(
    biometrics: &Biometrics,
    poct: Option<&SpotPoctPanel>,
    altered_mentation_or_fatigue: Option<f64>,
    source_identified: bool,
) -> bool {
    let suspected = is_suspected_infection(biometrics.core_temp_celsius, poct, source_identified);
    if !suspected {
        return false;
    }
    let qsofa = compute_qsofa_score(
        biometrics.resp_rate_brpm,
        biometrics.sbp_mmhg,
        altered_mentation_or_fatigue,
    );
    let lactate_elevated = poct
        .and_then(|p| p.lactate_mmol_l)
        .is_some_and(|l| l.is_finite() && l > 2.0);
    qsofa >= 2 || lactate_elevated
}

/// Builds `PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK` (`u16 = 16`) with exact `30 mL/kg`
/// crystalloid bolus, 1-hour broad-spectrum IV antibiotics, POCT lactate/cultures,
/// and conditional Norepinephrine titration for `MAP < 65 mmHg` or `lactate >= 4.0 mmol/L`.
pub fn build_playbook_16_sepsis_septic_shock(
    biometrics: &Biometrics,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
    altered_mentation_or_fatigue: Option<f64>,
    mut causal_chain_summary: Vec<String>,
    safety_gates: SafetyGates,
) -> ActivePlaybook {
    let qsofa = compute_qsofa_score(
        biometrics.resp_rate_brpm,
        biometrics.sbp_mmhg,
        altered_mentation_or_fatigue,
    );
    let lactate = poct
        .and_then(|p| p.lactate_mmol_l)
        .filter(|l| l.is_finite());
    let map_mmhg = match (biometrics.sbp_mmhg, biometrics.dbp_mmhg) {
        (Some(sbp), Some(dbp)) if sbp.is_finite() && dbp.is_finite() => {
            Some((sbp + 2.0 * dbp) / 3.0)
        }
        _ => None,
    };

    let body_mass_kg = sanitize_f64(profile.body_mass_kg, 75.0).clamp(30.0, 200.0);
    let bolus_ml = (30.0 * body_mass_kg).round();

    let repeat_lactate_note = if lactate.is_some_and(|l| l > 2.0) {
        " (repeat POCT lactate at 2h required since initial > 2.0 mmol/L)"
    } else {
        ""
    };

    causal_chain_summary.push(format!(
        "SEPSIS PROTOCOL #16 ACTIVE: qSOFA={qsofa}/3, lactate={:.2} mmol/L, 30 mL/kg bolus={bolus_ml:.0} mL",
        lactate.unwrap_or(0.0)
    ));

    let mut actions = vec![
        CountermeasureAction {
            action_id: "ACT_SEPSIS_POCT_LACTATE_AND_MICROBIAL_CULTURES".to_string(),
            label: format!(
                "Obtain immediate POCT lactate and paired microbial cultures prior to antimicrobials{repeat_lactate_note}"
            ),
            category: "DIAGNOSTIC_VERIFICATION".to_string(),
            delta_rho_per_hour: 0.10,
        },
        CountermeasureAction {
            action_id: "ACT_SEPSIS_1H_BROAD_SPECTRUM_IV_ANTIBIOTICS".to_string(),
            label: "Administer 1-hour broad-spectrum IV Piperacillin-Tazobactam or Cefepime (Gate 5 allergy/renal-adjusted)".to_string(),
            category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
            delta_rho_per_hour: 0.35,
        },
        CountermeasureAction {
            action_id: "ACT_SEPSIS_30ML_KG_CRYSTALLOID_BOLUS".to_string(),
            label: format!(
                "Infuse balanced crystalloid bolus {bolus_ml:.0} mL (30 mL/kg for {body_mass_kg:.1} kg) with POCUS lung B-line fluid-tolerance check"
            ),
            category: "HEMODYNAMIC_RESUSCITATION".to_string(),
            delta_rho_per_hour: 0.30,
        },
    ];

    let septic_shock = map_mmhg.is_some_and(|m| m < 65.0)
        || lactate.is_some_and(|l| l >= 4.0);
    if septic_shock {
        causal_chain_summary.push(
            "SEPTIC SHOCK DETECTED (MAP < 65 mmHg or lactate >= 4.0 mmol/L): Norepinephrine titration activated".to_string(),
        );
        actions.push(CountermeasureAction {
            action_id: "ACT_SEPSIS_NOREPINEPHRINE_TITRATION_MAP_65".to_string(),
            label: "Initiate Norepinephrine IV infusion and titrate to target MAP >= 65 mmHg".to_string(),
            category: "PHARMACOLOGICAL_VASOPRESSOR".to_string(),
            delta_rho_per_hour: 0.40,
        });
    }

    ActivePlaybook {
        playbook_id: "PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK".to_string(),
        title: "Playbook #16: Sepsis & Septic Shock Surviving Sepsis Campaign 1-Hour Bundle"
            .to_string(),
        causal_chain_summary,
        safety_gates,
        actions,
    }
}

/// Returns `true` when Acute Radiation Syndrome (`PLAYBOOK_26`) clinical criteria are met.
#[inline]
pub fn is_ars_playbook_triggered(radiation_ars: &RadiationArsState) -> bool {
    radiation_ars.estimated_acute_bfo_dose_gy >= 1.0
        || radiation_ars.severe_neutropenia
        || radiation_ars.febrile_neutropenia_emergency
        || radiation_ars.filgrastim_indicated
        || (radiation_ars.predicted_anc_k_ul.is_finite()
            && radiation_ars.predicted_anc_k_ul < 0.5)
        || (radiation_ars.predicted_plt_k_ul.is_finite()
            && radiation_ars.predicted_plt_k_ul < 75.0)
}

/// Builds `PLAYBOOK_26_ACUTE_RADIATION_SYNDROME` (`u16 = 26`).
pub fn build_playbook_26_acute_radiation_syndrome(
    radiation_ars: &RadiationArsState,
    mut causal_chain_summary: Vec<String>,
    safety_gates: SafetyGates,
) -> ActivePlaybook {
    causal_chain_summary.push(format!(
        "ARS PROTOCOL #26 ACTIVE: Est. BFO dose {:.2} Gy, ANC {:.2} K/uL, PLT {:.0} K/uL",
        radiation_ars.estimated_acute_bfo_dose_gy,
        radiation_ars.predicted_anc_k_ul,
        radiation_ars.predicted_plt_k_ul
    ));

    let mut actions = vec![CountermeasureAction {
        action_id: "ACT_ARS_SPE_STORM_SHELTER_AND_BIODOSIMETRY".to_string(),
        label: "Maintain SPE radiation storm shelter and serial ALC/CBC biodosimetry monitoring"
            .to_string(),
        category: "RADIATION_PROTECTION".to_string(),
        delta_rho_per_hour: 0.15,
    }];

    if radiation_ars.filgrastim_indicated || radiation_ars.severe_neutropenia {
        actions.push(CountermeasureAction {
            action_id: "ACT_ARS_FILGRASTIM_G_CSF_DAILY".to_string(),
            label: "Administer Filgrastim (G-CSF) 5 mcg/kg/day SC until ANC recovery > 1.0 K/uL"
                .to_string(),
            category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
            delta_rho_per_hour: 0.30,
        });
    }

    if radiation_ars.febrile_neutropenia_emergency {
        actions.push(CountermeasureAction {
            action_id: "ACT_ARS_FEBRILE_NEUTROPENIA_EMPIRIC_CEFEPIME".to_string(),
            label: "FEBRILE NEUTROPENIA EMERGENCY: Administer empiric IV Cefepime immediately (Gate 5 allergy-checked)".to_string(),
            category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
            delta_rho_per_hour: 0.35,
        });
    }

    if radiation_ars.predicted_plt_k_ul < 75.0 || radiation_ars.predicted_anc_k_ul < 0.5 {
        actions.push(CountermeasureAction {
            action_id: "ACT_ARS_THROMBOCYTOPENIA_BLEEDING_PRECAUTIONS".to_string(),
            label: "Enforce Gate 6 non-emergent invasive procedure lock and strict NSAID/anticoagulant avoidance".to_string(),
            category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
            delta_rho_per_hour: 0.15,
        });
    }

    actions.push(CountermeasureAction {
        action_id: "ACT_ARS_ANTIEMETIC_AND_FLUID_SUPPORT".to_string(),
        label: "Provide balanced hydration and QTc-safe antiemetic prophylaxis as needed"
            .to_string(),
        category: "METABOLIC_COUNTERMEASURE".to_string(),
        delta_rho_per_hour: 0.10,
    });

    ActivePlaybook {
        playbook_id: "PLAYBOOK_26_ACUTE_RADIATION_SYNDROME".to_string(),
        title: "Playbook #26: Acute Radiation Syndrome (ARS) Hematologic Nadir & Cytokine Rescue"
            .to_string(),
        causal_chain_summary,
        safety_gates,
        actions,
    }
}

/// Selects `PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK` (priority 1) or
/// `PLAYBOOK_26_ACUTE_RADIATION_SYNDROME` (priority 2) when triggered.
#[allow(clippy::too_many_arguments)]
pub fn select_sepsis_or_ars_playbook(
    biometrics: &Biometrics,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
    radiation_ars: Option<&RadiationArsState>,
    altered_mentation_or_fatigue: Option<f64>,
    source_identified: bool,
    causal_chain_summary: Vec<String>,
    safety_gates: SafetyGates,
) -> Option<ActivePlaybook> {
    if is_sepsis_protocol_triggered(
        biometrics,
        poct,
        altered_mentation_or_fatigue,
        source_identified,
    ) {
        return Some(build_playbook_16_sepsis_septic_shock(
            biometrics,
            poct,
            profile,
            altered_mentation_or_fatigue,
            causal_chain_summary,
            safety_gates,
        ));
    }

    if let Some(ars) = radiation_ars
        && is_ars_playbook_triggered(ars)
    {
        return Some(build_playbook_26_acute_radiation_syndrome(
            ars,
            causal_chain_summary,
            safety_gates,
        ));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::binary_ipc::playbook_id_to_u16;

    #[test]
    fn playbook_16_triggers_on_qsofa_or_lactate_with_suspected_infection_and_norepi_on_shock() {
        let profile = CrewBiologicalProfile::default(); // 75 kg
        let bio = Biometrics {
            core_temp_celsius: Some(38.8),
            resp_rate_brpm: Some(24.0),
            sbp_mmhg: Some(82.0),
            dbp_mmhg: Some(50.0), // MAP = 60.67 < 65
            ..Default::default()
        };
        let poct = SpotPoctPanel {
            wbc_k_ul: Some(16.2),
            lactate_mmol_l: Some(3.1),
            ..Default::default()
        };

        let pb = select_sepsis_or_ars_playbook(
            &bio,
            Some(&poct),
            &profile,
            None,
            Some(0.85),
            true,
            vec![],
            SafetyGates::default(),
        );
        assert!(pb.is_some());
        if let Some(pb) = pb {
            assert_eq!(pb.playbook_id, "PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK");
            assert_eq!(playbook_id_to_u16(&pb.playbook_id), PLAYBOOK_16_CODE);
            assert!(pb
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_SEPSIS_POCT_LACTATE_AND_MICROBIAL_CULTURES"));
            assert!(pb
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_SEPSIS_1H_BROAD_SPECTRUM_IV_ANTIBIOTICS"));
            let bolus = pb
                .actions
                .iter()
                .find(|a| a.action_id == "ACT_SEPSIS_30ML_KG_CRYSTALLOID_BOLUS");
            assert!(bolus.is_some_and(|b| b.label.contains("2250 mL")));
            assert!(pb
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_SEPSIS_NOREPINEPHRINE_TITRATION_MAP_65"));
        }
    }

    #[test]
    fn non_infectious_deterioration_does_not_trigger_playbook_16() {
        let profile = CrewBiologicalProfile::default();
        let bio = Biometrics {
            core_temp_celsius: Some(37.0),
            resp_rate_brpm: Some(24.0),
            sbp_mmhg: Some(95.0),
            ..Default::default()
        };
        let poct = SpotPoctPanel {
            wbc_k_ul: Some(7.5),
            lactate_mmol_l: Some(1.4),
            ..Default::default()
        };
        assert!(!is_sepsis_protocol_triggered(
            &bio,
            Some(&poct),
            Some(0.85),
            false
        ));
        let pb = select_sepsis_or_ars_playbook(
            &bio,
            Some(&poct),
            &profile,
            None,
            Some(0.85),
            false,
            vec![],
            SafetyGates::default(),
        );
        assert!(pb.is_none());
    }

    #[test]
    fn playbook_26_triggers_on_ars_neutropenia_and_includes_filgrastim_and_cefepime() {
        let ars = RadiationArsState {
            estimated_acute_bfo_dose_gy: 2.4,
            predicted_anc_k_ul: 0.35,
            predicted_plt_k_ul: 62.0,
            severe_neutropenia: true,
            febrile_neutropenia_emergency: true,
            filgrastim_indicated: true,
            ..Default::default()
        };
        let pb = select_sepsis_or_ars_playbook(
            &Biometrics::default(),
            None,
            &CrewBiologicalProfile::default(),
            Some(&ars),
            None,
            false,
            vec![],
            SafetyGates::default(),
        );
        assert!(pb.is_some());
        if let Some(pb) = pb {
            assert_eq!(pb.playbook_id, "PLAYBOOK_26_ACUTE_RADIATION_SYNDROME");
            assert_eq!(playbook_id_to_u16(&pb.playbook_id), PLAYBOOK_26_CODE);
            assert!(pb
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_ARS_FILGRASTIM_G_CSF_DAILY"));
            assert!(pb
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_ARS_FEBRILE_NEUTROPENIA_EMPIRIC_CEFEPIME"));
            assert!(pb
                .actions
                .iter()
                .any(|a| a.action_id == "ACT_ARS_THROMBOCYTOPENIA_BLEEDING_PRECAUTIONS"));
        }
    }
}
