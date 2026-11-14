use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;
use ares_core_types::telemetry::{
    HrvUnavailableReason, ModelValidationStatus, StressTestScenarioInput,
};
use ares_telemetry_ingest::bidmc_replayer::{BidmcNumericRow, BidmcReplayer, IngestError};
use ares_telemetry_ingest::radar_csi_dsp::{
    BiquadSos, DspError, RadarCarrierBand, RadarCsiConfig, RadarCsiProcessor,
};
use ares_telemetry_ingest::scenario_overlay::{
    GatherDspOverlay, merge_biometrics_with_gather_dsp,
};
use ares_telemetry_ingest::sqi_filter::SqiFilter;
use ares_telemetry_ingest::vocal_acoustic_dsp::{VocalAcousticAnalyzer, VocalAnalyzerConfig};
use ares_telemetry_ingest::waveform_rr_extractor::{PanTompkinsConfig, WaveformRrExtractor};
use core::f64::consts::PI;
use std::path::PathBuf;
use std::time::Instant;

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn next_normal(&mut self) -> f64 {
        // Box-Muller using two uniform samples in (0, 1].
        let u1 = (((self.next_u64() >> 11) as f64) + 1.0) / ((1u64 << 53) as f64 + 1.0);
        let u2 = ((self.next_u64() >> 11) as f64) / ((1u64 << 53) as f64);
        (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
    }
}

fn default_scenario() -> StressTestScenarioInput {
    StressTestScenarioInput {
        source_record_id: "bidmc_01".to_string(),
        flight_day: 90,
        ared_daily_load_kgf: 125.0,
        radiation_dose_rate_msv_d: 0.65,
        lbnp_active: false,
        lbnp_pressure_mmhg: 0.0,
        pocus_thrombus_confirmed: false,
        systolic_bp_drop_mmhg: 0.0,
    }
}

fn synthesize_ecg_from_rr_ms(sample_rate_hz: f64, rr_series_ms: &[f64]) -> Vec<f64> {
    let mut beat_times_s = Vec::with_capacity(rr_series_ms.len() + 1);
    let mut t = 0.50;
    beat_times_s.push(t);
    for &rr_ms in rr_series_ms {
        t += rr_ms / 1000.0;
        beat_times_s.push(t);
    }
    let total_s = t + 0.60;
    let num_samples = (total_s * sample_rate_hz).ceil() as usize;
    let mut out = vec![0.0; num_samples];

    let gauss = |dt: f64, center: f64, sigma: f64, amp: f64| -> f64 {
        let z = (dt - center) / sigma;
        amp * (-0.5 * z * z).exp()
    };

    for (i, slot) in out.iter_mut().enumerate() {
        let sample_t = (i as f64) / sample_rate_hz;
        let mut v = 0.0;
        for &bt in &beat_times_s {
            let dt = sample_t - bt;
            if dt.abs() > 0.45 {
                continue;
            }
            v += gauss(dt, -0.160, 0.028, 0.12); // P wave
            v += gauss(dt, -0.022, 0.008, -0.15); // Q
            v += gauss(dt, 0.000, 0.009, 1.35); // R
            v += gauss(dt, 0.022, 0.009, -0.25); // S
            v += gauss(dt, 0.250, 0.042, 0.28); // T wave
        }
        *slot = v;
    }
    out
}

