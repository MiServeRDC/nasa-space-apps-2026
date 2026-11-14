use crate::error::LsahStorageError;
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

/// Issue #12 provenance tag identifying how a POCUS embedding was produced.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PocusEmbeddingOrigin {
    /// Procedural canvas/math B-mode simulation (not calibrated against clinical DICOM).
    #[default]
    ProceduralBModeSimulation,
    /// Calibrated terrestrial phantom ultrasound acquisition.
    CalibratedPhantomBMode,
    /// Verified clinical DICOM acquisition.
    ClinicalDicomVerified,
}

impl PocusEmbeddingOrigin {
    #[inline]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProceduralBModeSimulation => "PROCEDURAL_BMODE_SIMULATION",
            Self::CalibratedPhantomBMode => "CALIBRATED_PHANTOM_BMODE",
            Self::ClinicalDicomVerified => "CLINICAL_DICOM_VERIFIED",
        }
    }

    #[inline]
    pub const fn compact_code(self) -> &'static str {
        match self {
            Self::ProceduralBModeSimulation => "PROCEDURAL_SIM",
            Self::CalibratedPhantomBMode => "PHANTOM_BMODE",
            Self::ClinicalDicomVerified => "CLINICAL_DICOM",
        }
    }
}

/// Physical hemodynamic and anatomical measurements accompanying an episodic POCUS scan.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PocusHemodynamicContext {
    pub tau_w_dyn_cm2: f64,
    pub ijv_csa_cm2: f64,
    pub ijv_vmax_cm_s: f32,
    pub compressibility_ratio: f32,
    pub lbnp_pressure_mmhg: f32,
    pub onsd_mm: f32,
    pub pocus_p_thrombus: f32,
}

impl Default for PocusHemodynamicContext {
    fn default() -> Self {
        Self {
            tau_w_dyn_cm2: 2.80,
            ijv_csa_cm2: 0.72,
            ijv_vmax_cm_s: 16.0,
            compressibility_ratio: 0.92,
            lbnp_pressure_mmhg: 0.0,
            onsd_mm: 4.8,
            pocus_p_thrombus: 0.08,
        }
    }
}

/// Full episodic POCUS signature record stored in Warm table & HNSW index.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PocusSignatureRecord {
    pub signature_id: u64,
    pub timestamp_unix_ms: i64,
    pub mission_sol: u16,
    pub crew_id: String,
    pub anatomical_target_uberon: String,
    pub context: PocusHemodynamicContext,
    pub embedding_origin: PocusEmbeddingOrigin,
    pub validation_status: ModelValidationStatus,
    /// Hard Safety Gate 1 invariant: must remain `true` unless live clinician POCUS confirms thrombus.
    pub anticoagulant_gate_locked: bool,
    pub feature_vector: Vec<f32>,
}

impl PocusSignatureRecord {
    /// Returns canonical Issue #12 validation status label.
    pub fn validation_status_str(&self) -> &'static str {
        match self.validation_status {
            ModelValidationStatus::IllustrativeUnvalidated => "ILLUSTRATIVE_UNVALIDATED",
            ModelValidationStatus::InternallyBenchmarkedTerrestrial { .. } => {
                "INTERNALLY_BENCHMARKED_TERRESTRIAL"
            }
            ModelValidationStatus::ClinicallyCalibratedSubjectToReview => {
                "CLINICALLY_CALIBRATED_SUBJECT_TO_REVIEW"
            }
        }
    }

    /// Constructs a procedural B-mode POCUS signature record enforcing Issue #12 provenance
    /// (`ProceduralBModeSimulation` + `IllustrativeUnvalidated`) and Hard Safety Gate 1 lock (`true`).
    #[allow(clippy::too_many_arguments)]
    pub fn from_procedural_bmode(
        signature_id: u64,
        timestamp_unix_ms: i64,
        mission_sol: u16,
        crew_id: impl Into<String>,
        anatomical_target_uberon: impl Into<String>,
        bmode_pixels: &[u8],
        width: usize,
        height: usize,
        context: PocusHemodynamicContext,
        dim: usize,
    ) -> Result<Self, LsahStorageError> {
        let feature_vector =
            extract_pocus_feature_vector(bmode_pixels, width, height, &context, dim)?;
        Ok(Self {
            signature_id,
            timestamp_unix_ms,
            mission_sol,
            crew_id: crew_id.into(),
            anatomical_target_uberon: anatomical_target_uberon.into(),
            context,
            embedding_origin: PocusEmbeddingOrigin::ProceduralBModeSimulation,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
            anticoagulant_gate_locked: true,
            feature_vector,
        })
    }
}

