# Runtime Correctness Implementation Plan: ARES-Health

This document specifies the architectural analysis, design decisions, verification criteria, and error management strategies for the six runtime correctness issues identified during independent review of `main` at commit `bfee931`.

Target working branch: `work/MiServeRDC-runtime-correctness`

---

## 1. Problem 1: Wearable Telemetry Overwritten by Replay and Incorrect Provenance

### 1.1 Root Cause
In `crates/ares-server-cli/src/ws_server.rs`, `SharedMissionState::ingest_wearable_packet` updates `guard.latest_packet` with a validated `WearableSensorPacket`. However, the 20 Hz publication ticker spawned in `src/main.rs:231` invokes `SharedMissionState::advance_tick(50ms)` in a continuous loop. Inside `advance_tick`, the CSV replay row is unconditionally selected (`guard.current_replay_row()`), which immediately replaces `guard.latest_packet` with the CSV dataset row (e.g. `bidmc_01`), destroying the wearable biometrics within 50 ms.

Furthermore:
- `compute_mission_telemetry_tick_from_row` hardcodes `biometrics_source` to `RecordedTerrestrialBidmcCsv` unless `vitals.injected` is set (`ws_server.rs:388-393` and `wire_contract.rs:416-418`).
- The wearable ingest path does not route samples through the anomaly detector (`VitalsAnomalyDetector`) or the short-horizon residual forecaster (`EwmaResidualForecaster` / `ingest_short_horizon_sample()`).
- The wearable ingest path publishes only to the 128-byte Seqlock ring; it does not capture and broadcast a wire JSON packet over `self.tx`, leaving browser WebSocket clients completely unaware of wearable updates.

### 1.2 Current Behavior
1. Ingesting a valid wearable packet (e.g. Node 1, HR = 123 bpm) sets `source_record_id = "hubris_node_01"` and `HR = 123 bpm`, but tags `biometrics_source = RecordedTerrestrialBidmcCsv`.
2. Within 50 ms, the next scheduled `advance_tick` unconditionally replaces the telemetry snapshot with `source_record_id = "bidmc_01"` and `HR = 94 bpm` (from CSV).
3. The detector and forecaster streams only receive CSV samples, never hardware samples.

### 1.3 Expected Behavior
1. Explicit source selection: the mission runtime maintains an explicit active input source mode (`TelemetrySourceMode::RecordedReplay` vs `TelemetrySourceMode::LiveWearableHardware`).
2. When hardware wearable mode is active:
   - The 20 Hz publication timer does not substitute or overwrite hardware vitals with CSV replay rows.
   - The biometrics provenance is strictly tagged as hardware wearable (`BiometricsSource::HardwareWearable` in Rust and `"HARDWARE_WEARABLE"` in JSON/TS/contracts).
   - Ingested wearable samples drive the SQI filter, the anomaly detector, and the short-horizon forecaster at their native sample arrival rate.
   - Both the 128-byte binary frame and the 20 Hz wire JSON stream reflect identical hardware source identifiers, sequence numbers, and biometric values.
   - On sensor timeout/loss (configurable threshold, default 3.0 seconds without valid packets), the system explicitly flags the telemetry state as stale (`DataDegradedMissingChannels` or explicit sensor loss), without silently falling back to recorded BIDMC data.
3. Replay mode continues to function deterministically when explicitly active.

