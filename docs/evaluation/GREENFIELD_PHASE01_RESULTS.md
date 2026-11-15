# Greenfield remediation: phases 0 and 1

Date: 2026-11-15. Branch: `work/MiServeRDC-greenfield-phase01`.
Status: implemented and verified locally. No merge into main and no push were performed by this task.
Scope approval: user requested only phases 0 and 1 of the [implementation plan](../plans/GREENFIELD_REMEDIATION_AND_ANATOMY_IMPLEMENTATION.md).

## Phase 0: reproducible integration baseline

Pinned inputs:

- Fabio's `feat/cockpit-greenfield-awwwards`: `e4e753142da2517e0d12ecce4cb4cb7792bed897`.
- Current `origin/main`: `2314b5a`; common ancestor: `3516da4`.
- Dedicated worktree: `/tmp/ares-greenfield-phase01`. Main clone was clean.
  Prior review worktree held uncommitted review/planning documents; they were
  preserved and the relevant artifacts copied, without replacing current main memory.
- Integration direction: main into a dedicated branch based on Fabio's frontend.
  App conflict retained Fabio's workbench entry. Shared telemetry hook, freshness
  guard, binary decoder, storage, backend and safety fixes come from current main.
  The other two conflicts were memory history; both histories were retained.
  No unresolved conflict markers remain.

Integrated baseline before the clinical patches: 74 frontend tests, TypeScript
lint and production build passed. Entry bundle: 379.09 kB, gzip 114.23 kB.
Original review reproductions remain outside git; the
[review](GREENFIELD_FRONTEND_REVIEW.md) describes initial WebGL loss,
reduced-motion confirmation bypass, source substitution and forecast mismatch.
The latter two have persistent regressions in phase 1. The former two remain
explicit phase 2 failures, rather than being claimed as repaired.

### Local asset inventory

`node scripts/inventory_greenfield_anatomy.mjs` verifies every pinned SHA-256 and
byte length and actually decodes each Meshopt buffer view with the installed
local decoder. Vertex/triangle counts come from the corresponding GLB accessors;
vertices shared by multiple primitives can be counted more than once. Decoded
bytes are decoded compressed buffer views, not total browser RAM or GPU residency.

| Asset | File bytes | Meshes | Primitives | Vertices | Triangles | Decoded buffer bytes |
|---|---:|---:|---:|---:|---:|---:|
| SkeletalSystem100.glb | 5,674,676 | 881 | 1059 | 480,991 | 893,019 | 10,937,130 |
| MuscularSystem100.glb | 5,241,848 | 411 | 526 | 532,040 | 838,813 | 11,530,830 |
| CardioVascular41.glb | 5,234,824 | 676 | 676 | 507,219 | 886,662 | 11,163,248 |
| VisceralSystem100.glb | 4,448,992 | 145 | 164 | 439,042 | 831,372 | 10,579,048 |
| NervousSystem100.glb | 6,155,192 | 470 | 533 | 650,730 | 1,123,815 | 14,472,414 |

All five match `public/anatomy/MANIFEST.json`, source commit
`236f3a183108bcccc1f95fda1558be19d7486d00`, with
`EXT_meshopt_compression` and `KHR_mesh_quantization`. Existing derivative credits
remain CC BY-SA 4.0. No female atlas, extra source asset, license replacement or
source registration is implemented here. Detailed IJV/vagus/optic sheath and
female lower limb coverage still require the phase 3 inventory and human review.

### Measurement environment and provisional budgets

Local machine: MacBook Air, Apple M5, 16 GB, macOS, Google Chrome/Chromium.
Desktop test viewport: 1440x1000; mobile layout emulation: 390x844. Mobile emulation
is not physical Android/iOS qualification; those devices remain to be nominated.
Original branch review recorded 186 uncovered and 180 covered render calls in a
particular skeletal-layer scene. This is a scenario baseline, not a universal
performance figure; no mobile FPS or GPU-memory certification is claimed.

Provisional engineering regression budgets for this integration: initial entry
at most 132 kB gzip (about 15% above 114.23), combined JS at most 1.8 MB raw,
no added model bytes, and no extra canvas for the display adapter. Final entry
115.75 kB gzip / 383.34 kB raw; combined JS about 1.65 MB. Phase 7 must establish
measured frame-time, decoded memory, context-loss and target-device budgets before
adding assets. These are engineering guardrails, not medical thresholds.

