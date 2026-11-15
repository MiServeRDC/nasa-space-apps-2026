# Greenfield phase 2 and phase 3 contract results

Date: 2026-11-15. Baseline: `0ed81eb`. Branch: `work/MiServeRDC-greenfield-phase01`.
No main merge, push, asset download, new dependency or hosted GitHub Actions.
Plan: [phase 2/3 implementation](../plans/GREENFIELD_PHASE23_IMPLEMENTATION.md).

## Phase 2: delivered behavior

- The optional Canvas and primary scene load behind a lazy boundary. Missing
  WebGL2 skips renderer creation, and Canvas/scene failure cannot unmount the DOM
  cockpit. A persistent status covers context loss and clears on restoration.
  Existing DOM vitals, alerts, phase navigation and playbooks remain usable.
  Malformed local model data leaves the monitor available.
- Both motion preferences require the same 1500 ms hold. Pointer and keyboard
  share the rule. Release, pointer leave/cancel, focus loss, hidden document,
  completion and relevant subject/source/playbook/gate changes cancel a hold.
  Short clicks cannot confirm. This does not certify accessibility conformance.
- A confirmation creates a local selection/note, not a claim that a medical
  action was administered. There is no execution endpoint acknowledgement here.
  Backend bleeding-risk and vent-trigger flags survive missing frontend inputs;
  missing gait no longer appears as 0%/nominal. Physical vent/damping acknowledgement
  is explicitly unavailable; threshold values and Rust policies are unchanged.
- Current and legacy voice widgets refuse to start a recognizer unless it exposes
  `processLocally` and accepts true. Rejection/errors expose typed input. There is
  no server retry or automatic language-pack install. Existing TTS selects only
  local-service voices. Real language packs/Tauri microphone access were not tested.
- Local audit appends are serialized. They use real Web Crypto SHA-256 over
  `JSON.stringify(['ARES_LOCAL_NOTE_V1', sequence, timestamp, role, event, prevHash])`.
  Empty local history is genuinely empty; fabricated example rows and fake hash
  fallback are removed from this workbench. Edited content or links fail local
  verification. Failure to hash does not produce a false success record.
- Local notes can be inspected separately even when the engine ledger is present.
  Engine records are labelled link continuity/content unverified: this frontend
  does not assert a backend canonical-hash implementation it has not checked.
  A self-consistent local chain does not authenticate a person, prove that a
  treatment occurred, prove completeness after truncation or provide a trusted
  external anchor. Local notes are session memory; durable retention is separate.

## Phase 3: contracts and ADR delivered

[ADR](../architecture/ANATOMY_IDENTITY_AND_COVERAGE_ADR.md), typed contracts and
registry tests define source/model/mesh identities, licensing/hash/version,
sex/laterality, normalized metre coordinates, transforms, registration review,
LOD/picking references, native/borrowed/missing/unverified coverage and clinical
bindings independent of geometry. Unknown or ambiguous selection clears safely.
Annotations do not move between donors. A kidney reference needs no invented
backend Kidney region. Null clinical channels remain unavailable.

This is the phase 3 contract foundation, not an atlas ingestion or complete
anatomical viewer. The registry validates authored metadata; it does not validate
arbitrary downloaded JSON or anatomically review a mesh. The existing physiological
profile controls and procedural morph remain separate legacy UI. A registry-backed
atlas selector/picking integration is phase 5. No female source asset, registration
or complete native female coverage is claimed. Source approval/inventory is phase 4.

## Local validation

Machine: Apple M5 MacBook Air, 16 GB; Chromium/Google Chrome headless.

- Frontend: **108 tests pass**, zero failures/skips. Includes all 94 previous
  tests plus ASR policy, genuine local audit tampering, anatomy fixtures and gate
  source/missingness regressions. Existing architecture scanning now checks named
  required modules and scans every file instead of requiring exactly 14 files.
- TypeScript lint and production build pass. Entry: about 370.5 kB /112.3 kB gzip;
  separate optional scene: 15.84 kB /6.24 kB gzip. Vendor libraries are still shared
  with other panels; no claim that all Three.js is deferred.
- `verify_greenfield_phase01_browser.mjs` passes against the new integration:
  source ordering, null/finite/null, live/preview, stale/reconnect and history reset.
- `verify_greenfield_phase23_browser.mjs` passes actual component/App behavior:
  pointer and keyboard holds in both motion modes; blur cancellation; no WebGL;
  forced renderer initialization failure; actual `WEBGL_lose_context` loss and
  restoration; corrupted GLB; unsupported ASR refused and local ASR error handling;
  an App selection creates one verifiable local note. ASR implementations are
  controlled mocks; context loss uses the browser extension, not a real GPU fault.
- `scripts/agent_probe.sh --fast`: production panic scan, dataset checksums,
  Cargo workspace check/Clippy all-targets with warnings denied, memory checks pass.
  No Rust source changed in this increment; the prior 242-test Rust run remains
  documented in the phase 0/1 report, not presented as a newly repeated full run.

Browser harnesses need cockpit npm dependencies plus externally installed
`PLAYWRIGHT_MODULE` and `BROWSER_PATH`, as in the phase 0/1 report. All fixture
servers are loopback, ports are temporary, and screenshots/results/logs stay in
OS temporary directories. Local test artifacts are not committed.

Primary API references consulted:
[React Three Fiber Canvas fallback/error boundaries](https://r3f.docs.pmnd.rs/api/canvas),
[Web Speech on-device processing](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally),
[on-device language availability](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static).
