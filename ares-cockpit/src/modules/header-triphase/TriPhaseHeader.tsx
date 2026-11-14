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
    NOMINAL:
      'border-emerald-400/60 bg-emerald-950/50 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.25)]',
    ADVISORY:
      'border-amber-400/60 bg-amber-950/50 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.25)]',
    WARNING:
      'border-amber-400 bg-amber-500/20 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.38)]',
    CRITICAL:
      'border-rose-400 bg-rose-500 text-black shadow-[0_0_22px_rgba(244,63,94,0.75)] animate-pulse',
    DATA_DEGRADED_MISSING_CHANNELS:
      'border-amber-400/60 bg-amber-950/50 text-amber-300',
  };
  return (
    <span
      role="status"
      data-alarm-level={level}
      title={level}
      className={`inline-flex min-h-11 items-center rounded-lg border px-3 font-mono text-xs font-bold tracking-wider uppercase ${cls[level]}`}
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
  const isLiveLock = link === 'ENGINE_LIVE' && wsConnected;
  const linkLabel =
    link === 'ENGINE_LIVE'
      ? wsConnected
        ? '20 HZ LOCK // WS LIVE'
        : 'ENGINE SNAPSHOT'
      : '20 HZ SIM // EDGE LOCAL';

  return (
    <header className="hud-glass relative z-20 flex flex-wrap items-center justify-between gap-3 border-x-0 border-t-0 border-b border-cyan-500/30 px-4 py-2 font-mono text-xs">
      {/* Luminous Bottom Horizon Hairline */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent"
      />

      {/* Brand Identity + Pulsing 20 Hz Telemetry Carrier Lock */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-5 w-1 rounded-full bg-cyan-400 shadow-[0_0_10px_#06b6d4]"
          />
          <span className="text-base font-bold tracking-[0.2em] text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.45)]">
            ARES-HEALTH
          </span>
        </div>

        <span className="rounded border border-slate-700/80 bg-slate-950/90 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-slate-200">
          {astronautId}
        </span>

        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider ${
            link === 'ENGINE_LIVE'
              ? 'border-emerald-500/45 bg-emerald-950/45 text-emerald-300'
              : 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300'
          }`}
        >
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span
              className={`telemetry-halo-live absolute inline-flex h-full w-full rounded-full ${
                isLiveLock ? 'bg-emerald-400' : 'bg-cyan-400'
              }`}
            />
            <span
              className={`telemetry-dot-live relative inline-flex h-2 w-2 rounded-full ${
                isLiveLock ? 'bg-emerald-400' : 'bg-cyan-400'
              }`}
            />
          </span>
          <span>{linkLabel}</span>
        </div>
      </div>

      {/* Illuminated Closed-Loop Phase Deck (GATHER -> EVALUATE -> ACT) */}
      <nav
        className="flex items-center gap-1.5 rounded-xl border border-cyan-500/25 bg-black/75 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        aria-label="Cockpit pages"
      >
        {phases.map((p, i) => {
          const isActive = p === activePhase;
          const isAlert = p === 'ACT' && recommendedPhase === 'ACT' && !isActive;
          return (
            <div key={p} className="flex items-center gap-1.5">
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectPhase(p)}
                className={`min-h-11 min-w-28 cursor-pointer rounded-lg border px-3.5 py-2 text-xs font-bold tracking-[0.12em] transition-all ${
                  isActive
                    ? 'border-cyan-300 bg-cyan-400 text-black shadow-[0_0_20px_rgba(6,182,212,0.6),inset_0_1px_0_rgba(255,255,255,0.65)]'
                    : isAlert
                      ? 'border-amber-400 bg-amber-500/15 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.35)] hover:bg-amber-500/25'
                      : 'border-transparent bg-transparent text-slate-400 hover:border-cyan-500/35 hover:bg-cyan-950/35 hover:text-slate-100'
                }`}
              >
                <span className={isActive ? 'text-black/70' : 'text-cyan-400/80'}>0{i + 1}</span>{' '}
                {p}
              </button>
              {i < 2 && <span className="px-0.5 text-[11px] font-bold text-slate-600">-&gt;</span>}
            </div>
          );
        })}
      </nav>

      {/* Deep-Space Telemetry Link & Mission Action Controls (>= 44x44pt targets) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-black/75 px-2.5 py-0.5">
          <select
            aria-label="Earth link profile"
            className="min-h-11 cursor-pointer bg-transparent pr-1 text-xs font-semibold text-slate-200 focus:outline-none"
            value={profile.id}
            onChange={(e) =>
              setProfile(LATENCY_PROFILES.find((p) => p.id === e.target.value) ?? LATENCY_PROFILES[1])
            }
          >
            {LATENCY_PROFILES.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-950 text-slate-100">
                {p.label}
              </option>
            ))}
          </select>
          <span className="h-4 w-px bg-slate-800" />
          <span
            className={
              Number.isFinite(profile.oneWayS)
                ? 'text-slate-300'
                : 'font-bold text-rose-400'
            }
          >
            OWLT {fmt(profile.oneWayS)}
          </span>
          <span className="h-4 w-px bg-slate-800" />
          <span className={`font-bold ${autonomous ? 'text-amber-400' : 'text-emerald-400'}`}>
            {autonomous ? 'ON-BOARD AUTONOMY' : 'GROUND LINK'}
          </span>
        </div>

        {onOpenPortal && (
          <button
            type="button"
            onClick={onOpenPortal}
            className="min-h-11 cursor-pointer rounded-lg border border-cyan-400/50 bg-cyan-950/40 px-3 text-xs font-bold tracking-wider text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.16)] transition-all hover:border-cyan-300 hover:bg-cyan-400 hover:text-black"
            title="Open Ground Control Telemedicine View & 24-Dataset Scientific Atlas"
          >
            GROUND PORTAL
          </button>
        )}
        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            className="min-h-11 cursor-pointer rounded-lg border border-slate-700 bg-slate-900/75 px-3 text-xs font-bold tracking-wider text-slate-200 transition-all hover:border-cyan-400/60 hover:text-white"
            title="OpenScreen Multi-Track Replay Studio"
          >
            STUDIO
          </button>
        )}
        {onOpenAudit && (
          <button
            type="button"
            onClick={onOpenAudit}
            className="min-h-11 cursor-pointer rounded-lg border border-emerald-400/50 bg-emerald-950/40 px-3 text-xs font-bold tracking-wider text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.16)] transition-all hover:border-emerald-300 hover:bg-emerald-400 hover:text-black"
            title="SHA-256 Medical Override Audit Chain"
          >
            AUDIT CHAIN
          </button>
        )}
        {onTogglePalette && (
          <button
            type="button"
            onClick={onTogglePalette}
            className="min-h-11 min-w-16 cursor-pointer rounded-lg border border-slate-700 bg-slate-950/90 px-3 text-xs font-bold text-cyan-300 transition-all hover:border-cyan-400 hover:text-cyan-200"
            title="Command Palette (Cmd+K / Alt+Space)"
          >
            CMD+K
          </button>
        )}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="min-h-11 min-w-11 cursor-pointer rounded-lg border border-slate-700 bg-slate-950/90 px-3 text-xs font-bold text-slate-300 transition-all hover:border-cyan-400 hover:text-white"
            title="Keyboard Shortcuts (?)"
          >
            ?
          </button>
        )}

        <AlarmBadge level={alarm} />
        <span className="tabular-nums text-slate-400">{now.toISOString().slice(11, 19)}Z</span>
      </div>
    </header>
  );
}
