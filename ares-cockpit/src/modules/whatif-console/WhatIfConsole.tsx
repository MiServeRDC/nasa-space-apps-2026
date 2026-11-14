import { DEFAULT_WHATIF, type CrewSex, type WhatIf } from '../../lib/scenario';

type NumericKey = Exclude<keyof WhatIf, 'sex'>;

const SLIDERS: { key: NumericKey; label: string; unit: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'mission_day', label: 'Mission Day', unit: 'd', min: 0, max: 900, step: 1, hint: 'Days you have spent in microgravity' },
  { key: 'ppco2_mmhg', label: 'Cabin CO2', unit: 'mmHg', min: 0.5, max: 8, step: 0.1, hint: 'Keep below 4.0 mmHg to protect your vision' },
  { key: 'ared_load_pct', label: 'ARED Exercise Load', unit: '%', min: 0, max: 150, step: 5, hint: 'Daily resistive training for muscles and bone' },
  { key: 'lbnp_mmhg', label: 'LBNP Leg Pressure', unit: 'mmHg', min: -50, max: 0, step: 1, hint: 'Pulls fluid back toward your legs' },
  { key: 'artifact_level', label: 'Signal Noise', unit: '', min: 0, max: 1, step: 0.05, hint: 'Sweat, fan vibration, or exercise motion' },
];

export function WhatIfConsole({
  value,
  onChange,
  ventEvent,
  onRearm,
  link,
  overlayActive,
  onToggleOverlay,
  onSyncNow,
}: {
  value: WhatIf;
  onChange: (w: WhatIf) => void;
  ventEvent: string | null;
  onRearm: () => void;
  link: 'ENGINE_LIVE' | 'LOCAL_SIMULATION';
  overlayActive: boolean;
  onToggleOverlay: (active: boolean) => void;
  onSyncNow: () => void;
}) {
  const setSex = (sex: CrewSex) => onChange({ ...value, sex });

  return (
    <div className="space-y-2.5 text-xs">
      <div className="rounded border border-warning/40 bg-warning/10 p-2 font-mono text-[11px] text-warning">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">SIMULATED WHAT-IF OVERLAY</span>
          {link === 'ENGINE_LIVE' && (
            <button
              type="button"
              onClick={() => onToggleOverlay(!overlayActive)}
              className={`cursor-pointer rounded border px-2 py-0.5 text-[10px] ${
                overlayActive ? 'border-warning bg-warning text-black font-bold' : 'border-line text-gray-300'
              }`}
            >
              {overlayActive ? 'OVERLAY: ON' : 'OVERLAY: OFF'}
            </button>
          )}
        </div>
        <div className="mt-1 text-[10px] text-gray-300">
          {link === 'ENGINE_LIVE'
            ? overlayActive
              ? 'Syncing What-If overrides via POST /api/stress-test. Recorded BIDMC channels remain unchanged.'
              : 'Observing engine stream. Adjust sliders or click OVERLAY: ON to test scenarios without altering recorded BIDMC history.'
            : 'Engine offline: sliders drive the local deterministic preview model.'}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900/70 px-2.5 py-1.5 font-mono">
        <div>
          <div className="text-xs font-semibold text-gray-200">Crew Sex</div>
          <div className="text-[10px] text-gray-500">Adjusts baselines &amp; limits</div>
        </div>
        <div className="flex rounded-full bg-black p-0.5 border border-gray-700">
          {(['MALE', 'FEMALE'] as const).map((sex) => {
            const active = value.sex === sex;
            const activeCls = sex === 'MALE' ? 'bg-sky-400 text-black font-bold' : 'bg-fuchsia-400 text-black font-bold';
            return (
              <button
                key={sex}
                type="button"
                onClick={() => setSex(sex)}
                className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${active ? activeCls : 'text-gray-400 hover:text-white'}`}
              >
                {sex}
              </button>
            );
          })}
        </div>
      </div>

      {SLIDERS.map((s) => {
        const lockedLbnp = s.key === 'lbnp_mmhg' && ventEvent !== null;
        return (
          <label key={s.key} className={`block ${lockedLbnp ? 'opacity-40' : ''}`}>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-gray-200">{s.label}</span>
              <span className="text-nominal">{value[s.key]} {s.unit}</span>
            </div>
            <input type="range" min={s.min} max={s.max} step={s.step} value={value[s.key]} disabled={lockedLbnp}
              onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })} />
            <div className="text-[11px] text-gray-500">{s.hint}</div>
          </label>
        );
      })}
      {ventEvent && (
        <div role="alert" className="space-y-1.5 rounded border border-critical p-2 text-xs text-critical">
          <div className="font-bold">LBNP AUTO-VENTED FOR YOUR SAFETY</div>
          <div>{ventEvent}</div>
          <button onClick={onRearm} className="rounded border border-critical px-2 py-0.5 hover:bg-critical hover:text-black">
            I FEEL FINE - RE-ARM LBNP
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          className="cursor-pointer rounded border border-line px-2.5 py-1 font-mono text-gray-300 hover:border-nominal"
          onClick={() => {
            onChange(DEFAULT_WHATIF);
            onToggleOverlay(false);
          }}
        >
          RESET
        </button>
        {link === 'ENGINE_LIVE' && overlayActive && (
          <button
            type="button"
            className="cursor-pointer rounded border border-nominal px-2.5 py-1 font-mono text-nominal hover:bg-nominal/15"
            onClick={onSyncNow}
          >
            RESYNC POST
          </button>
        )}
        <span className="font-mono text-[11px] text-gray-500">WHAT-IF SIMULATOR</span>
      </div>
    </div>
  );
}
