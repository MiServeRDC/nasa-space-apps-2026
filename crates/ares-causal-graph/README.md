# `ares-causal-graph` — Phase 2A (EVALUATE): Astronaut Dynamic Health Graph (ADHG) & Bayesian POCUS Observer

> Evidence status (#12): model outputs are illustrative/unvalidated. Historical calibrated-confidence, clinical-probability, certification and readiness claims are superseded by [the evidence audit](../../docs/architecture/MODEL_EVIDENCE_AUDIT.md). Numerical gate acceptance is heuristic.

**Assigned Owner:** `@fabiomalagutti27-droid` (`work/fabiomalagutti27-droid`)  

## Scope
1. Directed causal multigraph (`petgraph`) modeling multi-organ crosstalk across the 6 NASA physiological sub-tracks.
2. Regularized Frost-Hargens Sclerostin (`SOST`) and Irisin differential equations ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$, `OSD-51`, `Zero T2`, `LSAH`) coupled with Prof. Pegreffi's Ultrasound Muscle Quality Index ($\text{MQI}$: thickness $\text{MT}$, pennation angle $\theta_{\text{penn}}$, echo-intensity $\text{EI}$) and `ESA Myotones` Achilles tendon stiffness.
3. Dimensionally exact Internal Jugular Vein wall shear stress: $\tau_w(t) = 2\mu v_{\max}(t)\sqrt{\pi/\text{IJV\_CSA}(t)}$ ($\mu = 0.035\text{ Poise}$, `NASA-ESA Venous Haemostasis`).
4. Two-Stage Bayesian POCUS State Observer predicting latent ultrasound parameters with uncertainty bounds $\pm 1.96\,\sigma(t)$ between weekly scans.
5. Hierarchical Hot (24h) / Warm (30d) / Cold (1000d `LSAH`) temporal tiers.
