import type { AnatomicalStructure, AnatomyModelManifest } from './contracts';

export interface MissingOverlayBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly side: 'L' | 'R' | 'MIDLINE';
}

export interface MissingStructureOverlay {
  readonly structureId: string;
  readonly canonicalKey: string;
  readonly searchAliases: readonly string[];
  readonly label: string;
  readonly regionLabel: string;
  readonly systemHint: 'cardiovascular' | 'nervous' | 'muscular' | 'skeletal';
  readonly referenceFrameId: string;
  readonly reason: string;
  readonly boxes: readonly MissingOverlayBox[];
}

/**
 * Unresolved native female anatomical anchor bounds expressed in `hra-female-v1.10`
 * glTF world-frame metres (derived solely from the existing v1.10 brain, optic nerve,
 * vertebra, aorta, and distal femur landmarks — zero male Z-Anatomy substitution).
 */
export const FEMALE_HRA_V110_MISSING_OVERLAYS: readonly MissingStructureOverlay[] = [
  {
    structureId: 'female-missing:ijv',
    canonicalKey: 'internal_jugular',
    searchAliases: ['internal_jugular', 'ijv', 'jugular', 'InternalJugularVein'],
    label: 'Internal jugular vein',
    regionLabel: 'Cervical / Jugular',
    systemHint: 'cardiovascular',
    referenceFrameId: 'hra-female-v1.10',
    reason: 'Native female IJV not established',
    boxes: [
      { center: [-0.042, 0.655, -0.056], size: [0.024, 0.130, 0.024], side: 'R' },
      { center: [0.032, 0.655, -0.056], size: [0.024, 0.130, 0.024], side: 'L' },
    ],
  },
  {
    structureId: 'female-missing:vagus',
    canonicalKey: 'vagus',
    searchAliases: ['vagus', 'cn x', 'autonomic', 'HeartCardioAutonomic'],
    label: 'Vagus nerve',
    regionLabel: 'Cervical / Autonomic',
    systemHint: 'nervous',
    referenceFrameId: 'hra-female-v1.10',
    reason: 'Native female vagus not established',
    boxes: [
      { center: [-0.033, 0.605, -0.068], size: [0.018, 0.210, 0.018], side: 'R' },
      { center: [0.023, 0.605, -0.068], size: [0.018, 0.210, 0.018], side: 'L' },
    ],
  },
  {
    structureId: 'female-missing:vestibular',
    canonicalKey: 'vestibular',
    searchAliases: ['vestibular', 'inner ear', 'BrainVestibularCns'],
    label: 'Vestibular structures',
    regionLabel: 'Temporal / Inner Ear',
    systemHint: 'nervous',
    referenceFrameId: 'hra-female-v1.10',
    reason: 'Required native vestibular coverage not established',
    boxes: [
      { center: [-0.056, 0.742, -0.056], size: [0.024, 0.022, 0.026], side: 'R' },
      { center: [0.046, 0.742, -0.056], size: [0.024, 0.022, 0.026], side: 'L' },
    ],
  },
  {
    structureId: 'female-missing:optic-sheath',
    canonicalKey: 'optic_sheath',
    searchAliases: ['optic_sheath', 'optic-sheath', 'onsd', 'EyeOcularSans'],
    label: 'Optic nerve sheath',
    regionLabel: 'Orbital / ONSD',
    systemHint: 'nervous',
    referenceFrameId: 'hra-female-v1.10',
    reason: 'Optic nerve and sclera do not establish optic sheath geometry',
    boxes: [
      { center: [-0.024, 0.764, -0.011], size: [0.022, 0.022, 0.044], side: 'R' },
      { center: [0.014, 0.764, -0.011], size: [0.022, 0.022, 0.044], side: 'L' },
    ],
  },
  {
    structureId: 'female-missing:soleus',
    canonicalKey: 'soleus',
    searchAliases: ['soleus', 'denver', 'andreassen', 'SoleusCalcaneus'],
    label: 'Soleus muscle (bilateral)',
    regionLabel: 'Lower Limb (Denver STL pending)',
    systemHint: 'muscular',
    referenceFrameId: 'hra-female-v1.10',
    reason: 'Original female lower-limb source has not been acquired',
    boxes: [
      { center: [-0.138, -0.560, -0.075], size: [0.070, 0.220, 0.070], side: 'R' },
      { center: [0.117, -0.560, -0.075], size: [0.070, 0.220, 0.070], side: 'L' },
    ],
  },
  {
    structureId: 'female-missing:calcaneus',
    canonicalKey: 'calcaneus',
    searchAliases: ['calcaneus', 'heel', 'denver', 'andreassen', 'SoleusCalcaneus'],
    label: 'Calcaneus (bilateral)',
    regionLabel: 'Foot / Heel (Denver STL pending)',
    systemHint: 'skeletal',
    referenceFrameId: 'hra-female-v1.10',
    reason: 'Original female lower-limb source has not been acquired',
    boxes: [
      { center: [-0.138, -0.780, -0.065], size: [0.055, 0.055, 0.085], side: 'R' },
      { center: [0.117, -0.780, -0.065], size: [0.055, 0.055, 0.085], side: 'L' },
    ],
  },
];

