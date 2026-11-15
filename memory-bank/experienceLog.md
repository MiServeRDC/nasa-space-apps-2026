# Experience Log & Anti-Recurrence Invariants: ARES-Health

## Entry 015 — Aerospace 360 P0/P1 Runtime Hardening, CRC-32C v2 Migration & Playbooks #16..=#30 (2026-11-15)

- **CRC-32C Castagnoli v2 Migration & Orphan GC (`crates/ares-storage-lsah`):** Warm Arrow IPC segments and Cold AEAD archives migrated to Castagnoli CRC-32C v2 (`compute_crc32c`) with automatic v1 IEEE 802.3 fallback on legacy read, paired with warm orphan segment garbage collection so aborted multi-sol writes never leave unreferenced `.arrow.zst` files. (Supersedes the interim IEEE-only storage note in Entry 012 for v2+ archives while preserving v1 read compatibility.)
- **Gate 2 Dynamic LBNP Baseline, Vasovagal Bradycardia & HR Dropout (`crates/ares-medops-playbooks/src/safety_gates.rs`, `ws_server.rs`):** Hardcoded `120 mmHg` SBP reference fails for astronauts with lower/higher resting BP. `enforce_hard_clinical_safety_gates_with_lbnp_baseline` now anchors $\Delta\text{SBP}$ and HR drop against `LbnpBaselineState`, triggers auto-vent on vasovagal bradycardia (`< LBNP_MIN_SAFE_HR_BRADYCARDIA_BPM` or HR drop `> LBNP_MAX_VASOVAGAL_HR_DROP_BPM`), pulse pressure `< 25 mmHg`, or HR/SBP dropout, and strips anticoagulants via `is_systemic_anticoagulant_action` under Gate 1 (including platelets `< 75.0 K/uL` or radiation `> 10.0 mSv/d` with platelets `< 100.0 K/uL`).
- **Live Wiring Discipline (`ws_server.rs`, `hardware_adapter.rs`):** ECLSS `3.0`/`4.0` mmHg (`evaluate_coupled_habitat_crew_co2`), POCUS (`PocusEfastScan`, `PocusRenalBladderScan`), and `HardwareTransportAdapter` (`CRC-16-CCITT` + SQI gating) must execute in live `SharedMissionState::advance_tick`, never only in isolated unit tests.
- **Playbooks `#16..=#30`, Gates 5-7 & Sex-Specific Physiology:** All 30 playbooks (`#01..=#30`) must remain 1:1 synchronized across `playbooks*.rs`, `binary_ipc.rs` (`playbook_id_to_u16` / `playbook_id_from_u16`), and `binaryTelemetryDecoder.ts`, with `BiologicalSex::Male`/`Female` calibration and `ModelValidationStatus::IllustrativeUnvalidated` epistemic tagging.

## Entry 010 — Persistence acknowledgement and bounded failure recovery

- Never clear a staged Warm bank before the backend confirms its commit. Retain
  failed batches for retry, release failed reservations, report incomplete shutdown
  and flush partial banks on the deadline. Roll back in-memory manifest metadata
  after a failed commit. Runtime writers require an exclusive root lease and resume
  sequence IDs after reopen. In-memory pending/coalesced rows are not durable raw
  samples; do not promise zero loss during sustained disk failure or power loss.
- Tests: `flush_reliability`, `storage_runtime`, and the local browser/process
  regression script. Recording is explicit; test/evaluation modes do not start it.

## Entry 011 — Rendering and forecast experiments must preserve evidence boundaries

- Pausing unused local simulation, lazy chunks, memoized geometry, adaptive DPR and
  hidden-view suspension must not throttle alarm processing or change clinical
  values. Pool materials by layer/region, retaining mesh IDs and source geometry.
- Synthetic long-stream improvements do not establish clinical forecast quality.
  The horizon-scaled width candidate is disabled because development coverage
  worsened. Independent delayed scoring, interval width and coverage must all be
  checked. Current clipped EWMA does not inherit formal ACI guarantees.
