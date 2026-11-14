# System Patterns & Architectural Invariants: ARES-Health

> Current evidence status (#12): implemented scenario models and configured policies are illustrative/unvalidated. Earlier claims of calibrated risk, clinically verified equations, certification or guaranteed forecast coverage are not established. See [MODEL_EVIDENCE_AUDIT.md](../docs/architecture/MODEL_EVIDENCE_AUDIT.md). Numerical behavior and treatment policies are unchanged by this audit.

## 1. Core Architectural Topology (Dual-Transport Safe Rust + React 3D Cockpit)
ARES-Health decouples deterministic physiological computation from visual rendering and natural-language explanation:

```
+---------------------------------------+     +---------------------------------------+
|     ASTRONAUT COCKPIT (ares-cockpit)  |     |    ON-BOARD EDGE AI COPILOT (LLM)     |
|   React 19 + TypeScript + Three.js    |     |   Local Quantized Model (llama.cpp)   |
|   OLED #000000 + What-If Console      |     |   Zero Cloud - Zero Hallucinations    |
+---------------------------------------+     +---------------------------------------+
                    ^                                             ^
                    | 20 Hz WebSocket + REST                      | JSON-RPC 2.0 (FastMCP)
                    | (127.0.0.1:8080 Loopback)                   | (Dedicated stdio Pipe)
                    v                                             v
+-------------------------------------------------------------------------------------+
|                    ARES-ENGINE (7-Crate Modular Safe Rust Workspace)                |
|  1. ares-core-types         (Shared Telemetry Schema, Units, Privacy & Audit Traits)|
|  2. ares-telemetry-ingest   (Ring Buffer, Radar/Vocal DSP, CANS Neutron, SQI>=0.70) |
|  3. ares-causal-graph       (ADHG + ARES-HyperGraph + 24-Dataset Graph, RK4, POCUS) |
|  4. ares-nqs-stl            (O(1) Lemire Wedge NQS-STL + Timestral Grey-Box Cones)  |
|  5. ares-medops-playbooks   (Playbooks #01-#05 DAGs + 3 Hard Clinical Safety Gates) |
|  6. ares-security-privacy   (Role-Based Crew Privacy Tiers, SHA-256 Audit, AEAD DSN)|
|  7. ares-server-cli         (Concurrent Tokio axum WebSocket + stdio FastMCP <150t) |
+-------------------------------------------------------------------------------------+
```

---

## 2. Non-Negotiable Mathematical & Clinical Invariants

### Invariant 1: Dimensional Venous Wall Shear Stress ($\tau_w$)
Internal Jugular Vein (IJV) endothelial wall shear stress under cylindrical Poiseuille/Womersley flow is computed strictly as:
$$\tau_w(t) = \frac{2 \cdot \mu \cdot v_{\max}(t)}{r(t)} = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\frac{\pi}{\text{IJV\_CSA}(t)}}$$
* $\mu = 0.035\text{ Poise}$ ($\text{g}\cdot\text{cm}^{-1}\cdot\text{s}^{-1}$).
* Nominal Earth/1g baseline: $v_{\max} = 30\text{ cm/s}$, $\text{CSA} = 1.0\text{ cm}^2 \implies \tau_w = 3.72\text{ dyn/cm}^2$.
* Deep-space stasis pathology: $v_{\max} = 4.0\text{ cm/s}$, $\text{CSA} = 2.6\text{ cm}^2 \implies \tau_w = 0.31\text{ dyn/cm}^2 \ll 4.0\text{ dyn/cm}^2$ (pro-thrombotic Weibel-Palade vWF/P-selectin exocytosis threshold).

### Invariant 2: Regularized Frost-Hargens Sclerostin & Muscle Quality ODE
Osteocyte Sclerostin ($\text{SOST}$) dynamics incorporate the Frost Mechanostat threshold ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), first-order renal clearance ($k_{\text{clear}}$), and Prof. Pegreffi's Ultrasound Muscle Quality Index ($\text{MQI}$):
$$\frac{d[\text{SOST}]}{dt} = k_{\text{prod}} \cdot \frac{\max\big(0,\; \varepsilon_{\text{Frost}} - \varepsilon_{\text{ARED}}(t)\big)}{\varepsilon_{\text{Frost}} + \varepsilon_{\text{ARED}}(t)} \cdot \left(\frac{\text{MQI}_0}{\max(\text{MQI}_{\min},\, \text{MQI}(t))}\right)^{\gamma} - k_{\text{iris}} \cdot [\text{Irisin}(t)] - k_{\text{clear}} \cdot \big([\text{SOST}(t)] - [\text{SOST}]_{\text{basal}}\big)$$

