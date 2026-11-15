# Greenfield cockpit review

Reviewed branch: `feat/cockpit-greenfield-awwwards`, commit `e4e753142da2517e0d12ecce4cb4cb7792bed897`.
Date: 2026-11-15. Review worktree: `/tmp/ares-cockpit-greenfield-review`.
Verdict: preserve the visual direction and several architectural foundations;
do not integrate as a finished operational cockpit before correcting data and
failure boundaries. No production patches or GitHub publication by this review.

## Scope and executed checks

- Branch is based on `3516da4`; compared main was `2314b5a`, 15 commits ahead of
  the shared ancestor, while this branch has one large redesign commit.
- Change: 74 files, 19,223 inserted and 2,294 deleted lines relative to the ancestor.
- `npm ci --ignore-scripts --no-audit --no-fund`, all 55 Node tests, TypeScript lint
  and production build passed. Generated tsbuildinfo was restored.
- Chromium on this Mac: 1440x900, 1024x900, 768x900, 390x900; three phase pages,
  drawer keyboard focus/escape/restoration, command palette, skeletal GLB toggle,
  reduced-motion confirmation, mobile scroll and deliberate WebGL absence.
- Real backend HTTP/WebSocket exercised using an already-built debug CLI in the
  main clone. No Rust build/tests of this branch or actual Tauri runtime were run.
- Controlled valid WebSocket fixtures confirm missing-value and interaction bugs.
- Live synthetic desaturation: NORMAL -> ALARM after 22 s observation; backend
  selected PLAYBOOK_06_HYPOXEMIA_DESATURATION and UI displayed WARNING/ALARM plus
  SYNTHETIC EVENT ACTIVE. Phase remained GATHER with ACT recommendation, rather
  than automatically navigating. Event was cleared after the test.
- Normal desktop interactions produced no uncaught JS errors. One persistent
  WebGL2 stage plus Canvas2D plots. No external HTTP requests observed during the
  initial non-voice navigation; this does not qualify voice/offline behavior.
- Screenshots and JSON evidence: `/tmp/ares-greenfield-visual-review/`.
- Vite preview: http://127.0.0.1:5190 ; temporary backend: 127.0.0.1:5191.
- All checks local; no hosted Actions.

## Design assessment

The spatial flight-deck identity fits deep-space monitoring: black background,
cyan interaction, amber/red abnormalities, persistent vitals and phase-oriented
right dock. Typography and surfaces are more coherent than an ad-hoc panel stack.
The body makes the demo memorable; privacy/audit/portal functions move into drawers
without replacing the vital anchor. This is a technical mission-control aesthetic,
not evidence of an Awwwards score, clinical usability qualification or certification.
The 8.790/10/SOTY labels in the memory bank are internal claims, not measured awards.

The desktop still has too much competing microcopy: 9-11 px all-caps technical
labels, clipped headings, long reason strings squeezed into tiny columns, and
multiple scroll areas. The 3D uses a large central area even when the immediate
job is to read an alert or compare measurements. Establish a quiet summary layer
with progressive details and a compact triage mode. Improve the silhouette and
anatomical landmark readability without treating the stylized mesh as diagnostic
anatomical accuracy. Auto-rotation is useful for a pitch and should be a deliberate
operational choice, with reduced motion respected.

At 390 px the page is about 3,003 px tall in the ACT test, with no horizontal page
overflow. Scrolling the stage into view reveals the body, but hotspot and layer
controls cover it, the full-screen fixed canvas does not fit the mobile aperture,
and the bottom copilot overlaps content. Reflowing desktop columns is insufficient:
use a dedicated mobile triage layout and a locally fitted/collapsible stage.

## Valuable foundations

- Local WOFF2 fonts, Draco assets and working local skeletal GLB loading.
- Reusable card/drawer/instrument/stage modules and pure math helpers.
- Typed-array telemetry ring, missing values kept as NaN, bounded capacity.
  Actual default typed-array storage: 134,400 bytes for 2,400 entries; this is
  ring backing storage only, not whole-application RAM or a performance benchmark.
