# Offline anatomy conversion and semantic renderer

Phase 5, 2026-11-15. Implementation branch only; source approval remains the
[phase 4 inventory](../anatomy/SOURCE_DECISIONS.json). This pipeline does not establish
anatomical correctness, donor compatibility or clinical validity.

## Build-time flow

`ares-cockpit/scripts/convertAnatomy.mjs` takes an immutable local GLB, an authored
extraction spec and a separate output directory. Source SHA-256 must match. The
spec records source URL, credit, license and an explicit reuse-review declaration;
that declaration is a curator input, not an automatic legal clearance mechanism.
The shipped spec authorizes only the original synthetic fixture.

Each structure names exact source node indices **and** original names. The loader's
node/mesh/primitive associations retain identities even when Three.js sanitizes
names or one concept has multiple meshes. Selecting overlapping source hierarchies
for different structures fails instead of assigning one mesh two meanings.

Only static embedded triangle geometry is accepted. Textures/external resources,
skinning and morph targets require a future explicit adapter. Clone numeric input,
materialize interleaved/normalized attributes as Float32, bake the node world matrix
and a column-major affine source-to-model transform, fix winding after reflection,
and normalize normals. Check finite attributes, normal dimensions, nonzero normals,
valid indices and nondegenerate triangles. The original source file stays unchanged.

Exact position/normal deduplication introduces no distance threshold. LOD
simplification runs per structure, preserving its ID and source association.
Unreferenced vertices are compacted after simplification. The authored relative
error policy and observed simplifier errors are recorded; the fixture's 0.05 policy
is a demonstration setting, **not a tolerance approved for real anatomy**.

For every layer/LOD, emit plain GLB and EXT_meshopt_compression GLB, along with
hashes, bytes, triangle/decoded attribute counts, source identities and tool versions.
Output numeric geometry is in metres; export discards source render materials/UVs.
All LOD geometry is validated before writing artifacts; the build report is written
last. Filesystem failures during publication still require regeneration/hash checks;
this is not a transactional multi-file store. Three.js r171 and meshoptimizer 0.18.1
are pinned in the project lockfile. Original files and large datasets stay outside
normal repository distribution; the small original fixture is intentionally shipped.

## Runtime ownership and selection

`AnatomyModelSession` owns one current model's chunks, normalized geometry and
layer batches. Fetches accept only packaged `/anatomy/*.glb` paths, verify full file
hashes and declared extensions, reject external glTF resources and preflight
file/decoded/instance budgets. File streaming stops at the byte limit, including
responses without a length header. Byte budgets include model geometry and the
indexed display batches (since phase 6); they are engineering configuration, not clinical values.

A shared per-document fetch/decode gate serializes active asset decoding. Waiting
obsolete jobs are removed on abort, preventing rapid switches from accumulating
parallel decoded models. A new load aborts the previous fetch and releases its resources. Decode is not
interruptible mid-call; a generation check disposes a late scene and prevents
obsolete publication. Failed/aborted partial loads dispose their parts. No global
model cache or per-model worker pool is retained. The bundled decoder has its own
bounded process-level WASM module; it does not fetch a CDN or load a Python runtime.

Visible structures are merged by layer into one batch each. Batches hold sorted
triangle ranges to stable semantic structure IDs. Ray hits resolve a range with
binary search; hidden structures are omitted from batches and invisible batches
are excluded before raycasting. LOD/codec changes preserve the IDs. This method
bounds candidates by loaded layers/triangles; it is not an asymptotic BVH claim or
a performance certification for a full atlas. Larger atlases need measured chunking
and picking budgets in phases 6/9.

Replacing visibility/LOD releases old batch geometry/materials. Import resources
are disposed after extraction. The viewport owns controls, renderer, context and
resize/listener cleanup; it does not also dispose session-owned geometry. Metrics
separate decoded numeric bytes, owned object counts, renderer geometry counts and
warm decode timings. These do not measure physical GPU VRAM or total browser RSS.

## Optional reference laboratory

Open the command palette and choose **Open anatomy pipeline lab (synthetic reference
only)**, or visit `/anatomy-lab` on the local cockpit server. The page uses synthetic
calibration solids, not a new body model. It exposes independent reference/none,
LOD, codec, visibility and keyboard selection controls, plus actual ray selection.
Its standalone reference state never receives What-If or patient measurements.
Existing physiological-profile controls in the main cockpit are unchanged.

Manifest identity is validated by the phase 3 registry. New coordinate anchors bind
to model revision, exact asset hash, output node and metre coordinates. Registry
filtering rejects stale/mismatched anchors. The lab shows a picked coordinate; it
is not a durable clinical annotation editor. Full annotation UX remains phase 6.
Missing files/codecs or renderer failure keep the DOM controls available; normal
cockpit vitals/playbooks remain in the original document. All optional modules,
geometry, decoder and credits are packaged locally. The fixture is CC0; bundled
Three.js/Meshoptimizer notices remain MIT. Real-source restrictions are unchanged.

## Commands

```bash
npm --prefix ares-cockpit ci --ignore-scripts --no-audit --no-fund
npm --prefix ares-cockpit run anatomy:fixture
npm --prefix ares-cockpit run anatomy:convert -- /path/source.glb /path/spec.json /path/separate-output
npm --prefix ares-cockpit run anatomy:measure > /tmp/ares-anatomy-measurement.json
npm --prefix ares-cockpit test
npm --prefix ares-cockpit run lint
npm --prefix ares-cockpit run build
```

