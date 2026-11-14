# Piano Implementativo Definitivo — Fase 25 (K1): Mathematical, Dimensional & Property-Based Verification Suite (`proptest` / Algebraic Invariants Across ODEs, STL, Timestral Quantiles & Binary Layouts)

- **Blocco Architetturale**: Blocco K (*System-Wide Testing, Chaos Engineering, Contract E2E & `NASA-STD-3001` Certification*, Fasi 25–28)
- **Fase**: Fase 25 (`K1`)
- **Stato**: `PLANNED (READY FOR EXECUTION)`
- **Architettura Master di Blocco**: [`BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md`](BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md)
- **Crate Target**: `crates/ares-core-types`, `crates/ares-causal-graph`, `crates/ares-nqs-stl`, `crates/ares-telemetry-ingest`
- **Piani & Studi di Riferimento**: [`phase_05_C1`](phase_05_C1_frost_hargens_rk4_sclerostin_mqi_and_gai_plan.md), [`phase_06_C2`](phase_06_C2_jugular_shear_stress_lbnp_dose_response_and_sans_plan.md), [`phase_08_D1`](phase_08_D1_nqs_stl_normalizer_and_lemire_o1_sliding_window_plan.md), [`phase_15_H1`](phase_15_H1_timestral_patch_scaler_rope_backbone.md), [`phase_16_H2`](phase_16_H2_dhf_monotone_quantiles_conformal_gate.md), [`phase_19_I2`](phase_19_I2_biokg_16byte_descriptor_epistemic_reasoner.md), [`phase_21_J1`](phase_21_J1_zero_copy_binary_ipc_shm_protocol.md), [`phase_24_J4`](phase_24_J4_asterinas_framekernel_hubris_wearable_targets.md)
- **Owner Principale**: `@fabiomalagutti27-droid` (con verifica `@MiServeRDC` e `@LelloXV`)
- **File Target Previsti**:
  1. `crates/ares-core-types/tests/prop_binary_abi_invariants.rs` *(NEW — test `proptest` su `BinaryTelemetryFrame` `128 B` & bitmask nullabilita)*
  2. `crates/ares-causal-graph/tests/prop_ode_hemodynamics_biokg.rs` *(NEW — test Richardson RK4, omogeneita dimensionale $\tau_w(t)$, Welford `M2` e `BiomedicalEvidenceDescriptor` `16 B`)*
  3. `crates/ares-nqs-stl/tests/prop_stl_and_timestral_quantiles.rs` *(NEW — `10,000` traiettorie avverse su `QuantileHead`, `LemireMinWedge` vs oracolo $O(W)$, `CausalScaler` `asinh`/`sinh`)*
  4. `crates/ares-telemetry-ingest/tests/prop_wearable_packet_roundtrip.rs` *(NEW — test `proptest` su `WearableSensorPacket` `32 B` CRC-16-CCITT)*
