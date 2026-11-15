import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface SemanticPart { structureId: string; layer: string; geometry: THREE.BufferGeometry }
export interface SemanticBatch {
  layer: string; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  ranges: {start: number; end: number; structureId: string}[];
}
export function geometryBytes(g: THREE.BufferGeometry): number {
  return Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0);
}
export function validateTriangles(g: THREE.BufferGeometry): void {
  const p=g.getAttribute('position'), n=g.getAttribute('normal');
  if (!p || p.itemSize!==3 || !n || n.itemSize!==3 || n.count!==p.count) throw Error('Missing position/normal data');
  const count=g.index?.count??p.count;
  if (!count || count%3) throw Error('Invalid triangle count');
  for (const a of [p,n]) for(let i=0;i<a.array.length;i++) if(!Number.isFinite(a.array[i])) throw Error('Non-finite geometry');
  for(let i=0;i<n.count;i++)if(n.getX(i)**2+n.getY(i)**2+n.getZ(i)**2===0)throw Error('Zero-length normal');
  const v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(let i=0;i<count;i+=3){
    for(let j=0;j<3;j++) {const index=g.index?g.index.getX(i+j):i+j;if(!Number.isInteger(index)||index<0||index>=p.count)throw Error('Invalid index');v[j].fromBufferAttribute(p,index);}
    if(a.subVectors(v[1],v[0]).cross(b.subVectors(v[2],v[0])).lengthSq()===0)throw Error('Degenerate triangle');
  }
}
/** Clone owned numeric geometry; never modify imported originals. Matrix is column-major. */
export function normalizeStaticMesh(mesh: THREE.Mesh, sourceToModel: readonly number[]): THREE.BufferGeometry {
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || Object.keys(mesh.geometry.morphAttributes).length) throw Error('Only static geometry is supported');
  if(sourceToModel.length!==16||sourceToModel.some(x=>!Number.isFinite(x))||[3,7,11].some(i=>sourceToModel[i]!==0)||sourceToModel[15]!==1)throw Error('Invalid affine transform');
  mesh.updateWorldMatrix(true,false);
  const m=new THREE.Matrix4().fromArray(sourceToModel as number[]).multiply(mesh.matrixWorld);
  if(m.determinant()===0)throw Error('Singular transform');
  const g=mesh.geometry.clone();
  try {
    for(const key of Object.keys(g.attributes)) if(key!=='position'&&key!=='normal')g.deleteAttribute(key);
    for(const key of ['position','normal']){const a=g.getAttribute(key);if(!a)continue;if(a.itemSize!==3)throw Error('Expected three-component geometry attribute');
      const values=new Float32Array(a.count*3);for(let i=0;i<a.count;i++){values[i*3]=a.getX(i);values[i*3+1]=a.getY(i);values[i*3+2]=a.getZ(i);}
      g.setAttribute(key,new THREE.BufferAttribute(values,3));}
    if(!g.getAttribute('normal'))g.computeVertexNormals();
    g.applyMatrix4(m);
    if(m.determinant()<0){
      if(!g.index)g.setIndex(Array.from({length:g.getAttribute('position').count},(_,i)=>i));
      const index=g.index!;
      for(let i=0;i<index.count;i+=3){const second=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,second);}
    }
    g.normalizeNormals();validateTriangles(g);g.computeBoundingBox();g.computeBoundingSphere();return g;
  } catch(error){g.dispose();throw error;}
}
/** Rebuild only on visibility/LOD changes. One draw batch per visible layer, immutable source parts. */
export function buildSemanticBatches(parts: readonly SemanticPart[], visibleIds: ReadonlySet<string>): SemanticBatch[] {
  const layers=new Map<string,SemanticPart[]>();
  for(const part of parts)if(visibleIds.has(part.structureId))layers.set(part.layer,[...(layers.get(part.layer)??[]),part]);
  const result:SemanticBatch[]=[];
  try {
    for(const [layer,items] of layers){
      const copies:THREE.BufferGeometry[]=[];const ranges:SemanticBatch['ranges']=[];let cursor=0;
      try {
        for(const part of items){const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
          copies.push(g);const count=g.getAttribute('position').count/3;ranges.push({start:cursor,end:cursor+count,structureId:part.structureId});cursor+=count;}
        const geometry=mergeGeometries(copies,false);if(!geometry)throw Error('Incompatible batch geometry');
        const material=new THREE.MeshBasicMaterial({color:0x51c3d6,side:THREE.DoubleSide,wireframe:false});
        const mesh=new THREE.Mesh(geometry,material);mesh.name=`ARES_REFERENCE_LAYER_${layer}`;
        result.push({layer,mesh,ranges});
      } finally {for(const g of copies)g.dispose();}
    }
    return result;
  } catch(error){disposeBatches(result);throw error;}
}
export function pickSemantic(batches: readonly SemanticBatch[], ray: THREE.Raycaster): {structureId:string;point:THREE.Vector3}|null {
  let selected:{structureId:string;point:THREE.Vector3;distance:number}|null=null;
  for(const batch of batches){
    if(!batch.mesh.visible)continue;
    batch.mesh.updateMatrixWorld(true);
    const hit=ray.intersectObject(batch.mesh,false)[0];if(!hit||hit.faceIndex==null)continue;
    let low=0,high=batch.ranges.length;
    while(low<high){const mid=(low+high)>>>1;if(batch.ranges[mid].end<=hit.faceIndex)low=mid+1;else high=mid;}
    const range=batch.ranges[low];if(range&&hit.faceIndex>=range.start&&(!selected||hit.distance<selected.distance))selected={structureId:range.structureId,point:hit.point.clone(),distance:hit.distance};
  }
  return selected?{structureId:selected.structureId,point:selected.point}:null;
}
export function disposeBatches(batches: readonly SemanticBatch[]): void {
  for(const b of batches){b.mesh.removeFromParent();b.mesh.geometry.dispose();b.mesh.material.dispose();}
}
