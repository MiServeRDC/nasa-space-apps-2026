# Phase 6: existing reference atlas engineering results

Date: 2026-11-15. Baseline 1325eb1; branch
work/MiServeRDC-greenfield-phase01. No main integration, push or hosted Actions.
[Implementation plan](../plans/GREENFIELD_PHASE6_IMPLEMENTATION.md).
[Runtime and identity contracts](../architecture/ANATOMY_PIPELINE.md#phase-6-existing-reference-catalog-and-viewer).

## Delivered

The standalone `/anatomy` reference viewer exposes all five existing systems,
source search, keyboard/pointer/touch selection, isolate/hide/default controls,
exact source detail, local coordinate notes and supported clinical context.
The cockpit command palette opens it. The existing spatial cockpit remains the
physiological workspace; this viewer does not substitute reference geometry for
individual anatomy or change the physiological profile.

The reproducible metadata catalog indexes 3,074 mesh-bearing source nodes. Original
GLB hashes/bytes and credits are retained. Parser associations map multi-primitive
geometry to raw glTF indices; nearest named ancestor labels for unnamed nodes are
explicitly qualified with node index. Source groups include descendants: for
example, the two IJV source roots contain 26 mesh-bearing nodes, including named
tributaries. They are not 26 verified IJV segments. External jugular is distinct.
No reviewed UBERON mapping is fabricated.

Display batching now retains indexed geometry and triangle/source ranges. It
avoids vertex expansion and intermediate cloned batches. One system is loaded at
a time; the unchanged 64 MB owned-geometry budget checks replacement allocations
alongside the prior view. An over-budget request preserves prior geometry and
reports the failure. The muscular default displays the soleus pair; all other
muscles remain searchable and individually isolateable.

## Measured geometry (real decoded assets)

| System | Source nodes with usable geometry | Part issues | Default owned geometry bytes |
| --- | ---: | ---: | ---: |
| Skeletal | 880 | 2 | 44,501,928 |
| Muscular | 411 | 0 | 33,021,258 |
| Cardiovascular | 676 | 0 | 40,306,428 |
| Visceral | 109 | 36 | 27,679,068 |
| Nervous | 435 | 35 | 50,047,404 |

Counts describe geometry engineering checks, not medical completeness. A source
node can own multiple primitives; an issue can coexist with a valid primitive of
the same node. Skeletal/nervous failures include degenerate triangles. Visceral
issues include three invalid non-female parts and 33 excluded female-labelled
primitives. Explicitly VH_F-labelled supplements and descendants are excluded
from the male reference, not reclassified. Quarantined pieces remain listed with
reasons; geometry is neither silently repaired nor exported as a new derivative.

Owned bytes include source geometry plus display attributes/index arrays. They do
not measure total browser heap, renderer/decoder overhead or VRAM. Each nonempty
system uses one display batch/material. Switching unloads the prior owned session;
full unload returns owned geometry and renderer geometry objects to zero.

## Validation

- Deterministic byte-identical metadata regeneration from pinned GLBs.
- Real decode, hash/source association, indexed batches and triangle-centroid rays
  across all five assets and required source groups. Exact asset/node anchors,
  stale revision rejection, invalid mappings, budget failure retention and unload.
- Distinct soleus/calcaneus, internal/external jugular and optic nerve/missing
  sheath identities; renal reference without a fabricated backend region.
- Browser: keyboard source list and viewport center-ray anchors, real pointer/touch
  selection, isolated geometry, durable notes, no mobile horizontal overflow,
  eight real system switches, resource release, storage denial, absent/corrupted
  assets and unavailable WebGL. External requests are blocked. Local telemetry is
  mocked to assert unsupported clinical channels remain unavailable. Selection
  emits no What-If POST.
- 135 frontend tests, TypeScript lint, production build, earlier fixture pipeline
  and cockpit browser regressions, and the required local fast probe.

## Remaining gates

Engineering functionality is delivered. The phase 6 **anatomical acceptance gate
is still open**: source labels and valid triangles do not establish expert
anatomical correctness. Optic sheath coverage remains missing. No nearby mesh is
accepted as a substitute. Clinical bindings are contextual and unsupported values
stay unavailable. Source registration is unreviewed and no individualized physical
measurements are inferred from glTF coordinates.

The nervous/visceral upstream non-commercial subcomponent notices and exact node
provenance remain unresolved. Existing source-license caveats are preserved;
commercial redistribution is not cleared by this work. Female assembly and
registration remain phase 7, subject to its acquisition/review gates.

### Reproduce locally

```bash
npm --prefix ares-cockpit run anatomy:catalog
npm --prefix ares-cockpit test
npm --prefix ares-cockpit run lint
npm --prefix ares-cockpit run build
# Set PLAYWRIGHT_MODULE and BROWSER_PATH to installed local tools.
node scripts/verify_anatomy_reference_browser.mjs
node scripts/verify_anatomy_pipeline_browser.mjs
node scripts/verify_greenfield_phase01_browser.mjs
node scripts/verify_greenfield_phase23_browser.mjs
bash scripts/agent_probe.sh --fast
```

Detailed logs, screenshots and browser JSON remain in OS temporary storage, not
in git. No hosted CI or shared cross-branch Cargo target is used.

Final local execution: 135/135 frontend tests; lint/build; real-asset browser suite
(with completed-system identity and exact per-system byte assertions); fixture
pipeline; phase 0/1 and phase 2/3 cockpit browser regressions; fast probe 4/4 with
Cargo check and Clippy all passed. No Rust behavior changed or full Rust test suite
re-run is claimed. Reference browser artifacts: OS temp directory
`ares-anatomy-phase6-BaBTSd` for this run; they are ephemeral.
