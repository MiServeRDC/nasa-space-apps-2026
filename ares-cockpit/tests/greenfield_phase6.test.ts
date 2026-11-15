import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

import { waitForFontsReadyBounded } from '../src/instruments/instrumentMath.ts';
import {
  assertMorphTopologyMatch,
  buildIndexedSexSilhouette,
  buildInternalOrganCoreGeometry,
  buildProceduralTwinGeometry,
  updateOrganCoreRegionLoads,
  updateTwinRegionObservation,
} from '../src/stage3d/geometry/proceduralTwinBuilder.ts';
import {
  createUberonHaloRingsInstancedMesh,
  updateUberonHaloRingsInstancedMesh,
} from '../src/stage3d/geometry/uberonInstancedNodes.ts';
import { deepDisposeObject } from '../src/stage3d/geometry/airgappedGlbLoader.ts';
import {
  ASSERTIVE_NODE_ID,
  DEDUP_WINDOW_MS,
  POLITE_HYSTERESIS_MS,
  POLITE_NODE_ID,
  announceAssertive,
  announcePolite,
  resetA11yAnnouncerState,
} from '../src/stores/a11yAnnouncer.ts';
import { useWorkbenchStore } from '../src/stores/workbenchStore.ts';
import { useStudioTimelineStore } from '../src/stores/studioTimelineStore.ts';
import { restoreFocusById } from '../src/drawers/drawerLogic.ts';
import {
  DRAWER_HOST_LAYER_ID,
  MAIN_WORKBENCH_SCAFFOLD_ID,
  syncBackgroundInertState,
} from '../src/drawers/useKeyboardOrchestrator.ts';

const COCKPIT_ROOT = path.resolve(import.meta.dirname, '..');

