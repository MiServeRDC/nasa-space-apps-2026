// Screen-reader live-region dispatcher implementing NotebookLM Risk 5 mitigation:
// - 3000ms state-hysteresis spacing on #aria-polite-node
// - 5000ms identical-message deduplication window
// - 0ms immediate bypass on #aria-assertive-node for critical safety/interlock alerts
// - Forced DOM offsetHeight reflow before writing textContent so VoiceOver/NVDA trigger reliably
// - Safe no-op DOM guard when `typeof document === 'undefined'` in headless Node unit tests

import type { AlarmLevel } from '../types/telemetry';

export const POLITE_NODE_ID = 'aria-polite-node';
export const ASSERTIVE_NODE_ID = 'aria-assertive-node';

export const POLITE_HYSTERESIS_MS = 3000;
export const DEDUP_WINDOW_MS = 5000;

export interface MinimalLiveNode {
  textContent: string | null;
  readonly offsetHeight: number;
}

export interface MinimalDocumentLike {
  getElementById: (id: string) => MinimalLiveNode | null;
}

export interface LiveAnnouncementOptions {
  isAssertive?: boolean;
  /** Allows critical hardware re-triggers to bypass the 5000ms identical-string dedup filter. */
  forceRepeat?: boolean;
  /** Optional clock override (ms) for deterministic unit testing. */
  nowMs?: number;
  /** Optional document stub for headless Node testing of DOM reflow semantics. */
  doc?: MinimalDocumentLike | null;
}

export interface LiveAnnouncementResult {
  announced: boolean;
  nodeId: typeof POLITE_NODE_ID | typeof ASSERTIVE_NODE_ID;
  message: string;
  domUpdated: boolean;
  suppressedReason?: 'EMPTY_MESSAGE' | 'DEDUP_5000MS' | 'HYSTERESIS_3000MS';
}

let lastSpokenTimeMs = Number.NEGATIVE_INFINITY;
let lastSpokenMessage = '';

const channelSeverityState = new Map<string, AlarmLevel>();

function defaultNowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function resolveDocument(overrideDoc?: MinimalDocumentLike | null): MinimalDocumentLike | null {
  if (overrideDoc !== undefined) return overrideDoc;
  if (typeof document !== 'undefined') {
    return document as unknown as MinimalDocumentLike;
  }
  return null;
}

/**
 * Emits a hysteresis-throttled (`3000ms` polite / `0ms` assertive) and deduplicated (`5000ms`)
 * announcement to the persistent `#aria-polite-node` or `#aria-assertive-node` live regions.
 */
export function emitHysteresisAnnouncement(
  rawMessage: string,
  options: LiveAnnouncementOptions | boolean = false,
): LiveAnnouncementResult {
  const normalizedOptions: LiveAnnouncementOptions =
    typeof options === 'boolean' ? { isAssertive: options } : options;

  const isAssertive = Boolean(normalizedOptions.isAssertive);
  const nodeId = isAssertive ? ASSERTIVE_NODE_ID : POLITE_NODE_ID;
  const message = rawMessage.trim();

  if (message.length === 0) {
    return {
      announced: false,
      nodeId,
      message: '',
      domUpdated: false,
      suppressedReason: 'EMPTY_MESSAGE',
    };
  }

  const now = normalizedOptions.nowMs ?? defaultNowMs();

  if (
    !normalizedOptions.forceRepeat &&
    message === lastSpokenMessage &&
    now - lastSpokenTimeMs < DEDUP_WINDOW_MS
  ) {
    return {
      announced: false,
      nodeId,
      message,
      domUpdated: false,
      suppressedReason: 'DEDUP_5000MS',
    };
  }

  if (!isAssertive && now - lastSpokenTimeMs < POLITE_HYSTERESIS_MS) {
    return {
      announced: false,
      nodeId,
      message,
      domUpdated: false,
      suppressedReason: 'HYSTERESIS_3000MS',
    };
  }

  lastSpokenTimeMs = now;
  lastSpokenMessage = message;

  const doc = resolveDocument(normalizedOptions.doc);
  if (!doc) {
    return {
      announced: true,
      nodeId,
      message,
      domUpdated: false,
    };
  }

  const container = doc.getElementById(nodeId);
  if (!container) {
    return {
      announced: true,
      nodeId,
      message,
      domUpdated: false,
    };
  }

  // Clear first, force synchronous layout reflow via offsetHeight, then write textContent
  // so assistive technologies reliably re-announce repeated clinical states.
  container.textContent = '';
  void container.offsetHeight;
  container.textContent = message;

  return {
    announced: true,
    nodeId,
    message,
    domUpdated: true,
  };
}

export function announcePolite(
  message: string,
  options: Omit<LiveAnnouncementOptions, 'isAssertive'> = {},
): LiveAnnouncementResult {
  return emitHysteresisAnnouncement(message, { ...options, isAssertive: false });
}

export function announceAssertive(
  message: string,
  options: Omit<LiveAnnouncementOptions, 'isAssertive'> = {},
): LiveAnnouncementResult {
  return emitHysteresisAnnouncement(message, { ...options, isAssertive: true });
}

/**
 * Evaluates discrete alarm severity transitions with hysteresis filtering so
 * 20 Hz telemetry jitter never floods screen-reader queues.
 */
export function announceAlarmTransition(
  channelKey: string,
  nextLevel: AlarmLevel,
  summaryText: string,
  options: Omit<LiveAnnouncementOptions, 'isAssertive'> = {},
): LiveAnnouncementResult | null {
  const prevLevel = channelSeverityState.get(channelKey);
  if (prevLevel === nextLevel) {
    return null;
  }
  channelSeverityState.set(channelKey, nextLevel);

  // Suppress initial baseline registration if starting NOMINAL
  if (prevLevel === undefined && nextLevel === 'NOMINAL') {
    return null;
  }

  const isCritical = nextLevel === 'CRITICAL';
  return emitHysteresisAnnouncement(summaryText, {
    ...options,
    isAssertive: isCritical,
  });
}

export function resetA11yAnnouncerState(): void {
  lastSpokenTimeMs = Number.NEGATIVE_INFINITY;
  lastSpokenMessage = '';
  channelSeverityState.clear();
}
