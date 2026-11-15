# Judging deployment

This is a recorded-data/scenario sandbox, not a live medical service. The default
local release needs no external inference API. The team has deferred its video;
no slides are prepared. Hosting and final portal submission are separate steps.

## Native local release

```bash
npm --prefix ares-cockpit ci --ignore-scripts --no-audit --no-fund
VITE_ARES_HTTP_URL= VITE_ARES_WS_URL= npm --prefix ares-cockpit run build
cargo build --release --locked -p ares-server-cli --bin ares-server-cli
./target/release/ares-server-cli --mode ws-only --frontend-dir ares-cockpit/dist
```

Open http://127.0.0.1:8080. Default bind remains loopback. `--frontend-dir` requires
index.html and does not rewrite missing assets/API paths to a fictitious 200 page.
`/healthz` means state is available, not that health readings are nominal.

After committing verified changes, create a redistributable native bundle:

```bash
node scripts/build_judges_bundle.mjs --out /absolute/output-directory
```

This includes runtime assets, BIDMC, code/model/dependency credits, launch script,
source commit and SHA-256 manifests. `--allow-dirty` creates preview artifacts only
and labels them dirty; it does not produce an authoritative source archive.

## Container / hosting target

```bash
docker compose -f deploy/judges/compose.yaml config --quiet
docker compose -f deploy/judges/compose.yaml up --build
```

The local example publishes only 127.0.0.1:18080. It runs without root privileges,
with a read-only filesystem, no extra Linux capabilities, recording off and no
hardware. It is a template until the Linux image is actually built/tested. The
preparation machine currently has no active Docker/OrbStack daemon; native macOS
checks do not establish Linux container correctness.

For an existing container hosting platform, use the Dockerfile, its standard PORT
variable, `/healthz` readiness and WebSocket support. Configure HTTPS on the host.
For a VM, the example Caddyfile illustrates a real-domain TLS proxy. Rust must be
private behind it. The proxy must preserve Host and replace X-Forwarded-Proto;
user-supplied forwarded headers are not authentication. The example blocks
source-mode mutation so this public copy stays on replay. Keep recording disabled.
The app's integrated mode rejects mismatched browser origins, removes wildcard
CORS, and serves a CSP appropriate to local WASM/worker anatomy decoding. This is
not user authentication or an authorization design for private health data.

Do not deploy just dist to a static host and call that a live Rust demonstration.
Do not publish a private repository link as the only final-project URL. Keep the
judge-accessible project and video links public and test them logged out. Original
repository visibility is unchanged by this preparation. No paid services or hosted
Actions are enabled.

## Publication gate

- Confirm selected hosting account/domain and any resource cost before provisioning.
- Build/test the actual platform image; keep a fixed release SHA and image digest.
- Visit HTTPS from another device/private window, without any localhost backend.
- Confirm Engine connected, replay provenance, wss frames and ready endpoint.
- Exercise real baseline/injection/ACT and refresh/reconnect on that hosted origin.
- Verify anatomy/decoder/font assets load without unexpected external requests.
- Confirm no recording/hardware, public shared-state disclosure and license credits.
- Add the public final-project and later video URLs to the submission.

Support guidance: https://github.com/nasa/spaceapps/discussions/1991 and
https://github.com/nasa/spaceapps/discussions/2025 (checked 2026-11-15).
