// Chapter 5: Clinical Decision Support.
// Active Playbook hero card, 4-domain tab matrix of all 30 Aerospace 360
// Playbooks (#01-#30), Safety Gates 1..7 interlock status, protected
// confirmation button, and scientific attribution footer.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useRef, useState, useCallback } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useScrollyContext } from '../ScrollyContext';
import {
  PLAYBOOK_360_DOMAIN_TABS,
  PLAYBOOK_360_BY_SHORT_CODE,
  getCatalogEntry,
  type Playbook360DomainId,
  type Playbook360ShortCode,
} from '../../lib/playbookCatalog';
import type { ActivePlaybook, ExtendedSafetyGates, SafetyGatesState, TelemetryPacket } from '../../types/telemetry';
import { appendLocalAudit } from '../../lib/localAudit';
import type { AuditRecord } from '../../modules/audit-chain/AuditChainModal';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Safety Gate metadata — covers gates 1, 2, 3, 4A, 4B, 5A, 5B, 5C, 6, 7
// ---------------------------------------------------------------------------

interface GateMeta {
  id: string;
  label: string;
  description: string;
  getStatus: (gates: SafetyGatesState, ext?: ExtendedSafetyGates | null) => 'locked' | 'unlocked' | 'nominal' | 'active' | 'unknown';
}

const SAFETY_GATES: readonly GateMeta[] = [
  {
    id: 'gate1',
    label: 'Gate 1: Anticoagulant Lock',
    description: 'Systemic anticoagulation blocked until POCUS confirms intraluminal IJV thrombus.',
    getStatus: (g) => g.anticoagulant_lock_active ? 'locked' : 'unlocked',
  },
  {
    id: 'gate2',
    label: 'Gate 2: LBNP Auto-Vent',
    description: 'Emergency auto-vent to 0 mmHg armed on pre-syncopal SBP drop or sensor blackout.',
    getStatus: (g) => g.lbnp_auto_vent_armed ? 'active' : 'nominal',
  },
  {
    id: 'gate3',
    label: 'Gate 3: EVA Suit Damping',
    description: 'Martian EVA suit ankle damping +25% when GAI exceeds 12.0% (0.38 g fall risk).',
    getStatus: (g) => g.eva_suit_damping_active ? 'active' : 'nominal',
  },
  {
    id: 'gate4a',
    label: 'Gate 4A: Thoracic Decompression',
    description: 'Invasive needle decompression locked until eFAST/POCUS barcode sign confirmed.',
    getStatus: (g) => g.gate4_invasive_decompression_locked === false ? 'unlocked' : 'locked',
  },
  {
    id: 'gate4b',
    label: 'Gate 4B: EVA Fitness No-Go',
    description: 'Blocks EVA airlock egress when GAI >12%, cognitive fatigue >=0.75, or Shock Index >=0.85.',
    getStatus: (g) => g.gate4_eva_fitness_no_go ? 'locked' : 'nominal',
  },
  {
    id: 'gate5a',
    label: 'Gate 5A: NSAID Renal Lock',
    description: 'NSAIDs locked when nephrolithiasis risk is elevated or renal function degraded.',
    getStatus: (_, ext) => ext?.gate5_nsaid_renal_bleeding_locked ? 'locked' : 'nominal',
  },
  {
    id: 'gate5b',
    label: 'Gate 5B: Allergy / QTc Lock',
    description: 'Drug class locked by allergy annotation or QTc prolongation risk.',
    getStatus: (_, ext) => ext?.gate5_allergy_or_qtc_locked ? 'locked' : 'nominal',
  },
  {
    id: 'gate5c',
    label: 'Gate 5C: Formulary Substitution',
    description: 'Automatic formulary alternative activated when primary drug locked.',
    getStatus: (_, ext) => ext?.gate5_formulary_substitution_active ? 'active' : 'nominal',
  },
  {
    id: 'gate6',
    label: 'Gate 6: Radiation Invasive Lock',
    description: 'Invasive procedures locked during neutropenic window post-ARS event.',
    getStatus: (_, ext) => ext?.gate6_radiation_neutropenic_invasive_locked ? 'locked' : 'nominal',
  },
  {
    id: 'gate7',
    label: 'Gate 7: BMED Delirium Guard',
    description: 'Behavioral health delirium guard active; restraint protocol authorized by BMED.',
    getStatus: (_, ext) => ext?.gate7_bmed_delirium_or_restraint_guard_active ? 'active' : 'nominal',
  },
] as const;

// ---------------------------------------------------------------------------
// Gate status badge
// ---------------------------------------------------------------------------

