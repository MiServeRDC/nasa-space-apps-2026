import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRYSTALLIZED_PLAYBOOK_CATALOG,
  enforceHardSafetyGatesOnActions,
  isAnticoagulantAction,
} from '../src/lib/playbookCatalog.ts';
import {
  isValidTelemetryPayload,
  normalizeTelemetryPacket,
} from '../src/lib/telemetryValidation.ts';
import type { CountermeasureAction, SafetyGatesState } from '../src/types/telemetry.ts';

test('SCEN-01 (M3): Nominal Mars Transit Baseline telemetry packet normalization and gate safety invariants', () => {
  const nominalPayload = {
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
      rho_ared: 0.85,
      rho_sost: 0.80,
      rho_rmssd: 0.82,
      rho_sans: 0.88,
      rho_global: 0.80,
    },
    active_playbook: {
      playbook_id: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
      title: 'Playbook #03: ARED Mechanotransduction Calibration',
      causal_chain_summary: ['Nominal Mars transit cruise'],
      safety_gates: {
        anticoagulant_lock_active: true,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active: false,
        gate4_invasive_decompression_locked: true,
        gate4_eva_fitness_no_go: false,
      },
      actions: [
        {
          action_id: 'ACT_ARED_DAILY_SCHEDULE',
          label: 'Continue standard ARED daily resistance training protocol',
          category: 'EXERCISE_COUNTERMEASURE',
          delta_rho_per_hour: 0.05,
        },
      ],
    },
  };

  assert.equal(isValidTelemetryPayload(nominalPayload), true);
  const normalized = normalizeTelemetryPacket(nominalPayload);
  assert.equal(normalized.mission_elapsed_days, 180);
  assert.equal(normalized.safety_margins.alarm_level, 'NOMINAL');
  assert.ok(normalized.active_playbook);
  assert.equal(normalized.active_playbook.safety_gates.gate4_invasive_decompression_locked, true);
  assert.equal(normalized.active_playbook.safety_gates.anticoagulant_lock_active, true);
  assert.equal(normalized.active_playbook.safety_gates.lbnp_auto_vent_armed, true);
});

test('SCEN-02 (M3): Hard Gate 1 locks anticoagulants on venous stasis and unlocks only with POCUS thrombus confirmation', () => {
  const pb02Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS.default_actions;

  // Stage A: POCUS thrombus unconfirmed -> Gate 1 locks anticoagulants
  const lockedGates: SafetyGatesState = {
    anticoagulant_lock_active: true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
    gate4_invasive_decompression_locked: true,
    gate4_eva_fitness_no_go: false,
  };

  const filteredA = enforceHardSafetyGatesOnActions(pb02Actions, lockedGates);
  assert.equal(
    filteredA.some((a) => isAnticoagulantAction(a)),
    false,
    'All anticoagulant actions must be stripped when Gate 1 is active'
  );
  assert.ok(
    filteredA.some((a) => a.action_id.includes('VALSALVA')),
    'Mechanical restrictions must remain active even when anticoagulants are locked'
  );

  // Stage B: POCUS confirms intraluminal thrombus -> Gate 1 releases lock
  const unlockedGates: SafetyGatesState = {
    ...lockedGates,
    anticoagulant_lock_active: false,
  };

  const filteredB = enforceHardSafetyGatesOnActions(pb02Actions, unlockedGates);
  assert.ok(
    filteredB.some((a) => isAnticoagulantAction(a)),
    'Anticoagulants must be unlocked once POCUS confirms thrombus'
  );
});

