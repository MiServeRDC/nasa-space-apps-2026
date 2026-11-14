import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp, type CrewSex, type ScenarioState } from '../../lib/scenario';
import type { AnatomicalRegionWireId } from '../../types/telemetry';
import type { ProjectedAnatomicalNode } from './uberonSpatialMapping';

export type V3 = [number, number, number];

/** High-contrast NASA-STD-3001 OLED risk color mapping for NQS-STL robustness margin rho in (-inf, +1]. */
export function riskColor(rho: number): string {
  if (rho < 0) return '#f43f5e';
  if (rho < 0.2) return '#fb923c';
  if (rho < 0.4) return '#facc15';
  return '#22d3ee';
}

/**
 * Continuous Poiseuille/Womersley endothelial wall shear stress coloration:
 * tau_w(t) = 2 * mu * v_max(t) * sqrt(pi / CSA(t)) in dyn/cm^2 (mu = 0.035 Poise).
 * Prothrombotic stasis < 1.0 dyn/cm^2 -> crimson; transitional < 4.0 dyn/cm^2 -> orange/amber; laminar >= 4.0 -> cyan.
 */
export function tauWColor(tauW: number, rhoTauW: number): string {
  if (tauW < 1.0 || rhoTauW < -0.25) return '#f43f5e';
  if (tauW < 2.2 || rhoTauW < 0.0) return '#fb7185';
  if (tauW < 3.4 || rhoTauW < 0.22) return '#fb923c';
  if (tauW < 4.5 || rhoTauW < 0.42) return '#facc15';
  return '#22d3ee';
}

/** Smooth spline-interpolated lathe geometry for axisymmetric organic components. */
export function smoothLathe(pts: [number, number][], radialSegs = 28, steps = 32): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)));
  const sampled = curve.getPoints(steps);
  const g = new THREE.LatheGeometry(sampled, radialSegs);
  g.computeVertexNormals();
  return g;
}

export function latheFrom(pts: [number, number][], segs = 24): THREE.LatheGeometry {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), segs);
  g.computeVertexNormals();
  return g;
}

export function tubeFrom(pts: V3[], radius: number, tubularSegs = 20, radialSegs = 8): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, false);
}

/** Catmull-Rom 1D cubic interpolation helper. */
function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleSeries(values: number[], tNorm: number): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0];
  const scaled = clamp(tNorm, 0, 1) * (n - 1);
  const idx = Math.min(n - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const p0 = values[Math.max(0, idx - 1)];
  const p1 = values[idx];
  const p2 = values[Math.min(n - 1, idx + 1)];
  const p3 = values[Math.min(n - 1, idx + 2)];
  return catmullRomScalar(p0, p1, p2, p3, frac);
}

/**
 * Variable-radius 3D vascular/osteological tube along a Catmull-Rom spline.
 * Control point tuple: [x, y, z, radius]. Enables fusiform jugular stasis bulbs, tapering aortic arches, and curved shafts.
 */
export function variableTubeFrom(
  pts: [number, number, number, number][],
  tubularSegs = 28,
  radialSegs = 14,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const radii = pts.map(([, , , r]) => r);
  const frames = curve.computeFrenetFrames(tubularSegs, false);

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegs; i++) {
    const u = i / tubularSegs;
    const center = curve.getPointAt(u);
    const r = Math.max(0.0005, sampleSeries(radii, u));
    const N = frames.normals[i];
    const B = frames.binormals[i];

    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const vx = center.x + r * (cosT * N.x + sinT * B.x);
      const vy = center.y + r * (cosT * N.y + sinT * B.y);
      const vz = center.z + r * (cosT * N.z + sinT * B.z);
      positions.push(vx, vy, vz);
    }
  }

  const ringStride = radialSegs + 1;
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      // Outward normal: (d - a) x (b - a) = B_frame x T = +N
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export interface LoftSlice {
  y: number;
  rx: number;
  rzFront: number;
  rzBack: number;
  cx?: number;
  cz?: number;
  bilobeFront?: number;
  bilobeBack?: number;
}

/**
 * Parametric cross-sectional anatomical loft generator.
 * Produces smooth C-infinity anterior-posterior asymmetric human silhouettes (pectoral/bust contour,
 * spinal lordosis, scapular/gluteal relief, Q-angle thigh-knee-gastrocnemius alignment) without joint seams.
 */
