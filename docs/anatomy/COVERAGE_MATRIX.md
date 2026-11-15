# Phase 4 anatomy coverage matrix

Date: 2026-11-15. Generated from [SOURCE_INVENTORY.json](SOURCE_INVENTORY.json).
All matches below are **named geometry candidates**, not anatomical approval or clinical observations.
`roots/mesh nodes` distinguishes named groups from actual descendant mesh nodes.
Zero exact selectors is an unresolved gap, not proof that no unnamed/mislabelled geometry exists.

| Required structure | Existing male roots/mesh nodes | HRA female v1.10 roots/mesh nodes | HRA v1.5 roots/mesh nodes |
|---|---:|---:|---:|
| brain | 1/250 | 1/283 | 1/283 |
| spinal_cord | 1/31 | 1/29 | 1/29 |
| vestibular | 4/4 | unresolved | unresolved |
| eye | 1/20 | 1/46 | 1/46 |
| optic_nerve | 2/2 | 2/2 | 2/2 |
| optic_sheath | unresolved | unresolved | unresolved |
| vagus | 2/2 | unresolved | unresolved |
| heart | 1/17 | 1/14 | 1/14 |
| internal_jugular | 2/26 | unresolved | unresolved |
| vessels | 2/600 | 1/110 | 1/110 |
| soleus | 2/2 | unresolved | unresolved |
| calcaneus | 2/12 | unresolved | unresolved |
| femur | 2/35 | 2/32 | 2/32 |
| spine | 1/100 | 1/73 | 1/25 |
| pelvis | 2/54 | 1/4 | 3/12 |
| kidneys | 2/2 | 2/50 | 2/50 |
| lungs | 2/5 | 1/27 | 1/27 |


## Decisions

- Preserve source node indices, names, mesh references and crosswalk terms. Do not
  bind by a broad substring (e.g. skeletal soleus attachment markings are not soleus
  muscle; external jugular is not internal jugular; optic nerve is not its sheath).
- Pelvis v1.10 match is **ilium only**. v1.5 adds pubis/ischium candidates, not an
  automatically registered composite pelvis. Common names/Visible Human provenance
  do not establish equal transforms, donor identity or compatible geometry.
- Femur matches may represent named component groups/condyles. They are not proof
  of a complete full-length femur. Source JSON and raw geometry must be inspected
  before a completeness or mechanical-loading claim.
- HRA optic nerves and eyes do not close the distinct optic-sheath/ONSD target.
  Neither current male nor HRA exact selectors establish sheath geometry.
- Denver female lower-limb record explicitly lists bilateral soleus and calcaneus,
  femur, pelvis and other lower-limb parts. This is **institutional source evidence**,
  not downloaded-file/mesh verification. The final 87.8 MB STL package and 55 KB
  metadata are linked at the institutional page; direct metadata download returned
  HTTP 403 on this run. No replacement files from an unofficial mirror were used.
- Female IJV/vagus/vestibular/sheath remain unresolved native source rows. Targeted
  primary-source searches did not establish a licensed female substitute. Optional
  borrowed male context cannot close a native female requirement.
- Existing male nervous/visceral candidates carry a subcomponent provenance/license
  review flag. Upstream attribution names noncommercial inner-ear/kidney inputs;
  it does not identify which exact local GLB nodes came from those inputs.
- Anatomical approval requires visual inspection and source review, and registration
  requires independent landmarks and documented transforms. No clinical constants,
  transforms copied from another viewer or tolerance values are introduced here.

## Next phase boundary

Phase 5 may implement registry/picking/conversion tooling with controlled fixtures
and already-pinned reference assets while keeping redistribution review explicit.
A new production female asset needs full acquisition, full SHA-256, decoder/geometry
checks, credits and registration. This matrix does not authorize calling the female
atlas complete. Actual native female gaps remain open in phase 7.
