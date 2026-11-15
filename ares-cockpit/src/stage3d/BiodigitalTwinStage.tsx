// Primary 3D Biodigital Twin Stage (`BiodigitalTwinStage`).
// Implements the deterministic single-canvas WebGL2 pipeline (`<= 12` draw calls total):
// - Pass 0 (`renderOrder = 0`): Merged internal organ & vascular per-region scalar load core (`organLoadMaterial`)
// - Pass 2 (`renderOrder = 3`, optional): Air-gapped merged Z-Anatomy `.glb` layer torn down via `deepDisposeObject`
// - Pass 5 (`renderOrder = 5`): Single merged `CubicBezierCurve3` BioKG conduction mesh (`AdditiveBlending`)
// - Pass 10 (`BackSide`) & Pass 11 (`FrontSide`): Dual-Gender morphing Fresnel + regional stress + barycentric silhouette
// - Pass 14..16 (`depthTest: false`): Unoccluded `UBERON:` hotspot beacons (`count = 5`), pulsing 3D problem halo
//   rings (`count = 5`), and `InjuryMarker` pins (`count <= 10`)
// Enforces React 19 `<StrictMode>`-safe imperative lifecycle + NotebookLM Risk 4 GPU teardown.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type {
  AnatomicalHeatmapKey,
  AnatomicalRegionWireId,
  HypergraphSpatialSummary,
} from '../types/telemetry';
import type { InjuryMarker } from '../types/injury';
import type { CameraSnapshot, StudioCameraPresetId } from '../types/workbench';
import { projectHypergraphTo3D } from '../modules/body-3d-heatmap/uberonSpatialMapping';

type ProjectedHypergraph3D = ReturnType<typeof projectHypergraphTo3D>;
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useStudioTimelineStore } from '../stores/studioTimelineStore';
import {
  createEmptyRingSampleView,
  queryTelemetryRingAtTime,
  telemetryRingBuffer,
} from '../stores/telemetryRingBuffer';
import { stepSpring1D } from '../lib/motionSmoothing';
import { createDigitalTwinMaterial } from './shaders/digitalTwinMaterial';
import { createOrganLoadMaterial } from './shaders/organLoadMaterial';
import { createCausalArcMaterial } from './shaders/causalArcMaterial';
import {
  buildInternalOrganCoreGeometry,
  buildProceduralTwinGeometry,
  updateOrganCoreRegionLoads,
  updateTwinRegionObservation,
  type ProceduralTwinGeometryBundle,
} from './geometry/proceduralTwinBuilder';
import {
  createInjuryPinsInstancedMesh,
  createUberonHaloRingsInstancedMesh,
  createUberonInstancedMesh,
  resolveRegionForInstanceId,
  updateInjuryPinsInstancedMesh,
  updateUberonHaloRingsInstancedMesh,
  updateUberonInstancedMesh,
} from './geometry/uberonInstancedNodes';
import {
  createMergedCausalBezierArcs,
  updateCausalBezierArcsGeometry,
  type MergedCausalArcsBundle,
} from './geometry/causalBezierArcs';
import {
  deepDisposeObject,
  loadAirgappedMergedGlb,
} from './geometry/airgappedGlbLoader';
import { UnifiedCameraController } from './UnifiedCameraController';
import type { ViewportChromeInsets } from './cameraRigMath';

export interface LazyAnatomicalGlbToggles {
  skeletal?: boolean;
  vascular?: boolean;
  visceral?: boolean;
}

export interface BiodigitalTwinStageProps {
  /** Optional DOM aperture ref for pointer raycasting / OrbitControls binding. */
  apertureTrackRef?: React.RefObject<HTMLElement | null>;
  chromeInsets?: ViewportChromeInsets;
  hypergraphSummary?: HypergraphSpatialSummary | null;
  localFallbackByKey?: Partial<
    Record<AnatomicalHeatmapKey, { intensity: number; observed: boolean }>
  >;
  injuryMarkers?: readonly InjuryMarker[];
  presetOverride?: StudioCameraPresetId | null;
  lazyGlbLayers?: LazyAnatomicalGlbToggles;
  onCaptureSnapshotRef?: React.MutableRefObject<(() => CameraSnapshot) | null>;
}

const LAZY_GLB_URLS: Readonly<Record<keyof LazyAnatomicalGlbToggles, string>> = {
  skeletal: '/anatomy/SkeletalSystem100.glb',
  vascular: '/anatomy/CardioVascular41.glb',
  visceral: '/anatomy/VisceralSystem100.glb',
};