#[test]
fn test_radar_biquad_notch_60_120hz_stability_and_eclss_harmonic_suppression() {
    let fs = 250.0;
    let config = RadarCsiConfig {
        sample_rate_hz: fs,
        carrier_band: RadarCarrierBand::MmWave60Ghz,
        eclss_fundamental_hz: 60.0,
        notch_q_factor: 30.0,
        clutter_tau_s: 15.0,
    };
    let mut proc = RadarCsiProcessor::new(config)
        .unwrap_or_else(|e| panic!("RadarCsiProcessor::new failed: {e}"));
    assert!(proc.notch_sections_stable());

    // Direct >35 dB notch attenuation verification at 60 Hz and 120 Hz.
    for notch_hz in [60.0, 120.0] {
        let mut sos = BiquadSos::design_notch(fs, notch_hz, 30.0)
            .unwrap_or_else(|e| panic!("design_notch failed: {e}"));
        assert!(sos.poles_inside_unit_circle());
        let mut out_sq_sum = 0.0;
        let total = 4000usize;
        for n in 0..total {
            let x = (2.0 * PI * notch_hz * (n as f64) / fs).sin();
            let y = sos.step(x);
            if n >= 3500 {
                out_sq_sum += y * y;
            }
        }
        let rms_in = (0.5_f64).sqrt();
        let rms_out = (out_sq_sum / 500.0).sqrt().max(1e-12);
        let atten_db = 20.0 * (rms_in / rms_out).log10();
        assert!(
            atten_db > 35.0,
            "Expected >35 dB notch attenuation at {notch_hz} Hz, got {atten_db:.2} dB"
        );
    }

    // End-to-end 30 s baseband I/Q simulation with static clutter + 60/120 Hz ECLSS fan disturbance.
    let lambda_m = RadarCarrierBand::MmWave60Ghz
        .wavelength_m()
        .unwrap_or_else(|e| panic!("wavelength_m failed: {e}"));
    let total_samples = (30.0 * fs) as usize;
    let mut last_est = proc.latest_estimate();
    for n in 0..total_samples {
        let t = (n as f64) / fs;
        let d_resp_mm = 6.0 * (2.0 * PI * 0.25 * t).sin(); // 15.0 brpm
        let d_card_mm = 0.35 * (2.0 * PI * 1.10 * t).sin(); // 66.0 bpm
        let d_m = (d_resp_mm + d_card_mm) * 1e-3;
        let phi = 4.0 * PI * d_m / lambda_m;

        // 10x cardiac interference at 60 Hz & 120 Hz in baseband I/Q + static bulkhead clutter.
        let eclss_i = 0.8 * (2.0 * PI * 60.0 * t).sin() + 0.6 * (2.0 * PI * 120.0 * t).cos();
        let eclss_q = 0.8 * (2.0 * PI * 60.0 * t).cos() + 0.6 * (2.0 * PI * 120.0 * t).sin();
        let i_sample = 2.5 + phi.cos() + eclss_i;
        let q_sample = -1.8 + phi.sin() + eclss_q;
        last_est = proc.push_iq_sample(i_sample, q_sample);
    }

    assert_eq!(last_est.eclss_notch_active, [true, true]);
    assert_eq!(
        last_est.validation_status,
        ModelValidationStatus::IllustrativeUnvalidated
    );
    assert!(
        last_est.radar_sqi >= SQI_MIN_VALID_THRESHOLD,
        "Expected radar_sqi >= 0.70, got {}",
        last_est.radar_sqi
    );
    let resp = last_est
        .resp_rate_brpm
        .unwrap_or_else(|| panic!("Expected Some(resp_rate_brpm)"));
    let hr = last_est
        .heart_rate_bpm
        .unwrap_or_else(|| panic!("Expected Some(heart_rate_bpm)"));
    assert!(
        (resp - 15.0).abs() <= 1.0,
        "Expected resp_rate_brpm near 15.0, got {resp}"
    );
    assert!(
        (hr - 66.0).abs() <= 2.0,
        "Expected heart_rate_bpm near 66.0, got {hr}"
    );
}

