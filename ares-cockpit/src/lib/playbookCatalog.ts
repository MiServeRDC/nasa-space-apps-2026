// Deterministic offline/fallback catalog aligned 1:1 with the 5 Type-1 Crystallized Playbooks
// (`#01`-`#05`) and 3 Hard Clinical Safety Gates in `crates/ares-medops-playbooks`.
// Keep runtime `.ts` imports out of this file so `node --test --experimental-strip-types` runs directly.

import type {
  ActivePlaybook,
  CountermeasureAction,
  CrystallizedPlaybookId,
  SafetyGatesState,
} from '../types/telemetry';

export type PlaybookShortCode =
  | '#01'
  | '#02'
  | '#03'
  | '#04'
  | '#05'
  | '#06'
  | '#07'
  | '#08'
  | '#09'
  | '#10'
  | '#11'
  | '#12'
  | '#13'
  | '#14'
  | '#15';

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
  PLAYBOOK_06_HYPOXEMIA_DESATURATION: {
    playbook_id: 'PLAYBOOK_06_HYPOXEMIA_DESATURATION',
    short_code: '#06',
    short_label: 'HYPOXEMIA',
    title: 'Playbook #06: Acute Hypoxemia / SpO2 Desaturation Response',
    normative_clause: 'NASA-STD-3001 [V2 6012] / Flight Rule B13-15',
    default_causal_chain: [
      'SPO2_DESATURATION_BELOW_BASELINE',
      'VERIFY_PROBE_AND_CABIN_PPO2',
      'INITIATE_SUPPLEMENTAL_O2_TITRATION',
    ],
    default_actions: [
      {
        action_id: 'VERIFY_OXIMETER_AND_CABIN_PPO2',
        label: 'Verify pulse oximeter perfusion & cabin ppO2 / ppCO2 sensors',
        category: 'HYPOXEMIA_TRIAGE',
        delta_rho_per_hour: 0.18,
      },
      {
        action_id: 'SUPPLEMENTAL_O2_TITRATION',
        label: 'Initiate supplemental O2 titration (target SpO2 >= 94%)',
        category: 'OXYGEN_THERAPY',
        delta_rho_per_hour: 0.24,
      },
    ],
  },
  PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS: {
    playbook_id: 'PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS',
    short_code: '#07',
    short_label: 'TACHYCARDIA',
    title: 'Playbook #07: Sustained Tachycardia & Autonomic Stress Evaluation',
    normative_clause: 'NASA-STD-3001 [V2 7043] / MEDOPS-ACUTE-HR-07',
    default_causal_chain: [
      'SUSTAINED_HR_Z_SCORE_ELEVATION',
      'RULE_OUT_ORTHOSTATIC_OR_HYPOVOLEMIA',
      'CAPTURE_RESTING_RHYTHM_AND_BP',
    ],
    default_actions: [
      {
        action_id: 'ASSESS_REST_HYDRATION_ORTHOSTATIC',
        label: 'Pause exertion, administer oral rehydration, assess orthostatic load',
        category: 'AUTONOMIC_STABILIZATION',
        delta_rho_per_hour: 0.16,
      },
      {
        action_id: 'CAPTURE_12LEAD_AND_BP_CHECK',
        label: 'Acquire resting ECG rhythm strip & cuff blood pressure',
        category: 'CARDIAC_DIAGNOSTICS',
        delta_rho_per_hour: 0.14,
      },
    ],
  },
  PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK: {
    playbook_id: 'PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK',
    short_code: '#08',
    short_label: 'SENSOR_QA',
    title: 'Playbook #08: Sensor Detachment & Signal Quality Recovery',
    normative_clause: 'NASA-STD-3001 [V2 10001] / EPISTEMIC-SQI-ABSTENTION',
    default_causal_chain: [
      'SENSOR_DETACH_OR_LOW_SQI_DETECTED',
      'ABSTAIN_AUTOMATED_DIAGNOSTIC_ALARM',
      'RESEAT_SPO2_AND_ECG_TRANSDUCERS',
    ],
    default_actions: [
      {
        action_id: 'RESEAT_SPO2_AND_ECG_LEADS',
        label: 'Reseat SpO2 finger clip & inspect/clean ECG gel electrodes',
        category: 'SENSOR_MAINTENANCE',
        delta_rho_per_hour: 0.12,
      },
    ],
  },
  PLAYBOOK_09_MULTIPARAMETER_DETERIORATION: {
    playbook_id: 'PLAYBOOK_09_MULTIPARAMETER_DETERIORATION',
    short_code: '#09',
    short_label: 'MULTICHAN',
    title: 'Playbook #09: Multiparameter Acute Cardiorespiratory Deterioration',
    normative_clause: 'NASA-STD-3001 [V2 6012] / MAHALANOBIS-D2-CRISIS',
    default_causal_chain: [
      'JOINT_HR_SPO2_MAHALANOBIS_D2_SPIKE',
      'CONCURRENT_HYPOXEMIA_AND_TACHYCARDIA',
      'IMMEDIATE_ABC_AND_SURGEON_CONSULT',
    ],
    default_actions: [
      {
        action_id: 'AIRWAY_BREATHING_CIRCULATION_CHECK',
        label: 'Execute immediate ABC survey & high-flow supplemental O2',
        category: 'CRITICAL_RESPONSE',
        delta_rho_per_hour: 0.30,
      },
      {
        action_id: 'FLIGHT_SURGEON_TELEMEDICINE_CALL',
        label: 'Establish priority ground Flight Surgeon telemedicine consult',
        category: 'TELEMEDICINE_ESCALATION',
        delta_rho_per_hour: 0.20,
      },
    ],
  },
  PLAYBOOK_10_RENAL_LITHIASIS: {
    playbook_id: 'PLAYBOOK_10_RENAL_LITHIASIS',
    short_code: '#10',
    short_label: 'RENAL',
    title: 'Playbook #10: Renal Lithiasis Hydration, Citrate Buffering & Bladder Protocol',
    normative_clause: 'NASA-STD-3001 [V2 6026]',
    default_causal_chain: [
      'BONE_RESORPTION_HYPERCALCIURIA',
      'HYPERCAPNIC_CITRATE_SUPPRESSION',
      'CALCIUM_OXALATE_SUPER_SATURATION',
      'POCUS_TWINKLING_OR_OBSTRUCTION',
    ],
    default_actions: [
      {
        action_id: 'ACT_POCUS_RENAL_BLADDER_SCAN',
        label: 'Execute guided renal and bladder ultrasound (assess hydronephrosis and bladder volume)',
        category: 'DIAGNOSTIC_VERIFICATION',
        delta_rho_per_hour: 0.12,
      },
      {
        action_id: 'ACT_ORAL_HYDRATION_BOLUS_1000ML',
        label: 'Administer 1.0 L balanced oral electrolyte solution over 60 minutes',
        category: 'METABOLIC_COUNTERMEASURE',
        delta_rho_per_hour: 0.25,
      },
      {
        action_id: 'ACT_PHARMACOLOGICAL_POTASSIUM_CITRATE_30MEQ',
        label: 'Initiate Potassium Citrate 30 mEq PO daily to alkalinize urine and chelate calcium',
        category: 'PHARMACOLOGICAL_UNLOCKED',
        delta_rho_per_hour: 0.18,
      },
    ],
  },
  PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING: {
    playbook_id: 'PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING',
    short_code: '#11',
    short_label: 'FLUIDLOAD',
    title: 'Playbook #11: Mars Entry 0.38g Pre-Landing Fluid Loading & Orthostatic Protocol',
    normative_clause: 'NASA-STD-3001 [V1 3003]',
    default_causal_chain: [
      'GAUER_HENRY_PLASMA_VOLUME_CONTRACTION',
      'SPACEFLIGHT_HEMOLYSIS_MARROW',
      'RE_ENTRY_DECELERATION_BLOOD_POOLING',
      'ORTHOSTATIC_PRESUSPECTED_COLLAPSE',
    ],
    default_actions: [
      {
        action_id: 'ACT_ISOTONIC_SALT_WATER_LOADING_15ML_KG',
        label: 'Ingest 15 mL/kg body mass of isotonic electrolyte solution within 2 hours of entry burn',
        category: 'METABOLIC_COUNTERMEASURE',
        delta_rho_per_hour: 0.28,
      },
      {
        action_id: 'ACT_DON_ANTI_G_COMPRESSION_GARMENT',
        label: 'Don inflatable abdominal-thigh compression garment set to 35-45 mmHg gradient',
        category: 'PHYSICAL_HEMODYNAMIC',
        delta_rho_per_hour: 0.22,
      },
    ],
  },
  PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE: {
    playbook_id: 'PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE',
    short_code: '#12',
    short_label: 'CIRCADIAN',
    title: 'Playbook #12: Mars Sol Circadian Phototherapy, Blue Enrichment & Sleep Hygiene',
    normative_clause: 'NASA-STD-3001 [V1 3001] / [V2 6001]',
    default_causal_chain: [
      'MARS_SOL_24_66H_PHASE_DESYNCHRONY',
      'SLOW_WAVE_SLEEP_DEBT_ACCUMULATION',
      'PVT_B_COGNITIVE_LAPSE_ACCELERATION',
      'MELANOPIC_BLUE_LIGHT_ENTRAINMENT',
    ],
    default_actions: [
      {
        action_id: 'ACT_MELANOPIC_LIGHT_480NM_450LUX',
        label: 'Deliver 45 minutes of 480 nm blue-enriched light (> 450 EDI lux) immediately upon waking',
        category: 'ENVIRONMENTAL_CHECK',
        delta_rho_per_hour: 0.20,
      },
      {
        action_id: 'ACT_BLUE_DEPLETION_EVENING_FILTER',
        label: 'Enforce optical blue-blocking eyewear (< 10 lux melanopic) starting 2 hours prior to scheduled sleep',
        category: 'ENVIRONMENTAL_CHECK',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR: {
    playbook_id: 'PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR',
    short_code: '#13',
    short_label: 'IMMUNE',
    title: 'Playbook #13: Spaceflight Immune Dysregulation & Latent Herpesvirus Reactivation Protocol',
    normative_clause: 'NASA-STD-3001 [V1 3001]',
    default_causal_chain: [
      'CHRONIC_GLUCOCORTICOID_ELEVATION',
      'TH1_TH2_CYTOKINE_BALANCE_DEVIATION',
      'LATENT_VZV_EBV_VIRAL_SHEDDING',
      'ORAL_VALACYCLOVIR_INTERVENTION',
    ],
    default_actions: [
      {
        action_id: 'ACT_CLINICAL_DERMATOMIC_INSPECTION',
        label: 'Perform targeted examination of cranial nerves (V1 ophthalmic branch) and thoracic dermatomes',
        category: 'CLINICAL_ASSESSMENT',
        delta_rho_per_hour: 0.10,
      },
      {
        action_id: 'ACT_VALACYCLOVIR_ANTIVIRAL_THERAPY',
        label: 'Initiate Oral Valacyclovir 1000 mg TID for 7 days (cleared by Gate 1 non-anticoagulant filter)',
        category: 'PHARMACOLOGICAL_UNLOCKED',
        delta_rho_per_hour: 0.25,
      },
    ],
  },
  PLAYBOOK_14_CO2_SCRUBBER_SANS: {
    playbook_id: 'PLAYBOOK_14_CO2_SCRUBBER_SANS',
    short_code: '#14',
    short_label: 'ECLSS/CO2',
    title: 'Playbook #14: Cabin ppCO2 Hypercapnia Scrubbing & Ocular Vasodilation Mitigation',
    normative_clause: 'NASA-STD-3001 [V2 6001]',
    default_causal_chain: [
      'CABIN_PPCO2_EXCEEDS_3_0_MMHG',
      'CEREBRAL_ARTERIOLAR_VASODILATION',
      'RETROBULBAR_VENOUS_PRESSURE_INCREASE',
      'TRANSLAMINAR_GRADIENT_AMPLIFICATION',
    ],
    default_actions: [
      {
        action_id: 'ACT_INSPECT_CDRA_DESICCANT_BEDS',
        label: 'Verify Carbon Dioxide Removal Assembly cycle timing and inspect backup LiOH canisters',
        category: 'ENVIRONMENTAL_CHECK',
        delta_rho_per_hour: 0.30,
      },
      {
        action_id: 'ACT_DEPLOY_PORTABLE_CABIN_FANS',
        label: 'Install supplementary duct fans in crew sleeping quarters to eliminate microgravity CO2 pockets',
        category: 'ENVIRONMENTAL_CHECK',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_15_EFAST_TRAUMA_TRIAGE: {
    playbook_id: 'PLAYBOOK_15_EFAST_TRAUMA_TRIAGE',
    short_code: '#15',
    short_label: 'TRAUMA',
    title: 'Playbook #15: eFAST Thoraco-Abdominal Trauma Triage & Needle Thoracostomy Protocol',
    normative_clause: 'NASA-STD-3001 [V2 7043] / [V1 3006]',
    default_causal_chain: [
      'KINETIC_TRAUMA_OR_BAROTRAUMA_EVENT',
      'POCUS_EFAST_FLUID_OR_LUNG_POINT',
      'TENSION_PNEUMOTHORAX_SUSPICION',
      'GATE4_DECOMPRESSION_OR_NEEDLE_RELEASE',
    ],
    default_actions: [
      {
        action_id: 'ACT_RAPID_5_WINDOW_EFAST_SCAN',
        label: 'Execute systematic eFAST ultrasound protocol (RUQ, LUQ, pelvic, subxiphoid, bilateral thoracic)',
        category: 'DIAGNOSTIC_VERIFICATION',
        delta_rho_per_hour: 0.0,
      },
      {
        action_id: 'ACT_PLEURAL_M_MODE_BARCODE_VERIFY',
        label: 'Obtain thoracic M-mode clips over 2nd intercostal mid-clavicular line to assess seashore vs barcode sign',
        category: 'DIAGNOSTIC_VERIFICATION',
        delta_rho_per_hour: 0.0,
      },
      {
        action_id: 'ACT_NEEDLE_DECOMPRESSION_2ND_ICL',
        label: 'Perform emergency needle decompression 2nd intercostal mid-clavicular line (requires Gate 4 confirmation)',
        category: 'INVASIVE_PROCEDURE',
        delta_rho_per_hour: 0.35,
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

export const ACUTE_VITALS_PLAYBOOK_LIST: PlaybookCatalogEntry[] = [
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_06_HYPOXEMIA_DESATURATION,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_09_MULTIPARAMETER_DETERIORATION,
];

export const EXPLORATION_MEDICINE_PLAYBOOK_LIST: PlaybookCatalogEntry[] = [
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_10_RENAL_LITHIASIS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_14_CO2_SCRUBBER_SANS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_15_EFAST_TRAUMA_TRIAGE,
];

export const ALL_CRYSTALLIZED_PLAYBOOK_LIST: PlaybookCatalogEntry[] = [
  ...CRYSTALLIZED_PLAYBOOK_LIST,
  ...ACUTE_VITALS_PLAYBOOK_LIST,
  ...EXPLORATION_MEDICINE_PLAYBOOK_LIST,
];

export const PLAYBOOK_BY_SHORT_CODE: Record<PlaybookShortCode, PlaybookCatalogEntry> = {
  '#01': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP,
  '#02': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS,
  '#03': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED,
  '#04': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION,
  '#05': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS,
  '#06': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_06_HYPOXEMIA_DESATURATION,
  '#07': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS,
  '#08': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK,
  '#09': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_09_MULTIPARAMETER_DETERIORATION,
  '#10': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_10_RENAL_LITHIASIS,
  '#11': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING,
  '#12': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE,
  '#13': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR,
  '#14': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_14_CO2_SCRUBBER_SANS,
  '#15': CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_15_EFAST_TRAUMA_TRIAGE,
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
  return ALL_CRYSTALLIZED_PLAYBOOK_LIST.find(
    (entry) =>
      entry.playbook_id.includes(normalized) ||
      entry.short_code === normalized,
  );
}

export function isAnticoagulantAction(action: Pick<CountermeasureAction, 'action_id' | 'category'>): boolean {
  const category = action.category.toUpperCase();
  const actionId = action.action_id.toUpperCase();
  return (
    category === 'PHARMACOLOGICAL_ANTICOAGULANT' ||
    actionId.includes('ANTICOAG')
  );
}

/**
 * Applies the 4 Hard Clinical Safety Gates (1, 2, 3, 4A, 4B — `safety_gates.rs`)
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
    sbpMmhg?: number | null;
    dbpMmhg?: number | null;
    sensorLoss?: boolean;
    plateletCountKUl?: number | null;
  } = {},
): CountermeasureAction[] {
  const hr = typeof context.hrBpm === 'number' && Number.isFinite(context.hrBpm) ? context.hrBpm : 72.0;
  const sbpDrop = typeof context.sbpDropMmhg === 'number' && Number.isFinite(context.sbpDropMmhg) ? context.sbpDropMmhg : 0.0;
  
  const pulsePressureNarrowed =
    typeof context.sbpMmhg === 'number' &&
    typeof context.dbpMmhg === 'number' &&
    context.sbpMmhg > 0 &&
    (context.sbpMmhg - context.dbpMmhg) < 25.0;

  const sensorDropoutCritical =
    Boolean(context.sensorLoss) || (context.hrBpm === null && context.sbpMmhg === null);

  const preSyncopeDetected =
    Boolean(context.lbnpActive) &&
    (sbpDrop > LBNP_MAX_SYS_BP_DROP_MMHG || hr > LBNP_MAX_SAFE_HR_BPM || pulsePressureNarrowed || sensorDropoutCritical);

  const thrombocytopeniaContraindicated =
    typeof context.plateletCountKUl === 'number' && context.plateletCountKUl < 75.0;

  const anticoagulantLockActive = gates.anticoagulant_lock_active || thrombocytopeniaContraindicated;

  // Gate 1: Strip ONLY anticoagulant actions when locked (preserve non-anticoagulant drugs)
  let next = anticoagulantLockActive
    ? actions.filter((a) => !isAnticoagulantAction(a))
    : [...actions];

  if (thrombocytopeniaContraindicated && !next.some((a) => a.action_id === 'ACT_ANTICOAG_CONTRAINDICATED_THROMBOCYTOPENIA_RISK')) {
    next = [
      {
        action_id: 'ACT_ANTICOAG_CONTRAINDICATED_THROMBOCYTOPENIA_RISK',
        label: 'CONTRAINDICATION LOCK: Systemic Anticoagulation Blocked (Hemorrhagic Risk)',
        category: 'CLINICAL_SAFETY_GATE_OVERRIDE',
        delta_rho_per_hour: 0.0,
      },
      ...next,
    ];
  }

  // Gate 2: Prepend emergency LBNP auto-vent if pre-syncopal threshold or sensor blackout exceeded during LBNP
  if (preSyncopeDetected && !next.some((a) => a.action_id === 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG')) {
    const ventLabel = sensorDropoutCritical
      ? 'SAFETY GATE 2 TRIGGERED: Emergency LBNP Auto-Vent to 0 mmHg (Sensor Dropout Fail-Safe)'
      : pulsePressureNarrowed
      ? `SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (Pulse Pressure Narrowing < 25 mmHg, SBP drop ${sbpDrop.toFixed(1)} mmHg)`
      : `SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (SBP drop ${sbpDrop.toFixed(1)} mmHg / HR ${hr.toFixed(0)} bpm)`;

    next = [
      {
        action_id: 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG',
        label: ventLabel,
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

  // Gate 4A: Strip invasive thoracic decompression unless explicitly unlocked by verified eFAST
  if (gates.gate4_invasive_decompression_locked !== false) {
    next = next.filter((a) => {
      const id = a.action_id.toUpperCase();
      return !id.includes('THORACOSTOMY') && !id.includes('NEEDLE_DECOMPRESSION');
    });
  }

  // Gate 4B: Prepend EVA Fitness No-Go Lock when active
  if (
    gates.gate4_eva_fitness_no_go &&
    !next.some((a) => a.action_id === 'ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK')
  ) {
    const gai = typeof context.gaiPct === 'number' && Number.isFinite(context.gaiPct) ? context.gaiPct : 12.1;
    next = [
      {
        action_id: 'ACT_EVA_NO_GO_COGNITIVE_OR_HEMODYNAMIC_LOCK',
        label: `SAFETY GATE 4 TRIGGERED: EVA NO-GO LOCK ACTIVE (GAI=${gai.toFixed(1)}%)`,
        category: 'CRITICAL_SAFETY_LOCK',
        delta_rho_per_hour: 0.0,
      },
      ...next,
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
