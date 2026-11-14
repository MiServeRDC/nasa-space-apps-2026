//! Fase 32 (L4): Pure-Rust SafeTensors v1 binary format parser, pre-parse SHA-256 verification
//! against `assets/models/MANIFEST.json`, `F64`/`F32`/`BF16` -> `f64` decoding with finiteness
//! validation, and deterministic fallback without `.unwrap()` / `.expect()`.

use crate::error::NqsStlError;
use crate::timestral_backbone::{
    DualAxisAttention, FusedSwiGlu, LinearLayer, RmsNorm, TimestralBackbone, TimestralBlockWeights,
    TimestralConfig,
};
use crate::timestral_quantiles::QuantileHead;
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::ErrorKind;
use std::path::Path;

/// Upper bound on SafeTensors v1 JSON header size (64 MiB) to guard against malformed length prefixes.
const MAX_SAFETENSORS_HEADER_BYTES: usize = 64 * 1024 * 1024;

/// Deterministic PRNG seed tag reported when falling back to stub weights.
pub const DETERMINISTIC_STUB_SEED_HEX: &str = "0xA8E5_2026_0117_0015";

/// Supported tensor element dtypes for SafeTensors v1 parsing and serialization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SafeTensorDtype {
    F64,
    F32,
    BF16,
    Unsupported(String),
}

impl SafeTensorDtype {
    /// Parses a SafeTensors v1 JSON dtype string.
    pub fn from_tag(tag: &str) -> Self {
        match tag {
            "F64" => Self::F64,
            "F32" => Self::F32,
            "BF16" => Self::BF16,
            other => Self::Unsupported(other.to_string()),
        }
    }

    /// Returns the SafeTensors v1 JSON dtype string.
    pub fn as_tag(&self) -> &str {
        match self {
            Self::F64 => "F64",
            Self::F32 => "F32",
            Self::BF16 => "BF16",
            Self::Unsupported(s) => s.as_str(),
        }
    }

    /// Returns element byte width for known numeric dtypes.
    pub fn byte_width(&self) -> Option<usize> {
        match self {
            Self::F64 => Some(8),
            Self::F32 => Some(4),
            Self::BF16 => Some(2),
            Self::Unsupported(tag) => match tag.as_str() {
                "F16" | "I16" | "U16" => Some(2),
                "I8" | "U8" | "BOOL" => Some(1),
                "I32" | "U32" => Some(4),
                "I64" | "U64" => Some(8),
                _ => None,
            },
        }
    }
}

/// Zero-copy view into a single tensor inside a SafeTensors v1 byte buffer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SafeTensorView<'a> {
    name: String,
    dtype: SafeTensorDtype,
    shape: Vec<usize>,
    data: &'a [u8],
}

impl<'a> SafeTensorView<'a> {
    #[inline]
    pub fn name(&self) -> &str {
        &self.name
    }

    #[inline]
    pub fn dtype(&self) -> &SafeTensorDtype {
        &self.dtype
    }

    #[inline]
    pub fn shape(&self) -> &[usize] {
        &self.shape
    }

    #[inline]
    pub fn data(&self) -> &'a [u8] {
        self.data
    }
}

/// Pure-Rust SafeTensors v1 archive reader (`[u64 le header_len][JSON header][contiguous data]`).
#[derive(Debug, Clone)]
pub struct SafeTensorsArchive<'a> {
    metadata: BTreeMap<String, String>,
    tensors: BTreeMap<String, SafeTensorView<'a>>,
}