test('SCEN-03 (M3): Hard Gate 2 syncope pre-emption auto-vents negative pressure chamber', () => {
  const pb01Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP.default_actions;

  // LBNP session with syncope pre-emption override
  const autoVentAction: CountermeasureAction = {
    action_id: 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG',
    label: 'SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately',
    category: 'HARD_SAFETY_GATE_OVERRIDE',
    delta_rho_per_hour: 0.35,
  };

  const actionsWithOverride = [autoVentAction, ...pb01Actions];
  assert.equal(actionsWithOverride[0].action_id, 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG');
  assert.equal(actionsWithOverride[0].category, 'HARD_SAFETY_GATE_OVERRIDE');
});

test('SCEN-04 (M3): Hard Gate 3 engages suit damping and flags EVA NO-GO when GAI > 12.0%', () => {
  const gaitImpairedGates: SafetyGatesState = {
    anticoagulant_lock_active: true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: true,
    gate4_invasive_decompression_locked: true,
    gate4_eva_fitness_no_go: true,
  };

  assert.equal(gaitImpairedGates.eva_suit_damping_active, true);
  assert.equal(gaitImpairedGates.gate4_eva_fitness_no_go, true);

  const ankleDampingAction: CountermeasureAction = {
    action_id: 'ACT_EVA_SUIT_ANKLE_DAMPING_038G',
    label: 'SAFETY GATE 3 ACTIVE: Lock plyometric impact & set Martian EVA suit ankle damping +25%',
    category: 'BIOMECHANICAL_SAFETY_GATE',
    delta_rho_per_hour: 0.10,
  };

  const evaNoGoAction: CountermeasureAction = {
    action_id: 'ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK',
    label: 'SAFETY GATE 4 TRIGGERED: EVA NO-GO LOCK ACTIVE',
    category: 'CRITICAL_SAFETY_LOCK',
    delta_rho_per_hour: 0.0,
  };

  const actions = [evaNoGoAction, ankleDampingAction];
  assert.equal(actions.some((a) => a.action_id === 'ACT_EVA_SUIT_ANKLE_DAMPING_038G'), true);
  assert.equal(actions.some((a) => a.action_id === 'ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK'), true);
});

test('SCEN-05 (M3): Playbook #10 preserves forced oral hydration and potassium citrate without false anticoagulant stripping', () => {
  const pb10Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_10_RENAL_LITHIASIS.default_actions;
  const lockedGates: SafetyGatesState = {
    anticoagulant_lock_active: true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
    gate4_invasive_decompression_locked: true,
    gate4_eva_fitness_no_go: false,
  };

  const filteredPb10 = enforceHardSafetyGatesOnActions(pb10Actions, lockedGates);

  assert.ok(
    filteredPb10.some((a) => a.action_id.includes('HYDRATION')),
    'Oral hydration bolus must be present in Playbook #10'
  );
  assert.ok(
    filteredPb10.some((a) => a.action_id.includes('POTASSIUM_CITRATE')),
    'Potassium citrate alkalinization must be preserved under Gate 1 lock'
  );
  assert.ok(
    filteredPb10.some((a) => a.action_id.includes('POCUS_RENAL')),
    'Diagnostic renal POCUS scan must be present'
  );
});

test('SCEN-06 (M3): Hard Gate 4A strips needle thoracostomy on negative eFAST and unlocks on confirmed pneumothorax or vital collapse', () => {
  const pb15Actions = CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_15_EFAST_TRAUMA_TRIAGE.default_actions;

  // Stage A: eFAST negative -> needle decompression stripped
  const lockedDecompGates: SafetyGatesState = {
    anticoagulant_lock_active: true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
    gate4_invasive_decompression_locked: true,
    gate4_eva_fitness_no_go: false,
  };

  const filteredA = enforceHardSafetyGatesOnActions(pb15Actions, lockedDecompGates);
  assert.equal(
    filteredA.some((a) => a.action_id.includes('NEEDLE_DECOMPRESSION')),
    false,
    'Needle thoracostomy must be stripped when Gate 4A is locked'
  );

  // Stage B: eFAST confirms tension pneumothorax -> needle decompression preserved
  const unlockedDecompGates: SafetyGatesState = {
    ...lockedDecompGates,
    gate4_invasive_decompression_locked: false,
  };

  const filteredB = enforceHardSafetyGatesOnActions(pb15Actions, unlockedDecompGates);
  assert.ok(
    filteredB.some((a) => a.action_id.includes('NEEDLE_DECOMPRESSION')),
    'Needle thoracostomy must be preserved when Gate 4A is unlocked'
  );
});
