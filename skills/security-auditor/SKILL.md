---
name: security-auditor
description: Static Application Security Testing (SAST), Role-Based Crew Medical Privacy Governance (NASA-STD-3001 Vol. 1 Ch. 7), Prompt Injection Shields, ChaCha20-Poly1305 AEAD encryption, and SHA-256 Audit Chain verification for crates/ares-security-privacy.
triggers:
  - security audit
  - crew medical privacy
  - prompt injection defense
  - sha256 audit chain
  - store and forward encryption
  - ares-security-privacy
---

# Security Auditor: Crew Privacy Governance, Zero-Trust & Audit Chain (`crates/ares-security-privacy`)

This skill guides security implementation and auditing for `crates/ares-security-privacy` (owned by `@MiServeRDC`). It ensures ARES-Health complies with **NASA-STD-3001 Volume 1 Rev C Chapter 7 (`Crew Health Records`)**, air-gap network isolation, and tamper-evident clinical logging.

## 1. Security & Privacy Invariants Checklist

### A. Role-Based Crew Medical Privacy Tiers (`NASA-STD-3001 Vol. 1 Ch. 7`)
In a confined 4-person deep-space habitat, raw psychological, vocal, and medical records are highly sensitive. `crates/ares-security-privacy` enforces three strict access views via the `CrewPrivacyFilter` trait:
1. **`PrivateAstronautView`:** Accessible only to the individual astronaut; exposes full personal sleep architecture, vocal stress logs, and raw biomarker values.
2. **`CmoMedicalView` (Crew Medical Officer / Commander):** Exposes aggregated `Mission Readiness Index (MRI)`, `alarm_level`, and `NQS-STL` margins. Raw personal behavioral/vocal logs remain cryptographically masked unless (a) explicit astronaut consent is granted, or (b) a life-safety clinical threshold ($\hat{\rho}_k < 0$) is breached.
3. **`FlightSurgeonStoreAndForwardPacket`:** Delta-compressed, ChaCha20-Poly1305 encrypted clinical summary queued for asynchronous Deep Space Network (DSN) downlink.

### B. Air-Gap Network Zero-Trust
- The `axum` HTTP/WebSocket server in `crates/ares-server-cli` must bind strictly to `127.0.0.1:8080`.
- Zero outbound HTTP/HTTPS connections are permitted at runtime.

### C. Prompt Injection Shielding on Local FastMCP
- Sanitize all string inputs passed to `stdio` FastMCP tools against prompt override tokens (`<|im_start|>`, `system:`, `ignore previous instructions`).
- Wrap any free-text crew notes or OCR readings in `<untrusted_crew_note>` XML tags before passing to the local LLM copilot.

### D. Non-Repudiable SHA-256 Audit Chain (`HashChainAuditLogger`)
- Every execution of a MedOps Playbook step, every Hard Clinical Safety Gate lock/unlock event, and every manual CMO protocol override must be appended to a SHA-256 hash chain:
  $$H_i = \text{SHA256}\big(H_{i-1} \parallel \text{timestamp\_ms} \parallel \text{actor\_id} \parallel \text{action\_payload}\big)$$
- Ephemeral encryption keys in memory must implement `zeroize::Zeroize` and `zeroize::ZeroizeOnDrop`.
