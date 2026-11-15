// Value-Setter 2.2s Skippable Telemetry Ignition Shutter (`TelemetryIgnitionPreloader`).
// Enforces:
// - Instant bypass when `sessionStorage.getItem('ares_boot_seen') === '1'`, `?skipIntro=1`,
//   `document.documentElement.dataset.bootMode === 'instant'`, or `prefers-reduced-motion: reduce`
// - Instant user skip on `Escape`, `Space`, or `pointerdown`
// - NotebookLM Risk 1 Fix: awaits `waitForFontsReadyBounded()` before measuring or running GSAP shutter
// - NotebookLM Risk 5 Fix: announces ignition completion via `announcePolite`

import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  prefersReducedMotionSafe,
  waitForFontsReadyBounded,
} from '../instruments/instrumentMath';
import { announcePolite } from '../stores/a11yAnnouncer';

export interface TelemetryIgnitionPreloaderProps {
  astronautId?: string;
  onComplete?: () => void;
}

function shouldBypassBootShutter(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return true;
  }
  if (prefersReducedMotionSafe()) {
    return true;
  }
  if (document.documentElement?.dataset?.bootMode === 'instant') {
    return true;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('skipIntro') === '1') {
      return true;
    }
    if (window.sessionStorage.getItem('ares_boot_seen') === '1') {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

function markBootSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem('ares_boot_seen', '1');
  } catch {
    // Ignore storage quota / sandbox restrictions
  }
  if (typeof document !== 'undefined' && document.documentElement?.dataset) {
    document.documentElement.dataset.bootMode = 'instant';
  }
}

export function TelemetryIgnitionPreloader({
  astronautId = 'BIDMC-SUBJECT-01',
  onComplete,
}: TelemetryIgnitionPreloaderProps) {
  const [visible, setVisible] = useState<boolean>(() => !shouldBypassBootShutter());
  const overlayRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const finishedRef = useRef<boolean>(false);

  const dismissImmediately = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markBootSeen();
    setVisible(false);
    announcePolite('ARES-Health autonomous edge telemetry workbench online.');
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    let gsapCtx: gsap.Context | null = null;

    const handleKeySkip = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        dismissImmediately();
      }
    };

    window.addEventListener('keydown', handleKeySkip);

    void (async () => {
      // NotebookLM Risk 1 Fix: wait for local WOFF2 variable fonts before running shutter timeline
      await waitForFontsReadyBounded({ timeoutMs: 1200 });
      if (cancelled || finishedRef.current || !overlayRef.current) return;

      const counterProxy = { pct: 0 };
      gsapCtx = gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            dismissImmediately();
          },
        });

        tl.to(
          counterProxy,
          {
            pct: 100,
            duration: 1.65,
            ease: 'power2.inOut',
            onUpdate: () => {
              if (readoutRef.current) {
                readoutRef.current.textContent = `${Math.round(counterProxy.pct)
                  .toString()
                  .padStart(3, '0')}%`;
              }
              if (progressFillRef.current) {
                progressFillRef.current.style.transform = `scaleX(${(
                  counterProxy.pct / 100
                ).toFixed(3)})`;
              }
            },
          },
          0,
        );

        tl.to(
          overlayRef.current,
          {
            opacity: 0,
            duration: 0.45,
            ease: 'power3.out',
          },
          1.7,
        );
      }, overlayRef.current);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKeySkip);
      gsapCtx?.revert();
    };
  }, [dismissImmediately, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="false"
      aria-label="ARES-Health Telemetry Ignition Sequence"
      onPointerDown={dismissImmediately}
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-black px-6 text-[var(--color-ink-display)] select-none"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#050608] p-6">
        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.14em] text-cyan-300">
          <span>ARES-HEALTH EDGE IGNITION</span>
          <span>AIR-GAPPED LOCAL COMPUTE</span>
        </div>

        <div className="space-y-1">
          <div className="font-sans text-lg font-semibold tracking-tight">
            Locking Autonomous Biomedical Twin
          </div>
          <div className="font-mono text-xs text-[var(--color-ink-meta)]">
            SUBJECT: {astronautId} | GLSL3 SHADER WARMUP &amp; NQS-STL RING BUFFER
          </div>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            ref={progressFillRef}
            className="h-full w-full origin-left bg-cyan-400"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>

        <div className="flex items-center justify-between font-mono text-[11px] text-[var(--color-ink-meta)]">
          <span ref={readoutRef} className="ares-tabular-metric font-semibold text-cyan-200">
            000%
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissImmediately();
            }}
            className="ares-touch-target ares-interactive rounded-lg border border-white/15 bg-black px-3 text-[10px] font-semibold tracking-wider text-[var(--color-ink-display)]"
          >
            SKIP [ESC / SPACE]
          </button>
        </div>
      </div>
    </div>
  );
}
