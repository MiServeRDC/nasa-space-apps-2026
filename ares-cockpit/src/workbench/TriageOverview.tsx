import type {AlarmLevel, TelemetryPacket} from '../types/telemetry';
import type {TelemetryStatus} from '../lib/useTelemetry';
import {clinicalSourceLabel,buildClinicalViewModel,biometricsDataOrigin} from '../lib/clinicalViewModel';
import {getCatalogEntry} from '../lib/playbookCatalog';
import {useWorkbenchStore} from '../stores/workbenchStore';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from '../components/ui/tooltip';

export function buildTriageOverview(packet:TelemetryPacket){
 const view=buildClinicalViewModel(packet),b=packet.biometrics;
 const supplied=biometricsDataOrigin(packet)!=='UNAVAILABLE';
 const evidence=[{label:'Heart rate',value:supplied?b.heart_rate_bpm:null,unit:'bpm'},{label:'Oxygen saturation',value:supplied?b.spo2_percent:null,unit:'%'},{label:'Respiration',value:supplied?b.respiration_rate_brpm:null,unit:'/min'},{label:'HRV (RMSSD)',value:view.hrvRmssd.value,unit:'ms'}];
 const missing=[...new Set([...(b.missing_channels??[]),...evidence.filter(m=>m.value==null||!Number.isFinite(m.value)).map(m=>m.label),...(view.mri.value===null?['Readiness (MRI)']:[]),...(view.rhoGlobal.value===null?['Global robustness']:[])])];
 const playbook=getCatalogEntry(packet.active_playbook?.playbook_id);
 return {alarm:packet.safety_margins.alarm_level,evidence,missing,playbook,
  problem:packet.active_playbook?.title?.trim()||playbook?.title||'Problem details unavailable from this source',
  nextInstruction:packet.active_playbook?.step_instruction?.trim()||null};
}

const ALARM_ACCENT:Readonly<Record<AlarmLevel,{dot:string;border:string;text:string}>>={
 NOMINAL:{dot:'bg-[var(--color-status-nominal)]',border:'border-l-[var(--color-status-nominal)]',text:'text-[var(--color-status-nominal)]'},
 ADVISORY:{dot:'bg-[var(--color-status-caution)]',border:'border-l-[var(--color-status-caution)]',text:'text-[var(--color-status-caution)]'},
 WARNING:{dot:'bg-[var(--color-status-caution)]',border:'border-l-[var(--color-status-caution)]',text:'text-[var(--color-status-caution)]'},
 CRITICAL:{dot:'bg-[var(--color-status-critical)] animate-pulse',border:'border-l-[var(--color-status-critical)]',text:'text-[var(--color-status-critical)]'},
 DATA_DEGRADED_MISSING_CHANNELS:{dot:'bg-[var(--color-status-caution)]',border:'border-l-[var(--color-status-caution)]',text:'text-[var(--color-status-caution)]'},
};

