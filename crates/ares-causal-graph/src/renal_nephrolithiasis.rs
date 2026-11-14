//! Modulo di calcolo del rischio litiasico renale da supersaturazione (RSR) di ossalato di calcio,
//! soppressione del citrato urinario indotta da ipercapnia in cabina e monitoraggio vescicale (Gap 1).

use ares_core_types::constants::{
    RSR_CALCIUM_OXALATE_ATTENTION, RSR_CALCIUM_OXALATE_CRITICAL, sanitize_f64,
};
use ares_core_types::telemetry::{RenalNephrolithiasis, SpotPoctPanel};

/// Costante di proporzionalita empirica di Tiselius per RSR di ossalato di calcio
/// calibrata a 1.00 sui valori fisiologici nominali (Ca=140 mg/d, Cit=640 mg/d, V=2.0 L/d).
pub const K_RSR_SCALE: f64 = 0.255;

/// Baseline fisiologica nominale di escrezione giornaliera di citrato urinario (mg/d).
pub const CITRATE_BASELINE_MG_D: f64 = 640.0;

/// Apporto incrementale di citrato derivante da supplementazione di citrato di potassio orale (mg/d).
pub const DELTA_CITRATE_K_CITRATE_MG_D: f64 = 250.0;

/// Calcola il volume stimato di diuresi giornaliera (L/d) a partire dall'introito idrico.
#[inline]
pub fn estimate_urine_output_l_d(daily_fluid_intake_l: f64, poct: Option<&SpotPoctPanel>) -> f64 {
    if let Some(panel) = poct
        && let Some(vol) = panel.urine_output_l_d
        && vol.is_finite() && vol > 0.0
    {
        return vol.clamp(0.40, 5.0);
    }
    let intake = sanitize_f64(daily_fluid_intake_l, 2.5).clamp(0.5, 6.0);
    // Perdita insensibile di circa 0.85 L/d (respirazione e traspirazione cutanea)
    (intake - 0.85).clamp(0.50, 4.0)
}

/// Calcola l'escrezione stimata di citrato urinario (mg/d), tenendo conto dell'acidosi tubulare da ipercapnia
/// e dell'efficacia della terapia orale con citrato di potassio.
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

/// Fattore correttivo del pH urinario per il rischio di precipitazione cristallina.
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

/// Calcola l'indice di supersaturazione relativa di Tiselius AP(CaOx) RSR.
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

/// Calcola lo stato completo `RenalNephrolithiasis` integrando escrezione di calcio dal rimodellamento osseo,
/// bilancio idrico, ipercapnia in cabina e riscontri POCUS.
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

    // Indice di rischio colica renale (0.0..1.0)
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