#[test]
fn test_radar_low_snr_or_empty_bunk_emits_none_vitals_and_nyquist_guard() {
    // 1. Nyquist guard at 200 Hz (120 Hz >= 0.495 * 200 Hz = 99 Hz -> identity).
    let proc_200 = RadarCsiProcessor::new(RadarCsiConfig {
        sample_rate_hz: 200.0,
        ..RadarCsiConfig::default()
    })
    .unwrap_or_else(|e| panic!("200 Hz config failed: {e}"));
    assert_eq!(proc_200.latest_estimate().eclss_notch_active, [true, false]);

    // 2. Empty bunk / pure static clutter with minimal sensor floor noise.
    let mut empty_proc = RadarCsiProcessor::new(RadarCsiConfig::default())
        .unwrap_or_else(|e| panic!("default radar config failed: {e}"));
    let mut rng = SplitMix64::new(0xA11C_E001);
    for _ in 0..5000 {
        let est = empty_proc.push_iq_sample(
            2.5 + 1e-5 * rng.next_normal(),
            -1.8 + 1e-5 * rng.next_normal(),
        );
        assert!(est.displacement_mm.is_finite());
        assert!(est.radar_sqi.is_finite());
    }
    let empty_est = empty_proc.latest_estimate();
    assert!(empty_est.radar_sqi < SQI_MIN_VALID_THRESHOLD);
    assert_eq!(empty_est.heart_rate_bpm, None);
    assert_eq!(empty_est.resp_rate_brpm, None);

    // 3. Broadband white noise (non-periodic) must also fail SQI gate.
    let mut noise_proc = RadarCsiProcessor::new(RadarCsiConfig::default())
        .unwrap_or_else(|e| panic!("default radar config failed: {e}"));
    for _ in 0..5000 {
        let _ = noise_proc.push_iq_sample(0.4 * rng.next_normal(), 0.4 * rng.next_normal());
    }
    let noise_est = noise_proc.latest_estimate();
    assert!(
        noise_est.radar_sqi < SQI_MIN_VALID_THRESHOLD,
        "Expected white noise SQI < 0.70, got {}",
        noise_est.radar_sqi
    );
    assert_eq!(noise_est.heart_rate_bpm, None);
    assert_eq!(noise_est.resp_rate_brpm, None);

    // 4. Configuration error guards.
    assert!(matches!(
        RadarCsiProcessor::new(RadarCsiConfig {
            sample_rate_hz: 10.0,
            ..RadarCsiConfig::default()
        }),
        Err(DspError::InvalidRadarSampleRate { .. })
    ));
    assert!(matches!(
        RadarCarrierBand::Custom { carrier_hz: 100.0 }.wavelength_m(),
        Err(DspError::InvalidCarrierFrequency { .. })
    ));
    assert!(matches!(
        BiquadSos::design_notch(250.0, 60.0, 0.05),
        Err(DspError::InvalidFilterQualityFactor { .. })
    ));
    assert!(matches!(
        BiquadSos::from_coefficients(1.0, 0.0, 0.0, 0.0, 1.05),
        Err(DspError::UnstableBiquadPoles { .. })
    ));
}

