// OpenScreenStudio Director Timeline Bar & Dual-Camera Drei `<View />` Stage Overlay
// (`OpenScreenStudioBar`).
// Implements:
// - Strict `<= 29.8s` NASA Pitch Hard-Cap (`NASA_PITCH_HARD_CAP_SECONDS`) + `120.0s` Full Tour
// - `0.5x / 1x / 2x / 4x` playback speed pills + `Play / Pause` + magnetic keyframe diamonds
// - NotebookLM Risk 3 Fix: `setPointerCapture` + `setIsScrubbing(true/false)` on timeline scrubber
// - `FOCUS / SPLIT / PIP` layout modes mounting `<SecondaryMeshViewport />` via Drei `<View />`

import React, { useEffect, useRef } from 'react';
import type {
  StudioHorizonMode,
  StudioLayoutMode,
  StudioSpeedMultiplier,
} from '../types/workbench';
import { SecondaryMeshViewport } from '../stage3d/SecondaryMeshViewport';
import {
  FULL_TOUR_DURATION_SECONDS,
  NASA_PITCH_HARD_CAP_SECONDS,
  useStudioTimelineStore,
} from '../stores/studioTimelineStore';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';

export interface OpenScreenStudioBarProps {
  onScrubProgress?: (normalizedRatio: number) => void;
}

