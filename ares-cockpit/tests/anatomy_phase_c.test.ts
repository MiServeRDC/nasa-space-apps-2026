import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import * as THREE from 'three';
import {
  FEMALE_HRA_V110_MISSING_OVERLAYS,
  findMissingOverlayForStructure,
  resolveMissingStructureMeta,
  selectActiveMissingOverlays,
} from '../src/anatomy/missingOverlays.ts';
import { pickSemantic } from '../src/anatomy/semanticGeometry.ts';
import {
  REQUIRED_DENVER_TARGETS,
  buildDenverLowerLimbChunks,
  validateDenverRegistration,
} from '../scripts/buildDenverLowerLimb.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function makeBinaryStlTetrahedron(offset: readonly [number, number, number], sizeMm: number): Buffer {
  const [ox, oy, oz] = offset;
  const v0 = [ox, oy, oz] as const;
  const v1 = [ox + sizeMm, oy, oz] as const;
  const v2 = [ox, oy + sizeMm, oz] as const;
  const v3 = [ox, oy, oz + sizeMm] as const;

  const faces: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]> = [
    [v0, v2, v1],
    [v0, v1, v3],
    [v0, v3, v2],
    [v1, v2, v3],
  ];

  const buffer = Buffer.alloc(84 + faces.length * 50);
  buffer.write('ARES synthetic Denver VHF test STL', 0, 'ascii');
  buffer.writeUInt32LE(faces.length, 80);

  faces.forEach(([a, b, c], index) => {
    const base = 84 + index * 50;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;

    const floats = [
      nx / len, ny / len, nz / len,
      a[0], a[1], a[2],
      b[0], b[1], b[2],
      c[0], c[1], c[2],
    ];
    floats.forEach((value, fIndex) => {
      buffer.writeFloatLE(value, base + fIndex * 4);
    });
    buffer.writeUInt16LE(0, base + 48);
  });

  return buffer;
}

function makeDenverRegistrationSpec() {
  const rawPointsMm: ReadonlyArray<readonly [number, number, number]> = [
    [-100, 0, 0],
    [120, 0, 0],
    [0, 140, 0],
    [0, 0, 160],
    [110, 210, -180],
    [-130, 190, 240],
    [90, -150, 310],
  ];
  const transformMmToHraMetres = (p: readonly [number, number, number]): [number, number, number] => [
    p[0] / 1000 + 0.01,
    p[1] / 1000 - 0.55,
    p[2] / 1000 - 0.06,
  ];
  const pairs = rawPointsMm.map((point, index) => ({
    id: `denver-lm-${index}`,
    source: {
      point: [...point],
      landmark: `VHF-LOWER-LIMB-${index}`,
      laterality: index % 2 === 0 ? 'LEFT' : 'RIGHT',
      nodeId: `denver-src-${index}`,
    },
    target: {
      point: transformMmToHraMetres(point),
      landmark: `VHF-LOWER-LIMB-${index}`,
      laterality: index % 2 === 0 ? 'LEFT' : 'RIGHT',
      nodeId: `hra-tgt-${index}`,
    },
  }));

  return {
    schemaVersion: 1,
    author: 'Phase C verification fixture (synthetic Denver registration)',
    correspondenceEvidence: 'Synthetic test fixture validating >= 4 fit and >= 3 check invariants',
    source: {
      sha256: 'a'.repeat(64),
      units: 'mm',
      axes: 'GLTF_Y_UP_RIGHT_HANDED',
      frameId: 'denver-vhf-stl-raw',
    },
    target: {
      sha256: 'b'.repeat(64),
      units: 'm',
      axes: 'GLTF_Y_UP_RIGHT_HANDED',
      frameId: 'hra-female-v1.10',
    },
    fit: pairs.slice(0, 4),
    check: pairs.slice(4),
  };
}

