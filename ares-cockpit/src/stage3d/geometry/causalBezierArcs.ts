// Single-draw-call merged `CubicBezierCurve3` TubeGeometry builder & zero-alloc vertex-attribute
// updater for the 6 canonical BioKG physiological hyperedges (`Pass 5`).
// Uses only bare package runtime imports so Node `--experimental-strip-types` can test directly.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnatomicalRegionWireId } from '../../types/telemetry';
import type { ProjectedConductionArc } from '../../modules/body-3d-heatmap/uberonSpatialMapping';

export interface CausalArcSegmentSlice {
  id: string;
  sourceRegion: AnatomicalRegionWireId;
  targetRegion: AnatomicalRegionWireId;
  mechanism: string;
  couplingWeight: number;
  startVertex: number;
  vertexCount: number;
}

export interface MergedCausalArcsBundle {
  geometry: THREE.BufferGeometry;
  segments: readonly CausalArcSegmentSlice[];
}

interface CanonicalArcBlueprint {
  source: AnatomicalRegionWireId;
  target: AnatomicalRegionWireId;
  couplingWeight: number;
  mechanism: string;
  lateralBulgeX: number;
  anteriorLiftZ: number;
}

const CANONICAL_ARC_BLUEPRINTS: readonly CanonicalArcBlueprint[] = [
  {
    source: 'HeartCardioAutonomic',
    target: 'InternalJugularVein',
    couplingWeight: 0.55,
    mechanism: 'cephalad_venous_congestion',
    lateralBulgeX: -0.055,
    anteriorLiftZ: 0.13,
  },
  {
    source: 'InternalJugularVein',
    target: 'EyeOcularSans',
    couplingWeight: 0.4,
    mechanism: 'translaminar_hydrostatic_shift',
    lateralBulgeX: -0.045,
    anteriorLiftZ: 0.12,
  },
  {
    source: 'InternalJugularVein',
    target: 'BrainVestibularCns',
    couplingWeight: 0.35,
    mechanism: 'cerebral_venous_outflow_impedance',
    lateralBulgeX: 0.045,
    anteriorLiftZ: 0.11,
  },
  {
    source: 'SoleusCalcaneus',
    target: 'HeartCardioAutonomic',
    couplingWeight: 0.3,
    mechanism: 'gastrocnemius_soleus_preload_loss',
    lateralBulgeX: -0.085,
    anteriorLiftZ: 0.16,
  },
  {
    source: 'SoleusCalcaneus',
    target: 'BrainVestibularCns',
    couplingWeight: 0.25,
    mechanism: 'otolith_proprioceptive_reweighting',
    lateralBulgeX: 0.105,
    anteriorLiftZ: 0.18,
  },
  {
    source: 'BrainVestibularCns',
    target: 'HeartCardioAutonomic',
    couplingWeight: 0.3,
    mechanism: 'baroreflex_autonomic_gain',
    lateralBulgeX: 0.065,
    anteriorLiftZ: 0.14,
  },
] as const;

const DEFAULT_REGION_COORDS: Readonly<
  Record<AnatomicalRegionWireId, readonly [number, number, number]>
> = {
  EyeOcularSans: [0.0, 1.5524, 0.075],
  InternalJugularVein: [-0.06, 1.2884, 0.064],
  HeartCardioAutonomic: [0.0, 0.866, 0.042],
  SoleusCalcaneus: [0.0, -0.388, -0.013],
  BrainVestibularCns: [0.0, 1.658, -0.002],
};

const _scratchArcColor = new THREE.Color();

/**
 * Merges all 6 canonical `CubicBezierCurve3` `TubeGeometry` segments into a single
 * indexed `BufferGeometry` (`1` draw call for Pass 5) with pre-allocated `aFluxIntensity`,
 * `aObserved`, and `aArcColor` attributes.
 */
