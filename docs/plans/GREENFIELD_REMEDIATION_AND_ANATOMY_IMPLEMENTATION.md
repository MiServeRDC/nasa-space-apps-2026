# Greenfield cockpit remediation and reference anatomy implementation plan

Date: 2026-11-15. Status: **phases 0-2 and phase 3 contracts delivered; phase 4 inventory complete with gaps; phase 5 controlled pipeline complete; phases 6-10 pending**.
Scope: `ares-cockpit/`, its wire-contract boundaries and reproducible asset tooling.
Reviewed frontend: `feat/cockpit-greenfield-awwwards` at `e4e7531`, based on `3516da4`.
Compared main during review: `2314b5a`. Refresh both refs before implementation.

This plan combines the findings in [the frontend review](../evaluation/GREENFIELD_FRONTEND_REVIEW.md)
with the requested male/female anatomical coverage. It preserves the spatial visual
direction while putting data correctness, resilient 2D operation and anatomical
provenance ahead of additional visual effects. It does not introduce medical
thresholds, establish clinical effectiveness, or authorize automatic main merge.

Implementation evidence: [phases 0-1 results](../evaluation/GREENFIELD_PHASE01_RESULTS.md) and [phase 2/3 contract results](../evaluation/GREENFIELD_PHASE23_RESULTS.md).

Phase 4 evidence: [source inventory results](../evaluation/GREENFIELD_PHASE4_RESULTS.md).

Phase 5 evidence: [conversion and picking results](../evaluation/GREENFIELD_PHASE5_RESULTS.md).

## 1. Evidence and corrections to the supplied research brief

Verified on 2026-11-15:

- Current repository attribution describes five generic **male** Z-Anatomy GLBs,
  reused for both scenario profiles. Their pinned derivatives retain CC BY-SA 4.0.
  Changing a procedural silhouette is not adding a female reference atlas.
- The official HRA portal manifest links the female v1.10 GLB and crosswalk.
  The asset HEAD request succeeds and reports **374,505,632 bytes**. The linked
  v1.10 metadata landing URL returned 404 during this check; capture asset identity,
  release metadata and licensing explicitly instead of assuming every link works.
- The official female crosswalk has `node_name`, `OntologyID`, `label`. Text queries
  found no explicit vagus, jugular, soleus or calcaneus entries. This is an inventory
  warning, not proof that every relevant mesh is absent; inspect the scene too.
- The downstream Human-Atlas project's 1,220 female structures describe an assembled
  result, including supplements. Do not use that number as native HRA coverage.
  Its author documents imported muscle and male-derived borrowed bones separately.
- Andreassen et al. (2023) and the University of Denver dataset document female
  lower-limb STL geometry, including soleus and calcaneus, under CC BY 4.0. The
  final female STL package is listed as 87.8 MB; downloading all image volumes is
  unnecessary for this viewer task. Cross-project registration remains to validate.
- Official BodyParts3D database terms were updated on 2025-02-27 to CC BY 4.0.
  This does **not** relicense the Z-Anatomy-derived GLBs already in this repository.
- EBI OLS confirms the supplied six existing terms: eye `UBERON:0000970`, brain
  `UBERON:0000955`, heart `UBERON:0000948`, internal jugular vein `UBERON:0001586`,
  soleus muscle `UBERON:0001389`, calcaneus `UBERON:0001450`. Eye is not a synonym
  for optic nerve sheath; the composite soleus/calcaneus backend region is not one
  anatomical structure. Preserve that distinction in the new registry.

No large anatomy model, image volume or new production asset was downloaded for
this plan. GitHub star counts, promotional scores and unverified structure counts
are not selection criteria. Exact missing-source coverage remains a Phase 4 task.

## 2. Architectural decisions

### A. Three independent domains

1. **Clinical state:** backend-derived observations, model outputs, validity,
   timestamps, source/session/revision, units and validation status.
2. **Reference anatomy:** structures, identifiers, hierarchy, geometry, provenance,
   source sex, transforms and coverage. Geometry is not a patient observation.
3. **Presentation:** phase, selection, layers, camera, quality and presentation mode.

Changing an atlas model must not silently change measurements or physiological
parameters. Changing a What-If profile must not relabel its projections as measured
values. Existing MALE/FEMALE controls need distinct atlas and scenario semantics;
model sex is reference metadata, not a diagnosis, patient identity or permission.

### B. Typed data adapter and separate preview

