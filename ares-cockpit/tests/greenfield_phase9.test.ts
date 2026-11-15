import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHardwareTier,
  evaluatePressureStepDown,
  evaluatePressureRecovery,
  renderSettings,
} from '../src/lib/renderQuality.ts';
import { useWorkbenchStore } from '../src/stores/workbenchStore.ts';
import { TelemetryRingBuffer } from '../src/stores/telemetryRingBuffer.ts';
import { segmentWaveformWithDropouts } from '../src/instruments/instrumentMath.ts';

test('Phase 9: hardware capability hint detection and pressure hysteresis', () => {
  // Low concurrency or low memory detects LOW_2D
  assert.equal(detectHardwareTier({ hardwareConcurrency: 2, deviceMemory: 2 }), 'LOW_2D');
  assert.equal(detectHardwareTier({ hardwareConcurrency: 1, deviceMemory: 4 }), 'LOW_2D');
  assert.equal(detectHardwareTier({ hardwareConcurrency: 4, deviceMemory: 1 }), 'LOW_2D');

  // Standard multi-core hardware detects STANDARD
  assert.equal(detectHardwareTier({ hardwareConcurrency: 4, deviceMemory: 4 }), 'STANDARD');
  assert.equal(detectHardwareTier({ hardwareConcurrency: 6, deviceMemory: 6 }), 'STANDARD');

  // High performance workstation detects DETAILED
  assert.equal(detectHardwareTier({ hardwareConcurrency: 8, deviceMemory: 8 }), 'DETAILED');
  assert.equal(detectHardwareTier({ hardwareConcurrency: 16, deviceMemory: 32 }), 'DETAILED');

  // Reduced motion preference forces STANDARD over DETAILED for quietness
  assert.equal(
    detectHardwareTier({
      hardwareConcurrency: 16,
      deviceMemory: 32,
      prefersReducedMotion: true,
    }),
    'STANDARD',
  );

  // Pressure step-down hysteresis: degrades only when P95 frame time > budget (28ms)
  assert.equal(evaluatePressureStepDown('DETAILED', 16.0, 28.0), 'DETAILED');
  assert.equal(evaluatePressureStepDown('DETAILED', 28.0, 28.0), 'DETAILED');
  assert.equal(evaluatePressureStepDown('DETAILED', 33.5, 28.0), 'STANDARD');
  assert.equal(evaluatePressureStepDown('STANDARD', 35.0, 28.0), 'LOW_2D');
  assert.equal(evaluatePressureStepDown('LOW_2D', 40.0, 28.0), 'LOW_2D');

  // Recovery requires sustained P95 frame time < 14ms
  assert.equal(evaluatePressureRecovery('LOW_2D', 15.0, 14.0), 'LOW_2D');
  assert.equal(evaluatePressureRecovery('LOW_2D', 11.2, 14.0), 'STANDARD');
  assert.equal(evaluatePressureRecovery('STANDARD', 9.5, 14.0), 'DETAILED');
});

test('Phase 9: quality policy suppresses frameloop on hidden and LOW_2D without data loss', () => {
  // LOW_2D drops frameloop to never with DPR 1
  const low2d = renderSettings('LOW_2D', 0.5, 2, false, false);
  assert.equal(low2d.frameloop, 'never');
  assert.equal(low2d.dpr, 1);

  // Hidden stage drops frameloop to never across all tiers
  for (const mode of ['AUTO', 'LITE', 'STANDARD', 'HIGH', 'LOW_2D', 'DETAILED'] as const) {
    const hidden = renderSettings(mode, 0.5, 2, true, false);
    assert.equal(hidden.frameloop, 'never');
  }

  // Active STANDARD and DETAILED modes run frameloop
  const standard = renderSettings('STANDARD', 0.5, 2, false, false);
  assert.equal(standard.frameloop, 'always');
  assert.equal(standard.dpr, 1.25);

  const detailed = renderSettings('DETAILED', 0.5, 2, false, false);
  assert.equal(detailed.frameloop, 'always');
  assert.equal(detailed.dpr, 2.0);
});

test('Phase 9: quality tier mutations preserve clinical state and selection identities', () => {
  const store = useWorkbenchStore.getState();
  store.resetWorkbench();
  store.setPhase('ACT');
  store.selectUberonRegion('InternalJugularVein');
  store.setTwinSex('FEMALE');
  store.setPrivacyRole('CMO');

  // Transition quality tiers: DETAILED -> STANDARD -> LOW_2D -> DETAILED
  store.setQualityTier('DETAILED');
  assert.equal(useWorkbenchStore.getState().qualityTier, 'DETAILED');
  assert.equal(useWorkbenchStore.getState().phase, 'ACT');
  assert.equal(useWorkbenchStore.getState().selectedUberonRegion, 'InternalJugularVein');
  assert.equal(useWorkbenchStore.getState().twinSex, 'FEMALE');

  store.setQualityTier('LOW_2D');
  assert.equal(useWorkbenchStore.getState().qualityTier, 'LOW_2D');
  assert.equal(useWorkbenchStore.getState().phase, 'ACT');
  assert.equal(useWorkbenchStore.getState().selectedUberonRegion, 'InternalJugularVein');
  assert.equal(useWorkbenchStore.getState().twinSex, 'FEMALE');

  store.setQualityTier('STANDARD');
  assert.equal(useWorkbenchStore.getState().qualityTier, 'STANDARD');
  assert.equal(useWorkbenchStore.getState().phase, 'ACT');

  store.resetWorkbench();
});

test('Phase 9: waveform segmentation preserves Issue #11 NaN dropouts with zero flatlines', () => {
  const ring = new TelemetryRingBuffer(60);

  const now = 100.0;
  // Push 10 valid samples, 5 NaN dropouts, 5 valid samples
  for (let i = 0; i < 10; i++) {
    ring.pushSample({ timestampS: now + i * 0.05, hrBpm: 75 + i, spo2Pct: 98, respBrpm: 14 });
  }
  for (let i = 10; i < 15; i++) {
    ring.pushSample({ timestampS: now + i * 0.05, hrBpm: Number.NaN, spo2Pct: 98, respBrpm: 14 });
  }
  for (let i = 15; i < 20; i++) {
    ring.pushSample({ timestampS: now + i * 0.05, hrBpm: 80 + i, spo2Pct: 98, respBrpm: 14 });
  }

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

  // Must have exactly 2 distinct continuous segments (pen lift across NaN)
  assert.equal(segmented.segments.length, 2);
  // Must have recorded 1 explicit dropout span
  assert.equal(segmented.dropoutSpans.length, 1);
  assert.ok(segmented.dropoutSpans[0].endRatio > segmented.dropoutSpans[0].startRatio);

  // NaN values must NEVER be converted to 0
  assert.equal(
    segmented.segments.flat().some((p) => p.yRatio === 0 && p.xRatio > 0.4 && p.xRatio < 0.8),
    false,
  );
});
