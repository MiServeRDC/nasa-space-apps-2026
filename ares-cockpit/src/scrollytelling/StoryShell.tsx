// StoryShell — ARES-Health Narrative Scrollytelling & 3D Twin Host.
// Wraps SmoothScrollProvider (Lenis + GSAP ScrollTrigger ticker bridge),
// ScrollyProvider, PinnedScrollyStage, TopNavBar, the 5 Narrative Chapters,
// OperatorToolsDrawer, and OsCommandPalette.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SmoothScrollProvider } from './SmoothScrollProvider';
import { ScrollyProvider } from './ScrollyContext';
import { PinnedScrollyStage } from '../stage3d/PinnedScrollyStage';
import { TopNavBar } from '../components/navigation/TopNavBar';
import { Chapter1Hero } from './chapters/Chapter1Hero';
import { Chapter2Cardio } from './chapters/Chapter2Cardio';
import { Chapter3Explorer } from './chapters/Chapter3Explorer';
import { Chapter4Musculoskeletal } from './chapters/Chapter4Musculoskeletal';
import { Chapter5Decision } from './chapters/Chapter5Decision';
import { OperatorToolsDrawer } from '../drawers/OperatorToolsDrawer';
import { OsCommandPalette } from '../modules/os-shell/OsCommandPalette';
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
import type { AtlasAnchors } from '../modules/body-3d-heatmap/AtlasBody';
import type { V3 } from '../modules/body-3d-heatmap/AnatomicalLayers';
import type { InjuryMarker } from '../types/injury';
import type { AuditRecord } from '../modules/audit-chain/AuditChainModal';
import type { DataOrigin } from '../types/telemetry';

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
// Inner shell: consumes ScrollyContext and renders chapters + 3D stage
// ---------------------------------------------------------------------------

