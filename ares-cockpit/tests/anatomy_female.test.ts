import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import * as THREE from 'three';
import {pickSemantic} from '../src/anatomy/semanticGeometry.ts';
const app=resolve(import.meta.dirname,'..'),digest=b=>createHash('sha256').update(b).digest('hex');
test('Phase 7: real female reference preserves source, frames, missingness and anchors',async t=>{
 const vite=await createServer({root:app,configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
 try{
 const {AnatomyModelSession}=await vite.ssrLoadModule('/src/anatomy/modelSession.ts');
 const {registerReferenceCatalog,readReferenceNotes}=await vite.ssrLoadModule('/src/anatomy/referenceCatalog.ts');
 const catalog=JSON.parse(await readFile(join(app,'public/anatomy/female-hra/catalog.json'),'utf8')),review=JSON.parse(await readFile(join(app,'public/anatomy/female-hra/review.json'),'utf8'));
 const registry=registerReferenceCatalog(catalog);const male=JSON.parse(await readFile(join(app,'public/anatomy/reference-catalog.json'),'utf8'));registry.register(male.model);const fetcher=async(url:string)=>new Response(await readFile(join(app,'public',url)));
 await t.test('source metadata, builder identity, derivative hashes and missing coverage are explicit',async()=>{
  const lockBytes=await readFile(join(app,'../docs/anatomy/FEMALE_SOURCE_LOCK.json')),lock=JSON.parse(lockBytes);
  assert.equal(digest(lockBytes),review.sourceLockSha256);assert.equal(digest(await readFile(join(app,'scripts/buildFemaleReference.mjs'))),review.builderSha256);
  for(const source of lock.sources){assert.equal(digest(await readFile(join(app,'..',source.metadataSnapshot))),source.metadataSha256);assert.equal(source.referenceSex,'FEMALE');}
  for(const artifact of review.artifacts){const b=await readFile(join(app,'public/anatomy/female-hra',artifact.file));assert.equal(b.length,artifact.bytes);assert.equal(digest(b),artifact.sha256);assert.ok(b.length<=16e6);}
  assert.ok(catalog.model.assets.every(a=>(a.sourceSex==='FEMALE'||a.id==='nervous'&&a.sourceSex==='UNSPECIFIED')&&a.registration.reviewed===false&&a.license==='CC BY 4.0'));
  assert.equal(catalog.model.structures.filter(s=>s.coverage==='MISSING').length,6);assert.equal(catalog.systems.find(s=>s.id==='muscular').chunk,null);
  assert.equal(review.anatomicallyReviewed,false);assert.equal(review.issues.length,49);
  for(const p of review.provenance){assert.ok(lock.sources.some(s=>s.sha256===p.sourceSha256));assert.ok(catalog.model.structures.some(s=>s.id===p.structureId));}
 });
 for(const system of catalog.systems.filter(s=>s.chunk))await t.test(`${system.id}: actual decode, indexed ray and source-bound notes`,async()=>{
  const session=new AnatomyModelSession(undefined,undefined,fetcher),ids=new Set(system.chunk.sourceNodes.map(n=>n.structureId));
  try{await session.load([system.chunk],ids,new Set(system.defaultIds));assert.ok(session.stats.decodedGeometryBytes<64e6);assert.equal(session.issues.length,0);assert.equal(session.batches.length,1);
   console.log(`Female ${system.id}: ${session.loadedIds.size} nodes; ${session.stats.decodedGeometryBytes} owned bytes`);
   const id=system.defaultIds[0];session.setVisible(new Set([id]));const batch=session.batches[0],g=batch.mesh.geometry,p=g.getAttribute('position'),ix=g.index;
   const [a,b,c]=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i))),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),center=a.clone().add(b).add(c).multiplyScalar(1/3);
   const hit=pickSemantic(session.batches,new THREE.Raycaster(center.clone().addScaledVector(normal,.000001),normal.clone().negate()));assert.equal(hit?.structureId,id);assert.equal(hit.assetSha256,system.chunk.sha256);
   const note={id:'female-note',modelId:catalog.model.id,modelRevision:catalog.model.revisionSha256,structureId:id,text:'Female reference only',anchor:{assetSha256:hit.assetSha256,nodeId:hit.nodeId,positionM:hit.point.toArray()}};
   assert.equal(readReferenceNotes(JSON.stringify([note]),registry,catalog.model.id).length,1);
   assert.equal(readReferenceNotes(JSON.stringify([note]),registry,male.model.id).length,0);assert.equal(registry.switchModel({modelId:catalog.model.id,structureId:id},male.model.id),null);
   session.unload();assert.equal(session.stats.geometries,0);
  }finally{session.close();}
 });
 await t.test('v1.5 supplement cannot be silently combined with v1.10',async()=>{
  const a=catalog.systems.find(s=>s.id==='skeletal'),b=catalog.systems.find(s=>s.id==='pelvis-v15'),session=new AnatomyModelSession(undefined,undefined,fetcher);
  await assert.rejects(()=>session.load([a.chunk,b.chunk],new Set([...a.defaultIds,...b.defaultIds]),new Set()),/Unregistered reference frames/);assert.equal(session.stats.geometries,0);
  await assert.rejects(()=>session.load([a.chunk,male.systems.find(s=>s.id==='cardiovascular').chunk],new Set(),new Set()),/Unregistered reference frames/);session.close();
 });
 }finally{await vite.close();}
});
