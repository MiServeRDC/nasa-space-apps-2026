# Phase 7: partial female reference and registration tooling

Date: 2026-11-15. Baseline 21c1b15; work/MiServeRDC-greenfield-phase01.
No main merge/push or hosted Actions. **Complete female anatomical acceptance
remains open.** [Plan](../plans/GREENFIELD_PHASE7_IMPLEMENTATION.md),
[source and human review sheet](../anatomy/FEMALE_REGISTRATION_REVIEW.md).

## Delivered engineering scope

Acquired the full HRA united-female v1.10 (374,505,632 bytes) and v1.5
(211,624,968 bytes) GLBs into an external cache. Full SHA-256 pins and raw release
metadata snapshots replace the earlier partial-header evidence for these sources.
The development acquisition script verifies length/hash and atomically publishes
only valid downloads. Originals are not in git or required at runtime.

The reproducible derivative builder preserves source ancestor/world transforms,
selects real source structures, validates numeric geometry, writes local Meshopt
chunks and records exact original node/mesh/primitive provenance. It performs no
simplification, source fitting, geometry repair, borrowed male completion or
physiology change. Five chunks total 19,038,400 encoded bytes; metadata and review
records add about 0.5 MB. A full-source rebuild reproduces every bundled artifact,
catalog, attribution and review byte-for-byte.

The partial female model is independently selectable in `/anatomy`. Search,
isolate, clinical context, real pointer/keyboard anchors and local notes use the
existing contracts. Model switches clear selection/coordinates; notes stay bound
to exact model revision/asset/node. Missing muscular geometry unloads the current
model and supplies no substitute. Reference selection does not change What-If,
physiological sex or clinical-region definitions.

HRA v1.10 and the v1.5 pelvis supplement retain separate source frames. The viewer
never overlays them. The model session rejects chunks from different authored
frame IDs, including a known frame mixed with an unknown one. Identity transforms
preserve coordinates within a source; they are not an inter-source registration.

Female denotes the HRA release. All 439 rendered primitive identities remain
`UNVERIFIED`. Contributor-specific donor/sex is not individually established;
Allen-labelled nervous contributions are marked source sex `UNSPECIFIED`. The six
mandatory missing entries are not counted as native female coverage.

## Actual decode and default geometry accounting

| Chunk | Rendered source primitive identities | Encoded bytes | Owned numeric geometry bytes |
| --- | ---: | ---: | ---: |
| Skeletal: pelvis/femurs/vertebral bone | 63 | 5,394,880 | 24,246,600 |
| Cardiovascular: heart/aortic selection | 23 | 1,278,752 | 5,638,848 |
| Visceral: renal/lung selection | 75 | 1,723,936 | 7,199,232 |
| Nervous: brain/spinal/eye selection | 270 | 10,275,096 | 37,816,848 |
| v1.5 pubis/ischium (separate frame) | 8 | 365,736 | 1,464,120 |

Each is below the unchanged 16 MB encoded-file and 64 MB owned-geometry limits.
Owned bytes include CPU source geometry and display attributes/indices; they are
not total browser heap, decoder scratch space or VRAM measurements. One source
system is active at a time. The initial full spine/disc group was too large;
selection uses actual vertebral bone instead and explicitly excludes disc/joint
coverage. No tolerance or memory budget was increased to hide the problem.

Forty-nine invalid original primitives are listed: one cardiovascular, two
visceral and 46 nervous (including degenerate triangles or zero-length normals).
They are excluded, not repaired. A partial valid group does not imply complete
anatomical coverage; source invalidity is visible in the viewer and ledger.

## Registration helper

The new offline CLI checks source/target file hashes and authored point identity,
units and laterality. It solves proper quaternion rotation, least-squares uniform
scale and translation; reports fit and independent-check residuals separately in
metres; and emits a column-major raw-source-units to target-metres matrix.
Reflection, degenerate/planar fits, reused coordinates/identities, unsupported
units, inconsistent laterality and non-finite values fail explicitly. Source file
hashes and implementation/input fingerprints bind reports to the supplied inputs.

Synthetic tests recover known arbitrary 3D/180-degree rotations, scale,
translation and mixed mm/cm/m units; independent bad check points remain visible
without changing the fit. CLI tests verify exact file binding, tamper rejection
and input-overwrite refusal. These are numerical software tests, not registration
validation on human anatomy. No real-source fitted matrix is supplied without
anatomically authored fit/check landmarks. Every computed report remains
`COMPUTED_UNREVIEWED`, with no medical acceptance threshold.

Method sources: Horn [JOSA A (1987)](https://doi.org/10.1364/JOSAA.4.000629),
[author manuscript](https://people.csail.mit.edu/bkph/papers/Absolute_Orientation_Scanned.pdf),
and Umeyama [IEEE TPAMI (1991)](https://doi.org/10.1109/34.88573).
See IMPLEMENTATION_STACK.md for the precise scale formulation and authoring policy.

## Validation

- 149 frontend tests passed, including real decode/hash/ray/anchor/frame tests
  for all female chunks and numerical/CLI registration tests.
- TypeScript lint and production build passed.
- External-cache full-source acquisition re-verification and derivative rebuild
  passed. Default frontend tests require bundled derivatives, not raw downloads.
- Built-bundle browser tests passed: distinct female model, gaps, real surface
  note, revision isolation/restoration, source-system switching, v1.5 frame label,
  muscular absence/unload, mobile layout, asset failure fallback, no What-If POST
  and blocked external requests. Original male reference browser suite passed.
- Synthetic fixture browser regression and local fast probe 4/4 passed, including
  Cargo check and Clippy with zero warnings. They cover the
  shared viewer/session changes. No Rust production behavior changed; no full
  Rust test rerun is claimed.

Detailed browser results/screenshots remain outside git in the OS temporary
`ares-anatomy-phase7-THeitX` directory. Logs remain `/tmp/ares-phase7-*` locally.

## Remaining work and required input

The institutional Denver final female STL/metadata endpoints and SimTK automated
access return HTTP 403. No file bytes/hash or unit/entry inspection is invented.
Use an allowed browser to download the **Final 3D STL Models (87.8 MB)** and
**Metadata** from the [Denver dataset](https://digitalcommons.du.edu/visiblehuman/1/),
then retain originals outside git. The package still needs exact source entry/unit
inspection and an explicit import recipe; it is not automatically supported merely
by placing an archive in the cache.

Bilateral soleus/calcaneus, native IJV/vagus/vestibular and optic sheath remain
missing/unestablished. Full pelvic assembly needs independent v1.5/v1.10 landmark
review. Actual donor/version correspondence, independently authored landmarks,
application-specific residual tolerances and focused anatomy review remain open.
Until those exist, **phase 7 is a partial source-preview/tooling delivery, not a
complete female model or accepted composite**. The unrelated operational UX work
of phase 8 can proceed without falsely closing these gates.
