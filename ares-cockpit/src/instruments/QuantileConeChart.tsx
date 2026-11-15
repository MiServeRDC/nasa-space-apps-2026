// Multi-horizon non-crossing quantile fan chart (`QuantileConeChart`).
// Enforces `q05(h) <= q50(h) <= q95(h)` monotonicity across EWMA short-horizon (`+5s..+120s`)
// and Timestral long-horizon (`+15m..+24h`) trajectories, renders the `y = 0` NQS-STL boundary,
// optional counterfactual Empirical Baseline Ghost curve, `ConformalAbstentionGate` certificate,
// and mandatory `ILLUSTRATIVE_SCENARIO_RANGE` epistemic framing (Issue #12).

import React, { useId, useMemo } from 'react';
import type {
  AbstentionCertificate,
  ChannelQuantileCone,
  ConformalGateStatus,
  ShortHorizonCone,
  TimestralQuantilesSummary,
} from '../types/telemetry';
import {
  normalizeConformalGateStatus,
  parseMonotoneQuantileTriplet,
} from '../lib/telemetryValidation';
import {
  buildNormalizedQuantileFan,
  snapHalfPixel,
  type HorizonQuantileInputPoint,
} from './instrumentMath';

export interface QuantileConeChartProps {
  title?: string;
  channelId?: string;
  unit?: string;
  points?: readonly HorizonQuantileInputPoint[];
  timestralSummary?: TimestralQuantilesSummary | null;
  safetyThreshold?: number | null;
  currentRho?: number | null;
  empiricalBaselineRho?: number | null;
  isSimulatedOverlay?: boolean;
  certificate?: AbstentionCertificate | null;
  gateStatus?: ConformalGateStatus | 'WARMING_UP_60S_120S';
  ttvIntervalKind?: string | null;
  className?: string;
}

function formatHorizonLabel(sec: number): string {
  if (sec <= 0) return 'NOW';
  if (sec < 60) return `+${Math.round(sec)}s`;
  if (sec < 3600) return `+${Math.round(sec / 60)}m`;
  return `+${Math.round(sec / 3600)}h`;
}

function extractPointsFromSummary(
  summary: TimestralQuantilesSummary | null | undefined,
  channelId: string,
  currentRho: number | null | undefined,
  empiricalBaselineRho: number | null | undefined,
  isSimulatedOverlay: boolean,
): HorizonQuantileInputPoint[] {
  const merged = new Map<number, HorizonQuantileInputPoint>();

  if (summary) {
    const shortCone: ShortHorizonCone | undefined =
      summary.short_horizon_cones?.find((c) => c.channel_name === channelId) ??
      summary.short_horizon_cones?.[0];

    if (shortCone) {
      const shortEntries: ReadonlyArray<[number, unknown]> = [
        [5, shortCone.horizon_5s],
        [10, shortCone.horizon_10s],
        [30, shortCone.horizon_30s],
        [60, shortCone.horizon_60s],
        [120, shortCone.horizon_120s],
      ];
      for (const [sec, raw] of shortEntries) {
        const valid = parseMonotoneQuantileTriplet(raw);
        if (valid) {
          merged.set(sec, {
            horizonSec: sec,
            label: formatHorizonLabel(sec),
            q05: valid.q05,
            q50: valid.q50,
            q95: valid.q95,
          });
        }
      }
    }

    const longCone: ChannelQuantileCone | undefined =
      summary.channel_cones?.find((c) => c.channel_name === channelId) ??
      summary.channel_cones?.[0];

    if (longCone) {
      const longEntries: ReadonlyArray<[number, unknown]> = [
        [900, longCone.horizon_15m],
        [3600, longCone.horizon_1h],
        [21600, longCone.horizon_6h],
        [86400, longCone.horizon_24h],
      ];
      for (const [sec, raw] of longEntries) {
        const valid = parseMonotoneQuantileTriplet(raw);
        if (valid) {
          merged.set(sec, {
            horizonSec: sec,
            label: formatHorizonLabel(sec),
            q05: valid.q05,
            q50: valid.q50,
            q95: valid.q95,
          });
        }
      }
    }
  }

  if (merged.size > 0) {
    const list = Array.from(merged.values()).sort((a, b) => a.horizonSec - b.horizonSec);
    if (isSimulatedOverlay && typeof empiricalBaselineRho === 'number' && Number.isFinite(empiricalBaselineRho)) {
      return list.map((pt, idx) => ({
        ...pt,
        empiricalGhostQ50: empiricalBaselineRho - idx * 0.015,
      }));
    }
    return list;
  }

  // Deterministic cold-start / scenario envelope when engine stream is warming up
  const anchor = typeof currentRho === 'number' && Number.isFinite(currentRho) ? currentRho : 0.42;
  const ghostAnchor =
    isSimulatedOverlay && typeof empiricalBaselineRho === 'number' && Number.isFinite(empiricalBaselineRho)
      ? empiricalBaselineRho
      : null;

  const fallbackHorizons = [0, 30, 120, 900, 3600, 21600, 86400];
  return fallbackHorizons.map((sec, idx) => {
    const spread = 0.03 + idx * 0.035;
    const drift = -idx * 0.028;
    const med = anchor + drift;
    return {
      horizonSec: sec,
      label: formatHorizonLabel(sec),
      q05: med - spread,
      q50: med,
      q95: med + spread * 0.9,
      empiricalGhostQ50: ghostAnchor !== null ? ghostAnchor - idx * 0.014 : null,
    };
  });
}

