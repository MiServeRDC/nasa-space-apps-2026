import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MATH_MINUS_CHAR,
  SIGN_SLOT_SPACE,
  buildNormalizedQuantileFan,
  clampMonotoneTriplet,
  formatTabularReadout,
  segmentWaveformWithDropouts,
  snapHalfPixel,
  waitForFontsReadyBounded,
} from '../src/instruments/instrumentMath.ts';
import {
  partitionPlaybookActionsWithSafetyGates,
} from '../src/workbench/safetyGatePartition.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.resolve(__dirname, '..', 'src');

test('Risk 1: waitForFontsReadyBounded locks on local WOFF2 readiness and falls back cleanly on timeout', async () => {
  const lockedViaWindow = await waitForFontsReadyBounded({
    win: { __ARES_FONTS_READY__: Promise.resolve('locked') },
  });
  assert.equal(lockedViaWindow, 'locked');

  const loadedSpecs: string[] = [];
  const lockedViaDocFonts = await waitForFontsReadyBounded({
    win: {},
    doc: {
      fonts: {
        ready: Promise.resolve(),
        load: async (spec: string) => {
          loadedSpecs.push(spec);
          return [];
        },
      },
    },
    timeoutMs: 300,
  });
  assert.equal(lockedViaDocFonts, 'locked');
  assert.equal(loadedSpecs.length, 2);

  // Stalled font promise must resolve deterministically via bounded timeout fallback
  const stalledPromise = new Promise<never>(() => {
    // Intentionally never settles
  });
  const timedOut = await waitForFontsReadyBounded({
    win: {},
    doc: {
      fonts: {
        ready: stalledPromise,
        load: () => stalledPromise,
      },
    },
    timeoutMs: 60,
  });
  assert.equal(timedOut, 'timeout_fallback');
});

test('TabularCounter math reserves 1ch sign slot with U+2212 and never coerces null/NaN to 0 (Issue #11)', () => {
  const neg = formatTabularReadout(-30, { decimals: 0 });
  assert.equal(neg.isAvailable, true);
  assert.equal(neg.signChar, MATH_MINUS_CHAR);
  assert.equal(neg.digitsText, '30');

  const pos = formatTabularReadout(72.4, { decimals: 1 });
  assert.equal(pos.isAvailable, true);
  assert.equal(pos.signChar, SIGN_SLOT_SPACE);
  assert.equal(pos.digitsText, '72.4');

  const signedPlus = formatTabularReadout(0.24, { decimals: 2, alwaysShowPlus: true });
  assert.equal(signedPlus.signChar, '+');
  assert.equal(signedPlus.digitsText, '0.24');

  const missingNull = formatTabularReadout(null, { decimals: 1, unavailableLabel: 'MISSING' });
  assert.equal(missingNull.isAvailable, false);
  assert.equal(missingNull.digitsText, 'MISSING');
  assert.notEqual(missingNull.digitsText, '0');
  assert.notEqual(missingNull.digitsText, '0.0');

  const missingHrv = formatTabularReadout(Number.NaN, {
    decimals: 1,
    unavailableLabel: 'UNAVAILABLE',
    unavailableReason: 'BEAT_INTERVALS_NOT_AVAILABLE',
  });
  assert.equal(missingHrv.isAvailable, false);
  assert.equal(missingHrv.badgeReason, 'BEAT_INTERVALS_NOT_AVAILABLE');
  assert.equal(snapHalfPixel(14.8), 14.5);
});

test('WaveformCanvas2D segmentation lifts pen across NaN dropouts and never interpolates NaN to 0', () => {
  const timestamps = new Float64Array([1, 2, 3, 4, 5, 6]);
  const hrValues = new Float32Array([68, 70, Number.NaN, Number.NaN, 74, 76]);

  const result = segmentWaveformWithDropouts({
    timestampsS: timestamps,
    values: hrValues,
    oldestIndex: 0,
    sampleCount: 6,
    capacity: 6,
    windowSec: 10,
    minValue: 40,
    maxValue: 140,
  });

  assert.equal(result.segments.length, 2, 'NaN gap must split polyline into 2 separate pen segments');
  assert.equal(result.segments[0].length, 2);
  assert.equal(result.segments[1].length, 2);
  assert.equal(result.dropoutSpans.length, 1, 'NaN gap must emit an explicit dropout hatch span');
  assert.equal(result.minObserved, 68);
  assert.equal(result.maxObserved, 76);

  for (const seg of result.segments) {
    for (const pt of seg) {
      assert.equal(Number.isFinite(pt.value), true);
      assert.notEqual(pt.value, 0);
    }
  }
});

