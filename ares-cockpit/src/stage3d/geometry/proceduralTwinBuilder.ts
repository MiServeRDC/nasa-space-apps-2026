// Air-gapped procedural Dual-Gender anatomical silhouette & Pass 0 internal organ core builder.
// Enforces NotebookLM Risk 2: strict vertex/normal/index topology parity assertion
// (`assertMorphTopologyMatch`) before computing `morphTarget0` and `morphNormal0`, followed
// by `.toNonIndexed()` expansion and `aBarycentric` 1px anti-aliased wireframe baking.
// Uses only bare package runtime imports so Node `--experimental-strip-types` can test directly.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnatomicalRegionWireId } from '../../types/telemetry';

export interface LoftSlice {
  y: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  /** Optional anterior thoracic/facial contour offset along +Z for sin(theta) > 0. */
  anteriorBulgeZ?: number;
}

export interface ProceduralTwinGeometryBundle {
  geometry: THREE.BufferGeometry;
  vertexCount: number;
  triangleCount: number;
}

/** Region code stored in `aRegionIndex` for per-region Issue #11 `aObserved` updates. */
export const REGION_INDEX_BY_WIRE_ID: Record<AnatomicalRegionWireId, number> = {
  EyeOcularSans: 0,
  InternalJugularVein: 1,
  HeartCardioAutonomic: 2,
  SoleusCalcaneus: 3,
  BrainVestibularCns: 4,
};

function classifyWorldYToRegionIndex(x: number, y: number, z: number): number {
  if (y >= 1.59) {
    return REGION_INDEX_BY_WIRE_ID.BrainVestibularCns;
  }
  if (y >= 1.47 && z >= 0.01) {
    return REGION_INDEX_BY_WIRE_ID.EyeOcularSans;
  }
  if (y >= 1.18 && y < 1.59) {
    return REGION_INDEX_BY_WIRE_ID.InternalJugularVein;
  }
  if (y < 0.18 && Math.abs(x) < 0.28) {
    return REGION_INDEX_BY_WIRE_ID.SoleusCalcaneus;
  }
  return REGION_INDEX_BY_WIRE_ID.HeartCardioAutonomic;
}

/**
 * Builds a deterministic closed lofted anatomical segment from ordered cross-section slices.
 * Produces identical vertex, normal, uv, and index counts for identical `(slices.length, radialSegments)`.
 */
