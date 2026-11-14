# Clinical Safety Gates & Crew Privacy Guidelines (ARES-Health)

## 1. Three Mandatory Hard Clinical Safety Gates
No AI agent or developer may weaken or bypass the following deterministic safety gates in `crates/ares-medops-playbooks`:
1. **Safety Gate 1 — Prohibition of Empirical Anticoagulation in Isolated Stasis:**
   - Systemic anticoagulants (Apixaban/Enoxaparin) are strictly locked out (`anticoagulation_locked = true`) when jugular flow velocity is slow ($v_{\max} < 5.0\text{ cm/s}$, $\tau_w < 4.0\text{ dyn/cm}^2$) unless POCUS explicitly confirms a non-compressible intraluminal thrombus (`pocus_thrombus_confirmed == true`).
2. **Safety Gate 2 — LBNP Anti-Syncope Hemodynamic Guardrail:**
   - During $-30\text{ mmHg}$ Lower Body Negative Pressure (LBNP) sessions, if systolic blood pressure drops by $> 15\text{ mmHg}$ from baseline OR heart rate exceeds $115\text{ bpm}$, the engine must immediately trigger `AUTO_VENT_LBNP_CHAMBER(0 mmHg)`.
3. **Safety Gate 3 — $0.38g$ Martian Landing Gait Stability Guardrail:**
   - Upon landing in $0.38g$, if EVA suit IMUs detect a Gait Asymmetry Index $\text{GAI} > 12\%$, suit ankle/knee exoskeletal damping must be increased by $+25\%$ before surface EVA authorization.

## 2. Crew Medical Privacy & Network Zero-Trust (`crates/ares-security-privacy`)
1. **100% Offline Air-Gap:** Bind HTTP/WebSocket servers strictly to `127.0.0.1`. Zero external cloud API calls at runtime.
2. **Role-Based Crew Privacy Tiers (`NASA-STD-3001 Vol. 1 Ch. 7`):**
   - `PrivateAstronautView`: Full access to personal vocal logs, sleep staging, and raw biomarkers.
   - `CmoMedicalView`: Aggregated `MRI` and NQS-STL status; raw personal behavioral logs remain masked unless consent is granted or a life-safety threshold ($\hat{\rho}_k < 0$) is breached.
   - `FlightSurgeonStoreAndForwardPacket`: ChaCha20-Poly1305 encrypted, delta-compressed clinical bundle queued for Deep Space Network (DSN) downlink.
3. **Tamper-Evident Audit Chain:** Every manual override of a MedOps Playbook must be logged in a SHA-256 hash chain (`HashChainAuditLogger`).
