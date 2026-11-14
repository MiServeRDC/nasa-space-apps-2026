import type { CrystallizedPlaybookId } from './telemetry';

export type InjuryRegionId =
  | 'HEAD_FOREHEAD'
  | 'LEFT_SHOULDER'
  | 'RIGHT_SHOULDER'
  | 'LEFT_FOREARM'
  | 'RIGHT_FOREARM'
  | 'CHEST_RIBS'
  | 'LEFT_KNEE'
  | 'RIGHT_KNEE'
  | 'LEFT_ANKLE'
  | 'RIGHT_ANKLE';

export type InjurySeverity = 'LOW' | 'MODERATE' | 'HIGH';

export type InjuryAssessmentMethodId = 'OPTICAL_RGB_HEURISTIC_V1' | 'MANUAL_CREW_ENTRY';

export interface InjuryMarker {
  id: string;
  region: InjuryRegionId;
  title: string;
  severity: InjurySeverity;
  methodId: InjuryAssessmentMethodId;
  validationStatus: 'ILLUSTRATIVE_UNVALIDATED';
  erythemaIndex?: number;
  contrastIndex?: number;
  darkPixelRatio?: number;
  recommendedPlaybookId?: CrystallizedPlaybookId;
  summary: string;
  careSteps: string[];
  detectedAt: string;
  photoUrl?: string; // local object URL from user-uploaded image (never uploaded)
}

export interface RegionMeta {
  label: string;
  pos: [number, number, number];
  recommendedPlaybookId: CrystallizedPlaybookId;
  defaultTitle: string;
  defaultSeverity: InjurySeverity;
  defaultSummary: string;
  defaultCare: string[];
}

export const INJURY_REGIONS: Record<InjuryRegionId, RegionMeta> = {
  HEAD_FOREHEAD: {
    label: 'Forehead / Head',
    pos: [0, 1.64, 0.135],
    recommendedPlaybookId: 'PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION',
    defaultTitle: 'Forehead Impact / Contusion',
    defaultSeverity: 'HIGH',
    defaultSummary:
      'Blunt impact logged on the frontal region. In microgravity, head trauma requires strict avoidance of systemic anticoagulants (Gate 1 locked).',
    defaultCare: [
      'Check pupils, balance, and orientation (SCAT check).',
      'Apply cold pack; keep anticoagulants LOCKED.',
      'Re-assess neurological status in 2 hours.',
    ],
  },
  LEFT_SHOULDER: {
    label: 'Left Shoulder',
    pos: [-0.26, 1.15, 0.04],
    recommendedPlaybookId: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    defaultTitle: 'Left Shoulder Strain',
    defaultSeverity: 'MODERATE',
    defaultSummary:
      'Localized soft-tissue strain around the deltoid / AC joint, consistent with EVA suit or ARED harness load.',
    defaultCare: [
      'Pause overhead ARED exercises for 48 hours.',
      'Apply cold compress for 15 minutes.',
    ],
  },
  RIGHT_SHOULDER: {
    label: 'Right Shoulder',
    pos: [0.26, 1.15, 0.04],
    recommendedPlaybookId: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    defaultTitle: 'Right Shoulder Strain',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Localized soft-tissue strain around the deltoid / AC joint.',
    defaultCare: [
      'Pause overhead ARED exercises for 48 hours.',
      'Apply cold compress for 15 minutes.',
    ],
  },
  LEFT_FOREARM: {
    label: 'Left Forearm',
    pos: [-0.36, 0.56, 0.06],
    recommendedPlaybookId: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    defaultTitle: 'Left Forearm Laceration / Abrasion',
    defaultSeverity: 'LOW',
    defaultSummary:
      'Superficial skin break logged on the left forearm. Fluid droplets must be contained in microgravity.',
    defaultCare: [
      'Irrigate with sterile saline wipe inside containment bag.',
      'Apply antimicrobial dressing and elastic wrap.',
    ],
  },
  RIGHT_FOREARM: {
    label: 'Right Forearm',
    pos: [0.36, 0.56, 0.06],
    recommendedPlaybookId: 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
    defaultTitle: 'Right Forearm Abrasion',
    defaultSeverity: 'LOW',
    defaultSummary: 'Superficial abrasion logged on the right forearm.',
    defaultCare: [
      'Clean with sterile saline wipe.',
      'Cover with breathable protective dressing.',
    ],
  },
  CHEST_RIBS: {
    label: 'Chest / Ribs',
    pos: [-0.07, 1.0, 0.18],
    recommendedPlaybookId: 'PLAYBOOK_06_HYPOXEMIA_DESATURATION',
    defaultTitle: 'Thoracic Wall Contusion',
    defaultSeverity: 'MODERATE',
    defaultSummary:
      'Localized bruising over the anterior ribcage. Monitor breathing comfort and SpO2.',
    defaultCare: [
      'Verify SpO2 remains > 94% and breathing is symmetric.',
      'Avoid tight chest harnesses until tenderness subsides.',
    ],
  },
  LEFT_KNEE: {
    label: 'Left Knee',
    pos: [-0.12, -0.22, 0.08],
    recommendedPlaybookId: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
    defaultTitle: 'Left Knee Contusion / Swelling',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Visible swelling logged over the left patellar region.',
    defaultCare: [
      'Reduce squat/deadlift load on ARED.',
      'Apply compression sleeve and monitor range of motion.',
    ],
  },
  RIGHT_KNEE: {
    label: 'Right Knee',
    pos: [0.12, -0.22, 0.08],
    recommendedPlaybookId: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
    defaultTitle: 'Right Knee Contusion / Swelling',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Visible swelling logged over the right patellar region.',
    defaultCare: [
      'Reduce squat/deadlift load on ARED.',
      'Apply compression sleeve and monitor range of motion.',
    ],
  },
  LEFT_ANKLE: {
    label: 'Left Ankle',
    pos: [-0.12, -0.7, 0.07],
    recommendedPlaybookId: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
    defaultTitle: 'Left Ankle Sprain',
    defaultSeverity: 'MODERATE',
    defaultSummary:
      'Lateral malleolus swelling logged. Affects foot-restraint stability and Mars surface gait readiness.',
    defaultCare: [
      'Apply elastic ankle brace.',
      'Avoid high-impact treadmill/ARED loads for 72 hours.',
    ],
  },
  RIGHT_ANKLE: {
    label: 'Right Ankle',
    pos: [0.12, -0.7, 0.07],
    recommendedPlaybookId: 'PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED',
    defaultTitle: 'Right Ankle Sprain',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Lateral malleolus swelling logged.',
    defaultCare: [
      'Apply elastic ankle brace.',
      'Avoid high-impact treadmill/ARED loads for 72 hours.',
    ],
  },
};
