import { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, QuadraticBezierLine } from '@react-three/drei';
import type { CrewSex, ScenarioState } from '../../lib/scenario';
import { INJURY_REGIONS, type InjuryMarker, type InjuryRegionId } from '../../types/injury';
import {
  MusclesLayer,
  riskColor,
  SkeletonLayer,
  SkinLayer,
  VascularNeuroLayer,
  type V3,
} from './AnatomicalLayers';

export type NodeId = 'onsd' | 'ijv' | 'femur' | 'soleus' | 'calcaneus';
export type TargetTab = 'POCUS' | 'MUSCLE_BONE' | 'FORECAST';

const INJURY_COLOR = '#a3e635'; // Neon lime: high-contrast opposite to the black/cyan OLED palette.

interface LayerConfig {
  skin: boolean;
  muscles: boolean;
  vascular: boolean;
  skeleton: boolean;
  arcs: boolean;
  skinOpacity: number;
  muscleOpacity: number;
}

const PRESETS: Record<string, { label: string; cfg: LayerConfig }> = {
  ALL: {
    label: 'ALL LAYERS',
    cfg: { skin: true, muscles: true, vascular: true, skeleton: true, arcs: true, skinOpacity: 0.14, muscleOpacity: 0.35 },
  },
  SKIN_ONLY: {
    label: 'SKIN ONLY',
    cfg: { skin: true, muscles: false, vascular: false, skeleton: false, arcs: true, skinOpacity: 0.92, muscleOpacity: 0.3 },
  },
  MUSCLE_BONE: {
    label: 'MUSCLE + BONE',
    cfg: { skin: false, muscles: true, vascular: false, skeleton: true, arcs: true, skinOpacity: 0.1, muscleOpacity: 0.55 },
  },
  VASCULAR: {
    label: 'VASCULAR / X-RAY',
    cfg: { skin: true, muscles: false, vascular: true, skeleton: true, arcs: true, skinOpacity: 0.08, muscleOpacity: 0.25 },
  },
  SKELETON: {
    label: 'SKELETON ONLY',
    cfg: { skin: false, muscles: false, vascular: false, skeleton: true, arcs: false, skinOpacity: 0.1, muscleOpacity: 0.3 },
  },
};

