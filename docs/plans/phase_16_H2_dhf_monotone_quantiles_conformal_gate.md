# Piano Implementativo Definitivo — Fase 16 (H2): Direct Multi-Horizon Forecasting (DHF) Non-Crossing Monotone `QuantileHead` ($q_{0.05} \le q_{0.50} \le q_{0.95}$) & Adaptive `ConformalAbstentionGate`

- **Blocco Architetturale**: Blocco H (*Motore Rust Core: Previsione Probabilistica Multi-Orizzonte Ibrida Grey-Box `Timestral` + `NQS-STL` — `2. EVALUATE` Parte 3*, Fasi 15–17)
- **Fase**: Fase 16 (`H2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-nqs-stl`](../../crates/ares-nqs-stl/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid`
- **File Target Previsti**:
  1. `crates/ares-nqs-stl/src/quantile_cone.rs` *(NEW)*
  2. `crates/ares-nqs-stl/src/lib.rs` *(UPDATE)*
- **Budget Latenza**:
  - **Proiezione Quantilica Triangolare Monotona + Gate Conforme**: $< 15\,\mu\text{s}$ per tutti i canali e passi dell'orizzonte predittivo
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, garanzia algebrica *zero quantile crossing* ($q_{0.05} \le q_{0.50} \le q_{0.95}$) su ogni passo dell'orizzonte (**Invariante `EXP-053`**).

---

## 1. Executive Summary & Scientific Grounding (`deep-scholar`)

### 1.1 Visione Architetturale: Zero Quantile Crossing e Astensione Clinica Conforme
Nei sistemi di supporto alle decisioni cliniche per missioni *Exploration Class* (`NASA-STD-3001 Vol. 1 & Vol. 2`), due difetti dei modelli predittivi standard sono inaccettabili:
1. **Quantile Crossing ($\hat{q}_{0.05} > \hat{q}_{0.50}$ o $\hat{q}_{0.50} > \hat{q}_{0.95}$):** La regressione quantilica indipendente con *Pinball Loss* può produrre intervalli di confidenza invertiti durante transitori rapidi, invalidando il calcolo del rischio al 5° percentile.
2. **Overconfidence su Segnali Degradati:** Quando l'indice di qualità del segnale scende sotto la soglia (`SQI < 0.70`), oppure oltre il $40\%$ dei campioni nella finestra è mancante (`missing_channels`), un modello neurale non dovrebbe mai emettere previsioni spacciate per certe.

La **Fase 16 (`H2`)** implementa in `crates/ares-nqs-stl/src/quantile_cone.rs`:
1. **`DirectHorizonForecaster (DHF)` & `MonotoneQuantileHead`:** Predice direttamente l'intero orizzonte multi-step senza rollout autoregressivo (eliminando l'accumulo esponenziale dell'errore) e applica la **proiezione cumulativa triangolare con incrementi $\operatorname{softplus}$ strettamente positivi** ($\delta_i = \gamma \cdot \Delta\tau_i \cdot \ln(1 + e^{z_i}) > 0$), garantendo per costruzione algebrica:
   $$\hat{q}_{\tau_0} < \hat{q}_{\tau_1} < \dots < \hat{q}_{0.05} \le \hat{q}_{0.50} \le \hat{q}_{0.95} < \dots < \hat{q}_{\tau_{K-1}}$$
2. **`ConformalAbstentionGate` Adattivo:** Valuta in tempo reale la qualità del contesto (`sqi_score >= 0.70`, `missing_ratio <= 0.40`) e l'ampiezza inter-quantilica normalizzata ($q_{0.95} - q_{0.05} \le \theta_{\max}$). Se il gate rileva incertezza epistemica eccessiva, commuta lo stato su `ForecastConfidenceState::AbstainedFallbackDeterministic`, forzando il sistema sul fallback deterministico conservativo (`ODE RK4 + EWMA-OLS`).

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Jan Gasthaus, Konstantinos Benidis, Yuyang Wang et al. (AISTATS 2019):**
   * *Titolo:* *"Probabilistic Forecasting with Spline Quantile Function RNNs (Monotone Quantile Regression)"*, PMLR Vol. 89, pp. 1901–1910.
2. **Anastasios N. Angelopoulos, Emmanuel J. Candès, Ryan J. Tibshirani (NeurIPS 2023):**
   * *Titolo:* *"Conformal PID Control for Time Series Prediction"*, *Advances in Neural Information Processing Systems*, `arXiv:2307.16895`.
3. **Benjamin Kompa, Jasper Snoek, Andrew L. Beam (Harvard Medical School, 2021):**
   * *Titolo:* *"Second opinion needed: communicating uncertainty in medical machine learning"*, *npj Digital Medicine*, 4(1):4 | **DOI:** `10.1038/s41746-020-00367-3`.

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

### 2.1 Decisioni Ingegneristiche Chiave
- **Rappresentazione Compatta `MonotoneQuantileTriplet`:** Sebbene la testa interna supporti una griglia arbitraria di $K$ nodi quantilici (inclusi i 21 quantili standard di `Timestral`), il contratto esposto al loop `20 Hz` e al frontend `ares-cockpit/` sintetizza la tripla canonica aerospaziale $(q_{0.05}, q_{0.50}, q_{0.95})$.
- **Invarianza della Monotonia sotto Denormalizzazione $\operatorname{sinh}$:** Poiche $\sinh(x)$ è strettamente crescente su tutto $\mathbb{R}$ e $\sigma_{\text{last}} \ge \sigma_{\min} > 0$, la monotonia costruita nello spazio latente si preserva esattamente nello spazio fisico ($\text{bpm}$, $\text{brpm}$, $\text{ms}$, $\hat{\rho}_{\text{global}}$, $\text{TTV}_{\text{hours}}$).
- **Conformal PID Calibration Offset ($\hat{q}_{\text{cal}}$):** Il `ConformalAbstentionGate` mantiene uno score di non-conformita esponenziale $\hat{s}_t$ che allarga simmetricamente i rami $q_{0.05}$ e $q_{0.95}$ quando gli errori residui recenti superano la copertura target del $90\%$.

### 2.2 Tabella File e Moduli Rust

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 16 (`H2`) |
| :--- | :--- | :--- |
| `crates/ares-nqs-stl/src/quantile_cone.rs` | **CREATE** | Implementa `MonotoneQuantileTriplet`, `MonotoneQuantileHead` (upper/lower triangular softplus accumulation), `ForecastConfidenceState` e `ConformalAbstentionGate`. |
| `crates/ares-nqs-stl/src/lib.rs` | **UPDATE** | Esporta `pub mod quantile_cone;` e i tipi contrattuali per i coni quantilici. |

---

## 3. Formulazione Matematica

### 3.1 Proiezione Cumulativa Triangolare Monotona (`EXP-053`)
Sia $\boldsymbol{\tau} = (\tau_0, \dots, \tau_{K-1})$ il vettore strettamente crescente dei livelli quantilici con indice mediano $m$ tale che $\tau_m = 0.50$, e sia $\mathbf{z} = (z_0, \dots, z_{K-1}) \in \mathbb{R}^K$ il vettore di logit emesso dal proiettore DHF per un dato passo dell'orizzonte:

1. **Mediana Non Vincolata ($i = m$):**
   $$\hat{q}_{\tau_m} = z_m$$

2. **Incrementi Positivi $\operatorname{softplus}$ Ponderati per $\Delta\tau$:**
   $$\delta_i = \gamma \cdot \Delta\tau_i \cdot \ln\!\left(1 + e^{z_i}\right) > 0, \qquad \Delta\tau_i = \begin{cases} \tau_{i+1} - \tau_i & \text{se } 0 \le i < m \\ \tau_i - \tau_{i-1} & \text{se } m < i < K \end{cases}$$
   Per evitare overflow numerici per $z_i \gg 0$, si usa l'identita stabile $\operatorname{softplus}(z) = \max(z, 0) + \ln(1 + e^{-|z|})$.

3. **Accumulazione Triangolare Inferiore e Superiore (Matmul Triangolare):**
   $$\hat{q}_{\tau_j} = \hat{q}_{\tau_m} - \sum_{u=j}^{m-1} \delta_u \quad (\forall j < m), \qquad \hat{q}_{\tau_i} = \hat{q}_{\tau_m} + \sum_{u=m+1}^{i} \delta_u \quad (\forall i > m)$$

### 3.2 Gate di Astensione Conforme (`ConformalAbstentionGate`)
Dato l'indice di qualita spettrale $\text{SQI}(t) \in [0, 1]$, la frazione di dati mancanti $r_{\text{miss}} \in [0, 1]$ e l'ampiezza del cono normalizzato $W_{90} = \hat{q}_{0.95} - \hat{q}_{0.05}$, il predicato di validita conforme è:
$$\text{ValidCone}(t) \iff \Big(\text{SQI}(t) \ge 0.70\Big) \;\wedge\; \Big(r_{\text{miss}}(t) \le 0.40\Big) \;\wedge\; \Big(W_{90}(t) \le \theta_{\max}\Big)$$

---

## 4. Concrete Rust Signatures & Data Structures (`crates/ares-nqs-stl/src/quantile_cone.rs`)

```rust
//! Fase 16 (H2): Direct Multi-Horizon Forecasting (DHF) Non-Crossing Monotone QuantileHead
//! e ConformalAbstentionGate adattivo per ARES-Health.

use crate::timestral_backbone::{CausalScaler, ChannelCausalStats};
use serde::{Deserialize, Serialize};

/// Livelli quantilici canonici a 7 nodi con mediana centrale tau_3 = 0.50:
/// [0.01, 0.05, 0.25, 0.50, 0.75, 0.95, 0.99].
pub const CANONICAL_QUANTILE_LEVELS: [f64; 7] = [0.01, 0.05, 0.25, 0.50, 0.75, 0.95, 0.99];
pub const CANONICAL_MEDIAN_INDEX: usize = 3;
pub const CANONICAL_Q05_INDEX: usize = 1;
pub const CANONICAL_Q95_INDEX: usize = 5;

/// Tripla quantilica strettamente monotona (5°, 50°/Mediana, 95° percentile).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MonotoneQuantileTriplet {
    pub q05: f64,
    pub q50: f64,
    pub q95: f64,
}

