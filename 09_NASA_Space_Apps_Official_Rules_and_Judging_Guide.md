# 09. NASA Space Apps Challenge 2026: Official Rules, Submission Deliverables & Judging Guide

> Development dossier. For the current demo, evaluation scope and submission
> materials, start with the [judge walkthrough](docs/submission/JUDGES_START_HERE.md).

> Evidence status (issue #12): scenario-derived physiology, risk/readiness scores and forecast ranges are illustrative and clinically unvalidated. Historical calibration, certification, universal-threshold and outcome claims below are not established. Use [the current evidence audit](docs/architecture/MODEL_EVIDENCE_AUDIT.md) for source applicability, parameters and permitted wording. Recorded terrestrial measurements remain distinct from simulation.

**Challenge Portal:** https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/  
**Main Hackathon Portal:** https://www.spaceappschallenge.org/2026/  
**Track Title:** "Create Health Monitoring Software for Astronauts on Space Missions"  
**Scope:** Deep Space Transit (Artemis Lunar Gateway, Earth-Mars Transit, Martian Habitat)  
**Target Category:** Human Spaceflight, Space Medicine, Biomedical Engineering & Edge Computing  

---

## 1. Verbatim NASA Challenge Statement & Operational Mandate

### 1.1 The Official Prompt
> *"Long-duration missions expose astronauts to space radiation, isolation and confinement, altered gravity, and a hostile closed environment, which can bring immune changes, bone loss, cardiovascular events, and behavioral health problems. On long missions, astronauts carry much of the responsibility for spotting these changes in themselves. Your challenge is to build a health monitoring software that gathers health indicators and enables astronauts to evaluate and act on the status of their health."*

### 1.2 The Three Canonical Imperatives
To qualify for global judging, solutions must explicitly address all three functional pillars:
1. **GATHER (Raccolta Multimodale):**
   * Capture and fuse heterogeneous physiological biometrics (ECG, heart rate variability, respiration, skin temperature, sleep staging) and environmental factors (cabin $ppCO_2$, acoustic ambient noise, cumulative radiation dose).
   * Incorporate passive/contactless nocturnal sensing (RF radar / Wi-Fi CSI) alongside active wearable telemetry to eliminate astronaut skin abrasion and wearable compliance fatigue.
   * Implement real-time Signal Quality Index (SQI) filtering to reject microgravity sweat artifacts without triggering false-positive clinical alerts.
2. **EVALUATE (Valutazione Fisiologica Integrata e Causalita'):**
   * Move beyond static, isolated single-variable thresholds that cause alarm fatigue.
   * Quantify multi-organ cross-talk: how disuse sarcopenia (soleus/gastrocnemius atrophy) accelerates osteopenia (bone resorption) and cephalic venous stasis (internal jugular vein dilation with wall shear stress collapse $\tau_w < 4\text{ dyn/cm}^2$).
   * Calculate continuous quantitative safety margins using Signal Temporal Logic (Med-STL) to predict clinical failure 11 to 14 days before acute symptoms emerge.
3. **ACT (Prescrizione Deterministica e Playbook Clinici):**
   * Close the loop autonomously without waiting for Earth Mission Control (overcoming the 8 to 48-minute light-speed communication latency).
   * Provide deterministic, certified MedOps decision trees: ultrasound probe navigation (POCUS), dynamic ARED resistive exercise load recalibration, Lower Body Negative Pressure (LBNP at -30 mmHg) protocols, and medical kit pharmacological dosing.

---

## 2. Official Hackathon Rules & Team Eligibility

### 2.1 Team Formation & Size
* **Team Capacity:** Teams can range from **1 to 6 members**. For universal/virtual and global judging nominations, multidisciplinary teams are strongly recommended.
* **Recommended Composition:**
  1. Lead Systems Architect & Backend Systems Engineer (Rust, concurrency, deterministic state).
  2. Frontend Cockpit & Real-Time Data Visualization Engineer (React, TypeScript, WebSocket).
  3. 3D Graphics & Human-System Integration (HSI) Specialist (WebGL, Three.js, spatial deconditioning).
  4. Biomedical Data Scientist & Sensor Fusion Specialist (NASA OSDR, PhysioNet, ODE calibration).
  5. Clinical Storyteller, NASA Compliance & Video Pitch Producer (Pitch delivery, slides, criteria mapping).
* **Multi-Team Constraint:** An individual participant may only be a registered member of one team.

### 2.2 The "Fresh Code" Rule & Intellectual Property
* **Original Work Requirement:** All application code, designs, models, and submission content presented for judging must be original and developed during the hackathon window.
* **Pre-Existing Frameworks:** Open-source libraries, compilers, language runtimes, public frameworks (e.g., React, Tokio, Tailwind, Three.js, NeuroKit2), and open datasets are permitted provided they are publicly available and explicitly cited.
* **Clean-Room Firewall:** Proprietary, private, or pre-built codebases must not be imported or submitted. Architecture specifications, literature reviews, and mathematical formulas prepared pre-hackathon serve strictly as planning documents; all production code must be compiled and committed fresh.
* **Open Source Licensing:** All submissions must be released under an OSI-approved open-source license (such as MIT, Apache 2.0, or NASA Open Source Agreement).

### 2.3 AI Transparency & Disclosure Policy
* **Permitted Use of AI:** Participants are fully permitted to utilize generative AI tools, coding assistants, and LLM-based autonomous agents (e.g., Claude Code, Google Antigravity, OpenAI Codex, GitHub Copilot, Cursor).
* **Mandatory Disclosure:** On the official project submission page, teams **must explicitly disclose**:
  1. Which AI tools and models were utilized.
  2. How they were integrated into the workflow (e.g., scaffolding boilerplate, drafting documentation, unit test expansion).
* **Integrity Standard:** The core mathematical reasoning, clinical decision trees, architectural decisions, and final deliverables must be understood, directed, and verified by the team members.

---

## 3. Official Submission Deliverables & Required Formats

Submissions must be published on the official NASA Space Apps Challenge portal before the local event deadline (typically Sunday at 23:59 local time).

### 3.1 Project Page Fields
1. **Project Title:** Clear, memorable name (e.g., *ARES-Health: Autonomous Resilient Edge-native System for Astronaut Health*).
2. **High-Level Summary (Elevator Abstract):** A concise summary of exactly what the project does, whom it protects, and why it matters for deep space exploration (strict character/word limits; keep under 100 words).
3. **Detailed Project Description:**
   * Problem Statement: The Five Hazards of Spaceflight (RIDGE) and the light-speed communication latency barrier.
   * Solution Architecture: Edge-native core in Safe Rust (`ares-engine`), zero-cloud execution, and tactile dark cockpit (`ares-cockpit`).
   * Scientific & Mathematical Rigor: Multi-Organ Bio-Causal Graph, Frost-Hargens ODEs, and Med-STL quantitative safety margins.
   * Autonomous Closed Loop: Step-by-step walkthrough of *Gather $\to$ Evaluate $\to$ Act*.
4. **NASA & Partner Open Data Citations:** Exhaustive list of all public datasets and resources utilized (NASA OSDR, GeneLab, PhysioNet, NASA Technical Reports Server).
5. **Open Source Code Repository:** Public link to GitHub/GitLab containing the clean codebase, `README.md`, setup instructions, and license.

### 3.2 The Project Demo Requirement (Strict Format Constraints)
Every team must submit a **Project Demo** accessible via a public external link (YouTube, Google Drive, Dropbox, GitHub). The NASA Space Apps Challenge global evaluation strictly enforces one of two formats:

#### Format Option A: The 30-Second Video Pitch
* **Maximum Duration:** Strictly **30 seconds** maximum. Submissions exceeding 30 seconds may be penalized or disqualified by global screening judges.
* **Language & Subtitles:** Can be spoken in any language, but **MUST include hardcoded or selectable English subtitles**.
* **Suggested Script Pacing (30s):**
  * `00s - 05s`: **The Hook:** *"Deep space astronauts traveling to Mars face 48-minute communication delays. A blood clot or bone fracture cannot wait for Earth."*
  * `05s - 15s`: **The Solution & Demo:** Introduce ARES-Health; flash real-time UI showing the 3D deconditioning mannequin, the causal graph, and the zero-cloud Rust engine.
  * `15s - 25s`: **NASA Data & Science:** Highlight NASA OSDR kinetic calibration and deterministic Med-STL safety margin predicting venous stasis 12 days early.
  * `25s - 30s`: **The Call to Action:** *"ARES-Health closes the loop: Gather, Evaluate, Act. True medical autonomy for the Mars generation."*

#### Format Option B: The 7-Slide Deck
* **Maximum Slides:** Exactly **7 slides** maximum (excluding title/team slide if specified by local guidelines, but safest at 7 total).
* **Language:** Must be written in **English**.
* **Canonical 7-Slide Structure:**
  * `Slide 1`: Title, Track Name, Team Members, and Mission Banner.
  * `Slide 2`: The Deep Space Problem (RIDGE hazards + 48-min speed-of-light delay).
  * `Slide 3`: System Architecture & Edge Paradigm (100% offline Safe Rust engine + WebSocket).
  * `Slide 4`: NASA Open Data Integration (OSDR, PhysioNet, NTRS flight rules).
  * `Slide 5`: Multi-Organ Bio-Causal Graph & Med-STL Mathematical Margin.
  * `Slide 6`: Astronaut Cockpit UI & Real-Time MedOps Action Playbook Runner.
  * `Slide 7`: Mission Impact, Scalability to Artemis/Mars, and Future Roadmap.

#### Supplementary Extended Demo (Local Pitch & Technical Review)
While the global submission form requires the 30s video or 7-slide deck, local judging panels and in-depth technical evaluators benefit from an extended **180-second (3-minute) comprehensive video walkthrough** linked inside the GitHub repository `README.md` (detailed in [08_Open_Source_Ecosystem_and_Comparative_Analysis.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/08_Open_Source_Ecosystem_and_Comparative_Analysis.md)).

---

## 4. The 5 NASA Evaluation Criteria & Scoring Rubric

All projects are evaluated by NASA subject matter experts, flight controllers, and aerospace engineers on a **1 to 5 scale** across five pillars (20% each):

```
+---------------------------------------------------------------------------------------------------+
|                                  THE 5 NASA EVALUATION PILLARS                                    |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  1. IMPACT (20%)      2. CREATIVITY (20%)   3. VALIDITY (20%)   4. RELEVANCE (20%) 5. PRES. (20%) |
|  ==================   ===================   =================   ================   ============== |
|  * Deep space value   * Beyond dashboard    * Real mathematics  * Solves Gather,   * 30s elevator |
|  * Earth spin-offs    * Contactless radar   * Safe Rust memory  * Evaluate, Act    * 7-slide deck |
|  * Crew survival      * Causal AI graph     * NASA data tuning  * RIDGE hazards    * Clear story  |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### 4.1 Impact (20% Weight)
* **What it measures:** The scale, significance, and transformative value of the problem being solved.
* **To score 5/5:** Show that without autonomous edge software, long-duration Mars transit is biologically non-viable. Demonstrate secondary spin-offs for terrestrial telemedicine (remote rural clinics, intensive care telemetry, bedridden sarcopenia).

### 4.2 Creativity & Innovation (20% Weight)
* **What it measures:** The originality and technical sophistication of the approach compared to conventional solutions.
* **To score 5/5:** Reject generic web dashboards. Present novel concepts: nocturnal contactless RF vital sign extraction, Signal Temporal Logic (STL) for deterministic safety margins, and dual-transport architecture (axum WebSocket + stdio FastMCP).

### 4.3 Validity & Scientific Soundness (20% Weight)
* **What it measures:** The technical, mathematical, and clinical credibility of the solution.
* **To score 5/5:** Ensure all formulas have physically correct dimensional units (cgs/MKS: shear stress in $\text{dyn/cm}^2$, CSA in $\text{cm}^2$, flow velocity in $\text{cm/s}$). Demonstrate memory safety with Safe Rust (zero raw pointers, zero unhandled errors).

### 4.4 Relevance (20% Weight)
* **What it measures:** How directly and completely the project satisfies the prompt and integrates NASA open data.
* **To score 5/5:** Provide complete coverage of *Gather $\to$ Evaluate $\to$ Act*. Explicitly map data inputs to NASA OSDR, GeneLab, and PhysioNet. Respect deep-space constraints (zero external internet connectivity).

### 4.5 Presentation & Storytelling (20% Weight)
* **What it measures:** The clarity, visual aesthetics, narrative pacing, and user experience demonstrated in the demo and repository.
* **To score 5/5:** High-contrast OLED dark theme (`#000000`), clear clinical scenario walkthrough (e.g., asymptomatic jugular stasis detection), and a tightly timed 30-second video or 7-slide deck.

---

## 5. The 10 NASA Global Award Categories

Projects that receive Global Nomination from local judging advance to the NASA Executive Judging Committee to compete for the 10 official Global Awards:

1. **Best Use of Science:** The project that makes the best and most valid use of science and/or the scientific method.
2. **Best Use of Data:** The project that best makes space agency data accessible or leverages it for an innovative application.
3. **Best Use of Technology:** The project that exemplifies the most innovative, robust, and aerospace-grade use of technology.
4. **Galactic Impact:** The project with the greatest potential to improve life on Earth and in the universe.
5. **Best Mission Concept:** The project with the most plausible, operationally viable concept and design.
6. **Most Inspirational:** The project that captures the imagination and spirit of space exploration.
7. **Best Use of Storytelling:** The project that most creatively communicates open science and space medicine through narrative.
8. **Global Connection:** The project that best bridges diverse disciplines and connects global communities.
9. **Art & Technology:** The project that most harmoniously combines technical engineering and human-centered design.
10. **Local Impact:** The project that demonstrates the highest potential for immediate terrestrial utility.

*ARES-Health Primary Target Awards:* **Best Use of Technology**, **Best Use of Science**, and **Best Mission Concept**.

---

## 6. Checklist Pre-Gara per gli Agenti AI del Team

Before starting implementation or generating assets, every autonomous agent (Claude Code, Google Antigravity, OpenAI Codex, Cursor) must verify compliance with the following invariants:

- [ ] **Fresh Code Verification:** Verify that no application source code or binaries are precompiled outside the repository.
- [ ] **Air-Gapped Constraint:** Ensure that zero outbound HTTP calls target external cloud endpoints during simulator execution (all communications must be `localhost` / `127.0.0.1`).
- [ ] **Dimensional Consistency:** Verify that all physical dimensions in hemodynamic equations strictly adhere to standard physical units ($\text{dyn/cm}^2$, $\text{cm}^2$, $\text{cm/s}$).
- [ ] **UI Palette Consistency:** Strictly respect the aerospace OLED dark palette (`#000000`, amber `#F59E0B`, cyan `#06B6D4`, critical red `#EF4444`).
- [ ] **AI Disclosure Logging:** Maintain an exhaustive log of all AI engineering assistants for mandatory formal disclosure in the official submission portal.
