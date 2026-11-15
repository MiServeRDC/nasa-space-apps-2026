import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeReconnectBackoffMs,
  resolveTelemetryTransportPolicy,
} from '../src/lib/telemetryTransportPolicy.ts';

const COCKPIT_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(COCKPIT_ROOT, '..');

test('resolveTelemetryTransportPolicy handles offline, env, live override, and default probe', () => {
  assert.equal(resolveTelemetryTransportPolicy('', ''), 'AUTO_PROBE');
  assert.equal(resolveTelemetryTransportPolicy('?offline=1', ''), 'OFFLINE');
  assert.equal(resolveTelemetryTransportPolicy('?offline=true', ''), 'OFFLINE');
  assert.equal(resolveTelemetryTransportPolicy('', '1'), 'OFFLINE');
  assert.equal(resolveTelemetryTransportPolicy('', 'true'), 'OFFLINE');
  assert.equal(resolveTelemetryTransportPolicy('?live=1', '1'), 'LIVE');
  assert.equal(resolveTelemetryTransportPolicy('?offline=1&live=1', ''), 'LIVE');
});

test('computeReconnectBackoffMs scales exponentially and caps at maxMs', () => {
  assert.equal(computeReconnectBackoffMs(0), 3000);
  assert.equal(computeReconnectBackoffMs(1), 6000);
  assert.equal(computeReconnectBackoffMs(2), 12000);
  assert.equal(computeReconnectBackoffMs(3), 24000);
  assert.equal(computeReconnectBackoffMs(4), 30000);
  assert.equal(computeReconnectBackoffMs(12), 30000);
});

test('Phase A stylesheet strips slate literals and unscoped 48px control override', () => {
  const indexCss = fs.readFileSync(path.join(COCKPIT_ROOT, 'src/index.css'), 'utf8');
  for (const slateHex of ['#090f16', '#334155', '#080e15', '#080f17', '#070c12']) {
    assert.equal(
      indexCss.toLowerCase().includes(slateHex),
      false,
      `Phase 8 slate hex ${slateHex} must not exist in src/index.css`,
    );
  }
  assert.equal(
    indexCss.includes('.workbench-frame :is(button,select,summary,input)'),
    false,
    'Global desktop 48px override must be removed',
  );
  assert.ok(indexCss.includes('@media (pointer: coarse), (max-width: 1023px)'));
  assert.ok(indexCss.includes('.ares-missing-hatch'));
});

test('Phase A primitives, favicon, and web-vitals wiring exist cleanly', () => {
  const indexHtml = fs.readFileSync(path.join(COCKPIT_ROOT, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('href="/favicon.svg"'));
  assert.ok(fs.existsSync(path.join(COCKPIT_ROOT, 'public/favicon.svg')));

  const componentsJson = JSON.parse(
    fs.readFileSync(path.join(COCKPIT_ROOT, 'components.json'), 'utf8'),
  ) as { tailwind?: { css?: string }; tsx?: boolean };
  assert.equal(componentsJson.tsx, true);
  assert.equal(componentsJson.tailwind?.css, 'src/index.css');

  for (const name of ['button.tsx', 'command.tsx', 'sheet.tsx', 'tabs.tsx', 'tooltip.tsx', 'badge.tsx']) {
    const filePath = path.join(COCKPIT_ROOT, 'src/components/ui', name);
    assert.ok(fs.existsSync(filePath), `Missing UI primitive ${name}`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(content.includes('backdrop-filter'), false, `${name} must not introduce backdrop-filter`);
  }

  const designMd = fs.readFileSync(path.join(REPO_ROOT, 'DESIGN.md'), 'utf8');
  assert.ok(designMd.includes('#000000'));
  assert.ok(designMd.includes('oklch(0.13 0.008 250)'));
});
