# Implementation Plan: Runtime Correctness Follow-up & Defect Remediation

NASA Space Apps Challenge 2026 — ARES-Health Platform
Strict Invariant: ZERO EMOJIS anywhere in code, comments, documentation, or commit messages.

## 1. Problem 1: Warm Archive Manifest Checksum & Legacy Compatibility (P1)

### 1.1 Reproduction
- Archive path: `/var/folders/0t/wclc3zfx6vn6vrcmw_bz2s9w0000gn/T/ares-correction-review-9h2z0o0m/legacy/MANIFEST.lsah.json`.
- The legacy manifest was generated before `min_mission_sol` and `max_mission_sol` were introduced into `WarmSegmentMeta`.
- Deserialization into `ManifestPayload` populates `min_mission_sol: None` and `max_mission_sol: None`.
- When verifying the manifest CRC, `warm_arrow_ipc.rs` serializes `signed.payload` back into JSON bytes.
- Resulting serialization inserts `"min_mission_sol":null,"max_mission_sol":null` (or altered key order), yielding CRC `1888779538` instead of the expected `3379649115`.
- `ArrowIpcZstdHnswBackend::open` rejects the archive with `LsahStorageError::CrcMismatch`.

### 1.2 Root Cause
`serde(default)` enables deserialization of older JSON payloads missing newer fields, but re-serializing a modified struct structure changes the exact byte stream that was signed by the original writer. In addition, when legacy segments missing sol bounds are filtered with `min_mission_sol.unwrap_or(mission_sol)`, segments spanning multiple sols are prematurely pruned before the row-level sol filter can inspect them.

### 1.3 Expected Correct Behavior
1. Legacy archives written by earlier software revisions must open cleanly without CRC errors, preserving all committed segments and rows.
2. Checksum verification must verify the exact signed representation of the manifest version that produced it.
3. Legacy segments lacking `min_mission_sol`/`max_mission_sol` must not be prematurely excluded during queries across sols; row-level filtering must determine row inclusion.
4. Genuinely corrupted manifests or segments must continue to be quarantined or rejected.

### 1.4 Architectural Choice
- Implement an explicit versioned / canonical manifest verification strategy:
  - Add `#[serde(default, skip_serializing_if = "Option::is_none")]` to `min_mission_sol` and `max_mission_sol` in `WarmSegmentMeta`.
  - Maintain a `LegacyManifestPayload` DTO representing format v1 without the new optional sol fields.
  - In `open_with_report`: verify manifest CRC against the raw payload bytes or the canonical versioned DTO before migration. If the payload matches either the v2 format or the v1 legacy format, accept the manifest.
  - In `read_telemetry_sol_range`: if a segment has `min_mission_sol: None`, treat its sol bounds as unconstrained (`min_s = 0, max_s = u16::MAX`) so the segment is read and accurately filtered by the row-level Arrow boolean mask.

### 1.5 Compatibility
- Fully backwards-compatible with all existing legacy manifests and forward-compatible with partitioned v2 manifests.
- Manifests written on new appends contain full sol bounds.

### 1.6 Error Management
- Tampered manifest payloads or corrupt CRC values still return `LsahStorageError::CrcMismatch`.
- IO errors during manifest read return typed `LsahStorageError::Io`.

### 1.7 Acceptance Tests
- Regression test opening a genuine legacy manifest fixture with no `min_mission_sol`/`max_mission_sol`.
- Verify sequence IDs, row count, null fidelity, and zero segment quarantines.
- Query Sol 1 and Sol 2 on a legacy segment containing rows for both sols: verify exact rows returned.
- Verify corrupted manifest payloads are rejected.

---

## 2. Problem 2: Retry Partition Duplication in Multi-Sol Appends (P1)

### 2.1 Reproduction
- Create a multi-sol batch spanning Sol 1 (seq 1) and Sol 2 (seq 2).
- Induce a simulated IO failure on partition 2 (e.g. pre-creating target path as a directory).
- First append call commits partition 1 to `guard.segments` and manifest, then fails on partition 2 with `IsADirectory`.
- Staging buffer retains the full batch for retry.
- When the obstruction is removed and retry executes, partition 1 is appended again as a new segment.
- Result: 3 rows stored for 2 samples (duplicate Sol 1 row).

