// 100% Air-Gapped `.glb` binary magic-byte validator, local `/draco/` WASM loader,
// single-draw-call `mergeGeometries` collapser, and recursive GPU memory sanitizer (`Risk 4`).
// Strictly local `/draco/` and `/anatomy/` paths only; zero external network/CDN URLs.
// Uses only bare package runtime imports so Node `--experimental-strip-types` can test directly.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const DRACO_DECODER_LOCAL_PATH = '/draco/';
export const GLTF_BINARY_MAGIC_LE = 0x46546c67; // ASCII 'glTF' in little-endian

export interface AirgappedGlbValidationResult {
  valid: boolean;
  reason?: string;
  declaredByteLength?: number;
}

export interface MergedGlbLoadResult {
  geometry: THREE.BufferGeometry;
  sourceMeshCount: number;
  boundingBox: THREE.Box3;
}

export interface RenderListsDisposable {
  renderLists?: {
    dispose: () => void;
  };
}

let _sharedDracoLoader: DRACOLoader | null = null;

/**
 * Configures a strictly offline `DRACOLoader` pointing exclusively to `/draco/`
 * (`public/draco/draco_decoder.wasm` + `draco_wasm_wrapper.js`).
 */
export function createAirgappedDracoLoader(
  decoderPath: string = DRACO_DECODER_LOCAL_PATH,
): DRACOLoader {
  if (/^https?:\/\//i.test(decoderPath) || decoderPath.startsWith('//')) {
    throw new RangeError(
      `Air-gap violation: DRACOLoader decoderPath must be a local path, received "${decoderPath}".`,
    );
  }
  const loader = new DRACOLoader();
  loader.setDecoderPath(decoderPath);
  loader.setDecoderConfig({ type: 'wasm' });
  return loader;
}

export function getSharedAirgappedDracoLoader(): DRACOLoader {
  if (!_sharedDracoLoader) {
    _sharedDracoLoader = createAirgappedDracoLoader(DRACO_DECODER_LOCAL_PATH);
  }
  return _sharedDracoLoader;
}

export function disposeSharedAirgappedDracoLoader(): void {
  if (_sharedDracoLoader) {
    _sharedDracoLoader.dispose();
    _sharedDracoLoader = null;
  }
}

/**
 * Validates both air-gapped URL locality and the 12-byte glTF 2.0 binary `.glb` header
 * (`0x46546C67` magic + version `2`) so Vite SPA HTML fallbacks (`<!DOCTYPE html>`) are caught
 * deterministically before `GLTFLoader.parse`.
 */
export function validateAirgappedGlbBuffer(
  url: string,
  buffer: ArrayBuffer,
): AirgappedGlbValidationResult {
  if (!url.startsWith('/') || url.startsWith('//') || /^https?:\/\//i.test(url)) {
    return {
      valid: false,
      reason: `Air-gap policy rejected non-local URL "${url}".`,
    };
  }
  if (buffer.byteLength < 12) {
    return {
      valid: false,
      reason: `Buffer too short (${buffer.byteLength} bytes < 12-byte GLB header).`,
    };
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== GLTF_BINARY_MAGIC_LE) {
    const asciiPrefix = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    return {
      valid: false,
      reason:
        asciiPrefix === '<!DO' || asciiPrefix === '<htm'
          ? 'SPA HTML fallback received instead of binary .glb asset.'
          : `Invalid GLB magic 0x${magic.toString(16)} ("${asciiPrefix}").`,
    };
  }

  const version = view.getUint32(4, true);
  if (version !== 2) {
    return {
      valid: false,
      reason: `Unsupported GLB binary version ${version} (expected version 2).`,
    };
  }

  const declaredByteLength = view.getUint32(8, true);
  return {
    valid: true,
    declaredByteLength,
  };
}

/**
 * Normalizes and merges an arbitrary multi-mesh `Object3D` hierarchy (e.g., Z-Anatomy `.glb`
 * with hundreds of individual bone/vessel sub-meshes) into a single indexed or non-indexed
 * `BufferGeometry` (`1` draw call), baking relative world matrices cleanly.
 */