function Node({
  pos,
  rho,
  label,
  value,
  selected,
  onSelect,
}: {
  pos: V3;
  rho: number;
  label: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const c = riskColor(rho);
  const intensity = selected ? 3.2 : rho < 0.2 ? 2.2 : 1.0;
  return (
    <group position={pos}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[selected ? 0.065 : 0.048, 16, 16]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={intensity} />
      </mesh>
      <Html distanceFactor={5.5} position={[0.12, 0, 0]} style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: c,
            whiteSpace: 'nowrap',
            background: selected ? 'rgba(34,211,238,0.18)' : 'rgba(0,0,0,0.72)',
            border: selected ? `1px solid ${c}` : '1px solid rgba(55,65,81,0.7)',
            padding: '2px 6px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {label}: {value}
        </button>
      </Html>
    </group>
  );
}

function InjuryPoint({
  injury,
  sex,
  selected,
  onSelect,
}: {
  injury: InjuryMarker;
  sex: CrewSex;
  selected: boolean;
  onSelect: () => void;
}) {
  const base = INJURY_REGIONS[injury.region].pos;
  // Slightly narrow X for female shoulder/forearm alignment.
  const xScale = sex === 'FEMALE' && (injury.region.includes('SHOULDER') || injury.region.includes('FOREARM')) ? 0.86 : 1;
  const pos: V3 = [base[0] * xScale, base[1], base[2]];

  return (
    <group position={pos}>
      {/* Larger invisible hit target so clicking the injury point is effortless */}
      <mesh
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh renderOrder={10}>
        <sphereGeometry args={[selected ? 0.068 : 0.052, 18, 18]} />
        <meshStandardMaterial color={INJURY_COLOR} emissive={INJURY_COLOR} emissiveIntensity={selected ? 3.5 : 2.2} depthTest={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
        <torusGeometry args={[selected ? 0.095 : 0.075, 0.008, 8, 24]} />
        <meshStandardMaterial color="#ffffff" emissive={INJURY_COLOR} emissiveIntensity={1.6} depthTest={false} />
      </mesh>
      <Html distanceFactor={5.5} position={[-0.12, 0.04, 0]} style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 'bold',
            color: '#000000',
            background: INJURY_COLOR,
            border: selected ? '2px solid #ffffff' : '1px solid #000000',
            padding: '2px 6px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          INJURY: {INJURY_REGIONS[injury.region].label}
        </button>
      </Html>
    </group>
  );
}

const P: Record<NodeId, V3> = {
  onsd: [0.06, 1.56, 0.13],
  ijv: [0.06, 1.32, 0.05],
  femur: [0.14, 0.14, 0.05],
  soleus: [-0.13, -0.39, -0.05],
  calcaneus: [0.13, -0.71, 0.05],
};

function describeNode(id: NodeId, s: ScenarioState): {
  title: string;
  summary: string;
  tab: TargetTab;
  tabLabel: string;
} {
  switch (id) {
    case 'onsd':
      return {
        title: `Optic Nerve Sheath (${s.onsdMm.toFixed(2)} mm)`,
        summary: 'Fluid pressure behind your eyes rises with high cabin CO2 and neck vein congestion. Log a 2-minute eye scan or lower cabin CO2.',
        tab: 'POCUS',
        tabLabel: 'Open Eye Ultrasound',
      };
    case 'ijv':
      return {
        title: `Internal Jugular Vein (tau_w ${s.tauW.toFixed(2)} dyn/cm2, CSA ${s.csa.toFixed(2)} cm2)`,
        summary: 'Headward fluid shift widens the neck vein and slows flow. Using LBNP pulls blood toward your legs and restores shear stress.',
        tab: 'POCUS',
        tabLabel: 'Open Neck Ultrasound',
      };
    case 'femur':
      return {
        title: `Femur Bone Turnover (Sclerostin ${s.sclerostin.toFixed(0)} pmol/L)`,
        summary: 'Without mechanical load, sclerostin rises and slows bone formation. Daily ARED resistive exercise keeps bone turnover in check.',
        tab: 'MUSCLE_BONE',
        tabLabel: 'Open Muscle & Bone',
      };
    case 'soleus':
      return {
        title: `Soleus Calf Muscle (${s.soleusMm.toFixed(1)} mm, -${s.soleusLossPct.toFixed(1)}%)`,
        summary: 'Your calf acts as a venous pump and releases irisin to protect bone. Keep your ARED load near 100% to prevent atrophy.',
        tab: 'MUSCLE_BONE',
        tabLabel: 'Open Muscle & Bone',
      };
    case 'calcaneus':
      return {
        title: `Calcaneus & Mars Gait (BMD -${s.bmdLossPct.toFixed(1)}%, Gait Asymmetry ${s.gaiPct.toFixed(1)}%)`,
        summary: 'Heel bone loss and calf weakness affect your balance when stepping onto Mars at 0.38 g.',
        tab: 'MUSCLE_BONE',
        tabLabel: 'Open Muscle & Bone',
      };
  }
}

function createInjuryFromRegion(region: InjuryRegionId, photoUrl?: string): InjuryMarker {
  const meta = INJURY_REGIONS[region];
  return {
    id: `${region}-${Date.now()}`,
    region,
    title: meta.defaultTitle,
    severity: meta.defaultSeverity,
    confidencePct: 94,
    summary: meta.defaultSummary,
    careSteps: meta.defaultCare,
    detectedAt: new Date().toISOString().slice(11, 19) + 'Z',
    photoUrl,
  };
}

export function BodyHeatmap({
  s,
  sex,
  injuries = [],
  onAddInjury,
  onResolveInjury,
  onChangeSex,
  onOpenTab,
}: {
  s: ScenarioState;
  sex: CrewSex;
  injuries?: InjuryMarker[];
  onAddInjury?: (injury: InjuryMarker) => void;
  onResolveInjury?: (id: string) => void;
  onChangeSex?: (sex: CrewSex) => void;
  onOpenTab?: (tab: TargetTab) => void;
}) {
  const [cfg, setCfg] = useState<LayerConfig>(PRESETS.ALL.cfg);
  const [selectedNode, setSelectedNode] = useState<NodeId | null>(null);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string | null>(null);
  const [targetRegion, setTargetRegion] = useState<InjuryRegionId>('LEFT_FOREARM');
  const fileRef = useRef<HTMLInputElement>(null);

  const boneRho = s.rho.sclerostin;
  const skinOnly = cfg.skin && !cfg.skeleton && !cfg.muscles && !cfg.vascular;

  const toggle = (k: 'skin' | 'muscles' | 'vascular' | 'skeleton' | 'arcs') =>
    setCfg((c) => ({
      ...c,
      [k]: !c[k],
      skinOpacity: k === 'skin' && !c.skin ? 0.14 : c.skinOpacity,
    }));

  const selectNode = (id: NodeId) => {
    setSelectedInjuryId(null);
    setSelectedNode(id);
  };

  const selectInjury = (id: string) => {
    setSelectedNode(null);
    setSelectedInjuryId(id);
  };

  const handlePhotoUpload = (file: File | undefined) => {
    if (!file || !onAddInjury) return;
    const url = URL.createObjectURL(file);
    const marker = createInjuryFromRegion(targetRegion, url);
    onAddInjury(marker);
    selectInjury(marker.id);
  };

  const handleQuickAdd = () => {
    if (!onAddInjury) return;
    const marker = createInjuryFromRegion(targetRegion);
    onAddInjury(marker);
    selectInjury(marker.id);
  };

  const info = selectedNode ? describeNode(selectedNode, s) : null;
  const activeInjury = injuries.find((inj) => inj.id === selectedInjuryId) ?? null;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Top bar: Presets + Prominent Biological Profile Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 font-mono text-xs">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} type="button" onClick={() => { setCfg(p.cfg); setSelectedInjuryId(null); }}
              className="cursor-pointer rounded border border-line px-2 py-0.5 text-gray-300 hover:border-nominal hover:text-nominal">
              {p.label}
            </button>
          ))}
        </div>

        {onChangeSex && (
          <div className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/80 px-2.5 py-0.5">
            <span className="text-[10px] tracking-wider text-gray-400">BODY PROFILE</span>
            <div className="flex rounded-full bg-black p-0.5">
              {(['MALE', 'FEMALE'] as const).map((g) => {
                const active = sex === g;
                const activeCls = g === 'MALE' ? 'bg-sky-400 text-black font-bold' : 'bg-fuchsia-400 text-black font-bold';
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onChangeSex(g)}
                    className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${active ? activeCls : 'text-gray-400 hover:text-white'}`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Layer Toggles + AI Photo Injury Check */}
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-gray-500">LAYERS:</span>
          {([
            ['skin', 'Skin'],
            ['muscles', 'Muscles'],
            ['vascular', 'Vascular/Neuro'],
            ['skeleton', 'Skeleton'],
            ['arcs', 'Points & Arcs'],
          ] as const).map(([key, lbl]) => (
            <button key={key} type="button" onClick={() => toggle(key)}
              className={`cursor-pointer rounded border px-2 py-0.5 ${cfg[key] ? 'border-nominal bg-nominal/15 text-nominal' : 'border-line text-gray-500'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {onAddInjury && (
          <div className="flex flex-wrap items-center gap-1.5 rounded border border-lime-400/35 bg-lime-950/20 px-2 py-1">
            <span className="font-bold tracking-wider text-lime-400">AI INJURY SCAN:</span>
            <select
              aria-label="Injury region for AI photo"
              value={targetRegion}
              onChange={(e) => setTargetRegion(e.target.value as InjuryRegionId)}
              className="rounded border border-lime-400/50 bg-black px-2 py-0.5 text-lime-300"
            >
              {Object.entries(INJURY_REGIONS).map(([id, m]) => (
                <option key={id} value={id}>{m.label}</option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handlePhotoUpload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded border border-lime-400 bg-lime-400/15 px-2 py-0.5 font-bold text-lime-300 hover:bg-lime-400 hover:text-black"
            >
              + PHOTO INJURY
            </button>
            <button
              type="button"
              onClick={handleQuickAdd}
              className="cursor-pointer rounded border border-lime-400/50 px-2 py-0.5 text-lime-300 hover:border-lime-300"
              title="Preview AI injury marker without uploading a file"
            >
              TEST POINT
            </button>
          </div>
        )}
      </div>

      {/* 3D Layered Viewport */}
      <div className="relative min-h-0 flex-1 rounded border border-line bg-black">
        <Canvas
          camera={{ position: [0, 0.45, 3.3], fov: 45 }}
          style={{ background: '#000000' }}
          onPointerMissed={() => {
            setSelectedNode(null);
            setSelectedInjuryId(null);
          }}
        >
          <ambientLight intensity={0.55} />
          <pointLight position={[2.5, 3, 3]} intensity={28} />
          <pointLight position={[-2.5, 1.5, 2]} intensity={14} color="#e2e8f0" />
          <pointLight position={[0, 1, -3]} intensity={12} color="#22d3ee" />

          {cfg.skeleton && <SkeletonLayer s={s} sex={sex} />}
          {cfg.vascular && <VascularNeuroLayer s={s} />}
          {cfg.muscles && <MusclesLayer s={s} opacity={cfg.muscleOpacity} sex={sex} />}
          {cfg.skin && <SkinLayer opacity={cfg.skinOpacity} sex={sex} skinOnly={skinOnly} />}

          {!activeInjury && cfg.arcs && (
            <>
              <Node pos={P.onsd} rho={Math.min(s.rho.onsd, s.rho.ppco2)} label="ONSD / SANS"
                value={`${s.onsdMm.toFixed(2)} mm`} selected={selectedNode === 'onsd'} onSelect={() => selectNode('onsd')} />
              <Node pos={P.ijv} rho={s.rho.tau_w} label="IJV tau_w"
                value={`${s.tauW.toFixed(2)} dyn/cm2`} selected={selectedNode === 'ijv'} onSelect={() => selectNode('ijv')} />
              <Node pos={P.femur} rho={boneRho} label="Femur"
                value={`${s.sclerostin.toFixed(0)} pmol/L`} selected={selectedNode === 'femur'} onSelect={() => selectNode('femur')} />
              <Node pos={P.soleus} rho={s.rho.soleus} label="Soleus"
                value={`${s.soleusMm.toFixed(1)} mm`} selected={selectedNode === 'soleus'} onSelect={() => selectNode('soleus')} />
              <Node pos={P.calcaneus} rho={boneRho} label="Calcaneus"
                value={`-${s.bmdLossPct.toFixed(1)}%`} selected={selectedNode === 'calcaneus'} onSelect={() => selectNode('calcaneus')} />

              <QuadraticBezierLine start={P.ijv} end={P.onsd} mid={[0.5, 1.48, 0.25]} color={riskColor(s.rho.tau_w)} lineWidth={1.5} dashed />
              <QuadraticBezierLine start={P.soleus} end={P.femur} mid={[-0.5, -0.15, 0.25]} color={riskColor(s.rho.soleus)} lineWidth={1.5} dashed />
              <QuadraticBezierLine start={P.femur} end={P.calcaneus} mid={[0.5, -0.35, 0.25]} color={riskColor(boneRho)} lineWidth={1.5} dashed />
            </>
          )}

          {/* AI-Detected Injury Points (Neon Lime opposite color) */}
          {injuries.map((inj) => (
            <InjuryPoint
              key={inj.id}
              injury={inj}
              sex={sex}
              selected={selectedInjuryId === inj.id}
              onSelect={() => selectInjury(inj.id)}
            />
          ))}

          <OrbitControls target={[0, 0.45, 0]} enablePan={false} minDistance={1.8} maxDistance={6.5} />
        </Canvas>

        {/* Selected physiological node details */}
        {info && (
          <div className="absolute right-3 bottom-3 left-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-nominal bg-black/90 p-3 backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs font-bold text-nominal">{info.title}</div>
              <p className="mt-0.5 text-xs text-gray-300">{info.summary}</p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              {onOpenTab && (
                <button
                  type="button"
                  onClick={() => onOpenTab(info.tab)}
                  className="cursor-pointer rounded border border-nominal bg-nominal px-3 py-1 font-bold text-black hover:opacity-90"
                >
                  {info.tabLabel} -&gt;
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="cursor-pointer rounded border border-line px-2 py-1 text-gray-400 hover:text-white"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}

        {/* Selected AI-detected injury details */}
        {activeInjury && (
          <div className="absolute right-3 bottom-3 left-3 z-30 flex flex-wrap items-start justify-between gap-3 rounded-lg border-2 border-lime-400 bg-black p-3 shadow-2xl">
            {activeInjury.photoUrl && (
              <img
                src={activeInjury.photoUrl}
                alt={activeInjury.title}
                className="h-20 w-20 rounded border border-lime-400/50 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="rounded bg-lime-400 px-1.5 py-0.5 font-bold text-black">AI INJURY REPORT</span>
                <span className="font-bold text-lime-300">{activeInjury.title}</span>
                <span className="text-gray-400">| Severity: {activeInjury.severity}</span>
                <span className="text-gray-400">| AI Confidence: {activeInjury.confidencePct}%</span>
                <span className="text-gray-500">| {activeInjury.detectedAt}</span>
              </div>
              <p className="mt-1 text-xs text-gray-200">{activeInjury.summary}</p>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-lime-200">
                {activeInjury.careSteps.map((step, i) => (
                  <li key={i}>{i + 1}. {step}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-1.5 font-mono text-xs">
              {onResolveInjury && (
                <button
                  type="button"
                  onClick={() => {
                    onResolveInjury(activeInjury.id);
                    setSelectedInjuryId(null);
                  }}
                  className="cursor-pointer rounded border border-lime-400 bg-lime-400 px-2.5 py-1 font-bold text-black hover:opacity-90"
                >
                  MARK RESOLVED
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedInjuryId(null)}
                className="cursor-pointer rounded border border-line px-2.5 py-1 text-gray-400 hover:text-white"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
