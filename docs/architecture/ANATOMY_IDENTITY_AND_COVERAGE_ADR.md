# ADR: anatomy identity and coverage boundaries

Date: 2026-11-15. Phase 3 foundation; renderer integration remains phase 5.
Contracts: `ares-cockpit/src/anatomy/contracts.ts`, validator/registry: `registry.ts`.

## Decision

An anatomy structure is identified by model ID + source concept + laterality.
Mesh names and a visual silhouette do not establish anatomical identity. A concept
may have many meshes and a backend ARES region may bind to multiple structures.
Ontology IDs are optional; a reviewed ID requires recorded evidence. The validator
checks format and evidence presence, not the scientific truth of a curator's claim.

Each immutable model snapshot holds schema version, reference sex, asset source
version/URL/hash, license/credit, adaptations, source sex, units, right-handed Y-up
axes, optional donor reference, explicit column-major source-to-model 4x4 matrix
(normalized model units are metres), registration method/review/report,
LOD and picking map. Every mesh reference names its source asset and node IDs.
A missing reference is represented by coverage MISSING and a reason, never an
unrelated mesh. Native, borrowed and unverified geometry remain distinguishable.
Source SHA checks and decoded anatomy are phase 0 tooling; the phase 3 registry
validates authored metadata, not untrusted arbitrary JSON or a GLB's actual anatomy.

Coverage is independent of clinical channels: available geometry can have entirely
null physiological data. Neither atlas lookup nor model switching receives or
mutates What-If values or telemetry. Kidney/lung reference structures can have no
backend binding. The only accepted backend regions are the five current wire IDs;
adding a new backend region requires its own contract change.

Selection transfers only through an exact reviewed ontology ID and laterality,
with exactly one available counterpart. Missing, unverified, absent or ambiguous
counterparts clear selection. Annotations remain attached to their original model
and structure; donor-specific positions are never transferred by ontology alone.

## Compatibility and explicit pending work

This is a separate registry contract and fixture suite, not a replacement atlas
loader. Existing scenario sex controls still select a physiological/procedural
profile; they are not evidence of a female source atlas. Phase 5 must wire a
separate atlas selector and registry-backed picking without changing physiology.
Existing GLB files, attribution and renderer IDs are unchanged. No unverified
male/female sources are registered as anatomically complete models.

Phase 4 must record exact source nodes, licensing and unresolved coverage. Phase 5
must validate actual scene/node references, transforms, picking, LOD and disposal.
Anatomical review and registration in physical units are required before native
female coverage is marked complete. Schema validity is not anatomical validation.

## Tests

Synthetic fixtures (clearly labelled, no downloaded geometry) cover multi-mesh
concepts, compound soleus/calcaneus bindings, missing female coverage, borrowed
male references, unknown IDs, kidney without a backend region, ambiguity, donor
annotations and mutation isolation. Runtime clinical channels remain nullable in
the phase 1 UI regressions. No clinical constants are introduced by this ADR.
