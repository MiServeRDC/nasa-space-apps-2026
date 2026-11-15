// Deterministic OpenScreenStudio master sequencer store (<= 29.8s NASA pitch hard cap).
// Drives single-Canvas Drei <View /> layouts (FOCUS | SPLIT | PIP) and O(log N)
// TelemetryRingBuffer scrubbing with pointer-capture OrbitControls freeze (Risk 3).

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  StudioHorizonMode,
  StudioLayoutMode,
  StudioMagneticEventMarker,
  StudioSpeedMultiplier,
} from '../types/workbench';

/** Strict <= 29.8s hard cap preventing YouTube 0:31 frame-rounding disqualification. */
export const NASA_PITCH_HARD_CAP_SECONDS = 29.8;

/** Optional full clinical walkthrough duration for offline 120s deep-dive inspection. */
export const FULL_TOUR_DURATION_SECONDS = 120.0;

/** Magnetic keyframe snap deadband (seconds) in 29.8s pitch mode. */
export const PITCH_MAGNETIC_SNAP_DEADBAND_S = 0.28;

export const DEFAULT_MAGNETIC_EVENT_MARKERS: readonly StudioMagneticEventMarker[] = [
  {
    id: 'KF_01_BASELINE',
    timeS: 0.0,
    tourTimeS: 0.0,
    label: 'BASELINE NOMINAL',
    targetPresetId: 'DEFAULT',
    uberonRegion: null,
    alertLevel: 'NOMINAL',
  },
  {
    id: 'KF_02_FLUID_SHIFT',
    timeS: 4.5,
    tourTimeS: 18.0,
    label: 'CEPHALAD FLUID SHIFT',
    targetPresetId: 'HEART',
    uberonRegion: 'HeartCardioAutonomic',
    alertLevel: 'ADVISORY',
  },
  {
    id: 'KF_03_IJV_STASIS',
    timeS: 10.4,
    tourTimeS: 42.0,
    label: 'IJV VENOUS STASIS + GATE 1 LOCK',
    targetPresetId: 'IJV',
    uberonRegion: 'InternalJugularVein',
    alertLevel: 'WARNING',
  },
  {
    id: 'KF_04_SANS_ONSET',
    timeS: 15.9,
    tourTimeS: 64.0,
    label: 'SANS ONSD >= 5.80 MM',
    targetPresetId: 'ONSD',
    uberonRegion: 'EyeOcularSans',
    alertLevel: 'WARNING',
  },
  {
    id: 'KF_05_MUSCLE_ATROPHY',
    timeS: 21.4,
    tourTimeS: 86.0,
    label: 'SOLEUS + FROST SOST DRIFT',
    targetPresetId: 'SOLEUS',
    uberonRegion: 'SoleusCalcaneus',
    alertLevel: 'ADVISORY',
  },
  {
    id: 'KF_06_LBNP_COUNTERMEASURE',
    timeS: 25.8,
    tourTimeS: 104.0,
    label: 'LBNP -30 MMHG + GATE 2 ARMED',
    targetPresetId: 'IJV',
    uberonRegion: 'InternalJugularVein',
    alertLevel: 'CRITICAL',
  },
];

export interface StudioTimelineState {
  /** Current timeline playhead in seconds, strictly clamped to [0, durationS]. */
  t: number;
  durationS: number;
  horizonMode: StudioHorizonMode;
  isPlaying: boolean;
  /** Risk 3 guard: true while dragging timeline slider so OrbitControls freeze cleanly. */
  isScrubbing: boolean;
  speed: StudioSpeedMultiplier;
  layoutMode: StudioLayoutMode;
  magneticEventMarkers: StudioMagneticEventMarker[];
  activeMarkerId: string | null;

  setTime: (nextT: number, options?: { snapToMarkers?: boolean }) => number;
  advanceTick: (deltaSec: number) => number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: StudioSpeedMultiplier) => void;
  setLayoutMode: (layoutMode: StudioLayoutMode) => void;
  setHorizonMode: (horizonMode: StudioHorizonMode) => void;
  setIsScrubbing: (isScrubbing: boolean) => void;
  seekToMarker: (markerId: string) => boolean;
  resetStudio: () => void;
}

function durationForHorizon(mode: StudioHorizonMode): number {
  return mode === 'PITCH_29_8S' ? NASA_PITCH_HARD_CAP_SECONDS : FULL_TOUR_DURATION_SECONDS;
}

function markerTimeForMode(marker: StudioMagneticEventMarker, mode: StudioHorizonMode): number {
  return mode === 'PITCH_29_8S' ? marker.timeS : marker.tourTimeS;
}

function resolveNearestMarker(
  t: number,
  markers: readonly StudioMagneticEventMarker[],
  mode: StudioHorizonMode,
  deadbandS: number,
): { snappedT: number; markerId: string | null } {
  let bestDist = Number.POSITIVE_INFINITY;
  let bestMarker: StudioMagneticEventMarker | null = null;

  for (let i = 0; i < markers.length; i += 1) {
    const m = markers[i];
    const mTime = markerTimeForMode(m, mode);
    const dist = Math.abs(t - mTime);
    if (dist < bestDist) {
      bestDist = dist;
      bestMarker = m;
    }
  }

  if (bestMarker && bestDist <= deadbandS) {
    return {
      snappedT: markerTimeForMode(bestMarker, mode),
      markerId: bestMarker.id,
    };
  }

  // Otherwise mark the most recently passed keyframe as active context
  let currentId: string | null = null;
  for (let i = 0; i < markers.length; i += 1) {
    if (markerTimeForMode(markers[i], mode) <= t + 1e-6) {
      currentId = markers[i].id;
    }
  }
  return { snappedT: t, markerId: currentId };
}