### 1.4 Components Involved
- `crates/ares-core-types/src/telemetry.rs`: Add `BiometricsSource::HardwareWearable` with serialization `"HARDWARE_WEARABLE"`.
- `contracts/telemetry_schema.json`: Add `"HARDWARE_WEARABLE"` to `biometrics_source` enum.
- `ares-cockpit/src/types/telemetry.ts`: Add `'HARDWARE_WEARABLE'` to `BiometricsSource` union type.
- `crates/ares-storage-lsah/src/hot_ring.rs`: Map `BiometricsSource::HardwareWearable` to `PROVENANCE_HARDWARE_EDGE` (code `2`).
- `crates/ares-server-cli/src/ws_server.rs`:
  - Introduce `TelemetrySourceMode` enum: `RecordedReplay` and `LiveWearableHardware`.
  - Add source state tracking in `MissionRuntimeInner` (`source_mode`, `active_wearable_node`, `last_wearable_instant`, `wearable_sequence_num`, `wearable_uptime_ms`).
  - Decouple native sample ingestion from 20 Hz publication in `advance_tick`: when `source_mode == LiveWearableHardware`, publication maintains and projects the latest hardware state, stepping only time/circadian clocks and evaluating stale timeouts.
  - Route wearable packets through `VitalsAnomalyDetector` and short-horizon forecaster at their native arrival rate.
  - Broadcast wire JSON snapshots over `self.tx` when a new native wearable sample is ingested or on 20 Hz ticks.
  - Provide `set_source_mode(mode)` API and CLI argument `--source <replay|wearable>`.
- `crates/ares-server-cli/src/wire_contract.rs`: Preserve `BiometricsSource::HardwareWearable` during JSON wire conversion instead of coercing to `RecordedTerrestrialBidmcCsv`.

### 1.5 Architectural Choice
Clean separation between three distinct operational phases:
1. Source Sample Ingestion: Accepts raw bytes/packets from the selected active source (CSV reader at 1 Hz, or `WearableSensorPacket` at device arrival rate). Validates CRC-16, checks sequence monotonicity and uptime, detects supervisor restarts, and evaluates SQI.
2. Native Processing: Feeds validated vitals into `AdhgCausalEngine`, `VitalsAnomalyDetector`, and `AresTemporalForecasterEngine` at native sample rate. Resets baselines and anomaly windows upon source transitions.
3. 20 Hz Publication Loop: Emits coherent binary frames to `SeqlockTelemetryRing` and wire JSON over `axum` broadcast. If in wearable mode and elapsed time since last valid packet exceeds `WEARABLE_STALE_TIMEOUT` (3.0 s), flags `AlertSeverity::DataDegradedMissingChannels` and `FLAG_BEAT_INTERVALS_NOT_AVAILABLE`, preserving explicit unavailability without simulating false data.

### 1.6 Compatibility
- `BiometricsSource::HardwareWearable` serializes as `"HARDWARE_WEARABLE"`.
- Backward compatible: default CLI invocation without arguments starts in `RecordedReplay` mode, preserving all existing automated tests and BIDMC benchmark baselines.
- Storage slot encoding already defines `PROVENANCE_HARDWARE_EDGE = 2`; mapping `HardwareWearable` to code `2` aligns storage completely.

### 1.7 Acceptance Tests
- `wearable_sustained_no_csv_overwrite`: Ingesting a wearable packet followed by 100 ticks (5.0 s of publication clock) maintains `source_record_id = "hubris_node_01"` and `HR = 123 bpm`; CSV data is never injected.
- `wearable_hardware_provenance`: Verifies that `provenance_manifest.biometrics_source` equals `HardwareWearable` in JSON snapshot, `PROVENANCE_HARDWARE_EDGE` in LSAH storage slot, and matching flags in 128B binary frame.
- `wearable_detector_update`: Verifies that successive wearable packets update the anomaly detector history and short-horizon cones at native arrival rate.
- `wearable_sensor_loss_and_recovery`: After stopping wearable packets for > 3.0 s, snapshot transitions to stale/data-degraded without falling back to CSV. Resuming packets restores nominal quality.
- `wearable_out_of_order_rejection`: Reordered or duplicate sequence numbers are dropped or flagged according to policy.
- `replay_mode_unaffected`: Standard BIDMC replay mode continues to advance rows exactly as before.

### 1.8 Risks and Error Management
- Risk: Deadlock or lock contention between high-frequency wearable ingest and the 20 Hz publication ticker.
- Mitigation: Ingestion acquires `self.inner.write()`, performs deterministic numeric updates without any heap allocations or filesystem I/O, captures wire snapshot, drops lock, and broadcasts JSON. Publication ticker acquires `self.publication.lock()` then `self.inner.write()` for brief snapshot capture.
- Risk: Memory leaks on high packet arrival rates.
- Mitigation: Ring buffer and bounded vectors with zero unbounded growth.

