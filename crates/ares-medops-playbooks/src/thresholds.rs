//! Clinical thresholds, kept in one place so the team can review and tune them.
//!
//! Sources are the project dossier (`ARES_Health_Master_Architecture.md`,
//! `docs/plans/RUST_ENGINE_PHASED_MASTER_PLAN.md`). Values marked PROVISIONAL
//! were not found in the dossier and must be validated by the team.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClinicalThresholds {
    // Playbook #01: jugular venous stasis.
    /// tau_w below this (dyn/cm^2) indicates stasis.
    pub stasis_wall_shear_stress_dyn_cm2: f64,
    /// v_max below this (cm/s) indicates stasis.
    pub stasis_velocity_max_cm_s: f64,

    // Gate 2: LBNP anti-syncope guardrail.
    /// Prescribed LBNP session pressure (mmHg, negative).
    pub lbnp_session_pressure_mmhg: f64,
    /// Systolic drop from baseline (mmHg) that forces venting.
    pub lbnp_max_systolic_drop_mmhg: f64,
    /// Heart rate (bpm) that forces venting.
    pub lbnp_max_heart_rate_bpm: f64,

    // Playbook #03: sarcopenia / osteopenia.
    pub sarcopenia_soleus_volume_loss_pct: f64,
    pub osteopenia_bmd_loss_pct_per_month: f64,
    /// ARED eccentric load increase prescribed by Playbook #03 (percent).
    pub ared_eccentric_increase_pct: f64,

    // Playbook #04: SANS.
    pub sans_ppco2_mmhg: f64,
    pub sans_onsd_mm: f64,

    // Playbook #05: SPE radiation shelter.
    /// PROVISIONAL: ambient dose rate (uGy/h) that triggers storm-shelter entry.
    pub spe_dose_rate_ugy_h: f64,

    // Gate 3: Martian landing gait.
    pub gait_asymmetry_max_pct: f64,
    /// Suit ankle/knee damping increase (percent) when Gate 3 fires.
    pub suit_damping_increase_pct: f64,
}

impl Default for ClinicalThresholds {
    fn default() -> Self {
        Self {
            stasis_wall_shear_stress_dyn_cm2: 4.0,
            stasis_velocity_max_cm_s: 5.0,
            lbnp_session_pressure_mmhg: -30.0,
            lbnp_max_systolic_drop_mmhg: 15.0,
            lbnp_max_heart_rate_bpm: 115.0,
            sarcopenia_soleus_volume_loss_pct: 3.0,
            osteopenia_bmd_loss_pct_per_month: 1.0,
            ared_eccentric_increase_pct: 15.0,
            sans_ppco2_mmhg: 3.0,
            sans_onsd_mm: 5.8,
            spe_dose_rate_ugy_h: 1000.0,
            gait_asymmetry_max_pct: 12.0,
            suit_damping_increase_pct: 25.0,
        }
    }
}