function collectFilesRecursively(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFilesRecursively(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

test('Phase 6 Risk 1: document.fonts.ready bounded gate governs legacy FLIP, drawers and preloader', async () => {
  // 1. Behavioral: resolves 'locked' when fontSet.load + fontSet.ready complete within timeout
  const loadCalls: string[] = [];
  const lockedStatus = await waitForFontsReadyBounded({
    timeoutMs: 250,
    win: {},
    doc: {
      fonts: {
        load: async (spec: string) => {
          loadCalls.push(spec);
          return [];
        },
        ready: Promise.resolve(),
      },
    },
  });
  assert.equal(lockedStatus, 'locked');
  assert.equal(loadCalls.length, 2);
  assert.ok(loadCalls.some((s) => s.includes('Geist Variable')));
  assert.ok(loadCalls.some((s) => s.includes('Geist Mono Variable')));

  // 2. Behavioral: resolves 'timeout_fallback' cleanly without hanging if document.fonts.ready stalls
  const neverResolves = new Promise<void>(() => {});
  const startMs = Date.now();
  const fallbackStatus = await waitForFontsReadyBounded({
    timeoutMs: 60,
    win: {},
    doc: {
      fonts: {
        ready: neverResolves,
      },
    },
  });
  const elapsedMs = Date.now() - startMs;
  assert.equal(fallbackStatus, 'timeout_fallback');
  assert.ok(elapsedMs >= 45 && elapsedMs < 1000, `Expected bounded timeout fallback, got ${elapsedMs}ms`);

  // The bounded font gate remains in the legacy motion components.
  const bentoCard = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/instruments/BentoCardShell.tsx'), 'utf-8');
  const fontsGateIdx = bentoCard.indexOf('waitForFontsReadyBounded');
  const flipGetStateIdx = bentoCard.indexOf('Flip.getState');
  assert.ok(fontsGateIdx > 0 && flipGetStateIdx > fontsGateIdx, 'waitForFontsReadyBounded must precede Flip.getState');

  const drawerShell = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/drawers/SlideOverDrawerShell.tsx'), 'utf-8');
  assert.match(drawerShell, /waitForFontsReadyBounded/);

  const preloader = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/workbench/TelemetryIgnitionPreloader.tsx'), 'utf-8');
  assert.match(preloader, /waitForFontsReadyBounded/);
});

test('Phase 6 Risk 2: proceduralTwinBuilder enforces strict base vs morphTarget0 vertex and index buffer parity', () => {
  const male = buildIndexedSexSilhouette(false, 20);
  const female = buildIndexedSexSilhouette(true, 20);

  // Valid pair passes strictly
  assert.doesNotThrow(() => {
    assertMorphTopologyMatch(male, female, 'Phase6ParityValid');
  });

  // Divergent vertex count throws RangeError
  const mismatchedSegments = buildIndexedSexSilhouette(true, 16);
  assert.throws(
    () => assertMorphTopologyMatch(male, mismatchedSegments, 'Phase6VertexMismatch'),
    RangeError,
  );

  // Divergent single index slot throws RangeError even with identical vertex & index counts
  const mutatedIndexTarget = female.clone();
  const origIdx = female.getIndex()!;
  const clonedIndices = new Uint32Array(origIdx.array as ArrayLike<number>);
  clonedIndices[3] = (clonedIndices[3] + 1) % male.getAttribute('position').count;
  mutatedIndexTarget.setIndex(new THREE.BufferAttribute(clonedIndices, 1));

  assert.throws(
    () => assertMorphTopologyMatch(male, mutatedIndexTarget, 'Phase6IndexSlotMismatch'),
    RangeError,
  );

  // Full baked procedural twin has matching attribute counts across position, morphTarget0, morphNormal0, aBarycentric
  const bundle = buildProceduralTwinGeometry(18);
  const posCount = bundle.geometry.getAttribute('position').count;
  assert.equal(bundle.vertexCount, posCount);
  assert.equal(bundle.geometry.getAttribute('morphTarget0').count, posCount);
  assert.equal(bundle.geometry.getAttribute('morphNormal0').count, posCount);
  assert.equal(bundle.geometry.getAttribute('aBarycentric').count, posCount);
  assert.equal(bundle.geometry.getAttribute('aObserved').count, posCount);

  male.dispose();
  female.dispose();
  mismatchedSegments.dispose();
  mutatedIndexTarget.dispose();
  bundle.geometry.dispose();
});

test('Phase 6 Risk 3: setPointerCapture + isScrubbing freezes OrbitControls across all sliders and viewports', () => {
  const wb = useWorkbenchStore.getState();
  const st = useStudioTimelineStore.getState();
  wb.setIsScrubbing(false);
  st.setIsScrubbing(false);

  assert.equal(
    useWorkbenchStore.getState().isScrubbing || useStudioTimelineStore.getState().isScrubbing,
    false,
  );

  wb.setIsScrubbing(true);
  assert.equal(
    useWorkbenchStore.getState().isScrubbing || useStudioTimelineStore.getState().isScrubbing,
    true,
  );
  wb.setIsScrubbing(false);

  st.setIsScrubbing(true);
  assert.equal(
    useWorkbenchStore.getState().isScrubbing || useStudioTimelineStore.getState().isScrubbing,
    true,
  );
  st.setIsScrubbing(false);

  const sliderFiles = [
    'src/lenses/WhatIfCounterfactualLens.tsx',
    'src/drawers/MissionPortalDrawer.tsx',
    'src/drawers/OpenScreenStudioBar.tsx',
    'src/workbench/PhaseActDeck.tsx',
  ];

  for (const rel of sliderFiles) {
    const src = fs.readFileSync(path.join(COCKPIT_ROOT, rel), 'utf-8');
    assert.match(src, /setPointerCapture\s*\(\s*e\.pointerId\s*\)/, `${rel} must call setPointerCapture(e.pointerId)`);
    assert.match(src, /releasePointerCapture\s*\(\s*e\.pointerId\s*\)/, `${rel} must release pointer capture`);
    assert.match(src, /onPointerCancel/, `${rel} must reset scrubbing on pointercancel`);
    assert.match(
      src,
      /set(?:Is|Studio|Workbench)?Scrubbing\(true\)/,
      `${rel} must engage scrubbing lock on pointerdown`,
    );
    assert.match(
      src,
      /set(?:Is|Studio|Workbench)?Scrubbing\(false\)/,
      `${rel} must release scrubbing lock on pointerup/pointercancel`,
    );
  }

  const unifiedCam = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/stage3d/UnifiedCameraController.tsx'), 'utf-8');
  assert.match(unifiedCam, /enabled=\{!effectiveScrubbing\}/);

  const secondaryVp = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/stage3d/SecondaryMeshViewport.tsx'), 'utf-8');
  assert.match(secondaryVp, /enabled=\{!isScrubbing\}/);
});

test('Phase 6 Risk 4: deepDisposeObject recursively disposes geometries, textures, shader uniforms, skeletons, and renderLists', () => {
  let geomDisposed = 0;
  let matDisposed = 0;
  let stdTexDisposed = 0;
  let uniformTexDisposed = 0;
  let skeletonDisposed = 0;
  let renderListsDisposed = 0;

  const parentScene = new THREE.Scene();
  const rootGroup = new THREE.Group();
  parentScene.add(rootGroup);

  const geomA = new THREE.BoxGeometry(1, 1, 1);
  const origGeomADispose = geomA.dispose.bind(geomA);
  geomA.dispose = () => {
    geomDisposed += 1;
    origGeomADispose();
  };

  const stdTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const origStdTexDispose = stdTex.dispose.bind(stdTex);
  stdTex.dispose = () => {
    stdTexDisposed += 1;
    origStdTexDispose();
  };

  const matA = new THREE.MeshBasicMaterial({ map: stdTex });
  const origMatADispose = matA.dispose.bind(matA);
  matA.dispose = () => {
    matDisposed += 1;
    origMatADispose();
  };

  const uniformTex = new THREE.DataTexture(new Uint8Array([0, 255, 255, 255]), 1, 1);
  const origUniTexDispose = uniformTex.dispose.bind(uniformTex);
  uniformTex.dispose = () => {
    uniformTexDisposed += 1;
    origUniTexDispose();
  };

  const shaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uLookup: { value: uniformTex },
    },
  });
  const origShaderMatDispose = shaderMat.dispose.bind(shaderMat);
  shaderMat.dispose = () => {
    matDisposed += 1;
    origShaderMatDispose();
  };

  const childMesh = new THREE.Mesh(geomA, [matA, shaderMat]) as THREE.Mesh & {
    skeleton?: { dispose: () => void };
  };
  childMesh.skeleton = {
    dispose: () => {
      skeletonDisposed += 1;
    },
  };
  rootGroup.add(childMesh);

  deepDisposeObject(rootGroup, {
    renderLists: {
      dispose: () => {
        renderListsDisposed += 1;
      },
    },
  });

  assert.equal(geomDisposed, 1);
  assert.equal(matDisposed, 2);
  assert.equal(stdTexDisposed, 1);
  assert.equal(uniformTexDisposed, 1);
  assert.equal(skeletonDisposed, 1);
  assert.equal(renderListsDisposed, 1);
  assert.equal(rootGroup.parent, null, 'deepDisposeObject must detach rootObject from parent');

  const warmupSrc = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/stage3d/ShaderWarmupManager.tsx'), 'utf-8');
  assert.match(warmupSrc, /deepDisposeObject\(warmupScene,\s*gl\)/);
});

