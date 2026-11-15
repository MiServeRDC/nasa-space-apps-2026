import type { AuditRecord } from '../modules/audit-chain/AuditChainModal';
export const LOCAL_AUDIT_GENESIS = '0'.repeat(64);
export function canonicalLocalAudit(record: Omit<AuditRecord, 'current_hash_hex'>): string {
  return JSON.stringify(['ARES_LOCAL_NOTE_V1', record.sequence_index, record.timestamp_utc,
    record.actor_role, record.event_action, record.prev_hash_hex]);
}
async function digest(text: string): Promise<string> {
  // No noncryptographic substitute: unsupported contexts cannot claim SHA-256.
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function appendLocalAudit(records: readonly AuditRecord[], event: string, timestamp = new Date().toISOString()): Promise<AuditRecord> {
  const fields = {sequence_index: records.length, timestamp_utc: timestamp,
    actor_role: 'CREW_MEDICAL_OFFICER' as const, event_action: event,
    prev_hash_hex: records.at(-1)?.current_hash_hex ?? LOCAL_AUDIT_GENESIS};
  return {...fields, current_hash_hex: await digest(canonicalLocalAudit(fields))};
}
export async function verifyLocalAudit(records: readonly AuditRecord[]): Promise<boolean> {
  let previous = LOCAL_AUDIT_GENESIS;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.sequence_index !== i || r.prev_hash_hex !== previous ||
        r.current_hash_hex !== await digest(canonicalLocalAudit(r))) return false;
    previous = r.current_hash_hex;
  }
  return true;
}