- **Budget Esecuzione & Copertura**:
  - **Casi Property-Based `proptest`**: `10,000` traiettorie randomizzate per `QuantileHead`, `>= 1,000` campioni per ABI binarie, RK4, Poiseuille-Womersley e `LemireMinWedge`
  - **Tempo Totale Suite K1**: $< 4.0\text{ s}$ in profilo `--release` / $< 12.0\text{ s}$ in profilo `debug` con `RUST_TEST_THREADS=1`
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()` / `.expect()` nel codice di produzione (`crates/*/src/`); le asserzioni di proprieta risiedono esclusivamente in `tests/` (`dev-dependencies`: `proptest = "1.5"`). Zero emoji.

---

## 1. Executive Summary & Scientific / Open-Source Grounding

### 1.1 Obiettivo: Passare dai Test Puntuali alla Falsificazione Algebrica Continua
I test unitari puntuali verificano singoli scenari nominali o critici noti a priori, ma non coprono gli angoli dello spazio degli stati introdotti da input estremi, passi temporali variabili, sequenze di campionamento irregolari con canali `Option<f64>::None` e serializzazioni binarie cross-crate.

La **Fase 25 (`K1`)** istituisce una suite di **verifica matematica, dimensionale e property-based** basata su *QuickCheck / `proptest`* e *Differential Oracle Testing* che falsifica sistematicamente quattro famiglie di invarianti critici:
1. **Convergenza Numerica ODE & Limiti di Conservazione (`ares-causal-graph`):** Verifica dell'ordine di convergenza $O(h^4)$ di `step_sclerostin_rk4` mediante estrapolazione di Richardson (*step-halving* $h \to h/2 \to h/4$), stabilita nell'equilibrio analitico di Frost-Hargens e conservazione dei limiti biologici (`[12.0, 95.0] pmol/L`, `mqi_index` in `[0.15, 1.0]`, `gai_pct` in `[2.0, 28.0]`).
2. **Omogeneita Dimensionale & Monotonicita Emodinamica (`ares-causal-graph`):** Verifica dell'esattezza dimensionale CGS di `compute_tau_w_dyn_cm2` ($\text{dyn/cm}^2 = \text{g}\cdot\text{cm}^{-1}\cdot\text{s}^{-2}$), della monotonicita di $\tau_w(t)$ rispetto a $v_{\max}$ e $\text{IJV\_CSA}$, e dell'invarianza dell'accumulatore online `WelfordAccumulator` rispetto alla varianza di riferimento a doppio passaggio su sequenze casuali.
3. **Algebricita Non-Crossing `Timestral` & Oracolo `LemireMinWedge` (`ares-nqs-stl`):** Falsificazione su **`10,000` traiettorie avverse** (inclusi `NaN`, `±Inf`, scale estreme $\pm 10^{12}$, e `spread_scale_gamma` variabile) dell'invariante rigoroso $q_{0.05}(t+\tau) \le q_{0.50}(t+\tau) \le q_{0.95}(t+\tau)$ di `QuantileHead`, oltre alla verifica differenziale passo-passo di `LemireMinWedge` contro un oracolo esatto $O(W)$ e della biunivocita `CausalScaler` ($\sinh(\operatorname{asinh}(z)) \approx z$).
4. **Invarianti ABI & Roundtrip Endianness (`ares-core-types`, `ares-causal-graph`, `ares-telemetry-ingest`):** Verifica compile-time e runtime di layout, allineamento, checksum e preservazione bit-esatta di `Option<f64>::None` per:
   - `BiomedicalEvidenceDescriptor` (`16 B`, `align(16)`, `CRC-8-CCITT` `0x07`);
   - `WearableSensorPacket` (`32 B`, `align(4)`, `CRC-16-CCITT` `0x1021`);
   - `BinaryTelemetryFrame` (`128 B`, `align(64)`, `validity_mask` e `CRC-32C`).

### 1.2 Riferimenti Scientifici, Standard & Repository Pubblici

| Fonte / Repository / Standard | Riferimento Bibliografico / URL & Licenza | Contributo Specifico alla Fase 25 (`K1`) |
| :--- | :--- | :--- |
| **`proptest-rs/proptest`** | `https://github.com/proptest-rs/proptest` (`MIT OR Apache-2.0`); Claessen & Hughes, *ACM ICFP 2000* (*QuickCheck*, `DOI: 10.1145/351240.351266`) | Generazione di strategie stocastiche con *shrinking* strutturale per falsificare `QuantileHead`, `LemireMinWedge`, ODE RK4 e frame binari con il controesempio minimale. |
| **Richardson (1911) & Butcher (2016)** | L. F. Richardson, *Phil. Trans. R. Soc. Lond. A* 210:307–357 (1911); J. C. Butcher, *Numerical Methods for Ordinary Differential Equations* (3rd ed., Wiley, 2016, `ISBN: 978-1-119-12150-3`) | Stima asintotica dell'errore globale e locale $O(h^4)$ del solutore Runge-Kutta classico a 4 stadi mediante dimezzamento del passo (*step-halving*). |
| **Pimentel et al. (2017) & Frost (2003)** | `DOI: 10.1109/TBME.2016.2613124` (`BIDMC`); Frost, *Anat. Rec.* 275A(2):1081–1101 (2003, `DOI: 10.1002/ar.a.10119`); Robling et al., *JBC* 2008 (`DOI: 10.1074/jbc.M705092200`) | Validazione dei limiti fisici del meccanostato ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$) e delle serie `Option<f64>::None` senza imputazione a zero. |
| **Donzé, Ferrère & Maler (2013) & Lemire (2006)** | CAV 2013 (`DOI: 10.1007/978-3-642-39799-8_19`); Lemire, *Nordic J. Comput.* 13(4):328–339 (2006, `arXiv:cs/0610046`) | Oracolo differenziale per l'operatore temporale $\Box_{[t-W,t]}$ del cuneo monotono `LemireMinWedge`. |
| **Gasthaus et al. (AISTATS 2019) & Mistral `Timestral` (2026)** | PMLR Vol. 89, pp. 1901–1910; `mistralai/timestral` Technical Report (2026) | Verifica dell'invariante algebrico di non-incrocio quantilico tramite accumulazione triangolare $\operatorname{softplus}$. |
| **NASA-STD-7009B (2024)** | *Standard for Models and Simulations*, NASA Technical Standard (`https://standards.nasa.gov/standard/NASA/NASA-STD-7009`) | Requisiti formali di *Verification, Validation, and Uncertainty Quantification (VVUQ)* per modelli numerici aerospaziali. |

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

### 2.1 Strategia di Isolamento & Determinismo dei Semi
- **Nessuna Modifica al Runtime di Produzione:** Tutti i test di Fase 25 risiedono in `crates/*/tests/` e usano `proptest` configurato con `ProptestConfig::with_cases(10_000)` per i quantili e `ProptestConfig::with_cases(1_000)` per ODE/ABI, con seed deterministico riproducibile in CI tramite `PROPTEST_RNG_SEED` o file `.proptest-regressions`.
- **Differential Oracle Pattern:** Gli algoritmi ottimizzati $O(1)$ (`LemireMinWedge`, `WelfordAccumulator`) sono confrontati contro implementazioni brute-force matematicamente banali $O(W)$ / two-pass all'interno dei test, rendendo impossibile l'errore silenzioso di ottimizzazione.

### 2.2 Tabella File Target

| File di Test | Crate | Responsabilita di Verifica nella Fase 25 (`K1`) |
| :--- | :--- | :--- |
| `crates/ares-core-types/tests/prop_binary_abi_invariants.rs` | `ares-core-types` | Verifica `size_of == 128`, `align_of == 64`, roundtrip little-endian di `BinaryTelemetryFrame`, conservazione `None`/`NaN` tramite `validity_mask`, e `SeqlockTelemetryRing`. |
| `crates/ares-causal-graph/tests/prop_ode_hemodynamics_biokg.rs` | `ares-causal-graph` | Verifica Richardson $O(h^4)$ su `step_sclerostin_rk4`, omogeneita dimensionale `compute_tau_w_dyn_cm2`, monotonicita `LBNP` $\to$ stasi venosa, varianza `WelfordAccumulator` e `BiomedicalEvidenceDescriptor` (`16 B`, CRC-8). |
| `crates/ares-nqs-stl/tests/prop_stl_and_timestral_quantiles.rs` | `ares-nqs-stl` | Esegue `10,000` traiettorie avverse su `QuantileHead::project_seven_quantiles` e `project_denormalized_triplet`, `CausalScaler` `asinh`/`sinh` e oracolo `LemireMinWedge`. |
| `crates/ares-telemetry-ingest/tests/prop_wearable_packet_roundtrip.rs` | `ares-telemetry-ingest` | Verifica `size_of == 32` di `WearableSensorPacket`, roundtrip `CRC-16-CCITT`, e invarianza `BEAT_INTERVALS_NOT_AVAILABLE` su `to_biometrics`. |

---

## 3. Invarianti Matematici e Limiti Formali Sottoposti a Falsificazione

### 3.1 Estrapolazione di Richardson & Equilibrio di Frost-Hargens (`step_sclerostin_rk4`)
Data l'ODE della Sclerostina (`crates/ares-causal-graph/src/mechanotransduction.rs`):
$$\frac{d[\text{SOST}]}{dt} = f(y, F_{\text{ARED}}) = k_{\text{prod}} \cdot \frac{1}{1 + \left(\frac{11.2 \cdot F_{\text{ARED}}}{1000.0}\right)^2} - k_{\text{deg}} \cdot y$$
con soluzione analitica esatta per carico costante $F_{\text{ARED}}$ e stato iniziale $y_0$ interno ai clamp `[12.0, 95.0]`:
$$y_{\text{exact}}(t) = y_{\infty} + (y_0 - y_{\infty}) e^{-k_{\text{deg}} t}, \qquad y_{\infty} = \frac{k_{\text{prod}}}{k_{\text{deg}}} \cdot \frac{1}{1 + \left(\frac{11.2 \cdot F_{\text{ARED}}}{1000.0}\right)^2}$$
Per passi di integrazione $h$, $h/2$ e $h/4$ su $T = 1.0\text{ d}$ (senza saturazione ai clamp):
$$E(h) = \big|y_{\text{RK4}}(T; h) - y_{\text{exact}}(T)\big|, \qquad \frac{E(h)}{E(h/2)} \ge 14.5 \;\; (\text{convergenza teorica } 2^4 = 16)$$
Inoltre, il vincolo di conservazione e stabilita impone $\forall F_{\text{ARED}} \ge 0,\ \text{fd} \in [1, 1000]$:
$$12.0 \le [\text{SOST}] \le 95.0, \qquad 0.15 \le \text{MQI} \le 1.0, \qquad 2.0 \le \text{GAI}_{0.38g} \le 28.0$$

### 3.2 Omogeneita Dimensionale & Monotonicita Venosa (`hemodynamics.rs`)
Per `compute_tau_w_dyn_cm2(vmax_cm_s, ijv_csa_mm2)`:
1. **Invarianza di Scala Geometrica:** Raddoppiando la velocita $v_{\max} \mapsto 2 v_{\max}$ a $\text{CSA}$ costante ($\ge 5\text{ mm}^2$), $\tau_w$ raddoppia esattamente ($\tau_w(2v, A) = 2\,\tau_w(v, A)$ entro $10^{-12}$); quadruplicando l'area $\text{CSA} \mapsto 4\cdot\text{CSA}$ (raddoppiando il raggio equivalente $r \mapsto 2r$), $\tau_w$ si dimezza esattamente ($\tau_w(v, 4A) = \frac{1}{2}\,\tau_w(v, A)$).
2. **Monotonicita della Transizione di Stasi sotto `LBNP`:** A parita di `mqi_index` e `radiation_dose_rate_msv_d`, aumentando la depressione $|P_{\text{LBNP}}| \in [0, 36]\text{ mmHg}$, si verifica $\frac{\partial\,\text{ijv\_csa}}{\partial |P_{\text{LBNP}}|} \le 0$, $\frac{\partial\,v_{\max}}{\partial |P_{\text{LBNP}}|} \ge 0$ e conseguentemente $\frac{\partial\,\tau_w}{\partial |P_{\text{LBNP}}|} \ge 0$ e $\frac{\partial\,\text{SANS\_Risk}}{\partial |P_{\text{LBNP}}|} \le 0$ (fino a saturazione ai clamp).

### 3.3 Non-Incrocio Quantilico Algebrico (`QuantileHead`, 10,000 Traiettorie)
Per qualsiasi vettore di logit $\mathbf{z} \in (\mathbb{R} \cup \{\pm\infty, \text{NaN}\})^7$, qualsiasi `spread_scale_gamma` $> 0$, e qualsiasi statistica causale `ChannelCausalStats`:
$$q_{0.01} \le q_{0.05} \le q_{0.25} \le q_{0.50} \le q_{0.75} \le q_{0.95} \le q_{0.99}$$
e ciascun quantile e finito (`is_finite()`). L'invarianza si mantiene anche dopo denormalizzazione $\hat{X} = \mu + \sigma \sinh(\hat{y})$ e applicazione del padding conforme $\ge 0$ su tutti e 4 gli orizzonti DHF (`+15m`, `+1h`, `+6h`, `+24h`).

### 3.4 Invarianti Strutturali ABI & Nullabilita
| Tipo Rust | `size_of` | `align_of` | Checksum / Integrita | Invariante di Nullabilita |
| :--- | :---: | :---: | :--- | :--- |
| `BiomedicalEvidenceDescriptor` | `16 B` | `16 B` | `CRC-8-CCITT` (`0x07`) su byte `0..15` | `verify_crc()` Ok sse bit-esatto |
| `WearableSensorPacket` | `32 B` | `4 B` | `CRC-16-CCITT` (`0x1021`) su byte `0..30` | `WMASK_RR_INTERVAL == 0` $\implies$ `rmssd_ms: None` + `BeatIntervalsNotAvailable` |
| `BinaryTelemetryFrame` | `128 B` | `64 B` | `magic == 0x4152_4553` + Castagnoli `CRC-32C` (`0x82F63B78`) su byte `0..104` | Bit `0` in `validity_mask` (`u32` @ `24..28`) $\implies$ `None` dopo decode (mai `0.0` su `16x f32` @ `32..96`) |

---

## 4. Concrete Rust Test Signatures & Harness Code

### 4.1 `crates/ares-nqs-stl/tests/prop_stl_and_timestral_quantiles.rs`
```rust
use ares_core_types::MonotoneQuantileTriplet;
use ares_nqs_stl::sliding_window::LemireMinWedge;
use ares_nqs_stl::timestral_backbone::{CausalScaler, ChannelCausalStats};
use ares_nqs_stl::timestral_quantiles::{QuantileHead, stable_softplus};
use proptest::prelude::*;
use std::collections::VecDeque;

