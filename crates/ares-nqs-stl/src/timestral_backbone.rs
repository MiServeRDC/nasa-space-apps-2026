//! Fase 15 (H1): Pure-Rust Timestral Backbone for ARES-Health.
//! Implements CausalScaler (causal median, MAD * 1.4826, asinh/sinh),
//! PatchRepresentation with ZOH + explicit missing mask, CircularTelemetryBuffer,
//! RmsNorm (eps = 1e-5), FusedSwiGlu, SinCosRoPe (rotary factor 0.5),
//! and DualAxisAttention (Temporal Attention + Variate Attention via SdpaSigmoid).

use crate::error::NqsStlError;
use ares_core_types::telemetry::Biometrics;
use serde::{Deserialize, Serialize};

/// Type alias preserving compatibility with plan references.
pub type TimestralBackboneError = NqsStlError;

/// Number of core physiological channels from Biometrics (BIDMC v1.0.0 + autonomic).
pub const PHYSIOLOGICAL_CHANNELS: usize = 8;

/// Number of grey-box multivariate channels tracked by the 1 Hz co-processor:
/// [HR, PULSE, RESP, SpO2, RMSSD, SDNN, LF_HF, tau_w, ARED, SOST, SANS, rho_global].
pub const ARES_TIMESTRAL_CHANNELS: usize = 12;

/// Standard temporal patch length (32 samples at 1 Hz = 32 s).
pub const DEFAULT_PATCH_LEN: usize = 32;

/// Gaussian-consistent MAD scaling factor.
pub const MAD_CONSISTENCY_FACTOR: f64 = 1.4826;

/// Canonical names of the 8 physiological channels extracted from `Biometrics`.
pub const PHYSIO_CHANNEL_NAMES: [&str; PHYSIOLOGICAL_CHANNELS] = [
    "heart_rate_bpm",
    "pulse_rate_bpm",
    "resp_rate_brpm",
    "spo2_pct",
    "rmssd_ms",
    "sdnn_ms",
    "pnn50_pct",
    "lf_hf_ratio",
];

/// Block attention axis kind: temporal-only or alternating temporal + variate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayerKind {
    TimeOnly,
    TimeVariate,
}

/// Architectural configuration for the pure-Rust Timestral backbone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimestralConfig {
    pub num_channels: usize,
    pub patch_len: usize,
    pub d_model: usize,
    pub n_heads: usize,
    pub d_ff: usize,
    pub num_layers: usize,
    pub rope_fraction: f64,
    pub rope_theta: f64,
    pub rms_norm_eps: f64,
    pub sigma_floor: f64,
}

impl Default for TimestralConfig {
    fn default() -> Self {
        Self {
            num_channels: ARES_TIMESTRAL_CHANNELS,
            patch_len: DEFAULT_PATCH_LEN,
            d_model: 32,
            n_heads: 4,
            d_ff: 64,
            num_layers: 4,
            rope_fraction: 0.5,
            rope_theta: 10_000.0,
            rms_norm_eps: 1e-5,
            sigma_floor: 1e-4,
        }
    }
}

impl TimestralConfig {
    /// Validates dimensional invariants without panicking.
    pub fn validate(&self) -> Result<(), NqsStlError> {
        if self.num_channels == 0 || self.patch_len == 0 {
            return Err(NqsStlError::InvalidConfig {
                reason: "num_channels and patch_len must be > 0",
            });
        }
        if self.d_model == 0 || self.n_heads == 0 || !self.d_model.is_multiple_of(self.n_heads) {
            return Err(NqsStlError::InvalidConfig {
                reason: "d_model must be a positive multiple of n_heads",
            });
        }
        if self.d_ff == 0 || self.num_layers == 0 {
            return Err(NqsStlError::InvalidConfig {
                reason: "d_ff and num_layers must be > 0",
            });
        }
        if !self.rope_fraction.is_finite() || self.rope_fraction <= 0.0 || self.rope_fraction > 1.0
        {
            return Err(NqsStlError::InvalidConfig {
                reason: "rope_fraction must be in (0.0, 1.0]",
            });
        }
        let head_dim = self.d_model / self.n_heads;
        let rope_dim = ((head_dim as f64) * self.rope_fraction).round() as usize;
        if !rope_dim.is_multiple_of(2) {
            return Err(NqsStlError::InvalidConfig {
                reason: "rope_dim must be even for SinCosRoPe rotation pairs",
            });
        }
        Ok(())
    }

    #[inline]
    pub fn layer_kind(&self, layer_idx: usize) -> LayerKind {
        if (layer_idx + 1).is_multiple_of(2) {
            LayerKind::TimeVariate
        } else {
            LayerKind::TimeOnly
        }
    }
}

/// Preallocated O(1) circular ring buffer for multivariate telemetry with `Option<f64>`.
#[derive(Debug, Clone)]
pub struct CircularTelemetryBuffer {
    num_channels: usize,
    capacity: usize,
    write_idx: usize,
    len: usize,
    /// Ring storage indexed as [slot][channel] to avoid per-step heap allocation.
    slots: Vec<Vec<Option<f64>>>,
}

