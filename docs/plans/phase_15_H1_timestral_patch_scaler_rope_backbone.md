# Piano Implementativo Definitivo — Fase 15 (H1): Pure-Rust Timestral Backbone (`CausalScaler` `asinh`, `PatchRepresentation` Missing-Channel Mask, `RMSNorm`, `FusedSwiGLU`, `SinCosRoPE` & `DualAxisAttention`)

- **Blocco Architetturale**: Blocco H (*Motore Rust Core: Previsione Probabilistica Multi-Orizzonte Ibrida Grey-Box `Timestral` + `NQS-STL` — `2. EVALUATE` Parte 3*, Fasi 15–17)
- **Fase**: Fase 15 (`H1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-nqs-stl`](../../crates/ares-nqs-stl/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid`
- **File Target Previsti**:
  1. `crates/ares-nqs-stl/src/timestral_backbone.rs` *(NEW)*
  2. `crates/ares-nqs-stl/src/lib.rs` *(UPDATE)*
- **Budget Latenza**:
  - **Estrazione Patch ZOH + `CausalScaler` (`asinh`)**: $< 95\,\mu\text{s}$
  - **Forward Pass `Timestral-5M` Backbone (`1 Hz` Background Worker)**: $< 6.5\text{ ms}$ su CPU / $< 2.0\text{ ms}$ su Apple Silicon Metal (`0 ns` di blocco sul tick sincrono a `20 Hz`)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, gestione errori tipizzata con `thiserror`, preservazione rigorosa della maschera `Option<f64>::None` per i 13 campioni mancanti in `bidmc_01_Numerics.csv` (**Invariante `Entry 006`**).

---

## 1. Executive Summary & Scientific Grounding (`deep-scholar`)

### 1.1 Visione Architetturale: Modellazione Stocastica Cardiorespiratoria Zero-Python
Mentre le equazioni differenziali ordinarie (ODE RK4 di Frost-Hargens per la Sclerostina `SOST` e la fluidodinamica di Poiseuille-Womersley per lo shear stress giugulare $\tau_w(t)$) governano in modo deterministico le leggi di conservazione biofisica su scala multi-giornaliera, la telemetria cardiorespiratoria reale a `1 Hz` (`BIDMC v1.0.0`: `HR`, `PULSE`, `RESP`, `SpO2`, `RMSSD`, `SDNN`, `LF/HF`) presenta accoppiamenti stocastici non lineari (aritmia sinusal-respiratoria, baroriflesso vagale), code pesanti eteroschedastiche e **canali sensore fisicamente mancanti** (`Option<f64>::None`, come le 13 righe prive di `PULSE` e `SpO2` in `bidmc_01_Numerics.csv`).

La **Fase 15 (`H1`)** porta in `crates/ares-nqs-stl/src/timestral_backbone.rs` gli operatori fondamentali del backbone **Timestral** (*Mistral AI, Ottobre 2026*), gia ingegnerizzati e validati in puro Rust nel repository madre `spatiotemporal-mcp-engine-backup/crates/temporal-forecaster` (**Fase 59 — Issue #117**):
1. **`CircularTelemetryBuffer<R, CAP>` & `PatchRepresentation` Missing-Aware:** Ring-buffer preallocato in-memory ($O(1)$ push a zero allocazioni heap) e discretizzazione **Zero-Order Hold (ZOH)** con codifica duale esplicita `[scaled_values, missing_flags]` di dimensione $(R, N_{\text{enc}}, 2P)$, evitando qualsiasi imputazione allucinatoria di falsi zeri sui canali `None`.
2. **`CausalScaler` con Compressione $\operatorname{asinh}$:** Normalizzazione causale patch-by-patch ($\mu_p, \sigma_p$) calcolata esclusivamente sui campioni osservati ($m_{r,t} = 1$) per eliminare ogni *future data leakage*, seguita dalla trasformazione $\operatorname{asinh}(z) = \ln(z + \sqrt{z^2 + 1})$ che stabilizza gli spike da artefatto motorio o tempesta solare (`SPE`).
3. **Operatori Transformer in Puro Rust (`RMSNorm`, `FusedSwiGLU`, `SinCosRoPE`, `DualAxisAttention`):** Pre-normalizzazione Root Mean Square ($\epsilon = 10^{-6}$), feed-forward SwiGLU fuso, Partial Rotary Position Embeddings (fattore di rotazione $0.5$ della dimensione di testa $d_h$) sull'asse temporale, e attenzione fattorizzata **Tempo-Variabile (`DualAxisAttention`)** con gate moltiplicativo `SdpaSigmoid` ($\mathbf{o} \odot \sigma(\mathbf{W}_g \mathbf{x})$).

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Mistral AI (Ottobre 2026):**
   * *Titolo:* *"Timestral: Time-Series Foundation Models for Multivariate Probabilistic Forecasting with Decoupled Horizon and Monotone Quantiles"*, Mistral AI Technical Report (`mistralai/timestral-5m`, `timestral-28m`).
2. **Y. Nie, H. Wu, C.-C. J. Kuo (2025):**
   * *Titolo:* *"Missing-Aware Patching and Non-Hallucinatory Representation Learning for Irregular Multivariate Time Series"*, Research Square | **DOI:** `10.21203/rs.3.rs-6198987/v1`.
3. **Jianlin Su et al. (2024):**
   * *Titolo:* *"RoFormer: Enhanced Transformer with Rotary Position Embedding"*, *Neurocomputing*, Vol. 568, Art. 127063 | **DOI:** `10.1016/j.neucom.2023.127063`.
4. **Noam Shazeer (2020) & Biao Zhang, Rico Sennrich (2019):**
   * *Titoli:* *"GLU Variants Improve Transformer"* (`arXiv:2002.05202`, `SwiGLU`) & *"Root Mean Square Layer Normalization"* (*NeurIPS 2019*, `arXiv:1910.07467`, `RMSNorm`).

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

### 2.1 Decisioni Ingegneristiche Chiave
- **Codifica Esplicita dei Dati Mancanti (`[values, missing]`):** Invece di sostituire `Option<f64>::None` con `0.0` (che verrebbe interpretato come arresto cardiaco o ipossia estrema `SpO2 = 0%`), il `PatchingPreprocessor` propaga l'ultimo valore valido (*Zero-Order Hold*) solo per la continuita numerica del filtro e imposta il flag binario `missing = 1.0` nel secondo canale della patch, azzerando il contributo dei punti mancanti nella stima di $\mu_p$ e $\sigma_p$.
- **Complessita Fattorizzata $\mathcal{O}(R \cdot N^2 + N \cdot R^2)$ (`DualAxisAttention`):** Su $R = 12$ canali fisiologici (`HR`, `PULSE`, `RESP`, `SpO2`, `RMSSD`, `SDNN`, `LF_HF`, `tau_w`, `ARED`, `SOST`, `SANS`, `rho_global`) e $N$ patch temporali, l'alternanza tra *Time Self-Attention* su $(R, N, d_{\text{model}})$ e *Variate Cross-Channel Attention* su $(N, R, d_{\text{model}})$ ogni 4 blocchi cattura l'accoppiamento cross-organo (es. `RMSSD` vagale $\leftrightarrow$ `RESP` $\leftrightarrow$ $\tau_w$ giugulare) senza l'esplosione quadratica $\mathcal{O}((R \cdot N)^2)$.
- **Zero Dipendenze Python / C++ Esterne:** Tutti gli operatori sono implementati in puro Rust deterministico e verificabile, garantendo esecuzione *air-gapped* a bordo del veicolo spaziale.

### 2.2 Tabella File e Moduli Rust

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 15 (`H1`) |
| :--- | :--- | :--- |
| `crates/ares-nqs-stl/src/timestral_backbone.rs` | **CREATE** | Implementa `TimestralConfig`, `CircularTelemetryBuffer`, `CausalScaler` (`asinh`/`sinh`), `PatchRepresentation`, `RMSNorm`, `FusedSwiGLU`, `SinCosRoPE` e `DualAxisAttention` con `SdpaSigmoid`. |
| `crates/ares-nqs-stl/src/lib.rs` | **UPDATE** | Esporta il modulo `pub mod timestral_backbone;` e i tipi principali del backbone multivariato. |

---

## 3. Formulazione Matematica

### 3.1 Normalizzazione Causale Mascherata e Compressione $\operatorname{asinh}$ (`CausalScaler`)
Sia $\mathbf{X}_p \in \mathbb{R}^{R \times P}$ la $p$-esima patch temporale di lunghezza $P = 32$ campioni per gli $R = 12$ canali, e sia $\mathbf{M}_p \in \{0, 1\}^{R \times P}$ la maschera di osservabilita ($M_{r,t} = 1$ se il canale $r$ al passo $t$ e `Some(v)`, $0$ se `None`). Per ogni canale $r \in \{0, \dots, R-1\}$:

1. **Conteggio e Media Causale sui Soli Campioni Osservati:**
   $$n_{r,p} = \max\!\left(1, \sum_{t=1}^{P} M_{r,t}\right), \qquad \mu_{r,p} = \frac{1}{n_{r,p}} \sum_{t=1}^{P} M_{r,t} \, X_{r,t}$$

2. **Deviazione Standard Causale con Pavimento Numerico $\sigma_{\min} = 10^{-4}$:**
   $$\sigma_{r,p} = \max\!\left(\sigma_{\min}, \sqrt{\frac{1}{n_{r,p}} \sum_{t=1}^{P} M_{r,t} \left(X_{r,t} - \mu_{r,p}\right)^2}\right)$$

3. **Trasformazione $\operatorname{asinh}$ a Code Pesanti e Inversa $\operatorname{sinh}$:**
   $$\tilde{X}_{r,t} = M_{r,t} \cdot \operatorname{asinh}\!\left(\frac{X_{r,t} - \mu_{r,p}}{\sigma_{r,p}}\right) = M_{r,t} \cdot \ln\!\left(z_{r,t} + \sqrt{z_{r,t}^2 + 1}\right), \quad \text{con } z_{r,t} = \frac{X_{r,t} - \mu_{r,p}}{\sigma_{r,p}}$$
   La denormalizzazione sui quantili predetti usa l'inversa strettamente monotona crescente:
   $$\hat{X}_{r,t} = \mu_{r,\text{last}} + \sigma_{r,\text{last}} \cdot \sinh(\hat{y}_{r,t})$$

### 3.2 Pre-Normalizzazione `RMSNorm`, `FusedSwiGLU`, `Partial SinCosRoPE` e `DualAxisAttention`
1. **Root Mean Square Layer Normalization (`RMSNorm`):**
   $$\operatorname{RMSNorm}(\mathbf{h}) = \frac{\mathbf{h}}{\sqrt{\frac{1}{D}\sum_{i=1}^{D} h_i^2 + \epsilon}} \odot \boldsymbol{\gamma}, \qquad \epsilon = 10^{-6}$$
2. **Feed-Forward `FusedSwiGLU`:**
   $$\operatorname{SwiGLU}(\mathbf{x}) = \mathbf{W}_{\text{down}} \Big(\operatorname{SiLU}(\mathbf{W}_{\text{gate}}\mathbf{x}) \odot (\mathbf{W}_{\text{up}}\mathbf{x})\Big), \qquad \operatorname{SiLU}(z) = \frac{z}{1 + e^{-z}}$$
3. **Partial Rotary Position Embeddings (`SinCosRoPE`):**
   Applicata alla prima meta delle dimensioni di testa ($d_{\text{rope}} = d_h / 2$, $\theta_k = 10000^{-2k / d_{\text{rope}}}$) per la posizione di patch $p$:
   $$\begin{pmatrix} q'_{2k} \\ q'_{2k+1} \end{pmatrix} = \begin{pmatrix} \cos(p\theta_k) & -\sin(p\theta_k) \\ \sin(p\theta_k) & \cos(p\theta_k) \end{pmatrix} \begin{pmatrix} q_{2k} \\ q_{2k+1} \end{pmatrix}$$
4. **Dual-Axis Attention con Gate `SdpaSigmoid`:**
   $$\mathbf{A}_{\text{time}} = \operatorname{Softmax}\!\left(\frac{\mathbf{Q}_t \mathbf{K}_t^\top}{\sqrt{d_h}} + \mathbf{M}_{\text{causal}}\right)\mathbf{V}_t, \qquad \mathbf{O} = \mathbf{W}_o \Big(\mathbf{A} \odot \sigma(\mathbf{W}_{\text{gate}}\mathbf{X})\Big)$$

---

## 4. Concrete Rust Signatures & Data Structures (`crates/ares-nqs-stl/src/timestral_backbone.rs`)

```rust
//! Fase 15 (H1): Pure-Rust Timestral Backbone per ARES-Health.
//! Implementa CausalScaler (asinh/sinh), PatchRepresentation con maschera Option<f64>,
//! RMSNorm, FusedSwiGLU, Partial SinCosRoPE e DualAxisAttention con SdpaSigmoid.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Numero di canali fisiologici multivariati tracciati dal co-processore Timestral:
/// [HR, PULSE, RESP, SpO2, RMSSD, SDNN, LF_HF, tau_w, ARED, SOST, SANS, rho_global].
pub const ARES_TIMESTRAL_CHANNELS: usize = 12;

/// Dimensione standard di una patch temporale (32 campioni a 1 Hz = 32 secondi).
pub const DEFAULT_PATCH_LEN: usize = 32;

/// Errori tipizzati del backbone Timestral (Zero .unwrap() / Zero .expect()).
#[derive(Debug, Error, Clone, PartialEq)]
pub enum TimestralBackboneError {
    #[error("invalid Timestral configuration: {reason}")]
    InvalidConfig { reason: &'static str },
    #[error("dimension mismatch: expected {expected}, found {found}")]
    DimensionMismatch { expected: usize, found: usize },
    #[error("insufficient patches in circular buffer: minimum 1 patch required")]
    EmptyPatchWindow,
}

/// Tipo di blocco nel backbone: solo attenzione temporale o attenzione duale tempo + variabile.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayerKind {
    TimeOnly,
    TimeVariate,
}

/// Configurazione architetturale di Timestral-5M adattata per ARES-Health.
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
            d_model: 64,
            n_heads: 4,
            d_ff: 192,
            num_layers: 4,
            rope_fraction: 0.5,
            rope_theta: 10_000.0,
            rms_norm_eps: 1e-6,
            sigma_floor: 1e-4,
        }
    }
}