function ScrollyShellContent() {
  // Navigation & drawer UI state
  const [operatorToolsOpen, setOperatorToolsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [missionProfile, setMissionProfile] = useState<MissionProfile>(DEFAULT_MISSION_PROFILE);
  const [crewActivity, setCrewActivity] = useState<CrewActivity>('unknown');
  const [thrombus, setThrombus] = useState<boolean | null>(null);
  const [lastScanDay, setLastScanDay] = useState<number>(DEFAULT_WHATIF.mission_day - 5);
  const [whatIfOverlayActive, setWhatIfOverlayActive] = useState(false);
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);

  // 3D stage state
  const [activeLayers, setActiveLayers] = useState<readonly number[]>([0, 1, 2, 3]);
  const [surfaceClickPoint, setSurfaceClickPoint] = useState<V3 | null>(null);
  const [injuries, setInjuries] = useState<InjuryMarker[]>([]);
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>(INITIAL_AUDIT_LOG);
  const [alarmEpisode, setAlarmEpisode] = useState<AlarmEpisode | null>(null);

  // Chapter DOM refs for click-to-scroll navigation
  const ch1Ref = useRef<HTMLElement>(null);
  const ch2Ref = useRef<HTMLElement>(null);
  const ch3Ref = useRef<HTMLElement>(null);
  const ch4Ref = useRef<HTMLElement>(null);
  const ch5Ref = useRef<HTMLElement>(null);

  const chapterRefs = useMemo(
    () => [ch1Ref, ch2Ref, ch3Ref, ch4Ref, ch5Ref],
    [],
  );

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
    injectAnomaly,
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
  const canVerifyVitals = Boolean(packet.vitals_anomaly?.baseline_ready) &&
    b.heart_rate_bpm != null && b.spo2_percent != null && b.respiration_rate_brpm != null;

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

  const handleClearSurfaceClick = useCallback(() => {
    setSurfaceClickPoint(null);
  }, []);

  return (
    <div className="relative min-h-screen bg-black text-[var(--color-ink-display)] selection:bg-[var(--color-accent)]/20 selection:text-[var(--color-accent)]">
      {/* Pinned 3D Scrolly Stage (fixed inset-0 z-0 behind HTML content) */}
      <PinnedScrollyStage
        sex={whatIf.sex}
        layers={activeLayers}
        onSurfaceClick={(pt) => setSurfaceClickPoint(pt)}
      />

      {/* Fixed 44px Top Navigation Bar */}
      <TopNavBar
        chapterRefs={chapterRefs}
        missionProfile={missionProfile}
        onMissionProfileChange={setMissionProfile}
        sex={whatIf.sex}
        onSexChange={handleSexChange}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenOperatorTools={() => setOperatorToolsOpen(true)}
      />

      {/* Narrative Chapters Container (z-10 relative, transparent backdrop) */}
      <main className="relative z-10 flex flex-col pt-11">
        {/* Chapter 1: Hero / Descent */}
        <div ref={ch1Ref as React.RefObject<HTMLDivElement>}>
          <Chapter1Hero
            hr={hrVal}
            spo2={spo2Val}
            resp={respVal}
            history={recordedHistory}
            crewActivity={crewActivity}
            onActivityChange={setCrewActivity}
          />
        </div>

        {/* Chapter 2: Cardiorespiratory & Thoracic Monitor */}
        <div ref={ch2Ref as React.RefObject<HTMLDivElement>}>
          <Chapter2Cardio
            hr={hrVal}
            artifact={whatIf.artifact_level}
            sqi={b.sqi_score ?? localSim.sqi}
            isRecorded={bioOrigin === 'RECORDED_TERRESTRIAL_BIDMC_CSV'}
            ijvCsa={packet.hemodynamics?.ijv_csa_cm2 ?? localSim.csa}
            vmax={packet.hemodynamics?.ijv_velocity_max_cm_s ?? localSim.vmax}
            thrombus={thrombus}
            bioOrigin={bioOrigin}
            sampleRate={packet.provenance_manifest.biometrics_native_rate_hz}
            hrv={hrvFmt.unavailable ? null : `${hrvFmt.text} ms`}
            temperature={b.core_temp_celsius ?? null}
            ppco2Mmhg={packet.environment?.cabin_ppco2_mmhg ?? whatIf.ppco2_mmhg}
            radiationMsvD={packet.environment?.ambient_radiation_rate_ugy_h ? (packet.environment.ambient_radiation_rate_ugy_h * 24) / 1000 : 0.45}
            history={recordedHistory}
          />
        </div>

        {/* Chapter 3: Interactive Biodigital Explorer */}
        <div ref={ch3Ref as React.RefObject<HTMLDivElement>}>
          <Chapter3Explorer
            activeLayers={activeLayers}
            onLayersChange={setActiveLayers}
            onsdMm={packet.hemodynamics?.onsd_mm ?? localSim.onsdMm}
            onsdSigma={localSim.onsdSigmaMm}
            injuries={injuries}
            onSaveInjury={handleSaveInjury}
            anomalyReport={packet.vitals_anomaly}
            activePlaybook={packet.active_playbook}
            engineLive={link === 'ENGINE_LIVE'}
            surfaceClickPoint={surfaceClickPoint}
            onClearSurfaceClick={handleClearSurfaceClick}
          />
        </div>

        {/* Chapter 4: Musculoskeletal & Bone Cascade */}
        <div ref={ch4Ref as React.RefObject<HTMLDivElement>}>
          <Chapter4Musculoskeletal
            packet={packet}
            whatIf={whatIf}
            lastScanDay={lastScanDay}
            isPureReplay={false}
            onWhatIfChange={handleWhatIfChange}
          />
        </div>

        {/* Chapter 5: Clinical Decision Support & Aerospace 360 */}
        <div ref={ch5Ref as React.RefObject<HTMLDivElement>}>
          <Chapter5Decision
            packet={packet}
            auditRecords={auditRecords}
            onAuditAppend={setAuditRecords}
          />
        </div>
      </main>

      {/* Operator Tools Slide-Over Drawer (Level 3 Engineering Tools) */}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// StoryShell (Public Export)
// ---------------------------------------------------------------------------

export function StoryShell() {
  return (
    <SmoothScrollProvider>
      <ScrollyProvider>
        <ScrollyShellContent />
      </ScrollyProvider>
    </SmoothScrollProvider>
  );
}
