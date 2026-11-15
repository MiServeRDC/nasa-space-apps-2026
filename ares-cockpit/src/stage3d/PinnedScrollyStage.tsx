// Pinned full-screen 3D scrollytelling stage with spline camera waypoints.
// Implements:
// - CatmullRomCurve3 camera spline path across 5 narrative chapters (Hero, Cardio, Explorer, Musculoskeletal, Decision)
// - Critically-damped Quaternion.slerp orientation interpolation (zero gimbal lock)
// - Zero React state re-renders inside scroll ticker (reads mutable scrollProgressRef in useFrame)
// - DPR <= 1.5 enforcement for mobile/retina performance
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSmoothScroll } from '../scrollytelling/SmoothScrollProvider';
import type { CrewSex } from '../lib/scenario';
import { PairedAtlasBody } from '../modules/body-3d-heatmap/PairedAtlasBody';
import type { AtlasAnchors } from '../modules/body-3d-heatmap/AtlasBody';

export interface CameraWaypoint {
  id: 'Hero' | 'Cardio' | 'Explorer' | 'Musculoskeletal' | 'Decision';
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const CHAPTER_WAYPOINTS: readonly CameraWaypoint[] = [
  // 0: Hero - Full body frontal overview in zero-g float
  {
    id: 'Hero',
    label: 'Overview & Transit Baseline',
    position: [0, 0.05, 3.2],
    target: [0, 0, 0],
    fov: 45,
  },
  // 1: Cardio - Cephalad venous engorgement & jugular vein (Heart & IJV)
  {
    id: 'Cardio',
    label: 'Cardiovascular Cephalad Shift',
    position: [0.22, 0.44, 1.25],
    target: [0, 0.38, 0],
    fov: 38,
  },
  // 2: Explorer - Multimodal anatomical layers scrub & intracranial vault
  {
    id: 'Explorer',
    label: 'Neuro-Ocular & Full Torso Explorer',
    position: [0, 0.08, 2.15],
    target: [0, 0, 0],
    fov: 42,
  },
  // 3: Musculoskeletal - Lower extremity deconditioning (Soleus & Calcaneus bone)
  {
    id: 'Musculoskeletal',
    label: 'Musculoskeletal Resorption',
    position: [-0.25, -0.62, 1.35],
    target: [0, -0.65, 0],
    fov: 38,
  },
  // 4: Decision - Tactical 3/4 elevated view for closed-loop MedOps interlocks
  {
    id: 'Decision',
    label: 'Autonomous MedOps Decision State',
    position: [0.72, 0.48, 2.25],
    target: [0, 0.05, 0],
    fov: 44,
  },
];

// Precompute spline curve for position
const WAYPOINT_SPLINE = new THREE.CatmullRomCurve3(
  CHAPTER_WAYPOINTS.map((wp) => new THREE.Vector3(...wp.position)),
  false,
  'catmullrom',
  0.5,
);

// Precompute target Quaternions for orientation slerp
const dummyObj = new THREE.Object3D();
const WAYPOINT_QUATERNIONS: THREE.Quaternion[] = CHAPTER_WAYPOINTS.map((wp) => {
  dummyObj.position.set(wp.position[0], wp.position[1], wp.position[2]);
  dummyObj.lookAt(wp.target[0], wp.target[1], wp.target[2]);
  return dummyObj.quaternion.clone();
});

function CameraController({
  waypoints = CHAPTER_WAYPOINTS,
}: {
  waypoints?: readonly CameraWaypoint[];
}) {
  const { camera } = useThree();
  const { scrollProgressRef } = useSmoothScroll();

  const currentPos = useRef(new THREE.Vector3(...waypoints[0].position));
  const currentQuat = useRef(WAYPOINT_QUATERNIONS[0].clone());
  const targetQuat = useRef(new THREE.Quaternion());

  useFrame((state, delta) => {
    const rawProgress = scrollProgressRef.current.progress;
    const progress = Math.max(0, Math.min(1, rawProgress));

    // Spline curve position lookup
    const splinePoint = WAYPOINT_SPLINE.getPointAt(progress);

    // Segment calculation for quaternion slerp and FOV
    const totalSegments = waypoints.length - 1;
    const scaledProg = progress * totalSegments;
    const segmentIndex = Math.min(totalSegments - 1, Math.floor(scaledProg));
    const segmentT = scaledProg - segmentIndex;

    // Smoothstep interpolation factor
    const smoothT = segmentT * segmentT * (3 - 2 * segmentT);

    const nextIndex = Math.min(waypoints.length - 1, segmentIndex + 1);
    const quatA = WAYPOINT_QUATERNIONS[segmentIndex];
    const quatB = WAYPOINT_QUATERNIONS[nextIndex];

    // Quaternion slerp for orientation without gimbal lock
    targetQuat.current.copy(quatA).slerp(quatB, smoothT);

    // Microgravity idle floating drift
    const idleY = Math.sin(state.clock.elapsedTime * 0.9) * 0.012;
    const idleX = Math.sin(state.clock.elapsedTime * 0.45) * 0.008;
    splinePoint.y += idleY;
    splinePoint.x += idleX;

    // Critically damped spring smoothing
    const springFactor = Math.min(1, delta * 5.0);
    currentPos.current.lerp(splinePoint, springFactor);
    currentQuat.current.slerp(targetQuat.current, springFactor);

    camera.position.copy(currentPos.current);
    camera.quaternion.copy(currentQuat.current);

    if (camera instanceof THREE.PerspectiveCamera) {
      const wpA = waypoints[segmentIndex];
      const wpB = waypoints[nextIndex];
      const targetFov = THREE.MathUtils.lerp(wpA.fov, wpB.fov, smoothT);
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, springFactor);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

export interface PinnedScrollyStageProps {
  sex: CrewSex;
  layers?: readonly number[];
  onAnchors?: (anchors: AtlasAnchors) => void;
  interactive?: boolean;
}

export function PinnedScrollyStage({
  sex,
  layers = [0, 1, 2, 3],
  onAnchors,
  interactive = false,
}: PinnedScrollyStageProps) {
  // DPR <= 1.5 invariant
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;

  const dummyAnchors = useMemo(() => () => {}, []);

  return (
    <div
      className={`fixed inset-0 z-0 select-none overflow-hidden ${
        interactive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0.05, 3.2], fov: 45, near: 0.1, far: 50 }}
        dpr={dpr}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
      >
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 3, 4]} intensity={1.2} />
        <directionalLight position={[-2, -1, -2]} intensity={0.35} color="#5588cc" />
        <pointLight position={[0, 0.4, 1.5]} intensity={0.6} color="#ffffff" distance={4} />

        <CameraController />

        <Suspense fallback={null}>
          <group position={[0, -0.1, 0]}>
            <PairedAtlasBody
              sex={sex}
              layers={layers}
              onAnchors={onAnchors || dummyAnchors}
            />
          </group>
        </Suspense>
      </Canvas>

      {/* Subtle vignette boundary for NASA OLED depth */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.85)_100%)]" />
    </div>
  );
}
