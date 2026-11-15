import { CockpitSelect, CockpitSummary } from '../ui-primitives/CockpitControls';
import { displayLabel } from '../../lib/displayLabel';
import { useEffect, useMemo, useState } from 'react';
import {
  ALL_CRYSTALLIZED_PLAYBOOK_LIST,
  CRYSTALLIZED_PLAYBOOK_LIST,
  enforceHardSafetyGatesOnActions,
  getCatalogEntry,
  isAnticoagulantAction,
  type PlaybookCatalogEntry,
} from '../../lib/playbookCatalog';
import type {
  ActivePlaybook,
  CountermeasureAction,
  ModelValidationStatus,
  SafetyGatesState,
} from '../../types/telemetry';

export interface PlaybookRunnerProps {
  activePlaybook: ActivePlaybook | null | undefined;
  isLiveEngine: boolean;
  monitoringStatus: 'urgent' | 'awaiting' | 'watch' | 'normal' | 'unavailable' | 'recovered' | 'recovered-watch' | 'procedure-pending';
  onRestoreScenario?: () => void;
  onSuggestedCompletionChange?: (completed: boolean) => void;
  thrombusConfirmed: boolean | null;
  ventEvent?: string | null;
  syncLatencyUs?: number | null;
  modelValidationStatus?: ModelValidationStatus | string | null;
  requestedPlaybook?: { id: string; seq: number } | null;
  onConfirmPocusThrombus: (v: boolean | null) => void;
  onRearmLbnp?: () => void;
}

function getEffectiveSafetyGates(
  activePlaybook: ActivePlaybook | null | undefined,
  thrombusConfirmed: boolean | null,
): SafetyGatesState {
  if (activePlaybook?.safety_gates) {
    return {
      anticoagulant_lock_active:
        activePlaybook.safety_gates.anticoagulant_lock_active || thrombusConfirmed !== true,
      lbnp_auto_vent_armed: activePlaybook.safety_gates.lbnp_auto_vent_armed,
      eva_suit_damping_active: activePlaybook.safety_gates.eva_suit_damping_active,
      gate4_invasive_decompression_locked:
        activePlaybook.safety_gates.gate4_invasive_decompression_locked ?? true,
      gate4_eva_fitness_no_go: activePlaybook.safety_gates.gate4_eva_fitness_no_go ?? false,
    };
  }
  return {
    anticoagulant_lock_active: thrombusConfirmed !== true,
    lbnp_auto_vent_armed: true,
    eva_suit_damping_active: false,
    gate4_invasive_decompression_locked: true,
    gate4_eva_fitness_no_go: false,
  };
}

