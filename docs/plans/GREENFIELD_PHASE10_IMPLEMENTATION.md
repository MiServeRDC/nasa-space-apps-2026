# Phase 10: end-to-end software qualification and controlled integration

Baseline 667307a; dedicated work branch, no main integration or hosted Actions.

## Observed problem

Phases 0 through 9 have incrementally built, stabilized, and optimized the greenfield
cockpit architecture, 3D anatomical pipeline (Phase 6 male and Phase 7 female models),
and responsive 2D/3D operational layouts. However, before declaring the greenfield
branch ready for formal team review and release consideration, a comprehensive
system-level qualification must behaviorally verify all safety gates, historical UI
failure remediations, provenance boundaries, license attributions, and offline
completeness without relying on unverified assumptions or obsolete test reports.

## Implementation

1. Behavioral verification of the four historical UI failures:
   - Null and non-finite telemetry fallback: verify missing/NaN/null channels
     render explicit "Unavailable" / "--" badges and diagonal hatch bands without
     "NaN"/"undefined" string leaks or numerical zero coercions.
   - Strict forecast channel binding: verify conformal uncertainty cones bind
     strictly to matching biometrics channels and suppress immediately on mismatch.
   - Reduced-motion deliberate confirmation: verify 1.5s keyboard hold-to-confirm
     remains enforced under `prefers-reduced-motion: reduce` without instant-click execution.
   - Unavailable WebGL deterministic 2D fallback: verify graceful degradation to 2D
     SVG schematic with intact playbook execution and safety gates.
2. Provenance, ordering, and connection lifecycle:
   - Validate live, replay (BIDMC), CSV playback, hardware (labeled mock when physical
     sensors are unattached), and What-If preview modes.
   - Reject out-of-order sequence snapshots monotonically.
   - Confirm automatic stale escalation and reconnect recovery.
3. All 15 playbooks and Gates 1-4 state machines:
   - Validate catalog of 15 crystallized and vitals playbooks (#01-#15).
   - Verify Gate 1 data integrity/staleness veto, Gate 2 contraindications,
     Gate 3 1.5s deliberate hold confirmation, and Gate 4 immutable audit logging.
4. Anatomy pipeline, donor switching, and fault injection:
   - Validate Z-Anatomy male (CC BY-SA 4.0) and HRA female (CC BY 4.0) switching.
   - Test absent structure disclosures and 404/corrupted asset recovery.
   - Verify offline voice intent parsing with non-bypassable Gate 3 interlocks.
5. License segregation and attribution integrity:
   - Verify separation of core application code (MIT/Apache-2.0) from anatomical assets.
   - Retain explicit creator attributions, license URIs, and modification notices.
6. Qualification reporting:
   - Compile comprehensive qualification results in `docs/evaluation/GREENFIELD_PHASE10_RESULTS.md`.

## Qualification gates

- Zero known P1 regressions in delivered scope.
- 160+ passing frontend unit and integration tests.
- 100% passing Rust workspace agent probe (0 unwrap/expect in crates, clippy 0 warnings).
- Playwright headless Chromium verification with 0 external network requests.
- Complete rollback instructions documented in the qualification record.
