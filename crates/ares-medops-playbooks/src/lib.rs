#![forbid(unsafe_code)]

//! `ares-medops-playbooks`: Deterministic Type-1 Crystallized MedOps Playbooks (`#01-#09`)
//! and the 3 Hard Clinical Safety Gates (`3. ACT`).

pub mod grounding;
pub mod playbooks;
pub mod pocus_multiorgan;
pub mod safety_gates;

pub use grounding::{
    PlaybookError, PlaybookGovernanceVerdict, PlaybookNormativeGrounding, ground_playbook_normative,
    verify_playbook_governance,
};
pub use playbooks::{
    select_candidate_playbook, select_candidate_playbook_ext, select_vitals_anomaly_playbook,
};
pub use pocus_multiorgan::{
    PocusAnatomicalTarget, PocusEfastScan, PocusOcularScan, PocusRenalBladderScan,
};
pub use safety_gates::{enforce_hard_clinical_safety_gates, enforce_hard_clinical_safety_gates_ext};
