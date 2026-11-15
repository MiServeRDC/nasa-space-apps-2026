import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import {
  decodeBinaryTelemetryFrame,
  mergeBinaryFrameIntoPacket,
  type DecodedBinaryTelemetryFrame,
} from './binaryTelemetryDecoder';
import { buildPacket, type WhatIf } from './scenario';
import { isValidTelemetryPayload, normalizeTelemetryPacket } from './telemetryValidation';
import {
  IS_ARES_DESKTOP_SHELL,
  type OsStatusBarState,
  type TransportMode,
} from '../modules/os-shell/OsSystemStatusBar';

export type { OsStatusBarState, TransportMode };
export { IS_ARES_DESKTOP_SHELL };

const DEFAULT_HTTP_BASE = 'http://127.0.0.1:8080';

export const ENGINE_HTTP_URL: string =
  (import.meta.env?.VITE_ARES_HTTP_URL as string | undefined) || DEFAULT_HTTP_BASE;

export const ENGINE_WS_URL: string =
  (import.meta.env?.VITE_ARES_WS_URL as string | undefined) ||
  `${ENGINE_HTTP_URL.replace(/^http/i, 'ws')}/ws/telemetry`;

export type LinkState = 'ENGINE_LIVE' | 'LOCAL_SIMULATION';

export type AnomalyInjectionKind =
  | 'DESATURATION_FAST'
  | 'DESATURATION_MODERATE'
  | 'DESATURATION_SLOW'
  | 'TACHYCARDIA_FAST'
  | 'TACHYCARDIA_MODERATE'
  | 'TACHYCARDIA_SLOW'
  | 'COMBINED_SUBTLE'
  | 'SENSOR_DETACH'
  | 'CLEAR'
  | null;

export interface AnomalyInjectionWireRequest {
  kind: string | null;
  duration_s?: number;
}

export interface AnomalyInjectionResult {
  ok: boolean;
  error?: string;
}

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

interface TauriInternalsApi {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  transformCallback?: (
    callback: (response: unknown) => void,
    once?: boolean,
  ) => number;
}

function getTauriInternals(): TauriInternalsApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __TAURI_INTERNALS__?: TauriInternalsApi })
    .__TAURI_INTERNALS__;
}

function toArrayBuffer(payload: unknown): ArrayBuffer | null {
  if (payload instanceof ArrayBuffer) return payload;
  if (payload instanceof Uint8Array) {
    return payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength,
    ) as ArrayBuffer;
  }
  if (Array.isArray(payload) && payload.every((n) => typeof n === 'number')) {
    return new Uint8Array(payload).buffer;
  }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'data' in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    const arr = (payload as { data: unknown[] }).data;
    if (arr.every((n) => typeof n === 'number')) {
      return new Uint8Array(arr as number[]).buffer;
    }
  }
  return null;
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
    cabin_ppco2_mmhg: whatIf.ppco2_mmhg,
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
 * Dual-transport bridge connecting `ares-cockpit` to `ARES-MedOS` / `ares-server-cli`:
 * - `TAURI_NATIVE_IPC`: zero-copy 128-byte `BinaryTelemetryFrame` via Tauri Channel + `DataView`
 * - `BROWSER_WEBSOCKET`: `GET /api/snapshot`, `ws://127.0.0.1:8080/ws/telemetry` (JSON or 128B binary), `POST /api/stress-test`
 * - Strict runtime validation & Issue #11 nullability preservation (`null` never coerced to `0`)
 */
import { evaluateFreshnessGate, type FreshnessGateState } from './freshnessGate';

