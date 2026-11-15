import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  createDigitalTwinMaterial,
  DIGITAL_TWIN_FRAGMENT_GLSL3,
  DIGITAL_TWIN_VERTEX_GLSL3,
} from '../src/stage3d/shaders/digitalTwinMaterial.ts';
import {
  createOrganLoadMaterial,
  ORGAN_LOAD_FRAGMENT_GLSL3,
} from '../src/stage3d/shaders/organLoadMaterial.ts';
import {
  createCausalArcMaterial,
  CAUSAL_ARC_FRAGMENT_GLSL3,
} from '../src/stage3d/shaders/causalArcMaterial.ts';
import {
  assertMorphTopologyMatch,
  buildIndexedSexSilhouette,
  buildInternalOrganCoreGeometry,
  buildProceduralTwinGeometry,
  updateTwinRegionObservation,
} from '../src/stage3d/geometry/proceduralTwinBuilder.ts';
import {
  UBERON_INSTANCE_COUNT,
  createInjuryPinsInstancedMesh,
  createUberonInstancedMesh,
  isCanonicalStageUberonCurie,
  resolveRegionForInstanceId,
  resolveSafeNodeHexColor,
  updateInjuryPinsInstancedMesh,
  updateUberonInstancedMesh,
} from '../src/stage3d/geometry/uberonInstancedNodes.ts';
import {
  createMergedCausalBezierArcs,
  updateCausalBezierArcsGeometry,
} from '../src/stage3d/geometry/causalBezierArcs.ts';
import {
  DRACO_DECODER_LOCAL_PATH,
  GLTF_BINARY_MAGIC_LE,
  createAirgappedDracoLoader,
  deepDisposeObject,
  mergeLoadedSceneToSingleGeometry,
  validateAirgappedGlbBuffer,
} from '../src/stage3d/geometry/airgappedGlbLoader.ts';
import {
  POLAR_MAX_RAD,
  POLAR_MIN_RAD,
  beginCameraFlight,
  clampPolarPhi,
  computeApexClearanceRadius,
  computeOpticalViewOffset,
  createInitialCameraRigState,
  presetToCameraSnapshot,
  shortestAzimuthDelta,
  stepCameraRigFrame,
} from '../src/stage3d/cameraRigMath.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGE3D_DIR = path.resolve(__dirname, '../src/stage3d');

test('Phase 3 Risk 2: Dual-Gender procedural twin enforces 1:1 morph topology parity and throws on mismatch', () => {
  const male = buildIndexedSexSilhouette(false, 20);
  const female = buildIndexedSexSilhouette(true, 20);

  assert.doesNotThrow(() => {
    assertMorphTopologyMatch(male, female, 'TestMaleFemale');
  });

  // Verify genuine anatomical dimorphism (Male broader shoulders at y~1.12; Female wider pelvis at y~0.34)
  const mPos = male.getAttribute('position');
  const fPos = female.getAttribute('position');
  let maxAbsDelta = 0;
  for (let i = 0; i < mPos.array.length; i += 1) {
    maxAbsDelta = Math.max(maxAbsDelta, Math.abs(fPos.array[i] - mPos.array[i]));
  }
  assert.ok(maxAbsDelta > 0.02, `Expected non-zero anatomical morph delta, got ${maxAbsDelta}`);

  // Mismatched radial segment count MUST throw RangeError immediately (Risk 2)
  const mismatched = buildIndexedSexSilhouette(true, 16);
  assert.throws(
    () => assertMorphTopologyMatch(male, mismatched, 'MismatchedPair'),
    RangeError,
  );

  male.dispose();
  female.dispose();
  mismatched.dispose();
});