impl MonotoneQuantileTriplet {
    /// Costruisce una tripla quantilica garantendo q05 <= q50 <= q95 per costruzione.
    #[inline]
    pub fn from_median_and_spreads(median: f64, lower_spread: f64, upper_spread: f64) -> Self {
        let dl = lower_spread.max(0.0);
        let du = upper_spread.max(0.0);
        Self {
            q05: median - dl,
            q50: median,
            q95: median + du,
        }
    }

    /// Ampiezza dell'intervallo di predizione al 90% (q95 - q05 >= 0.0).
    #[inline]
    pub fn interval_width(&self) -> f64 {
        (self.q95 - self.q05).max(0.0)
    }

    /// Verifica l'invariante algebrico di non-incrocio.
    #[inline]
    pub fn is_monotone(&self) -> bool {
        self.q05 <= self.q50 && self.q50 <= self.q95
    }
}

/// Funzione softplus numericamente stabile: ln(1 + exp(x)) senza overflow per x grandi.
#[inline]
pub fn stable_softplus(x: f64) -> f64 {
    let clean_x = if x.is_finite() { x } else { 0.0 };
    clean_x.max(0.0) + (-clean_x.abs()).exp().ln_1p()
}

/// Testa di proiezione quantilica monotona per Direct Multi-Horizon Forecasting (DHF).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MonotoneQuantileHead {
    pub spread_scale_gamma: f64,
}

