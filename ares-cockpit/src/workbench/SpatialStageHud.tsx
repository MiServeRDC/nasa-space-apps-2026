import {useEffect,useRef,type ReactNode} from 'react';
import gsap from 'gsap';
import {useReducedMotionPreference} from '../lib/useReducedMotion';
import {SEX_PROFILES} from '../lib/scenario';
import type {CrewBiologicalProfile,HypergraphSpatialSummary} from '../types/telemetry';
import type {InjuryMarker} from '../types/injury';
import type {LazyAnatomicalGlbToggles} from '../stage3d/BiodigitalTwinStage';
import {CANONICAL_REGIONS,projectHypergraphTo3D} from '../modules/body-3d-heatmap/uberonSpatialMapping';
import {useWorkbenchStore} from '../stores/workbenchStore';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from '../components/ui/tooltip';

export type StageDisplayMode = 'operational' | 'presentation';

export interface SpatialStageHudProps {
 viewport?:ReactNode;lazyGlbLayers:LazyAnatomicalGlbToggles;onToggleGlbLayer:(layer:keyof LazyAnatomicalGlbToggles)=>void;
 hypergraphSummary?:HypergraphSpatialSummary|null;injuryMarkers?:readonly InjuryMarker[];onOpenOpticalScanner?:()=>void;
 simulated?:boolean;sourceLabel?:string;onSexChange?:(sex:'MALE'|'FEMALE')=>void;
 crewProfile?:CrewBiologicalProfile|null;
 displayMode?:StageDisplayMode;onDisplayModeChange?:(mode:StageDisplayMode)=>void;className?:string;
}

const hudPillSurface='border border-[var(--color-border-active)] bg-[oklch(0.11_0.008_250/0.86)]';