test('QuantileConeChart enforces strict q05 <= q50 <= q95 monotonicity and ConformalAbstentionGate status', () => {
  const clamped = clampMonotoneTriplet(0.45, 0.40, 0.35);
  assert.ok(clamped);
  assert.ok(clamped.q05 <= clamped.q50 && clamped.q50 <= clamped.q95);

  const acceptedModel = buildNormalizedQuantileFan(
    [
      { horizonSec: 0, label: 'NOW', q05: 0.32, q50: 0.4, q95: 0.48, empiricalGhostQ50: 0.44 },
      { horizonSec: 900, label: '+15m', q05: 0.21, q50: 0.33, q95: 0.45, empiricalGhostQ50: 0.41 },
      { horizonSec: 86400, label: '+24h', q05: -0.08, q50: 0.12, q95: 0.29, empiricalGhostQ50: 0.35 },
    ],
    {
      safetyThreshold: 0,
      gateStatus: 'HEURISTIC_GATE_ACCEPTED',
    },
  );

  assert.equal(acceptedModel.abstained, false);
  assert.equal(acceptedModel.vertices.length, 3);
  for (const v of acceptedModel.vertices) {
    assert.ok(v.q05 <= v.q50 && v.q50 <= v.q95);
    // In top-down SVG ratios, higher values map to smaller Y ratios
    assert.ok(v.y95Ratio <= v.y50Ratio + 1e-9 && v.y50Ratio <= v.y05Ratio + 1e-9);
    assert.notEqual(v.ghostY50Ratio, null);
  }

  const abstainedModel = buildNormalizedQuantileFan(
    [{ horizonSec: 60, label: '+60s', q05: 0.1, q50: 0.2, q95: 0.3 }],
    { gateStatus: 'ABSTAINED_FALLBACK_DETERMINISTIC' },
  );
  assert.equal(abstainedModel.abstained, true);
});

test('PhaseActDeck Safety Gate DAG inhibits Gate 1/4A while preserving #10 Potassium Citrate & #13 Valacyclovir and firing Gate 2/3/SPE overrides', () => {
  const candidateActions = [
    {
      action_id: 'ACT_ANTICOAG_ENOXAPARIN',
      label: 'Initiate weight-adjusted Enoxaparin',
      category: 'PHARMACOLOGICAL_ANTICOAGULANT',
      delta_rho_per_hour: 0.22,
    },
    {
      action_id: 'ACT_ORAL_POTASSIUM_CITRATE',
      label: 'Administer oral Potassium Citrate (#10 Renal Lithiasis)',
      category: 'PHARMACOLOGICAL_RENAL_ALKALINIZATION',
      delta_rho_per_hour: 0.16,
    },
    {
      action_id: 'ACT_VALACYCLOVIR_ANTIVIRAL_PROPHYLAXIS',
      label: 'Initiate oral Valacyclovir (#13 Viral Reactivation)',
      category: 'PHARMACOLOGICAL_ANTIVIRAL',
      delta_rho_per_hour: 0.15,
    },
    {
      action_id: 'ACT_NEEDLE_DECOMPRESSION_2ND_ICS',
      label: 'Perform 2nd ICS needle thoracostomy',
      category: 'INVASIVE_THORACIC',
      delta_rho_per_hour: 0.3,
    },
  ];

  // Unverified POCUS + active LBNP pre-syncope + high GAI + SPE radiation
  const lockedDag = partitionPlaybookActionsWithSafetyGates(
    candidateActions,
    {
      anticoagulant_lock_active: true,
      lbnp_auto_vent_armed: true,
      eva_suit_damping_active: true,
      gate4_invasive_decompression_locked: true,
      gate4_eva_fitness_no_go: true,
    },
    {
      pocusThrombusConfirmed: false,
      lbnpActive: true,
      lbnpMmhg: -35,
      sbpDropMmhg: 18.5,
      hrBpm: 121,
      gaiPct: 14.2,
      radiationDoseMsvD: 2.1,
    },
  );

  // Gate 1 & Gate 4A inhibited in dedicated branch with 1-Click Verify deep-link metadata
  assert.equal(lockedDag.inhibitedActions.length, 2);
  assert.equal(lockedDag.inhibitedActions[0].gateCode, 'GATE_1_ANTICOAG_LOCK');
  assert.equal(lockedDag.inhibitedActions[0].verifyTargetTab, 'POCUS_IJV');
  assert.equal(lockedDag.inhibitedActions[0].verifyRegion, 'InternalJugularVein');
  assert.equal(lockedDag.inhibitedActions[1].gateCode, 'GATE_4A_THORACOSTOMY_LOCK');

  // Non-anticoagulant pharmacotherapies (#10 Potassium Citrate & #13 Valacyclovir) remain UNLOCKED
  const unlockedIds = new Set(lockedDag.unlockedActions.map((a) => a.action_id));
  assert.equal(unlockedIds.has('ACT_ORAL_POTASSIUM_CITRATE'), true);
  assert.equal(unlockedIds.has('ACT_VALACYCLOVIR_ANTIVIRAL_PROPHYLAXIS'), true);
  assert.equal(unlockedIds.has('ACT_ANTICOAG_ENOXAPARIN'), false);
  assert.equal(unlockedIds.has('ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG'), true);
  assert.equal(unlockedIds.has('ACT_EVA_SUIT_ANKLE_DAMPING_038G'), true);

  // Autonomous overrides surfaced for Gate 2, Gate 3, Gate 4B, and SPE Storm Shelter
  assert.equal(lockedDag.preSyncopeTriggered, true);
  assert.equal(lockedDag.autonomousOverrides.length, 4);

  // Once POCUS confirms intraluminal thrombus, Gate 1 unlocks Enoxaparin cleanly
  const unlockedGate1 = partitionPlaybookActionsWithSafetyGates(
    candidateActions,
    {
      anticoagulant_lock_active: false,
      gate4_invasive_decompression_locked: true,
    },
    { pocusThrombusConfirmed: true },
  );
  assert.equal(
    unlockedGate1.unlockedActions.some((a) => a.action_id === 'ACT_ANTICOAG_ENOXAPARIN'),
    true,
  );
});

