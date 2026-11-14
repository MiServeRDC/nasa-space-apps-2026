import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRYSTALLIZED_PLAYBOOK_CATALOG,
  enforceHardSafetyGatesOnActions,
  isAnticoagulantAction,
} from '../src/lib/playbookCatalog.ts';
import type { CountermeasureAction, SafetyGatesState } from '../src/types/telemetry.ts';

test('Gate 1: isAnticoagulantAction specifically targets anticoagulants and preserves unlocked pharmacotherapy', () => {
  // Playbook #02: Anticoagulant should match
  const pb02Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS.default_actions;
  const enoxaparin = pb02Actions.find((a) => a.action_id.includes('ANTICOAG'));
  assert.ok(enoxaparin, 'Enoxaparin action must exist in Playbook #02');
  assert.equal(isAnticoagulantAction(enoxaparin), true);

  // Playbook #10: Potassium Citrate must NOT be treated as anticoagulant
  const pb10Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_10_RENAL_LITHIASIS.default_actions;
  const kCitrate = pb10Actions.find((a) => a.action_id.includes('POTASSIUM_CITRATE'));
  assert.ok(kCitrate, 'Potassium Citrate action must exist in Playbook #10');
  assert.equal(isAnticoagulantAction(kCitrate), false);

  // Playbook #13: Valacyclovir must NOT be treated as anticoagulant
  const pb13Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR.default_actions;
  const valacyclovir = pb13Actions.find((a) => a.action_id.includes('VALACYCLOVIR'));
  assert.ok(valacyclovir, 'Valacyclovir action must exist in Playbook #13');
  assert.equal(isAnticoagulantAction(valacyclovir), false);

  // Generic action with PHARMACOLOGICAL_ANTICOAGULANT category
  const customAnticoag: CountermeasureAction = {
    action_id: 'ACT_HEPARIN_DRIP',
    label: 'Heparin Infusion',
    category: 'PHARMACOLOGICAL_ANTICOAGULANT',
    delta_rho_per_hour: 0.15,
  };
  assert.equal(isAnticoagulantAction(customAnticoag), true);
});

test('Gate 1 & Gate 4: enforceHardSafetyGatesOnActions enforces strict clinical rules without stripping non-anticoagulants', () => {
  const lockedGates: SafetyGatesState = {
    anticoagulant_lock_active: true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
    gate4_invasive_decompression_locked: true,
    gate4_eva_fitness_no_go: false,
  };

  // Test Playbook #10 (Renal): Potassium Citrate remains active when Gate 1 is locked
  const pb10Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_10_RENAL_LITHIASIS.default_actions;
  const filteredPb10 = enforceHardSafetyGatesOnActions(pb10Actions, lockedGates);
  assert.ok(
    filteredPb10.some((a) => a.action_id.includes('POTASSIUM_CITRATE')),
    'Potassium Citrate must remain unlocked under Gate 1 lock',
  );

  // Test Playbook #13 (Viral): Valacyclovir remains active when Gate 1 is locked
  const pb13Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR.default_actions;
  const filteredPb13 = enforceHardSafetyGatesOnActions(pb13Actions, lockedGates);
  assert.ok(
    filteredPb13.some((a) => a.action_id.includes('VALACYCLOVIR')),
    'Valacyclovir must remain unlocked under Gate 1 lock',
  );

  // Test Playbook #02: Enoxaparin is stripped when Gate 1 is locked
  const pb02Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS.default_actions;
  const filteredPb02 = enforceHardSafetyGatesOnActions(pb02Actions, lockedGates);
  assert.equal(
    filteredPb02.some((a) => a.action_id.includes('ANTICOAG')),
    false,
    'Anticoagulants must be stripped when Gate 1 is locked',
  );

  // When Gate 1 is unlocked (POCUS confirmed), Enoxaparin is preserved
  const unlockedGates: SafetyGatesState = {
    ...lockedGates,
    anticoagulant_lock_active: false,
  };
  const unlockedPb02 = enforceHardSafetyGatesOnActions(pb02Actions, unlockedGates);
  assert.equal(
    unlockedPb02.some((a) => a.action_id.includes('ANTICOAG')),
    true,
    'Anticoagulants must be present when Gate 1 is unlocked',
  );

  // Test Gate 4A: Playbook #15 needle decompression is stripped when locked
  const pb15Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_15_EFAST_TRAUMA_TRIAGE.default_actions;
  const filteredPb15 = enforceHardSafetyGatesOnActions(pb15Actions, lockedGates);
  assert.equal(
    filteredPb15.some((a) => a.action_id.includes('NEEDLE_DECOMPRESSION')),
    false,
    'Needle decompression must be stripped when Gate 4A is locked',
  );

  // Unlocked Gate 4A preserves needle decompression
  const decompUnlockedGates: SafetyGatesState = {
    ...lockedGates,
    gate4_invasive_decompression_locked: false,
  };
  const decompPb15 = enforceHardSafetyGatesOnActions(pb15Actions, decompUnlockedGates);
  assert.equal(
    decompPb15.some((a) => a.action_id.includes('NEEDLE_DECOMPRESSION')),
    true,
    'Needle decompression must be preserved when Gate 4A is unlocked',
  );

  // Test Gate 4B: EVA Fitness No-Go prepends override action
  const evaNoGoGates: SafetyGatesState = {
    ...lockedGates,
    gate4_eva_fitness_no_go: true,
  };
  const evaActions = enforceHardSafetyGatesOnActions([], evaNoGoGates, { gaiPct: 15.4 });
  assert.equal(evaActions.length, 1);
  assert.equal(evaActions[0].action_id, 'ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK');
});
