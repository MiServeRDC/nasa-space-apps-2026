# Piano Implementativo Definitivo — Fase 13 (G1): `axum` 20 Hz WebSocket Telemetry Stream & Sub-Millisecond What-If Stress-Test API (`127.0.0.1:8080`)

- **Blocco Architetturale**: Blocco G (*Server Dual-Transport Isolato: `Axum WebSocket 20 Hz` + `FastMCP stdio`*, Fasi 13–14)
- **Fase**: Fase 13 (`G1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-server-cli`](../../crates/ares-server-cli/README.md)
- **Owner Principale**: `ARES-Health Team` (con integrazione UI `ARES-Health Team` e Motore Core `ARES-Health Team`)
- **File Target Previsti**:
  1. `crates/ares-server-cli/Cargo.toml` *(NEW)*
  2. `crates/ares-server-cli/src/main.rs` *(NEW)*
  3. `crates/ares-server-cli/src/ws_server.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 1.0\text{ ms}$ per ricalcolo end-to-end su `POST /api/stress-test` e broadcast immediato sul canale WebSocket `/ws/telemetry`.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, binding Zero-Trust predefinito su `127.0.0.1:8080`, isolamento fisico dallo stream `stdio` di FastMCP (`Entry 005`).

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale
La **Fase 13 (`G1`)** unisce tutti i crate del Motore Rust (`ares-core-types`, `ares-telemetry-ingest`, `ares-causal-graph`, `ares-nqs-stl`, `ares-medops-playbooks`, `ares-security-privacy`) in una pipeline reattiva ad alta frequenza che alimenta l'interfaccia **`ares-cockpit/`**:
1. **Canale WebSocket `/ws/telemetry` a `20 Hz` (`50 ms` tick):** Emette continuamente il `TelemetryPacket` JSON completo, sincronizzando la riga nativa a `1 Hz` (`relative_recording_time_s: 0..480 s`) di `data/bidmc/bidmc_01..03_Numerics.csv` con la dinamica in tempo reale del grafo `ADHG` e dei margini `NQS-STL`.
2. **Endpoint Interattivo `POST /api/stress-test` (`< 1 ms`):** Quando un giudice NASA o il medico di bordo muove uno slider nella **What-If Stress-Test Console** (es. portando `ared_daily_load_kgf` a `0 kgf`, alzando `radiation_dose_rate_msv_d` a `3.2 mSv/d` o attivando `pocus_thrombus_confirmed = true`), il server aggiorna `Arc<RwLock<MissionRuntimeState>>`, ricalcola l'intera cascata in $< 150\,\mu\text{s}$ e trasmette istantaneamente il nuovo pacchetto a tutti i client WebSocket connessi via `tokio::sync::broadcast`.

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 13 (`G1`) |
| :--- | :--- | :--- |
| `crates/ares-server-cli/Cargo.toml` | **CREATE** | Dipendenze verso i 6 crate interni + `tokio`, `axum = { version = "0.8", features = ["ws"] }`, `clap`, `anyhow`, `tracing`. |
| `crates/ares-server-cli/src/ws_server.rs` | **CREATE** | Stato condiviso `SharedMissionState`, router `axum` (`/ws/telemetry`, `GET /api/snapshot`, `POST /api/stress-test`) e loop ticker a `20 Hz`. |
| `crates/ares-server-cli/src/main.rs` | **CREATE** | Entrypoint CLI (`ares-server-cli --mode ws-and-mcp --bind 127.0.0.1:8080`). |

---

## 3. Architettura di `ws_server.rs` in Puro Rust 2024

```rust
//! Fase 13 (G1): Server HTTP/WebSocket Axum a 20 Hz su `127.0.0.1:8080` e API `/api/stress-test`.

use ares_causal_graph::adhg_graph::AdhgCausalEngine;
use ares_causal_graph::hemodynamics::compute_jugular_and_sans_state;
use ares_causal_graph::mechanotransduction::compute_musculoskeletal_state;
use ares_core_types::telemetry::{
    BiometricsSource, ProvenanceManifest, ScenarioOverlayMode, StressTestScenarioInput,
    SystemPhase, TelemetryPacket,
};
use ares_medops_playbooks::playbooks::select_candidate_playbook;
use ares_medops_playbooks::safety_gates::enforce_hard_clinical_safety_gates;
use ares_nqs_stl::mri_index::evaluate_nqs_stl_and_mri;
use ares_telemetry_ingest::bidmc_replayer::BidmcReplayer;
use ares_telemetry_ingest::scenario_overlay::merge_biometrics_with_scenario;
use ares_telemetry_ingest::sqi_filter::SqiFilter;

