// Persistent `36px` Top Telemetry Horizon (`HorizonBar`).
// Mounted outside transition wrappers (`0` backdrop-filter to preserve the <= 4 blur-shell budget).
// Displays the interactive `01 GATHER -> 02 EVALUATE -> 03 ACT` spine, Crew/Subject selector,
// Transport & Freshness provenance, Issue #12 Epistemic Badge (`EMPIRICAL OBSERVED` vs `DELTA SIMULATED`),
// OWLT Mars autonomy clock, and 1-click triggers for Portal (`O`), Studio (`S`), Ledger (`L`),
// Voice (`V`), Shortcuts (`?`), and Command Palette (`CMD+K`).

import React, { useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import type { AlarmLevel, CrewBiologicalProfile, TelemetryPacket } from '../types/telemetry';
import type { PhaseMode } from '../types/workbench';
import type { TelemetryStatus } from '../lib/useTelemetry';
import type { TransportMode } from '../modules/os-shell/OsSystemStatusBar';
import { clinicalDataMode, clinicalSourceLabel } from '../lib/clinicalViewModel';
import { SEX_PROFILES } from '../lib/scenario';
import { useDesktopViewport } from '../lib/useDesktopViewport';
import { FreshnessBadge } from '../modules/provenance/ProvenanceInspector';
import { NumberTicker } from '../components/magicui/number-ticker';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';

const MOBILE_MENU_TRIGGER_ID = 'horizon-mobile-menu-trigger';

export interface HorizonBarProps {
  packet: TelemetryPacket;
  telemetryStatus: TelemetryStatus;
  transportMode: TransportMode;
  recommendedPhase?: PhaseMode;
  ipcLatencyUs?: number | null;
  availableSubjects?: readonly string[];
  onSelectSubject?: (astronautId: string) => void;
  onPhaseChange?: (phase: PhaseMode) => void;
  onSexChange?: (sex: 'MALE' | 'FEMALE') => void;
  crewProfile?: CrewBiologicalProfile | null;
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
  onSexChange,
  crewProfile,
}: HorizonBarProps) {
  const phase = useWorkbenchStore((s) => s.phase);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const twinSex = useWorkbenchStore((s) => s.twinSex);
  const setTwinSex = useWorkbenchStore((s) => s.setTwinSex);
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
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const isDesktop = useDesktopViewport();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pendingSheetActionRef = useRef<(() => void) | null>(null);

  const resolvedCrewProfile = crewProfile ?? packet.aerospace_360?.crew_profile ?? null;
  const sexProfile = SEX_PROFILES[twinSex];
  const mriScore =
    typeof packet.safety_margins.mission_readiness_index === 'number' &&
    Number.isFinite(packet.safety_margins.mission_readiness_index)
      ? Math.round(packet.safety_margins.mission_readiness_index)
      : null;
  const predicateViolations = Object.values(packet.safety_margins.per_predicate_rho ?? {}).filter(
    (rho): rho is number => typeof rho === 'number' && Number.isFinite(rho) && rho < 0,
  ).length;
  const activeAlarmCount = Math.max(
    predicateViolations,
    packet.safety_margins.alarm_level === 'NOMINAL' ? 0 : 1,
  );
  const owltSec = 22;

  const handleSelectSex = (nextSex: 'MALE' | 'FEMALE'): void => {
    setTwinSex(nextSex);
    onSexChange?.(nextSex);
    announcePolite(`Biological anthropometric baseline set to ${nextSex}.`);
  };

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

  const sourceLabel = clinicalSourceLabel(packet);
  const phaseTooltips: Readonly<Record<PhaseMode, string>> = {
    GATHER: '01 GATHER [G]: Raw telemetry, cabin atmosphere, radiation & signal quality index',
    EVALUATE: '02 EVALUATE [E]: Readiness (MRI), global robustness, predicates & causal safety margins',
    ACT: '03 ACT [A]: Guided clinical countermeasure playbooks & anatomical target gates',
  };

  // Phase E: `< 1024px` collapses secondary horizon controls into a shadcn Sheet so the
  // sticky 44px flight-deck bar never overflows a 390px viewport. Element IDs stay unique
  // because each control is rendered in exactly one place for the active layout.
  const isSheet = !isDesktop;
  const focusOrigin = (desktopId: string): string => (isDesktop ? desktopId : MOBILE_MENU_TRIGGER_ID);
  const runToolAction = (action: () => void): void => {
    if (!isSheet) {
      action();
      return;
    }
    // Defer drawer/modal activation until the Sheet focus scope has released focus.
    pendingSheetActionRef.current = action;
    setMobileMenuOpen(false);
  };
  const sheetButtonClass = isSheet
    ? ' inline-flex min-h-12 w-full items-center justify-center gap-1 text-[11px]'
    : '';

  const brandLink = (
    <a
      href="#main-workbench-scaffold"
      className={`inline-flex items-center gap-1 rounded px-1 py-0.5 font-sans text-[11px] font-bold tracking-wider text-[var(--color-ink-display)]${
        isSheet ? ' min-h-12 min-w-12 shrink-0' : ''
      }`}
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-cyan-400 telemetry-dot-live" />
      <span>
        ARES<span className="hidden xl:inline">-HEALTH</span>
      </span>
    </a>
  );

  const subjectControl =
    availableSubjects && availableSubjects.length > 0 && onSelectSubject ? (
      <select
        aria-label="Active astronaut or BIDMC replay subject"
        value={packet.astronaut_id}
        onChange={(e) => onSelectSubject(e.target.value)}
        className={`truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1 py-0.5 font-mono text-[9.5px] text-[var(--color-ink-display)] ${
          isSheet ? 'w-full text-[11px]' : 'max-w-[96px] xl:max-w-[116px]'
        }`}
      >
        {availableSubjects.map((subj) => (
          <option key={subj} value={subj}>
            {subj}
          </option>
        ))}
      </select>
    ) : (
      <span className="ares-tabular-metric max-w-[96px] truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1 py-0.5 text-[9.5px] text-[var(--color-ink-display)] xl:max-w-[116px]">
        {packet.astronaut_id}
      </span>
    );

  const solBadge = (
    <span className="ares-tabular-metric rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1 py-0.5 text-[9.5px] text-[var(--color-ink-body)]">
      SOL {sol}
    </span>
  );

  const transportBadge = (
    <span
      className={`ares-tabular-metric rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9.5px] text-cyan-200 ${
        isSheet ? 'inline-block' : 'hidden 2xl:inline-block'
      }`}
    >
      {transportShort} | SRC {nativeHz.toFixed(0)}HZ
    </span>
  );

  const freshnessControl = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center">
          <FreshnessBadge freshness={freshness} ageMs={telemetryStatus.heldAgeMs} />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-mono text-[10px]">
          {transportShort} · SRC {nativeHz.toFixed(0)} Hz · Freshness {freshness}
        </p>
      </TooltipContent>
    </Tooltip>
  );

  const phaseNav = (
    <nav
      aria-label="Closed-loop medical workflow phases"
      className={
        isSheet
          ? 'grid grid-cols-3 gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-1'
          : 'flex shrink-0 items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-0.5'
      }
    >
      {PHASE_STEPS.map((step) => {
        const isActive = phase === step.id;
        const isRecommended = recommendedPhase === step.id && !isActive && step.id === 'ACT';
        return (
          <Tooltip key={step.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                id={`horizon-phase-${step.id.toLowerCase()}`}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => {
                  handleSelectPhase(step.id);
                  if (isSheet) setMobileMenuOpen(false);
                }}
                className={`ares-interactive inline-flex min-h-[24px] items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide ${
                  isActive
                    ? 'border border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                    : isRecommended
                      ? 'border border-rose-400/70 bg-rose-500/15 text-rose-200 animate-pulse'
                      : 'border border-transparent text-[var(--color-ink-meta)]'
                }${isSheet ? ' min-h-12 justify-center text-[10.5px]' : ''}`}
              >
                <span className="text-[8.5px] opacity-75">{step.num}</span>
                <span>{step.label}</span>
                <kbd className="hidden rounded bg-white/5 px-1 text-[8.5px] text-[var(--color-ink-muted)] sm:inline">
                  {step.hotkey}
                </kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent>{phaseTooltips[step.id]}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );

  const epistemicBadge = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-epistemic-mode={dataMode}
          className={`cursor-help rounded border px-1 py-0.5 text-[9px] font-semibold tracking-normal ${
            pureEmpirical
              ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-400/60 bg-amber-500/15 text-amber-200'
          }${isSheet ? ' min-w-0 truncate' : ''}`}
        >
          {sourceLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {pureEmpirical
          ? `${sourceLabel} — Empirical recorded or hardware telemetry channel`
          : 'Counterfactual What-If or hybrid scenario overlay active (ILLUSTRATIVE_UNVALIDATED)'}
      </TooltipContent>
    </Tooltip>
  );

  const sexControls = (
    <div className={`relative flex items-center gap-0.5${isSheet ? ' flex-wrap gap-1.5' : ''}`}>
      <div
        role="group"
        aria-label="Crew biological sex profile"
        data-testid="horizon-sex-switcher"
        className="inline-flex items-center rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-0.5 text-[9px]"
      >
        {(['MALE', 'FEMALE'] as const).map((sexOpt) => {
          const active = twinSex === sexOpt;
          return (
            <button
              key={sexOpt}
              type="button"
              aria-pressed={active}
              data-testid={`horizon-sex-${sexOpt.toLowerCase()}`}
              onClick={() => handleSelectSex(sexOpt)}
              className={`ares-interactive rounded px-1.5 py-0.5 font-semibold ${
                active
                  ? 'border border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border border-transparent text-[var(--color-ink-meta)]'
              }${isSheet ? ' text-[11px]' : ''}`}
            >
              {sexOpt === 'MALE' ? 'Male' : 'Female'}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        id="horizon-btn-bio-profile"
        data-testid="horizon-bio-profile-trigger"
        aria-expanded={profilePopoverOpen}
        aria-haspopup="dialog"
        onClick={() => setProfilePopoverOpen((prev) => !prev)}
        className={`ares-interactive rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
          profilePopoverOpen
            ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
            : 'border-[var(--color-border)] bg-[var(--color-surface-l1)] text-[var(--color-ink-meta)]'
        }${isSheet ? ' text-[11px]' : ''}`}
      >
        BIO
      </button>

      {profilePopoverOpen ? (
        <div
          role="dialog"
          aria-label="Crew Biological Profile & Anthropometric Modifiers"
          data-testid="horizon-bio-profile-popover"
          className={`z-50 whitespace-normal rounded-[var(--radius-shell)] border border-[var(--color-border-active)] bg-[var(--color-surface-l1)] p-2.5 font-mono text-[10px] text-[var(--color-ink-body)] shadow-xl ${
            isSheet ? 'mt-1.5 w-full basis-full' : 'absolute top-full right-0 mt-1.5 w-72'
          }`}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
            <span className="font-semibold text-[var(--color-ink-display)]">
              CrewBiologicalProfile ({twinSex})
            </span>
            <button
              type="button"
              onClick={() => setProfilePopoverOpen(false)}
              className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-meta)]"
            >
              CLOSE
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[9.5px]">
            <dt className="text-[var(--color-ink-meta)]">Phase / Regimen</dt>
            <dd className="text-right text-[var(--color-ink-display)]">
              {resolvedCrewProfile?.contraceptive_regimen ?? 'Not reported'}
            </dd>
            <dt className="text-[var(--color-ink-meta)]">Mass / Height</dt>
            <dd className="ares-tabular-metric text-right text-[var(--color-ink-display)]">
              {resolvedCrewProfile
                ? `${resolvedCrewProfile.body_mass_kg.toFixed(1)} kg / ${resolvedCrewProfile.height_cm.toFixed(0)} cm`
                : 'Illustrative ref'}
            </dd>
            <dt className="text-[var(--color-ink-meta)]">Hct / Hgb</dt>
            <dd className="ares-tabular-metric text-right text-[var(--color-ink-display)]">
              {resolvedCrewProfile?.baseline_hematocrit_pct != null &&
              resolvedCrewProfile?.baseline_hemoglobin_g_dl != null
                ? `${resolvedCrewProfile.baseline_hematocrit_pct.toFixed(1)}% / ${resolvedCrewProfile.baseline_hemoglobin_g_dl.toFixed(1)} g/dL`
                : 'Unavailable'}
            </dd>
            <dt className="text-[var(--color-ink-meta)]">QTc / G6PD</dt>
            <dd className="ares-tabular-metric text-right text-[var(--color-ink-display)]">
              {resolvedCrewProfile?.baseline_qtc_ms != null
                ? `${resolvedCrewProfile.baseline_qtc_ms.toFixed(0)} ms · ${resolvedCrewProfile.g6pd_deficient ? 'G6PD-' : 'G6PD+'}`
                : 'Nominal ref'}
            </dd>
            <dt className="text-[var(--color-ink-meta)]">LBNP SBP Sens</dt>
            <dd className="ares-tabular-metric text-right text-cyan-200">
              {sexProfile.lbnpSbpSens.toFixed(2)}x ({sexProfile.sbpBase}/{sexProfile.hrBase})
            </dd>
            <dt className="text-[var(--color-ink-meta)]">IJV / ONSD Nom</dt>
            <dd className="ares-tabular-metric text-right text-cyan-200">
              {sexProfile.ijvBaseCsa.toFixed(2)} cm2 / {sexProfile.onsdNominal.toFixed(1)} mm
            </dd>
          </dl>
          {resolvedCrewProfile && resolvedCrewProfile.drug_allergies.length > 0 ? (
            <p className="mt-1.5 rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-1 text-[9px] text-amber-200">
              Allergies: {resolvedCrewProfile.drug_allergies.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const owltBadge = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`ares-tabular-metric cursor-help rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1 py-0.5 text-[9px] text-[var(--color-ink-meta)] ${
            isSheet ? 'inline-block' : 'hidden lg:inline-block'
          }`}
        >
          OWLT 14m <NumberTicker value={owltSec} padStart={2} suffix="s" />
          <span className="hidden 2xl:inline"> EIMO</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        OWLT 14m 22s EIMO — Earth-Mars one-way light time requires 100% autonomous edge execution
      </TooltipContent>
    </Tooltip>
  );

  const mriBadge = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`ares-tabular-metric cursor-help rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1 py-0.5 text-[9px] text-cyan-200 ${
            isSheet ? 'inline-block' : 'hidden xl:inline-block'
          }`}
        >
          MRI <NumberTicker value={mriScore} suffix="%" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Discrete clinical Mission Readiness Index (0-100)</TooltipContent>
    </Tooltip>
  );

  const alarmPill = (
    <span className={`shrink-0 whitespace-nowrap rounded border px-1 py-0.5 text-[9px] ${ALARM_PILL_STYLE[alarm]}`}>
      {alarm === 'DATA_DEGRADED_MISSING_CHANNELS' ? 'DEGRADED' : alarm}{' '}
      (<NumberTicker value={activeAlarmCount} className="text-inherit" />)
    </span>
  );

  const toolButtons = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            id="horizon-btn-portal"
            aria-pressed={drawer === 'MISSION_PORTAL'}
            onClick={() =>
              runToolAction(() => {
                if (drawer === 'MISSION_PORTAL') closeDrawer();
                else openDrawer('MISSION_PORTAL', focusOrigin('horizon-btn-portal'));
              })
            }
            className={`ares-interactive rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1 py-0.5 text-[9px] text-[var(--color-ink-body)]${sheetButtonClass}`}
          >
            PORTAL <kbd className="hidden xl:inline text-[8.5px] text-[var(--color-ink-muted)]">[O]</kbd>
          </button>
        </TooltipTrigger>
        <TooltipContent>Mission Portal & Privacy Role Governance (O)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            id="horizon-btn-studio"
            aria-pressed={studioBarOpen}
            onClick={() => runToolAction(toggleStudioBar)}
            className={`ares-interactive rounded border px-1 py-0.5 text-[9px] ${
              studioBarOpen
                ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface-l1)] text-[var(--color-ink-body)]'
            }${sheetButtonClass}`}
          >
            STUDIO <kbd className="hidden xl:inline text-[8.5px] opacity-75">[S]</kbd>
          </button>
        </TooltipTrigger>
        <TooltipContent>OpenScreenStudio Pitch Choreographer (S)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            id="horizon-btn-audit"
            aria-pressed={drawer === 'AUDIT_PROVENANCE'}
            onClick={() =>
              runToolAction(() => {
                if (drawer === 'AUDIT_PROVENANCE') closeDrawer();
                else openDrawer('AUDIT_PROVENANCE', focusOrigin('horizon-btn-audit'));
              })
            }
            className={`ares-interactive rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1 py-0.5 text-[9px] text-[var(--color-ink-body)]${sheetButtonClass}`}
          >
            AUDIT <kbd className="hidden xl:inline text-[8.5px] text-[var(--color-ink-muted)]">[L]</kbd>
          </button>
        </TooltipTrigger>
        <TooltipContent>SHA-256 Audit Chain & Provenance Ledger (L)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            id="horizon-btn-voice"
            aria-pressed={voiceListening}
            onClick={() => runToolAction(toggleVoiceListening)}
            className={`ares-interactive rounded border px-1 py-0.5 text-[9px] ${
              voiceListening
                ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface-l1)] text-[var(--color-ink-body)]'
            }${sheetButtonClass}`}
          >
            VOICE <kbd className="hidden xl:inline text-[8.5px] opacity-75">[V]</kbd>
          </button>
        </TooltipTrigger>
        <TooltipContent>Offline Voice Intent Router (V)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            id="horizon-btn-palette"
            aria-expanded={commandPaletteOpen}
            aria-haspopup="dialog"
            onClick={() =>
              runToolAction(() => {
                if (commandPaletteOpen) closeCommandPalette(false);
                else openCommandPalette('COMMANDS', null, focusOrigin('horizon-btn-palette'));
              })
            }
            className={`ares-interactive rounded border border-cyan-400/50 bg-cyan-500/10 px-1 py-0.5 text-[9px] font-semibold text-cyan-200${sheetButtonClass}`}
          >
            CMD+K
          </button>
        </TooltipTrigger>
        <TooltipContent>Multimodal Command & FastMCP Palette (Cmd+K / Alt+Space)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            id="horizon-btn-shortcuts"
            aria-label="Keyboard shortcuts reference"
            aria-expanded={shortcutsModalOpen}
            onClick={() =>
              runToolAction(() =>
                setShortcutsModalOpen(!shortcutsModalOpen, focusOrigin('horizon-btn-shortcuts')),
              )
            }
            className={`ares-interactive rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-meta)]${sheetButtonClass}`}
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent>Keyboard Shortcuts Reference (?)</TooltipContent>
      </Tooltip>
    </>
  );

  if (isSheet) {
    return (
      <TooltipProvider delayDuration={180}>
        <header
          role="banner"
          aria-label="ARES-Health Telemetry Horizon Bar"
          data-horizon-layout="mobile"
          className="ares-horizon-mobile sticky top-0 z-40 flex h-[44px] w-full flex-nowrap items-center justify-between gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-void)] px-2 select-none"
        >
          {brandLink}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden font-mono text-[9.5px]">
            {epistemicBadge}
            {alarmPill}
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                id={MOBILE_MENU_TRIGGER_ID}
                aria-label={`Open cockpit controls (phase ${phase})`}
                className="ares-interactive inline-flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] text-[var(--color-ink-display)]"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              data-horizon-sheet
              className="w-[88vw] max-w-[360px] overflow-y-auto"
              onCloseAutoFocus={(event: Event) => {
                const pending = pendingSheetActionRef.current;
                if (pending) {
                  pendingSheetActionRef.current = null;
                  event.preventDefault();
                  pending();
                }
              }}
            >
              <SheetHeader>
                <SheetTitle className="font-mono text-[12px] tracking-wider">COCKPIT CONTROLS</SheetTitle>
                <SheetDescription className="font-mono text-[10px] text-[var(--color-ink-meta)]">
                  Workflow phase, crew profile, provenance and tools.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 font-mono text-[10px]">
                <section aria-label="Workflow phase" className="flex flex-col gap-1.5">
                  <h3 className="text-[9.5px] tracking-wider text-[var(--color-ink-meta)]">WORKFLOW PHASE</h3>
                  {phaseNav}
                </section>
                <section aria-label="Session provenance" className="flex flex-col gap-1.5">
                  <h3 className="text-[9.5px] tracking-wider text-[var(--color-ink-meta)]">SESSION</h3>
                  {subjectControl}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {solBadge}
                    {freshnessControl}
                    {owltBadge}
                    {mriBadge}
                  </div>
                  {transportBadge}
                </section>
                <section aria-label="Crew biological profile" className="flex flex-col gap-1.5">
                  <h3 className="text-[9.5px] tracking-wider text-[var(--color-ink-meta)]">CREW PROFILE</h3>
                  {sexControls}
                </section>
                <section aria-label="Cockpit tools" className="flex flex-col gap-1.5">
                  <h3 className="text-[9.5px] tracking-wider text-[var(--color-ink-meta)]">TOOLS</h3>
                  <div className="grid grid-cols-2 gap-2">{toolButtons}</div>
                </section>
              </div>
            </SheetContent>
          </Sheet>
        </header>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={180}>
      <header
        role="banner"
        aria-label="ARES-Health Telemetry Horizon Bar"
        className="relative z-40 flex min-h-[36px] w-full flex-wrap items-center justify-between gap-1 border-b border-[var(--color-border)] bg-[var(--color-void)] px-2 py-1 select-none lg:h-[40px] lg:max-h-[44px] lg:flex-nowrap lg:py-0"
      >
        {/* Left: Brand Identity + Crew Subject + SOL + Transport Provenance */}
        <div className="flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap">
          {brandLink}
          {subjectControl}
          {solBadge}
          {transportBadge}
          {freshnessControl}
        </div>

        {/* Center: Interactive 01 GATHER -> 02 EVALUATE -> 03 ACT Spine */}
        {phaseNav}

        {/* Right: Epistemic Mode Badge (Issue #12) + OWLT + Drawer/Modal Triggers */}
        <div className="flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap font-mono text-[9.5px]">
          {epistemicBadge}

          {/* Bidirectional Segmented Male | Female + CrewBiologicalProfile Popover Trigger */}
          {sexControls}

          {owltBadge}
          {mriBadge}
          {alarmPill}
          {toolButtons}
        </div>
      </header>
    </TooltipProvider>
  );
}
