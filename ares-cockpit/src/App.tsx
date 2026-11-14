import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { BodyHeatmap } from './modules/body-3d-heatmap/BodyHeatmap';
import { WhatIfConsole } from './modules/whatif-console/WhatIfConsole';
import { PlaybookRunner } from './modules/playbook-runner/PlaybookRunner';
import { EcgStrip, OcularOnsd, PocusIjv } from './modules/analysis-imaging/Imaging';
import {
  EnginePlaybookCard,
  isAcuteVitalsPlaybook,
  VitalsAnomalyPanel,
} from './modules/vitals-anomaly/VitalsAnomalyPanel';
import { FreshnessBadge, OriginBadge, ProvenanceBanner } from './modules/provenance/ProvenanceInspector';
import { OsSystemStatusBar } from './modules/os-shell/OsSystemStatusBar';
import { OsCommandPalette } from './modules/os-shell/OsCommandPalette';
import { OsVoiceCopilot } from './modules/os-shell/OsVoiceCopilot';
import {
  MissionSuiteNavbar,
  type MissionViewMode,
} from './modules/navigation/MissionSuiteNavbar';
import { MissionPortal } from './modules/portal/MissionPortal';
import { OpenScreenStudio } from './modules/studio/OpenScreenStudio';
import { KeyboardShortcutsModal } from './modules/ui-primitives/KeyboardShortcutsModal';
import { AuditChainModal } from './modules/audit-chain/AuditChainModal';
import type { VoiceIntentClassification } from './lib/voiceIntentRouter';
import type { InjuryMarker } from './types/injury';
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

function RecordedHistoryStrip({ history }: { history: RecordedHistoryPoint[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded border border-line bg-black px-3 py-2 font-mono text-[11px] text-gray-500">
        Waiting for 1 Hz recorded BIDMC samples...
      </div>
    );
  }
  const latest = history[history.length - 1];
  const recent = history.slice(-8);
  return (
    <div className="rounded border border-line bg-black px-3 py-2 font-mono text-[11px]">
      <div className="mb-1 flex items-center justify-between text-gray-400">
        <span>RECORDED 1 HZ HISTORY (IMMUTABLE UNDER WHAT-IF SLIDERS)</span>
        <span>
          {history.length} samples | latest t = {latest.relativeTimeS.toFixed(0)} s
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {recent.map((pt) => {
          const hasGap = pt.pulse === null || pt.spo2 === null || pt.hr === null;
          return (
            <div
              key={pt.relativeTimeS}
              className={`rounded border px-2 py-0.5 text-[10px] ${
                hasGap ? 'border-advisory/60 bg-advisory/10 text-advisory' : 'border-line text-gray-300'
              }`}
            >
              t={pt.relativeTimeS.toFixed(0)}s: HR {pt.hr ?? 'MISSING'} | SpO2 {pt.spo2 ?? 'MISSING'}
            </div>
          );
        })}
      </div>
    </div>
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

/** SVG vital trend sparkline with explicit pen-lifts across null BIDMC intervals. */
function VitalsTrend({ history }: { history: RecordedHistoryPoint[] }) {
  const [metric, setMetric] = useState<'hr' | 'spo2' | 'resp' | 'pulse'>('hr');
  const signals = {
    hr: ['Heart rate', 'bpm'],
    spo2: ['Blood oxygen', '%'],
    resp: ['Breathing', 'br/min'],
    pulse: ['Pulse', 'bpm'],
  } as const;

  const points = history.filter((point) => point[metric] !== null);
  const values = points.map((point) => point[metric] ?? 0);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  const padding = Math.max(1, (high - low) * 0.15);
  const start = history[0]?.relativeTimeS ?? 0;
  const end = history.at(-1)?.relativeTimeS ?? start;
  const x = (t: number) => 12 + ((t - start) * 736) / Math.max(1, end - start);
  const y = (v: number) => 12 + ((high + padding - v) * 130) / Math.max(1e-6, high - low + 2 * padding);

  let penDown = false;
  const path = history
    .map((point) => {
      const value = point[metric];
      if (value === null) {
        penDown = false;
        return '';
      }
      const command = penDown ? 'L' : 'M';
      penDown = true;
      return `${command}${x(point.relativeTimeS).toFixed(1)},${y(value).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');

  return (
    <section className="health-trend" aria-label="Recorded vital trends">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2>Recorded trends (pen-lift on null gaps)</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose trend signal">
          {(Object.keys(signals) as (keyof typeof signals)[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === metric}
              onClick={() => setMetric(key)}
              className="health-choice font-mono"
            >
              {signals[key][0]}
            </button>
          ))}
        </div>
      </div>
      {points.length >= 2 ? (
        <>
          <svg
            viewBox="0 0 760 154"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${signals[metric][0]} over recorded time`}
            className="mt-3 h-32 w-full"
          >
            {[22, 62, 102, 142].map((row) => (
              <line key={row} x1="12" x2="748" y1={row} y2={row} stroke="#1f2937" />
            ))}
            <path
              d={path}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((point) => (
              <circle
                key={point.relativeTimeS}
                cx={x(point.relativeTimeS)}
                cy={y(point[metric] ?? 0)}
                r="2"
                fill="#22d3ee"
              />
            ))}
          </svg>
          <div className="mt-1 flex justify-between font-mono text-xs text-gray-400">
            <span>{start.toFixed(0)} s</span>
            <span>
              {low.toFixed(1)} - {high.toFixed(1)} {signals[metric][1]}
            </span>
            <span>{end.toFixed(0)} s</span>
          </div>
        </>
      ) : (
        <p className="py-6 font-mono text-xs text-gray-400">
          Waiting for recorded samples for {signals[metric][0].toLowerCase()}.
        </p>
      )}
    </section>
  );
}