function GateBadge({ status }: { status: 'locked' | 'unlocked' | 'nominal' | 'active' | 'unknown' }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    locked: { label: 'LOCKED', cls: 'border-[var(--color-status-critical)]/50 bg-[var(--color-status-critical)]/10 text-[var(--color-status-critical)]' },
    unlocked: { label: 'UNLOCKED', cls: 'border-[var(--color-status-nominal)]/50 bg-[var(--color-status-nominal)]/10 text-[var(--color-status-nominal)]' },
    nominal: { label: 'NOMINAL', cls: 'border-[var(--color-border)] text-[var(--color-ink-muted)]' },
    active: { label: 'ACTIVE', cls: 'border-[var(--color-status-caution)]/50 bg-[var(--color-status-caution)]/10 text-[var(--color-status-caution)]' },
    unknown: { label: 'UNKNOWN', cls: 'border-[var(--color-border)] text-[var(--color-ink-muted)]' },
  };
  const { label, cls } = cfg[status] ?? cfg.unknown;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Chapter5DecisionProps {
  packet: TelemetryPacket;
  auditRecords: AuditRecord[];
  onAuditAppend: (records: AuditRecord[]) => void;
}

// ---------------------------------------------------------------------------
// Chapter5Decision
// ---------------------------------------------------------------------------

