// UnobstructedTwinHero — Continuous 3D Anthropometric Biodigital Twin.
// Features an unobstructed central 3D viewport with zero overlapping cards in front
// of the humanoid body, 4-layer strata decomposition (Skin, Muscles, Organs/Vessels, Skeleton)
// for both Male and Female anthropometric profiles, UBERON topological spatial pins,
// interactive 3D surface injury placement, and real-time clinical telemetry integration.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import {
  ArrowRightIcon,
  CrosshairIcon,
  CameraIcon,
  EyeIcon,
  ShieldCheckIcon,
  SlidersIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { CrewSex, ScenarioState } from '../../lib/scenario';
import type {
  AnatomicalRegionWireId,
  HypergraphSpatialSummary,
  ModelValidationStatus,
} from '../../types/telemetry';
import {
  INJURY_REGIONS,
  type InjuryMarker,
  type InjuryRegionId,
  type InjurySeverity,
} from '../../types/injury';
import type { V3 } from '../../modules/body-3d-heatmap/AnatomicalLayers';
import type { AtlasAnchors } from '../../modules/body-3d-heatmap/AtlasBody';
import {
  projectHypergraphTo3D,
} from '../../modules/body-3d-heatmap/uberonSpatialMapping';
import { useRenderQuality } from '../../modules/body-3d-heatmap/useRenderQuality';
import { WebGlErrorBoundary } from '../../modules/body-3d-heatmap/webglErrorBoundary';
import {
  Body2DFallbackSvg,
  InjuryPoint,
  liveMetricForNode,
  SpatialNodePin,
  type TargetTab,
} from '../../modules/body-3d-heatmap/BodyHeatmap';
import type { RenderProfile } from '../../lib/renderQuality';
import { CockpitSelect } from '../../modules/ui-primitives/CockpitControls';

const PairedAtlasBody = lazy(() =>
  import('../../modules/body-3d-heatmap/PairedAtlasBody').then((m) => ({
    default: m.PairedAtlasBody,
  })),
);

// ---------------------------------------------------------------------------
// Constants & Camera
// ---------------------------------------------------------------------------

const ATLAS_CAMERA: { position: [number, number, number]; fov: number } = {
  position: [0, 0.45, 3.8],
  fov: 44,
};

const ATLAS_TARGET: [number, number, number] = [0, 0.45, 0];

const PAIRED_DEPTHS = [
  { index: 0, label: 'Skin', desc: 'Integumentary' },
  { index: 1, label: 'Muscles', desc: 'Musculoskeletal' },
  { index: 2, label: 'Organs & Vessels', desc: 'Cardioviscera' },
  { index: 3, label: 'Skeleton', desc: 'Mechanostat' },
] as const;

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

// ---------------------------------------------------------------------------
// Props Interface
// ---------------------------------------------------------------------------

