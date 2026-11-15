import test from 'node:test';
import assert from 'node:assert/strict';
import {requireLocalSpeech} from '../src/lib/localSpeechPolicy.ts';
import {appendLocalAudit,verifyLocalAudit,canonicalLocalAudit} from '../src/lib/localAudit.ts';
import {AnatomyRegistry,validateAnatomyManifest,anatomyClinicalAvailability} from '../src/anatomy/registry.ts';
import type {AnatomyModelManifest} from '../src/anatomy/contracts.ts';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function fixture(id='male',sex:'MALE'|'FEMALE'='MALE'):AnatomyModelManifest {
 return {schemaVersion:1,modelUnits:'m',id,label:'Synthetic registry fixture, not a shipped atlas',referenceSex:sex,
  assets:[{id:'fixture',path:'/anatomy/fixture.glb',sha256:'a'.repeat(64),sourceUrl:'https://example.org/fixture',
   sourceVersion:'fixture-only',sourceSex:sex,sourceDonorReference:null,license:'CC0-1.0',credit:'Synthetic test fixture',adaptations:[],
   units:'m',axes:'GLTF_Y_UP_RIGHT_HANDED',sourceToModel:[...identity],
   registration:{method:'IDENTITY',reviewed:true,report:null},lod:0,pickingMap:null}],
  structures:[{id:'soleus',label:'Soleus fixture',sourceConceptId:'test:soleus',laterality:'LEFT',
   ontology:{id:'UBERON:0001389',reviewed:true,evidence:'Synthetic contract fixture only'},
   coverage:'NATIVE_REFERENCE',meshes:[{assetId:'fixture',nodeIds:['mesh-a','mesh-b']}],
   clinicalBindings:[{backendRegion:'SoleusCalcaneus',relationship:'CONTEXT_ONLY',channels:['rho_ared']}],unavailableReason:null}]};
}
test('ASR refuses unsupported local capability and does not manufacture the property',()=>{
 const remote={};assert.equal(requireLocalSpeech(remote),false);assert.equal('processLocally'in remote,false);
});
test('ASR forces local processing before start; rejects immutable/throwing properties',()=>{
 const local={processLocally:false};assert.equal(requireLocalSpeech(local),true);assert.equal(local.processLocally,true);
 assert.equal(requireLocalSpeech(Object.freeze({processLocally:false})),false);
 assert.equal(requireLocalSpeech({get processLocally(){return false;},set processLocally(_){throw Error('unsupported');}}),false);
});
test('local notes use genuine SHA-256; all payload fields and linkage are covered',async()=>{
 const a=await appendLocalAudit([],'LOCAL NOTE','2026-11-15T00:00:00Z');
 const b=await appendLocalAudit([a],'SECOND NOTE','2026-11-15T00:00:01Z');
 assert.equal(await verifyLocalAudit([a,b]),true);assert.equal(a.current_hash_hex.length,64);
 for(const field of ['event_action','timestamp_utc','actor_role','prev_hash_hex','current_hash_hex']as const){
  assert.equal(await verifyLocalAudit([a,{...b,[field]:'edited'}]),false,field);
 }
 assert.equal(await verifyLocalAudit([b,a]),false);assert.equal(await verifyLocalAudit([]),true);
 assert.notEqual(canonicalLocalAudit({...a,event_action:'a|b'}),canonicalLocalAudit({...a,event_action:'a',actor_role:'b'}as never));
});
test('registry permits many meshes per concept and compound regions without clinical availability',()=>{
 const m=fixture();m.structures.push({...structuredClone(m.structures[0]),id:'calcaneus',sourceConceptId:'test:calcaneus',
  ontology:{id:'UBERON:0001450',reviewed:true,evidence:'Test fixture'},meshes:[{assetId:'fixture',nodeIds:['heel']}]});
 assert.deepEqual(validateAnatomyManifest(m),[]);const r=new AnatomyRegistry();r.register(m);
 assert.equal(r.structure('male','soleus')?.meshes[0].nodeIds.length,2);
 assert.equal(r.structure('male','calcaneus')?.clinicalBindings[0].backendRegion,'SoleusCalcaneus');
});
test('missing female structure stays missing; switching clears selection',()=>{
 const r=new AnatomyRegistry();r.register(fixture());const f=fixture('female','FEMALE');
 Object.assign(f.structures[0],{coverage:'MISSING',meshes:[],unavailableReason:'Source not inventoried'});r.register(f);
 assert.equal(r.switchModel({modelId:'male',structureId:'soleus'},'female'),null);
});
test('borrowed reference cannot silently become native female coverage',()=>{
 const f=fixture('female','FEMALE');f.assets[0].sourceSex='MALE';assert.ok(validateAnatomyManifest(f).length);
 f.structures[0].coverage='BORROWED_REFERENCE';assert.deepEqual(validateAnatomyManifest(f),[]);
});
test('unknown structure/ontology/backend IDs never become inferred bindings',()=>{
 const r=new AnatomyRegistry();r.register(fixture());assert.equal(r.structure('male','unknown'),null);
 assert.equal(r.switchModel({modelId:'male',structureId:'unknown'},'male'),null);
 const m=fixture();m.structures[0].clinicalBindings[0].backendRegion='Kidney'as never;
 assert.ok(validateAnatomyManifest(m).some(e=>e.includes('Unknown backend')));
});
test('kidney reference can be selected without inventing a backend kidney region',()=>{
 const m=fixture();m.structures.push({...structuredClone(m.structures[0]),id:'kidney',label:'Kidney reference fixture',sourceConceptId:'test:kidney',ontology:null,clinicalBindings:[]});
 const r=new AnatomyRegistry();r.register(m);assert.deepEqual(r.structure('male','kidney')?.clinicalBindings,[]);
});
test('model switching requires exact reviewed concept/laterality and unique candidate',()=>{
 const r=new AnatomyRegistry();r.register(fixture());const f=fixture('female','FEMALE');r.register(f);
 assert.deepEqual(r.switchModel({modelId:'male',structureId:'soleus'},'female'),{modelId:'female',structureId:'soleus'});
 const ambiguous=fixture('ambiguous');ambiguous.structures.push({...structuredClone(ambiguous.structures[0]),id:'duplicate-concept'});r.register(ambiguous);
 assert.equal(r.switchModel({modelId:'male',structureId:'soleus'},'ambiguous'),null);
});
test('annotations never move between donors; registry owns immutable snapshots',()=>{
 const r=new AnatomyRegistry();const m=fixture();r.register(m);m.structures[0].label='mutated';
 assert.equal(r.structure('male','soleus')?.label,'Soleus fixture');
 const a={id:'a',modelId:'male',structureId:'soleus',text:'Local annotation'};
 assert.deepEqual(r.annotationsForModel([a],'female'),[]);assert.equal(r.annotationsForModel([a],'male').length,1);
});
test('registry rejects bad hashes, transforms, missing geometry and duplicate IDs',()=>{
 for(const mutate of [(m:AnatomyModelManifest)=>m.assets[0].sha256='bad',
  (m:AnatomyModelManifest)=>m.assets[0].sourceToModel=[NaN],
  (m:AnatomyModelManifest)=>m.structures[0].meshes=[],
  (m:AnatomyModelManifest)=>m.structures.push(structuredClone(m.structures[0]))]) {
  const m=fixture();mutate(m);assert.throws(()=>new AnatomyRegistry().register(m));
 }
});

