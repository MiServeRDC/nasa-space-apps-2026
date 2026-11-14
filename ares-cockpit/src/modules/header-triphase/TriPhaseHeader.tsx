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
  return (
    <span
      role="status"
      data-alarm-level={level}
      title={level}
      className={`rounded border px-2 py-1 font-bold ${cls[level]}`}
    >
      {level}
    </span>
  );
}

export function TriPhaseHeader({
  astronautId,
  alarm,
  link,
  wsConnected,
  activePhase,
  recommendedPhase,
  onSelectPhase,
  onOpenAudit,
  onOpenPortal,
  onOpenStudio,
  onOpenShortcuts,
  onTogglePalette,
}: {
  astronautId: string;
  alarm: AlarmLevel;
  link: LinkState;
  wsConnected: boolean;
  activePhase: Phase;
  recommendedPhase: Phase;
  onSelectPhase: (p: Phase) => void;
  onOpenAudit?: () => void;
  onOpenPortal?: () => void;
  onOpenStudio?: () => void;
  onOpenShortcuts?: () => void;
  onTogglePalette?: () => void;
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
        <span className="text-gray-400">{astronautId}</span>
      </div>

      <nav className="flex items-center gap-2" aria-label="Cockpit pages">
        {phases.map((p, i) => {
          const isActive = p === activePhase;
          const isAlert = p === 'ACT' && recommendedPhase === 'ACT' && !isActive;
          return (
            <div key={p} className="flex items-center gap-2">
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectPhase(p)}
                className={`min-h-12 cursor-pointer rounded border px-3 py-2 transition-colors ${
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
          className="min-h-12 rounded border border-line bg-black px-2 py-1 text-gray-200"
          value={profile.id}
          onChange={(e) => setProfile(LATENCY_PROFILES.find((p) => p.id === e.target.value) ?? LATENCY_PROFILES[1])}
        >
          {LATENCY_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <span className={Number.isFinite(profile.oneWayS) ? 'text-gray-300' : 'font-bold text-critical'}>OWLT {fmt(profile.oneWayS)}</span>
        <span className={autonomous ? 'text-advisory' : 'text-ok'}>{autonomous ? 'ON-BOARD AUTONOMY' : 'GROUND LINK'}</span>
        <span className={link === 'ENGINE_LIVE' ? 'text-ok' : 'text-warning'}>
          {link === 'ENGINE_LIVE' ? (wsConnected ? 'ENGINE WS LIVE' : 'ENGINE SNAPSHOT') : 'LOCAL SIMULATION'}
        </span>
        {onOpenPortal && (
          <button
            type="button"
            onClick={onOpenPortal}
            className="min-h-12 cursor-pointer rounded border border-cyan-500/50 bg-cyan-950/30 px-3 py-1 text-xs font-bold text-cyan-300 hover:border-cyan-400 hover:bg-cyan-400 hover:text-black transition-all"
            title="Open Ground Control Telemedicine View & 24-Dataset Scientific Atlas"
          >
            GROUND PORTAL
          </button>
        )}
        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            className="min-h-12 cursor-pointer rounded border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs font-bold text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
            title="OpenScreen Multi-Track Replay Studio"
          >
            STUDIO
          </button>
        )}
        {onOpenAudit && (
          <button
            type="button"
            onClick={onOpenAudit}
            className="min-h-12 cursor-pointer rounded border border-emerald-500/50 bg-emerald-950/30 px-3 py-1 text-xs font-bold text-emerald-300 hover:border-emerald-400 hover:bg-emerald-400 hover:text-black transition-all"
            title="SHA-256 Medical Override Audit Chain"
          >
            AUDIT CHAIN
          </button>
        )}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="min-h-12 cursor-pointer rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-mono text-zinc-400 hover:border-zinc-600 hover:text-white transition-all"
            title="Keyboard Shortcuts (?)"
          >
            ?
          </button>
        )}
        {onTogglePalette && (
          <button
            type="button"
            onClick={onTogglePalette}
            className="min-h-12 cursor-pointer rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-mono text-cyan-400 hover:border-cyan-500 hover:text-cyan-300 transition-all"
            title="Command Palette (Cmd+K / Alt+Space)"
          >
            CMD+K
          </button>
        )}
        <AlarmBadge level={alarm} />
        <span className="text-gray-500">{now.toISOString().slice(11, 19)}Z</span>
      </div>
    </header>
  );
}