export function Chapter5Decision({
  packet,
  auditRecords,
  onAuditAppend,
}: Chapter5DecisionProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);
  const [activeDomainId, setActiveDomainId] = useState<Playbook360DomainId>('CARDIORESPIRATORY');
  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveChapter(5),
        onEnterBack: () => setActiveChapter(5),
      });
    },
    { scope: sectionRef, dependencies: [setActiveChapter] },
  );

  // Physical confirmation button: hold 1500 ms to record.
  const startHold = useCallback(() => {
    let progress = 0;
    holdIntervalRef.current = setInterval(() => {
      progress += 100 / 15; // 15 steps over 1500ms
      setHoldProgress(Math.min(100, progress));
      if (progress >= 100) {
        clearInterval(holdIntervalRef.current!);
        holdIntervalRef.current = null;
        // Append audit record (async, fire-and-forget update).
        const playbookLabel = packet.active_playbook?.title ?? 'UNKNOWN_PLAYBOOK';
        appendLocalAudit(auditRecords, `LOCAL_SELECTION_RECORDED: ${playbookLabel}`).then((rec) => {
          onAuditAppend([...auditRecords, rec]);
        });
        setTimeout(() => setHoldProgress(0), 1200);
      }
    }, 100);
  }, [auditRecords, onAuditAppend, packet.active_playbook?.title]);

  const cancelHold = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  }, []);

  const activePlaybook = packet.active_playbook;
  const safetyGates = activePlaybook?.safety_gates;
  const extGates = packet.aerospace_360?.extended_safety_gates;

  const activeDomainTab = PLAYBOOK_360_DOMAIN_TABS.find((t) => t.id === activeDomainId)!;

  return (
    <section
      ref={sectionRef}
      data-chapter="5"
      className="min-h-screen px-6 py-20 md:px-14"
      aria-labelledby="ch5-heading"
    >
      {/* Header */}
      <div className="mb-10 max-w-xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--color-ink-muted)] mb-2">
          Chapter 05 // Clinical Decision Support
        </p>
        <h2
          id="ch5-heading"
          className="font-sans text-3xl font-semibold tracking-tight text-[var(--color-ink-display)]"
        >
          Aerospace 360 Playbooks
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-[var(--color-ink-meta)] max-w-md">
          All 30 evidence-based countermeasure protocols with real-time
          Safety Gate interlock status. Requires physical confirmation to
          record a local selection.
        </p>
      </div>

      {/* Active Playbook Hero Card */}
      {activePlaybook && (
        <div className="mb-8 rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-accent)] mb-1">
                Active Protocol
              </p>
              <h3 className="font-sans text-lg font-semibold text-[var(--color-ink-display)] leading-snug max-w-xl">
                {activePlaybook.title}
              </h3>
              <p className="font-mono text-[10px] text-[var(--color-ink-muted)] mt-1">
                Step {activePlaybook.current_step} of {activePlaybook.total_steps}
              </p>
            </div>
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-l2)] px-3 py-2 min-w-32">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">Progress</p>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--color-border)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{ width: `${Math.round(((activePlaybook.current_step ?? 1) / Math.max(1, activePlaybook.total_steps ?? 1)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
          {activePlaybook.step_instruction && (
            <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-3 py-2">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] mb-1">Current Instruction</p>
              <p className="font-sans text-sm text-[var(--color-ink-body)]">{activePlaybook.step_instruction}</p>
            </div>
          )}
        </div>
      )}

      {/* Domain tabs */}
      <div className="mb-4">
        <div
          role="tablist"
          aria-label="Playbook domains"
          className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-3"
        >
          {PLAYBOOK_360_DOMAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeDomainId === tab.id}
              onClick={() => setActiveDomainId(tab.id)}
              className={`
                rounded-t border-b-2 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest
                transition-colors duration-150
                ${activeDomainId === tab.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-ink-muted)] hover:border-[var(--color-border-active)] hover:text-[var(--color-ink-meta)]'}
              `}
            >
              {tab.label}
              <span className="ml-1 opacity-60">{tab.rangeLabel}</span>
            </button>
          ))}
        </div>

        {/* Playbook cards for active domain */}
        <div
          role="tabpanel"
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {activeDomainTab.shortCodes.map((code) => {
            const entry = PLAYBOOK_360_BY_SHORT_CODE[code as Playbook360ShortCode];
            const isActive = entry && packet.active_playbook?.playbook_id === entry.playbook_id;
            return (
              <div
                key={code}
                className={`
                  rounded border p-3 transition-colors
                  ${isActive
                    ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-l1)] hover:border-[var(--color-border-active)]'}
                `}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[9px] font-bold text-[var(--color-accent)]">{code}</span>
                  {entry && (
                    <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-muted)]">
                      {entry.short_label}
                    </span>
                  )}
                </div>
                <p className="font-sans text-[11px] leading-snug text-[var(--color-ink-body)] line-clamp-3">
                  {entry?.title ?? `Playbook ${code} — not loaded`}
                </p>
                {entry?.normative_clause && (
                  <p className="mt-1.5 font-mono text-[8px] text-[var(--color-ink-muted)] truncate">
                    {entry.normative_clause}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Safety Gates matrix */}
      <div className="mt-8">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)] mb-3">
          Safety Gate Interlock Matrix
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SAFETY_GATES.map((gate) => {
            const status = safetyGates
              ? gate.getStatus(safetyGates, extGates)
              : 'unknown';
            return (
              <div
                key={gate.id}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-3"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-mono text-[9px] font-semibold text-[var(--color-ink-body)] leading-tight">
                    {gate.label}
                  </span>
                  <GateBadge status={status} />
                </div>
                <p className="font-sans text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
                  {gate.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Physical confirmation button */}
      <div className="mt-8 flex flex-col items-start gap-3">
        <div
          className="relative overflow-hidden rounded border border-[var(--color-border-active)] bg-[var(--color-surface-l1)] select-none cursor-pointer"
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          aria-label="Hold 1.5 seconds to record local selection"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') startHold(); }}
          onKeyUp={cancelHold}
        >
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-[var(--color-accent)]/20 transition-all duration-100"
            style={{ width: `${holdProgress}%` }}
          />
          <div className="relative px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-display)]">
              {holdProgress >= 100
                ? 'Selection Recorded'
                : holdProgress > 0
                ? `Recording... ${Math.round(holdProgress)}%`
                : 'HOLD 1.5S TO RECORD LOCAL SELECTION'}
            </p>
            <p className="font-mono text-[9px] text-[var(--color-ink-muted)] mt-0.5">
              Records crew officer attestation to SHA-256 audit chain
            </p>
          </div>
        </div>
        {holdProgress >= 100 && (
          <p className="font-mono text-[10px] text-[var(--color-status-nominal)] uppercase tracking-widest">
            Audit record appended — verify in Operator Tools
          </p>
        )}
      </div>

      {/* Scientific attribution footer */}
      <footer className="mt-16 border-t border-[var(--color-border)] pt-8">
        <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] mb-3">
          Scientific Attribution
        </p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {[
            'NASA-STD-3001 Vol 1 & 2 (Human Integration Design Handbook)',
            'OCHMO MTB-007: Venous Thromboembolism Screening Protocol',
            'Marshall et al. 2021: IJV thrombosis in long-duration spaceflight',
            'Paloski et al. 2008: Balance and gait adaptation in returning astronauts',
            'Vico & Harridge 2020: Bone adaptation to spaceflight',
            'Jain et al. 2023: Renal stone risk during ISS missions',
            'Strangman et al. 2014: Cognitive performance assessment (PSYCH-101)',
            'Drake et al. 2005: Reference Mission Architecture (DRM 5.0)',
            'Andreassen 2023: Female musculoskeletal anatomy atlas (SimTK)',
            'Z-Anatomy 2023: Male open-source anatomical reference',
          ].map((ref) => (
            <p key={ref} className="font-sans text-[11px] text-[var(--color-ink-muted)] leading-relaxed py-0.5 border-b border-[var(--color-border)] last:border-b-0">
              {ref}
            </p>
          ))}
        </div>
        <p className="mt-4 font-mono text-[9px] text-[var(--color-ink-muted)]">
          ARES-Health is an autonomous decision support system. All clinical recommendations
          require OCHMO and crew medical officer review. SIMULATED/COMPUTED data must not
          be used for operative medical decisions without authoritative telemetry confirmation.
        </p>
      </footer>
    </section>
  );
}
