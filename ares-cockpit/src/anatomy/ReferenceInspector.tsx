import {lazy,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {AnatomyModelSession,type GeometryIssue} from './modelSession';
import type {SemanticBatch,SemanticHit} from './semanticGeometry';
import type {AnatomyAnnotation} from './contracts';
import {NOTE_KEY,readReferenceNotes,registerReferenceCatalog,type ReferenceCatalog} from './referenceCatalog';
import {useTelemetry} from '../lib/useTelemetry';
import {DEFAULT_WHATIF} from '../lib/scenario';
import {buildClinicalViewModel,type ClinicalMetric} from '../lib/clinicalViewModel';
import {ClinicalDataNotice} from '../workbench/ClinicalDataNotice';
import {WebGlErrorBoundary} from '../modules/body-3d-heatmap/webglErrorBoundary';
const Canvas=lazy(()=>import('./FixtureCanvas'));
const button='min-h-11 rounded border border-slate-600 px-3 py-2 text-left text-cyan-100 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-cyan-300';
export default function ReferenceInspector(){
 const [referenceModel,setReferenceModel]=useState('existing');
 const [catalog,setCatalog]=useState<ReferenceCatalog|null>(null),[systemId,setSystemId]=useState('cardiovascular');
 const [selected,setSelected]=useState<string|null>(null),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 const [visible,setVisible]=useState<Set<string>>(new Set()),[batches,setBatches]=useState<readonly SemanticBatch[]>([]);
 const [issues,setIssues]=useState<readonly GeometryIssue[]>([]),[loaded,setLoaded]=useState<ReadonlySet<string>>(new Set());
 const [loadedSystem,setLoadedSystem]=useState<string|null>(null);
 const [notice,setNotice]=useState('Loading reference catalog'),[ready,setReady]=useState(false),[spatialNotice,setSpatialNotice]=useState<string|null>(null);
 const [stats,setStats]=useState({geometries:0,materials:0,decodedGeometryBytes:0}),[gpu,setGpu]=useState(0);
 const [anchor,setAnchor]=useState<SemanticHit|null>(null),[text,setText]=useState(''),[notes,setNotes]=useState<AnatomyAnnotation[]>([]),[noteStatus,setNoteStatus]=useState('');
 const owner=useRef<AnatomyModelSession|null>(null);
 const {packet,status}=useTelemetry(DEFAULT_WHATIF,null,0,false);
 const clinical=useMemo(()=>buildClinicalViewModel(packet),[packet]);
 const registry=useMemo(()=>catalog?registerReferenceCatalog(catalog):null,[catalog]);
 const system=catalog?.systems.find(s=>s.id===systemId);
 const structures=useMemo(()=>catalog?.model.structures.filter(s=>s.meshes.some(r=>r.assetId===systemId))??[],[catalog,systemId]);
 const structure=structures.find(s=>s.id===selected);
 const filtered=useMemo(()=>structures.filter(s=>`${s.label} ${s.id}`.toLowerCase().includes(query.toLowerCase())),[structures,query]);
 const noteKey=catalog?`${NOTE_KEY}:${catalog.model.revisionSha256}`:null;
 useEffect(()=>{const controller=new AbortController();void fetch(referenceModel==='existing'?'/anatomy/reference-catalog.json':'/anatomy/female-hra/catalog.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Catalog unavailable');return r.json();}).then((data:ReferenceCatalog)=>{
  if(controller.signal.aborted)return;registerReferenceCatalog(data);setCatalog(data);
 }).catch(e=>{if(!controller.signal.aborted)setNotice(String(e));});return ()=>controller.abort();},[referenceModel]);
 useEffect(()=>{if(!registry||!catalog||!noteKey)return;
  try{setNotes(readReferenceNotes(localStorage.getItem(noteKey),registry,catalog.model.id));setNoteStatus('Notes stay in this browser, bound to this exact reference revision.');}
  catch(e){setNotes([]);setNoteStatus(`Stored notes unavailable: ${String(e)}`);}
 },[registry,catalog,noteKey]);
 useEffect(()=>{
  const session=new AnatomyModelSession();owner.current=session;let cancelled=false;
  setBatches([]);setStats(session.stats);setReady(false);setLoadedSystem(null);setIssues([]);setLoaded(new Set());setSelected(null);setAnchor(null);setQuery('');setPage(0);
  if(!system?.chunk){setVisible(new Set());setNotice(catalog?(system?'Source geometry unavailable for this system; no substitute loaded.':'No reference loaded'):'Loading reference catalog');return ()=>{session.close();if(owner.current===session)owner.current=null;};}
  const ids=new Set(system.chunk.sourceNodes?.map(n=>n.structureId)),initial=new Set(system.defaultIds);setVisible(initial);setNotice('Loading local reference geometry');
  void session.load([system.chunk],ids,initial).then(()=>{
   if(cancelled)return;const allIssues=[...session.issues,...(catalog?.sourceIssues?.filter(i=>i.layer===system.id).map(i=>({structureId:i.structureId,nodeId:`source-node:${i.sourceNodeIndex}`,reason:`${i.label}: ${i.reason}`}))??[])];setBatches([...session.batches]);setStats(session.stats);setIssues(allIssues);setLoaded(session.loadedIds);setLoadedSystem(system.id);setReady(true);
   setNotice(`Reference ready: ${session.loadedIds.size} source nodes with usable geometry; ${new Set(allIssues.map(i=>i.structureId)).size} nodes have excluded or invalid parts.`);
  }).catch(e=>{if(!cancelled){setNotice(`Reference unavailable: ${String(e)}`);setStats(session.stats);}});
  return ()=>{cancelled=true;session.close();if(owner.current===session)owner.current=null;};
 },[system,catalog]);
 const show=(ids:ReadonlySet<string>)=>{
  if(!ready||!owner.current)return;
  try{owner.current.setVisible(ids);setVisible(new Set(ids));setBatches([...owner.current.batches]);setStats(owner.current.stats);setNotice('Reference visibility updated');setAnchor(null);return true;}
  catch(e){setNotice(`${String(e)}. Previous view retained; isolate a smaller selection.`);return false;}
 };
 const select=(id:string,hit:SemanticHit|null=null)=>{setSelected(id);setAnchor(hit);setText('');};
 const save=()=>{
  if(!catalog||!registry||!noteKey||!structure||!anchor?.assetSha256||!anchor.nodeId||!text.trim())return;
  if(notes.length>=500){setNoteStatus('Note limit reached (500); delete an existing note first.');return;}
  const note:AnatomyAnnotation={id:crypto.randomUUID(),modelId:catalog.model.id,modelRevision:catalog.model.revisionSha256,structureId:structure.id,text:text.trim(),anchor:{assetSha256:anchor.assetSha256,nodeId:anchor.nodeId,positionM:anchor.point.toArray() as [number,number,number]}};
  if(registry.annotationsForModel([note],catalog.model.id).length!==1){setNoteStatus('Anchor rejected: reference identity mismatch.');return;}
  const next=[...notes,note];try{localStorage.setItem(noteKey,JSON.stringify(next));setNotes(next);setText('');setNoteStatus('Reference note saved locally.');}catch(e){setNoteStatus(`Note not saved: ${String(e)}`);}
 };
 const removeNote=(id:string)=>{if(!noteKey)return;const next=notes.filter(n=>n.id!==id);try{localStorage.setItem(noteKey,JSON.stringify(next));setNotes(next);setNoteStatus('Reference note deleted.');}catch(e){setNoteStatus(`Deletion not saved: ${String(e)}`);}};
 const clinicalKeys=[...new Set([...(structure?.clinicalBindings.flatMap(b=>b.channels)??[]),...(system?.targets.filter(t=>t.nodeIds.includes(selected??'')).flatMap(t=>t.channels)??[])])];
 const region=structure?.clinicalBindings[0]?.backendRegion;
 const selectedIssues=issues.filter(i=>i.structureId===selected);
 return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8" aria-label="Reference anatomy atlas">
  <a href="/" className="text-cyan-200 underline">Return to cockpit</a>
  <header className="my-5 max-w-4xl"><p className="font-mono text-sm uppercase tracking-widest text-cyan-200">ARES / Reference library</p><h1 className="my-2 text-3xl">Explore the anatomy reference</h1>
   <p className="text-slate-300">{referenceModel==='existing'?'Existing generic male atlas with mixed source contributions.':'Female HRA partial reference; source releases kept in separate frames. Mandatory structures remain missing.'} Anatomy and registration remain unreviewed. This reference does not represent the monitored person or change their physiological profile.</p>
  </header>
  <label className="block">Reference model <select aria-label="Reference model" value={referenceModel} onChange={e=>{setReady(false);setCatalog(null);setSelected(null);setAnchor(null);setNotes([]);setText('');setSystemId('cardiovascular');setReferenceModel(e.target.value);}} className="my-2 block min-h-11 w-full max-w-full rounded border bg-slate-900 p-2"><option value="existing">Existing generic male reference</option><option value="female-hra">HRA female — partial, unreviewed reference</option></select></label>
  {catalog?.model.referenceSex==='FEMALE'?<section aria-label="Female reference limitations" className="mb-4 rounded border border-amber-700 p-3 text-amber-200"><p>Partial HRA female reference. Contributor-specific donor identity and sex are not individually established; nervous includes Allen-labelled contributions. No registered composite, male completion or individualized scan.</p><details><summary className="min-h-11 cursor-pointer">Missing mandatory coverage</summary><ul>{catalog.model.structures.filter(s=>s.coverage==='MISSING').map(s=><li key={s.id}>{s.label}: {s.unavailableReason}</li>)}</ul></details><a href="/anatomy/female-hra/review.json" className="inline-block min-h-11 underline">Source provenance and review status</a></section>:null}
  <label className="block">Anatomical system <select aria-label="Anatomical system" value={systemId} onChange={e=>{setReady(false);setSelected(null);setAnchor(null);setSystemId(e.target.value);}} className="my-2 block min-h-11 w-full max-w-full rounded border bg-slate-900 p-2">
   {catalog?.systems.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}<option value="none">No reference (unload)</option></select></label>
  <p role="status" data-reference-status data-reference-model={catalog?.model.id??'none'} data-ready={ready} data-loaded-system={ready?loadedSystem:'none'} className="my-3 text-amber-200">{notice}</p>
  <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
   <section aria-label="Source structure search" className="min-w-0 rounded border border-slate-700 p-4">
    <label className="block">Search exact source labels<input type="search" aria-label="Search source structures" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} className="my-2 min-h-11 w-full rounded border bg-slate-900 p-2"/></label>
    <p className="mb-3 text-sm text-slate-300">{filtered.length} source nodes. Keyboard selection shows details; isolate to reveal covered structures.</p>
    <div className="max-h-[420px] space-y-2 overflow-y-auto">{filtered.slice(page*40,(page+1)*40).map(s=><button key={s.id} className={`${button} w-full break-words ${selected===s.id?'bg-cyan-950':''}`} aria-pressed={selected===s.id} onClick={()=>select(s.id)} data-structure-id={s.id} data-geometry-loaded={loaded.has(s.id)}>
     {s.label}<span className="block text-xs text-slate-300">{ready?(loaded.has(s.id)?(visible.has(s.id)?'Visible':'Hidden'):'Geometry unavailable'):'Not loaded'}{issues.some(i=>i.structureId===s.id)?' / source issue':''}</span></button>)}</div>
    <div className="mt-3 flex items-center gap-2"><button className={button} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page+1} / {Math.max(1,Math.ceil(filtered.length/40))}</span><button className={button} disabled={(page+1)*40>=filtered.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>
   </section>
   <section className="min-w-0 rounded border border-slate-700 p-3" aria-label="Reference geometry">
    <div className="mb-3 flex flex-wrap gap-2"><button className={button} disabled={!ready} onClick={()=>show(new Set(system?.chunk?.sourceNodes?.filter(n=>!n.excluded).map(n=>n.structureId)))}>Show all</button>
     <button className={button} disabled={!ready} onClick={()=>show(new Set(system?.defaultIds))}>Default view</button><button className={button} disabled={!ready} onClick={()=>show(new Set())}>Hide all</button></div>
    {systemId==='muscular'&&referenceModel==='existing'?<p className="text-sm text-amber-200">The default view shows the soleus pair to stay within the geometry budget. Search and isolate other muscles individually.</p>:null}
    {spatialNotice?<p role="status" className="text-amber-200">{spatialNotice}</p>:null}
    <WebGlErrorBoundary fallback={()=> <p>3D unavailable; source search remains available.</p>}><Suspense fallback={<p>Loading optional 3D</p>}><Canvas batches={batches} autoFrame keyboardPicking label="Existing anatomy reference" selectedId={selected} onSelect={(id,_point,hit)=>select(id,hit)} onUnavailable={setSpatialNotice} onMemory={setGpu}/></Suspense></WebGlErrorBoundary>
    <p className="text-sm text-amber-200" data-reference-frame>{system?.coordinateFrame}</p>
    <p className="text-sm text-slate-300">Drag to rotate; scroll or pinch to zoom; tap a visible surface to select an exact source node. Keyboard: focus the viewport, use arrows to pan (Control + arrows to rotate), then Enter to pick a real surface under the center cross. Coordinates use the glTF reference frame, not patient measurements.</p>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Required structure groups">{system?.targets.map(t=><button className={button} key={t.id} disabled={!ready||!t.nodeIds.length} onClick={()=>{if(show(new Set(t.nodeIds)))select(t.nodeIds.find(id=>loaded.has(id))??t.nodeIds[0]);}}>{t.label}{!t.nodeIds.length?' — missing':''}</button>)}</div>
    <output className="mt-4 block text-xs text-slate-300" data-owned-bytes={stats.decodedGeometryBytes} data-owned-geometries={stats.geometries} data-gpu-geometries={gpu}>Owned geometry: {(stats.decodedGeometryBytes/1e6).toFixed(2)} MB / 64 MB; {stats.geometries} geometry objects; {stats.materials} materials; GPU geometry objects: {gpu}. This is geometry accounting, not total browser memory.</output>
   </section>
   <section aria-label="Structure details" className="min-w-0 space-y-4 rounded border border-slate-700 p-4">
    <h2 className="text-xl" data-selected-source>{structure?.label??'Select a source structure'}</h2>
    {structure?<><p className="break-all text-xs text-slate-300">{structure.id}<br/>{structure.sourceConceptId}</p><p>Reference status: unverified. Laterality: {structure.laterality}. Ontology: not independently reviewed.</p>
     <div className="flex flex-wrap gap-2"><button className={button} disabled={!ready||!loaded.has(structure.id)} onClick={()=>show(new Set([structure.id]))}>Isolate selection</button><button className={button} disabled={!ready||!visible.has(structure.id)} onClick={()=>show(new Set([...visible].filter(id=>id!==structure.id)))}>Hide selection</button></div>
     {selectedIssues.map((i,n)=><p className="text-amber-200" key={n}>Source part unavailable: {i.reason}. Other valid primitives, if any, remain selectable.</p>)}
     <h3 className="border-t border-slate-700 pt-3">Associated clinical context</h3><ClinicalDataNotice packet={packet}/><p className="text-sm">{status.isStale?'STALE TELEMETRY — do not interpret as current.':status.heldSample?'Held telemetry sample.':'Source timestamp: '+new Date(packet.timestamp_ms).toISOString()}</p>
     {clinicalKeys.map(key=>{const metric=clinical[key as keyof typeof clinical] as ClinicalMetric|undefined;return <p key={key} data-reference-clinical={key} data-source-record={metric&&typeof metric==='object'&&'sourceRecordId' in metric?metric.sourceRecordId:undefined} data-clinical-availability={metric&&typeof metric==='object'&&'value' in metric&&metric.value!==null?'AVAILABLE':'UNAVAILABLE'}>{key}: {metric&&typeof metric==='object'&&'value' in metric&&metric.value!==null?`${metric.value.toFixed(2)} ${metric.unit} (${metric.provenance})`:'Unavailable'}</p>;})}
     {!clinicalKeys.length?<p>No supported numeric channels bound to this source node.</p>:null}
     <p className="text-sm text-slate-300">Source-group context only (including descendant branches): these values are not measurements of the selected mesh.</p>
     {region?<a className="inline-block min-h-11 text-cyan-200 underline" href={`/?phase=EVALUATE&anatomyRegion=${encodeURIComponent(region)}`}>Open supported region in cockpit</a>:<p>No backend region binding. Reference selection stays local.</p>}
     <h3 className="border-t border-slate-700 pt-3">Local reference notes</h3>
     <p className="text-sm">{anchor?`Surface anchor: ${anchor.point.toArray().map(x=>x.toFixed(4)).join(', ')} in glTF model metres (not clinically calibrated).`:'Pick a visible surface by touch, pointer or Enter in the viewport to place a coordinate anchor. List selection alone does not invent a location.'}</p>
     <label>Reference note<textarea aria-label="Reference note" maxLength={2000} value={text} onChange={e=>setText(e.target.value)} className="my-2 min-h-24 w-full rounded border bg-slate-900 p-2"/></label><button className={button} disabled={!anchor||!text.trim()} onClick={save}>Save local note</button>
     {notes.filter(n=>n.structureId===selected).map(n=><article key={n.id} className="break-words rounded border p-2"><p className="whitespace-pre-wrap">{n.text}</p><p className="text-xs">{n.anchor?.nodeId}: {n.anchor?.positionM.map(x=>x.toFixed(4)).join(', ')}</p><button className={button} onClick={()=>removeNote(n.id)}>Delete note</button></article>)}</>:null}
    <p role="status" className="text-sm text-slate-300">{noteStatus}</p>
   </section>
  </div>
  <footer className="mt-6 max-w-4xl text-sm text-slate-300"><p>{system?.licenseReview}</p><p>Optic sheath coverage remains missing. Eye and optic nerve meshes do not establish ONSD sheath geometry. {referenceModel==='existing'?'Female-labelled source supplements are excluded, not substituted.':'Source releases are not superimposed. Missing female counterparts are not borrowed from male anatomy.'}</p>
   <a className="inline-block min-h-11 text-cyan-200 underline" href={referenceModel==='existing'?'/anatomy/ATTRIBUTION.md':'/anatomy/female-hra/ATTRIBUTION.md'}>Original source credits and license caveats</a>
   {issues.length?<details><summary className="min-h-11 cursor-pointer">Inspect {issues.length} source-part issues</summary><ul className="max-h-60 overflow-auto">{issues.map((i,n)=><li key={n}>{i.structureId} / {i.nodeId}: {i.reason}</li>)}</ul></details>:null}
  </footer>
 </main>;
}
