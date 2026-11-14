// docs/submission/NASA_2026_7_SLIDE_DECK.typ
// Offline zero-network Typst 0.15.1 widescreen 16:9 OLED competition deck (7 slides).
// Zero remote package imports. Zero Unicode emojis. Compliant with MODEL_EVIDENCE_AUDIT.md.

#let evidence-status = sys.inputs.at("evidence_status", default: "ILLUSTRATIVE_UNVALIDATED")

#let oled-black  = rgb("#000000")
#let panel-dark  = rgb("#0A0A0A")
#let panel-alt   = rgb("#06090F")
#let border-line = rgb("#1F2937")
#let cyan-nom    = rgb("#06B6D4")
#let amber-warn  = rgb("#F59E0B")
#let red-crit    = rgb("#EF4444")
#let green-ok    = rgb("#4ADE80")
#let text-main   = rgb("#F3F4F6")
#let text-muted  = rgb("#9CA3AF")

#set document(
  title: "ARES-Health: Official NASA Space Apps Challenge 2026 7-Slide Deck",
  author: "Fabio Malagutti & ARES-Health Team (University of Bologna)",
)

#set page(
  paper: "presentation-16-9",
  fill: oled-black,
  margin: (top: 34pt, bottom: 28pt, x: 26pt),
  header: context {
    let pg = counter(page).get().first()
    block(width: 100%, stroke: (bottom: 0.75pt + border-line), inset: (bottom: 4pt))[
      #set text(size: 8pt, fill: text-muted, font: ("Menlo", "Courier New"))
      #grid(
        columns: (1fr, auto, auto),
        gutter: 10pt,
        align: (left, center, right),
        [#strong(text(fill: cyan-nom)[ARES-HEALTH | ARES-MEDOS v0.1]) | NASA SPACE APPS 2026],
        [AIR-GAPPED SAFE RUST 2024 | OWLT 4-24 MIN EIMO \[V1 3006\]],
        [#text(fill: text-main, weight: "bold")[SLIDE #pg / 7]],
      )
    ]
  },
  footer: context {
    let total = counter(page).final().first()
    [
      #metadata((total_pages: total, evidence_status: evidence-status)) <deck-meta>
      #block(width: 100%, stroke: (top: 0.75pt + border-line), inset: (top: 4pt))[
        #set text(size: 7pt, font: ("Menlo", "Courier New"))
        #grid(
          columns: (auto, 1fr, auto),
          gutter: 8pt,
          align: (left + horizon, left + horizon, right + horizon),
          box(stroke: 0.6pt + amber-warn, fill: rgb("#1A1204"), inset: (x: 4pt, y: 1.5pt), radius: 2pt)[
            #text(fill: amber-warn, weight: "bold")[STATUS: #evidence-status]
          ],
          text(fill: text-muted)[
            EVIDENCE AUDIT (ISSUE #12): Recorded BIDMC v1.0.0 numerics remain distinct from illustrative scenario models. Not clinically validated or fitness-for-duty.
          ],
          text(fill: cyan-nom)[MIT OR Apache-2.0 | MiServeRDC/nasa-space-apps-2026],
        )
      ]
    ]
  },
)

#set text(fill: text-main, size: 9.2pt, font: ("Helvetica Neue", "Helvetica", "Arial"))
#set par(leading: 0.45em, justify: false)

#let mono(body, size: 8pt, color: text-main) = text(
  font: ("Menlo", "Courier New"),
  size: size,
  fill: color,
  body,
)

#let badge(label, color) = box(
  stroke: 0.6pt + color,
  inset: (x: 4pt, y: 1.5pt),
  radius: 2pt,
)[#mono(label, size: 6.8pt, color: color)]

#let ares-card(title, badge-text, badge-color, body) = block(
  width: 100%,
  fill: panel-dark,
  stroke: 0.75pt + border-line,
  radius: 4pt,
  inset: 8pt,
)[
  #grid(
    columns: (1fr, auto),
    gutter: 6pt,
    align: (left + horizon, right + horizon),
    text(size: 9.6pt, weight: "bold", fill: cyan-nom)[#title],
    badge(badge-text, badge-color),
  )
  #v(3pt)
  #body
]