### 2.2 Root Cause
`append_telemetry_batch` commits each partition incrementally inside the partition loop. If partition $k$ fails after partition $k-1$ was already committed to the manifest, the batch is partially committed. When the retry loop re-executes with the retained batch, already-committed partitions are appended again under new segment IDs.

### 2.3 Expected Correct Behavior
- All-or-nothing transactional commit of multi-sol batches:
  - If any partition fails during encoding or writing, all uncommitted segment files from that batch are cleaned up, and neither `guard.segments` nor the manifest is mutated.
  - On retry, no duplicate segments or rows are created.
  - If a retry occurs with a batch containing sequences already committed, idempotency checks prevent duplicate row ingestion.

### 2.4 Architectural Choice
1. Transactional Phase 1 (Prepare): Encode all partitions and write them to unique `.tmp` files.
2. Transactional Phase 2 (Rename): Atomically rename all `.tmp` files to their final segment paths. If any rename fails, remove all segment files created in this transaction, leaving existing state and manifest untouched.
3. Transactional Phase 3 (Commit): Acquire state lock, append all new `WarmSegmentMeta` descriptors to `guard.segments`, update `guard.next_segment_id`, and persist the manifest once. If manifest write fails, roll back segments, revert `next_segment_id`, unlink the segment files, and return error.
4. Sequence Idempotency Guard: Check if the batch's `min_sequence_id..=max_sequence_id` is already covered by committed segments before appending.

### 2.5 Compatibility
- Preserves `WarmColumnarVectorBackend` trait interface and semantics.
- Works seamlessly with existing `flush_reliability.rs` tests.

### 2.6 Error Management
- Filesystem errors during staging or rename trigger deterministic cleanup of all artifacts created within that transaction.
- Zero orphaned segment entries in `MANIFEST.lsah.json`.

### 2.7 Acceptance Tests
- Failure before partition 1: no segments written, manifest clean, retry succeeds with exact rows.
- Failure on partition 2 after partition 1 prepared: uncommitted partition 1 file cleaned up, manifest unchanged, retry succeeds with exactly 2 rows for 2 samples.
- Recovery after restart before retry: startup recovery finds clean state, retry succeeds with 0 duplicates.
- All existing `flush_reliability` tests pass without regression.

---

## 3. Problem 3: What-If CSV Contamination in Hardware Mode & Pre-First-Frame State (P1)

### 3.1 Reproduction
1. Ingest valid wearable packet (`source = hubris_node_01`, `HR = 123`, `provenance = HardwareWearable`).
2. Call `apply_stress_test_patch(StressTestPatchRequest::default())`.
3. Advance clock by 50 ms.
4. Result: `latest_packet` is overwritten by CSV replay (`source = bidmc_01`, `HR = 94`, `provenance = RecordedTerrestrialBidmcCsv`), even though `source_mode == LiveWearableHardware`.
5. Pre-first-frame: switching to `LiveWearableHardware` before receiving any packet continues publishing initial CSV packet instead of an explicit awaiting/unavailable state.

### 3.2 Root Cause
`apply_stress_test_patch` unconditionally calls `current_replay_row()`, computes biometrics from that CSV row, and overwrites `guard.latest_packet`. Additionally, `set_source_mode(LiveWearableHardware)` leaves `guard.latest_packet` pointing to the startup CSV packet.

### 3.3 Expected Correct Behavior
1. In `LiveWearableHardware` mode, What-If stress test patches must never invoke `current_replay_row()` or substitute CSV biometrics into `latest_packet`.
2. Real wearable observations must remain untainted: What-If modifications apply only to scenario parameters (ARED, cabin ppCO2, LBNP) while preserving the true hardware biometrics and `HardwareWearable` provenance.
3. When `LiveWearableHardware` is active before any hardware packet arrives, the system must expose an explicit `AwaitingWearable` state (`source_record_id = "awaiting_wearable_hardware"`, biometrics channels `None`, `AlertSeverity::DataDegradedMissingChannels`, missing channels populated).