export function mergeLoadedSceneToSingleGeometry(
  rootObject: THREE.Object3D,
): MergedGlbLoadResult {
  rootObject.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(rootObject.matrixWorld).invert();
  const relMatrix = new THREE.Matrix4();

  const normalizedParts: THREE.BufferGeometry[] = [];
  let sourceMeshCount = 0;

  rootObject.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const rawPos = child.geometry.getAttribute('position');
    if (!rawPos || rawPos.count === 0) return;

    sourceMeshCount += 1;
    // Convert indexed -> non-indexed per sub-mesh so heterogeneous index types merge cleanly
    const working = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();

    relMatrix.multiplyMatrices(rootInverse, child.matrixWorld);
    working.applyMatrix4(relMatrix);

    if (!working.getAttribute('normal')) {
      working.computeVertexNormals();
    }
    const vCount = working.getAttribute('position').count;
    if (!working.getAttribute('uv')) {
      working.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vCount * 2), 2));
    }

    // Keep strictly (position, normal, uv) so BufferGeometryUtils.mergeGeometries succeeds
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', working.getAttribute('position'));
    clean.setAttribute('normal', working.getAttribute('normal'));
    clean.setAttribute('uv', working.getAttribute('uv'));
    working.dispose();

    normalizedParts.push(clean);
  });

  if (normalizedParts.length === 0) {
    throw new RangeError('Loaded GLB hierarchy contained zero valid triangle meshes.');
  }

  const merged = mergeGeometries(normalizedParts, false);
  for (let i = 0; i < normalizedParts.length; i += 1) {
    normalizedParts[i].dispose();
  }
  if (!merged) {
    throw new RangeError('BufferGeometryUtils.mergeGeometries failed on loaded GLB sub-meshes.');
  }

  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  return {
    geometry: merged,
    sourceMeshCount,
    boundingBox: merged.boundingBox ? merged.boundingBox.clone() : new THREE.Box3(),
  };
}

function disposeTextureCandidate(candidate: unknown): void {
  if (!candidate) return;
  if (candidate instanceof THREE.Texture || (typeof candidate === 'object' && (candidate as THREE.Texture).isTexture)) {
    (candidate as THREE.Texture).dispose();
    return;
  }
  if (Array.isArray(candidate)) {
    for (let i = 0; i < candidate.length; i += 1) {
      disposeTextureCandidate(candidate[i]);
    }
  }
}

function disposeSingleMaterial(material: THREE.Material): void {
  const record = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    disposeTextureCandidate(record[key]);
  }
  if (material instanceof THREE.ShaderMaterial && material.uniforms) {
    for (const uKey of Object.keys(material.uniforms)) {
      disposeTextureCandidate(material.uniforms[uKey]?.value);
    }
  }
  material.dispose();
}

/**
 * NotebookLM Risk 4 Fix:
 * Recursively disposes all `BufferGeometry` buffers, standard & `ShaderMaterial` uniform
 * `THREE.Texture` instances, `Material` programs, `SkinnedMesh` skeletons, detaches from parent,
 * and flushes `renderer.renderLists.dispose()` so Three.js retains zero stale GPU references.
 */
export function deepDisposeObject(
  rootObject: THREE.Object3D | null | undefined,
  renderer?: RenderListsDisposable | null,
): void {
  if (!rootObject) {
    renderer?.renderLists?.dispose();
    return;
  }

  rootObject.traverse((node) => {
    const anyNode = node as THREE.Mesh & {
      skeleton?: { dispose?: () => void };
    };

    if (anyNode.geometry && typeof anyNode.geometry.dispose === 'function') {
      anyNode.geometry.dispose();
    }

    if (anyNode.skeleton && typeof anyNode.skeleton.dispose === 'function') {
      anyNode.skeleton.dispose();
    }

    const mat = anyNode.material;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i += 1) {
        if (mat[i]) disposeSingleMaterial(mat[i]);
      }
    } else if (mat) {
      disposeSingleMaterial(mat);
    }
  });

  if (rootObject.parent) {
    rootObject.removeFromParent();
  }

  renderer?.renderLists?.dispose();
}

export interface LoadAirgappedGlbOptions {
  signal?: AbortSignal;
  renderer?: THREE.WebGLRenderer | null;
  warmupMaterial?: THREE.Material | null;
}

/**
 * Fetches a local air-gapped `.glb` binary, validates magic bytes (`0x46546C67`), decodes via
 * local `/draco/` WASM if Draco-compressed, collapses all sub-meshes into a single `BufferGeometry`
 * (`1` draw call), sanitizes intermediate GLTF nodes via `deepDisposeObject`, and optionally
 * pre-compiles the shader before returning so attaching to the scene causes `0 ms` frame stutter.
 */
export async function loadAirgappedMergedGlb(
  url: string,
  options: LoadAirgappedGlbOptions = {},
): Promise<MergedGlbLoadResult | null> {
  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) {
      return null;
    }
    const buffer = await response.arrayBuffer();
    const validation = validateAirgappedGlbBuffer(url, buffer);
    if (!validation.valid) {
      return null;
    }

    const loader = new GLTFLoader();
    loader.setDRACOLoader(getSharedAirgappedDracoLoader());

    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(buffer, '', (parsed) => resolve(parsed), (err) => reject(err));
    });

    const mergedResult = mergeLoadedSceneToSingleGeometry(gltf.scene);
    deepDisposeObject(gltf.scene, options.renderer);

    if (options.renderer && options.warmupMaterial) {
      const warmupScene = new THREE.Scene();
      const warmupCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
      warmupCamera.position.set(0, 0.5, 3);
      const warmupMesh = new THREE.Mesh(mergedResult.geometry, options.warmupMaterial);
      warmupScene.add(warmupMesh);
      options.renderer.compile(warmupScene, warmupCamera);
      warmupScene.remove(warmupMesh);
    }

    return mergedResult;
  } catch {
    return null;
  }
}
