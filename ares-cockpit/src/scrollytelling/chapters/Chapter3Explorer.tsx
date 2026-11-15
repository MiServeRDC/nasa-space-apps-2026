// Chapter 3: Interactive Biodigital Explorer.
// Houses the 4-level depth slider for PairedAtlasBody (drives PinnedScrollyStage),
// orbit controls notice (interactive mode is active in ch3), AiInjuryModal
// integration, neuro-ocular OcularOnsd, and VitalsAnomalyPanel testbench.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { lazy, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { OcularOnsd } from '../../modules/analysis-imaging/Imaging';
import { VitalsAnomalyPanel } from '../../modules/vitals-anomaly/VitalsAnomalyPanel';
import { DeferredPanel } from '../../modules/ui-primitives/DeferredPanel';
import { useScrollyContext } from '../ScrollyContext';
import { ENGINE_HTTP_URL } from '../../lib/useTelemetry';
import type { VitalsAnomalyReport, ActivePlaybook } from '../../types/telemetry';
import type { InjuryMarker, InjuryRegionId } from '../../types/injury';
import type { V3 } from '../../modules/body-3d-heatmap/AnatomicalLayers';

gsap.registerPlugin(ScrollTrigger);

const AiInjuryModal = lazy(() =>
  import('../../modules/body-3d-heatmap/AiInjuryModal').then((m) => ({ default: m.AiInjuryModal })),
);

// ---------------------------------------------------------------------------
// Depth layer labels
// ---------------------------------------------------------------------------