#let kpi-box(label, val, sub, color) = block(
  width: 100%,
  fill: panel-alt,
  stroke: 0.7pt + color,
  radius: 3pt,
  inset: 6pt,
)[
  #mono(label, size: 6.8pt, color: text-muted)
  #v(1.5pt)
  #text(size: 12.5pt, weight: "bold", fill: color)[#val]
  #v(1pt)
  #text(size: 7.4pt, fill: text-muted)[#sub]
]

#let ares-slide(pillar, title, subtitle, content, break-after: true) = {
  block(width: 100%)[
    #mono(pillar, size: 7.8pt, color: amber-warn)
    #v(1.5pt)
    #text(size: 16pt, weight: "bold", fill: text-main)[#title]
    #v(1.5pt)
    #text(size: 8.8pt, fill: text-muted)[#subtitle]
    #v(6pt)
    #content
  ]
  if break-after { pagebreak() }
}

// ============================================================================
// SLIDE 1: TITLE & THE 8-48 MIN MARS LATENCY HOOK
// ============================================================================
#ares-slide(
  "SLIDE 01 | MISSION MANDATE & IMPACT",
  "ARES-Health: Autonomous Edge Medical Autonomy for Deep Space",
  "Autonomous Resilient Edge-native System for Astronaut Health | NASA Space Apps Challenge 2026",
  [
    #grid(
      columns: (1.25fr, 1fr),
      gutter: 10pt,
      [
        #ares-card("The Speed-of-Light Barrier (Earth-Mars Transit)", "NASA CHAPEA / STD-3001 [V1 3006]", red-crit)[
          In Low Earth Orbit, flight surgeons monitor crews near real time. Beyond cislunar space, physics breaks cloud telemedicine:
          #v(3pt)
          - *One-Way Light Time (OWLT):* $t_"OWLT" in [4, 24]$ min ($t_"RTT" in [8, 48]$ min round-trip), plus up to *14-day solar conjunction blackouts*.
          - *5 RIDGE Spaceflight Hazards:* Radiation, Isolation, Distance, Gravity fields ($0g -> 0.38g$), Hostile closed Environment.
          - *Autonomous Imperative:* Under *Earth-Independent Medical Operations (EIMO)*, the crew needs air-gapped onboard software that executes *GATHER -> EVALUATE -> ACT* locally with zero internet dependency.
        ]
        #v(6pt)
        #ares-card("Closed-Loop Operational Architecture", "GATHER -> EVALUATE -> ACT", cyan-nom)[
          #grid(
            columns: (1fr, 1fr, 1fr),
            gutter: 6pt,
            [
              #text(weight: "bold", fill: green-ok, size: 8.5pt)[1. GATHER] \
              Deterministic 1 Hz BIDMC replay + multi-modal radar/wearable/CANS schemas, SQI filtering, strict `null` honesty.
            ],
            [
              #text(weight: "bold", fill: cyan-nom, size: 8.5pt)[2. EVALUATE] \
              Coupled ADHG scenario ODEs, $O(1)$ Lemire `NQS-STL` margins, Timestral monotone cones, BioKG evidence trace.
            ],
            [
              #text(weight: "bold", fill: amber-warn, size: 8.5pt)[3. ACT] \
              Type-1 MedOps Playbooks `#01-#05` (`< 20 us`) guarded by 3 Hard Clinical Safety Gates and FastMCP copilot.
            ],
          )
        ]
      ],
      [
        #grid(
          columns: (1fr, 1fr),
          gutter: 6pt,
          kpi-box("ROUND-TRIP DELAY", "8 - 48 min", "Plus 14d blackout", red-crit),
          kpi-box("RUST WORKSPACE", "8 Crates", "Safe Rust 2024, 0 panics", green-ok),
          kpi-box("1-TICK PIPELINE", "5.58 us", "Release p99.9 latency", cyan-nom),
          kpi-box("SEQLOCK 128B IPC", "42.0 ns", "p50 zero-copy read", cyan-nom),
        )
        #v(6pt)
        #ares-card("Team & Competition Metadata", "OPEN SOURCE", green-ok)[
          - *Track:* Create Health Monitoring Software for Astronauts on Space Missions
          - *Lead Architect:* Fabio Malagutti (Univ. of Bologna)
          - *Team (5):* `@fabiomalagutti27-droid`, `@carolina2910`, `@fertech02`, `@LelloXV`, `@MiServeRDC`
          - *Repository:* `MiServeRDC/nasa-space-apps-2026`
          - *License:* `MIT OR Apache-2.0` (Fresh-Code compliant)
          - *Epistemic Boundary:* Recorded BIDMC data and illustrative scenario models are explicitly separated (`MODEL_EVIDENCE_AUDIT.md`).
        ]
      ]
    )
  ],
)