impl<'a> SafeTensorsArchive<'a> {
    /// Parses and bounds-checks a SafeTensors v1 binary buffer without panicking.
    pub fn deserialize(bytes: &'a [u8]) -> Result<Self, NqsStlError> {
        if bytes.len() < 8 {
            return Err(NqsStlError::CheckpointFormatError {
                reason: "safetensors buffer shorter than 8-byte header length prefix".to_string(),
            });
        }
        let header_len_u64 = u64::from_le_bytes([
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        ]);
        let header_len =
            usize::try_from(header_len_u64).map_err(|_| NqsStlError::CheckpointFormatError {
                reason: "safetensors header length exceeds platform usize".to_string(),
            })?;
        if header_len == 0 || header_len > MAX_SAFETENSORS_HEADER_BYTES {
            return Err(NqsStlError::CheckpointFormatError {
                reason: format!("invalid safetensors header length {header_len}"),
            });
        }
        let data_start = 8usize
            .checked_add(header_len)
            .ok_or_else(|| NqsStlError::CheckpointFormatError {
                reason: "safetensors header offset overflow".to_string(),
            })?;
        if data_start > bytes.len() {
            return Err(NqsStlError::CheckpointFormatError {
                reason: format!(
                    "truncated safetensors header: declared {data_start} bytes, buffer has {}",
                    bytes.len()
                ),
            });
        }

        let header_bytes = &bytes[8..data_start];
        let header_str =
            std::str::from_utf8(header_bytes).map_err(|e| NqsStlError::CheckpointFormatError {
                reason: format!("safetensors header is not valid UTF-8: {e}"),
            })?;
        let header_obj: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(header_str).map_err(|e| NqsStlError::CheckpointFormatError {
                reason: format!("safetensors header JSON parse error: {e}"),
            })?;

        let data_buf = &bytes[data_start..];
        let mut metadata = BTreeMap::new();
        let mut tensors = BTreeMap::new();

        for (key, val) in header_obj {
            if key == "__metadata__" {
                if let Some(meta_map) = val.as_object() {
                    for (mk, mv) in meta_map {
                        if let Some(ms) = mv.as_str() {
                            metadata.insert(mk.clone(), ms.to_string());
                        } else {
                            metadata.insert(mk.clone(), mv.to_string());
                        }
                    }
                }
                continue;
            }

            let entry = val.as_object().ok_or_else(|| NqsStlError::CheckpointFormatError {
                reason: format!("tensor '{key}' header entry must be a JSON object"),
            })?;

            let dtype_str = entry
                .get("dtype")
                .and_then(|v| v.as_str())
                .ok_or_else(|| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' missing string 'dtype'"),
                })?;
            let dtype = SafeTensorDtype::from_tag(dtype_str);

            let shape_arr = entry
                .get("shape")
                .and_then(|v| v.as_array())
                .ok_or_else(|| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' missing array 'shape'"),
                })?;
            let mut shape = Vec::with_capacity(shape_arr.len());
            for dim_val in shape_arr {
                let d_u64 = dim_val.as_u64().ok_or_else(|| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' contains non-integer shape dimension"),
                })?;
                let d = usize::try_from(d_u64).map_err(|_| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' shape dimension exceeds usize"),
                })?;
                shape.push(d);
            }

            let offsets = entry
                .get("data_offsets")
                .and_then(|v| v.as_array())
                .ok_or_else(|| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' missing 'data_offsets'"),
                })?;
            if offsets.len() != 2 {
                return Err(NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' data_offsets must have 2 elements"),
                });
            }
            let start_u64 =
                offsets[0]
                    .as_u64()
                    .ok_or_else(|| NqsStlError::CheckpointFormatError {
                        reason: format!("tensor '{key}' data_offsets[0] is not a u64"),
                    })?;
            let end_u64 =
                offsets[1]
                    .as_u64()
                    .ok_or_else(|| NqsStlError::CheckpointFormatError {
                        reason: format!("tensor '{key}' data_offsets[1] is not a u64"),
                    })?;
            let start =
                usize::try_from(start_u64).map_err(|_| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' start offset exceeds usize"),
                })?;
            let end =
                usize::try_from(end_u64).map_err(|_| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' end offset exceeds usize"),
                })?;
            if start > end || end > data_buf.len() {
                return Err(NqsStlError::CheckpointFormatError {
                    reason: format!(
                        "tensor '{key}' data_offsets [{start}, {end}] out of bounds for buffer len {}",
                        data_buf.len()
                    ),
                });
            }

            let elem_count = shape.iter().copied().try_fold(1usize, |acc, d| {
                acc.checked_mul(d).ok_or_else(|| NqsStlError::CheckpointFormatError {
                    reason: format!("tensor '{key}' element count overflow"),
                })
            })?;
            if let Some(width) = dtype.byte_width() {
                let expected_bytes = elem_count.checked_mul(width).ok_or_else(|| {
                    NqsStlError::CheckpointFormatError {
                        reason: format!("tensor '{key}' byte size overflow"),
                    }
                })?;
                if end - start != expected_bytes {
                    return Err(NqsStlError::CheckpointFormatError {
                        reason: format!(
                            "tensor '{key}' byte span {} != expected {expected_bytes} for shape {shape:?} and dtype {dtype_str}",
                            end - start
                        ),
                    });
                }
            }

            let view = SafeTensorView {
                name: key.clone(),
                dtype,
                shape,
                data: &data_buf[start..end],
            };
            tensors.insert(key, view);
        }

        Ok(Self { metadata, tensors })
    }

    #[inline]
    pub fn metadata(&self) -> &BTreeMap<String, String> {
        &self.metadata
    }

    /// Looks up a tensor by exact name, returning `CheckpointMissingTensor` if absent.
    pub fn tensor(&self, name: &str) -> Result<&SafeTensorView<'a>, NqsStlError> {
        self.tensors
            .get(name)
            .ok_or_else(|| NqsStlError::CheckpointMissingTensor {
                tensor: name.to_string(),
            })
    }

    /// Looks up an optional tensor by name.
    #[inline]
    pub fn optional_tensor(&self, name: &str) -> Option<&SafeTensorView<'a>> {
        self.tensors.get(name)
    }

    pub fn tensor_names(&self) -> impl Iterator<Item = &str> {
        self.tensors.keys().map(String::as_str)
    }
}

