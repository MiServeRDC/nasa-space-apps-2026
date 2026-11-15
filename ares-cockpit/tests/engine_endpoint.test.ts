import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEngineEndpoints } from '../src/lib/engineEndpoint.ts';

test('hosted HTTPS frontend uses its own origin and secure WebSocket by default', () => {
  assert.deepEqual(resolveEngineEndpoints({ browserOrigin: 'https://demo.example' }),
    { http: 'https://demo.example', ws: 'wss://demo.example/ws/telemetry' });
});
test('standalone localhost package uses its actual port', () => {
  assert.deepEqual(resolveEngineEndpoints({ browserOrigin: 'http://127.0.0.1:18080' }),
    { http: 'http://127.0.0.1:18080', ws: 'ws://127.0.0.1:18080/ws/telemetry' });
});
test('native shell and non-http origins retain loopback fallback', () => {
  for (const config of [{ desktop: true, browserOrigin: 'https://tauri.localhost' },
    { browserOrigin: 'tauri://localhost' }, {}]) {
    assert.equal(resolveEngineEndpoints(config).http, 'http://127.0.0.1:8080');
  }
});
test('explicit endpoint overrides preserve proxy prefixes without double slashes', () => {
  assert.deepEqual(resolveEngineEndpoints({ httpUrl: ' https://api.example/ares/ ',
    browserOrigin: 'https://demo.example' }),
    { http: 'https://api.example/ares', ws: 'wss://api.example/ares/ws/telemetry' });
  assert.equal(resolveEngineEndpoints({ httpUrl: 'http://localhost:8123',
    wsUrl: 'wss://stream.example/custom' }).ws, 'wss://stream.example/custom');
});
