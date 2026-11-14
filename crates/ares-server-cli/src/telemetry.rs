//! Wire format of the 20 Hz cockpit stream: `contracts/telemetry_schema.json`.
//!
//! The packet is serialize-only: it is a projection of [`crate::MissionState`],
//! never an input. Fields the current engine cannot compute (NQS-STL robustness
//! `rho`, TTV, MRI) are emitted as `null` with an explicit source tag instead of
//! being fabricated; they are filled once `ares-nqs-stl` lands (phases 8-9).
//!
//! Fields marked EXTENSION are not in the contract yet. The contract does not
//! forbid extra properties, and the cockpit needs them (the provisional
//! `ClinicalState` of `ares-medops-playbooks` carries inputs the schema has no
//! name for). They must be folded into `contracts/telemetry_schema.json` when
//! `ares-core-types` defines the shared structs.

use ares_medops_playbooks::state::{ClinicalState, finite};
use ares_medops_playbooks::{
    ActivePlaybookView, ClinicalThresholds, GateId, MedOpsReport, PlaybookId,
};
use serde::Serialize;

use crate::replay::{BidmcSample, NATIVE_RATE_HZ, RECORDED_CHANNELS};

/// Cockpit stream tick rate. Phase 13 target: 20 Hz on `/ws/telemetry`.
pub const UI_REFRESH_RATE_HZ: f64 = 20.0;

/// What the frame is, which decides every provenance tag in it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceMode {
    /// A verified BIDMC record and nothing else. The simulated blocks are
    /// `null` and no deep-space indicator the record cannot support is emitted.
    PureReplay,
    /// Recorded BIDMC channels with What-If scenario inputs alongside them.
    /// The recorded channels are still recorded: the console cannot write them.
    RecordedWithWhatIf,
    /// No recording loaded: the scenario generator is the only source.
    SimulatedOnly,
}

impl SourceMode {
    /// `provenance_manifest.biometrics_source`.
    fn biometrics_source(self) -> &'static str {
        match self {
            Self::PureReplay | Self::RecordedWithWhatIf => "RECORDED_TERRESTRIAL_BIDMC_CSV",
            Self::SimulatedOnly => "SIMULATED_SCENARIO_INPUT",
        }
    }

    /// `provenance_manifest.biometrics_native_rate_hz`: the true acquisition
    /// rate of the biometrics, never the UI tick rate of a 1 Hz source.
    fn native_rate_hz(self) -> f64 {
        match self {
            Self::PureReplay | Self::RecordedWithWhatIf => NATIVE_RATE_HZ,
            // The console is a generator evaluated once per tick, so for it the
            // tick rate is the native rate.
            Self::SimulatedOnly => UI_REFRESH_RATE_HZ,
        }
    }

    /// `provenance_manifest.scenario_overlay_mode`.
    fn overlay_mode(self) -> &'static str {
        match self {
            Self::PureReplay => "NONE_PURE_REPLAY",
            Self::RecordedWithWhatIf | Self::SimulatedOnly => "SIMULATED_WHATIF_SCENARIO",
        }
    }

    /// `safety_margins.provenance`.
    fn margins_provenance(self) -> &'static str {
        match self {
            Self::PureReplay => "DERIVED_FROM_RECORDED_BIDMC",
            Self::RecordedWithWhatIf | Self::SimulatedOnly => "DERIVED_FROM_HYBRID_SCENARIO",
        }
    }

    /// True while the frame may carry `hemodynamics`, `musculoskeletal` and
    /// `environment`. In pure replay they are `null`: BIDMC has four channels
    /// and none of them is a jugular, a soleus or a cabin.
    fn carries_simulated_blocks(self) -> bool {
        !matches!(self, Self::PureReplay)
    }
}

/// Total cabin pressure assumed when converting cabin ppCO2 (mmHg) to the
/// contract's `cabin_co2_ppm`: 1 atm = 760 mmHg (ISS / Orion sea-level cabin).
const CABIN_TOTAL_PRESSURE_MMHG: f64 = 760.0;

