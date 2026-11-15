# Phase 8: operational triage, reflow and presentation layout

Baseline e02275c; dedicated work branch, no main integration or hosted Actions.

## Observed problem

The shell still locks desktop content to a viewport-height three-column grid,
uses fixed full-screen 3D with hardcoded camera chrome offsets, overlays small
hotspot/layer controls on the body, and floats the copilot above page content.
On narrower widths there is no explicit current-problem/evidence/next-step order;
long titles and diagnostics consume space or truncate. Phase 7 source/registration
acceptance remains open and is not closed by this interface phase.

## Implementation

1. Add an always-readable 2D triage summary derived only from the supplied packet:
   backend alarm/active problem, available vital evidence with units, explicit
   missing channels and source/freshness, next navigation to supplied playbook or
   diagnostics. Do not introduce diagnoses, thresholds, probabilities or new
   action authorization. Actual execution remains in the existing gated hold UI.
2. Add operational/presentation display state. Operational is quiet by default;
   presentation may use user-enabled rotation. Both share telemetry, phase,
   selection and safety gates. Reduced motion always inhibits autorotation.
3. Replace height-locked content with a document-flow clinical grid. Prioritize
   summary, vital/context and diagnostic/action content before optional anatomy
   on mobile. Allow vertical reflow at narrow widths/zoom, wrap titles and preserve
   touch targets. Move copilot and studio tools into flow so they cannot occlude
   clinical controls. Keep modals/drawers overlay semantics and focus restoration.
4. Contain the primary canvas in a measured local stage aperture; remove assumed
   viewport chrome offsets for that scene. Keep 2D fallback, pointer/wheel handling
   and optional 3D fault isolation. Move hotspot and layer/profile controls outside
   the body aperture, with a visible reference/illustration label. Never imply
   procedural profile controls load the separate reviewed source atlas.
5. Introduce progressive disclosure for technical/source/ontology diagnostics;
   retain source labels, missingness, active warnings, inhibited reasons and next
   verification steps without hiding essential safety content. Do not remove
   existing audit/diagnostic access or keyboard escape behavior.

## Qualification and evidence

Use the existing UI identity and local fonts. UI/UX skill guidance verified for
focus obscuration and grid/text overflow; recommendations are design guidance,
not a conformance or clinical certification. Create behavioral/rendered tests and
production browser qualification at 1440, 1024, 768, 390, narrow landscape and zoom.
Check actual scrolled stage screenshots and bounding boxes, no document horizontal
overflow, control/body separation, 2D alert-to-missingness-to-action navigation,
keyboard/input escape/focus restoration and reduced motion. Re-run affected
existing regressions, frontend lint/tests/build and local fast probe. Record real
limitations, update Memory Bank and create a local commit on the dedicated branch.
