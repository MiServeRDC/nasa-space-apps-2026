# Piano Implementativo Definitivo — Fase 23 (J3): `ARES-MedOS` System Chrome Status Bar, `Alt+Space` (`Cmd+K`) Native FastMCP Command Palette, and Dual-Transport Frontend Bridge (`ares-cockpit/`)

- **Blocco Architetturale**: Blocco J (*`ARES-MedOS`: Pure-Rust Mission Workstation OS Shell, Zero-Copy IPC & Multi-Tier Space OS Partitioning*, Fasi 21–24)
- **Fase**: Fase 23 (`J3`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Target Principali**: `ares-cockpit/` (`TypeScript` + `React 19` + `Tailwind v4` + optional `@tauri-apps/api`)
- **Studio Architetturale di Riferimento**: [`docs/architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md`](../architecture/RUST_OS_AND_SHELL_FEASIBILITY_STUDY.md)
- **Owner Principale**: `@fabiomalagutti27-droid` & `@carolina2910`
- **File Target Previsti**:
  1. `ares-cockpit/src/lib/binaryTelemetryDecoder.ts` *(NEW — decoder zero-copy `DataView` su `ArrayBuffer` da 128 byte)*
  2. `ares-cockpit/src/lib/useTelemetry.ts` *(UPDATE — auto-rilevazione Dual-Transport `TAURI_NATIVE_IPC` vs `BROWSER_WEBSOCKET`)*
  3. `ares-cockpit/src/modules/os-chrome/OsSystemStatusBar.tsx` *(NEW — barra di sistema `#000000` OLED `32 px`)*
  4. `ares-cockpit/src/modules/os-chrome/OsCommandPalette.tsx` *(NEW — palette tastiera `Alt+Space` / `Cmd+K` per gli 8 tool `FastMCP`)*
  5. `ares-cockpit/src/App.tsx` *(UPDATE — integrazione non intrusiva di `OsSystemStatusBar` e `OsCommandPalette`)*
- **Budget Latenza & Token**:
  - **Decodifica `DataView` `BinaryTelemetryFrame` (`128 B`)**: `< 10 µs` (`0` parsing JSON, `0` allocazioni stringa nel hot-path `20 Hz`)
  - **Budget Risposte `OsCommandPalette` (`FastMCP`)**: `< 150 token` (`<= 600 byte` JSON per tool) con tag `<untrusted_telemetry_observation>`
- **Politica Strict Mode**: Zero emoji, nessuna rottura della modalita browser `npm run dev` + `ws://127.0.0.1:8080`, preservazione integrale di `BEAT_INTERVALS_NOT_AVAILABLE` (`null` non convertito a `0`) e di `ILLUSTRATIVE_UNVALIDATED`.

---

## 1. Executive Summary & Scientific / Open-Source Grounding

### 1.1 Unificare Esperienza OS Nativa e Flessibilita Web Browser senza Duplicare la UI
`ares-cockpit/` implementa gia l'intera esperienza clinica `1. GATHER -> 2. EVALUATE -> 3. ACT` (`TriPhaseHeader`, `BodyHeatmap` Three.js, `MriAndStl`, `Imaging`, `WhatIfConsole`, `PlaybookRunner`, `ProvenanceInspector`). La **Fase 23 (`J3`)** eleva questo frontend in una vera interfaccia di sistema operativo medico spaziale (**`ARES-MedOS`**) mantenendo piena compatibilita sia dentro la finestra nativa `Tauri v2` (Fase 22) sia dentro un normale browser:
1. **Bridge Dual-Transport in `useTelemetry.ts`:** Rileva `'__TAURI_INTERNALS__' in window`. In ambiente nativo `ARES-MedOS`, apre il canale binario `ArrayBuffer` da `128` byte (`subscribe_binary_telemetry`) decodificato via `DataView` senza `JSON.parse()` e applica le mutazioni What-If in-process tramite `apply_what_if_patch`. In ambiente browser, utilizza in modo trasparente `ws://127.0.0.1:8080/ws/telemetry` e `POST /api/stress-test`.
2. **System Chrome Status Bar (`OsSystemStatusBar.tsx`):** Barra superiore OLED `#000000` da `32 px` che espone in un solo sguardo:
   - Orologio di missione in **Martian Sol** (`SOL XXX MTC`), profilo **One-Way Light Time (`OWLT`)** (`0.5 s` LEO vs `4–24 min` EIMO Marte vs `BLACKOUT` congiunzione solare);
   - Stato delle partizioni `ARINC 653` (`[INGEST | ENGINE | UI]`), latenza IPC (`< 0.05 ms` native vs `~1.2 ms` WS), impronta RAM / FPS;
   - Allerta radiazioni CSA `CANS` e **Zona Deontica Habitat (`hypergraph_spatial.habitat_zone`)** (`SLEEP`/`ARED`/`LBNP`/`MEDOPS`/`SHELTER`/`EVA`), oltre al badge `ILLUSTRATIVE_UNVALIDATED` (Issue `#12`).
3. **`Alt+Space` / `Cmd+K` FastMCP Command Palette (`OsCommandPalette.tsx`):** Consente al Crew Medical Officer (`CMO`) di interrogare da tastiera tutti gli **8 tool deterministici `FastMCP`** contro `AresUnifiedDatasetGraph` (`24` dataset) e `Timestral` in-process con latenza sub-millisecondo e visualizzazione strutturata `< 150 token`.

### 1.2 Riferimenti a Repository Pubblici & Standard `NASA-STD-3001`

| Fonte / Repository / Standard | Riferimento / URL | Ruolo nella Fase 23 (`J3`) |
| :--- | :--- | :--- |
| **`rerun-io/rerun` & `emilk/egui`** | `https://github.com/rerun-io/rerun`, `https://github.com/emilk/egui` (`Apache-2.0 OR MIT`) | Architettura di riferimento Tier A.2 per il pulsante opzionale *"Open 120 FPS Waveform Forensics (`wgpu`/`Rerun`)"* e per la visualizzazione zero-GC ad alta frequenza (`120 Hz` / `500 Hz` `ECG`/`PPG`). |
| **`NASA-STD-3001 Vol. 1 Rev C`** | Clauses `[V1 3003]` & `[V1 3006]`, `https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1` | `[V1 3003]`: monitoraggio preventivo e segregazione per ruolo (`AstronautSelf` vs `CrewMedicalOfficer`); `[V1 3006]`: supporto diagnostico autonomo EIMO in presenza di `4–24 min` OWLT e blackout solari. |
| **`NASA-STD-3001 Vol. 2 Rev F`** | Clauses `[V2 10022]`, `[V2 10023]`, `[V2 10024]`, `[V2 10152]` | `[V2 10023]/[V2 10024]`: differenziazione visiva esplicita di step completati `[DONE]` e correnti `[ACTIVE]` nella palette e nei playbook; `[V2 10022]/[V2 10152]`: aggiornamento UI `< 50 ms` tramite `DataView` binario. |

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

| File Frontend | Azione | Responsabilita nella Fase 23 (`J3`) |
| :--- | :--- | :--- |
| `ares-cockpit/src/lib/binaryTelemetryDecoder.ts` | **CREATE** | Decodifica `ArrayBuffer` (`128` byte) via `DataView` verificando magic `0x41524553`, version `1`, `validity_mask` e `flags`, ed espone `mergeBinaryFrameIntoPacket(prev, decoded)`. |
| `ares-cockpit/src/lib/useTelemetry.ts` | **UPDATE** | Seleziona automaticamente `TAURI_NATIVE_IPC` (`Channel<ArrayBuffer>`) o `BROWSER_WEBSOCKET`, esponendo `transportMode` e `ipcLatencyUs` allo stato di telemetria. |
| `ares-cockpit/src/modules/os-chrome/OsSystemStatusBar.tsx` | **CREATE** | Barra OS persistente `#000000` con Sol clock, OWLT Marte, stato partizioni `ARINC 653`, zona deontica habitat, radiazione `CANS`, latenza IPC, pulsante `Cmd+K` e controlli finestra Tauri. |
| `ares-cockpit/src/modules/os-chrome/OsCommandPalette.tsx` | **CREATE** | Overlay modale accessibile con `Alt+Space` / `Cmd+K` per eseguire tutti gli 8 tool `FastMCP` (`query_dataset_graph`, `explain_biomarker_path`, `get_timestral_quantile_cones`, `get_hypergraph_spatial_status`, ecc.). |
| `ares-cockpit/src/App.tsx` | **UPDATE** | Monta `OsSystemStatusBar` sopra `TriPhaseHeader`, registra i listener globali `Alt+Space` / `Cmd+K` e apre `OsCommandPalette`. |

---

## 3. Specifica del Decoder Zero-Copy `DataView` & Fusione Dual-Transport

### 3.1 Mappa Esatta Offsets TypeScript (`binaryTelemetryDecoder.ts`)
Deve combaciare bit-per-bit con la tabella dell'ABI `BinaryTelemetryFrame` (Fase 21 `J1`):

```typescript
// ares-cockpit/src/lib/binaryTelemetryDecoder.ts
export const ARES_BINARY_MAGIC = 0x41524553;
export const ARES_BINARY_VERSION = 1;
export const ARES_BINARY_FRAME_BYTES = 128;

export const MASK_HR_BPM = 1 << 0;
export const MASK_PULSE_BPM = 1 << 1;
export const MASK_SPO2_PCT = 1 << 2;
export const MASK_RESP_BRPM = 1 << 3;
export const MASK_RMSSD_MS = 1 << 4;
export const MASK_TAU_W = 1 << 5;
export const MASK_SANS_ONSD = 1 << 6;
export const MASK_SCLEROSTIN = 1 << 7;
export const MASK_GAI_PCT = 1 << 8;
export const MASK_RHO_GLOBAL = 1 << 9;
export const MASK_TTV_HOURS = 1 << 10;
export const MASK_MRI_PCT = 1 << 11;

export const FLAG_WHAT_IF_ACTIVE = 1 << 0;
export const FLAG_POCUS_CONFIRMED = 1 << 1;
export const FLAG_LBNP_ACTIVE = 1 << 2;
export const FLAG_GATE1_ANTICOAG_LOCK = 1 << 3;
export const FLAG_GATE2_LBNP_VENT = 1 << 4;
export const FLAG_GATE3_EVA_DAMPING = 1 << 5;
export const FLAG_BEAT_INTERVALS_NOT_AVAILABLE = 1 << 6;
export const FLAG_ILLUSTRATIVE_UNVALIDATED = 1 << 7;

export interface DecodedBinaryTelemetryFrame {
  version: number;
  flags: number;
  validityMask: number;
  alertSeverityCode: number;
  systemPhaseCode: number;
  habitatZoneCode: number;
  hottestRegionCode: number;
  flightDay: number;
  relativeRecordingTimeS: number;
  timestampMs: number;
  hrBpm: number | null;
  pulseBpm: number | null;
  spo2Pct: number | null;
  respBrpm: number | null;
  rmssdMs: number | null;
  tauWDynCm2: number | null;
  sansOnsdMm: number | null;
  sclerostinPmolL: number | null;
  gaiPct: number | null;
  rhoGlobal: number | null;
  ttvHours: number | null;
  mriPct: number | null;
}

function readMaskedFloat64(view: DataView, byteOffset: number, mask: number, bit: number): number | null {
  if ((mask & bit) === 0) return null;
  const val = view.getFloat64(byteOffset, true);
  return Number.isFinite(val) ? val : null;
}

export function decodeBinaryTelemetryFrame(buffer: ArrayBuffer): DecodedBinaryTelemetryFrame | null {
  if (buffer.byteLength !== ARES_BINARY_FRAME_BYTES) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== ARES_BINARY_MAGIC) return null;
  const version = view.getUint16(4, true);
  if (version !== ARES_BINARY_VERSION) return null;

  const flags = view.getUint16(6, true);
  const validityMask = view.getUint32(8, true);
  const timestampLo = view.getUint32(24, true);
  const timestampHi = view.getUint32(28, true);

  return {
    version,
    flags,
    validityMask,
    alertSeverityCode: view.getUint8(12),
    systemPhaseCode: view.getUint8(13),
    habitatZoneCode: view.getUint8(14),
    hottestRegionCode: view.getUint8(15),
    flightDay: view.getUint32(16, true),
    relativeRecordingTimeS: view.getFloat32(20, true),
    timestampMs: timestampHi * 4294967296 + timestampLo,
    hrBpm: readMaskedFloat64(view, 32, validityMask, MASK_HR_BPM),
    pulseBpm: readMaskedFloat64(view, 40, validityMask, MASK_PULSE_BPM),
    spo2Pct: readMaskedFloat64(view, 48, validityMask, MASK_SPO2_PCT),
    respBrpm: readMaskedFloat64(view, 56, validityMask, MASK_RESP_BRPM),
    rmssdMs: readMaskedFloat64(view, 64, validityMask, MASK_RMSSD_MS),
    tauWDynCm2: readMaskedFloat64(view, 72, validityMask, MASK_TAU_W),
    sansOnsdMm: readMaskedFloat64(view, 80, validityMask, MASK_SANS_ONSD),
    sclerostinPmolL: readMaskedFloat64(view, 88, validityMask, MASK_SCLEROSTIN),
    gaiPct: readMaskedFloat64(view, 96, validityMask, MASK_GAI_PCT),
    rhoGlobal: readMaskedFloat64(view, 104, validityMask, MASK_RHO_GLOBAL),
    ttvHours: readMaskedFloat64(view, 112, validityMask, MASK_TTV_HOURS),
    mriPct: readMaskedFloat64(view, 120, validityMask, MASK_MRI_PCT),
  };
}
```

### 3.2 Strategia Dual-Transport in `useTelemetry.ts`
1. **Rilevazione deterministica del runtime:**
   ```typescript
   export type TransportMode = 'TAURI_NATIVE_IPC' | 'BROWSER_WEBSOCKET' | 'LOCAL_SIMULATION';
   export const IS_ARES_DESKTOP_SHELL =
     typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
   ```
2. **Idratazione Iniziale + Aggiornamento Binario a `20 Hz` (`TAURI_NATIVE_IPC`):**
   - All'avvio in Tauri, invoca `get_full_wire_snapshot` per ottenere l'intero `WireTelemetryPacket` (inclusi `active_playbook`, `causal_graph_state`, `timestral_quantiles`, `hypergraph_spatial`).
   - Apre `Channel<ArrayBuffer>` verso `subscribe_binary_telemetry` e ad ogni tick (`50 ms`) decodifica `128` byte in `< 10 µs`, aggiornando i campi numerici live (`biometrics`, `hemodynamics`, `musculoskeletal`, `safety_margins`, `alarm_level`) e mantenendo rigorosamente `hrv_rmssd_ms: null` quando `FLAG_BEAT_INTERVALS_NOT_AVAILABLE` e attivo.
   - Se cambia `alertSeverityCode`, `systemPhaseCode`, `habitatZoneCode` o viene applicato `apply_what_if_patch`, esegue `get_full_wire_snapshot` per sincronizzare i testi del Playbook DAG e le celle `BodyHeatmap`.
3. **Browser Fallback (`BROWSER_WEBSOCKET`):**
   - Se `!IS_ARES_DESKTOP_SHELL`, mantiene invariato al 100% il comportamento corrente (`GET /api/snapshot`, `ws://127.0.0.1:8080/ws/telemetry`, `POST /api/stress-test`).

### 3.3 Specifica UX dei Componenti `OsSystemStatusBar.tsx` e `OsCommandPalette.tsx`

#### A. `OsSystemStatusBar.tsx` (`32 px` `#000000` OLED)
- **Sezione Sinistra (`ARINC 653` & Air-Gap):**
  - `[ARES-MEDOS v0.1]` | `AIR-GAP: 100%` | `PARTITIONS [INGEST:OK ENGINE:OK UI:OK]`
  - Badge `ILLUSTRATIVE_UNVALIDATED` (Issue `#12`) e badge `HRV: BEAT_INTERVALS_NOT_AVAILABLE` quando applicabile (Issue `#11`).
- **Sezione Centrale (EIMO Deep-Space Telemetry & Deontic Habitat):**
  - `SOL {flightDay} MTC` | `OWLT: {14m 22s | 0.5s | BLACKOUT}` | `ZONE: {habitatZone}` | `CANS RAD: {dose} mSv/d`
- **Sezione Destra (Hardware, IPC & Shortcut):**
  - Badge Trasporto: `TAURI IPC (< 0.05 ms)` oppure `WS LOOPBACK (~1.2 ms)`
  - `[Alt+Space / Cmd+K: FastMCP]` (clickabile o attivabile da tastiera)
  - In modalita frameless Tauri (`IS_ARES_DESKTOP_SHELL`), pulsanti di finestra minimali `[ _ ] [ [] ] [ X ]` via `@tauri-apps/api/window`.

#### B. `OsCommandPalette.tsx` (`Alt+Space` / `Cmd+K`)
Elenco degli **8 tool `FastMCP`** pre-configurati con parametri rapidi e scorciatoie numeriche `1..8`:
1. `get_crew_health_summary` — Sintesi stato equipaggio (`< 150 token`)
2. `explain_causal_anomaly` — Catena causale 4-hop `ADHG`
3. `simulate_countermeasure_impact` — Proiezione deterministica `LBNP`/`ARED`
4. `get_medops_playbook` — Playbook attivo `#01–#05` e 3 Hard Safety Gates
5. `query_dataset_graph` — Interrogazione dei 24 dataset (`OSD-51`, `BIDMC`, `CANS`, `Myotones`, ecc.)
6. `explain_biomarker_path` — Cammino semantico minimo nel grafo `SPOKE/BioCypher/PrimeKG`
7. `get_timestral_quantile_cones` — Coni quantilici monotoni $[q_{0.05}, q_{0.50}, q_{0.95}]$ e stato `ConformalAbstentionGate`
8. `get_hypergraph_spatial_status` — Heatmap 3D `UBERON:`, policy deontica Q-STL e descrittore `16-byte BioKG`

Ogni risposta ricevuta mostra il conteggio esatto di **byte / token stimati** (`bytes <= 600`, `< 150 tokens`) e l'etichetta di sicurezza `<untrusted_telemetry_observation>` quando vengono renderizzati campi stringa sanitizzati.

---

## 4. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Aggiungere `@tauri-apps/api` come dipendenza opzionale in `ares-cockpit/package.json` (caricata solo dietro guard `IS_ARES_DESKTOP_SHELL` in modo da non appesantire il bundle browser).
- [ ] **Step 2:** Creare `ares-cockpit/src/lib/binaryTelemetryDecoder.ts` e i relativi test unitari TypeScript per verifica endianness e `validityMask`.
- [ ] **Step 3:** Aggiornare `ares-cockpit/src/lib/useTelemetry.ts` aggiungendo il percorso `TAURI_NATIVE_IPC` mantenendo il fallback `BROWSER_WEBSOCKET` intatto.
- [ ] **Step 4:** Creare `ares-cockpit/src/modules/os-chrome/OsSystemStatusBar.tsx` e `OsCommandPalette.tsx` e integrarli in `ares-cockpit/src/App.tsx`.
- [ ] **Step 5:** Eseguire `npm --prefix ares-cockpit run lint` (`tsc -b --noEmit`) e `npm --prefix ares-cockpit run build` verificando 0 errori TypeScript.

---

## 5. Deterministic Verification & Contract Tests

1. **`binaryTelemetryDecoder` Parity Test (Rust <-> TypeScript):**
   - Genera i 128 byte da `BinaryTelemetryFrame::from_packet()` in Rust su un frame con `pulse_bpm = None`, `spo2_pct = None`, `rmssd_ms = None` (`BEAT_INTERVALS_NOT_AVAILABLE`), li passa a `decodeBinaryTelemetryFrame(buffer)` in TypeScript e verifica l'uguaglianza bit-esatta di tutti i campi e il mantenimento di `null`.
2. **Dual-Transport Fallback Test:**
   - Verifica che con `window.__TAURI_INTERNALS__ === undefined` (`npm run dev`), `useTelemetry.ts` si connetta a `ws://127.0.0.1:8080/ws/telemetry` senza mai tentare chiamate IPC Tauri.
3. **`OsCommandPalette` Context-Mode Token Budget Test:**
   - Invoca ciascuno degli 8 tool nella palette e verifica che la risposta visualizzata rispetti `<= 600` byte e non contenga HTML non escapato.
