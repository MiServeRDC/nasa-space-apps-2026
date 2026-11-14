//! `ares-medops-playbooks`: Deterministic Type-1 Crystallized MedOps Playbooks (`#01-#05`)
//! and the 3 Hard Clinical Safety Gates (`3. ACT`).

pub mod grounding;
pub mod playbooks;
pub mod safety_gates;

pub use grounding::{
    PlaybookError, PlaybookGovernanceVerdict, PlaybookNormativeGrounding, ground_playbook_normative,
    verify_playbook_governance,
};
pub use playbooks::select_candidate_playbook;
pub use safety_gates::enforce_hard_clinical_safety_gates;