/**
 * Surface-accurate 3D anatomical landmark positions aligned with `proceduralTwinBuilder`
 * organ geometry (places Soleus/Calcaneus directly on the left calf `[-0.118, -0.40, 0.042]`
 * rather than mid-air between limbs).
 */
const STAGE_ANCHOR_OVERRIDES: Readonly<
  Record<AnatomicalRegionWireId, readonly [number, number, number]>
> = {
  BrainVestibularCns: [0.0, 1.66, 0.072],
  EyeOcularSans: [0.0, 1.555, 0.098],
  InternalJugularVein: [-0.058, 1.295, 0.068],
  HeartCardioAutonomic: [0.018, 0.875, 0.095],
  SoleusCalcaneus: [-0.118, -0.40, 0.042],
};

interface StageImperativeResources {
  imperativeGroup: THREE.Group;
  twinBundle: ProceduralTwinGeometryBundle;
  twinBackMat: THREE.ShaderMaterial;
  twinFrontMat: THREE.ShaderMaterial;
  organCoreGeom: THREE.BufferGeometry;
  organCoreMat: THREE.ShaderMaterial;
  uberonBeaconsMesh: THREE.InstancedMesh;
  uberonHaloRingsMesh: THREE.InstancedMesh;
  injuryPinsMesh: THREE.InstancedMesh;
  causalArcsBundle: MergedCausalArcsBundle;
  causalArcsMat: THREE.ShaderMaterial;
}

function buildStageImperativeResources(): StageImperativeResources {
  const imperativeGroup = new THREE.Group();
  imperativeGroup.name = 'ARESBiodigitalImperativeBundle';

  const twinBundle = buildProceduralTwinGeometry(24);
  const twinBackMat = createDigitalTwinMaterial({ side: THREE.BackSide, opacity: 0.88 });
  const twinFrontMat = createDigitalTwinMaterial({ side: THREE.FrontSide, opacity: 1.0 });

  const twinBackMesh = new THREE.Mesh(twinBundle.geometry, twinBackMat);
  twinBackMesh.name = 'ARESTwinSilhouetteBackPass10';
  twinBackMesh.renderOrder = 10;
  twinBackMesh.raycast = () => {};

  const twinFrontMesh = new THREE.Mesh(twinBundle.geometry, twinFrontMat);
  twinFrontMesh.name = 'ARESTwinSilhouetteFrontPass11';
  twinFrontMesh.renderOrder = 11;
  twinFrontMesh.raycast = () => {};

  const organCoreGeom = buildInternalOrganCoreGeometry();
  const organCoreMat = createOrganLoadMaterial({
    opacity: 0.82,
    scalarLoad: 0.18,
    observed: true,
    useVertexLoad: true,
    depthWrite: false,
  });
  const organCoreMesh = new THREE.Mesh(organCoreGeom, organCoreMat);
  organCoreMesh.name = 'ARESInternalOrganCorePass0';
  organCoreMesh.renderOrder = 0;
  organCoreMesh.raycast = () => {};

  const uberonBeaconsMesh = createUberonInstancedMesh(0.022, {
    depthTest: false,
    renderOrder: 14,
  });
  const uberonHaloRingsMesh = createUberonHaloRingsInstancedMesh(0.052, 0.0022, {
    depthTest: false,
    renderOrder: 15,
  });
  const injuryPinsMesh = createInjuryPinsInstancedMesh(10, {
    depthTest: false,
    renderOrder: 16,
  });

  const causalArcsBundle = createMergedCausalBezierArcs(STAGE_ANCHOR_OVERRIDES);
  const causalArcsMat = createCausalArcMaterial({ opacity: 0.94 });
  const causalArcsMesh = new THREE.Mesh(causalArcsBundle.geometry, causalArcsMat);
  causalArcsMesh.name = 'ARESCausalConductionArcsPass5';
  causalArcsMesh.renderOrder = 5;
  causalArcsMesh.frustumCulled = false;
  causalArcsMesh.raycast = () => {};

  imperativeGroup.add(
    organCoreMesh,
    causalArcsMesh,
    twinBackMesh,
    twinFrontMesh,
    uberonBeaconsMesh,
    uberonHaloRingsMesh,
    injuryPinsMesh,
  );

  return {
    imperativeGroup,
    twinBundle,
    twinBackMat,
    twinFrontMat,
    organCoreGeom,
    organCoreMat,
    uberonBeaconsMesh,
    uberonHaloRingsMesh,
    injuryPinsMesh,
    causalArcsBundle,
    causalArcsMat,
  };
}

