// Capture-phase keyboard orchestrator, input/slider focus guards, deterministic ESC
// unwind stack, and background `inert` / `aria-hidden` accessibility coordinator.
// Pure TypeScript + bare `'react'` import so `node --test --experimental-strip-types`
// can import and verify every guard and hotkey rule directly.

import { useEffect } from 'react';
import type { AnatomicalRegionWireId } from '../types/telemetry';
import type {
  EscapeUnwindLayer,
  StudioOrchestratorSlice,
  WorkbenchOrchestratorSlice,
} from '../types/workbench';

export const ORDERED_UBERON_HOTKEY_REGIONS: readonly AnatomicalRegionWireId[] = [
  'EyeOcularSans',
  'InternalJugularVein',
  'HeartCardioAutonomic',
  'SoleusCalcaneus',
  'BrainVestibularCns',
];

export const MAIN_WORKBENCH_SCAFFOLD_ID = 'main-workbench-scaffold';
export const DRAWER_HOST_LAYER_ID = 'drawer-host-layer';

export interface ElementLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
  closest?: (selector: string) => ElementLike | null;
  blur?: () => void;
  focus?: () => void;
  inert?: boolean;
}

export interface KeyboardEventLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
  preventDefault: () => void;
  stopPropagation?: () => void;
}

