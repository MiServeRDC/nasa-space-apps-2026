import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, Vector3, type Material } from 'three';
import type { CrewSex } from '../../lib/scenario';
import type { AtlasAnchors } from './AtlasBody';
import type { V3 } from './AnatomicalLayers';

const ANATOMY_DEPTHS = ['Skin', 'Muscles', 'Organs and vessels', 'Skeleton'] as const;

const SYSTEM_DEPTH = { skin: 0, muscles: 1, organs: 2, vessels: 2, nerves: 2, skeleton: 3 };

export function PairedAtlasBody({ sex, depth, onAnchors }: {
  sex: CrewSex;
  depth: number;
  onAnchors: (anchors: AtlasAnchors) => void;
}) {
  const { scene } = useGLTF(`/anatomy/anatomy-${sex.toLowerCase()}.glb`, false);
  const invalidate = useThree(state => state.invalidate);
  const { model, systems } = useMemo(() => {
    const model = scene.clone(true);
    const systems = model.children.map(group => {
      const index = SYSTEM_DEPTH[group.name as keyof typeof SYSTEM_DEPTH];
      const copies = new Map<Material, Material>();
      const clone = (material: Material) => {
        const existing = copies.get(material);
        if (existing) return existing;
        const copy = material.clone();
        copies.set(material, copy);
        return copy;
      };
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
        object.renderOrder = ANATOMY_DEPTHS.length - index;
      });
      return { group, index, materials: [...copies.values()] };
    });
    return { model, systems };
  }, [scene]);
  const { scale, offset, anchors } = useMemo(() => {
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());
    const scale = 2.5 / (bounds.max.y - bounds.min.y);
    const offset: V3 = [-center.x * scale, -0.8 - bounds.min.y * scale, -center.z * scale];

    // Some clinical regions use the closest named structure in this atlas.
    const point = (name: string, top = false): V3 => {
      const part = model.getObjectByName(name);
      if (!part) throw new Error(`Missing atlas landmark: ${name}`);
      const box = new Box3().setFromObject(part);
      const position = box.getCenter(new Vector3());
      if (top) position.y = box.max.y;
      return [position.x * scale + offset[0], position.y * scale + offset[1], position.z * scale + offset[2]];
    };
    const anchors: AtlasAnchors = {
      profile: sex,
      nodes: {
        EyeOcularSans: point('eye_l'),
        InternalJugularVein: point('carotid_l'),
        HeartCardioAutonomic: point('heart'),
        SoleusCalcaneus: point('calf_l'),
        BrainVestibularCns: point('brain'),
      },
      injuries: {
        HEAD_FOREHEAD: point('skull', true),
        LEFT_SHOULDER: point('humerus_l', true), RIGHT_SHOULDER: point('humerus_r', true),
        LEFT_FOREARM: point('forearm_l'), RIGHT_FOREARM: point('forearm_r'),
        CHEST_RIBS: point('sternum'),
        LEFT_KNEE: point('patella_l'), RIGHT_KNEE: point('patella_r'),
        LEFT_ANKLE: point('foot_l'), RIGHT_ANKLE: point('foot_r'),
      },
    };
    return { scale, offset, anchors };
  }, [model, sex]);

  useEffect(() => onAnchors(anchors), [anchors, onAnchors]);
  useEffect(() => {
    for (const { group, index, materials } of systems) {
      const weight = Math.max(0, 1 - Math.abs(depth - index));
      const opacity = weight * weight * (3 - 2 * weight);
      group.visible = opacity > 0;
      for (const material of materials) {
        const transparent = opacity < 1;
        if (material.transparent !== transparent) {
          material.transparent = transparent;
          material.needsUpdate = true;
        }
        material.opacity = opacity;
        material.depthWrite = !transparent;
      }
    }
    invalidate();
  }, [systems, depth, invalidate]);

  useEffect(() => () => {
    for (const { materials } of systems) {
      materials.forEach(material => material.dispose());
    }
  }, [systems]);

  return <primitive object={model} scale={scale} position={offset} />;
}
