// Procedurally rendered analysis imagery (air-gapped: no image files, no network).
// All frames are SIMULATED and driven by the deterministic scenario state, so they react to the What-If sliders.

import { useEffect, useRef } from 'react';
import { SQI_REJECT_THRESHOLD } from '../../lib/scenario';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 360, H = 260;

function inFan(x: number, y: number): boolean {
  // Linear-probe style trapezoid field of view.
  const top = 18, bottom = H - 8;
  if (y < top || y > bottom) return false;
  const k = (y - top) / (bottom - top);
  const half = 150 + 25 * k;
  return Math.abs(x - W / 2) < half;
}

function overlay(ctx: CanvasRenderingContext2D, lines: string[], tag: string) {
  ctx.font = '11px monospace';
  ctx.fillStyle = '#e5e7eb';
  lines.forEach((l, i) => ctx.fillText(l, 8, 14 + i * 13));
  ctx.fillStyle = '#6b7280';
  ctx.fillText(tag, W - ctx.measureText(tag).width - 8, H - 10);
  // depth scale, 1 cm ticks
  ctx.strokeStyle = '#9ca3af';
  for (let y = 30; y < H - 10; y += 40) {
    ctx.beginPath(); ctx.moveTo(W - 8, y); ctx.lineTo(W - 2, y); ctx.stroke();
  }
}

/** Simulated B-mode POCUS of the left internal jugular vein (transverse view) next to the carotid artery. */
export function PocusIjv({ csa, vmax, thrombus }: { csa: number; vmax: number; thrombus: boolean | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    const r = rng(7);
    const pxPerCm = 40;
    const ijvR = Math.sqrt(csa / Math.PI) * pxPerCm;
    const rx = ijvR * 1.35, ry = ijvR * 0.74; // flattened ellipse, same area
    const ijv = { x: 135, y: 120 };
    const cca = { x: 245, y: 140, r: 0.33 * pxPerCm };
    const smoke = Math.max(0, Math.min(1, (18 - vmax) / 16)); // spontaneous echo contrast at low velocity
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let v = 0;
        if (inFan(x, y)) {
          const speckle = r();
          v = 45 + 80 * speckle * speckle;
          if (y < 40) v += 60 * r(); // skin / subcutaneous layer
          if (Math.abs(y - 70 - 6 * Math.sin(x / 40)) < 4) v += 70; // SCM fascia
          const ex = (x - ijv.x) / rx, ey = (y - ijv.y) / ry, e = ex * ex + ey * ey;
          if (e < 1) v = 8 + smoke * 70 * r();
          else if (e < 1.15) v += 60;
          const dc = Math.hypot(x - cca.x, y - cca.y);
          if (dc < cca.r) v = 6;
          else if (dc < cca.r + 3) v += 90;
          if (thrombus === true && e < 0.35 && (ex + 0.3) * (ex + 0.3) + ey * ey * 1.6 < 0.3) v = 150 + 60 * r();
          v *= 1 - 0.35 * (y / H); // depth attenuation
        }
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = csa > 2.5 ? '#f43f5e' : '#22d3ee';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(ijv.x, ijv.y, rx + 3, ry + 3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#facc15'; ctx.fillText('IJV', ijv.x - 10, ijv.y - ry - 8);
    ctx.fillStyle = '#f43f5e'; ctx.fillText('CCA', cca.x - 10, cca.y - cca.r - 8);
    overlay(ctx, [`L-IJV TRANSVERSE`, `CSA ${csa.toFixed(2)} cm2`, `Vmax ${vmax.toFixed(1)} cm/s`,
      thrombus === true ? 'THROMBUS: CONFIRMED' : thrombus === false ? 'THROMBUS: ABSENT' : 'THROMBUS: NOT ASSESSED'],
      'SIMULATED B-MODE');
  }, [csa, vmax, thrombus]);
  return <canvas ref={ref} width={W} height={H} className="w-full rounded border border-line" />;
}