/// Deterministic `D = 128` or `D = 256` L2-normalized feature extractor combining acoustic B-mode
/// texture descriptors (85% energy) with dimensionless hemodynamic context (15% energy).
pub fn extract_pocus_feature_vector(
    bmode_pixels: &[u8],
    width: usize,
    height: usize,
    ctx: &PocusHemodynamicContext,
    dim: usize,
) -> Result<Vec<f32>, LsahStorageError> {
    if dim != 128 && dim != 256 {
        return Err(LsahStorageError::EmbeddingDimensionMismatch {
            expected: 128,
            actual: dim,
        });
    }
    if width < 4 || height < 4 {
        return Err(LsahStorageError::InvalidPocusInput(format!(
            "B-mode dimensions {width}x{height} must be at least 4x4"
        )));
    }
    let expected_len = width.checked_mul(height).ok_or_else(|| {
        LsahStorageError::InvalidPocusInput("B-mode dimension overflow".to_string())
    })?;
    if bmode_pixels.len() != expected_len {
        return Err(LsahStorageError::InvalidPocusInput(format!(
            "expected {expected_len} pixels for {width}x{height}, got {}",
            bmode_pixels.len()
        )));
    }

    let ctx_vals = [
        ctx.tau_w_dyn_cm2 as f32,
        ctx.ijv_csa_cm2 as f32,
        ctx.ijv_vmax_cm_s,
        ctx.compressibility_ratio,
        ctx.lbnp_pressure_mmhg,
        ctx.onsd_mm,
        ctx.pocus_p_thrombus,
    ];
    for (idx, val) in ctx_vals.iter().enumerate() {
        if !val.is_finite() {
            return Err(LsahStorageError::NonFiniteEmbeddingValue { index: idx });
        }
    }

    let mut acoustic = vec![0.0_f32; dim - 32];
    let cx = (width as f32 - 1.0) * 0.5;
    let cy = (height as f32 - 1.0) * 0.5;
    let max_r = (cx * cx + cy * cy).sqrt().max(1.0);

    // 1) [0..64]: 8 radial rings x 8 intensity/Sobel-gradient features
    let mut ring_sum = [0.0_f64; 8];
    let mut ring_sq = [0.0_f64; 8];
    let mut ring_grad = [0.0_f64; 8];
    let mut ring_cnt = [0.0_f64; 8];

    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            let px = bmode_pixels[idx] as f64 / 255.0;
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let r_norm = ((dx * dx + dy * dy).sqrt() / max_r).clamp(0.0, 0.9999);
            let ring = ((r_norm * 8.0) as usize).min(7);

            let left = bmode_pixels[y * width + x.saturating_sub(1)] as f64 / 255.0;
            let right = bmode_pixels[y * width + (x + 1).min(width - 1)] as f64 / 255.0;
            let up = bmode_pixels[y.saturating_sub(1) * width + x] as f64 / 255.0;
            let down = bmode_pixels[(y + 1).min(height - 1) * width + x] as f64 / 255.0;
            let grad = ((right - left).powi(2) + (down - up).powi(2)).sqrt();

            ring_sum[ring] += px;
            ring_sq[ring] += px * px;
            ring_grad[ring] += grad;
            ring_cnt[ring] += 1.0;
        }
    }

    for r in 0..8 {
        let cnt = ring_cnt[r].max(1.0);
        let mean = ring_sum[r] / cnt;
        let var = (ring_sq[r] / cnt - mean * mean).max(0.0);
        let std = var.sqrt();
        let gmean = ring_grad[r] / cnt;
        let base = r * 8;
        acoustic[base] = mean as f32;
        acoustic[base + 1] = std as f32;
        acoustic[base + 2] = gmean as f32;
        acoustic[base + 3] = (std / (mean + 1e-4)).min(4.0) as f32;
        acoustic[base + 4] = (mean * gmean) as f32;
        acoustic[base + 5] = (1.0 - mean).max(0.0) as f32;
        acoustic[base + 6] = (ring_cnt[r] / (width * height) as f64) as f32;
        acoustic[base + 7] = ((mean - ring_sum[0] / ring_cnt[0].max(1.0)).abs()) as f32;
    }

    // 2) [64..96]: 32 multi-scale Rayleigh speckle contrast & axial intensity profile bins
    for b in 0..32 {
        let y_start = (b * height) / 32;
        let y_end = (((b + 1) * height) / 32).max(y_start + 1).min(height);
        let mut s = 0.0_f64;
        let mut sq = 0.0_f64;
        let mut c = 0.0_f64;
        for y in y_start..y_end {
            for x in 0..width {
                let v = bmode_pixels[y * width + x] as f64 / 255.0;
                s += v;
                sq += v * v;
                c += 1.0;
            }
        }
        let mu = s / c.max(1.0);
        let sig = (sq / c.max(1.0) - mu * mu).max(0.0).sqrt();
        let speckle = sig / (mu + 0.02);
        acoustic[64 + b] = (0.65 * mu + 0.35 * speckle.min(2.0)) as f32;
    }

    // Optional [96..224] spatial-quadrant spectral bins when dim == 256
    if dim == 256 {
        for q in 0..128 {
            let y = ((q / 16) * height) / 8;
            let x = ((q % 16) * width) / 16;
            let px = bmode_pixels[y.min(height - 1) * width + x.min(width - 1)] as f32 / 255.0;
            acoustic[96 + q] = px;
        }
    }

    // 3) Last 32 dims: dimensionless normalized hemodynamic & morphological invariants
    let hemo_raw: [f32; 32] = [
        (ctx.ijv_csa_cm2 as f32 / 1.80).clamp(0.0, 2.0),
        (ctx.tau_w_dyn_cm2 as f32 / 6.0).clamp(0.0, 2.0),
        (ctx.ijv_vmax_cm_s / 25.0).clamp(0.0, 2.0),
        ctx.compressibility_ratio.clamp(0.0, 1.0),
        (ctx.onsd_mm / 6.0).clamp(0.0, 2.0),
        (-ctx.lbnp_pressure_mmhg / 50.0).clamp(-1.0, 1.5),
        ctx.pocus_p_thrombus.clamp(0.0, 1.0),
        (1.0 - ctx.compressibility_ratio).clamp(0.0, 1.0),
        ((ctx.tau_w_dyn_cm2 as f32) < 1.20) as u8 as f32,
        ((ctx.ijv_vmax_cm_s) < 5.0) as u8 as f32,
        (ctx.ijv_csa_cm2 as f32 * ctx.ijv_vmax_cm_s / 20.0).clamp(0.0, 2.0),
        ((ctx.tau_w_dyn_cm2 as f32) / (ctx.ijv_csa_cm2 as f32 + 0.1) / 10.0).clamp(0.0, 2.0),
        (ctx.onsd_mm - 4.5).max(0.0) / 3.0,
        (ctx.pocus_p_thrombus * (1.0 - ctx.compressibility_ratio)).clamp(0.0, 1.0),
        (ctx.ijv_csa_cm2 as f32 / 1.80).powi(2).clamp(0.0, 2.0),
        (ctx.tau_w_dyn_cm2 as f32 / 6.0).powi(2).clamp(0.0, 2.0),
        (ctx.ijv_vmax_cm_s / 25.0).powi(2).clamp(0.0, 2.0),
        (1.0 - (ctx.tau_w_dyn_cm2 as f32 / 3.0).clamp(0.0, 1.0)),
        (ctx.ijv_csa_cm2 as f32 - 0.70).clamp(-1.0, 1.5),
        (ctx.ijv_vmax_cm_s / (ctx.ijv_csa_cm2 as f32 * 25.0 + 1.0)).clamp(0.0, 2.0),
        0.5 * (ctx.compressibility_ratio + (1.0 - ctx.pocus_p_thrombus)),
        (ctx.onsd_mm / 8.0).clamp(0.0, 1.5),
        (-ctx.lbnp_pressure_mmhg / 60.0).clamp(-1.0, 1.5),
        (ctx.pocus_p_thrombus * 2.0).clamp(0.0, 2.0),
        ring_sum[0] as f32 / ring_cnt[0].max(1.0) as f32,
        ring_sum[1] as f32 / ring_cnt[1].max(1.0) as f32,
        ring_sum[2] as f32 / ring_cnt[2].max(1.0) as f32,
        ring_sum[3] as f32 / ring_cnt[3].max(1.0) as f32,
        ring_grad[0] as f32 / ring_cnt[0].max(1.0) as f32,
        ring_grad[3] as f32 / ring_cnt[3].max(1.0) as f32,
        (ctx.ijv_csa_cm2 as f32 * (1.0 - ctx.compressibility_ratio)).clamp(0.0, 2.0),
        1.0,
    ];

    // Weight acoustic energy at 85% and hemodynamic state at 15% before final unit L2 norm.
    let acoustic_norm = l2_norm(&acoustic).max(1e-12);
    let hemo_norm = l2_norm(&hemo_raw).max(1e-12);
    let acoustic_scale = 0.85_f32.sqrt() / acoustic_norm;
    let hemo_scale = 0.15_f32.sqrt() / hemo_norm;

    let mut out = Vec::with_capacity(dim);
    for v in acoustic {
        out.push(v * acoustic_scale);
    }
    for v in hemo_raw {
        out.push(v * hemo_scale);
    }

    let final_norm = l2_norm(&out).max(1e-12);
    for (idx, v) in out.iter_mut().enumerate() {
        *v /= final_norm;
        if !v.is_finite() {
            return Err(LsahStorageError::NonFiniteEmbeddingValue { index: idx });
        }
    }

    Ok(out)
}

