// Qualification of the built offline fixture tool. Run npm run build first.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),app=join(root,'ares-cockpit');
const {preview}=await import(pathToFileURL(join(app,'node_modules/vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const artifacts=await mkdtemp(join(tmpdir(),'ares-anatomy-phase5-'));
const server=await preview({root:app,preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
let browser;const denied=[],checks=[],measurements=[];
try{
 browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base||u.protocol==='data:')return route.continue();denied.push(u.href);return route.abort();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=(lod=0,codec='meshopt')=>page.locator(`[data-anatomy-status][data-loaded-key="${lod}-${codec}"]`).waitFor();
 await page.goto(`${base}/anatomy-lab`);await ready();
 const canvas=page.locator('[data-anatomy-canvas] canvas');await canvas.waitFor();
 const point=async side=>{const box=await canvas.boundingBox();return {x:box.x+box.width/2+(side==='left'?-.65/(4-.55):.65/4)*(box.height/2)/Math.tan(40*Math.PI/360),y:box.y+box.height/2};};
 await page.mouse.click(...Object.values(await point('left')));await page.getByText('Selected: calibration-cover',{exact:true}).waitFor();
 await page.getByRole('checkbox',{name:'Show calibration cover',exact:true}).uncheck();
 await page.mouse.click(...Object.values(await point('left')));await page.getByText('Selected: calibration-left',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:'Reference detail',exact:true}).selectOption('1');await ready(1);
 await page.mouse.click(...Object.values(await point('right')));await page.getByText('Selected: calibration-right',{exact:true}).waitFor();
 checks.push('actual ray selection after batching, hidden-front rejection and LOD switch');
 await page.getByRole('button',{name:'calibration left',exact:true}).focus();await page.keyboard.press('Enter');
 await page.getByText('Selected: calibration-left',{exact:true}).waitFor();checks.push('keyboard structure selection');
 await page.getByRole('checkbox',{name:'Show calibration cover',exact:true}).check();
 for(let i=0;i<12;i++){
  const lod=i%2;await page.getByRole('combobox',{name:'Reference detail',exact:true}).selectOption(String(lod));await ready(lod);
  await page.waitForFunction(()=>Number(document.querySelector('[data-gpu-geometries]')?.getAttribute('data-gpu-geometries'))===2);
  const values=await page.locator('[data-owned-geometries]').evaluate(el=>({geometries:Number(el.dataset.ownedGeometries),materials:Number(el.dataset.ownedMaterials),bytes:Number(el.dataset.ownedBytes)}));
  assert.equal(values.geometries,5);assert.equal(values.materials,2);measurements.push(values);
 }
 await page.getByRole('combobox',{name:'Reference model',exact:true}).selectOption('none');
 await page.waitForFunction(()=>document.querySelector('[data-owned-geometries]')?.getAttribute('data-owned-geometries')==='0'&&document.querySelector('[data-gpu-geometries]')?.getAttribute('data-gpu-geometries')==='0');
 await page.getByText('Selected: none',{exact:true}).waitFor();checks.push('12 repeated switches bounded; unload releases CPU ownership and GPU geometry');
 await page.getByRole('combobox',{name:'Reference model',exact:true}).selectOption('fixture');await ready(1);
 await page.getByRole('checkbox',{name:'Use local Meshopt',exact:true}).uncheck();await ready(1,'plain');
 await page.screenshot({path:join(artifacts,'reference-tool.png')});checks.push('production plain/Meshopt chunks load with non-loopback requests blocked');
 assert.deepEqual(errors,[]);assert.deepEqual(denied,[]);
 await page.close();
 for(const mode of ['no-webgl','missing-codec','corrupt-file','failed-chunk']){
  const p=await context.newPage();const failures=[];p.on('pageerror',e=>failures.push(e.message));
  if(mode==='no-webgl')await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};});
  if(mode==='missing-codec')await p.addInitScript(()=>{window.WebAssembly=undefined;});
  if(mode==='corrupt-file')await p.route('**/anatomy/fixture/*-meshopt.glb',r=>r.fulfill({status:200,body:'broken glb fixture'}));
  if(mode==='failed-chunk')await p.route('**/anatomy/fixture/*-meshopt.glb',r=>r.fulfill({status:404,body:'missing'}));
  await p.goto(`${base}/anatomy-lab`);await p.getByRole('heading',{name:'Reference anatomy pipeline laboratory'}).waitFor();
  if(mode==='no-webgl')await p.getByText('3D unavailable; use structure buttons.',{exact:true}).waitFor();
  else await p.getByText(/Reference unavailable:/).waitFor();
  await p.getByRole('button',{name:'calibration right',exact:true}).click();await p.getByText('Selected: calibration-right',{exact:true}).waitFor();
  if(mode==='missing-codec'){await p.getByRole('checkbox',{name:'Use local Meshopt',exact:true}).uncheck();await p.locator('[data-loaded-key="0-plain"]').waitFor();}
  assert.deepEqual(failures,[]);checks.push(`${mode}: DOM structure selection survives`);await p.close();
 }
 await writeFile(join(artifacts,'results.json'),JSON.stringify({passed:true,checks,measurements,denied},null,2));console.log(`Phase 5 browser checks passed. Artifacts: ${artifacts}`);
}finally{if(browser)await browser.close();await new Promise(r=>server.httpServer.close(r));}
