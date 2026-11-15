import type { ActivePlaybook } from '../types/telemetry.ts';

export type AlarmEpisode = {
  source: 'engine' | 'simulation';
  cause: 'critical' | 'vitals';
  phase: 'active' | 'awaiting' | 'recovered';
};

type Reading = {
  source: AlarmEpisode['source'];
  cause: AlarmEpisode['cause'] | null;
  fresh: boolean;
  canVerifyVitals: boolean;
  missionDataComplete?: boolean;
};

/** A missing reading or a switch to offline simulation cannot confirm recovery. */
export function updateAlarmEpisode(previous: AlarmEpisode | null, reading: Reading): AlarmEpisode | null {
  if (previous?.source === 'engine' && previous.phase !== 'recovered' && reading.source === 'simulation') {
    return { ...previous, phase: 'awaiting' };
  }
  if (reading.cause) {
    return { source: reading.source, cause: reading.cause, phase: reading.fresh ? 'active' : 'awaiting' };
  }
  if (previous?.source !== reading.source) return null;
  if (previous.phase === 'recovered') return previous;
  const canVerify = reading.fresh && (previous.cause === 'vitals'
    ? reading.canVerifyVitals : reading.missionDataComplete !== false);
  return { ...previous, phase: canVerify ? 'recovered' : 'awaiting' };
}

export type ProcedureIncident = {
  key: number;
  cause: AlarmEpisode['cause'];
  source: AlarmEpisode['source'];
  playbook: ActivePlaybook | null;
  completed: boolean;
};

export function updateProcedureIncident(
  previous: ProcedureIncident | null,
  previousEpisode: AlarmEpisode | null,
  episode: AlarmEpisode | null,
  candidate: ActivePlaybook | null,
): ProcedureIncident | null {
  if (episode?.phase !== 'active') return previous;
  const procedureChanged = candidate && previous?.playbook && candidate.playbook_id !== previous.playbook.playbook_id;
  if (!previous || previousEpisode?.phase === 'recovered' || procedureChanged ||
    previous.source !== episode.source || previous.cause !== episode.cause) {
    return { key: (previous?.key ?? 0) + 1, cause: episode.cause, source: episode.source, playbook: candidate, completed: false };
  }
  if (candidate && !previous.playbook) return { ...previous, playbook: candidate };
  return previous;
}