// ============================================================================
// SLIDE 2: GATHER — BIDMC LIVE REPLAY, SQI & MULTI-MODAL TELEMETRY
// ============================================================================
#ares-slide(
  "SLIDE 02 | PILLAR 1: GATHER",
  "GATHER: Reproducible BIDMC Replay, Null Honesty & Level-1 DSP",
  "Zero-fabrication physiological ingestion decoupling 1 Hz native recordings from 20 Hz cockpit rendering",
  [
    #grid(
      columns: (1.1fr, 1fr),
      gutter: 10pt,
      [
        #ares-card("PhysioNet BIDMC v1.0.0 Deterministic Replay", "RECORDED_TERRESTRIAL_BIDMC_CSV", green-ok)[
          - *Bundled Reference Data (`ODC-By-1.0`):* `bidmc_01..03_Numerics.csv` (`481` rows each, `0..480 s` at `1.0 Hz`), verified at startup via `SHA-256` against `data/bidmc/MANIFEST.json`.
          - *Header Normalization:* `BidmcReplayer` trims leading whitespace (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`) without mutating values.
          - *Strict Null Honesty (Issue #4 & #11):* The `13` missing `PULSE`/`SpO2` samples in `bidmc_01` remain `Option<f64>::None` (`null` / `MISSING`), never zero-filled.
          - *No Fabricated HRV:* `1 Hz` numerics carry no R-R beat intervals, so `rmssd_ms` stays `None` with explicit reason `BEAT_INTERVALS_NOT_AVAILABLE` and alarm `DATA_DEGRADED_MISSING_CHANNELS`.
        ]
        #v(6pt)
        #ares-card("Numeric Quality Heuristic & ZOH Guard", "HEURISTIC SQI >= 0.70", amber-warn)[
          - `sqi_filter.rs` evaluates a `16`-sample HR-difference entropy heuristic ($0.96 - 0.14 h_"norm" - 0.18 f_"miss"$) with `30 s` bounded Zero-Order Hold (`HOLD_LAST_VALID`) on motion artifacts, transitioning explicitly to `HELD_STALE` / `UNAVAILABLE`.
        ]
      ],
      [
        #ares-card("Level-1 Pure-Rust DSP & Multi-Modal Bus", "PHASE 31 (L3) + HUBRIS 32B", cyan-nom)[
          - *Contactless Radar (`radar_csi_dsp.rs`):* `60 / 5.2 GHz` I/Q phase demodulation $Delta phi(t) = 4 pi d(t) / lambda$ + EMA clutter removal + Jury-stable `60/120 Hz` DF2T biquad ECLSS fan notch.
          - *Vocal Biomarkers (`vocal_acoustic_dsp.rs`):* Zero-heap `YIN` $F_0$, HNR, jitter, shimmer, and VAD pause ratio; emits `None` on silent/unvoiced frames.
          - *Waveform R-R Extractor (`waveform_rr_extractor.rs`):* Pan-Tompkins QRS (`125-500 Hz`) + Malik `+/-20%` ectopic filter for true beat-interval streams only.
          - *Wearable & Dosimetry Packets:* `32 B` `#[repr(C)] WearableSensorPacket` protected by `CRC-16-CCITT` + `Oxide Hubris` `supervisor_restart_count` + `CSA CANS` real-time neutron dosimetry (`mSv/d`).
        ]
        #v(6pt)
        #grid(
          columns: (1fr, 1fr),
          gutter: 6pt,
          kpi-box("MISSING VALUES", "13 Nulls", "Preserved in bidmc_01", amber-warn),
          kpi-box("WEARABLE PKT", "32 Bytes", "CRC-16 + SEU counter", green-ok),
        )
      ]
    )
  ],
)