impl Default for MonotoneQuantileHead {
    fn default() -> Self {
        Self {
            spread_scale_gamma: 1.0,
        }
    }
}

impl MonotoneQuantileHead {
    /// Proietta un vettore di 7 logit grezzi nei 7 quantili monotoni non incrociati
    /// tramite accumulazione triangolare inferiore/superiore con pesi Delta_tau * softplus(z).
    pub fn project_seven_quantiles(&self, raw_logits: &[f64; 7]) -> [f64; 7] {
        let gamma = self.spread_scale_gamma.max(1e-4);
        let mut out = [0.0; 7];
        let median = if raw_logits[CANONICAL_MEDIAN_INDEX].is_finite() {
            raw_logits[CANONICAL_MEDIAN_INDEX]
        } else {
            0.0
        };
        out[CANONICAL_MEDIAN_INDEX] = median;

        // Ramo inferiore (j = m-1 down to 0): accumulazione triangolare sottrattiva
        let mut cum_lower = 0.0;
        for j in (0..CANONICAL_MEDIAN_INDEX).rev() {
            let delta_tau = CANONICAL_QUANTILE_LEVELS[j + 1] - CANONICAL_QUANTILE_LEVELS[j];
            let step = gamma * delta_tau * stable_softplus(raw_logits[j]);
            cum_lower += step;
            out[j] = median - cum_lower;
        }

        // Ramo superiore (i = m+1 up to 6): accumulazione triangolare additiva
        let mut cum_upper = 0.0;
        for i in (CANONICAL_MEDIAN_INDEX + 1)..7 {
            let delta_tau = CANONICAL_QUANTILE_LEVELS[i] - CANONICAL_QUANTILE_LEVELS[i - 1];
            let step = gamma * delta_tau * stable_softplus(raw_logits[i]);
            cum_upper += step;
            out[i] = median + cum_upper;
        }

        out
    }