fn adversarial_f64() -> impl Strategy<Value = f64> {
    prop_oneof![
        4 => -1e6f64..1e6f64,
        2 => -1e12f64..1e12f64,
        1 => Just(0.0f64),
        1 => Just(f64::NAN),
        1 => Just(f64::INFINITY),
        1 => Just(f64::NEG_INFINITY),
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(10_000))]

    #[test]
    fn prop_dhf_quantile_head_never_crosses_across_10k_adversarial_inputs(
        logits in prop::array::uniform7(adversarial_f64()),
        gamma in 1e-4f64..25.0f64,
        mean in -500.0f64..500.0f64,
        std_dev in 1e-4f64..100.0f64,
        conformal_pad in 0.0f64..2.0f64,
    ) {
        let head = QuantileHead::new_deterministic(32, gamma);
        let q7 = head.project_seven_quantiles(&logits);
        for pair in q7.windows(2) {
            prop_assert!(pair[0].is_finite() && pair[1].is_finite());
            prop_assert!(pair[0] <= pair[1], "Quantile crossing detected: {} > {}", pair[0], pair[1]);
        }

        let scaler = CausalScaler::default();
        let stats = ChannelCausalStats {
            median: mean,
            mad_scale: std_dev,
            observed_ratio: 1.0,
        };
        let triplet: MonotoneQuantileTriplet =
            head.project_denormalized_triplet(&logits, &scaler, stats, conformal_pad);
        prop_assert!(triplet.assert_monotone().is_ok());
        prop_assert!(triplet.q05 <= triplet.q50 && triplet.q50 <= triplet.q95);
    }

    #[test]
    fn prop_lemire_min_wedge_matches_exact_naive_oracle(
        values in prop::collection::vec(-100.0f64..100.0f64, 1..512),
        window_s in 1.0f64..60.0f64,
    ) {
        let mut wedge = LemireMinWedge::new(window_s);
        let mut oracle_window: VecDeque<(f64, f64)> = VecDeque::new();

        for (idx, &val) in values.iter().enumerate() {
            let t = idx as f64;
            let got = wedge.push_and_evaluate(t, val);

            oracle_window.push_back((t, val));
            while let Some(&(t0, _)) = oracle_window.front() {
                if t - t0 > window_s {
                    oracle_window.pop_front();
                } else {
                    break;
                }
            }
            let expected = oracle_window
                .iter()
                .map(|&(_, v)| v)
                .fold(f64::INFINITY, f64::min);

            prop_assert!((got - expected).abs() < 1e-12, "Lemire mismatch at t={t}: got={got} expected={expected}");
        }
    }

    #[test]
    fn prop_stable_softplus_is_strictly_non_negative_and_finite(x in adversarial_f64()) {
        let y = stable_softplus(x);
        prop_assert!(y.is_finite() && y >= 0.0);
    }
}
```

### 4.2 `crates/ares-causal-graph/tests/prop_ode_hemodynamics_biokg.rs`
```rust
use ares_causal_graph::biokg_reasoner::BiomedicalEvidenceDescriptor;
use ares_causal_graph::hemodynamics::{compute_jugular_and_sans_state, compute_tau_w_dyn_cm2};
use ares_causal_graph::hypergraph_spatial::WelfordAccumulator;
use ares_causal_graph::mechanotransduction::{compute_musculoskeletal_state, step_sclerostin_rk4};
use ares_core_types::telemetry::StressTestScenarioInput;
use proptest::prelude::*;

