import { ArrowRightIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { CockpitSelect, CockpitSummary } from './modules/ui-primitives/CockpitControls';
import { lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
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
import { updateAlarmEpisode, updateProcedureIncident, type AlarmEpisode, type ProcedureIncident } from './lib/alarmRecovery';
import { ACTIVITY_CONTEXT, DEFAULT_MISSION_PROFILE, EVA_AEROBIC_CAPACITY, formatMissionDelay, type CrewActivity, type MissionProfile } from './lib/missionContext';
import {
  formatNullableMetric,
  formatTimeToViolation,
  isPureRecordedReplay,
} from './lib/telemetryValidation';
import { ENGINE_HTTP_URL, useTelemetry, type RecordedHistoryPoint } from './lib/useTelemetry';
import { AlarmBadge, TriPhaseHeader, type Phase } from './modules/header-triphase/TriPhaseHeader';
import { MriGauge, PredicateBars, StlChart, TimestralQuantileConePanel } from './modules/mri-and-stl/MriAndStl';
import { MeasurementContext, RecentRange } from './modules/crew-vitals/MeasurementContext';
import { displayLabel } from './lib/displayLabel';
import type { BodyHeatmapProps } from './modules/body-3d-heatmap/BodyHeatmap';
import { WhatIfConsole } from './modules/whatif-console/WhatIfConsole';
import { PlaybookRunner } from './modules/playbook-runner/PlaybookRunner';
import { EcgStrip, OcularOnsd, PocusIjv } from './modules/analysis-imaging/Imaging';
import {
  isAcuteVitalsPlaybook,
  VitalsAnomalyPanel,
} from './modules/vitals-anomaly/VitalsAnomalyPanel';
import { FreshnessBadge, OriginBadge, ProvenanceMenu } from './modules/provenance/ProvenanceInspector';
import { OsSystemStatusBar } from './modules/os-shell/OsSystemStatusBar';
import { OsCommandPalette } from './modules/os-shell/OsCommandPalette';
import type { InjuryMarker } from './types/injury';
import type { DataOrigin, FreshnessStatus, TelemetryPacket } from './types/telemetry';

import { DeferredPanel } from './modules/ui-primitives/DeferredPanel';
import { StoryShell } from './scrollytelling/StoryShell';

const BodyHeatmap = lazy(() => import('./modules/body-3d-heatmap/BodyHeatmap').then(m => ({default:m.BodyHeatmap})));
const KeyboardShortcutsModal = lazy(() => import('./modules/ui-primitives/KeyboardShortcutsModal').then(m => ({default:m.KeyboardShortcutsModal})));
const AuditChainModal = lazy(() => import('./modules/audit-chain/AuditChainModal').then(m => ({default:m.AuditChainModal})));

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
    <section className={`clinical-panel flex flex-col ${className}`}>
      <div className="clinical-panel-heading flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-100">{title}</h3>
          {origin && <OriginBadge origin={origin} />}
          {freshness && <FreshnessBadge freshness={freshness} />}
        </div>
        {tag && <span className="font-mono text-xs text-gray-500">{tag}</span>}
      </div>
      <div className="clinical-panel-content min-h-0 flex-1">{children}</div>
    </section>
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
function VitalsTrend({ history, recording }: { history: RecordedHistoryPoint[]; recording: boolean }) {
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
        <h2>Recorded trends</h2>
        {points.length >= 2 && (
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
        )}
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
          {recording ? `Waiting for recorded samples for ${signals[metric][0].toLowerCase()}.` : 'Connect the BIDMC replay to see recorded trends.'}
        </p>
      )}
    </section>
  );
}

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function App() {
  const workspaceRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!workspaceRef.current) return;
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.mission-masthead h1, .mission-masthead p', {
        y: 9, opacity: 0, duration: 0.42, stagger: 0.08, ease: 'power2.out',
      });
      gsap.fromTo('.mission-masthead', { '--masthead-glow': 1 }, {
        '--masthead-glow': 0,
        ease: 'none',
        scrollTrigger: { trigger: '.mission-masthead', start: 'top top', end: 'bottom top', scrub: true },
      });
    });
    return () => motion.revert();
  }, { scope: workspaceRef });

  const getInitialParam = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return new URLSearchParams(window.location.search).get(key);
    } catch {
      return null;
    }
  };

  const [viewMode] = useState<'scrolly' | 'workbench'>(() => {
    const v = getInitialParam('view') || getInitialParam('mode');
    return v === 'workbench' ? 'workbench' : 'scrolly';
  });

  if (viewMode === 'scrolly') {
    return <StoryShell />;
  }

  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [missionProfile, setMissionProfile] = useState<MissionProfile>(DEFAULT_MISSION_PROFILE);
  const [crewActivity, setCrewActivity] = useState<CrewActivity>('unknown');
  const [atlasProfile, setAtlasProfile] = useState<WhatIf['sex'] | null>(null);
  const [incident, setIncident] = useState<ProcedureIncident | null>(null);
  const handleIncidentCompletion = useCallback((completed: boolean) => {
    setIncident(previous => previous && previous.completed !== completed ? { ...previous, completed } : previous);
  }, []);
  const [alarmEpisode, setAlarmEpisode] = useState<AlarmEpisode | null>(null);
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
    const tab = getInitialParam('tab');
    return tab === 'BODY_3D' || tab === 'POCUS' || tab === 'MUSCLE_BONE' || tab === 'FORECAST'
      ? 'EVALUATE'
      : 'GATHER';
  });
  const [evalTab, setEvalTab] = useState<EvalTab>(() => {
    const t = getInitialParam('tab');
    if (t === 'BODY_3D' || t === 'MUSCLE_BONE' || t === 'POCUS' || t === 'FORECAST') return t;
    return 'FORECAST';
  });
  const [whatIfOverlayActive, setWhatIfOverlayActive] = useState<boolean>(() => {
    return getInitialParam('overlay') === '1' || getInitialParam('overlay') === 'true';
  });
  const [paletteOpen, setPaletteOpen] = useState<boolean>(() => {
    return getInitialParam('palette') === '1';
  });
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
        const replaced = prev.find((item) =>
          item.id === injury.id || (!item.placement && !injury.placement && item.region === injury.region),
        );
        if (replaced && replaced.photoUrl !== injury.photoUrl) {
          releaseInjuryPhoto(replaced);
        }
        return [...prev.filter((item) => item !== replaced), injury];
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
    syncMissionContext,
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
  const criticalMargin = sm.alarm_level === 'CRITICAL';
  const anomaly = packet.vitals_anomaly;
  const syntheticEvent = anomaly?.injection;
  const syntheticSecondsRemaining = syntheticEvent
    ? Math.max(0, Math.ceil(syntheticEvent.duration_s - syntheticEvent.elapsed_s)) : null;
  const vitalsAlarm = anomaly?.overall === 'ALARM';
  const hasCurrentData = !status.isStale && sm.alarm_level !== 'DATA_DEGRADED_MISSING_CHANNELS';
  const flaggedEffortSignal = hasCurrentData && anomaly?.channels.some(
    (channel) => (channel.channel === 'heart_rate_bpm' || channel.channel === 'resp_rate_brpm') &&
      channel.evaluable && channel.status !== 'NORMAL',
  );
  const canVerifyVitals = Boolean(anomaly?.baseline_ready) &&
    ['heart_rate_bpm', 'spo2_pct', 'resp_rate_brpm'].every(channel =>
      anomaly?.channels.some(reading => reading.channel === channel && reading.evaluable)) &&
    b.heart_rate_bpm != null && b.spo2_percent != null && b.respiration_rate_brpm != null;
  const currentEpisode = updateAlarmEpisode(alarmEpisode, {
    source: packet.is_local_simulation ? 'simulation' : 'engine',
    cause: vitalsAlarm ? 'vitals' : criticalMargin ? 'critical' : null,
    fresh: !status.isStale,
    missionDataComplete: sm.alarm_level !== 'DATA_DEGRADED_MISSING_CHANNELS',
    canVerifyVitals,
  });
  const engineProcedure = packet.active_playbook;
  const candidate = currentEpisode?.cause === 'vitals'
    ? packet.vitals_playbook ?? (isAcuteVitalsPlaybook(engineProcedure) ? engineProcedure : null)
    : engineProcedure?.playbook_id !== 'NONE' ? engineProcedure : null;
  const currentIncident = updateProcedureIncident(incident, alarmEpisode, currentEpisode, candidate ?? null);
  if (currentIncident !== incident) setIncident(currentIncident);
  const procedurePending = currentEpisode?.phase === 'recovered' && Boolean(currentIncident?.playbook) && !currentIncident?.completed;
  const incidentOpen = currentEpisode !== null && (currentEpisode.phase !== 'recovered' || procedurePending);
  const incidentPlaybook = currentIncident?.playbook;
  const waitingForProcedure = incidentOpen && !incidentPlaybook;
  const visiblePlaybook = incidentPlaybook && (incidentOpen || activePhase === 'ACT')
    ? { ...incidentPlaybook, safety_gates: engineProcedure?.safety_gates ?? incidentPlaybook.safety_gates }
    : engineProcedure;
  if (currentEpisode?.source !== alarmEpisode?.source || currentEpisode?.cause !== alarmEpisode?.cause ||
    currentEpisode?.phase !== alarmEpisode?.phase) {
    setAlarmEpisode(currentEpisode);
  }
  const showUrgentStatus = currentEpisode !== null && currentEpisode.phase !== 'recovered';
  const monitoringStatus = currentEpisode?.phase === 'awaiting' ? 'awaiting'
    : showUrgentStatus ? 'urgent'
      : procedurePending ? 'procedure-pending'
      : currentEpisode?.phase === 'recovered' && !status.isStale ? sm.alarm_level === 'NOMINAL' && anomaly?.overall !== 'ATTENTION' ? 'recovered' : 'recovered-watch'
          : !hasCurrentData ? 'unavailable'
            : sm.alarm_level === 'NOMINAL' && anomaly?.overall !== 'ATTENTION' ? 'normal' : 'watch';
  const recommendedPhase: Phase =
    showUrgentStatus || procedurePending || sm.alarm_level === 'WARNING'
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

  const selectCrewProfile = (sex: WhatIf['sex']) => {
    setAtlasProfile(null);
    setWhatIf(previous => previous.sex === sex ? previous : { ...previous, sex });
  };

  const handleWhatIfChange = (next: WhatIf) => {
    setWhatIf(next);
    if (link === 'ENGINE_LIVE') setWhatIfOverlayActive(true);
  };

  const selectMissionProfile = (profile: MissionProfile) => {
    setMissionProfile(profile);
    setWhatIf(previous => ({ ...previous, ppco2_mmhg: profile.cabinCo2 }));
  };

  useEffect(() => {
    if (link === 'ENGINE_LIVE') void syncMissionContext({ sex: whatIf.sex });
  }, [link, syncMissionContext, whatIf.sex]);

  useEffect(() => {
    if (link === 'ENGINE_LIVE') void syncMissionContext({ cabinCo2: missionProfile.cabinCo2 });
  }, [link, missionProfile, syncMissionContext]);

  const restoreScenarioConditions = () => {
    setWhatIf({ ...DEFAULT_WHATIF, sex: whatIf.sex, ppco2_mmhg: missionProfile.cabinCo2 });
  };

  const handleBodyTab = useCallback((tab: EvalTab) => {
    setEvalTab(tab);
    setActivePhase('EVALUATE');
    if (tab !== 'BODY_3D') {
      window.requestAnimationFrame(() => {
        document.getElementById(tab === 'MUSCLE_BONE' ? 'evaluate-muscle' : tab === 'POCUS' ? 'evaluate-ultrasound' : 'evaluate-results')?.scrollIntoView({ block: 'start' });
      });
    }
  }, []);
  const handleBodyPlaybook = useCallback<NonNullable<BodyHeatmapProps['onOpenPlaybook']>>((id) => {
    setActivePhase('ACT');
    setRequestedPlaybook(previous => ({ id: id ?? 'PLAYBOOK_01_VENOUS_STASIS_LBNP', seq: (previous?.seq ?? 0) + 1 }));
  }, []);

  const handleThrombusChange = (v: boolean | null) => {
    setThrombus(v);
    if (link === 'ENGINE_LIVE') {
      setWhatIfOverlayActive(true);
    }
  };

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
      } else if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
        selectCrewProfile('MALE');
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        selectCrewProfile('FEMALE');
      } else if (e.key === 'Escape') {
        setShortcutsModalOpen(false);
        setAuditModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [link, whatIf]);

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
    <div ref={workspaceRef} className="ares-workspace flex flex-col">
      <TriPhaseHeader
        astronautId={whatIf.sex === 'FEMALE' ? 'ASTRO-02' : 'ASTRO-01'}
        recordedSourceId={isRecordedBiometrics ? packet.astronaut_id : undefined}
        profile={missionProfile}
        onSelectProfile={selectMissionProfile}
        alarm={showUrgentStatus ? 'CRITICAL' : sm.alarm_level}
        link={link}
        wsConnected={status.wsConnected}
        activePhase={activePhase}
        recommendedPhase={recommendedPhase}
        onSelectPhase={setActivePhase}
        provenance={<ProvenanceMenu packet={packet} status={status} />}
        onOpenAudit={() => setAuditModalOpen(true)}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        onTogglePalette={() => setPaletteOpen((v) => !v)}
      />

      {(showUrgentStatus || procedurePending) && (
        <section className="urgent-status" data-procedure-pending={procedurePending} aria-label="Urgent status">
          <WarningCircleIcon aria-hidden="true" size={27} weight="fill" />
          <div role="alert" className="urgent-status-message">
            <strong>{procedurePending ? 'Readings stable · procedure still open' : currentEpisode?.phase === 'awaiting' ? 'Critical alert · awaiting updated readings'
              : currentEpisode?.cause === 'vitals' ? 'Vitals alarm' : 'Critical alert'}</strong>
            <span>
              {procedurePending ? 'Complete the remaining steps in Act' : currentEpisode?.source === 'simulation' ? 'Local simulation' : currentEpisode?.phase === 'awaiting' ? 'Recovery needs fresh engine readings' : 'Engine telemetry'}
              {criticalMargin && !isPureReplay ? ` · ${RISK_LABEL[s.worst]}` : ''}
            </span>
          </div>
          {activePhase !== 'ACT' && (
            <button type="button" onClick={() => {
              setActivePhase('ACT');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}>
              View Act <ArrowRightIcon aria-hidden="true" size={16} />
            </button>
          )}
        </section>
      )}

      <div className="workspace-content mx-auto flex min-h-0 w-full flex-1 flex-col">
        <div className={`workspace-columns grid grid-flow-dense min-h-0 flex-1 ${activePhase === 'EVALUATE' ? 'evaluate-wide' : 'lg:grid-cols-[minmax(0,1fr)_330px]'}`}>
          {/* Left / Center Authoritative Workspace */}
          <main id="main-workspace" tabIndex={-1} className="clinical-main flex min-h-0 flex-col gap-4">
            {/* Compact status banner */}
            <div className="assessment-summary flex flex-wrap items-center justify-between gap-2">
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
                      {displayLabel(packet.provenance_manifest.biometrics_source)} · SQI {(b.sqi_score ?? (isRecordedBiometrics ? 1.0 : localSim.sqi)).toFixed(2)}
                    </span>
                  </div>

                  <div className="monitor-cardiac">
                    <div>
                      <div className="monitor-trace-label font-mono">
                        Illustrative ECG waveform
                      </div>
                      <EcgStrip
                        hr={status.isStale ? null : b.heart_rate_bpm}
                        artifact={isRecordedBiometrics ? 0 : whatIf.artifact_level}
                        sqi={b.sqi_score ?? (isRecordedBiometrics ? 1.0 : localSim.sqi)}
                        isRecorded={isRecordedBiometrics}
                      />
                    </div>
                    <div className="monitor-vital monitor-heart">
                      <span>Heart rate</span>
                      <strong className={hrFmt.unavailable ? 'vital-unavailable' : ''}>
                        {hrFmt.unavailable ? '—' : hrFmt.text}
                      </strong>
                      {!hrFmt.unavailable && <small>bpm</small>}
                      {isRecordedBiometrics && <RecentRange history={recordedHistory} signal="hr" unit="bpm" />}
                    </div>
                  </div>

                  <dl className="monitor-secondary">
                    {[
                      { cls: 'monitor-oxygen', label: 'Blood oxygen', fmt: spo2Fmt, unit: '%', signal: 'spo2' as const },
                      { cls: 'monitor-breathing', label: 'Breathing rate', fmt: respFmt, unit: 'br/min', signal: 'resp' as const },
                      { cls: 'monitor-pulse', label: 'Pulse rate', fmt: pulseFmt, unit: 'bpm', signal: 'pulse' as const },
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
                            {item.fmt.unavailable ? '—' : item.fmt.text}
                          </strong>
                          {!item.fmt.unavailable && <small>{item.unit}</small>}
                          {isRecordedBiometrics && <RecentRange history={recordedHistory} signal={item.signal} unit={item.unit} />}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <VitalsTrend history={recordedHistory} recording={link === 'ENGINE_LIVE' && isRecordedBiometrics} />
              </div>
            )}

            {/* PAGE 2: EVALUATE */}
            {activePhase === 'EVALUATE' && (
              <div className="evaluate-workbench">
                <section className="scenario-panel scenario-inline" aria-label="Scenario conditions">
                  <header className="flex items-center justify-between gap-2">
                    <h2 className="sidebar-heading">Scenario conditions</h2>
                    <OriginBadge origin="SIMULATED_SCENARIO_INPUT" />
                  </header>
                  <div className="mt-3">
                    <WhatIfConsole
                      value={whatIf}
                      onChange={handleWhatIfChange}
                      onSelectCrewProfile={selectCrewProfile}
                      onReset={restoreScenarioConditions}
                      ventEvent={ventEvent}
                      onRearm={() => setVentEvent(null)}
                      link={link}
                      overlayActive={whatIfOverlayActive}
                      onToggleOverlay={setWhatIfOverlayActive}
                      onSyncNow={syncWhatIfNow}
                    />

                    <details className="scenario-disclosure mission-context">
                      <CockpitSummary>Mission and crew context</CockpitSummary>
                      <div className="mission-context-content">
                        <div>
                          <strong>{missionProfile.label}</strong>
                          <p>{missionProfile.gravity} · {missionProfile.cabinCo2} mmHg example cabin CO₂</p>
                          {missionProfile.eva && <p>{missionProfile.eva} EVA · NASA VO₂max reference {EVA_AEROBIC_CAPACITY[missionProfile.eva]} mL/kg/min</p>}

                        </div>
                        <label>
                          Crew activity · interpretation only
                          <CockpitSelect value={crewActivity} onChange={(event) => setCrewActivity(event.currentTarget.value as CrewActivity)}>
                            <option value="unknown">Not recorded</option>
                            <option value="rest">At rest</option>
                            <option value="exercise">Exercising</option>
                          </CockpitSelect>
                        </label>
                        <p>
                          {flaggedEffortSignal && 'The detector flagged a change in heart or breathing rate. '}
                          {ACTIVITY_CONTEXT[crewActivity]}
                          {flaggedEffortSignal && ' The detector flag remains active.'}
                        </p>
                      </div>
                    </details>

                    {isPureReplay && (
                      <div className="mt-3 rounded border border-warning/40 bg-black p-2.5 font-mono text-[11px]">
                        <div className="flex items-center justify-between text-warning">
                          <span>LOCAL WHAT-IF PREVIEW</span>
                          <span>NOT LIVE TELEMETRY</span>
                        </div>
                        <div className="mt-1 text-gray-400">
                          Preview MRI: {localSim.mri} · Wall shear: {localSim.tauW.toFixed(2)} dyn/cm2 | SBP: {localSim.sbp.toFixed(0)} mmHg
                        </div>
                      </div>
                    )}
                  </div>
                </section>
                <Card
                  title="Anatomical explorer"
                  tag="Zoom follows cursor"
                  origin={hasHemodynamics || hasMusculoskeletal ? (packet.is_local_simulation ? 'SIMULATED_SCENARIO_INPUT' : 'DERIVED_FROM_HYBRID_SCENARIO') : 'UNAVAILABLE'}
                  className="anatomy-panel min-h-0"
                >
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <DeferredPanel name="anatomical explorer"><BodyHeatmap
                      s={hasHemodynamics || hasMusculoskeletal ? s : null}
                      sex={atlasProfile ?? whatIf.sex}
                      hypergraphSpatial={packet.hypergraph_spatial}
                      isLocalSimulation={Boolean(packet.is_local_simulation)}
                      modelValidationStatus={packet.model_validation_status}
                      injuries={injuries}
                      onAddInjury={addInjury}
                      onResolveInjury={resolveInjury}
                      onChangeSex={setAtlasProfile}
                      onOpenTab={handleBodyTab}
                      onOpenPlaybook={handleBodyPlaybook}
                    /></DeferredPanel>
                  </div>
                </Card>
                <section id="evaluate-results" className="evaluate-results" aria-label="Scenario results">
                    <Card title="14-day safety forecast" tag="Illustrative trajectory" className="scenario-forecast">
                      <StlChart whatIf={whatIf} lastScanDay={lastScanDay} isPureReplay={isPureReplay} />
                      <p className="forecast-assumption">Projection assumes the selected conditions stay constant.</p>
                      <details className="scenario-disclosure">
                        <CockpitSummary>Current margins by indicator</CockpitSummary>
                        <PredicateBars rho={predicateBarsMap} />
                      </details>
                    </Card>
                  <details className="scenario-disclosure forecast-detail">
                    <CockpitSummary>Short-term forecast</CockpitSummary>
                    <p className="evaluate-detail-note">Ranges for the next few seconds or hours, when the current data support a forecast.</p>
                    <TimestralQuantileConePanel packet={packet} />
                  </details>
                  <details id="evaluate-muscle" className="scenario-disclosure" open={evalTab === 'MUSCLE_BONE'}>
                    <CockpitSummary>Muscle, bone &amp; Mars gait</CockpitSummary>
                    <p className="evaluate-detail-note">Explore how mission duration and exercise load affect the scenario estimates for muscle, bone and gait.</p>
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
                                {i < a.length - 1 && <ArrowRightIcon aria-hidden="true" size={14} className="shrink-0 text-gray-400" />}
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
                  </details>
                </section>
                <section id="evaluate-ultrasound" className="evaluate-ultrasound" aria-labelledby="evaluate-ultrasound-title">
                  <h2 id="evaluate-ultrasound-title">Ultrasound</h2>
                    <div className="scenario-scans">
                      <Card
                        title="Neck ultrasound"
                        tag="Synthetic image"
                        origin={hasHemodynamics ? packet.hemodynamics!.provenance : 'UNAVAILABLE'}
                        className="min-h-0"
                      >
                        {!hasHemodynamics ? (
                          <UnavailableSubsystemPanel
                            title="Neck ultrasound unavailable"
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
                        title="Eye ultrasound"
                        tag="Synthetic image"
                        origin={hasHemodynamics ? packet.hemodynamics!.provenance : 'UNAVAILABLE'}
                        className="min-h-0"
                      >
                        {!hasHemodynamics ? (
                          <UnavailableSubsystemPanel
                            title="Eye ultrasound unavailable"
                            reason="Pure BIDMC replay does not include optic nerve sheath diameter or cabin ppCO2."
                            linkIsLive={link === 'ENGINE_LIVE'}
                            onEngageOverlay={() => setWhatIfOverlayActive(true)}
                          />
                        ) : (
                          <>
                            <OcularOnsd onsd={s.onsdMm} sigma={s.onsdSigmaMm} />
                            <div className="mt-2">
                              <Metric label="Optic nerve sheath" value={s.onsdMm.toFixed(2)} unit="mm" limit={`> ${P.onsdCritical} risk`} bad={s.onsdMm > P.onsdCritical} />
                              <Metric label="Cabin CO₂" value={whatIf.ppco2_mmhg.toFixed(1)} unit="mmHg" limit={`>= ${P.ppco2Critical} limit`} bad={whatIf.ppco2_mmhg >= P.ppco2Critical} />
                              {packet.is_local_simulation && (
                              <Metric label="Days since simulated scan" value={String(s.daysSinceScan)} unit="d" bad={s.daysSinceScan > 7} />
                            )}
                            </div>
                            {packet.is_local_simulation && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button type="button" disabled={s.daysSinceScan === 0}
                                  onClick={() => setLastScanDay(whatIf.mission_day)}
                                  className="act-secondary-button disabled:opacity-50">
                                  Reset simulated scan timer
                                </button>
                                {s.daysSinceScan === 0 && <span role="status" className="text-xs text-gray-300">Timer at 0 days</span>}
                              </div>
                            )}
                          </>
                        )}
                      </Card>
                    </div>
                </section>
              </div>
            )}

            {/* PAGE 3: ACT */}
            <div hidden={activePhase !== 'ACT'}>
              <div className="act-grid min-h-0 flex-1 overflow-y-auto">
                <Card
                  title="Guided Medical Procedure"
                  origin={packet.active_playbook ? 'DERIVED_FROM_HYBRID_SCENARIO' : 'SIMULATED_SCENARIO_INPUT'}
                  className="min-h-0"
                >
                  <div className="space-y-3">
                    {syntheticSecondsRemaining !== null && (
                      <p className="act-monitor-state" data-status="awaiting">
                        <strong>Synthetic event active</strong> · {syntheticSecondsRemaining} s left in the replay.
                        The checklist records your progress. The alarm follows the incoming readings.
                      </p>
                    )}
                    {waitingForProcedure ? (
                      <p role="status" className="act-monitor-state" data-status="awaiting">
                        Waiting for the engine to provide a procedure for this alarm.
                      </p>
                    ) : <PlaybookRunner
                      key={currentIncident?.key ?? 0}
                      activePlaybook={visiblePlaybook}
                      onSuggestedCompletionChange={incidentPlaybook ? handleIncidentCompletion : undefined}
                      isLiveEngine={link === 'ENGINE_LIVE'}
                      monitoringStatus={monitoringStatus}
                      onRestoreScenario={showUrgentStatus && (currentEpisode?.source === 'simulation' || whatIfOverlayActive)
                        ? restoreScenarioConditions : undefined}
                      thrombusConfirmed={thrombus}
                      ventEvent={ventEvent}
                      syncLatencyUs={ipcLatencyUs}
                      modelValidationStatus={packet.model_validation_status}
                      requestedPlaybook={incidentOpen ? null : requestedPlaybook}
                      onConfirmPocusThrombus={handleThrombusChange}
                      onRearmLbnp={() => setVentEvent(null)}
                    />}
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
                    <div className="rounded border border-line p-3">
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-bold text-white">GATE 4A: THORACIC DECOMPRESSION LOCK</span>
                        <span
                          className={
                            packet.active_playbook?.safety_gates?.gate4_invasive_decompression_locked === false
                              ? 'text-ok'
                              : 'text-critical'
                          }
                        >
                          {packet.active_playbook?.safety_gates?.gate4_invasive_decompression_locked === false
                            ? 'UNLOCKED'
                            : 'LOCKED'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        Invasive thoracic needle decompression is locked out until lung sliding absence / barcode sign is confirmed by lung ultrasound or severe hemodynamic collapse.
                      </p>
                    </div>
                    <div className="rounded border border-line p-3">
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-bold text-white">GATE 4B: EVA FITNESS NO-GO INTERLOCK</span>
                        <span
                          className={
                            packet.active_playbook?.safety_gates?.gate4_eva_fitness_no_go
                              ? 'text-critical'
                              : 'text-ok'
                          }
                        >
                          {packet.active_playbook?.safety_gates?.gate4_eva_fitness_no_go
                            ? 'NO-GO LOCKED'
                            : 'GO / NOMINAL'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        Blocks EVA airlock egress whenever Gait Asymmetry exceeds 12.0%, cognitive fatigue reaches 0.75, or Shock Index reaches 0.85.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </main>

          {/* Right Sticky Control Sidebar */}
          {activePhase !== 'EVALUATE' && <aside className="clinical-sidebar flex min-h-0 flex-col gap-4" aria-label="Readiness and scenario controls">
            <div className="readiness-panel">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="sidebar-heading">Mission readiness</span>
                  <OriginBadge origin={sm.provenance} />
                </div>
                <AlarmBadge level={sm.alarm_level} />
              </div>
              <MriGauge safety={sm} qualityFlags={qualityFlags} />
            </div>
            {activePhase === 'GATHER' && (
              <MeasurementContext
                source={bioOrigin}
                sampleRate={packet.provenance_manifest.biometrics_native_rate_hz}
                hrv={hrvFmt.unavailable ? null : `${hrvFmt.text} ms`}
                temperature={b.core_temp_celsius ?? null}
              />
            )}
          </aside>}
        </div>
      </div>

      <details className="system-disclosure">
        <CockpitSummary>System &amp; connection details
          <span>{lastBinaryFrame?.storm_shelter_mandatory || osStatus?.storm_shelter_mandatory ? 'Storm shelter mandatory' : lastBinaryFrame?.eva_airlock_forbidden || osStatus?.eva_airlock_forbidden ? 'EVA airlock restricted' : 'Onboard tools and runtime diagnostics'}</span>
        </CockpitSummary>
      <section className="mission-connection-details" aria-label="Simulated Earth link">
        <strong>{missionProfile.label}</strong>
        <span>{missionProfile.oneWayS === null ? 'Earth link unavailable · solar conjunction' :
          `Earth link · ${formatMissionDelay(missionProfile.oneWayS)} one way`}</span>
        <small>Simulated mission link · local engine status below</small>
      </section>
      <OsSystemStatusBar
        packet={packet}
        missionProfile={missionProfile}
        whatIf={whatIf}
        transportMode={transportMode}
        ipcLatencyUs={ipcLatencyUs}
        binaryFrameCount={binaryFrameCount}
        lastBinaryFrame={lastBinaryFrame}
        osStatus={osStatus}
      />
      </details>

      {shortcutsModalOpen && <DeferredPanel name="keyboard shortcuts"><KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      /></DeferredPanel>}

      {auditModalOpen && <DeferredPanel name="audit chain"><AuditChainModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      /></DeferredPanel>}

      <OsCommandPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
        }}
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
