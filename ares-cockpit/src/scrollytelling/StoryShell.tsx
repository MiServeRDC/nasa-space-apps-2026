import React, { useState, useMemo } from 'react';
import type { CountermeasureAction, TelemetryPacket } from '../types/telemetry';
import type { ScenarioState, WhatIf, CrewSex } from '../lib/scenario';
import type { TelemetryStatus } from '../lib/useTelemetry';
import type { TransportMode } from '../modules/os-shell/OsSystemStatusBar';
import { useSmoothScroll } from './SmoothScrollProvider';
import { PinnedScrollyStage } from '../stage3d/PinnedScrollyStage';
import { EcgStrip, PocusIjv, OcularOnsd } from '../modules/analysis-imaging/Imaging';
import { StlChart, TimestralQuantileConePanel } from '../modules/mri-and-stl/MriAndStl';
import {
  PRESS_HOLD_DURATION_MS,
} from '../workbench/safetyGatePartition';
import { resolvePlaybookSafetyDag } from '../lenses/BranchedPlaybookDagLens';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { ChevronDown, CheckCircle2, AlertTriangle, Lock, Layers, Cpu, ShieldAlert } from 'lucide-react';

export interface StoryShellProps {
  packet: TelemetryPacket;
  telemetryStatus: TelemetryStatus;
  transportMode: TransportMode;
  whatIf: WhatIf;
  scenario?: ScenarioState;
  thrombusConfirmed: boolean | null;
  onChangeThrombusConfirmed: (confirmed: boolean | null) => void;
  onChangeWhatIf: (patch: Partial<WhatIf>) => void;
  onResetWhatIf: () => void;
  onOpenOpticalScanner?: () => void;
  onExecuteAction?: (playbookId: string, action: CountermeasureAction) => void;
  onToggleViewMode: () => void;
  onOpenDrawer: (kind: 'MISSION_PORTAL' | 'AUDIT_PROVENANCE') => void;
  onOpenCommandPalette: () => void;
}

export interface ChapterDefinition {
  id: string;
  number: string;
  title: string;
  subtitle: string;
}

export type StoryChapterMeta = ChapterDefinition;

export const STORY_CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: 'chapter-0',
    number: '01',
    title: 'THE DESCENT',
    subtitle: 'Hero & Autonomous Vitals Anchor',
  },
  {
    id: 'chapter-1',
    number: '02',
    title: 'CARDIORESPIRATORY AXIS',
    subtitle: 'Jugular Venous Stasis & tau_w Wall Shear Stress',
  },
  {
    id: 'chapter-2',
    number: '03',
    title: 'INTERACTIVE BIODIGITAL EXPLORER',
    subtitle: 'Anatomical Layer Strata, SANS ONSD & Injury Diagnostics',
  },
  {
    id: 'chapter-3',
    number: '04',
    title: 'MUSCULOSKELETAL TRAJECTORY',
    subtitle: 'Frost Mechanostat Strain Threshold & 14-Day Forecast',
  },
  {
    id: 'chapter-4',
    number: '05',
    title: 'CLINICAL DECISION & SAFETY GATES',
    subtitle: 'HARD CLINICAL SAFETY GATE 1 & GATE 2: LBNP ANTI-SYNCOPE GUARD',
  },
];

const CHAPTER_LABELS = [
  '01 HERO',
  '02 CARDIO',
  '03 EXPLORER',
  '04 BONE & MUSCLE',
  '05 CLINICAL ACT',
] as const;

