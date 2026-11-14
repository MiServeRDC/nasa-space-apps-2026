//! PROVISIONAL input state for the MedOps engine.
//!
//! Replace with the shared types from `ares-core-types` once they exist.
//! Field names follow `contracts/telemetry_schema.json` where the schema has them.
//! Every clinical value is `Option<f64>`: `None` means the channel is missing (null).
//! Non-finite values (NaN, infinity) are treated as missing, see [`finite`].

use serde::{Deserialize, Serialize};

/// Complete snapshot the engine evaluates on each tick.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ClinicalState {
    pub vitals: Vitals,
    pub jugular: Jugular,
    pub lbnp: Lbnp,
    pub musculoskeletal: Musculoskeletal,
    pub neuro_ocular: NeuroOcular,
    pub environment: Environment,
}

/// Schema `biometrics` subset.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Vitals {
    pub heart_rate_bpm: Option<f64>,
    pub spo2_percent: Option<f64>,
    pub respiration_rate_brpm: Option<f64>,
}

/// Schema `hemodynamics` subset (internal jugular vein).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Jugular {
    pub ijv_csa_cm2: Option<f64>,
    pub ijv_velocity_max_cm_s: Option<f64>,
    pub wall_shear_stress_dyn_cm2: Option<f64>,
    /// Gate 1 input. `None` = POCUS not performed, treated as NOT confirmed.
    pub pocus_thrombus_confirmed: Option<bool>,
}

/// NOT YET IN SCHEMA: LBNP chamber and blood pressure (Gate 2 inputs).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Lbnp {
    /// True while the chamber is pressurised below ambient.
    pub active: bool,
    pub chamber_pressure_mmhg: Option<f64>,
    /// Systolic BP measured before the session started.
    pub baseline_systolic_bp_mmhg: Option<f64>,
    pub current_systolic_bp_mmhg: Option<f64>,
}

/// Schema `musculoskeletal` subset plus fields not yet in schema.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Musculoskeletal {
    /// NOT YET IN SCHEMA. Post-landing IMU Gait Asymmetry Index in percent (Gate 3).
    pub gait_asymmetry_index_pct: Option<f64>,
    /// NOT YET IN SCHEMA. Soleus volume reduction from pre-flight baseline, percent.
    pub soleus_volume_loss_pct: Option<f64>,
    /// NOT YET IN SCHEMA. Estimated calcaneus BMD loss rate, percent per month.
    pub bmd_loss_pct_per_month: Option<f64>,
    /// True after landing on a planetary surface (0.38 g Mars, 0.16 g Moon).
    pub post_landing: bool,
}

/// NOT YET IN SCHEMA: SANS inputs.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NeuroOcular {
    pub optic_nerve_sheath_diameter_mm: Option<f64>,
}

/// Schema `environment` subset plus cabin ppCO2.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Environment {
    /// NOT YET IN SCHEMA as mmHg (schema has `cabin_co2_ppm`).
    pub cabin_ppco2_mmhg: Option<f64>,
    pub ambient_radiation_rate_ugy_h: Option<f64>,
    pub cumulative_radiation_mgy: Option<f64>,
}

/// Returns the value only when it is present and finite.
pub fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|v| v.is_finite())
}