---

## 2. Problem 2: MedOps Playbooks 10–15 Incompleteness in Binary Protocol and Client

### 2.1 Root Cause
In `crates/ares-core-types/src/binary_ipc.rs:210`, `playbook_id_to_u16` matches only `PLAYBOOK_01` through `PLAYBOOK_09`, returning `0` for `PLAYBOOK_10` through `PLAYBOOK_15`.
In `ares-cockpit/src/lib/binaryTelemetryDecoder.ts`, while `PLAYBOOK_ID_BY_CODE` knows ID numbers up to 15, `BINARY_PLAYBOOK_DEFAULTS` stops at 9. When decoding a binary frame for Playbooks 10–15, `BINARY_PLAYBOOK_DEFAULTS[active_playbook_id]` evaluates to `undefined`, causing the decoder to fall back to `prev.active_playbook`. This creates a severe clinical mismatch: the UI retains instructions and countermeasure actions from a previous playbook while displaying the new ID, or sets an inconsistent state.

### 2.2 Current Behavior
- `playbook_id_to_u16("PLAYBOOK_10_RENAL_LITHIASIS")` returns `0`.
- `playbook_id_to_u16("PLAYBOOK_15_EFAST_TRAUMA_TRIAGE")` returns `0`.
- In TypeScript, decoding binary frames for Playbooks 10–15 reuses stale actions and instructions from whichever playbook was active earlier.

### 2.3 Expected Behavior
- All 15 MedOps playbooks (`PLAYBOOK_01`..`PLAYBOOK_15`) are mapped bidirectionally between string IDs and `u16` codes in Rust and TypeScript:
  - 1: `PLAYBOOK_01_VENOUS_STASIS_LBNP`
  - 2: `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS`
  - 3: `PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED`
  - 4: `PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION`
  - 5: `PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS`
  - 6: `PLAYBOOK_06_HYPOXEMIA_DESATURATION`
  - 7: `PLAYBOOK_07_HEART_RATE_ANOMALY` / `PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS`
  - 8: `PLAYBOOK_08_SENSOR_SIGNAL_LOSS` / `PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK`
  - 9: `PLAYBOOK_09_MULTIPARAMETER_DETERIORATION`
  - 10: `PLAYBOOK_10_RENAL_LITHIASIS`
  - 11: `PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING`
  - 12: `PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE`
  - 13: `PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR`
  - 14: `PLAYBOOK_14_CO2_SCRUBBER_SANS`
  - 15: `PLAYBOOK_15_EFAST_TRAUMA_TRIAGE`
- If an unknown playbook ID (> 15 or 0) is encountered, the client explicitly sets `nextPlaybook` to `null` or an explicit unknown entry, never recycling residual actions from another playbook.
- Titles, step instructions, causal chains, and actions for Playbooks 10–15 in `BINARY_PLAYBOOK_DEFAULTS` match the canonical definitions in `ares-cockpit/src/lib/playbookCatalog.ts` and `crates/ares-medops-playbooks`.

### 2.4 Components Involved
- `crates/ares-core-types/src/binary_ipc.rs`:
  - Extend `playbook_id_to_u16` to handle `PLAYBOOK_10` through `PLAYBOOK_15`.
  - Add `playbook_id_from_u16(code: u16) -> Option<&'static str>`.
- `ares-cockpit/src/lib/binaryTelemetryDecoder.ts`:
  - Populate `BINARY_PLAYBOOK_DEFAULTS` for entries 10 through 15 using exact clinical constants from `CRYSTALLIZED_PLAYBOOK_CATALOG`.
  - In `decodeBinaryTelemetryFrame`: if `frame.active_playbook_id` is unknown or not found in `BINARY_PLAYBOOK_DEFAULTS`, return `null` instead of leaking `prev.active_playbook.actions`.