export function OpenScreenStudioBar({ onScrubProgress }: OpenScreenStudioBarProps) {
  const studioBarOpen = useWorkbenchStore((s) => s.studioBarOpen);
  const setStudioBarOpen = useWorkbenchStore((s) => s.setStudioBarOpen);
  const setWorkbenchScrubbing = useWorkbenchStore((s) => s.setIsScrubbing);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const selectUberonRegion = useWorkbenchStore((s) => s.selectUberonRegion);

  const t = useStudioTimelineStore((s) => s.t);
  const durationS = useStudioTimelineStore((s) => s.durationS);
  const horizonMode = useStudioTimelineStore((s) => s.horizonMode);
  const isPlaying = useStudioTimelineStore((s) => s.isPlaying);
  const isScrubbing = useStudioTimelineStore((s) => s.isScrubbing);
  const speed = useStudioTimelineStore((s) => s.speed);
  const layoutMode = useStudioTimelineStore((s) => s.layoutMode);
  const markers = useStudioTimelineStore((s) => s.magneticEventMarkers);
  const activeMarkerId = useStudioTimelineStore((s) => s.activeMarkerId);

  const setTime = useStudioTimelineStore((s) => s.setTime);
  const advanceTick = useStudioTimelineStore((s) => s.advanceTick);
  const togglePlay = useStudioTimelineStore((s) => s.togglePlay);
  const setSpeed = useStudioTimelineStore((s) => s.setSpeed);
  const setLayoutMode = useStudioTimelineStore((s) => s.setLayoutMode);
  const setHorizonMode = useStudioTimelineStore((s) => s.setHorizonMode);
  const setStudioScrubbing = useStudioTimelineStore((s) => s.setIsScrubbing);
  const seekToMarker = useStudioTimelineStore((s) => s.seekToMarker);

  const prevMarkerRef = useRef<string | null>(null);

  // `requestAnimationFrame` director playback loop
  useEffect(() => {
    if (!studioBarOpen || !isPlaying) return;
    let rafId = 0;
    let lastMs = performance.now();

    const frame = (nowMs: number): void => {
      const dtSec = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      const nextT = advanceTick(dtSec);
      if (durationS > 0) {
        onScrubProgress?.(nextT / durationS);
      }
      if (useStudioTimelineStore.getState().isPlaying) {
        rafId = window.requestAnimationFrame(frame);
      }
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [advanceTick, durationS, isPlaying, onScrubProgress, studioBarOpen]);

  // Synchronize 3D organ focus & GATHER -> EVALUATE -> ACT phase when crossing magnetic keyframes
  useEffect(() => {
    if (!studioBarOpen || !activeMarkerId || activeMarkerId === prevMarkerRef.current) return;
    prevMarkerRef.current = activeMarkerId;
    const marker = markers.find((m) => m.id === activeMarkerId);
    if (!marker) return;

    selectUberonRegion(marker.uberonRegion);
    if (marker.id === 'KF_01_BASELINE' || marker.id === 'KF_02_FLUID_SHIFT') {
      setPhase('GATHER');
    } else if (marker.id === 'KF_03_IJV_STASIS' || marker.id === 'KF_04_SANS_ONSET' || marker.id === 'KF_05_MUSCLE_ATROPHY') {
      setPhase('EVALUATE');
    } else if (marker.id === 'KF_06_LBNP_COUNTERMEASURE') {
      setPhase('ACT');
    }
  }, [activeMarkerId, markers, selectUberonRegion, setPhase, studioBarOpen]);

  useEffect(() => {
    return () => {
      setStudioScrubbing(false);
      setWorkbenchScrubbing(false);
    };
  }, [setStudioScrubbing, setWorkbenchScrubbing]);

  if (!studioBarOpen) return null;

  // NotebookLM Risk 3 Fix: lock both Studio & Workbench `isScrubbing` + pointer capture
  const scrubProps = {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      setStudioScrubbing(true);
      setWorkbenchScrubbing(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLInputElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      setStudioScrubbing(false);
      setWorkbenchScrubbing(false);
    },
    onPointerCancel: () => {
      setStudioScrubbing(false);
      setWorkbenchScrubbing(false);
    },
    onBlur: () => {
      setStudioScrubbing(false);
      setWorkbenchScrubbing(false);
    },
  };

  return (
    <>
      {/* Optional Secondary Drei `<View />` Camera Overlay in `SPLIT` or `PIP` Layout */}
      {layoutMode === 'PIP' ? (
        <div className="pointer-events-auto fixed right-[380px] bottom-[92px] z-30 hidden w-64 rounded-2xl border border-cyan-400/50 bg-[#05070c] p-1.5 shadow-2xl xl:block">
          <SecondaryMeshViewport
            specimen="IJV_LUMEN_SEGMENT"
            scalarLoad={0.62}
            observed
            label="PIP // L-IJV LUMEN CAMERA"
            className="h-36 w-full"
          />
        </div>
      ) : null}

      {layoutMode === 'SPLIT' ? (
        <div className="pointer-events-auto fixed top-[48px] right-[380px] z-30 hidden w-72 rounded-2xl border border-cyan-400/50 bg-[#05070c] p-1.5 shadow-2xl xl:block">
          <SecondaryMeshViewport
            specimen="OCULAR_SANS_GLOBE"
            scalarLoad={0.58}
            observed
            label="SPLIT // OCULAR ONSD CAMERA"
            className="h-44 w-full"
          />
        </div>
      ) : null}

      {/* Floating Bottom Director Sequencer Dock (`0` `backdrop-filter`) */}
      <section
        aria-label="OpenScreenStudio timeline director"
        data-scrubbing={isScrubbing ? 'true' : 'false'}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="fixed right-3 bottom-2 left-3 z-[60] mx-auto max-w-5xl rounded-2xl border border-white/15 bg-[#06090f] px-3 py-2 font-mono text-[10px] shadow-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Play / Pause + Timecode */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                togglePlay();
                announcePolite(isPlaying ? 'Paused Studio timeline.' : 'Playing Studio timeline.');
              }}
              className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-cyan-400/70 bg-cyan-500/20 px-3 font-bold text-cyan-100"
            >
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>

            <div className="ares-tabular-metric rounded border border-white/10 bg-black px-2.5 py-1 text-xs font-semibold text-[var(--color-ink-display)]">
              {t.toFixed(1)}s / {durationS.toFixed(1)}s
            </div>
          </div>

          {/* Horizon Cap Switcher (`29.8s` NASA Pitch Hard-Cap vs `120.0s` Full Tour) */}
          <div className="flex items-center gap-1" role="group" aria-label="Studio duration mode">
            {(
              [
                { id: 'PITCH_29_8S', label: `NASA PITCH <=${NASA_PITCH_HARD_CAP_SECONDS}S` },
                { id: 'FULL_TOUR_120S', label: `FULL TOUR ${FULL_TOUR_DURATION_SECONDS}S` },
              ] as Array<{ id: StudioHorizonMode; label: string }>
            ).map((hm) => {
              const active = horizonMode === hm.id;
              return (
                <button
                  key={hm.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setHorizonMode(hm.id)}
                  className={`ares-interactive rounded border px-2 py-1 font-semibold ${
                    active
                      ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                  }`}
                >
                  {hm.label}
                </button>
              );
            })}
          </div>

          {/* Playback Speed (`0.5x / 1x / 2x / 4x`) */}
          <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
            {([0.5, 1, 2, 4] as StudioSpeedMultiplier[]).map((spd) => {
              const active = speed === spd;
              return (
                <button
                  key={spd}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSpeed(spd)}
                  className={`ares-interactive rounded border px-2 py-1 font-semibold ${
                    active
                      ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                      : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                  }`}
                >
                  {spd}x
                </button>
              );
            })}
          </div>

          {/* Layout Mode (`FOCUS / SPLIT / PIP`) + Close */}
          <div className="flex items-center gap-1">
            {(['FOCUS', 'SPLIT', 'PIP'] as StudioLayoutMode[]).map((lm) => {
              const active = layoutMode === lm;
              return (
                <button
                  key={lm}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLayoutMode(lm)}
                  className={`ares-interactive rounded border px-2 py-1 font-semibold ${
                    active
                      ? 'border-emerald-400/65 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                  }`}
                >
                  {lm}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setStudioBarOpen(false)}
              className="ares-interactive ml-1 rounded border border-white/15 bg-black px-2 py-1 text-[var(--color-ink-meta)]"
            >
              [S] HIDE
            </button>
          </div>
        </div>

        {/* Scrubber Track + Magnetic Event Diamond Markers */}
        <div className="relative mt-1.5">
          <input
            type="range"
            min={0}
            max={durationS}
            step={0.1}
            value={t}
            aria-label="OpenScreenStudio timeline playhead in seconds"
            className="ares-touch-target relative z-10 w-full cursor-pointer"
            onChange={(e) => {
              const snappedT = setTime(Number(e.target.value), { snapToMarkers: true });
              if (durationS > 0) {
                onScrubProgress?.(snappedT / durationS);
              }
            }}
            {...scrubProps}
          />

          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1">
            {markers.map((m) => {
              const markerT = horizonMode === 'PITCH_29_8S' ? m.timeS : m.tourTimeS;
              const isCurrent = activeMarkerId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    seekToMarker(m.id);
                    announcePolite(`Seeked Studio keyframe: ${m.label}.`);
                  }}
                  className={`ares-interactive rounded border px-1.5 py-0.5 text-[9px] ${
                    isCurrent
                      ? 'border-cyan-400/80 bg-cyan-400/20 text-cyan-100'
                      : 'border-white/10 bg-black/70 text-[var(--color-ink-meta)]'
                  }`}
                >
                  &lt;&gt; {markerT.toFixed(1)}s {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
