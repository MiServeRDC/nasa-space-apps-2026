# Phase 4: pinned anatomy sources and coverage decision

Date: 2026-11-15. Branch: work/MiServeRDC-greenfield-phase01; baseline ef5cd6f.
User authorized continuation. This is source/asset inventory, not runtime import.

1. Preserve existing pinned male GLBs and credits. Inventory actual glTF nodes,
   mesh references and descendant geometry, recording hashes and source names.
2. Inspect HRA v1.10 female and v1.5 supplements via bounded HTTP Range requests
   for GLB JSON metadata only. Keep full-asset SHA unavailable until full acquisition;
   distinguish metadata hash, HTTP version/ETag and complete asset hash.
3. Verify official per-release license metadata, crosswalks and institutional
   Denver final-STL listing/terms. Inspect package metadata only where accessible.
4. Produce a reproducible source ledger and coverage matrix with precise node
   candidates, direct-vs-group mesh evidence and explicit unresolved gaps.
5. Retain CC BY-SA existing derivatives; do not infer relicensing from newer
   upstream terms. Community pipeline code is reference only; transforms and
   registration tolerances are not copied as validated anatomy.
6. Gate: every required row has evidence or a declared gap. Female completeness
   remains open for missing IJV/vagus/sheath/vestibular coverage and registration.
   No source geometry, imaging volumes or unvalidated registration enters git.
7. Verify inventory logic against actual pinned assets, tests/lint and fast probe;
   update memory and commit locally. No main merge/push or hosted Actions.