- Sources/protocol: `docs/architecture/IMPLEMENTATION_STACK.md` optimization
  addendum and `docs/operations/PROJECT_OPTIMIZATION.md`.

## Entry 012 — Legacy Storage Manifest Serialization and Checksum Invariance

- Failure mode: adding optional fields with `#[serde(default)]` without `skip_serializing_if = "Option::is_none"` causes re-serialization to insert explicit `null` fields during manifest checksum verification, causing `CrcMismatch` on valid legacy manifests. Furthermore, defaulting legacy unpartitioned segments to `mission_sol` prematurely prunes multi-sol legacy data during range queries.
- Mandatory Invariant: always use `skip_serializing_if = "Option::is_none"` on optional metadata fields that participate in cryptographic or CRC checksum signatures. Legacy segments without explicit min/max sol bounds must be retained at the segment level and filtered row-by-row via Arrow boolean masks.
- Storage Policy Invariant: storage files (`.arrow.zst`) and manifests (`MANIFEST.lsah.json`) strictly use IEEE 802.3 CRC-32 (`compute_storage_crc32_ieee`). Castagnoli CRC-32C is reserved strictly for 128-byte binary network frames.

## Entry 013 — Telemetry Stream Monotonic Ordering and Hardware Provenance Isolation

- Failure mode 1: desktop client polling full snapshots at 1 Hz without in-flight request bounding or monotonic timestamp/sequence checks allows delayed responses to arrive after newer responses, regressing UI state and overwriting newer 20 Hz binary frames.
- Mandatory Invariant 1: enforce single-flight snapshot polling with a 1500 ms timeout race, and strictly reject any incoming snapshot payload whose `timestamp_ms` or `relative_recording_time_s` is older than the last applied state.
- Failure mode 2: calling `apply_stress_test_patch` in `LiveWearableHardware` mode and reading `current_replay_row()` silently overwrites active hardware vitals with CSV replay data (`bidmc_01`), resetting provenance to `RecordedTerrestrialBidmcCsv`.
- Mandatory Invariant 2: when `source_mode == LiveWearableHardware`, What-If stress test patches must update scenario-driven models (radiation, cabin CO2, bone loss, POCUS posterior) while strictly preserving hardware sensor observations, `source_record_id`, and `HardwareWearable` provenance. Switching to hardware mode before the first packet arrives must publish an explicit `awaiting_wearable_hardware` state with `None` vitals and `DataDegradedMissingChannels`.

> **Purpose:** Records mathematical, clinical, and systems engineering failure modes discovered during design and peer-review so no human teammate or AI coding agent ever re-introduces them.

---

## Entry 001 — Dimensional Inconsistency in Jugular Wall Shear Stress ($\tau_w$)
* **Failure Mode Prevented:** Writing $\tau_w \propto v_{\max} / \text{IJV\_CSA}$ produces units of $\text{dyn/cm}^3$ instead of pressure/stress ($\text{dyn/cm}^2$).
* **Mandatory Invariant:** Always express radius as $r(t) = \sqrt{\text{IJV\_CSA}(t)/\pi}$, yielding $\tau_w(t) = 2 \cdot \mu \cdot v_{\max}(t) \cdot \sqrt{\pi / \text{IJV\_CSA}(t)}$ with $\mu = 0.035\text{ Poise}$.

## Entry 002 — Fatal Intracranial Hemorrhage Risk from Empirical Anticoagulation
* **Failure Mode Prevented:** Automatically prescribing Apixaban or Enoxaparin solely on slow jugular velocity ($v_{\max} < 5.0\text{ cm/s}$) exposes astronauts to fatal subdural/intracranial bleeding during minor head impacts in microgravity or EVA.
* **Mandatory Invariant (Hard Safety Gate 1):** Lock out pharmacological anticoagulants unless POCUS confirms a non-compressible intraluminal thrombus (`pocus_thrombus_confirmed == true`). Isolated stasis is treated strictly with physical $-30\text{ mmHg}$ LBNP, calf contractions/NMES, and controlled hydration.

