# Piano Implementativo Definitivo — Fase 24 (J4): Tier B & Tier C Aerospace OS Deployment Target Descriptors (`Asterinas` Framekernel Kiosk Container, `System76 COSMIC` Wayland Kiosk Policy, and `Oxide Hubris` / `Embassy` Wearable Sensor Node Framing)

- **Blocco Architetturale**: Blocco J (*`ARES-MedOS`: Pure-Rust Mission Workstation OS Shell, Zero-Copy IPC & Multi-Tier Space OS Partitioning*, Fasi 21–24)
- **Fase**: Fase 24 (`J4`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate & Directory Target**: `crates/ares-telemetry-ingest/src/wearable_frame.rs` *(NEW)*, `deploy/medos/` *(NEW)*, `scripts/launch_ares_medos.sh` *(NEW)*
- **Studio Architetturale di Riferimento**: [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md)
- **Owner Principale**: `@fabiomalagutti27-droid` & `@LelloXV` (con revisione sicurezza `@MiServeRDC`)
- **File Target Previsti**:
  1. `crates/ares-telemetry-ingest/src/wearable_frame.rs` *(NEW — `#[repr(C)]` `WearableSensorPacket` da 32 byte, CRC-16-CCITT, contatore SEU `supervisor_restart_count`, decoder verso `Biometrics`)*
  2. `crates/ares-telemetry-ingest/src/lib.rs` *(UPDATE — esportazione `wearable_frame`)*
  3. `crates/ares-telemetry-ingest/src/bidmc_replayer.rs` *(UPDATE minore solo per riuso eventuale variante `IngestError::InvalidWearableCrc`)*
  4. `deploy/medos/asterinas_framekernel_kiosk.toml` *(NEW — manifesto Tier B host kernel `Asterinas` + partizioni `ARINC 653`)*
  5. `deploy/medos/cosmic_wayland_kiosk.ron` *(NEW — policy compositor `cosmic-comp` single-workspace kiosk)*
  6. `deploy/medos/hubris_wearable_app.toml` *(NEW — manifesto statico MCU Tier C `Oxide Hubris` / `Embassy`)*
  7. `scripts/launch_ares_medos.sh` *(NEW — launcher unificato 1-comando per `--mode desktop`, `--mode ws-browser`, `--mode verify`)*
- **Budget Latenza & Footprint**:
  - **Decodifica `WearableSensorPacket` (`32 byte` + verifica CRC-16-CCITT)**: `< 150 ns` (zero allocazioni heap, compatibile `no_std`)
  - **Riavvio Driver Sensori `Oxide Hubris` `Supervisor` dopo SEU**: `< 5 ms` senza perdita del flusso verso Tier B/A
  - **TCB Unsafe `Asterinas` Tier B Host**: `~14.0%` (`ostd`), eseguendo il binario ELF Linux di `ares-server-cli` senza riscritture (`1.08x` LMbench vs Linux)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, zero emoji, preservazione rigorosa della distinzione tra nodi wearable con `rr_interval_ms` reale e replay numerico BIDMC (`BEAT_INTERVALS_NOT_AVAILABLE`).

---

## 1. Executive Summary & Scientific / Open-Source Grounding

### 1.1 Coprire Tutti i 3 Tier Aerospaziali senza Bloccare il Runtime dei Giudici
Mentre le Fasi 21–23 realizzano **Tier A** (`ARES-MedOS Desktop` su `Tauri v2` + `BinaryTelemetryFrame` + `OsSystemStatusBar` + `OsCommandPalette` su macOS/Linux/Windows), la **Fase 24 (`J4`)** formalizza e collega l'engine Rust ai target di produzione aerospaziale **Tier B** (Host Framekernel & Wayland Kiosk nell'habitat marziano) e **Tier C** (Nodo sensore indossabile a bassa potenza ed elevata tolleranza alle radiazioni):
1. **Framing Fisico Wearable Tier C (`WearableSensorPacket`, `32 byte` `#[repr(C)]`):** Definisce in `crates/ares-telemetry-ingest/src/wearable_frame.rs` il pacchetto binario a lunghezza fissa emesso da un microcontrollore **Oxide Hubris** / **Embassy** (`nRF52` / `STM32H7`) via BLE/UART verso l'engine Rust, dotato di checksum **CRC-16-CCITT** (`0x1021`), maschera canali esplicita (rispettando `BEAT_INTERVALS_NOT_AVAILABLE` quando `rr_interval_ms` non e trasmesso), e campo `supervisor_restart_count` per tracciare i ripristini hardware da *Single-Event Upsets* (SEU).
2. **Manifesti Dichiarativi Multi-Tier (`deploy/medos/`):** Descrivono in modo riproducibile e ispezionabile la configurazione di deployment per **Asterinas Framekernel** (Tier B), **System76 COSMIC Wayland Kiosk** (Tier B Compositor) e **Oxide Hubris** (Tier C MCU), verificati sintatticamente in CI.
3. **Launcher Unificato a 1 Comando (`scripts/launch_ares_medos.sh`):** Consente sia ai giudici dell'hackathon sia al team di avviare con un solo comando la workstation nativa (`--mode desktop`), la sessione classica browser (`--mode ws-browser`), o la verifica di integrita dei target (`--mode verify`).

