# Reliability and performance changes

Implementation plan: [PROJECT_OPTIMIZATION_IMPLEMENTATION.md](../plans/PROJECT_OPTIMIZATION_IMPLEMENTATION.md).
Base revision: `2b0a9bc`. All validation runs locally; GitHub Actions stays disabled.

## Local telemetry recording

Recording is explicitly enabled with a local directory. Ordinary tests, calibration
and dataset evaluation do not create an archive.

```bash
cargo run -p ares-server-cli --bin ares-server-cli -- \
  --mode ws-only --storage-dir "$HOME/.local/share/ares-health/telemetry"
cargo run -p ares-desktop-os -- --mode desktop \
  --storage-dir "$HOME/.local/share/ares-health/telemetry"
```

The CLI/desktop root has an exclusive process lease; a second writer is refused
before backend recovery can change files. Sequence numbering resumes from the
highest committed sequence on reopen. Both ordinary replay ticks and wearable
ingestion stage rows. What-If recomputation does not advance or duplicate samples.
The Arrow validity bitmap preserves unavailable HRV, rather than persisting zeros.

`GET /api/storage-status` reports whether a store is configured, pending rows,
committed segments, write failures and coalesced frames. Filesystem work and recovery
run outside Tokio workers and the mission-state critical section. Ctrl+C stops
producers, drains partial batches and returns a failure if persistence cannot finish.

Warm banks now require acknowledgement: a failed write releases the reservation
without clearing the rows. The background flusher retries with a bounded delay;
the synchronous path also preserves failed batches. A timer flushes partial banks,
not only full ones. A failed manifest commit rolls back in-memory segment metadata,
so a retry does not duplicate the same staged batch in the default Arrow backend.

This remains bounded, non-blocking recording: under a prolonged disk stall, the
pre-existing overflow policy coalesces excess raw frames into emergency summary
statistics and increments `warm_coalesced_frames`. It does not promise zero loss
of individual samples on disk failure or power loss. Rows pending in RAM are not
yet durable. Warm Arrow data uses the existing local storage format; this change
does not introduce automatic Cold-tier sealing, disk quotas or clinical approval.

## Frontend and publication

- The local 20 Hz simulator runs only for fallback or requested What-If preview.
  It pauses during ordinary live telemetry and resumes on disconnect. Alarm
  processing, validation, stale detection and native history are not throttled.
- The anatomical rendering boundary compares normalized clinical inputs and uses
  stable event handlers. Changes to missing values, alarms, topology, sex/profile
  or manual injuries still invalidate it.
- The server captures coherent owned wire data under the mission lock, then builds
  JSON and broadcasts outside that lock. A publication mutex preserves update
  ordering while allowing state readers to proceed during encoding.
- Anatomy, atlas, injury modal, portal, studio, audit and shortcut dialogs use local
  lazy chunks. Loading/failure UI is isolated to the optional panel. All chunks
  must ship with the app for offline operation. Default Assessment still needs 3D;
  loading on demand mainly benefits Overview and unopened applications.
- Auto/Lite/Standard/High affects rendering only. Auto uses measured FPS to adjust
  bounded pixel density; Lite and reduced-motion use demand rendering. Rendering
  stops in hidden tabs, offscreen viewports and behind other application overlays.
  Manual quality choice is retained locally and restored on navigation.
- Atlas materials are shared per layer and clinical region. Mesh identities,
  picking and cached geometry are preserved. Owned materials are disposed once.
  This reduces material objects, not necessarily draw calls or total GPU bytes.

## Reproduce validation

```bash
cargo test --workspace
cargo test -p ares-desktop-os --features tauri-runtime
bash scripts/agent_probe.sh --fast
npm --prefix ares-cockpit run lint
npm --prefix ares-cockpit run build
cd ares-cockpit
node --experimental-strip-types --test tests/*.test.ts
node --experimental-strip-types tests/atlas_material_probe.ts
```

`scripts/verify_optimization_browser.mjs` launches a real local server with a new
store, Vite and Chromium. Set `PLAYWRIGHT_MODULE` to the installed playwright-core
module path and `BROWSER_PATH` to a local Chromium executable. Build the debug
server and install cockpit dependencies first. The test uses a controlled WebSocket
to verify live/fallback/preview transitions, immediate critical alarm delivery,
reconnect, null HRV, lazy loading, Lite resolution, reduced-motion, hidden-tab
rendering and mobile overflow. Real server ingestion/HTTP/storage continue; Ctrl+C
must persist its last partial batch. Logs, results and screenshots remain in the
printed temporary artifact directory, outside git.

## Forecast comparison, without automatic model promotion

```bash
cargo run --release -p ares-nqs-stl --example forecast_soak -- 8
cargo run --release -p ares-server-cli --example forecast_controller_compare
```

The first command runs 8 hours each of stationary, artificial drift and periodic
dropout streams. An independent chronological queue checks production scoring at
all five horizons. Retained history entries are measured; an additional one-hour
test checks bounded baseline/forecast state and withdrawal/recovery after blackout.

The second command compares controllers using **only the existing 12 development
subjects**, with coverage, interval width and central-90% interval score. The
`horizon_scaled_width` candidate divides the feedback gain by horizon; that is an
experimental engineering choice, not a published guarantee or a clinical constant.
It stays **false by default**: it reduces synthetic delayed-feedback oscillation,
but worsens coverage on these short real development recordings. It is not
promoted based on a favorable synthetic result. The current detector thresholds,
EWMA defaults and model-validation status remain unchanged. Multi-day human
validation and safe baseline re-learning remain separate clinical research needs.

References: [React lazy](https://react.dev/reference/react/lazy),
[R3F performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance),
[Drei PerformanceMonitor](https://drei.docs.pmnd.rs/performances/performance-monitor),
[Tokio shared state](https://tokio.rs/tokio/tutorial/shared-state),
[Tokio shutdown](https://tokio.rs/tokio/topics/shutdown),
[Szabadvary 2024](https://proceedings.mlr.press/v230/hallberg-szabadvary24a.html),
[Gibbs/Candes 2021](https://arxiv.org/abs/2106.00170),
[Wu et al. 2025](https://arxiv.org/abs/2502.00818).
