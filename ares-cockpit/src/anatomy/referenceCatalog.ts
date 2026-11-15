import type {AnatomyModelManifest,AnatomyAnnotation} from './contracts';
import type {AnatomyChunk} from './modelSession';
import {AnatomyRegistry} from './registry';
export interface ReferenceTarget {id:string;label:string;nodeIds:string[];channels:string[]}
export interface ReferenceSystem {id:string;label:string;chunk:AnatomyChunk|null;coordinateFrame?:string;targets:ReferenceTarget[];defaultIds:string[];licenseReview:string}
export interface ReferenceCatalog {schemaVersion:1;model:AnatomyModelManifest;systems:ReferenceSystem[];sourceIssues?:{structureId:string;sourceNodeIndex:number;reason:string;layer:string;label:string}[]}
export const NOTE_KEY='ares-reference-notes-v1';
export function registerReferenceCatalog(data:ReferenceCatalog):AnatomyRegistry{
 const registry=new AnatomyRegistry();registry.register(data.model);
 if(data.schemaVersion!==1||data.systems.length<1||data.systems.length>12||new Set(data.systems.map(s=>s.id)).size!==data.systems.length)throw Error('Invalid reference systems');
 for(const system of data.systems){
  if(!system.chunk){if(system.defaultIds.length||system.targets.some(t=>t.nodeIds.length))throw Error('Unavailable system references geometry');continue;}
  const asset=data.model.assets.find(a=>a.id===system.id);
  if(!asset||system.chunk.layer!==system.id||asset.sha256!==system.chunk.sha256||asset.path!==system.chunk.path)throw Error('Mismatched reference asset');
  const nodes=system.chunk.sourceNodes;if(!nodes?.length)throw Error('Missing source mapping');
  const ids=new Set(nodes.map(n=>n.structureId));if(ids.size!==nodes.length)throw Error('Duplicate source identity');
  for(const node of nodes){const structure=registry.structure(data.model.id,node.structureId);
   if(!structure?.meshes.some(r=>r.assetId===system.id&&r.nodeIds.includes(`node:${node.nodeIndex}`)))throw Error('Mismatched reference structure');}
  if(system.defaultIds.some(id=>!ids.has(id))||system.targets.some(t=>t.nodeIds.some(id=>!ids.has(id))))throw Error('Unknown target structure');
 }
 return registry;
}
/** Never adopt untrusted or outdated positions into another revision. */
export function readReferenceNotes(raw:string|null,registry:AnatomyRegistry,modelId:string):AnatomyAnnotation[]{
 if(!raw)return [];const parsed:unknown=JSON.parse(raw);
 if(!Array.isArray(parsed)||parsed.length>500)throw Error('Invalid reference notes');
 const valid=parsed.filter(n=>n&&typeof n.id==='string'&&typeof n.text==='string'&&n.text.length<=2000&&typeof n.modelId==='string'&&typeof n.structureId==='string'&&n.anchor&&typeof n.anchor.assetSha256==='string'&&typeof n.anchor.nodeId==='string'&&Array.isArray(n.anchor.positionM));
 return registry.annotationsForModel(valid,modelId);
}
export const supportedReferenceRegion=(value:string|null)=>
 (['EyeOcularSans','InternalJugularVein','HeartCardioAutonomic','SoleusCalcaneus','BrainVestibularCns'] as const).find(r=>r===value)??null;
