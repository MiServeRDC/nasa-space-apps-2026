import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EMPIRICAL_WHATIF_BASELINE,
  PLAYBOOK_PRECEDENCE_MAP,
  evaluateOpticalQualityGate,
  hasWhatIfDeviation,
  snapToMagneticBaseline,
} from '../src/lenses/lensMath.ts';
import {
  OWLT_MAX_MINUTES,
  OWLT_MIN_MINUTES,
  computeOwltFlightProgress,
  computeVirtualWindow,
  filterScientificAtlas,
  verifyAuditChainContinuity,
} from '../src/drawers/drawerLogic.ts';
import { ALL_CRYSTALLIZED_PLAYBOOK_LIST } from '../src/lib/playbookCatalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');

test('Phase 5 lensMath: magnetic baseline detents, What-If deviation, optical contrast quality gate, and all 15 Playbook P1-P6 precedence tiers', () => {
  // +/- 2.5% magnetic detent snap on Cabin ppCO2 (span = 6.0 -> tolerance = 0.15)
  const snappedNear = snapToMagneticBaseline(2.61, 2.5, 0.5, 6.5);
  assert.equal(snappedNear.snapped, true);
  assert.equal(snappedNear.value, 2.5);

  const unsnappedFar = snapToMagneticBaseline(4.2, 2.5, 0.5, 6.5);
  assert.equal(unsnappedFar.snapped, false);
  assert.equal(unsnappedFar.value, 4.2);

  // What-If deviation detection
  assert.equal(hasWhatIfDeviation({ ...EMPIRICAL_WHATIF_BASELINE }), false);
  assert.equal(
    hasWhatIfDeviation({ ...EMPIRICAL_WHATIF_BASELINE, lbnp_mmhg: -30 }),
    true,
  );

  // Honest optical contrast & illumination quality gate (`contrastIndex < 0.18 || qualityIndexPct < 45`)
  const lowContrast = evaluateOpticalQualityGate(0.12, 72);
  assert.equal(lowContrast.degraded, true);
  assert.equal(lowContrast.badge, '[LOW CONTRAST - HEURISTIC QUALITY GATE]');

  const lowQuality = evaluateOpticalQualityGate(0.28, 38);
  assert.equal(lowQuality.degraded, true);

  const nominalOptical = evaluateOpticalQualityGate(0.34, 81);
  assert.equal(nominalOptical.degraded, false);

  // Every single playbook `#01-#15` must map to a valid `P1-P6` precedence tier
  assert.equal(ALL_CRYSTALLIZED_PLAYBOOK_LIST.length, 15);
  const observedTiers = new Set<number>();
  for (const entry of ALL_CRYSTALLIZED_PLAYBOOK_LIST) {
    const meta = PLAYBOOK_PRECEDENCE_MAP[entry.playbook_id];
    assert.ok(meta, `Missing precedence tier for ${entry.playbook_id}`);
    assert.ok(meta.tier >= 1 && meta.tier <= 6);
    observedTiers.add(meta.tier);
  }
  assert.equal(observedTiers.size, 6, 'All 6 priority tiers P1-P6 must be represented');
});

