// `01 GATHER` Contextual Deck (`PhaseGatherDeck`):
// - Left Slot 2 (`PhaseGatherLeftContext`): Habitat ECLSS (`ppCO2`, `O2`), CSA CANS Neutron
//   Radiation Dosimetry, SQI >= 0.70 gate, and BIDMC CSV missing-channel provenance.
// - Right Dock (`PhaseGatherRightDock`, <= 3 tabs): Composes `AnomalyDiagnosticsLens` and
//   `DiagnosticImagingLens` (`POCUS_IJV` / `OCULAR_ONSD` / `OPTICAL_AND_MRI`).

import React, { useEffect, useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import type { InjuryMarker } from '../types/injury';
import type {
  AnomalyInjectionKind,
  AnomalyInjectionResult,
} from '../lib/useTelemetry';
import type { ScenarioState } from '../lib/scenario';
import { BentoCardShell } from '../instruments/BentoCardShell';
import { buildClinicalViewModel } from '../lib/clinicalViewModel';
import { ClinicalDataNotice } from './ClinicalDataNotice';
import { TabularCounter } from '../instruments/TabularCounter';
import { AnomalyDiagnosticsLens } from '../lenses/AnomalyDiagnosticsLens';
import { DiagnosticImagingLens } from '../lenses/DiagnosticImagingLens';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';

export type GatherRightTab = 'ANOMALY_DSP' | 'IMAGING_US' | 'OPTICAL_3D';

export interface PhaseGatherProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  engineLive: boolean;
  httpBaseUrl: string;
  thrombusConfirmed: boolean | null;
  onChangeThrombusConfirmed: (confirmed: boolean | null) => void;
  onInjectAnomaly?: (
    kind: AnomalyInjectionKind,
    durationS?: number,
  ) => Promise<AnomalyInjectionResult>;
  injuryMarkers?: readonly InjuryMarker[];
  onOpenOpticalScanner?: () => void;
}

export function PhaseGatherLeftContext({
  packet,
}: Pick<PhaseGatherProps, 'packet' | 'scenario'>) {
  const view = buildClinicalViewModel(packet);
  const bio = packet.biometrics;
  const ppco2 = view.cabinCo2.value;
  const o2Kpa = view.cabinO2.value;
  const radMsvD = view.radiationDose.value;
  const cumRadMgy = view.cumulativeRadiation.value;
  const missing = bio.missing_channels ?? [];

  return (
    <BentoCardShell
      id="left-slot-2-gather-context"
      tier="root"
      eyebrow="01 GATHER | SENSOR & HABITAT FUSION"
      title="ECLSS & CSA CANS Dosimetry"
      className="min-h-0 flex-1"
      bodyClassName="space-y-2.5"
    >
      <ClinicalDataNotice packet={packet} />
      <p className="font-mono text-[10px] text-[var(--color-ink-meta)]">Habitat inputs: {view.cabinO2.provenance}. Dosimetry channel: {view.radiationDose.provenance}.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Cabin ppCO2"
            sublabel="LIMIT 4.0"
            value={ppco2}
            unit="mmHg"
            decimals={2}
            tone={ppco2 !== null && ppco2 >= 4.0 ? 'critical' : 'nominal'}
            size="sm"
            unavailableLabel="N/A"
          />
        </div>

        <div className="ares-inner-well p-2" data-clinical-field="cabinO2" data-availability={view.cabinO2.availability}>
          <TabularCounter
            label="Cabin O2"
            sublabel="SOURCE VALUE"
            value={o2Kpa}
            unavailableLabel="N/A"
            unit="kPa"
            decimals={1}
            tone="nominal"
            size="sm"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="CSA CANS Dose"
            sublabel="SPE >1.50"
            value={radMsvD}
            unavailableLabel="N/A"
            unit="mSv/d"
            decimals={2}
            tone={radMsvD === null ? 'caution' : radMsvD > 1.5 ? 'critical' : radMsvD > 0.9 ? 'caution' : 'nominal'}
            size="sm"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Cumulative Dose"
            sublabel="TRANSIT"
            value={cumRadMgy}
            unavailableLabel="N/A"
            unit="mGy"
            decimals={1}
            tone="spatial"
            size="sm"
          />
        </div>
      </div>

      <div className="ares-inner-well space-y-1 p-2.5 font-mono text-[10px]">
        <div className="flex items-center justify-between text-[var(--color-ink-body)]">
          <span>DATASET PROVENANCE</span>
          <span className="text-emerald-300">
            {packet.provenance_manifest.biometrics_source}
          </span>
        </div>
        <div className="flex items-center justify-between text-[var(--color-ink-meta)]">
          <span>CONTACTLESS DSP</span>
          <span>60 GHZ RADAR + VOCAL JITTER READY</span>
        </div>
        <div className="flex items-center justify-between text-[var(--color-ink-meta)]">
          <span>MISSING CHANNELS</span>
          <span className={missing.length > 0 ? 'text-amber-300' : 'text-emerald-300'}>
            {missing.length > 0 ? missing.join(', ') : 'NONE (ALL CORE LOCKED)'}
          </span>
        </div>
      </div>
    </BentoCardShell>
  );
}

