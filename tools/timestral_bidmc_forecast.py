#!/usr/bin/env python3
"""
ARES-Health demo: real Mistral Timestral-5M (pretrained foundation model) forecasting
the BIDMC astronaut-analog vitals the ARES engine replays, fully offline.

This is a STANDALONE proof artifact, intentionally separate from the air-gapped Rust
engine: it demonstrates that a real pretrained time-series foundation model produces
21-quantile probabilistic cones on our own telemetry channels. It does NOT run inside
the ARES hot path.

Honest framing: the ARES in-engine forecaster remains a deterministic grey-box skeleton
that fail-closes to IllustrativeUnvalidated. This script shows the pretrained alternative
(option B / Timestral sidecar), scored against held-out ground truth from the same record.

Run (inside the prepared venv with torch + timestral installed):
    python tools/timestral_bidmc_forecast.py \
        --csv data/bidmc/bidmc_01_Numerics.csv \
        --context 400 --horizon 80 \
        --out docs/evaluation/timestral_demo
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

# Channels as named in BIDMC *_Numerics.csv (after "Time [s]").
CHANNELS = ["HR", "PULSE", "RESP", "SpO2"]
CHANNEL_UNITS = {"HR": "bpm", "PULSE": "bpm", "RESP": "brpm", "SpO2": "%"}


def read_bidmc(csv_path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Return (time_s[T], values[C, T]) for the 4 numeric channels."""
    header = csv_path.read_text(encoding="utf-8").splitlines()[0]
    cols = [c.strip() for c in header.split(",")]
    raw = np.genfromtxt(csv_path, delimiter=",", skip_header=1, dtype=float)
    time_s = raw[:, cols.index("Time [s]")]
    values = np.vstack([raw[:, cols.index(ch)] for ch in CHANNELS])  # (C, T)
    return time_s, values


def nearest_level_index(levels: np.ndarray, target: float) -> int:
    return int(np.argmin(np.abs(np.asarray(levels, dtype=float) - target)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, required=True)
    ap.add_argument("--model", default="mistralai/Timestral-5M")
    ap.add_argument("--context", type=int, default=400, help="context length in samples")
    ap.add_argument("--horizon", type=int, default=80, help="forecast horizon in samples")
    ap.add_argument("--out", type=Path, default=Path("docs/evaluation/timestral_demo"))
    args = ap.parse_args()

    # Imported here so --help works even before torch/timestral are installed.
    import torch  # noqa: F401
    from timestral import TimestralForecaster

    args.out.mkdir(parents=True, exist_ok=True)

    time_s, values = read_bidmc(args.csv)
    total = values.shape[1]
    ctx_len = min(args.context, total - args.horizon)
    if ctx_len <= 0:
        raise SystemExit(f"record too short: T={total}, need context+horizon")
    hz_len = args.horizon

    context = values[:, :ctx_len]                       # (C, ctx)
    truth = values[:, ctx_len:ctx_len + hz_len]         # (C, hz) held-out ground truth
    ctx_time = time_s[:ctx_len]
    hz_time = time_s[ctx_len:ctx_len + hz_len]

    # Timestral expects (B, V, T); forecast the 4 variates jointly for one series.
    model_in = context[np.newaxis, :, :]                # (1, C, ctx)

    forecaster = TimestralForecaster.from_pretrained(args.model)
    forecast = forecaster.forecast(model_in, prediction_length=hz_len)

    quantiles = np.asarray(forecast.quantiles)          # (1, C, hz, 21)
    levels = np.asarray(forecast.quantile_levels, dtype=float)
    i05 = nearest_level_index(levels, 0.05)
    i50 = nearest_level_index(levels, 0.50)
    i95 = nearest_level_index(levels, 0.95)

    # Per-channel cones + simple honest skill metrics vs held-out truth.
    report: dict = {
        "model": args.model,
        "source_record": args.csv.name,
        "context_samples": int(ctx_len),
        "horizon_samples": int(hz_len),
        "quantile_levels": levels.tolist(),
        "channels": {},
    }
    for ci, ch in enumerate(CHANNELS):
        q05 = quantiles[0, ci, :, i05]
        q50 = quantiles[0, ci, :, i50]
        q95 = quantiles[0, ci, :, i95]
        y = truth[ci]
        mae = float(np.nanmean(np.abs(q50 - y)))
        # Empirical coverage of the nominal 90% central interval.
        inside = np.logical_and(y >= np.minimum(q05, q95), y <= np.maximum(q05, q95))
        coverage = float(np.nanmean(inside.astype(float)))
        # Naive persistence baseline MAE (last observed value carried forward).
        persistence = float(np.nanmean(np.abs(context[ci, -1] - y)))
        report["channels"][ch] = {
            "unit": CHANNEL_UNITS[ch],
            "horizon_time_s": hz_time.tolist(),
            "q05": q05.tolist(),
            "q50_median": q50.tolist(),
            "q95": q95.tolist(),
            "ground_truth": y.tolist(),
            "median_mae": mae,
            "persistence_mae": persistence,
            "central90_empirical_coverage": coverage,
        }

    json_path = args.out / "timestral_bidmc_forecast.json"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Figure: 2x2, context + forecast cone + held-out truth per channel.
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(2, 2, figsize=(13, 8))
    fig.suptitle(
        f"Mistral Timestral-5M (pretrained, zero-shot) forecast on {args.csv.name}\n"
        f"context {ctx_len}s -> horizon {hz_len}s, 90% cone vs held-out ground truth",
        fontsize=12,
    )
    for ci, (ch, ax) in enumerate(zip(CHANNELS, axes.ravel())):
        c = report["channels"][ch]
        ax.plot(ctx_time, context[ci], color="#334155", lw=1.0, label="context (replayed)")
        ax.fill_between(hz_time, c["q05"], c["q95"], color="#2563eb", alpha=0.20,
                        label="Timestral 90% cone")
        ax.plot(hz_time, c["q50_median"], color="#2563eb", lw=1.6, label="Timestral median")
        ax.plot(hz_time, c["ground_truth"], color="#dc2626", lw=1.2, ls="--",
                label="held-out truth")
        ax.axvline(ctx_time[-1], color="#94a3b8", lw=0.8, ls=":")
        ax.set_title(f"{ch} ({c['unit']})  MAE={c['median_mae']:.2f}  "
                     f"cov90={c['central90_empirical_coverage']*100:.0f}%", fontsize=10)
        ax.set_xlabel("recording time (s)")
        if ci == 0:
            ax.legend(fontsize=7, loc="best")
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    png_path = args.out / "timestral_bidmc_forecast.png"
    fig.savefig(png_path, dpi=130)

    print(f"OK wrote {json_path}")
    print(f"OK wrote {png_path}")
    for ch in CHANNELS:
        c = report["channels"][ch]
        print(f"  {ch:5s} median_MAE={c['median_mae']:.2f} {c['unit']}  "
              f"persistence_MAE={c['persistence_mae']:.2f}  "
              f"cov90={c['central90_empirical_coverage']*100:.0f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
