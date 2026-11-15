import assert from 'node:assert/strict';
import test from 'node:test';
import { updateAlarmEpisode, type AlarmEpisode } from '../src/lib/alarmRecovery.ts';

const active: AlarmEpisode = { source: 'engine', cause: 'vitals', phase: 'active' };
const normalEngine = { source: 'engine', cause: null, fresh: true, canVerifyVitals: true } as const;

test('fresh normal engine data clears a vital-sign alarm', () => {
  const recovered = updateAlarmEpisode(active, normalEngine);
  assert.equal(recovered?.phase, 'recovered');
  assert.equal(updateAlarmEpisode(recovered, { ...normalEngine, cause: 'vitals' })?.phase, 'active');
});

test('incomplete, stale or simulated data cannot clear a live engine alarm', () => {
  const readings = [
    { ...normalEngine, canVerifyVitals: false },
    { ...normalEngine, fresh: false },
    { ...normalEngine, source: 'simulation' as const },
  ];
  for (const reading of readings) {
    assert.equal(updateAlarmEpisode(active, reading)?.phase, 'awaiting');
  }
});

test('fresh scenario margins clear a simulated critical alert independently of the checklist', () => {
  const reading = { ...normalEngine, source: 'simulation' as const, canVerifyVitals: false };
  const episode = updateAlarmEpisode(null, { ...reading, cause: 'critical' });
  assert.equal(episode?.phase, 'active');
  assert.equal(updateAlarmEpisode(episode, reading)?.phase, 'recovered');
});