### 1.2 Riferimenti a Repository Pubblici & Letteratura Peer-Reviewed

| Repository / Paper | Autori, Venue / URL & Licenza | Contributo Specifico alla Fase 24 (`J4`) |
| :--- | :--- | :--- |
| **`asterinas/asterinas`** | Peng et al., *USENIX ATC 2025* (`arXiv:2506.03876`) & *ACM APsys 2024* (`DOI: 10.1145/3678015.3680492`); `https://github.com/asterinas/asterinas` (`MPL-2.0`) | Target Tier B: framekernel Linux-ABI compatibile (`> 210` syscall, `1.08x` LMbench vs Linux) che isola `unsafe` in `ostd` (`~14.0%` TCB) ed esegue direttamente l'ELF `ares-server-cli`. |
| **`oxidecomputer/hubris`** | Oxide Computer Company; `https://github.com/oxidecomputer/hubris` (`MPL-2.0`) | Target Tier C flight-grade: microkernel statico `~2,000` LOC senza allocazione heap, isolamento MPU per driver I2C/SPI (`MAX30102`, `ADS1292`), IPC tipizzata `Idol` e task `Supervisor` per il riavvio sotto SEU (`supervisor_restart_count`). |
| **`embassy-rs/embassy`** | Embassy Project; `https://github.com/embassy-rs/embassy` (`Apache-2.0 OR MIT`) | Target Tier C prototyping wearable: esecutore `no_std` async/await con driver DMA (`embassy-nrf`, `embassy-stm32`) e stack BLE `trouble` per lo streaming di `WearableSensorPacket`. |
| **`tock/tock`** | Levy et al., *ACM SOSP 2017* (`DOI: 10.1145/3132747.3132786`); Schuermann et al., `arXiv:2603.22585` (2026); `https://github.com/tock/tock` (`Apache-2.0 OR MIT`) | Riferimento Tier C multi-tenant: capsule kernel in Rust + isolamento MPU delle app utente (`~8.4 KB` SRAM) quando sullo stesso wearable convivono monitoraggio crew e payload sperimentali. |
| **`rtic-rs/rtic`** | RTIC Project; `https://github.com/rtic-rs/rtic` (`Apache-2.0 OR MIT`) | Concorrenza hardware-accelerated basata su *Stack Resource Policy* (NVIC) per campionamento deterministico sub-microsecondo (`250–500 Hz` ADC `ECG`/`PPG`). |
| **`theseus-os/Theseus`** | Boos et al., *USENIX OSDI 2020* (`ISBN: 978-1-939133-19-9`); `https://github.com/theseus-os/Theseus` (`MIT`) | Modello architetturale di *live cell swapping* per il ripristino senza riavvio di componenti danneggiati da SEU da radiazione cosmica. |
| **`mars-research/atmosphere`** | Chen et al., *ACM SOSP 2025* (`DOI: 10.1145/3731569.3764821`); `https://github.com/mars-research/atmosphere` | Riferimento per la verifica formale end-to-end tramite Verus SMT di un microkernel Rust a TCB minimo. |

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

