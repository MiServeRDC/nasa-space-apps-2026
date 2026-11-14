//! `ares-core-types`: Contratti telemetrici condivisi, manifesto di provenienza,
//! costanti normative NASA-STD-3001, errori fortemente tipizzati e trait di sicurezza.

pub mod constants;
pub mod error;
pub mod security;
pub mod telemetry;

pub use constants::*;
pub use error::AresCoreError;
pub use security::{
    AuditChainRecord, CrewPrivacyFilter, CrewRole, McpInputSanitizer, MedOpsAuditLogger,
    NoOpSecurity,
};
pub use telemetry::{
    ActivePlaybook, AlertSeverity, Biometrics, BiometricsSource, CountermeasureAction,
    JugularFlowGrade, JugularHemodynamics, Musculoskeletal, NqsStlMargins, ProvenanceManifest,
    SafetyGates, SansOcular, ScenarioOverlayMode, StressTestScenarioInput, SystemPhase,
    TelemetryPacket,
};

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_telemetry_packet_with_nulls() -> TelemetryPacket {
        TelemetryPacket {
            timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
            mission_Elapsed_seconds: 120.0,
            relative_recording_time_s: 42.0,
            source_record_id: "bidmc_01".to_string(),
            flight_day: 90,
            astronaut_id: "ARES-CDR-01".to_string(),
            system_phase: SystemPhase::Evaluate,
            alert_severity: AlertSeverity::Caution,
            provenance_manifest: ProvenanceManifest {
                biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
                biometrics_native_rate_hz: 1.0,
                ui_refresh_rate_hz: 20.0,
                scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
                biological_context_refs: vec![
                    "PhysioNet-BIDMC-v1.0.0".to_string(),
                    "NASA-STD-3001-V1C-V2F".to_string(),
                ],
            },
            biometrics: Biometrics {
                heart_rate_bpm: Some(88.0),
                pulse_rate_bpm: None,
                resp_rate_brpm: Some(16.0),
                spo2_pct: None,
                rmssd_ms: Some(36.5),
                sdnn_ms: Some(48.2),
                pnn50_pct: Some(15.9),
                lf_hf_ratio: Some(3.01),
                vocal_f0_hz: Some(118.5),
                vocal_jitter_pct: Some(0.62),
                radiation_dose_rate_msv_d: 0.45,
                sqi_score: 0.85,
                missing_channels: vec!["pulse_rate_bpm".to_string(), "spo2_pct".to_string()],
            },
            musculoskeletal: Musculoskeletal {
                ared_daily_load_kgf: 125.0,
                soleus_csa_pct: 94.0,
                echo_intensity_au: 52.0,
                mqi_index: 0.84,
                sclerostin_pmol_l: 26.5,
                urinary_calcium_mg_d: 191.8,
                gai_pct: 6.1,
            },
            jugular_hemodynamics: JugularHemodynamics {
                ijv_csa_mm2: 68.0,
                ijv_vmax_cm_s: 11.4,
                tau_w_dyn_cm2: 1.71,
                flow_grade: JugularFlowGrade::NormalContinuous,
                pocus_thrombus_confirmed: false,
                lbnp_active: false,
                lbnp_pressure_mmhg: 0.0,
            },
            sans_ocular: SansOcular {
                onsd_mm: 5.4,
                choroidal_delta_um: 28.0,
                sans_risk_index: 0.31,
            },
            nqs_stl: NqsStlMargins {
                rho_tau_w: 0.32,
                rho_ared: 1.0,
                rho_sost: 0.92,
                rho_rmssd: 0.59,
                rho_sans: 0.71,
                rho_global: 0.32,
                ttv_hours: 160.0,
                ttv_ci95_low_hours: 125.0,
                ttv_ci95_high_hours: 221.0,
                mri_pct: 82.5,
            },
            active_playbook: ActivePlaybook {
                playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED".to_string(),
                title: "Playbook #03: Frost Mechanostat ARED Loading & Renal Stone Prevention"
                    .to_string(),
                causal_chain_summary: vec![
                    "ARED Load 125 kgf -> Soleus MQI 0.84 & SOST 26.5 pmol/L".to_string(),
                ],
                safety_gates: SafetyGates {
                    anticoagulant_lock_active: true,
                    lbnp_auto_vent_armed: true,
                    eva_suit_damping_active: false,
                },
                actions: vec![CountermeasureAction {
                    action_id: "ACT_ARED_FROST_LOAD".to_string(),
                    label: "Maintain ARED resistive squat/heel-raise load >= 125 kgf".to_string(),
                    category: "MECHANICAL_COUNTERMEASURE".to_string(),
                    delta_rho_per_hour: 0.11,
                }],
            },
        }
    }

    #[test]
    fn test_telemetry_packet_json_roundtrip_with_nulls() {
        let packet = sample_telemetry_packet_with_nulls();
        let json_str = serde_json::to_string(&packet).expect("serialization should succeed");

        assert!(json_str.contains("\"pulse_rate_bpm\":null"));
        assert!(json_str.contains("\"spo2_pct\":null"));
        assert!(json_str.contains("\"missing_channels\":[\"pulse_rate_bpm\",\"spo2_pct\"]"));

        let decoded: TelemetryPacket =
            serde_json::from_str(&json_str).expect("deserialization should succeed");
        assert_eq!(decoded, packet);
        assert_eq!(decoded.biometrics.pulse_rate_bpm, None);
        assert_eq!(decoded.biometrics.spo2_pct, None);
        assert_eq!(decoded.biometrics.heart_rate_bpm, Some(88.0));
    }

    #[test]
    fn test_provenance_manifest_serialization() {
        let manifest = ProvenanceManifest {
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
            biometrics_native_rate_hz: 1.0,
            ui_refresh_rate_hz: 20.0,
            scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
            biological_context_refs: vec!["PhysioNet-BIDMC-v1.0.0".to_string()],
        };

        let json_val = serde_json::to_value(&manifest).expect("to_value should succeed");
        assert_eq!(
            json_val["biometrics_source"],
            serde_json::Value::String("RECORDED_TERRESTRIAL_BIDMC_CSV".to_string())
        );
        assert_eq!(
            json_val["scenario_overlay_mode"],
            serde_json::Value::String("DERIVED_AND_SIMULATED".to_string())
        );

        let sim_source = serde_json::to_value(BiometricsSource::SimulatedScenarioInput)
            .expect("to_value should succeed");
        assert_eq!(
            sim_source,
            serde_json::Value::String("SIMULATED_SCENARIO_INPUT".to_string())
        );
    }

    #[test]
    fn test_sanitize_f64_rejects_nan_and_inf() {
        assert!((sanitize_f64(42.5, 0.0) - 42.5).abs() < 1e-12);
        assert!((sanitize_f64(f64::NAN, 1.20) - 1.20).abs() < 1e-12);
        assert!((sanitize_f64(f64::INFINITY, 24.0) - 24.0).abs() < 1e-12);
        assert!((sanitize_f64(f64::NEG_INFINITY, 125.0) - 125.0).abs() < 1e-12);
    }

    #[test]
    fn test_noop_security_wraps_untrusted_observation_and_passes_through() {
        let sec = NoOpSecurity;
        let wrapped = sec.wrap_untrusted_observation("IJV velocity 3.1 cm/s");
        assert_eq!(
            wrapped,
            "<untrusted_telemetry_observation>IJV velocity 3.1 cm/s</untrusted_telemetry_observation>"
        );

        let query = sec
            .sanitize_mcp_query("  get_crew_health_summary  ")
            .expect("sanitize should succeed");
        assert_eq!(query, "get_crew_health_summary");

        let packet = sample_telemetry_packet_with_nulls();
        let filtered = sec
            .filter_packet_for_role(&packet, CrewRole::AstronautSelf)
            .expect("filter should succeed");
        assert_eq!(filtered, packet);

        let audit = sec
            .append_audit_event(CrewRole::CrewMedicalOfficer, "ACT_LBNP_MINUS_30_MMHG")
            .expect("audit append should succeed");
        assert_eq!(audit.actor_role, CrewRole::CrewMedicalOfficer);
        assert_eq!(audit.prev_hash_hex.len(), 64);
        assert!(sec.verify_chain_integrity().expect("verify should succeed"));
    }

    #[test]
    fn test_stress_test_scenario_input_and_errors() {
        let scenario = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 120,
            ared_daily_load_kgf: 0.0,
            radiation_dose_rate_msv_d: 2.1,
            lbnp_active: true,
            lbnp_pressure_mmhg: -30.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 16.5,
        };
        let encoded = serde_json::to_string(&scenario).expect("serialize scenario");
        let decoded: StressTestScenarioInput =
            serde_json::from_str(&encoded).expect("deserialize scenario");
        assert_eq!(decoded, scenario);

        let err = AresCoreError::NonFiniteValue { field: "tau_w" };
        assert!(err.to_string().contains("tau_w"));
    }
}
