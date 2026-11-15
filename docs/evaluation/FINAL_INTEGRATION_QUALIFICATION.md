# Frontend/backend integration qualification

Date: 2026-11-15. Baseline: `origin/main` at `fb70b72` (includes
`origin/work/LelloXV-frontend-lab` in its ancestry). Corrections are on
`work/MiServeRDC-integration-qualification`, in an isolated worktree.
The final branch is rebased onto `origin/main` `af30a03`; the two intervening
commits changed only README.md, with no executable-source differences.
The qualification itself performed no merge, push or hosted GitHub Actions.
The user subsequently authorized integration into main through a pull request;
no hosted workflows are added or triggered by this change.

## Outcome

The production cockpit interoperates with a real local Rust engine in the default
Arrow storage configuration. The qualification found and corrected two integration
issues. It does not establish clinical effectiveness or hardware readiness.
**Follow-up:** the optional compile blocker was repaired after this baseline
qualification. See [LanceDB build qualification](LANCEDB_LOCAL_BUILD_QUALIFICATION.md)
for 334 passing all-feature tests, network-denied local persistence tests and
remaining experimental-adapter limits. Historical failures below record the
original baseline, rather than the repaired build.

## Later main retest

The [post-merge verification](POST_MERGE_VERIFICATION_2026-11-15.md) adds same-source
engine-restart coverage. It exposed and corrected a separate cockpit freshness
lockout that the original source-switch reconnect check did not exercise.

## Corrections

1. **Replay procedure leakage.** With What-If off, the backend hid unmeasured organ
   metrics but still suggested modeled SANS/musculoskeletal procedures. Outside
   explicit scenario mode the evaluated packet now suggests a procedure only from
   the vitals detector. Otherwise it emits `playbook_id: "NONE"`, no actions and no
   triggered-playbook IDs. Existing safety-gate states are retained. ACT shows
   monitoring standby, rather than implicitly falling back to the first catalog
   procedure. The catalog remains available through explicit manual selection.
2. **Overlay off was frontend-only.** Rust previously enabled scenario mode for a
   stress-test patch but offered no corresponding off transition. The optional
   `overlay_active` patch explicitly switches mode; when omitted, legacy behavior
   remains: `preserve_overlay: true` keeps the mode, other patches enable it.
   An explicit boolean takes precedence over `preserve_overlay`. The cockpit sends
   on/off transitions through its serialized scenario queue and resynchronizes on
   reconnect. Turning off does not advance the replay, reset detector learning or
   fabricate HRV. Stored scenario values remain available for future activation.

No physiological thresholds, detector tuning or model-validation labels changed.
The MCP sanitizer regression now supplies an explicit untrusted observation
instead of relying on an automatically suggested scenario procedure during replay.

## Local checks

| Check | Result |
| --- | --- |
| Clean npm lockfile installation | Passed |
| Frontend tests | 165 passed, 0 failed/skipped |
| TypeScript lint and production build | Passed |
| Rust default workspace, serial execution | 326 passed, 0 failed/ignored |
| Clippy workspace, all targets, warnings denied | Passed |
| Required local fast probe (contracts, manifests, Cargo, Memory Bank) | Passed |
| Production Chrome with actual Rust HTTP/WS | 17 qualification checkpoints passed |
| SHM, native command and offline-voice feature tests | 331 passed, 0 failed/ignored |
| Full optional feature matrix at original baseline | Failed in dependency `lancedb 0.40.0`; repaired in the linked follow-up |

The first default parallel Rust run passed 324 tests and failed one existing wall
clock budget assertion: `SharedMissionState::advance_tick` averaged 174.09 us
against a 150 us limit during concurrent work. The isolated retry passed, as did
the full serial default run after correction. The threshold was not loosened.
This remains a load-sensitive performance test; these runs do not certify a
150 us worst-case scheduling deadline.

The additional feature run used `ares-server-cli/shm-ipc`,
`ares-desktop-os/tauri-native` and `ares-desktop-os/offline-voice`. It checks Rust
paths and deterministic adapters, not a native window or physical voice device.

## Real production-browser evidence

`scripts/verify_cockpit_live.mjs` starts its own loopback Rust process with a
separate temporary storage directory, builds the actual cockpit entry point with
that process URL, and serves the production bundle. It does not mock telemetry,
advance physiological time artificially, or replace WebSocket payloads.

The successful run exercised:

- JSON WebSocket reception; unavailable replay HRV/MRI; 128-byte binary HTTP
  response; actual MCP tool discovery.
