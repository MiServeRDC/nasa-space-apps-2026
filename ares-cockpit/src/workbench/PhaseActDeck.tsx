// `03 ACT` Contextual Deck (`PhaseActDeck`):
// - Left Slot 2 (`PhaseActLeftContext`): 5-Gate Hardware Clinical Safety Interlock Matrix
//   (`Gate 1` Anticoag Lock, `Gate 2` LBNP Auto-Vent, `Gate 3` 0.38g Ankle Damping, `Gate 4A` eFAST
//   Thoracostomy Lock, `Gate 4B` EVA No-Go) + Countermeasure Titration Sliders (Risk 3 scrub lock).
// - Right Dock (`PhaseActRightDock`): Mounts `BranchedPlaybookDagLens` (`#01-#15` with `P1-P6`
//   clinical triage precedence tags, non-blocking safety-override banner, `1500 ms` Press-and-Hold,
//   and `1-Click Verify ->` diagnostic deep-links).

import React, { useMemo } from 'react';
import type {
  CountermeasureAction,
  TelemetryPacket,
} from '../types/telemetry';
import type { ScenarioState, WhatIf } from '../lib/scenario';
import { BentoCardShell } from '../instruments/BentoCardShell';
import {
  BranchedPlaybookDagLens,
  resolvePlaybookSafetyDag,
} from '../lenses/BranchedPlaybookDagLens';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';

export interface PhaseActProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  whatIf: WhatIf;
  thrombusConfirmed: boolean | null;
  onChangeWhatIf: (patch: Partial<WhatIf>) => void;
  onResetWhatIf: () => void;
  onExecuteAction?: (playbookId: string, action: CountermeasureAction) => void;
}

export function PhaseActLeftContext({
  packet,
  scenario,
  whatIf,
  thrombusConfirmed,
  onChangeWhatIf,
  onResetWhatIf,
}: Omit<PhaseActProps, 'onExecuteAction'>) {
  const selectedPlaybookId = useWorkbenchStore((s) => s.selectedPlaybookId);
  const setIsScrubbing = useWorkbenchStore((s) => s.setIsScrubbing);
  const setSimulationMode = useWorkbenchStore((s) => s.setSimulationMode);

  const resolved = useMemo(
    () =>
      resolvePlaybookSafetyDag(
        packet,
        scenario,
        whatIf,
        thrombusConfirmed,
        selectedPlaybookId,
      ),
    [packet, scenario, selectedPlaybookId, thrombusConfirmed, whatIf],
  );

  // NotebookLM Risk 3 Fix: explicit pointer capture + `setIsScrubbing` lock
  const scrubProps = {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
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

  return (
    <BentoCardShell
      id="left-slot-2-act-context"
      tier="root"
      eyebrow="03 ACT | HARDWARE SAFETY INTERLOCKS"
      title="5-Gate Clinical Guardrails"
      className="min-h-0 flex-1"
      bodyClassName="space-y-2.5"
    >
      <div className="space-y-1.5">
        {resolved.dag.interlockMatrix.map((gate) => {
          const badgeCls =
            gate.status === 'TRIGGERED'
              ? 'border-rose-500/80 bg-rose-500/20 text-rose-200'
              : gate.status === 'LOCKED'
                ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                : gate.status === 'UNLOCKED'
                  ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                  : 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200';
          return (
            <div
              key={gate.code}
              className="ares-inner-well flex items-center justify-between gap-2 px-2.5 py-1.5 font-mono text-[10px]"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[var(--color-ink-display)]">
                  {gate.shortLabel}
                </div>
                <div className="truncate text-[9px] text-[var(--color-ink-meta)]">
                  {gate.detail}
                </div>
              </div>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${badgeCls}`}
              >
                {gate.status}
              </span>
            </div>
          );
        })}
      </div>

      {/* Countermeasure Titration Sliders */}
      <div className="ares-inner-well space-y-2 p-2.5 font-mono text-[10px]">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--color-ink-display)]">
            COUNTERMEASURE TITRATION
          </span>
          <button
            type="button"
            onClick={() => {
              setSimulationMode('empirical');
              onResetWhatIf();
              announcePolite('Countermeasure titration sliders reset to empirical baseline.');
            }}
            className="ares-interactive rounded border border-white/15 bg-black px-2 py-0.5 text-[9px] text-cyan-200"
          >
            RESET ALL
          </button>
        </div>

        <label className="block">
          <div className="flex justify-between text-[var(--color-ink-meta)]">
            <span>LBNP Negative Pressure</span>
            <span className="ares-tabular-metric text-cyan-200">{whatIf.lbnp_mmhg} mmHg</span>
          </div>
          <input
            type="range"
            min={-50}
            max={0}
            step={5}
            value={whatIf.lbnp_mmhg}
            className="ares-touch-target w-full cursor-pointer"
            onChange={(e) => {
              setSimulationMode('simulated');
              onChangeWhatIf({ lbnp_mmhg: Number(e.target.value) });
            }}
            {...scrubProps}
          />
        </label>

        <label className="block">
          <div className="flex justify-between text-[var(--color-ink-meta)]">
            <span>ARED Resistive Target</span>
            <span className="ares-tabular-metric text-cyan-200">{whatIf.ared_load_pct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={120}
            step={5}
            value={whatIf.ared_load_pct}
            className="ares-touch-target w-full cursor-pointer"
            onChange={(e) => {
              setSimulationMode('simulated');
              onChangeWhatIf({ ared_load_pct: Number(e.target.value) });
            }}
            {...scrubProps}
          />
        </label>
      </div>
    </BentoCardShell>
  );
}

export function PhaseActRightDock({
  packet,
  scenario,
  whatIf,
  thrombusConfirmed,
  onChangeWhatIf,
  onExecuteAction,
}: PhaseActProps) {
  const pinnedCard = useWorkbenchStore((s) => s.pinnedCard);
  const setPinnedCard = useWorkbenchStore((s) => s.setPinnedCard);
  const isPinned = pinnedCard === 'PLAYBOOK_DAG';

  return (
    <BentoCardShell
      id="right-dock-act"
      tier="root"
      eyebrow="03 ACT | DETERMINISTIC MEDOPS RUNNER"
      title="Branched Safety Gate Playbook DAG"
      pinned={isPinned}
      onTogglePin={() => setPinnedCard(isPinned ? null : 'PLAYBOOK_DAG')}
      className="h-full"
      bodyClassName="space-y-3"
    >
      <BranchedPlaybookDagLens
        packet={packet}
        scenario={scenario}
        whatIf={whatIf}
        thrombusConfirmed={thrombusConfirmed}
        onChangeWhatIf={onChangeWhatIf}
        onExecuteAction={onExecuteAction}
      />
    </BentoCardShell>
  );
}
