// Zero-CLS tabular numeric telemetry instrument (`TabularCounter`).
// Enforces:
// 1. `aria-live="off"` so 20 Hz physiological updates NEVER spam assistive screen readers (Risk 5)
// 2. Fixed `1ch` sign slot (`\u2212` true mathematical minus vs `+` / `\u00A0`) + `.ares-tabular-metric`
// 3. Imperative `textContent` updates via `gsap.quickTo` inside `gsap.context` (`0` React state loops)
// 4. Issue #11 null/NaN honesty: NEVER coerces `null` or `NaN` to `0` (`--` or `BEAT_INTERVALS_NOT_AVAILABLE`)

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  formatTabularReadout,
  prefersReducedMotionSafe,
} from './instrumentMath';

export type TabularCounterTone = 'display' | 'nominal' | 'caution' | 'critical' | 'spatial';

export interface TabularCounterProps {
  label: string;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  alwaysShowPlus?: boolean;
  unavailableLabel?: string;
  unavailableReason?: string | null;
  tone?: TabularCounterTone;
  size?: 'sm' | 'md' | 'lg';
  sublabel?: string | null;
  className?: string;
}

const TONE_TEXT_CLASS: Readonly<Record<TabularCounterTone, string>> = {
  display: 'text-[var(--color-ink-display)]',
  nominal: 'text-[var(--color-status-nominal)]',
  caution: 'text-[var(--color-status-caution)]',
  critical: 'text-[var(--color-status-critical)]',
  spatial: 'text-[var(--color-accent-spatial)]',
};

const SIZE_VALUE_CLASS: Readonly<Record<'sm' | 'md' | 'lg', string>> = {
  sm: 'text-sm font-semibold',
  md: 'text-lg font-semibold',
  lg: 'text-2xl font-bold',
};

export function TabularCounter({
  label,
  value,
  unit,
  decimals = 0,
  alwaysShowPlus = false,
  unavailableLabel = '--',
  unavailableReason = null,
  tone = 'display',
  size = 'md',
  sublabel = null,
  className = '',
}: TabularCounterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const signSpanRef = useRef<HTMLSpanElement>(null);
  const digitsSpanRef = useRef<HTMLSpanElement>(null);
  const proxyValueRef = useRef<{ current: number }>({
    current: typeof value === 'number' && Number.isFinite(value) ? value : 0,
  });
  const wasAvailableRef = useRef<boolean>(
    typeof value === 'number' && Number.isFinite(value),
  );
  const quickToSetterRef = useRef<gsap.QuickToFunc | null>(null);

  const initialFormatted = formatTabularReadout(value, {
    decimals,
    alwaysShowPlus,
    unavailableLabel,
    unavailableReason,
  });

  // Bind GSAP quickTo interpolator inside scoped gsap.context for clean teardown
  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;

    const ctx = gsap.context(() => {
      quickToSetterRef.current = gsap.quickTo(proxyValueRef.current, 'current', {
        duration: 0.18,
        ease: 'power2.out',
        onUpdate: () => {
          if (!wasAvailableRef.current) return;
          const nextFmt = formatTabularReadout(proxyValueRef.current.current, {
            decimals,
            alwaysShowPlus,
            unavailableLabel,
            unavailableReason,
          });
          if (signSpanRef.current) {
            signSpanRef.current.textContent = nextFmt.signChar;
          }
          if (digitsSpanRef.current) {
            digitsSpanRef.current.textContent = nextFmt.digitsText;
          }
        },
      });
    }, host);

    return () => {
      quickToSetterRef.current = null;
      ctx.revert();
    };
  }, [alwaysShowPlus, decimals, unavailableLabel, unavailableReason]);

  // Synchronize incoming scalar value imperatively without layout shift or NaN->0 coercion
  useEffect(() => {
    const isNowFinite = typeof value === 'number' && Number.isFinite(value);
    const fmt = formatTabularReadout(value, {
      decimals,
      alwaysShowPlus,
      unavailableLabel,
      unavailableReason,
    });

    if (!isNowFinite) {
      wasAvailableRef.current = false;
      gsap.killTweensOf(proxyValueRef.current);
      if (signSpanRef.current) {
        signSpanRef.current.textContent = fmt.signChar;
      }
      if (digitsSpanRef.current) {
        digitsSpanRef.current.textContent = fmt.digitsText;
      }
      return;
    }

    const reducedMotion = prefersReducedMotionSafe();
    if (!wasAvailableRef.current || reducedMotion || !quickToSetterRef.current) {
      wasAvailableRef.current = true;
      proxyValueRef.current.current = value;
      if (signSpanRef.current) {
        signSpanRef.current.textContent = fmt.signChar;
      }
      if (digitsSpanRef.current) {
        digitsSpanRef.current.textContent = fmt.digitsText;
      }
      return;
    }

    wasAvailableRef.current = true;
    quickToSetterRef.current(value);
  }, [alwaysShowPlus, decimals, unavailableLabel, unavailableReason, value]);

  const isBeatIntervalsMissing =
    !initialFormatted.isAvailable &&
    initialFormatted.badgeReason === 'BEAT_INTERVALS_NOT_AVAILABLE';

  return (
    <div
      ref={rootRef}
      aria-live="off"
      data-available={initialFormatted.isAvailable ? 'true' : 'false'}
      className={`flex flex-col justify-between ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-sans text-[11px] font-medium tracking-wide text-[var(--color-ink-meta)]">
          {label}
        </span>
        {sublabel ? (
          <span className="font-mono text-[9px] tracking-wider text-[var(--color-ink-muted)]">
            {sublabel}
          </span>
        ) : null}
      </div>

      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`ares-tabular-metric inline-flex items-baseline leading-none ${SIZE_VALUE_CLASS[size]} ${
            initialFormatted.isAvailable
              ? TONE_TEXT_CLASS[tone]
              : 'text-[var(--color-ink-muted)]'
          }`}
        >
          <span
            ref={signSpanRef}
            aria-hidden="true"
            className="inline-block w-[1ch] text-right select-none"
          >
            {initialFormatted.signChar}
          </span>
          <span ref={digitsSpanRef}>{initialFormatted.digitsText}</span>
        </span>

        {unit && initialFormatted.isAvailable ? (
          <span
            className="font-mono text-[10px] font-medium tracking-wider text-[var(--color-ink-meta)]"
            style={{ transform: 'translateY(-0.32em)' }}
          >
            {unit}
          </span>
        ) : null}
      </div>

      {isBeatIntervalsMissing ? (
        <span
          className="mt-1 inline-block w-fit rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] leading-none text-amber-300"
          title="1 Hz numeric CSV lacks beat-to-beat R-R intervals; RMSSD is honestly omitted (Issue #11)"
        >
          BEAT_INTERVALS_NOT_AVAILABLE
        </span>
      ) : null}
    </div>
  );
}
