// TopNavBar — 44px fixed OLED header for ARES-Health scrollytelling shell.
// Displays mission branding, SOL counter, OWLT latency, 3-Act NASA Triad navigation
// [1. GATHER] [2. EVALUATE] [3. ACT] with smooth Lenis scroll, sex profile toggle,
// Dual-Mode toggle [VIEW: NARRATIVE] vs [VIEW: WORKBENCH], CMD+K launcher, and Operator Tools trigger.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useCallback, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import {
  MISSION_PROFILES,
  DEFAULT_MISSION_PROFILE,
  formatMissionDelay,
  type MissionProfile,
} from '../../lib/missionContext';
import {
  useScrollyContext,
  type ScrollyChapter,
} from '../../scrollytelling/ScrollyContext';
import { useSmoothScroll } from '../../scrollytelling/SmoothScrollProvider';
import type { CrewSex } from '../../lib/scenario';

gsap.registerPlugin(ScrollToPlugin);

// ---------------------------------------------------------------------------
// 3-Act NASA Triad Metadata
// ---------------------------------------------------------------------------

interface ChapterMeta {
  id: ScrollyChapter;
  label: string;
  stepNum: string;
}

const CHAPTERS: readonly ChapterMeta[] = [
  { id: 1, label: 'GATHER', stepNum: '1' },
  { id: 2, label: 'EVALUATE', stepNum: '2' },
  { id: 3, label: 'ACT', stepNum: '3' },
] as const;

// ---------------------------------------------------------------------------
// OWLT formatter — returns formatted one-way light-time string
// ---------------------------------------------------------------------------

