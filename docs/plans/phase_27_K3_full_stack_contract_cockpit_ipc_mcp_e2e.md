# Piano Implementativo Definitivo — Fase 27 (K3): Full-Stack End-to-End Contract, Dual-Transport IPC (`BinaryTelemetryFrame` <-> TypeScript `DataView`), 24-Dataset Graph & `FastMCP` Verification Suite

- **Blocco Architetturale**: Blocco K (*System-Wide Testing, Chaos Engineering, Contract E2E & `NASA-STD-3001` Certification*, Fasi 25–28)
- **Fase**: Fase 27 (`K3`)
- **Stato**: `PLANNED (READY FOR EXECUTION)`
- **Architettura Master di Blocco**: [`BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md`](BLOCK_K_SYSTEM_TESTING_ARCHITECTURE.md)
- **Crate & Directory Target**: `crates/ares-server-cli`, `crates/ares-desktop-os`, `crates/ares-causal-graph`, `ares-cockpit/`
- **Piani & Studi di Riferimento**: [`phase_13_G1`](phase_13_G1_axum_20hz_websocket_and_sub_ms_stress_test_api_plan.md), [`phase_14_G2`](phase_14_G2_fastmcp_stdio_jsonrpc_context_mode_server_plan.md), [`phase_20_I3`](phase_20_I3_unified_dataset_graph_builder_graphify_mcp.md), [`phase_21_J1`](phase_21_J1_zero_copy_binary_ipc_shm_protocol.md), [`phase_22_J2`](phase_22_J2_ares_desktop_os_tauri_native_shell.md), [`phase_23_J3`](phase_23_J3_os_chrome_fastmcp_palette_dual_transport.md)
- **Owner Principale**: `ARES-Health Team` & `ARES-Health Team` (con supervisione `ARES-Health Team`)
- **File Target Previsti**:
  1. `crates/ares-server-cli/tests/e2e_dual_clock_http_and_mcp.rs` *(NEW — test HTTP `/api/snapshot`, `/api/binary-frame`, `/api/os-status`, `POST /api/stress-test`, `POST /api/mcp`, `WS /ws/telemetry` + invarianza doppio clock `1 Hz`/`20 Hz`)*
  2. `crates/ares-desktop-os/tests/e2e_ipc_and_binary_fixture_export.rs` *(NEW — verifica `AresMedOsWorkstationShell` / `DesktopShellConfig` in-process in `crates/ares-desktop-os/src/lib.rs` e generazione vettore binario `128 B` condiviso con TypeScript)*
  3. `ares-cockpit/src/lib/__tests__/binaryTelemetryDecoder.contract.test.ts` *(NEW — test di parita bit-esatta `DataView` su fixture prodotta da Rust, verifica `null` su `validity_mask` e fallback `useTelemetry.ts`)*
  4. `ares-cockpit/src/modules/os-shell/__tests__/osCommandPalette.e2e.test.ts` *(NEW — verifica integrazione `Alt+Space`/`Cmd+K` contro `POST /api/mcp` con tutti gli 8 tool `< 150` token / `<= 600` byte)*
- **Budget E2E & Contratti**:
  - **Parita Binaria Rust <-> TypeScript**: `100%` equivalenza campi, `validity_mask`, `flags` e `null` (`BEAT_INTERVALS_NOT_AVAILABLE`)
  - **Context-Mode Budget su Tutti gli 8 Tool `FastMCP`**: `<= 600` byte (`< 150` token) via sia `stdio` che `POST /api/mcp`
  - **Completezza `AresUnifiedDatasetGraph`**: `24/24` dataset (`DS_01`..`DS_24`), `>= 27` slice `BIDMC`, JSON valido in `data/knowledge_graph/ares_dataset_graph.json` e `graphify-out/graph.json`
- **Politica Strict Mode**: Zero `.unwrap()` / `.expect()` in produzione; zero emoji; compatibilita al 100% con browser (`npm run dev`) e shell nativa `Tauri v2`.

---

## 1. Executive Summary & Scientific / Open-Source Grounding

