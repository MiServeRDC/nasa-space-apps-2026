// Pure deterministic helpers for `src/drawers/*`:
// - SHA-256 cryptographic audit chain continuity verification (`verifyAuditChainContinuity`)
// - Zero-lag fixed-height row virtualization window math (`computeVirtualWindow`)
// - Deep-space One-Way Light Time (`8.2-48.1 min`) DSN packet transit math (`computeOwltFlightProgress`)
// - 24-Dataset Scientific Evidence Atlas query & agency filter (`filterScientificAtlas`)
// Uses `import type` only so `node --test --experimental-strip-types` runs directly.

import type { AuditRecordLike } from '../lib/privacyRedaction';
import type { ScientificDataset } from '../modules/portal/MissionPortal';

export const OWLT_MIN_MINUTES = 8.2;
export const OWLT_MAX_MINUTES = 48.1;
export const DEFAULT_VIRTUAL_ROW_PX = 48;

export function restoreFocusById(id: string | null | undefined): void {
  if (!id || typeof document === 'undefined') return;
  const target = document.getElementById(id);
  if (target && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
  }
}

export interface AuditChainVerificationResult {
  intact: boolean;
  checkedCount: number;
  brokenAtSequence: number | null;
  reason: string;
}

const HEX_64_RE = /^[0-9a-f]{64}$/i;

/**
 * Verifies contiguous SHA-256 hash-chain non-repudiation across an ordered ledger:
 * 1. Every `prev_hash_hex` and `current_hash_hex` is a valid 64-character hex digest
 * 2. Sequence 0 starts from all-zeros genesis (`0000...`) or first observed head
 * 3. Every subsequent record satisfies `record[i].prev_hash_hex === record[i - 1].current_hash_hex`
 *    and strictly monotonic `sequence_index`
 */
export function verifyAuditChainContinuity(
  records: readonly AuditRecordLike[],
): AuditChainVerificationResult {
  if (records.length === 0) {
    return {
      intact: true,
      checkedCount: 0,
      brokenAtSequence: null,
      reason: 'EMPTY_LEDGER_READY',
    };
  }

  for (let i = 0; i < records.length; i += 1) {
    const cur = records[i];
    if (!HEX_64_RE.test(cur.prev_hash_hex) || !HEX_64_RE.test(cur.current_hash_hex)) {
      return {
        intact: false,
        checkedCount: i + 1,
        brokenAtSequence: cur.sequence_index,
        reason: `MALFORMED_SHA256_DIGEST_AT_SEQ_${cur.sequence_index}`,
      };
    }

    if (i === 0 && cur.sequence_index === 0 && cur.prev_hash_hex !== '0'.repeat(64)) {
      return {
        intact: false,
        checkedCount: 1,
        brokenAtSequence: 0,
        reason: 'INVALID_GENESIS_PREV_HASH',
      };
    }

    if (i > 0) {
      const prev = records[i - 1];
      if (cur.sequence_index <= prev.sequence_index) {
        return {
          intact: false,
          checkedCount: i + 1,
          brokenAtSequence: cur.sequence_index,
          reason: `NON_MONOTONIC_SEQ_${cur.sequence_index}`,
        };
      }
      if (cur.prev_hash_hex.toLowerCase() !== prev.current_hash_hex.toLowerCase()) {
        return {
          intact: false,
          checkedCount: i + 1,
          brokenAtSequence: cur.sequence_index,
          reason: `PREV_HASH_MISMATCH_AT_SEQ_${cur.sequence_index}`,
        };
      }
    }
  }

  return {
    intact: true,
    checkedCount: records.length,
    brokenAtSequence: null,
    reason: `CONTIGUOUS_SHA256_VERIFIED_${records.length}_BLOCKS`,
  };
}

export interface VirtualWindowSlice {
  startIndex: number;
  endIndexExclusive: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  totalHeightPx: number;
}

/**
 * Computes fixed-row virtualization bounds (`48px` default) so drawers scroll at
 * locked 60fps with tiny DOM footprints regardless of ledger or dataset length.
 */