function formatOwlt(seconds: number | null): string {
  if (seconds === null) return 'COMMS BLACKOUT';
  return `${formatMissionDelay(seconds)} OWLT`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TopNavBarProps {
  /** Chapter section refs, indexed 1..3, used for scroll-to. */
  chapterRefs?: React.RefObject<HTMLElement | null>[];
  /** Current mission profile (drives OWLT display). */
  missionProfile?: MissionProfile;
  onMissionProfileChange?: (profile: MissionProfile) => void;
  /** Biological sex of the crew member displayed. */
  sex?: CrewSex;
  onSexChange?: (sex: CrewSex) => void;
  /** Active view mode ('scrolly' narrative vs 'workbench' clinical workstation). */
  viewMode?: 'scrolly' | 'workbench';
  onViewModeChange?: (mode: 'scrolly' | 'workbench') => void;
  /** Sol number or mission day (default: 242). */
  sol?: number;
  /** Opens the CMD+K command palette. */
  onOpenCommandPalette?: () => void;
  /** Opens the Operator Tools slide-over sheet. */
  onOpenOperatorTools?: () => void;
}

// ---------------------------------------------------------------------------
// TopNavBar
// ---------------------------------------------------------------------------

export function TopNavBar({
  chapterRefs,
  missionProfile = DEFAULT_MISSION_PROFILE,
  onMissionProfileChange,
  sex = 'MALE',
  onSexChange,
  viewMode = 'scrolly',
  onViewModeChange,
  sol = 242,
  onOpenCommandPalette,
  onOpenOperatorTools,
}: TopNavBarProps) {
  const { activeChapter } = useScrollyContext();
  const [localProfile, setLocalProfile] = useState<MissionProfile>(missionProfile);

  // Sync external prop changes
  useEffect(() => {
    setLocalProfile(missionProfile);
  }, [missionProfile]);

  // CMD+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenCommandPalette?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenCommandPalette]);

  const { lenis } = useSmoothScroll();

  // Scroll to 3D Twin Aperture (Top)
  const scrollToTwin = useCallback(() => {
    const el = document.querySelector('[data-chapter="0"]') as HTMLElement | null;
    if (!el) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (lenis) {
      lenis.scrollTo(el, { offset: -48, duration: 1.0 });
    } else {
      gsap.to(window, {
        scrollTo: { y: el, offsetY: 48 },
        duration: 1.0,
        ease: 'power2.inOut',
      });
    }
  }, [lenis]);

  // Click-to-scroll: smoothly jump to an Act section
  const scrollToChapter = useCallback(
    (chapter: ScrollyChapter) => {
      const ref = chapterRefs?.[chapter - 1];
      const el =
        ref?.current ||
        (document.querySelector(`[data-chapter="${chapter}"]`) as HTMLElement | null);
      if (!el) return;
      if (lenis) {
        lenis.scrollTo(el, { offset: -48, duration: 1.0 });
      } else {
        gsap.to(window, {
          scrollTo: { y: el, offsetY: 48 },
          duration: 1.0,
          ease: 'power2.inOut',
        });
      }
    },
    [chapterRefs, lenis],
  );

  // Profile selector handler
  const handleProfileChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const found = MISSION_PROFILES.find((p) => p.id === e.target.value);
      if (!found) return;
      setLocalProfile(found);
      onMissionProfileChange?.(found);
    },
    [onMissionProfileChange],
  );

  const owltDisplay = formatOwlt(localProfile.oneWayS);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex h-12 items-center border-b border-[#27364b]/80 bg-black/95 px-3 sm:px-4 gap-2.5 backdrop-blur-md"
      aria-label="ARES-Health navigation"
    >
      {/* Brand & SOL Badge */}
      <div className="flex shrink-0 items-center gap-2 pr-2.5 border-r border-[#27364b]/70">
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5 shrink-0 text-sky-400"
          aria-hidden="true"
          fill="currentColor"
        >
          <path d="M10 2.5C6.96 2.5 4.5 4.96 4.5 8c0 3.86 5.5 9.5 5.5 9.5s5.5-5.64 5.5-9.5C15.5 4.96 13.04 2.5 10 2.5zm0 7a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
        <span className="font-mono text-sm font-bold tracking-widest text-white uppercase">
          ARES
        </span>
        <span className="hidden sm:block font-sans text-xs text-slate-300 font-medium leading-none">
          Health
        </span>
        <span className="hidden lg:inline-flex rounded border border-sky-400/40 bg-sky-950/40 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-sky-300 font-semibold">
          SOL {sol}
        </span>
      </div>

      {/* Mission Profile Selector */}
      <div className="hidden sm:flex shrink-0 items-center gap-1.5 pr-2.5 border-r border-[#27364b]/70">
        <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
          MISSION:
        </span>
        <select
          value={localProfile.id}
          onChange={handleProfileChange}
          className="bg-transparent font-mono text-xs font-semibold text-white border-none outline-none cursor-pointer"
          aria-label="Mission profile"
        >
          {MISSION_PROFILES.map((p) => (
            <option key={p.id} value={p.id} className="bg-slate-900 text-white">
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* OWLT Latency */}
      <div className="hidden md:flex shrink-0 items-center gap-1.5 pr-2.5 border-r border-[#27364b]/70">
        <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
          OWLT:
        </span>
        <span
          className={`font-mono text-xs font-bold tabular-nums ${
            localProfile.oneWayS === null
              ? 'text-rose-400'
              : localProfile.oneWayS > 300
              ? 'text-amber-300'
              : 'text-emerald-400'
          }`}
        >
          {owltDisplay}
        </span>
      </div>

      {/* Center Navigation: 3D TWIN + 3-Act NASA Triad Steps [1. GATHER] [2. EVALUATE] [3. ACT] */}
      <nav
        aria-label="NASA Triad steps"
        className="flex flex-1 items-center justify-center gap-2 overflow-x-auto no-scrollbar"
      >
        {/* 3D Twin Aperture Anchor */}
        <button
          type="button"
          onClick={scrollToTwin}
          aria-label="3D Biodigital Twin Aperture"
          className="group flex shrink-0 items-center gap-1.5 rounded-full border border-sky-400/50 bg-sky-950/40 px-3 py-1 font-mono text-xs uppercase tracking-wider text-sky-200 hover:border-sky-300 hover:bg-sky-900/50 transition-all cursor-pointer shadow-[0_0_10px_rgba(56,189,248,0.25)]"
        >
          <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
          <span className="font-bold">3D TWIN</span>
        </button>

        {CHAPTERS.map((ch) => {
          const isActive = activeChapter === ch.id;
          const isPast = activeChapter > ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => scrollToChapter(ch.id)}
              aria-label={`Step ${ch.stepNum}: ${ch.label}`}
              aria-current={isActive ? 'step' : undefined}
              className={`group flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'border-sky-400 bg-sky-950/60 text-sky-200 font-bold shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                  : isPast
                  ? 'border-slate-700 bg-slate-900/40 text-slate-300 hover:text-white'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <span className="font-bold">{ch.stepNum}.</span>
              <span>{ch.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Dual-Mode Toggle: [VIEW: NARRATIVE] vs [VIEW: WORKBENCH] */}
      <div className="hidden lg:flex shrink-0 items-center gap-1 border-r border-[#27364b]/70 pr-2">
        <button
          type="button"
          onClick={() => onViewModeChange?.('scrolly')}
          aria-pressed={viewMode === 'scrolly'}
          className={`rounded px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
            viewMode === 'scrolly'
              ? 'bg-sky-950/60 text-sky-200 border border-sky-400/60 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
              : 'text-slate-400 border border-transparent hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          VIEW: NARRATIVE
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange?.('workbench')}
          aria-pressed={viewMode === 'workbench'}
          className={`rounded px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
            viewMode === 'workbench'
              ? 'bg-sky-950/60 text-sky-200 border border-sky-400/60 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
              : 'text-slate-400 border border-transparent hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          VIEW: WORKBENCH
        </button>
      </div>

      {/* Sex Profile Toggle [MALE] [FEMALE] */}
      <div className="flex shrink-0 items-center gap-1 border-r border-[#27364b]/70 pr-2">
        <span className="font-mono text-xs uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
          SEX:
        </span>
        {(['MALE', 'FEMALE'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSexChange?.(s)}
            aria-pressed={sex === s}
            className={`rounded px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors duration-150 cursor-pointer ${
              sex === s
                ? 'bg-sky-950/60 text-sky-200 border border-sky-400/50'
                : 'text-slate-400 border border-transparent hover:border-slate-800 hover:text-slate-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* CMD+K trigger */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        aria-label="Open command palette (Cmd K)"
        className="hidden sm:flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-900/60 px-2 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-slate-300 hover:border-slate-600 hover:text-white transition-colors duration-150 cursor-pointer"
      >
        <kbd className="not-italic">CMD</kbd>
        <span>+</span>
        <kbd className="not-italic">K</kbd>
      </button>

      {/* OPERATOR TOOLS trigger */}
      <button
        type="button"
        onClick={onOpenOperatorTools}
        aria-label="Open Operator Tools panel"
        className="shrink-0 rounded border border-sky-500/40 bg-sky-950/30 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-sky-300 hover:bg-sky-900/50 hover:border-sky-400 hover:text-white transition-colors duration-150 cursor-pointer"
      >
        OPERATOR TOOLS
      </button>
    </header>
  );
}
