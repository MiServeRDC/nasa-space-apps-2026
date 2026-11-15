// Cryptographic SHA-256 Audit Ledger, Data Provenance & NASA-STD-3001 Vol. 1 Ch. 7
// Crew Medical Privacy Governance Drawer (`AuditAndProvenanceDrawer`).
// Implements:
// - Explicit `LIVE_ENGINE_LEDGER` (`GET ${httpBaseUrl}/api/audit-log`) vs
//   `OFFLINE_SIMULATION_PREVIEW` provenance banner (never masquerading as live!)
// - Contiguous SHA-256 chain continuity verification (`verifyAuditChainContinuity`)
// - Fixed-row (`56px`) virtualized audit ledger (`computeVirtualWindow`)
// - 4-Role Crew Medical Privacy Switcher (`CREW_SELF`, `CMO`, `FLIGHT_SURGEON`, `GROUND_RESEARCH`)
//   with editorial redaction bars (`[REDACTED // NASA-STD-3001 VOL.1 CH.7]`)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FreshnessStatus, TelemetryPacket } from '../types/telemetry';
import type { PrivacyRole } from '../types/workbench';
import type { TelemetryStatus } from '../lib/useTelemetry';
import { buildIndicatorMetadata } from '../lib/telemetryValidation';
import {
  PRIVACY_NORMATIVE_CLAUSE,
  PRIVACY_ROLE_DESCRIPTORS,
  buildPrivacyGovernedTelemetryView,
  redactAuditRecordForRole,
} from '../lib/privacyRedaction';
import type { AuditProvenance, AuditRecord } from '../modules/audit-chain/AuditChainModal';
import { FreshnessBadge, OriginBadge } from '../modules/provenance/ProvenanceInspector';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announceAssertive, announcePolite } from '../stores/a11yAnnouncer';
import { SlideOverDrawerShell } from './SlideOverDrawerShell';
import {
  computeVirtualWindow,
  verifyAuditChainContinuity,
} from './drawerLogic';

export interface AuditAndProvenanceDrawerProps {
  open: boolean;
  onClose: () => void;
  packet: TelemetryPacket;
  telemetryStatus: TelemetryStatus;
  httpBaseUrl?: string;
  extraLocalAuditEntries?: readonly AuditRecord[];
  invokerElementId?: string | null;
}

type AuditDrawerTab = 'SHA256_LEDGER' | 'DATA_PROVENANCE' | 'PRIVACY_GOVERNANCE';

const PREVIEW_FALLBACK_CHAIN: readonly AuditRecord[] = [
  {
    sequence_index: 0,
    timestamp_utc: '2026-11-14T06:00:00Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action:
      'GENESIS: ARES-Health edge cryptographic ledger initialized. Pre-flight self-test OK.',
    prev_hash_hex: '0'.repeat(64),
    current_hash_hex:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    sequence_index: 1,
    timestamp_utc: '2026-11-14T08:15:22Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action:
      'SAFETY GATE 1 ENGAGED: Hard lockout on systemic anticoagulation enforced pending POCUS thrombus verification.',
    prev_hash_hex:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    current_hash_hex:
      'a4b12c8e3901b0f59c118e90a2d48bf1293c04859aef09b2318cfba190284ab9',
  },
  {
    sequence_index: 2,
    timestamp_utc: '2026-11-14T11:42:05Z',
    actor_role: 'ASTRONAUT_SELF',
    event_action:
      'VOCAL JITTER & PRIVATE CREW LOG: Routine autonomic check-in recorded locally on habitat edge enclave.',
    prev_hash_hex:
      'a4b12c8e3901b0f59c118e90a2d48bf1293c04859aef09b2318cfba190284ab9',
    current_hash_hex:
      'f7c90823da56b10e3950284bcda801739f50e92819fa041b802de93845c1109a',
  },
  {
    sequence_index: 3,
    timestamp_utc: '2026-11-14T15:20:18Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action:
      'POCUS SCAN LOGGED: Left Internal Jugular Vein B-Mode compression exam archived.',
    prev_hash_hex:
      'f7c90823da56b10e3950284bcda801739f50e92819fa041b802de93845c1109a',
    current_hash_hex:
      '4d29a8f0c1234e89b56701a2bcdef34567890fedcba9876543210abcdef12345',
  },
];

const AUDIT_ROW_PX = 64;
const AUDIT_VIEWPORT_PX = 320;

