// Pure spherical camera spring rig, critically-damped Quaternion Slerp, and optical frustum offset math (`UnifiedCameraController`).
// Implements:
// - Shortest-arc azimuthal delta (`Math.atan2(sin, cos)`) preventing 180-deg wraparound whips
// - Polar clamp `[0.08, Math.PI - 0.08]` preventing gimbal lock
// - `1.15x` radial apex clearance when `|deltaTheta| > Math.PI * 0.5` so camera never clips torso
// - Critically-damped `omega_n` (`zeta = 1.0`, zero overshoot) Quaternion `slerp` orientation progression
// - Optical frustum centering `setViewOffset` (`deltaX = -(W_L - W_R)/2`, `deltaY = -(H_T - H_B)/2`)
// - `prefers-reduced-motion` instant 1-frame snap
// Uses only bare package runtime imports (`three`) so Node `--experimental-strip-types` can test directly.

import * as THREE from 'three';
import type { AnatomicalRegionWireId } from '../types/telemetry';
import type { CameraSnapshot, StudioCameraPresetId } from '../types/workbench';

export const POLAR_MIN_RAD = 0.08;
export const POLAR_MAX_RAD = Math.PI - 0.08;
export const RADIUS_MIN_M = 0.45;
export const RADIUS_MAX_M = 6.5;

export interface CameraSpringParams {
  stiffness: number;
  damping: number;
  mass: number;
}

export const UNIFIED_CAMERA_SPRING_PARAMS: CameraSpringParams = {
  stiffness: 340.0,
  damping: 38.0,
  mass: 0.85,
};

export interface StageCameraPresetSpec {
  id: StudioCameraPresetId;
  label: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fovDeg: number;
}

export const STAGE_CAMERA_PRESETS: Readonly<Record<StudioCameraPresetId, StageCameraPresetSpec>> = {
  DEFAULT: {
    id: 'DEFAULT',
    label: 'Full Body Coronal Overview',
    position: [0, 0.50, 4.25],
    target: [0, 0.50, 0],
    fovDeg: 45,
  },
  IJV: {
    id: 'IJV',
    label: 'Internal Jugular Vein (IJV)',
    position: [-0.06, 1.30, 1.05],
    target: [-0.06, 1.29, 0.06],
    fovDeg: 35,
  },
  ONSD: {
    id: 'ONSD',
    label: 'Optic Nerve Sheath (SANS)',
    position: [0.04, 1.56, 0.95],
    target: [0.0, 1.55, 0.08],
    fovDeg: 30,
  },
  HEART: {
    id: 'HEART',
    label: 'Cardiac Autonomic & Baroreflex',
    position: [0.04, 0.88, 1.22],
    target: [0.0, 0.87, 0.04],
    fovDeg: 36,
  },
  FEMUR: {
    id: 'FEMUR',
    label: 'Femoral Cortical Mechanostat',
    position: [0.14, 0.14, 1.15],
    target: [0.14, 0.14, 0.05],
    fovDeg: 38,
  },
  SOLEUS: {
    id: 'SOLEUS',
    label: 'Soleus Myofiber & Calcaneus',
    position: [-0.12, -0.39, 1.08],
    target: [0.0, -0.39, -0.01],
    fovDeg: 35,
  },
  CALCANEUS: {
    id: 'CALCANEUS',
    label: 'Calcaneal Trabecular Load',
    position: [0.13, -0.71, 0.95],
    target: [0.13, -0.71, 0.05],
    fovDeg: 32,
  },
  BRAIN: {
    id: 'BRAIN',
    label: 'Cerebral & Vestibular CNS',
    position: [0.0, 1.66, 1.06],
    target: [0.0, 1.66, 0.0],
    fovDeg: 33,
  },
};

export function presetIdForUberonRegion(
  region: AnatomicalRegionWireId | null | undefined,
): StudioCameraPresetId {
  switch (region) {
    case 'EyeOcularSans':
      return 'ONSD';
    case 'InternalJugularVein':
      return 'IJV';
    case 'HeartCardioAutonomic':
      return 'HEART';
    case 'SoleusCalcaneus':
      return 'SOLEUS';
    case 'BrainVestibularCns':
      return 'BRAIN';
    default:
      return 'DEFAULT';
  }
}

export interface ViewportChromeInsets {
  leftPx: number;
  rightPx: number;
  topPx: number;
  bottomPx: number;
}

export interface OpticalViewOffset {
  fullWidth: number;
  fullHeight: number;
  offsetX: number;
  offsetY: number;
}

