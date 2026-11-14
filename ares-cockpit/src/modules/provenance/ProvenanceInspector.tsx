import { useId, useState } from 'react';
import { buildIndicatorMetadata } from '../../lib/telemetryValidation';
import type { TelemetryStatus } from '../../lib/useTelemetry';
import type { DataOrigin, FreshnessStatus, TelemetryPacket } from '../../types/telemetry';

function originLabel(origin: DataOrigin): string {
  switch (origin) {
    case 'RECORDED_TERRESTRIAL_BIDMC_CSV':
      return 'RECORDED BIDMC';
    case 'RECORDED_TERRESTRIAL_WAVEFORM':
      return 'RECORDED WAVEFORM';
    case 'DERIVED_FROM_RECORDED_BIDMC':
      return 'DERIVED (BIDMC)';
    case 'DERIVED_FROM_HYBRID_SCENARIO':
      return 'DERIVED (HYBRID)';
    case 'DERIVED_COMPUTED':
      return 'DERIVED';
    case 'SIMULATED_SCENARIO_INPUT':
      return 'SIMULATED';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
  }
}

function originClass(origin: DataOrigin): string {
  switch (origin) {
    case 'RECORDED_TERRESTRIAL_BIDMC_CSV':
    case 'RECORDED_TERRESTRIAL_WAVEFORM':
      return 'border-ok/60 bg-ok/10 text-ok';
    case 'DERIVED_FROM_RECORDED_BIDMC':
    case 'DERIVED_FROM_HYBRID_SCENARIO':
    case 'DERIVED_COMPUTED':
      return 'border-nominal/60 bg-nominal/10 text-nominal';
    case 'SIMULATED_SCENARIO_INPUT':
      return 'border-warning/60 bg-warning/10 text-warning';
    case 'UNAVAILABLE':
      return 'border-gray-600 bg-gray-900 text-gray-400';
  }
}

function freshnessClass(freshness: FreshnessStatus): string {
  switch (freshness) {
    case 'FRESH':
      return 'border-ok/50 text-ok';
    case 'HOLD_LAST_VALID':
      return 'border-nominal/60 text-nominal';
    case 'HELD_STALE':
      return 'border-warning text-warning';
    case 'UNAVAILABLE':
      return 'border-advisory/60 text-advisory';
    case 'INVALID':
      return 'border-critical text-critical';
  }
}

export function OriginBadge({ origin }: { origin: DataOrigin }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none ${originClass(origin)}`}>
      {originLabel(origin)}
    </span>
  );
}

export function FreshnessBadge({ freshness, ageMs }: { freshness: FreshnessStatus; ageMs?: number | null }) {
  const text =
    freshness === 'HOLD_LAST_VALID' && typeof ageMs === 'number'
      ? `HOLD_LAST_VALID (+${(ageMs / 1000).toFixed(1)}s)`
      : freshness;
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none ${freshnessClass(freshness)}`}>
      {text}
    </span>
  );
}

