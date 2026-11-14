import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, QuadraticBezierLine } from '@react-three/drei';
import type { ScenarioState } from '../../lib/scenario';

type V3 = [number, number, number];

function color(rho: number): string {
  if (rho < 0) return '#f43f5e';
  if (rho < 0.2) return '#fb923c';
  if (rho < 0.4) return '#facc15';
  return '#22d3ee';
}

function Node({ pos, rho, label, value }: { pos: V3; rho: number; label: string; value: string }) {
  const c = color(rho);
  const intensity = rho < 0.2 ? 2.5 : 1.0;
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={intensity} />
      </mesh>
      <Html distanceFactor={6} position={[0.15, 0, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: c, whiteSpace: 'nowrap' }}>
          {label}<br />{value}
        </div>
      </Html>
    </group>
  );
}

function Segment({ pos, args, rot = [0, 0, 0] }: { pos: V3; args: [number, number]; rot?: V3 }) {
  return (
    <mesh position={pos} rotation={rot}>
      <capsuleGeometry args={[args[0], args[1], 6, 12]} />
      <meshBasicMaterial color="#1e3a4a" wireframe />
    </mesh>
  );
}

const P = {
  onsd: [0.12, 1.62, 0.12] as V3,
  ijv: [0.1, 1.28, 0.08] as V3,
  femur: [0.18, 0.15, 0.05] as V3,
  soleus: [-0.18, -0.65, -0.05] as V3,
  calcaneus: [0.18, -1.05, 0] as V3,
};

export function BodyHeatmap({ s }: { s: ScenarioState }) {
  const boneRho = Math.min(1, (1.6 - s.boneResorptionPct) / 1.2);
  return (
    <Canvas camera={{ position: [0, 0.4, 4], fov: 45 }} style={{ background: '#000000' }}>
      <ambientLight intensity={0.3} />
      <pointLight position={[2, 3, 3]} intensity={20} />
      {/* Wireframe anatomical silhouette */}
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color="#1e3a4a" wireframe />
      </mesh>
      <Segment pos={[0, 1.27, 0]} args={[0.06, 0.12]} />
      <Segment pos={[0, 0.8, 0]} args={[0.25, 0.55]} />
      <Segment pos={[-0.38, 0.85, 0]} args={[0.06, 0.6]} rot={[0, 0, 0.15]} />
      <Segment pos={[0.38, 0.85, 0]} args={[0.06, 0.6]} rot={[0, 0, -0.15]} />
      <Segment pos={[-0.15, 0.05, 0]} args={[0.09, 0.6]} />
      <Segment pos={[0.15, 0.05, 0]} args={[0.09, 0.6]} />
      <Segment pos={[-0.15, -0.7, 0]} args={[0.07, 0.55]} />
      <Segment pos={[0.15, -0.7, 0]} args={[0.07, 0.55]} />

      <Node pos={P.onsd} rho={s.rho.onsd} label="ONSD / SANS" value={`${s.onsdMm.toFixed(2)} mm`} />
      <Node pos={P.ijv} rho={s.rho.tau_w} label="IJV tau_w" value={`${s.tauW.toFixed(2)} dyn/cm2`} />
      <Node pos={P.femur} rho={boneRho} label="Femur SOST" value={`${s.boneResorptionPct.toFixed(2)} %/mo`} />
      <Node pos={P.soleus} rho={s.rho.soleus} label="Soleus MQI" value={`${s.soleusMm.toFixed(1)} mm`} />
      <Node pos={P.calcaneus} rho={boneRho} label="Calcaneus" value="BMD" />

      {/* Causal arcs of the ADHG: fluid shift -> SANS, unloading -> bone/muscle */}
      <QuadraticBezierLine start={P.ijv} end={P.onsd} mid={[0.6, 1.5, 0.3]} color={color(s.rho.tau_w)} lineWidth={1.5} dashed />
      <QuadraticBezierLine start={P.soleus} end={P.femur} mid={[-0.6, -0.2, 0.3]} color={color(s.rho.soleus)} lineWidth={1.5} dashed />
      <QuadraticBezierLine start={P.femur} end={P.calcaneus} mid={[0.6, -0.5, 0.3]} color={color(boneRho)} lineWidth={1.5} dashed />

      <OrbitControls enablePan={false} minDistance={2.5} maxDistance={7} />
    </Canvas>
  );
}
