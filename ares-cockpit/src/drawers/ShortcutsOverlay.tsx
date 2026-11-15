// Spatial Workbench Keyboard Shortcuts Overlay (`ShortcutsOverlay`).
// Displays the locked ARES-Health single-key & modifier shortcuts (`Cmd+K / Alt+Space`,
// `G / E / A`, `1 - 5`, `M / F`, `W`, `P`, `O`, `L`, `S`, `V`, `?`, `ESC` priority stack)
// on an opaque `#05070b` OLED modal (`0` `backdrop-filter`).

import React, { useEffect, useRef } from 'react';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { restoreFocusById } from './drawerLogic';

interface ShortcutRow {
  keys: string;
  action: string;
  scope: string;
}

const SHORTCUT_GROUPS: ReadonlyArray<{
  heading: string;
  rows: readonly ShortcutRow[];
}> = [
  {
    heading: 'CLOSED-LOOP PHASE & COUNTERFACTUAL CONTROLS',
    rows: [
      { keys: 'G / E / A', action: 'Switch 01 GATHER -> 02 EVALUATE -> 03 ACT phase', scope: 'Global' },
      { keys: 'W', action: 'Open Counterfactual What-If Stress Sliders in EVALUATE', scope: 'Global' },
      { keys: 'P', action: 'Jump directly to MedOps Branched Playbook DAG in ACT', scope: 'Global' },
      { keys: 'M / F', action: 'Morph 3D Biodigital Twin between MALE & FEMALE baselines', scope: '3D Stage' },
    ],
  },
  {
    heading: '3D ANATOMICAL HYPERGRAPH & OVERLAY SURFACES',
    rows: [
      { keys: '1 - 5', action: 'Focus UBERON organ camera preset (IJV, Heart, Optic, Soleus, Renal)', scope: '3D Stage' },
      { keys: 'Cmd+K / Alt+Space', action: 'Toggle FastMCP & UBERON Command Palette', scope: 'Modal' },
      { keys: 'O', action: 'Toggle Deep-Space Mission Portal & 24-Dataset Atlas Drawer', scope: 'Drawer' },
      { keys: 'L', action: 'Toggle SHA-256 Audit Ledger & NASA-STD-3001 Privacy Drawer', scope: 'Drawer' },
      { keys: 'S', action: 'Toggle <= 29.8s OpenScreenStudio Director Timeline Bar', scope: 'Studio' },
      { keys: 'V', action: 'Toggle Air-Gapped Voice Copilot Listener ([V2 10027] Gated)', scope: 'Voice' },
      { keys: '?', action: 'Toggle this Keyboard Shortcuts Reference', scope: 'Modal' },
      { keys: 'ESC', action: 'Deterministic Unwind: Toast -> Palette -> Modal -> Drawer -> Studio -> Breadcrumb -> Region', scope: 'Capture' },
    ],
  },
];

export function ShortcutsOverlay() {
  const open = useWorkbenchStore((s) => s.shortcutsModalOpen);
  const invokerElementId = useWorkbenchStore((s) => s.invokerElementId);
  const setShortcutsModalOpen = useWorkbenchStore((s) => s.setShortcutsModalOpen);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      closeBtnRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  if (!open) return null;

  const handleClose = (): void => {
    const restoreId = invokerElementId;
    setShortcutsModalOpen(false);
    restoreFocusById(restoreId);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ARES-Health keyboard shortcuts"
      className="fixed inset-0 z-[93] flex items-center justify-center bg-black/85 p-3"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#05070b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-[#080b11] px-4 py-3">
          <div>
            <div className="font-mono text-[10px] font-semibold tracking-widest text-cyan-300">
              MICROGRAVITY HANDS-ON-THROTTLE ERGONOMICS
            </div>
            <h2 className="mt-0.5 font-sans text-sm font-semibold text-[var(--color-ink-display)]">
              Spatial Workbench Keyboard Orchestration Map
            </h2>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={handleClose}
            className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-white/15 bg-black px-3 font-mono text-xs font-semibold text-[var(--color-ink-display)]"
          >
            [ESC] CLOSE
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.heading} className="space-y-2">
              <div className="font-mono text-[10px] font-semibold tracking-wider text-[var(--color-ink-meta)]">
                {group.heading}
              </div>
              <div className="space-y-1.5">
                {group.rows.map((row) => (
                  <div
                    key={row.keys}
                    className="ares-inner-well flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-sans text-xs text-[var(--color-ink-display)]">
                        {row.action}
                      </div>
                      <div className="text-[9px] text-[var(--color-ink-muted)]">
                        LAYER: {row.scope.toUpperCase()}
                      </div>
                    </div>
                    <kbd className="shrink-0 rounded border border-cyan-400/50 bg-black px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                      {row.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