export interface CameraRigDynamicState {
  azimuthRad: number;
  azimuthVel: number;
  polarRad: number;
  polarVel: number;
  radiusM: number;
  radiusVel: number;
  target: [number, number, number];
  targetVel: [number, number, number];
  fovDeg: number;
  fovVel: number;
  offsetX: number;
  offsetXVel: number;
  offsetY: number;
  offsetYVel: number;
  flightStartRadiusM: number;
  flightInitialAbsDeltaTheta: number;
  orientation: [number, number, number, number];
  flightStartQuat: [number, number, number, number];
  flightTargetQuat: [number, number, number, number];
  slerpProgress: number;
  slerpVelocity: number;
  inFlight: boolean;
}

const _tmpOffsetVec = new THREE.Vector3();
const _tmpSpherical = new THREE.Spherical();
const _tmpEyeVec = new THREE.Vector3();
const _tmpTargetVec = new THREE.Vector3();
const _tmpUpVec = new THREE.Vector3(0, 1, 0);
const _tmpLookMatrix = new THREE.Matrix4();
const _tmpQuatA = new THREE.Quaternion();
const _tmpQuatB = new THREE.Quaternion();
const _tmpQuatOut = new THREE.Quaternion();
const _tmpStartPos: [number, number, number] = [0, 0, 0];
const _tmpGoalPos: [number, number, number] = [0, 0, 0];

/**
 * Shortest signed angular delta in `(-PI, +PI]` using `atan2(sin(d), cos(d))`.
 */
export function shortestAzimuthDelta(currentTheta: number, targetTheta: number): number {
  const diff = targetTheta - currentTheta;
  return Math.atan2(Math.sin(diff), Math.cos(diff));
}

export function clampPolarPhi(phi: number): number {
  if (!Number.isFinite(phi)) return Math.PI * 0.5;
  return Math.max(POLAR_MIN_RAD, Math.min(POLAR_MAX_RAD, phi));
}

export function clampRadius(radiusM: number): number {
  if (!Number.isFinite(radiusM)) return 3.3;
  return Math.max(RADIUS_MIN_M, Math.min(RADIUS_MAX_M, radiusM));
}

/**
 * Computes mid-flight radial clearance so wide azimuthal slews (`|deltaTheta| > PI/2`)
 * arch cleanly around the torso (`1.15x` max radius at mid-flight `progress = 0.5`)
 * instead of slicing through the ribcage.
 */
export function computeApexClearanceRadius(
  rStart: number,
  rTarget: number,
  absDeltaTheta: number,
  flightProgress01: number,
): number {
  const p = Math.max(0, Math.min(1, flightProgress01));
  const linearR = rStart + (rTarget - rStart) * p;
  if (absDeltaTheta <= Math.PI * 0.5) {
    return clampRadius(linearR);
  }
  const peakR = Math.max(rStart, rTarget) * 1.15;
  const midLinear = (rStart + rTarget) * 0.5;
  const boost = Math.max(0, peakR - midLinear);
  return clampRadius(linearR + boost * Math.sin(Math.PI * p));
}

/**
 * Computes Three.js `PerspectiveCamera.setViewOffset` shifts so the 3D Digital Twin
 * centers optically inside the unobstructed Bento aperture without shrinking `<Canvas>`.
 */
export function computeOpticalViewOffset(
  fullWidth: number,
  fullHeight: number,
  insets: ViewportChromeInsets,
): OpticalViewOffset {
  const safeW = Math.max(1, fullWidth);
  const safeH = Math.max(1, fullHeight);
  const offsetX = -(insets.leftPx - insets.rightPx) * 0.5;
  const offsetY = -(insets.topPx - insets.bottomPx) * 0.5;
  return {
    fullWidth: safeW,
    fullHeight: safeH,
    offsetX,
    offsetY,
  };
}

export function cartesianToSphericalSnapshot(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fovDeg = 45,
): CameraSnapshot {
  _tmpOffsetVec.set(
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  );
  if (_tmpOffsetVec.lengthSq() < 1e-8) {
    _tmpOffsetVec.set(0, 0, 1);
  }
  _tmpSpherical.setFromVector3(_tmpOffsetVec);
  return {
    azimuthRad: _tmpSpherical.theta,
    polarRad: clampPolarPhi(_tmpSpherical.phi),
    radiusM: clampRadius(_tmpSpherical.radius),
    target: [target[0], target[1], target[2]],
    fovDeg,
  };
}

