//! Fase 01 (A1): Contratti telemetrici condivisi conformi a `contracts/telemetry_schema.json`.
//!
//! Rispetta gli invarianti della Issue #4 (@MiServeRDC):
//! 1. Separazione esplicita tra `RECORDED_TERRESTRIAL_BIDMC_CSV`, `DERIVED_COMPUTED`
//!    e `SIMULATED_SCENARIO_INPUT`.
//! 2. Supporto nativo `Option<f64>` (`null` in JSON) per canali biometrici mancanti
//!    (es. i 13 campioni mancanti di PULSE/SpO2 in `bidmc_01_Numerics.csv`).
//! 3. Distinzione tra tempo nativo di registrazione (`relative_recording_time_s` a 1 Hz)
//!    e frequenza di refresh UI (`20 Hz`).

use serde::{Deserialize, Serialize};

/// Fase operativa secondo la traccia NASA Space Apps 2026 (`1. GATHER -> 2. EVALUATE -> 3. ACT`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SystemPhase {
    Gather,
    Evaluate,
    Act,
}

/// Gravita globale di allerta clinica conforme a NASA-STD-3001 Vol. 2 Rev F.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AlertSeverity {
    Nominal,
    DataDegradedMissingChannels,
    Caution,
    Warning,
    CriticalEmergency,
}

/// Origine dei segnali biometrici cardiorespiratori (Issue #4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BiometricsSource {
    RecordedTerrestrialBidmcCsv,
    SimulatedScenarioInput,
}

/// Modalita di calcolo dei sottosistemi fisiopatologici e di scenario.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScenarioOverlayMode {
    NonePureReplay,
    SimulatedWhatifScenario,
    DerivedAndSimulated,
}

/// Ragione esplicita per cui l'HRV beat-to-beat non e disponibile su sorgenti numeriche 1 Hz.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HrvUnavailableReason {
    BeatIntervalsNotAvailable,
}

/// Manifesto di provenienza dei dati allegato a ogni pacchetto telemetrico.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProvenanceManifest {
    pub biometrics_source: BiometricsSource,
    pub biometrics_native_rate_hz: f64,
    pub ui_refresh_rate_hz: f64,
    pub scenario_overlay_mode: ScenarioOverlayMode,
    pub biological_context_refs: Vec<String>,
}

/// Stato direzionale del flusso nella vena giugulare interna (Marshall-Goebel et al. 2019).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JugularFlowGrade {
    NormalContinuous,
    PulsatileReduced,
    StagnantBidirectional,
    Retrograde,
    OccludedThrombus,
}

/// Segnali biometrici, autonomici ed esposizione radiologica (`1. GATHER`).
/// I campi provenienti da sensori fisici o CSV BIDMC usano `Option<f64>` per non
/// convertire mai campioni mancanti (`NaN`/vuoti) in falsi zeri fisiologici.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Biometrics {
    pub heart_rate_bpm: Option<f64>,
    pub pulse_rate_bpm: Option<f64>,
    pub resp_rate_brpm: Option<f64>,
    pub spo2_pct: Option<f64>,
    pub rmssd_ms: Option<f64>,
    #[serde(default)]
    pub hrv_unavailable_reason: Option<HrvUnavailableReason>,
    pub sdnn_ms: Option<f64>,
    pub pnn50_pct: Option<f64>,
    pub lf_hf_ratio: Option<f64>,
    pub vocal_f0_hz: Option<f64>,
    pub vocal_jitter_pct: Option<f64>,
    pub radiation_dose_rate_msv_d: f64,
    pub sqi_score: f64,
    pub missing_channels: Vec<String>,
    #[serde(default)]
    pub quality_flags: Vec<String>,
}

/// Metriche di meccanotrasduzione muscoloscheletrica (`DERIVED_COMPUTED` + `SIMULATED_SCENARIO_INPUT`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Musculoskeletal {
    pub ared_daily_load_kgf: f64,
    pub soleus_csa_pct: f64,
    pub echo_intensity_au: f64,
    pub mqi_index: f64,
    pub sclerostin_pmol_l: f64,
    pub urinary_calcium_mg_d: f64,
    pub gai_pct: f64,
}

