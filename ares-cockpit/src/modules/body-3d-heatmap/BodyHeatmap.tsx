import { ArrowRightIcon } from '@phosphor-icons/react';
import { CockpitSelect } from '../ui-primitives/CockpitControls';
import { lazy, memo, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { equalTelemetryValue } from '../../lib/equalTelemetryValue';
import { DeferredPanel } from '../ui-primitives/DeferredPanel';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import {useRenderQuality} from './useRenderQuality';
import type {RenderProfile} from '../../lib/renderQuality';
import type { CrewSex, ScenarioState } from '../../lib/scenario';
import {
  INJURY_REGIONS,
  type InjuryMarker,
  type InjuryRegionId,
  type InjurySeverity,
} from '../../types/injury';
import type {
  AnatomicalRegionWireId,
  CrystallizedPlaybookId,
  HypergraphSpatialSummary,
  ModelValidationStatus,
} from '../../types/telemetry';
const AiInjuryModal = lazy(() => import('./AiInjuryModal').then(m => ({default:m.AiInjuryModal})));
import {
  CephaladFluidShift,
  MusclesLayer,
  SkeletonLayer,
  SkinLayer,
  VascularNeuroLayer,
  type V3,
} from './AnatomicalLayers';
import type { AtlasAnchors } from './AtlasBody';
const ATLAS_CAMERA: { position: [number, number, number]; fov: number } = {
  position: [0, 0.45, 4.5],
  fov: 45,
};
const ATLAS_TARGET: [number, number, number] = [0, 0.45, 0];
const PAIRED_DEPTHS = ['Skin', 'Muscles', 'Organs and vessels', 'Skeleton'] as const;
const PairedAtlasBody = lazy(() => import('./PairedAtlasBody').then(m => ({ default: m.PairedAtlasBody })));
const AtlasBody = lazy(() => import('./AtlasBody').then(m => ({default:m.AtlasBody})));
import { GlbAssetErrorBoundary, NasaGlbAssetLayer, type GlbLoadStatus } from './NasaGlbAssetLayer';
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
  organs: boolean;
  skeleton: boolean;
  markers: boolean;
  skinOpacity: number;
  muscleOpacity: number;
}

