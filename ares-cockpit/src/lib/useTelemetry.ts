import { useEffect, useRef, useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import { buildPacket, type WhatIf } from './scenario';
import { isValidTelemetryPacket } from './validateTelemetry';

export const ENGINE_HTTP_URL = 'http://127.0.0.1:8080';
export const ENGINE_WS_URL = 'ws://127.0.0.1:8080/ws/telemetry';

export type LinkState = 'ENGINE_LIVE' | 'LOCAL_SIMULATION';

interface StressTestPayload {
  cabin_ppco2_mmhg: number;
  ared_workload_pct: number;
  lbnp_pressure_mmhg: number;
  mission_elapsed_days: number;
}

function toStressTestPayload(w: WhatIf): StressTestPayload {
  return {
    cabin_ppco2_mmhg: w.ppco2_mmhg,
    ared_workload_pct: w.ared_load_pct,
    lbnp_pressure_mmhg: w.lbnp_mmhg,
    mission_elapsed_days: w.mission_day,
  };
}

/**
 * Connects to the loopback ares-server-cli WebSocket (/ws/telemetry, read-only) and hydrates via
 * GET /api/snapshot on cold start. Sends What-If updates via POST /api/stress-test (only in simulation mode).
 * Falls back to the local deterministic scenario model when the engine is offline.
 */
export function useTelemetry(whatIf: WhatIf, thrombusConfirmed: boolean | null, lastScanDay: number) {
  const [packet, setPacket] = useState<TelemetryPacket>(() => buildPacket(whatIf, 0, thrombusConfirmed, lastScanDay));
  const [link, setLink] = useState<LinkState>('LOCAL_SIMULATION');
  const [recomputeLatencyUs, setRecomputeLatencyUs] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sentInitialRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputs = useRef({ whatIf, thrombusConfirmed, lastScanDay });
  inputs.current = { whatIf, thrombusConfirmed, lastScanDay };

  const postStressTest = (w: WhatIf) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetch(`${ENGINE_HTTP_URL}/api/stress-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toStressTestPayload(w)),
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { recompute_latency_us?: unknown } | null) => {
        if (body && typeof body.recompute_latency_us === 'number') {
          setRecomputeLatencyUs(body.recompute_latency_us);
        }
        // Ignore body.packet for rendering: WebSocket stream is the single source of truth.
      })
      .catch(() => {
        /* aborted or offline */
      });
  };

  // Cold start snapshot + read-only WebSocket with reconnect.
  useEffect(() => {
    let closed = false;
    let retry: number | undefined;

    fetch(`${ENGINE_HTTP_URL}/api/snapshot`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!closed && isValidTelemetryPacket(data)) {
          setPacket(data);
        }
      })
      .catch(() => {
        /* engine offline; local simulation remains active */
      });

    const connect = () => {
      const ws = new WebSocket(ENGINE_WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        setLink('ENGINE_LIVE');
        // Send initial What-If once on first connection; server retains state across reconnects.
        if (!sentInitialRef.current) {
          sentInitialRef.current = true;
          postStressTest(inputs.current.whatIf);
        }
      };
      ws.onmessage = (ev) => {
        try {
          const parsed: unknown = JSON.parse(String(ev.data));
          if (isValidTelemetryPacket(parsed)) {
            setPacket(parsed);
          }
        } catch {
          /* malformed JSON ignored; keep last valid packet */
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        setLink('LOCAL_SIMULATION');
        if (!closed) retry = window.setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      window.clearTimeout(retry);
      abortRef.current?.abort();
      wsRef.current?.close();
    };
  }, []);

  // Forward What-If changes via POST /api/stress-test when connected (skip in pure BIDMC replay).
  useEffect(() => {
    if (link !== 'ENGINE_LIVE') return;
    if (packet.provenance_manifest.scenario_overlay_mode === 'NONE_PURE_REPLAY') return;
    postStressTest(whatIf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatIf.ppco2_mmhg, whatIf.ared_load_pct, whatIf.lbnp_mmhg, whatIf.mission_day, link]);

  // Local 20 Hz simulation loop when offline.
  useEffect(() => {
    if (link === 'ENGINE_LIVE') return;
    let tick = 0;
    const id = window.setInterval(() => {
      tick += 1;
      setPacket(buildPacket(inputs.current.whatIf, tick, inputs.current.thrombusConfirmed, inputs.current.lastScanDay));
    }, 50);
    return () => window.clearInterval(id);
  }, [link]);

  return { packet, link, recomputeLatencyUs };
}
