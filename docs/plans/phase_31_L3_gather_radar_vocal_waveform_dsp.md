# Piano Implementativo Definitivo — Fase 31 (L3): Moduli DSP Level-1 `GATHER` in Puro Rust (`radar_csi_dsp`, `vocal_acoustic_dsp` & `waveform_rr_extractor`) per Telemetria Contactless Doppler, Biomarcatori Vocali e HRV Beat-to-Beat (`125–500 Hz`)

- **Blocco Architetturale**: Blocco L (*`ARES-Gather-v2`: Multi-Modal Edge Signal Processing, High-Rate Waveform Ingestion & Sensor Fusion Hardening — `1. GATHER`*, Fasi 29–32)
- **Fase**: Fase 31 (`L3`)
- **Stato**: `[x] COMPLETED (TESTED)` (`phase_31_l3_gather_dsp` `7/7`, `ares-telemetry-ingest` `20/20`)
- **Crate Principali**: [`crates/ares-telemetry-ingest`](../../crates/ares-telemetry-ingest/README.md) & [`crates/ares-core-types`](../../crates/ares-core-types/README.md) *(sola lettura dei contratti condivisi)*
- **Documenti Architetturali & Audit di Riferimento**:
  - [`crates/ares-telemetry-ingest/README.md`](../../crates/ares-telemetry-ingest/README.md)
  - [`docs/architecture/CRATES_AND_MODULES_BLUEPRINT.md`](../architecture/CRATES_AND_MODULES_BLUEPRINT.md)
  - [`docs/architecture/MODEL_EVIDENCE_AUDIT.md`](../architecture/MODEL_EVIDENCE_AUDIT.md) *(Issue `#12`)*
  - [`docs/plans/ISSUE_11_HRV_VALIDITY_PLAN.md`](ISSUE_11_HRV_VALIDITY_PLAN.md) *(Issue `#11` / PR `#20`)*