export function AuditAndProvenanceDrawer({
  open,
  onClose,
  packet,
  telemetryStatus,
  httpBaseUrl = 'http://127.0.0.1:8080',
  extraLocalAuditEntries = [],
  invokerElementId,
}: AuditAndProvenanceDrawerProps) {
  const privacyRole = useWorkbenchStore((s) => s.privacyRole);
  const setPrivacyRole = useWorkbenchStore((s) => s.setPrivacyRole);

  const [tab, setTab] = useState<AuditDrawerTab>('SHA256_LEDGER');
  const [provenance, setProvenance] = useState<AuditProvenance>('OFFLINE_SIMULATION_PREVIEW');
  const [engineRecords, setEngineRecords] = useState<AuditRecord[] | null>(null);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [verifyBanner, setVerifyBanner] = useState<string | null>(null);

  const fetchAuditLedger = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 1400);
      try {
        const res = await fetch(`${httpBaseUrl}/api/audit-log`, { signal: ctrl.signal });
        if (res.ok) {
          const data = (await res.json()) as unknown;
          if (Array.isArray(data) && data.length > 0) {
            setEngineRecords(data as AuditRecord[]);
            setProvenance('LIVE_ENGINE_LEDGER');
            return;
          }
        }
      } finally {
        window.clearTimeout(timer);
      }
    } catch {
      // Offline preview fallback
    }
    setEngineRecords(null);
    setProvenance('OFFLINE_SIMULATION_PREVIEW');
  }, [httpBaseUrl]);

  useEffect(() => {
    if (open) {
      void fetchAuditLedger();
    }
  }, [fetchAuditLedger, open]);

  const activeLedger = useMemo(() => {
    if (provenance === 'LIVE_ENGINE_LEDGER' && engineRecords) {
      return engineRecords;
    }
    if (extraLocalAuditEntries.length === 0) {
      return PREVIEW_FALLBACK_CHAIN;
    }
    return [...PREVIEW_FALLBACK_CHAIN, ...extraLocalAuditEntries];
  }, [engineRecords, extraLocalAuditEntries, provenance]);

  const chainCheck = useMemo(
    () => verifyAuditChainContinuity(activeLedger),
    [activeLedger],
  );

  const redactedLedger = useMemo(
    () => activeLedger.map((rec) => redactAuditRecordForRole(rec, privacyRole)),
    [activeLedger, privacyRole],
  );

  const virtualSlice = useMemo(
    () =>
      computeVirtualWindow(
        redactedLedger.length,
        scrollTop,
        AUDIT_VIEWPORT_PX,
        AUDIT_ROW_PX,
        4,
      ),
    [redactedLedger.length, scrollTop],
  );

  const privacyTelemetryView = useMemo(
    () => buildPrivacyGovernedTelemetryView(packet, privacyRole),
    [packet, privacyRole],
  );

  const indicators = useMemo(
    () =>
      buildIndicatorMetadata(packet, {
        heldSample: telemetryStatus.heldSample,
        heldAgeMs: telemetryStatus.heldAgeMs,
        isStale: telemetryStatus.isStale,
        hasRejectedFrame: telemetryStatus.rejectedFrames > 0,
      }),
    [packet, telemetryStatus],
  );

  const freshnessState: FreshnessStatus =
    telemetryStatus.validationError && telemetryStatus.isStale
      ? 'INVALID'
      : telemetryStatus.isStale
        ? 'HELD_STALE'
        : telemetryStatus.heldSample
          ? 'HOLD_LAST_VALID'
          : 'FRESH';

  const handleManualVerify = (): void => {
    const res = verifyAuditChainContinuity(activeLedger);
    const msg = res.intact
      ? `SHA-256 chain continuity verified across ${res.checkedCount} blocks (${provenance}).`
      : `SHA-256 chain break detected at sequence ${res.brokenAtSequence}: ${res.reason}`;
    setVerifyBanner(msg);
    if (res.intact) {
      announcePolite(msg);
    } else {
      announceAssertive(msg);
    }
  };

  return (
    <SlideOverDrawerShell
      open={open}
      onClose={onClose}
      eyebrow={`NON-REPUDIATION & ${PRIVACY_NORMATIVE_CLAUSE.toUpperCase()} [L]`}
      title="SHA-256 Audit Ledger, Provenance & Privacy Governance"
      subtitle={`Active Role: ${PRIVACY_ROLE_DESCRIPTORS[privacyRole].title}`}
      invokerElementId={invokerElementId}
    >
      <div className="space-y-3 font-mono text-xs">
        {/* Unmistakable Ledger Provenance Banner (`LIVE_ENGINE_LEDGER` vs `OFFLINE_SIMULATION_PREVIEW`) */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-[10px] ${
            provenance === 'LIVE_ENGINE_LEDGER'
              ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-100'
              : 'border-amber-400/70 bg-amber-500/15 text-amber-100'
          }`}
        >
          <div>
            <div className="font-bold tracking-wider">
              LEDGER PROVENANCE: {provenance}
            </div>
            <div className="text-[9px] opacity-90">
              {provenance === 'LIVE_ENGINE_LEDGER'
                ? 'Cryptographic records streamed from live Rust ares-security-privacy engine.'
                : 'Engine offline: displaying local deterministic preview chain (not a live mission ledger).'}
            </div>
          </div>

          <span
            className={`rounded border px-2 py-0.5 font-bold ${
              chainCheck.intact
                ? 'border-emerald-400/60 bg-black/70 text-emerald-300'
                : 'border-rose-500/80 bg-black/70 text-rose-300'
            }`}
          >
            {chainCheck.intact
              ? `CHAIN INTACT (${chainCheck.checkedCount})`
              : `TAMPER BREAK @ #${chainCheck.brokenAtSequence}`}
          </span>
        </div>

        {/* <= 3 Sub-Tabs */}
        <div
          role="tablist"
          aria-label="Audit, provenance, and privacy tabs"
          className="grid grid-cols-3 gap-1.5 text-[10px]"
        >
          {(
            [
              { id: 'SHA256_LEDGER', label: 'SHA-256 LEDGER' },
              { id: 'DATA_PROVENANCE', label: 'PROVENANCE' },
              { id: 'PRIVACY_GOVERNANCE', label: 'PRIVACY TIERS' },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`ares-touch-target ares-interactive rounded-lg border font-semibold ${
                  active
                    ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                    : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Sub-Tab 1: Virtualized SHA-256 Hash Chain */}
        {tab === 'SHA256_LEDGER' ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleManualVerify}
                className="ares-touch-target ares-interactive flex-1 rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-3 text-[10px] font-semibold text-cyan-200"
              >
                VERIFY SHA-256 CONTINUITY
              </button>
              <button
                type="button"
                onClick={() => void fetchAuditLedger()}
                className="ares-touch-target ares-interactive rounded-lg border border-white/15 bg-black px-3 text-[10px] font-semibold text-[var(--color-ink-display)]"
              >
                REFRESH LEDGER
              </button>
            </div>

            {verifyBanner ? (
              <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] text-cyan-200">
                {verifyBanner}
              </div>
            ) : null}

            <div
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              className="overflow-y-auto rounded-xl border border-white/10 bg-black/80"
              style={{ height: `${AUDIT_VIEWPORT_PX}px`, overscrollBehavior: 'contain' }}
            >
              <div style={{ height: `${virtualSlice.topSpacerPx}px` }} />
              {redactedLedger
                .slice(virtualSlice.startIndex, virtualSlice.endIndexExclusive)
                .map((row) => (
                  <div
                    key={`${row.sequence_index}-${row.current_hash_hex.slice(0, 12)}`}
                    style={{ height: `${AUDIT_ROW_PX}px` }}
                    className="flex flex-col justify-center border-b border-white/5 px-3 text-[10px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-cyan-200">
                        #{row.sequence_index} &bull; {row.display_timestamp}
                      </span>
                      <span className="text-[9px] text-[var(--color-ink-meta)]">
                        {row.display_actor_role}
                      </span>
                    </div>
                    <div
                      className={`truncate font-sans text-xs ${
                        row.is_redacted
                          ? 'font-mono text-[10px] text-amber-300'
                          : 'text-[var(--color-ink-display)]'
                      }`}
                    >
                      {row.display_event_action}
                    </div>
                    <div className="truncate text-[9px] text-[var(--color-ink-muted)]">
                      PREV {row.prev_hash_hex.slice(0, 14)}... -&gt; SHA256{' '}
                      {row.current_hash_hex.slice(0, 18)}...
                    </div>
                  </div>
                ))}
              <div style={{ height: `${virtualSlice.bottomSpacerPx}px` }} />
            </div>
          </div>
        ) : null}

        {/* Sub-Tab 2: Telemetry Manifest & Per-Indicator Freshness / Origin Provenance */}
        {tab === 'DATA_PROVENANCE' ? (
          <div className="space-y-2.5">
            <div className="ares-inner-well space-y-2 p-3 text-[10px]">
              <div className="flex flex-wrap items-center gap-2">
                <OriginBadge
                  origin={
                    packet.is_local_simulation
                      ? 'SIMULATED_SCENARIO_INPUT'
                      : packet.provenance_manifest.biometrics_source
                  }
                />
                <FreshnessBadge
                  freshness={freshnessState}
                  ageMs={telemetryStatus.heldAgeMs}
                />
                <span className="rounded border border-white/15 bg-black px-2 py-0.5 text-[var(--color-ink-display)]">
                  RECORD: {packet.source_record_id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
                <div>
                  MANIFEST SHA-256:{' '}
                  <span className="text-emerald-300">
                    {packet.provenance_manifest.manifest_sha256_verified
                      ? 'VERIFIED'
                      : 'SIMULATED'}
                  </span>
                </div>
                <div>
                  REJECTED FRAMES:{' '}
                  <span className="text-cyan-200">{telemetryStatus.rejectedFrames}</span>
                </div>
              </div>
            </div>

            <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-2.5">
              {indicators.map((ind) => (
                <div
                  key={ind.id}
                  className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5 text-[10px]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--color-ink-display)]">
                      {ind.label}: {ind.valueText}
                    </div>
                    <div className="truncate text-[9px] text-[var(--color-ink-meta)]">
                      {ind.availabilityReason ?? 'ACTIVE CHANNEL'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <OriginBadge origin={ind.origin} />
                    <FreshnessBadge freshness={ind.freshness} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Sub-Tab 3: NASA-STD-3001 Vol. 1 Ch. 7 Role-Based Crew Medical Privacy Switcher */}
        {tab === 'PRIVACY_GOVERNANCE' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {(
                ['CREW_SELF', 'CMO', 'FLIGHT_SURGEON', 'GROUND_RESEARCH'] as PrivacyRole[]
              ).map((roleOpt) => {
                const desc = PRIVACY_ROLE_DESCRIPTORS[roleOpt];
                const active = privacyRole === roleOpt;
                return (
                  <button
                    key={roleOpt}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setPrivacyRole(roleOpt);
                      announcePolite(`Switched medical privacy governance role to ${desc.title}.`);
                    }}
                    className={`ares-touch-target ares-interactive rounded-xl border p-2 text-left ${
                      active
                        ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                    }`}
                  >
                    <div className="text-[10px] font-bold">{desc.shortLabel}</div>
                    <div className="truncate text-[9px] opacity-80">{desc.wireActorName}</div>
                  </button>
                );
              })}
            </div>

            <div className="ares-inner-well space-y-2 p-3 text-[10px]">
              <div className="font-bold text-cyan-200">
                {PRIVACY_ROLE_DESCRIPTORS[privacyRole].title} ({PRIVACY_NORMATIVE_CLAUSE})
              </div>
              <p className="font-sans text-xs leading-relaxed text-[var(--color-ink-body)]">
                {PRIVACY_ROLE_DESCRIPTORS[privacyRole].description}
              </p>

              <div className="space-y-1.5 border-t border-white/10 pt-2">
                {(
                  [
                    { label: 'CREW SUBJECT ID', env: privacyTelemetryView.displayAstronautId },
                    { label: 'SOURCE RECORD ID', env: privacyTelemetryView.displaySourceRecordId },
                    { label: 'VOCAL / PSYCH TELEMETRY', env: privacyTelemetryView.displayBehavioralVocalSummary },
                    { label: 'PERSONAL DIARY NOTES', env: privacyTelemetryView.displayPersonalMedicalNotes },
                  ] as const
                ).map((field) => (
                  <div
                    key={field.label}
                    className="flex flex-col gap-0.5 rounded border border-white/5 bg-black/70 px-2.5 py-1.5"
                  >
                    <span className="text-[9px] text-[var(--color-ink-meta)]">{field.label}</span>
                    <span
                      className={
                        field.env.redacted
                          ? 'text-amber-300'
                          : field.env.pseudonymized
                            ? 'text-cyan-300'
                            : 'text-[var(--color-ink-display)]'
                      }
                    >
                      {field.env.valueText}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SlideOverDrawerShell>
  );
}