#[test]
fn test_rk4_richardson_step_halving_fourth_order_convergence() {
    let ared_load = 60.0;
    let y0 = 35.0;
    let total_days = 1.0;

    // Soluzione analitica esatta per d[SOST]/dt = k_prod * hill - k_deg * y
    let ratio = (11.2 * ared_load / 1000.0_f64).powf(2.0);
    let y_inf = (18.5 / (1.0 + ratio)) / 0.28;
    let y_exact = y_inf + (y0 - y_inf) * (-0.28 * total_days).exp();

    let integrate = |n_steps: usize| -> f64 {
        let dt = total_days / (n_steps as f64);
        let mut y = y0;
        for _ in 0..n_steps {
            y = step_sclerostin_rk4(y, ared_load, dt);
        }
        (y - y_exact).abs()
    };

    let err_h = integrate(2);
    let err_h2 = integrate(4);
    let order_ratio = err_h / err_h2.max(1e-15);
    assert!(
        order_ratio >= 14.5,
        "Expected RK4 O(h^4) ratio near 16.0, got {order_ratio:.3} (err_h={err_h:.3e}, err_h2={err_h2:.3e})"
    );
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(1_000))]

    #[test]
    fn prop_tau_w_dimensional_scaling_and_lbnp_stasis_monotonicity(
        vmax in 0.5f64..30.0f64,
        csa_mm2 in 20.0f64..150.0f64,
        flight_day in 10u32..365u32,
        ared_load in 0.0f64..180.0f64,
        p_low in 5.0f64..20.0f64,
        p_high in 25.0f64..40.0f64,
    ) {
        let tau1 = compute_tau_w_dyn_cm2(vmax, csa_mm2);
        let tau_2v = compute_tau_w_dyn_cm2(2.0 * vmax, csa_mm2);
        let tau_4a = compute_tau_w_dyn_cm2(vmax, 4.0 * csa_mm2);

        prop_assert!((tau_2v - 2.0 * tau1).abs() < 1e-11);
        prop_assert!((tau_4a - 0.5 * tau1).abs() < 1e-11);

        let musculo = compute_musculoskeletal_state(flight_day, ared_load);
        prop_assert!((12.0..=95.0).contains(&musculo.sclerostin_pmol_l));
        prop_assert!((0.15..=1.0).contains(&musculo.mqi_index));
        prop_assert!((2.0..=28.0).contains(&musculo.gai_pct));

        let s_low = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day,
            ared_daily_load_kgf: ared_load,
            radiation_dose_rate_msv_d: 0.8,
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
        prop_assert!(j_high.ijv_csa_mm2 <= j_low.ijv_csa_mm2 + 1e-12);
        prop_assert!(j_high.tau_w_dyn_cm2 >= j_low.tau_w_dyn_cm2 - 1e-12);
        prop_assert!(sans_high.sans_risk_index <= sans_low.sans_risk_index + 1e-12);
    }

    #[test]
    fn prop_welford_and_biokg_descriptor_16b_invariants(
        samples in prop::collection::vec(-1000.0f64..1000.0f64, 2..200),
        dataset_id in 1u16..24u16,
        cohen_d in -4.0f64..4.0f64,
        sample_n in 1u16..5000u16,
        grade in 1u8..=5u8,
    ) {
        let mut acc = WelfordAccumulator::new();
        for &v in &samples {
            acc.update(v);
        }
        let n = samples.len() as f64;
        let mean_ref = samples.iter().sum::<f64>() / n;
        let var_ref = samples.iter().map(|v| (v - mean_ref).powi(2)).sum::<f64>() / (n - 1.0);
        prop_assert!((acc.mean - mean_ref).abs() < 1e-9);
        prop_assert!((acc.sample_variance() - var_ref).abs() < 1e-7);

        let desc = BiomedicalEvidenceDescriptor::new(
            dataset_id,
            3001,
            8867,
            2005,
            BiomedicalEvidenceDescriptor::cohen_d_to_q8(cohen_d),
            sample_n,
            grade,
            1,
            0x01,
        );
        prop_assert_eq!(core::mem::size_of::<BiomedicalEvidenceDescriptor>(), 16);
        prop_assert_eq!(core::mem::align_of::<BiomedicalEvidenceDescriptor>(), 16);
        prop_assert!(desc.verify_crc().is_ok());
    }
}
```

### 4.3 `crates/ares-core-types/tests/prop_binary_abi_invariants.rs` & `prop_wearable_packet_roundtrip.rs`
```rust
// Verifica parametrizzata su BinaryTelemetryFrame (128 B, align 64) e WearableSensorPacket (32 B):
// 1. size_of::<BinaryTelemetryFrame>() == 128 && align_of::<BinaryTelemetryFrame>() == 64
// 2. Per ogni sottoinsieme casuale di bit in validity_mask (16 canali f32 @ 32..96: hr, pulse, resp,
//    spo2, rmssd, mri, crs, sans, ijv_shear_pa, sost_pg_ml, radiation_msv_d, nqs_min_rho,
//    ttv_q05_days, ttv_q50_days, ttv_q95_days, owlt_delay_sec), to_le_bytes() -> from_le_bytes()
//    verifica magic (ARES_BINARY_MAGIC = 0x4152_4553), schema_version (ARES_BINARY_VERSION = 1),
//    Castagnoli crc32c (compute_crc32c @ 104..108) e preserva bit-per-bit Some(v) vs None (nessun fallback a 0.0).
// 3. size_of::<WearableSensorPacket>() == 32 && align_of::<WearableSensorPacket>() == 4;
//    to_le_bytes_with_crc() -> decode_and_verify() e invertibile per qualsiasi (node_id, channel_mask,
//    supervisor_restart_count, hr, spo2, resp, rr, imu_rms_g finito), preservando
//    HrvUnavailableReason::BeatIntervalsNotAvailable quando (channel_mask & WMASK_RR_INTERVAL) == 0.
```

---

## 5. Matrice di Verifica & Criteri di Accettazione (Block K1)

| ID Test / Gate | Comando di Esecuzione | Invariante Verificato | Soglia di Passaggio |
| :--- | :--- | :--- | :--- |
| `K1-01` | `cargo test -p ares-causal-graph --test prop_ode_hemodynamics_biokg` | Richardson $O(h^4)$ RK4 (`ratio >= 14.5`), scaling $\tau_w$, monotonicita `LBNP`, `Welford` vs 2-pass, `BiomedicalEvidenceDescriptor` `16 B` | `100%` pass (`1,000` casi) |
| `K1-02` | `cargo test -p ares-nqs-stl --test prop_stl_and_timestral_quantiles` | `QuantileHead` $q_{0.05} \le q_{0.50} \le q_{0.95}$ su `10,000` traiettorie avverse + oracolo `LemireMinWedge` | `100%` pass (`0` crossing) |
| `K1-03` | `cargo test -p ares-core-types --test prop_binary_abi_invariants` | `BinaryTelemetryFrame` `128 B` / `align(64)`, roundtrip LE e nullabilita `validity_mask` | `100%` pass (`1,000` casi) |
| `K1-04` | `cargo test -p ares-telemetry-ingest --test prop_wearable_packet_roundtrip` | `WearableSensorPacket` `32 B` `CRC-16-CCITT`, invarianza `BEAT_INTERVALS_NOT_AVAILABLE` | `100%` pass (`1,000` casi) |
| `K1-05` | `./scripts/agent_probe.sh --fast` | Zero `.unwrap()` / `.expect()` in `crates/*/src/`, zero warning `clippy -D warnings` | Exit code `0` |