/// Checkpoint deserialization backend identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CheckpointLoaderBackend {
    PureRustSafetensors,
    CandleCoreCpu,
}

/// Active backend for the current compile-time feature configuration.
#[inline]
pub const fn active_loader_backend() -> CheckpointLoaderBackend {
    if cfg!(feature = "candle-safetensors") {
        CheckpointLoaderBackend::CandleCoreCpu
    } else {
        CheckpointLoaderBackend::PureRustSafetensors
    }
}

/// Explicit provenance of the loaded Timestral weights.
/// Normative invariant (Issue #12): both `LoadedVerifiedSafeTensors` and `DeterministicStub`
/// preserve `ModelValidationStatus::IllustrativeUnvalidated` during runtime inference.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "origin_kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CheckpointOrigin {
    DeterministicStub {
        seed_hex: String,
        fallback_reason: String,
    },
    LoadedVerifiedSafeTensors {
        model_id: String,
        sha256_hex: String,
        backend: CheckpointLoaderBackend,
        parameter_count: usize,
    },
}

impl CheckpointOrigin {
    #[inline]
    pub fn is_verified_safetensors(&self) -> bool {
        matches!(self, Self::LoadedVerifiedSafeTensors { .. })
    }

    #[inline]
    pub fn is_deterministic_stub(&self) -> bool {
        matches!(self, Self::DeterministicStub { .. })
    }
}

fn default_true() -> bool {
    true
}

/// Single model artifact entry inside `assets/models/MANIFEST.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelArtifactEntry {
    pub model_id: String,
    pub file: String,
    #[serde(default)]
    pub artifact_kind: String,
    #[serde(default = "default_true")]
    pub bundled: bool,
    pub sha256: String,
    #[serde(default)]
    pub expected_config: Option<TimestralConfig>,
    #[serde(default)]
    pub validation_status: ModelValidationStatus,
    #[serde(default)]
    pub notes: Option<String>,
}

/// Immutable cryptographic registry for optional external model artifacts (`assets/models/MANIFEST.json`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelsManifest {
    pub schema_version: u32,
    pub evidence_boundary: String,
    pub artifacts: Vec<ModelArtifactEntry>,
}

/// Loaded Timestral backbone + quantile head paired with cryptographic origin metadata.
#[derive(Debug, Clone)]
pub struct LoadedTimestralBundle {
    pub backbone: TimestralBackbone,
    pub quantile_head: QuantileHead,
    pub origin: CheckpointOrigin,
    pub model_validation_status: ModelValidationStatus,
}

/// Computes the lowercase 64-character SHA-256 hex digest of an arbitrary byte slice.
pub fn compute_sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(64);
    for b in digest {
        use std::fmt::Write as _;
        let _ = write!(&mut hex, "{b:02x}");
    }
    hex
}

