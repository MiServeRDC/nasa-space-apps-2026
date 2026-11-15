// Pass 1 InstancedMesh builders & zero-GC updaters for the 5 canonical `UBERON:` anatomical
// beacons and up to 10 Optical/Crew `InjuryMarker` 3D pins.
// Enforces Issue #11: unobserved regions (`observed === false`) NEVER render cyan (`#22d3ee`),
// strictly using neutral slate `#6b7280` (`UNOBSERVED_NO_RR`) or amber `#facc15` (`PROPAGATED_ONLY`).
// Uses only bare package runtime imports so Node `--experimental-strip-types` can test directly.

import * as THREE from 'three';
import type { AnatomicalRegionWireId, UberonCurie } from '../../types/telemetry';
import type { InjuryMarker, InjuryRegionId } from '../../types/injury';
import type { ProjectedAnatomicalNode } from '../../modules/body-3d-heatmap/uberonSpatialMapping';

export const UBERON_INSTANCE_COUNT = 5;
export const MAX_INJURY_PIN_INSTANCES = 10;

export const UBERON_REGIONS_ORDERED: readonly AnatomicalRegionWireId[] = [
  'EyeOcularSans',
  'InternalJugularVein',
  'HeartCardioAutonomic',
  'SoleusCalcaneus',
  'BrainVestibularCns',
] as const;

export const UBERON_CURIE_BY_REGION: Readonly<Record<AnatomicalRegionWireId, UberonCurie>> = {
  EyeOcularSans: 'UBERON:0000970',
  InternalJugularVein: 'UBERON:0001586',
  HeartCardioAutonomic: 'UBERON:0000948',
  SoleusCalcaneus: 'UBERON:0001389',
  BrainVestibularCns: 'UBERON:0000955',
};

export const DEFAULT_UBERON_WORLD_POSITIONS: Readonly<
  Record<AnatomicalRegionWireId, readonly [number, number, number]>
> = {
  EyeOcularSans: [0.0, 1.5524, 0.075],
  InternalJugularVein: [-0.06, 1.2884, 0.064],
  HeartCardioAutonomic: [0.0, 0.866, 0.042],
  SoleusCalcaneus: [0.0, -0.388, -0.013],
  BrainVestibularCns: [0.0, 1.658, -0.002],
};

const DEFAULT_INJURY_POSITIONS: Readonly<Record<InjuryRegionId, readonly [number, number, number]>> = {
  HEAD_FOREHEAD: [0, 1.64, 0.135],
  LEFT_SHOULDER: [-0.26, 1.15, 0.04],
  RIGHT_SHOULDER: [0.26, 1.15, 0.04],
  LEFT_FOREARM: [-0.36, 0.56, 0.06],
  RIGHT_FOREARM: [0.36, 0.56, 0.06],
  CHEST_RIBS: [-0.07, 1.0, 0.18],
  LEFT_KNEE: [-0.12, -0.22, 0.08],
  RIGHT_KNEE: [0.12, -0.22, 0.08],
  LEFT_ANKLE: [-0.12, -0.7, 0.07],
  RIGHT_ANKLE: [0.12, -0.7, 0.07],
};

// Module-scoped scratch math objects (`0` heap allocations inside `useFrame`).
const _scratchMatrix = new THREE.Matrix4();
const _scratchPos = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchScale = new THREE.Vector3();
const _scratchColor = new THREE.Color();

export const UBERON_BEACON_VERTEX_GLSL3 = /* glsl */ `
in float aObserved;
in float aHighlight;
in vec3 aNodeColor;

out vec3 vNormal;
out vec3 vViewDir;
out float vObserved;
out float vHighlight;
out vec3 vNodeColor;

void main() {
  #ifdef USE_INSTANCING
    vec4 localPos = instanceMatrix * vec4(position, 1.0);
    vec3 localNorm = mat3(instanceMatrix) * normal;
  #else
    vec4 localPos = vec4(position, 1.0);
    vec3 localNorm = normal;
  #endif

  vec4 mvPos = modelViewMatrix * localPos;
  vNormal = normalize(normalMatrix * localNorm);
  vViewDir = normalize(-mvPos.xyz);
  vObserved = aObserved;
  vHighlight = aHighlight;
  vNodeColor = aNodeColor;
  gl_Position = projectionMatrix * mvPos;
}
`;