#[test]
fn test_vocal_yin_sub_hz_accuracy_jitter_shimmer_and_pause_ratio() {
    let target_f0 = 132.5;

    for sample_rate_hz in [16_000u32, 48_000u32] {
        let mut analyzer = VocalAcousticAnalyzer::new(VocalAnalyzerConfig {
            sample_rate_hz,
            ..VocalAnalyzerConfig::default()
        })
        .unwrap_or_else(|e| panic!("VocalAcousticAnalyzer::new failed: {e}"));

        // Clean harmonic glottal pulse train (6 harmonics).
        let frame_len = if sample_rate_hz == 48_000 { 3072 } else { 1024 };
        let clean_frame: Vec<f64> = (0..frame_len)
            .map(|n| {
                let t = (n as f64) / f64::from(sample_rate_hz);
                (1..=6)
                    .map(|h| (2.0 * PI * f64::from(h) * target_f0 * t).sin() / f64::from(h))
                    .sum::<f64>()
                    * 0.25
            })
            .collect();

        let res = analyzer
            .analyze_pcm_f64(&clean_frame)
            .unwrap_or_else(|e| panic!("analyze_pcm_f64 failed: {e}"));
        assert!(res.voiced);
        let f0 = res
            .vocal_f0_hz
            .unwrap_or_else(|| panic!("Expected Some(vocal_f0_hz)"));
        assert!(
            (f0 - target_f0).abs() < 0.5,
            "At {sample_rate_hz} Hz expected F0 within 0.5 Hz of {target_f0}, got {f0}"
        );
        let hnr = res.hnr_db.unwrap_or_else(|| panic!("Expected Some(hnr_db)"));
        assert!(hnr > 15.0, "Expected HNR > 15 dB, got {hnr}");
        assert!(res.spectral_tilt_db.is_some());
    }

    // Perturbed sequence (1% period modulation, 3% amplitude modulation) + 40% silence frames.
    let fs = 16_000.0;
    let mut analyzer = VocalAcousticAnalyzer::new(VocalAnalyzerConfig::default())
        .unwrap_or_else(|e| panic!("VocalAcousticAnalyzer::new failed: {e}"));

    let frame_len = 1024usize;
    let mut voiced_frame = vec![0.0_f32; frame_len];
    // Generate cycle-by-cycle with exact 1.0% period modulation and 3.0% amplitude modulation
    // around target_f0 = 132.5 Hz (each cycle starts at u=0, peak at u=0.25, trough at u=0.75).
    let mut phase_cycles = 0usize;
    let mut u = 0.0_f64;
    for slot in &mut voiced_frame {
        let freq_mod = if phase_cycles.is_multiple_of(2) {
            target_f0 * 1.005
        } else {
            target_f0 * 0.995
        };
        let amp_mod = if phase_cycles.is_multiple_of(2) {
            1.0
        } else {
            0.97
        };
        let phi = 2.0 * PI * u;
        let s = (phi.sin() + 0.35 * (2.0 * phi).sin() + 0.15 * (3.0 * phi).sin()) * 0.25 * amp_mod;
        *slot = s as f32;
        u += freq_mod / fs;
        if u >= 1.0 {
            u -= 1.0;
            phase_cycles += 1;
        }
    }
    let silent_frame = vec![0.0_f32; frame_len];

    let mut last_voiced = None;
    for i in 0..50 {
        let is_silent = (i % 10) >= 6; // 40% silence
        let frame = if is_silent {
            &silent_frame
        } else {
            &voiced_frame
        };
        let out = analyzer
            .analyze_pcm_f32(frame)
            .unwrap_or_else(|e| panic!("analyze_pcm_f32 failed: {e}"));
        if !is_silent {
            last_voiced = Some(out);
        }
    }

    let lv = last_voiced.unwrap_or_else(|| panic!("Expected voiced output"));
    assert!(lv.voiced);
    let final_pause_ratio = analyzer.current_pause_ratio();
    assert!(
        (final_pause_ratio - 0.40).abs() <= 0.05,
        "Expected pause_ratio near 0.40, got {final_pause_ratio}"
    );
    let jitter = lv
        .vocal_jitter_pct
        .unwrap_or_else(|| panic!("Expected Some(vocal_jitter_pct)"));
    let shimmer = lv
        .vocal_shimmer_pct
        .unwrap_or_else(|| panic!("Expected Some(vocal_shimmer_pct)"));
    assert!(jitter.is_finite() && (0.2..=3.5).contains(&jitter));
    assert!(shimmer.is_finite() && (0.5..=7.0).contains(&shimmer));
    assert!(lv.vocal_shimmer_db.is_some_and(f64::is_finite));
}

