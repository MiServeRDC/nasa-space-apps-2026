// Chapter 2: Cardio — thoracic and hemodynamic bedside monitor narrative section.
// Hosts EcgStrip (20 Hz live), PocusIjv ultrasound, MeasurementContext signal
// coverage, ECLSS atmospheric monitor, and cosmic radiation dosimeter CANS.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EcgStrip, PocusIjv } from '../../modules/analysis-imaging/Imaging';
import { MeasurementContext } from '../../modules/crew-vitals/MeasurementContext';
import { useScrollyContext } from '../ScrollyContext';
import type { DataOrigin } from '../../types/telemetry';
import type { RecordedHistoryPoint } from '../../lib/useTelemetry';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Chapter2CardioProps {
  /** Heart rate bpm or null. */
  hr?: number | null;
  /** Artifact level [0..1]. */
  artifact?: number;
  /** ECG signal quality index [0..1]. */
  sqi: number;
  /** Whether using recorded bidmc replay. */
  isRecorded?: boolean;
  /** IJV cross-sectional area cm2. */
  ijvCsa: number;
  /** IJV peak velocity cm/s. */
  vmax: number;
  /** Whether POCUS confirms intraluminal thrombus. */
  thrombus: boolean | null;
  /** Data provenance for MeasurementContext. */
  bioOrigin: DataOrigin;
  /** Native biosensor sample rate Hz. */
  sampleRate: number;
  /** Formatted HRV string or null. */
  hrv: string | null;
  /** Core temperature Celsius or null. */
  temperature: number | null;
  /** Cabin CO2 partial pressure mmHg. */
  ppco2Mmhg: number;
  /** Radiation dose rate mSv/d. */
  radiationMsvD: number;
  history: RecordedHistoryPoint[];
}

// ---------------------------------------------------------------------------
// InlineMetricRow — single-row metric for atmospheric/radiation panels
// ---------------------------------------------------------------------------

