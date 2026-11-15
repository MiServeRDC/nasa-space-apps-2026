// Pure deterministic Branched Safety Gate DAG partitioner & 5-Gate Hardware Interlock evaluator
// for `PhaseActDeck` (`03 ACT`).
// Zero runtime relative imports so `node --test --experimental-strip-types` can import directly.

import type {
  AnatomicalRegionWireId,
  CountermeasureAction,
  ExtendedSafetyGates,
  SafetyGatesState,
} from '../types/telemetry';
import type { DiagnosticImagingTab } from '../types/workbench';

export const GATE2_MAX_SBP_DROP_MMHG = 15.0;
export const GATE2_MAX_SAFE_HR_BPM = 115.0;
export const GATE3_MAX_SAFE_GAI_PCT = 12.0;
export const SPE_STORM_RAD_MSV_D = 1.5;
export const PRESS_HOLD_DURATION_MS = 1500;

export type SafetyGateCode =
  | 'GATE_1_ANTICOAG_LOCK'
  | 'GATE_2_LBNP_AUTO_VENT'
  | 'GATE_3_ANKLE_DAMPING'
  | 'GATE_4A_THORACOSTOMY_LOCK'
  | 'GATE_4B_EVA_NO_GO';

export type ExtendedSafetyGateCode =
  | 'GATE_5A_NSAID_RENAL_BLEED'
  | 'GATE_5B_ALLERGY_G6PD_QTC'
  | 'GATE_5C_EXMC_POTENCY_SUB'
  | 'GATE_6_ARS_INVASIVE_LOCK'
  | 'GATE_7_BMED_DELIRIUM_GUARD';

export type UnifiedSafetyGateCode = SafetyGateCode | ExtendedSafetyGateCode;

export interface InhibitedPlaybookAction {
  action: CountermeasureAction;
  gateCode: UnifiedSafetyGateCode;
  gateTitle: string;
  rationale: string;
  verifyLabel: string;
  verifyTargetTab: DiagnosticImagingTab;
  verifyRegion: AnatomicalRegionWireId;
}

export interface AutonomousSafetyOverride {
  id: string;
  gateCode: UnifiedSafetyGateCode | 'SPE_STORM_SHELTER';
  severity: 'CRITICAL' | 'WARNING';
  headline: string;
  detail: string;
}

export interface InterlockGateSummaryItem {
  code: SafetyGateCode;
  shortLabel: string;
  status: 'LOCKED' | 'ARMED' | 'TRIGGERED' | 'UNLOCKED' | 'UNAVAILABLE';
  detail: string;
}

export interface Gate1To7MatrixItem {
  code: UnifiedSafetyGateCode;
  pillCode: '1' | '2' | '3' | '4A' | '4B' | '5A' | '5B' | '5C' | '6' | '7';
  shortLabel: string;
  status: 'LOCKED' | 'ARMED' | 'TRIGGERED' | 'UNLOCKED' | 'UNAVAILABLE' | 'ACTIVE';
  detail: string;
  rationale: string;
}

export interface PartitionedSafetyDagResult {
  unlockedActions: CountermeasureAction[];
  inhibitedActions: InhibitedPlaybookAction[];
  autonomousOverrides: AutonomousSafetyOverride[];
  interlockMatrix: InterlockGateSummaryItem[];
  extendedInterlockMatrix: Gate1To7MatrixItem[];
  gates1To7Matrix: Gate1To7MatrixItem[];
  preSyncopeTriggered: boolean;
}

export interface SafetyDagPartitionContext {
  pocusThrombusConfirmed?: boolean | null;
  lbnpActive?: boolean;
  lbnpMmhg?: number | null;
  sbpDropMmhg?: number | null;
  hrBpm?: number | null;
  gaiPct?: number | null;
  radiationDoseMsvD?: number | null;
  extendedGates?: Partial<ExtendedSafetyGates> | null;
}

export function isAnticoagulantCandidate(
  action: Pick<CountermeasureAction, 'action_id' | 'category'>,
): boolean {
  const category = action.category.toUpperCase();
  const id = action.action_id.toUpperCase();
  return category === 'PHARMACOLOGICAL_ANTICOAGULANT' || id.includes('ANTICOAG');
}

export function isInvasiveDecompressionCandidate(
  action: Pick<CountermeasureAction, 'action_id' | 'category'>,
): boolean {
  const id = action.action_id.toUpperCase();
  return id.includes('THORACOSTOMY') || id.includes('NEEDLE_DECOMPRESSION');
}

