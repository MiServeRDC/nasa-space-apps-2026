use ares_causal_graph::adhg_graph::{AdhgCausalEngine, AdhgNodeKind};
use ares_causal_graph::bayesian_pocus::evaluate_two_stage_bayesian_pocus;
use ares_causal_graph::biokg_reasoner::{
    ClinicalAnswerabilityGate, EpistemicProvenance, NormativeClauseId, ground_adhg_node_o1,
};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state;
use ares_causal_graph::hypergraph_spatial::{
    DeonticModality, HabitatEnvironmentState, HabitatZoneDeonticPolicy, HabitatZoneId,
    LONGITUDINAL_MEMORY_BUDGET_BYTES, MARS_MISSION_SOLS, MARS_SOL_SECONDS,
    MissionLongitudinalCompactor, PhysiologicalTick,
};
use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
use ares_core_types::binary_ipc::{
    BinaryFrameMeta, BinaryTelemetryFrame, DEONTIC_EIMO_AUTONOMOUS, PARTITION_ALL_NOMINAL,
    SeqlockTelemetryRing,
};
use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_core_types::security::{CrewPrivacyFilter, CrewRole};
use ares_core_types::telemetry::{
    ActivePlaybook, AlertSeverity, Biometrics, BiometricsSource, CountermeasureAction,
    HrvUnavailableReason, JugularFlowGrade, JugularHemodynamics, ModelValidationStatus,
    Musculoskeletal, NqsStlMargins, ProvenanceManifest, SafetyGates, SansOcular,
    ScenarioOverlayMode, SystemPhase, TelemetryPacket, TtvIntervalKind,
};
use ares_desktop_os::{AresMedOsWorkstationShell, DesktopShellConfig};
use ares_medops_playbooks::grounding::{ground_playbook_normative, verify_playbook_governance};
use ares_medops_playbooks::playbooks::select_candidate_playbook;
use ares_medops_playbooks::safety_gates::enforce_hard_clinical_safety_gates;
use ares_nqs_stl::NqsEngine;
use ares_nqs_stl::mri_index::evaluate_nqs_stl_and_mri;
use ares_security_privacy::privacy_views::AresSecurityGuard;
use ares_server_cli::wire_contract::StressTestPatchRequest;
use ares_server_cli::ws_server::default_scenario_input;
use ares_telemetry_ingest::bidmc_replayer::BidmcReplayer;
use ares_telemetry_ingest::scenario_overlay::biometrics_with_signal_quality;
use ares_telemetry_ingest::sqi_filter::SqiFilter;
use serde_json::{Value, json};
use std::hint::black_box;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

fn bidmc_dir() -> PathBuf {
    repo_root().join("data").join("bidmc")
}

fn percentile_ns(sorted_ns: &[u128], pct: f64) -> f64 {
    let idx = (((sorted_ns.len().saturating_sub(1)) as f64) * pct).round() as usize;
    sorted_ns[idx.min(sorted_ns.len().saturating_sub(1))] as f64
}

