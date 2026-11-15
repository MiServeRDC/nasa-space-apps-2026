// StoryShell — ARES-Health Narrative Scrollytelling & 3D Twin Host.
// Wraps SmoothScrollProvider (Lenis + GSAP ScrollTrigger ticker bridge),
// ScrollyProvider, PinnedScrollyStage, TopNavBar, the 3 NASA Triad Acts
// (Act1Gather, Act2Evaluate, Act3Act), OperatorToolsDrawer, OsCommandPalette,
// and AiInjuryModal.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, {
  lazy,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SmoothScrollProvider, useSmoothScroll } from './SmoothScrollProvider';
import { ScrollyProvider } from './ScrollyContext';
import { UnobstructedTwinHero } from '../components/anatomy/UnobstructedTwinHero';
import { TopNavBar } from '../components/navigation/TopNavBar';
import { Act1Gather } from './acts/Act1Gather';
import { Act2Evaluate } from './acts/Act2Evaluate';
import { Act3Act } from './acts/Act3Act';
import { OperatorToolsDrawer } from '../drawers/OperatorToolsDrawer';
import { OsCommandPalette } from '../modules/os-shell/OsCommandPalette';
import { DeferredPanel } from '../modules/ui-primitives/DeferredPanel';
import {
  DEFAULT_MISSION_PROFILE,
  type CrewActivity,
  type MissionProfile,
} from '../lib/missionContext';
import {
  DEFAULT_WHATIF,
  evaluate,
  SEX_PROFILES,
  type CrewSex,
  type WhatIf,
} from '../lib/scenario';
import { ENGINE_HTTP_URL, useTelemetry } from '../lib/useTelemetry';
import { updateAlarmEpisode, type AlarmEpisode } from '../lib/alarmRecovery';
import { formatNullableMetric } from '../lib/telemetryValidation';
import type { TargetTab } from '../modules/body-3d-heatmap/BodyHeatmap';
import type { InjuryMarker, InjuryRegionId } from '../types/injury';
import type { AuditRecord } from '../modules/audit-chain/AuditChainModal';
import type { DataOrigin } from '../types/telemetry';
import { gsap } from 'gsap';

const AiInjuryModal = lazy(() =>
  import('../modules/body-3d-heatmap/AiInjuryModal').then((m) => ({
    default: m.AiInjuryModal,
  })),
);

// ---------------------------------------------------------------------------
// Default initial audit genesis record
// ---------------------------------------------------------------------------

const INITIAL_AUDIT_LOG: AuditRecord[] = [
  {
    sequence_index: 0,
    timestamp_utc: '2026-11-14T06:00:00Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action: 'GENESIS: ARES-Health cryptographic ledger initialized. Pre-flight self-test OK.',
    prev_hash_hex: '0'.repeat(64),
    current_hash_hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    sequence_index: 1,
    timestamp_utc: '2026-11-14T08:15:22Z',
    actor_role: 'CREW_MEDICAL_OFFICER',
    event_action: 'SAFETY GATE 1 ENGAGED: Hard lockout on systemic anticoagulation enforced without POCUS thrombus confirmation.',
    prev_hash_hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    current_hash_hex: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
  },
];

// ---------------------------------------------------------------------------
// Inner shell content props
// ---------------------------------------------------------------------------

interface ShellContentProps {
  viewMode?: 'scrolly' | 'workbench';
  onViewModeChange?: (mode: 'scrolly' | 'workbench') => void;
}

