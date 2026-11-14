# `ares-cockpit` — Microgravity OLED Astronaut Cockpit & 3D Deconditioning Heatmap

**Assigned Owner:** `@carolina2910` (`work/carolina2910`)  
**Standards:** `NASA-STD-3001 Vol. 2 Rev F ([V2 6001], [V2 7043], [V2 10001])` & `MIL-STD-1472H`  

## Modular UI Structure (`src/modules/`)
1. `header-triphase/`: Illuminates `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]` + Earth-Mars communication latency simulator (`0.5s ISS` vs. `14m 22s Mars Transit` vs. `Solar Conjunction Blackout`).
2. `mri-and-stl/`: Composite Mission Readiness Index ($\text{MRI} \in [0, 100]$) gauge and NQS-STL $\hat{\rho}_k(t)$ chart with shaded Two-Stage Bayesian POCUS uncertainty bands ($\pm 1.96\,\sigma(t)$) and 14-day EWMA `TTV` forecast.
3. `body-3d-heatmap/`: Interactive `Three.js` / `@react-three/fiber` 3D anatomical mesh highlighting Soleus $\text{MQI}$, Calcaneus/Femoral `SOST` osteopenia, Jugular $\tau_w$ stasis, and Optic $\text{ONSD}$ SANS with causal bezier arcs.
4. `playbook-runner/`: Deterministic NASA MedOps Playbook #04 & #05 interactive DAG runner with visible Hard Clinical Safety Gate lock badges.
5. `whatif-console/`: Live `< 1 ms` What-If Stress-Test sliders (`ppCO2`, `ARED Load`, `LBNP Pressure`, `Mission Day`) + bottom voice/text Local FastMCP AI Copilot bar.


## Required evidence-status presentation (issue #12)

Consume backend `model_validation_status` and interval kind. Show scenario risk/readiness/organ indicators and forecast bands as illustrative/unvalidated; preserve nulls. Use "scenario range" rather than "95% CI", "calibrated", or "worst case". Gate acceptance is a heuristic status, not clinical approval. Distinguish recorded terrestrial measurements, model values and scenario inputs. Backend `ttv_ci95_*` names are legacy compatibility only. See [evidence register](../docs/architecture/MODEL_EVIDENCE_AUDIT.md). This baseline has no executable cockpit, so these are integration acceptance requirements for #8.