/// Decodes a `SafeTensorView` (`F64`, `F32`, `BF16`) into `Vec<f64>`, checking shape and finiteness.
pub fn decode_tensor_view_to_f64(
    tensor_name: &str,
    view: &SafeTensorView<'_>,
    expected_shape: &[usize],
) -> Result<Vec<f64>, NqsStlError> {
    if view.shape() != expected_shape {
        return Err(NqsStlError::CheckpointShapeMismatch {
            tensor: tensor_name.to_string(),
            expected: expected_shape.to_vec(),
            found: view.shape().to_vec(),
        });
    }
    let elem_count = expected_shape.iter().copied().try_fold(1usize, |acc, d| {
        acc.checked_mul(d).ok_or_else(|| NqsStlError::CheckpointFormatError {
            reason: format!("shape product overflow for tensor '{tensor_name}'"),
        })
    })?;
    let raw = view.data();
    let mut out = Vec::with_capacity(elem_count);

    match view.dtype() {
        SafeTensorDtype::F64 => {
            if raw.len() != elem_count * 8 {
                return Err(NqsStlError::CheckpointFormatError {
                    reason: format!("F64 byte length mismatch for '{tensor_name}'"),
                });
            }
            for &chunk in raw.as_chunks::<8>().0 {
                let val = f64::from_le_bytes(chunk);
                if !val.is_finite() {
                    return Err(NqsStlError::CheckpointNonFiniteWeight {
                        tensor: tensor_name.to_string(),
                    });
                }
                out.push(val);
            }
        }
        SafeTensorDtype::F32 => {
            if raw.len() != elem_count * 4 {
                return Err(NqsStlError::CheckpointFormatError {
                    reason: format!("F32 byte length mismatch for '{tensor_name}'"),
                });
            }
            for &chunk in raw.as_chunks::<4>().0 {
                let val = f64::from(f32::from_le_bytes(chunk));
                if !val.is_finite() {
                    return Err(NqsStlError::CheckpointNonFiniteWeight {
                        tensor: tensor_name.to_string(),
                    });
                }
                out.push(val);
            }
        }
        SafeTensorDtype::BF16 => {
            if raw.len() != elem_count * 2 {
                return Err(NqsStlError::CheckpointFormatError {
                    reason: format!("BF16 byte length mismatch for '{tensor_name}'"),
                });
            }
            for &chunk in raw.as_chunks::<2>().0 {
                let bits16 = u16::from_le_bytes(chunk);
                let val = f64::from(f32::from_bits(u32::from(bits16) << 16));
                if !val.is_finite() {
                    return Err(NqsStlError::CheckpointNonFiniteWeight {
                        tensor: tensor_name.to_string(),
                    });
                }
                out.push(val);
            }
        }
        SafeTensorDtype::Unsupported(tag) => {
            return Err(NqsStlError::CheckpointUnsupportedDtype {
                tensor: tensor_name.to_string(),
                dtype: tag.clone(),
            });
        }
    }

    if out.len() != elem_count {
        return Err(NqsStlError::DimensionMismatch {
            expected: elem_count,
            found: out.len(),
        });
    }
    Ok(out)
}

fn decode_required_linear(
    archive: &SafeTensorsArchive<'_>,
    weight_name: &str,
    bias_name: &str,
    in_dim: usize,
    out_dim: usize,
) -> Result<(LinearLayer, usize), NqsStlError> {
    let w_view = archive.tensor(weight_name)?;
    let b_view = archive.tensor(bias_name)?;
    let weights = decode_tensor_view_to_f64(weight_name, w_view, &[out_dim, in_dim])?;
    let bias = decode_tensor_view_to_f64(bias_name, b_view, &[out_dim])?;
    let count = weights.len() + bias.len();
    let layer = LinearLayer::from_loaded_weights(in_dim, out_dim, weights, bias)?;
    Ok((layer, count))
}

fn decode_required_rms_norm(
    archive: &SafeTensorsArchive<'_>,
    gamma_name: &str,
    dim: usize,
    eps: f64,
) -> Result<(RmsNorm, usize), NqsStlError> {
    let view = archive.tensor(gamma_name)?;
    let gamma = decode_tensor_view_to_f64(gamma_name, view, &[dim])?;
    let count = gamma.len();
    let norm = RmsNorm::from_loaded_weights(gamma, eps)?;
    Ok((norm, count))
}

