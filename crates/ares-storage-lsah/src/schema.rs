use crate::error::LsahStorageError;
use crate::hot_ring::{
    HotLsahSlot, VALID_HR_BPM, VALID_PULSE_BPM, VALID_RESP_RPM, VALID_RMSSD_MS, VALID_SPO2_PCT,
    VALID_VOCAL_BIOMARKERS,
};
use crate::pocus_signature::PocusSignatureRecord;
use arrow_array::builder::{
    BooleanBuilder, FixedSizeListBuilder, Float32Builder, Float64Builder, Int64Builder,
    StringBuilder, UInt8Builder, UInt16Builder, UInt32Builder, UInt64Builder,
};
use arrow_array::{Array, RecordBatch};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use std::collections::HashMap;
use std::sync::Arc;

/// Returns the Apache Arrow 58.4.0 schema for `lsah_telemetry_frames`.
/// Explicitly marks nullable biometric channels (`rmssd_ms`, `hr_bpm`, `pulse_bpm`, `resp_rpm`,
/// `spo2_pct`, and `[V1 3003]` vocal columns) as nullable to preserve Issue #11 null bitmaps.
pub fn lsah_telemetry_schema() -> SchemaRef {
    let mut metadata = HashMap::new();
    metadata.insert("ares.schema_version".to_string(), "1.0.0".to_string());
    metadata.insert(
        "ares.issue_11_hrv_policy".to_string(),
        "NULL_WHEN_NO_IBI".to_string(),
    );
    metadata.insert(
        "ares.issue_12_validation".to_string(),
        "ILLUSTRATIVE_UNVALIDATED".to_string(),
    );

    Arc::new(Schema::new_with_metadata(
        vec![
            Field::new("sequence_id", DataType::UInt64, false),
            Field::new("timestamp_unix_ms", DataType::Int64, false),
            Field::new("mission_sol", DataType::UInt16, false),
            Field::new("crew_id", DataType::Utf8, false),
            Field::new("provenance_code", DataType::UInt8, false),
            Field::new("validation_status_code", DataType::UInt8, false),
            Field::new("validity_mask", DataType::UInt32, false),
            Field::new("quality_flags_mask", DataType::UInt32, false),
            Field::new("safety_gates_mask", DataType::UInt8, false),
            Field::new("active_playbook_id", DataType::UInt8, false),
            Field::new("hr_bpm", DataType::Float64, true),
            Field::new("pulse_bpm", DataType::Float64, true),
            Field::new("resp_rpm", DataType::Float64, true),
            Field::new("spo2_pct", DataType::Float64, true),
            Field::new("rmssd_ms", DataType::Float64, true),
            Field::new("sbp_mmhg", DataType::Float32, false),
            Field::new("dbp_mmhg", DataType::Float32, false),
            Field::new("cabin_pp_co2_mmhg", DataType::Float32, false),
            Field::new("ared_strain_ue", DataType::Float32, false),
            Field::new("lbnp_pressure_mmhg", DataType::Float32, false),
            Field::new("cans_dose_msv_day", DataType::Float32, false),
            Field::new("tau_w_dyn_cm2", DataType::Float64, false),
            Field::new("ijv_csa_cm2", DataType::Float64, false),
            Field::new("ijv_vmax_cm_s", DataType::Float32, false),
            Field::new("sost_ng_ml", DataType::Float32, false),
            Field::new("mqi_index", DataType::Float32, false),
            Field::new("gai_pct", DataType::Float32, false),
            Field::new("onsd_mm", DataType::Float32, false),
            Field::new("pocus_p_thrombus", DataType::Float32, false),
            Field::new("rho_min_global", DataType::Float32, false),
            Field::new("ttv_hours", DataType::Float32, false),
            Field::new("sqi_score", DataType::Float32, false),
            Field::new("mri_score", DataType::Float32, false),
            Field::new("vitals_anomaly_score", DataType::Float32, false),
            Field::new("vocal_jitter_pct", DataType::Float32, true),
            Field::new("vocal_shimmer_db", DataType::Float32, true),
            Field::new("vocal_hnr_db", DataType::Float32, true),
            Field::new("rho_cardio", DataType::Float32, false),
            Field::new("rho_vascular_ijv", DataType::Float32, false),
            Field::new("rho_bone_sost", DataType::Float32, false),
            Field::new("rho_muscle_mqi", DataType::Float32, false),
            Field::new("rho_ocular_sans", DataType::Float32, false),
            Field::new("rho_radiation", DataType::Float32, false),
            Field::new("rho_co2_neuro", DataType::Float32, false),
            Field::new("forecast_q05_rho", DataType::Float32, false),
            Field::new("forecast_q50_rho", DataType::Float32, false),
            Field::new("forecast_q95_rho", DataType::Float32, false),
        ],
        metadata,
    ))
}

