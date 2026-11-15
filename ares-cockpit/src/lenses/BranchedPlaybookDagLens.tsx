// Branched Safety Gate DAG MedOps Playbook Runner Lens (`BranchedPlaybookDagLens`).
// Supports all 30 Aerospace 360 MedOps Playbooks (`#01-#30`) grouped across 4 domain tabs with
// `Priority 1-6` clinical triage precedence tags (`P1-P6`), non-blocking Autonomous Safety-Override
// Banners (`Gates 1..7`, `SPE`), and a visual Two-Branch Safety Gate DAG separating permitted
// `1500 ms` Press-and-Hold countermeasures from `.ares-inhibited-surface` locked actions.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CountermeasureAction,
  PlaybookId,
  TelemetryPacket,
} from '../types/telemetry';
import type { ScenarioState, WhatIf } from '../lib/scenario';
import {
  ALL_360_PLAYBOOK_LIST,
  CRYSTALLIZED_PLAYBOOK_CATALOG,
  getCatalogEntry,
  getPlaybookDomainForShortCode,
  PLAYBOOK_360_DOMAIN_TABS,
  type Playbook360DomainId,
} from '../lib/playbookCatalog';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announceAssertive, announcePolite } from '../stores/a11yAnnouncer';
import {
  PRESS_HOLD_DURATION_MS,
  partitionPlaybookActionsWithSafetyGates,
  type PartitionedSafetyDagResult,
} from '../workbench/safetyGatePartition';
import { getPlaybookPrecedence } from './lensMath';

export interface BranchedPlaybookDagLensProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  whatIf: WhatIf;
  thrombusConfirmed: boolean | null;
  onChangeWhatIf: (patch: Partial<WhatIf>) => void;
  onExecuteAction?: (playbookId: string, action: CountermeasureAction) => void;
  expandedView?: boolean;
}

export function resolvePlaybookSafetyDag(
  packet: TelemetryPacket,
  scenario: ScenarioState,
  whatIf: WhatIf,
  thrombusConfirmed: boolean | null,
  selectedPlaybookId: PlaybookId | null,
): {
  playbookId: PlaybookId;
  shortCode: string;
  title: string;
  normativeClause: string;
  causalChain: string[];
  dag: PartitionedSafetyDagResult;
} {
  const activeEntry =
    (selectedPlaybookId ? getCatalogEntry(selectedPlaybookId) : undefined) ??
    getCatalogEntry(packet.active_playbook?.playbook_id) ??
    (thrombusConfirmed === true
      ? CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS
      : CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_01_VENOUS_STASIS_LBNP);

  const candidateMap = new Map<string, CountermeasureAction>();
  for (const act of activeEntry.default_actions) {
    candidateMap.set(act.action_id, act);
  }
  if (
    packet.active_playbook?.playbook_id === activeEntry.playbook_id &&
    packet.active_playbook.actions
  ) {
    for (const act of packet.active_playbook.actions) {
      candidateMap.set(act.action_id, act);
    }
  }

  // Expose Gate 1 inhibited anticoagulant branch on Playbook #01/#02 when clot is unverified
  // so astronauts/CMOs inspect WHY systemic anticoagulants are locked rather than seeing a silent omit.
  if (
    (activeEntry.playbook_id === 'PLAYBOOK_01_VENOUS_STASIS_LBNP' ||
      activeEntry.playbook_id === 'PLAYBOOK_02_CONFIRMED_IJV_THROMBUS') &&
    thrombusConfirmed !== true
  ) {
    const anticoagAct =
      CRYSTALLIZED_PLAYBOOK_CATALOG.PLAYBOOK_02_CONFIRMED_IJV_THROMBUS.default_actions[0];
    if (anticoagAct) {
      candidateMap.set(anticoagAct.action_id, {
        ...anticoagAct,
        category: 'PHARMACOLOGICAL_ANTICOAGULANT',
      });
    }
  }

  // Scenario calculations belong only to the explicitly local packet.
  const preview = packet.is_local_simulation === true;
  const sbpDrop = preview ? Math.max(0, scenario.sbpBaseline - scenario.sbp) : null;
  const hrBpm = packet.biometrics.heart_rate_bpm;
  const gaiPct = packet.musculoskeletal?.gait_asymmetry_index_pct ?? packet.musculoskeletal?.gai_pct ?? null;
  const radDose = packet.biometrics.radiation_dose_rate_msv_d ?? null;

  const dag = partitionPlaybookActionsWithSafetyGates(
    Array.from(candidateMap.values()),
    packet.active_playbook?.safety_gates ?? {
      anticoagulant_lock_active: thrombusConfirmed !== true,
      lbnp_auto_vent_armed: true,
      eva_suit_damping_active: gaiPct !== null && gaiPct > 12,
      gate4_invasive_decompression_locked: true,
      gate4_eva_fitness_no_go: packet.safety_margins.mission_readiness_index == null || packet.safety_margins.mission_readiness_index < 45,
    },
    {
      pocusThrombusConfirmed: thrombusConfirmed,
      lbnpActive: (preview && whatIf.lbnp_mmhg < 0) || packet.hemodynamics?.lbnp_active === true,
      lbnpMmhg: preview ? whatIf.lbnp_mmhg : null,
      sbpDropMmhg: sbpDrop,
      hrBpm,
      gaiPct,
      radiationDoseMsvD: radDose,
      extendedGates: packet.aerospace_360?.extended_safety_gates ?? null,
    },
  );

  return {
    playbookId: activeEntry.playbook_id,
    shortCode: activeEntry.short_code,
    title: activeEntry.title,
    normativeClause: activeEntry.normative_clause,
    causalChain:
      packet.active_playbook?.causal_chain_summary ?? activeEntry.default_causal_chain,
    dag,
  };
}