/// Loads and cryptographically verifies `MANIFEST.json` + `<file>.safetensors` BEFORE parsing.
/// Always preserves `ModelValidationStatus::IllustrativeUnvalidated` on the returned bundle.
pub fn load_verified_timestral_checkpoint(
    models_dir: &Path,
    model_id: &str,
    expected_config: &TimestralConfig,
) -> Result<LoadedTimestralBundle, NqsStlError> {
    if !cfg!(feature = "safetensors-loader") {
        return Err(NqsStlError::CheckpointLoaderDisabled);
    }
    expected_config.validate()?;

    let manifest_path = models_dir.join("MANIFEST.json");
    let manifest_raw = std::fs::read_to_string(&manifest_path).map_err(|e| match e.kind() {
        ErrorKind::NotFound => NqsStlError::CheckpointMissing {
            path: manifest_path.display().to_string(),
        },
        _ => NqsStlError::CheckpointFormatError {
            reason: format!("failed reading {}: {e}", manifest_path.display()),
        },
    })?;
    let manifest: ModelsManifest =
        serde_json::from_str(&manifest_raw).map_err(|e| NqsStlError::CheckpointFormatError {
            reason: format!("invalid MANIFEST.json at {}: {e}", manifest_path.display()),
        })?;

    let entry = manifest
        .artifacts
        .iter()
        .find(|a| a.model_id == model_id)
        .ok_or_else(|| NqsStlError::CheckpointMissing {
            path: format!("{} (model_id='{model_id}')", manifest_path.display()),
        })?;

    let entry_cfg = entry
        .expected_config
        .as_ref()
        .ok_or_else(|| NqsStlError::CheckpointFormatError {
            reason: format!("manifest entry '{model_id}' is missing expected_config"),
        })?;
    if entry_cfg != expected_config {
        return Err(NqsStlError::InvalidConfig {
            reason: "manifest expected_config does not match requested TimestralConfig",
        });
    }

    let checkpoint_path = models_dir.join(&entry.file);
    let raw_bytes = std::fs::read(&checkpoint_path).map_err(|e| match e.kind() {
        ErrorKind::NotFound => NqsStlError::CheckpointMissing {
            path: checkpoint_path.display().to_string(),
        },
        _ => NqsStlError::CheckpointFormatError {
            reason: format!("failed reading {}: {e}", checkpoint_path.display()),
        },
    })?;

    // Defense-in-depth: verify SHA-256 over the raw bytes BEFORE interpreting the SafeTensors header.
    let computed_sha = compute_sha256_hex(&raw_bytes);
    let expected_sha = entry.sha256.trim().to_ascii_lowercase();
    if computed_sha != expected_sha {
        return Err(NqsStlError::CheckpointSha256Mismatch {
            model_id: model_id.to_string(),
            expected: expected_sha,
            computed: computed_sha,
        });
    }

    let archive = SafeTensorsArchive::deserialize(&raw_bytes)?;
    let d_model = expected_config.d_model;
    let d_ff = expected_config.d_ff;
    let patch_len = expected_config.patch_len;
    let num_channels = expected_config.num_channels;
    let eps = expected_config.rms_norm_eps;

    let mut parameter_count = 0usize;

    let (patch_embed, cnt) = decode_required_linear(
        &archive,
        "patch_embed.weight",
        "patch_embed.bias",
        2 * patch_len,
        d_model,
    )?;
    parameter_count += cnt;

    let mut blocks = Vec::with_capacity(expected_config.num_layers);
    for i in 0..expected_config.num_layers {
        let (norm_attn, c_na) =
            decode_required_rms_norm(&archive, &format!("blocks.{i}.norm_attn.gamma"), d_model, eps)?;
        parameter_count += c_na;

        let (w_q, c_q) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.attn.w_q.weight"),
            &format!("blocks.{i}.attn.w_q.bias"),
            d_model,
            d_model,
        )?;
        let (w_k, c_k) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.attn.w_k.weight"),
            &format!("blocks.{i}.attn.w_k.bias"),
            d_model,
            d_model,
        )?;
        let (w_v, c_v) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.attn.w_v.weight"),
            &format!("blocks.{i}.attn.w_v.bias"),
            d_model,
            d_model,
        )?;
        let (w_gate, c_g) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.attn.w_gate.weight"),
            &format!("blocks.{i}.attn.w_gate.bias"),
            d_model,
            d_model,
        )?;
        let (w_out, c_o) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.attn.w_out.weight"),
            &format!("blocks.{i}.attn.w_out.bias"),
            d_model,
            d_model,
        )?;
        parameter_count += c_q + c_k + c_v + c_g + c_o;

        let prior_name = format!("blocks.{i}.attn.variate_prior_bias");
        let variate_prior_bias = match archive.optional_tensor(&prior_name) {
            Some(view) => {
                let vals = decode_tensor_view_to_f64(
                    &prior_name,
                    view,
                    &[num_channels, num_channels],
                )?;
                parameter_count += vals.len();
                Some(vals)
            }
            None => None,
        };

        let attn = DualAxisAttention::from_loaded_weights(
            expected_config,
            expected_config.layer_kind(i),
            w_q,
            w_k,
            w_v,
            w_gate,
            w_out,
            variate_prior_bias,
        )?;

        let (norm_ffn, c_nf) =
            decode_required_rms_norm(&archive, &format!("blocks.{i}.norm_ffn.gamma"), d_model, eps)?;
        parameter_count += c_nf;

        let (ffn_gate, c_fg) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.ffn.w_gate.weight"),
            &format!("blocks.{i}.ffn.w_gate.bias"),
            d_model,
            d_ff,
        )?;
        let (ffn_up, c_fu) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.ffn.w_up.weight"),
            &format!("blocks.{i}.ffn.w_up.bias"),
            d_model,
            d_ff,
        )?;
        let (ffn_down, c_fd) = decode_required_linear(
            &archive,
            &format!("blocks.{i}.ffn.w_down.weight"),
            &format!("blocks.{i}.ffn.w_down.bias"),
            d_ff,
            d_model,
        )?;
        parameter_count += c_fg + c_fu + c_fd;

        let ffn = FusedSwiGlu::from_loaded_weights(d_model, d_ff, ffn_gate, ffn_up, ffn_down)?;
        blocks.push(TimestralBlockWeights {
            norm_attn,
            attn,
            norm_ffn,
            ffn,
        });
    }

    let (final_norm, c_fn) =
        decode_required_rms_norm(&archive, "final_norm.gamma", d_model, eps)?;
    parameter_count += c_fn;

    let proj_view = archive.tensor("quantile_head.proj_weights")?;
    let proj_weights =
        decode_tensor_view_to_f64("quantile_head.proj_weights", proj_view, &[28, d_model])?;
    parameter_count += proj_weights.len();

    let gamma_view = archive.tensor("quantile_head.spread_scale_gamma")?;
    let gamma_shape: &[usize] = if gamma_view.shape().is_empty() {
        &[]
    } else {
        &[1]
    };
    let gamma_vec = decode_tensor_view_to_f64(
        "quantile_head.spread_scale_gamma",
        gamma_view,
        gamma_shape,
    )?;
    let spread_scale_gamma =
        *gamma_vec
            .first()
            .ok_or_else(|| NqsStlError::CheckpointShapeMismatch {
                tensor: "quantile_head.spread_scale_gamma".to_string(),
                expected: vec![1],
                found: gamma_view.shape().to_vec(),
            })?;
    parameter_count += 1;

    let backbone =
        TimestralBackbone::from_loaded_weights(expected_config.clone(), patch_embed, blocks, final_norm)?;
    let quantile_head = QuantileHead::from_loaded_weights(d_model, spread_scale_gamma, proj_weights)?;

    Ok(LoadedTimestralBundle {
        backbone,
        quantile_head,
        origin: CheckpointOrigin::LoadedVerifiedSafeTensors {
            model_id: model_id.to_string(),
            sha256_hex: computed_sha,
            backend: active_loader_backend(),
            parameter_count,
        },
        // Normative Issue #12 guard: loading verified weights does NOT validate clinical predictions.
        model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    })
}