/// Emodinamica della vena giugulare interna (IJV) e stato contromisura LBNP.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct JugularHemodynamics {
    pub ijv_csa_mm2: f64,
    pub ijv_vmax_cm_s: f64,
    pub tau_w_dyn_cm2: f64,
    pub flow_grade: JugularFlowGrade,
    pub pocus_thrombus_confirmed: bool,
    pub lbnp_active: bool,
    pub lbnp_pressure_mmhg: f64,
}

/// Biomarcatori Spaceflight-Associated Neuro-Ocular Syndrome (SANS).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SansOcular {
    pub onsd_mm: f64,
    pub choroidal_delta_um: f64,
    pub sans_risk_index: f64,
}

/// Margini normalizzati di robustezza temporale NQS-STL (`2. EVALUATE`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct NqsStlMargins {
    pub rho_tau_w: f64,
    pub rho_ared: f64,
    pub rho_sost: f64,
    pub rho_rmssd: Option<f64>,
    pub rho_sans: f64,
    pub rho_global: Option<f64>,
    pub ttv_hours: Option<f64>,
    pub ttv_ci95_low_hours: Option<f64>,
    pub ttv_ci95_high_hours: Option<f64>,
    pub mri_pct: Option<f64>,
}

impl NqsStlMargins {
    /// Known non-HRV or available violations remain actionable when HRV is unavailable.
    #[inline]
    pub fn has_known_violation(&self) -> bool {
        [self.rho_tau_w, self.rho_ared, self.rho_sost, self.rho_sans]
            .into_iter()
            .any(|rho| rho < 0.0)
            || self.rho_rmssd.is_some_and(|rho| rho < 0.0)
            || self.rho_global.is_some_and(|rho| rho < 0.0)
    }

    /// Minimum margin over all available predicates (never fabricates missing HRV).
    #[inline]
    pub fn min_known_margin(&self) -> f64 {
        let base = self
            .rho_tau_w
            .min(self.rho_ared)
            .min(self.rho_sost)
            .min(self.rho_sans);
        self.rho_rmssd.map_or(base, |rho| base.min(rho))
    }
}

/// Stato dei 3 Hard Clinical Safety Gates salvavita (`3. ACT`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafetyGates {
    pub anticoagulant_lock_active: bool,
    pub lbnp_auto_vent_armed: bool,
    pub eva_suit_damping_active: bool,
}

/// Singola azione di contromisura ordinata per impatto sul margine NQS-STL.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CountermeasureAction {
    pub action_id: String,
    pub label: String,
    pub category: String,
    pub delta_rho_per_hour: f64,
}

/// Playbook operativo MedOps attivo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActivePlaybook {
    pub playbook_id: String,
    pub title: String,
    pub causal_chain_summary: Vec<String>,
    pub safety_gates: SafetyGates,
    pub actions: Vec<CountermeasureAction>,
}

/// Pacchetto telemetrico completo a 20 Hz conforme a `contracts/telemetry_schema.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TelemetryPacket {
    pub timestamp_utc: String,
    #[serde(alias = "mission_elapsed_seconds")]
    pub mission_Elapsed_seconds: f64,
    pub relative_recording_time_s: f64,
    pub source_record_id: String,
    pub flight_day: u32,
    pub astronaut_id: String,
    pub system_phase: SystemPhase,
    pub alert_severity: AlertSeverity,
    pub provenance_manifest: ProvenanceManifest,
    pub biometrics: Biometrics,
    pub musculoskeletal: Musculoskeletal,
    pub jugular_hemodynamics: JugularHemodynamics,
    pub sans_ocular: SansOcular,
    pub nqs_stl: NqsStlMargins,
    pub active_playbook: ActivePlaybook,
}

/// Input inviato dalla What-If Stress-Test Console (`POST /api/stress-test`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StressTestScenarioInput {
    pub source_record_id: String,
    pub flight_day: u32,
    pub ared_daily_load_kgf: f64,
    pub radiation_dose_rate_msv_d: f64,
    pub lbnp_active: bool,
    pub lbnp_pressure_mmhg: f64,
    pub pocus_thrombus_confirmed: bool,
    pub systolic_bp_drop_mmhg: f64,
}
