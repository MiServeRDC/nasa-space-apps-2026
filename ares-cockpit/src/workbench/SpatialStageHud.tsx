// Central 3D Stage Floating HUD (`SpatialStageHud`).
// Provides:
// 1. Floating Twin Layer & Turntable Pill (`hud-specular-card`, Root Blur Shell #4 of <= 4 budget):
//    `ROTATE | SKELETAL | IJV/VASC | VISCERAL | MALE/FEMALE | FULL BODY`
// 2. Live Anatomical Problem Hotspots Rail (`5` canonical `UBERON:` sites + pinned `InjuryMarker` badges,
//    solid L2 surface with `0` extra `backdrop-filter` to preserve the `<= 4` blur-shell budget)
// 3. Active `UBERON:` anatomical node stage callout (`.ares-stage-callout`)
// 4. Accessible `.spatial-node-anchor` keyboard mirror buttons (`SpatialNodeKeyboardAnchors`)
// 5. Peripheral `TacticalReticleSvg` framing (`[EMPIRICAL - BIDMC CSV]` vs `[DELTA SIMULATED - UNVALIDATED]`)

import React from 'react';
import type {
  AnatomicalRegionWireId,
  HypergraphSpatialSummary,
} from '../types/telemetry';
import type { InjuryMarker } from '../types/injury';
import type { LazyAnatomicalGlbToggles } from '../stage3d/BiodigitalTwinStage';
import { SpatialNodeKeyboardAnchors } from '../stage3d/UnifiedCameraController';
import {
  CANONICAL_REGIONS,
  projectHypergraphTo3D,
} from '../modules/body-3d-heatmap/uberonSpatialMapping';
import { resolveSafeNodeHexColor } from '../stage3d/geometry/uberonInstancedNodes';
import { TacticalReticleSvg } from '../instruments/TacticalReticleSvg';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { announcePolite } from '../stores/a11yAnnouncer';

export interface SpatialStageHudProps {
  lazyGlbLayers: LazyAnatomicalGlbToggles;
  onToggleGlbLayer: (layer: keyof LazyAnatomicalGlbToggles) => void;
  hypergraphSummary?: HypergraphSpatialSummary | null;
  injuryMarkers?: readonly InjuryMarker[];
  onOpenOpticalScanner?: () => void;
  simulated?: boolean;
  onSexChange?: (sex: 'MALE' | 'FEMALE') => void;
  className?: string;
}

const SHORT_HOTSPOT_META: Readonly<
  Record<AnatomicalRegionWireId, { keyNum: string; shortLabel: string }>
> = {
  EyeOcularSans: { keyNum: '1', shortLabel: 'EYES / SANS' },
  InternalJugularVein: { keyNum: '2', shortLabel: 'IJV STASIS' },
  HeartCardioAutonomic: { keyNum: '3', shortLabel: 'HEART / HRV' },
  SoleusCalcaneus: { keyNum: '4', shortLabel: 'SOLEUS / BONE' },
  BrainVestibularCns: { keyNum: '5', shortLabel: 'BRAIN / CNS' },
};

function formatHotspotStatus(observed: boolean, localIntensity: number, propagatedIntensity: number): string {
  if (!observed) {
    return propagatedIntensity >= 0.05 ? 'PROPAGATED' : 'NO R-R';
  }
  const pct = Math.round(Math.max(0, Math.min(1, localIntensity)) * 100);
  if (localIntensity >= 0.70) return `${pct}% CRIT`;
  if (localIntensity >= 0.38) return `${pct}% WARN`;
  if (localIntensity >= 0.20) return `${pct}% WATCH`;
  return `${pct}% OK`;
}