/// Converts a slice of `HotLsahSlot`s into an Apache Arrow `RecordBatch`, preserving true Arrow
/// validity-bitmap `0` bits for all missing channels (`rmssd_ms`, `pulse_bpm`, `spo2_pct`, etc.).
pub fn slots_to_record_batch(slots: &[HotLsahSlot]) -> Result<RecordBatch, LsahStorageError> {
    let n = slots.len();
    let schema = lsah_telemetry_schema();

    let mut sequence_id = UInt64Builder::with_capacity(n);
    let mut timestamp_unix_ms = Int64Builder::with_capacity(n);
    let mut mission_sol = UInt16Builder::with_capacity(n);
    let mut crew_id = StringBuilder::with_capacity(n, n * 16);
    let mut provenance_code = UInt8Builder::with_capacity(n);
    let mut validation_status_code = UInt8Builder::with_capacity(n);
    let mut validity_mask = UInt32Builder::with_capacity(n);
    let mut quality_flags_mask = UInt32Builder::with_capacity(n);
    let mut safety_gates_mask = UInt8Builder::with_capacity(n);
    let mut active_playbook_id = UInt8Builder::with_capacity(n);

    let mut hr_bpm = Float64Builder::with_capacity(n);
    let mut pulse_bpm = Float64Builder::with_capacity(n);
    let mut resp_rpm = Float64Builder::with_capacity(n);
    let mut spo2_pct = Float64Builder::with_capacity(n);
    let mut rmssd_ms = Float64Builder::with_capacity(n);

    let mut sbp_mmhg = Float32Builder::with_capacity(n);
    let mut dbp_mmhg = Float32Builder::with_capacity(n);
    let mut cabin_pp_co2_mmhg = Float32Builder::with_capacity(n);
    let mut ared_strain_ue = Float32Builder::with_capacity(n);
    let mut lbnp_pressure_mmhg = Float32Builder::with_capacity(n);
    let mut cans_dose_msv_day = Float32Builder::with_capacity(n);

    let mut tau_w_dyn_cm2 = Float64Builder::with_capacity(n);
    let mut ijv_csa_cm2 = Float64Builder::with_capacity(n);
    let mut ijv_vmax_cm_s = Float32Builder::with_capacity(n);
    let mut sost_ng_ml = Float32Builder::with_capacity(n);
    let mut mqi_index = Float32Builder::with_capacity(n);
    let mut gai_pct = Float32Builder::with_capacity(n);
    let mut onsd_mm = Float32Builder::with_capacity(n);
    let mut pocus_p_thrombus = Float32Builder::with_capacity(n);
    let mut rho_min_global = Float32Builder::with_capacity(n);
    let mut ttv_hours = Float32Builder::with_capacity(n);
    let mut sqi_score = Float32Builder::with_capacity(n);
    let mut mri_score = Float32Builder::with_capacity(n);
    let mut vitals_anomaly_score = Float32Builder::with_capacity(n);

    let mut vocal_jitter_pct = Float32Builder::with_capacity(n);
    let mut vocal_shimmer_db = Float32Builder::with_capacity(n);
    let mut vocal_hnr_db = Float32Builder::with_capacity(n);

    let mut rho_cardio = Float32Builder::with_capacity(n);
    let mut rho_vascular_ijv = Float32Builder::with_capacity(n);
    let mut rho_bone_sost = Float32Builder::with_capacity(n);
    let mut rho_muscle_mqi = Float32Builder::with_capacity(n);
    let mut rho_ocular_sans = Float32Builder::with_capacity(n);
    let mut rho_radiation = Float32Builder::with_capacity(n);
    let mut rho_co2_neuro = Float32Builder::with_capacity(n);
    let mut forecast_q05_rho = Float32Builder::with_capacity(n);
    let mut forecast_q50_rho = Float32Builder::with_capacity(n);
    let mut forecast_q95_rho = Float32Builder::with_capacity(n);

    for slot in slots {
        sequence_id.append_value(slot.sequence_id);
        timestamp_unix_ms.append_value(slot.timestamp_unix_ms);
        mission_sol.append_value(slot.mission_sol);
        crew_id.append_value(slot.crew_id_str());
        provenance_code.append_value(slot.provenance_code);
        validation_status_code.append_value(slot.validation_status_code);
        validity_mask.append_value(slot.validity_mask);
        quality_flags_mask.append_value(slot.quality_flags_mask);
        safety_gates_mask.append_value(slot.safety_gates_mask);
        active_playbook_id.append_value(slot.active_playbook_id);

        if (slot.validity_mask & VALID_HR_BPM) != 0 {
            hr_bpm.append_value(slot.hr_bpm);
        } else {
            hr_bpm.append_null();
        }
        if (slot.validity_mask & VALID_PULSE_BPM) != 0 {
            pulse_bpm.append_value(slot.pulse_bpm);
        } else {
            pulse_bpm.append_null();
        }
        if (slot.validity_mask & VALID_RESP_RPM) != 0 {
            resp_rpm.append_value(slot.resp_rpm);
        } else {
            resp_rpm.append_null();
        }
        if (slot.validity_mask & VALID_SPO2_PCT) != 0 {
            spo2_pct.append_value(slot.spo2_pct);
        } else {
            spo2_pct.append_null();
        }
        if (slot.validity_mask & VALID_RMSSD_MS) != 0 {
            rmssd_ms.append_value(slot.rmssd_ms);
        } else {
            rmssd_ms.append_null();
        }

        sbp_mmhg.append_value(slot.sbp_mmhg);
        dbp_mmhg.append_value(slot.dbp_mmhg);
        cabin_pp_co2_mmhg.append_value(slot.cabin_pp_co2_mmhg);
        ared_strain_ue.append_value(slot.ared_strain_ue);
        lbnp_pressure_mmhg.append_value(slot.lbnp_pressure_mmhg);
        cans_dose_msv_day.append_value(slot.cans_dose_msv_day);

        tau_w_dyn_cm2.append_value(slot.tau_w_dyn_cm2);
        ijv_csa_cm2.append_value(slot.ijv_csa_cm2);
        ijv_vmax_cm_s.append_value(slot.ijv_vmax_cm_s);
        sost_ng_ml.append_value(slot.sost_ng_ml);
        mqi_index.append_value(slot.mqi_index);
        gai_pct.append_value(slot.gai_pct);
        onsd_mm.append_value(slot.onsd_mm);
        pocus_p_thrombus.append_value(slot.pocus_p_thrombus);
        rho_min_global.append_value(slot.rho_min_global);
        ttv_hours.append_value(slot.ttv_hours);
        sqi_score.append_value(slot.sqi_score);
        mri_score.append_value(slot.mri_score);
        vitals_anomaly_score.append_value(slot.vitals_anomaly_score);

        if (slot.validity_mask & VALID_VOCAL_BIOMARKERS) != 0 {
            vocal_jitter_pct.append_value(slot.vocal_jitter_pct);
            vocal_shimmer_db.append_value(slot.vocal_shimmer_db);
            vocal_hnr_db.append_value(slot.vocal_hnr_db);
        } else {
            vocal_jitter_pct.append_null();
            vocal_shimmer_db.append_null();
            vocal_hnr_db.append_null();
        }

        rho_cardio.append_value(slot.rho_cardio);
        rho_vascular_ijv.append_value(slot.rho_vascular_ijv);
        rho_bone_sost.append_value(slot.rho_bone_sost);
        rho_muscle_mqi.append_value(slot.rho_muscle_mqi);
        rho_ocular_sans.append_value(slot.rho_ocular_sans);
        rho_radiation.append_value(slot.rho_radiation);
        rho_co2_neuro.append_value(slot.rho_co2_neuro);
        forecast_q05_rho.append_value(slot.forecast_q05_rho);
        forecast_q50_rho.append_value(slot.forecast_q50_rho);
        forecast_q95_rho.append_value(slot.forecast_q95_rho);
    }

    let columns: Vec<Arc<dyn Array>> = vec![
        Arc::new(sequence_id.finish()),
        Arc::new(timestamp_unix_ms.finish()),
        Arc::new(mission_sol.finish()),
        Arc::new(crew_id.finish()),
        Arc::new(provenance_code.finish()),
        Arc::new(validation_status_code.finish()),
        Arc::new(validity_mask.finish()),
        Arc::new(quality_flags_mask.finish()),
        Arc::new(safety_gates_mask.finish()),
        Arc::new(active_playbook_id.finish()),
        Arc::new(hr_bpm.finish()),
        Arc::new(pulse_bpm.finish()),
        Arc::new(resp_rpm.finish()),
        Arc::new(spo2_pct.finish()),
        Arc::new(rmssd_ms.finish()),
        Arc::new(sbp_mmhg.finish()),
        Arc::new(dbp_mmhg.finish()),
        Arc::new(cabin_pp_co2_mmhg.finish()),
        Arc::new(ared_strain_ue.finish()),
        Arc::new(lbnp_pressure_mmhg.finish()),
        Arc::new(cans_dose_msv_day.finish()),
        Arc::new(tau_w_dyn_cm2.finish()),
        Arc::new(ijv_csa_cm2.finish()),
        Arc::new(ijv_vmax_cm_s.finish()),
        Arc::new(sost_ng_ml.finish()),
        Arc::new(mqi_index.finish()),
        Arc::new(gai_pct.finish()),
        Arc::new(onsd_mm.finish()),
        Arc::new(pocus_p_thrombus.finish()),
        Arc::new(rho_min_global.finish()),
        Arc::new(ttv_hours.finish()),
        Arc::new(sqi_score.finish()),
        Arc::new(mri_score.finish()),
        Arc::new(vitals_anomaly_score.finish()),
        Arc::new(vocal_jitter_pct.finish()),
        Arc::new(vocal_shimmer_db.finish()),
        Arc::new(vocal_hnr_db.finish()),
        Arc::new(rho_cardio.finish()),
        Arc::new(rho_vascular_ijv.finish()),
        Arc::new(rho_bone_sost.finish()),
        Arc::new(rho_muscle_mqi.finish()),
        Arc::new(rho_ocular_sans.finish()),
        Arc::new(rho_radiation.finish()),
        Arc::new(rho_co2_neuro.finish()),
        Arc::new(forecast_q05_rho.finish()),
        Arc::new(forecast_q50_rho.finish()),
        Arc::new(forecast_q95_rho.finish()),
    ];

    Ok(RecordBatch::try_new(schema, columns)?)
}

