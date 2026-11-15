// 60-frame rolling FPS hysteresis performance guard (`AdaptivePerformanceGuard`).
// Degrades cleanly (`degradedGpu = true`, `dpr = 1`, `.is-degraded-gpu` CSS backdrop fallback)
// if rolling average drops below 45 FPS for >= 90 frames (~1.5s), and recovers ONLY after
// sustained >= 57 FPS for >= 180 frames (~3.0s) to prevent oscillation thrashing.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useWorkbenchStore } from '../stores/workbenchStore';

const WINDOW_SIZE = 60;
const DEGRADE_FPS_THRESHOLD = 45.0;
const RECOVER_FPS_THRESHOLD = 57.0;
const DEGRADE_HOLD_FRAMES = 90;
const RECOVER_HOLD_FRAMES = 180;

export function AdaptivePerformanceGuard() {
  const setDpr = useThree((s) => s.setDpr);
  const frameDeltasRef = useRef<Float32Array>(new Float32Array(WINDOW_SIZE).fill(1 / 60));
  const cursorRef = useRef(0);
  const filledCountRef = useRef(0);
  const lowFpsStreakRef = useRef(0);
  const highFpsStreakRef = useRef(0);

  useFrame((_state, rawDelta) => {
    // Ignore background tab suspension spikes (> 250 ms) so returning to tab doesn't false-degrade
    if (!Number.isFinite(rawDelta) || rawDelta <= 0 || rawDelta > 0.25) {
      return;
    }

    const ring = frameDeltasRef.current;
    ring[cursorRef.current] = rawDelta;
    cursorRef.current = (cursorRef.current + 1) % WINDOW_SIZE;
    if (filledCountRef.current < WINDOW_SIZE) {
      filledCountRef.current += 1;
      return;
    }

    let sumDelta = 0;
    for (let i = 0; i < WINDOW_SIZE; i += 1) {
      sumDelta += ring[i];
    }
    const avgFps = sumDelta > 1e-6 ? WINDOW_SIZE / sumDelta : 60;
    const currentlyDegraded = useWorkbenchStore.getState().degradedGpu;

    if (!currentlyDegraded) {
      if (avgFps < DEGRADE_FPS_THRESHOLD) {
        lowFpsStreakRef.current += 1;
        if (lowFpsStreakRef.current >= DEGRADE_HOLD_FRAMES) {
          lowFpsStreakRef.current = 0;
          highFpsStreakRef.current = 0;
          useWorkbenchStore.getState().setDegradedGpu(true);
          setDpr(1);
        }
      } else {
        lowFpsStreakRef.current = 0;
      }
    } else if (avgFps >= RECOVER_FPS_THRESHOLD) {
      highFpsStreakRef.current += 1;
      if (highFpsStreakRef.current >= RECOVER_HOLD_FRAMES) {
        highFpsStreakRef.current = 0;
        lowFpsStreakRef.current = 0;
        useWorkbenchStore.getState().setDegradedGpu(false);
        const targetDpr =
          typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
        setDpr(targetDpr);
      }
    } else {
      highFpsStreakRef.current = 0;
    }
  });

  return null;
}
