// Greenfield-upgraded Tri-Phase Mission Horizon Bridge (`TriPhaseHeader`).
// Preserves 100% compatibility with `App.tsx` and `tests/phase36_m2.test.ts` while adopting
// the pure `#000000` / `#050608` OLED Horizon visual architecture, zero-CLS `.ares-tabular-metric`,
// pure ASCII keycaps (`CMD+K`), and NotebookLM Risk 5 hysteresis announcements (`a11yAnnouncer.ts`).

import { useEffect, useState } from 'react';
import type { AlarmLevel } from '../../types/telemetry';
import type { LinkState } from '../../lib/useTelemetry';
import {
  announceAlarmTransition,
  announcePolite,
} from '../../stores/a11yAnnouncer';

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
    NOMINAL: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300',
    ADVISORY: 'border-amber-400/50 bg-amber-500/10 text-amber-300',
    WARNING: 'border-amber-400/80 bg-amber-500/15 text-amber-200',
    CRITICAL: 'border-rose-500 bg-rose-500 text-black animate-pulse',
    DATA_DEGRADED_MISSING_CHANNELS: 'border-amber-400/60 bg-amber-500/10 text-amber-300',
  };
  const labels: Record<AlarmLevel, string> = {
    NOMINAL: 'Nominal',
    ADVISORY: 'Advisory',
    WARNING: 'Warning',
    CRITICAL: 'Critical',
    DATA_DEGRADED_MISSING_CHANNELS: 'Incomplete data',
  };
  return (
    <span
      data-alarm-level={level}
      title={level}
      className={`alarm-badge inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${cls[level]}`}
    >
      {labels[level]}
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
  onTogglePalette,
  onOpenAudit,
  onOpenPortal,
  onOpenStudio,
  onOpenShortcuts,
}: {
  astronautId: string;
  alarm: AlarmLevel;
  link: LinkState;
  wsConnected: boolean;
  activePhase: Phase;
  recommendedPhase: Phase;
  onSelectPhase: (p: Phase) => void;
  onTogglePalette?: () => void;
  onOpenAudit?: () => void;
  onOpenPortal?: () => void;
  onOpenStudio?: () => void;
  onOpenShortcuts?: () => void;
}) {
  const [profile, setProfile] = useState<Profile>(LATENCY_PROFILES[1]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // NotebookLM Risk 5: Route alarm severity changes through hysteresis live-region dispatcher
  useEffect(() => {
    announceAlarmTransition(
      'triphase_header_alarm',
      alarm,
      `Crew ${astronautId} alarm status changed to ${alarm}.`,
    );
  }, [alarm, astronautId]);

  const autonomous = profile.oneWayS > 60;
  const phases: Phase[] = ['GATHER', 'EVALUATE', 'ACT'];
  const labels: Record<Phase, string> = {
    GATHER: 'Overview',
    EVALUATE: 'Assessment',
    ACT: 'Care plan',
  };
  const titles: Record<Phase, string> = {
    GATHER: 'Health overview',
    EVALUATE: 'Anatomical assessment',
    ACT: 'Care & countermeasures',
  };

  return (
    <header className="mission-header border-b border-white/10 bg-[#050608] px-3 py-1.5 text-[var(--color-ink-display)]">
      <div className="mission-topline flex flex-wrap items-center justify-between gap-2">
        <a
          href="#main-workspace"
          className="ares-wordmark inline-flex items-center gap-2 font-sans text-xs font-bold tracking-wider text-[var(--color-ink-display)]"
          aria-label="ARES Health, skip to workspace"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 telemetry-dot-live" />
          <span>
            ARES<span className="wordmark-health text-cyan-300">-HEALTH</span>
          </span>
        </a>

        <nav
          className="phase-navigation flex items-center gap-1 rounded-lg border border-white/10 bg-black p-0.5"
          aria-label="Cockpit pages"
        >
          {phases.map((p, i) => {
            const isActive = p === activePhase;
            const isAlert = p === 'ACT' && recommendedPhase === 'ACT' && !isActive;
            return (
              <div key={p}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectPhase(p);
                    announcePolite(`Switched medical phase to ${p}: ${titles[p]}`);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`phase-button ares-interactive inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider ${
                    isActive
                      ? 'is-active border border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                      : isAlert
                        ? 'needs-attention border border-rose-500/70 bg-rose-500/15 text-rose-200 animate-pulse'
                        : 'border border-transparent text-[var(--color-ink-meta)]'
                  }`}
                >
                  <span className="phase-step text-[10px] opacity-75">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>
                    {p}{' '}
                    <small className="hidden text-[9px] font-normal opacity-75 sm:inline">
                      ({labels[p]})
                    </small>
                  </span>
                </button>
              </div>
            );
          })}
        </nav>

        <div className="mission-identity flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <span className="ares-tabular-metric rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-display)]">
            {astronautId}
          </span>

          <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-meta)]">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                link === 'ENGINE_LIVE' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              {link === 'ENGINE_LIVE'
                ? wsConnected
                  ? 'ENGINE LIVE'
                  : 'ENGINE SNAPSHOT'
                : 'LOCAL SIM'}
            </span>
            <span aria-live="off" className="ares-tabular-metric text-[var(--color-ink-muted)]">
              {now.toISOString().slice(11, 19)}Z
            </span>
          </span>

          <select
            aria-label="Earth link profile"
            className="earth-profile-select rounded border border-white/10 bg-black px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-ink-body)]"
            value={profile.id}
            onChange={(e) =>
              setProfile(
                LATENCY_PROFILES.find((p) => p.id === e.target.value) ??
                  LATENCY_PROFILES[1],
              )
            }
          >
            {LATENCY_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <span
            className={`ares-tabular-metric rounded border border-white/10 bg-black px-1.5 py-0.5 ${
              Number.isFinite(profile.oneWayS) ? 'text-[var(--color-ink-body)]' : 'font-bold text-rose-300'
            }`}
            title="Demonstration Earth-link profile; not measured network latency"
          >
            OWLT {fmt(profile.oneWayS)} ({autonomous ? 'EIMO' : 'GROUND'})
          </span>

          <AlarmBadge level={alarm} />

          {onOpenPortal ? (
            <button
              type="button"
              onClick={onOpenPortal}
              className="ares-interactive rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-body)]"
            >
              PORTAL [O]
            </button>
          ) : null}

          {onOpenStudio ? (
            <button
              type="button"
              onClick={onOpenStudio}
              className="ares-interactive rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-body)]"
            >
              STUDIO [S]
            </button>
          ) : null}

          {onOpenAudit ? (
            <button
              type="button"
              onClick={onOpenAudit}
              className="ares-interactive rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-body)]"
            >
              AUDIT [L]
            </button>
          ) : null}

          {onTogglePalette ? (
            <button
              type="button"
              onClick={onTogglePalette}
              aria-label="Open onboard tools"
              className="tools-button ares-interactive rounded border border-cyan-400/50 bg-cyan-500/10 px-2 py-0.5 font-semibold text-cyan-200"
            >
              TOOLS CMD+K
            </button>
          ) : null}

          {onOpenShortcuts ? (
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              onClick={onOpenShortcuts}
              className="ares-interactive rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-meta)]"
            >
              ?
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
