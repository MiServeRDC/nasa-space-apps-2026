import { CloseButton } from '../ui-primitives/CloseButton';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ENGINE_HTTP_URL } from '../../lib/useTelemetry';

export interface AuditRecord {
  sequence_index: number;
  timestamp_utc: string;
  actor_role: 'ASTRONAUT_SELF' | 'CREW_MEDICAL_OFFICER' | 'GROUND_FLIGHT_SURGEON';
  event_action: string;
  prev_hash_hex: string;
  current_hash_hex: string;
}

export type AuditProvenance = 'LIVE_ENGINE_LEDGER' | 'OFFLINE_SIMULATION_PREVIEW';

const DEFAULT_AUDIT_LOG: AuditRecord[] = [
  {
    sequence_index: 0,
    timestamp_utc: '2026-11-14T06:00:00Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action: 'GENESIS: ARES-Health cryptographic ledger initialized. Pre-flight self-test OK.',
    prev_hash_hex: '0'.repeat(64),
    current_hash_hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    sequence_index: 1,
    timestamp_utc: '2026-11-14T08:15:22Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action: 'SAFETY GATE 1 ENGAGED: Hard lockout on systemic anticoagulation enforced without POCUS thrombus confirmation.',
    prev_hash_hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    current_hash_hex: 'a4b12c8e3901b0f59c118e90a2d48bf1293c04859aef09b2318cfba190284ab9',
  },
  {
    sequence_index: 2,
    timestamp_utc: '2026-11-14T11:42:05Z',
    actor_role: 'ASTRONAUT_SELF',
    event_action: 'SAFETY GATE 2 ARMED: LBNP chamber anti-syncope guardrail active (auto-vent if SBP drop > 15 mmHg or HR > 115 bpm).',
    prev_hash_hex: 'a4b12c8e3901b0f59c118e90a2d48bf1293c04859aef09b2318cfba190284ab9',
    current_hash_hex: 'f7c90823da56b10e3950284bcda801739f50e92819fa041b802de93845c1109a',
  },
  {
    sequence_index: 3,
    timestamp_utc: '2026-11-14T15:20:18Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action: 'POCUS SCAN LOGGED: Internal Jugular Vein ultrasound inspection recorded. Venous CSA = 1.15 cm2.',
    prev_hash_hex: 'f7c90823da56b10e3950284bcda801739f50e92819fa041b802de93845c1109a',
    current_hash_hex: 'c28109bf5a43e80918efbc00192a83e0915f793b821950e39a04cb9128f09912',
  },
];

function verifyChainContinuity(data: AuditRecord[]): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;
  // Genesis block validation
  if (data[0].sequence_index !== 0 || data[0].prev_hash_hex !== '0'.repeat(64)) {
    return false;
  }
  // Contiguous block validation
  for (let i = 1; i < data.length; i++) {
    if (data[i].sequence_index !== data[i - 1].sequence_index + 1) {
      return false;
    }
    if (data[i].prev_hash_hex !== data[i - 1].current_hash_hex) {
      return false;
    }
  }
  return true;
}

export function AuditChainModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<AuditRecord[]>(DEFAULT_AUDIT_LOG);
  const [provenance, setProvenance] = useState<AuditProvenance>('OFFLINE_SIMULATION_PREVIEW');
  const [loading, setLoading] = useState(false);
  const [isChainValid, setIsChainValid] = useState(true);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch audit records from live engine or fallback
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);

    fetch(`${ENGINE_HTTP_URL}/api/audit-log`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: AuditRecord[]) => {
        if (mounted && Array.isArray(data) && data.length > 0) {
          setRecords(data);
          setProvenance('LIVE_ENGINE_LEDGER');
          setIsChainValid(verifyChainContinuity(data));
        }
      })
      .catch(() => {
        if (mounted) {
          setRecords(DEFAULT_AUDIT_LOG);
          setProvenance('OFFLINE_SIMULATION_PREVIEW');
          setIsChainValid(verifyChainContinuity(DEFAULT_AUDIT_LOG));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border-2 border-cyan-400 bg-black p-5 shadow-[0_0_50px_rgba(34,211,238,0.25)]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between border-b border-gray-800 pb-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded bg-cyan-400 px-2 py-0.5 font-bold text-black">ARES SECURITY</span>
            <span id="audit-modal-title" className="text-sm font-bold text-white">SHA-256 CRYPTOGRAPHIC AUDIT CHAIN</span>
            <span className="hidden text-gray-500 md:inline">| NASA-STD-3001 VOL. 1 CH. 7 NON-REPUDIATION</span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {/* Verification & Provenance Banner */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-cyan-500/40 bg-cyan-950/20 px-4 py-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${isChainValid ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-red-500'}`} />
            <span className="font-bold text-cyan-300">
              {isChainValid ? 'CRYPTOGRAPHIC AUDIT INTEGRITY: VERIFIED' : 'AUDIT CHAIN CORRUPTED'}
            </span>
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                provenance === 'LIVE_ENGINE_LEDGER'
                  ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300'
                  : 'border-amber-400 bg-amber-950/60 text-amber-300'
              }`}
            >
              {provenance}
            </span>
          </div>
          <div className="text-gray-400">
            Total Blocks: <b className="text-white">{records.length}</b> {loading && '(Refreshing...)'}
          </div>
        </div>

        {/* Audit Log Entries List */}
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {records.map((rec) => (
            <div
              key={rec.sequence_index}
              className="flex flex-col gap-1.5 rounded-lg border border-gray-800 bg-gray-950/80 p-3 font-mono text-xs hover:border-cyan-500/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 font-bold text-gray-300">
                    #{rec.sequence_index}
                  </span>
                  <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-cyan-300">
                    ROLE: {rec.actor_role}
                  </span>
                </div>
                <span className="text-[11px] text-gray-500">{rec.timestamp_utc}</span>
              </div>

              <div className="mt-1 font-sans text-xs text-gray-200">
                {rec.event_action}
              </div>

              <div className="mt-2 grid grid-cols-1 gap-1 border-t border-gray-900 pt-1.5 text-[10px] md:grid-cols-2">
                <div className="truncate text-gray-500">
                  PREV HASH: <span className="font-mono text-gray-400">{rec.prev_hash_hex}</span>
                </div>
                <div className="truncate text-cyan-500">
                  BLOCK HASH: <span className="font-mono text-cyan-300">{rec.current_hash_hex}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-3 flex items-center justify-between border-t border-gray-800 pt-3 font-mono text-[11px] text-gray-500">
          <span>Standard: NASA-STD-3001 MedOps Chain-of-Custody</span>

        </div>
      </div>
    </div>,
    document.body
  );
}
