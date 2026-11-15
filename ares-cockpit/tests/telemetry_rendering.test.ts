import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equalTelemetryValue} from '../src/lib/equalTelemetryValue.ts';

test('render equivalence preserves missing values, alarms, topology and units', () => {
  const snapshot={hr:72,spo2:null,unit:'bpm',regions:[{id:'ijv',observed:false,alarm:'NORMAL'}]};
  assert.ok(equalTelemetryValue(snapshot,structuredClone(snapshot)));
  for (const change of [
    {...snapshot,spo2:0}, {...snapshot,hr:73}, {...snapshot,unit:'Hz'},
    {...snapshot,regions:[{id:'ijv',observed:true,alarm:'NORMAL'}]},
    {...snapshot,regions:[{id:'ijv',observed:false,alarm:'ALARM'}]},
  ]) assert.equal(equalTelemetryValue(snapshot,change),false);
  assert.equal(equalTelemetryValue({a:undefined},{b:undefined}),false);
  assert.equal(equalTelemetryValue([],{}),false);
});