impl TimestralConfig {
    /// Valida gli invarianti dimensionali senza panici.
    pub fn validate(&self) -> Result<(), TimestralBackboneError> {
        if self.num_channels == 0 || self.patch_len == 0 {
            return Err(TimestralBackboneError::InvalidConfig {
                reason: "num_channels and patch_len must be > 0",
            });
        }
        if self.d_model == 0 || self.n_heads == 0 || self.d_model % self.n_heads != 0 {
            return Err(TimestralBackboneError::InvalidConfig {
                reason: "d_model must be a positive multiple of n_heads",
            });
        }
        let head_dim = self.d_model / self.n_heads;
        let rope_dim = ((head_dim as f64) * self.rope_fraction).round() as usize;
        if rope_dim % 2 != 0 {
            return Err(TimestralBackboneError::InvalidConfig {
                reason: "rope_dim must be even for SinCosRoPE rotation pairs",
            });
        }
        Ok(())
    }

    #[inline]
    pub fn layer_kind(&self, layer_idx: usize) -> LayerKind {
        if (layer_idx + 1) % 2 == 0 {
            LayerKind::TimeVariate
        } else {
            LayerKind::TimeOnly
        }
    }
}

/// Statistiche causali per canale estratte dall'ultima patch osservata.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ChannelCausalStats {
    pub mean: f64,
    pub sigma: f64,
    pub observed_ratio: f64,
}

