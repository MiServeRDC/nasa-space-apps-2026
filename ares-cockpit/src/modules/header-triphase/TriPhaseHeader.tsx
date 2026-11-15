import { KeyboardIcon } from '@phosphor-icons/react';
import { CockpitSelect } from '../ui-primitives/CockpitControls';
import { useEffect, useState, type ReactNode } from 'react';
import type { AlarmLevel } from '../../types/telemetry';
import type { LinkState } from '../../lib/useTelemetry';

import { MISSION_PROFILES, formatMissionDelay, type MissionProfile } from '../../lib/missionContext';

export type Phase = 'GATHER' | 'EVALUATE' | 'ACT';

export function AlarmBadge({ level }: { level: AlarmLevel }) {
  const cls: Record<AlarmLevel, string> = {
    NOMINAL: 'border-ok text-ok',
    ADVISORY: 'border-advisory text-advisory',
    WARNING: 'border-warning text-warning',
    CRITICAL: 'border-critical bg-critical text-black animate-pulse',
    DATA_DEGRADED_MISSING_CHANNELS: 'border-advisory text-advisory',
  };
  const labels: Record<AlarmLevel, string> = {
    NOMINAL: 'Nominal', ADVISORY: 'Advisory', WARNING: 'Warning',
    CRITICAL: 'Critical', DATA_DEGRADED_MISSING_CHANNELS: 'Incomplete data',
  };
  return <span role="status" data-alarm-level={level} title={level} className={`alarm-badge rounded border px-2 py-1 font-bold ${cls[level]}`}>{labels[level]}</span>;
}

export function TriPhaseHeader({
  astronautId,
  recordedSourceId,
  profile,
  onSelectProfile,
  alarm,
  link,
  wsConnected,
  activePhase,
  recommendedPhase,
  onSelectPhase,
  onTogglePalette,
  provenance,
  onOpenAudit,
  onOpenShortcuts,
  onSwitchToNarrative,
}: {
  astronautId: string;
  recordedSourceId?: string;
  profile: MissionProfile;
  onSelectProfile: (profile: MissionProfile) => void;
  alarm: AlarmLevel;
  link: LinkState;
  wsConnected: boolean;
  activePhase: Phase;
  recommendedPhase: Phase;
  onSelectPhase: (p: Phase) => void;
  onTogglePalette?: () => void;
  provenance?: ReactNode;
  onOpenAudit?: () => void;
  onOpenShortcuts?: () => void;
  onSwitchToNarrative?: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const autonomous = profile.oneWayS === null || profile.oneWayS > 60;
  const phases: Phase[] = ['GATHER', 'EVALUATE', 'ACT'];
  const labels: Record<Phase, string> = { GATHER: 'Gather', EVALUATE: 'Evaluate', ACT: 'Act' };
  const titles: Record<Phase, string> = {
    GATHER: 'Health overview', EVALUATE: 'Anatomical assessment', ACT: 'Care & countermeasures',
  };
  const descriptions: Record<Phase, string> = {
    GATHER: 'Your measurements, their source, and what is available right now.',
    EVALUATE: 'Explore body systems and review the signals behind each assessment.',
    ACT: 'Review the selected playbook and its active safety protections.',
  };

  return (
    <header className="mission-header">
      <div className="mission-topline">
        <a href="#main-workspace" className="ares-wordmark" aria-label="ARES Health, skip to workspace">
          <svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M7 28 18 7l11 21M12 21h12M18 16v12M12 22l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>ares<span className="wordmark-health">health</span></span>
        </a>

      <nav className="phase-navigation" aria-label="Cockpit pages">
        {phases.map((p) => {
          const isActive = p === activePhase;
          const isAlert = p === 'ACT' && recommendedPhase === 'ACT' && !isActive;
          return (
            <div key={p}>
              <button
                type="button"
                onClick={() => onSelectPhase(p)}
                aria-current={isActive ? 'page' : undefined}
                className={`phase-button ${isActive ? 'is-active' : ''} ${isAlert ? 'needs-attention' : ''}`}
              >
                {labels[p]}
              </button>
            </div>
          );
        })}
      </nav>

        <div className="mission-identity"><span className="crew-avatar" aria-hidden="true">{astronautId.slice(-2)}</span><span>Crew member<strong title={recordedSourceId ? `BIDMC source: ${recordedSourceId}` : undefined}>{astronautId}</strong></span><button type="button" className="tools-button" onClick={onTogglePalette} aria-label="Open onboard tools">Tools <span aria-hidden="true">⌘ K</span></button></div>
      </div>
      <div className="mission-masthead">
        <div><h1>{titles[activePhase]}</h1><p>{descriptions[activePhase]}</p></div>
        <div className="mission-link-block">
          <div className="mission-actions" aria-label="Mission applications">
            {onSwitchToNarrative && (
              <button
                type="button"
                className="shortcuts-button text-sky-400 border border-sky-400/40 hover:bg-sky-950/40 font-mono text-xs"
                onClick={onSwitchToNarrative}
              >
                View: Narrative
              </button>
            )}
            {onOpenAudit && <button type="button" onClick={onOpenAudit}>Audit chain</button>}
            {onOpenShortcuts && <button type="button" className="shortcuts-button" aria-label="Keyboard shortcuts" onClick={onOpenShortcuts}><KeyboardIcon size={17} aria-hidden="true" /> Shortcuts</button>}
          </div>
          <div className="mission-connection"><span className={`connection-dot ${link === 'ENGINE_LIVE' ? 'is-live' : ''}`} /><span>{link === 'ENGINE_LIVE' ? (wsConnected ? 'Engine connected' : 'Engine snapshot') : 'Local simulation'}</span><span className="utc-clock">{now.toISOString().slice(11, 19)} UTC</span></div>
          <div className="mission-profile-row">
        <CockpitSelect
          aria-label="Mission profile"
          className="earth-profile-select"
          value={profile.id}
          onChange={(event) => {
            const selected = MISSION_PROFILES.find((item) => item.id === event.currentTarget.value);
            if (selected) onSelectProfile(selected);
          }}
        >
          {MISSION_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </CockpitSelect>
        <span className={profile.oneWayS === null ? 'font-bold text-warning' : 'text-gray-300'}>
          {profile.oneWayS === null ? 'Earth link unavailable' : `${formatMissionDelay(profile.oneWayS)} one way`}
          <small className="profile-demo-label">demo profile</small>
        </span>
        <AlarmBadge level={alarm} />
          </div>
          <span className="autonomy-label">{autonomous ? 'Onboard autonomy' : 'Ground link'}</span>
        </div>
      </div>
      {provenance}
    </header>
  );
}