function buildLoftedSegment(slices: readonly LoftSlice[], radialSegments: number): THREE.BufferGeometry {
  const ringCount = slices.length;
  const cols = radialSegments + 1;
  const vertexCount = ringCount * cols;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  for (let r = 0; r < ringCount; r += 1) {
    const s = slices[r];
    const vCoord = ringCount > 1 ? r / (ringCount - 1) : 0;
    const bulge = s.anteriorBulgeZ ?? 0;

    for (let c = 0; c <= radialSegments; c += 1) {
      const uCoord = c / radialSegments;
      const theta = uCoord * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Anterior half (sinT > 0 -> +Z) receives optional anatomical contour offset
      const anteriorFactor = sinT > 0 ? sinT * sinT : 0;
      const px = s.cx + s.rx * cosT;
      const py = s.y;
      const pz = s.cz + s.rz * sinT + bulge * anteriorFactor;

      const idx = r * cols + c;
      positions[idx * 3] = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;

      uvs[idx * 2] = uCoord;
      uvs[idx * 2 + 1] = vCoord;
    }
  }

  const quadCount = (ringCount - 1) * radialSegments;
  const indices = new Uint32Array(quadCount * 6);
  let ptr = 0;

  for (let r = 0; r < ringCount - 1; r += 1) {
    for (let c = 0; c < radialSegments; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;

      indices[ptr++] = a;
      indices[ptr++] = b;
      indices[ptr++] = d;

      indices[ptr++] = b;
      indices[ptr++] = e;
      indices[ptr++] = d;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

function buildTrunkHeadSlices(female: boolean): LoftSlice[] {
  const f = female ? 1 : 0;
  const mix = (maleVal: number, femaleVal: number): number => maleVal + (femaleVal - maleVal) * f;

  return [
    // Inferior pelvic floor cap
    { y: 0.19, cx: 0, cz: 0.0, rx: 0.008, rz: 0.008 },
    // Lower pelvis / ischial tuberosity
    { y: 0.23, cx: 0, cz: 0.004, rx: mix(0.138, 0.162), rz: mix(0.098, 0.106) },
    // Greater trochanter / gynecoid vs android iliac crest
    { y: 0.34, cx: 0, cz: 0.008, rx: mix(0.166, 0.194), rz: mix(0.112, 0.118) },
    // Iliac crest / lower abdomen
    { y: 0.45, cx: 0, cz: 0.012, rx: mix(0.162, 0.176), rz: mix(0.108, 0.104) },
    // Natural waist (umbilicus / L3)
    { y: 0.58, cx: 0, cz: 0.014, rx: mix(0.152, 0.131), rz: mix(0.104, 0.094) },
    // Lower costal margin
    { y: 0.74, cx: 0, cz: 0.018, rx: mix(0.168, 0.146), rz: mix(0.116, 0.104) },
    // Mid-thorax / xiphoid / cardiac plane (`HeartCardioAutonomic` y ~ 0.866)
    {
      y: 0.88,
      cx: 0,
      cz: 0.022,
      rx: mix(0.186, 0.158),
      rz: mix(0.126, 0.114),
      anteriorBulgeZ: mix(0.006, 0.032),
    },
    // Pectoral / mammary contour
    {
      y: 1.00,
      cx: 0,
      cz: 0.022,
      rx: mix(0.204, 0.168),
      rz: mix(0.132, 0.118),
      anteriorBulgeZ: mix(0.010, 0.038),
    },
    // Upper thorax / infraclavicular
    { y: 1.12, cx: 0, cz: 0.014, rx: mix(0.226, 0.190), rz: mix(0.122, 0.106) },
    // Clavicular / acromial shoulder girdle
    { y: 1.20, cx: 0, cz: 0.006, rx: mix(0.214, 0.178), rz: mix(0.098, 0.086) },
    // Base of cervical neck (`InternalJugularVein` y ~ 1.288)
    { y: 1.26, cx: 0, cz: 0.010, rx: mix(0.072, 0.060), rz: mix(0.068, 0.058) },
    // Mid-cervical neck
    { y: 1.35, cx: 0, cz: 0.014, rx: mix(0.062, 0.053), rz: mix(0.062, 0.054) },
    // Submandibular / C2
    { y: 1.43, cx: 0, cz: 0.018, rx: mix(0.066, 0.058), rz: mix(0.072, 0.066) },
    // Mandible / lower facial contour
    {
      y: 1.50,
      cx: 0,
      cz: 0.016,
      rx: mix(0.078, 0.073),
      rz: mix(0.094, 0.090),
      anteriorBulgeZ: 0.014,
    },
    // Orbital / SANS ocular plane (`EyeOcularSans` y ~ 1.552)
    {
      y: 1.56,
      cx: 0,
      cz: 0.010,
      rx: mix(0.084, 0.080),
      rz: mix(0.102, 0.098),
      anteriorBulgeZ: 0.010,
    },
    // Frontal bone / neurocranium (`BrainVestibularCns` y ~ 1.658)
    { y: 1.65, cx: 0, cz: 0.002, rx: mix(0.086, 0.083), rz: mix(0.104, 0.100) },
    // Parietal dome
    { y: 1.71, cx: 0, cz: -0.004, rx: mix(0.058, 0.056), rz: mix(0.070, 0.068) },
    // Cranial vertex cap
    { y: 1.74, cx: 0, cz: -0.006, rx: 0.006, rz: 0.006 },
  ];
}

function buildUpperLimbSlices(sideSign: -1 | 1, female: boolean): LoftSlice[] {
  const f = female ? 1 : 0;
  const mix = (maleVal: number, femaleVal: number): number => maleVal + (femaleVal - maleVal) * f;
  const s = sideSign;

  return [
    // Humeral head cap inside shoulder girdle
    { y: 1.19, cx: s * mix(0.205, 0.175), cz: 0.008, rx: 0.008, rz: 0.008 },
    // Deltoid prominence (`SHOULDER` injury anchor ~ [+-0.26, 1.15, 0.04])
    { y: 1.14, cx: s * mix(0.246, 0.212), cz: 0.014, rx: mix(0.064, 0.052), rz: mix(0.062, 0.050) },
    // Mid-brachium (biceps/triceps)
    { y: 0.96, cx: s * mix(0.285, 0.252), cz: 0.016, rx: mix(0.054, 0.043), rz: mix(0.052, 0.042) },
    // Cubital / elbow joint
    { y: 0.78, cx: s * mix(0.320, 0.292), cz: 0.026, rx: mix(0.046, 0.038), rz: mix(0.044, 0.037) },
    // Proximal forearm (`FOREARM` injury anchor ~ [+-0.36, 0.56, 0.06])
    { y: 0.58, cx: s * mix(0.356, 0.334), cz: 0.052, rx: mix(0.043, 0.035), rz: mix(0.040, 0.033) },
    // Distal wrist
    { y: 0.39, cx: s * mix(0.382, 0.364), cz: 0.074, rx: mix(0.031, 0.026), rz: mix(0.024, 0.020) },
    // Metacarpal / palm
    { y: 0.30, cx: s * mix(0.392, 0.374), cz: 0.084, rx: mix(0.036, 0.030), rz: mix(0.018, 0.015) },
    // Digital tip cap
    { y: 0.22, cx: s * mix(0.396, 0.378), cz: 0.090, rx: 0.006, rz: 0.005 },
  ];
}

function buildLowerLimbSlices(sideSign: -1 | 1, female: boolean): LoftSlice[] {
  const f = female ? 1 : 0;
  const mix = (maleVal: number, femaleVal: number): number => maleVal + (femaleVal - maleVal) * f;
  const s = sideSign;

  // Female Q-angle: wider proximal acetabular origin converging toward patella
  return [
    // Acetabular / femoral head cap
    { y: 0.27, cx: s * mix(0.104, 0.124), cz: 0.006, rx: 0.010, rz: 0.010 },
    // Proximal thigh
    { y: 0.20, cx: s * mix(0.110, 0.128), cz: 0.012, rx: mix(0.084, 0.088), rz: mix(0.086, 0.090) },
    // Mid-femoral shaft (`FEMUR` preset y ~ 0.14)
    { y: 0.02, cx: s * mix(0.116, 0.122), cz: 0.022, rx: mix(0.074, 0.072), rz: mix(0.076, 0.074) },
    // Patellar / knee joint (`KNEE` injury anchor ~ [+-0.12, -0.22, 0.08])
    { y: -0.22, cx: s * mix(0.120, 0.116), cz: 0.030, rx: mix(0.058, 0.053), rz: mix(0.060, 0.055) },
    // Gastrocnemius / soleus calf belly (`SoleusCalcaneus` y ~ -0.388)
    { y: -0.40, cx: s * mix(0.120, 0.116), cz: -0.006, rx: mix(0.056, 0.050), rz: mix(0.060, 0.054) },
    // Distal Achilles / lower leg
    { y: -0.58, cx: s * mix(0.120, 0.116), cz: 0.006, rx: mix(0.040, 0.035), rz: mix(0.043, 0.038) },
    // Malleolar ankle (`ANKLE` injury anchor ~ [+-0.12, -0.70, 0.07])
    { y: -0.70, cx: s * mix(0.120, 0.116), cz: 0.022, rx: mix(0.038, 0.034), rz: mix(0.046, 0.042) },
    // Calcaneus / plantar arch (`CALCANEUS` y ~ -0.71..-0.78)
    {
      y: -0.78,
      cx: s * mix(0.122, 0.118),
      cz: 0.056,
      rx: mix(0.044, 0.039),
      rz: mix(0.086, 0.078),
      anteriorBulgeZ: 0.024,
    },
    // Plantar sole cap
    { y: -0.80, cx: s * mix(0.122, 0.118), cz: 0.064, rx: 0.008, rz: 0.012 },
  ];
}

/**
 * Builds the indexed Male or Female silhouette prior to morph baking.
 * Exported for unit-testing `assertMorphTopologyMatch` directly.
 */
export function buildIndexedSexSilhouette(
  female: boolean,
  radialSegments = 24,
): THREE.BufferGeometry {
  const limbRadial = Math.max(12, Math.floor(radialSegments * 0.75));
  const parts = [
    buildLoftedSegment(buildTrunkHeadSlices(female), radialSegments),
    buildLoftedSegment(buildUpperLimbSlices(-1, female), limbRadial),
    buildLoftedSegment(buildUpperLimbSlices(1, female), limbRadial),
    buildLoftedSegment(buildLowerLimbSlices(-1, female), limbRadial),
    buildLoftedSegment(buildLowerLimbSlices(1, female), limbRadial),
  ];

  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i += 1) {
    parts[i].dispose();
  }
  if (!merged) {
    throw new RangeError('Failed to merge procedural anatomical silhouette segments.');
  }
  merged.computeVertexNormals();
  return merged;
}

/**
 * NotebookLM Risk 2 Guard:
 * Strictly verifies 1:1 vertex count, normal count, itemSize, and index buffer topology parity
 * between base (`MALE`) and morph target (`FEMALE`) geometries before computing deltas.
 * Throws `RangeError` immediately if any topology discrepancy exists.
 */
export function assertMorphTopologyMatch(
  baseGeom: THREE.BufferGeometry,
  targetGeom: THREE.BufferGeometry,
  label = 'DualGenderProceduralTwin',
): void {
  const basePos = baseGeom.getAttribute('position');
  const targetPos = targetGeom.getAttribute('position');
  if (!basePos || !targetPos) {
    throw new RangeError(`[${label}] Missing position attribute on morph pair.`);
  }
  if (basePos.count !== targetPos.count || basePos.itemSize !== targetPos.itemSize) {
    throw new RangeError(
      `[${label}] Morph position topology mismatch: base=${basePos.count}x${basePos.itemSize}, target=${targetPos.count}x${targetPos.itemSize}.`,
    );
  }

  const baseNorm = baseGeom.getAttribute('normal');
  const targetNorm = targetGeom.getAttribute('normal');
  if (!baseNorm || !targetNorm) {
    throw new RangeError(`[${label}] Missing normal attribute on morph pair.`);
  }
  if (baseNorm.count !== targetNorm.count || baseNorm.itemSize !== targetNorm.itemSize) {
    throw new RangeError(
      `[${label}] Morph normal topology mismatch: base=${baseNorm.count}x${baseNorm.itemSize}, target=${targetNorm.count}x${targetNorm.itemSize}.`,
    );
  }

  const baseIdx = baseGeom.getIndex();
  const targetIdx = targetGeom.getIndex();
  if (Boolean(baseIdx) !== Boolean(targetIdx)) {
    throw new RangeError(`[${label}] Morph index presence mismatch between base and target.`);
  }
  if (baseIdx && targetIdx) {
    if (baseIdx.count !== targetIdx.count) {
      throw new RangeError(
        `[${label}] Morph index count mismatch: base=${baseIdx.count}, target=${targetIdx.count}.`,
      );
    }
    const a = baseIdx.array;
    const b = targetIdx.array;
    for (let i = 0; i < baseIdx.count; i += 1) {
      if (a[i] !== b[i]) {
        throw new RangeError(
          `[${label}] Morph triangle index mismatch at slot ${i}: base=${a[i]}, target=${b[i]}.`,
        );
      }
    }
  }
}

/**
 * Bakes `[1,0,0], [0,1,0], [0,0,1]` barycentric coordinates onto a non-indexed triangle mesh
 * so `digitalTwinMaterial` renders crisp 1px screen-space wireframes without `gl.LINES`.
 */
export function bakeBarycentricAttribute(nonIndexedGeom: THREE.BufferGeometry): THREE.BufferGeometry {
  if (nonIndexedGeom.getIndex() !== null) {
    throw new RangeError('bakeBarycentricAttribute requires a non-indexed BufferGeometry.');
  }
  const pos = nonIndexedGeom.getAttribute('position');
  if (!pos || pos.count % 3 !== 0) {
    throw new RangeError('Non-indexed geometry vertex count must be a multiple of 3.');
  }

  const bary = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    // Vertex 0 -> (1, 0, 0)
    bary[i * 3] = 1;
    bary[i * 3 + 1] = 0;
    bary[i * 3 + 2] = 0;
    // Vertex 1 -> (0, 1, 0)
    bary[(i + 1) * 3] = 0;
    bary[(i + 1) * 3 + 1] = 1;
    bary[(i + 1) * 3 + 2] = 0;
    // Vertex 2 -> (0, 0, 1)
    bary[(i + 2) * 3] = 0;
    bary[(i + 2) * 3 + 1] = 0;
    bary[(i + 2) * 3 + 2] = 1;
  }

  nonIndexedGeom.setAttribute('aBarycentric', new THREE.BufferAttribute(bary, 3));
  return nonIndexedGeom;
}

/**
 * Builds the non-indexed Dual-Gender procedural twin `BufferGeometry` with:
 * - `morphTarget0` (Female - Male object-space position delta)
 * - `morphNormal0` (Female - Male object-space normal delta)
 * - `aBarycentric` (triangle wireframe coordinates)
 * - `aObserved` (Issue #11 per-vertex observation flag, initialized to 1.0)
 * - `aRegionIndex` (0..4 canonical `UBERON:` anatomical zone tag)
 */
export function buildProceduralTwinGeometry(radialSegments = 24): ProceduralTwinGeometryBundle {
  const maleIndexed = buildIndexedSexSilhouette(false, radialSegments);
  const femaleIndexed = buildIndexedSexSilhouette(true, radialSegments);

  assertMorphTopologyMatch(maleIndexed, femaleIndexed, 'ProceduralTwinMaleFemale');

  const malePos = maleIndexed.getAttribute('position') as THREE.BufferAttribute;
  const femalePos = femaleIndexed.getAttribute('position') as THREE.BufferAttribute;
  const maleNorm = maleIndexed.getAttribute('normal') as THREE.BufferAttribute;
  const femaleNorm = femaleIndexed.getAttribute('normal') as THREE.BufferAttribute;

  const vCount = malePos.count;
  const morphPosDelta = new Float32Array(vCount * 3);
  const morphNormDelta = new Float32Array(vCount * 3);
  const observedAttr = new Float32Array(vCount).fill(1.0);
  const regionIdxAttr = new Float32Array(vCount);
  const regionStressAttr = new Float32Array(vCount);

  for (let i = 0; i < vCount; i += 1) {
    const i3 = i * 3;
    const mx = malePos.array[i3];
    const my = malePos.array[i3 + 1];
    const mz = malePos.array[i3 + 2];

    morphPosDelta[i3] = femalePos.array[i3] - mx;
    morphPosDelta[i3 + 1] = femalePos.array[i3 + 1] - my;
    morphPosDelta[i3 + 2] = femalePos.array[i3 + 2] - mz;

    morphNormDelta[i3] = femaleNorm.array[i3] - maleNorm.array[i3];
    morphNormDelta[i3 + 1] = femaleNorm.array[i3 + 1] - maleNorm.array[i3 + 1];
    morphNormDelta[i3 + 2] = femaleNorm.array[i3 + 2] - maleNorm.array[i3 + 2];

    regionIdxAttr[i] = classifyWorldYToRegionIndex(mx, my, mz);
  }

  const morphPosBuffer = new THREE.BufferAttribute(morphPosDelta, 3);
  const morphNormBuffer = new THREE.BufferAttribute(morphNormDelta, 3);

  maleIndexed.setAttribute('morphTarget0', morphPosBuffer);
  maleIndexed.setAttribute('morphNormal0', morphNormBuffer);
  maleIndexed.setAttribute('aObserved', new THREE.BufferAttribute(observedAttr, 1));
  maleIndexed.setAttribute('aRegionIndex', new THREE.BufferAttribute(regionIdxAttr, 1));
  maleIndexed.setAttribute('aRegionStress', new THREE.BufferAttribute(regionStressAttr, 1));

  const nonIndexed = maleIndexed.toNonIndexed();
  maleIndexed.dispose();
  femaleIndexed.dispose();

  bakeBarycentricAttribute(nonIndexed);
  nonIndexed.computeBoundingSphere();
  nonIndexed.computeBoundingBox();

  const finalVertexCount = nonIndexed.getAttribute('position').count;
  return {
    geometry: nonIndexed,
    vertexCount: finalVertexCount,
    triangleCount: finalVertexCount / 3,
  };
}

/**
 * Updates `aObserved` and optional `aRegionStress` in-place (`0` allocations) across
 * the procedural twin mesh from the 5 canonical `UBERON:` region states (Issue #11).
 */
export function updateTwinRegionObservation(
  twinGeometry: THREE.BufferGeometry,
  observedByRegion: Partial<Record<AnatomicalRegionWireId, boolean>>,
  stressByRegion?: Partial<Record<AnatomicalRegionWireId, number>>,
): void {
  const obsAttr = twinGeometry.getAttribute('aObserved') as THREE.BufferAttribute | undefined;
  const regAttr = twinGeometry.getAttribute('aRegionIndex') as THREE.BufferAttribute | undefined;
  const stressAttr = twinGeometry.getAttribute('aRegionStress') as THREE.BufferAttribute | undefined;
  if (!obsAttr || !regAttr) return;

  const lut: [number, number, number, number, number] = [
    observedByRegion.EyeOcularSans === false ? 0 : 1,
    observedByRegion.InternalJugularVein === false ? 0 : 1,
    observedByRegion.HeartCardioAutonomic === false ? 0 : 1,
    observedByRegion.SoleusCalcaneus === false ? 0 : 1,
    observedByRegion.BrainVestibularCns === false ? 0 : 1,
  ];

  const clamp01 = (v: number | undefined): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

  const stressLut: [number, number, number, number, number] = [
    lut[0] ? clamp01(stressByRegion?.EyeOcularSans) : 0,
    lut[1] ? clamp01(stressByRegion?.InternalJugularVein) : 0,
    lut[2] ? clamp01(stressByRegion?.HeartCardioAutonomic) : 0,
    lut[3] ? clamp01(stressByRegion?.SoleusCalcaneus) : 0,
    lut[4] ? clamp01(stressByRegion?.BrainVestibularCns) : 0,
  ];

  const obsArray = obsAttr.array as Float32Array;
  const regArray = regAttr.array as Float32Array;
  const stressArray = stressAttr ? (stressAttr.array as Float32Array) : null;
  let obsChanged = false;
  let stressChanged = false;

  for (let i = 0; i < obsAttr.count; i += 1) {
    const rIdx = regArray[i] | 0;
    const nextVal = lut[rIdx] ?? 1;
    if (obsArray[i] !== nextVal) {
      obsArray[i] = nextVal;
      obsChanged = true;
    }
    if (stressArray && stressByRegion) {
      const nextStress = stressLut[rIdx] ?? 0;
      if (Math.abs(stressArray[i] - nextStress) > 1e-5) {
        stressArray[i] = nextStress;
        stressChanged = true;
      }
    }
  }

  if (obsChanged) {
    obsAttr.needsUpdate = true;
  }
  if (stressChanged && stressAttr) {
    stressAttr.needsUpdate = true;
  }
}

/**
 * Builds Pass 0 internal organ & vascular core geometry merged into 1 indexed `BufferGeometry`
 * (`1` draw call): cerebral hemispheres, globes, heart + aortic arch, bilateral IJVs,
 * pulmonary lobes, femoral shafts, and deep soleus compartments.
 * Includes per-vertex `aRegionIndex`, `aLocalLoad`, and `aObserved` so each organ
 * reflects its own real-time physiological stress and Issue #11 observation status.
 */
export function buildInternalOrganCoreGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const pushTransformed = (
    geom: THREE.BufferGeometry,
    region: AnatomicalRegionWireId,
    scale: [number, number, number],
    pos: [number, number, number],
    rotZ = 0,
  ): void => {
    geom.scale(scale[0], scale[1], scale[2]);
    if (rotZ !== 0) {
      geom.rotateZ(rotZ);
    }
    geom.translate(pos[0], pos[1], pos[2]);
    const vCount = geom.getAttribute('position').count;
    const rIdx = REGION_INDEX_BY_WIRE_ID[region];
    geom.setAttribute('aRegionIndex', new THREE.BufferAttribute(new Float32Array(vCount).fill(rIdx), 1));
    geom.setAttribute('aLocalLoad', new THREE.BufferAttribute(new Float32Array(vCount).fill(0.16), 1));
    geom.setAttribute('aObserved', new THREE.BufferAttribute(new Float32Array(vCount).fill(1.0), 1));
    parts.push(geom);
  };

  // Cerebral hemispheres (`BrainVestibularCns` [0, 1.658, -0.002])
  pushTransformed(new THREE.SphereGeometry(1, 16, 12), 'BrainVestibularCns', [0.038, 0.050, 0.064], [-0.034, 1.656, -0.002]);
  pushTransformed(new THREE.SphereGeometry(1, 16, 12), 'BrainVestibularCns', [0.038, 0.050, 0.064], [0.034, 1.656, -0.002]);

  // Bilateral ocular globes (`EyeOcularSans` [0, 1.5524, 0.075])
  pushTransformed(new THREE.SphereGeometry(1, 12, 10), 'EyeOcularSans', [0.015, 0.015, 0.015], [-0.031, 1.555, 0.084]);
  pushTransformed(new THREE.SphereGeometry(1, 12, 10), 'EyeOcularSans', [0.015, 0.015, 0.015], [0.031, 1.555, 0.084]);

  // Bilateral Internal Jugular Veins (`InternalJugularVein` [-0.06, 1.2884, 0.064])
  pushTransformed(new THREE.CylinderGeometry(0.013, 0.016, 0.30, 12, 4), 'InternalJugularVein', [1, 1, 1], [-0.056, 1.29, 0.048], 0.04);
  pushTransformed(new THREE.CylinderGeometry(0.011, 0.014, 0.30, 12, 4), 'InternalJugularVein', [1, 1, 1], [0.056, 1.29, 0.048], -0.04);

  // Heart myocardium (`HeartCardioAutonomic` [0, 0.866, 0.042]) + aortic arch
  pushTransformed(new THREE.SphereGeometry(1, 16, 12), 'HeartCardioAutonomic', [0.054, 0.066, 0.050], [0.018, 0.875, 0.044], -0.22);
  pushTransformed(new THREE.CylinderGeometry(0.013, 0.015, 0.42, 12, 4), 'HeartCardioAutonomic', [1, 1, 1], [0.004, 0.72, 0.012]);

  // Left & right pulmonary visceral lobes
  pushTransformed(new THREE.SphereGeometry(1, 14, 12), 'HeartCardioAutonomic', [0.064, 0.125, 0.068], [-0.082, 0.94, 0.018]);
  pushTransformed(new THREE.SphereGeometry(1, 14, 12), 'HeartCardioAutonomic', [0.060, 0.120, 0.066], [0.084, 0.94, 0.018]);

  // Bilateral femoral cortical shafts + soleus/calcaneus deep compartments (`SoleusCalcaneus`)
  pushTransformed(new THREE.CylinderGeometry(0.019, 0.017, 0.42, 10, 3), 'SoleusCalcaneus', [1, 1, 1], [-0.116, 0.01, 0.020], -0.03);
  pushTransformed(new THREE.CylinderGeometry(0.019, 0.017, 0.42, 10, 3), 'SoleusCalcaneus', [1, 1, 1], [0.116, 0.01, 0.020], 0.03);
  pushTransformed(new THREE.SphereGeometry(1, 12, 10), 'SoleusCalcaneus', [0.032, 0.140, 0.036], [-0.118, -0.42, -0.010]);
  pushTransformed(new THREE.SphereGeometry(1, 12, 10), 'SoleusCalcaneus', [0.032, 0.140, 0.036], [0.118, -0.42, -0.010]);

  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i += 1) {
    parts[i].dispose();
  }
  if (!merged) {
    throw new RangeError('Failed to merge Pass 0 internal organ core geometry.');
  }
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Zero-GC per-organ scalar stress & Issue #11 observation updater for `buildInternalOrganCoreGeometry()`.
 */