## Phase 1: clinical display and source boundaries

- `clinicalViewModel.ts` provides finite nullable values, units, availability,
  reason, data origin, record, timestamp and model-validation status. Backend
  panels cannot call scenario calculations to fill missing inputs.
- MRI/global rho, published predicate margins, environment, SQI, imaging and
  bone/renal cards preserve missingness. Explicit null predicate maps and ONSD
  remain absent; zero remains a valid observation. The normalizer now retains
  real `nqs_stl` predicate fields even when `safety_margins` is also present.
- Forecast selection requires the exact channel and known matching unit. No
  first-channel fallback, cone fabricated from current rho, invented ghost curve
  or extrapolated unsupported horizons. Global and short-horizon abstention are
  honored. There is no claim of guaranteed conformal coverage.
- Absorbed cumulative dose stays mGy; no uGy/h-to-mSv/d inference is performed.
  Habitat input origins remain visible even if biometrics come from a recording.
- Procedural B-mode images are labelled illustrations, not acquired imaging.
  Missing parameters produce a placeholder; measured uncertainty is not invented
  from the local scenario. Secondary meshes remain unobserved reference anatomy.
- Replay, hardware, backend scenario overlay and offline local preview are
  labelled using the actual packet. Hardware validation now accepts the source
  already defined by main. The What-If comparison identifies two local scenarios,
  rather than calling the default scenario an empirical observation.
- Waveform history resets on record, subject, source, overlay or preview changes;
  it cannot connect unrelated traces. Current main's transport, out-of-order
  protection, 1 Hz source vs 20 Hz refresh and immediate alarm path are retained.
- Playbook context no longer substitutes scenario HR/gait/radiation for backend
  missing inputs. Existing backend gate flags remain the primary input. Complete
  action authorization/confirmation and legacy missing-input gate presentation
  remain phase 2 work; this is not clinical qualification of countermeasures.

## Verification and reproduction

All checks ran locally; no hosted Actions, cloud test runner or main publication.

- `npm --prefix ares-cockpit test`: 94 tests pass (74 inherited, 20 added).
  The new suite transforms and renders actual TSX with Vite and React SSR.
  It covers missingness, real predicates, channel/unit isolation, abstention,
  imaging, source labels, units and all 15 playbooks. Seven initial behavioral
  regressions failed before their fixes; no tests were disabled to get green.
- `npm --prefix ares-cockpit run lint` and `run build`: pass.
- `bash scripts/agent_probe.sh --test`: pass, including Cargo check, Clippy
  with `--workspace --all-targets -- -D warnings`, 242 Rust tests, zero ignored,
  dataset hashes, production panic scan and memory/governance documents.
- `scripts/verify_greenfield_phase01_browser.mjs`: actual hook and App integration
  with controlled synthetic wire fixtures. Covers live vs preview work, immediate
  alarm, unavailable HRV, reconnection, held 1 Hz samples, stale/recovered status,
  null-to-finite-to-null rendered values, rejected older frames, hardware label,
  source history reset, overlay label, offline preview and mobile rendering.
  Screenshot inspection confirms N/A values and no invented rho forecast.
  This is software contract testing, not validation on patients or wearable hardware.

Run the browser harness after `npm ci` in `ares-cockpit`, with external paths:

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
BROWSER_PATH=/absolute/path/to/chrome \
node scripts/verify_greenfield_phase01_browser.mjs
```

The harness owns its loopback mock/Vite servers, uses ephemeral ports and cleans
up browser, sockets and timers. Screenshots/logs/JSON go to the OS temporary
directory. Existing `verify_optimization_browser.mjs` retains old UI selectors;
its old-layout navigation checks are not a greenfield UI qualification. Its
transport and runtime guarantees are exercised by the new harness instead.

## Next gate

Phase 2: preserve the DOM cockpit when WebGL is absent/lost, fix deliberate
confirmation including reduced motion/keyboard, distinguish local notes from
backend execution and constrain voice to local paths. Phases 3-10 remain planned.
Do not call this branch a completed operational or clinically validated cockpit.
