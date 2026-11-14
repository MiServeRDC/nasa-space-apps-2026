import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import { buildPacket, type WhatIf } from './scenario';
import { isValidTelemetryPayload, normalizeTelemetryPacket } from './telemetryValidation';

const DEFAULT_HTTP_BASE = 'http://127.0.0.1:8080';

export const ENGINE_HTTP_URL: string =
  (import.meta.env?.VITE_ARES_HTTP_URL as string | undefined) || DEFAULT_HTTP_BASE;

export const ENGINE_WS_URL: string =
  (import.meta.env?.VITE_ARES_WS_URL as string | undefined) ||
  `${ENGINE_HTTP_URL.replace(/^http/i, 'ws')}/ws/telemetry`;

export type LinkState = 'ENGINE_LIVE' | 'LOCAL_SIMULATION';

export interface RecordedHistoryPoint {
  relativeTimeS: number;
  hr: number | null;
  pulse: number | null;
  spo2: number | null;
  resp: number | null;
}

export interface TelemetryStatus {
  wsConnected: boolean;
  heldSample: boolean;
  heldAgeMs: number;
  isStale: boolean;
  rejectedFrames: number;
  validationError: string | null;
  lastSyncLatencyUs: number | null;
  lastValidAtMs: number | null;
}

function buildStressTestPayload(
  whatIf: WhatIf,
  thrombusConfirmed: boolean | null,
  sourceRecordId: string,
) {
  const aredDailyLoadKgf = Math.round((whatIf.ared_load_pct / 100) * 160 * 10) / 10;
  return {
    source_record_id: sourceRecordId || 'bidmc_01',
    flight_day: Math.max(0, Math.round(whatIf.mission_day)),
    ared_daily_load_kgf: aredDailyLoadKgf,
    radiation_dose_rate_msv_d: 0.45,
    lbnp_active: whatIf.lbnp_mmhg < 0,
    lbnp_pressure_mmhg: whatIf.lbnp_mmhg,
    pocus_thrombus_confirmed: thrombusConfirmed === true,
    systolic_bp_drop_mmhg: Math.abs(whatIf.lbnp_mmhg) * 0.25,
  };
}

function buildFertechStressTestPayload(whatIf: WhatIf) {
  return {
    cabin_ppco2_mmhg: whatIf.ppco2_mmhg,
    ared_workload_pct: whatIf.ared_load_pct,
    lbnp_pressure_mmhg: whatIf.lbnp_mmhg,
    mission_elapsed_days: whatIf.mission_day,
  };
}

/**
 * Connects to `ares-server-cli`:
 * - Cold-start snapshot from `GET /api/snapshot`
 * - Live 20 Hz stream on `ws://127.0.0.1:8080/ws/telemetry`
 * - Active What-If synchronization via `POST /api/stress-test` on open/reconnect and on change
 * - Strict runtime validation before accepting any frame (invalid frames never clobber last valid data)
 * - Clean separation between authoritative engine stream and offline local simulation
 */
