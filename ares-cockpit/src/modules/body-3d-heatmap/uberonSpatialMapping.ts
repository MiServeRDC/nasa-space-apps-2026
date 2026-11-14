// Deterministic spatial projection from Rust `hypergraph_spatial.rs` normalized
// centroids onto the React-Three-Fiber anatomical frame (`AnatomicalLayers.tsx`).
// Pure TypeScript (only `import type` references) so Node `--experimental-strip-types` can test directly.

import type {
  AnatomicalHeatmapKey,
  AnatomicalRegionWireId,
  HeatmapCellWire,
  HypergraphSpatialSummary,
  UberonCurie,
} from '../../types/telemetry';

export type CellObservationState =
  | 'HIGH_STRESS'
  | 'ELEVATED_STRESS'
  | 'MODERATE_STRESS'
  | 'NOMINAL_OBSERVED'
  | 'PROPAGATED_ONLY'
  | 'UNOBSERVED_NO_RR';

export interface CanonicalRegionMetadata {
  region: AnatomicalRegionWireId;
  key: AnatomicalHeatmapKey;
  uberonCurie: UberonCurie;
  label: string;
  normalizedCentroid: [number, number, number];
}

export interface ProjectedAnatomicalNode {
  region: AnatomicalRegionWireId;
  key: AnatomicalHeatmapKey;
  uberonCurie: UberonCurie;
  label: string;
  normalizedCentroid: [number, number, number];
  worldPosition: [number, number, number];
  localIntensity: number;
  propagatedIntensity: number;
  observed: boolean;
  observationState: CellObservationState;
  color: string;
}

export interface ProjectedConductionArc {
  id: string;
  sourceRegion: AnatomicalRegionWireId;
  targetRegion: AnatomicalRegionWireId;
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  midPoint: [number, number, number];
  couplingWeight: number;
  mechanism: string;
  fluxIntensity: number;
  color: string;
  dashed: boolean;
}

export interface ProjectedHypergraphScene {
  nodes: ProjectedAnatomicalNode[];
  nodesByRegion: Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>;
  arcs: ProjectedConductionArc[];
  hottestRegion: AnatomicalRegionWireId | null;
  habitatZone: string | null;
  violatesPolicy: boolean;
  rhoCurrentLocation: number | null;
  biokgClause: string | null;
}

export const CANONICAL_REGIONS: CanonicalRegionMetadata[] = [
  {
    region: 'EyeOcularSans',
    key: 'eye_ocular_sans',
    uberonCurie: 'UBERON:0000970',
    label: 'Ocular / Translaminar (SANS)',
    normalizedCentroid: [0.0, 0.82, 0.05],
  },
  {
    region: 'InternalJugularVein',
    key: 'internal_jugular_vein',
    uberonCurie: 'UBERON:0001586',
    label: 'Internal Jugular Vein (IJV)',
    normalizedCentroid: [-0.06, 0.62, 0.04],
  },
  {
    region: 'HeartCardioAutonomic',
    key: 'heart_cardio_autonomic',
    uberonCurie: 'UBERON:0000948',
    label: 'Cardiac Autonomic / Baroreflex',
    normalizedCentroid: [0.0, 0.3, 0.02],
  },
  {
    region: 'SoleusCalcaneus',
    key: 'soleus_calcaneus',
    uberonCurie: 'UBERON:0001389',
    label: 'Soleus / Calcaneus (Musculoskeletal)',
    normalizedCentroid: [0.0, -0.65, -0.03],
  },
  {
    region: 'BrainVestibularCns',
    key: 'brain_vestibular_cns',
    uberonCurie: 'UBERON:0000955',
    label: 'Brain / Vestibular CNS',
    normalizedCentroid: [0.0, 0.9, -0.02],
  },
];

export const CANONICAL_UBERON_CURIES: readonly UberonCurie[] = [
  'UBERON:0000970',
  'UBERON:0001586',
  'UBERON:0000948',
  'UBERON:0001389',
  'UBERON:0000955',
] as const;

export interface ConductionEdgeSpec {
  source: AnatomicalRegionWireId;
  target: AnatomicalRegionWireId;
  couplingWeight: number;
  mechanism: string;
}

