// TopNavBar — 44px fixed OLED header for ARES-Health scrollytelling shell.
// Displays mission branding, profile selector, OWLT latency, 5-chapter progress
// pills, sex profile toggle, CMD+K launcher, and Operator Tools sheet trigger.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import {
  MISSION_PROFILES,
  DEFAULT_MISSION_PROFILE,
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
// Chapter metadata
// ---------------------------------------------------------------------------

interface ChapterMeta {
  id: ScrollyChapter;
  label: string;
  abbr: string;
}

const CHAPTERS: readonly ChapterMeta[] = [
  { id: 1, label: 'Descent', abbr: '01' },
  { id: 2, label: 'Cardio', abbr: '02' },
  { id: 3, label: 'Explorer', abbr: '03' },
  { id: 4, label: 'Musculoskeletal', abbr: '04' },
  { id: 5, label: 'Decision', abbr: '05' },
] as const;

// ---------------------------------------------------------------------------
// OWLT formatter — returns formatted one-way light-time string
// ---------------------------------------------------------------------------

function formatOwlt(seconds: number | null): string {
  if (seconds === null) return 'COMMS BLACKOUT';
  if (seconds < 2) return `${(seconds * 1000).toFixed(0)} ms OWLT`;
  if (seconds < 120) return `${seconds.toFixed(1)} s OWLT`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min OWLT`;
  return `${(seconds / 3600).toFixed(2)} hr OWLT`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TopNavBarProps {
  /** Chapter section refs, indexed 1..5, used for scroll-to. */
  chapterRefs?: React.RefObject<HTMLElement | null>[];
  /** Current mission profile (drives OWLT display). */
  missionProfile?: MissionProfile;
  onMissionProfileChange?: (profile: MissionProfile) => void;
  /** Biological sex of the crew member displayed. */
  sex?: CrewSex;
  onSexChange?: (sex: CrewSex) => void;
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
  onOpenCommandPalette,
  onOpenOperatorTools,
}: TopNavBarProps) {
  const { activeChapter } = useScrollyContext();
  const [localProfile, setLocalProfile] = useState<MissionProfile>(missionProfile);

  // Sync external prop changes.
  useEffect(() => {
    setLocalProfile(missionProfile);
  }, [missionProfile]);

  // ---------------------------------------------------------------------------
  // CMD+K keyboard shortcut
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Click-to-scroll: smoothly jump to a chapter section
  // ---------------------------------------------------------------------------
  const scrollToChapter = useCallback(
    (chapter: ScrollyChapter) => {
      const ref = chapterRefs?.[chapter - 1];
      const el = ref?.current || (document.querySelector(`[data-chapter="${chapter}"]`) as HTMLElement | null);
      if (!el) return;
      if (lenis) {
        lenis.scrollTo(el, { offset: -44, duration: 1.0 });
      } else {
        gsap.to(window, { scrollTo: { y: el, offsetY: 44 }, duration: 1.0, ease: 'power2.inOut' });
      }
    },
    [chapterRefs, lenis],
  );

  // ---------------------------------------------------------------------------
  // Profile selector handler
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex h-11 items-center border-b border-[var(--color-border)] bg-black px-3 gap-2"
      aria-label="ARES-Health navigation"
    >
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2 pr-2 border-r border-[var(--color-border)]">
        {/* Logo mark: simple SVG cross / heartbeat glyph, air-gapped, no image file */}
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5 shrink-0 text-[var(--color-accent)]"
          aria-hidden="true"
          fill="currentColor"
        >
          <path d="M10 2.5C6.96 2.5 4.5 4.96 4.5 8c0 3.86 5.5 9.5 5.5 9.5s5.5-5.64 5.5-9.5C15.5 4.96 13.04 2.5 10 2.5zm0 7a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
        <span className="font-mono text-xs font-semibold tracking-widest text-[var(--color-ink-display)] uppercase">
          ARES
        </span>
        <span className="hidden sm:block font-sans text-[10px] text-[var(--color-ink-meta)] leading-none">
          Health
        </span>
      </div>

      {/* Mission Profile selector */}
      <div className="hidden sm:flex shrink-0 items-center gap-1.5 pr-2 border-r border-[var(--color-border)]">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
          Mission
        </span>
        <select
          value={localProfile.id}
          onChange={handleProfileChange}
          className="bg-transparent font-mono text-[11px] text-[var(--color-ink-body)] border-none outline-none cursor-pointer"
          aria-label="Mission profile"
        >
          {MISSION_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* OWLT */}
      <div className="hidden md:flex shrink-0 items-center gap-1 pr-2 border-r border-[var(--color-border)]">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
          OWLT
        </span>
        <span
          className={`font-mono text-[11px] tabular-nums ${
            localProfile.oneWayS === null
              ? 'text-[var(--color-status-critical)]'
              : localProfile.oneWayS > 300
              ? 'text-[var(--color-status-caution)]'
              : 'text-[var(--color-status-nominal)]'
          }`}
        >
          {owltDisplay}
        </span>
      </div>

      {/* Chapter progress pills — centered */}
      <nav
        aria-label="Narrative chapters"
        className="flex flex-1 items-center justify-center gap-1"
      >
        {CHAPTERS.map((ch) => {
          const isActive = activeChapter === ch.id;
          const isPast = activeChapter > ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => scrollToChapter(ch.id)}
              aria-label={`Chapter ${ch.id}: ${ch.label}`}
              aria-current={isActive ? 'step' : undefined}
              className={`
                group flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest
                transition-all duration-200
                ${
                  isActive
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : isPast
                    ? 'border-[var(--color-border-active)] text-[var(--color-ink-muted)]'
                    : 'border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-active)] hover:text-[var(--color-ink-meta)]'
                }
              `}
            >
              <span className="hidden sm:inline">{ch.abbr}</span>
              <span className="hidden md:inline"> {ch.label}</span>
              {/* Mobile: dot only */}
              <span
                className={`sm:hidden h-1.5 w-1.5 rounded-full ${
                  isActive
                    ? 'bg-[var(--color-accent)]'
                    : isPast
                    ? 'bg-[var(--color-ink-muted)]'
                    : 'bg-[var(--color-border-active)]'
                }`}
              />
            </button>
          );
        })}
      </nav>

      {/* Sex profile toggle */}
      <div className="flex shrink-0 items-center gap-0.5 pl-2 border-l border-[var(--color-border)]">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] mr-1 hidden sm:inline">
          Sex
        </span>
        {(['MALE', 'FEMALE'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onSexChange?.(s)}
            aria-pressed={sex === s}
            className={`
              rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest
              transition-colors duration-150
              ${
                sex === s
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/40'
                  : 'text-[var(--color-ink-muted)] border border-transparent hover:border-[var(--color-border)] hover:text-[var(--color-ink-meta)]'
              }
            `}
          >
            {s === 'MALE' ? 'M' : 'F'}
          </button>
        ))}
      </div>

      {/* CMD+K trigger */}
      <button
        onClick={onOpenCommandPalette}
        aria-label="Open command palette (Cmd K)"
        className="
          hidden sm:flex shrink-0 items-center gap-1 rounded border border-[var(--color-border)]
          px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest
          text-[var(--color-ink-muted)] hover:border-[var(--color-border-active)]
          hover:text-[var(--color-ink-meta)] transition-colors duration-150
        "
      >
        <kbd className="not-italic">CMD</kbd>
        <span>+</span>
        <kbd className="not-italic">K</kbd>
      </button>

      {/* Operator Tools */}
      <button
        onClick={onOpenOperatorTools}
        aria-label="Open Operator Tools panel"
        className="
          shrink-0 rounded border border-[var(--color-border)]
          px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest
          text-[var(--color-ink-muted)] hover:border-[var(--color-border-active)]
          hover:text-[var(--color-ink-meta)] transition-colors duration-150
        "
      >
        Tools
      </button>
    </header>
  );
}