export default function App() {
  const getInitialParam = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return new URLSearchParams(window.location.search).get(key);
    } catch {
      return null;
    }
  };

  const [activeView, setActiveView] = useState<MissionViewMode>(() => {
    const v = getInitialParam('view');
    if (v === 'VIEW_PORTAL' || v === 'VIEW_TWIN' || v === 'VIEW_STUDIO' || v === 'VIEW_COCKPIT') return v;
    return 'VIEW_COCKPIT';
  });
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [whatIf, setWhatIf] = useState<WhatIf>(() => {
    const s = getInitialParam('sex')?.toUpperCase();
    if (s === 'MALE' || s === 'FEMALE') return { ...DEFAULT_WHATIF, sex: s };
    return DEFAULT_WHATIF;
  });
  const [thrombus, setThrombus] = useState<boolean | null>(null);
  const [lastScanDay, setLastScanDay] = useState<number>(DEFAULT_WHATIF.mission_day - 5);
  const [ventEvent, setVentEvent] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<Phase>(() => {
    const p = getInitialParam('phase');
    if (p === 'GATHER' || p === 'EVALUATE' || p === 'ACT') return p;
    return 'GATHER';
  });
  const [evalTab, setEvalTab] = useState<EvalTab>(() => {
    const t = getInitialParam('tab');
    if (t === 'BODY_3D' || t === 'MUSCLE_BONE' || t === 'POCUS' || t === 'FORECAST') return t;
    return 'BODY_3D';
  });
  const [whatIfOverlayActive, setWhatIfOverlayActive] = useState<boolean>(() => {
    return getInitialParam('overlay') === '1' || getInitialParam('overlay') === 'true';
  });
  const [paletteOpen, setPaletteOpen] = useState<boolean>(() => {
    return getInitialParam('palette') === '1';
  });
  const [paletteInitialMode, setPaletteInitialMode] = useState<'TOOLS' | 'COPILOT'>('TOOLS');
  const [requestedPlaybook, setRequestedPlaybook] = useState<{ id: string; seq: number } | null>(null);
  const [injuries, setInjuries] = useState<InjuryMarker[]>([]);
  const injuryPhotoUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = injuryPhotoUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const releaseInjuryPhoto = useCallback((injury?: InjuryMarker) => {
    const url = injury?.photoUrl;
    if (!url || !url.startsWith('blob:')) return;
    URL.revokeObjectURL(url);
    injuryPhotoUrls.current.delete(url);
  }, []);

  const addInjury = useCallback(
    (injury: InjuryMarker) => {
      if (injury.photoUrl?.startsWith('blob:')) {
        injuryPhotoUrls.current.add(injury.photoUrl);
      }
      setInjuries((prev) => {
        const replaced = prev.find((item) => item.region === injury.region);
        if (replaced && replaced.photoUrl !== injury.photoUrl) {
          releaseInjuryPhoto(replaced);
        }
        return [...prev.filter((item) => item.region !== injury.region), injury];
      });
    },
    [releaseInjuryPhoto],
  );

  const resolveInjury = useCallback(
    (id: string) => {
      setInjuries((prev) => {
        const target = prev.find((item) => item.id === id);
        if (target) releaseInjuryPhoto(target);
        return prev.filter((item) => item.id !== id);
      });
    },
    [releaseInjuryPhoto],
  );

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
    injectAnomaly,
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

  const handleVoiceIntent = useCallback(
    (intent: Exclude<VoiceIntentClassification, { kind: 'CONVERSATIONAL_COPILOT_ASK' }>) => {
      switch (intent.kind) {
        case 'SAFETY_INTERLOCK_BLOCKED':
          // NASA-STD-3001 [V2 10027]: strictly refuse vocal Gate 1 / POCUS mutations
          return;
        case 'NAVIGATE_PHASE':
          setActivePhase(intent.phase);
          return;
        case 'NAVIGATE_EVAL_TAB':
          setActivePhase('EVALUATE');
          setEvalTab(intent.tab);
          return;
        case 'SHOW_QUANTILE_CONES':
          setActivePhase('EVALUATE');
          setEvalTab('FORECAST');
          return;
        case 'OPEN_PLAYBOOK':
          setActivePhase('ACT');
          setRequestedPlaybook((prev) => ({ id: intent.playbook_id, seq: (prev?.seq ?? 0) + 1 }));
          return;
        case 'RUN_WHAT_IF_LBNP':
          setWhatIf((prev) => ({ ...prev, lbnp_mmhg: intent.lbnp_mmhg }));
          if (link === 'ENGINE_LIVE') {
            setWhatIfOverlayActive(true);
          }
          return;
        case 'OPEN_COMMAND_PALETTE':
          setPaletteInitialMode(intent.initial_tab);
          setPaletteOpen(true);
          return;
      }
    },
    [link],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
      } else if (e.key === '1' && !e.ctrlKey && !e.metaKey) {
        setActiveView('VIEW_COCKPIT');
      } else if (e.key === '2' && !e.ctrlKey && !e.metaKey) {
        setActiveView('VIEW_PORTAL');
      } else if (e.key === '3' && !e.ctrlKey && !e.metaKey) {
        setActiveView('VIEW_TWIN');
      } else if (e.key === '4' && !e.ctrlKey && !e.metaKey) {
        setActiveView('VIEW_STUDIO');
      } else if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
        handleWhatIfChange({ ...whatIf, sex: 'MALE' });
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        handleWhatIfChange({ ...whatIf, sex: 'FEMALE' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [whatIf]);

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
    <div className="flex h-screen flex-col overflow-hidden bg-black">
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
      <MissionSuiteNavbar
        activeView={activeView}
        onSelectView={setActiveView}
        astronautId={packet.astronaut_id}
        sex={whatIf.sex}
        onChangeSex={(sex) => handleWhatIfChange({ ...whatIf, sex })}
        alarmLevel={sm.alarm_level}
        link={link}
        wsConnected={status.wsConnected}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
      />

      {activeView === 'VIEW_PORTAL' ? (
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden p-4 h-[calc(100vh-140px)]">
          <MissionPortal
            packet={packet}
            s={hasHemodynamics || hasMusculoskeletal ? s : null}
            whatIf={whatIf}
            thrombus={thrombus}
            onSetThrombus={handleThrombusChange}
            sex={whatIf.sex}
          />
        </div>
      ) : activeView === 'VIEW_STUDIO' ? (
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden p-4 h-[calc(100vh-140px)]">
          <OpenScreenStudio
            packet={packet}
            s={hasHemodynamics || hasMusculoskeletal ? s : null}
            whatIf={whatIf}
            sex={whatIf.sex}
          />
        </div>
      ) : activeView === 'VIEW_TWIN' ? (
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden p-4 h-[calc(100vh-140px)]">
          <Card
            title="ARES Biodigital Twin 3D Viewport (Full Screen)"
            tag="OrbitControls 360-degree interactive anatomical twin"
            origin={hasHemodynamics || hasMusculoskeletal ? (packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : 'DERIVED_FROM_HYBRID_SCENARIO') : 'UNAVAILABLE'}
            className="min-h-0 flex-1 h-full"
          >
            <BodyHeatmap
              s={hasHemodynamics || hasMusculoskeletal ? s : null}
              sex={whatIf.sex}
              hypergraphSpatial={packet.hypergraph_spatial}
              isLocalSimulation={Boolean(packet.is_local_simulation)}
              modelValidationStatus={packet.model_validation_status}
              injuries={injuries}
              onAddInjury={addInjury}
              onResolveInjury={resolveInjury}
              onChangeSex={(sex) => handleWhatIfChange({ ...whatIf, sex })}
              onOpenTab={(tab) => {
                setEvalTab(tab);
                setActivePhase('EVALUATE');
                setActiveView('VIEW_COCKPIT');
              }}
              onOpenPlaybook={(playbookId) => {
                setActivePhase('ACT');
                setActiveView('VIEW_COCKPIT');
                setRequestedPlaybook((prev) => ({
                  id: playbookId ?? 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
                  seq: (prev?.seq ?? 0) + 1,
                }));
              }}
            />
          </Card>
        </div>
      ) : (
        <>
      <TriPhaseHeader
        astronautId={packet.astronaut_id}
        alarm={sm.alarm_level}
        link={link}
        wsConnected={status.wsConnected}
        activePhase={activePhase}
        recommendedPhase={recommendedPhase}
        onSelectPhase={setActivePhase}
        onOpenAudit={() => setAuditModalOpen(true)}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden p-4">
        <ProvenanceBanner packet={packet} status={status} />
        <OsVoiceCopilot
          packet={packet}
          whatIf={whatIf}
          whatIfOverlayActive={whatIfOverlayActive}
          transportMode={transportMode}
          httpBaseUrl={ENGINE_HTTP_URL}
          onExecuteIntent={handleVoiceIntent}
        />

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[1fr_340px]">
          {/* Left / Center Authoritative Workspace */}
          <main className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {/* Compact status banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-4 py-2">
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
            </div>

            {/* PAGE 1: GATHER */}
            {activePhase === 'GATHER' && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                <VitalsAnomalyPanel
                  report={packet.vitals_anomaly}
                  engineLive={link === 'ENGINE_LIVE'}
                  httpBaseUrl={ENGINE_HTTP_URL}
                  onInjectAnomaly={injectAnomaly}
                />

                <section className="bedside-monitor" aria-label="Bedside patient monitor">
                  <div className="monitor-heading font-mono text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-gray-100">Bedside Monitor &amp; ECG Trace</h2>
                      <OriginBadge origin={b.heart_rate_bpm === null ? 'UNAVAILABLE' : bioOrigin} />
                      <FreshnessBadge
                        freshness={bioFreshness(b.heart_rate_bpm === null)}
                        ageMs={status.heldSample ? status.heldAgeMs : null}
                      />
                    </div>
                    <span className="text-gray-400">
                      {packet.provenance_manifest.biometrics_source} | SQI {(b.sqi_score ?? (isRecordedBiometrics ? 1.0 : localSim.sqi)).toFixed(2)}
                    </span>
                  </div>

                  <div className="monitor-cardiac">
                    <div>
                      <div className="monitor-trace-label font-mono">
                        Lead II Synthetic ECG Visualizer (driven by recorded/simulated HR)
                      </div>
                      <EcgStrip
                        hr={b.heart_rate_bpm}
                        artifact={isRecordedBiometrics ? 0 : whatIf.artifact_level}
                        sqi={b.sqi_score ?? (isRecordedBiometrics ? 1.0 : localSim.sqi)}
                        isRecorded={isRecordedBiometrics}
                      />
                    </div>
                    <div className="monitor-vital monitor-heart">
                      <span>Heart Rate (ECG)</span>
                      <strong className={hrFmt.unavailable ? 'vital-unavailable' : ''}>
                        {hrFmt.text}
                      </strong>
                      {!hrFmt.unavailable && <small>bpm</small>}
                    </div>
                  </div>

                  <dl className="monitor-secondary">
                    {[
                      { cls: 'monitor-oxygen', label: 'Blood Oxygen (SpO2)', fmt: spo2Fmt, unit: '%' },
                      { cls: 'monitor-breathing', label: 'Breathing Rate', fmt: respFmt, unit: 'br/min' },
                      { cls: 'monitor-pulse', label: 'Pulse Rate (PPG)', fmt: pulseFmt, unit: 'bpm' },
                    ].map((item) => (
                      <div key={item.label} className={`monitor-vital ${item.cls}`}>
                        <dt className="flex flex-wrap items-center gap-1.5">
                          <span>{item.label}</span>
                          <OriginBadge origin={item.fmt.unavailable ? 'UNAVAILABLE' : bioOrigin} />
                          <FreshnessBadge
                            freshness={bioFreshness(item.fmt.unavailable)}
                            ageMs={status.heldSample ? status.heldAgeMs : null}
                          />
                        </dt>
                        <dd>
                          <strong className={item.fmt.unavailable ? 'vital-unavailable' : ''}>
                            {item.fmt.text}
                          </strong>
                          {!item.fmt.unavailable && <small>{item.unit}</small>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <div className="grid gap-3 md:grid-cols-[1fr_280px]">
                  <VitalsTrend history={recordedHistory} />

                  <div className="flex flex-col justify-between rounded-lg border border-line bg-panel p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-300">HRV (RMSSD)</span>
                      <OriginBadge origin={hrvFmt.unavailable ? 'UNAVAILABLE' : bioOrigin} />
                    </div>
                    <div
                      className={`my-2 font-mono ${
                        hrvFmt.unavailable ? 'text-xs font-bold leading-snug text-advisory' : 'text-2xl text-white'
                      }`}
                    >
                      {hrvFmt.text}
                      {!hrvFmt.unavailable && <span className="ml-1 text-xs text-gray-500">ms</span>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <FreshnessBadge
                        freshness={bioFreshness(hrvFmt.unavailable)}
                        ageMs={status.heldSample ? status.heldAgeMs : null}
                      />
                      <span className="font-mono text-[10px] text-gray-500">
                        Never coerced to 0
                      </span>
                    </div>
                  </div>
                </div>

                <RecordedHistoryStrip history={recordedHistory} />
              </div>
            )}

            {/* PAGE 2: EVALUATE */}
            {activePhase === 'EVALUATE' && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="flex flex-wrap gap-2 font-mono text-xs">
                  {([
                    ['BODY_3D', '3D Body Layers'],
                    ['POCUS', 'Ultrasound (Neck & Eye)'],
                    ['MUSCLE_BONE', 'Muscle, Bone & Mars Gait'],
                    ['FORECAST', '14-Day Safety Forecast'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setEvalTab(id)}
                      className={`min-h-12 cursor-pointer rounded border px-3 py-1.5 ${
                        evalTab === id ? 'border-nominal bg-nominal/15 font-bold text-nominal' : 'border-line text-gray-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {evalTab === 'BODY_3D' && (
                  <Card
                    title="Your 3D Body Scan & Atlas"
                    tag="Click any UBERON or injury pin to inspect, drag to rotate"
                    origin={hasHemodynamics || hasMusculoskeletal ? (packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : 'DERIVED_FROM_HYBRID_SCENARIO') : 'UNAVAILABLE'}
                    className="min-h-0 flex-1"
                  >
                    <BodyHeatmap
                      s={hasHemodynamics || hasMusculoskeletal ? s : null}
                      sex={whatIf.sex}
                      hypergraphSpatial={packet.hypergraph_spatial}
                      isLocalSimulation={Boolean(packet.is_local_simulation)}
                      modelValidationStatus={packet.model_validation_status}
                      injuries={injuries}
                      onAddInjury={addInjury}
                      onResolveInjury={resolveInjury}
                      onChangeSex={(sex) => handleWhatIfChange({ ...whatIf, sex })}
                      onOpenTab={setEvalTab}
                      onOpenPlaybook={(playbookId) => {
                        setActivePhase('ACT');
                        setRequestedPlaybook((prev) => ({
                          id: playbookId ?? 'PLAYBOOK_01_VENOUS_STASIS_LBNP',
                          seq: (prev?.seq ?? 0) + 1,
                        }));
                      }}
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
                          <Metric
                            label="Urinary calcium (stone risk)"
                            value={`${s.urinaryCalciumMgD.toFixed(0)} [${s.nephrolithiasisRisk}]`}
                            unit="mg/d"
                            limit="> 250 risk"
                            bad={s.urinaryCalciumMgD > 250}
                          />
                          <Metric label="Expected Mars gait asymmetry" value={s.gaiPct.toFixed(1)} unit="%" limit={`> ${P.gaiCritical} risk`} bad={s.gaiPct > P.gaiCritical} />
                        </div>
                        <p className="text-sm text-gray-300">
                          Without daily resistive exercise on ARED, your calf muscle thins and signals bones to resorb minerals. Excess calcium is filtered into urine, elevating nephrolithiasis (kidney stone) risk above 250 mg/d. Keeping your ARED load near 100% protects your skeleton, prevents renal crystallization, and preserves landing readiness on Mars.
                        </p>
                      </div>
                    )}
                  </Card>
                )}

                {evalTab === 'FORECAST' && (
                  <Card
                    title="Multi-Horizon Timestral & STL Forecast"
                    tag={sm.provenance}
                    origin={sm.provenance}
                    className="min-h-0 flex-1"
                  >
                    <div className="flex h-full flex-col justify-between gap-3">
                      <StlChart
                        whatIf={whatIf}
                        lastScanDay={lastScanDay}
                        isPureReplay={isPureReplay}
                        packet={packet}
                      />
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
              <div className="act-grid min-h-0 flex-1 overflow-y-auto">
                <Card
                  title="Guided Medical Procedure"
                  origin={packet.active_playbook ? 'DERIVED_FROM_HYBRID_SCENARIO' : 'SIMULATED_SCENARIO_INPUT'}
                  className="min-h-0"
                >
                  <div className="space-y-3">
                    {packet.active_playbook && isAcuteVitalsPlaybook(packet.active_playbook) && (
                      <EnginePlaybookCard playbook={packet.active_playbook} />
                    )}
                    <PlaybookRunner
                      activePlaybook={packet.active_playbook}
                      isLiveEngine={link === 'ENGINE_LIVE'}
                      thrombusConfirmed={thrombus}
                      ventEvent={ventEvent}
                      syncLatencyUs={ipcLatencyUs}
                      modelValidationStatus={packet.model_validation_status}
                      requestedPlaybook={requestedPlaybook}
                      onConfirmPocusThrombus={handleThrombusChange}
                      onRearmLbnp={() => setVentEvent(null)}
                    />
                  </div>
                </Card>
                <Card title="Active Safety Protections" origin={packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : 'DERIVED_COMPUTED'} className="min-h-0">
                  <div className="space-y-4 text-sm text-gray-300">
                    <div className="rounded border border-line p-3">
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-bold text-white">GATE 1: NO BLIND BLOOD THINNERS</span>
                        <span
                          className={
                            thrombus === true &&
                            !packet.active_playbook?.safety_gates?.anticoagulant_lock_active
                              ? 'text-ok'
                              : 'text-critical'
                          }
                        >
                          {thrombus === true &&
                          !packet.active_playbook?.safety_gates?.anticoagulant_lock_active
                            ? 'OPEN'
                            : 'LOCKED'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        Anticoagulants stay locked until your neck ultrasound confirms a real clot, protecting you from dangerous bleeding after a minor bump.
                      </p>
                    </div>
                    <div className="rounded border border-line p-3">
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-bold text-white">GATE 2: FAINTING PROTECTION (LBNP)</span>
                        <span className={ventEvent ? 'text-critical' : 'text-ok'}>
                          {ventEvent
                            ? 'VENTED'
                            : packet.active_playbook?.safety_gates?.lbnp_auto_vent_armed === false
                              ? 'STANDBY'
                              : 'ARMED'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        If your blood pressure drops more than 15 mmHg or your heart rate passes 115 bpm during LBNP, the chamber vents back to 0 mmHg right away.
                      </p>
                    </div>
                    <div className="rounded border border-line p-3">
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-bold text-white">GATE 3: MARTIAN 0.38g EVA SUIT DAMPING</span>
                        <span
                          className={
                            packet.active_playbook?.safety_gates?.eva_suit_damping_active
                              ? 'text-caution'
                              : 'text-gray-400'
                          }
                        >
                          {packet.active_playbook?.safety_gates?.eva_suit_damping_active
                            ? 'ACTIVE (+25% ANKLE)'
                            : 'STANDBY'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        When Gait Asymmetry Index exceeds 12.0%, Martian EVA ankle damping engages and high-impact plyometric loading is locked out.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </main>

          {/* Right Sticky Control Sidebar */}
          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <div className="rounded-lg border border-line bg-panel p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs tracking-widest text-gray-500">YOUR READINESS</span>
                  <OriginBadge origin={sm.provenance} />
                </div>
                <AlarmBadge level={sm.alarm_level} />
              </div>
              <MriGauge safety={sm} qualityFlags={qualityFlags} />
            </div>

            <details
              open={whatIfOverlayActive || undefined}
              className="min-h-0 rounded-lg border border-line bg-panel p-4"
            >
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 font-mono text-xs tracking-widest text-gray-300">
                <span>ADJUST CONDITIONS (WHAT-IF)</span>
                <OriginBadge origin="SIMULATED_SCENARIO_INPUT" />
              </summary>
              <div className="mt-3">
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
          </aside>
        </div>
      </div>
        </>
      )}

      <KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      <AuditChainModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />

      <OsCommandPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteInitialMode('TOOLS');
        }}
        onToggle={() => setPaletteOpen((v) => !v)}
        httpBaseUrl={ENGINE_HTTP_URL}
        packet={packet}
        whatIf={whatIf}
        transportMode={transportMode}
        osStatus={osStatus}
        initialMode={paletteInitialMode}
      />
    </div>
  );
}
