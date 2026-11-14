import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ScenarioState } from '../../lib/scenario';
import type { InjuryRegionId } from '../../types/injury';
import type { NodeId } from './BodyHeatmap';
import { riskColor, type V3 } from './AnatomicalLayers';

const FILES = ['SkeletalSystem100', 'MuscularSystem100', 'CardioVascular41', 'VisceralSystem100', 'NervousSystem100'];
const URLS = FILES.map(file => `/anatomy/${file}.glb`);
const COLORS = ['#ded5c3', '#a45f59', '#bb4356', '#ba9368', '#d0bb80'];
export interface AtlasAnchors { profile: 'MALE'; nodes: Record<NodeId, V3>; injuries: Record<InjuryRegionId, V3> }

function clinicalStructure(name: string): NodeId | null {
  if (/Optic_nerve|eyeball/i.test(name)) return 'onsd';
  if (/Internal_jugular_vein/i.test(name)) return 'ijv';
  if (/^Femur/i.test(name)) return 'femur';
  if (/^Soleus_muscler_/i.test(name)) return 'soleus';
  if (/^Calcaneus/i.test(name)) return 'calcaneus';
  return null;
}

export function AtlasBody({ s, skeleton, muscles, vascular, organs, muscleOpacity, selected, onSelect, onAnchors }: {
  s: ScenarioState; skeleton: boolean; muscles: boolean; vascular: boolean; organs: boolean;
  muscleOpacity: number; selected: NodeId | null; onSelect: (id: NodeId) => void;
  onAnchors: (anchors: AtlasAnchors) => void;
}) {
  const loaded = useGLTF(URLS);
  const models = useMemo(() => loaded.map((gltf, index) => {
    const scene = gltf.scene.clone(true);
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) object.material = new THREE.MeshStandardMaterial({ color: COLORS[index], roughness: 0.65, side: THREE.DoubleSide });
    });
    return scene;
  }), [loaded]);

  const alignment = useMemo(() => {
    models.forEach(model => model.updateMatrixWorld(true));
    const box = new THREE.Box3().setFromObject(models[0]);
    const scale = 2.5 / (box.max.y - box.min.y);
    const center = box.getCenter(new THREE.Vector3());
    const offset: V3 = [-center.x * scale, -0.8 - box.min.y * scale, -center.z * scale];
    const transform = (point: THREE.Vector3): V3 => [point.x * scale + offset[0], point.y * scale + offset[1], point.z * scale + offset[2]];
    const anchor = (index: number, pattern: RegExp, side = 0, edge?: 'top'): V3 => {
      const bounds = new THREE.Box3();
      models[index].traverse(object => {
        if (!(object instanceof THREE.Mesh) || !pattern.test(object.name)) return;
        const part = new THREE.Box3().setFromObject(object);
        const midpoint = part.getCenter(new THREE.Vector3());
        if (side && Math.sign(midpoint.x) !== side) return;
        bounds.union(part);
      });
      if (bounds.isEmpty()) throw new Error(`Missing atlas landmark: ${pattern.source}`);
      const point = bounds.getCenter(new THREE.Vector3());
      if (edge === 'top') point.y = bounds.max.y;
      return transform(point);
    };
    const anchors: AtlasAnchors = {
      profile: 'MALE',
      nodes: {
        onsd: anchor(4, /Optic_nerve/, 1), ijv: anchor(2, /Internal_jugular_vein/, 1),
        femur: anchor(0, /^Femur/, 1), soleus: anchor(1, /^Soleus_muscler_/, -1), calcaneus: anchor(0, /^Calcaneus/, 1),
      },
      injuries: {
        HEAD_FOREHEAD: anchor(0, /^Frontal_bone/),
        LEFT_SHOULDER: anchor(0, /^Humerus/, 1, 'top'), RIGHT_SHOULDER: anchor(0, /^Humerus/, -1, 'top'),
        LEFT_FOREARM: anchor(0, /^Radius/, 1), RIGHT_FOREARM: anchor(0, /^Radius/, -1),
        CHEST_RIBS: anchor(0, /sternum/i),
        LEFT_KNEE: anchor(0, /^Patellar_[12]$/, 1), RIGHT_KNEE: anchor(0, /^Patellar_[12]$/, -1),
        LEFT_ANKLE: anchor(0, /^Calcaneus/, 1), RIGHT_ANKLE: anchor(0, /^Calcaneus/, -1),
      },
    };
    return { scale, offset, anchors };
  }, [models]);
  useEffect(() => onAnchors(alignment.anchors), [alignment, onAnchors]);

  const clinicalMeshes = useMemo(() => {
    const result: { mesh: THREE.Mesh; id: NodeId }[] = [];
    models.forEach(model => model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const id = clinicalStructure(object.name);
        if (id) result.push({ mesh: object, id });
      }
    }));
    return result;
  }, [models]);
  const ocularMargin = Math.min(s.rho.onsd, s.rho.ppco2);
  const venousMargin = s.rho.tau_w;
  const boneMargin = s.rho.sclerostin;
  const muscleMargin = s.rho.soleus;
  useEffect(() => {
    const margins: Record<NodeId, number> = { onsd: ocularMargin, ijv: venousMargin, femur: boneMargin, soleus: muscleMargin, calcaneus: boneMargin };
    clinicalMeshes.forEach(({ mesh, id }) => {
      if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      const material = mesh.material;
      material.color.set(riskColor(margins[id]));
      material.emissive.set(riskColor(margins[id]));
      material.emissiveIntensity = id === selected ? 0.9 : 0.18;
    });
  }, [clinicalMeshes, ocularMargin, venousMargin, boneMargin, muscleMargin, selected]);

  useEffect(() => {
    models[1].traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      const material = object.material;
      const wasTransparent = material.transparent;
      material.opacity = muscleOpacity;
      material.transparent = material.opacity < 1;
      material.depthWrite = material.opacity >= 0.95;
      if (wasTransparent !== material.transparent) material.needsUpdate = true;
    });
  }, [models, muscleOpacity]);

  useEffect(() => () => models.forEach(model => model.traverse(object => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.Material) object.material.dispose();
  })), [models]);

  return <group position={alignment.offset} scale={alignment.scale}>
    {models.map((model, index) => {
      const visible = [skeleton, muscles, vascular, organs, vascular][index];
      return <primitive key={FILES[index]} object={model} visible={visible} onClick={(event: { object: THREE.Object3D; stopPropagation: () => void }) => {
        const id = clinicalStructure(event.object.name);
        if (id) { event.stopPropagation(); onSelect(id); }
      }} />;
    })}
  </group>;
}
