//! Phase 12 (F1): Role-based Medical Privacy Governance (`NASA-STD-3001 Vol. 1 Rev C Ch. 7 [V1 3003]`)
//! and authenticated Store-and-Forward encryption `ChaCha20-Poly1305` with ephemeral `ZeroizeOnDrop` keys.

use crate::audit_chain::Sha256AuditLogger;
use crate::sanitizer::StrictMcpSanitizer;
use ares_core_types::error::AresCoreError;
use ares_core_types::medical_360::{
    AerospaceMedical360State, ContraceptiveRegimen, PocusPelvicScan,
};
use ares_core_types::security::{
    AuditChainRecord, CrewPrivacyFilter, CrewRole, McpInputSanitizer, MedOpsAuditLogger,
};
use ares_core_types::telemetry::{AlertSeverity, TelemetryPacket};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Ephemeral 256-bit symmetric key for the Store-and-Forward Deep Space Network (DSN) channel.
/// Automatically zeroed in RAM on release (`ZeroizeOnDrop`).
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct EphemeralDsnKey {
    key_bytes: [u8; 32],
}

impl EphemeralDsnKey {
    #[inline]
    pub fn from_bytes(key_bytes: [u8; 32]) -> Self {
        Self { key_bytes }
    }

    #[inline]
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.key_bytes
    }
}

/// `ChaCha20-Poly1305`-encrypted clinical packet for asynchronous downlink to the Flight Surgeon on the ground.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EncryptedStoreAndForwardBundle {
    pub astronaut_id: String,
    pub flight_day: u32,
    pub nonce_bytes: [u8; 12],
    pub aad_metadata: String,
    pub ciphertext: Vec<u8>,
}

/// NASA-STD-3001 Vol. 1 Rev C `[V1 3003]` 4-tier privacy classification for `aerospace_360`
/// behavioral health, reproductive health, pharmacogenomic, and pelvic POCUS clinical records.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CrewPrivacyTier360 {
    CrewSelf,
    FlightSurgeonCmo,
    PeerCrewSupport,
    MissionControlCapcom,
}

/// Unified security and privacy guard for `ARES-Health` (`@MiServeRDC`).
#[derive(Default)]
pub struct AresSecurityGuard {
    audit_logger: Sha256AuditLogger,
    sanitizer: StrictMcpSanitizer,
    astronaut_vocal_consent_granted: bool,
}

impl AresSecurityGuard {
    #[inline]
    pub fn new(astronaut_vocal_consent_granted: bool) -> Self {
        Self {
            audit_logger: Sha256AuditLogger::default(),
            sanitizer: StrictMcpSanitizer,
            astronaut_vocal_consent_granted,
        }
    }

    /// Seals and encrypts a `TelemetryPacket` filtered for the Flight Surgeon using `ChaCha20-Poly1305`
    /// with mission metadata bound as Associated Authenticated Data (AAD).
    pub fn seal_store_and_forward_packet(
        &self,
        packet: &TelemetryPacket,
        key: &EphemeralDsnKey,
        nonce_bytes: [u8; 12],
    ) -> Result<EncryptedStoreAndForwardBundle, AresCoreError> {
        let filtered = self.filter_packet_for_role(packet, CrewRole::GroundFlightSurgeon)?;
        let plaintext = serde_json::to_vec(&filtered)
            .map_err(|e| AresCoreError::ContractSerialization(e.to_string()))?;
        let aad_metadata = format!(
            "ARES-DSN|astronaut={}|fd={}|src={}",
            filtered.astronaut_id, filtered.flight_day, filtered.source_record_id
        );

        let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(
                nonce,
                Payload {
                    msg: &plaintext,
                    aad: aad_metadata.as_bytes(),
                },
            )
            .map_err(|_| AresCoreError::SecurityViolation {
                reason: "cifratura AEAD ChaCha20-Poly1305 fallita".to_string(),
            })?;

        Ok(EncryptedStoreAndForwardBundle {
            astronaut_id: filtered.astronaut_id,
            flight_day: filtered.flight_day,
            nonce_bytes,
            aad_metadata,
            ciphertext,
        })
    }

