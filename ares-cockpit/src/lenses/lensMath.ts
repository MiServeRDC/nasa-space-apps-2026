// Pure deterministic math, magnetic slider detents, optical contrast quality gates,
// and Priority 1-6 MedOps playbook precedence metadata for `src/lenses/*`.
// Uses `import type` only so `node --test --experimental-strip-types` runs directly.

import type { CrystallizedPlaybookId } from '../types/telemetry';
import type { WhatIf } from '../lib/scenario';

export const MAGNETIC_SNAP_RATIO = 0.025;
export const OPTICAL_MIN_CONTRAST_INDEX = 0.18;
export const OPTICAL_MIN_QUALITY_PCT = 45;

export const EMPIRICAL_WHATIF_BASELINE: Readonly<Omit<WhatIf, 'sex'>> = {
  ppco2_mmhg: 2.5,
  ared_load_pct: 60,
  lbnp_mmhg: 0,
  mission_day: 60,
  artifact_level: 0.1,
};

export interface MagneticSnapResult {
  value: number;
  snapped: boolean;
}

/**
 * Snaps a continuous counterfactual slider value to its empirical baseline detent
 * when within `+/- 2.5%` of the slider's `[min, max]` span.
 */
export function snapToMagneticBaseline(
  rawValue: number,
  baseline: number,
  min: number,
  max: number,
  snapRatio: number = MAGNETIC_SNAP_RATIO,
): MagneticSnapResult {
  if (!Number.isFinite(rawValue)) {
    return { value: baseline, snapped: true };
  }
  const span = Math.abs(max - min);
  if (span <= 0) {
    return { value: baseline, snapped: true };
  }
  const clamped = Math.min(max, Math.max(min, rawValue));
  const tolerance = span * Math.max(0, snapRatio);
  if (Math.abs(clamped - baseline) <= tolerance) {
    return { value: baseline, snapped: true };
  }
  return { value: clamped, snapped: false };
}

/**
 * Returns `true` when any continuous What-If counterfactual slider deviates from
 * the empirical baseline beyond floating-point epsilon.
 */
export function hasWhatIfDeviation(
  whatIf: Pick<
    WhatIf,
    'ppco2_mmhg' | 'ared_load_pct' | 'lbnp_mmhg' | 'mission_day' | 'artifact_level'
  >,
  baseline: Readonly<Omit<WhatIf, 'sex'>> = EMPIRICAL_WHATIF_BASELINE,
): boolean {
  return (
    Math.abs(whatIf.ppco2_mmhg - baseline.ppco2_mmhg) > 1e-3 ||
    Math.abs(whatIf.ared_load_pct - baseline.ared_load_pct) > 1e-3 ||
    Math.abs(whatIf.lbnp_mmhg - baseline.lbnp_mmhg) > 1e-3 ||
    Math.abs(whatIf.mission_day - baseline.mission_day) > 1e-3 ||
    Math.abs(whatIf.artifact_level - baseline.artifact_level) > 1e-3
  );
}

export interface OpticalQualityGateStatus {
  degraded: boolean;
  badge: string;
  guidance: string;
}

/**
 * Evaluates honest illumination and dynamic-range quality for `OPTICAL_RGB_HEURISTIC_V1`.
 * Flags `[LOW CONTRAST - HEURISTIC QUALITY GATE]` whenever `contrastIndex < 0.18`
 * or `qualityIndexPct < 45`.
 */
export function evaluateOpticalQualityGate(
  contrastIndex: number,
  qualityIndexPct: number,
): OpticalQualityGateStatus {
  const safeContrast = Number.isFinite(contrastIndex) ? contrastIndex : 0;
  const safeQuality = Number.isFinite(qualityIndexPct) ? qualityIndexPct : 0;

  if (
    safeContrast < OPTICAL_MIN_CONTRAST_INDEX ||
    safeQuality < OPTICAL_MIN_QUALITY_PCT
  ) {
    return {
      degraded: true,
      badge: '[LOW CONTRAST - HEURISTIC QUALITY GATE]',
      guidance: `Contrast ${safeContrast.toFixed(2)} (< ${OPTICAL_MIN_CONTRAST_INDEX.toFixed(2)}) or quality ${Math.round(safeQuality)}% (< ${OPTICAL_MIN_QUALITY_PCT}%). Reposition habitat task lamp and re-capture before relying on RGB heuristic triage.`,
    };
  }

  return {
    degraded: false,
    badge: 'ILLUMINATION ENVELOPE NOMINAL',
    guidance: `Contrast ${safeContrast.toFixed(2)} and dynamic-range quality ${Math.round(safeQuality)}% satisfy pixel heuristic envelope.`,
  };
}

