import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),app=join(root,'ares-cockpit');
const {preview}=await import(pathToFileURL(join(app,'node_modules/vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const artifacts=await mkdtemp(join(tmpdir(),'ares-anatomy-phase7-')),server=await preview({root:app,server:{hmr:false},preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'}),base=`http://127.0.0.1:${server.httpServer.address().port}`;
let browser;const checks=[],measurements=[];
try{
 browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
 const context=await browser.newContext({viewport:{width:1500,height:1050}}),external=[],writes=[];
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===base)return r.continue();if(u.hostname!=='127.0.0.1')external.push(u.href);return r.abort();});
 await context.routeWebSocket('**/*',()=>{});context.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=(model='hra-female-partial-reference',system='cardiovascular')=>page.locator(`[data-reference-model="${model}"][data-loaded-system="${system}"][data-ready="true"]`).waitFor();
 const choose=async model=>{await page.getByRole('combobox',{name:'Reference model',exact:true}).selectOption(model);await ready(model==='female-hra'?'hra-female-partial-reference':'z-anatomy-existing-reference');};
 await page.goto(`${base}/anatomy`);await ready('z-anatomy-existing-reference');await choose('female-hra');
 await page.getByRole('region',{name:'Female reference limitations',exact:true}).waitFor();
 await page.getByText('Missing mandatory coverage',{exact:true}).click();for(const label of ['Soleus muscle (bilateral)','Calcaneus (bilateral)','Optic nerve sheath'])await page.getByText(new RegExp(label.replaceAll('(','\\(').replaceAll(')','\\)'))).first().waitFor();
 // List and actual surface anchor share the exact source identity.
 await page.locator('[data-structure-id]').first().click();const selected=await page.locator('[data-structure-id]').first().getAttribute('data-structure-id');
 await page.getByRole('button',{name:'Isolate selection',exact:true}).click();const canvas=page.locator('[data-anatomy-canvas] canvas');await canvas.focus();await page.keyboard.press('Enter');
 if(!await page.getByText(/^Surface anchor:/).count()){
  const box=await canvas.boundingBox();for(const y of [.4,.5,.6])for(const x of [.4,.5,.6]){await page.mouse.click(box.x+x*box.width,box.y+y*box.height);if(await page.getByText(/^Surface anchor:/).count())break;}
 }
 await page.getByText(/^Surface anchor:/).waitFor();assert.equal(await page.locator('[data-anatomy-canvas]').getAttribute('data-selected-id'),selected);
 await page.getByRole('textbox',{name:'Reference note',exact:true}).fill('Female source note — keep in this revision');await page.getByRole('button',{name:'Save local note',exact:true}).click();await page.getByText('Reference note saved locally.',{exact:true}).waitFor();
 await page.screenshot({path:join(artifacts,'female-heart.png'),fullPage:true});checks.push('distinct female geometry, visible gaps, exact source selection and real surface note');
 await choose('existing');await page.getByText('Select a source structure',{exact:true}).waitFor();assert.equal(await page.getByText(/^Surface anchor:/).count(),0);assert.equal(await page.getByText('Female source note — keep in this revision',{exact:true}).count(),0);
 await choose('female-hra');await page.locator(`[data-structure-id="${selected}"]`).click();await page.getByText('Female source note — keep in this revision',{exact:true}).waitFor();checks.push('model switching clears selection/coordinates and does not transplant notes; original model restores own notes');
 for(const system of ['skeletal','nervous','visceral','pelvis-v15','skeletal','cardiovascular']){
  await page.getByRole('combobox',{name:'Anatomical system',exact:true}).selectOption(system);await ready('hra-female-partial-reference',system);
  const bytes=Number(await page.locator('[data-owned-bytes]').getAttribute('data-owned-bytes'));assert.ok(bytes>0&&bytes<=64e6);measurements.push({system,bytes});
  const frame=await page.locator('[data-reference-frame]').innerText();assert.ok(frame.includes(system==='pelvis-v15'?'v1.5':'v1.10'));
 }
 checks.push('all female geometry chunks load within 64 MB; v1.5 remains visibly separate');
 await page.getByRole('combobox',{name:'Anatomical system',exact:true}).selectOption('muscular');await page.getByText('Source geometry unavailable for this system; no substitute loaded.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-owned-bytes]')?.getAttribute('data-owned-bytes')==='0'&&document.querySelector('[data-gpu-geometries]')?.getAttribute('data-gpu-geometries')==='0');
 assert.equal(await page.getByRole('button',{name:'Show all',exact:true}).isDisabled(),true);checks.push('missing muscular system unloads geometry rather than substituting male anatomy');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(artifacts,'mobile-debug.png'),fullPage:true});
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('main *')].map(el=>({tag:el.tagName,cls:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,text:el.textContent.slice(0,80)})).filter(x=>x.right>innerWidth+1||x.left<0).slice(0,15));assert.deepEqual(overflow,[]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:join(artifacts,'female-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);
 await page.route('**/anatomy/female-hra/cardio*.glb',r=>r.fulfill({status:404,body:'missing'}));await page.getByRole('combobox',{name:'Anatomical system',exact:true}).selectOption('cardiovascular');await page.getByText(/Reference unavailable:/).waitFor();
 await page.locator('[data-structure-id]').first().click();await page.locator('[data-selected-source]').filter({hasText:/VH_F/}).waitFor();checks.push('missing female asset leaves source details available');
 await writeFile(join(artifacts,'results.json'),JSON.stringify({passed:true,checks,measurements},null,2));console.log(`Phase 7 browser checks passed. Artifacts: ${artifacts}`);
}finally{await browser?.close();await new Promise(r=>server.httpServer.close(r));}