test('Phase C: honest translucent missing-structure overlays isolate unresolved female targets with zero male substitution', async () => {
  const maleCatalog = JSON.parse(await readFile(join(appRoot, 'public/anatomy/reference-catalog.json'), 'utf8'));
  const femaleCatalog = JSON.parse(await readFile(join(appRoot, 'public/anatomy/female-hra/catalog.json'), 'utf8'));

  assert.deepEqual(
    selectActiveMissingOverlays({
      model: maleCatalog.model,
      systemId: 'nervous',
      selectedId: null,
      showMissingOverlays: true,
      isolateMissingMode: true,
    }),
    [],
    'Male model must never receive female missingness overlays',
  );

  assert.deepEqual(
    selectActiveMissingOverlays({
      model: femaleCatalog.model,
      systemId: 'pelvis-v15',
      selectedId: null,
      showMissingOverlays: true,
      isolateMissingMode: true,
    }),
    [],
    'Separate unregistered v1.5 pelvis supplement must never mix with v1.10 overlays',
  );

  const missingStructures = femaleCatalog.model.structures.filter((s: { coverage: string }) => s.coverage === 'MISSING');
  assert.equal(missingStructures.length, 6);

  const canonicalKeys = missingStructures.map((s: Parameters<typeof resolveMissingStructureMeta>[0]) => resolveMissingStructureMeta(s).canonicalKey);
  assert.deepEqual(
    new Set(canonicalKeys),
    new Set(['internal_jugular', 'vagus', 'vestibular', 'optic_sheath', 'soleus', 'calcaneus']),
  );

  const skeletalOverlays = selectActiveMissingOverlays({
    model: femaleCatalog.model,
    systemId: 'skeletal',
    selectedId: null,
    showMissingOverlays: true,
    isolateMissingMode: false,
  });
  assert.equal(skeletalOverlays.length, 6);
  assert.ok(skeletalOverlays.every((overlay) => overlay.referenceFrameId === 'hra-female-v1.10'));

  const cardioOverlays = selectActiveMissingOverlays({
    model: femaleCatalog.model,
    systemId: 'cardiovascular',
    selectedId: null,
    showMissingOverlays: true,
    isolateMissingMode: false,
  });
  assert.deepEqual(
    cardioOverlays.map((o) => o.canonicalKey),
    ['internal_jugular', 'vagus', 'vestibular', 'optic_sheath'],
  );

  const hiddenUnlessSelected = selectActiveMissingOverlays({
    model: femaleCatalog.model,
    systemId: 'cardiovascular',
    selectedId: 'female-missing:optic-sheath',
    showMissingOverlays: false,
    isolateMissingMode: false,
  });
  assert.equal(hiddenUnlessSelected.length, 4);
  assert.ok(findMissingOverlayForStructure('female-missing:ijv')?.searchAliases.includes('ijv'));
  assert.equal(FEMALE_HRA_V110_MISSING_OVERLAYS.every((o) => o.boxes.length === 2), true);
});

