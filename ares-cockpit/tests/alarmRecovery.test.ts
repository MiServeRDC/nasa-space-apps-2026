import assert from 'node:assert/strict';
import test from 'node:test';
import { updateAlarmEpisode, updateProcedureIncident, type AlarmEpisode } from '../src/lib/alarmRecovery.ts';

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

test('BIDMC missing mission inputs do not keep a verified vital-sign alarm open', () => {
  const bidmcReading = { ...normalEngine, missionDataComplete: false };
  assert.equal(updateAlarmEpisode(active, bidmcReading)?.phase, 'recovered');
  assert.equal(updateAlarmEpisode({ ...active, cause: 'critical' }, bidmcReading)?.phase, 'awaiting');
});

test('an alarm gets its own checklist and never inherits an unrelated completion', () => {
  const mission: AlarmEpisode = { ...active, cause: 'critical' };
  const oldIncident = updateProcedureIncident(null, null, mission, { playbook_id: 'MISSION' });
  assert.ok(oldIncident);
  const newIncident = updateProcedureIncident({ ...oldIncident, completed: true }, mission, active, null);
  assert.equal(newIncident?.playbook, null);
  assert.equal(newIncident?.completed, false);
  const withChecklist = updateProcedureIncident(newIncident, active, active, { playbook_id: 'VITALS' });
  assert.equal(withChecklist?.playbook?.playbook_id, 'VITALS');
  const updated = updateProcedureIncident(withChecklist, active, active, { playbook_id: 'OTHER_VITALS' });
  assert.equal(updated?.key, (withChecklist?.key ?? 0) + 1);
  const recovered: AlarmEpisode = { ...active, phase: 'recovered' };
  assert.equal(updateProcedureIncident(updated, active, recovered, { playbook_id: 'MISSION' }), updated);
});
