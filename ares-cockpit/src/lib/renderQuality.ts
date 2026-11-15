export type RenderProfile = 'AUTO' | 'LITE' | 'STANDARD' | 'HIGH';
export type QualityTier = 'LOW_2D' | 'STANDARD' | 'DETAILED';
export type QualityMode = 'AUTO' | QualityTier;

export interface HardwareHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  dpr?: number;
  prefersReducedMotion?: boolean;
}

/**
 * Derives an initial quality tier from available hardware execution hints.
 * Pure function: never mutates state, sensor data, or clinical thresholds.
 */
export function detectHardwareTier(hints: HardwareHints): QualityTier {
  if (hints.prefersReducedMotion) {
    return 'STANDARD';
  }
  const cores = hints.hardwareConcurrency ?? 4;
  const mem = hints.deviceMemory ?? 4;
  if (cores <= 2 || mem <= 2) {
    return 'LOW_2D';
  }
  if (cores >= 8 && mem >= 8) {
    return 'DETAILED';
  }
  return 'STANDARD';
}

/**
 * Evaluates whether sustained frame pressure warrants stepping down the quality tier.
 * Implements hysteresis: downgrade requires sustained P95 frame time > budgetMs.
 */
export function evaluatePressureStepDown(
  currentTier: QualityTier,
  rollingP95Ms: number,
  budgetMs: number = 28.0,
): QualityTier {
  if (!Number.isFinite(rollingP95Ms) || rollingP95Ms <= budgetMs) {
    return currentTier;
  }
  if (currentTier === 'DETAILED') return 'STANDARD';
  if (currentTier === 'STANDARD') return 'LOW_2D';
  return 'LOW_2D';
}

/**
 * Evaluates whether sustained low frame duration permits recovery to a higher tier.
 */
export function evaluatePressureRecovery(
  currentTier: QualityTier,
  rollingP95Ms: number,
  recoveryBudgetMs: number = 14.0,
): QualityTier {
  if (!Number.isFinite(rollingP95Ms) || rollingP95Ms >= recoveryBudgetMs) {
    return currentTier;
  }
  if (currentTier === 'LOW_2D') return 'STANDARD';
  if (currentTier === 'STANDARD') return 'DETAILED';
  return 'DETAILED';
}

/** UI quality policy only: never changes sensor data, clinical thresholds or picking IDs. */
export function renderSettings(
  profile: RenderProfile | QualityMode,
  factor: number,
  deviceDpr: number,
  hidden: boolean,
  reducedMotion: boolean,
) {
  const isLow2D = profile === 'LOW_2D';
  if (isLow2D || hidden) {
    return { dpr: 1, frameloop: 'never' as const };
  }
  const device = Number.isFinite(deviceDpr) && deviceDpr > 0 ? Math.min(2, deviceDpr) : 1;
  const adaptive = Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : 0.5;
  const requested =
    profile === 'LITE'
      ? 0.75
      : profile === 'STANDARD'
        ? 1.25
        : profile === 'HIGH' || profile === 'DETAILED'
          ? 2
          : 0.75 + 1.25 * adaptive;

  return {
    dpr: Math.min(device, requested),
    frameloop: reducedMotion || profile === 'LITE' ? ('demand' as const) : ('always' as const),
  };
}
