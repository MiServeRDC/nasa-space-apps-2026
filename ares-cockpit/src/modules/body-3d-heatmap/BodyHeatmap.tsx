import { useCallback, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, QuadraticBezierLine } from '@react-three/drei';
import type { CrewSex, ScenarioState } from '../../lib/scenario';
import type {
  AnatomicalRegionWireId,
  HypergraphSpatialSummary,
  ModelValidationStatus,
} from '../../types/telemetry';
import {
  MusclesLayer,
  SkeletonLayer,
  SkinLayer,
  VascularNeuroLayer,
} from './AnatomicalLayers';
import { NasaGlbAssetLayer, type GlbLoadStatus } from './NasaGlbAssetLayer';
import {
  projectHypergraphTo3D,
  type ProjectedAnatomicalNode,
} from './uberonSpatialMapping';

export type NodeId = AnatomicalRegionWireId;
export type TargetTab = 'POCUS' | 'MUSCLE_BONE' | 'FORECAST';

interface LayerConfig {
  skin: boolean;
  muscles: boolean;
  vascular: boolean;
  skeleton: boolean;
  arcs: boolean;
  skinOpacity: number;
  muscleOpacity: number;
}

const PRESETS: Record<string, { label: string; cfg: LayerConfig }> = {
  ALL: {
    label: 'ALL LAYERS',
    cfg: { skin: true, muscles: true, vascular: true, skeleton: true, arcs: true, skinOpacity: 0.14, muscleOpacity: 0.35 },
  },
  SKIN_ONLY: {
    label: 'SKIN ONLY',
    cfg: { skin: true, muscles: false, vascular: false, skeleton: false, arcs: true, skinOpacity: 0.92, muscleOpacity: 0.3 },
  },
  MUSCLE_BONE: {
    label: 'MUSCLE + BONE',
    cfg: { skin: false, muscles: true, vascular: false, skeleton: true, arcs: true, skinOpacity: 0.1, muscleOpacity: 0.55 },
  },
  VASCULAR: {
    label: 'VASCULAR / X-RAY',
    cfg: { skin: true, muscles: false, vascular: true, skeleton: true, arcs: true, skinOpacity: 0.08, muscleOpacity: 0.25 },
  },
  SKELETON: {
    label: 'SKELETON ONLY',
    cfg: { skin: false, muscles: false, vascular: false, skeleton: true, arcs: false, skinOpacity: 0.1, muscleOpacity: 0.3 },
  },
};

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function liveMetricForNode(
  node: ProjectedAnatomicalNode,
  s: ScenarioState,
): { badgeValue: string; detailSummary: string; tab: TargetTab; tabLabel: string } {
  if (!node.observed && node.observationState === 'UNOBSERVED_NO_RR') {
    return {
      badgeValue: 'NO R-R DATA',
      detailSummary:
        'Unobserved autonomic channel (Issue #11: beat-to-beat R-R intervals unavailable; cell intentionally neutral gray rather than nominal cyan).',
      tab: 'FORECAST',
      tabLabel: 'Open Forecast',
    };
  }

  switch (node.region) {
    case 'EyeOcularSans':
      return {
        badgeValue: `${s.onsdMm.toFixed(2)} mm`,
        detailSummary: `Optic nerve sheath diameter ${s.onsdMm.toFixed(2)} mm. Translaminar gradient rises with cephalad fluid shift and cabin ppCO2.`,
        tab: 'POCUS',
        tabLabel: 'Open Eye Ultrasound',
      };
    case 'InternalJugularVein':
      return {
        badgeValue: `${s.tauW.toFixed(2)} dyn/cm2`,
        detailSummary: `IJV wall shear stress ${s.tauW.toFixed(2)} dyn/cm2, CSA ${s.csa.toFixed(2)} cm2. LBNP countermeasure restores venous outflow.`,
        tab: 'POCUS',
        tabLabel: 'Open Neck Ultrasound',
      };
    case 'HeartCardioAutonomic':
      return {
        badgeValue: s.hrAccepted ? `${Math.round(s.hr)} bpm` : 'SQI HOLD',
        detailSummary: `Cardiac autonomic / baroreflex node (${s.hrAccepted ? `${Math.round(s.hr)} bpm` : 'HR rejected by SQI'}). Coupled to IJV preload and CNS vagal drive.`,
        tab: 'FORECAST',
        tabLabel: 'Open Forecast',
      };
    case 'SoleusCalcaneus':
      return {
        badgeValue: `${s.soleusMm.toFixed(1)} mm`,
        detailSummary: `Soleus ${s.soleusMm.toFixed(1)} mm (-${s.soleusLossPct.toFixed(1)}%), sclerostin ${s.sclerostin.toFixed(0)} pmol/L, calcaneus BMD -${s.bmdLossPct.toFixed(1)}%.`,
        tab: 'MUSCLE_BONE',
        tabLabel: 'Open Muscle & Bone',
      };
    case 'BrainVestibularCns':
      return {
        badgeValue: `${Math.round(node.propagatedIntensity * 100)}% stress`,
        detailSummary:
          'Neuro-vestibular & cerebral outflow hub receiving cephalad venous impedance and otolith proprioceptive coupling.',
        tab: 'FORECAST',
        tabLabel: 'Open Forecast',
      };
  }
}