impl CircularTelemetryBuffer {
    /// Allocates fixed capacity upfront; subsequent `push_step` calls perform zero heap allocations.
    pub fn new(num_channels: usize, capacity: usize) -> Result<Self, NqsStlError> {
        if num_channels == 0 || capacity == 0 {
            return Err(NqsStlError::InvalidConfig {
                reason: "buffer num_channels and capacity must be > 0",
            });
        }
        let slots = vec![vec![None; num_channels]; capacity];
        Ok(Self {
            num_channels,
            capacity,
            write_idx: 0,
            len: 0,
            slots,
        })
    }

    /// Pushes one multivariate sample in O(1) time without heap allocation.
    pub fn push_step(&mut self, values: &[Option<f64>]) -> Result<(), NqsStlError> {
        if values.len() != self.num_channels {
            return Err(NqsStlError::DimensionMismatch {
                expected: self.num_channels,
                found: values.len(),
            });
        }
        let slot = &mut self.slots[self.write_idx];
        for (dst, &src) in slot.iter_mut().zip(values.iter()) {
            *dst = match src {
                Some(v) if v.is_finite() => Some(v),
                _ => None,
            };
        }
        self.write_idx = (self.write_idx + 1) % self.capacity;
        if self.len < self.capacity {
            self.len += 1;
        }
        Ok(())
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.len
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    #[inline]
    pub fn num_channels(&self) -> usize {
        self.num_channels
    }

    /// Extracts up to `window_len` most recent samples per channel in chronological order.
    /// If fewer than `window_len` steps exist, left-pads with `None`.
    pub fn export_channel_windows(&self, window_len: usize) -> Vec<Vec<Option<f64>>> {
        let mut out = vec![vec![None; window_len]; self.num_channels];
        if self.len == 0 || window_len == 0 {
            return out;
        }
        let take_count = self.len.min(window_len);
        let pad_left = window_len - take_count;
        let oldest_idx = (self.write_idx + self.capacity - self.len) % self.capacity;
        let start_offset = self.len - take_count;

        for step in 0..take_count {
            let ring_idx = (oldest_idx + start_offset + step) % self.capacity;
            let row = &self.slots[ring_idx];
            for ch in 0..self.num_channels {
                out[ch][pad_left + step] = row[ch];
            }
        }
        out
    }
}

/// Causal robust statistics extracted from the observed samples of a channel window.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ChannelCausalStats {
    pub median: f64,
    pub mad_scale: f64,
    pub observed_ratio: f64,
}

/// Computes the exact median of a non-empty slice (sorts in place).
#[inline]
fn median_in_place(vals: &mut [f64]) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    vals.sort_by(f64::total_cmp);
    let n = vals.len();
    if n.is_multiple_of(2) {
        0.5 * (vals[n / 2 - 1] + vals[n / 2])
    } else {
        vals[n / 2]
    }
}

/// Causal per-patch scaler using robust median, MAD * 1.4826, and asinh/sinh transforms.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CausalScaler {
    pub sigma_floor: f64,
}

impl Default for CausalScaler {
    fn default() -> Self {
        Self { sigma_floor: 1e-4 }
    }
}

impl CausalScaler {
    pub fn new(sigma_floor: f64) -> Self {
        Self {
            sigma_floor: if sigma_floor.is_finite() {
                sigma_floor.max(1e-6)
            } else {
                1e-4
            },
        }
    }

    /// Scales a single-channel patch causally using only observed finite values (`Some`).
    /// Missing entries (`None` or non-finite) receive `missing_mask = 1.0` and causal ZOH
    /// imputation in scaled space (initialized to 0.0 = causal median if no prior sample).
    pub fn scale_patch_channel(
        &self,
        raw_samples: &[Option<f64>],
    ) -> (Vec<f64>, Vec<f64>, ChannelCausalStats) {
        let mut observed: Vec<f64> = raw_samples
            .iter()
            .copied()
            .flatten()
            .filter(|v| v.is_finite())
            .collect();

        let count = observed.len();
        let observed_ratio = if raw_samples.is_empty() {
            0.0
        } else {
            (count as f64) / (raw_samples.len() as f64)
        };

        let median = median_in_place(&mut observed);
        let mut abs_devs: Vec<f64> = observed.iter().map(|v| (v - median).abs()).collect();
        let mad = median_in_place(&mut abs_devs);
        let mad_scale = (MAD_CONSISTENCY_FACTOR * mad).max(self.sigma_floor);

        let mut scaled_values = Vec::with_capacity(raw_samples.len());
        let mut missing_mask = Vec::with_capacity(raw_samples.len());
        let mut last_valid_scaled: f64 = 0.0;

        for opt in raw_samples {
            match opt {
                Some(v) if v.is_finite() => {
                    let z = (*v - median) / mad_scale;
                    let s = z.asinh();
                    last_valid_scaled = s;
                    scaled_values.push(s);
                    missing_mask.push(0.0);
                }
                _ => {
                    // Explicit missing flag (1.0) paired with Zero-Order Hold in scaled space.
                    scaled_values.push(last_valid_scaled);
                    missing_mask.push(1.0);
                }
            }
        }

        (
            scaled_values,
            missing_mask,
            ChannelCausalStats {
                median,
                mad_scale,
                observed_ratio,
            },
        )
    }