### 2.5 Architectural Choice
Single canonical source of truth for playbook metadata. In TypeScript, `BINARY_PLAYBOOK_DEFAULTS` directly references entries from `CRYSTALLIZED_PLAYBOOK_CATALOG` in `playbookCatalog.ts`, ensuring zero drift between JSON and binary representations.
The 128-byte binary ABI (`#[repr(C, align(64))]`) is 100% preserved: field `active_playbook_id: u16` at offset 96 is unchanged in width and alignment.

### 2.6 Compatibility
- Full backward and forward ABI compatibility: the frame layout remains exactly 128 bytes.
- Existing codes 1–9 retain identical numeric mappings and behavior.

### 2.7 Acceptance Tests
- Rust unit test `test_playbook_id_all_15_roundtrip`: verifies that all 15 playbooks map to 1..15 and reverse-map back to the canonical ID string.
- Rust unit test `test_playbook_id_unknown_maps_to_zero`: verifies that invalid/unknown playbook IDs return 0.
- TypeScript test `test_binary_playbook_10_to_15_defaults`: verifies that `BINARY_PLAYBOOK_DEFAULTS` contains valid entries for 10 through 15 with matching titles and non-empty actions.
- TypeScript test `test_playbook_transition_no_action_leak`: simulates transition sequence `09 -> 10 -> 15 -> 09` and verifies that actions and instructions are fully replaced without residual leak.
- TypeScript test `test_unknown_playbook_id_clears_playbook`: verifies that an invalid code (e.g. 99) clears active playbook rather than retaining stale actions.

### 2.8 Risks and Error Management
- Risk: String prefix mismatch between Rust and TypeScript (e.g. `PLAYBOOK_07_HEART_RATE_ANOMALY` in Rust vs `PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS` in TypeScript).
- Mitigation: Rust `playbook_id_to_u16` uses prefix matching `starts_with("PLAYBOOK_07")`, ensuring resilience to descriptive suffix variations.

---

## 3. Problem 3: Incorrect Warm Arrow IPC Queries for Batches Spanning Multiple Mission Days (Sols)

### 3.1 Root Cause
In `crates/ares-storage-lsah/src/warm_arrow_ipc.rs:267`:
```rust
let mission_sol = sol_col.value(0);
```
`append_telemetry_batch` reads only row 0 to determine the segment's `mission_sol` metadata. If a batch contains rows across a Sol boundary (e.g. Row 0 on Sol 1, Row 1 on Sol 2):
1. The segment metadata records `mission_sol = 1`.
2. In `read_telemetry_sol_range(crew_id, sol_start, sol_end)`, segments are filtered solely by `s.mission_sol >= sol_start && s.mission_sol <= sol_end`.
3. After decoding the matching segment, rows are filtered by `crew_id`, but NOT by `mission_sol`.
4. As a result, querying Sol 1 returns 2 rows (both Sol 1 and Sol 2), while querying Sol 2 returns 0 rows.

### 3.2 Current Behavior
- Mixed-sol batch with Row 0 (Sol 1) and Row 1 (Sol 2):
  - `read_telemetry_sol_range("ARES-CDR-01", 1, 1)` -> 2 rows (expected: 1).
  - `read_telemetry_sol_range("ARES-CDR-01", 2, 2)` -> 0 rows (expected: 1).

### 3.3 Expected Behavior
- Telemetry queries for a given Sol range `[sol_start, sol_end]` must return exactly the rows whose `mission_sol` falls within that range.
- Querying Sol 1 must return only Sol 1 rows; querying Sol 2 must return only Sol 2 rows.
- Existing on-disk manifests and segments must remain readable and correct.

### 3.4 Components Involved
- `crates/ares-storage-lsah/src/warm_trait.rs`: `WarmSegmentMeta` metadata struct.
- `crates/ares-storage-lsah/src/warm_arrow_ipc.rs`:
  - `append_telemetry_batch`: Partition incoming `RecordBatch` by `mission_sol` before encoding, so every committed segment contains strictly homogeneous Sol data.
  - In `WarmSegmentMeta`: preserve `mission_sol: u16`, and add optional `#[serde(default)] min_mission_sol: Option<u16>` and `max_mission_sol: Option<u16>` for forward/backward compatibility.
  - `read_telemetry_sol_range`: Apply segment-level pruning using `min/max_sol`, and apply row-level filtering for both `mission_sol` and `crew_id` on decoded batches.

