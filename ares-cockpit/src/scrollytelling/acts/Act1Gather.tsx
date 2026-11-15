// Act 1: Gather — NASA Triad Step 1: Continuous Autonomous Telemetry & Bedside Monitoring.
// Features Alessandro's Centered Editorial Hero Block, 3 Large Bento Cards Vitals Anchor,
// Crew Activity Selector, Bedside Monitoring Bento Grid (EcgStrip 20Hz, PocusIjv, ECLSS 2x2,
// and MeasurementContext), and an animated scroll cue to Act 2.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ACTIVITY_CONTEXT, type CrewActivity } from '../../lib/missionContext';
import { RecentRange, MeasurementContext } from '../../modules/crew-vitals/MeasurementContext';
import { EcgStrip, PocusIjv } from '../../modules/analysis-imaging/Imaging';
import { useScrollyContext } from '../ScrollyContext';
import type { DataOrigin } from '../../types/telemetry';
import type { RecordedHistoryPoint } from '../../lib/useTelemetry';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Act1GatherProps {
  /** Heart rate in bpm or null. */
  hr: number | null;
  /** Oxygen saturation in percent or null. */
  spo2: number | null;
  /** Respiration rate in brpm or null. */
  resp: number | null;
  /** Systolic BP in mmHg. */
  sbp?: number | null;
  /** Diastolic BP in mmHg. */
  dbp?: number | null;
  /** Mean Arterial Pressure in mmHg. */
  map?: number | null;
  /** Rolling 30-second recorded history. */
  history: RecordedHistoryPoint[];
  /** Current crew activity state. */
  crewActivity: CrewActivity;
  /** Callback when activity changes. */
  onActivityChange: (activity: CrewActivity) => void;
  /** ECG artifact index [0..1]. */
  artifact?: number;
  /** ECG signal quality index [0..1]. */
  sqi: number;
  /** Whether replaying recorded terrestrial waveform. */
  isRecorded?: boolean;
  /** IJV cross-sectional area cm2. */
  ijvCsa: number;
  /** IJV peak velocity cm/s. */
  vmax: number;
  /** Wall shear stress tau_w in dyn/cm2. */
  tauW?: number;
  /** Whether intraluminal thrombus is verified. */
  thrombus: boolean | null;
  /** Data provenance for MeasurementContext. */
  bioOrigin: DataOrigin;
  /** Biosensor native sampling rate Hz. */
  sampleRate: number;
  /** Formatted HRV string or null. */
  hrv: string | null;
  /** Core body temperature in Celsius or null. */
  temperature: number | null;
  /** Cabin CO2 partial pressure in mmHg. */
  ppco2Mmhg: number;
  /** Ambient cosmic radiation dose rate in mSv/d. */
  radiationMsvD: number;
  /** Optional smooth scroll trigger to Act 2. */
  onScrollToAct2?: () => void;
}

// ---------------------------------------------------------------------------
// Act1Gather Component
// ---------------------------------------------------------------------------

