// Unified single-`useFrame` spherical camera spring rig, optical `setViewOffset` frustum centering,
// Risk 3 pointer-capture scrubbing `OrbitControls` freeze, manual flight abort, Command Palette
// `ESC` snapshot restore, and accessible keyboard 3D `UBERON:` node mirrors.

import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AnatomicalRegionWireId } from '../types/telemetry';
import type { CameraSnapshot, StudioCameraPresetId } from '../types/workbench';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useStudioTimelineStore } from '../stores/studioTimelineStore';
import { CANONICAL_REGIONS } from '../modules/body-3d-heatmap/uberonSpatialMapping';
import {
  POLAR_MAX_RAD,
  POLAR_MIN_RAD,
  RADIUS_MAX_M,
  RADIUS_MIN_M,
  abortCameraFlightInPlace,
  beginCameraFlight,
  cartesianToSphericalSnapshot,
  computeOpticalViewOffset,
  createInitialCameraRigState,
  presetIdForUberonRegion,
  presetToCameraSnapshot,
  sphericalSnapshotToCartesian,
  stepCameraRigFrame,
  type ViewportChromeInsets,
} from './cameraRigMath';

export interface UnifiedCameraControllerProps {
  chromeInsets?: ViewportChromeInsets;
  presetOverride?: StudioCameraPresetId | null;
  domElement?: HTMLElement | null;
  apertureTrackRef?: React.RefObject<HTMLElement | null>;
  onCaptureSnapshotRef?: React.MutableRefObject<(() => CameraSnapshot) | null>;
}

const ZERO_INSETS: ViewportChromeInsets = {
  leftPx: 0,
  rightPx: 0,
  topPx: 0,
  bottomPx: 0,
};

const _scratchOutPos: [number, number, number] = [0, 0.45, 3.3];

