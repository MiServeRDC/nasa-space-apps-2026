# `ares-medops-playbooks` — Phase 3 (ACT): Deterministic NASA MedOps DAGs & Hard Clinical Safety Gates

**Assigned Owner:** `@fertech02` (`work/fertech02`)  

## Scope
1. Deterministic state-machine execution of NASA MedOps Playbooks #01–#05 (`NASA OCHMO MTB-007`, `NASA-STD-3001 Vol. 1 [V1 3006]`).
2. **Hard Clinical Safety Gate 1 (Anticoagulation Restriction):** Locks out empirical Apixaban/Enoxaparin in isolated jugular stasis unless POCUS confirms a non-compressible intraluminal thrombus (`pocus_thrombus_confirmed == true`).
3. **Hard Clinical Safety Gate 2 (LBNP Anti-Syncope Guardrail):** Automatically vents the $-30\text{ mmHg}$ LBNP chamber to $0\text{ mmHg}$ if systolic BP drops by $> 15\text{ mmHg}$ or HR exceeds $115\text{ bpm}$ (calibrated on NLSP *Neuroendocrine Tilt* data).
4. **Hard Clinical Safety Gate 3 ($0.38g$ Martian Landing Gait Stability — Playbook #05):** Tunes EVA suit ankle/knee exoskeletal damping by $+25\%$ if post-landing IMU Gait Asymmetry Index $\text{GAI} > 12\%$ (`NLSP BRSMFSR` & Pegreffi *EJAP* 2025).