- Direct Canvas2D plotting and instanced beacons reduce reliance on React for
  individual plotted points. Single main WebGL canvas and shader/material cleanup
  are sensible choices. These do not by themselves prove a zero-allocation app.
- Portal focus stayed inside the dialog for 20 Tabs in both motion modes;
  Escape closed it and restored focus to horizon-btn-portal. Command palette
  opened successfully. Default design includes useful reduced-motion handling.
- Explicit synthetic-event label and HRV unavailability remain visible.

## P1: live null MRI and global margin replaced by scenario values

`ares-cockpit/src/workbench/PhaseEvaluateDeck.tsx:56` and `:57` use
`packet... ?? scenario...`. Individual predicate bars also read scenario.rho
rather than authoritative backend margins.

With real/controlled backend `mission_readiness_index = null` and global rho =
null (required HRV absent), the empirical page shows MRI **62%** and rho **+0.20**.
TTV correctly says unavailable and HRV says unavailable, making the page internally
contradictory. Similar nominal fallbacks elsewhere need an audit; e.g. cabin O2
falls back to 21.3 with a NORMOXIC label when no measurement is present.

Fix: preserve unavailable in empirical views. Scenario values belong in an
explicit preview panel with separate provenance. Test nulls all the way to the
rendered component, not only through the normalizer.

## P1: forecast channel and unit mismatch

`ares-cockpit/src/instruments/QuantileConeChart.tsx:59` and `:85` fall back to the
first available cone when the requested channel is missing. The lens requests
rho_global/rho, while the backend available cones begin with heart_rate_bpm.

Observed chart: NQS-STL Robustness Trajectory (rho_global), unit rho, with axis
values around 118.55 / 52.92 / -12.70. It is plotting HR-derived values under a
rho label. The abstention badge does not make the channel substitution valid.
When no cone exists, the component also fabricates a multi-horizon scenario
envelope; that must not impersonate an empirical forecast.

Fix: exact typed channel/unit matching, explicit unavailable on absence, separate
labeled scenario rendering. Never choose the first channel as a fallback. Add
component tests with HR cones present and rho absent, all channels absent,
abstention and deliberately different channel units.

## P1: reduced motion bypasses action confirmation

`ares-cockpit/src/lenses/BranchedPlaybookDagLens.tsx:165` immediately invokes
onConfirm when prefersReducedMotionSafe() is true.

Real browser comparison: a single ordinary click yields 0 completed actions in
normal motion mode and **1 completed action** with reduced motion. The UI still
promises PRESS & HOLD 1.5S TO EXECUTE. These are frontend/local action records;
this review did not command medical hardware.

Fix: separate animation from intentional confirmation. Keep the same duration or
an explicitly designed accessible confirmation flow; removing animation must
not remove the guard. Add actual pointer/keyboard behavior tests under both modes.

## P1: unavailable WebGL takes down the entire cockpit

`ares-cockpit/src/stage3d/SpatialCanvasRoot.tsx:117` is mounted unconditionally
without an effective error boundary isolating the 3D from the DOM monitor.

When WebGL context creation is deliberately made unavailable, Chromium reports
Error creating WebGL context and **#root has 0 children**. Vitals and controls are
lost. Context-lost listeners do not cover failure to create the initial context.

Fix: isolate lazy 3D behind a recoverable boundary/capability check; preserve all
vital/alert/playbook DOM views in 2D fallback. Test initial unsupported WebGL,
creation failure and context loss/restoration. Retain main's newer fault isolation
when integrating the redesigned shell.

## P1: voice is not guaranteed to be offline

`ares-cockpit/src/drawers/BottomCopilotStudioPill.tsx:167` selects browser
SpeechRecognition/webkitSpeechRecognition and starts it without requiring local
processing or verifying the on-device model. The comment calls this local.

Official API documentation says processLocally defaults false; the user agent may
process locally or remotely. Source:
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally

