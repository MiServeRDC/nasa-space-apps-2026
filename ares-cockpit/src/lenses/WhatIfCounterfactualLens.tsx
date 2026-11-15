// Counterfactual What-If Stress-Test Lens (`WhatIfCounterfactualLens`).
// Implements:
// - All 6 coupled counterfactual inputs (`sex`, `mission_day`, `ppco2_mmhg`, `ared_load_pct`,
//   `lbnp_mmhg`, `artifact_level`)
// - NotebookLM Risk 3 Fix: `onPointerDown -> e.stopPropagation() + e.currentTarget.setPointerCapture
//   + setIsScrubbing(true)` on every `>= 48px` slider so `OrbitControls` never intercepts drags
// - `+/- 2.5%` magnetic baseline detents (`snapToMagneticBaseline`)
// - `requestAnimationFrame`-coalesced `POST ${httpBaseUrl}/api/stress-test` sync (`<= 1` RPC/frame)
// - Empirical Ghost vs Simulated Delta comparison matrix + sticky `Reset All to Live Empirical` pill

import React, { useCallback, useEffect, useRef } from 'react';
import {
  DEFAULT_WHATIF,
  type CrewSex,
  type ScenarioState,
  type WhatIf,
} from '../lib/scenario';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';
import {
  EMPIRICAL_WHATIF_BASELINE,
  hasWhatIfDeviation,
  snapToMagneticBaseline,
} from './lensMath';

export interface WhatIfCounterfactualLensProps {
  whatIf: WhatIf;
  scenario: ScenarioState;
  empiricalBaselineScenario: ScenarioState;
  httpBaseUrl?: string;
  thrombusConfirmed?: boolean | null;
  onChangeWhatIf: (patch: Partial<WhatIf>) => void;
  onResetWhatIf: () => void;
  onSyncEngineNow?: () => Promise<void> | void;
}

