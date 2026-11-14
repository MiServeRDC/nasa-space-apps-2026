# 04. Frontend Astronaut Cockpit UX & Interface Design

> Evidence status (issue #12): scenario-derived physiology, risk/readiness scores and forecast ranges are illustrative and clinically unvalidated. Historical calibration, certification, universal-threshold and outcome claims below are not established. Use [the current evidence audit](docs/architecture/MODEL_EVIDENCE_AUDIT.md) for source applicability, parameters and permitted wording. Recorded terrestrial measurements remain distinct from simulation.
## Human-System Integration (HSI): Microgravity Ergonomics, Mission Readiness Gauges & Interactive Playbooks

**Candidate & Lead Architect:** Fabio Malagutti (Computer Engineer • M.Sc. Student @ University of Bologna)  
**Standard Compliance:** NASA-STD-3001 Vol. 1 Rev C (`[V1 3003]`, `[V1 3006]`, `[V1 4001]` — https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1 & https://www.nasa.gov/reference/nasa-std-3001v1/), NASA-STD-3001 Vol. 2 Rev F (Jul 2026, `[V2 6001]`, `[V2 6026]`, `[V2 7043]`, `[V2 10001]` — https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2), MIL-STD-1472H  

---

## 1. Human Factors & Ergonomics in Microgravity

Designing an interface for astronauts in deep space requires fundamentally different ergonomics from terrestrial desktop or mobile apps:

1. **Floating Posture & Motor Degradation:** In microgravity, neutral body posture ($NBP$) alters arm reach envelopes. Fine motor finger tapping is disrupted by floating momentum. Buttons must feature **minimum hit targets of $44 \times 44\text{ pt}$** with generous padding.
2. **Circadian Sensitivity & Visual Accommodation:** Fluid shifts cause mild ocular edema (SANS) and corneal flattening, degrading near-visual acuity. The UI must use high-contrast sans-serif typography ($> 16\text{ pt}$ base body text) and a **pure black OLED theme (RGB 0,0,0)** to prevent circadian melatonin suppression during nocturnal check-ins.
3. **Voice-First & Hands-Free Interaction:** Astronauts frequently have their hands occupied during exercise on the ARED or CEVIS, or while performing maintenance. All primary diagnostic and logging workflows must be navigable via voice commands.
4. **Cognitive Load Optimization Under Fatigue:** In acute emergencies, complex multi-tab navigation leads to operational errors. ARES-Health presents a **single-screen hierarchical cockpit** that progressively discloses detail on demand.

---

## 2. Cockpit Layout Architecture (Tri-Phase Operational Header & What-If Console)

```
+-----------------------------------------------------------------------------------------------+
|  ARES-HEALTH | MISSION DAY: 184 | HABITAT: DEEP SPACE TRANSIT | COMMS DELAY: 14m 22s (ONE-WAY)|
|  OPERATIONAL LOOP STATUS:   [ 1. GATHER: ACTIVE ]  ===>  [ 2. EVALUATE: ALERT ]  ===>  [ 3. ACT ] |
+-----------------------------------------------------------------------------------------------+
| [ GAUGE: MISSION READINESS INDEX ]  |  [ 3D ANATOMICAL DECONDITIONING MAP ]                   |
|                                     |                                                         |
|             +-----+                 |         [Cerebral / SANS: CO2 Induced Edema]            |
|            /  82   \                |                     \                                   |
|           |  / 100  |               |                      v                                  |
|            \       /                |                  ( Head )                               |
|             +-----+                 |               +--[IJV STASIS]--+                        |
|                                     |               | tau_w: 0.31 dyn|                        |
|   * Cardiovascular: 88% (SAFE)      |               +----------------+                        |
|   * Musculoskeletal: 72% (WARNING)  |                   ( Torso )                             |
|   * Neuro-Ocular: 85% (SAFE)        |                   /       \                             |
|   * Behavioral: 79% (STABLE)        |                (Arms)   (Pelvis)                        |
|                                     |                         |                               |
|   Active Alerts:                    |                  (Femur: -1.2%)                         |
|   [!] Soleus MQI Drop: -5.4%        |                         |                               |
|   [!] Calcaneus BMD Loss: -1.3%/mo  |               +-[SARCOPENIA]-+                          |
|   [!] IJV Shear: 0.31 dyn/cm2 (Low) |               | Pennation:15d|                          |
+-------------------------------------+---------------------------------------------------------+
| [ NQS-STL ROBUSTNESS & BAYESIAN BAND ] | [ ACTIVE MEDOPS ACTION PLAYBOOK RUNNER ]             |
|                                        |                                                      |
|   Normalized Margin (rho_hat):         |   PLAYBOOK #04: SARCOPENIA & JUGULAR STASIS          |
|   +0.5 |-----\                         |   Step 1: [DONE] POCUS Scan (No Thrombus, theta=15d) |
|    0.0 |------\----------------        |   Step 2: [ACTIVE] LBNP (-30mmHg, 45m) [BP GUARD OK] |
|   -0.5 |       \----[ALERT ZONE]       |   Step 3: [PENDING] ARED Eccentric Load (+15% Strain)|
|        +----------------------->       |   Step 4: [PENDING] Leucine + K-Citrate 30 mEq       |
|        Day 150    Day 170   Day 184    |                                                      |
|                                        |   [ EXECUTE CURRENT STEP ]   [ OVERRIDE PROTOCOL ]   |
+-----------------------------------------------------------------------------------------------+
| [ INTERACTIVE WHAT-IF STRESS-TEST CONSOLE (LIVE < 1 ms RUST ENGINE RECALCULATION) ]           |
|   Cabin CO2: [===|---] 3.4 mmHg   ARED Load: [--|====] 85 kJ   Mission Day: [====|-] Day 184  |
+-----------------------------------------------------------------------------------------------+
| [ LOCAL EDGE AI COPILOT: "Astronaut Malagutti, POCUS confirms compressible IJV lumen with     |
|   stasis (tau_w = 0.31 dyn/cm2) and soleus pennation angle of 15.2 deg. Anticoagulants are    |
|   withheld per Safety Gate. Executing Playbook #04 physical LBNP at -30 mmHg." ]              |
+-----------------------------------------------------------------------------------------------+
```

---

## 3. Detailed UI Modules

### 3.1 Header Module: The Tri-Phase Mandate Indicator (`[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`)
Directly anchors the user interface to the official NASA Space Apps Challenge prompt by illuminating the active operational phase in real time:
1. **`[1. GATHER]`:** Displays active telemetry ingestion health, Signal Quality Index (`SQI >= 0.70`), contactless nocturnal radar lock status, and the countdown to the next scheduled POCUS verification scan.
2. **`[2. EVALUATE]`:** Highlights active causal graph propagation paths, current Normalized Quantitative Semantics robustness ($\hat{\rho}_k(t)$), and the 7-day EWMA Time-To-Violation (`TTV`) countdown.
3. **`[3. ACT]`:** Illuminates when any organ specification crosses $\hat{\rho}_k(t) < 0$ or its lower Bayesian confidence bound $\hat{\rho}_k^{\text{lower}}(t) < 0$, locking focus onto the deterministic NASA MedOps Playbook Runner.

### 3.2 Module 1: The Mission Readiness Index (MRI)
The **Mission Readiness Index (MRI)** is an aggregate composite score ($0 - 100$) derived from the normalized NQS-STL robustness values ($\hat{\rho}_k(t)$) across all organ system specifications:
$$\text{MRI}(t) = \sum_{k=1}^{4} w_k \cdot \sigma\big(\hat{\rho}_k(t)\big) \times 100$$
Where $w_k$ represents clinical weighting:
* $w_{\text{cardio}} = 0.30$ (Cardiovascular, Jugular Shear Stress & Hemodynamic Stability)
* $w_{\text{musculo}} = 0.30$ (Soleus Muscle Quality Index $\text{MQI}$, Bone Density & Mechanotransduction)
* $w_{\text{neuro}} = 0.20$ (SANS, Intracranial Pressure & Sleep Architecture)
* $w_{\text{behav}} = 0.20$ (Vocal Biomarkers, Reaction Time & Cognitive Reserve)

Color coding adheres to MIL-STD-1472H:
* **Nominal Green ($85 - 100$):** Fully mission-capable; standard physical conditioning.
* **Advisory Amber ($70 - 84$):** Sub-clinical degradation; automated countermeasure recalibration.
* **Alert Red ($< 70$):** Clinical boundary violated; mandatory MedOps playbook execution.

---

### 3.3 Module 2: The 3D Anatomical Deconditioning Heatmap
Rather than deciphering raw numbers, the astronaut views an interactive, rotatable 3D human body model with color-mapped anatomical risk layers and glowing causal bezier arcs:
1. **Calf & Soleus Zone (Sarcopenia / Muscle Quality & Capacitance):**
   * Color shifts from cyan to magenta as the Ultrasound Muscle Quality Index ($\text{MQI}$) and fascicle pennation angle ($\theta_{\text{penn}}$) decrease.
   * Tooltip: *"Soleus MQI down 5.4% (Pennation angle: 15.2 deg, Echo-Intensity elevated). Peripheral venous capacitance reduced; calcaneus strain below Frost threshold."*
2. **Internal Jugular Vein (IJV) Neck Zone (Venous Stasis / Shear Stress):**
   * Pulsing amber halo appears when wall shear stress $\tau_w$ drops below $4.0\text{ dyn/cm}^2$ ($v_{\max} < 5.0\text{ cm/s}$) or cross-sectional area expands past $2.5\text{ cm}^2$.
   * Tooltip: *"Venous stasis detected (tau_w = 0.31 dyn/cm2, JVPI elevated). LBNP -30 mmHg countermeasure indicated."*
3. **Femoral Neck & Calcaneus Zone (Osteopenia):**
   * Bone density resorption rate overlay highlighting areas vulnerable to trabecular micro-fractures (`CTX-I/P1NP` ratio and Sclerostin surge).
4. **Cranial & Optic Zone (SANS):**
   * Highlights optic nerve sheath dilation ($\text{ONSD} > 5.8\text{ mm}$) and correlates it with habitat $ppCO_2$ spikes.

---

### 3.4 Module 3: Multi-Scale NQS-STL Robustness & Bayesian Uncertainty Graphs
* Displays the continuous dimensionless trajectory of the **NQS-STL Robustness Metric $\hat{\rho}_k(t) \in (-\infty, +1.0]$** alongside its shaded **Two-Stage Bayesian Uncertainty Band $\pm 1.96\,\sigma_k(t)$**.
* Features a projected dashed line showing the 14-day future forecast extracted via EWMA-OLS regression:
  * *"At current deconditioning slope, safety margin crosses zero in 11 days (TTV = 11d). Executing Playbook #04 restores normalized margin to +0.42."*

---

### 3.5 Module 4: The Interactive "What-If Stress-Test Console"
Positioned directly below the main panels, this interactive console allows both the crew (for mission planning) and the **NASA Space Apps Hackathon Jury (during live demonstration)** to manipulate environmental and physiological stressors in real time:
* **Interactive Sliders:**
  1. `Cabin ppCO2 Partial Pressure` ($0.4\text{ mmHg} \to 5.0\text{ mmHg}$)
  2. `ARED Daily Eccentric Workload` ($0\text{ kJ} \to 160\text{ kJ}$)
  3. `LBNP Chamber Decompression Pressure` ($0\text{ mmHg} \to -40\text{ mmHg}$)
  4. `Mission Elapsed Day & Gravity Regime` ($\text{Day } 1 \text{ in } 0g \to \text{Day } 180 \text{ Landing in } 0.38g\text{ Mars}$)
* **Live Proof of Execution:** Moving any slider dispatches a WebSocket packet to `ares-engine` (`127.0.0.1:8080`), which recomputes the Frost-Hargens differential equations, wall shear stress $\tau_w(t)$, and NQS-STL robustness $\hat{\rho}(t)$ in **$< 1\text{ millisecond}$**, updating the 3D anatomical heatmap and triggering the corresponding MedOps Playbook live on screen.

---

### 3.6 Module 5: The NASA MedOps Interactive Action Playbook Runner (With Hard Clinical Safety Gates)
Fulfills the core mandate of the challenge: **ACT** (grounded in NASA OCHMO MTB-007, Pappas et al. 2026, Martin et al. 2026, and Space Rehabilitation Medicine Guidelines 2024–2026).

#### Playbook #04: Jugular Venous Stasis & Sarcopenia-Osteopenia Countermeasure DAG
* **Step 1 — Guided POCUS Verification & Thrombus Safety Gate (Martin et al. 2026; POCUS Rehabilitation Guidelines 2026):**
  * *Instruction:* *"Connect handheld ultrasound probe. Perform transverse compression and Doppler scan of Left Internal Jugular Vein and longitudinal scan of Soleus muscle."*
  * *Automated Overlay:* Computes IJV lumen compressibility, peak velocity $v_{\max}$, wall shear stress $\tau_w$, soleus thickness $\text{MT}_{\text{soleus}}$, and fascicle pennation angle $\theta_{\text{penn}}$, contracting Bayesian uncertainty $\sigma(t) \to 0$.
  * *Hard Clinical Safety Gate (Anticoagulation Restriction):* If the IJV lumen is fully compressible with no echogenic thrombus, **systemic anticoagulants (Apixaban/Enoxaparin) are strictly locked out** to prevent traumatic intracranial hemorrhage. The DAG routes exclusively to physical countermeasures (Steps 2–4). Only if an occlusive/non-compressible thrombus is confirmed does the DAG unlock therapeutic anticoagulation and automatically revoke EVA clearance (`EVA_CLEARANCE = REVOKED`).
* **Step 2 — Dose-Response LBNP Decompression with Anti-Syncope Guardrail (Pappas et al. 2026):**
  * *Instruction:* *"Enter Lower Body Negative Pressure (LBNP) chamber. Set pressure to -30 mmHg for 45 minutes coupled with rhythmic isometric calf contractions (or 30 Hz NMES) to restore crural venous capacitance and jugular shear stress (> 4.0 dyn/cm2)."*
  * *Hard Clinical Safety Gate (Anti-Syncope Auto-Vent Guardrail):* The playbook runner continuously monitors real-time arterial blood pressure and heart rate during LBNP. **If systolic blood pressure drops by $> 15\text{ mmHg}$ from baseline OR heart rate exceeds $115\text{ bpm}$**, the system immediately triggers `AUTO_VENT_LBNP_CHAMBER(0 mmHg)`, aborting negative pressure before pre-syncopal hypotension can occur.
* **Step 3 — ARED Mechanotransductive Recalibration (Al-Nuaimi & Hargens 2025/2026):**
  * *Instruction:* *"Recalibrate ARED resistive protocol: increase deadlift and calf heel-raise eccentric loading by +15% (4-second eccentric phase) to exceed Frost Mechanostat threshold (1000 microstrain), stimulate Irisin, and suppress osteocyte Sclerostin."*
* **Step 4 — Nutritional Prehabilitation & Renal Stone Prophylaxis (Prehabilitation & Sarcopenia Guidelines 2024/2026):**
  * *Instruction:* *"Access medical dispenser Tray B-04: administer 3.5 g Leucine-enriched Essential Amino Acids + Cholecalciferol (Vitamin D3) to restore muscle protein synthesis, plus Potassium Citrate 30 mEq with 500 mL water to alkalinize urine and prevent calcium oxalate crystallization."*

#### Playbook #05: Martian Surface Landing Gait Stability & Fall Risk Mitigation (Physical Medicine & Rehabilitation Literature 2025)
* **Trigger:** Transition from $0g$ transit to $0.38g$ Martian surface gravity OR EVA suit Inertial Measurement Units (IMUs) detect a **Gait Asymmetry Index ($\text{GAI}$) $> 12\%$** or **Dynamic Knee Valgus instability** caused by deconditioned soleus, gastrocnemius, and gluteus medius stabilizers.
* **Action Steps:**
  1. **3-Minute Post-Landing Functional Mobility Screen:** Guides the astronaut through a standardized instrumented Sit-to-Stand and 10-Meter Walk Test inside the lander airlock using suit tibial/pelvic IMUs to quantify step-length asymmetry, stance-phase duration, and frontal-plane knee valgus excursion.
  2. **Adaptive Suit Ankle-Knee Exoskeletal Stiffness Tuning:** Automatically increases mechanical ankle dorsiflexion and knee lateral stabilization damping on the EVA suit joint actuators by $+25\%$ to compensate for soleus/gluteus medius dynapenia and prevent tendon rupture or catastrophic fall on Martian regolith.
  3. **Targeted Proprioceptive & Closed-Chain Reconditioning:** Schedules a 14-day progressive closed-kinetic-chain neuromuscular retraining protocol before authorizing long-range surface EVA traverses.

---

### 3.7 Module 6: Onboard Edge AI Copilot (Natural Language Interface)
* Positioned along the bottom bar.
* Communicates through calm, synthesized voice and clear text, powered by the local Model Context Protocol (MCP) server over `stdio`.
* The astronaut can ask:
  * *"Why is Playbook #04 active and why is anticoagulation locked?"*
  * Copilot replies: *"Your POCUS verification confirmed stagnant jugular flow (tau_w = 0.31 dyn/cm2) driven by soleus deconditioning (pennation angle 15.2 deg), but ruled out an intraluminal thrombus. Per NASA safety gate protocols, anticoagulants are withheld to eliminate intracranial bleeding risk. A 45-minute LBNP session at -30 mmHg with blood pressure guardrail monitoring is ready to restore laminar venous flow."*