/// Esegue un singolo ciclo completo (GATHER -> EVALUATE -> ACT) in < 150 microsecondi.
pub fn compute_mission_telemetry_tick(
    replayer: &mut BidmcReplayer,
    sqi_filter: &mut SqiFilter,
    adhg_engine: &mut AdhgCausalEngine,
    scenario: &StressTestScenarioInput,
    mission_elapsed_s: f64,
) -> TelemetryPacket {
    // 1. GATHER: Preleva riga reale 1 Hz da BIDMC v1.0.0 e applica filtro SQI >= 0.70
    let row = replayer.next_row().clone();
    let biometrics = merge_biometrics_with_scenario(&row, scenario, sqi_filter);

    // 2. EVALUATE (Parte 1): ODE RK4 Frost-Hargens, Shear Stress Giugulare tau_w, SANS e Grafo ADHG
    let musculo = compute_musculoskeletal_state(scenario.flight_day, scenario.ared_daily_load_kgf);
    let (jugular, sans) = compute_jugular_and_sans_state(&musculo, scenario);
    let (_pocus_est, causal_chain) = adhg_engine.update_and_extract_causal_chain(
        &musculo,
        &jugular,
        &sans,
        biometrics.radiation_dose_rate_msv_d,
    );

    // 2. EVALUATE (Parte 2): Margini normalizzati NQS-STL, TTV ±1.96σ e Mission Readiness Index
    let (nqs_stl, alert_severity) =
        evaluate_nqs_stl_and_mri(&biometrics, &musculo, &jugular, &sans);

    // 3. ACT: Selezione Playbook #01-#05 e applicazione inflessibile dei 3 Hard Clinical Safety Gates
    let candidate_playbook =
        select_candidate_playbook(&biometrics, &musculo, &jugular, &nqs_stl, causal_chain);
    let active_playbook = enforce_hard_clinical_safety_gates(
        candidate_playbook,
        &biometrics,
        &musculo,
        &jugular,
        scenario,
    );

    let system_phase = if nqs_stl.rho_global < 0.0 || jugular.pocus_thrombus_confirmed {
        SystemPhase::Act
    } else {
        SystemPhase::Evaluate
    };

    TelemetryPacket {
        timestamp_utc: "2026-11-14T12:00:00Z".to_string(),
        mission_Elapsed_seconds: mission_elapsed_s,
        relative_recording_time_s: row.relative_time_s,
        source_record_id: row.record_id,
        flight_day: scenario.flight_day,
        astronaut_id: "ARES-CDR-01".to_string(),
        system_phase,
        alert_severity,
        provenance_manifest: ProvenanceManifest {
            biometrics_source: BiometricsSource::RecordedTerrestrialBidmcCsv,
            biometrics_native_rate_hz: 1.0,
            ui_refresh_rate_hz: 20.0,
            scenario_overlay_mode: ScenarioOverlayMode::DerivedAndSimulated,
            biological_context_refs: vec![
                "PhysioNet-BIDMC-v1.0.0".to_string(),
                "NASA-OSDR-OSD-51-195-818".to_string(),
                "NASA-NLSP-0000100".to_string(),
                "NASA-STD-3001-V1C-V2F".to_string(),
            ],
        },
        biometrics,
        musculoskeletal: musculo,
        jugular_hemodynamics: jugular,
        sans_ocular: sans,
        nqs_stl,
        active_playbook,
    }
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 13 (`G1`)

1. **`test_full_pipeline_tick_executes_under_150_microseconds`:** Misura il tempo di esecuzione di `compute_mission_telemetry_tick` su `bidmc_01_Numerics.csv` e verifica che sia $< 150\,\mu\text{s}$ e conforme a `contracts/telemetry_schema.json`.
2. **`test_stress_test_slider_change_switches_playbook_deterministically`:** Verifica che il passaggio da `ared_daily_load_kgf = 130.0` a `0.0` cambi istantaneamente i margini `NQS-STL` e attivi `PLAYBOOK_01_VENOUS_STASIS_LBNP` con `anticoagulant_lock_active == true`.