Use the latest main transport/freshness logic. Derive a typed view model containing
value-or-unavailable, quantity/unit, observation time, provenance, model status and
abstention reason. Do not scatter `packet.value ?? scenario.value` through clinical
components. Use a separate, explicitly labeled preview model for counterfactuals.
Do not map an absent forecast channel to the first available cone. Never interpret
HR in bpm as dimensionless rho. Do not repair missing predictions by inventing a
confidence envelope in an empirical view.

### C. Semantic registry independent of rendering batches

Use stable `structureId` values, original source identifiers, optional validated
UBERON/FMA mappings, laterality, parent/system membership, mesh references and
provenance. One concept may map to multiple meshes and one ARES functional region
may refer to multiple concepts. Keep a separate clinical-binding table; a vagus
mesh does not make RMSSD available, and no observation means no normal/safe color.

Keep the five existing backend region IDs compatible. Add kidney/lung structures
to the frontend anatomy tree without pretending they are already new backend
hypergraph nodes. Any new backend region is a separate versioned contract change
with Rust/JSON/binary/MCP compatibility work, not a by-product of importing a mesh.

### D. Two rendering paths, one identity model

- Batched or merged display geometry for efficient drawing.
- A bounded picking representation (per-structure geometry/BVH or documented ID
  picking) retaining the same semantic IDs and visibility rules.

Do not disable anatomical picking to reach a draw-call target. LOD must preserve
structure identity. Invisible layers cannot capture clicks accidentally. Annotations
must bind to a structure and model-local coordinates plus model revision, rather
than only hardcoded world-space points. Switching models must explicitly migrate
or mark unavailable any annotation without a valid counterpart.

### E. Two reference atlases, not an unverified morph

Different-source male/female organs do not generally have matching topology.
Load distinct atlas assets; do not interpolate unrelated vertex/index arrays.
A lightweight procedural silhouette may remain as a clearly identified overview.
If a display transition uses a fade, bound concurrent GPU residency and preserve
an explicit selection correspondence. The current procedural morph must not be
presented as subject-specific or complete sex-specific internal anatomy.

### F. Offline build pipeline and packaged runtime

Keep original GLB/STL archives outside git in a content-addressed local source
cache. Produce deterministic, versioned runtime chunks, manifests and credits.
No CDN or asset download is required at application runtime. Installers/offline
bundles must include required chunks, fonts and codec decoders before launch.
Use existing Node tooling and optional Blender build-time conversion as needed;
Blender/Python is not an application runtime dependency. A `.blend` intermediate
is optional, not the product contract.

Evaluate Meshopt/Draco with actual decoded sizes, identity preservation and local
loader support. Keep the current codec for unchanged assets until a measured
alternative is justified. Do not force five enormous monolithic GLBs when smaller
system/region chunks provide better startup and memory behavior.

## 3. Required anatomical coverage matrix

Every mandatory row needs an asset inventory result for each reference model:
`native`, `adapted_same_sex`, `borrowed_other_reference`, `schematic`, or `missing`.
Record missing coverage honestly; never make a procedural placeholder satisfy a
real-reference requirement. Native/adapted does not mean clinically validated.

| Domain | Distinct structures required | Male candidate | Female candidate / unresolved work | ARES binding limitation |
|---|---|---|---|---|
| Neuro/vestibular | Brain, CNS/spinal context, vestibular context | Existing nervous GLB, inventory needed | HRA CNS; audit vestibular coverage | A brain-region model output does not measure every displayed subregion |
| Neuro-ocular | Eye, optic nerve, distinct sheath/ONSD target where available | Nervous + visceral inventory | HRA eyes; nerve/sheath geometry and mappings must be checked | Generic eye mesh does not support anatomical ONSD measurement |
| Autonomic | Vagus/autonomic pathway | Inventory current nervous GLB | No explicit v1.10 vagus crosswalk match; find a verified source or retain a declared gap | HRV requires actual beat intervals; no vagus activity inference from mesh |
| Cardiovascular | Heart, left/right IJV, main arterial/venous tree | Existing cardiovascular GLB | HRA heart/vessels; IJV coverage not established by checked crosswalk | Flow/thrombus states retain source and validation flags |
| Lower-limb muscle | Soleus, separated from other calf structures | Existing muscular GLB | Andreassen female final STL candidate | Load-related visualization, not individualized muscle diagnosis |
| Lower-limb skeleton | Calcaneus and femur as distinct structures | Existing skeletal GLB | Andreassen female final STL candidate, registered to target | Do not treat soleus and calcaneus as interchangeable mesh IDs |
| Axial/pelvic skeleton | Spine and pelvis; optional ribs/skull context | Existing skeletal GLB | HRA native coverage; v1.5 pelvis supplement only after alignment check | Any borrowed skeletal completion must be visibly labeled |
| Renal | Separate kidneys and relevant collecting-system context | Existing visceral GLB | HRA renal assets/crosswalk | Bind only to available renal DTO fields; not all regions have measurements |
| Thoracic | Separate lungs, heart and thoracic visceral context | Existing visceral/cardiovascular GLBs | HRA thoracic assets | No lesion localization or eFAST diagnosis invented from generic geometry |

