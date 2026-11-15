import {useReducedMotionPreference} from '../lib/useReducedMotion';
import type {ReactNode} from 'react';
import type {HypergraphSpatialSummary} from '../types/telemetry';
import type {InjuryMarker} from '../types/injury';
import type {LazyAnatomicalGlbToggles} from '../stage3d/BiodigitalTwinStage';
import {CANONICAL_REGIONS,projectHypergraphTo3D} from '../modules/body-3d-heatmap/uberonSpatialMapping';
import {useWorkbenchStore} from '../stores/workbenchStore';
export interface SpatialStageHudProps {
 viewport?:ReactNode;lazyGlbLayers:LazyAnatomicalGlbToggles;onToggleGlbLayer:(layer:keyof LazyAnatomicalGlbToggles)=>void;
 hypergraphSummary?:HypergraphSpatialSummary|null;injuryMarkers?:readonly InjuryMarker[];onOpenOpticalScanner?:()=>void;
 simulated?:boolean;sourceLabel?:string;onSexChange?:(sex:'MALE'|'FEMALE')=>void;className?:string;
}
export function SpatialStageHud({viewport,lazyGlbLayers,onToggleGlbLayer,hypergraphSummary,injuryMarkers=[],onOpenOpticalScanner,sourceLabel,onSexChange,className=''}:SpatialStageHudProps){
 const selected=useWorkbenchStore(s=>s.selectedUberonRegion),select=useWorkbenchStore(s=>s.selectUberonRegion),sex=useWorkbenchStore(s=>s.twinSex),setSex=useWorkbenchStore(s=>s.setTwinSex);
 const rotate=useWorkbenchStore(s=>s.twinAutoRotate),toggleRotate=useWorkbenchStore(s=>s.toggleTwinAutoRotate),mode=useWorkbenchStore(s=>s.displayMode);
 const reduced=useReducedMotionPreference();
 const projected=projectHypergraphTo3D(hypergraphSummary),active=CANONICAL_REGIONS.find(r=>r.region===selected);
 return <div className={`spatial-reference ${className}`}>
  <header className="stage-description"><h2>Body context</h2><p>Illustrative geometry · {sourceLabel}. Profile controls do not load the separate source atlas.</p><a href="/anatomy" target="_blank" rel="noreferrer" className="phase8-link">Explore source anatomy atlas</a></header>
  <div className="stage-hotspots" role="group" aria-label="Anatomical problem hotspots on 3D body">{CANONICAL_REGIONS.map((meta,i)=>{
   const node=projected.nodesByRegion[meta.region];return <button key={meta.region} className="phase8-button" aria-pressed={selected===meta.region} onClick={()=>select(selected===meta.region?null:meta.region)}><span>{i+1}. {meta.label}</span><span className="stage-observation">{node.observed?'Context supplied':'Unavailable'}</span></button>;
  })}</div>
  {viewport}
  <div className="stage-selection"><p>{active?`Selected: ${active.label}`:'Full body reference'}</p><button className="phase8-button" onClick={()=>select(null)}>Reset body view</button></div>
  <div className="stage-controls" role="toolbar" aria-label="3D Biodigital Twin layer and anthropometric controls" onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(e.target as HTMLButtonElement);if(index<0)return;e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.focus();}}>
   <button className="phase8-button" disabled={mode!=='presentation'||reduced} aria-pressed={mode==='presentation'&&rotate&&!selected&&!reduced} onClick={()=>{if(selected){select(null);if(!rotate)toggleRotate();}else toggleRotate();}}>{reduced?'Rotation off — reduced motion':mode!=='presentation'?'Rotation paused in operational view':selected?'Return to rotating body':rotate?'Pause rotation':'Enable rotation'}</button>
   {([{key:'skeletal',label:'Skeletal layer'},{key:'vascular',label:'Vascular layer'},{key:'visceral',label:'Visceral layer'}] as const).map(item=><button key={item.key} className="phase8-button" aria-pressed={lazyGlbLayers[item.key]} onClick={()=>onToggleGlbLayer(item.key)}>{item.label}</button>)}
   {(['MALE','FEMALE'] as const).map(value=><button key={value} className="phase8-button" aria-pressed={sex===value} onClick={()=>{setSex(value);onSexChange?.(value);}}>{value==='MALE'?'Male profile':'Female profile'}</button>)}
  </div>
  {onOpenOpticalScanner?<button className="phase8-button" onClick={onOpenOpticalScanner}>Add local optical observation</button>:null}
  {injuryMarkers.length?<ul className="stage-notes">{injuryMarkers.map(m=><li key={m.id}>{m.title} · {m.severity}</li>)}</ul>:null}
  <details className="stage-details"><summary>Reference and spatial diagnostics</summary><p>Illustrative profile: {sex}. Reference geometry is not an acquired patient scan. Layer geometry remains the existing generic reference.</p>{CANONICAL_REGIONS.map(meta=>{const n=projected.nodesByRegion[meta.region];return <p key={meta.region}>{meta.label} · {meta.uberonCurie} · {n.observed?`local index ${n.localIntensity.toFixed(3)}, propagated index ${n.propagatedIntensity.toFixed(3)}`:'Not observed'}</p>;})}</details>
 </div>;
}
