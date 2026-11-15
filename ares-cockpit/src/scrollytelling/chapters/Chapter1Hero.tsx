// Chapter 1: Hero / Descent — full-viewport narrative entry point.
// Displays mission tagline, 3 hero biometrics, 30-second rolling range, and
// crew activity selector with clinical rationale.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ACTIVITY_CONTEXT, type CrewActivity } from '../../lib/missionContext';
import { RecentRange } from '../../modules/crew-vitals/MeasurementContext';
import { useScrollyContext } from '../ScrollyContext';
import type { RecordedHistoryPoint } from '../../lib/useTelemetry';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Chapter1HeroProps {
  hr: number | null;
  spo2: number | null;
  resp: number | null;
  history: RecordedHistoryPoint[];
  crewActivity: CrewActivity;
  onActivityChange: (activity: CrewActivity) => void;
}

// ---------------------------------------------------------------------------
// HeroMetric — large tabular numeral display
// ---------------------------------------------------------------------------

function HeroMetric({
  label,
  value,
  unit,
  alarm,
}: {
  label: string;
  value: number | null;
  unit: string;
  alarm?: boolean;
}) {
  const displayValue = value === null ? '--' : Math.round(value).toString();
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-mono text-[64px] leading-none font-bold tabular-nums ${
            alarm
              ? 'text-[var(--color-status-critical)]'
              : value === null
              ? 'text-[var(--color-ink-muted)]'
              : 'text-[var(--color-ink-display)]'
          }`}
          style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum" 1, "zero" 1' }}
        >
          {displayValue}
        </span>
        <span className="font-mono text-sm text-[var(--color-ink-muted)]">{unit}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter1Hero
// ---------------------------------------------------------------------------

export function Chapter1Hero({
  hr,
  spo2,
  resp,
  history,
  crewActivity,
  onActivityChange,
}: Chapter1HeroProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);

  // ScrollTrigger: set activeChapter to 1 when this section enters viewport.
  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveChapter(1),
        onEnterBack: () => setActiveChapter(1),
      });
    },
    { scope: sectionRef, dependencies: [setActiveChapter] },
  );

  const hrAlarm = typeof hr === 'number' && (hr > 100 || hr < 50);
  const spo2Alarm = typeof spo2 === 'number' && spo2 < 94;

  return (
    <section
      ref={sectionRef}
      data-chapter="1"
      className="relative flex h-dvh min-h-screen flex-col justify-between overflow-hidden px-6 pb-10 pt-16 md:px-14"
      aria-labelledby="ch1-heading"
    >
      {/* Top editorial text block */}
      <div className="max-w-2xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--color-ink-muted)] mb-3">
          Health overview // Autonomous Deep-Space Medical Twin
        </p>
        <h1
          id="ch1-heading"
          className="font-sans text-4xl font-semibold leading-tight tracking-tight text-[var(--color-ink-display)] sm:text-5xl"
          style={{ letterSpacing: 'var(--tracking-h1)' }}
        >
          Mission-Day
          <br />
          <span className="text-[var(--color-accent)]">Physiology</span>
        </h1>
        <p className="mt-4 font-sans text-sm leading-relaxed text-[var(--color-ink-meta)] max-w-md">
          Continuous autonomous medical monitoring. Every biomarker, every causal
          chain — derived from first principles, referenced to NASA-STD-3001.
        </p>
      </div>

      {/* Hero numbers */}
      <div className="flex flex-wrap gap-10 md:gap-16 mt-auto mb-auto">
        <div className="flex flex-col gap-3">
          <HeroMetric label="Heart Rate" value={hr} unit="bpm" alarm={hrAlarm} />
          <RecentRange history={history} signal="hr" unit="bpm" />
        </div>
        <div className="flex flex-col gap-3">
          <HeroMetric label="Blood Oxygen" value={spo2} unit="%" alarm={spo2Alarm} />
          <RecentRange history={history} signal="spo2" unit="%" />
        </div>
        <div className="flex flex-col gap-3">
          <HeroMetric label="Respiration" value={resp} unit="brpm" />
          <RecentRange history={history} signal="resp" unit="brpm" />
        </div>
      </div>

      {/* Crew activity selector */}
      <div className="mt-auto max-w-lg rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-4">
        <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] mb-2">
          Crew Activity Context
        </p>
        <div className="flex gap-2 mb-3">
          {(['unknown', 'rest', 'exercise'] as const).map((act) => (
            <button
              key={act}
              onClick={() => onActivityChange(act)}
              aria-pressed={crewActivity === act}
              className={`
                rounded px-3 py-1 font-mono text-[10px] uppercase tracking-widest border
                transition-colors duration-150
                ${
                  crewActivity === act
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-active)] hover:text-[var(--color-ink-meta)]'
                }
              `}
            >
              {act === 'unknown' ? 'Unknown' : act === 'rest' ? 'Rest' : 'Exercise / EVA'}
            </button>
          ))}
        </div>
        <p className="font-sans text-xs leading-relaxed text-[var(--color-ink-meta)]">
          {ACTIVITY_CONTEXT[crewActivity]}
        </p>
      </div>

      {/* Scroll-down invitation */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-[var(--color-ink-muted)]">
        <span className="font-mono text-[9px] uppercase tracking-widest">Scroll</span>
        <svg viewBox="0 0 16 24" className="h-5 w-3 animate-bounce" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="1" y="1" width="14" height="22" rx="7" />
          <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
        </svg>
      </div>
    </section>
  );
}
