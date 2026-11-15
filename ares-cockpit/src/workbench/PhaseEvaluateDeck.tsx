// `02 EVALUATE` Contextual Deck (`PhaseEvaluateDeck`):
// - Left Slot 2 (`PhaseEvaluateLeftContext`): Mission Readiness Index (`MRI 0-100`),
//   Time-To-Violation (`TTV`), and NQS-STL normalized robustness bars (`rho_k in (-inf, +1.0]`).
// - Right Dock (`PhaseEvaluateRightDock`, <= 3 tabs): Composes `ForecastAndBoneRenalLens`
//   (`STL_AND_CONES`, `BONE_RENAL_AXIS`) and `WhatIfCounterfactualLens` (`WHAT_IF_STRESS`).

import React from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import {
  DEFAULT_WHATIF,
  evaluate,
  type ScenarioState,
  type WhatIf,
} from '../lib/scenario';
import { buildClinicalViewModel } from '../lib/clinicalViewModel';
import { ClinicalDataNotice } from './ClinicalDataNotice';
import { formatTimeToViolation } from '../lib/telemetryValidation';
import { CANONICAL_REGIONS } from '../modules/body-3d-heatmap/uberonSpatialMapping';
import { BentoCardShell } from '../instruments/BentoCardShell';
import { TabularCounter } from '../instruments/TabularCounter';
import { NumberTicker } from '../components/magicui/number-ticker';
import { ForecastAndBoneRenalLens } from '../lenses/ForecastAndBoneRenalLens';
import { WhatIfCounterfactualLens } from '../lenses/WhatIfCounterfactualLens';
import { useWorkbenchStore } from '../stores/workbenchStore';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';

export interface PhaseEvaluateProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  empiricalBaselineScenario?: ScenarioState;
  whatIf: WhatIf;
  httpBaseUrl?: string;
  thrombusConfirmed?: boolean | null;
  onChangeWhatIf: (patch: Partial<WhatIf>) => void;
  onResetWhatIf: () => void;
  onSyncEngineNow?: () => Promise<void> | void;
}

export function PhaseEvaluateLeftContext({
  packet,
}: Pick<PhaseEvaluateProps, 'packet' | 'scenario'>) {
  const selectedUberonRegion = useWorkbenchStore((s) => s.selectedUberonRegion);
  const selectUberonRegion = useWorkbenchStore((s) => s.selectUberonRegion);

  const view = buildClinicalViewModel(packet);
  const mri = view.mri.value;
  const rhoMin = view.rhoGlobal.value;
  const ttvFormatted = formatTimeToViolation(
    packet.safety_margins,
    packet.quality_flags ?? packet.biometrics.quality_flags ?? [],
  );

  return (
    <TooltipProvider delayDuration={180}>
      <BentoCardShell
        id="left-slot-2-evaluate-context"
        tier="root"
        eyebrow="02 EVALUATE | NQS-STL CAUSAL ROBUSTNESS"
        title="Mission Readiness & Margins"
        className="min-h-0 flex-1"
        bodyClassName="space-y-2.5"
      >
        <ClinicalDataNotice packet={packet} />
        <div className="grid grid-cols-2 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                data-clinical-field="mri"
                data-availability={view.mri.availability}
                className={mri === null ? 'ares-missing-hatch rounded-[var(--radius-well)] p-2 cursor-help' : 'ares-inner-well p-2'}
              >
                <div className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 font-mono text-[9.5px] text-[var(--color-ink-meta)]">
                    <span className="font-semibold uppercase tracking-wider">Readiness (MRI)</span>
                    <span>0-100</span>
                  </div>
                  <div className="pt-0.5">
                    <NumberTicker
                      value={mri !== null ? Math.round(mri) : null}
                      decimals={0}
                      suffix="%"
                      missingText="--"
                      className={`text-xl font-bold leading-none ${
                        mri === null
                          ? 'text-[var(--color-ink-muted)]'
                          : mri < 55
                            ? 'text-rose-300'
                            : mri < 75
                              ? 'text-amber-200'
                              : 'text-emerald-300'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Readiness (MRI) · {view.mri.availability} ({view.mri.provenance}{view.mri.reason ? ` · ${view.mri.reason}` : ''})
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                data-clinical-field="rhoGlobal"
                data-availability={view.rhoGlobal.availability}
                className={rhoMin === null ? 'ares-missing-hatch rounded-[var(--radius-well)] p-2 cursor-help' : 'ares-inner-well p-2'}
              >
                <TabularCounter
                  label="Global rho_min"
                  sublabel="STL >= 0"
                  value={rhoMin}
                  unavailableLabel="--"
                  unavailableReason={view.rhoGlobal.reason}
                  decimals={2}
                  alwaysShowPlus
                  tone={
                    rhoMin !== null && rhoMin < 0
                      ? 'critical'
                      : rhoMin !== null && rhoMin < 0.2
                        ? 'caution'
                        : 'spatial'
                  }
                  size="md"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Global robustness (rho_min) · {view.rhoGlobal.availability} ({view.rhoGlobal.provenance}{view.rhoGlobal.reason ? ` · ${view.rhoGlobal.reason}` : ''})
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Time-To-Violation (TTV) honest card */}
        <div className="ares-inner-well px-2.5 py-2 font-mono text-[10px]">
          <div className="flex items-center justify-between text-[var(--color-ink-meta)]">
            <span>EWMA-OLS TIME-TO-VIOLATION</span>
            <span className="text-amber-300">ILLUSTRATIVE_SCENARIO_RANGE</span>
          </div>
          <div className="ares-tabular-metric mt-0.5 text-sm font-semibold text-[var(--color-ink-display)]">
            {ttvFormatted.primaryText}
          </div>
          <div className="text-[9px] text-[var(--color-ink-muted)]">
            {ttvFormatted.secondaryText}
          </div>
        </div>

        {/* Normalized Signal Temporal Logic predicate bars */}
        <div className="ares-inner-well space-y-1.5 p-2.5">
          <div className="font-mono text-[10px] font-semibold text-[var(--color-ink-meta)]">
            PREDICATE MARGINS rho_k in (-inf, +1.0]
          </div>
          {view.predicates.map((pred) => {
            const val = pred.metric.value;
            const pct = val === null ? 0 : Math.max(0, Math.min(100, ((val + 0.5) / 1.5) * 100));
            const violated = val !== null && val < 0;
            return (
              <Tooltip key={pred.key}>
                <TooltipTrigger asChild>
                  <div
                    data-availability={pred.metric.availability}
                    className={`space-y-0.5 rounded px-1 py-0.5 font-mono text-[10px] ${val === null ? 'ares-missing-hatch cursor-help' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-ink-body)]">{pred.label}</span>
                      <span
                        className={`ares-tabular-metric ${
                          val === null
                            ? 'text-[var(--color-status-caution)]'
                            : violated
                              ? 'text-rose-300'
                              : val < 0.2
                                ? 'text-amber-300'
                                : 'text-cyan-200'
                        }`}
                      >
                        {val === null ? '--' : val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)} (rho)
                      </span>
                    </div>
                    <div className={`h-1.5 w-full overflow-hidden rounded-full ${val === null ? 'bg-black/40' : 'bg-white/10'}`}>
                      <div
                        className={`h-full rounded-full ${
                          violated
                            ? 'bg-rose-500'
                            : val !== null && val < 0.2
                              ? 'bg-amber-400'
                              : 'bg-cyan-400'
                        }`}
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {pred.label} · {pred.metric.availability} ({pred.metric.provenance}{pred.metric.reason ? ` · ${pred.metric.reason}` : ''})
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

      {/* Quick UBERON hypergraph node jump pills */}
      <div className="flex flex-wrap gap-1 font-mono text-[9px]">
        {CANONICAL_REGIONS.map((meta, idx) => {
          const selected = selectedUberonRegion === meta.region;
          return (
            <button
              key={meta.uberonCurie}
              type="button"
              aria-pressed={selected}
              onClick={() => selectUberonRegion(selected ? null : meta.region)}
              className={`ares-interactive rounded border px-2 py-1 ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
              }`}
            >
              [{idx + 1}] {meta.key.toUpperCase()}
            </button>
          );
        })}
      </div>
      </BentoCardShell>
    </TooltipProvider>
  );
}