export const useStudioTimelineStore = create<StudioTimelineState>()(
  subscribeWithSelector((set, get) => ({
    t: 0,
    durationS: NASA_PITCH_HARD_CAP_SECONDS,
    horizonMode: 'PITCH_29_8S',
    isPlaying: false,
    isScrubbing: false,
    speed: 1,
    layoutMode: 'FOCUS',
    magneticEventMarkers: [...DEFAULT_MAGNETIC_EVENT_MARKERS],
    activeMarkerId: DEFAULT_MAGNETIC_EVENT_MARKERS[0].id,

    setTime: (nextT, options) => {
      const state = get();
      const safeRaw = Number.isFinite(nextT) ? nextT : 0;
      const clamped = Math.min(state.durationS, Math.max(0, safeRaw));
      const snapDeadband =
        state.horizonMode === 'PITCH_29_8S'
          ? PITCH_MAGNETIC_SNAP_DEADBAND_S
          : PITCH_MAGNETIC_SNAP_DEADBAND_S * (FULL_TOUR_DURATION_SECONDS / NASA_PITCH_HARD_CAP_SECONDS);

      if (options?.snapToMarkers) {
        const { snappedT, markerId } = resolveNearestMarker(
          clamped,
          state.magneticEventMarkers,
          state.horizonMode,
          snapDeadband,
        );
        const boundedSnap = Math.min(state.durationS, Math.max(0, snappedT));
        set({ t: boundedSnap, activeMarkerId: markerId });
        return boundedSnap;
      }

      const { markerId } = resolveNearestMarker(
        clamped,
        state.magneticEventMarkers,
        state.horizonMode,
        0,
      );
      set({ t: clamped, activeMarkerId: markerId });
      return clamped;
    },

    advanceTick: (deltaSec) => {
      const state = get();
      if (!state.isPlaying || state.isScrubbing || !Number.isFinite(deltaSec) || deltaSec <= 0) {
        return state.t;
      }
      const rawNext = state.t + deltaSec * state.speed;
      if (rawNext >= state.durationS) {
        const endT = state.durationS;
        const { markerId } = resolveNearestMarker(
          endT,
          state.magneticEventMarkers,
          state.horizonMode,
          0,
        );
        set({ t: endT, isPlaying: false, activeMarkerId: markerId });
        return endT;
      }
      const { markerId } = resolveNearestMarker(
        rawNext,
        state.magneticEventMarkers,
        state.horizonMode,
        0,
      );
      set({ t: rawNext, activeMarkerId: markerId });
      return rawNext;
    },

    play: () => {
      const state = get();
      if (state.t >= state.durationS) {
        set({
          t: 0,
          isPlaying: true,
          activeMarkerId: state.magneticEventMarkers[0]?.id ?? null,
        });
      } else {
        set({ isPlaying: true });
      }
    },

    pause: () => set({ isPlaying: false }),

    togglePlay: () => {
      const state = get();
      if (state.isPlaying) {
        set({ isPlaying: false });
      } else {
        state.play();
      }
    },

    setSpeed: (speed) => set({ speed }),

    setLayoutMode: (layoutMode) => set({ layoutMode }),

    setHorizonMode: (horizonMode) => {
      const state = get();
      if (state.horizonMode === horizonMode) return;
      const nextDuration = durationForHorizon(horizonMode);
      const progress = state.durationS > 0 ? state.t / state.durationS : 0;
      const scaledT = Math.min(nextDuration, Math.max(0, progress * nextDuration));
      const { markerId } = resolveNearestMarker(
        scaledT,
        state.magneticEventMarkers,
        horizonMode,
        0,
      );
      set({
        horizonMode,
        durationS: nextDuration,
        t: scaledT,
        activeMarkerId: markerId,
      });
    },

    setIsScrubbing: (isScrubbing) => set({ isScrubbing }),

    seekToMarker: (markerId) => {
      const state = get();
      const marker = state.magneticEventMarkers.find((m) => m.id === markerId);
      if (!marker) return false;
      const targetT = Math.min(
        state.durationS,
        Math.max(0, markerTimeForMode(marker, state.horizonMode)),
      );
      set({ t: targetT, activeMarkerId: marker.id });
      return true;
    },

    resetStudio: () =>
      set({
        t: 0,
        durationS: NASA_PITCH_HARD_CAP_SECONDS,
        horizonMode: 'PITCH_29_8S',
        isPlaying: false,
        isScrubbing: false,
        speed: 1,
        layoutMode: 'FOCUS',
        magneticEventMarkers: [...DEFAULT_MAGNETIC_EVENT_MARKERS],
        activeMarkerId: DEFAULT_MAGNETIC_EVENT_MARKERS[0].id,
      }),
  })),
);