export function PressAndHoldCountermeasureButton({
  action,
  completed,
  onConfirm,
}: {
  action: CountermeasureAction;
  completed: boolean;
  onConfirm: (action: CountermeasureAction) => void;
}) {
  const [holdPct, setHoldPct] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const startMsRef = useRef<number>(0);

  const cancelHold = (): void => {
    if (rafRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoldPct(0);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    cancelHold();
    const cancelHidden = () => { if (document.hidden) cancelHold(); };
    window.addEventListener('blur', cancelHold);
    document.addEventListener('visibilitychange', cancelHidden);
    return () => { cancelHold(); window.removeEventListener('blur', cancelHold); document.removeEventListener('visibilitychange', cancelHidden); };
  }, [action.action_id, action.label, action.category, action.delta_rho_per_hour, completed]);

  const beginHold = (): void => {
    if (completed) return;
    if (typeof window === 'undefined' || rafRef.current !== null) return;
    startMsRef.current = performance.now();
    const tick = (now: number): void => {
      const elapsed = now - startMsRef.current;
      const pct = Math.min(100, (elapsed / PRESS_HOLD_DURATION_MS) * 100);
      setHoldPct(pct);
      if (elapsed >= PRESS_HOLD_DURATION_MS) {
        rafRef.current = null;
        setHoldPct(0);
        onConfirm(action);
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
  };

  return (
    <div className="ares-inner-well relative space-y-2 border-l-2 border-l-emerald-400/75 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="font-mono text-[9px] tracking-wider text-emerald-300">
            PERMITTED BRANCH &bull; {action.category} &bull; +{(action.delta_rho_per_hour ?? 0).toFixed(2)} rho/h
          </div>
          <div className="font-sans text-xs font-medium leading-snug text-[var(--color-ink-display)]">
            {action.label}
          </div>
        </div>
      </div>

      <button
        type="button"
        onPointerDown={(e) => { if (e.button === 0) beginHold(); }}
        onBlur={cancelHold}
        disabled={completed}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            beginHold();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            cancelHold();
          }
        }}
        aria-label={
          completed
            ? `Local selection: ${action.label}`
            : `Press and hold 1.5 seconds to record local selection: ${action.label}`
        }
        className={`ares-touch-target ares-interactive relative w-full overflow-hidden rounded-lg border px-3 font-mono text-[10px] font-semibold tracking-wider ${
          completed
            ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100'
            : 'border-cyan-400/55 bg-black/80 text-cyan-200'
        }`}
      >
        {holdPct > 0 && !completed ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 bg-cyan-400/30"
            style={{ width: `${holdPct.toFixed(1)}%` }}
          />
        ) : null}
        <span className="relative z-10">
          {completed
            ? 'LOCAL SELECTION - NO ENGINE ACKNOWLEDGEMENT'
            : holdPct > 0
              ? `HOLDING SPRING DETENT... ${Math.round(holdPct)}%`
              : 'HOLD 1.5S TO RECORD LOCAL SELECTION'}
        </span>
      </button>
    </div>
  );
}

