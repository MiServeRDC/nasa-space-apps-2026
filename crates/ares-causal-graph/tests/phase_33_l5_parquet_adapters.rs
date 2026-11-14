use ares_causal_graph::bayesian_pocus::audit_bayesian_pocus_structural_bounds;
use ares_causal_graph::dataset_graph::{
    AresUnifiedDatasetGraph, BiolinkPredicate, GraphifyConfidenceTier, PrimeKgCategory,
    UnifiedDatasetNode, UnifiedNodePayload,
};
use ares_causal_graph::error::CausalGraphError;
use ares_causal_graph::mechanotransduction::{
    Rk4HorizonPolicy, compute_musculoskeletal_state, compute_musculoskeletal_state_with_policy,
    integrate_sclerostin_schedule,
};
use ares_causal_graph::parquet_adapters::{
    AdapterStatus, BidmcParquetAdapter, DlrHdbAdapter, NasaOsdrOmicsAdapter,
    PhysioNetWaveformAdapter, compute_verified_time_domain_hrv, parse_wfdb_hea_header,
    verify_file_sha256,
};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("crates dir")
        .parent()
        .expect("repo root")
        .to_path_buf()
}

fn fresh_temp_dir(tag: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "ares_phase33_{tag}_{}_{nanos}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

#[test]
fn l5_bidmc_adapter_verifies_sha256_manifest_and_rejects_mismatch() {
    let bidmc_dir = repo_root().join("data").join("bidmc");
    let mut graph = AresUnifiedDatasetGraph::build_core();
    let base_nodes = graph.node_count();

    let adapter = BidmcParquetAdapter {
        bundled_bidmc_dir: &bidmc_dir,
        external_bidmc_dir: None,
        window_seconds: 60,
    };
    let outcome = adapter
        .ingest_with_status(&mut graph)
        .expect("bundled bidmc SHA-256 verification and ingestion must succeed");
    assert!(matches!(
        outcome.status,
        AdapterStatus::BundledAndVerified {
            files_verified: 3,
            manifest_sha256_verified: true,
        }
    ));
    assert_eq!(outcome.stats.slices_parsed, 27);
    assert_eq!(graph.node_count(), base_nodes + 27);

    // Numeric-only BIDMC slices must strictly preserve beat_intervals_present = false.
    for slice in graph.time_window_slice_nodes() {
        if let UnifiedNodePayload::TimeWindowSlice {
            beat_intervals_present,
            extra_channels,
            ..
        } = &slice.payload
        {
            assert!(!beat_intervals_present);
            assert!(extra_channels.is_empty());
        }
    }

    // Tampered expected SHA-256 must fail with ManifestChecksumMismatch.
    let bidmc01 = bidmc_dir.join("bidmc_01_Numerics.csv");
    let mismatch = verify_file_sha256(&bidmc01, &"0".repeat(64));
    assert!(matches!(
        mismatch,
        Err(CausalGraphError::ManifestChecksumMismatch { .. })
    ));
}

#[test]
fn l5_missing_external_datasets_degrade_to_external_not_bundled_with_zero_synthetic_nodes() {
    let missing = PathBuf::from("data/external/does_not_exist_phase33");
    let mut graph = AresUnifiedDatasetGraph::build_core();
    let baseline_nodes = graph.node_count();
    let baseline_edges = graph.edge_count();

    let physionet = PhysioNetWaveformAdapter {
        physionet_root: &missing,
        window_seconds: 60,
    };
    let p_out = physionet.ingest_with_status(&mut graph).expect("graceful");
    assert!(matches!(
        p_out.status,
        AdapterStatus::ExternalDatasetNotBundled { .. }
    ));
    assert_eq!(p_out.stats.nodes_added, 0);

    let osdr = NasaOsdrOmicsAdapter {
        osdr_root: &missing,
    };
    let o_out = osdr.ingest_with_status(&mut graph).expect("graceful");
    assert!(matches!(
        o_out.status,
        AdapterStatus::ExternalDatasetNotBundled { .. }
    ));
    assert_eq!(o_out.stats.nodes_added, 0);

    let dlr = DlrHdbAdapter {
        dlr_hdbr_root: &missing,
    };
    let d_out = dlr.ingest_with_status(&mut graph).expect("graceful");
    assert!(matches!(
        d_out.status,
        AdapterStatus::ExternalDatasetNotBundled { .. }
    ));
    assert_eq!(d_out.stats.nodes_added, 0);

    assert_eq!(graph.node_count(), baseline_nodes);
    assert_eq!(graph.edge_count(), baseline_edges);
}

#[test]
fn l5_physionet_fantasia_rr_hrv_threshold_wfdb_osdr_and_dlr_ingestion() {
    let tmp = fresh_temp_dir("multi_agency");

    // 1. PhysioNet Fantasia (>= 30 NN beats in window 0, < 30 NN beats in window 1) + WFDB .hea
    let fantasia_dir = tmp.join("physionet").join("fantasia");
    fs::create_dir_all(&fantasia_dir).expect("mkdir fantasia");
    let hea_content = "f1y01 2 250 1800000\nf1y01.dat 16 1000/mV 16 0 12 -140 0 RESP\nf1y01.dat 16 1000/mV 16 0 44 210 0 ECG\n";
    fs::write(fantasia_dir.join("f1y01.hea"), hea_content).expect("write hea");
    let parsed_hea = parse_wfdb_hea_header("f1y01.hea", hea_content).expect("valid hea");
    assert_eq!(parsed_hea.record_name, "f1y01");
    assert_eq!(parsed_hea.num_signals, 2);
    assert!((parsed_hea.sampling_frequency_hz - 250.0).abs() < 1e-9);

    let mut rr_tsv = String::from("time_s\trr_ms\n");
    for i in 0..60 {
        let t = (i as f64) * 0.88;
        let rr = if i % 2 == 0 { 860.0 } else { 900.0 };
        rr_tsv.push_str(&format!("{t:.3}\t{rr:.1}\n"));
    }
    for i in 0..10 {
        let t = 60.0 + (i as f64) * 0.90;
        rr_tsv.push_str(&format!("{t:.3}\t900.0\n"));
    }
    fs::write(fantasia_dir.join("f1y01.rr.tsv"), rr_tsv).expect("write fantasia rr");

    // CEBS & PPG-DaLiA summaries
    let cebs_dir = tmp.join("physionet").join("cebs");
    fs::create_dir_all(&cebs_dir).expect("mkdir cebs");
    fs::write(
        cebs_dir.join("b001.csv"),
        "time_s,hr_bpm,resp_brpm,scg_dv_mg\n0.0,68.0,14.0,12.5\n1.0,69.0,15.0,13.1\n",
    )
    .expect("write cebs");

    let dalia_dir = tmp.join("physionet").join("ppg_dalia");
    fs::create_dir_all(&dalia_dir).expect("mkdir dalia");
    fs::write(
        dalia_dir.join("S1.csv"),
        "time_s,hr_bpm,imu_rms_g\n0.0,74.0,0.08\n1.0,75.0,0.12\n",
    )
    .expect("write dalia");

    // 2. NASA OSDR OSD-571 DGE table
    let osd_571_dir = tmp.join("osdr").join("OSD-571");
    fs::create_dir_all(&osd_571_dir).expect("mkdir osdr");
    fs::write(
        osd_571_dir.join("dge_cfrna.tsv"),
        "symbol\thgnc_curie\tlog2_fold_change\tadj_p_value\nSOST\tHGNC:13771\t1.92\t0.001\nVEGFA\tHGNC:12680\t1.41\t0.004\n",
    )
    .expect("write osdr");

    // 3. DLR :envihab AGBRESA HDBR table
    let agbresa_dir = tmp.join("dlr_hdbr").join("agbresa");
    fs::create_dir_all(&agbresa_dir).expect("mkdir agbresa");
    fs::write(
        agbresa_dir.join("agbresa_sans.csv"),
        "subject_id,day,onsd_mm,choroidal_delta_um,ijv_csa_mm2,lbnp_mmhg\nSUBJ01,30,5.8,34.0,82.0,-25.0\n",
    )
    .expect("write dlr");

    let mut graph = AresUnifiedDatasetGraph::build_core();

    let p_outcome = PhysioNetWaveformAdapter {
        physionet_root: &tmp.join("physionet"),
        window_seconds: 60,
    }
    .ingest_with_status(&mut graph)
    .expect("physionet ingest");
    assert!(matches!(
        p_outcome.status,
        AdapterStatus::BundledAndVerified { .. }
    ));

    let win0 = graph
        .node_by_id("slice_fantasia_f1y01_w_00000_00060")
        .expect("fantasia window 0 present");
    match &win0.payload {
        UnifiedNodePayload::TimeWindowSlice {
            beat_intervals_present,
            extra_channels,
            ..
        } => {
            assert!(*beat_intervals_present);
            let rmssd = extra_channels.get("rmssd_ms").expect("rmssd_ms populated");
            assert!((rmssd.mean - 40.0).abs() < 1e-6);
            assert!(extra_channels.contains_key("sdnn_ms"));
            assert!(extra_channels.contains_key("pnn50_pct"));
        }
        other => panic!("unexpected payload: {other:?}"),
    }

    let win1 = graph
        .node_by_id("slice_fantasia_f1y01_w_00060_00120")
        .expect("fantasia window 1 present");
    match &win1.payload {
        UnifiedNodePayload::TimeWindowSlice {
            beat_intervals_present,
            extra_channels,
            ..
        } => {
            assert!(!*beat_intervals_present);
            assert!(!extra_channels.contains_key("rmssd_ms"));
        }
        other => panic!("unexpected payload: {other:?}"),
    }

    let o_outcome = NasaOsdrOmicsAdapter {
        osdr_root: &tmp.join("osdr"),
    }
    .ingest_with_status(&mut graph)
    .expect("osdr ingest");
    assert!(matches!(
        o_outcome.status,
        AdapterStatus::BundledAndVerified { .. }
    ));
    let cohort_571 = graph
        .node_by_id("cohort_osd_571")
        .expect("OSD-571 cohort node upserted");
    assert_eq!(cohort_571.category, PrimeKgCategory::SubjectCohort);

    let d_outcome = DlrHdbAdapter {
        dlr_hdbr_root: &tmp.join("dlr_hdbr"),
    }
    .ingest_with_status(&mut graph)
    .expect("dlr ingest");
    assert!(matches!(
        d_outcome.status,
        AdapterStatus::BundledAndVerified { .. }
    ));
    let dlr_slice = graph
        .node_by_id("slice_dlr_agbresa_subj01_hdbr_d30_d31")
        .expect("dlr slice present");
    match &dlr_slice.payload {
        UnifiedNodePayload::TimeWindowSlice { extra_channels, .. } => {
            assert!((extra_channels["onsd_mm"].mean - 5.8).abs() < 1e-9);
            assert!((extra_channels["choroidal_delta_um"].mean - 34.0).abs() < 1e-9);
        }
        other => panic!("unexpected payload: {other:?}"),
    }

    assert!(compute_verified_time_domain_hrv(&[850.0; 29], 30).is_none());

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn l5_parquet_extension_gates_honestly_without_fabricating_rows() {
    let tmp = fresh_temp_dir("parquet_gate");
    let agbresa = tmp.join("agbresa");
    fs::create_dir_all(&agbresa).expect("mkdir agbresa");
    fs::write(agbresa.join("dummy.parquet"), b"NOT_PARQUET").expect("write dummy parquet");

    let mut graph = AresUnifiedDatasetGraph::build_core();
    let res = DlrHdbAdapter {
        dlr_hdbr_root: &tmp,
    }
    .ingest_with_status(&mut graph);

    #[cfg(not(feature = "parquet-ingest"))]
    assert!(matches!(
        res,
        Err(CausalGraphError::ParquetFeatureDisabled { .. })
    ));
    #[cfg(feature = "parquet-ingest")]
    assert!(matches!(res, Err(CausalGraphError::ColumnarParse { .. })));

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn l5_adaptive_rk4_900_sol_schedule_and_pocus_structural_audit() {
    let legacy = compute_musculoskeletal_state(900, 0.0);
    let bounded = compute_musculoskeletal_state_with_policy(
        900,
        0.0,
        Rk4HorizonPolicy::Bounded60DaysLegacy,
    );
    assert_eq!(legacy, bounded);

    let adaptive = compute_musculoskeletal_state_with_policy(
        900,
        0.0,
        Rk4HorizonPolicy::AdaptiveUnbounded { max_dt_days: 0.5 },
    );
    assert!((legacy.sclerostin_pmol_l - adaptive.sclerostin_pmol_l).abs() < 1e-3);

    // 900-Sol Mars conjunction schedule with ARED failure at Sol 180 -> recovery at Sol 240.
    let mut schedule = vec![125.0; 180];
    schedule.extend(vec![0.0; 60]);
    schedule.extend(vec![125.0; 660]);
    assert_eq!(schedule.len(), 900);
    let traj = integrate_sclerostin_schedule(22.5, &schedule, 4);
    assert_eq!(traj.len(), 900);
    assert!(traj[179] < 28.0);
    assert!(traj[239] > 60.0);
    assert!(traj[899] < 28.0);

    let audit = audit_bayesian_pocus_structural_bounds();
    assert!(audit.empty_gap_invariants_hold);
    assert_eq!(audit.uncalibrated_empty_gap, (0.45, 0.92));
    assert!(audit.pre_pocus_max_observed <= 0.45);
    assert!(audit.post_pocus_min_observed >= 0.92);
    assert!(audit.post_pocus_max_observed <= 0.995);
    assert_eq!(audit.grid_samples_evaluated, 9 * 6 * 6 * 2);
}

#[test]
fn l5_dataset_graph_upsert_node_and_link_nodes_preserve_core_counts() {
    let mut graph = AresUnifiedDatasetGraph::build_from_repo_root(&repo_root())
        .expect("build_from_repo_root must succeed");
    let initial_nodes = graph.node_count();
    let initial_edges = graph.edge_count();
    assert_eq!(initial_nodes, 110);
    assert_eq!(initial_edges, 326);

    let custom_node = UnifiedDatasetNode {
        id: "cohort_custom_l5".to_string(),
        label: "L5 Custom Cohort".to_string(),
        category: PrimeKgCategory::SubjectCohort,
        ontology_curie: Some("OSDR:CUSTOM".to_string()),
        file_type: PrimeKgCategory::SubjectCohort
            .graphify_file_type()
            .to_string(),
        source_file: "tests/phase_33_l5_parquet_adapters.rs".to_string(),
        source_location: None,
        community_id: 0,
        descriptor: None,
        payload: UnifiedNodePayload::SubjectCohort {
            dataset_code: "OSD-571".to_string(),
            cohort_id: "CUSTOM".to_string(),
            subject_count: 12,
            duration_days: 30.0,
            accession_alias: None,
        },
    };
    graph.upsert_node(custom_node.clone());
    assert_eq!(graph.node_count(), initial_nodes + 1);

    // Upserting the same ID updates payload in place without duplicating nodes.
    graph.upsert_node(custom_node);
    assert_eq!(graph.node_count(), initial_nodes + 1);

    graph
        .link_nodes(
            "cohort_custom_l5",
            "gene_sost",
            BiolinkPredicate::ShowsEffectSize,
            GraphifyConfidenceTier::Extracted,
            1.5,
            "OSD-571",
            "tests/phase_33_l5_parquet_adapters.rs",
        )
        .expect("link_nodes should succeed");
    assert_eq!(graph.edge_count(), initial_edges + 1);

    let err = graph.link_nodes(
        "non_existent_node",
        "gene_sost",
        BiolinkPredicate::ShowsEffectSize,
        GraphifyConfidenceTier::Extracted,
        1.0,
        "OSD-571",
        "tests/phase_33_l5_parquet_adapters.rs",
    );
    assert!(matches!(err, Err(CausalGraphError::UnknownNode(_))));
}
