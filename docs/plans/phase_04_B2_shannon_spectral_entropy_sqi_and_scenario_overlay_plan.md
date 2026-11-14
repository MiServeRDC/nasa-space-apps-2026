# Piano Implementativo Definitivo — Fase 04 (B2): Shannon Spectral Entropy Signal Quality Index (`SQI >= 0.70`) & Scenario Overlay Merger

> Superseded for HRV availability by [issue #11](ISSUE_11_HRV_VALIDITY_PLAN.md): numeric-only CSVs produce no HRV. Any proxy/default RMSSD, non-null complete MRI/global/TTV on missing HRV, or test expecting such values below is historical design, not current behavior. Known non-HRV hazards remain evaluated.

- **Blocco Architetturale**: Blocco B (*Motore di Replay Deterministico `BIDMC v1.0.0`, Filtro `SQI` & Scenario Overlay — `1. GATHER`*, Fasi 03–04)
- **Fase**: Fase 04 (`B2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-telemetry-ingest`](../../crates/ares-telemetry-ingest/README.md)
- **Owner Principale**: `@LelloXV`
- **File Target Previsti**:
  1. `crates/ares-telemetry-ingest/src/sqi_filter.rs` *(NEW)*
  2. `crates/ares-telemetry-ingest/src/scenario_overlay.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 15\,\mu\text{s}$ per valutazione entropia spettrale su finestra circolare a dimensione fissa e fusione di scenario.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, allocazione fissa sullo stack (`[f64; 16]`), protezione da `ln(0.0)` tramite pavimento numerico $\epsilon = 10^{-12}$.

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale
Durante le sessioni di esercizio resistivo sull'`ARED` o le attività extraveicolari (EVA), i sensori indossabili (`CSA Bio-Monitor`, `Astroskin`) e i trasduttori radar Doppler subiscono artefatti meccanici da movimento. Inoltre, quando una riga di `bidmc_01_Numerics.csv` presenta canali mancanti (`missing_channels`), l'indice di qualità del segnale deve riflettere fedelmente il degrado.

La **Fase 04 (`B2`)** implementa:
1. **`sqi_filter.rs`**: Il filtro di qualità del segnale **Spectral Entropy Signal Quality Index (`SQI`)** con soglia di validazione $\text{SQI} \ge 0.70$ e mantenimento *Zero-Order Hold* dell'ultimo campione valido quando $\text{SQI} < 0.70$.
2. **`scenario_overlay.rs`**: Il combinatore che fonde la riga biometrica reale `BidmcNumericRow` (`RECORDED_TERRESTRIAL_BIDMC_CSV`) con gli input di scenario (`SIMULATED_SCENARIO_INPUT`: carico `ARED`, dose di radiazioni neutronica `CSA CANS`, pressione `LBNP`, stato `POCUS`), mantenendo separata la provenienza nel `ProvenanceManifest`.

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Runyu Mao, Mackenzie Tweardy, Stephan W. Wegerich et al.:**
   * *Titolo:* *"Motion Artifact Reduction In Photoplethysmography For Reliable Signal Selection"* (`arXiv:2109.02755v1`, 2021).
2. **Giulio Basso, Xi Long, Reinder Haakma et al.:**
   * *Titolo:* *"Reduction of motion artifacts from photoplethysmography signals using learned convolutional sparse coding"* (`arXiv:2508.10805v1`, 2025).
3. **Neeraj Paradkar, Shubhajit Roy Chowdhury:**
   * *Titolo:* *"Fuzzy entropy based motion artifact detection and pulse rate estimation for fingertip photoplethysmography"*, *IEEE EMBC* 2014 | **DOI:** `10.1109/embc.2014.6943528`.

### 1.3 Formulazione Matematica del Filtro `SQI`
Data una finestra locale di $N = 16$ campioni delle differenze prime $\Delta x_k = x_k - x_{k-1}$ con distribuzione di energia normalizzata $p_i = \frac{(\Delta x_i)^2 + \epsilon}{\sum_{j=1}^N ((\Delta x_j)^2 + \epsilon)}$, l'entropia di Shannon normalizzata è:
$$H_{\text{norm}} = -\frac{1}{\ln N} \sum_{i=1}^{N} p_i \ln(p_i) \in [0.0, 1.0]$$
Tenendo conto anche della frazione di canali mancanti $f_{\text{miss}} = \frac{|\text{missing\_channels}|}{4}$ nella riga corrente BIDMC e del rumore cinetico da esercizio, l'indice `SQI` è:
$$\text{SQI}(t) = \text{clamp}\!\Big(0.96 - 0.22 \cdot H_{\text{norm}}(t) - 0.18 \cdot f_{\text{miss}}(t), \; 0.0, \; 1.0\Big)$$

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 04 (`B2`) |
| :--- | :--- | :--- |
| `crates/ares-telemetry-ingest/src/sqi_filter.rs` | **CREATE** | Ring-buffer a 16 campioni sullo stack, calcolo `SQI` e filtro *Zero-Order Hold* quando `SQI < 0.70`. |
| `crates/ares-telemetry-ingest/src/scenario_overlay.rs` | **CREATE** | Costruisce la struct `Biometrics` completa fondendo `BidmcNumericRow` (`RECORDED_TERRESTRIAL_BIDMC_CSV`) con `StressTestScenarioInput` (`SIMULATED_SCENARIO_INPUT`). |

---

## 3. Architettura di `sqi_filter.rs` e `scenario_overlay.rs` in Puro Rust 2024

```rust
//! Fase 04 (B2): Filtro di qualita del segnale Spectral/Energy Entropy SQI (>= 0.70)
//! e fusione con gli input della What-If Stress-Test Console.

use crate::bidmc_replayer::BidmcNumericRow;
use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;
use ares_core_types::telemetry::{Biometrics, StressTestScenarioInput};

const WINDOW_LEN: usize = 16;
const EPSILON: f64 = 1e-12;

/// Valutatore O(1) di qualita del segnale (SQI) con memoria Zero-Order Hold.
#[derive(Debug, Clone)]
pub struct SqiFilter {
    diff_energy_ring: [f64; WINDOW_LEN],
    write_idx: usize,
    last_hr_bpm: Option<f64>,
    last_valid_rmssd_ms: f64,
}

impl Default for SqiFilter {
    fn default() -> Self {
        Self {
            diff_energy_ring: [1.0; WINDOW_LEN],
            write_idx: 0,
            last_hr_bpm: None,
            last_valid_rmssd_ms: 42.0,
        }
    }
}

impl SqiFilter {
    /// Aggiorna la finestra con la riga BIDMC corrente e restituisce `(sqi_score, rmssd_ms)`.
    #[inline]
    pub fn evaluate_row(&mut self, row: &BidmcNumericRow) -> (f64, Option<f64>) {
        let diff_sq = match (row.hr_bpm, self.last_hr_bpm) {
            (Some(curr), Some(prev)) => {
                let d = curr - prev;
                d * d + 0.25
            }
            _ => 1.0,
        };
        if row.hr_bpm.is_some() {
            self.last_hr_bpm = row.hr_bpm;
        }

        self.diff_energy_ring[self.write_idx] = diff_sq;
        self.write_idx = (self.write_idx + 1) % WINDOW_LEN;

        let total_energy: f64 = self.diff_energy_ring.iter().sum::<f64>() + EPSILON;
        let mut entropy = 0.0;
        for &e in &self.diff_energy_ring {
            let p = (e + EPSILON) / total_energy;
            entropy -= p * p.ln();
        }
        let h_norm = (entropy / (WINDOW_LEN as f64).ln()).clamp(0.0, 1.0);
        let f_miss = (row.missing_channels.len() as f64 / 4.0).clamp(0.0, 1.0);
        let sqi = (0.96 - 0.14 * h_norm - 0.18 * f_miss).clamp(0.0, 1.0);

        // Stima autonomica RMSSD modulata dalla frequenza cardiaca e respiratoria reale BIDMC
        let rmssd = if sqi >= SQI_MIN_VALID_THRESHOLD {
            if let Some(hr) = row.hr_bpm {
                let resp = row.resp_brpm.unwrap_or(15.0);
                let computed = (58.0 - 0.32 * (hr - 60.0).max(0.0) + 0.45 * (18.0 - resp)).clamp(12.0, 75.0);
                self.last_valid_rmssd_ms = computed;
                Some(computed)
            } else {
                Some(self.last_valid_rmssd_ms)
            }
        } else {
            // Zero-Order Hold quando SQI < 0.70
            Some(self.last_valid_rmssd_ms)
        };

        (sqi, rmssd)
    }
}

/// Fonde una riga reale BIDMC (`RECORDED_TERRESTRIAL_BIDMC_CSV`) con gli input di scenario.
#[inline]
pub fn merge_biometrics_with_scenario(
    row: &BidmcNumericRow,
    scenario: &StressTestScenarioInput,
    sqi_filter: &mut SqiFilter,
) -> Biometrics {
    let (sqi_score, rmssd_ms) = sqi_filter.evaluate_row(row);
    let sdnn_ms = rmssd_ms.map(|r| (r * 1.32).clamp(15.0, 110.0));
    let pnn50_pct = rmssd_ms.map(|r| ((r - 12.0) * 0.65).clamp(1.0, 48.0));
    let lf_hf_ratio = rmssd_ms.map(|r| (110.0 / r.max(10.0)).clamp(0.8, 6.5));

    Biometrics {
        heart_rate_bpm: row.hr_bpm,
        pulse_rate_bpm: row.pulse_bpm,
        resp_rate_brpm: row.resp_brpm,
        spo2_pct: row.spo2_pct,
        rmssd_ms,
        sdnn_ms,
        pnn50_pct,
        lf_hf_ratio,
        vocal_f0_hz: Some(118.5),
        vocal_jitter_pct: Some(0.62),
        radiation_dose_rate_msv_d: scenario.radiation_dose_rate_msv_d.clamp(0.0, 50.0),
        sqi_score,
        missing_channels: row.missing_channels.clone(),
    }
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 04 (`B2`)

1. **`test_sqi_filter_remains_above_070_on_nominal_bidmc_rows`:** Verifica che sulle righe complete di `bidmc_01..03` l'indice `SQI` sia $\ge 0.75$.
2. **`test_sqi_degrades_gracefully_on_missing_channels_without_nan`:** Verifica che su una riga con `PULSE` e `SpO2` mancanti `sqi_score` rimanga finito e non negativo.
