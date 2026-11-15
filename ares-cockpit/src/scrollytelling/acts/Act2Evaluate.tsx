// Act 2: Evaluate — NASA Triad Step 2: 3D Biodigital Core & Prognosis.
// Features Header "CHAPTER 02 // EVALUATE // 3D BIODIGITAL CORE & PROGNOSIS",
// 3-Column Bento Grid:
//   - Card 1: Anatomical Layer Strata (4 toggles + MALE/FEMALE Anthropometric Profile switch)
//   - Card 2: Neuro-Ocular SANS & ONSD Caliper (OcularOnsd with 5.09 mm, sigma, ICP status)
//   - Card 3: Injury & VLM Diagnostics ("OPEN AI INJURY INSPECTOR" trigger + VitalsAnomalyPanel expandable)
// Prognostic & Causal Section:
//   - Left: 14-Day Robust Prediction (StlChart + TimestralQuantileConePanel)
//   - Right: Hargens-Frost Causal Cascade + Interactive What-If ARED Slider + Reset button.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useRef, useState, useMemo } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { OcularOnsd } from '../../modules/analysis-imaging/Imaging';
import { VitalsAnomalyPanel } from '../../modules/vitals-anomaly/VitalsAnomalyPanel';
import { StlChart, TimestralQuantileConePanel } from '../../modules/mri-and-stl/MriAndStl';
import { useScrollyContext } from '../ScrollyContext';
import { ENGINE_HTTP_URL } from '../../lib/useTelemetry';
import { evaluate, type CrewSex, type WhatIf } from '../../lib/scenario';
import type { VitalsAnomalyReport, TelemetryPacket } from '../../types/telemetry';
import type { InjuryMarker } from '../../types/injury';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Depth layer definitions
// ---------------------------------------------------------------------------

interface LayerDef {
  index: number;
  label: string;
  sublabel: string;
}

const DEPTH_LAYERS: readonly LayerDef[] = [
  { index: 0, label: 'Skin', sublabel: 'Integumentary envelope' },
  { index: 1, label: 'Muscles', sublabel: 'Soleus, gastrocnemius, core' },
  { index: 2, label: 'Organs & Vessels', sublabel: 'IJV, heart, aorta, brain' },
  { index: 3, label: 'Skeleton', sublabel: 'Trabecular & cortical bone' },
] as const;

// ---------------------------------------------------------------------------
// Hargens-Frost Causal Cascade Nodes
// ---------------------------------------------------------------------------

interface CausalNode {
  id: string;
  step: number;
  label: string;
  citation: string;
  mechanism: string;
  status: 'critical' | 'caution' | 'nominal';
}

