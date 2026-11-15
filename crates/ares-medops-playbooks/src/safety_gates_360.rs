#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Extended 360-degree clinical safety gates:
//! - Gate 5A: Ketorolac & Systemic NSAID Renal / Bleeding / Allergy Interlock
//! - Gate 5B: G6PD Deficiency, Beta-Lactam Allergy & Additive QTc (>= 500 ms) Lock
//! - Gate 5C: ExMC 900-Sol Radiolytic Subpotency (< 90% USP) & Inventory Depletion Substitution
//! - Gate 6: ARS Neutropenia (ANC < 0.5 K/uL) & Thrombocytopenia (PLT < 75 K/uL) Non-Emergent Invasive Lock

use ares_causal_graph::space_pharmacology::{
    MedicalConsumableInventory, USP_POTENCY_FLOOR_PCT, estimated_egfr_ckd_epi_2021,
    evaluate_drug_potency,
};
use ares_core_types::medical_360::{
    CrewBiologicalProfile, ExtendedSafetyGates, RadiationArsState,
};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, SpotPoctPanel,
};

/// Additive QTc prolongation penalty per QTc-prolonging agent in an active playbook (ms).
pub const QTC_ADDITIVE_PENALTY_PER_DRUG_MS: f64 = 18.0;
/// Torsades de Pointes critical QTc lock threshold (ms).
pub const QTC_CRITICAL_LOCK_THRESHOLD_MS: f64 = 500.0;
/// Gate 5A platelet floor for Ketorolac / systemic NSAIDs (K/uL).
pub const NSAID_PLATELET_FLOOR_K_UL: f64 = 100.0;
/// Gate 6 ARS platelet floor for non-emergent invasive procedures (K/uL).
pub const GATE6_ARS_PLATELET_FLOOR_K_UL: f64 = 75.0;
/// Gate 6 ARS absolute neutrophil count floor for non-emergent invasive procedures (K/uL).
pub const GATE6_ARS_ANC_FLOOR_K_UL: f64 = 0.5;

#[inline]
fn is_nsaid_action(action: &CountermeasureAction) -> bool {
    if action.category == "CLINICAL_SAFETY_GATE_OVERRIDE" {
        return false;
    }
    let id = action.action_id.to_ascii_uppercase();
    let label = action.label.to_ascii_uppercase();
    action.category == "PHARMACOLOGICAL_NSAID"
        || id.contains("KETOROLAC")
        || id.contains("IBUPROFEN")
        || id.contains("NAPROXEN")
        || label.contains("KETOROLAC")
        || label.contains("IBUPROFEN")
        || label.contains("NAPROXEN")
}

#[inline]
fn is_ketorolac_tamsulosin_combo(action: &CountermeasureAction) -> bool {
    let id = action.action_id.to_ascii_uppercase();
    id == "ACT_ANALGESIA_KETOROLAC_TAMSULOSIN"
        || id == "ACT_ANALGESIA_KETOROLAC_AND_TAMSULOSIN"
        || (id.contains("KETOROLAC") && id.contains("TAMSULOSIN"))
}

#[inline]
fn is_methylene_blue_action(action: &CountermeasureAction) -> bool {
    let id = action.action_id.to_ascii_uppercase();
    let label = action.label.to_ascii_uppercase();
    id == "ACT_TOX_METHYLENE_BLUE_1_2MG_KG_IV"
        || id.contains("METHYLENE_BLUE")
        || label.contains("METHYLENE BLUE")
}

#[inline]
fn is_beta_lactam_action(action: &CountermeasureAction) -> bool {
    if action.category == "CLINICAL_SAFETY_GATE_OVERRIDE" {
        return false;
    }
    let id = action.action_id.to_ascii_uppercase();
    let label = action.label.to_ascii_uppercase();
    id.contains("PIPERACILLIN")
        || id.contains("CEFEPIME")
        || id.contains("AMOXICILLIN")
        || id.contains("ERTAPENEM")
        || id.contains("BETA_LACTAM")
        || id == "ACT_SEPSIS_1H_BROAD_SPECTRUM_IV_ANTIBIOTICS"
        || id == "ACT_ARS_FEBRILE_NEUTROPENIA_EMPIRIC_CEFEPIME"
        || label.contains("PIPERACILLIN")
        || label.contains("CEFEPIME")
        || label.contains("AMOXICILLIN")
        || label.contains("ERTAPENEM")
}