/// Fail-safe loader used by `AresTemporalForecasterEngine`: falls back cleanly to deterministic stub
/// weights without panicking if `models_dir` is `None`, the checkpoint is absent, or verification fails.
pub fn load_timestral_or_deterministic_fallback(
    config: TimestralConfig,
    models_dir: Option<&Path>,
    model_id: &str,
) -> Result<LoadedTimestralBundle, NqsStlError> {
    config.validate()?;
    if let Some(dir) = models_dir {
        match load_verified_timestral_checkpoint(dir, model_id, &config) {
            Ok(bundle) => return Ok(bundle),
            Err(err) => {
                let backbone = TimestralBackbone::new_deterministic(config.clone())?;
                let quantile_head = QuantileHead::new_deterministic(config.d_model, 1.0);
                return Ok(LoadedTimestralBundle {
                    backbone,
                    quantile_head,
                    origin: CheckpointOrigin::DeterministicStub {
                        seed_hex: DETERMINISTIC_STUB_SEED_HEX.to_string(),
                        fallback_reason: err.to_string(),
                    },
                    model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
                });
            }
        }
    }

    let backbone = TimestralBackbone::new_deterministic(config.clone())?;
    let quantile_head = QuantileHead::new_deterministic(config.d_model, 1.0);
    Ok(LoadedTimestralBundle {
        backbone,
        quantile_head,
        origin: CheckpointOrigin::DeterministicStub {
            seed_hex: DETERMINISTIC_STUB_SEED_HEX.to_string(),
            fallback_reason: "no checkpoint directory configured; deterministic initialization active"
                .to_string(),
        },
        model_validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    })
}

/// Encodes an `f64` slice into raw little-endian bytes for `F64`, `F32`, or `BF16`.
pub fn encode_f64_slice_as_dtype(
    values: &[f64],
    dtype: &SafeTensorDtype,
) -> Result<Vec<u8>, NqsStlError> {
    match dtype {
        SafeTensorDtype::F64 => {
            let mut buf = Vec::with_capacity(values.len() * 8);
            for &v in values {
                buf.extend_from_slice(&v.to_le_bytes());
            }
            Ok(buf)
        }
        SafeTensorDtype::F32 => {
            let mut buf = Vec::with_capacity(values.len() * 4);
            for &v in values {
                buf.extend_from_slice(&(v as f32).to_le_bytes());
            }
            Ok(buf)
        }
        SafeTensorDtype::BF16 => {
            let mut buf = Vec::with_capacity(values.len() * 2);
            for &v in values {
                let bits32 = (v as f32).to_bits();
                let bf16_bits = if (bits32 & 0x7FFF_FFFF) > 0x7F80_0000 {
                    // Preserve NaN payload cleanly in top 16 bits without overflow.
                    ((bits32 >> 16) as u16) | 0x0040
                } else {
                    let rounding_bias = 0x7FFF + ((bits32 >> 16) & 1);
                    (bits32.wrapping_add(rounding_bias) >> 16) as u16
                };
                buf.extend_from_slice(&bf16_bits.to_le_bytes());
            }
            Ok(buf)
        }
        SafeTensorDtype::Unsupported(tag) => Err(NqsStlError::CheckpointUnsupportedDtype {
            tensor: "<serializer>".to_string(),
            dtype: tag.clone(),
        }),
    }
}