## Entry 003 — Pre-Syncopal Hypotension During LBNP Countermeasure
* **Failure Mode Prevented:** Unmonitored $-30\text{ mmHg}$ Lower Body Negative Pressure can sequester $> 500\text{ mL}$ of blood in the lower limbs, triggering acute orthostatic syncope in a solo astronaut.
* **Mandatory Invariant (Hard Safety Gate 2):** Continuously monitor blood pressure and heart rate during LBNP; automatically vent the chamber to $0\text{ mmHg}$ (`AUTO_VENT_LBNP_CHAMBER`) if systolic BP drops by $> 15\text{ mmHg}$ from baseline or HR exceeds $115\text{ bpm}$ (calibrated on NLSP *Neuroendocrine Tilt* data).

## Entry 004 — Unit Scale Dominance in Classical Signal Temporal Logic (STL)
* **Failure Mode Prevented:** Combining raw predicates with different physical units in $\min(\rho_1, \rho_2)$ causes small-magnitude variables ($\tau_w \in [0, 4]$) to permanently mask large-magnitude variables ($\text{ARED} \in [0, 150]$).
* **Mandatory Invariant:** Always normalize atomic predicates via NQS-STL: $\hat{\rho}_k(t) = s_k (x_k(t) - x_{k,\text{crit}}) / |x_{k,\text{nom}} - x_{k,\text{crit}}| \in (-\infty, +1.0]$.

## Entry 005 — Transport Contention Between UI Streaming and MCP stdio
* **Failure Mode Prevented:** Streaming $20\text{ Hz}$ UI telemetry over the same `stdio` pipe used by the FastMCP JSON-RPC copilot corrupts JSON-RPC framing.
* **Mandatory Invariant:** Isolate UI streaming (`axum` HTTP/WebSocket on `127.0.0.1:8080`) from AI copilot communication (`stdio` JSON-RPC 2.0) over shared state (`Arc<RwLock<MissionState>>`).

