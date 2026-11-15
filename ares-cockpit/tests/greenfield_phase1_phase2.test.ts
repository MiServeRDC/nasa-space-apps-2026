import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ASSERTIVE_NODE_ID,
  emitHysteresisAnnouncement,
  POLITE_NODE_ID,
  resetA11yAnnouncerState,
} from '../src/stores/a11yAnnouncer.ts';
import {
  DEFAULT_MAGNETIC_EVENT_MARKERS,
  NASA_PITCH_HARD_CAP_SECONDS,
  useStudioTimelineStore,
} from '../src/stores/studioTimelineStore.ts';
import {
  ringValueToNullable,
  TelemetryRingBuffer,
} from '../src/stores/telemetryRingBuffer.ts';
import { useWorkbenchStore } from '../src/stores/workbenchStore.ts';
import {
  buildPrivacyGovernedTelemetryView,
  PRIVACY_NORMATIVE_CLAUSE,
  pseudonymizeCrewIdentifier,
  redactAuditRecordForRole,
  REDACTED_PRIVACY_MARKER,
  redactFieldByRole,
} from '../src/lib/privacyRedaction.ts';
import {
  dispatchWorkbenchKeyDown,
  DRAWER_HOST_LAYER_ID,
  isEditableElement,
  isSliderOrDraggingActive,
  MAIN_WORKBENCH_SCAFFOLD_ID,
  syncBackgroundInertState,
} from '../src/drawers/useKeyboardOrchestrator.ts';
import type { TelemetryFrame } from '../src/types/telemetry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COCKPIT_ROOT = path.resolve(__dirname, '..');

function makeTelemetryFrame(overrides: Partial<TelemetryFrame> = {}): TelemetryFrame {
  return {
    timestamp_ms: 1_700_000_010_000,
    relative_recording_time_s: 10.0,
    source_record_id: 'bidmc_01',
    mission_elapsed_days: 42,
    astronaut_id: 'BIDMC-SUBJECT-01',
    model_validation_status: 'ILLUSTRATIVE_UNVALIDATED',
    provenance_manifest: {
      biometrics_source: 'RECORDED_TERRESTRIAL_BIDMC_CSV',
      biometrics_native_rate_hz: 1,
      ui_refresh_rate_hz: 20,
      scenario_overlay_mode: 'NONE_PURE_REPLAY',
      manifest_sha256_verified: true,
    },
    biometrics: {
      heart_rate_bpm: 72,
      pulse_rate_bpm: null,
      respiration_rate_brpm: 15,
      spo2_percent: null,
      hrv_rmssd_ms: 38,
      hrv_unavailable_reason: 'BEAT_INTERVALS_NOT_AVAILABLE',
      sqi_score: 0.94,
      quality_flags: ['BEAT_INTERVALS_NOT_AVAILABLE'],
    },
    hemodynamics: {
      provenance: 'DERIVED_COMPUTED',
      ijv_csa_cm2: 1.85,
      ijv_velocity_max_cm_s: 6.2,
      wall_shear_stress_dyn_cm2: 0.57,
      pocus_thrombus_confirmed: false,
      thrombosis_risk_score: 0.42,
      onsd_mm: 5.9,
    },
    musculoskeletal: {
      provenance: 'DERIVED_COMPUTED',
      soleus_thickness_mm: 13.4,
      pennation_angle_deg: 18.2,
      bone_resorption_rate_pct: 1.2,
      mechanotransductive_index: 0.65,
      sclerostin_pmol_l: 31.5,
    },
    environment: {
      provenance: 'SIMULATED_SCENARIO_INPUT',
      cabin_co2_ppm: 2800,
      cabin_o2_kpa: 21.2,
      ambient_radiation_rate_ugy_h: 18.0,
      cumulative_radiation_mgy: 14.2,
    },
    safety_margins: {
      provenance: 'DERIVED_FROM_RECORDED_BIDMC',
      med_stl_rho_robustness: 0.24,
      mission_readiness_index: 81,
      alarm_level: 'ADVISORY',
    },
    quality_flags: ['BEAT_INTERVALS_NOT_AVAILABLE'],
    ...overrides,
  };
}

