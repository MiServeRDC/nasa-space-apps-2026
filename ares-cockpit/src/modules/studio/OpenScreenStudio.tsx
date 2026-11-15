// OpenScreen Telemetry Studio: Walkthrough player with spring-physics camera zoom,
// multi-track layout switching, timeline scrubber, and clinical annotation markers.
// Inspired by getopenscreen/openscreen.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CrewSex, ScenarioState, WhatIf } from '../../lib/scenario';
import type { TelemetryPacket } from '../../types/telemetry';
import {
  CAMERA_PRESETS,
  DEFAULT_SPRING_CONFIG,
  stepSpring3D,
  type CameraPreset,
  type Vector3Tuple,
} from '../../lib/motionSmoothing';
import {
  MusclesLayer,
  SkeletonLayer,
  SkinLayer,
  VascularNeuroLayer,
} from '../body-3d-heatmap/AnatomicalLayers';
import { EcgStrip } from '../analysis-imaging/Imaging';
import { MriGauge, PredicateBars } from '../mri-and-stl/MriAndStl';

export type StudioLayout = 'LAYOUT_SPLIT' | 'LAYOUT_PIP' | 'LAYOUT_FOCUS';

export interface ClinicalAnnotationKeyframe {
  timeS: number;
  label: string;
  targetPresetId: keyof typeof CAMERA_PRESETS;
  summary: string;
  alertLevel: 'NOMINAL' | 'ADVISORY' | 'WARNING' | 'CRITICAL';
}

export const CLINICAL_KEYFRAMES: ClinicalAnnotationKeyframe[] = [
  {
    timeS: 0,
    label: 'BASELINE',
    targetPresetId: 'DEFAULT',
    summary: 'Pre-flight baseline: 1g terrestrial gravity, nominal venous shear stress (tau_w > 12 dyn/cm2), ONSD 4.7mm.',
    alertLevel: 'NOMINAL',
  },
  {
    timeS: 18,
    label: 'FLUID SHIFT',
    targetPresetId: 'DEFAULT',
    summary: 'Microgravity entry: Cephalad fluid shift redistributes ~2 liters of blood and interstitial fluid headward.',
    alertLevel: 'ADVISORY',
  },
  {
    timeS: 42,
    label: 'IJV STASIS',
    targetPresetId: 'IJV',
    summary: 'Internal jugular vein dilation: CSA > 1.8 cm2, flow stasis, tau_w falls to 0.7 dyn/cm2. Stasis without thrombus.',
    alertLevel: 'CRITICAL',
  },
  {
    timeS: 64,
    label: 'SANS ONSET',
    targetPresetId: 'ONSD',
    summary: 'Spaceflight Associated Neuro-ocular Syndrome: Retrobulbar ONSD expands past 5.80 mm threshold under hypercapnia.',
    alertLevel: 'WARNING',
  },
  {
    timeS: 86,
    label: 'MUSCLE ATROPHY',
    targetPresetId: 'SOLEUS',
    summary: 'Postural unweighting: Soleus thickness loses 12%, irisin secretion falls, bone mechanostat triggers sclerostin spike.',
    alertLevel: 'ADVISORY',
  },
  {
    timeS: 104,
    label: 'LBNP ACTIVE',
    targetPresetId: 'FEMUR',
    summary: 'LBNP Countermeasure engaged at -25 mmHg: restores venous return to lower body. Anti-syncope auto-vent active.',
    alertLevel: 'NOMINAL',
  },
];

export const NASA_PITCH_HARD_CAP_SECONDS = 29.8;
export const FULL_TOUR_SECONDS = 120;
const SCENARIO_TOTAL_SECONDS = FULL_TOUR_SECONDS;

