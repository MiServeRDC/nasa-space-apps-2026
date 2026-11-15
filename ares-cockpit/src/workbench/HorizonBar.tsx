// Persistent `36px` Top Telemetry Horizon (`HorizonBar`).
// Mounted outside transition wrappers (`0` backdrop-filter to preserve the <= 4 blur-shell budget).
// Displays the interactive `01 GATHER -> 02 EVALUATE -> 03 ACT` spine, Crew/Subject selector,
// Transport & Freshness provenance, Issue #12 Epistemic Badge (`EMPIRICAL OBSERVED` vs `DELTA SIMULATED`),
// OWLT Mars autonomy clock, and 1-click triggers for Portal (`O`), Studio (`S`), Ledger (`L`),
// Voice (`V`), Shortcuts (`?`), and Command Palette (`CMD+K`).

import React from 'react';
import type { AlarmLevel, TelemetryPacket } from '../types/telemetry';
import type { PhaseMode } from '../types/workbench';
import type { TelemetryStatus } from '../lib/useTelemetry';
import type { TransportMode } from '../modules/os-shell/OsSystemStatusBar';
import { clinicalDataMode, clinicalSourceLabel } from '../lib/clinicalViewModel';
import { FreshnessBadge } from '../modules/provenance/ProvenanceInspector';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';

export interface HorizonBarProps {
  packet: TelemetryPacket;
  telemetryStatus: TelemetryStatus;
  transportMode: TransportMode;
  recommendedPhase?: PhaseMode;
  ipcLatencyUs?: number | null;
  availableSubjects?: readonly string[];
  onSelectSubject?: (astronautId: string) => void;
  onPhaseChange?: (phase: PhaseMode) => void;
}

const PHASE_STEPS: ReadonlyArray<{ id: PhaseMode; num: string; label: string; hotkey: string }> = [
  { id: 'GATHER', num: '01', label: 'GATHER', hotkey: 'G' },
  { id: 'EVALUATE', num: '02', label: 'EVALUATE', hotkey: 'E' },
  { id: 'ACT', num: '03', label: 'ACT', hotkey: 'A' },
];

const ALARM_PILL_STYLE: Readonly<Record<AlarmLevel, string>> = {
  NOMINAL: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300',
  ADVISORY: 'border-amber-400/50 bg-amber-500/10 text-amber-300',
  WARNING: 'border-amber-400/80 bg-amber-500/15 text-amber-200',
  CRITICAL: 'border-rose-500 bg-rose-500 text-black font-bold animate-pulse',
  DATA_DEGRADED_MISSING_CHANNELS: 'border-amber-400/60 bg-amber-500/10 text-amber-300',
};

