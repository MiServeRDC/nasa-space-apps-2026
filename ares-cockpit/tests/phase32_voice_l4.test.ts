import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalType1CopilotFallback,
  classifyVoiceTranscript,
  sanitizeSpokenSummary,
} from '../src/lib/voiceIntentRouter.ts';
import type { TelemetryPacket } from '../src/types/telemetry.ts';
import type { WhatIf } from '../src/lib/scenario.ts';

const TEST_WHATIF: WhatIf = {
  sex: 'MALE',
  ppco2_mmhg: 2.5,
  ared_load_pct: 60,
  lbnp_mmhg: 0,
  mission_day: 60,
  artifact_level: 0.1,
};

function makePureBidmcPacketWithoutRr(): TelemetryPacket {
  return {
    timestamp_ms: 1_700_000_000_000,
    relative_recording_time_s: 45,
    source_record_id: 'BIDMC_01',
    mission_elapsed_days: 0,
    astronaut_id: 'ASTRO-01',
    model_validation_status: 'ILLUSTRATIVE_UNVALIDATED',
    provenance_manifest: {
      biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
      biometrics_native_rate_hz: 1,
      ui_refresh_rate_hz: 20,
      scenario_overlay_mode: 'NONE_PURE_REPLAY',
      dataset_provenance: 'PHYSIONET_BIDMC_V1_0_0',
      manifest_sha256_verified: true,
    },
    biometrics: {
      heart_rate_bpm: 74,
      pulse_rate_bpm: 74,
      respiration_rate_brpm: 16,
      spo2_percent: 98.5,
      rr_interval_ms: null,
      hrv_rmssd_ms: null,
      hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
      core_temp_celsius: null,
      sqi_score: 0.94,
      missing_channels: ['rr_interval_ms', 'hrv_rmssd_ms'],
      quality_flags: ['BEAT_INTERVALS_NOT_AVAILABLE'],
    },
    hemodynamics: null,
    musculoskeletal: null,
    environment: null,
    safety_margins: {
      provenance: 'DERIVED_FROM_RECORDED_BIDMC',
      med_stl_rho_robustness: null,
      time_to_violation_days: null,
      mission_readiness_index: null,
      alarm_level: 'ADVISORY',
    },
    active_playbook: {
      playbook_id: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
      safety_gates: {
        anticoagulant_lock_active: true,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active: false,
      },
    },
    quality_flags: ['BEAT_INTERVALS_NOT_AVAILABLE'],
    is_local_simulation: false,
  };
}

describe('Phase 32 L4: voiceIntentRouter deterministic Type-1 routing', () => {
  it('routes canonical microgravity commands deterministically with optional ARES wake word', () => {
    const pb = classifyVoiceTranscript('ARES, open playbook 4');
    assert.equal(pb.kind, 'OPEN_PLAYBOOK');
    if (pb.kind === 'OPEN_PLAYBOOK') {
      assert.equal(pb.playbook_code, '#04');
      assert.equal(pb.playbook_id, 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION');
    }

    assert.deepEqual(classifyVoiceTranscript('go to gather'), {
      kind: 'NAVIGATE_PHASE',
      phase: 'GATHER',
      label: 'Switching to GATHER phase',
    });
    assert.deepEqual(classifyVoiceTranscript('go to evaluate'), {
      kind: 'NAVIGATE_PHASE',
      phase: 'EVALUATE',
      label: 'Switching to EVALUATE phase',
    });
    assert.deepEqual(classifyVoiceTranscript('go to act'), {
      kind: 'NAVIGATE_PHASE',
      phase: 'ACT',
      label: 'Switching to ACT phase',
    });

    const pocus = classifyVoiceTranscript('open pocus');
    assert.equal(pocus.kind, 'NAVIGATE_EVAL_TAB');
    if (pocus.kind === 'NAVIGATE_EVAL_TAB') assert.equal(pocus.tab, 'POCUS');

    const cones = classifyVoiceTranscript('show quantile cones');
    assert.equal(cones.kind, 'SHOW_QUANTILE_CONES');

    const lbnp = classifyVoiceTranscript('run what-if lbnp 30');
    assert.equal(lbnp.kind, 'RUN_WHAT_IF_LBNP');
    if (lbnp.kind === 'RUN_WHAT_IF_LBNP') assert.equal(lbnp.lbnp_mmhg, -30);

    const palette = classifyVoiceTranscript('open copilot');
    assert.equal(palette.kind, 'OPEN_COMMAND_PALETTE');
    if (palette.kind === 'OPEN_COMMAND_PALETTE') assert.equal(palette.initial_tab, 'COPILOT');
  });

  it('enforces NASA-STD-3001 [V2 10027] SAFETY_INTERLOCK_BLOCKED on vocal Gate 1 / POCUS mutations', () => {
    const blockedPhrases = [
      'ARES confirm thrombus in right IJV',
      'set pocus_thrombus_confirmed true',
      'unlock gate 1 and start enoxaparin',
      'administer heparin now',
      'bypass gate 1 anticoagulant lock',
      'declare clot confirmed',
    ];

    for (const phrase of blockedPhrases) {
      const res = classifyVoiceTranscript(phrase);
      assert.equal(
        res.kind,
        'SAFETY_INTERLOCK_BLOCKED',
        `Expected SAFETY_INTERLOCK_BLOCKED for "${phrase}", got ${res.kind}`,
      );
      if (res.kind === 'SAFETY_INTERLOCK_BLOCKED') {
        assert.equal(res.clause, 'NASA-STD-3001 [V2 10027]');
      }
    }

    // Read-only clinical inquiries remain allowed and escalate to Copilot
    const ask = classifyVoiceTranscript('What is the current status of Gate 1?');
    assert.equal(ask.kind, 'CONVERSATIONAL_COPILOT_ASK');
    if (ask.kind === 'CONVERSATIONAL_COPILOT_ASK') {
      assert.equal(ask.preferred_tool_hint, 'get_medops_playbook');
    }
  });
});

describe('Phase 32 L4: non-fabricated RMSSD & <=25w spoken summary invariants', () => {
  it('preserves BEAT_INTERVALS_NOT_AVAILABLE, ILLUSTRATIVE_UNVALIDATED, and <=25 words spoken summary', () => {
    const pkt = makePureBidmcPacketWithoutRr();
    const fallback = buildLocalType1CopilotFallback(
      'Explain my HRV RMSSD and active playbook',
      pkt,
      TEST_WHATIF,
      'get_crew_health_summary',
    );

    assert.equal(fallback.execution_mode, 'DETERMINISTIC_TYPE1_FALLBACK');
    assert.equal(fallback.hrv_unavailable_reason, 'BEAT_INTERVALS_NOT_AVAILABLE');
    assert.equal(fallback.model_validation_status, 'ILLUSTRATIVE_UNVALIDATED');
    assert.equal(fallback.validation_disclosure, 'ILLUSTRATIVE_UNVALIDATED');
    assert.ok(fallback.answer_markdown.includes('BEAT_INTERVALS_NOT_AVAILABLE'));
    assert.equal(/\d+(\.\d+)?\s*ms/i.test(fallback.answer_markdown), false);
    assert.equal(/95%\s*CI/i.test(fallback.answer_markdown), false);
    assert.equal(/calibrated\s+probability/i.test(fallback.answer_markdown), false);

    const words = fallback.spoken_summary.trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 25, `Expected <= 25 words, got ${words.length}`);

    const capped = sanitizeSpokenSummary(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven',
      25,
    );
    assert.equal(capped.split(/\s+/).filter(Boolean).length, 25);
  });
});