#[inline]
pub fn is_qtc_prolonging_action(action: &CountermeasureAction) -> bool {
    if action.category == "CLINICAL_SAFETY_GATE_OVERRIDE" {
        return false;
    }
    let id = action.action_id.to_ascii_uppercase();
    let label = action.label.to_ascii_uppercase();
    action.category == "PHARMACOLOGICAL_QTC_PROLONGING"
        || id.contains("HALOPERIDOL")
        || id.contains("ONDANSETRON")
        || id.contains("LEVOFLOXACIN")
        || id.contains("CIPROFLOXACIN")
        || id.contains("AZITHROMYCIN")
        || id.contains("AMIODARONE")
        || id.contains("PROCHLORPERAZINE")
        || label.contains("HALOPERIDOL")
        || label.contains("ONDANSETRON")
        || label.contains("LEVOFLOXACIN")
        || label.contains("CIPROFLOXACIN")
        || label.contains("AZITHROMYCIN")
}

/// Counts QTc-prolonging pharmacological actions in a playbook.
#[inline]
pub fn count_qtc_drugs(playbook: &ActivePlaybook) -> usize {
    playbook
        .actions
        .iter()
        .filter(|a| is_qtc_prolonging_action(a))
        .count()
}

#[inline]
fn extract_referenced_formulary_drugs(action: &CountermeasureAction) -> Vec<&'static str> {
    let text = format!(
        "{} {}",
        action.action_id.to_ascii_uppercase(),
        action.label.to_ascii_uppercase()
    );
    let mut drugs = Vec::new();
    for (needle, canonical) in [
        ("AMOXICILLIN", "AMOXICILLIN_CLAVULANATE"),
        ("EPINEPHRINE", "EPINEPHRINE"),
        ("ERTAPENEM", "ERTAPENEM"),
        ("TXA", "TXA"),
        ("TRANEXAMIC", "TXA"),
        ("PIPERACILLIN", "PIPERACILLIN_TAZOBACTAM"),
        ("CEFEPIME", "CEFEPIME"),
        ("KETOROLAC", "KETOROLAC"),
        ("TAMSULOSIN", "TAMSULOSIN"),
        ("NOREPINEPHRINE", "NOREPINEPHRINE"),
        ("FILGRASTIM", "FILGRASTIM"),
        ("CLINDAMYCIN", "CLINDAMYCIN"),
        ("LEVOFLOXACIN", "LEVOFLOXACIN"),
        ("METRONIDAZOLE", "METRONIDAZOLE"),
    ] {
        if text.contains(needle) && !drugs.contains(&canonical) {
            drugs.push(canonical);
        }
    }
    drugs
}

#[inline]
fn is_emergent_lifesaving_invasive(action: &CountermeasureAction) -> bool {
    let id = action.action_id.to_ascii_uppercase();
    id.contains("NEEDLE_DECOMPRESSION")
        || id.contains("PERICARDIOCENTESIS")
        || id.contains("CPR")
        || id.contains("AIRWAY")
        || id.contains("TORSO_TOURNIQUET")
}

