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
    HardwareWearable,
}

/// Modalita di calcolo dei sottosistemi fisiopatologici e di scenario.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScenarioOverlayMode {
    NonePureReplay,
    SimulatedWhatifScenario,
    DerivedAndSimulated,
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

/// Terrestrial dataset scope used for technical out-of-sample benchmarking (never spaceflight validation).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TerrestrialBenchmarkScope {
    BidmcNumericsShortSubHorizon,
    BidmcPlusFantasiaBeatIntervals,
    MultiCohortPhysioNetUciTerrestrial,
}

/// 32-byte SHA-256 digest (`Copy` on stack) serialized in JSON as a 64-character lowercase hex string.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
pub struct Sha256DigestHex(pub [u8; 32]);

impl Sha256DigestHex {
    /// Zero-filled placeholder digest (all zeros).
    pub const ZERO: Self = Self([0u8; 32]);

    #[inline]
    pub const fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    #[inline]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Parses a 64-character hexadecimal string (case-insensitive) into a `Sha256DigestHex`.
    pub fn from_hex(hex: &str) -> Result<Self, crate::error::AresCoreError> {
        let trimmed = hex.trim();
        if trimmed.len() != 64 {
            return Err(crate::error::AresCoreError::ContractSerialization(format!(
                "expected 64-character SHA-256 hex digest, got length {}",
                trimmed.len()
            )));
        }
        let mut out = [0u8; 32];
        let bytes = trimmed.as_bytes();
        for (i, slot) in out.iter_mut().enumerate() {
            let hi = decode_hex_nibble(bytes[i * 2]).ok_or_else(|| {
                crate::error::AresCoreError::ContractSerialization(format!(
                    "invalid hex digit in SHA-256 digest at byte {i}"
                ))
            })?;
            let lo = decode_hex_nibble(bytes[i * 2 + 1]).ok_or_else(|| {
                crate::error::AresCoreError::ContractSerialization(format!(
                    "invalid hex digit in SHA-256 digest at byte {i}"
                ))
            })?;
            *slot = (hi << 4) | lo;
        }
        Ok(Self(out))
    }

    /// Formats the digest as a 64-character lowercase hexadecimal string.
    pub fn to_hex(&self) -> String {
        let mut out = String::with_capacity(64);
        for b in self.0 {
            use core::fmt::Write as _;
            let _ = write!(&mut out, "{b:02x}");
        }
        out
    }
}

#[inline]
const fn decode_hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

impl core::fmt::Display for Sha256DigestHex {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        for b in self.0 {
            write!(f, "{b:02x}")?;
        }
        Ok(())
    }
}

impl Serialize for Sha256DigestHex {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_hex())
    }
}

impl<'de> Deserialize<'de> for Sha256DigestHex {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::from_hex(&s).map_err(serde::de::Error::custom)
    }
}

/// Formal validation state machine for derived and predictive models (Issue #12 closure).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ModelValidationStatus {
    /// Mandatory default when no empirical calibration artifact is verified or external cohorts are absent.
    #[default]
    IllustrativeUnvalidated,
    /// Technical out-of-sample benchmark on held-out terrestrial datasets only (NOT spaceflight validated).
    InternallyBenchmarkedTerrestrial {
        dataset_scope: TerrestrialBenchmarkScope,
        coverage_pct: f64,
        brier_score: f64,
        artifact_sha256: Sha256DigestHex,
    },
    /// Reachable only when all 5 gates of `MODEL_EVIDENCE_AUDIT.md`, paired NASA/DLR clinical cohorts,
    /// and a signed reviewer manifest are cryptographically verified.
    ClinicallyCalibratedSubjectToReview,
}

impl ModelValidationStatus {
    /// Returns true only when all 5 clinical/audit gates and paired flight-analog cohorts are verified.
    #[inline]
    pub const fn is_flight_validated(self) -> bool {
        matches!(self, Self::ClinicallyCalibratedSubjectToReview)
    }

    /// Returns true when the model remains strictly illustrative/unvalidated.
    #[inline]
    pub const fn is_illustrative_only(self) -> bool {
        matches!(self, Self::IllustrativeUnvalidated)
    }