export function WhatIfCounterfactualLens({
  whatIf,
  scenario,
  empiricalBaselineScenario,
  httpBaseUrl = 'http://127.0.0.1:8080',
  thrombusConfirmed = null,
  onChangeWhatIf,
  onResetWhatIf,
  onSyncEngineNow,
}: WhatIfCounterfactualLensProps) {
  const isScrubbing = useWorkbenchStore((s) => s.isScrubbing);
  const setIsScrubbing = useWorkbenchStore((s) => s.setIsScrubbing);
  const setSimulationMode = useWorkbenchStore((s) => s.setSimulationMode);
  const setTwinSex = useWorkbenchStore((s) => s.setTwinSex);

  // `requestAnimationFrame`-coalesced `/api/stress-test` dispatcher (`<= 1` call per frame)
  const pendingPatchRef = useRef<WhatIf | null>(null);
  const rafSyncIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafSyncIdRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafSyncIdRef.current);
      }
      setIsScrubbing(false);
    };
  }, [setIsScrubbing]);

  const scheduleCoalescedEngineSync = useCallback(
    (nextWhatIf: WhatIf) => {
      pendingPatchRef.current = nextWhatIf;
      if (rafSyncIdRef.current !== null || typeof window === 'undefined') return;
      rafSyncIdRef.current = window.requestAnimationFrame(() => {
        rafSyncIdRef.current = null;
        const latest = pendingPatchRef.current;
        pendingPatchRef.current = null;
        if (!latest) return;
        if (onSyncEngineNow) {
          void onSyncEngineNow();
          return;
        }
        void fetch(`${httpBaseUrl}/api/stress-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ppco2_mmhg: latest.ppco2_mmhg,
            ared_load_pct: latest.ared_load_pct,
            lbnp_mmhg: latest.lbnp_mmhg,
            mission_day: latest.mission_day,
            artifact_level: latest.artifact_level,
            sex: latest.sex,
            thrombus_confirmed: thrombusConfirmed,
          }),
        }).catch(() => {
          // Offline air-gapped fallback uses deterministic `scenario.ts`
        });
      });
    },
    [httpBaseUrl, onSyncEngineNow, thrombusConfirmed],
  );

  // NotebookLM Risk 3 Fix: explicit pointer capture + `setIsScrubbing` lock on every slider
  const scrubHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic non-DOM pointer events in headless tests
      }
      setIsScrubbing(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLInputElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      setIsScrubbing(false);
    },
    onPointerCancel: () => setIsScrubbing(false),
    onBlur: () => setIsScrubbing(false),
  };

  const applySnappedPatch = (patch: Partial<WhatIf>): void => {
    const merged: WhatIf = { ...whatIf, ...patch };
    const deviated = hasWhatIfDeviation(merged);
    setSimulationMode(deviated ? 'simulated' : 'empirical');
    onChangeWhatIf(patch);
    scheduleCoalescedEngineSync(merged);
  };

  const handleSexSwitch = (sex: CrewSex): void => {
    setTwinSex(sex);
    onChangeWhatIf({ sex });
    announcePolite(`Switched digital twin anthropometric baseline to ${sex}.`);
  };

  const handleResetAll = (): void => {
    setSimulationMode('empirical');
    onResetWhatIf();
    announcePolite('Reset all counterfactual What-If sliders to the default local scenario.');
  };

  const deviated = hasWhatIfDeviation(whatIf);
  const frostMicrostrain = Math.round((whatIf.ared_load_pct / 60) * 1050);

  return (
    <div
      className="space-y-2.5"
      data-scrubbing={isScrubbing ? 'true' : 'false'}
      data-deviated={deviated ? 'true' : 'false'}
    >
      {/* Top Epistemic Provenance + Sticky Reset Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
        <span
          className={`rounded border px-2 py-0.5 font-semibold ${
            deviated
              ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
              : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {deviated
            ? '[DELTA SIMULATED - UNVALIDATED]'
            : '[EMPIRICAL BASELINE DETENT LOCKED]'}
        </span>

        {deviated ? (
          <button
            type="button"
            onClick={handleResetAll}
            className="ares-touch-target ares-interactive rounded-lg border border-amber-400/70 bg-amber-500/20 px-3 font-semibold text-amber-100"
          >
            RESET ALL TO LIVE EMPIRICAL
          </button>
        ) : null}
      </div>

      {/* 1. Biological Sex Anthropometric Switch (`MALE` / `FEMALE`) */}
      <div className="ares-inner-well p-2.5 font-mono text-[10px]">
        <div className="mb-1.5 flex items-center justify-between text-[var(--color-ink-meta)]">
          <span>ANTHROPOMETRIC COHORT [M / F]</span>
          <span className="text-cyan-200">{whatIf.sex}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['MALE', 'FEMALE'] as const).map((sexOpt) => {
            const active = whatIf.sex === sexOpt;
            return (
              <button
                key={sexOpt}
                type="button"
                aria-pressed={active}
                onClick={() => handleSexSwitch(sexOpt)}
                className={`ares-touch-target ares-interactive rounded-lg border font-semibold ${
                  active
                    ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-100'
                    : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                }`}
              >
                {sexOpt} TWIN
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-6. Five Continuous Counterfactual Sliders (`>= 48px` hit targets + magnetic detents) */}
      <div className="ares-inner-well space-y-3 p-3 font-mono text-[11px]">
        {/* Mission Elapsed Sol */}
        <label className="block space-y-0.5">
          <div className="flex items-center justify-between">
            <span>Mission Transit Sol (detent {EMPIRICAL_WHATIF_BASELINE.mission_day})</span>
            <span className="ares-tabular-metric text-cyan-200">
              Sol {Math.round(whatIf.mission_day)}
              {Math.abs(whatIf.mission_day - EMPIRICAL_WHATIF_BASELINE.mission_day) < 1e-3
                ? ' [DETENT]'
                : ''}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={500}
            step={1}
            value={whatIf.mission_day}
            aria-label="Mission elapsed Sol"
            className="ares-touch-target w-full cursor-pointer"
            onChange={(e) => {
              const snapped = snapToMagneticBaseline(
                Number(e.target.value),
                EMPIRICAL_WHATIF_BASELINE.mission_day,
                1,
                500,
              );
              applySnappedPatch({ mission_day: Math.round(snapped.value) });
            }}
            {...scrubHandlers}
          />
        </label>

        {/* Cabin ppCO2 */}
        <label className="block space-y-0.5">
          <div className="flex items-center justify-between">
            <span>Cabin ppCO2 (limit 4.0 mmHg)</span>
            <span
              className={`ares-tabular-metric ${
                whatIf.ppco2_mmhg >= 4.0 ? 'text-rose-300' : 'text-cyan-200'
              }`}
            >
              {whatIf.ppco2_mmhg.toFixed(1)} mmHg
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={6.5}
            step={0.1}
            value={whatIf.ppco2_mmhg}
            aria-label="Cabin partial pressure CO2 in mmHg"
            className="ares-touch-target w-full cursor-pointer"
            onChange={(e) => {
              const snapped = snapToMagneticBaseline(
                Number(e.target.value),
                DEFAULT_WHATIF.ppco2_mmhg,
                0.5,
                6.5,
              );
              applySnappedPatch({ ppco2_mmhg: Number(snapped.value.toFixed(1)) });
            }}
            {...scrubHandlers}
          />
        </label>

        {/* ARED Resistive Load */}
        <label className="block space-y-0.5">
          <div className="flex items-center justify-between">
            <span>ARED Load (Frost 1000ue @ ~58%)</span>
            <span className="ares-tabular-metric text-cyan-200">
              {whatIf.ared_load_pct.toFixed(0)}% ({frostMicrostrain} ue)
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={120}
            step={2}
            value={whatIf.ared_load_pct}
            aria-label="ARED resistive load percentage"
            className="ares-touch-target w-full cursor-pointer"
            onChange={(e) => {
              const snapped = snapToMagneticBaseline(
                Number(e.target.value),
                DEFAULT_WHATIF.ared_load_pct,
                0,
                120,
              );
              applySnappedPatch({ ared_load_pct: Math.round(snapped.value) });
            }}
            {...scrubHandlers}
          />
        </label>

        {/* LBNP Negative Pressure */}
        <label className="block space-y-0.5">
          <div className="flex items-center justify-between">
            <span>LBNP Chamber (Gate 2 auto-vent)</span>
            <span className="ares-tabular-metric text-cyan-200">
              {whatIf.lbnp_mmhg} mmHg
            </span>
          </div>
          <input
            type="range"
            min={-50}
            max={0}
            step={5}
            value={whatIf.lbnp_mmhg}
            aria-label="Lower body negative pressure in mmHg"
            className="ares-touch-target w-full cursor-pointer"
            onChange={(e) => {
              const snapped = snapToMagneticBaseline(
                Number(e.target.value),
                DEFAULT_WHATIF.lbnp_mmhg,
                -50,
                0,
              );
              applySnappedPatch({ lbnp_mmhg: Math.round(snapped.value) });
            }}
            {...scrubHandlers}
          />
        </label>

        {/* Sensor Artifact Contamination */}
        <label className="block space-y-0.5">
          <div className="flex items-center justify-between">
            <span>Motion / Sweat Artifact (SQI gate)</span>
            <span
              className={`ares-tabular-metric ${
                scenario.sqi < 0.7 ? 'text-amber-300' : 'text-cyan-200'
              }`}
            >
              {Math.round(whatIf.artifact_level * 100)}% (SQI {scenario.sqi.toFixed(2)})
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={whatIf.artifact_level}
            aria-label="Sensor artifact level"
            className="ares-touch-target w-full cursor-pointer"
            onChange={(e) => {
              const snapped = snapToMagneticBaseline(
                Number(e.target.value),
                DEFAULT_WHATIF.artifact_level,
                0,
                1,
              );
              applySnappedPatch({ artifact_level: Number(snapped.value.toFixed(2)) });
            }}
            {...scrubHandlers}
          />
        </label>
      </div>

      {/* Empirical Ghost vs Simulated Delta Comparison Matrix */}
      <div className="ares-inner-well p-2.5 font-mono text-[10px]">
        <div className="mb-1.5 flex items-center justify-between font-semibold text-[var(--color-ink-meta)]">
          <span>DEFAULT SCENARIO VS EDITED SCENARIO</span>
          <span className="text-amber-300">LOCAL PREVIEW / UNVALIDATED</span>
        </div>
        <div className="space-y-1">
          {(
            [
              {
                label: 'Readiness MRI',
                emp: empiricalBaselineScenario.mri,
                sim: scenario.mri,
                unit: '%',
                dec: 0,
              },
              {
                label: 'Global rho_min',
                emp: empiricalBaselineScenario.rhoMin,
                sim: scenario.rhoMin,
                unit: '',
                dec: 2,
              },
              {
                label: 'IJV Shear tau_w',
                emp: empiricalBaselineScenario.tauW,
                sim: scenario.tauW,
                unit: 'dyn/cm2',
                dec: 2,
              },
              {
                label: 'Ocular ONSD',
                emp: empiricalBaselineScenario.onsdMm,
                sim: scenario.onsdMm,
                unit: 'mm',
                dec: 2,
              },
              {
                label: 'Sclerostin SOST',
                emp: empiricalBaselineScenario.sclerostin,
                sim: scenario.sclerostin,
                unit: 'pmol/L',
                dec: 1,
              },
            ] as const
          ).map((row) => {
            const delta = row.sim - row.emp;
            const deltaText =
              Math.abs(delta) < 0.005
                ? '0.00'
                : `${delta > 0 ? '+' : ''}${delta.toFixed(row.dec)}`;
            return (
              <div
                key={row.label}
                className="flex items-center justify-between border-t border-white/5 pt-1"
              >
                <span className="text-[var(--color-ink-body)]">{row.label}</span>
                <span className="ares-tabular-metric text-[var(--color-ink-display)]">
                  {row.emp.toFixed(row.dec)} -&gt; {row.sim.toFixed(row.dec)} {row.unit} (
                  <span className={Math.abs(delta) > 0.01 ? 'text-amber-300' : 'text-slate-400'}>
                    {deltaText}
                  </span>
                  )
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
