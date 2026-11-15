// Pre-compiles all custom GLSL3 programs (`digitalTwinMaterial` BackSide + FrontSide,
// `organLoadMaterial`, `causalArcMaterial`, and `uberonInstancedNodes` instanced shader)
// offscreen during boot and after `webglcontextrestored` so runtime phase/sex/drawer transitions
// incur strictly `0 ms` shader compilation hitches.

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createDigitalTwinMaterial } from './shaders/digitalTwinMaterial';
import { createOrganLoadMaterial } from './shaders/organLoadMaterial';
import { createCausalArcMaterial } from './shaders/causalArcMaterial';
import { createUberonInstancedMesh } from './geometry/uberonInstancedNodes';
import { deepDisposeObject } from './geometry/airgappedGlbLoader';

export interface ShaderWarmupManagerProps {
  contextRestoreEpoch?: number;
  onWarmupComplete?: () => void;
}

function buildMinimalTwinWarmupGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const triVerts = new Float32Array([
    0, 0, 0,
    0.1, 0, 0,
    0, 0.1, 0,
  ]);
  const triNorms = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);
  const zeroMorph = new Float32Array(9);
  const bary = new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);
  const obs = new Float32Array([1, 1, 1]);
  const stress = new Float32Array([0.35, 0.35, 0.35]);

  geom.setAttribute('position', new THREE.BufferAttribute(triVerts, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(triNorms, 3));
  geom.setAttribute('morphTarget0', new THREE.BufferAttribute(zeroMorph, 3));
  geom.setAttribute('morphNormal0', new THREE.BufferAttribute(zeroMorph, 3));
  geom.setAttribute('aBarycentric', new THREE.BufferAttribute(bary, 3));
  geom.setAttribute('aObserved', new THREE.BufferAttribute(obs, 1));
  geom.setAttribute('aRegionStress', new THREE.BufferAttribute(stress, 1));
  return geom;
}

function buildMinimalArcWarmupGeometry(): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(0.1, 0.1);
  const count = geom.getAttribute('position').count;
  geom.setAttribute('aFluxIntensity', new THREE.BufferAttribute(new Float32Array(count).fill(0.5), 1));
  geom.setAttribute('aObserved', new THREE.BufferAttribute(new Float32Array(count).fill(1.0), 1));
  geom.setAttribute('aArcColor', new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.5), 3));
  return geom;
}

export function ShaderWarmupManager({
  contextRestoreEpoch = 0,
  onWarmupComplete,
}: ShaderWarmupManagerProps) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const warmupScene = new THREE.Scene();
    const warmupCam = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    warmupCam.position.set(0, 0, 2);
    warmupCam.updateMatrixWorld();

    const twinGeom = buildMinimalTwinWarmupGeometry();
    const twinBackMesh = new THREE.Mesh(
      twinGeom,
      createDigitalTwinMaterial({ side: THREE.BackSide }),
    );
    const twinFrontMesh = new THREE.Mesh(
      twinGeom.clone(),
      createDigitalTwinMaterial({ side: THREE.FrontSide }),
    );

    const organMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      createOrganLoadMaterial(),
    );

    const arcMesh = new THREE.Mesh(
      buildMinimalArcWarmupGeometry(),
      createCausalArcMaterial(),
    );

    const instancedBeacons = createUberonInstancedMesh(0.02);

    warmupScene.add(twinBackMesh, twinFrontMesh, organMesh, arcMesh, instancedBeacons);

    let disposed = false;
    const disposeWarmupScene = (): void => {
      if (disposed) return;
      disposed = true;
      deepDisposeObject(warmupScene, gl);
    };

    try {
      gl.compile(warmupScene, warmupCam);
    } catch {
      disposeWarmupScene();
      return undefined;
    }

    onWarmupComplete?.();

    // Defer offscreen warmup geometry teardown until parallel WebGL2 program linking settles
    // and primary stage meshes have bound shared programs (prevents premature glDeleteProgram
    // GL_INVALID_VALUE warnings under ANGLE / React StrictMode double-mount).
    const settleTimer = setTimeout(disposeWarmupScene, 400);

    return () => {
      clearTimeout(settleTimer);
      setTimeout(disposeWarmupScene, 400);
    };
  }, [gl, contextRestoreEpoch, onWarmupComplete]);

  return null;
}
