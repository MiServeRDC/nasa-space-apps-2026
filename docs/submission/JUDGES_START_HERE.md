# ARES-Health: judge walkthrough

ARES-Health is a working **Gather -> Evaluate -> Act** software prototype for
onboard astronaut health support. This release uses a Rust engine and a local
browser cockpit. It requires no external inference service.

## Start from the GitHub repository (recommended)

Follow the [complete launch commands at the top of README](../../README.md#run-the-demo).
They install locked frontend dependencies, build the cockpit and run the Rust
engine in `ws-only` recorded-replay mode. Open **http://127.0.0.1:8080** and keep
the terminal open. Stop with **Ctrl+C**. No separate frontend server, model
weights, API keys, physical sensors or native archive are required.

The documented toolchain is Rust/Cargo 1.98 and Node.js 26/npm. Source downloads
and the first dependency installation require internet; runtime is local. The
qualified native platform is macOS Apple Silicon. Other platform builds and the
Docker template are not established by those macOS tests. Recording stays off.

### Troubleshooting

| Symptom | Action |
| --- | --- |
| GitHub asks for access or clone says not found | Ask the team to supply a judge-accessible repository/source link. A private URL does not provide access by itself. |
| `cargo`, `npm` or linker not found | Install the prerequisites in README. On macOS the compiler/linker comes with Xcode Command Line Tools. |
| First run is still compiling | Wait for Cargo to finish and report the server bind address; refresh the browser afterwards. |
| Address already in use | Stop the earlier owned demo, or append `--bind 127.0.0.1:18081` to the Cargo command and open that port. |
| Invalid frontend directory | Run the frontend build first and start Cargo from the repository root. |
| Data file missing | Keep `data/bidmc/` from the checkout and run from the root; do not download extra datasets for the demo. |
| Local simulation / engine disconnected | Confirm the Rust process is running, open its port, and leave both `VITE_ARES_*_URL` overrides unset before building. |
| Injection is not yet accepted | Wait 120 real seconds after backend startup for baseline learning. Restarting the engine restarts that wait. |
| HRV/MRI/TTV unavailable | Expected for numeric-only BIDMC replay: beat intervals and dependent assessments are not fabricated. |
| Optional 3D rendering unavailable | Use the fallback monitor and checklist; a recent browser with WebGL support is recommended for anatomy. |

Repository-first delivery requires no publicly hosted backend. It still requires
that judges can read/download the repository without additional permissions.
The video is a later, separate deliverable; no new slides are being prepared.

## Optional: start a separately supplied native bundle

This is an alternative only when the team actually supplies a matching archive;
the checkout itself does not contain `Start.command` or a precompiled binary.

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
attribution/license files under `ares-cockpit/public/anatomy/` in the repository
(or `frontend/anatomy/` in a native bundle), and generated package notices under
`frontend/third-party/` in a native bundle. Original code is MIT OR Apache-2.0; models and dependencies
retain their own licenses. The full source repository also contains test reports
under `docs/evaluation/` and `docs/architecture/MODEL_EVIDENCE_AUDIT.md`.

## Optional online judging copy

The same build supports a single public origin: frontend assets, `/api/*` and
`/ws/telemetry` are served together. HTTPS is terminated by the chosen hosting
platform/proxy; the browser automatically uses wss. Keep Rust private behind that
proxy, preserving Host and overwriting X-Forwarded-Proto. A hosted instance is a
**shared replay sandbox**: visitors share scenario controls and detector state.
Do not connect real sensors or enable persistence in that public copy.

Publishing requires the actual hosting target, TLS/public URL and an outside
browser check. A private GitHub URL is not publicly accessible to judges. The
team will provide the submission video later; no slides are part of this delivery.
