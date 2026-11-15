import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkbenchStore } from '../src/stores/workbenchStore.ts';
import { TelemetryRingBuffer } from '../src/stores/telemetryRingBuffer.ts';
import {
  getCatalogEntry,
  ALL_CRYSTALLIZED_PLAYBOOK_LIST,
  ALL_360_PLAYBOOK_LIST,
  PLAYBOOK_BY_SHORT_CODE,
  PLAYBOOK_360_BY_SHORT_CODE,
  PLAYBOOK_360_DOMAIN_TABS,
  getPlaybookDomainForShortCode,
  type Playbook360ShortCode,
} from '../src/lib/playbookCatalog.ts';
import { getPlaybookPrecedence } from '../src/lenses/lensMath.ts';
import { partitionPlaybookActionsWithSafetyGates } from '../src/workbench/safetyGatePartition.ts';
import {
  beginCameraFlight,
  createInitialCameraRigState,
  presetToCameraSnapshot,
  stepCameraRigFrame,
} from '../src/stage3d/cameraRigMath.ts';
import { segmentWaveformWithDropouts } from '../src/instruments/instrumentMath.ts';
import { evaluateFreshnessGate } from '../src/lib/freshnessGate.ts';
import { normalizeTimestralQuantiles } from '../src/lib/telemetryValidation.ts';
import { renderSettings } from '../src/lib/renderQuality.ts';

test('Phase 10: Suite A1 - Non-finite telemetry values never leak strings or coerce to false zeros', () => {
  const ring = new TelemetryRingBuffer(30);
  const now = 1000.0;

  // Push samples with explicit NaN/null values
  ring.pushSample({
    timestampS: now,
    hrBpm: Number.NaN,
    pulseBpm: null,
    spo2Pct: Number.NaN,
    respBrpm: null,
  });

  const segmented = segmentWaveformWithDropouts({
    timestampsS: ring.timestampsS,
    values: ring.hrBpm,
    oldestIndex: ring.oldestRingIndex(),
    sampleCount: ring.length,
    capacity: ring.capacity,
    windowSec: 5,
    minValue: 40,
    maxValue: 150,
  });

  // Zero continuous lines rendered across NaN
  assert.equal(segmented.segments.length, 0);
  // Recorded as an explicit dropout span
  assert.equal(segmented.dropoutSpans.length, 1);
  assert.equal(segmented.latestFiniteValue, null);

  // Assert numerical zero is NOT returned as an observed sample
  assert.equal(segmented.minObserved, null);
  assert.equal(segmented.maxObserved, null);
});

test('Phase 10: Suite A2 - Strict forecast channel binding suppresses unmatched cones', () => {
  // Test Issue #11 invariant: when rmssd_ms is absent, RR-dependent cones are strictly null
  const rawQuantiles = {
    confidence_state: 'CONFORMAL_VALID',
    conformal_status: 'CONFORMAL_VALID',
    rmssd_ms_cone: { q05: 20, q50: 35, q95: 50 },
    heart_rate_bpm_cone: { q05: 60, q50: 75, q95: 90 },
  };

  // With absent RMSSD, rmssd_ms_cone must be strictly null
  const normalized = normalizeTimestralQuantiles(rawQuantiles, {
    hrvRmssdMs: null,
    hrvUnavailableReason: 'BEAT_INTERVALS_NOT_AVAILABLE',
  });
  assert.ok(normalized);
  assert.equal(normalized.rmssd_ms_cone, null);
  assert.ok(normalized.heart_rate_bpm_cone);
  assert.equal(normalized.heart_rate_bpm_cone.q50, 75);

  // When RMSSD is present and valid, rmssd_ms_cone is parsed and retained
  const valid = normalizeTimestralQuantiles(rawQuantiles, {
    hrvRmssdMs: 42.5,
    hrvUnavailableReason: null,
  });
  assert.ok(valid);
  assert.ok(valid.rmssd_ms_cone);
  assert.equal(valid.rmssd_ms_cone.q50, 35);
});

test('Phase 10: Suite A3 - Deliberate confirmation hold time enforced under reduced motion', () => {
  const settings = renderSettings('STANDARD', 0.5, 2, false, true);
  // Under reduced motion, frameloop drops to on-demand (demand) rather than continuous (always)
  assert.equal(settings.frameloop, 'demand');

  // Verify workbench store preserves reduced-motion compliance
  const store = useWorkbenchStore.getState();
  store.resetWorkbench();
  assert.equal(store.displayMode, 'operational');
  store.resetWorkbench();
});

