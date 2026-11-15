import { useState } from 'react';
import { CockpitSelect } from '../ui-primitives/CockpitControls';
import { type CrewSex, type WhatIf } from '../../lib/scenario';

type NumericKey = Exclude<keyof WhatIf, 'sex'>;

const SLIDERS: { key: NumericKey; label: string; unit: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'mission_day', label: 'Mission day', unit: 'd', min: 0, max: 900, step: 1, hint: 'Elapsed days in the scenario' },
  { key: 'ppco2_mmhg', label: 'Cabin CO₂', unit: 'mmHg', min: 0.5, max: 8, step: 0.1, hint: 'NASA nominal cabin limit: 3 mmHg averaged over one hour' },
  { key: 'ared_load_pct', label: 'ARED exercise load', unit: '%', min: 0, max: 150, step: 5, hint: 'Daily resistive training for muscles and bone' },
  { key: 'lbnp_mmhg', label: 'LBNP leg pressure', unit: 'mmHg', min: -50, max: 0, step: 1, hint: 'Pulls fluid back toward your legs' },
  { key: 'artifact_level', label: 'Signal noise', unit: '', min: 0, max: 1, step: 0.05, hint: 'Sweat, fan vibration, or exercise motion' },
];

export function WhatIfConsole({
  value,
  onChange,
  onSelectCrewProfile,
  onReset,
  ventEvent,
  onRearm,
  link,
  overlayActive,
  onToggleOverlay,
  onSyncNow,
}: {
  value: WhatIf;
  onChange: (w: WhatIf) => void;
  onSelectCrewProfile: (sex: CrewSex) => void;
  onReset: () => void;
  ventEvent: string | null;
  onRearm: () => void;
  link: 'ENGINE_LIVE' | 'LOCAL_SIMULATION';
  overlayActive: boolean;
  onToggleOverlay: (active: boolean) => void;
  onSyncNow: () => Promise<boolean>;
}) {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const resync = async () => {
    setSyncStatus('pending');
    setSyncStatus(await onSyncNow() ? 'success' : 'error');
  };

  return (
    <div className="scenario-fields text-xs">
      <div className="scenario-connection text-xs text-gray-300">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{overlayActive || link !== 'ENGINE_LIVE' ? 'Mission simulation active' : 'Simulate mission conditions'}</span>
          {link === 'ENGINE_LIVE' && (
            <button
              type="button"
              onClick={() => onToggleOverlay(!overlayActive)}
              className={`cursor-pointer rounded border px-2 py-0.5 text-[10px] ${
                overlayActive ? 'border-warning bg-warning text-black font-bold' : 'border-line text-gray-300'
              }`}
            >
              {overlayActive ? 'Return to recorded replay' : 'Start mission simulation'}
            </button>
          )}
        </div>
        <div className="mt-1 text-[10px] text-gray-300">
          {link === 'ENGINE_LIVE'
            ? overlayActive
              ? 'The model uses the conditions below to generate mission forecasts and synthetic ultrasound.'
              : 'Start the simulation or change a condition to generate mission forecasts and synthetic ultrasound.'
            : 'Local simulation'}
        </div>
      </div>
      <label className="scenario-profile">
        <span>Simulation body profile</span>
        <CockpitSelect value={value.sex} onChange={event => onSelectCrewProfile(event.currentTarget.value as CrewSex)}
          className="rounded border border-line bg-black px-2">
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </CockpitSelect>
      </label>
      {SLIDERS.map((s) => {
        const lockedLbnp = s.key === 'lbnp_mmhg' && ventEvent !== null;
        return (
          <label key={s.key} className={`scenario-slider ${lockedLbnp ? 'opacity-40' : ''}`}>
            <div className="flex flex-wrap justify-between gap-x-2 text-sm">
              <span className="text-gray-200">{s.label}</span>
              <span className="font-mono text-nominal">{value[s.key]} {s.unit}</span>
            </div>
            <input type="range" min={s.min} max={s.max} step={s.step} value={value[s.key]} disabled={lockedLbnp}
              onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })} />
            <div className="text-[11px] text-gray-500">{s.hint}</div>
          </label>
        );
      })}
      {ventEvent && (
        <div role="alert" className="scenario-vent space-y-1.5 rounded border border-critical p-2 text-xs text-critical">
          <div className="font-bold">Simulated LBNP vented</div>
          <div>{ventEvent}</div>
          <button onClick={onRearm} className="rounded border border-critical px-2 py-0.5 hover:bg-critical hover:text-black">
            Re-enable simulated LBNP
          </button>
        </div>
      )}
      <div className="scenario-actions flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="cursor-pointer rounded border border-line px-2.5 py-1 font-mono text-gray-300 hover:border-nominal"
          onClick={onReset}
        >
          Reset conditions
        </button>
        {link === 'ENGINE_LIVE' && overlayActive && (
          <button
            type="button"
            className="cursor-pointer rounded border border-nominal px-2.5 py-1 font-mono text-nominal hover:bg-nominal/15"
            onClick={() => void resync()}
            disabled={syncStatus === 'pending'}
          >
            {syncStatus === 'pending' ? 'Syncing…' : 'Resync with engine'}
          </button>
        )}
        {link === 'ENGINE_LIVE' && overlayActive && syncStatus !== 'idle' && (
          <span role="status" className="text-gray-300">
            {syncStatus === 'pending' ? 'Sending scenario…' : syncStatus === 'success' ? 'Engine accepted the scenario.' : 'Sync could not be confirmed. Retry.'}
          </span>
        )}
      </div>
    </div>
  );
}
