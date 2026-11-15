// Pure deterministic Branched Safety Gate DAG partitioner & 5-Gate Hardware Interlock evaluator
// for `PhaseActDeck` (`03 ACT`).
// Zero runtime relative imports so `node --test --experimental-strip-types` can import directly.

import type {
  AnatomicalRegionWireId,
  CountermeasureAction,
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

export interface InhibitedPlaybookAction {
  action: CountermeasureAction;
  gateCode: SafetyGateCode;
  gateTitle: string;
  rationale: string;
  verifyLabel: string;
  verifyTargetTab: DiagnosticImagingTab;
  verifyRegion: AnatomicalRegionWireId;
}

export interface AutonomousSafetyOverride {
  id: string;
  gateCode: SafetyGateCode | 'SPE_STORM_SHELTER';
  severity: 'CRITICAL' | 'WARNING';
  headline: string;
  detail: string;
}

export interface InterlockGateSummaryItem {
  code: SafetyGateCode;
  shortLabel: string;
  status: 'LOCKED' | 'ARMED' | 'TRIGGERED' | 'UNLOCKED';
  detail: string;
}

export interface PartitionedSafetyDagResult {
  unlockedActions: CountermeasureAction[];
  inhibitedActions: InhibitedPlaybookAction[];
  autonomousOverrides: AutonomousSafetyOverride[];
  interlockMatrix: InterlockGateSummaryItem[];
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
  const anticoagLocked =
    rawGates?.anticoagulant_lock_active !== undefined
      ? Boolean(rawGates.anticoagulant_lock_active)
      : !pocusVerified;

  const invasiveLocked = rawGates?.gate4_invasive_decompression_locked !== false;

  const lbnpMmhg =
    typeof context.lbnpMmhg === 'number' && Number.isFinite(context.lbnpMmhg)
      ? context.lbnpMmhg
      : 0;
  const lbnpActive = Boolean(context.lbnpActive) || lbnpMmhg < 0;

  const sbpDrop =
    typeof context.sbpDropMmhg === 'number' && Number.isFinite(context.sbpDropMmhg)
      ? context.sbpDropMmhg
      : 0;
  const hr =
    typeof context.hrBpm === 'number' && Number.isFinite(context.hrBpm)
      ? context.hrBpm
      : null;

  const preSyncopeTriggered =
    lbnpActive &&
    (sbpDrop > GATE2_MAX_SBP_DROP_MMHG || (hr !== null && hr > GATE2_MAX_SAFE_HR_BPM));

  const gaiPct =
    typeof context.gaiPct === 'number' && Number.isFinite(context.gaiPct)
      ? context.gaiPct
      : 0;
  const ankleDampingActive =
    Boolean(rawGates?.eva_suit_damping_active) || gaiPct > GATE3_MAX_SAFE_GAI_PCT;

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
      detail: `Pre-syncopal threshold breached (SBP drop ${sbpDrop.toFixed(1)} mmHg > 15 mmHg or HR ${hrNote} > 115 bpm). Negative pressure chamber vented to 0 mmHg.`,
    });
    if (!unlockedActions.some((a) => a.action_id === 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG')) {
      unlockedActions.unshift({
        action_id: 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG',
        label: `SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (SBP drop ${sbpDrop.toFixed(1)} mmHg / HR ${hrNote})`,
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
      detail: `Gait Asymmetry Index (${gaiPct.toFixed(1)}% > 12.0%) detected. High-impact plyometrics locked; Martian suit ankle stiffness boosted.`,
    });
    if (!unlockedActions.some((a) => a.action_id === 'ACT_EVA_SUIT_ANKLE_DAMPING_038G')) {
      unlockedActions.push({
        action_id: 'ACT_EVA_SUIT_ANKLE_DAMPING_038G',
        label: `SAFETY GATE 3 ACTIVE: Lock plyometric impact & set Martian EVA suit ankle damping +25% (GAI = ${gaiPct.toFixed(1)}% > 12.0%)`,
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
        ? 'Awaiting POCUS thrombus confirmation'
        : 'POCUS intraluminal thrombus verified',
    },
    {
      code: 'GATE_2_LBNP_AUTO_VENT',
      shortLabel: 'GATE 2: LBNP VENT',
      status: preSyncopeTriggered ? 'TRIGGERED' : 'ARMED',
      detail: preSyncopeTriggered
        ? 'Chamber vented to 0 mmHg (SBP drop >15 / HR >115)'
        : 'Guarding dSBP <= 15 mmHg & HR <= 115 bpm',
    },
    {
      code: 'GATE_3_ANKLE_DAMPING',
      shortLabel: 'GATE 3: 0.38G SUIT',
      status: ankleDampingActive ? 'TRIGGERED' : 'ARMED',
      detail: ankleDampingActive
        ? `GAI ${gaiPct.toFixed(1)}% > 12%: +25% ankle damping`
        : `GAI ${gaiPct.toFixed(1)}% <= 12.0% nominal`,
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
      detail: evaNoGoActive ? 'EVA egress inhibited' : 'EVA physiological readiness nominal',
    },
  ];

  return {
    unlockedActions,
    inhibitedActions,
    autonomousOverrides,
    interlockMatrix,
    preSyncopeTriggered,
  };
}
