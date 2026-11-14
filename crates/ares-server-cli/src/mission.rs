//! Mission state shared by the two transports: `Arc<RwLock<MissionState>>`.
//!
//! The state holds the engine input ([`ClinicalState`]), the four What-If
//! Stress-Test Console sliders and the active playbook run. Every method is
//! synchronous and short: callers must never hold the lock across an `await`.
//!
//! Until `ares-telemetry-ingest` (phase 3) provides the deterministic BIDMC
//! v1.0.0 replay, the clinical input is the scenario generator seeded by
//! [`MissionState::new`] and driven by the console. It is therefore tagged
//! `SIMULATED_SCENARIO_INPUT` everywhere and never presented as recorded data.

use std::fmt;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use ares_medops_playbooks::state::{
    ClinicalState, Environment, Jugular, Lbnp, Musculoskeletal, NeuroOcular, Vitals,
};
use ares_medops_playbooks::{
    ActivePlaybookView, ClinicalThresholds, MedOpsEngine, MedOpsReport, PlaybookError, PlaybookId,
    PlaybookRun, SafePlaybookDecision,
};
use serde::{Deserialize, Serialize};

use crate::telemetry::{PacketInputs, TelemetryPacket};

/// The four What-If Stress-Test Console sliders.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct ScenarioOverlay {
    pub cabin_ppco2_mmhg: Option<f64>,
    /// ARED resistive workload, percent of the prescribed protocol.
    ///
    /// Recorded and echoed back so the console contract is complete, but it does
    /// not yet move any clinical value: the workload -> bone/muscle response map
    /// is the regularized Frost-Hargens ODE of `ares-causal-graph` (phase 5).
    /// Wiring it here would mean inventing a dose-response curve.
    pub ared_workload_pct: Option<f64>,
    /// LBNP chamber pressure (mmHg, <= 0). Below 0 the chamber counts as active,
    /// which arms Gate 2.
    pub lbnp_pressure_mmhg: Option<f64>,
    pub mission_elapsed_days: Option<f64>,
}

/// Body of `POST /api/stress-test`. All fields optional: a request is a patch.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StressTestRequest {
    pub cabin_ppco2_mmhg: Option<f64>,
    pub ared_workload_pct: Option<f64>,
    pub lbnp_pressure_mmhg: Option<f64>,
    pub mission_elapsed_days: Option<f64>,
    /// Full replacement of the engine input, for the POCUS / landing / vitals
    /// inputs the four sliders do not cover. Applied before the sliders.
    pub clinical_state: Option<ClinicalState>,
}

/// A rejected console input, returned as HTTP 400.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ScenarioRejection {
    pub field: &'static str,
    pub message: String,
}

impl ScenarioRejection {
    fn range(field: &'static str, value: f64, low: f64, high: f64) -> Self {
        Self {
            field,
            message: format!("{value} outside accepted range [{low}, {high}]"),
        }
    }
}

/// Why an `[EXECUTE STEP]` command was refused.
#[derive(Debug, Clone, PartialEq)]
pub enum StepRejection {
    NoActivePlaybook,
    /// The command named a playbook that is not the active one.
    NotActive {
        requested: &'static str,
        active: &'static str,
    },
    Playbook(PlaybookError),
}

impl fmt::Display for StepRejection {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoActivePlaybook => write!(f, "no active playbook"),
            Self::NotActive { requested, active } => {
                write!(f, "playbook {requested} is not active ({active} is)")
            }
            Self::Playbook(e) => write!(f, "{e}"),
        }
    }
}

/// Shared mission state. One instance per process, behind an `RwLock`.
#[derive(Debug)]
pub struct MissionState {
    engine: MedOpsEngine,
    astronaut_id: String,
    source_record_id: String,
    started: Instant,
    clinical: ClinicalState,
    overlay: ScenarioOverlay,
    run: Option<PlaybookRun>,
}

impl MissionState {
    /// Builds the state with the compiled playbooks and the nominal scenario
    /// seed. Fails only if a playbook DAG is malformed (a bug, caught in tests).
    pub fn new(
        astronaut_id: impl Into<String>,
        source_record_id: impl Into<String>,
    ) -> Result<Self, PlaybookError> {
        Ok(Self {
            engine: MedOpsEngine::new(ClinicalThresholds::default())?,
            astronaut_id: astronaut_id.into(),
            source_record_id: source_record_id.into(),
            started: Instant::now(),
            clinical: nominal_scenario_seed(),
            overlay: ScenarioOverlay {
                cabin_ppco2_mmhg: Some(2.3),
                ared_workload_pct: Some(100.0),
                lbnp_pressure_mmhg: Some(0.0),
                mission_elapsed_days: Some(0.0),
            },
            run: None,
        })
    }

    pub fn astronaut_id(&self) -> &str {
        &self.astronaut_id
    }

    pub fn clinical(&self) -> &ClinicalState {
        &self.clinical
    }

    pub fn overlay(&self) -> &ScenarioOverlay {
        &self.overlay
    }

    pub fn thresholds(&self) -> &ClinicalThresholds {
        self.engine.thresholds()
    }

    /// One full deterministic evaluation: triggers, then the 3 safety gates.
    pub fn evaluate(&self) -> MedOpsReport {
        self.engine.evaluate(&self.clinical)
    }