test('Phase 4 source files enforce Risk 1 font-gate, Risk 5 a11yAnnouncer, <= 4 blur-shell budget, air-gap, and zero emojis', () => {
  const requiredInstruments = [
    'instrumentMath.ts',
    'WaveformCanvas2D.tsx',
    'QuantileConeChart.tsx',
    'TabularCounter.tsx',
    'TacticalReticleSvg.tsx',
    'BentoCardShell.tsx',
  ];
  const requiredWorkbench = [
    'safetyGatePartition.ts',
    'HorizonBar.tsx',
    'TelemetryIgnitionPreloader.tsx',
    'VitalsAnchorCard.tsx',
    'PhaseGatherDeck.tsx',
    'PhaseEvaluateDeck.tsx',
    'PhaseActDeck.tsx',
    'SpatialStageHud.tsx',
    'WorkbenchShell.tsx',
  ];

  const allCheckedFiles: string[] = [];

  for (const name of requiredInstruments) {
    const full = path.join(SRC_ROOT, 'instruments', name);
    assert.equal(fs.existsSync(full), true, `Missing instrument module ${name}`);
    allCheckedFiles.push(full);
  }
  for (const name of requiredWorkbench) {
    const full = path.join(SRC_ROOT, 'workbench', name);
    assert.equal(fs.existsSync(full), true, `Missing workbench module ${name}`);
    allCheckedFiles.push(full);
  }

  const triPhasePath = path.join(SRC_ROOT, 'modules', 'header-triphase', 'TriPhaseHeader.tsx');
  const osBarPath = path.join(SRC_ROOT, 'modules', 'os-shell', 'OsSystemStatusBar.tsx');
  allCheckedFiles.push(triPhasePath, osBarPath);

  // Risk 1 font-gate assertions
  const bentoSrc = fs.readFileSync(path.join(SRC_ROOT, 'instruments', 'BentoCardShell.tsx'), 'utf8');
  const preloaderSrc = fs.readFileSync(
    path.join(SRC_ROOT, 'workbench', 'TelemetryIgnitionPreloader.tsx'),
    'utf8',
  );
  assert.match(bentoSrc, /waitForFontsReadyBounded/);
  assert.match(preloaderSrc, /waitForFontsReadyBounded/);

  // Risk 5 live-region discipline assertions
  const tabularSrc = fs.readFileSync(path.join(SRC_ROOT, 'instruments', 'TabularCounter.tsx'), 'utf8');
  assert.match(tabularSrc, /aria-live="off"/);

  for (const announcerConsumer of [
    path.join(SRC_ROOT, 'workbench', 'WorkbenchShell.tsx'),
    path.join(SRC_ROOT, 'workbench', 'HorizonBar.tsx'),
    path.join(SRC_ROOT, 'workbench', 'PhaseActDeck.tsx'),
  ]) {
    const src = fs.readFileSync(announcerConsumer, 'utf8');
    assert.match(src, /a11yAnnouncer/, `${path.basename(announcerConsumer)} must route via a11yAnnouncer`);
  }
  const header = fs.readFileSync(triPhasePath, 'utf8');
  assert.ok(header.includes('aria-label="Cockpit pages"'));
  assert.match(header, /aria-current=/);

  // <= 4 blur-shell budget: HorizonBar, TriPhaseHeader, and OsSystemStatusBar must NOT use hud-specular-card / backdrop-blur
  for (const solidChromeFile of [
    path.join(SRC_ROOT, 'workbench', 'HorizonBar.tsx'),
    triPhasePath,
    osBarPath,
  ]) {
    const src = fs.readFileSync(solidChromeFile, 'utf8');
    assert.doesNotMatch(src, /backdrop-blur|hud-specular-card/);
  }

  // Air-gapped & strictly zero emojis/dingbats across all Phase 4 modules
  const emojiRegex = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const cdnRegex = /https?:\/\/(?!127\.0\.0\.1|localhost)/i;

  for (const filePath of allCheckedFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    assert.equal(emojiRegex.test(text), false, `Emoji/dingbat prohibited in ${filePath}`);
    assert.equal(cdnRegex.test(text), false, `External HTTP URL prohibited in ${filePath}`);
  }
});
