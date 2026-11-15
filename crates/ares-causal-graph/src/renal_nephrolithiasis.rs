//! Module computing renal lithiasis risk from calcium oxalate supersaturation (RSR),
//! cabin hypercapnia-induced urinary citrate suppression, and bladder monitoring (Gap 1).

use ares_core_types::constants::{
    RSR_CALCIUM_OXALATE_ATTENTION, RSR_CALCIUM_OXALATE_CRITICAL, sanitize_f64,
};
use ares_core_types::telemetry::{RenalNephrolithiasis, SpotPoctPanel};

/// Tiselius empirical proportionality constant for calcium oxalate RSR
/// calibrated to 1.00 on nominal physiological values (Ca=140 mg/d, Cit=640 mg/d, V=2.0 L/d).
pub const K_RSR_SCALE: f64 = 0.255;

/// Nominal physiological baseline of daily urinary citrate excretion (mg/d).
pub const CITRATE_BASELINE_MG_D: f64 = 640.0;

/// Incremental citrate intake from oral potassium citrate supplementation (mg/d).
pub const DELTA_CITRATE_K_CITRATE_MG_D: f64 = 250.0;

/// Computes the estimated daily urine output volume (L/d) from fluid intake.
#[inline]
pub fn estimate_urine_output_l_d(daily_fluid_intake_l: f64, poct: Option<&SpotPoctPanel>) -> f64 {
    if let Some(panel) = poct
        && let Some(vol) = panel.urine_output_l_d
        && vol.is_finite() && vol > 0.0
    {
        return vol.clamp(0.40, 5.0);
    }
    let intake = sanitize_f64(daily_fluid_intake_l, 2.5).clamp(0.5, 6.0);
    // Insensible loss of about 0.85 L/d (respiration and cutaneous perspiration)
    (intake - 0.85).clamp(0.50, 4.0)
}

/// Computes the estimated urinary citrate excretion (mg/d), accounting for hypercapnia-induced tubular acidosis
/// and the efficacy of oral potassium citrate therapy.
#[inline]
pub fn compute_urinary_citrate_mg_d(
    cabin_ppco2_mmhg: f64,
    k_citrate_active: bool,
    poct: Option<&SpotPoctPanel>,
) -> f64 {
    if let Some(panel) = poct
        && let Some(cit) = panel.urinary_citrate_mg_d
        && cit.is_finite() && cit > 0.0
    {
        return cit.clamp(50.0, 1200.0);
    }
    let ppco2 = sanitize_f64(cabin_ppco2_mmhg, 1.8).max(0.0);
    let hypercapnia_suppression = 38.0 * (ppco2 - 2.0).max(0.0);
    let k_citrate_bonus = if k_citrate_active {
        DELTA_CITRATE_K_CITRATE_MG_D
    } else {
        0.0
    };
    (CITRATE_BASELINE_MG_D + k_citrate_bonus - hypercapnia_suppression).clamp(120.0, 950.0)
}

/// Urinary pH correction factor for the crystalline precipitation risk.
#[inline]
pub fn compute_ph_correction_factor(urinary_ph: f64) -> f64 {
    let ph = sanitize_f64(urinary_ph, 6.0).clamp(4.5, 8.5);
    if ph > 6.2 {
        1.0 + 0.35 * (ph - 6.0)
    } else if ph < 5.8 {
        1.0 + 0.25 * (6.0 - ph)
    } else {
        1.0
    }
}

/// Computes the Tiselius relative supersaturation index AP(CaOx) RSR.
#[inline]
pub fn compute_rsr_calcium_oxalate(
    urinary_calcium_mg_d: f64,
    urinary_citrate_mg_d: f64,
    urine_output_l_d: f64,
    urinary_ph: f64,
) -> f64 {
    let ca = sanitize_f64(urinary_calcium_mg_d, 180.0).max(10.0);
    let cit = sanitize_f64(urinary_citrate_mg_d, 640.0).max(50.0);
    let v_u = sanitize_f64(urine_output_l_d, 1.5).max(0.2);

    let ca_conc = ca / v_u;
    let cit_conc = cit / v_u;
    let phi_ph = compute_ph_correction_factor(urinary_ph);

    let rsr = K_RSR_SCALE * (ca_conc / cit_conc.sqrt()) * phi_ph;
    sanitize_f64(rsr, 1.0).clamp(0.1, 15.0)
}

/// Computes the complete `RenalNephrolithiasis` state integrating calcium excretion from bone remodeling,
/// fluid balance, cabin hypercapnia, and POCUS findings.
pub fn compute_renal_nephrolithiasis_state(
    urinary_calcium_mg_d: f64,
    daily_fluid_intake_l: f64,
    cabin_ppco2_mmhg: f64,
    k_citrate_active: bool,
    poct: Option<&SpotPoctPanel>,
    pocus_hydronephrosis_confirmed: bool,
    post_void_bladder_volume_ml: f64,
) -> RenalNephrolithiasis {
    let urine_vol = estimate_urine_output_l_d(daily_fluid_intake_l, poct);
    let citrate = compute_urinary_citrate_mg_d(cabin_ppco2_mmhg, k_citrate_active, poct);
    let ph = poct
        .and_then(|p| p.urine_ph)
        .filter(|&v| v.is_finite())
        .unwrap_or(6.0);

    let rsr = compute_rsr_calcium_oxalate(urinary_calcium_mg_d, citrate, urine_vol, ph);

    // Renal colic risk index (0.0..1.0)
    let colic_risk = if pocus_hydronephrosis_confirmed {
        0.95
    } else if rsr >= RSR_CALCIUM_OXALATE_CRITICAL {
        0.82
    } else if rsr >= RSR_CALCIUM_OXALATE_ATTENTION {
        0.48
    } else {
        (rsr / 5.0).clamp(0.05, 0.40)
    };

    RenalNephrolithiasis {
        estimated_urine_output_l_d: urine_vol,
        urinary_citrate_mg_d: citrate,
        urinary_ph: ph,
        rsr_calcium_oxalate: rsr,
        renal_colic_risk_index: colic_risk,
        pocus_hydronephrosis_confirmed,
        post_void_bladder_volume_ml: post_void_bladder_volume_ml.clamp(0.0, 800.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_renal_rsr_increases_with_calcium_and_drops_with_hydration() {
        // Nominal baseline: Ca=180 mg/d, Fluid=2.5 L/d -> urine=1.65 L/d, Citrate=640 mg/d
        let nom = compute_renal_nephrolithiasis_state(180.0, 2.5, 1.8, false, None, false, 30.0);
        assert!(nom.rsr_calcium_oxalate < RSR_CALCIUM_OXALATE_ATTENTION);

        // Hypercalciuria from bone demineralization (Ca=360 mg/d) and dehydration (Fluid=1.2 L/d)
        let risk = compute_renal_nephrolithiasis_state(360.0, 1.2, 3.5, false, None, false, 60.0);
        assert!(risk.rsr_calcium_oxalate >= RSR_CALCIUM_OXALATE_CRITICAL);
        assert!(risk.renal_colic_risk_index > 0.70);

        // Countermeasure: Fluid bolus (3.5 L/d) and K-citrate oral supplement
        let treated = compute_renal_nephrolithiasis_state(360.0, 3.5, 3.5, true, None, false, 60.0);
        assert!(treated.rsr_calcium_oxalate < risk.rsr_calcium_oxalate);
        assert!(treated.urinary_citrate_mg_d > risk.urinary_citrate_mg_d);
    }
}