export function PhaseGatherRightDock({
  packet,
  scenario,
  engineLive,
  httpBaseUrl,
  thrombusConfirmed,
  onChangeThrombusConfirmed,
  onInjectAnomaly,
  injuryMarkers = [],
  onOpenOpticalScanner,
}: PhaseGatherProps) {
  const pinnedCard = useWorkbenchStore((s) => s.pinnedCard);
  const setPinnedCard = useWorkbenchStore((s) => s.setPinnedCard);
  const imagingTab = useWorkbenchStore((s) => s.imagingTab);
  const setImagingTab = useWorkbenchStore((s) => s.setImagingTab);
  const returnBreadcrumb = useWorkbenchStore((s) => s.returnBreadcrumb);
  const popReturnBreadcrumb = useWorkbenchStore((s) => s.popReturnBreadcrumb);

  const [activeTab, setActiveTab] = useState<GatherRightTab>('ANOMALY_DSP');

  // Auto-focus Imaging tab when arriving via 1-Click Verify from PhaseActDeck
  useEffect(() => {
    if (pinnedCard === 'DIAGNOSTIC_IMAGING') {
      if (imagingTab === 'OPTICAL_AND_MRI') {
        setActiveTab('OPTICAL_3D');
      } else {
        setActiveTab('IMAGING_US');
      }
    }
  }, [imagingTab, pinnedCard]);

  const isPinned =
    pinnedCard === 'DIAGNOSTIC_IMAGING' || pinnedCard === 'ANOMALY_DIAGNOSTICS';

  return (
    <BentoCardShell
      id="right-dock-gather"
      tier="root"
      eyebrow="01 GATHER | MULTIMODAL DIAGNOSTICS"
      title="Anomaly Detector & Ultrasound Bay"
      pinned={isPinned}
      onTogglePin={() =>
        setPinnedCard(
          isPinned
            ? null
            : activeTab === 'ANOMALY_DSP'
              ? 'ANOMALY_DIAGNOSTICS'
              : 'DIAGNOSTIC_IMAGING',
        )
      }
      headerActions={
        returnBreadcrumb ? (
          <button
            type="button"
            onClick={() => {
              const crumb = popReturnBreadcrumb();
              if (crumb) {
                announcePolite(`Returned to Playbook ${crumb.shortCode} after diagnostic check.`);
              }
            }}
            className="ares-touch-target ares-interactive rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-2.5 font-mono text-[10px] font-semibold text-cyan-200"
          >
            &lt;- PLAYBOOK {returnBreadcrumb.shortCode}
          </button>
        ) : null
      }
      className="h-full"
      bodyClassName="space-y-3"
    >
      {/* <= 3 Dock Tabs */}
      <div
        role="tablist"
        aria-label="Gather diagnostic instruments"
        className="grid grid-cols-3 gap-1"
      >
        {(
          [
            { id: 'ANOMALY_DSP', label: 'ANOMALY DSP' },
            { id: 'IMAGING_US', label: 'POCUS / ONSD' },
            { id: 'OPTICAL_3D', label: 'OPTICAL & 3D' },
          ] as const
        ).map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'IMAGING_US') setImagingTab('POCUS_IJV');
                if (tab.id === 'OPTICAL_3D') setImagingTab('OPTICAL_AND_MRI');
              }}
              className={`ares-interactive rounded-lg border py-1.5 font-mono text-[10px] font-semibold tracking-wider ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-black/50 text-[var(--color-ink-meta)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'ANOMALY_DSP' ? (
        <AnomalyDiagnosticsLens
          packet={packet}
          scenario={scenario}
          engineLive={engineLive}
          httpBaseUrl={httpBaseUrl}
          onInjectAnomaly={onInjectAnomaly}
        />
      ) : null}

      {activeTab === 'IMAGING_US' ? (
        <DiagnosticImagingLens
          packet={packet}
          scenario={scenario}
          thrombusConfirmed={thrombusConfirmed}
          onChangeThrombusConfirmed={onChangeThrombusConfirmed}
          injuryMarkers={injuryMarkers}
          onOpenOpticalScanner={onOpenOpticalScanner}
          mode="ULTRASOUND"
        />
      ) : null}

      {activeTab === 'OPTICAL_3D' ? (
        <DiagnosticImagingLens
          packet={packet}
          scenario={scenario}
          thrombusConfirmed={thrombusConfirmed}
          onChangeThrombusConfirmed={onChangeThrombusConfirmed}
          injuryMarkers={injuryMarkers}
          onOpenOpticalScanner={onOpenOpticalScanner}
          mode="OPTICAL_3D"
        />
      ) : null}
    </BentoCardShell>
  );
}