export function TriageOverview({packet,status}:{packet:TelemetryPacket;status:TelemetryStatus}){
 const state=buildTriageOverview(packet),view=buildClinicalViewModel(packet);
 const setPhase=useWorkbenchStore(s=>s.setPhase),selectPlaybook=useWorkbenchStore(s=>s.selectPlaybook);
 const breadcrumb=useWorkbenchStore(s=>s.returnBreadcrumb),popBreadcrumb=useWorkbenchStore(s=>s.popReturnBreadcrumb);
 const accent=ALARM_ACCENT[state.alarm];
 const hrv=state.evidence[3];
 const hrvFinite=hrv.value!=null&&Number.isFinite(hrv.value);
 const freshnessText=status.isStale?'STALE — last valid data':status.heldSample?'HELD — last valid data':'Latest supplied sample';
 const sourceBadge=biometricsDataOrigin(packet)==='UNAVAILABLE'?'SOURCE UNAVAILABLE':clinicalSourceLabel(packet);
 const navigate=()=>{if(state.playbook){selectPlaybook(state.playbook.playbook_id);setPhase('ACT');}else setPhase('GATHER');
  requestAnimationFrame(()=>document.getElementById('clinical-phase-dock')?.focus());};
 return (
  <TooltipProvider delayDuration={180}>
   <section
    role="region"
    aria-label="Clinical overview"
    data-triage-alarm={state.alarm}
    data-triage-source-record={packet.source_record_id}
    className={`triage-overview border-l-[3px] ${accent.border}`}
   >
    <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
     <div className="flex min-w-0 items-center gap-1.5">
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${accent.dot}`} aria-hidden="true" />
      <span className={`font-semibold tracking-wide whitespace-nowrap ${accent.text}`} data-triage-status>
       {state.alarm.replaceAll('_',' ')}
      </span>
      <span className="truncate text-[var(--color-ink-muted)]">{packet.astronaut_id}</span>
     </div>
     <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-ink-meta)]">
      {status.isStale?'STALE':status.heldSample?'HELD':sourceBadge}
     </span>
    </div>

    <Tooltip>
     <TooltipTrigger asChild>
      <h1 className="triage-headline cursor-help truncate">{state.problem}</h1>
     </TooltipTrigger>
     <TooltipContent>
      <p className="max-w-[280px] font-mono text-[10px]">
       {state.problem} · {state.nextInstruction??(state.playbook?'Review permitted actions and diagnostic prerequisites.':'Review available measurements and missing channels.')}
      </p>
     </TooltipContent>
    </Tooltip>

    <div className="flex flex-wrap items-center justify-between gap-1.5">
     <div className="flex items-center gap-1.5 font-mono text-[10px]">
      <Tooltip>
       <TooltipTrigger asChild>
        <span
         data-triage-value="HRV (RMSSD)"
         className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
          hrvFinite
           ?'border border-[var(--color-border)] bg-[var(--color-surface-l2)] text-[var(--color-ink-display)]'
           :'ares-missing-hatch cursor-help text-[var(--color-status-caution)]'
         }`}
        >
         <span className="text-[var(--color-ink-meta)]">HRV</span>
         <strong className="ares-tabular-metric font-semibold">
          {hrvFinite?`${(hrv.value as number).toFixed(1)} ms`:'-- ms'}
         </strong>
        </span>
       </TooltipTrigger>
       <TooltipContent>
        {hrvFinite
         ?`HRV (RMSSD): ${(hrv.value as number).toFixed(1)} ms (${view.hrvRmssd.provenance})`
         :`UNAVAILABLE · ${view.hrvRmssd.reason??'BEAT_INTERVALS_NOT_AVAILABLE'} (${view.hrvRmssd.provenance})`}
       </TooltipContent>
      </Tooltip>

      <Tooltip>
       <TooltipTrigger asChild>
        <span
         className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] ${
          state.missing.length>0
           ?'ares-missing-hatch cursor-help text-[var(--color-status-caution)]'
           :'border border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
         }`}
        >
         <span className="ares-tabular-metric font-semibold">
          {state.missing.length>0?`${state.missing.length} MISSING`:'LOCKED'}
         </span>
        </span>
       </TooltipTrigger>
       <TooltipContent>
        {state.missing.length>0
         ?`Missing clinical channels: ${state.missing.join(', ')}`
         :'All monitored overview channels supplied'}
       </TooltipContent>
      </Tooltip>
     </div>

     <button type="button" onClick={navigate} className="phase8-button triage-cta shrink-0">
      {state.playbook?'Review active playbook':'Review measurements'}
     </button>
    </div>

    {breadcrumb?(
     <div className="pt-0.5">
      <button
       type="button"
       className="phase8-button w-full"
       onClick={()=>{
        const previous=popBreadcrumb();
        requestAnimationFrame(()=>{
         const origin=previous?.focusedElementId?document.getElementById(previous.focusedElementId):null;
         (origin??document.getElementById('clinical-phase-dock'))?.focus();
        });
       }}
      >
       Return to previous playbook
      </button>
     </div>
    ):null}

    <details className="triage-details">
     <summary className="cursor-pointer truncate font-mono text-[9.5px] leading-tight text-[var(--color-ink-meta)]">
      Provenance · {packet.source_record_id}
     </summary>
     <div className="mt-1.5 space-y-1 border-t border-[var(--color-border)] pt-1.5 font-mono text-[10px] text-[var(--color-ink-body)]">
      <p className="triage-source">
       {sourceBadge} · {freshnessText}. Model: {packet.model_validation_status??'ILLUSTRATIVE_UNVALIDATED'}.
      </p>
      <p>{state.nextInstruction??(state.playbook?'Review permitted actions and diagnostic prerequisites.':'Review the available measurements and missing channels.')}</p>
      <div className="triage-missing" aria-label="Missing clinical data">
       <strong>Missing data:</strong> {state.missing.length?state.missing.join(' · '):'No missing values in the four evidence channels shown.'}
      </div>
      <p>
       Record: {packet.source_record_id}. Timestamp (ms): {packet.timestamp_ms}. Quality flags: {(packet.quality_flags??[]).join(', ')||'None supplied'}. Navigation only; actions retain existing gates and confirmation.
      </p>
     </div>
    </details>
   </section>
  </TooltipProvider>
 );
}
