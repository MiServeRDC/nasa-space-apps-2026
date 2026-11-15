import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {AnatomyRegistry} from './registry';
import type {AnatomyModelManifest} from './contracts';
import {AnatomyModelSession,type AnatomyChunk} from './modelSession';
import type {SemanticBatch} from './semanticGeometry';
import {WebGlErrorBoundary} from '../modules/body-3d-heatmap/webglErrorBoundary';
const Canvas=lazy(()=>import('./FixtureCanvas'));
interface FixturePackage {model:AnatomyModelManifest;chunks:(AnatomyChunk&{compressed:boolean})[]}
export default function FixtureInspector(){
 const [catalog,setCatalog]=useState<FixturePackage|null>(null),[active,setActive]=useState(true);
 const [lod,setLod]=useState(0),[compressed,setCompressed]=useState(true),[hidden,setHidden]=useState<Set<string>>(new Set());
 const [selected,setSelected]=useState<string|null>(null),[batches,setBatches]=useState<readonly SemanticBatch[]>([]);
 const [notice,setNotice]=useState('Loading fixture manifest'),[spatialNotice,setSpatialNotice]=useState<string|null>(null);
 const [stats,setStats]=useState({geometries:0,materials:0,decodedGeometryBytes:0,decodeMs:0}),[anchor,setAnchor]=useState<[number,number,number]|null>(null);
 const [gpuGeometries,setGpuGeometries]=useState(0);
 const [loadedKey,setLoadedKey]=useState<string|null>(null);
 const owner=useRef<AnatomyModelSession|null>(null),hiddenRef=useRef(hidden);hiddenRef.current=hidden;
 useEffect(()=>{const controller=new AbortController();
  void fetch('/anatomy/fixture/manifest.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Fixture manifest unavailable');return r.json();}).then((data:FixturePackage)=>{
   if(controller.signal.aborted)return;const registry=new AnatomyRegistry();registry.register(data.model);setCatalog(data);setNotice('Fixture manifest loaded');
  }).catch(e=>{if(!controller.signal.aborted)setNotice(String(e));});return ()=>controller.abort();
 },[]);
 useEffect(()=>{
  const session=new AnatomyModelSession();owner.current=session;let cancelled=false;
  setBatches([]);setStats(session.stats);setLoadedKey(null);
  if(!catalog||!active){setNotice(active?'Loading fixture manifest':'No reference loaded');return ()=>{session.close();if(owner.current===session)owner.current=null;};}
  setNotice('Loading reference geometry');
  const ids=new Set(catalog.model.structures.map(s=>s.id)),visible=new Set([...ids].filter(id=>!hiddenRef.current.has(id)));
  void session.load(catalog.chunks.filter(c=>c.lod===lod&&c.compressed===compressed),ids,visible).then(()=>{
   if(cancelled)return;session.setVisible(new Set([...ids].filter(id=>!hiddenRef.current.has(id))));setBatches([...session.batches]);setStats(session.stats);setNotice('Reference ready');setLoadedKey(`${lod}-${compressed?'meshopt':'plain'}`);
  }).catch(e=>{if(!cancelled){setNotice(`Reference unavailable: ${String(e)}`);setBatches([]);setStats(session.stats);}});
  return ()=>{cancelled=true;session.close();if(owner.current===session)owner.current=null;};
 },[catalog,active,lod,compressed]);
 const select=(id:string,point?:[number,number,number])=>{setSelected(id);setAnchor(point??null);};
 const toggle=(id:string)=>{const next=new Set(hidden);if(next.has(id))next.delete(id);else next.add(id);setHidden(next);
  if(next.has(selected??'')){setSelected(null);setAnchor(null);}
  if(catalog&&owner.current){try{owner.current.setVisible(new Set(catalog.model.structures.filter(s=>!next.has(s.id)).map(s=>s.id)));setBatches([...owner.current.batches]);setStats(owner.current.stats);}catch(e){setNotice(String(e));}}
 };
 return <main className="min-h-screen bg-black p-5 text-slate-100" aria-label="Anatomy pipeline laboratory">
  <a href="/" className="text-cyan-200 underline">Return to cockpit</a>
  <h1 className="my-3 text-2xl">Reference anatomy pipeline laboratory</h1>
  <p className="mb-4 text-amber-200">Synthetic calibration solids only. No human anatomy, clinical observation or sex-specific geometry is represented.</p>
  <div className="flex flex-wrap gap-4">
   <label className="flex min-w-0 flex-wrap items-center gap-2">Reference model <select aria-label="Reference model" value={active?'fixture':'none'} onChange={e=>{setActive(e.target.value==='fixture');setSelected(null);setAnchor(null);}} className="max-w-full border p-2">
    <option value="fixture">Synthetic calibration fixture</option><option value="none">No reference</option></select></label>
   <label>Detail <select aria-label="Reference detail" value={lod} onChange={e=>{setLod(Number(e.target.value));setAnchor(null);}} className="max-w-full border p-2"><option value={0}>Full fixture</option><option value={1}>Reduced fixture</option></select></label>
   <label className="p-2"><input type="checkbox" checked={compressed} onChange={e=>setCompressed(e.target.checked)} aria-label="Use local Meshopt"/> Local Meshopt</label>
  </div>
  <p role="status" className="my-3" data-anatomy-status data-loaded-key={loadedKey??'none'}>{notice}</p>
  <div className="grid gap-4 md:grid-cols-[260px_1fr]">
   <section aria-label="Reference structures" className="space-y-3">{catalog?.model.structures.map(s=><div key={s.id} className="rounded border p-3">
    <button className="min-h-11 text-cyan-200" onClick={()=>select(s.id)} aria-pressed={selected===s.id} disabled={!active||hidden.has(s.id)}>{s.label}</button>
    <label className="block"><input type="checkbox" checked={!hidden.has(s.id)} onChange={()=>toggle(s.id)} aria-label={`Show ${s.label}`}/> Visible</label>
    <p className="text-xs">Clinical data: unbound. Source: synthetic fixture.</p>
   </div>)}</section>
   <section className="rounded border" aria-label="Optional reference viewport">
    {spatialNotice?<p role="status" className="p-3 text-amber-200">{spatialNotice}</p>:null}
    <WebGlErrorBoundary fallback={()=> <p role="status">3D unavailable; structure controls remain usable.</p>}><Suspense fallback={<p>Loading optional 3D</p>}>
     <Canvas batches={batches} onSelect={select} onUnavailable={setSpatialNotice} onMemory={setGpuGeometries}/>
    </Suspense></WebGlErrorBoundary>
   </section>
  </div>
  <section className="my-4 rounded border p-3" aria-label="Reference selection"><p data-selected-structure>Selected: {selected??'none'}</p>
   <p>Reference identity: {catalog?.model.id??'unavailable'}. No change to physiological profile.</p>
   {anchor?<p>Model-local anchor (m): {anchor.map(x=>x.toFixed(4)).join(', ')}; fixture revision only.</p>:null}
  </section>
  <output data-gpu-geometries={gpuGeometries}>GPU geometry objects: {gpuGeometries}</output>
  <output data-owned-geometries={stats.geometries} data-owned-materials={stats.materials} data-owned-bytes={stats.decodedGeometryBytes} className="block text-sm">Owned geometry: {stats.geometries}; materials: {stats.materials}; decoded attributes/index bytes: {stats.decodedGeometryBytes}; decode: {stats.decodeMs.toFixed(2)} ms.</output>
  <a className="mt-4 block text-cyan-200 underline" href="/anatomy/fixture/ATTRIBUTION.md">Fixture credits and adaptations</a>
 </main>;
}