/// Synthesizes a deterministic procedural B-mode grayscale image of an IJV lumen for tests
/// and UI fallback (`PocusEmbeddingOrigin::ProceduralBModeSimulation`).
pub fn synthesize_procedural_ijv_bmode(
    width: usize,
    height: usize,
    stasis_factor: f32,
    thrombus_echogenicity: f32,
) -> Vec<u8> {
    let mut pixels = vec![0u8; width * height];
    let cx = (width as f32 - 1.0) * 0.5;
    let cy = (height as f32 - 1.0) * 0.5;
    let radius = (width.min(height) as f32) * (0.28 + 0.08 * stasis_factor.clamp(0.0, 1.0));

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            // Deterministic Rayleigh-like speckle hash
            let hash = (((x as u64).wrapping_mul(73856093))
                ^ ((y as u64).wrapping_mul(19349663))
                ^ 0x5DEECE66D)
                % 29;
            let speckle = (hash as f32) - 14.0;

            let base = if dist < radius * 0.72 {
                // Inside lumen: anechoic (dark) unless stasis/thrombus echogenicity rises
                14.0 + stasis_factor.clamp(0.0, 1.0) * 58.0
                    + thrombus_echogenicity.clamp(0.0, 1.0) * 115.0
            } else if dist < radius {
                // Intimal wall boundary
                165.0 + thrombus_echogenicity.clamp(0.0, 1.0) * 40.0
            } else {
                // Surrounding neck fascia tissue
                105.0
            };

            let val = (base + speckle).clamp(0.0, 255.0) as u8;
            pixels[y * width + x] = val;
        }
    }
    pixels
}

#[inline]
pub(crate) fn l2_norm(v: &[f32]) -> f32 {
    let sum_sq: f32 = v.iter().map(|&x| x * x).sum();
    sum_sq.sqrt()
}
