import { DEFAULT_WHATIF, type WhatIf } from '../../lib/scenario';

const SLIDERS: { key: keyof WhatIf; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'ppco2_mmhg', label: 'Cabin ppCO2', unit: 'mmHg', min: 0.5, max: 8, step: 0.1 },
  { key: 'ared_load_pct', label: 'ARED Load', unit: '%', min: 0, max: 150, step: 5 },
  { key: 'lbnp_mmhg', label: 'LBNP Pressure', unit: 'mmHg', min: -50, max: 0, step: 1 },
  { key: 'mission_day', label: 'Mission Day', unit: 'd', min: 0, max: 900, step: 1 },
];

export function WhatIfConsole({ value, onChange, ventEvent }: {
  value: WhatIf;
  onChange: (w: WhatIf) => void;
  ventEvent: string | null;
}) {
  return (
    <div className="space-y-3 font-mono text-sm">
      {SLIDERS.map((s) => (
        <label key={s.key} className="block">
          <div className="flex justify-between">
            <span className="text-gray-400">{s.label}</span>
            <span className="text-nominal">{value[s.key]} {s.unit}</span>
          </div>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={value[s.key]}
            onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <div className="flex items-center justify-between">
        <button className="rounded border border-line px-3 py-1 text-gray-300 hover:border-nominal"
          onClick={() => onChange(DEFAULT_WHATIF)}>RESET</button>
        <span className="text-xs text-gray-600">SIMULATED_SCENARIO_INPUT</span>
      </div>
      {ventEvent && (
        <div role="alert" className="rounded border border-critical px-2 py-1 text-xs text-critical">{ventEvent}</div>
      )}
    </div>
  );
}
