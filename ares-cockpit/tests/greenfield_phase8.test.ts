import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('Phase 8: packet-only triage, display isolation and accessible source details',async t=>{
 const vite=await createServer({root:resolve(import.meta.dirname,'..'),configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error',esbuild:{jsx:'automatic'}});
 try{
 const {buildTriageOverview,TriageOverview}=await vite.ssrLoadModule('/src/workbench/TriageOverview.tsx'),{buildPacket,DEFAULT_WHATIF}=await vite.ssrLoadModule('/src/lib/scenario.ts'),{useWorkbenchStore}=await vite.ssrLoadModule('/src/stores/workbenchStore.ts');
 const packet=buildPacket(DEFAULT_WHATIF,0,null,0);packet.is_local_simulation=false;packet.provenance_manifest.biometrics_source='RECORDED_TERRESTRIAL_BIDMC_CSV';packet.provenance_manifest.scenario_overlay_mode='NONE_PURE_REPLAY';packet.biometrics.hrv_rmssd_ms=null;packet.safety_margins.mission_readiness_index=null;packet.safety_margins.med_stl_rho_robustness=null;
 const status={isStale:false,heldSample:false};
 await t.test('missing MRI/rho/HRV are explicit; finite zero is not replaced',()=>{
  packet.biometrics.heart_rate_bpm=0;const view=buildTriageOverview(packet);assert.equal(view.evidence[0].value,0);assert.ok(view.missing.includes('HRV (RMSSD)'));assert.ok(view.missing.includes('Readiness (MRI)'));assert.ok(view.missing.includes('Global robustness'));
  const html=renderToStaticMarkup(createElement(TriageOverview,{packet,status}));assert.match(html,/0 bpm/);assert.match(html,/Unavailable/);assert.match(html,/RECORDED TELEMETRY/);assert.doesNotMatch(html,/NaN|undefined/);
 });
 await t.test('unavailable provenance cannot promote leftover numeric biometrics',()=>{const copy=structuredClone(packet);copy.provenance_manifest.biometrics_source='UNAVAILABLE';const view=buildTriageOverview(copy);assert.ok(view.evidence.every(m=>m.value===null));});
 await t.test('backend alarm and supplied problem stay authoritative across missing channels',()=>{
  packet.safety_margins.alarm_level='CRITICAL';packet.active_playbook={playbook_id:'PLAYBOOK_06_ACUTE_DESATURATION',title:'Source-supplied event',step_instruction:'Check the sensor attachment'};
  const v=buildTriageOverview(packet);assert.equal(v.alarm,'CRITICAL');assert.equal(v.problem,'Source-supplied event');assert.equal(v.nextInstruction,'Check the sensor attachment');
 });
 await t.test('absent/unknown active playbook cannot invent a recommendation',()=>{
  packet.active_playbook=null;let v=buildTriageOverview(packet);assert.equal(v.playbook,undefined);assert.equal(v.nextInstruction,null);
  packet.active_playbook={playbook_id:'UNKNOWN',title:'Unmapped event'};v=buildTriageOverview(packet);assert.equal(v.playbook,undefined);assert.equal(v.problem,'Unmapped event');
 });
 await t.test('stale/held state and technical details remain readable',()=>{
  const html=renderToStaticMarkup(createElement(TriageOverview,{packet,status:{...status,isStale:true}}));assert.match(html,/STALE/);assert.match(html,/<details/);assert.match(html,/Missing data/);
 });
 await t.test('display mode changes do not mutate phase, selection, sex or rotation preference',()=>{
  const store=useWorkbenchStore.getState();store.resetWorkbench();store.setPhase('ACT');store.selectUberonRegion('InternalJugularVein');store.setTwinSex('FEMALE');
  assert.equal(useWorkbenchStore.getState().displayMode,'operational');store.setDisplayMode('presentation');const p=useWorkbenchStore.getState();assert.equal(p.phase,'ACT');assert.equal(p.selectedUberonRegion,'InternalJugularVein');assert.equal(p.twinSex,'FEMALE');assert.equal(p.twinAutoRotate,true);store.setDisplayMode('operational');assert.equal(useWorkbenchStore.getState().twinAutoRotate,true);store.resetWorkbench();
 });
 }finally{await vite.close();}
});
