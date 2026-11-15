/** Deterministic partial HRA reference. No fitting, simplification or male borrowing. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,inspectGlb,parseGlb,writeGlb,disposeScene} from './anatomyPipeline.mjs';
import {normalizeStaticMesh,geometryBytes} from '../src/anatomy/semanticGeometry.ts';
const app=resolve(fileURLToPath(new URL('..',import.meta.url))),cache=resolve(process.argv[2]??join(homedir(),'.cache/ares-anatomy-phase7')),out=resolve(process.argv[3]??join(app,'public/anatomy/female-hra'));
const lockBytes=await readFile(join(app,'../docs/anatomy/FEMALE_SOURCE_LOCK.json')),lock=JSON.parse(lockBytes),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const layers={skeletal:['VH_F_pelvis','VH_F_vertebra','VH_F_femur_R','VH_F_femur_L'],cardiovascular:['VH_F_heart','VH_F_aorta'],visceral:['VH_F_left_kidney','VH_F_right_kidney','VH_F_lungs'],nervous:['Allen_brain','VH_F_spinal_cord','VH_F_sclera_R','VH_F_sclera_L','VH_F_right_optic_nerve','VH_F_left_optic_nerve'],'pelvis-v15':['VH_F_pubis','VH_F_ischium']};
function binding(name){if(name==='VH_F_heart')return ['HeartCardioAutonomic',['hrvRmssd']];if(/femur|vertebra/.test(name))return ['SoleusCalcaneus',['boneLoss']];if(/brain|spinal_cord/.test(name))return ['BrainVestibularCns',[]];if(/sclera|optic_nerve/.test(name))return ['EyeOcularSans',['onsd']];return null;}
function selectBranches(bytes,doc,roots){
 const keep=new Set(),parents=new Map();for(const [i,n]of doc.nodes.entries())for(const c of n.children??[])parents.set(c,i);
 const descend=i=>{keep.add(i);for(const c of doc.nodes[i].children??[])descend(c);};for(const i of roots){descend(i);let p=parents.get(i);while(p!==undefined){keep.add(p);p=parents.get(p);}}
 const d=structuredClone(doc);for(const n of d.nodes)if(n.children)n.children=n.children.filter(i=>keep.has(i));for(const s of d.scenes)s.nodes=s.nodes.filter(i=>keep.has(i));
 const json=Buffer.from(JSON.stringify(d)),pad=Buffer.alloc((4-json.length%4)%4,32),body=bytes.subarray(20+bytes.readUInt32LE(12)),header=Buffer.alloc(20);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+pad.length+body.length,8);header.writeUInt32LE(json.length+pad.length,12);header.writeUInt32LE(0x4e4f534a,16);return Buffer.concat([header,json,pad,body]);
}
await mkdir(out,{recursive:true});const structures=[],assets=[],systems=[],issues=[],provenance=[],artifacts=[];
for(const source of lock.sources){
 if(hash(await readFile(join(app,'..',source.metadataSnapshot)))!==source.metadataSha256)throw Error('Source metadata snapshot mismatch');
 const bytes=await readFile(join(cache,source.file));if(bytes.length!==source.bytes||hash(bytes)!==source.sha256)throw Error('Immutable female source mismatch');const doc=inspectGlb(bytes),roots=source.selectedRoots;
 for(const r of roots)if(doc.nodes[r.nodeIndex]?.name!==r.nodeName)throw Error('Female source node changed');const gltf=await parseGlb(selectBranches(bytes,doc,roots.map(r=>r.nodeIndex)));
 try{gltf.scene.updateMatrixWorld(true);
 for(const [layer,names]of Object.entries(layers)){
  const selected=roots.filter(r=>names.includes(r.nodeName));if(!selected.length)continue;
  const parts=[],targets=selected.map(r=>({id:r.nodeName,label:r.nodeName,nodeIds:[],channels:r.nodeName.includes('kidney')?['renalRsr','renalColic','urinaryCalcium']:[]})),rootByMesh=new Map();
  const visit=(i,r)=>{if(doc.nodes[i].mesh!==undefined)rootByMesh.set(i,r);for(const c of doc.nodes[i].children??[])visit(c,r);};for(const r of selected)visit(r.nodeIndex,r);
  try{
   gltf.scene.traverse(o=>{
    if(!o.isMesh)return;let at=o,index;while(at){index=gltf.parser.associations.get(at)?.nodes;if(index!==undefined)break;at=at.parent;}const root=rootByMesh.get(index);if(!root)return;
    const assoc=gltf.parser.associations.get(o)??{},primitive=assoc.primitives??0,id=`${source.id}:node:${index}:primitive:${primitive}`,label=doc.nodes[index].name??`Source node ${index}`;
    let geometry;try{geometry=normalizeStaticMesh(o,identity);}catch(error){issues.push({sourceId:source.id,layer,structureId:id,sourceNodeIndex:index,label,reason:String(error)});return;}
    parts.push({structureId:id,layer,nodeName:`${source.id}-node${index}-primitive${primitive}`,geometry});targets.find(t=>t.id===root.nodeName).nodeIds.push(id);
    provenance.push({structureId:id,sourceId:source.id,sourceSha256:source.sha256,sourceNodeIndex:index,sourceNodeName:label,sourceMeshIndex:assoc.meshes??doc.nodes[index].mesh,sourcePrimitiveIndex:primitive,selectedRoot:root});const b=binding(root.nodeName);
    structures.push({id,label,sourceConceptId:`${source.sha256}#node:${index}/primitive:${primitive}`,laterality:/(?:_L$|left)/i.test(label)?'LEFT':/(?:_R$|right)/i.test(label)?'RIGHT':'UNSPECIFIED',ontology:null,coverage:'UNVERIFIED',meshes:[{assetId:layer,nodeIds:[]}],clinicalBindings:b?[{backendRegion:b[0],relationship:'CONTEXT_ONLY',channels:b[1]}]:[],unavailableReason:null});
   });
   if(!parts.length)throw Error(`No valid geometry for ${layer}`);const encoded=await writeGlb(parts,true),file=`${layer}.glb`,sha256=hash(encoded),d=inspectGlb(encoded),path=`/anatomy/female-hra/${file}`,sourceNodes=d.nodes.map((n,i)=>({nodeIndex:i,nodeName:n.name,structureId:n.extras.ares.structureId}));
   for(const n of sourceNodes)structures.find(s=>s.id===n.structureId).meshes[0].nodeIds.push(`node:${n.nodeIndex}`);await writeFile(join(out,file),encoded);artifacts.push({file,bytes:encoded.length,sha256,decodedGeometryBytes:parts.reduce((n,p)=>n+geometryBytes(p.geometry),0)});
   assets.push({id:layer,path,sha256,sourceUrl:source.url,sourceVersion:source.id,sourceSex:layer==='nervous'?'UNSPECIFIED':'FEMALE',sourceDonorReference:`${source.doi}; contributor-specific donor not individually established`,license:'CC BY 4.0',credit:source.credit,adaptations:['Selected source world geometry; materials/UVs removed; local Meshopt; no simplification, fitting or male borrowing'],units:'m',axes:'GLTF_Y_UP_RIGHT_HANDED',sourceToModel:identity,registration:{method:'UNREVIEWED',reviewed:false,report:'/anatomy/female-hra/review.json'},lod:0,pickingMap:null});
   systems.push({id:layer,label:layer==='pelvis-v15'?'Pelvis supplement v1.5 (separate, unregistered frame)':layer[0].toUpperCase()+layer.slice(1),chunk:{path,sha256,layer,lod:0,referenceFrameId:source.id,sourceNodes},targets,defaultIds:parts.map(p=>p.structureId),licenseReview:'CC BY 4.0; source credits/adaptations supplied; anatomical review pending.',coordinateFrame:source.coordinateFrame});
  }finally{for(const p of parts)p.geometry.dispose();}
 }
 }finally{disposeScene(gltf.scene);}
}
for(const [id,label,reason]of [['ijv','Internal jugular vein','Native female IJV not established'],['vagus','Vagus nerve','Native female vagus not established'],['vestibular','Vestibular structures','Required native vestibular coverage not established'],['optic-sheath','Optic nerve sheath','Optic nerve and sclera do not establish optic sheath geometry'],['soleus','Soleus muscle (bilateral)','Original female lower-limb source has not been acquired'],['calcaneus','Calcaneus (bilateral)','Original female lower-limb source has not been acquired']])structures.push({id:`female-missing:${id}`,label,sourceConceptId:`ARES_REQUIRED:${id}`,laterality:'UNSPECIFIED',ontology:null,coverage:'MISSING',meshes:[],clinicalBindings:[],unavailableReason:reason});
systems.splice(1,0,{id:'muscular',label:'Muscular — missing source geometry',chunk:null,targets:[],defaultIds:[],licenseReview:'Denver female lower-limb package not acquired; no substitute geometry',coordinateFrame:'Unavailable'});
const model={schemaVersion:1,id:'hra-female-partial-reference',label:'HRA female partial reference; v1.5 supplement separate',referenceSex:'FEMALE',modelUnits:'m',assets,structures};model.revisionSha256=hash(JSON.stringify({model,systems}));
const review={schemaVersion:1,normalizerSha256:hash(await readFile(new URL('../src/anatomy/semanticGeometry.ts',import.meta.url))),tools:{three:JSON.parse(await readFile(join(app,'node_modules/three/package.json'))).version,meshoptimizer:JSON.parse(await readFile(join(app,'node_modules/meshoptimizer/package.json'))).version},builderSha256:hash(await readFile(fileURLToPath(import.meta.url))),geometryPipelineSha256:hash(await readFile(new URL('./anatomyPipeline.mjs',import.meta.url))),sourceSexCaveat:'Female describes the HRA release. Nervous includes Allen-labelled contributions with contributor donor/sex unverified.',status:'PARTIAL_REFERENCE_NOT_REGISTERED_COMPOSITE',anatomicallyReviewed:false,sourceLockSha256:hash(lockBytes),sources:lock.sources,missing:structures.filter(s=>s.coverage==='MISSING'),issues,registration:{hraV110:'Source world frame retained; no individual or cross-source registration claimed',hraV15:'Separate source frame; no alignment with v1.10 or Denver supplied',denver:'Not acquired; no authored landmarks or transform'},requiredHumanReview:['Verify structures/laterality','Identify independent fit/check landmarks for exact sources','Review correspondence/residuals before composite assembly'],provenance,artifacts};
await writeFile(join(out,'catalog.json'),JSON.stringify({schemaVersion:1,model,systems,sourceIssues:issues})+'\n');await writeFile(join(out,'review.json'),JSON.stringify(review,null,2)+'\n');
await writeFile(join(out,'ATTRIBUTION.md'),`# Partial female reference attribution\n\nHRA / HuBMAP Human Reference Atlas. ${lock.sources.map(s=>`${s.id}: ${s.credit}. [Dataset DOI](${s.doi}), [source](${s.url}).`).join('\n\n')}\n\nGeometry: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Selected source structures; world transforms baked; materials removed; Meshopt compressed. No simplification, anatomical fitting, borrowed male anatomy or endorsement. Exact hashes/primitive provenance: [review.json](review.json).\n\nThe v1.5 supplement stays in a separate frame. Not a registered, reviewed composite or individualized scan. Mandatory missing structures stay explicit.\n`);
console.log(JSON.stringify({structures:structures.length,issues:issues.length,artifacts},null,2));