/** 6 directed physiological hyperedges matching `crates/ares-causal-graph/src/hypergraph_spatial.rs`. */
export const CANONICAL_CONDUCTION_EDGES: readonly ConductionEdgeSpec[] = [
  {
    source: 'HeartCardioAutonomic',
    target: 'InternalJugularVein',
    couplingWeight: 0.55,
    mechanism: 'cephalad_venous_congestion',
  },
  {
    source: 'InternalJugularVein',
    target: 'EyeOcularSans',
    couplingWeight: 0.4,
    mechanism: 'translaminar_hydrostatic_shift',
  },
  {
    source: 'InternalJugularVein',
    target: 'BrainVestibularCns',
    couplingWeight: 0.35,
    mechanism: 'cerebral_venous_outflow_impedance',
  },
  {
    source: 'SoleusCalcaneus',
    target: 'HeartCardioAutonomic',
    couplingWeight: 0.3,
    mechanism: 'gastrocnemius_soleus_preload_loss',
  },
  {
    source: 'SoleusCalcaneus',
    target: 'BrainVestibularCns',
    couplingWeight: 0.25,
    mechanism: 'otolith_proprioceptive_reweighting',
  },
  {
    source: 'BrainVestibularCns',
    target: 'HeartCardioAutonomic',
    couplingWeight: 0.3,
    mechanism: 'baroreflex_autonomic_gain',
  },
] as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Affine body-frame projection:
 *   Phi(x_n, y_n, z_n) = [1.00 * x_n + 0.00, 1.32 * y_n + 0.47, 1.10 * z_n + 0.02]
 */
export function projectNormalizedCentroidToR3f(
  centroid: [number, number, number],
): [number, number, number] {
  const [xn, yn, zn] = centroid;
  return [
    Number((1.0 * xn + 0.0).toFixed(4)),
    Number((1.32 * yn + 0.47).toFixed(4)),
    Number((1.1 * zn + 0.02).toFixed(4)),
  ];
}

/**
 * Validates that a CURIE belongs strictly to the 5 canonical Phase 29 anatomical nodes
 * (specifically rejecting `UBERON:0001585` submaxillary lymph node typo; IJV is `UBERON:0001586`).
 */
export function isValidCanonicalUberonCurie(curie: string): curie is UberonCurie {
  if (curie === 'UBERON:0001585') return false;
  return (CANONICAL_UBERON_CURIES as readonly string[]).includes(curie);
}

/** Normalize Rust PascalCase (`EyeOcularSans`), SCREAMING_SNAKE (`EYE_OCULAR_SANS`), or short key. */
export function normalizeRegionWireId(
  regionOrKey: string,
): AnatomicalRegionWireId | null {
  const normalized = regionOrKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  switch (normalized) {
    case 'EYEOCULARSANS':
    case 'SANS':
    case 'OCULAR':
      return 'EyeOcularSans';
    case 'INTERNALJUGULARVEIN':
    case 'IJV':
      return 'InternalJugularVein';
    case 'HEARTCARDIOAUTONOMIC':
    case 'HEART':
      return 'HeartCardioAutonomic';
    case 'SOLEUSCALCANEUS':
    case 'SOLEUS':
      return 'SoleusCalcaneus';
    case 'BRAINVESTIBULARCNS':
    case 'CNS':
    case 'BRAIN':
      return 'BrainVestibularCns';
    default:
      return null;
  }
}

export function computeCellColorStatus(
  localIntensity: number,
  propagatedIntensity: number,
  observed: boolean,
): { color: string; observationState: CellObservationState } {
  const local = clamp01(localIntensity);
  const prop = clamp01(propagatedIntensity);

  if (!observed) {
    // Issue #11 strict rule: never color an unobserved cell cyan (`#22d3ee`) as "nominal"!
    if (prop < 0.05) {
      return { color: '#6b7280', observationState: 'UNOBSERVED_NO_RR' };
    }
    return { color: '#facc15', observationState: 'PROPAGATED_ONLY' };
  }

  if (local >= 0.75) {
    return { color: '#f43f5e', observationState: 'HIGH_STRESS' };
  }
  if (local >= 0.5) {
    return { color: '#fb923c', observationState: 'ELEVATED_STRESS' };
  }
  if (local >= 0.25) {
    return { color: '#facc15', observationState: 'MODERATE_STRESS' };
  }
  return { color: '#22d3ee', observationState: 'NOMINAL_OBSERVED' };
}

function buildFallbackCellsFromLegacyAnatomicalCells(
  summary: HypergraphSpatialSummary | null | undefined,
): Map<AnatomicalRegionWireId, HeatmapCellWire> {
  const byRegion = new Map<AnatomicalRegionWireId, HeatmapCellWire>();
  if (!summary) return byRegion;

  if (Array.isArray(summary.cells)) {
    for (const cell of summary.cells) {
      const reg = normalizeRegionWireId(cell.region) ?? normalizeRegionWireId(cell.key);
      if (!reg) continue;
      const meta = CANONICAL_REGIONS.find((r) => r.region === reg);
      if (!meta) continue;
      byRegion.set(reg, {
        ...cell,
        region: reg,
        key: meta.key,
        uberon_curie: isValidCanonicalUberonCurie(cell.uberon_curie)
          ? cell.uberon_curie
          : meta.uberonCurie,
      });
    }
  }

  if (byRegion.size === 0 && Array.isArray(summary.anatomical_cells)) {
    for (const ac of summary.anatomical_cells) {
      const reg = normalizeRegionWireId(ac.region_id);
      if (!reg) continue;
      const meta = CANONICAL_REGIONS.find((r) => r.region === reg);
      if (!meta) continue;
      const intensity = clamp01(ac.risk_intensity);
      byRegion.set(reg, {
        region: reg,
        key: meta.key,
        uberon_curie: isValidCanonicalUberonCurie(ac.uberon_id)
          ? ac.uberon_id
          : meta.uberonCurie,
        centroid: meta.normalizedCentroid,
        local_intensity: intensity,
        propagated_intensity: intensity,
        observed: true,
      });
    }
  }

  return byRegion;
}

