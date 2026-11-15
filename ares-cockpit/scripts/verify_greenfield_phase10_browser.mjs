// Headless Chrome CDP verification harness for ARES-Health Phase D UI Parity (`1200x788`).
// Starts local `vite preview`, opens `/Applications/Google Chrome.app` headless over DevTools WS,
// exercises `CMD+K` (30 playbooks across 4 domains), bidirectional `Male | Female` + profile popover,
// `Gates 1..7` matrix, `HOLD 1.5S TO RECORD LOCAL SELECTION`, `backdropFilterCount <= 4`,
// single-row HorizonBar layout, and verifies `0` console/runtime errors.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, '..');
const CHROME_BIN =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startVitePreview() {
  const proc = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '0', '--strictPort'], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';

  const previewUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for vite preview URL.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`));
    }, 15000);

    const onData = (chunk, isErr = false) => {
      const text = chunk.toString('utf8');
      if (isErr) stderrBuf += text;
      else stdoutBuf += text;
      const combined = stdoutBuf + '\n' + stderrBuf;
      const match = combined.match(/https?:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };

    proc.stdout.on('data', (c) => onData(c, false));
    proc.stderr.on('data', (c) => onData(c, true));
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`vite preview exited prematurely with code ${code}\n${stderrBuf}`));
    });
  });

  return { proc, previewUrl };
}

async function startHeadlessChrome(userDataDir, initialUrl) {
  const proc = spawn(
    CHROME_BIN,
    [
      '--headless=new',
      '--disable-gpu-sandbox',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1200,788',
      '--no-first-run',
      '--no-default-browser-check',
      initialUrl,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderrBuf = '';
  const cdpHttpUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for Chrome DevTools WS.\nstderr: ${stderrBuf}`));
    }, 15000);

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        const wsUrl = new URL(match[1]);
        resolve(`http://127.0.0.1:${wsUrl.port}`);
      }
    });

    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited prematurely (${code})\n${stderrBuf}`));
    });
  });

  return { proc, cdpHttpUrl };
}

async function createCdpClient(cdpHttpUrl) {
  let pageTarget = null;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${cdpHttpUrl}/json/list`);
    const targets = await res.json();
    pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (pageTarget) break;
    await sleep(100);
  }
  assert.ok(pageTarget, 'Expected an open Chrome page target');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', (err) => reject(err), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  const runtimeExceptions = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
      consoleErrors.push(text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      runtimeExceptions.push(
        msg.params?.exceptionDetails?.exception?.description ??
          msg.params?.exceptionDetails?.text ??
          'Unknown Runtime.exceptionThrown',
      );
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evalJs = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Page eval exception: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`,
      );
    }
    return res.result?.value;
  };

  return { ws, send, evalJs, consoleErrors, runtimeExceptions };
}

async function runVerification() {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-phase10-chrome-'));
  let previewProc = null;
  let chromeProc = null;
  let ws = null;

  try {
    const preview = await startVitePreview();
    previewProc = preview.proc;

    const chrome = await startHeadlessChrome(userDataDir, preview.previewUrl);
    chromeProc = chrome.proc;

    const client = await createCdpClient(chrome.cdpHttpUrl);
    ws = client.ws;

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 788,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Wait for workbench scaffold & HorizonBar to hydrate
    for (let i = 0; i < 60; i++) {
      const ready = await client.evalJs(
        `Boolean(document.querySelector('#horizon-phase-act') && document.querySelector('[data-testid="horizon-sex-female"]'))`,
      );
      if (ready) break;
      await sleep(100);
    }

    // Dismiss skippable preloader if visible so interactions hit clean workspace
    await client.evalJs(`(() => {
      const skipBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        /skip/i.test(b.textContent || ''),
      );
      if (skipBtn) skipBtn.click();
    })()`);
    await sleep(250);

    // 1. Check HorizonBar single-row geometry & global backdropFilter budget <= 4 at 1200x788
    const layoutMetrics = await client.evalJs(`(() => {
      const header = document.querySelector('header[role="banner"]');
      const rect = header ? header.getBoundingClientRect() : null;
      const all = Array.from(document.querySelectorAll('*'));
      let blurCount = 0;
      for (const el of all) {
        const cs = window.getComputedStyle(el);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
        if (bf && bf !== 'none' && cs.display !== 'none' && cs.visibility !== 'hidden') {
          blurCount++;
        }
      }
      return {
        horizonHeight: rect ? Math.round(rect.height) : null,
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        backdropFilterCount: blurCount,
      };
    })()`);

    assert.ok(
      layoutMetrics.horizonHeight !== null && layoutMetrics.horizonHeight <= 44,
      `HorizonBar height at 1200x788 must be <= 44px, got ${layoutMetrics.horizonHeight}`,
    );
    assert.ok(
      layoutMetrics.docScrollWidth <= layoutMetrics.innerWidth + 1,
      `Horizontal overflow detected: scrollWidth=${layoutMetrics.docScrollWidth} > innerWidth=${layoutMetrics.innerWidth}`,
    );
    assert.ok(
      layoutMetrics.backdropFilterCount <= 4,
      `backdropFilterCount must be <= 4, got ${layoutMetrics.backdropFilterCount}`,
    );

    // 2. Bidirectional Male | Female switcher + CrewBiologicalProfile popover
    await client.evalJs(`document.querySelector('[data-testid="horizon-sex-female"]')?.click()`);
    await sleep(120);
    const femaleSynced = await client.evalJs(
      `document.querySelector('[data-testid="hud-sex-female"]')?.getAttribute('aria-pressed') === 'true'`,
    );
    assert.equal(femaleSynced, true, 'HUD Female button must sync when HorizonBar selects Female');

    await client.evalJs(`document.querySelector('[data-testid="horizon-bio-profile-trigger"]')?.click()`);
    await sleep(100);
    const bioPopoverText = await client.evalJs(
      `document.querySelector('[data-testid="horizon-bio-profile-popover"]')?.textContent ?? ''`,
    );
    assert.ok(
      bioPopoverText.includes('CrewBiologicalProfile (FEMALE)'),
      `Expected CrewBiologicalProfile (FEMALE) popover, got: ${bioPopoverText}`,
    );
    await client.evalJs(`document.querySelector('[data-testid="horizon-bio-profile-trigger"]')?.click()`);
    await sleep(80);

    await client.evalJs(`document.querySelector('[data-testid="hud-sex-male"]')?.click()`);
    await sleep(120);
    const maleSynced = await client.evalJs(
      `document.querySelector('[data-testid="horizon-sex-male"]')?.getAttribute('aria-pressed') === 'true'`,
    );
    assert.equal(maleSynced, true, 'HorizonBar Male button must sync when HUD selects Male');

    // 3. CMD+K Palette: 4 Aerospace 360 domains + #01..=#30 search
    await client.evalJs(`document.querySelector('#horizon-btn-palette')?.click()`);
    await sleep(150);
    const paletteInfo = await client.evalJs(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label*="Command Palette"]');
      const domainBtns = Array.from(document.querySelectorAll('[data-testid^="cmd-domain-"]')).map((b) => b.textContent);
      return { open: Boolean(dialog), domainBtns };
    })()`);
    assert.equal(paletteInfo.open, true, 'CMD+K Command Palette dialog must open');
    assert.equal(paletteInfo.domainBtns.length, 5, 'Expected ALL 30 + 4 Aerospace 360 domain tabs');

    await client.evalJs(`document.querySelector('[data-testid="cmd-domain-RADIATION_EVA_THERMAL"]')?.click()`);
    await sleep(100);
    const domainPlaybooksText = await client.evalJs(
      `document.querySelector('[role="dialog"]')?.textContent ?? ''`,
    );
    assert.ok(
      domainPlaybooksText.includes('MEDOPS:#16') && domainPlaybooksText.includes('Sepsis'),
      'Expected Playbook #16 Sepsis in Radiation/EVA/Thermal or Aerospace 360 filtered palette',
    );
    await client.evalJs(`(() => {
      const escBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent && b.textContent.includes('[ESC] CANCEL'),
      );
      if (escBtn) escBtn.click();
    })()`);
    await sleep(120);

    // 4. Switch to 03 ACT -> verify Gates 1..7 matrix + Playbook #30 + HOLD 1.5S button
    await client.evalJs(`document.querySelector('#horizon-phase-act')?.click()`);
    await sleep(220);

    const actMetrics = await client.evalJs(`(() => {
      const pills = Array.from(document.querySelectorAll('#gates-1-to-7-pill-matrix [data-testid^="gate-pill-"]'))
        .map((b) => b.getAttribute('data-testid'));
      const hasHold = document.body.textContent.includes('HOLD 1.5S TO RECORD LOCAL SELECTION');
      return { pills, hasHold };
    })()`);
    assert.equal(actMetrics.pills.length, 10, `Expected 10 pills in Gates 1..7 matrix, got ${actMetrics.pills.length}`);
    assert.equal(actMetrics.hasHold, true, 'Expected HOLD 1.5S TO RECORD LOCAL SELECTION CTA in 03 ACT');

    await client.evalJs(`document.querySelector('[data-testid="gate-pill-5A"]')?.click()`);
    await sleep(100);
    const expandedGateText = await client.evalJs(
      `document.querySelector('[data-testid="gate-expanded-rationale"]')?.textContent ?? ''`,
    );
    assert.ok(expandedGateText.includes('GATE 5A'), `Expected Gate 5A rationale row, got: ${expandedGateText}`);

    await client.evalJs(`document.querySelector('[data-testid="dag-domain-ENDOCRINE_RENAL_BEHAVIORAL"]')?.click()`);
    await sleep(100);
    const dagEndocrineText = await client.evalJs(
      `document.querySelector('#clinical-phase-dock')?.textContent ?? ''`,
    );
    assert.ok(dagEndocrineText.includes('#30 FEMALE POCUS'), 'Expected Playbook #30 in Endocrine/Renal/Behavioral DAG tab');

    // 5. Switch to 02 EVALUATE -> verify discrete MRI counter
    await client.evalJs(`document.querySelector('#horizon-phase-evaluate')?.click()`);
    await sleep(200);
    const mriPresent = await client.evalJs(
      `Boolean(document.querySelector('[data-clinical-field="mri"]'))`,
    );
    assert.equal(mriPresent, true, 'Expected Readiness (MRI) counter in 02 EVALUATE');

    assert.equal(
      client.consoleErrors.length,
      0,
      `Expected 0 console.error messages, saw: ${JSON.stringify(client.consoleErrors)}`,
    );
    assert.equal(
      client.runtimeExceptions.length,
      0,
      `Expected 0 uncaught runtime exceptions, saw: ${JSON.stringify(client.runtimeExceptions)}`,
    );

    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          viewport: '1200x788',
          horizonHeightPx: layoutMetrics.horizonHeight,
          docScrollWidth: layoutMetrics.docScrollWidth,
          backdropFilterCount: layoutMetrics.backdropFilterCount,
          gates1To7Count: actMetrics.pills.length,
          holdCtaPreserved: actMetrics.hasHold,
          consoleErrors: client.consoleErrors.length,
          runtimeExceptions: client.runtimeExceptions.length,
        },
        null,
        2,
      ),
    );
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {
        // Ignore
      }
    }
    if (chromeProc) chromeProc.kill('SIGTERM');
    if (previewProc) previewProc.kill('SIGTERM');
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

await runVerification();