function SpatialNodePin({
  node,
  badgeValue,
  isHottest,
  selected,
  onSelect,
}: {
  node: ProjectedAnatomicalNode;
  badgeValue: string;
  isHottest: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const intensity = selected ? 3.0 : isHottest ? 2.4 : node.observed ? 1.3 : 0.35;
  const radius = selected ? 0.068 : isHottest ? 0.056 : 0.046;

  return (
    <group position={node.worldPosition}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={intensity}
        />
      </mesh>
      <Html distanceFactor={5.5} position={[0.12, 0, 0]}>
        <button
          type="button"
          onClick={onSelect}
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: node.color,
            whiteSpace: 'nowrap',
            background: selected ? 'rgba(34,211,238,0.18)' : 'rgba(0,0,0,0.82)',
            border: selected ? `1px solid ${node.color}` : '1px solid rgba(55,65,81,0.8)',
            padding: '4px 8px',
            minHeight: 32,
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {node.uberonCurie} {node.key.toUpperCase()}: {badgeValue}
          {isHottest ? ' [HOT]' : ''}
        </button>
      </Html>
    </group>
  );
}

export interface BodyHeatmapProps {
  s: ScenarioState;
  sex: CrewSex;
  hypergraphSpatial?: HypergraphSpatialSummary | null;
  isLocalSimulation?: boolean;
  modelValidationStatus?: ModelValidationStatus | string | null;
  onChangeSex?: (sex: CrewSex) => void;
  onOpenTab?: (tab: TargetTab) => void;
}

export function BodyHeatmap({
  s,
  sex,
  hypergraphSpatial,
  isLocalSimulation = false,
  modelValidationStatus,
  onChangeSex,
  onOpenTab,
}: BodyHeatmapProps) {
  const [cfg, setCfg] = useState<LayerConfig>(PRESETS.ALL.cfg);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [glbEnabled, setGlbEnabled] = useState(false);
  const [glbStatus, setGlbStatus] = useState<GlbLoadStatus>('OFF');
  const [glbDetail, setGlbDetail] = useState('Procedural anatomical mesh active');

  const handleGlbStatus = useCallback((status: GlbLoadStatus, detail: string) => {
    setGlbStatus(status);
    setGlbDetail(detail);
  }, []);

  const localFallback = useMemo(
    () =>
      isLocalSimulation || !hypergraphSpatial?.cells
        ? {
            eye_ocular_sans: { intensity: clamp01((1 - s.rho.onsd) / 2), observed: true },
            internal_jugular_vein: { intensity: clamp01((1 - s.rho.tau_w) / 2), observed: true },
            heart_cardio_autonomic: { intensity: 0, observed: s.hrAccepted },
            soleus_calcaneus: {
              intensity: clamp01((1 - Math.min(s.rho.soleus, s.rho.sclerostin)) / 2),
              observed: true,
            },
            brain_vestibular_cns: { intensity: clamp01((1 - s.rho.ppco2) / 2), observed: true },
          }
        : undefined,
    [isLocalSimulation, hypergraphSpatial, s],
  );

  const scene = useMemo(
    () => projectHypergraphTo3D(hypergraphSpatial, localFallback),
    [hypergraphSpatial, localFallback],
  );

  const skinOnly = cfg.skin && !cfg.skeleton && !cfg.muscles && !cfg.vascular;

  const toggle = (k: 'skin' | 'muscles' | 'vascular' | 'skeleton' | 'arcs') =>
    setCfg((c) => ({
      ...c,
      [k]: !c[k],
      skinOpacity: k === 'skin' && !c.skin ? 0.14 : c.skinOpacity,
    }));

  const selectedNode = selected ? scene.nodesByRegion[selected] : null;
  const selectedMetrics = selectedNode ? liveMetricForNode(selectedNode, s) : null;
  const relatedArcs = selectedNode
    ? scene.arcs.filter(
        (a) => a.sourceRegion === selectedNode.region || a.targetRegion === selectedNode.region,
      )
    : [];

  return (
    <div className="flex h-full flex-col gap-2 bg-black">
      {/* Top bar: Presets + Biological Profile Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 font-mono text-xs">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCfg(p.cfg)}
              className="min-h-[44px] min-w-[44px] cursor-pointer rounded border border-line bg-black px-2.5 py-2 text-gray-300 hover:border-nominal hover:text-nominal"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGlbEnabled((v) => !v)}
            className={`min-h-[44px] min-w-[44px] cursor-pointer rounded border px-3 py-2 text-xs font-semibold transition-colors ${
              glbEnabled
                ? 'border-nominal bg-nominal/10 text-nominal'
                : 'border-line bg-black text-gray-400 hover:border-gray-600'
            }`}
          >
            NASA LOCAL GLB OVERLAY: {glbEnabled ? glbStatus : 'OFF'}
          </button>

          {onChangeSex && (
            <div className="flex items-center gap-2 rounded-full border border-gray-700 bg-black px-2.5 py-1">
              <span className="text-[10px] tracking-wider text-gray-400">BODY PROFILE</span>
              <div className="flex rounded-full bg-black p-0.5">
                {(['MALE', 'FEMALE'] as const).map((g) => {
                  const active = sex === g;
                  const activeCls =
                    g === 'MALE'
                      ? 'bg-sky-400 text-black font-bold'
                      : 'bg-fuchsia-400 text-black font-bold';
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => onChangeSex(g)}
                      className={`min-h-[44px] min-w-[44px] cursor-pointer rounded-full px-3 py-1 text-[11px] transition-colors ${
                        active ? activeCls : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Individual Layer Toggles */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
        <span className="mr-1 text-gray-500">LAYERS:</span>
        {([
          ['skin', 'Skin'],
          ['muscles', 'Muscles'],
          ['vascular', 'Vascular/Neuro'],
          ['skeleton', 'Skeleton'],
          ['arcs', 'UBERON & Conduction Arcs'],
        ] as const).map(([key, lbl]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`min-h-[44px] min-w-[44px] cursor-pointer rounded border px-2.5 py-2 ${
              cfg[key]
                ? 'border-nominal bg-nominal/15 text-nominal'
                : 'border-line bg-black text-gray-500'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Spatial Hypergraph & Deontic Habitat HUD Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-black px-3 py-1.5 font-mono text-[11px]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-gray-400">
            HOTTEST:{' '}
            <span className="font-semibold text-nominal">
              {scene.hottestRegion
                ? `${scene.hottestRegion} (${scene.nodesByRegion[scene.hottestRegion].uberonCurie})`
                : 'NONE'}
            </span>
          </span>
          <span className={scene.violatesPolicy ? 'font-bold text-critical' : 'text-gray-400'}>
            ZONE: {scene.habitatZone ?? 'UNSPECIFIED'}
            {scene.violatesPolicy ? ' [POLICY VIOLATION]' : ''}
          </span>
          {scene.rhoCurrentLocation !== null && (
            <span className="text-gray-400">
              rho_loc: <span className="text-gray-200">{scene.rhoCurrentLocation.toFixed(2)}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scene.biokgClause && (
            <span className="rounded border border-caution/50 px-1.5 py-0.5 text-[10px] text-caution">
              BioKG: {scene.biokgClause}
            </span>
          )}
          <span className="rounded border border-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
            {modelValidationStatus ?? 'ILLUSTRATIVE_UNVALIDATED'} | {glbDetail}
          </span>
        </div>
      </div>

      {/* 3D Layered Viewport */}
      <div className="relative min-h-0 flex-1 rounded border border-line bg-black">
        <Canvas
          camera={{ position: [0, 0.45, 3.3], fov: 45 }}
          style={{ background: '#000000' }}
          onPointerMissed={() => setSelected(null)}
        >
          <ambientLight intensity={0.55} />
          <pointLight position={[2.5, 3, 3]} intensity={28} />
          <pointLight position={[-2.5, 1.5, 2]} intensity={14} color="#e2e8f0" />
          <pointLight position={[0, 1, -3]} intensity={12} color="#22d3ee" />

          {cfg.skeleton && <SkeletonLayer s={s} sex={sex} />}
          {cfg.vascular && <VascularNeuroLayer s={s} nodesByRegion={scene.nodesByRegion} />}
          {cfg.muscles && (
            <MusclesLayer
              s={s}
              opacity={cfg.muscleOpacity}
              sex={sex}
              soleusNode={scene.nodesByRegion.SoleusCalcaneus}
            />
          )}
          {cfg.skin && <SkinLayer opacity={cfg.skinOpacity} sex={sex} skinOnly={skinOnly} />}

          <NasaGlbAssetLayer enabled={glbEnabled} onStatusChange={handleGlbStatus} />

          {cfg.arcs && (
            <>
              {scene.nodes.map((node) => {
                const m = liveMetricForNode(node, s);
                return (
                  <SpatialNodePin
                    key={node.region}
                    node={node}
                    badgeValue={m.badgeValue}
                    isHottest={scene.hottestRegion === node.region}
                    selected={selected === node.region}
                    onSelect={() => setSelected(node.region)}
                  />
                );
              })}

              {scene.arcs.map((arc) => (
                <QuadraticBezierLine
                  key={arc.id}
                  start={arc.sourcePos}
                  end={arc.targetPos}
                  mid={arc.midPoint}
                  color={arc.color}
                  lineWidth={1.2 + arc.fluxIntensity * 2.4}
                  dashed={arc.dashed}
                />
              ))}
            </>
          )}

          <OrbitControls target={[0, 0.45, 0]} enablePan={false} minDistance={1.8} maxDistance={6.5} />
        </Canvas>

        {/* Selected UBERON node details */}
        {selectedNode && selectedMetrics && (
          <div className="absolute right-3 bottom-3 left-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-nominal bg-black/95 p-3 backdrop-blur">
            <div className="min-w-0 flex-1 font-mono">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-nominal">
                <span>
                  {selectedNode.label} [{selectedNode.uberonCurie}]
                </span>
                <span
                  className="rounded border px-1.5 py-0.5 text-[10px]"
                  style={{ borderColor: selectedNode.color, color: selectedNode.color }}
                >
                  {selectedNode.observationState}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-300">{selectedMetrics.detailSummary}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-gray-400">
                <span>Local: {(selectedNode.localIntensity * 100).toFixed(0)}%</span>
                <span>Propagated: {(selectedNode.propagatedIntensity * 100).toFixed(0)}%</span>
                <span>
                  Arcs:{' '}
                  {relatedArcs
                    .map((a) => `${a.mechanism} (${a.couplingWeight.toFixed(2)})`)
                    .join(' | ')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              {onOpenTab && (
                <button
                  type="button"
                  onClick={() => onOpenTab(selectedMetrics.tab)}
                  className="min-h-[44px] min-w-[44px] cursor-pointer rounded border border-nominal bg-nominal px-3 py-2 font-bold text-black hover:opacity-90"
                >
                  {selectedMetrics.tabLabel} -&gt;
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="min-h-[44px] min-w-[44px] cursor-pointer rounded border border-line bg-black px-3 py-2 text-gray-300 hover:text-white"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