    /// Returns true when benchmarked strictly on held-out terrestrial cohorts.
    #[inline]
    pub const fn is_terrestrial_benchmarked(self) -> bool {
        matches!(self, Self::InternallyBenchmarkedTerrestrial { .. })
    }

    /// Returns the mandatory cockpit UI disclaimer banner for this validation state.
    #[inline]
    pub const fn mandatory_ui_banner(self) -> &'static str {
        match self {
            Self::IllustrativeUnvalidated => {
                "ILLUSTRATIVE SCENARIO MODEL - NOT CLINICALLY VALIDATED"
            }
            Self::InternallyBenchmarkedTerrestrial { .. } => {
                "TERRESTRIAL BENCHMARK ONLY - NOT SPACEFLIGHT VALIDATED"
            }
            Self::ClinicallyCalibratedSubjectToReview => {
                "CALIBRATED AGAINST PAIRED COHORTS - SUBJECT TO FLIGHT SURGEON REVIEW"
            }
        }
    }
}

/// Signed cryptographic governance manifest covering the 5 gates of `MODEL_EVIDENCE_AUDIT.md`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValidationManifest {
    pub schema_version: u32,
    pub reviewer_id: String,
    pub commit_sha: String,
    pub unresolved_mappings: usize,
    pub review_signature_sha256: Option<Sha256DigestHex>,
    pub paired_cohorts_verified: bool,
    pub bidmc_only: bool,
    pub paired_modalities: Vec<String>,
    pub subject_disjoint_split_verified: bool,
    pub zero_leakage_dhf_horizons_verified: bool,
    pub calibration_report_sha256: Sha256DigestHex,
    pub brier_score: f64,
    pub ece_10_bins: f64,
    pub beats_or_ties_baselines: bool,
    pub contains_synthetic_data: bool,
    pub workflow_study_sha256: Option<Sha256DigestHex>,
    pub workflow_study_path: Option<String>,
}

impl ValidationManifest {
    /// Checks whether every structural, anti-leakage, calibration, and human-workflow gate passes.
    pub fn passes_all_five_clinical_gates(&self) -> bool {
        let gate1_review = !self.reviewer_id.trim().is_empty()
            && !self.commit_sha.trim().is_empty()
            && self.unresolved_mappings == 0
            && self.review_signature_sha256.is_some();
        let gate2_paired =
            self.paired_cohorts_verified && !self.bidmc_only && !self.paired_modalities.is_empty();
        let gate3_split =
            self.subject_disjoint_split_verified && self.zero_leakage_dhf_horizons_verified;
        let gate4_calibration = !self.contains_synthetic_data
            && self.brier_score.is_finite()
            && self.brier_score <= 0.15
            && self.ece_10_bins.is_finite()
            && self.ece_10_bins <= 0.08
            && self.beats_or_ties_baselines;
        let gate5_workflow = self.workflow_study_sha256.is_some();

        gate1_review && gate2_paired && gate3_split && gate4_calibration && gate5_workflow
    }
}

/// The current TTV bounds are scenario sensitivity ranges, not calibrated confidence limits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TtvIntervalKind {
    IllustrativeScenarioRange,
}

/// Why numeric replay cannot provide beat-to-beat HRV measurements.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HrvUnavailableReason {
    BeatIntervalsNotAvailable,
}

/// Segnali biometrici, autonomici ed esposizione radiologica (`1. GATHER`).
/// I campi provenienti da sensori fisici o CSV BIDMC usano `Option<f64>` per non
/// convertire mai campioni mancanti (`NaN`/vuoti) in falsi zeri fisiologici.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
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
    pub sbp_mmhg: Option<f64>,
    #[serde(default)]
    pub dbp_mmhg: Option<f64>,
    #[serde(default)]
    pub ptt_ms: Option<f64>,
    #[serde(default)]
    pub core_temp_celsius: Option<f64>,
    #[serde(default)]
    pub skin_temp_celsius: Option<f64>,
    #[serde(default)]
    pub sleep_stage_code: Option<u8>,
    #[serde(default)]
    pub melanopic_edi_lux: Option<f64>,
    #[serde(default)]
    pub personal_dose_rate_ugy_h: Option<f64>,
    #[serde(default)]
    pub let_quality_factor: Option<f64>,
    #[serde(default)]
    pub suit_metabolic_watts: Option<f64>,
    #[serde(default)]
    pub helmet_ppco2_mmhg: Option<f64>,
    #[serde(default)]
    pub cabin_ppco2_mmhg: Option<f64>,
    #[serde(default)]
    pub platelet_count_k_ul: Option<f64>,
}