export function HorizonBar({
  packet,
  telemetryStatus,
  transportMode,
  recommendedPhase,
  ipcLatencyUs = null,
  availableSubjects,
  onSelectSubject,
  onPhaseChange,
}: HorizonBarProps) {
  const phase = useWorkbenchStore((s) => s.phase);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const drawer = useWorkbenchStore((s) => s.drawer);
  const openDrawer = useWorkbenchStore((s) => s.openDrawer);
  const closeDrawer = useWorkbenchStore((s) => s.closeDrawer);
  const studioBarOpen = useWorkbenchStore((s) => s.studioBarOpen);
  const toggleStudioBar = useWorkbenchStore((s) => s.toggleStudioBar);
  const voiceListening = useWorkbenchStore((s) => s.voiceListening);
  const toggleVoiceListening = useWorkbenchStore((s) => s.toggleVoiceListening);
  const commandPaletteOpen = useWorkbenchStore((s) => s.commandPaletteOpen);
  const openCommandPalette = useWorkbenchStore((s) => s.openCommandPalette);
  const closeCommandPalette = useWorkbenchStore((s) => s.closeCommandPalette);
  const shortcutsModalOpen = useWorkbenchStore((s) => s.shortcutsModalOpen);
  const setShortcutsModalOpen = useWorkbenchStore((s) => s.setShortcutsModalOpen);

  const dataMode = clinicalDataMode(packet);
  const pureEmpirical = dataMode === 'BACKEND_REPLAY' || dataMode === 'BACKEND_HARDWARE';
  const freshness = telemetryStatus.isStale
    ? 'HELD_STALE'
    : telemetryStatus.heldSample
      ? 'HOLD_LAST_VALID'
      : 'FRESH';

  const sol = packet.mission_elapsed_days == null ? 'N/A' : Math.max(1, Math.round(packet.mission_elapsed_days));
  const nativeHz = packet.provenance_manifest.biometrics_native_rate_hz;
  const uiHz = packet.provenance_manifest.ui_refresh_rate_hz;
  const alarm = packet.safety_margins.alarm_level;

  const transportShort =
    transportMode === 'TAURI_NATIVE_IPC'
      ? `TAURI_BINARY_IPC${ipcLatencyUs !== null ? ` ${ipcLatencyUs}us` : ''}`
      : transportMode === 'BROWSER_WEBSOCKET'
        ? `WS_LOOPBACK_${uiHz.toFixed(0)}HZ`
        : 'OFFLINE_SIMULATION';

  const handleSelectPhase = (nextPhase: PhaseMode): void => {
    setPhase(nextPhase);
    onPhaseChange?.(nextPhase);
    announcePolite(`Active clinical phase switched to ${nextPhase}`);
  };

  return (
    <header
      role="banner"
      aria-label="ARES-Health Telemetry Horizon Bar"
      className="relative z-40 flex min-h-[36px] w-full flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#050608] px-3 py-1 select-none"
    >
      {/* Left: Brand Identity + Crew Subject + SOL + Transport Provenance */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="#main-workbench-scaffold"
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-sans text-xs font-bold tracking-wider text-[var(--color-ink-display)]"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 telemetry-dot-live" />
          <span>ARES-HEALTH</span>
        </a>

        {availableSubjects && availableSubjects.length > 0 && onSelectSubject ? (
          <select
            aria-label="Active astronaut or BIDMC replay subject"
            value={packet.astronaut_id}
            onChange={(e) => onSelectSubject(e.target.value)}
            className="rounded border border-white/10 bg-black px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-display)]"
          >
            {availableSubjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>
        ) : (
          <span className="ares-tabular-metric rounded border border-white/10 bg-black px-2 py-0.5 text-[11px] text-[var(--color-ink-display)]">
            {packet.astronaut_id}
          </span>
        )}

        <span className="ares-tabular-metric rounded border border-white/10 bg-black px-1.5 py-0.5 text-[10px] text-[var(--color-ink-body)]">
          SOL {sol}
        </span>

        <span className="ares-tabular-metric hidden rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200 xl:inline-block">
          {transportShort} | SRC {nativeHz.toFixed(0)}HZ
        </span>

        <FreshnessBadge freshness={freshness} ageMs={telemetryStatus.heldAgeMs} />
      </div>

      {/* Center: Interactive 01 GATHER -> 02 EVALUATE -> 03 ACT Spine */}
      <nav
        aria-label="Closed-loop medical workflow phases"
        className="flex items-center gap-1 rounded-lg border border-white/10 bg-black p-0.5"
      >
        {PHASE_STEPS.map((step) => {
          const isActive = phase === step.id;
          const isRecommended =
            recommendedPhase === step.id && !isActive && step.id === 'ACT';
          return (
            <button
              key={step.id}
              type="button"
              id={`horizon-phase-${step.id.toLowerCase()}`}
              aria-current={isActive ? 'step' : undefined}
              onClick={() => handleSelectPhase(step.id)}
              className={`ares-interactive inline-flex min-h-[28px] items-center gap-1.5 rounded-md px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider ${
                isActive
                  ? 'border border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : isRecommended
                    ? 'border border-rose-400/70 bg-rose-500/15 text-rose-200 animate-pulse'
                    : 'border border-transparent text-[var(--color-ink-meta)]'
              }`}
            >
              <span className="text-[10px] opacity-75">{step.num}</span>
              <span>{step.label}</span>
              <kbd className="hidden rounded bg-white/5 px-1 text-[9px] text-[var(--color-ink-muted)] sm:inline">
                {step.hotkey}
              </kbd>
            </button>
          );
        })}
      </nav>

      {/* Right: Epistemic Mode Badge (Issue #12) + OWLT + Drawer/Modal Triggers */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
        <span
          data-epistemic-mode={dataMode}
          className={`rounded border px-2 py-0.5 font-semibold tracking-wider ${
            pureEmpirical
              ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-400/60 bg-amber-500/15 text-amber-200'
          }`}
          title={
            pureEmpirical
              ? clinicalSourceLabel(packet)
              : 'Counterfactual What-If or hybrid scenario overlay active (ILLUSTRATIVE_UNVALIDATED)'
          }
        >
          {clinicalSourceLabel(packet)}
        </span>

        <span
          className="ares-tabular-metric hidden rounded border border-white/10 bg-black px-1.5 py-0.5 text-[var(--color-ink-meta)] lg:inline-block"
          title="Earth-Mars one-way light time requires 100% autonomous edge execution"
        >
          OWLT 14m 22s EIMO
        </span>

        <span className={`rounded border px-1.5 py-0.5 ${ALARM_PILL_STYLE[alarm]}`}>
          {alarm === 'DATA_DEGRADED_MISSING_CHANNELS' ? 'DEGRADED DATA' : alarm}
        </span>

        <button
          type="button"
          id="horizon-btn-portal"
          aria-pressed={drawer === 'MISSION_PORTAL'}
          onClick={() => {
            if (drawer === 'MISSION_PORTAL') closeDrawer();
            else openDrawer('MISSION_PORTAL', 'horizon-btn-portal');
          }}
          className="ares-interactive rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-body)]"
          title="Mission Portal & Privacy Role Governance (O)"
        >
          PORTAL [O]
        </button>

        <button
          type="button"
          id="horizon-btn-studio"
          aria-pressed={studioBarOpen}
          onClick={toggleStudioBar}
          className={`ares-interactive rounded border px-2 py-0.5 ${
            studioBarOpen
              ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
              : 'border-white/10 bg-black text-[var(--color-ink-body)]'
          }`}
          title="OpenScreenStudio Pitch Choreographer (S)"
        >
          STUDIO [S]
        </button>

        <button
          type="button"
          id="horizon-btn-audit"
          aria-pressed={drawer === 'AUDIT_PROVENANCE'}
          onClick={() => {
            if (drawer === 'AUDIT_PROVENANCE') closeDrawer();
            else openDrawer('AUDIT_PROVENANCE', 'horizon-btn-audit');
          }}
          className="ares-interactive rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-body)]"
          title="SHA-256 Audit Chain & Provenance Ledger (L)"
        >
          AUDIT [L]
        </button>

        <button
          type="button"
          id="horizon-btn-voice"
          aria-pressed={voiceListening}
          onClick={toggleVoiceListening}
          className={`ares-interactive rounded border px-2 py-0.5 ${
            voiceListening
              ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
              : 'border-white/10 bg-black text-[var(--color-ink-body)]'
          }`}
          title="Offline Voice Intent Router (V)"
        >
          VOICE [V]
        </button>

        <button
          type="button"
          id="horizon-btn-palette"
          aria-expanded={commandPaletteOpen}
          aria-haspopup="dialog"
          onClick={() => {
            if (commandPaletteOpen) closeCommandPalette(false);
            else openCommandPalette('COMMANDS', null, 'horizon-btn-palette');
          }}
          className="ares-interactive rounded border border-cyan-400/50 bg-cyan-500/10 px-2 py-0.5 font-semibold text-cyan-200"
          title="Multimodal Command & FastMCP Palette (Cmd+K / Alt+Space)"
        >
          CMD+K
        </button>

        <button
          type="button"
          id="horizon-btn-shortcuts"
          aria-label="Keyboard shortcuts reference"
          aria-expanded={shortcutsModalOpen}
          onClick={() => setShortcutsModalOpen(!shortcutsModalOpen, 'horizon-btn-shortcuts')}
          className="ares-interactive rounded border border-white/10 bg-black px-2 py-0.5 text-[var(--color-ink-meta)]"
        >
          ?
        </button>
      </div>
    </header>
  );
}