export function createMergedCausalBezierArcs(
  anchorOverrides?: Partial<Record<AnatomicalRegionWireId, readonly [number, number, number]>>,
  tubularSegments = 28,
  tubeRadius = 0.0068,
  radialSegments = 6,
): MergedCausalArcsBundle {
  const tubes: THREE.BufferGeometry[] = [];
  const segments: CausalArcSegmentSlice[] = [];
  let runningVertexOffset = 0;

  _scratchArcColor.set('#475569');

  for (let i = 0; i < CANONICAL_ARC_BLUEPRINTS.length; i += 1) {
    const bp = CANONICAL_ARC_BLUEPRINTS[i];
    const src = anchorOverrides?.[bp.source] ?? DEFAULT_REGION_COORDS[bp.source];
    const dst = anchorOverrides?.[bp.target] ?? DEFAULT_REGION_COORDS[bp.target];

    const p0 = new THREE.Vector3(src[0], src[1], src[2]);
    const p3 = new THREE.Vector3(dst[0], dst[1], dst[2]);
    const peakZ = Math.max(src[2], dst[2]) + bp.anteriorLiftZ;

    const p1 = new THREE.Vector3(
      src[0] + (dst[0] - src[0]) * 0.28 + bp.lateralBulgeX,
      src[1] + (dst[1] - src[1]) * 0.33,
      peakZ,
    );
    const p2 = new THREE.Vector3(
      src[0] + (dst[0] - src[0]) * 0.72 + bp.lateralBulgeX * 0.7,
      src[1] + (dst[1] - src[1]) * 0.67,
      peakZ,
    );

    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
    const tube = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, false);
    const vCount = tube.getAttribute('position').count;

    const fluxArr = new Float32Array(vCount).fill(0);
    const obsArr = new Float32Array(vCount).fill(0);
    const colArr = new Float32Array(vCount * 3);
    for (let v = 0; v < vCount; v += 1) {
      colArr[v * 3] = _scratchArcColor.r;
      colArr[v * 3 + 1] = _scratchArcColor.g;
      colArr[v * 3 + 2] = _scratchArcColor.b;
    }

    tube.setAttribute('aFluxIntensity', new THREE.BufferAttribute(fluxArr, 1));
    tube.setAttribute('aObserved', new THREE.BufferAttribute(obsArr, 1));
    tube.setAttribute('aArcColor', new THREE.BufferAttribute(colArr, 3));

    segments.push({
      id: `${bp.source}->${bp.target}`,
      sourceRegion: bp.source,
      targetRegion: bp.target,
      mechanism: bp.mechanism,
      couplingWeight: bp.couplingWeight,
      startVertex: runningVertexOffset,
      vertexCount: vCount,
    });

    runningVertexOffset += vCount;
    tubes.push(tube);
  }

  const merged = mergeGeometries(tubes, false);
  for (let i = 0; i < tubes.length; i += 1) {
    tubes[i].dispose();
  }
  if (!merged) {
    throw new RangeError('Failed to merge Pass 5 CubicBezierCurve3 causal arcs.');
  }
  merged.computeBoundingSphere();

  return {
    geometry: merged,
    segments,
  };
}

/**
 * Updates `aFluxIntensity`, `aObserved`, and `aArcColor` across all 6 merged conduction
 * arcs in-place (`0` heap allocations per tick).
 */
export function updateCausalBezierArcsGeometry(
  bundle: MergedCausalArcsBundle,
  arcs: readonly ProjectedConductionArc[] | null | undefined,
  observedByRegion?: Partial<Record<AnatomicalRegionWireId, boolean>>,
): void {
  const fluxAttr = bundle.geometry.getAttribute('aFluxIntensity') as
    | THREE.BufferAttribute
    | undefined;
  const obsAttr = bundle.geometry.getAttribute('aObserved') as THREE.BufferAttribute | undefined;
  const colAttr = bundle.geometry.getAttribute('aArcColor') as THREE.BufferAttribute | undefined;
  if (!fluxAttr || !obsAttr || !colAttr) return;

  const fluxArr = fluxAttr.array as Float32Array;
  const obsArr = obsAttr.array as Float32Array;
  const colArr = colAttr.array as Float32Array;

  for (let s = 0; s < bundle.segments.length; s += 1) {
    const seg = bundle.segments[s];
    let matched: ProjectedConductionArc | undefined;
    if (arcs) {
      for (let k = 0; k < arcs.length; k += 1) {
        if (arcs[k].id === seg.id) {
          matched = arcs[k];
          break;
        }
      }
    }

    const flux = matched ? Math.max(0, Math.min(1, matched.fluxIntensity)) : 0;
    const explicitObs = observedByRegion?.[seg.sourceRegion];
    const observed =
      explicitObs !== undefined ? explicitObs : matched ? !matched.dashed || flux >= 0.06 : false;

    const hex = matched?.color ?? '#475569';
    _scratchArcColor.set(hex);

    const endV = seg.startVertex + seg.vertexCount;
    for (let v = seg.startVertex; v < endV; v += 1) {
      fluxArr[v] = flux;
      obsArr[v] = observed ? 1.0 : 0.0;
      const v3 = v * 3;
      colArr[v3] = _scratchArcColor.r;
      colArr[v3 + 1] = _scratchArcColor.g;
      colArr[v3 + 2] = _scratchArcColor.b;
    }
  }

  fluxAttr.needsUpdate = true;
  obsAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}