#[test]
fn test_vocal_silence_and_unvoiced_noise_strictly_return_none_never_zero() {
    let mut analyzer = VocalAcousticAnalyzer::new(VocalAnalyzerConfig::default())
        .unwrap_or_else(|e| panic!("VocalAcousticAnalyzer::new failed: {e}"));

    // 1. Absolute zeros.
    let zeros = vec![0.0_f64; 1024];
    let z_out = analyzer
        .analyze_pcm_f64(&zeros)
        .unwrap_or_else(|e| panic!("zeros analyze failed: {e}"));
    assert!(!z_out.voiced);
    assert_eq!(z_out.vocal_f0_hz, None);
    assert_eq!(z_out.vocal_jitter_pct, None);
    assert_eq!(z_out.vocal_shimmer_pct, None);
    assert_eq!(z_out.vocal_shimmer_db, None);
    assert_eq!(z_out.hnr_db, None);
    assert_eq!(z_out.spectral_tilt_db, None);

    // 2. Broadband unvoiced fricative noise.
    let mut rng = SplitMix64::new(0xF00D_1234);
    let noise: Vec<f64> = (0..1024).map(|_| 0.08 * rng.next_normal()).collect();
    let n_out = analyzer
        .analyze_pcm_f64(&noise)
        .unwrap_or_else(|e| panic!("noise analyze failed: {e}"));
    assert!(!n_out.voiced);
    assert_eq!(n_out.vocal_f0_hz, None);
    assert_eq!(n_out.vocal_jitter_pct, None);
    assert_eq!(n_out.vocal_shimmer_pct, None);
    assert_eq!(n_out.vocal_shimmer_db, None);
    assert_eq!(n_out.hnr_db, None);

    // 3. Low SNR (< 10 dB) speech + strong noise after noise floor adaptation.
    for _ in 0..8 {
        let bg: Vec<f64> = (0..1024).map(|_| 0.10 * rng.next_normal()).collect();
        let _ = analyzer.analyze_pcm_f64(&bg);
    }
    let low_snr: Vec<f64> = (0..1024)
        .map(|i| {
            let t = (i as f64) / 16_000.0;
            0.10 * rng.next_normal() + 0.08 * (2.0 * PI * 140.0 * t).sin()
        })
        .collect();
    let low_out = analyzer
        .analyze_pcm_f64(&low_snr)
        .unwrap_or_else(|e| panic!("low_snr analyze failed: {e}"));
    assert!(!low_out.voiced);
    assert_eq!(low_out.vocal_f0_hz, None);
    assert_eq!(low_out.hnr_db, None);

    // 4. Config & short-frame errors.
    assert!(matches!(
        VocalAcousticAnalyzer::new(VocalAnalyzerConfig {
            sample_rate_hz: 8_000,
            ..VocalAnalyzerConfig::default()
        }),
        Err(DspError::UnsupportedAudioSampleRate {
            sample_rate_hz: 8_000
        })
    ));
    assert!(matches!(
        analyzer.analyze_pcm_f64(&[0.0; 64]),
        Err(DspError::AudioFrameTooShort { len: 64, .. })
    ));
}

