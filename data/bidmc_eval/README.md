# BIDMC numerics 04-53: evaluation-only records (`data/bidmc_eval/`)

**Source:** [BIDMC PPG and Respiration Dataset v1.0.0](https://physionet.org/content/bidmc/1.0.0/) (`DOI: 10.13026/C2XW26`), numerics CSV files `bidmc_04` .. `bidmc_53`, retrieved unmodified on 2026-11-14.
**License:** Open Data Commons Attribution License v1.0 (`ODC-By-1.0`). Citations are in `data/bidmc/MANIFEST.json`.

## Purpose and boundary
* Used only by the offline evaluation of the vitals anomaly detector (`cargo run -p ares-server-cli -- --mode eval-anomaly`), which writes `docs/evaluation/ANOMALY_DETECTOR_EVAL.md`.
* Never loaded by the engine at runtime: the live replay still reads `data/bidmc/` only, and nothing here is fetched from the network when the system runs.
* Same evidence boundary as `data/bidmc/`: 8-minute recordings of critically ill terrestrial ICU patients, not astronaut data.

## Split
* Development (parameters were fixed looking at these only): `bidmc_04` .. `bidmc_13`, plus `bidmc_01` and `bidmc_02` from `data/bidmc/`.
* Held-out (evaluated once, after the parameters were frozen): `bidmc_14` .. `bidmc_53`, plus `bidmc_03` from `data/bidmc/`.

## Integrity
`MANIFEST.json` lists the SHA-256 of every file. Verify with `sha256sum data/bidmc_eval/bidmc_*_Numerics.csv`.
