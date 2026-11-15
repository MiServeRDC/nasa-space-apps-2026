# Final frontend/backend integration qualification

Baseline: origin/main fb70b72. Isolated worktree /tmp/ares-final-integration;
branch work/MiServeRDC-integration-qualification. No main merge/push or hosted CI.

1. Inventory current entry point, workspace/features, source datasets and actual
   HTTP/WebSocket/binary contracts; distinguish old/unreachable UI harnesses.
2. Install from the committed npm lock; run frontend types/tests/production build.
   Run default Rust workspace tests and all-target Clippy using this worktree's
   Cargo target. Logs stay outside git and name the exact baseline and changes.
3. Launch the actual Rust server on an isolated loopback port, with repository
   graph outputs and optional persistence redirected to temporary storage. Build
   and serve the actual current frontend against that process. Do not substitute
   synthetic numbers or local preview for backend replay during live checks.
4. Verify snapshot/JSON WebSocket/binary parity, freshness, null HRV/readiness,
   native source/cadence and forecast channel/unit binding. Exercise replay,
   explicit What-If/sex/CO2 changes, anomaly readiness/injection/clear, incident
   playbooks and safe action status. Use real request/response/browser evidence.
5. Exercise reconnect/stale behavior, no-WebGL fallback and responsive layout;
   check required local assets and absence of runtime external network requests.
   Cover persisted/audit flows and MCP/desktop transports to the extent available
   on this Mac; record unsupported or unexercised hardware/features honestly.
6. Fix reproducible integration defects without changing clinical constants or
   model validation status. Add focused regression tests; rerun affected checks.
   Any change needing a clinical/model decision stays an explicit finding.
7. Produce a concise source-grounded report: exact versions, counts/results,
   observed defects/fixes, real end-to-end outcomes, exclusions and remaining
   risks. Update Memory Bank. Run the required local fast probe before a commit.

Software correctness checks are not clinical effectiveness, sensor validation or
proof that the system is free of defects. Baseline/output logs are not replaced by
old positive reports or synthetic-only harnesses.

## Confirmed integration corrections

Production-browser checks against the real Rust process reproduced two contract defects:
1. Pure BIDMC replay hides the unmeasured organ models but still emits a model-derived SANS procedure. Gate automatic procedure selection on explicit scenario mode; keep real detector-selected procedures and existing safety gates. ACT must remain in standby until a procedure is suggested or explicitly chosen for manual review.
2. Switching the cockpit overlay off does not tell Rust to leave scenario mode. Add a backward-compatible optional `overlay_active` patch, serialize transitions with existing scenario requests, and verify on/off/reconnect via the real API. Do not reset recorded samples or detector learning.

No physiological constants or detector thresholds will be changed. Preserve checklist state for actual incidents and explicit manual catalog selection.
