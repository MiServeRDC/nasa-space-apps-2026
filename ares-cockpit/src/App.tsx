import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_WHATIF, evaluate, LBNP_SBP_DROP_LIMIT_MMHG, SEX_PROFILES,
  type PredicateKey, type WhatIf,
} from './lib/scenario';
import { useTelemetry } from './lib/useTelemetry';
import { AlarmBadge, TriPhaseHeader, type Phase } from './modules/header-triphase/TriPhaseHeader';
import { MriGauge, PredicateBars, StlChart } from './modules/mri-and-stl/MriAndStl';
import { BodyHeatmap } from './modules/body-3d-heatmap/BodyHeatmap';
import { WhatIfConsole } from './modules/whatif-console/WhatIfConsole';
import { PlaybookRunner } from './modules/playbook-runner/PlaybookRunner';
import { EcgStrip, OcularOnsd, PocusIjv } from './modules/analysis-imaging/Imaging';

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

function Card({ title, tag, children, className = '' }: { title: string; tag?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-lg border border-line bg-panel p-4 ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-100">{title}</h3>
        {tag && <span className="font-mono text-xs text-gray-500">{tag}</span>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Metric({ label, value, unit, limit, bad }: { label: string; value: string; unit: string; limit?: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line py-1 font-mono text-xs">
      <span className="text-gray-400">{label}</span>
      <span>
        <span className={bad ? 'font-bold text-critical' : 'text-white'}>{value}</span>
        <span className="text-gray-500"> {unit}</span>
        {limit && <span className="ml-2 text-gray-600">({limit})</span>}
      </span>
    </div>
  );
}

const fmt = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? 'UNAVAILABLE' : v.toFixed(d));

export default function App() {
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);
  const [thrombus, setThrombus] = useState<boolean | null>(null);
  const [lastScanDay, setLastScanDay] = useState<number>(DEFAULT_WHATIF.mission_day - 5);
  const [ventEvent, setVentEvent] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<Phase>('GATHER');
  const [evalTab, setEvalTab] = useState<EvalTab>('BODY_3D');

  const [sendWhatIf, setSendWhatIf] = useState(false);
  const { packet, link, commandError } = useTelemetry(whatIf, thrombus, lastScanDay, sendWhatIf);
  const s = useMemo(() => evaluate(whatIf, lastScanDay), [whatIf, lastScanDay]);

  const P = SEX_PROFILES[whatIf.sex];

  // Hard Safety Gate 2: LBNP anti-syncope auto-vent, latched until crew re-arms.
  useEffect(() => {
    if (whatIf.lbnp_mmhg === 0 || ventEvent) return;
    const drop = s.sbpBaseline - s.sbp;
    if (drop > LBNP_SBP_DROP_LIMIT_MMHG || s.hr > P.hrLimit) {
      setVentEvent(`Chamber vented from ${whatIf.lbnp_mmhg} mmHg to 0 mmHg (BP drop ${drop.toFixed(0)} mmHg, HR ${s.hr.toFixed(0)} bpm / limit ${P.hrLimit}).`);
      setWhatIf((w) => ({ ...w, lbnp_mmhg: 0 }));
    }
  }, [whatIf.lbnp_mmhg, s, ventEvent, P.hrLimit]);

  const sm = packet.safety_margins;
  const b = packet.biometrics;
  const recommendedPhase: Phase = sm.alarm_level === 'CRITICAL' || sm.alarm_level === 'WARNING' ? 'ACT'
    : sm.alarm_level === 'ADVISORY' ? 'EVALUATE' : 'GATHER';
  const ttv = sm.time_to_violation_days;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black">
      <TriPhaseHeader
        alarm={sm.alarm_level}
        link={link}
        activePhase={activePhase}
        recommendedPhase={recommendedPhase}
        onSelectPhase={setActivePhase}
      />

      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_340px]">
        {/* Left / Center Paged Workspace */}
        <main className="flex min-h-0 flex-col gap-3 overflow-hidden">
          {/* Compact status banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-4 py-2.5">
            <div className="text-sm text-gray-200">
              <span className="font-mono text-xs text-gray-500 mr-2">LOCAL WHAT-IF PREVIEW · DAY {whatIf.mission_day}</span>
              Main watch item:{' '}
              <span className={`font-semibold ${s.rhoMin < 0 ? 'text-critical' : s.rhoMin < 0.4 ? 'text-advisory' : 'text-nominal'}`}>
                {RISK_LABEL[s.worst]}
              </span>
              <span className="ml-2 font-mono text-xs text-gray-400">(margin {s.rhoMin.toFixed(2)})</span>
            </div>
            <div className="font-mono text-xs text-gray-400">
              {ttv === null || ttv === undefined
                ? 'Time-to-violation unavailable'
                : ttv === 0 ? 'Action needed now' : `Estimated ${ttv} days until limit`}
            </div>
          </div>

          {activePhase !== 'GATHER' && (
            <p className="font-mono text-xs text-advisory">Local simulation preview · separate from recorded telemetry</p>
          )}
          {/* PAGE 1: GATHER */}
          {activePhase === 'GATHER' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['Heart Rate', fmt(b.heart_rate_bpm), 'bpm'],
                  ['Blood Oxygen', fmt(b.spo2_percent, 1), '%'],
                  ['Breathing Rate', fmt(b.respiration_rate_brpm, 1), 'br/min'],
                  ['Pulse', fmt(b.pulse_rate_bpm), 'bpm'],
                ].map(([k, v, u]) => (
                  <div key={k} className="rounded-lg border border-line bg-panel p-4">
                    <div className="text-xs text-gray-400">{k}</div>
                    <div className={`mt-1 font-mono text-3xl ${v === 'UNAVAILABLE' ? 'text-base text-advisory' : 'text-white'}`}>{v}</div>
                    <div className="text-xs text-gray-600">{u}</div>
                  </div>
                ))}
              </div>

              <p className="font-mono text-xs text-gray-300" data-testid="replay-source">
                {packet.provenance_manifest.biometrics_source === 'RECORDED_TERRESTRIAL_BIDMC_CSV'
                  ? 'BIDMC replay · terrestrial ICU data' : packet.provenance_manifest.biometrics_source}
                {' · '}{packet.source_record_id}{' · '}{packet.relative_recording_time_s}s
                {' · native '}{packet.provenance_manifest.biometrics_native_rate_hz} Hz
                {packet.provenance_manifest.scenario_overlay_mode === 'SIMULATED_WHATIF_SCENARIO'
                  && ' · simulated overlay active'}
              </p>
              <Card title="Simulated ECG Preview" tag="LOCAL SIMULATION" className="min-h-0 flex-1">
                <div className="flex h-full flex-col justify-between gap-3">
                  <EcgStrip hr={s.hr} artifact={whatIf.artifact_level} sqi={s.sqi} />
                  <p className="text-sm text-gray-300">
                    The waveform is a local preview. BIDMC numeric replay does not supply this ECG trace.
                  </p>
                </div>
              </Card>
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
                    className={`cursor-pointer rounded border px-3 py-1.5 ${
                      evalTab === id ? 'border-nominal bg-nominal/15 font-bold text-nominal' : 'border-line text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {evalTab === 'BODY_3D' && (
                <Card title="Your 3D Body Scan" tag="Click any point to inspect, drag to rotate" className="min-h-0 flex-1">
                  <BodyHeatmap
                    s={s}
                    sex={whatIf.sex}
                    onChangeSex={(sex) => setWhatIf((w) => ({ ...w, sex }))}
                    onOpenTab={setEvalTab}
                  />
                </Card>
              )}

              {evalTab === 'POCUS' && (
                <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
                  <Card title="Neck Vein Ultrasound (IJV)" tag="SIMULATED POCUS" className="min-h-0">
                    <PocusIjv csa={s.csa} vmax={s.vmax} thrombus={thrombus} />
                    <div className="mt-2">
                      <Metric label="Vein area (CSA)" value={s.csa.toFixed(2)} unit="cm2" limit={`> ${P.ijvCriticalCsa} risk`} bad={s.csa > P.ijvCriticalCsa} />
                      <Metric label="Flow speed (Vmax)" value={s.vmax.toFixed(1)} unit="cm/s" limit={`< ${P.vmaxCritical} risk`} bad={s.vmax < P.vmaxCritical} />
                      <Metric label="Wall shear stress" value={s.tauW.toFixed(2)} unit="dyn/cm2" limit={`< ${P.tauWCritical} risk`} bad={s.tauW < P.tauWCritical} />
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Fluid shifts toward your head in microgravity, slowing blood flow in your neck. Using LBNP pulls fluid back down and restores healthy flow.
                    </p>
                  </Card>

                  <Card title="Eye & Optic Nerve Ultrasound" tag="SIMULATED POCUS" className="min-h-0">
                    <OcularOnsd onsd={s.onsdMm} sigma={s.onsdSigmaMm} />
                    <div className="mt-2">
                      <Metric label="Optic nerve sheath" value={s.onsdMm.toFixed(2)} unit="mm" limit={`> ${P.onsdCritical} risk`} bad={s.onsdMm > P.onsdCritical} />
                      <Metric label="Cabin CO2" value={whatIf.ppco2_mmhg.toFixed(1)} unit="mmHg" limit={`>= ${P.ppco2Critical} limit`} bad={whatIf.ppco2_mmhg >= P.ppco2Critical} />
                      <Metric label="Days since last scan" value={String(s.daysSinceScan)} unit="d" bad={s.daysSinceScan > 7} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setLastScanDay(whatIf.mission_day)}
                      className="mt-2 rounded border border-nominal px-3 py-1 font-mono text-xs text-nominal hover:bg-nominal hover:text-black"
                    >
                      LOG 2-MIN EYE SCAN NOW
                    </button>
                  </Card>
                </div>
              )}

              {evalTab === 'MUSCLE_BONE' && (
                <Card title="Your Muscle, Bone & Mars Landing Readiness" tag="DERIVED" className="min-h-0 flex-1">
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
                </Card>
              )}

              {evalTab === 'FORECAST' && (
                <Card title="14-Day Safety Margin Forecast" tag="NQS-STL" className="min-h-0 flex-1">
                  <div className="flex h-full flex-col justify-between gap-3">
                    <StlChart whatIf={whatIf} lastScanDay={lastScanDay} />
                    <PredicateBars rho={s.rho} />
                    <p className="text-xs text-gray-400">
                      Above 0 is within NASA safety limits; below 0 is a limit violation. The shaded band shows uncertainty since your last ultrasound scan.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* PAGE 3: ACT */}
          {activePhase === 'ACT' && (
            <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1.3fr_1fr]">
              <Card title="Guided Medical Procedure" className="min-h-0">
                <PlaybookRunner thrombus={thrombus} setThrombus={setThrombus} />
              </Card>
              <Card title="Active Safety Protections" className="min-h-0">
                <div className="space-y-4 text-sm text-gray-300">
                  <div className="rounded border border-line p-3">
                    <div className="flex justify-between font-mono text-xs">
                      <span className="font-bold text-white">NO BLIND BLOOD THINNERS</span>
                      <span className={thrombus === true ? 'text-ok' : 'text-critical'}>{thrombus === true ? 'OPEN' : 'LOCKED'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Anticoagulants stay locked until your neck ultrasound confirms a real clot, protecting you from dangerous bleeding after a minor bump.
                    </p>
                  </div>
                  <div className="rounded border border-line p-3">
                    <div className="flex justify-between font-mono text-xs">
                      <span className="font-bold text-white">FAINTING PROTECTION (LBNP)</span>
                      <span className={ventEvent ? 'text-critical' : 'text-ok'}>{ventEvent ? 'VENTED' : 'ARMED'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      If your blood pressure drops more than 15 mmHg or your heart rate passes 115 bpm during LBNP, the chamber vents back to 0 mmHg right away.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </main>

        {/* Right Sticky Control Sidebar */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="rounded-lg border border-line bg-panel p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-xs tracking-widest text-gray-500">YOUR READINESS</span>
              <AlarmBadge level={sm.alarm_level} />
            </div>
            <MriGauge mri={sm.mission_readiness_index} ttv={ttv} />
          </div>
          <div className="min-h-0 flex-1 rounded-lg border border-line bg-panel p-4">
            <div className="mb-2 font-mono text-xs tracking-widest text-gray-500">ADJUST CONDITIONS</div>
            <button type="button" disabled={sendWhatIf || link !== 'ENGINE_LIVE'} onClick={() => setSendWhatIf(true)}
              className="mb-2 rounded border border-line px-2 py-1 text-xs text-gray-300 disabled:opacity-50">
              {sendWhatIf ? 'Server What-If enabled' : 'Send What-If to server'}
            </button>
            {commandError && <p role="status" className="text-xs text-advisory">{commandError}</p>}
            <WhatIfConsole value={whatIf} onChange={setWhatIf} ventEvent={ventEvent} onRearm={() => setVentEvent(null)} />
          </div>
        </aside>
      </div>
    </div>
  );
}