describe('Greenfield Phase 1: Air-Gapped Assets, Fonts, Pre-Hydration Shell & CSS Tokens', () => {
  it('bundles local Draco WASM/JS decoders and valid WOFF2 variable fonts on disk', () => {
    const wasmPath = path.join(COCKPIT_ROOT, 'public', 'draco', 'draco_decoder.wasm');
    const wrapperPath = path.join(COCKPIT_ROOT, 'public', 'draco', 'draco_wasm_wrapper.js');
    const fallbackJsPath = path.join(COCKPIT_ROOT, 'public', 'draco', 'draco_decoder.js');

    assert.equal(fs.existsSync(wasmPath), true);
    assert.equal(fs.existsSync(wrapperPath), true);
    assert.equal(fs.existsSync(fallbackJsPath), true);

    const wasmMagic = fs.readFileSync(wasmPath).subarray(0, 4);
    assert.deepEqual([...wasmMagic], [0x00, 0x61, 0x73, 0x6d], 'draco_decoder.wasm must have \\0asm magic');

    for (const fontFile of ['Geist-Variable.woff2', 'GeistMono-Variable.woff2']) {
      const fontPath = path.join(COCKPIT_ROOT, 'public', 'fonts', fontFile);
      assert.equal(fs.existsSync(fontPath), true, `missing ${fontFile}`);
      const buf = fs.readFileSync(fontPath);
      assert.ok(buf.byteLength > 20_000, `${fontFile} unexpectedly small`);
      assert.equal(buf.subarray(0, 4).toString('ascii'), 'wOF2', `${fontFile} must be valid WOFF2`);
    }
  });

  it('configures a local-only CSP and mounts the cockpit from its local entry point', () => {
    const html = fs.readFileSync(path.join(COCKPIT_ROOT, 'index.html'), 'utf8');
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /default-src 'self'/);
    assert.match(html, /'wasm-unsafe-eval'/);
    assert.match(html, /id="root"/);
    assert.ok(html.includes('src="/src/main.tsx"'));
  });

  it('defines the cockpit theme with visible focus and reduced motion', () => {
    const css = fs.readFileSync(path.join(COCKPIT_ROOT, 'src', 'index.css'), 'utf8');
    assert.ok(css.includes('@import "tailwindcss";'));
    assert.ok(css.includes('--color-panel: #111615'));
    assert.ok(css.includes(':focus-visible'));
    assert.ok(css.includes('prefers-reduced-motion: reduce'));
  });
});

describe('Greenfield Phase 2: TelemetryRingBuffer (Zero-GC, Issue #11 NaN Sentinels, O(log N) Scrub)', () => {
  it('preserves NaN sentinels for missing channels and BEAT_INTERVALS_NOT_AVAILABLE without coercing to 0', () => {
    const ring = new TelemetryRingBuffer(8);
    const frame = makeTelemetryFrame();
    const slot = ring.pushTelemetryFrame(frame);
    assert.equal(slot, 0);

    const view = ring.readSampleAtIndex(slot);
    assert.ok(view);
    assert.equal(view.hrBpm, 72);
    assert.equal(Number.isNaN(view.pulseBpm), true);
    assert.equal(Number.isNaN(view.spo2Pct), true);
    assert.equal(Number.isNaN(view.rmssdMs), true, 'RMSSD must be NaN when BEAT_INTERVALS_NOT_AVAILABLE');
    assert.equal(ringValueToNullable(view.pulseBpm), null);
    assert.equal(ringValueToNullable(view.rmssdMs), null);
  });

  it('wraps circularly without heap growth and performs O(log N) interpolation while respecting NaN pen-lifts', () => {
    const ring = new TelemetryRingBuffer(4);
    ring.pushSample({ timestampS: 1.0, hrBpm: 60, spo2Pct: 98 });
    ring.pushSample({ timestampS: 2.0, hrBpm: 70, spo2Pct: 97 });
    ring.pushSample({ timestampS: 3.0, hrBpm: 80, spo2Pct: null }); // dropout at t=3.0
    ring.pushSample({ timestampS: 4.0, hrBpm: 90, spo2Pct: 96 });
    ring.pushSample({ timestampS: 5.0, hrBpm: 100, spo2Pct: 95 }); // overwrites t=1.0

    assert.equal(ring.length, 4);
    assert.equal(ring.oldestTimestampS(), 2.0);
    assert.equal(ring.latestTimestampS(), 5.0);

    // Midpoint between t=2.0 (70) and t=3.0 (80): hr interpolates to 75, spo2 stays NaN due to t=3.0 dropout
    const midDropout = ring.sampleAtTime(2.5, { interpolate: true });
    assert.ok(midDropout);
    assert.ok(Math.abs(midDropout.hrBpm - 75) < 1e-4);
    assert.equal(Number.isNaN(midDropout.spo2Pct), true);

    // Midpoint between t=4.0 (90, 96) and t=5.0 (100, 95): both channels finite
    const midValid = ring.sampleAtTime(4.5, { interpolate: true });
    assert.ok(midValid);
    assert.ok(Math.abs(midValid.hrBpm - 95) < 1e-4);
    assert.ok(Math.abs(midValid.spo2Pct - 95.5) < 1e-4);

    // Replay loop rewind (> 0.5s backward) resets ring cleanly to maintain binary search monotonicity
    ring.pushSample({ timestampS: 0.0, hrBpm: 68, spo2Pct: 99 });
    assert.equal(ring.length, 1);
    assert.equal(ring.latestTimestampS(), 0.0);
  });
});