/// Scaler causale patch-by-patch con compressione non lineare asinh e denormalizzazione sinh.
#[derive(Debug, Clone, Copy, Default)]
pub struct CausalScaler {
    pub sigma_floor: f64,
}

impl CausalScaler {
    pub fn new(sigma_floor: f64) -> Self {
        Self {
            sigma_floor: sigma_floor.max(1e-6),
        }
    }

    /// Normalizza una patch di un singolo canale usando esclusivamente i punti osservati (Some),
    /// restituendo i valori scalati con asinh(z), la maschera missing (1.0 = mancante, 0.0 = osservato)
    /// e le statistiche causali (mean, sigma, observed_ratio).
    pub fn scale_patch_channel(
        &self,
        raw_samples: &[Option<f64>],
    ) -> (Vec<f64>, Vec<f64>, ChannelCausalStats) {
        let mut sum = 0.0;
        let mut count = 0usize;
        for sample in raw_samples.iter().copied().flatten() {
            if sample.is_finite() {
                sum += sample;
                count += 1;
            }
        }

        let n_obs = count.max(1) as f64;
        let mean = if count > 0 { sum / n_obs } else { 0.0 };

        let mut var_sum = 0.0;
        for sample in raw_samples.iter().copied().flatten() {
            if sample.is_finite() {
                let diff = sample - mean;
                var_sum += diff * diff;
            }
        }
        let sigma = (var_sum / n_obs).sqrt().max(self.sigma_floor);
        let observed_ratio = if raw_samples.is_empty() {
            0.0
        } else {
            (count as f64) / (raw_samples.len() as f64)
        };

        let mut scaled_values = Vec::with_capacity(raw_samples.len());
        let mut missing_mask = Vec::with_capacity(raw_samples.len());

        for opt in raw_samples {
            match opt {
                Some(v) if v.is_finite() => {
                    let z = (*v - mean) / sigma;
                    scaled_values.push(z.asinh());
                    missing_mask.push(0.0);
                }
                _ => {
                    // Nessuna imputazione fittizia nello spazio normalizzato:
                    // z = 0.0 (pari alla media causale) + flag esplicito missing = 1.0
                    scaled_values.push(0.0);
                    missing_mask.push(1.0);
                }
            }
        }

        (
            scaled_values,
            missing_mask,
            ChannelCausalStats {
                mean,
                sigma,
                observed_ratio,
            },
        )
    }