## Entry 006 — BIDMC CSV Header Whitespace, Missing Sensor Values & Provenance Separation (Issue #4)
* **Failure Mode Prevented:**
  1. Parsing `data/bidmc/bidmc_*_Numerics.csv` without trimming headers fails because PhysioNet BIDMC CSV columns contain leading spaces (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`).
  2. Coercing the 13 missing `PULSE` and `SpO2` samples in `bidmc_01_Numerics.csv` to `0.0` triggers false critical hypoxemia (`SpO2 = 0%`) and cardiac arrest (`PULSE = 0 bpm`) alarms.
  3. Conflating biological/mechanistic OSDR studies (`OSD-51`, `OSD-195`, `OSD-818`) with continuous real-time clinical waveform feeds undermines scientific credibility during NASA judging.
* **Mandatory Invariant:** Always trim CSV headers and cell values on ingestion, preserve missing samples as `Option<f64>::None` (`null` in JSON) with channel names recorded in `missing_channels`, keep native `1 Hz` relative recording time (`0..480 s`) explicit alongside `20 Hz` UI frame interpolation, and explicitly tag `RECORDED_TERRESTRIAL_BIDMC_CSV`, `DERIVED_COMPUTED`, and `SIMULATED_SCENARIO_INPUT` in `provenance_manifest`.

## Entry 007 — O(1) Lemire-Donze Sliding Window STL & Type-1 Crystallized Playbooks (`deep-scholar` Grounding)
* **Failure Mode Prevented:**
  1. Re-scanning the entire sliding temporal window $[t-W, t]$ at every tick to evaluate $\Box_{[t-W,t]} \hat{\rho}_k(t)$ scales as $O(W)$ and causes latency spikes when users drag the What-If Stress-Test Console sliders at $20\text{ Hz}$.
  2. Delegating emergency medical playbook selection (`Playbooks #01-#05` and the 3 Hard Safety Gates) to multi-turn LLM reasoning (Type-3 Agent-Orchestrated) introduces stochastic delay ($3\text{–}15\text{ s}$) and potential safety gate bypass.
* **Mandatory Invariant:**
  1. In `crates/ares-nqs-stl/src/sliding_window.rs`, use **Daniel Lemire's monotonic wedge (`VecDeque`)** as formalized for Signal Temporal Logic by **Donze, Ferrere & Maler (CAV 2013, `DOI: 10.1007/978-3-642-39799-8_19`)** to compute $\min_{\tau \in [t-W, t]} \hat{\rho}_k(\tau)$ in amortized **$O(1)$ time ($\le 3$ comparisons/sample)**.
  2. In `crates/ares-medops-playbooks`, compile all 5 MedOps playbooks and the 3 Hard Clinical Safety Gates as **Type-1 Deterministic Crystallized DAGs** (**Arun Malik**, `arXiv:2607.07052v1`, 2026; **Li et al. ProgRouter**, EMNLP 2026, `arXiv:2608.25992v2`) executing in $< 50\,\mu\text{s}$ in pure Rust, reserving `FastMCP stdio` strictly for compact (`< 150 token`) explanations.


## Entry 008 — Numeric monitor summaries are not beat-to-beat HRV

- Failure mode: fabricate RMSSD from HR/respiration, derive SDNN/pNN50/LF-HF from it, or replace missing RMSSD with 40/42 ms downstream.
- Invariant: numeric-only replay emits null HRV with `BEAT_INTERVALS_NOT_AVAILABLE`. The optional HRV margin, full global margin, MRI and dependent forecasts stay null. Known non-HRV hazards retain warning/emergency behavior; missing HRV cannot yield NOMINAL. Snapshots, WebSocket and MCP must preserve this distinction.
- Sources: https://neuropsychology.github.io/NeuroKit/functions/hrv.html and https://physionet.org/content/bidmc/1.0.0/.
- Integration: repeat issue #11 tests after merging native-cadence caching, alternate transports, forecasting or cockpit work. No waveform HRV implementation or frontend qualification is implied.


## Entry 009 — Model checks are not clinical calibration

- Failure mode: label fixed prior/LR scores as diagnostic probabilities, fixed 14% TTV spread as a 95% CI, or a default gate with no calibration observations as calibrated.
- Invariant: current scenario models emit `ILLUSTRATIVE_UNVALIDATED`; TTV uses `ILLUSTRATIVE_SCENARIO_RANGE` when available. Gate acceptance emits `HEURISTIC_GATE_ACCEPTED`; legacy calibrated input is deserialize-only compatibility. Known input absence continues to produce nulls.
- Evidence: [model audit](../docs/architecture/MODEL_EVIDENCE_AUDIT.md), including checked primary sources, formula/parameter register, boundaries and required target-population validation. No new clinical threshold or treatment rule is introduced.
- Dossier Markdown now points to the audit; historical PDF exports and the absent executable cockpit are not qualified by this task.


## Entry 012 — Reference anatomy, composite registration and empirical UI boundaries

- Generic anatomy is a reference, not a patient observation. Source sex, source
  identity, donor/adapted status, laterality, transforms and missing coverage must
  remain visible. A procedural female morph does not establish female internal
  reference anatomy. Do not assume HRA and another Visible Human-based package are
  co-registered; validate transforms and independent landmarks for the exact assets.
- Keep ARES clinical-region IDs separate from mesh/ontology identities. Preserve
  picking and annotations when batching or changing LOD; do not equate an eye with
  its optic sheath or the compound soleus/calcaneus region with one structure.
- Empirical nulls cannot fall back to scenario numbers; missing cone channels
  cannot fall back to HR under a rho label. Reduced motion cannot bypass action
  confirmation; initial WebGL failure must leave the 2D monitor usable.
- Current BodyParts3D CC BY terms do not relicense existing Z-Anatomy derivatives.
  Keep large originals outside git, ship optimized assets/decoders offline and
  preserve per-source credits. Sources and phase gates are recorded in the
  greenfield/anatomy plan and IMPLEMENTATION_STACK.md. Planning only; no new
  physical constants, clinical parameters or production changes.


## Greenfield display regression invariant (2026-11-15)

- Missing backend MRI/rho, habitat, imaging and HRV values cannot inherit scenario
  values. Preserve explicit nulls and finite zero; keep unavailable provenance.
- Forecast channel and unit must match exactly. Never borrow the first available
  HR cone for rho, fabricate an envelope from current rho, invent a ghost or fill
  unsupported horizons. Respect the relevant abstention certificate.
- Source identity and scenario mode must partition waveform history. Label
  hardware, recording, overlay and local preview using packet provenance.
- Procedural ultrasound/anatomy is illustrative; uncertainty and acquired imaging
  cannot be inferred from a local scenario. Absorbed dose mGy is not equivalent dose mSv.
- Regression evidence: greenfield_clinical_view.test.ts and the local phase01 browser
  harness. Phase 2 WebGL/confirmation/voice gaps remain explicit in the results.


## Greenfield optional features and local action invariants (2026-11-15)

- Missing/failed WebGL cannot unmount telemetry, alerts or playbooks. A Canvas
  boundary is separate from DOM; context restoration must clear the loss notice.
- Reduced motion changes presentation, never deliberate confirmation duration.
  Blur/release/hidden state/source or gate changes must invalidate an active hold.
- Browser speech is not inherently local: refuse start unless processLocally is
  supported and forced true. Errors use text, never a server retry.
- A local selection is not engine execution/device acknowledgement. Canonical
  content hashing and hash-link continuity are different guarantees. Serialize
  local appends, retain empty history honestly and never fabricate SHA-256.
- Anatomy source coverage and clinical answerability are independent. Registry
  validation is not anatomical review. Unknown/missing/ambiguous counterparts clear
  selection; donor annotations do not transfer by ontology alone.
- Evidence: GREENFIELD_PHASE23_RESULTS.md and ANATOMY_IDENTITY_AND_COVERAGE_ADR.md.


## Anatomy source identity, partial hashes and subcomponent terms (2026-11-15)

- Count nodes, meshes and ontology concepts separately. Exact node candidates and
  positive POSITION accessors are evidence of declared geometry, not anatomical
  correctness; optic nerve and its sheath are distinct requirements.
- Partial GLB JSON SHA, multipart ETag and full asset SHA are distinct. A metadata
  Range request must not silently fetch hundreds of MB when Range is ignored.
- An umbrella derivative license does not establish every contribution's terms.
  Z-Anatomy's official attribution lists noncommercial inner-ear/kidney inputs;
  preserve existing credits and resolve provenance before commercial packaging.
- A source record can establish a candidate and its license while a 403 leaves
  package inspection/hash acquisition pending. Common Visible Human provenance
  does not establish compatible registration. Do not copy community fit constants.
- Sources and evidence: docs/anatomy/SOURCE_DECISIONS.json, SOURCE_INVENTORY.json,
  COVERAGE_MATRIX.md and GREENFIELD_PHASE4_RESULTS.md. No physiology change.


## Semantic geometry and async ownership invariants (2026-11-15)

- Keep source node/mesh/primitive IDs across extraction, exact indexing, codec and
  LOD. A display batch is not an anatomy identity; triangle ranges recover the ID.
  Remove hidden geometry before rendering/picking; source labels alone do not prove
  anatomy. Reference selection must not mutate What-If or clinical values.
- Materialize normalized/interleaved attributes before transforms; reverse winding
  under reflection. Compact unreferenced LOD vertices so zero unused normals do not
  mask bad topology or need fake normal substitution. Never copy a fixture's LOD
  error policy into a clinical/anatomical tolerance.
- A superseded decode may finish but cannot publish. Own/release imported and
  display geometries separately; no unbounded model cache. Preflight decoded/batch
  and streamed-file budgets. Anchors bind to revision, asset hash and output node.
- Browser test Vite dependency caches must be isolated per invocation. A shared
  concurrent run produced an R3F context error; private caches passed sequential
  and concurrent checks. Do not disable the assertion to hide such failures.
- Evidence: ANATOMY_PIPELINE.md and GREENFIELD_PHASE5_RESULTS.md. Engineering API
  references are primary Three.js/Meshoptimizer docs; no physiology is introduced.

## 2026-11-15 — real atlas source identity and bounded reference rendering

A male-labelled asset bundle can include explicitly VH_F-labelled supplements.
Raw mesh nodes can also be unnamed; the nearest named ancestor is a source label,
not a reviewed ontology identity. IJV source groups include named tributaries and
unnamed primary primitives: descendant membership does not certify every child as
the parent vessel. Preserve raw file SHA/node index, disclose inherited labels,
keep missing sheath separate, and quarantine invalid geometry rather than repairing
it silently. Use GLTFLoader parser associations through multi-primitive parents.
Direct indexed batching avoids triangle expansion; reserve old plus replacement
geometry against the unchanged budget and keep the old view on rejection. Browser
load assertions must wait for the completed system identity, not a generic ready
flag that may still belong to the previous selection.

## EXP-014 — Registration evidence and female release source frames (2026-11-15)

HRA united-female v1.10/v1.5 source world frames and common Visible Human naming
do not establish cross-release/Denver registration. Keep source frames separate
and reject mixed frame chunks without an authored accepted transform. Enclosing
release sex does not establish contributor-specific donor sex (Allen brain labels).
Fit/check landmarks must have explicit anatomy, laterality, units, file hashes and
non-reused identities/coordinates. Report both residual sets; never borrow an
ad-hoc clinical tolerance or use low fit error as anatomical acceptance. Horn's
proper quaternion rotation (DOI 10.1364/JOSAA.4.000629) and least-squares scale
(Umeyama, DOI 10.1109/34.88573) support a numerical tool, not an automatic review.
Source: FEMALE_SOURCE_LOCK.json, FEMALE_REGISTRATION_REVIEW.md and implementation
stack addendum. A 403 package stays missing until actual bytes/entries/units are
inspected; no procedural or male substitution closes that coverage requirement.


## Replay/scenario integration qualification (2026-11-15)

- Hiding unmeasured organ metrics is insufficient if the same simulated model still
  suggests an ACT procedure. Outside explicit scenario mode, automatic procedures
  must come from the measured-vitals detector; NONE must remain monitoring standby,
  with catalog fallback only after explicit manual selection.
- A frontend overlay boolean cannot deactivate a stateful backend implicitly.
  Explicit on/off patches must share the scenario serialization queue and be sent
  on reconnect. Verify actual backend provenance, null metrics, unchanged replay
  clock and preserved learning when switching off.
- Historical module/unit tests can pass without covering the current App entry
  point. Qualify the production bundle against an actual owned backend process.
- An isolated passing latency assertion does not invalidate an earlier loaded-run
  failure. Record both; do not loosen the production budget to make tests green.


## LanceDB optional local-only build repair (2026-11-15)

- A registry SDK can contain unconditional references to a feature-gated error
  variant. Do not enable remote/cloud transport merely to compile an embedded
  backend; preserve an audited source patch and original archive hashes/license.
- LanceDB 0.40 Scannable requires a boxed RecordBatchReader + Send trait object;
  boxing a concrete RecordBatchIterator is insufficient for generic create/add.
- Compile success does not establish backend parity. Test actual writes/reopening
  and read through an implemented SDK path, retaining nullable HRV and simulation
  provenance; never count placeholder empty reads/searches as successful storage.
- Patched vendor sources need complete file/hash verification plus prominent
  modification notices; keep the vendor outside workspace membership and document
  its upstream warnings separately from workspace lint outcomes.


## Same-source stream recovery and actual test execution (2026-11-15)

- A connection badge and a passing pure gate do not prove telemetry updates.
  Duplicate ordering checks in the hook can override accepted replay transitions.
  Exercise the production hook after restarting the real engine with the same
  record ID, and require a new visible clock and detector baseline.
- Recording time repeats; engine elapsed time advances within a process. Use that
  independent existing clock to prove wraps instead of treating any large backward
  jump as a loop. Reset ordering at a new socket session and reject late hydration.
- With cfg-gated integration tests, the newest executable after default Cargo tests
  may contain zero cases. Select the feature-enabled binary by its test list and
  verify actual case counts, not just exit zero, in network-denied reruns.
