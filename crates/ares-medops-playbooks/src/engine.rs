//! Entry point used by `ares-server-cli`: one call per tick.

use serde::Serialize;

use crate::actions::Action;
use crate::error::PlaybookError;
use crate::playbooks::{self, Playbook, PlaybookId};
use crate::safety_gates::{
    self, GateIntervention, SafePlaybookDecision, enforce_clinical_safety_gates,
};
use crate::state::ClinicalState;
use crate::thresholds::ClinicalThresholds;

/// Output of one evaluation.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MedOpsReport {
    /// Gate actions to run immediately, before any playbook step. Deduplicated.
    pub priority_actions: Vec<Action>,
    /// Gate 2 / Gate 3 interventions that apply even when no playbook is active.
    pub global_interventions: Vec<GateIntervention>,
    /// Gated playbooks, most urgent first.
    pub decisions: Vec<SafePlaybookDecision>,
    pub anticoagulant_lock_active: bool,
}

impl MedOpsReport {
    pub fn triggered_ids(&self) -> Vec<PlaybookId> {
        self.decisions.iter().map(|d| d.playbook_id).collect()
    }
}

/// Holds the thresholds and the five pre-compiled playbooks.
#[derive(Debug, Clone)]
pub struct MedOpsEngine {
    thresholds: ClinicalThresholds,
    compiled: Vec<Playbook>,
}

impl MedOpsEngine {
    /// Compiles and validates all five DAGs once.
    pub fn new(thresholds: ClinicalThresholds) -> Result<Self, PlaybookError> {
        let compiled = PlaybookId::ALL
            .iter()
            .map(|id| playbooks::build(*id, &thresholds))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            thresholds,
            compiled,
        })
    }

    pub fn thresholds(&self) -> &ClinicalThresholds {
        &self.thresholds
    }

    pub fn playbook(&self, id: PlaybookId) -> Option<&Playbook> {
        self.compiled.iter().find(|p| p.id == id)
    }

    /// Gates a playbook chosen manually (e.g. by the CMO or the MCP tool
    /// `trigger_medops_action_playbook`). The gates still apply.
    pub fn propose(&self, state: &ClinicalState, id: PlaybookId) -> Option<SafePlaybookDecision> {
        self.playbook(id)
            .map(|p| enforce_clinical_safety_gates(state, &self.thresholds, p))
    }

    /// Full evaluation: triggers, gates, priority actions.
    pub fn evaluate(&self, state: &ClinicalState) -> MedOpsReport {
        let th = &self.thresholds;

        let decisions: Vec<SafePlaybookDecision> = playbooks::triggered(state, th)
            .into_iter()
            .filter_map(|id| self.propose(state, id))
            .collect();

        let global_interventions: Vec<GateIntervention> = [
            safety_gates::lbnp_guardrail(state, th),
            safety_gates::gait_guardrail(state, th),
        ]
        .into_iter()
        .flatten()
        .collect();

        let mut priority_actions: Vec<Action> = Vec::new();
        for action in global_interventions
            .iter()
            .flat_map(|g| g.added_actions.iter())
            .chain(decisions.iter().flat_map(|d| d.priority_actions.iter()))
        {
            if !priority_actions.iter().any(|a| a.code == action.code) {
                priority_actions.push(action.clone());
            }
        }

        MedOpsReport {
            priority_actions,
            global_interventions,
            decisions,
            anticoagulant_lock_active: safety_gates::anticoagulant_lock_active(state),
        }
    }
}
