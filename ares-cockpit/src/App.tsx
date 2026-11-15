import {supportedReferenceRegion} from './anatomy/referenceCatalog';
import { appendLocalAudit } from './lib/localAudit';
import { announceAssertive } from './stores/a11yAnnouncer';
// Greenfield ("Terra Rasa") ARES-Health Spatial Biomedical Workbench Entry (`App.tsx`).
// Orchestrates:
// - 20 Hz dual-transport telemetry (`useTelemetry`) + counterfactual `WhatIf` ODE state
// - Responsive operational/presentation `<WorkbenchShell>` with scrollable clinical content
// - Slide-Over Drawers (`MissionPortalDrawer`, `AuditAndProvenanceDrawer`, `PLAYBOOK_FULL`)
// - Document-flow `<BottomCopilotStudioPill>` + `<= 29.8s` `<OpenScreenStudioBar>`
// - `<CommandPaletteOverlay>`, `<ShortcutsOverlay>`, and `<AiInjuryModal>`

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SmoothScrollProvider, StoryShell } from './scrollytelling';
import {
  DEFAULT_WHATIF,
  evaluate,
  type CrewSex,
  type WhatIf,
} from './lib/scenario';
import { ENGINE_HTTP_URL, useTelemetry } from './lib/useTelemetry';
import type { CountermeasureAction, PlaybookId } from './types/telemetry';
import type { InjuryMarker } from './types/injury';
import type { CameraSnapshot } from './types/workbench';
import type { AuditRecord } from './modules/audit-chain/AuditChainModal';
import { AiInjuryModal } from './modules/body-3d-heatmap/AiInjuryModal';
import { WorkbenchShell } from './workbench/WorkbenchShell';
import { BranchedPlaybookDagLens } from './lenses/BranchedPlaybookDagLens';
import { hasWhatIfDeviation } from './lenses/lensMath';
import { SlideOverDrawerShell } from './drawers/SlideOverDrawerShell';
import { MissionPortalDrawer } from './drawers/MissionPortalDrawer';
import { AuditAndProvenanceDrawer } from './drawers/AuditAndProvenanceDrawer';
import { OpenScreenStudioBar } from './drawers/OpenScreenStudioBar';
import { CommandPaletteOverlay } from './drawers/CommandPaletteOverlay';
import { BottomCopilotStudioPill } from './drawers/BottomCopilotStudioPill';
import { ShortcutsOverlay } from './drawers/ShortcutsOverlay';
import { useWorkbenchStore } from './stores/workbenchStore';

const AVAILABLE_CREW_SUBJECTS: readonly string[] = [
  'ARES-CDR-01',
  'ARES-MS1-02',
  'ARES-PLT-03',
  'ARES-FltSurg-04',
];