export function BranchedPlaybookDagLens({
  packet,
  scenario,
  whatIf,
  thrombusConfirmed,
  onChangeWhatIf,
  onExecuteAction,
  expandedView = false,
}: BranchedPlaybookDagLensProps) {
  const selectedPlaybookId = useWorkbenchStore((s) => s.selectedPlaybookId);
  const selectPlaybook = useWorkbenchStore((s) => s.selectPlaybook);
  const jumpToDiagnosticVerify = useWorkbenchStore((s) => s.jumpToDiagnosticVerify);
  const openDrawer = useWorkbenchStore((s) => s.openDrawer);
  const returnBreadcrumb = useWorkbenchStore((s) => s.returnBreadcrumb);

  const [domainFilter, setDomainFilter] = useState<'ALL' | Playbook360DomainId>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [completedIds, setCompletedIds] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => { setCompletedIds({}); }, [packet.astronaut_id, packet.source_record_id,
    packet.provenance_manifest.biometrics_source, packet.provenance_manifest.scenario_overlay_mode,
    resolved.playbookId]);

  // Auto-vent LBNP chamber to 0 mmHg when Gate 2 pre-syncope triggers (`dSBP > 15` or `HR > 115`)
  const prevPreSyncopeRef = useRef(false);
  useEffect(() => {
    if (resolved.dag.preSyncopeTriggered && !prevPreSyncopeRef.current) {
      prevPreSyncopeRef.current = true;
      if (whatIf.lbnp_mmhg < 0) {
        onChangeWhatIf({ lbnp_mmhg: 0 });
      }
      announceAssertive(
        'LBNP safety alert: scenario pressure reset requested; no physical device acknowledgement.',
      );
    } else if (!resolved.dag.preSyncopeTriggered) {
      prevPreSyncopeRef.current = false;
    }
  }, [onChangeWhatIf, resolved.dag.preSyncopeTriggered, whatIf.lbnp_mmhg]);

  // Restore scroll/focus if returning via PlaybookReturnBreadcrumb
  useEffect(() => {
    if (returnBreadcrumb && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = returnBreadcrumb.scrollOffsetPx;
    }
  }, [returnBreadcrumb]);

  const visiblePlaybooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_360_PLAYBOOK_LIST.filter((entry) => {
      if (domainFilter !== 'ALL' && getPlaybookDomainForShortCode(entry.short_code) !== domainFilter) {
        return false;
      }
      if (!q) return true;
      return (
        entry.short_code.toLowerCase().includes(q) ||
        entry.short_label.toLowerCase().includes(q) ||
        entry.title.toLowerCase().includes(q) ||
        entry.playbook_id.toLowerCase().includes(q)
      );
    });
  }, [domainFilter, searchQuery]);

  const activePrecedence = getPlaybookPrecedence(resolved.playbookId);

  const handleConfirmAction = (action: CountermeasureAction): void => {
    setCompletedIds((prev) => ({ ...prev, [action.action_id]: true }));
    if (action.action_id === 'ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG') {
      onChangeWhatIf({ lbnp_mmhg: 0 });
    }
    onExecuteAction?.(resolved.playbookId, action);
    announcePolite(`Selected locally: ${action.label} in ${resolved.shortCode}.`);
  };

  return (
    <div ref={scrollContainerRef} className="space-y-3">
      {/* Non-Blocking Top Autonomous Safety-Override Banner (`Gate 2` / `Gate 3` / `Gate 4B` / `SPE`) */}
      {resolved.dag.autonomousOverrides.map((ovr) => (
        <div
          key={ovr.id}
          role="status"
          className={`rounded-xl border p-2.5 font-mono text-[10px] ${
            ovr.severity === 'CRITICAL'
              ? 'border-rose-500/80 bg-rose-500/15 text-rose-100'
              : 'border-amber-400/70 bg-amber-500/15 text-amber-100'
          }`}
        >
          <div className="font-semibold tracking-wide">{ovr.headline}</div>
          <div className="mt-0.5 text-[9px] leading-relaxed opacity-90">{ovr.detail}</div>
        </div>
      ))}

      {/* Playbook Domain Filter + Search + Full-Sheet Drawer Trigger */}
      <div className="space-y-1.5 font-mono text-[9px]">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Aerospace 360 playbook domain filter">
            <button
              type="button"
              aria-pressed={domainFilter === 'ALL'}
              onClick={() => setDomainFilter('ALL')}
              className={`ares-interactive rounded border px-2 py-1 font-semibold ${
                domainFilter === 'ALL'
                  ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
              }`}
            >
              ALL 30
            </button>
            {PLAYBOOK_360_DOMAIN_TABS.map((grp) => {
              const selected = domainFilter === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  data-testid={`dag-domain-${grp.id}`}
                  aria-pressed={selected}
                  onClick={() => setDomainFilter(grp.id)}
                  className={`ares-interactive rounded border px-2 py-1 font-semibold ${
                    selected
                      ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                      : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                  }`}
                >
                  {grp.label} {grp.rangeLabel}
                </button>
              );
            })}
          </div>

          {!expandedView ? (
            <button
              id="btn-open-full-playbook-drawer"
              type="button"
              onClick={() => openDrawer('PLAYBOOK_SHEET', 'btn-open-full-playbook-drawer')}
              className="ares-interactive rounded border border-white/15 bg-black px-2 py-1 font-semibold text-cyan-200"
            >
              EXPAND SHEET -&gt;
            </button>
          ) : null}
        </div>

        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Playbooks #01-#30 (e.g. Sepsis, ARS, POCUS, LBNP)..."
          aria-label="Search MedOps Playbooks #01 through #30"
          className="w-full rounded border border-white/15 bg-black px-2.5 py-1.5 text-[10px] text-[var(--color-ink-display)] placeholder:text-[var(--color-ink-muted)] focus:border-cyan-400 focus:outline-none"
        />
      </div>

      {/* Playbook `#01-#30` Selector Strip with `P1-P6` Clinical Precedence Badges */}
      <div
        role="group"
        aria-label="Select MedOps Playbook #01 through #30"
        className="flex gap-1 overflow-x-auto pb-1 font-mono text-[10px]"
      >
        {visiblePlaybooks.map((entry) => {
          const active = entry.playbook_id === resolved.playbookId;
          const prec = getPlaybookPrecedence(entry.playbook_id);
          const pBadgeTone =
            prec.tier === 1
              ? 'text-rose-300'
              : prec.tier === 2
                ? 'text-amber-300'
                : 'text-cyan-300';
          return (
            <button
              key={entry.playbook_id}
              type="button"
              aria-pressed={active}
              onClick={() => selectPlaybook(entry.playbook_id)}
              className={`ares-interactive shrink-0 rounded-lg border px-2 py-1 font-semibold ${
                active
                  ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-100'
                  : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
              }`}
            >
              <span className={`mr-1 ${pBadgeTone}`}>{prec.badge}</span>
              {entry.short_code} {entry.short_label}
            </button>
          );
        })}
      </div>

      {/* Active Playbook Normative Header & Causal Chain */}
      <div className="ares-inner-well space-y-1.5 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[9px]">
          <span className="rounded border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-0.5 font-semibold text-cyan-200">
            {activePrecedence.priorityLabel}
          </span>

        </div>
        <div className="font-sans text-xs font-semibold text-[var(--color-ink-display)]">
          {resolved.title}
        </div>
        <details className="phase8-disclosure"><summary>Clinical rationale and technical references</summary><p>{resolved.normativeClause}</p><div className="flex flex-wrap gap-1 pt-0.5 font-mono text-xs text-[var(--color-ink-meta)]">
          {resolved.causalChain.map((node, idx) => (
            <span key={node} className="rounded bg-white/5 px-1.5 py-0.5">
              {idx > 0 ? '-> ' : ''}
              {node}
            </span>
          ))}
        </div></details>
      </div>

      {/* DAG Branch A: Permitted Executable Countermeasures (Solid Connector Rail) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-[10px] font-semibold tracking-wider text-emerald-300">
          <span>BRANCH A // PERMITTED COUNTERMEASURES ({resolved.dag.unlockedActions.length})</span>
          <span className="text-[9px] text-[var(--color-ink-meta)]">SOLID SAFETY RAIL</span>
        </div>

        {resolved.dag.unlockedActions.map((act) => (
          <PressAndHoldCountermeasureButton
            key={JSON.stringify([packet.astronaut_id, packet.source_record_id, packet.provenance_manifest, resolved.playbookId, packet.active_playbook?.safety_gates, act])}
            action={act}
            completed={Boolean(completedIds[act.action_id])}
            onConfirm={handleConfirmAction}
          />
        ))}
      </div>

      {/* DAG Branch B: Inhibited Hardware-Gated Actions (`.ares-inhibited-surface`, Dashed Rail) */}
      {resolved.dag.inhibitedActions.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between font-mono text-[10px] font-semibold tracking-wider text-amber-300">
            <span>
              BRANCH B // HARDWARE-INHIBITED SAFETY LOCKS ({resolved.dag.inhibitedActions.length})
            </span>
            <span className="text-[9px] text-amber-200/80">DASHED GATE RAIL</span>
          </div>

          {resolved.dag.inhibitedActions.map((inh) => {
            const btnId = `verify-gate-${inh.action.action_id}`;
            return (
              <div
                key={inh.action.action_id}
                className="ares-inhibited-surface space-y-2 rounded-xl border-l-2 border-dashed border-l-amber-400/80 p-3"
              >
                <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                  <span className="font-semibold text-amber-300">{inh.gateTitle}</span>
                  <span className="rounded border border-amber-400/60 bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-200">
                    INHIBITED
                  </span>
                </div>

                {/* Focusable disabled action pill (`aria-disabled="true"`) so screen-reader & keyboard users inspect rationale */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-disabled="true"
                  onClick={() =>
                    announcePolite(
                      `${inh.gateTitle}: action locked until diagnostic verification completes.`,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      announcePolite(
                        `${inh.gateTitle}: action locked until diagnostic verification completes.`,
                      );
                    }
                  }}
                  className="rounded-lg border border-dashed border-white/20 bg-black/60 px-2.5 py-2 font-sans text-xs text-[var(--color-ink-meta)]"
                >
                  {inh.action.label}
                </div>

                <p className="font-mono text-[10px] leading-relaxed text-[var(--color-ink-body)]">
                  {inh.rationale}
                </p>

                <button
                  id={btnId}
                  type="button"
                  onClick={() => {
                    jumpToDiagnosticVerify(inh.verifyTargetTab, inh.verifyRegion, {
                      originPhase: 'ACT',
                      playbookId: resolved.playbookId,
                      shortCode: resolved.shortCode,
                      activeStepIndex: 0,
                      scrollOffsetPx: scrollContainerRef.current?.scrollTop ?? 0,
                      focusedElementId: btnId,
                      createdAtMs: Date.now(),
                    });
                    announcePolite(
                      `Jumping to ${inh.verifyTargetTab} to verify ${inh.gateTitle}.`,
                    );
                  }}
                  className="ares-touch-target ares-interactive w-full rounded-lg border border-amber-400/70 bg-amber-500/15 px-3 font-mono text-[10px] font-semibold tracking-wider text-amber-200"
                >
                  {inh.verifyLabel}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
