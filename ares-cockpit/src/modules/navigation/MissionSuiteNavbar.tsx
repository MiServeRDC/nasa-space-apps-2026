// Top-level navigation bar for ARES-Health Connected Mission Suite.
// Modes: VIEW_COCKPIT, VIEW_PORTAL, VIEW_TWIN, VIEW_STUDIO.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import type { CrewSex } from '../../lib/scenario';
import type { AlarmLevel } from '../../types/telemetry';
import type { LinkState } from '../../lib/useTelemetry';

export type ViewMode = 'VIEW_COCKPIT' | 'VIEW_PORTAL' | 'VIEW_TWIN' | 'VIEW_STUDIO';
export type MissionViewMode = ViewMode;

export interface NavViewItem {
  id: ViewMode;
  shortcut: string;
  label: string;
  subtitle: string;
}

export const NAV_VIEWS: NavViewItem[] = [
  {
    id: 'VIEW_COCKPIT',
    shortcut: '1',
    label: 'COCKPIT',
    subtitle: 'Tactical 20 Hz Flight HUD',
  },
  {
    id: 'VIEW_PORTAL',
    shortcut: '2',
    label: 'GROUND PORTAL',
    subtitle: 'Telemedicine & Evidence Atlas',
  },
  {
    id: 'VIEW_TWIN',
    shortcut: '3',
    label: '3D TWIN',
    subtitle: 'Biodigital Twin Viewport',
  },
  {
    id: 'VIEW_STUDIO',
    shortcut: '4',
    label: 'STUDIO',
    subtitle: 'OpenScreen Playback & Zoom',
  },
];

interface MissionSuiteNavbarProps {
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  astronautId: string;
  sex: CrewSex;
  onChangeSex: (sex: CrewSex) => void;
  alarmLevel: AlarmLevel;
  link: LinkState;
  wsConnected: boolean;
  onOpenShortcuts: () => void;
}

export function MissionSuiteNavbar({
  activeView,
  onSelectView,
  astronautId,
  sex,
  onChangeSex,
  alarmLevel,
  link,
  wsConnected,
  onOpenShortcuts,
}: MissionSuiteNavbarProps) {
  const alarmCls: Record<AlarmLevel, string> = {
    NOMINAL: 'border-ok text-ok',
    ADVISORY: 'border-advisory text-advisory',
    WARNING: 'border-warning text-warning',
    CRITICAL: 'border-critical bg-critical text-black animate-pulse',
    DATA_DEGRADED_MISSING_CHANNELS: 'border-advisory text-advisory',
  };

  const linkLabel =
    link === 'ENGINE_LIVE'
      ? wsConnected
        ? 'LIVE WS 20 Hz'
        : 'HTTP POLL 5 Hz'
      : 'OFFLINE REPLAY';

  const linkColor =
    link === 'ENGINE_LIVE' ? 'text-nominal border-nominal/60' : 'text-gray-400 border-line';

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-black px-4 py-2 font-mono text-xs select-none"
      aria-label="Mission Suite Navigation"
    >
      {/* Brand & Mission Identification */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-nominal animate-ping" />
          <span className="text-sm font-bold tracking-widest text-nominal">ARES-HEALTH</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 border-l border-line pl-3 text-gray-400">
          <span className="text-[10px] text-gray-500">CREW:</span>
          <span className="text-gray-200 font-semibold">{astronautId}</span>
        </div>
      </div>

      {/* Primary Mode Switcher (1-4) */}
      <div className="flex items-center gap-1 sm:gap-2" role="tablist" aria-label="Suite Views">
        {NAV_VIEWS.map((v) => {
          const isActive = activeView === v.id;
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onSelectView(v.id)}
              className={`group relative flex items-center gap-1.5 rounded border px-2.5 py-1.5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-nominal focus-visible:ring-offset-2 focus-visible:ring-offset-black cursor-pointer ${
                isActive
                  ? 'border-nominal bg-nominal/15 text-nominal font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                  : 'border-line text-gray-400 hover:border-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <kbd className="hidden sm:inline-block rounded bg-panel px-1 text-[10px] text-gray-400 border border-line">
                {v.shortcut}
              </kbd>
              <span className="text-xs">{v.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Controls: Biological Sex Switcher, Link Badge, Alarm, Help Button */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Sex profile switcher (M/F) */}
        <div className="flex items-center gap-1 rounded border border-line bg-panel p-0.5">
          <span className="px-1.5 text-[10px] text-gray-500">SEX:</span>
          {(['MALE', 'FEMALE'] as const).map((s) => {
            const isSelected = sex === s;
            const activeStyle =
              s === 'MALE'
                ? 'bg-sky-400 font-bold text-black'
                : 'bg-fuchsia-400 font-bold text-black';
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChangeSex(s)}
                className={`cursor-pointer rounded px-2 py-0.5 text-[10px] transition-colors ${
                  isSelected ? activeStyle : 'text-gray-400 hover:text-white'
                }`}
                title={`Switch profile to ${s} (Hotkeys: M / F)`}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* Link Status Pill */}
        <div className={`hidden md:flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] ${linkColor}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-nominal" />
          <span>{linkLabel}</span>
        </div>

        {/* Alarm State Badge */}
        <div className={`rounded border px-2 py-0.5 text-[10px] font-bold ${alarmCls[alarmLevel]}`}>
          {alarmLevel}
        </div>

        {/* Keyboard Shortcuts Trigger Button */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="cursor-pointer rounded border border-line bg-panel px-2 py-1 text-gray-300 hover:border-nominal hover:text-nominal transition-colors outline-none focus-visible:ring-2 focus-visible:ring-nominal focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          title="Open keyboard shortcuts help (?)"
          aria-label="Open keyboard shortcuts modal"
        >
          <kbd className="font-bold text-nominal">?</kbd>
        </button>
      </div>
    </nav>
  );
}