export function sculptLoft(slices: LoftSlice[], radialSegs = 36, verticalSteps = 44): THREE.BufferGeometry {
  const ys = slices.map((s) => s.y);
  const rxs = slices.map((s) => s.rx);
  const rzFs = slices.map((s) => s.rzFront);
  const rzBs = slices.map((s) => s.rzBack);
  const cxs = slices.map((s) => s.cx ?? 0);
  const czs = slices.map((s) => s.cz ?? 0);
  const bf = slices.map((s) => s.bilobeFront ?? 0);
  const bb = slices.map((s) => s.bilobeBack ?? 0);

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= verticalSteps; i++) {
    const t = i / verticalSteps;
    const y = sampleSeries(ys, t);
    const rx = Math.max(0.0008, sampleSeries(rxs, t));
    const rzFront = Math.max(0.0008, sampleSeries(rzFs, t));
    const rzBack = Math.max(0.0008, sampleSeries(rzBs, t));
    const cx = sampleSeries(cxs, t);
    const cz = sampleSeries(czs, t);
    const lobeF = sampleSeries(bf, t);
    const lobeB = sampleSeries(bb, t);

    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);

      // Smooth C-infinity blend between posterior (-z, st = -1) and anterior (+z, st = +1)
      const frontWeight = 0.5 * (st + 1);
      const quadrantHarmonic = 4 * ct * ct * st * st; // zero at midline sternum/spine & lateral flanks, peak at +-45 deg
      const bilobeOffset = st >= 0 ? lobeF * quadrantHarmonic : lobeB * quadrantHarmonic;
      const rz = Math.max(0.0008, rzBack + (rzFront - rzBack) * frontWeight + bilobeOffset);

      const vx = cx + rx * ct;
      const vz = cz + rz * st;
      positions.push(vx, y, vz);
    }
  }

  const ascending = ys.length < 2 || ys[ys.length - 1] >= ys[0];
  const stride = radialSegs + 1;
  for (let i = 0; i < verticalSteps; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      // Outward normal at theta=0 (+x): when dy > 0, (b - a) x (d - a) = (+j) x (+k) = +i
      if (ascending) {
        indices.push(a, b, d);
        indices.push(b, c, d);
      } else {
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Dispose a dictionary/list of Three.js BufferGeometries on unmount or dimorphism switch. */
function disposeGeometryCollection(items: unknown[]) {
  for (const item of items) {
    if (item instanceof THREE.BufferGeometry) {
      item.dispose();
    } else if (Array.isArray(item)) {
      disposeGeometryCollection(item);
    } else if (item && typeof item === 'object') {
      disposeGeometryCollection(Object.values(item as Record<string, unknown>));
    }
  }
}

/** Shared anthropometric landmarks for Male and Female NASA-STD-3001 profiles. */
export function getAnthropometry(sex: CrewSex) {
  const isF = sex === 'FEMALE';
  return {
    isF,
    shoulderX: isF ? 0.228 : 0.278,
    pelvisW: isF ? 1.15 : 0.94,
    thoracicDepth: isF ? 0.86 : 1.04,
    thoracicWidth: isF ? 0.87 : 1.03,
    hipX: isF ? 0.126 : 0.110,
    kneeX: isF ? 0.100 : 0.106,
    ankleX: isF ? 0.098 : 0.104,
    ijvX: isF ? 0.045 : 0.050,
  };
}

/**
 * Layer 1: Anatomically sculpted Skeleton with NASA-STD-3001 sexual dimorphism:
 * - Sculpted neurocranium, zygomatic/mandibular jaw, bilateral orbital rims.
 * - 20-segment S-curved vertebral column with intervertebral discs & sacrum.
 * - 9 sculpted bilateral rib pairs, manubrium/sternum, S-curved clavicles.
 * - Android (Male) vs Gynecoid (Female) pelvic girdle with iliac wings & pubic symphysis.
 * - Anatomically angled Femur (femoral head, neck at ~126 deg, greater trochanter, curved diaphysis, condyles, patella,
 *   and Frost Mechanostat 1000 microstrain cortical strain collar), Tibia + Fibula, and trabecular Calcaneus + foot arch.
 */
export function SkeletonLayer({
  s,
  sex,
  skeletonNode,
}: {
  s: ScenarioState | null;
  sex: CrewSex;
  skeletonNode?: ProjectedAnatomicalNode;
}) {
  const boneRho = s ? s.rho.sclerostin : 0.5;
  const gaitRho = s ? Math.min(boneRho, s.rho.gai) : 0.5;
  const boneTint = skeletonNode ? skeletonNode.color : boneRho < 0.4 ? riskColor(boneRho) : undefined;
  const calcTint = skeletonNode ? skeletonNode.color : gaitRho < 0.4 ? riskColor(gaitRho) : undefined;
  const anthro = getAnthropometry(sex);
  const { isF, shoulderX, pelvisW, thoracicDepth, thoracicWidth, hipX, kneeX, ankleX } = anthro;

  const geo = useMemo(() => {
    const cranium = sculptLoft(
      [
        { y: 1.49, rx: 0.042, rzFront: 0.040, rzBack: 0.052, cz: -0.012 },
        { y: 1.54, rx: isF ? 0.068 : 0.073, rzFront: 0.066, rzBack: 0.082, cz: -0.010 },
        { y: 1.61, rx: isF ? 0.075 : 0.080, rzFront: 0.078, rzBack: 0.092, cz: -0.008 },
        { y: 1.68, rx: isF ? 0.068 : 0.072, rzFront: 0.070, rzBack: 0.080, cz: -0.008 },
        { y: 1.725, rx: 0.036, rzFront: 0.038, rzBack: 0.042, cz: -0.008 },
        { y: 1.74, rx: 0.002, rzFront: 0.002, rzBack: 0.002, cz: -0.008 },
      ],
      26,
      22,
    );

    const mandible = tubeFrom(
      [
        [-0.052, 1.52, 0.025],
        [-0.044, 1.455, 0.058],
        [0.0, 1.432, 0.086],
        [0.044, 1.455, 0.058],
        [0.052, 1.52, 0.025],
      ],
      isF ? 0.010 : 0.0125,
      18,
      8,
    );

    const ribPairs = Array.from({ length: 9 }, (_, idx) => {
      const y = 1.165 - idx * 0.042;
      const archFactor = Math.sin(((idx + 1.2) / 10.2) * Math.PI);
      const w = (0.115 + archFactor * 0.088) * thoracicWidth;
      const d = (0.082 + archFactor * 0.044) * thoracicDepth;
      const floating = idx >= 7;
      const sternalX = floating ? w * 0.52 : 0.020;
      const sternalZ = floating ? d * 0.45 : d;
      const ribR = idx === 0 ? 0.0085 : 0.0072;
      return {
        y,
        left: tubeFrom(
          [
            [-0.018, y + 0.008, -0.058],
            [-w * 0.68, y, -d * 0.55],
            [-w, y - 0.022, 0.008],
            [-w * 0.62, y - 0.042, d * 0.78],
            [-sternalX, y - 0.036, sternalZ],
          ],
          ribR,
          18,
          7,
        ),
        right: tubeFrom(
          [
            [0.018, y + 0.008, -0.058],
            [w * 0.68, y, -d * 0.55],
            [w, y - 0.022, 0.008],
            [w * 0.62, y - 0.042, d * 0.78],
            [sternalX, y - 0.036, sternalZ],
          ],
          ribR,
          18,
          7,
        ),
      };
    });

    const vertebrae = Array.from({ length: 20 }, (_, i) => {
      const t = i / 19;
      const y = 1.40 - t * 0.98;
      // Cervical lordosis -> thoracic kyphosis -> lumbar lordosis
      const z = -0.048 + Math.sin(t * Math.PI * 2.35 + 0.35) * 0.020;
      const r = 0.016 + t * 0.012;
      return { y, z, r };
    });

    const makeClavicle = (side: number) =>
      tubeFrom(
        [
          [side * 0.022, 1.185, 0.095 * thoracicDepth],
          [side * shoulderX * 0.45, 1.202, 0.072 * thoracicDepth],
          [side * (shoulderX - 0.02), 1.195, 0.012],
        ],
        0.009,
        14,
        8,
      );

    // Iliac crest + pelvic ring with Android vs Gynecoid dimorphism
    const makePelvisSide = (side: number) =>
      variableTubeFrom(
        [
          [side * 0.028, 0.43, -0.052, 0.022],
          [side * 0.125 * pelvisW, 0.505, -0.018, isF ? 0.026 : 0.024],
          [side * 0.168 * pelvisW, 0.455, 0.042, isF ? 0.025 : 0.023],
          [side * hipX, 0.365, 0.022, 0.028],
          [side * 0.075 * pelvisW, 0.325, 0.062, 0.016],
          [side * 0.014, 0.340, 0.068, 0.015],
        ],
        22,
        10,
      );

    // Anatomically sculpted Femur (femoral neck -> trochanter -> Q-angle shaft -> distal condylar flare)
    const makeFemur = (side: number) =>
      variableTubeFrom(
        [
          [side * (hipX - 0.018), 0.372, 0.008, 0.016], // femoral neck medial
          [side * (hipX + 0.018), 0.345, 0.004, 0.026], // intertrochanteric crest
          [side * (hipX * 0.72 + kneeX * 0.28), 0.21, 0.014, 0.0185], // proximal diaphysis
          [side * (hipX * 0.42 + kneeX * 0.58), 0.06, 0.018, 0.0175], // mid-distal diaphysis (anterior bow)
          [side * kneeX, -0.115, 0.012, 0.032], // femoral condyles
        ],
        24,
        12,
      );

    // Tibia & Fibula
    const makeTibia = (side: number) =>
      variableTubeFrom(
        [
          [side * (kneeX - 0.004), -0.155, 0.012, 0.030], // tibial plateau
          [side * (kneeX * 0.7 + ankleX * 0.3 - 0.004), -0.29, 0.014, 0.0165],
          [side * (ankleX - 0.005), -0.52, 0.010, 0.0145],
          [side * (ankleX - 0.006), -0.655, 0.008, 0.022], // medial malleolus / plafond
        ],
        20,
        11,
      );

    const makeFibula = (side: number) =>
      variableTubeFrom(
        [
          [side * (kneeX + 0.024), -0.175, -0.006, 0.010],
          [side * (ankleX + 0.022), -0.42, -0.008, 0.0075],
          [side * (ankleX + 0.020), -0.668, -0.006, 0.012], // lateral malleolus
        ],
        16,
        8,
      );

    // Upper limb bones (Humerus, Radius, Ulna)
    const humerus = variableTubeFrom(
      [
        [0, 0.175, 0, 0.024],
        [0, 0.09, 0.003, 0.0145],
        [0, -0.08, 0.004, 0.0135],
        [0, -0.175, 0.002, 0.023],
      ],
      18,
      10,
    );

    const radiusBone = variableTubeFrom(
      [
        [-0.008, 0.155, 0.004, 0.011],
        [-0.010, 0.0, 0.006, 0.0085],
        [-0.011, -0.155, 0.005, 0.013],
      ],
      14,
      8,
    );

    const ulnaBone = variableTubeFrom(
      [
        [0.008, 0.165, -0.004, 0.013],
        [0.008, 0.0, -0.002, 0.008],
        [0.009, -0.155, 0.0, 0.0095],
      ],
      14,
      8,
    );

    // Sculpted Calcaneus heel bone (posterior tuberosity -> subtalar body -> cuboid facet)
    const calcaneus = sculptLoft(
      [
        { y: -0.742, rx: 0.019, rzFront: 0.036, rzBack: 0.044, cz: -0.010 },
        { y: -0.722, rx: 0.024, rzFront: 0.042, rzBack: 0.052, cz: -0.012 },
        { y: -0.696, rx: 0.022, rzFront: 0.038, rzBack: 0.046, cz: -0.010 },
        { y: -0.680, rx: 0.014, rzFront: 0.024, rzBack: 0.028, cz: -0.006 },
      ],
      18,
      12,
    );

    return {
      cranium,
      mandible,
      ribPairs,
      vertebrae,
      clavicleL: makeClavicle(-1),
      clavicleR: makeClavicle(1),
      pelvisL: makePelvisSide(-1),
      pelvisR: makePelvisSide(1),
      femurL: makeFemur(-1),
      femurR: makeFemur(1),
      tibiaL: makeTibia(-1),
      tibiaR: makeTibia(1),
      fibulaL: makeFibula(-1),
      fibulaR: makeFibula(1),
      humerus,
      radiusBone,
      ulnaBone,
      calcaneus,
    };
  }, [ankleX, hipX, isF, kneeX, pelvisW, shoulderX, thoracicDepth, thoracicWidth]);

  useEffect(() => {
    return () => disposeGeometryCollection([geo]);
  }, [geo]);

  const boneMat = { color: '#dfd9cb', roughness: 0.52, metalness: 0.06 };
  const femurMat = {
    color: boneTint ?? '#dfd9cb',
    emissive: boneTint ?? '#0f172a',
    emissiveIntensity: boneTint ? 0.62 : 0.06,
    roughness: 0.46,
    metalness: 0.08,
  };
  const calcMat = {
    color: calcTint ?? '#dfd9cb',
    emissive: calcTint ?? '#0f172a',
    emissiveIntensity: calcTint ? 0.68 : 0.08,
    roughness: 0.45,
    metalness: 0.08,
  };
  const strainRingColor = riskColor(boneRho);

  return (
    <group name="skeleton-layer">
      {/* Sculpted Neurocranium, Zygoma & Mandible */}
      <mesh geometry={geo.cranium}>
        <meshStandardMaterial {...boneMat} />
      </mesh>
      <mesh geometry={geo.mandible}>
        <meshStandardMaterial {...boneMat} />
      </mesh>
      <mesh position={[0, 1.505, 0.072]} scale={[isF ? 0.78 : 0.86, 0.62, 0.68]}>
        <boxGeometry args={[0.095, 0.068, 0.052]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>

      {/* Bilateral Orbital Rims */}
      {[-0.036, 0.036].map((x) => (
        <mesh key={x} position={[x, 1.565, 0.096]} rotation={[0.06, x > 0 ? 0.12 : -0.12, 0]}>
          <torusGeometry args={[0.022, 0.0055, 10, 20]} />
          <meshStandardMaterial {...boneMat} />
        </mesh>
      ))}

      {/* Articulated S-Curved Vertebral Column + Sacrum */}
      {geo.vertebrae.map((v, i) => (
        <group key={i} position={[0, v.y, v.z]}>
          <mesh>
            <cylinderGeometry args={[v.r, v.r * 1.04, 0.034, 14]} />
            <meshStandardMaterial color="#d4cdbc" roughness={0.58} />
          </mesh>
          <mesh position={[0, 0, -v.r * 0.95]} rotation={[0.35, 0, 0]}>
            <coneGeometry args={[0.006, 0.022, 6]} />
            <meshStandardMaterial color="#c9c1ae" roughness={0.62} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.40, -0.052]} rotation={[Math.PI, 0, 0]} scale={[isF ? 1.18 : 1.0, 1, 0.55]}>
        <coneGeometry args={[0.048, 0.095, 12]} />
        <meshStandardMaterial color="#d4cdbc" roughness={0.58} />
      </mesh>

      {/* Clavicles & Sternum (Manubrium + Body) */}
      <mesh geometry={geo.clavicleL}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.clavicleR}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh position={[0, 1.155, 0.098 * thoracicDepth]} rotation={[-0.14, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.019, 0.058, 8]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>
      <mesh position={[0, 1.01, 0.106 * thoracicDepth]} rotation={[-0.06, 0, 0]}>
        <boxGeometry args={[0.030, 0.21, 0.014]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>

      {/* 9 Bilateral Rib Pairs */}
      {geo.ribPairs.map((r) => (
        <group key={r.y}>
          <mesh geometry={r.left}><meshStandardMaterial {...boneMat} /></mesh>
          <mesh geometry={r.right}><meshStandardMaterial {...boneMat} /></mesh>
        </group>
      ))}

      {/* Android vs Gynecoid Pelvic Girdle */}
      <mesh geometry={geo.pelvisL}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.pelvisR}><meshStandardMaterial {...boneMat} /></mesh>

      {/* Upper Extremities (Glenohumeral head, Humerus, Radius + Ulna, Hand carpals) */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (shoulderX - 0.012), 1.175, 0.005]}>
            <sphereGeometry args={[0.025, 14, 14]} />
            <meshStandardMaterial {...boneMat} />
          </mesh>
          <mesh
            geometry={geo.humerus}
            position={[side * (shoulderX + 0.012), 1.00, 0.004]}
            rotation={[0.03, 0, side * 0.10]}
          >
            <meshStandardMaterial {...boneMat} />
          </mesh>
          <group
            position={[side * (shoulderX + 0.048), 0.665, 0.024]}
            rotation={[-0.09, 0, side * 0.07]}
          >
            <mesh geometry={geo.radiusBone}><meshStandardMaterial {...boneMat} /></mesh>
            <mesh geometry={geo.ulnaBone}><meshStandardMaterial {...boneMat} /></mesh>
          </group>
        </group>
      ))}

      {/* Anatomically Sculpted Femora with Head, Greater Trochanter, Patella & Frost Mechanostat Collar */}
      {([-1, 1] as const).map((side) => {
        const femurGeo = side < 0 ? geo.femurL : geo.femurR;
        const midFemurX = side * (hipX * 0.56 + kneeX * 0.44);
        return (
          <group key={side}>
            {/* Spherical Femoral Head in Acetabulum */}
            <mesh position={[side * (hipX - 0.022), 0.376, 0.010]}>
              <sphereGeometry args={[0.023, 16, 16]} />
              <meshStandardMaterial {...femurMat} />
            </mesh>
            {/* Greater Trochanter */}
            <mesh position={[side * (hipX + 0.022), 0.352, 0.002]} scale={[0.85, 1.15, 0.9]}>
              <sphereGeometry args={[0.020, 12, 12]} />
              <meshStandardMaterial {...femurMat} />
            </mesh>
            {/* Curved Femoral Shaft & Condyles */}
            <mesh geometry={femurGeo}>
              <meshStandardMaterial {...femurMat} />
            </mesh>
            {/* Frost Mechanostat (1000 microstrain) Mid-Diaphyseal Sensor Ring */}
            <mesh position={[midFemurX, 0.135, 0.016]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.024, 0.0032, 10, 24]} />
              <meshStandardMaterial
                color={strainRingColor}
                emissive={strainRingColor}
                emissiveIntensity={boneRho < 0.4 ? 1.8 : 0.75}
                roughness={0.25}
              />
            </mesh>
            {/* Patella (Sesamoid Knee Cap) */}
            <mesh position={[side * kneeX, -0.132, 0.042]} scale={[0.95, 1.05, 0.52]}>
              <sphereGeometry args={[0.020, 12, 12]} />
              <meshStandardMaterial {...boneMat} />
            </mesh>
          </group>
        );
      })}

      {/* Tibia & Fibula */}
      <mesh geometry={geo.tibiaL}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.tibiaR}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.fibulaL}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.fibulaR}><meshStandardMaterial {...boneMat} /></mesh>

      {/* Calcaneus (Trabecular BMD + Cortical Shell), Talus & Metatarsal Arch */}
      {([-1, 1] as const).map((side) => {
        const x = side * ankleX;
        return (
          <group key={side}>
            {/* Talus Dome */}
            <mesh position={[x, -0.678, 0.008]} scale={[1.0, 0.72, 1.18]}>
              <sphereGeometry args={[0.022, 12, 12]} />
              <meshStandardMaterial {...calcMat} />
            </mesh>
            {/* Calcaneus Translucent Cortical Shell + Trabecular BMD Wireframe Lattice */}
            <group position={[x, 0, 0]}>
              <mesh geometry={geo.calcaneus}>
                <meshStandardMaterial
                  {...calcMat}
                  transparent
                  opacity={Math.max(0.55, 0.92 - (s?.bmdLossPct ?? 0) * 0.012)}
                />
              </mesh>
              <mesh geometry={geo.calcaneus} scale={[0.92, 0.96, 0.92]}>
                <meshBasicMaterial
                  color={strainRingColor}
                  wireframe
                  transparent
                  opacity={gaitRho < 0.4 ? 0.65 : 0.28}
                />
              </mesh>
            </group>
            {/* Tarsal-Metatarsal Forefoot Arch */}
            {[ -0.016, -0.005, 0.006, 0.016 ].map((dx, mIdx) => (
              <mesh
                key={mIdx}
                position={[x + dx, -0.724, 0.062]}
                rotation={[Math.PI / 2 + 0.14, 0, 0]}
              >
                <cylinderGeometry args={[0.0045, 0.0055, 0.082, 8]} />
                <meshStandardMaterial {...boneMat} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Layer 2: Vascular, Neuro-Ocular & Cardiac Layer.
 * Features:
 * - Volumetric Brain with Frontal, Parietal, Temporal, Occipital lobes, Cerebellum, Brainstem,
 *   and internal C-shaped Lateral, Third, and Fourth Cerebral Ventricles.
 * - Eyeballs (sclera, cornea, iris, pupil, lamina cribrosa) with retrobulbar ONSD and coaxial
 *   Two-Stage Bayesian POCUS Uncertainty Halo (95% CI scaling with s.onsdSigmaMm).
 * - Beating 4-chamber Heart with Ascending Aorta, Curved Aortic Arch, 3 Supra-Aortic Trunks, SVC/IVC.
 * - Anatomically Asymmetric Right vs Left Internal Jugular Veins (IJV) with Left J2 Stasis Bulb
 *   and continuous Poiseuille/Womersley wall shear stress (tau_w) coloration.
 */
export function VascularNeuroLayer({
  s,
  sex = 'MALE',
  nodesByRegion,
}: {
  s: ScenarioState | null;
  sex?: CrewSex;
  nodesByRegion?: Record<AnatomicalRegionWireId, ProjectedAnatomicalNode>;
}) {
  const anthro = getAnthropometry(sex);
  const ijvNode = nodesByRegion?.InternalJugularVein;
  const sansNode = nodesByRegion?.EyeOcularSans;
  const heartNode = nodesByRegion?.HeartCardioAutonomic;
  const cnsNode = nodesByRegion?.BrainVestibularCns;

  const ijvColor = ijvNode ? ijvNode.color : s ? tauWColor(s.tauW, s.rho.tau_w) : '#22d3ee';
  const onsdRisk = s ? Math.min(s.rho.onsd, s.rho.ppco2) : 0.5;
  const onsdColor = sansNode ? sansNode.color : riskColor(onsdRisk);
  const brainRiskColor = cnsNode ? (cnsNode.observed && cnsNode.localIntensity >= 0.25 ? cnsNode.color : '#38bdf8') : riskColor(onsdRisk);

  // Retrobulbar ONSD scaling: nominal ~4.8 mm -> critical >5.8 mm
  const onsdScale = s ? clamp(1.0 + (s.onsdMm - 4.8) * 0.42, 0.86, 2.15) : 1.0;
  // Two-Stage Bayesian POCUS 95% credible halo: contracts on fresh scan (daysSinceScan=0), expands linearly between scans
  const bayesianHaloScale = onsdScale + (s ? clamp(1.96 * s.onsdSigmaMm * 1.85, 0.14, 1.35) : 0.35);

  // Dynamic IJV cross-sectional distension: CSA = pi * r^2 -> radial scale proportional to sqrt(CSA / CSA_0)
  const baseCsa = sex === 'FEMALE' ? 0.62 : 0.75;
  const ijvRadialScale = s ? clamp(Math.sqrt(s.csa / baseCsa), 0.75, 2.35) : 1.0;
  // Left IJV exhibits higher microgravity stasis bulb susceptibility (Marshall-Goebel et al. 2019)
  const leftIjvBulbBoost = s ? 1.0 + clamp((s.csa - 1.1) * 0.16, 0, 0.42) : 1.0;

  const heartGroupRef = useRef<THREE.Group>(null);
  const haloLeftRef = useRef<THREE.Mesh>(null);
  const haloRightRef = useRef<THREE.Mesh>(null);
  const ijvLeftRef = useRef<THREE.Mesh>(null);
  const ijvRightRef = useRef<THREE.Mesh>(null);

  const geo = useMemo(() => {
    const { ijvX, hipX, kneeX } = anthro;

    // Sculpted Left/Right Cerebral Hemispheres (Frontal -> Parietal -> Occipital pole)
    const hemisphere = sculptLoft(
      [
        { y: -0.042, rx: 0.026, rzFront: 0.056, rzBack: 0.062, cz: -0.004 },
        { y: -0.012, rx: 0.036, rzFront: 0.072, rzBack: 0.078, cz: 0.0 },
        { y: 0.022, rx: 0.035, rzFront: 0.068, rzBack: 0.074, cz: -0.002 },
        { y: 0.050, rx: 0.024, rzFront: 0.050, rzBack: 0.054, cz: -0.004 },
        { y: 0.064, rx: 0.004, rzFront: 0.010, rzBack: 0.012, cz: -0.004 },
      ],
      22,
      18,
    );

    // Temporal Lobe (inferolateral pole projecting anteriorly below Sylvian fissure)
    const temporalLobe = variableTubeFrom(
      [
        [0.0, -0.028, -0.036, 0.016],
        [0.006, -0.038, -0.002, 0.020],
        [0.002, -0.042, 0.034, 0.015],
      ],
      14,
      10,
    );

    // C-shaped Lateral Ventricle (Frontal horn -> Body -> Atrium -> Occipital & Temporal horns)
    const makeLateralVentricle = (side: number) =>
      variableTubeFrom(
        [
          [side * 0.012, 0.002, 0.032, 0.0052],  // Anterior frontal horn
          [side * 0.016, 0.018, 0.006, 0.0060],  // Central body
          [side * 0.022, 0.006, -0.024, 0.0072], // Atrium / trigone
          [side * 0.015, -0.004, -0.046, 0.0042], // Posterior occipital horn
        ],
        18,
        9,
      );

    const makeTemporalHorn = (side: number) =>
      variableTubeFrom(
        [
          [side * 0.022, 0.004, -0.022, 0.0055],
          [side * 0.026, -0.020, -0.006, 0.0048],
          [side * 0.022, -0.030, 0.018, 0.0038],
        ],
        12,
        8,
      );

    // Curved Aortic Arch + Ascending + Descending Thoracic/Abdominal Aorta
    const aorta = variableTubeFrom(
      [
        [0.012, 1.015, 0.046, 0.0175],  // Aortic root / sinus of Valsalva
        [0.004, 1.095, 0.042, 0.0165],  // Ascending aorta
        [-0.006, 1.142, 0.016, 0.0155], // Aortic arch apex
        [0.014, 1.115, -0.024, 0.0145], // Aortic isthmus
        [0.012, 0.92, -0.028, 0.0130],  // Descending thoracic aorta
        [0.004, 0.54, -0.018, 0.0112],  // Abdominal aorta -> bifurcation
      ],
      32,
      12,
    );

    // Three Supra-Aortic Arch Branches:
    // 1. Brachiocephalic Trunk (to subject's Right, x < 0) -> Right Common Carotid & Right Subclavian
    const brachiocephalicArt = variableTubeFrom(
      [
        [-0.002, 1.138, 0.024, 0.0075],
        [-0.024, 1.195, 0.022, 0.0062],
        [-0.034, 1.38, 0.022, 0.0045], // Right common carotid
      ],
      16,
      8,
    );
    // 2. Left Common Carotid Artery (x > 0)
    const leftCarotidArt = variableTubeFrom(
      [
        [0.006, 1.140, 0.012, 0.0055],
        [0.026, 1.24, 0.020, 0.0048],
        [0.034, 1.44, 0.020, 0.0042],
      ],
      16,
      8,
    );
    // 3. Left Subclavian Artery (x > 0 lateral)
    const leftSubclavianArt = variableTubeFrom(
      [
        [0.012, 1.132, -0.004, 0.0055],
        [0.046, 1.185, 0.006, 0.0048],
        [0.115, 1.165, 0.008, 0.0042],
      ],
      14,
      8,
    );

    // Iliac & Femoral Arteries
    const makeIliacFemoralArt = (side: number) =>
      variableTubeFrom(
        [
          [0.004, 0.54, -0.018, 0.0085],
          [side * (hipX * 0.72), 0.38, 0.006, 0.0072],
          [side * (hipX * 0.55 + kneeX * 0.45), 0.08, 0.022, 0.0058],
          [side * kneeX, -0.14, 0.006, 0.0048],
        ],
        18,
        8,
      );

    // Superior & Inferior Vena Cava + Brachiocephalic Venous Confluence (subject's Right = x < 0)
    const venaCava = variableTubeFrom(
      [
        [0.0, 0.50, -0.008, 0.011],
        [-0.016, 0.76, 0.012, 0.0125],
        [-0.022, 0.98, 0.036, 0.014],  // IVC into Right Atrium
        [-0.024, 1.06, 0.040, 0.0135], // SVC
        [-0.026, 1.155, 0.042, 0.0125],
      ],
      22,
      10,
    );

    // Oblique Left Brachiocephalic Vein crossing anterior to aortic arch -> SVC
    const leftBrachiocephalicVein = variableTubeFrom(
      [
        [ijvX - 0.006, 1.165, 0.048, 0.0088],
        [0.008, 1.158, 0.048, 0.0092],
        [-0.025, 1.150, 0.043, 0.0102],
      ],
      14,
      9,
    );

    const rightBrachiocephalicVein = variableTubeFrom(
      [
        [-(ijvX - 0.004), 1.170, 0.046, 0.0102],
        [-0.026, 1.150, 0.043, 0.0112],
      ],
      10,
      9,
    );

    // Local-origin Asymmetric Internal Jugular Veins (scaled radially in real time without geometry rebuilds!):
    // Subject's Right IJV (x = -ijvX): larger physiological baseline caliber, straighter cylindrical lumen
    const rightIjvLocal = variableTubeFrom(
      [
        [-0.003, 0.185, -0.018, 0.0096], // Jugular foramen / superior bulb
        [0.000, 0.015, 0.002, 0.0108],   // Mid-cervical J2
        [0.004, -0.155, 0.006, 0.0112],  // Inferior venous angle
      ],
      20,
      14,
    );

    // Subject's Left IJV (x = +ijvX): narrower ostium with fusiform J2 stasis bulb
    const leftIjvLocal = variableTubeFrom(
      [
        [0.003, 0.185, -0.018, 0.0080], // Superior jugular bulb
        [0.001, 0.065, -0.004, 0.0088],
        [0.000, 0.000, 0.004, 0.0106],  // Fusiform J2 stasis zone (POCUS site)
        [-0.003, -0.085, 0.006, 0.0086],
        [-0.006, -0.155, 0.006, 0.0082], // Oblique junction to left brachiocephalic vein
      ],
      22,
      14,
    );

    // Myocardial Ventricular Mass (oblique conical loft)
    const myocardium = sculptLoft(
      [
        { y: -0.056, rx: 0.008, rzFront: 0.009, rzBack: 0.008, cx: 0.018, cz: 0.016 }, // Cardiac apex
        { y: -0.025, rx: 0.032, rzFront: 0.030, rzBack: 0.026, cx: 0.010, cz: 0.008 },
        { y: 0.012, rx: 0.042, rzFront: 0.036, rzBack: 0.032, cx: 0.002, cz: 0.002 },
        { y: 0.042, rx: 0.036, rzFront: 0.030, rzBack: 0.028, cx: -0.004, cz: -0.004 }, // Atrioventricular base
        { y: 0.055, rx: 0.014, rzFront: 0.014, rzBack: 0.014, cx: -0.006, cz: -0.006 },
      ],
      22,
      16,
    );

    return {
      hemisphere,
      temporalLobe,
      latVentL: makeLateralVentricle(1),
      latVentR: makeLateralVentricle(-1),
      tempHornL: makeTemporalHorn(1),
      tempHornR: makeTemporalHorn(-1),
      aorta,
      brachiocephalicArt,
      leftCarotidArt,
      leftSubclavianArt,
      iliacArtL: makeIliacFemoralArt(-1),
      iliacArtR: makeIliacFemoralArt(1),
      venaCava,
      leftBrachiocephalicVein,
      rightBrachiocephalicVein,
      rightIjvLocal,
      leftIjvLocal,
      myocardium,
    };
  }, [anthro]);

  useEffect(() => {
    return () => disposeGeometryCollection([geo]);
  }, [geo]);

  // Real-time physiological animation: cardiac systolic beat, Womersley jugular pulsatility, and Bayesian halo breathing
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const omegaHr = 2 * Math.PI * (((s?.hrAccepted ? s.hr : 68) ?? 68) / 60);

    // 1. Myocardial systolic-diastolic contraction
    if (heartGroupRef.current) {
      const systole = Math.pow(0.5 * (1 + Math.sin(omegaHr * t)), 3);
      const beat = 1.0 - 0.055 * systole;
      heartGroupRef.current.scale.set(beat, 1.0 + 0.03 * systole, beat);
    }

    // 2. Womersley pulsatility in Asymmetric IJVs (dampened in deep stasis, brisk in laminar flow)
    const womersleyAmp = (s?.tauW ?? 4.5) < 1.2 ? 0.025 : 0.065;
    const venousPulse = 1.0 + womersleyAmp * Math.sin(omegaHr * t - 0.7);
    if (ijvRightRef.current) {
      const rScale = ijvRadialScale * venousPulse;
      ijvRightRef.current.scale.set(rScale, 1, rScale);
    }
    if (ijvLeftRef.current) {
      const lScale = ijvRadialScale * leftIjvBulbBoost * venousPulse;
      ijvLeftRef.current.scale.set(lScale, 1, lScale);
    }

    // 3. Two-Stage Bayesian POCUS Uncertainty Halo breathing
    const haloBreath = 1.0 + 0.06 * Math.sin(t * 2.6);
    const hScale = bayesianHaloScale * haloBreath;
    if (haloLeftRef.current) haloLeftRef.current.scale.set(hScale, 1, hScale);
    if (haloRightRef.current) haloRightRef.current.scale.set(hScale, 1, hScale);
  });

  const { ijvX } = anthro;
  const uncertaintyHigh = (s?.daysSinceScan ?? 0) > 4;
  const haloColor = uncertaintyHigh ? '#facc15' : onsdColor;

  return (
    <group name="vascular-neuro-layer">
      {/* Volumetric Brain: Cerebral Lobes, Cortical Gyral Wireframe, Ventricular System & Cerebellum */}
      <group position={[0, 1.615, -0.006]}>
        {/* Left & Right Cortical Hemispheres */}
        {([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.036, 0, 0]}>
            <mesh geometry={geo.hemisphere}>
              <meshPhysicalMaterial
                color="#38bdf8"
                emissive={brainRiskColor}
                emissiveIntensity={onsdRisk < 0.4 ? 0.65 : 0.18}
                transparent
                opacity={0.34}
                roughness={0.28}
                clearcoat={0.6}
                depthWrite={false}
              />
            </mesh>
            {/* Subtle Cortical Gyri/Sulci Contour Overlay */}
            <mesh geometry={geo.hemisphere} scale={[1.005, 1.005, 1.005]}>
              <meshBasicMaterial color={brainRiskColor} wireframe transparent opacity={0.11} />
            </mesh>
            {/* Temporal Lobe */}
            <mesh geometry={geo.temporalLobe} position={[side * 0.016, 0, 0]}>
              <meshPhysicalMaterial
                color="#0ea5e9"
                emissive={brainRiskColor}
                emissiveIntensity={onsdRisk < 0.4 ? 0.5 : 0.15}
                transparent
                opacity={0.32}
                roughness={0.32}
                depthWrite={false}
              />
            </mesh>
          </group>
        ))}

        {/* Corpus Callosum Commissure */}
        <mesh position={[0, 0.012, 0.002]} scale={[0.9, 0.45, 1.6]}>
          <sphereGeometry args={[0.022, 12, 12]} />
          <meshStandardMaterial color="#7dd3fc" transparent opacity={0.42} depthWrite={false} />
        </mesh>

        {/* Internal Cerebral Ventricular System (Lateral + 3rd + 4th Ventricles) */}
        <group name="cerebral-ventricles">
          <mesh geometry={geo.latVentL}>
            <meshStandardMaterial
              color={brainRiskColor}
              emissive={brainRiskColor}
              emissiveIntensity={onsdRisk < 0.4 ? 1.85 : 1.05}
              transparent
              opacity={0.88}
              roughness={0.18}
            />
          </mesh>
          <mesh geometry={geo.latVentR}>
            <meshStandardMaterial
              color={brainRiskColor}
              emissive={brainRiskColor}
              emissiveIntensity={onsdRisk < 0.4 ? 1.85 : 1.05}
              transparent
              opacity={0.88}
              roughness={0.18}
            />
          </mesh>
          <mesh geometry={geo.tempHornL}>
            <meshStandardMaterial color={brainRiskColor} emissive={brainRiskColor} emissiveIntensity={1.1} transparent opacity={0.8} />
          </mesh>
          <mesh geometry={geo.tempHornR}>
            <meshStandardMaterial color={brainRiskColor} emissive={brainRiskColor} emissiveIntensity={1.1} transparent opacity={0.8} />
          </mesh>
          {/* Midline Third Ventricle & Cerebral Aqueduct -> Fourth Ventricle */}
          <mesh position={[0, -0.006, 0.004]} scale={[0.35, 0.85, 1.25]}>
            <sphereGeometry args={[0.014, 12, 12]} />
            <meshStandardMaterial color={brainRiskColor} emissive={brainRiskColor} emissiveIntensity={1.3} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, -0.052, -0.018]} rotation={[0.32, 0, 0]}>
            <octahedronGeometry args={[0.010, 0]} />
            <meshStandardMaterial color={brainRiskColor} emissive={brainRiskColor} emissiveIntensity={1.2} transparent opacity={0.82} />
          </mesh>
        </group>

        {/* Bilateral Cerebellar Hemispheres & Pons/Medulla Brainstem */}
        {[-0.024, 0.024].map((cx) => (
          <mesh key={cx} position={[cx, -0.062, -0.042]} scale={[0.92, 0.68, 0.82]}>
            <sphereGeometry args={[0.032, 14, 14]} />
            <meshStandardMaterial color="#0284c7" transparent opacity={0.42} roughness={0.4} depthWrite={false} />
          </mesh>
        ))}
        <mesh position={[0, -0.068, -0.012]} scale={[0.95, 0.85, 0.9]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshStandardMaterial color="#0369a1" transparent opacity={0.5} roughness={0.38} depthWrite={false} />
        </mesh>
        <mesh position={[0, -0.118, -0.016]} rotation={[0.10, 0, 0]}>
          <cylinderGeometry args={[0.013, 0.010, 0.095, 12]} />
          <meshStandardMaterial color="#0369a1" transparent opacity={0.5} roughness={0.38} depthWrite={false} />
        </mesh>
      </group>

      {/* Bilateral Eyeballs, Retrobulbar ONSD & Bayesian POCUS Uncertainty Halo */}
      {([-0.036, 0.036] as const).map((x, idx) => {
        const isLeft = idx === 1;
        const convergeYaw = x > 0 ? -0.18 : 0.18;
        return (
          <group key={x}>
            {/* Ocular Globe: Sclera, Translucent Cornea, Iris, Pupil, Posterior Lamina Cribrosa */}
            <group position={[x, 1.565, 0.100]}>
              <mesh>
                <sphereGeometry args={[0.0185, 20, 20]} />
                <meshPhysicalMaterial color="#f8fafc" roughness={0.18} clearcoat={0.9} />
              </mesh>
              {/* Anterior Corneal Dome */}
              <mesh position={[0, 0, 0.014]} scale={[1, 1, 0.65]}>
                <sphereGeometry args={[0.0105, 16, 16]} />
                <meshPhysicalMaterial color="#bae6fd" transparent opacity={0.45} roughness={0.05} clearcoat={1} />
              </mesh>
              {/* Iris & Pupil */}
              <mesh position={[0, 0, 0.0176]}>
                <ringGeometry args={[0.0038, 0.0086, 20]} />
                <meshStandardMaterial color="#0284c7" emissive="#0369a1" emissiveIntensity={0.4} roughness={0.2} />
              </mesh>
              <mesh position={[0, 0, 0.0179]}>
                <circleGeometry args={[0.0038, 16]} />
                <meshBasicMaterial color="#020617" />
              </mesh>
              {/* Lamina Cribrosa / Optic Disc Translaminar Ring (OSD-818) */}
              <mesh position={[0, 0, -0.017]} rotation={[0, 0, 0]}>
                <torusGeometry args={[0.0068, 0.0016, 8, 18]} />
                <meshStandardMaterial color={onsdColor} emissive={onsdColor} emissiveIntensity={1.6} />
              </mesh>
            </group>

            {/* Retrobulbar Optic Nerve Tract + Dynamic Subarachnoid ONSD + Bayesian 95% Halo */}
            <group
              position={[x * 0.72, 1.561, 0.056]}
              rotation={[Math.PI / 2, 0, convergeYaw]}
            >
              {/* Inner Optic Nerve Proper (~3 mm physiological core) */}
              <mesh>
                <cylinderGeometry args={[0.0042, 0.0038, 0.072, 12]} />
                <meshStandardMaterial color="#fef08a" emissive="#eab308" emissiveIntensity={0.45} />
              </mesh>
              {/* Subarachnoid Optic Nerve Sheath (ONSD) scaling with s.onsdMm */}
              <mesh scale={[onsdScale, 1, onsdScale]}>
                <cylinderGeometry args={[0.0082, 0.0074, 0.068, 16]} />
                <meshStandardMaterial
                  color={onsdColor}
                  emissive={onsdColor}
                  emissiveIntensity={onsdRisk < 0.4 ? 1.65 : 0.85}
                  transparent
                  opacity={0.78}
                  roughness={0.22}
                />
              </mesh>
              {/* Coaxial Two-Stage Bayesian POCUS Uncertainty Halo (95% CI: 1.96 * onsdSigmaMm) */}
              <mesh ref={isLeft ? haloLeftRef : haloRightRef} scale={[bayesianHaloScale, 1, bayesianHaloScale]}>
                <cylinderGeometry args={[0.0092, 0.0086, 0.056, 18, 1, true]} />
                <meshStandardMaterial
                  color={haloColor}
                  emissive={haloColor}
                  emissiveIntensity={uncertaintyHigh ? 1.35 : 0.75}
                  transparent
                  opacity={clamp(0.16 + (s?.onsdSigmaMm ?? 0.18) * 1.4, 0.16, 0.52)}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              {/* 3 mm Retrobulbar POCUS Caliper Ring */}
              <mesh position={[0, 0.022, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[bayesianHaloScale, bayesianHaloScale, 1]}>
                <torusGeometry args={[0.0095, 0.0012, 8, 22]} />
                <meshBasicMaterial color={haloColor} transparent opacity={0.85} />
              </mesh>
            </group>
          </group>
        );
      })}

      {/* Optic Chiasm at Sella Turcica */}
      <mesh position={[0, 1.556, 0.020]} scale={[1.4, 0.55, 0.9]}>
        <sphereGeometry args={[0.010, 12, 12]} />
        <meshStandardMaterial color={onsdColor} emissive={onsdColor} emissiveIntensity={0.9} />
      </mesh>

      {/* Beating 4-Chamber Myocardial Heart */}
      <group ref={heartGroupRef} position={[0.016, 0.985, 0.048]} rotation={[0.10, 0.14, -0.32]}>
        <mesh geometry={geo.myocardium}>
          <meshPhysicalMaterial
            color="#dc2626"
            emissive="#7f1d1d"
            emissiveIntensity={0.62}
            roughness={0.36}
            clearcoat={0.55}
          />
        </mesh>
        {/* Right Atrium & Left Auricle */}
        <mesh position={[-0.026, 0.028, -0.004]} scale={[0.92, 0.85, 0.88]}>
          <sphereGeometry args={[0.026, 14, 14]} />
          <meshStandardMaterial color="#991b1b" emissive="#450a0a" emissiveIntensity={0.55} roughness={0.42} />
        </mesh>
        <mesh position={[0.020, 0.032, -0.008]} scale={[0.88, 0.80, 0.85]}>
          <sphereGeometry args={[0.024, 14, 14]} />
          <meshStandardMaterial color="#b91c1c" emissive="#7f1d1d" emissiveIntensity={0.55} roughness={0.42} />
        </mesh>
        {/* Pulmonary Trunk */}
        <mesh position={[0.004, 0.048, 0.014]} rotation={[-0.25, 0, 0.22]}>
          <cylinderGeometry args={[0.011, 0.013, 0.048, 12]} />
          <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.35} roughness={0.38} />
        </mesh>
      </group>

      {/* Aortic Arch, Supra-Aortic Trunks, Descending Aorta & Iliac/Femoral Arteries */}
      <mesh geometry={geo.aorta}>
        <meshPhysicalMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.38} roughness={0.30} clearcoat={0.5} />
      </mesh>
      <mesh geometry={geo.brachiocephalicArt}>
        <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.32} roughness={0.34} />
      </mesh>
      <mesh geometry={geo.leftCarotidArt}>
        <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.32} roughness={0.34} />
      </mesh>
      <mesh geometry={geo.leftSubclavianArt}>
        <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.32} roughness={0.34} />
      </mesh>
      <mesh geometry={geo.iliacArtL}>
        <meshStandardMaterial color="#dc2626" roughness={0.38} />
      </mesh>
      <mesh geometry={geo.iliacArtR}>
        <meshStandardMaterial color="#dc2626" roughness={0.38} />
      </mesh>

      {/* Superior & Inferior Vena Cava + Brachiocephalic Venous Confluence */}
      <mesh geometry={geo.venaCava}>
        <meshStandardMaterial color="#0284c7" emissive="#0369a1" emissiveIntensity={0.35} roughness={0.35} transparent opacity={0.86} />
      </mesh>
      <mesh geometry={geo.leftBrachiocephalicVein}>
        <meshStandardMaterial color={ijvColor} emissive={ijvColor} emissiveIntensity={0.45} roughness={0.32} transparent opacity={0.88} />
      </mesh>
      <mesh geometry={geo.rightBrachiocephalicVein}>
        <meshStandardMaterial color={ijvColor} emissive={ijvColor} emissiveIntensity={0.40} roughness={0.32} transparent opacity={0.88} />
      </mesh>

      {/* Anatomically Asymmetric Right & Left Internal Jugular Veins (Poiseuille/Womersley tau_w) */}
      {/* Subject's Right IJV (x < 0): wider baseline, straighter drainage */}
      <mesh ref={ijvRightRef} geometry={geo.rightIjvLocal} position={[-ijvX, 1.325, 0.040]}>
        <meshPhysicalMaterial
          color={ijvColor}
          emissive={ijvColor}
          emissiveIntensity={(s?.rho.tau_w ?? 0.5) < 0.4 ? 1.35 : 0.55}
          roughness={0.22}
          clearcoat={0.7}
        />
      </mesh>
      {/* Subject's Left IJV (x > 0): fusiform J2 stasis bulb & POCUS inspection collar */}
      <group position={[ijvX, 1.325, 0.042]}>
        <mesh ref={ijvLeftRef} geometry={geo.leftIjvLocal}>
          <meshPhysicalMaterial
            color={ijvColor}
            emissive={ijvColor}
            emissiveIntensity={(s?.rho.tau_w ?? 0.5) < 0.4 ? 1.65 : 0.62}
            roughness={0.20}
            clearcoat={0.75}
          />
        </mesh>
        {/* J2 POCUS Measurement Collar */}
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[ijvRadialScale * leftIjvBulbBoost, ijvRadialScale * leftIjvBulbBoost, 1]}>
          <torusGeometry args={[0.0135, 0.0016, 10, 24]} />
          <meshBasicMaterial color={ijvColor} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Layer 5: Dynamic Microgravity Cephalad Fluid Shift.
 * Models upward venous redistribution (~2 L headward shift in 0g) with:
 * 1. Continuous bilateral saphenous-iliac-IVC-SVC-IJV-dural venous return pathways.
 * 2. Advecting pulsatile plasma boluses propagating headward (+y) under traveling harmonic wave
 *    F_cephalad(y, t) = 0.5 * (1 + sin(omega_HR * t - k_y * y)).
 * 3. Cranial dural sinus & cervical J2 pooling glow modulated by CSA distension and LBNP countermeasure.
 */