export const UBERON_BEACON_FRAGMENT_GLSL3 = /* glsl */ `
uniform float uTime;

in vec3 vNormal;
in vec3 vViewDir;
in float vObserved;
in float vHighlight;
in vec3 vNodeColor;

layout(location = 0) out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float core = smoothstep(0.25, 0.92, ndv);
  float rim = pow(1.0 - ndv, 2.0);

  if (vObserved < 0.5) {
    // Issue #11 unobserved node: hollow stippled ring in #6b7280 / #facc15
    float stripe = step(0.35, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.18));
    float alpha = clamp((0.22 + rim * 0.52 + vHighlight * 0.22) * (0.45 + 0.55 * stripe), 0.0, 0.78);
    vec3 col = vNodeColor * (0.55 + 0.65 * rim + 0.35 * vHighlight);
    fragColor = vec4(col, alpha);
    return;
  }

  float pulse = 0.88 + 0.12 * sin(uTime * 3.4);
  vec3 emissive = vNodeColor * (0.62 * core + 1.15 * rim) * pulse + vec3(0.92, 0.98, 1.0) * (vHighlight * 0.32 * core);
  float alpha = clamp(0.68 + rim * 0.28 + vHighlight * 0.15, 0.0, 0.98);
  fragColor = vec4(emissive, alpha);
}
`;

/**
 * Explicitly rejects `UBERON:0001585` (submaxillary lymph node typo; IJV is `UBERON:0001586`)
 * and accepts strictly the 5 canonical ARES-Health CURIEs.
 */
export function isCanonicalStageUberonCurie(curie: string): curie is UberonCurie {
  if (curie === 'UBERON:0001585') return false;
  return (
    curie === 'UBERON:0000970' ||
    curie === 'UBERON:0001586' ||
    curie === 'UBERON:0000948' ||
    curie === 'UBERON:0001389' ||
    curie === 'UBERON:0000955'
  );
}

export function resolveRegionForInstanceId(
  instanceId: number | undefined | null,
): AnatomicalRegionWireId | null {
  if (typeof instanceId !== 'number' || !Number.isInteger(instanceId)) {
    return null;
  }
  return UBERON_REGIONS_ORDERED[instanceId] ?? null;
}

export function resolveInstanceIdForRegion(region: AnatomicalRegionWireId | null): number {
  if (!region) return -1;
  return UBERON_REGIONS_ORDERED.indexOf(region);
}

export interface UberonBeaconMeshOptions {
  depthTest?: boolean;
  renderOrder?: number;
}

