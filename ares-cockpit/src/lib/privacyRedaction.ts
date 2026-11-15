// NASA-STD-3001 Vol. 1 Ch. 7 Role-Based Crew Medical Privacy Governance helper.
// Enforces 4-tier field-level redaction across CREW_SELF, CMO, FLIGHT_SURGEON,
// and GROUND_RESEARCH while keeping numeric telemetry contracts (`number | null`)
// and SHA-256 non-repudiation audit hashes 100% intact.

import type { TelemetryPacket } from '../types/telemetry';
import type { PrivacyRole } from '../types/workbench';

export const PRIVACY_NORMATIVE_CLAUSE = 'NASA-STD-3001 Vol. 1 Ch. 7' as const;

export const REDACTED_PRIVACY_MARKER = '[REDACTED // NASA-STD-3001 VOL.1 CH.7]' as const;

export type PrivacyFieldCategory =
  | 'IDENTIFIABLE_CREW_ID'
  | 'EXACT_UTC_TIMESTAMP'
  | 'BEHAVIORAL_VOCAL_PSYCH'
  | 'PERSONAL_MEDICAL_NOTES'
  | 'CLINICAL_DIAGNOSTIC_DETAIL'
  | 'ACUTE_SAFETY_GATE_EVENT'
  | 'CRYPTOGRAPHIC_HASH';

export interface PrivacyRoleDescriptor {
  role: PrivacyRole;
  wireActorName:
    | 'ASTRONAUT_SELF'
    | 'CREW_MEDICAL_OFFICER'
    | 'GROUND_FLIGHT_SURGEON'
    | 'ANONYMIZED_GROUND_RESEARCH';
  shortLabel: string;
  title: string;
  description: string;
  normativeClause: typeof PRIVACY_NORMATIVE_CLAUSE;
}

export const PRIVACY_ROLE_DESCRIPTORS: Record<PrivacyRole, PrivacyRoleDescriptor> = {
  CREW_SELF: {
    role: 'CREW_SELF',
    wireActorName: 'ASTRONAUT_SELF',
    shortLabel: 'CREW SELF',
    title: 'Private Astronaut View',
    description:
      'Full access to own physiological, behavioral/vocal, diagnostic, and personal medical records.',
    normativeClause: PRIVACY_NORMATIVE_CLAUSE,
  },
  CMO: {
    role: 'CMO',
    wireActorName: 'CREW_MEDICAL_OFFICER',
    shortLabel: 'ONBOARD CMO',
    title: 'Crew Medical Officer Clinical View',
    description:
      'Full onboard clinical diagnostics, POCUS, and safety gates; private psychological/vocal diary logs masked.',
    normativeClause: PRIVACY_NORMATIVE_CLAUSE,
  },
  FLIGHT_SURGEON: {
    role: 'FLIGHT_SURGEON',
    wireActorName: 'GROUND_FLIGHT_SURGEON',
    shortLabel: 'FLIGHT SURGEON',
    title: 'Ground Flight Surgeon Store-and-Forward View',
    description:
      'Authorized telemedicine clinical packet and crew ID; raw private habitat behavioral transcripts masked.',
    normativeClause: PRIVACY_NORMATIVE_CLAUSE,
  },
  GROUND_RESEARCH: {
    role: 'GROUND_RESEARCH',
    wireActorName: 'ANONYMIZED_GROUND_RESEARCH',
    shortLabel: 'GROUND RESEARCH',
    title: 'De-Identified Epidemiological Research View',
    description:
      'Pseudonymized subject cohort tag, coarsened timestamps, and redacted personal/clinical identifiers; numeric physiology and SHA-256 hashes preserved.',
    normativeClause: PRIVACY_NORMATIVE_CLAUSE,
  },
};

export interface RedactedFieldEnvelope {
  valueText: string;
  redacted: boolean;
  pseudonymized: boolean;
  category: PrivacyFieldCategory;
  role: PrivacyRole;
  normativeClause: typeof PRIVACY_NORMATIVE_CLAUSE;
}

export interface AuditRecordLike {
  sequence_index: number;
  timestamp_utc: string;
  actor_role: string;
  event_action: string;
  prev_hash_hex: string;
  current_hash_hex: string;
}

export interface RedactedAuditRecord extends AuditRecordLike {
  display_timestamp: string;
  display_actor_role: string;
  display_event_action: string;
  is_redacted: boolean;
  privacy_role_applied: PrivacyRole;
  normative_clause: typeof PRIVACY_NORMATIVE_CLAUSE;
}

export interface RedactedTelemetryDisplayMetadata {
  role: PrivacyRole;
  normativeClause: typeof PRIVACY_NORMATIVE_CLAUSE;
  displayAstronautId: RedactedFieldEnvelope;
  displaySourceRecordId: RedactedFieldEnvelope;
  displayBehavioralVocalSummary: RedactedFieldEnvelope;
  displayPersonalMedicalNotes: RedactedFieldEnvelope;
  /** Underlying packet reference with 100% untouched `number | null` numeric contracts. */
  numericPacket: TelemetryPacket;
}

/** Deterministic non-reversible FNV-1a 32-bit hex tag for de-identified cohort display. */
export function pseudonymizeCrewIdentifier(rawId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < rawId.length; i += 1) {
    hash ^= rawId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hex = hash.toString(16).toUpperCase().padStart(8, '0');
  return `ANON-COHORT-${hex.slice(0, 6)}`;
}

