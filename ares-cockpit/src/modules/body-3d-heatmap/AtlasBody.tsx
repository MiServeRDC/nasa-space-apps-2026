import {clinicalStructure,cloneAtlasLayer,disposeAtlasMaterials} from './atlasMaterials';
import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { CrewSex, ScenarioState } from '../../lib/scenario';
import { INJURY_REGIONS, type InjuryRegionId } from '../../types/injury';
import type { AnatomicalRegionWireId } from '../../types/telemetry';
import { riskColor, type V3 } from './AnatomicalLayers';
import { projectNormalizedCentroidToR3f, type ProjectedAnatomicalNode } from './uberonSpatialMapping';

const FILES = [
  'SkeletalSystem100',
  'MuscularSystem100',
  'CardioVascular41',
  'VisceralSystem100',
  'NervousSystem100',
] as const;

const URLS = FILES.map((file) => `/anatomy/${file}.glb`);
const COLORS = ['#ded5c3', '#a45f59', '#bb4356', '#ba9368', '#d0bb80'] as const;

const DEFAULT_NODE_FALLBACKS: Record<AnatomicalRegionWireId, V3> = {
  EyeOcularSans: projectNormalizedCentroidToR3f([0.0, 0.82, 0.05]),
  InternalJugularVein: projectNormalizedCentroidToR3f([-0.06, 0.62, 0.04]),
  HeartCardioAutonomic: projectNormalizedCentroidToR3f([0.0, 0.3, 0.02]),
  SoleusCalcaneus: projectNormalizedCentroidToR3f([0.0, -0.65, -0.03]),
  BrainVestibularCns: projectNormalizedCentroidToR3f([0.0, 0.9, -0.02]),
};

export interface AtlasAnchors {
  profile: CrewSex;
  nodes: Record<AnatomicalRegionWireId, V3>;
  injuries: Record<InjuryRegionId, V3>;
}