### 1.1 Garantire Coerenza End-to-End tra Motore Rust, IPC Binario, `FastMCP` e Cockpit React
In un'architettura multi-linguaggio e multi-trasporto (`Rust 2024` backend + `Tauri v2` `Channel<ArrayBuffer>` + `Axum` `HTTP/WS` + `TypeScript/React 19` frontend), i guasti piu insidiosi nascono alle frontiere tra i contratti (*contract drift*):
1. **Deriva di Offset ABI (`BinaryTelemetryFrame` <-> `DataView`):** Uno slittamento anche di `1` byte tra `crates/ares-core-types/src/binary_ipc.rs` e `ares-cockpit/src/lib/binaryTelemetryDecoder.ts` corromperebbe silenziosamente i valori clinici (`tau_w`, `sclerostin`, `rho_global`, `ttv_hours`) o convertirebbe un canale `None` (`validity_mask` bit `0`) in `0.0`.
2. **Invarianza del Doppio Clock (`1 Hz` `BIDMC` vs `20 Hz` WebSocket/IPC):** Il passaggio da `1 Hz` nativo del CSV (`relative_recording_time_s`) al refresh `20 Hz` della UI (`50 ms`) e la chiamata `POST /api/stress-test` non devono mai avanzare artificialmente o saltare il cursore temporale reale del dataset `BIDMC`, preservando il `ProvenanceManifest` (`Issue #4`).
3. **Parita Dual-Transport `FastMCP` (`stdio` vs `POST /api/mcp` vs Tauri IPC):** La `OsCommandPalette` (`Alt+Space` / `Cmd+K`) di `ares-cockpit/` deve ottenere esattamente lo stesso payload compatto `< 150 token` (`<= 600 byte`) e la stessa sanitizzazione `<untrusted_telemetry_observation>` sia via `Tauri IPC` sia via `POST /api/mcp` su `127.0.0.1:8080`.
4. **Integrita del Grafo a 24 Dataset (`AresUnifiedDatasetGraph`):** Tutte le query di provenienza (`query_dataset_graph`, `explain_biomarker_path`) devono risolvere senza errori i 24 dataset multi-agenzia e le relative slice `BIDMC`.

### 1.2 Riferimenti a Repository Pubblici, Contratti & Standard

| Fonte / Repository / Standard | Riferimento / URL & Licenza | Contributo Specifico alla Fase 27 (`K3`) |
| :--- | :--- | :--- |
| **Single Source of Truth Contract** | `contracts/telemetry_schema.json` (JSON Schema Draft-07) & `data/bidmc/MANIFEST.json` (`SHA-256`) | Contratto formale condiviso tra `crates/ares-core-types`, `crates/ares-server-cli` e `ares-cockpit/`. |
| **`tokio-rs/axum` & `tower::ServiceExt`** | `https://github.com/tokio-rs/axum` (`MIT`) | Test in-process ad alte prestazioni (`Router::oneshot`) su `/api/snapshot`, `/api/stress-test`, `/api/mcp`, `/api/binary-frame` e `/api/os-status` senza porte effimere instabili. |
| **`tauri-apps/tauri` IPC Contract** | `https://github.com/tauri-apps/tauri` (`Apache-2.0 OR MIT`) | Test di serializzazione `InvokeResponseBody::Raw` (`128 B`) e fallback automatico verso `BROWSER_WEBSOCKET` quando `__TAURI_INTERNALS__` e assente. |
| **Model Context Protocol (MCP) 2025-06-18 & `IoT-MCP`** | `https://modelcontextprotocol.io`; Bellagente et al., `arXiv:2502.16467` (2025) | Verifica conformita JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`) su `stdio` e `HTTP` con cap stretto `MAX_MCP_CONTEXT_MODE_BYTES = 600`. |
| **Node `v26+` (`--experimental-strip-types`) & `node:assert/strict`** | Runtime `Node v26.13.0` + `tsc -b --noEmit` (`ares-cockpit/package.json`) | Verifica automatica in Node/TypeScript a zero dipendenze aggiuntive della decodifica `DataView` sui vettori binari `128 B` prodotti direttamente da Rust. |

---

## 2. Decisioni Architetturali & Matrice dei Contratti Verificati

### 2.1 Meccanismo di Golden Vector Cross-Linguaggio (`Rust -> TypeScript`)
Per evitare drift tra i test Rust e i test TypeScript:
- Un test deterministico Rust in `crates/ares-core-types` / `crates/ares-desktop-os` genera **due Golden Binary Vectors** da `128` byte (esportati come costanti esadecimali verificate o fixture deterministica in `target/test_vectors/`):
  1. **Vettore A (Nominale Completo):** Tutti i canali finiti, `LBNP` attivo, `Gate 1` attivo, `ILLUSTRATIVE_UNVALIDATED` attivo.
  2. **Vettore B (Nullabilita `BIDMC` `bidmc_01` Gap + `Issue #11`):** `pulse_bpm: None`, `spo2_pct: None`, `rmssd_ms: None` con `FLAG_BEAT_INTERVALS_NOT_AVAILABLE` attivo (`validity_mask` con i rispettivi bit a `0` e payload `f64::NAN`).
