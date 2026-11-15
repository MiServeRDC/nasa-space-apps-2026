// Pure zero-DOM-allocation math, formatting, quantile monotonicity, waveform dropout
// segmentation, and NotebookLM Risk 1 font-readiness gate for `src/instruments/*`.
// Zero runtime relative imports so `node --test --experimental-strip-types` can import directly.

import type {
  AbstentionCertificate,
  ConformalGateStatus,
  MonotoneQuantileTriplet,
} from '../types/telemetry';
import type { FontsReadyStatus } from '../types/workbench';

/** True Unicode mathematical minus (`U+2212`) matching tabular digit advance width (`1ch`). */
export const MATH_MINUS_CHAR = '\u2212';
/** Non-breaking space (`U+00A0`) reserving fixed `1ch` sign slot when value >= 0. */
export const SIGN_SLOT_SPACE = '\u00A0';

export interface FontSetLike {
  ready?: Promise<unknown>;
  load?: (fontSpec: string) => Promise<unknown>;
}

export interface FontsDocumentLike {
  fonts?: FontSetLike | null;
}

export interface FontsWindowLike {
  __ARES_FONTS_READY__?: Promise<FontsReadyStatus>;
  matchMedia?: (query: string) => { matches: boolean };
}

export interface WaitForFontsOptions {
  timeoutMs?: number;
  win?: FontsWindowLike | null;
  doc?: FontsDocumentLike | null;
}

/**
 * NotebookLM Risk 1 Mitigation:
 * Awaits local WOFF2 variable font lock (`Geist Variable` + `Geist Mono Variable` + `document.fonts.ready`)
 * bounded by `timeoutMs` (`1200ms` default) before GSAP `Flip.getState()` or Preloader Ignition
 * measures DOM bounding boxes, eliminating sub-pixel FLIP geometry drift.
 */
