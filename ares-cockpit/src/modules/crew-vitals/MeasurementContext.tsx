import type { DataOrigin } from '../../types/telemetry';
import type { RecordedHistoryPoint } from '../../lib/useTelemetry';

export function RecentRange({ history, signal, unit }: {
  history: RecordedHistoryPoint[];
  signal: 'hr' | 'spo2' | 'resp' | 'pulse';
  unit: string;
}) {
  const latest = history.at(-1);
  if (!latest) return null;
  const values = history
    .filter(point => point.relativeTimeS >= latest.relativeTimeS - 29)
    .flatMap(point => point[signal] === null ? [] : [point[signal]]);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = min === max ? min : `${min}–${max}`;
  return <p className="vital-range">Last 30 s <span>{range} {unit}</span></p>;
}

export function MeasurementContext({ source, sampleRate, hrv, temperature }: {
  source: DataOrigin;
  sampleRate: number;
  hrv: string | null;
  temperature: number | null;
}) {
  return (
    <section className="measurement-context" aria-labelledby="measurement-context-title">
      <h2 id="measurement-context-title">Signal coverage</h2>
      <dl>
        <div><dt>Source</dt><dd>{source === 'RECORDED_TERRESTRIAL_BIDMC_CSV' ? 'BIDMC replay' : source === 'RECORDED_TERRESTRIAL_WAVEFORM' ? 'Recorded waveform' : 'Simulation'}</dd></div>
        <div><dt>Sample rate</dt><dd>{sampleRate} Hz</dd></div>
        <div><dt>Blood pressure</dt><dd className="coverage-gap">No pressure channel</dd></div>
        <div><dt>Core temperature</dt><dd>{temperature === null ? 'No temperature channel' : `${temperature.toFixed(1)} °C`}</dd></div>
        <div><dt>Heart rate variability</dt><dd>{hrv ?? 'Requires beat intervals'}</dd></div>
      </dl>
    </section>
  );
}
