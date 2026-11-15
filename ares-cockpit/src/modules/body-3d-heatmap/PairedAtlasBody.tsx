import { useEffect, useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Material } from 'three';
import type { CrewSex } from '../../lib/scenario';
import type { AtlasAnchors } from './AtlasBody';
import type { V3 } from './AnatomicalLayers';

const SYSTEM_STYLE = {
  skin: { layer: 0, color: '#bd927e' },
  muscles: { layer: 1, color: '#a54f48' },
  organs: { layer: 2, color: '#a86261' },
  vessels: { layer: 2, color: '#884256' },
  nerves: { layer: 2, color: '#c5a96e' },
  skeleton: { layer: 3, color: '#d9ccb1' },
};

// Air-gapped: useDraco=false avoids CDN requests; useMeshopt=true enables local MeshoptDecoder.
export function PairedAtlasBody({ sex, layers, onAnchors, onSurfaceClick }: {
  sex: CrewSex;
  layers: readonly number[];
  onAnchors: (anchors: AtlasAnchors) => void;
  onSurfaceClick?: (point: V3) => void;
}) {
  const { scene } = useGLTF(`/anatomy/anatomy-${sex.toLowerCase()}.glb`, false, true);
  const invalidate = useThree(state => state.invalidate);
  const { model, systems } = useMemo(() => {
    const model = scene.clone(true);
    const systems = model.children.map(group => {
      const style = SYSTEM_STYLE[group.name as keyof typeof SYSTEM_STYLE];
      const copies = new Map<Material, Material>();
      const clone = (material: Material) => {
        const existing = copies.get(material);
        if (existing) return existing;
        const copy = material.clone();
        if (copy instanceof MeshStandardMaterial && style) {
          copy.color.set(style.color);
          copy.metalness = 0;
          copy.roughness = 0.82;
        }
        copies.set(material, copy);
        return copy;
      };
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
        object.renderOrder = style ? 4 - style.layer : 0;
      });
      return { group, style, materials: [...copies.values()] };
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
    const deepest = Math.max(...layers);
    for (const { group, style, materials } of systems) {
      group.visible = Boolean(style && layers.includes(style.layer));
      const opacity = style && style.layer < deepest ? [0.18, 0.32, 0.5][style.layer] : 1;
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
  }, [systems, layers, invalidate]);

  useEffect(() => () => {
    for (const { materials } of systems) {
      materials.forEach(material => material.dispose());
    }
  }, [systems]);

  const pickSurface = (event: ThreeEvent<MouseEvent>) => {
    if (!onSurfaceClick || event.delta > 4) return;
    const hit = event.intersections.find(({ object }) => systems.some(({ group }) =>
      group.visible && group.getObjectById(object.id) !== undefined,
    ));
    if (!hit) return;
    event.stopPropagation();
    onSurfaceClick(hit.point.toArray());
  };

  return <primitive object={model} scale={scale} position={offset} onClick={onSurfaceClick ? pickSurface : undefined} />;
}
