//! Step-by-step execution of a gated playbook (the `[EXECUTE STEP]` button).

use serde::{Deserialize, Serialize};

use crate::error::PlaybookError;
use crate::safety_gates::SafePlaybookDecision;

/// Matches `active_playbook` in `contracts/telemetry_schema.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActivePlaybookView {
    pub playbook_id: String,
    /// 1-based index of the step to execute next (total_steps + 1 when done).
    pub current_step: u32,
    pub total_steps: u32,
    pub step_instruction: String,
}

/// State machine over the steps of one [`SafePlaybookDecision`].
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlaybookRun {
    decision: SafePlaybookDecision,
    next: usize,
}

impl PlaybookRun {
    pub fn new(decision: SafePlaybookDecision) -> Self {
        Self { decision, next: 0 }
    }

    pub fn decision(&self) -> &SafePlaybookDecision {
        &self.decision
    }

    pub fn is_complete(&self) -> bool {
        self.next >= self.decision.steps.len()
    }

    /// Marks step `step_id` as executed. Steps are already in a valid DAG order,
    /// so the only legal step is the next one.
    pub fn execute_step(&mut self, step_id: u8) -> Result<(), PlaybookError> {
        let name = self.decision.playbook_id.code();
        let expected = self
            .decision
            .steps
            .get(self.next)
            .map(|s| s.id)
            .ok_or(PlaybookError::AlreadyCompleted { playbook: name })?;
        if expected != step_id {
            return Err(PlaybookError::OutOfOrder {
                playbook: name,
                expected,
                got: step_id,
            });
        }
        self.next += 1;
        Ok(())
    }

    pub fn view(&self) -> ActivePlaybookView {
        let total = self.decision.steps.len();
        let instruction = match self.decision.steps.get(self.next) {
            Some(step) => {
                let parts: Vec<&str> = step
                    .actions
                    .iter()
                    .map(|a| a.instruction.as_str())
                    .collect();
                format!("{}: {}", step.title, parts.join(" "))
            }
            None => "Playbook completed.".to_string(),
        };
        ActivePlaybookView {
            playbook_id: self.decision.playbook_id.code().to_string(),
            current_step: u32::try_from(self.next + 1).unwrap_or(u32::MAX),
            total_steps: u32::try_from(total).unwrap_or(u32::MAX),
            step_instruction: instruction,
        }
    }
}
