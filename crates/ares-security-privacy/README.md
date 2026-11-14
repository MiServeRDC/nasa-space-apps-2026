# `ares-security-privacy` — Crew Medical Privacy Governance, SHA-256 Audit Chain & Store-and-Forward Encryption

**Assigned Owner:** `@MiServeRDC` (Alessandro, `work/MiServeRDC`)  

## Scope
1. **Role-Based Crew Privacy Governance (`NASA-STD-3001 Vol. 1 Ch. 7 Crew Health Records`):**
   - `PrivateAstronautView`: Full access to personal vocal logs, sleep architecture, and raw biomarkers.
   - `CmoMedicalView`: Privacy-filtered operational readiness and NQS-STL status; raw behavioral/mood logs remain masked unless explicit astronaut consent is granted or a life-safety threshold ($\hat{\rho}_k < 0$) is breached.
   - `FlightSurgeonStoreAndForwardPacket`: Delta-compressed, encrypted clinical bundle queued for asynchronous Deep Space Network (DSN) downlink.
2. **Tamper-Evident Audit Logging (`HashChainAuditLogger`):** Non-repudiable SHA-256 hash chain recording every MedOps Playbook execution, safety gate evaluation, and manual CMO override.
3. **At-Rest & DSN Packet Encryption:** ChaCha20-Poly1305 authenticated encryption with metadata AAD binding and `zeroize` ephemeral key protection.