export function QuantileConeChart({
  title = 'Hybrid EWMA + Timestral Quantile Forecast',
  channelId = 'rho_global',
  unit = 'rho',
  points,
  timestralSummary = null,
  safetyThreshold = 0,
  currentRho = null,
  empiricalBaselineRho = null,
  isSimulatedOverlay = false,
  certificate,
  gateStatus,
  ttvIntervalKind = 'ILLUSTRATIVE_SCENARIO_RANGE',
  className = '',
}: QuantileConeChartProps) {
  const uid = useId().replace(/:/g, '');
  const fanGradId = `ares-cone-grad-${uid}`;
  const abstainHatchId = `ares-cone-abstain-${uid}`;

  const effectiveCert = certificate ?? timestralSummary?.abstention_certificate ?? null;
  const effectiveStatus =
    gateStatus ??
    timestralSummary?.confidence_state ??
    normalizeConformalGateStatus(timestralSummary?.conformal_status) ??
    effectiveCert?.status ??
    (timestralSummary ? 'HEURISTIC_GATE_ACCEPTED' : 'WARMING_UP_60S_120S');

  const resolvedPoints = useMemo(
    () =>
      points && points.length > 0
        ? points
        : extractPointsFromSummary(
            timestralSummary,
            channelId,
            currentRho,
            empiricalBaselineRho,
            isSimulatedOverlay,
          ),
    [channelId, currentRho, empiricalBaselineRho, isSimulatedOverlay, points, timestralSummary],
  );

  const model = useMemo(
    () =>
      buildNormalizedQuantileFan(resolvedPoints, {
        safetyThreshold,
        certificate: effectiveCert,
        gateStatus: effectiveStatus,
      }),
    [effectiveCert, effectiveStatus, resolvedPoints, safetyThreshold],
  );

  const svgW = 420;
  const svgH = 148;
  const padL = 38;
  const padR = 14;
  const padT = 12;
  const padB = 24;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const toX = (xi: number) => padL + xi * plotW;
  const toY = (yRatio: number) => padT + yRatio * plotH;

  const polygonPoints = useMemo(() => {
    if (model.vertices.length < 2) return '';
    const upper = model.vertices.map((v) => `${toX(v.xi).toFixed(1)},${toY(v.y95Ratio).toFixed(1)}`);
    const lower = [...model.vertices]
      .reverse()
      .map((v) => `${toX(v.xi).toFixed(1)},${toY(v.y05Ratio).toFixed(1)}`);
    return [...upper, ...lower].join(' ');
  }, [model.vertices]);

  const medianPolyline = useMemo(
    () =>
      model.vertices
        .map((v) => `${toX(v.xi).toFixed(1)},${toY(v.y50Ratio).toFixed(1)}`)
        .join(' '),
    [model.vertices],
  );

  const ghostPolyline = useMemo(() => {
    const valid = model.vertices.filter((v) => v.ghostY50Ratio !== null);
    if (valid.length < 2) return '';
    return valid
      .map((v) => `${toX(v.xi).toFixed(1)},${toY(v.ghostY50Ratio ?? 0.5).toFixed(1)}`)
      .join(' ');
  }, [model.vertices]);

  const gateBadgeClass = model.abstained
    ? 'border-amber-400/50 bg-amber-500/10 text-amber-300'
    : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300';

  return (
    <div
      className={`ares-inner-well p-3 ${className}`.trim()}
      data-conformal-gate={model.gateStatus}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div>
          <div className="font-sans text-xs font-semibold tracking-tight text-[var(--color-ink-display)]">
            {title}
          </div>
          <div className="font-mono text-[10px] text-[var(--color-ink-meta)]">
            CHANNEL: {channelId.toUpperCase()} ({unit}) | MONOTONE q05 &lt;= q50 &lt;= q95
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <span className={`rounded border px-1.5 py-0.5 ${gateBadgeClass}`}>
            {model.gateStatus}
          </span>
          <span className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
            {ttvIntervalKind ?? 'ILLUSTRATIVE_SCENARIO_RANGE'}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="h-36 w-full overflow-visible select-none"
        role="img"
        aria-label={`${title} non-crossing quantile fan chart with conformal gate status ${model.gateStatus}`}
      >
        <defs>
          <linearGradient id={fanGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
            <stop offset="65%" stopColor="#22d3ee" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.06" />
          </linearGradient>
          <pattern
            id={abstainHatchId}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="rgba(245, 158, 11, 0.06)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(245, 158, 11, 0.28)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Plot frame & horizontal reference ticks */}
        {[0, 0.5, 1].map((frac) => {
          const y = snapHalfPixel(padT + frac * plotH);
          const val = model.yMax - frac * (model.yMax - model.yMin);
          return (
            <g key={frac}>
              <line
                x1={padL}
                y1={y}
                x2={svgW - padR}
                y2={y}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={padL - 5}
                y={y + 3}
                textAnchor="end"
                className="fill-[var(--color-ink-muted)] font-mono text-[9px]"
              >
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Safety violation threshold line (rho = 0) */}
        {model.safetyThresholdYRatio !== null ? (
          <g>
            <line
              x1={padL}
              y1={snapHalfPixel(toY(model.safetyThresholdYRatio))}
              x2={svgW - padR}
              y2={snapHalfPixel(toY(model.safetyThresholdYRatio))}
              stroke="rgba(244, 63, 94, 0.72)"
              strokeDasharray="4 3"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={svgW - padR - 2}
              y={toY(model.safetyThresholdYRatio) - 4}
              textAnchor="end"
              className="fill-rose-400 font-mono text-[9px]"
            >
              LIMIT ({safetyThreshold?.toFixed(2) ?? '0.00'})
            </text>
          </g>
        ) : null}

        {/* Quantile fan [q05, q95] */}
        {polygonPoints ? (
          <polygon
            points={polygonPoints}
            fill={model.abstained ? `url(#${abstainHatchId})` : `url(#${fanGradId})`}
            stroke={model.abstained ? 'rgba(245, 158, 11, 0.36)' : 'rgba(34, 211, 238, 0.32)'}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Empirical Baseline Ghost trajectory during What-If counterfactual overlay */}
        {ghostPolyline ? (
          <polyline
            points={ghostPolyline}
            fill="none"
            stroke="rgba(16, 185, 129, 0.65)"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Median trajectory q50(h) */}
        {medianPolyline ? (
          <polyline
            points={medianPolyline}
            fill="none"
            stroke={model.abstained ? '#f59e0b' : '#22d3ee'}
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Horizon anchor nodes & X-axis labels */}
        {model.vertices.map((v, idx) => {
          const cx = toX(v.xi);
          const cy = toY(v.y50Ratio);
          const showLabel =
            idx === 0 ||
            idx === model.vertices.length - 1 ||
            v.horizonSec === 120 ||
            v.horizonSec === 900 ||
            v.horizonSec === 3600 ||
            v.horizonSec === 21600;
          return (
            <g key={`${v.horizonSec}-${idx}`}>
              <circle
                cx={cx}
                cy={cy}
                r="2.3"
                fill={model.abstained ? '#f59e0b' : '#22d3ee'}
              />
              {showLabel ? (
                <text
                  x={cx}
                  y={svgH - 6}
                  textAnchor="middle"
                  className="fill-[var(--color-ink-meta)] font-mono text-[9px]"
                >
                  {v.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 border-t border-white/5 pt-1.5 font-mono text-[10px] text-[var(--color-ink-meta)]">
        <span>{model.certificateSummary}</span>
        {ghostPolyline ? (
          <span className="text-emerald-300">DASHED: EMPIRICAL BASELINE GHOST</span>
        ) : null}
      </div>
    </div>
  );
}
