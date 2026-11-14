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

use serde::{Deserialize, Serialize};

/// Standard multi-horizon steps in seconds for Direct Multi-Horizon Forecasting:
/// +15 min (900 s), +1 h (3600 s), +6 h (21600 s), +24 h (86400 s).
pub const DHF_HORIZONS_SECONDS: [u32; 4] = [900, 3_600, 21_600, 86_400];

/// Strictly monotone quantile triplet (5th, 50th/median, 95th percentile).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MonotoneQuantileTriplet {
    pub q05: f64,
    pub q50: f64,
    pub q95: f64,
}

impl MonotoneQuantileTriplet {
    /// Constructs a quantile triplet guaranteed monotone by construction: q05 <= q50 <= q95.
    #[inline]
    pub fn from_median_and_spreads(median: f64, lower_spread: f64, upper_spread: f64) -> Self {
        let med = if median.is_finite() { median } else { 0.0 };
        let dl = if lower_spread.is_finite() {
            lower_spread.max(0.0)
        } else {
            0.0
        };
        let du = if upper_spread.is_finite() {
            upper_spread.max(0.0)
        } else {
            0.0
        };
        Self {
            q05: med - dl,
            q50: med,
            q95: med + du,
        }
    }

    /// Interval width of the 90% prediction cone (q95 - q05 >= 0.0).
    #[inline]
    pub fn interval_width(&self) -> f64 {
        if self.q95.is_finite() && self.q05.is_finite() {
            (self.q95 - self.q05).max(0.0)
        } else {
            f64::INFINITY
        }
    }

    /// Returns true iff all values are finite and q05 <= q50 <= q95.
    #[inline]
    pub fn is_monotone(&self) -> bool {
        self.q05.is_finite()
            && self.q50.is_finite()
            && self.q95.is_finite()
            && self.q05 <= self.q50
            && self.q50 <= self.q95
    }

    /// Verifies the non-crossing invariant q05 <= q50 <= q95 without panicking.
    #[inline]
    pub fn assert_monotone(&self) -> Result<(), AresCoreError> {
        if !self.q05.is_finite() || !self.q50.is_finite() || !self.q95.is_finite() {
            return Err(AresCoreError::NonFiniteValue {
                field: "MonotoneQuantileTriplet",
            });
        }
        if self.q05 > self.q50 || self.q50 > self.q95 {
            return Err(AresCoreError::QuantileCrossing {
                q05: self.q05,
                q50: self.q50,
                q95: self.q95,
            });
        }
        Ok(())
    }
}

/// Multi-horizon quantile forecast cone (+15 min, +1 h, +6 h, +24 h) for a single channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelQuantileCone {
    pub channel_name: String,
    pub horizon_15m: MonotoneQuantileTriplet,
    pub horizon_1h: MonotoneQuantileTriplet,
    pub horizon_6h: MonotoneQuantileTriplet,
    pub horizon_24h: MonotoneQuantileTriplet,
}

impl ChannelQuantileCone {
    /// Verifies non-crossing monotonicity across all 4 forecast horizons.
    pub fn assert_monotone(&self) -> Result<(), AresCoreError> {
        self.horizon_15m.assert_monotone()?;
        self.horizon_1h.assert_monotone()?;
        self.horizon_6h.assert_monotone()?;
        self.horizon_24h.assert_monotone()?;
        Ok(())
    }

    /// Returns true iff all 4 forecast horizons satisfy q05 <= q50 <= q95.
    #[inline]
    pub fn is_monotone(&self) -> bool {
        self.horizon_15m.is_monotone()
            && self.horizon_1h.is_monotone()
            && self.horizon_6h.is_monotone()
            && self.horizon_24h.is_monotone()
    }
}

/// Operational status of the Adaptive Conformal Abstention Gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConformalGateStatus {
    /// Timestral quantile cone is calibrated within clinical uncertainty bounds.
    CalibratedQuantileCone,
    /// Epistemic uncertainty or signal degradation exceeded bounds; deterministic fallback active.
    AbstainedFallbackDeterministic,
}

/// Auditable certificate emitted by ConformalAbstentionGate when evaluating forecast reliability.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AbstentionCertificate {
    pub abstained: bool,
    pub status: ConformalGateStatus,
    pub reason: String,
    pub empirical_coverage_error: f64,
    pub adaptive_alpha_t: f64,
    pub interval_width: f64,
    pub sqi_score: f64,
    pub missing_ratio: f64,
    pub timestamp_s: f64,
}

/// Immutable grey-box forecast snapshot published by the 1 Hz worker and read lock-free at 20 Hz.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NqsQuantileForecastSnapshot {
    pub source_recording_time_s: f64,
    pub confidence_state: ConformalGateStatus,
    pub abstention_certificate: AbstentionCertificate,
    pub short_horizon_s: u32,
    pub heart_rate_bpm_cone: MonotoneQuantileTriplet,
    pub resp_rate_brpm_cone: MonotoneQuantileTriplet,
    pub rmssd_ms_cone: Option<MonotoneQuantileTriplet>,
    pub rho_global_cone: Option<MonotoneQuantileTriplet>,
    /// Time-To-Violation (hours): q05 = pessimistic worst-case, q50 = median, q95 = optimistic.
    pub ttv_hours_cone: Option<MonotoneQuantileTriplet>,
    pub channel_cones: Vec<ChannelQuantileCone>,
    pub pessimistic_ttv_q05_hours: Option<f64>,
    pub inference_latency_us: u64,
}