    /// Verifies the AAD authenticity and decrypts an `EncryptedStoreAndForwardBundle`.
    pub fn open_store_and_forward_packet(
        &self,
        bundle: &EncryptedStoreAndForwardBundle,
        key: &EphemeralDsnKey,
    ) -> Result<TelemetryPacket, AresCoreError> {
        let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));
        let nonce = Nonce::from_slice(&bundle.nonce_bytes);
        let plaintext = cipher
            .decrypt(
                nonce,
                Payload {
                    msg: &bundle.ciphertext,
                    aad: bundle.aad_metadata.as_bytes(),
                },
            )
            .map_err(|_| AresCoreError::SecurityViolation {
                reason: "autenticazione AEAD ChaCha20-Poly1305 fallita: AAD o ciphertext manomesso"
                    .to_string(),
            })?;

        serde_json::from_slice(&plaintext)
            .map_err(|e| AresCoreError::ContractSerialization(e.to_string()))
    }

    /// Applies NASA-STD-3001 Vol. 1 `[V1 3003]` `aerospace_360` and pelvic POCUS privacy redaction
    /// for the specified `CrewPrivacyTier360`.
    pub fn apply_to_packet(
        &self,
        packet: &TelemetryPacket,
        mut pelvic_pocus: Option<&mut PocusPelvicScan>,
        tier: CrewPrivacyTier360,
    ) -> Result<TelemetryPacket, AresCoreError> {
        let mut out = packet.clone();
        let imminent_harm = out
            .aerospace_360
            .as_ref()
            .and_then(|a| a.behavioral_health.as_ref())
            .is_some_and(|b| b.imminent_harm_to_self_or_vehicle);
        let life_safety_breach = out.nqs_stl.has_known_violation()
            || out.alert_severity == AlertSeverity::CriticalEmergency
            || out.jugular_hemodynamics.pocus_thrombus_confirmed
            || imminent_harm;

        match tier {
            CrewPrivacyTier360::CrewSelf | CrewPrivacyTier360::FlightSurgeonCmo => {
                // Full unredacted aerospace_360 and pelvic_pocus visibility.
            }
            CrewPrivacyTier360::PeerCrewSupport | CrewPrivacyTier360::MissionControlCapcom => {
                if let Some(ref mut a360) = out.aerospace_360 {
                    redact_aerospace_360_for_restricted_tier(a360);
                }
                if let Some(ref mut pocus) = pelvic_pocus {
                    pocus.point_of_care_beta_hcg_positive = None;
                }
                if !self.astronaut_vocal_consent_granted && !life_safety_breach {
                    out.biometrics.vocal_f0_hz = None;
                    out.biometrics.vocal_jitter_pct = None;
                }
            }
        }

        Ok(out)
    }
}

/// Redacts sensitive behavioral, contraceptive, and allergy fields in `AerospaceMedical360State`
/// for `PeerCrewSupport` and `MissionControlCapcom` while preserving `imminent_harm_to_self_or_vehicle`
/// as a break-glass safety alert boolean.
#[inline]
pub fn redact_aerospace_360_for_restricted_tier(a360: &mut AerospaceMedical360State) {
    a360.crew_profile.contraceptive_regimen = ContraceptiveRegimen::None;
    a360.crew_profile.drug_allergies.clear();
    if let Some(ref mut bmed) = a360.behavioral_health {
        bmed.phq9_score = None;
        bmed.gad7_score = None;
        bmed.cssrs_suicidal_ideation_level = None;
        // Break-glass safety alert boolean `imminent_harm_to_self_or_vehicle` is intentionally preserved.
    }
}

