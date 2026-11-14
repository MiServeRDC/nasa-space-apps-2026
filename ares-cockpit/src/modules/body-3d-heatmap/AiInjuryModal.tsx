import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  analyzeImageOffline,
  createInjuryMarkerFromOptical,
  type OpticalAnalysisResult,
} from '../../lib/vlmInjuryEngine';
import {
  INJURY_REGIONS,
  type InjuryMarker,
  type InjuryRegionId,
} from '../../types/injury';
import type { CrystallizedPlaybookId } from '../../types/telemetry';

export function AiInjuryModal({
  isOpen,
  initialRegion = 'LEFT_FOREARM',
  initialImage,
  existingInjury,
  onClose,
  onSaveInjury,
  onResolveInjury,
  onOpenPlaybook,
}: {
  isOpen: boolean;
  initialRegion?: InjuryRegionId;
  initialImage?: string | File;
  existingInjury?: InjuryMarker | null;
  onClose: () => void;
  onSaveInjury: (injury: InjuryMarker) => void;
  onResolveInjury?: (id: string) => void;
  onOpenPlaybook?: (playbookId?: CrystallizedPlaybookId) => void;
}) {
  const [region, setRegion] = useState<InjuryRegionId>(existingInjury?.region ?? initialRegion);
  const [photoUrl, setPhotoUrl] = useState<string>(existingInjury?.photoUrl ?? '');
  const [analyzing, setAnalyzing] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [result, setResult] = useState<OpticalAnalysisResult | null>(null);
  const ownedBlobUrlsRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const revokeUnpinnedBlobs = useCallback((keepUrl?: string) => {
    for (const url of ownedBlobUrlsRef.current) {
      if (url !== keepUrl) {
        URL.revokeObjectURL(url);
        ownedBlobUrlsRef.current.delete(url);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      revokeUnpinnedBlobs();
    };
  }, [clearTimers, revokeUnpinnedBlobs]);

  const runOpticalAnalysis = useCallback(
    async (imgSource: File | Blob | string, reg: InjuryRegionId) => {
      clearTimers();
      setAnalyzing(true);
      setScanStep(1);

      const t1 = window.setTimeout(() => setScanStep(2), 300);
      const t2 = window.setTimeout(() => setScanStep(3), 600);
      timersRef.current.push(t1, t2);

      const evaluated = await analyzeImageOffline(imgSource, reg);
      const t3 = window.setTimeout(() => {
        setResult(evaluated);
        setAnalyzing(false);
      }, 750);
      timersRef.current.push(t3);
    },
    [clearTimers],
  );

  useEffect(() => {
    if (!isOpen) return;

    if (existingInjury) {
      setRegion(existingInjury.region);
      setPhotoUrl(existingInjury.photoUrl ?? '');
      setResult({
        title: existingInjury.title,
        severity: existingInjury.severity,
        methodId: existingInjury.methodId,
        validationStatus: existingInjury.validationStatus,
        assessmentSummary: existingInjury.summary,
        microgravityProtocol:
          INJURY_REGIONS[existingInjury.region]?.defaultSummary ??
          'Closed-circuit containment and microgravity dressing protocol.',
        careSteps: existingInjury.careSteps,
        dropletHazard: existingInjury.severity === 'HIGH' || existingInjury.region.includes('FOREARM'),
        erythemaIndex: existingInjury.erythemaIndex ?? 0.5,
        contrastIndex: existingInjury.contrastIndex ?? 0.3,
        darkPixelRatio: existingInjury.darkPixelRatio ?? 0.05,
        tissueDisruptionPct: 30,
        recommendedPlaybookId:
          existingInjury.recommendedPlaybookId ??
          INJURY_REGIONS[existingInjury.region].recommendedPlaybookId,
        detectedAt: existingInjury.detectedAt,
      });
      setAnalyzing(false);
      return;
    }

    setRegion(initialRegion);
    if (initialImage) {
      let nextUrl: string;
      if (typeof initialImage === 'string') {
        nextUrl = initialImage;
      } else {
        nextUrl = URL.createObjectURL(initialImage);
        ownedBlobUrlsRef.current.add(nextUrl);
      }
      revokeUnpinnedBlobs(nextUrl);
      setPhotoUrl(nextUrl);
      void runOpticalAnalysis(initialImage, initialRegion);
    } else {
      setPhotoUrl('');
      setResult(null);
    }
  }, [isOpen, initialImage, existingInjury, initialRegion, revokeUnpinnedBlobs, runOpticalAnalysis]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    ownedBlobUrlsRef.current.add(url);
    revokeUnpinnedBlobs(url);
    setPhotoUrl(url);
    void runOpticalAnalysis(file, region);
  };

  const handleCancelClose = () => {
    clearTimers();
    revokeUnpinnedBlobs();
    onClose();
  };

  const handleConfirmPin = () => {
    if (!result) return;
    const marker = createInjuryMarkerFromOptical(region, result, photoUrl || undefined);
    // Transfer ownership of pinned photoUrl to parent App.tsx; revoke any older unpinned previews.
    ownedBlobUrlsRef.current.delete(photoUrl);
    revokeUnpinnedBlobs();
    onSaveInjury(marker);
    onClose();
  };

  if (!isOpen) return null;

  const severityColor =
    result?.severity === 'HIGH'
      ? 'border-critical bg-critical/15 text-critical'
      : result?.severity === 'MODERATE'
        ? 'border-advisory bg-advisory/15 text-advisory'
        : 'border-lime-400 bg-lime-950/30 text-lime-300';

  const scanSteps = [
    'Decoding RGB pixel buffer (offline canvas)...',
    'Measuring erythema, luminance contrast, and dark-pixel ratio...',
    'Mapping NASA-STD-3001 microgravity containment steps...',
  ];

  const playbookToOpen =
    result?.recommendedPlaybookId ?? INJURY_REGIONS[region].recommendedPlaybookId;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border-2 border-lime-400 bg-black p-5 shadow-[0_0_40px_rgba(163,230,53,0.18)]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-lime-400 px-2 py-0.5 font-bold text-black">
              OPTICAL_RGB_HEURISTIC_V1
            </span>
            <span className="rounded border border-advisory px-2 py-0.5 font-bold text-advisory">
              ILLUSTRATIVE_UNVALIDATED
            </span>
            <span className="text-sm font-bold text-white">
              OFFLINE OPTICAL WOUND TRIAGE &amp; 0g PROTOCOL
            </span>
          </div>
          <button
            type="button"
            onClick={handleCancelClose}
            className="min-h-[44px] cursor-pointer rounded border border-line bg-black px-3 py-1 text-gray-300 hover:border-white hover:text-white"
          >
            CLOSE
          </button>
        </div>

        <div className="mt-2 rounded border border-advisory/50 bg-panel px-3 py-1.5 font-mono text-[11px] text-advisory">
          ADVISORY HEURISTIC ONLY (ILLUSTRATIVE_UNVALIDATED): Computes local RGB pixel statistics; not a validated diagnostic device.
        </div>

        {/* Content Body */}
        <div className="mt-4 grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-2">
          {/* Left Panel: Photo & Region Picker */}
          <div className="flex flex-col gap-3">
            <div className="relative flex min-h-56 items-center justify-center overflow-hidden rounded-lg border border-line bg-panel">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={`Uploaded optical capture for ${INJURY_REGIONS[region].label}`}
                  className="max-h-72 w-full object-contain"
                />
              ) : (
                <div className="p-6 text-center font-mono text-xs text-gray-500">
                  No local photo selected yet. Choose an image below to compute RGB heuristics offline.
                </div>
              )}
              {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 font-mono text-xs text-lime-300">
                  <div className="font-bold">COMPUTING OPTICAL RGB METRICS...</div>
                  <div className="text-center text-gray-300">
                    {scanSteps[Math.max(0, scanStep - 1)] ?? scanSteps[0]}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
              <label className="flex flex-1 items-center gap-2 text-gray-400">
                <span>REGION:</span>
                <select
                  aria-label="Anatomical injury region"
                  value={region}
                  onChange={(e) => {
                    const nextRegion = e.target.value as InjuryRegionId;
                    setRegion(nextRegion);
                    if (photoUrl) {
                      void runOpticalAnalysis(photoUrl, nextRegion);
                    }
                  }}
                  className="min-h-[44px] flex-1 rounded border border-line bg-black px-2 py-1 text-gray-200"
                >
                  {(Object.keys(INJURY_REGIONS) as InjuryRegionId[]).map((key) => (
                    <option key={key} value={key}>
                      {INJURY_REGIONS[key].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded border border-line bg-panel px-3 py-1.5 text-gray-200 hover:border-lime-400 hover:text-white">
                UPLOAD PHOTO
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Right Panel: Heuristic Metrics & Microgravity Steps */}
          <div className="flex flex-col justify-between gap-3 font-mono text-xs">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`rounded border px-2.5 py-1 font-bold ${severityColor}`}>
                  FLAG SEVERITY: {result?.severity ?? 'AWAITING IMAGE'}
                </div>
                <div className="text-[11px] text-gray-400">
                  METHOD: <span className="text-gray-200">{result?.methodId ?? 'OPTICAL_RGB_HEURISTIC_V1'}</span>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="font-bold text-lime-400">1. OPTICAL HEURISTIC ASSESSMENT</div>
                <p className="mt-1 font-sans text-xs leading-relaxed text-gray-200">
                  {result?.assessmentSummary ?? 'Upload a local image to inspect optical erythema, contrast, and dark-pixel ratios.'}
                </p>
                {result && (
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-300">
                    <span>
                      erythemaIndex: <b className="text-white">{result.erythemaIndex.toFixed(2)}</b>
                    </span>
                    <span>
                      contrastIndex: <b className="text-white">{result.contrastIndex.toFixed(2)}</b>
                    </span>
                    <span>
                      darkPixelRatio: <b className="text-white">{result.darkPixelRatio.toFixed(2)}</b>
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-lime-500/40 bg-lime-950/20 p-3">
                <div className="font-bold text-lime-300">2. MICROGRAVITY PROTOCOL (0g CONTAINMENT)</div>
                <p className="mt-1 font-sans text-xs leading-relaxed text-lime-100">
                  {result?.microgravityProtocol ?? 'Containment protocol selected after image upload.'}
                </p>
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="font-bold text-gray-300">3. MEDOPS CARE CHECKLIST</div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-gray-300">
                  {(result?.careSteps ?? INJURY_REGIONS[region].defaultCare).map((step, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-bold text-lime-400">{idx + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              {existingInjury && onResolveInjury && (
                <button
                  type="button"
                  onClick={() => {
                    onResolveInjury(existingInjury.id);
                    handleCancelClose();
                  }}
                  className="min-h-[44px] cursor-pointer rounded border border-line px-3 py-1.5 text-gray-300 hover:border-critical hover:text-critical"
                >
                  MARK RESOLVED
                </button>
              )}

              {onOpenPlaybook && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenPlaybook(playbookToOpen);
                    handleCancelClose();
                  }}
                  className="min-h-[44px] cursor-pointer rounded border border-nominal bg-nominal/10 px-3 py-1.5 font-bold text-nominal hover:bg-nominal hover:text-black"
                >
                  DISPATCH MEDOPS PLAYBOOK
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirmPin}
                disabled={analyzing || !result}
                className="min-h-[44px] cursor-pointer rounded border border-lime-400 bg-lime-400 px-4 py-1.5 font-bold text-black hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                PIN TO 3D DIGITAL TWIN
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
