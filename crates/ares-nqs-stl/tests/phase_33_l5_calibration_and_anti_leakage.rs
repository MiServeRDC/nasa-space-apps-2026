use ares_causal_graph::mechanotransduction::{
    Rk4HorizonPolicy, compute_musculoskeletal_state_with_policy, integrate_sclerostin_schedule,
};
use ares_causal_graph::parquet_adapters::{
    AdapterStatus, DlrHdbAdapter, NasaOsdrOmicsAdapter, compute_verified_time_domain_hrv,
};
use ares_core_types::telemetry::{
    BiometricsSource, ModelValidationStatus, Sha256DigestHex, TerrestrialBenchmarkScope,
    ValidationManifest,
};
use ares_core_types::{DHF_HORIZONS_SECONDS, MonotoneQuantileTriplet};
use ares_nqs_stl::calibration_harness::{
    CalibrationAuditReport, CalibrationSamplePair, HorizonEvaluationStatus,
    LeakageViolationError, SplitRole, assign_subject_split_role, canonical_subject_id,
    clopper_pearson_exact_95, compute_brier_and_ece_10_bins, evaluate_horizon_cells,
    resolve_validation_status_fail_closed, resolve_validation_status_with_report_hash,
    run_sost_rk4_sensitivity_audit, verify_anti_leakage_invariants,
};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[test]
fn test_l5_anti_leakage_rejects_mixed_subjects_warmup_copies_overlap_and_next_tick_horizon() {
    // 1. Same canonical subject ("bidmc_01" / "slice://bidmc/01/t_0000_0060") across splits -> REJECTED (L1)
    let mixed = vec![
        CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::Calibration, 30.0, 90.0, 60),
        CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::HeldOutTest, 120.0, 180.0, 60),
    ];
    assert!(matches!(
        verify_anti_leakage_invariants(&mixed, 16),
        Err(LeakageViolationError::SubjectOverlapAcrossSplits { .. })
    ));

    let mixed_slice_uri = vec![
        CalibrationSamplePair::real_recorded(
            "slice://bidmc/01/t_0000_0060",
            SplitRole::Calibration,
            30.0,
            90.0,
            60,
        ),
        CalibrationSamplePair::real_recorded(
            "slice://bidmc/01/t_0120_0180",
            SplitRole::HeldOutTest,
            120.0,
            180.0,
            60,
        ),
    ];
    assert!(matches!(
        verify_anti_leakage_invariants(&mixed_slice_uri, 16),
        Err(LeakageViolationError::SubjectOverlapAcrossSplits { .. })
    ));

    // 2. Warmup copy or duplicate timestamp -> REJECTED (L2)
    let dup_warmup = vec![
        CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::Calibration, 20.0, 80.0, 60),
        CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::Calibration, 20.0, 80.0, 60),
    ];
    assert!(matches!(
        verify_anti_leakage_invariants(&dup_warmup, 16),
        Err(LeakageViolationError::WarmupCopyOrDuplicateTimestamp { .. })
    ));

    let padded_warmup = vec![
        CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::Calibration, 20.0, 80.0, 60)
            .with_warmup_state(8, true),
    ];
    assert!(matches!(
        verify_anti_leakage_invariants(&padded_warmup, 16),
        Err(LeakageViolationError::WarmupCopyOrDuplicateTimestamp { .. })
    ));

    // 3. Overlapping window stride (< horizon_s) -> REJECTED (L3)
    let overlapping = vec![
        CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::Calibration, 20.0, 80.0, 60),
        CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::Calibration, 50.0, 110.0, 60),
    ];
    assert!(matches!(
        verify_anti_leakage_invariants(&overlapping, 16),
        Err(LeakageViolationError::OverlappingWindowAcrossBoundary { .. })
    ));

    // 4. Evaluating +15m (900s) horizon against next tick t0 + 1s -> REJECTED (L4)
    let next_tick_leak = vec![CalibrationSamplePair::real_recorded(
        "bidmc_03",
        SplitRole::HeldOutTest,
        20.0,
        21.0,
        900,
    )];
    assert!(matches!(
        verify_anti_leakage_invariants(&next_tick_leak, 16),
        Err(LeakageViolationError::HorizonTargetMismatch {
            declared_horizon_s: 900,
            ..
        })
    ));

    // Canonical BIDMC split roles preserved
    assert_eq!(assign_subject_split_role("bidmc_02"), SplitRole::Train);
    assert_eq!(assign_subject_split_role("bidmc_01"), SplitRole::Calibration);
    assert_eq!(assign_subject_split_role("bidmc_03"), SplitRole::HeldOutTest);
    assert_eq!(canonical_subject_id("slice://bidmc/01/t_0000_0060"), "bidmc/01");
}