function syncHypergraphToStageResources(
  res: StageImperativeResources,
  projectedHypergraph: ProjectedHypergraph3D,
): void {
  const observedMap: Record<AnatomicalRegionWireId, boolean> = {
    EyeOcularSans: projectedHypergraph.nodesByRegion.EyeOcularSans.observed,
    InternalJugularVein: projectedHypergraph.nodesByRegion.InternalJugularVein.observed,
    HeartCardioAutonomic: projectedHypergraph.nodesByRegion.HeartCardioAutonomic.observed,
    SoleusCalcaneus: projectedHypergraph.nodesByRegion.SoleusCalcaneus.observed,
    BrainVestibularCns: projectedHypergraph.nodesByRegion.BrainVestibularCns.observed,
  };

  const stressMap: Record<AnatomicalRegionWireId, number> = {
    EyeOcularSans: projectedHypergraph.nodesByRegion.EyeOcularSans.localIntensity,
    InternalJugularVein: projectedHypergraph.nodesByRegion.InternalJugularVein.localIntensity,
    HeartCardioAutonomic: projectedHypergraph.nodesByRegion.HeartCardioAutonomic.localIntensity,
    SoleusCalcaneus: projectedHypergraph.nodesByRegion.SoleusCalcaneus.localIntensity,
    BrainVestibularCns: projectedHypergraph.nodesByRegion.BrainVestibularCns.localIntensity,
  };

  updateTwinRegionObservation(res.twinBundle.geometry, observedMap, stressMap);
  updateOrganCoreRegionLoads(res.organCoreGeom, projectedHypergraph.nodesByRegion);
  updateCausalBezierArcsGeometry(
    res.causalArcsBundle,
    projectedHypergraph.arcs,
    observedMap,
  );

  const anyObserved = Object.values(observedMap).some(Boolean);
  const maxProp = Math.max(
    projectedHypergraph.nodesByRegion.EyeOcularSans.propagatedIntensity,
    projectedHypergraph.nodesByRegion.InternalJugularVein.propagatedIntensity,
    projectedHypergraph.nodesByRegion.HeartCardioAutonomic.propagatedIntensity,
    projectedHypergraph.nodesByRegion.SoleusCalcaneus.propagatedIntensity,
    projectedHypergraph.nodesByRegion.BrainVestibularCns.propagatedIntensity,
  );
  const maxLocal = Math.max(
    projectedHypergraph.nodesByRegion.EyeOcularSans.localIntensity,
    projectedHypergraph.nodesByRegion.InternalJugularVein.localIntensity,
    projectedHypergraph.nodesByRegion.HeartCardioAutonomic.localIntensity,
    projectedHypergraph.nodesByRegion.SoleusCalcaneus.localIntensity,
    projectedHypergraph.nodesByRegion.BrainVestibularCns.localIntensity,
  );

  res.twinBackMat.uniforms.uGlobalObserved.value = anyObserved ? 1.0 : 0.0;
  res.twinFrontMat.uniforms.uGlobalObserved.value = anyObserved ? 1.0 : 0.0;
  res.twinBackMat.uniforms.uPropagatedIntensity.value = maxProp;
  res.twinFrontMat.uniforms.uPropagatedIntensity.value = maxProp;

  res.organCoreMat.uniforms.uObserved.value = anyObserved ? 1.0 : 0.0;
  res.organCoreMat.uniforms.uScalarLoad.value = maxLocal;
}

function OptionalMergedGlbOverlay({
  url,
  tintHex,
  opacity,
}: {
  url: string;
  tintHex: string;
  opacity: number;
}) {
  const gl = useThree((s) => s.gl);
  const [mergedMesh, setMergedMesh] = useState<THREE.Mesh | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mountedMesh: THREE.Mesh | null = null;
    const mat = createOrganLoadMaterial({
      baseTintHex: tintHex,
      opacity,
      scalarLoad: 0.2,
      observed: true,
      depthWrite: false,
    });

    void loadAirgappedMergedGlb(url, {
      signal: controller.signal,
      renderer: gl,
      warmupMaterial: mat,
    }).then((res) => {
      if (!res || controller.signal.aborted) {
        mat.dispose();
        return;
      }
      // Align raw Z-Anatomy height onto [-0.80, +1.70] coordinate frame
      const box = res.boundingBox;
      const rawH = box.max.y - box.min.y;
      const scale = rawH > 1e-4 ? 2.5 / rawH : 1;
      const center = box.getCenter(new THREE.Vector3());

      const mesh = new THREE.Mesh(res.geometry, mat);
      mesh.name = `ARESMergedGlb_${url}`;
      mesh.renderOrder = 3;
      mesh.raycast = () => {};
      mesh.scale.setScalar(scale);
      mesh.position.set(
        -center.x * scale,
        -0.8 - box.min.y * scale,
        -center.z * scale,
      );
      mountedMesh = mesh;
      setMergedMesh(mesh);
    });

    return () => {
      controller.abort();
      if (mountedMesh) {
        deepDisposeObject(mountedMesh, gl);
      } else {
        mat.dispose();
      }
      setMergedMesh(null);
    };
  }, [gl, opacity, tintHex, url]);

  if (!mergedMesh) return null;
  return <primitive object={mergedMesh} />;
}

