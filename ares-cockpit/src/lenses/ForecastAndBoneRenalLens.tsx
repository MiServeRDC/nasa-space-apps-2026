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
import { useWorkbenchStore } from '../stores/workbenchStore';

export interface ForecastAndBoneRenalLensProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  empiricalBaselineScenario?: ScenarioState;
  whatIf: WhatIf;
  section: 'STL_AND_CONES' | 'BONE_RENAL_AXIS';
}

export function ForecastAndBoneRenalLens({
  packet,
  scenario,
  empiricalBaselineScenario,
  whatIf,
  section,
}: ForecastAndBoneRenalLensProps) {
  const simulationMode = useWorkbenchStore((s) => s.simulationMode);
  const frostMicrostrain = Math.round((whatIf.ared_load_pct / 60) * 1050);

  if (section === 'STL_AND_CONES') {
    const abstained =
      packet.timestral_quantiles?.confidence_state === 'ABSTAINED_FALLBACK_DETERMINISTIC' ||
      packet.timestral_quantiles?.conformal_status === 'ABSTAINED_FALLBACK_DETERMINISTIC';

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-[var(--color-ink-meta)]">CONFORMAL FORECAST GATE</span>
          <span
            className={`rounded border px-1.5 py-0.5 font-semibold ${
              abstained
                ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
                : 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
            }`}
          >
            {abstained ? 'ABSTAINED_FALLBACK_DETERMINISTIC' : 'HEURISTIC_GATE_ACCEPTED'}
          </span>
        </div>

        <QuantileConeChart
          title="NQS-STL Robustness Trajectory (rho_global)"
          channelId="rho_global"
          unit="rho"
          timestralSummary={packet.timestral_quantiles}
          safetyThreshold={0}
          currentRho={packet.safety_margins.med_stl_rho_robustness ?? scenario.rhoMin}
          empiricalBaselineRho={empiricalBaselineScenario?.rhoMin ?? null}
          isSimulatedOverlay={simulationMode === 'simulated'}
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
      <div className="grid grid-cols-2 gap-2">
        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Periosteal Strain"
            sublabel="FROST 1000ue"
            value={frostMicrostrain}
            unit="ue"
            decimals={0}
            tone={frostMicrostrain < 1000 ? 'caution' : 'nominal'}
            size="sm"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Sclerostin (SOST)"
            sublabel="WNT INHIBITOR"
            value={packet.musculoskeletal?.sclerostin_pmol_l ?? scenario.sclerostin}
            unit="pmol/L"
            decimals={1}
            tone={scenario.sclerostin > 42 ? 'caution' : 'nominal'}
            size="sm"
          />
        </div>

        <div className="ares-inner-well p-2">
          <TabularCounter
            label="Urinary Calcium"
            sublabel="HYPERCALCIURIA"
            value={scenario.urinaryCalciumMgD}
            unit="mg/d"
            decimals={0}
            tone={scenario.urinaryCalciumMgD > 250 ? 'caution' : 'nominal'}
            size="sm"
          />
        </div>

        <div className="ares-inner-well p-2 font-mono">
          <div className="text-[10px] text-[var(--color-ink-meta)]">TISELIUS AP(CaOx)</div>
          <div
            className={`mt-1 text-sm font-semibold ${
              scenario.nephrolithiasisRisk === 'ELEVATED'
                ? 'text-rose-300'
                : scenario.nephrolithiasisRisk === 'MODERATE'
                  ? 'text-amber-300'
                  : 'text-emerald-300'
            }`}
          >
            {scenario.nephrolithiasisRisk} STONE RISK
          </div>
          <div className="mt-0.5 text-[9px] text-[var(--color-ink-muted)]">
            Irisin {scenario.irisin.toFixed(1)} ng/mL | BMD -{scenario.bmdLossPct.toFixed(1)}%
          </div>
        </div>
      </div>

      <SecondaryMeshViewport
        specimen="FEMUR_TRABECULAR"
        scalarLoad={Math.min(1, Math.max(0, scenario.bmdLossPct / 6))}
        observed
        label="3D Femoral Neck Trabecular Remodeling Mesh"
        className="h-40 w-full"
      />
    </div>
  );
}