| File / Modulo | Azione | Responsabilita nella Fase 24 (`J4`) |
| :--- | :--- | :--- |
| `crates/ares-telemetry-ingest/src/wearable_frame.rs` | **CREATE** | Definisce `WearableSensorPacket` (`#[repr(C)]`, `32` byte), funzione pura `crc16_ccitt`, validazione `decode_and_verify(&[u8])`, e conversione in `Biometrics` (`Option<f64>`). |
| `crates/ares-telemetry-ingest/src/lib.rs` | **UPDATE** | Esporta `pub mod wearable_frame;` e `WearableSensorPacket`. |
| `deploy/medos/asterinas_framekernel_kiosk.toml` | **CREATE** | Specifica target kernel `Asterinas` (`ostd` `14.0%` TCB), mount `/dev/shm` `iceoryx2`, cgroup `ARINC 653` per `ares-server-cli` e `ares-desktop-os`. |
| `deploy/medos/cosmic_wayland_kiosk.ron` | **CREATE** | Policy `cosmic-comp` (`Smithay`) single-app kiosk: blocca escape di finestra, forza VSync `120 Hz` `wgpu` e superficie `#000000` OLED. |
| `deploy/medos/hubris_wearable_app.toml` | **CREATE** | Descrittore MCU `Oxide Hubris` con task isolati MPU (`supervisor`, `adc_ecg`, `i2c_ppg`, `ble_tx`), limiti SRAM/Flash e periodo watchdog. |
| `scripts/launch_ares_medos.sh` | **CREATE** | Script eseguibile (`chmod +x`) con `--mode desktop`, `--mode ws-browser`, `--mode verify`. |

---

## 3. Specifica del Protocollo `WearableSensorPacket` (`32 Byte`, CRC-16-CCITT) & Manifesti Tier B/C

### 3.1 Layout Esatto `#[repr(C)]` di `WearableSensorPacket` (32 Byte, Zero Allocazioni, `no_std`-Friendly)
Progettato per poter essere serializzato direttamente su DMA/BLE da firmware `Oxide Hubris` o `Embassy` (`20–250 Hz`) e validato in `< 150 ns` da `ares-telemetry-ingest`:

| Offset Byte | Dimensione | Tipo | Campo | Semantica & Invarianti |
| :---: | :---: | :--- | :--- | :--- |
| `0..2` | `2 B` | `u16` | `sync_word` | Costante `0xAA55` (`WEARABLE_SYNC_WORD`). |
| `2..3` | `1 B` | `u8` | `node_id` | ID hardware nodo wearable astronauta (`0..255`). |
| `3..4` | `1 B` | `u8` | `channel_mask` | Bit `0`: `rr_interval_ms` valido; Bit `1`: `hr_bpm`; Bit `2`: `spo2_pct`; Bit `3`: `resp_brpm`; Bit `4`: `imu_rms_g` presente. |
| `4..8` | `4 B` | `u32` | `sequence_num` | Contatore sequenza pacchetti per rilevazione drop BLE. |
| `8..12` | `4 B` | `u32` | `uptime_ms` | Uptime del microcontrollore in millisecondi. |
| `12..14` | `2 B` | `u16` | `supervisor_restart_count` | Numero di riavvii driver effettuati da `Oxide Hubris Supervisor` a seguito di SEU o fault I2C/SPI. |
| `14..16` | `2 B` | `u16` | `hr_bpm_x100` | Frequenza cardiaca in centesimi di bpm (`0..655.35 bpm`). |
| `16..18` | `2 B` | `u16` | `spo2_pct_x100` | Saturazione ossigeno in centesimi di `%` (`0..100.00%`). |
| `18..20` | `2 B` | `u16` | `resp_brpm_x100` | Frequenza respiratoria in centesimi di `brpm`. |
| `20..22` | `2 B` | `u16` | `rr_interval_ms_x10` | Intervallo R-R reale in decimi di `ms` (`0` se Bit `0` di `channel_mask` e `0`). |
| `22..24` | `2 B` | `u16` | `sqi_score_x10000` | Qualita segnale calcolata on-chip (`0..=10000` $\to$ `[0.0, 1.0]`). |
| `24..28` | `4 B` | `f32` | `imu_rms_g` | Accelerazione RMS per rilevazione artefatto motorio `ARED`/`EVA`. |
| `28..30` | `2 B` | `u16` | `flags` | Bit `0`: `seu_recovery_event`; Bit `1`: `ble_retransmit`; Bit `2`: `eva_suit_node`. |
| `30..32` | `2 B` | `u16` | `crc16_ccitt` | CRC-16-CCITT (polinomio `0x1021`, init `0xFFFF`) sui byte `0..30`. |

### 3.2 Concrete Rust Signatures (`crates/ares-telemetry-ingest/src/wearable_frame.rs`)