fn sample_packet_for_privacy(critical: bool) -> TelemetryPacket {
    TelemetryPacket {
        timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
        mission_Elapsed_seconds: 300.0,
        relative_recording_time_s: 12.0,
        source_record_id: "bidmc_01".to_string(),
        flight_day: 90,
        astronaut_id: "ARES-CDR-01".to_string(),
        system_phase: if critical {
            SystemPhase::Act
        } else {
            SystemPhase::Evaluate
        },
        alert_severity: if critical {
            AlertSeverity::CriticalEmergency
        } else {
            AlertSeverity::Nominal
        },
        model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        provenance_manifest: ProvenanceManifest {
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
            biometrics_native_rate_hz: 1.0,
            ui_refresh_rate_hz: 20.0,
            scenario_overlay_mode: ScenarioOverlayMode::NonePureReplay,
            biological_context_refs: vec!["PhysioNet-BIDMC-v1.0.0".to_string()],
        },
        biometrics: Biometrics {
            heart_rate_bpm: Some(74.0),
            pulse_rate_bpm: Some(73.0),
            resp_rate_brpm: Some(15.0),
            spo2_pct: Some(98.0),
            rmssd_ms: Some(42.0),
            hrv_unavailable_reason: None,
            sdnn_ms: Some(50.0),
            pnn50_pct: Some(20.0),
            lf_hf_ratio: Some(1.6),
            vocal_f0_hz: Some(118.5),
            vocal_jitter_pct: Some(0.55),
            radiation_dose_rate_msv_d: 0.45,
            sqi_score: 0.95,
            missing_channels: vec![],
            sbp_mmhg: None,
            dbp_mmhg: None,
            ptt_ms: None,
            core_temp_celsius: None,
            skin_temp_celsius: None,
            sleep_stage_code: None,
            melanopic_edi_lux: None,
            personal_dose_rate_ugy_h: None,
            let_quality_factor: None,
            suit_metabolic_watts: None,
            helmet_ppco2_mmhg: None,
        },
        musculoskeletal: Musculoskeletal {
            ared_daily_load_kgf: 128.0,
            soleus_csa_pct: 96.0,
            echo_intensity_au: 50.0,
            mqi_index: 0.92,
            sclerostin_pmol_l: 24.0,
            urinary_calcium_mg_d: 180.0,
            gai_pct: 4.5,
        },
        jugular_hemodynamics: JugularHemodynamics {
            ijv_csa_mm2: 68.0,
            ijv_vmax_cm_s: 8.5,
            tau_w_dyn_cm2: 2.30,
            flow_grade: JugularFlowGrade::NormalContinuous,
            pocus_thrombus_confirmed: false,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
        },
        sans_ocular: SansOcular {
            onsd_mm: 5.1,
            choroidal_delta_um: 14.0,
            sans_risk_index: 0.16,
        },
        nqs_stl: NqsStlMargins {
            rho_tau_w: 0.72,
            rho_ared: 0.85,
            rho_sost: 0.80,
            rho_rmssd: Some(0.75),
            rho_sans: 0.78,
            rho_global: if critical { Some(-0.40) } else { Some(0.72) },
            ttv_hours: Some(240.0),
            ttv_ci95_low_hours: Some(180.0),
            ttv_ci95_high_hours: Some(300.0),
            mri_pct: Some(88.0),
            ttv_interval_kind: Some(TtvIntervalKind::IllustrativeScenarioRange),
            rho_renal: Some(0.44),
            rho_orthostatic: Some(0.65),
            rho_circadian: Some(0.81),
            rho_immune: Some(0.70),
        },
        active_playbook: ActivePlaybook {
            playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED".to_string(),
            title: "Nominal ARED".to_string(),
            causal_chain_summary: vec![],
            safety_gates: SafetyGates {
                anticoagulant_lock_active: true,
                lbnp_auto_vent_armed: true,
                eva_suit_damping_active: false,
                gate4_invasive_decompression_locked: true,
                gate4_eva_fitness_no_go: false,
            },
            actions: vec![],
        },
        spot_poct: None,
        renal_nephrolithiasis: None,
        orthostatic_fluid: None,
        mars_circadian_sleep: None,
        neuro_immune_viral: None,
    }
}