#[test]
fn test_pan_tompkins_125hz_and_500hz_qrs_detection_and_exact_rmssd() {
    for (fs, tol_ms) in [(125.0_f64, 4.0_f64), (500.0_f64, 2.5_f64)] {
        // Series A: alternating 800 <-> 840 ms -> exact RMSSD = 40.0 ms, pNN50 = 0.0%.
        let mut rr_a = Vec::new();
        for i in 0..24 {
            rr_a.push(if i % 2 == 0 { 800.0 } else { 840.0 });
        }
        let ecg_a = synthesize_ecg_from_rr_ms(fs, &rr_a);
        let cfg = PanTompkinsConfig::for_sample_rate(fs)
            .unwrap_or_else(|e| panic!("config failed at {fs} Hz: {e}"));
        let mut ext_a = WaveformRrExtractor::new(cfg)
            .unwrap_or_else(|e| panic!("extractor failed at {fs} Hz: {e}"));
        let m_a = ext_a.push_block(&ecg_a);

        assert!(
            m_a.valid_nn_count >= 18,
            "At {fs} Hz expected >= 18 NN intervals, got {}",
            m_a.valid_nn_count
        );
        let rmssd_a = m_a
            .rmssd_ms
            .unwrap_or_else(|| panic!("Expected Some(rmssd_ms) at {fs} Hz"));
        assert!(
            (rmssd_a - 40.0).abs() <= tol_ms,
            "At {fs} Hz expected RMSSD within {tol_ms} ms of 40.0, got {rmssd_a}"
        );
        assert_eq!(m_a.pnn50_pct, Some(0.0));
        assert_eq!(
            m_a.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );

        // Series B: alternating 760 <-> 840 ms -> exact RMSSD = 80.0 ms, pNN50 = 100.0%.
        let mut rr_b = Vec::new();
        for i in 0..24 {
            rr_b.push(if i % 2 == 0 { 760.0 } else { 840.0 });
        }
        let ecg_b = synthesize_ecg_from_rr_ms(fs, &rr_b);
        let mut ext_b = WaveformRrExtractor::new(cfg)
            .unwrap_or_else(|e| panic!("extractor failed at {fs} Hz: {e}"));
        let m_b = ext_b.push_block(&ecg_b);
        let rmssd_b = m_b
            .rmssd_ms
            .unwrap_or_else(|| panic!("Expected Some(rmssd_ms) for series B at {fs} Hz"));
        assert!(
            (rmssd_b - 80.0).abs() <= tol_ms,
            "At {fs} Hz expected RMSSD within {tol_ms} ms of 80.0, got {rmssd_b}"
        );
        assert_eq!(m_b.pnn50_pct, Some(100.0));

        // Series C: inject ectopic PVC (420 ms) + compensatory pause (1180 ms) mid-stream.
        let mut rr_c = vec![800.0, 840.0, 800.0, 840.0, 800.0, 840.0, 800.0, 840.0];
        rr_c.push(420.0); // Premature beat > 20% Malik deviation
        rr_c.push(1180.0); // Compensatory pause > 20% Malik deviation
        for i in 0..10 {
            rr_c.push(if i % 2 == 0 { 800.0 } else { 840.0 });
        }
        let ecg_c = synthesize_ecg_from_rr_ms(fs, &rr_c);
        let mut ext_c = WaveformRrExtractor::new(cfg)
            .unwrap_or_else(|e| panic!("extractor failed at {fs} Hz: {e}"));
        let m_c = ext_c.push_block(&ecg_c);
        assert!(
            m_c.rejected_ectopic_count >= 1,
            "At {fs} Hz expected PVC rejection, got rejected_ectopic_count={}",
            m_c.rejected_ectopic_count
        );
        let rmssd_c = m_c
            .rmssd_ms
            .unwrap_or_else(|| panic!("Expected Some(rmssd_ms) for PVC series at {fs} Hz"));
        assert!(
            (rmssd_c - 40.0).abs() <= tol_ms + 1.5,
            "PVC must not corrupt RMSSD around 40.0 ms at {fs} Hz, got {rmssd_c}"
        );
    }
}