test('Phase C: Denver bilateral soleus & calcaneus STL converter enforces landmarks, hashes, budgets, and AnatomyModelSession ray picking', async () => {
  const validSpec = makeDenverRegistrationSpec();
  const report = validateDenverRegistration(validSpec);
  assert.ok(Math.abs(report.scaleInMetres - 1) < 1e-12);
  assert.ok(Math.abs(report.sourceRawToTargetMetresColumnMajor[0] - 0.001) < 1e-12);
  assert.ok(report.rotationDeterminant > 0.999999);

  assert.throws(
    () => validateDenverRegistration({ ...validSpec, fit: validSpec.fit.slice(0, 3) }),
    /four 3D fit landmarks and three independent check landmarks/,
  );
  assert.throws(
    () => validateDenverRegistration({ ...validSpec, check: validSpec.check.slice(0, 2) }),
    /four 3D fit landmarks and three independent check landmarks/,
  );
  assert.throws(
    () => validateDenverRegistration({ ...report, landmarks: { fit: report.landmarks.fit.slice(0, 3), check: report.landmarks.check } }),
    />= 4 fit and >= 3 check landmarks/,
  );
  assert.throws(
    () => validateDenverRegistration({ ...report, rotationDeterminant: -1 }),
    /determinant/,
  );

  const offsetsMm: Record<string, readonly [number, number, number]> = {
    soleus_L: [90, -100, -10],
    soleus_R: [-150, -100, -10],
    calcaneus_L: [90, -240, 0],
    calcaneus_R: [-150, -240, 0],
  };

  const entries = REQUIRED_DENVER_TARGETS.map((target) => {
    const stlBytes = makeBinaryStlTetrahedron(offsetsMm[target.key], 45);
    return {
      key: target.key,
      bytes: stlBytes,
      expectedSha256: sha256(stlBytes),
    };
  });

  await assert.rejects(
    () => buildDenverLowerLimbChunks({
      entries: [{ ...entries[0], expectedSha256: '0'.repeat(64) }, ...entries.slice(1)],
      registration: validSpec,
    }),
    /SHA-256 mismatch/,
  );

  await assert.rejects(
    () => buildDenverLowerLimbChunks({
      entries: entries.slice(0, 3),
      registration: validSpec,
    }),
    /Missing required bilateral Denver target/,
  );

  const built = await buildDenverLowerLimbChunks({ entries, registration: validSpec });
  assert.equal(built.status, 'COMPUTED_UNREVIEWED');
  assert.equal(built.anatomicallyReviewed, false);
  assert.equal(built.artifacts.length, 2);

  const vite = await createServer({
    root: appRoot,
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const { AnatomyModelSession } = await vite.ssrLoadModule('/src/anatomy/modelSession.ts');
    const chunksByPath = new Map<string, Uint8Array>();
    const chunks = built.artifacts.map((artifact) => {
      const path = `/anatomy/denver/${artifact.file}`;
      chunksByPath.set(path, artifact.glbBytes);
      return {
        path,
        sha256: artifact.sha256,
        layer: artifact.layer,
        lod: 0,
        referenceFrameId: artifact.referenceFrameId,
        sourceNodes: artifact.sourceNodes.map((n) => ({
          nodeIndex: n.nodeIndex,
          nodeName: n.nodeName,
          structureId: n.structureId,
        })),
      };
    });

    const allIds = new Set(chunks.flatMap((c) => c.sourceNodes.map((n) => n.structureId)));
    const fetcher = async (url: string) => {
      const data = chunksByPath.get(url);
      if (!data) return new Response(null, { status: 404 });
      return new Response(data);
    };

    const session = new AnatomyModelSession(undefined, undefined, fetcher);
    try {
      await session.load(chunks, allIds, allIds);
      assert.equal(session.issues.length, 0);
      assert.equal(session.loadedIds.size, 4);
      assert.equal(session.batches.length, 2);
      assert.ok(session.stats.decodedGeometryBytes > 0 && session.stats.decodedGeometryBytes < 64_000_000);

      const expectedShas = new Set(chunks.map((c) => c.sha256));
      for (const batch of session.batches) {
        const g = batch.mesh.geometry;
        const pos = g.getAttribute('position');
        const idx = g.getIndex();
        assert.ok(idx);
        const [a, b, c] = [0, 1, 2].map((i) => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i)));
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        const hit = pickSemantic(
          session.batches,
          new THREE.Raycaster(center.clone().addScaledVector(normal, 0.0001), normal.clone().negate()),
        );
        assert.ok(hit, 'Expected semantic ray hit on Denver GLB batch');
        assert.ok(hit.structureId.startsWith('denver-vhf:'));
        assert.ok(expectedShas.has(hit.assetSha256));
      }
    } finally {
      session.close();
      assert.equal(session.stats.geometries, 0);
    }
  } finally {
    await vite.close();
  }
});
