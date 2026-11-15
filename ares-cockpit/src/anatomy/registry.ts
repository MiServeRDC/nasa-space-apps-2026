import type { AnatomyAnnotation, AnatomyModelManifest, AnatomySelection, AnatomicalStructure } from './contracts';
const regions = new Set(['EyeOcularSans', 'InternalJugularVein', 'HeartCardioAutonomic', 'SoleusCalcaneus', 'BrainVestibularCns']);
const localPath = (s: string) => s.startsWith('/anatomy/') && !s.includes('..') && !/[?#\\]/.test(s);
/** Validate authored manifests before registering any asset; never infer mesh identity from its label. */
export function validateAnatomyManifest(m: AnatomyModelManifest): string[] {
  const errors: string[] = [];
  if (!['MALE','FEMALE','UNSPECIFIED'].includes(m.referenceSex)) errors.push('Invalid reference sex');
  if (m.schemaVersion !== 1 || m.modelUnits !== 'm' || !m.id.trim()) errors.push('Invalid model identity/version');
  if(m.revisionSha256 !== undefined && !/^[0-9a-f]{64}$/.test(m.revisionSha256)) errors.push('Invalid model revision');
  const assets = new Set<string>(); const structures = new Set<string>();
  for (const a of m.assets) {
    if (!a.id || assets.has(a.id)) errors.push('Duplicate/empty asset ID');
    assets.add(a.id);
    if (!['MALE','FEMALE','UNSPECIFIED'].includes(a.sourceSex)) errors.push(`Invalid source sex: ${a.id}`);
    if (!localPath(a.path) || !/^[0-9a-f]{64}$/.test(a.sha256)) errors.push(`Invalid asset path/hash: ${a.id}`);
    if (!a.license.trim() || !a.credit.trim() || !a.sourceUrl.startsWith('https://') || !a.sourceVersion.trim()) errors.push(`Missing source/license: ${a.id}`);
    if (a.sourceToModel.length !== 16 || a.sourceToModel.some(n => !Number.isFinite(n))) errors.push(`Invalid transform: ${a.id}`);
    if (!['m','cm','mm'].includes(a.units) || a.axes !== 'GLTF_Y_UP_RIGHT_HANDED') errors.push(`Invalid coordinate system: ${a.id}`);
    if (a.registration.method !== 'IDENTITY' && a.registration.reviewed && !a.registration.report) errors.push(`Missing registration report: ${a.id}`);
    if (!Number.isInteger(a.lod) || a.lod < 0 || (a.pickingMap !== null && !localPath(a.pickingMap))) errors.push(`Invalid LOD/picking: ${a.id}`);
  }
  for (const s of m.structures) {
    if (!s.id || structures.has(s.id)) errors.push('Duplicate/empty structure ID');
    structures.add(s.id);
    if (!['LEFT','RIGHT','MIDLINE','BILATERAL','UNSPECIFIED'].includes(s.laterality) || !['NATIVE_REFERENCE','BORROWED_REFERENCE','MISSING','UNVERIFIED'].includes(s.coverage)) errors.push(`Invalid structure state: ${s.id}`);
    if (!s.sourceConceptId.trim() || !s.label.trim()) errors.push(`Missing source identity: ${s.id}`);
    if (s.ontology && (!/^(UBERON:\d{7}|FMA:\d+)$/.test(s.ontology.id) || !s.ontology.evidence.trim())) errors.push(`Invalid ontology evidence: ${s.id}`);
    const hasGeometry = s.meshes.some(ref => ref.nodeIds.length > 0);
    if ((s.coverage === 'NATIVE_REFERENCE' || s.coverage === 'BORROWED_REFERENCE') && !hasGeometry) errors.push(`Missing geometry: ${s.id}`);
    if (s.coverage === 'MISSING' && (hasGeometry || !s.unavailableReason)) errors.push(`Invalid missing coverage: ${s.id}`);
    for (const ref of s.meshes) if (!assets.has(ref.assetId) || !ref.nodeIds.length || new Set(ref.nodeIds).size !== ref.nodeIds.length || ref.nodeIds.some(id => !id.trim())) errors.push(`Invalid mesh reference: ${s.id}`);
    for (const binding of s.clinicalBindings) if (!regions.has(binding.backendRegion) || !['DIRECT','CONTEXT_ONLY'].includes(binding.relationship)) errors.push(`Unknown backend region: ${s.id}`);
    if (s.coverage === 'NATIVE_REFERENCE' && s.meshes.some(ref => m.assets.find(a => a.id === ref.assetId)?.sourceSex !== m.referenceSex)) errors.push(`Native source sex mismatch: ${s.id}`);
  }
  return errors;
}
export class AnatomyRegistry {
  private readonly models = new Map<string, AnatomyModelManifest>();
  register(model: AnatomyModelManifest): void {
    const errors = validateAnatomyManifest(model);
    if (this.models.has(model.id)) errors.push('Duplicate model ID');
    if (errors.length) throw new Error(errors.join('; '));
    // Own the records: outside mutations cannot silently change approved references.
    this.models.set(model.id, structuredClone(model));
  }
  structure(modelId: string, id: string): AnatomicalStructure | null {
    const s = this.models.get(modelId)?.structures.find(s => s.id === id);
    return s ? structuredClone(s) : null;
  }
  switchModel(selection: AnatomySelection | null, toModelId: string): AnatomySelection | null {
    if (!selection) return null;
    const original = this.structure(selection.modelId, selection.structureId);
    if (!original?.ontology?.reviewed) return null;
    const candidates = this.models.get(toModelId)?.structures.filter(s =>
      s.coverage !== 'MISSING' && s.coverage !== 'UNVERIFIED' && s.ontology?.reviewed &&
      s.ontology.id === original.ontology?.id && s.laterality === original.laterality) ?? [];
    return candidates.length === 1 ? {modelId: toModelId, structureId: candidates[0].id} : null;
  }
  annotationsForModel(annotations: readonly AnatomyAnnotation[], modelId: string): AnatomyAnnotation[] {
    // Positions/text are never transplanted across donors by ontology alone.
    const model=this.models.get(modelId);if(!model)return [];
    return annotations.filter(a=>{
      const structure=model.structures.find(s=>s.id===a.structureId);
      if(a.modelId!==modelId||!structure||structure.coverage==='MISSING')return false;
      if(!a.anchor)return true;
      if(!model.revisionSha256||a.modelRevision!==model.revisionSha256||a.anchor.positionM.length!==3||a.anchor.positionM.some(n=>!Number.isFinite(n)))return false;
      return structure.meshes.some(ref=>ref.nodeIds.includes(a.anchor!.nodeId)&&model.assets.find(asset=>asset.id===ref.assetId)?.sha256===a.anchor!.assetSha256);
    }).map(a=>structuredClone(a));
  }
}

/** Clinical answerability is independent of the presence/sex of reference geometry. */
export function anatomyClinicalAvailability(structure: AnatomicalStructure,
  channels: Readonly<Record<string, number | null | undefined>>): 'AVAILABLE' | 'UNAVAILABLE' | 'UNBOUND' {
  const required = structure.clinicalBindings.flatMap(b => b.channels);
  if (required.length === 0) return 'UNBOUND';
  return required.every(name => typeof channels[name] === 'number' && Number.isFinite(channels[name]))
    ? 'AVAILABLE' : 'UNAVAILABLE';
}