/// One frame of the cockpit stream.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TelemetryPacket {
    /// Replay engine wall-clock tick (ms since the Unix epoch). Never presented
    /// as the acquisition time of a clinical recording.
    pub timestamp_ms: u64,
    /// Seconds since the replay session started.
    pub relative_recording_time_s: f64,
    pub source_record_id: String,
    pub mission_elapsed_days: Option<f64>,
    pub astronaut_id: String,
    pub provenance_manifest: ProvenanceManifest,
    pub biometrics: Biometrics,
    pub hemodynamics: Option<Hemodynamics>,
    pub musculoskeletal: Option<Musculoskeletal>,
    pub environment: Option<EnvironmentBlock>,
    pub safety_margins: SafetyMargins,
    pub active_playbook: Option<ActivePlaybookView>,
    /// EXTENSION: compact projection of the MedOps decision for this tick.
    pub medops: MedOpsSummary,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProvenanceManifest {
    pub biometrics_source: &'static str,
    /// True native rate of the biometric source. The What-If console is a
    /// scenario generator evaluated once per tick, so it is the tick rate here;
    /// a BIDMC numerics replay must report its real 1.0 Hz instead.
    pub biometrics_native_rate_hz: f64,
    pub ui_refresh_rate_hz: f64,
    pub scenario_overlay_mode: &'static str,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Biometrics {
    pub heart_rate_bpm: Option<f64>,
    /// Recorded PPG pulse rate. Always `null` in simulated-only mode: the
    /// console does not model PPG and will not invent one.
    pub pulse_rate_bpm: Option<f64>,
    pub respiration_rate_brpm: Option<f64>,
    pub spo2_percent: Option<f64>,
    pub rr_interval_ms: Option<f64>,
    pub hrv_rmssd_ms: Option<f64>,
    pub core_temp_celsius: Option<f64>,
    pub missing_channels: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hemodynamics {
    pub provenance: &'static str,
    pub ijv_csa_cm2: Option<f64>,
    pub ijv_velocity_max_cm_s: Option<f64>,
    pub wall_shear_stress_dyn_cm2: Option<f64>,
    pub pocus_thrombus_confirmed: Option<bool>,
    /// `null` until the two-stage Bayesian POCUS observer (`ares-causal-graph`).
    pub thrombosis_risk_score: Option<f64>,
}

/// The contract's four musculoskeletal fields come first and are emitted even
/// when the engine cannot compute them, so a cockpit typed against the schema
/// finds them present and `null` (unavailable) instead of `undefined`.
///
/// None of the four can be honestly derived from what the engine holds today:
/// `ClinicalState` tracks soleus volume loss against a pre-flight baseline, and
/// turning that into a thickness in mm, a pennation angle or a
/// mechanotransductive index needs the regularized Frost-Hargens ODE of
/// `ares-causal-graph`. They are filled there, not guessed here.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Musculoskeletal {
    pub provenance: &'static str,
    /// `null` until `ares-causal-graph` models the muscle geometry.
    pub soleus_thickness_mm: Option<f64>,
    /// `null` until `ares-causal-graph` models the muscle geometry.
    pub pennation_angle_deg: Option<f64>,
    /// `null` until the Frost-Hargens bone remodelling ODE lands. Distinct from
    /// the extension `bmd_loss_pct_per_month`: resorption rate is not BMD loss.
    pub bone_resorption_rate_pct: Option<f64>,
    /// `null` until `ares-nqs-stl` synthesizes it.
    pub mechanotransductive_index: Option<f64>,
    /// EXTENSION: soleus volume loss from pre-flight baseline (percent).
    pub soleus_volume_loss_pct: Option<f64>,
    /// EXTENSION: calcaneus BMD loss rate (percent per month).
    pub bmd_loss_pct_per_month: Option<f64>,
    /// EXTENSION: post-landing IMU Gait Asymmetry Index (percent, Gate 3 input).
    pub gait_asymmetry_index_pct: Option<f64>,
    /// EXTENSION: true after a 0.38 g / 0.16 g planetary landing.
    pub post_landing: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EnvironmentBlock {
    pub provenance: &'static str,
    /// Derived from `cabin_ppco2_mmhg` at 1 atm total pressure.
    pub cabin_co2_ppm: Option<f64>,
    /// `null`: the habitat avionics model has no cabin ppO2 input yet, and the
    /// console does not expose one. Emitted so the field exists for the cockpit.
    pub cabin_o2_kpa: Option<f64>,
    pub ambient_radiation_rate_ugy_h: Option<f64>,
    pub cumulative_radiation_mgy: Option<f64>,
    /// EXTENSION: cabin ppCO2 in mmHg, the unit the SANS trigger uses.
    pub cabin_ppco2_mmhg: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SafetyMargins {
    pub provenance: &'static str,
    /// `null` until `ares-nqs-stl` (phase 8) computes it.
    pub med_stl_rho_robustness: Option<f64>,
    /// `null` until the EWMA-OLS TTV predictor (phase 9) computes it.
    pub time_to_violation_days: Option<f64>,
    /// `null` until the MRI synthesizer (phase 9) computes it.
    pub mission_readiness_index: Option<f64>,
    pub alarm_level: &'static str,
    /// EXTENSION: why the three margins above are `null`.
    pub pending_sources: Vec<&'static str>,
}

/// EXTENSION: what the cockpit needs from the MedOps decision, small enough to
/// resend 20 times per second. Full step lists are fetched per playbook instead.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MedOpsSummary {
    pub triggered_playbooks: Vec<&'static str>,
    pub priority_actions: Vec<PriorityAction>,
    pub gates: GateStatus,
    pub interventions: Vec<InterventionView>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PriorityAction {
    pub code: &'static str,
    pub instruction: String,
}

/// Live status of the 3 Hard Clinical Safety Gates.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct GateStatus {
    /// Gate 1: locked unless POCUS confirmed a thrombus.
    pub anticoagulation_locked: bool,
    /// Gate 2: LBNP chamber auto-vent commanded.
    pub lbnp_autosafe_vent: bool,
    /// Gate 3: EVA suit ankle/knee damping increase, percent (0 when inactive).
    pub gait_suit_damping_pct: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct InterventionView {
    pub gate: GateId,
    pub reason: String,
}

impl Biometrics {
    /// Recorded mode: the four contract channels are exactly the CSV columns,
    /// `None` where the record has `NaN`. Nothing is derived or filled in.
    fn from_recorded(sample: &BidmcSample) -> Self {
        Self {
            heart_rate_bpm: sample.heart_rate_bpm,
            pulse_rate_bpm: sample.pulse_rate_bpm,
            respiration_rate_brpm: sample.respiration_rate_brpm,
            spo2_percent: sample.spo2_percent,
            // 1 Hz numerics carry no beat-to-beat information: deriving an R-R
            // interval or an RMSSD from them would be an invention.
            rr_interval_ms: None,
            hrv_rmssd_ms: None,
            core_temp_celsius: None,
            missing_channels: sample.missing_channels.clone(),
        }
    }

    fn from_state(state: &ClinicalState) -> Self {
        let heart_rate_bpm = finite(state.vitals.heart_rate_bpm);
        let respiration_rate_brpm = finite(state.vitals.respiration_rate_brpm);
        let spo2_percent = finite(state.vitals.spo2_percent);

        let present = [
            heart_rate_bpm.is_some(),
            false, // pulse_rate_bpm: not modelled by the scenario generator.
            respiration_rate_brpm.is_some(),
            spo2_percent.is_some(),
        ];
        let missing_channels = RECORDED_CHANNELS
            .iter()
            .zip(present)
            .filter(|(_, ok)| !ok)
            .map(|(name, _)| *name)
            .collect();

        Self {
            heart_rate_bpm,
            pulse_rate_bpm: None,
            respiration_rate_brpm,
            spo2_percent,
            rr_interval_ms: None,
            hrv_rmssd_ms: None,
            core_temp_celsius: None,
            missing_channels,
        }
    }

    /// True when a channel the engine actually consumes is missing.
    ///
    /// `pulse_rate_bpm` is excluded on purpose: the engine reads HR, not the
    /// PPG pulse rate, so a missing `PULSE` feeds no playbook trigger and no
    /// safety gate. It is still reported in `missing_channels`, and the cockpit
    /// must show it as unavailable; it just does not by itself degrade the tier.
    /// In `bidmc_01` seconds 111-123 `SpO2` is missing too, which does.
    fn engine_inputs_degraded(&self) -> bool {
        self.heart_rate_bpm.is_none()
            || self.respiration_rate_brpm.is_none()
            || self.spo2_percent.is_none()
    }
}

impl GateStatus {
    pub fn from_report(report: &MedOpsReport, th: &ClinicalThresholds) -> Self {
        let fired = |gate: GateId| {
            report.global_interventions.iter().any(|g| g.gate == gate)
                || report
                    .decisions
                    .iter()
                    .flat_map(|d| d.interventions.iter())
                    .any(|g| g.gate == gate)
        };
        let damping = if fired(GateId::EvaSuitDamping) {
            th.suit_damping_increase_pct
        } else {
            0.0
        };
        Self {
            anticoagulation_locked: report.anticoagulant_lock_active,
            lbnp_autosafe_vent: fired(GateId::LbnpAutoVent),
            gait_suit_damping_pct: damping,
        }
    }
}

/// Deterministic alarm tier, PROVISIONAL until `ares-nqs-stl` synthesizes it
/// from `rho` and the MRI (phase 9). Precedence, highest first:
///
/// 1. `CRITICAL` - a safety gate fired, or an acute playbook (SPE shelter,
///    confirmed thrombus) triggered. Safety outranks data quality: a gate that
///    fires *because* data is missing is still a critical event.
/// 2. `DATA_DEGRADED_MISSING_CHANNELS` - an engine input channel is `null`.
/// 3. `WARNING` - SANS mitigation triggered.
/// 4. `ADVISORY` - a chronic deconditioning playbook triggered.
/// 5. `NOMINAL`.
fn alarm_level(report: &MedOpsReport, gates: &GateStatus, degraded: bool) -> &'static str {
    let gate_fired = gates.lbnp_autosafe_vent || gates.gait_suit_damping_pct > 0.0;
    let urgency = report
        .triggered_ids()
        .into_iter()
        .map(PlaybookId::urgency)
        .min();

    match (gate_fired, degraded, urgency) {
        (true, _, _) | (_, _, Some(0 | 1)) => "CRITICAL",
        (_, true, _) => "DATA_DEGRADED_MISSING_CHANNELS",
        (_, _, Some(2)) => "WARNING",
        (_, _, Some(_)) => "ADVISORY",
        (_, _, None) => "NOMINAL",
    }
}

/// EXTENSION: why the three margins are `null`, so the cockpit can label them
/// instead of drawing a zero.
fn pending_sources(mode: SourceMode) -> Vec<&'static str> {
    let mut sources = vec!["PENDING_ARES_NQS_STL"];
    if mode == SourceMode::PureReplay {
        sources.push("UNSUPPORTED_BY_TERRESTRIAL_RECORD");
    }
    sources
}

