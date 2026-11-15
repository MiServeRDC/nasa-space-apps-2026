use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, ARES_BINARY_MAGIC, ARES_BINARY_VERSION, BinaryFrameMeta,
    BinaryTelemetryFrame, FLAG_BEAT_INTERVALS_NOT_AVAILABLE, FLAG_CHANNEL_NAN_DROPOUT,
    FLAG_CONFORMAL_ABSTAINED, FLAG_GATE1_ANTICOAG_LOCK, FLAG_GATE2_LBNP_VENT,
    FLAG_GATE3_EVA_DAMPING, FLAG_ILLUSTRATIVE_UNVALIDATED, FLAG_LBNP_ACTIVE, FLAG_POCUS_CONFIRMED,
    FLAG_SEU_RECOVERY_ACTIVE, FLAG_WHAT_IF_ACTIVE, MASK_CRS_SCORE, MASK_HR_BPM, MASK_IJV_SHEAR_PA,
    MASK_MRI_SCORE, MASK_NQS_MIN_RHO, MASK_OWLT_DELAY_SEC, MASK_PULSE_BPM, MASK_RADIATION_MSV_D,
    MASK_RESP_BRPM, MASK_RMSSD_MS, MASK_SANS_RISK, MASK_SOST_PG_ML, MASK_SPO2_PCT,
    MASK_TTV_Q05_DAYS, MASK_TTV_Q50_DAYS, MASK_TTV_Q95_DAYS, PARTITION_ALL_NOMINAL,
    SeqlockTelemetryRing, compute_crc32c,
};
use ares_core_types::constants::{
    GAI_MAX_SAFE_PCT, LBNP_MAX_SAFE_HR_BPM, LBNP_MAX_SYS_BP_DROP_MMHG, PRE_POCUS_MAX_THROMBUS_PROB,
};
use ares_core_types::telemetry::{
    ActivePlaybook, AlertSeverity, Biometrics, BiometricsSource, CountermeasureAction,
    HrvUnavailableReason, JugularFlowGrade, JugularHemodynamics, ModelValidationStatus,
    Musculoskeletal, NqsStlMargins, ProvenanceManifest, SafetyGates, SansOcular,
    ScenarioOverlayMode, SystemPhase, TelemetryPacket, TtvIntervalKind,
};
use ares_core_types::{AresCoreError, MonotoneQuantileTriplet, NqsQuantileForecastSnapshot};
use core::mem::{align_of, offset_of, size_of};
use std::sync::Arc;
use std::thread;

/// Deterministic SplitMix64 PRNG (zero external network dependencies, 100% reproducible).
struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    #[inline]
    fn next_bool(&mut self) -> bool {
        (self.next_u64() & 1) == 1
    }

    #[inline]
    fn next_range_usize(&mut self, upper: usize) -> usize {
        (self.next_u64() % (upper as u64)) as usize
    }

    #[inline]
    fn next_f64(&mut self, min: f64, max: f64) -> f64 {
        let unit = ((self.next_u64() >> 11) as f64) / ((1u64 << 53) as f64);
        min + unit * (max - min)
    }
}

