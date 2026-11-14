import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  alarmFor,
  clamp,
  DEFAULT_WHATIF,
  evaluate,
  LBNP_SBP_DROP_LIMIT_MMHG,
  nqs,
  SEX_PROFILES,
  type PredicateKey,
  type ScenarioState,
  type WhatIf,
} from './lib/scenario';
import {
  formatNullableMetric,
  formatTimeToViolation,
  isPureRecordedReplay,
} from './lib/telemetryValidation';
import { ENGINE_HTTP_URL, useTelemetry, type RecordedHistoryPoint } from './lib/useTelemetry';
import { AlarmBadge, TriPhaseHeader, type Phase } from './modules/header-triphase/TriPhaseHeader';
import { MriGauge, PredicateBars, StlChart } from './modules/mri-and-stl/MriAndStl';
import type { InjuryMarker } from './types/injury';
import { BodyHeatmap } from './modules/body-3d-heatmap/BodyHeatmap';
import { WhatIfConsole } from './modules/whatif-console/WhatIfConsole';
import { PlaybookRunner } from './modules/playbook-runner/PlaybookRunner';
import { EcgStrip, OcularOnsd, PocusIjv } from './modules/analysis-imaging/Imaging';
import { FreshnessBadge, OriginBadge, ProvenanceBanner } from './modules/provenance/ProvenanceInspector';
import { OsSystemStatusBar } from './modules/os-shell/OsSystemStatusBar';
import { OsCommandPalette } from './modules/os-shell/OsCommandPalette';
import type { DataOrigin, FreshnessStatus, TelemetryPacket } from './types/telemetry';

type EvalTab = 'BODY_3D' | 'POCUS' | 'MUSCLE_BONE' | 'FORECAST';

const RISK_LABEL: Record<PredicateKey, string> = {
  tau_w: 'Slow blood flow in your neck vein',
  onsd: 'Fluid pressure behind your eyes (SANS)',
  ppco2: 'High cabin CO2 level',
  soleus: 'Calf muscle loss',
  sclerostin: 'Bone density loss',
  gai: 'Balance risk for Mars gravity (0.38 g)',
  hr: 'Elevated heart rate',
  spo2: 'Low blood oxygen',
};

function Card({
  title,
  tag,
  origin,
  freshness,
  children,
  className = '',
}: {
  title: string;
  tag?: string;
  origin?: DataOrigin;
  freshness?: FreshnessStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-lg border border-line bg-panel p-4 ${className}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-100">{title}</h3>
          {origin && <OriginBadge origin={origin} />}
          {freshness && <FreshnessBadge freshness={freshness} />}
        </div>
        {tag && <span className="font-mono text-xs text-gray-500">{tag}</span>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  limit,
  bad,
}: {
  label: string;
  value: string;
  unit: string;
  limit?: string;
  bad?: boolean;
}) {
  const isUnavail = value === 'UNAVAILABLE' || value === 'MISSING' || value.startsWith('UNAVAILABLE');
  return (
    <div className="flex items-baseline justify-between border-b border-line py-1 font-mono text-xs">
      <span className="text-gray-400">{label}</span>
      <span>
        <span className={isUnavail ? 'text-advisory' : bad ? 'font-bold text-critical' : 'text-white'}>{value}</span>
        {!isUnavail && <span className="text-gray-500"> {unit}</span>}
        {limit && <span className="ml-2 text-gray-600">({limit})</span>}
      </span>
    </div>
  );
}

function UnavailableSubsystemPanel({
  title,
  reason,
  linkIsLive,
  onEngageOverlay,
}: {
  title: string;
  reason: string;
  linkIsLive: boolean;
  onEngageOverlay: () => void;
}) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center rounded border border-line bg-black p-6 text-center font-mono text-xs">
      <div className="mb-2 flex items-center gap-2">
        <OriginBadge origin="UNAVAILABLE" />
        <FreshnessBadge freshness="UNAVAILABLE" />
      </div>
      <div className="text-sm font-bold text-advisory">{title}</div>
      <p className="mt-2 max-w-lg text-gray-400">{reason}</p>
      {linkIsLive && (
        <button
          type="button"
          onClick={onEngageOverlay}
          className="mt-4 cursor-pointer rounded border border-warning px-3 py-1.5 text-warning hover:bg-warning/15"
        >
          ENGAGE WHAT-IF SCENARIO OVERLAY (SIMULATED)
        </button>
      )}
    </div>
  );
}