/// Serializes `(name, dtype, shape, raw_bytes)` entries into a valid SafeTensors v1 byte buffer.
pub fn serialize_safetensors_v1(
    tensors: &[(&str, SafeTensorDtype, &[usize], &[u8])],
    metadata: Option<&BTreeMap<String, String>>,
) -> Result<Vec<u8>, NqsStlError> {
    let mut header_map = serde_json::Map::new();
    if let Some(meta) = metadata {
        let mut meta_obj = serde_json::Map::new();
        for (k, v) in meta {
            meta_obj.insert(k.clone(), serde_json::Value::String(v.clone()));
        }
        header_map.insert("__metadata__".to_string(), serde_json::Value::Object(meta_obj));
    }

    let mut data_buf = Vec::new();
    for (name, dtype, shape, raw) in tensors {
        let elem_count = shape.iter().copied().try_fold(1usize, |acc, d| {
            acc.checked_mul(d).ok_or_else(|| NqsStlError::CheckpointFormatError {
                reason: format!("shape overflow while serializing '{name}'"),
            })
        })?;
        if let Some(w) = dtype.byte_width()
            && raw.len() != elem_count * w
        {
            return Err(NqsStlError::DimensionMismatch {
                expected: elem_count * w,
                found: raw.len(),
            });
        }
        let start = data_buf.len();
        data_buf.extend_from_slice(raw);
        let end = data_buf.len();

        let mut entry = serde_json::Map::new();
        entry.insert(
            "dtype".to_string(),
            serde_json::Value::String(dtype.as_tag().to_string()),
        );
        entry.insert(
            "shape".to_string(),
            serde_json::Value::Array(
                shape
                    .iter()
                    .map(|&d| serde_json::Value::Number((d as u64).into()))
                    .collect(),
            ),
        );
        entry.insert(
            "data_offsets".to_string(),
            serde_json::Value::Array(vec![
                serde_json::Value::Number((start as u64).into()),
                serde_json::Value::Number((end as u64).into()),
            ]),
        );
        header_map.insert((*name).to_string(), serde_json::Value::Object(entry));
    }

    let header_json =
        serde_json::to_vec(&header_map).map_err(|e| NqsStlError::CheckpointFormatError {
            reason: format!("failed serializing safetensors header JSON: {e}"),
        })?;
    let header_len_u64 = u64::try_from(header_json.len()).map_err(|_| {
        NqsStlError::CheckpointFormatError {
            reason: "safetensors header length overflow".to_string(),
        }
    })?;

    let mut out = Vec::with_capacity(8 + header_json.len() + data_buf.len());
    out.extend_from_slice(&header_len_u64.to_le_bytes());
    out.extend_from_slice(&header_json);
    out.extend_from_slice(&data_buf);
    Ok(out)
}

/// Convenience helper for tests/tooling: serializes `(name, shape, values)` `f64` tensors
/// using the specified `SafeTensorDtype` (`F64`, `F32`, or `BF16`) into a SafeTensors v1 byte buffer.
pub fn serialize_f64_map_to_safetensors(
    tensors: &[(&str, &[usize], &[f64])],
    dtype: SafeTensorDtype,
    metadata: Option<&BTreeMap<String, String>>,
) -> Result<Vec<u8>, NqsStlError> {
    let mut encoded: Vec<(&str, SafeTensorDtype, &[usize], Vec<u8>)> =
        Vec::with_capacity(tensors.len());
    for (name, shape, values) in tensors {
        let elem_count = shape.iter().copied().try_fold(1usize, |acc, d| {
            acc.checked_mul(d).ok_or_else(|| NqsStlError::CheckpointFormatError {
                reason: format!("shape overflow for '{name}'"),
            })
        })?;
        if values.len() != elem_count {
            return Err(NqsStlError::DimensionMismatch {
                expected: elem_count,
                found: values.len(),
            });
        }
        let bytes = encode_f64_slice_as_dtype(values, &dtype)?;
        encoded.push((name, dtype.clone(), shape, bytes));
    }

    let refs: Vec<(&str, SafeTensorDtype, &[usize], &[u8])> = encoded
        .iter()
        .map(|(n, d, s, b)| (*n, d.clone(), *s, b.as_slice()))
        .collect();
    serialize_safetensors_v1(&refs, metadata)
}

