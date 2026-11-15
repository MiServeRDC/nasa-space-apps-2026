//! Phase 02 (A2): Physical and regulatory NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F constants.

/// Mean dynamic viscosity of human blood at 37°C in Poise (dyn·s/cm^2).
pub const BLOOD_VISCOSITY_POISE: f64 = 0.035;

/// Mechanical strain threshold of the Frost mechanostat (microstrain).
pub const FROST_MECHANOSTAT_STRAIN_UE: f64 = 1000.0;

/// Hill exponent for the mechanical inhibition of Sclerostin (Robling et al. 2008).
pub const SOST_HILL_EXPONENT: f64 = 2.0;

/// Nominal jugular shear stress at 1g/baseline (dyn/cm^2) and critical prothrombotic threshold.
pub const TAU_W_NOMINAL_DYN_CM2: f64 = 2.80;
pub const TAU_W_CRITICAL_DYN_CM2: f64 = 1.20;

/// Jugular peak velocity below which severe stasis occurs (cm/s).
pub const IJV_STASIS_VMAX_CM_S: f64 = 5.0;

/// Nominal and critical daily ARED resistive load (kgf).
pub const ARED_NOMINAL_LOAD_KGF: f64 = 125.0;
pub const ARED_CRITICAL_LOAD_KGF: f64 = 55.0;

/// Nominal and critical serum Sclerostin (pmol/L).
pub const SOST_NOMINAL_PMOL_L: f64 = 24.0;
pub const SOST_CRITICAL_PMOL_L: f64 = 55.0;

/// Nominal and critical vagal RMSSD (ms).
pub const RMSSD_NOMINAL_MS: f64 = 48.0;
pub const RMSSD_CRITICAL_MS: f64 = 20.0;

/// Nominal and critical composite SANS index (dimensionless 0..1).
pub const SANS_NOMINAL_INDEX: f64 = 0.15;
pub const SANS_CRITICAL_INDEX: f64 = 0.70;

/// Minimum signal quality threshold (Spectral Entropy SQI) for accepting derived values.
pub const SQI_MIN_VALID_THRESHOLD: f64 = 0.70;

/// Hard Safety Gate 1: Maximum posterior thrombus probability ceiling without POCUS confirmation.
pub const PRE_POCUS_MAX_THROMBUS_PROB: f64 = 0.45;

/// Hard Safety Gate 2: Anti-syncope hemodynamic limits during the LBNP chamber at -30 mmHg.
pub const LBNP_MAX_SYS_BP_DROP_MMHG: f64 = 15.0;
pub const LBNP_MAX_SAFE_HR_BPM: f64 = 115.0;
/// Minimum heart rate threshold below which vasovagal bradycardia protection activates (bpm).
pub const LBNP_MIN_SAFE_HR_BRADYCARDIA_BPM: f64 = 50.0;
/// Maximum heart rate drop relative to the pre-LBNP baseline before automatic venting (bpm).
pub const LBNP_MAX_VASOVAGAL_HR_DROP_BPM: f64 = 25.0;

/// Hard Safety Gate 3: Maximum gait asymmetry threshold (GAI %) at 0.38g (Mars).
pub const GAI_MAX_SAFE_PCT: f64 = 12.0;

/// Tier 1: Nominal chronic limit / early SANS alert for cabin ppCO2 per NASA-STD-3001 [V2 6004] (mmHg).
pub const MAX_SAFE_CABIN_PPCO2_MMHG: f64 = 3.0;
/// Tier 2: Acute operational limit for CDRA / amine / LiOH scrubber intervention (mmHg).
pub const ECLSS_PPCO2_ACTION_LIMIT_MMHG: f64 = 4.0;
/// Tier 3: Emergency threshold (1.0 kPa) for immediate O2 mask / PBA donning (mmHg).
pub const ECLSS_PPCO2_EMERGENCY_MMHG: f64 = 7.6;

/// Renal lithiasis risk threshold from calcium oxalate supersaturation (Tiselius RSR).
pub const RSR_CALCIUM_OXALATE_ATTENTION: f64 = 2.5;
pub const RSR_CALCIUM_OXALATE_CRITICAL: f64 = 4.5;

/// Shock Index (HR / SBP) thresholds for hypovolemia and orthostatic collapse risk.
pub const SHOCK_INDEX_ATTENTION: f64 = 0.90;
pub const SHOCK_INDEX_CRITICAL: f64 = 1.20;

/// Nominal duration of a Martian Sol in seconds (24 hours, 39 minutes, 35.244 seconds).
pub const MARS_SOL_SECONDS: f64 = 88775.244;

/// Minimum dose of high blue-enriched spectrum melanopic phototherapy (EDI Lux).
pub const MELANOPIC_LUX_THERAPY_MIN: f64 = 400.0;

/// Maximum token limit per single FastMCP Context-Mode response (< 150 tokens ~= 600 bytes).
pub const MAX_MCP_CONTEXT_MODE_BYTES: usize = 600;

/// Sanitizes an `f64` value by replacing `NaN` or `Infinity` with a safe fallback value.
#[inline]
pub fn sanitize_f64(val: f64, fallback: f64) -> f64 {
    if val.is_finite() {
        val
    } else {
        fallback
    }
}
