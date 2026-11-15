import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {createServer} from 'vite';
import {normalizeStaticMesh,buildSemanticBatches,pickSemantic,disposeBatches,validateTriangles} from '../src/anatomy/semanticGeometry.ts';
import {hash,parseGlb,disposeScene,convertAnatomy,inspectGlb} from '../scripts/anatomyPipeline.mjs';
const app=resolve(import.meta.dirname,'..'),fixture=join(app,'public/anatomy/fixture');
test('Phase 5: real geometry identity, compression, LOD, picking and ownership',async t=>{
 const vite=await createServer({root:app,configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
 try{
 const {AnatomyModelSession}=await vite.ssrLoadModule('/src/anatomy/modelSession.ts');
 const catalog=JSON.parse(await readFile(join(fixture,'manifest.json'),'utf8'));
 const ids=new Set(catalog.model.structures.map(s=>s.id));
 const chunks=(lod=0,compressed=true)=>catalog.chunks.filter(c=>c.lod===lod&&c.compressed===compressed);
 const fetcher=async(url:string)=>{try{const b=await readFile(join(app,'public',url));return new Response(b,{headers:{'content-length':String(b.length)}});}catch{return new Response(null,{status:404});}};
 const ray=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,0,3),new THREE.Vector3(0,0,-1));
 await t.test('deterministic fixture regeneration retains every artifact hash',async()=>{
  const out=await mkdtemp(join(tmpdir(),'ares-anatomy-rebuild-'));
  try{const result=spawnSync(process.execPath,['--experimental-strip-types','scripts/buildAnatomyFixture.mjs',out],{cwd:app,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
   const original=JSON.parse(await readFile(join(fixture,'build.json'),'utf8')),rebuilt=JSON.parse(await readFile(join(out,'build.json'),'utf8'));
   assert.deepEqual(rebuilt,original);
   assert.equal(hash(await readFile(join(out,'manifest.json'))),hash(await readFile(join(fixture,'manifest.json'))));
  }finally{await rm(out,{recursive:true,force:true});}
 });
 await t.test('plain and Meshopt actually decode identically; both LODs retain IDs',async()=>{
  for(const lod of [0,1]){const positions=[];
   for(const compressed of [false,true]){
    const filename=chunks(lod,compressed).find(c=>c.layer==='core').path.split('/').at(-1);
    const gltf=await parseGlb(await readFile(join(fixture,filename)));const tags=[],vertices=[];
    gltf.scene.traverse(o=>{if(o.isMesh){tags.push(o.userData.ares.structureId);vertices.push([...o.geometry.getAttribute('position').array]);}});
    assert.deepEqual(tags,['calibration-left','calibration-right']);positions.push(vertices);disposeScene(gltf.scene);
   }assert.deepEqual(positions[0],positions[1]);
  }
 });
 await t.test('reflection corrects winding/normals; coordinate conversion never mutates source',()=>{
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1000,0,0,0,1000,0],3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry);mesh.position.set(1000,0,0);const original=[...geometry.getAttribute('position').array];
  const converted=normalizeStaticMesh(mesh,[-.001,0,0,0,0,.001,0,0,0,0,.001,0,0,0,0,1]);
  converted.computeBoundingBox();assert.equal(converted.boundingBox.min.x,-2);assert.equal(converted.boundingBox.max.x,-1);assert.equal(converted.boundingBox.max.y,1);
  const p=converted.getAttribute('position'),ix=converted.index;const vertices=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i)));
  const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
  assert.ok(normal.dot(new THREE.Vector3().fromBufferAttribute(converted.getAttribute('normal'),ix.getX(0)))>0);
  assert.deepEqual([...geometry.getAttribute('position').array],original);converted.dispose();geometry.dispose();
 });
 await t.test('interleaved and normalized integer attributes are materialized before transformation',()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Int16BufferAttribute([0,0,0,32767,0,0,0,32767,0],3,true));
  const interleaved=new THREE.InterleavedBuffer(new Float32Array([9,0,0,1,9,0,0,1,9,0,0,1]),4);
  g.setAttribute('normal',new THREE.InterleavedBufferAttribute(interleaved,3,1));
  const result=normalizeStaticMesh(new THREE.Mesh(g),[.5,0,0,0,0,.5,0,0,0,0,.5,0,0,0,0,1]);
  assert.equal(result.getAttribute('position').getX(1),.5);assert.equal(result.getAttribute('normal').array.length,9);
  assert.ok(result.getAttribute('position').array instanceof Float32Array);result.dispose();g.dispose();
 });
 await t.test('anchored annotations require exact model revision, asset and output node',async()=>{
  const {AnatomyRegistry}=await vite.ssrLoadModule('/src/anatomy/registry.ts');const r=new AnatomyRegistry();r.register(catalog.model);
  const structure=catalog.model.structures[0],ref=structure.meshes[0],asset=catalog.model.assets.find(a=>a.id===ref.assetId);
  const note={id:'note',modelId:catalog.model.id,structureId:structure.id,text:'Fixture only',modelRevision:catalog.model.revisionSha256,
   anchor:{assetSha256:asset.sha256,nodeId:ref.nodeIds[0],positionM:[0,0,0]}};
  assert.equal(r.annotationsForModel([note],catalog.model.id).length,1);
  assert.equal(r.annotationsForModel([{...note,modelRevision:'0'.repeat(64)}],catalog.model.id).length,0);
  assert.equal(r.annotationsForModel([{...note,anchor:{...note.anchor,nodeId:'wrong-node'}}],catalog.model.id).length,0);
 });
 await t.test('invalid coordinates, degeneracy and singular transforms fail closed',()=>{
  const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0,0,0,0],3));g.computeVertexNormals();assert.throws(()=>validateTriangles(g));
  assert.throws(()=>normalizeStaticMesh(new THREE.Mesh(g),Array(16).fill(0)));g.dispose();
 });
 await t.test('actual rays resolve semantic identities after batching and LOD, ignoring hidden cover',async()=>{
  const session=new AnatomyModelSession(undefined,undefined,fetcher);
  for(const lod of [0,1]){await session.load(chunks(lod),ids,ids);
   assert.equal(session.stats.batches,2);assert.equal(pickSemantic(session.batches,ray(-.65))?.structureId,'calibration-cover');
   assert.equal(pickSemantic(session.batches,ray(.65))?.structureId,'calibration-right');
   session.setVisible(new Set(['calibration-left','calibration-right']));
   assert.equal(session.stats.batches,1);assert.equal(pickSemantic(session.batches,ray(-.65))?.structureId,'calibration-left');
   session.batches[0].mesh.visible=false;assert.equal(pickSemantic(session.batches,ray(.65)),null);
  }session.close();assert.equal(session.stats.geometries,0);assert.equal(session.stats.materials,0);
 });
 await t.test('repeated switches retain bounded owned resources and clear on unload',async()=>{
  const session=new AnatomyModelSession(undefined,undefined,fetcher);
  for(let i=0;i<12;i++){await session.load(chunks(i%2,i%3!==0),ids,ids);assert.equal(session.stats.geometries,5);assert.equal(session.stats.materials,2);}
  session.unload();assert.equal(session.stats.decodedGeometryBytes,0);session.close();await assert.rejects(session.load(chunks(),ids,ids),/closed/);
 });
 await t.test('late obsolete fetch cannot overwrite a newer LOD',async()=>{
  let release:()=>void;const barrier=new Promise<void>(r=>{release=r;});let first=true;
  const session=new AnatomyModelSession(undefined,undefined,async(url:string,...args)=>{if(first){first=false;await barrier;}return fetcher(url,...args);});
  const old=session.load(chunks(0),ids,ids).catch(e=>e.name);
  await new Promise(r=>setTimeout(r,0));const latest=session.load(chunks(1),ids,ids);
  release();await latest;assert.equal(await old,'AbortError');assert.equal(session.stats.geometries,5);session.close();
 });
 await t.test('missing codec, hash mismatch, missing file and caller abort leave no owned geometry',async()=>{
  const noCodec=new AnatomyModelSession(undefined,null,fetcher);await assert.rejects(noCodec.load(chunks(),ids,ids),/decoder unavailable/);assert.equal(noCodec.stats.geometries,0);noCodec.close();
  const session=new AnatomyModelSession(undefined,undefined,fetcher);
  await assert.rejects(session.load([{...chunks()[0],sha256:'0'.repeat(64)}],ids,ids),/hash mismatch/);
  await assert.rejects(session.load([chunks()[0],{...chunks()[1],path:'/anatomy/fixture/missing.glb'}],ids,ids),/unavailable/);
  const c=new AbortController();c.abort();await assert.rejects(session.load(chunks(),ids,ids,c.signal),e=>e.name==='AbortError');
  assert.equal(session.stats.geometries,0);session.close();
 });
 await t.test('late real Meshopt decode is disposed rather than published after switching',async()=>{
  const {MeshoptDecoder}=await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  let release:()=>void,started:()=>void;const gate=new Promise<void>(r=>release=r),began=new Promise<void>(r=>started=r);
  const decoder={...MeshoptDecoder,decodeGltfBufferAsync:async(...args)=>{started();await gate;return MeshoptDecoder.decodeGltfBufferAsync(...args);}};
  const session=new AnatomyModelSession(undefined,decoder,fetcher);
  const old=session.load(chunks(0,true),ids,ids).catch(e=>e.name);await began;
  let published=false;const latest=session.load(chunks(1,false),ids,ids).then(()=>{published=true;});
  await new Promise(r=>setTimeout(r,0));assert.equal(published,false,'late decode must hold the bounded decode slot');
  release();await latest;assert.equal(await old,'AbortError');assert.equal(session.stats.geometries,5);session.close();
 });
 await t.test('file/decoded budgets reject before publishing and visibility rebuild stays bounded',async()=>{
  const smallFile=new AnatomyModelSession({maxFileBytes:100,maxDecodedBytes:10000,maxMeshCount:20},undefined,fetcher);
  await assert.rejects(smallFile.load(chunks(),ids,ids),/file budget exceeded/);assert.equal(smallFile.stats.geometries,0);smallFile.close();
  const smallGeometry=new AnatomyModelSession({maxFileBytes:20000,maxDecodedBytes:100,maxMeshCount:20},undefined,fetcher);
  await assert.rejects(smallGeometry.load(chunks(),ids,ids),/budget exceeded/);assert.equal(smallGeometry.stats.geometries,0);smallGeometry.close();
  const limited=new AnatomyModelSession({maxFileBytes:20000,maxDecodedBytes:20000,maxMeshCount:20},undefined,fetcher);
  await limited.load(chunks(),ids,new Set());assert.equal(limited.stats.batches,0);
  assert.throws(()=>limited.setVisible(ids),/budget exceeded/);assert.equal(limited.stats.batches,0);limited.close();
 });
 await t.test('external resources and unsupported codecs are rejected before secondary requests',async()=>{
  const original=await readFile(join(fixture,'core-lod0.glb'));
  for(const mutate of [doc=>{doc.buffers[0].uri='https://example.org/remote.bin';},doc=>{doc.extensionsRequired=['KHR_draco_mesh_compression'];}]){
   const doc=inspectGlb(original);mutate(doc);const text=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
   const tail=original.subarray(20+original.readUInt32LE(12)),header=Buffer.from(original.subarray(0,20));header.writeUInt32LE(20+json.length+tail.length,8);header.writeUInt32LE(json.length,12);
   const changed=Buffer.concat([header,json,tail]),requests=[];
   const session=new AnatomyModelSession(undefined,undefined,async url=>{requests.push(url);return new Response(changed);});
   await assert.rejects(session.load([{...chunks(0,false)[0],sha256:hash(changed)}],ids,ids),/embedded|Unsupported/);
   assert.equal(requests.length,1);assert.equal(session.stats.geometries,0);session.close();
  }
 });
 await t.test('source extraction requires the pinned hash and exact source node identity',async()=>{
  const source=await readFile(join(fixture,'source.glb')),spec=JSON.parse(await readFile(join(fixture,'extraction.json'),'utf8'));
  await assert.rejects(convertAnatomy(source,{...spec,sourceSha256:'0'.repeat(64)},'/tmp/ares-unused'),/hash mismatch/);
  const wrong=structuredClone(spec);wrong.structures[0].nodes[0].name='different mesh';
  await assert.rejects(convertAnatomy(source,wrong,'/tmp/ares-unused'),/identity changed/);
  assert.equal(hash(source),spec.sourceSha256);assert.throws(()=>inspectGlb(Buffer.from('<!DOCTYPE html>')));
 });
 }finally{await vite.close();}
});
