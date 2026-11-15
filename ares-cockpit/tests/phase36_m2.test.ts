import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BINARY_PLAYBOOK_DEFAULTS,
  decodeBinaryTelemetryFrame,
  encodeTestBinaryTelemetryFrame,
  mergeBinaryFrameIntoPacket,
  PLAYBOOK_ID_BY_CODE,
} from '../src/lib/binaryTelemetryDecoder.ts';
import {
  ACUTE_VITALS_PLAYBOOK_LIST,
  ALL_CRYSTALLIZED_PLAYBOOK_LIST,
  CRYSTALLIZED_PLAYBOOK_LIST,
  getCatalogEntry,
} from '../src/lib/playbookCatalog.ts';
import {
  formatNullableMetric,
  isValidAstronautId,
  isValidTelemetryPayload,
  normalizeTelemetryPacket,
} from '../src/lib/telemetryValidation.ts';
import { hasValidGlbMagicHeader } from '../src/modules/body-3d-heatmap/glbHeaderGuard.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COCKPIT_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(COCKPIT_ROOT, 'src');
const ANATOMY_DIR = path.join(COCKPIT_ROOT, 'public', 'anatomy');

function walkTsCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsCssFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test('isValidAstronautId accepts BIDMC-SUBJECT-01..53 and rejects out-of-range IDs', () => {
  assert.equal(isValidAstronautId('BIDMC-SUBJECT-01'), true);
  assert.equal(isValidAstronautId('BIDMC-SUBJECT-04'), true);
  assert.equal(isValidAstronautId('BIDMC-SUBJECT-53'), true);
  assert.equal(isValidAstronautId('BIDMC-SUBJECT-00'), false);
  assert.equal(isValidAstronautId('BIDMC-SUBJECT-54'), false);
  assert.equal(isValidAstronautId('CREW-ALPHA'), false);
});

test('telemetryValidation accepts BIDMC-SUBJECT-04..53 packets with vitals_anomaly and 5-120s EWMA cones', () => {
  const payload = {
    schema_version: 1,
    relative_recording_time_s: 42.0,
    timestamp_ms: 1700000042000,
    source_record_id: 'bidmc_04',
    astronaut_id: 'BIDMC-SUBJECT-04',
    alert_severity: 'CRITICAL',
    model_validation_status: 'IllustrativeUnvalidated',
    provenance_manifest: {
      biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
      biometrics_native_rate_hz: 1,
      ui_refresh_rate_hz: 20,
      scenario_overlay_mode: 'NONE_PURE_REPLAY',
    },
    safety_margins: {
      provenance: 'DERIVED_FROM_RECORDED_BIDMC',
      alarm_level: 'CRITICAL',
      med_stl_rho_robustness: 0.12,
      mission_readiness_index: 75,
    },
    biometrics: {
      heart_rate_bpm: 88,
      pulse_rate_bpm: 87,
      spo2_percent: 87.5,
      respiration_rate_brpm: 18,
      hrv_rmssd_ms: null,
      hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
      sqi_score: 0.94,
    },
    timestral_quantiles: {
      forecast_method: 'HYBRID_TIMESTRAL_AND_EWMA_SHORT_HORIZON',
      ewma_short_horizon_max_s: 120,
      short_horizon_cones: [
        {
          channel_name: 'hr_bpm',
          ewma_level: 74.2,
          horizon_5s: { q05: 72.0, q50: 74.2, q95: 76.4 },
          horizon_10s: { q05: 71.0, q50: 74.2, q95: 77.4 },
          horizon_30s: { q05: 69.5, q50: 74.2, q95: 78.9 },
          horizon_60s: null,
          horizon_120s: null,
        },
      ],
      short_horizon_abstention: 'WARMING_UP_60S_120S',
    },
    vitals_anomaly: {
      recording_time_s: 42.0,
      baseline_ready: true,
      baseline_samples: 35,
      baseline_required: 30,
      overall: 'ALARM',
      mahalanobis_d2: 14.8,
      channels: [
        {
          channel: 'spo2_pct',
          status: 'ALARM',
          evaluable: true,
          detector: 'ROBUST_Z_AND_PERSISTENCE',
          value: 87.5,
          baseline_median: 98.0,
          baseline_sigma: 0.7,
          z_score: -15.0,
          duration_s: 12.0,
          reason: 'SpO2 drop > 3 sigma sustained 12 s',
        },
      ],
      injection: {
        kind: 'DESATURATION_FAST',
        description: 'Synthetic acute desaturation ramp',
        onset_s: 30.0,
        elapsed_s: 12.0,
        duration_s: 45.0,
      },
    },
  };

  assert.equal(isValidTelemetryPayload(payload), true);
  const normalized = normalizeTelemetryPacket(payload);
  assert.ok(normalized);
  assert.equal(normalized.astronaut_id, 'BIDMC-SUBJECT-04');
  assert.equal(normalized.biometrics.hrv_rmssd_ms, null);
  assert.equal(normalized.vitals_anomaly?.overall, 'ALARM');
  assert.equal(normalized.vitals_anomaly?.mahalanobis_d2, 14.8);
  assert.equal(normalized.vitals_anomaly?.injection?.kind, 'DESATURATION_FAST');
  assert.equal(normalized.timestral_quantiles?.forecast_method, 'HYBRID_TIMESTRAL_AND_EWMA_SHORT_HORIZON');
  assert.equal(normalized.timestral_quantiles?.short_horizon_cones?.length, 1);
  assert.equal(normalized.timestral_quantiles?.short_horizon_cones?.[0].horizon_5s?.q50, 74.2);
  assert.equal(normalized.timestral_quantiles?.short_horizon_cones?.[0].horizon_120s, null);

  const fmt = formatNullableMetric(normalized.biometrics.hrv_rmssd_ms, 1, {
    channelName: 'hrv_rmssd_ms',
    qualityFlags: ['BEAT_INTERVALS_NOT_AVAILABLE'],
    isRhythmDependent: true,
  });
  assert.equal(fmt.unavailable, true);
  assert.notEqual(fmt.text, '0');
  assert.notEqual(fmt.text, '0.0');
});

