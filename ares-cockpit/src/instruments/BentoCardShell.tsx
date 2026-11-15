// Liquid Glass 2.0 Bento container (`BentoCardShell`) with cursor-proximity Houdini
// `--mouse-x` / `--mouse-y` specular rim tracking (`0` React re-renders), strict blur-shell
// discipline (`tier="root"` -> `.hud-specular-card` vs `tier="nested"` -> `.ares-inner-well`
// zero `backdrop-filter`), and NotebookLM Risk 1 font-gated GSAP `Flip` `Peek -> Pin -> Expand` transitions.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import {
  prefersReducedMotionSafe,
  waitForFontsReadyBounded,
} from './instrumentMath';

let flipPluginRegistered = false;
function ensureFlipRegistered(): void {
  if (!flipPluginRegistered) {
    gsap.registerPlugin(Flip);
    flipPluginRegistered = true;
  }
}

export type BentoCardTier = 'root' | 'nested';

export interface BentoCardShellProps {
  id?: string;
  title: string;
  eyebrow?: string;
  badge?: React.ReactNode;
  tier?: BentoCardTier;
  pinned?: boolean;
  onTogglePin?: () => void;
  expandable?: boolean;
  defaultExpanded?: boolean;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  inhibited?: boolean;
  ariaLabel?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function BentoCardShell({
  id,
  title,
  eyebrow,
  badge,
  tier = 'root',
  pinned = false,
  onTogglePin,
  expandable = false,
  defaultExpanded = true,
  headerActions,
  footer,
  inhibited = false,
  ariaLabel,
  className = '',
  bodyClassName = '',
  children,
}: BentoCardShellProps) {
  const shellRef = useRef<HTMLElement>(null);
  const flipCleanupRef = useRef<gsap.Context | null>(null);
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);

  useEffect(() => {
    return () => {
      const el = shellRef.current;
      if (el) {
        Flip.killFlipsOf(el);
      }
      flipCleanupRef.current?.revert();
      flipCleanupRef.current = null;
    };
  }, []);

  // Zero-GC cursor-proximity specular rim update via CSS Houdini custom properties
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (tier !== 'root') return;
      const el = shellRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      const relY = event.clientY - rect.top;
      el.style.setProperty('--mouse-x', `${relX.toFixed(1)}px`);
      el.style.setProperty('--mouse-y', `${relY.toFixed(1)}px`);
    },
    [tier],
  );

  // NotebookLM Risk 1 Fix: Gate GSAP Flip.getState/Flip.from behind `waitForFontsReadyBounded()`
  const runFontGatedFlip = useCallback(async (mutateState: () => void) => {
    const el = shellRef.current;
    if (!el || prefersReducedMotionSafe()) {
      mutateState();
      return;
    }

    ensureFlipRegistered();
    await waitForFontsReadyBounded();

    if (!shellRef.current) {
      mutateState();
      return;
    }

    Flip.killFlipsOf(el);
    flipCleanupRef.current?.revert();

    const beforeState = Flip.getState(el);
    mutateState();

    // Schedule Flip.from on the next animation frame after React commits the mutated layout
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        if (!shellRef.current) return;
        const ctx = gsap.context(() => {
          Flip.from(beforeState, {
            duration: 0.38,
            ease: 'power3.out',
            absolute: false,
            scale: false,
            clearProps: 'transform,width,height',
          });
        }, shellRef.current);
        flipCleanupRef.current = ctx;
      });
    }
  }, []);

  const handlePinClick = useCallback(() => {
    if (!onTogglePin) return;
    void runFontGatedFlip(() => {
      onTogglePin();
    });
  }, [onTogglePin, runFontGatedFlip]);

  const handleExpandToggle = useCallback(() => {
    void runFontGatedFlip(() => {
      setExpanded((prev) => !prev);
    });
  }, [runFontGatedFlip]);

  const surfaceClass =
    tier === 'root' ? 'hud-specular-card' : 'ares-inner-well';
  const inhibitedClass = inhibited ? 'ares-inhibited-surface' : '';

  return (
    <section
      ref={shellRef}
      id={id}
      aria-label={ariaLabel ?? title}
      data-tier={tier}
      data-state={pinned ? 'pinned' : expanded ? 'expanded' : 'peek'}
      onPointerMove={handlePointerMove}
      className={`${surfaceClass} ${inhibitedClass} flex flex-col overflow-hidden ${className}`.trim()}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-[var(--color-ink-meta)]">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words font-sans text-sm font-semibold tracking-tight text-[var(--color-ink-display)]">
              {title}
            </h2>
            {badge}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {headerActions}

          {onTogglePin ? (
            <button
              type="button"
              onClick={handlePinClick}
              aria-pressed={pinned}
              aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
              className={`ares-touch-target ares-interactive rounded-lg border px-2.5 font-mono text-[10px] font-semibold tracking-wider ${
                pinned
                  ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-black/40 text-[var(--color-ink-meta)]'
              }`}
            >
              {pinned ? 'PINNED' : 'PIN'}
            </button>
          ) : null}

          {expandable ? (
            <button
              type="button"
              onClick={handleExpandToggle}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
              className="ares-touch-target ares-interactive rounded-lg border border-white/10 bg-black/40 px-2.5 font-mono text-[10px] font-semibold tracking-wider text-[var(--color-ink-meta)]"
            >
              {expanded ? 'COLLAPSE' : 'EXPAND'}
            </button>
          ) : null}
        </div>
      </header>

      {expanded ? (
        <div className={`flex-1 overflow-y-auto px-3.5 py-3 ${bodyClassName}`.trim()}>
          {children}
        </div>
      ) : null}

      {footer && expanded ? (
        <footer className="border-t border-white/[0.07] px-3.5 py-2 font-mono text-[10px] text-[var(--color-ink-meta)]">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