    /// Applies a console patch. Validates before mutating, so a rejected
    /// request leaves the state untouched.
    pub fn apply_stress_test(&mut self, req: &StressTestRequest) -> Result<(), ScenarioRejection> {
        check_range("cabin_ppco2_mmhg", req.cabin_ppco2_mmhg, 0.0, 20.0)?;
        check_range("ared_workload_pct", req.ared_workload_pct, 0.0, 200.0)?;
        check_range("lbnp_pressure_mmhg", req.lbnp_pressure_mmhg, -60.0, 0.0)?;
        check_range(
            "mission_elapsed_days",
            req.mission_elapsed_days,
            0.0,
            1000.0,
        )?;

        if let Some(state) = &req.clinical_state {
            self.clinical = state.clone();
        }
        if let Some(ppco2) = req.cabin_ppco2_mmhg {
            self.overlay.cabin_ppco2_mmhg = Some(ppco2);
            self.clinical.environment.cabin_ppco2_mmhg = Some(ppco2);
        }
        if let Some(workload) = req.ared_workload_pct {
            self.overlay.ared_workload_pct = Some(workload);
        }
        if let Some(pressure) = req.lbnp_pressure_mmhg {
            self.overlay.lbnp_pressure_mmhg = Some(pressure);
            self.clinical.lbnp.chamber_pressure_mmhg = Some(pressure);
            self.clinical.lbnp.active = pressure < 0.0;
        }
        if let Some(day) = req.mission_elapsed_days {
            self.overlay.mission_elapsed_days = Some(day);
        }
        Ok(())
    }

    /// Gates the requested playbook and makes it the active run.
    /// `None` only if the id is unknown to the compiled set.
    pub fn activate_playbook(&mut self, id: PlaybookId) -> Option<ActivePlaybookView> {
        let decision = self.engine.propose(&self.clinical, id)?;
        let run = PlaybookRun::new(decision);
        let view = run.view();
        self.run = Some(run);
        Some(view)
    }

    pub fn active_decision(&self) -> Option<&SafePlaybookDecision> {
        self.run.as_ref().map(PlaybookRun::decision)
    }

    pub fn active_view(&self) -> Option<ActivePlaybookView> {
        self.run.as_ref().map(PlaybookRun::view)
    }

    /// Advances the active run by one step (the cockpit `[EXECUTE STEP]` button).
    pub fn execute_step(
        &mut self,
        playbook_id: PlaybookId,
        step_id: u8,
    ) -> Result<ActivePlaybookView, StepRejection> {
        let run = self.run.as_mut().ok_or(StepRejection::NoActivePlaybook)?;
        let active = run.decision().playbook_id;
        if active != playbook_id {
            return Err(StepRejection::NotActive {
                requested: playbook_id.code(),
                active: active.code(),
            });
        }
        run.execute_step(step_id).map_err(StepRejection::Playbook)?;
        Ok(run.view())
    }

    /// Projects the current state into one cockpit frame.
    pub fn packet(&self) -> TelemetryPacket {
        self.packet_with(&self.evaluate())
    }

    /// Same, reusing an already computed report (the 20 Hz tick path).
    pub fn packet_with(&self, report: &MedOpsReport) -> TelemetryPacket {
        TelemetryPacket::build(PacketInputs {
            timestamp_ms: unix_millis(),
            relative_recording_time_s: self.started.elapsed().as_secs_f64(),
            source_record_id: &self.source_record_id,
            astronaut_id: &self.astronaut_id,
            mission_elapsed_days: self.overlay.mission_elapsed_days,
            state: &self.clinical,
            thresholds: self.engine.thresholds(),
            report,
            active_playbook: self.active_view(),
        })
    }
}

fn check_range(
    field: &'static str,
    value: Option<f64>,
    low: f64,
    high: f64,
) -> Result<(), ScenarioRejection> {
    match value {
        Some(v) if !v.is_finite() => Err(ScenarioRejection {
            field,
            message: "value must be finite".to_string(),
        }),
        Some(v) if v < low || v > high => Err(ScenarioRejection::range(field, v, low, high)),
        _ => Ok(()),
    }
}

/// Wall-clock milliseconds, 0 if the system clock predates the Unix epoch.
fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

/// Nominal crew member at mission start: a SIMULATED scenario seed for the
/// cockpit and the demo, not recorded clinical data. No playbook triggers and no
/// gate fires in this state, so the cockpit opens on `NOMINAL`.
fn nominal_scenario_seed() -> ClinicalState {
    ClinicalState {
        vitals: Vitals {
            heart_rate_bpm: Some(72.0),
            spo2_percent: Some(98.0),
            respiration_rate_brpm: Some(14.0),
        },
        jugular: Jugular {
            ijv_csa_cm2: Some(1.1),
            ijv_velocity_max_cm_s: Some(12.0),
            wall_shear_stress_dyn_cm2: Some(6.4),
            pocus_thrombus_confirmed: Some(false),
        },
        lbnp: Lbnp {
            active: false,
            chamber_pressure_mmhg: Some(0.0),
            baseline_systolic_bp_mmhg: Some(118.0),
            current_systolic_bp_mmhg: Some(116.0),
        },
        musculoskeletal: Musculoskeletal {
            gait_asymmetry_index_pct: None,
            soleus_volume_loss_pct: Some(1.2),
            bmd_loss_pct_per_month: Some(0.4),
            post_landing: false,
        },
        neuro_ocular: NeuroOcular {
            optic_nerve_sheath_diameter_mm: Some(4.6),
        },
        environment: Environment {
            cabin_ppco2_mmhg: Some(2.3),
            ambient_radiation_rate_ugy_h: Some(22.0),
            cumulative_radiation_mgy: Some(31.0),
        },
    }
}