test('binaryTelemetryDecoder supports all 1..15 playbooks in BINARY_PLAYBOOK_DEFAULTS', () => {
  for (let code = 1; code <= 15; code++) {
    assert.ok(PLAYBOOK_ID_BY_CODE[code], `missing PLAYBOOK_ID_BY_CODE for ${code}`);
    assert.ok(BINARY_PLAYBOOK_DEFAULTS[code], `missing BINARY_PLAYBOOK_DEFAULTS for ${code}`);
    assert.equal(BINARY_PLAYBOOK_DEFAULTS[code].playbook_id, PLAYBOOK_ID_BY_CODE[code]);
    assert.ok(BINARY_PLAYBOOK_DEFAULTS[code].actions.length > 0, `empty actions for playbook ${code}`);

    const frameBytes = encodeTestBinaryTelemetryFrame({
      active_playbook_id: code,
      active_alert_code: 2,
    });
    const decoded = decodeBinaryTelemetryFrame(frameBytes);
    assert.ok(decoded, `expected binary frame for playbook code ${code} to decode`);
    assert.equal(decoded.active_playbook_id, code);

    const merged = mergeBinaryFrameIntoPacket(
      {
        source_record_id: 'test_node',
        relative_recording_time_s: 1.0,
        timestamp_ms: 1000,
        astronaut_id: 'ASTRO-01',
        system_phase: 'ACT',
        alert_severity: 'WARNING',
        model_validation_status: 'ILLUSTRATIVE_UNVALIDATED',
        provenance_manifest: {
          biometrics_source: 'HARDWARE_WEARABLE',
          biometrics_native_rate_hz: 1.0,
          ui_refresh_rate_hz: 20.0,
          scenario_overlay_mode: 'NONE_PURE_REPLAY',
        },
        biometrics: {
          heart_rate_bpm: 80,
          pulse_rate_bpm: null,
          resp_rate_brpm: 16,
          spo2_pct: 98,
          hrv_rmssd_ms: null,
          sqi_score: 0.95,
          radiation_dose_rate_msv_d: 0.1,
          missing_channels: [],
        },
        safety_margins: {
          provenance: 'DERIVED_FROM_HYBRID_SCENARIO' as const,
          med_stl_rho_robustness: 0.5,
          mission_readiness_index: 85.0,
          alarm_level: 'WARNING' as const,
        },
        active_playbook: null,
      },
      decoded,
    );
    assert.ok(merged.active_playbook);
    assert.equal(merged.active_playbook.playbook_id, PLAYBOOK_ID_BY_CODE[code]);
    assert.equal(merged.active_playbook.title, BINARY_PLAYBOOK_DEFAULTS[code].title);
  }
});

