# Phase 7: female source assembly and registration evidence

Date: 2026-11-15. Baseline 21c1b15; dedicated work branch only, no main/push.

## Problem and acceptance boundary

The existing viewer is an unreviewed generic reference with source-specific gaps;
using male geometry for a female physiological profile does not produce female
anatomy. HRA female v1.10 provides native organs and v1.5 pelvis candidates. Denver
publishes female lower-limb geometry but earlier direct acquisition returned 403.
Full source hashes, independent registration landmarks, anatomical review and
native IJV/vagus/optic sheath coverage have not been established. Source names and
similar bounds cannot close those gates.

## Execution

1. Recheck authoritative metadata, license and dataset access; acquire immutable
   sources in an external local cache with byte limits and SHA-256 provenance.
   No browser credential extraction or access-control bypass. Public approved
   mirrors are usable only with explicit source/version/license evidence.
2. Extract distinct female HRA reference structures into bounded offline chunks
   using the existing static conversion contracts. Preserve node identities,
   source donor/version, credits and adaptation records. Quarantine invalid parts
   explicitly; do not repair/borrow male anatomy or invent the missing sheath.
   Select real source structures for an honest partial preview if a complete
   source cannot be safely shipped. Keep raw large downloads out of git.
3. Provide a reproducible proper-rotation uniform-scale landmark registration
   tool/report. Require authored landmark identity, laterality, source hashes and
   units; fitting and independent validation sets are separate. Report residuals
   in metres, scale and transform; no copied fitting constants or automatic
   medical acceptance threshold. Fail degenerate/reflected/mismatched inputs.
   Dataset coordinate identity does not imply registration between releases/donors.
4. Keep unregistered donors/releases in separate selectable source frames; do not
   assemble a visually plausible but unsupported composite. Import Denver lower
   limb only if acquisition and source units/identity can be established. Record
   unavailable acquisitions with exact reproducible remediation.
5. Expose separate male/female reference selection without changing physiological
   sex/What-If. Preserve revision-bound notes, clear unsupported selections and
   anchors on model switch, and show missing/partial coverage and unreviewed
   registration. Existing male source behavior remains available.
6. Qualify actual decoded geometry, deterministic generation, owned-memory limits,
   source separation, missingness, selection/notes and clinical bindings. Test
   registration against known synthetic transforms plus independent holdouts and
   failures; synthetic correctness does not certify real anatomy. Run frontend
   tests/lint/build, production browser regression and local fast probe.

## Artifacts and status

Publish acquisition/build manifests and source citations; per-source transform and
coverage review sheets; results and remaining gates. Update Memory Bank and make a
local commit. The complete female milestone stays open until mandatory coverage,
independent registration and focused expert review actually pass. Any partial
preview is labelled as such, with no individualized/clinical accuracy claim.