/** Simulated ocular ultrasound with optic nerve sheath diameter caliper 3 mm behind the globe. */
export function OcularOnsd({ onsd, sigma }: { onsd: number; sigma: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    const r = rng(11);
    const pxPerMm = 11;
    const globe = { x: W / 2, y: 70, r: 85 };
    const nerveTop = globe.y + globe.r - 6;
    const halfSheath = (onsd * pxPerMm) / 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let v = 0;
        if (inFan(x, y)) {
          const s = r();
          v = 40 + 85 * s * s;
          const d = Math.hypot(x - globe.x, y - globe.y);
          if (d < globe.r) v = 5 + 10 * r();
          else if (d < globe.r + 4) v += 110;
          if (y > nerveTop) {
            const dx = Math.abs(x - globe.x);
            if (dx < halfSheath * 0.55) v = 30 + 25 * r();
            else if (dx < halfSheath) v = 12 + 15 * r();
          }
          v *= 1 - 0.3 * (y / H);
        }
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const yCal = nerveTop + 3 * pxPerMm;
    const color = onsd > 5.8 ? '#f43f5e' : onsd > 5.4 ? '#facc15' : '#22d3ee';
    ctx.fillStyle = color + '33';
    const sPx = (sigma ?? 0) * pxPerMm;
    ctx.fillRect(globe.x - halfSheath - sPx, yCal - 3, 2 * (halfSheath + sPx), 6);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(globe.x - halfSheath, yCal); ctx.lineTo(globe.x + halfSheath, yCal); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(globe.x + halfSheath + 24, nerveTop); ctx.lineTo(globe.x + halfSheath + 24, yCal); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.font = '11px monospace';
    ctx.fillStyle = color;
    ctx.fillText(`${onsd.toFixed(2)} mm`, globe.x - halfSheath, yCal + 16);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('3 mm', globe.x + halfSheath + 28, (nerveTop + yCal) / 2 + 4);
    overlay(ctx, ['OCULAR / OPTIC NERVE', `ONSD ${onsd.toFixed(2)} mm`, sigma === null ? 'Uncertainty unavailable' : `+/- ${(1.96 * sigma).toFixed(2)} mm (95%)`], 'SIMULATED B-MODE');
  }, [onsd, sigma]);
  return <canvas ref={ref} width={W} height={H} className="w-full rounded border border-line" />;
}

/** Animated single-lead ECG visualizer with motion / sweat / ECLSS fan artifacts and spectral SQI gating.
 *  When `hr === null`, the waveform blanks cleanly instead of substituting a fake heart rate. */
export function EcgStrip({
  hr,
  artifact,
  sqi,
  isRecorded = false,
}: {
  hr: number | null;
  artifact: number;
  sqi: number;
  isRecorded?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const params = useRef({ hr, artifact, sqi, isRecorded });
  params.current = { hr, artifact, sqi, isRecorded };
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const EW = cv.width, EH = cv.height;
    const r = rng(3);
    let raf = 0;
    const g = (t: number, mu: number, s: number, a: number) => a * Math.exp(-((t - mu) ** 2) / (2 * s * s));
    const draw = (now: number) => {
      const { hr: h, artifact: a, sqi: q, isRecorded: rec } = params.current;
      const missingHr = h === null || !Number.isFinite(h) || h <= 0;
      const rejected = !missingHr && q < SQI_REJECT_THRESHOLD;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, EW, EH);
      ctx.strokeStyle = '#0f2a1a';
      for (let x = 0; x < EW; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, EH); ctx.stroke(); }
      for (let y = 0; y < EH; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(EW, y); ctx.stroke(); }
      if (rejected || missingHr) {
        ctx.fillStyle = missingHr ? 'rgba(250,204,21,0.08)' : 'rgba(244,63,94,0.12)';
        ctx.fillRect(0, 0, EW, EH);
      }

      ctx.strokeStyle = missingHr ? '#facc15' : rejected ? '#f43f5e' : '#4ade80';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (missingHr) {
        const y = EH * 0.65;
        ctx.moveTo(0, y);
        ctx.lineTo(EW, y);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#facc15';
        const unavailableText = 'Heart rate unavailable';
        ctx.fillText(unavailableText, (EW - ctx.measureText(unavailableText).width) / 2, EH * 0.45);
      } else {
        const period = 60 / h;
        const secondsShown = 4;
        const t0 = now / 1000;
        for (let x = 0; x < EW; x++) {
          const t = t0 - secondsShown + (x / EW) * secondsShown;
          const ph = ((t % period) + period) % period / period;
          let v = g(ph, 0.18, 0.025, 0.15) + g(ph, 0.37, 0.01, -0.15) + g(ph, 0.4, 0.012, 1.0) + g(ph, 0.43, 0.01, -0.25) + g(ph, 0.68, 0.045, 0.3);
          v += a * (0.35 * Math.sin(2 * Math.PI * 0.3 * t) + 0.12 * Math.sin(2 * Math.PI * 47 * t) + 0.5 * (r() - 0.5));
          const y = EH * 0.65 - v * EH * 0.45;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.font = '12px monospace';
      ctx.fillStyle = missingHr ? '#facc15' : rejected ? '#f43f5e' : '#4ade80';
      const statusText = missingHr
        ? 'ECG HR MISSING - WAVEFORM BLANKED (NEVER COERCED TO 0)'
        : `ECG LEAD II   SQI ${q.toFixed(2)}   ${rejected ? 'SAMPLE REJECTED (SQI < 0.60)' : `ACCEPTED (HR ${h.toFixed(0)} BPM)`}`;
      ctx.fillText(statusText, 8, 16);
      ctx.fillStyle = '#6b7280';
      const tag = rec ? 'SYNTHETIC VISUALIZER (RECORDED HR)' : 'SIMULATED';
      ctx.fillText(tag, EW - ctx.measureText(tag).width - 8, EH - 8);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      width={720}
      height={150}
      role="img"
      aria-label="Synthetic ECG illustration driven by heart rate"
      className="monitor-trace w-full rounded border border-line"
    />
  );
}
