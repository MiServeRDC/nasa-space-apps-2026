import { useEffect, useState } from 'react';
import type { AlarmLevel } from '../../types/telemetry';
import type { LinkState } from '../../lib/useTelemetry';

const LATENCY_PROFILES = [
  { id: 'ISS', label: 'LEO / ISS', oneWayS: 0.5 },
  { id: 'MARS', label: 'Mars Transit', oneWayS: 14 * 60 + 22 },
  { id: 'CONJ', label: 'Solar Conjunction', oneWayS: Infinity },
] as const;

type Profile = (typeof LATENCY_PROFILES)[number];
export type Phase = 'GATHER' | 'EVALUATE' | 'ACT';

function fmt(s: number): string {
  if (!Number.isFinite(s)) return 'BLACKOUT';
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

export function AlarmBadge({ level }: { level: AlarmLevel }) {
  const cls: Record<AlarmLevel, string> = {
    NOMINAL: 'border-ok text-ok',
    ADVISORY: 'border-advisory text-advisory',
    WARNING: 'border-warning text-warning',
    CRITICAL: 'border-critical bg-critical text-black animate-pulse',
    DATA_DEGRADED_MISSING_CHANNELS: 'border-advisory text-advisory',
  };
  return <span className={`rounded border px-2 py-1 font-bold ${cls[level]}`}>{level}</span>;
}

export function TriPhaseHeader({ alarm, link, phase }: { alarm: AlarmLevel; link: LinkState; phase: Phase }) {
  const [profile, setProfile] = useState<Profile>(LATENCY_PROFILES[1]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const autonomous = profile.oneWayS > 60;
  const phases: Phase[] = ['GATHER', 'EVALUATE', 'ACT'];

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-4 py-2 font-mono text-sm">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-widest text-nominal">ARES-HEALTH</span>
        <span className="text-gray-500">ASTRO-01</span>
      </div>

      <ol className="flex items-center gap-2" aria-label="Closed-loop phase">
        {phases.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            <span className={`rounded border px-3 py-1 ${p === phase ? 'border-nominal bg-nominal font-bold text-black' : 'border-line text-gray-500'}`}>
              [{i + 1}. {p}]
            </span>
            {i < 2 && <span className="text-gray-600">-&gt;</span>}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Earth link profile"
          className="rounded border border-line bg-black px-2 py-1"
          value={profile.id}
          onChange={(e) => setProfile(LATENCY_PROFILES.find((p) => p.id === e.target.value) ?? LATENCY_PROFILES[1])}
        >
          {LATENCY_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <span className={Number.isFinite(profile.oneWayS) ? 'text-gray-300' : 'font-bold text-critical'}>OWLT {fmt(profile.oneWayS)}</span>
        <span className={autonomous ? 'text-advisory' : 'text-ok'}>{autonomous ? 'EDGE AUTONOMY' : 'GROUND LOOP'}</span>
        <span className={link === 'ENGINE_LIVE' ? 'text-ok' : 'text-advisory'}>{link === 'ENGINE_LIVE' ? 'ENGINE 127.0.0.1:8080' : 'LOCAL SIM'}</span>
        <AlarmBadge level={alarm} />
        <span className="text-gray-500">{now.toISOString().slice(11, 19)}Z</span>
      </div>
    </header>
  );
}
