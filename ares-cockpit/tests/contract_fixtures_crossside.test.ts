import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  isValidTelemetryPayload,
  normalizeTelemetryPacket,
} from '../src/lib/telemetryValidation.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', 'contracts', 'fixtures');

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

// Exactly the five telemetry-packet fixtures the Rust engine validates against
// contracts/telemetry_schema.json (see
// crates/ares-server-cli/tests/integration_graph_and_mcp.rs::
// contracts_fixtures_parse_and_validate_against_telemetry_schema). Asserting the
// React cockpit accepts and decodes the same frames closes the Rust <-> React
// contract seam: a schema change that the engine honors but the cockpit does not
// (or vice versa) now fails a test instead of surfacing as a silent runtime drop.
const TELEMETRY_FRAME_FIXTURES = [
  'nominal_frame.json',
  'missing_channel_frame.json',
  'sans_alert_frame.json',
  'telemetry_bidmc_replay.json',
  'telemetry_whatif_overlay.json',
] as const;

describe('contract telemetry fixtures (Rust <-> React cross-side agreement)', () => {
  for (const name of TELEMETRY_FRAME_FIXTURES) {
    it(`cockpit validator accepts ${name}`, () => {
      const raw = readFixture(name);
      assert.equal(
        isValidTelemetryPayload(raw),
        true,
        `${name} is schema-valid on the Rust side but rejected by isValidTelemetryPayload`,
      );
    });

    it(`cockpit decodes ${name} via normalizeTelemetryPacket`, () => {
      const packet = normalizeTelemetryPacket(readFixture(name));
      assert.notEqual(
        packet,
        null,
        `${name} failed to decode via normalizeTelemetryPacket`,
      );
    });
  }

  it('cockpit preserves the degraded-data semantics the engine asserts for missing_channel_frame.json', () => {
    const packet = normalizeTelemetryPacket(readFixture('missing_channel_frame.json'));
    assert.notEqual(packet, null);
    // Mirrors the Rust-side assertions so both sides agree on meaning, not just shape.
    assert.equal(
      packet!.safety_margins.alarm_level,
      'DATA_DEGRADED_MISSING_CHANNELS',
      'cockpit lost the degraded-channel alarm level the engine sets',
    );
    assert.equal(
      packet!.biometrics.hrv_unavailable_reason,
      'BEAT_INTERVALS_NOT_AVAILABLE',
      'cockpit lost the HRV-unavailable reason the engine sets',
    );
  });
});