export function PhaseEvaluateRightDock({
  packet,
  scenario,
  empiricalBaselineScenario,
  whatIf,
  httpBaseUrl,
  thrombusConfirmed,
  onChangeWhatIf,
  onResetWhatIf,
  onSyncEngineNow,
}: PhaseEvaluateProps) {
  const evaluateTab = useWorkbenchStore((s) => s.evaluateTab);
  const setEvaluateTab = useWorkbenchStore((s) => s.setEvaluateTab);
  const pinnedCard = useWorkbenchStore((s) => s.pinnedCard);
  const setPinnedCard = useWorkbenchStore((s) => s.setPinnedCard);

  const isPinned =
    pinnedCard === 'FORECAST_BONE_RENAL' || pinnedCard === 'WHAT_IF_COUNTERFACTUAL';

  const effectiveBaseline =
    empiricalBaselineScenario ?? evaluate({ ...DEFAULT_WHATIF, sex: whatIf.sex });

  return (
    <BentoCardShell
      id="right-dock-evaluate"
      tier="root"
      eyebrow="02 EVALUATE | PROGNOSTIC DIGITAL TWIN"
      title="Quantile Cones & Mechanostat Axis"
      pinned={isPinned}
      onTogglePin={() =>
        setPinnedCard(
          isPinned
            ? null
            : evaluateTab === 'WHAT_IF_STRESS'
              ? 'WHAT_IF_COUNTERFACTUAL'
              : 'FORECAST_BONE_RENAL',
        )
      }
      className="h-full"
      bodyClassName="space-y-3"
    >
      {/* <= 3 Evaluate Dock Tabs */}
      <div
        role="tablist"
        aria-label="Evaluate prognostic views"
        className="grid grid-cols-3 gap-1"
      >
        {(
          [
            { id: 'STL_AND_CONES', label: 'STL & CONES' },
            { id: 'BONE_RENAL_AXIS', label: 'BONE-RENAL' },
            { id: 'WHAT_IF_STRESS', label: 'WHAT-IF [W]' },
          ] as const
        ).map((tab) => {
          const active = evaluateTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setEvaluateTab(tab.id)}
              className={`ares-interactive rounded-lg border py-1.5 font-mono text-[10px] font-semibold tracking-wider ${
                active
                  ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-black/50 text-[var(--color-ink-meta)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {evaluateTab === 'STL_AND_CONES' || evaluateTab === 'BONE_RENAL_AXIS' ? (
        <ForecastAndBoneRenalLens
          packet={packet}
          scenario={scenario}
          empiricalBaselineScenario={effectiveBaseline}
          whatIf={whatIf}
          section={evaluateTab}
        />
      ) : null}

      {evaluateTab === 'WHAT_IF_STRESS' ? (
        <WhatIfCounterfactualLens
          whatIf={whatIf}
          scenario={scenario}
          empiricalBaselineScenario={effectiveBaseline}
          httpBaseUrl={httpBaseUrl}
          thrombusConfirmed={thrombusConfirmed}
          onChangeWhatIf={onChangeWhatIf}
          onResetWhatIf={onResetWhatIf}
          onSyncEngineNow={onSyncEngineNow}
        />
      ) : null}
    </BentoCardShell>
  );
}
