// Prognostic Quantile Cone & Coupled Frost-Hargens Bone-Renal Axis Lens (`ForecastAndBoneRenalLens`).
// Renders:
// - `STL_AND_CONES`: Monotone `q05 <= q50 <= q95` `QuantileConeChart` with explicit
//   `HEURISTIC_GATE_ACCEPTED` / `ABSTAINED_FALLBACK_DETERMINISTIC` Conformal Abstention badge
//   + 20 Hz zero-GC `WaveformCanvas2D` (`rhoMin`)
// - `BONE_RENAL_AXIS`: Frost-Hargens `1000 microstrain` mechanostat threshold, Sclerostin (`SOST`),
//   Irisin (`FNDC5`), Urinary Calcium (`mg/d`), Tiselius `AP(CaOx)` nephrolithiasis risk, and
//   scoped Drei `<View />` `<SecondaryMeshViewport specimen="FEMUR_TRABECULAR" />`.

import React from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import type { ScenarioState, WhatIf } from '../lib/scenario';
import { QuantileConeChart } from '../instruments/QuantileConeChart';
import { TabularCounter } from '../instruments/TabularCounter';
import { WaveformCanvas2D } from '../instruments/WaveformCanvas2D';
import { SecondaryMeshViewport } from '../stage3d/SecondaryMeshViewport';
import { buildClinicalViewModel } from '../lib/clinicalViewModel';
import { ClinicalDataNotice } from '../workbench/ClinicalDataNotice';
import { clinicalDataMode } from '../lib/clinicalViewModel';

export interface ForecastAndBoneRenalLensProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  empiricalBaselineScenario?: ScenarioState;
  whatIf: WhatIf;
  section: 'STL_AND_CONES' | 'BONE_RENAL_AXIS';
}

export function ForecastAndBoneRenalLens({
  packet,
  section,
}: ForecastAndBoneRenalLensProps) {
  const mode = clinicalDataMode(packet);
  const view = buildClinicalViewModel(packet);

  if (section === 'STL_AND_CONES') {
    return (
      <div className="space-y-2.5">
        <ClinicalDataNotice packet={packet} />
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-[var(--color-ink-meta)]">CONFORMAL FORECAST GATE</span>

        </div>

        <QuantileConeChart
          title="NQS-STL Robustness Trajectory (rho_global)"
          channelId="rho_global"
          unit="rho"
          timestralSummary={packet.timestral_quantiles}
          safetyThreshold={0}
          currentRho={view.rhoGlobal.value}
          isSimulatedOverlay={mode === 'LOCAL_PREVIEW' || mode === 'BACKEND_SCENARIO'}
          ttvIntervalKind={
            packet.safety_margins.ttv_interval_kind ?? 'ILLUSTRATIVE_SCENARIO_RANGE'
          }
        />

        <WaveformCanvas2D channel="rhoMin" windowSec={30} heightPx={58} />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <ClinicalDataNotice packet={packet} />
      <div className="grid grid-cols-2 gap-2">
        {([
          ['ARED load', view.aredLoad], ['Sclerostin (SOST)', view.sclerostin],
          ['Urinary calcium', view.urinaryCalcium], ['Calcium oxalate RSR', view.renalRsr],
          ['Renal colic model index', view.renalColic], ['Bone loss model', view.boneLoss],
        ] as const).map(([label, metric]) => <div className="ares-inner-well p-2" key={label} data-availability={metric.availability}>
          <TabularCounter label={label} value={metric.value} unit={metric.unit} decimals={2}
            unavailableLabel="N/A" unavailableReason={metric.reason} tone="display" size="sm" />
          <p className="font-mono text-[9px] text-[var(--color-ink-meta)]">{metric.provenance}</p>
        </div>)}
      </div>
      <p className="font-mono text-[10px] text-amber-300">Anatomical reference illustration; no measured remodeling is inferred from this mesh.</p>
      <SecondaryMeshViewport specimen="FEMUR_TRABECULAR" scalarLoad={0} observed={false}
        label="Femoral trabecular reference (unobserved)" className="h-40 w-full" />
    </div>
  );
}