/// Risultati di diagnostica episodica Point-of-Care (POCT) e laboratorio di bordo (`ExMC`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct SpotPoctPanel {
    #[serde(default)]
    pub hematocrit_pct: Option<f64>,
    #[serde(default)]
    pub hemoglobin_g_dl: Option<f64>,
    #[serde(default)]
    pub wbc_k_ul: Option<f64>,
    #[serde(default)]
    pub neutrophil_lymphocyte_ratio: Option<f64>,
    #[serde(default)]
    pub ionized_calcium_mmol_l: Option<f64>,
    #[serde(default)]
    pub creatinine_mg_dl: Option<f64>,
    #[serde(default)]
    pub lactate_mmol_l: Option<f64>,
    #[serde(default)]
    pub urine_output_l_d: Option<f64>,
    #[serde(default)]
    pub urine_ph: Option<f64>,
    #[serde(default)]
    pub urine_specific_gravity: Option<f64>,
    #[serde(default)]
    pub urinary_citrate_mg_d: Option<f64>,
    #[serde(default)]
    pub bia_plasma_vol_delta_pct: Option<f64>,
    #[serde(default)]
    pub bia_thorax_leg_ecw_ratio: Option<f64>,
    #[serde(default)]
    pub salivary_cortisol_nmol_l: Option<f64>,
    #[serde(default)]
    pub viral_reactivation_copies_ml: Option<f64>,
    #[serde(default)]
    pub pvt_lapses_count: Option<u32>,
    #[serde(default)]
    pub vo2max_ml_kg_min: Option<f64>,
    #[serde(default)]
    pub measured_at_mission_s: Option<f64>,
    #[serde(default)]
    pub staleness_hours: Option<f64>,
    #[serde(default)]
    pub platelet_count_k_ul: Option<f64>,
}

/// Stato del rischio litiasico renale e volume vescicale (`Gap 1`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RenalNephrolithiasis {
    pub estimated_urine_output_l_d: f64,
    pub urinary_citrate_mg_d: f64,
    pub urinary_ph: f64,
    pub rsr_calcium_oxalate: f64,
    pub renal_colic_risk_index: f64,
    pub pocus_hydronephrosis_confirmed: bool,
    pub post_void_bladder_volume_ml: f64,
}

/// Dinamica del volume plasmatico, viscosita e rischio di collasso ortostatico (`Gap 2`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OrthostaticFluid {
    pub plasma_volume_delta_pct: f64,
    pub apparent_blood_viscosity_poise: f64,
    pub hematocrit_pct: f64,
    pub shock_index: f64,
    pub orthostatic_collapse_risk_pct: f64,
    pub pre_landing_fluid_load_completed: bool,
}

/// Modello circadiano a due processi (S+C) su Sol marziano e prontezza neurocognitiva (`Gap 3`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MarsCircadianSleep {
    pub mars_sol_fraction: f64,
    pub homeostatic_sleep_pressure_s: f64,
    pub circadian_phase_c: f64,
    pub sleep_debt_hours: f64,
    pub pvt_lapse_probability: f64,
    pub cognitive_readiness_score: f64,
    pub melanopic_light_therapy_active: bool,
}