export function Act1Gather({
  hr,
  spo2,
  resp,
  sbp = 118,
  dbp = 76,
  map = 90,
  history,
  crewActivity,
  onActivityChange,
  artifact = 0,
  sqi,
  isRecorded = false,
  ijvCsa,
  vmax,
  tauW,
  thrombus,
  bioOrigin,
  sampleRate,
  hrv,
  temperature,
  ppco2Mmhg,
  radiationMsvD,
  onScrollToAct2,
}: Act1GatherProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);

  // GSAP ScrollTrigger to latch activeChapter to 1
  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => setActiveChapter(1),
        onEnterBack: () => setActiveChapter(1),
      });
    },
    { scope: sectionRef, dependencies: [setActiveChapter] },
  );

  // Alarm threshold calculations
  const hrAlarm = typeof hr === 'number' && (hr > 100 || hr < 50);
  const hrStatus =
    hr === null ? 'NO SIGNAL' : hr > 100 ? 'TACHYCARDIA' : hr < 50 ? 'BRADYCARDIA' : 'NOMINAL';
  const spo2Alarm = typeof spo2 === 'number' && spo2 < 94;
  const sqiOk = sqi >= 0.6;
  const co2Ppm = ppco2Mmhg * 1316;
  const co2Alarm = ppco2Mmhg > 3.8;
  const radAlarm = radiationMsvD > 1.5;

  // Resolved tau_w (wall shear stress) from hemodynamics or Poiseuille fallback
  const resolvedTauW =
    typeof tauW === 'number'
      ? tauW
      : ijvCsa > 0
      ? 2 * 0.035 * vmax * Math.sqrt(Math.PI / ijvCsa)
      : 1.2;

  return (
    <section
      ref={sectionRef}
      data-chapter="1"
      className="relative min-h-screen px-4 py-16 sm:px-6 md:px-10 lg:px-12 max-w-[1600px] mx-auto w-full"
      aria-labelledby="act1-heading"
    >
      {/* 1. Centered Editorial Hero Block */}
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        {/* Editorial Transit Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-950/40 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.25em] text-sky-300 font-semibold shadow-[0_0_10px_rgba(56,189,248,0.2)]">
          <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
          • MISSION TO MARS // TRANSIT PHASE // 0.00 G
        </div>

        {/* Title with Gradient Text */}
        <h1
          id="act1-heading"
          className="mt-6 font-sans text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight"
        >
          Continuous Clinical Telemetry &amp;<br />
          <span className="bg-gradient-to-r from-[#38bdf8] to-[#818cf8] bg-clip-text text-transparent">
            Autonomous Bedside Monitoring
          </span>
        </h1>

        {/* Balanced Editorial Subtitle */}
        <p className="mt-4 max-w-3xl font-sans text-base sm:text-lg leading-relaxed text-slate-200">
          Continuous autonomous clinical telemetry and physiological state monitoring.
          First-principles multi-system sensor fusion referenced to NASA-STD-3001
          space medicine standards for deep-space exploration.
        </p>
      </div>

      {/* 2. 3 Large Bento Cards Vitals Anchor */}
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Card 1: HEART RATE */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl transition-all hover:border-sky-500/50">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                HEART RATE
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider ${
                  hrAlarm
                    ? 'border border-rose-500/60 bg-rose-950/50 text-rose-300'
                    : 'border border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    hrAlarm ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'
                  }`}
                />
                {hrStatus}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span
                className={`font-mono text-5xl sm:text-6xl font-bold tracking-tight tabular-nums ${
                  hrAlarm
                    ? 'text-rose-400'
                    : hr === null
                    ? 'text-slate-500'
                    : 'text-white'
                }`}
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum" 1, "zero" 1',
                }}
              >
                {hr === null ? '--' : Math.round(hr)}
              </span>
              <span className="font-mono text-base font-semibold text-slate-400">bpm</span>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-800 pt-3">
            <RecentRange history={history} signal="hr" unit="bpm" />
          </div>
        </div>

        {/* Card 2: OXYGEN SATURATION */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl transition-all hover:border-sky-500/50">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                OXYGEN SATURATION
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider ${
                  sqiOk
                    ? 'border border-sky-400/50 bg-sky-950/40 text-sky-300'
                    : 'border border-amber-500/50 bg-amber-950/40 text-amber-300'
                }`}
              >
                SQI {(sqi * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span
                className={`font-mono text-5xl sm:text-6xl font-bold tracking-tight tabular-nums ${
                  spo2Alarm
                    ? 'text-rose-400'
                    : spo2 === null
                    ? 'text-slate-500'
                    : 'text-white'
                }`}
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum" 1, "zero" 1',
                }}
              >
                {spo2 === null ? '--' : spo2.toFixed(1)}
              </span>
              <span className="font-mono text-base font-semibold text-slate-400">%</span>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-800 pt-3">
            <RecentRange history={history} signal="spo2" unit="%" />
          </div>
        </div>

        {/* Card 3: SYSTEMIC ARTERIAL BP */}
        <div className="flex flex-col justify-between rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-6 backdrop-blur-md shadow-2xl transition-all hover:border-sky-500/50">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                SYSTEMIC ARTERIAL BP
              </span>
              <span className="inline-flex items-center rounded border border-slate-700 bg-slate-900/70 px-2 py-0.5 font-mono text-xs font-semibold text-slate-200">
                {map !== null ? `MAP ${Math.round(map)} mmHg` : 'MAP -- mmHg'}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span
                className="font-mono text-5xl sm:text-6xl font-bold tracking-tight tabular-nums text-white"
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum" 1, "zero" 1',
                }}
              >
                {sbp !== null && dbp !== null ? `${Math.round(sbp)} / ${Math.round(dbp)}` : '-- / --'}
              </span>
              <span className="font-mono text-base font-semibold text-slate-400">mmHg</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="ares-missing-hatch rounded p-2.5 text-center">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
                Intermittent Cuff Telemetry // Non-Invasive Periodic Sampling
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Crew Activity Selector */}
      <div className="mt-8 rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-4 sm:p-5 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
              CREW ACTIVITY:
            </span>
            <div className="flex gap-2" role="group" aria-label="Crew activity selector">
              {(
                [
                  { id: 'rest', label: 'Rest' },
                  { id: 'exercise', label: 'Exercise' },
                  { id: 'eva', label: 'EVA' },
                ] as const
              ).map((act) => {
                const isSelected =
                  act.id === 'eva' ? crewActivity === 'exercise' : crewActivity === act.id;
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() =>
                      onActivityChange(act.id === 'eva' ? 'exercise' : act.id)
                    }
                    aria-pressed={isSelected}
                    className={`rounded-lg px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      isSelected
                        ? 'border border-sky-400 bg-sky-950/60 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                        : 'border border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    {act.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="font-sans text-sm text-slate-200 max-w-xl">
            {ACTIVITY_CONTEXT[crewActivity] ??
              'Activity context adjusts physiological alarm envelopes and metabolic rate.'}
          </p>
        </div>
      </div>

      {/* 4. Bedside Monitoring Bento Grid */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ECG Waveform Strip */}
        <div className="rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-5 sm:p-6 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="font-sans text-lg font-bold text-white">
                ECG Waveform Telemetry
              </h2>
              <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
                20 Hz Live Stream // Lead II Continuous
              </p>
            </div>
            <span
              className={`rounded px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
                sqiOk
                  ? 'border border-emerald-500/50 bg-emerald-950/30 text-emerald-300'
                  : 'border border-rose-500/50 bg-rose-950/30 text-rose-300'
              }`}
            >
              {sqiOk ? 'SQI ACCEPT' : 'SQI REJECT'}
            </span>
          </div>
          <div className="relative mt-4">
            <EcgStrip hr={hr} artifact={artifact} sqi={sqi} isRecorded={isRecorded} />
            {!sqiOk && (
              <div className="ares-missing-hatch absolute inset-0 flex items-center justify-center rounded">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-amber-300">
                  SQI Below Physiological Threshold — Waveform Unreliable
                </span>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-300">
            <span>Sampling: <strong>20 Hz</strong></span>
            <span>Lead: <strong>II</strong></span>
            <span>Artifact Index: <strong>{artifact.toFixed(2)}</strong></span>
            <span>Resp: <strong>{resp !== null ? `${Math.round(resp)} brpm` : '--'}</strong></span>
          </div>
        </div>

        {/* POCUS Internal Jugular Vein */}
        <div className="rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-5 sm:p-6 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="font-sans text-lg font-bold text-white">
                POCUS // Internal Jugular Vein
              </h2>
              <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
                B-Mode Ultrasound &amp; Spectral Doppler Cross-Section
              </p>
            </div>
            <span
              className={`rounded px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
                thrombus
                  ? 'border border-rose-500/60 bg-rose-950/40 text-rose-300'
                  : 'border border-emerald-500/50 bg-emerald-950/30 text-emerald-300'
              }`}
            >
              {thrombus === true
                ? 'THROMBUS CONFIRMED'
                : thrombus === false
                ? 'NEGATIVE'
                : 'NO THROMBUS DETECTED'}
            </span>
          </div>
          <div className="mt-4">
            <PocusIjv csa={ijvCsa} vmax={vmax} thrombus={thrombus} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-slate-800 pt-3 text-center">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                CSA
              </span>
              <span className="font-mono text-base font-bold tabular-nums text-white">
                {ijvCsa.toFixed(2)} cm²
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                V<sub>max</sub>
              </span>
              <span className="font-mono text-base font-bold tabular-nums text-white">
                {vmax.toFixed(1)} cm/s
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <span className="block font-mono text-xs uppercase tracking-wider text-slate-400">
                Wall Shear (τ<sub>w</sub>)
              </span>
              <span
                className={`font-mono text-base font-bold tabular-nums ${
                  resolvedTauW < 2.5 ? 'text-amber-300' : 'text-emerald-400'
                }`}
              >
                {resolvedTauW.toFixed(2)} dyn/cm²
              </span>
            </div>
          </div>
        </div>

        {/* ECLSS 2x2 Atmospheric Grid */}
        <div className="rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-5 sm:p-6 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="font-sans text-lg font-bold text-white">
                ECLSS Atmospheric &amp; Radiation
              </h2>
              <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
                Habitat Life Support &amp; Cosmic Ray Dosimetry
              </p>
            </div>
            <span
              className={`rounded px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
                co2Alarm || radAlarm
                  ? 'border border-amber-500/60 bg-amber-950/40 text-amber-300'
                  : 'border border-slate-700 bg-slate-900/50 text-slate-300'
              }`}
            >
              {co2Alarm || radAlarm ? 'ADVISORY' : 'NOMINAL'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-slate-300">
                  Cabin CO₂
                </span>
                {co2Alarm && (
                  <span className="font-mono text-[10px] font-bold text-amber-300 uppercase">HIGH</span>
                )}
              </div>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                {ppco2Mmhg.toFixed(2)}{' '}
                <span className="text-sm font-normal text-slate-400">mmHg</span>
              </p>
              <span className="font-mono text-xs text-slate-400">
                {Math.round(co2Ppm).toLocaleString()} ppm (Limit: 3.8 mmHg)
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-300">
                O₂ Partial Pressure
              </span>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                21.0 <span className="text-sm font-normal text-slate-400">kPa</span>
              </p>
              <span className="font-mono text-xs text-slate-400">
                Sea-level equivalent normoxic
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-300">
                Cabin Temperature
              </span>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                21.5 <span className="text-sm font-normal text-slate-400">°C</span>
              </p>
              <span className="font-mono text-xs text-slate-400">
                HVAC thermal loop nominal
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-slate-300">
                  Radiation (CANS)
                </span>
                {radAlarm && (
                  <span className="font-mono text-[10px] font-bold text-rose-400 uppercase">SPE SHELTER</span>
                )}
              </div>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                {radiationMsvD.toFixed(3)}{' '}
                <span className="text-sm font-normal text-slate-400">mSv/d</span>
              </p>
              <span className="font-mono text-xs text-slate-400">
                SPE Threshold: 1.500 mSv/d
              </span>
            </div>
          </div>
        </div>

        {/* MeasurementContext Signal Coverage */}
        <div className="rounded-xl border border-[#27364b]/80 bg-[#000000]/85 p-5 sm:p-6 backdrop-blur-md">
          <MeasurementContext
            source={bioOrigin}
            sampleRate={sampleRate}
            hrv={hrv}
            temperature={temperature}
          />
        </div>
      </div>

      {/* 5. Animated Scroll Cue to Act 2 */}
      <div className="mt-16 flex flex-col items-center justify-center">
        <button
          type="button"
          onClick={onScrollToAct2}
          className="group flex flex-col items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
        >
          <span>PROCEED TO ACT 02 // EVALUATE</span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-400/50 bg-sky-950/40 group-hover:bg-sky-900/50 group-hover:border-sky-300 animate-bounce transition-all shadow-[0_0_10px_rgba(56,189,248,0.25)]">
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
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </span>
        </button>
      </div>
    </section>
  );
}