test('Phase 5 drawerLogic: SHA-256 chain continuity verifier, virtual window math, OWLT transit, and Atlas filter', () => {
  const validChain = [
    {
      sequence_index: 0,
      timestamp_utc: '2026-11-14T06:00:00Z',
      actor_role: 'CREW_MEDICAL_OFFICER',
      event_action: 'GENESIS',
      prev_hash_hex: '0'.repeat(64),
      current_hash_hex: 'a'.repeat(64),
    },
    {
      sequence_index: 1,
      timestamp_utc: '2026-11-14T06:05:00Z',
      actor_role: 'CREW_MEDICAL_OFFICER',
      event_action: 'GATE 1 ARMED',
      prev_hash_hex: 'a'.repeat(64),
      current_hash_hex: 'b'.repeat(64),
    },
  ];

  const intactRes = verifyAuditChainContinuity(validChain);
  assert.equal(intactRes.intact, true);
  assert.equal(intactRes.checkedCount, 2);
  assert.equal(intactRes.brokenAtSequence, null);

  const tamperedChain = [
    validChain[0],
    {
      ...validChain[1],
      prev_hash_hex: 'c'.repeat(64),
    },
  ];
  const brokenRes = verifyAuditChainContinuity(tamperedChain);
  assert.equal(brokenRes.intact, false);
  assert.equal(brokenRes.brokenAtSequence, 1);

  // Fixed-row virtualization window math
  const win = computeVirtualWindow(24, 280, 240, 48, 2);
  assert.ok(win.startIndex > 0);
  assert.ok(win.endIndexExclusive <= 24);
  assert.equal(
    win.topSpacerPx + (win.endIndexExclusive - win.startIndex) * 48 + win.bottomSpacerPx,
    24 * 48,
  );

  // OWLT flight progress math (`8.2 - 48.1 min`)
  const tx = computeOwltFlightProgress(0, 5.0);
  assert.equal(tx.clampedOwltMin, OWLT_MIN_MINUTES);
  assert.equal(tx.stage, 'MARS_HABITAT_TX');

  const mid = computeOwltFlightProgress(600, 20.0);
  assert.equal(mid.stage, 'IN_FLIGHT_DEEP_SPACE');
  assert.equal(mid.progressRatio, 0.5);

  const rx = computeOwltFlightProgress(9999, 60.0);
  assert.equal(rx.clampedOwltMin, OWLT_MAX_MINUTES);
  assert.equal(rx.stage, 'EARTH_DSN_RX');

  // Atlas filter helper
  const sampleAtlas = [
    {
      id: 'osd-51',
      agency: 'NASA' as const,
      accession: 'OSD-51',
      title: 'WISE-2005 Female Bed-Rest',
      axis: 'Musculoskeletal' as const,
      platform: 'HDBR',
      sampleCohort: 'n=24',
      doiOrUrl: 'local://osd-51',
      relevanceToAres: 'Soleus reference',
      safetyGateMapping: 'Frost 1000 ue',
    },
    {
      id: 'csa-cans',
      agency: 'CSA' as const,
      accession: 'CSA-CANS',
      title: 'Neutron Dosimetry',
      axis: 'Radiation' as const,
      platform: 'ISS',
      sampleCohort: 'Continuous',
      doiOrUrl: 'local://csa-cans',
      relevanceToAres: 'SPE Shelter',
      safetyGateMapping: 'SPE > 1.5 mSv/d',
    },
  ];
  assert.equal(filterScientificAtlas(sampleAtlas, 'cans', 'ALL').length, 1);
  assert.equal(filterScientificAtlas(sampleAtlas, '', 'NASA').length, 1);
});

