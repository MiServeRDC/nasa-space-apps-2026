ARES-Health is globally competitive at the NASA Space Apps Challenge 2026 and should be submitted and pitched exactly as it currently stands.

## What the project is

ARES-Health (Autonomous Resilient Edge-native System for Astronaut Health) is a software entry for the NASA Space Apps Challenge 2026, track "Create Health Monitoring Software for Astronauts on Space Missions." The challenge asks teams to build software that lets deep-space astronauts GATHER health indicators, EVALUATE their health status, and ACT on it autonomously, because on Mars-transit missions a round-trip radio delay of 8 to 48 minutes (and blackouts up to 2 weeks during solar conjunction) makes Earth-based telemedicine impossible.

The project's thesis: any entry relying on cloud servers or internet LLMs is physically invalid for deep space, so ARES-Health is 100% offline, air-gapped, zero-cloud, and runs on the edge.

## What is actually built (per the project's own documentation)

- A workspace of 8 Safe Rust crates (Rust 2024) plus a React 19 / TypeScript 5.7 / Tailwind 4 / Three.js cockpit UI ("ares-cockpit"), dual-licensed MIT OR Apache-2.0.
- Claimed engineering discipline: 0 `.unwrap()`/`.expect()` in production code, 0 Clippy warnings, 126/126 tests passing across 28 suites on `main`.
- GATHER: deterministic replay of real PhysioNet BIDMC v1.0.0 recordings at 1 Hz, SHA-256 verified, with missing samples preserved as null (never imputed). Pure-Rust DSP: an I/Q radar demodulator for contactless vitals, a voice-acoustic extractor (F0/jitter/shimmer), and a Pan-Tompkins R-R extractor.
- EVALUATE: a multi-organ causal graph (ADHG) with scenario ODEs (bone/muscle sclerostin via RK4, jugular shear-stress in dimensionally-exact CGS units, a 2-stage Bayesian POCUS observer), plus a pure-Rust time-series forecaster ("Timestral") with a monotone quantile head and a conformal abstention gate. Performance: full 1-tick pipeline p50 = 2.12 microseconds; lock-free telemetry ring read p50 = 42 ns.
- ACT: 5 crystallized clinical "playbooks" (e.g., venous-stasis LBNP protocol, confirmed-thrombus anticoagulation) executing in under 20 microseconds with no LLM in the critical loop, plus 3 hard clinical safety gates (e.g., anticoagulation locked unless a thrombus is confirmed).
- Security/privacy: 3 confidentiality roles, a SHA-256 audit hash chain, ChaCha20-Poly1305 encryption, and a prompt-injection sanitizer shield.
- An offline edge-LLM copilot that is read-only/advisory only; no ODE or safety gate is delegated to a generative model. A Tauri v2 native desktop shell ("ARES-MedOS").
- 24 catalogued NASA / ESA / CSA / PhysioNet datasets in a unified knowledge graph (110 nodes, 326 Biolink edges).

## The honest caveats the project states about itself

Every major project document carries this banner: the scenario-derived physiology, risk/readiness scores and forecast ranges are "illustrative and clinically unvalidated." Historical calibration, certification, universal-threshold and outcome claims are explicitly "not established." Only the recorded terrestrial BIDMC measurements are treated as real data; the physiological and predictive models are labelled ILLUSTRATIVE_UNVALIDATED and require subject-disjoint calibration before any stronger claim. HRV (rmssd_ms) is left null on 1 Hz data because beat intervals are not available in that source.

## The team and the rules

- Team of up to 6 (listed: a lead architect who is an M.Sc. computer-engineering student at the University of Bologna, plus four others). NASA recommends multidisciplinary teams (systems, frontend, 3D/HSI, biomedical data science, and a clinical storyteller/pitch producer) for global nomination.
- "Fresh Code" rule: ALL submitted application code must be original and written during the hackathon weekend (48 hours). Pre-existing open-source libraries and public datasets are allowed if cited; architecture specs and formulas prepared beforehand are allowed only as planning documents. Proprietary or pre-built codebases must not be imported.
- AI tools (Claude Code, Codex, Copilot, etc.) are permitted but their use must be disclosed, and the core reasoning must be understood and verified by the team.

## How it will be judged

Local judges score 1-5 on five equally weighted (20% each) criteria: Impact, Creativity/Innovation, Validity/Scientific Soundness, Relevance (full Gather-Evaluate-Act coverage + NASA open data), and Presentation/Storytelling. Only projects that win a Global Nomination from local judges advance to the NASA Executive Judging Committee for 10 Global Awards (e.g., Best Use of Technology, Best Use of Science, Best Mission Concept). The scale is global: tens of thousands of participants across hundreds of local events worldwide; a tiny fraction reach global judging.

Required deliverables: a public project page, a public open-source repo, a list of NASA data used, and EITHER a strictly 30-second video pitch (with English subtitles) OR a maximum 7-slide English deck. The demo must fit those hard limits.

## The specific claim on trial

That ARES-Health, as it stands, is competitive for a Global Nomination (and plausibly a Global Award in Best Use of Technology / Science / Mission Concept) at NASA Space Apps 2026, and should be submitted and pitched as-is.

## Context the jury should weigh

- Tension between the enormous built scope (8 Rust crates, native OS shell, custom forecaster, DSP, knowledge graph) and the "Fresh Code" 48-hour-original-work rule: the record does not state how much was written inside the official window versus before it.
- Tension between technical depth and the presentation limits: the entire story must land in a 30-second video or 7 slides, and judges are subject-matter experts scoring on five axes, only one of which (Validity) rewards engineering rigor directly.
- The project's own repeated disclosure that its clinical models are unvalidated, against a challenge whose purpose is astronaut health decisions.
- Whether judges reward a system that looks production-grade ("ARES-MedOS", microsecond latencies, audit chains) or whether that reads as scope that cannot be demonstrated or verified in a short pitch.