Browser qualification uses external `PLAYWRIGHT_MODULE` and `BROWSER_PATH` paths:
`node scripts/verify_anatomy_pipeline_browser.mjs`. It serves the **built** bundle,
blocks all non-loopback requests and writes results/screenshots outside git.
Earlier cockpit harnesses have isolated Vite dependency caches per invocation.
No hosted GitHub Actions is needed.

Primary API references:
[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html),
[Three.js cleanup](https://threejs.org/manual/en/cleanup.html),
[Meshoptimizer JavaScript APIs](https://github.com/zeux/meshoptimizer/tree/v0.18/js),
[EXT_meshopt_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression).

## Phase 6: existing reference catalog and viewer

`npm --prefix ares-cockpit run anatomy:catalog` reproduces
`public/anatomy/reference-catalog.json` from the original five hash/byte-pinned
GLBs and the phase 4 inventory. It emits metadata, not new mesh derivatives. Each
mesh-bearing glTF node owns a stable system/node ID. Multi-primitive nodes retain
that identity for every primitive. An unnamed node uses its nearest named ancestor
plus the explicit node index as a display label; this is not ontology validation.
Groups are the exact source descendants, including vascular tributaries. Clinical
bindings are context-only and never certify that each descendant is the named
parent organ. Required anatomical review remains open.

The legacy load path validates every raw node index/name and complete mesh-node
coverage against the verified file. It resolves GLTFLoader parser associations,
not sanitized Three.js display names. It excludes explicitly VH_F-labelled nodes
and descendants from this existing male reference. Invalid normalized primitives
are quarantined with exact node/reason; other valid primitives of the same node
may remain, visibly marked partial. Nothing is silently repaired, synthesized or
relabelled as native. The strict fixture conversion path still rejects invalid
geometry. Missing optic sheath remains an explicit empty target.

`/anatomy` lazily loads one system at a time in a session with no global model
cache. Indexed batching directly allocates position/normal/index buffers and
triangle-to-source ranges without expanding vertices or cloning intermediate
batches. The geometry budget remains 64,000,000 bytes; visibility updates reserve
both old and replacement batches before publishing. A failed update retains the
old view. Equivalent visibility is a no-op. All muscle source geometry fits but
its full display copy does not: the default shows soleus, while other muscles can
be searched and isolated. The budget accounts for owned CPU geometry attributes
and indices, not total browser heap, decoder scratch space or VRAM.

Search, paginated source list, source detail, group focus, isolate/hide/default,
auto-fit camera and real pointer/touch ray selection share exact IDs. The viewport
also accepts keyboard arrows (pan), Control + arrows (rotate), and Enter (a real
ray through the center cross). DOM list selection creates no fabricated point.
Source geometry, optional WebGL and telemetry have independent availability.

Notes require a picked surface and bind to catalog revision, asset SHA, raw node
and reference-frame coordinates. They are localStorage-only, scoped by revision,
limited to 500 records and 2,000 text characters each, and deletable. Invalid JSON,
unsupported storage and failed writes are explicit. No clinical action or
cross-model coordinate transplant results from a note. glTF metres are not a
patient calibration or a physical registration report.

Clinical detail uses the existing telemetry hook and null-preserving display
adapter, with source/model status and stale/held state. Unsupported channels stay
unavailable; HRV is not inferred from heart rate. Kidney context may show supplied
renal outputs without inventing a Kidney backend region. A validated
`?phase=EVALUATE&anatomyRegion=...` link selects only one of the five existing wire
regions. Neither the reference selection nor this link carries sex or What-If
parameters. No stress-test POST is issued by the atlas.

Run `node scripts/verify_anatomy_reference_browser.mjs` with the same external
Playwright/Chrome paths as above. It uses the built bundle, blocked external
network and mocked local telemetry; assertions cover real rays, keyboard anchors,
touch, null channels, notes, failures, switching and unload. Expert anatomical
review and source-specific commercial clearance are separate outstanding gates.

## Phase 7: partial female sources and explicit frame isolation

`ReferenceInspector` can switch between the existing male reference and the partial
HRA female catalog. Model changes clear selection/coordinates and keep notes in
revision-specific localStorage. They do not change clinical sex or What-If.
Unavailable muscular source geometry loads no replacement; source coverage and
invalid primitive records remain explicit. UI source lists can operate without
WebGL. The female source exposes a v1.5 pelvis supplement as its own selection,
not an assembled overlay.

`AnatomyChunk.referenceFrameId` records authored source frame identity. A session
rejects mixed IDs (including known + unknown); it cannot combine the new v1.10
and v1.5 chunks into an unregistered composite. The existing legacy/fixture chunks
retain their prior unknown/common-frame behavior. Original source frame identity
is not patient calibration. The female nervous source includes Allen-labelled
contributions; `sourceSex: UNSPECIFIED` avoids assigning unreviewed contributor
sex from the enclosing release name. All source structures stay `UNVERIFIED`.

The derivative builder checks original file bytes/hash and raw node identities,
loads selected scene branches with ancestors/transforms retained, and reuses the
strict numeric normalizer and static GLB writer. Invalid primitives are listed;
no repair or simplification occurs. Each artifact is under the existing 16 MB
encoded limit and fits the unchanged 64 MB owned-geometry budget. The ledger
records full original SHA, source node/mesh/primitive, selected root, derivative
hash/size, builder/normalizer/pipeline fingerprints, tools, credits and adaptations.
Raw originals stay in the external cache; runtime has only local assets.

Build/qualification commands and outstanding gates:
[Female source and registration review](../anatomy/FEMALE_REGISTRATION_REVIEW.md).
The explicit source-build verifier requires the external originals; ordinary
frontend tests validate bundled derivatives without downloading those originals.
The focused human acceptance sheet and Denver import remain open.
