import { useEffect, useRef, useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import { buildPacket, type WhatIf } from './scenario';

export const ENGINE_WS_URL = 'ws://127.0.0.1:8080/ws';

export type LinkState = 'ENGINE_LIVE' | 'LOCAL_SIMULATION';

/**
 * Connects to the loopback ares-server-cli WebSocket (20 Hz). When the engine is not running,
 * falls back to the local deterministic scenario model so the cockpit stays usable offline.
 */
export function useTelemetry(whatIf: WhatIf, thrombusConfirmed: boolean | null) {
  const [packet, setPacket] = useState<TelemetryPacket>(() => buildPacket(whatIf, 0, thrombusConfirmed));
  const [link, setLink] = useState<LinkState>('LOCAL_SIMULATION');
  const wsRef = useRef<WebSocket | null>(null);
  const inputs = useRef({ whatIf, thrombusConfirmed });
  inputs.current = { whatIf, thrombusConfirmed };

  // Engine link with periodic reconnect.
  useEffect(() => {
    let closed = false;
    let retry: number | undefined;
    const connect = () => {
      const ws = new WebSocket(ENGINE_WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setLink('ENGINE_LIVE');
      ws.onmessage = (ev) => {
        try {
          setPacket(JSON.parse(String(ev.data)) as TelemetryPacket);
        } catch {
          /* malformed frame ignored; never fabricate values */
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
      wsRef.current?.close();
    };
  }, []);

  // Forward What-If inputs to the engine when connected.
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'what_if', ...whatIf, pocus_thrombus_confirmed: thrombusConfirmed }));
    }
  }, [whatIf, thrombusConfirmed]);

  // Local 20 Hz simulation loop when offline.
  useEffect(() => {
    if (link === 'ENGINE_LIVE') return;
    let tick = 0;
    const id = window.setInterval(() => {
      tick += 1;
      setPacket(buildPacket(inputs.current.whatIf, tick, inputs.current.thrombusConfirmed));
    }, 50);
    return () => window.clearInterval(id);
  }, [link]);

  return { packet, link };
}
