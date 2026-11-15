# Reproducible Telemetry Replay Dataset: PhysioNet BIDMC v1.0.0 (`data/bidmc/`)

**Reference Issue:** [Issue #4 by `@MiServeRDC` (Alessandro)](https://github.com/MiServeRDC/nasa-space-apps-2026/issues/4)  
**Source:** [BIDMC PPG and Respiration Dataset v1.0.0](https://physionet.org/content/bidmc/1.0.0/) (`DOI: 10.13026/C2XW26`)  
**License:** Open Data Commons Attribution License v1.0 (`ODC-By-1.0`)  

---

## 1. Purpose & Evidence Boundary
These three numeric CSV recordings (`bidmc_01_Numerics.csv`, `bidmc_02_Numerics.csv`, `bidmc_03_Numerics.csv`) provide a **deterministic, reproducible, offline-verifiable physiological replay source** for `crates/ares-telemetry-ingest` and `ares-cockpit`.
* **What they validate:** CSV parsing with leading-whitespace header normalization (`" HR"`, `" PULSE"`, `" RESP"`, `" SpO2"`), explicit preservation of missing/NaN sensor values (`13` missing `PULSE` and `SpO2` rows in `bidmc_01` surfaced as `null` / `UNAVAILABLE`), native `1 Hz` sample-rate tracking vs. `20 Hz` UI clock, and deterministic numerical evaluation.
* **What they do NOT claim:** These are 8-minute terrestrial ICU recordings. They are **never** merged into a fictitious longitudinal patient, never falsified as `20 Hz` sensor acquisitions, and never presented as in-flight astronaut validation data. Spaceflight risk rules, What-If scenario inputs, and POCUS/radiation parameters are explicitly tagged in `contracts/telemetry_schema.json` with `"provenance": "SIMULATED_SCENARIO_INPUT"` or `"DERIVED_COMPUTED"`.

## 2. Verifiable Checksums (`MANIFEST.json`)
Run `shasum -a 256 data/bidmc/bidmc_*_Numerics.csv` to verify integrity:
* `bidmc_01_Numerics.csv`: `27d43794cf2e7150db10e8bfe61d2bfdb26873a8f1629ffc5fbee5c9a4eb6ef5` (Development & Missing-Value Handling Test — 481 rows, `0..480 s`, 13 missing `PULSE` and `SpO2` values)
* `bidmc_02_Numerics.csv`: `99aef20b2846815d45ecde184da753de58c8a85b7dd7af74a2f4c5282013704d` (Development Clean Baseline — 481 rows, `0..480 s`, 0 missing values)
* `bidmc_03_Numerics.csv`: `6666475c072fe079f35f1fffe0890a97b56d1086985f8a5d76a23b88eb6c6036` (Held-Out Evaluation Record — 481 rows, `0..480 s`, 0 missing values)


## HRV input limitation (issue #11)

The bundled numeric CSVs have no beat-to-beat intervals. RMSSD, SDNN, pNN50 and LF/HF are unavailable, including when the numeric quality score is high. They must not be synthesized from HR/respiration or held at a nominal default. The Rust overlay emits nulls, records their missing names and reports `BEAT_INTERVALS_NOT_AVAILABLE`.

The full HRV-dependent MRI, global margin and TTV/bands are also unavailable. Known non-HRV violations remain visible; an incomplete assessment is not nominal. Tests with explicitly supplied synthetic HRV values test software behavior only. No waveform/beat-interval processing is added by this correction.

See [issue #11 implementation plan](../../docs/plans/ISSUE_11_HRV_VALIDITY_PLAN.md). Future integrations must repeat the null-propagation tests, including server/MCP and cockpit handling. The current main includes an executable cockpit; see docs/submission/JUDGES_START_HERE.md for the verified replay workflow.
