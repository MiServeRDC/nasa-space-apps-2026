import { useState } from 'react';

interface Step { text: string; gate?: 'ANTICOAG' }

const PLAYBOOKS: Record<string, { title: string; steps: Step[] }> = {
  '#05': {
    title: 'Jugular Venous Stasis / Thrombosis',
    steps: [
      { text: 'Perform POCUS of left and right IJV (compression + Doppler).' },
      { text: 'Enter POCUS finding: intraluminal thrombus present / absent.' },
      { text: 'Physical countermeasures: LBNP -30 mmHg, calf contractions / NMES, hydration.' },
      { text: 'Pharmacological anticoagulation (requires POCUS-confirmed thrombus).', gate: 'ANTICOAG' },
      { text: 'Re-scan in 48 h; queue DSN store-and-forward report to flight surgeon.' },
    ],
  },
  '#04': {
    title: 'SANS / Optic Nerve Sheath Distension',
    steps: [
      { text: 'Ocular ultrasound: measure ONSD bilaterally.' },
      { text: 'Lower cabin ppCO2 target; verify scrubber status.' },
      { text: 'Nightly LBNP session -25 mmHg with anti-syncope guardrail armed.' },
      { text: 'Visual acuity / Amsler grid; log and schedule follow-up.' },
    ],
  },
};

export function PlaybookRunner({ thrombus, setThrombus }: {
  thrombus: boolean | null;
  setThrombus: (v: boolean | null) => void;
}) {
  const [id, setId] = useState<keyof typeof PLAYBOOKS>('#05');
  const [step, setStep] = useState(0);
  const pb = PLAYBOOKS[id];
  const current = pb.steps[step];
  const locked = current?.gate === 'ANTICOAG' && thrombus !== true;

  return (
    <div className="space-y-2 font-mono text-sm">
      <div className="flex gap-2">
        {Object.keys(PLAYBOOKS).map((k) => (
          <button key={k} onClick={() => { setId(k); setStep(0); }}
            className={`rounded border px-2 py-1 ${k === id ? 'border-nominal text-nominal' : 'border-line text-gray-500'}`}>
            PB {k}
          </button>
        ))}
      </div>
      <div className="text-gray-300">{pb.title}</div>
      <ol className="space-y-1">
        {pb.steps.map((s, i) => (
          <li key={i} className={`flex gap-2 ${i === step ? 'text-white' : i < step ? 'text-ok' : 'text-gray-600'}`}>
            <span>{i < step ? '[x]' : i === step ? '[>]' : '[ ]'}</span>
            <span>{s.text}</span>
            {s.gate && (
              <span className={`ml-auto shrink-0 rounded border px-1 text-xs ${thrombus === true ? 'border-ok text-ok' : 'border-critical text-critical'}`}>
                {thrombus === true ? 'GATE 1 OPEN' : 'GATE 1 LOCKED'}
              </span>
            )}
          </li>
        ))}
      </ol>

      {id === '#05' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">POCUS thrombus:</span>
          {([['UNSCANNED', null], ['ABSENT', false], ['CONFIRMED', true]] as const).map(([lbl, v]) => (
            <button key={lbl} onClick={() => setThrombus(v)}
              className={`rounded border px-2 py-0.5 ${thrombus === v ? 'border-nominal text-nominal' : 'border-line text-gray-500'}`}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button disabled={step === 0} onClick={() => setStep(step - 1)}
          className="rounded border border-line px-3 py-1 disabled:opacity-30">BACK</button>
        <button disabled={locked || step >= pb.steps.length} onClick={() => setStep(step + 1)}
          className="rounded border border-nominal px-3 py-1 text-nominal disabled:border-line disabled:text-gray-600">
          {locked ? 'LOCKED: NO ANTICOAGULANT WITHOUT POCUS THROMBUS' : step >= pb.steps.length ? 'COMPLETE' : 'CONFIRM STEP'}
        </button>
        {locked && (
          <button onClick={() => setStep(step + 1)} className="rounded border border-line px-3 py-1 text-gray-400">SKIP STEP</button>
        )}
      </div>
    </div>
  );
}
