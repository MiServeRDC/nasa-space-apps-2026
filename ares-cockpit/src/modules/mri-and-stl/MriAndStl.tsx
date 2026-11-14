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

  const [horizonMode, setHorizonMode] = useState<ConeHorizonMode>('LONG');
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
  const H = 165;
  const PAD_X = 42;
  const PAD_Y = 22;

  return (
    <div className="space-y-2 rounded border border-line bg-black p-3 font-mono text-xs">
      {/* Header Badges (Issue #12 compliant: zero forbidden strings) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-nominal">TIMESTRAL QUANTILE CONES (q05-q50-q95)</span>
          <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
            {validationLabel} | {intervalKindLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
              isAbstained
                ? 'border-caution text-caution'
                : 'border-ok text-ok'
            }`}
          >
            CONFORMAL GATE: {gateStatus}
          </span>
          {typeof tq?.inference_latency_us === 'number' && Number.isFinite(tq.inference_latency_us) && (
            <span className="text-[10px] text-gray-500">
              {tq.inference_latency_us} us
            </span>
          )}
        </div>
      </div>

      {/* Issue #11 Strict Nullability Banner */}
      {hrvUnavailable && (
        <div className="rounded border border-caution/60 bg-black px-2.5 py-1.5 text-[11px] text-caution">
          BEAT_INTERVALS_NOT_AVAILABLE: R-R intervals absent (`hrv_rmssd_ms === null`). HRV/STL cones (`rmssd_ms`, `rho_global`, `ttv_hours_cone`) remain suppressed (not coerced to zero).
        </div>
      )}

      {/* Conformal Abstention Certificate Banner */}
      {tq?.abstention_certificate && isAbstained && (
        <div className="rounded border border-caution/50 bg-black px-2.5 py-1.5 text-[11px] text-gray-300">
          ABSTENTION CERTIFICATE: {tq.abstention_certificate.reason}
          {tq.abstention_certificate.abstained
            ? ` [DETERMINISTIC FALLBACK ACTIVE | cov_err=${tq.abstention_certificate.empirical_coverage_error.toFixed(3)}]`
            : ''}
        </div>
      )}

      {/* Horizon Mode Toggle (+15m..+24h Timestral vs +5s..+120s EWMA) & Channel Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Forecast horizon range">
          <button
            type="button"
            aria-pressed={horizonMode === 'LONG'}
            onClick={() => setHorizonMode('LONG')}
            className={`min-h-[44px] rounded border px-3 py-2 text-xs transition-colors ${
              horizonMode === 'LONG'
                ? 'border-nominal bg-nominal/10 text-nominal'
                : 'border-line bg-black text-gray-400 hover:border-gray-600'
            }`}
          >
            LONG HORIZON (+15m..+24h)
          </button>
          <button
            type="button"
            aria-pressed={horizonMode === 'SHORT_EWMA'}
            onClick={() => setHorizonMode('SHORT_EWMA')}
            className={`min-h-[44px] rounded border px-3 py-2 text-xs transition-colors ${
              horizonMode === 'SHORT_EWMA'
                ? 'border-nominal bg-nominal/10 text-nominal'
                : 'border-line bg-black text-gray-400 hover:border-gray-600'
            }`}
          >
            SHORT HORIZON (+5s..+120s EWMA)
          </button>
        </div>
        {tq?.forecast_method && (
          <span className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-400">
            METHOD: {tq.forecast_method}
          </span>
        )}
      </div>

      {horizonMode === 'SHORT_EWMA' && tq?.short_horizon_abstention && (
        <div className="rounded border border-advisory/50 bg-black px-2.5 py-1.5 text-[11px] text-advisory">
          SHORT-HORIZON EWMA STATUS:{' '}
          {typeof tq.short_horizon_abstention === 'string'
            ? tq.short_horizon_abstention
            : tq.short_horizon_abstention.reason}
        </div>
      )}

      {/* Channel Selector Buttons (>= 44x44 pt) */}
      {coneOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {coneOptions.map((opt) => (
            <button
              key={opt.channel}
              type="button"
              onClick={() => setSelectedChannel(opt.channel)}
              className={`min-h-[44px] min-w-[44px] rounded border px-3 py-2 text-xs transition-colors ${
                activeCone?.channel === opt.channel
                  ? 'border-nominal bg-nominal/10 text-nominal'
                  : 'border-line bg-black text-gray-400 hover:border-gray-600'
              }`}
            >
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
          const bandFill = isAbstained ? '#facc15' : '#22d3ee';
          const bandStroke = isAbstained ? '#facc15' : '#22d3ee';

          return (
            <div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                role="img"
                aria-label={`Timestral multi-horizon quantile cone for ${activeCone.label}`}
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
                    {activeCone.label} {latestPt.label} q05-q50-q95: [{latestPt.triplet.q05.toFixed(2)},{' '}
                    {latestPt.triplet.q50.toFixed(2)}, {latestPt.triplet.q95.toFixed(2)}]
                    {activeCone.ewmaLevel !== undefined ? ` | EWMA=${activeCone.ewmaLevel.toFixed(2)}` : ''}
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
            ? 'Short-horizon EWMA cones warming up (+5s/+10s appear after baseline window)...'
            : 'Timestral quantile cones awaiting telemetry frames...'}
        </div>
      )}
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
  packet,
}: {
  whatIf: WhatIf;
  lastScanDay: number;
  isPureReplay?: boolean;
  packet?: TelemetryPacket | null;
}) {
  const W = 520;
  const H = 190;
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
  const last = past[past.length - 1];

  return (
    <div className="space-y-3">
      <TimestralQuantileConePanel packet={packet} />

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
          <div className="flex items-center justify-between font-mono text-[10px] text-gray-500">
            <span>ILLUSTRATIVE SCENARIO ROBUSTNESS TRAJECTORY (+14d)</span>
            <span>ILLUSTRATIVE_SCENARIO_RANGE (NOMINAL BAND)</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="NQS-STL robustness chart">
            <path d={band} fill="#22d3ee" fillOpacity="0.12" />
            <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} stroke="#f43f5e" strokeDasharray="4 3" />
            <text x={W - PAD} y={sy(0) - 4} textAnchor="end" fill="#f43f5e" fontSize="10" fontFamily="monospace">
              rho = 0 violation
            </text>
            <line
              x1={sx(Math.round(whatIf.mission_day))}
              x2={sx(Math.round(whatIf.mission_day))}
              y1={PAD / 2}
              y2={H - PAD / 2}
              stroke="#374151"
            />
            <path d={line(past)} fill="none" stroke={riskColor(last ? last.rho : 0)} strokeWidth="2" />
            <path d={line(future)} fill="none" stroke="#e5e7eb" strokeWidth="1.5" strokeDasharray="5 4" />
            {[1, 0.5, 0, -0.5].map((t) => (
              <text key={t} x={4} y={sy(t) + 3} fill="#6b7280" fontSize="10" fontFamily="monospace">
                {t.toFixed(1)}
              </text>
            ))}
            <text x={PAD} y={H - 2} fill="#6b7280" fontSize="10" fontFamily="monospace">
              day {dayMin}
            </text>
            <text x={W - PAD} y={H - 2} textAnchor="end" fill="#6b7280" fontSize="10" fontFamily="monospace">
              day {dayMax} (+14 d forecast)
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
            <span className="w-24 truncate text-gray-400">{k}</span>
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
