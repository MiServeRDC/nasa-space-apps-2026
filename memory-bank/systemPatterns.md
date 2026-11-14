# System Patterns & Architectural Invariants: ARES-Health

## 1. Core Architectural Topology (Dual-Transport Safe Rust + React 3D Cockpit)
ARES-Health decouples deterministic physiological computation from visual rendering and natural-language explanation:

```
+---------------------------------------+     +---------------------------------------+
|     ASTRONAUT COCKPIT (ares-cockpit)  |     |    ON-BOARD EDGE AI COPILOT (LLM)     |
|   React 19 + TypeScript + Three.js    |     |   Local Quantized Model (llama.cpp)   |
|   OLED #000000 + What-If Console      |     |   Zero Cloud - Zero Hallucinations    |
+---------------------------------------+     +---------------------------------------+
                    ^                                             ^
                    | 20 Hz WebSocket + REST                      | JSON-RPC 2.0 (FastMCP)
                    | (127.0.0.1:8080 Loopback)                   | (Dedicated stdio Pipe)
                    v                                             v
+-------------------------------------------------------------------------------------+
|                    ARES-ENGINE (7-Crate Modular Safe Rust Workspace)                |
|  1. ares-core-types         (Shared Telemetry Schema, Units, Privacy & Audit Traits)|
|  2. ares-telemetry-ingest   (Ring Buffer, Radar/Vocal DSP, CANS Neutron, SQI>=0.70) |
|  3. ares-causal-graph       (ADHG petgraph, Frost-Hargens ODEs, Shear tau_w, POCUS) |
|  4. ares-nqs-stl            (O(1) Lemire Wedge NQS-STL rho_hat, EWMA-OLS TTV, MRI)  |
|  5. ares-medops-playbooks   (Playbooks #01-#05 DAGs + 3 Hard Clinical Safety Gates) |
|  6. ares-security-privacy   (Role-Based Crew Privacy Tiers, SHA-256 Audit, AEAD DSN)|
|  7. ares-server-cli         (Concurrent Tokio axum WebSocket + stdio FastMCP <150t) |
+-------------------------------------------------------------------------------------+
```

---

## 2. Non-Negotiable Mathematical & Clinical Invariants

### Invariant 1: Dimensional Venous Wall Shear Stress ($\tau_w$)
Internal Jugular Vein (IJV) endothelial wall shear stress under cylindrical Poiseuille/Womersley flow is computed strictly as:
$$\tau_w(t) = \frac{2 \cdot \mu \cdot v_{\max}(t)}{r(t)} = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\frac{\pi}{\text{IJV\_CSA}(t)}}$$
* $\mu = 0.035\text{ Poise}$ ($\text{g}\cdot\text{cm}^{-1}\cdot\text{s}^{-1}$).
* Nominal Earth/1g baseline: $v_{\max} = 30\text{ cm/s}$, $\text{CSA} = 1.0\text{ cm}^2 \implies \tau_w = 3.72\text{ dyn/cm}^2$.
* Deep-space stasis pathology: $v_{\max} = 4.0\text{ cm/s}$, $\text{CSA} = 2.6\text{ cm}^2 \implies \tau_w = 0.31\text{ dyn/cm}^2 \ll 4.0\text{ dyn/cm}^2$ (pro-thrombotic Weibel-Palade vWF/P-selectin exocytosis threshold).

### Invariant 2: Regularized Frost-Hargens Sclerostin & Muscle Quality ODE
Osteocyte Sclerostin ($\text{SOST}$) dynamics incorporate the Frost Mechanostat threshold ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), first-order renal clearance ($k_{\text{clear}}$), and Prof. Pegreffi's Ultrasound Muscle Quality Index ($\text{MQI}$):
$$\frac{d[\text{SOST}]}{dt} = k_{\text{prod}} \cdot \frac{\max\big(0,\; \varepsilon_{\text{Frost}} - \varepsilon_{\text{ARED}}(t)\big)}{\varepsilon_{\text{Frost}} + \varepsilon_{\text{ARED}}(t)} \cdot \left(\frac{\text{MQI}_0}{\max(\text{MQI}_{\min},\, \text{MQI}(t))}\right)^{\gamma} - k_{\text{iris}} \cdot [\text{Irisin}(t)] - k_{\text{clear}} \cdot \big([\text{SOST}(t)] - [\text{SOST}]_{\text{basal}}\big)$$

### Invariant 3: Normalized Quantitative Semantics Signal Temporal Logic (`NQS-STL`)
Every atomic predicate $\mu_k(x_k(t)) \ge 0$ is non-dimensionalized via signed clinical reserve normalization:
$$\hat{\rho}_k(t) = \frac{s_k \cdot \big(x_k(t) - x_{k,\text{crit}}\big)}{\big|x_{k,\text{nom}} - x_{k,\text{crit}}\big|} \in (-\infty, +1.0]$$
* Eliminates unit scale dominance between heterogeneous variables (e.g., $\tau_w$ in $\text{dyn/cm}^2$ vs. $\text{ARED}$ work in $\text{kJ}$).

### Invariant 4: Two-Stage Bayesian POCUS State Observer
Between episodic weekly ultrasound scans, latent states $\hat{z}_k(t)$ evolve via continuous causal drivers while variance grows linearly ($\sigma_k^2(t) = \sigma_{k,0}^2 + q_k(t - t_{\text{scan}})$). Upon POCUS scan acquisition, Kalman-Bayes update contracts $\sigma_k^2(t^+) \to \sigma_{\text{POCUS}}^2 \approx 0$.

### Invariant 5: Three Hard Clinical Safety Gates
1. **Gate 1 (No Empirical Anticoagulants in Isolated Stasis):** Systemic anticoagulants (Apixaban/Enoxaparin) are strictly locked out unless POCUS confirms a non-compressible intraluminal thrombus (`pocus_thrombus_confirmed == true`), preventing fatal traumatic intracranial hemorrhage during EVA.
2. **Gate 2 (LBNP Anti-Syncope Guardrail):** During $-30\text{ mmHg}$ LBNP sessions, if $\Delta\text{SBP} > 15\text{ mmHg}$ drop or $\text{HR} > 115\text{ bpm}$, immediately trigger `AUTO_VENT_LBNP_CHAMBER(0 mmHg)`.
3. **Gate 3 ($0.38g$ Martian Landing Gait Asymmetry Guardrail):** If post-landing IMU Gait Asymmetry Index $\text{GAI} > 12\%$, increase EVA suit ankle/knee exoskeletal damping by $+25\%$ and restrict long-range EVA until closed-chain retraining completes.

### Invariant 6: Crew Privacy Governance (`NASA-STD-3001 Vol. 1 Ch. 7`)
Behavioral, vocal, and raw medical logs are partitioned into three cryptographic access views (`PrivateAstronautView`, `CmoMedicalView`, `FlightSurgeonStoreAndForwardPacket`), ensuring psychological safety inside a confined 4-person habitat.