impl CrewPrivacyFilter for AresSecurityGuard {
    fn filter_packet_for_role(
        &self,
        packet: &TelemetryPacket,
        role: CrewRole,
    ) -> Result<TelemetryPacket, AresCoreError> {
        let mut out = packet.clone();
        let imminent_harm = out
            .aerospace_360
            .as_ref()
            .and_then(|a| a.behavioral_health.as_ref())
            .is_some_and(|b| b.imminent_harm_to_self_or_vehicle);
        let life_safety_breach = out.nqs_stl.has_known_violation()
            || out.alert_severity == AlertSeverity::CriticalEmergency
            || out.jugular_hemodynamics.pocus_thrombus_confirmed
            || imminent_harm;

        match role {
            CrewRole::AstronautSelf => {
                // The astronaut has full visibility over their own personal and vocal biomarkers.
            }
            CrewRole::CrewMedicalOfficer | CrewRole::GroundFlightSurgeon => {
                // Per NASA-STD-3001 Vol. 1 Ch. 7 [V1 3003], the raw vocal/psychological biomarkers
                // remain masked unless there is explicit consent or a life-saving violation (rho < 0).
                if !self.astronaut_vocal_consent_granted && !life_safety_breach {
                    out.biometrics.vocal_f0_hz = None;
                    out.biometrics.vocal_jitter_pct = None;
                }
            }
        }
        Ok(out)
    }
}

impl MedOpsAuditLogger for AresSecurityGuard {
    fn append_audit_event(
        &self,
        actor_role: CrewRole,
        event_action: &str,
    ) -> Result<AuditChainRecord, AresCoreError> {
        self.audit_logger
            .append_audit_event(actor_role, event_action)
    }

    fn verify_chain_integrity(&self) -> Result<bool, AresCoreError> {
        self.audit_logger.verify_chain_integrity()
    }
}

impl McpInputSanitizer for AresSecurityGuard {
    fn sanitize_mcp_query(&self, raw_input: &str) -> Result<String, AresCoreError> {
        self.sanitizer.sanitize_mcp_query(raw_input)
    }

