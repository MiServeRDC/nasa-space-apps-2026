import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, QuadraticBezierLine, useProgress } from '@react-three/drei';
import type { CrewSex, ScenarioState } from '../../lib/scenario';
import { riskColor, type V3 } from './AnatomicalLayers';
import { AtlasBody, type AtlasAnchors } from './AtlasBody';
import { INJURY_REGIONS, type InjuryMarker, type InjuryRegionId } from '../../types/injury';

export type NodeId = 'onsd' | 'ijv' | 'femur' | 'soleus' | 'calcaneus';
export type TargetTab = 'POCUS' | 'MUSCLE_BONE' | 'FORECAST';

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
    label: 'Overview',
    cfg: { skin: true, muscles: true, vascular: true, skeleton: true, arcs: true, skinOpacity: 0.14, muscleOpacity: 0.35 },
  },
  SKIN_ONLY: {
    label: 'Organs',
    cfg: { skin: true, muscles: false, vascular: false, skeleton: false, arcs: true, skinOpacity: 0.92, muscleOpacity: 0.3 },
  },
  MUSCLE_BONE: {
    label: 'Muscles',
    cfg: { skin: false, muscles: true, vascular: false, skeleton: true, arcs: true, skinOpacity: 0.1, muscleOpacity: 0.55 },
  },
  VASCULAR: {
    label: 'Vascular',
    cfg: { skin: true, muscles: false, vascular: true, skeleton: true, arcs: true, skinOpacity: 0.08, muscleOpacity: 0.25 },
  },
  SKELETON: {
    label: 'Skeleton',
    cfg: { skin: false, muscles: false, vascular: false, skeleton: true, arcs: false, skinOpacity: 0.1, muscleOpacity: 0.3 },
  },
};

function Node({
  pos,
  rho,
  selected,
  onSelect,
}: {
  pos: V3;
  rho: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const c = rho === null ? (selected ? "#f4ad83" : "#8bb8f7") : riskColor(rho);
  const intensity = selected ? 3.2 : rho !== null && rho < 0.2 ? 2.2 : 1.0;
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
    </group>
  );
}

function AtlasLoading() {
  const { progress } = useProgress();
  return <Html center><span className="whitespace-nowrap rounded bg-panel px-3 py-2 text-sm">Loading anatomy · {Math.round(progress)}%</span></Html>;
}

const REGIONS: Record<NodeId, { title: string; summary: string; tab: TargetTab }> = {
  onsd: { title: 'Optic nerve sheath', summary: 'The sheath surrounds and protects the optic nerve, which carries visual signals to the brain.', tab: 'POCUS' },
  ijv: { title: 'Internal jugular vein', summary: 'This vein drains blood from the head and neck toward the heart.', tab: 'POCUS' },
  femur: { title: 'Femur', summary: 'The thigh bone supports weight and connects the hip to the knee.', tab: 'MUSCLE_BONE' },
  soleus: { title: 'Soleus muscle', summary: 'This calf muscle helps move the ankle and supports standing and walking.', tab: 'MUSCLE_BONE' },
  calcaneus: { title: 'Calcaneus', summary: 'The heel bone supports the rear of the foot and anchors the Achilles tendon.', tab: 'MUSCLE_BONE' },
};

function createInjuryFromRegion(region: InjuryRegionId, photoUrl?: string): InjuryMarker {
  const meta = INJURY_REGIONS[region];
  return {
    id: `${region}-${Date.now()}`,
    region,
    title: `${meta.label} — manual marker`,
    severity: meta.defaultSeverity,
    confidencePct: 0,
    summary: `Manually marked region: ${meta.label}. ${photoUrl ? 'Photo attached locally for inspection.' : 'Demonstration marker.'} No automatic image analysis has been performed.`,
    careSteps: [],
    detectedAt: new Date().toISOString().slice(11, 19) + 'Z',
    photoUrl,
  };
}