/// Emits a complete, valid Timestral checkpoint byte buffer in the requested `SafeTensorDtype`
/// from an existing `TimestralConfig` (useful for unit/integration tests and artifact staging).
pub fn serialize_deterministic_timestral_checkpoint(
    config: &TimestralConfig,
    dtype: SafeTensorDtype,
    spread_scale_gamma: f64,
) -> Result<Vec<u8>, NqsStlError> {
    config.validate()?;
    if !spread_scale_gamma.is_finite() || spread_scale_gamma < 1e-4 {
        return Err(NqsStlError::InvalidConfig {
            reason: "spread_scale_gamma must be finite and >= 1e-4",
        });
    }

    let d_model = config.d_model;
    let d_ff = config.d_ff;
    let two_p = 2 * config.patch_len;
    let c = config.num_channels;

    let mut owned_tensors: Vec<(String, Vec<usize>, Vec<f64>)> = Vec::new();
    let deterministic_vec = |len: usize, seed_offset: usize| -> Vec<f64> {
        (0..len)
            .map(|k| (((k + seed_offset) as f64) * 0.13).sin() * 0.05)
            .collect()
    };

    owned_tensors.push((
        "patch_embed.weight".to_string(),
        vec![d_model, two_p],
        deterministic_vec(d_model * two_p, 1),
    ));
    owned_tensors.push((
        "patch_embed.bias".to_string(),
        vec![d_model],
        vec![0.0; d_model],
    ));

    for i in 0..config.num_layers {
        let base = (i + 1) * 100;
        owned_tensors.push((
            format!("blocks.{i}.norm_attn.gamma"),
            vec![d_model],
            vec![1.0; d_model],
        ));
        for (idx, suffix) in ["w_q", "w_k", "w_v", "w_gate", "w_out"].iter().enumerate() {
            owned_tensors.push((
                format!("blocks.{i}.attn.{suffix}.weight"),
                vec![d_model, d_model],
                deterministic_vec(d_model * d_model, base + idx * 17),
            ));
            owned_tensors.push((
                format!("blocks.{i}.attn.{suffix}.bias"),
                vec![d_model],
                vec![0.0; d_model],
            ));
        }
        let mut prior = vec![0.0; c * c];
        for diag in 0..c {
            prior[diag * c + diag] = 0.5;
        }
        owned_tensors.push((
            format!("blocks.{i}.attn.variate_prior_bias"),
            vec![c, c],
            prior,
        ));
        owned_tensors.push((
            format!("blocks.{i}.norm_ffn.gamma"),
            vec![d_model],
            vec![1.0; d_model],
        ));
        owned_tensors.push((
            format!("blocks.{i}.ffn.w_gate.weight"),
            vec![d_ff, d_model],
            deterministic_vec(d_ff * d_model, base + 71),
        ));
        owned_tensors.push((
            format!("blocks.{i}.ffn.w_gate.bias"),
            vec![d_ff],
            vec![0.0; d_ff],
        ));
        owned_tensors.push((
            format!("blocks.{i}.ffn.w_up.weight"),
            vec![d_ff, d_model],
            deterministic_vec(d_ff * d_model, base + 83),
        ));
        owned_tensors.push((
            format!("blocks.{i}.ffn.w_up.bias"),
            vec![d_ff],
            vec![0.0; d_ff],
        ));
        owned_tensors.push((
            format!("blocks.{i}.ffn.w_down.weight"),
            vec![d_model, d_ff],
            deterministic_vec(d_model * d_ff, base + 97),
        ));
        owned_tensors.push((
            format!("blocks.{i}.ffn.w_down.bias"),
            vec![d_model],
            vec![0.0; d_model],
        ));
    }

    owned_tensors.push(("final_norm.gamma".to_string(), vec![d_model], vec![1.0; d_model]));
    owned_tensors.push((
        "quantile_head.proj_weights".to_string(),
        vec![28, d_model],
        deterministic_vec(28 * d_model, 999),
    ));
    owned_tensors.push((
        "quantile_head.spread_scale_gamma".to_string(),
        vec![1],
        vec![spread_scale_gamma],
    ));

    let refs: Vec<(&str, &[usize], &[f64])> = owned_tensors
        .iter()
        .map(|(n, s, v)| (n.as_str(), s.as_slice(), v.as_slice()))
        .collect();
    let mut meta = BTreeMap::new();
    meta.insert("format".to_string(), "ares-timestral-safetensors-v1".to_string());
    meta.insert(
        "validation_status".to_string(),
        "ILLUSTRATIVE_UNVALIDATED".to_string(),
    );
    serialize_f64_map_to_safetensors(&refs, dtype, Some(&meta))
}
