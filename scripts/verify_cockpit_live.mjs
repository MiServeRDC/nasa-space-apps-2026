#!/usr/bin/env node
/** Production-browser integration qualification against an owned real Rust process.
 * Prerequisites: npm ci in ares-cockpit; cargo build -p ares-server-cli --bin ares-server-cli;
 * PLAYWRIGHT_MODULE points to an installed playwright/playwright-core module.
 * See docs/evaluation/FINAL_INTEGRATION_QUALIFICATION.md for scope and reproduction.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cockpit = path.join(root, 'ares-cockpit');
const artifacts = process.env.ARES_QUALIFICATION_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ares-live-'));
fs.mkdirSync(artifacts, { recursive: true });
const checks = [], errors = [], external = [], responses = [];
let server, browser, backend, logFd;
let frames = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = (name, details = {}) => { checks.push({ name, ...details }); console.log(`PASS ${name}`); };
const save = (name, value) => fs.writeFileSync(path.join(artifacts, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
async function port() {
  const s = net.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p;
}
async function until(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { const value = await fn(); if (value) return value; } catch (e) { lastError = e; }
    await delay(250);
  }
  throw new Error(`Condition timed out after ${timeout} ms${lastError ? `: ${lastError}` : ''}`);
}
async function command(program, args, env, logfile) {
  const fd = fs.openSync(path.join(artifacts, logfile), 'w');
  try {
    const child = spawn(program, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', fd, fd] });
    const [code, signal] = await once(child, 'exit'); assert.equal(code, 0, `${program} failed (${signal ?? code}); see ${logfile}`);
  } finally { fs.closeSync(fd); }
}
async function stopBackend() {
  if (!backend || backend.exitCode !== null || backend.signalCode !== null) return;
  const child = backend;
  const exited = once(child, 'exit'); child.kill('SIGINT');
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  try { const [code] = await exited; assert.equal(code, 0, 'Rust graceful shutdown'); } finally { clearTimeout(timer); backend = null; }
}

try {
  const backendPort = await port(), frontendPort = await port();
  const api = `http://127.0.0.1:${backendPort}`, origin = `http://127.0.0.1:${frontendPort}`;
  const request = async (endpoint, body) => {
    const res = await fetch(api + endpoint, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.ok(res.ok, `${endpoint}: HTTP ${res.status} ${await (res.ok ? Promise.resolve('') : res.text())}`);
    return res;
  };
  const json = async (endpoint, body) => (await request(endpoint, body)).json();
  const snapshot = () => json('/api/snapshot');
  const binary = path.resolve(process.env.ARES_SERVER_BINARY ?? path.join(process.env.CARGO_TARGET_DIR ?? path.join(root, 'target'), 'debug/ares-server-cli'));
  assert.ok(fs.existsSync(binary), 'Build ares-server-cli before running this probe');
  logFd = fs.openSync(path.join(artifacts, 'backend.log'), 'a');
  const startBackend = async () => {
    backend = spawn(binary, ['--mode', 'ws-only', '--bind', `127.0.0.1:${backendPort}`, '--storage-dir', path.join(artifacts, 'storage')], { cwd: root, stdio: ['ignore', logFd, logFd] });
    backend.on('error', error => errors.push(`backend: ${error}`));
    await until(async () => { assert.equal(backend.exitCode, null, 'backend exited early'); return (await snapshot()).timestamp_ms; });
  };
  await startBackend();
  const early = await fetch(api + '/api/inject-anomaly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'DESATURATION_FAST' }) });
  assert.equal(early.status, 409); record('injection is refused before physiological baseline learning');
  await command('npm', ['--prefix', cockpit, 'run', 'build'], { VITE_ARES_HTTP_URL: api }, 'production-build.log');
  const { preview } = await import(pathToFileURL(path.join(cockpit, 'node_modules/vite/dist/node/index.js')).href);
  server = await preview({ root: cockpit, preview: { host: '127.0.0.1', port: frontendPort, strictPort: true } });
  assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to an installed playwright or playwright-core module');
  const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH, headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (['http:', 'https:'].includes(u.protocol) && ![api, origin].includes(u.origin)) {
      external.push(u.href); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', res => { if (res.status() >= 400) responses.push({ status: res.status(), url: res.url() }); });
  page.on('websocket', socket => socket.on('framereceived', () => frames++));
  const phase = name => page.getByRole('navigation', { name: 'Cockpit pages' }).getByRole('button', { name, exact: true }).click();
  const body = () => page.locator('body').innerText();
  await page.goto(origin); await page.getByText('Engine connected', { exact: true }).waitFor();
  let s = await snapshot();
  assert.equal(s.biometrics.hrv_rmssd_ms, null); assert.equal(s.safety_margins.mission_readiness_index, null);
  assert.equal(s.provenance_manifest.scenario_overlay_mode, 'NONE_PURE_REPLAY');
  record('production cockpit receives real Rust telemetry; HRV and MRI remain null');
  assert.equal((await (await request('/api/binary-frame')).arrayBuffer()).byteLength, 128);
  const mcp = await json('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  assert.ok(mcp.result?.tools?.length > 0); record('binary HTTP transport and MCP discovery respond');
  await page.getByRole('combobox', { name: 'Mission profile' }).selectOption('ISS');
  await until(async () => (await snapshot()).what_if_overlay.cabin_ppco2_mmhg === 2);
  await phase('Evaluate'); await page.getByRole('combobox', { name: 'Simulation body profile' }).selectOption('FEMALE');
  await until(async () => (await snapshot()).aerospace_360.crew_profile.biological_sex === 'Female');
  s = await snapshot(); assert.equal(s.provenance_manifest.scenario_overlay_mode, 'NONE_PURE_REPLAY');
  assert.equal(s.environment, null); record('mission CO2 and female crew context sync without enabling simulated organ models');
  await phase('Act'); await page.getByRole('heading', { name: 'No procedure suggested', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirm step', exact: true }).count(), 0);
  record('pure replay ACT stays in standby instead of prescribing a modeled organ procedure');
  await page.getByText('Browse other procedures', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Browse procedures' }).selectOption({ index: 1 });
  assert.match(await body(), /Manual review/); record('catalog procedures require an explicit manual selection');
  await phase('Evaluate'); await page.getByRole('button', { name: 'Start mission simulation', exact: true }).click();
  await until(async () => (await snapshot()).what_if_overlay.active);
  s = await snapshot(); assert.equal(s.provenance_manifest.scenario_overlay_mode, 'SIMULATED_WHATIF_SCENARIO');
  assert.ok(s.hemodynamics); assert.equal(s.environment.cabin_ppco2_mmhg, 2); assert.equal(s.biometrics.hrv_rmssd_ms, null);
  await page.getByRole('button', { name: 'Return to recorded replay', exact: true }).click();
  await until(async () => !(await snapshot()).what_if_overlay.active);
  s = await snapshot(); assert.equal(s.hemodynamics, null); assert.equal(s.active_playbook.playbook_id, 'NONE');
  record('overlay on and off change backend mode and preserve unavailable replay HRV');
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Gather', 'Evaluate', 'Act']) {
      await phase(name); await delay(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${name} overflows by ${overflow}px at ${width}px`);
    }
  }
  await page.screenshot({ path: path.join(artifacts, 'mobile-act.png'), fullPage: true });
  record('all three pages fit 1440, 1024, 768 and 390 px widths');
  await page.setViewportSize({ width: 1440, height: 1000 }); await phase('Gather');
  console.log('Waiting for 120 s baseline; using actual replay time without acceleration.');
  await until(async () => (await snapshot()).vitals_anomaly.baseline_ready, 135000);
  s = await snapshot(); save('baseline.json', s); record('detector learns baseline from real-time replay');
  await page.getByRole('button', { name: 'DESATURATION', exact: true }).click();
  await page.getByText(/Vital-sign simulation active/).first().waitFor();
  await phase('Evaluate');
  await page.getByText('Desaturation simulation active', { exact: true }).waitFor();
  await page.getByText('Synthetic ultrasound is off', { exact: true }).waitFor();
  assert.equal((await snapshot()).what_if_overlay.active, false);
  record('Evaluate distinguishes an active vital-sign event from synthetic ultrasound being off');
  const timeline = []; const injectedAt = Date.now();
  await until(async () => {
    s = await snapshot(); timeline.push({ t: s.relative_recording_time_s, status: s.vitals_anomaly.overall, playbook: s.active_playbook.playbook_id });
    return s.vitals_anomaly.overall === 'ALARM';
  }, 45000);
  save('anomaly-timeline.json', timeline);
  assert.equal(s.provenance_manifest.biometrics_source, 'SIMULATED_SCENARIO_INPUT');
  assert.equal(s.active_playbook.playbook_id, 'PLAYBOOK_06_HYPOXEMIA_DESATURATION');
  await phase('Act'); await page.getByRole('heading', { name: 'Desaturation Below Personal Baseline', exact: true }).waitFor();
  assert.doesNotMatch(await body(), /SANS Translaminar Pressure & Venous Decongestion Protocol/);
  await page.getByRole('button', { name: 'Confirm step', exact: true }).click();
  await page.getByText('Do this now · Step 2 of 4', { exact: true }).waitFor();
  await phase('Evaluate'); await phase('Act'); await page.getByText('Do this now · Step 2 of 4', { exact: true }).waitFor();
  save('act-during-alarm.txt', await body()); await page.screenshot({ path: path.join(artifacts, 'act-during-alarm.png'), fullPage: true });
  record('real detector alarm selects oxygen procedure and preserves checklist through navigation', { elapsedMs: Date.now() - injectedAt });
  await phase('Gather'); await page.getByRole('button', { name: 'CLEAR', exact: true }).click();
  await until(async () => { s = await snapshot(); return !s.vitals_anomaly.injection && s.vitals_anomaly.overall !== 'ALARM'; }, 30000);
  await phase('Act'); await page.getByText('Do this now · Step 2 of 4', { exact: true }).waitFor();
  save('act-after-clear.txt', await body()); record('clearing synthetic event does not discard unfinished incident checklist');
  const storage = await json('/api/storage-status'); assert.equal(storage.enabled, true);
  assert.ok(storage.status.warm_segments_committed > 0); assert.equal(storage.status.warm_flush_failures, 0);
  const audit = await json('/api/audit-log'); assert.ok(Array.isArray(audit) && audit.length > 0);
  record('real process commits telemetry storage and exposes audit records', { segments: storage.status.warm_segments_committed, auditRecords: audit.length });
  const originalSource = (await snapshot()).source_record_id;
  await phase('Gather');
  await stopBackend();
  await until(async () => /Local simulation/.test(await body()), 12000);
  await startBackend();
  await page.getByText('Engine connected', { exact: true }).waitFor({ timeout: 20000 });
  await until(async () => {
    const match = /TERRESTRIAL REPLAY t=([0-9.]+)s/.exec(await body());
    return match && Number(match[1]) < 10;
  }, 15000);
  s = await snapshot();
  assert.equal(s.source_record_id, originalSource);
  assert.equal(s.vitals_anomaly.baseline_ready, false);
  record('same-source restart updates the visible replay clock and starts a new detector baseline');
  await request('/api/source-mode', { mode: 'LIVE_WEARABLE_HARDWARE' });
  await until(async () => (await snapshot()).source_record_id === 'awaiting_wearable_hardware');
  s = await snapshot(); assert.equal(s.biometrics.heart_rate_bpm, null); assert.equal(s.biometrics.spo2_percent, null);
  await phase('Gather'); await until(async () => /HARDWARE|Hardware|hardware/.test(await body()));
  record('hardware mode with no sensor abstains rather than recycling replay vitals');
  await stopBackend(); console.log('Backend stopped deliberately for reconnect test.');
  await until(async () => /Local simulation/.test(await body()), 12000);
  save('disconnected.txt', await body()); record('backend disconnect is visibly identified as local simulation');
  await startBackend(); await page.getByText('Engine connected', { exact: true }).waitFor({ timeout: 20000 });
  await until(async () => (await snapshot()).provenance_manifest.scenario_overlay_mode === 'NONE_PURE_REPLAY');
  record('cockpit reconnects to a restarted real engine and reasserts overlay off');
  const gpuContext = await browser.newContext();
  await gpuContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return ['webgl', 'webgl2', 'experimental-webgl'].includes(kind) ? null : original.call(this, kind, ...args);
    };
  });
  const gpuPage = await gpuContext.newPage();
  await gpuPage.goto(origin + '/?phase=EVALUATE');
  await gpuPage.getByTestId('body-2d-fallback-container').waitFor({ timeout: 20000 });
  await gpuPage.getByRole('navigation', { name: 'Cockpit pages' }).getByRole('button', { name: 'Gather', exact: true }).click();
  await gpuPage.getByRole('heading', { name: 'Health overview', exact: true }).waitFor();
  record('unavailable WebGL falls back to a 2D anatomical schematic without blocking GATHER');
  await gpuContext.close();
  assert.ok(frames > 100); assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(responses, []);
  record('no uncaught browser errors, failing HTTP responses or external runtime requests', { frames });
} catch (error) {
  checks.push({ failure: String(error), stack: error.stack }); console.error(error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  try { await stopBackend(); } catch (error) { errors.push(String(error)); process.exitCode = 1; }
  if (logFd !== undefined) fs.closeSync(logFd);
  save('results.json', { checks, errors, external, responses, frames, exitCode: process.exitCode ?? 0 });
  console.log(`Artifacts: ${artifacts}`);
}