// ============================================================================
// SLIDE 3: EVALUATE I — ADHG MUSCLE-BONE-VASCULAR ODEs & BIOKG
// ============================================================================
#ares-slide(
  "SLIDE 03 | PILLAR 2: EVALUATE (PART I)",
  "EVALUATE I: Multi-Organ ADHG Scenario ODEs & BioKG Traceability",
  "Coupling soleus mechanotransduction, sclerostin dynamics, jugular wall shear stress, and POCUS observation",
  [
    #grid(
      columns: (1.08fr, 1fr),
      gutter: 10pt,
      [
        #ares-card("Musculoskeletal & Frost-Hargens Sclerostin ODE", "ILLUSTRATIVE SCENARIO MODEL", amber-warn)[
          - *Mechanostat ODE (`mechanotransduction.rs`):* $12$-step fixed-step `RK4` (`step_sclerostin_rk4`) verified via Richardson step-halving ($O(h^4)$ error ratio $>= 14.5$):
            $ (d["SOST"]) / (d t) = k_"prod" / (1 + (epsilon_"mech" / epsilon_"Frost")^2) - k_"deg" ["SOST"], quad epsilon_"Frost" = 1000 mu epsilon $
          - *Illustrative Coupling:* Sub-threshold ARED load raises scenario `SOST` (`pmol/L`) and urinary calcium, degrades simulated soleus `MQI`, and drives partial-gravity Martian gait asymmetry `GAI` (`0.38g`).
        ]
        #v(6pt)
        #ares-card("CGS Jugular Shear Stress & SANS Translaminar Index", "DIMENSIONAL CGS EXACT", cyan-nom)[
          - *Hagen-Poiseuille Wall Shear (`hemodynamics.rs`):*
            $ tau_w (t) = 2 mu v_max (t) sqrt(pi / "IJV_CSA"_"cm^2" (t)) quad ["dyn/cm"^2], quad mu = 0.035 " Poise" $
          - *SANS Scenario Proxy (`OSD-818` context):* Links cephalic congestion to scenario `ONSD` (`mm`) and choroidal delta (`um`) for display and playbook routing.
        ]
      ],
      [
        #ares-card("Two-Stage Bayesian POCUS Observer", "PRE <= 0.45 | POST >= 0.92", red-crit)[
          - *Stage 1 (Passive Stasis):* Continuous telemetry computes a pre-ultrasound scenario score strictly capped at $P_"pre" <= 0.45$, preventing empirical anticoagulation.
          - *Stage 2 (Confirmed B-Mode):* Only an explicit `pocus_thrombus_confirmed == true` observation updates odds via scenario `LR+ = 24.0` (clamped `0.92..0.995`).
        ]
        #v(6pt)
        #ares-card("ADHG + 3-Tier ARES-HyperGraph & BioKG", "PETGRAPH + 16B CRC-8", cyan-nom)[
          - *Layer 1 (`ADHG`):* `petgraph::StableDiGraph` propagating multi-organ causal weights.
          - *Layer 2 (`Spatial & Longitudinal`):* `WelfordAccumulator` + `LongitudinalSuperNode` (`900 Sol` in `167,352 B < 200 KB`), `5` `UBERON:` 3D regions, `6` deontic habitat zones + Markov $D_"KL"$.
          - *Layer 3 (`ARES-BioKG`):* `16 B #[repr(C, align(16))]` `BiomedicalEvidenceDescriptor` (`CRC-8`, `O(1)` lookup `41.0 ns p50`) + `AresUnifiedDatasetGraph` (`110` nodes, `326` Biolink edges).
        ]
      ]
    )
  ],
)