test('binaryTelemetryDecoder transitions seamlessly (09 -> 10 -> 15 -> 09) without action leak', () => {
  let currentPkt = {
    source_record_id: 'test_node',
    relative_recording_time_s: 1.0,
    timestamp_ms: 1000,
    astronaut_id: 'ASTRO-01',
    system_phase: 'ACT' as const,
    alert_severity: 'WARNING' as const,
    model_validation_status: 'ILLUSTRATIVE_UNVALIDATED' as const,
    provenance_manifest: {
      biometrics_source: 'HARDWARE_WEARABLE' as const,
      biometrics_native_rate_hz: 1.0,
      ui_refresh_rate_hz: 20.0,
      scenario_overlay_mode: 'NONE_PURE_REPLAY' as const,
    },
    biometrics: {
      heart_rate_bpm: 80,
      pulse_rate_bpm: null,
      resp_rate_brpm: 16,
      spo2_pct: 98,
      hrv_rmssd_ms: null,
      sqi_score: 0.95,
      radiation_dose_rate_msv_d: 0.1,
      missing_channels: [],
    },
    safety_margins: {
      provenance: 'DERIVED_FROM_HYBRID_SCENARIO' as const,
      med_stl_rho_robustness: 0.5,
      mission_readiness_index: 85.0,
      alarm_level: 'WARNING' as const,
    },
    active_playbook: null,
  };

  // 1. Playbook 09
  let frame = decodeBinaryTelemetryFrame(encodeTestBinaryTelemetryFrame({ active_playbook_id: 9 }));
  assert.ok(frame);
  currentPkt = mergeBinaryFrameIntoPacket(currentPkt, frame);
  assert.equal(currentPkt.active_playbook?.playbook_id, 'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION');
  assert.equal(currentPkt.active_playbook?.actions[0].action_id, 'AIRWAY_BREATHING_CIRCULATION_CHECK');

  // 2. Transition to Playbook 10
  frame = decodeBinaryTelemetryFrame(encodeTestBinaryTelemetryFrame({ active_playbook_id: 10 }));
  assert.ok(frame);
  currentPkt = mergeBinaryFrameIntoPacket(currentPkt, frame);
  assert.equal(currentPkt.active_playbook?.playbook_id, 'PLAYBOOK_10_RENAL_LITHIASIS');
  assert.equal(currentPkt.active_playbook?.title, 'Playbook #10: Renal Lithiasis Hydration, Citrate Buffering & Bladder Protocol');
  assert.equal(currentPkt.active_playbook?.actions[0].action_id, 'ACT_POCUS_RENAL_BLADDER_SCAN');
  // Prove no action leaked from Playbook 09
  assert.equal(currentPkt.active_playbook?.actions.some((a) => a.action_id === 'AIRWAY_BREATHING_CIRCULATION_CHECK'), false);

  // 3. Transition to Playbook 15
  frame = decodeBinaryTelemetryFrame(encodeTestBinaryTelemetryFrame({ active_playbook_id: 15 }));
  assert.ok(frame);
  currentPkt = mergeBinaryFrameIntoPacket(currentPkt, frame);
  assert.equal(currentPkt.active_playbook?.playbook_id, 'PLAYBOOK_15_EFAST_TRAUMA_TRIAGE');
  assert.equal(currentPkt.active_playbook?.actions[0].action_id, 'ACT_RAPID_5_WINDOW_EFAST_SCAN');
  assert.equal(currentPkt.active_playbook?.actions.some((a) => a.action_id === 'ACT_POCUS_RENAL_BLADDER_SCAN'), false);

  // 4. Transition back to 09
  frame = decodeBinaryTelemetryFrame(encodeTestBinaryTelemetryFrame({ active_playbook_id: 9 }));
  assert.ok(frame);
  currentPkt = mergeBinaryFrameIntoPacket(currentPkt, frame);
  assert.equal(currentPkt.active_playbook?.playbook_id, 'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION');
  assert.equal(currentPkt.active_playbook?.actions[0].action_id, 'AIRWAY_BREATHING_CIRCULATION_CHECK');
  assert.equal(currentPkt.active_playbook?.actions.some((a) => a.action_id === 'ACT_RAPID_5_WINDOW_EFAST_SCAN'), false);

  // 5. Code 0 or unknown clears active_playbook
  frame = decodeBinaryTelemetryFrame(encodeTestBinaryTelemetryFrame({ active_playbook_id: 0 }));
  assert.ok(frame);
  currentPkt = mergeBinaryFrameIntoPacket(currentPkt, frame);
  assert.equal(currentPkt.active_playbook, null);

  frame = decodeBinaryTelemetryFrame(encodeTestBinaryTelemetryFrame({ active_playbook_id: 99 }));
  assert.ok(frame);
  currentPkt = mergeBinaryFrameIntoPacket(currentPkt, frame);
  assert.equal(currentPkt.active_playbook, null);
});