- Mission CO2 and simulation body-profile synchronization while organ models stay
  unavailable in pure replay. The atlas display profile is a separate control.
- ACT standby, explicit manual catalog selection and actual backend overlay
  activation/deactivation.
- GATHER, EVALUATE and ACT at 1440, 1024, 768 and 390 px, without horizontal page
  overflow. Screenshots captured desktop alarm and mobile ACT.
- Real-time baseline learning, including refusal of an injection before readiness.
  Synthetic desaturation produced an actual detector alarm and playbook #06 in
  approximately **17.1 seconds**. This is one engineering demo observation, not a
  sensitivity or clinical performance estimate.
- Step 2 of the actual incident procedure persisted across phase navigation and
  clearing the synthetic event. Checklist progress did not confirm recovery.
- Local storage: 45 warm segments committed, zero reported flush failures; 13
  audit records exposed at the observation point. Existing Rust storage tests
  additionally cover drain/reopen, sequence continuity and null HRV persistence.
- Hardware mode without a connected sensor: HR and SpO2 unavailable, rather than
  recycled replay values.
- Deliberate process shutdown: visibly labeled local simulation. Restart: real WS
  reconnected and backend overlay remained off.
- A separate browser context denied WebGL creation: 2D anatomical fallback worked
  and GATHER remained accessible.
- Main browser context: over 2,400 real WS frames, no uncaught page errors, failing
  HTTP responses or attempted external HTTP requests. Only the owned UI/backend
  origins were allowed. This observation covers the exercised UI flows, not all
  possible optional/copilot/hardware paths.

Machine-local logs, snapshots, screenshots and temporary storage are under
`/tmp/ares-final-qualification/`; successful browser run:
`production-live-v2/results.json`. They are not committed. The durable script
writes equivalent artifacts to a fresh OS temporary directory by default.

## Reproduction

From the repository/worktree root, use its own Cargo target directory:

```bash
export CARGO_TARGET_DIR="$PWD/target"
cargo test --workspace --no-fail-fast -- --test-threads=1
cargo clippy --workspace --all-targets -- -D warnings
npm --prefix ares-cockpit ci --ignore-scripts --no-audit --no-fund
npm --prefix ares-cockpit test
npm --prefix ares-cockpit run lint
cargo build -p ares-server-cli --bin ares-server-cli
```

The optional browser probe requires Playwright or Playwright Core installed
outside the repository, plus an installed Chrome/Chromium executable. For example:

```bash
probe_deps="$(mktemp -d)"
npm install --prefix "$probe_deps" --no-audit --no-fund playwright-core
PLAYWRIGHT_MODULE="$probe_deps/node_modules/playwright-core/index.mjs" \
BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scripts/verify_cockpit_live.mjs
```

`BROWSER_PATH` may point to another local Chromium executable. Set
`ARES_QUALIFICATION_OUT` to a new external output directory to retain named
artifacts; do not share a storage directory with an existing engine. Allow about
three minutes: baseline learning uses actual replay time. The script uses free
loopback ports, stops its own process, and saves results even on failure. Its
production build targets a temporary backend port; rebuild normally before using
that `dist/` for a regular demo. `ARES_SERVER_BINARY` can select a prebuilt binary.

## Open limitations

- At the original baseline, `cargo test --workspace --all-features --no-fail-fast -- --test-threads=1` failed
  before ARES tests run: `lancedb-0.40.0/src/job.rs:102,112` constructs `Error::Http`,
  which is not present with the dependency's configured features
  (`default-features = false`). Do not claim the optional `lancedb-warm` build
  passed at that baseline. The linked follow-up repairs this blocker. No Cargo registry files were edited and no cloud features were enabled
  to conceal the defect. The verified default backend is Arrow IPC/Zstd/HNSW.
- No physical wearable, ECLSS or POCUS device was connected. Hardware-mode
  abstention and deterministic transport tests are not physical acquisition tests.
- The actual GUI was production Chrome. Native desktop commands/features can be
  checked in Rust, but a native Tauri window and real binary IPC UI session were
  not exercised here. Binary HTTP validation checked framing; Rust tests cover
  codec/transport contracts.
- Real local LLM weights/voice recognition, full-day stability and simultaneous
  multi-client scenario ownership were not qualified. Existing frontend tests
  also include historical greenfield modules; their passing count alone does not
  prove they are reachable from the current `App.tsx`.
- Model status stays `ILLUSTRATIVE_UNVALIDATED`; BIDMC numeric replay is not a
  spaceflight dataset and cannot supply beat-to-beat HRV. Anatomical render/fallback
  checks do not validate anatomy or full female asset coverage.
