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
  const canVerify = reading.fresh && (previous.cause !== 'vitals' || reading.canVerifyVitals);
  return { ...previous, phase: canVerify ? 'recovered' : 'awaiting' };
}
