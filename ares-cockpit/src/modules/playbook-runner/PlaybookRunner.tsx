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
    <section className="space-y-4" aria-label="Training procedure">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Training checklist</h3>
          <p className="mt-1 text-sm text-gray-400">Illustrative scenario</p>
        </div>
        <label className="grid gap-1 text-sm text-gray-300">
          Procedure
          <select value={id} onChange={(event) => { setId(event.target.value); setStep(0); }}
            className="min-h-12 max-w-full rounded-lg border border-line bg-black px-3 text-white">
            {Object.entries(PLAYBOOKS).map(([key, item]) => (
              <option key={key} value={key}>{item.title}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="act-current">
        <p className="text-sm font-medium text-nominal">
          {current ? `Step ${step + 1} of ${pb.steps.length}` : 'Checklist complete'}
        </p>
        {current && <p className="mt-2 text-lg leading-relaxed text-white">{current.text}</p>}
        {locked && <p className="mt-2 text-sm text-warning">Blocked until a positive POCUS result is entered.</p>}
      </div>

      {id === '#05' && (
        <label className="grid max-w-xs gap-1 text-sm text-gray-300">
          Simulated POCUS finding
          <select value={thrombus === null ? 'unscanned' : thrombus ? 'confirmed' : 'absent'}
            onChange={(event) => setThrombus(event.target.value === 'unscanned' ? null : event.target.value === 'confirmed')}
            className="min-h-12 rounded-lg border border-line bg-black px-3 text-white">
            <option value="unscanned">Awaiting scan</option>
            <option value="absent">Thrombus absent</option>
            <option value="confirmed">Thrombus confirmed</option>
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}
          className="min-h-12 rounded-lg border border-line px-4 disabled:opacity-40">Back</button>
        <button type="button" disabled={locked || !current} onClick={() => setStep(step + 1)}
          className="min-h-12 rounded-lg bg-nominal px-4 font-semibold text-black disabled:opacity-40">Confirm step</button>
        {locked && (
          <button type="button" onClick={() => setStep(step + 1)}
            className="min-h-12 rounded-lg border border-line px-4 text-gray-300">Skip blocked step</button>
        )}
      </div>

      <details className="rounded-lg border border-line px-3 text-sm">
        <summary className="flex min-h-12 cursor-pointer items-center text-gray-200">View all steps</summary>
        <ol className="list-decimal space-y-2 pb-4 pl-6 text-gray-300">
          {pb.steps.map((item, index) => (
            <li key={item.text} aria-current={index === step ? 'step' : undefined}>
              {item.text}{index === step && <span className="ml-2 text-nominal">Current step</span>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