test('Phase 3 Twin Geometry: non-indexed barycentric wireframe + morphTarget0/morphNormal0 + per-region observation', () => {
  const bundle = buildProceduralTwinGeometry(18);
  const geom = bundle.geometry;

  assert.equal(geom.getIndex(), null, 'Barycentric twin geometry must be non-indexed');
  assert.equal(bundle.vertexCount % 3, 0);
  assert.equal(bundle.triangleCount, bundle.vertexCount / 3);

  const pos = geom.getAttribute('position');
  const morphPos = geom.getAttribute('morphTarget0');
  const morphNorm = geom.getAttribute('morphNormal0');
  const bary = geom.getAttribute('aBarycentric');
  const obs = geom.getAttribute('aObserved');

  assert.equal(morphPos.count, pos.count);
  assert.equal(morphNorm.count, pos.count);
  assert.equal(bary.count, pos.count);
  assert.equal(obs.count, pos.count);

  // Verify triangle barycentric coordinates [1,0,0], [0,1,0], [0,0,1]
  assert.deepEqual(
    Array.from(bary.array.slice(0, 9)),
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
  );

  //Selective Issue #11 region unobservation
  updateTwinRegionObservation(geom, {
    HeartCardioAutonomic: false,
    EyeOcularSans: true,
    InternalJugularVein: true,
    SoleusCalcaneus: true,
    BrainVestibularCns: true,
  });

  let zeroCount = 0;
  let oneCount = 0;
  for (let i = 0; i < obs.count; i += 1) {
    if (obs.getX(i) === 0) zeroCount += 1;
    if (obs.getX(i) === 1) oneCount += 1;
  }
  assert.ok(zeroCount > 0, 'Unobserved thoracic region vertices must flip aObserved to 0');
  assert.ok(oneCount > 0, 'Observed regions must keep aObserved at 1');

  const organCore = buildInternalOrganCoreGeometry();
  organCore.computeBoundingBox();
  assert.ok(organCore.boundingBox);
  assert.ok(organCore.boundingBox.max.y > 1.6, 'Organ core must include cerebral hemispheres');
  assert.ok(organCore.boundingBox.min.y < -0.35, 'Organ core must include soleus compartments');

  geom.dispose();
  organCore.dispose();
});

test('Phase 3 GLSL3 Shaders: BackSide/FrontSide Fresnel, object-space morph normals, and Issue #11 unobserved palette', () => {
  const backMat = createDigitalTwinMaterial({ side: THREE.BackSide, globalObserved: false });
  const frontMat = createDigitalTwinMaterial({ side: THREE.FrontSide, globalObserved: true });
  const organMat = createOrganLoadMaterial({ observed: false });
  const arcMat = createCausalArcMaterial();

  assert.equal(backMat.glslVersion, THREE.GLSL3);
  assert.equal(frontMat.glslVersion, THREE.GLSL3);
  assert.equal(organMat.glslVersion, THREE.GLSL3);
  assert.equal(arcMat.glslVersion, THREE.GLSL3);

  assert.equal(backMat.side, THREE.BackSide);
  assert.equal(frontMat.side, THREE.FrontSide);
  assert.equal(backMat.depthWrite, false);
  assert.equal(arcMat.blending, THREE.AdditiveBlending);

  // Verify GLSL3 explicit fragment output and object-space normal morphing before normalMatrix
  assert.match(DIGITAL_TWIN_VERTEX_GLSL3, /blendedObjNormal\s*=\s*normal\s*\+\s*morphNormal0\s*\*\s*w/);
  assert.match(DIGITAL_TWIN_VERTEX_GLSL3, /normalize\(\s*normalMatrix\s*\*\s*morphedNormal\s*\)/);
  assert.match(DIGITAL_TWIN_FRAGMENT_GLSL3, /layout\(location = 0\) out vec4 fragColor;/);
  assert.match(DIGITAL_TWIN_FRAGMENT_GLSL3, /bayerDither4x4/);
  assert.match(ORGAN_LOAD_FRAGMENT_GLSL3, /layout\(location = 0\) out vec4 fragColor;/);
  assert.match(CAUSAL_ARC_FRAGMENT_GLSL3, /layout\(location = 0\) out vec4 fragColor;/);

  // Issue #11 color invariant: unobserved colors are #6b7280 and #facc15, NEVER #22d3ee
  const unobsNoRrHex = `#${(backMat.uniforms.uUnobservedNoRrColor.value as THREE.Color).getHexString()}`;
  const propOnlyHex = `#${(backMat.uniforms.uPropagatedOnlyColor.value as THREE.Color).getHexString()}`;
  assert.equal(unobsNoRrHex, '#6b7280');
  assert.equal(propOnlyHex, '#facc15');
  assert.notEqual(unobsNoRrHex, '#22d3ee');

  backMat.dispose();
  frontMat.dispose();
  organMat.dispose();
  arcMat.dispose();
});