// ============================================================================
// SLIDE 4: EVALUATE II — NQS-STL O(1) LEMIRE WEDGE & TIMESTRAL CONES
// ============================================================================
#ares-slide(
  "SLIDE 04 | PILLAR 2: EVALUATE (PART II)",
  "EVALUATE II: O(1) NQS-STL Lemire Wedge & Timestral Quantile Cones",
  "Scale-invariant temporal margins and structurally non-crossing forecast cones with explicit heuristic gating",
  [
    #grid(
      columns: (1fr, 1fr),
      gutter: 10pt,
      [
        #ares-card("Normalized Quantitative Semantics (NQS-STL)", "PROVISIONAL LIMITS", cyan-nom)[
          - *Dimensionless Margin (`normalizer.rs`):*
            $ hat(rho)_k (t) = "clamp"( (s_k (x_k (t) - x_"k,crit")) / (|x_"k,nom" - x_"k,crit"|), -2.0, +1.0 ) $
            Maps `tau_w` (`dyn/cm^2`), `ARED`, `SOST` (`pmol/L`), `SANS`, `CANS` (`mSv/d`), and `RMSSD` (`ms`) onto a shared $[-2.0, +1.0]$ robustness scale.
          - *O(1) Rolling Operator (`LemireMinWedge`):* Evaluates $square_[t-W,t] hat(rho)_k$ in $<= 3$ comparisons/sample; verified against an $O(W)$ oracle across `2,000` random sequences.
          - *Null-Safe Global Score:* When `rmssd_ms` is absent (`BEAT_INTERVALS_NOT_AVAILABLE`), global `mri_pct` / full HRV assessment stays `None` while active hazard margins remain visible.
        ]
        #v(6pt)
        #ares-card("Illustrative TTV Sensitivity Range", "NOT 95% CI", amber-warn)[
          - `ttv_predictor.rs` computes scenario Time-To-Violation (`TTV`) bounds tagged `ILLUSTRATIVE_SCENARIO_RANGE` (`0.5..720 h`), explicitly superseded from historical `ci95` wording per `MODEL_EVIDENCE_AUDIT.md`.
        ]
      ],
      [
        #ares-card("Pure-Rust Timestral Forecaster & Monotone Head", "0 CROSSINGS / 10K", green-ok)[
          - *Backbone (`timestral_backbone.rs`):* `CausalScaler` (`asinh`/`sinh`), missing-channel mask handling `bidmc_01` `None`s, `RmsNorm`, `FusedSwiGlu`, `SinCosRoPe`, and `DualAxisAttention` (`SdpaSigmoid`), plus `SafeTensors` loader (`SHA-256` verified + deterministic fallback).
          - *Non-Crossing Quantile Head (`QuantileHead`):*
            $ q_0.05 = q_0.50 - "softplus"(delta_"low"), quad q_0.95 = q_0.50 + "softplus"(delta_"high") $
            Guarantees $q_0.05 <= q_0.50 <= q_0.95$ across `10,000` `proptest` trajectories (`0` crossings).
        ]
        #v(6pt)
        #ares-card("Heuristic Gate & Phase 33 Calibration Protocol", "HEURISTIC_GATE_ACCEPTED", amber-warn)[
          - `ConformalAbstentionGate` checks `SQI >= 0.70`, missingness `<= 0.40`, cone width `<= 1.25`, and EMA drift `<= 0.35`, emitting `HEURISTIC_GATE_ACCEPTED` (`ABSTAINED_FALLBACK` on failure).
          - *Phase 33 (`L5`) Harness:* `SubjectDisjointSplit` CQR + Clopper-Pearson + Brier/ECE gate prevents any status upgrade until out-of-sample coverage is verified.
        ]
      ]
    )
  ],
)

