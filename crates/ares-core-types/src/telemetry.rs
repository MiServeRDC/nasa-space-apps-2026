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
}

impl NqsStlMargins {
    /// Known violations remain actionable when the complete assessment is unavailable.
    pub fn has_known_violation(&self) -> bool {
        [self.rho_tau_w, self.rho_ared, self.rho_sost, self.rho_sans]
            .into_iter()
            .any(|rho| rho < 0.0)
            || self.rho_rmssd.is_some_and(|rho| rho < 0.0)
            || self.rho_global.is_some_and(|rho| rho < 0.0)
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
    #[serde(default)]
    pub model_validation_status: ModelValidationStatus,
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
