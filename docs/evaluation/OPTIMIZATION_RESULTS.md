# Optimization results

Date: 2026-11-14. Initial base: `2b0a9bc`; integrated concurrent main at
`3516da4`. Verified on the local Apple Silicon Mac;
these are not cross-platform performance or clinical-validation claims.

## Before and after

| Item | Before | After | Interpretation |
|---|---|---|---|
| Main JavaScript bundle | 1,606.49 kB / 453.74 kB gzip before splitting | 435.70 kB / 132.23 kB gzip | About 73% fewer main-entry bytes; Assessment still loads its 3D chunks |
| Atlas material construction, all five actual GLBs | 3,746 per-mesh material objects | 11 per-layer/region material objects | Mesh instances, geometry and picking retained; not an FPS/RAM percentage |
| Unused local simulator during live telemetry | Always scheduled at 20 Hz | No local frame increments while paused | Browser hook regression also checks preview, disconnect and reconnect |
| Warm write failure | Bank cleared before persistence; error discarded | Rows retained for retry; failure observable | Failure/recovery and unsuccessful shutdown regression tests pass |
| Partial Warm batch | Timer did not force partial drain | Timer and shutdown drain partial banks | Tested below the configured full-batch size |
| Runtime recording | Storage crate isolated from normal CLI/desktop | Explicit `--storage-dir`, status endpoint, process lease, sequence recovery | Tested with a new nested path and after reopen |
| Mission-state critical section | Wire JSON construction and encoding inside writer | Owned coherent snapshot; JSON construction/encoding outside writer | Ordered publication retained; no percentage latency claim |
| Idle/hidden anatomy | Continuously rendered | Bounded adaptive DPR; Lite/reduced-motion demand mode; hidden/covered views stop | Tested resolution, reduced motion and visibility in Chromium |

Before integrating concurrent main, chunk splitting reduced the entry to
432.32 kB / 131.41 kB gzip (both comparison builds included the small
simulation/memoization changes). The table reports the final combined tree,
including the team’s new gate badges and other main updates. It is not a measurement of total application size,
download size for the default 3D page, startup CPU, or total GPU memory. The large
shared 3D chunk warning remains; no geometry decimation was applied blindly.

## Regression evidence

- Default Rust workspace: **212 tests passed**.
- Desktop `tauri-runtime` configuration: **15 tests passed** (overlaps default tests).
- Frontend Node: **26 tests passed**, including null/alert equivalence, render policy
  and material ownership/disposal. TypeScript lint and production build passed.
- Workspace/all-target Clippy: no warnings with `-D warnings`.
- Browser/process checks: live/preview/fallback/reconnect, immediate critical alarm
  and null HRV, deferred modules, Lite pixel density, saved profile, reduced motion,
  hidden/covered rendering, mobile overflow and final partial storage flush.
- The regenerated anomaly report's tables match the base report. Its manually
  appended dual-horizon architecture section is not produced by that generator;
  no detector/forecast results were changed to hide this documentation difference.

Full logs and browser screenshots are retained outside git. Commands and the
test harness are documented in [PROJECT_OPTIMIZATION.md](../operations/PROJECT_OPTIMIZATION.md).

## Longer forecasting evaluation and decision

[Eight-hour stress streams](FORECAST_STRESS_8H.md) independently score forecasts
issued at earlier times across all five horizons. The maximum retained state was
**8,940 history entries** in each arm. The one-hour dropout/baseline test also checks
bounded state, interval withdrawal and re-warm-up after a sensor returns.

The experiment exposed delayed-feedback oscillation: on the synthetic stationary
HR stream at +120 s, the existing controller had 88.54% coverage with mean interval
width 32.365 bpm. An experimental gain divided by the forecast horizon gave 89.94%
and width 5.804 bpm there. That attractive synthetic result was **not** enough to
change production behavior.

On [the 12 development subjects](FORECAST_CONTROLLER_DEVELOPMENT.md), the same
candidate lowered HR +60 s coverage from 85.04% to 68.70%, and HR +120 s from 72.17%
to 61.67%. Interval scores improved but coverage worsened. The candidate is retained
only as an explicitly disabled experiment (`horizon_scaled_width = false` by
default); no further search on held-out subjects selected new parameters.

The current EWMA defaults, detector thresholds and illustrative/unvalidated status
remain unchanged. These tests expose the coverage/width tradeoff; they do not
resolve the lack of multi-day human data or establish medical effectiveness.

## Durability limits

Warm pending rows are volatile until committed. Sustained disk overload uses the
existing bounded coalescing policy, visible in `warm_coalesced_frames`. Recording
does not imply zero loss during power failure or unlimited disk retention; automatic
Cold sealing/quotas were not introduced by this optimization. Graceful shutdown
reports an error rather than claiming successful persistence when a write fails.

## Authorized release integration

Before the user-authorized main merge, concurrent main `d1d6227` added only
Phase 37 scenario tests and memory records. Its 6 Rust scenario tests pass on
the combined branch, and all 32 current frontend tests pass. The earlier full
workspace run had 212 tests; the additional suite brings the inventory to 218.
Production source and the measured bundle are unchanged by this integration.
