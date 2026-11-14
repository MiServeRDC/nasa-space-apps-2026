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

  const liveCatalogMatch = useMemo<PlaybookCatalogEntry | undefined>(() => {
    if (!activePlaybook || activePlaybook.playbook_id === 'NONE') return undefined;
    return getCatalogEntry(activePlaybook.playbook_id);
  }, [activePlaybook]);

  const followingLive = followLiveEngine && Boolean(liveCatalogMatch);
  const selectedEntry = useMemo<PlaybookCatalogEntry>(() => {
    if (followingLive && liveCatalogMatch) return liveCatalogMatch;
    return getCatalogEntry(manualPlaybookId) ?? CRYSTALLIZED_PLAYBOOK_LIST[0];
  }, [followingLive, liveCatalogMatch, manualPlaybookId]);

  const gates = getEffectiveSafetyGates(activePlaybook, thrombusConfirmed);

  const resolvedActions = useMemo<CountermeasureAction[]>(() => {
    if (
      followingLive &&
      activePlaybook?.actions &&
      activePlaybook.actions.length > 0
    ) {
      return activePlaybook.actions;
    }
    return enforceHardSafetyGatesOnActions(selectedEntry.default_actions, gates);
  }, [followingLive, activePlaybook, selectedEntry, gates]);

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
      : selectedEntry.default_causal_chain;

  const displayTitle =
    followingLive && activePlaybook?.title ? activePlaybook.title : selectedEntry.title;
  const displayStepInstruction =
    followingLive && activePlaybook?.step_instruction
      ? activePlaybook.step_instruction
      : currentStep?.text ?? 'Execution complete — monitor NQS-STL recovery';
  const validationTag = modelValidationStatus ?? 'ILLUSTRATIVE_UNVALIDATED';

  return (
    <div className="space-y-3 bg-black font-mono text-sm text-gray-200">
      {/* Engine Binding & Validation Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-black px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded border px-2 py-0.5 font-semibold ${
              followingLive
                ? isLiveEngine
                  ? 'border-ok text-ok'
                  : 'border-nominal text-nominal'
                : 'border-caution text-caution'
            }`}
          >
            {followingLive
              ? isLiveEngine
                ? 'LIVE ENGINE BINDING'
                : 'SIMULATOR PLAYBOOK BINDING'
              : 'MANUAL INSPECT MODE'}
          </span>
          <span className="text-gray-400">
            ID: <span className="text-gray-200">{selectedEntry.short_code}</span>
          </span>
          {typeof syncLatencyUs === 'number' && Number.isFinite(syncLatencyUs) && (
            <span className="text-gray-500">IPC {syncLatencyUs} us</span>
          )}
          <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
            {validationTag}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setFollowLiveEngine(true);
            setManualStepIdx(0);
          }}
          className={`min-h-12 min-w-[44px] rounded border px-3 py-2 text-xs font-semibold transition-colors ${
            followLiveEngine
              ? 'border-nominal bg-nominal/10 text-nominal'
              : 'border-line bg-black text-gray-300 hover:border-gray-500'
          }`}
        >
          FOLLOW LIVE ENGINE
        </button>
      </div>

      {/* Playbook Tabs (#01 .. #09) */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Crystallized MedOps Playbooks">
        {ALL_CRYSTALLIZED_PLAYBOOK_LIST.map((pb) => {
          const isSelected = pb.playbook_id === selectedEntry.playbook_id;
          const isEngineRecommended = liveCatalogMatch?.playbook_id === pb.playbook_id;
          return (
            <button
              key={pb.playbook_id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                setFollowLiveEngine(false);
                setManualPlaybookId(pb.playbook_id);
                setManualStepIdx(0);
              }}
              className={`min-h-12 min-w-[44px] rounded border px-3 py-2 text-xs transition-colors ${
                isSelected
                  ? 'border-nominal bg-nominal/10 text-nominal'
                  : 'border-line bg-black text-gray-400 hover:border-gray-600'
              }`}
            >
              <span>PB {pb.short_code}</span>
              {isEngineRecommended && (
                <span className="ml-1.5 text-[10px] text-ok">[ACTIVE]</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Playbook Summary & Step Instruction */}
      <div className="act-current space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-gray-100">{displayTitle}</div>
          <div className="text-xs text-gray-400">
            STEP {Math.min(activeStepIdx + 1, steps.length)} /{' '}
            {followingLive && activePlaybook?.total_steps ? activePlaybook.total_steps : steps.length}
          </div>
        </div>
        <div className="mt-1 text-xs text-gray-400">
          NORMATIVE CLAUSE: {selectedEntry.normative_clause}
        </div>
        <div className="mt-2 rounded border border-nominal/40 bg-black px-2.5 py-2 text-xs text-nominal">
          NEXT ACTION: {displayStepInstruction}
        </div>
      </div>

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

      {/* 4 Hard Clinical Safety Gates Strip (1, 2, 3, 4A, 4B) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 text-xs">
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
          <div className="mb-1.5 font-semibold text-gray-400">CAUSAL CHAIN SUMMARY</div>
          <ul className="space-y-1 text-gray-300">
            {causalChain.map((clause, idx) => (
              <li key={idx}>
                [{idx + 1}] {clause}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-line bg-black p-3 text-xs">
          <div className="mb-1.5 font-semibold text-gray-400">
            GATED COUNTERMEASURE ACTIONS ({resolvedActions.length})
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

      {/* Checklist Steps */}
      <ol className="space-y-1.5 text-xs">
        {steps.map((s, i) => {
          const isStepLocked =
            Boolean(s.requires_anticoagulant_unlock) &&
            (gates.anticoagulant_lock_active || thrombusConfirmed !== true);
          return (
            <li
              key={i}
              aria-current={i === activeStepIdx ? 'step' : undefined}
              className={`flex items-center gap-2 rounded border px-2.5 py-1.5 bg-black ${
                i === activeStepIdx
                  ? 'border-nominal text-white'
                  : i < activeStepIdx
                    ? 'border-ok/40 text-ok'
                    : 'border-line/50 text-gray-500'
              }`}
            >
              <span>{i < activeStepIdx ? '[x]' : i === activeStepIdx ? '[>]' : '[ ]'}</span>
              <span className="flex-1">{s.text}</span>
              {s.requires_anticoagulant_unlock && (
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                    isStepLocked ? 'border-critical text-critical' : 'border-ok text-ok'
                  }`}
                >
                  {isStepLocked ? 'GATE 1 LOCKED' : 'GATE 1 OPEN'}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* POCUS IJV Thrombus Verification Controls (always reachable for Gate 1) */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-black px-3 py-2 text-xs">
        <span className="text-gray-400">
          POCUS IJV THROMBUS VERIFICATION{isAnticoagulantStep ? ' (GATE 1)' : ''}:
        </span>
        {([
          ['UNSCANNED', null],
          ['ABSENT', false],
          ['CONFIRMED', true],
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

      {/* Stepper Controls (>= 48 px touch targets) */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          disabled={activeStepIdx === 0}
          onClick={() => {
            setFollowLiveEngine(false);
            setManualStepIdx(Math.max(0, activeStepIdx - 1));
          }}
          className="min-h-12 min-w-[44px] rounded border border-line bg-black px-4 py-2 text-gray-200 disabled:opacity-30"
        >
          BACK
        </button>
        <button
          type="button"
          disabled={stepLocked || activeStepIdx >= steps.length}
          onClick={() => {
            setFollowLiveEngine(false);
            setManualStepIdx(Math.min(steps.length, activeStepIdx + 1));
          }}
          className="min-h-12 min-w-[44px] rounded border border-nominal bg-black px-4 py-2 font-semibold text-nominal disabled:border-line disabled:text-gray-600"
        >
          {stepLocked
            ? 'LOCKED: POCUS THROMBUS CONFIRMATION REQUIRED'
            : activeStepIdx >= steps.length
              ? 'PLAYBOOK COMPLETE'
              : 'CONFIRM STEP'}
        </button>
        {stepLocked && (
          <button
            type="button"
            onClick={() => {
              setFollowLiveEngine(false);
              setManualStepIdx(Math.min(steps.length, activeStepIdx + 1));
            }}
            className="min-h-12 min-w-[44px] rounded border border-line bg-black px-4 py-2 text-gray-300"
          >
            SKIP LOCKED STEP
          </button>
        )}
      </div>
    </div>
  );
}