fn base_packet() -> TelemetryPacket {
    TelemetryPacket {
        timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
        mission_Elapsed_seconds: 120.0,
        relative_recording_time_s: 42.0,
        source_record_id: "bidmc_01".to_string(),
        flight_day: 90,
        astronaut_id: "ARES-CDR-01".to_string(),
        system_phase: SystemPhase::Evaluate,
        alert_severity: AlertSeverity::Caution,
        model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        provenance_manifest: ProvenanceManifest {
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
            biometrics_native_rate_hz: 1.0,
            ui_refresh_rate_hz: 20.0,
            scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
            biological_context_refs: vec!["PhysioNet-BIDMC-v1.0.0".to_string()],
        },
        biometrics: Biometrics {
            heart_rate_bpm: Some(82.0),
            pulse_rate_bpm: Some(81.0),
            resp_rate_brpm: Some(15.0),
            spo2_pct: Some(98.0),
            rmssd_ms: Some(38.0),
            hrv_unavailable_reason: None,
            sdnn_ms: Some(48.0),
            pnn50_pct: Some(18.0),
            lf_hf_ratio: Some(2.1),
            vocal_f0_hz: Some(120.0),
            vocal_jitter_pct: Some(0.55),
            radiation_dose_rate_msv_d: 0.45,
            sqi_score: 0.91,
            missing_channels: Vec::new(),
            sbp_mmhg: Some(118.0),
            dbp_mmhg: Some(78.0),
            ptt_ms: Some(210.0),
            core_temp_celsius: Some(36.8),
            skin_temp_celsius: Some(33.5),
            sleep_stage_code: Some(2),
            melanopic_edi_lux: Some(450.0),
            personal_dose_rate_ugy_h: Some(18.5),
            let_quality_factor: Some(2.8),
            suit_metabolic_watts: Some(220.0),
            helmet_ppco2_mmhg: Some(2.1),
            cabin_ppco2_mmhg: None,
            platelet_count_k_ul: None,
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
            ttv_interval_kind: Some(TtvIntervalKind::IllustrativeScenarioRange),
            rho_renal: Some(0.44),
            rho_orthostatic: Some(0.65),
            rho_circadian: Some(0.81),
            rho_immune: Some(0.70),
        },
        active_playbook: ActivePlaybook {
            playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED".to_string(),
            title: "Playbook #03".to_string(),
            causal_chain_summary: vec!["ARED nominal".to_string()],
            safety_gates: SafetyGates {
                anticoagulant_lock_active: true,
                lbnp_auto_vent_armed: true,
                eva_suit_damping_active: false,
                gate4_invasive_decompression_locked: true,
                gate4_eva_fitness_no_go: false,
                ..SafetyGates::default()
            },
            actions: vec![CountermeasureAction {
                action_id: "ACT_ARED".to_string(),
                label: "Maintain ARED".to_string(),
                category: "MECHANICAL".to_string(),
                delta_rho_per_hour: 0.11,
            }],
        },
        spot_poct: None,
        renal_nephrolithiasis: None,
        orthostatic_fluid: None,
        mars_circadian_sleep: None,
        neuro_immune_viral: None,
    }
}

#[test]
fn k1_binary_telemetry_frame_abi_offsets_and_castagnoli_crc32c() {
    assert_eq!(size_of::<BinaryTelemetryFrame>(), 128);
    assert_eq!(ARES_BINARY_FRAME_BYTES, 128);
    assert_eq!(align_of::<BinaryTelemetryFrame>(), 64);

    assert_eq!(offset_of!(BinaryTelemetryFrame, magic), 0);
    assert_eq!(offset_of!(BinaryTelemetryFrame, schema_version), 4);
    assert_eq!(offset_of!(BinaryTelemetryFrame, partition_status), 6);
    assert_eq!(offset_of!(BinaryTelemetryFrame, deontic_habitat_mask), 7);
    assert_eq!(offset_of!(BinaryTelemetryFrame, seq), 8);
    assert_eq!(offset_of!(BinaryTelemetryFrame, timestamp_ms), 16);
    assert_eq!(offset_of!(BinaryTelemetryFrame, validity_mask), 24);
    assert_eq!(offset_of!(BinaryTelemetryFrame, quality_flags_mask), 28);
    assert_eq!(offset_of!(BinaryTelemetryFrame, hr_bpm), 32);
    assert_eq!(offset_of!(BinaryTelemetryFrame, ijv_shear_pa), 64);
    assert_eq!(offset_of!(BinaryTelemetryFrame, active_playbook_id), 96);
    assert_eq!(offset_of!(BinaryTelemetryFrame, active_alert_code), 98);
    assert_eq!(offset_of!(BinaryTelemetryFrame, ipc_latency_ns), 100);
    assert_eq!(offset_of!(BinaryTelemetryFrame, crc32c), 104);
    assert_eq!(offset_of!(BinaryTelemetryFrame, reserved), 108);

    // RFC 3720 / Castagnoli CRC-32C canonical check vector (poly 0x1EDC6F41, reflected 0x82F63B78).
    assert_eq!(compute_crc32c(b"123456789"), 0xE306_9283);
    // Verify single-byte reflected polynomial behavior at 0x01.
    let single_zero = compute_crc32c(&[0x00]);
    let single_one = compute_crc32c(&[0x01]);
    assert_ne!(single_zero, single_one);
    assert_eq!(compute_crc32c(b""), 0x0000_0000);
}

