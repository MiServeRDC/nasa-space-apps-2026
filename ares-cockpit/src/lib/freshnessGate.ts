export interface FreshnessGateState {
  activeSourceId: string | null;
  lastAppliedTimestampMs: number | null;
  lastAppliedRecTime: number | null;
}

/**
 * Evaluates monotonic freshness while preventing cockpit lockout on source switches
 * or replay loops/wraps. Returns whether accepted and the next tracking state.
 */
export function evaluateFreshnessGate(
  normalized: { timestamp_ms: number; relative_recording_time_s: number; source_record_id: string },
  state: FreshnessGateState,
): { accepted: boolean; nextState: FreshnessGateState } {
  const isNewSource = state.activeSourceId !== null && normalized.source_record_id !== state.activeSourceId;
  const isReplayLoop =
    state.lastAppliedRecTime !== null &&
    normalized.relative_recording_time_s < state.lastAppliedRecTime - 1.0;

  if (isNewSource || isReplayLoop) {
    return {
      accepted: true,
      nextState: {
        activeSourceId: normalized.source_record_id,
        lastAppliedTimestampMs: normalized.timestamp_ms,
        lastAppliedRecTime: normalized.relative_recording_time_s,
      },
    };
  }

  if (
    state.lastAppliedTimestampMs !== null &&
    normalized.timestamp_ms < state.lastAppliedTimestampMs
  ) {
    return { accepted: false, nextState: state };
  }

  if (
    state.lastAppliedRecTime !== null &&
    normalized.relative_recording_time_s < state.lastAppliedRecTime &&
    Math.abs(normalized.relative_recording_time_s - state.lastAppliedRecTime) > 1e-4
  ) {
    return { accepted: false, nextState: state };
  }

  return {
    accepted: true,
    nextState: {
      activeSourceId: normalized.source_record_id,
      lastAppliedTimestampMs: normalized.timestamp_ms,
      lastAppliedRecTime: normalized.relative_recording_time_s,
    },
  };
}
