// Statistical Vitals Anomaly & Contactless DSP Diagnostics Lens (`AnomalyDiagnosticsLens`).
// Displays:
// - Engine Robust Median/MAD Z-Score, Page-Hinkley CUSUM drift, and joint HR-SpO2-RESP
//   Mahalanobis D^2 status (`VitalsAnomalyPanel`)
// - Honest distinction between live Rust anomaly detector and local preview mode
// - Collapsible synthetic stress-event injector (`DESATURATION_*`, `TACHYCARDIA_*`,
//   `COMBINED_SUBTLE`, `SENSOR_DETACH`, `CLEAR`)
// - 60 GHz Contactless Doppler Radar & Vocal Jitter DSP SQI >= 0.70 gate card

import React, { useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import type {
  AnomalyInjectionKind,
  AnomalyInjectionResult,
} from '../lib/useTelemetry';
import type { ScenarioState } from '../lib/scenario';
import { VitalsAnomalyPanel } from '../modules/vitals-anomaly/VitalsAnomalyPanel';
import { announcePolite } from '../stores/a11yAnnouncer';

export interface AnomalyDiagnosticsLensProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  engineLive: boolean;
  httpBaseUrl: string;
  onInjectAnomaly?: (
    kind: AnomalyInjectionKind,
    durationS?: number,
  ) => Promise<AnomalyInjectionResult>;
}

const EXTENDED_SYNTHETIC_EVENTS: ReadonlyArray<{
  kind: Exclude<AnomalyInjectionKind, null | 'CLEAR'>;
  label: string;
}> = [
  { kind: 'DESATURATION_FAST', label: 'FAST DESAT' },
  { kind: 'DESATURATION_MODERATE', label: 'MOD DESAT' },
  { kind: 'DESATURATION_SLOW', label: 'SLOW DESAT' },
  { kind: 'TACHYCARDIA_FAST', label: 'FAST TACHY' },
  { kind: 'TACHYCARDIA_MODERATE', label: 'MOD TACHY' },
  { kind: 'TACHYCARDIA_SLOW', label: 'SLOW TACHY' },
  { kind: 'COMBINED_SUBTLE', label: 'COMBINED D2' },
  { kind: 'SENSOR_DETACH', label: 'SENSOR DETACH' },
];

export function AnomalyDiagnosticsLens({
  packet,
  scenario,
  engineLive,
  httpBaseUrl,
  onInjectAnomaly,
}: AnomalyDiagnosticsLensProps) {
  const [injectorExpanded, setInjectorExpanded] = useState(false);
  const [injectStatusMsg, setInjectStatusMsg] = useState<string | null>(null);

  const sqi = packet.biometrics.sqi_score ?? scenario.sqi;
  const sqiAccepted = sqi >= 0.7;

  const triggerExtendedInjection = async (kind: AnomalyInjectionKind) => {
    setInjectStatusMsg(null);
    if (!onInjectAnomaly) return;
    const res = await onInjectAnomaly(kind, 45);
    if (res.ok) {
      const msg =
        kind === null || kind === 'CLEAR'
          ? 'Cleared synthetic anomaly event.'
          : `Injected synthetic telemetry event ${kind}.`;
      setInjectStatusMsg(msg);
      announcePolite(msg);
    } else {
      setInjectStatusMsg(res.error ?? 'Engine offline or baseline still warming up.');
    }
  };

  return (
    <div className="space-y-2.5">
      <VitalsAnomalyPanel
        report={packet.vitals_anomaly}
        engineLive={engineLive}
        httpBaseUrl={httpBaseUrl}
        onInjectAnomaly={onInjectAnomaly}
      />

      {/* Contactless 60 GHz Radar + Vocal Jitter DSP & SQI >= 0.70 Gate */}
      <div className="ares-inner-well space-y-1.5 p-3 font-mono text-[10px]">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--color-ink-display)]">
            CONTACTLESS DSP &amp; SQI GATE
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 font-semibold ${
              sqiAccepted
                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                : 'border-amber-400/70 bg-amber-500/15 text-amber-200'
            }`}
          >
            SQI {sqi.toFixed(2)} {sqiAccepted ? '(>= 0.70 LOCKED)' : '(< 0.70 GATED)'}
          </span>
        </div>
        <p className="leading-relaxed text-[var(--color-ink-meta)]">
          Evaluates per-channel Robust Median/MAD Z-Score, Page-Hinkley CUSUM drift, joint
          HR-SpO2-RESP Mahalanobis D^2, and contactless 60 GHz radar / vocal jitter quality
          with zero cloud inference.
        </p>
      </div>

      {/* Collapsible Full Synthetic Event Stress-Injector Drawer */}
      <div className="ares-inner-well p-2.5 font-mono text-[10px]">
        <button
          type="button"
          aria-expanded={injectorExpanded}
          onClick={() => setInjectorExpanded((v) => !v)}
          className="ares-interactive flex w-full items-center justify-between text-left font-semibold text-cyan-200"
        >
          <span>EXTENDED SYNTHETIC ANOMALY BENCH (8 PROFILES)</span>
          <span>{injectorExpanded ? '[-]' : '[+]'}</span>
        </button>

        {injectorExpanded ? (
          <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
            <div className="text-[9px] text-amber-300">
              NOTE: Synthetic injections clearly flag `[SYNTHETIC EVENT ACTIVE, NOT RECORDED DATA]`
              and require live Rust engine connection (`ares-server-cli`).
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {EXTENDED_SYNTHETIC_EVENTS.map((ev) => (
                <button
                  key={ev.kind}
                  type="button"
                  disabled={!engineLive}
                  onClick={() => void triggerExtendedInjection(ev.kind)}
                  className="ares-touch-target ares-interactive rounded-lg border border-white/15 bg-black px-2 font-semibold text-[var(--color-ink-display)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ev.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!engineLive}
              onClick={() => void triggerExtendedInjection('CLEAR')}
              className="ares-touch-target ares-interactive w-full rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-2 font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              CLEAR ACTIVE SYNTHETIC EVENT
            </button>
            {injectStatusMsg ? (
              <div className="text-[9px] text-cyan-300">{injectStatusMsg}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