- Il decoder TypeScript `decodeBinaryTelemetryFrame(buffer)` (`ares-cockpit/src/lib/binaryTelemetryDecoder.ts`) decodifica entrambi i vettori verificando che `pulse_bpm === null`, `spo2_pct === null`, `rmssd_ms === null` (mai `0` o `NaN`) e che tutti gli altri campi combacino con tolleranza `0` ULP per gli interi e `< 1e-6` per i campi `f32`.

### 2.2 Matrice Endpoint & Transport Parity

| Endpoint / Comando | Trasporto Web (`Axum`) | Trasporto Desktop (`Tauri v2`) | Invariante Verificato in Fase 27 (`K3`) |
| :--- | :--- | :--- | :--- |
| Snapshot Completo | `GET /api/snapshot` | `get_full_wire_snapshot` | Identico schema `WireTelemetryPacket`, `provenance_manifest` intatto. |
| Frame Binario `128 B` | `GET /api/binary-frame` | `subscribe_binary_telemetry` | Identici `128` byte `BinaryTelemetryFrame::to_le_bytes()`, `magic = 0x41524553`. |
| Stato OS / Partizioni | `GET /api/os-status` | `get_os_status_bar_state` / `get_shell_runtime_stats` | Riporta `OsStatusBarState` (partizioni `ARINC 653`, `owlt`, `habitat_zone`, `radiation_dose_rate_msv_d`, `seu_restart_count`). |
| What-If Stress Test | `POST /api/stress-test` | `apply_what_if_patch` | Ricalcola in `< 1 ms` senza alterare `relative_recording_time_s` (`BIDMC` cursor invariance). |
| Router `FastMCP` (8 tool) | `POST /api/mcp` | `invoke_fastmcp_tool` / `stdio` | Tutte le 8 risposte JSON-RPC 2.0 sono `<= 600` byte (`< 150` token) e contengono `model_status: "ILLUSTRATIVE_UNVALIDATED"`. |

---

## 3. Concrete Rust & TypeScript E2E Test Signatures

