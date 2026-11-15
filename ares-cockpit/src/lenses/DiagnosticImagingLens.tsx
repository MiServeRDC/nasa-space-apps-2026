// Unified Multimodal Diagnostic Imaging Lens (`DiagnosticImagingLens`).
// Consolidates:
// 1. `POCUS_IJV`: B-Mode Left Internal Jugular Vein ultrasound + `TacticalReticleSvg` +
//    tactile `>= 48px` Gate 1 Intraluminal Thrombus Compression Exam selector
// 2. `OCULAR_ONSD`: Ocular Optic Nerve Sheath Diameter (`5.80 mm` SANS cutoff) + `TacticalReticleSvg`
// 3. `OPTICAL_AND_MRI`: Scoped Drei `<View />` `<SecondaryMeshViewport />` (`OCULAR_SANS_GLOBE`,
//    `IJV_LUMEN_SEGMENT`, `FEMUR_TRABECULAR`), `OPTICAL_RGB_HEURISTIC_V1` pinned marker list,
//    and `Launch Optical RGB Triage Scanner` trigger.

import React, { useState } from 'react';
import type { TelemetryPacket } from '../types/telemetry';
import type { InjuryMarker } from '../types/injury';
import type { DiagnosticImagingTab } from '../types/workbench';
import type { ScenarioState } from '../lib/scenario';
import { OcularOnsd, PocusIjv } from '../modules/analysis-imaging/Imaging';
import { TacticalReticleSvg } from '../instruments/TacticalReticleSvg';
import {
  SecondaryMeshViewport,
  type SecondarySpecimenKind,
} from '../stage3d/SecondaryMeshViewport';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { buildClinicalViewModel } from '../lib/clinicalViewModel';
import { ClinicalDataNotice } from '../workbench/ClinicalDataNotice';
import { announcePolite } from '../stores/a11yAnnouncer';

export interface DiagnosticImagingLensProps {
  packet: TelemetryPacket;
  scenario: ScenarioState;
  thrombusConfirmed: boolean | null;
  onChangeThrombusConfirmed: (confirmed: boolean | null) => void;
  injuryMarkers?: readonly InjuryMarker[];
  onOpenOpticalScanner?: () => void;
  mode?: 'ULTRASOUND' | 'OPTICAL_3D' | 'COMBINED';
}