Additional UBERON/FMA terms must be checked against an authoritative ontology;
source names and fuzzy string similarity alone are not sufficient for mapping.
Keep human-reviewed exceptions with reasons rather than assigning wrong IDs.

## 4. Phases, deliverables and acceptance gates

Each phase must leave a reviewable artifact and pass its gate. Ownership is a
proposed responsibility split, not an automatic reassignment: frontend owner for
UI/3D, backend owner for contracts, data/anatomy reviewer for sources and registration.
No additional agents or delegation are required by this plan.

### Phase 0 — Freeze baseline and establish the integration branch

**Dependency:** none. **Output:** reproducible baseline and integration checklist.

- Refresh main and Fabio's branch; record exact SHAs and clean/dirty states.
- Start a dedicated integration branch/worktree. Preserve all current backend,
  transport, storage, source-mode and gate fixes. Resolve App deliberately.
- Keep review reproduction artifacts outside git; add persistent regression cases.
- Inventory licenses, model hashes, decoded geometry statistics and missing systems.
- Name the desktop/mobile hardware and browsers to measure. Define provisional
  engineering budgets from baseline measurements, not medical constants or claims.

**Gate:** build/lint and current tests run against pinned refs; merge conflicts and
missing tests listed. Known failures are recorded as failing regressions or a
clearly marked known-failure suite. No main push and no hosted Actions.

### Phase 1 — Correct clinical values, forecasts and source boundaries

**Dependency:** 0. **Output:** shared typed view model and real UI regressions.

- Remove empirical MRI/rho and predicate fallbacks to scenario calculations.
- Audit nominal substitutions in environment, radiation, imaging and HRV panels.
- Match forecast channels and units exactly; display unavailable/abstained when
  absent. Keep unsupported long horizons absent. Label any preview separately.
- Bind actual backend fields, freshness and model validation status per panel.
- Preserve native sample cadence vs 20 Hz refresh; source changes reset histories
  as required by current main. Do not reimplement an older useTelemetry snapshot.

**Gate:** valid input with MRI/rho null renders unavailable, never the local 62%
scenario value; HR-only cones cannot appear under a rho label; missing O2 is not
shown as measured normoxia. Reconnect/out-of-order, hardware/replay/preview and all
15 playbooks pass component/browser regressions with current contracts.

### Phase 2 — Resilient 2D cockpit and deliberate action confirmation

**Dependency:** 1. **Output:** operational DOM shell isolated from optional features.

- Put optional 3D behind capability detection, lazy loading and an error boundary.
- Keep vitals, alerts, playbooks and input controls usable without initial WebGL,
  after context loss, on decoder failure and on failed model loading.
- Separate reduced-motion animation settings from the 1.5 s action confirmation
  rule; keep equivalent pointer/keyboard confirmation or an explicit accessible flow.
- Require local ASR through supported desktop/on-device paths; unsupported voice
  falls back to typing, never silently remote browser recognition.
- Make local notes/preview distinct from backend-acknowledged execution. Verify
  hashes using the canonical record format or label link continuity accurately.
- Ensure presentation/demo mode cannot weaken gates, freshness or provenance.

**Gate:** no WebGL still shows a working monitor; recoverable failure does not
unmount root; short clicks cannot confirm in either motion mode; rejected ASR never
starts a remote fallback; edited audit content fails true hash verification.
Tests use actual components/hook behavior, not only source regex matching.

### Phase 3 — Define anatomy identities, clinical bindings and coverage contracts

**Dependency:** 0; renderer integration waits for 2. **Output:** registry/schema ADR.

