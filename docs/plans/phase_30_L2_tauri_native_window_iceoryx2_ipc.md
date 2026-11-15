# Piano Implementativo Definitivo — Fase 30 (L2): Native Tauri v2 Desktop Window, Real POSIX SHM iceoryx2 + Zenoh IPC Adapter & macOS .app Bundle

- **Blocco Architetturale**: Blocco L (*`ARES-MedOS` Production Native Packaging, Real Daemonless POSIX SHM Bus & Hardware-Ready Deployment*, Fasi 29–32)
- **Fase**: Fase 30 (`L2`)
- **Stato**: `[x] COMPLETED (TESTED)` (`phase_30_l2_tauri_bridge` `4/4` default + `5/5` `--features tauri-runtime`, `phase_30_l2_shm_zenoh_ipc` `4/4` `--features shm-ipc`, `clippy --features "tauri-native,shm-ipc,offline-voice"`, `./scripts/launch_ares_medos.sh --verify`)
- **Crate Principali**: [`crates/ares-desktop-os`](../../crates/ares-desktop-os/Cargo.toml), [`crates/ares-server-cli`](../../crates/ares-server-cli/Cargo.toml) & [`crates/ares-core-types`](../../crates/ares-core-types/Cargo.toml)
- **Piani & Studi di Riferimento**:
  - [`docs/plans/phase_21_J1_zero_copy_binary_ipc_shm_protocol.md`](./phase_21_J1_zero_copy_binary_ipc_shm_protocol.md)
  - [`docs/plans/phase_22_J2_ares_desktop_os_tauri_native_shell.md`](./phase_22_J2_ares_desktop_os_tauri_native_shell.md)
  - [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md)
  - [`docs/architecture/MODEL_EVIDENCE_AUDIT.md`](../architecture/MODEL_EVIDENCE_AUDIT.md)
- **Owner Principale**: `ARES-Health Team` & `ARES-Health Team` (con revisione sicurezza CSP/ACL `@MiServeRDC` e validazione UX `ARES-Health Team`)
- **File Target Previsti**:
  1. `crates/ares-desktop-os/Cargo.toml` *(UPDATE — aggiunta feature `tauri-runtime`, `tauri-native`, `shm-ipc` e dipendenze opzionali `tauri = "2"`, `tauri-build = "2"`)*
  2. `crates/ares-desktop-os/build.rs` *(NEW — invocazione condizionale `tauri_build::build()` esclusivamente sotto `#[cfg(feature = "tauri-native")]`)*
  3. `crates/ares-desktop-os/capabilities/default.json` *(NEW — manifesto ACL `Tauri v2` per finestra `medos-primary`, comandi IPC custom e controlli finestra frameless)*
  4. `crates/ares-desktop-os/icons/` *(NEW — asset iconografici deterministici `.png` / `.icns` / `.ico` richiesti a compile-time da `tauri::generate_context!()`)*
  5. `crates/ares-desktop-os/tauri.conf.json` *(UPDATE — sezione `bundle` per `ARES-MedOS.app` Apple Silicon Metal e Linux `AppImage`/`deb`, inclusione risorse `../../data/bidmc/*` e conservazione integrale CSP air-gapped)*
  6. `crates/ares-desktop-os/src/ipc_bridge.rs` *(NEW — router IPC headless `tauri-runtime` + handler `#[tauri::command]` `tauri-native` con `tauri::ipc::Channel<tauri::ipc::Response>` / `InvokeResponseBody::Raw` da `128 B`)*
  7. `crates/ares-desktop-os/src/lib.rs` *(UPDATE — esportazione `pub mod ipc_bridge;` e risoluzione deterministica `resolve_medos_data_dir` compatibile con `ARES-MedOS.app/Contents/Resources`)*
  8. `crates/ares-desktop-os/src/main.rs` *(UPDATE — separazione main-thread Cocoa/AppKit `WKWebView` dal runtime multi-thread `Tokio` tramite `tauri::async_runtime::set` e lancio finestra nativa `--mode native-window`)*
  9. `crates/ares-server-cli/Cargo.toml` *(UPDATE — aggiunta feature `shm-ipc` con dipendenze opzionali `iceoryx2` e `zenoh` con feature `shared-memory`)*
  10. `crates/ares-server-cli/src/lib.rs` *(UPDATE — esportazione condizionale `#[cfg(feature = "shm-ipc")] pub mod shm_bus;`)*
  11. `crates/ares-server-cli/src/shm_bus.rs` *(NEW — `Iox2TelemetryFrame` `ZeroCopySend` su POSIX SHM daemonless `< 100 ns`, adattatore `Zenoh` SHM + Store-and-Forward DSN OWLT 4–24 min, `NonBlockingShmDsnDispatcher`)*
  12. `crates/ares-server-cli/src/ws_server.rs` *(UPDATE — integrazione non bloccante `try_dispatch` in `SharedMissionState::advance_tick`, `apply_stress_test_patch` e `ingest_wearable_packet`)*
  13. `scripts/launch_ares_medos.sh` *(UPDATE — supporto `--desktop --native`, `--bundle-macos`, `--bundle-linux`, `--shm` e preservazione `--verify` CI headless senza GTK/WebKit)*
