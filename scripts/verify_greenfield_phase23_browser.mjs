// Requires installed cockpit deps and the same external Playwright/Chrome paths as phase01.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {createServer}=await import(pathToFileURL(join(root,'ares-cockpit/node_modules/vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const artifacts=await mkdtemp(join(tmpdir(),'ares-greenfield-phase23-'));
process.env.VITE_ARES_HTTP_URL='http://127.0.0.1:19879';
const vite=await createServer({root:join(root,'ares-cockpit'),server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];
try {
 await vite.listen();const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
 for(const reducedMotion of ['no-preference','reduce']) {
  const page=await browser.newPage({reducedMotion});await page.goto(`${base}/tests/phase23-harness.html`);
  const button=page.getByRole('button',{name:/Press and hold/});await button.waitFor();
  await button.click();await sleep(1700);assert.equal(await page.locator('output').innerText(),'0');
  await button.focus();await page.keyboard.down('Enter');await sleep(1700);await page.keyboard.up('Enter');
  assert.equal(await page.locator('output').innerText(),'1');
  const box=await button.boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();
  await sleep(1700);await page.mouse.up();assert.equal(await page.locator('output').innerText(),'2');
  await button.focus();await page.keyboard.down(' ');await sleep(150);await page.locator('#other').focus();
  await sleep(1700);await page.keyboard.up(' ');assert.equal(await page.locator('output').innerText(),'2');
  checks.push(`pointer/keyboard/blur confirmation: ${reducedMotion}`);await page.close();
 }
 for(const mode of ['no-webgl','renderer-failure','context-loss','asset-failure','speech-rejected','local-speech-error']) {
  console.log(`Checking ${mode}`);
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:19879/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.routeWebSocket('ws://127.0.0.1:19879/ws/telemetry',ws=>ws.close({code:1012,reason:'offline contract test'}));
  await page.addInitScript(({mode})=>{
    window.__speechStarts=0;
    if(mode==='no-webgl') Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined,configurable:true});
    if(mode==='renderer-failure') {
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};
    }
    window.SpeechRecognition=class {
      constructor(){if(mode==='local-speech-error')this.processLocally=false;}
      start(){window.__speechStarts++;if(this.processLocally!==true)throw Error('Remote recognition attempted');this.onerror?.();}
      stop(){} abort(){}
    };
  },{mode});
  await page.goto(base);await page.getByRole('banner',{name:'ARES-Health Telemetry Horizon Bar'}).waitFor().catch(async e=>{console.error(mode,errors,await page.locator('#root').innerHTML());throw e;});
  if(mode==='no-webgl'||mode==='renderer-failure') {
    await page.locator('[data-spatial-fallback="true"]').waitFor();
    await page.getByRole('button',{name:/02 EVALUATE/}).click();await page.locator('[data-clinical-field="mri"]').waitFor();
    await page.getByRole('button',{name:/03 ACT/}).click();await page.getByRole('group',{name:'Select MedOps Playbook #01 through #15'}).waitFor();
    assert.equal(errors.length,0);await page.screenshot({path:join(artifacts,`${mode}.png`)});
    if(mode==='no-webgl') {
      const note=page.getByRole('button',{name:/Press and hold/}).first();await note.waitFor();
      const box=await note.boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await sleep(1700);await page.mouse.up();
      await page.getByRole('button',{name:'AUDIT [L]',exact:true}).click();
      await page.getByRole('button',{name:'VERIFY LOCAL HASHES / ENGINE LINKS',exact:true}).click();
      await page.getByText(/Local note hashes verified \(1\)/).waitFor();
      assert.equal(await page.getByText(/MEDOPS EXECUTED/).count(),0);
      checks.push('App local note and true hash verification');
    }
  } else if(mode==='context-loss'||mode==='asset-failure') {
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('canvas')).some(c=>c.getAttribute('data-engine')?.includes('three')));
    if(mode==='context-loss') {
      await page.evaluate(()=>{const c=Array.from(document.querySelectorAll('canvas')).find(c=>c.getAttribute('data-engine')?.includes('three'));
        window.__loseExtension=c.getContext('webgl2').getExtension('WEBGL_lose_context');if(!window.__loseExtension)throw Error('Required context-loss extension unavailable');window.__loseExtension.loseContext();});
      await page.locator('[data-spatial-fallback="true"]').waitFor();
      await sleep(1000);await page.evaluate(()=>window.__loseExtension.restoreContext());
      await page.locator('[data-spatial-fallback="true"]').waitFor({state:'detached'});
    } else {
      await page.route('**/anatomy/*.glb',r=>r.fulfill({status:200,contentType:'model/gltf-binary',body:'invalid glb fixture'}));
      await page.getByRole('button',{name:'SKELETAL GLB',exact:true}).click();await sleep(700);
    }
    await page.getByRole('button',{name:/03 ACT/}).click();await page.getByRole('group',{name:'Select MedOps Playbook #01 through #15'}).waitFor();
    assert.equal(errors.length,0);
  } else {
    await page.getByRole('button' ,{name:'VOICE [V]',exact:true}).first().click();
    await sleep(400);assert.equal(await page.evaluate(()=>window.__speechStarts),mode==='speech-rejected'?0:1);
    assert.equal(errors.length,0);
  }
  checks.push(mode);await page.close();
 }
 await writeFile(join(artifacts,'results.json'),JSON.stringify({passed:true,checks},null,2));
 console.log(`Phase 2 browser checks passed: ${checks.join(', ')}. Artifacts: ${artifacts}`);
} finally {if(browser)await browser.close();await vite.close();}
