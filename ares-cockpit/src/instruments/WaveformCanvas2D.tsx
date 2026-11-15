// Zero-GC 20 Hz scrolling Canvas2D biomedical strip (`WaveformCanvas2D`).
// Reads directly from `TelemetryRingBuffer` inside `requestAnimationFrame` with zero React state
// ticks, DPR-locked (`<= 2x`) `ResizeObserver` sizing, clean `ctx.moveTo` pen-lifts across `NaN`
// dropouts, and a pre-baked `8x8` diagonal amber `DROPOUT` hatch band (Issue #11).

import React, { useEffect, useRef } from 'react';
import {
  telemetryRingBuffer,
  type TelemetryRingBuffer,
} from '../stores/telemetryRingBuffer';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useStudioTimelineStore } from '../stores/studioTimelineStore';
import {
  prefersReducedMotionSafe,
  segmentWaveformWithDropouts,
  snapHalfPixel,
} from './instrumentMath';

export type RingWaveformChannel =
  | 'hrBpm'
  | 'pulseBpm'
  | 'spo2Pct'
  | 'respBrpm'
  | 'ijvShearDynCm2'
  | 'rhoMin';

export interface WaveformChannelRange {
  min: number;
  max: number;
  threshold?: number | null;
  strokeHex: string;
  unit: string;
  label: string;
}

export const WAVEFORM_CHANNEL_PRESETS: Readonly<
  Record<RingWaveformChannel, WaveformChannelRange>
> = {
  hrBpm: {
    min: 40,
    max: 150,
    threshold: 115,
    strokeHex: '#10b981',
    unit: 'bpm',
    label: 'ECG HR',
  },
  pulseBpm: {
    min: 40,
    max: 150,
    threshold: 115,
    strokeHex: '#22d3ee',
    unit: 'bpm',
    label: 'PPG PULSE',
  },
  spo2Pct: {
    min: 84,
    max: 100,
    threshold: 92,
    strokeHex: '#38bdf8',
    unit: '%',
    label: 'SpO2',
  },
  respBrpm: {
    min: 6,
    max: 34,
    threshold: 26,
    strokeHex: '#a78bfa',
    unit: 'br/m',
    label: 'RESP',
  },
  ijvShearDynCm2: {
    min: 0,
    max: 6,
    threshold: 1.2,
    strokeHex: '#f59e0b',
    unit: 'dyn/cm2',
    label: 'IJV TAU_W',
  },
  rhoMin: {
    min: -0.6,
    max: 1.0,
    threshold: 0,
    strokeHex: '#22d3ee',
    unit: 'rho',
    label: 'NQS-STL RHO',
  },
};

export interface WaveformCanvas2DProps {
  channel?: RingWaveformChannel;
  ringBuffer?: TelemetryRingBuffer;
  windowSec?: number;
  heightPx?: number;
  minOverride?: number;
  maxOverride?: number;
  strokeColor?: string;
  ariaLabel?: string;
  className?: string;
}

function createDiagonalDropoutPattern(
  ctx: CanvasRenderingContext2D,
): CanvasPattern | null {
  if (typeof document === 'undefined') return null;
  const tile = document.createElement('canvas');
  tile.width = 8;
  tile.height = 8;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  tctx.fillStyle = 'rgba(245, 158, 11, 0.07)';
  tctx.fillRect(0, 0, 8, 8);
  tctx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
  tctx.lineWidth = 1;
  tctx.beginPath();
  tctx.moveTo(-2, 8);
  tctx.lineTo(8, -2);
  tctx.moveTo(0, 10);
  tctx.lineTo(10, 0);
  tctx.stroke();

  return ctx.createPattern(tile, 'repeat');
}