const DEPTH_LAYERS = [
  { value: 0, label: 'Skin' },
  { value: 1, label: 'Muscles' },
  { value: 2, label: 'Organs & Vessels' },
  { value: 3, label: 'Skeleton' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Chapter3ExplorerProps {
  /** Currently visible anatomy depth layers (drives PinnedScrollyStage externally). */
  activeLayers: readonly number[];
  onLayersChange: (layers: readonly number[]) => void;
  /** ONSD measurement mm for neuro-ocular widget. */
  onsdMm: number;
  /** ONSD uncertainty sigma mm or null. */
  onsdSigma?: number | null;
  /** Existing injury markers. */
  injuries: InjuryMarker[];
  onSaveInjury: (injury: InjuryMarker) => void;
  /** Vitals anomaly report from engine / simulation. */
  anomalyReport: VitalsAnomalyReport | null | undefined;
  activePlaybook: ActivePlaybook | null | undefined;
  engineLive: boolean;
  /** Surface click point forwarded from PinnedScrollyStage. */
  surfaceClickPoint: V3 | null;
  onClearSurfaceClick: () => void;
}

// ---------------------------------------------------------------------------
// PanelCard (local copy to avoid cross-chapter coupling)
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
// Chapter3Explorer
// ---------------------------------------------------------------------------

export function Chapter3Explorer({
  activeLayers,
  onLayersChange,
  onsdMm,
  onsdSigma,
  injuries,
  onSaveInjury,
  anomalyReport,
  activePlaybook,
  engineLive,
  surfaceClickPoint,
  onClearSurfaceClick,
}: Chapter3ExplorerProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);
  const [injuryModalOpen, setInjuryModalOpen] = useState(false);
  const [injuryRegion, setInjuryRegion] = useState<InjuryRegionId>('LEFT_FOREARM');

  // ScrollTrigger: activates interactive camera via setActiveChapter(3)
  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveChapter(3),
        onEnterBack: () => setActiveChapter(3),
      });
    },
    { scope: sectionRef, dependencies: [setActiveChapter] },
  );

  // Depth slider: selecting a level shows all layers up to and including that level.
  const handleDepthChange = (level: number) => {
    const layers: number[] = [];
    for (let i = 0; i <= level; i++) layers.push(i);
    onLayersChange(layers);
  };

  const currentDepth = Math.max(...(activeLayers.length ? activeLayers : [0]));

  // Surface click -> open injury modal at nearest region
  const handleMarkInjury = () => {
    setInjuryModalOpen(true);
  };

  return (
    <section
      ref={sectionRef}
      data-chapter="3"
      className="min-h-screen px-6 py-20 md:px-14"
      aria-labelledby="ch3-heading"
    >
      {/* Header */}
      <div className="mb-8 max-w-xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--color-ink-muted)] mb-2">
          Chapter 03 // Interactive Biodigital Explorer
        </p>
        <h2
          id="ch3-heading"
          className="font-sans text-3xl font-semibold tracking-tight text-[var(--color-ink-display)]"
        >
          Anatomy Explorer
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-[var(--color-ink-meta)] max-w-md">
          The 3D twin behind this panel is now interactive. Orbit and inspect using
          pointer drag + scroll. Tap any surface to mark an injury.
        </p>
      </div>

      {/* Controls row */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Depth layer slider */}
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
            Anatomy Layer Depth
          </span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={currentDepth}
              onChange={(e) => handleDepthChange(parseInt(e.target.value, 10))}
              className="w-40 accent-[var(--color-accent)]"
              aria-label="Anatomy depth layer"
            />
            <span className="font-mono text-[11px] text-[var(--color-ink-body)]">
              {DEPTH_LAYERS[currentDepth]?.label ?? 'Unknown'}
            </span>
          </div>
          <div className="flex gap-2 mt-1">
            {DEPTH_LAYERS.map((dl) => (
              <button
                key={dl.value}
                onClick={() => handleDepthChange(dl.value)}
                aria-pressed={currentDepth === dl.value}
                className={`
                  rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest border
                  transition-colors duration-150
                  ${currentDepth === dl.value
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-active)]'}
                `}
              >
                {dl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Orbit notice */}
        <div className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 px-3 py-2">
          <p className="font-mono text-[10px] text-[var(--color-accent)] uppercase tracking-widest">
            3D Orbit Active
          </p>
          <p className="font-sans text-[11px] text-[var(--color-ink-meta)] mt-0.5">
            Drag to orbit. Scroll to zoom. Click surface to annotate.
          </p>
        </div>

        {/* Injury mark button */}
        {surfaceClickPoint && (
          <button
            onClick={handleMarkInjury}
            className="rounded border border-[var(--color-status-caution)] bg-[var(--color-status-caution)]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-status-caution)] hover:bg-[var(--color-status-caution)]/20 transition-colors"
          >
            Mark Injury at Point
          </button>
        )}
      </div>

      {/* Detail panels grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* Neuro-ocular: ONSD */}
        <PanelCard title="Neuro-Ocular: ONSD" tag="SANS RISK">
          <OcularOnsd onsd={onsdMm} sigma={onsdSigma ?? null} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 text-xs">
            <div>
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)] uppercase">ONSD</span>
              <span className="ml-2 font-mono tabular-nums text-[var(--color-ink-display)]">{onsdMm.toFixed(1)} mm</span>
            </div>
            <div>
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)] uppercase">Threshold</span>
              <span className="ml-2 font-mono tabular-nums text-[var(--color-ink-muted)]">5.0 mm</span>
            </div>
          </div>
          <p className="mt-2 font-mono text-[9px] text-[var(--color-ink-muted)]">
            SANS: Spaceflight-Associated Neuro-ocular Syndrome. Elevated ONSD
            suggests raised intracranial pressure from cephalad fluid shift.
          </p>
        </PanelCard>

        {/* VitalsAnomalyPanel testbench */}
        <PanelCard title="Anomaly Detector Testbench" tag="8 PROFILES">
          <VitalsAnomalyPanel
            report={anomalyReport}
            engineLive={engineLive}
            httpBaseUrl={ENGINE_HTTP_URL}
          />
        </PanelCard>

        {/* Active injuries list */}
        <PanelCard title="Injury Annotations" tag={`${injuries.length} MARKERS`} className="md:col-span-2">
          {injuries.length === 0 ? (
            <div className="ares-missing-hatch rounded p-4 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">
                No injury markers — click a surface point in the 3D twin to annotate
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {injuries.map((inj) => (
                <div
                  key={inj.id}
                  className="rounded border border-[var(--color-status-caution)]/40 bg-[var(--color-status-caution)]/5 px-3 py-2"
                >
                  <p className="font-mono text-[10px] text-[var(--color-status-caution)] uppercase">{inj.region}</p>
                  <p className="font-sans text-xs text-[var(--color-ink-meta)] mt-0.5">{inj.summary || 'No summary'}</p>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setInjuryModalOpen(true)}
            className="mt-3 rounded border border-[var(--color-border)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)] hover:border-[var(--color-border-active)] hover:text-[var(--color-ink-meta)] transition-colors"
          >
            + Add Injury Annotation
          </button>
        </PanelCard>

      </div>

      {/* AiInjuryModal */}
      {injuryModalOpen && (
        <DeferredPanel name="injury annotation">
          <AiInjuryModal
            isOpen={injuryModalOpen}
            initialRegion={injuryRegion}
            onClose={() => {
              setInjuryModalOpen(false);
              onClearSurfaceClick();
            }}
            onSaveInjury={(inj) => {
              onSaveInjury(inj);
              setInjuryModalOpen(false);
              onClearSurfaceClick();
            }}
          />
        </DeferredPanel>
      )}
    </section>
  );
}
