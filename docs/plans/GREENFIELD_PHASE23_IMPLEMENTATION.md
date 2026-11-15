# Greenfield phases 2 and 3 implementation

Date: 2026-11-15. Authorized continuation, branch work/MiServeRDC-greenfield-phase01.
No main integration, push or hosted Actions. Baseline: 0ed81eb, 94 frontend tests.

## Phase 2

Isolate the optional, lazy-loaded Canvas/stage in an error boundary. Unsupported
WebGL2 must skip renderer creation; runtime failure must retain the DOM shell.
Context loss shows a persistent status while restoration remains possible.
Keep diagnostic selection reachable through existing DOM controls.

Use the same 1500 ms confirmation duration with and without reduced motion.
Cancel on release, blur, pointer cancellation, hidden document, disabled state
and action changes. Keyboard and pointer use the same state. Record only a local
selection/note; there is no backend execution endpoint/acknowledgement in this flow.

Only start ASR if processLocally exists and can be set to true. Failure uses typed
input; no remote retry or automatic language/model installation. Apply the same
policy to both current and legacy voice widgets. Filter TTS to local voices.

Local note records use a versioned canonical JSON tuple and SHA-256, serialized
appends and explicit empty-ledger semantics. Recompute local hashes; engine records
whose canonical format is not validated here show link continuity only, with no
claim of content integrity or authenticated execution. Preview fixture rows must
not masquerade as actions taken by the user.

Tests: actual buttons (short/long pointer and keyboard, reduced motion, blur),
unsupported/rejected ASR, altered local audit content, no-WebGL App, renderer
failure/context loss, and phase 0-1 regressions. Vite/React SSR and Chromium only;
Tauri/on-device packs are not claimed tested without the actual environment.

## Phase 3

Add versioned anatomy contracts and a registry validator, separate from clinical
availability. Record model sex/source, source identity, license/hash, ontology
review, mesh IDs, units/axes/transform and registration provenance, LOD/picking
references and missing/borrowed coverage. Compound ARES regions bind to multiple
structures; standalone kidney selection does not invent a backend region.

Model switching retains selection only through an exact reviewed concept and
laterality match. Unsupported selections and annotations are cleared or explicitly
unavailable. Atlas selection never modifies What-If physiological profile.

Deliver fixtures/tests and an ADR before integrating any new anatomy assets.
Existing pinned male files remain untouched; no female completeness claim.
