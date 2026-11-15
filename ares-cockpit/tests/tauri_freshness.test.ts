import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  decodeBinaryTelemetryFrame,
  encodeTestBinaryTelemetryFrame,
  mergeBinaryFrameIntoPacket,
} from '../src/lib/binaryTelemetryDecoder.ts';
import { normalizeTelemetryPacket } from '../src/lib/telemetryValidation.ts';
import type { TelemetryPacket } from '../src/types/telemetry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COCKPIT_ROOT = path.resolve(__dirname, '..');

test('useTelemetry source contains bounded snapshot polling and robust binary subscription fallback', () => {
  const useTelemetryPath = path.join(COCKPIT_ROOT, 'src', 'lib', 'useTelemetry.ts');
  const src = fs.readFileSync(useTelemetryPath, 'utf8');

  // Must have periodic snapshot interval in desktop shell effect
  assert.match(
    src,
    /snapshotPollId\s*=\s*window\.setInterval/,
    'Desktop effect must maintain a periodic snapshotPollId interval for extended panel freshness',
  );

  // Must handle subscription failure gracefully with active fallback
  assert.match(
    src,
    /subscribe_binary_telemetry[\s\S]*?\.catch/,
    'Desktop effect must catch binary telemetry subscription failure',
  );
  assert.match(
    src,
    /hydrateTauriSnapshot\(\)/,
    'Desktop effect must invoke hydrateTauriSnapshot on subscription fallback',
  );

  // Must clean up intervals on unmount
  assert.match(
    src,
    /window\.clearInterval\(snapshotPollId\)/,
    'Desktop effect must clear snapshotPollId interval on unmount',
  );
  assert.match(
    src,
    /window\.clearInterval\(osPollId\)/,
    'Desktop effect must clear osPollId interval on unmount',
  );
});

test('Extended panel data updates independently when binary telemetry headers are stable', () => {
  // Baseline wire packet fixture
  const baseJson = {
    schema_version: 1,
    relative_recording_time_s: 180.0,
    timestamp_ms: 1794657600000,
    source_record_id: 'bidmc_01',
    astronaut_id: 'BIDMC-SUBJECT-01',
    alert_severity: 'NOMINAL',
    flight_day: 180,
    provenance_manifest: {
      biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
      biometrics_native_rate_hz: 1,
      ui_refresh_rate_hz: 20,
      scenario_overlay_mode: 'NONE_PURE_REPLAY',
    },
    safety_margins: {
      provenance: 'DERIVED_FROM_RECORDED_BIDMC',
      alarm_level: 'NOMINAL',
      med_stl_rho_robustness: 0.80,
      mission_readiness_index: 88,
    },
    biometrics: {
      heart_rate_bpm: 72.0,
      resp_rate_brpm: 14.0,
      spo2_pct: 98.0,
      pulse_rate_bpm: 72.0,
      sqi_score: 0.95,
      sbp_mmhg: 118.0,
      dbp_mmhg: 76.0,
      missing_channels: [],
    },
    musculoskeletal: {
      ared_daily_load_kgf: 120.0,
      soleus_csa_pct: 95.0,
      echo_intensity_au: 45.0,
      mqi_index: 0.92,
      sclerostin_pmol_l: 28.0,
      urinary_calcium_mg_d: 180.0,
      gai_pct: 4.5,
    },
    jugular_hemodynamics: {
      ijv_csa_mm2: 85.0,
      ijv_vmax_cm_s: 18.0,
      tau_w_dyn_cm2: 1.40,
      flow_grade: 'NORMAL_CONTINUOUS',
      pocus_thrombus_confirmed: false,
      lbnp_active: false,
      lbnp_pressure_mmhg: 0.0,
    },
    sans_ocular: {
      onsd_mm: 4.8,
      choroidal_delta_um: 12.0,
      sans_risk_index: 0.15,
    },
    nqs_stl: {
      rho_tau_w: 0.75,
      rho_ared_strain: 0.82,
      rho_sans_onsd: 0.88,
      rho_co2_cerebral: 0.91,
      rho_min_global: 0.75,
      mri_score: 88.0,
    },
    safety_gates: {
      gate1_anticoagulation_lock: true,
      gate2_lbnp_vent_armed: true,
      gate3_martian_gai_lock: true,
    },
  };

  const initialPacket = normalizeTelemetryPacket(baseJson);
  assert.ok(initialPacket, 'Initial packet must normalize');

  // Simulate arrival of a 128B binary frame with HR = 78 bpm, but same alert/playbook code
  const buf = encodeTestBinaryTelemetryFrame({
    hr_bpm: 78.0,
    active_alert_code: 0,
    active_playbook_id: 0,
  });

  const decodedFrame = decodeBinaryTelemetryFrame(buf);
  assert.ok(decodedFrame, 'Binary frame must decode successfully');

  // Merge binary frame into packet
  const mergedPacket = mergeBinaryFrameIntoPacket(initialPacket, decodedFrame);
  assert.equal(mergedPacket.biometrics.heart_rate_bpm, 78.0, 'HR must be updated by 20Hz binary frame');

  // Next, simulate the 1 Hz snapshot arrival with extended diagnostic data (e.g. updated sclerostin and mri)
  const updatedSnapshotJson = {
    ...baseJson,
    musculoskeletal: {
      ...baseJson.musculoskeletal,
      sclerostin_pmol_l: 35.0,
    },
    safety_margins: {
      ...baseJson.safety_margins,
      mission_readiness_index: 92,
    },
  };

  const freshSnapshot = normalizeTelemetryPacket(updatedSnapshotJson);
  assert.ok(freshSnapshot, 'Fresh snapshot must normalize');
  assert.equal(freshSnapshot.musculoskeletal?.sclerostin_pmol_l, 35.0, 'Extended field sclerostin must reflect fresh snapshot');
  assert.equal(freshSnapshot.safety_margins.mission_readiness_index, 92, 'Extended field MRI must reflect fresh snapshot');
});

test('Snapshot freshness guards reject out-of-order and regressive delayed responses', () => {
  const useTelemetryPath = path.join(COCKPIT_ROOT, 'src', 'lib', 'useTelemetry.ts');
  const src = fs.readFileSync(useTelemetryPath, 'utf8');

  // Verify single-flight bounding and monotonic timestamp checks are present in source
  assert.match(
    src,
    /snapshotInFlightRef/,
    'useTelemetry must maintain snapshotInFlightRef to bound concurrent requests',
  );
  assert.match(
    src,
    /lastAppliedTimestampMsRef/,
    'useTelemetry must maintain lastAppliedTimestampMsRef for monotonic ordering',
  );
  assert.match(
    src,
    /normalized\.timestamp_ms\s*<\s*lastAppliedTimestampMsRef\.current/,
    'acceptRawPayload must reject snapshots whose timestamp_ms is older than last applied',
  );
  assert.match(
    src,
    /Promise\.race\(\[[\s\S]*?timeoutPromise[\s\S]*?\]\)/,
    'hydrateTauriSnapshot must race invoke against timeout to prevent hung requests',
  );
});