function InlineMetricRow({
  label,
  value,
  unit,
  alarm,
  missing,
}: {
  label: string;
  value: string;
  unit: string;
  alarm?: boolean;
  missing?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-b-0 ${missing ? 'ares-missing-hatch rounded' : ''}`}>
      <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">{label}</span>
      <span className="flex items-baseline gap-1">
        <span
          className={`font-mono text-[11px] tabular-nums font-semibold ${
            missing
              ? 'text-[var(--color-status-caution)]'
              : alarm
              ? 'text-[var(--color-status-critical)]'
              : 'text-[var(--color-ink-display)]'
          }`}
        >
          {value}
        </span>
        {!missing && <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">{unit}</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelCard — reusable bordered panel shell
// ---------------------------------------------------------------------------

function PanelCard({ title, tag, children, className = '' }: { title: string; tag?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-[var(--color-border)] bg-[var(--color-surface-l1)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-l2)]">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-meta)]">
          {title}
        </h3>
        {tag && (
          <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">{tag}</span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chapter2Cardio
// ---------------------------------------------------------------------------

export function Chapter2Cardio({
  hr = 68,
  artifact = 0.1,
  sqi,
  isRecorded = false,
  ijvCsa,
  vmax,
  thrombus,
  bioOrigin,
  sampleRate,
  hrv,
  temperature,
  ppco2Mmhg,
  radiationMsvD,
}: Chapter2CardioProps) {
  const { setActiveChapter } = useScrollyContext();
  const sectionRef = useRef<HTMLElement>(null);

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

  const co2Ppm = ppco2Mmhg * 1316;
  const co2Alarm = ppco2Mmhg > 3.8;
  const radAlarm = radiationMsvD > 1.5;
  const sqiOk = sqi >= 0.6;

  return (
    <section
      ref={sectionRef}
      data-chapter="2"
      className="min-h-screen px-6 py-20 md:px-14"
      aria-labelledby="ch2-heading"
    >
      {/* Section header */}
      <div className="mb-10 max-w-xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--color-ink-muted)] mb-2">
          Chapter 02 // Cardiorespiratory &amp; Hemodynamic
        </p>
        <h2
          id="ch2-heading"
          className="font-sans text-3xl font-semibold tracking-tight text-[var(--color-ink-display)]"
        >
          Thoracic Monitor
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-[var(--color-ink-meta)] max-w-md">
          Real-time ECG waveform, internal jugular vein POCUS, and ECLSS
          atmospheric monitoring with cosmic radiation dosimetry.
        </p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">

        {/* ECG strip */}
        <PanelCard
          title="ECG Waveform"
          tag={`SQI ${sqi.toFixed(2)} ${sqiOk ? 'ACCEPT' : 'REJECT'}`}
          className="xl:col-span-2"
        >
          <div className="relative">
            <EcgStrip hr={hr} artifact={artifact} sqi={sqi} isRecorded={isRecorded} />
            {!sqiOk && (
              <div className="ares-missing-hatch absolute inset-0 flex items-center justify-center rounded">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-status-caution)]">
                  SQI below threshold — waveform unreliable
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-4">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)] uppercase">Lead</span>
              <span className="font-mono text-[10px] text-[var(--color-ink-body)]">II</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)] uppercase">Rate</span>
              <span className="font-mono text-[10px] text-[var(--color-ink-body)]">20 Hz</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)] uppercase">SQI</span>
              <span className={`font-mono text-[10px] ${sqiOk ? 'text-[var(--color-status-nominal)]' : 'text-[var(--color-status-critical)]'}`}>
                {sqi.toFixed(2)}
              </span>
            </div>
          </div>
        </PanelCard>

        {/* POCUS IJV */}
        <PanelCard title="POCUS — Internal Jugular Vein" tag="B-MODE + DOPPLER">
          <PocusIjv csa={ijvCsa} vmax={vmax} thrombus={thrombus} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">CSA</span>
              <span className="ml-2 font-mono text-[10px] text-[var(--color-ink-display)] tabular-nums">
                {ijvCsa.toFixed(2)} cm²
              </span>
            </div>
            <div>
              <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">V<sub>max</sub></span>
              <span className="ml-2 font-mono text-[10px] text-[var(--color-ink-display)] tabular-nums">
                {vmax.toFixed(1)} cm/s
              </span>
            </div>
            {thrombus !== null && (
              <div className="col-span-2">
                <span className={`font-mono text-[10px] uppercase tracking-widest ${thrombus ? 'text-[var(--color-status-critical)]' : 'text-[var(--color-status-nominal)]'}`}>
                  {thrombus ? 'THROMBUS CONFIRMED' : 'No intraluminal thrombus'}
                </span>
              </div>
            )}
          </div>
        </PanelCard>

        {/* Signal coverage / MeasurementContext */}
        <PanelCard title="Signal Coverage">
          <MeasurementContext
            source={bioOrigin}
            sampleRate={sampleRate}
            hrv={hrv}
            temperature={temperature}
          />
        </PanelCard>

        {/* ECLSS atmospheric monitor */}
        <PanelCard title="ECLSS Atmosphere" tag="ISS / HABITAT">
          <InlineMetricRow
            label="Cabin CO2"
            value={ppco2Mmhg.toFixed(2)}
            unit="mmHg"
            alarm={co2Alarm}
          />
          <InlineMetricRow
            label="CO2 (ppm)"
            value={Math.round(co2Ppm).toLocaleString()}
            unit="ppm"
            alarm={co2Alarm}
          />
          <InlineMetricRow
            label="O2 partial pressure"
            value="21.0"
            unit="kPa"
          />
          {/* Cabin pressure — uninstrumented channel shown with hatch */}
          <InlineMetricRow
            label="Cabin pressure (direct)"
            value="NO CHANNEL"
            unit=""
            missing={true}
          />
          <p className="mt-2 font-mono text-[9px] text-[var(--color-ink-muted)]">
            Nominal: &lt;2.0 mmHg | Caution: 2.0-3.8 | Critical: &gt;3.8
          </p>
        </PanelCard>

        {/* Cosmic radiation dosimeter CANS */}
        <PanelCard title="Radiation Dosimetry" tag="CANS / GCR">
          <InlineMetricRow
            label="Current dose rate"
            value={radiationMsvD.toFixed(3)}
            unit="mSv/d"
            alarm={radAlarm}
          />
          <InlineMetricRow
            label="SPE threshold"
            value="1.500"
            unit="mSv/d"
          />
          {/* Tissue dose — uninstrumented */}
          <InlineMetricRow
            label="Tissue-weighted dose"
            value="NO CHANNEL"
            unit=""
            missing={true}
          />
          <InlineMetricRow
            label="SEU restart count"
            value="0"
            unit="events"
          />
          <p className="mt-2 font-mono text-[9px] text-[var(--color-ink-muted)]">
            NASA-STD-3001 Vol 2 §6043 SPE shelter trigger: &gt;1.5 mSv/d
          </p>
        </PanelCard>

      </div>
    </section>
  );
}