export function WaveformCanvas2D({
  channel = 'hrBpm',
  ringBuffer = telemetryRingBuffer,
  windowSec = 24,
  heightPx = 68,
  minOverride,
  maxOverride,
  strokeColor,
  ariaLabel,
  className = '',
}: WaveformCanvas2DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const hostEl = hostRef.current;
    const canvasEl = canvasRef.current;
    if (!hostEl || !canvasEl || typeof window === 'undefined') return;

    const ctx = canvasEl.getContext('2d', { alpha: true });
    if (!ctx) return;

    const preset = WAVEFORM_CHANNEL_PRESETS[channel];
    const minVal = minOverride ?? preset.min;
    const maxVal = maxOverride ?? preset.max;
    const lineHex = strokeColor ?? preset.strokeHex;
    const dropoutPattern = createDiagonalDropoutPattern(ctx);

    let cssW = Math.max(120, hostEl.clientWidth || 260);
    let cssH = Math.max(40, heightPx);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const syncBackingSize = (): void => {
      cssW = Math.max(120, hostEl.clientWidth || 260);
      cssH = Math.max(40, heightPx);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round(cssH * dpr);
      if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
        canvasEl.width = targetW;
        canvasEl.height = targetH;
      }
    };

    syncBackingSize();

    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        syncBackingSize();
      });
      resizeObs.observe(hostEl);
    }

    let rafId = 0;
    let lastPaintMs = 0;

    const renderStrip = (nowMs: number): void => {
      const reducedMotion = prefersReducedMotionSafe();
      // Under prefers-reduced-motion, throttle static redraws to 4 Hz
      if (reducedMotion && nowMs - lastPaintMs < 250) {
        rafId = window.requestAnimationFrame(renderStrip);
        return;
      }
      lastPaintMs = nowMs;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const padTop = 6;
      const padBottom = 6;
      const plotH = Math.max(12, cssH - padTop - padBottom);

      // Subtle tactical baseline grid (3 horizontal hairlines)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      for (const frac of [0.2, 0.5, 0.8]) {
        const y = snapHalfPixel(padTop + plotH * frac);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
        ctx.stroke();
      }

      // Safety threshold hairline when within range
      if (
        typeof preset.threshold === 'number' &&
        preset.threshold >= minVal &&
        preset.threshold <= maxVal
      ) {
        const normT = (preset.threshold - minVal) / Math.max(1e-6, maxVal - minVal);
        const yThresh = snapHalfPixel(padTop + plotH * (1 - normT));
        ctx.save();
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.34)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, yThresh);
        ctx.lineTo(cssW, yThresh);
        ctx.stroke();
        ctx.restore();
      }

      const wb = useWorkbenchStore.getState();
      const st = useStudioTimelineStore.getState();
      const refLatest =
        wb.studioBarOpen && Number.isFinite(st.t) && ringBuffer.length > 0
          ? ringBuffer.oldestTimestampS() + st.t
          : undefined;

      const channelArray = ringBuffer[channel];
      const segmented = segmentWaveformWithDropouts({
        timestampsS: ringBuffer.timestampsS,
        values: channelArray,
        oldestIndex: ringBuffer.oldestRingIndex(),
        sampleCount: ringBuffer.length,
        capacity: ringBuffer.capacity,
        windowSec,
        referenceLatestTimeS: refLatest,
        minValue: minVal,
        maxValue: maxVal,
      });

      // Render pre-baked diagonal amber hatch across NaN / gap dropouts (never draw 0-flatline)
      for (let i = 0; i < segmented.dropoutSpans.length; i += 1) {
        const span = segmented.dropoutSpans[i];
        const x0 = Math.floor(span.startRatio * cssW);
        const w = Math.max(3, Math.ceil((span.endRatio - span.startRatio) * cssW));
        ctx.fillStyle = dropoutPattern ?? 'rgba(245, 158, 11, 0.14)';
        ctx.fillRect(x0, padTop, w, plotH);

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(snapHalfPixel(x0), padTop);
        ctx.lineTo(snapHalfPixel(x0), padTop + plotH);
        ctx.stroke();

        if (w >= 46) {
          ctx.font = '600 9px "Geist Mono Variable", monospace';
          ctx.fillStyle = 'rgba(245, 158, 11, 0.92)';
          ctx.fillText('DROPOUT', x0 + 4, padTop + 11);
        }
      }

      // Render pen-lifted continuous waveform segments (`moveTo` on each segment start)
      ctx.strokeStyle = lineHex;
      ctx.lineWidth = 1.65;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      let lastHeadX = Number.NaN;
      let lastHeadY = Number.NaN;

      for (let s = 0; s < segmented.segments.length; s += 1) {
        const seg = segmented.segments[s];
        if (seg.length === 0) continue;

        ctx.beginPath();
        for (let p = 0; p < seg.length; p += 1) {
          const pt = seg[p];
          const px = pt.xRatio * cssW;
          const py = padTop + pt.yRatio * plotH;
          if (p === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
          lastHeadX = px;
          lastHeadY = py;
        }
        if (seg.length === 1) {
          // Single isolated sample dot so sparse 1 Hz ticks remain visible without false lines
          ctx.arc(lastHeadX, lastHeadY, 1.5, 0, Math.PI * 2);
        }
        ctx.stroke();
      }

      // Live sweep playhead beacon at newest finite sample
      if (Number.isFinite(lastHeadX) && Number.isFinite(lastHeadY)) {
        ctx.fillStyle = lineHex;
        ctx.beginPath();
        ctx.arc(lastHeadX, lastHeadY, 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (ringBuffer.length === 0) {
        ctx.font = '500 10px "Geist Mono Variable", monospace';
        ctx.fillStyle = 'rgba(146, 150, 160, 0.85)';
        ctx.fillText('AWAITING TELEMETRY RING SAMPLES...', 8, padTop + plotH * 0.54);
      }

      ctx.restore();
      rafId = window.requestAnimationFrame(renderStrip);
    };

    rafId = window.requestAnimationFrame(renderStrip);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObs?.disconnect();
    };
  }, [channel, heightPx, maxOverride, minOverride, ringBuffer, strokeColor, windowSec]);

  const preset = WAVEFORM_CHANNEL_PRESETS[channel];

  return (
    <div
      ref={hostRef}
      className={`ares-inner-well relative w-full overflow-hidden px-2 py-1.5 ${className}`.trim()}
      role="img"
      aria-label={
        ariaLabel ??
        `${preset.label} real-time scrolling waveform (${windowSec}s window, ${preset.unit})`
      }
    >
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-wider text-[var(--color-ink-meta)]">
        <span>{preset.label}</span>
        <span>
          WINDOW {windowSec}S | {preset.unit}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="block w-full select-none"
        style={{ height: `${heightPx}px` }}
      />
    </div>
  );
}
