//! Fase 02 (A2): Costanti fisiche e normative NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F.

/// Viscosita dinamica media del sangue umano a 37°C in Poise (dyn·s/cm^2).
pub const BLOOD_VISCOSITY_POISE: f64 = 0.035;

/// Soglia di deformazione meccanica del meccanostato di Frost (microstrain).
pub const FROST_MECHANOSTAT_STRAIN_UE: f64 = 1000.0;

/// Esponente di Hill per l'inibizione meccanica della Sclerostina (Robling et al. 2008).
pub const SOST_HILL_EXPONENT: f64 = 2.0;

/// Shear stress giugulare nominale a 1g/baseline (dyn/cm^2) e soglia critica protrombotica.
pub const TAU_W_NOMINAL_DYN_CM2: f64 = 2.80;
pub const TAU_W_CRITICAL_DYN_CM2: f64 = 1.20;

/// Velocita di picco giugulare sotto la quale si configura stasi severa (cm/s).
pub const IJV_STASIS_VMAX_CM_S: f64 = 5.0;

/// Carico resistivo giornaliero ARED nominale e critico (kgf).
pub const ARED_NOMINAL_LOAD_KGF: f64 = 125.0;
pub const ARED_CRITICAL_LOAD_KGF: f64 = 55.0;

/// Sclerostina sierica nominale e critica (pmol/L).
pub const SOST_NOMINAL_PMOL_L: f64 = 24.0;
pub const SOST_CRITICAL_PMOL_L: f64 = 55.0;

/// RMSSD vagale nominale e critico (ms).
pub const RMSSD_NOMINAL_MS: f64 = 48.0;
pub const RMSSD_CRITICAL_MS: f64 = 20.0;

/// Indice composito SANS nominale e critico (adimensionale 0..1).
pub const SANS_NOMINAL_INDEX: f64 = 0.15;
pub const SANS_CRITICAL_INDEX: f64 = 0.70;

/// Soglia minima di qualita del segnale (Spectral Entropy SQI) per accettare derivati.
pub const SQI_MIN_VALID_THRESHOLD: f64 = 0.70;

/// Hard Safety Gate 1: Tetto massimo di probabilita a posteriori di trombo senza conferma POCUS.
pub const PRE_POCUS_MAX_THROMBUS_PROB: f64 = 0.45;

/// Hard Safety Gate 2: Limiti emodinamici anti-sincope durante camera LBNP a -30 mmHg.
pub const LBNP_MAX_SYS_BP_DROP_MMHG: f64 = 15.0;
pub const LBNP_MAX_SAFE_HR_BPM: f64 = 115.0;

/// Hard Safety Gate 3: Soglia massima di asimmetria del passo (GAI %) a 0.38g (Marte).
pub const GAI_MAX_SAFE_PCT: f64 = 12.0;

/// Limite massimo ammissibile di ppCO2 in cabina secondo NASA-STD-3001 (mmHg).
pub const MAX_SAFE_CABIN_PPCO2_MMHG: f64 = 3.0;

/// Soglia di rischio litiasico renale da supersaturazione ossalato di calcio (Tiselius RSR).
pub const RSR_CALCIUM_OXALATE_ATTENTION: f64 = 2.5;
pub const RSR_CALCIUM_OXALATE_CRITICAL: f64 = 4.5;

/// Soglie di Shock Index (HR / SBP) per ipovolemia e rischio collasso ortostatico.
pub const SHOCK_INDEX_ATTENTION: f64 = 0.90;
pub const SHOCK_INDEX_CRITICAL: f64 = 1.20;

/// Durata nominale di un Sol marziano in secondi (24 ore, 39 minuti, 35.244 secondi).
pub const MARS_SOL_SECONDS: f64 = 88775.244;

/// Quota minima di fototerapia melanopica ad alto spettro blu-arricchito (EDI Lux).
pub const MELANOPIC_LUX_THERAPY_MIN: f64 = 400.0;

/// Limite massimo di token per singola risposta FastMCP Context-Mode (< 150 token ~= 600 byte).
pub const MAX_MCP_CONTEXT_MODE_BYTES: usize = 600;

/// Sanitizza un valore `f64` sostituendo `NaN` o `Infinity` con un valore sicuro di fallback.
#[inline]
pub fn sanitize_f64(val: f64, fallback: f64) -> f64 {
    if val.is_finite() {
        val
    } else {
        fallback
    }
}
