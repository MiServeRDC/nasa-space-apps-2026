// Pre-allocated zero-GC circular ring buffer for 20 Hz biomedical telemetry streaming
// and O(log N) deterministic scrubbing in OpenScreenStudio.
// Enforces Issue #11: missing or unavailable channels use Number.NaN sentinels and
// are NEVER coerced to 0 or interpolated across dropout gaps.

import type { TelemetryFrame } from '../types/telemetry';

export const DEFAULT_RING_CAPACITY = 2400; // 120 seconds at 20 Hz

export interface RawRingSampleInput {
  timestampS: number;
  hrBpm?: number | null;
  pulseBpm?: number | null;
  spo2Pct?: number | null;
  respBrpm?: number | null;
  rmssdMs?: number | null;
  hrvUnavailable?: boolean;
  sqiScore?: number | null;
  ijvShearDynCm2?: number | null;
  onsdMm?: number | null;
  sclerostinPmolL?: number | null;
  rhoMin?: number | null;
  mriScore?: number | null;
  radiationMsvD?: number | null;
}

export interface RingSampleView {
  timestampS: number;
  hrBpm: number;
  pulseBpm: number;
  spo2Pct: number;
  respBrpm: number;
  rmssdMs: number;
  sqiScore: number;
  ijvShearDynCm2: number;
  onsdMm: number;
  sclerostinPmolL: number;
  rhoMin: number;
  mriScore: number;
  radiationMsvD: number;
}

export interface RingBracketResult {
  lowerRingIndex: number;
  upperRingIndex: number;
  alpha: number;
}

export interface SampleQueryOptions {
  interpolate?: boolean;
  /** Maximum gap (seconds) across which continuous finite samples may be linearly interpolated. */
  maxGapSec?: number;
}

