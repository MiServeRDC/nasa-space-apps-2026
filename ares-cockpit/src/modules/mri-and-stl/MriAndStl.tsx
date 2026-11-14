import { useMemo } from 'react';
import { evaluate, type WhatIf } from '../../lib/scenario';

function riskColor(v: number): string {
  if (v < 0) return '#f43f5e';
  if (v < 0.2) return '#fb923c';
  if (v < 0.4) return '#facc15';
  return '#22d3ee';
}

export function MriGauge({ mri, ttv }: { mri: number | null; ttv: number | null | undefined }) {
  const v = mri ?? 0;
  const r = 52;
  const full = 2 * Math.PI * r;
  const arc = full * 0.75;
  const color = mri === null ? '#6b7280' : v >= 70 ? '#22d3ee' : v >= 50 ? '#facc15' : '#f43f5e';
  const noTtv = ttv === null || ttv === undefined;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 128 128" className="h-28 w-28" role="img" aria-label={mri === null ? 'Mission readiness unavailable' : `Mission readiness ${v}`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="#1f2937" strokeWidth="10"
          strokeDasharray={`${arc} ${full}`} transform="rotate(135 64 64)" strokeLinecap="round" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${(arc * v) / 100} ${full}`} transform="rotate(135 64 64)" strokeLinecap="round" />
        <text x="64" y="68" textAnchor="middle" fill={color} fontSize="30" fontFamily="monospace" fontWeight="bold">
          {mri === null ? '--' : Math.round(v)}
        </text>
        <text x="64" y="88" textAnchor="middle" fill="#9ca3af" fontSize="10" fontFamily="monospace">MRI</text>
      </svg>
      <div className="font-mono text-sm">
        <div className="text-gray-500">TIME-TO-VIOLATION</div>
        <div className={`text-2xl font-bold ${noTtv ? 'text-gray-500' : (ttv as number) < 14 ? 'text-critical' : 'text-advisory'}`}>
          {noTtv ? 'UNAVAILABLE' : `${ttv} d`}
        </div>
        <div className="text-xs text-gray-600">countermeasures held constant</div>
      </div>
    </div>
  );
}

interface Pt { day: number; rho: number; sigma: number }

/** rho_hat_min vs mission day: past trajectory, 14-day forecast, +/- 1.96 sigma Bayesian band. */
export function StlChart({ whatIf, lastScanDay }: { whatIf: WhatIf; lastScanDay: number }) {
  const W = 520, H = 190, PAD = 30;
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

  const yMin = -0.6, yMax = 1.0;
  const sx = (day: number) => PAD + ((day - dayMin) / Math.max(1, dayMax - dayMin)) * (W - 2 * PAD);
  const sy = (r: number) => PAD / 2 + ((yMax - Math.max(yMin, Math.min(yMax, r))) / (yMax - yMin)) * (H - PAD);
  const line = (p: Pt[]) => p.map((q, i) => `${i ? 'L' : 'M'}${sx(q.day)},${sy(q.rho)}`).join(' ');
  const all = [...past, ...future.slice(1)];
  const band =
    all.map((q, i) => `${i ? 'L' : 'M'}${sx(q.day)},${sy(q.rho + 1.96 * q.sigma)}`).join(' ') + ' ' +
    [...all].reverse().map((q) => `L${sx(q.day)},${sy(q.rho - 1.96 * q.sigma)}`).join(' ') + ' Z';
  const last = past[past.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="NQS-STL robustness chart">
      <path d={band} fill="#22d3ee" fillOpacity="0.12" />
      <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} stroke="#f43f5e" strokeDasharray="4 3" />
      <text x={W - PAD} y={sy(0) - 4} textAnchor="end" fill="#f43f5e" fontSize="10" fontFamily="monospace">rho = 0 violation</text>
      <line x1={sx(Math.round(whatIf.mission_day))} x2={sx(Math.round(whatIf.mission_day))} y1={PAD / 2} y2={H - PAD / 2} stroke="#374151" />
      <path d={line(past)} fill="none" stroke={riskColor(last ? last.rho : 0)} strokeWidth="2" />
      <path d={line(future)} fill="none" stroke="#e5e7eb" strokeWidth="1.5" strokeDasharray="5 4" />
      {[1, 0.5, 0, -0.5].map((t) => (
        <text key={t} x={4} y={sy(t) + 3} fill="#6b7280" fontSize="10" fontFamily="monospace">{t.toFixed(1)}</text>
      ))}
      <text x={PAD} y={H - 2} fill="#6b7280" fontSize="10" fontFamily="monospace">day {dayMin}</text>
      <text x={W - PAD} y={H - 2} textAnchor="end" fill="#6b7280" fontSize="10" fontFamily="monospace">day {dayMax} (+14 d forecast)</text>
    </svg>
  );
}

export function PredicateBars({ rho }: { rho: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
      {Object.entries(rho).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-20 text-gray-400">{k}</span>
          <div className="h-2 flex-1 rounded bg-line">
            <div className="h-2 rounded" style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: riskColor(v) }} />
          </div>
          <span className="w-12 text-right" style={{ color: riskColor(v) }}>{v.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