export function presetToCameraSnapshot(presetId: StudioCameraPresetId): CameraSnapshot {
  const spec = STAGE_CAMERA_PRESETS[presetId] ?? STAGE_CAMERA_PRESETS.DEFAULT;
  return cartesianToSphericalSnapshot(spec.position, spec.target, spec.fovDeg);
}

export function sphericalSnapshotToCartesian(
  snapshot: CameraSnapshot,
  outPosition: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  _tmpSpherical.set(
    clampRadius(snapshot.radiusM),
    clampPolarPhi(snapshot.polarRad),
    snapshot.azimuthRad,
  );
  _tmpOffsetVec.setFromSpherical(_tmpSpherical);
  outPosition[0] = snapshot.target[0] + _tmpOffsetVec.x;
  outPosition[1] = snapshot.target[1] + _tmpOffsetVec.y;
  outPosition[2] = snapshot.target[2] + _tmpOffsetVec.z;
  return outPosition;
}

export function computeOmegaN(
  params: CameraSpringParams = UNIFIED_CAMERA_SPRING_PARAMS,
): number {
  const safeStiffness = Math.max(1, params.stiffness);
  const safeMass = Math.max(0.05, params.mass);
  return Math.sqrt(safeStiffness / safeMass);
}

/**
 * Computes Three.js camera `lookAt` orientation quaternion (`-Z` forward toward target, `+Y` up)
 * using zero-allocation module scratch objects.
 */
export function computeLookAtQuaternion(
  eyePos: readonly [number, number, number],
  targetPos: readonly [number, number, number],
  outQuat: [number, number, number, number] = [0, 0, 0, 1],
): [number, number, number, number] {
  _tmpEyeVec.set(eyePos[0], eyePos[1], eyePos[2]);
  _tmpTargetVec.set(targetPos[0], targetPos[1], targetPos[2]);
  _tmpOffsetVec.subVectors(_tmpEyeVec, _tmpTargetVec);
  if (_tmpOffsetVec.lengthSq() < 1e-10) {
    _tmpEyeVec.set(targetPos[0], targetPos[1], targetPos[2] + 1);
  }
  _tmpLookMatrix.lookAt(_tmpEyeVec, _tmpTargetVec, _tmpUpVec);
  _tmpQuatOut.setFromRotationMatrix(_tmpLookMatrix).normalize();
  outQuat[0] = _tmpQuatOut.x;
  outQuat[1] = _tmpQuatOut.y;
  outQuat[2] = _tmpQuatOut.z;
  outQuat[3] = _tmpQuatOut.w;
  return outQuat;
}

export function createInitialCameraRigState(
  initialSnapshot: CameraSnapshot = presetToCameraSnapshot('DEFAULT'),
): CameraRigDynamicState {
  const initPos = sphericalSnapshotToCartesian(initialSnapshot, [0, 0, 0]);
  const initQuat = computeLookAtQuaternion(initPos, initialSnapshot.target, [0, 0, 0, 1]);
  return {
    azimuthRad: initialSnapshot.azimuthRad,
    azimuthVel: 0,
    polarRad: clampPolarPhi(initialSnapshot.polarRad),
    polarVel: 0,
    radiusM: clampRadius(initialSnapshot.radiusM),
    radiusVel: 0,
    target: [...initialSnapshot.target],
    targetVel: [0, 0, 0],
    fovDeg: initialSnapshot.fovDeg,
    fovVel: 0,
    offsetX: 0,
    offsetXVel: 0,
    offsetY: 0,
    offsetYVel: 0,
    flightStartRadiusM: clampRadius(initialSnapshot.radiusM),
    flightInitialAbsDeltaTheta: 0,
    orientation: [...initQuat],
    flightStartQuat: [...initQuat],
    flightTargetQuat: [...initQuat],
    slerpProgress: 1,
    slerpVelocity: 0,
    inFlight: false,
  };
}

export function beginCameraFlight(
  state: CameraRigDynamicState,
  nextTarget: CameraSnapshot,
): void {
  const dTheta = Math.abs(shortestAzimuthDelta(state.azimuthRad, nextTarget.azimuthRad));
  state.flightStartRadiusM = state.radiusM;
  state.flightInitialAbsDeltaTheta = dTheta;
  sphericalSnapshotToCartesian(
    {
      azimuthRad: state.azimuthRad,
      polarRad: state.polarRad,
      radiusM: state.radiusM,
      target: state.target,
      fovDeg: state.fovDeg,
    },
    _tmpStartPos,
  );
  computeLookAtQuaternion(_tmpStartPos, state.target, state.flightStartQuat);
  state.orientation[0] = state.flightStartQuat[0];
  state.orientation[1] = state.flightStartQuat[1];
  state.orientation[2] = state.flightStartQuat[2];
  state.orientation[3] = state.flightStartQuat[3];

  sphericalSnapshotToCartesian(nextTarget, _tmpGoalPos);
  computeLookAtQuaternion(_tmpGoalPos, nextTarget.target, state.flightTargetQuat);

  state.slerpProgress = 0;
  state.slerpVelocity = 0;
  state.inFlight = true;
}