const PRESETS: Record<string, { label: string; cfg: LayerConfig }> = {
  ALL: {
    label: 'ALL LAYERS',
    cfg: {
      skin: true,
      muscles: true,
      vascular: true,
      organs: true,
      skeleton: true,
      markers: true,
      skinOpacity: 0.14,
      muscleOpacity: 0.35,
    },
  },
  SKIN_ONLY: {
    label: 'SKIN ONLY',
    cfg: {
      skin: true,
      muscles: false,
      vascular: false,
      organs: false,
      skeleton: false,
      markers: true,
      skinOpacity: 0.92,
      muscleOpacity: 0.3,
    },
  },
  MUSCLE_BONE: {
    label: 'MUSCLE + BONE',
    cfg: {
      skin: false,
      muscles: true,
      vascular: false,
      organs: false,
      skeleton: true,
      markers: true,
      skinOpacity: 0.1,
      muscleOpacity: 0.55,
    },
  },
  VASCULAR: {
    label: 'VASCULAR / X-RAY',
    cfg: {
      skin: true,
      muscles: false,
      vascular: true,
      organs: true,
      skeleton: true,
      markers: true,
      skinOpacity: 0.08,
      muscleOpacity: 0.25,
    },
  },
  SKELETON: {
    label: 'SKELETON ONLY',
    cfg: {
      skin: false,
      muscles: false,
      vascular: false,
      organs: false,
      skeleton: true,
      markers: false,
      skinOpacity: 0.1,
      muscleOpacity: 0.3,
    },
  },
};

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function liveMetricForNode(
  node: ProjectedAnatomicalNode,
  s: ScenarioState | null,
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

  if (s === null) {
    return {
      badgeValue: 'UNAVAILABLE',
      detailSummary:
        'Pure terrestrial BIDMC replay: microgravity organ models are not inferred from terrestrial ECG/PPG alone. Engage What-If Scenario Overlay to simulate 3D physiological load.',
      tab: node.region === 'EyeOcularSans' || node.region === 'InternalJugularVein' ? 'POCUS' : node.region === 'SoleusCalcaneus' ? 'MUSCLE_BONE' : 'FORECAST',
      tabLabel:
        node.region === 'EyeOcularSans' || node.region === 'InternalJugularVein'
          ? 'Open Ultrasound'
          : node.region === 'SoleusCalcaneus'
            ? 'Open Muscle & Bone'
            : 'Open Forecast',
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
  worldPosition,
  selected,
  onSelect,
}: {
  node: ProjectedAnatomicalNode;
  worldPosition: V3;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <group position={worldPosition}>
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
        <sphereGeometry args={[0.044, 12, 12]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      <mesh raycast={() => {}}>
        <sphereGeometry args={[selected ? 0.021 : 0.014, 12, 12]} />
        <meshBasicMaterial color={node.color} depthTest={false} depthWrite={false} transparent />
      </mesh>
    </group>
  );
}

function InjuryPoint({
  position,
  onClick,
}: {
  position: V3;
  onClick: () => void;
}) {
  const color = '#a3e635';
  return (
    <group position={position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.044, 12, 12]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      <mesh raycast={() => {}}>
        <sphereGeometry args={[0.017, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent />
      </mesh>
    </group>
  );
}

import { WebGlErrorBoundary } from './webglErrorBoundary';

export function Body2DFallbackSvg({
  nodes,
  hottestRegion,
  onSelect,
  reason,
}: {
  nodes: ProjectedAnatomicalNode[];
  hottestRegion: AnatomicalRegionWireId | null;
  onSelect: (region: AnatomicalRegionWireId) => void;
  reason?: string;
}) {
  const posMap: Record<AnatomicalRegionWireId, { x: number; y: number }> = {
    BrainVestibularCns: { x: 110, y: 34 },
    EyeOcularSans: { x: 110, y: 50 },
    InternalJugularVein: { x: 122, y: 80 },
    HeartCardioAutonomic: { x: 106, y: 125 },
    SoleusCalcaneus: { x: 92, y: 270 },
  };
  return (
    <div
      data-testid="body-2d-fallback-container"
      role="region"
      aria-label="2D Anatomical Clinical Telemetry Fallback"
      className="flex h-full flex-col items-center justify-center p-4 font-mono text-xs text-gray-300"
    >
      <div data-testid="webgl-degraded-banner" className="mb-2 text-advisory">
        {reason
          ? `2D DETERMINISTIC VECTOR MODE ACTIVE (${reason})`
          : 'WebGL unavailable: displaying 2D UBERON anatomical schematic fallback'}
      </div>
      <svg viewBox="0 0 220 340" className="h-72 w-48" role="img" aria-label="2D anatomical organ fallback">
        <circle cx="110" cy="44" r="24" fill="#0a0a0a" stroke="#1f2937" strokeWidth="2" />
        <rect x="78" y="76" width="64" height="106" rx="18" fill="#0a0a0a" stroke="#1f2937" strokeWidth="2" />
        <rect x="82" y="184" width="24" height="122" rx="8" fill="#0a0a0a" stroke="#1f2937" strokeWidth="2" />
        <rect x="114" y="184" width="24" height="122" rx="8" fill="#0a0a0a" stroke="#1f2937" strokeWidth="2" />
        {nodes.map((n) => {
          const p = posMap[n.region];
          return (
            <g key={n.region} onClick={() => onSelect(n.region)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={hottestRegion === n.region ? 8 : 6} fill={n.color} />
              <text x={p.x + 12} y={p.y + 4} fill={n.color} fontSize="8" fontFamily="monospace">
                {n.uberonCurie}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface BodyHeatmapProps {
  renderingActive?: boolean;
  s: ScenarioState | null;
  sex: CrewSex;
  hypergraphSpatial?: HypergraphSpatialSummary | null;
  isLocalSimulation?: boolean;
  modelValidationStatus?: ModelValidationStatus | string | null;
  injuries?: InjuryMarker[];
  onAddInjury?: (injury: InjuryMarker) => void;
  onResolveInjury?: (id: string) => void;
  onChangeSex?: (sex: CrewSex) => void;
  onOpenTab?: (tab: TargetTab) => void;
  onOpenPlaybook?: (playbookId?: CrystallizedPlaybookId) => void;
}

function BodyHeatmapView({
  renderingActive=true,
  s,
  sex,
  hypergraphSpatial,
  isLocalSimulation = false,
  modelValidationStatus,
  injuries = [],
  onAddInjury,
  onResolveInjury,
  onChangeSex,
  onOpenTab,
  onOpenPlaybook,
}: BodyHeatmapProps) {
  const quality=useRenderQuality(renderingActive);
  const [cfg, setCfg] = useState<LayerConfig>(PRESETS.ALL.cfg);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [bodyModel, setBodyModel] = useState<'paired' | 'atlas' | 'rig'>('paired');
  const depthId = useId();
  const [depth, setDepth] = useState(0);
  const [atlasFailed, setAtlasFailed] = useState(false);
  const [atlasAnchors, setAtlasAnchors] = useState<AtlasAnchors | null>(null);
  const [glbEnabled, setGlbEnabled] = useState(false);
  const [glbStatus, setGlbStatus] = useState<GlbLoadStatus>('OFF');
  const [glbDetail, setGlbDetail] = useState('Procedural anatomical mesh active');

  const [contextLost, setContextLost] = useState<boolean>(false);
  const canvasDomRef = useRef<HTMLCanvasElement | null>(null);

  const handleContextLost = useCallback((event: Event) => {
    event.preventDefault();
    setContextLost(true);
  }, []);

  const handleContextRestored = useCallback(() => {
    setContextLost(false);
  }, []);

  const detachCanvasListeners = useCallback(() => {
    if (canvasDomRef.current) {
      canvasDomRef.current.removeEventListener('webglcontextlost', handleContextLost);
      canvasDomRef.current.removeEventListener('webglcontextrestored', handleContextRestored);
      canvasDomRef.current = null;
    }
  }, [handleContextLost, handleContextRestored]);

  useEffect(() => {
    return () => {
      detachCanvasListeners();
    };
  }, [detachCanvasListeners]);

  const handleCanvasCreated = useCallback(
    (rootState: { gl: { domElement: HTMLCanvasElement } }) => {
      detachCanvasListeners();
      const domElement = rootState.gl.domElement;
      canvasDomRef.current = domElement;
      domElement.addEventListener('webglcontextlost', handleContextLost, false);
      domElement.addEventListener('webglcontextrestored', handleContextRestored, false);
    },
    [detachCanvasListeners, handleContextLost, handleContextRestored]
  );

  // Injury modal & manual marker state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRegion, setModalRegion] = useState<InjuryRegionId>('LEFT_FOREARM');
  const [modalInitialImage, setModalInitialImage] = useState<File | undefined>(undefined);
  const [editingInjury, setEditingInjury] = useState<InjuryMarker | null>(null);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualRegion, setManualRegion] = useState<InjuryRegionId>('LEFT_FOREARM');
  const [manualSeverity, setManualSeverity] = useState<InjurySeverity>('MODERATE');
  const [manualTitle, setManualTitle] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleGlbStatus = useCallback((status: GlbLoadStatus, detail: string) => {
    setGlbStatus(status);
    setGlbDetail(detail);
  }, []);

  const handleAnchors = useCallback((anchors: AtlasAnchors) => {
    setAtlasAnchors(anchors);
  }, []);

  const localFallback = useMemo(() => {
    if (s === null && !hypergraphSpatial?.cells) {
      return {
        eye_ocular_sans: { intensity: 0, observed: false },
        internal_jugular_vein: { intensity: 0, observed: false },
        heart_cardio_autonomic: { intensity: 0, observed: false },
        soleus_calcaneus: { intensity: 0, observed: false },
        brain_vestibular_cns: { intensity: 0, observed: false },
      };
    }
    if (s !== null && (isLocalSimulation || !hypergraphSpatial?.cells)) {
      return {
        eye_ocular_sans: { intensity: clamp01((1 - s.rho.onsd) / 2), observed: true },
        internal_jugular_vein: { intensity: clamp01((1 - s.rho.tau_w) / 2), observed: true },
        heart_cardio_autonomic: { intensity: 0, observed: s.hrAccepted },
        soleus_calcaneus: {
          intensity: clamp01((1 - Math.min(s.rho.soleus, s.rho.sclerostin)) / 2),
          observed: true,
        },
        brain_vestibular_cns: { intensity: clamp01((1 - s.rho.ppco2) / 2), observed: true },
      };
    }
    return undefined;
  }, [isLocalSimulation, hypergraphSpatial, s]);

  const scene = useMemo(
    () => projectHypergraphTo3D(hypergraphSpatial, localFallback),
    [hypergraphSpatial, localFallback],
  );

  const skinOnly = cfg.skin && !cfg.skeleton && !cfg.muscles && !cfg.vascular;

  const toggle = (k: 'skin' | 'muscles' | 'vascular' | 'organs' | 'skeleton' | 'markers') =>
    setCfg((c) => ({
      ...c,
      [k]: !c[k],
      skinOpacity: k === 'skin' && !c.skin ? 0.14 : c.skinOpacity,
    }));

  const selectedNode = selected ? scene.nodesByRegion[selected] : null;
  const selectedMetrics = selectedNode ? liveMetricForNode(selectedNode, s) : null;


  const handlePhotoSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditingInjury(null);
    setModalInitialImage(file);
    setModalRegion(manualRegion);
    setModalOpen(true);
    e.target.value = '';
  };

  const handleCreateManualInjury = () => {
    if (!onAddInjury) return;
    const meta = INJURY_REGIONS[manualRegion];
    onAddInjury({
      id: `manual-${manualRegion}-${Date.now()}`,
      region: manualRegion,
      title: manualTitle.trim() || meta.defaultTitle,
      severity: manualSeverity,
      methodId: 'MANUAL_CREW_ENTRY',
      validationStatus: 'ILLUSTRATIVE_UNVALIDATED',
      recommendedPlaybookId: meta.recommendedPlaybookId,
      summary: meta.defaultSummary,
      careSteps: meta.defaultCare,
      detectedAt: new Date().toISOString().slice(11, 19) + 'Z',
    });
    setManualTitle('');
    setManualFormOpen(false);
  };

  const openInjury = (injury: InjuryMarker) => {
    setEditingInjury(injury);
    setModalInitialImage(undefined);
    setModalOpen(true);
  };

  const effectiveAtlasActive = bodyModel !== 'rig' && !atlasFailed;
  const pairedActive = effectiveAtlasActive && bodyModel === 'paired';

  return (
    <div className="anatomical-explorer flex h-full flex-col gap-2 bg-black">
      <section className="atlas-preferences anatomy-toolbar" aria-label="Anatomy model and annotations">
      {/* Top bar: Presets + Atlas Toggle + Biological Profile Switch + Injury Triage */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 font-mono text-xs">
        <div className={pairedActive ? 'hidden' : 'flex flex-wrap gap-1.5'}>
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
          <label className="flex items-center gap-2 text-gray-300">
            Anatomy model
            <CockpitSelect
              className="rounded border border-line bg-black p-2"
              value={bodyModel}
              onChange={event => {
                const model = event.currentTarget.value;
                if (model !== 'paired' && model !== 'atlas' && model !== 'rig') return;
                setAtlasFailed(false);
                setAtlasAnchors(null);
                setBodyModel(model);
              }}
            >
              <option value="paired">Paired atlas</option>
              <option value="atlas">Z-Anatomy atlas</option>
              <option value="rig">Procedural model</option>
            </CockpitSelect>
          </label>

          {!effectiveAtlasActive && (
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
          )}

          {onAddInjury && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => {
                  setEditingInjury(null);
                  setModalInitialImage(undefined);
                  setModalOpen(true);
                }}
                className="min-h-[44px] cursor-pointer rounded border border-lime-400/70 bg-lime-950/25 px-3 py-2 font-bold text-lime-300 hover:bg-lime-400 hover:text-black"
              >
                Add photo
              </button>
              <button
                type="button"
                onClick={() => setManualFormOpen((v) => !v)}
                className="min-h-[44px] cursor-pointer rounded border border-line bg-black px-3 py-2 text-gray-200 hover:border-lime-400 hover:text-lime-300"
              >
                Add marker
              </button>
            </>
          )}

          {onChangeSex && !effectiveAtlasActive && (
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
      <div className="anatomy-layers flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Anatomy layers">
        <span className="mr-1 self-center px-1 text-gray-500">LAYERS:</span>
        {([
          ['skin', 'Skin'],
          ['muscles', 'Muscles'],
          ['vascular', 'Vascular/Neuro'],
          ['organs', 'Visceral/Organs'],
          ['skeleton', 'Skeleton'],
          ['markers', 'Region markers'],
        ] as const).filter(([key]) => !pairedActive || key === 'markers').map(([key, lbl]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={cfg[key]}
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

      {/* Manual Marker Form */}
      {manualFormOpen && onAddInjury && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-lime-400/50 bg-panel p-2.5 font-mono text-xs">
          <CockpitSelect
            aria-label="Manual marker region"
            value={manualRegion}
            onChange={(e) => setManualRegion(e.target.value as InjuryRegionId)}
            className="min-h-[44px] rounded border border-line bg-black px-2 py-1 text-gray-200"
          >
            {(Object.keys(INJURY_REGIONS) as InjuryRegionId[]).map((key) => (
              <option key={key} value={key}>
                {INJURY_REGIONS[key].label}
              </option>
            ))}
          </CockpitSelect>
          <CockpitSelect
            aria-label="Manual marker severity"
            value={manualSeverity}
            onChange={(e) => setManualSeverity(e.target.value as InjurySeverity)}
            className="min-h-[44px] rounded border border-line bg-black px-2 py-1 text-gray-200"
          >
            <option value="LOW">LOW</option>
            <option value="MODERATE">MODERATE</option>
            <option value="HIGH">HIGH</option>
          </CockpitSelect>
          <input
            type="text"
            placeholder="Note / injury description (optional)"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            className="min-h-[44px] min-w-[180px] flex-1 rounded border border-line bg-black px-2 py-1 text-gray-200"
          />
          <button
            type="button"
            onClick={handleCreateManualInjury}
            className="min-h-[44px] cursor-pointer rounded border border-lime-400 bg-lime-400 px-3 py-1 font-bold text-black hover:bg-lime-300"
          >
            Pin marker
          </button>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="min-h-[44px] cursor-pointer rounded border border-nominal px-3 py-1 text-nominal hover:bg-nominal/10"
          >
            Attach photo
          </button>
        </div>
      )}

      {/* Honest Pure-Replay Notice when ScenarioState is null */}
      {s === null && (
        <div className="rounded border border-advisory/60 bg-panel px-3 py-1.5 font-mono text-xs text-advisory">
          Data unavailable — pure terrestrial BIDMC replay: 3D microgravity organ load models remain unestimated until you engage the What-If Scenario Overlay (Simulated).
        </div>
      )}

      </section>

      {/* 3D Layered Viewport */}
      <div ref={quality.viewportRef} data-anatomy-model={pairedActive ? "paired" : effectiveAtlasActive ? "z-anatomy" : "procedural"} data-render-loop={quality.frameloop} data-render-dpr={quality.dpr} className="relative min-h-0 flex-1 rounded border border-line bg-black">
        {effectiveAtlasActive && !contextLost &&
          (!atlasAnchors || (pairedActive && atlasAnchors.profile !== sex)) && (
            <span role="status" className="pointer-events-none absolute top-3 left-3 z-10 rounded border border-line bg-black px-2 py-1 font-mono text-xs text-nominal">
              Loading anatomy
            </span>
          )}
        {contextLost ? (
          <Body2DFallbackSvg
            nodes={scene.nodes}
            hottestRegion={scene.hottestRegion}
            onSelect={(r) => setSelected(r)}
            reason="GPU WebGL Context Lost"
          />
        ) : (
          <WebGlErrorBoundary
            fallback={(errorMsg) => (
              <Body2DFallbackSvg
                nodes={scene.nodes}
                hottestRegion={scene.hottestRegion}
                onSelect={(r) => setSelected(r)}
                reason={errorMsg}
              />
            )}
          >
            <Canvas
              dpr={quality.dpr}
              frameloop={quality.frameloop}
              camera={ATLAS_CAMERA}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent' }}
              onPointerMissed={() => setSelected(null)}
              onCreated={handleCanvasCreated}
              fallback={
                <Body2DFallbackSvg
                  nodes={scene.nodes}
                  hottestRegion={scene.hottestRegion}
                  onSelect={(r) => setSelected(r)}
                />
              }
            >
          {quality.profile==='AUTO' && quality.active && !quality.reducedMotion && <PerformanceMonitor
            bounds={()=>[30,55]} flipflops={3}
            onChange={api=>quality.setFactor(api.factor)} onFallback={()=>quality.setFactor(0)}
          />}
          <ambientLight intensity={0.55} />
          <pointLight position={[2.5, 3, 3]} intensity={28} />
          <pointLight position={[-2.5, 1.5, 2]} intensity={14} color="#e2e8f0" />
          <pointLight position={[0, 1, -3]} intensity={12} color="#22d3ee" />

          {effectiveAtlasActive ? (
            <GlbAssetErrorBoundary
              key={bodyModel}
              onFallback={() => {
                setAtlasFailed(true);
                setBodyModel('rig');
                setAtlasAnchors(null);
              }}
            >
              <Suspense fallback={null}>
                {pairedActive ? (
                  <PairedAtlasBody key={sex} sex={sex} depth={depth} onAnchors={handleAnchors} />
                ) : (
                  <AtlasBody
                    s={s}
                    nodesByRegion={scene.nodesByRegion}
                    skeleton={cfg.skeleton}
                    muscles={cfg.muscles}
                    vascular={cfg.vascular}
                    organs={cfg.organs}
                    muscleOpacity={cfg.muscleOpacity}
                    selected={selected}
                    onSelect={(id) => setSelected(id)}
                    onAnchors={handleAnchors}
                  />
                )}
              </Suspense>
            </GlbAssetErrorBoundary>
          ) : (
            <>
              {cfg.skeleton && <SkeletonLayer s={s} sex={sex} />}
              {cfg.vascular && <VascularNeuroLayer s={s} sex={sex} nodesByRegion={scene.nodesByRegion} />}
              {cfg.vascular && <CephaladFluidShift s={s} sex={sex} visible={cfg.vascular} />}
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
            </>
          )}

          {cfg.markers && (
            <>
              {scene.nodes.map((node) => {
                const worldPosition =
                  effectiveAtlasActive && atlasAnchors
                    ? atlasAnchors.nodes[node.region]
                    : node.worldPosition;
                return (
                  <SpatialNodePin
                    key={node.region}
                    node={node}
                    worldPosition={worldPosition}
                    selected={selected === node.region}
                    onSelect={() => setSelected(node.region)}
                  />
                );
              })}


            </>
          )}

          {injuries.map((inj) => {
            const pos =
              effectiveAtlasActive && atlasAnchors
                ? atlasAnchors.injuries[inj.region]
                : INJURY_REGIONS[inj.region].pos;
            return (
              <InjuryPoint
                key={inj.id}
                position={pos}
                onClick={() => openInjury(inj)}
              />
            );
          })}

          <OrbitControls
            target={ATLAS_TARGET}
            zoomToCursor
            enablePan={false}
            enableDamping
            dampingFactor={0.05}
            minDistance={1.2}
            maxDistance={6.5}
          />
        </Canvas>
          </WebGlErrorBoundary>
        )}

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

              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              {onOpenTab && (
                <button
                  type="button"
                  onClick={() => onOpenTab(selectedMetrics.tab)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded border border-nominal bg-nominal px-3 py-2 font-bold text-black hover:opacity-90"
                >
                  {selectedMetrics.tabLabel} <ArrowRightIcon aria-hidden="true" size={15} />
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

      {pairedActive && (
        <div className="anatomy-depth">
          <label htmlFor={depthId}>Anatomical depth</label>
          <span>{PAIRED_DEPTHS[Math.round(depth)]}</span>
          <input
            id={depthId}
            type="range"
            min={0}
            max={PAIRED_DEPTHS.length - 1}
            step={0.01}
            value={depth}
            aria-valuetext={PAIRED_DEPTHS[Math.round(depth)]}
            onChange={event => setDepth(event.currentTarget.valueAsNumber)}
          />
          <div aria-hidden="true">{PAIRED_DEPTHS.map(layer => <span key={layer}>{layer}</span>)}</div>
        </div>
      )}

      {(cfg.markers || injuries.length > 0) && (
        <div className="anatomy-region-controls" aria-label="Anatomical indicators and marker controls" role="group">
          {cfg.markers && scene.nodes.map(node => (
            <button key={node.region} type="button" aria-pressed={selected === node.region}
              onClick={() => setSelected(node.region)}>
              <span className="anatomy-region-dot" style={{ backgroundColor: node.color }} />
              <span>{node.label}</span>
              <strong>{liveMetricForNode(node, s).badgeValue}</strong>
            </button>
          ))}
          {injuries.map(injury => (
            <button key={injury.id} type="button" onClick={() => openInjury(injury)}>
              <span className="anatomy-region-dot bg-lime-300" />
              <span>{INJURY_REGIONS[injury.region].label}</span>
              <strong>{injury.severity}</strong>
            </button>
          ))}
        </div>
      )}

      <label className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
        Render quality
        <CockpitSelect aria-label="Render quality" value={quality.profile} onChange={e=>quality.setProfile(e.target.value as RenderProfile)} className="rounded border border-line bg-black p-2">
          <option value="AUTO">Auto</option><option value="LITE">Lite</option><option value="STANDARD">Standard</option><option value="HIGH">High</option>
        </CockpitSelect>
        <span className="text-gray-400">{quality.dpr.toFixed(2)}× resolution{quality.profile==='LITE' || quality.reducedMotion ? ' · static anatomy; measurements stay live' : ' · adaptive display only'}</span>
      </label>

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
          {injuries.length > 0 && (
            <span className="text-lime-300">INJURY PINS: {injuries.length}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scene.biokgClause && (
            <span className="rounded border border-caution/50 px-1.5 py-0.5 text-[10px] text-caution">
              BioKG: {scene.biokgClause}
            </span>
          )}
          <span className="rounded border border-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
            {modelValidationStatus ?? 'ILLUSTRATIVE_UNVALIDATED'} |{' '}
            {pairedActive ? 'Paired atlas (CC BY 4.0)' : effectiveAtlasActive ? 'Z-Anatomy 5-GLB (CC BY-SA 4.0)' : glbDetail}
          </span>
        </div>
      </div>

      {onAddInjury && modalOpen && (
        <DeferredPanel name="injury annotation"><AiInjuryModal
          isOpen={modalOpen}
          initialRegion={modalRegion}
          initialImage={modalInitialImage}
          existingInjury={editingInjury}
          onClose={() => {
            setModalOpen(false);
            setEditingInjury(null);
            setModalInitialImage(undefined);
          }}
          onSaveInjury={onAddInjury}
          onResolveInjury={onResolveInjury}
          onOpenPlaybook={onOpenPlaybook}
        /></DeferredPanel>
      )}
    </div>
  );
}

export const BodyHeatmap = memo(BodyHeatmapView, (a, b) =>
  a.renderingActive === b.renderingActive &&
  a.sex === b.sex && a.isLocalSimulation === b.isLocalSimulation &&
  a.modelValidationStatus === b.modelValidationStatus && a.injuries === b.injuries &&
  a.onAddInjury === b.onAddInjury && a.onResolveInjury === b.onResolveInjury &&
  a.onChangeSex === b.onChangeSex && a.onOpenTab === b.onOpenTab &&
  a.onOpenPlaybook === b.onOpenPlaybook && equalTelemetryValue(a.s, b.s) &&
  equalTelemetryValue(a.hypergraphSpatial, b.hypergraphSpatial));
