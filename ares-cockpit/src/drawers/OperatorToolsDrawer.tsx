// OperatorToolsDrawer — slide-over Sheet housing Level 3 deep engineering tools.
// SHA-256 Audit Chain viewer, raw telemetry snapshot, /anatomy Reference Studio
// launcher, and OsSystemStatusBar diagnostics.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../components/ui/sheet';
import { OsSystemStatusBar } from '../modules/os-shell/OsSystemStatusBar';
import type { TelemetryPacket } from '../types/telemetry';
import type { WhatIf } from '../lib/scenario';
import type { TransportMode, OsStatusBarState } from '../modules/os-shell/OsSystemStatusBar';
import type { DecodedBinaryTelemetryFrame } from '../lib/binaryTelemetryDecoder';
import type { AuditRecord } from '../modules/audit-chain/AuditChainModal';

// ---------------------------------------------------------------------------
// Tool tab metadata
// ---------------------------------------------------------------------------

type ToolTab = 'audit' | 'telemetry' | 'anatomy' | 'os';

const TOOL_TABS: { id: ToolTab; label: string }[] = [
  { id: 'audit', label: 'SHA-256 Audit Chain' },
  { id: 'telemetry', label: 'Raw Telemetry' },
  { id: 'anatomy', label: 'Anatomy Studio' },
  { id: 'os', label: 'OS Status' },
];

// ---------------------------------------------------------------------------
// Raw telemetry viewer — renders the JSON packet snapshot
// ---------------------------------------------------------------------------

function RawTelemetryViewer({ packet }: { packet: TelemetryPacket }) {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(
    {
      timestamp_ms: packet.timestamp_ms,
      astronaut_id: packet.astronaut_id,
      provenance: packet.provenance_manifest,
      biometrics: packet.biometrics,
      safety_margins: packet.safety_margins,
      active_playbook: packet.active_playbook
        ? { playbook_id: packet.active_playbook.playbook_id, step: packet.active_playbook.current_step }
        : null,
    },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
          Packet snapshot — latest tick
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] border border-[var(--color-border)] rounded px-2 py-0.5 hover:border-[var(--color-border-active)] hover:text-[var(--color-ink-meta)] transition-colors"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <pre
        className={`overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-l3)] p-3 font-mono text-[10px] text-[var(--color-ink-body)] leading-relaxed ${
          expanded ? '' : 'max-h-48'
        }`}
        aria-label="Raw telemetry JSON"
      >
        {json}
      </pre>
      <p className="font-mono text-[9px] text-[var(--color-ink-muted)]">
        Source: {packet.provenance_manifest?.biometrics_source ?? 'unknown'} — not for clinical use
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anatomy Studio launcher
// ---------------------------------------------------------------------------

function AnatomyStudioLauncher() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-meta)] mb-2">
          Reference Studio
        </p>
        <p className="font-sans text-sm text-[var(--color-ink-body)] leading-relaxed mb-3">
          Launches the full 3D anatomy reference inspector at <code className="font-mono text-xs text-[var(--color-accent)]">/anatomy</code>.
          The studio exposes the Male Z-Anatomy GLB and Female HRA v1.10/v1.5 atlases
          with searchable structure tree and coverage matrix.
        </p>
        <a
          href="/anatomy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
        >
          Open /anatomy Reference Studio
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
            <path d="M6 2a1 1 0 000 2h2.586L2.293 10.293a1 1 0 101.414 1.414L10 5.414V8a1 1 0 102 0V3a1 1 0 00-1-1H6z" />
          </svg>
        </a>
      </div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] mb-1">Coverage Status</p>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: 'Male Z-Anatomy GLB', status: 'Available', ok: true },
            { label: 'Female HRA v1.10', status: 'Available', ok: true },
            { label: 'Female HRA v1.5 (partial)', status: 'Partial', ok: false },
            { label: 'soleus / calcaneus', status: 'Missing', ok: false },
            { label: 'vagus / int. jugular', status: 'Unresolved', ok: false },
            { label: 'optic sheath', status: 'Unresolved', ok: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-0.5 border-b border-[var(--color-border)] last:border-b-0">
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">{item.label}</span>
              <span className={`font-mono text-[9px] ${item.ok ? 'text-[var(--color-status-nominal)]' : 'text-[var(--color-status-caution)]'}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OperatorToolsDrawerProps {
  open: boolean;
  onClose: () => void;
  packet: TelemetryPacket;
  whatIf: WhatIf;
  transportMode: TransportMode;
  ipcLatencyUs: number | null;
  binaryFrameCount: number;
  lastBinaryFrame: DecodedBinaryTelemetryFrame | null;
  osStatus: OsStatusBarState | null;
  auditRecords: AuditRecord[];
}

// ---------------------------------------------------------------------------
// OperatorToolsDrawer
// ---------------------------------------------------------------------------

export function OperatorToolsDrawer({
  open,
  onClose,
  packet,
  whatIf,
  transportMode,
  ipcLatencyUs,
  binaryFrameCount,
  lastBinaryFrame,
  osStatus,
  auditRecords,
}: OperatorToolsDrawerProps) {
  const [activeTab, setActiveTab] = useState<ToolTab>('audit');

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="font-mono text-xs uppercase tracking-widest">
            Operator Tools — Level 3
          </SheetTitle>
          <SheetDescription className="font-sans text-xs">
            Deep engineering diagnostics, audit chain, and reference tools.
            Not for operative clinical use.
          </SheetDescription>
        </SheetHeader>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Operator tool tabs"
          className="mb-4 flex gap-1 flex-wrap border-b border-[var(--color-border)] pb-2"
        >
          {TOOL_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                rounded px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest
                transition-colors duration-150
                ${activeTab === tab.id
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/40'
                  : 'border border-transparent text-[var(--color-ink-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-ink-meta)]'}
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div role="tabpanel">
          {activeTab === 'audit' && (
            <div className="flex flex-col gap-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
                SHA-256 Audit Chain — {auditRecords.length} record(s)
              </p>
              {auditRecords.length === 0 ? (
                <div className="ares-missing-hatch rounded p-4 text-center">
                  <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">No local audit records yet</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                  {auditRecords.map((rec) => (
                    <div key={rec.sequence_index} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">#{rec.sequence_index}</span>
                        <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">{rec.timestamp_utc}</span>
                      </div>
                      <p className="font-sans text-xs text-[var(--color-ink-body)] leading-snug">{rec.event_action}</p>
                      <p className="font-mono text-[8px] text-[var(--color-ink-muted)] mt-1 truncate">
                        SHA-256: {rec.current_hash_hex.slice(0, 32)}...
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  // Open full modal via App-level state if needed; for now link to operator tools.
                  const a = document.createElement('a');
                  a.href = '#audit-chain';
                  a.click();
                }}
                className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] border border-[var(--color-border)] rounded px-2 py-1 hover:border-[var(--color-border-active)] hover:text-[var(--color-ink-meta)] transition-colors self-start"
              >
                Open Full Audit Modal
              </button>
            </div>
          )}

          {activeTab === 'telemetry' && (
            <RawTelemetryViewer packet={packet} />
          )}

          {activeTab === 'anatomy' && (
            <AnatomyStudioLauncher />
          )}

          {activeTab === 'os' && (
            <OsSystemStatusBar
              packet={packet}
              whatIf={whatIf}
              transportMode={transportMode}
              ipcLatencyUs={ipcLatencyUs}
              binaryFrameCount={binaryFrameCount}
              lastBinaryFrame={lastBinaryFrame}
              osStatus={osStatus}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