// ============================================================================
// SLIDE 5: ACT — TYPE-1 MEDOPS PLAYBOOKS & 3 HARD SAFETY GATES
// ============================================================================
#ares-slide(
  "SLIDE 05 | PILLAR 3: ACT",
  "ACT: Deterministic Type-1 MedOps Playbooks & 3 Hard Safety Gates",
  "Zero-LLM critical path (< 20 us DAG selection) enforcing physiological interlocks before countermeasure action",
  [
    #grid(
      columns: (1.05fr, 1fr),
      gutter: 10pt,
      [
        #ares-card("5 Type-1 Crystallized Playbooks (ares-medops-playbooks)", "DETERMINISTIC DAG", cyan-nom)[
          Compiled directly as pure-Rust state machines (`select_candidate_playbook`) grounded to `NASA-STD-3001` & `OCHMO MTB-007`:
          #v(3pt)
          - *Playbook #01 (`VENOUS_STASIS_LBNP`):* `-30 mmHg` LBNP (`45 min`) + calf contractions + bilateral IJV POCUS exam.
          - *Playbook #02 (`CONFIRMED_IJV_THROMBUS`):* Unlocks weight-adjusted anticoagulation *only* after B-mode thrombus confirmation + suspends heavy Valsalva ARED squats.
          - *Playbook #03 (`SARCOPENIA_OSTEOPENIA_ARED`):* `>= 125 kgf` (`> 1000` microstrain) ARED loading + `>= 2.8 L/d` hydration & potassium citrate.
          - *Playbook #04 (`SANS_TRANSLAMINAR_MITIGATION`):* `50 mmHg` lower-extremity venous thigh cuffs + nocturnal LBNP.
          - *Playbook #05 (`SPE_RADIATION_SHELTER_CANS`):* Storm shelter ingress when `CSA CANS > 1.5 mSv/d` + endothelial radioprotection.
        ]
      ],
      [
        #ares-card("The 3 Hard Clinical Safety Gates (safety_gates.rs)", "HARD INTERLOCKS", red-crit)[
          - *Gate 1 — Anticoagulation Lock (`anticoagulant_lock_active`):* Blocks Enoxaparin/Apixaban (`GATE 1 LOCKED`) during isolated stasis when `pocus_thrombus_confirmed != true`, preventing catastrophic EVA trauma hemorrhage.
          - *Gate 2 — LBNP Anti-Syncope Auto-Vent (`lbnp_auto_vent_armed`):* Immediately vents `-30 mmHg` LBNP chamber to `0 mmHg` (`AUTO_VENT_LBNP_CHAMBER_0_MMHG`) if $Delta"SBP" > 15 " mmHg"$ or $"HR" > 115 " bpm"$.
          - *Gate 3 — 0.38g Mars EVA Suit Damping (`eva_suit_damping_active`):* Automatically engages `+25%` ankle/knee exoskeletal damping whenever Martian `GAI > 12%`.
        ]
        #v(6pt)
        #ares-card("Non-Repudiable Security & Privacy (ares-security-privacy)", "FIPS 180-4 / RFC 8439", green-ok)[
          - *3-Role Privacy:* `AstronautSelf`, `CrewMedicalOfficer`, `GroundFlightSurgeon` (`NASA-STD-3001 Vol. 1 Ch. 7`).
          - *Audit & DSN Crypto:* Chained `SHA-256` override log + `ChaCha20-Poly1305` AEAD with `ZeroizeOnDrop` ephemeral keys.
        ]
      ]
    )
  ],
)

