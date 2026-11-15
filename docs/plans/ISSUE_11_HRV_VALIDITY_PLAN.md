# Issue #11: HRV validity on the current main implementation

Baseline: `a6ce84f78c175e2ee084f940c9deec63de5f1457`. Scope: backend correction on this baseline; no merge of teammates' pending branches and no waveform processor.

## Problem

Numeric BIDMC CSVs provide 1 Hz monitor summaries, not beat intervals. The SQI filter fabricates RMSSD and holds a default 42 ms. Scenario overlay derives SDNN, pNN50 and LF/HF from that proxy. MRI then substitutes 40 ms for missing RMSSD. Removing only the first formula would leave an invented assessment downstream.

## Architecture and intended behavior

1. Keep the existing numeric SQI algorithm separate from HRV; do not present it as a validated waveform quality measure. Retain the existing tuple signature for pending replay-cadence compatibility, but always return `None` for numeric-source RMSSD.
2. Numeric overlays return all four unsupported HRV indicators as `None`, report their names as missing and carry a typed `BEAT_INTERVALS_NOT_AVAILABLE` reason. Do not retain the proxy as an alternative simulated measure.
3. The normalizer accepts optional RMSSD and rejects non-finite/non-positive values. The HRV margin, full global margin, composite MRI and dependent TTV/bands become nullable. Do not silently renormalize the composite around missing HRV.
4. Continue evaluating known non-HRV predicates. Existing warning/emergency behavior and known violations must remain visible even when the full assessment is incomplete. Use `DATA_DEGRADED_MISSING_CHANNELS` when no stronger known warning exists. Unknown is not nominal. Preserve explicit violation handling for phase routing and privacy views.
5. Serialize missing metrics as JSON null in snapshots, WebSocket packets and MCP summaries. Suppress countermeasure projections that require an unavailable global assessment. Update logging and test fixtures for nullable fields.
6. Document both the baseline Rust field names and the intended cockpit schema without silently renaming the transport. Full wire-contract reconciliation and frontend implementation remain #8 integration work. Add explicit nullability/reason descriptions for affected fields.

## Verification

- Replay all bundled records and verify the four HRV fields stay unavailable at every row, including missing and recovery samples and record wrap.
- Test missing, NaN, infinity and non-positive RMSSD: no fallback, no full MRI/global/TTV, explicit degraded assessment.
- Test known low non-HRV margins and confirmed POCUS retain their previous warning/emergency behavior despite missing HRV.
- Verify serialization and MCP output retain null and remain valid JSON within the existing byte budget.
- Run local workspace tests and the repository probe, including Clippy; do not enable hosted Actions.

## Scientific basis

- [NeuroKit HRV documentation](https://neuropsychology.github.io/NeuroKit/functions/hrv.html): HRV requires beat peaks/intervals and timestamps.
- [BIDMC v1.0.0](https://physionet.org/content/bidmc/1.0.0/): distinguish 1 Hz numerics from 125 Hz waveforms.

No clinical threshold is introduced. Unit tests establish software behavior, not clinical validity.

## Integration checklist for later updates

- ARES-Health Team's cached native-sample SQI tuple must not reintroduce HRV through `biometrics_with_signal_quality`.
- Fertech's alternate transport already uses nullable HRV; preserve that behavior and map nullable margins when integrating it.
- ARES-Health Team's frontend must render unavailable values and handle `DATA_DEGRADED_MISSING_CHANNELS` without healthy defaults.
- Recheck schema, JSON field naming, null propagation and #10 cadence after each integration. The current main contains no executable cockpit, so browser acceptance remains outstanding.


## Verification results (2026-11-14, local macOS)

- `cargo test --workspace --locked --quiet`: 45 passed, 0 failed.
- `cargo clippy --workspace --all-targets --locked -- -D warnings`: passed.
- `cargo build --workspace --locked --quiet`: passed.
- Actual CLI process tested via `GET /api/snapshot`, a WebSocket upgrade/initial text frame on `/ws/telemetry`, and `--mode mcp-only` with `get_crew_health_summary`: explicit missing HRV and nullable dependent outputs confirmed.
- Three real numeric records and wrap boundary traversed in the server regression test. This checks emitted content, not the separate #10 cadence defect.
- Complete synthetic HRV fixtures preserve the previous calculations; missing/NaN/infinite/non-positive inputs do not produce full assessments. Known warning/emergency and privacy cases pass.
- Browser check not performed: executable cockpit is not on this baseline. The pre-existing full wire-contract mismatch remains #8; extending schema descriptions here does not fix that mismatch.

Final local repository gate: `bash scripts/agent_probe.sh --all` passed (check, all-target Clippy, 45 tests, production panic scan, dataset checksums and required documentation).


### PR #20 integration with main 4839090

The phases 15-20 update arrived before merge. Ported null HRV guarantees into the new FastMCP router, optional Timestral assessment/RMSSD cones, masked global input, NqsEngine and longitudinal storage. Missing global values are not counted as zero observations, calibrated on zero padding, or converted back to finite TTV. An added regression runs the async forecaster repeatedly and checks its typed snapshot and compact output. Full local verification follows before merge.

Integration verification on main `4839090`: `bash scripts/agent_probe.sh --all` passed, 83 tests passed, 0 failures and strict all-target Clippy passed.