### 3.4 Architectural Choice
- In `apply_stress_test_patch`:
  - Check `guard.source_mode`. If `LiveWearableHardware`:
    - If a valid wearable packet has been received, use `guard.latest_wearable_packet` vitals and `BiometricsSource::HardwareWearable` with the modified scenario (ARED, ppCO2, LBNP) to update causal graph and safety gates without touching CSV replay.
    - If no wearable packet has been received, do not fabricate CSV biometrics; return the awaiting state with updated scenario parameters.
- In `set_source_mode(LiveWearableHardware)`:
  - Immediately reset `latest_packet` to an explicit `AwaitingWearable` packet if no hardware packet has arrived yet (`active_wearable_node.is_none()`).
  - Clear `latest_wearable_packet_time` until the first packet arrives.
- In `ingest_wearable_packet`: acquire publication lock to guarantee consistent publication order with `advance_tick`.

### 3.5 Compatibility
- Does not affect `RecordedReplay` mode.
- REST endpoints and UI badges receive clean, coherent provenance.

### 3.6 Error Management
- Stale sensor timeout (3.0s) continues to flag `DataDegradedMissingChannels` without falling back to CSV.
- Duplicate / out-of-order wearable packets are dropped.

### 3.7 Acceptance Tests
- Wearable ingest followed by empty What-If: source remains `hubris_node_01`, HR remains 123, provenance remains `HardwareWearable`.
- Wearable ingest followed by active What-If (e.g. ppCO2 / ARED changes): scenario updates, causal graph updates, biometrics remain hardware observations.
- Switch to hardware before first frame: source is `awaiting_wearable_hardware`, HR is `None`, missing channels populated.
- Switch hardware -> replay -> hardware: states transition cleanly without lingering data.

---

## 4. Problem 4: Desktop Snapshot Ordering, Concurrency Bounds & Native Fallback (P1)

### 4.1 Reproduction
- In Chromium with simulated delayed Tauri IPC invokes:
  - Request 1: HR 80 (resolves in 10ms).
  - Request 2: HR 111 (delayed by 1700ms).
  - Request 3: HR 122 (resolves in 10ms, arrives before Request 2).
  - Request 2 arrives last: displayed HR regresses from 122 to 111 while status remains `ENGINE_LIVE`.
- Also: older full snapshots can overwrite newer 20 Hz binary telemetry frames.

### 4.2 Root Cause
`useTelemetry.ts` polling fires `hydrateTauriSnapshot()` every 1000 ms unconditionally without bounding in-flight requests, without response timeout, and without sequence/timestamp/revision monotonic checking in `acceptRawPayload`.

### 4.3 Expected Correct Behavior
1. Single in-flight request bound: do not launch overlapping snapshot requests while one is pending.
2. Response timeout: abandon hung snapshot requests after a bounded duration (e.g. 1500 ms).
3. Monotonic revision / sequence ordering: reject any snapshot response whose sequence or timestamp is less than or equal to the latest applied snapshot or binary frame.
4. High-frequency 20 Hz binary frames take precedence over older snapshots: vitals are never regressed by an older snapshot.
5. Clean teardown on unmount: cancel pending requests, clear intervals, and prevent state updates on unmounted components.

### 4.4 Architectural Choice
- In `ares-cockpit/src/lib/useTelemetry.ts`:
  - Add `snapshotInFlightRef` and `snapshotSeqRef` (monotonically incrementing request generation counter).
  - In `hydrateTauriSnapshot`: if `snapshotInFlightRef.current` is true and request has not timed out, skip polling tick.
  - Wrap invoke in an explicit timeout guard (1500 ms).
  - In `acceptRawPayload`: inspect `payload.timestamp_ms` and `relative_recording_time_s`. If payload is older than `lastAppliedTimestampRef`, reject as stale.
  - If a 20 Hz binary frame has arrived with a newer timestamp/sequence, merge only extended fields (cones, anomalies, Block N) from the snapshot while preserving the newer vitals from the binary frame.

### 4.5 Compatibility
- Retains existing desktop Tauri v2 IPC contracts and browser WebSocket fallback.

### 4.6 Error Management
- Interrupted or rejected binary channels cleanly engage snapshot polling fallback without throwing uncaught exceptions.
- Disposed components ignore late-arriving promises.