#[test]
fn k1_binary_frame_1024_randomized_bitflip_and_exhaustive_single_bit_chaos() {
    let pkt = base_packet();
    let frame = BinaryTelemetryFrame::from_telemetry_packet(
        &pkt,
        None,
        BinaryFrameMeta {
            seq: 12345,
            timestamp_ms: 1_794_657_600_000,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask: 0x45,
            crs_score: Some(0.28),
            owlt_delay_sec: 852.0,
            ipc_latency_ns: 350,
            conformal_abstained: false,
            seu_recovery_active: false,
            include_derived_models: true,
        },
    );
    let valid = frame.to_le_bytes();
    assert!(BinaryTelemetryFrame::from_le_bytes(&valid).is_ok());

    // 1. Exhaustive single-bit flip across all 108 active bytes (magic + header + payload + crc32c).
    for byte_idx in 0..108usize {
        for bit_idx in 0..8u8 {
            let mut corrupted = valid;
            corrupted[byte_idx] ^= 1u8 << bit_idx;
            let res = BinaryTelemetryFrame::from_le_bytes(&corrupted);
            assert!(
                res.is_err(),
                "single-bit flip at byte={byte_idx}, bit={bit_idx} escaped validation"
            );
            if byte_idx < 4 {
                assert!(matches!(res, Err(AresCoreError::InvalidBinaryFrameMagic { .. })));
            } else if byte_idx < 6 {
                assert!(matches!(res, Err(AresCoreError::InvalidBinaryFrameVersion { .. })));
            } else {
                assert!(matches!(res, Err(AresCoreError::InvalidBinaryFrameCrc { .. })));
            }
        }
    }

    // 2. 1,024+ randomized bit-flip chaos trials across protected bytes [0..108].
    let mut rng = SplitMix64::new(0x25A1_B17F_1190_0001);
    for trial in 0..1_500usize {
        let mut corrupted = valid;
        // Inject 1 to 4 distinct bit flips within [0..108].
        let flips = 1 + rng.next_range_usize(4);
        let mut flipped_positions = [usize::MAX; 4];
        for idx in 0..flips {
            loop {
                let bit_pos = rng.next_range_usize(108 * 8);
                if !flipped_positions[..idx].contains(&bit_pos) {
                    flipped_positions[idx] = bit_pos;
                    corrupted[bit_pos / 8] ^= 1u8 << (bit_pos % 8);
                    break;
                }
            }
        }
        assert_ne!(corrupted[0..108], valid[0..108]);
        let res = BinaryTelemetryFrame::from_le_bytes(&corrupted);
        assert!(
            res.is_err(),
            "randomized bit-flip trial {trial} escaped CRC-32C/header rejection"
        );
    }

    // 3. Invalid frame lengths must be rejected deterministically.
    for len in [0usize, 1, 64, 127, 129, 256] {
        let buf = vec![0u8; len];
        assert!(matches!(
            BinaryTelemetryFrame::from_le_bytes(&buf),
            Err(AresCoreError::InvalidBinaryFrameLength {
                expected: 128,
                actual
            }) if actual == len
        ));
    }
}

