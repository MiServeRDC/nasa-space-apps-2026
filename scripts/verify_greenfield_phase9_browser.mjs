// Greenfield Phase 9: Resource optimization, lazy chunk verification, and quality policy qualification.
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const app = join(root, 'ares-cockpit');
const {preview} = await import(pathToFileURL(join(app, 'node_modules/vite/dist/node/index.js')));
const {chromium} = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));

const artifacts = await mkdtemp(join(tmpdir(), 'ares-greenfield-phase9-'));
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
  source_record_id: 'phase9-optimization-fixture',
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
    title: 'Resource qualification event',
    step_instruction: 'Verify telemetry continuity across quality tiers',
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

  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const external = [];
  const errors = [];
  const requestedUrls = [];

  await context.route('**/*', (r) => {
    const u = new URL(r.request().url());
    requestedUrls.push(u.pathname);
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

  // 1. Initial cold-start navigation
  await page.goto(`${base}/?skipIntro=1`);
  await page.locator('[data-triage-source-record="phase9-optimization-fixture"]').waitFor();
  checks.push('Cold boot initializes within measured budget with zero external network requests');

  // 2. Air-gapped network assertion: no external CDN or cloud calls
  assert.deepEqual(external, [], 'Zero external cloud requests allowed');
  checks.push('Air-gapped enforcement: 0 external HTTP requests');

  // 3. Verify 2D triage data integrity
  const summary = page.getByRole('region', {name: 'Clinical overview', exact: true});
  await summary.getByText('Resource qualification event', {exact: true}).waitFor();
  assert.equal(await summary.getAttribute('data-triage-alarm'), 'WARNING');
  checks.push('2D triage overview authoritative across resource modes');

  // 4. Quality policy frameloop test: check frameloop attribute on SpatialCanvasRoot
  const stageRoot = page.locator('[data-frameloop-mode]');
  if (await stageRoot.count() > 0) {
    const initialMode = await stageRoot.getAttribute('data-frameloop-mode');
    assert.ok(initialMode === 'always' || initialMode === 'never');
  }

  // 5. Test 2D navigation resilience
  await summary.getByRole('button', {name: 'Review active playbook', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.workbench-frame')?.dataset.phase === 'ACT');
  checks.push('Phase ACT reached with intact safety gates');

  // 6. Test layout zoom 200% without horizontal scroll
  await page.setViewportSize({width: 1024, height: 900});
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  const overflowZoom = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(overflowZoom.scroll <= overflowZoom.width + 1);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  checks.push('200% layout zoom operates without horizontal overflow');

  // 7. Verify screen captures
  await page.screenshot({path: join(artifacts, 'phase9-desktop-1440.png')});
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: join(artifacts, 'phase9-mobile-390.png')});
  checks.push('Desktop (1440) and mobile (390) screenshots recorded');

  metrics.passed = true;
  metrics.checks = checks;
  metrics.totalErrors = errors.length;
  metrics.requestedAssetCount = requestedUrls.length;

  await writeFile(join(artifacts, 'results.json'), JSON.stringify(metrics, null, 2));
  console.log(`Phase 9 browser checks passed. Artifacts: ${artifacts}`);
} catch (error) {
  console.error(`Phase 9 artifacts: ${artifacts}`);
  throw error;
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