test('playbookCatalog preserves 5 Type-1 playbooks, 4 acute vitals playbooks (#06..#09), and 6 exploration playbooks (#10..#15)', () => {
  assert.equal(CRYSTALLIZED_PLAYBOOK_LIST.length, 5);
  assert.equal(ACUTE_VITALS_PLAYBOOK_LIST.length, 4);
  assert.equal(ALL_CRYSTALLIZED_PLAYBOOK_LIST.length, 15);

  for (const code of ['#06', '#07', '#08', '#09', '#10', '#11', '#12', '#13', '#14', '#15'] as const) {
    const entry = getCatalogEntry(code);
    assert.ok(entry, `missing catalog entry for ${code}`);
    assert.equal(entry.short_code, code);
  }
  assert.equal(
    getCatalogEntry('PLAYBOOK_09_MULTIPARAMETER_DETERIORATION')?.short_code,
    '#09',
  );
  assert.equal(
    getCatalogEntry('PLAYBOOK_15_EFAST_TRAUMA_TRIAGE')?.short_code,
    '#15',
  );
});

test('Z-Anatomy 5 GLB assets have valid glTF binary magic header 0x46546c67', () => {
  const expectedFiles = [
    'SkeletalSystem100.glb',
    'MuscularSystem100.glb',
    'CardioVascular41.glb',
    'VisceralSystem100.glb',
    'NervousSystem100.glb',
  ];
  for (const file of expectedFiles) {
    const full = path.join(ANATOMY_DIR, file);
    assert.equal(fs.existsSync(full), true, `missing ${file}`);
    const fd = fs.openSync(full, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    assert.equal(hasValidGlbMagicHeader(head), true, `${file} failed glTF magic check`);
  }
  assert.equal(fs.existsSync(path.join(ANATOMY_DIR, 'ATTRIBUTION.md')), true);
  assert.equal(fs.existsSync(path.join(ANATOMY_DIR, 'LICENSE-CC-BY-SA-4.0.txt')), true);
  assert.equal(fs.existsSync(path.join(ANATOMY_DIR, 'MANIFEST.json')), true);
});

test('Cockpit unification source invariants and zero-emoji check hold across src/', () => {
  assert.equal(
    fs.existsSync(path.join(SRC_ROOT, 'lib', 'validateTelemetry.ts')),
    false,
    'stale validateTelemetry.ts must never exist',
  );

  const indexCss = fs.readFileSync(path.join(SRC_ROOT, 'index.css'), 'utf8');
  assert.match(indexCss, /--color-oled:\s*#000000/);
  assert.match(indexCss, /--color-panel:\s*#0a0a0a/);
  assert.doesNotMatch(indexCss, /#141c2a|#0b111c|#101725|#a6baf1/i);

  const headerTsx = fs.readFileSync(
    path.join(SRC_ROOT, 'modules', 'header-triphase', 'TriPhaseHeader.tsx'),
    'utf8',
  );
  assert.match(headerTsx, /'GATHER',\s*'EVALUATE',\s*'ACT'/);
  assert.match(headerTsx, /aria-current=/);
  assert.match(headerTsx, /animate-pulse/);

  const atlasTsx = fs.readFileSync(
    path.join(SRC_ROOT, 'modules', 'body-3d-heatmap', 'AtlasBody.tsx'),
    'utf8',
  );
  assert.match(atlasTsx, /useGLTF\(URLS,\s*false,\s*true\)/);
  assert.doesNotMatch(atlasTsx, /useGLTF\.preload/);
  assert.doesNotMatch(atlasTsx, /throw new Error/);

  const opticalTs = fs.readFileSync(path.join(SRC_ROOT, 'lib', 'vlmInjuryEngine.ts'), 'utf8');
  const modalTsx = fs.readFileSync(
    path.join(SRC_ROOT, 'modules', 'body-3d-heatmap', 'AiInjuryModal.tsx'),
    'utf8',
  );
  const injuryTs = fs.readFileSync(path.join(SRC_ROOT, 'types', 'injury.ts'), 'utf8');
  for (const text of [opticalTs, modalTsx]) {
    assert.match(text, /OPTICAL_RGB_HEURISTIC_V1/);
    assert.match(text, /ILLUSTRATIVE_UNVALIDATED/);
    assert.match(text, /URL\.revokeObjectURL/);
  }
  for (const text of [opticalTs, modalTsx, injuryTs]) {
    assert.doesNotMatch(text, /ARES-VLM-Edge|CLINICAL DIAGNOSIS|confidencePct/i);
  }

  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const filePath of [...walkTsCssFiles(SRC_ROOT), path.join(__dirname, 'phase36_m2.test.ts')]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(emojiRe.test(content), false, `Unicode emoji found in ${filePath}`);
  }
});