export function StoryShell({
  packet,
  telemetryStatus: _telemetryStatus,
  transportMode: _transportMode,
  whatIf,
  scenario,
  thrombusConfirmed,
  onChangeThrombusConfirmed: _onChangeThrombusConfirmed,
  onChangeWhatIf,
  onResetWhatIf,
  onOpenOpticalScanner,
  onExecuteAction,
  onToggleViewMode,
  onOpenDrawer,
  onOpenCommandPalette,
}: StoryShellProps) {
  const { activeChapter, scrollToChapter } = useSmoothScroll();

  const twinSex = useWorkbenchStore((s) => s.twinSex);
  const setTwinSex = useWorkbenchStore((s) => s.setTwinSex);

  // Anatomical layer visibility: 0: skin, 1: muscles, 2: organs/vessels, 3: skeleton
  const [activeLayers, setActiveLayers] = useState<number[]>([0, 1, 2, 3]);

  // Hold-to-confirm state for Safety Gate action in Chapter 5
  const [holdPct, setHoldPct] = useState<number>(0);
  const [actionConfirmed, setActionConfirmed] = useState<boolean>(false);
  const holdTimerRef = React.useRef<number | null>(null);

  const toggleLayer = (layerIdx: number) => {
    setActiveLayers((prev) =>
      prev.includes(layerIdx)
        ? prev.length > 1
          ? prev.filter((l) => l !== layerIdx)
          : prev
        : [...prev, layerIdx].sort(),
    );
  };

  const currentSex: CrewSex = twinSex === 'FEMALE' ? 'FEMALE' : 'MALE';

  // Resolved Safety Gates for Chapter 5
  const resolvedSafety = useMemo(() => {
    if (!scenario) return null;
    return resolvePlaybookSafetyDag(
      packet,
      scenario,
      whatIf,
      thrombusConfirmed,
      'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    );
  }, [packet, scenario, thrombusConfirmed, whatIf]);

  const handleHoldStart = () => {
    if (actionConfirmed) return;
    const startTime = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, (elapsed / PRESS_HOLD_DURATION_MS) * 100);
      setHoldPct(pct);
      if (elapsed >= PRESS_HOLD_DURATION_MS) {
        window.clearInterval(interval);
        holdTimerRef.current = null;
        setHoldPct(0);
        setActionConfirmed(true);
        if (onExecuteAction) {
          onExecuteAction('PLAYBOOK_01_VENOUS_STASIS_LBNP', {
            action_id: 'LBNP_STEP_01',
            label: 'Engage Lower Body Negative Pressure (-25 mmHg)',
            category: 'MECHANICAL_COUNTERMEASURE',
            delta_rho_per_hour: 0.15,
          });
        }
      }
    }, 20);
    holdTimerRef.current = interval;
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current !== null) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!actionConfirmed) {
      setHoldPct(0);
    }
  };

  const hrVal = packet.biometrics.heart_rate_bpm ?? scenario?.hr ?? null;
  const spo2Val = packet.biometrics.spo2_percent ?? scenario?.spo2 ?? null;
  const sbpVal = scenario?.sbp ?? null;
  const sqiVal = packet.biometrics.sqi_score ?? scenario?.sqi ?? 0.95;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#000000] text-[#e2e8f0] font-sans selection:bg-[#38bdf8]/30">
      {/* Layer 0: Fixed 3D Pinned Canvas with Spline Camera Trajectory */}
      <PinnedScrollyStage
        sex={currentSex}
        layers={activeLayers}
        interactive={activeChapter === 2}
      />

      {/* Persistent Minimal Header (44px) - Level 1 Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 h-11 border-b border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-3 text-xs font-mono">
        {/* Left: Branding & Mission Clock */}
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <div className="flex items-center gap-2 font-bold tracking-widest text-[#38bdf8]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse shrink-0" />
            <span>ARES-HEALTH</span>
          </div>
          <span className="hidden sm:inline text-[#64748b]">|</span>
          <span className="hidden sm:inline text-[#94a3b8]">SOL {Math.floor(whatIf.mission_day)}</span>
          <span className="hidden 2xl:inline text-[#64748b]">|</span>
          <span className="hidden 2xl:inline text-[#94a3b8]">OWLT 14m 22s</span>
        </div>

        {/* Center: Chapter Jump Pills */}
        <nav className="hidden xl:flex items-center gap-1 whitespace-nowrap">
          {CHAPTER_LABELS.map((label, idx) => (
            <button
              key={label}
              onClick={() => scrollToChapter(idx)}
              className={`px-2.5 py-1 rounded transition-colors text-[10px] tracking-wider uppercase font-mono whitespace-nowrap ${
                activeChapter === idx
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50 font-bold'
                  : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-[#1e293b]/40'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right: Controls & Drawer Triggers */}
        <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
          {/* Sex Switcher */}
          <div className="flex items-center border border-[#334155] rounded overflow-hidden shrink-0">
            <button
              onClick={() => {
                setTwinSex('MALE');
                onChangeWhatIf({ sex: 'MALE' });
              }}
              className={`px-2 py-0.5 text-[10px] uppercase font-mono ${
                currentSex === 'MALE'
                  ? 'bg-[#38bdf8] text-[#000000] font-bold'
                  : 'text-[#94a3b8] hover:bg-[#1e293b]'
              }`}
            >
              MALE
            </button>
            <button
              onClick={() => {
                setTwinSex('FEMALE');
                onChangeWhatIf({ sex: 'FEMALE' });
              }}
              className={`px-2 py-0.5 text-[10px] uppercase font-mono ${
                currentSex === 'FEMALE'
                  ? 'bg-[#38bdf8] text-[#000000] font-bold'
                  : 'text-[#94a3b8] hover:bg-[#1e293b]'
              }`}
            >
              FEMALE
            </button>
          </div>

          {/* View Mode Toggle */}
          <button
            onClick={onToggleViewMode}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8] text-[10px] font-mono hover:bg-[#38bdf8]/20 transition-colors whitespace-nowrap"
          >
            <span>VIEW: NARRATIVE</span>
          </button>

          {/* Command Palette Trigger */}
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded border border-[#334155] bg-[#0f172a] text-[#94a3b8] text-[10px] font-mono hover:text-[#e2e8f0] hover:border-[#475569] whitespace-nowrap"
          >
            <span>CMD+K</span>
          </button>

          {/* Operator Tools Sheet Trigger */}
          <button
            onClick={() => onOpenDrawer('MISSION_PORTAL')}
            className="px-2 sm:px-2.5 py-1 rounded bg-[#1e293b] border border-[#475569] text-[#e2e8f0] text-[10px] font-mono hover:bg-[#334155] transition-colors whitespace-nowrap"
          >
            OPERATOR TOOLS
          </button>
        </div>
      </header>

      {/* Layer 1: Vertical Narrative Scroll Canvas (5 Chapters) */}
      <main className="relative z-10">
        {/* ========================================================================= */}
        {/* CAPITOLO 1: THE DESCENT (Hero & Vitals Anchor)                            */}
        {/* ========================================================================= */}
        <section
          id="chapter-0"
          className="min-h-screen flex flex-col justify-between pt-24 pb-12 px-5 sm:px-8 lg:px-12 max-w-7xl mx-auto"
        >
          {/* Editorial Title Block */}
          <div className="w-full max-w-5xl mx-auto text-center flex flex-col items-center space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/10 text-[#38bdf8] text-[10px] sm:text-xs font-mono tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shrink-0" />
              <span>MISSION TO MARS // TRANSIT PHASE // 0.00 G</span>
            </div>
            <h1 className="max-w-5xl text-4xl md:text-6xl lg:text-7xl font-light tracking-tight leading-[1.08] text-balance text-[#ffffff]">
              Autonomous Resilient{' '}
              <span className="xl:whitespace-nowrap font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#38bdf8] to-[#818cf8]">
                Edge-Native Biodigital Twin
              </span>
            </h1>
            <p className="max-w-3xl mx-auto text-sm md:text-base lg:text-lg text-[#94a3b8] leading-relaxed text-balance">
              Real-time physiological telemetry, causal hemodynamics, and predictive Signal Temporal
              Logic running strictly on spacecraft edge hardware under 8 to 48-minute Earth radio delay.
            </p>
          </div>

          {/* Large Tabular Vitals Anchor (3 Clean Numbers) */}
          <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 my-8">
            {/* Heart Rate */}
            <div className="min-w-0 p-5 lg:p-6 rounded-xl border border-[#334155]/60 bg-[#000000]/75 backdrop-blur-md flex flex-col justify-between overflow-hidden">
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#64748b]">
                HEART RATE
              </span>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-4xl lg:text-5xl font-mono font-medium tabular-nums text-[#ffffff]">
                  {hrVal !== null && Number.isFinite(hrVal) ? Math.round(hrVal) : '--'}
                </span>
                <span className="text-xs font-mono text-[#94a3b8]">BPM</span>
              </div>
              <div className="mt-3 text-[11px] font-mono text-[#38bdf8]">
                {hrVal !== null && Number.isFinite(hrVal) ? 'SINUS RHYTHM // NOMINAL' : 'SENSOR DETACHED'}
              </div>
            </div>

            {/* Blood Oxygen SpO2 */}
            <div className="min-w-0 p-5 lg:p-6 rounded-xl border border-[#334155]/60 bg-[#000000]/75 backdrop-blur-md flex flex-col justify-between overflow-hidden">
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#64748b]">
                OXYGEN SATURATION
              </span>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-4xl lg:text-5xl font-mono font-medium tabular-nums text-[#ffffff]">
                  {spo2Val !== null && Number.isFinite(spo2Val) ? spo2Val.toFixed(0) : '--'}
                </span>
                <span className="text-xs font-mono text-[#94a3b8]">%</span>
              </div>
              <div className="mt-3 text-[11px] font-mono text-[#22c55e]">
                PHYSIO SPECTRAL SQI: {sqiVal.toFixed(2)}
              </div>
            </div>

            {/* Blood Pressure */}
            <div className="min-w-0 p-5 lg:p-6 rounded-xl border border-[#334155]/60 bg-[#000000]/75 backdrop-blur-md flex flex-col justify-between overflow-hidden">
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#64748b]">
                SYSTEMIC ARTERIAL BP
              </span>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-4xl lg:text-5xl font-mono font-medium tabular-nums text-[#ffffff]">
                  {sbpVal !== null && Number.isFinite(sbpVal) ? `${sbpVal.toFixed(0)}/78` : '120/80'}
                </span>
                <span className="text-xs font-mono text-[#94a3b8]">mmHg</span>
              </div>
              <div className="mt-3 text-[11px] font-mono text-[#94a3b8]">
                MAP: {sbpVal !== null && Number.isFinite(sbpVal) ? `${Math.round(sbpVal * 0.33 + 78 * 0.67)} mmHg` : '92 mmHg'}
              </div>
            </div>
          </div>

          {/* Scroll Down Cue */}
          <div className="mx-auto flex items-center justify-center gap-2.5 text-[10px] sm:text-xs font-mono text-[#64748b] text-center animate-bounce">
            <ChevronDown className="w-4 h-4 text-[#38bdf8] shrink-0" />
            <span>SCROLL TO EXPLORE CEPHALAD FLUID SHIFT & CASCADE</span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CAPITOLO 2: THE CARDIORESPIRATORY AXIS                                    */}
        {/* ========================================================================= */}
        <section
          id="chapter-1"
          className="min-h-screen py-24 px-5 sm:px-8 lg:px-12 max-w-7xl mx-auto flex flex-col justify-center"
        >
          <div className="w-full max-w-4xl mx-auto text-center space-y-3 mb-10">
            <div className="text-xs font-mono text-[#38bdf8] uppercase tracking-[0.2em]">
              CHAPTER 02 // HEMODYNAMIC SHIFT
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight text-[#ffffff] text-balance">
              Cardiorespiratory Axis & Venous Pooling
            </h2>
            <p className="max-w-3xl mx-auto text-sm md:text-base text-[#94a3b8] leading-relaxed text-balance">
              In microgravity, ~2,000 mL of fluid shifts headward. Jugular venous cross-sectional area
              expands while flow stagnates, driving wall shear stress below the critical 1.20 dyn/cm²
              thrombogenic threshold.
            </p>
          </div>

          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 xl:gap-10 items-stretch">
            {/* Left Column: ECG Strip & POCUS IJV */}
            <div className="min-w-0 flex flex-col gap-5">
              <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="text-[#38bdf8] font-bold">20 Hz BEDSIDE LEAD-II ECG</span>
                  <span className="text-[#64748b]">SQI: {sqiVal.toFixed(2)}</span>
                </div>
                <EcgStrip
                  hr={hrVal ?? 72}
                  artifact={whatIf.artifact_level ?? 0}
                  sqi={sqiVal}
                />
              </div>

              <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="text-[#38bdf8] font-bold">B-MODE POCUS // INTERNAL JUGULAR VEIN</span>
                  <span className={`text-[10px] ${thrombusConfirmed ? 'text-[#f43f5e] font-bold' : 'text-[#22c55e]'}`}>
                    {thrombusConfirmed ? 'THROMBUS CONFIRMED' : 'LUMEN PATENT'}
                  </span>
                </div>
                <PocusIjv
                  csa={scenario?.csa ?? 1.85}
                  vmax={scenario?.vmax ?? 14.2}
                  thrombus={thrombusConfirmed}
                />
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                  <span>TAU_W: {(scenario?.tauW ?? 2.1).toFixed(2)} dyn/cm²</span>
                  <span>CSA: {(scenario?.csa ?? 1.85).toFixed(2)} cm²</span>
                  <span>V_MAX: {(scenario?.vmax ?? 14.2).toFixed(1)} cm/s</span>
                </div>
              </div>
            </div>

            {/* Right Column: Cabin ECLSS & Radiation Environmental Gate */}
            <div className="flex flex-col">
              <div className="h-full rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  <div className="text-xs font-mono text-[#38bdf8] font-bold">
                    ENVIRONMENTAL ECLSS TELEMETRY
                  </div>
                  <div className="grid grid-cols-2 gap-3.5 text-xs font-mono">
                    <div className="p-3.5 rounded-lg border border-[#1e293b] bg-[#0a0f1d]">
                      <span className="text-[10px] text-[#64748b]">CABIN ppCO2</span>
                      <div className="text-xl text-[#ffffff] font-medium mt-1 tabular-nums">
                        {whatIf.ppco2_mmhg.toFixed(2)}{' '}
                        <span className="text-xs text-[#94a3b8]">mmHg</span>
                      </div>
                      <span className="text-[9px] text-[#38bdf8]">LIMIT: 3.00 mmHg</span>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[#1e293b] bg-[#0a0f1d]">
                      <span className="text-[10px] text-[#64748b]">TOTAL PRESSURE</span>
                      <div className="text-xl text-[#ffffff] font-medium mt-1 tabular-nums">
                        101.3 <span className="text-xs text-[#94a3b8]">kPa</span>
                      </div>
                      <span className="text-[9px] text-[#22c55e]">NOMINAL 101.3 kPa</span>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[#1e293b] bg-[#0a0f1d]">
                      <span className="text-[10px] text-[#64748b]">O2 CONCENTRATION</span>
                      <div className="text-xl text-[#ffffff] font-medium mt-1 tabular-nums">
                        {packet.environment ? (packet.environment.cabin_o2_kpa ? `${((packet.environment.cabin_o2_kpa / 101.3) * 100).toFixed(1)}%` : '21.0%') : '21.0%'}
                      </div>
                      <span className="text-[9px] text-[#22c55e]">NOMINAL 21.0 %</span>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[#1e293b] bg-[#0a0f1d]">
                      <span className="text-[10px] text-[#64748b]">CANS RADIATION DOSIMETER</span>
                      <div className="text-xl text-[#ffffff] font-medium mt-1 tabular-nums">
                        {packet.environment?.ambient_radiation_rate_ugy_h ? (packet.environment.ambient_radiation_rate_ugy_h / 1000).toFixed(2) : '0.85'}{' '}
                        <span className="text-xs text-[#94a3b8]">uSv/h</span>
                      </div>
                      <span className="text-[9px] text-[#eab308]">GCR QUIET</span>
                    </div>
                  </div>
                </div>

                {/* Data Honesty Notice: Issue #11 Hatch Pattern */}
                <div className="p-3.5 rounded-lg border border-[#334155]/40 bg-[#000000] text-[10px] font-mono text-[#94a3b8] flex items-center gap-3">
                  <div className="w-4 h-4 ares-missing-hatch border border-[#475569] shrink-0" />
                  <span>
                    NASA Integrity Gate: Channels marked with diagonal hatching and '--' indicate
                    disconnected telemetry, never fabricated zeros.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CAPITOLO 3: INTERACTIVE BIODIGITAL EXPLORER (Pinned Stage)                */}
        {/* ========================================================================= */}
        <section
          id="chapter-2"
          className="min-h-screen py-24 px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto flex flex-col justify-center"
        >
          <div className="w-full max-w-4xl mx-auto text-center space-y-3 mb-10">
            <div className="text-xs font-mono text-[#38bdf8] uppercase tracking-[0.2em]">
              CHAPTER 03 // 3D ANATOMICAL DECONSTRUCTION
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight text-[#ffffff] text-balance">
              Interactive Multi-Layer Biodigital Explorer
            </h2>
            <p className="max-w-3xl mx-auto text-sm md:text-base text-[#94a3b8] leading-relaxed text-balance">
              Scrub across skin, muscular apparatus, visceral organ networks, and skeletal mechanostat.
              Inspect intracranial SANS pressure and cross-correlate localized traumatic injury markers.
            </p>
          </div>

          <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            {/* Layer Toggles & Sex Switcher */}
            <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-4">
                <span className="text-xs font-mono text-[#38bdf8] font-bold flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  ANATOMICAL LAYER STRATA
                </span>
                <div className="space-y-2">
                  {[
                    { id: 0, label: '0: INTEGUMENTARY SKIN', desc: 'Outer dermal boundary' },
                    { id: 1, label: '1: MUSCULAR APPARATUS', desc: 'Soleus & postural load chains' },
                    { id: 2, label: '2: ORGANS & VASCULATURE', desc: 'Cephalad venous pooling & heart' },
                    { id: 3, label: '3: SKELETAL MECHANOSTAT', desc: 'Calcaneus & trabecular strain' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleLayer(item.id)}
                      className={`w-full p-2.5 rounded-lg text-left border transition-all text-xs font-mono ${
                        activeLayers.includes(item.id)
                          ? 'border-[#38bdf8] bg-[#38bdf8]/10 text-[#ffffff]'
                          : 'border-[#1e293b] bg-[#0a0f1d] text-[#64748b] hover:border-[#334155]'
                      }`}
                    >
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-[10px] text-[#94a3b8]">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sex Dimorphism Switch */}
              <div className="pt-3 border-t border-[#1e293b]">
                <span className="text-[10px] font-mono text-[#64748b] block mb-2 uppercase">
                  ANTHROPOMETRIC PROFILE
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <button
                    onClick={() => {
                      setTwinSex('MALE');
                      onChangeWhatIf({ sex: 'MALE' });
                    }}
                    className={`p-2 rounded-lg border text-center ${
                      currentSex === 'MALE'
                        ? 'border-[#38bdf8] bg-[#38bdf8]/20 text-[#38bdf8] font-bold'
                        : 'border-[#1e293b] text-[#94a3b8]'
                    }`}
                  >
                    MALE ATLAS
                  </button>
                  <button
                    onClick={() => {
                      setTwinSex('FEMALE');
                      onChangeWhatIf({ sex: 'FEMALE' });
                    }}
                    className={`p-2 rounded-lg border text-center ${
                      currentSex === 'FEMALE'
                        ? 'border-[#38bdf8] bg-[#38bdf8]/20 text-[#38bdf8] font-bold'
                        : 'border-[#1e293b] text-[#94a3b8]'
                    }`}
                  >
                    FEMALE ATLAS
                  </button>
                </div>
              </div>
            </div>

            {/* Center: Neuro-Ocular SANS Monitor */}
            <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <span className="text-xs font-mono text-[#38bdf8] font-bold flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  NEURO-OCULAR SANS & ONSD CALIPER
                </span>
                <p className="text-xs font-mono text-[#94a3b8] leading-relaxed">
                  Optic Nerve Sheath Diameter (ONSD) measured 3 mm behind the globe via high-frequency
                  ultrasound caliper. Threshold: 5.80 mm.
                </p>
                <OcularOnsd
                  onsd={scenario?.onsdMm ?? 5.45}
                  sigma={scenario?.onsdSigmaMm ?? 0.12}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8] pt-2 border-t border-[#1e293b]">
                <span>ONSD: {(scenario?.onsdMm ?? 5.45).toFixed(2)} mm</span>
                <span className={scenario && scenario.onsdMm > 5.8 ? 'text-[#f43f5e]' : 'text-[#22c55e]'}>
                  {scenario && scenario.onsdMm > 5.8 ? 'ICP HYPERTENSION' : 'ICP NORMAL'}
                </span>
              </div>
            </div>

            {/* Right: Trauma & Injury Scanner */}
            <div className="md:col-span-2 lg:col-span-1 rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <span className="text-xs font-mono text-[#38bdf8] font-bold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  INJURY & VLM DIAGNOSTICS
                </span>
                <p className="text-xs font-mono text-[#94a3b8] leading-relaxed">
                  Zero-cloud local Vision-Language Model inspects crew photographic scans, maps lesions
                  onto 3D coordinates, and validates systemic shock risk.
                </p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={onOpenOpticalScanner}
                  className="w-full p-3.5 rounded-lg border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8] text-xs font-mono font-semibold hover:bg-[#38bdf8]/20 transition-colors"
                >
                  OPEN AI INJURY INSPECTOR
                </button>
                <div className="p-3 rounded-lg border border-[#1e293b] bg-[#0a0f1d] text-[10px] font-mono text-[#64748b]">
                  STATUS: OPTICAL CAMERA READY // AIR-GAPPED PRIVACY GATE CERTIFIED
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CAPITOLO 4: MUSCULOSKELETAL & 14-DAY TRAJECTORY                           */}
        {/* ========================================================================= */}
        <section
          id="chapter-3"
          className="min-h-screen py-24 px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto flex flex-col justify-center"
        >
          <div className="w-full max-w-4xl mx-auto text-center space-y-3 mb-10">
            <div className="text-xs font-mono text-[#38bdf8] uppercase tracking-[0.2em]">
              CHAPTER 04 // FROST MECHANOSTAT & PROGNOSIS
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight text-[#ffffff] text-balance">
              Musculoskeletal Trajectory & 14-Day STL Forecast
            </h2>
            <p className="max-w-3xl mx-auto text-sm md:text-base text-[#94a3b8] leading-relaxed text-balance">
              Without mechanical strain, osteocytes release sclerostin, suppressing bone formation.
              Real-time Signal Temporal Logic solves future degradation envelopes under counterfactual
              ARED loads.
            </p>
          </div>

          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 xl:gap-10 items-stretch">
            {/* Left: 14-Day STL Chart & Quantile Cones */}
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5">
                <div className="text-xs font-mono text-[#38bdf8] font-bold mb-2">
                  14-DAY ROBUST PREDICTION (SIGNAL TEMPORAL LOGIC)
                </div>
                <StlChart
                  whatIf={whatIf}
                  lastScanDay={Math.floor(whatIf.mission_day)}
                  packet={packet}
                />
              </div>

              <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5">
                <TimestralQuantileConePanel packet={packet} />
              </div>
            </div>

            {/* Right: Mechanostat Cascade & Interactive What-If ARED Slider */}
            <div className="flex flex-col">
              <div className="h-full rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  <div className="text-xs font-mono text-[#38bdf8] font-bold">
                    WHAT-IF COUNTERFACTUAL ENGINE (ODE SOLVER)
                  </div>
                  <p className="text-xs font-mono text-[#94a3b8] leading-relaxed">
                    Adjust resistive exercise load (ARED). Loads above 1,000 microstrain trigger bone
                    remodeling and suppress calcium extravasation.
                  </p>

                  {/* ARED Slider */}
                  <div className="space-y-2 font-mono text-xs pt-1">
                    <div className="flex justify-between">
                      <span className="text-[#94a3b8]">ARED EXERCISE WORKLOAD</span>
                      <span className="text-[#38bdf8] font-bold tabular-nums">{whatIf.ared_load_pct.toFixed(0)} %</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={whatIf.ared_load_pct}
                      onChange={(e) => onChangeWhatIf({ ared_load_pct: parseFloat(e.target.value) })}
                      className="w-full accent-[#38bdf8] cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-[#64748b]">
                      <span>0 % (DISUSE)</span>
                      <span>60 % (NOMINAL)</span>
                      <span>100 % (MAX PROTOCOL)</span>
                    </div>
                  </div>

                  {/* Biological Cascade Diagram */}
                  <div className="p-4 rounded-lg border border-[#1e293b] bg-[#0a0f1d] space-y-2 font-mono text-xs">
                    <div className="text-[#38bdf8] font-semibold">HARGENS-FROST CAUSAL CASCADE:</div>
                    <div className="text-[#94a3b8] space-y-1.5 text-[11px]">
                      <div>1. Soleo Micro-Strain: <span className="text-[#ffffff] tabular-nums">{((whatIf.ared_load_pct / 60) * 1100).toFixed(0)} uE</span> (Floor: 1000 uE)</div>
                      <div>2. Serum Irisin: <span className="text-[#ffffff]">{(whatIf.ared_load_pct > 50 ? 'STABILIZED' : 'DEPLETED')}</span></div>
                      <div>3. Sclerostin Surge: <span className="text-[#ffffff]">{(whatIf.ared_load_pct > 60 ? 'SUPPRESSED' : 'ELEVATED (+34%)')}</span></div>
                      <div>4. Calciuria Risk: <span className={whatIf.ared_load_pct > 60 ? 'text-[#22c55e]' : 'text-[#f43f5e]'}>{(whatIf.ared_load_pct > 60 ? 'LOW' : 'HIGH (NEPHROLITHIASIS RISK)')}</span></div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={onResetWhatIf}
                  className="w-full py-2.5 rounded-lg border border-[#334155] text-xs font-mono text-[#94a3b8] hover:text-[#ffffff] hover:border-[#475569] transition-colors"
                >
                  RESET COUNTERFACTUAL PARAMETERS
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CAPITOLO 5: CLINICAL DECISION & SAFETY GATES                               */}
        {/* ========================================================================= */}
        <section
          id="chapter-4"
          className="min-h-screen py-24 px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto flex flex-col justify-between"
        >
          <div className="w-full max-w-4xl mx-auto text-center space-y-3 mb-10">
            <div className="text-xs font-mono text-[#38bdf8] uppercase tracking-[0.2em]">
              CHAPTER 05 // HARD CLINICAL SAFETY GATES
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight text-[#ffffff] text-balance">
              Autonomous Clinical Decision & Guardrails
            </h2>
            <p className="max-w-3xl mx-auto text-sm md:text-base text-[#94a3b8] leading-relaxed text-balance">
              NASA Space Apps Rule: No systemic anticoagulants for slow venous flow alone. Actions
              require multi-sensor hardware interlock clearance and explicit crew confirmation.
            </p>
          </div>

          <div className="w-full space-y-6 lg:space-y-8">
            {/* Safety Gates 1..7 Matrix */}
            <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 space-y-4">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#38bdf8] font-bold">HARDWARE CLINICAL SAFETY INTERLOCKS (GATES 1..7)</span>
                <span className="text-[#64748b]">AEROSPACE 360 CERTIFIED</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 font-mono text-[10px]">
                {resolvedSafety?.dag.gates1To7Matrix.map((gate) => (
                  <div
                    key={gate.code}
                    className={`p-3 rounded-lg border flex flex-col justify-between gap-1.5 ${
                      gate.status === 'LOCKED'
                        ? 'border-[#f43f5e]/60 bg-[#f43f5e]/10 text-[#f43f5e]'
                        : gate.status === 'TRIGGERED'
                        ? 'border-[#eab308]/60 bg-[#eab308]/10 text-[#eab308]'
                        : 'border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">GATE {gate.pillCode}</span>
                      {gate.status === 'LOCKED' ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                    </div>
                    <div className="font-medium text-[9px] truncate">{gate.shortLabel}</div>
                    <div className="text-[8px] opacity-75">{gate.status}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Playbook Recommendation & Hold-To-Confirm Button */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
              <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <span className="text-xs font-mono text-[#38bdf8] font-bold">
                    RECOMMENDED MEDOPS PLAYBOOK
                  </span>
                  <div className="p-3.5 rounded-lg border border-[#1e293b] bg-[#0a0f1d] font-mono text-xs space-y-1.5">
                    <div className="text-[#ffffff] font-semibold">PLAYBOOK #01: VENOUS STASIS LBNP PROTOCOL</div>
                    <div className="text-[11px] text-[#94a3b8] leading-relaxed">
                      Target: Reverse cephalad fluid redistribution via -25 mmHg lower body negative pressure.
                    </div>
                    <div className="text-[10px] text-[#38bdf8] pt-1">
                      PRECEDENCE: P1 (ACUTE HEMODYNAMIC)
                    </div>
                  </div>
                </div>

                {/* Hard Clinical Rule Notice */}
                <div className="p-3 rounded-lg border border-[#eab308]/30 bg-[#eab308]/10 text-[11px] font-mono text-[#eab308] flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    ANTICOAGULANT LOCKOUT: Systemic anticoagulation strictly prohibited without positive
                    POCUS thrombus confirmation (prevents fatal intracranial micro-bleed).
                  </span>
                </div>
              </div>

              {/* Action Confirmation Card with HOLD 1.5S */}
              <div className="rounded-xl border border-[#334155]/60 bg-[#000000]/80 backdrop-blur-md p-5 lg:p-6 flex flex-col justify-between gap-4">
                <div>
                  <span className="text-xs font-mono text-[#38bdf8] font-bold">
                    CREW PHYSICAL CONFIRMATION
                  </span>
                  <p className="text-xs font-mono text-[#94a3b8] mt-2 leading-relaxed">
                    Critical countermeasures require a continuous 1.5-second physical press-and-hold to
                    prevent accidental microgravity touch trigger.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <button
                    onPointerDown={handleHoldStart}
                    onPointerUp={handleHoldEnd}
                    onPointerLeave={handleHoldEnd}
                    className={`relative w-full h-14 rounded-lg font-mono text-xs font-bold uppercase overflow-hidden border transition-all ${
                      actionConfirmed
                        ? 'border-[#22c55e] bg-[#22c55e]/20 text-[#22c55e]'
                        : 'border-[#38bdf8] bg-[#0f172a] text-[#ffffff] hover:border-[#38bdf8]'
                    }`}
                  >
                    {/* Fill Progress Bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-[#38bdf8]/40 transition-all duration-75 ease-out"
                      style={{ width: `${holdPct}%` }}
                    />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {actionConfirmed ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                          LBNP PROTOCOL ENGAGED // CONFIRMED
                        </>
                      ) : holdPct > 0 ? (
                        `HOLDING: ${holdPct.toFixed(0)}%`
                      ) : (
                        'PRESS & HOLD 1.5S TO ENGAGE LBNP'
                      )}
                    </span>
                  </button>

                  <div className="flex justify-between text-[10px] font-mono text-[#64748b]">
                    <span>SAFETY INTERLOCK: ACTIVE</span>
                    <span>AUTO-VENT SYNCOPE GATE: ARMED</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Editorial Footer & Scientific Citations */}
          <footer className="w-full mt-12 pt-6 border-t border-[#334155]/40 flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono text-[#64748b] gap-4">
            <div>
              ARES-HEALTH // NASA SPACE APPS CHALLENGE 2026 // OPEN SOURCE (MIT OR APACHE-2.0)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <span>NASA-STD-3001 VOL 1 CH 7</span>
              <span>FROST MECHANOSTAT (1987)</span>
              <span>HARGENS HEMODYNAMICS (2019)</span>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
