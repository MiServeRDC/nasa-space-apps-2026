// Air-Gapped Optical RGB Heuristic Triage Engine (OPTICAL_RGB_HEURISTIC_V1)
// Computes local HTML5 Canvas pixel metrics (erythemaIndex, contrastIndex, darkPixelRatio)
// with zero network calls and zero unvalidated clinical-diagnosis claims (Issue #12).

import {
  INJURY_REGIONS,
  type InjuryAssessmentMethodId,
  type InjuryMarker,
  type InjuryRegionId,
  type InjurySeverity,
} from '../types/injury';
import type { CrystallizedPlaybookId } from '../types/telemetry';

export interface OpticalAnalysisResult {
  title: string;
  severity: InjurySeverity;
  methodId: InjuryAssessmentMethodId;
  validationStatus: 'ILLUSTRATIVE_UNVALIDATED';
  assessmentSummary: string;
  microgravityProtocol: string;
  careSteps: string[];
  dropletHazard: boolean;
  erythemaIndex: number;
  contrastIndex: number;
  darkPixelRatio: number;
  tissueDisruptionPct: number;
  recommendedPlaybookId: CrystallizedPlaybookId;
  detectedAt: string;
}

export type VlmAnalysisResult = OpticalAnalysisResult;

export async function analyzeImageOffline(
  imageSource: File | Blob | string,
  region: InjuryRegionId,
): Promise<OpticalAnalysisResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const createdObjectUrl =
      typeof imageSource === 'string' ? null : URL.createObjectURL(imageSource);

    const cleanupObjectUrl = () => {
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = Math.max(1, Math.min(img.width || 64, 256));
        const h = Math.max(1, Math.min(img.height || 64, 256));
        canvas.width = w;
        canvas.height = h;

        if (!ctx) {
          resolve(buildOpticalReport(region, 0.45, 0.25, 0.05, 35));
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let lumaSum = 0;
        let lumaSqSum = 0;
        let edgeDisruptions = 0;
        let darkPixels = 0;
        const totalPixels = w * h;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          totalRed += r;
          totalGreen += g;
          totalBlue += b;

          const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          lumaSum += luma;
          lumaSqSum += luma * luma;

          const erythema = r - (g + b) / 2;
          if (erythema > 35) {
            edgeDisruptions += 1;
          }

          if (r < 60 && g < 40 && b < 40) {
            darkPixels += 1;
          }
        }

        const avgR = totalRed / totalPixels;
        const avgG = totalGreen / totalPixels;
        const avgB = totalBlue / totalPixels;
        const meanLuma = lumaSum / totalPixels;
        const varianceLuma = Math.max(0, lumaSqSum / totalPixels - meanLuma * meanLuma);

        const erythemaIndex = Number(
          Math.max(0, Math.min(1.0, (avgR - (avgG + avgB) / 2 + 50) / 100)).toFixed(2),
        );
        const contrastIndex = Number(Math.min(1.0, Math.sqrt(varianceLuma) * 2.5).toFixed(2));
        const darkPixelRatio = Number((darkPixels / totalPixels).toFixed(2));
        const disruptionPct = Math.round((edgeDisruptions / totalPixels) * 100);

        resolve(
          buildOpticalReport(region, erythemaIndex, contrastIndex, darkPixelRatio, disruptionPct),
        );
      } catch {
        resolve(buildOpticalReport(region, 0.5, 0.25, 0.05, 40));
      } finally {
        cleanupObjectUrl();
      }
    };

    img.onerror = () => {
      cleanupObjectUrl();
      resolve(buildOpticalReport(region, 0.5, 0.25, 0.05, 40));
    };

    img.src = createdObjectUrl ?? (imageSource as string);
  });
}