### 3.5 Architectural Choice
Dual-defense architecture:
1. Producer-side Sol Partitioning: `append_telemetry_batch` groups rows by distinct `mission_sol` values. If a batch spans multiple Sols, each group is encoded into its own segment with its exact `mission_sol`. If manifest commit fails on any partition, all newly staged files in that batch are cleaned up and manifest changes are rolled back.
2. Consumer-side Row-Level Filtering: `read_telemetry_sol_range` evaluates a boolean mask checking both `sol_start <= row_sol && row_sol <= sol_end` and `crew_col == crew_id`. This guarantees 100% query correctness even when reading legacy unpartitioned segments from earlier archives.

### 3.6 Compatibility
- Backward Compatible: Existing `manifest.json` files containing only `mission_sol` deserialize seamlessly. If `min_mission_sol` is absent, it defaults to `mission_sol`.
- Arrow schema unchanged: Column definitions and types remain strictly identical.

### 3.7 Acceptance Tests
- `mixed_sol_batch_partitioning_and_query`: Ingests a 2-row batch spanning Sol 1 and Sol 2. Asserts that querying Sol 1 returns exactly 1 row with `sol == 1` and querying Sol 2 returns exactly 1 row with `sol == 2`.
- `multi_sol_range_query`: Querying Sol 1..2 returns both rows with correct sequence order.
- `legacy_unpartitioned_segment_row_filter`: Reads a simulated legacy mixed segment and verifies row-level filtering isolates the requested Sol.
- `partition_write_failure_rollback`: Verifies that a failure during multi-partition write rolls back staged manifest entries without leaving dangling metadata.

### 3.8 Risks and Error Management
- Risk: Memory overhead when partitioning large batches.
- Mitigation: Standard LSAH flusher batches are bounded (typically 64 to 256 rows). Sol boundaries occur at most once per Mars Sol (~88,775 seconds). Partitioning introduces negligible overhead ($< 10\,\mu\text{s}$).

---

## 4. Problem 4: Desktop Full-Snapshot Freshness and Native Fallback in Tauri

### 4.1 Root Cause
In `ares-cockpit/src/lib/useTelemetry.ts`:
1. `hydrateTauriSnapshot()` is invoked once on initial mount and subsequently ONLY when binary header codes (`alert`, `playbook`, or `habitat`) change.
2. When header codes are stable, `hydrateTauriSnapshot()` never runs again. The 1 s periodic timer polls only `get_os_status_bar_state`.
3. Consequently, extended clinical fields not packed into the 128-byte binary frame (anomaly details, Timestral quantile forecast cones, and Block N multi-organ panels) remain permanently stale while the 128B vitals look fresh.
4. If `subscribe_binary_telemetry` fails or rejects, the code logs a comment stating "snapshot polling still works", but no repeating full-snapshot poll actually exists. The client receives no updates beyond the status bar.

### 4.2 Current Behavior
- Extended panels (anomalies, forecast cones, Block N) freeze on the initial snapshot unless alert severity, playbook ID, or habitat mask transitions.
- If Tauri binary channel subscription fails, no telemetry updates are received.

### 4.3 Expected Behavior
- Extended state freshness: Bounded periodic snapshot polling (e.g. 1 Hz) or revision-based snapshot hydration updates extended fields continuously without overwhelming IPC.
- Binary subscription fallback: If `subscribe_binary_telemetry` rejects or stalls, an automated repeating snapshot poll (1 Hz to 2 Hz) immediately engages as the operational fallback with backoff and cancellation.
- Independent freshness tracking: The UI tracks freshness for vitals and extended data independently, reflecting accurate freshness badges.

### 4.4 Components Involved
- `ares-cockpit/src/lib/useTelemetry.ts`:
  - Implement a bounded 1 Hz snapshot refresh timer inside the desktop branch.
  - Implement an active fallback polling mechanism when binary subscription is rejected or unavailable.
  - Track separate timestamps/freshness states for binary vitals and full extended snapshots.