export function AtlasBody({
  s,
  nodesByRegion,
  skeleton,
  muscles,
  vascular,
  organs,
  muscleOpacity,
  selected,
  onSelect,
  onAnchors,
}: {
  s: ScenarioState | null;
  nodesByRegion?: Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>;
  skeleton: boolean;
  muscles: boolean;
  vascular: boolean;
  organs: boolean;
  muscleOpacity: number;
  selected: AnatomicalRegionWireId | null;
  onSelect: (id: AnatomicalRegionWireId) => void;
  onAnchors: (anchors: AtlasAnchors) => void;
}) {
  // Air-gapped: useDraco=false avoids gstatic.com CDN; useMeshopt=true uses local MeshoptDecoder.
  const loaded = useGLTF(URLS, false, true);

  const models = useMemo(() => loaded.map((gltf,index) =>
    cloneAtlasLayer(gltf.scene,COLORS[index],clinicalStructure)),[loaded]);

  const alignment = useMemo(() => {
    models.forEach((model) => model.updateMatrixWorld(true));
    const box = new THREE.Box3().setFromObject(models[0]);
    const rawHeight = box.max.y - box.min.y;
    const scale = rawHeight > 1e-4 ? 2.5 / rawHeight : 1;
    const center = box.getCenter(new THREE.Vector3());
    const offset: V3 = [
      -center.x * scale,
      -0.8 - box.min.y * scale,
      -center.z * scale,
    ];
    const transform = (point: THREE.Vector3): V3 => [
      point.x * scale + offset[0],
      point.y * scale + offset[1],
      point.z * scale + offset[2],
    ];
    const safeAnchor = (
      index: number,
      pattern: RegExp,
      fallback: V3,
      side = 0,
      edge?: 'top',
    ): V3 => {
      const bounds = new THREE.Box3();
      models[index]?.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !pattern.test(object.name)) return;
        const part = new THREE.Box3().setFromObject(object);
        const midpoint = part.getCenter(new THREE.Vector3());
        if (side && Math.sign(midpoint.x) !== side) return;
        bounds.union(part);
      });
      if (bounds.isEmpty()) {
        return fallback;
      }
      const point = bounds.getCenter(new THREE.Vector3());
      if (edge === 'top') point.y = bounds.max.y;
      return transform(point);
    };

    const anchors: AtlasAnchors = {
      profile: 'MALE',
      nodes: {
        EyeOcularSans: safeAnchor(4, /Optic[_ ]nerve|Eyeball/i, DEFAULT_NODE_FALLBACKS.EyeOcularSans, 1),
        InternalJugularVein: safeAnchor(
          2,
          /Internal[_ ]jugular[_ ]vein/i,
          DEFAULT_NODE_FALLBACKS.InternalJugularVein,
          1,
        ),
        HeartCardioAutonomic: safeAnchor(
          2,
          /Heart|Ventricle/i,
          DEFAULT_NODE_FALLBACKS.HeartCardioAutonomic,
        ),
        SoleusCalcaneus: safeAnchor(
          1,
          /^Soleus[_ ]muscle/i,
          DEFAULT_NODE_FALLBACKS.SoleusCalcaneus,
          -1,
        ),
        BrainVestibularCns: safeAnchor(
          4,
          /^Brain|^Cerebrum/i,
          DEFAULT_NODE_FALLBACKS.BrainVestibularCns,
        ),
      },
      injuries: {
        HEAD_FOREHEAD: safeAnchor(0, /^Frontal[_ ]bone/i, INJURY_REGIONS.HEAD_FOREHEAD.pos),
        LEFT_SHOULDER: safeAnchor(0, /^Humerus/i, INJURY_REGIONS.LEFT_SHOULDER.pos, 1, 'top'),
        RIGHT_SHOULDER: safeAnchor(0, /^Humerus/i, INJURY_REGIONS.RIGHT_SHOULDER.pos, -1, 'top'),
        LEFT_FOREARM: safeAnchor(0, /^Radius/i, INJURY_REGIONS.LEFT_FOREARM.pos, 1),
        RIGHT_FOREARM: safeAnchor(0, /^Radius/i, INJURY_REGIONS.RIGHT_FOREARM.pos, -1),
        CHEST_RIBS: safeAnchor(0, /Sternum/i, INJURY_REGIONS.CHEST_RIBS.pos),
        LEFT_KNEE: safeAnchor(0, /^Patella/i, INJURY_REGIONS.LEFT_KNEE.pos, 1),
        RIGHT_KNEE: safeAnchor(0, /^Patella/i, INJURY_REGIONS.RIGHT_KNEE.pos, -1),
        LEFT_ANKLE: safeAnchor(0, /^Calcaneus/i, INJURY_REGIONS.LEFT_ANKLE.pos, 1),
        RIGHT_ANKLE: safeAnchor(0, /^Calcaneus/i, INJURY_REGIONS.RIGHT_ANKLE.pos, -1),
      },
    };
    return { scale, offset, anchors };
  }, [models]);

  useEffect(() => {
    onAnchors(alignment.anchors);
  }, [alignment, onAnchors]);

  const clinicalMeshes = useMemo(() => {
    const result: { mesh: THREE.Mesh; id: AnatomicalRegionWireId }[] = [];
    models.forEach((model) =>
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const id = clinicalStructure(object.name);
          if (id) result.push({ mesh: object, id });
        }
      }),
    );
    return result;
  }, [models]);

  useEffect(() => {
    const fallbackColors: Record<AnatomicalRegionWireId, { color: string; observed: boolean }> =
      s === null
        ? {
            EyeOcularSans: { color: '#6b7280', observed: false },
            InternalJugularVein: { color: '#6b7280', observed: false },
            HeartCardioAutonomic: { color: '#6b7280', observed: false },
            SoleusCalcaneus: { color: '#6b7280', observed: false },
            BrainVestibularCns: { color: '#6b7280', observed: false },
          }
        : {
            EyeOcularSans: { color: riskColor(Math.min(s.rho.onsd, s.rho.ppco2)), observed: true },
            InternalJugularVein: { color: riskColor(s.rho.tau_w), observed: true },
            HeartCardioAutonomic: { color: s.hrAccepted ? riskColor(s.rho.hr) : '#6b7280', observed: s.hrAccepted },
            SoleusCalcaneus: { color: riskColor(Math.min(s.rho.soleus, s.rho.sclerostin)), observed: true },
            BrainVestibularCns: { color: riskColor(s.rho.ppco2), observed: true },
          };

    clinicalMeshes.forEach(({ mesh, id }) => {
      if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      const node = nodesByRegion?.[id];
      const color = node ? node.color : fallbackColors[id].color;
      const observed = node ? node.observed : fallbackColors[id].observed;
      const material = mesh.material;
      material.color.set(color);
      material.emissive.set(color);
      material.emissiveIntensity = id === selected ? 0.9 : observed ? 0.25 : 0.08;
    });
  }, [clinicalMeshes, nodesByRegion, s, selected]);

  useEffect(() => {
    models[1]?.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      const material = object.material;
      const wasTransparent = material.transparent;
      material.opacity = muscleOpacity;
      material.transparent = material.opacity < 1;
      material.depthWrite = material.opacity >= 0.95;
      if (wasTransparent !== material.transparent) material.needsUpdate = true;
    });
  }, [models, muscleOpacity]);

  useEffect(() => () => disposeAtlasMaterials(models), [models]);

  return (
    <group position={alignment.offset} scale={alignment.scale}>
      {models.map((model, index) => {
        const visible = [skeleton, muscles, vascular, organs, vascular][index];
        return (
          <primitive
            key={FILES[index]}
            object={model}
            visible={visible}
            onClick={(event: { object: THREE.Object3D; stopPropagation: () => void }) => {
              const id = clinicalStructure(event.object.name);
              if (id) {
                event.stopPropagation();
                onSelect(id);
              }
            }}
          />
        );
      })}
    </group>
  );
}