test('Phase 6 Risk 5: 3000ms polite hysteresis, 5000ms dedup, 0ms assertive bypass, offsetHeight reflow, inert & restoreFocusById', () => {
  resetA11yAnnouncerState();
  assert.equal(POLITE_HYSTERESIS_MS, 3000);
  assert.equal(DEDUP_WINDOW_MS, 5000);

  let politeText: string | null = '';
  let assertiveText: string | null = '';
  let politeReflows = 0;
  let assertiveReflows = 0;

  const mockDoc = {
    getElementById(id: string) {
      if (id === POLITE_NODE_ID) {
        return {
          get textContent() {
            return politeText;
          },
          set textContent(v: string | null) {
            politeText = v;
          },
          get offsetHeight() {
            politeReflows += 1;
            return 16;
          },
        };
      }
      if (id === ASSERTIVE_NODE_ID) {
        return {
          get textContent() {
            return assertiveText;
          },
          set textContent(v: string | null) {
            assertiveText = v;
          },
          get offsetHeight() {
            assertiveReflows += 1;
            return 16;
          },
        };
      }
      return null;
    },
  };

  // t=1000ms: Initial polite announcement succeeds with synchronous reflow
  const r1 = announcePolite('Entered counterfactual simulation.', { nowMs: 1000, doc: mockDoc });
  assert.equal(r1.announced, true);
  assert.equal(r1.domUpdated, true);
  assert.equal(politeText, 'Entered counterfactual simulation.');
  assert.equal(politeReflows, 1);

  // t=2500ms (< 3000ms hysteresis): Distinct polite message suppressed by HYSTERESIS_3000MS
  const r2 = announcePolite('Switched to Evaluate phase.', { nowMs: 2500, doc: mockDoc });
  assert.equal(r2.announced, false);
  assert.equal(r2.suppressedReason, 'HYSTERESIS_3000MS');

  // t=4200ms (>= 3000ms hysteresis, < 5000ms dedup): Identical string suppressed by DEDUP_5000MS
  const r3 = announcePolite('Entered counterfactual simulation.', { nowMs: 4200, doc: mockDoc });
  assert.equal(r3.announced, false);
  assert.equal(r3.suppressedReason, 'DEDUP_5000MS');

  // t=4250ms (50ms later): Assertive clinical gate alert bypasses 3000ms polite hysteresis in 0ms!
  const r4 = announceAssertive('Gate 2 LBNP auto-vent triggered.', { nowMs: 4250, doc: mockDoc });
  assert.equal(r4.announced, true);
  assert.equal(r4.nodeId, ASSERTIVE_NODE_ID);
  assert.equal(assertiveText, 'Gate 2 LBNP auto-vent triggered.');
  assert.equal(assertiveReflows, 1);

  // Verify background `inert` + `aria-hidden` state machine on `#main-workbench-scaffold` & `#drawer-host-layer`
  const attrs: Record<string, Map<string, string>> = {
    [MAIN_WORKBENCH_SCAFFOLD_ID]: new Map(),
    [DRAWER_HOST_LAYER_ID]: new Map(),
  };
  const scaffoldNodes: Record<string, { inert?: boolean; setAttribute: (k: string, v: string) => void; removeAttribute: (k: string) => void }> = {
    [MAIN_WORKBENCH_SCAFFOLD_ID]: {
      setAttribute: (k, v) => attrs[MAIN_WORKBENCH_SCAFFOLD_ID].set(k, v),
      removeAttribute: (k) => attrs[MAIN_WORKBENCH_SCAFFOLD_ID].delete(k),
    },
    [DRAWER_HOST_LAYER_ID]: {
      setAttribute: (k, v) => attrs[DRAWER_HOST_LAYER_ID].set(k, v),
      removeAttribute: (k) => attrs[DRAWER_HOST_LAYER_ID].delete(k),
    },
  };
  const scaffoldDoc = {
    getElementById: (id: string) => scaffoldNodes[id] ?? null,
  };

  syncBackgroundInertState(scaffoldDoc, { hasModalOverlay: false, hasDrawerOpen: true });
  assert.equal(scaffoldNodes[MAIN_WORKBENCH_SCAFFOLD_ID].inert, true);
  assert.equal(attrs[MAIN_WORKBENCH_SCAFFOLD_ID].get('aria-hidden'), 'true');
  assert.equal(scaffoldNodes[DRAWER_HOST_LAYER_ID].inert, false);

  syncBackgroundInertState(scaffoldDoc, { hasModalOverlay: true, hasDrawerOpen: true });
  assert.equal(scaffoldNodes[MAIN_WORKBENCH_SCAFFOLD_ID].inert, true);
  assert.equal(scaffoldNodes[DRAWER_HOST_LAYER_ID].inert, true);

  syncBackgroundInertState(scaffoldDoc, { hasModalOverlay: false, hasDrawerOpen: false });
  assert.equal(scaffoldNodes[MAIN_WORKBENCH_SCAFFOLD_ID].inert, false);
  assert.equal(attrs[MAIN_WORKBENCH_SCAFFOLD_ID].has('inert'), false);
  assert.equal(scaffoldNodes[DRAWER_HOST_LAYER_ID].inert, false);

  // Verify `restoreFocusById` restores focus with `{ preventScroll: true }` on invoker button
  let focusedWithPreventScroll = false;
  const prevGlobalDoc = (globalThis as Record<string, unknown>).document;
  try {
    (globalThis as Record<string, unknown>).document = {
      getElementById: (id: string) =>
        id === 'horizon-portal-btn'
          ? {
              focus: (opts?: { preventScroll?: boolean }) => {
                focusedWithPreventScroll = opts?.preventScroll === true;
              },
            }
          : null,
    };
    restoreFocusById('horizon-portal-btn');
    assert.equal(focusedWithPreventScroll, true);
  } finally {
    if (prevGlobalDoc === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = prevGlobalDoc;
    }
  }
});