export type PlaybookPrecedenceTier = 1 | 2 | 3 | 4 | 5 | 6;
export type PlaybookDomainGroup = 'CORE' | 'ACUTE' | 'EXPLORATION';

export interface PlaybookPrecedenceMeta {
  tier: PlaybookPrecedenceTier;
  badge: `P${PlaybookPrecedenceTier}`;
  priorityLabel: string;
  domainGroup: PlaybookDomainGroup;
}

export const PLAYBOOK_PRECEDENCE_MAP: Record<
  CrystallizedPlaybookId,
  PlaybookPrecedenceMeta
> = {
  PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS: {
    tier: 1,
    badge: 'P1',
    priorityLabel: 'P1 IMMEDIATE HABITAT / LIFE THREAT',
    domainGroup: 'CORE',
  },
  PLAYBOOK_06_HYPOXEMIA_DESATURATION: {
    tier: 1,
    badge: 'P1',
    priorityLabel: 'P1 IMMEDIATE LIFE THREAT',
    domainGroup: 'ACUTE',
  },
  PLAYBOOK_15_EFAST_TRAUMA_TRIAGE: {
    tier: 1,
    badge: 'P1',
    priorityLabel: 'P1 ACUTE TRAUMA / BAROTRAUMA',
    domainGroup: 'EXPLORATION',
  },
  PLAYBOOK_02_CONFIRMED_IJV_THROMBUS: {
    tier: 2,
    badge: 'P2',
    priorityLabel: 'P2 CONFIRMED THROMBOEMBOLIC RISK',
    domainGroup: 'CORE',
  },
  PLAYBOOK_09_MULTIPARAMETER_DETERIORATION: {
    tier: 2,
    badge: 'P2',
    priorityLabel: 'P2 MULTIPARAMETER DETERIORATION',
    domainGroup: 'ACUTE',
  },
  PLAYBOOK_01_VENOUS_STASIS_LBNP: {
    tier: 3,
    badge: 'P3',
    priorityLabel: 'P3 VENOUS STASIS REVERSAL',
    domainGroup: 'CORE',
  },
  PLAYBOOK_07_TACHYCARDIA_AUTONOMIC_STRESS: {
    tier: 3,
    badge: 'P3',
    priorityLabel: 'P3 AUTONOMIC STABILIZATION',
    domainGroup: 'ACUTE',
  },
  PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION: {
    tier: 4,
    badge: 'P4',
    priorityLabel: 'P4 NEURO-OCULAR SANS MITIGATION',
    domainGroup: 'CORE',
  },
  PLAYBOOK_14_CO2_SCRUBBER_SANS: {
    tier: 4,
    badge: 'P4',
    priorityLabel: 'P4 ECLSS HYPERCAPNIA SCRUB',
    domainGroup: 'EXPLORATION',
  },
  PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED: {
    tier: 5,
    badge: 'P5',
    priorityLabel: 'P5 FROST MECHANOSTAT LOADING',
    domainGroup: 'CORE',
  },
  PLAYBOOK_10_RENAL_LITHIASIS: {
    tier: 5,
    badge: 'P5',
    priorityLabel: 'P5 RENAL CITRATE BUFFERING',
    domainGroup: 'EXPLORATION',
  },
  PLAYBOOK_13_VIRAL_IMMUNE_VALACYCLOVIR: {
    tier: 5,
    badge: 'P5',
    priorityLabel: 'P5 ANTIVIRAL IMMUNE PROTOCOL',
    domainGroup: 'EXPLORATION',
  },
  PLAYBOOK_08_SIGNAL_QUALITY_SENSOR_CHECK: {
    tier: 6,
    badge: 'P6',
    priorityLabel: 'P6 TRANSDUCER QA & ABSTENTION',
    domainGroup: 'ACUTE',
  },
  PLAYBOOK_11_MARS_ENTRY_FLUID_LOADING: {
    tier: 6,
    badge: 'P6',
    priorityLabel: 'P6 0.38G ENTRY FLUID LOADING',
    domainGroup: 'EXPLORATION',
  },
  PLAYBOOK_12_CIRCADIAN_LIGHT_HYGIENE: {
    tier: 6,
    badge: 'P6',
    priorityLabel: 'P6 MARS SOL CIRCADIAN ENTRAINMENT',
    domainGroup: 'EXPLORATION',
  },
};

export function getPlaybookPrecedence(
  playbookId: CrystallizedPlaybookId,
): PlaybookPrecedenceMeta {
  return PLAYBOOK_PRECEDENCE_MAP[playbookId];
}