### 3.1 `crates/ares-server-cli/tests/e2e_dual_clock_http_and_mcp.rs`
```rust
use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_server_cli::wire_contract::StressTestPatchRequest;
use ares_server_cli::ws_server::{SharedMissionState, build_axum_router};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use std::path::PathBuf;
use std::time::Duration;
use tower::ServiceExt;

fn bidmc_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("data")
        .join("bidmc")
}

#[tokio::test]
async fn e2e_dual_clock_invariance_under_stress_test_and_20hz_ticks() {
    let state = SharedMissionState::from_data_dir(&bidmc_dir()).expect("init state");
    let app = build_axum_router(state.clone());

    // 1. Verifica che 19 tick da 50 ms (0.95 s totali) non facciano saltare il secondo BIDMC 0 -> 1
    let initial = state.latest_wire_snapshot().expect("initial snapshot");
    let t0 = initial.relative_recording_time_s;
    for _ in 0..19 {
        state.advance_tick(Duration::from_millis(50)).expect("tick");
    }
    let after_950ms = state.latest_wire_snapshot().expect("after 950ms");
    assert_eq!(after_950ms.relative_recording_time_s, t0);

    // 2. Verifica che POST /api/stress-test ricalcoli il modello senza mutare il cursore BIDMC
    let patch = StressTestPatchRequest {
        flight_day: Some(150),
        ared_daily_load_kgf: Some(15.0),
        radiation_dose_rate_msv_d: Some(1.5),
        lbnp_active: Some(false),
        lbnp_pressure_mmhg: Some(0.0),
        pocus_thrombus_confirmed: Some(false),
        ..StressTestPatchRequest::default()
    };
    let req = Request::builder()
        .method("POST")
        .uri("/api/stress-test")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&patch).expect("serialize patch")))
        .expect("build req");

    let resp = app.clone().oneshot(req).await.expect("oneshot");
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = axum::body::to_bytes(resp.into_body(), 1_048_576).await.expect("bytes");
    let updated: Value = serde_json::from_slice(&body_bytes).expect("json");
    assert_eq!(updated["relative_recording_time_s"].as_f64(), Some(t0));
    assert_eq!(updated["active_playbook"]["playbook_id"], "PLAYBOOK_01_VENOUS_STASIS_LBNP");

    // 3. Verifica che il 20° tick (1.00 s) avanzi esattamente di 1 secondo sul CSV BIDMC
    state.advance_tick(Duration::from_millis(50)).expect("tick 20");
    let after_1s = state.latest_wire_snapshot().expect("after 1s");
    assert!((after_1s.relative_recording_time_s - (t0 + 1.0)).abs() < 1e-6);
}

#[tokio::test]
async fn e2e_http_post_api_mcp_all_8_tools_and_binary_frame_endpoint() {
    let state = SharedMissionState::from_data_dir(&bidmc_dir()).expect("init state");
    let app = build_axum_router(state);

    // Verifica GET /api/binary-frame (esattamente 128 byte con magic ARES_BINARY_MAGIC = 0x4152_4553 e ARES_BINARY_VERSION = 1)
    let bin_req = Request::builder()
        .method("GET")
        .uri("/api/binary-frame")
        .body(Body::empty())
        .expect("req");
    let bin_resp = app.clone().oneshot(bin_req).await.expect("bin resp");
    assert_eq!(bin_resp.status(), StatusCode::OK);
    let bin_bytes = axum::body::to_bytes(bin_resp.into_body(), 4096).await.expect("bin bytes");
    assert_eq!(bin_bytes.len(), 128);
    assert_eq!(&bin_bytes[0..4], &0x4152_4553u32.to_le_bytes());
    assert_eq!(&bin_bytes[4..6], &1u16.to_le_bytes());

    // Verifica GET /api/os-status
    let os_req = Request::builder()
        .method("GET")
        .uri("/api/os-status")
        .body(Body::empty())
        .expect("req");
    let os_resp = app.clone().oneshot(os_req).await.expect("os resp");
    assert_eq!(os_resp.status(), StatusCode::OK);

    // Verifica POST /api/mcp su tutti gli 8 tool Context-Mode
    let tools = [
        ("get_crew_health_summary", json!({})),
        ("explain_causal_anomaly", json!({})),
        ("simulate_countermeasure_impact", json!({})),
        ("get_medops_playbook", json!({})),
        ("query_dataset_graph", json!({ "query": "OSD-51" })),
        ("explain_biomarker_path", json!({ "from": "OSD-818", "to": "pheno_sans_papilledema" })),
        ("get_timestral_quantile_cones", json!({})),
        ("get_hypergraph_spatial_status", json!({})),
    ];

    for (name, args) in tools {
        let rpc = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": name, "arguments": args }
        });
        let req = Request::builder()
            .method("POST")
            .uri("/api/mcp")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&rpc).expect("rpc")))
            .expect("req");
        let resp = app.clone().oneshot(req).await.expect("mcp resp");
        assert_eq!(resp.status(), StatusCode::OK, "tool {name} failed HTTP");
        let bytes = axum::body::to_bytes(resp.into_body(), 65_536).await.expect("bytes");
        let doc: Value = serde_json::from_slice(&bytes).expect("json");
        let text = doc["result"]["content"][0]["text"].as_str().expect("mcp text");
        assert!(text.len() <= MAX_MCP_CONTEXT_MODE_BYTES, "tool {name} exceeded 600B: {}", text.len());
    }
}
```