test('reference geometry never converts a null clinical channel into normality',()=>{
 const s=fixture().structures[0];
 assert.equal(anatomyClinicalAvailability(s,{rho_ared:null}),'UNAVAILABLE');
 assert.equal(anatomyClinicalAvailability(s,{rho_ared:NaN}),'UNAVAILABLE');
 assert.equal(anatomyClinicalAvailability(s,{rho_ared:0}),'AVAILABLE');
 assert.equal(anatomyClinicalAvailability({...s,clinicalBindings:[]},{}),'UNBOUND');
});

test('backend contraindication and vent flags survive absent frontend numeric inputs',async()=>{
 const {partitionPlaybookActionsWithSafetyGates:partition}=await import('../src/workbench/safetyGatePartition.ts');
 const action={action_id:'TEST_ANTICOAG',label:'Test',category:'PHARMACOLOGICAL_ANTICOAGULANT',delta_rho_per_hour:0};
 const result=partition([action],{anticoagulant_lock_active:false,anticoagulant_contraindicated_bleeding_risk:true,lbnp_auto_vent_triggered:true},{});
 assert.equal(result.inhibitedActions.length,1);assert.equal(result.preSyncopeTriggered,true);
 assert.match(result.interlockMatrix[0].detail,/bleeding-risk/);
 assert.match(result.interlockMatrix[1].detail,/acknowledgement unavailable/);
});
test('missing gait stays unavailable in the gate matrix rather than zero/nominal',async()=>{
 const {partitionPlaybookActionsWithSafetyGates:partition}=await import('../src/workbench/safetyGatePartition.ts');
 const gate=partition([],null,{}).interlockMatrix.find(g=>g.code==='GATE_3_ANKLE_DAMPING');
 assert.equal(gate?.status,'UNAVAILABLE');assert.doesNotMatch(gate?.detail??'',/0\.0%/);
});