export function abortCameraFlightInPlace(state: CameraRigDynamicState): void {
  state.inFlight = false;
  state.azimuthVel = 0;
  state.polarVel = 0;
  state.radiusVel = 0;
  state.targetVel[0] = 0;
  state.targetVel[1] = 0;
  state.targetVel[2] = 0;
  state.fovVel = 0;
  state.slerpVelocity = 0;
}

/**
 * Closed-form critically-damped scalar integrator (`zeta = 1.0`, zero overshoot)
 * governed by natural frequency `omegaN = sqrt(stiffness / mass)`.
 */
export function stepCriticallyDampedScalar(
  current: number,
  target: number,
  velocity: number,
  dt: number,
  omegaN: number,
): { value: number; velocity: number; settled: boolean } {
  const err = current - target;
  const term = velocity + omegaN * err;
  const exp = Math.exp(-omegaN * dt);
  const nextVal = target + (err + term * dt) * exp;
  const nextVel = (velocity - term * omegaN * dt) * exp;
  if (Math.abs(nextVal - target) < 1e-4 && Math.abs(nextVel) < 1e-4) {
    return { value: target, velocity: 0, settled: true };
  }
  return { value: nextVal, velocity: nextVel, settled: false };
}

/**
 * Advances both spherical camera flight + critically-damped Quaternion `Slerp` (`zeta = 1.0`)
 * and optical frustum view-offset springs in-place with zero heap allocations.
 */
