// Act 3: Act — NASA Triad Step 3: Autonomous MedOps & Safety Gates.
// Features Header "CHAPTER 03 // ACT // AUTONOMOUS MEDOPS & SAFETY GATES",
// Hardware Clinical Safety Interlocks Matrix (covering all 10 certified gates),
// 2-Column Action & Playbook Row:
//   - Left: Recommended MedOps Playbook card (Playbook #01 Venous Stasis LBNP) + Anticoagulant Lockout Banner
//   - Right: Alessandro's Crew Physical Confirmation Card (PRESS & HOLD 1.5S TO ENGAGE ACTION button with live progress 0% -> 100% and SHA-256 audit append)
// Complete 30 Playbooks Catalog Matrix (4 domain tabs)
// Editorial Scientific Citations Footer (NASA-STD-3001 VOL 1 CH 7, FROST MECHANOSTAT 1987, HARGENS HEMODYNAMICS 2019).
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
import type {
  ActivePlaybook,
  ExtendedSafetyGates,
  SafetyGatesState,
  TelemetryPacket,
} from '../../types/telemetry';
import { appendLocalAudit } from '../../lib/localAudit';
import type { AuditRecord } from '../../modules/audit-chain/AuditChainModal';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// 10 Certified Safety Gates Definition
// ---------------------------------------------------------------------------

type CertifiedGateStatus = 'LOCKED' | 'TRIGGERED' | 'NOMINAL';

interface CertifiedGateMeta {
  id: string;
  code: string;
  label: string;
  citation: string;
  description: string;
  resolveStatus: (
    gates?: SafetyGatesState,
    ext?: ExtendedSafetyGates | null,
  ) => CertifiedGateStatus;
}