function toFiniteOrNaN(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

/** Converts a ring-buffer Float32 value back to `number | null` without coercing NaN to 0. */
export function ringValueToNullable(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function lerpPreservingNaN(a: number, b: number, alpha: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.NaN;
  }
  if (alpha <= 0) return a;
  if (alpha >= 1) return b;
  return a + (b - a) * alpha;
}

export function createEmptyRingSampleView(): RingSampleView {
  return {
    timestampS: Number.NaN,
    hrBpm: Number.NaN,
    pulseBpm: Number.NaN,
    spo2Pct: Number.NaN,
    respBrpm: Number.NaN,
    rmssdMs: Number.NaN,
    sqiScore: Number.NaN,
    ijvShearDynCm2: Number.NaN,
    onsdMm: Number.NaN,
    sclerostinPmolL: Number.NaN,
    rhoMin: Number.NaN,
    mriScore: Number.NaN,
    radiationMsvD: Number.NaN,
  };
}

export class TelemetryRingBuffer {
  public readonly capacity: number;
  public readonly timestampsS: Float64Array;
  public readonly hrBpm: Float32Array;
  public readonly pulseBpm: Float32Array;
  public readonly spo2Pct: Float32Array;
  public readonly respBrpm: Float32Array;
  public readonly rmssdMs: Float32Array;
  public readonly sqiScore: Float32Array;
  public readonly ijvShearDynCm2: Float32Array;
  public readonly onsdMm: Float32Array;
  public readonly sclerostinPmolL: Float32Array;
  public readonly rhoMin: Float32Array;
  public readonly mriScore: Float32Array;
  public readonly radiationMsvD: Float32Array;

  private writeCursor = 0;
  private sampleCount = 0;
  private lastAstronautId = '';

  public constructor(capacity: number = DEFAULT_RING_CAPACITY) {
    const safeCap = Math.max(2, Math.floor(capacity));
    this.capacity = safeCap;
    this.timestampsS = new Float64Array(safeCap).fill(Number.NaN);
    this.hrBpm = new Float32Array(safeCap).fill(Number.NaN);
    this.pulseBpm = new Float32Array(safeCap).fill(Number.NaN);
    this.spo2Pct = new Float32Array(safeCap).fill(Number.NaN);
    this.respBrpm = new Float32Array(safeCap).fill(Number.NaN);
    this.rmssdMs = new Float32Array(safeCap).fill(Number.NaN);
    this.sqiScore = new Float32Array(safeCap).fill(Number.NaN);
    this.ijvShearDynCm2 = new Float32Array(safeCap).fill(Number.NaN);
    this.onsdMm = new Float32Array(safeCap).fill(Number.NaN);
    this.sclerostinPmolL = new Float32Array(safeCap).fill(Number.NaN);
    this.rhoMin = new Float32Array(safeCap).fill(Number.NaN);
    this.mriScore = new Float32Array(safeCap).fill(Number.NaN);
    this.radiationMsvD = new Float32Array(safeCap).fill(Number.NaN);
  }

  public get length(): number {
    return this.sampleCount;
  }

  public clear(): void {
    this.writeCursor = 0;
    this.sampleCount = 0;
    this.timestampsS.fill(Number.NaN);
    this.hrBpm.fill(Number.NaN);
    this.pulseBpm.fill(Number.NaN);
    this.spo2Pct.fill(Number.NaN);
    this.respBrpm.fill(Number.NaN);
    this.rmssdMs.fill(Number.NaN);
    this.sqiScore.fill(Number.NaN);
    this.ijvShearDynCm2.fill(Number.NaN);
    this.onsdMm.fill(Number.NaN);
    this.sclerostinPmolL.fill(Number.NaN);
    this.rhoMin.fill(Number.NaN);
    this.mriScore.fill(Number.NaN);
    this.radiationMsvD.fill(Number.NaN);
  }

  public oldestRingIndex(): number {
    if (this.sampleCount === 0) return -1;
    return (this.writeCursor - this.sampleCount + this.capacity) % this.capacity;
  }

  public latestRingIndex(): number {
    if (this.sampleCount === 0) return -1;
    return (this.writeCursor - 1 + this.capacity) % this.capacity;
  }

  public oldestTimestampS(): number {
    const idx = this.oldestRingIndex();
    return idx >= 0 ? this.timestampsS[idx] : Number.NaN;
  }

  public latestTimestampS(): number {
    const idx = this.latestRingIndex();
    return idx >= 0 ? this.timestampsS[idx] : Number.NaN;
  }

  /**
   * Zero-GC scalar push into pre-allocated typed arrays.
   * Automatically resets ring monotonicity if replay loops back in time (> 0.5s rewind).
   */
  public pushSample(input: RawRingSampleInput): number {
    const tSec = input.timestampS;
    if (typeof tSec !== 'number' || !Number.isFinite(tSec)) {
      return -1;
    }

    if (this.sampleCount > 0) {
      const prevTime = this.latestTimestampS();
      if (tSec < prevTime - 0.5) {
        this.clear();
      } else if (tSec < prevTime) {
        // Clamp tiny jitter to preserve monotonic binary search invariant.
        return this.writeAtSlot(prevTime, input);
      }
    }

    return this.writeAtSlot(tSec, input);
  }

  private writeAtSlot(tSec: number, input: RawRingSampleInput): number {
    const idx = this.writeCursor;
    this.timestampsS[idx] = tSec;
    this.hrBpm[idx] = toFiniteOrNaN(input.hrBpm);
    this.pulseBpm[idx] = toFiniteOrNaN(input.pulseBpm);
    this.spo2Pct[idx] = toFiniteOrNaN(input.spo2Pct);
    this.respBrpm[idx] = toFiniteOrNaN(input.respBrpm);
    this.rmssdMs[idx] = input.hrvUnavailable ? Number.NaN : toFiniteOrNaN(input.rmssdMs);
    this.sqiScore[idx] = toFiniteOrNaN(input.sqiScore);
    this.ijvShearDynCm2[idx] = toFiniteOrNaN(input.ijvShearDynCm2);
    this.onsdMm[idx] = toFiniteOrNaN(input.onsdMm);
    this.sclerostinPmolL[idx] = toFiniteOrNaN(input.sclerostinPmolL);
    this.rhoMin[idx] = toFiniteOrNaN(input.rhoMin);
    this.mriScore[idx] = toFiniteOrNaN(input.mriScore);
    this.radiationMsvD[idx] = toFiniteOrNaN(input.radiationMsvD);

    this.writeCursor = (idx + 1) % this.capacity;
    if (this.sampleCount < this.capacity) {
      this.sampleCount += 1;
    }
    return idx;
  }

  /**
   * Pushes a full `TelemetryFrame` (`TelemetryPacket`) while preserving Issue #11
   * (`BEAT_INTERVALS_NOT_AVAILABLE` -> `NaN` RMSSD, missing channels -> `NaN`).
   */
  public pushTelemetryFrame(frame: TelemetryFrame): number {
    if (frame.astronaut_id && this.lastAstronautId && frame.astronaut_id !== this.lastAstronautId) {
      this.clear();
    }
    if (frame.astronaut_id) {
      this.lastAstronautId = frame.astronaut_id;
    }

    const beatIntervalsUnavailable =
      frame.biometrics.hrv_unavailable_reason === 'BEAT_INTERVALS_NOT_AVAILABLE' ||
      (Array.isArray(frame.biometrics.quality_flags) &&
        frame.biometrics.quality_flags.includes('BEAT_INTERVALS_NOT_AVAILABLE')) ||
      (Array.isArray(frame.quality_flags) &&
        frame.quality_flags.includes('BEAT_INTERVALS_NOT_AVAILABLE'));

    const tSec =
      typeof frame.relative_recording_time_s === 'number' &&
      Number.isFinite(frame.relative_recording_time_s)
        ? frame.relative_recording_time_s
        : frame.timestamp_ms / 1000;

    return this.pushSample({
      timestampS: tSec,
      hrBpm: frame.biometrics.heart_rate_bpm,
      pulseBpm: frame.biometrics.pulse_rate_bpm,
      spo2Pct: frame.biometrics.spo2_percent,
      respBrpm: frame.biometrics.respiration_rate_brpm,
      rmssdMs: frame.biometrics.hrv_rmssd_ms ?? null,
      hrvUnavailable: beatIntervalsUnavailable,
      sqiScore: frame.biometrics.sqi_score ?? null,
      ijvShearDynCm2: frame.hemodynamics?.wall_shear_stress_dyn_cm2 ?? null,
      onsdMm: frame.hemodynamics?.onsd_mm ?? null,
      sclerostinPmolL: frame.musculoskeletal?.sclerostin_pmol_l ?? null,
      rhoMin: frame.safety_margins.med_stl_rho_robustness,
      mriScore: frame.safety_margins.mission_readiness_index,
      radiationMsvD: frame.biometrics.radiation_dose_rate_msv_d ?? null,
    });
  }

  /**
   * O(log N) binary search returning the ring slot index closest to `targetTimeS`
   * (or `-1` if the buffer is empty).
   */
  public findIndexAtTime(targetTimeS: number): number {
    if (this.sampleCount === 0 || !Number.isFinite(targetTimeS)) {
      return -1;
    }
    const bracket = this.findBracketAtTime(targetTimeS);
    if (!bracket) return -1;
    return bracket.alpha >= 0.5 ? bracket.upperRingIndex : bracket.lowerRingIndex;
  }

  /**
   * O(log N) binary search returning the bracketing `[lowerRingIndex, upperRingIndex]`
   * and normalized interpolation factor `alpha in [0, 1]`.
   */
  public findBracketAtTime(targetTimeS: number): RingBracketResult | null {
    if (this.sampleCount === 0 || !Number.isFinite(targetTimeS)) {
      return null;
    }

    const oldest = this.oldestRingIndex();
    const newest = this.latestRingIndex();

    if (targetTimeS <= this.timestampsS[oldest] || this.sampleCount === 1) {
      return { lowerRingIndex: oldest, upperRingIndex: oldest, alpha: 0 };
    }
    if (targetTimeS >= this.timestampsS[newest]) {
      return { lowerRingIndex: newest, upperRingIndex: newest, alpha: 0 };
    }

    let lo = 0;
    let hi = this.sampleCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midRing = (oldest + mid) % this.capacity;
      if (this.timestampsS[midRing] < targetTimeS) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    const upperLogical = lo;
    const lowerLogical = Math.max(0, upperLogical - 1);
    const lowerRingIndex = (oldest + lowerLogical) % this.capacity;
    const upperRingIndex = (oldest + upperLogical) % this.capacity;

    const tLo = this.timestampsS[lowerRingIndex];
    const tHi = this.timestampsS[upperRingIndex];
    const span = tHi - tLo;
    const alpha = span > 1e-9 ? Math.min(1, Math.max(0, (targetTimeS - tLo) / span)) : 0;

    return { lowerRingIndex, upperRingIndex, alpha };
  }

  /** Reads a slot directly into an optional pre-allocated `out` view (`0` allocations). */
  public readSampleAtIndex(
    ringIndex: number,
    out: RingSampleView = createEmptyRingSampleView(),
  ): RingSampleView | null {
    if (this.sampleCount === 0 || ringIndex < 0 || ringIndex >= this.capacity) {
      return null;
    }
    const ts = this.timestampsS[ringIndex];
    if (!Number.isFinite(ts)) {
      return null;
    }
    out.timestampS = ts;
    out.hrBpm = this.hrBpm[ringIndex];
    out.pulseBpm = this.pulseBpm[ringIndex];
    out.spo2Pct = this.spo2Pct[ringIndex];
    out.respBrpm = this.respBrpm[ringIndex];
    out.rmssdMs = this.rmssdMs[ringIndex];
    out.sqiScore = this.sqiScore[ringIndex];
    out.ijvShearDynCm2 = this.ijvShearDynCm2[ringIndex];
    out.onsdMm = this.onsdMm[ringIndex];
    out.sclerostinPmolL = this.sclerostinPmolL[ringIndex];
    out.rhoMin = this.rhoMin[ringIndex];
    out.mriScore = this.mriScore[ringIndex];
    out.radiationMsvD = this.radiationMsvD[ringIndex];
    return out;
  }

  /**
   * O(log N) historical / Studio scrub query.
   * When `interpolate` is enabled (default), interpolates continuous values ONLY when
   * both bracketing samples are finite and separated by `<= maxGapSec` (default `1.5s`).
   * Missing (`NaN`) intervals stay strictly `NaN` so Canvas2D lifts the pen honestly.
   */
  public sampleAtTime(
    targetTimeS: number,
    options: SampleQueryOptions = {},
    out: RingSampleView = createEmptyRingSampleView(),
  ): RingSampleView | null {
    const bracket = this.findBracketAtTime(targetTimeS);
    if (!bracket) return null;

    const { lowerRingIndex, upperRingIndex, alpha } = bracket;
    const interpolate = options.interpolate ?? true;
    const maxGapSec = options.maxGapSec ?? 1.5;

    if (!interpolate || lowerRingIndex === upperRingIndex) {
      const snapIdx = alpha >= 0.5 ? upperRingIndex : lowerRingIndex;
      return this.readSampleAtIndex(snapIdx, out);
    }

    const tLo = this.timestampsS[lowerRingIndex];
    const tHi = this.timestampsS[upperRingIndex];
    if (tHi - tLo > maxGapSec) {
      // Gap exceeds maxGapSec: do not bridge across missing recording windows.
      out.timestampS = targetTimeS;
      out.hrBpm = Number.NaN;
      out.pulseBpm = Number.NaN;
      out.spo2Pct = Number.NaN;
      out.respBrpm = Number.NaN;
      out.rmssdMs = Number.NaN;
      out.sqiScore = Number.NaN;
      out.ijvShearDynCm2 = Number.NaN;
      out.onsdMm = Number.NaN;
      out.sclerostinPmolL = Number.NaN;
      out.rhoMin = Number.NaN;
      out.mriScore = Number.NaN;
      out.radiationMsvD = Number.NaN;
      return out;
    }

    out.timestampS = tLo + (tHi - tLo) * alpha;
    out.hrBpm = lerpPreservingNaN(this.hrBpm[lowerRingIndex], this.hrBpm[upperRingIndex], alpha);
    out.pulseBpm = lerpPreservingNaN(
      this.pulseBpm[lowerRingIndex],
      this.pulseBpm[upperRingIndex],
      alpha,
    );
    out.spo2Pct = lerpPreservingNaN(
      this.spo2Pct[lowerRingIndex],
      this.spo2Pct[upperRingIndex],
      alpha,
    );
    out.respBrpm = lerpPreservingNaN(
      this.respBrpm[lowerRingIndex],
      this.respBrpm[upperRingIndex],
      alpha,
    );
    out.rmssdMs = lerpPreservingNaN(
      this.rmssdMs[lowerRingIndex],
      this.rmssdMs[upperRingIndex],
      alpha,
    );
    out.sqiScore = lerpPreservingNaN(
      this.sqiScore[lowerRingIndex],
      this.sqiScore[upperRingIndex],
      alpha,
    );
    out.ijvShearDynCm2 = lerpPreservingNaN(
      this.ijvShearDynCm2[lowerRingIndex],
      this.ijvShearDynCm2[upperRingIndex],
      alpha,
    );
    out.onsdMm = lerpPreservingNaN(this.onsdMm[lowerRingIndex], this.onsdMm[upperRingIndex], alpha);
    out.sclerostinPmolL = lerpPreservingNaN(
      this.sclerostinPmolL[lowerRingIndex],
      this.sclerostinPmolL[upperRingIndex],
      alpha,
    );
    out.rhoMin = lerpPreservingNaN(this.rhoMin[lowerRingIndex], this.rhoMin[upperRingIndex], alpha);
    out.mriScore = lerpPreservingNaN(
      this.mriScore[lowerRingIndex],
      this.mriScore[upperRingIndex],
      alpha,
    );
    out.radiationMsvD = lerpPreservingNaN(
      this.radiationMsvD[lowerRingIndex],
      this.radiationMsvD[upperRingIndex],
      alpha,
    );
    return out;
  }

  /** Zero-allocation chronological traversal from oldest sample to newest sample. */
  public forEachChronological(
    visitor: (ringIndex: number, logicalIndex: number) => void,
  ): void {
    if (this.sampleCount === 0) return;
    const oldest = this.oldestRingIndex();
    for (let i = 0; i < this.sampleCount; i += 1) {
      visitor((oldest + i) % this.capacity, i);
    }
  }
}

/** Shared cockpit singleton ring buffer (`2400` samples = `120s @ 20 Hz`). */
export const telemetryRingBuffer = new TelemetryRingBuffer(DEFAULT_RING_CAPACITY);

export function pushTelemetryFrameToRing(frame: TelemetryFrame): number {
  return telemetryRingBuffer.pushTelemetryFrame(frame);
}

export function queryTelemetryRingAtTime(
  targetTimeS: number,
  options?: SampleQueryOptions,
  out?: RingSampleView,
): RingSampleView | null {
  return telemetryRingBuffer.sampleAtTime(targetTimeS, options, out);
}