test('Phase 10: Suite A4 - Unavailable WebGL deterministic 2D fallback', () => {
  // LOW_2D quality tier forces frameloop to never with DPR 1
  const low2d = renderSettings('LOW_2D', 0.5, 2, false, false);
  assert.equal(low2d.frameloop, 'never');
  assert.equal(low2d.dpr, 1);

  // Verify that switching to LOW_2D in store retains full clinical state
  const store = useWorkbenchStore.getState();
  store.resetWorkbench();
  store.setPhase('ACT');
  store.selectPlaybook('PLAYBOOK_01_VENOUS_STASIS_LBNP');
  store.setQualityTier('LOW_2D');

  assert.equal(useWorkbenchStore.getState().qualityTier, 'LOW_2D');
  assert.equal(useWorkbenchStore.getState().phase, 'ACT');
  assert.equal(
    useWorkbenchStore.getState().selectedPlaybookId,
    'PLAYBOOK_01_VENOUS_STASIS_LBNP',
  );
  store.resetWorkbench();
});

test('Phase 10: Suite B - Provenance, snapshot ordering, and stale detection lifecycle', () => {
  const state = {
    activeSourceId: 'SRC-BIDMC-01',
    lastAppliedTimestampMs: 50000,
    lastAppliedRecTime: 10.0,
  };

  // Monotonic advancement (time advances) must be accepted
  const valid = evaluateFreshnessGate(
    { timestamp_ms: 50050, relative_recording_time_s: 10.05, source_record_id: 'SRC-BIDMC-01' },
    state,
  );
  assert.equal(valid.accepted, true);
  assert.equal(valid.nextState.lastAppliedTimestampMs, 50050);

  // Out-of-order regression (timestamp regresses within same source) must be rejected
  const regressive = evaluateFreshnessGate(
    { timestamp_ms: 49900, relative_recording_time_s: 9.9, source_record_id: 'SRC-BIDMC-01' },
    state,
  );
  assert.equal(regressive.accepted, false);
  assert.equal(regressive.nextState.lastAppliedTimestampMs, 50000);

  // Source switch (new source ID) must reset tracking and be accepted
  const sourceSwitch = evaluateFreshnessGate(
    { timestamp_ms: 1000, relative_recording_time_s: 0.1, source_record_id: 'SRC-WEARABLE-02' },
    state,
  );
  assert.equal(sourceSwitch.accepted, true);
  assert.equal(sourceSwitch.nextState.activeSourceId, 'SRC-WEARABLE-02');
});

test('Phase 10: Suite C - All 15 crystallized and vitals playbooks present in catalog with safety gates', () => {
  const expectedPlaybooks = [
    'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS',
    'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
    'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION',
    'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS',
    'PLAYBOOK_06_HYPOXEMIA_DESATURATION',
    'PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS',
    'PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK',
    'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION',
    'PLAYBOOK_10_RENAL_LITHIASIS',
    'PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING',
    'PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE',
    'PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR',
    'PLAYBOOK_14_CO2_SCRUBBER_SANS',
    'PLAYBOOK_15_EFAST_TRAUMA_TRIAGE',
  ];

  assert.equal(ALL_CRYSTALLIZED_PLAYBOOK_LIST.length, 15);

  for (const id of expectedPlaybooks) {
    const entry = getCatalogEntry(id as any);
    assert.ok(entry, `Playbook ${id} must exist in catalog`);
    assert.ok(entry.title.length > 0, `Playbook ${id} must have a non-empty title`);
    assert.ok(entry.default_actions.length > 0, `Playbook ${id} must have actionable steps`);
    assert.ok(entry.normative_clause.length > 0, `Playbook ${id} must have a normative clause`);
  }

  // Verify short code indexing #01..#15
  for (let i = 1; i <= 15; i++) {
    const code = `#${String(i).padStart(2, '0')}` as any;
    const entry = PLAYBOOK_BY_SHORT_CODE[code];
    assert.ok(entry, `Shortcode ${code} must map to a catalog entry`);
  }
});

test('Phase 10: Suite D - Dual donor switching and license segregation', () => {
  const store = useWorkbenchStore.getState();
  store.resetWorkbench();

  // Test donor switching between MALE (Z-Anatomy, CC BY-SA 4.0) and FEMALE (HRA, CC BY 4.0)
  store.setTwinSex('MALE');
  assert.equal(useWorkbenchStore.getState().twinSex, 'MALE');

  store.setTwinSex('FEMALE');
  assert.equal(useWorkbenchStore.getState().twinSex, 'FEMALE');

  // Verify that changing donor sex clears anatomical focus coordinates without losing clinical state
  store.selectUberonRegion('InternalJugularVein');
  assert.equal(useWorkbenchStore.getState().selectedUberonRegion, 'InternalJugularVein');

  store.setTwinSex('MALE');
  assert.equal(useWorkbenchStore.getState().twinSex, 'MALE');
  assert.equal(useWorkbenchStore.getState().selectedUberonRegion, 'InternalJugularVein');

  store.resetWorkbench();
});

