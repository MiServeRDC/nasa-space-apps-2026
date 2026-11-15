import { CloseButton } from '../ui-primitives/CloseButton';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { CockpitSelect } from '../ui-primitives/CockpitControls';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { V3 } from './AnatomicalLayers';
import type { AtlasAnchors } from './AtlasBody';
const ATLAS_CAMERA: { position: [number, number, number]; fov: number } = {
  position: [0, 0.45, 3.95],
  fov: 45,
};
const ATLAS_TARGET: [number, number, number] = [0, 0.45, 0];
const PAIRED_DEPTHS = ['Skin', 'Muscles', 'Organs and vessels', 'Skeleton'] as const;
const PairedAtlasBody = lazy(() => import('./PairedAtlasBody').then(m => ({ default: m.PairedAtlasBody })));
import {
  projectHypergraphTo3D,
  type ProjectedAnatomicalNode,
} from './uberonSpatialMapping';

export type NodeId = AnatomicalRegionWireId;
export type TargetTab = 'POCUS' | 'MUSCLE_BONE' | 'FORECAST';

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
        <sphereGeometry args={[selected ? 0.023 : 0.016, 12, 12]} />
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
  const [showMarkers, setShowMarkers] = useState(true);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [layers, setLayers] = useState<number[]>([0]);
  const [atlasAnchors, setAtlasAnchors] = useState<AtlasAnchors | null>(null);
  const currentAnchors = atlasAnchors?.profile === sex ? atlasAnchors : null;

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
  const [editingInjury, setEditingInjury] = useState<InjuryMarker | null>(null);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualPoint, setManualPoint] = useState<InjuryMarker['placement']>();
  const pendingPoint = manualPoint?.profile === sex ? manualPoint : undefined;
  const [manualSeverity, setManualSeverity] = useState<InjurySeverity>('MODERATE');
  const [manualTitle, setManualTitle] = useState('');

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

  const selectedNode = selected && !manualFormOpen ? scene.nodesByRegion[selected] : null;
  const selectedMetrics = selectedNode ? liveMetricForNode(selectedNode, s) : null;


  useEffect(() => {
    if (!manualFormOpen) return;
    const cancelPlacement = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setManualPoint(undefined);
      setManualFormOpen(false);
    };
    window.addEventListener('keydown', cancelPlacement);
    return () => window.removeEventListener('keydown', cancelPlacement);
  }, [manualFormOpen]);

  const handleCreateManualInjury = () => {
    if (!onAddInjury || !pendingPoint || !currentAnchors) return;
    const distance = (region: InjuryRegionId) => currentAnchors.injuries[region]
      .reduce((sum, axis, index) => sum + (axis - pendingPoint.point[index]) ** 2, 0);
    const region = (Object.keys(currentAnchors.injuries) as InjuryRegionId[])
      .reduce((nearest, candidate) => distance(candidate) < distance(nearest) ? candidate : nearest);
    onAddInjury({
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      region,
      title: manualTitle.trim() || 'Body marker',
      severity: manualSeverity,
      methodId: 'MANUAL_CREW_ENTRY',
      validationStatus: 'ILLUSTRATIVE_UNVALIDATED',
      placement: pendingPoint,
      summary: 'Manually placed on the anatomical atlas.',
      careSteps: [],
      detectedAt: new Date().toISOString().slice(11, 19) + 'Z',
    });
    setManualPoint(undefined);
    setManualTitle('');
    setManualFormOpen(false);
  };

  const visibleInjuries = injuries.filter(injury => !injury.placement || injury.placement.profile === sex);
  const [inspectedMarker, setInspectedMarker] = useState<string | null>(null);
  const markerDetails = !manualFormOpen && visibleInjuries.find(injury => injury.id === inspectedMarker && injury.placement);
  const openInjury = (injury: InjuryMarker) => {
    if (injury.placement) {
      setSelected(null);
      setInspectedMarker(injury.id);
      return;
    }
    setEditingInjury(injury);
    setModalOpen(true);
  };

  return (
    <div className="anatomical-explorer flex h-full flex-col gap-2 bg-black">
      <section className="atlas-preferences anatomy-toolbar" aria-label="Anatomy model and annotations">
        <div className="anatomy-toolbar-row">
          {onChangeSex && (
            <div className="anatomy-segments" role="group" aria-label="Body profile">
              <button type="button" aria-pressed={sex === 'MALE'} onClick={() => onChangeSex('MALE')}>Male</button>
              <button type="button" aria-pressed={sex === 'FEMALE'} onClick={() => onChangeSex('FEMALE')}>Female</button>
            </div>
          )}
          <div className="anatomy-annotations">
            {onAddInjury && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditingInjury(null);
                    setModalOpen(true);
                  }}
                  className="act-secondary-button anatomy-photo-button"
                >
                  Add photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualPoint(undefined);
                    setManualFormOpen((v) => !v);
                  }}
                  aria-pressed={manualFormOpen}
                  disabled={!manualFormOpen && (!currentAnchors || contextLost)}
                  className="act-secondary-button"
                >
                  {manualFormOpen ? 'Cancel marker' : 'Add marker'}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="anatomy-toolbar-row">
          <div className="anatomy-segments" role="group" aria-label="Anatomical layers">
            {PAIRED_DEPTHS.map((layer, index) => (
              <button key={layer} type="button" aria-pressed={layers.includes(index)}
                disabled={layers.length === 1 && layers.includes(index)}
                onClick={() => setLayers(active => active.includes(index)
                  ? active.filter(layer => layer !== index) : [...active, index])}>{layer}</button>
            ))}
          </div>
          <label className="anatomy-marker-toggle">
            <input type="checkbox" checked={showMarkers} onChange={event => setShowMarkers(event.currentTarget.checked)} />
            Region markers
          </label>
        </div>

      {/* Manual Marker Form */}
      {manualFormOpen && onAddInjury && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-lime-400/50 bg-panel p-2.5 font-mono text-xs">
          <p className="w-full" role="status">{pendingPoint
            ? 'Point selected. Click the body again to move it.'
            : 'Click the body where you want to place the marker.'}</p>
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
            disabled={!pendingPoint}
            className="min-h-[44px] cursor-pointer rounded border border-lime-400 bg-lime-400 px-3 py-1 font-bold text-black hover:bg-lime-300"
          >
            Pin marker
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
      <div ref={quality.viewportRef} data-anatomy-model="paired" data-body-profile={currentAnchors?.profile} data-anatomy-layer={layers.map(layer => PAIRED_DEPTHS[layer]).join(",")} data-placing-marker={manualFormOpen} data-render-loop={quality.frameloop} data-render-dpr={quality.dpr} className="relative min-h-0 flex-1 rounded border border-line bg-black">
        {!contextLost && !currentAnchors && (
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
          <pointLight position={[0, 1, -3]} intensity={12} color="#c4d6e1" />

          <Suspense fallback={null}>
            <PairedAtlasBody key={sex} sex={sex} layers={layers} onAnchors={handleAnchors}
              onSurfaceClick={manualFormOpen ? point => setManualPoint({ profile: sex, point }) : undefined} />
          </Suspense>

          {showMarkers && currentAnchors && !manualFormOpen && (
            <>
              {scene.nodes.map((node) => {
                const worldPosition = currentAnchors.nodes[node.region];
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

          {pendingPoint && <mesh position={pendingPoint.point} renderOrder={10}>
            <sphereGeometry args={[0.025, 12, 12]} />
            <meshBasicMaterial color="#f7ce7c" depthTest={false} />
          </mesh>}
          {currentAnchors && !manualFormOpen && visibleInjuries.map((inj) => {
            const pos = inj.placement?.point ?? currentAnchors.injuries[inj.region];
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

        {markerDetails && (
          <div className="anatomy-marker-details">
            <div><strong>{markerDetails.title}</strong><p>{markerDetails.severity.toLowerCase()} severity</p></div>
            {onResolveInjury && <button type="button" className="act-secondary-button"
              onClick={() => { onResolveInjury(markerDetails.id); setInspectedMarker(null); }}>Remove marker</button>}
            <CloseButton onClick={() => setInspectedMarker(null)} />
          </div>
        )}
        {/* Selected UBERON node details */}
        {selectedNode && selectedMetrics && !markerDetails && (
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
              <CloseButton onClick={() => setSelected(null)} />
            </div>
          </div>
        )}
      </div>

      {!manualFormOpen && (showMarkers || visibleInjuries.length > 0) && (
        <div className="anatomy-region-controls" aria-label="Anatomical indicators and marker controls" role="group">
          {showMarkers && scene.nodes.map(node => (
            <button key={node.region} type="button" aria-pressed={selected === node.region}
              onClick={() => setSelected(node.region)}>
              <span className="anatomy-region-dot" style={{ backgroundColor: node.color }} />
              <span>{node.label}</span>
              <strong>{liveMetricForNode(node, s).badgeValue}</strong>
            </button>
          ))}
          {visibleInjuries.map(injury => (
            <button key={injury.id} type="button" onClick={() => openInjury(injury)}>
              <span className="anatomy-region-dot bg-lime-300" />
              <span>{injury.placement ? injury.title : INJURY_REGIONS[injury.region].label}</span>
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
            Paired atlas (CC BY 4.0)
          </span>
        </div>
      </div>

      {onAddInjury && modalOpen && (
        <DeferredPanel name="injury annotation"><AiInjuryModal
          isOpen={modalOpen}
          initialRegion={modalRegion}
          existingInjury={editingInjury}
          onClose={() => {
            setModalOpen(false);
            setEditingInjury(null);
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
