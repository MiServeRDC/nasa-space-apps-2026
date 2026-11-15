// Shared greenfield Spatial Workbench types for ARES-Health (Phases 1-6).
// Pure TypeScript contract types: zero runtime imports, strictly zero emojis.

import type {
  AlarmLevel,
  AnatomicalRegionWireId,
  CrystallizedPlaybookId,
  TelemetryFrame,
  TelemetryPacket,
} from './telemetry';

export type { TelemetryFrame, TelemetryPacket };

export type PhaseMode = 'GATHER' | 'EVALUATE' | 'ACT';

export type BiologicalSex = 'MALE' | 'FEMALE';

export type BootMode = 'instant' | 'choreographed';

export type FontsReadyStatus = 'pending' | 'locked' | 'timeout_fallback';

export type WorkbenchSimulationMode = 'empirical' | 'simulated';

export type DockSlotId =
  | 'LEFT_SLOT_1_VITALS_ANCHOR'
  | 'LEFT_SLOT_2_CONTEXT'
  | 'RIGHT_SLOT_3_PRIMARY'
  | 'RIGHT_SLOT_4_SECONDARY';

export type PinnedCardId =
  | 'DIAGNOSTIC_IMAGING'
  | 'ANOMALY_DIAGNOSTICS'
  | 'FORECAST_BONE_RENAL'
  | 'WHAT_IF_COUNTERFACTUAL'
  | 'PLAYBOOK_DAG';

export type DiagnosticImagingTab = 'POCUS_IJV' | 'OCULAR_ONSD' | 'OPTICAL_AND_MRI';

export type EvaluateDockTab = 'STL_AND_CONES' | 'BONE_RENAL_AXIS' | 'WHAT_IF_STRESS';

export type DrawerId = 'MISSION_PORTAL' | 'AUDIT_PROVENANCE' | 'PLAYBOOK_SHEET';

export type CommandPaletteTabId = 'COMMANDS' | 'FASTMCP' | 'COPILOT';

/**
 * NASA-STD-3001 Vol. 1 Ch. 7 Crew Medical Privacy Governance roles.
 * - CREW_SELF: Private Astronaut View
 * - CMO: Onboard Crew Medical Officer View
 * - FLIGHT_SURGEON: Ground Flight Surgeon Store-and-Forward View
 * - GROUND_RESEARCH: De-Identified Ground Science / Epidemiological View
 */
export type PrivacyRole = 'CREW_SELF' | 'CMO' | 'FLIGHT_SURGEON' | 'GROUND_RESEARCH';

export type EscapeUnwindLayer =
  | 'EDITABLE_BLUR'
  | 'VOICE_TOAST'
  | 'COMMAND_PALETTE'
  | 'SHORTCUTS_MODAL'
  | 'DRAWER'
  | 'STUDIO_BAR'
  | 'RETURN_BREADCRUMB'
  | 'UBERON_SELECTION'
  | 'NONE';

export interface VoiceSafetyBlockToast {
  active: boolean;
  clause: string;
  reason: string;
  timestampMs: number;
}

export interface PlaybookReturnBreadcrumb {
  playbookId: CrystallizedPlaybookId | string;
  shortCode: string;
  activeStepIndex: number;
  scrollOffsetPx: number;
  focusedElementId: string | null;
  originPhase: PhaseMode;
  createdAtMs: number;
}

export interface CameraSnapshot {
  azimuthRad: number;
  polarRad: number;
  radiusM: number;
  target: [number, number, number];
  fovDeg: number;
}

export type StudioLayoutMode = 'FOCUS' | 'SPLIT' | 'PIP';

export type StudioSpeedMultiplier = 0.5 | 1 | 2 | 4;

export type StudioHorizonMode = 'PITCH_29_8S' | 'FULL_TOUR_120S';

export type StudioCameraPresetId =
  | 'DEFAULT'
  | 'IJV'
  | 'ONSD'
  | 'HEART'
  | 'FEMUR'
  | 'SOLEUS'
  | 'CALCANEUS'
  | 'BRAIN';

export interface StudioMagneticEventMarker {
  id: string;
  /** Time position in the <= 29.8s NASA pitch cap timeline. */
  timeS: number;
  /** Uncompressed 120.0s full clinical walkthrough timestamp. */
  tourTimeS: number;
  label: string;
  targetPresetId: StudioCameraPresetId;
  uberonRegion: AnatomicalRegionWireId | null;
  alertLevel: AlarmLevel;
}

export interface WorkbenchOrchestratorSlice {
  phase: PhaseMode;
  twinSex: BiologicalSex;
  pinnedCard: PinnedCardId | null;
  evaluateTab: EvaluateDockTab;
  selectedUberonRegion: AnatomicalRegionWireId | null;
  drawer: DrawerId | null;
  commandPaletteOpen: boolean;
  shortcutsModalOpen: boolean;
  voiceListening: boolean;
  voiceSafetyBlockToast: VoiceSafetyBlockToast | null;
  studioBarOpen: boolean;
  returnBreadcrumb: PlaybookReturnBreadcrumb | null;
  isScrubbing: boolean;
  invokerElementId: string | null;
  setPhase: (phase: PhaseMode) => void;
  setTwinSex: (sex: BiologicalSex) => void;
  setPinnedCard: (card: PinnedCardId | null) => void;
  setEvaluateTab: (tab: EvaluateDockTab) => void;
  selectUberonRegion: (region: AnatomicalRegionWireId | null) => void;
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
  toggleStudioBar: () => void;
  unwindTopEscapeLayer: () => { layer: EscapeUnwindLayer; restoreFocusId: string | null };
}

export interface StudioOrchestratorSlice {
  isScrubbing: boolean;
}

declare global {
  interface Window {
    __ARES_FONTS_READY__?: Promise<FontsReadyStatus>;
  }
}