    fn wrap_untrusted_observation(&self, observation: &str) -> String {
        self.sanitizer.wrap_untrusted_observation(observation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::medical_360::{BMedTriageClass, BehavioralHealthState};
    use ares_core_types::telemetry::{
        ActivePlaybook, Biometrics, BiometricsSource, JugularFlowGrade, JugularHemodynamics,
        ModelValidationStatus, Musculoskeletal, NqsStlMargins, ProvenanceManifest, SafetyGates,
        SansOcular, ScenarioOverlayMode, SystemPhase,
    };

    fn sample_packet_360(imminent_harm: bool) -> TelemetryPacket {
        let mut a360 = AerospaceMedical360State::default();
        a360.crew_profile.contraceptive_regimen = ContraceptiveRegimen::CombinedEthinylestradiolCoc;
        a360.crew_profile.drug_allergies = vec!["Penicillin".to_string(), "Sulfa".to_string()];
        a360.behavioral_health = Some(BehavioralHealthState {
            phq9_score: Some(18),
            gad7_score: Some(14),
            cssrs_suicidal_ideation_level: Some(4),
            acute_agitation_or_psychosis: true,
            imminent_harm_to_self_or_vehicle: imminent_harm,
            organic_delirium_mimic_detected: false,
            triage_classification: if imminent_harm {
                BMedTriageClass::ImminentSelfOrVehicleHarmCrisis
            } else {
                BMedTriageClass::PrimaryAcutePsychiatricCrisis
            },
            airlock_software_lockout_active: true,
            cmrs_restraint_authorized: imminent_harm,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        });

        TelemetryPacket {
            timestamp_utc: "2026-11-15T12:00:00Z".to_string(),
            mission_Elapsed_seconds: 60.0,
            relative_recording_time_s: 60.0,
            source_record_id: "bmed_test".to_string(),
            flight_day: 120,
            astronaut_id: "ARES-MS-02".to_string(),
            system_phase: SystemPhase::Evaluate,
            alert_severity: AlertSeverity::Nominal,
            model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            provenance_manifest: ProvenanceManifest {
                biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
                biometrics_native_rate_hz: 1.0,
                ui_refresh_rate_hz: 20.0,
                scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
                biological_context_refs: vec!["NASA-STD-3001-V1-3003".to_string()],
            },
            biometrics: Biometrics {
                heart_rate_bpm: Some(92.0),
                pulse_rate_bpm: Some(92.0),
                resp_rate_brpm: Some(18.0),
                spo2_pct: Some(97.0),
                rmssd_ms: Some(32.0),
                hrv_unavailable_reason: None,
                sdnn_ms: Some(44.0),
                pnn50_pct: Some(15.0),
                lf_hf_ratio: Some(2.4),
                vocal_f0_hz: Some(148.0),
                vocal_jitter_pct: Some(0.72),
                radiation_dose_rate_msv_d: 0.40,
                sqi_score: 0.95,
                missing_channels: Vec::new(),
                sbp_mmhg: Some(126.0),
                dbp_mmhg: Some(80.0),
                ptt_ms: None,
                core_temp_celsius: Some(37.0),
                skin_temp_celsius: None,
                sleep_stage_code: None,
                melanopic_edi_lux: None,
                personal_dose_rate_ugy_h: None,
                let_quality_factor: None,
                suit_metabolic_watts: None,
                helmet_ppco2_mmhg: None,
                cabin_ppco2_mmhg: None,
                platelet_count_k_ul: Some(210.0),
            },
            musculoskeletal: Musculoskeletal {
                ared_daily_load_kgf: 120.0,
                soleus_csa_pct: 96.0,
                echo_intensity_au: 50.0,
                mqi_index: 0.90,
                sclerostin_pmol_l: 24.0,
                urinary_calcium_mg_d: 180.0,
                gai_pct: 3.5,
            },
            jugular_hemodynamics: JugularHemodynamics {
                ijv_csa_mm2: 64.0,
                ijv_vmax_cm_s: 15.0,
                tau_w_dyn_cm2: 2.2,
                flow_grade: JugularFlowGrade::NormalContinuous,
                pocus_thrombus_confirmed: false,
                lbnp_active: false,
                lbnp_pressure_mmhg: 0.0,
            },
            sans_ocular: SansOcular {
                onsd_mm: 5.0,
                choroidal_delta_um: 15.0,
                sans_risk_index: 0.18,
            },
            nqs_stl: NqsStlMargins {
                rho_global: Some(0.45),
                rho_tau_w: 0.45,
                rho_ared: 0.50,
                rho_sost: 0.48,
                rho_sans: 0.39,
                rho_rmssd: Some(0.48),
                ttv_hours: Some(168.0),
                ttv_ci95_low_hours: Some(142.0),
                ttv_ci95_high_hours: Some(194.0),
                mri_pct: Some(88.5),
                ttv_interval_kind: None,
                rho_renal: Some(0.44),
                rho_orthostatic: Some(0.65),
                rho_circadian: Some(0.81),
                rho_immune: Some(0.70),
            },
            active_playbook: ActivePlaybook {
                playbook_id: "PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS".to_string(),
                title: "Playbook #29".to_string(),
                causal_chain_summary: Vec::new(),
                safety_gates: SafetyGates::default(),
                actions: Vec::new(),
            },
            spot_poct: None,
            renal_nephrolithiasis: None,
            orthostatic_fluid: None,
            mars_circadian_sleep: None,
            neuro_immune_viral: None,
            aerospace_360: Some(a360),
        }
    }

    #[test]
    fn crew_self_and_flight_surgeon_cmo_receive_unredacted_360_data() {
        let guard = AresSecurityGuard::new(false);
        let pkt = sample_packet_360(false);

        for tier in [
            CrewPrivacyTier360::CrewSelf,
            CrewPrivacyTier360::FlightSurgeonCmo,
        ] {
            let mut pocus = PocusPelvicScan {
                performed: true,
                point_of_care_beta_hcg_positive: Some(true),
                ..PocusPelvicScan::default()
            };
            let Ok(filtered) = guard.apply_to_packet(&pkt, Some(&mut pocus), tier) else {
                panic!("apply_to_packet failed");
            };
            let Some(a360) = filtered.aerospace_360.as_ref() else {
                panic!("expected aerospace_360");
            };
            assert_eq!(
                a360.crew_profile.contraceptive_regimen,
                ContraceptiveRegimen::CombinedEthinylestradiolCoc
            );
            assert_eq!(a360.crew_profile.drug_allergies.len(), 2);
            let Some(bmed) = a360.behavioral_health.as_ref() else {
                panic!("expected behavioral_health");
            };
            assert_eq!(bmed.phq9_score, Some(18));
            assert_eq!(bmed.gad7_score, Some(14));
            assert_eq!(bmed.cssrs_suicidal_ideation_level, Some(4));
            assert_eq!(pocus.point_of_care_beta_hcg_positive, Some(true));
        }
    }

    #[test]
    fn peer_crew_and_capcom_redact_sensitive_360_fields_and_preserve_break_glass() {
        let guard = AresSecurityGuard::new(false);
        let pkt_no_harm = sample_packet_360(false);
        let pkt_imminent = sample_packet_360(true);

        for tier in [
            CrewPrivacyTier360::PeerCrewSupport,
            CrewPrivacyTier360::MissionControlCapcom,
        ] {
            let mut pocus = PocusPelvicScan {
                performed: true,
                point_of_care_beta_hcg_positive: Some(true),
                ..PocusPelvicScan::default()
            };
            let Ok(filtered) = guard.apply_to_packet(&pkt_no_harm, Some(&mut pocus), tier) else {
                panic!("apply_to_packet failed");
            };
            let Some(a360) = filtered.aerospace_360.as_ref() else {
                panic!("expected aerospace_360");
            };
            assert_eq!(
                a360.crew_profile.contraceptive_regimen,
                ContraceptiveRegimen::None
            );
            assert!(a360.crew_profile.drug_allergies.is_empty());
            let Some(bmed) = a360.behavioral_health.as_ref() else {
                panic!("expected behavioral_health");
            };
            assert_eq!(bmed.phq9_score, None);
            assert_eq!(bmed.gad7_score, None);
            assert_eq!(bmed.cssrs_suicidal_ideation_level, None);
            assert!(!bmed.imminent_harm_to_self_or_vehicle);
            assert_eq!(pocus.point_of_care_beta_hcg_positive, None);
            assert_eq!(filtered.biometrics.vocal_f0_hz, None);

            // Break-glass: imminent_harm_to_self_or_vehicle == true is preserved while raw scores remain redacted.
            let mut pocus_bg = PocusPelvicScan {
                performed: true,
                point_of_care_beta_hcg_positive: Some(false),
                ..PocusPelvicScan::default()
            };
            let Ok(filtered_bg) =
                guard.apply_to_packet(&pkt_imminent, Some(&mut pocus_bg), tier)
            else {
                panic!("apply_to_packet break-glass failed");
            };
            let Some(a360_bg) = filtered_bg.aerospace_360.as_ref() else {
                panic!("expected aerospace_360");
            };
            let Some(bmed_bg) = a360_bg.behavioral_health.as_ref() else {
                panic!("expected behavioral_health");
            };
            assert!(bmed_bg.imminent_harm_to_self_or_vehicle);
            assert_eq!(bmed_bg.phq9_score, None);
            assert_eq!(bmed_bg.gad7_score, None);
            assert_eq!(bmed_bg.cssrs_suicidal_ideation_level, None);
            assert_eq!(
                a360_bg.crew_profile.contraceptive_regimen,
                ContraceptiveRegimen::None
            );
            assert!(a360_bg.crew_profile.drug_allergies.is_empty());
            assert_eq!(pocus_bg.point_of_care_beta_hcg_positive, None);
        }
    }
}
