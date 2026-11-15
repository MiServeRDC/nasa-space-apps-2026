export type TelemetryTransportPolicy = 'OFFLINE' | 'LIVE' | 'AUTO_PROBE';

function isTruthyFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * Resolves browser telemetry transport policy for ARES-Cockpit.
 *
 * Precedence:
 * 1. `?live=1` forces active WS + HTTP telemetry with backoff reconnects.
 * 2. `?offline=1` or `VITE_LOCAL_PREVIEW=1` suppresses all loopback probes (0 errors).
 * 3. Default (`AUTO_PROBE`) executes a single bounded `/api/snapshot` probe and falls back
 *    silently to `LOCAL_SIMULATION` if loopback `:8080` refuses connection.
 */
export function resolveTelemetryTransportPolicy(
  search?: string,
  viteLocalPreview?: string,
): TelemetryTransportPolicy {
  const effectiveSearch =
    search !== undefined
      ? search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';

  if (effectiveSearch) {
    try {
      const params = new URLSearchParams(effectiveSearch);
      if (isTruthyFlag(params.get('live') ?? undefined)) {
        return 'LIVE';
      }
      if (isTruthyFlag(params.get('offline') ?? undefined)) {
        return 'OFFLINE';
      }
    } catch {
      // Ignore malformed query strings and continue with env fallback
    }
  }

  const effectiveEnv =
    viteLocalPreview !== undefined
      ? viteLocalPreview
      : (import.meta.env?.VITE_LOCAL_PREVIEW as string | undefined);

  if (isTruthyFlag(effectiveEnv)) {
    return 'OFFLINE';
  }

  return 'AUTO_PROBE';
}

export function computeReconnectBackoffMs(
  attempt: number,
  baseMs = 3000,
  maxMs = 30_000,
): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 10));
  return Math.min(maxMs, baseMs * 2 ** safeAttempt);
}