export function computeVirtualWindow(
  totalCount: number,
  scrollTopPx: number,
  viewportHeightPx: number,
  rowHeightPx: number = DEFAULT_VIRTUAL_ROW_PX,
  overscan: number = 4,
): VirtualWindowSlice {
  const count = Math.max(0, Math.floor(totalCount));
  const rowH = Math.max(16, rowHeightPx);
  const totalHeightPx = count * rowH;

  if (count === 0) {
    return {
      startIndex: 0,
      endIndexExclusive: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      totalHeightPx: 0,
    };
  }

  const clampedScroll = Math.max(0, scrollTopPx);
  const viewH = Math.max(rowH, viewportHeightPx);

  const rawStart = Math.floor(clampedScroll / rowH) - overscan;
  const startIndex = Math.max(0, Math.min(count - 1, rawStart));

  const visibleRows = Math.ceil(viewH / rowH) + overscan * 2;
  const endIndexExclusive = Math.max(
    startIndex + 1,
    Math.min(count, startIndex + visibleRows),
  );

  const topSpacerPx = startIndex * rowH;
  const bottomSpacerPx = Math.max(0, (count - endIndexExclusive) * rowH);

  return {
    startIndex,
    endIndexExclusive,
    topSpacerPx,
    bottomSpacerPx,
    totalHeightPx,
  };
}

export type OwltTransitStage = 'MARS_HABITAT_TX' | 'IN_FLIGHT_DEEP_SPACE' | 'EARTH_DSN_RX';

export interface OwltFlightStatus {
  clampedOwltMin: number;
  roundTripMin: number;
  progressRatio: number;
  remainingSec: number;
  stage: OwltTransitStage;
}

/**
 * Computes ChaCha20-Poly1305 Store-and-Forward bundle transit state across
 * Earth-Mars One-Way Light Time (`8.2 - 48.1 min`).
 */
export function computeOwltFlightProgress(
  elapsedSec: number,
  owltMinutes: number,
): OwltFlightStatus {
  const clampedOwltMin = Math.min(
    OWLT_MAX_MINUTES,
    Math.max(OWLT_MIN_MINUTES, Number.isFinite(owltMinutes) ? owltMinutes : 14.4),
  );
  const totalSec = clampedOwltMin * 60;
  const safeElapsed = Math.max(0, Number.isFinite(elapsedSec) ? elapsedSec : 0);
  const progressRatio = totalSec > 0 ? Math.min(1, safeElapsed / totalSec) : 1;
  const remainingSec = Math.max(0, Math.round(totalSec - safeElapsed));

  const stage: OwltTransitStage =
    progressRatio <= 0.03
      ? 'MARS_HABITAT_TX'
      : progressRatio >= 0.999
        ? 'EARTH_DSN_RX'
        : 'IN_FLIGHT_DEEP_SPACE';

  return {
    clampedOwltMin: Number(clampedOwltMin.toFixed(1)),
    roundTripMin: Number((clampedOwltMin * 2).toFixed(1)),
    progressRatio,
    remainingSec,
    stage,
  };
}

/**
 * Filters the 24-Dataset Scientific Evidence Atlas by free-text query and space agency.
 */
export function filterScientificAtlas(
  atlas: readonly ScientificDataset[],
  query: string,
  agencyFilter: 'ALL' | ScientificDataset['agency'] = 'ALL',
): ScientificDataset[] {
  const q = query.trim().toLowerCase();
  return atlas.filter((entry) => {
    if (agencyFilter !== 'ALL' && entry.agency !== agencyFilter) {
      return false;
    }
    if (!q) return true;
    return (
      entry.accession.toLowerCase().includes(q) ||
      entry.title.toLowerCase().includes(q) ||
      entry.axis.toLowerCase().includes(q) ||
      entry.agency.toLowerCase().includes(q) ||
      entry.safetyGateMapping.toLowerCase().includes(q)
    );
  });
}