/// Returns the Apache Arrow 58.4.0 schema for `lsah_pocus_signatures`.
pub fn lsah_pocus_signatures_schema(dim: usize) -> Result<SchemaRef, LsahStorageError> {
    if dim != 128 && dim != 256 {
        return Err(LsahStorageError::EmbeddingDimensionMismatch {
            expected: 128,
            actual: dim,
        });
    }
    let item_field = Arc::new(Field::new("item", DataType::Float32, false));
    Ok(Arc::new(Schema::new(vec![
        Field::new("signature_id", DataType::UInt64, false),
        Field::new("timestamp_unix_ms", DataType::Int64, false),
        Field::new("mission_sol", DataType::UInt16, false),
        Field::new("crew_id", DataType::Utf8, false),
        Field::new("anatomical_target_uberon", DataType::Utf8, false),
        Field::new("tau_w_dyn_cm2", DataType::Float64, false),
        Field::new("ijv_csa_cm2", DataType::Float64, false),
        Field::new("ijv_vmax_cm_s", DataType::Float32, false),
        Field::new("lbnp_pressure_mmhg", DataType::Float32, false),
        Field::new("pocus_p_thrombus", DataType::Float32, false),
        Field::new("embedding_origin", DataType::Utf8, false),
        Field::new("validation_status", DataType::Utf8, false),
        Field::new("anticoagulant_gate_locked", DataType::Boolean, false),
        Field::new(
            "feature_vector",
            DataType::FixedSizeList(item_field, dim as i32),
            false,
        ),
    ])))
}

