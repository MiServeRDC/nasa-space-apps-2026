# Experience Log & Anti-Recurrence Invariants: ARES-Health

> **Purpose:** Records mathematical, clinical, and systems engineering failure modes discovered during design and peer-review so no human teammate or AI coding agent ever re-introduces them.

---

## Entry 001 — Dimensional Inconsistency in Jugular Wall Shear Stress ($\tau_w$)
* **Failure Mode Prevented:** Writing $\tau_w \propto v_{\max} / \text{IJV\_CSA}$ produces units of $\text{dyn/cm}^3$ instead of pressure/stress ($\text{dyn/cm}^2$).
* **Mandatory Invariant:** Always express radius as $r(t) = \sqrt{\text{IJV\_CSA}(t)/\pi}$, yielding $\tau_w(t) = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\pi / \text{IJV\_CSA}(t)}$ with $\mu = 0.035\text{ Poise}$.

## Entry 002 — Fatal Intracranial Hemorrhage Risk from Empirical Anticoagulation
* **Failure Mode Prevented:** Automatically prescribing Apixaban or Enoxaparin solely on slow jugular velocity ($v_{\max} < 5.0\text{ cm/s}$) exposes astronauts to fatal subdural/intracranial bleeding during minor head impacts in microgravity or EVA.
* **Mandatory Invariant (Hard Safety Gate 1):** Lock out pharmacological anticoagulants unless POCUS confirms a non-compressible intraluminal thrombus (`pocus_thrombus_confirmed == true`). Isolated stasis is treated strictly with physical $-30\text{ mmHg}$ LBNP, calf contractions/NMES, and controlled hydration.

## Entry 003 — Pre-Syncopal Hypotension During LBNP Countermeasure
* **Failure Mode Prevented:** Unmonitored $-30\text{ mmHg}$ Lower Body Negative Pressure can sequester $> 500\text{ mL}$ of blood in the lower limbs, triggering acute orthostatic syncope in a solo astronaut.
* **Mandatory Invariant (Hard Safety Gate 2):** Continuously monitor blood pressure and heart rate during LBNP; automatically vent the chamber to $0\text{ mmHg}$ (`AUTO_VENT_LBNP_CHAMBER`) if systolic BP drops by $> 15\text{ mmHg}$ from baseline or HR exceeds $115\text{ bpm}$ (calibrated on NLSP *Neuroendocrine Tilt* data).

## Entry 004 — Unit Scale Dominance in Classical Signal Temporal Logic (STL)
* **Failure Mode Prevented:** Combining raw predicates with different physical units in $\min(\rho_1, \rho_2)$ causes small-magnitude variables ($\tau_w \in [0, 4]$) to permanently mask large-magnitude variables ($\text{ARED} \in [0, 150]$).
* **Mandatory Invariant:** Always normalize atomic predicates via NQS-STL: $\hat{\rho}_k(t) = s_k (x_k(t) - x_{k,\text{crit}}) / |x_{k,\text{nom}} - x_{k,\text{crit}}| \in (-\infty, +1.0]$.

## Entry 005 — Transport Contention Between UI Streaming and MCP stdio
* **Failure Mode Prevented:** Streaming $20\text{ Hz}$ UI telemetry over the same `stdio` pipe used by the FastMCP JSON-RPC copilot corrupts JSON-RPC framing.
* **Mandatory Invariant:** Isolate UI streaming (`axum` HTTP/WebSocket on `127.0.0.1:8080`) from AI copilot communication (`stdio` JSON-RPC 2.0) over shared state (`Arc<RwLock<MissionState>>`).

## Entry 006 — BIDMC CSV Header Whitespace, Missing Sensor Values & Provenance Separation (Issue #4)
* **Failure Mode Prevented:**
  1. Parsing `data/bidmc/bidmc_*_Numerics.csv` without trimming headers fails because PhysioNet BIDMC CSV columns contain leading spaces (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`).
  2. Coercing the 13 missing `PULSE` and `SpO2` samples in `bidmc_01_Numerics.csv` to `0.0` triggers false critical hypoxemia (`SpO2 = 0%`) and cardiac arrest (`PULSE = 0 bpm`) alarms.
  3. Conflating biological/mechanistic OSDR studies (`OSD-51`, `OSD-195`, `OSD-818`) with continuous real-time clinical waveform feeds undermines scientific credibility during NASA judging.
* **Mandatory Invariant:** Always trim CSV headers and cell values on ingestion, preserve missing samples as `Option<f64>::None` (`null` in JSON) with channel names recorded in `missing_channels`, keep native `1 Hz` relative recording time (`0..480 s`) explicit alongside `20 Hz` UI frame interpolation, and explicitly tag `RECORDED_TERRESTRIAL_BIDMC_CSV`, `DERIVED_COMPUTED`, and `SIMULATED_SCENARIO_INPUT` in `provenance_manifest`.

## Entry 007 — O(1) Lemire-Donze Sliding Window STL & Type-1 Crystallized Playbooks (`deep-scholar` Grounding)
* **Failure Mode Prevented:**
  1. Re-scanning the entire sliding temporal window $[t-W, t]$ at every tick to evaluate $\Box_{[t-W,t]} \hat{\rho}_k(t)$ scales as $O(W)$ and causes latency spikes when users drag the What-If Stress-Test Console sliders at $20\text{ Hz}$.
  2. Delegating emergency medical playbook selection (`Playbooks #01-#05` and the 3 Hard Safety Gates) to multi-turn LLM reasoning (Type-3 Agent-Orchestrated) introduces stochastic delay ($3\text{–}15\text{ s}$) and potential safety gate bypass.
* **Mandatory Invariant:**
  1. In `crates/ares-nqs-stl/src/sliding_window.rs`, use **Daniel Lemire's monotonic wedge (`VecDeque`)** as formalized for Signal Temporal Logic by **Donze, Ferrere & Maler (CAV 2013, `DOI: 10.1007/978-3-642-39799-8_19`)** to compute $\min_{\tau \in [t-W, t]} \hat{\rho}_k(\tau)$ in amortized **$O(1)$ time ($\le 3$ comparisons/sample)**.
  2. In `crates/ares-medops-playbooks`, compile all 5 MedOps playbooks and the 3 Hard Clinical Safety Gates as **Type-1 Deterministic Crystallized DAGs** (**Arun Malik**, `arXiv:2607.07052v1`, 2026; **Li et al. ProgRouter**, EMNLP 2026, `arXiv:2608.25992v2`) executing in $< 50\,\mu\text{s}$ in pure Rust, reserving `FastMCP stdio` strictly for compact (`< 150 token`) explanations.