export function DiagnosticImagingLens({
  packet,
  thrombusConfirmed,
  onChangeThrombusConfirmed,
  injuryMarkers = [],
  onOpenOpticalScanner,
  mode = 'COMBINED',
}: DiagnosticImagingLensProps) {
  const imagingTab = useWorkbenchStore((s) => s.imagingTab);
  const setImagingTab = useWorkbenchStore((s) => s.setImagingTab);
  const [specimen, setSpecimen] = useState<SecondarySpecimenKind>('OCULAR_SANS_GLOBE');

  const vm = buildClinicalViewModel(packet);
  const csa = vm.ijvCsa.value, vmax = vm.ijvVelocity.value;
  const tauW = vm.ijvShear.value, onsd = vm.onsd.value;

  const activeTab: DiagnosticImagingTab =
    mode === 'OPTICAL_3D'
      ? 'OPTICAL_AND_MRI'
      : mode === 'ULTRASOUND' && imagingTab === 'OPTICAL_AND_MRI'
        ? 'POCUS_IJV'
        : imagingTab;

  const imagingAvailable = activeTab === 'OCULAR_ONSD' ? onsd !== null : csa !== null && vmax !== null;

  return (
    <div className="space-y-3">
      <ClinicalDataNotice packet={packet} />
      <p className="font-mono text-[10px] text-amber-300">Procedural anatomy illustration; no acquired ultrasound image. Measurement uncertainty is not supplied. Parameter origin: {vm.ijvCsa.provenance}.</p>
      {/* Sub-mode switcher when not locked to OPTICAL_3D */}
      {mode !== 'OPTICAL_3D' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Select imaging modality"
            className="flex flex-wrap gap-1 font-mono text-[10px]"
          >
            {(
              [
                { id: 'POCUS_IJV', label: 'L-IJV B-MODE' },
                { id: 'OCULAR_ONSD', label: 'OCULAR ONSD' },
                ...(mode === 'COMBINED'
                  ? ([{ id: 'OPTICAL_AND_MRI', label: 'OPTICAL & 3D' }] as const)
                  : []),
              ] as const
            ).map((opt) => {
              const selected = activeTab === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setImagingTab(opt.id)}
                  className={`ares-interactive rounded border px-2.5 py-1.5 font-semibold ${
                    selected
                      ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                      : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <span className="ares-tabular-metric font-mono text-[10px] text-amber-300">
            TAU_W {tauW?.toFixed(2) ?? 'N/A'} dyn/cm2
          </span>
        </div>
      ) : null}

      {/* Modality 1 & 2: POCUS IJV / Ocular ONSD Ultrasound + SVG Caliper Reticle */}
      {activeTab !== 'OPTICAL_AND_MRI' ? (
        <div className="space-y-3">
          {!imagingAvailable ? <p role="status" data-imaging-availability="UNAVAILABLE">Imaging parameters unavailable for this source.</p> : activeTab === 'OCULAR_ONSD' && onsd !== null ? (
            <div className="relative overflow-hidden rounded-xl border border-white/10">
              <OcularOnsd onsd={onsd} sigma={null} />
              <TacticalReticleSvg
                variant="OCULAR_ONSD"
                simulated sourceLabel="PROCEDURAL ILLUSTRATION"
                warningActive={onsd >= 5.8}
                caliperPrimaryText={`ONSD ${onsd.toFixed(2)} mm | uncertainty unavailable`}
                caliperSecondaryText="SANS CUTOFF 5.80 mm"
                className="absolute inset-0 h-full w-full"
              />
            </div>
          ) : csa !== null && vmax !== null ? (
            <div className="relative overflow-hidden rounded-xl border border-white/10">
              <PocusIjv csa={csa} vmax={vmax} thrombus={thrombusConfirmed} />
              <TacticalReticleSvg
                variant="POCUS_IJV"
                simulated sourceLabel="PROCEDURAL ILLUSTRATION"
                warningActive={thrombusConfirmed === true || (tauW !== null && tauW < 1.2)}
                caliperPrimaryText={`CSA ${csa.toFixed(2)} cm2 | VMAX ${vmax.toFixed(1)} cm/s`}
                caliperSecondaryText={`POISEUILLE TAU_W ${tauW?.toFixed(2) ?? 'N/A'} dyn/cm2`}
                className="absolute inset-0 h-full w-full"
              />
            </div>
          ) : null}

          {/* Tactile Gate 1 Intraluminal Thrombus Compression Exam (`>= 48px` buttons) */}
          <div className="ares-inner-well space-y-2 p-2.5">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="font-semibold text-[var(--color-ink-display)]">
                GATE 1 TACTILE POCUS COMPRESSION EXAM
              </span>
              <span
                className={
                  thrombusConfirmed === true
                    ? 'text-rose-300'
                    : thrombusConfirmed === false
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                }
              >
                {thrombusConfirmed === true
                  ? 'THROMBUS CONFIRMED (GATE 1 UNLOCKED)'
                  : thrombusConfirmed === false
                    ? 'LUMEN COMPRESSIBLE (GATE 1 LOCKED)'
                    : 'UNVERIFIED (GATE 1 LOCKED)'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
              {(
                [
                  { val: null, label: 'UNVERIFIED' },
                  { val: false, label: 'NO THROMBUS' },
                  { val: true, label: 'CLOT VERIFIED' },
                ] as const
              ).map((opt) => {
                const active = thrombusConfirmed === opt.val;
                return (
                  <button
                    key={String(opt.val)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onChangeThrombusConfirmed(opt.val);
                      announcePolite(`POCUS jugular thrombus state set to ${opt.label}.`);
                    }}
                    className={`ares-touch-target ares-interactive rounded-lg border px-1.5 font-semibold ${
                      active
                        ? opt.val === true
                          ? 'border-rose-400/75 bg-rose-500/20 text-rose-100'
                          : 'border-cyan-400/65 bg-cyan-400/15 text-cyan-100'
                        : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Modality 3: Scoped 3D Specimen Inspector (`<SecondaryMeshViewport />`) + Optical RGB Triage */}
      {activeTab === 'OPTICAL_AND_MRI' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1 font-mono text-[9px]">
            {(
              [
                { id: 'OCULAR_SANS_GLOBE', label: 'OCULAR GLOBE + ONSD' },
                { id: 'IJV_LUMEN_SEGMENT', label: 'L-IJV VASCULAR LUMEN' },
                { id: 'FEMUR_TRABECULAR', label: 'FEMUR TRABECULAE' },
              ] as const
            ).map((sp) => {
              const selected = specimen === sp.id;
              return (
                <button
                  key={sp.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSpecimen(sp.id)}
                  className={`ares-interactive rounded border px-2 py-1 font-semibold ${
                    selected
                      ? 'border-cyan-400/65 bg-cyan-400/15 text-cyan-200'
                      : 'border-white/10 bg-black text-[var(--color-ink-meta)]'
                  }`}
                >
                  {sp.label}
                </button>
              );
            })}
          </div>

          <SecondaryMeshViewport
            specimen={specimen}
            scalarLoad={
              0
            }
            observed={false}
            label={`Anatomical reference (not measured): ${specimen}`}
            className="h-44 w-full"
          />

          <div className="ares-inner-well space-y-2 p-3 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--color-ink-display)]">
                OPTICAL_RGB_HEURISTIC_V1
              </span>
              <span className="rounded border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-200">
                ILLUSTRATIVE_UNVALIDATED
              </span>
            </div>

            <p className="text-[10px] leading-relaxed text-[var(--color-ink-meta)]">
              Air-gapped HTML5 Canvas RGB pixel evaluation (erythema, contrast quality gate,
              dark-pixel ratio, 0g closed-circuit saline containment). Active 3D pins:{' '}
              {injuryMarkers.length}.
            </p>

            {injuryMarkers.length > 0 ? (
              <div className="max-h-24 space-y-1 overflow-y-auto pt-1">
                {injuryMarkers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded border border-white/10 bg-black/70 px-2 py-1 text-[10px]"
                  >
                    <span className="truncate text-[var(--color-ink-display)]">{m.title}</span>
                    <span className="ml-2 shrink-0 text-amber-300">
                      C:{(m.contrastIndex ?? 0).toFixed(2)} | {m.severity}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {onOpenOpticalScanner ? (
              <button
                type="button"
                onClick={onOpenOpticalScanner}
                className="ares-touch-target ares-interactive w-full rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-3 font-semibold text-cyan-200"
              >
                LAUNCH OPTICAL RGB TRIAGE SCANNER
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