/// Encodes episodic `PocusSignatureRecord` entries into an Apache Arrow `RecordBatch`.
pub fn pocus_records_to_record_batch(
    records: &[PocusSignatureRecord],
    dim: usize,
) -> Result<RecordBatch, LsahStorageError> {
    let schema = lsah_pocus_signatures_schema(dim)?;
    let n = records.len();

    let mut signature_id = UInt64Builder::with_capacity(n);
    let mut timestamp_unix_ms = Int64Builder::with_capacity(n);
    let mut mission_sol = UInt16Builder::with_capacity(n);
    let mut crew_id = StringBuilder::with_capacity(n, n * 16);
    let mut anatomical_target_uberon = StringBuilder::with_capacity(n, n * 16);
    let mut tau_w_dyn_cm2 = Float64Builder::with_capacity(n);
    let mut ijv_csa_cm2 = Float64Builder::with_capacity(n);
    let mut ijv_vmax_cm_s = Float32Builder::with_capacity(n);
    let mut lbnp_pressure_mmhg = Float32Builder::with_capacity(n);
    let mut pocus_p_thrombus = Float32Builder::with_capacity(n);
    let mut embedding_origin = StringBuilder::with_capacity(n, n * 32);
    let mut validation_status = StringBuilder::with_capacity(n, n * 32);
    let mut anticoagulant_gate_locked = BooleanBuilder::with_capacity(n);
    let item_field = Arc::new(Field::new("item", DataType::Float32, false));
    let mut feature_vector =
        FixedSizeListBuilder::new(Float32Builder::with_capacity(n * dim), dim as i32)
            .with_field(item_field);

    for rec in records {
        if rec.feature_vector.len() != dim {
            return Err(LsahStorageError::EmbeddingDimensionMismatch {
                expected: dim,
                actual: rec.feature_vector.len(),
            });
        }
        signature_id.append_value(rec.signature_id);
        timestamp_unix_ms.append_value(rec.timestamp_unix_ms);
        mission_sol.append_value(rec.mission_sol);
        crew_id.append_value(&rec.crew_id);
        anatomical_target_uberon.append_value(&rec.anatomical_target_uberon);
        tau_w_dyn_cm2.append_value(rec.context.tau_w_dyn_cm2);
        ijv_csa_cm2.append_value(rec.context.ijv_csa_cm2);
        ijv_vmax_cm_s.append_value(rec.context.ijv_vmax_cm_s);
        lbnp_pressure_mmhg.append_value(rec.context.lbnp_pressure_mmhg);
        pocus_p_thrombus.append_value(rec.context.pocus_p_thrombus);
        embedding_origin.append_value(rec.embedding_origin.as_str());
        validation_status.append_value(rec.validation_status_str());
        anticoagulant_gate_locked.append_value(rec.anticoagulant_gate_locked);

        let values = feature_vector.values();
        for (idx, &v) in rec.feature_vector.iter().enumerate() {
            if !v.is_finite() {
                return Err(LsahStorageError::NonFiniteEmbeddingValue { index: idx });
            }
            values.append_value(v);
        }
        feature_vector.append(true);
    }

    let columns: Vec<Arc<dyn Array>> = vec![
        Arc::new(signature_id.finish()),
        Arc::new(timestamp_unix_ms.finish()),
        Arc::new(mission_sol.finish()),
        Arc::new(crew_id.finish()),
        Arc::new(anatomical_target_uberon.finish()),
        Arc::new(tau_w_dyn_cm2.finish()),
        Arc::new(ijv_csa_cm2.finish()),
        Arc::new(ijv_vmax_cm_s.finish()),
        Arc::new(lbnp_pressure_mmhg.finish()),
        Arc::new(pocus_p_thrombus.finish()),
        Arc::new(embedding_origin.finish()),
        Arc::new(validation_status.finish()),
        Arc::new(anticoagulant_gate_locked.finish()),
        Arc::new(feature_vector.finish()),
    ];

    Ok(RecordBatch::try_new(schema, columns)?)
}
