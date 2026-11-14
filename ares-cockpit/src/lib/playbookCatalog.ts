// Deterministic offline/fallback catalog aligned 1:1 with the 5 Type-1 Crystallized Playbooks
// (`#01`-`#05`) and 3 Hard Clinical Safety Gates in `crates/ares-medops-playbooks`.
// Keep runtime `.ts` imports out of this file so `node --test --experimental-strip-types` runs directly.

import type {
  ActivePlaybook,
  CountermeasureAction,
  CrystallizedPlaybookId,
  SafetyGatesState,
} from '../types/telemetry';

export type PlaybookShortCode = '#01' | '#02' | '#03' | '#04' | '#05';

export interface PlaybookCatalogEntry {
  playbook_id: CrystallizedPlaybookId;
  short_code: PlaybookShortCode;
  short_label: string;
  title: string;
  normative_clause: string;
  default_causal_chain: string[];
  default_actions: CountermeasureAction[];
}

export const GAI_MAX_SAFE_PCT = 12.0;
export const LBNP_MAX_SYS_BP_DROP_MMHG = 15.0;
export const LBNP_MAX_SAFE_HR_BPM = 115.0;
export const SPE_RADIATION_THRESHOLD_MSV_D = 1.5;

export const CRYSTALLIZED_PLAYBOOK_CATALOG: Record<CrystallizedPlaybookId, PlaybookCatalogEntry> = {
  PLAYBOOK_01_VENOUS_STASIS_LBNP: {
    playbook_id: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    short_code: '#01',
    short_label: 'STASIS',
    title: 'Playbook #01: Non-Pharmacological IJV Stasis Reversal (LBNP + Calf Pump)',
    normative_clause: 'NASA-STD-3001 [V2 7043] / OCHMO MTB-007',
    default_causal_chain: [
      'CEPHALAD_FLUID_SHIFT',
      'IJV_CSA_DISTENSION',
      'LOW_WALL_SHEAR_STRESS',
      'NON_PHARMACOLOGICAL_LBNP_REVERSAL',
    ],
    default_actions: [
      {
        action_id: 'ACT_LBNP_MINUS_30_MMHG',
        label:
          'Activate Lower Body Negative Pressure (LBNP) at -30 mmHg for 45 min with active calf contractions',
        category: 'PHYSICAL_HEMODYNAMIC',
        delta_rho_per_hour: 0.19,
      },
      {
        action_id: 'ACT_POCUS_NECK_SCAN',
        label:
          'Perform bilateral B-Mode & Doppler POCUS compression exam of Internal Jugular Vein',
        category: 'DIAGNOSTIC_VERIFICATION',
        delta_rho_per_hour: 0.12,
      },
    ],
  },
  PLAYBOOK_02_CONFIRMED_IJV_THROMBUS: {
    playbook_id: 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS',
    short_code: '#02',
    short_label: 'THROMBUS',
    title: 'Playbook #02: POCUS-Confirmed IJV Thrombosis Protocol',
    normative_clause: 'NASA-STD-3001 [V2 10027] / OCHMO MTB-007',
    default_causal_chain: [
      'IJV_VENOUS_STASIS',
      'POCUS_INTRALUMINAL_THROMBUS_CONFIRMED',
      'GATE1_ANTICOAGULATION_UNLOCKED',
      'VALSALVA_ARED_SUSPENDED',
    ],
    default_actions: [
      {
        action_id: 'ACT_ANTICOAG_ENOXAPARIN',
        label: 'Initiate weight-adjusted Enoxaparin / Apixaban (POCUS thrombus verified)',
        category: 'PHARMACOLOGICAL_UNLOCKED',
        delta_rho_per_hour: 0.22,
      },
      {
        action_id: 'ACT_SUSPEND_VALSALVA_ARED',
        label: 'Suspend high-Valsalva heavy ARED squats to prevent thrombus embolization',
        category: 'MECHANICAL_RESTRICTION',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED: {
    playbook_id: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
    short_code: '#03',
    short_label: 'ARED/BONE',
    title: 'Playbook #03: Frost Mechanostat ARED Loading & Renal Stone Prevention',
    normative_clause: 'NASA-STD-3001 [V1 3002] / [V2 6026]',
    default_causal_chain: [
      'SOLEUS_MECHANICAL_UNLOADING',
      'IRISIN_SUPPRESSION',
      'SCLEROSTIN_UPREGULATION',
      'FROST_MECHANOSTAT_ARED_LOADING',
    ],
    default_actions: [
      {
        action_id: 'ACT_ARED_FROST_LOAD',
        label: 'Maintain ARED resistive squat/heel-raise load >= 125 kgf (> 1000 microstrain)',
        category: 'MECHANICAL_COUNTERMEASURE',
        delta_rho_per_hour: 0.11,
      },
      {
        action_id: 'ACT_HYDRATION_CITRATE',
        label: 'Maintain fluid intake >= 2.8 L/day + potassium citrate to buffer urinary calcium',
        category: 'METABOLIC_COUNTERMEASURE',
        delta_rho_per_hour: 0.07,
      },
    ],
  },
  PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION: {
    playbook_id: 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION',
    short_code: '#04',
    short_label: 'SANS',
    title: 'Playbook #04: SANS Translaminar Pressure & Venous Decongestion Protocol',
    normative_clause: 'NASA-STD-3001 [V2 6001] / OSDR OSD-818',
    default_causal_chain: [
      'HYPERCAPNIA_PPCO2_RISE',
      'CEREBRAL_VENOUS_CONGESTION',
      'TRANSLAMINAR_ONSD_DISTENSION',
      'VENOUS_DECONGESTION_CUFFS',
    ],
    default_actions: [
      {
        action_id: 'ACT_VENOUS_THIGH_CUFFS',
        label: 'Apply calibrated lower-extremity Venous Thigh Cuffs (50 mmHg) + nocturnal LBNP',
        category: 'PHYSICAL_HEMODYNAMIC',
        delta_rho_per_hour: 0.14,
      },
    ],
  },
  PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS: {
    playbook_id: 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS',
    short_code: '#05',
    short_label: 'SPE RAD',
    title: 'Playbook #05: CSA CANS Solar Particle Event Storm Shelter Protocol',
    normative_clause: 'NASA-STD-3001 [V1 4001] / CSA CANS',
    default_causal_chain: [
      'SOLAR_PARTICLE_EVENT_FLUX',
      'RADIATION_DOSE_GT_1_5_MSV_D',
      'EVA_AIRLOCK_FORBIDDEN',
      'STORM_SHELTER_INGRESS_MANDATORY',
    ],
    default_actions: [
      {
        action_id: 'ACT_STORM_SHELTER_INGRESS',
        label: 'Relocate crew to polyethylene/water-shielded habitat core immediately',
        category: 'RADIATION_ALARA',
        delta_rho_per_hour: 0.28,
      },
      {
        action_id: 'ACT_ENDOTHELIAL_ANTIOXIDANT',
        label: 'Administer endothelial antioxidant & B-Complex radioprotective protocol',
        category: 'METABOLIC_COUNTERMEASURE',
        delta_rho_per_hour: 0.09,
      },
    ],
  },
};

export const CRYSTALLIZED_PLAYBOOK_LIST: PlaybookCatalogEntry[] = [
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS,
];

export const PLAYBOOK_BY_SHORT_CODE: Record<PlaybookShortCode, PlaybookCatalogEntry> = {
  '#01': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP,
  '#02': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS,
  '#03': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED,
  '#04': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION,
  '#05': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS,
};

export function isCrystallizedPlaybookId(id: string | null | undefined): id is CrystallizedPlaybookId {
  return typeof id === 'string' && id in CRYSTALLIZED_PLAYBOOK_CATALOG;
}

export function getCatalogEntry(id: string | null | undefined): PlaybookCatalogEntry | undefined {
  if (!id) return undefined;
  if (isCrystallizedPlaybookId(id)) {
    return CRYSTALLIZED_PLAYBOOK_CATALOG[id];
  }
  const normalized = id.trim();
  if (normalized in PLAYBOOK_BY_SHORT_CODE) {
    return PLAYBOOK_BY_SHORT_CODE[normalized as PlaybookShortCode];
  }
  return CRYSTALLIZED_PLAYBOOK_LIST.find(
    (entry) =>
      entry.playbook_id.includes(normalized) ||
      entry.short_code === normalized,
  );
}

export function isAnticoagulantAction(action: Pick<CountermeasureAction, 'action_id' | 'category'>): boolean {
  return (
    action.action_id.toUpperCase().includes('ANTICOAG') ||
    action.category.toUpperCase().includes('PHARMACOLOGICAL')
  );
}

/**
 * Applies the 3 Hard Clinical Safety Gates (`crates/ares-medops-playbooks/src/safety_gates.rs`)
 * onto a list of candidate actions.
 */
export function enforceHardSafetyGatesOnActions(
  actions: CountermeasureAction[],
  gates: SafetyGatesState,
  context: {
    lbnpActive?: boolean;
    sbpDropMmhg?: number;
    hrBpm?: number | null;
    gaiPct?: number;
  } = {},
): CountermeasureAction[] {
  const hr = typeof context.hrBpm === 'number' && Number.isFinite(context.hrBpm) ? context.hrBpm : 72.0;
  const sbpDrop = typeof context.sbpDropMmhg === 'number' && Number.isFinite(context.sbpDropMmhg) ? context.sbpDropMmhg : 0.0;
  const preSyncopeDetected =
    Boolean(context.lbnpActive) &&
    (sbpDrop > LBNP_MAX_SYS_BP_DROP_MMHG || hr > LBNP_MAX_SAFE_HR_BPM);

  // Gate 1: Strip any anticoagulant / pharmacological action when locked
  let next = gates.anticoagulant_lock_active
    ? actions.filter((a) => !isAnticoagulantAction(a))
    : [...actions];

  // Gate 2: Prepend emergency LBNP auto-vent if pre-syncopal threshold exceeded during LBNP
  if (preSyncopeDetected && !next.some((a) => a.action_id === 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG')) {
    next = [
      {
        action_id: 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG',
        label: `SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (SBP drop ${sbpDrop.toFixed(1)} mmHg / HR ${hr.toFixed(0)} bpm)`,
        category: 'HARD_SAFETY_GATE_OVERRIDE',
        delta_rho_per_hour: 0.35,
      },
      ...next,
    ];
  }

  // Gate 3: Append Martian 0.38g EVA suit ankle damping if GAI > 12%
  if (gates.eva_suit_damping_active && !next.some((a) => a.action_id === 'ACT_EVA_SUIT_ANKLE_DAMPING_038G')) {
    const gai = typeof context.gaiPct === 'number' && Number.isFinite(context.gaiPct) ? context.gaiPct : 12.1;
    next = [
      ...next,
      {
        action_id: 'ACT_EVA_SUIT_ANKLE_DAMPING_038G',
        label: `SAFETY GATE 3 ACTIVE: Lock plyometric impact & set Martian EVA suit ankle damping +25% (GAI = ${gai.toFixed(1)}% > 12.0%)`,
        category: 'BIOMECHANICAL_SAFETY_GATE',
        delta_rho_per_hour: 0.10,
      },
    ];
  }

  return next;
}

export interface OfflinePlaybookInputs {
  rhoTauW: number;
  rhoSans: number;
  gaiPct: number;
  thrombusConfirmed: boolean | null;
  radiationDoseRateMsvD?: number;
  lbnpMmhg?: number;
  hrBpm?: number | null;
  sbpDropMmhg?: number;
  causalChainSummary?: string[];
}

/**
 * Deterministic Type-1 Playbook selection + 3 Hard Clinical Safety Gates for offline / fallback mode,
 * aligned 1:1 with `select_candidate_playbook` and `enforce_hard_clinical_safety_gates`.
 */
export function deriveOfflineActivePlaybook(inputs: OfflinePlaybookInputs): ActivePlaybook {
  const pocusConfirmed = inputs.thrombusConfirmed === true;
  const radDose =
    typeof inputs.radiationDoseRateMsvD === 'number' && Number.isFinite(inputs.radiationDoseRateMsvD)
      ? inputs.radiationDoseRateMsvD
      : 0.45;

  let selectedId: CrystallizedPlaybookId;
  if (pocusConfirmed) {
    selectedId = 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS';
  } else if (radDose > SPE_RADIATION_THRESHOLD_MSV_D) {
    selectedId = 'PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS';
  } else if (inputs.rhoTauW < 0.15) {
    selectedId = 'PLAYBOOK_01_VENOUS_STASIS_LBNP';
  } else if (inputs.rhoSans < 0.20) {
    selectedId = 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION';
  } else {
    selectedId = 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED';
  }

  const entry = CRYSTALLIZED_PLAYBOOK_CATALOG[selectedId];
  const safetyGates: SafetyGatesState = {
    anticoagulant_lock_active: !pocusConfirmed,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: inputs.gaiPct > GAI_MAX_SAFE_PCT,
  };

  const lbnpActive = typeof inputs.lbnpMmhg === 'number' && inputs.lbnpMmhg < 0;
  const actions = enforceHardSafetyGatesOnActions(entry.default_actions, safetyGates, {
    lbnpActive,
    sbpDropMmhg: inputs.sbpDropMmhg,
    hrBpm: inputs.hrBpm,
    gaiPct: inputs.gaiPct,
  });

  return {
    playbook_id: entry.playbook_id,
    title: entry.title,
    current_step: 1,
    total_steps: Math.max(1, actions.length),
    step_instruction: actions[0]?.label ?? entry.title,
    causal_chain_summary: inputs.causalChainSummary ?? entry.default_causal_chain,
    safety_gates: safetyGates,
    actions,
  };
}
