# Piano Implementativo Definitivo — Fase 08 (D1): Dimensionless NQS-STL Normalizer & Lemire-Donze $O(1)$ Monotonic Wedge Sliding Window

> Superseded for HRV availability by [issue #11](ISSUE_11_HRV_VALIDITY_PLAN.md): numeric-only CSVs produce no HRV. Any proxy/default RMSSD, non-null complete MRI/global/TTV on missing HRV, or test expecting such values below is historical design, not current behavior. Known non-HRV hazards remain evaluated.

- **Blocco Architetturale**: Blocco D (*Motore Rust Core: Logica Temporale Normalizzata `NQS-STL`, Predittore `TTV` & Sintesi `MRI` — `2. EVALUATE` Parte 2*, Fasi 08–09)
- **Fase**: Fase 08 (`D1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-nqs-stl`](../../crates/ares-nqs-stl/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid`
- **File Target Previsti**:
  1. `crates/ares-nqs-stl/Cargo.toml` *(NEW)*
  2. `crates/ares-nqs-stl/src/lib.rs` *(NEW)*
  3. `crates/ares-nqs-stl/src/normalizer.rs` *(NEW)*
  4. `crates/ares-nqs-stl/src/sliding_window.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 10\,\mu\text{s}$ per aggiornamento $O(1)$ di tutti e 5 i predicati temporali ($\le 3$ confronti per canale grazie al cuneo monotono di Lemire).
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, rispetto rigoroso degli invarianti `Entry 004` (eliminazione dominanza di scala) ed `Entry 007` ($O(1)$ sliding window).

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale: La Barra Orizzontale della Strategia T-Shaped
Nella Signal Temporal Logic (STL) classica, la congiunzione logica $\varphi_1 \wedge \varphi_2$ è valutata come $\min(\rho_1, \rho_2)$. Se $\rho_1$ è espressa in $\text{dyn/cm}^2$ ($\tau_w \in [0, 3]$) e $\rho_2$ in $\text{kgf}$ ($\text{ARED} \in [0, 150]$), la variabile numericamente più piccola domina sempre il $\min$, rendendo invisibili le violazioni sugli altri canali (**Invariante `Entry 004`**).

La **Fase 08 (`D1`)** risolve questo problema con:
1. **`normalizer.rs` (`Normalized Quantitative Semantics STL`):** Normalizza ogni predicato atomico $\hat{\rho}_k(t) \in [-2.0, +1.0]$ rispetto alla distanza tra baseline nominale $x_{k,\text{nom}}$ e soglia critica clinica $x_{k,\text{crit}}$, in modo che $+1.0$ rappresenti sempre salute nominale, $0.0$ la soglia critica esatta e $< 0.0$ una violazione attiva.
2. **`sliding_window.rs` (Cuneo Monotono di Lemire-Donzé $O(1)$):** Valuta l'operatore temporale $\Box_{[t-W, t]} \hat{\rho}_k(t) = \min_{\tau \in [t-W, t]} \hat{\rho}_k(\tau)$ in **tempo costante ammortizzato $O(1)$** tramite una `VecDeque<(f64, f64)>` monotona crescente.

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Alexandre Donzé, Thomas Ferrère, Oded Maler (UC Berkeley & Verimag/CNRS):**
   * *Titolo:* *"Efficient Robust Monitoring for STL"*, Computer Aided Verification (CAV 2013), Springer LNCS 8044, pp. 264–279 | **DOI:** `10.1007/978-3-642-39799-8_19`.
2. **Daniel Lemire:**
   * *Titolo:* *"Streaming Maximum-Minimum Filter Using No More than Three Comparisons per Element"*, *Nordic Journal of Computing*, 13(4):328–339, 2006 | **arXiv:** `cs/0610046`.
3. **Noushin Mehdipour, Cristian-Ioan Vasile, Calin Belta & Konstantinos Mamouras:**
   * *Titoli:* *"Arithmetic-Geometric Mean Robustness for Control from Signal Temporal Logic Specifications"* (ACC 2019, **DOI:** `10.23919/acc.2019.8814487`) & *"Algebraic Quantitative Semantics for Efficient Online Temporal Monitoring"* (**DOI:** `10.26226/morressier.604907f41a80aac83ca25cf8`).

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 08 (`D1`) |
| :--- | :--- | :--- |
| `crates/ares-nqs-stl/Cargo.toml` | **CREATE** | Dipendenze `ares-core-types`, `ares-causal-graph`, `serde = { version = "1.0", features = ["derive"] }`, `thiserror = "2.0"`. |
| `crates/ares-nqs-stl/src/normalizer.rs` | **CREATE** | Funzione pura `normalize_predicate_nqs` e calcolo dei 5 margini atomici ($\hat{\rho}_{\tau_w}$, $\hat{\rho}_{\text{ARED}}$, $\hat{\rho}_{\text{SOST}}$, $\hat{\rho}_{\text{RMSSD}}$, $\hat{\rho}_{\text{SANS}}$). |
| `crates/ares-nqs-stl/src/sliding_window.rs` | **CREATE** | Struttura `LemireMinWedge` basata su `VecDeque<(f64, f64)>` per il calcolo $O(1)$ di $\Box_{[t-W, t]}\hat{\rho}_k$. |

---

## 3. Architettura di `normalizer.rs` e `sliding_window.rs` in Puro Rust 2024

```rust
//! Fase 08 (D1): Normalizzatore adimensionale NQS-STL e filtro di minimo mobile O(1)
//! basato sul cuneo monotono di Lemire-Donze.

use ares_core_types::constants::{
    ARED_CRITICAL_LOAD_KGF, ARED_NOMINAL_LOAD_KGF, RMSSD_CRITICAL_MS, RMSSD_NOMINAL_MS,
    SANS_CRITICAL_INDEX, SANS_NOMINAL_INDEX, SOST_CRITICAL_PMOL_L, SOST_NOMINAL_PMOL_L,
    TAU_W_CRITICAL_DYN_CM2, TAU_W_NOMINAL_DYN_CM2, sanitize_f64,
};
use std::collections::VecDeque;

/// Direzione di sicurezza del predicato fisiologico.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PredicatePolarity {
    /// Valori piu alti sono piu sicuri (es. tau_w, ARED load, RMSSD, MQI).
    HigherIsSafer,
    /// Valori piu bassi sono piu sicuri (es. Sclerostina SOST, SANS Risk, Dose Radiazioni).
    LowerIsSafer,
}

/// Normalizza un predicato atomico x(t) nella semantica quantitativa adimensionale NQS-STL:
/// +1.0 = baseline nominale, 0.0 = soglia critica, < 0.0 = violazione attiva.
#[inline]
pub fn normalize_predicate_nqs(
    value: f64,
    nominal: f64,
    critical: f64,
    polarity: PredicatePolarity,
) -> f64 {
    let x = sanitize_f64(value, critical);
    let denom = (nominal - critical).abs().max(1e-6);
    let sign = match polarity {
        PredicatePolarity::HigherIsSafer => 1.0,
        PredicatePolarity::LowerIsSafer => -1.0,
    };
    (sign * (x - critical) / denom).clamp(-2.0, 1.0)
}

/// Calcola i 5 margini atomici NQS-STL istantanei.
#[inline]
pub fn compute_atomic_nqs_margins(
    tau_w_dyn_cm2: f64,
    ared_load_kgf: f64,
    sost_pmol_l: f64,
    rmssd_ms: f64,
    sans_risk_index: f64,
) -> (f64, f64, f64, f64, f64) {
    let rho_tau_w = normalize_predicate_nqs(
        tau_w_dyn_cm2,
        TAU_W_NOMINAL_DYN_CM2,
        TAU_W_CRITICAL_DYN_CM2,
        PredicatePolarity::HigherIsSafer,
    );
    let rho_ared = normalize_predicate_nqs(
        ared_load_kgf,
        ARED_NOMINAL_LOAD_KGF,
        ARED_CRITICAL_LOAD_KGF,
        PredicatePolarity::HigherIsSafer,
    );
    let rho_sost = normalize_predicate_nqs(
        sost_pmol_l,
        SOST_NOMINAL_PMOL_L,
        SOST_CRITICAL_PMOL_L,
        PredicatePolarity::LowerIsSafer,
    );
    let rho_rmssd = normalize_predicate_nqs(
        rmssd_ms,
        RMSSD_NOMINAL_MS,
        RMSSD_CRITICAL_MS,
        PredicatePolarity::HigherIsSafer,
    );
    let rho_sans = normalize_predicate_nqs(
        sans_risk_index,
        SANS_NOMINAL_INDEX,
        SANS_CRITICAL_INDEX,
        PredicatePolarity::LowerIsSafer,
    );

    (rho_tau_w, rho_ared, rho_sost, rho_rmssd, rho_sans)
}

/// Cuneo monotono di Lemire per valutare l'operatore STL Box_[t-W, t] in tempo O(1) ammortizzato.
#[derive(Debug, Clone)]
pub struct LemireMinWedge {
    window_duration_s: f64,
    deque: VecDeque<(f64, f64)>,
}

impl LemireMinWedge {
    pub fn new(window_duration_s: f64) -> Self {
        Self {
            window_duration_s: window_duration_s.max(1.0),
            deque: VecDeque::with_capacity(64),
        }
    }

    /// Inserisce un nuovo campione `(time_s, rho)` e restituisce `min_{tau in [t-W, t]} rho(tau)` in O(1).
    #[inline]
    pub fn push_and_evaluate(&mut self, time_s: f64, rho: f64) -> f64 {
        let t = sanitize_f64(time_s, 0.0);
        let v = sanitize_f64(rho, 0.0);

        // Se il tempo si resetta (es. loop del replay BIDMC o cambio scenario), svuota la finestra
        if let Some(&(last_t, _)) = self.deque.back() {
            if t < last_t {
                self.deque.clear();
            }
        }

        // Rimuove dalla coda tutti gli elementi >= v (mantenendo la monotonia stretta)
        while let Some(&(_, back_val)) = self.deque.back() {
            if back_val >= v {
                self.deque.pop_back();
            } else {
                break;
            }
        }
        self.deque.push_back((t, v));

        // Rimuove dalla testa gli elementi usciti dall'orizzonte [t - W, t]
        let cutoff = t - self.window_duration_s;
        while let Some(&(front_t, _)) = self.deque.front() {
            if front_t < cutoff {
                self.deque.pop_front();
            } else {
                break;
            }
        }

        self.deque.front().map(|&(_, min_v)| min_v).unwrap_or(v)
    }

    #[inline]
    pub fn clear(&mut self) {
        self.deque.clear();
    }
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 08 (`D1`)

1. **`test_nqs_normalization_maps_nominal_to_plus_one_and_critical_to_zero`:** Verifica che per $\tau_w = 2.80\text{ dyn/cm}^2$ si ottenga $\hat{\rho}_{\tau_w} = +1.0$, per $\tau_w = 1.20\text{ dyn/cm}^2$ si ottenga $\hat{\rho}_{\tau_w} = 0.0$, e per $\tau_w = 0.80\text{ dyn/cm}^2$ si ottenga $\hat{\rho}_{\tau_w} = -0.25$.
2. **`test_lemire_monotonic_wedge_matches_exact_sliding_minimum`:** Confronta l'uscita di `LemireMinWedge` su 481 campioni con la scansione ingenua $O(W)$, verificando coincidenza numerica al bit ($10^{-15}$).