function VitalsTrend({ history }: { history: RecordedHistoryPoint[] }) {
  const [metric, setMetric] = useState<'hr' | 'spo2' | 'resp' | 'pulse'>('hr');
  const signals = { hr: ['Heart rate', 'bpm'], spo2: ['Blood oxygen', '%'], resp: ['Breathing', 'br/min'], pulse: ['Pulse', 'bpm'] } as const;
  const points = history.filter(point => point[metric] !== null);
  const values = points.map(point => point[metric] ?? 0);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  const padding = Math.max(1, (high - low) * 0.15);
  const start = history[0]?.relativeTimeS ?? 0;
  const end = history.at(-1)?.relativeTimeS ?? start;
  const x = (t: number) => 12 + (t - start) * 736 / Math.max(1, end - start);
  const y = (v: number) => 12 + (high + padding - v) * 130 / (high - low + 2 * padding);
  let penDown = false;
  const path = history.map(point => {
    const value = point[metric];
    if (value === null) { penDown = false; return ''; }
    const command = penDown ? 'L' : 'M';
    penDown = true;
    return `${command}${x(point.relativeTimeS)},${y(value)}`;
  }).join(' ');
  return (
    <section className="health-trend" aria-label="Recorded vital trends">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2>Recorded trends</h2>
        <div className="flex flex-wrap gap-1" aria-label="Choose signal">
          {(Object.keys(signals) as (keyof typeof signals)[]).map(key => (
            <button key={key} type="button" aria-pressed={key === metric} onClick={() => setMetric(key)}
              className="health-choice">{signals[key][0]}</button>
          ))}
        </div>
      </div>
      {points.length >= 2 ? <>
        <svg viewBox="0 0 760 154" preserveAspectRatio="none" role="img"
          aria-label={`${signals[metric][0]} over recorded time`} className="mt-4 h-36 w-full">
          {[22, 62, 102, 142].map(row => <line key={row} x1="12" x2="748" y1={row} y2={row} stroke="#283345" />)}
          <path d={path} fill="none" stroke="#a6baf1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {points.map(point => <circle key={point.relativeTimeS} cx={x(point.relativeTimeS)}
            cy={y(point[metric] ?? 0)} r="1.25" fill="#a6baf1" />)}
        </svg>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{start.toFixed(0)} s</span><span>{low}–{high} {signals[metric][1]}</span><span>{end.toFixed(0)} s</span>
        </div>
      </> : <p className="py-9 text-sm text-gray-400">Waiting for recorded samples for this signal.</p>}
    </section>
  );
}

/** Builds a ScenarioState from an authoritative backend packet that includes simulated/derived blocks. */
function deriveStateFromPacket(
  packet: TelemetryPacket,
  whatIf: WhatIf,
  lastScanDay: number,
  localFallback: ScenarioState,
): ScenarioState {
  if (packet.is_local_simulation) return localFallback;

  const P = SEX_PROFILES[whatIf.sex];
  const h = packet.hemodynamics;
  const m = packet.musculoskeletal;
  const e = packet.environment;

  const csa = h?.ijv_csa_cm2 ?? localFallback.csa;
  const vmax = h?.ijv_velocity_max_cm_s ?? localFallback.vmax;
  const tauW = h?.wall_shear_stress_dyn_cm2 ?? localFallback.tauW;
  const onsdMm = h?.onsd_mm ?? localFallback.onsdMm;
  const ppco2 =
    e?.cabin_ppco2_mmhg ??
    (e?.cabin_co2_ppm != null ? e.cabin_co2_ppm / 1316 : whatIf.ppco2_mmhg);

  const soleusMm =
    m?.soleus_thickness_mm ??
    (m?.soleus_volume_loss_pct != null ? P.soleusNominal * (1 - m.soleus_volume_loss_pct / 100) : localFallback.soleusMm);
  const soleusLossPct =
    m?.soleus_volume_loss_pct ??
    (m?.soleus_csa_pct != null ? Math.max(0, 100 - m.soleus_csa_pct) : clamp((1 - soleusMm / P.soleusNominal) * 100, 0, 50));
  const sclerostin = m?.sclerostin_pmol_l ?? localFallback.sclerostin;
  const bmdLossPct = m?.bmd_loss_pct_per_month ?? localFallback.bmdLossPct;
  const gaiPct = m?.gait_asymmetry_index_pct ?? m?.gai_pct ?? localFallback.gaiPct;

  const hrVal = packet.biometrics.heart_rate_bpm ?? localFallback.hr;
  const spo2Val = packet.biometrics.spo2_percent ?? localFallback.spo2;
  const respVal = packet.biometrics.respiration_rate_brpm ?? localFallback.resp;
  const sqi = packet.biometrics.sqi_score ?? localFallback.sqi;

  const rho: Record<PredicateKey, number> = {
    tau_w: packet.safety_margins.per_predicate_rho?.tau_w ?? nqs(tauW, P.tauWNominal, P.tauWCritical),
    onsd: packet.safety_margins.per_predicate_rho?.sans ?? nqs(onsdMm, P.onsdNominal, P.onsdCritical),
    ppco2: nqs(ppco2, P.ppco2Nominal, P.ppco2Critical),
    soleus: nqs(soleusMm, P.soleusNominal, P.soleusCritical),
    sclerostin: packet.safety_margins.per_predicate_rho?.sclerostin ?? nqs(sclerostin, P.sclerostinNominal, P.sclerostinCritical),
    gai: nqs(gaiPct, P.gaiNominal, P.gaiCritical),
    hr: nqs(hrVal, P.hrBase + 4, P.hrLimit),
    spo2: nqs(spo2Val, P.spo2Nominal, P.spo2Critical),
  };
  const entries = Object.entries(rho) as [PredicateKey, number][];
  const [worst, derivedRhoMin] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  const rhoMin = packet.safety_margins.med_stl_rho_robustness ?? derivedRhoMin;
  const mri = packet.safety_margins.mission_readiness_index ?? localFallback.mri;
  const day = packet.mission_elapsed_days ?? whatIf.mission_day;
  const daysSinceScan = Math.max(0, day - lastScanDay);

  return {
    ...localFallback,
    hr: hrVal,
    spo2: spo2Val,
    resp: respVal,
    sqi,
    hrAccepted: packet.biometrics.heart_rate_bpm !== null,
    csa,
    vmax,
    tauW,
    onsdMm,
    daysSinceScan,
    soleusMm,
    soleusLossPct,
    sclerostin,
    bmdLossPct,
    gaiPct,
    rho,
    worst,
    rhoMin,
    mri,
  };
}

