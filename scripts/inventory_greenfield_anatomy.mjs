// Offline inventory of pinned local GLBs. Decodes Meshopt buffer views, without a renderer.
// npm ci must first have completed in ares-cockpit/. JSON goes to stdout; keep reports outside git.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {MeshoptDecoder}=await import(pathToFileURL(join(root,'ares-cockpit/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js')));
await MeshoptDecoder.ready;
const base=join(root,'ares-cockpit/public/anatomy');
const manifest=JSON.parse(await readFile(join(base,'MANIFEST.json'),'utf8'));
const files=[];
for(const entry of manifest.files){
 const bytes=await readFile(join(base,entry.file));
 const sha256=createHash('sha256').update(bytes).digest('hex');
 assert.equal(sha256,entry.sha256,`${entry.file} manifest hash`);assert.equal(bytes.length,entry.bytes);
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
 const jsonLength=bytes.readUInt32LE(12);const doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const binOffset=20+jsonLength+8;const bin=bytes.subarray(binOffset);
 let decodedMeshoptBytes=0;
 for(const view of doc.bufferViews??[]){
  const ext=view.extensions?.EXT_meshopt_compression;if(!ext)continue;
  assert.equal(ext.buffer,0,'inventory supports embedded GLB buffers only');
  const decoded=new Uint8Array(ext.count*ext.byteStride);
  MeshoptDecoder.decodeGltfBuffer(decoded,ext.count,ext.byteStride,bin.subarray(ext.byteOffset??0,(ext.byteOffset??0)+ext.byteLength),ext.mode,ext.filter);
  assert.equal(decoded.byteLength,view.byteLength);decodedMeshoptBytes+=decoded.byteLength;
 }
 const primitives=(doc.meshes??[]).flatMap(m=>m.primitives);
 files.push({file:entry.file,sha256,bytes:bytes.length,meshes:doc.meshes.length,primitives:primitives.length,
  vertices:primitives.reduce((n,p)=>n+doc.accessors[p.attributes.POSITION].count,0),
  triangles:primitives.reduce((n,p)=>n+((p.mode??4)===4&&p.indices!==undefined?doc.accessors[p.indices].count/3:0),0),
  decodedMeshoptBytes,extensions:doc.extensionsRequired??[]});
}
console.log(JSON.stringify({sourceCommit:manifest.source_commit,license:manifest.geometry_license,files},null,2));
