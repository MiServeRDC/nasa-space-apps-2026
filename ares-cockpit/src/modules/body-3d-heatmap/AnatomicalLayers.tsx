import { useMemo } from 'react';
import * as THREE from 'three';
import type { CrewSex, ScenarioState } from '../../lib/scenario';

export type V3 = [number, number, number];

export function riskColor(rho: number): string {
  if (rho < 0) return '#f43f5e';
  if (rho < 0.2) return '#fb923c';
  if (rho < 0.4) return '#facc15';
  return '#22d3ee';
}

/** Smooth spline-interpolated lathe geometry so limbs and torso have organic curves without harsh joints. */
function smoothLathe(pts: [number, number][], radialSegs = 28, steps = 32): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)));
  const sampled = curve.getPoints(steps);
  const g = new THREE.LatheGeometry(sampled, radialSegs);
  g.computeVertexNormals();
  return g;
}

function latheFrom(pts: [number, number][], segs = 24): THREE.LatheGeometry {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

function tubeFrom(pts: V3[], radius: number, tubularSegs = 20, radialSegs = 8): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, false);
}

/** Layer 1: Anatomically sculpted Skeleton (cranium, orbits, S-spine, 8 rib pairs, pelvis, condyle long bones). */
export function SkeletonLayer({ s, sex }: { s: ScenarioState | null; sex: CrewSex }) {
  const boneRho = s?.rho.sclerostin ?? 1;
  const boneTint = boneRho < 0.4 ? riskColor(boneRho) : undefined;
  const isF = sex === 'FEMALE';
  const shoulderX = isF ? 0.25 : 0.29;
  const pelvisW = isF ? 1.12 : 0.96;

  const geo = useMemo(() => {
    const longBone = (len: number, shaftR: number, endR: number) =>
      latheFrom([
        [0.001, -len / 2],
        [endR, -len / 2 + len * 0.06],
        [shaftR * 1.15, -len / 2 + len * 0.14],
        [shaftR, 0],
        [shaftR * 1.15, len / 2 - len * 0.14],
        [endR, len / 2 - len * 0.06],
        [0.001, len / 2],
      ], 14);

    const ribScale = isF ? 0.9 : 1.0;
    const ribPairs = Array.from({ length: 8 }, (_, idx) => {
      const y = 1.14 - idx * 0.048;
      const w = (0.14 + Math.sin(((idx + 1) / 9) * Math.PI) * 0.09) * ribScale;
      const d = (0.10 + Math.sin(((idx + 1) / 9) * Math.PI) * 0.04) * ribScale;
      return {
        y,
        left: tubeFrom([[0, y, -0.06], [-w * 0.65, y - 0.01, -d * 0.6], [-w, y - 0.03, 0.01], [-w * 0.55, y - 0.05, d * 0.85], [-0.025, y - 0.04, d]], 0.009, 18, 6),
        right: tubeFrom([[0, y, -0.06], [w * 0.65, y - 0.01, -d * 0.6], [w, y - 0.03, 0.01], [w * 0.55, y - 0.05, d * 0.85], [0.025, y - 0.04, d]], 0.009, 18, 6),
      };
    });

    const spineCurve = Array.from({ length: 16 }, (_, i) => {
      const t = i / 15;
      const y = 1.36 - t * 0.92;
      const z = -0.05 + Math.sin(t * Math.PI * 2) * 0.022;
      return { y, z, r: 0.021 + t * 0.011 };
    });

    return {
      ribPairs,
      spineCurve,
      humerus: longBone(0.36, 0.016, 0.03),
      forearm: longBone(0.34, 0.013, 0.022),
      femur: longBone(0.50, 0.021, 0.042),
      tibia: longBone(0.50, 0.018, 0.034),
      pelvisLeft: tubeFrom([[-0.03, 0.42, -0.04], [-0.15 * pelvisW, 0.50, -0.01], [-0.19 * pelvisW, 0.45, 0.06], [-0.11 * pelvisW, 0.36, 0.07], [-0.02, 0.37, 0.06]], 0.025, 18, 10),
      pelvisRight: tubeFrom([[0.03, 0.42, -0.04], [0.15 * pelvisW, 0.50, -0.01], [0.19 * pelvisW, 0.45, 0.06], [0.11 * pelvisW, 0.36, 0.07], [0.02, 0.37, 0.06]], 0.025, 18, 10),
    };
  }, [isF, pelvisW]);

  const boneMat = { color: '#dcd7c9', roughness: 0.6 };
  const highlightMat = {
    color: boneTint ?? '#dcd7c9',
    emissive: boneTint ?? '#000000',
    emissiveIntensity: boneTint ? 0.55 : 0,
    roughness: 0.55,
  };

  return (
    <group name="skeleton-layer">
      <mesh position={[0, 1.59, -0.01]} scale={[0.86, 1.0, 1.04]}>
        <sphereGeometry args={[0.14, 22, 22]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>
      <mesh position={[0, 1.46, 0.05]} scale={[isF ? 0.78 : 0.86, 0.7, 0.85]}>
        <cylinderGeometry args={[0.085, 0.062, 0.11, 14]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>
      {[-0.046, 0.046].map((x) => (
        <mesh key={x} position={[x, 1.56, 0.11]}>
          <torusGeometry args={[0.025, 0.007, 8, 16]} />
          <meshStandardMaterial {...boneMat} />
        </mesh>
      ))}

      {geo.spineCurve.map((v, i) => (
        <mesh key={i} position={[0, v.y, v.z]}>
          <cylinderGeometry args={[v.r, v.r * 1.05, 0.042, 12]} />
          <meshStandardMaterial color="#cfc9b8" roughness={0.65} />
        </mesh>
      ))}

      <mesh position={[-0.11, 1.19, 0.06]} rotation={[0, 0, Math.PI / 2 - 0.12]}>
        <cylinderGeometry args={[0.01, 0.011, isF ? 0.18 : 0.21, 10]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>
      <mesh position={[0.11, 1.19, 0.06]} rotation={[0, 0, -Math.PI / 2 + 0.12]}>
        <cylinderGeometry args={[0.01, 0.011, isF ? 0.18 : 0.21, 10]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>
      <mesh position={[0, 0.99, 0.12]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[0.035, 0.27, 0.017]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>

      {geo.ribPairs.map((r) => (
        <group key={r.y}>
          <mesh geometry={r.left}><meshStandardMaterial {...boneMat} /></mesh>
          <mesh geometry={r.right}><meshStandardMaterial {...boneMat} /></mesh>
        </group>
      ))}

      <mesh geometry={geo.pelvisLeft}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.pelvisRight}><meshStandardMaterial {...boneMat} /></mesh>

      <mesh geometry={geo.humerus} position={[-shoulderX, 0.99, 0]} rotation={[0, 0, 0.14]}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.humerus} position={[shoulderX, 0.99, 0]} rotation={[0, 0, -0.14]}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.forearm} position={[-(shoulderX + 0.06), 0.63, 0.025]} rotation={[-0.08, 0, 0.1]}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.forearm} position={[shoulderX + 0.06, 0.63, 0.025]} rotation={[-0.08, 0, -0.1]}><meshStandardMaterial {...boneMat} /></mesh>

      <mesh geometry={geo.femur} position={[-0.13, 0.14, 0.01]} rotation={[0, 0, -0.04]}><meshStandardMaterial {...highlightMat} /></mesh>
      <mesh geometry={geo.femur} position={[0.13, 0.14, 0.01]} rotation={[0, 0, 0.04]}><meshStandardMaterial {...highlightMat} /></mesh>

      <mesh geometry={geo.tibia} position={[-0.12, -0.40, 0]}><meshStandardMaterial {...boneMat} /></mesh>
      <mesh geometry={geo.tibia} position={[0.12, -0.40, 0]}><meshStandardMaterial {...boneMat} /></mesh>

      {[-0.12, 0.12].map((x) => (
        <group key={x} position={[x, -0.71, 0.035]}>
          <mesh position={[0, 0, -0.02]}><boxGeometry args={[0.052, 0.048, 0.08]} /><meshStandardMaterial {...highlightMat} /></mesh>
          <mesh position={[0, -0.01, 0.06]} rotation={[0.15, 0, 0]}><boxGeometry args={[0.056, 0.024, 0.11]} /><meshStandardMaterial {...highlightMat} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Layer 2: Vascular & Neuro-Ocular (curved IJVs, Aorta, Optic Nerve Sheaths). */
export function VascularNeuroLayer({ s }: { s: ScenarioState | null }) {
  const ijvColor = s === null ? "#6191cb" : riskColor((s?.rho.tau_w ?? 1));
  const onsdColor = s === null ? "#b0a0d5" : riskColor(Math.min(s?.rho.onsd ?? 1, s?.rho.ppco2 ?? 1));
  const ijvR = 0.011 + Math.min(0.018, Math.max(0, ((s?.csa ?? 0.7) - 0.7) * 0.007));
  const onsdR = 0.015 + Math.max(0, ((s?.onsdMm ?? 4.8) - 4.8) * 0.005);

  const tubes = useMemo(() => ({
    aorta: tubeFrom([[0.02, 0.98, 0.05], [0.03, 1.12, 0.02], [0.0, 1.05, -0.02], [0.0, 0.52, -0.01]], 0.017, 24, 10),
    iliacL: tubeFrom([[0.0, 0.52, -0.01], [-0.08, 0.36, 0.01], [-0.11, -0.08, 0.03]], 0.010, 14, 8),
    iliacR: tubeFrom([[0.0, 0.52, -0.01], [0.08, 0.36, 0.01], [0.11, -0.08, 0.03]], 0.010, 14, 8),
    ijvL: tubeFrom([[-0.058, 1.50, 0.02], [-0.052, 1.32, 0.04], [-0.042, 1.12, 0.05]], ijvR, 14, 10),
    ijvR: tubeFrom([[0.058, 1.50, 0.02], [0.052, 1.32, 0.04], [0.03, 1.12, 0.05]], ijvR, 14, 10),
  }), [ijvR]);

  return (
    <group name="vascular-neuro-layer">
      <mesh position={[-0.036, 1.61, -0.01]} scale={[0.75, 0.95, 1.15]}>
        <sphereGeometry args={[0.082, 16, 16]} />
        <meshStandardMaterial color="#f472b6" transparent opacity={0.45} roughness={0.45} />
      </mesh>
      <mesh position={[0.036, 1.61, -0.01]} scale={[0.75, 0.95, 1.15]}>
        <sphereGeometry args={[0.082, 16, 16]} />
        <meshStandardMaterial color="#f472b6" transparent opacity={0.45} roughness={0.45} />
      </mesh>

      {[-0.046, 0.046].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.56, 0.11]}>
            <sphereGeometry args={[0.021, 14, 14]} />
            <meshStandardMaterial color="#e0f2fe" />
          </mesh>
          <mesh position={[x * 0.78, 1.56, 0.055]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[onsdR, onsdR, 0.10, 12]} />
            <meshStandardMaterial color={onsdColor} emissive={onsdColor} emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}

      <mesh position={[0.03, 0.97, 0.06]} rotation={[0, 0, -0.3]} scale={[0.9, 1.15, 0.85]}>
        <sphereGeometry args={[0.063, 16, 16]} />
        <meshStandardMaterial color="#dc2626" emissive="#7f1d1d" emissiveIntensity={0.6} />
      </mesh>

      <mesh geometry={tubes.aorta}><meshStandardMaterial color="#ef4444" /></mesh>
      <mesh geometry={tubes.iliacL}><meshStandardMaterial color="#ef4444" /></mesh>
      <mesh geometry={tubes.iliacR}><meshStandardMaterial color="#ef4444" /></mesh>

      <mesh geometry={tubes.ijvL}>
        <meshStandardMaterial color={ijvColor} emissive={ijvColor} emissiveIntensity={(s?.rho.tau_w ?? 1) < 0.4 ? 1.4 : 0.4} />
      </mesh>
      <mesh geometry={tubes.ijvR}>
        <meshStandardMaterial color={ijvColor} emissive={ijvColor} emissiveIntensity={(s?.rho.tau_w ?? 1) < 0.4 ? 1.4 : 0.4} />
      </mesh>
    </group>
  );
}

/** Layer 3: Sculpted Muscle Bellies (Soleus scales dynamically with soleusMm). */
export function MusclesLayer({ s, opacity, sex }: { s: ScenarioState | null; opacity: number; sex: CrewSex }) {
  const soleusColor = (s?.rho.soleus ?? 1) < 0.4 ? riskColor((s?.rho.soleus ?? 1)) : '#991b1b';
  const soleusBase = sex === 'FEMALE' ? 14.0 : 16.0;
  const soleusScale = Math.max(0.55, (s?.soleusMm ?? soleusBase) / soleusBase);
  const isF = sex === 'FEMALE';
  const armScale = isF ? 0.84 : 1.0;
  const shoulderX = isF ? 0.25 : 0.29;
  const mat = { color: '#991b1b', transparent: true, opacity, roughness: 0.55, depthWrite: false };

  const geo = useMemo(() => ({
    bicep: smoothLathe([[0.001, -0.16], [0.035, -0.11], [0.052, 0.0], [0.044, 0.11], [0.001, 0.16]], 16, 18),
    forearm: smoothLathe([[0.001, -0.15], [0.022, -0.12], [0.036, 0.03], [0.042, 0.11], [0.001, 0.15]], 16, 18),
    quad: smoothLathe([[0.001, -0.23], [0.052, -0.19], [0.075, -0.02], [0.086, 0.15], [0.001, 0.23]], 18, 20),
    calf: smoothLathe([[0.001, -0.22], [0.026, -0.18], [0.046, -0.02], [0.058, 0.11], [0.042, 0.19], [0.001, 0.22]], 18, 20),
  }), []);

  return (
    <group name="muscles-layer">
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, 1.04, 0.07]} scale={[isF ? 0.95 : 1.15, 0.8, 0.5]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
      <mesh position={[0, 0.74, 0.04]} scale={[isF ? 0.92 : 1.1, 1.0, 0.62]}>
        <cylinderGeometry args={[0.125, 0.105, 0.36, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>

      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (shoulderX - 0.04), 1.14, 0]} scale={[0.85 * armScale, 1.05, 0.8 * armScale]}>
            <sphereGeometry args={[0.065, 14, 14]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh geometry={geo.bicep} position={[side * shoulderX, 0.97, 0]} rotation={[0, 0, -side * 0.14]} scale={[armScale, 1, armScale]}>
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh geometry={geo.forearm} position={[side * (shoulderX + 0.06), 0.63, 0.025]} rotation={[-0.08, 0, -side * 0.1]} scale={[armScale, 1, armScale]}>
            <meshStandardMaterial {...mat} />
          </mesh>
        </group>
      ))}

      {[-0.13, 0.13].map((x) => (
        <group key={x}>
          <mesh geometry={geo.quad} position={[x, 0.14, 0.01]} rotation={[0, 0, x < 0 ? -0.04 : 0.04]}>
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh geometry={geo.calf} position={[x * 0.92, -0.39, -0.02]} scale={[soleusScale, 1, soleusScale]}>
            <meshStandardMaterial
              color={soleusColor}
              emissive={(s?.rho.soleus ?? 1) < 0.4 ? soleusColor : '#000000'}
              emissiveIntensity={(s?.rho.soleus ?? 1) < 0.4 ? 0.65 : 0}
              transparent
              opacity={Math.min(0.95, opacity + 0.2)}
              roughness={0.55}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Layer 4: Continuous anatomically proportioned human body (Male / Female), with hands, feet, and facial contour. */
export function SkinLayer({ opacity, sex, skinOnly }: { opacity: number; sex: CrewSex; skinOnly?: boolean }) {
  const isF = sex === 'FEMALE';

  const geo = useMemo(() => {
    const head = smoothLathe([
      [0.001, 1.37],
      [isF ? 0.048 : 0.056, 1.39], // neck top
      [isF ? 0.072 : 0.084, 1.43], // jaw / chin
      [isF ? 0.088 : 0.096, 1.50], // cheekbones
      [isF ? 0.096 : 0.104, 1.59], // brow / temples
      [isF ? 0.092 : 0.098, 1.68], // forehead / crown
      [0.045, 1.74],
      [0.001, 1.755],
    ], 32, 28);

    const torso = smoothLathe(
      isF
        ? [
            [0.001, 0.34],
            [0.195, 0.39], // pelvis / upper thigh blend
            [0.215, 0.48], // wider female hips
            [0.165, 0.62],
            [0.145, 0.74], // tapered waist
            [0.185, 0.90], // lower ribcage
            [0.210, 1.03], // bust / chest
            [0.198, 1.15], // narrower shoulders
            [0.115, 1.24], // trapezius slope
            [0.054, 1.29], // neck base
            [0.050, 1.39], // neck top
            [0.001, 1.41],
          ]
        : [
            [0.001, 0.34],
            [0.180, 0.39], // pelvis
            [0.190, 0.48], // hips
            [0.175, 0.66],
            [0.172, 0.76], // waist
            [0.215, 0.94], // ribcage
            [0.238, 1.08], // chest
            [0.242, 1.17], // broad shoulders
            [0.135, 1.24], // trapezius
            [0.064, 1.29], // neck base
            [0.060, 1.39], // neck top
            [0.001, 1.41],
          ],
      32,
      36,
    );

    // Continuous full arm (deltoid -> bicep -> elbow -> forearm -> wrist, no joint seams).
    const a = isF ? 0.84 : 1.0;
    const arm = smoothLathe([
      [0.001, 0.39],
      [0.062 * a, 0.35], // deltoid cap
      [0.056 * a, 0.22], // bicep
      [0.044 * a, 0.05], // elbow
      [0.046 * a, -0.06], // upper forearm
      [0.032 * a, -0.24], // lower forearm
      [0.026 * a, -0.34], // wrist
      [0.001, -0.355],
    ], 22, 32);

    // Continuous full leg (hip -> quad -> knee -> gastrocnemius calf -> ankle, no joint seams).
    const l = isF ? 0.95 : 1.0;
    const leg = smoothLathe([
      [0.001, 0.41],
      [0.106 * l, 0.36], // upper thigh
      [0.094 * l, 0.22], // mid thigh
      [0.074 * l, 0.05], // lower thigh
      [0.062 * l, -0.05], // knee
      [0.068 * l, -0.22], // calf / gastrocnemius
      [0.050 * l, -0.40], // lower shin
      [0.037 * l, -0.53], // ankle
      [0.001, -0.545],
    ], 24, 36);

    return { head, torso, arm, leg };
  }, [isF]);

  const mat = {
    color: skinOnly ? '#475569' : '#164e63',
    transparent: !skinOnly || opacity < 0.95,
    opacity: skinOnly ? Math.max(0.88, opacity) : opacity,
    roughness: skinOnly ? 0.45 : 0.35,
    metalness: skinOnly ? 0.08 : 0.05,
    depthWrite: Boolean(skinOnly && opacity >= 0.85),
  };
  const showWire = !skinOnly;
  const wire = { color: '#22d3ee', wireframe: true, transparent: true, opacity: Math.min(0.22, opacity * 0.45 + 0.04) };

  const shoulderX = isF ? 0.215 : 0.255;

  const part = (g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) => (
    <group position={pos} rotation={rot} scale={scale}>
      <mesh geometry={g}><meshStandardMaterial {...mat} /></mesh>
      {showWire && <mesh geometry={g}><meshBasicMaterial {...wire} /></mesh>}
    </group>
  );

  return (
    <group name="skin-layer">
      {/* Head + subtle facial features (nose bridge, brow, ears) */}
      {part(geo.head, [0, 0, 0.01], [0, 0, 0], [0.96, 1, 1.12])}
      <mesh position={[0, 1.545, 0.125]} rotation={[-0.25, 0, 0]} scale={[0.5, 1.4, 0.8]}>
        <coneGeometry args={[0.018, 0.045, 10]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {[-0.095, 0.095].map((x) => (
        <mesh key={x} position={[x, 1.555, 0.0]} scale={[0.35, 0.85, 0.55]}>
          <sphereGeometry args={[0.032, 10, 10]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}

      {/* Sculpted torso (male vs female silhouette) */}
      {part(geo.torso, [0, 0, 0], [0, 0, 0], [1, 1, isF ? 0.66 : 0.70])}

      {/* Continuous arms + hands */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {part(geo.arm, [side * (shoulderX + 0.065), 0.81, 0.01], [-0.04, 0, side * 0.13])}
          {/* Hand (palm + fingers taper) */}
          <group position={[side * (shoulderX + 0.125), 0.42, 0.03]} rotation={[0, 0, side * 0.08]}>
            <mesh scale={[0.45, 1.0, 0.85]}>
              <sphereGeometry args={[0.042, 12, 12]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, -0.05, 0.005]} scale={[0.42, 1.3, 0.8]}>
              <coneGeometry args={[0.032, 0.075, 10]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Continuous legs + feet */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {part(geo.leg, [side * 0.12, -0.17, 0.01], [0, 0, -side * 0.02])}
          {/* Sculpted Foot (heel + arch + toe box) */}
          <group position={[side * 0.12, -0.725, 0.04]}>
            <mesh scale={[0.85, 0.55, 1.85]}>
              <sphereGeometry args={[0.048, 14, 14]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
