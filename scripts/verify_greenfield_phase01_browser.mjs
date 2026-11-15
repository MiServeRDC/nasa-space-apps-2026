// Local-only integration harness. Uses controlled synthetic wire fixtures, never patient validation.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs BROWSER_PATH=/path/to/chrome node scripts/verify_greenfield_phase01_browser.mjs
import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {createServer}=await import(pathToFileURL(join(root,'ares-cockpit/node_modules/vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const artifacts=await mkdtemp(join(tmpdir(),'ares-greenfield-phase01-browser-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn, timeout=20000) {const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await sleep(80);}throw Error('Timed out waiting for browser assertion');}
let frame={timestamp_ms:Date.now(),relative_recording_time_s:42,source_record_id:'synthetic-contract-fixture',astronaut_id:'BIDMC-SUBJECT-01',
  model_validation_status:'ILLUSTRATIVE_UNVALIDATED',provenance_manifest:{biometrics_source:'RECORDED_TERRESTRIAL_BIDMC_CSV',
    biometrics_native_rate_hz:1,ui_refresh_rate_hz:20,scenario_overlay_mode:'NONE_PURE_REPLAY'},
  biometrics:{heart_rate_bpm:72,pulse_rate_bpm:72,respiration_rate_brpm:14,spo2_percent:98,hrv_rmssd_ms:null,hrv_unavailable_reason:'BEAT_INTERVALS_NOT_AVAILABLE'},
  safety_margins:{provenance:'DERIVED_FROM_RECORDED_BIDMC',med_stl_rho_robustness:null,mission_readiness_index:null,alarm_level:'DATA_DEGRADED_MISSING_CHANNELS'},
  nqs_stl:{rho_tau_w:-0.37,rho_ared:0.63,rho_sost:0.27,rho_rmssd:null,rho_sans:0.18},environment:null,hemodynamics:null,musculoskeletal:null};
let snapshotAvailable=true;
const mock=httpServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.end();return;}
  if(req.url==='/api/snapshot' && snapshotAvailable){res.end(JSON.stringify(frame));return;}
  res.statusCode=503;res.end('{}');});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${mock.address().port}`;
process.env.VITE_ARES_HTTP_URL=base;
const vite=await createServer({root:join(root,'ares-cockpit'),server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;const timers=new Set();let socket;let connections=0;let advancing=true;let sending=true;
try {
 await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket(`${base.replace('http','ws')}/ws/telemetry`,ws=>{socket=ws;connections++;if(!snapshotAvailable){ws.close({code:1012,reason:'controlled offline'});return;}
  const send=()=>{if(!sending)return;if(advancing){frame.timestamp_ms+=50;frame.relative_recording_time_s+=0.05;}ws.send(JSON.stringify(frame));};send();
  const timer=setInterval(send,50);timers.add(timer);ws.onClose(()=>{clearInterval(timer);timers.delete(timer);});});
 // Current main's actual hook: no unused preview work, immediate alarms and reconnect.
 await page.goto(`${ui}/tests/telemetry-harness.html`);
 const state=async()=>JSON.parse(await page.locator('output').innerText());
 await until(async()=>(await state()).link==='ENGINE_LIVE');await sleep(100);const local=(await state()).localFrames;
 await sleep(300);assert.equal((await state()).localFrames,local);
 await page.getByRole('button',{name:'Toggle preview'}).click();await sleep(250);assert.ok((await state()).localFrames>local);
 await page.getByRole('button',{name:'Toggle preview'}).click();
 frame.safety_margins.alarm_level='CRITICAL';await until(async()=>(await state()).alarm==='CRITICAL');
 assert.equal((await state()).missing,true);
 advancing=false;await until(async()=>(await state()).heldSample);assert.equal((await state()).nativeHz,1);
 sending=false;await until(async()=>(await state()).isStale,5000);sending=true;advancing=true;
 await until(async()=>!(await state()).isStale);
 socket.close({code:1012,reason:'controlled reconnect'});
 await until(async()=>connections>=2 && (await state()).link==='ENGINE_LIVE');
 frame.safety_margins.alarm_level='DATA_DEGRADED_MISSING_CHANNELS';
 await page.goto(ui);await page.getByRole('banner',{name:'ARES-Health Telemetry Horizon Bar'}).waitFor();
 await until(async()=>await page.getByText('RECORDED TELEMETRY',{exact:true}).count()>0);
 await page.getByRole('button',{name:/02 EVALUATE/}).click();
 const mri=page.locator('[data-clinical-field="mri"]');
 await until(async()=>await mri.getAttribute('data-availability')==='UNAVAILABLE');
 await page.screenshot({path:join(artifacts,'evaluate-missing.png')});
 frame.safety_margins.mission_readiness_index=84;frame.safety_margins.med_stl_rho_robustness=0.28;
 await until(async()=>await mri.getAttribute('data-availability')==='AVAILABLE');assert.match(await mri.innerText(),/84/);
 // Older frames cannot replace current source values.
 const good=structuredClone(frame);advancing=false;frame={...frame,timestamp_ms:1,relative_recording_time_s:frame.relative_recording_time_s-0.2,safety_margins:{...frame.safety_margins,mission_readiness_index:9}};
 await sleep(300);assert.match(await mri.innerText(),/84/);frame=good;advancing=true;
 frame.safety_margins.mission_readiness_index=null;frame.safety_margins.med_stl_rho_robustness=null;
 await until(async()=>await mri.getAttribute('data-availability')==='UNAVAILABLE');
 const sourceSwitchTime=frame.relative_recording_time_s;
 frame.source_record_id='synthetic-hardware-fixture';frame.provenance_manifest.biometrics_source='HARDWARE_WEARABLE';
 await until(async()=>await page.getByText('HARDWARE TELEMETRY',{exact:true}).count()>0);
 const ring=await page.evaluate(async()=>{const {telemetryRingBuffer:r}=await import('/src/stores/telemetryRingBuffer.ts');return {oldest:r.oldestTimestampS()};});
 assert.ok(ring.oldest>=sourceSwitchTime,'source switch must clear prior waveform samples');
 assert.equal(await page.getByText('DELTA SIMULATED',{exact:true}).count(),0);
 frame.provenance_manifest.scenario_overlay_mode='SIMULATED_WHATIF_SCENARIO';
 await until(async()=>await page.getByText('SCENARIO OVERLAY',{exact:true}).count()>0);
 frame.provenance_manifest.scenario_overlay_mode='NONE_PURE_REPLAY';
 await until(async()=>await page.getByText('HARDWARE TELEMETRY',{exact:true}).count()>0);
 await page.screenshot({path:join(artifacts,'hardware.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(artifacts,'mobile.png')});
 snapshotAvailable=false;socket.close({code:1012,reason:'controlled offline'});
 await until(async()=>await page.getByText('LOCAL SCENARIO PREVIEW',{exact:true}).count()>0);
 assert.deepEqual(errors,[]);
 await writeFile(join(artifacts,'results.json'),JSON.stringify({passed:true,connections,checks:['live hook','preview loop','alarm','missing HRV','reconnect','null-finite-null UI','out-of-order rejection','hardware source','history reset','overlay label','offline preview','held 1Hz sample','stale/recovered','mobile render'],errors},null,2));
 console.log(`Browser checks passed. Artifacts: ${artifacts}`);
} finally {
 for(const timer of timers)clearInterval(timer);if(browser)await browser.close();await vite.close();await new Promise(r=>mock.close(r));
}
