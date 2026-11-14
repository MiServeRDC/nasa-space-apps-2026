import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  analyzeImageOffline,
  createInjuryMarkerFromVlm,
  type VlmAnalysisResult,
} from '../../lib/vlmInjuryEngine';
import {
  INJURY_REGIONS,
  type InjuryMarker,
  type InjuryRegionId,
} from '../../types/injury';

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
  onOpenPlaybook?: () => void;
}) {
  const [region, setRegion] = useState<InjuryRegionId>(existingInjury?.region ?? initialRegion);
  const [photoUrl, setPhotoUrl] = useState<string>(existingInjury?.photoUrl ?? '');
  const [analyzing, setAnalyzing] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [vlmResult, setVlmResult] = useState<VlmAnalysisResult | null>(null);

  useEffect(() => {
    if (existingInjury) {
      setRegion(existingInjury.region);
      setPhotoUrl(existingInjury.photoUrl ?? '');
      setVlmResult({
        title: existingInjury.title,
        severity: existingInjury.severity,
        confidencePct: existingInjury.confidencePct,
        clinicalAssessment: existingInjury.summary,
        microgravityProtocol: 'Closed-circuit transparent containment bag irrigation to prevent dispersion of aerosolized blood droplets into spacecraft cabin.',
        careSteps: existingInjury.careSteps,
        dropletHazard: true,
        erythemaIndex: 0.62,
        tissueDisruptionPct: 38,
        vlmModel: 'ARES-VLM-Edge (Air-Gapped Bio-KG)',
        detectedAt: existingInjury.detectedAt,
      });
      return;
    }

    if (isOpen && initialImage) {
      const url = typeof initialImage === 'string' ? initialImage : URL.createObjectURL(initialImage);
      setPhotoUrl(url);
      runVlmAnalysis(initialImage, initialRegion);
    }
  }, [isOpen, initialImage, existingInjury, initialRegion]);

  const runVlmAnalysis = async (imgSource: File | Blob | string, reg: InjuryRegionId) => {
    setAnalyzing(true);
    setScanStep(1);

    // Multi-phase UI scanning feedback
    const t1 = setTimeout(() => setScanStep(2), 350);
    const t2 = setTimeout(() => setScanStep(3), 700);

    const result = await analyzeImageOffline(imgSource, reg);

    clearTimeout(t1);
    clearTimeout(t2);
    setTimeout(() => {
      setVlmResult(result);
      setAnalyzing(false);
    }, 900);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    runVlmAnalysis(file, region);
  };

  const handleConfirmPin = () => {
    if (!vlmResult) return;
    const marker = createInjuryMarkerFromVlm(region, vlmResult, photoUrl);
    onSaveInjury(marker);
    onClose();
  };

  if (!isOpen) return null;

  const severityColor =
    vlmResult?.severity === 'HIGH'
      ? 'border-red-500 bg-red-950/40 text-red-400'
      : vlmResult?.severity === 'MODERATE'
      ? 'border-amber-500 bg-amber-950/40 text-amber-300'
      : 'border-lime-500 bg-lime-950/40 text-lime-300';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border-2 border-lime-400 bg-black p-5 shadow-[0_0_50px_rgba(163,230,53,0.25)]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between border-b border-gray-800 pb-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded bg-lime-400 px-2 py-0.5 font-bold text-black">ARES EDGE-VISION</span>
            <span className="text-sm font-bold text-white">VLM CLINICAL TRIAGE & WOUND PROTOCOL</span>
            <span className="hidden text-gray-500 md:inline">| 100% AIR-GAPPED (NASA-STD-3001)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-gray-700 px-2.5 py-1 text-gray-400 hover:border-white hover:text-white"
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-2">
          {/* Left Panel: Photo & Scanning HUD */}
          <div className="flex flex-col gap-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Clinical Scan"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-gray-600">
                  NO IMAGE LOADED
                </div>
              )}

              {/* Scanning Reticle & Overlay */}
              {analyzing && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 bg-lime-950/30">
                  <div className="flex justify-between font-mono text-[10px] text-lime-400">
                    <span>EDGE-VLM SCANNING...</span>
                    <span>TISSUE DISRUPTION EVAL</span>
                  </div>
                  <div className="h-0.5 w-full bg-lime-400 shadow-[0_0_12px_#a3e635] animate-bounce" />
                  <div className="font-mono text-[10px] text-lime-300">
                    {scanStep === 1 && '[1/3] Ingesting visual telemetry & RGB spectral index...'}
                    {scanStep === 2 && '[2/3] Segmenting tissue edges & erythema matrix...'}
                    {scanStep === 3 && '[3/3] Synthesizing zero-g containment protocol...'}
                  </div>
                </div>
              )}

              {/* Target HUD Box */}
              {!analyzing && (
                <div className="pointer-events-none absolute inset-12 rounded border border-dashed border-lime-400/70">
                  <span className="absolute top-1 left-1 font-mono text-[9px] text-lime-300">
                    FOV: {INJURY_REGIONS[region].label}
                  </span>
                  <span className="absolute right-1 bottom-1 font-mono text-[9px] text-lime-400">
                    CONFIDENCE: {vlmResult?.confidencePct ?? 94}%
                  </span>
                </div>
              )}
            </div>

            {/* Region Selector & Upload Controls */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <label className="text-gray-400">REGION:</label>
              <select
                value={region}
                onChange={(e) => {
                  const newReg = e.target.value as InjuryRegionId;
                  setRegion(newReg);
                  if (photoUrl) runVlmAnalysis(photoUrl, newReg);
                }}
                className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
              >
                {Object.entries(INJURY_REGIONS).map(([id, m]) => (
                  <option key={id} value={id}>
                    {m.label}
                  </option>
                ))}
              </select>

              <label className="cursor-pointer rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300 hover:border-lime-400 hover:text-white">
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

          {/* Right Panel: Generated VLM Medical Response */}
          <div className="flex flex-col justify-between gap-3 font-mono text-xs">
            <div className="flex flex-col gap-3">
              {/* Severity & Model badge */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`rounded border px-2.5 py-1 font-bold ${severityColor}`}>
                  SEVERITY: {vlmResult?.severity ?? 'EVALUATING...'}
                </div>
                <div className="text-[11px] text-gray-500">
                  MODEL: <span className="text-gray-300">{vlmResult?.vlmModel ?? 'ARES-VLM'}</span>
                </div>
              </div>

              {/* Clinical Assessment */}
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="font-bold text-lime-400">1. EDGE-VLM CLINICAL DIAGNOSIS</div>
                <p className="mt-1 text-gray-200 leading-relaxed font-sans text-xs">
                  {vlmResult?.clinicalAssessment || 'Morphological evaluation in progress...'}
                </p>
                {vlmResult && (
                  <div className="mt-2 flex gap-3 text-[10px] text-gray-400">
                    <span>Erythema Index: <b className="text-white">{(vlmResult.erythemaIndex * 100).toFixed(0)}%</b></span>
                    <span>Tissue Disruption: <b className="text-white">{vlmResult.tissueDisruptionPct}%</b></span>
                    <span>AI Confidence: <b className="text-lime-300">{vlmResult.confidencePct}%</b></span>
                  </div>
                )}
              </div>

              {/* Microgravity Specific Safety Protocol */}
              <div className="rounded-lg border border-lime-500/40 bg-lime-950/20 p-3">
                <div className="flex items-center gap-1.5 font-bold text-lime-300">
                  <span>2. MICROGRAVITY PROTOCOL (0g CONTAINMENT)</span>
                </div>
                <p className="mt-1 text-lime-100 font-sans text-xs leading-relaxed">
                  {vlmResult?.microgravityProtocol || 'Synthesizing containment protocol...'}
                </p>
              </div>

              {/* Step-by-Step Care Action Plan */}
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="font-bold text-gray-300">3. MEDOPS CLINICAL CARE PLAN</div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-gray-300">
                  {vlmResult?.careSteps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-bold text-lime-400">{idx + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-800 pt-3">
              {existingInjury && onResolveInjury && (
                <button
                  type="button"
                  onClick={() => {
                    onResolveInjury(existingInjury.id);
                    onClose();
                  }}
                  className="cursor-pointer rounded border border-gray-700 px-3 py-1.5 text-gray-400 hover:border-red-500 hover:text-red-400"
                >
                  MARK RESOLVED
                </button>
              )}

              {onOpenPlaybook && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenPlaybook();
                    onClose();
                  }}
                  className="cursor-pointer rounded border border-sky-400 bg-sky-950/40 px-3 py-1.5 font-bold text-sky-300 hover:bg-sky-400 hover:text-black"
                >
                  DISPATCH MEDOPS PLAYBOOK
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirmPin}
                disabled={analyzing || !vlmResult}
                className="cursor-pointer rounded border border-lime-400 bg-lime-400 px-4 py-1.5 font-bold text-black shadow-lg hover:bg-lime-300 disabled:opacity-50"
              >
                PIN TO 3D DIGITAL TWIN
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