#[test]
fn k1_property_validity_mask_preserves_none_never_turns_into_zero() {
    let mut rng = SplitMix64::new(0x00A1_71D1_7744_0002);

    let pick_opt = |rng: &mut SplitMix64, min: f64, max: f64| -> Option<f64> {
        match rng.next_range_usize(6) {
            0 => None,
            1 => Some(f64::NAN),
            2 => Some(f64::INFINITY),
            3 => Some(f64::NEG_INFINITY),
            4 => Some(0.0), // Explicitly test finite 0.0 vs None distinction
            _ => Some(rng.next_f64(min, max)),
        }
    };

    for trial in 0..2_048usize {
        let mut pkt = base_packet();
        let hr = pick_opt(&mut rng, 40.0, 190.0);
        let pulse = pick_opt(&mut rng, 40.0, 190.0);
        let resp = pick_opt(&mut rng, 6.0, 40.0);
        let spo2 = pick_opt(&mut rng, 70.0, 100.0);
        let rmssd = pick_opt(&mut rng, 5.0, 120.0);
        let mri = pick_opt(&mut rng, 0.0, 100.0);
        let crs = pick_opt(&mut rng, 0.0, 1.0);
        let rho = pick_opt(&mut rng, -1.0, 1.0);
        let ttv_q05 = pick_opt(&mut rng, 0.0, 500.0);
        let ttv_q50 = pick_opt(&mut rng, 0.0, 500.0);
        let ttv_q95 = pick_opt(&mut rng, 0.0, 500.0);

        let include_derived = rng.next_bool();
        let finite_rad = if rng.next_bool() {
            rng.next_f64(0.0, 10.0)
        } else {
            f64::NAN
        };
        let finite_sans = if rng.next_bool() {
            rng.next_f64(0.0, 1.0)
        } else {
            f64::INFINITY
        };
        let finite_tau = if rng.next_bool() {
            rng.next_f64(0.1, 6.0)
        } else {
            f64::NEG_INFINITY
        };
        let finite_sost = if rng.next_bool() {
            rng.next_f64(12.0, 95.0)
        } else {
            f64::NAN
        };
        let owlt = if rng.next_bool() {
            rng.next_f64(0.0, 1500.0) as f32
        } else {
            f32::NAN
        };

        pkt.biometrics.heart_rate_bpm = hr;
        pkt.biometrics.pulse_rate_bpm = pulse;
        pkt.biometrics.resp_rate_brpm = resp;
        pkt.biometrics.spo2_pct = spo2;
        pkt.biometrics.rmssd_ms = rmssd;
        pkt.biometrics.radiation_dose_rate_msv_d = finite_rad;
        pkt.sans_ocular.sans_risk_index = finite_sans;
        pkt.jugular_hemodynamics.tau_w_dyn_cm2 = finite_tau;
        pkt.musculoskeletal.sclerostin_pmol_l = finite_sost;
        pkt.nqs_stl.mri_pct = mri;
        pkt.nqs_stl.rho_global = rho;

        let snapshot = if rng.next_bool() {
            let mut snap = NqsQuantileForecastSnapshot::initial_deterministic(10.0, rho, None, None, None);
            if let (Some(q05), Some(q50), Some(q95)) = (
                ttv_q05.filter(|v| v.is_finite()),
                ttv_q50.filter(|v| v.is_finite()),
                ttv_q95.filter(|v| v.is_finite()),
            ) {
                let mut arr = [q05, q50, q95];
                arr.sort_by(f64::total_cmp);
                snap.ttv_hours_cone = Some(MonotoneQuantileTriplet {
                    q05: arr[0],
                    q50: arr[1],
                    q95: arr[2],
                });
            } else {
                snap.ttv_hours_cone = None;
            }
            Some(snap)
        } else {
            pkt.nqs_stl.ttv_ci95_low_hours = ttv_q05;
            pkt.nqs_stl.ttv_hours = ttv_q50;
            pkt.nqs_stl.ttv_ci95_high_hours = ttv_q95;
            None
        };

        let meta = BinaryFrameMeta {
            seq: trial as u64,
            timestamp_ms: 1_794_657_600_000 + trial as u64 * 50,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask: (trial & 0x7F) as u8,
            crs_score: crs,
            owlt_delay_sec: owlt,
            ipc_latency_ns: 200,
            conformal_abstained: rng.next_bool(),
            seu_recovery_active: rng.next_bool(),
            include_derived_models: include_derived,
        };

        let frame = BinaryTelemetryFrame::from_telemetry_packet(&pkt, snapshot.as_ref(), meta);
        let wire = frame.to_le_bytes();
        let decoded = BinaryTelemetryFrame::from_le_bytes(&wire).unwrap_or_else(|e| {
            panic!("valid frame failed decode on trial {trial}: {e}");
        });

        let check_opt = |expected: Option<f64>, bit: u32, got: Option<f32>, name: &str| {
            match expected.filter(|v| v.is_finite() && (*v as f32).is_finite()) {
                Some(v) => {
                    assert_ne!(
                        decoded.validity_mask & bit,
                        0,
                        "trial {trial}: {name} expected valid bit set"
                    );
                    let got_v = got.unwrap_or_else(|| {
                        panic!("trial {trial}: {name} returned None despite finite value {v}")
                    });
                    assert!(
                        (got_v - (v as f32)).abs() <= 1e-6,
                        "trial {trial}: {name} mismatch got={got_v} expected={}",
                        v as f32
                    );
                }
                None => {
                    assert_eq!(
                        decoded.validity_mask & bit,
                        0,
                        "trial {trial}: {name} expected validity bit cleared"
                    );
                    assert_eq!(
                        got, None,
                        "trial {trial}: {name} hallucinated Some({got:?}) instead of None"
                    );
                }
            }
        };

        check_opt(hr, MASK_HR_BPM, decoded.hr_opt(), "hr_bpm");
        check_opt(pulse, MASK_PULSE_BPM, decoded.pulse_opt(), "pulse_bpm");
        check_opt(resp, MASK_RESP_BRPM, decoded.resp_opt(), "resp_brpm");
        check_opt(spo2, MASK_SPO2_PCT, decoded.spo2_opt(), "spo2_pct");
        check_opt(rmssd, MASK_RMSSD_MS, decoded.rmssd_opt(), "rmssd_ms");
        check_opt(mri, MASK_MRI_SCORE, decoded.mri_opt(), "mri_score");
        check_opt(rho, MASK_NQS_MIN_RHO, decoded.nqs_min_rho_opt(), "nqs_min_rho");
        check_opt(
            if finite_rad.is_finite() { Some(finite_rad) } else { None },
            MASK_RADIATION_MSV_D,
            decoded.radiation_msv_d_opt(),
            "radiation_msv_d",
        );
        check_opt(
            if owlt.is_finite() { Some(f64::from(owlt)) } else { None },
            MASK_OWLT_DELAY_SEC,
            decoded.owlt_delay_sec_opt(),
            "owlt_delay_sec",
        );

        if !include_derived {
            assert_eq!(decoded.validity_mask & MASK_SANS_RISK, 0);
            assert_eq!(decoded.validity_mask & MASK_IJV_SHEAR_PA, 0);
            assert_eq!(decoded.validity_mask & MASK_SOST_PG_ML, 0);
            assert_eq!(decoded.sans_risk_opt(), None);
            assert_eq!(decoded.ijv_shear_pa_opt(), None);
            assert_eq!(decoded.sost_pg_ml_opt(), None);
            if crs.filter(|v| v.is_finite()).is_none() {
                assert_eq!(decoded.validity_mask & MASK_CRS_SCORE, 0);
                assert_eq!(decoded.crs_opt(), None);
            }
        } else {
            let exp_sans = finite_sans.is_finite().then_some(finite_sans);
            let exp_tau = finite_tau.is_finite().then_some(finite_tau * 0.1);
            let exp_sost = finite_sost.is_finite().then_some(finite_sost * 22.5);
            check_opt(exp_sans, MASK_SANS_RISK, decoded.sans_risk_opt(), "sans_risk");
            check_opt(exp_tau, MASK_IJV_SHEAR_PA, decoded.ijv_shear_pa_opt(), "ijv_shear_pa");
            check_opt(exp_sost, MASK_SOST_PG_ML, decoded.sost_pg_ml_opt(), "sost_pg_ml");
        }

        if let Some(ref snap) = snapshot {
            if let Some(cone) = snap.ttv_hours_cone {
                check_opt(Some(cone.q05 / 24.0), MASK_TTV_Q05_DAYS, decoded.ttv_q05_days_opt(), "ttv_q05");
                check_opt(Some(cone.q50 / 24.0), MASK_TTV_Q50_DAYS, decoded.ttv_q50_days_opt(), "ttv_q50");
                check_opt(Some(cone.q95 / 24.0), MASK_TTV_Q95_DAYS, decoded.ttv_q95_days_opt(), "ttv_q95");
            } else {
                assert_eq!(decoded.ttv_q05_days_opt(), None);
                assert_eq!(decoded.ttv_q50_days_opt(), None);
                assert_eq!(decoded.ttv_q95_days_opt(), None);
            }
        } else {
            check_opt(ttv_q05.map(|h| h / 24.0), MASK_TTV_Q05_DAYS, decoded.ttv_q05_days_opt(), "ttv_q05");
            check_opt(ttv_q50.map(|h| h / 24.0), MASK_TTV_Q50_DAYS, decoded.ttv_q50_days_opt(), "ttv_q50");
            check_opt(ttv_q95.map(|h| h / 24.0), MASK_TTV_Q95_DAYS, decoded.ttv_q95_days_opt(), "ttv_q95");
        }
    }
}