    /// Estrae direttamente la tripla (q05, q50, q95) denormalizzata nello spazio fisico.
    pub fn project_denormalized_triplet(
        &self,
        raw_logits: &[f64; 7],
        scaler: &CausalScaler,
        stats: ChannelCausalStats,
        conformal_padding: f64,
    ) -> MonotoneQuantileTriplet {
        let latent_q = self.project_seven_quantiles(raw_logits);
        let pad = conformal_padding.max(0.0);
        let q05 = scaler.denormalize_value(latent_q[CANONICAL_Q05_INDEX] - pad, stats);
        let q50 = scaler.denormalize_value(latent_q[CANONICAL_MEDIAN_INDEX], stats);
        let q95 = scaler.denormalize_value(latent_q[CANONICAL_Q95_INDEX] + pad, stats);

        // Garantisce ordinamento anche in caso di arrotondamento floating-point estremo
        MonotoneQuantileTriplet {
            q05: q05.min(q50),
            q50,
            q95: q95.max(q50),
        }
    }
}

/// Stato del gate di astensione conforme (Conformal Abstention Gate).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ForecastConfidenceState {
    /// Inferenza Timestral calibrata e conforme ai limiti di incertezza.
    CalibratedQuantileCone,
    /// Astensione attiva (SQI < 0.70, missing > 40% o ampiezza cono eccessiva):
    /// il sistema usa il fallback deterministico ODE + EWMA-OLS.
    AbstainedFallbackDeterministic,
}

/// Gate di astensione conforme con calibrazione PID online (Angelopoulos et al. 2023).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ConformalAbstentionGate {
    pub min_sqi_threshold: f64,
    pub max_missing_ratio: f64,
    pub max_rho_cone_width: f64,
    pub conformal_miscoverage_alpha: f64,
    pub adaptive_Lookahead_pad: f64,
}