describe('Greenfield Phase 2: a11yAnnouncer (Risk 5 3000ms Hysteresis + 5000ms Dedup + Reflow)', () => {
  it('enforces 3.0s polite spacing, 5.0s dedup, 0ms assertive bypass, and forced offsetHeight reflow', () => {
    resetA11yAnnouncerState();

    const log: string[] = [];
    const makeMockNode = (label: string) => {
      let text: string | null = '';
      return {
        get textContent() {
          return text;
        },
        set textContent(v: string | null) {
          text = v;
          log.push(`${label}:set:${v}`);
        },
        get offsetHeight() {
          log.push(`${label}:reflow`);
          return 1;
        },
      };
    };

    const politeNode = makeMockNode('polite');
    const assertiveNode = makeMockNode('assertive');
    const mockDoc = {
      getElementById: (id: string) => {
        if (id === POLITE_NODE_ID) return politeNode;
        if (id === ASSERTIVE_NODE_ID) return assertiveNode;
        return null;
      },
    };

    // 1. Initial polite message at t=100ms succeeds and forces reflow
    const r1 = emitHysteresisAnnouncement('Switched to EVALUATE phase', {
      nowMs: 100,
      doc: mockDoc,
    });
    assert.equal(r1.announced, true);
    assert.equal(r1.domUpdated, true);
    assert.deepEqual(log, [
      'polite:set:',
      'polite:reflow',
      'polite:set:Switched to EVALUATE phase',
    ]);

    // 2. Different polite message within <3000ms is suppressed by hysteresis
    const r2 = emitHysteresisAnnouncement('What-If simulation active', {
      nowMs: 1800,
      doc: mockDoc,
    });
    assert.equal(r2.announced, false);
    assert.equal(r2.suppressedReason, 'HYSTERESIS_3000MS');

    // 3. Same message at t=4000ms (>3000ms but <5000ms) is suppressed by 5000ms dedup
    const r3 = emitHysteresisAnnouncement('Switched to EVALUATE phase', {
      nowMs: 4000,
      doc: mockDoc,
    });
    assert.equal(r3.announced, false);
    assert.equal(r3.suppressedReason, 'DEDUP_5000MS');

    // 4. Critical assertive alert at t=4050ms bypasses polite window immediately (0ms delay)
    const r4 = emitHysteresisAnnouncement('CRITICAL: Gate 2 LBNP auto-vent triggered', {
      isAssertive: true,
      nowMs: 4050,
      doc: mockDoc,
    });
    assert.equal(r4.announced, true);
    assert.equal(r4.nodeId, ASSERTIVE_NODE_ID);
    assert.equal(assertiveNode.textContent, 'CRITICAL: Gate 2 LBNP auto-vent triggered');

    // 5. Safe no-op in headless Node when global document is undefined
    const headless = emitHysteresisAnnouncement('Phase ACT active', { nowMs: 9500 });
    assert.equal(headless.announced, true);
    assert.equal(headless.domUpdated, false);
  });
});

