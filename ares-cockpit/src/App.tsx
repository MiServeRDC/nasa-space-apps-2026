import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_WHATIF, evaluate, LBNP_HR_LIMIT_BPM, LBNP_SBP_DROP_LIMIT_MMHG, type WhatIf } from './lib/scenario';
import { useTelemetry } from './lib/useTelemetry';
import { TriPhaseHeader, type Phase } from './modules/header-triphase/TriPhaseHeader';
import { MriGauge, PredicateBars, StlChart } from './modules/mri-and-stl/MriAndStl';
import { BodyHeatmap } from './modules/body-3d-heatmap/BodyHeatmap';
import { WhatIfConsole } from './modules/whatif-console/WhatIfConsole';
import { PlaybookRunner } from './modules/playbook-runner/PlaybookRunner';

function Panel({ title, tag, children, className = '' }: { title: string; tag?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded border border-line bg-panel p-3 ${className}`}>
      <div className="mb-2 flex justify-between font-mono text-xs uppercase tracking-wider">
        <span className="text-gray-400">{title}</span>
        {tag && <span className="text-gray-600">{tag}</span>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const fmt = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? 'UNAVAILABLE' : v.toFixed(d));

export default function App() {
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);
  const [thrombus, setThrombus] = useState<boolean | null>(null);
  const [ventEvent, setVentEvent] = useState<string | null>(null);
  const { packet, link } = useTelemetry(whatIf, thrombus);
  const s = useMemo(() => evaluate(whatIf), [whatIf]);

  // Hard Safety Gate 2: LBNP anti-syncope auto-vent (experienceLog Entry 003).
  useEffect(() => {
    if (whatIf.lbnp_mmhg === 0) return;
    const drop = s.sbpBaseline - s.sbp;
    if (drop > LBNP_SBP_DROP_LIMIT_MMHG || s.hr > LBNP_HR_LIMIT_BPM) {
      setVentEvent(`AUTO_VENT_LBNP_CHAMBER at ${whatIf.lbnp_mmhg} mmHg: SBP drop ${drop.toFixed(0)} mmHg, HR ${s.hr.toFixed(0)} bpm. Chamber vented to 0 mmHg.`);
      setWhatIf((w) => ({ ...w, lbnp_mmhg: 0 }));
    }
  }, [whatIf.lbnp_mmhg, s]);

  const sm = packet.safety_margins;
  const b = packet.biometrics;
  const phase: Phase = sm.alarm_level === 'CRITICAL' || sm.alarm_level === 'WARNING' ? 'ACT'
    : sm.alarm_level === 'ADVISORY' ? 'EVALUATE' : 'GATHER';

  return (
    <div className="flex h-full flex-col">
      <TriPhaseHeader alarm={sm.alarm_level} link={link} phase={phase} />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_1.1fr_1fr]">
        <div className="flex min-h-0 flex-col gap-3">
          <Panel title="1. Gather - Vitals" tag={packet.provenance_manifest.biometrics_source}>
            <div className="grid grid-cols-2 gap-2 font-mono">
              {[
                ['HR', fmt(b.heart_rate_bpm), 'bpm'],
                ['SpO2', fmt(b.spo2_percent, 1), '%'],
                ['RESP', fmt(b.respiration_rate_brpm, 1), 'br/min'],
                ['SBP', s.sbp.toFixed(0), 'mmHg'],
                ['tau_w', fmt(packet.hemodynamics?.wall_shear_stress_dyn_cm2, 2), 'dyn/cm2'],
                ['IJV CSA', fmt(packet.hemodynamics?.ijv_csa_cm2, 2), 'cm2'],
              ].map(([k, v, u]) => (
                <div key={k} className="rounded border border-line p-2">
                  <div className="text-xs text-gray-500">{k}</div>
                  <div className={`text-xl ${v === 'UNAVAILABLE' ? 'text-advisory text-sm' : 'text-white'}`}>{v}</div>
                  <div className="text-xs text-gray-600">{u}</div>
                </div>
              ))}
            </div>
            {b.missing_channels && b.missing_channels.length > 0 && (
              <div className="mt-2 font-mono text-xs text-advisory">MISSING: {b.missing_channels.join(', ')}</div>
            )}
            <div className="mt-2 font-mono text-xs text-gray-600">
              {packet.source_record_id} | native {packet.provenance_manifest.biometrics_native_rate_hz} Hz | UI {packet.provenance_manifest.ui_refresh_rate_hz} Hz
            </div>
          </Panel>
          <Panel title="What-If Stress-Test Console">
            <WhatIfConsole value={whatIf} onChange={(w) => { setVentEvent(null); setWhatIf(w); }} ventEvent={ventEvent} />
          </Panel>
        </div>

        <Panel title="3D Anatomical Deconditioning Map" tag="DERIVED_COMPUTED" className="min-h-[420px]">
          <BodyHeatmap s={s} />
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel title="2. Evaluate - NQS-STL / MRI" tag={sm.provenance}>
            <MriGauge mri={sm.mission_readiness_index} ttv={sm.time_to_violation_days} />
            <StlChart whatIf={whatIf} />
            <PredicateBars rho={s.rho} />
          </Panel>
          <Panel title="3. Act - MedOps Playbook Runner">
            <PlaybookRunner thrombus={thrombus} setThrombus={setThrombus} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
