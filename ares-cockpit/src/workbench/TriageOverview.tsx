import type {TelemetryPacket} from '../types/telemetry';
import type {TelemetryStatus} from '../lib/useTelemetry';
import {clinicalSourceLabel,buildClinicalViewModel,biometricsDataOrigin} from '../lib/clinicalViewModel';
import {getCatalogEntry} from '../lib/playbookCatalog';
import {useWorkbenchStore} from '../stores/workbenchStore';
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
export function TriageOverview({packet,status}:{packet:TelemetryPacket;status:TelemetryStatus}){
 const state=buildTriageOverview(packet),setPhase=useWorkbenchStore(s=>s.setPhase),selectPlaybook=useWorkbenchStore(s=>s.selectPlaybook);
 const breadcrumb=useWorkbenchStore(s=>s.returnBreadcrumb),popBreadcrumb=useWorkbenchStore(s=>s.popReturnBreadcrumb);
 const navigate=()=>{if(state.playbook){selectPlaybook(state.playbook.playbook_id);setPhase('ACT');}else setPhase('GATHER');
  requestAnimationFrame(()=>document.getElementById('clinical-phase-dock')?.focus());};
 return <section className="triage-overview" aria-label="Clinical overview" data-triage-alarm={state.alarm} data-triage-source-record={packet.source_record_id}>
  <div className="triage-primary"><p className="triage-eyebrow">Current status · {packet.astronaut_id}</p><p className="triage-alarm" data-triage-status>{state.alarm.replaceAll('_',' ')}</p><h1>{state.problem}</h1>
   <p className="triage-source">{biometricsDataOrigin(packet)==='UNAVAILABLE'?'SOURCE UNAVAILABLE':clinicalSourceLabel(packet)} · {status.isStale?'STALE — last valid data':status.heldSample?'HELD — last valid data':'Latest supplied sample'}. Model: {packet.model_validation_status??'ILLUSTRATIVE_UNVALIDATED'}.</p></div>
  <div className="triage-evidence" aria-label="Current evidence">{state.evidence.map(m=><div key={m.label}><span>{m.label}</span><strong data-triage-value={m.label}>{m.value!=null&&Number.isFinite(m.value)?`${m.value.toFixed(m.label==='HRV (RMSSD)'?1:0)} ${m.unit}`:'Unavailable'}</strong></div>)}</div>
  <div className="triage-next"><h2>Next step</h2><p>{state.nextInstruction??(state.playbook?'Review permitted actions and diagnostic prerequisites.':'Review the available measurements and missing channels.')}</p>
   <button onClick={navigate} className="phase8-button">{state.playbook?'Review active playbook':'Review measurements'}</button><br/>{breadcrumb?<button className="phase8-button" onClick={()=>{const previous=popBreadcrumb();requestAnimationFrame(()=>{const origin=previous?.focusedElementId?document.getElementById(previous.focusedElementId):null;(origin??document.getElementById('clinical-phase-dock'))?.focus();});}}>Return to previous playbook</button>:null}<p className="triage-source">Navigation only. Actions retain their existing gates and confirmation.</p></div>
  <div className="triage-missing" aria-label="Missing clinical data"><h2>Missing data</h2><p>{state.missing.length?state.missing.join(' · '):'No missing values in the four evidence channels shown.'}</p></div>
  <details className="triage-details"><summary>Source and technical details</summary><p>Record: {packet.source_record_id}. Timestamp (ms): {packet.timestamp_ms}. Quality flags: {(packet.quality_flags??[]).join(', ')||'None supplied'}. Additional model channels may remain unavailable; this summary is not a completeness certificate.</p></details>
 </section>;
}
