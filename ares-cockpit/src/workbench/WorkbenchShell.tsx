// Locked `100dvh` 4-Layer Spatial Workbench Shell (`WorkbenchShell`).
// Orchestrates:
// - Layer 0 (`Z-0`): Single persistent WebGL2 `<SpatialCanvasRoot>` + `<BiodigitalTwinStage>`
//   with `setViewOffset` optical centering inside the `62-68%` open central aperture
// - Layer 1 (`Z-40`): Persistent `36px` `<HorizonBar>` (`0` backdrop-filter)
// - Layer 2 (`Z-20`, `#main-workbench-scaffold`): Asymmetric 3-column `.ares-workbench-grid`
//   with strictly `<= 4` blurred root shells (`VitalsAnchorCard`, `LeftSlot2`, `RightDock`, `SpatialStageHud` pill)
// - Layer 3 (`Z-50`, `#drawer-host-layer`) & Layer 4 (`Z-90..95`): Overlays + `<TelemetryIgnitionPreloader>`
// - Zero-GC ring buffer ingestion (`telemetryRingBuffer.pushTelemetryFrame`)
// - Capture-phase keyboard orchestrator (`useKeyboardOrchestrator`)
// - NotebookLM Risk 5: All discrete live announcements routed through `src/stores/a11yAnnouncer.ts`

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CountermeasureAction, TelemetryPacket } from '../types/telemetry';
import type { InjuryMarker } from '../types/injury';
import type { CameraSnapshot, PhaseMode } from '../types/workbench';
import type {
  AnomalyInjectionKind,
  AnomalyInjectionResult,
  TelemetryStatus,
} from '../lib/useTelemetry';
import {
  DEFAULT_WHATIF,
  evaluate,
  type ScenarioState,
  type WhatIf,
} from '../lib/scenario';
import { isPureRecordedReplay } from '../lib/telemetryValidation';
import type { TransportMode } from '../modules/os-shell/OsSystemStatusBar';
import { SpatialCanvasRoot } from '../stage3d/SpatialCanvasRoot';
import {
  BiodigitalTwinStage,
  type LazyAnatomicalGlbToggles,
} from '../stage3d/BiodigitalTwinStage';
import { telemetryRingBuffer } from '../stores/telemetryRingBuffer';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useStudioTimelineStore } from '../stores/studioTimelineStore';
import {
  announceAlarmTransition,
  announceAssertive,
  announcePolite,
} from '../stores/a11yAnnouncer';
import {
  DRAWER_HOST_LAYER_ID,
  MAIN_WORKBENCH_SCAFFOLD_ID,
  useKeyboardOrchestrator,
} from '../drawers/useKeyboardOrchestrator';
import { HorizonBar } from './HorizonBar';
import { TelemetryIgnitionPreloader } from './TelemetryIgnitionPreloader';
import { VitalsAnchorCard } from './VitalsAnchorCard';
import {
  PhaseGatherLeftContext,
  PhaseGatherRightDock,
} from './PhaseGatherDeck';
import {
  PhaseEvaluateLeftContext,
  PhaseEvaluateRightDock,
} from './PhaseEvaluateDeck';
import { PhaseActLeftContext, PhaseActRightDock } from './PhaseActDeck';
import { SpatialStageHud } from './SpatialStageHud';

export interface WorkbenchShellProps {
  packet: TelemetryPacket;
  telemetryStatus: TelemetryStatus;
  transportMode: TransportMode;
  engineLive?: boolean;
  httpBaseUrl?: string;
  ipcLatencyUs?: number | null;
  whatIf: WhatIf;
  scenario?: ScenarioState;
  thrombusConfirmed: boolean | null;
  onChangeThrombusConfirmed: (confirmed: boolean | null) => void;
  onChangeWhatIf: (patch: Partial<WhatIf>) => void;
  onResetWhatIf: () => void;
  availableSubjects?: readonly string[];
  onSelectSubject?: (astronautId: string) => void;
  onInjectAnomaly?: (
    kind: AnomalyInjectionKind,
    durationS?: number,
  ) => Promise<AnomalyInjectionResult>;
  injuryMarkers?: readonly InjuryMarker[];
  onOpenOpticalScanner?: () => void;
  onExecuteAction?: (playbookId: string, action: CountermeasureAction) => void;
  onSyncEngineNow?: () => Promise<void> | void;
  hasExternalModal?: boolean;
  captureSnapshotRef?: React.MutableRefObject<(() => CameraSnapshot) | null>;
  drawerSlot?: React.ReactNode;
  modalSlot?: React.ReactNode;
  studioSlot?: React.ReactNode;
}