- `crates/ares-desktop-os/src/lib.rs` / `tauri_commands.rs`: Ensure `get_latest_snapshot` and `get_os_status_bar_state` remain non-blocking, reading from `SharedMissionState` lock-free or via brief read locks.

### 4.5 Architectural Choice
- Primary Path: 128-byte binary frame via Tauri channel (`< 50 \mu\text{s}`) for 20 Hz hot vitals and safety margins.
- Secondary Path: 1 Hz bounded snapshot hydration (`get_latest_snapshot`) for extended fields (cones, anomalies, Block N) to eliminate polling contention while guaranteeing sub-second freshness.
- Fallback Path: If channel subscription fails, activate a dedicated polling loop (`1000 ms`) with exponential backoff and cleanup on unmount.

### 4.6 Compatibility
- Preserves the existing Tauri v2 IPC commands (`subscribe_binary_telemetry`, `get_latest_snapshot`, `get_os_status_bar_state`).
- Does not affect the browser WebSocket/REST fallback.

### 4.7 Acceptance Tests
- Unit test in `ares-cockpit/tests/tauri_freshness.test.ts`:
  - Simulates stable binary frames with changing extended data: verifies snapshot hydration refreshes extended fields.
  - Simulates rejected binary channel subscription: verifies fallback snapshot polling activates and updates state.
  - Verifies cleanup on unmount (zero leaked intervals).

### 4.8 Risks and Error Management
- Risk: Snapshot serialization latency impacting the Tauri UI thread.
- Mitigation: Snapshot serialization occurs in Rust backend worker threads outside the main UI loop; IPC returns pre-built or lightweight structures.

---

## 5. Problem 5: Master Test Execution Report Scope, Unsupported Claims, and Benchmark Accuracy

### 5.1 Root Cause
In `scripts/run_all_test_tiers.sh` and `docs/evaluation/MASTER_TEST_EXECUTION_REPORT.md`:
1. The report proclaims: "The ARES-Health platform is verified flight-ready, air-gapped, and compliant with NASA-STD-3001 requirements." This claim directly contradicts the repository's foundational epistemic invariant (`MODEL_EVIDENCE_AUDIT.md`, Issue #12), which mandates that scenario models and configured policies remain illustrative and unvalidated.
2. Tier 5 is labeled "Clinical Anti-Leakage & 53 Cohorts", but `ares_calibrate.rs:150` explicitly evaluates only 3 bundled records (`bidmc_01..03`). The 53-record anomaly evaluation resides in a separate command (`ares-server-cli --mode eval-anomaly`) and was not executed by `run_all_test_tiers.sh`.
3. The benchmark in `phase_28_k4_nasa_std_3001_bench.rs:625` is labeled "End-to-End 1-Tick Pipeline", but it only executes pre-Block-N functions (`compute_musculoskeletal_state`, `compute_jugular_and_sans_state`, `nqs_engine.evaluate_tick`), omitting Block N modules, playbook selection ext, safety gate enforcement, serialization, and storage.

### 5.2 Current Behavior
- Overstated claims of flight-readiness and compliance.
- Discrepancy between reported cohort counts (53 vs 3).
- Incomplete pipeline benchmark scope reported as full live path.

### 5.3 Expected Behavior
- Title and scope: Redesignate the document as a "Local Software Verification & Test Execution Report".
- State clearly and prominently that all numerical physiological scenario models, thresholds, and clinical policies remain illustrative and unvalidated (`ILLUSTRATIVE_UNVALIDATED`), with zero clinical validation implied.
- Tier 5 accuracy: Accurately report that `ares-calibrate` evaluates 3 bundled PhysioNet BIDMC records (`bidmc_01..03`) under subject-disjoint anti-leakage constraints, and explicitly differentiate this from the 53-record evaluation.
- Benchmark accuracy: Accurately label the benchmark as "Pre-Block-N Core Algorithmic Microbenchmark", and include timing measurements of the full live tick (`compute_mission_telemetry_tick_from_row` including Block N and gate evaluation).
- Script integrity: `scripts/run_all_test_tiers.sh` must fail closed on missing measurements, preserving an explicit failure status rather than publishing an ungrounded pass.

