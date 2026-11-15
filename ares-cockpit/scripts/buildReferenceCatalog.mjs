/** Metadata only: original hash-pinned geometry is never modified or re-exported. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,inspectGlb} from './anatomyPipeline.mjs';
const app=resolve(fileURLToPath(new URL('..',import.meta.url)));
const root=join(app,'public/anatomy'),pins=JSON.parse(await readFile(join(root,'MANIFEST.json')));
const inventory=JSON.parse(await readFile(join(app,'../docs/anatomy/SOURCE_INVENTORY.json')));
const definitions=[['skeletal','Skeletal'],['muscular','Muscular'],['cardiovascular','Cardiovascular'],['visceral','Visceral'],['nervous','Nervous']];
const contexts={
 brain:['BrainVestibularCns',[]],spinal_cord:['BrainVestibularCns',[]],vestibular:['BrainVestibularCns',[]],
 eye:['EyeOcularSans',['onsd']],optic_nerve:['EyeOcularSans',['onsd']],vagus:['HeartCardioAutonomic',['hrvRmssd']],
 heart:['HeartCardioAutonomic',['hrvRmssd']],internal_jugular:['InternalJugularVein',['ijvCsa','ijvVelocity','ijvShear']],
 soleus:['SoleusCalcaneus',['aredLoad']],calcaneus:['SoleusCalcaneus',['boneLoss']],
 femur:['SoleusCalcaneus',['sclerostin','boneLoss']],spine:['SoleusCalcaneus',['boneLoss']],pelvis:['SoleusCalcaneus',['boneLoss']],
};
const systems=[],structures=[],assets=[];
for(const [i,file] of pins.files.entries()){
 const [layer,label]=definitions[i],bytes=await readFile(join(root,file.file));
 if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error(`Source hash mismatch: ${file.file}`);
 const doc=inspectGlb(bytes),parents=new Map();
 for(const [index,n] of doc.nodes.entries())for(const child of n.children??[])parents.set(child,index);
 const nearestName=index=>{let at=index;while(at!==undefined){if(doc.nodes[at].name)return doc.nodes[at].name;at=parents.get(at);}return 'Unnamed source';};
 const idFor=index=>`${layer}:node:${index}`,female=new Set();
 const walk=(index,flag=false)=>{const n=doc.nodes[index],excluded=flag||/^VH_F(?:_|$)/.test(n.name??'');if(excluded)female.add(index);for(const c of n.children??[])walk(c,excluded);};
 for(const s of doc.scenes??[])for(const n of s.nodes??[])walk(n);
 const targets=inventory.coverage.filter(c=>c.maleAsset===file.file).map(c=>({id:c.structure,label:c.structure.replaceAll('_',' '),channels:c.structure==='kidneys'?['renalRsr','renalColic','urinaryCalcium']:[],nodeIds:[...new Set(c.male.flatMap(n=>n.descendantMeshNodeIndices))].map(idFor)}));
 const sourceNodes=[];
 for(const [index,n] of doc.nodes.entries())if(n.mesh!==undefined){
  const id=idFor(index),bindings=inventory.coverage.filter(c=>c.maleAsset===file.file&&contexts[c.structure]&&c.male.some(m=>m.descendantMeshNodeIndices.includes(index))).map(c=>({backendRegion:contexts[c.structure][0],relationship:'CONTEXT_ONLY',channels:contexts[c.structure][1]}));
  sourceNodes.push({nodeIndex:index,nodeName:n.name??'',structureId:id,...(female.has(index)?{excluded:true}:{})});
  structures.push({id,label:n.name||`${nearestName(index)} / mesh node ${index}`,sourceConceptId:`${file.sha256}#node:${index}`,laterality:/\.l$/.test(nearestName(index))?'LEFT':/\.r$/.test(nearestName(index))?'RIGHT':'UNSPECIFIED',ontology:null,coverage:'UNVERIFIED',meshes:[{assetId:layer,nodeIds:[`node:${index}`]}],clinicalBindings:bindings,unavailableReason:female.has(index)?'Female-labelled supplement excluded from male reference':null});
 }
 assets.push({id:layer,path:`/anatomy/${file.file}`,sha256:file.sha256,sourceUrl:file.source_url,sourceVersion:pins.source_commit,sourceSex:'UNSPECIFIED',sourceDonorReference:null,license:'CC BY-SA 4.0 declared; subcomponent review unresolved',credit:'Z-Anatomy / BodyParts3D via pernelluvsya/atlas-proto; see ATTRIBUTION.md',adaptations:['None: original pinned GLB, metadata-only indexing'],units:'m',axes:'GLTF_Y_UP_RIGHT_HANDED',sourceToModel:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],registration:{method:'IDENTITY',reviewed:false,report:null},lod:0,pickingMap:null});
 const defaultIds=sourceNodes.filter(n=>!n.excluded&&(layer!=='muscular'||targets.find(t=>t.id==='soleus')?.nodeIds.includes(n.structureId))).map(n=>n.structureId);
 systems.push({id:layer,label,chunk:{path:`/anatomy/${file.file}`,sha256:file.sha256,layer,lod:0,sourceNodes},targets,defaultIds,licenseReview:['visceral','nervous'].includes(layer)?'Subcomponent provenance unresolved (including non-commercial source notices)':'Declared upstream attribution; not individually cleared'});
}
const model={schemaVersion:1,id:'z-anatomy-existing-reference',label:'Existing generic male reference (mixed source; unreviewed)',referenceSex:'UNSPECIFIED',modelUnits:'m',assets,structures};
model.revisionSha256=hash(JSON.stringify({model,systems}));
await writeFile(process.argv[2]??join(root,'reference-catalog.json'),JSON.stringify({schemaVersion:1,model,systems})+'\n');
console.log(`Indexed ${structures.length} source nodes across ${systems.length} systems; original GLBs unchanged`);
