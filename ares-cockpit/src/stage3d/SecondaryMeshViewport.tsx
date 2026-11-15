import {useReducedMotionPreference} from '../lib/useReducedMotion';
// Scoped Drei `<View />` secondary 3D viewport (`SecondaryMeshViewport`) sharing the single
// WebGL2 `<SpatialCanvasRoot>` context via `gl.scissor` / `gl.viewport` (`<View.Port />`).
// Powers:
// 1. MRI / STL 3D Anatomical Specimen Inspection inside Diagnostic Imaging (`OPTICAL_AND_MRI` tab)
// 2. OpenScreenStudio `SPLIT` and `PIP` dual-camera presentation layouts
// Enforces Risk 3 (`enabled={!isScrubbing}`) and Risk 4 (`deepDisposeObject` on asset swap/unmount).

import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, View } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useStudioTimelineStore } from '../stores/studioTimelineStore';
import { createOrganLoadMaterial } from './shaders/organLoadMaterial';
import { createDigitalTwinMaterial } from './shaders/digitalTwinMaterial';
import { bakeBarycentricAttribute } from './geometry/proceduralTwinBuilder';
import { deepDisposeObject, loadAirgappedMergedGlb } from './geometry/airgappedGlbLoader';

export type SecondarySpecimenKind = 'OCULAR_SANS_GLOBE' | 'IJV_LUMEN_SEGMENT' | 'FEMUR_TRABECULAR';

export interface SecondaryMeshViewportProps {
  specimen?: SecondarySpecimenKind;
  assetUrl?: string | null;
  scalarLoad?: number;
  observed?: boolean;
  label?: string;
  className?: string;
}

