// Keyboard shortcuts help dialog adhering to NASA-STD-3001 and Vercel UI primitives.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import { useEffect, useRef } from 'react';

interface ShortcutGroup {
  category: string;
  items: {
    keys: string[];
    description: string;
    actionLabel: string;
  }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'PRIMARY VIEW NAVIGATION',
    items: [
      { keys: ['1'], description: 'Tactical 20 Hz Flight HUD with GATHER, EVALUATE, ACT pages', actionLabel: 'View: Cockpit' },
      { keys: ['2'], description: 'Ground Control Telemedicine, Latency Simulator & 24-Dataset Atlas', actionLabel: 'View: Ground Portal' },
      { keys: ['3'], description: 'Full-viewport 3D Biodigital Twin with multi-layer coronal slice', actionLabel: 'View: 3D Twin' },
      { keys: ['4'], description: 'OpenScreen Telemetry Studio with spring zoom & timeline scrubber', actionLabel: 'View: Studio' },
    ],
  },
  {
    category: 'BIOLOGICAL PROFILE & CONTROLS',
    items: [
      { keys: ['M'], description: 'Switch astronaut biological profile to MALE (78kg, 12.8mm soleus baseline)', actionLabel: 'Profile: Male' },
      { keys: ['F'], description: 'Switch astronaut biological profile to FEMALE (62kg, 11.2mm soleus baseline)', actionLabel: 'Profile: Female' },
      { keys: ['Space'], description: 'Toggle Telemetry Replay playback / pause (OpenScreen Studio)', actionLabel: 'Play / Pause' },
      { keys: ['R'], description: 'Reset 3D camera pan, tilt, zoom and orbit target to default', actionLabel: 'Reset Camera' },
    ],
  },
  {
    category: 'ACCESSIBILITY & HELP',
    items: [
      { keys: ['?'], description: 'Toggle this keyboard shortcuts dialog HUD', actionLabel: 'Toggle Shortcuts' },
      { keys: ['ESC'], description: 'Dismiss active dialogs, inspection drawers, or modals', actionLabel: 'Close Dialog' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, open, onClose }: KeyboardShortcutsModalProps) {
  const visible = Boolean(isOpen ?? open);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm select-none"
      onClick={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-2xl rounded-lg border border-nominal/60 bg-black p-6 font-mono text-xs shadow-[0_0_30px_rgba(34,211,238,0.2)] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-nominal" />
            <h2 id="shortcuts-title" className="text-sm font-bold tracking-wider text-nominal">
              ARES-HEALTH KEYBOARD SHORTCUTS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-line px-2 py-0.5 text-gray-400 hover:border-nominal hover:text-nominal transition-colors"
            aria-label="Close modal"
          >
            ESC
          </button>
        </div>

        {/* Content list */}
        <div className="mt-4 space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category}>
              <div className="mb-2 text-[11px] font-semibold tracking-wider text-gray-500">
                {group.category}
              </div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.actionLabel}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel p-2.5 transition-colors hover:border-gray-600"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {item.keys.map((k) => (
                          <kbd
                            key={k}
                            className="rounded border border-gray-600 bg-black px-2 py-1 text-[11px] font-bold text-nominal shadow-inner"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                      <span className="font-semibold text-gray-200">{item.actionLabel}</span>
                    </div>
                    <span className="text-[11px] text-gray-400">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-[11px] text-gray-500">
          <span>NASA-STD-3001 High-Contrast Microgravity Roving Focus Specification</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-nominal bg-nominal px-4 py-1.5 font-bold text-black hover:opacity-90 transition-opacity"
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
}
