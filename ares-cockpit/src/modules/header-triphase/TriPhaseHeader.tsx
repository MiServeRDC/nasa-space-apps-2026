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

export function TriPhaseHeader({
  alarm,
  link,
  activePhase,
  recommendedPhase,
  onSelectPhase,
}: {
  alarm: AlarmLevel;
  link: LinkState;
  activePhase: Phase;
  recommendedPhase: Phase;
  onSelectPhase: (p: Phase) => void;
}) {
  const [profile, setProfile] = useState<Profile>(LATENCY_PROFILES[1]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const autonomous = profile.oneWayS > 60;
  const phases: Phase[] = ['GATHER', 'EVALUATE', 'ACT'];

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-black px-4 py-2 font-mono text-sm">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-widest text-nominal">ARES-HEALTH</span>
        <span className="text-gray-500">ASTRO-01</span>
      </div>

      <nav className="flex items-center gap-2" aria-label="Cockpit pages">
        {phases.map((p, i) => {
          const isActive = p === activePhase;
          const isAlert = p === 'ACT' && recommendedPhase === 'ACT' && !isActive;
          return (
            <div key={p} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectPhase(p)}
                className={`cursor-pointer rounded border px-3 py-1 transition-colors ${
                  isActive
                    ? 'border-nominal bg-nominal font-bold text-black'
                    : isAlert
                      ? 'border-warning text-warning hover:bg-warning/15'
                      : 'border-line text-gray-400 hover:border-gray-500 hover:text-white'
                }`}
              >
                {i + 1}. {p}
              </button>
              {i < 2 && <span className="text-gray-600">-&gt;</span>}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Earth link profile"
          className="rounded border border-line bg-black px-2 py-1 text-gray-200"
          value={profile.id}
          onChange={(e) => setProfile(LATENCY_PROFILES.find((p) => p.id === e.target.value) ?? LATENCY_PROFILES[1])}
        >
          {LATENCY_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <span className={Number.isFinite(profile.oneWayS) ? 'text-gray-300' : 'font-bold text-critical'}>OWLT {fmt(profile.oneWayS)}</span>
        <span className={autonomous ? 'text-advisory' : 'text-ok'}>{autonomous ? 'ON-BOARD AUTONOMY' : 'GROUND LINK'}</span>
        <span className={link === 'ENGINE_LIVE' ? 'text-ok' : 'text-gray-500'}>{link === 'ENGINE_LIVE' ? 'ENGINE CONNECTED' : link === 'ENGINE_STALE' ? 'ENGINE DATA STALE / INVALID' : 'LOCAL SIMULATION'}</span>
        <AlarmBadge level={alarm} />
        <span className="text-gray-500">{now.toISOString().slice(11, 19)}Z</span>
      </div>
    </header>
  );
}