function buildProceduralSpecimenGeometry(kind: SecondarySpecimenKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  if (kind === 'OCULAR_SANS_GLOBE') {
    const globe = new THREE.SphereGeometry(0.24, 24, 18);
    globe.translate(0, 0, 0.08);
    const sheath = new THREE.CylinderGeometry(0.068, 0.082, 0.42, 18, 8);
    sheath.rotateX(Math.PI * 0.5);
    sheath.translate(0, 0, -0.22);
    parts.push(globe, sheath);
  } else if (kind === 'IJV_LUMEN_SEGMENT') {
    const vessel = new THREE.CylinderGeometry(0.11, 0.135, 0.68, 22, 12, true);
    const innerCore = new THREE.CylinderGeometry(0.075, 0.095, 0.64, 18, 8);
    parts.push(vessel, innerCore);
  } else {
    const shaft = new THREE.CylinderGeometry(0.085, 0.078, 0.66, 18, 10);
    const head = new THREE.SphereGeometry(0.13, 18, 14);
    head.translate(0.09, 0.30, 0);
    parts.push(shaft, head);
  }

  const normalized = parts.map((p) => {
    const ni = p.index ? p.toNonIndexed() : p.clone();
    p.dispose();
    if (!ni.getAttribute('normal')) ni.computeVertexNormals();
    const count = ni.getAttribute('position').count;
    ni.setAttribute('morphTarget0', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    ni.setAttribute('morphNormal0', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    ni.setAttribute('aObserved', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    ni.setAttribute('aRegionStress', new THREE.BufferAttribute(new Float32Array(count), 1));
    return ni;
  });

  const merged = mergeGeometries(normalized, false);
  for (let i = 0; i < normalized.length; i += 1) {
    normalized[i].dispose();
  }
  if (!merged) {
    throw new RangeError('Failed to build procedural secondary 3D specimen geometry.');
  }
  bakeBarycentricAttribute(merged);
  merged.computeBoundingSphere();
  return merged;
}

function SecondarySpecimenScene({
  specimen = 'OCULAR_SANS_GLOBE',
  assetUrl = null,
  scalarLoad = 0.28,
  observed = true,
  trackEl,
}: {
  specimen: SecondarySpecimenKind;
  assetUrl: string | null;
  scalarLoad: number;
  observed: boolean;
  trackEl: HTMLElement | null;
}) {
  const gl = useThree((s) => s.gl);
  const dpr = useThree((s) => s.viewport.dpr);
  const wbScrub = useWorkbenchStore((s) => s.isScrubbing);
  const stScrub = useStudioTimelineStore((s) => s.isScrubbing);
  const isScrubbing = wbScrub || stScrub;
  const reduced=useReducedMotionPreference(),presentation=useWorkbenchStore(s=>s.displayMode==='presentation');

  const groupRef = useRef<THREE.Group>(null);
  const fallbackRefs = useRef<{
    imperativeGroup: THREE.Group;
    shellMat: THREE.ShaderMaterial;
    coreMat: THREE.ShaderMaterial;
  } | null>(null);
  const [loadedAssetMesh, setLoadedAssetMesh] = useState<THREE.Mesh | null>(null);

  // StrictMode-safe imperative specimen creation + Risk 4 disposal
  useEffect(() => {
    const host=groupRef.current;
    const geom = buildProceduralSpecimenGeometry(specimen);
    const shellMat = createDigitalTwinMaterial({
      side: THREE.FrontSide,
      opacity: 0.95,
      globalObserved: observed,
    });
    const coreMat = createOrganLoadMaterial({
      opacity: 0.72,
      scalarLoad,
      observed,
    });

    const coreMesh = new THREE.Mesh(geom, coreMat);
    coreMesh.scale.setScalar(0.86);
    coreMesh.renderOrder = 0;

    const shellMesh = new THREE.Mesh(geom, shellMat);
    shellMesh.renderOrder = 2;

    const imperativeGroup = new THREE.Group();
    imperativeGroup.name = 'ARESSecondaryFallbackPair';
    imperativeGroup.add(coreMesh, shellMesh);
    host?.add(imperativeGroup);

    fallbackRefs.current = { imperativeGroup, shellMat, coreMat };

    return () => {
      fallbackRefs.current = null;
      deepDisposeObject(imperativeGroup, gl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimen, gl]);

  useEffect(() => {
    const fb = fallbackRefs.current;
    if (!fb) return;
    fb.imperativeGroup.visible = !loadedAssetMesh;
    fb.shellMat.uniforms.uGlobalObserved.value = observed ? 1.0 : 0.0;
    fb.coreMat.uniforms.uObserved.value = observed ? 1.0 : 0.0;
    fb.coreMat.uniforms.uScalarLoad.value = scalarLoad;
  }, [loadedAssetMesh, observed, scalarLoad]);

  // Optional local `.glb` specimen loader with Risk 4 teardown
  useEffect(() => {
    if (!assetUrl) {
      setLoadedAssetMesh(null);
      return;
    }
    const controller = new AbortController();
    let activeMesh: THREE.Mesh | null = null;
    const mat = createOrganLoadMaterial({
      opacity: 0.94,
      scalarLoad,
      observed,
    });

    void loadAirgappedMergedGlb(assetUrl, {
      signal: controller.signal,
      renderer: gl,
      warmupMaterial: mat,
    }).then((res) => {
      if (!res || controller.signal.aborted) {
        mat.dispose();
        return;
      }
      const sphere = res.geometry.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 1);
      const normScale = sphere.radius > 1e-4 ? 0.38 / sphere.radius : 1;
      const mesh = new THREE.Mesh(res.geometry, mat);
      mesh.scale.setScalar(normScale);
      mesh.position.set(
        -sphere.center.x * normScale,
        -sphere.center.y * normScale,
        -sphere.center.z * normScale,
      );
      activeMesh = mesh;
      setLoadedAssetMesh(mesh);
    });

    return () => {
      controller.abort();
      if (activeMesh) {
        deepDisposeObject(activeMesh, gl);
      } else {
        mat.dispose();
      }
      setLoadedAssetMesh(null);
    };
  }, [assetUrl, gl, observed, scalarLoad]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const fb = fallbackRefs.current;
    if (fb) {
      fb.shellMat.uniforms.uTime.value = t;
      fb.shellMat.uniforms.uDPR.value = dpr;
      fb.coreMat.uniforms.uTime.value = t;
    }
    if (groupRef.current && !isScrubbing && presentation && !reduced) {
      groupRef.current.rotation.y += delta * 0.18;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.12, 1.05]} fov={36} near={0.05} far={12} />
      <OrbitControls
        makeDefault
        domElement={trackEl ?? undefined}
        enabled={!isScrubbing}
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={0.42}
        maxDistance={2.4}
      />
      <group ref={groupRef} name="ARESSecondarySpecimenGroup">
        {loadedAssetMesh ? <primitive object={loadedAssetMesh} /> : null}
      </group>
    </>
  );
}

export function SecondaryMeshViewport({
  specimen = 'OCULAR_SANS_GLOBE',
  assetUrl = null,
  scalarLoad = 0.28,
  observed = true,
  label = '3D Anatomical Mesh Inspector',
  className = 'h-48 w-full',
}: SecondaryMeshViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mountedEl, setMountedEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMountedEl(containerRef.current);
  }, []);

  return (
    <figure className="min-w-0">
    <div
      ref={containerRef}
      role="region"
      aria-label={label}
      className={`relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 ${className}`.trim()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <View index={2} className="absolute inset-0">
        <SecondarySpecimenScene
          specimen={specimen}
          assetUrl={assetUrl}
          scalarLoad={scalarLoad}
          observed={observed}
          trackEl={mountedEl}
        />
      </View>
    </div><figcaption className="py-2 text-xs leading-relaxed text-slate-300">{label}. Illustrative reference, not acquired imaging.</figcaption></figure>
  );
}
