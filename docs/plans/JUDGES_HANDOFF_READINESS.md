# Judges handoff readiness

Baseline main 56b888d; branch release/judges-handoff. Preparation only: no paid
services, hosted Actions, repository visibility changes or public deployment.
The target hosting/access preference has been asked; prepare portable artifacts
independently while awaiting it. The default Arrow backend is the release path.

## Release gaps

The current front end defaults to the reviewer's loopback API, there is no single
self-contained app launch, submission copy still describes Timestral as the live
predictor, and the private repository URL alone is not publicly accessible.
The optional LanceDB adapter and physical/native/LLM integrations are not release
prerequisites for the existing replay/scenario demo and must not be presented as
completed or clinically validated.

## Implementation and review sequence

1. Support same-origin HTTP/WebSocket discovery while retaining explicit endpoint
   overrides and native loopback fallback; keep Vite development usable through
   a loopback proxy. Test HTTPS/wss and local/desktop cases.
2. Add optional CLI serving of the built frontend with APIs and WS from one Rust
   process, plus a small readiness endpoint. Validate the asset directory before
   startup; serve only its contents, keep missing assets/API routes as 404, and
   reject cross-origin browser requests in this integrated mode. Default bind is
   still 127.0.0.1. Do not change clinical logic, replay speed or baseline learning.
3. Provide a reproducible native package builder with manifests/checksums, only
   runtime data/assets/licenses and explicit host architecture. The standalone
   local launcher must work without Node, npm, Rust or a Python runtime.
4. Prepare platform-neutral container/hosting configuration and a launch/checklist
   guide. Verify locally where tooling exists; Docker daemon currently unavailable
   (OrbStack socket absent). Do not claim a Linux image is tested without building.
   Any hosted instance needs HTTPS and appropriate access; the judging copy uses
   public replay data, no hardware and recording off. Shared controls/state must
   be disclosed. Final source/demo links must satisfy public-access submission
   rules; a login-only/private URL is not a final deliverable.
5. Replace stale submission copy with evidence-aligned English text, a short
   judge walkthrough, explicit NASA-resource/PhysioNet/asset attribution, AI-tool
   disclosure and current limits. The user explicitly deferred the video and
   declined slides: create neither. Do not invent
   NASA endorsement, clinical validation, trained-model performance, hardware
   acquisition, awards or dates/requirements not verified from official sources.
6. Test the actual standalone entry point and relocated package in Chrome,
   including baseline, synthetic event, playbook, same-source recovery, static
   path isolation and no external runtime requests. Use local Cargo/npm checks.
7. Update Memory Bank, run the fast probe, commit and deliver the concrete
   artifacts. Public publication and portal submission await the actual hosting
   target/public access decision; do not change private repository visibility.