export function updateOrganCoreRegionLoads(
  organCoreGeom: THREE.BufferGeometry,
  nodesByRegion: Partial<
    Record<AnatomicalRegionWireId, { localIntensity: number; observed: boolean }>
  >,
): void {
  const regAttr = organCoreGeom.getAttribute('aRegionIndex') as THREE.BufferAttribute | undefined;
  const loadAttr = organCoreGeom.getAttribute('aLocalLoad') as THREE.BufferAttribute | undefined;
  const obsAttr = organCoreGeom.getAttribute('aObserved') as THREE.BufferAttribute | undefined;
  if (!regAttr || !loadAttr || !obsAttr) return;

  const clamp01 = (v: number | undefined): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

  const obsLut: [number, number, number, number, number] = [
    nodesByRegion.EyeOcularSans?.observed === true ? 1 : 0,
    nodesByRegion.InternalJugularVein?.observed === true ? 1 : 0,
    nodesByRegion.HeartCardioAutonomic?.observed === true ? 1 : 0,
    nodesByRegion.SoleusCalcaneus?.observed === true ? 1 : 0,
    nodesByRegion.BrainVestibularCns?.observed === true ? 1 : 0,
  ];
  const loadLut: [number, number, number, number, number] = [
    obsLut[0] ? clamp01(nodesByRegion.EyeOcularSans?.localIntensity) : 0,
    obsLut[1] ? clamp01(nodesByRegion.InternalJugularVein?.localIntensity) : 0,
    obsLut[2] ? clamp01(nodesByRegion.HeartCardioAutonomic?.localIntensity) : 0,
    obsLut[3] ? clamp01(nodesByRegion.SoleusCalcaneus?.localIntensity) : 0,
    obsLut[4] ? clamp01(nodesByRegion.BrainVestibularCns?.localIntensity) : 0,
  ];

  const regArr = regAttr.array as Float32Array;
  const loadArr = loadAttr.array as Float32Array;
  const obsArr = obsAttr.array as Float32Array;
  let changed = false;

  for (let i = 0; i < regAttr.count; i += 1) {
    const rIdx = regArr[i] | 0;
    const nextObs = obsLut[rIdx] ?? 0;
    const nextLoad = loadLut[rIdx] ?? 0;
    if (obsArr[i] !== nextObs || Math.abs(loadArr[i] - nextLoad) > 1e-5) {
      obsArr[i] = nextObs;
      loadArr[i] = nextLoad;
      changed = true;
    }
  }

  if (changed) {
    obsAttr.needsUpdate = true;
    loadAttr.needsUpdate = true;
  }
}
