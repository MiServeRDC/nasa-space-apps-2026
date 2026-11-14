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