#[test]
fn k1_property_quality_flags_mask_roundtrips_and_safety_gate_boundaries() {
    let mut rng = SplitMix64::new(0xF1A6_5000_6A7E_0003);

    for trial in 0..1_024usize {
        let mut pkt = base_packet();
        let what_if = rng.next_bool();
        let pocus = rng.next_bool();
        let lbnp = rng.next_bool();
        let g1 = rng.next_bool();
        let g2 = rng.next_bool();
        let g3 = rng.next_bool();
        let hrv_none = rng.next_bool();
        let dropout = rng.next_bool();
        let conformal_abstained = rng.next_bool();
        let seu_recovery = rng.next_bool();

        pkt.provenance_manifest.scenario_overlay_mode = if what_if {
            ScenarioOverlayMode::SimulatedWhatifScenario
        } else {
            ScenarioOverlayMode::NonePureReplay
        };
        pkt.jugular_hemodynamics.pocus_thrombus_confirmed = pocus;
        pkt.jugular_hemodynamics.lbnp_active = lbnp;
        pkt.active_playbook.safety_gates = SafetyGates {
            anticoagulant_lock_active: g1,
            lbnp_auto_vent_armed: g2,
            eva_suit_damping_active: g3,
            gate4_invasive_decompression_locked: true,
            gate4_eva_fitness_no_go: false,
            ..SafetyGates::default()
        };
        if hrv_none {
            pkt.biometrics.rmssd_ms = None;
            pkt.biometrics.hrv_unavailable_reason =
                Some(HrvUnavailableReason::BeatIntervalsNotAvailable);
        } else {
            pkt.biometrics.rmssd_ms = Some(41.2);
            pkt.biometrics.hrv_unavailable_reason = None;
        }
        pkt.biometrics.missing_channels = if dropout {
            vec!["spo2_pct".to_string()]
        } else {
            Vec::new()
        };

        let meta = BinaryFrameMeta {
            seq: trial as u64,
            conformal_abstained,
            seu_recovery_active: seu_recovery,
            ..BinaryFrameMeta::default()
        };

        let frame = BinaryTelemetryFrame::from_telemetry_packet(&pkt, None, meta);
        let decoded = BinaryTelemetryFrame::from_le_bytes(&frame.to_le_bytes()).unwrap_or_else(|e| {
            panic!("roundtrip failed at trial {trial}: {e}");
        });

        let f = decoded.quality_flags_mask;
        assert_eq!((f & FLAG_WHAT_IF_ACTIVE) != 0, what_if);
        assert_eq!((f & FLAG_POCUS_CONFIRMED) != 0, pocus);
        assert_eq!((f & FLAG_LBNP_ACTIVE) != 0, lbnp);
        assert_eq!((f & FLAG_GATE1_ANTICOAG_LOCK) != 0, g1);
        assert_eq!((f & FLAG_GATE2_LBNP_VENT) != 0, g2);
        assert_eq!((f & FLAG_GATE3_EVA_DAMPING) != 0, g3);
        assert_eq!((f & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) != 0, hrv_none);
        assert_ne!(f & FLAG_ILLUSTRATIVE_UNVALIDATED, 0);
        assert_eq!((f & FLAG_CHANNEL_NAN_DROPOUT) != 0, dropout);
        assert_eq!((f & FLAG_CONFORMAL_ABSTAINED) != 0, conformal_abstained);
        assert_eq!((f & FLAG_SEU_RECOVERY_ACTIVE) != 0, seu_recovery);
    }

    // Hard Safety Gate 1-3 boundary & critical physiological thresholds (SpO2 < 85%, HR > 165, ONSD > 6.2 mm).
    assert!((PRE_POCUS_MAX_THROMBUS_PROB - 0.45).abs() < 1e-12);
    assert!((LBNP_MAX_SYS_BP_DROP_MMHG - 15.0).abs() < 1e-12);
    assert!((LBNP_MAX_SAFE_HR_BPM - 115.0).abs() < 1e-12);
    assert!((GAI_MAX_SAFE_PCT - 12.0).abs() < 1e-12);

    let boundary_cases = [
        (84.9_f64, 165.1_f64, 6.21_f64, true, true, true, AlertSeverity::CriticalEmergency),
        (85.0_f64, 165.0_f64, 6.20_f64, true, false, false, AlertSeverity::Warning),
        (84.99_f64, 115.1_f64, 6.25_f64, false, true, true, AlertSeverity::CriticalEmergency),
    ];

    for (idx, (spo2, hr, onsd, g1, g2, g3, sev)) in boundary_cases.into_iter().enumerate() {
        let mut pkt = base_packet();
        pkt.biometrics.spo2_pct = Some(spo2);
        pkt.biometrics.heart_rate_bpm = Some(hr);
        pkt.sans_ocular.onsd_mm = onsd;
        pkt.sans_ocular.sans_risk_index = if onsd > 6.2 { 0.86 } else { 0.55 };
        pkt.alert_severity = sev;
        pkt.active_playbook.safety_gates = SafetyGates {
            anticoagulant_lock_active: g1,
            lbnp_auto_vent_armed: g2,
            eva_suit_damping_active: g3,
            gate4_invasive_decompression_locked: true,
            gate4_eva_fitness_no_go: false,
            ..SafetyGates::default()
        };
        let frame = BinaryTelemetryFrame::from_telemetry_packet(
            &pkt,
            None,
            BinaryFrameMeta {
                seq: 10_000 + idx as u64,
                ..BinaryFrameMeta::default()
            },
        );
        let decoded = BinaryTelemetryFrame::from_le_bytes(&frame.to_le_bytes())
            .unwrap_or_else(|e| panic!("boundary case {idx} decode failed: {e}"));
        assert_eq!(decoded.spo2_opt(), Some(spo2 as f32));
        assert_eq!(decoded.hr_opt(), Some(hr as f32));
        assert_eq!((decoded.quality_flags_mask & FLAG_GATE1_ANTICOAG_LOCK) != 0, g1);
        assert_eq!((decoded.quality_flags_mask & FLAG_GATE2_LBNP_VENT) != 0, g2);
        assert_eq!((decoded.quality_flags_mask & FLAG_GATE3_EVA_DAMPING) != 0, g3);
        if spo2 < 85.0 || hr > 165.0 || onsd > 6.2 {
            assert_eq!(decoded.active_alert_code, 4);
        }
    }
}