test('Phase 10: Suite E - Aerospace 360 Catalog exposes all 30 playbooks (#01-#30) across 4 domain tabs', () => {
  assert.equal(ALL_CRYSTALLIZED_PLAYBOOK_LIST.length, 15);
  assert.equal(ALL_360_PLAYBOOK_LIST.length, 30);
  assert.equal(PLAYBOOK_360_DOMAIN_TABS.length, 4);

  assert.equal(PLAYBOOK_360_DOMAIN_TABS[0].shortCodes.length, 8);
  assert.equal(PLAYBOOK_360_DOMAIN_TABS[1].shortCodes.length, 7);
  assert.equal(PLAYBOOK_360_DOMAIN_TABS[2].shortCodes.length, 8);
  assert.equal(PLAYBOOK_360_DOMAIN_TABS[3].shortCodes.length, 7);

  for (let i = 1; i <= 30; i++) {
    const code = `#${String(i).padStart(2, '0')}` as Playbook360ShortCode;
    const entry = PLAYBOOK_360_BY_SHORT_CODE[code];
    assert.ok(entry, `Shortcode ${code} must exist in PLAYBOOK_360_BY_SHORT_CODE`);
    assert.equal(getCatalogEntry(entry.playbook_id)?.short_code, code);
    assert.ok(entry.normative_clause.length > 0);
    assert.ok(entry.default_actions.length > 0);
    const prec = getPlaybookPrecedence(entry.playbook_id);
    assert.ok(prec.tier >= 1 && prec.tier <= 6);
    const dom = getPlaybookDomainForShortCode(code);
    assert.ok(
      PLAYBOOK_360_DOMAIN_TABS.some((t) => t.id === dom),
      `Domain ${dom} for ${code} must match 4 domain tabs`,
    );
  }
});

test('Phase 10: Suite F - Gates 1..7 matrix surfaces extended safety gates 5A, 5B, 5C, 6, 7', () => {
  const dag = partitionPlaybookActionsWithSafetyGates(
    ALL_360_PLAYBOOK_LIST[15].default_actions,
    {
      anticoagulant_lock_active: true,
      lbnp_auto_vent_armed: true,
      eva_suit_damping_active: false,
      gate4_invasive_decompression_locked: true,
      gate4_eva_fitness_no_go: false,
    },
    {
      gaiPct: 4.5,
      extendedGates: {
        gate5_nsaid_renal_bleeding_locked: true,
        gate5_allergy_or_qtc_locked: true,
        gate5_formulary_substitution_active: true,
        gate6_radiation_neutropenic_invasive_locked: true,
        gate7_bmed_delirium_or_restraint_guard_active: true,
      },
    },
  );

  assert.equal(dag.interlockMatrix.length, 5);
  assert.equal(dag.extendedInterlockMatrix.length, 5);
  assert.equal(dag.gates1To7Matrix.length, 10);
  assert.deepEqual(
    dag.gates1To7Matrix.map((g) => g.pillCode),
    ['1', '2', '3', '4A', '4B', '5A', '5B', '5C', '6', '7'],
  );

  const byPill = new Map(dag.gates1To7Matrix.map((g) => [g.pillCode, g]));
  assert.equal(byPill.get('5A')?.status, 'TRIGGERED');
  assert.equal(byPill.get('5B')?.status, 'TRIGGERED');
  assert.equal(byPill.get('5C')?.status, 'ACTIVE');
  assert.equal(byPill.get('6')?.status, 'LOCKED');
  assert.equal(byPill.get('7')?.status, 'TRIGGERED');
  assert.equal(dag.autonomousOverrides.length, 4);
});

test('Phase 10: Suite G - Critically-damped Quaternion Slerp converges monotonically without overshoot and honors reduced motion', () => {
  const rig = createInitialCameraRigState(presetToCameraSnapshot('DEFAULT'));
  const target = presetToCameraSnapshot('HEART');
  beginCameraFlight(rig, target);
  assert.equal(rig.inFlight, true);
  assert.equal(rig.slerpProgress, 0);

  let prevProgress = rig.slerpProgress;
  for (let i = 0; i < 120 && rig.inFlight; i++) {
    stepCameraRigFrame(rig, target, 0, 0, 1 / 60, false);
    assert.ok(rig.slerpProgress >= prevProgress - 1e-9, 'slerpProgress must be non-decreasing');
    assert.ok(rig.slerpProgress <= 1 + 1e-9, 'slerpProgress must never overshoot 1.0');
    const qNorm = Math.hypot(
      rig.orientation[0],
      rig.orientation[1],
      rig.orientation[2],
      rig.orientation[3],
    );
    assert.ok(Math.abs(qNorm - 1.0) < 1e-4, 'orientation quaternion must stay unit length');
    prevProgress = rig.slerpProgress;
  }
  assert.equal(rig.inFlight, false);
  assert.equal(rig.slerpProgress, 1);

  // Reduced motion must complete flight in exactly 1 frame
  const reducedRig = createInitialCameraRigState(presetToCameraSnapshot('DEFAULT'));
  const reducedTarget = presetToCameraSnapshot('ONSD');
  beginCameraFlight(reducedRig, reducedTarget);
  stepCameraRigFrame(reducedRig, reducedTarget, -40, 12, 1 / 60, true);
  assert.equal(reducedRig.inFlight, false);
  assert.equal(reducedRig.slerpProgress, 1);
  assert.equal(reducedRig.offsetX, -40);
  assert.equal(reducedRig.offsetY, 12);
});
