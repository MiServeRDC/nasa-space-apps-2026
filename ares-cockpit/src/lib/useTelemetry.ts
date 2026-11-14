import { useEffect, useRef, useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import { buildPacket, type WhatIf } from './scenario';

export type LinkState = 'ENGINE_LIVE' | 'ENGINE_STALE' | 'LOCAL_SIMULATION';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || finite(value);

export function isCockpitPacket(value: unknown): value is TelemetryPacket {
  if (!record(value)) return false;
  const { biometrics: b, safety_margins: s, provenance_manifest: p } = value;
  return record(b) && record(s) && record(p)
    && finite(value.timestamp_ms) && Number.isInteger(value.timestamp_ms) && value.timestamp_ms >= 0
    && finite(value.relative_recording_time_s) && value.relative_recording_time_s >= 0
    && typeof value.source_record_id === 'string' && value.source_record_id.length > 0
    && typeof value.astronaut_id === 'string'
    && ['RECORDED_TERRESTRIAL_BIDMC_CSV', 'RECORDED_TERRESTRIAL_WAVEFORM', 'SIMULATED_SCENARIO_INPUT'].some(k => k === p.biometrics_source)
    && finite(p.biometrics_native_rate_hz) && p.biometrics_native_rate_hz > 0
    && finite(p.ui_refresh_rate_hz) && p.ui_refresh_rate_hz > 0
    && ['NONE_PURE_REPLAY', 'SIMULATED_WHATIF_SCENARIO'].some(k => k === p.scenario_overlay_mode)
    && ['heart_rate_bpm', 'pulse_rate_bpm', 'respiration_rate_brpm', 'spo2_percent'].every(k => nullableNumber(b[k]))
    && (b.missing_channels === undefined || (Array.isArray(b.missing_channels) && b.missing_channels.every(k => typeof k === 'string')))
    && ['DERIVED_FROM_RECORDED_BIDMC', 'DERIVED_FROM_HYBRID_SCENARIO'].some(k => k === s.provenance)
    && ['NOMINAL', 'ADVISORY', 'WARNING', 'CRITICAL', 'DATA_DEGRADED_MISSING_CHANNELS'].some(k => k === s.alarm_level)
    && nullableNumber(s.med_stl_rho_robustness) && nullableNumber(s.mission_readiness_index)
    && (s.time_to_violation_days === undefined || nullableNumber(s.time_to_violation_days));
}

export function useTelemetry(whatIf: WhatIf, thrombusConfirmed: boolean | null, lastScanDay: number, sendWhatIf: boolean) {
  const [remote, setRemote] = useState<TelemetryPacket | null>(null);
  const [link, setLink] = useState<LinkState>('LOCAL_SIMULATION');
  const [connection, setConnection] = useState(0);
  const [commandError, setCommandError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queued = useRef<string | null>(null);
  const sending = useRef(false);
  const { ppco2_mmhg, ared_load_pct, lbnp_mmhg, mission_day } = whatIf;

  useEffect(() => {
    let closed = false;
    let retry: number | undefined;
    let freshness: number | undefined;
    const connect = () => {
      const url = new URL('/ws/telemetry', window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      wsRef.current = ws;
      const active = () => !closed && wsRef.current === ws;
      ws.onopen = () => {
        if (!active()) return;
        setConnection(n => n + 1);
        freshness = window.setTimeout(() => setLink('ENGINE_STALE'), 2000);
      };
      ws.onmessage = ({ data }) => {
        if (!active()) return;
        try {
          const packet: unknown = JSON.parse(String(data));
          if (!isCockpitPacket(packet)) {
            setLink('ENGINE_STALE');
            return;
          }
          setRemote(packet);
          setLink('ENGINE_LIVE');
          window.clearTimeout(freshness);
          freshness = window.setTimeout(() => setLink('ENGINE_STALE'), 2000);
        } catch {
          setLink('ENGINE_STALE');
        }
      };
      ws.onclose = () => {
        if (!active()) return;
        window.clearTimeout(freshness);
        wsRef.current = null;
        setLink(previous => previous === 'LOCAL_SIMULATION' ? previous : 'ENGINE_STALE');
        retry = window.setTimeout(connect, 3000);
      };
      ws.onerror = () => { if (active()) ws.close(); };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      window.clearTimeout(freshness);
      const socket = wsRef.current;
      wsRef.current = null;
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!sendWhatIf || wsRef.current?.readyState !== WebSocket.OPEN) return;
    queued.current = JSON.stringify({
      cabin_ppco2_mmhg: ppco2_mmhg, ared_workload_pct: ared_load_pct,
      lbnp_pressure_mmhg: lbnp_mmhg, mission_elapsed_days: mission_day,
    });
    if (sending.current) return;
    sending.current = true;
    void (async () => {
      try {
        while (queued.current !== null) {
          const body = queued.current;
          queued.current = null;
          try {
            const response = await fetch('/api/stress-test', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
            });
            setCommandError(response.ok ? null : `What-If rejected (HTTP ${response.status})`);
          } catch {
            setCommandError('What-If update could not reach the server.');
          }
        }
      } finally {
        sending.current = false;
      }
    })();
  }, [connection, sendWhatIf, ppco2_mmhg, ared_load_pct, lbnp_mmhg, mission_day]);

  return { packet: remote ?? buildPacket(whatIf, 0, thrombusConfirmed, lastScanDay), link, commandError };
}