// ============================================================================
// SLIDE 6: ARES-MEDOS EDGE ARCHITECTURE — 8-CRATE RUST, 128B IPC & FASTMCP
// ============================================================================
#ares-slide(
  "SLIDE 06 | SYSTEM ARCHITECTURE & CREATIVITY",
  "ARES-MedOS: 8-Crate Safe Rust 2024, 128B Seqlock IPC & FastMCP",
  "Air-gapped Tauri v2 workstation shell + #000000 OLED cockpit + bounded edge copilot (<= 600 B)",
  [
    #grid(
      columns: (1.05fr, 1fr),
      gutter: 10pt,
      [
        #ares-card("8-Crate Safe Rust 2024 Workspace", "0 UNWRAP/EXPECT IN SRC", green-ok)[
          #set text(size: 8.3pt)
          1. `ares-core-types`: Telemetry contracts, `BinaryTelemetryFrame` (`128 B`), `NASA-STD-3001` constants.
          2. `ares-telemetry-ingest`: `BidmcReplayer`, `SqiFilter`, `WearableSensorPacket` (`32 B`), Level-1 DSP.
          3. `ares-causal-graph`: `ADHG`, `RK4`, `tau_w`, POCUS, `HyperGraph`, `DatasetGraph`, Parquet adapters.
          4. `ares-nqs-stl`: `LemireMinWedge`, `Timestral`, `SafeTensors` loader, `calibration_harness`.
          5. `ares-medops-playbooks`: Playbooks `#01-#05`, Gates `1-3`, `ARES-BioKG` grounding.
          6. `ares-security-privacy`: `SHA-256` audit chain, `ChaCha20-Poly1305`, `StrictMcpSanitizer`.
          7. `ares-server-cli`: `axum` `20 Hz` WS (`127.0.0.1:8080`), `FastMCP`, `shm_bus`, `edge_llm_bridge`.
          8. `ares-desktop-os`: `Tauri v2` native shell (`Channel<Response>`), `OsStatus`, `whisper-rs` hook.
        ]
      ],
      [
        #ares-card("Zero-Copy 128B Binary ABI & Verified Latencies", "BLOCK K --RELEASE", cyan-nom)[
          - `#[repr(C, align(64))] BinaryTelemetryFrame` (`128 B`, Castagnoli `CRC-32C` + `validity_mask` preserving `null`s) verified bit-exact between Rust and TypeScript `DataView`.
          - *Measured `--release` (`N=1,000`):* `SeqlockTelemetryRing::read_latest_bytes` `p50 = 42.0 ns` (`p99.9 = 84.0 ns`); full 1-tick pipeline `p50 = 2.12 us` (`p99.9 = 5.58 us`); `DatasetGraph` query `p50 = 16.25 us`.
        ]
        #v(6pt)
        #ares-card("FastMCP Palette (Alt+Space) & Air-Gapped Copilot", "<= 600 B / < 150 TOK", amber-warn)[
          - `8` read-only `FastMCP` tools (`get_crew_health_summary`, `query_dataset_graph`, `explain_biomarker_path`, `get_timestral_quantile_cones`, `get_hypergraph_spatial_status`, etc.) capped at `<= 600 B`.
          - *Indirect Prompt Injection Shield:* `<untrusted_telemetry_observation>` XML spotlighting; local quantized LLM / offline Voice Copilot never modifies ODEs or Safety Gates (`Type-1` template fallback `< 400 us`).
        ]
      ]
    )
  ],
)

