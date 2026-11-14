use crate::error::LsahStorageError;
use crate::hot_ring::{
    HotLsahSlot, VALID_HR_BPM, VALID_PULSE_BPM, VALID_RESP_RPM, VALID_RMSSD_MS, VALID_SPO2_PCT,
    VALID_VOCAL_BIOMARKERS,
};
use ares_core_types::security::{CrewRole, MedOpsAuditLogger};
use ares_security_privacy::Sha256AuditLogger;
use arrow_array::builder::Float32Builder;
use arrow_array::{ArrayRef, RecordBatch};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Role-based access classification for LSAH storage reads under NASA-STD-3001 Vol. 1 [V1 3003].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LsahAccessRole {
    PeerAstronaut,
    HabitatCommander,
    FlightSurgeon,
}

impl LsahAccessRole {
    /// Maps LSAH role to core `CrewRole` for `Sha256AuditLogger` entries.
    #[inline]
    pub const fn to_core_crew_role(self) -> CrewRole {
        match self {
            Self::PeerAstronaut => CrewRole::AstronautSelf,
            Self::HabitatCommander => CrewRole::CrewMedicalOfficer,
            Self::FlightSurgeon => CrewRole::GroundFlightSurgeon,
        }
    }

    #[inline]
    pub const fn can_view_vocal_biomarkers(self) -> bool {
        matches!(self, Self::FlightSurgeon)
    }
}

impl From<CrewRole> for LsahAccessRole {
    fn from(role: CrewRole) -> Self {
        match role {
            CrewRole::AstronautSelf => Self::PeerAstronaut,
            CrewRole::CrewMedicalOfficer => Self::HabitatCommander,
            CrewRole::GroundFlightSurgeon => Self::FlightSurgeon,
        }
    }
}

/// Privacy-projected Hot-tier telemetry frame DTO.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotTelemetryView {
    pub sequence_id: u64,
    pub timestamp_unix_ms: i64,
    pub mission_sol: u16,
    pub crew_id: String,
    pub hr_bpm: Option<f64>,
    pub pulse_bpm: Option<f64>,
    pub resp_rpm: Option<f64>,
    pub spo2_pct: Option<f64>,
    pub rmssd_ms: Option<f64>,
    pub tau_w_dyn_cm2: f64,
    pub ijv_csa_cm2: f64,
    pub pocus_p_thrombus: f32,
    pub rho_min_global: f32,
    pub mri_score: f32,
    pub vocal_jitter_pct: Option<f32>,
    pub vocal_shimmer_db: Option<f32>,
    pub vocal_hnr_db: Option<f32>,
}

/// Projects `HotLsahSlot` frames for `role`, masking `[V1 3003]` vocal biomarkers unless `FlightSurgeon`
/// and recording an audit trail entry whenever vocal biomarkers are accessed.
pub fn project_hot_slots_for_role(
    slots: &[HotLsahSlot],
    role: LsahAccessRole,
    audit_logger: &Sha256AuditLogger,
) -> Result<Vec<HotTelemetryView>, LsahStorageError> {
    if role.can_view_vocal_biomarkers() {
        audit_logger.append_audit_event(
            role.to_core_crew_role(),
            "LSAH_VOCAL_BIOMARKER_READ_HOT_FLIGHT_SURGEON",
        )?;
    }

    let allow_vocal = role.can_view_vocal_biomarkers();
    let views = slots
        .iter()
        .map(|s| {
            let vocal_present = (s.validity_mask & VALID_VOCAL_BIOMARKERS) != 0;
            HotTelemetryView {
                sequence_id: s.sequence_id,
                timestamp_unix_ms: s.timestamp_unix_ms,
                mission_sol: s.mission_sol,
                crew_id: s.crew_id_str().to_string(),
                hr_bpm: ((s.validity_mask & VALID_HR_BPM) != 0).then_some(s.hr_bpm),
                pulse_bpm: ((s.validity_mask & VALID_PULSE_BPM) != 0).then_some(s.pulse_bpm),
                resp_rpm: ((s.validity_mask & VALID_RESP_RPM) != 0).then_some(s.resp_rpm),
                spo2_pct: ((s.validity_mask & VALID_SPO2_PCT) != 0).then_some(s.spo2_pct),
                rmssd_ms: ((s.validity_mask & VALID_RMSSD_MS) != 0).then_some(s.rmssd_ms),
                tau_w_dyn_cm2: s.tau_w_dyn_cm2,
                ijv_csa_cm2: s.ijv_csa_cm2,
                pocus_p_thrombus: s.pocus_p_thrombus,
                rho_min_global: s.rho_min_global,
                mri_score: s.mri_score,
                vocal_jitter_pct: (allow_vocal && vocal_present).then_some(s.vocal_jitter_pct),
                vocal_shimmer_db: (allow_vocal && vocal_present).then_some(s.vocal_shimmer_db),
                vocal_hnr_db: (allow_vocal && vocal_present).then_some(s.vocal_hnr_db),
            }
        })
        .collect();
    Ok(views)
}

/// Applies NASA-STD-3001 [V1 3003] privacy projection across Warm or Cold Apache Arrow `RecordBatch`es.
/// For `PeerAstronaut` and `HabitatCommander`, `vocal_jitter_pct`, `vocal_shimmer_db`, and
/// `vocal_hnr_db` are strictly nulled out in Arrow validity bitmaps.
/// For `FlightSurgeon`, vocal columns are preserved and an audit event is recorded.
pub fn project_record_batches_for_role(
    batches: &[RecordBatch],
    role: LsahAccessRole,
    audit_logger: &Sha256AuditLogger,
    tier_label: &str,
) -> Result<Vec<RecordBatch>, LsahStorageError> {
    if role.can_view_vocal_biomarkers() {
        audit_logger.append_audit_event(
            role.to_core_crew_role(),
            &format!("LSAH_VOCAL_BIOMARKER_READ_{tier_label}_FLIGHT_SURGEON"),
        )?;
        return Ok(batches.to_vec());
    }

    let mut projected = Vec::with_capacity(batches.len());
    for batch in batches {
        let schema = batch.schema();
        let rows = batch.num_rows();
        let mut columns: Vec<ArrayRef> = Vec::with_capacity(batch.num_columns());

        for (idx, field) in schema.fields().iter().enumerate() {
            if matches!(
                field.name().as_str(),
                "vocal_jitter_pct" | "vocal_shimmer_db" | "vocal_hnr_db"
            ) {
                let mut builder = Float32Builder::with_capacity(rows);
                for _ in 0..rows {
                    builder.append_null();
                }
                columns.push(Arc::new(builder.finish()));
            } else {
                columns.push(Arc::clone(batch.column(idx)));
            }
        }
        projected.push(RecordBatch::try_new(schema, columns)?);
    }
    Ok(projected)
}