test('Phase 3 UBERON Instanced Beacons & Merged CubicBezierCurve3 Causal Arcs enforce Issue #11 & UBERON:0001585 rejection', () => {
  assert.equal(isCanonicalStageUberonCurie('UBERON:0001586'), true);
  assert.equal(isCanonicalStageUberonCurie('UBERON:0001585'), false);

  const beacons = createUberonInstancedMesh();
  assert.equal(beacons.count, UBERON_INSTANCE_COUNT);
  assert.equal(beacons.renderOrder, 1);
  assert.equal(resolveRegionForInstanceId(1), 'InternalJugularVein');
  assert.equal(resolveRegionForInstanceId(99), null);

  // Even if caller supplies #22d3ee on an unobserved node, resolveSafeNodeHexColor clamps to #6b7280/#facc15
  assert.equal(
    resolveSafeNodeHexColor({ observed: false, propagatedIntensity: 0.0, color: '#22d3ee' }),
    '#6b7280',
  );
  assert.equal(
    resolveSafeNodeHexColor({ observed: false, propagatedIntensity: 0.25, color: '#22d3ee' }),
    '#facc15',
  );

  updateUberonInstancedMesh(beacons, null, 'InternalJugularVein', 1.25);
  const aHighlight = beacons.geometry.getAttribute('aHighlight') as THREE.InstancedBufferAttribute;
  assert.equal(aHighlight.getX(1), 1.0);
  assert.equal(aHighlight.getX(0), 0.0);

  const injuryPins = createInjuryPinsInstancedMesh(10);
  assert.equal(injuryPins.count, 0);
  updateInjuryPinsInstancedMesh(
    injuryPins,
    [
      {
        id: 'inj-1',
        region: 'HEAD_FOREHEAD',
        title: 'Forehead Contusion',
        severity: 'HIGH',
        methodId: 'MANUAL_CREW_ENTRY',
        validationStatus: 'ILLUSTRATIVE_UNVALIDATED',
        summary: 'Test',
        careSteps: [],
        detectedAt: '2026-11-15T00:00:00Z',
      },
    ],
    2.0,
  );
  assert.equal(injuryPins.count, 1);

  const arcsBundle = createMergedCausalBezierArcs();
  assert.equal(arcsBundle.segments.length, 6, 'All 6 physiological hyperedges must be merged into 1 geometry');
  updateCausalBezierArcsGeometry(
    arcsBundle,
    [
      {
        id: 'HeartCardioAutonomic->InternalJugularVein',
        sourceRegion: 'HeartCardioAutonomic',
        targetRegion: 'InternalJugularVein',
        sourcePos: [0, 0.866, 0.042],
        targetPos: [-0.06, 1.2884, 0.064],
        midPoint: [-0.03, 1.07, 0.2],
        couplingWeight: 0.55,
        mechanism: 'cephalad_venous_congestion',
        fluxIntensity: 0.42,
        color: '#f43f5e',
        dashed: false,
      },
    ],
    { HeartCardioAutonomic: true },
  );
  const fluxAttr = arcsBundle.geometry.getAttribute('aFluxIntensity') as THREE.BufferAttribute;
  assert.ok(Math.abs(fluxAttr.getX(0) - 0.42) < 1e-5);

  deepDisposeObject(beacons);
  deepDisposeObject(injuryPins);
  arcsBundle.geometry.dispose();
});