- Define `AnatomyModelManifest`, `AnatomicalStructure`, `ClinicalStructureBinding`,
  model coverage and annotation records. Draft filenames are proposed, not existing APIs.
- Manifest fields include schema version, model/reference identity, source version,
  source sex/laterality, source URL/hash, per-asset license/credit, source concept,
  optional validated ontology, unit/axis transforms, adaptation/registration
  provenance, LOD/chunk/picking references and per-structure availability.
- Keep anatomy availability independent from clinical availability, confidence
  and backend model status. Do not color missing clinical observations as normal.
- Separate atlas selection from What-If physiological profile controls.
- Define model-switch behavior for selection, annotations, visibility and camera.

**Gate:** schema fixtures cover many-mesh concepts, compound ARES regions, missing
female structures, borrowed references, unknown IDs and null clinical channels.
A kidney can be selected without inventing a backend Kidney region. Model/scene
selection does not alter physiological values.

### Phase 4 — Approve exact sources and create the ingestion manifest

**Dependency:** 3. **Output:** source ledger, inventory and coverage decision.

- Keep existing pinned male GLBs and their CC BY-SA credits initially.
- Pin exact HRA v1.10 asset/crosswalk and license evidence; inventory required nodes.
- Evaluate v1.5 pelvis pieces without assuming identical transforms.
- Use the final female STL package and metadata from the official Denver record
  for soleus/calcaneus candidates; avoid downloading imaging volumes unnecessarily.
- Check IJV, vagus, optic nerve/sheath and vestibular structures explicitly. If
  missing, search an appropriate licensed source; do not claim full coverage.
- Evaluate Human-Atlas conversion/picking approaches and attribution as references.
  Its supplements are not native HRA anatomy. Do not copy its viewer wholesale or
  import fixed transforms/error tolerances without validating our data and project rules.
- A future direct BodyParts3D CC BY pipeline is a separate optional male asset
  replacement, not a prerequisite and not relicensing of existing derivatives.
- Avoid academic/noncommercial-only models as shipped dependencies unless a
  separately verified compatible permission exists. Surface rigs alone cannot
  replace the requested vascular, nervous and visceral coverage.

**Gate:** each mandatory structure/model has confirmed source evidence or an
explicit unresolved gap. Unknown licensing blocks only that asset. A full female
coverage milestone cannot be marked complete while mandatory source gaps remain.
Record distinctions between article licensing, dataset licensing and code licensing.

### Phase 5 — Reproducible offline conversion and semantic picking renderer

**Dependency:** 2, 3, 4. **Output:** tooling, manifests and a small fixture model.

- Normalize axes, scale and handedness with explicit matrices and test left/right.
  Keep original data immutable and processing/version logs reproducible.
- Extract selected structures, preserve source IDs, validate normals/topology,
  create LODs and packaged chunks, and report decoded CPU/GPU footprint.
- Implement display batching plus bounded semantic picking; retain IDs across LOD.
- Bundle decoders locally and validate GLB/extension support. Meshopt/Draco changes
  need actual size/decode/memory comparisons, not a compression assumption.
- Provide cancellation, error handling, cache ownership and deterministic disposal.
  Limit simultaneous models; cancel obsolete loads on model/layer changes.
- Package credits and per-asset adaptation information with the offline app.

**Gate:** fixture structures remain selectable after batching/compression/LOD;
hidden meshes do not steal clicks; missing files/codecs preserve the DOM shell;
repeated toggles do not leave increasing resident resources. A clean offline
bundle works with all non-loopback network disabled. Raw 375 MB GLBs stay out of git.

### Phase 6 — Complete and verify the existing male reference atlas

**Dependency:** 5. **Output:** five selectable anatomical systems and bindings.

- Support skeletal, muscular, cardiovascular, visceral and nervous layers; the
  current three stage toggles do not expose all five existing assets.
- Verify required structures from the coverage matrix by source mesh identity.
- Add isolate/search/selection/detail and precise annotation on actual structures.
- Bind only supported ARES outputs; generic geometry remains a reference.
- Test soleus vs calcaneus separately, IJV vs nearby vessels, eye vs sheath target,
  brain vs autonomic context, and kidney/lung selection.

**Gate:** agreed tasks work by mouse, keyboard and touch; selection maps to the
right ID and panel; absent physiological channels stay unavailable. No requirement
is satisfied by a nearby but different mesh or an unreviewed name match.

### Phase 7 — Assemble the female reference with explicit registration provenance