export function stepCameraRigFrame(
  state: CameraRigDynamicState,
  targetSnapshot: CameraSnapshot,
  targetOffsetX: number,
  targetOffsetY: number,
  rawDtSec: number,
  prefersReducedMotion: boolean,
  params: CameraSpringParams = UNIFIED_CAMERA_SPRING_PARAMS,
): void {
  const dt = Math.min(Math.max(Number.isFinite(rawDtSec) ? rawDtSec : 0.016, 0.001), 0.05);
  const omegaN = computeOmegaN(params);

  if (prefersReducedMotion) {
    if (state.inFlight) {
      state.azimuthRad = targetSnapshot.azimuthRad;
      state.polarRad = clampPolarPhi(targetSnapshot.polarRad);
      state.radiusM = clampRadius(targetSnapshot.radiusM);
      state.target[0] = targetSnapshot.target[0];
      state.target[1] = targetSnapshot.target[1];
      state.target[2] = targetSnapshot.target[2];
      state.fovDeg = targetSnapshot.fovDeg;
      sphericalSnapshotToCartesian(targetSnapshot, _tmpGoalPos);
      computeLookAtQuaternion(_tmpGoalPos, targetSnapshot.target, state.flightTargetQuat);
      state.orientation[0] = state.flightTargetQuat[0];
      state.orientation[1] = state.flightTargetQuat[1];
      state.orientation[2] = state.flightTargetQuat[2];
      state.orientation[3] = state.flightTargetQuat[3];
      state.slerpProgress = 1;
      abortCameraFlightInPlace(state);
    }
    state.offsetX = targetOffsetX;
    state.offsetXVel = 0;
    state.offsetY = targetOffsetY;
    state.offsetYVel = 0;
    return;
  }

  // Always smooth frustum optical center offset even during manual OrbitControls drag
  const ox = stepCriticallyDampedScalar(state.offsetX, targetOffsetX, state.offsetXVel, dt, omegaN);
  state.offsetX = ox.value;
  state.offsetXVel = ox.velocity;

  const oy = stepCriticallyDampedScalar(state.offsetY, targetOffsetY, state.offsetYVel, dt, omegaN);
  state.offsetY = oy.value;
  state.offsetYVel = oy.velocity;

  if (!state.inFlight) {
    return;
  }

  // Shortest-arc unwrapped azimuth target
  const deltaTheta = shortestAzimuthDelta(state.azimuthRad, targetSnapshot.azimuthRad);
  const continuousThetaTarget = state.azimuthRad + deltaTheta;
  const az = stepCriticallyDampedScalar(
    state.azimuthRad,
    continuousThetaTarget,
    state.azimuthVel,
    dt,
    omegaN,
  );
  // Normalize back into (-PI, +PI]
  state.azimuthRad = Math.atan2(Math.sin(az.value), Math.cos(az.value));
  state.azimuthVel = az.velocity;

  const clampedTargetPhi = clampPolarPhi(targetSnapshot.polarRad);
  const pol = stepCriticallyDampedScalar(state.polarRad, clampedTargetPhi, state.polarVel, dt, omegaN);
  state.polarRad = clampPolarPhi(pol.value);
  state.polarVel = pol.velocity;

  const remainingTheta = Math.abs(shortestAzimuthDelta(state.azimuthRad, targetSnapshot.azimuthRad));
  const progress =
    state.flightInitialAbsDeltaTheta > 1e-3
      ? 1.0 - Math.min(1.0, remainingTheta / state.flightInitialAbsDeltaTheta)
      : 1.0;
  const clearanceTargetR = computeApexClearanceRadius(
    state.flightStartRadiusM,
    clampRadius(targetSnapshot.radiusM),
    state.flightInitialAbsDeltaTheta,
    progress,
  );

  const rad = stepCriticallyDampedScalar(state.radiusM, clearanceTargetR, state.radiusVel, dt, omegaN);
  state.radiusM = clampRadius(rad.value);
  state.radiusVel = rad.velocity;

  const tx = stepCriticallyDampedScalar(state.target[0], targetSnapshot.target[0], state.targetVel[0], dt, omegaN);
  const ty = stepCriticallyDampedScalar(state.target[1], targetSnapshot.target[1], state.targetVel[1], dt, omegaN);
  const tz = stepCriticallyDampedScalar(state.target[2], targetSnapshot.target[2], state.targetVel[2], dt, omegaN);
  state.target[0] = tx.value;
  state.targetVel[0] = tx.velocity;
  state.target[1] = ty.value;
  state.targetVel[1] = ty.velocity;
  state.target[2] = tz.value;
  state.targetVel[2] = tz.velocity;

  const fv = stepCriticallyDampedScalar(state.fovDeg, targetSnapshot.fovDeg, state.fovVel, dt, omegaN);
  state.fovDeg = fv.value;
  state.fovVel = fv.velocity;

  // Synchronize target lookAt quaternion & critically-damped Slerp progress (`zeta = 1.0`, zero overshoot)
  sphericalSnapshotToCartesian(targetSnapshot, _tmpGoalPos);
  computeLookAtQuaternion(_tmpGoalPos, targetSnapshot.target, state.flightTargetQuat);

  const slerpStep = stepCriticallyDampedScalar(state.slerpProgress, 1.0, state.slerpVelocity, dt, omegaN);
  state.slerpProgress = Math.max(0, Math.min(1, slerpStep.value));
  state.slerpVelocity = slerpStep.velocity;

  _tmpQuatA.set(
    state.flightStartQuat[0],
    state.flightStartQuat[1],
    state.flightStartQuat[2],
    state.flightStartQuat[3],
  );
  _tmpQuatB.set(
    state.flightTargetQuat[0],
    state.flightTargetQuat[1],
    state.flightTargetQuat[2],
    state.flightTargetQuat[3],
  );
  _tmpQuatOut.slerpQuaternions(_tmpQuatA, _tmpQuatB, state.slerpProgress).normalize();
  state.orientation[0] = _tmpQuatOut.x;
  state.orientation[1] = _tmpQuatOut.y;
  state.orientation[2] = _tmpQuatOut.z;
  state.orientation[3] = _tmpQuatOut.w;

  const radiusSettled = Math.abs(state.radiusM - clampRadius(targetSnapshot.radiusM)) < 1e-3;
  if (
    az.settled &&
    pol.settled &&
    rad.settled &&
    radiusSettled &&
    tx.settled &&
    ty.settled &&
    tz.settled &&
    fv.settled &&
    slerpStep.settled
  ) {
    state.azimuthRad = targetSnapshot.azimuthRad;
    state.polarRad = clampedTargetPhi;
    state.radiusM = clampRadius(targetSnapshot.radiusM);
    state.slerpProgress = 1;
    state.orientation[0] = state.flightTargetQuat[0];
    state.orientation[1] = state.flightTargetQuat[1];
    state.orientation[2] = state.flightTargetQuat[2];
    state.orientation[3] = state.flightTargetQuat[3];
    abortCameraFlightInPlace(state);
  }
}