test('Phase 3 Air-Gapped GLB Loader & Risk 4 deepDisposeObject sanitize geometries, textures, and renderLists', () => {
  const draco = createAirgappedDracoLoader();
  assert.equal(DRACO_DECODER_LOCAL_PATH, '/draco/');
  draco.dispose();

  assert.throws(
    () => createAirgappedDracoLoader('https://www.gstatic.com/draco/v1/decoders/'),
    RangeError,
  );

  // Valid 20-byte GLB header
  const validBuf = new ArrayBuffer(20);
  const view = new DataView(validBuf);
  view.setUint32(0, GLTF_BINARY_MAGIC_LE, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 20, true);
  assert.equal(validateAirgappedGlbBuffer('/anatomy/SkeletalSystem100.glb', validBuf).valid, true);
  assert.equal(
    validateAirgappedGlbBuffer('https://cdn.example.com/model.glb', validBuf).valid,
    false,
  );

  // SPA HTML fallback rejection
  const htmlBytes = new TextEncoder().encode('<!DOCTYPE html><html></html>').buffer;
  const htmlCheck = validateAirgappedGlbBuffer('/anatomy/Missing.glb', htmlBytes);
  assert.equal(htmlCheck.valid, false);
  assert.match(htmlCheck.reason ?? '', /HTML fallback/);

  // Multi-mesh group collapsed into 1 BufferGeometry
  const group = new THREE.Group();
  const childA = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshBasicMaterial(),
  );
  childA.position.set(-0.2, 0.4, 0);
  const childB = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 6).toNonIndexed(),
    new THREE.MeshBasicMaterial(),
  );
  childB.position.set(0.2, 0.8, 0.1);
  group.add(childA, childB);

  const mergedRes = mergeLoadedSceneToSingleGeometry(group);
  assert.equal(mergedRes.sourceMeshCount, 2);
  assert.ok(mergedRes.geometry.getAttribute('position').count > 24);
  mergedRes.geometry.dispose();

  // Risk 4 verification: track every .dispose() call including textures + ShaderMaterial uniform textures + renderLists
  let geomDisposals = 0;
  let matDisposals = 0;
  let texDisposals = 0;
  let renderListsDisposals = 0;

  const texMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const uniformTex = new THREE.DataTexture(new Uint8Array([0, 255, 255, 255]), 1, 1);
  texMap.dispose = () => {
    texDisposals += 1;
  };
  uniformTex.dispose = () => {
    texDisposals += 1;
  };

  const stdMat = new THREE.MeshStandardMaterial({ map: texMap });
  stdMat.dispose = () => {
    matDisposals += 1;
  };
  const shdMat = new THREE.ShaderMaterial({
    uniforms: { uLut: { value: uniformTex } },
  });
  shdMat.dispose = () => {
    matDisposals += 1;
  };

  const trackedGeom = new THREE.BoxGeometry(1, 1, 1);
  trackedGeom.dispose = () => {
    geomDisposals += 1;
  };

  const parentScene = new THREE.Group();
  const disposableRoot = new THREE.Group();
  const multiMatMesh = new THREE.Mesh(trackedGeom, [stdMat, shdMat]);
  disposableRoot.add(multiMatMesh);
  parentScene.add(disposableRoot);

  deepDisposeObject(disposableRoot, {
    renderLists: {
      dispose: () => {
        renderListsDisposals += 1;
      },
    },
  });

  assert.equal(geomDisposals, 1, 'Mesh geometry must be disposed');
  assert.equal(matDisposals, 2, 'All array/shader materials must be disposed');
  assert.equal(texDisposals, 2, 'Standard map + ShaderMaterial uniform texture must be disposed');
  assert.equal(renderListsDisposals, 1, 'renderer.renderLists.dispose() must be invoked');
  assert.equal(disposableRoot.parent, null, 'Disposed root must be detached from parent');

  deepDisposeObject(group);
});

