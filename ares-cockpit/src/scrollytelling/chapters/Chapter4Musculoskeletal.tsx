// Chapter 4: Musculoskeletal & Bone Health.
// Left column: animated causal chain (0g soleus -> irisin -> sclerostin ->
// bone resorption -> nephrolithiasis).
// Right column: StlChart 14-day projection, TimestralQuantileConePanel,
// What-If ARED resistance training slider with real-time hemodynamic recompute.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { StlChart, TimestralQuantileConePanel } from '../../modules/mri-and-stl/MriAndStl';
import { useScrollyContext } from '../ScrollyContext';
import type { SafetyMargins, TelemetryPacket, TimestralQuantilesSummary } from '../../types/telemetry';
import type { WhatIf } from '../../lib/scenario';
import { clamp, evaluate } from '../../lib/scenario';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Causal chain node
// ---------------------------------------------------------------------------

interface CausalNode {
  id: string;
  label: string;
  sublabel?: string;
  status: 'nominal' | 'caution' | 'critical';
}

const CAUSAL_CHAIN: readonly CausalNode[] = [
  { id: 'soleus_unloading', label: '0g Soleus Unloading', sublabel: 'Atrophy 1-2% / week', status: 'critical' },
  { id: 'irisin_down', label: 'Irisin Downregulation', sublabel: 'Myokine reduction', status: 'caution' },
  { id: 'sclerostin_up', label: 'Sclerostin Elevation', sublabel: 'Osteocyte-derived Wnt inhibitor', status: 'caution' },
  { id: 'bone_resorption', label: 'Bone Resorption', sublabel: 'Up to 1-2% BMD/month', status: 'critical' },
  { id: 'nephrolithiasis', label: 'Nephrolithiasis Risk', sublabel: '250 mg Ca/d urinary excretion', status: 'critical' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Chapter4MusculoskeletalProps {
  packet: TelemetryPacket;
  whatIf: WhatIf;
  lastScanDay?: number;
  isPureReplay?: boolean;
  onWhatIfChange: (w: Partial<WhatIf>) => void;
}

// ---------------------------------------------------------------------------
// PanelCard
// ---------------------------------------------------------------------------

function PanelCard({ title, tag, children, className = '' }: { title: string; tag?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-l2)]">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-meta)]">{title}</h3>
        {tag && <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">{tag}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Status color
// ---------------------------------------------------------------------------

function statusColor(s: CausalNode['status']): string {
  switch (s) {
    case 'nominal': return 'var(--color-status-nominal)';
    case 'caution': return 'var(--color-status-caution)';
    case 'critical': return 'var(--color-status-critical)';
  }
}

// ---------------------------------------------------------------------------
// Chapter4Musculoskeletal
// ---------------------------------------------------------------------------

export function Chapter4Musculoskeletal({
  packet,
  whatIf,
  lastScanDay,
  isPureReplay,
  onWhatIfChange,
}: Chapter4MusculoskeletalProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveChapter(4),
        onEnterBack: () => setActiveChapter(4),
      });
    },
    { scope: sectionRef, dependencies: [setActiveChapter] },
  );

  // Derive recomputed What-If state when slider moves.
  const [aRedPct, setARedPct] = useState(whatIf.ared_load_pct);
  const handleARedSlider = (pct: number) => {
    setARedPct(pct);
    onWhatIfChange({ ared_load_pct: pct });
  };

  // Recompute scenario to show effect on MRI.
  const recomputed = evaluate(whatIf, 0);
  const ttvDays = packet.safety_margins?.ttv_most_likely_days ?? packet.safety_margins?.time_to_violation_days ?? null;
  const ttvBreachText =
    ttvDays !== null && ttvDays <= 36.0
      ? `TTV BREACH ${ttvDays.toFixed(1)} d`
      : ttvDays !== null
      ? `TTV ${ttvDays.toFixed(1)} d`
      : 'TTV —';

  return (
    <section
      ref={sectionRef}
      data-chapter="4"
      className="min-h-screen px-6 py-20 md:px-14"
      aria-labelledby="ch4-heading"
    >
      {/* Header */}
      <div className="mb-10 max-w-xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--color-ink-muted)] mb-2">
          Chapter 04 // Musculoskeletal &amp; Bone Health
        </p>
        <h2
          id="ch4-heading"
          className="font-sans text-3xl font-semibold tracking-tight text-[var(--color-ink-display)]"
        >
          Microgravity Bone & Muscle
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-[var(--color-ink-meta)] max-w-md">
          Causal pathway from soleus unloading to nephrolithiasis, with 14-day
          structural integrity projection and countermeasure simulation.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* LEFT: Animated causal chain */}
        <PanelCard title="Causal Chain: 0g Bone/Muscle Cascade" tag="EVIDENCE-BASED">
          <div className="relative flex flex-col gap-0">
            {CAUSAL_CHAIN.map((node, idx) => (
              <div key={node.id} className="relative flex gap-3">
                {/* Vertical connector */}
                {idx < CAUSAL_CHAIN.length - 1 && (
                  <div
                    className="absolute left-3.5 top-7 h-full w-px"
                    style={{ background: `linear-gradient(to bottom, ${statusColor(node.status)}, ${statusColor(CAUSAL_CHAIN[idx + 1].status)})`, opacity: 0.4 }}
                  />
                )}
                {/* Node dot */}
                <div
                  className="mt-1 h-7 w-7 shrink-0 rounded-full border-2 flex items-center justify-center font-mono text-[9px] font-bold"
                  style={{ borderColor: statusColor(node.status), color: statusColor(node.status) }}
                >
                  {idx + 1}
                </div>
                {/* Node content */}
                <div className="pb-5">
                  <p className="font-mono text-[11px] font-semibold" style={{ color: statusColor(node.status) }}>
                    {node.label}
                  </p>
                  {node.sublabel && (
                    <p className="font-sans text-[11px] text-[var(--color-ink-muted)] mt-0.5">{node.sublabel}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ARED What-If slider */}
          <div className="mt-4 rounded border border-[var(--color-border)] bg-[var(--color-surface-l2)] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
                ARED Resistance Load (What-If)
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-accent)]">
                {Math.round(aRedPct)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={aRedPct}
              onChange={(e) => handleARedSlider(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--color-accent)]"
              aria-label="ARED resistance training load percentage"
            />
            <div className="flex justify-between font-mono text-[9px] text-[var(--color-ink-muted)] mt-1">
              <span>0% — Deconditioning</span>
              <span>100% — Full Prescription</span>
            </div>
            {/* Recomputed hemodynamic impact */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded border border-[var(--color-border)] px-2 py-1">
                <span className="font-mono text-[9px] text-[var(--color-ink-muted)] block">SBP (est.)</span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-display)]">
                  {Math.round(recomputed.sbp ?? 120)} mmHg
                </span>
              </div>
              <div className="rounded border border-[var(--color-border)] px-2 py-1">
                <span className="font-mono text-[9px] text-[var(--color-ink-muted)] block">HR (est.)</span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-display)]">
                  {Math.round(recomputed.hr ?? 70)} bpm
                </span>
              </div>
            </div>
          </div>
        </PanelCard>

        {/* RIGHT: STL forecast + quantile cone */}
        <div className="flex flex-col gap-6">
          <PanelCard title="Structural Integrity Forecast" tag={ttvBreachText}>
            <StlChart whatIf={whatIf} lastScanDay={lastScanDay ?? (whatIf.mission_day - 5)} isPureReplay={isPureReplay} />
            {ttvDays !== null && ttvDays <= 36.0 && (
              <div className="mt-3 rounded border border-[var(--color-status-critical)]/40 bg-[var(--color-status-critical)]/5 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-status-critical)]">
                  TTV Breach — {ttvDays.toFixed(1)} days to safety margin violation
                </p>
                <p className="font-sans text-xs text-[var(--color-ink-meta)] mt-1">
                  Structural integrity projected to fall below minimum threshold.
                  ARED load increase recommended. Bone-resorbing countermeasures
                  per NASA-STD-3001 Vol 2 §6043.
                </p>
              </div>
            )}
          </PanelCard>

          <PanelCard title="Timestral Quantile Cone" tag="90-DAY HORIZON">
            {packet.timestral_quantiles ? (
              <TimestralQuantileConePanel packet={packet} />
            ) : (
              <div className="ares-missing-hatch rounded p-6 text-center">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">
                  Quantile data unavailable — engine offline or abstained
                </span>
              </div>
            )}
          </PanelCard>
        </div>

      </div>
    </section>
  );
}