### 4.7 Acceptance Tests
- Test simulated out-of-order responses (Response 3 arriving before Response 2): verify Response 2 is rejected and HR remains 122.
- Test older snapshot arriving after newer binary frame: verify newer binary vitals are preserved.
- Test hung invoke timeout and subsequent recovery.
- Test unmount cleanup (zero pending timers or state updates).

---

## 5. Problem 5: Consistent Storage CRC Policy & Startup Recovery (P2)

### 5.1 Reproduction
- `read_telemetry_sol_range` called `verify_segment_checksum`, which speculatively accepted both IEEE CRC32 and Castagnoli CRC32C.
- Startup recovery (`open_with_report`) called `verify_segment_file_crc`, which verified only IEEE CRC32.
- Inconsistent verification: a segment written under Castagnoli would be quarantined during recovery but accepted during ad-hoc reads.

### 5.2 Root Cause
Absence of a single unified checksum verification policy between read path, write path, manifest, and startup recovery.

### 5.3 Expected Correct Behavior
- Explicit, uniform storage checksum policy:
  - Storage files (Arrow IPC zstd segments and LSAH manifests) use IEEE 802.3 CRC-32 (the standard algorithm of `crc32fast`, matching Parquet and Arrow conventions).
  - `verify_segment_file_crc`, `read_telemetry_sol_range`, `append_telemetry_batch`, and manifest verification all consistently use `compute_storage_crc32_ieee`.
  - Binary telemetry IPC over wire/pipe continues to use its documented CRC-32C Castagnoli checksum without any change.

### 5.4 Architectural Choice
- Unify all storage segment verification to `compute_storage_crc32_ieee` across `open_with_report`, `verify_segment_file_crc`, and `read_telemetry_sol_range`.
- Eliminate speculative algorithm guessing in storage verification.

### 5.5 Compatibility
- Preserves all valid legacy and current storage archives.

### 5.6 Error Management
- Corrupt bytes produce immediate `LsahStorageError::CrcMismatch` or quarantine during recovery.

### 5.7 Acceptance Tests
- Real legacy and current storage segment files verified under startup recovery and read paths.
- Corrupted segment bytes trigger quarantine during recovery and `CrcMismatch` on direct read.

---

## 6. Problem 6: Test Runner Lifecycle, Failure Reporting & Report Metrology (P2)

### 6.1 Reproduction
- If any preflight or tier fails in `scripts/run_all_test_tiers.sh`, `set -e` terminates execution immediately without updating `docs/evaluation/MASTER_TEST_EXECUTION_REPORT.md`.
- A previous `ALL 7 TIERS PASSED` report remains on disk, falsely indicating a passed run.
- Missing git SHA, dirty flag, environment versions, and dynamic test counts.

### 6.2 Root Cause
`run_all_test_tiers.sh` generates the markdown report only at the very end of a successful run, with no bash trap handler for failed exits.

### 6.3 Expected Correct Behavior
1. Initializing state: at script start, record `EXECUTION_STATUS: INCOMPLETE / RUNNING` with git commit SHA, dirty status, OS, date, and toolchain versions.
2. Failure trap: on non-zero exit (`trap 'handle_exit $?' EXIT`), rewrite the report with `EXECUTION_STATUS: FAILED` detailing the exact tier/step that failed and preserving the original exit code.
3. Success state: on clean completion of all 7 tiers, write `EXECUTION_STATUS: ALL 7 TIERS PASSED`.
4. Accurate benchmark labeling: label the live engine tick benchmark as "In-Memory Shell without disk recording" rather than claiming full storage persistence.
5. Dynamic test counts: parse actual passed test counts from test outputs.

### 6.4 Architectural Choice
- Implement bash `trap` handler in `scripts/run_all_test_tiers.sh`.
- Create a fast isolated test script `scripts/test_runner_lifecycle.sh` that mocks tier steps and verifies:
  - Failed step generates `FAILED` report and exits with the step's exit code.
  - Clean run generates `PASSED` report.

### 6.5 Compatibility
- Standard bash / POSIX syntax, zero external dependencies beyond core utilities.

### 6.6 Error Management
- Preserves exact exit code of failing command.
- Temporary files cleaned up in trap handler.

### 6.7 Acceptance Tests
- Execution with deliberate failure in preflight: report is `FAILED`, exit code preserved.
- Full run: report is `ALL 7 TIERS PASSED`.