export function createUberonBeaconMaterial(
  options: UberonBeaconMeshOptions = {},
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'ARESUberonInstancedPass1',
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: UBERON_BEACON_VERTEX_GLSL3,
    fragmentShader: UBERON_BEACON_FRAGMENT_GLSL3,
    transparent: true,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

/**
 * Creates the single-draw-call `THREE.InstancedMesh` (`count = 5`, default `renderOrder = 1`)
 * for the 5 canonical `UBERON:` anatomical anchors.
 */
export function createUberonInstancedMesh(
  baseRadius = 0.036,
  options: UberonBeaconMeshOptions = {},
): THREE.InstancedMesh {
  const geom = new THREE.IcosahedronGeometry(baseRadius, 2);
  const aObserved = new THREE.InstancedBufferAttribute(new Float32Array(UBERON_INSTANCE_COUNT), 1);
  const aHighlight = new THREE.InstancedBufferAttribute(new Float32Array(UBERON_INSTANCE_COUNT), 1);
  const aNodeColor = new THREE.InstancedBufferAttribute(
    new Float32Array(UBERON_INSTANCE_COUNT * 3),
    3,
  );

  // Initialize all 5 nodes in Issue #11 safe `UNOBSERVED_NO_RR` `#6b7280` slate
  _scratchColor.set('#6b7280');
  for (let i = 0; i < UBERON_INSTANCE_COUNT; i += 1) {
    aObserved.setX(i, 0);
    aHighlight.setX(i, 0);
    aNodeColor.setXYZ(i, _scratchColor.r, _scratchColor.g, _scratchColor.b);
  }

  geom.setAttribute('aObserved', aObserved);
  geom.setAttribute('aHighlight', aHighlight);
  geom.setAttribute('aNodeColor', aNodeColor);

  const mat = createUberonBeaconMaterial(options);
  const mesh = new THREE.InstancedMesh(geom, mat, UBERON_INSTANCE_COUNT);
  mesh.name = 'ARESUberonBeaconsInstanced';
  mesh.count = UBERON_INSTANCE_COUNT;
  mesh.renderOrder = options.renderOrder ?? 1;
  mesh.frustumCulled = false;

  _scratchQuat.identity();
  _scratchScale.set(1, 1, 1);

  for (let i = 0; i < UBERON_INSTANCE_COUNT; i += 1) {
    const region = UBERON_REGIONS_ORDERED[i];
    const pos = DEFAULT_UBERON_WORLD_POSITIONS[region];
    _scratchPos.set(pos[0], pos[1], pos[2]);
    _scratchMatrix.compose(_scratchPos, _scratchQuat, _scratchScale);
    mesh.setMatrixAt(i, _scratchMatrix);
    mesh.setColorAt(i, _scratchColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return mesh;
}

/**
 * Enforces Issue #11 color law before writing to GPU buffers:
 * Unobserved nodes NEVER receive `#22d3ee` nominal cyan.
 */
export function resolveSafeNodeHexColor(
  node: Pick<ProjectedAnatomicalNode, 'observed' | 'propagatedIntensity' | 'color'> | undefined,
): string {
  if (!node || !node.observed) {
    const prop = node ? node.propagatedIntensity : 0;
    return prop >= 0.05 ? '#facc15' : '#6b7280';
  }
  return node.color || '#22d3ee';
}

/**
 * Zero-GC in-place updater for the 5 `UBERON:` instances (`1` draw call).
 */
export function updateUberonInstancedMesh(
  mesh: THREE.InstancedMesh,
  nodesByRegion: Partial<Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>> | null | undefined,
  selectedRegion: AnatomicalRegionWireId | null,
  timeS: number,
  anchorOverrides?: Partial<Record<AnatomicalRegionWireId, readonly [number, number, number]>>,
): void {
  const geom = mesh.geometry;
  const aObserved = geom.getAttribute('aObserved') as THREE.InstancedBufferAttribute | undefined;
  const aHighlight = geom.getAttribute('aHighlight') as THREE.InstancedBufferAttribute | undefined;
  const aNodeColor = geom.getAttribute('aNodeColor') as THREE.InstancedBufferAttribute | undefined;

  if (mesh.material instanceof THREE.ShaderMaterial && mesh.material.uniforms.uTime) {
    mesh.material.uniforms.uTime.value = timeS;
  }

  _scratchQuat.identity();

  for (let i = 0; i < UBERON_INSTANCE_COUNT; i += 1) {
    const region = UBERON_REGIONS_ORDERED[i];
    const node = nodesByRegion?.[region];
    const pos =
      anchorOverrides?.[region] ??
      node?.worldPosition ??
      DEFAULT_UBERON_WORLD_POSITIONS[region];

    const isSelected = selectedRegion === region;
    const observed = node?.observed === true;
    const intensity = observed ? Math.max(0, Math.min(1, node?.localIntensity ?? 0)) : 0;

    const pulse = isSelected
      ? 1.08 + 0.06 * Math.sin(timeS * 5.0)
      : 0.92 + intensity * 0.28 + (observed ? 0.04 * Math.sin(timeS * 2.8 + i) : 0);

    _scratchPos.set(pos[0], pos[1], pos[2]);
    _scratchScale.set(pulse, pulse, pulse);
    _scratchMatrix.compose(_scratchPos, _scratchQuat, _scratchScale);
    mesh.setMatrixAt(i, _scratchMatrix);

    const safeHex = resolveSafeNodeHexColor(node);
    _scratchColor.set(safeHex);
    mesh.setColorAt(i, _scratchColor);

    if (aObserved) aObserved.setX(i, observed ? 1.0 : 0.0);
    if (aHighlight) aHighlight.setX(i, isSelected ? 1.0 : 0.0);
    if (aNodeColor) aNodeColor.setXYZ(i, _scratchColor.r, _scratchColor.g, _scratchColor.b);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (aObserved) aObserved.needsUpdate = true;
  if (aHighlight) aHighlight.needsUpdate = true;
  if (aNodeColor) aNodeColor.needsUpdate = true;
}

/**
 * Creates a single-draw-call `THREE.InstancedMesh` (`count = 5`) of pulsing equatorial
 * diagnostic target rings around the 5 canonical `UBERON:` regions so stressed/problematic
 * anatomical sites stand out unmistakably from 360 degrees as the body rotates.
 */
export function createUberonHaloRingsInstancedMesh(
  majorRadius = 0.088,
  tubeRadius = 0.0045,
  options: UberonBeaconMeshOptions = {},
): THREE.InstancedMesh {
  const geom = new THREE.TorusGeometry(majorRadius, tubeRadius, 8, 32);
  const aObserved = new THREE.InstancedBufferAttribute(new Float32Array(UBERON_INSTANCE_COUNT), 1);
  const aHighlight = new THREE.InstancedBufferAttribute(new Float32Array(UBERON_INSTANCE_COUNT), 1);
  const aNodeColor = new THREE.InstancedBufferAttribute(
    new Float32Array(UBERON_INSTANCE_COUNT * 3),
    3,
  );

  _scratchColor.set('#6b7280');
  for (let i = 0; i < UBERON_INSTANCE_COUNT; i += 1) {
    aObserved.setX(i, 0);
    aHighlight.setX(i, 0);
    aNodeColor.setXYZ(i, _scratchColor.r, _scratchColor.g, _scratchColor.b);
  }

  geom.setAttribute('aObserved', aObserved);
  geom.setAttribute('aHighlight', aHighlight);
  geom.setAttribute('aNodeColor', aNodeColor);

  const mat = createUberonBeaconMaterial({
    depthTest: options.depthTest ?? false,
    renderOrder: options.renderOrder ?? 15,
  });
  mat.name = 'ARESUberonHaloRingsPass15';
  mat.side = THREE.DoubleSide;

  const mesh = new THREE.InstancedMesh(geom, mat, UBERON_INSTANCE_COUNT);
  mesh.name = 'ARESUberonHaloRingsInstanced';
  mesh.count = UBERON_INSTANCE_COUNT;
  mesh.renderOrder = options.renderOrder ?? 15;
  mesh.frustumCulled = false;
  return mesh;
}

const _haloAxis = new THREE.Vector3(1, 0.25, 0).normalize();

export function updateUberonHaloRingsInstancedMesh(
  mesh: THREE.InstancedMesh,
  nodesByRegion: Partial<Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>> | null | undefined,
  selectedRegion: AnatomicalRegionWireId | null,
  timeS: number,
  anchorOverrides?: Partial<Record<AnatomicalRegionWireId, readonly [number, number, number]>>,
): void {
  const geom = mesh.geometry;
  const aObserved = geom.getAttribute('aObserved') as THREE.InstancedBufferAttribute | undefined;
  const aHighlight = geom.getAttribute('aHighlight') as THREE.InstancedBufferAttribute | undefined;
  const aNodeColor = geom.getAttribute('aNodeColor') as THREE.InstancedBufferAttribute | undefined;

  if (mesh.material instanceof THREE.ShaderMaterial && mesh.material.uniforms.uTime) {
    mesh.material.uniforms.uTime.value = timeS;
  }

  for (let i = 0; i < UBERON_INSTANCE_COUNT; i += 1) {
    const region = UBERON_REGIONS_ORDERED[i];
    const node = nodesByRegion?.[region];
    const pos =
      anchorOverrides?.[region] ??
      node?.worldPosition ??
      DEFAULT_UBERON_WORLD_POSITIONS[region];

    const isSelected = selectedRegion === region;
    const observed = node?.observed === true;
    const intensity = observed ? Math.max(0, Math.min(1, node?.localIntensity ?? 0)) : 0;
    const hasProblem = intensity >= 0.20;

    // Prominent pulsing radar halo on stressed (>= 20%) or selected regions; subtle fiducial ring otherwise
    const ringScale = isSelected
      ? 0.95 + 0.08 * Math.sin(timeS * 4.4)
      : hasProblem
        ? 0.92 + intensity * 0.55 + 0.12 * Math.sin(timeS * 3.6 + i * 1.1)
        : 0.42;

    _scratchQuat.setFromAxisAngle(_haloAxis, Math.PI * 0.36 + Math.sin(timeS * 1.2 + i) * 0.22);
    _scratchPos.set(pos[0], pos[1], pos[2]);
    _scratchScale.set(ringScale, ringScale, ringScale);
    _scratchMatrix.compose(_scratchPos, _scratchQuat, _scratchScale);
    mesh.setMatrixAt(i, _scratchMatrix);

    const safeHex = resolveSafeNodeHexColor(node);
    _scratchColor.set(safeHex);
    mesh.setColorAt(i, _scratchColor);

    if (aObserved) aObserved.setX(i, observed ? 1.0 : 0.0);
    if (aHighlight) aHighlight.setX(i, isSelected || hasProblem ? 1.0 : 0.0);
    if (aNodeColor) aNodeColor.setXYZ(i, _scratchColor.r, _scratchColor.g, _scratchColor.b);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (aObserved) aObserved.needsUpdate = true;
  if (aHighlight) aHighlight.needsUpdate = true;
  if (aNodeColor) aNodeColor.needsUpdate = true;
}

/**
 * Creates a single-draw-call `THREE.InstancedMesh` for up to `maxMarkers` (`10`)
 * `InjuryMarker` 3D anatomical trauma/lesion pins (`ILLUSTRATIVE_UNVALIDATED`).
 */
export function createInjuryPinsInstancedMesh(
  maxMarkers: number = MAX_INJURY_PIN_INSTANCES,
  options: UberonBeaconMeshOptions = {},
): THREE.InstancedMesh {
  const cap = Math.max(1, Math.floor(maxMarkers));
  const geom = new THREE.OctahedronGeometry(0.032, 1);
  const aObserved = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
  const aHighlight = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
  const aNodeColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);

  geom.setAttribute('aObserved', aObserved);
  geom.setAttribute('aHighlight', aHighlight);
  geom.setAttribute('aNodeColor', aNodeColor);

  const mat = createUberonBeaconMaterial(options);
  mat.name = 'ARESInjuryPinsInstancedPass1';

  const mesh = new THREE.InstancedMesh(geom, mat, cap);
  mesh.name = 'ARESInjuryPinsInstanced';
  mesh.count = 0;
  mesh.renderOrder = options.renderOrder ?? 2;
  mesh.frustumCulled = false;
  return mesh;
}

export function updateInjuryPinsInstancedMesh(
  mesh: THREE.InstancedMesh,
  markers: readonly InjuryMarker[],
  timeS: number,
  anchorOverrides?: Partial<Record<InjuryRegionId, readonly [number, number, number]>>,
): void {
  const maxCap = (mesh.geometry.getAttribute('aObserved') as THREE.InstancedBufferAttribute)?.count ?? 0;
  const activeCount = Math.min(markers.length, maxCap);
  mesh.count = activeCount;
  mesh.visible = activeCount > 0;

  if (activeCount === 0) return;

  const aNodeColor = mesh.geometry.getAttribute('aNodeColor') as
    | THREE.InstancedBufferAttribute
    | undefined;
  if (mesh.material instanceof THREE.ShaderMaterial && mesh.material.uniforms.uTime) {
    mesh.material.uniforms.uTime.value = timeS;
  }

  _scratchQuat.setFromAxisAngle(_scratchPos.set(0, 1, 0), timeS * 1.4);

  for (let i = 0; i < activeCount; i += 1) {
    const marker = markers[i];
    const pos = anchorOverrides?.[marker.region] ?? DEFAULT_INJURY_POSITIONS[marker.region] ?? [0, 1, 0.1];
    const severityHex =
      marker.severity === 'HIGH'
        ? '#f43f5e'
        : marker.severity === 'MODERATE'
          ? '#fb923c'
          : '#facc15';

    const scale = 1.0 + 0.14 * Math.sin(timeS * 4.2 + i);
    _scratchPos.set(pos[0], pos[1], pos[2]);
    _scratchScale.set(scale, scale, scale);
    _scratchMatrix.compose(_scratchPos, _scratchQuat, _scratchScale);
    mesh.setMatrixAt(i, _scratchMatrix);

    _scratchColor.set(severityHex);
    if (aNodeColor) {
      aNodeColor.setXYZ(i, _scratchColor.r, _scratchColor.g, _scratchColor.b);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (aNodeColor) aNodeColor.needsUpdate = true;
}