    /// Inverse transform from latent asinh space back to physical telemetry units via sinh.
    #[inline]
    pub fn denormalize_value(&self, latent_val: f64, stats: ChannelCausalStats) -> f64 {
        let clean_latent = if latent_val.is_finite() {
            latent_val.clamp(-20.0, 20.0)
        } else {
            0.0
        };
        let loc = if stats.median.is_finite() {
            stats.median
        } else {
            0.0
        };
        let scale = if stats.mad_scale.is_finite() {
            stats.mad_scale.max(self.sigma_floor)
        } else {
            self.sigma_floor
        };
        loc + scale * clean_latent.sinh()
    }
}

/// Dual-channel patch representation `[scaled_values, missing_mask]` of length `2 * patch_len`
/// per physiological channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PatchRepresentation {
    pub patch_len: usize,
    /// Per channel r: concatenation `[scaled_0..scaled_{P-1}, missing_0..missing_{P-1}]`.
    pub dual_features_per_channel: Vec<Vec<f64>>,
    /// Causal robust statistics per channel.
    pub channel_stats: Vec<ChannelCausalStats>,
}

impl PatchRepresentation {
    /// Builds a single-patch dual representation from per-channel windows of length `patch_len`.
    pub fn from_multivariate_window(
        channels: &[Vec<Option<f64>>],
        patch_len: usize,
        scaler: &CausalScaler,
    ) -> Result<Self, NqsStlError> {
        if channels.is_empty() || patch_len == 0 {
            return Err(NqsStlError::EmptyPatchWindow);
        }
        let mut dual_features_per_channel = Vec::with_capacity(channels.len());
        let mut channel_stats = Vec::with_capacity(channels.len());

        for ch in channels {
            if ch.len() != patch_len {
                return Err(NqsStlError::DimensionMismatch {
                    expected: patch_len,
                    found: ch.len(),
                });
            }
            let (mut vals, mask, stats) = scaler.scale_patch_channel(ch);
            vals.extend_from_slice(&mask);
            dual_features_per_channel.push(vals);
            channel_stats.push(stats);
        }

        Ok(Self {
            patch_len,
            dual_features_per_channel,
            channel_stats,
        })
    }

    /// Extracts the 8 physiological `Option<f64>` channels natively from `Biometrics` frames
    /// (preserving `None` entries such as missing PULSE/SpO2 rows in `bidmc_01_Numerics.csv`).
    pub fn from_biometrics_slice(
        frames: &[Biometrics],
        scaler: &CausalScaler,
    ) -> Result<Self, NqsStlError> {
        if frames.is_empty() {
            return Err(NqsStlError::EmptyPatchWindow);
        }
        let patch_len = frames.len();
        let mut channels: Vec<Vec<Option<f64>>> = (0..PHYSIOLOGICAL_CHANNELS)
            .map(|_| Vec::with_capacity(patch_len))
            .collect();
        for f in frames {
            channels[0].push(f.heart_rate_bpm);
            channels[1].push(f.pulse_rate_bpm);
            channels[2].push(f.resp_rate_brpm);
            channels[3].push(f.spo2_pct);
            channels[4].push(f.rmssd_ms);
            channels[5].push(f.sdnn_ms);
            channels[6].push(f.pnn50_pct);
            channels[7].push(f.lf_hf_ratio);
        }
        Self::from_multivariate_window(&channels, patch_len, scaler)
    }

    /// Splits a longer window into `n_patches` contiguous causal patches of size `patch_len`.
    pub fn build_multi_patch_sequence(
        channels: &[Vec<Option<f64>>],
        patch_len: usize,
        scaler: &CausalScaler,
    ) -> Result<Vec<Self>, NqsStlError> {
        if channels.is_empty() || patch_len == 0 {
            return Err(NqsStlError::EmptyPatchWindow);
        }
        let total_len = channels[0].len();
        if total_len < patch_len || !total_len.is_multiple_of(patch_len) {
            return Err(NqsStlError::DimensionMismatch {
                expected: total_len - (total_len % patch_len),
                found: total_len,
            });
        }
        for ch in channels {
            if ch.len() != total_len {
                return Err(NqsStlError::DimensionMismatch {
                    expected: total_len,
                    found: ch.len(),
                });
            }
        }
        let num_patches = total_len / patch_len;
        let mut patches = Vec::with_capacity(num_patches);
        for p in 0..num_patches {
            let start = p * patch_len;
            let end = start + patch_len;
            let slice_ch: Vec<Vec<Option<f64>>> =
                channels.iter().map(|ch| ch[start..end].to_vec()).collect();
            patches.push(Self::from_multivariate_window(
                &slice_ch, patch_len, scaler,
            )?);
        }
        Ok(patches)
    }
}

/// Deterministic SplitMix64 PRNG for reproducible weight initialization without external deps.
struct DeterministicPrng {
    state: u64,
}

impl DeterministicPrng {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `[-scale, scale]`.
    fn next_symmetric(&mut self, scale: f64) -> f64 {
        let u = (self.next_u64() >> 11) as f64 / ((1u64 << 53) as f64);
        (2.0 * u - 1.0) * scale
    }
}

/// Deterministic linear layer `y = W x + b` stored row-major `(out_dim x in_dim)`.
#[derive(Debug, Clone, PartialEq)]
pub struct LinearLayer {
    pub in_dim: usize,
    pub out_dim: usize,
    pub weights: Vec<f64>,
    pub bias: Vec<f64>,
}

