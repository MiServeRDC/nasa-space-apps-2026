# Piano Implementativo Definitivo — Fase 22 (J2): Pure-Rust Native Mission Workstation Shell (`crates/ares-desktop-os` on `Tauri v2` + Apple Silicon Metal / Linux Vulkan + In-Process 8-Crate Runtime)

- **Blocco Architetturale**: Blocco J (*`ARES-MedOS`: Pure-Rust Mission Workstation OS Shell, Zero-Copy IPC & Multi-Tier Space OS Partitioning*, Fasi 21–24)
- **Fase**: Fase 22 (`J2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principali**: `crates/ares-desktop-os` *(NEW — 8o crate del workspace)*, `crates/ares-server-cli` *(bridge condiviso)*
- **Studio Architetturale di Riferimento**: [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md)
- **Owner Principale**: `@fabiomalagutti27-droid` & `@fertech02`
- **File Target Previsti**:
  1. `crates/ares-desktop-os/Cargo.toml` *(NEW — con feature `tauri-runtime` per compilazione headless CI senza dipendenze GTK/WebKit)*
  2. `crates/ares-desktop-os/tauri.conf.json` *(NEW — finestra frameless `#000000` OLED + CSP air-gapped zero-cloud)*
  3. `crates/ares-desktop-os/build.rs` *(NEW — invocazione `tauri_build::build()` solo con feature `tauri-runtime`)*
  4. `crates/ares-desktop-os/src/lib.rs` *(NEW — configurazione `DesktopShellConfig`, metriche runtime `ShellRuntimeStats` e bootstrap headless testabile)*
  5. `crates/ares-desktop-os/src/ipc_bridge.rs` *(NEW — `DesktopShellState`, `subscribe_binary_telemetry`, `get_full_wire_snapshot`, `apply_what_if_patch`, `invoke_fastmcp_tool`, `get_shell_runtime_stats`)*
  6. `crates/ares-desktop-os/src/main.rs` *(NEW — avvio singolo binario `ARES-MedOS` con `SharedMissionState` in-process + server parallelo `127.0.0.1:8080`)*
  7. `Cargo.toml` *(UPDATE — aggiunta di `crates/ares-desktop-os` ai `members` mantenendo la compilazione headless di `cargo test --workspace`)*
- **Budget Latenza & Risorse**:
  - **Footprint RAM Idle Shell (`Tauri v2` + OS WebView)**: `~30–50 MB` (`vs 150–300+ MB` Electron)
  - **Dimensione Installer / Binario**: `~3–10 MB` (`WKWebView` Metal su macOS, `WebKitGTK` su Linux, `WebView2` su Windows)
  - **Latenza `subscribe_binary_telemetry` (`Channel<Response>` `InvokeResponseBody::Raw`)**: `< 0.05 ms` (`~20–50 µs`, zero JSON in hot-path)
  - **Latenza `apply_what_if_patch` in-process**: `< 0.20 ms` (`> 500x` margine su `NASA-STD-3001 [V2 10022]` `100 ms`)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, `anyhow` consentito solo in `main.rs` con `.context(...)`, zero emoji.

---

## 1. Executive Summary & Scientific / Open-Source Grounding

### 1.1 Un Solo Eseguibile Nativo (`ARES-MedOS`), Zero Regressione sulla Modalita Browser
Come dimostrato in [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md), riscrivere `ares-cockpit/` (React 19 + Three.js `@react-three/fiber`) da zero o sostituire l'engine con un kernel bare-metal comprometterebbe la riproducibilita multi-piattaforma su macOS (Apple Silicon Metal), Linux e Windows. La **Fase 22 (`J2`)** impacchetta tutti i **7 crate esistenti** e il frontend compilato `ares-cockpit/dist` dentro **`crates/ares-desktop-os`** su **`Tauri v2`** con due garanzie ingegneristiche rigorose:
1. **In-Process `SharedMissionState` + Loopback `127.0.0.1:8080` Parallelo:** `crates/ares-desktop-os` istanzia una sola volta `SharedMissionState::from_data_dir(&data_dir)`, avvia il worker asincrono `1 Hz` (`Timestral`) e il loop deterministico `20 Hz` (`advance_tick`), e contemporaneamente espone `build_axum_router(Arc::clone(&state))` su `127.0.0.1:8080` (se la porta e libera, senza mai bloccare il desktop se un'istanza browser esterna e gia attiva). In questo modo:
   - La finestra nativa `ARES-MedOS` riceve i `128` byte di `BinaryTelemetryFrame` via `tauri::ipc::Channel<Response>` (`InvokeResponseBody::Raw` $\to$ JS `ArrayBuffer`) in **`< 0.05 ms`** con zero serializzazione JSON nel hot-path.
   - Il flusso tradizionale `cargo run -p ares-server-cli -- --mode ws-only` + `npm run dev` resta funzionante al 100% senza alcuna rottura.
2. **Design Headless / CI-Safe (`feature = "tauri-runtime"`):** Su nodi CI Linux headless privi delle librerie di sistema `libwebkit2gtk-4.1-dev` / `libgtk-3-dev`, `crates/ares-desktop-os` compila e supera tutti i test unitari di default (validando configurazione CSP, `DesktopShellState`, routing in-process `FastMCP`, e generazione `BinaryTelemetryFrame` senza linkare WRY/GTK), mentre l'esecuzione della finestra OS completa si abilita tramite `--features tauri-runtime` (attiva nel bundle desktop macOS/Linux/Windows).

### 1.2 Riferimenti a Repository Pubblici & Standard `NASA-STD-3001 Vol. 2`

| Repository / Standard | URL / Riferimento & Licenza | Ruolo nella Fase 22 (`J2`) |
| :--- | :--- | :--- |
| **`tauri-apps/tauri`** | `https://github.com/tauri-apps/tauri` (`Apache-2.0 OR MIT`) | Runtime desktop nativo pure-Rust: collega `WKWebView` (Apple Silicon Metal), `WebKitGTK` (Vulkan/OpenGL) o `WebView2` senza Chromium (`~30–50 MB` RAM) ed espone `tauri::ipc::Channel<Response>` (`InvokeResponseBody::Raw`) per `ArrayBuffer` zero-JSON. |
| **`pop-os/cosmic-epoch` & `cosmic-comp`** | `https://github.com/pop-os/cosmic-epoch`, `https://github.com/pop-os/cosmic-comp` (`GPL-3.0`) | Riferimento architetturale per la policy Kiosk single-workspace (`decorations: false`, eliminazione barre browser/tab) ereditata nel layout `tauri.conf.json` e nella configurazione Tier B (Fase 24). |
| **`iced-rs/iced` & `smithay/smithay`** | `https://github.com/iced-rs/iced`, `https://github.com/smithay/smithay` (`MIT`) | Benchmark di riferimento pure-Rust GPU (`wgpu` / Wayland) valutato nello studio di fattibilita (`120 FPS` Metal/Vulkan) come target complementare Tier B rispetto a `Tauri v2` Tier A. |
| **`NASA-STD-3001 Vol. 2 Rev F`** | Clauses `[V2 10001]`, `[V2 10002]`, `[V2 10005]`, `[V2 10027]`, `[V2 10022]`, `[V2 10152]` | `[V2 10001]/[V2 10005]`: shell kiosk coerente priva di tab browser estranei; `[V2 10002]`: eliminazione di stati ambigui via frame binari tipizzati; `[V2 10027]`: conferma esplicita dei 3 Hard Clinical Safety Gates prima di comandi critici; `[V2 10022]/[V2 10152]`: feedback `< 0.2 ms << 50 ms`. |

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

| File / Modulo | Azione | Responsabilita nella Fase 22 (`J2`) |
| :--- | :--- | :--- |
| `crates/ares-desktop-os/Cargo.toml` | **CREATE** | Definisce il crate `ares-desktop-os`, le dipendenze `ares-core-types` e `ares-server-cli`, e la feature `tauri-runtime` che isola `tauri` / `tauri-build` per la piena portabilita CI headless. |
| `crates/ares-desktop-os/tauri.conf.json` | **CREATE** | Configura la finestra `ARES-MedOS Mission Workstation` (`1440x900`, `decorations: false`, `titleBarStyle: "Overlay"` opzionale su macOS) e la Content Security Policy stretta `default-src 'self'`. |
| `crates/ares-desktop-os/src/lib.rs` | **CREATE** | Espone `DesktopShellConfig`, `ShellRuntimeStats`, `DesktopShellError` (`thiserror`), e `DesktopShellRuntime` (headless-testabile). |
| `crates/ares-desktop-os/src/ipc_bridge.rs` | **CREATE** | Implementa i 5 handler di comando (`subscribe_binary_telemetry`, `get_full_wire_snapshot`, `apply_what_if_patch`, `invoke_fastmcp_tool`, `get_shell_runtime_stats`), separando la logica pura dai wrapper `#[tauri::command]`. |
| `crates/ares-desktop-os/src/main.rs` | **CREATE** | Entrypoint binario: risolve `data/bidmc`, costruisce `SharedMissionState`, lancia i task Tokio (`1 Hz` Timestral, `20 Hz` tick + broadcast, opzionale `127.0.0.1:8080` Axum), e avvia il builder `Tauri v2`. |

---

## 3. Architettura In-Process, CSP Zero-Cloud & Gestione Errori (`thiserror`)

### 3.1 Flusso Concorrente Unificato nel Singolo Processo `ARES-MedOS`
```
  +-------------------------------------------------------------------------+
  |                     crates/ares-desktop-os (Single Binary)              |
  |                                                                         |
  |  [Tokio Runtime]                                                        |
  |   ├── Task 1 (1 Hz):  state.run_1hz_timestral_step()                    |
  |   ├── Task 2 (20 Hz): state.advance_tick(50 ms)                         |
  |   │                    ├── -> SeqlockTelemetryRing (128B binary frame)  |
  |   │                    └── -> broadcast::Sender<String> (JSON WS 8080)  |
  |   ├── Task 3 (Opt.):  axum::serve(127.0.0.1:8080, build_axum_router)    |
  |   └── IPC Bridge:     tauri::ipc::Channel<Response> (128B ArrayBuffer)  |
  |                       + in-process handle_fastmcp_jsonrpc_request()     |
  +-------------------------------------------------------------------------+
                                      |
                                      v  (< 0.05 ms binary / < 0.2 ms cmd)
  +-------------------------------------------------------------------------+
  |  OS Native WebView (WKWebView Metal / WebKitGTK Vulkan / WebView2)      |
  |  Content-Security-Policy: default-src 'self'; connect-src 'self'        |
  |    http://127.0.0.1:8080 ws://127.0.0.1:8080 ipc: http://ipc.localhost; |
  +-------------------------------------------------------------------------+
```

### 3.2 Gestione Sicura della Porta `127.0.0.1:8080` in Dual-Mode
Quando l'utente lancia `ARES-MedOS` mentre ha gia un altro processo `ares-server-cli` aperto su `127.0.0.1:8080` (o viceversa), `TcpListener::bind("127.0.0.1:8080").await` non deve MAI causare `panic!` ne chiudere l'applicazione desktop:
- Se `bind("127.0.0.1:8080")` ha successo, il binario desktop serve anche i client browser su `127.0.0.1:8080`.
- Se restituisce `AddrInUse`, logga un `tracing::warn!` controllato (`"127.0.0.1:8080 already bound; continuing with in-process Tauri IPC"`), mantenendo la shell nativa pienamente operativa sul proprio `SharedMissionState` interno.

---

## 4. Concrete Rust Signatures & Manifests (`crates/ares-desktop-os`)

### 4.1 `crates/ares-desktop-os/Cargo.toml`
```toml
[package]
name = "ares-desktop-os"
version = "0.1.0"
edition = "2024"
license = "MIT OR Apache-2.0"

[features]
default = []
tauri-runtime = ["dep:tauri", "dep:tauri-build"]
shm-ipc = ["ares-server-cli/shm-ipc"]

[dependencies]
anyhow = "1.0"
ares-core-types = { path = "../ares-core-types" }
ares-security-privacy = { path = "../ares-security-privacy" }
ares-server-cli = { path = "../ares-server-cli" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tauri = { version = "2", optional = true }
thiserror = "2.0"
tokio = { version = "1.43", features = ["full"] }
tracing = "0.1"

[build-dependencies]
tauri-build = { version = "2", optional = true }
```

### 4.2 `crates/ares-desktop-os/tauri.conf.json`
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ARES-MedOS",
  "version": "0.1.0",
  "identifier": "org.areshealth.medos",
  "build": {
    "beforeDevCommand": "npm --prefix ../../ares-cockpit run dev",
    "devUrl": "http://127.0.0.1:5173",
    "beforeBuildCommand": "npm --prefix ../../ares-cockpit run build",
    "frontendDist": "../../ares-cockpit/dist"
  },
  "app": {
    "windows": [
      {
        "label": "medos-primary",
        "title": "ARES-MedOS Mission Workstation",
        "width": 1440,
        "height": 900,
        "minWidth": 1180,
        "minHeight": 760,
        "decorations": false,
        "transparent": false,
        "fullscreen": false,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://127.0.0.1:8080 ws://127.0.0.1:8080 ipc: http://ipc.localhost; img-src 'self' asset: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self';"
    }
  }
}
```

### 4.3 `crates/ares-desktop-os/src/lib.rs` & `src/ipc_bridge.rs`
```rust
//! Fase 22 (J2): `crates/ares-desktop-os` — Shell nativa Pure-Rust `ARES-MedOS`.
//! Espone una logica core headless completamente testabile in CI e i binding
//! `Tauri v2` dietro `#[cfg(feature = "tauri-runtime")]`.

pub mod ipc_bridge;

use ares_server_cli::ws_server::{ServerRuntimeError, SharedMissionState};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;

/// Errori tipizzati di libreria per `ares-desktop-os`.
#[derive(Debug, Error)]
pub enum DesktopShellError {
    #[error("failed to initialize shared mission state: {0}")]
    RuntimeInit(#[from] ServerRuntimeError),
    #[error("mission state lock unavailable")]
    StateLockUnavailable,
    #[error("invalid FastMCP JSON-RPC payload: {0}")]
    InvalidJsonRpc(String),
    #[error("telemetry data directory not found: {0}")]
    MissingDataDir(PathBuf),
}

/// Configurazione deterministica di avvio per la workstation ARES-MedOS.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DesktopShellConfig {
    pub data_dir: PathBuf,
    pub enable_loopback_ws_mirror: bool,
    pub loopback_bind_addr: String,
    pub telemetry_hz: u32,
    pub air_gapped_csp_enforced: bool,
}

impl Default for DesktopShellConfig {
    fn default() -> Self {
        Self {
            data_dir: PathBuf::from("data/bidmc"),
            enable_loopback_ws_mirror: true,
            loopback_bind_addr: "127.0.0.1:8080".to_string(),
            telemetry_hz: 20,
            air_gapped_csp_enforced: true,
        }
    }
}

/// Metriche live di piattaforma esposte alla Top System Bar di `ares-cockpit/`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShellRuntimeStats {
    pub shell_name: &'static str,
    pub shell_version: &'static str,
    pub transport_mode: &'static str,
    pub host_os: &'static str,
    pub host_arch: &'static str,
    pub air_gapped: bool,
    pub ws_mirror_active: bool,
    pub engine_tick_latency_us: u64,
    pub target_ipc_budget_us: u64,
    pub partitions_healthy: [bool; 3], // [Ingest, CausalNqsEngine, DesktopUi]
}

/// Stato in-process condiviso con i comandi Tauri v2 e i test headless.
#[derive(Clone)]
pub struct DesktopShellState {
    pub mission: Arc<SharedMissionState>,
    pub config: DesktopShellConfig,
    pub ws_mirror_bound: Arc<std::sync::atomic::AtomicBool>,
}

impl DesktopShellState {
    pub fn initialize(config: DesktopShellConfig) -> Result<Self, DesktopShellError> {
        if !config.data_dir.exists() {
            return Err(DesktopShellError::MissingDataDir(config.data_dir.clone()));
        }
        let mission = SharedMissionState::from_data_dir(&config.data_dir)?;
        Ok(Self {
            mission,
            config,
            ws_mirror_bound: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
    }
}
```

```rust
// crates/ares-desktop-os/src/ipc_bridge.rs
use crate::{DesktopShellError, DesktopShellState, ShellRuntimeStats};
use ares_core_types::binary_ipc::BinaryTelemetryFrame;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use ares_server_cli::fastmcp_router::{
    JsonRpcRequest, JsonRpcResponse, handle_fastmcp_jsonrpc_request,
};
use ares_server_cli::wire_contract::{StressTestPatchRequest, WireTelemetryPacket};
use serde_json::{Value, json};
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

/// Costruisce un `BinaryTelemetryFrame` da 128 byte a partire dallo stato corrente
/// senza allocazioni JSON. Utilizzato sia dal `Channel<Response>` Tauri sia dai test headless.
pub fn build_latest_binary_frame(state: &DesktopShellState) -> Option<BinaryTelemetryFrame> {
    let guard = state.mission.inner.read().ok()?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let zone_code = guard.latest_habitat_assessment.current_zone as u8;
    let region_code = 0u8; // Mappato da `guard.latest_heatmap.hottest_region`
    Some(BinaryTelemetryFrame::from_packet(
        &guard.latest_packet,
        now_ms,
        zone_code,
        region_code,
    ))
}

/// Esegue `apply_stress_test_patch` in-process (< 0.2 ms) senza TCP loopback.
pub fn execute_what_if_patch_in_process(
    state: &DesktopShellState,
    patch: StressTestPatchRequest,
) -> Result<WireTelemetryPacket, DesktopShellError> {
    state
        .mission
        .apply_stress_test_patch(patch)
        .ok_or(DesktopShellError::StateLockUnavailable)
}

/// Invoca direttamente `handle_fastmcp_jsonrpc_request` in-process con `StrictMcpSanitizer`.
pub fn execute_fastmcp_in_process(
    state: &DesktopShellState,
    request_json: &str,
) -> Result<String, DesktopShellError> {
    let req: JsonRpcRequest = serde_json::from_str(request_json)
        .map_err(|e| DesktopShellError::InvalidJsonRpc(e.to_string()))?;
    let ctx = state
        .mission
        .fastmcp_context()
        .ok_or(DesktopShellError::StateLockUnavailable)?;
    let sanitizer = StrictMcpSanitizer;
    let resp: JsonRpcResponse = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
    serde_json::to_string(&resp).map_err(|e| DesktopShellError::InvalidJsonRpc(e.to_string()))
}

/// Raccoglie le metriche della workstation nativa per `OsSystemStatusBar.tsx`.
pub fn collect_shell_runtime_stats(state: &DesktopShellState) -> ShellRuntimeStats {
    let latency_us = state
        .mission
        .inner
        .read()
        .map(|g| g.latest_recompute_latency_us)
        .unwrap_or(0);
    ShellRuntimeStats {
        shell_name: "ARES-MedOS",
        shell_version: env!("CARGO_PKG_VERSION"),
        transport_mode: "TAURI_NATIVE_IPC",
        host_os: std::env::consts::OS,
        host_arch: std::env::consts::ARCH,
        air_gapped: state.config.air_gapped_csp_enforced,
        ws_mirror_active: state.ws_mirror_bound.load(Ordering::Relaxed),
        engine_tick_latency_us: latency_us,
        target_ipc_budget_us: 50,
        partitions_healthy: [true, true, true],
    }
}

#[cfg(feature = "tauri-runtime")]
pub mod tauri_commands {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;
    use tauri::State;
    use tauri::ipc::{Channel, Response};

    #[tauri::command]
    pub async fn subscribe_binary_telemetry(
        state: State<'_, DesktopShellState>,
        on_frame: Channel<Response>,
    ) -> Result<(), String> {
        let shared = state.inner().clone();
        let period_ms = (1000 / shared.config.telemetry_hz.max(1)).max(10) as u64;
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_millis(period_ms));
            loop {
                ticker.tick().await;
                let Some(frame) = build_latest_binary_frame(&shared) else {
                    continue;
                };
                let bytes = frame.to_le_bytes_array().to_vec();
                if on_frame.send(Response::new(bytes)).is_err() {
                    break;
                }
            }
        });
        Ok(())
    }

    #[tauri::command]
    pub async fn get_full_wire_snapshot(
        state: State<'_, DesktopShellState>,
    ) -> Result<WireTelemetryPacket, String> {
        state
            .mission
            .latest_wire_snapshot()
            .ok_or_else(|| "mission state lock unavailable".to_string())
    }

    #[tauri::command]
    pub async fn apply_what_if_patch(
        state: State<'_, DesktopShellState>,
        patch: StressTestPatchRequest,
    ) -> Result<WireTelemetryPacket, String> {
        execute_what_if_patch_in_process(&state, patch).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn invoke_fastmcp_tool(
        state: State<'_, DesktopShellState>,
        request_json: String,
    ) -> Result<String, String> {
        execute_fastmcp_in_process(&state, &request_json).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn get_shell_runtime_stats(
        state: State<'_, DesktopShellState>,
    ) -> Result<ShellRuntimeStats, String> {
        Ok(collect_shell_runtime_stats(&state))
    }
}
```

---

## 5. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Creare la directory `crates/ares-desktop-os/` con `Cargo.toml`, `build.rs`, `tauri.conf.json` e registrare `crates/ares-desktop-os` in `Cargo.toml` root (senza `tauri-runtime` nelle feature di default, in modo che `cargo test --workspace` funzioni anche in CI headless).
- [ ] **Step 2:** Implementare `src/lib.rs`, `src/ipc_bridge.rs` e `src/main.rs` con Zero `.unwrap()` / Zero `.expect()`, inizializzando `SharedMissionState`, i task `1 Hz` + `20 Hz` e il fallback non bloccante `127.0.0.1:8080`.
- [ ] **Step 3:** Verificare la compilazione headless con `cargo test -p ares-desktop-os` e la compilazione desktop completa su macOS Apple Silicon con `cargo check -p ares-desktop-os --features tauri-runtime`.
- [ ] **Step 4:** Eseguire `./scripts/agent_probe.sh --test` verificando 0 warning Clippy e 0 regressioni sui `77` test esistenti.

---

## 6. Deterministic Verification & Unit Tests

1. **`test_desktop_shell_state_initializes_from_bidmc_and_emits_128b_frame`:**
   - Inizializza `DesktopShellState` su `data/bidmc`, genera un `BinaryTelemetryFrame` via `build_latest_binary_frame()`, e verifica `to_le_bytes_array().len() == 128`, `magic == ARES_BINARY_MAGIC`, e preservazione di `FLAG_BEAT_INTERVALS_NOT_AVAILABLE`.
2. **`test_in_process_what_if_patch_updates_state_without_advancing_1hz_cursor`:**
   - Esegue `execute_what_if_patch_in_process` con `ared_daily_load_kgf: Some(45.0)` e verifica che `relative_recording_time_s` rimanga ancorato a `0.0` mentre `what_if_overlay` diventa `true` e i margini `NQS-STL` si ricalcolano in `< 1 ms`.
3. **`test_in_process_fastmcp_router_answers_all_8_tools_under_600_bytes`:**
   - Invoca `execute_fastmcp_in_process` per `tools/list` (8 tool) e `query_dataset_graph` (`OSD-51`), verificando il rispetto di `MAX_MCP_CONTEXT_MODE_BYTES` (`<= 600` byte).
4. **`test_tauri_conf_csp_blocks_external_cloud_origins`:**
   - Test strutturale che parsa `tauri.conf.json` e verifica la presenza di `default-src 'self'` e l'assenza di host esterni non `127.0.0.1`.