// ============================================================================
// SLIDE 7: 24-DATASET TRACEABILITY, HONEST EVIDENCE & EARTH SPIN-OFFS
// ============================================================================
#ares-slide(
  "SLIDE 07 | TRACEABILITY, EVIDENCE AUDIT & SPIN-OFFS",
  "24-Dataset Traceability, Honest Evidence & Terrestrial Spin-Offs",
  "Explicit provenance separation across NASA, CSA, ESA, DLR, JAXA, TRISH, PhysioNet & UCI resources",
  [
    #grid(
      columns: (1.25fr, 1fr),
      gutter: 10pt,
      [
        #ares-card("Multi-Agency Sources & Strict Evidence Role (24 Cataloged)", "MODEL_EVIDENCE_AUDIT.md", cyan-nom)[
          #set text(size: 7.8pt)
          #table(
            columns: (auto, 1fr, auto),
            stroke: 0.5pt + border-line,
            inset: 4pt,
            fill: (_, row) => if row == 0 { rgb("#0F172A") } else { oled-black },
            [#strong[Agency]], [#strong[Integrated Datasets / Standards]], [#strong[Evidence Role]],
            [*PhysioNet*], [`BIDMC v1.0.0` (`bidmc_01..03`), `MIT-BIH`, `PTB-XL`, `MIMIC-IV`, `HiRID`, `Tilt Table`, `CEBS`, `Fantasia`], [`RECORDED_REPLAY` / `TECH_BENCH`],
            [*NASA OSDR*], [`OSD-51`, `OSD-195`, `OSD-570/571`, `OSD-635`, `OSD-818`, `Rodent Research RR-1..10`], [`BIOLOGICAL_CONTEXT_ONLY`],
            [*NASA HRP/NLSP*], [`NASA-0000100` (`BRSMFSR`, `BRSMPT`), `LSAH`, `ARCHeR`, `Zero T2`, `CIPHER`, `CHAPEA`, `HERA`], [`CATALOG_AND_ANALOG_CONTEXT`],
            [*NASA Standards*], [`NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F`, `OCHMO MTB-007`, `NSRL GCR`], [`NORMATIVE_REQUIREMENT_CONTEXT`],
            [*CSA / ESA / DLR*], [`CSA CANS (2026)`, `Bio-Monitor`, `Vascular`, `MARROW`, `ESA Myotones`, `BRACE`, `MARS-500`, `SIRIUS`, `AGBRESA`], [`BIOMEDICAL_SCHEMA_CONTEXT`],
            [*NIH / UCI / TRISH*], [`MESA`, `SHHS`, `Look AHEAD`, `GTEA`, `PPG-DaLiA`, `TRISH EXPAND`, `JAXA Bisphosphonates`], [`CATALOG_GRAPH_METADATA`],
          )
        ]
      ],
      [
        #ares-card("Three-Column Epistemic Separation (Issue #12)", "AUDIT COMPLIANT", amber-warn)[
          - *1. Recorded Replay:* Terrestrial `BIDMC v1.0.0` `1 Hz` numerics (`SHA-256` verified) with `null` preservation (`BEAT_INTERVALS_NOT_AVAILABLE`).
          - *2. Illustrative Scenario Models:* ADHG ODEs, POCUS observer, `NQS-STL`, and `Timestral` cones remain `ILLUSTRATIVE_UNVALIDATED`.
          - *3. Phase 33 Validation Gate:* Out-of-sample `SubjectDisjointSplit` CQR + Brier/ECE harness required prior to clinical qualification.
        ]
        #v(6pt)
        #ares-card("Immediate Terrestrial Health Spin-Offs", "GALACTIC IMPACT", green-ok)[
          - *Rural & Disaster Offline ICUs:* Zero-cloud `8`-crate telemetry & deterministic triage in connectivity blackouts.
          - *Geriatric & Bedridden Sarcopenia:* Ultrasound soleus `MQI` + `GAI` fall-risk screening.
          - *Polar / Subsea Expeditions:* High-contrast OLED cockpit & contactless nocturnal cardiorespiratory monitoring.
        ]
      ]
    )
  ],
  break-after: false,
)