**Dependency:** 5 and approved female-source inventory; compare against 6 contracts.
**Output:** distinct female assets, transform reports and anatomical review sheet.

- Import HRA structures into their own model. Add only verified v1.5 supplements.
- Register female lower-limb structures against shared anatomical landmarks;
  solve/document orientation, uniform scale and translation where appropriate.
- Check independent landmarks, left/right and spatial relationships, not only
  bounding boxes. Report residuals in physical units and transformations per donor.
- Do not assume common coordinates or subject identity because sources cite Visible
  Human. Never copy another repository's fitted scales or residual thresholds.
- Keep donor/adapted structures separate and inspectable. Borrowed male completion,
  if retained for optional context, is visibly labeled and does not satisfy a native
  female coverage requirement. Native female feet should be assessed from the
  lower-limb dataset before borrowing male foot bones.
- No unsupported topology morph; missing counterpart clears/marks selection or
  annotation rather than moving it to an unrelated structure.
- Obtain focused anatomy/domain review of required structures and assembly.
  Treat the result as a composite reference atlas, not an individualized scan.

**Gate:** female structures meet the source/coverage matrix, transforms and review
are recorded, and unsupported anatomy is explicit. Failed registration or missing
mandatory IJV/vagus/sheath coverage leaves that subtask open; no fake female mesh
or cosmetic silhouette closes it. A minimum HRA+lower-limb preview can be delivered
with visible limitations, without calling the complete female milestone finished.

### Phase 8 — Operational UX, mobile layout and presentation mode

**Dependency:** 1, 2; anatomy-specific polish after 6/7.
**Output:** desktop triage, compact/mobile and presentation layouts.

- Keep the visual identity but reduce simultaneous microcopy and clipped titles.
- Make current problem, evidence, missing data and next permitted step prominent.
- Use progressive disclosure for derivations, codes, ontology and debug diagnostics.
- Separate the cinematic rotating-body mode from a quieter operational layout;
  both use the same authoritative state and gates.
- Fit the canvas/camera to its local aperture at each breakpoint. Move hotspot
  and layer controls outside the body region on mobile; prevent copilot overlap.
- Preserve focus restoration, accessible labels, input escape behavior, touch
  targets, zoom/reflow and reduced motion. Typography targets are design choices,
  not claims that a particular font size certifies accessibility.

**Gate:** 1440, 1024, 768 and 390 px plus narrow landscape and browser zoom tested;
no essential content is occluded or reachable only by manipulating the 3D. A user
can inspect an alert, identify missing data and reach the permitted action in 2D.
Mobile screenshots include actual scrolled stage view, not only full-page capture.

### Phase 9 — Measure and optimize resources

**Dependency:** 5, 8; final profiling includes both 6 and 7 assets.
**Output:** reproducible performance report and configurable quality policy.

- Preserve latest main's paused-unused-simulator and coherent publication fixes.
- Lazy-load optional panels/anatomy; vendor chunking alone is not lazy loading.
- Stop covered/offscreen/hidden 3D rendering without throttling alarms or ingest.
- Remove measured RAF allocations in waveform segmentation or redraw on revision;
  make zero-allocation claims only for measured paths. Reuse resources deliberately.
- Profile startup main/total JS, optional assets, decode peaks, heap/VRAM proxies,
  frame-time percentiles, long tasks, draw calls and resource retention after reuse.
- Support low-resource 2D/low-detail, standard and detailed modes. Hardware hints
  may choose an initial tier; observed pressure and user choice govern adaptation.
- Approve explicit budgets after Phase 0 measurements; distinguish an engineering
  target from measured compliance. Do not hide warnings by raising thresholds.

**Gate:** named hardware/configurations meet the agreed budgets, quality changes
preserve measurements and selection IDs, long runs remain bounded and context
recovery works. No universal-device, battery, FPS or RAM percentage claim without
measurement. Offline completeness is tested with optional chunks too.

### Phase 10 — End-to-end qualification of software and controlled integration

**Dependency:** all applicable earlier gates.
**Output:** regression report, coverage/credits bundle and reviewable PR(s).

- Repeat the four proven UI failures: null fallback, wrong forecast channel,
  reduced-motion confirmation and unavailable WebGL. All must be fixed behaviorally.
- Verify live/replay/hardware/preview provenance, native snapshot ordering, stale
  state, reconnect, all 15 playbooks and current backend safety-gate regressions.