export function PlaybookRunner({
  activePlaybook,
  isLiveEngine,
  monitoringStatus,
  onRestoreScenario,
  onSuggestedCompletionChange,
  thrombusConfirmed,
  ventEvent,
  syncLatencyUs,
  modelValidationStatus,
  requestedPlaybook,
  onConfirmPocusThrombus,
  onRearmLbnp,
}: PlaybookRunnerProps) {
  const [followLiveEngine, setFollowLiveEngine] = useState(true);
  const [manualPlaybookId, setManualPlaybookId] = useState<string>(
    CRYSTALLIZED_PLAYBOOK_LIST[0].playbook_id,
  );
  const [manualStepIdx, setManualStepIdx] = useState(0);

  useEffect(() => {
    if (requestedPlaybook) {
      setFollowLiveEngine(false);
      setManualPlaybookId(requestedPlaybook.id);
      setManualStepIdx(0);
    }
  }, [requestedPlaybook]);

  const suggested = activePlaybook && activePlaybook.playbook_id !== 'NONE' ? activePlaybook : null;
  const standby = followLiveEngine && suggested === null;
  const followingLive = followLiveEngine && suggested !== null;
  const usingSuggested = followingLive || (suggested !== null && suggested.playbook_id === manualPlaybookId);
  const selectedId = standby ? '' : usingSuggested && suggested ? suggested.playbook_id : manualPlaybookId;
  const selectedEntry = standby ? undefined : getCatalogEntry(selectedId) ?? (usingSuggested ? undefined : CRYSTALLIZED_PLAYBOOK_LIST[0]);

  const gates = getEffectiveSafetyGates(activePlaybook, thrombusConfirmed);

  const resolvedActions = useMemo<CountermeasureAction[]>(() => {
    if (standby) return [];
    if (
      usingSuggested &&
      activePlaybook?.actions &&
      activePlaybook.actions.length > 0
    ) {
      return activePlaybook.actions;
    }
    return enforceHardSafetyGatesOnActions(selectedEntry?.default_actions ?? [], gates);
  }, [standby, usingSuggested, activePlaybook, selectedEntry, gates]);

  const steps = useMemo(
    () =>
      resolvedActions.map((act) => ({
        text: act.label,
        requires_anticoagulant_unlock: isAnticoagulantAction(act),
      })),
    [resolvedActions],
  );
  const liveStepIdx =
    followingLive && typeof activePlaybook?.current_step === 'number'
      ? Math.max(0, Math.min(steps.length, activePlaybook.current_step - 1))
      : manualStepIdx;
  const activeStepIdx = Math.max(0, Math.min(steps.length, liveStepIdx));
  const currentStep = steps[activeStepIdx];

  const isAnticoagulantStep = Boolean(
    currentStep?.requires_anticoagulant_unlock ||
      resolvedActions.some((a) => isAnticoagulantAction(a)),
  );
  const stepLocked =
    Boolean(currentStep?.requires_anticoagulant_unlock) &&
    (gates.anticoagulant_lock_active || thrombusConfirmed !== true);

  const causalChain =
    followingLive &&
    activePlaybook?.causal_chain_summary &&
    activePlaybook.causal_chain_summary.length > 0
      ? activePlaybook.causal_chain_summary
      : selectedEntry?.default_causal_chain ?? [];

  const displayTitle =
    standby ? 'No procedure suggested' : usingSuggested && activePlaybook?.title ? activePlaybook.title : selectedEntry?.title ?? 'Suggested procedure';
  const displayStepInstruction =
    followingLive && activePlaybook?.step_instruction
      ? activePlaybook.step_instruction
      : currentStep?.text ?? 'Execution complete — monitor NQS-STL recovery';
  const validationTag = modelValidationStatus ?? 'ILLUSTRATIVE_UNVALIDATED';

  const completed = steps.length > 0 && activeStepIdx >= steps.length;
  useEffect(() => {
    if (usingSuggested) onSuggestedCompletionChange?.(completed);
  }, [usingSuggested, completed, onSuggestedCompletionChange]);
  const showUltrasoundFinding = isAnticoagulantStep || selectedEntry?.short_code === '#01' || selectedEntry?.short_code === '#02';
  const statusText = {
    urgent: 'Alarm still active',
    'procedure-pending': 'Readings stable · finish the procedure',
    awaiting: 'Recovery awaiting updated readings',
    recovered: 'Critical alert cleared',
    'recovered-watch': 'Critical alert cleared · continue monitoring',
    watch: 'Readings still under observation',
    normal: 'Readings within configured limits',
    unavailable: 'Current readings cannot be verified',
  }[monitoringStatus];

  const reviewStep = (index: number) => {
    setManualPlaybookId(selectedId);
    setFollowLiveEngine(false);
    setManualStepIdx(index);
  };

  return (
    <div className="act-procedure space-y-4 text-sm text-gray-200">
      <div className="act-procedure-meta">
        <span>{standby ? 'Monitoring standby' : usingSuggested ? (isLiveEngine ? 'Suggested by the engine' : 'Suggested by the simulation') : 'Manual review'} · {displayLabel(validationTag)}</span>

        {!usingSuggested && suggested && (
          <button type="button" onClick={() => {
            setFollowLiveEngine(true);
            setManualStepIdx(0);
          }} className="act-secondary-button">Switch to suggested procedure</button>
        )}
      </div>
      <h3 className="act-procedure-title">{displayLabel(displayTitle.replace(/^Playbook #\d+:\s*/i, ''))}</h3>
      {/* LBNP Pre-Syncope Emergency Vent Alert */}
      {ventEvent && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-critical bg-black px-3 py-2 text-xs text-critical">
          <span>GATE 2 AUTO-VENT TRIGGERED: {ventEvent}</span>
          {onRearmLbnp && (
            <button
              type="button"
              onClick={onRearmLbnp}
              className="min-h-[44px] min-w-[44px] rounded border border-critical px-3 py-2 text-xs font-semibold text-critical hover:bg-critical/10"
            >
              RE-ARM LBNP GUARDRAIL
            </button>
          )}
        </div>
      )}

      <p className="act-monitor-state" data-status={monitoringStatus} role="status">
        <strong>{statusText}.</strong> Status updates from the readings, independently of the checklist.
      </p>
      {standby ? <p>No active procedure is supported by the current readings. Continue monitoring or explicitly select a procedure for manual review.</p> : <>
      <section className="act-next-step" aria-labelledby="act-next-title">
        <h4 id="act-next-title">
          {completed ? 'Checklist complete' : currentStep ? `Do this now · Step ${activeStepIdx + 1} of ${steps.length}` : 'No steps available'}
        </h4>
        {currentStep && <p>{displayLabel(displayStepInstruction)}</p>}
        {completed && (monitoringStatus === 'urgent' || monitoringStatus === 'awaiting') && (
          <div className="act-recovery-controls">
            <p>The checklist is complete. The alert clears when updated readings confirm recovery.</p>
            {onRestoreScenario && (
              <button type="button" className="act-secondary-button" onClick={onRestoreScenario}>
                Restore simulated conditions
              </button>
            )}
          </div>
        )}
        {showUltrasoundFinding && (
      <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-black px-3 py-2 text-xs">
        <span className="text-gray-400">
          Ultrasound finding{isAnticoagulantStep ? ' · Gate 1' : ''}
        </span>
        {([
          ['Unscanned', null],
          ['Absent', false],
          ['Confirmed', true],
        ] as const).map(([lbl, v]) => (
          <button
            key={lbl}
            type="button"
            onClick={() => onConfirmPocusThrombus(v)}
            className={`min-h-12 min-w-[44px] rounded border px-3 py-2 text-xs font-semibold transition-colors ${
              thrombusConfirmed === v
                ? v === true
                  ? 'border-critical bg-critical/10 text-critical'
                  : 'border-nominal bg-nominal/10 text-nominal'
                : 'border-line bg-black text-gray-400 hover:border-gray-600'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

        )}
      {/* Stepper Controls (>= 48 px touch targets) */}
      <div className="act-step-actions flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          disabled={activeStepIdx === 0}
          onClick={() => reviewStep(Math.max(0, activeStepIdx - 1))}
          className="min-h-12 min-w-[44px] rounded border border-line bg-black px-4 py-2 text-gray-200 disabled:opacity-30"
        >
          Back
        </button>
        <button
          type="button"
          disabled={stepLocked || activeStepIdx >= steps.length}
          onClick={() => reviewStep(Math.min(steps.length, activeStepIdx + 1))}
          className="min-h-12 min-w-[44px] rounded border border-nominal bg-nominal px-4 py-2 font-semibold text-black disabled:border-line disabled:bg-black disabled:text-gray-400"
        >
          {stepLocked
            ? 'Step locked · POCUS required'
            : activeStepIdx >= steps.length
              ? 'Procedure complete'
              : 'Confirm step'}
        </button>
        {stepLocked && (
          <button
            type="button"
            onClick={() => reviewStep(Math.min(steps.length, activeStepIdx + 1))}
            className="min-h-12 min-w-[44px] rounded border border-line bg-black px-4 py-2 text-gray-300"
          >
            Skip locked step
          </button>
        )}
      </div>
      </section>
      <section aria-label="Procedure steps">
        <h4 className="act-steps-heading">Steps to follow</h4>
        <ol className="act-steps">
          {steps.map((step, index) => {
            const current = index === activeStepIdx;
            const blocked = Boolean(step.requires_anticoagulant_unlock) &&
              (gates.anticoagulant_lock_active || thrombusConfirmed !== true);
            return (
              <li key={index} aria-current={current ? 'step' : undefined}>
                <span>{displayLabel(current ? displayStepInstruction : step.text)}</span>
                {current && <small>Current step</small>}
                {blocked && <small className="text-critical">Safety lock active</small>}
              </li>
            );
          })}
        </ol>
      </section>

      </>}
      <details className="scenario-disclosure">
        <CockpitSummary>Browse other procedures</CockpitSummary>
      <label className="act-procedure-picker">
        Browse procedures
        <CockpitSelect value={selectedId} onChange={event => {
          const entry = ALL_CRYSTALLIZED_PLAYBOOK_LIST.find(item => item.playbook_id === event.target.value);
          if (!entry) return;
          setFollowLiveEngine(false);
          setManualPlaybookId(entry.playbook_id);
          setManualStepIdx(0);
        }}>
          {standby && <option value="" disabled>Select a procedure for manual review</option>}
          {usingSuggested && !selectedEntry && <option value={selectedId}>{displayTitle}</option>}
          {ALL_CRYSTALLIZED_PLAYBOOK_LIST.map(entry => (
            <option key={entry.playbook_id} value={entry.playbook_id}>
              {entry.title.replace(/^Playbook #\d+:\s*/i, '')}
            </option>
          ))}
        </CockpitSelect>
      </label>
      </details>
      <details className="scenario-disclosure">
        <CockpitSummary>Procedure details and sources</CockpitSummary>
        <p className="mb-3 text-xs text-gray-400">{displayLabel(validationTag)}{selectedEntry && ` · ${selectedEntry.normative_clause}`}
          {typeof syncLatencyUs === 'number' && Number.isFinite(syncLatencyUs) && ` · Engine response: ${syncLatencyUs} µs`}
        </p>
      {/* 4 Hard Clinical Safety Gates Strip (1, 2, 3, 4A, 4B) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
        <div
          className={`rounded border px-2.5 py-2 bg-black ${
            gates.anticoagulant_lock_active ? 'border-critical text-critical' : 'border-ok text-ok'
          }`}
        >
          GATE 1 ANTICOAG: {gates.anticoagulant_lock_active ? 'LOCKED (POCUS REQUIRED)' : 'UNLOCKED (THROMBUS CONFIRMED)'}
        </div>
        <div
          className={`rounded border px-2.5 py-2 bg-black ${
            gates.lbnp_auto_vent_armed ? 'border-ok text-ok' : 'border-caution text-caution'
          }`}
        >
          GATE 2 LBNP VENT: {gates.lbnp_auto_vent_armed ? 'ARMED (SBP/HR WATCH)' : 'STANDBY'}
        </div>
        <div
          className={`rounded border px-2.5 py-2 bg-black ${
            gates.eva_suit_damping_active ? 'border-caution text-caution' : 'border-line text-gray-400'
          }`}
        >
          GATE 3 EVA 0.38g DAMPING: {gates.eva_suit_damping_active ? 'ACTIVE (+25% ANKLE)' : 'STANDBY (GAI <= 12%)'}
        </div>
        <div
          className={`rounded border px-2.5 py-2 bg-black ${
            gates.gate4_invasive_decompression_locked !== false
              ? 'border-critical text-critical'
              : 'border-ok text-ok'
          }`}
        >
          GATE 4A THORACIC DECOMP:{' '}
          {gates.gate4_invasive_decompression_locked !== false
            ? 'LOCKED (EFAST REQUIRED)'
            : 'UNLOCKED (PNEUMOTHORAX VERIFIED)'}
        </div>
        <div
          className={`rounded border px-2.5 py-2 bg-black ${
            gates.gate4_eva_fitness_no_go ? 'border-critical text-critical' : 'border-ok text-ok'
          }`}
        >
          GATE 4B EVA FITNESS:{' '}
          {gates.gate4_eva_fitness_no_go ? 'NO-GO LOCK ACTIVE' : 'GO / CLEARED'}
        </div>
      </div>

      {/* Causal Chain & Ranked Countermeasure Actions */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded border border-line bg-black p-3 text-xs">
          <div className="mb-1.5 font-semibold text-gray-400">Why this procedure was selected</div>
          <ul className="list-disc space-y-1 pl-5 text-gray-300">
            {causalChain.map((clause, idx) => (
              <li key={idx}>
                {displayLabel(clause)}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-line bg-black p-3 text-xs">
          <div className="mb-1.5 font-semibold text-gray-400">
            Modeled actions ({resolvedActions.length})
          </div>
          <ul className="space-y-1.5">
            {resolvedActions.map((act) => {
              const blocked =
                isAnticoagulantAction(act) &&
                (gates.anticoagulant_lock_active || thrombusConfirmed !== true);
              return (
                <li
                  key={act.action_id}
                  className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${
                    blocked
                      ? 'border-critical/60 text-critical'
                      : act.category === 'HARD_SAFETY_GATE_OVERRIDE'
                        ? 'border-critical text-critical'
                        : 'border-line text-gray-200'
                  }`}
                >
                  <span>{act.label}</span>
                  <span className="shrink-0 text-[11px] text-nominal">
                    {act.delta_rho_per_hour >= 0 ? '+' : ''}
                    {act.delta_rho_per_hour.toFixed(2)} rho/h
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      </details>
    </div>
  );
}