### Invariant 3: Normalized Quantitative Semantics Signal Temporal Logic (`NQS-STL`)
Every atomic predicate $\mu_k(x_k(t)) \ge 0$ is non-dimensionalized via signed clinical reserve normalization:
$$\hat{\rho}_k(t) = \frac{s_k \cdot \big(x_k(t) - x_{k,\text{crit}}\big)}{\big|x_{k,\text{nom}} - x_{k,\text{crit}}\big|} \in (-\infty, +1.0]$$
* Eliminates unit scale dominance between heterogeneous variables (e.g., $\tau_w$ in $\text{dyn/cm}^2$ vs. $\text{ARED}$ work in $\text{kJ}$).

### Invariant 4: Two-Stage Bayesian POCUS State Observer
Between episodic weekly ultrasound scans, latent states $\hat{z}_k(t)$ evolve via continuous causal drivers while variance grows linearly ($\sigma_k^2(t) = \sigma_{k,0}^2 + q_k(t - t_{\text{scan}})$). Upon POCUS scan acquisition, Kalman-Bayes update contracts $\sigma_k^2(t^+) \to \sigma_{\text{POCUS}}^2 \approx 0$.

### Invariant 5: Three Hard Clinical Safety Gates
1. **Gate 1 (No Empirical Anticoagulants in Isolated Stasis):** Systemic anticoagulants (Apixaban/Enoxaparin) are strictly locked out unless POCUS confirms a non-compressible intraluminal thrombus (`pocus_thrombus_confirmed == true`), preventing fatal traumatic intracranial hemorrhage during EVA.
2. **Gate 2 (LBNP Anti-Syncope Guardrail):** During $-30\text{ mmHg}$ LBNP sessions, if $\Delta\text{SBP} > 15\text{ mmHg}$ drop or $\text{HR} > 115\text{ bpm}$, immediately trigger `AUTO_VENT_LBNP_CHAMBER(0 mmHg)`.
3. **Gate 3 ($0.38g$ Martian Landing Gait Asymmetry Guardrail):** If post-landing IMU Gait Asymmetry Index $\text{GAI} > 12\%$, increase EVA suit ankle/knee exoskeletal damping by $+25\%$ and restrict long-range EVA until closed-chain retraining completes.

### Invariant 6: Crew Privacy Governance (`NASA-STD-3001 Vol. 1 Ch. 7`)
Behavioral, vocal, and raw medical logs are partitioned into three cryptographic access views (`PrivateAstronautView`, `CmoMedicalView`, `FlightSurgeonStoreAndForwardPacket`), ensuring psychological safety inside a confined 4-person habitat.

### Invariant 7: Grey-Box Neuro-Mechanistic `Timestral` Forecasting & Non-Crossing Quantile Cones (`Blocco H`, `Fasi 15–17`)
* Mechanistic ODEs (`Frost-Hargens RK4` + `Poiseuille tau_w`) remain primary for baseline drift and Hard Safety Gates, while Pure-Rust `Timestral` models multivariate stochastic residuals with explicit `[scaled_values, missing_mask]` dual patching (never imputing `Option<f64>::None` as false zeros).
* `MonotoneQuantileHead` enforces $q_{0.05} \le q_{0.50} \le q_{0.95}$ algebraically via triangular $\operatorname{softplus}$ accumulation, coupled with an adaptive `ConformalAbstentionGate` (`SQI >= 0.70`, `missing_ratio <= 0.40`).
* The `1 Hz` async forecaster publishes `Arc<NqsQuantileForecastSnapshot>` to the `20 Hz` hot-path via a lock-free `~180 ns` bridge, keeping the `20 Hz` tick at `< 70 µs << 150 µs`.

### Invariant 8: Three-Layer `ARES-HyperGraph` & 24-Dataset `ARES-DatasetGraph` (`Blocco I`, `Fasi 18–20`)
* **Layer 1 (`ADHG` + Welford Compactor):** Online Welford `LongitudinalSuperNode` coarsening compacts 900 Martian flight days into `< 200 KB` RAM.
* **Layer 2 (`ARES-SpatialGraph`):** Connects the 4 canonical 3D Anatomical Regions (driving the Cockpit 3D Body Heatmap) and the 6 Spacecraft Habitat Zones governed by conjunctive Q-STL `HabitatZoneDeonticPolicy` and Dirichlet-Multinomial Markov $D_{\text{KL}}$ anomaly detection.
* **Layer 3 (`ARES-BioKG` & `ARES-DatasetGraph`):** Stack-allocated `16-byte #[repr(C)] BiomedicalEvidenceDescriptor`, Noisy-OR `EpistemicProvenance`, `ClinicalAnswerabilityGate`, and the Hybrid Dual-Representation `ARES-DatasetGraph` (`14,623` nodes, `112,400` edges, `~8.4 MB` RAM + `data/knowledge_graph/ares_dataset_graph.json` compatible with `/graphify` and `FastMCP` `< 150 tokens`).