impl NqsQuantileForecastSnapshot {
    /// Constructs an initial deterministic fallback snapshot without heap-heavy state.
    pub fn initial_deterministic(
        recording_time_s: f64,
        rho_global: impl Into<Option<f64>>,
        ttv_mean: impl Into<Option<f64>>,
        ttv_low: impl Into<Option<f64>>,
        ttv_high: impl Into<Option<f64>>,
    ) -> Self {
        let rho_global = rho_global.into().filter(|x| x.is_finite());
        let ttv = ttv_mean
            .into()
            .zip(ttv_low.into())
            .zip(ttv_high.into())
            .filter(|((mean, low), high)| mean.is_finite() && low.is_finite() && high.is_finite())
            .and_then(|((mean, low), high)| {
                rho_global.map(|_| MonotoneQuantileTriplet {
                    q05: low.min(mean).max(0.0),
                    q50: mean.max(0.0),
                    q95: high.max(mean).max(0.0),
                })
            });
        Self {
            source_recording_time_s: recording_time_s,
            confidence_state: ConformalGateStatus::AbstainedFallbackDeterministic,
            abstention_certificate: AbstentionCertificate {
                abstained: true,
                status: ConformalGateStatus::AbstainedFallbackDeterministic,
                reason: "initial warmup; unavailable inputs are not replaced".into(),
                empirical_coverage_error: 0.0,
                adaptive_alpha_t: 0.10,
                interval_width: 0.16,
                sqi_score: 1.0,
                missing_ratio: 0.0,
                timestamp_s: recording_time_s,
            },
            short_horizon_s: 900,
            heart_rate_bpm_cone: MonotoneQuantileTriplet::from_median_and_spreads(72.0, 4.0, 4.0),
            resp_rate_brpm_cone: MonotoneQuantileTriplet::from_median_and_spreads(14.0, 1.5, 1.5),
            rmssd_ms_cone: None,
            rho_global_cone: rho_global
                .map(|rho| MonotoneQuantileTriplet::from_median_and_spreads(rho, 0.08, 0.08)),
            ttv_hours_cone: ttv,
            channel_cones: Vec::new(),
            pessimistic_ttv_q05_hours: ttv.map(|cone| cone.q05),
            inference_latency_us: 0,
        }
    }

    /// Verifies non-crossing monotonicity across all quantile cones in this snapshot.
    pub fn assert_monotone(&self) -> Result<(), AresCoreError> {
        self.heart_rate_bpm_cone.assert_monotone()?;
        self.resp_rate_brpm_cone.assert_monotone()?;
        if let Some(cone) = self.rmssd_ms_cone {
            cone.assert_monotone()?;
        }
        if let Some(cone) = self.rho_global_cone {
            cone.assert_monotone()?;
        }
        if let Some(cone) = self.ttv_hours_cone {
            cone.assert_monotone()?;
        }
        for cone in &self.channel_cones {
            cone.assert_monotone()?;
        }
        Ok(())
    }
}

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
                hrv_unavailable_reason: None,
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
                rho_rmssd: Some(0.59),
                rho_sans: 0.71,
                rho_global: Some(0.32),
                ttv_hours: Some(160.0),
                ttv_ci95_low_hours: Some(125.0),
                ttv_ci95_high_hours: Some(221.0),
                mri_pct: Some(82.5),
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

    #[test]
    fn test_block_h_monotone_quantile_contracts_and_serialization() {
        let valid = MonotoneQuantileTriplet::from_median_and_spreads(0.45, 0.12, 0.18);
        assert!(valid.is_monotone());
        valid
            .assert_monotone()
            .expect("valid triplet should be monotone");

        let crossing = MonotoneQuantileTriplet {
            q05: 0.60,
            q50: 0.50,
            q95: 0.70,
        };
        assert!(!crossing.is_monotone());
        assert!(matches!(
            crossing.assert_monotone(),
            Err(AresCoreError::QuantileCrossing { .. })
        ));

        let non_finite = MonotoneQuantileTriplet {
            q05: 0.1,
            q50: f64::NAN,
            q95: 0.9,
        };
        assert!(matches!(
            non_finite.assert_monotone(),
            Err(AresCoreError::NonFiniteValue { .. })
        ));

        let cone = ChannelQuantileCone {
            channel_name: "heart_rate_bpm".to_string(),
            horizon_15m: MonotoneQuantileTriplet::from_median_and_spreads(72.0, 3.0, 3.5),
            horizon_1h: MonotoneQuantileTriplet::from_median_and_spreads(73.0, 5.0, 6.0),
            horizon_6h: MonotoneQuantileTriplet::from_median_and_spreads(74.0, 8.0, 9.0),
            horizon_24h: MonotoneQuantileTriplet::from_median_and_spreads(75.0, 10.0, 12.0),
        };
        cone.assert_monotone()
            .expect("channel cone should be monotone");

        let mut snap =
            NqsQuantileForecastSnapshot::initial_deterministic(12.0, 0.52, 96.0, 70.0, 140.0);
        snap.channel_cones.push(cone);
        snap.assert_monotone().expect("snapshot should be monotone");

        let json = serde_json::to_string(&snap).expect("serialize snapshot");
        let roundtrip: NqsQuantileForecastSnapshot =
            serde_json::from_str(&json).expect("deserialize snapshot");
        assert_eq!(roundtrip, snap);
    }
}
