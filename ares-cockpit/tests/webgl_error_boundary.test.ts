import assert from 'node:assert/strict';
import test from 'node:test';

import { WebGlErrorBoundary } from '../src/modules/body-3d-heatmap/webglErrorBoundary.ts';
import {
  CRYSTALLIZED_PLAYBOOK_CATALOG,
  enforceHardSafetyGatesOnActions,
} from '../src/lib/playbookCatalog.ts';
import type { SafetyGatesState } from '../src/types/telemetry.ts';

test('WebGlErrorBoundary: getDerivedStateFromError catches error message and flags error state', () => {
  const err = new Error('GPU Shader Compilation Failure: MAX_FRAGMENT_UNIFORM_VECTORS');
  const derived = WebGlErrorBoundary.getDerivedStateFromError(err);
  assert.equal(derived.hasError, true);
  assert.equal(derived.errorMsg, 'GPU Shader Compilation Failure: MAX_FRAGMENT_UNIFORM_VECTORS');

  // When error has no message, fallback to default message
  const emptyErr = new Error('');
  const derivedEmpty = WebGlErrorBoundary.getDerivedStateFromError(emptyErr);
  assert.equal(derivedEmpty.hasError, true);
  assert.equal(derivedEmpty.errorMsg, 'WebGL pipeline fault');
});

test('WebGlErrorBoundary: renders fallback function output when hasError is true', () => {
  const boundary = new WebGlErrorBoundary({
    fallback: (msg: string) => `Fallback active: ${msg}`,
    children: 'Normal 3D Canvas Content',
  });

  // Nominal state
  assert.equal(boundary.render(), 'Normal 3D Canvas Content');

  // Error state
  boundary.state = { hasError: true, errorMsg: 'GPU Context Lost' };
  assert.equal(boundary.render(), 'Fallback active: GPU Context Lost');
});

test('P0 Gate 1: Thrombocytopenia (< 75 k/uL) contraindicates anticoagulation even with confirmed thrombus', () => {
  const pb02Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS.default_actions;
  const gates: SafetyGatesState = {
    anticoagulant_lock_active: false, // POCUS was confirmed
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
  };

  const filtered = enforceHardSafetyGatesOnActions(pb02Actions, gates, {
    plateletCountKUl: 62.0, // thrombocytopenia
  });

  // Anticoagulant (Enoxaparin) must be stripped
  assert.equal(
    filtered.some((a) => a.action_id.includes('ANTICOAG_ENOXAPARIN')),
    false,
    'Enoxaparin must be stripped when platelets < 75 k/uL'
  );

  // Warning action must be prepended
  assert.equal(
    filtered[0].action_id,
    'ACT_ANTICOAG_CONTRAINDICATED_THROMBOCYTOPENIA_RISK',
    'Must prepend ACT_ANTICOAG_CONTRAINDICATED_THROMBOCYTOPENIA_RISK'
  );
  assert.equal(
    filtered[0].category,
    'CLINICAL_SAFETY_GATE_OVERRIDE'
  );
});

test('P0 Gate 2: Pulse pressure narrowing (< 25 mmHg) during active LBNP triggers auto-vent', () => {
  const pbActions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP.default_actions;
  const gates: SafetyGatesState = {
    anticoagulant_lock_active: true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
  };

  // SBP 110, DBP 90 -> PP = 20 (< 25 mmHg threshold)
  // SBP drop 10 mmHg (< 15 mmHg threshold), HR 95 bpm (< 115 bpm ceiling)
  const filtered = enforceHardSafetyGatesOnActions(pbActions, gates, {
    lbnpActive: true,
    sbpDropMmhg: 10.0,
    hrBpm: 95.0,
    sbpMmhg: 110.0,
    dbpMmhg: 90.0,
  });

  assert.equal(
    filtered[0].action_id,
    'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG',
    'Must prepend ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG'
  );
  assert.ok(
    filtered[0].label.includes('Pulse Pressure Narrowing'),
    'Label must indicate pulse pressure narrowing'
  );
});

test('P0 Gate 2: Vital telemetry blackout during active LBNP triggers fail-safe auto-vent', () => {
  const pbActions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP.default_actions;
  const gates: SafetyGatesState = {
    anticoagulant_lock_active: true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
  };

  const filtered = enforceHardSafetyGatesOnActions(pbActions, gates, {
    lbnpActive: true,
    sensorLoss: true,
  });

  assert.equal(
    filtered[0].action_id,
    'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG',
    'Must prepend ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG on sensor blackout'
  );
  assert.ok(
    filtered[0].label.includes('Sensor Dropout Fail-Safe'),
    'Label must indicate Sensor Dropout Fail-Safe'
  );
});