export interface DocumentScaffoldLike {
  activeElement?: ElementLike | null;
  getElementById: (id: string) => ElementLike | null;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

const EDITABLE_ARIA_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

function asElementLike(node: unknown): ElementLike | null {
  if (typeof node === 'object' && node !== null) {
    return node as ElementLike;
  }
  return null;
}

/**
 * Returns `true` when keyboard focus resides inside a text-entry, select, or contenteditable
 * control where single-letter hotkeys (`G`, `E`, `A`, `1-5`, `M`, `F`, `W`, `P`, `L`, `S`, `V`, `?`)
 * must never steal keystrokes.
 */
export function isEditableElement(target: unknown): boolean {
  const el = asElementLike(target);
  if (!el) return false;

  if (el.isContentEditable === true) return true;
  const contentEditableAttr = el.getAttribute?.('contenteditable');
  if (contentEditableAttr === '' || contentEditableAttr === 'true') {
    return true;
  }

  const role = el.getAttribute?.('role')?.toLowerCase() ?? '';
  if (EDITABLE_ARIA_ROLES.has(role)) {
    return true;
  }

  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (tag === 'INPUT') {
    const inputType = (el.type ?? el.getAttribute?.('type') ?? 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }

  if (typeof el.closest === 'function') {
    const ancestorEditable = el.closest('[contenteditable="true"], [role="textbox"]');
    if (ancestorEditable) return true;
  }

  return false;
}

export interface SliderGuardContext {
  isScrubbing?: boolean;
  pointerDragging?: boolean;
  activeElement?: unknown;
}

/**
 * Returns `true` when the user is actively scrubbing a timeline/What-If slider (`input[type="range"]`,
 * `[role="slider"]`, `isScrubbing` lock) or dragging the 3D canvas (`pointerdown` active).
 */
export function isSliderOrDraggingActive(
  target: unknown,
  context: SliderGuardContext = {},
): boolean {
  if (context.isScrubbing || context.pointerDragging) {
    return true;
  }

  for (const candidate of [target, context.activeElement]) {
    const el = asElementLike(candidate);
    if (!el) continue;

    const tag = (el.tagName ?? '').toUpperCase();
    const inputType = (el.type ?? el.getAttribute?.('type') ?? '').toLowerCase();
    if (tag === 'INPUT' && inputType === 'range') {
      return true;
    }

    const role = el.getAttribute?.('role')?.toLowerCase() ?? '';
    if (role === 'slider') {
      return true;
    }

    if (
      el.getAttribute?.('data-canvas-interacting') === 'true' ||
      el.getAttribute?.('data-scrubbing') === 'true'
    ) {
      return true;
    }

    if (typeof el.closest === 'function') {
      const dragHost = el.closest(
        '[role="slider"], [data-canvas-interacting="true"], [data-scrubbing="true"]',
      );
      if (dragHost) return true;
    }
  }

  return false;
}

/**
 * Deterministically toggles `inert` and `aria-hidden` on underlying scaffold layers
 * according to the Z-index stack (`Modal Z-90 -> Drawer Z-50 -> Workbench Z-20`).
 */
export function syncBackgroundInertState(
  doc: DocumentScaffoldLike | null,
  overlayState: { hasModalOverlay: boolean; hasDrawerOpen: boolean },
): void {
  if (!doc) return;
  const mainScaffold = doc.getElementById(MAIN_WORKBENCH_SCAFFOLD_ID);
  const drawerLayer = doc.getElementById(DRAWER_HOST_LAYER_ID);

  const lockMain = overlayState.hasModalOverlay || overlayState.hasDrawerOpen;
  if (mainScaffold) {
    mainScaffold.inert = lockMain;
    if (lockMain) {
      mainScaffold.setAttribute?.('inert', '');
      mainScaffold.setAttribute?.('aria-hidden', 'true');
    } else {
      mainScaffold.removeAttribute?.('inert');
      mainScaffold.removeAttribute?.('aria-hidden');
    }
  }

  const lockDrawer = overlayState.hasModalOverlay;
  if (drawerLayer) {
    drawerLayer.inert = lockDrawer;
    if (lockDrawer) {
      drawerLayer.setAttribute?.('inert', '');
      drawerLayer.setAttribute?.('aria-hidden', 'true');
    } else {
      drawerLayer.removeAttribute?.('inert');
      drawerLayer.removeAttribute?.('aria-hidden');
    }
  }
}

export type DispatchedShortcutKind =
  | 'TOGGLE_COMMAND_PALETTE'
  | 'ESCAPE_UNWIND'
  | 'PHASE_GATHER'
  | 'PHASE_EVALUATE'
  | 'PHASE_ACT'
  | 'FOCUS_UBERON_NODE'
  | 'SEX_MALE'
  | 'SEX_FEMALE'
  | 'OPEN_WHAT_IF'
  | 'OPEN_PLAYBOOKS'
  | 'TOGGLE_MISSION_PORTAL'
  | 'TOGGLE_AUDIT_LEDGER'
  | 'TOGGLE_STUDIO'
  | 'TOGGLE_VOICE'
  | 'TOGGLE_SHORTCUTS_MODAL'
  | 'IGNORED';

export interface OrchestratorDispatchOutcome {
  handled: boolean;
  action: DispatchedShortcutKind;
  unwoundLayer?: EscapeUnwindLayer;
}

/**
 * Pure capture-phase keydown evaluator & dispatcher.
 */
export function dispatchWorkbenchKeyDown(
  event: KeyboardEventLike,
  workbench: WorkbenchOrchestratorSlice,
  options: {
    studio?: StudioOrchestratorSlice | null;
    pointerDragging?: boolean;
    doc?: DocumentScaffoldLike | null;
  } = {},
): OrchestratorDispatchOutcome {
  if (event.defaultPrevented) {
    return { handled: false, action: 'IGNORED' };
  }

  const doc = options.doc ?? null;
  const activeEl = doc?.activeElement ?? null;
  const target = event.target ?? activeEl;

  const isModK =
    Boolean(event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    event.key.toLowerCase() === 'k';
  const isAltSpace =
    Boolean(event.altKey) &&
    !event.metaKey &&
    !event.ctrlKey &&
    (event.code === 'Space' || event.key === ' ' || event.key === '\u00a0');

  // 1. Global Multimodal Launcher: Cmd+K / Ctrl+K / Alt+Space
  if (isModK || isAltSpace) {
    if (event.repeat) return { handled: true, action: 'IGNORED' };
    event.preventDefault();
    event.stopPropagation?.();
    if (workbench.commandPaletteOpen) {
      const restoreId = workbench.closeCommandPalette(false);
      if (restoreId && doc) {
        doc.getElementById(restoreId)?.focus?.();
      }
    } else {
      const invokerId = asElementLike(activeEl)?.getAttribute?.('id') ?? null;
      workbench.openCommandPalette('COMMANDS', null, invokerId);
    }
    return { handled: true, action: 'TOGGLE_COMMAND_PALETTE' };
  }

  // 2. Deterministic Top-Down ESC Unwind Stack
  if (event.key === 'Escape') {
    if (event.repeat) return { handled: true, action: 'IGNORED' };

    // If focused inside an editable field and NOT inside a top-level modal overlay,
    // blur the input first so Escape never destroys underlying drawer context unexpectedly.
    const editableFocused = isEditableElement(target) || isEditableElement(activeEl);
    if (
      editableFocused &&
      !workbench.commandPaletteOpen &&
      !workbench.shortcutsModalOpen &&
      !workbench.voiceSafetyBlockToast?.active
    ) {
      event.preventDefault();
      event.stopPropagation?.();
      asElementLike(activeEl ?? target)?.blur?.();
      return {
        handled: true,
        action: 'ESCAPE_UNWIND',
        unwoundLayer: 'EDITABLE_BLUR',
      };
    }

    const { layer, restoreFocusId } = workbench.unwindTopEscapeLayer();
    if (layer !== 'NONE') {
      event.preventDefault();
      event.stopPropagation?.();
      if (restoreFocusId && doc) {
        doc.getElementById(restoreFocusId)?.focus?.();
      }
      return {
        handled: true,
        action: 'ESCAPE_UNWIND',
        unwoundLayer: layer,
      };
    }
    return { handled: false, action: 'IGNORED', unwoundLayer: 'NONE' };
  }

  // 3. Guard single-key shortcuts against modifiers, repeats, text inputs, sliders, and open modals
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
    return { handled: false, action: 'IGNORED' };
  }

  if (isEditableElement(target) || isEditableElement(activeEl)) {
    return { handled: false, action: 'IGNORED' };
  }

  const isScrubbing = Boolean(workbench.isScrubbing || options.studio?.isScrubbing);
  if (
    isSliderOrDraggingActive(target, {
      isScrubbing,
      pointerDragging: options.pointerDragging,
      activeElement: activeEl,
    })
  ) {
    return { handled: false, action: 'IGNORED' };
  }

  // Allow '?' to toggle ShortcutsOverlay off if it is open; block other single-key hotkeys under modals
  if (event.key === '?' || (event.shiftKey && event.code === 'Slash')) {
    if (workbench.commandPaletteOpen) {
      return { handled: false, action: 'IGNORED' };
    }
    event.preventDefault();
    const invokerId = asElementLike(activeEl)?.getAttribute?.('id') ?? null;
    workbench.setShortcutsModalOpen(!workbench.shortcutsModalOpen, invokerId);
    return { handled: true, action: 'TOGGLE_SHORTCUTS_MODAL' };
  }

  if (workbench.commandPaletteOpen || workbench.shortcutsModalOpen) {
    return { handled: false, action: 'IGNORED' };
  }

  const upper = event.key.toUpperCase();

  switch (upper) {
    case 'G':
      event.preventDefault();
      workbench.setPhase('GATHER');
      return { handled: true, action: 'PHASE_GATHER' };

    case 'E':
      event.preventDefault();
      workbench.setPhase('EVALUATE');
      return { handled: true, action: 'PHASE_EVALUATE' };

    case 'A':
      event.preventDefault();
      workbench.setPhase('ACT');
      return { handled: true, action: 'PHASE_ACT' };

    case '1':
    case '2':
    case '3':
    case '4':
    case '5': {
      event.preventDefault();
      const idx = Number(upper) - 1;
      const region = ORDERED_UBERON_HOTKEY_REGIONS[idx] ?? null;
      workbench.selectUberonRegion(
        workbench.selectedUberonRegion === region ? null : region,
      );
      return { handled: true, action: 'FOCUS_UBERON_NODE' };
    }

    case 'M':
      event.preventDefault();
      workbench.setTwinSex('MALE');
      return { handled: true, action: 'SEX_MALE' };

    case 'F':
      event.preventDefault();
      workbench.setTwinSex('FEMALE');
      return { handled: true, action: 'SEX_FEMALE' };

    case 'W':
      event.preventDefault();
      workbench.setPhase('EVALUATE');
      workbench.setEvaluateTab('WHAT_IF_STRESS');
      workbench.setPinnedCard('WHAT_IF_COUNTERFACTUAL');
      return { handled: true, action: 'OPEN_WHAT_IF' };

    case 'P':
      event.preventDefault();
      workbench.setPhase('ACT');
      workbench.setPinnedCard('PLAYBOOK_DAG');
      return { handled: true, action: 'OPEN_PLAYBOOKS' };

    case 'O': {
      event.preventDefault();
      if (workbench.drawer === 'MISSION_PORTAL') {
        const restoreId = workbench.closeDrawer();
        if (restoreId && doc) doc.getElementById(restoreId)?.focus?.();
      } else {
        const invokerId = asElementLike(activeEl)?.getAttribute?.('id') ?? null;
        workbench.openDrawer('MISSION_PORTAL', invokerId);
      }
      return { handled: true, action: 'TOGGLE_MISSION_PORTAL' };
    }

    case 'L': {
      event.preventDefault();
      if (workbench.drawer === 'AUDIT_PROVENANCE') {
        const restoreId = workbench.closeDrawer();
        if (restoreId && doc) doc.getElementById(restoreId)?.focus?.();
      } else {
        const invokerId = asElementLike(activeEl)?.getAttribute?.('id') ?? null;
        workbench.openDrawer('AUDIT_PROVENANCE', invokerId);
      }
      return { handled: true, action: 'TOGGLE_AUDIT_LEDGER' };
    }

    case 'S':
      event.preventDefault();
      workbench.toggleStudioBar();
      return { handled: true, action: 'TOGGLE_STUDIO' };

    case 'V':
      event.preventDefault();
      workbench.toggleVoiceListening();
      return { handled: true, action: 'TOGGLE_VOICE' };

    default:
      return { handled: false, action: 'IGNORED' };
  }
}

export interface UseKeyboardOrchestratorParams {
  getWorkbenchState: () => WorkbenchOrchestratorSlice;
  getStudioState?: () => StudioOrchestratorSlice;
  hasModalOverlay: boolean;
  hasDrawerOpen: boolean;
  enabled?: boolean;
}

/**
 * React hook installing capture-phase `keydown` + pointer-drag tracking and
 * synchronizing `inert` attributes on background scaffold containers.
 */
export function useKeyboardOrchestrator({
  getWorkbenchState,
  getStudioState,
  hasModalOverlay,
  hasDrawerOpen,
  enabled = true,
}: UseKeyboardOrchestratorParams): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    syncBackgroundInertState(document as unknown as DocumentScaffoldLike, {
      hasModalOverlay,
      hasDrawerOpen,
    });
    return () => {
      syncBackgroundInertState(document as unknown as DocumentScaffoldLike, {
        hasModalOverlay: false,
        hasDrawerOpen: false,
      });
    };
  }, [hasModalOverlay, hasDrawerOpen]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let pointerDragging = false;

    const onPointerDown = () => {
      pointerDragging = true;
    };
    const onPointerRelease = () => {
      pointerDragging = false;
    };

    const onKeyDownCapture = (e: KeyboardEvent) => {
      dispatchWorkbenchKeyDown(e, getWorkbenchState(), {
        studio: getStudioState ? getStudioState() : null,
        pointerDragging,
        doc: document as unknown as DocumentScaffoldLike,
      });
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerRelease, { passive: true });
    window.addEventListener('pointercancel', onPointerRelease, { passive: true });
    window.addEventListener('blur', onPointerRelease);
    window.addEventListener('keydown', onKeyDownCapture, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      window.removeEventListener('blur', onPointerRelease);
      window.removeEventListener('keydown', onKeyDownCapture, { capture: true });
    };
  }, [enabled, getWorkbenchState, getStudioState]);
}