```rust
//! Fase 24 (J4): Framing binario per nodi wearable Tier C (Oxide Hubris / Embassy)
//! con verifica CRC-16-CCITT, tracciamento restart SEU e preservazione nullabilita HRV.

use crate::bidmc_replayer::IngestError;
use ares_core_types::telemetry::{Biometrics, HrvUnavailableReason};
use core::mem::{align_of, size_of};

pub const WEARABLE_SYNC_WORD: u16 = 0xAA55;
pub const WEARABLE_PACKET_BYTES: usize = 32;

pub const WMASK_RR_INTERVAL: u8 = 1 << 0;
pub const WMASK_HR_BPM: u8 = 1 << 1;
pub const WMASK_SPO2_PCT: u8 = 1 << 2;
pub const WMASK_RESP_BRPM: u8 = 1 << 3;
pub const WMASK_IMU_RMS: u8 = 1 << 4;

pub const WFLAG_SEU_RECOVERY_EVENT: u16 = 1 << 0;
pub const WFLAG_BLE_RETRANSMIT: u16 = 1 << 1;
pub const WFLAG_EVA_SUIT_NODE: u16 = 1 << 2;

/// Pacchetto binario fisso da 32 byte generato da nodi Tier C (`Hubris` / `Embassy`).
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WearableSensorPacket {
    pub sync_word: u16,
    pub node_id: u8,
    pub channel_mask: u8,
    pub sequence_num: u32,
    pub uptime_ms: u32,
    pub supervisor_restart_count: u16,
    pub hr_bpm_x100: u16,
    pub spo2_pct_x100: u16,
    pub resp_brpm_x100: u16,
    pub rr_interval_ms_x10: u16,
    pub sqi_score_x10000: u16,
    pub imu_rms_g: f32,
    pub flags: u16,
    pub crc16_ccitt: u16,
}

const _: () = assert!(size_of::<WearableSensorPacket>() == WEARABLE_PACKET_BYTES);
const _: () = assert!(align_of::<WearableSensorPacket>() == 4);

/// Calcola il checksum CRC-16-CCITT (polinomio 0x1021, valore iniziale 0xFFFF).
#[inline]
pub fn compute_crc16_ccitt(bytes: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &b in bytes {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            if (crc & 0x8000) != 0 {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

impl WearableSensorPacket {
    /// Serializza il pacchetto nei 32 byte little-endian calcolando automaticamente il CRC-16.
    pub fn to_le_bytes_with_crc(&self) -> [u8; WEARABLE_PACKET_BYTES] {
        let mut buf = [0u8; WEARABLE_PACKET_BYTES];
        buf[0..2].copy_from_slice(&self.sync_word.to_le_bytes());
        buf[2] = self.node_id;
        buf[3] = self.channel_mask;
        buf[4..8].copy_from_slice(&self.sequence_num.to_le_bytes());
        buf[8..12].copy_from_slice(&self.uptime_ms.to_le_bytes());
        buf[12..14].copy_from_slice(&self.supervisor_restart_count.to_le_bytes());
        buf[14..16].copy_from_slice(&self.hr_bpm_x100.to_le_bytes());
        buf[16..18].copy_from_slice(&self.spo2_pct_x100.to_le_bytes());
        buf[18..20].copy_from_slice(&self.resp_brpm_x100.to_le_bytes());
        buf[20..22].copy_from_slice(&self.rr_interval_ms_x10.to_le_bytes());
        buf[22..24].copy_from_slice(&self.sqi_score_x10000.to_le_bytes());
        buf[24..28].copy_from_slice(&self.imu_rms_g.to_le_bytes());
        buf[28..30].copy_from_slice(&self.flags.to_le_bytes());
        let crc = compute_crc16_ccitt(&buf[0..30]);
        buf[30..32].copy_from_slice(&crc.to_le_bytes());
        buf
    }

    /// Decodifica e verifica `sync_word` e `CRC-16-CCITT` senza panici.
    pub fn decode_and_verify(bytes: &[u8]) -> Result<Self, IngestError> {
        if bytes.len() != WEARABLE_PACKET_BYTES {
            return Err(IngestError::InvalidWearablePacketLength {
                expected: WEARABLE_PACKET_BYTES,
                actual: bytes.len(),
            });
        }
        let sync_word = u16::from_le_bytes([bytes[0], bytes[1]]);
        if sync_word != WEARABLE_SYNC_WORD {
            return Err(IngestError::InvalidWearableSyncWord { found: sync_word });
        }
        let expected_crc = compute_crc16_ccitt(&bytes[0..30]);
        let found_crc = u16::from_le_bytes([bytes[30], bytes[31]]);
        if expected_crc != found_crc {
            return Err(IngestError::InvalidWearableCrc {
                expected: expected_crc,
                found: found_crc,
            });
        }
        Ok(Self {
            sync_word,
            node_id: bytes[2],
            channel_mask: bytes[3],
            sequence_num: u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
            uptime_ms: u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]),
            supervisor_restart_count: u16::from_le_bytes([bytes[12], bytes[13]]),
            hr_bpm_x100: u16::from_le_bytes([bytes[14], bytes[15]]),
            spo2_pct_x100: u16::from_le_bytes([bytes[16], bytes[17]]),
            resp_brpm_x100: u16::from_le_bytes([bytes[18], bytes[19]]),
            rr_interval_ms_x10: u16::from_le_bytes([bytes[20], bytes[21]]),
            sqi_score_x10000: u16::from_le_bytes([bytes[22], bytes[23]]),
            imu_rms_g: f32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]),
            flags: u16::from_le_bytes([bytes[28], bytes[29]]),
            crc16_ccitt: found_crc,
        })
    }

    /// Converte il frame verificato in `Biometrics`, mantenendo `rmssd_ms: None`
    /// e `BeatIntervalsNotAvailable` ogni volta che `WMASK_RR_INTERVAL` e 0.
    pub fn to_biometrics(&self, radiation_dose_rate_msv_d: f64) -> Biometrics {
        let mut missing_channels = Vec::new();
        let heart_rate_bpm = if (self.channel_mask & WMASK_HR_BPM) != 0 {
            Some(self.hr_bpm_x100 as f64 / 100.0)
        } else {
            missing_channels.push("heart_rate_bpm".to_string());
            None
        };
        let spo2_pct = if (self.channel_mask & WMASK_SPO2_PCT) != 0 {
            Some(self.spo2_pct_x100 as f64 / 100.0)
        } else {
            missing_channels.push("spo2_pct".to_string());
            None
        };
        let resp_rate_brpm = if (self.channel_mask & WMASK_RESP_BRPM) != 0 {
            Some(self.resp_brpm_x100 as f64 / 100.0)
        } else {
            missing_channels.push("resp_rate_brpm".to_string());
            None
        };
        let has_rr = (self.channel_mask & WMASK_RR_INTERVAL) != 0 && self.rr_interval_ms_x10 > 0;
        if !has_rr {
            missing_channels.push("rmssd_ms".to_string());
        }
        Biometrics {
            heart_rate_bpm,
            pulse_rate_bpm: None,
            resp_rate_brpm,
            spo2_pct,
            rmssd_ms: None, // Calcolato solo da buffer multi-battito R-R reale
            hrv_unavailable_reason: if has_rr {
                None
            } else {
                Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
            },
            sdnn_ms: None,
            pnn50_pct: None,
            lf_hf_ratio: None,
            vocal_f0_hz: None,
            vocal_jitter_pct: None,
            radiation_dose_rate_msv_d,
            sqi_score: (self.sqi_score_x10000 as f64 / 10_000.0).clamp(0.0, 1.0),
            missing_channels,
        }
    }
}
```

