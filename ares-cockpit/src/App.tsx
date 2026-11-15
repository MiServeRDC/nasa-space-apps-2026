// Greenfield ("Terra Rasa") ARES-Health Spatial Biomedical Workbench Entry (`App.tsx`).
// Orchestrates:
// - 20 Hz dual-transport telemetry (`useTelemetry`) + counterfactual `WhatIf` ODE state
// - Single-screen `100dvh` 4-Layer `<WorkbenchShell>` (`<= 4` blurred root shells, zero page scroll)
// - Slide-Over Drawers (`MissionPortalDrawer`, `AuditAndProvenanceDrawer`, `PLAYBOOK_FULL`)
// - Ambient `<BottomCopilotStudioPill>` + `<= 29.8s` `<OpenScreenStudioBar>`
// - `<CommandPaletteOverlay>`, `<ShortcutsOverlay>`, and `<AiInjuryModal>`

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_WHATIF,
  evaluate,
  type CrewSex,
  type WhatIf,
} from './lib/scenario';
import { ENGINE_HTTP_URL, useTelemetry } from './lib/useTelemetry';
import type { CountermeasureAction, CrystallizedPlaybookId } from './types/telemetry';
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

const INITIAL_PREVIEW_HEAD_HASH =
  '4d29a8f0c1234e89b56701a2bcdef34567890fedcba9876543210abcdef12345';

async function computeSha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic 64-hex fallback for non-WebCrypto environments
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  const seg = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
  return seg.repeat(4);
}

export default function App() {
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);
  const [thrombusConfirmed, setThrombusConfirmed] = useState<boolean | null>(null);
  const [lastScanDay, setLastScanDay] = useState<number>(DEFAULT_WHATIF.mission_day);
  const [injuryMarkers, setInjuryMarkers] = useState<InjuryMarker[]>([]);
  const [opticalScannerOpen, setOpticalScannerOpen] = useState<boolean>(false);
  const [localAuditEntries, setLocalAuditEntries] = useState<AuditRecord[]>([]);

  const captureSnapshotRef = useRef<(() => CameraSnapshot) | null>(null);

  const drawer = useWorkbenchStore((s) => s.drawer);
  const invokerElementId = useWorkbenchStore((s) => s.invokerElementId);
  const closeDrawer = useWorkbenchStore((s) => s.closeDrawer);
  const setTwinSex = useWorkbenchStore((s) => s.setTwinSex);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const selectPlaybook = useWorkbenchStore((s) => s.selectPlaybook);
  const openDrawer = useWorkbenchStore((s) => s.openDrawer);
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
    }
    const qDrawer = params.get('drawer')?.toUpperCase();
    if (qDrawer === 'AUDIT') {
      openDrawer('AUDIT_PROVENANCE');
    }
  }, [openDrawer, setPhase, setStudioBarOpen, setTwinSex]);

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

  const handleExecutePlaybookAction = useCallback(
    (playbookId: string, action: CountermeasureAction) => {
      void (async () => {
        const seq = 4 + localAuditEntries.length;
        const prevHash =
          localAuditEntries[localAuditEntries.length - 1]?.current_hash_hex ??
          INITIAL_PREVIEW_HEAD_HASH;
        const timestampUtc = new Date().toISOString();
        const eventAction = `MEDOPS EXECUTED [${playbookId}]: ${action.label} (${action.action_id})`;
        const currentHash = await computeSha256Hex(
          `${seq}|${timestampUtc}|CREW_MEDICAL_OFFICER|${eventAction}|${prevHash}`,
        );
        setLocalAuditEntries((prev) => [
          ...prev,
          {
            sequence_index: seq,
            timestamp_utc: timestampUtc,
            actor_role: 'CREW_MEDICAL_OFFICER',
            event_action: eventAction,
            prev_hash_hex: prevHash,
            current_hash_hex: currentHash,
          },
        ]);
      })();
    },
    [localAuditEntries],
  );

  const handleChangeSex = useCallback(
    (sex: CrewSex) => {
      setTwinSex(sex);
      setWhatIf((prev) => ({ ...prev, sex }));
    },
    [setTwinSex],
  );

  const handleSelectPlaybookFromOptical = useCallback(
    (playbookId: CrystallizedPlaybookId) => {
      selectPlaybook(playbookId);
      setPhase('ACT');
    },
    [selectPlaybook, setPhase],
  );

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
            title="Crystallized Playbooks #01-#15 & 5-Gate Hardware Interlocks"
            subtitle="Press & Hold 1.5s to execute permitted actions; inhibited actions require diagnostic verification"
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
