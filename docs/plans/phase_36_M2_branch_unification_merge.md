# Phase 36 (M2): Multi-Branch Unification & Coexistence Implementation Plan

* **Phase ID:** `Phase 36 (Block M / M2)` (Rev 2 — Updated for `origin/work/LelloXV` `362d1f4`)
* **Parent Architecture Specification:** `docs/plans/BLOCK_M_MULTI_BRANCH_MERGE_EVALUATION_AND_PATCH_PLAN.md`
* **Base Commit:** `main` (`9438df2`, Blocks A-L)
* **Source Branches Integrated:**
  - `origin/work/fertech02` (`dce5b33` & `118100c`)
  - `origin/work/MiServeRDC` (`05e142d` & `6abbabf`)
  - `origin/work/carolina2910` (`08dd941` & `ab252dc`)
  - `origin/work/LelloXV` (`362d1f4` on parent `3cf8741`, `20` files changed, `+1413/-439`)
* **Target Worker Model:** `gemini-4-hydrogen-high` (2 parallel disjoint-ownership workers: `Worker M2A` + `Worker M2B`, followed by `Coordinator M2-Gate` and `M3` Doc-Sync)

---

## 1. Strict Disjoint File Ownership Matrix

To allow `Worker M2A` and `Worker M2B` to execute concurrently (`workspace:"share"` or isolated working copies) with **zero merge conflicts between workers** and **zero collisions with sibling tasks** (`docs/REFERENCES.md` and `docs/scientific_references.md` reserved for `M3`), file ownership is partitioned strictly by directory boundary:

| Worker ID | Assigned Model | Exclusive File Ownership | Forbidden Paths |
| :--- | :--- | :--- | :--- |
| **Worker M2A** (`m2a-rust-fertech-port`) | `gemini-4-hydrogen-high` | `crates/ares-core-types/**`, `crates/ares-telemetry-ingest/**`, `crates/ares-nqs-stl/**`, `crates/ares-medops-playbooks/**`, `crates/ares-server-cli/**`, `crates/ares-desktop-os/**`, `contracts/telemetry_schema.json`, `data/bidmc_eval/**`, `docs/evaluation/ANOMALY_DETECTOR_EVAL.md` | `crates/ares-storage-lsah/**`, `Cargo.toml` (preserve M1 workspace members), `ares-cockpit/**`, `docs/REFERENCES.md`, `docs/scientific_references.md`, `docs/plans/**`, `docs/submission/**`, `memory-bank/**` |
| **Worker M2B** (`m2b-cockpit-unification`) | `gemini-4-hydrogen-high` | `ares-cockpit/**`, `docs/plans/ANATOMY_ATLAS_BRANCH_INTEGRATION.md` | `crates/**`, `contracts/**`, `data/**`, `docs/evaluation/**`, `docs/REFERENCES.md`, `docs/scientific_references.md`, `docs/submission/**`, `memory-bank/**` |
| **Coordinator** (`M2-Gate`) | Coordinator | `memory-bank/activeContext.md`, `memory-bank/progress.md`, cross-stack verification & commit (`M3` appends references table to `docs/REFERENCES.md` & `docs/scientific_references.md`) | Source mutations outside final integration check |

### Wire Contract Handshake Between M2A and M2B
Both workers implement against the exact shared JSON & Binary ABI contract below so M2A and M2B integrate on the first compile:
1. `WireTelemetryPacket.vitals_anomaly` (`contracts/telemetry_schema.json` & `TelemetryPacket.vitals_anomaly`):
   - `status`: `"NORMAL" | "ATTENTION" | "ALARM"`
   - `warmup_complete`: `boolean`
   - `baseline_samples`: `number`
   - `mahalanobis_distance`: `number | null`
   - `multivariate_threshold`: `number`
   - `multivariate_triggered`: `boolean`
   - `channels`: `ChannelAnomalyState[]` (`channel`, `evaluable`, `status`, `current_value`, `baseline_median`, `baseline_mad`, `robust_z`, `cusum_pos`, `cusum_neg`, `consecutive_missing_s`, `triggered_by`, `reason`)
   - `summary`: `string`
2. `NqsQuantileForecastSnapshot` (`WireTelemetryPacket.timestral_quantiles`):
   - Preserves `100%` of existing Block H-L fields (`short_horizon_s: 900`, `abstention_certificate`, `channel_cones` `+15m/+1h/+6h/+24h`, `ttv_hours_cone`, `rmssd_ms_cone`, `rho_global_cone`).
   - Adds `forecast_method`: `"DETERMINISTIC_COLD_START" | "TIMESTRAL_GREY_BOX_1HZ" | "EWMA_EMPIRICAL_RESIDUAL_QUANTILES" | "HYBRID_TIMESTRAL_AND_EWMA_SHORT_HORIZON"`
   - Adds `ewma_short_horizon_max_s`: `120`
   - Adds `short_horizon_cones`: `ShortHorizonCone[]` where each item has `{ channel_name, horizon_5s, horizon_10s, horizon_30s, horizon_60s, horizon_120s }` (`MonotoneQuantileTriplet`)
   - Adds `short_horizon_abstention`: `AbstentionCertificate | null`
3. Acute Vital-Signs Playbooks (`#06..#09`) & `128 B` `BinaryTelemetryFrame`:
   - `PLAYBOOK_06_HYPOXEMIA_DESATURATION` -> binary `active_playbook_id = 6`
   - `PLAYBOOK_07_HEART_RATE_ANOMALY` -> binary `active_playbook_id = 7`
   - `PLAYBOOK_08_SENSOR_SIGNAL_LOSS` -> binary `active_playbook_id = 8`
   - `PLAYBOOK_09_MULTIPARAMETER_DETERIORATION` -> binary `active_playbook_id = 9`
4. Dual-Transport Anomaly Injection Endpoint / Tauri IPC:
   - HTTP: `POST /api/inject-anomaly` with JSON `{ kind: "CLEAR" | "GRADUAL_HYPOXEMIA" | "SUDDEN_DESATURATION" | "SUSTAINED_TACHYCARDIA" | "BRADYCARDIA" | "TACHYPNEA" | "COMBINED_CARDIORESPIRATORY_DRIFT" | "SPO2_SENSOR_DROPOUT" | "FULL_TELEMETRY_DROPOUT", magnitude?: number }` -> returns `WireTelemetryPacket`.
   - Tauri v2 Native IPC: command `"ipc_inject_anomaly"` accepting `{ request: AnomalyInjectionRequest }` -> returns `WireTelemetryPacket`.

