import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {renderSettings} from '../src/lib/renderQuality.ts';
import {cloneAtlasLayer,disposeAtlasMaterials} from '../src/modules/body-3d-heatmap/atlasMaterials.ts';

test('quality settings stop hidden rendering and honor reduced motion without changing data',()=>{
  for(const mode of ['AUTO','LITE','STANDARD','HIGH'] as const) {
    assert.equal(renderSettings(mode,0.5,2,true,false).frameloop,'never');
    assert.equal(renderSettings(mode,0.5,2,false,true).frameloop,'demand');
    for(const value of [-1,0,0.5,1,100,NaN]) {
      const {dpr}=renderSettings(mode,value,2,false,false);
      assert.ok(Number.isFinite(dpr) && dpr>=0.75 && dpr<=2);
    }
  }
  assert.ok(renderSettings('AUTO',0,2,false,false).dpr<renderSettings('AUTO',1,2,false,false).dpr);
  assert.equal(renderSettings('LITE',1,2,false,false).frameloop,'demand');
});

test('atlas shares materials by region while preserving source ownership and picking identity',()=>{
  const original=new THREE.Group();
  const geometry=new THREE.BoxGeometry();
  const sourceMaterial=new THREE.MeshStandardMaterial();
  for(let i=0;i<500;i++) {const mesh=new THREE.Mesh(geometry,sourceMaterial);mesh.name=`region-${i%5}`;original.add(mesh);}
  const model=cloneAtlasLayer(original,'#123456',name=>name);
  const materials=new Set<THREE.Material>();
  model.traverse(object=>{if(object instanceof THREE.Mesh){
    assert.equal(object.geometry,geometry);
    assert.notEqual(object.material,sourceMaterial);
    assert.equal(object.name,original.children[model.children.indexOf(object)].name);
    materials.add(object.material as THREE.Material);
  }});
  assert.equal(materials.size,5);
  let disposed=0;materials.forEach(m=>m.addEventListener('dispose',()=>disposed++));
  disposeAtlasMaterials([model]);
  assert.equal(disposed,5);
  assert.ok(original.children.every(m=>(m as THREE.Mesh).material===sourceMaterial));
  geometry.dispose();sourceMaterial.dispose();
});