This is a source/documentation risk finding, not a claim that this test recorded
or uploaded audio. Microphone recognition was not activated in this review.
Fix: route to the existing local desktop ASR, or explicitly require supported,
provisioned on-device recognition and fail closed to typed commands otherwise.
Local fonts/CSP and zero observed page requests do not establish offline ASR.

## P2: anatomical detail loses direct picking

`ares-cockpit/src/stage3d/BiodigitalTwinStage.tsx:290` sets merged GLB mesh raycast
to an empty function. The click handler accepts only the five canonical beacon/
halo instance objects. Detailed anatomy can be displayed but individual loaded
structures cannot be selected on that path.

This matters for previously requested precise problem annotation. Decide whether
five regions are the product scope; otherwise retain semantic structure IDs and
a separate pick/annotation path when optimizing draw calls. Test the exact
selection/annotation workflow before replacing the previous atlas interaction.

## P2: UI audit continuity is not cryptographic content verification

`ares-cockpit/src/drawers/drawerLogic.ts:39` validates hexadecimal shape, sequence
ordering and prev/current link equality; it does not recompute the content hash.
An arbitrary valid-length digest with an edited event_action still returns
CONTIGUOUS_SHA256_VERIFIED_1_BLOCKS. App action records use local state, a fixed
preview starting hash, and even a non-SHA fallback outside WebCrypto.

Fix: accurately label link-continuity and local preview, or verify using the
backend's canonical record format and authoritative persistence/acknowledgement.
Do not show executed/mission-ledger guarantees for frontend-only local notes.
DSN queue is already visibly labeled simulated; keep that distinction.

## P2: performance claims need qualification

Measured build: index JS 371.47 kB/113.05 kB gzip; combined 4 JS chunks
1,638.54 kB/475.85 kB gzip; CSS 70.66 kB/12.94 kB gzip. All major App modules are
statically imported. Manual vendor splitting is not optional-view lazy loading.
The 850 kB warning threshold explains the lack of large-chunk warnings; it does
not remove the 744.49 kB Three vendor chunk. Fonts, Draco and GLBs are additional.

The typed ring scalar path is bounded, but WaveformCanvas2D calls
segmentWaveformWithDropouts inside RAF; that helper allocates arrays and point
objects. App still receives continuous React state from the old useTelemetry;
the local fallback simulator is not paused as in current main.

WebGL remains active behind an opaque portal: observed 186 draw calls/0.5s exposed
vs 180 covered. This is a diagnostic observation in this browser, not an FPS or
battery benchmark. Add viewport/overlay suspension, bounded update work and
measurement on target hardware; preserve current main's appropriate optimizations.

## Integration and test strategy

A merge-tree simulation reports conflicts in App.tsx, activeContext.md and
progress.md. No actual merge was performed. Because useTelemetry and binary
runtime files were not edited by the greenfield commit, a correct three-way merge
can retain newer main versions; copying the whole old branch snapshot cannot.
Resolve App explicitly against the latest contracts/freshness/source handling.
Do not reintroduce old source-mode, persistence or native sequencing behavior.

55 tests are useful pure-math/store/geometry coverage plus source-structure checks;
they did not catch the rendered null fallback, wrong channel, reduced-motion
confirmation or WebGL-root failure. Add component/browser tests for these exact
cases, current binary playbooks 1..15, live/anomaly/reconnect, 2D fallback and
mobile keyboard/touch navigation. Real Tauri and low-end GPU testing remain open.

## Suggested delivery order

1. Fix empirical null/provenance and channel/unit semantics.
2. Preserve confirmation under reduced motion and isolate WebGL failure.
3. Require offline ASR; accurately label audit/execution preview scope.
4. Integrate current main with contract and native regression tests.
5. Restore agreed fine-grained anatomy interaction and tune mobile/typography.
6. Profile and optimize allocations, optional chunk loading and hidden rendering.

Keep the visual direction; prioritize trustworthy data and resilient interaction
before more shaders, effects or feature panels. A separate presentation mode can
retain the dramatic rotating stage while the operational mode prioritizes triage.