export interface UnobstructedTwinHeroProps {
  /** Anthropometric biological sex profile ('MALE' | 'FEMALE'). */
  sex: CrewSex;
  onChangeSex: (sex: CrewSex) => void;
  /** Visible anatomical depth strata layers (0..3). */
  layers: readonly number[];
  onChangeLayers: (layers: readonly number[]) => void;
  /** Current physiological scenario state or null in pure terrestrial replay. */
  s: ScenarioState | null;
  /** Authoritative hypergraph spatial summary from engine. */
  hypergraphSpatial?: HypergraphSpatialSummary | null;
  /** True when running local client-side simulation. */
  isLocalSimulation?: boolean;
  /** Validation status token. */
  modelValidationStatus?: ModelValidationStatus | string | null;
  /** Active clinical injury markers. */
  injuries?: InjuryMarker[];
  /** Callback to persist an injury marker. */
  onAddInjury?: (injury: InjuryMarker) => void;
  /** Callback to resolve/delete an injury marker. */
  onResolveInjury?: (id: string) => void;
  /** Callback to open the AI Injury Inspector modal. */
  onOpenAiInjury?: (region?: InjuryRegionId) => void;
  /** Callback to jump to a specific clinical act/tab. */
  onOpenTab?: (tab: TargetTab) => void;
  /** Optional class name for the wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component Implementation
// ---------------------------------------------------------------------------

export function UnobstructedTwinHero({
  sex,
  onChangeSex,
  layers,
  onChangeLayers,
  s,
  hypergraphSpatial,
  isLocalSimulation = false,
  modelValidationStatus,
  injuries = [],
  onAddInjury,
  onResolveInjury,
  onOpenAiInjury,
  onOpenTab,
  className = '',
}: UnobstructedTwinHeroProps) {
  const quality = useRenderQuality(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<AnatomicalRegionWireId | null>(null);
  const [atlasAnchors, setAtlasAnchors] = useState<AtlasAnchors | null>(null);
  const currentAnchors = atlasAnchors?.profile === sex ? atlasAnchors : null;

  // WebGL context handling
  const [contextLost, setContextLost] = useState(false);
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
    return () => detachCanvasListeners();
  }, [detachCanvasListeners]);

  const handleCanvasCreated = useCallback(
    (rootState: { gl: { domElement: HTMLCanvasElement } }) => {
      detachCanvasListeners();
      const domElement = rootState.gl.domElement;
      canvasDomRef.current = domElement;
      domElement.addEventListener('webglcontextlost', handleContextLost, false);
      domElement.addEventListener('webglcontextrestored', handleContextRestored, false);
    },
    [detachCanvasListeners, handleContextLost, handleContextRestored],
  );

  // Manual interactive marker state
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualPoint, setManualPoint] = useState<InjuryMarker['placement']>();
  const pendingPoint = manualPoint?.profile === sex ? manualPoint : undefined;
  const [manualSeverity, setManualSeverity] = useState<InjurySeverity>('MODERATE');
  const [manualTitle, setManualTitle] = useState('');
  const [inspectedMarker, setInspectedMarker] = useState<string | null>(null);

  // Escape key cancels manual placement
  useEffect(() => {
    if (!manualFormOpen) return;
    const cancelPlacement = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setManualPoint(undefined);
        setManualFormOpen(false);
      }
    };
    window.addEventListener('keydown', cancelPlacement);
    return () => window.removeEventListener('keydown', cancelPlacement);
  }, [manualFormOpen]);

  // Handle anchor updates from PairedAtlasBody
  const handleAnchors = useCallback((anchors: AtlasAnchors) => {
    setAtlasAnchors(anchors);
  }, []);

  // Compute hypergraph scene projection
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

  const selectedNode = selectedNodeId && !manualFormOpen ? scene.nodesByRegion[selectedNodeId] : null;
  const selectedMetrics = selectedNode ? liveMetricForNode(selectedNode, s) : null;

  // Create manual injury pin
  const handleCreateManualInjury = () => {
    if (!onAddInjury || !pendingPoint || !currentAnchors) return;
    const distance = (region: InjuryRegionId) =>
      currentAnchors.injuries[region].reduce(
        (sum, axis, index) => sum + (axis - pendingPoint.point[index]) ** 2,
        0,
      );
    const region = (Object.keys(currentAnchors.injuries) as InjuryRegionId[]).reduce(
      (nearest, candidate) => (distance(candidate) < distance(nearest) ? candidate : nearest),
    );
    onAddInjury({
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      region,
      title: manualTitle.trim() || 'Physical injury marker',
      severity: manualSeverity,
      methodId: 'MANUAL_CREW_ENTRY',
      validationStatus: 'ILLUSTRATIVE_UNVALIDATED',
      placement: pendingPoint,
      summary: 'Manually placed on the continuous 3D anatomical atlas.',
      careSteps: [],
      detectedAt: new Date().toISOString().slice(11, 19) + 'Z',
    });
    setManualPoint(undefined);
    setManualTitle('');
    setManualFormOpen(false);
  };

  const visibleInjuries = injuries.filter(
    (injury) => !injury.placement || injury.placement.profile === sex,
  );
  const markerDetails =
    !manualFormOpen && visibleInjuries.find((i) => i.id === inspectedMarker && i.placement);

  // Toggle layer helper
  const handleToggleLayer = (index: number) => {
    if (layers.includes(index)) {
      if (layers.length > 1) {
        onChangeLayers(layers.filter((l) => l !== index));
      }
    } else {
      onChangeLayers([...layers, index].sort((a, b) => a - b));
    }
  };

  return (
    <div
      ref={quality.viewportRef}
      className={`relative w-full rounded-2xl border border-sky-500/25 bg-[#000000] overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.9)] ${className}`}
      style={{ minHeight: '580px', height: '70vh', maxHeight: '820px' }}
      aria-label="Continuous 3D Anthropometric Biodigital Twin Viewport"
    >
      {/* ------------------------------------------------------------------- */}
      {/* 1. BACKGROUND 3D R3F CANVAS (Completely Unobstructed in the center)  */}
      {/* ------------------------------------------------------------------- */}
      <div className="absolute inset-0 z-0">
        {!contextLost && !currentAnchors && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 pointer-events-none">
            <span className="rounded-lg border border-sky-400/40 bg-sky-950/80 px-4 py-2 font-mono text-sm font-semibold tracking-wider text-sky-300 animate-pulse">
              INITIALIZING ANATOMICAL ATLAS // {sex}
            </span>
          </div>
        )}

        {contextLost ? (
          <Body2DFallbackSvg
            nodes={scene.nodes}
            hottestRegion={scene.hottestRegion}
            onSelect={(r) => setSelectedNodeId(r)}
            reason="GPU WebGL Context Lost"
          />
        ) : (
          <WebGlErrorBoundary
            fallback={(errorMsg) => (
              <Body2DFallbackSvg
                nodes={scene.nodes}
                hottestRegion={scene.hottestRegion}
                onSelect={(r) => setSelectedNodeId(r)}
                reason={errorMsg}
              />
            )}
          >
            <Canvas
              dpr={quality.dpr}
              frameloop={quality.frameloop}
              camera={ATLAS_CAMERA}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                background: 'transparent',
              }}
              onPointerMissed={() => setSelectedNodeId(null)}
              onCreated={handleCanvasCreated}
              fallback={
                <Body2DFallbackSvg
                  nodes={scene.nodes}
                  hottestRegion={scene.hottestRegion}
                  onSelect={(r) => setSelectedNodeId(r)}
                />
              }
            >
              {quality.profile === 'AUTO' && quality.active && !quality.reducedMotion && (
                <PerformanceMonitor
                  bounds={() => [30, 55]}
                  flipflops={3}
                  onChange={(api) => quality.setFactor(api.factor)}
                  onFallback={() => quality.setFactor(0)}
                />
              )}

              {/* Enhanced Lighting Setup for High Contrast & Sharp Depth */}
              <ambientLight intensity={0.65} color="#e0f2fe" />
              <pointLight position={[2.5, 3.2, 3.0]} intensity={32} color="#ffffff" />
              <pointLight position={[-2.5, 1.8, 2.2]} intensity={18} color="#93c5fd" />
              <pointLight position={[0, 1.2, -3.2]} intensity={15} color="#cbd5e1" />

              {/* Dual-Sex Decomposing Anatomy Model */}
              <Suspense fallback={null}>
                <PairedAtlasBody
                  key={sex}
                  sex={sex}
                  layers={layers}
                  onAnchors={handleAnchors}
                  onSurfaceClick={
                    manualFormOpen
                      ? (point) => setManualPoint({ profile: sex, point })
                      : undefined
                  }
                />
              </Suspense>

              {/* 5 UBERON Spatial Node Pins */}
              {showMarkers && currentAnchors && !manualFormOpen && (
                <>
                  {scene.nodes.map((node) => {
                    const worldPosition = currentAnchors.nodes[node.region];
                    return (
                      <SpatialNodePin
                        key={node.region}
                        node={node}
                        worldPosition={worldPosition}
                        selected={selectedNodeId === node.region}
                        onSelect={() => setSelectedNodeId(node.region)}
                      />
                    );
                  })}
                </>
              )}

              {/* Pending Interactive Surface Pin Point */}
              {pendingPoint && (
                <mesh position={pendingPoint.point} renderOrder={10}>
                  <sphereGeometry args={[0.028, 16, 16]} />
                  <meshBasicMaterial color="#facc15" depthTest={false} />
                </mesh>
              )}

              {/* Active Clinical Injury Pins */}
              {currentAnchors &&
                !manualFormOpen &&
                visibleInjuries.map((inj) => {
                  const pos = inj.placement?.point ?? currentAnchors.injuries[inj.region];
                  return (
                    <InjuryPoint
                      key={inj.id}
                      position={pos}
                      onClick={() => {
                        setSelectedNodeId(null);
                        setInspectedMarker(inj.id);
                      }}
                    />
                  );
                })}

              {/* Smooth 360° OrbitControls */}
              <OrbitControls
                target={ATLAS_TARGET}
                zoomToCursor
                enablePan={false}
                enableDamping
                dampingFactor={0.05}
                minDistance={1.1}
                maxDistance={6.0}
              />
            </Canvas>
          </WebGlErrorBoundary>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 2. FLOATING TOP-LEFT HUD: Anthropometric Profile & Layer Strata      */}
      {/* ------------------------------------------------------------------- */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3 w-72 sm:w-80 pointer-events-auto">
        {/* Sex Profile Card */}
        <div className="rounded-xl border border-slate-700/80 bg-black/90 p-3 backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
              ANTHROPOMETRIC PROFILE
            </span>
            <span className="rounded bg-sky-950/70 border border-sky-400/50 px-2 py-0.5 font-mono text-xs font-semibold text-sky-200">
              {sex}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2.5" role="group" aria-label="Sex profile">
            {(['MALE', 'FEMALE'] as const).map((s) => {
              const active = sex === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeSex(s)}
                  aria-pressed={active}
                  className={`flex items-center justify-center gap-2 rounded-lg border py-2 px-3 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    active
                      ? 'border-sky-400 bg-sky-950/80 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      active ? 'bg-sky-400' : 'bg-slate-600'
                    }`}
                  />
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Anatomical Layer Strata Decomposition Card */}
        <div className="rounded-xl border border-slate-700/80 bg-black/90 p-3 backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <SlidersIcon size={15} className="text-sky-400" />
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                LAYER DECOMPOSITION
              </span>
            </div>
            <span className="font-mono text-xs text-sky-400 font-semibold">
              {layers.length}/4 ACTIVE
            </span>
          </div>

          <div className="space-y-1.5 mt-2.5" role="group" aria-label="Anatomical layers">
            {PAIRED_DEPTHS.map((layer) => {
              const active = layers.includes(layer.index);
              return (
                <button
                  key={layer.index}
                  type="button"
                  onClick={() => handleToggleLayer(layer.index)}
                  disabled={active && layers.length === 1}
                  aria-pressed={active}
                  className={`w-full flex items-center justify-between rounded-lg border p-2 font-mono text-left transition-all cursor-pointer ${
                    active
                      ? 'border-sky-400/80 bg-sky-950/50 text-white shadow-[0_0_8px_rgba(56,189,248,0.2)]'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-sky-400">0{layer.index}</span>
                      <span className="text-xs font-bold text-slate-100">{layer.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 ml-5">
                      {layer.desc}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${
                      active
                        ? 'border border-sky-400/50 text-sky-300 bg-sky-950/70'
                        : 'border border-slate-800 text-slate-500'
                    }`}
                  >
                    {active ? 'SHOWN' : 'HIDDEN'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Strata Presets */}
          <div className="flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => onChangeLayers([0, 1, 2, 3])}
              className="text-xs font-mono font-semibold text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              [ALL]
            </button>
            <button
              type="button"
              onClick={() => onChangeLayers([3])}
              className="text-xs font-mono font-semibold text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              [SKELETON]
            </button>
            <button
              type="button"
              onClick={() => onChangeLayers([1, 2])}
              className="text-xs font-mono font-semibold text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              [VISCERAL]
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 3. FLOATING TOP-RIGHT HUD: Clinical Tools & Diagnostics              */}
      {/* ------------------------------------------------------------------- */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2.5 pointer-events-auto">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/80 bg-black/85 p-2 backdrop-blur-md shadow-xl">
          {/* Toggle Region Markers */}
          <button
            type="button"
            onClick={() => setShowMarkers((v) => !v)}
            aria-pressed={showMarkers}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider transition-all cursor-pointer ${
              showMarkers
                ? 'border-sky-400 bg-sky-950/60 text-sky-200'
                : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <EyeIcon size={14} />
            <span>REGION PINS</span>
          </button>

          {/* Pin Injury (Manual 3D raycast) */}
          {onAddInjury && (
            <button
              type="button"
              onClick={() => {
                setManualPoint(undefined);
                setManualFormOpen((v) => !v);
              }}
              aria-pressed={manualFormOpen}
              disabled={!manualFormOpen && (!currentAnchors || contextLost)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider transition-all cursor-pointer ${
                manualFormOpen
                  ? 'border-amber-400 bg-amber-950/70 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                  : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-amber-400/50 hover:text-amber-200'
              }`}
            >
              <CrosshairIcon size={14} />
              <span>{manualFormOpen ? 'CANCEL PINNING' : 'PIN INJURY'}</span>
            </button>
          )}

          {/* Add Photo / AI Injury Inspector Modal */}
          {onOpenAiInjury && (
            <button
              type="button"
              onClick={() => onOpenAiInjury()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-950/50 px-2.5 py-1.5 font-mono text-xs font-bold text-purple-200 hover:bg-purple-900/60 hover:border-purple-400 transition-all cursor-pointer"
            >
              <CameraIcon size={14} />
              <span>ADD PHOTO (AI)</span>
            </button>
          )}
        </div>

        {/* Render Quality Control & DPR Badge */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-black/85 px-3 py-1.5 backdrop-blur-md shadow-xl font-mono text-xs text-slate-300">
          <span className="text-slate-400">QUALITY:</span>
          <CockpitSelect
            aria-label="3D Render quality"
            value={quality.profile}
            onChange={(e) => quality.setProfile(e.target.value as RenderProfile)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-200"
          >
            <option value="AUTO">Auto</option>
            <option value="LITE">Lite (1.0x)</option>
            <option value="STANDARD">Standard</option>
            <option value="HIGH">High (2.0x)</option>
          </CockpitSelect>
          <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">
            {quality.dpr.toFixed(1)}x DPR
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 4. MANUAL MARKER PLACEMENT BANNER (Active during surface picking)    */}
      {/* ------------------------------------------------------------------- */}
      {manualFormOpen && onAddInjury && (
        <div className="absolute top-20 inset-x-4 z-30 mx-auto max-w-xl rounded-xl border border-amber-400/70 bg-black/95 p-3 font-mono text-xs backdrop-blur-lg shadow-2xl animate-fade-in pointer-events-auto">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-amber-500/30">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <CrosshairIcon size={16} />
              SURFACE RAYCASTING: CLICK ANYWHERE ON BODY TO PLACE PIN
            </span>
            <button
              type="button"
              onClick={() => {
                setManualPoint(undefined);
                setManualFormOpen(false);
              }}
              className="text-slate-400 hover:text-white"
            >
              <XIcon size={16} />
            </button>
          </div>
          <p className="mt-1.5 text-slate-300 text-[11px]">
            {pendingPoint
              ? 'Point selected on mesh surface. Adjust details below or click again to reposition.'
              : 'Move cursor over the 3D model and click on the affected anatomical area.'}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <CockpitSelect
              aria-label="Injury severity"
              value={manualSeverity}
              onChange={(e) => setManualSeverity(e.target.value as InjurySeverity)}
              className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="LOW">LOW SEVERITY</option>
              <option value="MODERATE">MODERATE SEVERITY</option>
              <option value="HIGH">HIGH SEVERITY</option>
            </CockpitSelect>
            <input
              type="text"
              placeholder="Clinical note / injury description"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              className="flex-1 min-w-[200px] rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500"
            />
            <button
              type="button"
              onClick={handleCreateManualInjury}
              disabled={!pendingPoint}
              className={`rounded px-3 py-1 font-bold uppercase tracking-wider text-black transition-all ${
                pendingPoint
                  ? 'bg-amber-400 hover:bg-amber-300 cursor-pointer shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              Confirm Pin
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 5. INSPECTED INJURY MARKER DETAILS CARD                              */}
      {/* ------------------------------------------------------------------- */}
      {markerDetails && (
        <div className="absolute bottom-20 left-4 z-20 max-w-sm rounded-xl border border-lime-400/60 bg-black/95 p-3.5 backdrop-blur-md shadow-2xl font-mono text-xs pointer-events-auto">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <span className="font-bold text-lime-400 uppercase tracking-wider">
              {markerDetails.title}
            </span>
            <button
              type="button"
              onClick={() => setInspectedMarker(null)}
              className="text-slate-400 hover:text-white"
            >
              <XIcon size={16} />
            </button>
          </div>
          <p className="mt-1.5 text-slate-300 text-xs">
            Region: {INJURY_REGIONS[markerDetails.region]?.label ?? markerDetails.region}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Severity: <span className="font-semibold text-lime-300">{markerDetails.severity}</span> • Logged: {markerDetails.detectedAt}
          </p>
          {onResolveInjury && (
            <button
              type="button"
              onClick={() => {
                onResolveInjury(markerDetails.id);
                setInspectedMarker(null);
              }}
              className="mt-3 w-full rounded border border-rose-500/50 bg-rose-950/40 py-1.5 text-center font-bold text-rose-300 hover:bg-rose-900/60 cursor-pointer"
            >
              RESOLVE &amp; REMOVE MARKER
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 6. SELECTED UBERON NODE DETAILS HUD (Bottom floating inspect)       */}
      {/* ------------------------------------------------------------------- */}
      {selectedNode && selectedMetrics && !markerDetails && (
        <div className="absolute bottom-20 left-4 right-4 z-20 mx-auto max-w-2xl rounded-xl border border-sky-400/80 bg-black/95 p-4 backdrop-blur-md shadow-2xl font-mono pointer-events-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-sky-300">
                  {selectedNode.label} [{selectedNode.uberonCurie}]
                </span>
                <span
                  className="rounded border px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ borderColor: selectedNode.color, color: selectedNode.color }}
                >
                  {selectedNode.observationState}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                {selectedMetrics.detailSummary}
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                <span>Local Stress: <strong className="text-slate-200">{(selectedNode.localIntensity * 100).toFixed(0)}%</strong></span>
                <span>Propagated Conduction: <strong className="text-slate-200">{(selectedNode.propagatedIntensity * 100).toFixed(0)}%</strong></span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onOpenTab && (
                <button
                  type="button"
                  onClick={() => onOpenTab(selectedMetrics.tab)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-sky-300 transition-all cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                >
                  <span>{selectedMetrics.tabLabel}</span>
                  <ArrowRightIcon size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="rounded p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <XIcon size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 7. FLOATING BOTTOM HUD STRIP: 5 Anatomical Region Clinical Chips     */}
      {/* ------------------------------------------------------------------- */}
      <div className="absolute bottom-3 inset-x-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-black/90 px-3 py-2 backdrop-blur-md shadow-xl pointer-events-auto">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider mr-1">
            CLINICAL HUBS:
          </span>
          {scene.nodes.map((node) => {
            const metric = liveMetricForNode(node, s);
            const isSelected = selectedNodeId === node.region;
            return (
              <button
                key={node.region}
                type="button"
                onClick={() => setSelectedNodeId(node.region)}
                aria-pressed={isSelected}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-400 bg-sky-950/70 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                    : 'border-slate-800/80 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: node.color }}
                />
                <span className="font-semibold">{node.label}:</span>
                <strong className="text-white">{metric.badgeValue}</strong>
              </button>
            );
          })}
        </div>

        {/* Validation and Model Attribution */}
        <div className="hidden lg:flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <ShieldCheckIcon size={14} className="text-emerald-400" />
          <span>{modelValidationStatus ?? 'ILLUSTRATIVE_UNVALIDATED'}</span>
          <span>•</span>
          <span>Paired Atlas (CC BY 4.0)</span>
        </div>
      </div>
    </div>
  );
}