export function useTelemetry(
  whatIf: WhatIf,
  thrombusConfirmed: boolean | null,
  lastScanDay: number,
  whatIfOverlayActive: boolean,
) {
  const [livePacket, setLivePacket] = useState<TelemetryPacket | null>(null);
  const [localPacket, setLocalPacket] = useState<TelemetryPacket>(() =>
    buildPacket(whatIf, 0, thrombusConfirmed, lastScanDay),
  );
  const [link, setLink] = useState<LinkState>('LOCAL_SIMULATION');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [rejectedFrames, setRejectedFrames] = useState<number>(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastSyncLatencyUs, setLastSyncLatencyUs] = useState<number | null>(null);
  const [heldSample, setHeldSample] = useState<boolean>(false);
  const [heldAgeMs, setHeldAgeMs] = useState<number>(0);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [lastValidAtMs, setLastValidAtMs] = useState<number | null>(null);
  const [recordedHistory, setRecordedHistory] = useState<RecordedHistoryPoint[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const socketGenRef = useRef<number>(0);
  const lastSampleRecTimeRef = useRef<number | null>(null);
  const sampleFirstObservedAtRef = useRef<number>(Date.now());
  const lastValidAtRef = useRef<number | null>(null);
  const inputsRef = useRef({ whatIf, thrombusConfirmed, lastScanDay, whatIfOverlayActive });
  inputsRef.current = { whatIf, thrombusConfirmed, lastScanDay, whatIfOverlayActive };
  const activeSourceIdRef = useRef<string>('bidmc_01');

  const acceptRawPayload = useCallback((raw: unknown, originLabel: string): boolean => {
    if (!isValidTelemetryPayload(raw)) {
      console.warn(`[ares-cockpit] Rejected invalid telemetry payload from ${originLabel}:`, raw);
      setRejectedFrames((n) => n + 1);
      setValidationError(`Rejected malformed ${originLabel} payload at ${new Date().toISOString().slice(11, 19)}Z`);
      return false;
    }

    const normalized = normalizeTelemetryPacket(raw);
    if (!normalized) {
      setRejectedFrames((n) => n + 1);
      setValidationError(`Failed to normalize ${originLabel} payload`);
      return false;
    }

    const now = Date.now();
    activeSourceIdRef.current = normalized.source_record_id;
    lastValidAtRef.current = now;
    setLastValidAtMs(now);
    setIsStale(false);
    setValidationError(null);

    const recT = normalized.relative_recording_time_s;
    const is1HzHeldSource =
      normalized.provenance_manifest.biometrics_native_rate_hz <= 1.5 &&
      normalized.provenance_manifest.ui_refresh_rate_hz > normalized.provenance_manifest.biometrics_native_rate_hz;

    if (lastSampleRecTimeRef.current !== null && Math.abs(recT - lastSampleRecTimeRef.current) < 1e-6 && is1HzHeldSource) {
      setHeldSample(true);
      setHeldAgeMs(Math.max(0, now - sampleFirstObservedAtRef.current));
    } else {
      lastSampleRecTimeRef.current = recT;
      sampleFirstObservedAtRef.current = now;
      setHeldSample(false);
      setHeldAgeMs(0);

      if (normalized.provenance_manifest.biometrics_source === 'RECORDED_TERRESTRIAL_BIDMC_CSV') {
        setRecordedHistory((prev) => {
          if (prev.length > 0 && Math.abs(prev[prev.length - 1].relativeTimeS - recT) < 1e-6) {
            return prev;
          }
          const next: RecordedHistoryPoint = {
            relativeTimeS: recT,
            hr: normalized.biometrics.heart_rate_bpm,
            pulse: normalized.biometrics.pulse_rate_bpm,
            spo2: normalized.biometrics.spo2_percent,
            resp: normalized.biometrics.respiration_rate_brpm,
          };
          const merged = [...prev, next];
          return merged.length > 60 ? merged.slice(merged.length - 60) : merged;
        });
      }
    }

    setLivePacket(normalized);
    setLink('ENGINE_LIVE');
    return true;
  }, []);

  const postStressTestOverride = useCallback(
    async (w: WhatIf, thrombus: boolean | null): Promise<void> => {
      const payload = buildStressTestPayload(w, thrombus, activeSourceIdRef.current);
      try {
        const start = performance.now();
        let res = await fetch(`${ENGINE_HTTP_URL}/api/stress-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // Fallback if backend uses strict 4-field schema DTO (PR #22)
        if (res.status === 400 || res.status === 422) {
          res = await fetch(`${ENGINE_HTTP_URL}/api/stress-test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildFertechStressTestPayload(w)),
          });
        }

        if (!res.ok) return;
        const body = (await res.json()) as unknown;
        const elapsedUs = Math.round((performance.now() - start) * 1000);
        if (
          typeof body === 'object' &&
          body !== null &&
          'recompute_latency_us' in body &&
          typeof (body as Record<string, unknown>).recompute_latency_us === 'number'
        ) {
          setLastSyncLatencyUs((body as Record<string, unknown>).recompute_latency_us as number);
        } else {
          setLastSyncLatencyUs(elapsedUs);
        }
        // Only apply HTTP response if WS stream is not already delivering frames,
        // preventing out-of-order HTTP responses from overwriting newer WS ticks.
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          const candidate =
            typeof body === 'object' && body !== null && 'packet' in body
              ? (body as Record<string, unknown>).packet
              : body;
          acceptRawPayload(candidate, 'POST /api/stress-test');
        }
      } catch {
        // Engine offline or unreachable; local simulation remains separate
      }
    },
    [acceptRawPayload],
  );

  // 1. Initial cold-start fetch from GET /api/snapshot + WebSocket subscription with reconnect.
  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;
    const abortCtrl = new AbortController();

    const fetchInitialSnapshot = async () => {
      try {
        const res = await fetch(`${ENGINE_HTTP_URL}/api/snapshot`, { signal: abortCtrl.signal });
        if (!res.ok || disposed) return;
        const json = (await res.json()) as unknown;
        if (!disposed) {
          acceptRawPayload(json, 'GET /api/snapshot');
        }
      } catch {
        // Offline or engine not started yet; WS retry loop handles reconnect
      }
    };

    const connectWs = () => {
      if (disposed) return;
      const gen = ++socketGenRef.current;
      let ws: WebSocket;
      try {
        ws = new WebSocket(ENGINE_WS_URL);
      } catch {
        if (!disposed) retryTimer = window.setTimeout(connectWs, 3000);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed || gen !== socketGenRef.current) {
          ws.close();
          return;
        }
        setWsConnected(true);
        setLink('ENGINE_LIVE');
        // Re-sync active What-If override when socket opens or reconnects.
        const cur = inputsRef.current;
        if (cur.whatIfOverlayActive) {
          void postStressTestOverride(cur.whatIf, cur.thrombusConfirmed);
        }
      };

      ws.onmessage = (ev) => {
        if (disposed || gen !== socketGenRef.current) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(ev.data));
        } catch (err) {
          console.warn('[ares-cockpit] Rejected non-JSON WebSocket frame:', err);
          setRejectedFrames((n) => n + 1);
          setValidationError(`Malformed JSON frame at ${new Date().toISOString().slice(11, 19)}Z`);
          return;
        }
        acceptRawPayload(parsed, 'WS /ws/telemetry');
      };

      ws.onclose = () => {
        if (gen !== socketGenRef.current) return;
        wsRef.current = null;
        setWsConnected(false);
        setLink('LOCAL_SIMULATION');
        if (!disposed) {
          retryTimer = window.setTimeout(connectWs, 3000);
        }
      };

      ws.onerror = () => {
        if (gen === socketGenRef.current) {
          ws.close();
        }
      };
    };

    void fetchInitialSnapshot();
    connectWs();

    return () => {
      disposed = true;
      socketGenRef.current += 1;
      abortCtrl.abort();
      window.clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [acceptRawPayload, postStressTestOverride]);

  // 2. Forward active What-If overrides via POST /api/stress-test on change.
  useEffect(() => {
    if (!whatIfOverlayActive) return;
    if (link !== 'ENGINE_LIVE' && !wsConnected) return;
    void postStressTestOverride(whatIf, thrombusConfirmed);
  }, [whatIf, thrombusConfirmed, whatIfOverlayActive, link, wsConnected, postStressTestOverride]);

  // 3. Stale-data watchdog (never let old data look fresh/healthy if stream stalls).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastValidAtRef.current !== null && link === 'ENGINE_LIVE') {
        const age = Date.now() - lastValidAtRef.current;
        if (age > 2500) {
          setIsStale(true);
        }
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [link]);

  // 4. Local 20 Hz simulation loop (strictly for offline fallback & separate What-If preview).
  useEffect(() => {
    let tick = 0;
    const id = window.setInterval(() => {
      tick += 1;
      setLocalPacket(
        buildPacket(
          inputsRef.current.whatIf,
          tick,
          inputsRef.current.thrombusConfirmed,
          inputsRef.current.lastScanDay,
        ),
      );
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  const packet = link === 'ENGINE_LIVE' && livePacket !== null ? livePacket : localPacket;
  const status: TelemetryStatus = {
    wsConnected,
    heldSample,
    heldAgeMs,
    isStale,
    rejectedFrames,
    validationError,
    lastSyncLatencyUs,
    lastValidAtMs,
  };

  return {
    packet,
    livePacket,
    localPacket,
    link,
    status,
    recordedHistory,
    syncWhatIfNow: () => postStressTestOverride(whatIf, thrombusConfirmed),
  };
}
