# Phase 4: anatomy source inventory results

Date: 2026-11-15. Baseline ef5cd6f, branch work/MiServeRDC-greenfield-phase01.
Scope: source selection, license evidence, metadata inventory and explicit gaps.
No main merge/push, hosted Actions, new production geometry or runtime change.

## Deliverables

- [SOURCE_INVENTORY.json](../anatomy/SOURCE_INVENTORY.json): verified local file
  hashes, exact node/mesh candidates, HRA source crosswalks, per-release metadata
  hashes and partial-GLB JSON hashes. Seventeen required structure rows.
- [SOURCE_DECISIONS.json](../anatomy/SOURCE_DECISIONS.json): source/reuse decisions,
  pinned attribution blobs, DOI/license evidence, acquisition and provenance gaps.
- [COVERAGE_MATRIX.md](../anatomy/COVERAGE_MATRIX.md): readable coverage and limits.
- `scripts/inventory_anatomy_sources.py`: reproducible local inventory plus bounded
  optional HRA metadata acquisition. Python 3 standard library, development only.
- Updated shipped attribution with the newly identified subcomponent review flag.

## Evidence and decisions

The five existing male files still match their pinned SHA-256/size manifest.
Exact names with positive POSITION-accessor counts exist for internal jugulars,
vagi, solei and calcanei. A named group is followed to descendant meshes; a label
alone cannot establish geometry. None of these matches implies anatomical review,
valid registration, supported physiological measurement or clinical validity.

HRA female v1.10 contains 1,160 nodes and 956 meshes in the fetched JSON chunk;
v1.5 contains 1,073 nodes and 888 meshes. Counts are metadata counts, not independent
anatomical concepts. The original files are 374,505,632 and 211,624,968 bytes.
Only the JSON chunks (939,508 and 809,072 bytes plus headers) were fetched, not their
geometry buffers. A fresh independent cache reproduces the same inventory.
Full asset SHA-256 stays null; neither multipart ETag nor JSON hash substitutes for
it. Per-release metadata supplies raw-data CC BY 4.0, authors and versioned DOIs:
[v1.10](https://doi.org/10.48539/HBM637.DWBM.744),
[v1.5](https://doi.org/10.48539/HBM352.BTSQ.586).
The metadata URL that failed in an earlier review was accessible through the local
research fetcher on this run; the browser extraction service still could not read it.

Eye/optic-nerve, CNS, heart, renal and lung group candidates are present. Pelvis
v1.10 has ilium; pubis/ischium candidates are present in v1.5. This does not prove
version-to-version alignment. IJV, vagus, vestibular and optic-sheath native female
candidates remain unresolved in the inspected names/crosswalks. No unnamed geometry
was interpreted by appearance, and an optic nerve does not satisfy a sheath target.
No external source was verified to close these gaps in the targeted searches.

The [Denver female institutional record](https://digitalcommons.du.edu/visiblehuman/1/)
explicitly lists bilateral soleus/calcaneus and other lower-limb candidates. It
links final STL (87.8 MB) and metadata (55 KB) separately from imaging volumes.
Dataset reuse is CC BY 4.0; article licensing was checked independently through
[the paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC9849470/).
The metadata download returned 403. No STL package or imaging volume was acquired;
package filenames, full hashes and registration against HRA remain pending.

The pinned atlas-proto declaration says CC BY-SA 4.0, but the official
[Z-Anatomy attribution](https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/master/License.txt)
also names noncommercial inner-ear and kidney contributions. Their exact
correspondence to our nervous/visceral nodes is unresolved. Existing credits and
assets remain intact; these components are not newly cleared for commercial
packaging. [Current direct BodyParts3D terms](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)
are a candidate for a separate direct-source pipeline, not a way to relicense
these derivatives. No permission request was sent to any author.

The community Human-Atlas attribution/importer was inspected and pinned by file
blob. Its code license and geometry credits are distinguished. No viewer code,
fitted transforms, residual tolerances or borrowed male completion was imported.
No original brief's star counts or claimed native structure totals are used as
selection criteria. All source evidence is discovery/engineering evidence only.

## Reproduction and checks

```bash
python3 scripts/inventory_anatomy_sources.py \
  --fetch-hra --cache-dir /tmp/ares-anatomy-source-cache \
  --checked-at 2026-11-15 --output /tmp/ares-anatomy-inventory.json
python3 scripts/test_anatomy_source_inventory.py
npm --prefix ares-cockpit test
npm --prefix ares-cockpit run lint
bash scripts/agent_probe.sh --fast
```

- Seven script regressions pass: exact names, non-geometric groups, unreviewed
  ontology provenance, bounded graph traversal, invalid references, bad/truncated
  GLB headers, refusal to read an ignored HTTP Range, and persistent source gaps.
- All 109 Node frontend tests pass (one invokes the seven script cases), no skips.
- TypeScript lint, Cargo check/Clippy and fast probe pass locally.
- Acquisition refuses ignored Range requests and checks length/header/ETag/object
  version consistency. The acquisition path was exercised against the real CDN,
  with deterministic cached regeneration compared to the committed JSON.
- No Rust or runtime frontend source changed, so browser suites/full Rust tests
  from the prior phase were not repeated or claimed as new runs.
- Raw source metadata, research logs and Crossref report remain outside git.
  Only the compact evidence ledger/matrix/decisions and tooling are committed.

## Phase gate and next work

Phase 4 inventory is complete with explicit gaps, as required by the plan's gate.
It does **not** close native female coverage or subcomponent provenance review.
Next phase: registry-backed conversion/picking tooling and a small controlled
fixture, preserving the 2D fallback. Full source acquisition/hash, anatomical review,
registration and actual production model integration still have separate gates.
No clinical threshold, geometry tolerance or physiological model was changed.