### 5.4 Components Involved
- `scripts/run_all_test_tiers.sh`:
  - Update report template: remove all "flight-ready" / "certified" language.
  - Insert epistemic status notices referencing `MODEL_EVIDENCE_AUDIT.md`.
  - Distinguish 3-record calibration from 53-record anomaly evaluation.
- `docs/evaluation/MASTER_TEST_EXECUTION_REPORT.md`: Regenerate report reflecting accurate claims and measurements.
- `crates/ares-desktop-os/tests/phase_28_k4_nasa_std_3001_bench.rs`:
  - Retain existing microbenchmark under accurate name ("Core Algorithmic Microbenchmark").
  - Add benchmark measuring full live tick (`compute_mission_telemetry_tick_from_row` with Block N modules and safety gates).

### 5.5 Architectural Choice
Truthful, defensible scientific and software engineering documentation. Align with NASA Space Apps Challenge evaluation criteria by highlighting rigorous deterministic testing, bounded latency, and memory safety without making uncertified medical claims.

### 5.6 Compatibility
- Does not change any runtime code or API contracts.

### 5.7 Acceptance Tests
- Execution of `scripts/run_all_test_tiers.sh`:
  - Completes with exit code 0.
  - Generated report contains zero instances of "flight-ready", "calibrated risk", or "certified".
  - Accurately details the 3-cohort calibration vs 53-record anomaly evaluation.
  - Accurately reports microbenchmark and live pipeline latency.

### 5.8 Risks and Error Management
- Risk: Runner fails if optional dependencies or data directories are missing.
- Mitigation: Ensure `run_all_test_tiers.sh` checks for prerequisites and fails cleanly with helpful error messages.

---

## 6. Problem 6: Ambiguity Between CRC32 and CRC32C in LSAH Storage

### 6.1 Root Cause
In `crates/ares-storage-lsah/src/config.rs:153-159`:
```rust
/// Computes standard CRC-32C (Castagnoli) over an arbitrary byte slice.
#[inline]
pub fn compute_crc32c(data: &[u8]) -> u32 {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(data);
    hasher.finalize()
}
```
`crc32fast::Hasher::new()` computes IEEE 802.3 CRC-32 (polynomial `0xEDB8_8320`).
However, the function is named `compute_crc32c`, and its doc comment claims it computes Castagnoli CRC-32C (polynomial `0x82F6_3B78`).
For test vector `b"123456789"`:
- `binary_ipc::compute_crc32c`: `0xe3069283` (True Castagnoli CRC-32C).
- `ares_storage_lsah::config::compute_crc32c`: `0xcbf43926` (IEEE 802.3 CRC-32).

Because both the storage writer and the storage reader in `ares-storage-lsah` call `config::compute_crc32c`, all existing on-disk segments are internally consistent with IEEE 802.3. However, the naming ambiguity is a critical source of confusion, and silently changing the polynomial to Castagnoli would invalidate all existing archive files on disk.

### 6.2 Current Behavior
- `compute_crc32c` in storage produces IEEE CRC-32 values, not CRC-32C.
- Function name and documentation state CRC-32C Castagnoli.

### 6.3 Expected Behavior
1. Complete elimination of naming and algorithmic ambiguity.
2. Document and identify the storage checksum algorithm explicitly as IEEE 802.3 CRC-32 (`compute_storage_crc32_ieee` or `compute_crc32_fast`).
3. Maintain 100% backward compatibility for all existing on-disk segments and tests.
4. Support dual verification / fallback in the segment reader:
   - Compute expected checksum using canonical storage IEEE CRC-32.
   - If a segment header indicates or was computed with Castagnoli CRC-32C, verify and accept either valid checksum, logging a migration note.
5. Unit tests with verified test vectors (`b"123456789"`) for both IEEE CRC-32 (`0xcbf43926`) and Castagnoli CRC-32C (`0xe3069283`).