describe('Greenfield Phase 2: NASA-STD-3001 Vol. 1 Ch. 7 Role-Based Privacy Redaction', () => {
  it('redacts restricted fields across all 4 roles while preserving numeric contracts and SHA-256 hashes', () => {
    const frame = makeTelemetryFrame();

    const selfView = buildPrivacyGovernedTelemetryView(frame, 'CREW_SELF');
    assert.equal(selfView.displayAstronautId.redacted, false);
    assert.equal(selfView.displayBehavioralVocalSummary.redacted, false);
    assert.equal(selfView.displayPersonalMedicalNotes.redacted, false);

    const cmoView = buildPrivacyGovernedTelemetryView(frame, 'CMO');
    assert.equal(cmoView.displayAstronautId.redacted, false);
    assert.equal(cmoView.displayBehavioralVocalSummary.redacted, true);
    assert.equal(cmoView.displayBehavioralVocalSummary.valueText, REDACTED_PRIVACY_MARKER);

    const surgeonView = buildPrivacyGovernedTelemetryView(frame, 'FLIGHT_SURGEON');
    assert.equal(surgeonView.displayAstronautId.redacted, false);
    assert.equal(surgeonView.displayPersonalMedicalNotes.redacted, false);
    assert.equal(surgeonView.displayBehavioralVocalSummary.redacted, true);

    const researchView = buildPrivacyGovernedTelemetryView(frame, 'GROUND_RESEARCH');
    assert.equal(researchView.normativeClause, PRIVACY_NORMATIVE_CLAUSE);
    assert.equal(researchView.displayAstronautId.pseudonymized, true);
    assert.equal(
      researchView.displayAstronautId.valueText,
      pseudonymizeCrewIdentifier('BIDMC-SUBJECT-01'),
    );
    assert.equal(researchView.numericPacket.biometrics.heart_rate_bpm, 72);
    assert.equal(researchView.numericPacket.biometrics.pulse_rate_bpm, null);

    const auditRecord = {
      sequence_index: 3,
      timestamp_utc: '2026-11-14T15:20:18Z',
      actor_role: 'CREW_MEDICAL_OFFICER',
      event_action: 'POCUS SCAN LOGGED: Internal Jugular Vein CSA = 1.15 cm2.',
      prev_hash_hex: 'a'.repeat(64),
      current_hash_hex: 'b'.repeat(64),
    };
    const redactedAudit = redactAuditRecordForRole(auditRecord, 'GROUND_RESEARCH');
    assert.equal(redactedAudit.is_redacted, true);
    assert.equal(redactedAudit.display_event_action, REDACTED_PRIVACY_MARKER);
    assert.equal(redactedAudit.prev_hash_hex, 'a'.repeat(64));
    assert.equal(redactedAudit.current_hash_hex, 'b'.repeat(64));

    // Acute Safety Gate events remain visible across all roles for operational non-repudiation
    const gateEnv = redactFieldByRole(
      'GROUND_RESEARCH',
      'ACUTE_SAFETY_GATE_EVENT',
      'SAFETY GATE 1 ENGAGED',
    );
    assert.equal(gateEnv.redacted, false);
  });
});

