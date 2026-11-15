import type {AnatomicalRegionWireId} from '../../types/telemetry';
import * as THREE from 'three';

/** Share materials only inside one layer and one clinical region. Geometry remains
 * owned by the GLTF cache. Region identity/picking stays on each original mesh.
 */
export function cloneAtlasLayer(source:THREE.Object3D,color:string,classify:(name:string)=>string|null):THREE.Object3D {
  const scene=source.clone(true);
  const materials=new Map<string,THREE.MeshStandardMaterial>();
  scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh)) return;
    const key=classify(object.name)??'base';
    let material=materials.get(key);
    if(!material) {
      material=new THREE.MeshStandardMaterial({color,roughness:0.65,side:THREE.DoubleSide});
      materials.set(key,material);
    }
    object.material=material;
  });
  return scene;
}

export function disposeAtlasMaterials(models:THREE.Object3D[]) {
  const disposed=new Set<THREE.Material>();
  models.forEach(model=>model.traverse(object=>{
    if(!(object instanceof THREE.Mesh)) return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    materials.forEach(material=>{if(!disposed.has(material)){disposed.add(material);material.dispose();}});
  }));
}

export function clinicalStructure(name: string): AnatomicalRegionWireId | null {
  if (/Optic[_ ]nerve|Eyeball/i.test(name)) return 'EyeOcularSans';
  if (/Internal[_ ]jugular[_ ]vein/i.test(name)) return 'InternalJugularVein';
  if (/Heart|Myocardium|Ventricle|Atrium/i.test(name)) return 'HeartCardioAutonomic';
  if (/^Femur|^Soleus[_ ]muscle|^Calcaneus/i.test(name)) return 'SoleusCalcaneus';
  if (/^Brain|^Cerebrum/i.test(name)) return 'BrainVestibularCns';
  return null;
}
