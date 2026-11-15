# Phase 9: measure and optimize resources

Baseline 6a1c145; dedicated work branch, no main integration or hosted Actions.

## Observed problem

The cockpit dynamically renders 20 Hz physiological waveforms, manages multiple
Human Reference Atlas (HRA) 3D chunks (Phase 6 male and Phase 7 female models),
and hosts an active WebGL2 stage. While optional 3D components are dynamically
imported, steady-state rendering must be verified against explicit resource budgets.
Continuous requestAnimationFrame (RAF) cycles in WaveformCanvas2D risk unnecessary
re-computations when telemetry ring-buffers have not published new samples. In
addition, covered, offscreen, or backgrounded 3D canvases must deterministically
suspend rendering to zero draw calls without throttling telemetry ingestion,
conformal risk forecasting, or clinical safety gates.

## Implementation

1. WaveformCanvas2D revision-gated redraw and zero-allocation scratch buffers:
   - Track buffer revision / sample index; exit O(1) in RAF if no new samples
     or timeline scrub updates have occurred.
   - Use pre-allocated coordinate scratch buffers for segment point coordinates,
     eliminating per-frame object/array allocations along the steady-state draw path.
   - Preserve exact NaN dropout handling (Issue #11), tactical grid, and threshold markers.
2. Formalized quality policy in `src/lib/renderQuality.ts`:
   - Support `LOW_2D`, `STANDARD`, `DETAILED`, and `AUTO` modes.
   - Provide hardware-hint detection (`detectHardwareTier`) evaluating concurrency,
     device pixel ratio, and reduced-motion preferences.
   - Implement rolling frame-time pressure evaluation with hysteresis (degrade on
     sustained high frame times, recover only on sustained high frame rate).
   - Invariant: Quality tier changes must NEVER mutate clinical measurements,
     telemetry freshness, safety gates, or selected anatomical identifiers.
3. Covered / offscreen / hidden 3D frameloop suppression:
   - Combine `IntersectionObserver`, document visibility, and drawer occlusion state
     to force Three.js frameloop to `never` when stage is not visible.
   - Decouple telemetry ingestion (20 Hz) and safety evaluation from the 3D render loop:
     stopping 3D rendering must have zero effect on alarm timeliness or data freshness.
4. Memory retention and context recovery:
   - Verify explicit disposal of geometries and materials on layer toggle and model switch.
   - Re-verify `webglcontextlost` and `webglcontextrestored` event handling.
5. Offline completeness and bundle boundaries:
   - Confirm every lazy chunk loads cleanly offline from local assets.

## Qualification and evidence

- Unit & integration suite `tests/greenfield_phase9.test.ts` testing quality policies,
  revision gating, scratch buffer reuse, and state preservation.
- Performance profiling script measuring bundle weights, draw calls, and memory retention.
- Zero-panic, `#![forbid(unsafe_code)]`, and agent probe 4/4 clean.
- Update Memory Bank and record findings in `docs/evaluation/GREENFIELD_PHASE9_RESULTS.md`.
