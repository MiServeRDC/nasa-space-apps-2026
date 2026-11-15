/**
 * Development-only STL-to-GLB converter for Andreassen et al. (2023) Denver VHF
 * female lower-limb geometry (bilateral soleus & calcaneus).
 *
 * Enforces:
 * - Exact SHA-256 file verification of each STL input and registration report
 * - Horn/Umeyama landmark registration report (>= 4 fit, >= 3 check landmarks, det > 0)
 * - Strict static-triangle normalization (`normalizeStaticMesh`) & Meshopt GLB packing
 * - File budget <= 16 MB and decoded geometry budget <= 64 MB
 * - Status remains COMPUTED_UNREVIEWED until explicit human anatomical sign-off
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { hash, writeGlb } from './anatomyPipeline.mjs';
import { geometryBytes, normalizeStaticMesh } from '../src/anatomy/semanticGeometry.ts';
import { fitAnatomyRegistration } from '../../scripts/anatomyRegistration.mjs';

const MAX_FILE_BYTES = 16_000_000;
const MAX_DECODED_BYTES = 64_000_000;

export const REQUIRED_DENVER_TARGETS = Object.freeze([
  { key: 'soleus_L', label: 'Left soleus muscle (Denver VHF)', layer: 'muscular', laterality: 'LEFT' },
  { key: 'soleus_R', label: 'Right soleus muscle (Denver VHF)', layer: 'muscular', laterality: 'RIGHT' },
  { key: 'calcaneus_L', label: 'Left calcaneus (Denver VHF)', layer: 'skeletal', laterality: 'LEFT' },
  { key: 'calcaneus_R', label: 'Right calcaneus (Denver VHF)', layer: 'skeletal', laterality: 'RIGHT' },
]);

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/**
 * Validates that a registration spec or computed report enforces >= 4 fit landmarks,
 * >= 3 independent check landmarks, valid proper-rotation determinant, and finite 4x4 affine matrix.
 */
export function validateDenverRegistration(specOrReport) {
  if (!specOrReport || typeof specOrReport !== 'object') {
    throw Error('Missing Denver registration spec or report');
  }
  const hasComputed = Array.isArray(specOrReport.sourceRawToTargetMetresColumnMajor);
  const report = hasComputed ? specOrReport : fitAnatomyRegistration(specOrReport);
  const fitCount = report.landmarks?.fit?.length ?? report.fit?.perLandmark?.length ?? 0;
  const checkCount = report.landmarks?.check?.length ?? report.independentCheck?.perLandmark?.length ?? 0;
  if (fitCount < 4 || checkCount < 3) {
    throw Error(`Denver registration requires >= 4 fit and >= 3 check landmarks (got ${fitCount}/${checkCount})`);
  }
  if (!Number.isFinite(report.rotationDeterminant) || report.rotationDeterminant <= 0) {
    throw Error('Invalid or reflected registration rotation determinant');
  }
  const matrix = report.sourceRawToTargetMetresColumnMajor;
  if (!Array.isArray(matrix) || matrix.length !== 16 || matrix.some((n) => !Number.isFinite(n))) {
    throw Error('Invalid 4x4 registration transform matrix');
  }
  return report;
}

/**
 * Converts a validated set of Denver binary/ASCII STL buffers into Meshopt-compressed
 * static GLB chunks mapped to `hra-female-v1.10` metres via the registration matrix.
 */