export function BodyHeatmap({
  s,
  sex,
  injuries,
  onAddInjury,
  onResolveInjury,
  onChangeSex,
  onOpenTab,
}: {
  s: ScenarioState | null;
  sex: CrewSex;
  injuries: InjuryMarker[];
  onAddInjury: (injury: InjuryMarker) => void;
  onResolveInjury: (id: string) => void;
  onChangeSex?: (sex: CrewSex) => void;
  onOpenTab?: (tab: TargetTab) => void;
}) {
  const [cfg, setCfg] = useState<LayerConfig>(PRESETS.ALL.cfg);
  const [selected, setSelected] = useState<NodeId>('soleus');
  const [anchors, setAnchors] = useState<AtlasAnchors | null>(null);
  const [markerRegion, setMarkerRegion] = useState<InjuryRegionId>('LEFT_KNEE');
  const [markerId, setMarkerId] = useState<string | null>(null);
  const marker = injuries.find(note => note.id === markerId);
  const addMarker = (file?: File) => {
    const note = createInjuryFromRegion(markerRegion, file && URL.createObjectURL(file));
    onAddInjury(note);
    setMarkerId(note.id);
  };
  const boneRho = s?.rho.sclerostin ?? null;
  const metrics: Record<NodeId, { label: string; value: string; margin: number } | null> = {
    onsd: s && { label: 'Sheath diameter', value: `${s.onsdMm.toFixed(2)} mm`, margin: Math.min(s.rho.onsd, s.rho.ppco2) },
    ijv: s && { label: 'Wall shear stress', value: `${s.tauW.toFixed(2)} dyn/cm²`, margin: s.rho.tau_w },
    femur: s && { label: 'Sclerostin', value: `${s.sclerostin.toFixed(0)} pmol/L`, margin: s.rho.sclerostin },
    soleus: s && { label: 'Soleus thickness', value: `${s.soleusMm.toFixed(1)} mm`, margin: s.rho.soleus },
    calcaneus: s && { label: 'Bone density loss', value: `${s.bmdLossPct.toFixed(1)}%`, margin: s.rho.sclerostin },
  };

  const toggle = (k: 'skin' | 'muscles' | 'vascular' | 'skeleton' | 'arcs') =>
    setCfg((c) => ({
      ...c,
      [k]: !c[k],
      skinOpacity: k === 'skin' && !c.skin ? 0.14 : c.skinOpacity,
    }));

  const info = REGIONS[selected];
  const metric = metrics[selected];

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* 3D Layered Viewport */}
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(205px,2fr)]">
      <div className="min-w-0">
      <div className="health-figure relative h-[clamp(300px,54vh,620px)] overflow-hidden rounded-xl border border-line">
        <Canvas
          camera={{ position: [0.75, 0.45, 3.8], fov: 45 }}
          style={{ background: 'transparent' }}
          fallback={<div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <svg viewBox="0 0 180 360" role="img" aria-label={`${sex.toLowerCase()} anatomical overview`} className="h-[85%] max-w-full">
              <g fill="#8198bc" stroke="#b3c3db" strokeWidth="1.5">
                <ellipse cx="90" cy="31" rx="17" ry="22" />
                <path d={sex === 'FEMALE'
                  ? 'M80 49H100L104 59Q121 63 124 76L145 172Q145 183 137 183L113 111L107 139Q125 173 112 210L109 325L122 337Q123 342 100 342L90 218L80 342Q57 342 58 337L71 325L68 210Q55 173 73 139L67 111L43 183Q35 183 35 172L56 76Q59 63 76 59Z'
                  : 'M80 49H100L106 60Q129 63 132 77L150 174Q151 183 141 185L118 111L111 155L115 201L108 325L123 337Q123 344 100 342L90 214L80 342Q57 344 57 337L72 325L65 201L69 155L62 111L39 185Q29 183 30 174L48 77Q51 63 74 60Z'} />
              </g>
              <g fill="#f4ad83" stroke="#182337" strokeWidth="3">
                <circle cx="95" cy="27" r="5" /><circle cx="98" cy="56" r="5" />
                <circle cx="104" cy="191" r="5" /><circle cx="77" cy="267" r="5" /><circle cx="104" cy="321" r="5" />
              </g>
            </svg>
            <p className="text-xs text-gray-300">Anatomical overview · 3D unavailable in this browser</p>
          </div>}
        >
          <ambientLight intensity={1.15} />
          <pointLight position={[2.5, 3, 3]} intensity={28} />
          <pointLight position={[-2.5, 1.5, 2]} intensity={14} color="#e2e8f0" />
          <pointLight position={[0, 1, -3]} intensity={12} color="#22d3ee" />

          <Suspense fallback={<AtlasLoading />}>
            <AtlasBody s={s} skeleton={cfg.skeleton} muscles={cfg.muscles}
              vascular={cfg.vascular} organs={cfg.skin} muscleOpacity={cfg.muscleOpacity}
              selected={selected} onSelect={setSelected} onAnchors={setAnchors} />
          </Suspense>

          {anchors && cfg.arcs && (
            <>
              {(Object.keys(REGIONS) as NodeId[]).map(id => (
                <Node key={id} pos={anchors.nodes[id]} rho={metrics[id]?.margin ?? null}
                  selected={selected === id} onSelect={() => setSelected(id)} />
              ))}
              {s && <>
                <QuadraticBezierLine start={anchors.nodes.ijv} end={anchors.nodes.onsd} mid={[0.5, 1.48, 0.25]} color={riskColor(s.rho.tau_w)} lineWidth={1.5} dashed />
                <QuadraticBezierLine start={anchors.nodes.soleus} end={anchors.nodes.femur} mid={[-0.5, -0.15, 0.25]} color={riskColor(s.rho.soleus)} lineWidth={1.5} dashed />
                <QuadraticBezierLine start={anchors.nodes.femur} end={anchors.nodes.calcaneus} mid={[0.5, -0.35, 0.25]} color={riskColor(boneRho ?? 1)} lineWidth={1.5} dashed />
              </>}
            </>
          )}
          {anchors && injuries.map(note => (
            <Node key={note.id} pos={anchors.injuries[note.region]} rho={null}
              selected={note.id === markerId} onSelect={() => setMarkerId(note.id)} />
          ))}

          <OrbitControls target={[0, 0.45, 0]} enablePan={false} minDistance={1.8} maxDistance={6.5} />
        </Canvas>
      </div>

        <div className="anatomy-layers" aria-label="Anatomical layers">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button key={key} type="button" aria-pressed={cfg === preset.cfg}
              onClick={() => setCfg(preset.cfg)} className="health-choice">{preset.label}</button>
          ))}
        </div>

      </div>
      <aside className="health-region space-y-4 rounded-xl border border-line bg-panel p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Selected region</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{info.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">{info.summary}</p>
        </div>
        <label className="block text-sm text-gray-300">
          Region
          <select value={selected} onChange={e => setSelected(e.target.value as NodeId)}
            className="mt-2 block w-full rounded-lg border border-line bg-black px-3 py-2 text-white">
            {(Object.keys(REGIONS) as NodeId[]).map(id => <option key={id} value={id}>{REGIONS[id].title}</option>)}
          </select>
        </label>
        <div className="border-t border-line pt-4">
          {metric ? <>
            <p className="text-xs font-semibold uppercase tracking-wide text-advisory">Simulated · illustrative</p>
            <p className="mt-2 text-sm text-gray-300">{metric.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{metric.value}</p>
            <p className="mt-2 text-sm text-gray-300">Scenario margin <strong className={metric.margin < 0 ? 'text-warning' : 'text-nominal'}>{metric.margin.toFixed(2)}</strong></p>
          </> : <>
            <p className="text-sm font-semibold text-white">Data unavailable</p>
            <p className="mt-1 text-sm text-gray-400">BIDMC replay does not measure this region.</p>
          </>}
        </div>
        {metric && onOpenTab && <button type="button" onClick={() => onOpenTab(info.tab)}
          className="rounded-lg border border-line px-3 py-2 text-sm text-nominal hover:border-nominal">
          View related indicators
        </button>}
        <div className="border-t border-line pt-4 text-sm">
          <h4 className="font-semibold text-white">Manual markers</h4>
          <label className="mt-2 block text-gray-300">
            Marker location
            <select value={markerRegion} onChange={event => setMarkerRegion(event.target.value as InjuryRegionId)}
              className="mt-2 block w-full rounded-lg border border-line bg-black px-3 text-white">
              {Object.entries(INJURY_REGIONS).map(([id, region]) => <option key={id} value={id}>{region.label}</option>)}
            </select>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="health-choice" onClick={() => addMarker()}>Add marker</button>
            <label className="health-choice inline-flex items-center focus-within:outline-2">
              Attach photo
              <input type="file" accept="image/*" className="sr-only" aria-label="Attach local photo"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) addMarker(file);
                  event.target.value = '';
                }} />
            </label>
          </div>
          {injuries.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {injuries.map(note => <li key={note.id}>
                <button type="button" className="health-choice" aria-pressed={note.id === markerId}
                  onClick={() => setMarkerId(note.id)}>{note.title}</button>
              </li>)}
            </ul>
          )}
          {marker && (
            <div className="mt-2 space-y-2 rounded-lg border border-line p-3">
              <p className="font-semibold text-white">{marker.title}</p>
              {marker.photoUrl && <img src={marker.photoUrl} alt={marker.title} className="max-h-40 rounded object-contain" />}
              <button type="button" className="health-choice" onClick={() => {
                onResolveInjury(marker.id);
                setMarkerId(null);
              }}>Mark resolved</button>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-400">Male anatomical reference for both scenario profiles. <a href="/anatomy/ATTRIBUTION.md" className="underline">Atlas credits</a></p>
        <details className="border-t border-line pt-2 text-sm text-gray-300">
          <summary className="flex min-h-12 cursor-pointer items-center">Model settings</summary>
          {onChangeSex && (
            <label className="mb-3 block">
              Body profile
              <select value={sex} onChange={(event) => onChangeSex(event.target.value as CrewSex)}
                className="mt-2 block w-full rounded-lg border border-line bg-black px-3 text-white">
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {([
              ['skin', 'Organs'],
              ['muscles', 'Muscles'],
              ['vascular', 'Vascular'],
              ['skeleton', 'Skeleton'],
              ['arcs', 'Points & arcs'],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={cfg[key]}
                onClick={() => toggle(key)} className="health-choice">{label}</button>
            ))}
          </div>
        </details>
      </aside>
      </div>
    </div>
  );
}