const HARGENS_FROST_CASCADE: readonly CausalNode[] = [
  {
    id: 'fluid_shift',
    step: 1,
    label: '0.00 G Cephalad Hydrostatic Shift',
    citation: 'Hargens & Richardson 2009',
    mechanism: 'Loss of 1g hydrostatic gradient redistributes ~2 L venous blood and interstitial fluid headward.',
    status: 'critical',
  },
  {
    id: 'soleus_unloading',
    step: 2,
    label: 'Soleus Muscle Atrophy & Irisin Downregulation',
    citation: 'Fitts et al. 2010',
    mechanism: 'Postural soleus slow-twitch type I fibers lose ground reaction loading; myokine irisin drops 35%.',
    status: 'caution',
  },
  {
    id: 'sclerostin_spike',
    step: 3,
    label: 'Osteocyte Sclerostin Upregulation',
    citation: 'Frost Mechanostat 1987',
    mechanism: 'Strain below mechanostat threshold (1500 microstrain) triggers osteocyte secretion of Wnt inhibitor.',
    status: 'critical',
  },
  {
    id: 'trabecular_resorption',
    step: 4,
    label: 'Accelerated Trabecular Bone Resorption',
    citation: 'Vico et al. 2020',
    mechanism: 'Uncoupled osteoclastic resorption leaches 250 mg Ca/day into circulation; 1-2% BMD lost monthly.',
    status: 'critical',
  },
  {
    id: 'nephrolithiasis',
    step: 5,
    label: 'Hypercalciuria & Nephrolithiasis Risk',
    citation: 'Jain et al. 2023',
    mechanism: 'Renal calcium supersaturation precipitates brushite / calcium oxalate crystallization.',
    status: 'caution',
  },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Act2EvaluateProps {
  /** Currently visible anatomy depth layers (0..3). */
  activeLayers: readonly number[];
  onLayersChange: (layers: readonly number[]) => void;
  /** Anthropometric sex profile. */
  sex: CrewSex;
  onSexChange: (sex: CrewSex) => void;
  /** ONSD measurement in mm (defaults to 5.09 mm if uncalibrated). */
  onsdMm: number;
  /** ONSD standard deviation in mm or null. */
  onsdSigma?: number | null;
  /** Current active injuries list. */
  injuries: InjuryMarker[];
  /** Callback to open the AI Injury Inspector modal. */
  onOpenAiInjury: () => void;
  /** Synthetic or live anomaly report. */
  anomalyReport?: VitalsAnomalyReport | null;
  /** Whether engine telemetry is live. */
  engineLive?: boolean;
  /** Authoritative telemetry packet. */
  packet: TelemetryPacket;
  /** Current What-If scenario parameter state. */
  whatIf: WhatIf;
  /** Day of last clinical ultrasound scan. */
  lastScanDay: number;
  /** Whether replaying pure terrestrial data. */
  isPureReplay?: boolean;
  /** Callback to update What-If scenario parameters. */
  onWhatIfChange: (partial: Partial<WhatIf>) => void;
}

// ---------------------------------------------------------------------------
// Act2Evaluate Component
// ---------------------------------------------------------------------------

export function Act2Evaluate({
  activeLayers,
  onLayersChange,
  sex,
  onSexChange,
  onsdMm = 5.09,
  onsdSigma = 0.28,
  injuries,
  onOpenAiInjury,
  anomalyReport,
  engineLive = false,
  packet,
  whatIf,
  lastScanDay,
  isPureReplay = false,
  onWhatIfChange,
}: Act2EvaluateProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);
  const [anomalyPanelOpen, setAnomalyPanelOpen] = useState(false);

  // GSAP ScrollTrigger to latch activeChapter to 2
  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveChapter(2),
        onEnterBack: () => setActiveChapter(2),
      });
    },
    { scope: sectionRef, dependencies: [setActiveChapter] },
  );

  // Toggle individual depth layer
  const toggleLayer = (layerIdx: number) => {
    if (activeLayers.includes(layerIdx)) {
      // Don't allow toggling off the last layer
      if (activeLayers.length > 1) {
        onLayersChange(activeLayers.filter((i) => i !== layerIdx));
      }
    } else {
      onLayersChange([...activeLayers, layerIdx].sort((a, b) => a - b));
    }
  };

  // Recompute local physiological scenario based on current ARED load
  const localSim = useMemo(() => evaluate(whatIf, lastScanDay), [whatIf, lastScanDay]);

  const ttvDays =
    packet.safety_margins?.ttv_most_likely_days ??
    packet.safety_margins?.time_to_violation_days ??
    null;

  const onsdCritical = onsdMm > 5.0;

  return (
    <section
      ref={sectionRef}
      data-chapter="2"
      className="relative min-h-screen px-4 py-16 sm:px-6 md:px-10 lg:px-12 max-w-[1600px] mx-auto w-full"
      aria-labelledby="act2-heading"
    >
      {/* 1. Header */}
      <div className="pb-8 border-b border-slate-800">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-sky-400 font-bold">
          CHAPTER 02 // EVALUATE // 3D BIODIGITAL CORE &amp; PROGNOSIS
        </p>
        <h2
          id="act2-heading"
          className="mt-2 font-sans text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white"
        >
          Anatomical Core &amp; Multi-Scale Prognosis
        </h2>
        <p className="mt-3 font-sans text-base sm:text-lg text-slate-200 max-w-4xl leading-relaxed">
          Volumetric microgravity digital twin with interactive anatomical layer strata,
          neuro-ocular intracranial pressure calipers, zero-shot computer vision injury diagnosis,
          and 14-day robust signal temporal logic prognosis.
        </p>
      </div>

      {/* 2. 3-Column Bento Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Card 1: Anatomical Layer Strata & Anthropometric Profile Switch */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl transition-all hover:border-sky-500/50">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                ANATOMICAL LAYER STRATA
              </span>
              <span className="rounded bg-sky-950/50 border border-sky-400/40 px-2 py-0.5 font-mono text-xs text-sky-300 font-semibold">
                INTERACTIVE 3D
              </span>
            </div>

            {/* Anthropometric Profile Switch (MALE ATLAS / FEMALE ATLAS) */}
            <div className="mt-4">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-400 block mb-2 font-semibold">
                Anthropometric Profile
              </span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Anthropometric profile">
                {(['MALE', 'FEMALE'] as const).map((s) => {
                  const isSelected = sex === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSexChange(s)}
                      aria-pressed={isSelected}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 px-3 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        isSelected
                          ? 'border-sky-400 bg-sky-950/60 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                          : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isSelected ? 'bg-sky-400' : 'bg-slate-600'
                        }`}
                      />
                      {s} ATLAS
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4 Anatomical Layer Toggles */}
            <div className="mt-5 space-y-2">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-400 block mb-1 font-semibold">
                Visual Strata Depth (4 Layers)
              </span>
              {DEPTH_LAYERS.map((layer) => {
                const isActive = activeLayers.includes(layer.index);
                return (
                  <button
                    key={layer.index}
                    type="button"
                    onClick={() => toggleLayer(layer.index)}
                    aria-pressed={isActive}
                    className={`w-full flex items-center justify-between rounded-lg border p-2.5 transition-all text-left cursor-pointer ${
                      isActive
                        ? 'border-sky-500/50 bg-sky-950/30 text-white shadow-[0_0_8px_rgba(56,189,248,0.2)]'
                        : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-400">
                          0{layer.index}
                        </span>
                        <span className="font-sans text-sm font-semibold">{layer.label}</span>
                      </div>
                      <span className="font-sans text-xs text-slate-400">
                        {layer.sublabel}
                      </span>
                    </div>
                    <span
                      className={`font-mono text-xs font-bold uppercase tracking-wider rounded px-2 py-0.5 ${
                        isActive
                          ? 'border border-sky-400/40 text-sky-300 bg-sky-950/50'
                          : 'border border-slate-800 text-slate-500'
                      }`}
                    >
                      {isActive ? 'SHOWN' : 'HIDDEN'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick jump to Top 3D Twin Aperture */}
            <button
              type="button"
              onClick={() => {
                const el = document.querySelector('[data-chapter="0"]');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
                else window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg border border-sky-400/50 bg-sky-950/40 p-2.5 font-mono text-xs font-bold text-sky-200 hover:bg-sky-900/60 hover:border-sky-300 transition-all cursor-pointer shadow-[0_0_10px_rgba(56,189,248,0.2)]"
            >
              <span>INSPECT IN 3D TWIN APERTURE</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>

          <p className="mt-4 font-mono text-xs text-slate-400">
            Click drag in 3D scene to orbit. Scroll to zoom on anatomical landmarks.
          </p>
        </div>

        {/* Card 2: Neuro-Ocular SANS & ONSD Caliper */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl transition-all hover:border-sky-500/50">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                NEURO-OCULAR SANS &amp; ONSD
              </span>
              <span
                className={`rounded px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
                  onsdCritical
                    ? 'border border-rose-500/60 bg-rose-950/40 text-rose-300'
                    : 'border border-emerald-500/50 bg-emerald-950/30 text-emerald-300'
                }`}
              >
                {onsdCritical ? 'HYPERTENSION' : 'NORMAL ICP'}
              </span>
            </div>

            {/* OcularOnsd Widget */}
            <div className="mt-4">
              <OcularOnsd onsd={onsdMm} sigma={onsdSigma ?? null} />
            </div>

            {/* Metric Measurements */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-slate-800 pt-3 text-center">
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                  Calibrated ONSD
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-white">
                  {onsdMm.toFixed(2)} mm
                </span>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                  Measurement 1σ
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-200">
                  ±{onsdSigma ? onsdSigma.toFixed(2) : '0.28'} mm
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-300 block mb-1 font-semibold">
                Clinical Diagnostic Status
              </span>
              <p className="font-sans text-xs text-slate-200 leading-relaxed">
                {onsdCritical
                  ? 'ONSD exceeds 5.00 mm threshold. Suggests elevated intracranial pressure (ICP) from cephalad venous stasis. SANS risk Grade 2.'
                  : 'ONSD within normal terrestrial and microgravity baseline bounds (4.50–5.00 mm). Optic nerve sheath diameter nominal.'}
              </p>
            </div>
          </div>

          <p className="mt-4 font-mono text-xs text-slate-400">
            NASA-STD-3001 Vol 1 §7.3 Neuro-Ocular Protocol MTB-009
          </p>
        </div>

        {/* Card 3: Injury & VLM Diagnostics */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl transition-all hover:border-sky-500/50">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                INJURY &amp; VLM DIAGNOSTICS
              </span>
              <span className="rounded bg-sky-950/50 border border-sky-400/40 px-2 py-0.5 font-mono text-xs text-sky-300 font-semibold">
                {injuries.length} ANNOTATIONS
              </span>
            </div>

            {/* Real Trigger Button */}
            <button
              type="button"
              onClick={onOpenAiInjury}
              className="mt-4 w-full rounded-xl border border-sky-400/70 bg-gradient-to-r from-sky-950/70 to-indigo-950/70 p-4 text-center transition-all hover:border-sky-300 hover:from-sky-900/70 hover:to-indigo-900/70 shadow-[0_0_20px_rgba(56,189,248,0.25)] cursor-pointer"
            >
              <div className="flex items-center justify-center gap-2">
                <svg
                  className="h-5 w-5 text-sky-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-white">
                  OPEN AI INJURY INSPECTOR
                </span>
              </div>
              <p className="mt-1 font-sans text-xs text-sky-200">
                Zero-shot optical triage for burns, lacerations, and contusions
              </p>
            </button>

            {/* Active Annotations list */}
            <div className="mt-4">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-300 block mb-1.5 font-semibold">
                Active Physical Annotations
              </span>
              {injuries.length === 0 ? (
                <div className="ares-missing-hatch rounded-lg p-3 text-center">
                  <span className="font-mono text-xs uppercase tracking-wider text-slate-300 font-semibold">
                    No active trauma markers recorded
                  </span>
                </div>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {injuries.map((inj) => (
                    <div
                      key={inj.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-mono text-xs font-bold text-amber-300 uppercase">
                          {inj.region}
                        </span>
                        <p className="font-sans text-xs text-slate-200 truncate max-w-xs">
                          {inj.title}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-400 uppercase">
                        {inj.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expandable Vitals Anomaly Detector Panel */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setAnomalyPanelOpen((v) => !v)}
                className="w-full flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 font-mono text-xs uppercase tracking-wider text-slate-300 hover:border-slate-700 cursor-pointer font-semibold"
              >
                <span>Vitals Anomaly Testbench (8 Profiles)</span>
                <span className="text-sky-400 font-bold">{anomalyPanelOpen ? 'HIDE [-]' : 'EXPAND [+]'}</span>
              </button>
              {anomalyPanelOpen && (
                <div className="mt-2 rounded-lg border border-slate-800 bg-black/95 p-3">
                  <VitalsAnomalyPanel
                    report={anomalyReport}
                    engineLive={engineLive}
                    httpBaseUrl={ENGINE_HTTP_URL}
                  />
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 font-mono text-xs text-slate-400">
            VLM Vision Protocol v1.4 // Edge-Native Offline Ingestion
          </p>
        </div>
      </div>

      {/* 3. Prognostic & Causal Section */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: 14-Day Robust Prediction (StlChart + TimestralQuantileConePanel) */}
        <div className="flex flex-col gap-6">
          {/* StlChart Card */}
          <div className="rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-sans text-lg font-bold text-white">
                  14-Day Robust Prediction // STL Robustness
                </h3>
                <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
                  Signal Temporal Logic (ρ) &amp; Structural Bone Integrity
                </p>
              </div>
              <span
                className={`rounded px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
                  ttvDays !== null && ttvDays <= 36.0
                    ? 'border border-rose-500/60 bg-rose-950/40 text-rose-300'
                    : 'border border-emerald-500/50 bg-emerald-950/30 text-emerald-300'
                }`}
              >
                {ttvDays !== null ? `TTV ${ttvDays.toFixed(1)} d` : 'TTV NOMINAL'}
              </span>
            </div>

            <div className="mt-4">
              <StlChart
                whatIf={whatIf}
                lastScanDay={lastScanDay}
                isPureReplay={isPureReplay}
              />
            </div>

            {ttvDays !== null && ttvDays <= 36.0 && (
              <div className="mt-4 rounded-lg border border-rose-500/50 bg-rose-950/30 p-3.5">
                <span className="font-mono text-xs uppercase tracking-wider text-rose-400 font-bold block mb-1">
                  Time to Violation Breach Imminent
                </span>
                <p className="font-sans text-xs text-rose-200 leading-relaxed">
                  Structural integrity falls below safety margin in {ttvDays.toFixed(1)} days.
                  Immediate ARED loading protocol escalation required to arrest trabecular resorption.
                </p>
              </div>
            )}
          </div>

          {/* TimestralQuantileConePanel Card */}
          <div className="rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl">
            <div className="pb-3 border-b border-slate-800">
              <h3 className="font-sans text-lg font-bold text-white">
                Short-Term Forecast // Timestral Quantile Cone
              </h3>
              <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
                Empirical Quantiles Q10-Q50-Q90 with Adaptive Drift
              </p>
            </div>
            <div className="mt-4">
              <TimestralQuantileConePanel packet={packet} />
            </div>
          </div>
        </div>

        {/* Right Column: Hargens-Frost Causal Cascade + Interactive What-If ARED Slider + Reset */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-sans text-lg font-bold text-white">
                  Hargens-Frost Causal Cascade
                </h3>
                <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
                  Mechanobiological Pathway: 0g Unloading to Nephrolithiasis
                </p>
              </div>
              <span className="rounded bg-sky-950/50 border border-sky-400/40 px-2 py-0.5 font-mono text-xs text-sky-300 font-semibold">
                EVIDENCE-BASED
              </span>
            </div>

            {/* Cascade Flow */}
            <div className="mt-5 space-y-4">
              {HARGENS_FROST_CASCADE.map((node, idx) => (
                <div key={node.id} className="relative flex items-start gap-3.5">
                  {/* Vertical connector line */}
                  {idx < HARGENS_FROST_CASCADE.length - 1 && (
                    <div className="absolute left-4 top-8 h-full w-px bg-slate-800" />
                  )}
                  {/* Step badge */}
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold ${
                      node.status === 'critical'
                        ? 'border-rose-500/60 bg-rose-950/50 text-rose-300'
                        : 'border-amber-500/60 bg-amber-950/50 text-amber-300'
                    }`}
                  >
                    0{node.step}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-mono text-sm font-bold text-white">
                        {node.label}
                      </h4>
                      <span className="font-mono text-xs text-sky-400">
                        ({node.citation})
                      </span>
                    </div>
                    <p className="mt-1 font-sans text-xs sm:text-sm text-slate-200 leading-relaxed">
                      {node.mechanism}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive What-If ARED Slider + Reset */}
            <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950/80 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                  ARED RESISTANCE LOAD (WHAT-IF)
                </span>
                <span className="font-mono text-base font-bold tabular-nums text-sky-300">
                  {Math.round(whatIf.ared_load_pct)}%
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={whatIf.ared_load_pct}
                onChange={(e) =>
                  onWhatIfChange({ ared_load_pct: parseInt(e.target.value, 10) })
                }
                className="w-full accent-sky-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                aria-label="ARED resistance training load percentage"
              />

              <div className="mt-1.5 flex justify-between font-mono text-xs text-slate-400">
                <span>0% — Total Deconditioning</span>
                <span>50% — Nominal Minimum</span>
                <span>100% — Prescribed Countermeasure</span>
              </div>

              {/* Dynamic Recomputed Outcomes */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border border-slate-800 bg-black/80 p-2.5">
                  <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                    Estimated SBP
                  </span>
                  <span className="font-mono text-base font-bold tabular-nums text-white">
                    {Math.round(localSim.sbp ?? 118)} mmHg
                  </span>
                </div>
                <div className="rounded-lg border border-slate-800 bg-black/80 p-2.5">
                  <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                    Estimated HR
                  </span>
                  <span className="font-mono text-base font-bold tabular-nums text-white">
                    {Math.round(localSim.hr ?? 72)} bpm
                  </span>
                </div>
              </div>

              {/* Reset Button */}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => onWhatIfChange({ ared_load_pct: 100 })}
                  className="rounded-lg border border-slate-700 bg-slate-900/80 px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-slate-200 hover:border-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                >
                  RESET COUNTERMEASURE (100%)
                </button>
              </div>
            </div>
          </div>

          <p className="mt-6 font-mono text-xs text-slate-400">
            Frost Mechanostat Theorem (1987) &amp; Hargens Microgravity Hemodynamics (2019)
          </p>
        </div>
      </div>
    </section>
  );
}