impl Default for ConformalAbstentionGate {
    fn default() -> Self {
        Self {
            min_sqi_threshold: 0.70,
            max_missing_ratio: 0.40,
            max_rho_cone_width: 1.25,
            conformal_miscoverage_alpha: 0.10, // Target 90% coverage [q05, q95]
            adaptive_Lookahead_pad: 0.0,
        }
    }
}

impl ConformalAbstentionGate {
    /// Aggiorna il padding conforme con controllo integrale sull'errore di copertura empirica.
    pub fn update_conformal_calibration(
        &mut self,
        realized_value: f64,
        previous_cone: MonotoneQuantileTriplet,
        learning_rate_eta: f64,
    ) {
        let is_miscovered =
            realized_value < previous_cone.q05 || realized_value > previous_cone.q95;
        let err = if is_miscovered {
            1.0 - self.conformal_miscoverage_alpha
        } else {
            -self.conformal_miscoverage_alpha
        };
        self.adaptive_Lookahead_pad =
            (self.adaptive_Lookahead_pad + learning_rate_eta.max(0.0) * err).clamp(0.0, 1.5);
    }

    /// Valuta se il cono quantilico soddisfa i criteri clinici di confidenza.
    #[inline]
    pub fn evaluate_gate(
        &self,
        sqi_score: f64,
        observed_ratio: f64,
        rho_cone: MonotoneQuantileTriplet,
    ) -> ForecastConfidenceState {
        let missing_ratio = (1.0 - observed_ratio).clamp(0.0, 1.0);
        if sqi_score < self.min_sqi_threshold
            || missing_ratio > self.max_missing_ratio
            || rho_cone.interval_width() > self.max_rho_cone_width
            || !rho_cone.is_monotone()
        {
            ForecastConfidenceState::AbstainedFallbackDeterministic
        } else {
            ForecastConfidenceState::CalibratedQuantileCone
        }
    }
}
```

---

## 5. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Creare `crates/ares-nqs-stl/src/quantile_cone.rs` con `MonotoneQuantileTriplet`, `stable_softplus`, e `MonotoneQuantileHead`.
- [ ] **Step 2:** Implementare `project_seven_quantiles` e `project_denormalized_triplet` verificando che l'accumulazione triangolare produca sempre $q_{0.01} < q_{0.05} < q_{0.25} < q_{0.50} < q_{0.75} < q_{0.95} < q_{0.99}$.
- [ ] **Step 3:** Implementare `ConformalAbstentionGate` con `update_conformal_calibration` (Conformal PID) ed `evaluate_gate` (`SQI >= 0.70`, `missing_ratio <= 0.40`, `interval_width <= 1.25`).
- [ ] **Step 4:** Esportare `pub mod quantile_cone;` in `crates/ares-nqs-stl/src/lib.rs` ed eseguire `cargo test -p ares-nqs-stl` e `cargo clippy -p ares-nqs-stl --all-targets -- -D warnings`.

---

## 6. Deterministic Verification & Unit Tests

1. **`test_monotone_quantile_head_never_crosses_under_adversarial_logits`:**
   - Testa `project_seven_quantiles` su vettori di logit fortemente decrescenti o caotici (es. `[50.0, -30.0, 100.0, 0.0, -100.0, 20.0, -50.0]`) e verifica che l'output soddisfi rigorosamente $q_0 < q_1 < q_2 < q_3 < q_4 < q_5 < q_6$.
2. **`test_conformal_abstention_gate_triggers_on_low_sqi_or_high_missing`:**
   - Verifica che per `sqi_score = 0.65` (< `0.70`) o `observed_ratio = 0.50` (`missing_ratio = 0.50 > 0.40`), `evaluate_gate` restituisca `ForecastConfidenceState::AbstainedFallbackDeterministic`.
3. **`test_conformal_pid_calibration_expands_cone_on_miscoverage`:**
   - Verifica che una sequenza di osservazioni fuori dal cono `[q05, q95]` incrementi `adaptive_Lookahead_pad` allargando il cono successivo.
