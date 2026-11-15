// Spatially invariant Left Slot 1 Life-Support Vitals Anchor (`VitalsAnchorCard`).
// Never unmounts or shifts position across `01 GATHER -> 02 EVALUATE -> 03 ACT`.
// Enforces Issue #11 (`BEAT_INTERVALS_NOT_AVAILABLE` honesty, null/NaN -> `--` without 0 coercion,
// `HOLD_LAST_VALID` badge) and embeds the zero-GC `WaveformCanvas2D` scrolling strip.

import React, { useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import type { TelemetryStatus } from '../lib/useTelemetry';
import { BentoCardShell } from '../instruments/BentoCardShell';
import { TabularCounter, type TabularCounterTone } from '../instruments/TabularCounter';
import {
  WaveformCanvas2D,
  type RingWaveformChannel,
} from '../instruments/WaveformCanvas2D';
import { FreshnessBadge, OriginBadge } from '../modules/provenance/ProvenanceInspector';
import { SQI_REJECT_THRESHOLD } from '../lib/scenario';

export interface VitalsAnchorCardProps {
  packet: TelemetryPacket;
  telemetryStatus: TelemetryStatus;
  className?: string;
}

const STRIP_CHANNELS: ReadonlyArray<{ id: RingWaveformChannel; short: string }> = [
  { id: 'hrBpm', short: 'ECG HR' },
  { id: 'pulseBpm', short: 'PPG' },
  { id: 'spo2Pct', short: 'SpO2' },
  { id: 'respBrpm', short: 'RESP' },
];

function hrTone(hr: number | null): TabularCounterTone {
  if (hr === null || !Number.isFinite(hr)) return 'caution';
  if (hr > 115 || hr < 45) return 'critical';
  if (hr > 100 || hr < 52) return 'caution';
  return 'nominal';
}

function spo2Tone(spo2: number | null): TabularCounterTone {
  if (spo2 === null || !Number.isFinite(spo2)) return 'caution';
  if (spo2 < 90) return 'critical';
  if (spo2 < 94) return 'caution';
  return 'nominal';
}

export function VitalsAnchorCard({
  packet,
  telemetryStatus,
  className = '',
}: VitalsAnchorCardProps) {
  const [stripChannel, setStripChannel] = useState<RingWaveformChannel>('hrBpm');

  const bio = packet.biometrics;
  const pm = packet.provenance_manifest;
  const dataOrigin = packet.is_local_simulation
    ? 'SIMULATED_SCENARIO_INPUT'
    : pm.biometrics_source;

  const freshness = telemetryStatus.isStale
    ? 'HELD_STALE'
    : telemetryStatus.heldSample
      ? 'HOLD_LAST_VALID'
      : 'FRESH';

  const hrvUnavailableReason =
    bio.hrv_unavailable_reason ??
    (bio.quality_flags?.includes('BEAT_INTERVALS_NOT_AVAILABLE')
      ? 'BEAT_INTERVALS_NOT_AVAILABLE'
      : null);

  const sqi = bio.sqi_score ?? null;
  const sqiRejected = sqi !== null && sqi < SQI_REJECT_THRESHOLD;

  return (
    <BentoCardShell
      id="left-slot-1-vitals-anchor"
      tier="root"
      eyebrow="LIFE-SUPPORT TELEMETRY ANCHOR"
      title="Primary Crew Vitals"
      badge={<OriginBadge origin={dataOrigin} />}
      headerActions={<FreshnessBadge freshness={freshness} ageMs={telemetryStatus.heldAgeMs} />}
      className={className}
      bodyClassName="space-y-2.5"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="ares-inner-well p-2.5">
          <TabularCounter
            label="Heart Rate"
            sublabel="ECG"
            value={bio.heart_rate_bpm}
            unit="bpm"
            decimals={0}
            tone={hrTone(bio.heart_rate_bpm)}
            size="lg"
            unavailableLabel="MISSING"
          />
        </div>

        <div className="ares-inner-well p-2.5">
          <TabularCounter
            label="Blood Oxygen"
            sublabel="SpO2"
            value={bio.spo2_percent}
            unit="%"
            decimals={1}
            tone={spo2Tone(bio.spo2_percent)}
            size="lg"
            unavailableLabel="MISSING"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Pulse Rate"
            sublabel="PPG"
            value={bio.pulse_rate_bpm}
            unit="bpm"
            decimals={0}
            tone="spatial"
            size="md"
            unavailableLabel="MISSING"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Respiration"
            sublabel="IMPEDANCE"
            value={bio.respiration_rate_brpm}
            unit="br/m"
            decimals={1}
            tone="display"
            size="md"
            unavailableLabel="MISSING"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Core Temp"
            sublabel="THERMAL"
            value={bio.core_temp_celsius ?? null}
            unit="degC"
            decimals={1}
            tone="display"
            size="sm"
            unavailableLabel="--"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Signal SQI"
            sublabel={sqiRejected ? 'REJECT <0.60' : 'GATE >=0.70'}
            value={sqi !== null ? sqi * 100 : null}
            unit="%"
            decimals={0}
            tone={sqiRejected ? 'critical' : 'nominal'}
            size="sm"
            unavailableLabel="N/A"
          />
        </div>
      </div>

      {/* Issue #11: Explicit HRV RMSSD availability / BEAT_INTERVALS_NOT_AVAILABLE disclosure */}
      <div className="ares-inner-well flex items-center justify-between gap-2 px-2.5 py-2">
        <TabularCounter
          label="Autonomic HRV (RMSSD)"
          sublabel="R-R STREAM"
          value={hrvUnavailableReason ? null : (bio.hrv_rmssd_ms ?? null)}
          unit="ms"
          decimals={1}
          tone="spatial"
          size="sm"
          unavailableLabel="UNAVAILABLE"
          unavailableReason={hrvUnavailableReason}
        />
        <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
          T+{packet.relative_recording_time_s.toFixed(0)}s
        </span>
      </div>

      {/* Waveform channel switcher + zero-GC Canvas2D scrolling strip */}
      <div className="space-y-1.5">
        <div
          role="tablist"
          aria-label="Scrolling waveform channel"
          className="grid grid-cols-4 gap-1"
        >
          {STRIP_CHANNELS.map((ch) => {
            const active = stripChannel === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStripChannel(ch.id)}
                className={`ares-interactive rounded-md border py-1 font-mono text-[10px] font-semibold tracking-wider ${
                  active
                    ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                    : 'border-white/10 bg-black/50 text-[var(--color-ink-meta)]'
                }`}
              >
                {ch.short}
              </button>
            );
          })}
        </div>

        <WaveformCanvas2D channel={stripChannel} windowSec={24} heightPx={64} />
      </div>
    </BentoCardShell>
  );
}