impl LinearLayer {
    fn deterministic(in_dim: usize, out_dim: usize, prng: &mut DeterministicPrng) -> Self {
        let scale = 1.0 / (in_dim.max(1) as f64).sqrt();
        let mut weights = Vec::with_capacity(out_dim * in_dim);
        for _ in 0..(out_dim * in_dim) {
            weights.push(prng.next_symmetric(scale));
        }
        let bias = vec![0.0; out_dim];
        Self {
            in_dim,
            out_dim,
            weights,
            bias,
        }
    }

    pub fn forward(&self, x: &[f64]) -> Result<Vec<f64>, NqsStlError> {
        if x.len() != self.in_dim {
            return Err(NqsStlError::DimensionMismatch {
                expected: self.in_dim,
                found: x.len(),
            });
        }
        let mut out = Vec::with_capacity(self.out_dim);
        for r in 0..self.out_dim {
            let row = &self.weights[r * self.in_dim..(r + 1) * self.in_dim];
            let dot: f64 = row.iter().zip(x.iter()).map(|(&w, &xi)| w * xi).sum();
            out.push(dot + self.bias[r]);
        }
        Ok(out)
    }
}

/// Root Mean Square Layer Normalization (`eps = 1e-5` by default).
#[derive(Debug, Clone, PartialEq)]
pub struct RmsNorm {
    pub gamma: Vec<f64>,
    pub eps: f64,
}

impl RmsNorm {
    pub fn new(dim: usize, eps: f64) -> Result<Self, NqsStlError> {
        if dim == 0 {
            return Err(NqsStlError::InvalidConfig {
                reason: "RmsNorm dim must be > 0",
            });
        }
        Ok(Self {
            gamma: vec![1.0; dim],
            eps: eps.max(1e-12),
        })
    }

    #[inline]
    pub fn forward(&self, x: &[f64]) -> Result<Vec<f64>, NqsStlError> {
        rms_norm(x, &self.gamma, self.eps)
    }
}

/// Standalone functional Root Mean Square normalization.
#[inline]
pub fn rms_norm(x: &[f64], gamma: &[f64], eps: f64) -> Result<Vec<f64>, NqsStlError> {
    if x.len() != gamma.len() || x.is_empty() {
        return Err(NqsStlError::DimensionMismatch {
            expected: gamma.len(),
            found: x.len(),
        });
    }
    let mean_sq = x.iter().map(|v| v * v).sum::<f64>() / (x.len() as f64);
    let inv_rms = 1.0 / (mean_sq + eps.max(1e-12)).sqrt();
    Ok(x.iter()
        .zip(gamma.iter())
        .map(|(v, g)| v * inv_rms * g)
        .collect())
}

/// Fused SwiGLU feed-forward block: `W_down (SiLU(W_g x) * W_u x)`.
#[derive(Debug, Clone, PartialEq)]
pub struct FusedSwiGlu {
    pub w_gate: LinearLayer,
    pub w_up: LinearLayer,
    pub w_down: LinearLayer,
}

impl FusedSwiGlu {
    fn deterministic(d_model: usize, d_ff: usize, prng: &mut DeterministicPrng) -> Self {
        Self {
            w_gate: LinearLayer::deterministic(d_model, d_ff, prng),
            w_up: LinearLayer::deterministic(d_model, d_ff, prng),
            w_down: LinearLayer::deterministic(d_ff, d_model, prng),
        }
    }

    pub fn forward(&self, x: &[f64]) -> Result<Vec<f64>, NqsStlError> {
        let g = self.w_gate.forward(x)?;
        let u = self.w_up.forward(x)?;
        let gated = fused_swiglu(&g, &u)?;
        self.w_down.forward(&gated)
    }
}

/// Functional SwiGLU activation: `SiLU(gate) * up`.
#[inline]
pub fn fused_swiglu(gate: &[f64], up: &[f64]) -> Result<Vec<f64>, NqsStlError> {
    if gate.len() != up.len() {
        return Err(NqsStlError::DimensionMismatch {
            expected: gate.len(),
            found: up.len(),
        });
    }
    Ok(gate
        .iter()
        .zip(up.iter())
        .map(|(&g, &u)| {
            let silu = if g >= -40.0 {
                g / (1.0 + (-g).exp())
            } else {
                0.0
            };
            silu * u
        })
        .collect())
}

/// Partial Rotary Position Embedding (RoPE) along temporal patch positions.
#[derive(Debug, Clone, PartialEq)]
pub struct SinCosRoPe {
    pub head_dim: usize,
    pub rope_dim: usize,
    pub theta: f64,
}

impl SinCosRoPe {
    pub fn new(head_dim: usize, rotary_factor: f64, theta: f64) -> Result<Self, NqsStlError> {
        if head_dim == 0 {
            return Err(NqsStlError::InvalidConfig {
                reason: "head_dim must be > 0",
            });
        }
        let rope_dim = ((head_dim as f64) * rotary_factor).round() as usize;
        if rope_dim > head_dim || !rope_dim.is_multiple_of(2) {
            return Err(NqsStlError::InvalidConfig {
                reason: "rope_dim must be even and <= head_dim",
            });
        }
        Ok(Self {
            head_dim,
            rope_dim,
            theta: theta.max(2.0),
        })
    }

    pub fn apply_in_place(&self, head_vec: &mut [f64], pos_idx: usize) -> Result<(), NqsStlError> {
        if head_vec.len() != self.head_dim {
            return Err(NqsStlError::DimensionMismatch {
                expected: self.head_dim,
                found: head_vec.len(),
            });
        }
        apply_partial_sincos_rope(head_vec, pos_idx, self.rope_dim, self.theta)
    }
}

