# Judges handoff readiness

Date: 2026-11-15. Initial baseline main 56b888d; integrated subsequent UX update
aea748b without conflicts and repeated frontend/live checks. Branch release/judges-handoff.
**Status: native software preparation verified. GitHub source delivery is public.**
A separately hosted cockpit is outside this verification.

## Repository-first handoff update

The team subsequently chose GitHub source delivery. Public hosting is not a
prerequisite for running the source demo. README now provides the complete launch
path before architecture; the walkthrough distinguishes checkout and optional
archive paths. Reverified the documented npm install/build and Cargo launch,
329 default Rust tests, real-browser connected replay (30 WS frames, no page
errors), ready endpoint and English CLI diagnostics. Remaining Italian is listed
in [the language audit](REPOSITORY_LANGUAGE_AUDIT.md). A subsequent unauthenticated check on 2026-11-15 confirmed that the GitHub
repository and the main-branch source ZIP are public.

## Completed

- Optional `--frontend-dir` serves built cockpit, APIs and WS from one Rust process.
  Default bind remains 127.0.0.1. No Node/npm/Python runtime is needed after native
  packaging. CLI startup rejects a missing built index; missing API/assets remain
  real 404s rather than an HTML fallback. `/healthz` reports application readiness,
  not clinical health or completion of baseline learning.
- Browser endpoints default to their own origin and derive ws/wss from http/https.
  Explicit overrides and native-shell loopback remain supported. Vite dev proxies
  the local API/WS; client configuration contains no credentials.
- Integrated mode rejects cross-origin browser requests, removes wildcard CORS,
  sets content/security/cache headers and permits local WASM/worker model decoding.
  TLS proxy configuration must preserve Host, overwrite X-Forwarded-Proto and keep
  the Rust backend private. This is not health-user authentication.
- Rust responds to both SIGINT and Unix SIGTERM with its graceful shutdown path.
- Native package builder includes runtime assets/data, launcher, target/version,
  source commit/dirty marker, source archive for clean commits and SHA-256 manifests.
  It refuses to overwrite a bundle and does not include development runtimes.
- English reviewer walkthrough and submission copy now distinguish replay, scenario
  models, NASA research context, actual BIDMC data and unqualified functionality.
  The source checkout omits draft videos, slides and their production assets.
- Generic Docker/Caddy/compose templates are supplied; they are not a tested Linux
  deployment. Container data recording is off and the local example binds only
  127.0.0.1 externally. No hosted Actions, paid services or public visibility changes.

## Evidence on this Mac

| Check | Result |
| --- | --- |
| Rust workspace all ARES features, serial | 337 passed; 0 failed/ignored |
| Rust workspace defaults, serial | 329 passed; 0 failed/ignored |
| Frontend unit/behavior tests | 175 passed; 0 failed/skipped |
| TypeScript and optimized native release build | Passed |
| All-feature/all-target workspace Clippy | Passed; existing upstream warnings remain documented |
| Static/API boundary, traversal and origin/proxy HTTP tests | 3 passed (included above) |
| Native single-origin production browser | All 19 latest checkpoints passed; 2,779 WS frames; no page/CSP errors, failed HTTP responses or attempted external HTTP requests in main context |
| Relocated native bundle without development tools on PATH | Passed: startup, HTML/headers, real replay, null HRV and recording disabled |
| Packaged process receiving SIGTERM | Clean exit 0 |
| Docker compose syntax | Passed; daemon unavailable, image not built |
| Source preflight | No high-confidence token/private-key markers found in current first-party files; not a history/credential audit |

The latest live checks include real baseline learning, synthetic detector event,
playbook/step continuity, same-source restart and an absent-hardware restart,
responsive layout and WebGL-unavailable fallback. Native executable size is
approximately 10 MB; the preview archive was approximately 52 MB. Preview artifacts
are explicitly marked dirty and are not authoritative final releases.

Artifacts/logs are external at `/tmp/ares-judges-readiness/`, including
`standalone-browser/results.json` (initial) and `standalone-latest/results.json`
(latest UX, including vital-event versus mission-ultrasound distinction), `rust-all-features.log`, `rust-default.log`,
`frontend-serving-tests.log`, `frontend-tests.log`, `clippy.log`,
`native-launch-results.json`, `sigterm.log` and `source-preflight.json`.
A final clean bundle can be generated after committing the verified source using
`scripts/build_judges_bundle.mjs`.

The notice collector records 443 installed/resolved package versions, declared
licenses and available root notice texts. Seventeen entries have no root text;
some are build-only/unused. This index is not a complete legal clearance or a claim
that all optional packages run. Retained source/license identifiers and separate
model/font credits must accompany distribution; reconcile active dependencies'
required notices before public redistribution.

## Still required for public online readiness

1. The actual hosting account/platform/domain and any cost decision. No target was
   provided during this preparation, so no account, service or DNS was provisioned.
2. Build/test the actual target image (the local Docker CLI points to an absent
   OrbStack daemon), establish HTTPS and WS upgrade forwarding, and keep backend
   access private behind the configured proxy.
3. Exercise the deployed origin from an external/private browser: no judge-local
   loopback dependency, correct wss stream, source labels, full baseline/event/ACT,
   refresh/reconnect, assets and no unintended external data calls.
4. Use the verified public source link. Confirm the separate demo URL, team
   AI-tool disclosures and portal fields before submitting.

Optional LanceDB parity and physical hardware/native GUI/LLM/voice are outside the
selected replay release, not silently completed. Model status stays illustrative
and unvalidated. Passing local tests cannot establish the missing hosted checks.