function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function UnifiedCameraController({
  chromeInsets = ZERO_INSETS,
  presetOverride = null,
  domElement,
  apertureTrackRef,
  onCaptureSnapshotRef,
}: UnifiedCameraControllerProps) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);

  const workbenchScrubbing = useWorkbenchStore((s) => s.isScrubbing);
  const studioScrubbing = useStudioTimelineStore((s) => s.isScrubbing);
  const selectedUberonRegion = useWorkbenchStore((s) => s.selectedUberonRegion);
  const commandPaletteOpen = useWorkbenchStore((s) => s.commandPaletteOpen);
  const prePreviewCameraSnapshot = useWorkbenchStore((s) => s.prePreviewCameraSnapshot);
  const activeMarkerId = useStudioTimelineStore((s) => s.activeMarkerId);
  const studioBarOpen = useWorkbenchStore((s) => s.studioBarOpen);
  const twinAutoRotate = useWorkbenchStore((s) => s.twinAutoRotate);

  // NotebookLM Risk 3 Fix: freeze OrbitControls whenever timeline or slider is scrubbing
  const effectiveScrubbing = workbenchScrubbing || studioScrubbing;

  const [resolvedDomEl, setResolvedDomEl] = useState<HTMLElement | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const targetSnapshotRef = useRef<CameraSnapshot>(presetToCameraSnapshot('DEFAULT'));
  const rigStateRef = useRef(createInitialCameraRigState(targetSnapshotRef.current));
  const prevPaletteOpenRef = useRef<boolean>(commandPaletteOpen);
  const isInitialMountRef = useRef<boolean>(true);

  useEffect(() => {
    setResolvedDomEl(apertureTrackRef?.current ?? domElement ?? null);
  }, [apertureTrackRef, domElement]);

  // Ensure OrbitControls target starts at the anatomical center (`DEFAULT` target) on mount
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const initTarget = targetSnapshotRef.current.target;
    ctrl.target.set(initTarget[0], initTarget[1], initTarget[2]);
    ctrl.update();
  }, [resolvedDomEl]);

  // Expose synchronous camera snapshot capture for Command Palette hover preview
  useEffect(() => {
    if (!onCaptureSnapshotRef) return;
    onCaptureSnapshotRef.current = () => {
      const ctrl = controlsRef.current;
      const persp = camera as THREE.PerspectiveCamera;
      const pos: [number, number, number] = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];
      const tgt: [number, number, number] = ctrl
        ? [ctrl.target.x, ctrl.target.y, ctrl.target.z]
        : [...rigStateRef.current.target];
      return cartesianToSphericalSnapshot(pos, tgt, persp.isPerspectiveCamera ? persp.fov : 45);
    };
    return () => {
      onCaptureSnapshotRef.current = null;
    };
  }, [camera, onCaptureSnapshotRef]);

  // Trigger smooth shortest-arc flight when presetOverride or selectedUberonRegion changes
  useEffect(() => {
    const targetId: StudioCameraPresetId =
      presetOverride ?? presetIdForUberonRegion(selectedUberonRegion);
    const nextSnap = presetToCameraSnapshot(targetId);
    targetSnapshotRef.current = nextSnap;
    if (isInitialMountRef.current && targetId === 'DEFAULT') {
      isInitialMountRef.current = false;
      return;
    }
    isInitialMountRef.current = false;
    beginCameraFlight(rigStateRef.current, nextSnap);
  }, [presetOverride, selectedUberonRegion]);

  // Synchronize camera to Studio magnetic event marker when Studio bar is active
  useEffect(() => {
    if (!studioBarOpen || !activeMarkerId) return;
    const markers = useStudioTimelineStore.getState().magneticEventMarkers;
    const marker = markers.find((m) => m.id === activeMarkerId);
    if (!marker) return;
    const nextSnap = presetToCameraSnapshot(marker.targetPresetId);
    targetSnapshotRef.current = nextSnap;
    beginCameraFlight(rigStateRef.current, nextSnap);
  }, [activeMarkerId, studioBarOpen]);

  // Restore pre-preview camera snapshot when Command Palette closes via ESC without commit
  useEffect(() => {
    const wasOpen = prevPaletteOpenRef.current;
    prevPaletteOpenRef.current = commandPaletteOpen;
    if (wasOpen && !commandPaletteOpen && prePreviewCameraSnapshot) {
      targetSnapshotRef.current = prePreviewCameraSnapshot;
      beginCameraFlight(rigStateRef.current, prePreviewCameraSnapshot);
    }
  }, [commandPaletteOpen, prePreviewCameraSnapshot]);

  // Wheel zoom also aborts programmatic flight immediately so user takes manual control
  useEffect(() => {
    const targetEl = resolvedDomEl ?? domElement ?? gl.domElement;
    if (!targetEl) return;
    const handleManualInterrupt = (): void => {
      if (!rigStateRef.current.inFlight) return;
      abortCameraFlightInPlace(rigStateRef.current);
    };
    targetEl.addEventListener('wheel', handleManualInterrupt, { passive: true });
    targetEl.addEventListener('pointerdown', handleManualInterrupt, { passive: true });
    return () => {
      targetEl.removeEventListener('wheel', handleManualInterrupt);
      targetEl.removeEventListener('pointerdown', handleManualInterrupt);
    };
  }, [domElement, gl, resolvedDomEl]);

  useFrame((_state, rawDelta) => {
    const persp = camera as THREE.PerspectiveCamera;
    const ctrl = controlsRef.current;
    const rig = rigStateRef.current;
    const reducedMotion = isReducedMotionPreferred();

    const optical = computeOpticalViewOffset(size.width, size.height, chromeInsets);

    stepCameraRigFrame(
      rig,
      targetSnapshotRef.current,
      optical.offsetX,
      optical.offsetY,
      rawDelta,
      reducedMotion,
    );

    if (rig.inFlight || reducedMotion) {
      if (rig.inFlight) {
        sphericalSnapshotToCartesian(
          {
            azimuthRad: rig.azimuthRad,
            polarRad: rig.polarRad,
            radiusM: rig.radiusM,
            target: rig.target,
            fovDeg: rig.fovDeg,
          },
          _scratchOutPos,
        );
        camera.position.set(_scratchOutPos[0], _scratchOutPos[1], _scratchOutPos[2]);
        if (ctrl) {
          ctrl.target.set(rig.target[0], rig.target[1], rig.target[2]);
          ctrl.update();
        } else {
          camera.lookAt(rig.target[0], rig.target[1], rig.target[2]);
        }
        if (persp.isPerspectiveCamera && Math.abs(persp.fov - rig.fovDeg) > 1e-3) {
          persp.fov = rig.fovDeg;
        }
      }
    } else if (ctrl) {
      // Note: Drei's <OrbitControls> updates damping & autoRotate at priority -1 each frame.
      // Mirror live camera spherical pose so subsequent organ flights start seamlessly.
      const liveSnap = cartesianToSphericalSnapshot(
        [camera.position.x, camera.position.y, camera.position.z],
        [ctrl.target.x, ctrl.target.y, ctrl.target.z],
        persp.isPerspectiveCamera ? persp.fov : 45,
      );
      rig.azimuthRad = liveSnap.azimuthRad;
      rig.polarRad = liveSnap.polarRad;
      rig.radiusM = liveSnap.radiusM;
      rig.target[0] = liveSnap.target[0];
      rig.target[1] = liveSnap.target[1];
      rig.target[2] = liveSnap.target[2];
      rig.fovDeg = liveSnap.fovDeg;
    }

    if (persp.isPerspectiveCamera) {
      if (Math.abs(rig.offsetX) < 0.25 && Math.abs(rig.offsetY) < 0.25) {
        persp.clearViewOffset();
      } else {
        persp.setViewOffset(
          optical.fullWidth,
          optical.fullHeight,
          rig.offsetX,
          rig.offsetY,
          optical.fullWidth,
          optical.fullHeight,
        );
      }
      persp.updateProjectionMatrix();
    }

    camera.updateMatrixWorld();
  });

  const reducedMotion = isReducedMotionPreferred();
  const autoRotateActive =
    twinAutoRotate &&
    !effectiveScrubbing &&
    !selectedUberonRegion &&
    !presetOverride &&
    !reducedMotion;

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      domElement={resolvedDomEl ?? domElement ?? undefined}
      enabled={!effectiveScrubbing}
      autoRotate={autoRotateActive}
      autoRotateSpeed={1.65}
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={RADIUS_MIN_M}
      maxDistance={RADIUS_MAX_M}
      minPolarAngle={POLAR_MIN_RAD}
      maxPolarAngle={POLAR_MAX_RAD}
      onStart={() => {
        abortCameraFlightInPlace(rigStateRef.current);
      }}
    />
  );
}

