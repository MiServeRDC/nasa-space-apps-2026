// Standalone local asset measurement, not part of the app or default test suite.
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import {clinicalStructure,cloneAtlasLayer,disposeAtlasMaterials} from '../src/modules/body-3d-heatmap/atlasMaterials.ts';

const result=[];
for(const name of ['SkeletalSystem100','MuscularSystem100','CardioVascular41','VisceralSystem100','NervousSystem100']) {
  const bytes=await readFile(new URL(`../public/anatomy/${name}.glb`,import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const model=cloneAtlasLayer(gltf.scene,'#aabbcc',clinicalStructure);
  const materials=new Set();let meshes=0;
  model.traverse(object=>{if(object instanceof THREE.Mesh){meshes++;materials.add(object.material);}});
  result.push({name,meshes,previousPerMeshMaterials:meshes,pooledMaterials:materials.size});
  disposeAtlasMaterials([model]);
}
console.log(JSON.stringify(result,null,2));