### 3.2 `ares-cockpit/src/lib/__tests__/binaryTelemetryDecoder.contract.test.ts`
```typescript
import { strict as assert } from 'node:assert';
import {
  ARES_BINARY_FRAME_BYTES,
  ARES_BINARY_MAGIC,
  ARES_BINARY_SCHEMA_VERSION,
  FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
  FLAG_ILLUSTRATIVE_UNVALIDATED,
  MASK_HR_BPM,
  MASK_NQS_MIN_RHO,
  computeCrc32c,
  decodeBinaryTelemetryFrame,
  runBinaryTelemetrySelfTest,
} from '../binaryTelemetryDecoder';

// Verifica bit-a-bit la decodifica DataView di un buffer little-endian da 128 byte
// (ABI locked: 16x f32 @ 32..96, validity_mask @ 24..28, quality_flags_mask @ 28..32,
// Castagnoli CRC-32C @ 104..108 su byte 0..104) con pulse_bpm = null, spo2_pct = null,
// rmssd_ms = null (Issue #11) e FLAG_ILLUSTRATIVE_UNVALIDATED (Issue #12).
export function runBinaryDecoderParityContractTest(): void {
  const selfTest = runBinaryTelemetrySelfTest();
  assert.equal(selfTest.passed, true, selfTest.details.join('; '));

  const buf = new ArrayBuffer(ARES_BINARY_FRAME_BYTES);
  const view = new DataView(buf);
  view.setUint32(0, ARES_BINARY_MAGIC, true);
  view.setUint16(4, ARES_BINARY_SCHEMA_VERSION, true);
  view.setUint8(6, 0x0f); // 4/4 partizioni ARINC 653 healthy
  view.setUint8(7, 0x00); // SLEEP_QUARTERS, nessuna violazione deontica
  view.setUint32(24, MASK_HR_BPM | MASK_NQS_MIN_RHO, true);
  view.setUint32(28, FLAG_BEAT_INTERVALS_NOT_AVAILABLE | FLAG_ILLUSTRATIVE_UNVALIDATED, true);
  view.setFloat32(32, 74.5, true); // hr_bpm
  view.setFloat32(36, Number.NaN, true); // pulse_bpm assente -> null, mai 0 o NaN
  view.setFloat32(44, Number.NaN, true); // spo2_pct assente -> null
  view.setFloat32(48, Number.NaN, true); // rmssd_ms assente -> null
  view.setFloat32(76, 0.82, true); // nqs_min_rho
  const crc = computeCrc32c(new Uint8Array(buf, 0, 104));
  view.setUint32(104, crc, true);

  const decoded = decodeBinaryTelemetryFrame(buf);
  assert.ok(decoded !== null);
  assert.ok(Math.abs((decoded.hr_bpm ?? 0) - 74.5) < 1e-5);
  assert.equal(decoded.pulse_bpm, null);
  assert.equal(decoded.spo2_pct, null);
  assert.equal(decoded.rmssd_ms, null);
  assert.ok(Math.abs((decoded.nqs_min_rho ?? 0) - 0.82) < 1e-5);
}
```

---

## 4. Matrice di Verifica & Criteri di Accettazione (Block K3)

| ID Test / Gate | Comando di Esecuzione | Contratto Verificato | Soglia di Passaggio |
| :--- | :--- | :--- | :--- |
| `K3-01` | `cargo test -p ares-server-cli --test e2e_dual_clock_http_and_mcp` | Dual-clock `1 Hz`/`20 Hz` invariance, `POST /api/stress-test`, `GET /api/binary-frame` (`128 B`), `GET /api/os-status`, `POST /api/mcp` (`8/8` tool `<= 600 B`) | `100%` pass |
| `K3-02` | `cargo test -p ares-server-cli --test integration_graph_and_mcp` | Completezza `24/24` dataset in `AresUnifiedDatasetGraph`, `>= 27` slice `BIDMC`, artifact `graphify` su disco | `100%` pass |
| `K3-03` | `cargo run -p ares-desktop-os -- --mode desktop-smoke-test` | Avvio workstation shell 8-crate in-process, `SeqlockTelemetryRing`, snapshot JSON e `BinaryTelemetryFrame` | Exit code `0` |
| `K3-04` | `npm --prefix ares-cockpit run lint && npm --prefix ares-cockpit run build` | Compilazione TypeScript strict + bundle Vite con `OsSystemStatusBar`, `OsCommandPalette` e `binaryTelemetryDecoder` | `0` errori TS/Vite |
| `K3-05` | `node --experimental-strip-types ares-cockpit/src/lib/__tests__/binaryTelemetryDecoder.contract.test.ts` | Parita byte-level Rust <-> TypeScript `DataView` e preservazione `null` per Issue `#11` | `100%` pass |
