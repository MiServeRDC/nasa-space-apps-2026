# Female source frames and anatomical review sheet

Status: **partial reference; no registered composite or anatomical acceptance**.
Sources and immutable full-file hashes: [FEMALE_SOURCE_LOCK.json](FEMALE_SOURCE_LOCK.json).
Raw release metadata snapshots are in `sources/`; their exact hashes are locked.
The runtime derivative ledger is
[review.json](../../ares-cockpit/public/anatomy/female-hra/review.json).

## What is available

- HRA united-female v1.10 selected bone, heart/aortic, renal/lung, nervous/eye
  structures, preserving their source world transforms in glTF metres. The spine
  preview selects vertebral bone; it does not include the full disc/joint group.
- HRA v1.5 pubis/ischium supplement, separately selectable in its original frame.
  It is not superimposed on the v1.10 pelvis. A compatible filename, donor label
  or bounding box is not an independent registration result.
- No male geometry is imported into the female catalog. All included structures
  remain `UNVERIFIED`, not `NATIVE_REFERENCE`. Female denotes the HRA release, not
  an individually established donor identity/sex for every contribution. The
  nervous asset includes Allen-labelled brain meshes and is marked source sex
  `UNSPECIFIED` until contributor-specific provenance is reviewed.
- Invalid primitives are quarantined with source/node/reason. Valid remainder is
  a partial reference, not a certificate of anatomical completeness.

## Open mandatory coverage

| Requirement | Current status | Resolution needed |
| --- | --- | --- |
| Internal jugular vein | Native female source not established | Identify exact source and review vessel identity/laterality |
| Vagus/autonomic | Native female vagus not established | Acquire and review source; heart is contextual only |
| Vestibular target | Coverage not established | Review source structures; brain is not a substitute |
| Optic sheath / ONSD | Missing | A sclera or optic nerve mesh does not satisfy sheath geometry |
| Bilateral soleus | Denver package not acquired | Acquire original female final STL package and inspect exact structures |
| Bilateral calcaneus | Denver package not acquired | Same; do not borrow a male foot |
| Full pelvis | v1.10 partial; v1.5 supplement separate | Independent registration and anatomical review before assembly |

## Source acquisition and reproduction

Originals remain outside git (about 586 MB for both HRA releases). Derivatives are
about 19 MB combined; runtime fetches only the selected local chunk.

```bash
python3 scripts/acquire_female_anatomy.py
npm --prefix ares-cockpit run anatomy:female
node --experimental-strip-types ares-cockpit/scripts/verifyFemaleBuild.mjs
```

The acquisition script checks full length/SHA before atomic publication. Changed
upstream bytes fail the lock, rather than being silently accepted. Building is
development-time only; no network call or Python runtime is added to the product.

Denver and SimTK automated public access returned HTTP 403 (`cf-mitigated: challenge`) on 2026-11-15. To
continue that subtask, follow the step-by-step browser-assisted runbook in
[DENVER_STL_RUNBOOK.md](DENVER_STL_RUNBOOK.md) to download **Final 3D STL Models (87.8 MB)** and **Metadata**
from the [University of Denver dataset](https://digitalcommons.du.edu/visiblehuman/1/)
through an allowed browser session. Keep the original files in an external cache
and record full hashes before import (`python3 scripts/acquire_female_anatomy.py --verify-denver`). No account credentials or private browser
session are extracted by this phase. Once downloaded and landmark-registered (`>= 4` fit, `>= 3` check landmarks via `scripts/register_anatomy.mjs`), run `ares-cockpit/scripts/buildDenverLowerLimb.mjs` to validate and convert bilateral `soleus` (`L`/`R`) and `calcaneus` (`L`/`R`) into Meshopt static GLB chunks before human sign-off.

## Landmark authoring and registration

Use independently identified landmarks, with explicit source and target frame,
file SHA, point units, raw node identity, anatomical landmark identity and matching
laterality. Pick at least four non-coplanar fit landmarks and three independent
check landmarks. This is a stricter authoring policy than the three non-collinear
points mathematically sufficient for a proper similarity; it supports checking
3D handedness and rejects planar/collinear inputs. No fit/check identity or exact
point coordinates may be reused. Different labels on the same surface location
are not independent landmarks.

```json
{
  "schemaVersion": 1,
  "author": "Reviewer name",
  "correspondenceEvidence": "Source imaging and landmark selection protocol",
  "source": {
    "sha256": "FULL_SOURCE_SHA256",
    "units": "mm",
    "axes": "GLTF_Y_UP_RIGHT_HANDED",
    "frameId": "exact source release / coordinate frame"
  },
  "target": {
    "sha256": "FULL_TARGET_SHA256",
    "units": "m",
    "axes": "GLTF_Y_UP_RIGHT_HANDED",
    "frameId": "exact target release / coordinate frame"
  },
  "fit": [],
  "check": []
}
```

Each fit/check entry has `id`, `source` and `target`. Both point records need
`point: [x, y, z]`, `landmark`, `laterality` (`LEFT`, `RIGHT`, `MIDLINE`) and `nodeId`.
The example deliberately has no invented coordinates or valid placeholder SHA.
Points must already be expressed in the documented right-handed axes; the tool
does not guess LPS/RAS rotations or STL units. A file hash proves file identity,
not that an authored point is on the asserted anatomical landmark.

```bash
node scripts/register_anatomy.mjs LANDMARKS.json SOURCE_ASSET TARGET_ASSET REPORT.json
```

The CLI checks the actual files against the authored hashes, then solves proper
quaternion rotation and least-squares uniform scale/translation. The 16-value
matrix is column-major, mapping **raw source units** into **target-frame metres**.
Fit and independent-check RMS/max/per-point residuals are reported in metres.
Reflection, degenerate geometry, inconsistent laterality, duplicated coordinates,
unknown units, non-finite values and file-hash mismatches fail explicitly.

A computed report is always `COMPUTED_UNREVIEWED`. There is no fitted real-source
transform in this task, no copied community scale and no automatic medical error
threshold. Numerical tolerances concern floating-point convergence/rank only.

## Focused human acceptance record (not yet signed)

- [ ] Confirm exact source donor/contribution identity, units and laterality.
- [ ] Verify required anatomical structures against source images / references.
- [ ] Review landmarks and fit/check independence across the exact assets.
- [ ] Approve application-specific physical residual limits before accepting fit.
- [ ] Review independent errors, registration extent and spatial relationships.
- [ ] Record reviewer, date, evidence, accepted transform/report hash and limits.
- [ ] Only then publish a registered composite, retaining adapted-source labels.

Sources: HRA release metadata/DOIs in the lock; Andreassen et al.,
[Scientific Data (2023)](https://doi.org/10.1038/s41597-022-01905-2);
Horn, [JOSA A (1987)](https://doi.org/10.1364/JOSAA.4.000629),
[author manuscript](https://people.csail.mit.edu/bkph/papers/Absolute_Orientation_Scanned.pdf);
Umeyama, [IEEE TPAMI (1991)](https://doi.org/10.1109/34.88573).