- **Budget Latenza & Risorse**:
  - **Streaming `subscribe_binary_telemetry` (`Channel<Response>` / `InvokeResponseBody::Raw` `128 B`)**: $p_{99} < 50\,\mu\text{s}$ (`0` serializzazioni JSON nel hot-path a `20 Hz`)
  - **Pubblicazione POSIX SHM `iceoryx2` (`publisher.loan_uninit()` + `write_payload` + `send`)**: $p_{50} < 100\,\text{ns}$, $p_{99.9} < 250\,\text{ns}$ (`0` copie intermedie in user-space)
  - **Overhead sul loop fisiologico `20 Hz` (`SharedMissionState::advance_tick`)**: $< 150\,\text{ns}$ costante $O(1)$ (`try_send` wait-free, isolamento temporale `ARINC 653`)
  - **Footprint RAM Shell Nativa (`ARES-MedOS.app` su `WKWebView` Metal / `WebKitGTK` Vulkan)**: `~32–55 MB` RSS
  - **Tracciabilita `NASA-STD-3001 Vol. 2 Rev F` & `Vol. 1 Rev C`**: piena conformita a `[V2 10001]`, `[V2 10002]`, `[V2 10005]`, `[V2 10022]` ($\le 100\,\text{ms}$), `[V2 10152]` ($\le 50\,\text{ms}$), `[V2 10027]` e `[V1 3006]` (autonomia EIMO con OWLT marziano `4–24 min`, nominale `852.0 s`)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` in tutto `crates/*/src/` (verificato da `./scripts/agent_probe.sh`), `thiserror` per tutti gli errori di libreria (`DesktopShellError`, `ShmBusError`, `AresCoreError`), `anyhow` ammesso esclusivamente in `main.rs` con `.context(...)`, zero emoji ovunque, preservazione bit-esatta di Issue `#11` (`FLAG_BEAT_INTERVALS_NOT_AVAILABLE`, `MASK_RMSSD_MS = 0` quando `None`) e Issue `#12` (`FLAG_ILLUSTRATIVE_UNVALIDATED`).

---

## 1. Executive Summary & Scientific/Open-Source Grounding

### 1.1 Gap Architetturale Risolto dalla Fase 30 (`L2`): Dal Prototipo Loopback al Sistema Nativo `ARES-MedOS`
L'ispezione rigorosa dello stato attuale del repository su disco (dopo il completamento dei Blocchi `A–K`, `126/126` test verdi) evidenzia tre divari strutturali precisi tra i contratti gia predisposti e l'esecuzione OS-nativa/inter-processo reale:

1. **Gap Finestra Nativa `Tauri v2` in `crates/ares-desktop-os`:**
   - `crates/ares-desktop-os/Cargo.toml` incorpora attualmente tutti i 7 crate del motore più `axum`, `tokio`, `serde` e `thiserror`, ma **non dichiara ancora** `tauri = "2"`, `tauri-build = "2"` ne le feature `tauri-runtime` / `tauri-native`, ed e privo di `build.rs`, `src/ipc_bridge.rs`, `capabilities/default.json` e `icons/`.
   - `crates/ares-desktop-os/tauri.conf.json` esiste gia configurato con `productName: "ARES-MedOS"`, `identifier: "org.areshealth.medos"`, `frontendDist: "../../ares-cockpit/dist"`, finestra `medos-primary` (`1440x900`, `decorations: false`, `transparent: false`) e CSP air-gapped, mentre `ares-cockpit/src/lib/useTelemetry.ts`, `OsSystemStatusBar.tsx` e `OsCommandPalette.tsx` invocano gia `window.__TAURI_INTERNALS__` (`subscribe_binary_telemetry`, `get_full_wire_snapshot`, `apply_what_if_patch`, `invoke_fastmcp_tool`, `get_os_status_bar_state`, `plugin:window|*`). Tuttavia, `crates/ares-desktop-os/src/main.rs` avvia oggi solo il runtime `Tokio` e il mirror HTTP/WS `build_axum_router` senza aprire alcuna finestra nativa `WKWebView`/Metal o `WebKitGTK`/Vulkan.
2. **Gap Bus POSIX Shared-Memory `iceoryx2` & Bridge Delay-Tolerant `Zenoh` DSN in `crates/ares-server-cli`:**
   - Sebbene `crates/ares-core-types/src/binary_ipc.rs` fornisca gia `BinaryTelemetryFrame` (`#[repr(C, align(64))]`, `ARES_BINARY_FRAME_BYTES = 128`, `CRC-32C` Castagnoli a offset `104..108`, `SeqlockTelemetryRing<N>`) e `crates/ares-core-types/src/error.rs` definisca `ShmRingEmpty`, `ShmRingTornReadExhausted` e `ShmRingUnavailable`, `crates/ares-server-cli/Cargo.toml` e `crates/ares-server-cli/src/lib.rs` **non implementano ancora** `src/shm_bus.rs` ne la feature `--features shm-ipc`.
3. **Gap Packaging `.app` / `AppImage` in `scripts/launch_ares_medos.sh`:**
   - `scripts/launch_ares_medos.sh` invoca esclusivamente `cargo run -p ares-desktop-os -- --mode desktop` senza compilare ne avviare la finestra nativa `Tauri v2` e senza generare il bundle autonomo macOS Apple Silicon (`target/release/bundle/macos/ARES-MedOS.app`) o i pacchetti Linux (`AppImage` / `.deb`).

La **Fase 30 (`L2`)** chiude definitivamente questi tre gap mantenendo **zero regressioni** sul workflow headless CI (`cargo test --workspace` e `./scripts/launch_ares_medos.sh --verify` continuano a compilare ed eseguire senza `libwebkit2gtk` o server grafico X11/Wayland) e sul fallback browser (`127.0.0.1:8080`).

### 1.2 Riferimenti Open-Source, Standard Aerospaziali e Tracciabilita Normativa

| Fonte / Repository / Standard | Riferimento / URL & Licenza | Contributo Architetturale nella Fase 30 (`L2`) |
| :--- | :--- | :--- |
| **`tauri-apps/tauri` (`v2`) & `wry`** | `https://github.com/tauri-apps/tauri` (`Apache-2.0 OR MIT`) | Finestra OS nativa frameless su `WKWebView` + Apple Metal (`macOS`) e `WebKitGTK` + Vulkan (`Linux`); canale IPC binario `tauri::ipc::Channel<tauri::ipc::Response>` (`InvokeResponseBody::Raw`) per trasferimento diretto `ArrayBuffer` da `128 B` in `< 50 us`; isolamento ACL Capabilities v2. |
| **`eclipse-iceoryx/iceoryx2`** | `https://github.com/eclipse-iceoryx/iceoryx2` (`Apache-2.0 OR MIT`) | Middleware IPC POSIX shared-memory (`shm_open`/`mmap`) **100% daemonless** in Rust puro (nessun demone `RouDi` single-point-of-failure); trait `ZeroCopySend`, prestito `publisher.loan_uninit()` in `< 100 ns` e policy `.enable_safe_overflow(true)` non bloccante. |
| **`eclipse-zenoh/zenoh` (`v1`)** | `https://github.com/eclipse-zenoh/zenoh` (`EPL-2.0 OR Apache-2.0`) | Pub/sub spaziale unificato con trasporto `shared-memory` locale e routing delay-tolerant su key expression gerarchiche `ares/crew/{astronaut_id}/vitals/frame` e `ares/crew/{astronaut_id}/alerts/medops` con disattivazione rigorosa del multicast esterno (air-gap). |
| **`ARINC 653P1-5` & Cheptsov et al. (2018, 2023)** | *Avionics Application Software Standard Interface*; *Proc. ISP RAS* (`DOI: 10.1109/ispras.2018.00009`) | Isolamento temporale e spaziale tra partizioni: il ciclo fisiologico deterministico a `20 Hz` (`CausalOdeStl`) usa esclusivamente primitive wait-free/`try_send` verso UI `Tauri`, `iceoryx2` e `Zenoh`, impedendo qualsiasi inversione di priorita o backpressure. |
| **`NASA-STD-3001 Vol. 2 Rev F`** | Clauses `[V2 10001]`, `[V2 10002]`, `[V2 10005]`, `[V2 10022]`, `[V2 10152]`, `[V2 10027]` (Luglio 2026) | `[V2 10001]`: workstation kiosk coerente `#000000` OLED senza decorazioni browser; `[V2 10002]`: prevenzione di stati ambigui su canali assenti (`MASK_RMSSD_MS=0`); `[V2 10005]`: barra di stato persistente con 4 partizioni e zona habitat; `[V2 10022]`: feedback discreto $\le 100\,\text{ms}$; `[V2 10152]`: telemetria continua $\le 50\,\text{ms}$; `[V2 10027]`: interlock contro attuazioni involontarie e ACL IPC. |
| **`NASA-STD-3001 Vol. 1 Rev C` `[V1 3006]`** | *Earth-Independent Medical Operations (EIMO)* | Gestione esplicita del ritardo radio Terra-Marte One-Way Light Time ($\tau_{\text{OWLT}} \in [240\,\text{s}, 1440\,\text{s}]$, nominale `852.0 s` in `OwltMarsCommState`) e blackout di congiunzione solare fino a 14 giorni tramite coda Store-and-Forward locale. |
| **Issue `#11` (`PR #20`) & Issue `#12` (`MODEL_EVIDENCE_AUDIT.md`)** | `memory-bank/experienceLog.md` (`Entries 006, 008, 009`) | Preservazione inviolabile di `FLAG_BEAT_INTERVALS_NOT_AVAILABLE` (`rmssd_ms = None`, bit `MASK_RMSSD_MS = 0`) e `FLAG_ILLUSTRATIVE_UNVALIDATED` attraverso `Channel<Response>`, `Iox2TelemetryFrame` e payload `Zenoh`. |

---

## 2. Architectural Decisions & Target Modules

### 2.1 Separazione a Tre Livelli delle Feature Cargo (Portabilita CI Headless vs Finestra Nativa)
Su runner Linux CI privi dei pacchetti di sistema `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` e `libayatana-appindicator3-dev`, compilare incondizionatamente `tauri` (`wry`) fallirebbe in `pkg-config`. Pertanto `crates/ares-desktop-os/Cargo.toml` adotta una stratificazione a tre livelli:

1. **`default = []` (Modalita Headless Pura / Workspace Default):**
   - Compila `AresMedOsWorkstationShell`, `SeqlockTelemetryRing<64>`, il server loopback `axum` (`127.0.0.1:8080`) e l'interfaccia pura di `ipc_bridge.rs` senza alcuna dipendenza GUI nativa. Garantisce che `cargo check --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` e `./scripts/agent_probe.sh` restino istantanei e privi di dipendenze di sistema esterne.
2. **`--features tauri-runtime` (Headless Tauri IPC Bridge & Contract Harness):**
   - Abilita in `crates/ares-desktop-os/src/ipc_bridge.rs` il router di comando tipizzato `HeadlessTauriBridge` e lo stream sink raw da `128 B` (`RawIpcFramePacket`), riproducendo esattamente la semantica di serializzazione e framing di `InvokeResponseBody::Raw` e i 5 comandi registrati da `ares-cockpit` senza richiedere un display server X11/Wayland/Aqua.
3. **`--features tauri-native` (Full Native OS Windowing: `WKWebView`/Metal & `WebKitGTK`/Vulkan):**
   - Implica `tauri-runtime` e attiva `dep:tauri` (`version = "2"`) e `dep:tauri-build` (`version = "2"`).
   - Esegue `tauri_build::build()` in `crates/ares-desktop-os/build.rs`, compila i macro-handler `#[tauri::command]` su `tauri::State<'_, AresMedOsWorkstationShell>` e `tauri::ipc::Channel<tauri::ipc::Response>`, applica `capabilities/default.json` + `tauri.conf.json`, ed apre la finestra nativa frameless `#000000` OLED `medos-primary` (`1440x900`).
4. **`--features shm-ipc` (Real POSIX SHM `iceoryx2` + `Zenoh` DSN Adapter):**
   - Attivabile sia su `ares-server-cli` sia su `ares-desktop-os` (`ares-server-cli/shm-ipc`), abilita `crates/ares-server-cli/src/shm_bus.rs` e aggancia il `NonBlockingShmDsnDispatcher` a `SharedMissionState`.

### 2.2 Invariante di Threading macOS (`NSApplication` Main Thread) vs Runtime Multi-Thread `Tokio`
Su macOS (`aarch64-apple-darwin`), `WKWebView` e `AppKit` (`NSApplication`) impongono che l'event loop della finestra nativa risieda obbligatoriamente sul **Main Thread del processo (`Thread 0`)**; inoltre, invocare `tauri::Builder::run` dall'interno di una `async fn main` annotata con `#[tokio::main]` genera un conflitto di runtime annidato.

Per risolvere strutturalmente entrambi i vincoli senza alcun `.unwrap()` o `.expect()`:
- `crates/ares-desktop-os/src/main.rs` utilizza una funzione sincrona `fn main() -> anyhow::Result<()>` che costruisce esplicitamente il runtime `tokio::runtime::Builder::new_multi_thread().enable_all().build().context(...)?`.
- Quando `tauri-native` e attiva e la modalita selezionata e nativa (`DesktopMode::NativeWindow` o `DesktopMode::Desktop` con flag `--native`), registra l'handle Tokio globale in Tauri tramite `tauri::async_runtime::set(rt.handle().clone())`, avvia in background su `rt.spawn(...)` il loop deterministico `20 Hz` (`advance_tick`), il co-processore `1 Hz` (`Timestral`) e il mirror `Axum` non bloccante su `127.0.0.1:8080`, e cede infine il **Thread 0** a `tauri::Builder::default()...run(tauri::generate_context!())`.

### 2.3 Risoluzione Deterministica di `data/bidmc` nel Bundle macOS `ARES-MedOS.app`
Quando `ARES-MedOS.app` viene avviato dal Finder o con `open target/release/bundle/macos/ARES-MedOS.app`, la working directory del processo impostata da `launchd` e `/` (root), per cui un percorso relativo statico `PathBuf::from("data/bidmc")` fallirebbe con `DesktopShellError::MissingDataDir`. La Fase 30 (`L2`) include `../../data/bidmc/*` nella chiave `bundle.resources` di `tauri.conf.json` e introduce `resolve_medos_data_dir(explicit: Option<&Path>) -> Result<PathBuf, DesktopShellError>` con catena di ricerca deterministica:
1. Override esplicito CLI `--data-dir` o variabile d'ambiente `ARES_MEDOS_DATA_DIR` (se contenente `bidmc_01_Numerics.csv`);
2. Directory di lavoro corrente `./data/bidmc` (sviluppo da root workspace);
3. Bundle macOS `current_exe()/../../Resources/data/bidmc` o directory risorse Linux `/usr/lib/ARES-MedOS/data/bidmc`;
4. Fallback workspace relativo a `CARGO_MANIFEST_DIR/../../data/bidmc` (test locali).

### 2.4 Topologia Unificata IPC & Tabella Moduli Target

```
+---------------------------------------------------------------------------------------------------+
|                        ARES-MedOS Native Process (crates/ares-desktop-os)                         |
|                                                                                                   |
|  [Tokio Multi-Thread Pool]                                                                        |
|   +-- 20 Hz Physiological Producer: SharedMissionState::advance_tick(50 ms)  [p99.9 = 5.58 us]    |
|   |     |-- 1. SeqlockTelemetryRing<64>::publish(&BinaryTelemetryFrame)      [< 85 ns, lock-free] |
|   |     |-- 2. NonBlockingShmDsnDispatcher::try_dispatch(...)                [< 150 ns, wait-free]|
|   |     +-- 3. broadcast::Sender<String> (solo se receiver_count() > 0)      [mirror WS :8080]    |
|   +-- 1 Hz Worker: spawn_blocking(run_1hz_timestral_step)                                         |
|   +-- Loopback Mirror: axum::serve(127.0.0.1:8080) [graceful fallback su AddrInUse]               |
|                                                                                                   |
|  [Thread 0: OS Main Thread - Tauri v2 Native Shell (--features tauri-native)]                     |
|   +-- WKWebView (Apple Metal) / WebKitGTK (Vulkan) -> medos-primary (1440x900, #000000 OLED)      |
|   +-- Channel<tauri::ipc::Response> (InvokeResponseBody::Raw 128B ArrayBuffer, < 50 us)           |
|   +-- #[tauri::command]: get_full_wire_snapshot | apply_what_if_patch | invoke_fastmcp_tool       |
|                          | get_os_status_bar_state | subscribe_binary_telemetry                   |
+------------------------------------+-----------------------------------+--------------------------+
                                     |                                   |
        POSIX SHM (shm_open / mmap)  | (< 100 ns, 0-copy)                | Zenoh SHM + DSN Outbox
        eclipse-iceoryx/iceoryx2     v                                   v (OWLT 852s / Blackout)
+------------------------------------+---+   +---------------------------+--------------------------+
| Service: ares/medos/telemetry/v1       |   | Key 1: ares/crew/{id}/vitals/frame (128B Raw, Drop)  |
| Type: Iox2TelemetryFrame (128B, al.64) |   | Key 2: ares/crew/{id}/alerts/medops (Store&Forward)  |
| Policy: enable_safe_overflow(true)     |   | Air-Gap: multicast=false, listen=tcp/127.0.0.1:0     |
+----------------------------------------+   +------------------------------------------------------+
```

| File / Modulo | Azione | Simboli & Responsabilita Principali |
| :--- | :--- | :--- |
| `crates/ares-desktop-os/Cargo.toml` | **UPDATE** | Feature `tauri-runtime`, `tauri-native = ["tauri-runtime", "dep:tauri", "dep:tauri-build"]`, `shm-ipc = ["ares-server-cli/shm-ipc"]`. |
| `crates/ares-desktop-os/build.rs` | **CREATE** | Esegue `tauri_build::try_build(...)` solo sotto `#[cfg(feature = "tauri-native")]`; no-op in modalita headless CI. |
| `crates/ares-desktop-os/capabilities/default.json` | **CREATE** | ACL `Tauri v2` ristretta alla finestra `medos-primary`: abilita i 5 comandi IPC e `core:window:allow-{minimize,toggle-maximize,close,start-dragging}`. |
| `crates/ares-desktop-os/tauri.conf.json` | **UPDATE** | Configura `bundle` (`targets: ["app", "dmg", "deb", "appimage"]`, `resources`, `macOS.minimumSystemVersion: "11.0"`) preservando la CSP air-gapped. |
| `crates/ares-desktop-os/src/ipc_bridge.rs` | **CREATE** | `IpcRawFrameSink`, `HeadlessTauriBridge`, `stream_seqlock_frames_to_sink` e modulo `#[cfg(feature = "tauri-native")] pub mod tauri_commands`. |
| `crates/ares-desktop-os/src/lib.rs` | **UPDATE** | Esporta `pub mod ipc_bridge;`, `resolve_medos_data_dir`, e propaga la modalita di trasporto effettiva (`TAURI_NATIVE_IPC` vs `HEADLESS_SEQLOCK_IPC`). |
| `crates/ares-desktop-os/src/main.rs` | **UPDATE** | Aggiunge `DesktopMode::NativeWindow` e flag `--native`, runtime `Tokio` esplicito, `tauri::async_runtime::set` e avvio finestra nativa `ARES-MedOS`. |
| `crates/ares-server-cli/Cargo.toml` | **UPDATE** | Aggiunge `shm-ipc = ["dep:iceoryx2", "dep:zenoh"]` con `iceoryx2` e `zenoh` (`features = ["shared-memory"]`) opzionali. |
| `crates/ares-server-cli/src/lib.rs` | **UPDATE** | Espone `#[cfg(feature = "shm-ipc")] pub mod shm_bus;`. |
| `crates/ares-server-cli/src/shm_bus.rs` | **CREATE** | `ShmBusError`, `Iox2TelemetryFrame`, `Iox2PosixShmPublisher`, `Iox2PosixShmSubscriber`, `DsnMedOpsAlertEnvelope`, `ZenohDsnAdapter`, `NonBlockingShmDsnDispatcher`. |
| `crates/ares-server-cli/src/ws_server.rs` | **UPDATE** | Campo opzionale `shm_dispatcher` in `SharedMissionState` invocato in $O(1)$ (`try_dispatch`) dentro `advance_tick`, `apply_stress_test_patch`, `ingest_wearable_packet`. |
| `scripts/launch_ares_medos.sh` | **UPDATE** | Aggiunge `--native`, `--bundle-macos`, `--bundle-linux`, `--shm`, firma ad-hoc Apple Silicon (`codesign --force --deep --sign -`) e preserva `--verify`. |

---

## 3. Tauri v2 Native Window, 128B Channel IPC & iceoryx2/Zenoh Specification

### 3.1 Formalizzazione Matematica del Budget Temporale, Isolamento `ARINC 653`, OWLT Marte e Invarianti `#11`/`#12`

#### A. Equazione di Latenza End-to-End sul Canale Binario `Tauri v2` (`[V2 10152]`)
Sia $F_k \in \{0,1\}^{1024}$ (`128` byte, `2` cache line da `64` byte) il `BinaryTelemetryFrame` prodotto al tick $k$ ($f_s = 20\,\text{Hz}$, periodo $T_s = 50\,\text{ms}$). Il tempo di attraversamento end-to-end dal ring buffer Rust al `DataView` TypeScript (`decodeBinaryTelemetryFrame` in `ares-cockpit/src/lib/binaryTelemetryDecoder.ts`) attraverso `InvokeResponseBody::Raw` vale:
$$L_{\text{IPC,raw}} = t_{\text{seqlock\_read}} + t_{\text{ipc\_raw\_ pipe}} + t_{\text{crc32c\_js}} + t_{\text{DataView}}$$
Con i valori misurati e vincolati su Apple Silicon (`aarch64`) / Linux (`x86_64`):
- $t_{\text{seqlock\_read}} \approx 42\text{–}84\,\text{ns}$ (`SeqlockTelemetryRing::read_latest_bytes`, zero mutex);
- $t_{\text{ipc\_raw\_pipe}} \approx 18\text{–}38\,\mu\text{s}$ (trasferimento binario `ipc://localhost` `ArrayBuffer` da `128 B` senza escape UTF-8 ne `JSON.stringify`/`JSON.parse`);
- $t_{\text{crc32c\_js}} + t_{\text{DataView}} \approx 1.5\text{–}3.0\,\mu\text{s}$ (`CRC32C_TABLE` lookup su `104` byte + `16` letture `getFloat32`).

Ne segue:
$$L_{\text{IPC,raw}} < 50\,\mu\text{s} = 0.05\,\text{ms} \implies \frac{\text{SLA}_{[\text{V2 10152}]}}{\sup L_{\text{IPC,raw}}} = \frac{50\,\text{ms}}{0.05\,\text{ms}} = 1000\times$$
e per i comandi discreti `apply_what_if_patch` (`[V2 10022]`, limite $100\,\text{ms}$):
$$L_{\text{WhatIf}} = t_{\text{ipc\_cmd}} + t_{\text{ODE+ADHG+NQS}} < 200\,\mu\text{s} = 0.20\,\text{ms} \implies \frac{\text{SLA}_{[\text{V2 10022}]}}{\sup L_{\text{WhatIf}}} = 500\times.$$

#### B. Contenimento Temporale `ARINC 653` per Produttore Fisiologico a `20 Hz`
Sia $\tau_{\text{sub}} \in [0, +\infty]$ il ritardo arbitrario (incluso crash `SIGSTOP`/`SIGKILL` o saturazione socket) di un qualsiasi consumatore esterno (`WKWebView`, processo companion `iceoryx2`, o router `Zenoh`). Il tempo speso dal produttore critico `SharedMissionState::advance_tick` nella sezione di pubblicazione multi-trasporto e superiormente limitato da una costante indipendente da $\tau_{\text{sub}}$:
$$\forall \tau_{\text{sub}} \in [0, +\infty]: \quad \Delta t_{\text{pub}}(\tau_{\text{sub}}) = t_{\text{seqlock\_write}} + t_{\text{mpsc\_try\_send}} \le C_{\max} < 250\,\text{ns} \ll T_{\text{tick\_budget}} = 150\,\mu\text{s}.$$
In `iceoryx2`, la proprieta analoga sul thread dedicato `ares-iox2-pub` e garantita configurando `.enable_safe_overflow(true)` sul servizio pub/sub: quando il buffer circolare POSIX SHM di un sottoscrittore lento raggiunge `subscriber_max_buffer_size`, l'allocatore SHM ricicla atomicamente lo slot piu vecchio in $O(1)$ anziche bloccare `publisher.loan_uninit()`.

#### C. Semantica Delay-Tolerant `Zenoh` DSN sotto `OwltMarsCommState` (`4–24 min`)
Durante il transito e le operazioni di superficie marziana ($\tau_{\text{OWLT}}(t) \in [240\,\text{s}, 1440\,\text{s}]$, valore nominale predefinito $\tau_{\text{OWLT}} = 852.0\,\text{s} = 14\,\text{m } 12\,\text{s}$ in `OwltMarsCommState`), un evento clinico generato a bordo all'istante $t_{\text{emit}}$ non puo ricevere risposta da Terra prima di:
$$t_{\text{closed\_loop\_Earth}} \ge t_{\text{emit}} + 2\tau_{\text{OWLT}}(t) \in [t_{\text{emit}} + 480\,\text{s},\; t_{\text{emit}} + 2880\,\text{s}].$$
Poiche i fenomeni acuti presidiati dai 3 Hard Clinical Safety Gates (es. sincope ortostatica in camera LBNP a $-30\,\text{mmHg}$ con $\Delta\text{SBP} > 15\,\text{mmHg}$ o $\text{HR} > 115\,\text{bpm}$) evolvono su una scala caratteristica $T_{\text{syncope}} \approx 15\text{–}45\,\text{s} \ll 2\tau_{\text{OWLT}}$, l'adattatore `Zenoh` separa rigorosamente due key expression:
1. **`ares/crew/{astronaut_id}/vitals/frame`** (*Intra-Habitat Real-Time Bus*): trasporta i `128` byte grezzi di `BinaryTelemetryFrame` su memoria condivisa `Zenoh` (`CongestionControl::Drop`, `Priority::RealTime`) per console locali dell'habitat senza mai accumulare backlog in RAM;
2. **`ares/crew/{astronaut_id}/alerts/medops`** (*Delay-Tolerant DSN Store-and-Forward*): trasporta envelope strutturati `DsnMedOpsAlertEnvelope` contenenti il timestamp di emissione $t_{\text{emit}}$, il ritardo $\tau_{\text{OWLT}}$, la stima deterministica di ricezione al Mission Control $t_{\text{MCC}} = t_{\text{emit}} + \lfloor 1000 \cdot \tau_{\text{OWLT}} \rfloor$, lo stato `eimo_autonomous_active = true`, e una coda circolare locale limitata (`MAX_DSN_OUTBOX_ALERTS = 256`) che trattiene gli allarmi durante i blackout solari (`blackout_active == true`) e li drena automaticamente al ripristino del link.

#### D. Preservazione Invariante Bit-per-Bit di Issue `#11` e Issue `#12` su Tutti e Tre i Trasporti
Sia $B \in [0, 255]^{128}$ l'array restituito da `BinaryTelemetryFrame::to_le_bytes()`. Poiche `Channel<Response>`, `Iox2TelemetryFrame` e `Zenoh` (`vitals/frame`) trasmettono **esattamente lo stesso array immutabile $B$** verificato dal polinomio Castagnoli `CRC-32C` (`0x82F6_3B78` su `B[0..104]`, memorizzato in `B[104..108]`), valgono identicamente su ogni trasporto le due implicazioni algebriche:
$$\text{rmssd\_ms} = \texttt{None} \implies \begin{cases} (\texttt{validity\_mask} \mathbin{\&} \texttt{MASK\_RMSSD\_MS}) = 0 & (\text{bit } 4 = 0 \text{ a offset } 24..28) \\ \texttt{B}[48..52] = \texttt{f32::NAN.to\_le\_bytes()} & (\text{mai } 0.0) \\ (\texttt{quality\_flags\_mask} \mathbin{\&} \texttt{FLAG\_BEAT\_INTERVALS\_NOT\_AVAILABLE}) \ne 0 & (\text{bit } 6 = 1 \text{ a offset } 28..32) \end{cases}$$
$$\text{model\_validation\_status} = \texttt{IllustrativeUnvalidated} \implies (\texttt{quality\_flags\_mask} \mathbin{\&} \texttt{FLAG\_ILLUSTRATIVE\_UNVALIDATED}) \ne 0 \quad (\text{bit } 7 = 1).$$

---

### 3.2 Manifesti Cargo, Build Script, Capabilities ACL e `tauri.conf.json` (`crates/ares-desktop-os`)

#### 3.2.1 `crates/ares-desktop-os/Cargo.toml`
```toml
[package]
name = "ares-desktop-os"
version = "0.1.0"
edition = "2024"
description = "ARES-MedOS Pure-Rust Mission Workstation OS Shell, Tauri v2 Native Window, Seqlock 128B Binary IPC Bridge, and FastMCP Command Palette Runtime"
license = "MIT OR Apache-2.0"

[features]
default = []
# Abilita il bridge IPC tipizzato headless (testabile in CI Linux senza GTK/WebKit).
tauri-runtime = []
# Abilita il windowing nativo Tauri v2 (WKWebView/Metal su macOS, WebKitGTK/Vulkan su Linux).
tauri-native = ["tauri-runtime", "dep:tauri", "dep:tauri-build"]
# Abilita l'adattatore reale POSIX SHM iceoryx2 + Zenoh DSN in ares-server-cli.
shm-ipc = ["ares-server-cli/shm-ipc"]

[dependencies]
anyhow = "1.0"
ares-causal-graph = { path = "../ares-causal-graph" }
ares-core-types = { path = "../ares-core-types" }
ares-medops-playbooks = { path = "../ares-medops-playbooks" }
ares-nqs-stl = { path = "../ares-nqs-stl" }
ares-security-privacy = { path = "../ares-security-privacy" }
ares-server-cli = { path = "../ares-server-cli" }
ares-telemetry-ingest = { path = "../ares-telemetry-ingest" }
axum = { version = "0.8", features = ["ws"] }
clap = { version = "4.5", features = ["derive"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tauri = { version = "2.2", optional = true }
thiserror = "2.0"
tokio = { version = "1.40", features = ["full"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[build-dependencies]
tauri-build = { version = "2.0", optional = true }
```

#### 3.2.2 `crates/ares-desktop-os/build.rs`
```rust
//! Build script condizionale per `crates/ares-desktop-os`.
//! Esegue `tauri_build::build()` esclusivamente quando la feature `tauri-native` e attiva,
//! preservando la compilazione zero-GUI su ambienti CI headless (`default` e `tauri-runtime`).

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=capabilities/default.json");

    #[cfg(feature = "tauri-native")]
    {
        tauri_build::build();
    }
}
```

#### 3.2.3 `crates/ares-desktop-os/capabilities/default.json`
In `Tauri v2`, i controlli finestra invocati da `ares-cockpit/src/modules/os-shell/OsSystemStatusBar.tsx` (`plugin:window|minimize`, `plugin:window|toggle_maximize`, `plugin:window|close`) e i comandi IPC vengono autorizzati tramite ACL esplicita secondo il principio del privilegio minimo (`NASA-STD-3001 [V2 10027]`):
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "medos-default-capability",
  "description": "Least-privilege air-gapped capability for ARES-MedOS primary workstation window",
  "windows": ["medos-primary"],
  "permissions": [
    "core:default",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:window:allow-start-dragging"
  ]
}
```

#### 3.2.4 Aggiornamento `crates/ares-desktop-os/tauri.conf.json`
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
        "backgroundColor": "#000000",
        "decorations": false,
        "transparent": false,
        "fullscreen": false,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://127.0.0.1:8080 ws://127.0.0.1:8080 ipc: http://ipc.localhost; img-src 'self' asset: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self';",
      "capabilities": ["medos-default-capability"]
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "deb", "appimage"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": {
      "../../data/bidmc/MANIFEST.json": "data/bidmc/MANIFEST.json",
      "../../data/bidmc/bidmc_01_Numerics.csv": "data/bidmc/bidmc_01_Numerics.csv",
      "../../data/bidmc/bidmc_02_Numerics.csv": "data/bidmc/bidmc_02_Numerics.csv",
      "../../data/bidmc/bidmc_03_Numerics.csv": "data/bidmc/bidmc_03_Numerics.csv"
    },
    "macOS": {
      "minimumSystemVersion": "11.0",
      "signingIdentity": "-"
    },
    "linux": {
      "deb": {
        "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"]
      }
    }
  }
}
```

---

### 3.3 Implementazione `crates/ares-desktop-os/src/ipc_bridge.rs`, `src/lib.rs` e `src/main.rs`

#### 3.3.1 `crates/ares-desktop-os/src/ipc_bridge.rs`
```rust
//! Fase 30 (L2): Bridge IPC `Tauri v2` per `ARES-MedOS`.
//!
//! Separa rigorosamente:
//! 1. La logica deterministica headless (`HeadlessTauriBridge` / `RawFrameSink`), compilabile e
//!    testabile in CI con `--features tauri-runtime` senza dipendenze grafiche di sistema;
//! 2. Gli handler `#[tauri::command]` reali sotto `#[cfg(feature = "tauri-native")]`, che
//!    trasmettono i `128` byte di `BinaryTelemetryFrame` via `tauri::ipc::Channel<tauri::ipc::Response>`
//!    (`InvokeResponseBody::Raw`, zero JSON, `< 50 us`) verso `ares-cockpit/src/lib/useTelemetry.ts`.

use crate::{AresMedOsWorkstationShell, DesktopShellError, OsStatusBarState};
use ares_core_types::binary_ipc::{ARES_BINARY_FRAME_BYTES, BinaryTelemetryFrame};
use ares_server_cli::wire_contract::{StressTestPatchRequest, WireTelemetryPacket};
use std::time::Duration;

/// Astrazione zero-JSON di un canale IPC binario verso il frontend.
pub trait RawBinaryFrameSink: Send + Sync + 'static {
    /// Invia esattamente 128 byte little-endian (`BinaryTelemetryFrame`) al ricevitore UI.
    fn send_raw_frame(&self, bytes: [u8; ARES_BINARY_FRAME_BYTES]) -> Result<(), DesktopShellError>;
}

/// Emette un frame binario solo se il numero di sequenza `seq` e avanzato rispetto a `last_seq`,
/// evitando copie ridondanti sul canale IPC quando nessun nuovo tick e stato prodotto.
pub fn emit_next_seqlock_frame<S: RawBinaryFrameSink>(
    shell: &AresMedOsWorkstationShell,
    sink: &S,
    last_seq: &mut Option<u64>,
) -> Result<bool, DesktopShellError> {
    let bytes = shell.ipc_get_binary_frame_bytes()?;
    let seq = u64::from_le_bytes([
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    ]);
    if last_seq.is_some_and(|prev| prev == seq) {
        return Ok(false);
    }
    sink.send_raw_frame(bytes)?;
    *last_seq = Some(seq);
    Ok(true)
}

/// Snapshot completo `WireTelemetryPacket` (usato all'avvio o su cambio alert/playbook/habitat).
pub fn bridge_get_full_wire_snapshot(
    shell: &AresMedOsWorkstationShell,
) -> Result<WireTelemetryPacket, DesktopShellError> {
    shell
        .mission
        .latest_wire_snapshot()
        .ok_or(DesktopShellError::StateLockUnavailable)
}

/// Applicazione in-process `< 200 us` di uno scenario `What-If` senza avanzare il cursore `1 Hz`.
pub fn bridge_apply_what_if_patch(
    shell: &AresMedOsWorkstationShell,
    patch: StressTestPatchRequest,
) -> Result<WireTelemetryPacket, DesktopShellError> {
    shell.ipc_post_stress_test(patch)
}

/// Esecuzione in-process `FastMCP` Context-Mode (`<= 600` byte, `< 150` token) con `StrictMcpSanitizer`.
pub fn bridge_invoke_fastmcp_tool(
    shell: &AresMedOsWorkstationShell,
    request_json: &str,
) -> Result<String, DesktopShellError> {
    shell.ipc_invoke_fastmcp_tool(request_json)
}

/// Stato della barra di sistema `ARES-MedOS` (`ARINC 653`, `SOL/MET`, `OWLT`, deontica habitat).
pub fn bridge_get_os_status_bar_state(
    shell: &AresMedOsWorkstationShell,
) -> Result<OsStatusBarState, DesktopShellError> {
    shell.ipc_get_os_status_bar_state()
}

/// Bridge headless deterministico attivo con `--features tauri-runtime` per test CI senza WebKit/GTK.
#[cfg(feature = "tauri-runtime")]
pub struct HeadlessTauriBridge {
    shell: AresMedOsWorkstationShell,
}

#[cfg(feature = "tauri-runtime")]
impl HeadlessTauriBridge {
    pub fn new(shell: AresMedOsWorkstationShell) -> Self {
        Self { shell }
    }

    pub fn poll_raw_128b_channel_frame(
        &self,
        last_seq: &mut Option<u64>,
    ) -> Result<Option<[u8; ARES_BINARY_FRAME_BYTES]>, DesktopShellError> {
        struct CaptureSink(std::sync::Mutex<Option<[u8; ARES_BINARY_FRAME_BYTES]>>);
        impl RawBinaryFrameSink for CaptureSink {
            fn send_raw_frame(
                &self,
                bytes: [u8; ARES_BINARY_FRAME_BYTES],
            ) -> Result<(), DesktopShellError> {
                let mut guard = self
                    .0
                    .lock()
                    .map_err(|_| DesktopShellError::StateLockUnavailable)?;
                *guard = Some(bytes);
                Ok(())
            }
        }
        let sink = CaptureSink(std::sync::Mutex::new(None));
        let emitted = emit_next_seqlock_frame(&self.shell, &sink, last_seq)?;
        if !emitted {
            return Ok(None);
        }
        let captured = sink
            .0
            .lock()
            .map_err(|_| DesktopShellError::StateLockUnavailable)?;
        Ok(*captured)
    }

    pub fn decode_verified_channel_frame(
        raw: &[u8; ARES_BINARY_FRAME_BYTES],
    ) -> Result<BinaryTelemetryFrame, DesktopShellError> {
        BinaryTelemetryFrame::from_le_bytes(raw)
            .map_err(|e| DesktopShellError::BinaryFrameUnavailable(e.to_string()))
    }

    pub fn get_full_wire_snapshot(&self) -> Result<WireTelemetryPacket, DesktopShellError> {
        bridge_get_full_wire_snapshot(&self.shell)
    }

    pub fn apply_what_if_patch(
        &self,
        patch: StressTestPatchRequest,
    ) -> Result<WireTelemetryPacket, DesktopShellError> {
        bridge_apply_what_if_patch(&self.shell, patch)
    }

    pub fn invoke_fastmcp_tool(&self, request_json: &str) -> Result<String, DesktopShellError> {
        bridge_invoke_fastmcp_tool(&self.shell, request_json)
    }

    pub fn get_os_status_bar_state(&self) -> Result<OsStatusBarState, DesktopShellError> {
        bridge_get_os_status_bar_state(&self.shell)
    }
}

/// Comandi nativi `Tauri v2` compilati sotto `--features tauri-native`.
/// I nomi dei comandi e degli argomenti (`on_frame` -> `onFrame`, `patch`, `request_json` -> `requestJson`)
/// corrispondono esattamente alle chiamate `tauri.invoke(...)` in `useTelemetry.ts` e `OsCommandPalette.tsx`.
#[cfg(feature = "tauri-native")]
pub mod tauri_commands {
    use super::*;
    use tauri::State;
    use tauri::ipc::{Channel, InvokeResponseBody, Response};

    struct TauriChannelSink {
        channel: Channel<Response>,
    }

    impl RawBinaryFrameSink for TauriChannelSink {
        fn send_raw_frame(
            &self,
            bytes: [u8; ARES_BINARY_FRAME_BYTES],
        ) -> Result<(), DesktopShellError> {
            // `InvokeResponseBody::Raw` consegna direttamente un `ArrayBuffer` / `Uint8Array`
            // da 128 byte a `useTelemetry.ts` senza serializzazione JSON (`< 50 us`).
            let raw_body = Response::new(InvokeResponseBody::Raw(Vec::from(bytes)));
            self.channel
                .send(raw_body)
                .map_err(|e| DesktopShellError::BinaryFrameUnavailable(e.to_string()))
        }
    }

    #[tauri::command]
    pub async fn subscribe_binary_telemetry(
        state: State<'_, AresMedOsWorkstationShell>,
        on_frame: Channel<Response>,
    ) -> Result<(), String> {
        let shell = state.inner().clone();
        let period_ms = (1000 / u64::from(shell.config.telemetry_hz.max(1))).max(10);
        let sink = TauriChannelSink { channel: on_frame };

        tauri::async_runtime::spawn(async move {
            let mut last_seq: Option<u64> = None;
            // Invio immediato del primo frame valido senza attendere il primo periodo di 50 ms.
            if emit_next_seqlock_frame(&shell, &sink, &mut last_seq).is_err() {
                return;
            }
            let frame_period = Duration::from_millis(period_ms);
            let mut ticker =
                tokio::time::interval_at(tokio::time::Instant::now() + frame_period, frame_period);
            loop {
                ticker.tick().await;
                if emit_next_seqlock_frame(&shell, &sink, &mut last_seq).is_err() {
                    // Il canale WebView e stato chiuso (reload/chiusura finestra): uscita pulita.
                    break;
                }
            }
        });
        Ok(())
    }

    #[tauri::command]
    pub async fn get_full_wire_snapshot(
        state: State<'_, AresMedOsWorkstationShell>,
    ) -> Result<WireTelemetryPacket, String> {
        bridge_get_full_wire_snapshot(state.inner()).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn apply_what_if_patch(
        state: State<'_, AresMedOsWorkstationShell>,
        patch: StressTestPatchRequest,
    ) -> Result<WireTelemetryPacket, String> {
        bridge_apply_what_if_patch(state.inner(), patch).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn invoke_fastmcp_tool(
        state: State<'_, AresMedOsWorkstationShell>,
        request_json: String,
    ) -> Result<String, String> {
        bridge_invoke_fastmcp_tool(state.inner(), &request_json).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn get_os_status_bar_state(
        state: State<'_, AresMedOsWorkstationShell>,
    ) -> Result<OsStatusBarState, String> {
        bridge_get_os_status_bar_state(state.inner()).map_err(|e| e.to_string())
    }
}

#[allow(dead_code)]
const _: Duration = Duration::from_millis(50);
```

#### 3.3.2 Helper di Risoluzione Risorse in `crates/ares-desktop-os/src/lib.rs` e Avvio Finestra in `src/main.rs`
In `crates/ares-desktop-os/src/lib.rs` si aggiunge `pub mod ipc_bridge;` e la funzione deterministica `resolve_medos_data_dir`:
```rust
/// Risolve la directory `data/bidmc` sia in modalita workspace sia all'interno del bundle
/// nativo `ARES-MedOS.app/Contents/Resources/data/bidmc` o AppImage/deb Linux.
pub fn resolve_medos_data_dir(configured: &std::path::Path) -> Result<PathBuf, DesktopShellError> {
    let has_bidmc = |dir: &std::path::Path| dir.join("bidmc_01_Numerics.csv").is_file();

    if has_bidmc(configured) {
        return Ok(configured.to_path_buf());
    }
    if let Ok(env_dir) = std::env::var("ARES_MEDOS_DATA_DIR") {
        let candidate = PathBuf::from(env_dir);
        if has_bidmc(&candidate) {
            return Ok(candidate);
        }
    }
    if let Ok(exe_path) = std::env::current_exe()
        && let Some(exe_dir) = exe_path.parent()
    {
        let macos_resources = exe_dir.join("../Resources/data/bidmc");
        if has_bidmc(&macos_resources) {
            return Ok(macos_resources);
        }
        let linux_resources = exe_dir.join("../lib/ARES-MedOS/data/bidmc");
        if has_bidmc(&linux_resources) {
            return Ok(linux_resources);
        }
    }
    Err(DesktopShellError::MissingDataDir(configured.to_path_buf()))
}
```

In `crates/ares-desktop-os/src/main.rs`, l'entrypoint separa i worker `Tokio` dal Main Thread `AppKit`/`WKWebView`:
```rust
//! Entrypoint binario per `crates/ares-desktop-os` (`ARES-MedOS` Workstation Shell).

use anyhow::{Context, Result};
use ares_desktop_os::{AresMedOsWorkstationShell, DesktopShellConfig, resolve_medos_data_dir};
use ares_server_cli::ws_server::build_axum_router;
use clap::{Parser, ValueEnum};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum DesktopMode {
    /// Avvia il runtime 8-crate (headless + mirror HTTP/WS; oppure finestra nativa se `--native`).
    Desktop,
    /// Forza l'apertura della finestra nativa Tauri v2 (`medos-primary` 1440x900 `#000000` OLED).
    NativeWindow,
    /// Esegue lo smoke-test deterministico a 8 crate e stampa il report JSON su stdout.
    DesktopSmokeTest,
}

#[derive(Debug, Parser)]
#[command(
    name = "ares-desktop-os",
    version,
    about = "ARES-MedOS Pure-Rust Workstation OS Shell (Phase 30 / L2)"
)]
pub struct DesktopCliArgs {
    #[arg(long, value_enum, default_value_t = DesktopMode::Desktop)]
    pub mode: DesktopMode,

    #[arg(long, default_value_t = false)]
    pub native: bool,

    #[arg(long, default_value = "data/bidmc")]
    pub data_dir: PathBuf,

    #[arg(long, default_value = "127.0.0.1:8080")]
    pub bind: String,

    #[arg(long, default_value_t = 20)]
    pub telemetry_hz: u32,
}

fn spawn_background_mission_workers(
    rt: &tokio::runtime::Runtime,
    shell: &AresMedOsWorkstationShell,
    bind_addr: String,
) {
    let period_ms = (1000 / u64::from(shell.config.telemetry_hz.max(1))).max(10);
    let tick_shell = shell.clone();
    rt.spawn(async move {
        let frame_period = Duration::from_millis(period_ms);
        let mut interval =
            tokio::time::interval_at(tokio::time::Instant::now() + frame_period, frame_period);
        loop {
            interval.tick().await;
            let _ = tick_shell.advance_tick(frame_period);
        }
    });

    let timestral_shell = shell.clone();
    rt.spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            let worker = timestral_shell.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let _ = worker.mission.run_1hz_timestral_step();
            })
            .await;
        }
    });

    let mirror_shell = shell.clone();
    rt.spawn(async move {
        let app = build_axum_router(mirror_shell.mission.clone());
        match tokio::net::TcpListener::bind(&bind_addr).await {
            Ok(listener) => {
                mirror_shell.ws_mirror_bound.store(true, Ordering::Relaxed);
                tracing::info!(
                    bind = %bind_addr,
                    "ARES-MedOS HTTP/WS loopback mirror bound alongside Seqlock IPC"
                );
                let _ = axum::serve(listener, app).await;
            }
            Err(err) => {
                tracing::warn!(
                    bind = %bind_addr,
                    error = %err,
                    "loopback port already bound; continuing with in-process Tauri/Seqlock IPC"
                );
            }
        }
    });
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .init();

    let args = DesktopCliArgs::parse();
    let resolved_data_dir = resolve_medos_data_dir(&args.data_dir)
        .context("failed to locate PhysioNet BIDMC data directory")?;

    let config = DesktopShellConfig {
        data_dir: resolved_data_dir,
        enable_loopback_ws_mirror: true,
        loopback_bind_addr: args.bind.clone(),
        telemetry_hz: args.telemetry_hz.max(1),
        air_gapped_csp_enforced: true,
    };

    let shell = AresMedOsWorkstationShell::initialize(config)
        .context("failed to initialize AresMedOsWorkstationShell")?;

    if args.mode == DesktopMode::DesktopSmokeTest {
        let report = shell
            .run_desktop_smoke_test()
            .context("ARES-MedOS desktop smoke test failed")?;
        let json = serde_json::to_string_pretty(&report)
            .context("failed to serialize smoke test report")?;
        println!("{json}");
        return Ok(());
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("failed to build multi-thread Tokio runtime for ARES-MedOS")?;

    let launch_native = args.native || args.mode == DesktopMode::NativeWindow;

    if launch_native {
        #[cfg(feature = "tauri-native")]
        {
            tauri::async_runtime::set(rt.handle().clone());
            spawn_background_mission_workers(&rt, &shell, args.bind);

            tauri::Builder::default()
                .manage(shell)
                .invoke_handler(tauri::generate_handler![
                    ares_desktop_os::ipc_bridge::tauri_commands::subscribe_binary_telemetry,
                    ares_desktop_os::ipc_bridge::tauri_commands::get_full_wire_snapshot,
                    ares_desktop_os::ipc_bridge::tauri_commands::apply_what_if_patch,
                    ares_desktop_os::ipc_bridge::tauri_commands::invoke_fastmcp_tool,
                    ares_desktop_os::ipc_bridge::tauri_commands::get_os_status_bar_state,
                ])
                .run(tauri::generate_context!())
                .context("ARES-MedOS native Tauri v2 window terminated with error")?;
            return Ok(());
        }
        #[cfg(not(feature = "tauri-native"))]
        {
            anyhow::bail!(
                "native window requested (--native / --mode native-window), but binary was compiled without `--features tauri-native`"
            );
        }
    }

    spawn_background_mission_workers(&rt, &shell, args.bind);
    rt.block_on(async {
        tokio::signal::ctrl_c()
            .await
            .context("failed waiting for shutdown signal")
    })
}
```

---

### 3.4 Implementazione `crates/ares-server-cli/src/shm_bus.rs` (`--features shm-ipc`) e Hook in `ws_server.rs`

#### 3.4.1 `crates/ares-server-cli/Cargo.toml` & `crates/ares-server-cli/src/lib.rs`
```toml
# crates/ares-server-cli/Cargo.toml
[package]
name = "ares-server-cli"
version = "0.1.0"
edition = "2024"
description = "Dual-Transport Tokio Orchestrator: Axum 20 Hz WebSocket Telemetry Server + Native FastMCP JSON-RPC 2.0 stdio Server + Optional POSIX SHM iceoryx2 & Zenoh DSN Adapter"
license = "MIT OR Apache-2.0"

[features]
default = []
shm-ipc = ["dep:iceoryx2", "dep:zenoh"]

[dependencies]
ares-core-types = { path = "../ares-core-types" }
ares-telemetry-ingest = { path = "../ares-telemetry-ingest" }
ares-causal-graph = { path = "../ares-causal-graph" }
ares-nqs-stl = { path = "../ares-nqs-stl" }
ares-medops-playbooks = { path = "../ares-medops-playbooks" }
ares-security-privacy = { path = "../ares-security-privacy" }
anyhow = "1.0"
axum = { version = "0.8", features = ["ws"] }
clap = { version = "4.5", features = ["derive"] }
iceoryx2 = { version = "0.5", optional = true }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "2.0"
tokio = { version = "1.40", features = ["full"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
zenoh = { version = "1.0", features = ["shared-memory"], optional = true }
```

```rust
// crates/ares-server-cli/src/lib.rs
//! `ares-server-cli`: Dual-Transport Tokio Orchestrator (`axum` 20 Hz WebSocket + `FastMCP` stdio)
//! con bus opzionale POSIX SHM `iceoryx2` e adattatore `Zenoh` DSN (`--features shm-ipc`).

pub mod fastmcp_router;
pub mod mcp_stdio;
#[cfg(feature = "shm-ipc")]
pub mod shm_bus;
pub mod wire_contract;
pub mod ws_server;
```

#### 3.4.2 `crates/ares-server-cli/src/shm_bus.rs`
```rust
//! Fase 30 (L2): Adattatore reale POSIX Shared-Memory `eclipse-iceoryx/iceoryx2` (`ZeroCopySend`)
//! e bridge pub/sub delay-tolerant `eclipse-zenoh/zenoh` per telemetria e allarmi DSN Marte.
//!
//! Invarianti garantite:
//! 1. Zero `.unwrap()` / `.expect()` (errori tipizzati `ShmBusError` via `thiserror`).
//! 2. Isolamento temporale `ARINC 653`: `NonBlockingShmDsnDispatcher::try_dispatch` usa solo
//!    `try_send` non bloccante (`< 150 ns`) così consumatori lenti o crashati non rallentano mai
//!    il ciclo fisiologico a `20 Hz`.
//! 3. Preservazione integrale di Issue `#11` (`FLAG_BEAT_INTERVALS_NOT_AVAILABLE`, `MASK_RMSSD_MS=0`)
//!    e Issue `#12` (`FLAG_ILLUSTRATIVE_UNVALIDATED`) sui `128` byte sigillati da `CRC-32C`.
//! 4. Air-Gap rigoroso (`AGENTS.md` Invariante 1): multicast esterno `Zenoh` disattivato e bind
//!    confinato a loopback `127.0.0.1` + memoria condivisa locale.

use crate::ws_server::OwltMarsCommState;
use ares_core_types::AresCoreError;
use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, BinaryTelemetryFrame, FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
    FLAG_ILLUSTRATIVE_UNVALIDATED, MASK_RMSSD_MS,
};
use ares_core_types::telemetry::{
    AlertSeverity, HrvUnavailableReason, ModelValidationStatus, SafetyGates, TelemetryPacket,
};
use core::mem::{align_of, size_of};
use iceoryx2::port::publisher::Publisher;
use iceoryx2::port::subscriber::Subscriber;
use iceoryx2::prelude::{NodeBuilder, ServiceName, ZeroCopySend, ipc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use thiserror::Error;
use zenoh::Config as ZenohConfig;
use zenoh::Session as ZenohSession;
use zenoh::bytes::ZBytes;
use zenoh::qos::{CongestionControl, Priority};

/// Limite massimo della coda Store-and-Forward durante blackout solari DSN (fino a 14 giorni).
pub const MAX_DSN_OUTBOX_ALERTS: usize = 256;

/// Nome canonico del servizio POSIX SHM `iceoryx2`.
pub const DEFAULT_IOX2_SERVICE_NAME: &str = "ares/medos/telemetry/binary_frame_v1";

/// Errori tipizzati per il bus POSIX SHM `iceoryx2` e l'adattatore `Zenoh` DSN.
#[derive(Debug, Error)]
pub enum ShmBusError {
    #[error("invalid binary frame on SHM/Zenoh bus: {0}")]
    CoreFrame(#[from] AresCoreError),

    #[error("invalid astronaut identifier for Zenoh key expression: {0}")]
    InvalidAstronautKey(String),

    #[error("iceoryx2 service initialization failed: {0}")]
    Iox2Init(String),

    #[error("iceoryx2 shared-memory loan failed: {0}")]
    Iox2Loan(String),

    #[error("iceoryx2 zero-copy send failed: {0}")]
    Iox2Send(String),

    #[error("iceoryx2 zero-copy receive failed: {0}")]
    Iox2Receive(String),

    #[error("zenoh air-gapped session error: {0}")]
    ZenohSession(String),

    #[error("zenoh publish error on '{key_expr}': {reason}")]
    ZenohPublish { key_expr: String, reason: String },

    #[error("background SHM worker spawn failed: {0}")]
    WorkerSpawn(String),
}

/// Payload `ZeroCopySend` da 128 byte allineato a cache line da 64 byte per `iceoryx2`.
#[repr(C, align(64))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, ZeroCopySend)]
#[type_name("ares.medos.BinaryTelemetryFrame.v1")]
pub struct Iox2TelemetryFrame {
    pub bytes: [u8; ARES_BINARY_FRAME_BYTES],
}

const _: () = assert!(size_of::<Iox2TelemetryFrame>() == ARES_BINARY_FRAME_BYTES);
const _: () = assert!(align_of::<Iox2TelemetryFrame>() == 64);

impl Iox2TelemetryFrame {
    /// Costruisce il frame SHM sigillato da `CRC-32C` a partire da `BinaryTelemetryFrame`.
    #[inline]
    pub fn from_binary_frame(frame: &BinaryTelemetryFrame) -> Self {
        Self {
            bytes: frame.to_le_bytes(),
        }
    }

    /// Verifica `magic`, `schema_version`, `CRC-32C` e l'invariante di nullabilita Issue `#11`.
    pub fn decode_verified(&self) -> Result<BinaryTelemetryFrame, ShmBusError> {
        let decoded = BinaryTelemetryFrame::from_le_bytes(&self.bytes)?;
        if (decoded.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) != 0
            && (decoded.validity_mask & MASK_RMSSD_MS) != 0
        {
            return Err(ShmBusError::CoreFrame(
                AresCoreError::ShmRingUnavailable(
                    "Issue #11 violation: MASK_RMSSD_MS set while FLAG_BEAT_INTERVALS_NOT_AVAILABLE is active".into(),
                ),
            ));
        }
        Ok(decoded)
    }
}

/// Sanitizza `astronaut_id` per prevenire wildcard injection (`*`, `$`, `/`) nelle key expression Zenoh.
pub fn sanitize_astronaut_id_for_keyexpr(raw_id: &str) -> Result<String, ShmBusError> {
    let normalized: String = raw_id
        .trim()
        .chars()
        .map(|c| c.to_ascii_lowercase())
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if normalized.is_empty() || normalized.len() > 48 {
        return Err(ShmBusError::InvalidAstronautKey(raw_id.to_string()));
    }
    Ok(normalized)
}

/// Costruisce la key expression Zenoh per i frame binari a 20 Hz (`ares/crew/{astronaut_id}/vitals/frame`).
pub fn zenoh_vitals_frame_keyexpr(astronaut_id: &str) -> Result<String, ShmBusError> {
    let clean = sanitize_astronaut_id_for_keyexpr(astronaut_id)?;
    Ok(format!("ares/crew/{clean}/vitals/frame"))
}

/// Costruisce la key expression Zenoh per gli allarmi MedOps DSN (`ares/crew/{astronaut_id}/alerts/medops`).
pub fn zenoh_medops_alerts_keyexpr(astronaut_id: &str) -> Result<String, ShmBusError> {
    let clean = sanitize_astronaut_id_for_keyexpr(astronaut_id)?;
    Ok(format!("ares/crew/{clean}/alerts/medops"))
}

/// Envelope delay-tolerant per il topic `ares/crew/{astronaut_id}/alerts/medops` (`NASA-STD-3001 [V1 3006]`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DsnMedOpsAlertEnvelope {
    pub astronaut_id: String,
    pub seq: u64,
    pub emitted_timestamp_ms: u64,
    pub owlt_seconds: f32,
    pub estimated_earth_receipt_ms: u64,
    pub eimo_autonomous_active: bool,
    pub blackout_active: bool,
    pub alert_severity: AlertSeverity,
    pub active_playbook_id: String,
    pub safety_gates: SafetyGates,
    pub rmssd_ms: Option<f64>,
    pub hrv_unavailable_reason: Option<HrvUnavailableReason>,
    pub missing_channels: Vec<String>,
    pub model_validation_status: ModelValidationStatus,
    pub binary_frame_crc32c: u32,
}

impl DsnMedOpsAlertEnvelope {
    pub fn from_tick(
        pkt: &TelemetryPacket,
        frame: &BinaryTelemetryFrame,
        owlt: &OwltMarsCommState,
    ) -> Self {
        let safe_owlt_ms = if owlt.owlt_seconds.is_finite() && owlt.owlt_seconds >= 0.0 {
            (f64::from(owlt.owlt_seconds) * 1000.0).round() as u64
        } else {
            852_000
        };
        let beat_unavailable = matches!(
            pkt.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        ) || (frame.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) != 0;

        Self {
            astronaut_id: pkt.astronaut_id.clone(),
            seq: frame.seq,
            emitted_timestamp_ms: frame.timestamp_ms,
            owlt_seconds: owlt.owlt_seconds,
            estimated_earth_receipt_ms: frame.timestamp_ms.saturating_add(safe_owlt_ms),
            eimo_autonomous_active: owlt.eimo_autonomous_active,
            blackout_active: owlt.blackout_active,
            alert_severity: pkt.alert_severity,
            active_playbook_id: pkt.active_playbook.playbook_id.clone(),
            safety_gates: pkt.active_playbook.safety_gates.clone(),
            rmssd_ms: if beat_unavailable {
                None
            } else {
                pkt.biometrics.rmssd_ms
            },
            hrv_unavailable_reason: pkt.biometrics.hrv_unavailable_reason,
            missing_channels: pkt.biometrics.missing_channels.clone(),
            model_validation_status: if (frame.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED)
                != 0
            {
                ModelValidationStatus::IllustrativeUnvalidated
            } else {
                pkt.model_validation_status
            },
            binary_frame_crc32c: frame.crc32c,
        }
    }
}

/// Endpoint publisher POSIX SHM daemonless `iceoryx2` (`< 100 ns` via `loan_uninit`).
pub struct Iox2PosixShmPublisher {
    _node: iceoryx2::node::Node<ipc::Service>,
    publisher: Publisher<ipc::Service, Iox2TelemetryFrame, ()>,
}

impl Iox2PosixShmPublisher {
    pub fn open_or_create(service_name_str: &str) -> Result<Self, ShmBusError> {
        let node = NodeBuilder::new()
            .create::<ipc::Service>()
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        let service_name = ServiceName::new(service_name_str)
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        let service = node
            .service_builder(&service_name)
            .publish_subscribe::<Iox2TelemetryFrame>()
            .max_publishers(4)
            .max_subscribers(16)
            .history_size(4)
            .subscriber_max_buffer_size(64)
            .enable_safe_overflow(true)
            .open_or_create()
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        let publisher = service
            .publisher_builder()
            .create()
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        Ok(Self {
            _node: node,
            publisher,
        })
    }

    /// Presta uno slot non inizializzato in memoria condivisa POSIX, vi scrive i 128 byte
    /// senza copie intermedie e pubblica il campione in `< 100 ns`.
    #[inline]
    pub fn publish_zero_copy(&self, frame: &BinaryTelemetryFrame) -> Result<(), ShmBusError> {
        let uninit_sample = self
            .publisher
            .loan_uninit()
            .map_err(|e| ShmBusError::Iox2Loan(format!("{e:?}")))?;
        let initialized = uninit_sample.write_payload(Iox2TelemetryFrame::from_binary_frame(frame));
        initialized
            .send()
            .map(|_| ())
            .map_err(|e| ShmBusError::Iox2Send(format!("{e:?}")))
    }
}

/// Endpoint subscriber POSIX SHM daemonless `iceoryx2` per companion process / test E2E.
pub struct Iox2PosixShmSubscriber {
    _node: iceoryx2::node::Node<ipc::Service>,
    subscriber: Subscriber<ipc::Service, Iox2TelemetryFrame, ()>,
}

impl Iox2PosixShmSubscriber {
    pub fn open_or_create(service_name_str: &str) -> Result<Self, ShmBusError> {
        let node = NodeBuilder::new()
            .create::<ipc::Service>()
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        let service_name = ServiceName::new(service_name_str)
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        let service = node
            .service_builder(&service_name)
            .publish_subscribe::<Iox2TelemetryFrame>()
            .max_publishers(4)
            .max_subscribers(16)
            .history_size(4)
            .subscriber_max_buffer_size(64)
            .enable_safe_overflow(true)
            .open_or_create()
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        let subscriber = service
            .subscriber_builder()
            .create()
            .map_err(|e| ShmBusError::Iox2Init(format!("{e:?}")))?;
        Ok(Self {
            _node: node,
            subscriber,
        })
    }

    /// Drena la coda SHM e restituisce l'ultimo `BinaryTelemetryFrame` valido verificato con `CRC-32C`.
    pub fn receive_latest_verified(&self) -> Result<Option<BinaryTelemetryFrame>, ShmBusError> {
        let mut latest_raw: Option<Iox2TelemetryFrame> = None;
        loop {
            match self.subscriber.receive() {
                Ok(Some(sample)) => {
                    latest_raw = Some(*sample.payload());
                }
                Ok(None) => break,
                Err(e) => return Err(ShmBusError::Iox2Receive(format!("{e:?}"))),
            }
        }
        match latest_raw {
            Some(raw) => raw.decode_verified().map(Some),
            None => Ok(None),
        }
    }
}

/// Adattatore `Zenoh` air-gapped con `shared-memory` locale e coda Store-and-Forward per blackout DSN.
pub struct ZenohDsnAdapter {
    session: ZenohSession,
    outbox_blackout_queue: VecDeque<DsnMedOpsAlertEnvelope>,
    last_emitted_playbook: Option<String>,
    last_emitted_severity: Option<AlertSeverity>,
}

impl ZenohDsnAdapter {
    /// Apre una sessione `Zenoh` 100% air-gapped (zero multicast UDP esterno, solo loopback + SHM).
    pub async fn open_air_gapped(listen_endpoint: Option<&str>) -> Result<Self, ShmBusError> {
        let mut cfg = ZenohConfig::default();
        let _ = cfg.insert_json5("scouting/multicast/enabled", "false");
        let _ = cfg.insert_json5("transport/shared_memory/enabled", "true");
        let ep = listen_endpoint.unwrap_or("tcp/127.0.0.1:0");
        let _ = cfg.insert_json5("listen/endpoints", &format!("[\"{ep}\"]"));

        let session = zenoh::open(cfg)
            .await
            .map_err(|e| ShmBusError::ZenohSession(e.to_string()))?;
        Ok(Self {
            session,
            outbox_blackout_queue: VecDeque::with_capacity(MAX_DSN_OUTBOX_ALERTS),
            last_emitted_playbook: None,
            last_emitted_severity: None,
        })
    }

    #[inline]
    pub fn session(&self) -> &ZenohSession {
        &self.session
    }

    #[inline]
    pub fn buffered_blackout_alerts(&self) -> usize {
        self.outbox_blackout_queue.len()
    }

    /// Pubblica i 128 byte grezzi su `ares/crew/{astronaut_id}/vitals/frame` (`Drop` + `RealTime`).
    pub async fn publish_vitals_frame(
        &self,
        astronaut_id: &str,
        frame: &BinaryTelemetryFrame,
    ) -> Result<(), ShmBusError> {
        let key_expr = zenoh_vitals_frame_keyexpr(astronaut_id)?;
        let raw_bytes = frame.to_le_bytes();
        self.session
            .put(&key_expr, ZBytes::from(raw_bytes.as_slice()))
            .congestion_control(CongestionControl::Drop)
            .priority(Priority::RealTime)
            .await
            .map_err(|e| ShmBusError::ZenohPublish {
                key_expr,
                reason: e.to_string(),
            })
    }

    /// Gestisce la pubblicazione delay-tolerant su `ares/crew/{astronaut_id}/alerts/medops`:
    /// - Se `blackout_active == true`, accoda l'allarme nella coda circolare `MAX_DSN_OUTBOX_ALERTS`;
    /// - Se il link DSN e disponibile, drena prima gli allarmi storicizzati e poi invia il nuovo stato.
    pub async fn publish_or_buffer_medops_alert(
        &mut self,
        envelope: DsnMedOpsAlertEnvelope,
        force_emit: bool,
    ) -> Result<usize, ShmBusError> {
        let state_changed = self.last_emitted_playbook.as_deref()
            != Some(envelope.active_playbook_id.as_str())
            || self.last_emitted_severity != Some(envelope.alert_severity);

        if !force_emit && !state_changed {
            return Ok(0);
        }
        self.last_emitted_playbook = Some(envelope.active_playbook_id.clone());
        self.last_emitted_severity = Some(envelope.alert_severity);

        if envelope.blackout_active {
            if self.outbox_blackout_queue.len() >= MAX_DSN_OUTBOX_ALERTS {
                let _ = self.outbox_blackout_queue.pop_front();
            }
            self.outbox_blackout_queue.push_back(envelope);
            return Ok(0);
        }

        let mut sent = 0usize;
        while let Some(queued) = self.outbox_blackout_queue.pop_front() {
            self.send_single_alert_envelope(&queued).await?;
            sent += 1;
        }
        self.send_single_alert_envelope(&envelope).await?;
        Ok(sent + 1)
    }

    async fn send_single_alert_envelope(
        &self,
        envelope: &DsnMedOpsAlertEnvelope,
    ) -> Result<(), ShmBusError> {
        let key_expr = zenoh_medops_alerts_keyexpr(&envelope.astronaut_id)?;
        let payload = serde_json::to_vec(envelope).map_err(|e| ShmBusError::ZenohPublish {
            key_expr: key_expr.clone(),
            reason: e.to_string(),
        })?;
        self.session
            .put(&key_expr, ZBytes::from(payload))
            .congestion_control(CongestionControl::Drop)
            .priority(Priority::DataHigh)
            .await
            .map_err(|e| ShmBusError::ZenohPublish {
                key_expr,
                reason: e.to_string(),
            })
    }
}

/// Contatori atomici ispezionabili per l'audit `ARINC 653` del dispatcher non bloccante.
#[derive(Default)]
pub struct ShmDsnMetrics {
    pub iox2_published: AtomicU64,
    pub iox2_dropped_backpressure: AtomicU64,
    pub zenoh_vitals_published: AtomicU64,
    pub zenoh_alerts_published: AtomicU64,
    pub zenoh_dropped_backpressure: AtomicU64,
}

#[derive(Clone)]
struct ZenohDispatchItem {
    astronaut_id: String,
    frame: BinaryTelemetryFrame,
    alert: DsnMedOpsAlertEnvelope,
    force_alert: bool,
}

/// Dispatcher `Send + Sync` invocabile in `< 150 ns` da `SharedMissionState::advance_tick`.
#[derive(Clone)]
pub struct NonBlockingShmDsnDispatcher {
    iox2_tx: SyncSender<BinaryTelemetryFrame>,
    zenoh_tx: tokio::sync::mpsc::Sender<ZenohDispatchItem>,
    pub metrics: Arc<ShmDsnMetrics>,
}

impl NonBlockingShmDsnDispatcher {
    /// Avvia il thread dedicato `iceoryx2` POSIX SHM e il worker asincrono `Zenoh` DSN.
    pub fn spawn_default(service_name: &str) -> Result<Self, ShmBusError> {
        let metrics = Arc::new(ShmDsnMetrics::default());
        let (iox2_tx, iox2_rx) = mpsc::sync_channel::<BinaryTelemetryFrame>(64);
        let svc_owned = service_name.to_string();
        let iox2_metrics = Arc::clone(&metrics);

        std::thread::Builder::new()
            .name("ares-iox2-pub".to_string())
            .spawn(move || {
                let Ok(publisher) = Iox2PosixShmPublisher::open_or_create(&svc_owned) else {
                    return;
                };
                while let Ok(frame) = iox2_rx.recv() {
                    if publisher.publish_zero_copy(&frame).is_ok() {
                        iox2_metrics.iox2_published.fetch_add(1, Ordering::Relaxed);
                    }
                }
            })
            .map_err(|e| ShmBusError::WorkerSpawn(e.to_string()))?;

        let (zenoh_tx, mut zenoh_rx) = tokio::sync::mpsc::channel::<ZenohDispatchItem>(64);
        let zenoh_metrics = Arc::clone(&metrics);

        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                let Ok(mut adapter) = ZenohDsnAdapter::open_air_gapped(None).await else {
                    return;
                };
                while let Some(item) = zenoh_rx.recv().await {
                    if adapter
                        .publish_vitals_frame(&item.astronaut_id, &item.frame)
                        .await
                        .is_ok()
                    {
                        zenoh_metrics
                            .zenoh_vitals_published
                            .fetch_add(1, Ordering::Relaxed);
                    }
                    if let Ok(n) = adapter
                        .publish_or_buffer_medops_alert(item.alert, item.force_alert)
                        .await
                    {
                        zenoh_metrics
                            .zenoh_alerts_published
                            .fetch_add(n as u64, Ordering::Relaxed);
                    }
                }
            });
        }

        Ok(Self {
            iox2_tx,
            zenoh_tx,
            metrics,
        })
    }

    /// Invio rigorosamente wait-free (`try_send`): non blocca mai `SharedMissionState::advance_tick`.
    #[inline]
    pub fn try_dispatch(
        &self,
        pkt: &TelemetryPacket,
        frame: &BinaryTelemetryFrame,
        owlt: &OwltMarsCommState,
        force_alert: bool,
    ) {
        if let Err(TrySendError::Full(_)) = self.iox2_tx.try_send(*frame) {
            self.metrics
                .iox2_dropped_backpressure
                .fetch_add(1, Ordering::Relaxed);
        }

        let item = ZenohDispatchItem {
            astronaut_id: pkt.astronaut_id.clone(),
            frame: *frame,
            alert: DsnMedOpsAlertEnvelope::from_tick(pkt, frame, owlt),
            force_alert,
        };
        if self.zenoh_tx.try_send(item).is_err() {
            self.metrics
                .zenoh_dropped_backpressure
                .fetch_add(1, Ordering::Relaxed);
        }
    }
}
```

#### 3.4.3 Integrazione Non-Bloccante in `crates/ares-server-cli/src/ws_server.rs`
In `SharedMissionState` (`crates/ares-server-cli/src/ws_server.rs`), si aggiunge il campo opzionale:
```rust
pub struct SharedMissionState {
    pub inner: RwLock<MissionRuntimeInner>,
    pub tx: broadcast::Sender<String>,
    pub binary_ring: Arc<SeqlockTelemetryRing<64>>,
    pub audit_logger: Sha256AuditLogger,
    pub dataset_graph: Arc<AresUnifiedDatasetGraph>,
    #[cfg(feature = "shm-ipc")]
    pub shm_dispatcher: Option<crate::shm_bus::NonBlockingShmDsnDispatcher>,
}
```
All'interno di `SharedMissionState::advance_tick` (subito dopo `self.binary_ring.publish(&bin_frame);` a linea `871`), nonche in `apply_stress_test_patch` (`force_alert = true`) e `ingest_wearable_packet`:
```rust
#[cfg(feature = "shm-ipc")]
if let Some(ref dispatcher) = self.shm_dispatcher {
    let owlt = OwltMarsCommState {
        owlt_seconds: guard.owlt_delay_sec,
        eimo_autonomous_active: guard.eimo_autonomous_active,
        blackout_active: false,
        label: String::new(),
    };
    dispatcher.try_dispatch(&guard.latest_packet, &bin_frame, &owlt, false);
}
```
Se la feature `shm-ipc` non e attiva o se un consumatore `iceoryx2`/`Zenoh` si blocca indefinitamente, il costo su `advance_tick` resta confinato a `try_send` ($< 150\,\text{ns}$), preservando il tempo totale di tick `--release` a $p_{99.9} < 6\,\mu\text{s} \ll 150\,\mu\text{s}$.

---

### 3.5 Packaging `.app` / `AppImage` & Aggiornamento `scripts/launch_ares_medos.sh`

Lo script unificato `scripts/launch_ares_medos.sh` viene esteso mantenendo retrocompatibilita al `100%` con `--desktop`, `--web` e `--verify`, aggiungendo:
- **`./scripts/launch_ares_medos.sh --desktop --native [--shm]`:** compila `ares-cockpit/dist` (se necessario) ed esegue `cargo run --release -p ares-desktop-os --features tauri-native[,shm-ipc] -- --mode native-window`, aprendo la finestra nativa `WKWebView`/Metal su macOS o `WebKitGTK`/Vulkan su Linux.
- **`./scripts/launch_ares_medos.sh --bundle-macos [--shm]`:**
  1. Compila gli asset di produzione `npm --prefix ares-cockpit run build`.
  2. Se `cargo tauri --version` e disponibile, esegue `cargo tauri build --bundles app --features tauri-native[,shm-ipc]` nella directory `crates/ares-desktop-os`, producendo `target/release/bundle/macos/ARES-MedOS.app`.
  3. Se `cargo-tauri` CLI non e installato globalmente, assembla deterministicamente la struttura standard Apple `.app` (`target/release/bundle/macos/ARES-MedOS.app/Contents/{Info.plist,MacOS/ares-desktop-os,Resources/data/bidmc/*,Resources/icon.icns}`) a partire dal binario compilato `cargo build --release -p ares-desktop-os --features tauri-native[,shm-ipc]` (impostando `CFBundleIdentifier = org.areshealth.medos`, `CFBundleExecutable = ares-desktop-os`, `NSHighResolutionCapable = true`), ed esegue la firma ad-hoc locale `codesign --force --deep --sign - target/release/bundle/macos/ARES-MedOS.app` richiesta da Apple Silicon (`arm64` Gatekeeper).
- **`./scripts/launch_ares_medos.sh --bundle-linux [--shm]`:** genera i pacchetti `target/release/bundle/deb/*.deb` e `target/release/bundle/appimage/*.AppImage` tramite `cargo tauri build --bundles deb,appimage --features tauri-native[,shm-ipc]`.
- **`./scripts/launch_ares_medos.sh --verify`:** invariato nel requisito zero-GUI: valida `deploy/medos/*`, `tauri.conf.json`, `capabilities/default.json`, esegue `./scripts/agent_probe.sh --fast`, `cargo test -p ares-desktop-os --features tauri-runtime` e `cargo run -p ares-desktop-os -- --mode desktop-smoke-test`.

---

## 4. Step-by-Step Implementation Checklist

- [ ] **Step 1 (Asset & Capabilities `Tauri v2`):** Creare `crates/ares-desktop-os/capabilities/default.json`, `crates/ares-desktop-os/build.rs` (con guardia `#[cfg(feature = "tauri-native")]`) e gli asset iconografici deterministici in `crates/ares-desktop-os/icons/` (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`), aggiornando `crates/ares-desktop-os/tauri.conf.json` con la sezione `bundle` e `resources` (`../../data/bidmc/*`).
- [ ] **Step 2 (Feature Gate `ares-desktop-os` & `ipc_bridge.rs`):** Aggiornare `crates/ares-desktop-os/Cargo.toml` con `tauri-runtime`, `tauri-native` e `shm-ipc`; creare `crates/ares-desktop-os/src/ipc_bridge.rs` con i 5 comandi (`subscribe_binary_telemetry` via `Channel<Response>` / `InvokeResponseBody::Raw` da `128 B`, `get_full_wire_snapshot`, `apply_what_if_patch`, `invoke_fastmcp_tool`, `get_os_status_bar_state`); esportare `ipc_bridge` e `resolve_medos_data_dir` in `crates/ares-desktop-os/src/lib.rs`.
- [ ] **Step 3 (Main-Thread Windowing in `crates/ares-desktop-os/src/main.rs`):** Rifattorizzare `src/main.rs` con `tokio::runtime::Builder::new_multi_thread()`, `tauri::async_runtime::set(...)`, `DesktopMode::NativeWindow` e flag `--native`, garantendo zero `.unwrap()`/`.expect()` e fallback controllato su `127.0.0.1:8080` `AddrInUse`.
- [ ] **Step 4 (Bus POSIX SHM `iceoryx2` & `Zenoh` DSN in `ares-server-cli`):** Aggiornare `crates/ares-server-cli/Cargo.toml` (`--features shm-ipc`) e `crates/ares-server-cli/src/lib.rs`; implementare `crates/ares-server-cli/src/shm_bus.rs` (`Iox2TelemetryFrame`, `Iox2PosixShmPublisher`/`Subscriber`, `ZenohDsnAdapter` air-gapped con `OwltMarsCommState` `852.0 s` e coda blackout, `NonBlockingShmDsnDispatcher`).
- [ ] **Step 5 (Integrazione `ARINC 653` in `ws_server.rs`):** Collegare `shm_dispatcher` in `SharedMissionState::from_data_dir`, `advance_tick`, `apply_stress_test_patch` e `ingest_wearable_packet` usando esclusivamente `try_dispatch` non bloccante.
- [ ] **Step 6 (Launcher & macOS `.app` Bundle):** Aggiornare `scripts/launch_ares_medos.sh` con `--native`, `--bundle-macos`, `--bundle-linux`, `--shm` e verifica `capabilities/default.json` in `--verify`.
- [ ] **Step 7 (Test & Benchmark Suite Fase 30 `L2`):** Aggiungere i test di integrazione `crates/ares-desktop-os/tests/phase_30_l2_tauri_bridge.rs` e `crates/ares-server-cli/tests/phase_30_l2_shm_zenoh_ipc.rs` (`#![cfg(feature = "shm-ipc")]`).
- [ ] **Step 8 (Gate Finale & Memory Bank):** Eseguire `./scripts/agent_probe.sh --all`, `./scripts/launch_ares_medos.sh --verify`, testare le feature `--features tauri-runtime`, `--features shm-ipc` e `--features tauri-native`, e aggiornare `memory-bank/activeContext.md` e `memory-bank/progress.md`.

---

## 5. Deterministic Verification & Benchmarks

### 5.1 Suite di Test Deterministici Obbligatori

1. **`test_tauri_headless_bridge_raw_128b_channel_and_all_5_commands` (`crates/ares-desktop-os`, `--features tauri-runtime`):**
   - Inizializza `HeadlessTauriBridge` su `data/bidmc`, avanza `20` tick a `20 Hz` e verifica che `poll_raw_128b_channel_frame`:
     - emetta esattamente `128` byte con `magic == 0x4152_4553` e `CRC-32C` valido;
     - non riemetta frame duplicati a parita di `seq`;
     - mantenga `validity_mask & MASK_RMSSD_MS == 0`, `rmssd_opt() == None`, `quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE != 0` (Issue `#11`) e `quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED != 0` (Issue `#12`);
   - Invoca `apply_what_if_patch`, `get_full_wire_snapshot`, `get_os_status_bar_state` e `invoke_fastmcp_tool` per tutti gli `8` tool verificando il limite `<= 600` byte e l'invarianza di `relative_recording_time_s`.
2. **`test_iox2_posix_shm_zero_copy_roundtrip_and_safe_overflow` (`crates/ares-server-cli`, `--features shm-ipc`):**
   - Crea `Iox2PosixShmPublisher` e `Iox2PosixShmSubscriber` su un servizio univoco di test `ares/medos/test_l2_frame`, pubblica `1,000` `BinaryTelemetryFrame` tramite `publish_zero_copy` (`loan_uninit()`), inclusi i campioni con `PULSE`/`SpO2` mancanti di `bidmc_01_Numerics.csv` e `rmssd_ms: None`, e verifica:
     - `size_of::<Iox2TelemetryFrame>() == 128` e `align_of::<Iox2TelemetryFrame>() == 64`;
     - decodifica bit-esatta `receive_latest_verified()` senza blocchi anche quando il subscriber non legge per `> 64` campioni (`enable_safe_overflow(true)`).
3. **`test_zenoh_air_gapped_shm_vitals_and_dsn_owlt_blackout_store_and_forward` (`crates/ares-server-cli`, `--features shm-ipc`):**
   - Apre due sessioni `ZenohDsnAdapter` connesse in loopback (`tcp/127.0.0.1`), sottoscrive `ares/crew/ares-cdr-01/vitals/frame` e `ares/crew/ares-cdr-01/alerts/medops`, e verifica:
     - ricezione del payload binario da `128 B` decodificabile con `BinaryTelemetryFrame::from_le_bytes`;
     - calcolo esatto di `estimated_earth_receipt_ms == emitted_timestamp_ms + 852_000` per `OwltMarsCommState` nominale (`852.0 s`);
     - accodamento in `outbox_blackout_queue` quando `blackout_active == true` e drenaggio ordinato FIFO al ritorno a `blackout_active == false`, preservando `rmssd_ms: None`, `BeatIntervalsNotAvailable` e `IllustrativeUnvalidated`;
     - rigetto deterministico (`Err(ShmBusError::InvalidAstronautKey)`) di ID contenenti wildcard `*` o `$`.
4. **`test_arinc653_non_blocking_shm_dispatch_under_saturated_queues` (`crates/ares-server-cli`, `--features shm-ipc`):**
   - Satura deliberatamente la coda di un canale senza lettori attivi e misura `1,000` invocazioni consecutive di `SharedMissionState::advance_tick(Duration::from_millis(50))`, dimostrando zero deadlock, incremento deterministico di `iox2_dropped_backpressure` / `zenoh_dropped_backpressure` e latenza di tick `< 150 us`.
5. **`test_macos_app_bundle_resource_resolution_and_security_manifests` (`crates/ares-desktop-os`):**
   - Simula l'albero `ARES-MedOS.app/Contents/{MacOS,Resources/data/bidmc}` in una directory temporanea, verifica `resolve_medos_data_dir`, e valida `tauri.conf.json` + `capabilities/default.json` (assenza di origini `https://` cloud e restrizione alla finestra `medos-primary`).

### 5.2 Matrice di Benchmark Quantitativi & Conformita `NASA-STD-3001`

| Metrica / Percorso Critico | Target SLA Fase 30 (`L2`) | Requisito `NASA-STD-3001` | Margine di Sicurezza |
| :--- | :---: | :---: | :---: |
| `Iox2PosixShmPublisher::publish_zero_copy` (`loan_uninit` `128 B`) | $p_{50} < 100\,\text{ns}$, $p_{99.9} < 250\,\text{ns}$ | `[V2 10152]` ($\le 50\,\text{ms}$) | $> 200,000\times$ |
| `subscribe_binary_telemetry` (`Channel<Response>` `InvokeResponseBody::Raw`) | $p_{50} < 25\,\mu\text{s}$, $p_{99} < 50\,\mu\text{s}$ | `[V2 10152]` ($\le 50\,\text{ms}$) | $> 1,000\times$ |
| `NonBlockingShmDsnDispatcher::try_dispatch` in `advance_tick` | $< 150\,\text{ns}$ ($O(1)$ wait-free) | `ARINC 653` ($\le 150\,\mu\text{s}$ tick) | $> 1,000\times$ |
| `apply_what_if_patch` (`#[tauri::command]` in-process) | $p_{99} < 200\,\mu\text{s}$ | `[V2 10022]` ($\le 100\,\text{ms}$) | $> 500\times$ |
| `invoke_fastmcp_tool` (`8` tool Context-Mode `<= 600 B`) | $p_{99} < 500\,\mu\text{s}$ | `[V2 10022]` ($\le 100\,\text{ms}$) | $> 200\times$ |
| Footprint RSS `ARES-MedOS.app` (`aarch64-apple-darwin` Metal) | $\le 60\,\text{MB}$ idle | Edge Spacecraft Compute Budget | $\sim 4\text{–}6\times$ vs Electron |

### 5.3 Comandi di Verifica Riproducibili

```bash
# 1. Gate CI Headless Default (zero dipendenze GTK/WebKit/C++, 0 warning Clippy, 0 .unwrap/.expect)
./scripts/agent_probe.sh --all
./scripts/launch_ares_medos.sh --verify

# 2. Verifica Bridge Tauri Headless (canale binario 128B + 5 comandi IPC)
cargo test -p ares-desktop-os --features tauri-runtime -- --nocapture

# 3. Verifica Bus Reale POSIX SHM iceoryx2 + Zenoh DSN Delay-Tolerant (OWLT 852s & Blackout)
cargo clippy -p ares-server-cli --features shm-ipc --all-targets -- -D warnings
cargo test -p ares-server-cli --features shm-ipc -- --nocapture

# 4. Compilazione Finestra Nativa Tauri v2 + SHM su macOS Apple Silicon (WKWebView/Metal)
cargo clippy -p ares-desktop-os --features "tauri-native,shm-ipc" --all-targets -- -D warnings
./scripts/launch_ares_medos.sh --desktop --native --shm

# 5. Creazione e Verifica Bundle Autonomo macOS target/release/bundle/macos/ARES-MedOS.app
./scripts/launch_ares_medos.sh --bundle-macos --shm
codesign --verify --deep --strict target/release/bundle/macos/ARES-MedOS.app
```
