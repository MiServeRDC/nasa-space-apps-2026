use ares_causal_graph::biokg_reasoner::BiomedicalEvidenceDescriptor;
use ares_causal_graph::error::CausalGraphError;
use ares_causal_graph::hemodynamics::{compute_jugular_and_sans_state, compute_tau_w_dyn_cm2};
use ares_causal_graph::hypergraph_spatial::{
    LONGITUDINAL_MEMORY_BUDGET_BYTES, MARS_MISSION_SOLS, MARS_SOL_SECONDS,
    MissionLongitudinalCompactor, PhysiologicalTick, WelfordAccumulator,
};
use ares_causal_graph::mechanotransduction::{
    compute_musculoskeletal_state, irisin_protective_factor, step_sclerostin_rk4,
};
use ares_core_types::telemetry::StressTestScenarioInput;
use core::mem::{align_of, size_of};

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
    fn next_f64(&mut self, min: f64, max: f64) -> f64 {
        let unit = ((self.next_u64() >> 11) as f64) / ((1u64 << 53) as f64);
        min + unit * (max - min)
    }

    #[inline]
    fn next_range_usize(&mut self, upper: usize) -> usize {
        (self.next_u64() % (upper as u64)) as usize
    }
}

fn exact_frost_hargens_sost(y0: f64, ared_load_kgf: f64, total_days: f64) -> f64 {
    let ratio = (11.2 * ared_load_kgf / 1000.0_f64).powf(2.0);
    let y_inf = (18.5 / (1.0 + ratio)) / 0.28;
    y_inf + (y0 - y_inf) * (-0.28 * total_days).exp()
}

#[test]
fn k1_frost_hargens_rk4_richardson_o_h4_convergence_and_conservation() {
    let mut rng = SplitMix64::new(0x5057_0B04_84A1_0001);

    // 1. Richardson step-halving h, h/2, h/4 across 200 randomized physiological parameter sets.
    for trial in 0..200usize {
        let ared_load = rng.next_f64(0.0, 140.0);
        let y0 = rng.next_f64(20.0, 50.0);
        let total_days = 4.0;
        let y_exact = exact_frost_hargens_sost(y0, ared_load, total_days);
        // Ensure trajectory stays strictly inside the [12.0, 95.0] clamp for asymptotic Richardson check.
        if !(13.0..=90.0).contains(&y_exact) {
            continue;
        }

        let integrate = |n_steps: usize| -> f64 {
            let dt = total_days / (n_steps as f64);
            let mut y = y0;
            for _ in 0..n_steps {
                y = step_sclerostin_rk4(y, ared_load, dt);
            }
            (y - y_exact).abs()
        };

        let err_h = integrate(4); // h = 1.0 d
        let err_h2 = integrate(8); // h/2 = 0.5 d
        let err_h4 = integrate(16); // h/4 = 0.25 d

        let ratio_1 = err_h / err_h2.max(1e-16);
        let ratio_2 = err_h2 / err_h4.max(1e-16);

        assert!(
            (14.5..=18.5).contains(&ratio_1),
            "trial {trial}: expected O(h^4) ratio h->h/2 near 16.0, got {ratio_1:.4} (err_h={err_h:.3e}, err_h2={err_h2:.3e})"
        );
        assert!(
            (14.5..=18.5).contains(&ratio_2),
            "trial {trial}: expected O(h^4) ratio h/2->h/4 near 16.0, got {ratio_2:.4} (err_h2={err_h2:.3e}, err_h4={err_h4:.3e})"
        );
        assert!(err_h4 < err_h2 && err_h2 < err_h);
    }

    // 2. Boundedness, conservation, and stimulus-shift monotonicity across 1,000 trials.
    for trial in 0..1_000usize {
        let flight_day = 1 + (rng.next_range_usize(1_000) as u32);
        let low_load = rng.next_f64(0.0, 60.0);
        let high_load = rng.next_f64(110.0, 220.0);

        let st_low = compute_musculoskeletal_state(flight_day, low_load);
        let st_high = compute_musculoskeletal_state(flight_day, high_load);

        for st in [&st_low, &st_high] {
            assert!(st.sclerostin_pmol_l.is_finite());
            assert!(st.mqi_index.is_finite());
            assert!(st.gai_pct.is_finite());
            assert!(st.urinary_calcium_mg_d.is_finite());
            assert!((12.0..=95.0).contains(&st.sclerostin_pmol_l));
            assert!((0.15..=1.0).contains(&st.mqi_index));
            assert!((2.0..=28.0).contains(&st.gai_pct));
            assert!((140.0..=420.0).contains(&st.urinary_calcium_mg_d));
            assert!((0.0..=1.0).contains(&irisin_protective_factor(st.mqi_index)));
        }

        // Higher mechanical loading suppresses SOST and preserves MQI.
        assert!(
            st_high.sclerostin_pmol_l <= st_low.sclerostin_pmol_l + 1e-12,
            "trial {trial}: SOST increased with higher ARED load"
        );
        assert!(
            st_high.mqi_index >= st_low.mqi_index - 1e-12,
            "trial {trial}: MQI dropped with higher ARED load"
        );
    }

    // Non-finite inputs must remain strictly bounded and finite.
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let y = step_sclerostin_rk4(bad, bad, bad);
        assert!(y.is_finite() && (12.0..=95.0).contains(&y));
        let st = compute_musculoskeletal_state(90, bad);
        assert!(st.sclerostin_pmol_l.is_finite() && (12.0..=95.0).contains(&st.sclerostin_pmol_l));
    }
}