/// Applies partial SinCosRoPE in-place on the first `rope_dim` elements of a head vector.
pub fn apply_partial_sincos_rope(
    head_vec: &mut [f64],
    pos_idx: usize,
    rope_dim: usize,
    theta: f64,
) -> Result<(), NqsStlError> {
    if rope_dim > head_vec.len() || !rope_dim.is_multiple_of(2) {
        return Err(NqsStlError::DimensionMismatch {
            expected: head_vec.len(),
            found: rope_dim,
        });
    }
    let half = rope_dim / 2;
    let pos = pos_idx as f64;
    for k in 0..half {
        let freq = theta.powf(-2.0 * (k as f64) / (rope_dim as f64));
        let angle = pos * freq;
        let (sin_a, cos_a) = angle.sin_cos();
        let x0 = head_vec[2 * k];
        let x1 = head_vec[2 * k + 1];
        head_vec[2 * k] = x0 * cos_a - x1 * sin_a;
        head_vec[2 * k + 1] = x0 * sin_a + x1 * cos_a;
    }
    Ok(())
}

/// Element-wise stable sigmoid.
#[inline]
fn sigmoid_f64(x: f64) -> f64 {
    if x >= 0.0 {
        1.0 / (1.0 + (-x).exp())
    } else {
        let ex = x.exp();
        ex / (1.0 + ex)
    }
}

/// Dual-Axis Attention block:
/// - Temporal Attention across patches with causal mask, SinCosRoPe, and SdpaSigmoid gate.
/// - Variate Attention across physiological channels using `SdpaSigmoid`:
///   `sigma(Q K^T / sqrt(d_k) + b_prior)` so correlated channels do not compete in zero-sum softmax.
#[derive(Debug, Clone, PartialEq)]
pub struct DualAxisAttention {
    pub d_model: usize,
    pub n_heads: usize,
    pub head_dim: usize,
    pub layer_kind: LayerKind,
    pub rope: SinCosRoPe,
    pub w_q: LinearLayer,
    pub w_k: LinearLayer,
    pub w_v: LinearLayer,
    pub w_gate: LinearLayer,
    pub w_out: LinearLayer,
    /// Optional variate cross-channel prior bias `b_prior[i * R + j]`.
    pub variate_prior_bias: Vec<f64>,
    pub num_channels: usize,
}

impl DualAxisAttention {
    fn deterministic(
        cfg: &TimestralConfig,
        layer_kind: LayerKind,
        prng: &mut DeterministicPrng,
    ) -> Result<Self, NqsStlError> {
        cfg.validate()?;
        let head_dim = cfg.d_model / cfg.n_heads;
        let rope = SinCosRoPe::new(head_dim, cfg.rope_fraction, cfg.rope_theta)?;
        let mut variate_prior_bias = vec![0.0; cfg.num_channels * cfg.num_channels];
        for i in 0..cfg.num_channels {
            variate_prior_bias[i * cfg.num_channels + i] = 0.5;
        }
        Ok(Self {
            d_model: cfg.d_model,
            n_heads: cfg.n_heads,
            head_dim,
            layer_kind,
            rope,
            w_q: LinearLayer::deterministic(cfg.d_model, cfg.d_model, prng),
            w_k: LinearLayer::deterministic(cfg.d_model, cfg.d_model, prng),
            w_v: LinearLayer::deterministic(cfg.d_model, cfg.d_model, prng),
            w_gate: LinearLayer::deterministic(cfg.d_model, cfg.d_model, prng),
            w_out: LinearLayer::deterministic(cfg.d_model, cfg.d_model, prng),
            variate_prior_bias,
            num_channels: cfg.num_channels,
        })
    }

    /// Runs DualAxisAttention on tensor shaped `[num_channels][num_patches][d_model]`.
    pub fn forward(&self, x: &[Vec<Vec<f64>>]) -> Result<Vec<Vec<Vec<f64>>>, NqsStlError> {
        if x.is_empty() || x[0].is_empty() {
            return Err(NqsStlError::EmptyPatchWindow);
        }
        let r_channels = x.len();
        let n_patches = x[0].len();
        for ch_seq in x {
            if ch_seq.len() != n_patches {
                return Err(NqsStlError::DimensionMismatch {
                    expected: n_patches,
                    found: ch_seq.len(),
                });
            }
            for tok in ch_seq {
                if tok.len() != self.d_model {
                    return Err(NqsStlError::DimensionMismatch {
                        expected: self.d_model,
                        found: tok.len(),
                    });
                }
            }
        }

        // 1. Temporal Self-Attention per channel across patches (causal + partial SinCosRoPe).
        let mut time_out = Vec::with_capacity(r_channels);
        for ch_seq in x {
            time_out.push(self.attend_sequence(ch_seq, true, false)?);
        }

        if self.layer_kind == LayerKind::TimeOnly || r_channels == 1 {
            return Ok(time_out);
        }

        // 2. Variate Attention per patch across channels using SdpaSigmoid
        //    sigma(Q K^T / sqrt(d_k) + b_prior) so correlated channels do not compete zero-sum.
        let mut final_out = vec![vec![Vec::new(); n_patches]; r_channels];
        for p in 0..n_patches {
            let variate_slice: Vec<Vec<f64>> =
                (0..r_channels).map(|r| time_out[r][p].clone()).collect();
            let attended = self.attend_sequence(&variate_slice, false, true)?;
            for r in 0..r_channels {
                final_out[r][p] = attended[r].clone();
            }
        }
        Ok(final_out)
    }

