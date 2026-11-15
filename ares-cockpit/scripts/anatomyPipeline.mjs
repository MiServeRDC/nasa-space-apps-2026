import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizeStaticMesh,geometryBytes,validateTriangles} from '../src/anatomy/semanticGeometry.ts';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const optimizerVersion=JSON.parse(await readFile(new URL('../node_modules/meshoptimizer/package.json',import.meta.url),'utf8')).version;
const pipelineSha256=hash(Buffer.concat([await readFile(new URL('./anatomyPipeline.mjs',import.meta.url)),await readFile(new URL('../src/anatomy/semanticGeometry.ts',import.meta.url))]));
export function inspectGlb(buffer){
 const data=new DataView(buffer.buffer??buffer,buffer.byteOffset??0,buffer.byteLength);
 if(data.byteLength<20||data.getUint32(0,true)!==0x46546c67||data.getUint32(4,true)!==2||data.getUint32(8,true)!==data.byteLength||data.getUint32(16,true)!==0x4e4f534a)throw Error('Invalid GLB header');
 const size=data.getUint32(12,true);if(size>data.byteLength-20)throw Error('Truncated JSON');
 const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(data.buffer,data.byteOffset+20,size)));
 if((doc.buffers??[]).some(b=>b.uri)||doc.images?.length)throw Error('External or textured resources unsupported');
 for(const ext of doc.extensionsRequired??[])if(!['EXT_meshopt_compression','KHR_mesh_quantization'].includes(ext))throw Error(`Unsupported extension: ${ext}`);
 return doc;
}
export async function parseGlb(bytes){
 inspectGlb(bytes);await MeshoptDecoder.ready;
 return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
export function disposeScene(scene){
 const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m)materials.add(m);});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.clear();
}
/** Minimal deterministic static-triangle writer. Semantic/source identities live on each node. */
export async function writeGlb(parts,compressed=false){
 await MeshoptEncoder.ready;
 const views=[],accessors=[],meshes=[],nodes=[],chunks=[];let offset=0,decodedOffset=0;
 const append=(array,itemSize,componentType,type,target)=>{
  const raw=new Uint8Array(array.buffer,array.byteOffset,array.byteLength),count=array.length/itemSize;
  const bytes=compressed?MeshoptEncoder.encodeGltfBuffer(raw,count,array.BYTES_PER_ELEMENT*itemSize,target===34963?'TRIANGLES':'ATTRIBUTES'):raw;
  const view={buffer:compressed?1:0,byteOffset:compressed?decodedOffset:offset,byteLength:raw.length,target};
  if(target===34962)view.byteStride=itemSize*array.BYTES_PER_ELEMENT;
  if(compressed)view.extensions={EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:bytes.length,byteStride:itemSize*array.BYTES_PER_ELEMENT,count,mode:target===34963?'TRIANGLES':'ATTRIBUTES',filter:'NONE'}};
  const padding=(4-bytes.length%4)%4;chunks.push(Buffer.from(bytes),Buffer.alloc(padding));offset+=bytes.length+padding;decodedOffset+=raw.length;
  views.push(view);const a={bufferView:views.length-1,componentType,count,type};
  if(type==='VEC3'&&target===34962){a.min=[0,1,2].map(k=>{let m=Infinity;for(let i=k;i<array.length;i+=3)m=Math.min(m,array[i]);return m;});a.max=[0,1,2].map(k=>{let m=-Infinity;for(let i=k;i<array.length;i+=3)m=Math.max(m,array[i]);return m;});}
  accessors.push(a);return accessors.length-1;
 };
 for(const part of parts){
  const g=part.geometry;validateTriangles(g);
  const position=new Float32Array(g.getAttribute('position').array),normal=new Float32Array(g.getAttribute('normal').array);
  const indices=g.index?Uint32Array.from(g.index.array):Uint32Array.from({length:position.length/3},(_,i)=>i);
  const p=append(position,3,5126,'VEC3',34962),n=append(normal,3,5126,'VEC3',34962),ix=append(indices,1,5125,'SCALAR',34963);
  nodes.push({name:part.nodeName??part.structureId,mesh:meshes.length,extras:{ares:{structureId:part.structureId,layer:part.layer,sourceNodeIndex:part.sourceNodeIndex??null,sourceNodeName:part.sourceNodeName??null,sourceMeshIndex:part.sourceMeshIndex??null,sourcePrimitiveIndex:part.sourcePrimitiveIndex??null,selectedRootIndex:part.selectedRootIndex??null}}});
  meshes.push({primitives:[{attributes:{POSITION:p,NORMAL:n},indices:ix,mode:4}]});
 }
 const bin=Buffer.concat(chunks),buffers=[{byteLength:bin.length}];
 if(compressed)buffers.push({byteLength:decodedOffset,extensions:{EXT_meshopt_compression:{fallback:true}}});
 const doc={asset:{version:'2.0',generator:'ARES static anatomy pipeline v1'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,accessors,bufferViews:views,buffers};
 if(compressed){doc.extensionsUsed=['EXT_meshopt_compression'];doc.extensionsRequired=['EXT_meshopt_compression'];}
 const rawJson=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([rawJson,Buffer.alloc((4-rawJson.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bh,bin]);
}
function exactIndex(g){
 const position=g.getAttribute('position'),normal=g.getAttribute('normal'),keys=new Map(),positions=[],normals=[],indices=[];
 const count=g.index?.count??position.count;
 for(let k=0;k<count;k++){const i=g.index?g.index.getX(k):k;
  const p=[position.getX(i),position.getY(i),position.getZ(i)],n=[normal.getX(i),normal.getY(i),normal.getZ(i)],key=[...p,...n].join(',');
  let index=keys.get(key);if(index===undefined){index=positions.length/3;keys.set(key,index);positions.push(...p);normals.push(...n);}indices.push(index);
 }
 g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices);return g;
}
export async function convertAnatomy(sourceBytes,spec,out){
 if(!Array.isArray(spec.lodRatios)||!spec.lodRatios.length||!Number.isFinite(spec.lodMaxRelativeError)||spec.lodMaxRelativeError<0||spec.lodMaxRelativeError>1)throw Error('Invalid authored LOD policy');
 if(hash(sourceBytes)!==spec.sourceSha256)throw Error('Source hash mismatch');
 if(!spec.credit||!spec.license||!spec.sourceUrl||spec.redistributionApproved!==true)throw Error('Missing source/reuse evidence');
 const doc=inspectGlb(sourceBytes),gltf=await parseGlb(sourceBytes),parts=[];const owned=new Set();
 try{
  const structures=new Set();
  for(const selection of spec.structures){
   if(!selection.id||structures.has(selection.id))throw Error('Duplicate structure');structures.add(selection.id);
   for(const selected of selection.nodes){
    if(doc.nodes[selected.index]?.name!==selected.name)throw Error('Source node identity changed');
    let root;gltf.scene.traverse(o=>{if(gltf.parser.associations.get(o)?.nodes===selected.index)root=o;});
    if(!root)throw Error('Source node unavailable');
    root.traverse(o=>{if(o.isMesh){if(owned.has(o.uuid))throw Error('Overlapping source ownership');owned.add(o.uuid);
      const association=gltf.parser.associations.get(o)??{};
      const sourceNodeIndex=association.nodes??selected.index,sourceMeshIndex=association.meshes??null,sourcePrimitiveIndex=association.primitives??null;
      parts.push({structureId:selection.id,layer:selection.layer,sourceNodeIndex,sourceNodeName:doc.nodes[sourceNodeIndex]?.name??selected.name,
       sourceMeshIndex,sourcePrimitiveIndex,selectedRootIndex:selected.index,
       nodeName:`${selection.id}-node${sourceNodeIndex}-mesh${sourceMeshIndex}-primitive${sourcePrimitiveIndex}`,
       geometry:normalizeStaticMesh(o,spec.sourceToModel)});}});
   }
   if(!parts.some(p=>p.structureId===selection.id))throw Error('Structure has no geometry');
  }
  await mkdir(out,{recursive:true});await MeshoptSimplifier.ready;
  const artifacts=[],outputs=[];
  for(let lod=0;lod<spec.lodRatios.length;lod++){
   const ratio=spec.lodRatios[lod];if(!(ratio>0&&ratio<=1))throw Error('Invalid LOD ratio');
   const reduced=parts.map(p=>{const g=exactIndex(p.geometry.clone());let error=0;
    if(ratio<1){const ix=g.index?Uint32Array.from(g.index.array):Uint32Array.from({length:g.getAttribute('position').count},(_,i)=>i);
     const [indices,e]=MeshoptSimplifier.simplify(ix,new Float32Array(g.getAttribute('position').array),3,Math.max(3,Math.floor(ix.length*ratio/3)*3),spec.lodMaxRelativeError);
     g.setIndex(new THREE.BufferAttribute(indices,1));g.computeVertexNormals();exactIndex(g);error=e;}
    return {...p,geometry:g,simplifierRelativeError:error};});
   try{
    const layers=[...new Set(reduced.map(p=>p.layer))];
    for(const layer of layers){if(!/^[a-z0-9-]+$/.test(layer))throw Error('Invalid layer ID');const selected=reduced.filter(p=>p.layer===layer);
     for(const compressed of [false,true]){const bytes=await writeGlb(selected,compressed),file=`${layer}-lod${lod}${compressed?'-meshopt':''}.glb`;
      outputs.push({file,bytes});artifacts.push({file,layer,lod,compressed,sha256:hash(bytes),bytes:bytes.length,
       decodedGeometryBytes:selected.reduce((n,p)=>n+geometryBytes(p.geometry),0),triangles:selected.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.getAttribute('position').count)/3,0),
       structures:selected.map(p=>({id:p.structureId,sourceNodeIndex:p.sourceNodeIndex,sourceNodeName:p.sourceNodeName,sourceMeshIndex:p.sourceMeshIndex,sourcePrimitiveIndex:p.sourcePrimitiveIndex,selectedRootIndex:p.selectedRootIndex,outputNodeName:p.nodeName,simplifierRelativeError:p.simplifierRelativeError}))});}
    }
   } finally{for(const p of reduced)p.geometry.dispose();}
  }
  const report={schemaVersion:1,pipeline:'ARES_STATIC_ANATOMY_V1',pipelineSha256,tools:{three:THREE.REVISION,meshoptimizer:optimizerVersion},sourceSha256:spec.sourceSha256,sourceToModel:spec.sourceToModel,credit:spec.credit,license:spec.license,sourceUrl:spec.sourceUrl,lodRatios:spec.lodRatios,lodMaxRelativeError:spec.lodMaxRelativeError,artifacts};
  for(const {file,bytes} of outputs)await writeFile(join(out,file),bytes);
  await writeFile(join(out,'build.json'),JSON.stringify(report,null,2)+'\n');return report;
 } finally{for(const p of parts)p.geometry.dispose();disposeScene(gltf.scene);}
}
