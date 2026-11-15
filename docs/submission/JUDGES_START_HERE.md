# ARES-Health: judge walkthrough

ARES-Health is a working **Gather -> Evaluate -> Act** software prototype for
onboard astronaut health support. This release uses a Rust engine and a local
browser cockpit. It requires no external inference service.

## Start the native demo

The native bundle's operating system and CPU architecture are in `RELEASE.json`.
Use the matching bundle; the current locally built artifact targets macOS Apple
Silicon. It is an unsigned research executable, not a notarized app-store release.

1. Extract the archive and open `Start.command` (or run it in Terminal).
2. Keep the terminal open. The browser opens `http://127.0.0.1:18080`.
3. Stop with Ctrl+C. Recording is off by default. Logs are printed by the launcher.

The prepared bundle needs no Node/npm, Cargo/Rust toolchain or Python interpreter.
macOS provides the launcher shell and curl. A port conflict causes startup to fail;
set `ARES_PORT=18081` when launching to choose another port. Browser refresh does
not reset the backend; stopping/restarting it starts a new replay/baseline.

## Three-minute walkthrough

- **GATHER:** confirm `Engine connected` and `TERRESTRIAL REPLAY`. Heart rate,
  oxygen saturation, respiration and pulse come from de-identified PhysioNet BIDMC
  numerics at 1 Hz; the interface refreshes at 20 Hz. The ECG trace is explicitly
  illustrative, not an acquired waveform. Missing HRV/MRI/TTV is intentional.
- Wait **120 real seconds** for personal-baseline learning. Explore EVALUATE while
  waiting. The 8-minute recording loops and relearns its detector baseline.
- **EVALUATE:** inspect body regions and scenario controls. Enable the What-If
  overlay explicitly to explore illustrative organ models; it does not transform
  the recording into actual spaceflight measurements. Switch it off to return to
  pure replay. Unavailable inputs remain unavailable.
- Return to GATHER and press **DESATURATION** once the baseline is ready. The
  synthetic-event banner identifies the injection. A sufficiently sustained
  deviation raises the real detector's alarm; select **ACT** to inspect the
  selected desaturation playbook. The demonstration is an engineering scenario,
  not a patient experiment or clinical sensitivity estimate.
- Confirm a step, navigate away/back, and observe that progress is retained.
  Checklist completion is independent of physiological recovery. CLEAR removes
  the injection, not the need to verify incoming readings.

If the engine is disconnected the interface labels local simulation. That is not
a successful live-backend demo. A healthy launch is not a clinically nominal
reading: incomplete/unsupported health indicators remain explicitly unavailable.

## Evidence and scope

NASA HRP/OSDR/standards are research and scenario context; BIDMC provides the
actual terrestrial replay. Neither the models nor playbooks are NASA-certified,
clinically validated or commands to physical treatment devices. Synthetic POCUS,
longer scenario trajectories and body markers are illustrative. The selected
release uses default Arrow storage infrastructure with recording disabled; the
optional LanceDB adapter is experimental and is not the deployment backend.
Physical wearable acquisition, a native Tauri GUI and real local LLM/voice weights
are not required for or established by this release.

Known-source citations and boundaries are in `data/bidmc/README.md`, the model
attribution/license files under `frontend/anatomy`, and package notices under
`frontend/third-party`. Original code is MIT OR Apache-2.0; models and dependencies
retain their own licenses. The full source repository also contains test reports
under `docs/evaluation/` and `docs/architecture/MODEL_EVIDENCE_AUDIT.md`.

## Online judging copy

The same build supports a single public origin: frontend assets, `/api/*` and
`/ws/telemetry` are served together. HTTPS is terminated by the chosen hosting
platform/proxy; the browser automatically uses wss. Keep Rust private behind that
proxy, preserving Host and overwriting X-Forwarded-Proto. A hosted instance is a
**shared replay sandbox**: visitors share scenario controls and detector state.
Do not connect real sensors or enable persistence in that public copy.

Publishing requires the actual hosting target, TLS/public URL and an outside
browser check. A private GitHub URL is not publicly accessible to judges. The
team will provide the submission video later; no slides are part of this delivery.