    fn attend_sequence(
        &self,
        seq: &[Vec<f64>],
        is_causal_temporal: bool,
        use_variate_sdpa_sigmoid: bool,
    ) -> Result<Vec<Vec<f64>>, NqsStlError> {
        let len = seq.len();
        let mut qs = Vec::with_capacity(len);
        let mut ks = Vec::with_capacity(len);
        let mut vs = Vec::with_capacity(len);
        let mut gates = Vec::with_capacity(len);

        for (pos, tok) in seq.iter().enumerate() {
            let mut q = self.w_q.forward(tok)?;
            let mut k = self.w_k.forward(tok)?;
            let v = self.w_v.forward(tok)?;
            let g = self.w_gate.forward(tok)?;

            if is_causal_temporal {
                for h in 0..self.n_heads {
                    let s = h * self.head_dim;
                    let e = s + self.head_dim;
                    self.rope.apply_in_place(&mut q[s..e], pos)?;
                    self.rope.apply_in_place(&mut k[s..e], pos)?;
                }
            }
            qs.push(q);
            ks.push(k);
            vs.push(v);
            gates.push(g);
        }

        let inv_sqrt_dk = 1.0 / (self.head_dim as f64).sqrt();
        let inv_len = 1.0 / (len.max(1) as f64);
        let mut outputs = Vec::with_capacity(len);

        for i in 0..len {
            let mut concat_heads = vec![0.0; self.d_model];
            let k_limit = if is_causal_temporal { i + 1 } else { len };

            for h in 0..self.n_heads {
                let s = h * self.head_dim;
                let e = s + self.head_dim;
                let qh = &qs[i][s..e];

                let mut scores = Vec::with_capacity(k_limit);
                for (j, k_tok) in ks.iter().enumerate().take(k_limit) {
                    let kh = &k_tok[s..e];
                    let dot: f64 = qh.iter().zip(kh.iter()).map(|(&a, &b)| a * b).sum();
                    let prior = if use_variate_sdpa_sigmoid
                        && i < self.num_channels
                        && j < self.num_channels
                    {
                        self.variate_prior_bias[i * self.num_channels + j]
                    } else {
                        0.0
                    };
                    scores.push(dot * inv_sqrt_dk + prior);
                }

                let weights: Vec<f64> = if use_variate_sdpa_sigmoid {
                    // Non-competing SdpaSigmoid attention across variates:
                    // sigma(Q K^T / sqrt(d_k) + b_prior) / R
                    scores.iter().map(|&sc| sigmoid_f64(sc) * inv_len).collect()
                } else {
                    // Causal Softmax across temporal patches
                    let max_sc = scores.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                    let mut exps: Vec<f64> = scores.iter().map(|&sc| (sc - max_sc).exp()).collect();
                    let sum_exp: f64 = exps.iter().sum::<f64>().max(1e-12);
                    for w in &mut exps {
                        *w /= sum_exp;
                    }
                    exps
                };

                for (j, &w) in weights.iter().enumerate() {
                    let vh = &vs[j][s..e];
                    for d in 0..self.head_dim {
                        concat_heads[s + d] += w * vh[d];
                    }
                }
            }

            let gated = dual_axis_sdpa_sigmoid_gate(&concat_heads, &gates[i])?;
            outputs.push(self.w_out.forward(&gated)?);
        }

        Ok(outputs)
    }
}

/// Output gate helper: `attn * sigmoid(gate_logits)`.
#[inline]
pub fn dual_axis_sdpa_sigmoid_gate(
    attn_out: &[f64],
    gate_logits: &[f64],
) -> Result<Vec<f64>, NqsStlError> {
    if attn_out.len() != gate_logits.len() {
        return Err(NqsStlError::DimensionMismatch {
            expected: attn_out.len(),
            found: gate_logits.len(),
        });
    }
    Ok(attn_out
        .iter()
        .zip(gate_logits.iter())
        .map(|(&a, &g)| a * sigmoid_f64(g))
        .collect())
}

#[derive(Debug, Clone, PartialEq)]
struct TimestralBlock {
    norm_attn: RmsNorm,
    attn: DualAxisAttention,
    norm_ffn: RmsNorm,
    ffn: FusedSwiGlu,
}

/// Pure-Rust deterministic Timestral Transformer backbone.
#[derive(Debug, Clone, PartialEq)]
pub struct TimestralBackbone {
    pub config: TimestralConfig,
    patch_embed: LinearLayer,
    blocks: Vec<TimestralBlock>,
    final_norm: RmsNorm,
}