/// Builds one frame. The two timestamps the contract separates are both here:
/// `timestamp_ms` is when the engine emitted the frame, and
/// `relative_recording_time_s` is where the recording is.
pub(crate) struct PacketInputs<'a> {
    pub timestamp_ms: u64,
    pub relative_recording_time_s: f64,
    pub source_record_id: &'a str,
    pub astronaut_id: &'a str,
    pub mission_elapsed_days: Option<f64>,
    pub mode: SourceMode,
    /// The recorded second this frame shows, `None` in simulated-only mode.
    pub recorded: Option<&'a BidmcSample>,
    pub state: &'a ClinicalState,
    pub thresholds: &'a ClinicalThresholds,
    pub report: &'a MedOpsReport,
    pub active_playbook: Option<ActivePlaybookView>,
}

impl TelemetryPacket {
    pub(crate) fn build(input: PacketInputs<'_>) -> Self {
        let state = input.state;
        let mode = input.mode;
        let biometrics = match input.recorded {
            Some(sample) => Biometrics::from_recorded(sample),
            None => Biometrics::from_state(state),
        };
        let gates = GateStatus::from_report(input.report, input.thresholds);
        let degraded = biometrics.engine_inputs_degraded();

        let j = &state.jugular;
        let m = &state.musculoskeletal;
        let e = &state.environment;

        // A gate that fires standalone also fires inside every decision it
        // touches; the cockpit banner wants one entry per distinct finding.
        let mut interventions: Vec<InterventionView> = Vec::new();
        for gate in input.report.global_interventions.iter().chain(
            input
                .report
                .decisions
                .iter()
                .flat_map(|d| d.interventions.iter()),
        ) {
            let view = InterventionView {
                gate: gate.gate,
                reason: gate.reason.clone(),
            };
            if !interventions.contains(&view) {
                interventions.push(view);
            }
        }

        Self {
            timestamp_ms: input.timestamp_ms,
            relative_recording_time_s: input.relative_recording_time_s,
            source_record_id: input.source_record_id.to_string(),
            // A terrestrial 8-minute recording has no mission day. Claiming one
            // would turn an ICU patient into a deep-space crew member.
            mission_elapsed_days: match mode {
                SourceMode::PureReplay => None,
                _ => input.mission_elapsed_days,
            },
            astronaut_id: input.astronaut_id.to_string(),
            provenance_manifest: ProvenanceManifest {
                biometrics_source: mode.biometrics_source(),
                biometrics_native_rate_hz: mode.native_rate_hz(),
                ui_refresh_rate_hz: UI_REFRESH_RATE_HZ,
                scenario_overlay_mode: mode.overlay_mode(),
            },
            biometrics,
            hemodynamics: mode.carries_simulated_blocks().then(|| Hemodynamics {
                provenance: "SIMULATED_SCENARIO_INPUT",
                ijv_csa_cm2: finite(j.ijv_csa_cm2),
                ijv_velocity_max_cm_s: finite(j.ijv_velocity_max_cm_s),
                wall_shear_stress_dyn_cm2: finite(j.wall_shear_stress_dyn_cm2),
                pocus_thrombus_confirmed: j.pocus_thrombus_confirmed,
                thrombosis_risk_score: None,
            }),
            musculoskeletal: mode.carries_simulated_blocks().then(|| Musculoskeletal {
                provenance: "SIMULATED_SCENARIO_INPUT",
                soleus_thickness_mm: None,
                pennation_angle_deg: None,
                bone_resorption_rate_pct: None,
                mechanotransductive_index: None,
                soleus_volume_loss_pct: finite(m.soleus_volume_loss_pct),
                bmd_loss_pct_per_month: finite(m.bmd_loss_pct_per_month),
                gait_asymmetry_index_pct: finite(m.gait_asymmetry_index_pct),
                post_landing: m.post_landing,
            }),
            environment: mode.carries_simulated_blocks().then(|| EnvironmentBlock {
                provenance: "SIMULATED_SCENARIO_INPUT",
                cabin_co2_ppm: finite(e.cabin_ppco2_mmhg)
                    .map(|mmhg| mmhg / CABIN_TOTAL_PRESSURE_MMHG * 1.0e6),
                cabin_o2_kpa: None,
                ambient_radiation_rate_ugy_h: finite(e.ambient_radiation_rate_ugy_h),
                cumulative_radiation_mgy: finite(e.cumulative_radiation_mgy),
                cabin_ppco2_mmhg: finite(e.cabin_ppco2_mmhg),
            }),
            safety_margins: SafetyMargins {
                provenance: mode.margins_provenance(),
                med_stl_rho_robustness: None,
                // An 8-minute terrestrial recording cannot support a horizon in
                // days, so the predictor stays unavailable rather than guessing.
                time_to_violation_days: None,
                mission_readiness_index: None,
                alarm_level: alarm_level(input.report, &gates, degraded),
                pending_sources: pending_sources(mode),
            },
            active_playbook: input.active_playbook,
            medops: MedOpsSummary {
                triggered_playbooks: input
                    .report
                    .triggered_ids()
                    .into_iter()
                    .map(PlaybookId::code)
                    .collect(),
                priority_actions: input
                    .report
                    .priority_actions
                    .iter()
                    .map(|a| PriorityAction {
                        code: a.code,
                        instruction: a.instruction.clone(),
                    })
                    .collect(),
                gates,
                interventions,
            },
        }
    }
}