export function BiodigitalTwinStage({
  apertureTrackRef,
  chromeInsets,
  hypergraphSummary,
  localFallbackByKey,
  injuryMarkers = [],
  presetOverride = null,
  lazyGlbLayers,
  onCaptureSnapshotRef,
}: BiodigitalTwinStageProps) {
  const gl = useThree((s) => s.gl);
  const viewportDpr = useThree((s) => s.viewport.dpr);

  const twinSex = useWorkbenchStore((s) => s.twinSex);
  const selectedUberonRegion = useWorkbenchStore((s) => s.selectedUberonRegion);
  const selectUberonRegion = useWorkbenchStore((s) => s.selectUberonRegion);
  const studioBarOpen = useWorkbenchStore((s) => s.studioBarOpen);

  const hostGroupRef = useRef<THREE.Group>(null);
  const stageResourcesRef = useRef<StageImperativeResources | null>(null);
  const morphSpringRef = useRef({
    weight: twinSex === 'FEMALE' ? 1.0 : 0.0,
    velocity: 0.0,
  });
  const ringSampleScratchRef = useRef(createEmptyRingSampleView());

  const projectedHypergraph = useMemo(
    () => projectHypergraphTo3D(hypergraphSummary, localFallbackByKey),
    [hypergraphSummary, localFallbackByKey],
  );
  const latestProjectedRef = useRef<ProjectedHypergraph3D>(projectedHypergraph);
  latestProjectedRef.current = projectedHypergraph;

  // React 19 StrictMode-safe imperative construction + NotebookLM Risk 4 GPU disposal:
  // `res.imperativeGroup` is created and attached inside `useEffect` setup and detached/disposed
  // inside cleanup without ever detaching R3F's `<group ref={hostGroupRef} />` from the scene.
  useEffect(() => {
    const hostGroup = hostGroupRef.current;
    if (!hostGroup) return undefined;

    const res = buildStageImperativeResources();
    hostGroup.add(res.imperativeGroup);
    stageResourcesRef.current = res;
    syncHypergraphToStageResources(res, latestProjectedRef.current);

    return () => {
      stageResourcesRef.current = null;
      deepDisposeObject(res.imperativeGroup, gl);
    };
  }, [gl]);

  // Synchronize per-region Issue #11 `aObserved`, `aRegionStress`, per-organ load & causal arcs
  useEffect(() => {
    const res = stageResourcesRef.current;
    if (!res) return;
    syncHypergraphToStageResources(res, projectedHypergraph);
  }, [projectedHypergraph]);

  // Zero-GC 60fps / 20Hz visual synchronization loop
  useFrame((state, rawDelta) => {
    const res = stageResourcesRef.current;
    if (!res) return;

    const elapsed = state.clock.elapsedTime;
    const studioState = useStudioTimelineStore.getState();

    // Advance Studio timeline playhead if playing
    if (studioBarOpen && studioState.isPlaying && !studioState.isScrubbing) {
      studioState.advanceTick(rawDelta);
    }

    // Smooth Dual-Gender morph weight (`0.0` MALE <-> `1.0` FEMALE)
    const targetMorph = twinSex === 'FEMALE' ? 1.0 : 0.0;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      morphSpringRef.current.weight = targetMorph;
      morphSpringRef.current.velocity = 0;
    } else {
      const stepped = stepSpring1D(
        morphSpringRef.current.weight,
        targetMorph,
        morphSpringRef.current.velocity,
        rawDelta,
      );
      morphSpringRef.current.weight = stepped.position;
      morphSpringRef.current.velocity = stepped.velocity;
    }

    const w = morphSpringRef.current.weight;
    res.twinBackMat.uniforms.uGenderMorphWeight.value = w;
    res.twinFrontMat.uniforms.uGenderMorphWeight.value = w;
    res.twinBackMat.uniforms.uTime.value = elapsed;
    res.twinFrontMat.uniforms.uTime.value = elapsed;
    res.twinBackMat.uniforms.uDPR.value = viewportDpr;
    res.twinFrontMat.uniforms.uDPR.value = viewportDpr;

    res.organCoreMat.uniforms.uTime.value = elapsed;
    res.causalArcsMat.uniforms.uTime.value = elapsed;

    // Sample zero-GC ring buffer directly (Studio scrub timestamp or latest live sample)
    const scratch = ringSampleScratchRef.current;
    const sample = studioBarOpen
      ? queryTelemetryRingAtTime(studioState.t, { interpolate: true }, scratch)
      : telemetryRingBuffer.readSampleAtIndex(telemetryRingBuffer.latestRingIndex(), scratch);

    if (sample) {
      if (Number.isFinite(sample.hrBpm) && sample.hrBpm > 20) {
        const beatsPerSec = sample.hrBpm / 60;
        res.organCoreMat.uniforms.uPulseRateRad.value = beatsPerSec * Math.PI * 2.0;
      }
      if (Number.isFinite(sample.onsdMm)) {
        const shiftLoad = Math.max(0, Math.min(1, (sample.onsdMm - 5.0) / 1.4));
        res.twinBackMat.uniforms.uFluidShiftLoad.value = shiftLoad;
        res.twinFrontMat.uniforms.uFluidShiftLoad.value = shiftLoad;
      }
    }

    updateUberonInstancedMesh(
      res.uberonBeaconsMesh,
      projectedHypergraph.nodesByRegion,
      selectedUberonRegion,
      elapsed,
      STAGE_ANCHOR_OVERRIDES,
    );

    updateUberonHaloRingsInstancedMesh(
      res.uberonHaloRingsMesh,
      projectedHypergraph.nodesByRegion,
      selectedUberonRegion,
      elapsed,
      STAGE_ANCHOR_OVERRIDES,
    );

    updateInjuryPinsInstancedMesh(res.injuryPinsMesh, injuryMarkers, elapsed);
  });

  const isInteractiveHotspotObject = (obj: THREE.Object3D): boolean =>
    obj.name === 'ARESUberonBeaconsInstanced' || obj.name === 'ARESUberonHaloRingsInstanced';

  const handleStageClick = (event: ThreeEvent<MouseEvent>): void => {
    if (!isInteractiveHotspotObject(event.object)) return;
    const clickedRegion = resolveRegionForInstanceId(event.instanceId);
    if (!clickedRegion) return;
    event.stopPropagation();
    selectUberonRegion(selectedUberonRegion === clickedRegion ? null : clickedRegion);
  };

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.50, 4.25]} fov={45} near={0.08} far={25} />
      <UnifiedCameraController
        chromeInsets={chromeInsets}
        presetOverride={presetOverride}
        apertureTrackRef={apertureTrackRef}
        onCaptureSnapshotRef={onCaptureSnapshotRef}
      />

      <group
        ref={hostGroupRef}
        name="ARESBiodigitalTwinStageRoot"
        onClick={handleStageClick}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (
            isInteractiveHotspotObject(e.object) &&
            resolveRegionForInstanceId(e.instanceId) &&
            typeof document !== 'undefined'
          ) {
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          if (typeof document !== 'undefined') {
            document.body.style.cursor = '';
          }
        }}
      >
        {/* Pass 2 (Optional): Lazy Air-Gapped Merged Z-Anatomy Overlays */}
        {lazyGlbLayers?.skeletal ? (
          <OptionalMergedGlbOverlay
            url={LAZY_GLB_URLS.skeletal}
            tintHex="#cbd5e1"
            opacity={0.55}
          />
        ) : null}
        {lazyGlbLayers?.vascular ? (
          <OptionalMergedGlbOverlay
            url={LAZY_GLB_URLS.vascular}
            tintHex="#f43f5e"
            opacity={0.72}
          />
        ) : null}
        {lazyGlbLayers?.visceral ? (
          <OptionalMergedGlbOverlay
            url={LAZY_GLB_URLS.visceral}
            tintHex="#38bdf8"
            opacity={0.48}
          />
        ) : null}
      </group>
    </>
  );
}
