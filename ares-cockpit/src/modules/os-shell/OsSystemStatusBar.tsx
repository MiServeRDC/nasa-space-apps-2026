import { useEffect, useState } from 'react';
import type { DecodedBinaryTelemetryFrame } from '../../lib/binaryTelemetryDecoder';
import type { TelemetryPacket } from '../../types/telemetry';
import type { WhatIf } from '../../lib/scenario';

export type TransportMode = 'TAURI_NATIVE_IPC' | 'BROWSER_WEBSOCKET' | 'LOCAL_SIMULATION';

export interface OsPartitionHealth {
  id: string;
  label: string;
  healthy: boolean;
  last_latency_us: number;
}

export interface OwltMarsCommState {
  owlt_seconds: number;
  eimo_autonomous_active: boolean;
  blackout_active: boolean;
  label: string;
}

export interface OsStatusBarState {
  shell_name: string;
  shell_version: string;
  transport_mode: string;
  host_os: string;
  host_arch: string;
  air_gapped: boolean;
  ws_mirror_active: boolean;
  engine_tick_latency_us: number;
  target_ipc_budget_us: number;
  sol_number: number;
  mission_elapsed_s: number;
  owlt: OwltMarsCommState;
  partitions: OsPartitionHealth[];
  habitat_zone: string;
  violates_policy: boolean;
  eva_airlock_forbidden: boolean;
  storm_shelter_mandatory: boolean;
  radiation_dose_rate_msv_d: number;
  seu_restart_count: number;
  hrv_unavailable: boolean;
  model_validation_status: string;
}