export function SpatialStageHud({viewport,lazyGlbLayers,onToggleGlbLayer,hypergraphSummary,injuryMarkers=[],onOpenOpticalScanner,simulated=false,sourceLabel,onSexChange,crewProfile=null,displayMode:displayModeProp,onDisplayModeChange,className=''}:SpatialStageHudProps){
 const selected=useWorkbenchStore(s=>s.selectedUberonRegion),select=useWorkbenchStore(s=>s.selectUberonRegion),sex=useWorkbenchStore(s=>s.twinSex),setSex=useWorkbenchStore(s=>s.setTwinSex);
 const rotate=useWorkbenchStore(s=>s.twinAutoRotate),toggleRotate=useWorkbenchStore(s=>s.toggleTwinAutoRotate);
 const storeMode=useWorkbenchStore(s=>s.displayMode),setStoreMode=useWorkbenchStore(s=>s.setDisplayMode);
 const mode=displayModeProp??storeMode;
 const handleModeChange=(next:StageDisplayMode)=>{if(onDisplayModeChange)onDisplayModeChange(next);else setStoreMode(next);};
 const reduced=useReducedMotionPreference();
 const projected=projectHypergraphTo3D(hypergraphSummary),active=CANONICAL_REGIONS.find(r=>r.region===selected);
 const spotlightPillRef=useRef<HTMLDivElement|null>(null);
 const sexModifiers=SEX_PROFILES[sex];
 const rotateTitle=reduced?'Rotation off — reduced motion':mode!=='presentation'?'Rotation paused in operational view':selected?'Return to rotating body':rotate?'Pause rotation':'Enable rotation';
 const shortRegion=(label:string)=>label.split(/[\s/]+/)[0];

 useEffect(()=>{
  const el=spotlightPillRef.current;
  if(!el||typeof window==='undefined')return;
  if(reduced){
   gsap.set(el,{opacity:1,scale:1});
   return;
  }
  const ctx=gsap.context(()=>{
   gsap.fromTo(el,{opacity:0.72,scale:0.97},{opacity:1,scale:1,duration:0.2,ease:'power2.out',clearProps:'transform,opacity'});
  },spotlightPillRef);
  return ()=>ctx.revert();
 },[reduced,selected]);

 return (
  <TooltipProvider delayDuration={180}>
   <div className={`spatial-reference relative h-full w-full min-h-0 overflow-hidden rounded-[var(--radius-shell)] border border-[var(--color-border)] bg-[var(--color-void)] ${className}`}>
    {viewport}

    {/* Top Floating HUD Strip: only container using .hud-glass (keeps global blur budget <= 4) */}
    <header
     className="pointer-events-none absolute inset-x-2.5 top-2.5 z-[35] flex flex-wrap items-center justify-between gap-2"
     onPointerDown={e=>e.stopPropagation()}
    >
     <div className="hud-glass pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-border-active)] px-2.5 py-1 font-mono text-[10px]">
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${simulated?'bg-[var(--color-status-caution)]':'bg-[var(--color-accent-spatial)]'}`} aria-hidden="true" />
      <Tooltip>
       <TooltipTrigger asChild>
        <h2 className="cursor-help whitespace-nowrap font-semibold tracking-wider text-[var(--color-ink-display)]">
         BODY CONTEXT
        </h2>
       </TooltipTrigger>
       <TooltipContent>
        <p className="max-w-[260px] font-mono text-[10px]">
         Illustrative geometry · {sourceLabel??'Recorded provenance'}. Profile controls do not load the separate source atlas.
        </p>
       </TooltipContent>
      </Tooltip>

      <Tooltip>
       <TooltipTrigger asChild>
        <a
         href="/anatomy"
         target="_blank"
         rel="noreferrer"
         className="ares-interactive whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-surface-l2)] px-2 py-0.5 text-[9.5px] text-[var(--color-accent-spatial)]"
        >
         Source Atlas
        </a>
       </TooltipTrigger>
       <TooltipContent>Explore source anatomy atlas (/anatomy)</TooltipContent>
      </Tooltip>

      {injuryMarkers.length?(
       <Tooltip>
        <TooltipTrigger asChild>
         <span className="cursor-help whitespace-nowrap rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-rose-200">
          {injuryMarkers.length} MARKER{injuryMarkers.length>1?'S':''}
         </span>
        </TooltipTrigger>
        <TooltipContent>
         <ul className="stage-notes space-y-0.5 font-mono text-[10px]">
          {injuryMarkers.map(m=><li key={m.id}>{m.title} · {m.severity}</li>)}
         </ul>
        </TooltipContent>
       </Tooltip>
      ):null}
     </div>

     <div className="pointer-events-auto flex items-center gap-1.5">
      <Tooltip>
       <TooltipTrigger asChild>
        <div
         className={`display-mode-controls inline-flex items-center gap-0.5 rounded-full p-0.5 font-mono text-[10px] ${hudPillSurface}`}
         role="group"
         aria-label="Workbench display mode"
        >
         <button
          type="button"
          className={`ares-interactive rounded-full px-2.5 py-0.5 text-[10px] font-medium ${mode==='operational'?'border border-cyan-400/60 bg-cyan-400/15 text-cyan-200':'border border-transparent text-[var(--color-ink-meta)]'}`}
          aria-pressed={mode==='operational'}
          onClick={()=>handleModeChange('operational')}
         >
          Operational
         </button>
         <button
          type="button"
          className={`ares-interactive rounded-full px-2.5 py-0.5 text-[10px] font-medium ${mode==='presentation'?'border border-cyan-400/60 bg-cyan-400/15 text-cyan-200':'border border-transparent text-[var(--color-ink-meta)]'}`}
          aria-pressed={mode==='presentation'}
          onClick={()=>handleModeChange('presentation')}
         >
          Presentation
         </button>
        </div>
       </TooltipTrigger>
       <TooltipContent>Same telemetry and action gates in both views.</TooltipContent>
      </Tooltip>
     </div>
    </header>

    {/* Bottom Floating HUD Corner Pills (0 backdrop-filter, solid translucent OLED surface) */}
    <footer
     className="pointer-events-none absolute inset-x-2.5 bottom-2.5 z-[35] flex flex-wrap items-end justify-between gap-2 lg:bottom-[64px]"
     onPointerDown={e=>e.stopPropagation()}
    >
     {/* Bottom-Left: Anatomical UBERON Hotspots + Selection Reset */}
     <div className="pointer-events-auto flex max-w-full flex-col items-start gap-1 lg:max-w-[265px]">
      <div ref={spotlightPillRef} className={`stage-selection flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] ${hudPillSurface}`}>
       <span className="text-[var(--color-ink-body)]">
        {active?`Selected: ${active.label}`:'Full body'}
       </span>
       {active?(
        <button type="button" className="phase8-button !min-h-0 !rounded-full !px-1.5 !py-0.5 !text-[9px]" onClick={()=>select(null)}>
         Reset body view
        </button>
       ):null}
       {onOpenOpticalScanner?(
        <button type="button" className="phase8-button !min-h-0 !rounded-full !px-1.5 !py-0.5 !text-[9px]" onClick={onOpenOpticalScanner}>
         Optical scan
        </button>
       ):null}
      </div>

      <div className={`stage-hotspots flex flex-wrap items-center gap-0.5 rounded-[var(--radius-md)] p-1 ${hudPillSurface}`} role="group" aria-label="Anatomical problem hotspots on 3D body">
       {CANONICAL_REGIONS.map((meta,i)=>{
        const node=projected.nodesByRegion[meta.region];
        return (
         <Tooltip key={meta.region}>
          <TooltipTrigger asChild>
           <button
            type="button"
            className={`ares-interactive inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${
             selected===meta.region
              ?'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
              :'border-transparent text-[var(--color-ink-body)] hover:border-[var(--color-border)]'
            }`}
            aria-pressed={selected===meta.region}
            aria-label={`${i+1}. ${meta.label} (${node.observed?'Context supplied':'Unavailable'})`}
            onClick={()=>select(selected===meta.region?null:meta.region)}
           >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${node.observed?'bg-[var(--color-accent-spatial)]':'bg-[var(--color-status-caution)] opacity-70'}`} aria-hidden="true" />
            <span>{i+1}. {shortRegion(meta.label)}</span>
           </button>
          </TooltipTrigger>
          <TooltipContent>
           {meta.label} ({meta.uberonCurie}) · {node.observed?'Context supplied':'Unavailable'}
          </TooltipContent>
         </Tooltip>
        );
       })}
      </div>
     </div>

     {/* Bottom-Right: Layers, Anthropometric Profile, Auto-Rotate, Diagnostics Popover */}
     <div className="pointer-events-auto flex flex-col items-end gap-1 lg:max-w-[270px]">
      <div
       className={`stage-controls flex flex-wrap items-center justify-end gap-0.5 rounded-[var(--radius-md)] p-1 ${hudPillSurface}`}
       role="toolbar"
       aria-label="3D Biodigital Twin layer and anthropometric controls"
       onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(e.target as HTMLButtonElement);if(index<0)return;e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.focus();}}
      >
       <Tooltip>
        <TooltipTrigger asChild>
         <button
          type="button"
          className={`ares-interactive rounded-full border px-1.5 py-0.5 font-mono text-[9px] disabled:opacity-50 ${
           mode==='presentation'&&rotate&&!selected&&!reduced
            ?'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
            :'border-transparent text-[var(--color-ink-body)]'
          }`}
          disabled={mode!=='presentation'||reduced}
          aria-pressed={mode==='presentation'&&rotate&&!selected&&!reduced}
          onClick={()=>{if(selected){select(null);if(!rotate)toggleRotate();}else toggleRotate();}}
         >
          {rotate&&mode==='presentation'&&!reduced?'Auto':'Static'}
         </button>
        </TooltipTrigger>
        <TooltipContent>{rotateTitle}</TooltipContent>
       </Tooltip>

       {([{key:'skeletal',short:'Skel',label:'Skeletal layer'},{key:'vascular',short:'Vasc',label:'Vascular layer'},{key:'visceral',short:'Visc',label:'Visceral layer'}] as const).map(item=>(
        <Tooltip key={item.key}>
         <TooltipTrigger asChild>
          <button
           type="button"
           aria-label={item.label}
           className={`ares-interactive rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${
            lazyGlbLayers[item.key]
             ?'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
             :'border-transparent text-[var(--color-ink-meta)]'
           }`}
           aria-pressed={lazyGlbLayers[item.key]}
           onClick={()=>onToggleGlbLayer(item.key)}
          >
           {item.short}
          </button>
         </TooltipTrigger>
         <TooltipContent>{item.label}</TooltipContent>
        </Tooltip>
       ))}

       <div
        role="group"
        aria-label="3D twin biological sex profile"
        data-testid="hud-sex-switcher"
        className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-l0)] p-0.5"
       >
        {(['MALE','FEMALE'] as const).map(value=>(
         <button
          key={value}
          type="button"
          data-testid={`hud-sex-${value.toLowerCase()}`}
          aria-label={value==='MALE'?'Male profile':'Female profile'}
          className={`ares-interactive rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${
           sex===value
            ?'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
            :'border-transparent text-[var(--color-ink-meta)]'
          }`}
          aria-pressed={sex===value}
          onClick={()=>{setSex(value);onSexChange?.(value);}}
         >
          {value==='MALE'?'Male':'Female'}
         </button>
        ))}
       </div>

       <details className="stage-details relative">
        <summary
         data-testid="hud-bio-spec-summary"
         className="cursor-pointer rounded-full border border-transparent px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-ink-meta)] hover:border-[var(--color-border)]"
        >
         Spec/Bio
        </summary>
        <div className="absolute right-0 bottom-full z-40 mb-2 w-72 rounded-[var(--radius-shell)] border border-[var(--color-border-active)] bg-[var(--color-surface-l1)] p-2.5 font-mono text-[10px] text-[var(--color-ink-body)] shadow-xl">
         <p className="font-semibold text-[var(--color-ink-display)]">CrewBiologicalProfile &amp; spatial ref</p>
         <p className="mt-1 text-[var(--color-ink-meta)]">Illustrative profile: {sex} · Phase/Regimen: {crewProfile?.contraceptive_regimen??'Not reported'}</p>
         <p className="mt-0.5 text-[9px] text-cyan-200">
          Modifiers: SBP {sexModifiers.sbpBase} · HR {sexModifiers.hrBase} · LBNP sens {sexModifiers.lbnpSbpSens.toFixed(2)}x · IJV {sexModifiers.ijvBaseCsa.toFixed(2)} cm2
         </p>
         <div className="mt-1.5 space-y-1">
          {CANONICAL_REGIONS.map(meta=>{const n=projected.nodesByRegion[meta.region];return <p key={meta.region}>{meta.label} · {meta.uberonCurie} · {n.observed?`local ${n.localIntensity.toFixed(3)}, prop ${n.propagatedIntensity.toFixed(3)}`:'Not observed'}</p>;})}
         </div>
        </div>
       </details>
      </div>
     </div>
    </footer>
   </div>
  </TooltipProvider>
 );
}
