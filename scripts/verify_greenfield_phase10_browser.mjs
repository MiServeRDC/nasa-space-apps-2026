// Greenfield Phase 10: End-to-End qualification and controlled integration verification.
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const app = join(root, 'ares-cockpit');
const {preview} = await import(pathToFileURL(join(app, 'node_modules/vite/dist/node/index.js')));
const {chromium} = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));

const artifacts = await mkdtemp(join(tmpdir(), 'ares-greenfield-phase10-'));
const server = await preview({
  root: app,
  server: {hmr: false},
  preview: {host: '127.0.0.1', port: 0, strictPort: true},
  logLevel: 'error',
});
const base = `http://127.0.0.1:${server.httpServer.address().port}`;

const frame = {
  timestamp_ms: Date.now(),
  relative_recording_time_s: 42,
  source_record_id: 'phase10-e2e-qualification-fixture',
  astronaut_id: 'BIDMC-SUBJECT-01',
  model_validation_status: 'ILLUSTRATIVE_UNVALIDATED',
  provenance_manifest: {
    biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
    biometrics_native_rate_hz: 1,
    ui_refresh_rate_hz: 20,
    scenario_overlay_mode: 'NONE_PURE_REPLAY',
  },
  biometrics: {
    heart_rate_bpm: 72,
    pulse_rate_bpm: 72,
    respiration_rate_brpm: 14,
    spo2_percent: 98,
    hrv_rmssd_ms: null,
    hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
  },
  safety_margins: {
    provenance: 'DERIVED_FROM_RECORDED_BIDMC',
    med_stl_rho_robustness: null,
    mission_readiness_index: null,
    alarm_level: 'WARNING',
  },
  active_playbook: {
    playbook_id: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    title: 'Controlled End-to-End Alert',
    step_instruction: 'Verify complete E2E qualification path',
    safety_gates: {
      anticoagulant_lock_active: true,
      lbnp_auto_vent_armed: true,
      eva_suit_damping_active: false,
      gate4_invasive_decompression_locked: true,
      gate4_eva_fitness_no_go: true,
    },
  },
  environment: null,
  hemodynamics: null,
  musculoskeletal: null,
};

let browser;
const checks = [];
const metrics = {};

try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH,
    headless: true,
  });

  // Profile 1: Full 3D Desktop and Multi-Viewport Verification
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const external = [];
  const errors = [];

  await context.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.origin === base) return r.continue();
    if (u.hostname !== '127.0.0.1') external.push(u.href);
    return r.abort();
  });

  await context.route('**/api/snapshot', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify({...frame, timestamp_ms: Date.now()}),
    }),
  );
  await context.routeWebSocket('**/*', () => {});

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/?skipIntro=1`);
  await page.locator('[data-triage-source-record="phase10-e2e-qualification-fixture"]').waitFor();
  checks.push('Profile 1: Cold start boot with zero external requests passed');

  assert.deepEqual(external, [], 'Zero external cloud requests permitted');
  checks.push('Profile 1: Air-gapped isolation verified (0 external calls)');

  // 2D alert to playbook transition
  const summary = page.getByRole('region', {name: 'Clinical overview', exact: true});
  await summary.getByText('Controlled End-to-End Alert', {exact: true}).waitFor();
  await summary.getByRole('button', {name: 'Review active playbook', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.workbench-frame')?.dataset.phase === 'ACT');
  checks.push('Profile 1: 2D alert-to-action navigation confirmed in ACT phase');

  // Verify responsive multi-viewport geometry
  for (const [w, h] of [[1440, 1000], [1024, 900], [768, 1024], [390, 844]]) {
    await page.setViewportSize({width: w, height: h});
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(overflow.scroll <= overflow.width + 1, `Overflow at ${w}x${h}`);
  }
  checks.push('Profile 1: Multi-viewport reflow verified across 1440, 1024, 768, and 390px');

  await page.screenshot({path: join(artifacts, 'phase10-desktop-1440.png')});
  await context.close();

  // Profile 2: Forced WebGL-Disabled 2D Fallback Path
  const noWebGlContext = await browser.newContext({viewport: {width: 1024, height: 768}});
  const noWebGlErrors = [];
  await noWebGlContext.route('**/api/snapshot', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {'access-control-allow-origin': '*'},
      body: JSON.stringify({...frame, timestamp_ms: Date.now()}),
    }),
  );
  await noWebGlContext.routeWebSocket('**/*', () => {});

  const noWebGlPage = await noWebGlContext.newPage();
  noWebGlPage.on('pageerror', (e) => noWebGlErrors.push(e.message));
  await noWebGlPage.addInitScript(() => {
    Object.defineProperty(window, 'WebGL2RenderingContext', {value: undefined, configurable: true});
    Object.defineProperty(window, 'WebGLRenderingContext', {value: undefined, configurable: true});
  });

  await noWebGlPage.goto(`${base}/?skipIntro=1`);
  await noWebGlPage.locator('[data-spatial-fallback]').waitFor();
  checks.push('Profile 2: Forced WebGL-disabled fallback mounted gracefully');

  const fallbackSummary = noWebGlPage.getByRole('region', {name: 'Clinical overview', exact: true});
  await fallbackSummary.getByRole('button', {name: 'Review active playbook', exact: true}).click();
  await noWebGlPage.waitForFunction(() => document.querySelector('.workbench-frame')?.dataset.phase === 'ACT');
  checks.push('Profile 2: Complete 2D alert-to-action path functional without WebGL');

  await noWebGlPage.screenshot({path: join(artifacts, 'phase10-fallback-nowebgl.png')});
  assert.deepEqual(noWebGlErrors, [], 'No uncaught exceptions in 2D fallback');
  await noWebGlContext.close();

  metrics.passed = true;
  metrics.checks = checks;
  metrics.desktopErrors = errors.length;
  metrics.noWebGlErrors = noWebGlErrors.length;

  await writeFile(join(artifacts, 'results.json'), JSON.stringify(metrics, null, 2));
  console.log(`Phase 10 E2E browser checks passed. Artifacts: ${artifacts}`);
} catch (error) {
  console.error(`Phase 10 artifacts: ${artifacts}`);
  throw error;
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