export function WorkbenchShell({
  packet,
  telemetryStatus,
  transportMode,
  engineLive = false,
  httpBaseUrl = 'http://127.0.0.1:8080',
  ipcLatencyUs = null,
  whatIf,
  scenario: externalScenario,
  thrombusConfirmed,
  onChangeThrombusConfirmed,
  onChangeWhatIf,
  onResetWhatIf,
  availableSubjects,
  onSelectSubject,
  onInjectAnomaly,
  injuryMarkers = [],
  onOpenOpticalScanner,
  onExecuteAction,
  onSyncEngineNow,
  hasExternalModal = false,
  captureSnapshotRef,
  drawerSlot,
  modalSlot,
  studioSlot,
}: WorkbenchShellProps) {
  const phase = useWorkbenchStore((s) => s.phase);
  const simulationMode = useWorkbenchStore((s) => s.simulationMode);
  const drawer = useWorkbenchStore((s) => s.drawer);
  const commandPaletteOpen = useWorkbenchStore((s) => s.commandPaletteOpen);
  const shortcutsModalOpen = useWorkbenchStore((s) => s.shortcutsModalOpen);
  const studioBarOpen = useWorkbenchStore((s) => s.studioBarOpen);

  const stageApertureRef = useRef<HTMLDivElement>(null);
  const internalCaptureRef = useRef<(() => CameraSnapshot) | null>(null);
  const effectiveCaptureRef = captureSnapshotRef ?? internalCaptureRef;

  const [lazyGlbLayers, setLazyGlbLayers] = useState<LazyAnatomicalGlbToggles>({
    skeletal: false,
    vascular: false,
    visceral: false,
  });

  const scenario = useMemo(
    () => externalScenario ?? evaluate(whatIf),
    [externalScenario, whatIf],
  );
  const empiricalBaselineScenario = useMemo(
    () => evaluate({ ...DEFAULT_WHATIF, sex: whatIf.sex }),
    [whatIf.sex],
  );

  // Feed incoming telemetry frames directly into the zero-GC ring buffer
  useEffect(() => {
    telemetryRingBuffer.pushTelemetryFrame(packet);
  }, [packet]);

  // NotebookLM Risk 5: Route discrete alarm transitions through hysteresis announcer
  useEffect(() => {
    const alarm = packet.safety_margins.alarm_level;
    announceAlarmTransition(
      'global_safety_alarm',
      alarm,
      `System clinical alarm level changed to ${alarm} for ${packet.astronaut_id}.`,
    );
  }, [packet.astronaut_id, packet.safety_margins.alarm_level]);

  // NotebookLM Risk 5: Announce empirical <-> counterfactual simulation mode changes politely
  const prevSimModeRef = useRef(simulationMode);
  useEffect(() => {
    if (prevSimModeRef.current === simulationMode) return;
    prevSimModeRef.current = simulationMode;
    if (simulationMode === 'simulated') {
      announcePolite('Entered counterfactual What-If simulation mode. Projections are unvalidated.');
    } else {
      announcePolite('Returned to empirical recorded telemetry mode.');
    }
  }, [simulationMode]);

  // Capture-phase keyboard orchestrator + background `inert` sync
  const getWorkbenchState = useCallback(() => useWorkbenchStore.getState(), []);
  const getStudioState = useCallback(() => useStudioTimelineStore.getState(), []);

  useKeyboardOrchestrator({
    getWorkbenchState,
    getStudioState,
    hasModalOverlay: commandPaletteOpen || shortcutsModalOpen || hasExternalModal,
    hasDrawerOpen: drawer !== null,
  });

  const handleToggleGlbLayer = useCallback((layer: keyof LazyAnatomicalGlbToggles) => {
    setLazyGlbLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  }, []);

  const handleSexChange = useCallback(
    (sex: 'MALE' | 'FEMALE') => {
      onChangeWhatIf({ sex });
    },
    [onChangeWhatIf],
  );

  const recommendedPhase: PhaseMode =
    packet.safety_margins.alarm_level === 'CRITICAL' ||
    packet.safety_margins.alarm_level === 'WARNING'
      ? 'ACT'
      : 'GATHER';

  const isSimulated = !isPureRecordedReplay(packet) || simulationMode === 'simulated';

  const chromeInsets = useMemo(
    () => ({
      leftPx: 326,
      rightPx: 386,
      topPx: 88,
      bottomPx: studioBarOpen ? 142 : 112,
    }),
    [studioBarOpen],
  );

  return (
    <div
      className="workbench-frame"
      data-mode={isSimulated ? 'simulated' : 'empirical'}
      data-phase={phase}
    >
      {/* Layer 4 (Boot): 2.2s Skippable Value-Setter Ignition Preloader */}
      <TelemetryIgnitionPreloader astronautId={packet.astronaut_id} />

      {/* Layer 0: Single Persistent WebGL2 Spatial Canvas Root */}
      <SpatialCanvasRoot
        eventSource={stageApertureRef}
        onContextLostChange={(lost) => {
          if (lost) {
            announceAssertive('WebGL2 3D context lost; attempting autonomous GPU recovery.');
          }
        }}
      >
        <BiodigitalTwinStage
          apertureTrackRef={stageApertureRef}
          chromeInsets={chromeInsets}
          hypergraphSummary={packet.hypergraph_spatial}
          injuryMarkers={injuryMarkers}
          lazyGlbLayers={lazyGlbLayers}
          onCaptureSnapshotRef={effectiveCaptureRef}
        />
      </SpatialCanvasRoot>

      {/* Layer 1: Persistent 36px Top Telemetry Horizon */}
      <HorizonBar
        packet={packet}
        telemetryStatus={telemetryStatus}
        transportMode={transportMode}
        recommendedPhase={recommendedPhase}
        ipcLatencyUs={ipcLatencyUs}
        availableSubjects={availableSubjects}
        onSelectSubject={onSelectSubject}
      />

      {/* Layer 2: Locked 3-Column Bento Grid (`<= 4` blurred root shells) */}
      <main
        id={MAIN_WORKBENCH_SCAFFOLD_ID}
        aria-label="ARES-Health Spatial Biomedical Workbench"
        className="ares-workbench-grid relative z-20 pointer-events-none"
      >
        {/* Left Column: Invariant Slot 1 Vitals Anchor + Contextual Slot 2 */}
        <div className="pointer-events-auto flex min-h-0 flex-col gap-3 overflow-y-auto">
          <VitalsAnchorCard packet={packet} telemetryStatus={telemetryStatus} />

          {phase === 'GATHER' ? (
            <PhaseGatherLeftContext packet={packet} scenario={scenario} />
          ) : null}

          {phase === 'EVALUATE' ? (
            <PhaseEvaluateLeftContext packet={packet} scenario={scenario} />
          ) : null}

          {phase === 'ACT' ? (
            <PhaseActLeftContext
              packet={packet}
              scenario={scenario}
              whatIf={whatIf}
              thrombusConfirmed={thrombusConfirmed}
              onChangeWhatIf={onChangeWhatIf}
              onResetWhatIf={onResetWhatIf}
            />
          ) : null}
        </div>

        {/* Center Column: 62-68% Open Optical Aperture for 3D Biodigital Twin */}
        <div
          ref={stageApertureRef}
          className="pointer-events-auto relative min-h-[340px] w-full overflow-hidden rounded-2xl"
        >
          <SpatialStageHud
            lazyGlbLayers={lazyGlbLayers}
            onToggleGlbLayer={handleToggleGlbLayer}
            hypergraphSummary={packet.hypergraph_spatial}
            injuryMarkers={injuryMarkers}
            onOpenOpticalScanner={onOpenOpticalScanner}
            simulated={isSimulated}
            onSexChange={handleSexChange}
          />
        </div>

        {/* Right Column: Phase-Contextual Primary Diagnostic / Prognostic / Playbook Dock */}
        <div className="pointer-events-auto flex min-h-0 flex-col overflow-hidden">
          {phase === 'GATHER' ? (
            <PhaseGatherRightDock
              packet={packet}
              scenario={scenario}
              engineLive={engineLive}
              httpBaseUrl={httpBaseUrl}
              thrombusConfirmed={thrombusConfirmed}
              onChangeThrombusConfirmed={onChangeThrombusConfirmed}
              onInjectAnomaly={onInjectAnomaly}
              injuryMarkers={injuryMarkers}
              onOpenOpticalScanner={onOpenOpticalScanner}
            />
          ) : null}

          {phase === 'EVALUATE' ? (
            <PhaseEvaluateRightDock
              packet={packet}
              scenario={scenario}
              empiricalBaselineScenario={empiricalBaselineScenario}
              whatIf={whatIf}
              httpBaseUrl={httpBaseUrl}
              thrombusConfirmed={thrombusConfirmed}
              onChangeWhatIf={onChangeWhatIf}
              onResetWhatIf={onResetWhatIf}
              onSyncEngineNow={onSyncEngineNow}
            />
          ) : null}

          {phase === 'ACT' ? (
            <PhaseActRightDock
              packet={packet}
              scenario={scenario}
              whatIf={whatIf}
              thrombusConfirmed={thrombusConfirmed}
              onChangeWhatIf={onChangeWhatIf}
              onResetWhatIf={onResetWhatIf}
              onExecuteAction={onExecuteAction}
            />
          ) : null}
        </div>
      </main>

      {/* Optional Studio Director Floating Bar Slot (Phase 5) */}
      {studioSlot}

      {/* Layer 3: Slide-Over Drawer Host (`#drawer-host-layer`) */}
      <div id={DRAWER_HOST_LAYER_ID} className="relative z-50">
        {drawerSlot}
      </div>

      {/* Layer 4: Modal & Command Palette Host (`Z-90`) */}
      <div className="relative z-[90]">{modalSlot}</div>
    </div>
  );
}