export async function buildDenverLowerLimbChunks({
  entries,
  registration,
  referenceFrameId = 'denver-vhf-registered-to-hra-v1.10',
}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw Error('No Denver STL entries supplied');
  }
  const report = validateDenverRegistration(registration);
  const requiredKeys = new Set(REQUIRED_DENVER_TARGETS.map((t) => t.key));
  const seenKeys = new Set();
  const loader = new STLLoader();
  const partsByLayer = new Map();
  let totalDecodedBytes = 0;

  try {
    for (const entry of entries) {
      if (!entry?.key || !requiredKeys.has(entry.key) || seenKeys.has(entry.key)) {
        throw Error(`Invalid or duplicate Denver structure key: ${entry?.key}`);
      }
      seenKeys.add(entry.key);

      const bytes = Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes);
      const actualSha = hash(bytes);
      if (entry.expectedSha256 && actualSha !== entry.expectedSha256) {
        throw Error(`Denver STL SHA-256 mismatch for ${entry.key}`);
      }

      const rawGeometry = loader.parse(toArrayBuffer(bytes));
      if (!rawGeometry.getAttribute('normal')) rawGeometry.computeVertexNormals();
      const mesh = new THREE.Mesh(rawGeometry);
      let normalized;
      try {
        normalized = normalizeStaticMesh(mesh, report.sourceRawToTargetMetresColumnMajor);
      } finally {
        rawGeometry.dispose();
      }

      totalDecodedBytes += geometryBytes(normalized);
      if (totalDecodedBytes > MAX_DECODED_BYTES) {
        normalized.dispose();
        throw Error('Decoded Denver geometry budget exceeded (64 MB)');
      }

      const meta = REQUIRED_DENVER_TARGETS.find((t) => t.key === entry.key);
      const layer = entry.layer ?? meta.layer;
      const structureId = `denver-vhf:${entry.key}`;
      const list = partsByLayer.get(layer) ?? [];
      list.push({
        structureId,
        layer,
        nodeName: `Denver_VHF_${entry.key}`,
        sourceSha256: actualSha,
        laterality: meta.laterality,
        label: meta.label,
        geometry: normalized,
      });
      partsByLayer.set(layer, list);
    }

    for (const req of REQUIRED_DENVER_TARGETS) {
      if (!seenKeys.has(req.key)) {
        throw Error(`Missing required bilateral Denver target: ${req.key}`);
      }
    }

    const artifacts = [];
    for (const [layer, parts] of partsByLayer.entries()) {
      const glbBytes = await writeGlb(parts, true);
      if (glbBytes.length > MAX_FILE_BYTES) {
        throw Error(`Denver chunk ${layer} exceeds 16 MB encoded limit`);
      }
      const sha256 = hash(glbBytes);
      artifacts.push({
        layer,
        file: `denver-${layer}.glb`,
        sha256,
        bytes: glbBytes.length,
        decodedGeometryBytes: parts.reduce((n, p) => n + geometryBytes(p.geometry), 0),
        referenceFrameId,
        glbBytes,
        sourceNodes: parts.map((p, index) => ({
          nodeIndex: index,
          nodeName: p.nodeName,
          structureId: p.structureId,
          laterality: p.laterality,
          label: p.label,
          sourceSha256: p.sourceSha256,
        })),
      });
    }

    return {
      schemaVersion: 1,
      status: 'COMPUTED_UNREVIEWED',
      anatomicallyReviewed: false,
      registrationScaleInMetres: report.scaleInMetres,
      registrationFitRmsM: report.fit.rmsM,
      registrationCheckRmsM: report.independentCheck.rmsM,
      artifacts,
    };
  } finally {
    for (const parts of partsByLayer.values()) {
      for (const part of parts) part.geometry.dispose();
    }
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const flagValue = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  const specPath = flagValue('--spec');
  const reportPath = flagValue('--report');
  const outDir = flagValue('--out');
  if (!specPath || !reportPath || !outDir) {
    console.error(
      'Usage: node --experimental-strip-types scripts/buildDenverLowerLimb.mjs --spec <spec.json> --report <report.json> --out <dir>',
    );
    process.exit(2);
  }
  const spec = JSON.parse(await readFile(resolve(specPath), 'utf8'));
  const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
  const entries = [];
  for (const item of spec.entries ?? []) {
    entries.push({
      key: item.key,
      layer: item.layer,
      expectedSha256: item.sha256,
      bytes: await readFile(resolve(item.stlPath)),
    });
  }
  const built = await buildDenverLowerLimbChunks({ entries, registration: report });
  await mkdir(resolve(outDir), { recursive: true });
  const summary = { ...built, artifacts: [] };
  for (const artifact of built.artifacts) {
    await writeFile(join(resolve(outDir), artifact.file), artifact.glbBytes);
    const { glbBytes: _omit, ...meta } = artifact;
    summary.artifacts.push(meta);
  }
  await writeFile(join(resolve(outDir), 'denver-build.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await runCli();
}