test('Phase 5 lenses, drawers, App.tsx & main.tsx satisfy Risk 1/3/5, [V2 10027], <= 4 blur-shell budget, 24-Dataset Atlas, air-gap, and zero emojis', () => {
  assert.equal(
    fs.existsSync(path.join(SRC_ROOT, 'lib', 'validateTelemetry.ts')),
    false,
    'validateTelemetry.ts must never exist',
  );

  const requiredLenses = [
    'lensMath.ts',
    'BranchedPlaybookDagLens.tsx',
    'WhatIfCounterfactualLens.tsx',
    'DiagnosticImagingLens.tsx',
    'AnomalyDiagnosticsLens.tsx',
    'ForecastAndBoneRenalLens.tsx',
  ];
  const requiredDrawers = [
    'drawerLogic.ts',
    'useKeyboardOrchestrator.ts',
    'SlideOverDrawerShell.tsx',
    'MissionPortalDrawer.tsx',
    'AuditAndProvenanceDrawer.tsx',
    'OpenScreenStudioBar.tsx',
    'CommandPaletteOverlay.tsx',
    'BottomCopilotStudioPill.tsx',
    'ShortcutsOverlay.tsx',
  ];

  const phase5Files: string[] = [];

  for (const f of requiredLenses) {
    const p = path.join(SRC_ROOT, 'lenses', f);
    assert.equal(fs.existsSync(p), true, `Missing lens module ${f}`);
    phase5Files.push(p);
  }
  for (const f of requiredDrawers) {
    const p = path.join(SRC_ROOT, 'drawers', f);
    assert.equal(fs.existsSync(p), true, `Missing drawer module ${f}`);
    phase5Files.push(p);
  }

  const mainTsxPath = path.join(SRC_ROOT, 'main.tsx');
  const appTsxPath = path.join(SRC_ROOT, 'App.tsx');
  const aiInjuryPath = path.join(SRC_ROOT, 'modules', 'body-3d-heatmap', 'AiInjuryModal.tsx');
  phase5Files.push(mainTsxPath, appTsxPath, aiInjuryPath);

  // The active cockpit uses bundled fonts. The legacy drawer retains its font gate.
  assert.ok(fs.readFileSync(mainTsxPath, 'utf8').includes('@fontsource-variable/space-grotesk'));
  assert.match(
    fs.readFileSync(path.join(SRC_ROOT, 'drawers', 'SlideOverDrawerShell.tsx'), 'utf8'),
    /waitForFontsReadyBounded/,
  );

  // Risk 3: `setPointerCapture` + `setIsScrubbing` on all Phase 5 slider surfaces
  for (const sliderModule of [
    path.join(SRC_ROOT, 'lenses', 'WhatIfCounterfactualLens.tsx'),
    path.join(SRC_ROOT, 'drawers', 'OpenScreenStudioBar.tsx'),
    path.join(SRC_ROOT, 'drawers', 'MissionPortalDrawer.tsx'),
  ]) {
    const src = fs.readFileSync(sliderModule, 'utf8');
    assert.match(src, /setPointerCapture/, `${path.basename(sliderModule)} must capture pointer`);
    assert.match(src, /Scrubbing/, `${path.basename(sliderModule)} must lock isScrubbing`);
  }

  // Risk 5: `a11yAnnouncer` across Phase 5 interactive lenses & drawers
  for (const announcerModule of [
    path.join(SRC_ROOT, 'lenses', 'BranchedPlaybookDagLens.tsx'),
    path.join(SRC_ROOT, 'lenses', 'WhatIfCounterfactualLens.tsx'),
    path.join(SRC_ROOT, 'drawers', 'AuditAndProvenanceDrawer.tsx'),
    path.join(SRC_ROOT, 'drawers', 'BottomCopilotStudioPill.tsx'),
  ]) {
    const src = fs.readFileSync(announcerModule, 'utf8');
    assert.match(src, /a11yAnnouncer/, `${path.basename(announcerModule)} must use a11yAnnouncer`);
  }

  // Voice & Copilot `NASA-STD-3001 [V2 10027]` Gate 1 block + 8 FastMCP tools
  const copilotPillSrc = fs.readFileSync(
    path.join(SRC_ROOT, 'drawers', 'BottomCopilotStudioPill.tsx'),
    'utf8',
  );
  assert.match(copilotPillSrc, /NASA-STD-3001 \[V2 10027\]/);
  assert.match(copilotPillSrc, /SAFETY_INTERLOCK_BLOCK/);

  const paletteSrc = fs.readFileSync(
    path.join(SRC_ROOT, 'drawers', 'CommandPaletteOverlay.tsx'),
    'utf8',
  );
  assert.match(paletteSrc, /FASTMCP_TOOLS/);
  assert.match(paletteSrc, /NASA-STD-3001 \[V2 10027\]/);

  // Audit provenance honesty + NASA-STD-3001 Vol. 1 Ch. 7 privacy governance
  const auditDrawerSrc = fs.readFileSync(
    path.join(SRC_ROOT, 'drawers', 'AuditAndProvenanceDrawer.tsx'),
    'utf8',
  );
  assert.match(auditDrawerSrc, /LIVE_ENGINE_LEDGER/);
  assert.match(auditDrawerSrc, /OFFLINE_SIMULATION_PREVIEW/);
  assert.match(auditDrawerSrc, /redactAuditRecordForRole/);
  assert.match(auditDrawerSrc, /buildPrivacyGovernedTelemetryView/);

  // 24-Dataset Scientific Evidence Atlas completeness
  const portalModuleSrc = fs.readFileSync(
    path.join(SRC_ROOT, 'modules', 'portal', 'MissionPortal.tsx'),
    'utf8',
  );
  const accessionMatches = portalModuleSrc.match(/accession:\s*'/g) ?? [];
  assert.equal(accessionMatches.length, 24, 'SCIENTIFIC_ATLAS must contain all 24 datasets');

  // OpenScreenStudio `<= 29.8s` NASA pitch hard cap & layout modes
  const studioBarSrc = fs.readFileSync(
    path.join(SRC_ROOT, 'drawers', 'OpenScreenStudioBar.tsx'),
    'utf8',
  );
  assert.match(studioBarSrc, /NASA_PITCH_HARD_CAP_SECONDS/);
  assert.match(studioBarSrc, /'FOCUS',\s*'SPLIT',\s*'PIP'/);

  const appSrc = fs.readFileSync(appTsxPath, 'utf8');
  for (const requiredMount of [
    '<TriPhaseHeader',
    '<BodyHeatmap',
    '<PlaybookRunner',
    '<ProvenanceMenu',
    '<AuditChainModal',
    '<OsCommandPalette',
    '<KeyboardShortcutsModal',
  ]) {
    assert.ok(appSrc.includes(requiredMount), `App.tsx must mount ${requiredMount}`);
  }

  // Blur-shell budget (`<= 4` simultaneous blurred root shells): no Phase 5 drawer/modal/lens may add backdrop-blur
  for (const fPath of phase5Files.filter(file => file !== aiInjuryPath)) {
    const content = fs.readFileSync(fPath, 'utf8');
    assert.doesNotMatch(
      content,
      /backdrop-blur|hud-specular-card/,
      `${path.basename(fPath)} must not add extra blurred root shells`,
    );
  }

  // Air-gapped & strictly zero emojis/dingbats across all Phase 5 files + `index.html`
  const emojiRegex = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const cdnRegex = /https?:\/\/(?!127\.0\.0\.1|localhost|ipc\.localhost|www\.w3\.org\/2000\/svg)/i;

  for (const fPath of [...phase5Files, path.join(PROJECT_ROOT, 'index.html')]) {
    const content = fs.readFileSync(fPath, 'utf8');
    assert.equal(emojiRegex.test(content), false, `Emoji/dingbat prohibited in ${fPath}`);
    assert.equal(cdnRegex.test(content), false, `External HTTP URL prohibited in ${fPath}`);
  }
});
