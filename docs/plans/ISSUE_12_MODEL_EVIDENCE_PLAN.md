# Issue #12: model evidence and honest output semantics

Baseline: main `187b933` (PR #20 merged with phases 15-20). This task audits the implemented model and changes descriptive output semantics, not treatment rules, numerical thresholds or medical procedures.

## Deliverables

1. A source-to-output evidence register covering formulas, inputs, units, parameter origin, relevant population, calibration assets, validation status and permitted wording for each family of displayed derived indicators.
2. A parameter/boundary review including fixed priors and likelihood ratios, weighted scores, integration/clamping horizons, TTV sensitivity and the new deterministic Timestral and heuristic gate.
3. Machine-readable `ILLUSTRATIVE_UNVALIDATED` status on telemetry and forecast snapshots and in MCP outputs. Rename the emitted calibrated gate state to heuristic acceptance, preserving a legacy deserialization alias. Neither an accepted gate nor a monotone interval establishes clinical calibration.
4. Label the existing fixed-rate TTV range as illustrative. Retain legacy field/function compatibility with explicit descriptions instead of silently changing downstream field names.
5. Prominent evidence-status notices in the dossier, frontend integration guidance and Memory Bank. Current main has no executable cockpit; require future clients to consume the status and never display unsupported clinical confidence.

## Verification

- Regression test that an accepted default gate emits no claim of calibration, including before any coverage observations.
- Serialize validation/interval status through the actual server/MCP projection and maintain the context byte budget.
- Test TTV physical-unit boundaries, clipping and dependence on its assumed degradation rate; characterize these as numerical behavior, not outcome accuracy.
- Preserve all HRV null, known hazard and safety-gate regressions; run local workspace tests and the full repository probe.
- No hosted Actions or runtime external services.

## Scope limits

Clinical calibration and prospective validation are not manufactured by this task. Record the data, independent expert review and evaluation designs required before stronger claims. No drug, intervention or equipment-control policy is changed. Experimental forecasting performance belongs to #19; schema-wide/cockpit integration remains #8.


## Issue #12 verification results

- `RUST_TEST_THREADS=1 bash scripts/agent_probe.sh --all`: passed; 86 tests, no failures, check and strict all-target Clippy passed.
- `cargo build --workspace --locked --quiet`: passed.
- Actual MCP subprocess: health, quantile and spatial responses carry `ILLUSTRATIVE_UNVALIDATED`, remain valid JSON and are 338/216/477 bytes respectively. The integration test verifies all eight tool outputs retain model status and respect the existing byte limit.
- The first parallel full-probe run failed the existing 150 us wall-clock timing assertion (200.23 us). The unchanged assertion passes with serial tests. This documents execution sensitivity; no timing threshold was loosened and no under-load performance guarantee is claimed.
- No browser qualification: executable cockpit is not integrated on this baseline. Historical PDF exports are not regenerated. These integration/document-export limits are recorded in the evidence audit.
- Numerical model coefficients, playbook policies and clinical guard thresholds are unchanged.
