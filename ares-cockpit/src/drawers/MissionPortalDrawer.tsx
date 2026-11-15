// Deep-Space Store-and-Forward Telemedicine & 24-Dataset Scientific Evidence Atlas Drawer
// (`MissionPortalDrawer`).
// Implements:
// - OWLT radio-delay scrubber (`8.2 - 48.1 min`) with NotebookLM Risk 3 pointer-capture scrubbing lock
// - ChaCha20-Poly1305 AEAD Store-and-Forward DSN packet transit queue
// - Async Flight Surgeon Tele-POCUS store-and-forward review station
// - Fixed-row virtualized explorer (`computeVirtualWindow`) over all 24 `SCIENTIFIC_ATLAS` datasets

import React, { useEffect, useMemo, useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import type { ScenarioState } from '../lib/scenario';
import {
  SCIENTIFIC_ATLAS,
  type ScientificDataset,
} from '../modules/portal/MissionPortal';
import { OcularOnsd, PocusIjv } from '../modules/analysis-imaging/Imaging';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';
import { SlideOverDrawerShell } from './SlideOverDrawerShell';
import {
  OWLT_MAX_MINUTES,
  OWLT_MIN_MINUTES,
  computeOwltFlightProgress,
  computeVirtualWindow,
  filterScientificAtlas,
} from './drawerLogic';

export { SCIENTIFIC_ATLAS };

export interface MissionPortalDrawerProps {
  open: boolean;
  onClose: () => void;
  packet: TelemetryPacket;
  scenario: ScenarioState;
  thrombusConfirmed: boolean | null;
  invokerElementId?: string | null;
}

type PortalTabId = 'DSN_QUEUE' | 'TELE_POCUS' | 'ATLAS_24';

interface QueuedDsnBundle {
  id: string;
  label: string;
  cipherSuite: 'ChaCha20-Poly1305-AEAD';
  bytes: number;
  elapsedSec: number;
}

const VIRTUAL_ATLAS_ROW_PX = 56;
const VIRTUAL_ATLAS_VIEWPORT_PX = 336;

export function MissionPortalDrawer({
  open,
  onClose,
  packet,
  scenario,
  thrombusConfirmed,
  invokerElementId,
}: MissionPortalDrawerProps) {
  const setIsScrubbing = useWorkbenchStore((s) => s.setIsScrubbing);

  const [tab, setTab] = useState<PortalTabId>('DSN_QUEUE');
  const [owltMinutes, setOwltMinutes] = useState<number>(14.4);
  const [bundles, setBundles] = useState<QueuedDsnBundle[]>([
    {
      id: 'DSN-PKT-0094',
      label: 'NQS-STL Causal Summary + SHA-256 Audit Delta',
      cipherSuite: 'ChaCha20-Poly1305-AEAD',
      bytes: 1840,
      elapsedSec: 410,
    },
    {
      id: 'DSN-PKT-0095',
      label: 'Compressed L-IJV B-Mode & ONSD Keyframe Clip',
      cipherSuite: 'ChaCha20-Poly1305-AEAD',
      bytes: 14280,
      elapsedSec: 125,
    },
  ]);

  const [atlasQuery, setAtlasQuery] = useState<string>('');
  const [agencyFilter, setAgencyFilter] = useState<'ALL' | ScientificDataset['agency']>('ALL');
  const [atlasScrollTop, setAtlasScrollTop] = useState<number>(0);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(SCIENTIFIC_ATLAS[0]?.id ?? 'osd-51');

  // Advance simulated OWLT packet flight clock at 1 Hz while drawer is open
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setBundles((prev) =>
        prev.map((b) => ({
          ...b,
          elapsedSec: b.elapsedSec + 12,
        })),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const filteredAtlas = useMemo(
    () => filterScientificAtlas(SCIENTIFIC_ATLAS, atlasQuery, agencyFilter),
    [agencyFilter, atlasQuery],
  );

  const virtualSlice = useMemo(
    () =>
      computeVirtualWindow(
        filteredAtlas.length,
        atlasScrollTop,
        VIRTUAL_ATLAS_VIEWPORT_PX,
        VIRTUAL_ATLAS_ROW_PX,
        4,
      ),
    [atlasScrollTop, filteredAtlas.length],
  );

  const selectedDataset = useMemo(
    () =>
      filteredAtlas.find((d) => d.id === selectedDatasetId) ??
      filteredAtlas[0] ??
      SCIENTIFIC_ATLAS[0],
    [filteredAtlas, selectedDatasetId],
  );

  // NotebookLM Risk 3 Fix: explicit pointer capture + `setIsScrubbing` lock on OWLT slider
  const owltScrubHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      setIsScrubbing(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLInputElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      setIsScrubbing(false);
    },
    onPointerCancel: () => setIsScrubbing(false),
    onBlur: () => setIsScrubbing(false),
  };

  const handleQueueEncryptedBundle = (): void => {
    const nextId = `DSN-PKT-00${96 + bundles.length}`;
    setBundles((prev) => [
      {
        id: nextId,
        label: `Crew ${packet.astronaut_id} Telemetry + MRI ${Math.round(scenario.mri)}% Snapshot`,
        cipherSuite: 'ChaCha20-Poly1305-AEAD',
        bytes: 2048,
        elapsedSec: 0,
      },
      ...prev,
    ]);
    announcePolite(`Queued ChaCha20-Poly1305 encrypted DSN bundle ${nextId}.`);
  };

  return (
    <SlideOverDrawerShell
      open={open}
      onClose={onClose}
      eyebrow="DEEP-SPACE TELEMEDICINE & EVIDENCE ATLAS [O]"
      title="Mars-Earth DSN Store-and-Forward & 24-Dataset Atlas"
      subtitle={`One-Way Light Time ${owltMinutes.toFixed(1)} min (${(owltMinutes * 2).toFixed(1)} min RTT) | 100% Autonomous Edge Mandate`}
      invokerElementId={invokerElementId}
    >
      <div className="space-y-3">
        {/* <= 3 Sub-Tabs */}
        <div
          role="tablist"
          aria-label="Mission portal views"
          className="grid grid-cols-3 gap-1.5 font-mono text-[10px]"
        >
          {(
            [
              { id: 'DSN_QUEUE', label: 'DSN AEAD SYNC' },
              { id: 'TELE_POCUS', label: 'TELE-POCUS' },
              { id: 'ATLAS_24', label: `ATLAS (${SCIENTIFIC_ATLAS.length})` },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`ares-touch-target ares-interactive rounded-lg border font-semibold tracking-wider ${
                  active
                    ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                    : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Sub-Tab 1: OWLT Scrubber & ChaCha20-Poly1305 Store-and-Forward Queue */}
        {tab === 'DSN_QUEUE' ? (
          <div className="space-y-3 font-mono text-xs">
            <div className="ares-inner-well space-y-2 p-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[var(--color-ink-display)]">
                  EARTH-MARS ONE-WAY LIGHT TIME (OWLT)
                </span>
                <span className="ares-tabular-metric text-cyan-200">
                  {owltMinutes.toFixed(1)} min OWLT / {(owltMinutes * 2).toFixed(1)} min RTT
                </span>
              </div>

              <input
                type="range"
                min={OWLT_MIN_MINUTES}
                max={OWLT_MAX_MINUTES}
                step={0.1}
                value={owltMinutes}
                aria-label="Earth-Mars one-way light time in minutes"
                className="ares-touch-target w-full cursor-pointer"
                onChange={(e) => setOwltMinutes(Number(e.target.value))}
                {...owltScrubHandlers}
              />

              <div className="flex justify-between text-[9px] text-[var(--color-ink-muted)]">
                <span>OPPOSITION ({OWLT_MIN_MINUTES} MIN)</span>
                <span>SUPERIOR CONJUNCTION ({OWLT_MAX_MINUTES} MIN)</span>
              </div>
            </div>

            <div className="ares-inner-well space-y-2.5 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-[var(--color-ink-display)]">
                    CHACHA20-POLY1305 AEAD STORE-AND-FORWARD QUEUE
                  </div>
                  <div className="text-[9px] text-[var(--color-ink-meta)]">
                    SIMULATED DSN TELEMETRY SYNC PREVIEW &bull; ZERO EXTERNAL HTTP TRAFFIC
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleQueueEncryptedBundle}
                  className="ares-touch-target ares-interactive rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-3 text-[10px] font-semibold text-cyan-200"
                >
                  + QUEUE AEAD BUNDLE
                </button>
              </div>

              <div className="space-y-2">
                {bundles.map((b) => {
                  const status = computeOwltFlightProgress(b.elapsedSec, owltMinutes);
                  const pct = Math.round(status.progressRatio * 100);
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl border border-white/10 bg-black/75 p-2.5 text-[10px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-cyan-200">
                          {b.id} &bull; {b.cipherSuite}
                        </span>
                        <span
                          className={
                            status.stage === 'EARTH_DSN_RX'
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                          }
                        >
                          {status.stage} ({pct}%)
                        </span>
                      </div>
                      <div className="mt-0.5 text-[var(--color-ink-body)]">{b.label}</div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${
                            status.stage === 'EARTH_DSN_RX' ? 'bg-emerald-400' : 'bg-cyan-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[9px] text-[var(--color-ink-muted)]">
                        <span>MARS HABITAT TX ({b.bytes} B)</span>
                        <span>
                          {status.remainingSec > 0
                            ? `ETA GOLDSTONE DSN: ${Math.floor(status.remainingSec / 60)}m ${status.remainingSec % 60}s`
                            : 'DELIVERED TO FLIGHT SURGEON CONSOLE'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Sub-Tab 2: Async Flight Surgeon Tele-POCUS Store-and-Forward Station */}
        {tab === 'TELE_POCUS' ? (
          <div className="space-y-3 font-mono text-xs">
            <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-2.5 text-[10px] text-amber-200">
              ASYNC STORE-AND-FORWARD TELE-ECHOGRAPHY: Real-time ground probe guidance is
              physically impossible across {(owltMinutes * 2).toFixed(1)} min RTT. Onboard Gate 1
              tactile compression governs immediate safety; clips below queue for deferred MCC
              Flight Surgeon audit.
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black p-2">
                <div className="mb-1 text-[10px] font-semibold text-cyan-200">
                  CLIP A: L-IJV B-MODE ({scenario.csa.toFixed(2)} cm2)
                </div>
                <PocusIjv
                  csa={packet.hemodynamics?.ijv_csa_cm2 ?? scenario.csa}
                  vmax={packet.hemodynamics?.ijv_velocity_max_cm_s ?? scenario.vmax}
                  thrombus={thrombusConfirmed}
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-black p-2">
                <div className="mb-1 text-[10px] font-semibold text-cyan-200">
                  CLIP B: OCULAR ONSD ({scenario.onsdMm.toFixed(2)} mm)
                </div>
                <OcularOnsd
                  onsd={packet.hemodynamics?.onsd_mm ?? scenario.onsdMm}
                  sigma={scenario.onsdSigmaMm}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Sub-Tab 3: Fixed-Row Virtualized 24-Dataset Scientific Evidence Atlas */}
        {tab === 'ATLAS_24' ? (
          <div className="space-y-2.5 font-mono text-xs">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={atlasQuery}
                onChange={(e) => {
                  setAtlasQuery(e.target.value);
                  setAtlasScrollTop(0);
                }}
                placeholder="Search OSD-51, BIDMC, SANS, CSA CANS..."
                aria-label="Filter 24-dataset scientific evidence atlas"
                className="ares-touch-target flex-1 rounded-lg border border-white/15 bg-black px-3 text-xs text-[var(--color-ink-display)] focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1 text-[10px]">
              {(['ALL', 'NASA', 'PhysioNet', 'CSA', 'ESA', 'DLR'] as const).map((ag) => {
                const selected = agencyFilter === ag;
                return (
                  <button
                    key={ag}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setAgencyFilter(ag);
                      setAtlasScrollTop(0);
                    }}
                    className={`ares-interactive rounded border px-2 py-1 font-semibold ${
                      selected
                        ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                        : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                    }`}
                  >
                    {ag}
                  </button>
                );
              })}
            </div>

            {/* Virtualized `56px` Fixed-Row Viewport */}
            <div
              role="listbox"
              aria-label="24-Dataset Scientific Evidence Atlas"
              onScroll={(e) => setAtlasScrollTop(e.currentTarget.scrollTop)}
              className="overflow-y-auto rounded-xl border border-white/10 bg-black/80"
              style={{ height: `${VIRTUAL_ATLAS_VIEWPORT_PX}px`, overscrollBehavior: 'contain' }}
            >
              <div style={{ height: `${virtualSlice.topSpacerPx}px` }} />
              {filteredAtlas
                .slice(virtualSlice.startIndex, virtualSlice.endIndexExclusive)
                .map((ds) => {
                  const active = selectedDataset?.id === ds.id;
                  return (
                    <button
                      key={ds.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedDatasetId(ds.id)}
                      style={{ height: `${VIRTUAL_ATLAS_ROW_PX}px` }}
                      className={`flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 text-left ${
                        active
                          ? 'bg-cyan-500/15 text-cyan-100'
                          : 'bg-transparent text-[var(--color-ink-display)] hover:bg-white/5'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-semibold">
                          [{ds.agency}] {ds.accession} &mdash; {ds.title}
                        </div>
                        <div className="truncate text-[9px] text-[var(--color-ink-meta)]">
                          {ds.axis} &bull; {ds.platform}
                        </div>
                      </div>
                      <span className="shrink-0 rounded border border-white/15 bg-black px-1.5 py-0.5 text-[9px] text-cyan-300">
                        INSPECT
                      </span>
                    </button>
                  );
                })}
              <div style={{ height: `${virtualSlice.bottomSpacerPx}px` }} />
            </div>

            {/* Selected Dataset Detail Card */}
            {selectedDataset ? (
              <div className="ares-inner-well space-y-1.5 p-3 text-[10px]">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-bold text-cyan-200">
                    {selectedDataset.agency} // {selectedDataset.accession}
                  </span>
                  <span className="rounded border border-white/15 bg-black px-1.5 py-0.5 text-[9px] text-[var(--color-ink-meta)]">
                    {selectedDataset.axis}
                  </span>
                </div>
                <div className="font-sans text-xs font-semibold text-[var(--color-ink-display)]">
                  {selectedDataset.title}
                </div>
                <div className="text-[var(--color-ink-meta)]">
                  COHORT: {selectedDataset.sampleCohort}
                </div>
                <p className="font-sans text-xs leading-relaxed text-[var(--color-ink-body)]">
                  {selectedDataset.relevanceToAres}
                </p>
                <div className="text-[9px] text-amber-300">
                  SAFETY / SCENARIO MAPPING: {selectedDataset.safetyGateMapping}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SlideOverDrawerShell>
  );
}