function SpringCameraRig({
  targetPreset,
  animating,
  onAnimationComplete,
}: {
  targetPreset: CameraPreset;
  animating: boolean;
  onAnimationComplete: () => void;
}) {
  const { camera } = useThree();
  const currentPos = useRef<Vector3Tuple>([...CAMERA_PRESETS.DEFAULT.position]);
  const currentTarget = useRef<Vector3Tuple>([...CAMERA_PRESETS.DEFAULT.target]);
  const velPos = useRef<Vector3Tuple>([0, 0, 0]);
  const velTarget = useRef<Vector3Tuple>([0, 0, 0]);

  useFrame((_, delta) => {
    if (!animating) return;

    const nextPos = stepSpring3D(
      currentPos.current,
      targetPreset.position,
      velPos.current,
      delta,
      DEFAULT_SPRING_CONFIG,
    );
    currentPos.current = nextPos.position;
    velPos.current = nextPos.velocity;
    camera.position.set(...nextPos.position);

    const nextTarget = stepSpring3D(
      currentTarget.current,
      targetPreset.target,
      velTarget.current,
      delta,
      DEFAULT_SPRING_CONFIG,
    );
    currentTarget.current = nextTarget.position;
    velTarget.current = nextTarget.velocity;
    camera.lookAt(...nextTarget.position);

    // Check completion threshold
    const posDist = Math.hypot(
      nextPos.position[0] - targetPreset.position[0],
      nextPos.position[1] - targetPreset.position[1],
      nextPos.position[2] - targetPreset.position[2],
    );
    const velMagnitude = Math.hypot(...velPos.current);

    if (posDist < 0.005 && velMagnitude < 0.005) {
      onAnimationComplete();
    }
  });

  return null;
}

interface OpenScreenStudioProps {
  packet: TelemetryPacket;
  s: ScenarioState | null;
  whatIf: WhatIf;
  sex: CrewSex;
}

