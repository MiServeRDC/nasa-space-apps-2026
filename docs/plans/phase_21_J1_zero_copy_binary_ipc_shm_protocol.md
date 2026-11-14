# Piano Implementativo Definitivo — Fase 21 (J1): Zero-Copy Binary Telemetry Protocol (`#[repr(C, align(64))]` `BinaryTelemetryFrame`), Validity Bitmask (`BEAT_INTERVALS_NOT_AVAILABLE`), and Shared-Memory Ring Buffer (`iceoryx2` / Lock-Free SPMC Seqlock Pattern)

- **Blocco Architetturale**: Blocco J (*`ARES-MedOS`: Pure-Rust Mission Workstation OS Shell, Zero-Copy IPC & Multi-Tier Space OS Partitioning*, Fasi 21–24)
- **Fase**: Fase 21 (`J1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principali**: [`crates/ares-core-types`](../../crates/ares-core-types/README.md) & [`crates/ares-server-cli`](../../crates/ares-server-cli/README.md)
- **Studio Architetturale di Riferimento**: [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md)
- **Owner Principale**: `@fabiomalagutti27-droid` & `@fertech02` (con revisione sicurezza `@MiServeRDC`)
- **File Target Previsti**:
  1. `crates/ares-core-types/src/binary_ipc.rs` *(NEW — `BinaryTelemetryFrame`, `validity_mask`, `flags`, `SeqlockTelemetryRing`)*
  2. `crates/ares-core-types/src/lib.rs` *(UPDATE — esportazione modulo `binary_ipc`)*
  3. `crates/ares-core-types/src/error.rs` *(UPDATE — varianti tipizzate `InvalidBinaryFrameMagic`, `InvalidBinaryFrameSize`, `ShmRingUnavailable`)*
  4. `crates/ares-server-cli/src/shm_bus.rs` *(NEW, feature-gated `--features shm-ipc` — publisher `iceoryx2` `ZeroCopySend` + bridge `Zenoh` DSN)*
- **Budget Latenza & Memoria**:
  - **Codifica `BinaryTelemetryFrame::encode_from_packet`**: $< 150\,\text{ns}$ (zero allocazioni heap su stack/ring, `128` byte allineati a cache line da `64` byte)
  - **Lettura Lock-Free `SeqlockTelemetryRing::read_latest`**: $< 100\,\text{ns}$ (SPMC, zero mutex, zero `.unwrap()`)
  - **Prestazione `iceoryx2` POSIX SHM (`--features shm-ipc`, Tier B)**: $< 100\,\text{ns}$ (`0` copie di payload)
  - **Margine Normativo `NASA-STD-3001 Vol. 2 Rev F`**: $> 500\times$ dentro `[V2 10152]` ($\le 50\,\text{ms}$) e $> 1000\times$ dentro `[V2 10022]` ($\le 100\,\text{ms}$)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, `thiserror` per tutti gli errori di libreria, zero emoji, preservazione integrale della nullabilita di Issue `#11` (`BEAT_INTERVALS_NOT_AVAILABLE`) e dello stato Issue `#12` (`ModelValidationStatus::IllustrativeUnvalidated`).

---

## 1. Executive Summary & Scientific / Open-Source Grounding

### 1.1 Problema Architetturale: Eliminare il Jitter JSON-over-TCP nel Hot-Path a `20 Hz`–`125 Hz`
Attualmente, `crates/ares-server-cli/src/ws_server.rs` (`build_axum_router`) serializza l'intero `WireTelemetryPacket` annidato in una stringa JSON a `20 Hz` su `tokio::sync::broadcast<String>`, copiando il payload attraverso socket TCP loopback (`127.0.0.1:8080`) verso il client browser `ares-cockpit/`, che a sua volta invoca `JSON.parse()` e la validazione runtime (`isValidTelemetryPayload`).

Sebbene il motore fisiopatologico Rust (`compute_mission_telemetry_tick_from_row` + `NqsEngine` + `ARES-HyperGraph`) completi un tick in **`66.38 µs`** (`< 150 µs` SLA), la serializzazione JSON + loopback TCP + GC del parser JS introduce **`~1.2–3.5 ms` di jitter** per frame e non scala al campionamento ad alta frequenza (`125 Hz`–`500 Hz`) di forme d'onda grezze `ECG`/`PPG`.

La **Fase 21 (`J1`)** introduce uno strato di trasporto binario deterministico a zero copie che:
1. **Non sostituisce** il server `axum` WebSocket/HTTP (`127.0.0.1:8080`), ma vi affianca un frame binario fisso da **`128` byte** (`#[repr(C, align(64))] pub struct BinaryTelemetryFrame`) adatto sia a `tauri::ipc::Channel<Response>` (Tier A, Fase 22) sia alla memoria condivisa POSIX inter-processo `iceoryx2` (Tier B).
2. **Preserva bit-per-bit la semantica `Option<f64>::None` (Issue `#11` / PR `#20` / `experienceLog Entry 006`):** Nessun canale assente (`rmssd_ms: None` con `BEAT_INTERVALS_NOT_AVAILABLE`, oppure i 13 campioni mancanti di `pulse_rate_bpm`/`spo2_pct` in `bidmc_01_Numerics.csv`) viene mai convertito in `0.0`. Un bit dedicato a `0` in `validity_mask: u32` abbinato al sentinella `f64::NAN` forza il decoder a ricostruire `None` (`null` in TypeScript).
3. **Realizza il partizionamento `ARINC 653` in puro Rust:** Un ring buffer SPMC (*Single-Producer, Multi-Consumer*) lock-free basato su **Seqlock atomico** (`SeqlockTelemetryRing`) in `ares-core-types`, estendibile con `--features shm-ipc` verso `eclipse-iceoryx/iceoryx2` (`ZeroCopySend`) e `eclipse-zenoh/zenoh`, impedisce che un crash o uno stallo del processo UI possa mai bloccare o corrompere il produttore fisiologico (`ADHG`, `NQS-STL`, `SafetyGates`).

### 1.2 Riferimenti a Repository Pubblici, Standard NASA e Letteratura Scientifica

| Fonte / Repository / Standard | Riferimento Bibliografico / URL & Licenza | Contributo Specifico alla Fase 21 (`J1`) |
| :--- | :--- | :--- |
| **`eclipse-iceoryx/iceoryx2`** | `https://github.com/eclipse-iceoryx/iceoryx2` (`Apache-2.0 OR MIT`) | Bus IPC POSIX shared-memory *daemonless* in puro Rust (`no RouDi`), trait `ZeroCopySend` verificato a compile-time, pattern `publisher.loan_uninit()` (`< 100 ns`), architettura allineata a ISO 26262 / DO-178. |
| **`eclipse-zenoh/zenoh`** | `https://github.com/eclipse-zenoh/zenoh` (`EPL-2.0 OR Apache-2.0`) | Pub/sub unificato con feature `shared-memory` locale (`< 1 us`) e bridge tollerante a ritardi DSN (4–24 min OWLT) su key expression `ares/crew/{astronaut_id}/vitals/raw`. |
| **`nasa/cFE` (`nasa/cFS`)** | `https://github.com/nasa/cFS` (NASA Open Source Agreement) | Modello NASA Core Flight System Software Bus (`SB`) a pacchetti binari a layout fisso con header deterministico (`magic`, `version`, `timestamp`) per telemetria di volo senza parsing testuale nel loop critico. |
| **`redox-os/redox`** | `https://gitlab.redox-os.org/redox-os/redox` (`MIT`) | Modello a capability URI `scheme:` (`ares://telemetry/frame/latest`, `slice://`, `handle://`) applicato al routing di frame e viste di privacy (`CrewRole`) ai confini dei processi. |
| **Cheptsov & Khoroshilov (2018, 2023)** | *"ARINC 653 Partitioning Architecture & Safety-Critical Isolation"*, *Proc. ISP RAS*, 2018 (`DOI: 10.1109/ispras.2018.00009`) & 2023 (`DOI: 10.1109/ispras60948.2023.10508165`) | Fondamento formale del contenimento temporale e spaziale dei guasti: il produttore critico `1 Hz / 20 Hz` non puo mai attendere un lock o un buffer del consumatore UI non critico. |
| **`NASA-STD-3001 Vol. 2 Rev F`** | Clauses `[V2 10022]` (`<= 100 ms`) & `[V2 10152]` (`<= 50 ms`), Luglio 2026 | Requisiti normativi di latenza massima per feedback di controllo discreto (`<= 100 ms`) e display dinamici continui (`<= 50 ms`), ampiamente soddisfatti dal frame binario `< 150 ns`. |
| **`PhysioNet BIDMC v1.0.0` & Issue `#11`/`#12`** | Pimentel et al., *IEEE TBME* 2017 (`DOI: 10.1109/TBME.2016.2613124`); `docs/architecture/MODEL_EVIDENCE_AUDIT.md` | Obbligo di mantenere `rmssd_ms: None` (`BEAT_INTERVALS_NOT_AVAILABLE`) e flag `ILLUSTRATIVE_UNVALIDATED` anche nella codifica binaria compatta. |

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

| Modulo / File | Azione | Responsabilita nella Fase 21 (`J1`) |
| :--- | :--- | :--- |
| `crates/ares-core-types/src/binary_ipc.rs` | **CREATE** | Definisce `BinaryTelemetryFrame` (`#[repr(C, align(64))]`, `128` byte), le maschere `MASK_*` e `FLAG_*`, le asserzioni compile-time su `size_of`, `align_of` e `offset_of!`, i metodi `encode_from_packet` / `decode_to_parts`, e `SeqlockTelemetryRing<const N: usize>`. |
| `crates/ares-core-types/src/error.rs` | **UPDATE** | Aggiunge `InvalidBinaryFrameMagic`, `InvalidBinaryFrameVersion`, `InvalidBinaryFrameLength`, `ShmRingTornReadExhausted` in `AresCoreError`. |
| `crates/ares-core-types/src/lib.rs` | **UPDATE** | Esporta `pub mod binary_ipc;` e i tipi principali `BinaryTelemetryFrame`, `SeqlockTelemetryRing`. |
| `crates/ares-server-cli/src/shm_bus.rs` | **CREATE** | Modulo opzionale dietro `#[cfg(feature = "shm-ipc")]` che avvolge `BinaryTelemetryFrame` in `iceoryx2::prelude::ZeroCopySend` e pubblica su topic `Zenoh` `ares/crew/ares-cdr-01/vitals/frame`. |

---

## 3. Specifica Matematica, Layout Binario (128 Byte) & Protocollo Seqlock SPMC

### 3.1 Layout Esatto Cache-Line-Aligned (`#[repr(C, align(64))]`, 128 Byte = 2 Cache Lines)
Ogni campo e posizionato su allineamento naturale senza alcun byte di padding implicito inserito dal compilatore (`0` byte di padding nascosto), su architettura little-endian (`x86_64` e Apple Silicon `aarch64`):

| Offset Byte | Dimensione | Tipo Rust | Campo | Semantica & Invarianti |
| :---: | :---: | :--- | :--- | :--- |
| `0..4` | `4 B` | `u32` | `magic` | Costante `0x4152_4553` (`"ARES"` in ASCII big/LE magic tag `ARES_BINARY_MAGIC`). |
| `4..6` | `2 B` | `u16` | `version` | Versione schema binario (`ARES_BINARY_VERSION = 1`). |
| `6..8` | `2 B` | `u16` | `flags` | Bitfield booleano/stato: `FLAG_WHAT_IF_ACTIVE`, `FLAG_POCUS_CONFIRMED`, `FLAG_LBNP_ACTIVE`, `FLAG_GATE1_ANTICOAG_LOCK`, `FLAG_GATE2_LBNP_VENT`, `FLAG_GATE3_EVA_DAMPING`, `FLAG_BEAT_INTERVALS_NOT_AVAILABLE`, `FLAG_ILLUSTRATIVE_UNVALIDATED`. |
| `8..12` | `4 B` | `u32` | `validity_mask` | Bitmask di validita `Option<f64>`: `1` = canale finito presente, `0` = `None` (`f64::NAN` nel payload). |
| `12..13` | `1 B` | `u8` | `alert_severity_code` | `0=Nominal`, `1=DataDegradedMissingChannels`, `2=Caution`, `3=Warning`, `4=CriticalEmergency`. |
| `13..14` | `1 B` | `u8` | `system_phase_code` | `0=Gather`, `1=Evaluate`, `2=Act`. |
| `14..15` | `1 B` | `u8` | `habitat_zone_code` | `0..5` mappato a `HabitatZoneId` (`SleepQuarters`..`EvaAirlock`). |
| `15..16` | `1 B` | `u8` | `hottest_region_code` | `0..4` mappato alla regione `UBERON:` con intensita massima nella 3D Body Heatmap. |
| `16..20` | `4 B` | `u32` | `flight_day` | Giorno di volo simulato/corrente (`0..=1200`). |
| `20..24` | `4 B` | `f32` | `relative_recording_time_s` | Tempo nativo `1 Hz` BIDMC (`0.0..=480.0 s`, esatto in `f32` per oltre `194` giorni). |
| `24..32` | `8 B` | `u64` | `timestamp_ms` | Timestamp UNIX in millisecondi (`u64` allineato a 8 byte). |
| `32..40` | `8 B` | `f64` | `hr_bpm` | Frequenza cardiaca ECG (`MASK_HR_BPM`, bit `0`). |
| `40..48` | `8 B` | `f64` | `pulse_bpm` | Pulsazione PPG (`MASK_PULSE_BPM`, bit `1` — `None`/`NaN` nei 13 gap di `bidmc_01`). |
| `48..56` | `8 B` | `f64` | `spo2_pct` | Saturazione ossigeno (`MASK_SPO2_PCT`, bit `2` — `None`/`NaN` nei 13 gap di `bidmc_01`). |
| `56..64` | `8 B` | `f64` | `resp_brpm` | Frequenza respiratoria (`MASK_RESP_BRPM`, bit `3`). *(Fine Cache Line 0 = 64 B)* |
| `64..72` | `8 B` | `f64` | `rmssd_ms` | HRV RMSSD (`MASK_RMSSD_MS`, bit `4` — sempre bit `0` / `NaN` quando `FLAG_BEAT_INTERVALS_NOT_AVAILABLE` e attivo). |
| `72..80` | `8 B` | `f64` | `tau_w_dyn_cm2` | Shear stress venoso giugulare $\tau_w(t)$ (`dyn/cm^2`, `MASK_TAU_W`, bit `5`). |
| `80..88` | `8 B` | `f64` | `sans_onsd_mm` | Diametro guaina nervo ottico `ONSD` (`mm`, `MASK_SANS_ONSD`, bit `6`). |
| `88..96` | `8 B` | `f64` | `sclerostin_pmol_l` | Concentrazione Sclerostina RK4 (`pmol/L`, `MASK_SCLEROSTIN`, bit `7`). |
| `96..104` | `8 B` | `f64` | `gai_pct` | Gait Asymmetry Index a $0.38g$ (`%`, `MASK_GAI_PCT`, bit `8`). |
| `104..112` | `8 B` | `f64` | `rho_global` | Robustezza globale `NQS-STL` (`MASK_RHO_GLOBAL`, bit `9` — `None`/`NaN` se HRV richiesto ma assente). |
| `112..120` | `8 B` | `f64` | `ttv_hours` | Time-To-Violation (`ore`, `MASK_TTV_HOURS`, bit `10`). |
| `120..128` | `8 B` | `f64` | `mri_pct` | Mission Readiness Index (`0..100%`, `MASK_MRI_PCT`, bit `11`). *(Fine Cache Line 1 = 128 B)* |

### 3.2 Invariante di Nullabilita `Option<f64>` (Issue `#11` / `Entry 006`)
Per ogni canale opzionale $c_i$ associato al bit $b_i = 1 \ll i$ di `validity_mask`:
$$\operatorname{encode}(x) = \begin{cases} (\text{mask} \mathbin{|=} b_i,\; v) & \text{se } x = \text{Some}(v) \land \operatorname{is\_finite}(v) \\ (\text{mask} \mathbin{\&}= \neg b_i,\; \text{NaN}) & \text{altrimenti} \end{cases}$$
$$\operatorname{decode}(\text{mask}, v) = \begin{cases} \text{Some}(v) & \text{se } (\text{mask} \mathbin{\&} b_i) \ne 0 \land \operatorname{is\_finite}(v) \\ \text{None} & \text{altrimenti} \end{cases}$$
Questa doppia guardia (`bitmask` + `is_finite()`) garantisce che anche in caso di corruzione parziale o mancato supporto R-R (`BEAT_INTERVALS_NOT_AVAILABLE`), nessun canale mancante possa mai propagarsi come `0.0` verso la UI o verso `Timestral`.

### 3.3 Protocollo Lock-Free SPMC Seqlock (`SeqlockTelemetryRing<const N: usize>`)
Per disaccoppiare in memoria la partizione di calcolo (`1 Hz / 20 Hz`) dai consumatori (`Tauri` IPC, `Rerun`/`egui` companion, diagnostica) senza alcun `Mutex` bloccante (`ARINC 653` temporal isolation):
- Ogni slot $s_k$ ($k \in \{0..N-1\}$, $N$ potenza di `2`) contiene un contatore atomico `seq: AtomicU64` inizializzato a `0` e un payload `BinaryTelemetryFrame`.
- **Scrittore (Single-Producer):**
  1. Incrementa `slot.seq` con `Ordering::Release` da valore pari $2m$ a valore dispari $2m+1$ (*scrittura in corso*).
  2. Esegue `std::sync::atomic::fence(Ordering::Release)` e scrive i `128` byte del frame.
  3. Incrementa `slot.seq` a $2m+2$ (`Ordering::Release`) e pubblica `head_index` (`AtomicU64`).
- **Lettore (Multi-Consumer, Wait-Free / Bounded Retry):**
  1. Legge `s1 = slot.seq.load(Ordering::Acquire)`; se `s1 & 1 == 1` riprova.
  2. Copia i `128` byte del frame.
  3. Esegue `fence(Ordering::Acquire)` e legge `s2 = slot.seq.load(Ordering::Relaxed)`.
  4. Se `s1 == s2`, il frame e matematicamente consistente (*zero torn reads*). In caso di contesa persistente oltre `MAX_RETRIES = 8`, restituisce `Err(AresCoreError::ShmRingTornReadExhausted)` senza mai bloccare ne fare `panic!`.

---

## 4. Concrete Rust Signatures & Data Structures (`crates/ares-core-types/src/binary_ipc.rs`)

```rust
//! Fase 21 (J1): Contratto binario zero-copy `BinaryTelemetryFrame` (128 byte,
//! allineamento cache-line 64 byte) e ring buffer lock-free SPMC Seqlock.

use crate::error::AresCoreError;
use crate::telemetry::{
    AlertSeverity, HrvUnavailableReason, ModelValidationStatus, ScenarioOverlayMode, SystemPhase,
    TelemetryPacket,
};
use core::mem::{align_of, offset_of, size_of};
use core::sync::atomic::{AtomicU64, Ordering, fence};
use std::cell::UnsafeCell;

pub const ARES_BINARY_MAGIC: u32 = 0x4152_4553; // "ARES"
pub const ARES_BINARY_VERSION: u16 = 1;
pub const ARES_BINARY_FRAME_BYTES: usize = 128;

// Maschere di validita (Bit = 1 => valore presente e finito; Bit = 0 => None / null).
pub const MASK_HR_BPM: u32 = 1 << 0;
pub const MASK_PULSE_BPM: u32 = 1 << 1;
pub const MASK_SPO2_PCT: u32 = 1 << 2;
pub const MASK_RESP_BRPM: u32 = 1 << 3;
pub const MASK_RMSSD_MS: u32 = 1 << 4;
pub const MASK_TAU_W: u32 = 1 << 5;
pub const MASK_SANS_ONSD: u32 = 1 << 6;
pub const MASK_SCLEROSTIN: u32 = 1 << 7;
pub const MASK_GAI_PCT: u32 = 1 << 8;
pub const MASK_RHO_GLOBAL: u32 = 1 << 9;
pub const MASK_TTV_HOURS: u32 = 1 << 10;
pub const MASK_MRI_PCT: u32 = 1 << 11;

// Flag di stato e sicurezza clinica.
pub const FLAG_WHAT_IF_ACTIVE: u16 = 1 << 0;
pub const FLAG_POCUS_CONFIRMED: u16 = 1 << 1;
pub const FLAG_LBNP_ACTIVE: u16 = 1 << 2;
pub const FLAG_GATE1_ANTICOAG_LOCK: u16 = 1 << 3;
pub const FLAG_GATE2_LBNP_VENT: u16 = 1 << 4;
pub const FLAG_GATE3_EVA_DAMPING: u16 = 1 << 5;
pub const FLAG_BEAT_INTERVALS_NOT_AVAILABLE: u16 = 1 << 6;
pub const FLAG_ILLUSTRATIVE_UNVALIDATED: u16 = 1 << 7;

/// Frame telemetrico deterministico da 128 byte allineato a 2 cache line da 64 byte.
/// Adatto a `tauri::ipc::Channel<Response>` e a memoria condivisa `iceoryx2::ZeroCopySend`.
#[repr(C, align(64))]
#[derive(Debug, Clone, Copy)]
pub struct BinaryTelemetryFrame {
    pub magic: u32,
    pub version: u16,
    pub flags: u16,
    pub validity_mask: u32,
    pub alert_severity_code: u8,
    pub system_phase_code: u8,
    pub habitat_zone_code: u8,
    pub hottest_region_code: u8,
    pub flight_day: u32,
    pub relative_recording_time_s: f32,
    pub timestamp_ms: u64,
    pub hr_bpm: f64,
    pub pulse_bpm: f64,
    pub spo2_pct: f64,
    pub resp_brpm: f64,
    pub rmssd_ms: f64,
    pub tau_w_dyn_cm2: f64,
    pub sans_onsd_mm: f64,
    pub sclerostin_pmol_l: f64,
    pub gai_pct: f64,
    pub rho_global: f64,
    pub ttv_hours: f64,
    pub mri_pct: f64,
}

// Asserzioni compile-time dell'ABI binaria (zero padding implicito).
const _: () = assert!(size_of::<BinaryTelemetryFrame>() == ARES_BINARY_FRAME_BYTES);
const _: () = assert!(align_of::<BinaryTelemetryFrame>() == 64);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, validity_mask) == 8);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, timestamp_ms) == 24);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, hr_bpm) == 32);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, resp_brpm) == 56);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, rmssd_ms) == 64);
const _: () = assert!(offset_of!(BinaryTelemetryFrame, mri_pct) == 120);

#[inline]
fn encode_opt_f64(opt: Option<f64>, bit: u32, mask: &mut u32) -> f64 {
    match opt {
        Some(v) if v.is_finite() => {
            *mask |= bit;
            v
        }
        _ => f64::NAN,
    }
}

#[inline]
fn encode_finite_f64(val: f64, bit: u32, mask: &mut u32) -> f64 {
    if val.is_finite() {
        *mask |= bit;
        val
    } else {
        f64::NAN
    }
}

#[inline]
fn decode_opt_f64(mask: u32, bit: u32, val: f64) -> Option<f64> {
    if (mask & bit) != 0 && val.is_finite() {
        Some(val)
    } else {
        None
    }
}

impl BinaryTelemetryFrame {
    /// Impacchetta un `TelemetryPacket` in `BinaryTelemetryFrame` preservando
    /// rigorosamente tutti i campi `None` (Issue #11) e lo stato di validazione (Issue #12).
    pub fn from_packet(
        pkt: &TelemetryPacket,
        timestamp_ms: u64,
        habitat_zone_code: u8,
        hottest_region_code: u8,
    ) -> Self {
        let mut mask: u32 = 0;
        let hr_bpm = encode_opt_f64(pkt.biometrics.heart_rate_bpm, MASK_HR_BPM, &mut mask);
        let pulse_bpm = encode_opt_f64(pkt.biometrics.pulse_rate_bpm, MASK_PULSE_BPM, &mut mask);
        let spo2_pct = encode_opt_f64(pkt.biometrics.spo2_pct, MASK_SPO2_PCT, &mut mask);
        let resp_brpm = encode_opt_f64(pkt.biometrics.resp_rate_brpm, MASK_RESP_BRPM, &mut mask);
        let rmssd_ms = encode_opt_f64(pkt.biometrics.rmssd_ms, MASK_RMSSD_MS, &mut mask);
        let tau_w_dyn_cm2 =
            encode_finite_f64(pkt.jugular_hemodynamics.tau_w_dyn_cm2, MASK_TAU_W, &mut mask);
        let sans_onsd_mm = encode_finite_f64(pkt.sans_ocular.onsd_mm, MASK_SANS_ONSD, &mut mask);
        let sclerostin_pmol_l =
            encode_finite_f64(pkt.musculoskeletal.sclerostin_pmol_l, MASK_SCLEROSTIN, &mut mask);
        let gai_pct = encode_finite_f64(pkt.musculoskeletal.gai_pct, MASK_GAI_PCT, &mut mask);
        let rho_global = encode_opt_f64(pkt.nqs_stl.rho_global, MASK_RHO_GLOBAL, &mut mask);
        let ttv_hours = encode_opt_f64(pkt.nqs_stl.ttv_hours, MASK_TTV_HOURS, &mut mask);
        let mri_pct = encode_opt_f64(pkt.nqs_stl.mri_pct, MASK_MRI_PCT, &mut mask);

        let mut flags: u16 = 0;
        if matches!(
            pkt.provenance_manifest.scenario_overlay_mode,
            ScenarioOverlayMode::SimulatedWhatifScenario | ScenarioOverlayMode::DerivedAndSimulated
        ) {
            flags |= FLAG_WHAT_IF_ACTIVE;
        }
        if pkt.jugular_hemodynamics.pocus_thrombus_confirmed {
            flags |= FLAG_POCUS_CONFIRMED;
        }
        if pkt.jugular_hemodynamics.lbnp_active {
            flags |= FLAG_LBNP_ACTIVE;
        }
        if pkt.active_playbook.safety_gates.anticoagulant_lock_active {
            flags |= FLAG_GATE1_ANTICOAG_LOCK;
        }
        if pkt.active_playbook.safety_gates.lbnp_auto_vent_armed {
            flags |= FLAG_GATE2_LBNP_VENT;
        }
        if pkt.active_playbook.safety_gates.eva_suit_damping_active {
            flags |= FLAG_GATE3_EVA_DAMPING;
        }
        if matches!(
            pkt.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        ) {
            flags |= FLAG_BEAT_INTERVALS_NOT_AVAILABLE;
        }
        if matches!(
            pkt.model_validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        ) {
            flags |= FLAG_ILLUSTRATIVE_UNVALIDATED;
        }

        let alert_severity_code = match pkt.alert_severity {
            AlertSeverity::Nominal => 0,
            AlertSeverity::DataDegradedMissingChannels => 1,
            AlertSeverity::Caution => 2,
            AlertSeverity::Warning => 3,
            AlertSeverity::CriticalEmergency => 4,
        };
        let system_phase_code = match pkt.system_phase {
            SystemPhase::Gather => 0,
            SystemPhase::Evaluate => 1,
            SystemPhase::Act => 2,
        };

        Self {
            magic: ARES_BINARY_MAGIC,
            version: ARES_BINARY_VERSION,
            flags,
            validity_mask: mask,
            alert_severity_code,
            system_phase_code,
            habitat_zone_code,
            hottest_region_code,
            flight_day: pkt.flight_day,
            relative_recording_time_s: pkt.relative_recording_time_s as f32,
            timestamp_ms,
            hr_bpm,
            pulse_bpm,
            spo2_pct,
            resp_brpm,
            rmssd_ms,
            tau_w_dyn_cm2,
            sans_onsd_mm,
            sclerostin_pmol_l,
            gai_pct,
            rho_global,
            ttv_hours,
            mri_pct,
        }
    }

    /// Serializza il frame nei 128 byte esatti little-endian pronti per IPC binario.
    pub fn to_le_bytes_array(&self) -> [u8; ARES_BINARY_FRAME_BYTES] {
        let mut out = [0u8; ARES_BINARY_FRAME_BYTES];
        out[0..4].copy_from_slice(&self.magic.to_le_bytes());
        out[4..6].copy_from_slice(&self.version.to_le_bytes());
        out[6..8].copy_from_slice(&self.flags.to_le_bytes());
        out[8..12].copy_from_slice(&self.validity_mask.to_le_bytes());
        out[12] = self.alert_severity_code;
        out[13] = self.system_phase_code;
        out[14] = self.habitat_zone_code;
        out[15] = self.hottest_region_code;
        out[16..20].copy_from_slice(&self.flight_day.to_le_bytes());
        out[20..24].copy_from_slice(&self.relative_recording_time_s.to_le_bytes());
        out[24..32].copy_from_slice(&self.timestamp_ms.to_le_bytes());
        let floats = [
            self.hr_bpm,
            self.pulse_bpm,
            self.spo2_pct,
            self.resp_brpm,
            self.rmssd_ms,
            self.tau_w_dyn_cm2,
            self.sans_onsd_mm,
            self.sclerostin_pmol_l,
            self.gai_pct,
            self.rho_global,
            self.ttv_hours,
            self.mri_pct,
        ];
        for (idx, val) in floats.into_iter().enumerate() {
            let start = 32 + idx * 8;
            out[start..start + 8].copy_from_slice(&val.to_le_bytes());
        }
        out
    }

    /// Decodifica e valida un buffer binario da 128 byte senza allocazioni ne panici.
    pub fn from_le_bytes_slice(bytes: &[u8]) -> Result<Self, AresCoreError> {
        if bytes.len() != ARES_BINARY_FRAME_BYTES {
            return Err(AresCoreError::InvalidBinaryFrameLength {
                expected: ARES_BINARY_FRAME_BYTES,
                actual: bytes.len(),
            });
        }
        let magic = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        if magic != ARES_BINARY_MAGIC {
            return Err(AresCoreError::InvalidBinaryFrameMagic { found: magic });
        }
        let version = u16::from_le_bytes([bytes[4], bytes[5]]);
        if version != ARES_BINARY_VERSION {
            return Err(AresCoreError::InvalidBinaryFrameVersion { found: version });
        }
        let read_f64 = |offset: usize| -> f64 {
            f64::from_le_bytes([
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3],
                bytes[offset + 4],
                bytes[offset + 5],
                bytes[offset + 6],
                bytes[offset + 7],
            ])
        };
        Ok(Self {
            magic,
            version,
            flags: u16::from_le_bytes([bytes[6], bytes[7]]),
            validity_mask: u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]),
            alert_severity_code: bytes[12],
            system_phase_code: bytes[13],
            habitat_zone_code: bytes[14],
            hottest_region_code: bytes[15],
            flight_day: u32::from_le_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]),
            relative_recording_time_s: f32::from_le_bytes([
                bytes[20], bytes[21], bytes[22], bytes[23],
            ]),
            timestamp_ms: u64::from_le_bytes([
                bytes[24], bytes[25], bytes[26], bytes[27], bytes[28], bytes[29], bytes[30],
                bytes[31],
            ]),
            hr_bpm: read_f64(32),
            pulse_bpm: read_f64(40),
            spo2_pct: read_f64(48),
            resp_brpm: read_f64(56),
            rmssd_ms: read_f64(64),
            tau_w_dyn_cm2: read_f64(72),
            sans_onsd_mm: read_f64(80),
            sclerostin_pmol_l: read_f64(88),
            gai_pct: read_f64(96),
            rho_global: read_f64(104),
            ttv_hours: read_f64(112),
            mri_pct: read_f64(120),
        })
    }

    #[inline]
    pub fn rmssd_opt(&self) -> Option<f64> {
        decode_opt_f64(self.validity_mask, MASK_RMSSD_MS, self.rmssd_ms)
    }

    #[inline]
    pub fn spo2_opt(&self) -> Option<f64> {
        decode_opt_f64(self.validity_mask, MASK_SPO2_PCT, self.spo2_pct)
    }

    #[inline]
    pub fn pulse_opt(&self) -> Option<f64> {
        decode_opt_f64(self.validity_mask, MASK_PULSE_BPM, self.pulse_bpm)
    }

    #[inline]
    pub fn rho_global_opt(&self) -> Option<f64> {
        decode_opt_f64(self.validity_mask, MASK_RHO_GLOBAL, self.rho_global)
    }
}

/// Slot singolo allineato a 64 byte per ring buffer Seqlock SPMC.
#[repr(C, align(64))]
struct SeqlockSlot {
    seq: AtomicU64,
    payload: UnsafeCell<[u8; ARES_BINARY_FRAME_BYTES]>,
}

/// Ring buffer lock-free SPMC (Single-Producer, Multi-Consumer) con semantica Seqlock.
/// Garantisce zero blocchi del produttore critico anche in caso di stallo della UI (ARINC 653).
pub struct SeqlockTelemetryRing<const N: usize> {
    write_cursor: AtomicU64,
    slots: [SeqlockSlot; N],
}

// SAFETY: Il singolo produttore aggiorna in mutua esclusione logica lo slot protetto
// da seq dispari/pari con barriere Acquire/Release; i lettori copiano byte atomici solo
// quando seq e pari e invariato prima e dopo la lettura.
unsafe impl<const N: usize> Sync for SeqlockTelemetryRing<N> {}

impl<const N: usize> SeqlockTelemetryRing<N> {
    pub fn new() -> Self {
        const { assert!(N > 0 && N.is_power_of_two()) };
        Self {
            write_cursor: AtomicU64::new(0),
            slots: core::array::from_fn(|_| SeqlockSlot {
                seq: AtomicU64::new(0),
                payload: UnsafeCell::new([0u8; ARES_BINARY_FRAME_BYTES]),
            }),
        }
    }

    /// Pubblica un frame senza bloccare mai alcun lettore (< 100 ns).
    pub fn publish(&self, frame: &BinaryTelemetryFrame) {
        let idx = self.write_cursor.load(Ordering::Relaxed);
        let slot = &self.slots[(idx as usize) & (N - 1)];
        let prev_seq = slot.seq.load(Ordering::Relaxed);
        slot.seq.store(prev_seq.wrapping_add(1), Ordering::Release);
        fence(Ordering::Release);
        let raw = frame.to_le_bytes_array();
        // SAFETY: `prev_seq + 1` e dispari; solo questo singolo produttore scrive in questo slot.
        unsafe {
            *slot.payload.get() = raw;
        }
        slot.seq.store(prev_seq.wrapping_add(2), Ordering::Release);
        self.write_cursor.store(idx.wrapping_add(1), Ordering::Release);
    }

    /// Legge l'ultimo frame consistente senza bloccare lo scrittore.
    pub fn read_latest(&self) -> Result<BinaryTelemetryFrame, AresCoreError> {
        let cursor = self.write_cursor.load(Ordering::Acquire);
        if cursor == 0 {
            return Err(AresCoreError::ShmRingEmpty);
        }
        let slot = &self.slots[((cursor - 1) as usize) & (N - 1)];
        for _ in 0..8 {
            let s1 = slot.seq.load(Ordering::Acquire);
            if (s1 & 1) != 0 {
                core::hint::spin_loop();
                continue;
            }
            // SAFETY: Lettura speculativa validata dal controllo successivo `s1 == s2`.
            let bytes = unsafe { *slot.payload.get() };
            fence(Ordering::Acquire);
            let s2 = slot.seq.load(Ordering::Relaxed);
            if s1 == s2 {
                return BinaryTelemetryFrame::from_le_bytes_slice(&bytes);
            }
        }
        Err(AresCoreError::ShmRingTornReadExhausted)
    }
}
```

### 4.1 Adattatore Tier B `iceoryx2` & `Zenoh` (`crates/ares-server-cli/src/shm_bus.rs`, `--features shm-ipc`)

```rust
// Dietro #[cfg(feature = "shm-ipc")] in crates/ares-server-cli/Cargo.toml:
// iceoryx2 = { version = "0.5", optional = true }
// zenoh = { version = "1.0", features = ["shared-memory"], optional = true }

#[cfg(feature = "shm-ipc")]
pub mod shm_ipc_adapter {
    use ares_core_types::binary_ipc::{ARES_BINARY_FRAME_BYTES, BinaryTelemetryFrame};

    /// Wrapper ZeroCopySend a layout C identico a BinaryTelemetryFrame (128 byte).
    #[repr(C, align(64))]
    #[derive(Debug, Clone, Copy, iceoryx2::prelude::ZeroCopySend)]
    #[type_name("ares.medos.BinaryTelemetryFrame.v1")]
    pub struct Iox2TelemetryFrame {
        pub bytes: [u8; ARES_BINARY_FRAME_BYTES],
    }

    impl From<&BinaryTelemetryFrame> for Iox2TelemetryFrame {
        fn from(frame: &BinaryTelemetryFrame) -> Self {
            Self {
                bytes: frame.to_le_bytes_array(),
            }
        }
    }
}
```

---

## 5. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Aggiungere in `crates/ares-core-types/src/error.rs` le varianti `InvalidBinaryFrameMagic`, `InvalidBinaryFrameVersion`, `InvalidBinaryFrameLength`, `ShmRingEmpty`, `ShmRingTornReadExhausted`.
- [ ] **Step 2:** Creare `crates/ares-core-types/src/binary_ipc.rs` con `BinaryTelemetryFrame` (asserzioni compile-time `128 B` / `align(64)` / `offset_of!`) e `SeqlockTelemetryRing<N>` ed esportarlo in `crates/ares-core-types/src/lib.rs`.
- [ ] **Step 3:** Integrare in `crates/ares-server-cli/src/ws_server.rs` (`SharedMissionState`) un `Arc<SeqlockTelemetryRing<64>>` aggiornato in `advance_tick` e `apply_stress_test_patch` con un metodo `latest_binary_frame(&self) -> Option<BinaryTelemetryFrame>`.
- [ ] **Step 4:** Aggiungere la feature opzionale `shm-ipc` in `crates/ares-server-cli/Cargo.toml` e creare `crates/ares-server-cli/src/shm_bus.rs` con l'adattatore `iceoryx2::ZeroCopySend` e la configurazione topic `Zenoh` (`ares/crew/ares-cdr-01/vitals/frame`).
- [ ] **Step 5:** Eseguire `./scripts/agent_probe.sh --test` verificando 0 warning Clippy e 0 `.unwrap()`/`.expect()` in produzione.

---

## 6. Deterministic Verification & Unit Tests

1. **`test_binary_telemetry_frame_abi_size_alignment_and_roundtrip`:**
   - Verifica `size_of::<BinaryTelemetryFrame>() == 128`, `align_of::<BinaryTelemetryFrame>() == 64`, round-trip `to_le_bytes_array()` $\leftrightarrow$ `from_le_bytes_slice()` e rigetto deterministico di buffer troncati o con magic errato.
2. **`test_binary_frame_preserves_beat_intervals_not_available_and_bidmc_nulls`:**
   - Costruisce un `TelemetryPacket` con `rmssd_ms: None`, `hrv_unavailable_reason: Some(BeatIntervalsNotAvailable)`, `pulse_rate_bpm: None`, `spo2_pct: None`, e verifica che `validity_mask` abbia i bit `MASK_RMSSD_MS`, `MASK_PULSE_BPM`, `MASK_SPO2_PCT` a `0`, che `FLAG_BEAT_INTERVALS_NOT_AVAILABLE` e `FLAG_ILLUSTRATIVE_UNVALIDATED` siano impostati a `1`, e che `rmssd_opt()`, `pulse_opt()`, `spo2_opt()` restituiscano esattamente `None`.
3. **`test_seqlock_telemetry_ring_spmc_concurrent_zero_torn_reads`:**
   - Lancia 1 thread produttore che pubblica `10_000` frame consecutivi e 2 thread lettori concorrenti su `SeqlockTelemetryRing<64>`, verificando che ogni lettura riuscita restituisca un frame con `magic == ARES_BINARY_MAGIC` e coerenza interna (`flight_day`, `timestamp_ms`) senza mai un singolo torn read o panic.
