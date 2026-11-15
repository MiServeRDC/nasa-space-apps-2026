import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createServer} from 'vite';
import * as THREE from 'three';
import {pickSemantic} from '../src/anatomy/semanticGeometry.ts';
const app=resolve(import.meta.dirname,'..');
test('Phase 6: pinned real atlas, exact source ownership and bounded display',async t=>{
 const vite=await createServer({root:app,configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
 try{
 const {AnatomyModelSession}=await vite.ssrLoadModule('/src/anatomy/modelSession.ts');
 const {registerReferenceCatalog,readReferenceNotes,supportedReferenceRegion}=await vite.ssrLoadModule('/src/anatomy/referenceCatalog.ts');
 const catalog=JSON.parse(await readFile(join(app,'public/anatomy/reference-catalog.json'),'utf8'));
 const registry=registerReferenceCatalog(catalog);
 const fetcher=async(url:string)=>new Response(await readFile(join(app,'public',url)));
 const ids=(s)=>new Set(s.chunk.sourceNodes.map(n=>n.structureId));
 await t.test('metadata catalog regenerates byte-for-byte without changing geometry',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ares-reference-catalog-'));
  try{const path=join(dir,'catalog.json'),result=spawnSync(process.execPath,['--experimental-strip-types','scripts/buildReferenceCatalog.mjs',path],{cwd:app,encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);assert.equal(await readFile(path,'utf8'),await readFile(join(app,'public/anatomy/reference-catalog.json'),'utf8'));
  }finally{await rm(dir,{force:true,recursive:true});}
 });
 for(const system of catalog.systems)await t.test(`${system.id}: real decode, source indices, ray identity, quarantine, unload`,async()=>{
  const session=new AnatomyModelSession(undefined,undefined,fetcher);
  await session.load([system.chunk],ids(system),new Set(system.defaultIds));
  console.log(`${system.id}: ${session.loadedIds.size} usable nodes, ${session.issues.length} part issues, ${session.stats.decodedGeometryBytes} owned bytes`);
  assert.ok(session.loadedIds.size>0);assert.ok(session.stats.decodedGeometryBytes<=64e6);assert.equal(session.stats.batches,1);
  for(const node of system.chunk.sourceNodes.filter(n=>n.excluded)){assert.ok(!session.loadedIds.has(node.structureId));assert.ok(session.issues.some(i=>i.structureId===node.structureId));}
  for(const batch of session.batches){assert.ok(batch.mesh.geometry.index);assert.equal(batch.ranges.at(-1).end,batch.mesh.geometry.index.count/3);}
  // Isolate each named required target's first actually valid source node. Cast a ray
  // at an actual triangle centroid/normal; this checks lookup through multi-primitive batches.
  for(const target of system.targets){const id=target.nodeIds.find(id=>session.loadedIds.has(id));if(!id)continue;
   session.setVisible(new Set([id]));const batch=session.batches[0],g=batch.mesh.geometry,p=g.getAttribute('position'),index=g.index;
   const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(0)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(2));
   const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),center=a.clone().add(b).add(c).multiplyScalar(1/3);
   const ray=new THREE.Raycaster(center.clone().addScaledVector(normal,.00001),normal.clone().negate());
   const hit=pickSemantic(session.batches,ray);assert.equal(hit?.structureId,id);assert.equal(hit.assetSha256,system.chunk.sha256);
   const node=system.chunk.sourceNodes.find(n=>n.structureId===id);assert.equal(hit.nodeId,`node:${node.nodeIndex}`);
   const note={id:'n',modelId:catalog.model.id,modelRevision:catalog.model.revisionSha256,structureId:id,text:'Reference only',anchor:{assetSha256:hit.assetSha256,nodeId:hit.nodeId,positionM:hit.point.toArray()}};
   assert.equal(readReferenceNotes(JSON.stringify([note]),registry,catalog.model.id).length,1);
   assert.equal(readReferenceNotes(JSON.stringify([{...note,modelRevision:'f'.repeat(64)}]),registry,catalog.model.id).length,0);
   assert.equal(readReferenceNotes(JSON.stringify([{...note,anchor:{...note.anchor,nodeId:'node:999999'}}]),registry,catalog.model.id).length,0);
  }
  session.unload();assert.equal(session.stats.decodedGeometryBytes,0);assert.equal(session.stats.geometries,0);assert.equal(session.issues.length,0);session.close();
 });
 await t.test('muscle show-all fails explicitly and retains prior visible geometry',async()=>{
  const s=catalog.systems.find(s=>s.id==='muscular'),session=new AnatomyModelSession(undefined,undefined,fetcher);
  try{await session.load([s.chunk],ids(s),new Set(s.defaultIds));const prior=session.batches[0];assert.throws(()=>session.setVisible(ids(s)),/budget/);assert.equal(session.batches[0],prior);assert.ok(session.stats.decodedGeometryBytes<64e6);}finally{session.close();}
 });
 await t.test('clinical adapter never fills missing HRV or replaces a measured zero',async()=>{
  const {buildClinicalViewModel}=await vite.ssrLoadModule('/src/lib/clinicalViewModel.ts');
  const {buildPacket,DEFAULT_WHATIF}=await vite.ssrLoadModule('/src/lib/scenario.ts');
  const packet=buildPacket(DEFAULT_WHATIF,0,null,0);packet.is_local_simulation=false;packet.provenance_manifest.biometrics_source='RECORDED_TERRESTRIAL_BIDMC_CSV';
  for(const missing of [null,undefined,NaN]){packet.biometrics.hrv_rmssd_ms=missing;assert.equal(buildClinicalViewModel(packet).hrvRmssd.value,null);}
  packet.biometrics.hrv_rmssd_ms=0;const metric=buildClinicalViewModel(packet).hrvRmssd;assert.equal(metric.value,0);assert.equal(metric.unit,'ms');assert.equal(metric.provenance,'RECORDED_TERRESTRIAL_BIDMC_CSV');
 });
 await t.test('source mapping edits fail before geometry can be published',async()=>{
  const system=catalog.systems[0],bad=structuredClone(system.chunk);bad.sourceNodes[0].nodeName='invented';
  const session=new AnatomyModelSession(undefined,undefined,fetcher);await assert.rejects(()=>session.load([bad],ids(system),new Set(system.defaultIds)),/mapping/);assert.equal(session.stats.geometries,0);session.close();
  const changed=structuredClone(catalog);changed.systems[0].targets[0].nodeIds.push('fabricated');assert.throws(()=>registerReferenceCatalog(changed),/Unknown target/);
 });
 await t.test('clinical contexts preserve IJV/external jugular and missing sheath distinctions',()=>{
  const c=catalog.systems.find(s=>s.id==='cardiovascular'),ijv=c.targets.find(t=>t.id==='internal_jugular');
  assert.equal(ijv.nodeIds.length,26); // Exact source groups include tributaries and unnamed primary segments.
  for(const id of ijv.nodeIds)assert.ok(catalog.model.structures.find(s=>s.id===id).clinicalBindings.some(b=>b.backendRegion==='InternalJugularVein'));
  for(const node of c.chunk.sourceNodes.filter(n=>n.nodeName.startsWith('External jugular'))){assert.ok(!ijv.nodeIds.includes(node.structureId));assert.equal(catalog.model.structures.find(s=>s.id===node.structureId).clinicalBindings.length,0);}
  const n=catalog.systems.find(s=>s.id==='nervous');assert.equal(n.targets.find(t=>t.id==='optic_sheath').nodeIds.length,0);assert.equal(n.targets.find(t=>t.id==='optic_nerve').nodeIds.length,2);
  for(const id of catalog.systems.find(s=>s.id==='visceral').targets.find(t=>t.id==='kidneys').nodeIds)assert.equal(catalog.model.structures.find(s=>s.id===id).clinicalBindings.length,0);
  assert.equal(supportedReferenceRegion('Kidney'),null);assert.equal(supportedReferenceRegion('InternalJugularVein'),'InternalJugularVein');
  assert.throws(()=>readReferenceNotes('garbage',registry,catalog.model.id));assert.throws(()=>readReferenceNotes('{}',registry,catalog.model.id));
 });
 }finally{await vite.close();}
});