export function OpenScreenStudio({
  packet,
  s,
  whatIf,
  sex,
}: OpenScreenStudioProps) {
  const [layout, setLayout] = useState<StudioLayout>('LAYOUT_SPLIT');
  const [activePreset, setActivePreset] = useState<CameraPreset>(CAMERA_PRESETS.DEFAULT);
  const [isCameraAnimating, setIsCameraAnimating] = useState<boolean>(true);
  const [playbackTimeS, setPlaybackTimeS] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [studioMode, setStudioMode] = useState<'30S_PITCH' | '120S_TOUR'>('30S_PITCH');
  const totalScenarioSeconds = studioMode === '30S_PITCH' ? NASA_PITCH_HARD_CAP_SECONDS : FULL_TOUR_SECONDS;

  // Find active keyframe based on current timeline position
  const activeKeyframe = [...CLINICAL_KEYFRAMES]
    .reverse()
    .find((kf) => playbackTimeS >= kf.timeS) ?? CLINICAL_KEYFRAMES[0];

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = 50;
    const timer = window.setInterval(() => {
      setPlaybackTimeS((prev) => {
        const next = prev + (intervalMs / 1000) * playbackRate;
        if (next >= totalScenarioSeconds) {
          setIsPlaying(false);
          return totalScenarioSeconds;
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, playbackRate, totalScenarioSeconds]);

  // Handle switching camera target with spring physics
  const triggerCameraZoom = (preset: CameraPreset) => {
    setActivePreset(preset);
    setIsCameraAnimating(true);
  };

  // Jump timeline to keyframe
  const jumpToKeyframe = (kf: ClinicalAnnotationKeyframe) => {
    setPlaybackTimeS(kf.timeS);
    const preset = CAMERA_PRESETS[kf.targetPresetId];
    if (preset) {
      triggerCameraZoom(preset);
    }
  };

  // Spacebar hotkey toggles play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatScrubberTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-black text-gray-200">
      {/* Studio Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2 font-mono text-xs select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm font-bold tracking-widest text-nominal">
              OPENSCREEN TELEMETRY STUDIO
            </span>
          </div>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">SPRING-PHYSICS MOTION (k=340, c=38)</span>
        </div>

        {/* Layout Switcher & Zoom Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Layout Controls */}
          <div className="flex items-center gap-1 rounded border border-line bg-black p-0.5">
            <span className="px-1.5 text-[10px] text-gray-500">LAYOUT:</span>
            {([
              ['LAYOUT_SPLIT', 'Split 50/50'],
              ['LAYOUT_PIP', 'Picture-in-Pic'],
              ['LAYOUT_FOCUS', 'Full Focus'],
            ] as const).map(([id, label]) => {
              const active = layout === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLayout(id)}
                  className={`cursor-pointer rounded px-2 py-0.5 text-[11px] transition-colors ${
                    active ? 'bg-nominal font-bold text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Quick Target Zoom Dropdown / Buttons */}
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-[10px] text-gray-500">ZOOM:</span>
            {Object.values(CAMERA_PRESETS).map((p) => {
              const active = activePreset.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => triggerCameraZoom(p)}
                  className={`cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-mono transition-colors ${
                    active
                      ? 'border-nominal bg-nominal/20 text-nominal font-bold'
                      : 'border-line text-gray-400 hover:border-gray-500 hover:text-white'
                  }`}
                  title={p.description}
                >
                  {p.id}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Viewport Workspace based on Layout Mode */}
      <div className="relative min-h-0 flex-1 overflow-hidden p-3">
        {/* LAYOUT_SPLIT: 50% 3D Twin | 50% Telemetry Waveforms */}
        {layout === 'LAYOUT_SPLIT' && (
          <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Left 3D Viewport with Spring Zoom */}
            <div className="relative flex min-h-0 flex-col rounded-lg border border-line bg-black overflow-hidden">
              <div className="absolute top-2 left-2 z-10 rounded border border-line bg-black/80 px-2 py-1 font-mono text-[11px] backdrop-blur">
                <span className="text-gray-500">TARGET: </span>
                <span className="text-nominal font-bold">{activePreset.name}</span>
                {isCameraAnimating && (
                  <span className="ml-2 text-amber-400 animate-pulse">(SPRING SMOOTHING...)</span>
                )}
              </div>

              <div className="h-full w-full">
                <Canvas camera={{ position: activePreset.position, fov: activePreset.fov ?? 40 }} style={{ background: '#000000' }}>
                  <ambientLight intensity={0.55} />
                  <pointLight position={[2.5, 3, 3]} intensity={28} />
                  <pointLight position={[-2.5, 1.5, 2]} intensity={14} color="#e2e8f0" />
                  <pointLight position={[0, 1, -3]} intensity={12} color="#22d3ee" />

                  <SkeletonLayer s={s} sex={sex} />
                  <VascularNeuroLayer s={s} />
                  <MusclesLayer s={s} opacity={0.35} sex={sex} />
                  <SkinLayer opacity={0.14} sex={sex} skinOnly={false} />

                  <SpringCameraRig
                    targetPreset={activePreset}
                    animating={isCameraAnimating}
                    onAnimationComplete={() => setIsCameraAnimating(false)}
                  />
                  {!isCameraAnimating && (
                    <OrbitControls target={activePreset.target} enablePan={true} minDistance={0.5} maxDistance={7.0} />
                  )}
                </Canvas>
              </div>
            </div>

            {/* Right Telemetry & STL Safety Stream */}
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-panel p-4">
              <div className="flex items-center justify-between border-b border-line pb-2 font-mono text-xs">
                <span className="font-bold text-gray-200">TELEMETRY & STL MARGINS</span>
                <span className="text-gray-500">t = {playbackTimeS.toFixed(1)}s</span>
              </div>

              {/* MRI & Risk Indicator */}
              <div className="rounded border border-line bg-black p-3">
                <MriGauge safety={packet.safety_margins} />
              </div>

              {/* Real-time ECG Waveform */}
              <div className="rounded border border-line bg-black p-3 flex flex-col justify-between">
                <div className="flex justify-between font-mono text-xs text-gray-400 mb-2">
                  <span>ECG CARDIAC TRACE</span>
                  <span>HR: {packet.biometrics.heart_rate_bpm ?? s?.hr ?? 68} bpm</span>
                </div>
                <EcgStrip
                  hr={packet.biometrics.heart_rate_bpm ?? s?.hr ?? 68}
                  artifact={whatIf.artifact_level}
                  sqi={packet.biometrics.sqi_score ?? 0.95}
                />
              </div>

              {/* Predicate Robustness Bars */}
              <div className="rounded border border-line bg-black p-3">
                {s ? <PredicateBars rho={s.rho} /> : null}
              </div>
            </div>
          </div>
        )}

        {/* LAYOUT_PIP: Fullscreen 3D Twin with Picture-in-Picture Telemetry */}
        {layout === 'LAYOUT_PIP' && (
          <div className="relative h-full min-h-0 rounded-lg border border-line bg-black overflow-hidden">
            <Canvas camera={{ position: activePreset.position, fov: activePreset.fov ?? 40 }} style={{ background: '#000000' }}>
              <ambientLight intensity={0.55} />
              <pointLight position={[2.5, 3, 3]} intensity={28} />
              <pointLight position={[-2.5, 1.5, 2]} intensity={14} color="#e2e8f0" />
              <pointLight position={[0, 1, -3]} intensity={12} color="#22d3ee" />

              <SkeletonLayer s={s} sex={sex} />
              <VascularNeuroLayer s={s} />
              <MusclesLayer s={s} opacity={0.35} sex={sex} />
              <SkinLayer opacity={0.14} sex={sex} skinOnly={false} />

              <SpringCameraRig
                targetPreset={activePreset}
                animating={isCameraAnimating}
                onAnimationComplete={() => setIsCameraAnimating(false)}
              />
              {!isCameraAnimating && (
                <OrbitControls target={activePreset.target} enablePan={true} minDistance={0.5} maxDistance={7.0} />
              )}
            </Canvas>

            {/* Floating Picture-in-Picture HUD */}
            <div className="absolute top-4 right-4 z-20 w-80 rounded-lg border border-nominal/70 bg-black/90 p-3 font-mono text-xs shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-line pb-1.5 text-[11px] text-gray-400">
                <span className="font-bold text-nominal">PIP TELEMETRY STREAM</span>
                <span>{playbackTimeS.toFixed(1)}s</span>
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">Heart Rate:</span>
                  <span className="text-white font-bold">{packet.biometrics.heart_rate_bpm ?? s?.hr ?? 68} bpm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Shear Stress tau_w:</span>
                  <span className="text-nominal font-bold">{s ? s.tauW.toFixed(2) : 'N/A'} dyn/cm2</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Optic Sheath ONSD:</span>
                  <span className="text-amber-400 font-bold">{s ? s.onsdMm.toFixed(2) : 'N/A'} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">MRI Score:</span>
                  <span className="text-ok font-bold">{s ? s.mri : 0} / 100</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LAYOUT_FOCUS: Fullscreen Presentation Focus Mode */}
        {layout === 'LAYOUT_FOCUS' && (
          <div className="relative h-full min-h-0 rounded-lg border border-line bg-black overflow-hidden">
            <Canvas camera={{ position: activePreset.position, fov: activePreset.fov ?? 40 }} style={{ background: '#000000' }}>
              <ambientLight intensity={0.55} />
              <pointLight position={[2.5, 3, 3]} intensity={28} />
              <pointLight position={[-2.5, 1.5, 2]} intensity={14} color="#e2e8f0" />
              <pointLight position={[0, 1, -3]} intensity={12} color="#22d3ee" />

              <SkeletonLayer s={s} sex={sex} />
              <VascularNeuroLayer s={s} />
              <MusclesLayer s={s} opacity={0.35} sex={sex} />
              <SkinLayer opacity={0.14} sex={sex} skinOnly={false} />

              <SpringCameraRig
                targetPreset={activePreset}
                animating={isCameraAnimating}
                onAnimationComplete={() => setIsCameraAnimating(false)}
              />
              {!isCameraAnimating && (
                <OrbitControls target={activePreset.target} enablePan={true} minDistance={0.5} maxDistance={7.0} />
              )}
            </Canvas>
          </div>
        )}
      </div>

      {/* Bottom OpenScreen Scrubber & Clinical Keyframe Timeline */}
      <div className="border-t border-line bg-panel p-3 select-none">
        {/* Playback Controls & Scrubber Slider */}
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="cursor-pointer rounded border border-nominal bg-nominal/15 px-3 py-1 font-bold text-nominal hover:bg-nominal hover:text-black transition-colors"
            >
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>

            {/* Reset Button */}
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setPlaybackTimeS(0);
                triggerCameraZoom(CAMERA_PRESETS.DEFAULT);
              }}
              className="cursor-pointer rounded border border-line px-2.5 py-1 text-gray-400 hover:text-white"
            >
              RESET
            </button>

            {/* Time Stamp */}
            <div className="rounded border border-line bg-black px-2.5 py-1 text-gray-200">
              <span className="font-bold text-nominal">{formatScrubberTime(playbackTimeS)}</span>
              <span className="text-gray-500"> / {formatScrubberTime(totalScenarioSeconds)}</span>
            </div>

            {/* Mode Selector (Hard Cap <= 29.8s for NASA 30s rule) */}
            <div className="flex items-center gap-1 rounded border border-line bg-black p-0.5">
              <button
                type="button"
                onClick={() => {
                  setStudioMode('30S_PITCH');
                  if (playbackTimeS > NASA_PITCH_HARD_CAP_SECONDS) setPlaybackTimeS(NASA_PITCH_HARD_CAP_SECONDS);
                }}
                className={`cursor-pointer rounded px-2 py-0.5 text-[10px] transition-colors ${
                  studioMode === '30S_PITCH' ? 'bg-nominal font-bold text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                30s NASA PITCH
              </button>
              <button
                type="button"
                onClick={() => setStudioMode('120S_TOUR')}
                className={`cursor-pointer rounded px-2 py-0.5 text-[10px] transition-colors ${
                  studioMode === '120S_TOUR' ? 'bg-nominal font-bold text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                120s FULL TOUR
              </button>
            </div>

            {/* Speed Multiplier */}
            <div className="flex items-center gap-1 rounded border border-line bg-black p-0.5">
              {[0.5, 1.0, 2.0, 5.0].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setPlaybackRate(rate)}
                  className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    playbackRate === rate ? 'bg-nominal font-bold text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* Active Keyframe Annotation Pill */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">ACTIVE EVENT:</span>
            <span className="rounded border border-nominal/50 bg-nominal/10 px-2 py-0.5 font-bold text-nominal">
              {activeKeyframe.label}
            </span>
          </div>
        </div>

        {/* Timeline Range Scrubber with Marker Ticks */}
        <div className="relative mt-2">
          <input
            type="range"
            min={0}
            max={totalScenarioSeconds}
            step={0.1}
            value={playbackTimeS}
            onChange={(e) => setPlaybackTimeS(parseFloat(e.target.value))}
            className="w-full cursor-pointer"
          />

          {/* Clinical keyframe markers on timeline */}
          <div className="relative mt-1 flex h-6 w-full items-center">
            {CLINICAL_KEYFRAMES.filter((kf) => kf.timeS <= totalScenarioSeconds).map((kf) => {
              const pct = (kf.timeS / totalScenarioSeconds) * 100;
              const isActive = activeKeyframe.label === kf.label;
              return (
                <button
                  key={kf.label}
                  type="button"
                  onClick={() => jumpToKeyframe(kf)}
                  style={{ left: `${pct}%` }}
                  className={`absolute -translate-x-1/2 cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[9px] transition-all ${
                    isActive
                      ? 'border-nominal bg-nominal text-black font-bold z-10 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                      : 'border-line bg-black text-gray-400 hover:border-gray-500 hover:text-white'
                  }`}
                  title={`${kf.label} (t=${kf.timeS}s)`}
                >
                  {kf.timeS}s: {kf.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clinical Narrative Explainer Card */}
        <div className="mt-2 rounded border border-line bg-black p-2.5 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-nominal">{activeKeyframe.label}:</span>
            <span className="text-gray-300">{activeKeyframe.summary}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