---

## 2. Worker M2A Specification (`m2a-rust-fertech-port`)

**Role:** Rust Systems & Clinical Telemetry Unification Engineer (`gemini-4-hydrogen-high`)  
**Owned Paths:** `crates/ares-core-types/**`, `crates/ares-telemetry-ingest/**`, `crates/ares-nqs-stl/**`, `crates/ares-medops-playbooks/**`, `crates/ares-server-cli/**`, `crates/ares-desktop-os/**`, `contracts/telemetry_schema.json`, `data/bidmc_eval/**`, `docs/evaluation/ANOMALY_DETECTOR_EVAL.md`  
**Hard Rules:** Zero `.unwrap()` / `.expect()` / `panic!()` in non-test crate code; zero Unicode emojis; **NEVER** delete `AresTemporalForecasterEngine`, `run_1hz_timestral_step`, `SafeTensors`, `shm_dispatcher`, `edge_llm_bridge`, `GatherDspOverlay`, `ares-desktop-os` loops, or sibling `Phase 35 (M1)` `crates/ares-storage-lsah` hooks; do **NOT** touch `docs/REFERENCES.md` or `docs/scientific_references.md`.

### WP-M2A.1 — Evaluation Cohort & Benchmark Documentation Checkout
1. Check out the 50 PhysioNet BIDMC evaluation CSVs (`ODC-By-1.0`), SHA-256 manifest, README, and evaluation report from `origin/work/fertech02`:
   ```bash
   git checkout origin/work/fertech02 -- data/bidmc_eval/ docs/evaluation/ANOMALY_DETECTOR_EVAL.md
   ```
2. Update `docs/evaluation/ANOMALY_DETECTOR_EVAL.md` (preserving all held-out metrics and zero-emoji formatting) with a concise architectural note clarifying that `EwmaResidualForecaster` (`+5s, +10s, +30s, +60s, +120s`) runs alongside `AresTemporalForecasterEngine` (`Timestral` 1 Hz `+15m, +1h, +6h, +24h` + `CQR` calibration) rather than replacing it.

### WP-M2A.2 — Core Anomaly & Dual-Horizon Forecast Types (`crates/ares-core-types`)
1. Port `origin/work/fertech02:crates/ares-core-types/src/anomaly.rs` to `crates/ares-core-types/src/anomaly.rs` and apply these exact refinements:
   - Export `pub const EWMA_SHORT_HORIZONS_SECONDS: [u32; 5] = [5, 10, 30, 60, 120];`.
   - Define `ForecastMethod` (`#[serde(rename_all = "SCREAMING_SNAKE_CASE")]`, `#[derive(Default)]`):
     ```rust
     pub enum ForecastMethod {
         #[default]
         DeterministicColdStart,
         TimestralGreyBox1Hz,
         EwmaEmpiricalResidualQuantiles,
         HybridTimestralAndEwmaShortHorizon,
     }
     ```
   - Extend `ShortHorizonCone` to carry all 5 short horizons (`5-120 s`):
     ```rust
     pub struct ShortHorizonCone {
         pub channel_name: String,
         pub horizon_5s: MonotoneQuantileTriplet,
         pub horizon_10s: MonotoneQuantileTriplet,
         pub horizon_30s: MonotoneQuantileTriplet,
         pub horizon_60s: MonotoneQuantileTriplet,
         pub horizon_120s: MonotoneQuantileTriplet,
     }
     ```
     Implement `pub fn assert_monotone(&self) -> Result<(), AresCoreError>` verifying all 5 triplets via `.assert_monotone()?`.
   - Keep `AnomalyStatus`, `AnomalyDetectorKind`, `ChannelAnomalyState` (with `evaluable: bool`), and `VitalsAnomalyReport` (`dominant(&self)`).
2. In `crates/ares-core-types/src/lib.rs`:
   - Add `pub mod anomaly;` and `pub use anomaly::{AnomalyDetectorKind, AnomalyStatus, ChannelAnomalyState, EWMA_SHORT_HORIZONS_SECONDS, ForecastMethod, ShortHorizonCone, VitalsAnomalyReport};`.
   - Extend `NqsQuantileForecastSnapshot` additively (keeping `short_horizon_s: 900` in `initial_deterministic` so all Block H-L tests pass):
     ```rust
     #[serde(default)]
     pub forecast_method: ForecastMethod,
     #[serde(default = "default_ewma_short_horizon_max_s")]
     pub ewma_short_horizon_max_s: u32,
     #[serde(default)]
     pub short_horizon_cones: Vec<ShortHorizonCone>,
     #[serde(default)]
     pub short_horizon_abstention: Option<AbstentionCertificate>,
     ```
     (`const fn default_ewma_short_horizon_max_s() -> u32 { 120 }`).
   - In `NqsQuantileForecastSnapshot::assert_monotone(&self)`, also iterate `&self.short_horizon_cones` and verify `cone.assert_monotone()?`.
3. In `crates/ares-core-types/src/binary_ipc.rs`:
   - Extend `playbook_id_to_u16(playbook_id: &str) -> u16` (`L209-223`) so `PLAYBOOK_06` -> `6`, `PLAYBOOK_07` -> `7`, `PLAYBOOK_08` -> `8`, `PLAYBOOK_09` -> `9` (`PLAYBOOK_01..05` remain `1..=5`, unknown -> `0`). Keep the `128 B` `BinaryTelemetryFrame` layout (`offset_of!` compile-time assertions) 100% unchanged.

### WP-M2A.3 — Controlled Fault Injection (`crates/ares-telemetry-ingest`)
1. Port `anomaly_injection.rs` directly from `origin/work/fertech02`:
   ```bash
   git checkout origin/work/fertech02 -- crates/ares-telemetry-ingest/src/anomaly_injection.rs
   ```
