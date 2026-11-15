export const MISSION_PROFILES = [
  { id: 'ISS', label: 'LEO / ISS', gravity: 'Microgravity', cabinCo2: 2, oneWayS: 0.5, eva: 'Microgravity' },
  { id: 'TRANSIT', label: 'Deep-space transit', gravity: 'Microgravity', cabinCo2: 2.5, oneWayS: 862, eva: null },
  { id: 'LUNAR', label: 'Lunar surface', gravity: '0.16 g', cabinCo2: 2.2, oneWayS: 1.3, eva: 'Surface' },
  { id: 'ROVER', label: 'Mars rover', gravity: '0.38 g', cabinCo2: 2.8, oneWayS: 862, eva: 'Surface' },
  { id: 'CONJUNCTION', label: 'Mars base · solar conjunction', gravity: '0.38 g', cabinCo2: 2.8, oneWayS: null, eva: null },
] as const;

export type MissionProfile = (typeof MISSION_PROFILES)[number];
export const DEFAULT_MISSION_PROFILE = MISSION_PROFILES[1];

export const EVA_AEROBIC_CAPACITY = { Microgravity: 32.9, Surface: 36.5 } as const;

export type CrewActivity = 'unknown' | 'rest' | 'exercise';

export const ACTIVITY_CONTEXT: Record<CrewActivity, string> = {
  unknown: 'Mark rest or exercise to put changes in heart and breathing rate in context.',
  rest: 'At rest, compare persistent changes in heart and breathing rate with the crew member’s resting baseline.',
  exercise: 'During exercise, heart and breathing rates can rise with effort. Check whether they settle after exercise and review any accompanying change in blood oxygen.',
};