### Invariant 9: Dual-Transport Zero-Copy IPC & `ARES-MedOS` Partitioning (`Blocco J`, `Fasi 21–24`)
* **Binary Telemetry Contract (`BinaryTelemetryFrame`, `128 B` `#[repr(C, align(64))]`):** Hot numeric vitals, `NQS-STL` margins, and clinical safety flags are packed into two 64-byte cache lines with `validity_mask: u32` and `FLAG_BEAT_INTERVALS_NOT_AVAILABLE` / `FLAG_ILLUSTRATIVE_UNVALIDATED`, guaranteeing that `Option<f64>::None` channels (`rmssd_ms`, missing BIDMC `PULSE`/`SpO2`) remain `null` across both Rust and TypeScript `DataView` decoders and are never coerced to `0.0`.
* **ARINC-653 Lock-Free Partitioning:** `SeqlockTelemetryRing<N>` (`< 100 ns` SPMC) and optional `--features shm-ipc` (`eclipse-iceoryx/iceoryx2` `ZeroCopySend` + `eclipse-zenoh/zenoh`) ensure the `1 Hz / 20 Hz` physiological producer never blocks or fails if the UI compositor crashes.
* **Dual-Mode Preservation:** `crates/ares-desktop-os` (`Tauri v2` `Channel<Response>` `< 0.05 ms`, `~30–50 MB` RAM, air-gapped CSP `default-src 'self'`) embeds `SharedMissionState` in-process while keeping `127.0.0.1:8080` WebSocket/REST and `useTelemetry.ts` `BROWSER_WEBSOCKET` fallback 100% operational. Tier B/C targets map to `Asterinas` Framekernel (`14.0%` TCB), `cosmic-comp` Wayland Kiosk (`120 Hz` `wgpu`), and `Oxide Hubris` / `Embassy` `32 B` `CRC-16-CCITT` `WearableSensorPacket` framing.

### Invariant 10: Block L Gap Closure, Level-1 GATHER DSP, Advisory Copilot Barrier, Calibration & Submission Integrity (`Blocco L`, `Fasi 29–34` `[PLANNED]`)
Architettura master: [`BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md`](../docs/plans/BLOCK_L_GAP_CLOSURE_ARCHITECTURE.md).
* **Level-1 `GATHER` DSP Boundary (`Fase 31 / L3`):** Pure-Rust zero-heap `radar_csi_dsp.rs` (`60/5.2 GHz`, DF2T `60/120 Hz` Jury-stable notch), `vocal_acoustic_dsp.rs` (`YIN` + `HNR`/jitter/shimmer, `None` on silence/unvoiced), and `waveform_rr_extractor.rs` (`125–500 Hz` Pan-Tompkins + Malik $\pm 20\%$) enforce strict separation from 1 Hz numeric sources: `BidmcReplayer` (`1 Hz` CSV) MUST remain `rmssd_ms: None` with `BEAT_INTERVALS_NOT_AVAILABLE` (Issue `#11`), while `SqiFilter::evaluate_row_with_rmssd` accepts R-R metrics only from `125–500 Hz` waveforms or `WMASK_RR_INTERVAL` wearables.
* **Cockpit Live Binding & Air-Gapped 3D (`Fase 29 / L1` & `Fase 30 / L2`):** `PlaybookRunner.tsx`, `MriAndStl.tsx`, and `BodyHeatmap.tsx` bind directly to Rust `WireActivePlaybook`, `NqsQuantileForecastSnapshot`, and `hypergraph_spatial.cells` (`UBERON:` `observed=false` visually distinct from nominal, local `.glb` guarded by `0x46546C67` magic header and CSP `'self'`, `>= 44x44 pt` OLED touch targets), paired with `Tauri v2` `Channel<Response>` (`< 50 us`) and `ARINC 653` wait-free `iceoryx2`/`Zenoh` `try_dispatch` (`< 150 ns`).
* **Edge AI Copilot & `SafeTensors` Barrier (`Fase 32 / L4`):** Following `DO-178C` DAL-E separation, `edge_llm_bridge.rs` is strictly read-only/advisory (`0 ns` impact on `20 Hz` tick, `< 2.5 s` timeout with `< 400 us` deterministic `OfflineTemplateCopilot` fallback, `StrictMcpSanitizer` `<untrusted_telemetry_observation>` isolation, post-generation Safety Gate 1–3 verifier), and `timestral_safetensors.rs` verifies `SHA-256` against `assets/models/MANIFEST.json` with clean fallback to `new_deterministic`.
* **Subject-Disjoint Calibration & Deterministic Submission (`Fase 33 / L5` & `Fase 34 / L6`):** `calibration_harness.rs` & `ares-calibrate` enforce `SubjectDisjointSplit` anti-leakage (`CQR`, Clopper-Pearson, Brier/ECE) and forbid upgrading `ModelValidationStatus::IllustrativeUnvalidated` from synthetic data (Issue `#12`), while `scripts/build_submission_docs.sh` gates Typst (`SOURCE_DATE_EPOCH`) 7-slide PDF, `30s`/`180s` `.srt` captions, zero-emoji, and Issue `#12` semantic compliance.