#[test]
fn test_issue_11_bidmc_1hz_numeric_csv_never_populates_rmssd_while_waveform_does() {
    // Part A: Strict Issue #11 enforcement on 1 Hz BIDMC CSV and out-of-band sample rates.
    for bad_rate in [1.0, 20.0, 124.9, 500.1, f64::NAN, f64::INFINITY] {
        let err = PanTompkinsConfig::for_sample_rate(bad_rate);
        assert!(
            matches!(err, Err(DspError::UnsupportedWaveformSampleRate { .. })),
            "Rate {bad_rate} Hz must be rejected by PanTompkinsConfig"
        );
    }

    // Verify IngestError::Dsp From conversion compiles and works cleanly.
    let dsp_err = DspError::UnsupportedWaveformSampleRate {
        sample_rate_hz: 1.0,
    };
    let ingest_err: IngestError = dsp_err.into();
    assert!(matches!(ingest_err, IngestError::Dsp(_)));

    let csv_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc/bidmc_01_Numerics.csv");
    let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path)
        .unwrap_or_else(|e| panic!("Failed to load bidmc_01_Numerics.csv: {e}"));
    let scenario = default_scenario();
    let mut sqi = SqiFilter::new();

    for row in replayer.rows() {
        let (bio, eval) =
            merge_biometrics_with_gather_dsp(row, &scenario, &mut sqi, &GatherDspOverlay::default());
        assert_eq!(bio.rmssd_ms, None);
        assert_eq!(bio.sdnn_ms, None);
        assert_eq!(bio.pnn50_pct, None);
        assert_eq!(bio.lf_hf_ratio, None);
        assert_eq!(
            bio.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        );
        assert!(
            eval.quality_flags
                .iter()
                .any(|f| f == "BEAT_INTERVALS_NOT_AVAILABLE")
        );
    }

    // Part B: Legitimate 250 Hz ECG waveform + radar + vocal fusion.
    let rr_250: Vec<f64> = (0..22)
        .map(|i| if i % 2 == 0 { 780.0 } else { 820.0 })
        .collect();
    let ecg_250 = synthesize_ecg_from_rr_ms(250.0, &rr_250);
    let cfg_250 = PanTompkinsConfig::for_sample_rate(250.0)
        .unwrap_or_else(|e| panic!("250 Hz config failed: {e}"));
    let mut ext_250 = WaveformRrExtractor::new(cfg_250)
        .unwrap_or_else(|e| panic!("250 Hz extractor failed: {e}"));
    let hrv = ext_250.push_block(&ecg_250);
    assert!(hrv.rmssd_ms.is_some());

    let mut radar_proc = RadarCsiProcessor::new(RadarCsiConfig::default())
        .unwrap_or_else(|e| panic!("radar config failed: {e}"));
    let lambda_m = RadarCarrierBand::MmWave60Ghz
        .wavelength_m()
        .unwrap_or_else(|e| panic!("wavelength failed: {e}"));
    for n in 0..7000 {
        let t = (n as f64) / 250.0;
        let d_m = (5.0 * (2.0 * PI * 0.25 * t).sin() + 0.35 * (2.0 * PI * 1.15 * t).sin()) * 1e-3;
        let phi = 4.0 * PI * d_m / lambda_m;
        let _ = radar_proc.push_iq_sample(1.5 + phi.cos(), -0.9 + phi.sin());
    }
    let radar_est = radar_proc.latest_estimate();
    assert!(radar_est.radar_sqi >= SQI_MIN_VALID_THRESHOLD);

    let mut vocal_analyzer = VocalAcousticAnalyzer::new(VocalAnalyzerConfig::default())
        .unwrap_or_else(|e| panic!("vocal config failed: {e}"));
    let silent_vocal = vocal_analyzer
        .analyze_pcm_f64(&[0.0; 1024])
        .unwrap_or_else(|e| panic!("silent analyze failed: {e}"));
    assert!(!silent_vocal.voiced);

    // Row with missing HR/RESP triggers contactless radar fallback while keeping real waveform HRV.
    let row_missing_vitals = BidmcNumericRow {
        record_id: "waveform_250hz".to_string(),
        relative_time_s: 20.0,
        hr_bpm: None,
        pulse_bpm: Some(74.0),
        resp_brpm: None,
        spo2_pct: Some(98.0),
        missing_channels: vec!["heart_rate_bpm".to_string(), "resp_rate_brpm".to_string()],
    };
    let overlay = GatherDspOverlay {
        radar: Some(radar_est),
        vocal: Some(silent_vocal),
        waveform_hrv: Some(hrv),
    };
    let mut sqi_wave = SqiFilter::new();
    let (bio_wave, eval_wave) =
        merge_biometrics_with_gather_dsp(&row_missing_vitals, &scenario, &mut sqi_wave, &overlay);

    assert_eq!(bio_wave.rmssd_ms, hrv.rmssd_ms);
    assert_eq!(bio_wave.sdnn_ms, hrv.sdnn_ms);
    assert_eq!(bio_wave.pnn50_pct, hrv.pnn50_pct);
    assert_eq!(bio_wave.hrv_unavailable_reason, None);
    assert!(
        !eval_wave
            .quality_flags
            .iter()
            .any(|f| f == "BEAT_INTERVALS_NOT_AVAILABLE")
    );
    assert!(bio_wave.heart_rate_bpm.is_some());
    assert!(bio_wave.resp_rate_brpm.is_some());
    assert!(!bio_wave.missing_channels.iter().any(|c| c == "heart_rate_bpm"));
    assert!(!bio_wave.missing_channels.iter().any(|c| c == "resp_rate_brpm"));
    assert_eq!(bio_wave.vocal_f0_hz, None);
    assert_eq!(bio_wave.vocal_jitter_pct, None);
    assert!(bio_wave.missing_channels.iter().any(|c| c == "vocal_f0_hz"));
    assert!(
        bio_wave
            .missing_channels
            .iter()
            .any(|c| c == "vocal_jitter_pct")
    );
}