### 3.3 Struttura dei Manifesti `deploy/medos/`

1. **`deploy/medos/asterinas_framekernel_kiosk.toml` (Tier B Host):**
   ```toml
   [kernel]
   name = "asterinas-framekernel"
   repo = "https://github.com/asterinas/asterinas"
   paper = "Peng et al., USENIX ATC 2025 (arXiv:2506.03876)"
   ostd_unsafe_tcb_pct = 14.0
   linux_abi_syscalls_min = 210
   target_arch = ["x86_64-unknown-linux-musl", "aarch64-unknown-linux-musl"]

   [arinc653_partitions.telemetry_engine]
   binary = "ares-server-cli"
   args = ["--mode", "ws-only", "--shm-ipc"]
   memory_limit_mb = 64
   period_ms = 50
   shm_mount = "/dev/shm/ares_iceoryx2"
   network_bind = "127.0.0.1:8080"

   [arinc653_partitions.workstation_shell]
   binary = "ares-desktop-os"
   memory_limit_mb = 128
   criticality = "NON_CRITICAL_DISPLAY"
   restart_on_fault = true
   ```

2. **`deploy/medos/cosmic_wayland_kiosk.ron` (Tier B Compositor):**
   ```ron
   (
       compositor: "cosmic-comp (pop-os/cosmic-comp + smithay/smithay)",
       toolkit: "iced-rs/iced + wgpu",
       mode: SingleWorkspaceKiosk,
       target_app_id: "org.areshealth.medos",
       display: (
           background_hex: "#000000",
           target_refresh_hz: 120,
           vsync: true,
           nasa_std_3001_v2_10152_budget_ms: 50,
       ),
       lockdown: (
           disable_vt_switch: true,
           disable_window_close_shortcut: true,
           allow_command_palette_shortcuts: ["Alt+Space", "Super+K"],
       ),
   )
   ```