export { evaluateFreshnessGate, type FreshnessGateState };

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
  const [ipcLatencyUs, setIpcLatencyUs] = useState<number | null>(null);
  const [binaryFrameCount, setBinaryFrameCount] = useState<number>(0);
  const [lastBinaryFrame, setLastBinaryFrame] =
    useState<DecodedBinaryTelemetryFrame | null>(null);
  const [osStatus, setOsStatus] = useState<OsStatusBarState | null>(null);
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
  const lastBinaryMetaRef = useRef<{
    alert: number;
    playbook: number;
    habitat: number;
  } | null>(null);
  const inputsRef = useRef({ whatIf, thrombusConfirmed, lastScanDay, whatIfOverlayActive });
  const localTickRef = useRef(0);
  inputsRef.current = { whatIf, thrombusConfirmed, lastScanDay, whatIfOverlayActive };
  const activeSourceIdRef = useRef<string>('bidmc_01');
  const lastAppliedTimestampMsRef = useRef<number | null>(null);
  const lastAppliedRecTimeRef = useRef<number | null>(null);
  const snapshotInFlightRef = useRef<boolean>(false);
  const latestBinaryRef = useRef<DecodedBinaryTelemetryFrame | null>(null);
  const stressTestQueue = useRef(Promise.resolve());
  const stressTestRevision = useRef(0);

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

    // Monotonic freshness guard: reject delayed, regressive, or out-of-order snapshots
    const gate = evaluateFreshnessGate(
      {
        timestamp_ms: normalized.timestamp_ms,
        relative_recording_time_s: normalized.relative_recording_time_s,
        source_record_id: normalized.source_record_id,
      },
      {
        activeSourceId: activeSourceIdRef.current,
        lastAppliedTimestampMs: lastAppliedTimestampMsRef.current,
        lastAppliedRecTime: lastAppliedRecTimeRef.current,
      },
    );

    if (
      !gate.accepted ||
      (lastAppliedTimestampMsRef.current !== null &&
        normalized.timestamp_ms < lastAppliedTimestampMsRef.current &&
        normalized.source_record_id === activeSourceIdRef.current)
    ) {
      console.warn(
        `[ares-cockpit] Rejected out-of-order snapshot (${normalized.timestamp_ms} < ${lastAppliedTimestampMsRef.current}) from ${originLabel}`,
      );
      return false;
    }

    if (normalized.source_record_id !== activeSourceIdRef.current) {
      latestBinaryRef.current = null;
    }
    activeSourceIdRef.current = gate.nextState.activeSourceId ?? normalized.source_record_id;
    lastAppliedTimestampMsRef.current = gate.nextState.lastAppliedTimestampMs;
    lastAppliedRecTimeRef.current = gate.nextState.lastAppliedRecTime;

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

    const binary = latestBinaryRef.current;
    setLivePacket(binary && binary.timestamp_ms > normalized.timestamp_ms
      ? mergeBinaryFrameIntoPacket(normalized, binary) : normalized);
    setLink('ENGINE_LIVE');
    return true;
  }, []);

  const acceptBinaryBuffer = useCallback(
    (buffer: ArrayBuffer, originLabel: string): DecodedBinaryTelemetryFrame | null => {
      const decodeStart = performance.now();
      const decoded = decodeBinaryTelemetryFrame(buffer);
      if (!decoded) {
        setRejectedFrames((n) => n + 1);
        setValidationError(`Rejected invalid 128B binary frame from ${originLabel}`);
        return null;
      }

      const decodeUs = Math.max(1, Math.round((performance.now() - decodeStart) * 1000));
      const measuredIpcUs =
        decoded.ipc_latency_ns > 0
          ? Math.max(1, Math.round(decoded.ipc_latency_ns / 1000))
          : decodeUs;

      const now = Date.now();
      lastValidAtRef.current = now;
      setLastValidAtMs(now);
      setIsStale(false);
      setValidationError(null);
      setIpcLatencyUs(measuredIpcUs);
      setBinaryFrameCount((c) => c + 1);
      setLastBinaryFrame(decoded);
      // JSON snapshots carry the anomaly report. Order them against other JSON
      // snapshots so a continuous binary stream cannot starve recovery updates.
      latestBinaryRef.current = decoded;
      setLivePacket((prev) => (prev ? mergeBinaryFrameIntoPacket(prev, decoded) : prev));
      setLink('ENGINE_LIVE');
      return decoded;
    },
    [],
  );

  const sendStressTestOverride = useCallback(
    async (w: WhatIf, thrombus: boolean | null): Promise<void> => {
      const payload = buildStressTestPayload(w, thrombus, activeSourceIdRef.current);
      if (IS_ARES_DESKTOP_SHELL) {
        const tauri = getTauriInternals();
        if (tauri?.invoke) {
          try {
            const start = performance.now();
            const updated = await tauri.invoke('apply_what_if_patch', { patch: payload });
            const elapsedUs = Math.max(1, Math.round((performance.now() - start) * 1000));
            setLastSyncLatencyUs(elapsedUs);
            setIpcLatencyUs(elapsedUs);
            acceptRawPayload(updated, 'TAURI apply_what_if_patch');
            return;
          } catch {
            // Fall through to HTTP loopback if Tauri command not registered
          }
        }
      }

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

  const postStressTestOverride = useCallback((w: WhatIf, thrombus: boolean | null) => {
    const revision = ++stressTestRevision.current;
    const pending = stressTestQueue.current.then(async () => {
      if (revision === stressTestRevision.current) await sendStressTestOverride(w, thrombus);
    });
    stressTestQueue.current = pending.catch(() => {});
    return pending;
  }, [sendStressTestOverride]);

  const injectAnomaly = useCallback(
    async (
      kind: AnomalyInjectionKind,
      duration_s?: number,
    ): Promise<AnomalyInjectionResult> => {
      const normalizedKind = kind === 'CLEAR' ? null : kind;
      const wireRequest: AnomalyInjectionWireRequest =
        typeof duration_s === 'number' && Number.isFinite(duration_s)
          ? { kind: normalizedKind, duration_s }
          : { kind: normalizedKind };

      if (IS_ARES_DESKTOP_SHELL) {
        const tauri = getTauriInternals();
        if (tauri?.invoke) {
          try {
            const start = performance.now();
            const updated = await tauri.invoke('ipc_inject_anomaly', {
              kind: normalizedKind,
              duration_s: wireRequest.duration_s,
              durationS: wireRequest.duration_s,
              request: wireRequest,
            });
            const elapsedUs = Math.max(1, Math.round((performance.now() - start) * 1000));
            setLastSyncLatencyUs(elapsedUs);
            setIpcLatencyUs(elapsedUs);
            if (updated) {
              acceptRawPayload(updated, 'TAURI ipc_inject_anomaly');
            }
            return { ok: true };
          } catch (err) {
            // Fall through to HTTP loopback if command is not registered, otherwise surface message
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.toLowerCase().includes('not found') && !msg.toLowerCase().includes('unknown command')) {
              return { ok: false, error: msg || 'Tauri anomaly injection failed' };
            }
          }
        }
      }

      try {
        const start = performance.now();
        const res = await fetch(`${ENGINE_HTTP_URL}/api/inject-anomaly`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wireRequest),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          return {
            ok: false,
            error: body?.error ?? `Engine refused the request (HTTP ${res.status})`,
          };
        }
        const body = (await res.json().catch(() => null)) as unknown;
        const elapsedUs = Math.max(1, Math.round((performance.now() - start) * 1000));
        setLastSyncLatencyUs(elapsedUs);
        if (body && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
          const candidate =
            typeof body === 'object' && body !== null && 'packet' in body
              ? (body as Record<string, unknown>).packet
              : body;
          acceptRawPayload(candidate, 'POST /api/inject-anomaly');
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Engine not reachable' };
      }
    },
    [acceptRawPayload],
  );

  // 1A. Native Tauri v2 IPC transport (when running inside ARES-MedOS desktop shell)
  useEffect(() => {
    if (!IS_ARES_DESKTOP_SHELL) return;
    const tauri = getTauriInternals();
    if (!tauri?.invoke) return;

    let disposed = false;

    const hydrateTauriSnapshot = async () => {
      if (snapshotInFlightRef.current) {
        return;
      }
      snapshotInFlightRef.current = true;
      let timerId: number | null = null;
      try {
        const timeoutPromise = new Promise<null>((_, reject) => {
          timerId = window.setTimeout(() => reject(new Error('Tauri snapshot timeout')), 1500);
        });
        const invokePromise = tauri.invoke?.('get_full_wire_snapshot');
        const snap = (await Promise.race([invokePromise, timeoutPromise])) as unknown;
        if (!disposed && snap) {
          acceptRawPayload(snap, 'TAURI get_full_wire_snapshot');
        }
      } catch {
        // Fallback handled gracefully or timed out
      } finally {
        if (timerId !== null) {
          window.clearTimeout(timerId);
        }
        snapshotInFlightRef.current = false;
      }
      try {
        const os = await tauri.invoke?.('get_os_status_bar_state');
        if (!disposed && os && typeof os === 'object') {
          setOsStatus(os as OsStatusBarState);
        }
      } catch {
        // Optional status endpoint
      }
    };

    void hydrateTauriSnapshot();

    if (tauri.transformCallback) {
      const channelId = tauri.transformCallback((msg: unknown) => {
        if (disposed) return;
        const buf = toArrayBuffer(msg);
        if (!buf) return;
        const decoded = acceptBinaryBuffer(buf, 'TAURI subscribe_binary_telemetry');
        if (!decoded) return;
        const prevMeta = lastBinaryMetaRef.current;
        if (
          !prevMeta ||
          prevMeta.alert !== decoded.active_alert_code ||
          prevMeta.playbook !== decoded.active_playbook_id ||
          prevMeta.habitat !== decoded.deontic_habitat_mask
        ) {
          lastBinaryMetaRef.current = {
            alert: decoded.active_alert_code,
            playbook: decoded.active_playbook_id,
            habitat: decoded.deontic_habitat_mask,
          };
          void hydrateTauriSnapshot();
        }
      });

      void tauri
        .invoke('subscribe_binary_telemetry', {
          onFrame: { __TAURI_CHANNEL_MARKER__: true, id: channelId },
        })
        .catch((err) => {
          console.warn(
            '[ares-cockpit] Tauri binary subscription unavailable, active snapshot fallback engaged:',
            err,
          );
          void hydrateTauriSnapshot();
        });
    }

    // Periodic 1 Hz full snapshot refresh ensures extended panels (cones, anomalies, Block N)
    // stay fresh (< 1s latency) even when binary frame header codes remain stable,
    // and serves as an active fallback when binary streaming is unavailable.
    const snapshotPollId = window.setInterval(() => {
      if (!disposed) {
        void hydrateTauriSnapshot();
      }
    }, 1000);

    const osPollId = window.setInterval(() => {
      if (!disposed) {
        void tauri
          .invoke?.('get_os_status_bar_state')
          .then((os) => {
            if (!disposed && os && typeof os === 'object') {
              setOsStatus(os as OsStatusBarState);
            }
          })
          .catch(() => {});
      }
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(snapshotPollId);
      window.clearInterval(osPollId);
    };
  }, [acceptBinaryBuffer, acceptRawPayload]);

  // 1B. Browser WebSocket + HTTP Snapshot transport (default in browser & fallback)
  useEffect(() => {
    if (IS_ARES_DESKTOP_SHELL) return;
    let disposed = false;
    let retryTimer: number | undefined;
    const abortCtrl = new AbortController();

    const fetchOsStatus = async () => {
      try {
        const res = await fetch(`${ENGINE_HTTP_URL}/api/os-status`, {
          signal: abortCtrl.signal,
        });
        if (!res.ok || disposed) return;
        const json = (await res.json()) as OsStatusBarState;
        if (!disposed && json && typeof json === 'object') {
          setOsStatus(json);
          if (typeof json.engine_tick_latency_us === 'number') {
            setIpcLatencyUs((prev) => prev ?? json.engine_tick_latency_us);
          }
        }
      } catch {
        // Optional endpoint; ignore if backend is offline or older version
      }
    };

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
        ws.binaryType = 'arraybuffer';
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
        void fetchOsStatus();
        // Re-sync active What-If override when socket opens or reconnects.
        const cur = inputsRef.current;
        if (cur.whatIfOverlayActive) {
          void postStressTestOverride(cur.whatIf, cur.thrombusConfirmed);
        }
      };

      ws.onmessage = (ev) => {
        if (disposed || gen !== socketGenRef.current) return;
        if (ev.data instanceof ArrayBuffer) {
          acceptBinaryBuffer(ev.data, 'WS /ws/telemetry (binary)');
          return;
        }
        if (typeof Blob !== 'undefined' && ev.data instanceof Blob) {
          void ev.data.arrayBuffer().then((buf) => {
            if (!disposed && gen === socketGenRef.current) {
              acceptBinaryBuffer(buf, 'WS /ws/telemetry (blob)');
            }
          });
          return;
        }
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
    void fetchOsStatus();
    connectWs();

    const osPollId = window.setInterval(() => {
      if (!disposed) {
        void fetchOsStatus();
      }
    }, 2000);

    return () => {
      disposed = true;
      socketGenRef.current += 1;
      abortCtrl.abort();
      window.clearTimeout(retryTimer);
      window.clearInterval(osPollId);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [acceptBinaryBuffer, acceptRawPayload, postStressTestOverride]);

  // 2. Forward active What-If overrides via POST /api/stress-test (or Tauri IPC) on change.
  useEffect(() => {
    if (!whatIfOverlayActive) return;
    if (!IS_ARES_DESKTOP_SHELL && link !== 'ENGINE_LIVE' && !wsConnected) return;
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
  const needsLocalPreview = link !== 'ENGINE_LIVE' || livePacket === null || whatIfOverlayActive;
  useEffect(() => {
    if (!needsLocalPreview) return;
    const update = () => {
      localTickRef.current += 1;
      setLocalPacket(
        buildPacket(
          inputsRef.current.whatIf,
          localTickRef.current,
          inputsRef.current.thrombusConfirmed,
          inputsRef.current.lastScanDay,
        ),
      );
    };
    update();
    const id = window.setInterval(update, 50);
    return () => window.clearInterval(id);
  }, [needsLocalPreview]);

  const packet = link === 'ENGINE_LIVE' && livePacket !== null ? livePacket : localPacket;
  const transportMode: TransportMode = IS_ARES_DESKTOP_SHELL
    ? 'TAURI_NATIVE_IPC'
    : link === 'ENGINE_LIVE'
      ? 'BROWSER_WEBSOCKET'
      : 'LOCAL_SIMULATION';

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
    localSimulationFrameCount: localTickRef.current,
    link,
    transportMode,
    ipcLatencyUs: ipcLatencyUs ?? lastSyncLatencyUs,
    binaryFrameCount,
    lastBinaryFrame,
    osStatus,
    status,
    recordedHistory,
    syncWhatIfNow: () => postStressTestOverride(whatIf, thrombusConfirmed),
    injectAnomaly,
  };
}