2. In `crates/ares-telemetry-ingest/src/lib.rs`, preserve all existing Block L3 exports (`radar_csi_dsp`, `rr_hrv_dsp`, `vocal_biomarkers_dsp`, `GatherDspOverlay`, `merge_biometrics_with_gather_dsp`) and add:
   ```rust
   pub mod anomaly_injection;
   pub use anomaly_injection::{AnomalyInjection, InjectedAnomalyKind, InjectionProfile};
   ```

### WP-M2A.4 — Vitals Anomaly Detector & 5-120s EWMA Forecaster Coexistence (`crates/ares-nqs-stl`)
1. Check out `vitals_anomaly.rs` from `origin/work/fertech02`:
   ```bash
   git checkout origin/work/fertech02 -- crates/ares-nqs-stl/src/vitals_anomaly.rs
   ```
   Verify zero `.unwrap()` / `.expect()` outside `#[cfg(test)]`.
2. Port `origin/work/fertech02:crates/ares-nqs-stl/src/ewma_forecaster.rs` to `crates/ares-nqs-stl/src/ewma_forecaster.rs` and upgrade to 5 horizons:
   - Change `HORIZONS: [usize; 3] = [10, 30, 60]` to `HORIZONS: [usize; 5] = [5, 10, 30, 60, 120]` (`pending: [VecDeque<(u64, f64, f64)>; 5]`, `abs_errors: [VecDeque<f64>; 5]`).
   - Emit `ShortHorizonCone { channel_name, horizon_5s, horizon_10s, horizon_30s, horizon_60s, horizon_120s }`.
   - Provide `pub fn ingest_short_horizon_1hz(&mut self, sample: &AresMultivariateSample) -> (Vec<ShortHorizonCone>, AbstentionCertificate)` so `ws_server.rs` can merge `(short_cones, short_cert)` directly into `latest_quantile_snapshot` without wiping Timestral's `channel_cones` or top-level `abstention_certificate`.
3. In `crates/ares-nqs-stl/src/timestral_bridge.rs`, keep `100%` of `AresTemporalForecasterEngine` (`new_with_optional_checkpoint`, SafeTensors, `compute_greybox_forecast_snapshot`) and initialize the 4 new `NqsQuantileForecastSnapshot` fields (`forecast_method: ForecastMethod::TimestralGreyBox1Hz`, `ewma_short_horizon_max_s: 120`, `short_horizon_cones: Vec::new()`, `short_horizon_abstention: None`).
4. In `crates/ares-nqs-stl/src/lib.rs`, export `pub mod ewma_forecaster; pub mod vitals_anomaly;` and re-export `EwmaForecasterConfig`, `EwmaResidualForecaster`, `VitalsAnomalyConfig`, `VitalsAnomalyDetector`.

### WP-M2A.5 — Playbooks `#06..#09` & Normative BioKG Grounding (`crates/ares-medops-playbooks`)
1. In `crates/ares-medops-playbooks/src/playbooks.rs`:
   - Keep `select_candidate_playbook` (`#01..#05`) unchanged.
   - Port `select_vitals_anomaly_playbook(anomaly: &VitalsAnomalyReport, biometrics: &Biometrics, hemodynamics: &JugularHemodynamics, causal_chain: Vec<String>) -> Option<ActivePlaybook>` (`PLAYBOOK_06_HYPOXEMIA_DESATURATION`, `PLAYBOOK_07_HEART_RATE_ANOMALY`, `PLAYBOOK_08_SENSOR_SIGNAL_LOSS`, `PLAYBOOK_09_MULTIPARAMETER_DETERIORATION`) and its unit tests from `origin/work/fertech02`.
   - Re-export `select_vitals_anomaly_playbook` in `crates/ares-medops-playbooks/src/lib.rs`.
2. In `crates/ares-medops-playbooks/src/grounding.rs`:
   - Extend `ground_playbook_normative(playbook_id: &str)` (`L47-68`) with arms for `"PLAYBOOK_06_HYPOXEMIA_DESATURATION"` (`6`), `"PLAYBOOK_07_HEART_RATE_ANOMALY"` (`7`), `"PLAYBOOK_08_SENSOR_SIGNAL_LOSS"` (`8`), and `"PLAYBOOK_09_MULTIPARAMETER_DETERIORATION"` (`9`) mapped to `AdhgNodeKind::AutonomicVagalRmssd` (overriding `playbook_number` and `playbook_id` on the returned `PlaybookNormativeGrounding` so `verify_crc()` remains valid and exact `playbook_id` is preserved). Unknown IDs still return `Err(PlaybookError::UnknownPlaybookId(...))`.

### WP-M2A.6 — Dual-Engine Server Runtime, FastMCP, Tauri IPC & CSP (`crates/ares-server-cli`, `crates/ares-desktop-os`, `contracts/telemetry_schema.json`)
1. Check out `anomaly_eval.rs` from `origin/work/fertech02`:
   ```bash
   git checkout origin/work/fertech02 -- crates/ares-server-cli/src/anomaly_eval.rs
   ```
2. Unify `crates/ares-server-cli/src/wire_contract.rs`:
   - Keep `main` (`9438df2`) `WireTelemetryPacket` & `WirePacketContext`; add `pub vitals_anomaly: VitalsAnomalyReport` and `pub AnomalyInjectionRequest { pub kind: InjectedAnomalyKind, pub magnitude: Option<f64> }`.
   - Preserve `BiometricsSource::SimulatedScenarioInput` when active and push `"SYNTHETIC_ANOMALY_INJECTED"` onto `quality_flags`; map `bidmc_NN` -> `"BIDMC-SUBJECT-NN"` in `schema_astronaut_id`.