#[test]
fn test_l5_clopper_pearson_exact_bounds_and_synthetic_upgrade_lockout() {
    // Clopper & Pearson (1934) exact check: K = 90, N = 100
    let cp = clopper_pearson_exact_95(90, 100);
    assert!((cp.empirical_coverage - 0.90).abs() < 1e-12);
    assert!((cp.ci95_low - 0.823_78).abs() < 1e-3);
    assert!((cp.ci95_high - 0.950_99).abs() < 1e-3);
    assert!(cp.covers_target_90pct);

    let cp_zero = clopper_pearson_exact_95(0, 20);
    assert_eq!(cp_zero.ci95_low, 0.0);
    assert!(cp_zero.ci95_high < 0.20);
    assert!(!cp_zero.covers_target_90pct);

    let cp_full = clopper_pearson_exact_95(20, 20);
    assert_eq!(cp_full.ci95_high, 1.0);
    assert!(cp_full.ci95_low > 0.80);

    // Synthetic data NEVER permitted in calibration or validation upgrade
    let synthetic_pair = vec![CalibrationSamplePair::with_source(
        "sim_astronaut_01",
        SplitRole::HeldOutTest,
        BiometricsSource::SimulatedScenarioInput,
        30.0,
        90.0,
        60,
    )];
    assert!(matches!(
        verify_anti_leakage_invariants(&synthetic_pair, 16),
        Err(LeakageViolationError::SyntheticDataForbiddenInCalibration { .. })
    ));

    let status = resolve_validation_status_fail_closed(true, None, None);
    assert_eq!(status, ModelValidationStatus::IllustrativeUnvalidated);
}

#[test]
fn test_l5_cqr_baselines_and_insufficient_recording_duration_on_480s_bidmc() {
    let mut samples = Vec::new();
    // 10 non-overlapping Calibration samples (+15s) on bidmc_01 (span 0..480s)
    for k in 0..10usize {
        let t0 = 20.0 + (k as f64) * 20.0;
        let t1 = t0 + 15.0;
        let y0 = 70.0 + (k as f64) * 0.5;
        let y1 = y0 + if k % 2 == 0 { 1.2 } else { -1.1 };
        let cone = MonotoneQuantileTriplet::from_median_and_spreads(y0, 0.8, 0.8);
        samples.push(
            CalibrationSamplePair::real_recorded("bidmc_01", SplitRole::Calibration, t0, t1, 15)
                .with_observation("heart_rate_bpm", y0, y1, cone, 0.0),
        );
    }

    // 32 non-overlapping HeldOutTest samples (+15s) across bidmc_03 and bidmc_04
    for (subj_idx, subj) in ["bidmc_03", "bidmc_04"].iter().enumerate() {
        for k in 0..16usize {
            let t0 = 20.0 + (k as f64) * 20.0;
            let t1 = t0 + 15.0;
            let y0 = 72.0 + (subj_idx as f64) + (k as f64) * 0.2;
            let y1 = y0 + if k % 3 == 0 { 1.0 } else { -0.7 };
            let cone = MonotoneQuantileTriplet::from_median_and_spreads(y0, 0.8, 0.8);
            samples.push(
                CalibrationSamplePair::real_recorded(subj, SplitRole::HeldOutTest, t0, t1, 15)
                    .with_observation("heart_rate_bpm", y0, y1, cone, 0.0),
            );
        }
    }

    let mut horizons = vec![15];
    horizons.extend_from_slice(&DHF_HORIZONS_SECONDS);

    let cells = evaluate_horizon_cells(&samples, &horizons, 480.0, 16)
        .expect("anti-leakage invariants must pass");

    // 480s recording cannot evaluate +15m..+24h DHF horizons: must emit InsufficientRecordingDuration!
    for h in DHF_HORIZONS_SECONDS {
        let cell = cells
            .iter()
            .find(|c| c.horizon_s == h)
            .expect("DHF horizon cell present");
        assert!(!cell.is_short_technical_subhorizon);
        assert!(matches!(
            cell.status,
            HorizonEvaluationStatus::InsufficientRecordingDuration {
                required_horizon_s,
                ..
            } if required_horizon_s == h
        ));
        assert!(cell.timestral_cqr_coverage.is_none());
    }

    // Short technical +15s sub-horizon is evaluated with CQR + Persistence & RollingMedianIQR baselines
    let short_cell = cells
        .iter()
        .find(|c| c.horizon_s == 15)
        .expect("short +15s cell");
    assert!(short_cell.is_short_technical_subhorizon);
    assert_eq!(short_cell.status, HorizonEvaluationStatus::Evaluated);
    let cp = short_cell.timestral_cqr_coverage.expect("coverage bounds");
    assert_eq!(cp.n_total, 32);
    assert!(cp.empirical_coverage >= 0.85);
    assert!(short_cell.winkler_score_alpha_10.is_some());
    assert!(short_cell.pinball_loss_mean.is_some());
    assert!(short_cell.persistence_winkler_score.is_some());
    assert!(short_cell.rolling_median_iqr_winkler_score.is_some());

    // Fail-closed status: with real terrestrial cells + valid digest -> InternallyBenchmarkedTerrestrial,
    // NEVER ClinicallyCalibratedSubjectToReview without signed 5-gate ValidationManifest!
    let report = CalibrationAuditReport {
        schema_version: 1,
        contains_synthetic_data: false,
        anti_leakage_verified: true,
        split_subjects: BTreeMap::new(),
        horizon_cells: cells,
        pocus_calibration_audit: Some(compute_brier_and_ece_10_bins(&[
            (0.10, false),
            (0.90, true),
        ])),
        sost_rk4_sensitivity: run_sost_rk4_sensitivity_audit(),
        resolved_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    };
    let status = resolve_validation_status_fail_closed(false, Some(&report), None);
    assert!(matches!(
        status,
        ModelValidationStatus::InternallyBenchmarkedTerrestrial {
            dataset_scope: TerrestrialBenchmarkScope::BidmcNumericsShortSubHorizon,
            ..
        }
    ));

    // Even with a manifest, if `contains_synthetic_data` is true, status stays IllustrativeUnvalidated!
    let fake_manifest = ValidationManifest {
        schema_version: 1,
        reviewer_id: "flight_surgeon_test".to_string(),
        commit_sha: "abcdef1".to_string(),
        unresolved_mappings: 0,
        review_signature_sha256: Some(Sha256DigestHex([1u8; 32])),
        paired_cohorts_verified: true,
        bidmc_only: false,
        paired_modalities: vec!["RR".to_string(), "POCUS".to_string()],
        subject_disjoint_split_verified: true,
        zero_leakage_dhf_horizons_verified: true,
        calibration_report_sha256: Sha256DigestHex([2u8; 32]),
        brier_score: 0.05,
        ece_10_bins: 0.02,
        beats_or_ties_baselines: true,
        contains_synthetic_data: false,
        workflow_study_sha256: Some(Sha256DigestHex([3u8; 32])),
        workflow_study_path: Some("study.json".to_string()),
    };
    assert_eq!(
        resolve_validation_status_with_report_hash(
            true,
            Some(&report),
            Some(&fake_manifest),
            Some(Sha256DigestHex([2u8; 32]))
        ),
        ModelValidationStatus::IllustrativeUnvalidated
    );
}