- Test model switching/layers/search/picking/annotations, absent structures,
  donor labels, malformed/failed loads, offline ASR and real audit semantics.
- Run actual browser and available Tauri checks; label mocks as mocks. Verify 2D
  on unsupported WebGL and low-resource hardware separately from desktop 3D.
- Run frontend tests/lint/build; changed Rust crates and required workspace checks;
  fast probe before every commit/PR. Hosted Actions stays disabled.
- Record SHA, dirty state, exact commands, data/asset hashes, hardware, pass/fail/
  skipped results and limits. No old PASSED report standing in for a failed run.
- Separate application licenses from geometry licenses and retain attribution.
- Publish a review branch/PR with rollback instructions. Main merge is a subsequent
  explicit release decision; no force push and no direct main push.

**Gate:** zero known P1 regressions in delivered scope; all mandatory anatomy rows
resolved or explicitly deferred as unfinished scope. No clinical calibration,
certification, anatomically complete-person or award-readiness claim is inferred.

## 5. Delivery milestones and dependencies

| Milestone | Included work | Reviewable result |
|---|---|---|
| M1: trustworthy cockpit | 0-2 | Correct data, intentional confirmation, 2D fallback and offline voice policy |
| M2: semantic anatomy foundation | 3-5 | Verified source inventory, registry, picking and reproducible pipeline |
| M3: usable male reference | 6 | Five systems, precise selection and annotations |
| M4: female reference | 7 | Actual female source geometry, registration evidence and explicit coverage |
| M5: product integration | 8-10 | Mobile/operational layouts, measured resources and end-to-end release evidence |

Phase 3 source/ontology planning can progress independently of the Phase 1 fixes;
loading/model work must use the safe Phase 2 shell and Phase 3 contracts. Do not
make the trustworthy cockpit wait for unresolved optional anatomical completion.
Do not label M4 complete merely because a female silhouette is displayed.

## 6. Source register

Access date for all entries: 2026-11-15. Recheck exact versions before acquisition.

- S1: [HRA reference library](https://humanatlas.io/3d-reference-library) and its
  [official portal manifest](https://humanatlas.io/assets/content/3d-reference-library-page/data.yaml).
  [Female v1.10 asset](https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.10/assets/3d-vh-f-united.glb)
  was HEAD-checked only; [crosswalk](https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.10/assets/crosswalk.csv)
  was inspected. [Upstream library](https://github.com/hubmapconsortium/ccf-3d-reference-object-library)
  identifies CC BY 4.0. No full scene topology inspection performed here.
- S2: Andreassen et al., [Scientific Data 10, 34 (2023)](https://doi.org/10.1038/s41597-022-01905-2),
  [open full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC9849470/) and
  [official female dataset](https://digitalcommons.du.edu/visiblehuman/1/), dataset
  DOI 10.56902/COB.vh.2022.1. SimTK access returned 403 in this check; the institutional
  record supplies package listings and dataset reuse terms.
- S3: [BodyParts3D official terms](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html),
  updated 2025-02-27. [Z-Anatomy terms](https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/master/License.txt)
  and existing local ATTRIBUTION/MANIFEST govern current derivative assets.
- S4: [Human-Atlas README](https://github.com/slorksmo/Human-Atlas/blob/main/README.md),
  inspected blob caf50ba37560351d668cba98d367c71c05f3e9a8;
  [attribution](https://github.com/slorksmo/Human-Atlas/blob/main/public/ATTRIBUTION.md),
  blob 3c85dbc77fae52bc34d680a5431392208d29954f;
  [lower-limb importer](https://github.com/slorksmo/Human-Atlas/blob/main/scripts/import-lower-limb.mjs),
  blob 34983dff8c6463d44c256c25714ac2e417ce7063. Repository-author assembly claims
  guide investigation, not independent anatomical validation. Pin repository commit
  and all reused files before any reuse.
- S5: [EBI OLS UBERON API](https://www.ebi.ac.uk/ols4/api/ontologies/uberon/terms):
  exact six IRIs checked; none was obsolete. New fine-structure terms require their
  own checks. Preserve source FMA identities where a validated UBERON mapping lacks.
- S6: [SpeechRecognition local-processing documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally).
  Local processing is not guaranteed by the default browser API setting.

The deep-scholar Crossref CLI independently retrieved the Andreassen DOI. Local
research logs and portal/crosswalk snapshots remain outside git; no physiological
or geometric tolerance was inferred from search snippets.
