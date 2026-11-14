---
name: telemetry-replay-verifier
description: Enforces reproducible PhysioNet BIDMC v1.0.0 telemetry ingestion, leading-whitespace CSV parsing, explicit null/missing-value preservation, provenance tagging, and Hard Clinical Safety Gate verification (Issue #4 compliance).
triggers:
  - bidmc dataset replay
  - telemetry ingestion
  - missing values null
  - provenance manifest
  - verify safety gates
  - telemetry_schema.json
---

# Telemetry Replay & Provenance Verifier (`Issue #4` & `crates/ares-telemetry-ingest`)

This skill enforces the scientific honesty, reproducibility, and data-provenance rules established in [GitHub Issue #4](https://github.com/MiServeRDC/nasa-space-apps-2026/issues/4) across `crates/ares-telemetry-ingest`, `contracts/telemetry_schema.json`, and `ares-cockpit`.

## 1. Reproducible BIDMC v1.0.0 Ingestion Rules (`data/bidmc/`)
1. **Verified Local Subset:** Use `data/bidmc/bidmc_01_Numerics.csv` (development + missing-value test), `bidmc_02_Numerics.csv` (clean development baseline), and `bidmc_03_Numerics.csv` (held-out evaluation), verifying SHA-256 checksums against `data/bidmc/MANIFEST.json`.
2. **Header Whitespace Trimming:** Raw BIDMC CSV headers are `Time [s]`, ` HR`, ` PULSE`, ` RESP`, ` SpO2` (columns 2-5 have a leading space). The CSV parser MUST trim leading/trailing whitespace on both headers and cell values.
3. **Never Fabricate Missing Values:** `bidmc_01_Numerics.csv` contains 13 rows with `NaN`/missing `PULSE` and `SpO2` values. The parser MUST serialize these as JSON `null` and populate `biometrics.missing_channels: ["pulse_rate_bpm", "spo2_percent"]` (setting `alarm_level = "DATA_DEGRADED_MISSING_CHANNELS"` when appropriate). **Never replace missing values with `0.0` or fabricated healthy readings.**
4. **Preserve Relative Time & Native Sample Rate:**
   - Map `Time [s]` (`0..480`) to `relative_recording_time_s`. Never invent a fake original clinical Unix timestamp.
   - Set `provenance_manifest.biometrics_native_rate_hz = 1.0`. Even if the UI refreshes at `20.0 Hz`, never misrepresent `1.0 Hz` numeric rows as `20.0 Hz` sensor acquisitions.
   - Never concatenate unrelated 8-minute ICU patients (`bidmc_01`, `02`, `03`) into a fictitious 180-day astronaut.

## 2. Explicit Separation of Recorded, Derived & Simulated Data
Every `ARESHealthTelemetryPacket` must distinguish:
- **`RECORDED_TERRESTRIAL_BIDMC_CSV`:** `heart_rate_bpm`, `pulse_rate_bpm`, `respiration_rate_brpm`, `spo2_percent` from `data/bidmc/`.
- **`SIMULATED_SCENARIO_INPUT`:** Optional What-If Console inputs (`ijv_csa_cm2`, `ijv_velocity_max_cm_s`, `soleus_thickness_mm`, `cabin_co2_ppm`, `ambient_radiation_rate_ugy_h`). In pure BIDMC replay mode (`scenario_overlay_mode == "NONE_PURE_REPLAY"`), `hemodynamics`, `musculoskeletal`, and `environment` are `null`.
- **`DERIVED_COMPUTED`:** Deterministic mathematical outputs ($\tau_w(t) = 2\mu v_{\max}\sqrt{\pi/\text{IJV\_CSA}}$, Frost-Hargens `SOST` ODE, `NQS-STL` $\hat{\rho}_k \in (-\infty, +1.0]$, and `Mission Readiness Index`).
