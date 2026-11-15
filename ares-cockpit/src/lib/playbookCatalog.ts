// Deterministic offline/fallback catalog aligned 1:1 with the 5 Type-1 Crystallized Playbooks
// (`#01`-`#05`) and 3 Hard Clinical Safety Gates in `crates/ares-medops-playbooks`.
// Keep runtime `.ts` imports out of this file so `node --test --experimental-strip-types` runs directly.

import type {
  ActivePlaybook,
  Aerospace360PlaybookId,
  CountermeasureAction,
  CrystallizedPlaybookId,
  PlaybookId,
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

export type Playbook360ShortCode =
  | PlaybookShortCode
  | '#16'
  | '#17'
  | '#18'
  | '#19'
  | '#20'
  | '#21'
  | '#22'
  | '#23'
  | '#24'
  | '#25'
  | '#26'
  | '#27'
  | '#28'
  | '#29'
  | '#30';

export type Playbook360DomainId =
  | 'CARDIORESPIRATORY'
  | 'NEURO_OCULAR_VESTIBULAR'
  | 'RADIATION_EVA_THERMAL'
  | 'ENDOCRINE_RENAL_BEHAVIORAL';

export interface Playbook360DomainTabMeta {
  id: Playbook360DomainId;
  label: string;
  rangeLabel: string;
  shortCodes: readonly Playbook360ShortCode[];
}

export const PLAYBOOK_360_DOMAIN_TABS: readonly Playbook360DomainTabMeta[] = [
  {
    id: 'CARDIORESPIRATORY',
    label: 'Cardiorespiratory',
    rangeLabel: '#01-#08',
    shortCodes: ['#01', '#02', '#03', '#04', '#05', '#06', '#07', '#08'],
  },
  {
    id: 'NEURO_OCULAR_VESTIBULAR',
    label: 'Neuro-Ocular & Vestibular',
    rangeLabel: '#09-#15',
    shortCodes: ['#09', '#10', '#11', '#12', '#13', '#14', '#15'],
  },
  {
    id: 'RADIATION_EVA_THERMAL',
    label: 'Radiation, EVA & Thermal',
    rangeLabel: '#16-#23',
    shortCodes: ['#16', '#17', '#18', '#19', '#20', '#21', '#22', '#23'],
  },
  {
    id: 'ENDOCRINE_RENAL_BEHAVIORAL',
    label: 'Endocrine, Renal & Behavioral',
    rangeLabel: '#24-#30',
    shortCodes: ['#24', '#25', '#26', '#27', '#28', '#29', '#30'],
  },
];

export interface PlaybookCatalogEntry<TId extends PlaybookId = PlaybookId> {
  playbook_id: TId;
  short_code: TId extends CrystallizedPlaybookId ? PlaybookShortCode : Playbook360ShortCode;
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

export const CRYSTALLIZED_PLAYBOOK_CATALOG: Record<
  CrystallizedPlaybookId,
  PlaybookCatalogEntry<CrystallizedPlaybookId>
> = {
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

export const CRYSTALLIZED_PLAYBOOK_LIST: PlaybookCatalogEntry<CrystallizedPlaybookId>[] = [
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS,
];

export const ACUTE_VITALS_PLAYBOOK_LIST: PlaybookCatalogEntry<CrystallizedPlaybookId>[] = [
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_06_HYPOXEMIA_DESATURATION,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_09_MULTIPARAMETER_DETERIORATION,
];

export const EXPLORATION_MEDICINE_PLAYBOOK_LIST: PlaybookCatalogEntry<CrystallizedPlaybookId>[] = [
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_10_RENAL_LITHIASIS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_14_CO2_SCRUBBER_SANS,
  CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_15_EFAST_TRAUMA_TRIAGE,
];

export const ALL_CRYSTALLIZED_PLAYBOOK_LIST: PlaybookCatalogEntry<CrystallizedPlaybookId>[] = [
  ...CRYSTALLIZED_PLAYBOOK_LIST,
  ...ACUTE_VITALS_PLAYBOOK_LIST,
  ...EXPLORATION_MEDICINE_PLAYBOOK_LIST,
];

export const PLAYBOOK_BY_SHORT_CODE: Record<
  PlaybookShortCode,
  PlaybookCatalogEntry<CrystallizedPlaybookId>
> = {
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

export const AEROSPACE_360_PLAYBOOK_CATALOG: Record<
  Aerospace360PlaybookId,
  PlaybookCatalogEntry<Aerospace360PlaybookId>
> = {
  PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK: {
    playbook_id: 'PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK',
    short_code: '#16',
    short_label: 'SEPSIS',
    title: 'Playbook #16: Sepsis & Septic Shock Surviving Sepsis Campaign 1-Hour Bundle',
    normative_clause: 'NASA-STD-3001 [V1 3006] / ExMC Surviving Sepsis & Spaceflight Pharmacology',
    default_causal_chain: [
      'suspected_infection + qSOFA >= 2 -> sepsis_1h_bundle',
      'MAP < 65 mmHg or lactate >= 4.0 mmol/L -> norepinephrine_titration',
    ],
    default_actions: [
      {
        action_id: 'ACT_SEPSIS_POCT_LACTATE_AND_MICROBIAL_CULTURES',
        label: 'Obtain immediate POCT lactate and paired microbial cultures prior to antimicrobials',
        category: 'DIAGNOSTIC_VERIFICATION',
        delta_rho_per_hour: 0.1,
      },
      {
        action_id: 'ACT_SEPSIS_1H_BROAD_SPECTRUM_IV_ANTIBIOTICS',
        label: 'Administer 1-hour broad-spectrum IV Piperacillin-Tazobactam or Cefepime (Gate 5 allergy/renal-adjusted)',
        category: 'PHARMACOLOGICAL_UNLOCKED',
        delta_rho_per_hour: 0.35,
      },
      {
        action_id: 'ACT_SEPSIS_30ML_KG_CRYSTALLOID_BOLUS',
        label: 'Infuse 30 mL/kg balanced crystalloid bolus with POCUS lung B-line fluid-tolerance check',
        category: 'HEMODYNAMIC_RESUSCITATION',
        delta_rho_per_hour: 0.3,
      },
    ],
  },
  PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA: {
    playbook_id: 'PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA',
    short_code: '#17',
    short_label: 'HEMORRHAGE',
    title: 'Playbook #17: Hemorrhagic Trauma & TXA Window Protocol',
    normative_clause: 'NASA-STD-3001 [V2 7043] / ExMC Hemorrhagic Trauma & TXA Capability',
    default_causal_chain: [
      'active_arterial_hemorrhage -> Gate1_anticoagulant_lock_active',
      'injury_hours_elapsed <= 3.0 h -> TXA_1g_IV_eligible',
    ],
    default_actions: [
      {
        action_id: 'ACT_TRAUMA_CAT_TOURNIQUET_AND_QUIKCLOT_KAOLIN',
        label: 'Apply CAT tourniquet proximal to arterial bleed and QuikClot kaolin hemostatic dressing',
        category: 'HEMORRHAGE_CONTROL',
        delta_rho_per_hour: 0.35,
      },
      {
        action_id: 'ACT_HEMORRHAGE_TXA_1G_IV_WITHIN_3H',
        label: 'Administer Tranexamic Acid (TXA) 1 g IV over 10 min within 3.0 h of injury',
        category: 'PHARMACOLOGICAL_HEMOSTATIC',
        delta_rho_per_hour: 0.25,
      },
      {
        action_id: 'ACT_BALANCED_RESUSCITATION_WARM_CRYSTALLOID_CALCIUM',
        label: 'Balanced resuscitation with warmed isotonic crystalloid and calcium replacement',
        category: 'RESUSCITATION',
        delta_rho_per_hour: 0.2,
      },
    ],
  },
  PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS: {
    playbook_id: 'PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS',
    short_code: '#18',
    short_label: 'TAMPONADE',
    title: 'Playbook #18: Torso Shock, Pericardiocentesis & Hemoperitoneum Protocol',
    normative_clause: 'NASA-STD-3001 [V2 7043] / ExMC eFAST Torso Shock & Pericardiocentesis',
    default_causal_chain: [
      'torso_shock -> eFAST_tamponade_or_hemoperitoneum_triage',
      'tamponade_risk -> closed_0g_pericardiocentesis_with_Gate1_lock',
    ],
    default_actions: [
      {
        action_id: 'ACT_POCUS_GUIDED_PERICARDIOCENTESIS_CLOSED_SYRINGE',
        label: 'Perform POCUS-guided closed 3-way stopcock pericardiocentesis with pigtail drain (0g aerosol containment)',
        category: 'INVASIVE_PROCEDURE',
        delta_rho_per_hour: 0.4,
      },
      {
        action_id: 'ACT_HEMOPERITONEUM_TXA_PELVIC_BINDER_PERMISSIVE_HYPOTENSION',
        label: 'Initiate TXA, pelvic binder stabilization, and permissive hypotension (target SBP 80-90 mmHg)',
        category: 'HEMORRHAGE_CONTROL',
        delta_rho_per_hour: 0.3,
      },
    ],
  },
  PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G: {
    playbook_id: 'PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G',
    short_code: '#19',
    short_label: 'ABDOMEN',
    title: 'Playbook #19: Conservative 0g Acute Abdomen (NOM) Protocol',
    normative_clause: 'NASA-STD-3001 [V1 3006] / ExMC Conservative Acute Abdomen NOM in 0g',
    default_causal_chain: [
      'acute_abdomen_0g -> open_laparotomy_forbidden_in_0g',
      'antibiotic_first_NOM -> POCUS_percutaneous_drain_if_abscess',
    ],
    default_actions: [
      {
        action_id: 'ACT_ABDOMEN_0G_ANTIBIOTIC_FIRST_ERTAPENEM_OR_PIPTAZO',
        label: 'Initiate antibiotic-first NOM: Ertapenem 1 g IV/IM q24h or Piperacillin-Tazobactam (Gate 5 allergy check)',
        category: 'PHARMACOLOGICAL_ANTIMICROBIAL',
        delta_rho_per_hour: 0.25,
      },
      {
        action_id: 'ACT_BOWEL_REST_NG_SUCTION_IV_HYDRATION',
        label: 'Enforce NPO bowel rest, closed nasogastric decompression suction, and IV hydration',
        category: 'CLINICAL_COUNTERMEASURE',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE: {
    playbook_id: 'PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE',
    short_code: '#20',
    short_label: 'SPINE/MSK',
    title: 'Playbook #20: EVA Musculoskeletal, Lumbar Spine & Femoral Fracture Protocol',
    normative_clause: 'NASA-STD-3001 [V1 3002] / ExMC EVA Musculoskeletal & Spine Stabilization',
    default_causal_chain: [
      'eva_musculoskeletal_trauma -> Gate4_EVA_no_go_active',
      'limb_or_spine_injury -> splint_neurovascular_and_multimodal_analgesia',
    ],
    default_actions: [
      {
        action_id: 'ACT_EVA_GLOVE_HUT_DECOMPRESSION_SPLINT',
        label: 'Remove EVA glove/HUT pressure source, splint affected extremity, and inspect neurovascular status',
        category: 'MECHANICAL_INTERVENTION',
        delta_rho_per_hour: 0.15,
      },
      {
        action_id: 'ACT_LUMBAR_DISC_NEURO_CAUDA_EQUINA_SCREEN',
        label: 'Perform focused L1-L5 radiculopathy and cauda equina neurological screen',
        category: 'DIAGNOSTIC_VERIFICATION',
        delta_rho_per_hour: 0.05,
      },
      {
        action_id: 'ACT_MSK_MULTIMODAL_ANALGESIA_ACETAMINOPHEN_FENTANYL',
        label: 'Administer multimodal analgesia (Acetaminophen / Intranasal Fentanyl; Ketorolac gated by Gate 5)',
        category: 'PHARMACOLOGICAL_ANALGESIA',
        delta_rho_per_hour: 0.1,
      },
    ],
  },
  PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY: {
    playbook_id: 'PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY',
    short_code: '#21',
    short_label: 'DENTAL',
    title: "Playbook #21: Dental & Maxillofacial Emergency (Ludwig's Angina) Protocol",
    normative_clause: 'NASA-STD-3001 [V2 7043] / ExMC Dental & Maxillofacial Airway Emergency',
    default_causal_chain: [
      'dental_maxillofacial_emergency -> barodontalgia_or_abscess_triage',
      'ludwigs_angina_threat -> early_igel_airway_and_IV_antibiotics',
    ],
    default_actions: [
      {
        action_id: 'ACT_DENTAL_IRM_ZINC_OXIDE_EUGENOL_TEMP_FILLING',
        label: 'Place IRM zinc oxide-eugenol temporary restoration for barodontalgia or crown/root defect',
        category: 'DENTAL_INTERVENTION',
        delta_rho_per_hour: 0.1,
      },
      {
        action_id: 'ACT_DENTAL_INFERIOR_ALVEOLAR_LIDOCAINE_BLOCK',
        label: 'Administer inferior alveolar nerve block with Lidocaine for acute dental pain control',
        category: 'PHARMACOLOGICAL_ANALGESIA',
        delta_rho_per_hour: 0.1,
      },
      {
        action_id: 'ACT_DENTAL_ABSCESS_AMOX_CLAV_OR_CLINDAMYCIN',
        label: 'Initiate Amoxicillin-Clavulanate or Clindamycin (Gate 5 allergy check) for odontogenic abscess',
        category: 'PHARMACOLOGICAL_ANTIMICROBIAL',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN: {
    playbook_id: 'PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN',
    short_code: '#22',
    short_label: 'OCULAR FB',
    title: 'Playbook #22: Ocular Foreign Body, Chemical Burn & Seidel Check Protocol',
    normative_clause: 'NASA-STD-3001 [V1 3003] / ExMC Ocular Foreign Body & Chemical Burn Lavage',
    default_causal_chain: [
      'ocular_chemical_or_fb_injury -> fluorescein_slit_lamp_Seidel_check',
      'seidel_positive -> rigid_Fox_shield_zero_pressure_abort_irrigation',
    ],
    default_actions: [
      {
        action_id: 'ACT_OCULAR_TOPICAL_TETRACAINE_ANESTHETIC',
        label: 'Instill topical Tetracaine ophthalmic anesthetic to facilitate examination',
        category: 'PHARMACOLOGICAL_ANALGESIA',
        delta_rho_per_hour: 0.05,
      },
      {
        action_id: 'ACT_FLUORESCEIN_SLIT_LAMP_SEIDEL_PERFORATION_CHECK',
        label: 'Perform fluorescein slit-lamp exam and Seidel test for globe perforation',
        category: 'DIAGNOSTIC_VERIFICATION',
        delta_rho_per_hour: 0.05,
      },
      {
        action_id: 'ACT_ERYTHROMYCIN_OR_MOXIFLOXACIN_OPHTHALMIC',
        label: 'Administer Erythromycin ointment or Moxifloxacin ophthalmic drops',
        category: 'PHARMACOLOGICAL_ANTIMICROBIAL',
        delta_rho_per_hour: 0.1,
      },
    ],
  },
  PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY: {
    playbook_id: 'PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY',
    short_code: '#23',
    short_label: 'ANAPHYLAXIS',
    title: 'Playbook #23: Anaphylaxis & Airway Emergency Protocol',
    normative_clause: 'NASA-STD-3001 [V2 7043] / ExMC Anaphylaxis & Supraglottic Airway Capability',
    default_causal_chain: [
      'anaphylaxis_suspected -> IM_epinephrine_priority_0',
      'airway_or_bronchospasm -> 100pct_O2_igel_and_crystalloid_bolus',
    ],
    default_actions: [
      {
        action_id: 'ACT_ANAPHYLAXIS_EPINEPHRINE_03_05MG_IM_THIGH',
        label: 'IMMEDIATE (Index 0): Administer Epinephrine 0.3-0.5 mg IM anterolateral thigh q5-15 min',
        category: 'EMERGENCY_RESUSCITATION',
        delta_rho_per_hour: 0.45,
      },
      {
        action_id: 'ACT_AIRWAY_100PCT_O2_AND_IGEL_SUPRAGLOTTIC_READY',
        label: 'Deliver 100% O2 and stage i-gel supraglottic airway',
        category: 'AIRWAY_EMERGENCY',
        delta_rho_per_hour: 0.2,
      },
      {
        action_id: 'ACT_ISOTONIC_CRYSTALLOID_BOLUS_20ML_KG',
        label: 'Infuse 20 mL/kg isotonic crystalloid bolus for anaphylactic hypotension',
        category: 'RESUSCITATION',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR: {
    playbook_id: 'PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR',
    short_code: '#24',
    short_label: '0G CPR',
    title: 'Playbook #24: Microgravity Cardiac Arrest & 0g CPR Protocol',
    normative_clause: 'NASA-STD-3001 [V2 7043] / ExMC Microgravity Evetts-Russomano CPR & AED',
    default_causal_chain: [
      'pulseless_cardiac_arrest_0g -> Evetts_Russomano_or_Handstand_CPR',
      'CMRS_stabilization + AED_hull_isolation -> ACLS_epinephrine_amiodarone',
    ],
    default_actions: [
      {
        action_id: 'ACT_0G_CPR_IMMEDIATE_EVETTS_RUSSOMANO_OR_HANDSTAND',
        label: 'Initiate immediate 0g chest compressions (100-120/min, 50 mm depth) via Evetts-Russomano or Handstand technique',
        category: 'EMERGENCY_RESUSCITATION',
        delta_rho_per_hour: 0.5,
      },
      {
        action_id: 'ACT_DEPLOY_CMRS_RESTRAINT_STRAPS',
        label: 'Deploy Crew Medical Restraint System (CMRS) straps to stabilize patient and rescuer',
        category: 'MECHANICAL_INTERVENTION',
        delta_rho_per_hour: 0.2,
      },
      {
        action_id: 'ACT_AED_ELECTRICAL_ISOLATION_FROM_HULL_BEFORE_SHOCK',
        label: 'Verify AED electrical isolation from spacecraft hull before shock delivery',
        category: 'ELECTRICAL_SAFETY_CRITICAL',
        delta_rho_per_hour: 0.3,
      },
    ],
  },
  PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS: {
    playbook_id: 'PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS',
    short_code: '#25',
    short_label: 'RETENTION',
    title: 'Playbook #25: Acute Urinary Retention (AUR) POCUS Protocol',
    normative_clause: 'NASA-STD-3001 [V2 6026] / ExMC Acute Urinary Retention & POCUS Catheterization',
    default_causal_chain: [
      'POCUS_bladder_volume >= 500 mL -> acute_urinary_retention',
      'closed_foley_decompression -> Gate6_check_before_suprapubic_cystostomy',
    ],
    default_actions: [
      {
        action_id: 'ACT_AUR_STERILE_CLOSED_FOLEY_CATHETERIZATION',
        label: 'Perform sterile closed-system Foley catheterization with gradual decompression in 0g',
        category: 'UROLOGICAL_INTERVENTION',
        delta_rho_per_hour: 0.3,
      },
      {
        action_id: 'ACT_AUR_TAMSULOSIN_04MG_STOP_ANTICHOLINERGICS',
        label: 'Initiate Tamsulosin 0.4 mg PO daily and discontinue anticholinergic medications',
        category: 'PHARMACOLOGICAL_UROLOGY',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_26_ACUTE_RADIATION_SYNDROME: {
    playbook_id: 'PLAYBOOK_26_ACUTE_RADIATION_SYNDROME',
    short_code: '#26',
    short_label: 'ARS/G-CSF',
    title: 'Playbook #26: Acute Radiation Syndrome (ARS) Hematologic Nadir & Cytokine Rescue',
    normative_clause: 'NASA-STD-3001 [V1 4001] / ExMC SPE Acute Radiation Syndrome Biodosimetry',
    default_causal_chain: [
      'SPE_BFO_dose >= 1.0 Gy -> ARS_hematologic_nadir_kinetics',
      'ANC < 0.5 K/uL or PLT < 75 K/uL -> Gate6_radiation_neutropenic_invasive_locked',
    ],
    default_actions: [
      {
        action_id: 'ACT_ARS_SPE_STORM_SHELTER_AND_BIODOSIMETRY',
        label: 'Maintain SPE radiation storm shelter and serial ALC/CBC biodosimetry monitoring',
        category: 'RADIATION_PROTECTION',
        delta_rho_per_hour: 0.15,
      },
      {
        action_id: 'ACT_ARS_FILGRASTIM_G_CSF_DAILY',
        label: 'Administer Filgrastim (G-CSF) 5 mcg/kg/day SC until ANC recovery > 1.0 K/uL',
        category: 'PHARMACOLOGICAL_UNLOCKED',
        delta_rho_per_hour: 0.3,
      },
      {
        action_id: 'ACT_ARS_THROMBOCYTOPENIA_BLEEDING_PRECAUTIONS',
        label: 'Enforce Gate 6 non-emergent invasive procedure lock and strict NSAID/anticoagulant avoidance',
        category: 'CLINICAL_SAFETY_GATE_OVERRIDE',
        delta_rho_per_hour: 0.15,
      },
    ],
  },
  PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE: {
    playbook_id: 'PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE',
    short_code: '#27',
    short_label: 'TOX/SMAC',
    title: 'Playbook #27: Aerospace Toxicology, Pyrolysis & Regolith Exposure Protocol',
    normative_clause: 'NASA-STD-3001 [V2 6001] / JSC SMAC Spacecraft Toxicology (NH3/MMH/N2O4/CO/HCN)',
    default_causal_chain: [
      'SMAC_or_IDLH_exceedance -> PBA_isolation_and_decontamination',
      'MMH/MetHb/HCN/ClO4- -> targeted_antidote_with_Gate5B_G6PD_guard',
    ],
    default_actions: [
      {
        action_id: 'ACT_TOX_DON_PBA_QDM_ISOLATE_THERMAL_LOOP',
        label: 'Don PBA/QDM immediately and isolate leaking NH3 thermal control loop',
        category: 'ENVIRONMENTAL_ISOLATION',
        delta_rho_per_hour: 0.3,
      },
      {
        action_id: 'ACT_TOX_OCULAR_DERMAL_DECONTAMINATION',
        label: 'Perform closed-loop ocular/dermal saline decontamination for toxicant exposure',
        category: 'DECONTAMINATION',
        delta_rho_per_hour: 0.22,
      },
      {
        action_id: 'ACT_PYROLYSIS_DON_PBA_100PCT_NORMOBARIC_O2',
        label: 'Don PBA and deliver 100% normobaric O2 for accelerated COHb washout',
        category: 'AIRWAY_RESPIRATORY_SUPPORT',
        delta_rho_per_hour: 0.28,
      },
    ],
  },
  PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY: {
    playbook_id: 'PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY',
    short_code: '#28',
    short_label: 'EVA/DCS',
    title: 'Playbook #28: EVA Decompression Sickness, Pre-Breathe Lock & Suit Emergency',
    normative_clause: 'NASA-STD-3001 [V1 3001] / ExMC EVA Suit Water Intrusion & Type II DCS/AGE',
    default_causal_chain: [
      'helmet_water_or_DCS_or_R360 > 1.40 -> Gate4B_EVA_no_go',
      'TypeII_DCS_or_AGE -> airlock_BTA_hyperbaric_recompression_100pct_O2',
    ],
    default_actions: [
      {
        action_id: 'ACT_EVA_PARMITANO_WATER_INTRUSION_IMMEDIATE_ABORT',
        label: 'PARMITANO PROTOCOL: Abort EVA immediately, minimize head-nod water migration, translate to airlock and prepare post-repress airway suction',
        category: 'EVA_SUIT_LIFE_THREAT_ABORT',
        delta_rho_per_hour: 0.45,
      },
      {
        action_id: 'ACT_DCS_TYPE2_AGE_HYPERBARIC_RECOMPRESSION_BTA_AIRLOCK',
        label: 'Initiate 100% O2 + airlock hyperbaric recompression via Bends Treatment Adapter (22.7 psi / USN TT6)',
        category: 'HYPERBARIC_EMERGENCY',
        delta_rho_per_hour: 0.4,
      },
      {
        action_id: 'ACT_EVA_PREBREATHE_LOCK_CAMPOUT_OR_ISLE_PROTOCOL',
        label: 'EVA LOCK: Conkin R360 > 1.40 requires campout / ISLE exercise 100% O2 pre-breathe before depressurization',
        category: 'EVA_PREBREATHE_LOCK',
        delta_rho_per_hour: 0.25,
      },
    ],
  },
  PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS: {
    playbook_id: 'PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS',
    short_code: '#29',
    short_label: 'BMED CRISIS',
    title: 'Playbook #29: Acute Psychiatric Crisis, Delirium Exclusion & 0g Rapid Tranquilization',
    normative_clause: 'NASA-STD-3001 [V1 3003] / ExMC Behavioral Health & Organic Delirium Exclusion',
    default_causal_chain: [
      'acute_agitation_or_self_harm -> Gate7A_organic_delirium_exclusion_first',
      'Gate7B_CMRS_restraint_only_if_imminent_harm + Gate7C_QTc_guard',
    ],
    default_actions: [
      {
        action_id: 'ACT_GATE7_TREAT_REVERSIBLE_ORGANIC_DELIRIUM_CAUSE_FIRST',
        label: 'Gate 7A: Treat reversible organic/toxic-metabolic delirium cause first (O2, ECLSS CO2 scrubber, sepsis antibiotics, or toxicant isolation)',
        category: 'CLINICAL_SAFETY_GATE_OVERRIDE',
        delta_rho_per_hour: 0.45,
      },
      {
        action_id: 'ACT_BMED_VERBAL_DEESCALATION_1ON1_WATCH_AIRLOCK_LOCKOUT',
        label: 'Non-confrontational verbal de-escalation, 1-on-1 crew watch, software interlock on airlock/depressurization/propellant valves',
        category: 'BEHAVIORAL_SAFETY',
        delta_rho_per_hour: 0.25,
      },
      {
        action_id: 'ACT_BMED_OLANZAPINE_5_10MG_ODT',
        label: 'Administer Olanzapine 5-10 mg ODT (rapid oral dissolving tablet; zero 0g liquid aspiration risk)',
        category: 'PHARMACOLOGICAL_TRANQUILIZATION',
        delta_rho_per_hour: 0.3,
      },
    ],
  },
  PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS: {
    playbook_id: 'PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS',
    short_code: '#30',
    short_label: 'FEMALE POCUS',
    title: 'Playbook #30: Female Pelvic & Urogyn POCUS Triage Protocol',
    normative_clause: 'NASA-STD-3001 [V1 3001] / ExMC Sex-Specific Female Pelvic & Urogyn POCUS',
    default_causal_chain: [
      'pelvic_emergency_flag -> POCUS_doppler_cul_de_sac_and_beta_hCG',
      'ectopic_or_torsion -> TXA_resuscitation_or_detorsion_tele_gyn_consult',
    ],
    default_actions: [
      {
        action_id: 'ACT_ECTOPIC_HEMORRHAGE_TXA_IV_RESUSCITATION_TELE_SURGICAL_CONSULT',
        label: 'Administer TXA, isotonic IV resuscitation, and urgent tele-surgical consultation',
        category: 'EMERGENCY_RESUSCITATION',
        delta_rho_per_hour: 0.35,
      },
      {
        action_id: 'ACT_OVARIAN_TORSION_ANALGESIA_ULTRASOUND_DETORSION_PROTOCOL',
        label: 'Provide analgesia and initiate ultrasound-guided detorsion / tele-gynecologic protocol',
        category: 'GYNECOLOGIC_EMERGENCY',
        delta_rho_per_hour: 0.25,
      },
      {
        action_id: 'ACT_FEMALE_UTI_CEFTRIAXONE_OR_CIPROFLOXACIN_HYDRATION',
        label: 'Initiate Ceftriaxone or Ciprofloxacin (Gate 5 check) with aggressive hydration',
        category: 'PHARMACOLOGICAL_ANTIMICROBIAL',
        delta_rho_per_hour: 0.2,
      },
    ],
  },
};

export const AEROSPACE_360_ONLY_PLAYBOOK_LIST: PlaybookCatalogEntry<Aerospace360PlaybookId>[] = [
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_26_ACUTE_RADIATION_SYNDROME,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS,
  AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS,
];

export const PLAYBOOK_360_CATALOG: Record<PlaybookId, PlaybookCatalogEntry<PlaybookId>> = {
  ...CRYSTALLIZED_PLAYBOOK_CATALOG,
  ...AEROSPACE_360_PLAYBOOK_CATALOG,
};

export const ALL_360_PLAYBOOK_LIST: PlaybookCatalogEntry<PlaybookId>[] = [
  ...ALL_CRYSTALLIZED_PLAYBOOK_LIST,
  ...AEROSPACE_360_ONLY_PLAYBOOK_LIST,
];

export const PLAYBOOK_360_BY_SHORT_CODE: Record<
  Playbook360ShortCode,
  PlaybookCatalogEntry<PlaybookId>
> = {
  ...PLAYBOOK_BY_SHORT_CODE,
  '#16': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_16_SEPSIS_SEPTIC_SHOCK,
  '#17': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_17_HEMORRHAGIC_TRAUMA_TXA,
  '#18': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_18_TORSO_SHOCK_PERICARDIOCENTESIS,
  '#19': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_19_CONSERVATIVE_ACUTE_ABDOMEN_0G,
  '#20': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_20_EVA_MUSCULOSKELETAL_SPINE_FRACTURE,
  '#21': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_21_DENTAL_MAXILLOFACIAL_EMERGENCY,
  '#22': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_22_OCULAR_FOREIGN_BODY_CHEMICAL_BURN,
  '#23': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_23_ANAPHYLAXIS_AIRWAY_EMERGENCY,
  '#24': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_24_MICROGRAVITY_CARDIAC_ARREST_CPR,
  '#25': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_25_ACUTE_URINARY_RETENTION_POCUS,
  '#26': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_26_ACUTE_RADIATION_SYNDROME,
  '#27': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_27_AEROSPACE_TOXICOLOGY_EXPOSURE,
  '#28': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_28_EVA_DCS_AND_SUIT_EMERGENCY,
  '#29': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_29_BMED_PSYCHIATRIC_CRISIS,
  '#30': AEROSPACE_360_PLAYBOOK_CATALOG.PLAYBOOK_30_FEMALE_PELVIC_UROGYN_POCUS,
};

export function getPlaybookDomainForShortCode(shortCode: Playbook360ShortCode): Playbook360DomainId {
  for (const tab of PLAYBOOK_360_DOMAIN_TABS) {
    if (tab.shortCodes.includes(shortCode)) return tab.id;
  }
  return 'CARDIORESPIRATORY';
}

export function isCrystallizedPlaybookId(id: string | null | undefined): id is CrystallizedPlaybookId {
  return typeof id === 'string' && id in CRYSTALLIZED_PLAYBOOK_CATALOG;
}

export function isPlaybook360Id(id: string | null | undefined): id is PlaybookId {
  return typeof id === 'string' && id in PLAYBOOK_360_CATALOG;
}

export function getCatalogEntry(id: string | null | undefined): PlaybookCatalogEntry<PlaybookId> | undefined {
  if (!id) return undefined;
  if (isPlaybook360Id(id)) {
    return PLAYBOOK_360_CATALOG[id];
  }
  const normalized = id.trim();
  if (normalized in PLAYBOOK_360_BY_SHORT_CODE) {
    return PLAYBOOK_360_BY_SHORT_CODE[normalized as Playbook360ShortCode];
  }
  return ALL_360_PLAYBOOK_LIST.find(
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
