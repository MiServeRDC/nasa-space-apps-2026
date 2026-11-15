// Zustand (subscribeWithSelector) spatial workbench store for ARES-Health.
// Decouples discrete UI phase/slot/drawer/privacy/interlock state (< 0.5 Hz)
// from the continuous 20 Hz TelemetryRingBuffer data plane.

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AnatomicalRegionWireId, CrystallizedPlaybookId } from '../types/telemetry';
import type {
  BiologicalSex,
  CameraSnapshot,
  CommandPaletteTabId,
  DiagnosticImagingTab,
  DrawerId,
  EscapeUnwindLayer,
  EvaluateDockTab,
  PhaseMode,
  PinnedCardId,
  PlaybookReturnBreadcrumb,
  PrivacyRole,
  VoiceSafetyBlockToast,
  WorkbenchSimulationMode,
} from '../types/workbench';

export interface WorkbenchState {
  phase: PhaseMode;
  twinSex: BiologicalSex;
  pinnedCard: PinnedCardId | null;
  imagingTab: DiagnosticImagingTab;
  evaluateTab: EvaluateDockTab;
  selectedUberonRegion: AnatomicalRegionWireId | null;
  selectedPlaybookId: CrystallizedPlaybookId | null;
  drawer: DrawerId | null;
  commandPaletteOpen: boolean;
  commandPaletteInitialTab: CommandPaletteTabId;
  shortcutsModalOpen: boolean;
  voiceListening: boolean;
  voiceSafetyBlockToast: VoiceSafetyBlockToast | null;
  studioBarOpen: boolean;
  simulationMode: WorkbenchSimulationMode;
  returnBreadcrumb: PlaybookReturnBreadcrumb | null;
  prePreviewCameraSnapshot: CameraSnapshot | null;
  invokerElementId: string | null;
  privacyRole: PrivacyRole;
  isScrubbing: boolean;
  degradedGpu: boolean;
  twinAutoRotate: boolean;

  setPhase: (phase: PhaseMode) => void;
  setTwinSex: (sex: BiologicalSex) => void;
  toggleTwinAutoRotate: () => void;
  setTwinAutoRotate: (autoRotate: boolean) => void;
  setPinnedCard: (card: PinnedCardId | null) => void;
  setImagingTab: (tab: DiagnosticImagingTab) => void;
  setEvaluateTab: (tab: EvaluateDockTab) => void;
  selectUberonRegion: (region: AnatomicalRegionWireId | null) => void;
  selectPlaybook: (playbookId: CrystallizedPlaybookId | null) => void;
  openDrawer: (drawer: DrawerId, invokerElementId?: string | null) => void;
  closeDrawer: () => string | null;
  openCommandPalette: (
    initialTab?: CommandPaletteTabId,
    cameraSnapshot?: CameraSnapshot | null,
    invokerElementId?: string | null,
  ) => void;
  closeCommandPalette: (commitPreview?: boolean) => string | null;
  setShortcutsModalOpen: (open: boolean, invokerElementId?: string | null) => void;
  toggleVoiceListening: () => void;
  setVoiceListening: (listening: boolean) => void;
  triggerVoiceSafetyBlock: (clause: string, reason: string, nowMs?: number) => void;
  dismissVoiceSafetyBlock: () => void;
  toggleStudioBar: () => void;
  setStudioBarOpen: (open: boolean) => void;
  setSimulationMode: (mode: WorkbenchSimulationMode) => void;
  jumpToDiagnosticVerify: (
    targetTab: DiagnosticImagingTab,
    targetRegion: AnatomicalRegionWireId,
    breadcrumb: PlaybookReturnBreadcrumb,
  ) => void;
  popReturnBreadcrumb: () => PlaybookReturnBreadcrumb | null;
  setPrivacyRole: (role: PrivacyRole) => void;
  setIsScrubbing: (isScrubbing: boolean) => void;
  setDegradedGpu: (degradedGpu: boolean) => void;
  unwindTopEscapeLayer: () => { layer: EscapeUnwindLayer; restoreFocusId: string | null };
  resetWorkbench: () => void;
}

function syncDegradedGpuClass(degraded: boolean): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.classList.toggle('is-degraded-gpu', degraded);
}

const INITIAL_STATE = {
  phase: 'GATHER' as PhaseMode,
  twinSex: 'MALE' as BiologicalSex,
  pinnedCard: null as PinnedCardId | null,
  imagingTab: 'POCUS_IJV' as DiagnosticImagingTab,
  evaluateTab: 'STL_AND_CONES' as EvaluateDockTab,
  selectedUberonRegion: null as AnatomicalRegionWireId | null,
  selectedPlaybookId: null as CrystallizedPlaybookId | null,
  drawer: null as DrawerId | null,
  commandPaletteOpen: false,
  commandPaletteInitialTab: 'COMMANDS' as CommandPaletteTabId,
  shortcutsModalOpen: false,
  voiceListening: false,
  voiceSafetyBlockToast: null as VoiceSafetyBlockToast | null,
  studioBarOpen: false,
  simulationMode: 'empirical' as WorkbenchSimulationMode,
  returnBreadcrumb: null as PlaybookReturnBreadcrumb | null,
  prePreviewCameraSnapshot: null as CameraSnapshot | null,
  invokerElementId: null as string | null,
  privacyRole: 'CMO' as PrivacyRole,
  isScrubbing: false,
  degradedGpu: false,
  twinAutoRotate: true,
};

