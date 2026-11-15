// Right Slide-Over Drawer Shell (`SlideOverDrawerShell`).
// Enforces:
// - `0` `backdrop-filter` (`bg-[#06080d]`, crisp `1px` border) so total active blur shells
//   never exceed `<= 4`
// - `overscroll-behavior: contain` + `stopPropagation` on `onWheel`, `onPointerDown`, and
//   `onTouchMove` so scrolling inside drawers never bleeds into the 3D `OrbitControls` stage
// - NotebookLM Risk 1 Fix: GSAP `translate3d` entrance gated behind `waitForFontsReadyBounded()`
// - Accessible focus trap + restoration to `invokerElementId` on close

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  prefersReducedMotionSafe,
  waitForFontsReadyBounded,
} from '../instruments/instrumentMath';
import { restoreFocusById } from './drawerLogic';

export interface SlideOverDrawerShellProps {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  invokerElementId?: string | null;
  children: React.ReactNode;
}

export function SlideOverDrawerShell({
  open,
  onClose,
  eyebrow,
  title,
  subtitle,
  headerRight,
  invokerElementId,
  children,
}: SlideOverDrawerShellProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // NotebookLM Risk 1: Gate GSAP slide transition behind `waitForFontsReadyBounded()` inside `gsap.context()`
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current;
    let cancelled = false;

    const ctx = gsap.context(() => {
      if (prefersReducedMotionSafe()) {
        gsap.set(el, { xPercent: 0, opacity: 1 });
        closeBtnRef.current?.focus({ preventScroll: true });
        return;
      }
      gsap.set(el, { xPercent: 8, opacity: 0.92 });
    }, panelRef);

    if (!prefersReducedMotionSafe()) {
      void waitForFontsReadyBounded().then(() => {
        if (cancelled || !panelRef.current) return;
        ctx.add(() => {
          if (!panelRef.current) return;
          gsap.to(panelRef.current, {
            xPercent: 0,
            opacity: 1,
            duration: 0.24,
            ease: 'power3.out',
            clearProps: 'transform,opacity',
          });
        });
        closeBtnRef.current?.focus({ preventScroll: true });
      });
    }

    return () => {
      cancelled = true;
      ctx.revert();
    };
  }, [open]);

  // Trap Tab / Shift+Tab inside the open drawer so focus stays contained
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  const handleCloseClick = (): void => {
    onClose();
    restoreFocusById(invokerElementId ?? null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/65"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          handleCloseClick();
        }
      }}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
        className="flex h-[100dvh] w-full max-w-[580px] flex-col border-l border-white/15 bg-[#06080d] text-[var(--color-ink-display)] shadow-2xl"
        style={{ overscrollBehavior: 'contain' }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-[#080b12] px-4 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold tracking-widest text-cyan-300">
              {eyebrow}
            </div>
            <h2 className="mt-0.5 truncate font-sans text-sm font-semibold text-[var(--color-ink-display)]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 font-mono text-[10px] text-[var(--color-ink-meta)]">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            <button
              ref={closeBtnRef}
              type="button"
              onClick={handleCloseClick}
              className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-white/15 bg-black px-3 font-mono text-[11px] font-semibold text-[var(--color-ink-display)]"
            >
              [ESC] CLOSE
            </button>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto p-4"
          style={{ overscrollBehavior: 'contain' }}
        >
          {children}
        </div>
      </aside>
    </div>
  );
}