/// Disregolazione immunitaria spaziale e rischio riattivazione virale (`Gap 4`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct NeuroImmuneViral {
    pub neuroendocrine_stress_score: f64,
    pub th1_th2_cytokine_ratio: f64,
    pub viral_reactivation_risk_pct: f64,
    pub vzv_ebv_active_shedding_suspected: bool,
    pub infection_containment_active: bool,
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
    /// Legacy field name: illustrative lower bound, no calibrated 95% guarantee.
    pub ttv_ci95_low_hours: Option<f64>,
    /// Legacy field name: illustrative upper bound, no calibrated 95% guarantee.
    pub ttv_ci95_high_hours: Option<f64>,
    pub mri_pct: Option<f64>,
    #[serde(default)]
    pub ttv_interval_kind: Option<TtvIntervalKind>,
    #[serde(default)]
    pub rho_renal: Option<f64>,
    #[serde(default)]
    pub rho_orthostatic: Option<f64>,
    #[serde(default)]
    pub rho_circadian: Option<f64>,
    #[serde(default)]
    pub rho_immune: Option<f64>,
}

impl NqsStlMargins {
    /// Known violations remain actionable when the complete assessment is unavailable.
    pub fn has_known_violation(&self) -> bool {
        [self.rho_tau_w, self.rho_ared, self.rho_sost, self.rho_sans]
            .into_iter()
            .any(|rho| rho < 0.0)
            || self.rho_rmssd.is_some_and(|rho| rho < 0.0)
            || self.rho_global.is_some_and(|rho| rho < 0.0)
            || self.rho_renal.is_some_and(|rho| rho < 0.0)
            || self.rho_orthostatic.is_some_and(|rho| rho < 0.0)
            || self.rho_circadian.is_some_and(|rho| rho < 0.0)
            || self.rho_immune.is_some_and(|rho| rho < 0.0)
    }
}

const fn default_true() -> bool {
    true
}

/// Stato dei 4 Hard Clinical Safety Gates salvavita (`3. ACT`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafetyGates {
    pub anticoagulant_lock_active: bool,
    #[serde(default)]
    pub anticoagulant_contraindicated_bleeding_risk: bool,
    pub lbnp_auto_vent_armed: bool,
    #[serde(default)]
    pub lbnp_auto_vent_triggered: bool,
    pub eva_suit_damping_active: bool,
    #[serde(default = "default_true")]
    pub gate4_invasive_decompression_locked: bool,
    #[serde(default)]
    pub gate4_eva_fitness_no_go: bool,
    #[serde(default)]
    pub eclss_environmental_co2_alert: bool,
}

impl Default for SafetyGates {
    fn default() -> Self {
        Self {
            anticoagulant_lock_active: true,
            anticoagulant_contraindicated_bleeding_risk: false,
            lbnp_auto_vent_armed: true,
            lbnp_auto_vent_triggered: false,
            eva_suit_damping_active: false,
            gate4_invasive_decompression_locked: true,
            gate4_eva_fitness_no_go: false,
            eclss_environmental_co2_alert: false,
        }
    }
}

impl SafetyGates {
    pub fn nominal() -> Self {
        Self::default()
    }

    pub fn new(
        anticoagulant_lock_active: bool,
        lbnp_auto_vent_armed: bool,
        eva_suit_damping_active: bool,
    ) -> Self {
        Self {
            anticoagulant_lock_active,
            anticoagulant_contraindicated_bleeding_risk: false,
            lbnp_auto_vent_armed,
            lbnp_auto_vent_triggered: false,
            eva_suit_damping_active,
            gate4_invasive_decompression_locked: true,
            gate4_eva_fitness_no_go: false,
            eclss_environmental_co2_alert: false,
        }
    }
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
    #[serde(default)]
    pub model_validation_status: ModelValidationStatus,
    pub biometrics: Biometrics,
    pub musculoskeletal: Musculoskeletal,
    pub jugular_hemodynamics: JugularHemodynamics,
    pub sans_ocular: SansOcular,
    pub nqs_stl: NqsStlMargins,
    pub active_playbook: ActivePlaybook,
    #[serde(default)]
    pub spot_poct: Option<SpotPoctPanel>,
    #[serde(default)]
    pub renal_nephrolithiasis: Option<RenalNephrolithiasis>,
    #[serde(default)]
    pub orthostatic_fluid: Option<OrthostaticFluid>,
    #[serde(default)]
    pub mars_circadian_sleep: Option<MarsCircadianSleep>,
    #[serde(default)]
    pub neuro_immune_viral: Option<NeuroImmuneViral>,
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