    /// Denormalizza un valore predetto nello spazio latente asinh riportandolo alle unita fisiche originali.
    #[inline]
    pub fn denormalize_value(&self, latent_val: f64, stats: ChannelCausalStats) -> f64 {
        stats.mean + stats.sigma.max(self.sigma_floor) * latent_val.sinh()
    }
}

/// Rappresentazione di una patch multivariata [scaled_values, missing_mask] di dimensione 2 * P per canale.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PatchRepresentation {
    pub patch_len: usize,
    /// Per ogni canale r: concatenazione [scaled_0..scaled_{P-1}, missing_0..missing_{P-1}] (lunghezza 2*P).
    pub dual_features_per_channel: Vec<Vec<f64>>,
    /// Statistiche causali per ciascuno dei canali.
    pub channel_stats: Vec<ChannelCausalStats>,
}

impl PatchRepresentation {
    pub fn from_multivariate_window(
        channels: &[Vec<Option<f64>>],
        patch_len: usize,
        scaler: &CausalScaler,
    ) -> Result<Self, TimestralBackboneError> {
        if channels.is_empty() || patch_len == 0 {
            return Err(TimestralBackboneError::EmptyPatchWindow);
        }
        let mut dual_features_per_channel = Vec::with_capacity(channels.len());
        let mut channel_stats = Vec::with_capacity(channels.len());

        for ch in channels {
            if ch.len() != patch_len {
                return Err(TimestralBackboneError::DimensionMismatch {
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
}

/// Pre-normalizzazione Root Mean Square (RMSNorm).
#[inline]
pub fn rms_norm(x: &[f64], gamma: &[f64], eps: f64) -> Result<Vec<f64>, TimestralBackboneError> {
    if x.len() != gamma.len() || x.is_empty() {
        return Err(TimestralBackboneError::DimensionMismatch {
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

/// Attivazione FusedSwiGLU: SiLU(gate) * up.
#[inline]
pub fn fused_swiglu(gate: &[f64], up: &[f64]) -> Result<Vec<f64>, TimestralBackboneError> {
    if gate.len() != up.len() {
        return Err(TimestralBackboneError::DimensionMismatch {
            expected: gate.len(),
            found: up.len(),
        });
    }
    Ok(gate
        .iter()
        .zip(up.iter())
        .map(|(&g, &u)| {
            let silu = g / (1.0 + (-g).exp());
            silu * u
        })
        .collect())
}

/// Applica Partial SinCosRoPE in-place sui primi `rope_dim` elementi di un vettore di testa.
pub fn apply_partial_sincos_rope(
    head_vec: &mut [f64],
    pos_idx: usize,
    rope_dim: usize,
    theta: f64,
) -> Result<(), TimestralBackboneError> {
    if rope_dim > head_vec.len() || rope_dim % 2 != 0 {
        return Err(TimestralBackboneError::DimensionMismatch {
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

/// Operatore DualAxisAttention con gate d'uscita SdpaSigmoid: out = attn * sigmoid(gate).
pub fn dual_axis_sdpa_sigmoid_gate(
    attn_out: &[f64],
    gate_logits: &[f64],
) -> Result<Vec<f64>, TimestralBackboneError> {
    if attn_out.len() != gate_logits.len() {
        return Err(TimestralBackboneError::DimensionMismatch {
            expected: attn_out.len(),
            found: gate_logits.len(),
        });
    }
    Ok(attn_out
        .iter()
        .zip(gate_logits.iter())
        .map(|(&a, &g)| {
            let sig = 1.0 / (1.0 + (-g).exp());
            a * sig
        })
        .collect())
}
```

---

## 5. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Creare `crates/ares-nqs-stl/src/timestral_backbone.rs` implementando `TimestralConfig`, `TimestralBackboneError`, `ChannelCausalStats` e `CausalScaler` (`scale_patch_channel` con `asinh` e `denormalize_value` con `sinh`).
- [ ] **Step 2:** Implementare `PatchRepresentation::from_multivariate_window` con codifica duale `[scaled_values, missing_mask]` di dimensione $2P$ per ogni canale, preservando `Option<f64>::None` senza imputare falsi zeri prima della statistica causale.
- [ ] **Step 3:** Implementare gli operatori numerici zero-panic `rms_norm`, `fused_swiglu`, `apply_partial_sincos_rope` e `dual_axis_sdpa_sigmoid_gate`.
- [ ] **Step 4:** Esportare `pub mod timestral_backbone;` in `crates/ares-nqs-stl/src/lib.rs` ed eseguire `cargo test -p ares-nqs-stl` e `cargo clippy -p ares-nqs-stl --all-targets -- -D warnings`.

---

## 6. Deterministic Verification & Unit Tests

1. **`test_causal_scaler_asinh_sinh_roundtrip_and_missing_mask`:**
   - Alimenta `CausalScaler::scale_patch_channel` con una finestra di 32 campioni contenente 13 `None` (simulando i gap di `bidmc_01_Numerics.csv`).
   - Verifica che `missing_mask` contenga esattamente 13 valori pari a `1.0` e 19 valori pari a `0.0`, che `stats.mean` e `stats.sigma` siano calcolati esclusivamente sui 19 valori `Some`, e che `denormalize_value(scaled[i], stats)` ricostruisca ogni campione osservato con errore $< 10^{-12}$.
2. **`test_partial_sincos_rope_preserves_l2_norm`:**
   - Verifica che la rotazione `apply_partial_sincos_rope` su un vettore di testa $d_h = 16$ con `rope_dim = 8` lasci invariata la norma Euclidea $\|\mathbf{q}'\|_2 = \|\mathbf{q}\|_2$ a meno di $10^{-12}$ e lasci intatte le coordinate $[8..16]$.
3. **`test_rmsnorm_and_swiglu_zero_panic_on_dimension_mismatch`:**
   - Verifica che input di lunghezza discorde restituiscano `Err(TimestralBackboneError::DimensionMismatch { .. })` senza alcun panic.
