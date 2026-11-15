# Phase 5: offline conversion and semantic picking

Date: 2026-11-15. Baseline 30f6e45, dedicated branch work/MiServeRDC-greenfield-phase01.
No main merge/push or hosted Actions. Phase 4 source/license gaps remain open.

Offline Node tooling extracts selected static triangle meshes from a hash-pinned
local GLB and authored spec. Bake explicit source-to-model/world transforms, correct
reflection winding/normals, retain original source identifiers, validate topology,
and emit per-layer plain/Meshopt GLBs with two LODs, hashes, credits and metrics.
Pin the already installed meshoptimizer 0.18.1 for build tools. No CDN decoder.

Runtime uses an owned, single-model session with abortable fetch, declared extension
and hash checks, no external glTF resources, stale-result disposal and deterministic
geometry/material cleanup. Mid-call decode cannot be interrupted; late data must
never publish. No unbounded global cache. Visible structures are batched by layer;
per-triangle ID ranges support bounded ray picking and retain semantic identity
across compression/LOD. Hidden geometry cannot render or intercept selection.

A separately labelled synthetic fixture inspector supplies DOM selection, layer
visibility and LOD controls plus an optional 3D view isolated from the cockpit.
Expose through an optional tool; it is not a real female atlas or a physiological
profile. Model selection never mutates What-If/telemetry. Model-revision and metre
coordinate annotation anchors stay local to their source model.

Acceptance: deterministic rebuild; real GLTFLoader decode for plain/Meshopt/LOD;
reflection/left-right and stable-ID tests; actual ray picking after batching;
hidden-front rejection; missing files/decoder keep DOM usable; rapid switching
and repeated load/unload bound owned resources. Production preview works with
all non-loopback traffic blocked. Report actual sizes/decoded bytes/decode timing,
not a presumed compression improvement. Re-run frontend tests/lint/build, browser
regressions and fast probe; update memory and commit locally. Large originals,
logs and measurements stay outside git. No source-license clearance is inferred.
