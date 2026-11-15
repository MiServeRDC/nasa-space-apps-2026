// Scrollytelling camera controller: slerp-interpolated camera rig driven by
// active chapter index and normalized scroll progress.
// Uses `Quaternion.slerp` via three.js to prevent gimbal lock on all chapter
// transitions. Microgravity floating oscillation active on Chapter 1 (Hero).
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useScrollyContext, type ScrollyChapter } from '../scrollytelling/ScrollyContext';

// ---------------------------------------------------------------------------
// Chapter camera waypoints
// ---------------------------------------------------------------------------
interface CameraWaypoint {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

const CHAPTER_WAYPOINTS: Readonly<Record<ScrollyChapter, CameraWaypoint>> = {
  1: { position: [0, 0, 3.2],    target: [0, 0, 0] },        // Hero / Descent
  2: { position: [0.35, 0.45, 1.25], target: [0, 0.4, 0] },  // Cardio / Hemodynamics
  3: { position: [0, 0, 2.8],    target: [0, 0, 0] },        // Interactive Explorer
  4: { position: [0.2, -0.65, 1.3], target: [0, -0.6, 0] },  // Musculoskeletal
  5: { position: [0.9, 0.2, 2.5], target: [0, 0, 0] },       // Clinical Decision
};

// Interpolation speed (critically-damped, zeta=1) expressed as natural frequency.
const OMEGA_N = 3.5; // rad/s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const _tmpPos = new THREE.Vector3();
const _tmpTarget = new THREE.Vector3();
const _tmpGoalPos = new THREE.Vector3();
const _tmpGoalTarget = new THREE.Vector3();
const _tmpQStart = new THREE.Quaternion();
const _tmpQEnd = new THREE.Quaternion();
const _tmpMat = new THREE.Matrix4();
const _tmpUp = new THREE.Vector3(0, 1, 0);

/** Build a look-at quaternion from eye toward target. */
function computeLookAtQuat(
  eye: THREE.Vector3,
  target: THREE.Vector3,
  out: THREE.Quaternion,
): void {
  _tmpMat.lookAt(eye, target, _tmpUp);
  out.setFromRotationMatrix(_tmpMat);
}

/** Critically-damped scalar spring step (zeta = 1, zero overshoot). */
function stepSpring(
  current: number,
  goal: number,
  velocity: number,
  dt: number,
  omegaN: number,
): { value: number; velocity: number } {
  const c = 1 + omegaN * dt;
  const k = omegaN * omegaN * dt;
  const denom = c + k * dt;
  const v = (velocity - k * (current - goal) / denom) / c;
  const x = current + v * dt;
  return { value: x, velocity: v };
}

// ---------------------------------------------------------------------------
// Persistent rig state (mutable ref values)
// ---------------------------------------------------------------------------
interface RigState {
  posX: number; posXVel: number;
  posY: number; posYVel: number;
  posZ: number; posZVel: number;
  tgtX: number; tgtXVel: number;
  tgtY: number; tgtYVel: number;
  tgtZ: number; tgtZVel: number;
  slerpT: number; slerpVel: number;
  orientation: [number, number, number, number];
  flightStartQuat: [number, number, number, number];
  flightTargetQuat: [number, number, number, number];
  oscillationPhase: number;
}

function makeRigState(wp: CameraWaypoint): RigState {
  return {
    posX: wp.position[0], posXVel: 0,
    posY: wp.position[1], posYVel: 0,
    posZ: wp.position[2], posZVel: 0,
    tgtX: wp.target[0], tgtXVel: 0,
    tgtY: wp.target[1], tgtYVel: 0,
    tgtZ: wp.target[2], tgtZVel: 0,
    slerpT: 1, slerpVel: 0,
    orientation: [0, 0, 0, 1],
    flightStartQuat: [0, 0, 0, 1],
    flightTargetQuat: [0, 0, 0, 1],
    oscillationPhase: 0,
  };
}

// ---------------------------------------------------------------------------
// ScrollyCameraController component
// ---------------------------------------------------------------------------

/** Drop this component inside a `<Canvas>` / R3F scene tree. */
export function ScrollyCameraController() {
  const { activeChapter } = useScrollyContext();
  const camera = useThree((s) => s.camera);

  const rigRef = useRef<RigState>(makeRigState(CHAPTER_WAYPOINTS[1]));
  const prevChapterRef = useRef<ScrollyChapter>(activeChapter);

  useFrame((_state, delta) => {
    const rig = rigRef.current;
    const dt = Math.min(delta, 0.05); // cap at 50 ms to prevent spiral

    const wp = CHAPTER_WAYPOINTS[activeChapter];

    // Detect chapter change to restart slerp
    if (prevChapterRef.current !== activeChapter) {
      prevChapterRef.current = activeChapter;
      rig.slerpT = 0;
      rig.slerpVel = 0;

      // Capture current orientation as slerp start
      rig.flightStartQuat[0] = camera.quaternion.x;
      rig.flightStartQuat[1] = camera.quaternion.y;
      rig.flightStartQuat[2] = camera.quaternion.z;
      rig.flightStartQuat[3] = camera.quaternion.w;

      // Compute goal orientation
      _tmpGoalPos.set(wp.position[0], wp.position[1], wp.position[2]);
      _tmpGoalTarget.set(wp.target[0], wp.target[1], wp.target[2]);
      computeLookAtQuat(_tmpGoalPos, _tmpGoalTarget, _tmpQEnd);
      rig.flightTargetQuat[0] = _tmpQEnd.x;
      rig.flightTargetQuat[1] = _tmpQEnd.y;
      rig.flightTargetQuat[2] = _tmpQEnd.z;
      rig.flightTargetQuat[3] = _tmpQEnd.w;
    }

    const omegaN = OMEGA_N;

    // Spring-interpolate position
    const px = stepSpring(rig.posX, wp.position[0], rig.posXVel, dt, omegaN);
    rig.posX = px.value; rig.posXVel = px.velocity;
    const py = stepSpring(rig.posY, wp.position[1], rig.posYVel, dt, omegaN);
    rig.posY = py.value; rig.posYVel = py.velocity;
    const pz = stepSpring(rig.posZ, wp.position[2], rig.posZVel, dt, omegaN);
    rig.posZ = pz.value; rig.posZVel = pz.velocity;

    // Spring-interpolate lookAt target
    const tx = stepSpring(rig.tgtX, wp.target[0], rig.tgtXVel, dt, omegaN);
    rig.tgtX = tx.value; rig.tgtXVel = tx.velocity;
    const ty = stepSpring(rig.tgtY, wp.target[1], rig.tgtYVel, dt, omegaN);
    rig.tgtY = ty.value; rig.tgtYVel = ty.velocity;
    const tz = stepSpring(rig.tgtZ, wp.target[2], rig.tgtZVel, dt, omegaN);
    rig.tgtZ = tz.value; rig.tgtZVel = tz.velocity;

    // Chapter 1: gentle microgravity floating oscillation
    // A slow sinusoidal Y offset (amplitude 0.03 m, period ~8 s).
    let oscillationY = 0;
    if (activeChapter === 1) {
      rig.oscillationPhase += dt * (2 * Math.PI / 8); // 8-second period
      oscillationY = 0.03 * Math.sin(rig.oscillationPhase);
    } else {
      // Damp phase back to 0 to avoid a jump when returning to ch1
      rig.oscillationPhase *= 0.95;
    }

    _tmpPos.set(rig.posX, rig.posY + oscillationY, rig.posZ);
    _tmpTarget.set(rig.tgtX, rig.tgtY, rig.tgtZ);

    // Slerp orientation (critically-damped approach to target quaternion)
    const slerpStep = stepSpring(rig.slerpT, 1.0, rig.slerpVel, dt, omegaN);
    rig.slerpT = Math.max(0, Math.min(1, slerpStep.value));
    rig.slerpVel = slerpStep.velocity;

    if (rig.slerpT < 0.9999) {
      _tmpQStart.set(
        rig.flightStartQuat[0],
        rig.flightStartQuat[1],
        rig.flightStartQuat[2],
        rig.flightStartQuat[3],
      );
      _tmpQEnd.set(
        rig.flightTargetQuat[0],
        rig.flightTargetQuat[1],
        rig.flightTargetQuat[2],
        rig.flightTargetQuat[3],
      );
      camera.quaternion.slerpQuaternions(_tmpQStart, _tmpQEnd, rig.slerpT).normalize();
    } else {
      // Fully converged: use live lookAt so the camera tracks target smoothly
      computeLookAtQuat(_tmpPos, _tmpTarget, camera.quaternion);
    }

    camera.position.copy(_tmpPos);
    camera.updateMatrixWorld();
  });

  return null;
}
