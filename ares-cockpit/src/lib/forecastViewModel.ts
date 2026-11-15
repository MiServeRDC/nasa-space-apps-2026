import type { TimestralQuantilesSummary } from '../types/telemetry';
import type { HorizonQuantileInputPoint } from '../instruments/instrumentMath';
import { parseMonotoneQuantileTriplet } from './telemetryValidation';

export const FORECAST_UNITS: Readonly<Record<string, string>> = {
  rho_global: 'rho', heart_rate_bpm: 'bpm', pulse_rate_bpm: 'bpm', resp_rate_brpm: 'br/m',
  spo2_pct: '%', rmssd_ms: 'ms', tau_w_dyn_cm2: 'dyn/cm2', sclerostin_pmol_l: 'pmol/L',
  ared_daily_load_kgf: 'kgf',
};
export function selectForecastPoints(summary: TimestralQuantilesSummary | null | undefined,
  channel: string, unit: string): { points: HorizonQuantileInputPoint[]; reason: string | null } {
  if (!Object.hasOwn(FORECAST_UNITS, channel) || FORECAST_UNITS[channel] !== unit) {
    return { points: [], reason: 'Forecast channel and unit are incompatible' };
  }
  if (channel === 'rho_global' && (summary?.abstention_certificate?.abstained || summary?.confidence_state === 'ABSTAINED_FALLBACK_DETERMINISTIC' || summary?.conformal_status === 'ABSTAINED_FALLBACK_DETERMINISTIC')) {
    return { points: [], reason: summary.abstention_certificate?.reason ?? 'Backend withheld this forecast' };
  }
  const points = new Map<number, HorizonQuantileInputPoint>();
  const add = (seconds: number, value: unknown) => {
    const q = parseMonotoneQuantileTriplet(value);
    if (q) points.set(seconds, { horizonSec: seconds,
      label: seconds < 60 ? `+${seconds}s` : seconds < 3600 ? `+${seconds / 60}m` : `+${seconds / 3600}h`, ...q });
  };
  const short = summary?.short_horizon_cones?.find(c => c.channel_name === channel);
  const shortCertificate = summary?.short_horizon_abstention;
  const shortAbstained = typeof shortCertificate === 'object' && shortCertificate?.abstained === true;
  if (short && !shortAbstained) {
    add(5, short.horizon_5s); add(10, short.horizon_10s); add(30, short.horizon_30s);
    add(60, short.horizon_60s); add(120, short.horizon_120s);
  }
  const long = summary?.channel_cones?.find(c => c.channel_name === channel);
  if (long) {
    add(900, long.horizon_15m); add(3600, long.horizon_1h);
    add(21600, long.horizon_6h); add(86400, long.horizon_24h);
  }
  return { points: [...points.values()].sort((a, b) => a.horizonSec - b.horizonSec),
    reason: points.size ? null : shortAbstained ? shortCertificate.reason : 'No forecast supplied for this channel' };
}