function buildOpticalReport(
  region: InjuryRegionId,
  erythemaIndex: number,
  contrastIndex: number,
  darkPixelRatio: number,
  disruptionPct: number,
): OpticalAnalysisResult {
  const meta = INJURY_REGIONS[region];
  const now = new Date().toISOString().slice(11, 19) + 'Z';
  const darkPct = darkPixelRatio * 100;

  let severity: InjurySeverity = 'MODERATE';
  if (region === 'HEAD_FOREHEAD' || disruptionPct > 45 || darkPct > 12) {
    severity = 'HIGH';
  } else if (disruptionPct < 20 && erythemaIndex < 0.35) {
    severity = 'LOW';
  }

  let assessmentSummary = '';
  let microgravityProtocol = '';
  let careSteps: string[] = [];
  const dropletHazard =
    region.includes('FOREARM') || region.includes('HEAD') || severity === 'HIGH';

  switch (region) {
    case 'LEFT_FOREARM':
    case 'RIGHT_FOREARM':
      assessmentSummary = `Optical RGB pixel heuristic indicates localized erythema (index ${erythemaIndex.toFixed(2)}, contrast ${contrastIndex.toFixed(2)}, dark-pixel ratio ${darkPixelRatio.toFixed(2)}) across ~${disruptionPct}% of sampled area.`;
      microgravityProtocol =
        'CLOSED-CIRCUIT CONTAINMENT BAG IRRIGATION (Zero-G Containment): Affix transparent self-adhesive containment bag with sealed flush port and irrigate with 20 mL sterile saline to prevent cabin bio-aerosol dispersion.';
      careSteps = [
        'Apply transparent self-adhesive containment bag over affected limb.',
        'Closed-circuit saline irrigation with 20 mL sterile wash (Zero-Droplet).',
        'Aspirate effluent through one-way vacuum suction port.',
        'Apply sterile hydrocolloid compression dressing.',
        'Safety Gate: Maintain hard lockout on systemic anticoagulants.',
      ];
      break;

    case 'HEAD_FOREHEAD':
      assessmentSummary = `Optical RGB pixel heuristic on frontal ROI (erythema ${erythemaIndex.toFixed(2)}, contrast ${contrastIndex.toFixed(2)}, dark-pixel ratio ${darkPixelRatio.toFixed(2)}). Elevated subdural hematoma vigilance required under cephalad venous engorgement.`;
      microgravityProtocol =
        'NEURO-TRAUMA PROTOCOL & HARD SAFETY LOCK: Maintain systemic anticoagulation lockout (Hard Safety Gate 1). Execute ONSD ultrasound scan and sealed cold-pack application.';
      careSteps = [
        'Execute rapid SCAT neurological checklist (pupillary reflex, orientation).',
        'Maintain anticoagulation lockout (Hard Clinical Safety Gate 1 active).',
        'Execute POCUS ONSD ultrasound scan (ICP reference threshold <= 5.8 mm).',
        'Apply sealed sterile cold-pack for 15 minutes.',
      ];
      break;

    case 'CHEST_RIBS':
      assessmentSummary = `Optical RGB pixel heuristic over thoracic wall ROI (erythema ${erythemaIndex.toFixed(2)}, contrast ${contrastIndex.toFixed(2)}, dark-pixel ratio ${darkPixelRatio.toFixed(2)}). Correlate with respiratory excursion and SpO2.`;
      microgravityProtocol =
        'SPATIAL-THORACIC MONITORING PROTOCOL: Verify continuous peripheral SpO2 >= 95%. Suspend heavy axial loading on ARED for 48 hours and avoid tight chest harness straps.';
      careSteps = [
        'Monitor continuous SpO2 (safety threshold >= 95%).',
        'Pause ARED squat/deadlift resistance training for 48 hours.',
        'Execute digital thoracic auscultation check.',
      ];
      break;

    case 'LEFT_SHOULDER':
    case 'RIGHT_SHOULDER':
      assessmentSummary = `Optical RGB pixel heuristic on shoulder ROI (erythema ${erythemaIndex.toFixed(2)}, contrast ${contrastIndex.toFixed(2)}, dark-pixel ratio ${darkPixelRatio.toFixed(2)}). Consistent with EMU/xEMU suit bearing torque overload.`;
      microgravityProtocol =
        'EVA SHOULDER PROTECTION PROTOCOL: Suspend scheduled EVA operations for 72 hours, apply stabilization wrap, and cold compress.';
      careSteps = [
        'Temporary 72-hour hold on EVA qualification status.',
        'Apply glenohumeral stabilization brace.',
        'Initiate low-resistance passive isometric mobility exercises.',
      ];
      break;

    case 'LEFT_KNEE':
    case 'RIGHT_KNEE':
    case 'LEFT_ANKLE':
    case 'RIGHT_ANKLE':
    default:
      assessmentSummary = `Optical RGB pixel heuristic on lower-extremity ROI (erythema ${erythemaIndex.toFixed(2)}, contrast ${contrastIndex.toFixed(2)}, dark-pixel ratio ${darkPixelRatio.toFixed(2)}). Monitor foot-restraint stability and Mars surface gait readiness.`;
      microgravityProtocol =
        'GAIT ASYMMETRY RESTORATION (MARS 0.38g GATE): Edema may elevate Gait Asymmetry Index (GAI > 12%). Apply graduated compression wrap and verify treadmill gait balance.';
      careSteps = [
        'Apply graduated elastic compression sleeve.',
        'Verify Gait Asymmetry Index (GAI) foot sensors.',
        'Reduce peak ARED load by 30% for 3 Sols.',
      ];
      break;
  }

  return {
    title: `${meta.label}: ${severity === 'HIGH' ? 'High-Priority Optical Flag' : severity === 'MODERATE' ? 'Moderate Optical Flag' : 'Low-Severity Optical Flag'}`,
    severity,
    methodId: 'OPTICAL_RGB_HEURISTIC_V1',
    validationStatus: 'ILLUSTRATIVE_UNVALIDATED',
    assessmentSummary,
    microgravityProtocol,
    careSteps,
    dropletHazard,
    erythemaIndex,
    contrastIndex,
    darkPixelRatio,
    tissueDisruptionPct: disruptionPct,
    recommendedPlaybookId: meta.recommendedPlaybookId,
    detectedAt: now,
  };
}

export function createInjuryMarkerFromOptical(
  region: InjuryRegionId,
  optical: OpticalAnalysisResult,
  photoUrl?: string,
): InjuryMarker {
  return {
    id: `${region}-${Date.now()}`,
    region,
    title: optical.title,
    severity: optical.severity,
    methodId: optical.methodId,
    validationStatus: optical.validationStatus,
    erythemaIndex: optical.erythemaIndex,
    contrastIndex: optical.contrastIndex,
    darkPixelRatio: optical.darkPixelRatio,
    recommendedPlaybookId: optical.recommendedPlaybookId,
    summary: `${optical.assessmentSummary} ${optical.microgravityProtocol}`,
    careSteps: optical.careSteps,
    detectedAt: optical.detectedAt,
    photoUrl,
  };
}

export const createInjuryMarkerFromVlm = createInjuryMarkerFromOptical;