export const useWorkbenchStore = create<WorkbenchState>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    setPhase: (phase) => set({ phase }),

    setTwinSex: (twinSex) => set({ twinSex }),

    toggleTwinAutoRotate: () => set((s) => ({ twinAutoRotate: !s.twinAutoRotate })),

    setTwinAutoRotate: (twinAutoRotate) => set({ twinAutoRotate }),

    setPinnedCard: (pinnedCard) => set({ pinnedCard }),

    setImagingTab: (imagingTab) => set({ imagingTab }),

    setEvaluateTab: (evaluateTab) => set({ evaluateTab }),

    selectUberonRegion: (selectedUberonRegion) => set({ selectedUberonRegion }),

    selectPlaybook: (selectedPlaybookId) => set({ selectedPlaybookId }),

    openDrawer: (drawer, invokerElementId = null) =>
      set({
        drawer,
        invokerElementId: invokerElementId ?? get().invokerElementId,
      }),

    closeDrawer: () => {
      const restoreId = get().invokerElementId;
      set({ drawer: null, invokerElementId: null });
      return restoreId;
    },

    openCommandPalette: (
      initialTab = 'COMMANDS',
      cameraSnapshot = null,
      invokerElementId = null,
    ) =>
      set({
        commandPaletteOpen: true,
        commandPaletteInitialTab: initialTab,
        prePreviewCameraSnapshot: cameraSnapshot ?? get().prePreviewCameraSnapshot,
        invokerElementId: invokerElementId ?? get().invokerElementId,
      }),

    closeCommandPalette: (commitPreview = false) => {
      const restoreId = get().invokerElementId;
      set({
        commandPaletteOpen: false,
        prePreviewCameraSnapshot: commitPreview ? null : get().prePreviewCameraSnapshot,
        invokerElementId: get().drawer ? get().invokerElementId : null,
      });
      return restoreId;
    },

    setShortcutsModalOpen: (shortcutsModalOpen, invokerElementId = null) =>
      set({
        shortcutsModalOpen,
        invokerElementId: shortcutsModalOpen
          ? (invokerElementId ?? get().invokerElementId)
          : get().drawer
            ? get().invokerElementId
            : null,
      }),

    toggleVoiceListening: () => set((s) => ({ voiceListening: !s.voiceListening })),

    setVoiceListening: (voiceListening) => set({ voiceListening }),

    triggerVoiceSafetyBlock: (clause, reason, nowMs = Date.now()) =>
      set({
        voiceListening: false,
        voiceSafetyBlockToast: {
          active: true,
          clause,
          reason,
          timestampMs: nowMs,
        },
      }),

    dismissVoiceSafetyBlock: () => set({ voiceSafetyBlockToast: null }),

    toggleStudioBar: () => set((s) => ({ studioBarOpen: !s.studioBarOpen })),

    setStudioBarOpen: (studioBarOpen) => set({ studioBarOpen }),

    setSimulationMode: (simulationMode) => set({ simulationMode }),

    jumpToDiagnosticVerify: (targetTab, targetRegion, breadcrumb) =>
      set({
        phase: 'GATHER',
        pinnedCard: 'DIAGNOSTIC_IMAGING',
        imagingTab: targetTab,
        selectedUberonRegion: targetRegion,
        returnBreadcrumb: breadcrumb,
      }),

    popReturnBreadcrumb: () => {
      const crumb = get().returnBreadcrumb;
      if (!crumb) return null;
      set({
        phase: crumb.originPhase,
        pinnedCard: 'PLAYBOOK_DAG',
        returnBreadcrumb: null,
      });
      return crumb;
    },

    setPrivacyRole: (privacyRole) => set({ privacyRole }),

    setIsScrubbing: (isScrubbing) => set({ isScrubbing }),

    setDegradedGpu: (degradedGpu) => {
      syncDegradedGpuClass(degradedGpu);
      set({ degradedGpu });
    },

    unwindTopEscapeLayer: () => {
      const state = get();
      if (state.voiceSafetyBlockToast?.active) {
        set({ voiceSafetyBlockToast: null });
        return { layer: 'VOICE_TOAST', restoreFocusId: null };
      }
      if (state.commandPaletteOpen) {
        const restoreFocusId = state.invokerElementId;
        set({
          commandPaletteOpen: false,
          invokerElementId: state.drawer ? state.invokerElementId : null,
        });
        return { layer: 'COMMAND_PALETTE', restoreFocusId };
      }
      if (state.shortcutsModalOpen) {
        const restoreFocusId = state.invokerElementId;
        set({
          shortcutsModalOpen: false,
          invokerElementId: state.drawer ? state.invokerElementId : null,
        });
        return { layer: 'SHORTCUTS_MODAL', restoreFocusId };
      }
      if (state.drawer !== null) {
        const restoreFocusId = state.invokerElementId;
        set({ drawer: null, invokerElementId: null });
        return { layer: 'DRAWER', restoreFocusId };
      }
      if (state.studioBarOpen) {
        set({ studioBarOpen: false });
        return { layer: 'STUDIO_BAR', restoreFocusId: null };
      }
      if (state.returnBreadcrumb !== null) {
        const crumb = state.returnBreadcrumb;
        set({
          phase: crumb.originPhase,
          pinnedCard: 'PLAYBOOK_DAG',
          returnBreadcrumb: null,
        });
        return { layer: 'RETURN_BREADCRUMB', restoreFocusId: crumb.focusedElementId };
      }
      if (state.selectedUberonRegion !== null) {
        set({ selectedUberonRegion: null });
        return { layer: 'UBERON_SELECTION', restoreFocusId: null };
      }
      return { layer: 'NONE', restoreFocusId: null };
    },

    resetWorkbench: () => {
      syncDegradedGpuClass(false);
      set({ ...INITIAL_STATE });
    },
  })),
);
