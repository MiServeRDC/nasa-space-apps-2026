import * as THREE from 'three';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeGlb,convertAnatomy,hash} from './anatomyPipeline.mjs';
const app=resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=process.argv[2]?resolve(process.argv[2]):join(app,'public/anatomy/fixture');
await mkdir(out,{recursive:true});
const recipe=[{id:'calibration-left',layer:'core',position:[-.65,0,0],radius:.42},
 {id:'calibration-right',layer:'core',position:[.65,0,0],radius:.42},
 {id:'calibration-cover',layer:'overlay',position:[-.65,0,.55],radius:.22}];
const parts=recipe.map(r=>({structureId:r.id,layer:r.layer,nodeName:r.id,geometry:new THREE.IcosahedronGeometry(r.radius,2).translate(...r.position)}));
const source=await writeGlb(parts,false);for(const p of parts)p.geometry.dispose();
const spec={sourceSha256:hash(source),sourceUrl:'https://github.com/MiServeRDC/nasa-space-apps-2026',license:'CC0-1.0',credit:'ARES contributors; original synthetic calibration solids, not anatomical data',redistributionApproved:true,
 sourceToModel:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],lodRatios:[1,.5],lodMaxRelativeError:.05,
 structures:recipe.map((r,i)=>({id:r.id,layer:r.layer,nodes:[{index:i,name:r.id}]}))};
await writeFile(join(out,'source.glb'),source);await writeFile(join(out,'extraction.json'),JSON.stringify(spec,null,2)+'\n');
const report=await convertAnatomy(source,spec,out);
const chunks=report.artifacts.map(a=>({path:`/anatomy/fixture/${a.file}`,sha256:a.sha256,layer:a.layer,lod:a.lod,compressed:a.compressed}));
const model={schemaVersion:1,id:'ARES_SYNTHETIC_CALIBRATION_V1',label:'Synthetic pipeline fixture (not anatomy)',revisionSha256:hash(JSON.stringify(report)),modelUnits:'m',referenceSex:'UNSPECIFIED',
 assets:report.artifacts.filter(a=>a.compressed).map(a=>({id:a.file,path:`/anatomy/fixture/${a.file}`,sha256:a.sha256,sourceUrl:spec.sourceUrl,sourceVersion:'ARES_FIXTURE_RECIPE_V1',sourceSex:'UNSPECIFIED',sourceDonorReference:null,license:spec.license,credit:spec.credit,adaptations:['Generated spheres, flat reference rendering, explicit Meshopt encoding and per-structure LOD simplification'],units:'m',axes:'GLTF_Y_UP_RIGHT_HANDED',sourceToModel:spec.sourceToModel,registration:{method:'IDENTITY',reviewed:true,report:null},lod:a.lod,pickingMap:null})),
 structures:recipe.map(r=>({id:r.id,label:r.id.replaceAll('-',' '),sourceConceptId:`ARES_FIXTURE:${r.id}`,laterality:r.id.endsWith('left')?'LEFT':r.id.endsWith('right')?'RIGHT':'UNSPECIFIED',ontology:null,coverage:'NATIVE_REFERENCE',
 meshes:report.artifacts.filter(a=>a.compressed&&a.layer===r.layer).map(a=>({assetId:a.file,nodeIds:a.structures.filter(p=>p.id===r.id).map(p=>p.outputNodeName)})),clinicalBindings:[],unavailableReason:null}))};
await writeFile(join(out,'manifest.json'),JSON.stringify({model,chunks},null,2)+'\n');
await writeFile(join(out,'ATTRIBUTION.md'),`# Synthetic calibration fixture\n\n${spec.credit}. Dedicated to the public domain under CC0 1.0.\nSource recipe: ares-cockpit/scripts/buildAnatomyFixture.mjs.\nNo anatomy, sex-specific geometry, clinical measurements or donor data is represented.\nMeshoptimizer: MIT, Arseny Kapoulkine. Three.js: MIT, three.js authors.\nSee the packaged third-party notices and deterministic build/extraction metadata.\n`);
console.log(JSON.stringify(report.artifacts.map(a=>({file:a.file,bytes:a.bytes,triangles:a.triangles})),null,2));

await writeFile(join(out,'THIRD_PARTY_NOTICES.txt'),(await readFile(join(app,'node_modules/three/LICENSE'),'utf8'))+'\n\nMeshoptimizer 0.18.1 / Arseny Kapoulkine\n'+(await readFile(join(app,'node_modules/meshoptimizer/LICENSE.md'),'utf8')));
