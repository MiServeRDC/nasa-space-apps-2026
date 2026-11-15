import {TriageOverview} from './TriageOverview';
// Phase 8 operational/presentation shell: clinical content in document flow,
// one scissored optional 3D canvas, independent 2D navigation and overlay hosts.
// Safety execution and provenance remain in their existing packet-driven modules.

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
import { clinicalDataMode, clinicalSourceLabel } from '../lib/clinicalViewModel';
import type { TransportMode } from '../modules/os-shell/OsSystemStatusBar';
import { OptionalSpatialBoundary } from './OptionalSpatialBoundary';
import type { LazyAnatomicalGlbToggles } from '../stage3d/BiodigitalTwinStage';
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
  const displayMode=useWorkbenchStore(s=>s.displayMode),setDisplayMode=useWorkbenchStore(s=>s.setDisplayMode);
  const eventRootRef=useRef<HTMLDivElement>(null);
  const phase = useWorkbenchStore((s) => s.phase);
  const [spatialUnavailable, setSpatialUnavailable] = useState(
    () => typeof window === 'undefined' || typeof window.WebGL2RenderingContext === 'undefined');
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

  // Never connect traces belonging to different records, devices or scenario modes.
  const historySourceRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify([packet.astronaut_id, packet.source_record_id,
      packet.provenance_manifest.biometrics_source, packet.provenance_manifest.scenario_overlay_mode,
      packet.is_local_simulation === true]);
    if (historySourceRef.current !== key) telemetryRingBuffer.clear();
    historySourceRef.current = key;
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

  const dataMode = clinicalDataMode(packet);
  const isSimulated = dataMode === 'LOCAL_PREVIEW' || dataMode === 'BACKEND_SCENARIO';

  const chromeInsets = useMemo(()=>({leftPx:0,rightPx:0,topPx:0,bottomPx:0}),[]);

  return (
    <div
      ref={eventRootRef}
      className="workbench-frame"
      data-display-mode={displayMode}
      data-mode={isSimulated ? 'simulated' : 'empirical'}
      data-phase={phase}
    >
      {/* Layer 4 (Boot): 2.2s Skippable Value-Setter Ignition Preloader */}
      <TelemetryIgnitionPreloader astronautId={packet.astronaut_id} />

      {/* Single shared canvas; primary view follows the measured local aperture */}
      <OptionalSpatialBoundary
        eventSource={eventRootRef}
        onFailure={() => setSpatialUnavailable(true)}
        onContextLostChange={setSpatialUnavailable}
        apertureTrackRef={stageApertureRef}
        chromeInsets={chromeInsets}
        hypergraphSummary={packet.hypergraph_spatial}
        injuryMarkers={injuryMarkers}
        lazyGlbLayers={lazyGlbLayers}
        onCaptureSnapshotRef={effectiveCaptureRef}
      />

      {/* Document-flow workflow navigation */}
      <div id={MAIN_WORKBENCH_SCAFFOLD_ID} className="phase8-content" tabIndex={-1}>
      <HorizonBar
        packet={packet}
        telemetryStatus={telemetryStatus}
        transportMode={transportMode}
        recommendedPhase={recommendedPhase}
        ipcLatencyUs={ipcLatencyUs}
        availableSubjects={availableSubjects}
        onSelectSubject={onSelectSubject}
      />

      {/* Responsive clinical grid; presentation changes only placement */}
      <main
        aria-label="ARES-Health Spatial Biomedical Workbench"
        className="ares-workbench-grid relative z-20 pointer-events-none"
      >
        <TriageOverview packet={packet} status={telemetryStatus}/>
        <div className="display-mode-controls" role="group" aria-label="Workbench display mode"><button className="phase8-button" aria-pressed={displayMode==='operational'} onClick={()=>setDisplayMode('operational')}>Operational</button><button className="phase8-button" aria-pressed={displayMode==='presentation'} onClick={()=>setDisplayMode('presentation')}>Presentation</button><span>Same telemetry and action gates in both views.</span></div>
        {/* Left Column: Invariant Slot 1 Vitals Anchor + Contextual Slot 2 */}
        <div className="clinical-context pointer-events-auto flex min-w-0 flex-col gap-3">
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

        {/* Optional reference view; all controls are outside its aperture */}
        <section className="clinical-stage pointer-events-auto" aria-label="Optional anatomy reference">
          {spatialUnavailable ? <p role="status" data-spatial-fallback="true" className="rounded border border-amber-400 bg-black p-3 text-sm text-amber-200">3D unavailable. Vitals, alerts, diagnostic navigation and playbooks remain available in 2D.</p>:null}
          <SpatialStageHud
            viewport={<div ref={stageApertureRef} className="stage-aperture" data-stage-aperture aria-label="Optional illustrative body viewport"/>}
            lazyGlbLayers={lazyGlbLayers}
            onToggleGlbLayer={handleToggleGlbLayer}
            hypergraphSummary={packet.hypergraph_spatial}
            injuryMarkers={injuryMarkers}
            onOpenOpticalScanner={onOpenOpticalScanner}
            simulated={isSimulated}
            sourceLabel={clinicalSourceLabel(packet)}
            onSexChange={handleSexChange}
          />
        </section>

        {/* Right Column: Phase-Contextual Primary Diagnostic / Prognostic / Playbook Dock */}
        <div id="clinical-phase-dock" tabIndex={-1} aria-label="Current clinical phase" className="clinical-dock pointer-events-auto flex min-w-0 flex-col">
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

      {/* Copilot and presentation tools stay in flow */}
      <aside className="workbench-tools" aria-label="Copilot and presentation tools">{studioSlot}</aside>
      </div>

      {/* Layer 3: Slide-Over Drawer Host (`#drawer-host-layer`) */}
      <div id={DRAWER_HOST_LAYER_ID} className="relative z-50">
        {drawerSlot}
      </div>

      {/* Layer 4: Modal & Command Palette Host (`Z-90`) */}
      <div className="relative z-[90]">{modalSlot}</div>
    </div>
  );
}
