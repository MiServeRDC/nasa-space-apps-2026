import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildSemanticBatches, disposeBatches, geometryBytes, normalizeStaticMesh, type SemanticBatch, type SemanticPart } from './semanticGeometry';

export interface SourceNode {nodeIndex:number;nodeName:string;structureId:string;excluded?:boolean}
export interface AnatomyChunk { path: string; sha256: string; layer: string; lod: number; referenceFrameId?:string; sourceNodes?:SourceNode[] }
export interface GeometryIssue {structureId:string;nodeId:string;reason:string}
export interface SessionLimits { maxFileBytes: number; maxDecodedBytes: number; maxMeshCount: number }
const DEFAULT_LIMITS:SessionLimits={maxFileBytes:16_000_000,maxDecodedBytes:64_000_000,maxMeshCount:2000};
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
// Serialize fetch/decode across sessions: aborted late decodes cannot accumulate models.
let decodeBusy=false;
const decodeWaiters:(()=>void)[]=[];
function acquireDecode(signal:AbortSignal):Promise<()=>void>{
  return new Promise((resolve,reject)=>{
    const abort=()=>{const index=decodeWaiters.indexOf(grant);if(index>=0)decodeWaiters.splice(index,1);reject(new DOMException('Obsolete anatomy load','AbortError'));};
    const grant=()=>{
      signal.removeEventListener('abort',abort);
      if(signal.aborted){abort();const next=decodeWaiters.shift();next?.();return;}
      decodeBusy=true;let released=false;
      resolve(()=>{if(released)return;released=true;decodeBusy=false;const next=decodeWaiters.shift();next?.();});
    };
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    if(decodeBusy)decodeWaiters.push(grant);else grant();
  });
}
function disposeImported(scene:THREE.Object3D):void {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  scene.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);for(const material of (Array.isArray(m.material)?m.material:[m.material]))if(material)materials.add(material);});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.clear();
}
function inspect(buffer:ArrayBuffer, decoder:typeof MeshoptDecoder|null, limits:SessionLimits):void {
  const view=new DataView(buffer);
  if(buffer.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength||view.getUint32(16,true)!==0x4e4f534a)throw Error('Invalid anatomy GLB');
  const len=view.getUint32(12,true);if(len>buffer.byteLength-20)throw Error('Truncated GLB JSON');
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,len)));
  const declared=(doc.bufferViews??[]).reduce((n:number,v:{byteLength:number;extensions?:{EXT_meshopt_compression?:{count:number;byteStride:number}}})=>{
    if(!Number.isSafeInteger(v.byteLength)||v.byteLength<0)throw Error('Invalid buffer size');
    const ext=v.extensions?.EXT_meshopt_compression;
    if(ext&&(!Number.isSafeInteger(ext.count)||!Number.isSafeInteger(ext.byteStride)||ext.count<=0||ext.byteStride<=0||ext.count*ext.byteStride!==v.byteLength))throw Error('Invalid decoded buffer declaration');
    return n+v.byteLength;},0);
  if(declared>limits.maxDecodedBytes||(doc.meshes?.length??0)>limits.maxMeshCount||(doc.nodes??[]).filter((n:{mesh?:number})=>n.mesh!==undefined).length>limits.maxMeshCount)throw Error('Declared anatomy budget exceeded');
  if((doc.buffers??[]).some((b:{uri?:string})=>b.uri)||doc.images?.length)throw Error('Only embedded static geometry is supported');
  for(const ext of doc.extensionsRequired??[]){
    if(!['EXT_meshopt_compression','KHR_mesh_quantization'].includes(ext))throw Error(`Unsupported anatomy extension ${ext}`);
    if(ext==='EXT_meshopt_compression'&&(!decoder||!decoder.supported))throw Error('Local Meshopt decoder unavailable');
  }
}
export class AnatomyModelSession {
  private epoch=0;
  private controller:AbortController|null=null;
  private parts:SemanticPart[]=[];
  private ownedBatches:SemanticBatch[]=[];
  private closed=false;
  private geometryIssues:GeometryIssue[]=[];
  get issues():readonly GeometryIssue[]{return this.geometryIssues;}
  get loadedIds():ReadonlySet<string>{return new Set(this.parts.map(p=>p.structureId));}
  private lastDecodeMs=0;
  constructor(private readonly limits:SessionLimits=DEFAULT_LIMITS,
    private readonly decoder:typeof MeshoptDecoder|null=MeshoptDecoder,
    private readonly fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {}
  get batches():readonly SemanticBatch[]{return this.ownedBatches;}
  get stats(){return {parts:this.parts.length,batches:this.ownedBatches.length,
    geometries:this.parts.length+this.ownedBatches.length,materials:this.ownedBatches.length,
    decodedGeometryBytes:this.parts.reduce((n,p)=>n+geometryBytes(p.geometry),0)+this.ownedBatches.reduce((n,p)=>n+geometryBytes(p.mesh.geometry),0),decodeMs:this.lastDecodeMs};}
  unload():void {
    this.epoch++;this.controller?.abort();this.controller=null;
    disposeBatches(this.ownedBatches);this.ownedBatches=[];
    for(const p of this.parts)p.geometry.dispose();this.parts=[];this.lastDecodeMs=0;this.geometryIssues=[];
  }
  close():void{this.unload();this.closed=true;}
  setVisible(ids:ReadonlySet<string>):void {
    const current=new Set(this.ownedBatches.flatMap(b=>b.ranges.map(r=>r.structureId)));
    const requested=new Set(this.parts.filter(p=>ids.has(p.structureId)).map(p=>p.structureId));
    if(current.size===requested.size&&[...current].every(id=>requested.has(id)))return;
    this.checkBatchBudget(this.parts,ids);
    const next=buildSemanticBatches(this.parts,ids);
    disposeBatches(this.ownedBatches);this.ownedBatches=next;
  }
  private checkBatchBudget(parts:readonly SemanticPart[],visible:ReadonlySet<string>):void {
    const original=parts.reduce((n,p)=>n+geometryBytes(p.geometry),0);
    const expanded=parts.filter(p=>visible.has(p.structureId)).reduce((n,p)=>n+p.geometry.getAttribute('position').count*24+(p.geometry.index?.count??p.geometry.getAttribute('position').count)*4,0);
    const previous=this.ownedBatches.reduce((n,b)=>n+geometryBytes(b.mesh.geometry),0);
    if(original+expanded+previous>this.limits.maxDecodedBytes)throw Error('Batch memory budget exceeded');
  }
  async load(chunks:readonly AnatomyChunk[],allowedIds:ReadonlySet<string>,visibleIds:ReadonlySet<string>,signal?:AbortSignal):Promise<void>{
    if(this.closed)throw Error('Session is closed');
    if(new Set(chunks.map(c=>c.referenceFrameId)).size>1)throw Error('Unregistered reference frames cannot be combined');
    if(new Set(chunks.map(c=>c.lod)).size!==1||new Set(chunks.map(c=>c.path)).size!==chunks.length)throw Error('Invalid or mixed chunk set');
    this.unload();const epoch=this.epoch,controller=new AbortController();this.controller=controller;
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const parts:SemanticPart[]=[],issues:GeometryIssue[]=[];let bytes=0,decodeMs=0;
    const current=()=>{if(controller.signal.aborted||epoch!==this.epoch||this.closed)throw new DOMException('Obsolete anatomy load','AbortError');};
    try {
      for(const chunk of chunks){
        const release=await acquireDecode(controller.signal);
        try {
        current();if(!/^\/anatomy\/[a-zA-Z0-9_./-]+\.glb$/.test(chunk.path)||chunk.path.includes('..')||! /^[0-9a-f]{64}$/.test(chunk.sha256))throw Error('Invalid local chunk');
        const response=await this.fetcher(chunk.path,{signal:controller.signal});if(!response.ok)throw Error(`Anatomy asset unavailable (${response.status})`);
        const advertised=Number(response.headers.get('content-length')??0);if(advertised>this.limits.maxFileBytes)throw Error('Anatomy file budget exceeded');
        if(!response.body)throw Error('Empty anatomy response');
        const reader=response.body.getReader(),segments:Uint8Array[]=[];let received=0;
        try {while(true){const {done,value}=await reader.read();current();if(done)break;
          received+=value.byteLength;if(received>this.limits.maxFileBytes){await reader.cancel();throw Error('Anatomy file budget exceeded');}segments.push(value);}}
        finally{reader.releaseLock();}
        const combined=new Uint8Array(received);let at=0;for(const segment of segments){combined.set(segment,at);at+=segment.byteLength;}
        const buffer=combined.buffer;
        const digest=await crypto.subtle.digest('SHA-256',buffer);
        if(Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')!==chunk.sha256)throw Error('Anatomy hash mismatch');
        inspect(buffer,this.decoder,this.limits);current();
        const sourceMap=new Map<number,SourceNode>();
        if(chunk.sourceNodes){
          const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,new DataView(buffer).getUint32(12,true))));
          for(const node of chunk.sourceNodes){
            if(!Number.isInteger(node.nodeIndex)||sourceMap.has(node.nodeIndex)||doc.nodes?.[node.nodeIndex]?.mesh===undefined||(doc.nodes[node.nodeIndex].name??'')!==node.nodeName||!allowedIds.has(node.structureId))throw Error('Invalid source-node mapping');
            sourceMap.set(node.nodeIndex,node);
          }
          if(doc.nodes.filter((n:{mesh?:number})=>n.mesh!==undefined).length!==sourceMap.size)throw Error('Incomplete source-node mapping');
        }
        const loader=new GLTFLoader();if(this.decoder)loader.setMeshoptDecoder(this.decoder);
        const start=performance.now();const gltf=await loader.parseAsync(buffer,'');decodeMs+=performance.now()-start;
        try {
          current();gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse(o=>{
            const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;
            let source:SourceNode|undefined;
            if(chunk.sourceNodes){
              let object:THREE.Object3D|null=mesh;
              while(object){const index=gltf.parser.associations.get(object)?.nodes;if(index!==undefined){source=sourceMap.get(index);break;}object=object.parent;}
              if(!source)throw Error('Unmapped source mesh');
              if(source.excluded){issues.push({structureId:source.structureId,nodeId:`node:${source.nodeIndex}`,reason:'Excluded: female-labelled supplement in mixed reference source'});return;}
            }
            const tag=source?{structureId:source.structureId,layer:chunk.layer}:mesh.userData.ares;
            if(!tag||!allowedIds.has(tag.structureId)||tag.layer!==chunk.layer)throw Error('Missing or mismatched semantic mesh identity');
            let g:THREE.BufferGeometry;
            try{g=normalizeStaticMesh(mesh,IDENTITY);}catch(error){
              if(!source)throw error;
              issues.push({structureId:source.structureId,nodeId:`node:${source.nodeIndex}`,reason:String(error)});return;
            }
            bytes+=geometryBytes(g);
            if(bytes>this.limits.maxDecodedBytes||parts.length>=this.limits.maxMeshCount){g.dispose();throw Error('Decoded anatomy budget exceeded');}
            parts.push({structureId:tag.structureId,layer:tag.layer,geometry:g,assetSha256:chunk.sha256,nodeId:source?`node:${source.nodeIndex}`:mesh.name});
          });
        } finally{disposeImported(gltf.scene);}
        } finally{release();}
      }
      current();if(parts.length===0)throw Error('No semantic geometry');
      this.checkBatchBudget(parts,visibleIds);
      const batches=buildSemanticBatches(parts,visibleIds);
      const batchBytes=batches.reduce((n,b)=>n+geometryBytes(b.mesh.geometry),0);
      if(bytes+batchBytes>this.limits.maxDecodedBytes){disposeBatches(batches);throw Error('Batch memory budget exceeded');}
      this.parts=parts;this.geometryIssues=issues;this.ownedBatches=batches;this.lastDecodeMs=decodeMs;
    } catch(error){for(const p of parts)p.geometry.dispose();throw error;}
    finally{signal?.removeEventListener('abort',cancel);if(this.controller===controller)this.controller=null;}
  }
}