test('Phase 6 Global Codebase Hygiene: single telemetry validator, zero emojis, and 100% air-gapped assets/URLs', () => {
  // 1. Duplicate validator must NOT exist
  assert.equal(
    fs.existsSync(path.join(COCKPIT_ROOT, 'src/lib/validateTelemetry.ts')),
    false,
    'src/lib/validateTelemetry.ts must not exist; src/lib/telemetryValidation.ts is the sole validator',
  );

  // 2. Zero Unicode emojis across index.html, src/**, and tests/**
  const emojiRegex = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const allCheckedFiles = [
    path.join(COCKPIT_ROOT, 'index.html'),
    ...collectFilesRecursively(path.join(COCKPIT_ROOT, 'src')),
    ...collectFilesRecursively(path.join(COCKPIT_ROOT, 'tests')),
  ];

  for (const file of allCheckedFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const match = emojiRegex.exec(content);
    assert.equal(
      match,
      null,
      `Forbidden emoji U+${match ? match[0].codePointAt(0)?.toString(16).toUpperCase() : ''} in ${path.relative(COCKPIT_ROOT, file)}`,
    );
  }

  // 3. Air-gapped external URL check across index.html and all src/**
  const urlRegex = /https?:\/\/[^\s"'`<>)]+/g;
  const srcAndHtmlFiles = [
    path.join(COCKPIT_ROOT, 'index.html'),
    ...collectFilesRecursively(path.join(COCKPIT_ROOT, 'src')),
  ];

  for (const file of srcAndHtmlFiles) {
    const rel = path.relative(COCKPIT_ROOT, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const matches = line.match(urlRegex) ?? [];
      for (const url of matches) {
        const isLocalOrXmlNs =
          url.includes('127.0.0.1') ||
          url.includes('localhost') ||
          url.includes('ipc.localhost') ||
          url.includes('www.w3.org/2000/svg');
        const isInertAtlasCitation =
          rel === 'src/modules/portal/MissionPortal.tsx' && line.trim().startsWith('doiOrUrl:');
        assert.ok(
          isLocalOrXmlNs || isInertAtlasCitation,
          `Forbidden external URL "${url}" in ${rel}:${i + 1}`,
        );
      }
    }
  }
});

test('Phase 6 3D Stage Regression: StrictMode survival, 360 turntable autoRotate, per-organ stress & problem halo rings', () => {
  // 1. Store defaults to continuous 360-degree turntable rotation (`twinAutoRotate === true`)
  const wb = useWorkbenchStore.getState();
  wb.resetWorkbench();
  assert.equal(useWorkbenchStore.getState().twinAutoRotate, true);
  wb.toggleTwinAutoRotate();
  assert.equal(useWorkbenchStore.getState().twinAutoRotate, false);
  wb.setTwinAutoRotate(true);
  assert.equal(useWorkbenchStore.getState().twinAutoRotate, true);

  // 2. Twin silhouette carries `aRegionStress` and clamps unobserved regions to 0 stress (Issue #11)
  const twin = buildProceduralTwinGeometry(16);
  const stressAttr = twin.geometry.getAttribute('aRegionStress') as THREE.BufferAttribute;
  assert.ok(stressAttr, 'Procedural twin must include per-vertex aRegionStress attribute');
  assert.equal(stressAttr.count, twin.vertexCount);

  updateTwinRegionObservation(
    twin.geometry,
    {
      InternalJugularVein: true,
      HeartCardioAutonomic: false,
    },
    {
      InternalJugularVein: 0.42,
      HeartCardioAutonomic: 0.85,
    },
  );

  let sawJugularStress = false;
  let sawUnobservedZero = false;
  const regAttr = twin.geometry.getAttribute('aRegionIndex') as THREE.BufferAttribute;
  for (let i = 0; i < stressAttr.count; i += 1) {
    const rIdx = regAttr.getX(i);
    if (rIdx === 1 && Math.abs(stressAttr.getX(i) - 0.42) < 1e-4) {
      sawJugularStress = true;
    }
    if (rIdx === 2) {
      assert.equal(stressAttr.getX(i), 0, 'Unobserved region must never show active stress color');
      sawUnobservedZero = true;
    }
  }
  assert.equal(sawJugularStress, true);
  assert.equal(sawUnobservedZero, true);
  twin.geometry.dispose();

  // 3. Internal organ core carries per-organ `aLocalLoad` & `aObserved`
  const organGeom = buildInternalOrganCoreGeometry();
  updateOrganCoreRegionLoads(organGeom, {
    InternalJugularVein: { localIntensity: 0.40, observed: true },
    HeartCardioAutonomic: { localIntensity: 0.12, observed: false },
    EyeOcularSans: { localIntensity: 0.30, observed: true },
    SoleusCalcaneus: { localIntensity: 0.18, observed: true },
    BrainVestibularCns: { localIntensity: 0.25, observed: true },
  });
  const organLoadAttr = organGeom.getAttribute('aLocalLoad') as THREE.BufferAttribute;
  const organObsAttr = organGeom.getAttribute('aObserved') as THREE.BufferAttribute;
  const organRegAttr = organGeom.getAttribute('aRegionIndex') as THREE.BufferAttribute;
  let checkedIjvOrgan = false;
  let checkedHeartUnobs = false;
  for (let i = 0; i < organRegAttr.count; i += 1) {
    if (organRegAttr.getX(i) === 1) {
      assert.ok(Math.abs(organLoadAttr.getX(i) - 0.40) < 1e-4);
      assert.equal(organObsAttr.getX(i), 1);
      checkedIjvOrgan = true;
    }
    if (organRegAttr.getX(i) === 2) {
      assert.equal(organObsAttr.getX(i), 0);
      checkedHeartUnobs = true;
    }
  }
  assert.equal(checkedIjvOrgan, true);
  assert.equal(checkedHeartUnobs, true);
  organGeom.dispose();

  // 4. Problem Halo Rings InstancedMesh scales up on stressed (>= 0.20) or selected organs & obeys Issue #11
  const halos = createUberonHaloRingsInstancedMesh();
  updateUberonHaloRingsInstancedMesh(
    halos,
    {
      InternalJugularVein: {
        region: 'InternalJugularVein',
        key: 'jugular',
        uberonCurie: 'UBERON:0001586',
        label: 'Internal Jugular Vein',
        worldPosition: [-0.058, 1.295, 0.068],
        localIntensity: 0.40,
        propagatedIntensity: 0.12,
        totalIntensity: 0.52,
        color: '#fb923c',
        observed: true,
        epistemicMode: 'MEASURED',
      },
      HeartCardioAutonomic: {
        region: 'HeartCardioAutonomic',
        key: 'thoracic',
        uberonCurie: 'UBERON:0000948',
        label: 'Heart',
        worldPosition: [0.018, 0.875, 0.095],
        localIntensity: 0.05,
        propagatedIntensity: 0.0,
        totalIntensity: 0.05,
        color: '#22d3ee',
        observed: false,
        epistemicMode: 'UNOBSERVED_NO_RR',
      },
    },
    null,
    1.0,
  );
  const haloHighlight = halos.geometry.getAttribute('aHighlight') as THREE.InstancedBufferAttribute;
  const haloColor = halos.geometry.getAttribute('aNodeColor') as THREE.InstancedBufferAttribute;
  assert.equal(haloHighlight.getX(1), 1.0, 'Stressed IJV halo ring must highlight prominently');
  // Unobserved Heart (index 2) must clamp to #6b7280 slate, NEVER #22d3ee cyan
  const unobsHeartColor = new THREE.Color(haloColor.getX(2), haloColor.getY(2), haloColor.getZ(2));
  assert.equal(`#${unobsHeartColor.getHexString()}`, '#6b7280');
  deepDisposeObject(halos);

  // 5. Structural guard: BiodigitalTwinStage is StrictMode-safe (no rootGroupRef detachment, no primary <View> trap)
  const stageSrc = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/stage3d/BiodigitalTwinStage.tsx'), 'utf-8');
  assert.doesNotMatch(stageSrc, /<View\b/, 'Primary BiodigitalTwinStage must render directly in primary scene');
  assert.match(stageSrc, /hostGroup\.add\(res\.imperativeGroup\)/);
  assert.match(stageSrc, /deepDisposeObject\(res\.imperativeGroup,\s*gl\)/);

  const camSrc = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/stage3d/UnifiedCameraController.tsx'), 'utf-8');
  assert.match(camSrc, /autoRotate=\{autoRotateActive\}/);
});