export function SpatialStageHud({
  lazyGlbLayers,
  onToggleGlbLayer,
  hypergraphSummary = null,
  injuryMarkers = [],
  onOpenOpticalScanner,
  simulated = false,
  onSexChange,
  className = '',
}: SpatialStageHudProps) {
  const twinSex = useWorkbenchStore((s) => s.twinSex);
  const setTwinSex = useWorkbenchStore((s) => s.setTwinSex);
  const twinAutoRotate = useWorkbenchStore((s) => s.twinAutoRotate);
  const toggleTwinAutoRotate = useWorkbenchStore((s) => s.toggleTwinAutoRotate);
  const selectedUberonRegion = useWorkbenchStore((s) => s.selectedUberonRegion);
  const selectUberonRegion = useWorkbenchStore((s) => s.selectUberonRegion);
  const returnBreadcrumb = useWorkbenchStore((s) => s.returnBreadcrumb);
  const popReturnBreadcrumb = useWorkbenchStore((s) => s.popReturnBreadcrumb);

  const projected = projectHypergraphTo3D(hypergraphSummary);
  const observedByRegion: Partial<Record<AnatomicalRegionWireId, boolean>> = {
    EyeOcularSans: projected.nodesByRegion.EyeOcularSans.observed,
    InternalJugularVein: projected.nodesByRegion.InternalJugularVein.observed,
    HeartCardioAutonomic: projected.nodesByRegion.HeartCardioAutonomic.observed,
    SoleusCalcaneus: projected.nodesByRegion.SoleusCalcaneus.observed,
    BrainVestibularCns: projected.nodesByRegion.BrainVestibularCns.observed,
  };

  const activeMeta = selectedUberonRegion
    ? CANONICAL_REGIONS.find((r) => r.region === selectedUberonRegion) ?? null
    : null;
  const activeNode = selectedUberonRegion ? projected.nodesByRegion[selectedUberonRegion] : null;

  const elevatedProblemCount = CANONICAL_REGIONS.filter((r) => {
    const n = projected.nodesByRegion[r.region];
    return n.observed && n.localIntensity >= 0.20;
  }).length + injuryMarkers.length;

  const handleToggleSex = (sex: 'MALE' | 'FEMALE'): void => {
    setTwinSex(sex);
    onSexChange?.(sex);
    announcePolite(`Anatomical digital twin anthropometric profile set to ${sex}`);
  };

  const handleToggleRotate = (): void => {
    const next = !twinAutoRotate;
    toggleTwinAutoRotate();
    announcePolite(next ? '3D body turntable rotation enabled' : '3D body turntable rotation paused');
  };

  return (
    <div
      className={`pointer-events-none relative flex h-full w-full flex-col justify-between p-2 ${className}`.trim()}
    >
      {/* Peripheral Tactical Registration Reticle */}
      <TacticalReticleSvg
        variant="STAGE_PERIMETER"
        simulated={simulated}
        caliperPrimaryText={
          activeMeta
            ? `${activeMeta.uberonCurie} | ${activeMeta.label.toUpperCase()}`
            : `360 CORONAL TURNTABLE | ${elevatedProblemCount} ACTIVE ANOMALIES`
        }
        caliperSecondaryText={`SEX MORPH: ${twinSex}`}
        className="absolute inset-0 h-full w-full opacity-80"
      />

      {/* Keyboard-Accessible UBERON 3D Node Mirrors */}
      <SpatialNodeKeyboardAnchors observedByRegion={observedByRegion} />

      {/* Top Stage Header + Non-Occluding Left Hotspot Rail */}
      <div className="relative z-20 flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {returnBreadcrumb ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const crumb = popReturnBreadcrumb();
                if (crumb) {
                  announcePolite(`Returned to Playbook ${crumb.shortCode}`);
                }
              }}
              className="ares-touch-target ares-interactive pointer-events-auto rounded-xl border border-cyan-400/60 bg-black/90 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-200"
            >
              [&lt;- Return to Playbook {returnBreadcrumb.shortCode}]
            </button>
          ) : (
            <div className="ares-stage-callout rounded-lg px-2.5 py-1 font-mono text-[10px] tracking-wider">
              BIODIGITAL STAGE | DRAG TO ORBIT | CLICK ORGAN BEACON OR [1-5]
            </div>
          )}

          {activeMeta ? (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="ares-stage-callout pointer-events-auto flex items-center gap-2 rounded-xl border border-cyan-400/45 bg-black/85 px-3 py-1.5 font-mono text-[11px]"
            >
              <span>
                FOCUS: <strong>{activeMeta.label}</strong> ({activeMeta.uberonCurie})
                {activeNode
                  ? ` | ${formatHotspotStatus(activeNode.observed, activeNode.localIntensity, activeNode.propagatedIntensity)}`
                  : ''}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectUberonRegion(null);
                }}
                className="rounded border border-white/15 bg-black/80 px-1.5 py-0.5 text-[10px] text-cyan-200"
              >
                RESET [ESC]
              </button>
            </div>
          ) : null}
        </div>

        {/* Compact Anatomical Problem Hotspots Map (0 backdrop-filter; 1-click 3D organ zoom) */}
        <div
          role="group"
          aria-label="Anatomical problem hotspots on 3D body"
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto flex w-fit max-w-[232px] flex-col gap-1 rounded-xl border border-white/10 bg-black/80 p-1.5 font-mono text-[10px]"
        >
          <div className="flex items-center justify-between gap-2 px-1 text-[9px] tracking-widest text-[var(--color-ink-meta)]">
            <span>BODY HOTSPOTS [1-5]</span>
            <span className="text-amber-300">{elevatedProblemCount} FLAGGED</span>
          </div>

          {CANONICAL_REGIONS.map((meta) => {
            const node = projected.nodesByRegion[meta.region];
            const shortInfo = SHORT_HOTSPOT_META[meta.region];
            const safeColor = resolveSafeNodeHexColor(node);
            const isSelected = selectedUberonRegion === meta.region;
            const isProblem = node.observed && node.localIntensity >= 0.20;
            const statusText = formatHotspotStatus(
              node.observed,
              node.localIntensity,
              node.propagatedIntensity,
            );

            return (
              <button
                key={meta.region}
                type="button"
                aria-pressed={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  const nextRegion = isSelected ? null : meta.region;
                  selectUberonRegion(nextRegion);
                  announcePolite(
                    nextRegion
                      ? `Focused 3D camera on ${meta.label} (${statusText})`
                      : 'Reset 3D camera to full-body rotation',
                  );
                }}
                className={`ares-interactive flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-left transition-colors ${
                  isSelected
                    ? 'border-cyan-400/70 bg-cyan-400/15 text-[var(--color-ink-display)]'
                    : isProblem
                      ? 'border-amber-400/35 bg-amber-500/10 text-[var(--color-ink-display)]'
                      : 'border-white/8 bg-black/60 text-[var(--color-ink-body)]'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: safeColor }}
                    aria-hidden="true"
                  />
                  <span className="text-[var(--color-ink-muted)]">[{shortInfo.keyNum}]</span>
                  <span className="truncate font-semibold">{shortInfo.shortLabel}</span>
                </span>
                <span
                  className="ares-tabular-metric shrink-0 text-[9px] font-semibold"
                  style={{ color: safeColor }}
                >
                  {statusText}
                </span>
              </button>
            );
          })}

          {injuryMarkers.map((inj) => (
            <div
              key={inj.id}
              className="flex items-center justify-between gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[9px] text-rose-200"
            >
              <span className="truncate font-semibold">PIN: {inj.title}</span>
              <span className="shrink-0 uppercase">{inj.severity}</span>
            </div>
          ))}

          {onOpenOpticalScanner ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenOpticalScanner();
              }}
              className="ares-interactive mt-0.5 rounded-lg border border-cyan-400/30 bg-cyan-950/30 px-2 py-1 text-center text-[9px] font-semibold tracking-wider text-cyan-200"
            >
              + PIN TRAUMA / LESION ON 3D
            </button>
          ) : null}
        </div>
      </div>

      {/* Bottom Floating Twin Layer Pill (Root Blur Shell #4 of <= 4 budget; mb-12 clears Copilot Pill) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="relative z-20 mx-auto mb-12 flex flex-wrap items-center justify-center"
      >
        <div
          role="toolbar"
          aria-label="3D Biodigital Twin layer and anthropometric controls"
          className="hud-specular-card pointer-events-auto flex flex-wrap items-center gap-1 px-2 py-1.5 font-mono text-[10px]"
        >
          <button
            type="button"
            aria-pressed={twinAutoRotate && !selectedUberonRegion}
            onClick={(e) => {
              e.stopPropagation();
              if (selectedUberonRegion) {
                selectUberonRegion(null);
              }
              handleToggleRotate();
            }}
            className={`ares-interactive rounded-lg border px-2.5 py-1 font-semibold tracking-wider ${
              twinAutoRotate && !selectedUberonRegion
                ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
                : 'border-white/10 bg-black/50 text-[var(--color-ink-meta)]'
            }`}
          >
            {twinAutoRotate && !selectedUberonRegion ? 'ROTATE: ON' : 'ROTATE: PAUSE'}
          </button>

          <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden="true" />

          {(
            [
              { key: 'skeletal', label: 'SKELETAL GLB' },
              { key: 'vascular', label: 'IJV / VASC' },
              { key: 'visceral', label: 'VISCERAL' },
            ] as const
          ).map((item) => {
            const active = Boolean(lazyGlbLayers[item.key]);
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleGlbLayer(item.key);
                }}
                className={`ares-interactive rounded-lg border px-2.5 py-1 font-semibold tracking-wider ${
                  active
                    ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                    : 'border-white/10 bg-black/50 text-[var(--color-ink-meta)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}

          <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden="true" />

          <button
            type="button"
            aria-pressed={twinSex === 'MALE'}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSex('MALE');
            }}
            className={`ares-interactive rounded-lg border px-2.5 py-1 font-semibold ${
              twinSex === 'MALE'
                ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                : 'border-white/10 bg-black/50 text-[var(--color-ink-meta)]'
            }`}
          >
            MALE [M]
          </button>

          <button
            type="button"
            aria-pressed={twinSex === 'FEMALE'}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSex('FEMALE');
            }}
            className={`ares-interactive rounded-lg border px-2.5 py-1 font-semibold ${
              twinSex === 'FEMALE'
                ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                : 'border-white/10 bg-black/50 text-[var(--color-ink-meta)]'
            }`}
          >
            FEMALE [F]
          </button>

          {selectedUberonRegion ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectUberonRegion(null);
              }}
              className="ares-interactive rounded-lg border border-cyan-400/50 bg-cyan-950/50 px-2.5 py-1 font-semibold text-cyan-200"
            >
              FULL BODY
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