3. Unify `crates/ares-server-cli/src/ws_server.rs` (**starting strictly from `main` `9438df2`**):
   - Keep `PartitionId::TimestralForecaster.label() => "TIMESTRAL"`, `forecaster_engine: AresTemporalForecasterEngine`, `run_1hz_timestral_step()`, `edge_llm_config`, `/api/copilot/*`, `shm_dispatcher`, and `GatherDspOverlay`.
   - Add `anomaly_detector: VitalsAnomalyDetector`, `latest_vitals_anomaly: VitalsAnomalyReport`, `anomaly_injection: Option<AnomalyInjection>`, `ewma_forecaster: EwmaResidualForecaster`, `latest_short_horizon_cones: Vec<ShortHorizonCone>`, `latest_short_horizon_abstention: Option<AbstentionCertificate>`, and `current_replay_row: BidmcNumericRow`.
   - On `1 Hz` sample advance (and in `apply_anomaly_injection`), evaluate `anomaly_detector.observe_1hz(...)` and `ewma_forecaster.ingest_short_horizon_1hz(...)`; attach `short_horizon_cones` and `short_horizon_abstention` onto `latest_quantile_snapshot` (setting `forecast_method` to `HybridTimestralAndEwmaShortHorizon` once `run_1hz_timestral_inference` has run, or `EwmaEmpiricalResidualQuantiles` before the first 1 Hz Timestral pass, **without** mutating `latest_quantile_snapshot.abstention_certificate`). Also re-attach `latest_short_horizon_cones` + `latest_short_horizon_abstention` inside `run_1hz_timestral_inference` when writing `inner.latest_quantile_snapshot`.
   - Select playbook via `compute_mission_telemetry_tick(..., Some(&latest_vitals_anomaly))` (`#02/#05` -> `#06..#09` -> `#01/#03/#04`, followed unconditionally by `enforce_hard_clinical_safety_gates`), and extend `primary_adhg_node_for_playbook` for `#06..#09`.
   - Register `.route("/api/inject-anomaly", post(post_inject_anomaly_handler))` in `build_router`.
4. Unify `crates/ares-server-cli/src/fastmcp_router.rs`, `mcp_stdio.rs`, `lib.rs`, and `main.rs`:
   - Keep all 8 FastMCP tools `<= 600 B`, keeping `"abstained": snap.abstention_certificate.abstained`; add compact `"vitals_anom"` to `get_crew_health_summary` and `"method"` + `"ewma_max_s"` to `get_timestral_quantile_cones`.
   - Export `pub mod anomaly_eval;` in `lib.rs`; in `main.rs`, **keep** the `1 Hz` `run_1hz_timestral_step` background task and add `ServerMode::EvalAnomaly` + `--eval-dir`.
5. Extend `crates/ares-desktop-os` (`lib.rs`, `ipc_bridge.rs`, `tauri.conf.json`):
   - Keep `run_1hz_timestral_step` in `main.rs` and `lib.rs` (`run_desktop_smoke_test`).
   - Add `pub fn ipc_inject_anomaly(&self, request: AnomalyInjectionRequest) -> Result<WireTelemetryPacket, DesktopShellError>` on `AresMedOsWorkstationShell`, register `"ipc_inject_anomaly"` in `TAURI_IPC_COMMAND_NAMES` and `HeadlessTauriBridge::invoke_json`, and update command-count assertions (`7 -> 8`) in `crates/ares-desktop-os/tests/phase_30_l2_tauri_bridge.rs`.
   - In `crates/ares-desktop-os/tauri.conf.json`, change `script-src 'self';` to `script-src 'self' 'wasm-unsafe-eval';` (keeping `connect-src` unchanged).
6. Update `contracts/telemetry_schema.json` to allow `BIDMC-SUBJECT-04..53` and include the optional `vitals_anomaly` object schema.

### WP-M2A.7 — M2A Acceptance Tests
Run and verify 100% green:
```bash
cargo test --workspace
cargo test -p ares-server-cli --features shm-ipc
cargo test -p ares-desktop-os --features "tauri-runtime tauri-native offline-voice"
cargo clippy --workspace --all-targets -- -D warnings
cargo run -p ares-nqs-stl --bin ares-calibrate -- --verify-only
cargo run -p ares-server-cli --bin ares-server-cli -- --mode eval-anomaly --data-dir data/bidmc --eval-dir data/bidmc_eval
```

---

## 3. Worker M2B Specification (`m2b-cockpit-unification`)

**Role:** Frontend Cockpit, 3D WebGL HSI & Clinical UX Unification Engineer (`gemini-4-hydrogen-high`)  
**Owned Paths:** `ares-cockpit/**`, `docs/plans/ANATOMY_ATLAS_BRANCH_INTEGRATION.md`  
**Hard Rules:** Zero Unicode emojis/dingbats anywhere (`U+2715` `\u2715` strictly banned); **NEVER** create `validateTelemetry.ts` or overwrite `main`'s `telemetryValidation.ts` / `useTelemetry.ts`; **STRICT `#000000` OLED** (`--color-oled: #000000`, `--color-panel: #0a0a0a`, `--color-nominal: #22d3ee` — reject `#0b111c` / `#141c2a` / `#a6baf1` override); `min-h-[44px]` / `min-h-12` touch targets; strict Issue #11 (`null` never `0`, unobserved `#6b7280`) and Issue #12 (`ILLUSTRATIVE_UNVALIDATED`, zero `'ARES-VLM-Edge'` or fake `88-99%` `confidencePct`); do **NOT** touch `docs/REFERENCES.md` or `docs/scientific_references.md` (deferred to `M3`).

### WP-M2B.1 — Static CC BY-SA 4.0 `.glb` Anatomy Assets & Cockpit README
1. Check out the 5 glTF v2 `.glb` meshes (`SkeletalSystem100.glb`, `MuscularSystem100.glb`, `CardioVascular41.glb`, `VisceralSystem100.glb`, `NervousSystem100.glb`), `MANIFEST.json`, `ATTRIBUTION.md`, `LICENSE-CC-BY-SA-4.0.txt`, and integration note (`MiServeRDC` `6abbabf` and `LelloXV` `362d1f4` are byte-identical on `public/anatomy/`):
   ```bash
   git checkout origin/work/MiServeRDC -- ares-cockpit/public/anatomy/ docs/plans/ANATOMY_ATLAS_BRANCH_INTEGRATION.md
   ```