describe('Greenfield Phase 2: Zustand Stores & Capture-Phase Keyboard Orchestrator', () => {
  it('enforces <= 29.8s NASA pitch hard cap, magnetic snap, and playback stop in studioTimelineStore', () => {
    const store = useStudioTimelineStore;
    store.getState().resetStudio();

    assert.equal(store.getState().durationS, NASA_PITCH_HARD_CAP_SECONDS);
    assert.equal(NASA_PITCH_HARD_CAP_SECONDS, 29.8);

    // Clamps any out-of-range seek strictly to <= 29.8s
    const clamped = store.getState().setTime(42.5);
    assert.equal(clamped, 29.8);
    assert.equal(store.getState().t, 29.8);

    // Magnetic snapping pulls 10.25s onto KF_03_IJV_STASIS (10.4s)
    const snapped = store.getState().setTime(10.25, { snapToMarkers: true });
    assert.equal(snapped, DEFAULT_MAGNETIC_EVENT_MARKERS[2].timeS);
    assert.equal(store.getState().activeMarkerId, 'KF_03_IJV_STASIS');

    // Playback advances by deltaSec * speed and halts cleanly at 29.8s
    store.getState().setTime(28.0);
    store.getState().setSpeed(2);
    store.getState().play();
    const afterTick = store.getState().advanceTick(1.5); // 28 + 3.0 -> clamped to 29.8, paused
    assert.equal(afterTick, 29.8);
    assert.equal(store.getState().isPlaying, false);
  });

  it('routes hotkeys, guards inputs/sliders, unwinds Escape deterministically, and toggles inert', () => {
    const wb = useWorkbenchStore;
    wb.getState().resetWorkbench();

    let prevented = 0;
    const makeKey = (key: string, extra: Record<string, unknown> = {}) => ({
      key,
      preventDefault: () => {
        prevented += 1;
      },
      ...extra,
    });

    // Editable input guard blocks single-key 'E'
    const textInput = { tagName: 'INPUT', type: 'text' };
    assert.equal(isEditableElement(textInput), true);
    const blockedEdit = dispatchWorkbenchKeyDown(
      makeKey('e', { target: textInput }),
      wb.getState(),
    );
    assert.equal(blockedEdit.handled, false);
    assert.equal(wb.getState().phase, 'GATHER');

    // Slider / scrubbing guard blocks single-key 'A'
    const rangeSlider = { tagName: 'INPUT', type: 'range' };
    assert.equal(isEditableElement(rangeSlider), false);
    assert.equal(isSliderOrDraggingActive(rangeSlider), true);
    const blockedSlider = dispatchWorkbenchKeyDown(
      makeKey('a', { target: rangeSlider }),
      wb.getState(),
    );
    assert.equal(blockedSlider.handled, false);

    // Valid domain hotkeys: E -> EVALUATE, 2 -> InternalJugularVein, F -> FEMALE, W -> What-If, L -> Audit Drawer
    dispatchWorkbenchKeyDown(makeKey('e'), wb.getState());
    assert.equal(wb.getState().phase, 'EVALUATE');

    dispatchWorkbenchKeyDown(makeKey('2'), wb.getState());
    assert.equal(wb.getState().selectedUberonRegion, 'InternalJugularVein');

    dispatchWorkbenchKeyDown(makeKey('f'), wb.getState());
    assert.equal(wb.getState().twinSex, 'FEMALE');

    dispatchWorkbenchKeyDown(makeKey('w'), wb.getState());
    assert.equal(wb.getState().pinnedCard, 'WHAT_IF_COUNTERFACTUAL');

    // Deep-link breadcrumb + Drawer + Command Palette + Voice Block Toast -> unwind one layer per Escape
    wb.getState().jumpToDiagnosticVerify('POCUS_IJV', 'InternalJugularVein', {
      playbookId: 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS',
      shortCode: '#02',
      activeStepIndex: 1,
      scrollOffsetPx: 140,
      focusedElementId: 'verify-pocus-btn',
      originPhase: 'ACT',
      createdAtMs: 1000,
    });
    dispatchWorkbenchKeyDown(makeKey('l'), wb.getState());
    assert.equal(wb.getState().drawer, 'AUDIT_PROVENANCE');

    dispatchWorkbenchKeyDown(makeKey('k', { metaKey: true }), wb.getState());
    assert.equal(wb.getState().commandPaletteOpen, true);

    wb.getState().triggerVoiceSafetyBlock('NASA-STD-3001 [V2 10027]', 'Tactile POCUS required');
    assert.equal(wb.getState().voiceSafetyBlockToast?.active, true);

    // Verify background inert sync when modal + drawer are open
    const attrs = new Map<string, Record<string, string>>();
    const makeScaffoldEl = (id: string) => {
      attrs.set(id, {});
      return {
        inert: false,
        setAttribute: (k: string, v: string) => {
          attrs.get(id)![k] = v;
        },
        removeAttribute: (k: string) => {
          delete attrs.get(id)![k];
        },
      };
    };
    const mainEl = makeScaffoldEl(MAIN_WORKBENCH_SCAFFOLD_ID);
    const drawerEl = makeScaffoldEl(DRAWER_HOST_LAYER_ID);
    const scaffoldDoc = {
      getElementById: (id: string) =>
        id === MAIN_WORKBENCH_SCAFFOLD_ID
          ? mainEl
          : id === DRAWER_HOST_LAYER_ID
            ? drawerEl
            : null,
    };

    syncBackgroundInertState(scaffoldDoc, { hasModalOverlay: true, hasDrawerOpen: true });
    assert.equal(mainEl.inert, true);
    assert.equal(drawerEl.inert, true);

    syncBackgroundInertState(scaffoldDoc, { hasModalOverlay: false, hasDrawerOpen: true });
    assert.equal(mainEl.inert, true);
    assert.equal(drawerEl.inert, false);

    // Unwind Escape 1: Voice Toast -> 2: Command Palette -> 3: Audit Drawer -> 4: Return Breadcrumb -> 5: UBERON
    const u1 = dispatchWorkbenchKeyDown(makeKey('Escape'), wb.getState());
    assert.equal(u1.unwoundLayer, 'VOICE_TOAST');

    const u2 = dispatchWorkbenchKeyDown(makeKey('Escape'), wb.getState());
    assert.equal(u2.unwoundLayer, 'COMMAND_PALETTE');

    const u3 = dispatchWorkbenchKeyDown(makeKey('Escape'), wb.getState());
    assert.equal(u3.unwoundLayer, 'DRAWER');
    assert.equal(wb.getState().drawer, null);

    const u4 = dispatchWorkbenchKeyDown(makeKey('Escape'), wb.getState());
    assert.equal(u4.unwoundLayer, 'RETURN_BREADCRUMB');
    assert.equal(wb.getState().phase, 'ACT');
    assert.equal(wb.getState().pinnedCard, 'PLAYBOOK_DAG');

    const u5 = dispatchWorkbenchKeyDown(makeKey('Escape'), wb.getState());
    assert.equal(u5.unwoundLayer, 'UBERON_SELECTION');
    assert.equal(wb.getState().selectedUberonRegion, null);
    assert.ok(prevented >= 8);
  });
});