export default function App() {
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);
  const [thrombus, setThrombus] = useState<boolean | null>(null);
  const [lastScanDay, setLastScanDay] = useState<number>(DEFAULT_WHATIF.mission_day - 5);
  const [ventEvent, setVentEvent] = useState<string | null>(null);
  const [injuries, setInjuries] = useState<InjuryMarker[]>([]);
  const injuryPhotoUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = injuryPhotoUrls.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  const releaseInjuryPhoto = (injury?: InjuryMarker) => {
    if (!injury?.photoUrl) return;
    URL.revokeObjectURL(injury.photoUrl);
    injuryPhotoUrls.current.delete(injury.photoUrl);
  };
  const addInjury = (injury: InjuryMarker) => {
    releaseInjuryPhoto(injuries.find(note => note.region === injury.region));
    if (injury.photoUrl) injuryPhotoUrls.current.add(injury.photoUrl);
    setInjuries(current => [...current.filter(note => note.region !== injury.region), injury]);
  };
  const resolveInjury = (id: string) => {
    releaseInjuryPhoto(injuries.find(note => note.id === id));
    setInjuries(current => current.filter(note => note.id !== id));
  };
  const [activePhase, setActivePhase] = useState<Phase>('GATHER');
  const [evalTab, setEvalTab] = useState<EvalTab>('BODY_3D');
  const [whatIfOverlayActive, setWhatIfOverlayActive] = useState<boolean>(false);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);

  const {
    packet,
    link,
    transportMode,
    ipcLatencyUs,
    binaryFrameCount,
    lastBinaryFrame,
    osStatus,
    status,
    recordedHistory,
    syncWhatIfNow,
  } = useTelemetry(
    whatIf,
    thrombus,
    lastScanDay,
    whatIfOverlayActive,
  );
  const localSim = useMemo(() => evaluate(whatIf, lastScanDay), [whatIf, lastScanDay]);
  const s = useMemo(() => deriveStateFromPacket(packet, whatIf, lastScanDay, localSim), [packet, whatIf, lastScanDay, localSim]);

  const P = SEX_PROFILES[whatIf.sex];
  const isPureReplay = isPureRecordedReplay(packet);
  const isRecordedBiometrics = packet.provenance_manifest.biometrics_source === 'RECORDED_TERRESTRIAL_BIDMC_CSV';
  const qualityFlags = useMemo(
    () =>
      Array.from(
        new Set([
          ...(packet.quality_flags ?? []),
          ...(packet.biometrics.quality_flags ?? []),
          ...(status.heldSample ? ['HOLD_LAST_VALID'] : []),
        ]),
      ),
    [packet, status.heldSample],
  );
  const missingChannels = packet.biometrics.missing_channels ?? [];

  // Hard Safety Gate 2: LBNP anti-syncope auto-vent, latched until crew re-arms.
  useEffect(() => {
    if (whatIf.lbnp_mmhg === 0 || ventEvent) return;
    const drop = localSim.sbpBaseline - localSim.sbp;
    if (drop > LBNP_SBP_DROP_LIMIT_MMHG || localSim.hr > P.hrLimit) {
      setVentEvent(
        `Chamber vented from ${whatIf.lbnp_mmhg} mmHg to 0 mmHg (BP drop ${drop.toFixed(0)} mmHg, HR ${localSim.hr.toFixed(0)} bpm / limit ${P.hrLimit}).`,
      );
      setWhatIf((w) => ({ ...w, lbnp_mmhg: 0 }));
    }
  }, [whatIf.lbnp_mmhg, localSim, ventEvent, P.hrLimit]);

  const sm = packet.safety_margins;
  const b = packet.biometrics;
  const recommendedPhase: Phase =
    sm.alarm_level === 'CRITICAL' || sm.alarm_level === 'WARNING'
      ? 'ACT'
      : sm.alarm_level === 'ADVISORY' || sm.alarm_level === 'DATA_DEGRADED_MISSING_CHANNELS'
        ? 'EVALUATE'
        : 'GATHER';

  const ttvFormatted = formatTimeToViolation(sm, qualityFlags);

  const hrFmt = formatNullableMetric(b.heart_rate_bpm, 0, {
    channelName: 'heart_rate_bpm',
    qualityFlags,
    missingChannels,
  });
  const pulseFmt = formatNullableMetric(b.pulse_rate_bpm, 0, {
    channelName: 'pulse_rate_bpm',
    qualityFlags,
    missingChannels,
  });
  const spo2Fmt = formatNullableMetric(b.spo2_percent, 1, {
    channelName: 'spo2_percent',
    qualityFlags,
    missingChannels,
  });
  const respFmt = formatNullableMetric(b.respiration_rate_brpm, 1, {
    channelName: 'respiration_rate_brpm',
    qualityFlags,
    missingChannels,
  });
  const hrvFmt = formatNullableMetric(b.hrv_rmssd_ms, 1, {
    channelName: 'hrv_rmssd_ms',
    qualityFlags,
    missingChannels,
    isRhythmDependent: true,
  });

  const bioOrigin: DataOrigin = packet.is_local_simulation
    ? 'SIMULATED_SCENARIO_INPUT'
    : packet.provenance_manifest.biometrics_source;

  const bioFreshness = (unavailable: boolean): FreshnessStatus => {
    if (status.validationError && status.isStale) return 'INVALID';
    if (unavailable) return 'UNAVAILABLE';
    if (status.isStale) return 'HELD_STALE';
    if (status.heldSample) return 'HOLD_LAST_VALID';
    return 'FRESH';
  };

  const handleWhatIfChange = (next: WhatIf) => {
    setWhatIf(next);
    if (link === 'ENGINE_LIVE') {
      setWhatIfOverlayActive(true);
    }
  };

  const handleThrombusChange = (v: boolean | null) => {
    setThrombus(v);
    if (link === 'ENGINE_LIVE') {
      setWhatIfOverlayActive(true);
    }
  };

  const hasHemodynamics = packet.hemodynamics !== null && packet.hemodynamics !== undefined;
  const hasMusculoskeletal = packet.musculoskeletal !== null && packet.musculoskeletal !== undefined;

  const predicateBarsMap: Record<string, number | null> =
    sm.per_predicate_rho ??
    (hasHemodynamics && hasMusculoskeletal
      ? s.rho
      : {
          heart_rate: b.heart_rate_bpm !== null ? nqs(b.heart_rate_bpm, 72, 120) : null,
          spo2: b.spo2_percent !== null ? nqs(b.spo2_percent, 98, 90) : null,
          respiration: b.respiration_rate_brpm !== null ? nqs(b.respiration_rate_brpm, 16, 30) : null,
          hrv_rmssd: null,
        });

  return (
    <div className="health-shell">
      <TriPhaseHeader
        astronautId={packet.astronaut_id}
        alarm={sm.alarm_level}
        link={link}
        wsConnected={status.wsConnected}
        activePhase={activePhase}
        recommendedPhase={recommendedPhase}
        onSelectPhase={setActivePhase}
      />

      <div className="health-workspace">
        <div className="health-page-heading">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {activePhase === 'GATHER' ? 'Crew vitals' : activePhase === 'EVALUATE' ? 'Health assessment' : 'Guided actions'}
            </h1>
            <p className="mt-1 text-sm text-gray-400">{isPureReplay ? "BIDMC recorded replay" : "Simulated flight scenario"}</p>
          </div>
          <button type="button" onClick={() => setPaletteOpen(true)}
            className="min-h-12 rounded-lg border border-line px-4 text-sm text-gray-200 hover:bg-panel focus-visible:outline-2 focus-visible:outline-nominal">
            Mission tools
          </button>
        </div>
        <div className="health-content">
          <main className="min-w-0 space-y-4">
            {/* Assessment summary */}
            {activePhase !== 'GATHER' && !(activePhase === 'EVALUATE' && evalTab === 'BODY_3D') && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-4 py-2">
              <div className="text-sm text-gray-200">
                <span className="mr-2 font-mono text-xs text-gray-500">
                  {packet.mission_elapsed_days != null
                    ? `MISSION DAY ${Math.round(packet.mission_elapsed_days)}`
                    : `TERRESTRIAL REPLAY t=${packet.relative_recording_time_s.toFixed(1)}s`}
                </span>
                {isPureReplay ? (
                  <span className="font-mono text-xs text-gray-300">
                    NQS margin:{' '}
                    <span className={sm.med_stl_rho_robustness === null ? 'text-advisory' : 'text-nominal'}>
                      {sm.med_stl_rho_robustness === null ? 'UNAVAILABLE' : sm.med_stl_rho_robustness.toFixed(2)}
                    </span>
                  </span>
                ) : (
                  <>
                    Main watch item:{' '}
                    <span className={`font-semibold ${s.rhoMin < 0 ? 'text-critical' : s.rhoMin < 0.4 ? 'text-advisory' : 'text-nominal'}`}>
                      {RISK_LABEL[s.worst]}
                    </span>
                    <span className="ml-2 font-mono text-xs text-gray-400">
                      (margin {sm.med_stl_rho_robustness != null ? sm.med_stl_rho_robustness.toFixed(2) : s.rhoMin.toFixed(2)})
                    </span>
                  </>
                )}
              </div>
              <div className="font-mono text-xs text-gray-400">
                TTV:{' '}
                <span className={ttvFormatted.state === 'UNAVAILABLE' ? 'text-advisory' : 'text-gray-200'}>
                  {ttvFormatted.primaryText}
                </span>
              </div>
            </div>}

            {/* PAGE 1: GATHER */}
            {activePhase === 'GATHER' && (
              <div className="space-y-5">
                <section className="bedside-monitor" aria-label="Current vital signs">
                  <div className="monitor-heading">
                    <h2>Cardiac monitor</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <OriginBadge origin={bioOrigin} />
                      <FreshnessBadge freshness={bioFreshness(false)} ageMs={status.heldSample ? status.heldAgeMs : null} />
                    </div>
                  </div>
                  <div className="monitor-cardiac">
                    <div className="min-w-0">
                      <p className="monitor-trace-label">Illustrative ECG waveform</p>
                      <EcgStrip
                        hr={status.isStale ? null : b.heart_rate_bpm}
                        artifact={isRecordedBiometrics ? 0 : whatIf.artifact_level}
                        sqi={b.sqi_score ?? localSim.sqi}
                      />
                    </div>
                    <div className="monitor-vital monitor-heart">
                      <span>Heart rate</span>
                      <strong className={hrFmt.unavailable ? 'vital-unavailable' : ''}>{hrFmt.text}</strong>
                      {!hrFmt.unavailable && <small>bpm</small>}
                    </div>
                  </div>
                  <dl className="monitor-secondary">
                    {[
                      { label: 'Blood oxygen', fmt: spo2Fmt, unit: '%', color: 'oxygen' },
                      { label: 'Breathing rate', fmt: respFmt, unit: 'br/min', color: 'breathing' },
                      { label: 'Pulse', fmt: pulseFmt, unit: 'bpm', color: 'pulse' },
                    ].map(({ label, fmt, unit, color }) => (
                      <div key={label} className={`monitor-vital monitor-${color}`}>
                        <dt>{label}</dt>
                        <dd>
                          <strong className={fmt.unavailable ? 'vital-unavailable' : ''}>{fmt.text}</strong>
                          {!fmt.unavailable && <small>{unit}</small>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <VitalsTrend history={recordedHistory} />
                <section className="health-region p-5" aria-label="Recording and signal details">
                  <h2 className="mb-3 text-lg font-semibold text-white">Recording and signal details</h2>
                  <p className="mb-3 text-sm text-gray-300">
                    HRV (RMSSD) · {hrvFmt.text}{hrvFmt.unavailable ? '' : ' ms'}
                  </p>
                  <p className="text-sm text-gray-400">{recordedHistory.length} recorded samples · BIDMC 1 Hz</p>
                </section>
              </div>
            )}

            {/* PAGE 2: EVALUATE */}
            {activePhase === 'EVALUATE' && (
              <div className="flex shrink-0 flex-col gap-3">
                <div className="health-sections">
                  {([
                    ['BODY_3D', 'Body overview'],
                    ['POCUS', 'Ultrasound'],
                    ['MUSCLE_BONE', 'Muscle & bone'],
                    ['FORECAST', 'Safety forecast'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setEvalTab(id)}
                      aria-pressed={evalTab === id}
                      className={`cursor-pointer rounded border px-3 py-1.5 ${
                        evalTab === id ? 'border-nominal bg-nominal/15 font-bold text-nominal' : 'border-line text-gray-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {evalTab === 'BODY_3D' && (
                  <Card
                    title="Body overview"
                    tag="Drag to rotate · scroll to zoom"
                  >
                    <BodyHeatmap
                      s={isPureReplay ? null : s}
                      sex={whatIf.sex}
                      injuries={injuries}
                      onAddInjury={addInjury}
                      onResolveInjury={resolveInjury}
                      onChangeSex={(sex) => handleWhatIfChange({ ...whatIf, sex })}
                      onOpenTab={setEvalTab}
                    />
                  </Card>
                )}

                {evalTab === 'POCUS' && (
                  <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
                    <Card
                      title="Neck Vein Ultrasound (IJV)"
                      tag="SYNTHETIC B-MODE"
                      origin={hasHemodynamics ? packet.hemodynamics!.provenance : 'UNAVAILABLE'}
                      className="min-h-0"
                    >
                      {!hasHemodynamics ? (
                        <UnavailableSubsystemPanel
                          title="IJV HEMODYNAMICS UNAVAILABLE"
                          reason="Pure BIDMC replay does not carry jugular ultrasound or microgravity fluid-shift inputs."
                          linkIsLive={link === 'ENGINE_LIVE'}
                          onEngageOverlay={() => setWhatIfOverlayActive(true)}
                        />
                      ) : (
                        <>
                          <PocusIjv
                            csa={s.csa}
                            vmax={s.vmax}
                            thrombus={packet.hemodynamics?.pocus_thrombus_confirmed ?? thrombus}
                          />
                          <div className="mt-2">
                            <Metric label="Vein area (CSA)" value={s.csa.toFixed(2)} unit="cm2" limit={`> ${P.ijvCriticalCsa} risk`} bad={s.csa > P.ijvCriticalCsa} />
                            <Metric label="Flow speed (Vmax)" value={s.vmax.toFixed(1)} unit="cm/s" limit={`< ${P.vmaxCritical} risk`} bad={s.vmax < P.vmaxCritical} />
                            <Metric label="Wall shear stress" value={s.tauW.toFixed(2)} unit="dyn/cm2" limit={`< ${P.tauWCritical} risk`} bad={s.tauW < P.tauWCritical} />
                          </div>
                        </>
                      )}
                    </Card>

                    <Card
                      title="Eye & Optic Nerve Ultrasound"
                      tag="SYNTHETIC B-MODE"
                      origin={hasHemodynamics ? packet.hemodynamics!.provenance : 'UNAVAILABLE'}
                      className="min-h-0"
                    >
                      {!hasHemodynamics ? (
                        <UnavailableSubsystemPanel
                          title="OCULAR ONSD / SANS UNAVAILABLE"
                          reason="Pure BIDMC replay does not include optic nerve sheath diameter or cabin ppCO2."
                          linkIsLive={link === 'ENGINE_LIVE'}
                          onEngageOverlay={() => setWhatIfOverlayActive(true)}
                        />
                      ) : (
                        <>
                          <OcularOnsd onsd={s.onsdMm} sigma={s.onsdSigmaMm} />
                          <div className="mt-2">
                            <Metric label="Optic nerve sheath" value={s.onsdMm.toFixed(2)} unit="mm" limit={`> ${P.onsdCritical} risk`} bad={s.onsdMm > P.onsdCritical} />
                            <Metric label="Cabin CO2" value={whatIf.ppco2_mmhg.toFixed(1)} unit="mmHg" limit={`>= ${P.ppco2Critical} limit`} bad={whatIf.ppco2_mmhg >= P.ppco2Critical} />
                            <Metric label="Days since last scan" value={String(s.daysSinceScan)} unit="d" bad={s.daysSinceScan > 7} />
                          </div>
                          <button
                            type="button"
                            onClick={() => setLastScanDay(whatIf.mission_day)}
                            className="mt-2 cursor-pointer rounded border border-nominal px-3 py-1 font-mono text-xs text-nominal hover:bg-nominal hover:text-black"
                          >
                            LOG 2-MIN EYE SCAN NOW
                          </button>
                        </>
                      )}
                    </Card>
                  </div>
                )}

                {evalTab === 'MUSCLE_BONE' && (
                  <Card
                    title="Your Muscle, Bone & Mars Landing Readiness"
                    origin={hasMusculoskeletal ? packet.musculoskeletal!.provenance : 'UNAVAILABLE'}
                    className="min-h-0 flex-1"
                  >
                    {!hasMusculoskeletal ? (
                      <UnavailableSubsystemPanel
                        title="MUSCULOSKELETAL AXIS UNAVAILABLE"
                        reason="Pure terrestrial BIDMC replay does not measure soleus thickness, sclerostin, or Mars gait asymmetry."
                        linkIsLive={link === 'ENGINE_LIVE'}
                        onEngageOverlay={() => setWhatIfOverlayActive(true)}
                      />
                    ) : (
                      <div className="flex h-full flex-col justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                          {['Calf muscle unloads', 'Irisin drops', 'Sclerostin rises', 'Bone weakens', 'Walking on Mars (0.38 g)'].map((t, i, a) => (
                            <span key={t} className="flex items-center gap-2">
                              <span className="rounded border border-line px-2.5 py-1 text-gray-200">{t}</span>
                              {i < a.length - 1 && <span className="text-gray-600">-&gt;</span>}
                            </span>
                          ))}
                        </div>
                        <div>
                          <Metric label="Soleus calf thickness" value={`${s.soleusMm.toFixed(1)} (-${s.soleusLossPct.toFixed(1)}%)`} unit="mm" limit={`< ${P.soleusCritical} risk`} bad={s.soleusMm < P.soleusCritical} />
                          <Metric label="Irisin hormone" value={s.irisin.toFixed(2)} unit="ng/mL" />
                          <Metric label="Sclerostin (bone brake)" value={s.sclerostin.toFixed(0)} unit="pmol/L" limit={`> ${P.sclerostinCritical} risk`} bad={s.sclerostin > P.sclerostinCritical} />
                          <Metric label="Heel bone loss (BMD)" value={s.bmdLossPct.toFixed(1)} unit="%" />
                          <Metric label="Expected Mars gait asymmetry" value={s.gaiPct.toFixed(1)} unit="%" limit={`> ${P.gaiCritical} risk`} bad={s.gaiPct > P.gaiCritical} />
                        </div>
                        <p className="text-sm text-gray-300">
                          Without daily resistive exercise on ARED, your calf muscle thins and signals your bones to lose density. Keeping your ARED load near 100% protects your skeleton for landing on Mars.
                        </p>
                      </div>
                    )}
                  </Card>
                )}

                {evalTab === 'FORECAST' && (
                  <Card
                    title="14-Day Safety Margin Forecast"
                    tag={sm.provenance}
                    origin={sm.provenance}
                    className="min-h-0 flex-1"
                  >
                    <div className="flex h-full flex-col justify-between gap-3">
                      <StlChart whatIf={whatIf} lastScanDay={lastScanDay} isPureReplay={isPureReplay} />
                      <PredicateBars rho={predicateBarsMap} />
                      <p className="text-xs text-gray-400">
                        Above 0 is within NASA safety limits; below 0 is a limit violation. Unavailable predicates remain explicitly N/A.
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* PAGE 3: ACT */}
            {activePhase === 'ACT' && (
              <div className="act-grid">
                <Card
                  title="Guided procedure"
                  origin={packet.active_playbook ? 'DERIVED_FROM_HYBRID_SCENARIO' : 'SIMULATED_SCENARIO_INPUT'}
                  className="min-h-0"
                >
                  {packet.active_playbook && (
                    <section className="act-engine mb-5" aria-label="Active engine playbook">
                      <p className="text-sm text-gray-400">Active engine playbook</p>
                      <h2 className="mt-1 text-xl font-semibold text-white">{packet.active_playbook.title ?? packet.active_playbook.playbook_id}</h2>
                      {packet.active_playbook.step_instruction && <p className="mt-2 text-gray-200">{packet.active_playbook.step_instruction}</p>}
                      <details className="mt-3 text-sm text-gray-400">
                        <summary className="cursor-pointer">Engine details</summary>
                        <p className="mt-2 break-words">{packet.active_playbook.playbook_id}</p>
                        {!!packet.active_playbook.causal_chain_summary?.length && (
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            {packet.active_playbook.causal_chain_summary.map((item, index) => <li key={index}>{item}</li>)}
                          </ul>
                        )}
                      </details>
                    </section>
                  )}
                  <PlaybookRunner thrombus={thrombus} setThrombus={handleThrombusChange} />
                </Card>
                <Card title="Active Safety Protections" origin={packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : 'DERIVED_COMPUTED'} className="min-h-0">
                  <div className="space-y-4 text-sm text-gray-300">
                    <div className="rounded border border-line p-3">
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-bold text-white">Anticoagulant lock</span>
                        <span className={thrombus === true ? 'text-ok' : 'text-critical'}>
                          {thrombus === true ? 'OPEN' : 'LOCKED'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        This scenario requires a confirmed POCUS finding before unlocking the anticoagulant step.
                      </p>
                    </div>
                    <div className="rounded border border-line p-3">
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-bold text-white">LBNP protection</span>
                        <span className={ventEvent ? 'text-critical' : 'text-ok'}>
                          {ventEvent ? 'VENTED' : 'ARMED'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        The simulator resets LBNP when systolic pressure drops more than 15 mmHg or heart rate exceeds 115 bpm.
                      </p>
                    </div>
                    {packet.active_playbook?.safety_gates && (
                      <div className="rounded border border-line p-3">
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <span className="font-semibold text-white">EVA suit damping</span>
                          <span>{packet.active_playbook.safety_gates.eva_suit_damping_active ? 'Active' : 'Inactive'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
          </main>

          <aside className="health-tools">
            {activePhase !== 'GATHER' && !(activePhase === 'EVALUATE' && evalTab === 'BODY_3D') && <div className="rounded-lg border border-line bg-panel p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs tracking-widest text-gray-500">YOUR READINESS</span>
                  <OriginBadge origin={sm.provenance} />
                </div>
                <AlarmBadge level={sm.alarm_level} />
              </div>
              <MriGauge safety={sm} qualityFlags={qualityFlags} />
            </div>}

            <details open={whatIfOverlayActive || undefined} className="rounded-lg border border-line bg-panel">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-200">What-If simulation</summary>
              <div className="border-t border-line p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs tracking-widest text-gray-500">ADJUST CONDITIONS</span>
                <OriginBadge origin="SIMULATED_SCENARIO_INPUT" />
              </div>
              <WhatIfConsole
                value={whatIf}
                onChange={handleWhatIfChange}
                ventEvent={ventEvent}
                onRearm={() => setVentEvent(null)}
                link={link}
                overlayActive={whatIfOverlayActive}
                onToggleOverlay={setWhatIfOverlayActive}
                onSyncNow={() => {
                  setWhatIfOverlayActive(true);
                  void syncWhatIfNow();
                }}
              />

              {isPureReplay && (
                <div className="mt-3 rounded border border-warning/40 bg-black p-2.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-warning">
                    <span>LOCAL WHAT-IF PREVIEW</span>
                    <span>NOT LIVE TELEMETRY</span>
                  </div>
                  <div className="mt-1 text-gray-400">
                    Preview MRI: {localSim.mri} | tau_w: {localSim.tauW.toFixed(2)} dyn/cm2 | SBP: {localSim.sbp.toFixed(0)} mmHg
                  </div>
                </div>
              )}
              </div>
            </details>
            <details className="rounded-lg border border-line bg-panel">
              <summary className="cursor-pointer px-4 py-3 text-sm text-gray-300">System details and provenance</summary>
              <ProvenanceBanner packet={packet} status={status} />
              <OsSystemStatusBar
                packet={packet}
                whatIf={whatIf}
                transportMode={transportMode}
                ipcLatencyUs={ipcLatencyUs}
                binaryFrameCount={binaryFrameCount}
                lastBinaryFrame={lastBinaryFrame}
                osStatus={osStatus}
                paletteOpen={paletteOpen}
                onTogglePalette={() => setPaletteOpen((v) => !v)}
              />
            </details>
          </aside>
        </div>
      </div>

      <OsCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onToggle={() => setPaletteOpen((v) => !v)}
        httpBaseUrl={ENGINE_HTTP_URL}
        packet={packet}
        whatIf={whatIf}
        transportMode={transportMode}
        osStatus={osStatus}
      />
    </div>
  );
}