2. Update `ares-cockpit/README.md` additively (integrating `LelloXV` `362d1f4`'s interface hierarchy attribution note for `Vercel UI SDK` Apache-2.0, `WHOOP Home`, and `Oura Vitals` — explicitly stating zero external packages, assets, or code copied — plus `Z-Anatomy / BodyParts3D` `CC BY-SA 4.0` static asset isolation and offline optical triage / vitals anomaly notes). Do **NOT** modify `docs/REFERENCES.md`.

### WP-M2B.2 — Unified Telemetry Types, Runtime Validation & Binary Decoder (`types/telemetry.ts`, `lib/telemetryValidation.ts`, `lib/binaryTelemetryDecoder.ts`, `lib/playbookCatalog.ts`, `lib/scenario.ts`, `lib/useTelemetry.ts`)
1. **`ares-cockpit/src/types/telemetry.ts`:**
   - Extend `CrystallizedPlaybookId` with `'PLAYBOOK_06_HYPOXEMIA_DESATURATION' | 'PLAYBOOK_07_HEART_RATE_ANOMALY' | 'PLAYBOOK_08_SENSOR_SIGNAL_LOSS' | 'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION'`.
   - Export `AnomalyStatus`, `AnomalyDetectorKind`, `ChannelAnomalyState`, `VitalsAnomalyReport`, `ForecastMethod`, and `ShortHorizonCone` (`horizon_5s`, `horizon_10s`, `horizon_30s`, `horizon_60s`, `horizon_120s`).
   - Add `forecast_method?: ForecastMethod`, `ewma_short_horizon_max_s?: number`, `short_horizon_cones?: ShortHorizonCone[]`, `short_horizon_abstention?: AbstentionCertificate | null` to `TimestralQuantilesSummary`, and `vitals_anomaly?: VitalsAnomalyReport | null` to `TelemetryPacket`.
2. **`ares-cockpit/src/lib/telemetryValidation.ts`:**
   - Accept `BIDMC-SUBJECT-01` through `BIDMC-SUBJECT-53` via `^BIDMC-SUBJECT-(0[1-9]|[1-4][0-9]|5[0-3])$` in `isValidAstronautId(id)`.
   - Validate optional `data.vitals_anomaly` in `isValidTelemetryPayload` and normalize it via `export function normalizeVitalsAnomaly(raw: unknown): VitalsAnomalyReport | null`.
   - In `normalizeTimestralQuantiles`, parse `short_horizon_cones` (`horizon_5s..horizon_120s` via `parseMonotoneQuantileTriplet`, filtering out `RR_DEPENDENT_CONE_CHANNELS` when `hrvUnavailable`) and `short_horizon_abstention`.
3. **`ares-cockpit/src/lib/binaryTelemetryDecoder.ts` & `ares-cockpit/src/lib/playbookCatalog.ts`:**
   - Add binary codes `6..9` (`PLAYBOOK_06..09`) to `PLAYBOOK_ID_BY_CODE` and `BINARY_PLAYBOOK_DEFAULTS`.
   - Extend `PlaybookShortCode` (`'#01'..'#09'`) and `CRYSTALLIZED_PLAYBOOK_CATALOG` with `#06`..`#09` (`delta_rho_per_hour: 0.0`, normative clauses `NASA-STD-3001 [V2 7001]/[V1 3006]`). Note: keep `CRYSTALLIZED_PLAYBOOK_LIST` or update `ares-cockpit/tests/phase29_l1.test.ts` cleanly if `CRYSTALLIZED_PLAYBOOK_LIST.length` is checked (`5` chronic + `4` acute = `9` total, or keep `CANONICAL_DEEP_SPACE_PLAYBOOK_LIST` = 5 alongside `ALL_PLAYBOOK_CATALOG_LIST` = 9 — inspect `tests/phase29_l1.test.ts:99` `assert.equal(CRYSTALLIZED_PLAYBOOK_LIST.length, 5)` and preserve backward compatibility by keeping `CRYSTALLIZED_PLAYBOOK_LIST` as the 5 canonical deep-space playbooks `#01..#05` while adding `ACUTE_VITALS_PLAYBOOK_LIST` `#06..#09` and `ALL_CRYSTALLIZED_PLAYBOOK_LIST` `#01..#09`!).
4. **`ares-cockpit/src/lib/scenario.ts` & `ares-cockpit/src/lib/useTelemetry.ts`:**
   - Attach default `vitals_anomaly` (`status: 'NORMAL'`, `warmup_complete: false`) in `buildPacket` (`scenario.ts`).
   - In `useTelemetry.ts` (**keeping 100% of `TAURI_NATIVE_IPC` + `BROWSER_WEBSOCKET` dual transport**), export `AnomalyInjectionKind`, `AnomalyInjectionWireRequest`, and return `injectAnomaly: (req: AnomalyInjectionWireRequest) => Promise<boolean>` invoking `'ipc_inject_anomaly'` (`{ request: req }`) on Tauri first with fallback to `POST ${ENGINE_HTTP_URL}/api/inject-anomaly`.

### WP-M2B.3 — `#000000` OLED CSS, Header, `EcgStrip`, Vitals Anomaly, Forecast & `PlaybookRunner` (`index.css`, `TriPhaseHeader.tsx`, `Imaging.tsx`, `VitalsAnomalyPanel.tsx`, `MriAndStl.tsx`, `PlaybookRunner.tsx`)
1. **`ares-cockpit/src/index.css`:**
   - **KEEP `main`'s single `@theme` block untouched (`--color-oled: #000000`, `--color-panel: #0a0a0a`, `--color-line: #1f2937`, `--color-nominal: #22d3ee`, `background: #000000`).** Do **NOT** copy `362d1f4`'s second `@theme` block or `#0b111c` / `#141c2a` / `#a6baf1` colors!
   - Append `@LelloXV`'s structural classes re-themed to `#000000` OLED: `.bedside-monitor` (`background: #000000; border: 1px solid var(--color-line);`), `.monitor-heading`, `.monitor-cardiac`, `.monitor-trace`, `.monitor-vital` (`tabular-nums`), `.monitor-heart`, `.monitor-secondary`, `.monitor-oxygen`, `.monitor-breathing`, `.monitor-pulse`, `.health-trend` (`background: var(--color-panel); border: 1px solid var(--color-line);`), `.health-choice` (`min-height: 44px;`, `aria-pressed="true"` using `rgba(34,211,238,0.15)` & `border-color: var(--color-nominal)`), `.act-current` (`background: #050505; border: 1px solid var(--color-line);`), `.anatomy-layers` (`background: var(--color-panel);`), and `:focus-visible` (`outline: 2px solid var(--color-nominal)`).
2. **`ares-cockpit/src/modules/header-triphase/TriPhaseHeader.tsx`:**
   - Keep `main`'s `#000000` top bar, explicit `1. GATHER`, `2. EVALUATE`, `3. ACT` labels, `CRITICAL` `animate-pulse`, and `AlarmBadge` `data-alarm-level={level}`; adopt `@LelloXV`'s `aria-current={isActive ? 'page' : undefined}` and `min-h-[44px]` button/select touch heights.
3. **`ares-cockpit/src/modules/analysis-imaging/Imaging.tsx` (`EcgStrip`):**
   - Preserve `main`'s `isRecorded?: boolean` prop, `SQI < 0.60` sample rejection status line, flat yellow baseline on `missingHr`, and bottom-right `'SYNTHETIC VISUALIZER (RECORDED HR)'` / `'SIMULATED'` watermark; add `@LelloXV`'s `role="img" aria-label="Synthetic ECG illustration driven by heart rate"` and centered `'Heart rate unavailable'` overlay when `missingHr` is true.
4. **`ares-cockpit/src/modules/vitals-anomaly/VitalsAnomalyPanel.tsx` & `ares-cockpit/src/modules/mri-and-stl/MriAndStl.tsx`:**
   - Port `VitalsAnomalyPanel.tsx` from `origin/work/fertech02`, wired to `onInjectAnomaly`, `#000000` OLED cards, `min-h-[44px]` buttons, and `+5s / +10s / +30s / +60s / +120s` `ShortHorizonCone` readout.
   - In `MriAndStl.tsx` (`TimestralQuantileConePanel`), keep `+15m / +1h / +6h / +24h` Timestral grey-box fan as default (`LONG HORIZON: +15m..+24h`) and add a toggle (`SHORT HORIZON: +5s..+120s EWMA`) rendering `short_horizon_cones` + `short_horizon_abstention` while preserving Issue #11 `BEAT_INTERVALS_NOT_AVAILABLE` suppression.
5. **`ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx`:**
   - Start from `main`'s 505-line `PlaybookRunner.tsx` (using `ALL_CRYSTALLIZED_PLAYBOOK_LIST` `#01..#09`, keeping `CRYSTALLIZED_PLAYBOOK_LIST` = `#01..#05` intact in `playbookCatalog.ts` so `phase29_l1.test.ts` stays 100% green!), and integrate `@LelloXV` `362d1f4`'s `.act-current` active-step highlight card, `aria-current="step"`, and `min-h-12` (`48px`) control heights.

### WP-M2B.4 — Unified 10-Region Injury Schema & Sanitized Offline Optical RGB Triage (`types/injury.ts`, `lib/vlmInjuryEngine.ts`, `AiInjuryModal.tsx`)
1. Create `ares-cockpit/src/types/injury.ts` unifying the exact 10 `InjuryRegionId` keys shared by `MiServeRDC`, `carolina2910`, and `LelloXV` (`AtlasBody.tsx` expects these exact 10 keys in `anchors.injuries`):
   ```ts
   import type { CrystallizedPlaybookId } from './telemetry';

   export type InjuryRegionId =
     | 'HEAD_FOREHEAD'
     | 'LEFT_SHOULDER'
     | 'RIGHT_SHOULDER'
     | 'LEFT_FOREARM'
     | 'RIGHT_FOREARM'
     | 'CHEST_RIBS'
     | 'LEFT_KNEE'
     | 'RIGHT_KNEE'
     | 'LEFT_ANKLE'
     | 'RIGHT_ANKLE';

   export type InjurySeverity = 'LOW' | 'MODERATE' | 'HIGH';

   export interface OpticalTriageMetrics {
     erythemaIndex: number;
     contrastIndex: number;
     darkPixelRatio: number;
   }

   export interface OpticalTriageAssessment {
     methodId: 'OPTICAL_RGB_HEURISTIC_V1';
     validationStatus: 'ILLUSTRATIVE_UNVALIDATED';
     inferredPatternLabel: string;
     metrics: OpticalTriageMetrics;
     severity: InjurySeverity;
     microgravityProtocol: string[];
     marsLandingImpact: string;
     recommendedPlaybookId: CrystallizedPlaybookId;
     recommendedPlaybookTitle: string;
   }

   export interface InjuryMarker {
     id: string;
     region: InjuryRegionId;
     title: string;
     severity: InjurySeverity;
     validationStatus: 'ILLUSTRATIVE_UNVALIDATED' | 'MANUAL_CREW_NOTE';
     summary: string;
     careSteps: string[];
     detectedAt: string;
     photoUrl?: string;
     opticalAssessment?: OpticalTriageAssessment;
     recommendedPlaybookId?: CrystallizedPlaybookId;
   }
   ```
   Include `RegionMeta` and `INJURY_REGIONS` (`10` regions from `362d1f4` / `6abbabf` — zero `confidencePct` field).
2. Create `ares-cockpit/src/lib/vlmInjuryEngine.ts` (ported from `origin/work/carolina2910`, sanitized):
   - Export `analyzeSkinImageOpticalHeuristic(imageFile: File | Blob, region: InjuryRegionId): Promise<OpticalTriageAssessment>` (**zero** `'ARES-VLM-Edge'` strings or fabricated `88-99%` `confidencePct`).
   - Always call `URL.revokeObjectURL(tempObjectUrl)` inside both `img.onload` and `img.onerror`.
   - Map `recommendedPlaybookId` to valid `CrystallizedPlaybookId` values (`PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION` for `HEAD_FOREHEAD`, `PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED` for shoulder/knee/ankle, `PLAYBOOK_06_HYPOXEMIA_DESATURATION` or `PLAYBOOK_07_HEART_RATE_ANOMALY` for `CHEST_RIBS`).
3. Create `ares-cockpit/src/modules/body-3d-heatmap/AiInjuryModal.tsx` (ported from `origin/work/carolina2910`, sanitized):
   - Replace `U+2715` (`\u2715 CLOSE`) with ASCII `CLOSE`.
   - Track temporary `previewUrl` in a `ref`; revoke any unsaved preview `blob:` URL on re-upload or cancel; only transfer ownership to `App.tsx` when saved.
   - Display `ILLUSTRATIVE_UNVALIDATED | CLIENT-SIDE RGB PIXEL HEURISTIC (NON-DIAGNOSTIC)` and raw `Erythema / Contrast / Dark-Pixel` metrics (zero fake `88-99%` confidence badge), enforce `min-h-[44px]` on all buttons, and emit `InjuryMarker` + `onOpenPlaybook?.(assessment.recommendedPlaybookId)`.

### WP-M2B.5 — Null-Safe `AnatomicalLayers.tsx`, Air-Gapped `AtlasBody.tsx` & 5-Source `BodyHeatmap.tsx`
1. Unify `ares-cockpit/src/modules/body-3d-heatmap/AnatomicalLayers.tsx`:
   - Keep `main` (`9438df2`)'s `nodesByRegion?: Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>` (`cnsNode`, `sansNode`, `heartNode` `#6b7280` `observed === false` guard, `ijvNode`, `soleusNode`) AND merge `@LelloXV` `362d1f4`'s `s: ScenarioState | null` null-safety across `SkeletonLayer`, `VascularNeuroLayer`, and `MusclesLayer` so procedural anatomy renders uncolored neutral reference geometry when `s === null` (`isPureReplay`).
2. Create `ares-cockpit/src/modules/body-3d-heatmap/AtlasBody.tsx` (unifying `MiServeRDC` `6abbabf` + `LelloXV` `362d1f4` + Block L1):
   - Accept `s: ScenarioState | null` and optional `nodesByRegion?: Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>`.
   - Call `useGLTF(URLS, false, true)` (`useDraco = false` so `https://www.gstatic.com/draco/...` is never referenced; `useMeshopt = true` using local `three-stdlib` `MeshoptDecoder`). Do NOT call module-top-level `useGLTF.preload(URLS)`.
   - Replace `throw new Error('Missing atlas landmark: ...')` with safe fallback coordinates from `uberonSpatialMapping.ts` / `INJURY_REGIONS`.
   - Report both the 5 canonical `UBERON:` anchors (`BrainVestibularCns` -> `'Brain.g'`, `EyeOcularSans` -> `'Optic tract.r'`, `InternalJugularVein` -> `'Internal jugular vein.r'`, `HeartCardioAutonomic` -> `'Heart.g'`, `SoleusCalcaneus` -> `'Soleus muscle.r'`/`'Calcaneus.r'`) and all 10 `InjuryRegionId` anchors (`anchors.injuries`).
   - When `s === null`, color clinical meshes neutral reference slate (`#6b7280` / `#94a3b8`); when `s !== null`, color from `nodesByRegion` so `Heart.g` stays neutral gray `#6b7280` whenever `observed === false` (`BEAT_INTERVALS_NOT_AVAILABLE`).
3. Unify `ares-cockpit/src/modules/body-3d-heatmap/BodyHeatmap.tsx` (5-source synthesis):
   - Preserve `100%` of Block L1's `projectHypergraphTo3D` HUD (`HOTTEST` UBERON CURIE, `ZONE` deontic policy, `BioKG` clause, `5` `SpatialNodePin` spheres, `6` `QuadraticBezierLine` conduction arcs, `min-h-[44px]` controls) when `s !== null`, and show `@LelloXV` `362d1f4`'s honest `"Data unavailable — pure terrestrial BIDMC replay does not measure microgravity organ shifting"` state when `s === null` while keeping the 3D viewport and injury markers active!
   - Include `ATLAS 3D GLB (CC BY-SA 4.0)` vs `PROCEDURAL RIG` toggle (wrapping `<Suspense fallback={<AtlasLoading />}><AtlasBody ... /></Suspense>` inside `GlbAssetErrorBoundary` so any WebGL/WASM error falls back cleanly to `AnatomicalLayers` + `NasaGlbAssetLayer`), plus `@LelloXV`'s `<Canvas fallback={<svg ...>}>` 2D silhouette when WebGL is unavailable, `background: '#000000'` on the viewport, `MALE`/`FEMALE` profile switch, neon-lime `#a3e635` `<InjuryPoint>` 3D torus markers, `+ SCAN PHOTO (OPTICAL TRIAGE)` (`AiInjuryModal`), and `+ MANUAL MARKER` quick form.

### WP-M2B.6 — Top-Level `App.tsx` Unification (`ares-cockpit/src/App.tsx`)
Start from `main` (`9438df2`) so **zero Block L capabilities are lost**, and layer in `@LelloXV` (`362d1f4`), `@fertech02`, `@MiServeRDC`, and `@carolina2910`:
1. Keep `<OsSystemStatusBar ... />`, `<TriPhaseHeader ... />`, `<ProvenanceBanner ... />`, and `<OsVoiceCopilot ... onExecuteIntent={handleVoiceIntent} />` **permanently visible at the top of the `#000000` OLED shell** (never hidden inside a collapsed `<details>`), and keep `<OsCommandPalette ... initialMode={paletteInitialMode} />` and right-sidebar `MriGauge` readiness card visible across phases.
2. Wrap the right-sidebar What-If sliders in `<details open={whatIfOverlayActive || undefined}>` (from `362d1f4`) so pure BIDMC replay starts clean and auto-opens whenever What-If overlay or voice `RUN_WHAT_IF_LBNP` engages.
3. Add `injuries` (`InjuryMarker[]`) + `injuryPhotoUrls` `useRef(new Set<string>())` with `URL.revokeObjectURL` cleanup on region replacement, `resolveInjury`, and unmount (`362d1f4` / `6abbabf`).
4. In `activePhase === 'GATHER'`:
   - Render `@LelloXV`'s `BedsideMonitor` (`EcgStrip` with `hr={status.isStale ? null : b.heart_rate_bpm}`, `isRecorded={isRecordedBiometrics}`, `sqi`, plus tabular-numeral HR / SpO2 / RESP / Pulse and HRV RMSSD `BEAT_INTERVALS_NOT_AVAILABLE` readout).
   - Render `@LelloXV`'s `VitalsTrend` pen-lift SVG sparkline over `recordedHistory` (`stroke="#22d3ee"` on `#0a0a0a` OLED card).
   - Render `@fertech02`'s `<VitalsAnomalyPanel anomaly={packet.vitals_anomaly} quantiles={packet.timestral_quantiles} isLive={link === 'ENGINE_LIVE'} onInjectAnomaly={injectAnomaly} />`.
5. In `activePhase === 'EVALUATE'`:
   - On `BODY_3D`, render unified `<BodyHeatmap s={isPureReplay ? null : s} sex={whatIf.sex} hypergraphSpatial={packet.hypergraph_spatial} isLocalSimulation={Boolean(packet.is_local_simulation)} modelValidationStatus={packet.model_validation_status} injuries={injuries} onAddInjury={addInjury} onResolveInjury={resolveInjury} onChangeSex={(sex) => handleWhatIfChange({ ...whatIf, sex })} onOpenTab={setEvalTab} onOpenPlaybook={(pbId) => { setActivePhase('ACT'); setRequestedPlaybook((prev) => ({ id: pbId, seq: (prev?.seq ?? 0) + 1 })); }} />` (with an optional `"Engage What-If Overlay"` CTA banner when `isPureReplay` is true).
   - On `FORECAST`, keep `main`'s `<StlChart ... timestralQuantiles={packet.timestral_quantiles} hrvUnavailableReason={b.hrv_unavailable_reason} modelValidationStatus={packet.model_validation_status} />`.
6. In `activePhase === 'ACT'`:
   - Keep `main`'s 9-prop `<PlaybookRunner ... />` (`#01..#09`) and all 3 Hard Safety Gate cards (`GATE 1`, `GATE 2`, `GATE 3`).

### WP-M2B.7 — Node Unit Tests (`ares-cockpit/tests/phase36_m2.test.ts`)
Create `ares-cockpit/tests/phase36_m2.test.ts` (placed in `ares-cockpit/tests/` alongside `phase29_l1.test.ts` and `phase32_voice_l4.test.ts`, **never** inside `src/` so `tsc -b` stays clean) verifying:
1. `isValidTelemetryPayload` & `normalizeTelemetryPacket` accept `BIDMC-SUBJECT-04..53`, preserve `vitals_anomaly`, parse `5-120 s` `short_horizon_cones`, and keep `rmssd_ms === null` (`BEAT_INTERVALS_NOT_AVAILABLE`).
2. `decodeBinaryTelemetryFrame` decodes `active_playbook_id` `6..9` (`PLAYBOOK_06..09`), `CRYSTALLIZED_PLAYBOOK_LIST.length === 5` remains intact for backward compatibility, and `getCatalogEntry('#06'..'#09')` returns valid acute catalog entries with Gate 1 anticoagulant lock preserved.
3. Source-code & asset hygiene assertions across `index.css`, `Imaging.tsx`, `AtlasBody.tsx`, `AiInjuryModal.tsx`, `vlmInjuryEngine.ts`, and `App.tsx`:
   - `index.css` preserves `--color-oled: #000000` and `--color-panel: #0a0a0a` and does **not** contain `#0b111c` or `#141c2a`.
   - `Imaging.tsx` (`EcgStrip`) preserves `isRecorded` and `'SYNTHETIC VISUALIZER (RECORDED HR)'`.
   - `App.tsx` renders `OsVoiceCopilot`, `OsSystemStatusBar`, `ProvenanceBanner`, `VitalsTrend`, and `VitalsAnomalyPanel`, and `src/lib/validateTelemetry.ts` does **not** exist.
   - `AtlasBody.tsx` calls `useGLTF(URLS, false, true)` (`useDraco = false`) and never contains `gstatic.com`.
   - `injury.ts`, `AiInjuryModal.tsx`, and `vlmInjuryEngine.ts` contain zero Unicode emojis/dingbats (`U+2715` absent), zero `'ARES-VLM-Edge'` strings, zero `confidencePct` fabrication, and call `URL.revokeObjectURL`.
   - All 5 `.glb` files in `public/anatomy/` exist and start with `0x46546c67` (`hasValidGlbMagicHeader`).

### WP-M2B.8 — M2B Cockpit Verification Commands
```bash
cd ares-cockpit
npm run lint
npm run build
node --experimental-strip-types --test tests/*.test.ts
```

---

## 4. Coordinator Final Gate (`M2-Gate`) & `M3` Reference Sync Handoff

Once both `Worker M2A` and `Worker M2B` complete and land into the coordinator workspace:
1. Verify `git status --short` confirms `ares-cockpit/src/lib/validateTelemetry.ts` does NOT exist and `docs/REFERENCES.md` / `docs/scientific_references.md` were NOT touched during M2.
2. Update `memory-bank/activeContext.md` and `memory-bank/progress.md` to record Phase 36 (`M2`) multi-branch unification (`fertech02` + `MiServeRDC` + `carolina2910` + `LelloXV 362d1f4` verified unified onto `main`).
3. Execute the complete end-to-end verification gate:
   ```bash
   ./scripts/agent_probe.sh --all
   cargo test -p ares-server-cli --features shm-ipc
   cargo test -p ares-desktop-os --features "tauri-runtime tauri-native offline-voice"
   cargo run -p ares-nqs-stl --bin ares-calibrate -- --verify-only
   cargo run -p ares-server-cli --bin ares-server-cli -- --mode eval-anomaly --data-dir data/bidmc --eval-dir data/bidmc_eval
   cd ares-cockpit && node --experimental-strip-types --test tests/*.test.ts && cd ..
   ./scripts/launch_ares_medos.sh --verify
   ./scripts/build_submission_docs.sh
   ```
4. Hand off Section 4.4 of `docs/plans/BLOCK_M_MULTI_BRANCH_MERGE_EVALUATION_AND_PATCH_PLAN.md` (`Z-Anatomy CC BY-SA 4.0`, `PhysioNet BIDMC v1.0.0 50-Subject Cohort`, `OpenScreen`, `Vercel UI SDK`, `WHOOP Home` / `Oura Vitals` hierarchy notes) to the final `M3` Doc-Sync Worker for clean append into `docs/REFERENCES.md` and `docs/scientific_references.md`.