function ScrollyShellContent({ viewMode = 'scrolly', onViewModeChange }: ShellContentProps) {
  // Navigation & drawer UI state
  const [operatorToolsOpen, setOperatorToolsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [missionProfile, setMissionProfile] = useState<MissionProfile>(DEFAULT_MISSION_PROFILE);
  const [crewActivity, setCrewActivity] = useState<CrewActivity>('unknown');
  const [thrombus, setThrombus] = useState<boolean | null>(null);
  const [lastScanDay, setLastScanDay] = useState<number>(DEFAULT_WHATIF.mission_day - 5);
  const [whatIfOverlayActive, setWhatIfOverlayActive] = useState(false);
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);

  // 3D stage & injury state
  const [activeLayers, setActiveLayers] = useState<readonly number[]>([0, 1, 2, 3]);
  const [injuries, setInjuries] = useState<InjuryMarker[]>([]);
  const [aiInjuryModalOpen, setAiInjuryModalOpen] = useState(false);
  const [selectedInjuryRegion, setSelectedInjuryRegion] = useState<InjuryRegionId>('LEFT_FOREARM');
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>(INITIAL_AUDIT_LOG);
  const [alarmEpisode, setAlarmEpisode] = useState<AlarmEpisode | null>(null);

  // Act DOM refs for click-to-scroll navigation
  const twinRef = useRef<HTMLElement>(null);
  const act1Ref = useRef<HTMLElement>(null);
  const act2Ref = useRef<HTMLElement>(null);
  const act3Ref = useRef<HTMLElement>(null);

  const chapterRefs = useMemo(
    () => [act1Ref, act2Ref, act3Ref],
    [],
  );

  const { lenis } = useSmoothScroll();

  const handleBodyTab = useCallback(
    (tab: TargetTab) => {
      if (tab === 'POCUS') {
        const el = act1Ref.current;
        if (!el) return;
        if (lenis) lenis.scrollTo(el, { offset: -48, duration: 1.0 });
        else el.scrollIntoView({ behavior: 'smooth' });
      } else {
        const el = act2Ref.current;
        if (!el) return;
        if (lenis) lenis.scrollTo(el, { offset: -48, duration: 1.0 });
        else el.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [lenis],
  );

  const handleScrollToAct2 = useCallback(() => {
    const el = act2Ref.current;
    if (!el) return;
    if (lenis) {
      lenis.scrollTo(el, { offset: -48, duration: 1.0 });
    } else {
      gsap.to(window, {
        scrollTo: { y: el, offsetY: 48 },
        duration: 1.0,
        ease: 'power2.inOut',
      });
    }
  }, [lenis]);

  // Authoritative telemetry hook
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
  } = useTelemetry(whatIf, thrombus, lastScanDay, whatIfOverlayActive);

  // Physiological scenario model
  const localSim = useMemo(() => evaluate(whatIf, lastScanDay), [whatIf, lastScanDay]);
  const P = SEX_PROFILES[whatIf.sex];

  // Biometrics extraction
  const b = packet.biometrics;
  const sm = packet.safety_margins;
  const qualityFlags = useMemo(
    () => Array.from(new Set([...(packet.quality_flags ?? []), ...(b.quality_flags ?? [])])),
    [packet.quality_flags, b.quality_flags],
  );
  const missingChannels = b.missing_channels ?? [];

  const hrVal = b.heart_rate_bpm ?? localSim.hr;
  const spo2Val = b.spo2_percent ?? localSim.spo2;
  const respVal = b.respiration_rate_brpm ?? localSim.resp;

  const hrvFmt = formatNullableMetric(b.hrv_rmssd_ms, 1, {
    channelName: 'hrv_rmssd_ms',
    qualityFlags,
    missingChannels,
    isRhythmDependent: true,
  });

  const bioOrigin: DataOrigin = packet.is_local_simulation
    ? 'SIMULATED_SCENARIO_INPUT'
    : packet.provenance_manifest.biometrics_source;

  // Alarm episode tracking
  const criticalMargin = sm.alarm_level === 'CRITICAL';
  const vitalsAlarm = packet.vitals_anomaly?.overall === 'ALARM';
  const hasCurrentData = !status.isStale && sm.alarm_level !== 'DATA_DEGRADED_MISSING_CHANNELS';
  const canVerifyVitals =
    Boolean(packet.vitals_anomaly?.baseline_ready) &&
    b.heart_rate_bpm != null &&
    b.spo2_percent != null &&
    b.respiration_rate_brpm != null;

  const currentEpisode = updateAlarmEpisode(alarmEpisode, {
    source: packet.is_local_simulation ? 'simulation' : 'engine',
    cause: vitalsAlarm ? 'vitals' : criticalMargin ? 'critical' : null,
    fresh: hasCurrentData,
    canVerifyVitals,
  });

  if (
    currentEpisode?.source !== alarmEpisode?.source ||
    currentEpisode?.cause !== alarmEpisode?.cause ||
    currentEpisode?.phase !== alarmEpisode?.phase
  ) {
    setAlarmEpisode(currentEpisode);
  }

  // Sex toggle handler
  const handleSexChange = useCallback((sex: CrewSex) => {
    setWhatIf((w) => ({ ...w, sex }));
  }, []);

  // What-If partial updater
  const handleWhatIfChange = useCallback((partial: Partial<WhatIf>) => {
    setWhatIf((w) => ({ ...w, ...partial }));
  }, []);

  // Injury handlers
  const handleSaveInjury = useCallback((inj: InjuryMarker) => {
    setInjuries((prev) => [...prev.filter((i) => i.id !== inj.id), inj]);
  }, []);

  const handleOpenAiInjury = useCallback((region?: InjuryRegionId) => {
    if (region) setSelectedInjuryRegion(region);
    setAiInjuryModalOpen(true);
  }, []);

  return (
    <div className="relative min-h-screen bg-black text-[var(--color-ink-display)] selection:bg-[var(--color-accent)]/20 selection:text-[var(--color-accent)]">
      {/* Fixed 48px Top Navigation Bar */}
      <TopNavBar
        chapterRefs={chapterRefs}
        missionProfile={missionProfile}
        onMissionProfileChange={setMissionProfile}
        sex={whatIf.sex}
        onSexChange={handleSexChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        sol={Math.round(packet.mission_elapsed_days ?? 242)}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenOperatorTools={() => setOperatorToolsOpen(true)}
      />

      {/* Narrative Acts Container */}
      <main className="relative z-10 flex flex-col pt-16 sm:pt-20 overflow-x-hidden">
        {/* Unobstructed 3D Biodigital Human Twin Aperture */}
        <section
          ref={twinRef as React.RefObject<HTMLDivElement>}
          data-chapter="0"
          className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 pt-4 pb-12 max-w-[1600px] mx-auto"
          aria-label="3D Biodigital Twin Aperture"
        >
          <div className="flex flex-col gap-2 pb-5 border-b border-slate-800/80 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-sky-400 font-bold">
                NASA TRIAD // DIGITAL TWIN CORE // 3D BIODIGITAL ANTHROPOMETRIC ATLAS
              </span>
              <span className="rounded border border-sky-400/40 bg-sky-950/50 px-2.5 py-0.5 font-mono text-xs text-sky-300 font-semibold shadow-[0_0_8px_rgba(56,189,248,0.2)]">
                ZERO OVERLAY • CONTINUOUS UBERON TOPOLOGY
              </span>
            </div>
            <h1 className="font-sans text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              Unobstructed 3D Biodigital Twin
            </h1>
            <p className="font-sans text-sm sm:text-base text-slate-300 max-w-4xl leading-relaxed">
              Volumetric anthropometric digital twin with 4-strata layer decomposition for both male and female astronauts.
              Decompose layers from skin down to the skeletal mechanostat, orbit in 360°, inspect microgravity physiological loads, and annotate clinical injuries directly on the 3D surface.
            </p>
          </div>

          <UnobstructedTwinHero
            sex={whatIf.sex}
            onChangeSex={handleSexChange}
            layers={activeLayers}
            onChangeLayers={setActiveLayers}
            s={packet.hemodynamics || packet.musculoskeletal ? localSim : null}
            hypergraphSpatial={packet.hypergraph_spatial}
            isLocalSimulation={Boolean(packet.is_local_simulation)}
            modelValidationStatus={packet.model_validation_status}
            injuries={injuries}
            onAddInjury={handleSaveInjury}
            onResolveInjury={(id) => setInjuries((prev) => prev.filter((i) => i.id !== id))}
            onOpenAiInjury={(reg) => handleOpenAiInjury(reg)}
            onOpenTab={handleBodyTab}
          />
        </section>

        {/* Act 1: Gather */}
        <div ref={act1Ref as React.RefObject<HTMLDivElement>}>
          <Act1Gather
            hr={hrVal}
            spo2={spo2Val}
            resp={respVal}
            sbp={localSim.sbp}
            dbp={78}
            map={Math.round(localSim.sbp * 0.33 + 78 * 0.67)}
            history={recordedHistory}
            crewActivity={crewActivity}
            onActivityChange={setCrewActivity}
            artifact={whatIf.artifact_level}
            sqi={b.sqi_score ?? localSim.sqi}
            isRecorded={bioOrigin === 'RECORDED_TERRESTRIAL_BIDMC_CSV'}
            ijvCsa={packet.hemodynamics?.ijv_csa_cm2 ?? localSim.csa}
            vmax={packet.hemodynamics?.ijv_velocity_max_cm_s ?? localSim.vmax}
            tauW={packet.hemodynamics?.wall_shear_stress_dyn_cm2 ?? localSim.tauW}
            thrombus={thrombus}
            bioOrigin={bioOrigin}
            sampleRate={packet.provenance_manifest.biometrics_native_rate_hz}
            hrv={hrvFmt.unavailable ? null : `${hrvFmt.text} ms`}
            temperature={b.core_temp_celsius ?? null}
            ppco2Mmhg={packet.environment?.cabin_ppco2_mmhg ?? whatIf.ppco2_mmhg}
            radiationMsvD={
              packet.environment?.ambient_radiation_rate_ugy_h
                ? (packet.environment.ambient_radiation_rate_ugy_h * 24) / 1000
                : 0.45
            }
            onScrollToAct2={handleScrollToAct2}
          />
        </div>

        {/* Act 2: Evaluate */}
        <div ref={act2Ref as React.RefObject<HTMLDivElement>}>
          <Act2Evaluate
            activeLayers={activeLayers}
            onLayersChange={setActiveLayers}
            sex={whatIf.sex}
            onSexChange={handleSexChange}
            onsdMm={packet.hemodynamics?.onsd_mm ?? localSim.onsdMm}
            onsdSigma={localSim.onsdSigmaMm}
            injuries={injuries}
            onOpenAiInjury={() => handleOpenAiInjury()}
            anomalyReport={packet.vitals_anomaly ?? undefined}
            engineLive={link === 'ENGINE_LIVE'}
            packet={packet}
            whatIf={whatIf}
            lastScanDay={lastScanDay}
            isPureReplay={false}
            onWhatIfChange={handleWhatIfChange}
          />
        </div>

        {/* Act 3: Act */}
        <div ref={act3Ref as React.RefObject<HTMLDivElement>}>
          <Act3Act
            packet={packet}
            auditRecords={auditRecords}
            onAuditAppend={setAuditRecords}
          />
        </div>
      </main>

      {/* Operator Tools Slide-Over Drawer */}
      <OperatorToolsDrawer
        open={operatorToolsOpen}
        onClose={() => setOperatorToolsOpen(false)}
        packet={packet}
        whatIf={whatIf}
        transportMode={transportMode}
        ipcLatencyUs={ipcLatencyUs}
        binaryFrameCount={binaryFrameCount}
        lastBinaryFrame={lastBinaryFrame}
        osStatus={osStatus}
        auditRecords={auditRecords}
      />

      {/* Global Command Palette (CMD+K) */}
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

      {/* Mount AiInjuryModal when onOpenAiInjury is triggered */}
      {aiInjuryModalOpen && (
        <DeferredPanel name="ai injury inspector">
          <AiInjuryModal
            isOpen={aiInjuryModalOpen}
            initialRegion={selectedInjuryRegion}
            onClose={() => setAiInjuryModalOpen(false)}
            onSaveInjury={(inj) => {
              handleSaveInjury(inj);
              setAiInjuryModalOpen(false);
            }}
            onResolveInjury={(id) => {
              setInjuries((prev) => prev.filter((i) => i.id !== id));
            }}
          />
        </DeferredPanel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StoryShell (Public Export)
// ---------------------------------------------------------------------------

export interface StoryShellProps {
  viewMode?: 'scrolly' | 'workbench';
  onViewModeChange?: (mode: 'scrolly' | 'workbench') => void;
}

export function StoryShell({ viewMode = 'scrolly', onViewModeChange }: StoryShellProps) {
  return (
    <SmoothScrollProvider>
      <ScrollyProvider>
        <ScrollyShellContent viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </ScrollyProvider>
    </SmoothScrollProvider>
  );
}