export function CephaladFluidShift({
  s,
  sex = 'MALE',
  visible = true,
}: {
  s: ScenarioState | null;
  sex?: CrewSex;
  visible?: boolean;
}) {
  if (!s) return null;
  const anthro = getAnthropometry(sex);
  const bolusGroupRef = useRef<THREE.Group>(null);
  const scanRingsRef = useRef<THREE.Group>(null);
  const cranialPoolRef = useRef<THREE.Mesh>(null);

  const pathways = useMemo(() => {
    const { ankleX, kneeX, hipX, ijvX } = anthro;
    const leftPts = [
      new THREE.Vector3(ankleX * 0.92, -0.64, 0.012),
      new THREE.Vector3(kneeX * 0.92, -0.36, 0.016),
      new THREE.Vector3(hipX * 0.80, -0.04, 0.020),
      new THREE.Vector3(hipX * 0.48, 0.30, 0.008),
      new THREE.Vector3(-0.014, 0.58, 0.008),  // IVC convergence
      new THREE.Vector3(-0.020, 0.88, 0.028),  // Hepatic/RA inflow
      new THREE.Vector3(-0.022, 1.08, 0.042),  // SVC
      new THREE.Vector3(ijvX * 0.65, 1.17, 0.048), // Left brachiocephalic vein
      new THREE.Vector3(ijvX, 1.33, 0.044),    // Left IJV J2 stasis zone
      new THREE.Vector3(ijvX * 0.92, 1.50, 0.020),
      new THREE.Vector3(0.028, 1.60, -0.012),  // Transverse/sagittal dural sinus
      new THREE.Vector3(0.0, 1.655, -0.018),   // Superior sagittal sinus
    ];

    const rightPts = [
      new THREE.Vector3(-ankleX * 0.92, -0.64, 0.012),
      new THREE.Vector3(-kneeX * 0.92, -0.36, 0.016),
      new THREE.Vector3(-hipX * 0.80, -0.04, 0.020),
      new THREE.Vector3(-hipX * 0.48, 0.30, 0.008),
      new THREE.Vector3(-0.018, 0.58, 0.008),
      new THREE.Vector3(-0.022, 0.88, 0.028),
      new THREE.Vector3(-0.025, 1.08, 0.042),
      new THREE.Vector3(-ijvX * 0.85, 1.18, 0.045),
      new THREE.Vector3(-ijvX, 1.33, 0.040),   // Right IJV
      new THREE.Vector3(-ijvX * 0.92, 1.50, 0.020),
      new THREE.Vector3(-0.028, 1.60, -0.012),
      new THREE.Vector3(0.0, 1.655, -0.018),
    ];

    const leftCurve = new THREE.CatmullRomCurve3(leftPts);
    const rightCurve = new THREE.CatmullRomCurve3(rightPts);
    const leftGuide = new THREE.TubeGeometry(leftCurve, 44, 0.0028, 6, false);
    const rightGuide = new THREE.TubeGeometry(rightCurve, 44, 0.0028, 6, false);

    return { leftCurve, rightCurve, leftGuide, rightGuide };
  }, [anthro]);

  useEffect(() => {
    return () => disposeGeometryCollection([pathways.leftGuide, pathways.rightGuide]);
  }, [pathways]);

  const BOLUS_PER_SIDE = 16;
  const totalBoluses = BOLUS_PER_SIDE * 2;
  const stasis = s.tauW < 2.5 || s.rho.tau_w < 0.2;
  const pulseColor = tauWColor(s.tauW, s.rho.tau_w);

  useFrame(({ clock }) => {
    if (!visible) return;
    const t = clock.getElapsedTime();
    const hrBpm = s?.hrAccepted ? s.hr : 68;
    const omega = 2 * Math.PI * (hrBpm / 60);
    const ky = 3.4; // rad/m spatial wavenumber

    // Advection speed along venous return curve: brisk upward shift during 0g entry, slower congested drift in deep stasis
    const baseAdvect = 0.14 + 0.10 * clamp(s.vmax / 45, 0.1, 1.2);
    const cephaladPoolingBias = clamp(0.55 + s.decon * 0.85 + (s.csa - 0.8) * 0.28, 0.5, 1.95);

    if (bolusGroupRef.current) {
      bolusGroupRef.current.children.forEach((child, idx) => {
        const isRight = idx >= BOLUS_PER_SIDE;
        const localIdx = idx % BOLUS_PER_SIDE;
        const phaseOffset = localIdx / BOLUS_PER_SIDE + (isRight ? 0.03 : 0);
        // Non-linear u compression near u -> 0.82..0.98 simulates venous congestion & pooling in neck/head
        const rawU = (phaseOffset + t * baseAdvect) % 1.0;
        const u = Math.pow(rawU, stasis ? 0.72 : 0.88);

        const curve = isRight ? pathways.rightCurve : pathways.leftCurve;
        const pos = curve.getPointAt(clamp(u, 0, 1));
        child.position.copy(pos);

        // True headward (+y) traveling harmonic pulse: sin(omega * t - k_y * y)
        const harmonic = 0.5 * (1 + Math.sin(omega * t - ky * pos.y));
        const headwardGain = pos.y > 0.9 ? cephaladPoolingBias : Math.max(0.55, 1.05 - s.decon * 0.35);
        const radius = (0.0085 + 0.0085 * harmonic) * headwardGain;
        child.scale.setScalar(radius);

        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = clamp(0.28 + 0.58 * harmonic * Math.min(1.25, headwardGain), 0.18, 0.94);
      });
    }

    // Subtle ascending coronal hydrostatic wave rings (-0.45m -> +1.58m)
    if (scanRingsRef.current) {
      scanRingsRef.current.children.forEach((ring, rIdx) => {
        const uRing = ((t * 0.22 + rIdx / 3) % 1.0);
        const yRing = -0.45 + uRing * 2.03;
        ring.position.y = yRing;
        // Taper ring radius to follow torso -> neck -> head envelope
        const envR = yRing > 1.24 ? 0.125 : yRing > 0.35 ? 0.245 : 0.21;
        ring.scale.set(envR, envR, 1);
        const fade = Math.sin(uRing * Math.PI);
        const mat = (ring as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.20 * fade * clamp(0.5 + s.decon, 0.4, 1.2);
      });
    }

    if (cranialPoolRef.current) {
      const poolPulse = 1.0 + 0.08 * Math.sin(omega * t - ky * 1.60);
      cranialPoolRef.current.scale.setScalar(poolPulse * clamp(0.85 + s.decon * 0.35, 0.85, 1.28));
    }
  });

  if (!visible) return null;

  return (
    <group name="cephalad-fluid-shift">
      {/* Continuous Venous Return Conduit Guides */}
      <mesh geometry={pathways.leftGuide}>
        <meshBasicMaterial color={pulseColor} transparent opacity={0.24} />
      </mesh>
      <mesh geometry={pathways.rightGuide}>
        <meshBasicMaterial color={pulseColor} transparent opacity={0.24} />
      </mesh>

      {/* Advecting Pulsatile Venous Plasma Boluses */}
      <group ref={bolusGroupRef}>
        {Array.from({ length: totalBoluses }).map((_, idx) => (
          <mesh key={idx}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshStandardMaterial
              color={pulseColor}
              emissive={pulseColor}
              emissiveIntensity={stasis ? 1.75 : 1.25}
              transparent
              opacity={0.7}
              roughness={0.15}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* Ascending Coronal Hydrostatic Shift Wavefronts */}
      <group ref={scanRingsRef}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.94, 1.0, 40]} />
            <meshBasicMaterial color={pulseColor} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* Cranial Dural Venous Sinus Pooling Reservoir */}
      <mesh ref={cranialPoolRef} position={[0, 1.62, -0.012]} scale={[1, 0.82, 1.15]}>
        <sphereGeometry args={[0.068, 18, 18]} />
        <meshStandardMaterial
          color={pulseColor}
          emissive={pulseColor}
          emissiveIntensity={stasis ? 1.2 : 0.65}
          transparent
          opacity={clamp(0.10 + s.decon * 0.18, 0.10, 0.32)}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Layer 3: Sculpted Muscle Bellies with Sexual Dimorphism, Soleus Atrophy & Dynamic Pennation Chevrons:
 * - Sternocleidomastoid, Pectoralis Major, Deltoid, Biceps/Triceps, Forearm, Rectus Abdominis, Quadriceps (Q-angle).
 * - Deep Soleus + Gastrocnemius heads + White Achilles Tendon inserting into Calcaneus.
 * - Bipennate myofiber Pennation Chevrons tilting dynamically with theta_p = clamp(12 + (soleusMm - 11), 8, 35) deg.
 */
export function MusclesLayer({
  s,
  opacity,
  sex,
  soleusNode,
}: {
  s: ScenarioState | null;
  opacity: number;
  sex: CrewSex;
  soleusNode?: ProjectedAnatomicalNode;
}) {
  const anthro = getAnthropometry(sex);
  const { isF, shoulderX, hipX, kneeX, ankleX, ijvX } = anthro;

  const soleusDegraded = s ? s.rho.soleus < 0.4 : false;
  const soleusColor = soleusNode
    ? !soleusNode.observed
      ? '#6b7280'
      : soleusNode.localIntensity < 0.25
        ? '#9f1239'
        : soleusNode.color
    : soleusDegraded
      ? riskColor(s!.rho.soleus)
      : '#9f1239';
  const chevronColor = soleusNode ? soleusNode.color : s ? riskColor(s.rho.soleus) : '#22d3ee';
  const soleusBase = isF ? 14.0 : 16.0;
  const soleusScale = s ? clamp(s.soleusMm / soleusBase, 0.56, 1.12) : 1.0;
  const pennationDeg = s ? clamp(12 + (s.soleusMm - 11), 8, 35) : 22;
  const pennationRad = (pennationDeg * Math.PI) / 180;

  const armScale = isF ? 0.82 : 1.04;
  const qAngleRoll = Math.atan2(hipX - kneeX, 0.50);

  const geo = useMemo(() => ({
    pectoral: sculptLoft(
      [
        { y: -0.065, rx: 0.048, rzFront: 0.022, rzBack: 0.010 },
        { y: -0.015, rx: 0.078, rzFront: isF ? 0.030 : 0.036, rzBack: 0.012 },
        { y: 0.035, rx: 0.072, rzFront: 0.026, rzBack: 0.010 },
        { y: 0.065, rx: 0.028, rzFront: 0.012, rzBack: 0.008 },
      ],
      18,
      14,
    ),
    bicepTricep: sculptLoft(
      [
        { y: -0.15, rx: 0.028, rzFront: 0.028, rzBack: 0.026 },
        { y: -0.04, rx: 0.042, rzFront: 0.046, rzBack: 0.040 },
        { y: 0.06, rx: 0.044, rzFront: 0.048, rzBack: 0.044 },
        { y: 0.15, rx: 0.024, rzFront: 0.026, rzBack: 0.026 },
      ],
      18,
      16,
    ),
    forearm: smoothLathe([[0.001, -0.15], [0.020, -0.12], [0.033, 0.02], [0.039, 0.11], [0.001, 0.15]], 16, 18),
    quad: sculptLoft(
      [
        { y: -0.22, rx: 0.042, rzFront: 0.044, rzBack: 0.040 },
        { y: -0.06, rx: 0.064, rzFront: 0.068, rzBack: 0.060, bilobeFront: 0.008 },
        { y: 0.10, rx: 0.072, rzFront: 0.072, rzBack: 0.068, bilobeFront: 0.010 },
        { y: 0.22, rx: 0.048, rzFront: 0.046, rzBack: 0.048 },
      ],
      20,
      18,
    ),
    soleusBelly: sculptLoft(
      [
        { y: -0.14, rx: 0.018, rzFront: 0.012, rzBack: 0.022 },
        { y: -0.05, rx: 0.038, rzFront: 0.020, rzBack: 0.042 },
        { y: 0.05, rx: 0.046, rzFront: 0.022, rzBack: 0.052, bilobeBack: 0.010 },
        { y: 0.13, rx: 0.034, rzFront: 0.018, rzBack: 0.038, bilobeBack: 0.008 },
        { y: 0.17, rx: 0.012, rzFront: 0.010, rzBack: 0.016 },
      ],
      20,
      18,
    ),
    achilles: variableTubeFrom(
      [
        [0, -0.47, -0.028, 0.014],
        [0, -0.58, -0.032, 0.0095],
        [0, -0.705, -0.036, 0.012],
      ],
      14,
      10,
    ),
  }), [isF]);

  useEffect(() => {
    return () => disposeGeometryCollection([geo]);
  }, [geo]);

  const mat = {
    color: '#9f1239',
    transparent: true,
    opacity,
    roughness: 0.48,
    depthWrite: false,
  };

  return (
    <group name="muscles-layer">
      {/* Sternocleidomastoid Neck Columns */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          position={[side * (ijvX * 0.78), 1.31, 0.048]}
          rotation={[0.16, 0, -side * 0.22]}
        >
          <cylinderGeometry args={[0.010, 0.012, 0.23, 10]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}

      {/* Pectoralis Major */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          geometry={geo.pectoral}
          position={[side * (isF ? 0.072 : 0.084), 1.055, 0.078]}
          scale={[isF ? 0.92 : 1.08, 1.0, 1.0]}
        >
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}

      {/* Rectus Abdominis & Oblique Core */}
      <mesh position={[0, 0.73, 0.042]} scale={[isF ? 0.86 : 1.04, 1.0, 0.56]}>
        <cylinderGeometry args={[0.118, 0.098, 0.36, 18]} />
        <meshStandardMaterial {...mat} />
      </mesh>

      {/* Deltoids, Biceps/Triceps & Forearms */}
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <mesh
            position={[side * (shoulderX - 0.006), 1.155, 0.004]}
            scale={[0.82 * armScale, 1.08, 0.86 * armScale]}
          >
            <sphereGeometry args={[0.058, 14, 14]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh
            geometry={geo.bicepTricep}
            position={[side * (shoulderX + 0.014), 0.99, 0.005]}
            rotation={[0.03, 0, side * 0.10]}
            scale={[armScale, 1, armScale]}
          >
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh
            geometry={geo.forearm}
            position={[side * (shoulderX + 0.048), 0.665, 0.024]}
            rotation={[-0.09, 0, side * 0.07]}
            scale={[armScale, 1, armScale]}
          >
            <meshStandardMaterial {...mat} />
          </mesh>
        </group>
      ))}

      {/* Thighs (Q-angle Quadriceps/Hamstrings) & Calf Soleus + Bipennate Pennation Chevrons + Achilles Tendon */}
      {([-1, 1] as const).map((side) => {
        const thighMidX = side * (hipX * 0.52 + kneeX * 0.48);
        const calfX = side * (kneeX * 0.45 + ankleX * 0.55);
        const chevronSpan = 0.026 * soleusScale;

        return (
          <group key={side}>
            {/* Quadriceps & Hamstrings angled along anatomical Q-angle */}
            <mesh
              geometry={geo.quad}
              position={[thighMidX, 0.125, 0.012]}
              rotation={[0, 0, side * qAngleRoll]}
              scale={isF ? [0.95, 1.0, 0.94] : [1.04, 1.0, 1.04]}
            >
              <meshStandardMaterial {...mat} />
            </mesh>

            {/* Soleus + Gastrocnemius Belly scaling with s.soleusMm */}
            <mesh
              geometry={geo.soleusBelly}
              position={[calfX, -0.355, -0.014]}
              scale={[soleusScale, 1.0, soleusScale]}
            >
              <meshStandardMaterial
                color={soleusColor}
                emissive={soleusDegraded ? soleusColor : '#4c0519'}
                emissiveIntensity={soleusDegraded ? 0.68 : 0.15}
                transparent
                opacity={clamp(opacity + 0.22, 0.25, 0.92)}
                roughness={0.45}
                depthWrite={false}
              />
            </mesh>

            {/* Bipennate Myofiber Pennation Chevrons (Central Aponeurosis + 6 Fascicle Pairs at angle theta_p) */}
            <group position={[calfX, -0.355, -0.036 * soleusScale]}>
              {/* Central Intramuscular Aponeurosis Septum */}
              <mesh>
                <cylinderGeometry args={[0.0022, 0.0018, 0.23, 8]} />
                <meshBasicMaterial color="#e2e8f0" transparent opacity={0.78} />
              </mesh>
              {/* 6 Bilateral Fascicle Chevrons tilting at real-time pennation angle */}
              {[-0.085, -0.050, -0.015, 0.020, 0.055, 0.090].map((cy, cIdx) => {
                const taper = 1.0 - Math.abs(cy) * 3.2;
                const fascicleLen = Math.max(0.014, chevronSpan * taper);
                const dy = Math.cos(pennationRad) * fascicleLen * 0.5;
                const dx = Math.sin(pennationRad) * fascicleLen * 0.5;
                return (
                  <group key={cIdx} position={[0, cy, 0]}>
                    {/* Medial Fascicle */}
                    <mesh
                      position={[-dx, dy, 0]}
                      rotation={[0, 0, pennationRad]}
                    >
                      <cylinderGeometry args={[0.0018, 0.0018, fascicleLen, 6]} />
                      <meshStandardMaterial
                        color={chevronColor}
                        emissive={chevronColor}
                        emissiveIntensity={soleusDegraded ? 1.55 : 0.85}
                      />
                    </mesh>
                    {/* Lateral Fascicle */}
                    <mesh
                      position={[dx, dy, 0]}
                      rotation={[0, 0, -pennationRad]}
                    >
                      <cylinderGeometry args={[0.0018, 0.0018, fascicleLen, 6]} />
                      <meshStandardMaterial
                        color={chevronColor}
                        emissive={chevronColor}
                        emissiveIntensity={soleusDegraded ? 1.55 : 0.85}
                      />
                    </mesh>
                  </group>
                );
              })}
            </group>

            {/* Achilles Tendon inserting onto Calcaneal Tuberosity */}
            <mesh geometry={geo.achilles} position={[side * ankleX, 0, 0]}>
              <meshStandardMaterial
                color="#f1f5f9"
                emissive="#cbd5e1"
                emissiveIntensity={0.18}
                transparent
                opacity={clamp(opacity + 0.35, 0.45, 0.96)}
                roughness={0.32}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Layer 4: Organic Cross-Sectionally Lofted Dual-Gender Human Envelope (Male / Female) for OLED #000000.
 * Uses anterior-posterior asymmetric C-infinity lofts for neurocranium/face, pectoral/bust & lumbar lordosis torso,
 * continuous shoulder-to-wrist arms with sculpted hands, and Q-angle hip-to-ankle legs with anatomical feet.
 */
export function SkinLayer({ opacity, sex, skinOnly }: { opacity: number; sex: CrewSex; skinOnly?: boolean }) {
  const anthro = getAnthropometry(sex);
  const { isF, shoulderX, hipX, kneeX, ankleX } = anthro;

  const geo = useMemo(() => {
    // Organic Cranium, Jaw & Neck Loft
    const headNeck = sculptLoft(
      [
        { y: 1.26, rx: isF ? 0.050 : 0.060, rzFront: isF ? 0.048 : 0.056, rzBack: isF ? 0.052 : 0.060, cz: 0.004 },
        { y: 1.35, rx: isF ? 0.048 : 0.057, rzFront: isF ? 0.048 : 0.055, rzBack: isF ? 0.050 : 0.058, cz: 0.006 },
        { y: 1.43, rx: isF ? 0.062 : 0.072, rzFront: isF ? 0.082 : 0.090, rzBack: 0.064, cz: 0.004 }, // Chin / mandible
        { y: 1.50, rx: isF ? 0.074 : 0.082, rzFront: 0.092, rzBack: 0.082, cz: 0.002 },               // Zygoma / cheeks
        { y: 1.58, rx: isF ? 0.080 : 0.086, rzFront: 0.096, rzBack: 0.098, cz: -0.002 },              // Brow / parietals
        { y: 1.67, rx: isF ? 0.074 : 0.079, rzFront: 0.084, rzBack: 0.092, cz: -0.006 },              // Forehead / occiput
        { y: 1.735, rx: 0.040, rzFront: 0.044, rzBack: 0.048, cz: -0.008 },
        { y: 1.755, rx: 0.002, rzFront: 0.002, rzBack: 0.002, cz: -0.008 },
      ],
      34,
      30,
    );

    // Dimorphic Torso Loft (Pelvic Floor -> Gluteal/Hip -> Lumbar Waist -> Ribcage -> Bust/Pectorals -> Shoulders -> Neck)
    const torso = sculptLoft(
      isF
        ? [
            { y: 0.30, rx: 0.004, rzFront: 0.004, rzBack: 0.004, cz: 0.0 },
            { y: 0.34, rx: 0.165, rzFront: 0.092, rzBack: 0.128, cz: -0.004, bilobeBack: 0.024 }, // Inferior gluteal fold
            { y: 0.43, rx: 0.206, rzFront: 0.104, rzBack: 0.142, cz: -0.004, bilobeBack: 0.026 }, // Gynecoid hip & glutes
            { y: 0.53, rx: 0.188, rzFront: 0.098, rzBack: 0.116, cz: 0.002, bilobeBack: 0.012 },  // Iliac crest
            { y: 0.65, rx: 0.138, rzFront: 0.086, rzBack: 0.088, cz: 0.010 },                     // Tapered lumbar waist
            { y: 0.77, rx: 0.144, rzFront: 0.092, rzBack: 0.096, cz: 0.006 },                     // Lower costal arch
            { y: 0.90, rx: 0.162, rzFront: 0.108, rzBack: 0.108, cz: 0.002 },                     // Inframammary thorax
            { y: 1.02, rx: 0.176, rzFront: 0.142, rzBack: 0.112, cz: 0.002, bilobeFront: 0.036 }, // Bust / anterior chest
            { y: 1.13, rx: 0.194, rzFront: 0.106, rzBack: 0.108, cz: 0.0, bilobeFront: 0.010 },   // Upper chest / axilla
            { y: 1.20, rx: 0.214, rzFront: 0.082, rzBack: 0.088, cz: -0.002 },                    // Acromion / shoulders
            { y: 1.255, rx: 0.108, rzFront: 0.062, rzBack: 0.068, cz: 0.002 },                    // Trapezius slope
            { y: 1.30, rx: 0.050, rzFront: 0.048, rzBack: 0.052, cz: 0.004 },                     // Neck blend
            { y: 1.32, rx: 0.003, rzFront: 0.003, rzBack: 0.003, cz: 0.004 },
          ]
        : [
            { y: 0.30, rx: 0.004, rzFront: 0.004, rzBack: 0.004, cz: 0.0 },
            { y: 0.34, rx: 0.162, rzFront: 0.096, rzBack: 0.124, cz: -0.004, bilobeBack: 0.020 }, // Gluteal fold
            { y: 0.43, rx: 0.180, rzFront: 0.106, rzBack: 0.132, cz: -0.002, bilobeBack: 0.022 }, // Android pelvis
            { y: 0.54, rx: 0.174, rzFront: 0.104, rzBack: 0.112, cz: 0.004 },                     // Iliac oblique
            { y: 0.67, rx: 0.164, rzFront: 0.102, rzBack: 0.100, cz: 0.010 },                     // Waist / lumbar lordosis
            { y: 0.82, rx: 0.188, rzFront: 0.118, rzBack: 0.118, cz: 0.004 },                     // Lower ribcage / lats
            { y: 0.96, rx: 0.216, rzFront: 0.132, rzBack: 0.128, cz: 0.002, bilobeFront: 0.014 }, // Inferior pectoral line
            { y: 1.07, rx: 0.236, rzFront: 0.138, rzBack: 0.132, cz: 0.0, bilobeFront: 0.018 },   // Broad pectoral chest
            { y: 1.19, rx: 0.262, rzFront: 0.098, rzBack: 0.104, cz: -0.002 },                    // Biacromial shoulders
            { y: 1.255, rx: 0.132, rzFront: 0.070, rzBack: 0.076, cz: 0.002 },                    // Muscular trapezius
            { y: 1.30, rx: 0.060, rzFront: 0.056, rzBack: 0.060, cz: 0.004 },                     // Neck base
            { y: 1.32, rx: 0.003, rzFront: 0.003, rzBack: 0.003, cz: 0.004 },
          ],
      40,
      48,
    );

    // Seamless Anatomical Arm Loft (Deltoid Cap -> Biceps/Triceps -> Cubital Elbow -> Forearm -> Wrist)
    const a = isF ? 0.82 : 1.02;
    const makeArm = (side: number) =>
      sculptLoft(
        [
          { y: 1.225, rx: 0.004, rzFront: 0.004, rzBack: 0.004, cx: side * (shoulderX - 0.03), cz: 0.0 },
          { y: 1.18, rx: 0.058 * a, rzFront: 0.058 * a, rzBack: 0.060 * a, cx: side * (shoulderX - 0.005), cz: 0.002 },
          { y: 1.04, rx: 0.050 * a, rzFront: 0.054 * a, rzBack: 0.050 * a, cx: side * (shoulderX + 0.012), cz: 0.004 },
          { y: 0.89, rx: 0.044 * a, rzFront: 0.046 * a, rzBack: 0.044 * a, cx: side * (shoulderX + 0.026), cz: 0.006 },
          { y: 0.81, rx: 0.041 * a, rzFront: 0.039 * a, rzBack: 0.043 * a, cx: side * (shoulderX + 0.034), cz: 0.008 }, // Elbow
          { y: 0.72, rx: 0.044 * a, rzFront: 0.043 * a, rzBack: 0.042 * a, cx: side * (shoulderX + 0.044), cz: 0.018 }, // Upper forearm
          { y: 0.57, rx: 0.033 * a, rzFront: 0.030 * a, rzBack: 0.031 * a, cx: side * (shoulderX + 0.056), cz: 0.032 },
          { y: 0.47, rx: 0.026 * a, rzFront: 0.021 * a, rzBack: 0.022 * a, cx: side * (shoulderX + 0.064), cz: 0.040 }, // Wrist
          { y: 0.455, rx: 0.003, rzFront: 0.003, rzBack: 0.003, cx: side * (shoulderX + 0.065), cz: 0.041 },
        ],
        24,
        34,
      );

    // Seamless Q-Angle Leg Loft (Thigh -> Patella/Popliteal -> Posterior Gastrocnemius/Anterior Shin -> Ankle)
    const l = isF ? 0.96 : 1.02;
    const makeLeg = (side: number) =>
      sculptLoft(
        [
          { y: 0.41, rx: 0.004, rzFront: 0.004, rzBack: 0.004, cx: side * hipX, cz: 0.0 },
          { y: 0.36, rx: (isF ? 0.104 : 0.098) * l, rzFront: 0.096 * l, rzBack: 0.112 * l, cx: side * hipX, cz: -0.002 },
          { y: 0.18, rx: 0.088 * l, rzFront: 0.088 * l, rzBack: 0.092 * l, cx: side * (hipX * 0.65 + kneeX * 0.35), cz: 0.008 },
          { y: -0.02, rx: 0.068 * l, rzFront: 0.068 * l, rzBack: 0.070 * l, cx: side * (hipX * 0.25 + kneeX * 0.75), cz: 0.012 },
          { y: -0.14, rx: 0.056 * l, rzFront: 0.058 * l, rzBack: 0.056 * l, cx: side * kneeX, cz: 0.012 }, // Knee / patella
          { y: -0.25, rx: 0.058 * l, rzFront: 0.048 * l, rzBack: 0.072 * l, cx: side * (kneeX * 0.6 + ankleX * 0.4), cz: 0.004 }, // Gastrocnemius peak
          { y: -0.39, rx: 0.054 * l, rzFront: 0.044 * l, rzBack: 0.064 * l, cx: side * (kneeX * 0.3 + ankleX * 0.7), cz: 0.002 }, // Soleus belly
          { y: -0.55, rx: 0.040 * l, rzFront: 0.038 * l, rzBack: 0.042 * l, cx: side * ankleX, cz: 0.004 },
          { y: -0.67, rx: 0.034 * l, rzFront: 0.036 * l, rzBack: 0.038 * l, cx: side * ankleX, cz: 0.004 }, // Malleolar ankle
          { y: -0.695, rx: 0.003, rzFront: 0.003, rzBack: 0.003, cx: side * ankleX, cz: 0.004 },
        ],
        28,
        40,
      );

    // Sculpted Foot (Heel -> Arch -> Forefoot)
    const foot = sculptLoft(
      [
        { y: -0.745, rx: 0.036, rzFront: 0.132, rzBack: 0.054, cz: 0.014 },
        { y: -0.720, rx: 0.042, rzFront: 0.136, rzBack: 0.056, cz: 0.012 },
        { y: -0.692, rx: 0.036, rzFront: 0.088, rzBack: 0.048, cz: 0.004 },
        { y: -0.672, rx: 0.028, rzFront: 0.042, rzBack: 0.038, cz: 0.002 },
        { y: -0.665, rx: 0.003, rzFront: 0.003, rzBack: 0.003, cz: 0.002 },
      ],
      22,
      14,
    );

    return {
      headNeck,
      torso,
      armL: makeArm(-1),
      armR: makeArm(1),
      legL: makeLeg(-1),
      legR: makeLeg(1),
      foot,
    };
  }, [ankleX, hipX, isF, kneeX, shoulderX]);

  useEffect(() => {
    return () => disposeGeometryCollection([geo]);
  }, [geo]);

  const effectiveOpacity = skinOnly ? Math.max(0.90, opacity) : opacity;
  const matProps = {
    color: skinOnly ? '#334155' : '#0e7490',
    emissive: skinOnly ? '#0f172a' : '#083344',
    emissiveIntensity: skinOnly ? 0.32 : 0.25,
    transparent: !skinOnly || opacity < 0.95,
    opacity: effectiveOpacity,
    roughness: skinOnly ? 0.36 : 0.26,
    metalness: skinOnly ? 0.12 : 0.06,
    clearcoat: 0.65,
    clearcoatRoughness: 0.24,
    depthWrite: Boolean(skinOnly && opacity >= 0.85),
  };

  const wireOpacity = skinOnly ? 0.07 : Math.min(0.16, opacity * 0.42 + 0.03);

  const renderEnvelope = (g: THREE.BufferGeometry, pos: V3 = [0, 0, 0]) => (
    <group position={pos}>
      <mesh geometry={g}>
        <meshPhysicalMaterial {...matProps} />
      </mesh>
      <mesh geometry={g} scale={[1.002, 1.0, 1.002]}>
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={wireOpacity} depthWrite={false} />
      </mesh>
    </group>
  );

  return (
    <group name="skin-layer">
      {/* Head, Neck & Subtle Facial Landmarks (Nasal Bridge & Auricles) */}
      {renderEnvelope(geo.headNeck)}
      <mesh position={[0, 1.545, 0.104]} rotation={[-0.28, 0, 0]} scale={[0.46, 1.25, 0.78]}>
        <coneGeometry args={[0.016, 0.042, 10]} />
        <meshPhysicalMaterial {...matProps} />
      </mesh>
      {([-0.082, 0.082] as const).map((x) => (
        <mesh key={x} position={[x, 1.555, -0.004]} scale={[0.32, 0.82, 0.52]}>
          <sphereGeometry args={[0.028, 10, 10]} />
          <meshPhysicalMaterial {...matProps} />
        </mesh>
      ))}

      {/* Sculpted Dimorphic Torso */}
      {renderEnvelope(geo.torso)}

      {/* Continuous Left & Right Arms + Hands (Palm + Thumb) */}
      {renderEnvelope(geo.armL)}
      {renderEnvelope(geo.armR)}
      {([-1, 1] as const).map((side) => (
        <group
          key={side}
          position={[side * (shoulderX + 0.068), 0.425, 0.046]}
          rotation={[0.08, 0, side * 0.08]}
        >
          <mesh scale={[0.42, 0.95, 0.78]}>
            <sphereGeometry args={[0.038, 12, 12]} />
            <meshPhysicalMaterial {...matProps} />
          </mesh>
          <mesh position={[0, -0.046, 0.004]} scale={[0.38, 1.22, 0.72]}>
            <coneGeometry args={[0.029, 0.068, 10]} />
            <meshPhysicalMaterial {...matProps} />
          </mesh>
          <mesh position={[-side * 0.016, -0.012, 0.024]} rotation={[0.45, 0, -side * 0.45]}>
            <capsuleGeometry args={[0.007, 0.024, 6, 8]} />
            <meshPhysicalMaterial {...matProps} />
          </mesh>
        </group>
      ))}

      {/* Continuous Left & Right Q-Angle Legs + Anatomical Feet */}
      {renderEnvelope(geo.legL)}
      {renderEnvelope(geo.legR)}
      {([-1, 1] as const).map((side) => (
        <group key={side}>{renderEnvelope(geo.foot, [side * ankleX, 0, 0])}</group>
      ))}
    </group>
  );
}
