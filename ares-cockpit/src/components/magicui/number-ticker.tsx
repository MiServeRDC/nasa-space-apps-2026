// Restrained Magic UI style discrete NumberTicker for stepped HUD telemetry counters.
// Reserved exclusively for stepped counters (active alarm count, OWLT seconds, readiness score).
// Continuous 20Hz vitals remain on zero-re-render TabularCounter / WaveformCanvas2D loops.

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export interface NumberTickerProps {
  value: number | null | undefined;
  decimals?: number;
  direction?: 'up' | 'down';
  durationSec?: number;
  padStart?: number;
  prefix?: string;
  suffix?: string;
  missingText?: string;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

function formatDiscreteMetric(
  value: number,
  decimals: number,
  padStart: number,
  prefix: string,
  suffix: string,
): string {
  const safeDecimals = Math.max(0, Math.min(4, Math.trunc(decimals)));
  const fixed = value.toFixed(safeDecimals);
  if (padStart > 0 && safeDecimals === 0) {
    const sign = value < 0 ? '-' : '';
    const absDigits = Math.abs(Math.round(value)).toString().padStart(padStart, '0');
    return `${prefix}${sign}${absDigits}${suffix}`;
  }
  return `${prefix}${fixed}${suffix}`;
}

export function NumberTicker({
  value,
  decimals = 0,
  direction = 'up',
  durationSec = 0.28,
  padStart = 0,
  prefix = '',
  suffix = '',
  missingText = '--',
  className = '',
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: NumberTickerProps) {
  const elRef = useRef<HTMLSpanElement | null>(null);
  const lastNumericRef = useRef<number | null>(
    value !== null && value !== undefined && Number.isFinite(value)
      ? direction === 'down'
        ? value
        : value
      : null,
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    if (value === null || value === undefined || !Number.isFinite(value)) {
      lastNumericRef.current = null;
      el.textContent = missingText;
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const startVal =
      lastNumericRef.current !== null && Number.isFinite(lastNumericRef.current)
        ? lastNumericRef.current
        : value;

    if (reducedMotion || durationSec <= 0 || Math.abs(value - startVal) < 1e-6) {
      lastNumericRef.current = value;
      el.textContent = formatDiscreteMetric(value, decimals, padStart, prefix, suffix);
      return;
    }

    const tweenState = { current: startVal };
    const ctx = gsap.context(() => {
      gsap.to(tweenState, {
        current: value,
        duration: durationSec,
        ease: 'power2.out',
        onUpdate: () => {
          if (elRef.current) {
            elRef.current.textContent = formatDiscreteMetric(
              tweenState.current,
              decimals,
              padStart,
              prefix,
              suffix,
            );
          }
        },
        onComplete: () => {
          lastNumericRef.current = value;
          if (elRef.current) {
            elRef.current.textContent = formatDiscreteMetric(
              value,
              decimals,
              padStart,
              prefix,
              suffix,
            );
          }
        },
      });
    }, elRef);

    return () => {
      ctx.revert();
    };
  }, [decimals, direction, durationSec, missingText, padStart, prefix, suffix, value]);

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span
        ref={elRef}
        aria-live="off"
        aria-label={ariaLabel}
        data-testid={dataTestId}
        data-availability="unavailable"
        className={`ares-missing-hatch ares-tabular-metric inline-block rounded px-1 font-mono text-[var(--color-ink-muted)] ${className}`}
      >
        {missingText}
      </span>
    );
  }

  return (
    <span
      ref={elRef}
      aria-live="off"
      aria-label={ariaLabel}
      data-testid={dataTestId}
      data-availability="available"
      className={`ares-tabular-metric inline-block font-mono ${className}`}
    >
      {formatDiscreteMetric(value, decimals, padStart, prefix, suffix)}
    </span>
  );
}
