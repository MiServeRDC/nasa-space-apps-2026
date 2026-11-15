// Production assets only. No external network; local backend requests may be mocked for provenance checks.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),app=join(root,'ares-cockpit');
const {preview,createServer}=await import(pathToFileURL(join(app,'node_modules/vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const artifacts=await mkdtemp(join(tmpdir(),'ares-anatomy-phase6-'));
const server=await preview({root:app,server:{hmr:false},preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
let browser;const checks=[],measurements=[];
try{
 browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
 const context=await browser.newContext({viewport:{width:1560,height:1100}}),blocked=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base||u.protocol==='data:')return route.continue();if(u.hostname!=='127.0.0.1')blocked.push(u.href);return route.abort();});
 // Produce a schema-valid fixture from the same adapter, with unsupported channels removed.
 const vite=await createServer({root:app,configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
 let snapshot;
 try{const {buildPacket,DEFAULT_WHATIF}=await vite.ssrLoadModule('/src/lib/scenario.ts');snapshot=buildPacket(DEFAULT_WHATIF,0,null,0);}finally{await vite.close();}
 snapshot.is_local_simulation=false;snapshot.source_record_id='reference-null-channels';
 snapshot.provenance_manifest.biometrics_source='RECORDED_TERRESTRIAL_BIDMC_CSV';snapshot.provenance_manifest.scenario_overlay_mode='NONE_PURE_REPLAY';
 snapshot.biometrics.hrv_rmssd_ms=null;snapshot.hemodynamics=null;snapshot.musculoskeletal=null;snapshot.renal_nephrolithiasis=null;
 const writes=[];context.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 await context.route('**/api/snapshot',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...snapshot,timestamp_ms:Date.now()})}));
 await context.routeWebSocket('**/*',()=>{});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=async(p=page,system='cardiovascular')=>p.locator(`[data-reference-status][data-ready="true"][data-loaded-system="${system}"]`).waitFor();
 await page.goto(`${base}/anatomy`);await ready();
 const canvas=page.locator('[data-anatomy-canvas] canvas');await canvas.waitFor();
 await page.getByRole('searchbox',{name:'Search source structures'}).fill('Internal jugular vein.r / mesh node');
 const target=page.locator('[data-structure-id]').first();await target.focus();await page.keyboard.press('Enter');
 const selectedId=await target.getAttribute('data-structure-id');
 await page.getByRole('button',{name:'Isolate selection',exact:true}).click();
 await page.locator('[data-source-record="reference-null-channels"]').first().waitFor();
 for(const field of ['ijvCsa','ijvVelocity','ijvShear'])assert.equal(await page.locator(`[data-reference-clinical="${field}"]`).getAttribute('data-clinical-availability'),'UNAVAILABLE');
 // Scan actual screen-space rays against the isolated source mesh, never dispatch selection directly.
 const clickSurface=async(p,c,touch=false)=>{
  const box=await c.boundingBox();
  for(const y of [.5,.4,.6,.3,.7])for(const x of [.5,.4,.6,.3,.7]){
   if(touch)await p.touchscreen.tap(box.x+box.width*x,box.y+box.height*y);else await p.mouse.click(box.x+box.width*x,box.y+box.height*y);
   if(await p.getByText(/^Surface anchor:/).count())return;
  }throw Error('No actual surface ray intersection');
 };
 await canvas.focus();await page.keyboard.press('Enter');await page.getByText(/^Surface anchor:/).waitFor();checks.push('keyboard Enter casts a real center ray for a coordinate anchor');
 await clickSurface(page,canvas);assert.equal(await page.locator('[data-anatomy-canvas]').getAttribute('data-selected-id'),selectedId);
 await page.getByRole('textbox',{name:'Reference note',exact:true}).fill('Offline reference review — exact source only');
 await page.getByRole('button',{name:'Save local note',exact:true}).click();await page.getByText('Reference note saved locally.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Open supported region in cockpit'}).getAttribute('href'),'/?phase=EVALUATE&anatomyRegion=InternalJugularVein');
 await page.screenshot({path:join(artifacts,'atlas-selected.png'),fullPage:true});checks.push('keyboard source selection, isolation, actual pointer ray, exact anchored note and supported clinical link');
 await page.reload();await ready();await page.getByRole('searchbox',{name:'Search source structures'}).fill('Internal jugular vein.r / mesh node');await page.locator(`[data-structure-id="${selectedId}"]`).click();
 await page.getByText('Offline reference review — exact source only',{exact:true}).waitFor();checks.push('revision-bound notes survive reload');
 for(const id of ['skeletal','muscular','visceral','nervous','cardiovascular','skeletal','nervous','muscular']){
  await page.getByRole('combobox',{name:'Anatomical system',exact:true}).selectOption(id);await ready(page,id);
  const output=page.locator('[data-owned-bytes]');const bytes=Number(await output.getAttribute('data-owned-bytes'));assert.ok(bytes>0&&bytes<=64e6);
  const expected={skeletal:44501928,muscular:33021258,cardiovascular:40306428,visceral:27679068,nervous:50047404};assert.equal(bytes,expected[id]);measurements.push({system:id,bytes});
  if(id==='muscular'){await page.getByRole('button',{name:'Show all',exact:true}).click();await page.getByText(/Batch memory budget exceeded/).waitFor();assert.equal(Number(await output.getAttribute('data-owned-bytes')),bytes);}
 }
 checks.push('eight real system switches remain bounded; muscular show-all rejects without losing prior view');
 await page.getByRole('combobox',{name:'Anatomical system',exact:true}).selectOption('nervous');await ready(page,'nervous');assert.ok(await page.getByRole('button',{name:'optic sheath — missing',exact:true}).isDisabled());
 await page.getByRole('combobox',{name:'Anatomical system',exact:true}).selectOption('visceral');await ready(page,'visceral');await page.getByRole('button',{name:'kidneys',exact:true}).click();
 assert.equal(await page.getByRole('link',{name:'Open supported region in cockpit'}).count(),0);checks.push('missing optic sheath explicit; kidneys do not invent a backend region');
 await page.getByRole('combobox',{name:'Anatomical system',exact:true}).selectOption('none');
 await page.waitForFunction(()=>document.querySelector('[data-owned-geometries]')?.getAttribute('data-owned-geometries')==='0'&&document.querySelector('[data-gpu-geometries]')?.getAttribute('data-gpu-geometries')==='0');checks.push('unload releases CPU-owned geometry and GPU objects');
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(writes,[]);checks.push('recorded-source null clinical channels stay unavailable; selection sends no What-If POST');
 // Touch uses real PointerEvents and the same source map.
 const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await mobile.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await mobile.routeWebSocket('**/*',()=>{});
 const touch=await mobile.newPage();await touch.goto(`${base}/anatomy`);await ready(touch);
 await touch.getByRole('searchbox',{name:'Search source structures'}).fill('Internal jugular vein.r / mesh node');await touch.locator('[data-structure-id]').first().tap();
 await touch.getByRole('button',{name:'Isolate selection',exact:true}).tap();await touch.locator('[data-anatomy-canvas] canvas').scrollIntoViewIfNeeded();
 await clickSurface(touch,touch.locator('[data-anatomy-canvas] canvas'),true);assert.ok(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await touch.screenshot({path:join(artifacts,'atlas-mobile.png')});await mobile.close();checks.push('mobile touch ray and no horizontal overflow');
 for(const mode of ['no-webgl','missing-file','corrupt-file','storage-denied']){
  const p=await context.newPage(),failures=[];p.on('pageerror',e=>failures.push(e.message));
  if(mode==='no-webgl')await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};});
  if(mode==='missing-file')await p.route('**/anatomy/CardioVascular41.glb',r=>r.fulfill({status:404,body:'missing'}));
  if(mode==='corrupt-file')await p.route('**/anatomy/CardioVascular41.glb',r=>r.fulfill({status:200,body:'invalid'}));
  if(mode==='storage-denied')await p.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage denied','SecurityError');};});
  await p.goto(`${base}/anatomy`);
  if(['missing-file','corrupt-file'].includes(mode))await p.getByText(/Reference unavailable:/).waitFor();else await ready(p);
  if(mode==='no-webgl')await p.getByText('3D unavailable; use structure buttons.',{exact:true}).waitFor();
  await p.getByRole('searchbox',{name:'Search source structures'}).fill('Internal jugular vein.r / mesh node');await p.locator('[data-structure-id]').first().click();
  if(mode==='storage-denied'){
   await p.getByRole('button',{name:'Isolate selection',exact:true}).click();await clickSurface(p,p.locator('[data-anatomy-canvas] canvas'));
   await p.getByRole('textbox',{name:'Reference note',exact:true}).fill('Should not persist');await p.getByRole('button',{name:'Save local note',exact:true}).click();await p.getByText(/Note not saved:/).waitFor();
  }
  assert.deepEqual(failures,[]);await p.close();checks.push(`${mode}: clear fallback; source details remain usable`);
 }
 await writeFile(join(artifacts,'results.json'),JSON.stringify({passed:true,checks,measurements},null,2));console.log(`Phase 6 browser checks passed. Artifacts: ${artifacts}`);
}finally{await browser?.close();await new Promise(r=>server.httpServer.close(r));}
