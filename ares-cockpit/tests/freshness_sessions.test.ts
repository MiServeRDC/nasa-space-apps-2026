import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { evaluateFreshnessGate, type FreshnessGateState } from '../src/lib/freshnessGate.ts';
import { normalizeTelemetryPacket } from '../src/lib/telemetryValidation.ts';

const state: FreshnessGateState = {
  activeSourceId: 'bidmc_01', lastAppliedTimestampMs: 480000,
  lastAppliedRecTime: 480, lastAppliedEngineElapsedS: 480,
};
const frame = (recording: number, engine: number | null) => ({
  timestamp_ms: recording * 1000, relative_recording_time_s: recording,
  source_record_id: 'bidmc_01', engine_elapsed_s: engine,
});

test('an actual replay wrap uses advancing engine time despite a lower recording timestamp', () => {
  const result = evaluateFreshnessGate(frame(0, 481), state);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.lastAppliedTimestampMs, 0);
  assert.equal(result.nextState.lastAppliedEngineElapsedS, 481);
});

test('large delayed responses cannot masquerade as replay wraps', () => {
  for (const older of [frame(479, 479), frame(450, 450), frame(0, 0), frame(0, null)]) {
    const result = evaluateFreshnessGate(older, state);
    assert.equal(result.accepted, false);
    assert.equal(result.nextState, state);
  }
});

test('a late frame from the previous cycle is rejected even if its recording timestamp looks newer', () => {
  const wrapped = evaluateFreshnessGate(frame(0, 481), state);
  const delayed = evaluateFreshnessGate(frame(480, 480), wrapped.nextState);
  assert.equal(delayed.accepted, false);
  assert.equal(evaluateFreshnessGate(frame(1, 482), wrapped.nextState).accepted, true);
});

test('legacy frames can move forward but cannot prove a rewind or drop an established clock', () => {
  const legacy = { ...state, lastAppliedEngineElapsedS: null };
  assert.equal(evaluateFreshnessGate(frame(481, null), legacy).accepted, true);
  assert.equal(evaluateFreshnessGate(frame(0, null), legacy).accepted, false);
  assert.equal(evaluateFreshnessGate(frame(481, null), state).accepted, false);
});

test('a new socket session can accept the same record from zero without allowing a clock regression in-session', () => {
  assert.equal(evaluateFreshnessGate(frame(0, 0), state).accepted, false);
  const freshSession: FreshnessGateState = { activeSourceId: 'bidmc_01',
    lastAppliedTimestampMs: null, lastAppliedRecTime: null, lastAppliedEngineElapsedS: null };
  const first = evaluateFreshnessGate(frame(0, 0), freshSession);
  assert.equal(first.accepted, true);
  assert.equal(evaluateFreshnessGate(frame(1, 1), first.nextState).accepted, true);
});

test('normalization preserves engine lifetime independently of recording time and rejects invalid clocks', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../../contracts/fixtures/telemetry_bidmc_replay.json', import.meta.url), 'utf8'));
  assert.equal(normalizeTelemetryPacket({ ...fixture, engine_elapsed_s: null, mission_Elapsed_seconds: -1 }), null);
  assert.equal(normalizeTelemetryPacket({ ...fixture, engine_elapsed_s: null, mission_Elapsed_seconds: 0 })?.engine_elapsed_s, 0);
  for (const key of ['mission_Elapsed_seconds', 'mission_elapsed_seconds', 'engine_elapsed_s']) {
    const raw = { ...fixture, [key]: 481.05 };
    const normalized = normalizeTelemetryPacket(raw);
    assert.ok(normalized);
    assert.equal(normalized.engine_elapsed_s, 481.05);
    assert.equal(normalized.relative_recording_time_s, fixture.relative_recording_time_s);
    assert.equal(normalizeTelemetryPacket({ ...fixture, [key]: -1 }), null);
  }
});