#[test]
fn k1_poiseuille_womersley_tau_w_homogeneity_and_1000_monotonicity_trials() {
    let mut rng = SplitMix64::new(0x7A00_C650_8812_0002);

    for trial in 0..1_000usize {
        let vmax = rng.next_f64(0.5, 35.0);
        let csa_small = rng.next_f64(15.0, 70.0);
        let csa_large = csa_small + rng.next_f64(1.0, 80.0);

        let tau = compute_tau_w_dyn_cm2(vmax, csa_small);
        assert!(tau.is_finite() && tau >= 0.0);

        // CGS dimensional homogeneity: tau_w(2*v, A) = 2*tau_w(v, A), tau_w(v, 4*A) = 0.5*tau_w(v, A).
        let tau_2v = compute_tau_w_dyn_cm2(2.0 * vmax, csa_small);
        let tau_4a = compute_tau_w_dyn_cm2(vmax, 4.0 * csa_small);
        assert!(
            (tau_2v - 2.0 * tau).abs() < 1e-11,
            "trial {trial}: velocity scaling failed"
        );
        assert!(
            (tau_4a - 0.5 * tau).abs() < 1e-11,
            "trial {trial}: cross-sectional scaling failed"
        );

        // Cephalad fluid shift / IJV dilation drops wall shear stress monotonically.
        let tau_dilated = compute_tau_w_dyn_cm2(vmax, csa_large);
        assert!(
            tau_dilated <= tau + 1e-12,
            "trial {trial}: shear failed to drop under IJV dilation ({csa_small} -> {csa_large})"
        );

        // Coupled LBNP monotonicity across randomized flight_day, ared_load, and radiation.
        let flight_day = 10 + (rng.next_range_usize(355) as u32);
        let ared_load = rng.next_f64(0.0, 180.0);
        let rad = rng.next_f64(0.0, 4.5);
        let p_low = rng.next_f64(2.0, 18.0);
        let p_high = p_low + rng.next_f64(2.0, 22.0);
        let musculo = compute_musculoskeletal_state(flight_day, ared_load);

        let s_low = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day,
            ared_daily_load_kgf: ared_load,
            radiation_dose_rate_msv_d: rad,
            lbnp_active: true,
            lbnp_pressure_mmhg: -p_low,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 0.0,
        };
        let s_high = StressTestScenarioInput {
            lbnp_pressure_mmhg: -p_high,
            ..s_low.clone()
        };

        let (j_low, sans_low) = compute_jugular_and_sans_state(&musculo, &s_low);
        let (j_high, sans_high) = compute_jugular_and_sans_state(&musculo, &s_high);

        assert!(j_low.tau_w_dyn_cm2.is_finite() && j_low.tau_w_dyn_cm2 >= 0.0);
        assert!(j_high.tau_w_dyn_cm2.is_finite() && j_high.tau_w_dyn_cm2 >= 0.0);
        assert!(j_high.ijv_csa_mm2 <= j_low.ijv_csa_mm2 + 1e-12);
        assert!(j_high.tau_w_dyn_cm2 >= j_low.tau_w_dyn_cm2 - 1e-12);
        assert!(sans_high.sans_risk_index <= sans_low.sans_risk_index + 1e-12);
    }
}

