// Pinned full-screen 3D scrollytelling stage.
// Mounts as a fixed `inset-0 z-0` layer behind the scrollable HTML content.
// Pointer events are disabled by default; they activate only while Chapter 3
// (Interactive Explorer) is live so the user can orbit and click injury markers.
// Renders the dual humanoid anatomy via `PairedAtlasBody` for sex profiles
// `male` / `female`, with depth-layer support (Skin=0, Muscles=1,
// Organs+Vessels=2, Skeleton=3).
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useCallback, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { PairedAtlasBody } from '../modules/body-3d-heatmap/PairedAtlasBody';
import { ScrollyCameraController } from './ScrollyCameraController';
import { useScrollyContext } from '../scrollytelling/ScrollyContext';
import type { AtlasAnchors } from '../modules/body-3d-heatmap/AtlasBody';
import type { V3 } from '../modules/body-3d-heatmap/AnatomicalLayers';
import type { CrewSex } from '../lib/scenario';

// ---------------------------------------------------------------------------
// Depth layer presets
// ---------------------------------------------------------------------------

/** All anatomical depth layers visible (Skin + Muscles + Organs/Vessels + Skeleton). */
const ALL_LAYERS: readonly number[] = [0, 1, 2, 3] as const;

// ---------------------------------------------------------------------------
// Inner scene rendered inside the Canvas
// ---------------------------------------------------------------------------

interface ScrollySceneProps {
  sex: CrewSex;
  layers: readonly number[];
  orbitEnabled: boolean;
  onAnchors: (anchors: AtlasAnchors) => void;
  onSurfaceClick?: (point: V3) => void;
}

function ScrollyScene({
  sex,
  layers,
  orbitEnabled,
  onAnchors,
  onSurfaceClick,
}: ScrollySceneProps) {
  return (
    <>
      {/* Ambient + directional lighting matching the cockpit palette */}
      <ambientLight intensity={0.45} color="#c8d8f0" />
      <directionalLight
        position={[2.5, 4, 3]}
        intensity={1.1}
        color="#ffffff"
        castShadow={false}
      />
      <directionalLight
        position={[-2, -1, -2]}
        intensity={0.3}
        color="#6090c0"
        castShadow={false}
      />

      {/* Default perspective camera; ScrollyCameraController will drive it */}
      <PerspectiveCamera makeDefault fov={45} near={0.1} far={30} position={[0, 0, 3.2]} />

      {/* Chapter-driven smooth camera rig (slerp quaternion, no gimbal lock) */}
      <ScrollyCameraController />

      {/* Orbit controls only active during Chapter 3 */}
      {orbitEnabled && (
        <OrbitControls
          makeDefault={false}
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          minDistance={0.8}
          maxDistance={6}
        />
      )}

      {/* Dual-sex anatomy model; layers prop drives transparency cascade */}
      <PairedAtlasBody
        sex={sex}
        layers={layers}
        onAnchors={onAnchors}
        onSurfaceClick={onSurfaceClick}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// PinnedScrollyStage (public export)
// ---------------------------------------------------------------------------

export interface PinnedScrollyStageProps {
  /** Biological sex profile for the anatomy model. Default: 'MALE'. */
  sex?: CrewSex;
  /**
   * Depth layers to render.
   * 0 = Skin, 1 = Muscles, 2 = Organs/Vessels, 3 = Skeleton.
   * Defaults to all layers visible.
   */
  layers?: readonly number[];
  /** Called when the PairedAtlasBody emits anchor positions after GLB load. */
  onAnchors?: (anchors: AtlasAnchors) => void;
  /** Called when the user clicks a surface point in Chapter 3 (interactive mode). */
  onSurfaceClick?: (point: V3) => void;
  className?: string;
}

/**
 * Fixed full-screen 3D stage that sits at `z-index: 0` behind the scrollable
 * HTML narrative content. Chapter-driven camera transitions are handled by
 * `ScrollyCameraController`. In Chapter 3 the stage becomes interactive:
 * pointer events are enabled so the user can orbit and click injury markers.
 */
export function PinnedScrollyStage({
  sex = 'MALE',
  layers = ALL_LAYERS,
  onAnchors,
  onSurfaceClick,
  className = '',
}: PinnedScrollyStageProps) {
  const { interactiveCameraEnabled } = useScrollyContext();
  const [anchorsReady, setAnchorsReady] = useState(false);

  const handleAnchors = useCallback(
    (anchors: AtlasAnchors) => {
      setAnchorsReady(true);
      onAnchors?.(anchors);
    },
    [onAnchors],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={[
        'fixed inset-0 z-0',
        // Allow user interaction only when Chapter 3 is active
        interactiveCameraEnabled ? 'pointer-events-auto' : 'pointer-events-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden={!interactiveCameraEnabled}
      data-anchors-ready={String(anchorsReady)}
    >
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        dpr={[1, 2]}
        frameloop="always"
        style={{ width: '100%', height: '100%' }}
        eventSource={containerRef as React.RefObject<HTMLElement>}
      >
        <ScrollyScene
          sex={sex}
          layers={layers}
          orbitEnabled={interactiveCameraEnabled}
          onAnchors={handleAnchors}
          onSurfaceClick={interactiveCameraEnabled ? onSurfaceClick : undefined}
        />
      </Canvas>
    </div>
  );
}
