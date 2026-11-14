# `ares-nqs-stl` — Phase 2B (EVALUATE): Normalized Quantitative Semantics STL & EWMA-OLS `TTV`

**Assigned Owner:** `@fabiomalagutti27-droid` (`work/fabiomalagutti27-droid`)  

## Scope
1. Signed clinical reserve normalization onto $\hat{\rho}_k(t) \in (-\infty, +1.0]$, eliminating unit scale dominance across heterogeneous biometrics.
2. $O(1)$ amortized Lemire Monotonic Wedge sliding-window min/max evaluator for temporal operators $\mathcal{G}_{[a,b]}$ and $\mathcal{F}_{[a,b]}$.
3. 7-day EWMA-OLS derivative estimator ($\langle \dot{\rho} \rangle_{7\text{d}}$) and predictive Time-To-Violation (`TTV`) countdown.
4. Composite Mission Readiness Index ($\text{MRI} \in [0, 100]$).