#[test]
fn k1_biomedical_evidence_descriptor_16b_exhaustive_128_bit_seu_chaos() {
    assert_eq!(size_of::<BiomedicalEvidenceDescriptor>(), 16);
    assert_eq!(align_of::<BiomedicalEvidenceDescriptor>(), 16);

    let mut rng = SplitMix64::new(0xB10E_16B0_C808_0003);

    // Exhaustive 128-bit flip injection across multiple randomized descriptors.
    for sample in 0..16usize {
        let d = rng.next_f64(-3.5, 3.5);
        let desc = BiomedicalEvidenceDescriptor::new(
            1 + (rng.next_range_usize(24) as u16),
            3001 + (rng.next_range_usize(10) as u16),
            8867 + (rng.next_range_usize(500) as u16),
            970 + (rng.next_range_usize(1_000) as u16),
            BiomedicalEvidenceDescriptor::cohen_d_to_q8(d),
            10 + (rng.next_range_usize(5_000) as u16),
            1 + (rng.next_range_usize(5) as u8),
            1 + (rng.next_range_usize(8) as u8),
            (rng.next_u64() & 0x1F) as u8,
        );
        assert!(desc.verify_crc().is_ok(), "sample {sample} valid CRC failed");

        for bit_pos in 0..128usize {
            let byte_idx = bit_pos / 8;
            let bit_mask_16 = 1u16 << (bit_pos % 16);
            let bit_mask_8 = 1u8 << (bit_pos % 8);
            let mut corrupted = desc;

            match byte_idx {
                0 | 1 => corrupted.dataset_id ^= bit_mask_16,
                2 | 3 => corrupted.nasa_std_clause_id ^= bit_mask_16,
                4 | 5 => corrupted.biomarker_loinc_code ^= bit_mask_16,
                6 | 7 => corrupted.anatomical_uberon_id ^= bit_mask_16,
                8 | 9 => corrupted.effect_size_cohen_d_q8 ^= bit_mask_16 as i16,
                10 | 11 => corrupted.sample_size_n ^= bit_mask_16,
                12 => corrupted.evidence_grade ^= bit_mask_8,
                13 => corrupted.countermeasure_id ^= bit_mask_8,
                14 => corrupted.deontic_flags ^= bit_mask_8,
                15 => corrupted.reserved_crc ^= bit_mask_8,
                _ => unreachable!(),
            }

            let res = corrupted.verify_crc();
            assert!(
                matches!(res, Err(CausalGraphError::DescriptorCrcMismatch { .. })),
                "sample {sample}: single-bit SEU at bit {bit_pos} (byte {byte_idx}) escaped CRC-8"
            );
        }
    }
}

