import { useState } from 'react';
import type { ActivePlaybook, AnomalyStatus, VitalsAnomalyReport } from '../../types/telemetry';
import type { AnomalyInjectionKind, AnomalyInjectionResult } from '../../lib/useTelemetry';

const CHANNEL_LABEL: Record<string, string> = {
  heart_rate_bpm: 'HR',
  spo2_pct: 'SpO2',
  resp_rate_brpm: 'RESP',
  joint_hr_spo2_resp: 'JOINT',
};

const STATUS_CLASS: Record<AnomalyStatus, string> = {
  NORMAL: 'border-ok/50 text-ok',
  ATTENTION: 'border-advisory text-advisory',
  ALARM: 'border-critical bg-critical/15 text-critical',
};

/** A NORMAL channel that cannot be assessed must not look like a checked, healthy one. */
const NOT_EVALUABLE_CLASS = 'border-line text-gray-500';

const INJECTABLE: { kind: Exclude<AnomalyInjectionKind, null | 'CLEAR'>; label: string }[] = [
  { kind: 'DESATURATION_FAST', label: 'DESATURATION' },
  { kind: 'TACHYCARDIA_FAST', label: 'TACHYCARDIA' },
  { kind: 'SENSOR_DETACH', label: 'SENSOR DETACH' },
  { kind: 'DESATURATION_SLOW', label: 'SLOW DESAT DRIFT' },
  { kind: 'COMBINED_SUBTLE', label: 'SUBTLE COMBINATION' },
];

export function syntheticVitalEventLabel(kind: string): string {
  const label = INJECTABLE.find(event => event.kind === kind)?.label.toLowerCase();
  return label ? label[0].toUpperCase() + label.slice(1) : 'Vital-sign event';
}

/** True for the acute vitals playbooks (#06-#09) selected by the anomaly detector. */
export function isAcuteVitalsPlaybook(playbook: ActivePlaybook | null | undefined): boolean {
  return /^PLAYBOOK_0[6-9]_/.test(playbook?.playbook_id ?? '');
}

/**
 * Per-channel status of the engine anomaly detector, with the detector's own reason
 * text, plus controls that inject a synthetic event via `useTelemetry.injectAnomaly`
 * (supporting both native Tauri IPC and browser HTTP loopback).
 */