#[test]
fn test_dsp_hot_path_latency_budget_under_15us_and_nan_inf_resilience() {
    let mut radar = RadarCsiProcessor::new(RadarCsiConfig::default())
        .unwrap_or_else(|e| panic!("radar new failed: {e}"));
    let mut vocal = VocalAcousticAnalyzer::new(VocalAnalyzerConfig::default())
        .unwrap_or_else(|e| panic!("vocal new failed: {e}"));
    let cfg = PanTompkinsConfig::for_sample_rate(250.0)
        .unwrap_or_else(|e| panic!("cfg failed: {e}"));
    let mut qrs = WaveformRrExtractor::new(cfg)
        .unwrap_or_else(|e| panic!("qrs new failed: {e}"));

    // 1. Pathological NaN / +Inf / -Inf injection across all 3 DSP engines.
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let r_est = radar.push_iq_sample(bad, bad);
        assert!(r_est.displacement_mm.is_finite());
        assert!(r_est.unwrapped_phase_rad.is_finite());
        assert!(r_est.radar_sqi.is_finite());

        let _ = qrs.push_sample(bad);
        let hrv = qrs.current_hrv_metrics();
        assert!(hrv.rmssd_ms.is_none_or(f64::is_finite));
        assert!(hrv.sdnn_ms.is_none_or(f64::is_finite));
        assert!(hrv.pnn50_pct.is_none_or(f64::is_finite));

        let bad_buf_f64 = [bad; 512];
        let v_out = vocal
            .analyze_pcm_f64(&bad_buf_f64)
            .unwrap_or_else(|e| panic!("vocal nan buf failed: {e}"));
        assert!(!v_out.voiced);
        assert!(v_out.pause_ratio.is_finite());
        assert!(v_out.frame_snr_db.is_finite());

        let bad_buf_f32 = [bad as f32; 512];
        let v_out32 = vocal
            .analyze_pcm_f32(&bad_buf_f32)
            .unwrap_or_else(|e| panic!("vocal nan f32 buf failed: {e}"));
        assert!(!v_out32.voiced);
    }

    // 2. Latency check across 10,000 samples for streaming sample push hot paths (< 15 us avg).
    let start_radar = Instant::now();
    for i in 0..10_000u64 {
        let t = (i as f64) / 250.0;
        let _ = radar.push_iq_sample(
            1.2 + (2.0 * PI * 0.25 * t).cos(),
            -0.8 + (2.0 * PI * 0.25 * t).sin(),
        );
    }
    let avg_radar_us = start_radar.elapsed().as_secs_f64() * 1e6 / 10_000.0;
    assert!(
        avg_radar_us < 15.0,
        "Radar push_iq_sample avg latency {avg_radar_us:.3} us exceeded 15 us budget"
    );

    let start_qrs = Instant::now();
    for i in 0..10_000u64 {
        let t = (i as f64) / 250.0;
        let _ = qrs.push_sample((2.0 * PI * 1.2 * t).sin());
    }
    let avg_qrs_us = start_qrs.elapsed().as_secs_f64() * 1e6 / 10_000.0;
    assert!(
        avg_qrs_us < 15.0,
        "Pan-Tompkins push_sample avg latency {avg_qrs_us:.3} us exceeded 15 us budget"
    );
}