#[test]
fn cert_phase_28_k4_nasa_std_3001_automated_traceability_matrix() {
    // 1. [V1 3001] & [V1 3002]: Crew Health Program, ADHG normative grounding, ARED/SOST/GAI
    assert_eq!(NormativeClauseId::ALL.len(), 10);
    let adhg_nodes = [
        AdhgNodeKind::AredMechanicalLoad,
        AdhgNodeKind::SoleusMuscleQualityMqi,
        AdhgNodeKind::OsteocyteSclerostinSost,
        AdhgNodeKind::EndothelialProtectiveSecretome,
        AdhgNodeKind::CansRadiationOxidativeStress,
        AdhgNodeKind::IjvVenousStasisShearStress,
        AdhgNodeKind::PocusThrombusPosterior,
        AdhgNodeKind::SansTranslaminarGradient,
    ];
    for kind in adhg_nodes {
        let g = ground_adhg_node_o1(kind);
        assert!(g.descriptor.verify_crc().is_ok());
        assert!(!g.normative_clause.official_code().is_empty());
    }

    let nominal_musc = compute_musculoskeletal_state(90, 130.0);
    let unloaded_musc = compute_musculoskeletal_state(90, 0.0);
    assert!(unloaded_musc.sclerostin_pmol_l > 55.0);
    assert!(unloaded_musc.mqi_index < 0.50);
    assert!(unloaded_musc.gai_pct > 12.0);
    assert!(nominal_musc.sclerostin_pmol_l < 30.0);

    let pkt_hrv = sample_packet_for_privacy(false);
    let (margins_hrv, _) = evaluate_nqs_stl_and_mri(
        &pkt_hrv.biometrics,
        &nominal_musc,
        &pkt_hrv.jugular_hemodynamics,
        &pkt_hrv.sans_ocular,
    );
    let mri = margins_hrv.mri_pct.expect("MRI computed when HRV present");
    assert!((0.0..=100.0).contains(&mri));

    let mut bio_no_hrv = pkt_hrv.biometrics.clone();
    bio_no_hrv.rmssd_ms = None;
    bio_no_hrv.hrv_unavailable_reason = Some(HrvUnavailableReason::BeatIntervalsNotAvailable);
    let (margins_no_hrv, sev_no_hrv) = evaluate_nqs_stl_and_mri(
        &bio_no_hrv,
        &nominal_musc,
        &pkt_hrv.jugular_hemodynamics,
        &pkt_hrv.sans_ocular,
    );
    assert_eq!(margins_no_hrv.mri_pct, None);
    assert_eq!(sev_no_hrv, AlertSeverity::DataDegradedMissingChannels);

    // 2. [V1 3003]: Role-Based Crew Medical Privacy
    let guard = AresSecurityGuard::new(false);
    let nominal_pkt = sample_packet_for_privacy(false);
    let self_view = guard
        .filter_packet_for_role(&nominal_pkt, CrewRole::AstronautSelf)
        .expect("self view");
    assert_eq!(self_view.biometrics.vocal_f0_hz, Some(118.5));
    assert_eq!(self_view.biometrics.vocal_jitter_pct, Some(0.55));

    let cmo_view = guard
        .filter_packet_for_role(&nominal_pkt, CrewRole::CrewMedicalOfficer)
        .expect("cmo view");
    assert_eq!(cmo_view.biometrics.vocal_f0_hz, None);
    assert_eq!(cmo_view.biometrics.vocal_jitter_pct, None);

    let fs_view = guard
        .filter_packet_for_role(&nominal_pkt, CrewRole::GroundFlightSurgeon)
        .expect("flight surgeon view");
    assert_eq!(fs_view.biometrics.vocal_f0_hz, None);
    assert_eq!(fs_view.biometrics.vocal_jitter_pct, None);

    let crit_pkt = sample_packet_for_privacy(true);
    let crit_fs_view = guard
        .filter_packet_for_role(&crit_pkt, CrewRole::GroundFlightSurgeon)
        .expect("critical override view");
    assert_eq!(crit_fs_view.biometrics.vocal_f0_hz, Some(118.5));

    // 3. [V1 3006]: Autonomous EIMO Support (4-24 min OWLT, 100% air-gapped, FastMCP <= 600 B)
    let shell = AresMedOsWorkstationShell::initialize(DesktopShellConfig {
        data_dir: bidmc_dir(),
        ..DesktopShellConfig::default()
    })
    .expect("init shell");
    let os_status = shell.ipc_get_os_status_bar_state().expect("os status");
    assert!(os_status.air_gapped);
    assert!(os_status.owlt.eimo_autonomous_active);
    assert!((240.0..=1440.0).contains(&os_status.owlt.owlt_seconds));
    for tool in ["get_crew_health_summary", "get_medops_playbook", "query_dataset_graph"] {
        let req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": tool, "arguments": {} }
        });
        let raw = shell
            .ipc_invoke_fastmcp_tool(&req.to_string())
            .expect("offline fastmcp call");
        let resp: Value = serde_json::from_str(&raw).expect("valid jsonrpc");
        let text = resp["result"]["content"][0]["text"].as_str().expect("text");
        assert!(text.len() <= MAX_MCP_CONTEXT_MODE_BYTES);
    }

    // 4. [V1 4001]: Space Radiation Protection (SPE > 1.5 mSv/d -> Storm Shelter Mandatory, EVA Forbidden)
    let policy = HabitatZoneDeonticPolicy::default();
    let spe_assess = policy.evaluate(&HabitatEnvironmentState {
        current_zone: HabitatZoneId::SleepQuarters,
        radiation_dose_rate_msv_d: 2.6,
        gai_pct: 5.0,
        pocus_thrombus_confirmed: false,
        lbnp_dwell_s: 0.0,
        sleep_quarters_noise_dba: 42.0,
    });
    assert_eq!(
        spe_assess.verdict(HabitatZoneId::RadiationStormShelter).modality,
        DeonticModality::Mandatory
    );
    assert_eq!(
        spe_assess.verdict(HabitatZoneId::EvaAirlock).modality,
        DeonticModality::Forbidden
    );
    assert_eq!(
        spe_assess.verdict(HabitatZoneId::RadiationStormShelter).governing_clause,
        "NASA-STD-3001 [V1 4001]"
    );
    assert_eq!(
        spe_assess.mandatory_zone,
        Some(HabitatZoneId::RadiationStormShelter)
    );
    assert!(spe_assess.violates_policy);

    let mut bio_spe = pkt_hrv.biometrics.clone();
    bio_spe.radiation_dose_rate_msv_d = 2.6;
    let pb_spe = select_candidate_playbook(
        &bio_spe,
        &nominal_musc,
        &pkt_hrv.jugular_hemodynamics,
        &margins_hrv,
        vec![],
    );
    assert_eq!(pb_spe.playbook_id, "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS");

    // 5. [V2 6001] & [V2 6002] & [V2 6026]: Acoustic NC-50 / ppCO2 / Hydration & Renal Stone
    let noisy_assess = policy.evaluate(&HabitatEnvironmentState {
        current_zone: HabitatZoneId::SleepQuarters,
        radiation_dose_rate_msv_d: 0.45,
        gai_pct: 4.5,
        pocus_thrombus_confirmed: false,
        lbnp_dwell_s: 0.0,
        sleep_quarters_noise_dba: 62.0,
    });
    assert_eq!(
        noisy_assess.verdict(HabitatZoneId::SleepQuarters).modality,
        DeonticModality::Restricted
    );
    assert!(noisy_assess.verdict(HabitatZoneId::SleepQuarters).rho_qstl < 0.0);
    assert_eq!(
        noisy_assess.verdict(HabitatZoneId::SleepQuarters).governing_clause,
        "NASA-STD-3001 [V2 6001]"
    );

    let mut ppco2 = 2.3;
    let patch_co2 = StressTestPatchRequest {
        cabin_ppco2_mmhg: Some(6.2),
        ..StressTestPatchRequest::default()
    };
    let _ = patch_co2.apply_onto(&default_scenario_input(), &mut ppco2);
    assert!((ppco2 - 6.2).abs() < 1e-9);
    assert!(unloaded_musc.urinary_calcium_mg_d > nominal_musc.urinary_calcium_mg_d);
    assert!(unloaded_musc.urinary_calcium_mg_d > 175.0);

    // 6. [V2 7043]: Onboard Medical Capability (Two-Stage Bayesian POCUS + LBNP)
    let jug_stasis = JugularHemodynamics {
        ijv_csa_mm2: 92.0,
        ijv_vmax_cm_s: 3.9,
        tau_w_dyn_cm2: 0.48,
        flow_grade: JugularFlowGrade::StagnantBidirectional,
        pocus_thrombus_confirmed: false,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
    };
    let pre_pocus = evaluate_two_stage_bayesian_pocus(&jug_stasis, &unloaded_musc, 0.5);
    assert!(pre_pocus.thrombus_posterior <= 0.45);
    assert!(pre_pocus.pocus_inspection_required);

    let mut jug_confirmed = jug_stasis;
    jug_confirmed.pocus_thrombus_confirmed = true;
    let post_pocus = evaluate_two_stage_bayesian_pocus(&jug_confirmed, &unloaded_musc, 0.5);
    assert!(post_pocus.thrombus_posterior >= 0.92);

    // 7. [V2 10022] (<= 100 ms discrete control feedback) & [V2 10152] (<= 50 ms dynamic display)
    let t_ctrl = Instant::now();
    let stress_out = shell
        .ipc_post_stress_test(StressTestPatchRequest {
            flight_day: Some(120),
            ared_daily_load_kgf: Some(25.0),
            ..StressTestPatchRequest::default()
        })
        .expect("ipc_post_stress_test");
    let ctrl_ms = t_ctrl.elapsed().as_secs_f64() * 1_000.0;
    assert!(
        ctrl_ms <= 100.0,
        "[V2 10022] discrete feedback exceeded 100 ms: {ctrl_ms:.3} ms"
    );
    assert!(stress_out.what_if_overlay.active);

    let t_disp = Instant::now();
    let _disp_frame = shell
        .advance_tick(Duration::from_millis(50))
        .expect("advance_tick");
    let disp_ms = t_disp.elapsed().as_secs_f64() * 1_000.0;
    assert!(
        disp_ms <= 50.0,
        "[V2 10152] dynamic display update exceeded 50 ms: {disp_ms:.3} ms"
    );

    // 8. [V2 10023] / [V2 10024]: MedOps Playbook Step Tracking & Normative Governance
    let pb_ids = [
        "PLAYBOOK_01_VENOUS_STASIS_LBNP",
        "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS",
        "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED",
        "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION",
        "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS",
    ];
    for id in pb_ids {
        let g = ground_playbook_normative(id).expect("ground playbook");
        assert!(g.descriptor.verify_crc().is_ok());
    }
    let strong_epistemic =
        EpistemicProvenance::from_modalities(Some(0.85), Some(0.92), Some(0.75), Some(1.0));
    let blocked_pb = ActivePlaybook {
        playbook_id: "PLAYBOOK_01_VENOUS_STASIS_LBNP".to_string(),
        title: "Unverified Anticoag Test".to_string(),
        causal_chain_summary: vec![],
        safety_gates: SafetyGates {
            anticoagulant_lock_active: true,
            lbnp_auto_vent_armed: true,
            eva_suit_damping_active: false,
            gate4_invasive_decompression_locked: true,
            gate4_eva_fitness_no_go: false,
        },
        actions: vec![CountermeasureAction {
            action_id: "ACT_ANTICOAG_ENOXAPARIN".to_string(),
            label: "Should be blocked without POCUS".to_string(),
            category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
            delta_rho_per_hour: 0.20,
        }],
    };
    let hab_nom = HabitatEnvironmentState {
        current_zone: HabitatZoneId::LbnpChamber,
        radiation_dose_rate_msv_d: 0.45,
        gai_pct: 5.0,
        pocus_thrombus_confirmed: false,
        lbnp_dwell_s: 600.0,
        sleep_quarters_noise_dba: 42.0,
    };
    assert!(
        verify_playbook_governance(&blocked_pb, &strong_epistemic, 0, false, &hab_nom, &policy)
            .is_err()
    );
    let ok_verdict =
        verify_playbook_governance(&blocked_pb, &strong_epistemic, 0, true, &hab_nom, &policy)
            .expect("unlocked with POCUS confirmation");
    assert!(matches!(
        ok_verdict.answerability,
        ClinicalAnswerabilityGate::Answerable { .. }
    ));

    // 9. [V2 10027]: Hard Clinical Safety Gates 1-3 Interlocks
    let mut bio_tachy = pkt_hrv.biometrics.clone();
    bio_tachy.heart_rate_bpm = Some(122.0);
    let mut jug_lbnp = jug_stasis;
    jug_lbnp.lbnp_active = true;
    jug_lbnp.lbnp_pressure_mmhg = -30.0;
    let mut scen_gate = default_scenario_input();
    scen_gate.lbnp_active = true;
    scen_gate.systolic_bp_drop_mmhg = 18.0;
    scen_gate.pocus_thrombus_confirmed = false;

    let gated = enforce_hard_clinical_safety_gates(
        blocked_pb,
        &bio_tachy,
        &unloaded_musc,
        &jug_lbnp,
        &scen_gate,
    );
    // Gate 1: anticoag stripped
    assert!(gated.safety_gates.anticoagulant_lock_active);
    assert!(
        gated
            .actions
            .iter()
            .all(|a| !a.action_id.contains("ANTICOAG"))
    );
    // Gate 2: LBNP auto-vent inserted at index 0
    assert!(gated.safety_gates.lbnp_auto_vent_armed);
    assert_eq!(
        gated.actions[0].action_id,
        "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG"
    );
    // Gate 3: EVA ankle damping injected for GAI > 12%
    assert!(gated.safety_gates.eva_suit_damping_active);
    assert!(
        gated
            .actions
            .iter()
            .any(|a| a.action_id == "ACT_EVA_SUIT_ANKLE_DAMPING_038G")
    );
}