export function VitalsAnomalyPanel({
  report,
  engineLive,
  httpBaseUrl,
  onInjectAnomaly,
}: {
  report: VitalsAnomalyReport | null | undefined;
  engineLive: boolean;
  httpBaseUrl: string;
  onInjectAnomaly?: (kind: AnomalyInjectionKind, durationS?: number) => Promise<AnomalyInjectionResult>;
}) {
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<string | null>(null);

  const inject = async (kind: AnomalyInjectionKind) => {
    setRequestError(null);
    setPendingKind(kind ?? 'CLEAR');
    try {
      if (onInjectAnomaly) {
        const result = await onInjectAnomaly(kind);
        if (!result.ok) {
          setRequestError(result.error ?? 'Anomaly injection rejected by engine');
        }
        return;
      }
      const res = await fetch(`${httpBaseUrl}/api/inject-anomaly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind === 'CLEAR' ? null : kind }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setRequestError(body?.error ?? `Engine refused the request (HTTP ${res.status})`);
      }
    } catch {
      setRequestError('Engine not reachable');
    } finally {
      setPendingKind(null);
    }
  };

  if (!engineLive || !report) {
    return (
      <div className="rounded-lg border border-line bg-panel px-4 py-2 font-mono text-xs text-gray-500">
        VITALS ANOMALY DETECTOR: unavailable (engine offline; the local preview has no detector)
      </div>
    );
  }

  const overall = report.overall;
  const injection = report.injection;

  return (
    <section
      aria-label="Vitals anomaly detector"
      className={`rounded-lg border bg-panel px-4 py-2.5 font-mono text-xs ${
        overall === 'ALARM' ? 'border-critical' : overall === 'ATTENTION' ? 'border-advisory' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tracking-widest text-gray-500">VITALS ANOMALY DETECTOR</span>
          <span role="status" className={`rounded border px-2 py-0.5 font-bold ${STATUS_CLASS[overall]}`}>
            {overall}
          </span>
          {typeof report.mahalanobis_d2 === 'number' && Number.isFinite(report.mahalanobis_d2) && (
            <span className="text-[11px] text-gray-400">
              D2={report.mahalanobis_d2.toFixed(2)}
            </span>
          )}
          {!report.baseline_ready && (
            <span className="text-advisory">
              {report.baseline_samples < report.baseline_required
                ? `LEARNING PERSONAL BASELINE ${report.baseline_samples}/${report.baseline_required} s`
                : 'LEARNING PERSONAL BASELINE: WAITING FOR VALID SAMPLES'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="simulation-purpose">
            <strong>Simulate a vital-sign event</strong>
            <p>Temporarily changes the replayed vital signs, so you can test detection, alerts and recovery.</p>
          </div>
          {INJECTABLE.map((item) => (
            <button
              key={item.kind}
              type="button"
              disabled={!report.baseline_ready || pendingKind !== null}
              onClick={() => void inject(item.kind)}
              className={`min-h-[44px] cursor-pointer rounded border px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${
                injection?.kind === item.kind
                  ? 'border-warning bg-warning font-bold text-black'
                  : 'border-line bg-black text-gray-300 hover:border-warning hover:text-warning'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            disabled={!injection || pendingKind !== null}
            onClick={() => void inject(null)}
            className="min-h-[44px] cursor-pointer rounded border border-line bg-black px-2.5 py-1 text-gray-300 hover:border-nominal disabled:cursor-not-allowed disabled:opacity-40"
          >
            CLEAR
          </button>
        </div>
      </div>

      {injection && (
        <div role="alert" className="mt-2 rounded border border-warning/60 bg-warning/10 px-2 py-1 text-warning">
          Vital-sign simulation active · Synthetic samples · {injection.description} ({Math.round(injection.elapsed_s)}/
          {Math.round(injection.duration_s)} s)
        </div>
      )}
      {requestError && (
        <div role="alert" className="mt-2 text-critical">
          {requestError}
        </div>
      )}

      <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
        {report.channels.map((ch) => (
          <li
            key={ch.channel}
            className={`rounded border bg-black px-2.5 py-1.5 ${
              ch.status === 'NORMAL' && !ch.evaluable ? NOT_EVALUABLE_CLASS : STATUS_CLASS[ch.status]
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">{CHANNEL_LABEL[ch.channel] ?? ch.channel}</span>
              <span>{ch.status === 'NORMAL' && !ch.evaluable ? 'NOT ASSESSED' : ch.status}</span>
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-gray-300">{ch.reason}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Engine-selected playbook with its ordered actions and the detector reason that opened it. */
export function EnginePlaybookCard({ playbook }: { playbook: ActivePlaybook }) {
  const acute = isAcuteVitalsPlaybook(playbook);
  return (
    <div
      className={`rounded border p-2.5 font-mono text-xs ${
        acute ? 'border-critical bg-critical/10' : 'border-nominal/50 bg-black'
      }`}
    >
      <div className={acute ? 'font-bold text-critical' : 'text-nominal'}>
        {acute ? 'OPENED BY VITALS ALARM: ' : 'ACTIVE ENGINE PLAYBOOK: '}
        {playbook.title ?? playbook.playbook_id}
      </div>
      {acute && playbook.causal_chain_summary?.[0] && (
        <div className="mt-1 text-gray-200">Trigger: {playbook.causal_chain_summary[0]}</div>
      )}
      {playbook.actions && playbook.actions.length > 0 ? (
        <ol className="mt-2 space-y-1 text-sm text-gray-100">
          {playbook.actions.map((action, i) => (
            <li key={action.action_id} className="flex gap-2">
              <span className="text-gray-500">{i + 1}.</span>
              <span>{action.label}</span>
            </li>
          ))}
        </ol>
      ) : (
        playbook.step_instruction && <div className="mt-1 text-gray-300">{playbook.step_instruction}</div>
      )}
    </div>
  );
}