#[test]
fn k1_welford_and_900_sol_mission_longitudinal_compactor_invariance() {
    let mut rng = SplitMix64::new(0x0900_5015_AE1F_0004);

    // 1. Property-test WelfordAccumulator vs exact two-pass mean/variance + parallel merge.
    for trial in 0..1_000usize {
        let len = 2 + rng.next_range_usize(198);
        let mut samples = Vec::with_capacity(len);
        let mut seq_acc = WelfordAccumulator::new();
        for _ in 0..len {
            let v = rng.next_f64(-1_000.0, 1_000.0);
            samples.push(v);
            assert!(seq_acc.update(v));
        }
        // Reject non-finite values without corrupting accumulator.
        assert!(!seq_acc.update(f64::NAN));
        assert!(!seq_acc.update(f64::INFINITY));
        assert_eq!(seq_acc.count, len as u64);

        let n = len as f64;
        let mean_ref = samples.iter().sum::<f64>() / n;
        let var_ref = samples
            .iter()
            .map(|v| (v - mean_ref).powi(2))
            .sum::<f64>()
            / (n - 1.0);
        assert!(
            (seq_acc.mean - mean_ref).abs() < 1e-9,
            "trial {trial}: Welford mean mismatch"
        );
        assert!(
            (seq_acc.sample_variance() - var_ref).abs() < 1e-6,
            "trial {trial}: Welford variance mismatch"
        );

        let split = len / 2;
        let mut left = WelfordAccumulator::new();
        let mut right = WelfordAccumulator::new();
        for &v in &samples[..split] {
            left.update(v);
        }
        for &v in &samples[split..] {
            right.update(v);
        }
        left.merge(&right);
        assert_eq!(left.count, seq_acc.count);
        assert!((left.mean - seq_acc.mean).abs() < 1e-10);
        assert!((left.sample_variance() - seq_acc.sample_variance()).abs() < 1e-7);
        assert_eq!(left.min_value(), seq_acc.min_value());
        assert_eq!(left.max_value(), seq_acc.max_value());
    }

    // 2. 900-Sol MissionLongitudinalCompactor invariance and < 200 KB footprint verification.
    let mut compactor = MissionLongitudinalCompactor::new(MARS_MISSION_SOLS)
        .unwrap_or_else(|e| panic!("failed to allocate 900-Sol compactor: {e}"));
    let footprint = compactor.memory_footprint_bytes();
    assert!(
        footprint < LONGITUDINAL_MEMORY_BUDGET_BYTES,
        "900-Sol footprint {footprint} exceeded 200 KB limit ({LONGITUDINAL_MEMORY_BUDGET_BYTES})"
    );

    let mut expected_anomalies = Vec::new();
    for sol in 0..MARS_MISSION_SOLS {
        // Observe 12 ticks per Sol spread across warm buckets.
        for slot in 0..12u32 {
            let t = (sol as f64) * MARS_SOL_SECONDS + (slot as f64) * (MARS_SOL_SECONDS / 12.0);
            let is_anomaly = (sol % 150 == 17) && slot == 5;
            let rho = if slot == 0 {
                None
            } else if is_anomaly {
                expected_anomalies.push(sol as u16);
                Some(-0.18)
            } else {
                Some(rng.next_f64(0.10, 0.85))
            };
            let tick = PhysiologicalTick {
                tau_w_dyn_cm2: rng.next_f64(0.9, 3.0),
                sost_pmol_l: rng.next_f64(18.0, 62.0),
                mqi: rng.next_f64(0.45, 0.98),
                sans_index: rng.next_f64(0.08, 0.72),
                rho_global: rho,
            };
            compactor
                .observe(t, &tick)
                .unwrap_or_else(|e| panic!("observe failed on sol {sol} slot {slot}: {e}"));
        }

        // Check warm_rollup == daily_super_nodes()[sol] periodically and on final Sol.
        if sol % 100 == 0 || sol == MARS_MISSION_SOLS - 1 {
            let rollup = compactor.warm_rollup();
            let daily = &compactor.daily_super_nodes()[sol as usize];
            assert_eq!(rollup.tau_w_stats.count, daily.tau_w_stats.count);
            assert!((rollup.tau_w_stats.mean - daily.tau_w_stats.mean).abs() < 1e-11);
            assert!(
                (rollup.tau_w_stats.sample_variance() - daily.tau_w_stats.sample_variance()).abs()
                    < 1e-9
            );
            assert_eq!(rollup.rho_global_stats.count, daily.rho_global_stats.count);
            assert_eq!(rollup.pinned_anomaly, daily.pinned_anomaly);
        }
    }

    assert_eq!(compactor.daily_super_nodes().len(), MARS_MISSION_SOLS as usize);
    let pinned: Vec<u16> = compactor.pinned_anomaly_sols().collect();
    assert_eq!(pinned, expected_anomalies);
    assert!(compactor.memory_footprint_bytes() < 200_000);
}