export default function App() {
  const [viewMode, setViewMode] = useState<'NARRATIVE' | 'OPERATIONAL'>('NARRATIVE');
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);
  const [thrombusConfirmed, setThrombusConfirmed] = useState<boolean | null>(null);
  const [lastScanDay, setLastScanDay] = useState<number>(DEFAULT_WHATIF.mission_day);
  const [injuryMarkers, setInjuryMarkers] = useState<InjuryMarker[]>([]);
  const [opticalScannerOpen, setOpticalScannerOpen] = useState<boolean>(false);
  const [localAuditEntries, setLocalAuditEntries] = useState<AuditRecord[]>([]);

  const localAuditRef = useRef<AuditRecord[]>([]);
  const localAuditQueue = useRef<Promise<void>>(Promise.resolve());

  const captureSnapshotRef = useRef<(() => CameraSnapshot) | null>(null);

  const drawer = useWorkbenchStore((s) => s.drawer);
  const invokerElementId = useWorkbenchStore((s) => s.invokerElementId);
  const closeDrawer = useWorkbenchStore((s) => s.closeDrawer);
  const setTwinSex = useWorkbenchStore((s) => s.setTwinSex);
  const selectUberonRegion = useWorkbenchStore((s) => s.selectUberonRegion);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const selectPlaybook = useWorkbenchStore((s) => s.selectPlaybook);
  const openDrawer = useWorkbenchStore((s) => s.openDrawer);
  const openCommandPalette = useWorkbenchStore((s) => s.openCommandPalette);
  const setStudioBarOpen = useWorkbenchStore((s) => s.setStudioBarOpen);
  const setSimulationMode = useWorkbenchStore((s) => s.setSimulationMode);

  const whatIfActive = useMemo(() => hasWhatIfDeviation(whatIf), [whatIf]);

  const {
    packet,
    link,
    transportMode,
    ipcLatencyUs,
    status: telemetryStatus,
    syncWhatIfNow,
    injectAnomaly,
  } = useTelemetry(whatIf, thrombusConfirmed, lastScanDay, whatIfActive);

  const scenario = useMemo(() => evaluate(whatIf, lastScanDay), [lastScanDay, whatIf]);

  // Honor optional URL deep-link query params (`?phase=`, `?sex=`, `?view=`, `?drawer=`)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const region = supportedReferenceRegion(params.get('anatomyRegion'));
    if (region) selectUberonRegion(region);
    const qPhase = params.get('phase')?.toUpperCase();
    if (qPhase === 'GATHER' || qPhase === 'EVALUATE' || qPhase === 'ACT') {
      setPhase(qPhase);
    }
    const qSex = params.get('sex')?.toUpperCase();
    if (qSex === 'MALE' || qSex === 'FEMALE') {
      setTwinSex(qSex);
      setWhatIf((prev) => ({ ...prev, sex: qSex }));
    }
    const qView = params.get('view')?.toUpperCase();
    if (qView === 'VIEW_PORTAL') {
      openDrawer('MISSION_PORTAL');
    } else if (qView === 'VIEW_STUDIO') {
      setStudioBarOpen(true);
    } else if (qView === 'OPERATIONAL' || qView === 'BENTO') {
      setViewMode('OPERATIONAL');
    } else if (qView === 'NARRATIVE' || qView === 'SCROLL') {
      setViewMode('NARRATIVE');
    }
    const qDrawer = params.get('drawer')?.toUpperCase();
    if (qDrawer === 'AUDIT') {
      openDrawer('AUDIT_PROVENANCE');
    }
  }, [openDrawer, setPhase, setStudioBarOpen, setTwinSex, selectUberonRegion]);

  const handleChangeWhatIf = useCallback(
    (patch: Partial<WhatIf>) => {
      setWhatIf((prev) => {
        const next = { ...prev, ...patch };
        if (patch.sex) {
          setTwinSex(patch.sex);
        }
        return next;
      });
    },
    [setTwinSex],
  );

  const handleResetWhatIf = useCallback(() => {
    setWhatIf((prev) => ({
      ...DEFAULT_WHATIF,
      sex: prev.sex,
    }));
    setSimulationMode('empirical');
  }, [setSimulationMode]);

  const handleChangeThrombusConfirmed = useCallback(
    (confirmed: boolean | null) => {
      setThrombusConfirmed(confirmed);
      if (confirmed !== null) {
        setLastScanDay(whatIf.mission_day);
      }
    },
    [whatIf.mission_day],
  );

  const handleExecutePlaybookAction = useCallback((playbookId: string, action: CountermeasureAction) => {
    localAuditQueue.current = localAuditQueue.current.then(async () => {
      const record = await appendLocalAudit(localAuditRef.current,
        `LOCAL SELECTION ONLY [${packet.astronaut_id} / ${packet.source_record_id} / ${playbookId}]: ${action.label} (${action.action_id}); no engine execution acknowledgement`);
      localAuditRef.current = [...localAuditRef.current, record];
      setLocalAuditEntries(localAuditRef.current);
    }).catch(() => { announceAssertive('Local note could not be hashed or saved. No engine execution occurred.'); });
  }, [packet.astronaut_id, packet.source_record_id]);

  const handleChangeSex = useCallback(
    (sex: CrewSex) => {
      setTwinSex(sex);
      setWhatIf((prev) => ({ ...prev, sex }));
    },
    [setTwinSex],
  );

  const handleSelectPlaybookFromOptical = useCallback(
    (playbookId: PlaybookId) => {
      selectPlaybook(playbookId);
      setPhase('ACT');
    },
    [selectPlaybook, setPhase],
  );

  if (viewMode === 'NARRATIVE') {
    return (
      <SmoothScrollProvider>
        <StoryShell
          packet={packet}
          telemetryStatus={telemetryStatus}
          transportMode={transportMode}
          whatIf={whatIf}
          scenario={scenario}
          thrombusConfirmed={thrombusConfirmed}
          onChangeThrombusConfirmed={handleChangeThrombusConfirmed}
          onChangeWhatIf={handleChangeWhatIf}
          onResetWhatIf={handleResetWhatIf}
          onOpenOpticalScanner={() => setOpticalScannerOpen(true)}
          onExecuteAction={handleExecutePlaybookAction}
          onToggleViewMode={() => setViewMode('OPERATIONAL')}
          onOpenDrawer={(kind) => openDrawer(kind)}
          onOpenCommandPalette={() => openCommandPalette('COMMANDS')}
        />

        {/* Global Drawers & Modals accessible from Narrative Scrollytelling View */}
        <MissionPortalDrawer
          open={drawer === 'MISSION_PORTAL'}
          onClose={() => closeDrawer()}
          packet={packet}
          scenario={scenario}
          thrombusConfirmed={thrombusConfirmed}
          invokerElementId={invokerElementId}
        />

        <AuditAndProvenanceDrawer
          open={drawer === 'AUDIT_PROVENANCE'}
          onClose={() => closeDrawer()}
          packet={packet}
          telemetryStatus={telemetryStatus}
          httpBaseUrl={ENGINE_HTTP_URL}
          extraLocalAuditEntries={localAuditEntries}
          invokerElementId={invokerElementId}
        />

        <SlideOverDrawerShell
          open={drawer === 'PLAYBOOK_SHEET'}
          onClose={() => closeDrawer()}
          eyebrow="03 ACT // FULL MEDOPS PLAYBOOK SHEET [P]"
          title="Aerospace 360 Playbooks #01-#30 & Gates 1..7 Interlocks"
          subtitle="Press & Hold 1.5s to record permitted actions; inhibited actions require diagnostic verification"
          invokerElementId={invokerElementId}
        >
          <BranchedPlaybookDagLens
            packet={packet}
            scenario={scenario}
            whatIf={whatIf}
            thrombusConfirmed={thrombusConfirmed}
            onChangeWhatIf={handleChangeWhatIf}
            onExecuteAction={handleExecutePlaybookAction}
            expandedView
          />
        </SlideOverDrawerShell>

        <CommandPaletteOverlay
          packet={packet}
          whatIf={whatIf}
          transportMode={transportMode}
          httpBaseUrl={ENGINE_HTTP_URL}
          onChangeSex={handleChangeSex}
        />

        <ShortcutsOverlay />

        <AiInjuryModal
          open={opticalScannerOpen}
          onClose={() => setOpticalScannerOpen(false)}
          onAddMarker={(marker) => setInjuryMarkers((prev) => [marker, ...prev])}
          onSelectPlaybook={handleSelectPlaybookFromOptical}
        />
      </SmoothScrollProvider>
    );
  }

  return (
    <WorkbenchShell
      packet={packet}
      telemetryStatus={telemetryStatus}
      transportMode={transportMode}
      engineLive={link === 'ENGINE_LIVE'}
      httpBaseUrl={ENGINE_HTTP_URL}
      ipcLatencyUs={ipcLatencyUs}
      whatIf={whatIf}
      scenario={scenario}
      thrombusConfirmed={thrombusConfirmed}
      onChangeThrombusConfirmed={handleChangeThrombusConfirmed}
      onChangeWhatIf={handleChangeWhatIf}
      onResetWhatIf={handleResetWhatIf}
      availableSubjects={AVAILABLE_CREW_SUBJECTS}
      injuryMarkers={injuryMarkers}
      onOpenOpticalScanner={() => setOpticalScannerOpen(true)}
      onExecuteAction={handleExecutePlaybookAction}
      onSyncEngineNow={syncWhatIfNow}
      hasExternalModal={opticalScannerOpen}
      captureSnapshotRef={captureSnapshotRef}
      studioSlot={
        <>
          <BottomCopilotStudioPill
            packet={packet}
            whatIf={whatIf}
            httpBaseUrl={ENGINE_HTTP_URL}
          />
          <OpenScreenStudioBar />
        </>
      }
      drawerSlot={
        <>
          <MissionPortalDrawer
            open={drawer === 'MISSION_PORTAL'}
            onClose={() => closeDrawer()}
            packet={packet}
            scenario={scenario}
            thrombusConfirmed={thrombusConfirmed}
            invokerElementId={invokerElementId}
          />

          <AuditAndProvenanceDrawer
            open={drawer === 'AUDIT_PROVENANCE'}
            onClose={() => closeDrawer()}
            packet={packet}
            telemetryStatus={telemetryStatus}
            httpBaseUrl={ENGINE_HTTP_URL}
            extraLocalAuditEntries={localAuditEntries}
            invokerElementId={invokerElementId}
          />

          <SlideOverDrawerShell
            open={drawer === 'PLAYBOOK_SHEET'}
            onClose={() => closeDrawer()}
            eyebrow="03 ACT // FULL MEDOPS PLAYBOOK SHEET [P]"
            title="Aerospace 360 Playbooks #01-#30 & Gates 1..7 Interlocks"
            subtitle="Press & Hold 1.5s to record permitted actions; inhibited actions require diagnostic verification"
            invokerElementId={invokerElementId}
          >
            <BranchedPlaybookDagLens
              packet={packet}
              scenario={scenario}
              whatIf={whatIf}
              thrombusConfirmed={thrombusConfirmed}
              onChangeWhatIf={handleChangeWhatIf}
              onExecuteAction={handleExecutePlaybookAction}
              expandedView
            />
          </SlideOverDrawerShell>
        </>
      }
      modalSlot={
        <>
          <CommandPaletteOverlay
            packet={packet}
            whatIf={whatIf}
            transportMode={transportMode}
            httpBaseUrl={ENGINE_HTTP_URL}
            onChangeSex={handleChangeSex}
          />

          <ShortcutsOverlay />

          <AiInjuryModal
            open={opticalScannerOpen}
            onClose={() => setOpticalScannerOpen(false)}
            onAddMarker={(marker) => setInjuryMarkers((prev) => [marker, ...prev])}
            onSelectPlaybook={handleSelectPlaybookFromOptical}
          />
        </>
      }
      onInjectAnomaly={injectAnomaly}
    />
  );
}
