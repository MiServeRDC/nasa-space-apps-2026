import { CockpitSummary } from '../ui-primitives/CockpitControls';
import { displayLabel } from '../../lib/displayLabel';
import { useEffect, useMemo, useState } from 'react';
import { evaluate, type WhatIf } from '../../lib/scenario';
import {
  computeLogHorizonXi,
  formatTimeToViolation,
  parseMonotoneQuantileTriplet,
} from '../../lib/telemetryValidation';
import type {
  MonotoneQuantileTriplet,
  SafetyMargins,
  TelemetryPacket,
  TimestralQuantilesSummary,
} from '../../types/telemetry';

function riskColor(v: number): string {
  if (v < 0) return '#f43f5e';
  if (v < 0.2) return '#fb923c';
  if (v < 0.4) return '#facc15';
  return '#22d3ee';
}

export function MriGauge({
  safety,
  qualityFlags = [],
}: {
  safety: SafetyMargins;
  qualityFlags?: string[];
}) {
  const mri = safety.mission_readiness_index;
  const hasMri = typeof mri === 'number' && Number.isFinite(mri);
  const v = hasMri ? mri : 0;
  const r = 52;
  const full = 2 * Math.PI * r;
  const arc = full * 0.75;
  const color = !hasMri ? '#6b7280' : v >= 70 ? '#22d3ee' : v >= 50 ? '#facc15' : '#f43f5e';
  const ariaLabel = hasMri ? `Mission readiness ${Math.round(v)}` : 'Mission readiness unavailable';

  const ttvFmt = formatTimeToViolation(safety, qualityFlags);
  const ttvRaw = safety.ttv_most_likely_days ?? safety.time_to_violation_days;
  const ttvColor =
    ttvFmt.state === 'UNAVAILABLE'
      ? 'text-advisory'
      : ttvFmt.state === 'NO_CROSSING_IN_HORIZON'
        ? 'text-ok'
        : typeof ttvRaw === 'number' && ttvRaw < 14
          ? 'text-critical'
          : 'text-advisory';

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 128 128" className="h-28 w-28 shrink-0" role="img" aria-label={ariaLabel}>
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="#1f2937"
          strokeWidth="10"
          strokeDasharray={`${arc} ${full}`}
          transform="rotate(135 64 64)"
          strokeLinecap="round"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${(arc * v) / 100} ${full}`}
          transform="rotate(135 64 64)"
          strokeLinecap="round"
        />
        <text x="64" y="68" textAnchor="middle" fill={color} fontSize="30" fontFamily="monospace" fontWeight="bold">
          {hasMri ? Math.round(v) : '--'}
        </text>
        <text x="64" y="88" textAnchor="middle" fill="#9ca3af" fontSize="10" fontFamily="monospace">
          MRI
        </text>
      </svg>
      <div className="min-w-0 font-mono text-sm">
        <div className="text-gray-500">TIME-TO-VIOLATION</div>
        <div className={`text-lg font-bold leading-tight ${ttvColor}`}>{ttvFmt.primaryText}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-gray-500">{ttvFmt.secondaryText}</div>
      </div>
    </div>
  );
}

interface HorizonPoint {
  label: string;
  hours: number;
  xi: number;
  triplet: MonotoneQuantileTriplet;
}

const HORIZON_STEPS = [
  { label: '+15m', hours: 0.25, key: 'horizon_15m' },
  { label: '+1h', hours: 1, key: 'horizon_1h' },
  { label: '+6h', hours: 6, key: 'horizon_6h' },
  { label: '+24h', hours: 24, key: 'horizon_24h' },
] as const;

const SHORT_EWMA_HORIZON_STEPS = [
  { label: '+5s', seconds: 5, key: 'horizon_5s' },
  { label: '+10s', seconds: 10, key: 'horizon_10s' },
  { label: '+30s', seconds: 30, key: 'horizon_30s' },
  { label: '+60s', seconds: 60, key: 'horizon_60s' },
  { label: '+120s', seconds: 120, key: 'horizon_120s' },
] as const;

type ConeHorizonMode = 'LONG' | 'SHORT_EWMA';

interface ConeOption {
  channel: string;
  label: string;
  points: HorizonPoint[];
  ewmaLevel?: number;
}

function buildShortEwmaConeOptions(
  tq: TimestralQuantilesSummary | null | undefined,
  hrvUnavailable: boolean,
): ConeOption[] {
  if (!tq || !Array.isArray(tq.short_horizon_cones)) return [];
  const options: ConeOption[] = [];
  const seen = new Set<string>();
  for (const cone of tq.short_horizon_cones) {
    if (
      hrvUnavailable &&
      (cone.channel_name === 'rmssd_ms' ||
        cone.channel_name === 'sdnn_ms' ||
        cone.channel_name === 'lf_hf_ratio' ||
        cone.channel_name === 'rho_global')
    ) {
      continue;
    }
    const pts: HorizonPoint[] = [];
    for (const h of SHORT_EWMA_HORIZON_STEPS) {
      const parsed = parseMonotoneQuantileTriplet(cone[h.key]);
      if (parsed) {
        pts.push({
          label: h.label,
          hours: h.seconds / 3600,
          xi: h.seconds / 120,
          triplet: parsed,
        });
      }
    }
    if (pts.length > 0 && !seen.has(cone.channel_name)) {
      seen.add(cone.channel_name);
      options.push({
        channel: cone.channel_name,
        label: cone.channel_name.toUpperCase(),
        points: pts,
        ewmaLevel: typeof cone.ewma_level === 'number' && Number.isFinite(cone.ewma_level) ? cone.ewma_level : undefined,
      });
    }
  }
  return options;
}

function buildConeOptions(
  tq: TimestralQuantilesSummary | null | undefined,
  hrvUnavailable: boolean,
): ConeOption[] {
  if (!tq) return [];
  const options: ConeOption[] = [];
  const seen = new Set<string>();

  if (Array.isArray(tq.channel_cones)) {
    for (const cone of tq.channel_cones) {
      if (
        hrvUnavailable &&
        (cone.channel_name === 'rmssd_ms' ||
          cone.channel_name === 'sdnn_ms' ||
          cone.channel_name === 'lf_hf_ratio' ||
          cone.channel_name === 'rho_global')
      ) {
        continue;
      }
      const pts: HorizonPoint[] = [];
      for (const h of HORIZON_STEPS) {
        const parsed = parseMonotoneQuantileTriplet(cone[h.key]);
        if (parsed) {
          pts.push({
            label: h.label,
            hours: h.hours,
            xi: computeLogHorizonXi(h.hours * 3600),
            triplet: parsed,
          });
        }
      }
      if (pts.length > 0 && !seen.has(cone.channel_name)) {
        seen.add(cone.channel_name);
        options.push({
          channel: cone.channel_name,
          label: cone.channel_name.toUpperCase(),
          points: pts,
        });
      }
    }
  }

  const scalarFallback: Array<{
    channel: string;
    label: string;
    cone: MonotoneQuantileTriplet | null | undefined;
    suppressed: boolean;
  }> = [
    { channel: 'hr_bpm', label: 'HR_BPM', cone: tq.heart_rate_bpm_cone, suppressed: false },
    { channel: 'resp_brpm', label: 'RESP_BRPM', cone: tq.resp_rate_brpm_cone, suppressed: false },
    { channel: 'rmssd_ms', label: 'RMSSD_MS', cone: tq.rmssd_ms_cone, suppressed: hrvUnavailable },
    { channel: 'rho_global', label: 'RHO_GLOBAL', cone: tq.rho_global_cone, suppressed: hrvUnavailable },
  ];

  for (const item of scalarFallback) {
    if (item.suppressed || seen.has(item.channel)) continue;
    const parsed = parseMonotoneQuantileTriplet(item.cone);
    if (!parsed) continue;
    const spread = Math.max(0.01, (parsed.q95 - parsed.q05) / 2);
    const pts: HorizonPoint[] = HORIZON_STEPS.map((h, i) => {
      const scale = [0.45, 0.7, 0.9, 1.0][i];
      return {
        label: h.label,
        hours: h.hours,
        xi: computeLogHorizonXi(h.hours * 3600),
        triplet: {
          q05: parsed.q50 - spread * scale,
          q50: parsed.q50,
          q95: parsed.q50 + spread * scale,
        },
      };
    });
    seen.add(item.channel);
    options.push({ channel: item.channel, label: item.label, points: pts });
  }

  return options;
}

export function TimestralQuantileConePanel({
  packet,
}: {
  packet: TelemetryPacket | null | undefined;
}) {
  const tq = packet?.timestral_quantiles;
  const hrvUnavailable =
    packet?.biometrics.hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE' ||
    packet?.biometrics.hrv_rmssd_ms === null;

  const [horizonMode, setHorizonMode] = useState<ConeHorizonMode>('SHORT_EWMA');
  const longConeOptions = useMemo(() => buildConeOptions(tq, hrvUnavailable), [tq, hrvUnavailable]);
  const shortConeOptions = useMemo(() => buildShortEwmaConeOptions(tq, hrvUnavailable), [tq, hrvUnavailable]);
  const coneOptions = horizonMode === 'SHORT_EWMA' ? shortConeOptions : longConeOptions;
  const [selectedChannel, setSelectedChannel] = useState<string>('hr_bpm');

  useEffect(() => {
    if (coneOptions.length > 0 && !coneOptions.some((o) => o.channel === selectedChannel)) {
      setSelectedChannel(coneOptions[0].channel);
    }
  }, [coneOptions, selectedChannel]);

  const activeCone =
    coneOptions.find((o) => o.channel === selectedChannel) ?? coneOptions[0] ?? null;
  const maxShortXi = Math.max(1e-6, ...SHORT_EWMA_HORIZON_STEPS.map((h) => h.seconds / 120));

  const validationLabel =
    tq?.model_validation_status ??
    packet?.model_validation_status ??
    'ILLUSTRATIVE_UNVALIDATED';
  const intervalKindLabel =
    packet?.safety_margins.ttv_interval_kind ?? 'ILLUSTRATIVE_SCENARIO_RANGE';
  const gateStatus =
    tq?.conformal_status ??
    tq?.confidence_state ??
    'ABSTAINED_FALLBACK_DETERMINISTIC';
  const isAbstained = gateStatus === 'ABSTAINED_FALLBACK_DETERMINISTIC';

  const ttvCone = hrvUnavailable ? null : parseMonotoneQuantileTriplet(tq?.ttv_hours_cone);

  const W = 520;
  const H = 198;
  const PAD_X = 42;
  const PAD_Y = 22;

  return (
    <div className="short-forecast">
      <div className="short-forecast-controls" role="group" aria-label="Forecast horizon range">
        <button type="button" aria-pressed={horizonMode === 'SHORT_EWMA'} onClick={() => setHorizonMode('SHORT_EWMA')}>
          5 seconds to 2 minutes
        </button>
        <button type="button" aria-pressed={horizonMode === 'LONG'} onClick={() => setHorizonMode('LONG')}>
          15 minutes to 24 hours
        </button>
      </div>

      {/* Issue #11 Strict Nullability Banner */}
      {hrvUnavailable && (
        <div className="rounded border border-caution/60 bg-black px-2.5 py-1.5 text-[11px] text-caution">
          Beat intervals are unavailable. HRV, global safety margin and time-to-limit forecasts are unavailable for this input.
        </div>
      )}

      {/* Conformal Abstention Certificate Banner */}
      {tq?.abstention_certificate && isAbstained && (
        <div className="rounded border border-caution/50 bg-black px-2.5 py-1.5 text-[11px] text-gray-300">
          Forecast availability: {displayLabel(tq.abstention_certificate.reason)}
          {tq.abstention_certificate.abstained
            ? ` [DETERMINISTIC FALLBACK ACTIVE | cov_err=${tq.abstention_certificate.empirical_coverage_error.toFixed(3)}]`
            : ''}
        </div>
      )}

      {coneOptions.length > 0 && (
        <div className="short-forecast-controls" role="group" aria-label="Forecast signal">
          {coneOptions.map((opt) => (
            <button key={opt.channel} type="button" aria-pressed={activeCone?.channel === opt.channel}
              onClick={() => setSelectedChannel(opt.channel)}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Log-Horizon SVG Quantile Fan (+15m -> +1h -> +6h -> +24h) */}
      {activeCone ? (
        (() => {
          const allVals = activeCone.points.flatMap((p) => [p.triplet.q05, p.triplet.q50, p.triplet.q95]);
          const minVal = Math.min(...allVals);
          const maxVal = Math.max(...allVals);
          const span = Math.max(0.5, maxVal - minVal);
          const yLow = minVal - span * 0.15;
          const yHigh = maxVal + span * 0.15;
          const xDomainMax = horizonMode === 'SHORT_EWMA'
            ? Math.max(maxShortXi, ...activeCone.points.map((p) => p.xi))
            : 1;
          const sx = (xi: number) => PAD_X + Math.min(1, xi / xDomainMax) * (W - 2 * PAD_X);
          const sy = (val: number) =>
            PAD_Y + ((yHigh - val) / Math.max(1e-6, yHigh - yLow)) * (H - 2 * PAD_Y);

          const bandPath =
            activeCone.points
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.xi).toFixed(1)},${sy(p.triplet.q95).toFixed(1)}`)
              .join(' ') +
            ' ' +
            [...activeCone.points]
              .reverse()
              .map((p) => `L${sx(p.xi).toFixed(1)},${sy(p.triplet.q05).toFixed(1)}`)
              .join(' ') +
            ' Z';

          const medianPath = activeCone.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.xi).toFixed(1)},${sy(p.triplet.q50).toFixed(1)}`)
            .join(' ');

          const latestPt = activeCone.points[activeCone.points.length - 1];
          const bandFill = isAbstained ? '#e4af65' : '#72cdb6';
          const bandStroke = isAbstained ? '#e4af65' : '#72cdb6';

          return (
            <div className="short-forecast-chart">
              <div className="forecast-legend">
                <span><i aria-hidden="true" />Median</span>
                <span><i className="forecast-range" aria-hidden="true" />5th–95th percentile</span>
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                role="img"
                aria-label={`Forecast range for ${activeCone.label}`}
              >
                <path d={bandPath} fill={bandFill} fillOpacity="0.16" />
                <path
                  d={medianPath}
                  fill="none"
                  stroke={bandStroke}
                  strokeWidth="2"
                  strokeDasharray={isAbstained ? '5 3' : undefined}
                />
                {activeCone.points.map((p) => (
                  <g key={p.label}>
                    <line
                      x1={sx(p.xi)}
                      x2={sx(p.xi)}
                      y1={sy(p.triplet.q95)}
                      y2={sy(p.triplet.q05)}
                      stroke={bandStroke}
                      strokeOpacity="0.45"
                      strokeWidth="1.5"
                    />
                    <circle cx={sx(p.xi)} cy={sy(p.triplet.q50)} r="3.5" fill={bandStroke} />
                    <text
                      x={sx(p.xi)}
                      y={H - 4}
                      textAnchor="middle"
                      fill="#9ca3af"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {p.label}
                    </text>
                  </g>
                ))}
                <text x={4} y={PAD_Y + 4} fill="#6b7280" fontSize="10" fontFamily="monospace">
                  {yHigh.toFixed(1)}
                </text>
                <text x={4} y={H - PAD_Y} fill="#6b7280" fontSize="10" fontFamily="monospace">
                  {yLow.toFixed(1)}
                </text>
              </svg>
              {latestPt && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span>
                    {activeCone.label} {latestPt.label} · median {latestPt.triplet.q50.toFixed(2)} · range {latestPt.triplet.q05.toFixed(2)}–{latestPt.triplet.q95.toFixed(2)}
                  </span>
                  {ttvCone && (
                    <span className="text-advisory">
                      TTV q05-q50-q95: [{ttvCone.q05.toFixed(1)}, {ttvCone.q50.toFixed(1)},{' '}
                      {ttvCone.q95.toFixed(1)}] h
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <div className="rounded border border-line/60 bg-black p-3 text-gray-500">
          {horizonMode === 'SHORT_EWMA'
            ? 'The short-term forecast needs more valid samples.'
            : 'The longer forecast is waiting for telemetry.'}
        </div>
      )}
      <details className="scenario-disclosure">
        <CockpitSummary>Model details</CockpitSummary>
        <div className="short-forecast-meta">
          <span>{displayLabel(validationLabel)} · {displayLabel(intervalKindLabel)}</span>
          <span>{displayLabel(gateStatus)}</span>
          {tq?.forecast_method && <span>{displayLabel(tq.forecast_method)}</span>}
          {horizonMode === 'SHORT_EWMA' && tq?.short_horizon_abstention && (
            <span>{displayLabel(typeof tq.short_horizon_abstention === 'string'
              ? tq.short_horizon_abstention : tq.short_horizon_abstention.reason)}</span>
          )}
        </div>
      </details>
    </div>
  );
}

interface Pt {
  day: number;
  rho: number;
  sigma: number;
}

/** rho_hat_min vs mission day + live Timestral multi-horizon quantile cones. */
export function StlChart({
  whatIf,
  lastScanDay,
  isPureReplay,
}: {
  whatIf: WhatIf;
  lastScanDay: number;
  isPureReplay?: boolean;
}) {
  const W = 520;
  const H = 247;
  const PAD = 30;
  const { past, future, dayMin, dayMax } = useMemo(() => {
    const d = Math.round(whatIf.mission_day);
    const start = Math.max(0, d - 60);
    const pts = (from: number, to: number): Pt[] => {
      const out: Pt[] = [];
      for (let x = from; x <= to; x += 1) {
        const s = evaluate({ ...whatIf, mission_day: x }, lastScanDay);
        out.push({ day: x, rho: s.rhoMin, sigma: s.sigma });
      }
      return out;
    };
    return { past: pts(start, d), future: pts(d, d + 14), dayMin: start, dayMax: d + 14 };
  }, [whatIf, lastScanDay]);

  const yMin = -0.6;
  const yMax = 1.0;
  const sx = (day: number) => PAD + ((day - dayMin) / Math.max(1, dayMax - dayMin)) * (W - 2 * PAD);
  const sy = (r: number) => PAD / 2 + ((yMax - Math.max(yMin, Math.min(yMax, r))) / (yMax - yMin)) * (H - PAD);
  const line = (p: Pt[]) => p.map((q, i) => `${i ? 'L' : 'M'}${sx(q.day)},${sy(q.rho)}`).join(' ');
  const all = [...past, ...future.slice(1)];
  const band =
    all.map((q, i) => `${i ? 'L' : 'M'}${sx(q.day)},${sy(q.rho + 1.96 * q.sigma)}`).join(' ') +
    ' ' +
    [...all].reverse().map((q) => `L${sx(q.day)},${sy(q.rho - 1.96 * q.sigma)}`).join(' ') +
    ' Z';
  const currentDay = Math.round(whatIf.mission_day);
  const last = past[past.length - 1];
  const historyColor = riskColor(last ? last.rho : 0);

  return (
    <div className="space-y-3">
      {isPureReplay ? (
        <div className="flex flex-col items-center justify-center rounded border border-line bg-black p-4 text-center font-mono text-xs">
          <div className="font-bold text-advisory">
            14-DAY DEEP-SPACE TRAJECTORY UNAVAILABLE IN PURE BIDMC REPLAY
          </div>
          <p className="mt-2 max-w-md text-gray-400">
            PhysioNet BIDMC v1.0.0 is an 8-minute terrestrial ICU recording without longitudinal microgravity baselines or R-R beat intervals. Engage the What-If Scenario Overlay to simulate a deep-space mission trajectory.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="forecast-legend">
            <span><i aria-hidden="true" style={{ color: historyColor }} />Scenario history</span>
            <span><i aria-hidden="true" className="forecast-dashed" />14-day projection</span>
            <span><i aria-hidden="true" className="forecast-range" />Illustrative range</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scenario safety margin by mission day">
            {[1, 0.5, -0.5].map(t => (
              <line key={t} x1={PAD} x2={W - PAD} y1={sy(t)} y2={sy(t)} stroke="#33463a" />
            ))}
            <path d={band} fill="#22d3ee" fillOpacity="0.12" />
            <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} stroke="#f43f5e" strokeDasharray="4 3" />
            <text x={W - PAD} y={sy(0) - 4} textAnchor="end" fill="#f43f5e" fontSize="10" fontFamily="monospace">
              Safety threshold
            </text>
            <line
              x1={sx(currentDay)}
              x2={sx(currentDay)}
              y1={PAD / 2}
              y2={H - PAD / 2}
              stroke="#374151"
            />
            <path d={line(past)} fill="none" stroke={historyColor} strokeWidth="2" />
            <path d={line(future)} fill="none" stroke="#e5e7eb" strokeWidth="1.5" strokeDasharray="5 4" />
            {last && <circle cx={sx(currentDay)} cy={sy(last.rho)} r="3" fill={historyColor} stroke="#171e19" />}
            {[1, 0.5, 0, -0.5].map((t) => (
              <text key={t} x={4} y={sy(t) + 3} fill="#a4b6aa" fontSize="10" fontFamily="monospace">
                {t.toFixed(1)}
              </text>
            ))}
            <text x={PAD} y={H - 2} fill="#a4b6aa" fontSize="10" fontFamily="monospace">
              day {dayMin}
            </text>
            <text x={W - PAD} y={H - 2} textAnchor="end" fill="#a4b6aa" fontSize="10" fontFamily="monospace">
              day {dayMax} (+14 d)
            </text>
          </svg>
        </div>
      )}
    </div>
  );
}

export function PredicateBars({ rho }: { rho: Record<string, number | null> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
      {Object.entries(rho).map(([k, v]) => {
        const isNull = v === null || !Number.isFinite(v);
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="w-24 truncate text-gray-400">{displayLabel(k)}</span>
            <div className="h-2 flex-1 rounded bg-line">
              {!isNull && (
                <div
                  className="h-2 rounded"
                  style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: riskColor(v) }}
                />
              )}
            </div>
            <span className="w-16 text-right" style={{ color: isNull ? '#facc15' : riskColor(v) }}>
              {isNull ? 'N/A' : v.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