3. **`deploy/medos/hubris_wearable_app.toml` (Tier C MCU Firmware Descriptor):**
   ```toml
   [firmware]
   kernel = "oxidecomputer/hubris"
   alt_prototyping_os = "embassy-rs/embassy"
   board = "stm32h743-nucleo-astronaut-wearable"
   kernel_loc_budget = 2200
   packet_format = "WearableSensorPacket (32 bytes, CRC-16-CCITT 0x1021)"

   [tasks.supervisor]
   priority = 0
   restart_faulted_drivers = true
   seu_counter_field = "supervisor_restart_count"

   [tasks.i2c_ppg_sensor]
   priority = 2
   mpu_isolated = true
   sample_rate_hz = 125

   [tasks.spi_ecg_adc]
   priority = 1
   mpu_isolated = true
   sample_rate_hz = 250
   emits_rr_intervals = true
   ```

### 3.4 Unified Launcher `scripts/launch_ares_medos.sh`
- `--mode desktop`: build di `ares-cockpit/dist` (se assente o `--rebuild`) e `cargo run -p ares-desktop-os --features tauri-runtime`.
- `--mode ws-browser`: avvia in parallelo `cargo run -p ares-server-cli -- --mode ws-only` e `npm --prefix ares-cockpit run dev` con trap `SIGINT`/`SIGTERM`.
- `--mode verify`: verifica sintassi TOML/RON/JSON dei manifesti `deploy/medos/`, esecuzione `./scripts/agent_probe.sh --fast`, e `npm --prefix ares-cockpit run lint`.

---

## 4. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Aggiungere `InvalidWearablePacketLength`, `InvalidWearableSyncWord`, `InvalidWearableCrc` in `crates/ares-telemetry-ingest/src/bidmc_replayer.rs` (o modulo error dedicato).
- [ ] **Step 2:** Creare `crates/ares-telemetry-ingest/src/wearable_frame.rs` con `WearableSensorPacket`, `compute_crc16_ccitt`, `decode_and_verify` e `to_biometrics`, ed esportarlo in `src/lib.rs`.
- [ ] **Step 3:** Creare la directory `deploy/medos/` con i tre manifesti (`asterinas_framekernel_kiosk.toml`, `cosmic_wayland_kiosk.ron`, `hubris_wearable_app.toml`).
- [ ] **Step 4:** Creare `scripts/launch_ares_medos.sh` eseguibile e testare `--mode verify`.
- [ ] **Step 5:** Eseguire `./scripts/agent_probe.sh --test` verificando 0 warning Clippy e 0 `.unwrap()`/`.expect()` in produzione.

---

## 5. Deterministic Verification & Unit Tests

1. **`test_wearable_sensor_packet_32_bytes_and_crc16_ccitt_roundtrip`:**
   - Verifica `size_of::<WearableSensorPacket>() == 32`, calcolo deterministico `CRC-16-CCITT`, e rigetto con `IngestError::InvalidWearableCrc` in caso di single-bit flip (simulazione SEU) su qualsiasi byte del pacchetto.
2. **`test_wearable_packet_tracks_seu_supervisor_restarts_and_null_hrv_policy`:**
   - Verifica che un pacchetto senza bit `WMASK_RR_INTERVAL` produca `rmssd_ms: None` e `HrvUnavailableReason::BeatIntervalsNotAvailable`, preservando `supervisor_restart_count` e `WFLAG_SEU_RECOVERY_EVENT`.
3. **`test_deploy_medos_manifests_parse_and_reference_valid_crates`:**
   - Verifica l'esistenza e la correttezza strutturale di `deploy/medos/*.toml` e `*.ron` rispetto ai crate e script del workspace.