/// Enforces Extended Clinical Safety Gates 5A, 5B, 5C, and 6 on an [`ActivePlaybook`].
#[allow(clippy::too_many_arguments)]
pub fn enforce_extended_360_safety_gates(
    mut playbook: ActivePlaybook,
    biometrics: &Biometrics,
    poct: Option<&SpotPoctPanel>,
    profile: &CrewBiologicalProfile,
    radiation_ars: Option<&RadiationArsState>,
    inventory: Option<&MedicalConsumableInventory>,
    mission_sol: f64,
    cumulative_habitat_gcr_gy: f64,
    current_qtc_ms: Option<f64>,
    shock_index: Option<f64>,
    gi_ulcer_history_or_bleed: bool,
) -> (ActivePlaybook, ExtendedSafetyGates) {
    let mut gates = ExtendedSafetyGates::default();

    let effective_platelets = [
        poct.and_then(|p| p.platelet_count_k_ul),
        biometrics.platelet_count_k_ul,
        radiation_ars.map(|r| r.predicted_plt_k_ul),
    ]
    .into_iter()
    .flatten()
    .filter(|v| v.is_finite() && *v >= 0.0)
    .reduce(f64::min);

    let effective_shock_index = shock_index.or_else(|| {
        if let (Some(hr), Some(sbp)) = (biometrics.heart_rate_bpm, biometrics.sbp_mmhg)
            && hr.is_finite()
            && sbp.is_finite()
            && sbp > 0.0
        {
            Some(hr / sbp)
        } else {
            None
        }
    });

    // --- GATE 5A: Ketorolac & Systemic NSAID Interlock ---
    let plt_low_nsaid = effective_platelets.is_some_and(|p| p < NSAID_PLATELET_FLOOR_K_UL)
        || playbook
            .safety_gates
            .anticoagulant_contraindicated_bleeding_risk;
    let renal_impaired = poct.and_then(|p| p.creatinine_mg_dl).is_some_and(|cr| {
        cr.is_finite() && (cr > 1.30 || estimated_egfr_ckd_epi_2021(profile, cr) < 60.0)
    });
    let oliguria = poct
        .and_then(|p| p.urine_output_l_d)
        .is_some_and(|uo| uo.is_finite() && uo < 0.50);
    let dehydration_or_shock = poct
        .and_then(|p| p.bia_plasma_vol_delta_pct)
        .is_some_and(|pv| pv.is_finite() && pv < -12.0)
        || effective_shock_index.is_some_and(|si| si.is_finite() && si >= 0.90);
    let nsaid_allergy_or_gi = gi_ulcer_history_or_bleed
        || profile.has_allergy("NSAID")
        || profile.has_allergy("KETOROLAC");

    let gate5a_triggered =
        plt_low_nsaid || renal_impaired || oliguria || dehydration_or_shock || nsaid_allergy_or_gi;

    if gate5a_triggered && playbook.actions.iter().any(is_nsaid_action) {
        gates.gate5_nsaid_renal_bleeding_locked = true;
        for action in &mut playbook.actions {
            if is_ketorolac_tamsulosin_combo(action) {
                *action = CountermeasureAction {
                    action_id:
                        "ACT_RENAL_SAFE_ANALGESIA_ACETAMINOPHEN_FENTANYL_PLUS_TAMSULOSIN"
                            .to_string(),
                    label: "GATE 5A OVERRIDE: Ketorolac locked (renal/bleeding/allergy risk). Administer Acetaminophen IV + titrated Fentanyl + Tamsulosin 0.4 mg PO for stone expulsion".to_string(),
                    category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                    delta_rho_per_hour: action.delta_rho_per_hour,
                };
            } else if is_nsaid_action(action) {
                *action = CountermeasureAction {
                    action_id: "ACT_RENAL_SAFE_ANALGESIA_ACETAMINOPHEN_FENTANYL".to_string(),
                    label: "GATE 5A OVERRIDE: Systemic NSAID locked. Substitute Acetaminophen + titrated Fentanyl".to_string(),
                    category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                    delta_rho_per_hour: action.delta_rho_per_hour,
                };
            }
        }
        playbook.causal_chain_summary.push(
            "GATE 5A LOCKED: Ketorolac/systemic NSAID blocked (PLT < 100, Cr > 1.30/eGFR < 60, oliguria, hypovolemia, GI bleed, or allergy); substituted renal-safe analgesia".to_string(),
        );
    }

    // --- GATE 5B: G6PD, Beta-Lactam Allergy & Additive QTc Lock ---
    if profile.g6pd_deficient && playbook.actions.iter().any(is_methylene_blue_action) {
        gates.gate5_allergy_or_qtc_locked = true;
        for action in &mut playbook.actions {
            if is_methylene_blue_action(action) {
                *action = CountermeasureAction {
                    action_id: "ACT_TOX_ASCORBIC_ACID_HIGH_DOSE_IV".to_string(),
                    label: "GATE 5B G6PD OVERRIDE: Methylene Blue contraindicated (hemolysis risk); substitute high-dose IV Ascorbic Acid".to_string(),
                    category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                    delta_rho_per_hour: action.delta_rho_per_hour,
                };
            }
        }
        playbook.causal_chain_summary.push(
            "GATE 5B G6PD LOCK: Methylene Blue stripped and replaced with high-dose IV Ascorbic Acid".to_string(),
        );
    }

    let beta_lactam_allergy = profile.has_allergy("PENICILLIN")
        || profile.has_allergy("BETA_LACTAM")
        || profile.has_allergy("AMOXICILLIN")
        || profile.has_allergy("PIPERACILLIN")
        || profile.has_allergy("CEFEPIME")
        || profile.has_allergy("ERTAPENEM");
    if beta_lactam_allergy && playbook.actions.iter().any(is_beta_lactam_action) {
        gates.gate5_allergy_or_qtc_locked = true;
        for action in &mut playbook.actions {
            if is_beta_lactam_action(action) {
                *action = CountermeasureAction {
                    action_id:
                        "ACT_ABX_BETA_LACTAM_ALLERGY_CLINDAMYCIN_LEVOFLOXACIN_METRONIDAZOLE"
                            .to_string(),
                    label: "GATE 5B ALLERGY OVERRIDE: Beta-lactam allergy detected; substitute Clindamycin / Levofloxacin + Metronidazole".to_string(),
                    category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                    delta_rho_per_hour: action.delta_rho_per_hour,
                };
            }
        }
        playbook.causal_chain_summary.push(
            "GATE 5B ALLERGY LOCK: Beta-lactam antibiotic substituted with Clindamycin / Levofloxacin + Metronidazole".to_string(),
        );
    }

    let base_qtc = current_qtc_ms
        .or(profile.baseline_qtc_ms)
        .filter(|q| q.is_finite() && *q > 0.0)
        .unwrap_or(410.0);
    let qtc_drug_count = count_qtc_drugs(&playbook) as f64;
    let effective_qtc_ms = base_qtc + qtc_drug_count * QTC_ADDITIVE_PENALTY_PER_DRUG_MS;
    if effective_qtc_ms >= QTC_CRITICAL_LOCK_THRESHOLD_MS {
        gates.gate5_allergy_or_qtc_locked = true;
        for action in &mut playbook.actions {
            if is_qtc_prolonging_action(action) {
                *action = CountermeasureAction {
                    action_id: "ACT_QTC_SAFE_LORAZEPAM_OR_KETAMINE_ALTERNATIVE".to_string(),
                    label: "GATE 5B QTc OVERRIDE: Haloperidol/Ondansetron locked (QTc >= 500 ms); substitute Lorazepam / Ketamine / Promethazine-free regimen".to_string(),
                    category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                    delta_rho_per_hour: action.delta_rho_per_hour,
                };
            }
        }
        if !playbook
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_QTC_LOCK_MAGNESIUM_2G_IV_CONTINUOUS_ECG")
        {
            playbook.actions.push(CountermeasureAction {
                action_id: "ACT_QTC_LOCK_MAGNESIUM_2G_IV_CONTINUOUS_ECG".to_string(),
                label: format!(
                    "GATE 5B QTc LOCK ({effective_qtc_ms:.0} ms >= 500 ms): Administer Magnesium Sulfate 2 g IV and initiate continuous ECG telemetry"
                ),
                category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                delta_rho_per_hour: 0.25,
            });
        }
        playbook.causal_chain_summary.push(format!(
            "GATE 5B QTc LOCK: Effective QTc {effective_qtc_ms:.0} ms >= 500 ms; QTc-prolonging agents replaced and MgSO4 2g IV + continuous ECG injected"
        ));
    }

    // --- GATE 5C: 900-Sol Subpotent (< 90%) & Depleted ExMC Formulary Substitution ---
    let mut subpotent_or_depleted: Vec<String> = Vec::new();
    for action in &playbook.actions {
        for drug_id in extract_referenced_formulary_drugs(action) {
            let eval = evaluate_drug_potency(drug_id, mission_sol, cumulative_habitat_gcr_gy);
            let depleted = inventory.is_some_and(|inv| inv.remaining_units(drug_id) == 0);
            if (eval.potency_pct < USP_POTENCY_FLOOR_PCT || depleted)
                && !subpotent_or_depleted.contains(&eval.drug_id)
            {
                subpotent_or_depleted.push(eval.drug_id);
            }
        }
    }
    if !subpotent_or_depleted.is_empty() {
        gates.gate5_formulary_substitution_active = true;
        let joined = subpotent_or_depleted.join(", ");
        if !playbook
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_EXMC_LYOPHILIZED_FORMULARY_SUBSTITUTION")
        {
            playbook.actions.push(CountermeasureAction {
                action_id: "ACT_EXMC_LYOPHILIZED_FORMULARY_SUBSTITUTION".to_string(),
                label: format!(
                    "GATE 5C ExMC FORMULARY NOTICE: Subpotent (<90% USP) or depleted stock [{joined}]; substitute lyophilized backup (Ertapenem / TXA)"
                ),
                category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                delta_rho_per_hour: 0.15,
            });
        }
        playbook.causal_chain_summary.push(format!(
            "GATE 5C FORMULARY SUBSTITUTION: Subpotent (<90%) or depleted ExMC stock for [{joined}]; lyophilized backup required"
        ));
    }

    // --- GATE 6: ARS Neutropenia (ANC < 0.5) & Thrombocytopenia (PLT < 75) Non-Emergent Invasive Lock ---
    let ars_neutropenic = radiation_ars.is_some_and(|r| {
        r.severe_neutropenia || (r.predicted_anc_k_ul.is_finite() && r.predicted_anc_k_ul < GATE6_ARS_ANC_FLOOR_K_UL)
    });
    let ars_thrombocytopenic = effective_platelets.is_some_and(|p| p < GATE6_ARS_PLATELET_FLOOR_K_UL);
    if ars_neutropenic || ars_thrombocytopenic {
        gates.gate6_radiation_neutropenic_invasive_locked = true;
        let mut locked_any = false;
        for action in &mut playbook.actions {
            let is_non_emergent_invasive = (action.category == "INVASIVE_PROCEDURE"
                || action.category == "ELECTIVE_INVASIVE_PROCEDURE")
                && !is_emergent_lifesaving_invasive(action);
            if is_non_emergent_invasive {
                locked_any = true;
                *action = CountermeasureAction {
                    action_id: "ACT_GATE6_ARS_NON_EMERGENT_INVASIVE_LOCKED".to_string(),
                    label: format!(
                        "GATE 6 ARS LOCK: Non-emergent invasive procedure [{}] blocked under ANC < 0.5 or PLT < 75 K/uL",
                        action.action_id
                    ),
                    category: "CLINICAL_SAFETY_GATE_OVERRIDE".to_string(),
                    delta_rho_per_hour: 0.0,
                };
            }
        }
        if locked_any {
            playbook.causal_chain_summary.push(
                "GATE 6 ARS LOCK: Non-emergent invasive procedures locked due to ANC < 0.5 K/uL or PLT < 75 K/uL".to_string(),
            );
        }
    }

    (playbook, gates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::telemetry::SafetyGates;

    fn sample_renal_playbook() -> ActivePlaybook {
        ActivePlaybook {
            playbook_id: "PLAYBOOK_10_RENAL_LITHIASIS".to_string(),
            title: "Playbook #10".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates::default(),
            actions: vec![CountermeasureAction {
                action_id: "ACT_ANALGESIA_KETOROLAC_TAMSULOSIN".to_string(),
                label: "Ketorolac + Tamsulosin".to_string(),
                category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                delta_rho_per_hour: 0.15,
            }],
        }
    }

    #[test]
    fn gate5a_locks_ketorolac_on_aki_oliguria_or_low_platelets_and_preserves_tamsulosin() {
        let profile = CrewBiologicalProfile::default();
        let bio = Biometrics {
            platelet_count_k_ul: Some(92.0),
            ..Default::default()
        };
        let (pb, gates) = enforce_extended_360_safety_gates(
            sample_renal_playbook(),
            &bio,
            None,
            &profile,
            None,
            None,
            100.0,
            0.02,
            None,
            None,
            false,
        );
        assert!(gates.gate5_nsaid_renal_bleeding_locked);
        assert!(pb.actions.iter().any(|a| {
            a.action_id == "ACT_RENAL_SAFE_ANALGESIA_ACETAMINOPHEN_FENTANYL_PLUS_TAMSULOSIN"
        }));

        // Also test Cr > 1.30 / oliguria trigger
        let bio_ok = Biometrics::default();
        let poct_aki = SpotPoctPanel {
            creatinine_mg_dl: Some(1.65),
            urine_output_l_d: Some(0.40),
            ..Default::default()
        };
        let (_, gates_aki) = enforce_extended_360_safety_gates(
            sample_renal_playbook(),
            &bio_ok,
            Some(&poct_aki),
            &profile,
            None,
            None,
            100.0,
            0.02,
            None,
            None,
            false,
        );
        assert!(gates_aki.gate5_nsaid_renal_bleeding_locked);
    }

    #[test]
    fn gate5b_handles_g6pd_beta_lactam_allergy_and_additive_qtc_lock() {
        let profile = CrewBiologicalProfile {
            g6pd_deficient: true,
            drug_allergies: vec!["Penicillin".to_string()],
            baseline_qtc_ms: Some(470.0),
            ..Default::default()
        };
        let pb_in = ActivePlaybook {
            playbook_id: "PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE".to_string(),
            title: "Tox + Abx + Antiemetic".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates::default(),
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_TOX_METHYLENE_BLUE_1_2MG_KG_IV".to_string(),
                    label: "Methylene Blue".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.2,
                },
                CountermeasureAction {
                    action_id: "ACT_SEPSIS_1H_BROAD_SPECTRUM_IV_ANTIBIOTICS".to_string(),
                    label: "Piperacillin-Tazobactam".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.3,
                },
                CountermeasureAction {
                    action_id: "ACT_ANTIEMETIC_ONDANSETRON_4MG_IV".to_string(),
                    label: "Ondansetron 4mg IV".to_string(),
                    category: "PHARMACOLOGICAL_QTC_PROLONGING".to_string(),
                    delta_rho_per_hour: 0.1,
                },
                CountermeasureAction {
                    action_id: "ACT_AGITATION_HALOPERIDOL_5MG_IM".to_string(),
                    label: "Haloperidol 5mg IM".to_string(),
                    category: "PHARMACOLOGICAL_QTC_PROLONGING".to_string(),
                    delta_rho_per_hour: 0.1,
                },
            ],
        };

        let (pb_out, gates) = enforce_extended_360_safety_gates(
            pb_in,
            &Biometrics::default(),
            None,
            &profile,
            None,
            None,
            50.0,
            0.01,
            None,
            None,
            false,
        );
        assert!(gates.gate5_allergy_or_qtc_locked);
        assert!(pb_out
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_TOX_ASCORBIC_ACID_HIGH_DOSE_IV"));
        assert!(pb_out.actions.iter().any(|a| {
            a.action_id == "ACT_ABX_BETA_LACTAM_ALLERGY_CLINDAMYCIN_LEVOFLOXACIN_METRONIDAZOLE"
        }));
        assert!(pb_out
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_QTC_LOCK_MAGNESIUM_2G_IV_CONTINUOUS_ECG"));
        assert!(!pb_out
            .actions
            .iter()
            .any(|a| a.action_id.contains("ONDANSETRON") || a.action_id.contains("HALOPERIDOL")));
    }

    #[test]
    fn gate5c_and_gate6_trigger_on_subpotent_depleted_stock_and_ars_neutropenia() {
        let mut inv = MedicalConsumableInventory::mars_exmc_baseline();
        inv.set_units("EPINEPHRINE", 0);
        let ars = RadiationArsState {
            predicted_anc_k_ul: 0.35,
            predicted_plt_k_ul: 65.0,
            severe_neutropenia: true,
            ..Default::default()
        };
        let pb_in = ActivePlaybook {
            playbook_id: "PLAYBOOK_26_ACUTE_RADIATION_SYNDROME".to_string(),
            title: "ARS".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates::default(),
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_EPINEPHRINE_IM".to_string(),
                    label: "Epinephrine".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.3,
                },
                CountermeasureAction {
                    action_id: "ACT_ELECTIVE_CENTRAL_LINE_PLACEMENT".to_string(),
                    label: "Central line".to_string(),
                    category: "INVASIVE_PROCEDURE".to_string(),
                    delta_rho_per_hour: 0.1,
                },
            ],
        };

        let (pb_out, gates) = enforce_extended_360_safety_gates(
            pb_in,
            &Biometrics::default(),
            None,
            &CrewBiologicalProfile::default(),
            Some(&ars),
            Some(&inv),
            600.0,
            0.20,
            None,
            None,
            false,
        );
        assert!(gates.gate5_formulary_substitution_active);
        assert!(gates.gate6_radiation_neutropenic_invasive_locked);
        assert!(pb_out
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_EXMC_LYOPHILIZED_FORMULARY_SUBSTITUTION"));
        assert!(pb_out
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_GATE6_ARS_NON_EMERGENT_INVASIVE_LOCKED"));
    }
}