export function ProvenanceBanner({
  packet,
  status,
}: {
  packet: TelemetryPacket;
  status: TelemetryStatus;
}) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  const pm = packet.provenance_manifest;
  const isBidmc = pm.biometrics_source === 'RECORDED_TERRESTRIAL_BIDMC_CSV';
  const missing = packet.biometrics.missing_channels ?? [];
  const flags = Array.from(
    new Set([
      ...(packet.quality_flags ?? []),
      ...(packet.biometrics.quality_flags ?? []),
      ...(status.heldSample ? ['HOLD_LAST_VALID'] : []),
    ]),
  );

  const indicators = buildIndicatorMetadata(packet, {
    heldSample: status.heldSample,
    heldAgeMs: status.heldAgeMs,
    isStale: status.isStale,
    hasRejectedFrame: status.rejectedFrames > 0,
  });

  const freshnessState: FreshnessStatus =
    status.validationError && status.isStale
      ? 'INVALID'
      : status.isStale
        ? 'HELD_STALE'
        : status.heldSample
          ? 'HOLD_LAST_VALID'
          : 'FRESH';

  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <OriginBadge origin={packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : pm.biometrics_source} />
          <FreshnessBadge freshness={freshnessState} ageMs={status.heldAgeMs} />

          <span className="rounded border border-line bg-black px-2 py-0.5 text-[11px] text-gray-200">
            {isBidmc
              ? `${pm.dataset_provenance ?? 'BIDMC v1.0.0'} (${pm.manifest_sha256_verified ? 'MANIFEST SHA-256 verified' : 'UNVERIFIED'})`
              : pm.dataset_provenance ?? 'LOCAL WHAT-IF SIMULATOR'}
          </span>

          <span className="text-[11px] text-gray-400">
            record: <span className="text-gray-200">{packet.source_record_id}</span>
          </span>
          <span className="text-[11px] text-gray-400">
            t_rec: <span className="text-gray-200">{packet.relative_recording_time_s.toFixed(1)} s</span>
          </span>
          <span className="text-[11px] text-gray-500">
            {pm.biometrics_native_rate_hz.toFixed(1)} Hz native @ {pm.ui_refresh_rate_hz.toFixed(0)} Hz UI
          </span>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={() => setOpen((v) => !v)}
          className="cursor-pointer rounded border border-nominal/70 px-2.5 py-0.5 text-[11px] text-nominal hover:bg-nominal/15"
        >
          {open ? 'HIDE PROVENANCE' : 'INSPECT PROVENANCE'}
        </button>
      </div>

      {/* Missing channels + quality flags row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="text-gray-500">MODE:</span>
        <span className="rounded border border-line px-1.5 py-0.5 text-gray-300">{pm.scenario_overlay_mode}</span>

        {missing.length > 0 && (
          <>
            <span className="ml-1 text-advisory">MISSING CHANNELS ({missing.length}):</span>
            {missing.map((ch) => (
              <span key={ch} className="rounded border border-advisory/60 bg-advisory/10 px-1.5 py-0.5 text-advisory">
                {ch}
              </span>
            ))}
          </>
        )}

        {flags.length > 0 && (
          <>
            <span className="ml-1 text-gray-500">QUALITY FLAGS:</span>
            {flags.map((flag) => (
              <span
                key={flag}
                className={`rounded border px-1.5 py-0.5 ${
                  flag === 'MANIFEST_SHA256_VERIFIED'
                    ? 'border-ok/50 text-ok'
                    : flag === 'BEAT_INTERVALS_NOT_AVAILABLE' || flag === 'CHANNEL_NAN_DROPOUT'
                      ? 'border-advisory/60 text-advisory'
                      : flag === 'HOLD_LAST_VALID'
                        ? 'border-nominal/50 text-nominal'
                        : 'border-gray-700 text-gray-300'
                }`}
              >
                {flag}
              </span>
            ))}
          </>
        )}

        {status.rejectedFrames > 0 && (
          <span className="rounded border border-critical bg-critical/10 px-1.5 py-0.5 text-critical">
            INVALID FRAMES REJECTED: {status.rejectedFrames}
            {status.validationError ? ` (${status.validationError})` : ''}
          </span>
        )}
      </div>

      {/* Accessible detailed inspection panel */}
      {open && (
        <div
          id={drawerId}
          role="region"
          aria-label="Per-indicator provenance and freshness details"
          className="mt-2 max-h-60 overflow-y-auto rounded border border-line bg-black p-2.5"
        >
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-400">
            <span>PER-INDICATOR PROVENANCE, FRESHNESS &amp; AVAILABILITY REGISTRY</span>
            <span>
              {status.lastSyncLatencyUs !== null ? `Last POST /api/stress-test: ${status.lastSyncLatencyUs} us` : 'Read-only stream'}
            </span>
          </div>
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-line text-gray-500">
                <th className="py-1 pr-2">Indicator</th>
                <th className="py-1 pr-2">Value</th>
                <th className="py-1 pr-2">Origin</th>
                <th className="py-1 pr-2">Freshness</th>
                <th className="py-1 pr-2">Rate / Time</th>
                <th className="py-1">Availability / Evidence</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((ind) => (
                <tr key={ind.id} className="border-b border-line/50 align-top">
                  <td className="py-1 pr-2 text-gray-200">{ind.label}</td>
                  <td className="py-1 pr-2 text-white">{ind.valueText}</td>
                  <td className="py-1 pr-2">
                    <OriginBadge origin={ind.origin} />
                  </td>
                  <td className="py-1 pr-2">
                    <FreshnessBadge freshness={ind.freshness} ageMs={ind.ageMs} />
                  </td>
                  <td className="py-1 pr-2 text-gray-400">
                    {ind.nativeRateHz ? `${ind.nativeRateHz} Hz` : '--'}
                    {ind.measurementTimeS !== null ? ` @ ${ind.measurementTimeS.toFixed(1)}s` : ''}
                  </td>
                  <td className="py-1 text-gray-400">{ind.availabilityReason ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
