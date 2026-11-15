# Phase 5: conversion and semantic picking results

Date: 2026-11-15. Baseline 30f6e45; branch work/MiServeRDC-greenfield-phase01.
No main merge/push or hosted Actions. [Implementation details](../architecture/ANATOMY_PIPELINE.md).

## Delivered scope

- Offline static GLB extraction CLI with pinned source hash and exact node identity,
  baked axis/unit/world transforms, reflection handling and geometry validation.
- Two fixture LODs and two layer chunks per LOD, plain and Meshopt encodings. Stable
  structure/node/mesh/primitive identity, full hashes, deterministic build metadata,
  credits and local decoder support. The original source remains immutable.
- One owned runtime model session, streamed file limits, declared decoded budgets,
  canceled fetches, disposal of late decode results, deterministic cleanup and no
  unbounded model cache. Per-layer visible batching retains triangle-to-ID ranges.
- Optional `/anatomy-lab`, reachable through the cockpit command palette. DOM and
  actual ray selection, visibility, detail, codec and reference/none controls.
  Synthetic calibration solids only; no real anatomy or physiology inferred.
- Coordinate annotation contract now includes model revision, exact asset/node and
  metre coordinates. Stale anchors are rejected. Durable annotation editing and
  population with reviewed real anatomy remain phase 6/7.

## Measurements

Local MacBook Air M5, 16 GB, macOS arm64, Node v26.13.0, Chrome headless.
Numbers below are from 20 warm decode runs after one warm-up per asset. They
include GLTFLoader parsing/decoding; they are not cold startup or frame-time data.

| Artifact | File bytes | Decoded attribute/index bytes | Triangles | Median ms | P95 ms |
|---|---:|---:|---:|---:|---:|
| core-lod0.glb | 10,984 | 8,736 | 360 | 0.078 | 0.215 |
| core-lod0-meshopt.glb | 8,060 | 8,736 | 360 | 0.065 | 0.095 |
| overlay-lod0.glb | 5,604 | 4,368 | 180 | 0.040 | 0.056 |
| overlay-lod0-meshopt.glb | 4,192 | 4,368 | 180 | 0.046 | 0.058 |
| core-lod1.glb | 6,656 | 4,416 | 180 | 0.044 | 0.053 |
| core-lod1-meshopt.glb | 5,832 | 4,416 | 180 | 0.061 | 0.115 |
| overlay-lod1.glb | 3,440 | 2,208 | 90 | 0.054 | 0.165 |
| overlay-lod1-meshopt.glb | 3,096 | 2,208 | 90 | 0.036 | 0.056 |

Compression preserves decoded geometry and semantic identity, but does not reduce
its decoded footprint. It is not consistently faster on these tiny files. LOD
reduces geometry/triangles; its recorded simplifier errors are not approved anatomy
tolerances. No Draco comparison or compression change is claimed.

With all three fixture structures visible, one browser session owns five geometries
(three model parts + two display batches) and two materials. Decoded owned numeric
bytes are 51,984 at LOD0 and 26,064 at LOD1. Renderer geometry count remains two
across twelve detail switches and returns to zero on unload; CPU ownership counters
also return to zero. This is object-count/attribute accounting, not a VRAM/RSS or
long-duration leak certification. All fixture files total about 116 kB, including
original source, build/extraction metadata, both codecs and notices. No large
anatomy original or image volume was added.

The optional inspector/canvas are separate chunks (about 20.2 kB and 2.45 kB raw).
The entry remains about 371 kB /112.5 kB gzip. Shared Three.js vendor bytes increase
because the local decoder/controls are now used; this is not a claim that the whole
3D dependency is lazy. Full-atlas optimization and mobile qualification remain later.

## Validation

- **124 frontend tests pass**, zero skips/failures, including the inherited phase
  0-4 suite. New actual-behavior tests cover deterministic regeneration, plain vs
  compressed decoding, LOD identities, real ray hits, hidden-front exclusion,
  reflection/winding, interleaved and normalized attributes, malformed geometry,
  annotation revision/asset/node, file/decoded budgets, repeated switches, absent
  files/codecs, source mismatch and blocked external/unsupported resources.
- A real Meshopt decode is deliberately delayed while a new LOD is requested. The
  new job waits for the bounded decode slot instead of allocating parallel models. The old
  scene is disposed, returns AbortError and cannot replace the current model.
- CLI output matches the fixture build report byte-for-byte; a fresh fixture
  generation reproduces all artifact hashes and manifest bytes.
- Production-browser harness passes with all non-loopback traffic blocked. Actual
  canvas clicks select the nearer overlay; hiding it reveals the correct underlying
  ID. LOD and keyboard selection work. Missing codec (WebAssembly unavailable),
  absent/corrupt files and WebGL failure preserve DOM selection. No page errors.
- Earlier phase 0/1 and 2/3 browser suites pass, including native-rate held samples,
  null/finite/null, alarms, source isolation, stale/reconnect, genuine context-loss
  recovery, deliberate confirmation and local-note hash verification.
- One initial concurrent dev run reported an R3F context error with shared Vite
  caches. Harnesses now use private dependency caches outside git. The old suite
  then passed in isolation and both suites passed concurrently. Cache contention
  is the working explanation; no result was hidden by weakening assertions.
- TypeScript lint, production build and required fast probe/Cargo check/Clippy pass.
  No Rust code changed; full Rust tests were not repeated or claimed as a new run.

Tests use real geometry/loader behavior and controlled failure injection. No actual
female donor model, wearable device, Tauri window or clinical validation is implied.
UI guidance follows existing conventions and general accessibility rules; the local
ui-ux-pro-max CSV catalog was absent, so no database-derived design recommendation
is claimed. Browser screenshots were inspected; later formal accessibility/mobile
qualification is still required.

## Phase gate

The controlled-fixture phase 5 gate is met: identities survive batching, compression
and LOD; hidden geometry cannot steal hits; local failures preserve 2D controls;
repeated switches stay bounded; the built tool works offline with packaged credits.
This enables phase 6 real male reference integration. Phase 4 licensing/provenance
holds, female source gaps, actual registration and anatomical review remain open.