#[test]
fn test_l5_brier_ece_and_sost_rk4_60d_cap_vs_900_sol_schedule() {
    let preds = vec![(0.10, false), (0.10, false), (0.90, true), (0.90, true)];
    let audit = compute_brier_and_ece_10_bins(&preds);
    assert!((audit.brier_score - 0.01).abs() < 1e-12);
    assert!(audit.ece_10_bins <= 0.10 + 1e-12);
    assert_eq!(audit.structural_empty_band, (0.45, 0.92));

    let rk4_audit = run_sost_rk4_sensitivity_audit();
    assert!(rk4_audit.max_constant_load_diff_pmol_l_up_to_1000d < 1e-3);
    assert!(rk4_audit.max_step_change_load_diff_pmol_l_at_sol_180 > 30.0);
    assert_eq!(rk4_audit.legacy_effective_cap_days, 60.0);

    // Sclerostin RK4 schedule across Sol 180 outage
    let mut schedule = vec![125.0; 180];
    schedule.extend(vec![0.0; 30]);
    let traj = integrate_sclerostin_schedule(22.5, &schedule, 4);
    assert!(traj[179] < 28.0);
    assert!(traj[209] > 60.0);

    // Missing external DLR/OSDR datasets degrade cleanly
    let missing_dir = PathBuf::from("data/external/non_existent_dlr_bundle");
    let dlr = DlrHdbAdapter {
        dlr_hdbr_root: &missing_dir,
    };
    let mut graph = ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph::build_core();
    let outcome = dlr.ingest_with_status(&mut graph).expect("graceful status");
    assert!(matches!(
        outcome.status,
        AdapterStatus::ExternalDatasetNotBundled { .. }
    ));
    assert_eq!(outcome.stats.nodes_added, 0);

    // Real R-R stream (>= 30 NN beats) unlocks RMSSD; < 30 stays None
    let too_short_rr = vec![850.0; 12];
    assert!(compute_verified_time_domain_hrv(&too_short_rr, 30).is_none());
    let realistic_rr: Vec<f64> = (0..60)
        .map(|i| if i % 2 == 0 { 860.0 } else { 900.0 })
        .collect();
    let (rmssd, sdnn, pnn50) =
        compute_verified_time_domain_hrv(&realistic_rr, 30).expect("valid NN stream");
    assert!((rmssd - 40.0).abs() < 1e-9);
    assert!(sdnn > 19.0 && pnn50 == 0.0);

    let _ = compute_musculoskeletal_state_with_policy(
        900,
        125.0,
        Rk4HorizonPolicy::AdaptiveUnbounded { max_dt_days: 0.5 },
    );
    let _ = NasaOsdrOmicsAdapter {
        osdr_root: &missing_dir,
    };
}