export interface SpatialNodeKeyboardAnchorsProps {
  observedByRegion?: Partial<Record<AnatomicalRegionWireId, boolean>>;
  className?: string;
}

/**
 * Accessible DOM `.spatial-node-anchor` `<button>` mirrors (`>= 48x48px` hit targets,
 * NASA-STD-3001 microgravity keyboard/switch compliance) allowing keyboard `Tab` +
 * `Enter`/`Space` focus across all 5 canonical `UBERON:` anatomical anchors.
 */
export function SpatialNodeKeyboardAnchors({
  observedByRegion,
  className = '',
}: SpatialNodeKeyboardAnchorsProps) {
  const selectedUberonRegion = useWorkbenchStore((s) => s.selectedUberonRegion);
  const selectUberonRegion = useWorkbenchStore((s) => s.selectUberonRegion);

  // Normalized 2D overlay percentages aligned with default coronal framing
  const anchorCssPositions: Readonly<Record<AnatomicalRegionWireId, { top: string; left: string }>> = {
    BrainVestibularCns: { top: '12%', left: '50%' },
    EyeOcularSans: { top: '18%', left: '52%' },
    InternalJugularVein: { top: '28%', left: '47%' },
    HeartCardioAutonomic: { top: '42%', left: '50%' },
    SoleusCalcaneus: { top: '79%', left: '50%' },
  };

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 ${className}`.trim()}
      role="group"
      aria-label="3D Anatomical Digital Twin UBERON Anchors"
    >
      {CANONICAL_REGIONS.map((meta) => {
        const isSelected = selectedUberonRegion === meta.region;
        const isObserved = observedByRegion?.[meta.region] === true;
        const pos = anchorCssPositions[meta.region];
        return (
          <button
            key={meta.uberonCurie}
            type="button"
            id={`spatial-anchor-${meta.key}`}
            className="spatial-node-anchor pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full opacity-0 focus-visible:opacity-100 focus-visible:bg-black/85 focus-visible:px-3 text-[11px] font-mono tracking-wider text-cyan-200 transition-opacity"
            style={{ top: pos.top, left: pos.left }}
            aria-pressed={isSelected}
            aria-label={`${meta.label} (${meta.uberonCurie}) - ${isObserved ? 'Observed telemetry' : 'Unobserved telemetry'}`}
            onClick={() => {
              selectUberonRegion(isSelected ? null : meta.region);
            }}
          >
            <span className="whitespace-nowrap">
              {meta.uberonCurie} {meta.region}
            </span>
          </button>
        );
      })}
    </div>
  );
}
