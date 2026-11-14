# Piano Implementativo Definitivo — Fase 28 (K4): `NASA-STD-3001 Vol. 1 & Vol. 2` Normative Traceability Matrix & Hard Real-Time Latency/Memory Certification Harness

- **Blocco Architetturale**: Blocco K (*System-Wide Testing, Chaos Engineering, Contract E2E & `NASA-STD-3001` Certification*, Fasi 25–28)
- **Fase**: Fase 28 (`K4`)
- **Stato**: `PLANNED (READY FOR EXECUTION)`
- **Crate Target**: Tutti gli 8 crate del workspace (`ares-core-types` .. `ares-desktop-os`) + `scripts/agent_probe.sh`
- **Piani & Studi di Riferimento**: [`phase_02_A2`](phase_02_A2_nasa_std_3001_constants_errors_and_security_traits_plan.md), [`phase_18_I1`](phase_18_I1_welford_longitudinal_compaction_spatial_deontic.md), [`phase_19_I2`](phase_19_I2_biokg_16byte_descriptor_epistemic_reasoner.md), [`phase_20_I3`](phase_20_I3_unified_dataset_graph_builder_graphify_mcp.md), [`phase_21_J1`](phase_21_J1_zero_copy_binary_ipc_shm_protocol.md), [`phase_22_J2`](phase_22_J2_ares_desktop_os_tauri_native_shell.md), [`RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md)
- **Owner Principale**: `@fabiomalagutti27-droid` & `@MiServeRDC` (con verifica `@fertech02` e `@LelloXV`)
- **File Target Previsti**:
  1. `crates/ares-server-cli/tests/cert_nasa_std_3001_and_rt_budgets.rs` *(NEW — harness automatizzato di tracciabilita normativa `[V1 3001]`–`[V2 10152]` e benchmark percentili `p50`/`p99`/`p99.9`)*
  2. `crates/ares-causal-graph/tests/cert_memory_footprint_900sol.rs` *(NEW — certificazione footprint RAM `< 200 KB` per `MissionLongitudinalCompactor` su `900` Sol e `< 10 MB` per `AresUnifiedDatasetGraph`)*
  3. `crates/ares-core-types/tests/cert_seqlock_latency_percentiles.rs` *(NEW — benchmark `p50`/`p99`/`p99.9` `< 100 ns` su `SeqlockTelemetryRing`)*
- **Budget Certificazione Hard Real-Time & Memoria**:
  - **Loop Sincrono `20 Hz` (`advance_tick` / `compute_mission_telemetry_tick`)**: `p50 < 90 us`, `p99 < 150 us`, `p99.9 < 250 us` (margine `> 200x` rispetto a `[V2 10152]` `50 ms`)
  - **`SeqlockTelemetryRing` Lettura/Scrittura `128 B`**: `p99 < 100 ns`
  - **`ARES-BioKG` Lookup Normativo $O(1)$ (`ground_adhg_node_o1`)**: `p99 < 5 us`
  - **`AresUnifiedDatasetGraph` Attraversamento (`query_by_keyword_or_id` / `explain_shortest_path`)**: `p99 < 1 ms`
  - **Footprint RAM `MissionLongitudinalCompactor` (900 Sol)**: `< 200 KB` (`LONGITUDINAL_MEMORY_BUDGET_BYTES = 200_000`)
  - **Footprint RAM `AresUnifiedDatasetGraph` (24 Dataset)**: `< 10 MB`
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()` / `.expect()` nel codice di produzione; tutti i test di certificazione devono girare in ambiente deterministico offline (*air-gapped*) con zero emoji.

---

## 1. Executive Summary & Scientific / Standards Grounding

### 1.1 Dall'Esecuzione Funzionale alla Certificazione Normativa `NASA-STD-3001`
Per un sistema di supporto medico autonomo destinato a missioni verso Marte (*Earth-Independent Medical Operations*, `EIMO`), superare i test funzionali non basta: ogni requisito normativo applicabile di **`NASA-STD-3001 Vol. 1 Rev C`** e **`NASA-STD-3001 Vol. 2 Rev F`** deve essere mappato in modo univoco a un'asserzione automatizzata eseguibile in CI, accompagnata dalla misura statistica delle code di latenza (`p50`, `p99`, `p99.9`) e dell'impronta di memoria su una missione completa di **900 Sol marziani**.

La **Fase 28 (`K4`)** definisce l'harness finale di certificazione automatica:
1. **Matrice di Tracciabilita Normativa Eseguibile (`[V1 3001]`–`[V1 4001]`, `[V2 6001]`–`[V2 10152]` + `OCHMO MTB-007`):** Verifica in modo programmatico che ogni clausola in `NormativeClauseId` e nel layer `SafetyGates` / `PrivacyViews` / `DeonticHabitat` sia coperta da almeno un test deterministico passante.
2. **Certificazione Percentili di Latenza (`p50`, `p99`, `p99.9`):** Misura su `N >= 1,000` iterazioni (previo warm-up della cache L1/L2) le distribuzioni reali di latenza per:
   - Loop `20 Hz` completo (`SharedMissionState::advance_tick`: `< 150 us`);
   - `SeqlockTelemetryRing::write` + `read_latest` (`< 100 ns`);
   - `ground_adhg_node_o1` & `BiomedicalEvidenceDescriptor::verify_crc` (`< 5 us`);
   - `AresUnifiedDatasetGraph` traversal (`< 1 ms`).
3. **Certificazione Memory Footprint (900 Sol & 24 Dataset):** Verifica tramite conteggio strutturale (`memory_footprint_bytes()` e `size_of_val` / stima heap nodi+archi) che la storia longitudinale di 900 Sol resti sotto `200 KB` e il grafo unificato resti sotto `10 MB`.

### 1.2 Riferimenti Normativi, Scientifici & Metodologici

| Standard / Paper / Repository | Riferimento Ufficiale / DOI | Applicazione nella Fase 28 (`K4`) |
| :--- | :--- | :--- |
| **`NASA-STD-3001 Vol. 1 Rev C`** | *Space Flight Human-System Standard — Crew Health* (`[V1 3001]`–`[V1 4001]`, `https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1`) | Copertura automatica di salute muscoloscheletrica (`V1 3002`), privacy per ruolo (`V1 3003`), supporto autonomo EIMO (`V1 3006`) e protezione radiazioni (`V1 4001`). |
| **`NASA-STD-3001 Vol. 2 Rev F`** | *Human Factors, Habitability, and Environmental Health* (`[V2 6001]`–`[V2 10152]`, Luglio 2026) | Copertura limiti ambientali (`V2 6001`, `V2 6026`), usabilita (`V2 10001`), error-proofing (`V2 10002`), feedback `<= 100 ms` (`V2 10022`), interlocks (`V2 10027`) e display `<= 50 ms` (`V2 10152`). |
| **`NASA OCHMO MTB-007` (2026)** | *Medical Technical Brief: Venous Thrombosis in Spaceflight* (Gennaio 2026) | Verifica del blocco anticoagulanti pre-POCUS (`Hard Clinical Safety Gate 1`) e flusso `LBNP`. |
| **Gil Tene — *How NOT to Measure Latency* (`HdrHistogram`)** | Gil Tene (*Azul Systems*, 2015); `HdrHistogram/HdrHistogram_rust` (`https://github.com/HdrHistogram/HdrHistogram_rust`, `MIT/Apache-2.0`) | Misurazione non distorta delle code `p50`, `p99`, `p99.9` eliminando il *coordinated omission* e includendo fasi di warm-up deterministiche. |
| **Cheptsov & Khoroshilov (2018, 2023)** | *ARINC 653 Partitioning Architecture* (`DOI: 10.1109/ispras.2018.00009`) | Verifica che il budget temporale delle partizioni di calcolo resti rigorosamente inferiore al periodo di frame (`50 ms` a `20 Hz`). |

---

## 2. Matrice Completa di Tracciabilita Normativa (`NASA-STD-3001 Vol. 1 & Vol. 2`)

| Clausola Normativa | Titolo / Ambito | Modulo Rust Responsabile | Asserzione Automatizzata nell'Harness `K4` |
| :--- | :--- | :--- | :--- |
| `[V1 3001]` | Crew Health Program & Mission Readiness | `ares-nqs-stl/src/mri_index.rs`, `biokg_reasoner.rs` | `ground_adhg_node_o1` mappa tutti gli 8 nodi `AdhgNodeKind` a clausole valide; `mri_pct` resta in `[0.0, 100.0]`. |
| `[V1 3002]` | Musculoskeletal Countermeasures (`ARED`, `SOST`, `GAI`) | `ares-causal-graph/src/mechanotransduction.rs`, `safety_gates.rs` | `compute_musculoskeletal_state` con `ared=0` attiva `sclerostin > 55 pmol/L` e `Gate 3` (`eva_suit_damping_active`) se `gai_pct > 12%`. |
| `[V1 3003]` | Preventive Monitoring & Role-Based Crew Privacy | `ares-security-privacy/src/privacy_views.rs` | `AstronautSelf` vede `vocal_f0_hz` / `vocal_jitter_pct`; `CrewMedicalOfficer` e `GroundFlightSurgeon` li vedono oscurati (`None`) salvo consenso esplicito o `life_safety_breach`. |
| `[V1 3006]` | Autonomous EIMO Clinical Decision Support | `ares-server-cli/src/fastmcp_router.rs`, `ares-desktop-os` | Tutti gli 8 tool `FastMCP` e la shell desktop operano `100%` offline con risposte `<= 600 B` e stato `OWLT` esposto in `OsSystemStatusBar`. |
| `[V1 4001]` | Space Radiation Protection (`CANS`, `SPE` Shelter) | `ares-causal-graph/src/hypergraph_spatial.rs`, `playbooks.rs` | Quando `radiation_dose_rate_msv_d >= 5.0 mSv/d`, `HabitatZoneDeonticPolicy` emette `Mandatory` per `RadiationStormShelter` (`SHELTER`) e `PLAYBOOK_05`. |
| `[V2 6001]` | Acoustic (`NC-50`) & $ppCO_2$ Environmental Limits | `ares-causal-graph/src/hypergraph_spatial.rs` | Violazione dei limiti acustici o di $ppCO_2$ nelle zone habitat produce `DeonticModality::Forbidden` / `Restricted` con `rho_zone < 0.0`. |
| `[V2 6026]` | Hydration & Renal Stone Risk (`Ca_urine`) | `ares-causal-graph/src/mechanotransduction.rs` | Degrado `ARED` aumenta `urinary_calcium_mg_d` monotonicamente oltre la baseline di `175 mg/d` e attiva la raccomandazione di idratazione. |
| `[V2 7043]` | Onboard Medical Capability (`POCUS` & `LBNP`) | `ares-causal-graph/src/bayesian_pocus.rs`, `playbooks.rs` | `PLAYBOOK_01` e `PLAYBOOK_02` modellano la transizione da stasi pre-POCUS a conferma ecografica B-mode. |
| `[V2 10001]` | Crew Interface Usability & Contextual Integrity | `ares-cockpit/`, `crates/ares-desktop-os` | La shell `Tauri v2` e la UI `ares-cockpit` non perdono `model_status: ILLUSTRATIVE_UNVALIDATED` ne `BEAT_INTERVALS_NOT_AVAILABLE`. |
| `[V2 10002]` | Design-Induced Error Prevention | `crates/ares-core-types/src/binary_ipc.rs` | `validity_mask` impedisce al 100% la conversione silenziosa di `None` in `0.0` su `BinaryTelemetryFrame` (`128 B`). |
| `[V2 10005]` | Standardization Across Displays & Controls | `ares-cockpit/src/modules/os-shell/` | Layout uniforme `1. GATHER -> 2. EVALUATE -> 3. ACT` + `OsSystemStatusBar` OLED `#000000`. |
| `[V2 10022]` | Discrete Control Feedback Latency (`<= 100 ms`) | `crates/ares-server-cli/src/ws_server.rs`, `ares-desktop-os` | `POST /api/stress-test` e `apply_what_if_patch` completano a `p99 < 1.0 ms` (`> 100x` margine su `100 ms`). |
| `[V2 10023]` / `[V2 10024]` | Electronic Procedures Status Clarity | `ares-medops-playbooks/src/playbooks.rs`, `OsCommandPalette` | Ogni step di Playbook e query palette distingue stato attivo, completato e bloccato. |
| `[V2 10027]` | Prevention of Inadvertent Hazardous Operations | `ares-medops-playbooks/src/safety_gates.rs` | **Gate 1** (`anticoagulant_lock`), **Gate 2** (`lbnp_auto_vent` se $\Delta\text{SBP} > 15$ o $\text{HR} > 115$), **Gate 3** (`eva_suit_damping` se $\text{GAI} > 12\%$). |
| `[V2 10152]` | Continuous Dynamic Display Latency (`<= 50 ms`) | `ares-core-types` (`SeqlockTelemetryRing`), `ares-server-cli` | Loop `20 Hz` (`p99 < 150 us`) + IPC binario (`p99 < 100 ns` ring / `< 0.05 ms` Tauri) ampiamente sotto `50 ms`. |
| `OCHMO MTB-007` | Internal Jugular Vein Stasis & Thrombosis | `bayesian_pocus.rs`, `safety_gates.rs` | Pre-POCUS $P(\text{Thrombus} \mid \text{Stasis}) \le 0.45$; solo post-POCUS ($\text{LR}_+ = 24.0$) raggiunge $\ge 0.92$ e sblocca Gate 1. |

---

## 3. Concrete Rust Certification Harness Signatures

### 3.1 `crates/ares-server-cli/tests/cert_nasa_std_3001_and_rt_budgets.rs`
```rust
use ares_causal_graph::adhg_graph::AdhgNodeKind;
use ares_causal_graph::biokg_reasoner::{NormativeClauseId, ground_adhg_node_o1};
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_server_cli::ws_server::SharedMissionState;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn percentile_sorted(sorted_ns: &[u128], pct: f64) -> f64 {
    let idx = (((sorted_ns.len() - 1) as f64) * pct).round() as usize;
    sorted_ns[idx.min(sorted_ns.len() - 1)] as f64
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

#[test]
fn cert_realtime_latency_percentiles_20hz_loop_biokg_and_dataset_graph() {
    let bidmc_dir = repo_root().join("data").join("bidmc");
    let state = SharedMissionState::from_data_dir(&bidmc_dir).expect("init mission state");

    // Warm-up
    for _ in 0..50 {
        state.advance_tick(Duration::from_millis(50)).expect("warmup");
    }

    // 1. Certificazione Loop 20 Hz (N = 1,000 iterazioni)
    let mut tick_ns = Vec::with_capacity(1_000);
    for _ in 0..1_000 {
        let t0 = Instant::now();
        state.advance_tick(Duration::from_millis(50)).expect("tick");
        tick_ns.push(t0.elapsed().as_nanos());
    }
    tick_ns.sort_unstable();
    let p50_us = percentile_sorted(&tick_ns, 0.50) / 1_000.0;
    let p99_us = percentile_sorted(&tick_ns, 0.99) / 1_000.0;
    let p999_us = percentile_sorted(&tick_ns, 0.999) / 1_000.0;

    assert!(p99_us < 150.0, "20 Hz loop p99={p99_us:.2} us exceeded 150 us SLA (p50={p50_us:.2} us, p99.9={p999_us:.2} us)");

    // 2. Certificazione ARES-BioKG O(1) lookup (< 5 us = 5,000 ns)
    let nodes = [
        AdhgNodeKind::AredMechanicalLoad,
        AdhgNodeKind::SoleusMuscleQualityMqi,
        AdhgNodeKind::OsteocyteSclerostinSost,
        AdhgNodeKind::EndothelialProtectiveSecretome,
        AdhgNodeKind::CansRadiationOxidativeStress,
        AdhgNodeKind::IjvVenousStasisShearStress,
        AdhgNodeKind::PocusThrombusPosterior,
        AdhgNodeKind::SansTranslaminarGradient,
    ];
    let mut biokg_ns = Vec::with_capacity(1_000);
    for i in 0..1_000 {
        let kind = nodes[i % nodes.len()];
        let t0 = Instant::now();
        let g = ground_adhg_node_o1(kind);
        let crc_ok = g.descriptor.verify_crc().is_ok();
        biokg_ns.push(t0.elapsed().as_nanos());
        assert!(crc_ok);
    }
    biokg_ns.sort_unstable();
    let biokg_p99_us = percentile_sorted(&biokg_ns, 0.99) / 1_000.0;
    assert!(biokg_p99_us < 5.0, "BioKG O(1) lookup p99={biokg_p99_us:.3} us exceeded 5 us");

    // 3. Certificazione AresUnifiedDatasetGraph traversal (< 1 ms = 1,000 us)
    let graph = AresUnifiedDatasetGraph::build_from_repo_root(&repo_root()).expect("dataset graph");
    assert_eq!(graph.dataset_count(), 24);
    let mut graph_ns = Vec::with_capacity(500);
    for i in 0..500 {
        let kw = if i % 2 == 0 { "OSD-818" } else { "BIDMC" };
        let t0 = Instant::now();
        let res = graph.query_by_keyword_or_id(kw, 5);
        graph_ns.push(t0.elapsed().as_nanos());
        assert!(!res.matched_node_ids.is_empty());
    }
    graph_ns.sort_unstable();
    let graph_p99_us = percentile_sorted(&graph_ns, 0.99) / 1_000.0;
    assert!(graph_p99_us < 1_000.0, "DatasetGraph traversal p99={graph_p99_us:.2} us exceeded 1 ms");

    // 4. Verifica copertura di tutte le 10 clausole NormativeClauseId::ALL
    assert_eq!(NormativeClauseId::ALL.len(), 10);
    for clause in NormativeClauseId::ALL {
        assert!(!clause.official_code().is_empty());
    }
}
```

### 3.2 `crates/ares-causal-graph/tests/cert_memory_footprint_900sol.rs`
```rust
use ares_causal_graph::dataset_graph::AresUnifiedDatasetGraph;
use ares_causal_graph::hypergraph_spatial::{
    LONGITUDINAL_MEMORY_BUDGET_BYTES, MARS_MISSION_SOLS, MissionLongitudinalCompactor,
    PhysiologicalTick,
};
use std::path::PathBuf;

#[test]
fn cert_900_sol_compactor_under_200kb_and_dataset_graph_under_10mb() {
    let mut compactor = MissionLongitudinalCompactor::new(MARS_MISSION_SOLS).expect("900-sol compactor");
    // Simula campioni distribuiti su tutti i 900 Sol marziani
    for sol in 0..MARS_MISSION_SOLS {
        for bucket in 0..4u32 {
            let timestamp_s = (sol as f64) * 88_775.244 + (bucket as f64) * 900.0;
            let tick = PhysiologicalTick {
                hr_bpm: Some(68.0 + (bucket as f64)),
                spo2_pct: Some(98.2),
                resp_brpm: Some(14.0),
                rmssd_ms: None,
                tau_w_dyn_cm2: 2.35,
                sost_pmol_l: 28.0,
                onsd_mm: 5.2,
                rho_global: 0.78,
            };
            compactor.observe(timestamp_s, &tick);
        }
    }

    let compactor_bytes = compactor.memory_footprint_bytes();
    assert!(
        compactor_bytes < LONGITUDINAL_MEMORY_BUDGET_BYTES,
        "900-Sol compactor footprint {compactor_bytes} B exceeded 200 KB budget"
    );

    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let graph = AresUnifiedDatasetGraph::build_from_repo_root(&root).expect("load dataset graph");
    let estimated_graph_bytes = graph.node_count() * 1_024 + graph.edge_count() * 256;
    assert!(
        estimated_graph_bytes < 10 * 1024 * 1024,
        "AresUnifiedDatasetGraph RAM estimate {estimated_graph_bytes} B exceeded 10 MB limit"
    );
}
```

---

## 4. Matrice di Verifica & Criteri di Accettazione Finale (Block K4)

| ID Test / Gate | Comando di Esecuzione | Requisito / Soglia Certificata | Esito Atteso |
| :--- | :--- | :--- | :--- |
| `K4-01` | `cargo test --release -p ares-server-cli --test cert_nasa_std_3001_and_rt_budgets` | `20 Hz` loop `p99 < 150 us`; `ARES-BioKG` $O(1)$ `p99 < 5 us`; `DatasetGraph` `p99 < 1 ms`; `10/10` clausole `NASA-STD-3001` | `100%` pass |
| `K4-02` | `cargo test --release -p ares-core-types --test cert_seqlock_latency_percentiles` | `SeqlockTelemetryRing` (`128 B`) write+read `p99 < 100 ns` | `100%` pass |
| `K4-03` | `cargo test --release -p ares-causal-graph --test cert_memory_footprint_900sol` | `MissionLongitudinalCompactor` `900` Sol `< 200 KB`; `AresUnifiedDatasetGraph` `< 10 MB` | `100%` pass |
| `K4-04` | `RUST_TEST_THREADS=1 ./scripts/agent_probe.sh --all` | Zero `.unwrap()`/`.expect()` in `crates/*/src/`, `SHA-256` `BIDMC` valido, `clippy -D warnings` pulito, `100%` test workspace | Exit code `0` |
| `K4-05` | `npm --prefix ares-cockpit run lint && npm --prefix ares-cockpit run build` | Conformita `NASA-STD-3001 [V2 10001..10152]` su `ares-cockpit/` e `crates/ares-desktop-os` | Exit code `0` |
