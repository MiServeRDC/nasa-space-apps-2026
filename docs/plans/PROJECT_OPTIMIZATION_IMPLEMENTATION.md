# Reliability and performance optimization

Base: main `2b0a9bc`. Authorized by the user to resolve the reviewed weaknesses
one at a time. Work on an isolated branch, with local checks only. Concurrent main
updates through `3516da4` were integrated before publication.

Status: software steps 1–6 and the reproducible validation in step 7 are complete.
See [measured results](../evaluation/OPTIMIZATION_RESULTS.md). The forecast candidate
was compared on development data and deliberately not promoted; no clinical
calibration or multi-day human validation is claimed.

## Ordered implementation and acceptance criteria

1. **Durable warm flushing.** Retain ownership of a batch until success, retry
   transient failures without taking another batch, expose failure/pending status,
   and return a typed failure on unsuccessful shutdown. Test failing storage,
   recovery, partial flush deadlines and bounded shutdown. Avoid claiming exactly
   once without backend idempotency; use a write-ahead recovery record if needed.
2. **Connect persistence.** Add an explicit local storage directory option to the
   normal CLI and desktop runtime. Persist ordered frames outside disk I/O locks,
   expose status, drain on graceful shutdown and test reopen/recovery. Keep raw
   validity/provenance and privacy rules. Do not enable clinical archiving silently
   in read-only smoke tests, calibration or dataset evaluation.
3. **Frontend update work.** Suspend the 20 Hz fallback when live data is active
   and there is no local What-If preview. Preserve immediate alarm/status delivery,
   native sample history and reconnection. Isolate expensive views from redundant
   updates using stable snapshots and measured memoization, not blanket throttling.
4. **Short server critical sections.** Capture one coherent immutable wire
   snapshot under the state lock; perform JSON construction/serialization and
   broadcast after releasing it. Retain ordering and HTTP/WS/IPC/MCP parity.
5. **Split optional UI.** Load portal, studio, audit/shortcut dialogs and 3D through
   local dynamic chunks with loading/error UI. Preserve the approved design and
   offline operation. Compare the initial production bundle before/after.
6. **Adaptive 3D.** Add Auto/Lite/Standard/High controls, bounded device pixel ratio,
   frame-time based adaptation and reduced-motion/hidden-view handling. Reuse
   materials with explicit lifecycle ownership. Preserve picking and UBERON IDs;
   do not arbitrarily merge anatomical parts or freeze required animations.
7. **Reproducible validation.** Add deterministic longer-duration dropout/drift,
   reconnection and persistence failure tests. Measure interval coverage/width per
   horizon and label synthetic stress tests separately from held-out evidence.
   Keep EWMA as default until a causal, development-only comparison supports a
   replacement. Include reproducible local benchmark commands and results.

## Research and verification

Official references: React `lazy` and `useSyncExternalStore`; React Three Fiber
scaling-performance/pitfalls; Tokio shared-state and graceful-shutdown guidance.
Scientific comparison candidates: Gibbs/Candes, Adaptive Conformal Inference Under
Distribution Shift (arXiv:2106.00170); Wu et al., Error-quantified Conformal Inference
for Time Series (ICLR 2025, arXiv:2502.00818). These inform comparisons, not automatic
claims of coverage or clinical calibration.

Run targeted failure/regression tests after each step, then frontend lint/build,
existing Node tests and the full default Rust workspace suite. Run the fast probe
before each commit. Save baseline/after logs outside git. Update the memory bank
with completed work and measured limits. No hosted Actions or automatic main merge
is implied by this task.
