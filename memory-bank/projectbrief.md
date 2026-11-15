# Project Brief: ARES-Health (NASA Space Apps Challenge 2026)

> Current evidence status (#12): implemented scenario models and configured policies are illustrative/unvalidated. Earlier claims of calibrated risk, clinically verified equations, certification or guaranteed forecast coverage are not established. See [MODEL_EVIDENCE_AUDIT.md](../docs/architecture/MODEL_EVIDENCE_AUDIT.md). Numerical behavior and treatment policies are unchanged by this audit.

## 1. System Charter & Core Mission
**ARES-Health** (*Autonomous Resilient Edge-native System for Astronaut Health*) is an offline, air-gapped, deterministic clinical decision support and health monitoring platform engineered for the **2026 NASA Space Apps Challenge** (Track: *"Create Health Monitoring Software for Astronauts on Space Missions"*, `https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/`).

During Lunar Gateway, Artemis II+, and Mars transit/surface missions, radio communication delays reach **4 to 24 minutes one-way (8 to 48 minutes round-trip)** with up to 14-day solar conjunction blackouts. Cloud telemedicine and Earth-based AI APIs are physically unusable. ARES-Health places a deterministic, mathematically verified Flight Surgeon engine directly on board the spacecraft to empower astronauts to autonomously **Gather**, **Evaluate**, and **Act** upon their health status.

---

## 2. The T-Shaped Strategic Positioning (Breadth + Surgical Depth)
1. **Horizontal Breadth (Full Coverage of the 5 NASA RIDGE Hazards & 6 Physiological Sub-Domains):**
   * **Sleep & Circadian Architecture:** Contactless nocturnal Doppler radar (`CEBS` chest-wall model, ECLSS $60/120\text{ Hz}$ notch filter) + `Artemis II ARCHeR` & `HERA` sleep/actigraphy.
   * **Cardiovascular & Venous Hemodynamics:** `CSA Bio-Monitor` continuous wearables, `CSA Vascular Aging` arterial pulse wave velocity (`PWV`), and `NASA-ESA Venous Haemostasis` internal jugular vein shear stress ($\tau_w$).
   * **Musculoskeletal, Bone & Renal Coupling:** `NASA OSD-51` & `OSD-195` soleus/vastus lateralis bed rest atrophy, `ESA Myotones` Achilles tendon stiffness, `NASA Zero T2` eccentric loading, `NASA LSAH` longitudinal DXA/FRAX priors, and `NASA-JAXA Bisphosphonates` + Potassium Citrate renal stone prophylaxis.
   * **Neuro-Ocular Syndrome (SANS) & Closed Habitat Environment:** `NASA OSD-818` translaminar pressure, `Brain Fluid Pressure`, `DLR :envihab AGBRESA/SANS-CM`, and `NASA-STD-3001 Vol. 2 Rev F` cabin $ppCO_2$ ($\le 2.0\text{ mmHg}$) & acoustic ($\le \text{NC-50}$) trend monitoring.
   * **Space Radiation & Hematopoietic/Mitochondrial Stress:** `CSA CANS 2026` autonomous real-time neutron spectrometer (~30% dose fraction), `CSA MARROW` bone marrow adipogenesis (`miR-144`), and `NASA OSD-570/571` (`Nature SOMA`) circulating `cf-mtDNA` & `cfRNA`.
   * **Behavioral, Vocal & Sensorimotor Readiness ($0.38g$ Landing):** `NASA CHAPEA` (378-day Mars simulation) & `HERA` passive vocal biomarkers ($F_0$, jitter, shimmer, pause ratio) and `NLSP BRSMFSR` functional stretch reflex + Gait Asymmetry Index ($\text{GAI}$) at $0.38g$.
2. **Vertical Depth (Our Unbeatable Core Differentiator):**
   * Deep mathematical modeling of the **Coupled Physiatric Sarcopenia-Osteopenia-Thrombosis-SANS Axis** via regularized Frost-Hargens differential equations, dimensional wall shear stress $\tau_w = 2\mu v_{\max}\sqrt{\pi/\text{IJV\_CSA}}$, Two-Stage Bayesian POCUS state estimation, Normalized Quantitative Semantics Signal Temporal Logic (`NQS-STL`), and deterministic NASA MedOps Playbooks with **Hard Clinical Safety Gates**.

---

## 3. Team Roster & Branch Architecture (`MiServeRDC/nasa-space-apps-2026`)
* `main`: Shared integration branch (protected by `./scripts/agent_probe.sh`).
* `ARES-Health Team` (`work/ARES-Health Team`): Lead Systems Architect, Rust Causal Graph & NQS-STL Engine, Clinical Biomechanics Integration.
* `@MiServeRDC` (`work/MiServeRDC`): Cybersecurity, Crew Medical Privacy Governance (`NASA-STD-3001 Vol. 1 Ch. 7`), SHA-256 Tamper-Evident Audit Log, Encrypted Store-and-Forward DSN Sync (`crates/ares-security-privacy`).
* `ARES-Health Team` (`work/ARES-Health Team`): Multi-Modal Telemetry Bus, Contactless Radar/Vocal DSP & Signal Quality Index (`crates/ares-telemetry-ingest`).
* `ARES-Health Team` (`work/ARES-Health Team`): Astronaut Cockpit UX (`ares-cockpit`), 3D Anatomical Deconditioning Heatmap & What-If Stress-Test Console.
* `ARES-Health Team` (`work/ARES-Health Team`): MedOps Playbook Engine (`crates/ares-medops-playbooks`), FastMCP Local AI Copilot (`crates/ares-server-cli`) & Dataset Replay Pipeline.
