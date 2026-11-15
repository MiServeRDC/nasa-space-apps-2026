import type { AnatomicalRegionWireId } from '../types/telemetry';
export type CoverageState = 'NATIVE_REFERENCE' | 'BORROWED_REFERENCE' | 'MISSING' | 'UNVERIFIED';
export type Laterality = 'LEFT' | 'RIGHT' | 'MIDLINE' | 'BILATERAL' | 'UNSPECIFIED';
export interface AnatomyAsset {
  id: string; path: string; sha256: string;
  sourceUrl: string; sourceVersion: string; sourceSex: 'MALE' | 'FEMALE' | 'UNSPECIFIED';
  sourceDonorReference: string | null;
  license: string; credit: string; adaptations: string[];
  units: 'm' | 'cm' | 'mm'; axes: 'GLTF_Y_UP_RIGHT_HANDED';
  /** Column-major affine 4x4; source units to model metres. */
  sourceToModel: number[];
  registration: { method: 'IDENTITY' | 'LANDMARK_FIT' | 'UNREVIEWED'; reviewed: boolean; report: string | null };
  lod: number; pickingMap: string | null;
}
export interface AnatomicalStructure {
  id: string; label: string; sourceConceptId: string; laterality: Laterality;
  ontology: { id: string; reviewed: boolean; evidence: string } | null;
  coverage: CoverageState;
  meshes: { assetId: string; nodeIds: string[] }[];
  clinicalBindings: { backendRegion: AnatomicalRegionWireId; relationship: 'DIRECT' | 'CONTEXT_ONLY'; channels: string[] }[];
  unavailableReason: string | null;
}
export interface AnatomyModelManifest {
  schemaVersion: 1; id: string; label: string; modelUnits: 'm'; revisionSha256?: string; referenceSex: 'MALE' | 'FEMALE' | 'UNSPECIFIED';
  assets: AnatomyAsset[]; structures: AnatomicalStructure[];
}
export interface AnatomyAnnotation {
  id: string; modelId: string; structureId: string; text: string; modelRevision?: string;
  anchor?: {assetSha256: string; nodeId: string; positionM: [number,number,number]};
}
export interface AnatomySelection { modelId: string; structureId: string }