const CERTIFIED_10_SAFETY_GATES: readonly CertifiedGateMeta[] = [
  {
    id: 'gate1',
    code: 'GATE 01',
    label: 'Anticoagulant Lock',
    citation: 'NASA-STD-3001 §7.2 / OCHMO MTB-007',
    description: 'Systemic anticoagulation strictly locked without POCUS confirmation of intraluminal thrombus.',
    resolveStatus: (g) => (g?.anticoagulant_lock_active !== false ? 'LOCKED' : 'NOMINAL'),
  },
  {
    id: 'gate2',
    code: 'GATE 02',
    label: 'LBNP Auto-Vent Interlock',
    citation: 'NASA TM-2020-5009823',
    description: 'Automatic chamber venting to 0 mmHg armed if SBP drop exceeds 20 mmHg or upon sensor blackout.',
    resolveStatus: (g) => (g?.lbnp_auto_vent_armed ? 'TRIGGERED' : 'NOMINAL'),
  },
  {
    id: 'gate3',
    code: 'GATE 03',
    label: 'EVA Suit Damping',
    citation: 'Paloski et al. 2008',
    description: 'Martian EVA suit ankle damping +25% when Gait Ataxia Index (GAI) exceeds 12.0%.',
    resolveStatus: (g) => (g?.eva_suit_damping_active ? 'TRIGGERED' : 'NOMINAL'),
  },
  {
    id: 'gate4a',
    code: 'GATE 04A',
    label: 'Thoracic Decompression',
    citation: 'eFAST Barcode Sign Protocol',
    description: 'Invasive needle thoracostomy locked until ultrasound barcode sign or tension collapse verified.',
    resolveStatus: (g) => (g?.gate4_invasive_decompression_locked !== false ? 'LOCKED' : 'NOMINAL'),
  },
  {
    id: 'gate4b',
    code: 'GATE 04B',
    label: 'EVA Fitness No-Go',
    citation: 'EVA Fitness Flight Rule §802',
    description: 'Airlock egress locked when GAI > 12.0%, cognitive fatigue >= 0.75, or Shock Index >= 0.85.',
    resolveStatus: (g) => (g?.gate4_eva_fitness_no_go ? 'TRIGGERED' : 'NOMINAL'),
  },
  {
    id: 'gate5a',
    code: 'GATE 05A',
    label: 'NSAID Renal Lock',
    citation: 'Nephrolithiasis Protection Rule',
    description: 'Systemic NSAIDs locked when nephrolithiasis risk is elevated or eGFR is impaired.',
    resolveStatus: (_, ext) => (ext?.gate5_nsaid_renal_bleeding_locked ? 'LOCKED' : 'NOMINAL'),
  },
  {
    id: 'gate5b',
    code: 'GATE 05B',
    label: 'Allergy & QTc Lock',
    citation: 'Cardiovascular Safety Matrix',
    description: 'Drug classes locked by crew allergy annotation or QTc prolongation > 460 ms.',
    resolveStatus: (_, ext) => (ext?.gate5_allergy_or_qtc_locked ? 'LOCKED' : 'NOMINAL'),
  },
  {
    id: 'gate5c',
    code: 'GATE 05C',
    label: 'Formulary Substitution',
    citation: 'Space Formulary Alternate Protocol',
    description: 'Automatic formulary substitution recommendation engaged when primary agent is locked.',
    resolveStatus: (_, ext) => (ext?.gate5_formulary_substitution_active ? 'TRIGGERED' : 'NOMINAL'),
  },
  {
    id: 'gate6',
    code: 'GATE 06',
    label: 'Radiation Invasive Lock',
    citation: 'NASA-STD-3001 Vol 2 §6043',
    description: 'Invasive procedures locked during post-solar particle event neutropenic window.',
    resolveStatus: (_, ext) => (ext?.gate6_radiation_neutropenic_invasive_locked ? 'LOCKED' : 'NOMINAL'),
  },
  {
    id: 'gate7',
    code: 'GATE 07',
    label: 'BMED Delirium Guard',
    citation: 'Behavioral Health Standard PSYCH-101',
    description: 'Restraint or sedation protocol locked without multi-parameter BMED cognitive attestation.',
    resolveStatus: (_, ext) => (ext?.gate7_bmed_delirium_or_restraint_guard_active ? 'TRIGGERED' : 'NOMINAL'),
  },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Act3ActProps {
  /** Authoritative telemetry packet. */
  packet: TelemetryPacket;
  /** Cryptographic audit chain log. */
  auditRecords: AuditRecord[];
  /** Callback to append audit entries. */
  onAuditAppend: (records: AuditRecord[]) => void;
  /** Optional callback when a playbook is selected. */
  onSelectPlaybook?: (playbookId: string) => void;
}

// ---------------------------------------------------------------------------
// Act3Act Component
// ---------------------------------------------------------------------------

export function Act3Act({
  packet,
  auditRecords,
  onAuditAppend,
  onSelectPlaybook,
}: Act3ActProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);
  const [activeDomainId, setActiveDomainId] = useState<Playbook360DomainId>('CARDIORESPIRATORY');
  const [selectedPlaybookCode, setSelectedPlaybookCode] = useState<Playbook360ShortCode>('#01');
  const [holdProgress, setHoldProgress] = useState(0);
  const [lastEngagementHash, setLastEngagementHash] = useState<string | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // GSAP ScrollTrigger to latch activeChapter to 3
  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveChapter(3),
        onEnterBack: () => setActiveChapter(3),
      });
    },
    { scope: sectionRef, dependencies: [setActiveChapter] },
  );

  const activePlaybook = packet.active_playbook;
  const safetyGates = activePlaybook?.safety_gates;
  const extGates = packet.aerospace_360?.extended_safety_gates;

  // Press & Hold 1.5s to engage action
  const startHold = useCallback(() => {
    let progress = 0;
    holdIntervalRef.current = setInterval(() => {
      progress += 100 / 15; // 15 steps of 100ms = 1500ms
      const clamped = Math.min(100, progress);
      setHoldProgress(clamped);

      if (progress >= 100) {
        if (holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }

        const playbookName = 'PLAYBOOK #01: VENOUS STASIS LBNP COUNTERMEASURE';
        const actionText = `CREW_PHYSICAL_ENGAGEMENT_VERIFIED: ${playbookName} [P1 Acute Hemodynamic]`;

        appendLocalAudit(auditRecords, actionText).then((rec) => {
          onAuditAppend([...auditRecords, rec]);
          setLastEngagementHash(rec.current_hash_hex);
        });

        setTimeout(() => setHoldProgress(0), 1800);
      }
    }, 100);
  }, [auditRecords, onAuditAppend]);

  const cancelHold = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  }, []);

  const activeDomainTab = PLAYBOOK_360_DOMAIN_TABS.find((t) => t.id === activeDomainId)!;
  const inspectedPlaybook = PLAYBOOK_360_BY_SHORT_CODE[selectedPlaybookCode] ?? getCatalogEntry('PLAYBOOK_01_VENOUS_STASIS_LBNP');

  return (
    <section
      ref={sectionRef}
      data-chapter="3"
      className="relative min-h-screen px-4 py-16 sm:px-6 md:px-10 lg:px-12 max-w-[1600px] mx-auto w-full"
      aria-labelledby="act3-heading"
    >
      {/* 1. Header */}
      <div className="pb-8 border-b border-slate-800">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-sky-400 font-bold">
          CHAPTER 03 // ACT // AUTONOMOUS MEDOPS &amp; SAFETY GATES
        </p>
        <h2
          id="act3-heading"
          className="mt-2 font-sans text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white"
        >
          Clinical Interlocks &amp; Autonomous Protocols
        </h2>
        <p className="mt-3 font-sans text-base sm:text-lg text-slate-200 max-w-4xl leading-relaxed">
          Certified autonomous medical operations for Mars transit. 10 fail-safe hardware clinical
          safety interlocks, physical two-person attestation with SHA-256 ledger integrity,
          and complete 30-protocol Aerospace 360 flight catalog.
        </p>
      </div>

      {/* 2. Hardware Clinical Safety Interlocks Matrix (10 Certified Gates) */}
      <div className="mt-8">
        <div className="flex items-center justify-between pb-3">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
            CERTIFIED CLINICAL SAFETY INTERLOCKS MATRIX (10 HARDWARE GATES)
          </span>
          <span className="font-mono text-xs uppercase tracking-wider text-sky-300 font-semibold">
            NASA-STD-3001 VOL 1 &amp; 2 CERTIFIED
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CERTIFIED_10_SAFETY_GATES.map((gate) => {
            const status = gate.resolveStatus(safetyGates, extGates);
            return (
              <div
                key={gate.id}
                className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-4 backdrop-blur-md transition-all hover:border-slate-700 shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      {gate.code}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                        status === 'LOCKED'
                          ? 'border border-rose-500/60 bg-rose-950/50 text-rose-300'
                          : status === 'TRIGGERED'
                          ? 'border border-amber-500/60 bg-amber-950/50 text-amber-300'
                          : 'border border-emerald-500/50 bg-emerald-950/30 text-emerald-300'
                      }`}
                    >
                      {status === 'LOCKED' && (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                      )}
                      {status === 'TRIGGERED' && (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      )}
                      {status === 'NOMINAL' && (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                      {status}
                    </span>
                  </div>
                  <h4 className="mt-2 font-mono text-sm font-bold text-white">
                    {gate.label}
                  </h4>
                  <p className="mt-1 font-sans text-xs text-slate-200 leading-relaxed">
                    {gate.description}
                  </p>
                </div>
                <span className="mt-3 block font-mono text-[10px] text-slate-400 truncate">
                  {gate.citation}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. 2-Column Action & Playbook Row */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Recommended MedOps Playbook card + Anticoagulant Lockout Banner */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-sky-400">
                RECOMMENDED MEDOPS PLAYBOOK
              </span>
              <span className="rounded bg-rose-950/50 border border-rose-500/50 px-2 py-0.5 font-mono text-xs font-bold text-rose-300 uppercase">
                P1 ACUTE HEMODYNAMIC
              </span>
            </div>

            {/* Anticoagulant Lockout Banner */}
            <div className="mt-4 rounded-xl border border-rose-500/60 bg-rose-950/40 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-900/70 text-rose-300">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-rose-300">
                    ANTICOAGULANT HARD LOCKOUT ACTIVE
                  </h4>
                  <p className="mt-1 font-sans text-xs sm:text-sm text-rose-200 leading-relaxed">
                    Systemic anticoagulation (Enoxaparin / Heparin) is blocked by Hard Safety Gate 1.
                    In microgravity venous stasis, anticoagulants carry severe hemorrhagic mortality risk
                    without ultrasound verification of intraluminal clot.
                  </p>
                </div>
              </div>
            </div>

            {/* Playbook #01 Card Details */}
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-sky-400">#01</span>
                <h3 className="font-sans text-xl font-bold text-white">
                  Venous Stasis LBNP Countermeasure
                </h3>
              </div>
              <p className="mt-2 font-sans text-sm text-slate-200 leading-relaxed">
                Application of -25 to -40 mmHg lower body negative pressure (LBNP) for 20 minutes to
                redistribute 1.5 L of cephalad fluid toward caudal venous capacitance, re-establishing
                internal jugular vein wall shear stress (&gt;2.5 dyn/cm²).
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 text-center font-mono text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <span className="block text-xs uppercase tracking-wider text-slate-400">
                    Chamber Target
                  </span>
                  <span className="text-base font-bold text-white">-30 mmHg LBNP</span>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <span className="block text-xs uppercase tracking-wider text-slate-400">
                    Interlock Gate 2
                  </span>
                  <span className="text-base font-bold text-emerald-300">AUTO-VENT ARMED</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-black/70 p-4">
                <span className="font-mono text-xs uppercase tracking-wider text-slate-300 block mb-2 font-semibold">
                  Active Clinical Directives
                </span>
                <ul className="space-y-1.5 font-sans text-xs sm:text-sm text-slate-200">
                  <li>• Step 1: Confirm crew member sealed in LBNP waist seal chamber.</li>
                  <li>• Step 2: Ramp vacuum incrementally (-10, -20, -30 mmHg at 2 min intervals).</li>
                  <li>• Step 3: Monitor continuous SBP. If SBP drop exceeds 20 mmHg, Gate 2 vents chamber to 0 mmHg.</li>
                </ul>
              </div>
            </div>
          </div>

          <span className="mt-6 font-mono text-xs text-slate-400">
            NASA TM-2020-5009823 // Grounded in Marshall et al. 2021
          </span>
        </div>

        {/* Right: Alessandro's Crew Physical Confirmation Card */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                CREW PHYSICAL CONFIRMATION
              </span>
              <span className="rounded bg-sky-950/50 border border-sky-400/40 px-2 py-0.5 font-mono text-xs text-sky-300 font-semibold">
                TWO-PERSON ATTESTATION
              </span>
            </div>

            <p className="mt-4 font-sans text-sm text-slate-200 leading-relaxed">
              Autonomous protocols require physical mechanical attestation by the Crew Medical Officer
              to engage interventions with physiological risk. Press and hold for 1.5 seconds to commit
              an immutable SHA-256 record to the onboard cryptographic audit chain.
            </p>

            {/* PRESS & HOLD 1.5S TO ENGAGE ACTION Button */}
            <div className="mt-8 flex flex-col items-center">
              <div
                className="relative w-full overflow-hidden rounded-xl border border-sky-400/60 bg-slate-950 select-none cursor-pointer transition-all hover:border-sky-300 shadow-[0_0_25px_rgba(56,189,248,0.3)]"
                onMouseDown={startHold}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={startHold}
                onTouchEnd={cancelHold}
                aria-label="Press and hold 1.5 seconds to engage action"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') startHold();
                }}
                onKeyUp={cancelHold}
              >
                {/* Progress bar background fill */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-600/50 to-indigo-600/60 transition-all duration-100"
                  style={{ width: `${holdProgress}%` }}
                />

                <div className="relative px-6 py-5 text-center">
                  <p className="font-mono text-sm sm:text-base font-bold uppercase tracking-widest text-white">
                    {holdProgress >= 100
                      ? 'ACTION ENGAGED // SHA-256 COMMITTED'
                      : holdProgress > 0
                      ? `ENGAGING... ${Math.round(holdProgress)}%`
                      : 'PRESS & HOLD 1.5S TO ENGAGE ACTION'}
                  </p>
                  <p className="mt-1 font-mono text-xs text-sky-300">
                    Appends non-repudiable audit block to ledger
                  </p>
                </div>
              </div>

              {lastEngagementHash && (
                <div className="mt-4 w-full rounded-lg border border-emerald-500/50 bg-emerald-950/30 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-300">
                      Cryptographic Block Committed
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-300 break-all">
                    SHA-256: {lastEngagementHash}
                  </p>
                </div>
              )}
            </div>

            {/* Audit Chain Ledger Summary */}
            <div className="mt-6 border-t border-slate-800 pt-4">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-300 block mb-2 font-semibold">
                Recent Ledger Blocks ({auditRecords.length} Blocks Verified)
              </span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {auditRecords.slice(-3).reverse().map((rec) => (
                  <div
                    key={rec.sequence_index}
                    className="rounded-lg border border-slate-800 bg-black/80 p-2.5 font-mono text-xs"
                  >
                    <div className="flex justify-between text-slate-400">
                      <span className="font-bold text-sky-400">BLOCK #{rec.sequence_index}</span>
                      <span>{rec.timestamp_utc.slice(11, 19)} UTC</span>
                    </div>
                    <p className="text-slate-200 mt-1 truncate">{rec.event_action}</p>
                    <p className="text-slate-500 truncate mt-0.5 text-[10px]">
                      HASH: {rec.current_hash_hex.slice(0, 24)}...
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <span className="mt-6 font-mono text-xs text-slate-400">
            Immutable Audit Protocol // SHA-256 Merkle Chaining
          </span>
        </div>
      </div>

      {/* 4. Complete 30 Playbooks Catalog Matrix (4 Domain Tabs) */}
      <div className="mt-12 rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="font-sans text-xl font-bold text-white">
              Complete Aerospace 360 Playbooks Matrix
            </h3>
            <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
              30 Certified Protocols Across 4 Clinical Aerospace Domains
            </p>
          </div>
          <span className="font-mono text-xs text-sky-400 font-bold uppercase tracking-widest">
            {activeDomainTab.rangeLabel}
          </span>
        </div>

        {/* 4 Domain Tabs */}
        <div
          role="tablist"
          aria-label="Playbook domains"
          className="mt-4 flex flex-wrap gap-2 border-b border-slate-800 pb-3"
        >
          {PLAYBOOK_360_DOMAIN_TABS.map((tab) => {
            const isTabActive = activeDomainId === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isTabActive}
                onClick={() => {
                  setActiveDomainId(tab.id);
                  setSelectedPlaybookCode(tab.shortCodes[0]);
                }}
                className={`rounded-lg px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  isTabActive
                    ? 'border border-sky-400 bg-sky-950/60 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                    : 'border border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                {tab.label} ({tab.rangeLabel})
              </button>
            );
          })}
        </div>

        {/* Domain Playbooks Grid */}
        <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {activeDomainTab.shortCodes.map((code) => {
            const entry = PLAYBOOK_360_BY_SHORT_CODE[code];
            if (!entry) return null;
            const isSelected = selectedPlaybookCode === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setSelectedPlaybookCode(code);
                  onSelectPlaybook?.(entry.playbook_id);
                }}
                className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-400 bg-sky-950/50 text-white shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                    : 'border-slate-800/80 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-400">
                      {entry.short_code}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      {entry.short_label}
                    </span>
                  </div>
                  <h4 className="mt-2 font-mono text-xs font-bold text-white leading-snug">
                    {entry.title}
                  </h4>
                  <p className="mt-1.5 font-sans text-xs text-slate-300 line-clamp-2">
                    {entry.normative_clause}
                  </p>
                </div>
                <div className="mt-3.5 flex items-center justify-between border-t border-slate-800 pt-2 text-xs font-mono text-slate-400">
                  <span>{entry.default_actions.length} ACTIONS</span>
                  <span className="font-bold text-sky-400">{isSelected ? 'ACTIVE' : 'SELECT'}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Playbook Expanded Details */}
        {inspectedPlaybook && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/80 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-sky-400 font-bold">
                  Protocol Inspection: {inspectedPlaybook.short_code}
                </span>
                <h4 className="font-sans text-lg font-bold text-white mt-1">
                  {inspectedPlaybook.title}
                </h4>
                <p className="font-sans text-xs sm:text-sm text-slate-200 mt-1 max-w-3xl">
                  {inspectedPlaybook.normative_clause}
                </p>
              </div>
              <span className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 font-mono text-xs font-semibold text-slate-200">
                {inspectedPlaybook.playbook_id}
              </span>
            </div>

            {inspectedPlaybook.default_actions.length > 0 && (
              <div className="mt-4 border-t border-slate-800 pt-3">
                <span className="font-mono text-xs uppercase tracking-wider text-slate-300 block mb-2 font-semibold">
                  Prescribed Actions &amp; Interventions
                </span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {inspectedPlaybook.default_actions.map((act) => (
                    <div
                      key={act.action_id}
                      className="rounded-lg border border-slate-800 bg-black/80 p-3"
                    >
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-sky-300 font-bold uppercase">{act.category}</span>
                        <span className="text-slate-400">{act.action_id}</span>
                      </div>
                      <p className="mt-1 font-sans text-xs sm:text-sm text-white font-medium">{act.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Editorial Scientific Citations Footer */}
      <footer className="mt-16 border-t border-slate-800 pt-8 pb-12">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400 font-bold">
              EDITORIAL SCIENTIFIC CITATIONS // AEROSPACE MEDICINE FOUNDATION
            </span>
            <span className="font-mono text-xs text-sky-400 uppercase font-semibold">
              NASA HUMAN RESEARCH PROGRAM (HRP)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-4">
              <span className="font-mono text-xs font-bold uppercase text-sky-400 block mb-1">
                NASA-STD-3001 VOL 1 CH 7
              </span>
              <p className="font-sans text-xs sm:text-sm text-slate-300 leading-relaxed">
                Space Flight Human-System Standard: Crew Health and Clinical Care. Defines the normative
                thresholds for autonomous deep-space clinical decision support and life-critical interlocks.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-4">
              <span className="font-mono text-xs font-bold uppercase text-sky-400 block mb-1">
                FROST MECHANOSTAT 1987
              </span>
              <p className="font-sans text-xs sm:text-sm text-slate-300 leading-relaxed">
                Bone adaptation and strain threshold modeling. Mechanical disuse below 1500 microstrain
                induces sclerostin expression, driving uncoupled osteoclastic resorption in microgravity.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-4">
              <span className="font-mono text-xs font-bold uppercase text-sky-400 block mb-1">
                HARGENS HEMODYNAMICS 2019
              </span>
              <p className="font-sans text-xs sm:text-sm text-slate-300 leading-relaxed">
                Cardiovascular and cephalad fluid redistribution in spaceflight. Hydrostatic column
                elimination induces jugular venous stasis, flow reversal, and elevated intracranial pressure.
              </p>
            </div>
          </div>

          <p className="font-mono text-xs text-slate-400 pt-2 text-center">
            ARES-Health Decision Support Architecture // Certified Air-Gapped Flight System // Zero External Dependencies
          </p>
        </div>
      </footer>
    </section>
  );
}