/**
 * Partitions candidate MedOps Playbook actions into:
 * - `unlockedActions`: Safe / verified countermeasures (including non-anticoagulant drugs
 *   such as `#10` Oral Potassium Citrate & `#13` Valacyclovir even when Gate 1 is locked)
 * - `inhibitedActions`: Hard-gated actions rendered on `.ares-inhibited-surface` with
 *   `aria-disabled="true"` and `1-Click Verify ->` diagnostic deep-links
 * - `autonomousOverrides`: Non-blocking top safety-override banner descriptors (`Gate 2` LBNP
 *   auto-vent to `0 mmHg`, `Gate 3` `0.38g` ankle damping, `Gate 4B` EVA NO-GO, `SPE` shelter)
 */
export function partitionPlaybookActionsWithSafetyGates(
  candidateActions: readonly CountermeasureAction[],
  rawGates: Partial<SafetyGatesState> | null | undefined,
  context: SafetyDagPartitionContext = {},
): PartitionedSafetyDagResult {
  const pocusVerified = context.pocusThrombusConfirmed === true;
  const anticoagLocked = rawGates?.anticoagulant_contraindicated_bleeding_risk === true ||
    (rawGates?.anticoagulant_lock_active !== undefined
      ? Boolean(rawGates.anticoagulant_lock_active)
      : !pocusVerified);

  const invasiveLocked = rawGates?.gate4_invasive_decompression_locked !== false;

  const lbnpMmhg =
    typeof context.lbnpMmhg === 'number' && Number.isFinite(context.lbnpMmhg)
      ? context.lbnpMmhg
      : 0;
  const lbnpActive = Boolean(context.lbnpActive) || lbnpMmhg < 0;

  const sbpDrop =
    typeof context.sbpDropMmhg === 'number' && Number.isFinite(context.sbpDropMmhg)
      ? context.sbpDropMmhg
      : null;
  const hr =
    typeof context.hrBpm === 'number' && Number.isFinite(context.hrBpm)
      ? context.hrBpm
      : null;

  const preSyncopeTriggered = Boolean(rawGates?.lbnp_auto_vent_triggered) || (lbnpActive &&
    ((sbpDrop !== null && sbpDrop > GATE2_MAX_SBP_DROP_MMHG) || (hr !== null && hr > GATE2_MAX_SAFE_HR_BPM)));

  const gaiPct =
    typeof context.gaiPct === 'number' && Number.isFinite(context.gaiPct)
      ? context.gaiPct
      : null;
  const ankleDampingActive =
    Boolean(rawGates?.eva_suit_damping_active) || (gaiPct !== null && gaiPct > GATE3_MAX_SAFE_GAI_PCT);

  const evaNoGoActive = Boolean(rawGates?.gate4_eva_fitness_no_go);
  const radDose =
    typeof context.radiationDoseMsvD === 'number' && Number.isFinite(context.radiationDoseMsvD)
      ? context.radiationDoseMsvD
      : 0;

  const unlockedActions: CountermeasureAction[] = [];
  const inhibitedActions: InhibitedPlaybookAction[] = [];
  const autonomousOverrides: AutonomousSafetyOverride[] = [];

  for (const action of candidateActions) {
    if (anticoagLocked && isAnticoagulantCandidate(action)) {
      inhibitedActions.push({
        action,
        gateCode: 'GATE_1_ANTICOAG_LOCK',
        gateTitle: 'Gate 1: Anticoagulation Hardware Interlock',
        rationale:
          'Systemic anticoagulants prohibited for slow venous flow alone; requires tactile B-Mode POCUS confirmation of intraluminal thrombus to prevent fatal intracranial hemorrhage in microgravity.',
        verifyLabel: '1-Click Verify POCUS IJV ->',
        verifyTargetTab: 'POCUS_IJV',
        verifyRegion: 'InternalJugularVein',
      });
      continue;
    }

    if (invasiveLocked && isInvasiveDecompressionCandidate(action)) {
      inhibitedActions.push({
        action,
        gateCode: 'GATE_4A_THORACOSTOMY_LOCK',
        gateTitle: 'Gate 4A: Invasive Thoracic Decompression Lock',
        rationale:
          'Needle decompression / finger thoracostomy prohibited until eFAST ultrasound confirms absent pleural lung sliding.',
        verifyLabel: '1-Click Verify Thoracic eFAST ->',
        verifyTargetTab: 'OPTICAL_AND_MRI',
        verifyRegion: 'HeartCardioAutonomic',
      });
      continue;
    }

    unlockedActions.push(action);
  }

  if (preSyncopeTriggered) {
    const hrNote = hr !== null ? `${hr.toFixed(0)} bpm` : 'N/A';
    autonomousOverrides.push({
      id: 'override-gate2-lbnp-vent',
      gateCode: 'GATE_2_LBNP_AUTO_VENT',
      severity: 'CRITICAL',
      headline: 'GATE 2 AUTONOMOUS OVERRIDE: LBNP AUTO-VENT TO 0 MMHG',
      detail: `Vent condition reported (SBP drop ${sbpDrop?.toFixed(1) ?? 'N/A'} mmHg; HR ${hrNote}). Vent requested/reported; physical device acknowledgement is unavailable.`,
    });
    if (!unlockedActions.some((a) => a.action_id === 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG')) {
      unlockedActions.unshift({
        action_id: 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG',
        label: `SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (SBP drop ${sbpDrop?.toFixed(1) ?? 'N/A'} mmHg / HR ${hrNote})`,
        category: 'HARD_SAFETY_GATE_OVERRIDE',
        delta_rho_per_hour: 0.35,
      });
    }
  }

  if (ankleDampingActive) {
    autonomousOverrides.push({
      id: 'override-gate3-ankle-damping',
      gateCode: 'GATE_3_ANKLE_DAMPING',
      severity: 'WARNING',
      headline: 'GATE 3 BIOMECHANICAL OVERRIDE: 0.38G EVA ANKLE DAMPING +25%',
      detail: `Gait Asymmetry Index (${gaiPct?.toFixed(1) ?? 'N/A'}% > 12.0%) detected. Damping restriction/request reported; physical device acknowledgement unavailable.`,
    });
    if (!unlockedActions.some((a) => a.action_id === 'ACT_EVA_SUIT_ANKLE_DAMPING_038G')) {
      unlockedActions.push({
        action_id: 'ACT_EVA_SUIT_ANKLE_DAMPING_038G',
        label: `SAFETY GATE 3 ACTIVE: Lock plyometric impact & set Martian EVA suit ankle damping +25% (GAI = ${gaiPct?.toFixed(1) ?? 'N/A'}% > 12.0%)`,
        category: 'BIOMECHANICAL_SAFETY_GATE',
        delta_rho_per_hour: 0.1,
      });
    }
  }

  if (evaNoGoActive) {
    autonomousOverrides.push({
      id: 'override-gate4b-eva-nogo',
      gateCode: 'GATE_4B_EVA_NO_GO',
      severity: 'CRITICAL',
      headline: 'GATE 4B DEONTIC LOCK: EVA FITNESS NO-GO ACTIVE',
      detail: 'Hemodynamic / neuro-vestibular readiness below EVA egress safety threshold.',
    });
  }

  if (radDose > SPE_STORM_RAD_MSV_D) {
    autonomousOverrides.push({
      id: 'override-spe-storm-shelter',
      gateCode: 'SPE_STORM_SHELTER',
      severity: 'CRITICAL',
      headline: `CSA CANS SPE INTERLOCK: ${radDose.toFixed(2)} mSv/d (> 1.50 mSv/d)`,
      detail: 'EVA airlock forbidden; relocate crew to polyethylene/water-shielded storm shelter immediately.',
    });
  }

  const interlockMatrix: InterlockGateSummaryItem[] = [
    {
      code: 'GATE_1_ANTICOAG_LOCK',
      shortLabel: 'GATE 1: ANTICOAG',
      status: anticoagLocked ? 'LOCKED' : 'UNLOCKED',
      detail: anticoagLocked
        ? rawGates?.anticoagulant_contraindicated_bleeding_risk ? 'Backend bleeding-risk contraindication' : 'Awaiting POCUS thrombus confirmation'
        : 'POCUS intraluminal thrombus verified',
    },
    {
      code: 'GATE_2_LBNP_AUTO_VENT',
      shortLabel: 'GATE 2: LBNP VENT',
      status: preSyncopeTriggered ? 'TRIGGERED' : 'ARMED',
      detail: preSyncopeTriggered
        ? 'Vent condition reported; physical device acknowledgement unavailable'
        : 'Guarding dSBP <= 15 mmHg & HR <= 115 bpm',
    },
    {
      code: 'GATE_3_ANKLE_DAMPING',
      shortLabel: 'GATE 3: 0.38G SUIT',
      status: ankleDampingActive ? 'TRIGGERED' : gaiPct === null ? 'UNAVAILABLE' : 'ARMED',
      detail: ankleDampingActive
        ? `GAI ${gaiPct?.toFixed(1) ?? 'N/A'}% > 12%: +25% ankle damping`
        : gaiPct === null ? 'GAI unavailable; no nominal gait inferred' : `GAI ${gaiPct.toFixed(1)}% <= 12.0%`,
    },
    {
      code: 'GATE_4A_THORACOSTOMY_LOCK',
      shortLabel: 'GATE 4A: eFAST',
      status: invasiveLocked ? 'LOCKED' : 'UNLOCKED',
      detail: invasiveLocked
        ? 'Invasive decompression locked pending eFAST'
        : 'Absent lung sliding verified on eFAST',
    },
    {
      code: 'GATE_4B_EVA_NO_GO',
      shortLabel: 'GATE 4B: EVA GO/NO-GO',
      status: evaNoGoActive ? 'TRIGGERED' : 'ARMED',
      detail: evaNoGoActive ? 'EVA egress inhibited' : 'No EVA restriction reported by this gate',
    },
  ];

  const ext = context.extendedGates ?? null;
  const gate5aTriggered = Boolean(ext?.gate5_nsaid_renal_bleeding_locked);
  const gate5bTriggered = Boolean(ext?.gate5_allergy_or_qtc_locked);
  const gate5cActive = Boolean(ext?.gate5_formulary_substitution_active);
  const gate6Triggered = Boolean(ext?.gate6_radiation_neutropenic_invasive_locked);
  const gate7Triggered = Boolean(ext?.gate7_bmed_delirium_or_restraint_guard_active);

  if (gate5aTriggered) {
    autonomousOverrides.push({
      id: 'override-gate5a-nsaid-renal-bleed',
      gateCode: 'GATE_5A_NSAID_RENAL_BLEED',
      severity: 'WARNING',
      headline: 'GATE 5A INTERLOCK: NSAID / KETOROLAC CONTRAINDICATED',
      detail: 'Thrombocytopenia (PLT < 100 K/uL), AKI risk (Cr > 1.30 / eGFR < 60), or active hemorrhage.',
    });
  }
  if (gate5bTriggered) {
    autonomousOverrides.push({
      id: 'override-gate5b-allergy-g6pd-qtc',
      gateCode: 'GATE_5B_ALLERGY_G6PD_QTC',
      severity: 'CRITICAL',
      headline: 'GATE 5B PHARMACOLOGY LOCK: ALLERGY / G6PD / QTc >= 500ms',
      detail: 'Matched documented drug allergy, G6PD hemolysis trigger, or QTc prolongation >= 500 ms.',
    });
  }
  if (gate6Triggered) {
    autonomousOverrides.push({
      id: 'override-gate6-ars-invasive',
      gateCode: 'GATE_6_ARS_INVASIVE_LOCK',
      severity: 'CRITICAL',
      headline: 'GATE 6 ARS NADIR LOCK: INVASIVE INTERVENTIONS INHIBITED',
      detail: 'Neutropenic/thrombocytopenic nadir (ANC < 0.5 K/uL or PLT < 75 K/uL) restricts non-emergent procedures.',
    });
  }
  if (gate7Triggered) {
    autonomousOverrides.push({
      id: 'override-gate7-bmed-delirium',
      gateCode: 'GATE_7_BMED_DELIRIUM_GUARD',
      severity: 'CRITICAL',
      headline: 'GATE 7 BMED GUARD: EXCLUDE ORGANIC DELIRIUM FIRST',
      detail: 'Rule out hypoxia/CO2/sepsis delirium (7A), enforce airlock lockout (7B), verify QTc before antipsychotic (7C).',
    });
  }

  const extendedInterlockMatrix: Gate1To7MatrixItem[] = [
    {
      code: 'GATE_5A_NSAID_RENAL_BLEED',
      pillCode: '5A',
      shortLabel: 'GATE 5A: NSAID/RENAL',
      status: gate5aTriggered ? 'TRIGGERED' : 'ARMED',
      detail: gate5aTriggered
        ? 'Ketorolac & NSAIDs inhibited (renal/bleed lock)'
        : 'PLT >= 100 K/uL & renal NSAID guard nominal',
      rationale:
        'Blocks Ketorolac/NSAIDs whenever PLT < 100 K/uL, Cr > 1.30 mg/dL, eGFR < 60, or acute GI/intracranial/thoracic bleeding is active.',
    },
    {
      code: 'GATE_5B_ALLERGY_G6PD_QTC',
      pillCode: '5B',
      shortLabel: 'GATE 5B: ALLERGY/QTc',
      status: gate5bTriggered ? 'TRIGGERED' : 'ARMED',
      detail: gate5bTriggered
        ? 'Allergy, G6PD hemolysis, or QTc >= 500ms lock'
        : 'Allergy, G6PD & QTc guardrails nominal',
      rationale:
        'Checks crew drug allergies (Penicillin/Cephalosporin/Sulfonamide), G6PD oxidative drug safety (Methylene Blue), and QTc >= 500 ms lockouts.',
    },
    {
      code: 'GATE_5C_EXMC_POTENCY_SUB',
      pillCode: '5C',
      shortLabel: 'GATE 5C: ExMC POTENCY',
      status: gate5cActive ? 'ACTIVE' : 'ARMED',
      detail: gate5cActive
        ? 'Auto-substituting <90% USP degraded Mars agent'
        : 'ExMC Mars-transit shelf potency >= 90% USP',
      rationale:
        'Substitutes radiation/thermal-degraded (<90% USP) pharmaceuticals with shelf-stable Mars transit alternatives (e.g. Cefepime/Ertapenem).',
    },
    {
      code: 'GATE_6_ARS_INVASIVE_LOCK',
      pillCode: '6',
      shortLabel: 'GATE 6: ARS NADIR',
      status: gate6Triggered ? 'LOCKED' : 'ARMED',
      detail: gate6Triggered
        ? 'ARS nadir: non-emergent invasive actions locked'
        : 'No SPE hematologic nadir invasive restriction',
      rationale:
        'Enforces invasive procedure lock during Acute Radiation Syndrome nadir (ANC < 0.5 K/uL or PLT < 75 K/uL) unless immediate life threat.',
    },
    {
      code: 'GATE_7_BMED_DELIRIUM_GUARD',
      pillCode: '7',
      shortLabel: 'GATE 7: BMED GUARD',
      status: gate7Triggered ? 'TRIGGERED' : 'ARMED',
      detail: gate7Triggered
        ? '7A organic exclusion + 7B airlock + 7C QTc guard'
        : 'Behavioral emergency organic-first guard armed',
      rationale:
        'Gate 7A excludes organic delirium (O2/CO2/sepsis/tox) before behavioral sedation; Gate 7B guards CMRS & airlock lockout; Gate 7C checks QTc >= 470 ms.',
    },
  ];

  const coreRationales: Record<SafetyGateCode, { pillCode: '1' | '2' | '3' | '4A' | '4B'; rationale: string }> = {
    GATE_1_ANTICOAG_LOCK: {
      pillCode: '1',
      rationale:
        'Prohibits systemic anticoagulants for venous stasis alone until B-Mode POCUS confirms non-compressible IJV thrombus.',
    },
    GATE_2_LBNP_AUTO_VENT: {
      pillCode: '2',
      rationale:
        'Arms automatic Chibis/LBNP vent to 0 mmHg upon pre-syncope (dSBP > 15 mmHg or HR > 115 bpm).',
    },
    GATE_3_ANKLE_DAMPING: {
      pillCode: '3',
      rationale:
        'Locks high-impact plyometrics and adds +25% 0.38g EVA ankle damping when Gait Asymmetry Index exceeds 12.0%.',
    },
    GATE_4A_THORACOSTOMY_LOCK: {
      pillCode: '4A',
      rationale:
        'Prohibits thoracic needle decompression / thoracostomy until eFAST confirms absent pleural lung sliding (barcode sign).',
    },
    GATE_4B_EVA_NO_GO: {
      pillCode: '4B',
      rationale:
        'Enforces deontic EVA airlock egress lockout during hemodynamic instability, DCS risk (Conkin R360 > 1.40), or SPE alert.',
    },
  };

  const gates1To7Matrix: Gate1To7MatrixItem[] = [
    ...interlockMatrix.map((item) => ({
      code: item.code,
      pillCode: coreRationales[item.code].pillCode,
      shortLabel: item.shortLabel,
      status: item.status,
      detail: item.detail,
      rationale: coreRationales[item.code].rationale,
    })),
    ...extendedInterlockMatrix,
  ];

  return {
    unlockedActions,
    inhibitedActions,
    autonomousOverrides,
    interlockMatrix,
    extendedInterlockMatrix,
    gates1To7Matrix,
    preSyncopeTriggered,
  };
}
