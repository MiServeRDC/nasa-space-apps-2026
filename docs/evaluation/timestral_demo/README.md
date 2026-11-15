# Timestral-5M on ARES-Health telemetry (standalone proof artifact)

Real, pretrained **Mistral Timestral-5M** (zero-shot time-series foundation model)
forecasting the same BIDMC astronaut-analog vitals the ARES engine replays, **fully
offline**. This is a deliberately **standalone** artifact: it does **not** run inside the
air-gapped Rust engine or the cockpit, so it carries zero risk to the live demo.

## Why standalone (and not integrated)
Inspection of the official weights showed Mistral's released architecture does **not** map
1:1 onto the ARES bespoke Rust backbone (learned patch embedding, fused QKV, no bias terms,
different quantile head). A faithful in-engine port is a multi-day effort and was out of
scope before the deadline. The in-engine forecaster therefore remains the honest grey-box
skeleton that **fail-closes to `IllustrativeUnvalidated`** rather than fabricate metrics
(NASA-STD-3001 posture). This script demonstrates the pretrained alternative (the planned
loopback-sidecar path) as a separate, verifiable proof.

## Result (context 400 s -> horizon 80 s on `bidmc_01`, scored vs held-out truth)

| Channel | Median MAE | 90% empirical coverage | Naive persistence MAE |
| :------ | ---------: | ---------------------: | --------------------: |
| HR      | 0.47 bpm   | 94%                    | 0.75 |
| PULSE   | 0.98 bpm   | 71%                    | 0.41 |
| RESP    | 0.34 brpm  | 89%                    | 0.28 |
| SpO2    | 0.11 %     | 100%                   | 0.11 |

Zero-shot, no fine-tuning on BIDMC. HR and SpO2 track well with near-nominal coverage;
PULSE coverage (71%) is below the nominal 90% and is reported honestly, not hidden.

Outputs: `timestral_bidmc_forecast.png` (figure) and `timestral_bidmc_forecast.json`
(per-channel cones + ground truth + metrics).

## Reproduce (offline after a one-time weight download, ~21 MB)
```bash
# Timestral needs torch >= 2.4 and Python >= 3.10 (system Python 3.15 has no torch wheel yet).
uv venv --python 3.12 .tsvenv
uv pip install --python .tsvenv/bin/python torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .tsvenv/bin/python numpy matplotlib safetensors huggingface_hub \
    "git+https://github.com/mistralai/timestral.git"

.tsvenv/bin/python tools/timestral_bidmc_forecast.py \
    --csv data/bidmc/bidmc_01_Numerics.csv --context 400 --horizon 80 \
    --out docs/evaluation/timestral_demo
```

Weights: `mistralai/Timestral-5M`, Modified MIT license (weights) + Apache 2.0 (code).
Downloaded once to the Hugging Face cache; `HF_HUB_OFFLINE=1` then runs with no network.