- **Owner Principale**: `@LelloXV` (`work/LelloXV`) con supervisione architetturale `@fabiomalagutti27-droid` e revisione d'integrita `@MiServeRDC`
- **File Target Previsti**:
  1. `crates/ares-telemetry-ingest/src/radar_csi_dsp.rs` *(NEW — Demodulazione di fase Doppler RF `60 GHz` mmWave / `5.2 GHz` Wi-Fi CSI $\Delta\phi(t) = 4\pi d(t)/\lambda$, rimozione clutter statico $I/Q$, banco SOS biquad notch IIR a `60/120 Hz` per ventole ECLSS in Direct-Form II Transposed con verifica analitica dei poli nel cerchio unitario, separazione sub-banda cardiaca/respiratoria e gate `SQI >= 0.70`)*
  2. `crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs` *(NEW — Stimatore di frequenza fondamentale `YIN` su audio PCM mono `16/48 kHz`, jitter locale `%`, shimmer locale `% / dB`, `HNR` in `dB`, inclinazione spettrale e `pause_ratio` VAD con emissione rigorosa `Option<f64>::None` su frame silenti o non vocalizzati)*
  3. `crates/ares-telemetry-ingest/src/waveform_rr_extractor.rs` *(NEW — Rilevatore QRS `Pan-Tompkins` streaming a `125–500 Hz` in puro Rust, rigetto battiti ectopici/artefatti secondo criterio di Malik $\pm 20\%$, calcolo `RMSSD`, `SDNN`, `pNN50` e integrazione con `SqiFilter::evaluate_row_with_rmssd` nel pieno rispetto dell'invariante Issue `#11`)*
  4. `crates/ares-telemetry-ingest/src/bidmc_replayer.rs` *(UPDATE — Estensione di `IngestError` con `#[from] DspError` per propagazione tipizzata senza mai alterare la semantica `1 Hz` di `BidmcReplayer`)*
  5. `crates/ares-telemetry-ingest/src/scenario_overlay.rs` *(UPDATE — Aggiunta di `GatherDspOverlay` e `merge_biometrics_with_gather_dsp` retrocompatibili al 100% con `merge_biometrics_with_scenario`, `merge_biometrics_with_rmssd` e `biometrics_with_signal_quality`)*
  6. `crates/ares-telemetry-ingest/src/lib.rs` *(UPDATE — Esportazione pubblica di `radar_csi_dsp`, `vocal_acoustic_dsp`, `waveform_rr_extractor` e dei relativi tipi/errori)*
- **Budget Latenza & Memoria**:
  - **Aggiornamento per campione `RadarCsiProcessor::push_iq_sample` (`250 Hz`)**: $< 0.15\,\mu\text{s}$ (`0` allocazioni heap; ricalcolo periodico autocorrelazione decimata `< 8.0 us`, ampiamente entro il budget `< 15 us`)
  - **Analisi frame vocale `VocalAcousticAnalyzer::analyze_pcm_frame` (`512` campioni a `16 kHz`)**: $< 13.5\,\mu\text{s}$ per frame (`< 1.5 us` ammortizzati per tick a `20 Hz`, `0` allocazioni heap)
  - **Aggiornamento per campione `WaveformRrExtractor::push_sample` (`125–500 Hz`)**: $< 0.10\,\mu\text{s}$ per campione (`< 2.0 us` incluso ricalcolo `RMSSD`/`SDNN`/`pNN50` su finestra circolare di `128` intervalli NN, `0` allocazioni heap)
  - **Footprint statico complessivo per astronauta (stack / struct fissa)**: $< 28\,\text{KB}$ (`0` dipendenze C/FFI esterne, compatibile con partizioni `#![no_std]` / `alloc`-minimal Tier B/C)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` in `crates/*/src/`, gestione errori tipizzata con `thiserror` (`DspError` / `IngestError`), zero emoji ovunque, preservazione assoluta di Issue `#11` (`BEAT_INTERVALS_NOT_AVAILABLE` su sorgenti numeriche `1 Hz`) e di Issue `#12` (`ModelValidationStatus::IllustrativeUnvalidated`).

---

## 1. Executive Summary & Scientific/Open-Source Grounding

### 1.1 Gap Architetturale Attuale in `crates/ares-telemetry-ingest` e Obiettivi della Fase 31 (`L3`)
L'ispezione diretta dello stato corrente del repository evidenzia un disallineamento tra la specifica architetturale della fase `1. GATHER` e i moduli effettivamente compilati in `crates/ares-telemetry-ingest`:
1. [`crates/ares-telemetry-ingest/README.md`](../../crates/ares-telemetry-ingest/README.md) dichiara esplicitamente nello scope del crate il modulo radar Doppler contactless mmWave/Wi-Fi CSI ($\Delta\phi(t) = 4\pi d(t)/\lambda$ con filtraggio notch delle armoniche a `60/120 Hz` delle ventole ECLSS, ancorato a PhysioNet `CEBS` e NASA `ARCHeR`) e il modulo DSP per biomarcatori acustici vocali ($F_0$, jitter, shimmer, spectral tilt, pause ratio ancorati a NASA `HERA` e `CHAPEA`).
2. Tuttavia, [`crates/ares-telemetry-ingest/src/lib.rs`](../../crates/ares-telemetry-ingest/src/lib.rs) esporta oggi esclusivamente quattro moduli (`bidmc_replayer`, `scenario_overlay`, `sqi_filter`, `wearable_packet`). I tre motori DSP di primo livello (`radar_csi_dsp.rs`, `vocal_acoustic_dsp.rs`, `waveform_rr_extractor.rs`) non esistono ancora.
3. Parallelamente, [`crates/ares-core-types/src/telemetry.rs`](../../crates/ares-core-types/src/telemetry.rs) espone gia in `Biometrics` i campi tipizzati `rmssd_ms: Option<f64>`, `hrv_unavailable_reason: Option<HrvUnavailableReason>`, `sdnn_ms: Option<f64>`, `pnn50_pct: Option<f64>`, `lf_hf_ratio: Option<f64>`, `vocal_f0_hz: Option<f64>` e `vocal_jitter_pct: Option<f64>`, mentre [`crates/ares-telemetry-ingest/src/scenario_overlay.rs`](../../crates/ares-telemetry-ingest/src/scenario_overlay.rs) popola attualmente `vocal_f0_hz: Some(118.5)` e `vocal_jitter_pct: Some(0.62)` con valori segnaposto fissi e [`crates/ares-telemetry-ingest/src/sqi_filter.rs`](../../crates/ares-telemetry-ingest/src/sqi_filter.rs) predispone `SqiFilter::evaluate_row_with_rmssd(row, raw_rmssd_ms: Option<f64>)` in attesa di un estrattore R-R reale ad alta frequenza.

La **Fase 31 (`L3`)** colma integralmente questo divario in **Puro Rust 2024**, mantenendo invariate le dipendenze leggere di [`crates/ares-telemetry-ingest/Cargo.toml`](../../crates/ares-telemetry-ingest/Cargo.toml) (`ares-core-types`, `serde`, `thiserror` — zero binding C verso `FFTW`, `libsndfile` o `BLAS`) e garantendo tre pilastri architetturali:
1. **Monitoraggio Cardiorespiratorio Notturno Contactless (`radar_csi_dsp.rs`):** Estrae frequenza respiratoria (`6–36 brpm`) e frequenza cardiaca balistocardiografica (`48–150 bpm`) durante il riposo nelle cuccette dell'equipaggio senza elettrodi adesivi, sopprimendo il clutter statico delle paratie metalliche e le vibrazioni meccaniche a `60 Hz` e `120 Hz` del sistema di supporto vitale (`ECLSS`) mediante sezioni biquad IIR del secondo ordine (`SOS`) in forma diretta II trasposta con stabilita polare verificata analiticamente.
2. **Biomarcatori Vocali Passivi per Riserva Cognitiva e Fatica (`vocal_acoustic_dsp.rs`):** Calcola in tempo reale su frame PCM mono (`16 kHz` / `48 kHz`) la frequenza fondamentale $F_0$ tramite stimatore `YIN` con interpolazione parabolica sub-campione, il jitter ciclo-ciclo (`%`), lo shimmer (`%` e `dB`), il rapporto armoniche/rumore (`HNR` in `dB`), l'inclinazione spettrale (`spectral_tilt_db`) e il rapporto di pausa (`pause_ratio`), emettendo rigorosamente `Option<f64>::None` sui segmenti silenti, non vocalizzati o con basso SNR (senza mai convertire il silenzio in `F0 = 0.0 Hz`).
3. **Estrazione R-R Beat-to-Beat da Forme d'Onda `125–500 Hz` (`waveform_rr_extractor.rs`) e Tutela Assoluta di Issue `#11`:** Implementa la pipeline `Pan-Tompkins` adattiva in frequenza con raffinamento parabolico del picco R, periodo refrattario di `200 ms`, doppia soglia adattiva (`SPKI`/`NPKI`) con *searchback* e filtro anti-ectopia di Malik ($\pm 20\%$). Solo flussi waveform reali a `125–500 Hz` (es. `PhysioNet BIDMC Signals` a `125 Hz`, `CSA Bio-Monitor` a `256 Hz`, `PhysioNet CEBS` a `500 Hz`) o pacchetti `WearableSensorPacket` con `WMASK_RR_INTERVAL` attivo possono alimentare `Some(rmssd_ms)` verso `SqiFilter::evaluate_row_with_rmssd`. I file numerici a `1 Hz` (`BidmcReplayer` su `bidmc_01..03_Numerics.csv`) restano **tassativamente** a `rmssd_ms: None`, `hrv_unavailable_reason: Some(HrvUnavailableReason::BeatIntervalsNotAvailable)` e flag `BEAT_INTERVALS_NOT_AVAILABLE`.

### 1.2 Riferimenti Scientifici, Dataset Pubblici e Standard Normativi

| Dominio / Modulo | Fonte Primaria / Standard / Dataset | Contributo Tecnico e Perimetro di Evidenza (Issue `#12`) |
| :--- | :--- | :--- |
| **Radar Doppler Contactless (`radar_csi_dsp.rs`)** | **Droitcour et al.** (*IEEE TMTT* 2004, `DOI: 10.1109/TMTT.2004.823552`); **Boric-Lubecke et al.** (*IEEE Microw. Mag.* 2009); **NASA Artemis II `ARCHeR`**; **PhysioNet `CEBS` v1.0.0** (García-González et al., `physionet.org/content/cebsdb/1.0.0/`) | Equazione fisica di modulazione di fase $\Delta\phi(t) = 4\pi d(t)/\lambda$, cancellazione dell'offset DC nel piano $I/Q$ per evitare distorsione d'arco e separazione delle bande respiratoria (`0.1–0.6 Hz`) e cardiaca (`0.8–2.5 Hz`). |
| **Soppressione Armoniche Cabina (`60/120 Hz` Notch)** | **`NASA-STD-3001 Vol. 2 Rev F`** Clause `[V2 6001]` (*Acoustic Limits `<= NC-50`*); **Orfanidis** (*Introduction to Signal Processing*, Biquad Notch Design); **Bristow-Johnson** (*Audio EQ Cookbook*) | Progetto analitico di filtri IIR notch stretti ad alto fattore di merito ($Q \in [20, 35]$) centrati sulla fondamentale `60 Hz` e seconda armonica `120 Hz` delle ventole ECLSS, con criterio di stabilita di Jury $|a_2| < 1 \land |a_1| < 1 + a_2$. |
| **Stimatore Pitch & Perturbazioni Vocali (`vocal_acoustic_dsp.rs`)** | **de Cheveigné & Kawahara** (*J. Acoust. Soc. Am.* 111(4), 2002, `DOI: 10.1121/1.1458024` — Algoritmo `YIN`); **Boersma** (*Proc. Inst. Phonetic Sci.* 1993 — `HNR` & `Praat` jitter/shimmer); **NASA `CHAPEA` & `HERA`** | Funzione differenza cumulativa normalizzata $d'_t(\tau)$, soglia assoluta anti-subarmonica, interpolazione parabolica sub-campione e metriche di perturbazione glottica locale. Biomarcatori comportamentali marcati `ILLUSTRATIVE_UNVALIDATED` (Issue `#12`). |
| **Rilevamento QRS & HRV Time-Domain (`waveform_rr_extractor.rs`)** | **Pan & Tompkins** (*IEEE TBME* BME-32(3), 1985, `DOI: 10.1109/TBME.1985.325532`); **Task Force ESC/NASPE** (*Circulation* 1996); **Malik et al.** (1989); **`NeuroKit2`** (`MIT`, `neuropsychology.github.io/NeuroKit/functions/hrv.html`); **PhysioNet `BIDMC v1.0.0`** (`ODC-By-1.0`) | Catena passa-banda `5–15 Hz` $\to$ derivata a 5 punti $\to$ quadratura $\to$ integrazione mobile `150 ms` $\to$ soglie adattive `SPKI`/`NPKI` con refrattarieta `200 ms` e *searchback*. Conferma che `RMSSD`, `SDNN` e `pNN50` richiedono picchi battito-battito verificati (Entry `008` in `experienceLog.md`). |
| **Governance Privacy & Onesta Epistemica** | **`NASA-STD-3001 Vol. 1 Rev C`** Ch. 7 (*Crew Medical Privacy*); [`MODEL_EVIDENCE_AUDIT.md`](../architecture/MODEL_EVIDENCE_AUDIT.md) (Issue `#12`); [`ISSUE_11_HRV_VALIDITY_PLAN.md`](ISSUE_11_HRV_VALIDITY_PLAN.md) | Nessun salvataggio audio grezzo su log pubblici (solo scalari acustici filtrati da `AresSecurityGuard`), conservazione esplicita di `ModelValidationStatus::IllustrativeUnvalidated` e divieto assoluto di imputare `0.0` o HRV sintetico su canali mancanti. |

---

## 2. Architectural Decisions & Target Modules

### 2.1 Topologia di Integrazione nel Pipeline Level-1 `GATHER`
```
  [Sensori / Replay Level-1 GATHER]                 [crates/ares-telemetry-ingest]
  =================================                 ==============================

  (A) 1 Hz Numeric CSV (bidmc_01..03_Numerics.csv)
      └──> BidmcReplayer -------------------------> raw_rmssd_ms = None (Issue #11 LOCKED)
                                                        |
  (B) 125-500 Hz ECG Waveform (BIDMC Signals / CEBS)    |
      └──> WaveformRrExtractor (Pan-Tompkins + Malik) --+--> Some(TimeDomainHrvMetrics)
                                                        |    { rmssd_ms, sdnn_ms, pnn50_pct }
  (C) 200-500 Hz Baseband I/Q Radar (60 GHz / 5.2 GHz)  |
      └──> RadarCsiProcessor (60/120 Hz SOS Notch) -----+--> RadarVitalEstimate (SQI >= 0.70)
                                                        |    { heart_rate_bpm, resp_rate_brpm }
  (D) 16/48 kHz Mono PCM Crew Audio Check-In            |
      └──> VocalAcousticAnalyzer (YIN + VAD + HNR) -----+--> VocalBiomarkerFrame
                                                        |    { vocal_f0_hz: Option<f64>, ... }
                                                        v
                                           SqiFilter::evaluate_row_with_rmssd()
                                                        +
                                           merge_biometrics_with_gather_dsp()
                                                        |
                                                        v
                                        ares_core_types::telemetry::Biometrics
                                   (ModelValidationStatus::IllustrativeUnvalidated)
```

### 2.2 Decisioni Ingegneristiche Chiave
1. **Zero Allocazioni Heap nel Hot-Path (`#![no_std]`-Friendly Stack Arrays):** Tutti i filtri IIR (`BiquadSos`), le linee di ritardo per derivata e integrazione a finestra mobile (`[f64; 128]`), i buffer di autocorrelazione radar (`[f64; 512]`), i buffer di lavoro `YIN` (`[f64; 1024]` e `[f64; 512]`) e il registro circolare degli intervalli NN (`[f64; 128]`) risiedono interamente all'interno delle rispettive struct a dimensione fissa determinata a compile-time. Nessuna chiamata a `Vec::push` o `Box::new` avviene durante l'elaborazione campione-per-campione o frame-per-frame.
2. **Guardia Automatica di Nyquist sul Banco Notch `60/120 Hz`:** Se la frequenza di campionamento baseband del sensore radar $f_s$ soddisfa $f_0 \ge 0.495 f_s$ (ad esempio a $f_s = 200\,\text{Hz}$, dove la fondamentale ECLSS a $60\,\text{Hz} < 100\,\text{Hz}$ cade in banda ma la seconda armonica a $120\,\text{Hz}$ supera la frequenza di Nyquist $f_s/2 = 100\,\text{Hz}$), la sezione `120 Hz` viene configurata automaticamente come sezione identita ($b_0 = 1, b_1 = b_2 = a_1 = a_2 = 0$) anziche generare coefficienti ripiegati in aliasing o andare in errore. Quando $f_s \ge 250\,\text{Hz}$ (es. $250\,\text{Hz}$ o $500\,\text{Hz}$), entrambe le sezioni a `60 Hz` e `120 Hz` sono attive e verificate tramite il criterio di Jury.
3. **Decimazione Interna Anti-Aliasing da `48 kHz` a `16 kHz` per `YIN`:** Poiche la banda fondamentale vocale umana ($60\text{–}400\,\text{Hz}$) e le prime armoniche utili per jitter/shimmer/spectral tilt risiedono ampiamente entro $8\,\text{kHz}$, un ingresso PCM a $48\,\text{kHz}$ viene filtrato e decimato di un fattore intero $3\times$ in-place verso $16\,\text{kHz}$ prima della differenza quadratica $d_t(\tau)$, riducendo di $9\times$ il costo quadratico $O(W \cdot \tau_{\max})$ e mantenendo la latenza per frame sotto **`13.5 µs`**.
4. **Separazione Ermetica tra Replay `1 Hz` e Estrazione Waveform `125–500 Hz` (Issue `#11`):** `BidmcReplayer` non istanzia ne invoca mai `WaveformRrExtractor`. Inoltre, `WaveformRrExtractor::new(sample_rate_hz)` rifiuta esplicitamente con `Err(DspError::UnsupportedWaveformSampleRate { sample_rate_hz })` qualunque frequenza di campionamento fuori dall'intervallo `[125.0, 500.0] Hz`, rendendo strutturalmente impossibile passare per errore un segnale numerico a `1 Hz` o `20 Hz` al rilevatore QRS.
5. **Retrocompatibilita Totale dei `126/126` Test del Workspace:** Le firme pubbliche esistenti in `sqi_filter.rs`, `bidmc_replayer.rs`, `wearable_packet.rs` e `scenario_overlay.rs` rimangono intatte bit-per-bit; l'integrazione dei tre nuovi moduli avviene tramite la struct additiva `GatherDspOverlay` e la funzione pura `merge_biometrics_with_gather_dsp`.

### 2.3 Tabella Moduli e File Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 31 (`L3`) |
| :--- | :--- | :--- |
| `crates/ares-telemetry-ingest/src/radar_csi_dsp.rs` | **CREATE** | Implementa `RadarCarrierBand`, `BiquadSos` (DF2T + verifica di Jury), `RadarCsiConfig`, `RadarVitalEstimate` e `RadarCsiProcessor` (cancellazione DC $I/Q$, phase unwrapping continuo, inversione $\Delta\phi = 4\pi d/\lambda$, notch `60/120 Hz`, sub-bande `0.1–0.6 Hz` e `0.8–2.5 Hz`, gate `SQI >= 0.70`). |
| `crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs` | **CREATE** | Implementa `VocalAnalyzerConfig`, `VocalBiomarkerFrame` e `VocalAcousticAnalyzer` (VAD energetico + SNR, `pause_ratio`, stimatore `YIN` con CMNDF e interpolazione parabolica, jitter `%`, shimmer `% / dB`, `HNR` in `dB`, inclinazione spettrale 2-bande e preservazione `None` su silenzio/unvoiced). |
| `crates/ares-telemetry-ingest/src/waveform_rr_extractor.rs` | **CREATE** | Implementa `PanTompkinsConfig`, `DetectedQrsBeat`, `TimeDomainHrvMetrics` e `WaveformRrExtractor` (`125–500 Hz` bandpass `5–15 Hz`, derivata 5 punti, quadratura, MWI `150 ms`, soglie `SPKI`/`NPKI` + refrattarieta `200 ms` + *searchback*, filtro Malik $\pm 20\%$ e calcolo `RMSSD`/`SDNN`/`pNN50`). |
| `crates/ares-telemetry-ingest/src/bidmc_replayer.rs` | **UPDATE** | Aggiunge `DspError` (o re-export da modulo comune) e la variante `IngestError::Dsp(#[from] DspError)` in `IngestError`, senza toccare il comportamento di parsing CSV e i campi `BidmcNumericRow`. |
| `crates/ares-telemetry-ingest/src/scenario_overlay.rs` | **UPDATE** | Aggiunge `GatherDspOverlay` e `merge_biometrics_with_gather_dsp` per fondere in `Biometrics` i risultati reali di `RadarVitalEstimate`, `VocalBiomarkerFrame` e `TimeDomainHrvMetrics` preservando `missing_channels` e `BeatIntervalsNotAvailable`. |
| `crates/ares-telemetry-ingest/src/lib.rs` | **UPDATE** | Esporta pubblicamente `pub mod radar_csi_dsp;`, `pub mod vocal_acoustic_dsp;`, `pub mod waveform_rr_extractor;` e i tipi principali del layer `GATHER`. |

---

## 3. Mathematical Formulations & Pure-Rust DSP Specifications

### 3.1 Tipi di Errore Condivisi (`DspError` & `IngestError`)
Tutti e tre i moduli DSP restituiscono errori deterministici tipizzati tramite `thiserror::Error`, con zero `panic!`, zero `.unwrap()` e zero `.expect()`:

```rust
use thiserror::Error;

/// Errori deterministici di configurazione ed elaborazione per i moduli DSP Level-1 GATHER.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum DspError {
    #[error("frequenza di campionamento radar non valida: {sample_rate_hz} Hz (atteso [50.0, 2000.0] Hz)")]
    InvalidRadarSampleRate { sample_rate_hz: f64 },

    #[error("frequenza portante RF non valida: {carrier_hz} Hz (atteso valore finito > 1.0e6 Hz)")]
    InvalidCarrierFrequency { carrier_hz: f64 },

    #[error("fattore di merito Q del filtro biquad non valido: {q_factor} (atteso valore finito > 0.1)")]
    InvalidFilterQualityFactor { q_factor: f64 },

    #[error("sezione IIR biquad instabile secondo Jury (a1={a1}, a2={a2}): poli fuori dal cerchio unitario")]
    UnstableBiquadPoles { a1: f64, a2: f64 },

    #[error("frequenza di campionamento audio PCM non supportata: {sample_rate_hz} Hz (atteso 16000 o 48000 Hz)")]
    UnsupportedAudioSampleRate { sample_rate_hz: u32 },

    #[error("dimensione frame audio PCM insufficiente: ricevuti {len} campioni, richiesti almeno {min_required}")]
    AudioFrameTooShort { len: usize, min_required: usize },

    #[error("frequenza di campionamento waveform non valida per Pan-Tompkins: {sample_rate_hz} Hz (consentito [125.0, 500.0] Hz)")]
    UnsupportedWaveformSampleRate { sample_rate_hz: f64 },
}
```
In `crates/ares-telemetry-ingest/src/bidmc_replayer.rs`, `IngestError` viene esteso con:
```rust
    #[error("errore modulo DSP GATHER: {0}")]
    Dsp(#[from] crate::radar_csi_dsp::DspError),
```

---

### 3.2 Modulo 1: `crates/ares-telemetry-ingest/src/radar_csi_dsp.rs`

#### 3.2.1 Formulazione Fisica e Matematica
1. **Lunghezza d'Onda Portante e Legge di Fase Doppler:**  
   Sia $c = 299\,792\,458\,\text{m/s}$ la velocita della luce nel vuoto e $f_c$ la frequenza della portante RF:
   - Modalita `MmWave60Ghz`: $f_c = 60.0 \times 10^9\,\text{Hz} \implies \lambda = c / f_c \approx 4.99654 \times 10^{-3}\,\text{m}$ ($\approx 5.0\,\text{mm}$).
   - Modalita `WifiCsi5Ghz`: $f_c = 5.20 \times 10^9\,\text{Hz} \implies \lambda = c / f_c \approx 5.76524 \times 10^{-2}\,\text{m}$ ($\approx 57.7\,\text{mm}$).

   Uno spostamento radiale toracico $d(t)$ lungo la linea di vista produce una variazione del cammino di andata e ritorno pari a $2\,d(t)$, inducendo lo sfasamento:
   $$\Delta\phi(t) = \frac{4\pi \, d(t)}{\lambda} \quad \Longleftrightarrow \quad d(t) = \frac{\lambda}{4\pi}\,\Delta\phi(t)\ \text{[m]}$$

2. **Rimozione Clutter Statico $I/Q$ (EMA) e Phase Unwrapping Continuo (Itoh $O(1)$):**  
   Le riflessioni statiche delle paratie dell'habitat aggiungono un vettore costante $(I_{\text{DC}}, Q_{\text{DC}})$ al segnale in banda base. Tramite media mobile esponenziale con costante di tempo $\tau_{\text{dc}} = 15.0\,\text{s}$ e coefficiente $\alpha_{\text{dc}} = 1 - \exp\!\big(-1 / (f_s \tau_{\text{dc}})\big)$:
   $$\bar{I}[n] = (1 - \alpha_{\text{dc}})\bar{I}[n-1] + \alpha_{\text{dc}} I[n], \qquad \bar{Q}[n] = (1 - \alpha_{\text{dc}})\bar{Q}[n-1] + \alpha_{\text{dc}} Q[n]$$
   $$\tilde{I}[n] = I[n] - \bar{I}[n], \qquad \tilde{Q}[n] = Q[n] - \bar{Q}[n]$$
   Se l'energia dinamica istantanea $P_{\text{dyn}}[n] = \tilde{I}[n]^2 + \tilde{Q}[n]^2 \ge \epsilon_{IQ}$ ($\epsilon_{IQ} = 10^{-12}$), la fase avvolta $\phi_w[n] = \operatorname{atan2}(\tilde{Q}[n], \tilde{I}[n]) \in (-\pi, \pi]$ viene svolta senza discontinuita di $2\pi$ tramite l'operatore euclideo strettamente positivo:
   $$\delta\phi[n] = \big(\phi_w[n] - \phi_w[n-1] + \pi\big)\bmod_{\text{euclid}}(2\pi) - \pi \in [-\pi, \pi)$$
   $$\Phi[n] = \Phi[n-1] + \delta\phi[n], \qquad d_{\text{mm}}[n] = 10^3 \cdot \frac{\lambda}{4\pi}\,\Phi[n]$$

3. **Banco SOS Biquad IIR Notch (`60 Hz` & `120 Hz` ECLSS) e Verifica di Stabilita nel Cerchio Unitario:**  
   Per ciascuna frequenza di disturbo $f_0 \in \{f_{\text{fan}}, 2 f_{\text{fan}}\}$ (default $60.0\,\text{Hz}$ e $120.0\,\text{Hz}$) tale che $0 < f_0 < 0.495 f_s$, con fattore di merito $Q > 0$ (default $Q = 30.0$, larghezza a $-3\,\text{dB}$ pari a $\Delta f = f_0 / Q = 2.0\,\text{Hz}$ a $60\,\text{Hz}$):
   $$\omega_0 = \frac{2\pi f_0}{f_s}, \qquad \alpha = \frac{\sin\omega_0}{2Q}$$
   $$b_0 = \frac{1}{1+\alpha}, \quad b_1 = \frac{-2\cos\omega_0}{1+\alpha}, \quad b_2 = \frac{1}{1+\alpha}, \quad a_1 = \frac{-2\cos\omega_0}{1+\alpha}, \quad a_2 = \frac{1-\alpha}{1+\alpha}$$
   **Teorema di Stabilita (Criterio di Jury per $A(z) = 1 + a_1 z^{-1} + a_2 z^{-2}$):**  
   Entrambi i poli complessi coniugati $p_{1,2}$ giacciono strettamente all'interno del cerchio unitario ($|p_{1,2}| < 1$) se e solo se:
   $$|a_2| < 1 \qquad \land \qquad |a_1| < 1 + a_2$$
   Poiche $\omega_0 \in (0, \pi) \implies \sin\omega_0 > 0 \implies \alpha > 0$, si ha analiticamente $|a_2| = |(1-\alpha)/(1+\alpha)| < 1$ e $|a_1| = 2|\cos\omega_0|/(1+\alpha) < 2/(1+\alpha) = 1 + a_2$. Inoltre `BiquadSos::from_coefficients` verifica a runtime entrambe le disuguaglianze con margine numerico $\eta = 10^{-11}$.

   **Equazioni alle Differenze Direct-Form II Transposed (DF2T):**
   $$y[n] = b_0 x[n] + s_1[n-1]$$
   $$s_1[n] = b_1 x[n] - a_1 y[n] + s_2[n-1]$$
   $$s_2[n] = b_2 x[n] - a_2 y[n]$$

4. **Separazione Sub-Bande Cardiorespiratorie e Gate `SQI >= 0.70`:**
   - **Sub-banda respiratoria:** Cascata Butterworth passa-banda `[0.10 Hz, 0.60 Hz]` ($\leftrightarrow 6.0\text{–}36.0\,\text{brpm}$).
   - **Sub-banda cardiaca:** Cascata Butterworth passa-banda `[0.80 Hz, 2.50 Hz]` ($\leftrightarrow 48.0\text{–}150.0\,\text{bpm}$).
   - Le uscite filtrate vengono decimate a $f_d = 25.0\,\text{Hz}$ in due ring buffer circolari sullo stack da `512` campioni ($20.48\,\text{s}$ di osservazione). La frequenza dominante viene stimata dal massimo dell'autocorrelazione normalizzata $R_{\text{norm}}(\tau)$ nei rispettivi intervalli fisiologici di lag ($\tau_{\text{resp}} \in [42, 250]$, $\tau_{\text{card}} \in [10, 31]$ campioni a $25\,\text{Hz}$) con interpolazione parabolica a 3 punti.
   - L'indice `radar_sqi` combina la concentrazione periodica di picco $\max(R_{\text{resp}}, R_{\text{card}})$ e il rapporto di reiezione fuori banda; se `radar_sqi < SQI_MIN_VALID_THRESHOLD` (`0.70`), `heart_rate_bpm` e `resp_rate_brpm` vengono emessi come `Option<f64>::None`.

#### 3.2.2 Firme Concrete in Puro Rust (`crates/ares-telemetry-ingest/src/radar_csi_dsp.rs`)
```rust
//! Fase 31 (L3): Demodulazione Doppler contactless RF 60 GHz mmWave / 5.2 GHz Wi-Fi CSI,
//! banco SOS biquad notch IIR a 60/120 Hz per ventole ECLSS e stima cardiorespiratoria.

use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

pub const SPEED_OF_LIGHT_M_S: f64 = 299_792_458.0;
pub const RADAR_DECIMATED_HZ: f64 = 25.0;
pub const RADAR_RING_LEN: usize = 512;
const STABILITY_MARGIN: f64 = 1e-11;
const IQ_POWER_EPSILON: f64 = 1e-12;

/// Banda portante RF per il calcolo esatto della lunghezza d'onda lambda = c / f_c.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum RadarCarrierBand {
    /// Radar mmWave cabina notturna a 60.0 GHz (lambda ~= 4.9965 mm).
    MmWave60Ghz,
    /// Sottoportante Wi-Fi CSI 802.11a/n/ac a 5.20 GHz (lambda ~= 57.6524 mm).
    WifiCsi5Ghz,
    /// Portante personalizzata validata (> 1 MHz).
    Custom { carrier_hz: f64 },
}

impl RadarCarrierBand {
    pub fn wavelength_m(self) -> Result<f64, DspError> {
        let fc = match self {
            Self::MmWave60Ghz => 60.0e9,
            Self::WifiCsi5Ghz => 5.20e9,
            Self::Custom { carrier_hz } => carrier_hz,
        };
        if !fc.is_finite() || fc <= 1.0e6 {
            return Err(DspError::InvalidCarrierFrequency { carrier_hz: fc });
        }
        Ok(SPEED_OF_LIGHT_M_S / fc)
    }
}

/// Sezione biquadratica IIR del secondo ordine in forma Direct-Form II Transposed (DF2T).
/// Allocazione 100% stack, zero heap, stabilita polare verificata con criterio di Jury.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BiquadSos {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    s1: f64,
    s2: f64,
}

impl BiquadSos {
    #[inline]
    pub const fn identity() -> Self {
        Self { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, s1: 0.0, s2: 0.0 }
    }

    pub fn from_coefficients(b0: f64, b1: f64, b2: f64, a1: f64, a2: f64) -> Result<Self, DspError> {
        let coeffs_finite = [b0, b1, b2, a1, a2].into_iter().all(f64::is_finite);
        if !coeffs_finite || a2.abs() >= (1.0 - STABILITY_MARGIN) || a1.abs() >= (1.0 + a2 - STABILITY_MARGIN) {
            return Err(DspError::UnstableBiquadPoles { a1, a2 });
        }
        Ok(Self { b0, b1, b2, a1, a2, s1: 0.0, s2: 0.0 })
    }

    /// Progetta un filtro notch IIR stretto a frequenza `notch_hz`.
    /// Se `notch_hz >= 0.495 * sample_rate_hz` (sopra Nyquist), restituisce `identity()`.
    pub fn design_notch(sample_rate_hz: f64, notch_hz: f64, q_factor: f64) -> Result<Self, DspError> {
        if !sample_rate_hz.is_finite() || !(50.0..=2000.0).contains(&sample_rate_hz) {
            return Err(DspError::InvalidRadarSampleRate { sample_rate_hz });
        }
        if !q_factor.is_finite() || q_factor <= 0.1 {
            return Err(DspError::InvalidFilterQualityFactor { q_factor });
        }
        if notch_hz <= 0.0 || notch_hz >= 0.495 * sample_rate_hz {
            return Ok(Self::identity());
        }
        let w0 = 2.0 * core::f64::consts::PI * notch_hz / sample_rate_hz;
        let alpha = w0.sin() / (2.0 * q_factor);
        let inv_a0 = 1.0 / (1.0 + alpha);
        let b0 = inv_a0;
        let b1 = -2.0 * w0.cos() * inv_a0;
        let b2 = inv_a0;
        let a1 = b1;
        let a2 = (1.0 - alpha) * inv_a0;
        Self::from_coefficients(b0, b1, b2, a1, a2)
    }

    /// Progetta un filtro Butterworth passa-banda del 2o ordine tramite trasformata bilineare.
    pub fn design_bandpass_2nd(sample_rate_hz: f64, low_hz: f64, high_hz: f64) -> Result<Self, DspError> {
        let w0 = core::f64::consts::PI * (low_hz + high_hz) / sample_rate_hz;
        let bw = 2.0 * core::f64::consts::PI * (high_hz - low_hz).max(0.02) / sample_rate_hz;
        let alpha = w0.sin() * (bw * 0.5).sinh();
        let inv_a0 = 1.0 / (1.0 + alpha);
        Self::from_coefficients(
            alpha * inv_a0,
            0.0,
            -alpha * inv_a0,
            -2.0 * w0.cos() * inv_a0,
            (1.0 - alpha) * inv_a0,
        )
    }

    /// Verifica se i poli soddisfano rigorosamente |p_{1,2}| < 1.
    #[inline]
    pub fn poles_inside_unit_circle(&self) -> bool {
        self.a2.abs() < (1.0 - STABILITY_MARGIN) && self.a1.abs() < (1.0 + self.a2 - STABILITY_MARGIN)
    }

    /// Aggiornamento O(1) Direct-Form II Transposed senza allocazioni.
    #[inline]
    pub fn step(&mut self, x: f64) -> f64 {
        let x_safe = if x.is_finite() { x } else { 0.0 };
        let y = self.b0 * x_safe + self.s1;
        self.s1 = self.b1 * x_safe - self.a1 * y + self.s2;
        self.s2 = self.b2 * x_safe - self.a2 * y;
        y
    }
}

/// Configurazione del processore Doppler contactless Level-1 GATHER.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RadarCsiConfig {
    pub sample_rate_hz: f64,
    pub carrier_band: RadarCarrierBand,
    pub eclss_fundamental_hz: f64,
    pub notch_q_factor: f64,
    pub clutter_tau_s: f64,
}

impl Default for RadarCsiConfig {
    fn default() -> Self {
        Self {
            sample_rate_hz: 250.0,
            carrier_band: RadarCarrierBand::MmWave60Ghz,
            eclss_fundamental_hz: 60.0,
            notch_q_factor: 30.0,
            clutter_tau_s: 15.0,
        }
    }
}

/// Stima biometrica contactless prodotta dal radar Doppler con gate SQI >= 0.70.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RadarVitalEstimate {
    pub displacement_mm: f64,
    pub unwrapped_phase_rad: f64,
    pub heart_rate_bpm: Option<f64>,
    pub resp_rate_brpm: Option<f64>,
    pub radar_sqi: f64,
    pub eclss_notch_active: [bool; 2],
    pub validation_status: ModelValidationStatus,
}

/// Processore streaming O(1) per radar Doppler 60 GHz mmWave e 5.2 GHz Wi-Fi CSI.
#[derive(Debug, Clone)]
pub struct RadarCsiProcessor {
    config: RadarCsiConfig,
    wavelength_m: f64,
    alpha_dc: f64,
    dc_i: f64,
    dc_q: f64,
    initialized_iq: bool,
    prev_wrapped_phase: f64,
    unwrapped_phase_rad: f64,
    notch_60hz: BiquadSos,
    notch_120hz: BiquadSos,
    resp_bp_stage1: BiquadSos,
    resp_bp_stage2: BiquadSos,
    card_bp_stage1: BiquadSos,
    card_bp_stage2: BiquadSos,
    decim_stride: usize,
    decim_counter: usize,
    resp_ring: [f64; RADAR_RING_LEN],
    card_ring: [f64; RADAR_RING_LEN],
    ring_write_idx: usize,
    ring_filled: usize,
    cached_estimate: RadarVitalEstimate,
}

impl RadarCsiProcessor {
    pub fn new(config: RadarCsiConfig) -> Result<Self, DspError> { ... }
    pub fn push_iq_sample(&mut self, in_phase: f64, quadrature: f64) -> RadarVitalEstimate { ... }
    pub fn latest_estimate(&self) -> RadarVitalEstimate { self.cached_estimate }
}
```

---

### 3.3 Modulo 2: `crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs`

#### 3.3.1 Formulazione Matematica (`YIN` + Perturbazioni Glottiche + VAD)
1. **Rilevamento Attivita Vocale (VAD), SNR Adattivo e `pause_ratio`:**  
   Dato un frame audio PCM mono $x[0..N-1]$ rimosso della componente continua $\bar{x} = \frac{1}{N}\sum_{n=0}^{N-1} x[n]$:
   $$E_{\text{rms}} = \sqrt{\frac{1}{N}\sum_{n=0}^{N-1} (x[n] - \bar{x})^2}, \qquad \text{SNR}_{\text{dB}} = 20\log_{10}\!\left(\frac{E_{\text{rms}} + \epsilon}{E_{\text{noise}} + \epsilon}\right)$$
   Un registro binario circolare `vad_history: [bool; 128]` traccia la frazione di pausa $\text{pause\_ratio} = N_{\text{pause}} / N_{\text{osservati}} \in [0.0, 1.0]$. Se $E_{\text{rms}} < E_{\text{vad\_min}}$ (default $0.008$) oppure $\text{SNR}_{\text{dB}} < 10.0\,\text{dB}$, il frame e marcato `voiced = false` e tutti i biomarcatori glottici (`vocal_f0_hz`, `vocal_jitter_pct`, `vocal_shimmer_pct`, `vocal_shimmer_db`, `hnr_db`) valgono **`None`**.

2. **Stimatore di Frequenza Fondamentale `YIN` (de Cheveigné & Kawahara 2002):**  
   Sul segnale a $f_{s,\text{eff}} = 16\,000\,\text{Hz}$ (diretto se $f_s = 16\,\text{kHz}$, oppure ottenuto tramite filtro anti-aliasing FIR `[0.25, 0.50, 0.25]` e decimazione $3\times$ se $f_s = 48\,\text{kHz}$), con intervallo fisiologico $[F_{0,\min}, F_{0,\max}] = [60.0\,\text{Hz}, 400.0\,\text{Hz}]$ ($\tau_{\min} = 40$, $\tau_{\max} = 267$) e finestra di integrazione $W = \min(N_{\text{eff}} - \tau_{\max} - 1, 512)$:
   - **Funzione Differenza Quadratica:**
     $$d_t(\tau) = \sum_{j=0}^{W-1} \big(x[j] - x[j+\tau]\big)^2, \qquad \tau \in \{1, \dots, \tau_{\max}\}$$
   - **Cumulative Mean Normalized Difference Function (CMNDF):**
     $$d'_t(0) = 1, \qquad d'_t(\tau) = \frac{d_t(\tau)}{\dfrac{1}{\tau}\sum_{k=1}^{\tau} d_t(k) + \epsilon}\quad (\tau \ge 1)$$
   - **Ricerca a Soglia Assoluta ($\theta_{\text{YIN}} = 0.15$) e Gate di Vocalizzazione ($\theta_{\max} = 0.32$):**  
     Si seleziona il minimo lag $\tau^* \in [\tau_{\min}, \tau_{\max}-1]$ tale che $d'_t(\tau^*) < \theta_{\text{YIN}}$ e $d'_t(\tau^*) \le d'_t(\tau^*+1)$. In assenza di attraversamento di $\theta_{\text{YIN}}$, si accetta il minimo globale su $[\tau_{\min}, \tau_{\max}-1]$ solo se $d'_t(\tau^*) < \theta_{\max}$; altrimenti il frame e consonantico/non vocalizzato $\implies$ `vocal_f0_hz = None`.
   - **Interpolazione Parabolica a 3 Punti per Risoluzione Sub-Campione:**  
     Posti $\alpha = d'_t(\tau^*-1)$, $\beta = d'_t(\tau^*)$, $\gamma = d'_t(\tau^*+1)$ con denominatore $D = 2(\alpha - 2\beta + \gamma)$:
     $$\delta\tau = \begin{cases} \operatorname{clamp}\!\left(\dfrac{\alpha - \gamma}{D},\; -0.5,\; +0.5\right) & \text{se } |D| > 10^{-12} \\ 0.0 & \text{altrimenti} \end{cases}, \qquad \hat{\tau} = \tau^* + \delta\tau, \qquad \hat{F}_0 = \frac{f_{s,\text{eff}}}{\hat{\tau}}\ \text{[Hz]}$$

3. **Jitter Locale (`%`), Shimmer Locale (`%` / `dB`), `HNR` (`dB`) e Spectral Tilt (`dB`):**
   - Segmentando il frame vocalizzato in $K$ cicli glottici consecutivi tramite ricerca dei picchi sincronizzati sul periodo $\hat{\tau}$ (con interpolazione parabolica degli istanti di picco $t_i$ e delle ampiezze picco-picco $A_i$, richiedendo $K \ge 3$ periodi $T_i = t_{i+1} - t_i$):
     $$\text{Jitter}_{\text{local}}(\%) = 100 \cdot \frac{\dfrac{1}{K-1}\sum_{i=1}^{K-1} |T_{i+1} - T_i|}{\dfrac{1}{K}\sum_{i=1}^{K} T_i + \epsilon}$$
     $$\text{Shimmer}_{\text{local}}(\%) = 100 \cdot \frac{\dfrac{1}{K-1}\sum_{i=1}^{K-1} |A_{i+1} - A_i|}{\dfrac{1}{K}\sum_{i=1}^{K} A_i + \epsilon}, \qquad \text{Shimmer}_{\text{dB}} = \frac{1}{K-1}\sum_{i=1}^{K-1} \left|20\log_{10}\!\left(\frac{A_{i+1} + \epsilon}{A_i + \epsilon}\right)\right|$$
   - **Harmonics-to-Noise Ratio (Boersma 1993):** Calcolata la correlazione normalizzata al lag fondamentale $r(\tau^*) = \operatorname{clamp}\!\Big(\frac{\sum_{j=0}^{W-1} x[j]x[j+\tau^*]}{\sqrt{\sum x[j]^2 \sum x[j+\tau^*]^2} + \epsilon},\, 10^{-4},\, 0.9999\Big)$:
     $$\text{HNR}_{\text{dB}} = 10\log_{10}\!\left(\frac{r(\tau^*)}{1 - r(\tau^*)}\right)$$
   - **Spectral Tilt (`spectral_tilt_db`):** Pendenza energetica tra la banda formante alta ($1000\text{–}4000\,\text{Hz}$) e la banda glottica bassa ($50\text{–}1000\,\text{Hz}$) separata tramite filtro RC del primo ordine a $f_c = 1000\,\text{Hz}$ ($O(N)$, zero FFT heap):
     $$S_{\text{tilt}} = 10\log_{10}\!\left(\frac{E_{1\text{–}4\,\text{kHz}} + \epsilon}{E_{50\text{–}1000\,\text{Hz}} + \epsilon}\right)\ \text{[dB]}$$

#### 3.3.2 Firme Concrete in Puro Rust (`crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs`)
```rust
//! Fase 31 (L3): Estrazione biomarcatori acustici vocali in Puro Rust (stimatore YIN,
//! jitter, shimmer, HNR, inclinazione spettrale e pause ratio VAD per HERA/CHAPEA).

use crate::radar_csi_dsp::DspError;
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

pub const MAX_YIN_WORK_SAMPLES: usize = 1024;
pub const MAX_YIN_LAG: usize = 320;
pub const VAD_HISTORY_LEN: usize = 128;
pub const MAX_GLOTTAL_PEAKS: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VocalAnalyzerConfig {
    pub sample_rate_hz: u32,
    pub f0_min_hz: f64,
    pub f0_max_hz: f64,
    pub yin_threshold: f64,
    pub yin_voiced_ceiling: f64,
    pub vad_rms_floor: f64,
    pub min_snr_db: f64,
}

impl Default for VocalAnalyzerConfig {
    fn default() -> Self {
        Self {
            sample_rate_hz: 16_000,
            f0_min_hz: 60.0,
            f0_max_hz: 400.0,
            yin_threshold: 0.15,
            yin_voiced_ceiling: 0.32,
            vad_rms_floor: 0.008,
            min_snr_db: 10.0,
        }
    }
}

/// Output tipizzato per singolo frame vocale; garantisce `None` su frame silenti o non vocalizzati.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VocalBiomarkerFrame {
    pub voiced: bool,
    pub vocal_f0_hz: Option<f64>,
    pub vocal_jitter_pct: Option<f64>,
    pub vocal_shimmer_pct: Option<f64>,
    pub vocal_shimmer_db: Option<f64>,
    pub hnr_db: Option<f64>,
    pub spectral_tilt_db: Option<f64>,
    pub pause_ratio: f64,
    pub frame_snr_db: f64,
    pub validation_status: ModelValidationStatus,
}

/// Analizzatore streaming zero-heap per biomarcatori acustici vocali.
#[derive(Debug, Clone)]
pub struct VocalAcousticAnalyzer {
    config: VocalAnalyzerConfig,
    noise_rms_floor: f64,
    vad_ring: [bool; VAD_HISTORY_LEN],
    vad_write_idx: usize,
    vad_count: usize,
    work_pcm_16k: [f64; MAX_YIN_WORK_SAMPLES],
    yin_diff: [f64; MAX_YIN_LAG],
    yin_cmndf: [f64; MAX_YIN_LAG],
}

impl VocalAcousticAnalyzer {
    pub fn new(config: VocalAnalyzerConfig) -> Result<Self, DspError> { ... }
    pub fn analyze_pcm_f32(&mut self, pcm_mono: &[f32]) -> Result<VocalBiomarkerFrame, DspError> { ... }
    pub fn analyze_pcm_f64(&mut self, pcm_mono: &[f64]) -> Result<VocalBiomarkerFrame, DspError> { ... }
    pub fn current_pause_ratio(&self) -> f64 { ... }
}
```

---

### 3.4 Modulo 3: `crates/ares-telemetry-ingest/src/waveform_rr_extractor.rs`

#### 3.4.1 Formulazione Matematica (`Pan-Tompkins` Adattivo + Criterio di Malik + HRV)
1. **Catena di Pre-Elaborazione QRS (`125 Hz <= f_s <= 500 Hz`):**
   - **Stadio 1 (Bandpass `5.0–15.0 Hz`):** Cascata di 2 sezioni `BiquadSos` Butterworth passa-banda pre-deformate in frequenza ($\Omega = \tan(\pi f / f_s)$) per concentrare l'energia del complesso QRS sopprimendo l'onda P/T, il baseline wander respiratorio e il rumore miografico.
   - **Stadio 2 (Derivata a 5 Punti Normalizzata in $f_s$):**
     $$y_d[n] = \frac{f_s}{8}\Big(-x_f[n-4] - 2x_f[n-3] + 2x_f[n-1] + x_f[n]\Big)$$
   - **Stadio 3 (Quadratura Non Lineare):**
     $$y_{\text{sq}}[n] = \big(y_d[n]\big)^2$$
   - **Stadio 4 (Moving-Window Integration `150 ms` in $O(1)$):**  
     Con lunghezza $N_{\text{mwi}} = \operatorname{clamp}\!\big(\operatorname{round}(0.150 \cdot f_s),\, 8,\, 128\big)$ e buffer circolare `mwi_ring: [f64; 128]`:
     $$y_{\text{mwi}}[n] = \frac{1}{N_{\text{mwi}}}\sum_{k=0}^{N_{\text{mwi}}-1} y_{\text{sq}}[n-k]$$
     Ogni `1024` campioni l'accumulatore della somma mobile viene ricalcolato esattamente sul buffer circolare di `128` elementi per azzerare qualsiasi deriva floating-point sul lungo periodo (900 Sol marziani).

2. **Doppia Soglia Adattiva (`SPKI` / `NPKI`), Refrattarieta `200 ms`, Discriminazione Onda T e Searchback:**
   - **Blanking Refrattario Assoluto:** $\Delta t_{\text{ref}} = 0.200\,\text{s}$ ($300\,\text{bpm}$ limite superiore fisiologico).
   - **Discriminazione Onda T (`200–360 ms`):** Se un massimo locale cade entro $[200, 360]\,\text{ms}$ dall'ultimo QRS valido e presenta pendenza massima $|y_d|_{\max} < 0.50 \cdot |y_{d,\text{prev\_QRS}}|_{\max}$, viene classificato come onda T iperacuta e aggiornato su `NPKI`.
   - **Aggiornamento `SPKI`, `NPKI` e Soglie:**
     $$\text{SPKI} \leftarrow 0.125\,\text{PEAKI} + 0.875\,\text{SPKI} \quad (\text{picco QRS})$$
     $$\text{NPKI} \leftarrow 0.125\,\text{PEAKI} + 0.875\,\text{NPKI} \quad (\text{picco di rumore})$$
     $$\text{TH}_{I1} = \text{NPKI} + 0.25\,(\text{SPKI} - \text{NPKI}), \qquad \text{TH}_{I2} = 0.50\,\text{TH}_{I1}$$
   - **Searchback per Battito Mancato:** Se trascorre un intervallo $\Delta t > 1.66 \cdot \overline{\text{RR}}_{8}$ senza superamento di $\text{TH}_{I1}$, il massimo candidato memorizzato in `searchback_ring: [CandidatePeak; 16]` con $\text{PEAKI} > \text{TH}_{I2}$ e $\Delta t > 0.200\,\text{s}$ viene promosso a battito QRS ($\text{SPKI} \leftarrow 0.25\,\text{PEAKI} + 0.75\,\text{SPKI}$).
   - **Raffinamento Sub-Campione del Timestamp R:** Attorno all'istante fiduciale viene localizzato il massimo di $|x_f[k]|$ in una finestra di $\pm 40\,\text{ms}$ e applicata l'interpolazione parabolica sui 3 campioni adiacenti, riducendo l'errore di quantizzazione temporale da $8.0\,\text{ms}$ (a $125\,\text{Hz}$) a $< 0.8\,\text{ms}$.

3. **Rigetto Battiti Ectopici (Malik $\pm 20\%$) ed Equazioni HRV Time-Domain:**
   - Un intervallo $\text{RR}_k = 1000.0 \cdot (t_{R,k} - t_{R,k-1})$ e accettato come intervallo sinusale normale-normale (`NN`) se e solo se:
     $$300.0\,\text{ms} \le \text{RR}_k \le 2000.0\,\text{ms} \qquad \land \qquad \left(\text{nessun riferimento precedente} \;\lor\; \frac{|\text{RR}_k - \tilde{\text{NN}}_5|}{\tilde{\text{NN}}_5} \le 0.20\right)$$
     dove $\tilde{\text{NN}}_5$ e la mediana degli ultimi $\le 5$ intervalli NN validi.
   - **Invariante di Contiguita per Differenze Successive:** Se un battito $k$ viene rigettato come ectopico o artefatto, il flag `prev_rr_was_valid_nn` viene azzerato in modo che il successivo intervallo valido $\text{NN}_{k+1}$ **non** formi mai una falsa differenza consecutiva $\Delta\text{NN}$ attraverso il gap!
   - Con $M$ intervalli NN validi nel buffer (`M >= min_nn_intervals`, default `8`) e $P$ coppie consecutive valide $\Delta\text{NN}_j$ (`P >= min_consecutive_pairs`, default `6`):
     $$\text{RMSSD} = \sqrt{\frac{1}{P}\sum_{j=1}^{P} (\Delta\text{NN}_j)^2}\ \text{[ms]}, \qquad \text{SDNN} = \sqrt{\frac{1}{M - 1}\sum_{i=1}^{M} (\text{NN}_i - \overline{\text{NN}})^2}\ \text{[ms]}$$
     $$\text{pNN50} = 100.0 \cdot \frac{\big|\{j \in \{1..P\} : |\Delta\text{NN}_j| > 50.0\,\text{ms}\}\big|}{P}\ \text{[\%]}$$
   - Finche $M < M_{\min}$ o $P < P_{\min}$, `rmssd_ms`, `sdnn_ms` e `pnn50_pct` restano tutti `Option<f64>::None`.

#### 3.4.2 Firme Concrete in Puro Rust (`crates/ares-telemetry-ingest/src/waveform_rr_extractor.rs`)
```rust
//! Fase 31 (L3): Rilevatore QRS Pan-Tompkins in Puro Rust per forme d'onda 125-500 Hz,
//! rigetto ectopie secondo Malik (+/- 20%) e calcolo RMSSD / SDNN / pNN50.
//!
//! INVARIANTE CRITICO ISSUE #11: I CSV numerici a 1 Hz (`BidmcReplayer`) non passano MAI
//! per questo modulo e mantengono rigorosamente `rmssd_ms: None` + `BEAT_INTERVALS_NOT_AVAILABLE`.

use crate::radar_csi_dsp::{BiquadSos, DspError};
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

pub const MAX_MWI_WINDOW: usize = 128;
pub const MAX_SIGNAL_HISTORY: usize = 256;
pub const NN_RING_CAPACITY: usize = 128;
pub const SEARCHBACK_CANDIDATES: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PanTompkinsConfig {
    pub sample_rate_hz: f64,
    pub refractory_period_ms: f64,
    pub rr_min_ms: f64,
    pub rr_max_ms: f64,
    pub malik_ectopic_quotient: f64,
    pub min_nn_intervals: usize,
    pub min_consecutive_pairs: usize,
}

impl PanTompkinsConfig {
    pub fn for_sample_rate(sample_rate_hz: f64) -> Result<Self, DspError> {
        if !sample_rate_hz.is_finite() || !(125.0..=500.0).contains(&sample_rate_hz) {
            return Err(DspError::UnsupportedWaveformSampleRate { sample_rate_hz });
        }
        Ok(Self {
            sample_rate_hz,
            refractory_period_ms: 200.0,
            rr_min_ms: 300.0,
            rr_max_ms: 2000.0,
            malik_ectopic_quotient: 0.20,
            min_nn_intervals: 8,
            min_consecutive_pairs: 6,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct DetectedQrsBeat {
    pub r_peak_time_s: f64,
    pub rr_interval_ms: Option<f64>,
    pub accepted_as_sinus_nn: bool,
    pub triggered_by_searchback: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TimeDomainHrvMetrics {
    pub valid_nn_count: usize,
    pub consecutive_pair_count: usize,
    pub rejected_ectopic_count: u64,
    pub mean_hr_bpm: Option<f64>,
    pub rmssd_ms: Option<f64>,
    pub sdnn_ms: Option<f64>,
    pub pnn50_pct: Option<f64>,
    pub validation_status: ModelValidationStatus,
}

#[derive(Debug, Clone)]
pub struct WaveformRrExtractor {
    config: PanTompkinsConfig,
    bp_stage1: BiquadSos,
    bp_stage2: BiquadSos,
    deriv_ring: [f64; 5],
    deriv_idx: usize,
    mwi_len: usize,
    mwi_ring: [f64; MAX_MWI_WINDOW],
    mwi_idx: usize,
    mwi_running_sum: f64,
    filtered_history: [f64; MAX_SIGNAL_HISTORY],
    slope_history: [f64; MAX_SIGNAL_HISTORY],
    sample_counter: u64,
    spki: f64,
    npki: f64,
    threshold_i1: f64,
    threshold_i2: f64,
    last_qrs_sample: Option<u64>,
    last_qrs_time_s: Option<f64>,
    last_qrs_max_slope: f64,
    prev_beat_was_valid_nn: bool,
    last_valid_nn_ms: Option<f64>,
    nn_ring: [f64; NN_RING_CAPACITY],
    nn_write_idx: usize,
    nn_len: usize,
    diff_nn_ring: [f64; NN_RING_CAPACITY],
    diff_write_idx: usize,
    diff_len: usize,
    rejected_ectopic_count: u64,
}

impl WaveformRrExtractor {
    pub fn new(config: PanTompkinsConfig) -> Result<Self, DspError> { ... }
    pub fn push_sample(&mut self, raw_ecg_mv: f64) -> Option<DetectedQrsBeat> { ... }
    pub fn push_block(&mut self, samples: &[f64]) -> TimeDomainHrvMetrics { ... }
    pub fn current_hrv_metrics(&self) -> TimeDomainHrvMetrics { ... }
}
```

---

### 3.5 Integrazione Retrocompatibile in `scenario_overlay.rs` e Invariante Issue `#11`
Per collegare i tre moduli DSP alla struct `ares_core_types::telemetry::Biometrics` senza alterare nessuna delle funzioni esistenti (`merge_biometrics_with_scenario`, `merge_biometrics_with_rmssd`, `biometrics_with_signal_quality`), `crates/ares-telemetry-ingest/src/scenario_overlay.rs` aggiunge:

```rust
use crate::radar_csi_dsp::RadarVitalEstimate;
use crate::vocal_acoustic_dsp::VocalBiomarkerFrame;
use crate::waveform_rr_extractor::TimeDomainHrvMetrics;

/// Snapshot opzionale dei moduli DSP Level-1 GATHER da fondere con la riga telemetrica.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct GatherDspOverlay {
    pub radar: Option<RadarVitalEstimate>,
    pub vocal: Option<VocalBiomarkerFrame>,
    pub waveform_hrv: Option<TimeDomainHrvMetrics>,
}

/// Fonde una riga `BidmcNumericRow`, lo scenario operativo e i moduli DSP Level-1 GATHER:
/// - Se `overlay.waveform_hrv` e `None` (es. CSV BIDMC 1 Hz), `SqiFilter::evaluate_row_with_rmssd`
///   riceve `None` e preserva rigorosamente `rmssd_ms: None` + `BeatIntervalsNotAvailable` (Issue #11).
/// - Se `overlay.waveform_hrv` contiene metriche beat-to-beat verificate (`rmssd_ms: Some(_)`),
///   popola `rmssd_ms`, `sdnn_ms` e `pnn50_pct` reali (non scalati euristicamente) con `hrv_unavailable_reason: None`.
/// - Se `overlay.vocal` e presente ma `voiced == false`, emette `vocal_f0_hz: None` e `vocal_jitter_pct: None`
///   registrando `"vocal_f0_hz"` e `"vocal_jitter_pct"` in `missing_channels`.
/// - Se `row.hr_bpm` o `row.resp_brpm` sono `None` ma `overlay.radar` ha `radar_sqi >= 0.70`,
///   consente il fallback contactless per HR/RESP mantenendo intatta la nullabilita HRV.
pub fn merge_biometrics_with_gather_dsp(
    row: &BidmcNumericRow,
    scenario: &StressTestScenarioInput,
    sqi_filter: &mut SqiFilter,
    overlay: &GatherDspOverlay,
) -> (Biometrics, SqiEvaluation) { ... }
```

---

## 4. Step-by-Step Implementation Checklist

- [ ] **Step 1 — Definizione di `DspError` e Aggiornamento di `IngestError`:**
  - Definire `DspError` (`#[derive(Debug, Error, Clone, PartialEq)]`) con tutte le varianti tipizzate di validazione parametri e stabilita polare.
  - Aggiornare `crates/ares-telemetry-ingest/src/bidmc_replayer.rs` aggiungendo `IngestError::Dsp(#[from] DspError)` senza modificare ne il parser `BidmcReplayer` ne `BidmcNumericRow`.
- [ ] **Step 2 — Implementazione di `crates/ares-telemetry-ingest/src/radar_csi_dsp.rs`:**
  - Implementare `RadarCarrierBand` (`MmWave60Ghz`, `WifiCsi5Ghz`, `Custom`), `BiquadSos` in Direct-Form II Transposed con controllo di Jury (`poles_inside_unit_circle()`) e guardia automatica di Nyquist (`notch_hz < 0.495 * sample_rate_hz`).
  - Implementare `RadarCsiProcessor` con tracker EMA clutter $I/Q$, phase unwrapping euclideo continuo, conversione dimensionale $\Delta\phi(t) = 4\pi d(t)/\lambda$, cascata notch `60/120 Hz`, filtri passa-banda respiratorio (`0.1–0.6 Hz`) e cardiaco (`0.8–2.5 Hz`), decimazione a `25 Hz` su `[f64; 512]` e gate `SQI_MIN_VALID_THRESHOLD = 0.70`.
- [ ] **Step 3 — Implementazione di `crates/ares-telemetry-ingest/src/vocal_acoustic_dsp.rs`:**
  - Implementare `VocalAcousticAnalyzer` con decimazione interna anti-aliasing `48 kHz -> 16 kHz`, tracker VAD/SNR e finestra circolare `pause_ratio` (`[bool; 128]`).
  - Implementare i passi 1–5 dell'algoritmo `YIN` (`d_t(tau)`, `d'_t(tau)`, ricerca a soglia assoluta `0.15`, interpolazione parabolica sub-campione), l'estrazione ciclo-ciclo di `vocal_jitter_pct`, `vocal_shimmer_pct`, `vocal_shimmer_db`, `hnr_db` e `spectral_tilt_db`, assicurando `Option<f64>::None` per tutti i frame silenti o non vocalizzati.
- [ ] **Step 4 — Implementazione di `crates/ares-telemetry-ingest/src/waveform_rr_extractor.rs`:**
  - Implementare `WaveformRrExtractor` per frequenze `125.0..=500.0 Hz` con bandpass `5–15 Hz`, derivata a 5 punti scalata in frequenza, quadratura, integrazione mobile `150 ms` con ri-sincronizzazione periodica anti-drift, soglie adattive `SPKI`/`NPKI`, periodo refrattario `200 ms`, discriminazione onda T e *searchback* a `1.66 * RR_avg`.
  - Implementare il filtro anti-ectopia (`300..=2000 ms` + criterio di Malik $\pm 20\%$) con tutela della contiguita delle coppie successive $\Delta\text{NN}$ e calcolo esatto di `RMSSD`, `SDNN` e `pNN50`.
- [ ] **Step 5 — Integrazione in `scenario_overlay.rs` ed Esportazione in `lib.rs`:**
  - Aggiungere `GatherDspOverlay` e `merge_biometrics_with_gather_dsp` in `crates/ares-telemetry-ingest/src/scenario_overlay.rs` mantenendo invariate le funzioni esistenti.
  - Esportare `radar_csi_dsp`, `vocal_acoustic_dsp`, `waveform_rr_extractor` e i relativi simboli pubblici in `crates/ares-telemetry-ingest/src/lib.rs` e allineare `crates/ares-telemetry-ingest/README.md`.
- [ ] **Step 6 — Verifica Deterministica Completa e Zero-Regression Probe:**
  - Eseguire `cargo test -p ares-telemetry-ingest -- --nocapture`, `cargo clippy --workspace -- -D warnings` e `./scripts/agent_probe.sh --fast`, verificando `0` warning, `0` `.unwrap()`/`.expect()` in `crates/*/src/`, e il passaggio del 100% dei `126+` test del workspace.

---

## 5. Deterministic Verification & PhysioNet/Synthetic Signal Tests

1. **`test_radar_biquad_notch_60_120hz_stability_and_eclss_harmonic_suppression` (`radar_csi_dsp.rs`):**
   - Sintetizza a $f_s = 250.0\,\text{Hz}$ (durata $30.0\,\text{s}$, portante `MmWave60Ghz` $\lambda \approx 4.9965\,\text{mm}$) un segnale baseband $I(t), Q(t)$ affetto da forte clutter statico $(I_{\text{DC}} = 2.5, Q_{\text{DC}} = -1.8)$, spostamento respiratorio $d_{\text{resp}}(t) = 6.0\,\text{mm} \sin(2\pi \cdot 0.25\,t)$ (`15.0 brpm`), spostamento cardiaco $d_{\text{card}}(t) = 0.35\,\text{mm} \sin(2\pi \cdot 1.10\,t)$ (`66.0 bpm`) e disturbo meccanico delle ventole ECLSS a `60.0 Hz` e `120.0 Hz` di ampiezza $10\times$ superiore alla componente cardiaca.
   - Verifica che: (a) `poles_inside_unit_circle() == true` per tutte le sezioni SOS; (b) l'attenuazione spettrale a `60 Hz` e `120 Hz` superi `35 dB`; (c) dopo il transitorio iniziale, `RadarVitalEstimate` recuperi `resp_rate_brpm` entro `15.0 +/- 1.0 brpm` e `heart_rate_bpm` entro `66.0 +/- 2.0 bpm` con `radar_sqi >= 0.70` e `validation_status == ModelValidationStatus::IllustrativeUnvalidated`.
2. **`test_radar_low_snr_or_empty_bunk_emits_none_vitals` (`radar_csi_dsp.rs`):**
   - Alimenta `RadarCsiProcessor` con solo rumore bianco / clutter puro a varianza minima e verifica che `radar_sqi < 0.70`, `heart_rate_bpm == None` e `resp_rate_brpm == None` (mai `Some(0.0)`), verificando inoltre la guardia di Nyquist a $f_s = 200.0\,\text{Hz}$ (`eclss_notch_active == [true, false]`).
3. **`test_vocal_yin_sub_hz_accuracy_jitter_shimmer_and_pause_ratio` (`vocal_acoustic_dsp.rs`):**
   - Sintetizza sia a `16 kHz` sia a `48 kHz` un treno glottico armonico $\sum_{h=1}^{6} h^{-1} \sin(2\pi h F_0 t)$ con $F_0 = 132.5\,\text{Hz}$ noto analiticamente, seguito da una sequenza con modulazione ciclica di periodo dell'$1.0\%$ e modulazione d'ampiezza del $3.0\%$, alternata al $40\%$ di frame silenti.
   - Verifica errore $|\hat{F}_0 - 132.5| < 0.5\,\text{Hz}$, `vocal_jitter_pct` finito e coerente con la perturbazione iniettata, `hnr_db > 15.0`, e `pause_ratio` convergente a `0.40 +/- 0.05`.
4. **`test_vocal_silence_and_unvoiced_noise_strictly_return_none_never_zero` (`vocal_acoustic_dsp.rs`):**
   - Testa buffer di zeri assoluti, rumore gaussiano a banda larga (fricativa sorda) e segnali con `SNR < 10 dB`: verifica che `voiced == false` e che `vocal_f0_hz`, `vocal_jitter_pct`, `vocal_shimmer_pct`, `vocal_shimmer_db` e `hnr_db` siano tutti rigorosamente `None`.
5. **`test_pan_tompkins_125hz_and_500hz_qrs_detection_and_exact_rmssd` (`waveform_rr_extractor.rs`):**
   - Genera tracciati ECG sintetici realistici (complessi P-QRS-T morfologici) sia a `125.0 Hz` (frequenza nativa `PhysioNet BIDMC Signals`) sia a `500.0 Hz` (`PhysioNet CEBS`) con serie nota di intervalli R-R alternati $800\,\text{ms} \leftrightarrow 840\,\text{ms}$ ($\Delta\text{NN} = \pm 40\,\text{ms}$, $\text{RMSSD}_{\text{esatto}} = 40.0\,\text{ms}$, $\text{pNN50} = 0.0\%$) e una seconda serie $760\,\text{ms} \leftrightarrow 840\,\text{ms}$ ($\Delta\text{NN} = \pm 80\,\text{ms}$, $\text{RMSSD}_{\text{esatto}} = 80.0\,\text{ms}$, $\text{pNN50} = 100.0\%$).
   - Verifica che `WaveformRrExtractor` rilevi il `100%` dei battiti dopo il warm-up adattivo, stimi `rmssd_ms` entro `+/- 2.5 ms` dal valore analitico a `500 Hz` (ed entro `+/- 4.0 ms` a `125 Hz` grazie al raffinamento parabolico), e rigetti correttamente un battito prematuro ectopico (PVC a $420\,\text{ms}$, $> 20\%$ deviazione di Malik) incrementando `rejected_ectopic_count` senza corrompere `RMSSD`.
6. **`test_issue_11_bidmc_1hz_numeric_csv_never_populates_rmssd_while_waveform_does` (`scenario_overlay.rs` & `waveform_rr_extractor.rs`):**
   - **Parte A (Invariante Issue `#11` su `data/bidmc/bidmc_01_Numerics.csv`):** Esegue il replay di tutte le `481` righe a `1 Hz` di `bidmc_01_Numerics.csv` tramite `BidmcReplayer` + `SqiFilter` + `merge_biometrics_with_gather_dsp(..., &GatherDspOverlay::default())` e asserisce su ogni singola riga: `bio.rmssd_ms == None`, `bio.sdnn_ms == None`, `bio.pnn50_pct == None`, `bio.lf_hf_ratio == None`, `bio.hrv_unavailable_reason == Some(HrvUnavailableReason::BeatIntervalsNotAvailable)`, `"BEAT_INTERVALS_NOT_AVAILABLE"` presente in `sqi_eval.quality_flags`, e `PanTompkinsConfig::for_sample_rate(1.0)` rifiutato con `Err(DspError::UnsupportedWaveformSampleRate { sample_rate_hz: 1.0 })`.
   - **Parte B (Attivazione Legittima da Stream `125–500 Hz`):** Alimenta `WaveformRrExtractor` a `250.0 Hz` per `15.0 s`, passa `Some(extractor.current_hrv_metrics())` in `GatherDspOverlay`, e verifica che `bio.rmssd_ms.is_some()`, `bio.sdnn_ms.is_some()`, `bio.pnn50_pct.is_some()`, `bio.hrv_unavailable_reason == None` e assenza di `"BEAT_INTERVALS_NOT_AVAILABLE"` in `quality_flags`.
7. **`test_dsp_hot_path_latency_budget_under_15us_and_nan_inf_resilience`:**
   - Inietta campioni patologici (`f64::NAN`, `f64::INFINITY`, `f64::NEG_INFINITY`) in tutti e tre i moduli verificando l'assenza totale di `panic!` o propagazione `NaN` nelle uscite, e misura su `10_000` iterazioni la latenza media per aggiornamento verificando il pieno rispetto del budget `< 15 us`.
