// Persistent full-bleed `inset-0` single-WebGL2 `<Canvas>` root (`SpatialCanvasRoot`).
// Architecture invariants:
// - Strictly ONE WebGL2 context across the entire ARES-Health spatial workbench
// - `ACESFilmicToneMapping`, `SRGBColorSpace`, `stencil: false`, `dpr={[1, 2]}`, `powerPreference: 'high-performance'`
// - Zero full-screen EffectComposer bloom/post-fx passes (all Fresnel/wireframe effects run in single-pass GLSL3)
// - `<View.Port />` scissoring for primary Biodigital Stage + Secondary Mesh Inspector + Studio SPLIT/PIP
// - Deterministic `webglcontextlost` (`preventDefault` + `setAnimationLoop(null)`) and
//   `webglcontextrestored` (`gl.resetState()` + shader warmup re-trigger) recovery

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, type RootState } from '@react-three/fiber';
import { View } from '@react-three/drei';
import * as THREE from 'three';
import { ShaderWarmupManager } from './ShaderWarmupManager';
import { AdaptivePerformanceGuard } from './AdaptivePerformanceGuard';

/**
 * Explicit priority-1 full-bleed render pass for the primary 3D Biodigital Twin scene.
 * Ensures the full-viewport primary scene always renders before any secondary Drei `<View index={2}>`
 * scissored viewports (which otherwise disable R3F's default priority-0 auto-render), and clears
 * the depth buffer afterward so secondary `<View>` overlays render cleanly without depth collisions.
 */
function PrimarySceneRenderLoop() {
  useFrame((state) => {
    const { gl, scene, camera, size } = state;
    gl.autoClear = false;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.clear(true, true, false);
    gl.render(scene, camera);
    gl.clearDepth();
  }, 1);

  return null;
}

export interface SpatialCanvasRootProps {
  /** Optional explicit DOM element receiving pointer events for `<View />` raycasting. */
  eventSource?: HTMLElement | React.RefObject<HTMLElement | null> | null;
  children?: React.ReactNode;
  className?: string;
  onContextLostChange?: (lost: boolean) => void;
}

export function SpatialCanvasRoot({
  eventSource,
  children,
  className = '',
  onContextLostChange,
}: SpatialCanvasRootProps) {
  const [fallbackEventSource, setFallbackEventSource] = useState<HTMLElement | undefined>(
    undefined,
  );
  const [contextRestoreEpoch, setContextRestoreEpoch] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (eventSource || typeof document === 'undefined') return;
    const rootEl = document.getElementById('root') ?? document.body;
    setFallbackEventSource(rootEl);
  }, [eventSource]);

  useEffect(() => {
    return () => {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
    };
  }, []);

  const handleCreated = useCallback(
    (state: RootState) => {
      const renderer = state.gl;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const canvasEl = renderer.domElement;

      const onLost = (rawEvent: Event): void => {
        rawEvent.preventDefault();
        renderer.setAnimationLoop(null);
        setContextLost(true);
        onContextLostChange?.(true);
      };

      const onRestored = (): void => {
        renderer.resetState();
        setContextLost(false);
        setContextRestoreEpoch((prev) => prev + 1);
        onContextLostChange?.(false);
        state.invalidate();
      };

      canvasEl.addEventListener('webglcontextlost', onLost, false);
      canvasEl.addEventListener('webglcontextrestored', onRestored, false);

      cleanupListenersRef.current?.();
      cleanupListenersRef.current = () => {
        canvasEl.removeEventListener('webglcontextlost', onLost, false);
        canvasEl.removeEventListener('webglcontextrestored', onRestored, false);
      };
    },
    [onContextLostChange],
  );

  const resolvedEventSource =
    (eventSource as HTMLElement | React.RefObject<HTMLElement> | undefined) ??
    fallbackEventSource;

  return (
    <div
      className={`fixed inset-0 z-0 pointer-events-none select-none ${className}`.trim()}
      data-webgl-context-lost={contextLost ? 'true' : 'false'}
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 2]}
        eventSource={resolvedEventSource}
        eventPrefix="client"
        gl={{
          antialias: true,
          alpha: true,
          stencil: false,
          depth: true,
          powerPreference: 'high-performance',
        }}
        onCreated={handleCreated}
        style={{ pointerEvents: 'none' }}
      >
        <ShaderWarmupManager contextRestoreEpoch={contextRestoreEpoch} />
        <AdaptivePerformanceGuard />
        <PrimarySceneRenderLoop />
        {children}
        <View.Port />
      </Canvas>
    </div>
  );
}