#[test]
fn k1_seqlock_telemetry_ring_64_multi_lap_overwrite_and_spmc_integrity() {
    let ring = Arc::new(SeqlockTelemetryRing::<64>::new());
    assert!(matches!(ring.read_latest(), Err(AresCoreError::ShmRingEmpty)));

    let pkt = base_packet();
    // Phase A: Deterministic single-threaded multi-lap overwrite (8+ laps = 529 frames).
    for seq in 1..=529u64 {
        let frame = BinaryTelemetryFrame::from_telemetry_packet(
            &pkt,
            None,
            BinaryFrameMeta {
                seq,
                timestamp_ms: 1_794_657_600_000 + seq * 50,
                ..BinaryFrameMeta::default()
            },
        );
        ring.publish(&frame);
        let latest = ring.read_latest().unwrap_or_else(|e| {
            panic!("sequential read_latest failed at seq={seq}: {e}");
        });
        assert_eq!(latest.seq, seq);
        assert_eq!(latest.timestamp_ms, 1_794_657_600_000 + seq * 50);
        assert_eq!(ring.write_count(), seq);
    }

    // Phase B: Concurrent SPMC multi-lap contention (1 producer, 4 readers, 4,096 frames = 64 laps).
    let total_frames = 4_096u64;
    let base_seq = 1_000u64;
    let producer_ring = Arc::clone(&ring);
    let producer_pkt = pkt.clone();
    let producer = thread::spawn(move || {
        for i in 1..=total_frames {
            let seq = base_seq + i;
            let frame = BinaryTelemetryFrame::from_telemetry_packet(
                &producer_pkt,
                None,
                BinaryFrameMeta {
                    seq,
                    timestamp_ms: 1_794_657_600_000 + seq * 50,
                    ..BinaryFrameMeta::default()
                },
            );
            producer_ring.publish(&frame);
        }
    });

    let mut readers = Vec::with_capacity(4);
    for _ in 0..4 {
        let reader_ring = Arc::clone(&ring);
        readers.push(thread::spawn(move || {
            let mut ok_reads = 0usize;
            let mut last_seen_seq = 0u64;
            for _ in 0..3_000 {
                match reader_ring.read_latest() {
                    Ok(frame) => {
                        assert_eq!(frame.magic, ARES_BINARY_MAGIC);
                        assert_eq!(frame.schema_version, ARES_BINARY_VERSION);
                        assert_eq!(frame.timestamp_ms, 1_794_657_600_000 + frame.seq * 50);
                        assert!(frame.seq >= last_seen_seq);
                        last_seen_seq = frame.seq;
                        ok_reads += 1;
                    }
                    Err(AresCoreError::ShmRingTornReadExhausted) => {}
                    Err(other) => panic!("unexpected SPMC ring error: {other}"),
                }
            }
            ok_reads
        }));
    }

    producer.join().unwrap_or_else(|_| panic!("producer thread panicked"));
    let total_ok: usize = readers
        .into_iter()
        .map(|h| h.join().unwrap_or_else(|_| panic!("reader thread panicked")))
        .sum();
    assert!(total_ok > 0);
    let final_frame = ring
        .read_latest()
        .unwrap_or_else(|e| panic!("final read_latest failed: {e}"));
    assert_eq!(final_frame.seq, base_seq + total_frames);
    assert_eq!(ring.write_count(), 529 + total_frames);
}
