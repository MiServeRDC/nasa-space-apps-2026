import React, { useEffect, useRef, useState } from 'react';
import {
  INJURY_REGIONS,
  type InjuryMarker,
  type InjuryRegionId,
} from '../../types/injury';
import {
  analyzeImageOffline,
  createInjuryMarkerFromOptical,
  type OpticalAnalysisResult,
} from '../../lib/vlmInjuryEngine';
import { evaluateOpticalQualityGate } from '../../lenses/lensMath';
import { announceAssertive, announcePolite } from '../../stores/a11yAnnouncer';
import type { CrystallizedPlaybookId } from '../../types/telemetry';

export interface AiInjuryModalProps {
  open?: boolean;
  isOpen?: boolean;
  initialRegion?: InjuryRegionId;
  initialImage?: File;
  existingInjury?: InjuryMarker | null;
  onClose: () => void;
  onAddMarker?: (marker: InjuryMarker) => void;
  onSaveInjury?: (marker: InjuryMarker) => void;
  onResolveInjury?: (id: string) => void;
  onSelectPlaybook?: (playbookId: CrystallizedPlaybookId) => void;
  onOpenPlaybook?: (playbookId?: CrystallizedPlaybookId) => void;
}

export function AiInjuryModal({
  open: openProp,
  isOpen,
  initialRegion = 'LEFT_FOREARM',
  initialImage,
  existingInjury,
  onClose,
  onAddMarker,
  onSaveInjury,
  onResolveInjury,
  onSelectPlaybook,
  onOpenPlaybook,
}: AiInjuryModalProps) {
  const open = Boolean(openProp ?? isOpen);
  const [selectedRegion, setSelectedRegion] = useState<InjuryRegionId>(initialRegion);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<OpticalAnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const revokeActivePreviewUrl = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      revokeActivePreviewUrl();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        revokeActivePreviewUrl();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleClose = () => {
    revokeActivePreviewUrl();
    onClose();
  };

  const runOpticalEvaluation = async (
    source: File | Blob | string,
    region: InjuryRegionId,
  ) => {
    setAnalyzing(true);
    const res = await analyzeImageOffline(source, region);
    setAnalysis(res);
    setAnalyzing(false);
    const qGate = evaluateOpticalQualityGate(res.contrastIndex, res.qualityIndexPct);
    if (qGate.degraded) {
      announceAssertive(
        'Optical RGB heuristic low-contrast quality gate triggered. Increase illumination and recapture.',
      );
    } else {
      announcePolite(
        `Optical RGB heuristic completed for ${INJURY_REGIONS[region].label}: ${res.severity} flag.`,
      );
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    revokeActivePreviewUrl();
    const url = URL.createObjectURL(file);
    previewObjectUrlRef.current = url;
    setPhotoPreview(url);
    await runOpticalEvaluation(file, selectedRegion);
  };

  const handleGenerateSyntheticSample = async (lowContrastMode: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (lowContrastMode) {
        // Low-contrast dim under-lit sample (`contrastIndex < 0.18` & `qualityIndexPct < 45`)
        ctx.fillStyle = '#221d1c';
        ctx.fillRect(0, 0, 256, 192);
        ctx.fillStyle = '#2b2120';
        ctx.beginPath();
        ctx.ellipse(128, 96, 56, 26, 0.15, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#d4a383';
        ctx.fillRect(0, 0, 256, 192);
        const grad = ctx.createRadialGradient(128, 96, 8, 128, 96, 62);
        grad.addColorStop(0, '#7f1d1d');
        grad.addColorStop(0.5, '#dc2626');
        grad.addColorStop(1, 'rgba(212, 163, 131, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 192);

        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(85, 88);
        ctx.quadraticCurveTo(128, 102, 172, 92);
        ctx.stroke();
      }
    }

    revokeActivePreviewUrl();
    const dataUrl = canvas.toDataURL('image/png');
    setPhotoPreview(dataUrl);
    await runOpticalEvaluation(dataUrl, selectedRegion);
  };

  const handleConfirmPin = () => {
    if (!analysis) return;
    const persistedPreview =
      photoPreview && !photoPreview.startsWith('blob:') ? photoPreview : undefined;
    const marker = createInjuryMarkerFromOptical(selectedRegion, analysis, persistedPreview);
    onAddMarker?.(marker);
    onSaveInjury?.(marker);
    announcePolite(`Pinned optical triage marker to 3D twin: ${INJURY_REGIONS[selectedRegion].label}.`);
    revokeActivePreviewUrl();
    onClose();
  };

  void initialImage;
  void existingInjury;
  void onResolveInjury;

  const qualityGate = analysis
    ? evaluateOpticalQualityGate(analysis.contrastIndex, analysis.qualityIndexPct)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Air-gapped optical RGB wound heuristic scanner"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#05070b] shadow-2xl">
        {/* Header (`0` backdrop-filter to preserve `<= 4` blur-shell budget) */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#080b11] px-4 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-cyan-200">
                OPTICAL_RGB_HEURISTIC_V1
              </span>
              <span className="rounded border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-200">
                ILLUSTRATIVE_UNVALIDATED
              </span>
              <span className="font-mono text-xs font-bold tracking-wider text-[var(--color-ink-display)]">
                OPTICAL TRAUMA TRIAGE &amp; 3D ANATOMICAL PINNING
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-meta)]">
              100% offline HTML5 Canvas RGB pixel heuristic (erythema, contrast, dark-pixel ratio)
              &bull; Not a substitute for physician assessment
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={handleClose}
            className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-white/15 bg-black px-3 font-mono text-xs font-semibold text-[var(--color-ink-display)]"
          >
            [ESC] CLOSE
          </button>
        </div>

        {/* Body */}
        <div className="grid gap-4 overflow-y-auto p-4 md:grid-cols-12">
          {/* Left Column: Capture + Anatomical Region */}
          <div className="space-y-3 md:col-span-5">
            <div>
              <label
                htmlFor="optical-injury-region"
                className="block font-mono text-[10px] font-bold tracking-wider text-[var(--color-ink-meta)]"
              >
                1. SELECT ANATOMICAL REGION (3D TWIN PIN)
              </label>
              <select
                id="optical-injury-region"
                value={selectedRegion}
                onChange={(e) => {
                  const next = e.target.value as InjuryRegionId;
                  setSelectedRegion(next);
                  if (photoPreview) {
                    void runOpticalEvaluation(photoPreview, next);
                  }
                }}
                className="ares-touch-target mt-1 w-full rounded-lg border border-white/15 bg-black px-3 font-mono text-xs text-[var(--color-ink-display)] focus:border-cyan-400 focus:outline-none"
              >
                {(Object.keys(INJURY_REGIONS) as InjuryRegionId[]).map((key) => (
                  <option key={key} value={key}>
                    {INJURY_REGIONS[key].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="font-mono text-[10px] font-bold tracking-wider text-[var(--color-ink-meta)]">
                2. ACQUIRE LOCAL PHOTO OR TEST SPECIMEN
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
              />
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3 md:grid-cols-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-3 font-mono text-[11px] font-semibold text-cyan-200"
                >
                  UPLOAD / CAMERA CAPTURE
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleGenerateSyntheticSample(false)}
                    className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-amber-400/50 bg-amber-500/10 px-2 font-mono text-[10px] font-semibold text-amber-200"
                  >
                    DEMO NOMINAL ROI
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateSyntheticSample(true)}
                    className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-rose-400/50 bg-rose-500/10 px-2 font-mono text-[10px] font-semibold text-rose-200"
                  >
                    DEMO LOW-LIGHT
                  </button>
                </div>
              </div>
            </div>

            {/* Viewport Preview */}
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black">
              {photoPreview ? (
                <>
                  <img
                    src={photoPreview}
                    alt="Selected wound ROI preview"
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-3 border border-cyan-400/50">
                    <div className="absolute top-1 left-1 bg-black/85 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300">
                      ROI: {INJURY_REGIONS[selectedRegion].label.toUpperCase()}
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-4 text-center font-mono text-[11px] text-[var(--color-ink-muted)]">
                  NO IMAGE LOADED
                  <div className="mt-1 text-[10px]">
                    Capture an offline photo or load a synthetic ROI above to evaluate RGB
                    pixel telemetry.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Heuristic Readout + Honest Quality Gate */}
          <div className="flex flex-col justify-between space-y-3 md:col-span-7">
            {analyzing ? (
              <div className="ares-inner-well flex flex-1 items-center justify-center p-6 font-mono text-xs text-cyan-300">
                COMPUTING LOCAL RGB PIXEL METRICS (OPTICAL_RGB_HEURISTIC_V1)...
              </div>
            ) : analysis ? (
              <div className="space-y-2.5 font-mono text-xs">
                {/* Honest Illumination / Contrast Quality Gate Banner */}
                {qualityGate?.degraded ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-amber-400/80 bg-amber-500/15 p-2.5 text-[11px] text-amber-100"
                  >
                    <div className="font-bold tracking-wider text-amber-300">
                      {qualityGate.badge}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed">{qualityGate.guidance}</p>
                  </div>
                ) : null}

                {/* Primary Heuristic Classification Card */}
                <div
                  className={`rounded-xl border p-3 ${
                    analysis.severity === 'HIGH'
                      ? 'border-rose-500/70 bg-rose-500/10'
                      : analysis.severity === 'MODERATE'
                        ? 'border-amber-400/70 bg-amber-500/10'
                        : 'border-emerald-400/60 bg-emerald-500/10'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[var(--color-ink-display)]">
                      {analysis.title}
                    </span>
                    <span className="rounded border border-white/20 bg-black px-2 py-0.5 text-[10px] font-semibold">
                      SEVERITY: {analysis.severity} &bull; QUALITY INDEX: {analysis.qualityIndexPct}%
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="rounded border border-cyan-400/40 bg-black/80 px-1.5 py-0.5 text-cyan-300">
                      METHOD: {analysis.methodId}
                    </span>
                    <span className="rounded border border-amber-400/50 bg-black/80 px-1.5 py-0.5 text-amber-300">
                      STATUS: {analysis.validationStatus}
                    </span>
                    <span className="rounded border border-white/15 bg-black/80 px-1.5 py-0.5 text-[var(--color-ink-body)]">
                      PLAYBOOK: {analysis.recommendedPlaybookId}
                    </span>
                  </div>
                  <p className="mt-2 font-sans text-xs leading-relaxed text-[var(--color-ink-body)]">
                    {analysis.assessmentSummary}
                  </p>
                </div>

                {/* 4-Cell Pixel Telemetry Matrix */}
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                  <div className="ares-inner-well p-2">
                    <div className="text-[var(--color-ink-meta)]">ERYTHEMA</div>
                    <div className="ares-tabular-metric mt-0.5 text-sm font-bold text-rose-300">
                      {analysis.erythemaIndex.toFixed(2)}
                    </div>
                  </div>
                  <div className="ares-inner-well p-2">
                    <div className="text-[var(--color-ink-meta)]">CONTRAST</div>
                    <div
                      className={`ares-tabular-metric mt-0.5 text-sm font-bold ${
                        analysis.contrastIndex < 0.18 ? 'text-amber-300' : 'text-cyan-200'
                      }`}
                    >
                      {analysis.contrastIndex.toFixed(2)}
                    </div>
                  </div>
                  <div className="ares-inner-well p-2">
                    <div className="text-[var(--color-ink-meta)]">DARK RATIO</div>
                    <div className="ares-tabular-metric mt-0.5 text-sm font-bold text-amber-200">
                      {analysis.darkPixelRatio.toFixed(2)}
                    </div>
                  </div>
                  <div className="ares-inner-well p-2">
                    <div className="text-[var(--color-ink-meta)]">DISRUPTION</div>
                    <div className="ares-tabular-metric mt-0.5 text-sm font-bold text-[var(--color-ink-display)]">
                      {analysis.tissueDisruptionPct}%
                    </div>
                  </div>
                </div>

                {/* Zero-G Closed-Circuit Containment Banner */}
                {analysis.dropletHazard ? (
                  <div className="rounded-xl border border-rose-500/60 bg-rose-950/35 p-2.5 text-[11px] text-rose-200">
                    <div className="font-bold tracking-wider text-rose-300">
                      0G BIO-DROPLET CONTAINMENT HAZARD:
                    </div>
                    <p className="mt-0.5 font-sans text-xs leading-relaxed">
                      {analysis.microgravityProtocol}
                    </p>
                  </div>
                ) : (
                  <div className="ares-inner-well p-2.5 text-[11px] text-cyan-200">
                    <div className="font-bold tracking-wider">MICROGRAVITY PROTOCOL:</div>
                    <p className="mt-0.5 font-sans text-xs leading-relaxed">
                      {analysis.microgravityProtocol}
                    </p>
                  </div>
                )}

                {/* Checklist */}
                <div className="ares-inner-well p-2.5">
                  <div className="text-[10px] font-bold tracking-wider text-[var(--color-ink-meta)]">
                    PROCEDURAL REFERENCE CHECKLIST (ILLUSTRATIVE_UNVALIDATED):
                  </div>
                  <ol className="mt-1.5 space-y-1 font-sans text-xs text-[var(--color-ink-display)]">
                    {analysis.careSteps.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-mono font-bold text-cyan-300">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <div className="ares-inner-well flex flex-1 items-center justify-center p-6 text-center font-mono text-xs text-[var(--color-ink-meta)]">
                Select an anatomical region and load an image to run the air-gapped RGB pixel
                heuristic (`OPTICAL_RGB_HEURISTIC_V1`).
              </div>
            )}

            {/* Action Bar (`>= 48px` touch targets) */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3 font-mono text-xs">
              {analysis && (onSelectPlaybook || onOpenPlaybook) ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelectPlaybook?.(analysis.recommendedPlaybookId);
                    onOpenPlaybook?.(analysis.recommendedPlaybookId);
                    handleConfirmPin();
                  }}
                  className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-amber-400/60 bg-amber-500/15 px-3.5 font-semibold text-amber-200"
                >
                  PIN &amp; OPEN {analysis.recommendedPlaybookId.slice(0, 11)}
                </button>
              ) : null}
              <button
                type="button"
                disabled={!analysis}
                onClick={handleConfirmPin}
                className="ares-touch-target ares-interactive cursor-pointer rounded-lg border border-emerald-400/70 bg-emerald-500/20 px-4 font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                PIN MARKER TO 3D TWIN
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