export async function waitForFontsReadyBounded(
  options: WaitForFontsOptions = {},
): Promise<FontsReadyStatus> {
  const timeoutMs = Math.max(50, options.timeoutMs ?? 1200);
  const win: FontsWindowLike | null =
    options.win !== undefined
      ? options.win
      : typeof window !== 'undefined'
        ? (window as unknown as FontsWindowLike)
        : null;

  if (win?.__ARES_FONTS_READY__) {
    try {
      return await win.__ARES_FONTS_READY__;
    } catch {
      return 'timeout_fallback';
    }
  }

  const doc: FontsDocumentLike | null =
    options.doc !== undefined
      ? options.doc
      : typeof document !== 'undefined'
        ? (document as unknown as FontsDocumentLike)
        : null;

  const fontSet = doc?.fonts;
  if (!fontSet) {
    return 'locked';
  }

  const loadTasks: Promise<unknown>[] = [];
  if (typeof fontSet.load === 'function') {
    loadTasks.push(
      fontSet.load('1rem "Geist Variable"').catch(() => null),
      fontSet.load('1rem "Geist Mono Variable"').catch(() => null),
    );
  }
  if (fontSet.ready) {
    loadTasks.push(fontSet.ready.catch(() => null));
  }

  if (loadTasks.length === 0) {
    return 'locked';
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<FontsReadyStatus>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve('timeout_fallback');
    }, timeoutMs);
  });

  const lockPromise = Promise.all(loadTasks).then((): FontsReadyStatus => 'locked');

  try {
    return await Promise.race([lockPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function prefersReducedMotionSafe(overrideWin?: FontsWindowLike | null): boolean {
  const win =
    overrideWin !== undefined
      ? overrideWin
      : typeof window !== 'undefined'
        ? (window as unknown as FontsWindowLike)
        : null;
  if (!win || typeof win.matchMedia !== 'function') {
    return false;
  }
  return Boolean(win.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Snaps integer pixel coordinates to `.5` sub-pixel center for crisp `1px` Retina strokes. */
export function snapHalfPixel(coordPx: number): number {
  if (!Number.isFinite(coordPx)) return 0.5;
  return Math.floor(coordPx) + 0.5;
}

export interface TabularFormatOptions {
  decimals?: number;
  alwaysShowPlus?: boolean;
  unavailableLabel?: string;
  unavailableReason?: string | null;
}

export interface FormattedTabularReadout {
  isAvailable: boolean;
  signChar: string;
  digitsText: string;
  combinedText: string;
  badgeReason: string | null;
}

/**
 * Formats a biomedical telemetry scalar with fixed `1ch` sign reservation (`\u2212` vs `+` / `\u00A0`)
 * and strict Issue #11 null/NaN honesty (NEVER coerces `null` or `NaN` to `0`).
 */
export function formatTabularReadout(
  value: number | null | undefined,
  options: TabularFormatOptions = {},
): FormattedTabularReadout {
  const decimals = Math.max(0, Math.min(6, Math.floor(options.decimals ?? 1)));
  const reason = options.unavailableReason ?? null;

  if (value === null || value === undefined || !Number.isFinite(value)) {
    if (reason === 'BEAT_INTERVALS_NOT_AVAILABLE') {
      return {
        isAvailable: false,
        signChar: SIGN_SLOT_SPACE,
        digitsText: options.unavailableLabel ?? 'UNAVAILABLE',
        combinedText: options.unavailableLabel ?? 'UNAVAILABLE (BEAT_INTERVALS_NOT_AVAILABLE)',
        badgeReason: 'BEAT_INTERVALS_NOT_AVAILABLE',
      };
    }
    const fallback = options.unavailableLabel ?? '--';
    return {
      isAvailable: false,
      signChar: SIGN_SLOT_SPACE,
      digitsText: fallback,
      combinedText: fallback,
      badgeReason: reason,
    };
  }

  const roundedAbs = Math.abs(value).toFixed(decimals);
  const effectivelyZero = Number(roundedAbs) === 0;
  const signChar = effectivelyZero
    ? SIGN_SLOT_SPACE
    : value < 0
      ? MATH_MINUS_CHAR
      : options.alwaysShowPlus
        ? '+'
        : SIGN_SLOT_SPACE;

  return {
    isAvailable: true,
    signChar,
    digitsText: roundedAbs,
    combinedText: `${signChar}${roundedAbs}`,
    badgeReason: null,
  };
}

export interface WaveformPoint2D {
  xRatio: number;
  yRatio: number;
  timestampS: number;
  value: number;
}

export interface DropoutBandSpan {
  startRatio: number;
  endRatio: number;
}

export interface SegmentedWaveformResult {
  segments: WaveformPoint2D[][];
  dropoutSpans: DropoutBandSpan[];
  minObserved: number | null;
  maxObserved: number | null;
  latestFiniteValue: number | null;
}

export interface WaveformSegmentationInput {
  timestampsS: ArrayLike<number>;
  values: ArrayLike<number>;
  oldestIndex: number;
  sampleCount: number;
  capacity: number;
  windowSec: number;
  referenceLatestTimeS?: number;
  minValue: number;
  maxValue: number;
  maxContinuousGapSec?: number;
}

/**
 * Partitions circular ring-buffer samples into pen-lifted polyline segments and
 * normalized `[startRatio, endRatio]` `NaN` / time-gap dropout spans.
 * Strictly preserves Issue #11: `NaN` values NEVER become `0` and NEVER bridge across dropouts.
 */
export function segmentWaveformWithDropouts(
  input: WaveformSegmentationInput,
): SegmentedWaveformResult {
  const {
    timestampsS,
    values,
    oldestIndex,
    sampleCount,
    capacity,
    windowSec,
    minValue,
    maxValue,
  } = input;
  const maxGapSec = Math.max(0.25, input.maxContinuousGapSec ?? 2.25);
  const safeWindow = Math.max(1, windowSec);
  const valueRange = Math.max(1e-6, maxValue - minValue);

  if (sampleCount <= 0 || capacity <= 0) {
    return {
      segments: [],
      dropoutSpans: [],
      minObserved: null,
      maxObserved: null,
      latestFiniteValue: null,
    };
  }

  const newestRingIdx = (oldestIndex + sampleCount - 1) % capacity;
  const latestTimeS =
    input.referenceLatestTimeS !== undefined && Number.isFinite(input.referenceLatestTimeS)
      ? input.referenceLatestTimeS
      : timestampsS[newestRingIdx];

  if (!Number.isFinite(latestTimeS)) {
    return {
      segments: [],
      dropoutSpans: [],
      minObserved: null,
      maxObserved: null,
      latestFiniteValue: null,
    };
  }

  const windowStartS = latestTimeS - safeWindow;
  const segments: WaveformPoint2D[][] = [];
  const dropoutSpans: DropoutBandSpan[] = [];

  let activeSegment: WaveformPoint2D[] | null = null;
  let activeDropoutStart: number | null = null;
  let lastFiniteTimeS = Number.NaN;
  let lastFiniteRatio = Number.NaN;
  let minObs = Number.POSITIVE_INFINITY;
  let maxObs = Number.NEGATIVE_INFINITY;
  let latestFinite: number | null = null;

  for (let i = 0; i < sampleCount; i += 1) {
    const ringIdx = (oldestIndex + i) % capacity;
    const t = timestampsS[ringIdx];
    if (!Number.isFinite(t) || t < windowStartS || t > latestTimeS + 1e-6) {
      continue;
    }

    const xRatio = Math.min(1, Math.max(0, (t - windowStartS) / safeWindow));
    const v = values[ringIdx];

    if (!Number.isFinite(v)) {
      if (activeSegment && activeSegment.length > 0) {
        segments.push(activeSegment);
        activeSegment = null;
      }
      if (activeDropoutStart === null) {
        activeDropoutStart = Number.isFinite(lastFiniteRatio) ? lastFiniteRatio : xRatio;
      }
      continue;
    }

    // Close any open NaN dropout span at the resumption of valid data
    if (activeDropoutStart !== null) {
      const endR = Math.max(activeDropoutStart + 0.008, xRatio);
      dropoutSpans.push({
        startRatio: Math.max(0, activeDropoutStart),
        endRatio: Math.min(1, endR),
      });
      activeDropoutStart = null;
    } else if (Number.isFinite(lastFiniteTimeS) && t - lastFiniteTimeS > maxGapSec) {
      // Explicit time-gap pen lift + dropout hatch
      if (activeSegment && activeSegment.length > 0) {
        segments.push(activeSegment);
        activeSegment = null;
      }
      if (Number.isFinite(lastFiniteRatio)) {
        dropoutSpans.push({
          startRatio: Math.max(0, lastFiniteRatio),
          endRatio: Math.min(1, xRatio),
        });
      }
    }

    if (v < minObs) minObs = v;
    if (v > maxObs) maxObs = v;
    latestFinite = v;

    const clampedNorm = Math.min(1, Math.max(0, (v - minValue) / valueRange));
    const yRatio = 1 - clampedNorm;

    if (!activeSegment) {
      activeSegment = [];
    }
    activeSegment.push({
      xRatio,
      yRatio,
      timestampS: t,
      value: v,
    });

    lastFiniteTimeS = t;
    lastFiniteRatio = xRatio;
  }

  if (activeSegment && activeSegment.length > 0) {
    segments.push(activeSegment);
  }
  if (activeDropoutStart !== null) {
    dropoutSpans.push({
      startRatio: Math.max(0, activeDropoutStart),
      endRatio: 1,
    });
  }

  return {
    segments,
    dropoutSpans,
    minObserved: Number.isFinite(minObs) ? minObs : null,
    maxObserved: Number.isFinite(maxObs) ? maxObs : null,
    latestFiniteValue: latestFinite,
  };
}

export interface HorizonQuantileInputPoint {
  horizonSec: number;
  label: string;
  q05: number;
  q50: number;
  q95: number;
  empiricalGhostQ50?: number | null;
}

export interface NormalizedQuantileFanVertex {
  horizonSec: number;
  label: string;
  xi: number;
  q05: number;
  q50: number;
  q95: number;
  y05Ratio: number;
  y50Ratio: number;
  y95Ratio: number;
  ghostY50Ratio: number | null;
}

export interface NormalizedQuantileFanModel {
  vertices: NormalizedQuantileFanVertex[];
  yMin: number;
  yMax: number;
  safetyThresholdYRatio: number | null;
  gateStatus: ConformalGateStatus | 'WARMING_UP_60S_120S';
  abstained: boolean;
  certificateSummary: string;
}

/**
 * Enforces strict non-crossing monotonicity (`q05 <= q50 <= q95`) per `ares-nqs-stl`
 * and `MODEL_EVIDENCE_AUDIT.md`, clamping minor numerical inversions around the median `q50`.
 */
export function clampMonotoneTriplet(
  rawQ05: number,
  rawQ50: number,
  rawQ95: number,
): MonotoneQuantileTriplet | null {
  if (!Number.isFinite(rawQ05) || !Number.isFinite(rawQ50) || !Number.isFinite(rawQ95)) {
    return null;
  }
  const q50 = rawQ50;
  const q05 = Math.min(rawQ05, q50);
  const q95 = Math.max(q50, rawQ95);
  return { q05, q50, q95 };
}

/**
 * Logarithmic horizon transform mapping hybrid short (`0..120s`) + long (`900..86400s`)
 * forecast points smoothly onto `[0, 1]`.
 */
export function computeHybridConeXi(horizonSec: number, maxHorizonSec = 86400): number {
  const safeMax = Math.max(60, maxHorizonSec);
  const clamped = Math.max(0, Math.min(safeMax, Number.isFinite(horizonSec) ? horizonSec : 0));
  const tau0 = safeMax <= 300 ? 15 : 900;
  return Math.log(1 + clamped / tau0) / Math.log(1 + safeMax / tau0);
}

export function buildNormalizedQuantileFan(
  points: readonly HorizonQuantileInputPoint[],
  options: {
    safetyThreshold?: number | null;
    certificate?: AbstentionCertificate | null;
    gateStatus?: ConformalGateStatus | 'WARMING_UP_60S_120S';
    paddingFraction?: number;
  } = {},
): NormalizedQuantileFanModel {
  const validRaw: Array<{
    horizonSec: number;
    label: string;
    triplet: MonotoneQuantileTriplet;
    ghost: number | null;
  }> = [];

  for (const pt of points) {
    const triplet = clampMonotoneTriplet(pt.q05, pt.q50, pt.q95);
    if (!triplet) continue;
    validRaw.push({
      horizonSec: Math.max(0, pt.horizonSec),
      label: pt.label,
      triplet,
      ghost:
        typeof pt.empiricalGhostQ50 === 'number' && Number.isFinite(pt.empiricalGhostQ50)
          ? pt.empiricalGhostQ50
          : null,
    });
  }

  validRaw.sort((a, b) => a.horizonSec - b.horizonSec);

  const cert = options.certificate ?? null;
  const resolvedStatus: ConformalGateStatus | 'WARMING_UP_60S_120S' =
    options.gateStatus ??
    cert?.status ??
    (validRaw.length > 0 ? 'HEURISTIC_GATE_ACCEPTED' : 'WARMING_UP_60S_120S');

  const abstained =
    cert?.abstained === true ||
    resolvedStatus === 'ABSTAINED_FALLBACK_DETERMINISTIC' ||
    resolvedStatus === 'WARMING_UP_60S_120S';

  const certificateSummary = cert
    ? `${resolvedStatus} | alpha_t=${cert.adaptive_alpha_t.toFixed(3)} | SQI=${cert.sqi_score.toFixed(2)} | ${cert.reason}`
    : resolvedStatus === 'WARMING_UP_60S_120S'
      ? 'WARMING_UP_60S_120S | Collecting empirical residual window (60-120s)'
      : abstained
        ? 'ABSTAINED_FALLBACK_DETERMINISTIC | Reverted to deterministic ODE baseline'
        : 'HEURISTIC_GATE_ACCEPTED | Adaptive conformal coverage within tolerance';

  if (validRaw.length === 0) {
    return {
      vertices: [],
      yMin: -1,
      yMax: 1,
      safetyThresholdYRatio: 0.5,
      gateStatus: resolvedStatus,
      abstained,
      certificateSummary,
    };
  }

  const maxH = Math.max(60, validRaw[validRaw.length - 1].horizonSec);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;

  for (const item of validRaw) {
    if (item.triplet.q05 < lo) lo = item.triplet.q05;
    if (item.triplet.q95 > hi) hi = item.triplet.q95;
    if (item.ghost !== null) {
      if (item.ghost < lo) lo = item.ghost;
      if (item.ghost > hi) hi = item.ghost;
    }
  }

  const threshold =
    options.safetyThreshold !== undefined ? options.safetyThreshold : 0;
  if (typeof threshold === 'number' && Number.isFinite(threshold)) {
    if (threshold < lo) lo = threshold;
    if (threshold > hi) hi = threshold;
  }

  const rawSpan = Math.max(0.2, hi - lo);
  const pad = rawSpan * (options.paddingFraction ?? 0.12);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const denom = Math.max(1e-6, yMax - yMin);

  const toYRatio = (v: number): number => 1 - Math.min(1, Math.max(0, (v - yMin) / denom));

  const vertices: NormalizedQuantileFanVertex[] = validRaw.map((item) => ({
    horizonSec: item.horizonSec,
    label: item.label,
    xi: computeHybridConeXi(item.horizonSec, maxH),
    q05: item.triplet.q05,
    q50: item.triplet.q50,
    q95: item.triplet.q95,
    y05Ratio: toYRatio(item.triplet.q05),
    y50Ratio: toYRatio(item.triplet.q50),
    y95Ratio: toYRatio(item.triplet.q95),
    ghostY50Ratio: item.ghost !== null ? toYRatio(item.ghost) : null,
  }));

  const safetyThresholdYRatio =
    typeof threshold === 'number' && Number.isFinite(threshold) ? toYRatio(threshold) : null;

  return {
    vertices,
    yMin,
    yMax,
    safetyThresholdYRatio,
    gateStatus: resolvedStatus,
    abstained,
    certificateSummary,
  };
}