/**
 * Projects live `hypergraph_spatial` telemetry (or explicit local simulation overrides)
 * onto the 5 canonical 3D `UBERON:` anatomical nodes and 6 directed conduction arcs.
 */
export function projectHypergraphTo3D(
  summary: HypergraphSpatialSummary | null | undefined,
  localFallbackByKey?: Partial<
    Record<AnatomicalHeatmapKey, { intensity: number; observed: boolean }>
  >,
): ProjectedHypergraphScene {
  const wireByRegion = buildFallbackCellsFromLegacyAnatomicalCells(summary);
  const nodes: ProjectedAnatomicalNode[] = [];
  const nodesByRegion = {} as Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>;

  for (const meta of CANONICAL_REGIONS) {
    const wire = wireByRegion.get(meta.region);
    const fallback = localFallbackByKey?.[meta.key];

    const observed = wire ? wire.observed : fallback ? fallback.observed : false;
    const localIntensity = wire
      ? clamp01(wire.local_intensity)
      : fallback && fallback.observed
        ? clamp01(fallback.intensity)
        : 0;
    const propagatedIntensity = wire
      ? clamp01(wire.propagated_intensity)
      : localIntensity;
    const centroid = wire ? wire.centroid : meta.normalizedCentroid;
    const { color, observationState } = computeCellColorStatus(
      localIntensity,
      propagatedIntensity,
      observed,
    );

    const node: ProjectedAnatomicalNode = {
      region: meta.region,
      key: meta.key,
      uberonCurie: meta.uberonCurie,
      label: meta.label,
      normalizedCentroid: centroid,
      worldPosition: projectNormalizedCentroidToR3f(centroid),
      localIntensity,
      propagatedIntensity,
      observed,
      observationState,
      color,
    };
    nodes.push(node);
    nodesByRegion[meta.region] = node;
  }

  const arcs: ProjectedConductionArc[] = CANONICAL_CONDUCTION_EDGES.map((edge, idx) => {
    const src = nodesByRegion[edge.source];
    const dst = nodesByRegion[edge.target];
    const fluxIntensity = clamp01(edge.couplingWeight * src.localIntensity);
    const sx = src.worldPosition[0];
    const sy = src.worldPosition[1];
    const sz = src.worldPosition[2];
    const tx = dst.worldPosition[0];
    const ty = dst.worldPosition[1];
    const tz = dst.worldPosition[2];

    const lateralBulge = idx % 2 === 0 ? 0.14 : -0.14;
    const midPoint: [number, number, number] = [
      Number(((sx + tx) * 0.5 + lateralBulge * 0.45).toFixed(4)),
      Number(((sy + ty) * 0.5).toFixed(4)),
      Number((Math.max(sz, tz) + 0.16).toFixed(4)),
    ];

    const arcColor =
      fluxIntensity >= 0.35
        ? '#f43f5e'
        : fluxIntensity >= 0.18
          ? '#fb923c'
          : fluxIntensity >= 0.06
            ? '#facc15'
            : '#475569';

    return {
      id: `${edge.source}->${edge.target}`,
      sourceRegion: edge.source,
      targetRegion: edge.target,
      sourcePos: src.worldPosition,
      targetPos: dst.worldPosition,
      midPoint,
      couplingWeight: edge.couplingWeight,
      mechanism: edge.mechanism,
      fluxIntensity,
      color: arcColor,
      dashed: !src.observed || fluxIntensity < 0.06,
    };
  });

  const normalizedHottest =
    typeof summary?.hottest_region === 'string'
      ? normalizeRegionWireId(summary.hottest_region)
      : null;

  return {
    nodes,
    nodesByRegion,
    arcs,
    hottestRegion: normalizedHottest,
    habitatZone: summary?.habitat_zone ?? null,
    violatesPolicy: summary?.violates_policy === true,
    rhoCurrentLocation: summary?.rho_current_location ?? null,
    biokgClause: summary?.biokg_clause ?? null,
  };
}