#[test]
fn cert_phase_28_k4_realtime_latency_percentiles_and_900_sol_memory_footprint() {
    const ITERS: usize = 1_000;
    const WARMUP: usize = 100;

    // -------------------------------------------------------------------------
    // Benchmark 1: SeqlockTelemetryRing::read_latest() (and raw read_latest_bytes)
    // -------------------------------------------------------------------------
    let ring = SeqlockTelemetryRing::<64>::new();
    let sample_pkt = sample_packet_for_privacy(false);
    let sample_frame = BinaryTelemetryFrame::from_telemetry_packet(
        &sample_pkt,
        None,
        BinaryFrameMeta {
            seq: 1,
            timestamp_ms: 1_794_657_600_000,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask: DEONTIC_EIMO_AUTONOMOUS,
            ..BinaryFrameMeta::default()
        },
    );
    ring.publish(&sample_frame);

    for _ in 0..WARMUP {
        let _ = black_box(ring.read_latest().expect("warmup read"));
    }

    let mut ring_read_bytes_ns = Vec::with_capacity(ITERS);
    for _ in 0..ITERS {
        let t0 = Instant::now();
        let bytes = ring.read_latest_bytes().expect("read_latest_bytes");
        let elapsed = t0.elapsed().as_nanos();
        black_box(bytes);
        ring_read_bytes_ns.push(elapsed);
    }
    ring_read_bytes_ns.sort_unstable();
    let rb_p50 = percentile_ns(&ring_read_bytes_ns, 0.50);
    let rb_p99 = percentile_ns(&ring_read_bytes_ns, 0.99);
    let rb_p999 = percentile_ns(&ring_read_bytes_ns, 0.999);

    let mut ring_read_ns = Vec::with_capacity(ITERS);
    for _ in 0..ITERS {
        let t0 = Instant::now();
        let frame = ring.read_latest().expect("read_latest");
        let elapsed = t0.elapsed().as_nanos();
        black_box(frame);
        ring_read_ns.push(elapsed);
    }
    ring_read_ns.sort_unstable();
    let rl_p50 = percentile_ns(&ring_read_ns, 0.50);
    let rl_p99 = percentile_ns(&ring_read_ns, 0.99);
    let rl_p999 = percentile_ns(&ring_read_ns, 0.999);

    // -------------------------------------------------------------------------
    // Benchmark 2: AresUnifiedDatasetGraph query + shortest_path across 24 datasets
    // -------------------------------------------------------------------------
    let graph = AresUnifiedDatasetGraph::build_from_repo_root(&repo_root()).expect("build graph");
    assert_eq!(graph.dataset_count(), 24);
    let dataset_codes = graph.dataset_codes();
    assert_eq!(dataset_codes.len(), 24);

    for i in 0..WARMUP {
        let code = &dataset_codes[i % dataset_codes.len()];
        let _ = black_box(graph.query_by_keyword_or_id(code, 3));
    }

    let mut graph_query_ns = Vec::with_capacity(ITERS);
    for i in 0..ITERS {
        let code = &dataset_codes[i % dataset_codes.len()];
        let t0 = Instant::now();
        let res = graph.query_by_keyword_or_id(code, 3);
        let elapsed = t0.elapsed().as_nanos();
        assert!(res.matched_id.is_some());
        black_box(res);
        graph_query_ns.push(elapsed);
    }
    graph_query_ns.sort_unstable();
    let gq_p50_us = percentile_ns(&graph_query_ns, 0.50) / 1_000.0;
    let gq_p99_us = percentile_ns(&graph_query_ns, 0.99) / 1_000.0;
    let gq_p999_us = percentile_ns(&graph_query_ns, 0.999) / 1_000.0;

    let path_pairs = [
        ("OSD-818", "pheno_sans_papilledema"),
        ("OSD-51", "pheno_osteopenia"),
        ("BIDMC", "bm_hr"),
        ("CSA CANS", "NASA-STD-3001 [V1 4001]"),
    ];
    let mut graph_path_ns = Vec::with_capacity(ITERS);
    for i in 0..ITERS {
        let (from, to) = path_pairs[i % path_pairs.len()];
        let t0 = Instant::now();
        let path = graph
            .explain_shortest_path(from, to)
            .expect("explain_shortest_path");
        let elapsed = t0.elapsed().as_nanos();
        assert!(path.hops >= 1);
        black_box(path);
        graph_path_ns.push(elapsed);
    }
    graph_path_ns.sort_unstable();
    let gp_p50_us = percentile_ns(&graph_path_ns, 0.50) / 1_000.0;
    let gp_p99_us = percentile_ns(&graph_path_ns, 0.99) / 1_000.0;
    let gp_p999_us = percentile_ns(&graph_path_ns, 0.999) / 1_000.0;

    // -------------------------------------------------------------------------
    // Benchmark 3: ground_adhg_node_o1() (ARES-BioKG, < 5 us)
    // -------------------------------------------------------------------------
    let adhg_nodes = [
        AdhgNodeKind::AredMechanicalLoad,
        AdhgNodeKind::SoleusMuscleQualityMqi,
        AdhgNodeKind::OsteocyteSclerostinSost,
        AdhgNodeKind::EndothelialProtectiveSecretome,
        AdhgNodeKind::CansRadiationOxidativeStress,
        AdhgNodeKind::IjvVenousStasisShearStress,
        AdhgNodeKind::PocusThrombusPosterior,
        AdhgNodeKind::SansTranslaminarGradient,
    ];
    for i in 0..WARMUP {
        let _ = black_box(ground_adhg_node_o1(adhg_nodes[i % adhg_nodes.len()]));
    }
    let mut biokg_ns = Vec::with_capacity(ITERS);
    for i in 0..ITERS {
        let kind = black_box(adhg_nodes[i % adhg_nodes.len()]);
        let t0 = Instant::now();
        let grounded = ground_adhg_node_o1(kind);
        let crc_ok = grounded.descriptor.verify_crc().is_ok();
        let elapsed = t0.elapsed().as_nanos();
        assert!(crc_ok);
        black_box(grounded);
        biokg_ns.push(elapsed);
    }
    biokg_ns.sort_unstable();
    let bk_p50_ns = percentile_ns(&biokg_ns, 0.50);
    let bk_p99_ns = percentile_ns(&biokg_ns, 0.99);
    let bk_p999_ns = percentile_ns(&biokg_ns, 0.999);

    // -------------------------------------------------------------------------
    // Benchmark 4: End-to-end 1-tick physiological pipeline
    // (SqiFilter -> AdhgCausalEngine -> NqsEngine -> BinaryTelemetryFrame::to_le_bytes)
    // -------------------------------------------------------------------------
    let replayer = BidmcReplayer::from_csv_path("bidmc_01", &bidmc_dir().join("bidmc_01_Numerics.csv"))
        .expect("load bidmc_01");
    let mut sqi_filter = SqiFilter::default();
    let mut adhg_engine = AdhgCausalEngine::new();
    let mut nqs_engine = NqsEngine::new(60.0);
    let scenario = default_scenario_input();
    let total_rows = replayer.len();

    for i in 0..WARMUP {
        let row = replayer.row_at_second(i % total_rows);
        let eval = sqi_filter.evaluate_row_detailed(row);
        let bio = biometrics_with_signal_quality(row, &scenario, &eval);
        let musc = compute_musculoskeletal_state(scenario.flight_day, scenario.ared_daily_load_kgf);
        let (jug, sans) = compute_jugular_and_sans_state(&musc, &scenario);
        let (_pocus, _chain) = adhg_engine.update_and_extract_causal_chain(
            &musc,
            &jug,
            &sans,
            bio.radiation_dose_rate_msv_d,
        );
        let nqs_eval = nqs_engine.evaluate_tick(row.relative_time_s, &bio, &musc, &jug, &sans);
        let _ = black_box(nqs_eval);
    }

    let mut pipeline_ns = Vec::with_capacity(ITERS);
    for i in 0..ITERS {
        let row = replayer.row_at_second(i % total_rows);
        let t0 = Instant::now();
        let eval = sqi_filter.evaluate_row_detailed(row);
        let bio = biometrics_with_signal_quality(row, &scenario, &eval);
        let musc = compute_musculoskeletal_state(scenario.flight_day, scenario.ared_daily_load_kgf);
        let (jug, sans) = compute_jugular_and_sans_state(&musc, &scenario);
        let (_pocus, chain) = adhg_engine.update_and_extract_causal_chain(
            &musc,
            &jug,
            &sans,
            bio.radiation_dose_rate_msv_d,
        );
        let nqs_eval = nqs_engine.evaluate_tick(row.relative_time_s, &bio, &musc, &jug, &sans);
        let candidate = select_candidate_playbook(&bio, &musc, &jug, &nqs_eval.margins, chain);
        let playbook = enforce_hard_clinical_safety_gates(candidate, &bio, &musc, &jug, &scenario);
        let pkt = TelemetryPacket {
            timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
            mission_Elapsed_seconds: row.relative_time_s,
            relative_recording_time_s: row.relative_time_s,
            source_record_id: row.record_id.clone(),
            flight_day: scenario.flight_day,
            astronaut_id: "ARES-CDR-01".to_string(),
            system_phase: SystemPhase::Evaluate,
            alert_severity: nqs_eval.severity,
            model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            provenance_manifest: ProvenanceManifest {
                biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
                biometrics_native_rate_hz: 1.0,
                ui_refresh_rate_hz: 20.0,
                scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
                biological_context_refs: vec!["PhysioNet-BIDMC-v1.0.0".to_string()],
            },
            biometrics: bio,
            musculoskeletal: musc,
            jugular_hemodynamics: jug,
            sans_ocular: sans,
            nqs_stl: nqs_eval.margins,
            active_playbook: playbook,
            spot_poct: None,
            renal_nephrolithiasis: None,
            orthostatic_fluid: None,
            mars_circadian_sleep: None,
            neuro_immune_viral: None,
        };
        let frame = BinaryTelemetryFrame::from_telemetry_packet(
            &pkt,
            Some(&nqs_eval.quantile_snapshot),
            BinaryFrameMeta {
                seq: i as u64,
                timestamp_ms: 1_794_657_600_000 + (i as u64) * 50,
                partition_status: PARTITION_ALL_NOMINAL,
                deontic_habitat_mask: DEONTIC_EIMO_AUTONOMOUS,
                ..BinaryFrameMeta::default()
            },
        );
        let wire_bytes = frame.to_le_bytes();
        let elapsed = t0.elapsed().as_nanos();
        black_box(wire_bytes);
        pipeline_ns.push(elapsed);
    }
    pipeline_ns.sort_unstable();
    let pl_p50_us = percentile_ns(&pipeline_ns, 0.50) / 1_000.0;
    let pl_p99_us = percentile_ns(&pipeline_ns, 0.99) / 1_000.0;
    let pl_p999_us = percentile_ns(&pipeline_ns, 0.999) / 1_000.0;

    // -------------------------------------------------------------------------
    // Memory Certification: 900 Martian Sols Compactor & 24-Dataset Graph
    // -------------------------------------------------------------------------
    let mut compactor =
        MissionLongitudinalCompactor::new(MARS_MISSION_SOLS).expect("900-sol compactor");
    for sol in 0..MARS_MISSION_SOLS {
        for bucket in 0..4u32 {
            let timestamp_s = f64::from(sol) * MARS_SOL_SECONDS + f64::from(bucket) * 950.0;
            compactor
                .observe(
                    timestamp_s,
                    &PhysiologicalTick {
                        tau_w_dyn_cm2: 2.35,
                        sost_pmol_l: 25.0,
                        mqi: 0.91,
                        sans_index: 0.17,
                        rho_global: if sol == 450 && bucket == 1 {
                            Some(-0.12)
                        } else {
                            Some(0.75)
                        },
                    },
                )
                .expect("observe 900-sol tick");
        }
    }
    let compactor_bytes = compactor.memory_footprint_bytes();
    assert!(
        compactor_bytes < LONGITUDINAL_MEMORY_BUDGET_BYTES,
        "MissionLongitudinalCompactor 900-Sol footprint {compactor_bytes} B >= {LONGITUDINAL_MEMORY_BUDGET_BYTES} B"
    );

    let (graphify_export, export_stats) = graph.to_graphify_export_json();
    let graph_json_bytes = serde_json::to_vec(&graphify_export)
        .expect("serialize graphify export")
        .len();
    let graph_ram_estimate_bytes =
        std::mem::size_of_val(&graph) + graph.node_count() * 1_024 + graph.edge_count() * 256;
    assert!(
        graph_json_bytes < 15 * 1024 * 1024,
        "DatasetGraph JSON {graph_json_bytes} B exceeded 15 MB limit"
    );
    assert!(
        graph_ram_estimate_bytes < 10 * 1024 * 1024,
        "DatasetGraph RAM estimate {graph_ram_estimate_bytes} B exceeded 10 MB limit"
    );

    let profile_tag = if cfg!(debug_assertions) {
        "DEBUG"
    } else {
        "RELEASE"
    };
    println!(
        "[{profile_tag}] SeqlockTelemetryRing::read_latest_bytes (N={ITERS}): p50={rb_p50:.1} ns, p99={rb_p99:.1} ns, p99.9={rb_p999:.1} ns"
    );
    println!(
        "[{profile_tag}] SeqlockTelemetryRing::read_latest (+CRC32C, N={ITERS}): p50={rl_p50:.1} ns, p99={rl_p99:.1} ns, p99.9={rl_p999:.1} ns"
    );
    println!(
        "[{profile_tag}] AresUnifiedDatasetGraph::query_by_keyword_or_id (N={ITERS}, 24 DS): p50={gq_p50_us:.2} us, p99={gq_p99_us:.2} us, p99.9={gq_p999_us:.2} us"
    );
    println!(
        "[{profile_tag}] AresUnifiedDatasetGraph::explain_shortest_path (N={ITERS}, 24 DS): p50={gp_p50_us:.2} us, p99={gp_p99_us:.2} us, p99.9={gp_p999_us:.2} us"
    );
    println!(
        "[{profile_tag}] ground_adhg_node_o1 + verify_crc (N={ITERS}): p50={bk_p50_ns:.1} ns, p99={bk_p99_ns:.1} ns, p99.9={bk_p999_ns:.1} ns"
    );
    println!(
        "[{profile_tag}] End-to-End 1-Tick Pipeline (SQI->ADHG->NQS->MedOps->128B, N={ITERS}): p50={pl_p50_us:.2} us, p99={pl_p99_us:.2} us, p99.9={pl_p999_us:.2} us"
    );
    println!(
        "[{profile_tag}] Memory MissionLongitudinalCompactor (900 Sols): {compactor_bytes} bytes (< {LONGITUDINAL_MEMORY_BUDGET_BYTES} bytes)"
    );
    println!(
        "[{profile_tag}] Memory AresUnifiedDatasetGraph (24 DS, {} nodes, {} edges): RAM_est={graph_ram_estimate_bytes} bytes (< 10 MB), JSON={graph_json_bytes} bytes (< 15 MB)",
        export_stats.node_count, export_stats.edge_count
    );

    #[cfg(not(debug_assertions))]
    {
        assert!(
            rb_p99 < 100.0,
            "SeqlockTelemetryRing::read_latest_bytes p99={rb_p99:.1} ns >= 100 ns"
        );
        assert!(
            rl_p99 < 1_000.0,
            "SeqlockTelemetryRing::read_latest (+CRC32C) p99={rl_p99:.1} ns >= 1000 ns"
        );
        assert!(
            gq_p99_us < 1_000.0,
            "DatasetGraph query p99={gq_p99_us:.2} us >= 1000 us"
        );
        assert!(
            gp_p99_us < 1_000.0,
            "DatasetGraph shortest_path p99={gp_p99_us:.2} us >= 1000 us"
        );
        assert!(
            bk_p99_ns < 5_000.0,
            "ground_adhg_node_o1 p99={bk_p99_ns:.1} ns >= 5000 ns"
        );
        assert!(
            pl_p99_us < 150.0,
            "End-to-end 1-tick pipeline p99={pl_p99_us:.2} us >= 150 us"
        );
    }
    #[cfg(debug_assertions)]
    {
        // Debug build safety bounds (unoptimized) while still exercising all 1,000 iterations
        assert!(gq_p99_us < 20_000.0);
        assert!(gp_p99_us < 20_000.0);
        assert!(bk_p99_ns < 100_000.0);
        assert!(pl_p99_us < 10_000.0);
    }
}