### 6.4 Components Involved
- `crates/ares-storage-lsah/src/config.rs`:
  - Rename/clarify function to `compute_storage_crc32_ieee(data: &[u8]) -> u32`.
  - Provide `compute_storage_crc32c_castagnoli(data: &[u8]) -> u32` implementing true Castagnoli CRC-32C.
  - Keep `compute_crc32c(data: &[u8]) -> u32` as a documented compatibility wrapper or alias pointing to the verified implementation.
  - Add `verify_segment_checksum(data: &[u8], expected: u32) -> bool` that accepts either IEEE CRC-32 or Castagnoli CRC-32C.
- `crates/ares-storage-lsah/src/warm_arrow_ipc.rs`:
  - Use `verify_segment_checksum` when verifying segment files on disk.
- `crates/ares-storage-lsah/src/hot_ring.rs`:
  - Clarify doc comments on `compute_crc32c` in `HotLsahSlot`.

### 6.5 Architectural Choice
Backward-compatible dual-verification pattern:
1. Writers compute and store the canonical checksum.
2. Readers verify with `verify_segment_checksum`, which checks the primary algorithm and allows fallback to Castagnoli CRC-32C.
3. Explicit naming eliminates developer ambiguity forever while preventing archive breakage.

### 6.6 Compatibility
- 100% backward compatible with all existing segment files and manifests on disk.
- Zero breaking changes to `LsahStorageEngine` public API.

### 6.7 Acceptance Tests
- `test_crc_known_vectors`: Asserts that `b"123456789"` produces exactly:
  - `0xcbf43926` with IEEE 802.3 CRC-32 (`crc32fast`).
  - `0xe3069283` with Castagnoli CRC-32C.
- `test_storage_reader_accepts_both_crc_polynomials`: Verifies that a segment written with IEEE CRC-32 and a segment written with Castagnoli CRC-32C both pass verification successfully.
- `test_corrupted_segment_rejected`: A corrupted segment fails verification under both polynomials.

### 6.8 Risks and Error Management
- Risk: Inadvertent breaking change if an existing archive is checked with only one polynomial.
- Mitigation: Dual verification checks both polynomials before raising `LsahStorageError::CrcMismatch`.

---

## 7. Execution Order and Milestones

1. Milestone 1: Problem 1 — Source Selection & Wearable Ingest Pipeline
   - Crate: `ares-core-types`, `ares-server-cli`, `ares-storage-lsah`.
   - Tests: `crates/ares-server-cli/tests/wearable_source_selection.rs`.
2. Milestone 2: Problem 2 — MedOps Playbooks 10–15 Binary Protocol & Client Parity
   - Crate: `ares-core-types`, `ares-cockpit`.
   - Tests: Rust binary ABI tests and TypeScript catalog/decoder tests.
3. Milestone 3: Problem 3 — Mixed-Sol Warm Storage Queries
   - Crate: `ares-storage-lsah`.
   - Tests: `crates/ares-storage-lsah/tests/mixed_sol_query.rs`.
4. Milestone 4: Problem 4 — Desktop Snapshot Freshness & Native Fallback
   - Crate: `ares-cockpit`.
   - Tests: `ares-cockpit/tests/tauri_freshness.test.ts`.
5. Milestone 5: Problem 6 — Storage CRC Algorithm Clarity & Backward Compatibility
   - Crate: `ares-storage-lsah`.
   - Tests: `crates/ares-storage-lsah/tests/crc_verification.rs`.
6. Milestone 6: Problem 5 — Test Report Scope, Benchmark Accuracy & Master Verification
   - Scripts: `scripts/run_all_test_tiers.sh`, `MASTER_TEST_EXECUTION_REPORT.md`, `phase_28_k4_nasa_std_3001_bench.rs`.
   - Tests: Run all test tiers locally and verify report.
7. Milestone 7: Final Verification & PR Preparation
   - Full workspace checks: `cargo check`, `cargo test`, `cargo clippy`, `agent_probe.sh --fast`.
   - Update `memory-bank/activeContext.md` and `memory-bank/progress.md`.
   - Push branch `work/MiServeRDC-runtime-correctness` to remote for review.
