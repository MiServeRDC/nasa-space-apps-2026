# Main verification and same-source reconnect correction

Date: 2026-11-15. Initial target: main `9f93263` after PRs #33 and #34.
Local work branch: `fix/cockpit-reconnect-freshness`. No hosted Actions.

## Finding

The main retest passed the existing 334 all-feature Rust tests, 326 default Rust
tests and 165 frontend tests. A strengthened production-browser test then found a
real integration failure: restarting Rust while retaining `bidmc_01` reopened the
socket but left the displayed recording clock frozen. The previous reconnect test
changed source to absent hardware before restarting, so it did not cover this case.
The initial failure is preserved separately from the successful corrected run.

`acceptRawPayload` contained a second timestamp guard that overrode a replay rewind
accepted by the shared freshness gate. New socket sessions also retained ordering
watermarks from the previous engine. Removing all ordering checks would admit
late responses; the correction retains one authoritative gate instead.

## Correction

- Normalize the existing Rust `mission_Elapsed_seconds` field as optional
  `engine_elapsed_s`, independent of the repeating recording time and What-If
  mission day. Reject invalid/non-finite/negative clock metadata.
- Accept an in-session recording rewind only with an advancing engine clock.
  Reject decreasing engine time, older-cycle packets and removal of an established
  clock. Legacy packets without engine time can advance normally but cannot prove
  a recording rewind. Source-switch behavior remains explicit.
- Start new ordering watermarks on a new browser WebSocket session. Keep data stale
  until a valid frame arrives; an open connection alone does not make data fresh.
- Ignore the initial HTTP snapshot if WS is active or its connection generation
  has expired. Clear cached binary data and recorded trend history on an accepted
  timeline/source change.

No Rust code, medical thresholds, detector tuning, recording speed or default
storage selection changed. The wire already carries engine elapsed time; no new
backend contract field is required.

## Verification

| Check | Result |
| --- | --- |
| Main Rust tests, all ARES features, serial | 334 passed; 0 failed/ignored |
| Main Rust tests, default features, serial | 326 passed; 0 failed/ignored |
| Corrected frontend tests | 171 passed; 0 failed/skipped |
| TypeScript and production build | Passed |
| All-feature/all-target workspace Clippy | Passed; upstream SDK warnings remain documented |
| LanceDB tests with all network operations denied | 3 actual tests passed |
| Production Chrome against the actual local Rust engine | 18 checkpoints passed |
| Vendor integrity and required local fast probe | Passed |

Six new frontend behavioral tests cover proven replay wraps, large delayed
responses, packets from a previous cycle, legacy/clockless input, session resets
and clock normalization/invalid aliases. The existing source-inspection assertion
that required the faulty duplicate timestamp check was removed; ordering is tested
behaviorally instead. Natural replay wrap is covered by these behavioral tests;
this run does not claim an eight-minute browser loop/stability qualification.

The browser used the actual production entry point and a separately owned Rust
process with temporary Arrow storage, without mocked telemetry. It waited for a
real 120-second baseline, injected a labeled synthetic desaturation and observed
playbook #06 in approximately 16.9 seconds. Checklist progress survived navigation
and clearing. The same-source restart now visibly resets recording time and starts
a new detector baseline. Absent-hardware abstention, another disconnect/reconnect,
responsive layouts and no-WebGL fallback also passed. The main browser context
observed 2,674 WS frames, no uncaught page errors, no failing HTTP responses and no
attempted external HTTP requests. At the storage checkpoint: 55 committed warm
segments, zero reported flush failures and 13 audit records.

Artifacts remain outside git at `/tmp/ares-main-retest-20261115/`:

- `browser/results.json` and `browser.log`: original main failure on same-source restart.
- `browser-fixed/results.json` and `browser-fixed.log`: corrected production run.
- `rust-all-features.log`, `rust-default.log`, `clippy-all-features.log`.
- `frontend-fixed-tests.log`, `frontend-fixed-types.log`, `final-production-build.log`.
- `network-denied.log` and `network-denied-test-list.txt`: feature-enabled test binary
  and the three cases that actually executed; zero-test default binaries are not
  accepted as evidence.
- `vendor.log`, `fast-probe.log`, and the exact initial `tested-sha.txt`.

Reproduce with the commands in the earlier
[integration qualification](FINAL_INTEGRATION_QUALIFICATION.md) and the extended
`scripts/verify_cockpit_live.mjs`. The harness includes both same-source and
source-switch reconnect checks and shuts down its own processes.

## Remaining scope

The default demo flow is verified for the exercised cases. The optional LanceDB
adapter still has incomplete trait reads/search, flush/durability/restart metadata
and replacement-upsert semantics; compilation and tested writes do not establish
backend parity. Actual acquisition hardware, a native desktop window, real
LLM/voice weights, prolonged operation and clinical effectiveness remain outside
this qualification. Model status remains `ILLUSTRATIVE_UNVALIDATED`.
