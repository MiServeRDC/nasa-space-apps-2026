# ARES-MedOS Phase 33 (L5) Calibration & Anti-Leakage Audit

- **Verify Only Mode**: `true`
- **BIDMC SHA-256 Verified Files**: `3`
- **Timestral Model ID**: `timestral-dhf-v1` (`DeterministicStub { seed_hex: "0xA8E5_2026_0117_0015", fallback_reason: "no checkpoint directory configured; deterministic initialization active" }`)
- **Anti-Leakage L1-L4 Verified**: `true`
- **SOST RK4 Sensitivity Invariant**: `const_load_diff=0.000011 pmol/L step_change_diff=43.740162 pmol/L dt=0.2500 d`
- **Bayesian POCUS Empty Gap `(0.45, 0.92)` Holds**: `true` (`grid_samples=648`)
- **Resolved Model Validation Status**: `IllustrativeUnvalidated`

## Parquet / Cohort Adapters

- `biocypher_bidmc_parquet_v1`: `BundledAndVerified { files_verified: 3, manifest_sha256_verified: true }`
- `biocypher_physionet_waveforms_v1`: `ExternalDatasetNotBundled { dataset_code: "PHYSIONET_WAVEFORMS", expected_dir: "data/external_cohorts_absent/physionet" }`
- `biocypher_nasa_osdr_omics_v1`: `ExternalDatasetNotBundled { dataset_code: "NASA_OSDR_OMICS", expected_dir: "data/external_cohorts_absent/nasa_osdr" }`
- `biocypher_dlr_hdbr_v1`: `ExternalDatasetNotBundled { dataset_code: "DLR_ENVIHAB_HDBR", expected_dir: "data/external_cohorts_absent/dlr_hdbr" }`

## Horizon Evaluation Cells

- `15 s` (hr_bpm / ZeroPct): `Evaluated` (winkler_a10=Some(14.920374707259924))
- `15 s` (hr_bpm / OneToFifteenPct): `CalibrationSampleInsufficient { n_cal: 5, min_required: 9 }` (winkler_a10=None)
- `30 s` (hr_bpm / ZeroPct): `Evaluated` (winkler_a10=Some(4.065573770491795))
- `30 s` (hr_bpm / OneToFifteenPct): `CalibrationSampleInsufficient { n_cal: 3, min_required: 9 }` (winkler_a10=None)
- `60 s` (hr_bpm / ZeroPct): `CalibrationSampleInsufficient { n_cal: 5, min_required: 9 }` (winkler_a10=None)
- `60 s` (hr_bpm / OneToFifteenPct): `CalibrationSampleInsufficient { n_cal: 2, min_required: 9 }` (winkler_a10=None)
- `120 s` (hr_bpm / ZeroPct): `CalibrationSampleInsufficient { n_cal: 2, min_required: 9 }` (winkler_a10=None)
- `120 s` (hr_bpm / OneToFifteenPct): `CalibrationSampleInsufficient { n_cal: 1, min_required: 9 }` (winkler_a10=None)
- `900 s` (all_channels / ZeroPct): `InsufficientRecordingDuration { max_recording_span_s: 480.0, required_horizon_s: 900 }` (winkler_a10=None)
- `3600 s` (all_channels / ZeroPct): `InsufficientRecordingDuration { max_recording_span_s: 480.0, required_horizon_s: 3600 }` (winkler_a10=None)
- `21600 s` (all_channels / ZeroPct): `InsufficientRecordingDuration { max_recording_span_s: 480.0, required_horizon_s: 21600 }` (winkler_a10=None)
- `86400 s` (all_channels / ZeroPct): `InsufficientRecordingDuration { max_recording_span_s: 480.0, required_horizon_s: 86400 }` (winkler_a10=None)