impl TimestralBackbone {
    /// Constructs a deterministic backbone initialized with a fixed seed.
    pub fn new_deterministic(config: TimestralConfig) -> Result<Self, NqsStlError> {
        config.validate()?;
        let mut prng = DeterministicPrng::new(0xA8E5_2026_0117_0015);
        let patch_embed =
            LinearLayer::deterministic(2 * config.patch_len, config.d_model, &mut prng);
        let mut blocks = Vec::with_capacity(config.num_layers);
        for idx in 0..config.num_layers {
            blocks.push(TimestralBlock {
                norm_attn: RmsNorm::new(config.d_model, config.rms_norm_eps)?,
                attn: DualAxisAttention::deterministic(&config, config.layer_kind(idx), &mut prng)?,
                norm_ffn: RmsNorm::new(config.d_model, config.rms_norm_eps)?,
                ffn: FusedSwiGlu::deterministic(config.d_model, config.d_ff, &mut prng),
            });
        }
        let final_norm = RmsNorm::new(config.d_model, config.rms_norm_eps)?;
        Ok(Self {
            config,
            patch_embed,
            blocks,
            final_norm,
        })
    }

    /// Runs forward pass over a sequence of `PatchRepresentation`s, returning the last-patch
    /// latent embedding `[num_channels][d_model]` per channel.
    pub fn forward_last_patch_embeddings(
        &self,
        patches: &[PatchRepresentation],
    ) -> Result<Vec<Vec<f64>>, NqsStlError> {
        if patches.is_empty() {
            return Err(NqsStlError::EmptyPatchWindow);
        }
        let n_patches = patches.len();
        let r_channels = patches[0].dual_features_per_channel.len();
        if r_channels == 0 {
            return Err(NqsStlError::EmptyPatchWindow);
        }

        let mut hidden: Vec<Vec<Vec<f64>>> = (0..r_channels)
            .map(|_| Vec::with_capacity(n_patches))
            .collect();
        for patch in patches {
            if patch.dual_features_per_channel.len() != r_channels {
                return Err(NqsStlError::DimensionMismatch {
                    expected: r_channels,
                    found: patch.dual_features_per_channel.len(),
                });
            }
            for (r, feat) in patch.dual_features_per_channel.iter().enumerate() {
                hidden[r].push(self.patch_embed.forward(feat)?);
            }
        }

        for block in &self.blocks {
            let mut normed = Vec::with_capacity(r_channels);
            for ch_seq in &hidden {
                let mut seq_norm = Vec::with_capacity(n_patches);
                for tok in ch_seq {
                    seq_norm.push(block.norm_attn.forward(tok)?);
                }
                normed.push(seq_norm);
            }
            let attn_out = block.attn.forward(&normed)?;
            for r in 0..r_channels {
                for p in 0..n_patches {
                    for d in 0..self.config.d_model {
                        hidden[r][p][d] += attn_out[r][p][d];
                    }
                    let ffn_in = block.norm_ffn.forward(&hidden[r][p])?;
                    let ffn_out = block.ffn.forward(&ffn_in)?;
                    for d in 0..self.config.d_model {
                        hidden[r][p][d] += ffn_out[d];
                    }
                }
            }
        }

        let mut last_embeddings = Vec::with_capacity(r_channels);
        for ch_seq in &hidden {
            last_embeddings.push(self.final_norm.forward(&ch_seq[n_patches - 1])?);
        }
        Ok(last_embeddings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_biometrics_row(hr: Option<f64>, pulse: Option<f64>, spo2: Option<f64>) -> Biometrics {
        Biometrics {
            heart_rate_bpm: hr,
            pulse_rate_bpm: pulse,
            resp_rate_brpm: Some(15.0),
            spo2_pct: spo2,
            rmssd_ms: Some(38.0),
            hrv_unavailable_reason: None,
            sdnn_ms: Some(49.0),
            pnn50_pct: Some(17.0),
            lf_hf_ratio: Some(1.6),
            vocal_f0_hz: Some(120.0),
            vocal_jitter_pct: Some(0.5),
            radiation_dose_rate_msv_d: 0.45,
            sqi_score: 0.90,
            missing_channels: Vec::new(),
        }
    }

    #[test]
    fn test_causal_scaler_asinh_sinh_roundtrip_and_outlier_resistance() {
        let scaler = CausalScaler::new(1e-4);
        // 32-sample patch with 13 None rows (like bidmc_01_Numerics.csv) and 1 massive motion spike
        let mut samples: Vec<Option<f64>> = Vec::with_capacity(32);
        for i in 0..32 {
            if i < 13 {
                samples.push(None);
            } else if i == 25 {
                // Extreme motion spike outlier: 5000.0 bpm artifact
                samples.push(Some(5000.0));
            } else {
                samples.push(Some(70.0 + ((i % 5) as f64) * 0.8));
            }
        }

        let (scaled, mask, stats) = scaler.scale_patch_channel(&samples);
        assert_eq!(scaled.len(), 32);
        assert_eq!(mask.len(), 32);

        let missing_count = mask.iter().filter(|&&m| (m - 1.0).abs() < 1e-12).count();
        assert_eq!(missing_count, 13);
        assert!((stats.observed_ratio - (19.0 / 32.0)).abs() < 1e-12);
        // Median & MAD must remain robust near ~71.6 despite the 5000.0 spike!
        assert!(
            (stats.median - 71.6).abs() < 2.0,
            "Causal median {} shifted by outlier!",
            stats.median
        );
        assert!(
            stats.mad_scale < 5.0,
            "MAD*1.4826 scale {} exploded due to spike!",
            stats.mad_scale
        );

        // Verify exact asinh -> sinh roundtrip on all valid non-spike observed points
        for (i, opt) in samples.iter().enumerate() {
            if let Some(raw) = opt
                && *raw < 1000.0
            {
                let rec = scaler.denormalize_value(scaled[i], stats);
                assert!(
                    (rec - *raw).abs() < 1e-10,
                    "Roundtrip error at {}: {} vs {}",
                    i,
                    rec,
                    raw
                );
            }
        }
    }

    #[test]
    fn test_patch_representation_handles_none_channels_without_nan_via_zoh() {
        let scaler = CausalScaler::default();
        let mut frames = Vec::with_capacity(32);
        for i in 0..32 {
            // Simulate 13 missing PULSE and SpO2 rows interspersed with valid rows
            let missing = (5..18).contains(&i);
            frames.push(make_biometrics_row(
                Some(72.0 + (i as f64) * 0.1),
                if missing {
                    None
                } else {
                    Some(71.5 + (i as f64) * 0.1)
                },
                if missing { None } else { Some(98.0) },
            ));
        }
        // Inject an explicit NaN in one slot to ensure non-finite sanitization
        frames[2].heart_rate_bpm = Some(f64::NAN);

        let patch = PatchRepresentation::from_biometrics_slice(&frames, &scaler)
            .expect("biometrics patch should build");
        assert_eq!(
            patch.dual_features_per_channel.len(),
            PHYSIOLOGICAL_CHANNELS
        );

        for ch_feat in &patch.dual_features_per_channel {
            assert_eq!(ch_feat.len(), 2 * 32);
            assert!(
                ch_feat.iter().all(|v| v.is_finite()),
                "NaN/Inf leaked into patch!"
            );
        }
        // Pulse channel (idx 1) has 13 missing flags = 1.0 in the second half [32..64]
        let pulse_mask = &patch.dual_features_per_channel[1][32..64];
        let ones = pulse_mask
            .iter()
            .filter(|&&m| (m - 1.0).abs() < 1e-12)
            .count();
        assert_eq!(ones, 13);
        // Verify ZOH imputed values for missing steps [5..18] match step 4's scaled value
        let pulse_vals = &patch.dual_features_per_channel[1][0..32];
        for t in 5..18 {
            assert!((pulse_vals[t] - pulse_vals[4]).abs() < 1e-12);
        }
    }

    #[test]
    fn test_dual_axis_attention_sdpa_sigmoid_and_sincos_rope_determinism() {
        let rope = SinCosRoPe::new(16, 0.5, 10_000.0).expect("valid RoPE");
        let mut q1 = (0..16).map(|i| (i as f64) * 0.25 - 1.5).collect::<Vec<_>>();
        let q_orig = q1.clone();
        rope.apply_in_place(&mut q1, 7).expect("apply RoPE");

        // L2 norm preserved across rotation
        let norm_orig: f64 = q_orig.iter().map(|x| x * x).sum::<f64>().sqrt();
        let norm_rot: f64 = q1.iter().map(|x| x * x).sum::<f64>().sqrt();
        assert!((norm_orig - norm_rot).abs() < 1e-12);
        // Unrotated second half [8..16] untouched
        for i in 8..16 {
            assert!((q1[i] - q_orig[i]).abs() < 1e-12);
        }

        // Run DualAxisAttention + full TimestralBackbone twice and assert bit-exact determinism
        let cfg = TimestralConfig {
            num_channels: PHYSIOLOGICAL_CHANNELS,
            patch_len: 8,
            d_model: 16,
            n_heads: 4,
            d_ff: 32,
            num_layers: 2,
            ..TimestralConfig::default()
        };
        let backbone_a = TimestralBackbone::new_deterministic(cfg.clone()).expect("backbone A");
        let backbone_b = TimestralBackbone::new_deterministic(cfg).expect("backbone B");

        let scaler = CausalScaler::default();
        let ch_data: Vec<Vec<Option<f64>>> = (0..PHYSIOLOGICAL_CHANNELS)
            .map(|c| {
                (0..16)
                    .map(|t| {
                        if t == 3 && c == 1 {
                            None
                        } else {
                            Some(60.0 + (c as f64) * 3.0 + (t as f64) * 0.4)
                        }
                    })
                    .collect()
            })
            .collect();
        let patches = PatchRepresentation::build_multi_patch_sequence(&ch_data, 8, &scaler)
            .expect("multi-patch");

        let emb_a = backbone_a
            .forward_last_patch_embeddings(&patches)
            .expect("forward A");
        let emb_b = backbone_b
            .forward_last_patch_embeddings(&patches)
            .expect("forward B");
        assert_eq!(emb_a.len(), PHYSIOLOGICAL_CHANNELS);
        assert_eq!(emb_a, emb_b);
        for row in &emb_a {
            assert!(row.iter().all(|v| v.is_finite()));
        }
    }

    #[test]
    fn test_rmsnorm_and_swiglu_zero_panic_on_dimension_mismatch() {
        let rms = RmsNorm::new(4, 1e-5).expect("valid RmsNorm");
        let norm_ok = rms.forward(&[3.0, 4.0, 0.0, 0.0]).expect("ok");
        assert_eq!(norm_ok.len(), 4);
        assert!(matches!(
            rms.forward(&[1.0, 2.0]),
            Err(NqsStlError::DimensionMismatch {
                expected: 4,
                found: 2
            })
        ));
        assert!(matches!(
            fused_swiglu(&[1.0, 2.0], &[3.0]),
            Err(NqsStlError::DimensionMismatch {
                expected: 2,
                found: 1
            })
        ));
    }
}