test('Phase 3 Camera Rig Math: shortest-arc atan2 wraparound, polar clamp, 1.15x apex clearance, frustum offset, and reduced-motion snap', () => {
  // +179 deg -> -179 deg is a +2 deg (+0.0349066 rad) shortest arc across +-PI, NOT -358 deg
  const degToRad = (d: number) => (d * Math.PI) / 180;
  const delta = shortestAzimuthDelta(degToRad(179), degToRad(-179));
  assert.ok(Math.abs(delta - degToRad(2)) < 1e-6, `Expected +2 deg shortest arc, got ${delta}`);

  assert.equal(clampPolarPhi(-0.5), POLAR_MIN_RAD);
  assert.equal(clampPolarPhi(Math.PI + 0.5), POLAR_MAX_RAD);

  // Wide azimuthal slew (> 90 deg) reaches 1.15x max radius at mid-flight (p = 0.5)
  const midR = computeApexClearanceRadius(1.2, 1.0, Math.PI * 0.85, 0.5);
  assert.ok(Math.abs(midR - 1.2 * 1.15) < 1e-6, `Expected 1.38m apex clearance, got ${midR}`);
  assert.ok(Math.abs(computeApexClearanceRadius(1.2, 1.0, Math.PI * 0.85, 1.0) - 1.0) < 1e-6);

  // Optical frustum centering: Left dock 360px, Right dock 0px -> offsetX = -180px
  const viewOffset = computeOpticalViewOffset(1440, 900, {
    leftPx: 360,
    rightPx: 0,
    topPx: 52,
    bottomPx: 0,
  });
  assert.equal(viewOffset.offsetX, -180);
  assert.equal(viewOffset.offsetY, -26);

  // Reduced-motion mode snaps camera pose and offset in 1 frame
  const rig = createInitialCameraRigState(presetToCameraSnapshot('DEFAULT'));
  const ijvSnap = presetToCameraSnapshot('IJV');
  beginCameraFlight(rig, ijvSnap);
  stepCameraRigFrame(rig, ijvSnap, -180, -26, 0.016, true);
  assert.equal(rig.inFlight, false);
  assert.ok(Math.abs(rig.radiusM - ijvSnap.radiusM) < 1e-6);
  assert.equal(rig.offsetX, -180);
  assert.equal(rig.offsetY, -26);

  // Standard spring mode converges smoothly over ~0.6s without instability
  const smoothRig = createInitialCameraRigState(presetToCameraSnapshot('DEFAULT'));
  beginCameraFlight(smoothRig, ijvSnap);
  for (let frame = 0; frame < 60; frame += 1) {
    stepCameraRigFrame(smoothRig, ijvSnap, -120, 0, 1 / 60, false);
  }
  assert.ok(Math.abs(smoothRig.radiusM - ijvSnap.radiusM) < 0.01);
  assert.ok(Math.abs(smoothRig.offsetX - -120) < 0.5);
});

test('Phase 3 Static Architectural Guards: zero postprocessing, zero CDN, Risk 3 scrubbing lock, WebGL context recovery, zero emojis', () => {
  const emojiRegex = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const cdnRegex = /(gstatic\.com|googleapis\.com|unpkg\.com|jsdelivr\.net)/i;

  const collectFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...collectFiles(full));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  };

  const files = collectFiles(STAGE3D_DIR);
  assert.equal(files.length, 14, 'Expected all 14 Phase 3 modules in src/stage3d/');

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.equal(
      emojiRegex.test(src),
      false,
      `Zero-emoji invariant violated in ${path.relative(STAGE3D_DIR, file)}`,
    );
    assert.equal(
      cdnRegex.test(src),
      false,
      `Air-gap invariant violated (CDN URL found) in ${path.relative(STAGE3D_DIR, file)}`,
    );
    assert.equal(
      src.includes('@react-three/postprocessing'),
      false,
      `Prohibited postprocessing dependency found in ${path.relative(STAGE3D_DIR, file)}`,
    );
  }

  const canvasSrc = fs.readFileSync(path.join(STAGE3D_DIR, 'SpatialCanvasRoot.tsx'), 'utf8');
  assert.ok(canvasSrc.includes('webglcontextlost'));
  assert.ok(canvasSrc.includes('webglcontextrestored'));
  assert.ok(canvasSrc.includes('setAnimationLoop(null)'));
  assert.ok(canvasSrc.includes('resetState()'));
  assert.ok(canvasSrc.includes('View.Port'));
  assert.ok(canvasSrc.includes('stencil: false'));

  const camCtrlSrc = fs.readFileSync(path.join(STAGE3D_DIR, 'UnifiedCameraController.tsx'), 'utf8');
  assert.ok(camCtrlSrc.includes('enabled={!effectiveScrubbing}'), 'Risk 3 OrbitControls freeze required');

  const secViewSrc = fs.readFileSync(path.join(STAGE3D_DIR, 'SecondaryMeshViewport.tsx'), 'utf8');
  assert.ok(secViewSrc.includes('enabled={!isScrubbing}'), 'Risk 3 secondary OrbitControls freeze required');
});
