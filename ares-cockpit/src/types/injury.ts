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

export interface InjuryMarker {
  id: string;
  region: InjuryRegionId;
  title: string;
  severity: InjurySeverity;
  confidencePct: number;
  summary: string;
  careSteps: string[];
  detectedAt: string;
  photoUrl?: string; // local object URL from user-uploaded image (never uploaded)
}

export interface RegionMeta {
  label: string;
  pos: [number, number, number];
  defaultTitle: string;
  defaultSeverity: InjurySeverity;
  defaultSummary: string;
  defaultCare: string[];
}

export const INJURY_REGIONS: Record<InjuryRegionId, RegionMeta> = {
  HEAD_FOREHEAD: {
    label: 'Forehead / Head',
    pos: [0, 1.64, 0.135],
    defaultTitle: 'Forehead Impact / Contusion',
    defaultSeverity: 'HIGH',
    defaultSummary: 'Blunt impact detected on the frontal region. In microgravity, even minor head trauma requires strict avoidance of blood thinners.',
    defaultCare: [
      'Check pupils, balance, and orientation (SCAT check).',
      'Apply cold pack; keep anticoagulants LOCKED.',
      'Re-assess neurological status in 2 hours.',
    ],
  },
  LEFT_SHOULDER: {
    label: 'Left Shoulder',
    pos: [-0.26, 1.15, 0.04],
    defaultTitle: 'Left Shoulder Strain',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Localized soft-tissue strain around the deltoid / AC joint, consistent with EVA suit or ARED harness load.',
    defaultCare: [
      'Pause overhead ARED exercises for 48 hours.',
      'Apply cold compress for 15 minutes.',
    ],
  },
  RIGHT_SHOULDER: {
    label: 'Right Shoulder',
    pos: [0.26, 1.15, 0.04],
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
    defaultTitle: 'Left Forearm Laceration / Abrasion',
    defaultSeverity: 'LOW',
    defaultSummary: 'Superficial skin break detected on the left forearm. Fluid droplets must be contained in microgravity.',
    defaultCare: [
      'Irrigate with sterile saline wipe inside containment bag.',
      'Apply antimicrobial dressing and elastic wrap.',
    ],
  },
  RIGHT_FOREARM: {
    label: 'Right Forearm',
    pos: [0.36, 0.56, 0.06],
    defaultTitle: 'Right Forearm Abrasion',
    defaultSeverity: 'LOW',
    defaultSummary: 'Superficial abrasion detected on the right forearm.',
    defaultCare: [
      'Clean with sterile saline wipe.',
      'Cover with breathable protective dressing.',
    ],
  },
  CHEST_RIBS: {
    label: 'Chest / Ribs',
    pos: [-0.07, 1.00, 0.18],
    defaultTitle: 'Thoracic Wall Contusion',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Localized bruising over the anterior ribcage. Monitor breathing comfort and SpO2.',
    defaultCare: [
      'Verify SpO2 remains > 94% and breathing is symmetric.',
      'Avoid tight chest harnesses until tenderness subsides.',
    ],
  },
  LEFT_KNEE: {
    label: 'Left Knee',
    pos: [-0.12, -0.22, 0.08],
    defaultTitle: 'Left Knee Contusion / Swelling',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Visible swelling over the left patellar region.',
    defaultCare: [
      'Reduce squat/deadlift load on ARED.',
      'Apply compression sleeve and monitor range of motion.',
    ],
  },
  RIGHT_KNEE: {
    label: 'Right Knee',
    pos: [0.12, -0.22, 0.08],
    defaultTitle: 'Right Knee Contusion / Swelling',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Visible swelling over the right patellar region.',
    defaultCare: [
      'Reduce squat/deadlift load on ARED.',
      'Apply compression sleeve and monitor range of motion.',
    ],
  },
  LEFT_ANKLE: {
    label: 'Left Ankle',
    pos: [-0.12, -0.70, 0.07],
    defaultTitle: 'Left Ankle Sprain',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Lateral malleolus swelling detected. Affects foot-restraint stability and Mars surface gait readiness.',
    defaultCare: [
      'Apply elastic ankle brace.',
      'Avoid high-impact treadmill/ARED loads for 72 hours.',
    ],
  },
  RIGHT_ANKLE: {
    label: 'Right Ankle',
    pos: [0.12, -0.70, 0.07],
    defaultTitle: 'Right Ankle Sprain',
    defaultSeverity: 'MODERATE',
    defaultSummary: 'Lateral malleolus swelling detected.',
    defaultCare: [
      'Apply elastic ankle brace.',
      'Avoid high-impact treadmill/ARED loads for 72 hours.',
    ],
  },
};