interface TauriInternalsWindow {
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

export const IS_ARES_DESKTOP_SHELL =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function formatOwltDelay(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'BLACKOUT';
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function formatMetClock(elapsedSeconds: number): string {
  const safe = Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0 ? Math.floor(elapsedSeconds) : 0;
  const hrs = Math.floor((safe % 88775) / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function OsSystemStatusBar({
  packet,
  whatIf,
  transportMode,
  ipcLatencyUs,
  binaryFrameCount,
  lastBinaryFrame,
  osStatus,
  paletteOpen,
  onTogglePalette,
}: {
  packet: TelemetryPacket;
  whatIf: WhatIf;
  transportMode: TransportMode;
  ipcLatencyUs: number | null;
  binaryFrameCount: number;
  lastBinaryFrame: DecodedBinaryTelemetryFrame | null;
  osStatus: OsStatusBarState | null;
  paletteOpen: boolean;
  onTogglePalette: () => void;
}) {
  const [utcNow, setUtcNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setUtcNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const healthyPartitions = osStatus
    ? osStatus.partitions.filter((p) => p.healthy).length
    : lastBinaryFrame
      ? lastBinaryFrame.partitions_healthy_count
      : 4;
  const totalPartitions = osStatus ? osStatus.partitions.length : 4;
  const allPartitionsNominal = healthyPartitions === totalPartitions && totalPartitions > 0;

  const solNumber = Math.max(
    1,
    Math.round(
      osStatus?.sol_number ??
        packet.mission_elapsed_days ??
        whatIf.mission_day,
    ),
  );

  const metDisplay = osStatus
    ? formatMetClock(osStatus.mission_elapsed_s)
    : `${utcNow.toISOString().slice(11, 19)}Z`;

  const owltSeconds =
    lastBinaryFrame?.owlt_delay_sec ??
    osStatus?.owlt.owlt_seconds ??
    852; // 14m 12s Mars transit default
  const eimoAutonomous =
    lastBinaryFrame?.eimo_autonomous_active ??
    osStatus?.owlt.eimo_autonomous_active ??
    owltSeconds > 60;
  const blackoutActive = osStatus?.owlt.blackout_active ?? !Number.isFinite(owltSeconds);

  const radiationDose =
    lastBinaryFrame?.radiation_msv_d ??
    osStatus?.radiation_dose_rate_msv_d ??
    packet.biometrics.radiation_dose_rate_msv_d ??
    0.45;

  const habitatZone =
    osStatus?.habitat_zone ??
    lastBinaryFrame?.habitat_zone ??
    packet.hypergraph_spatial?.habitat_zone ??
    'MEDOPS_ULTRASOUND_BAY';

  const stormShelterMandatory =
    lastBinaryFrame?.storm_shelter_mandatory ??
    osStatus?.storm_shelter_mandatory ??
    (radiationDose >= 2.0 || packet.active_playbook?.playbook_id?.includes('05') === true);

  const evaAirlockForbidden =
    lastBinaryFrame?.eva_airlock_forbidden ??
    osStatus?.eva_airlock_forbidden ??
    (stormShelterMandatory || radiationDose >= 1.5);

  const hrvUnavailable =
    osStatus?.hrv_unavailable ??
    (lastBinaryFrame?.hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE' ||
      packet.biometrics.hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE');

  const transportBadgeText =
    transportMode === 'TAURI_NATIVE_IPC'
      ? `MEDOS SHELL: TAURI IPC (<0.05ms${ipcLatencyUs !== null ? ` / ${ipcLatencyUs}us` : ''})`
      : transportMode === 'BROWSER_WEBSOCKET'
        ? `MEDOS SHELL: WS LOOPBACK (20Hz/1Hz${ipcLatencyUs !== null ? ` / ${ipcLatencyUs}us` : ''})`
        : 'MEDOS SHELL: LOCAL SIM (OFFLINE)';

  const transportBadgeCls =
    transportMode === 'TAURI_NATIVE_IPC'
      ? 'border-ok/60 bg-ok/10 text-ok'
      : transportMode === 'BROWSER_WEBSOCKET'
        ? 'border-nominal/60 bg-nominal/10 text-nominal'
        : 'border-warning/60 bg-warning/10 text-warning';

  const invokeWindowPlugin = async (cmd: string) => {
    const tauri = (window as unknown as TauriInternalsWindow).__TAURI_INTERNALS__;
    if (!tauri?.invoke) return;
    try {
      await tauri.invoke(cmd);
    } catch {
      // Ignore outside native Tauri window runtime
    }
  };

  return (
    <div
      role="region"
      aria-label="ARES-MedOS System Chrome Status Bar"
      data-testid="os-system-status-bar"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-black px-3 py-1.5 font-mono text-[11px] text-gray-200 select-none"
    >
      {/* Left: Transport & ARINC-653 Kernel Partition Health */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold tracking-wider text-white">ARES-MEDOS v0.1</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${transportBadgeCls}`}>
          {transportBadgeText}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] ${
            allPartitionsNominal
              ? 'border-ok/50 bg-ok/10 text-ok'
              : 'border-critical/70 bg-critical/15 text-critical'
          }`}
          title="ARINC-653 Partition Health Monitor (TelemetryIngest, CausalOdeStl, TimestralForecaster, MedOpsUiShell)"
        >
          ARINC-653 HM: {healthyPartitions}/{totalPartitions} PARTITIONS {allPartitionsNominal ? 'NOMINAL' : 'DEGRADED'}
        </span>
        {binaryFrameCount > 0 && (
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-gray-400">
            128B BIN #{binaryFrameCount}
          </span>
        )}
        <span className="rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
          {osStatus?.model_validation_status ?? 'ILLUSTRATIVE_UNVALIDATED'}
        </span>
        {hrvUnavailable && (
          <span className="rounded border border-advisory/50 bg-advisory/10 px-1.5 py-0.5 text-[10px] text-advisory">
            HRV: BEAT_INTERVALS_NOT_AVAILABLE
          </span>
        )}
      </div>

      {/* Center: Mission Clock (SOL / MET) & Earth-Mars OWLT [V1 3006] */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-line bg-panel px-2 py-0.5 text-[10px] text-white">
          SOL {solNumber} MTC
        </span>
        <span className="rounded border border-line bg-panel px-2 py-0.5 text-[10px] text-gray-300">
          MET {metDisplay} | T+{packet.relative_recording_time_s.toFixed(0)}s
        </span>
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
            blackoutActive
              ? 'border-critical bg-critical/15 text-critical'
              : eimoAutonomous
                ? 'border-advisory/70 bg-advisory/10 text-advisory'
                : 'border-ok/60 bg-ok/10 text-ok'
          }`}
          title="NASA-STD-3001 Vol. 1 [V1 3006] Autonomous Earth-Independent Medical Operations"
        >
          OWLT: {formatOwltDelay(owltSeconds)} ({eimoAutonomous ? 'EIMO AUTONOMOUS' : 'GROUND LINK'}) [V1 3006]
        </span>
      </div>

      {/* Right: Habitat Deontic & CSA CANS Radiation Interlock + FastMCP Command Palette Trigger */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] ${
            radiationDose >= 2.0
              ? 'border-critical bg-critical/15 text-critical font-bold'
              : radiationDose >= 1.0
                ? 'border-warning bg-warning/10 text-warning'
                : 'border-line bg-panel text-gray-300'
          }`}
        >
          CSA CANS: {radiationDose.toFixed(2)} mSv/d
        </span>
        <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] text-gray-300">
          ZONE: {habitatZone}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
            evaAirlockForbidden
              ? 'border-critical/80 bg-critical/15 text-critical'
              : 'border-ok/50 bg-ok/10 text-ok'
          }`}
        >
          EVA AIRLOCK: {evaAirlockForbidden ? 'FORBIDDEN' : 'PERMITTED'}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
            stormShelterMandatory
              ? 'border-critical bg-critical text-black animate-pulse'
              : 'border-ok/50 bg-ok/10 text-ok'
          }`}
        >
          STORM SHELTER: {stormShelterMandatory ? 'MANDATORY' : 'NOMINAL'}
        </span>

        <button
          type="button"
          onClick={onTogglePalette}
          aria-expanded={paletteOpen}
          aria-haspopup="dialog"
          data-testid="open-fastmcp-palette-btn"
          className={`cursor-pointer rounded border px-2 py-0.5 text-[10px] font-bold transition-colors ${
            paletteOpen
              ? 'border-nominal bg-nominal text-black'
              : 'border-nominal/70 bg-nominal/10 text-nominal hover:bg-nominal/20'
          }`}
        >
          [ALT+SPACE / CMD+K: FASTMCP &amp; 24-DATASET BIOKG]
        </button>

        {IS_ARES_DESKTOP_SHELL && (
          <div className="ml-1 flex items-center gap-1 border-l border-line pl-2">
            <button
              type="button"
              aria-label="Minimize ARES-MedOS window"
              onClick={() => void invokeWindowPlugin('plugin:window|minimize')}
              className="cursor-pointer rounded border border-line px-1.5 py-0.5 text-[10px] text-gray-400 hover:border-gray-400 hover:text-white"
            >
              _
            </button>
            <button
              type="button"
              aria-label="Toggle maximize ARES-MedOS window"
              onClick={() => void invokeWindowPlugin('plugin:window|toggle_maximize')}
              className="cursor-pointer rounded border border-line px-1.5 py-0.5 text-[10px] text-gray-400 hover:border-gray-400 hover:text-white"
            >
              []
            </button>
            <button
              type="button"
              aria-label="Close ARES-MedOS window"
              onClick={() => void invokeWindowPlugin('plugin:window|close')}
              className="cursor-pointer rounded border border-critical/60 px-1.5 py-0.5 text-[10px] text-critical hover:bg-critical hover:text-black"
            >
              X
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