const OVERLAY_BY_ID = new Map<string, MissingStructureOverlay>(
  FEMALE_HRA_V110_MISSING_OVERLAYS.map((o) => [o.structureId, o]),
);

export const FEMALE_CRANIAL_CERVICAL_MISSING_IDS = new Set<string>([
  'female-missing:ijv',
  'female-missing:vagus',
  'female-missing:vestibular',
  'female-missing:optic-sheath',
]);

export function findMissingOverlayForStructure(structureId: string | null | undefined): MissingStructureOverlay | null {
  if (!structureId) return null;
  return OVERLAY_BY_ID.get(structureId) ?? null;
}

export function resolveMissingStructureMeta(structure: AnatomicalStructure): {
  canonicalKey: string;
  regionLabel: string;
  systemHint: string;
  searchText: string;
} {
  const overlay = OVERLAY_BY_ID.get(structure.id);
  if (overlay) {
    return {
      canonicalKey: overlay.canonicalKey,
      regionLabel: overlay.regionLabel,
      systemHint: overlay.systemHint,
      searchText: `${structure.label} ${structure.id} ${structure.sourceConceptId} ${overlay.canonicalKey} ${overlay.searchAliases.join(' ')} ${structure.unavailableReason ?? ''}`.toLowerCase(),
    };
  }
  return {
    canonicalKey: structure.id,
    regionLabel: 'Unresolved target',
    systemHint: 'unspecified',
    searchText: `${structure.label} ${structure.id} ${structure.sourceConceptId} ${structure.unavailableReason ?? ''}`.toLowerCase(),
  };
}

/**
 * Selects which translucent missingness bounding halos apply to the active view.
 * Never returns overlays for male models or for separate unregistered frames (`pelvis-v15`).
 */
export function selectActiveMissingOverlays(options: {
  model: AnatomyModelManifest | null | undefined;
  systemId: string;
  selectedId: string | null;
  showMissingOverlays: boolean;
  isolateMissingMode: boolean;
}): MissingStructureOverlay[] {
  const { model, systemId, selectedId, showMissingOverlays, isolateMissingMode } = options;
  if (!model || model.referenceSex !== 'FEMALE') return [];
  if (systemId === 'pelvis-v15' || systemId === 'none') return [];
  if (!showMissingOverlays && !isolateMissingMode && !OVERLAY_BY_ID.has(selectedId ?? '')) {
    return [];
  }

  const missingIds = new Set(model.structures.filter((s) => s.coverage === 'MISSING').map((s) => s.id));
  return FEMALE_HRA_V110_MISSING_OVERLAYS.filter((overlay) => {
    if (!missingIds.has(overlay.structureId)) return false;
    if (selectedId === overlay.structureId) return true;
    if (FEMALE_CRANIAL_CERVICAL_MISSING_IDS.has(overlay.structureId)) return true;
    return systemId === 'skeletal' || systemId === 'muscular';
  });
}