function coarsenUtcTimestampToDateWindow(timestampUtc: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(timestampUtc.trim());
  return match ? `${match[1]}T00:00Z [COARSENED]` : 'MISSION-WINDOW [COARSENED]';
}

function isFieldPermitted(role: PrivacyRole, category: PrivacyFieldCategory): boolean {
  if (category === 'CRYPTOGRAPHIC_HASH' || category === 'ACUTE_SAFETY_GATE_EVENT') {
    return true;
  }

  switch (role) {
    case 'CREW_SELF':
      return true;
    case 'CMO':
      return category !== 'BEHAVIORAL_VOCAL_PSYCH' && category !== 'PERSONAL_MEDICAL_NOTES';
    case 'FLIGHT_SURGEON':
      return category !== 'BEHAVIORAL_VOCAL_PSYCH';
    case 'GROUND_RESEARCH':
      return false;
  }
}

export function redactFieldByRole(
  role: PrivacyRole,
  category: PrivacyFieldCategory,
  rawValue: string,
): RedactedFieldEnvelope {
  if (role === 'GROUND_RESEARCH' && category === 'IDENTIFIABLE_CREW_ID') {
    return {
      valueText: pseudonymizeCrewIdentifier(rawValue || 'UNKNOWN'),
      redacted: true,
      pseudonymized: true,
      category,
      role,
      normativeClause: PRIVACY_NORMATIVE_CLAUSE,
    };
  }

  if (role === 'GROUND_RESEARCH' && category === 'EXACT_UTC_TIMESTAMP') {
    return {
      valueText: coarsenUtcTimestampToDateWindow(rawValue),
      redacted: true,
      pseudonymized: true,
      category,
      role,
      normativeClause: PRIVACY_NORMATIVE_CLAUSE,
    };
  }

  if (isFieldPermitted(role, category)) {
    return {
      valueText: rawValue,
      redacted: false,
      pseudonymized: false,
      category,
      role,
      normativeClause: PRIVACY_NORMATIVE_CLAUSE,
    };
  }

  return {
    valueText: REDACTED_PRIVACY_MARKER,
    redacted: true,
    pseudonymized: false,
    category,
    role,
    normativeClause: PRIVACY_NORMATIVE_CLAUSE,
  };
}

function classifyAuditEventCategory(eventAction: string): PrivacyFieldCategory {
  const upper = eventAction.toUpperCase();
  if (
    upper.includes('SAFETY GATE') ||
    upper.includes('GENESIS') ||
    upper.includes('AUTO-VENT') ||
    upper.includes('EVA')
  ) {
    return 'ACUTE_SAFETY_GATE_EVENT';
  }
  if (
    upper.includes('VOCAL') ||
    upper.includes('BEHAVIORAL') ||
    upper.includes('PSYCH') ||
    upper.includes('SLEEP DIARY')
  ) {
    return 'BEHAVIORAL_VOCAL_PSYCH';
  }
  return 'CLINICAL_DIAGNOSTIC_DETAIL';
}

/**
 * Redacts display fields of an `AuditRecord` according to `role` while preserving
 * `sequence_index`, `prev_hash_hex`, and `current_hash_hex` verbatim for SHA-256 chain verification.
 */
export function redactAuditRecordForRole<T extends AuditRecordLike>(
  record: T,
  role: PrivacyRole,
): T & RedactedAuditRecord {
  const tsEnv = redactFieldByRole(role, 'EXACT_UTC_TIMESTAMP', record.timestamp_utc);
  const actorEnv =
    role === 'GROUND_RESEARCH'
      ? {
          valueText: 'DEIDENTIFIED_OPERATOR',
          redacted: true,
        }
      : {
          valueText: record.actor_role,
          redacted: false,
        };

  const eventCategory = classifyAuditEventCategory(record.event_action);
  const eventEnv = redactFieldByRole(role, eventCategory, record.event_action);

  return {
    ...record,
    display_timestamp: tsEnv.valueText,
    display_actor_role: actorEnv.valueText,
    display_event_action: eventEnv.valueText,
    is_redacted: tsEnv.redacted || actorEnv.redacted || eventEnv.redacted,
    privacy_role_applied: role,
    normative_clause: PRIVACY_NORMATIVE_CLAUSE,
  };
}

/**
 * Produces role-governed display envelopes for identifiable/behavioral fields while
 * preserving the numeric `TelemetryPacket` (`number | null` channels) completely unmodified.
 */
export function buildPrivacyGovernedTelemetryView(
  packet: TelemetryPacket,
  role: PrivacyRole,
  personalNotes = 'Crew self-logged sleep quality and acoustic fatigue journal.',
  vocalSummary = 'CHAPEA/HERA passive vocal F0 jitter/shimmer within baseline.',
): RedactedTelemetryDisplayMetadata {
  return {
    role,
    normativeClause: PRIVACY_NORMATIVE_CLAUSE,
    displayAstronautId: redactFieldByRole(role, 'IDENTIFIABLE_CREW_ID', packet.astronaut_id),
    displaySourceRecordId: redactFieldByRole(role, 'IDENTIFIABLE_CREW_ID', packet.source_record_id),
    displayBehavioralVocalSummary: redactFieldByRole(
      role,
      'BEHAVIORAL_VOCAL_PSYCH',
      vocalSummary,
    ),
    displayPersonalMedicalNotes: redactFieldByRole(
      role,
      'PERSONAL_MEDICAL_NOTES',
      personalNotes,
    ),
    numericPacket: packet,
  };
}
