// Built-bundle, local synthetic packet only; layout qualification, not medical validation.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),app=join(root,'ares-cockpit');
const {preview}=await import(pathToFileURL(join(app,'node_modules/vite/dist/node/index.js'))),{chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const artifacts=await mkdtemp(join(tmpdir(),'ares-greenfield-phase8-')),server=await preview({root:app,server:{hmr:false},preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'}),base=`http://127.0.0.1:${server.httpServer.address().port}`;
const frame={timestamp_ms:Date.now(),relative_recording_time_s:42,source_record_id:'phase8-controlled-fixture',astronaut_id:'BIDMC-SUBJECT-01',model_validation_status:'ILLUSTRATIVE_UNVALIDATED',provenance_manifest:{biometrics_source:'RECORDED_TERRESTRIAL_BIDMC_CSV',biometrics_native_rate_hz:1,ui_refresh_rate_hz:20,scenario_overlay_mode:'NONE_PURE_REPLAY'},biometrics:{heart_rate_bpm:72,pulse_rate_bpm:72,respiration_rate_brpm:14,spo2_percent:98,hrv_rmssd_ms:null,hrv_unavailable_reason:'BEAT_INTERVALS_NOT_AVAILABLE'},safety_margins:{provenance:'DERIVED_FROM_RECORDED_BIDMC',med_stl_rho_robustness:null,mission_readiness_index:null,alarm_level:'WARNING'},active_playbook:{playbook_id:'PLAYBOOK_01_VENOUS_STASIS_LBNP',title:'Controlled source alert',step_instruction:'Review diagnostic evidence',safety_gates:{anticoagulant_lock_active:true,lbnp_auto_vent_armed:true,eva_suit_damping_active:false,gate4_invasive_decompression_locked:true,gate4_eva_fitness_no_go:true}},environment:null,hemodynamics:null,musculoskeletal:null};
let browser;const checks=[],layouts=[];
try{
 browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),external=[],errors=[];
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===base)return r.continue();if(u.hostname!=='127.0.0.1')external.push(u.href);return r.abort();});
 await context.route('**/api/snapshot',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...frame,timestamp_ms:Date.now()})}));await context.routeWebSocket('**/*',()=>{});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/?skipIntro=1`);
 await page.locator('[data-triage-source-record="phase8-controlled-fixture"]').waitFor();
 const summary=page.getByRole('region',{name:'Clinical overview',exact:true});await summary.getByText('Controlled source alert',{exact:true}).waitFor();await summary.getByText(/HRV \(RMSSD\).*Readiness/).waitFor();
 await summary.getByRole('button',{name:'Review active playbook',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.workbench-frame').dataset.phase==='ACT');
 await page.waitForFunction(()=>document.activeElement?.id==='clinical-phase-dock');checks.push('2D alert, missing data and active gated playbook reachable; focus follows navigation');
 const verify=page.locator('[id^="verify-gate-"]').first(),verifyId=await verify.getAttribute('id');await verify.click();await page.getByRole('button',{name:'Return to previous playbook',exact:true}).click();await page.waitForFunction(id=>document.activeElement?.id===id,verifyId);checks.push('diagnostic detour returns to the originating playbook control');await page.getByRole('button',{name:'Reset body view',exact:true}).click();await page.waitForTimeout(900);
 const coloredPixels=async bytes=>page.evaluate(async data=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(data)],{type:'image/png'})),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<rgba.length;i+=4){const hi=Math.max(rgba[i],rgba[i+1],rgba[i+2]),lo=Math.min(rgba[i],rgba[i+1],rgba[i+2]);if(hi>40&&hi-lo>20)count++;}bitmap.close();return count;},Array.from(bytes));
 const fits=async(label)=>{
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('.phase8-content *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2;}).slice(0,8).map(el=>({tag:el.tagName,cls:String(el.className),text:el.textContent.slice(0,70)}))}));
  assert.ok(overflow.scroll<=overflow.width+1,`${label}: ${JSON.stringify(overflow)}`);
 };
 for(const [width,height]of [[1440,1000],[1024,900],[768,1024],[390,844],[740,390]]){
  await page.setViewportSize({width,height});
  for(const mode of ['Operational','Presentation']){
   await page.getByRole('button',{name:mode,exact:true}).click();await page.waitForTimeout(120);await fits(`${width} ${mode}`);
   const source=await summary.getAttribute('data-triage-source-record');assert.equal(source,frame.source_record_id);assert.equal(await summary.getAttribute('data-triage-alarm'),'WARNING');
   const stage=page.locator('[data-stage-aperture]');await stage.scrollIntoViewIfNeeded();await page.waitForTimeout(120);
   await page.waitForFunction(mode=>document.querySelector('[data-stage-aperture]')?.getAttribute('data-auto-rotate-active')===(mode==='Presentation'?'true':'false'),mode);
   const stageBox=await stage.boundingBox(),hotspots=await page.getByRole('group',{name:'Anatomical problem hotspots on 3D body'}).boundingBox(),toolbar=await page.getByRole('toolbar',{name:'3D Biodigital Twin layer and anthropometric controls'}).boundingBox();
   assert.ok(hotspots.y+hotspots.height<=stageBox.y+1);assert.ok(toolbar.y>=stageBox.y+stageBox.height-1);layouts.push({width,height,mode,stageBox});
   const image=await stage.screenshot({path:join(artifacts,`stage-${width}-${height}-${mode}.png`)});assert.ok(await coloredPixels(image)>100,'Primary view must contain rendered geometry, not only an empty rectangle');
   await page.screenshot({path:join(artifacts,`scrolled-stage-${width}-${height}-${mode}.png`)});
  }
 }
 checks.push('1440/1024/768/390 and narrow landscape: operational/presentation reflow; controls outside actual scrolled aperture');
 await page.setViewportSize({width:1440,height:1000});await page.locator('#horizon-btn-studio').click();
 await page.getByRole('button',{name:'SPLIT',exact:true}).click();const specimen=page.getByRole('region',{name:'SPLIT // ILLUSTRATIVE OCULAR REFERENCE',exact:true});await specimen.scrollIntoViewIfNeeded();await page.waitForTimeout(500);const specimenImage=await specimen.screenshot({path:join(artifacts,'studio-specimen.png')});assert.ok(await coloredPixels(specimenImage)>100,'Secondary view must contain rendered specimen geometry');await fits('Studio split view');await page.locator('#horizon-btn-studio').click();checks.push('studio controls and illustrative secondary viewport stay in document flow');
 // Browser layout zoom: CSS zoom changes layout dimensions, unlike deviceScaleFactor.
 await page.setViewportSize({width:1024,height:900});await page.evaluate(()=>{document.documentElement.style.zoom='2';});await fits('200% layout zoom');
 await page.getByRole('button',{name:'Review active playbook',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.id==='clinical-phase-dock');
 await page.screenshot({path:join(artifacts,'zoom-200.png')});await page.evaluate(()=>{document.documentElement.style.zoom='';});checks.push('200% layout zoom retains 2D action navigation');
 // Focus restoration and input escape behavior use existing drawer orchestration.
 await page.setViewportSize({width:1440,height:1000});await page.locator('#horizon-phase-gather').click();await page.locator('#horizon-btn-shortcuts').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));await page.waitForFunction(()=>document.activeElement?.id==='horizon-btn-shortcuts');
 await page.locator('#horizon-btn-palette').click();const filter=page.getByRole('searchbox',{name:'Filter spatial workbench commands',exact:true});await filter.pressSequentially('act');assert.equal(await page.locator('.workbench-frame').getAttribute('data-phase'),'GATHER');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.id==='horizon-btn-palette');checks.push('dialog escape restores invoking control; text input does not trigger phase hotkeys');
 // Reduced motion must still allow same clinical navigation; presentation does not waive hold.
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-stage-aperture]')?.getAttribute('data-auto-rotate-active')==='false');await page.getByRole('button',{name:'Presentation',exact:true}).click();await summary.getByRole('button',{name:'Review active playbook',exact:true}).click();
 const hold=page.getByText('HOLD 1.5S TO RECORD LOCAL SELECTION',{exact:true}).first();await hold.waitFor();await hold.click();await page.waitForTimeout(200);assert.equal(await page.getByText('LOCAL SELECTION - NO ENGINE ACKNOWLEDGEMENT',{exact:true}).count(),0);await hold.focus();await page.keyboard.down('Enter');await page.waitForTimeout(1650);await page.keyboard.up('Enter');await page.getByText('LOCAL SELECTION - NO ENGINE ACKNOWLEDGEMENT',{exact:true}).first().waitFor();checks.push('reduced motion: short click does not execute; deliberate keyboard hold records only a local selection');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const fallback=await context.newPage();await fallback.addInitScript(()=>{Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined,configurable:true});});await fallback.goto(`${base}/?skipIntro=1`);await fallback.locator('[data-spatial-fallback]').waitFor();await fallback.getByRole('button',{name:'Review active playbook',exact:true}).click();await fallback.waitForFunction(()=>document.querySelector('.workbench-frame').dataset.phase==='ACT');checks.push('no-WebGL alert-to-action path stays available in 2D');await fallback.close();
 await writeFile(join(artifacts,'results.json'),JSON.stringify({passed:true,checks,layouts},null,2));console.log(`Phase 8 browser checks passed. Artifacts: ${artifacts}`);
}catch(error){console.error(`Phase 8 artifacts: ${artifacts}`);throw error;}finally{await browser?.close();await new Promise(r=>server.httpServer.close(r));}
