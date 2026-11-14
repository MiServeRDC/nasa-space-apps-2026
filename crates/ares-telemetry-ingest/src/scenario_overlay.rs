//! Fase 04 (B2): Fusione tra la riga biometrica reale `BidmcNumericRow` (`RECORDED_TERRESTRIAL_BIDMC_CSV`)
//! e gli input della What-If Stress-Test Console (`SIMULATED_SCENARIO_INPUT`).

use crate::bidmc_replayer::BidmcNumericRow;
use crate::sqi_filter::{SqiEvaluation, SqiFilter};
use ares_core_types::telemetry::{Biometrics, HrvUnavailableReason, StressTestScenarioInput};

const HRV_CHANNELS: [&str; 4] = ["rmssd_ms", "sdnn_ms", "pnn50_pct", "lf_hf_ratio"];

/// Fonde una riga reale BIDMC (`RECORDED_TERRESTRIAL_BIDMC_CSV`) con gli input di scenario,
/// mantenendo `rmssd_ms: None` e `BEAT_INTERVALS_NOT_AVAILABLE` sulle sorgenti numeriche 1 Hz.
#[inline]
pub fn merge_biometrics_with_scenario(
    row: &BidmcNumericRow,
    scenario: &StressTestScenarioInput,
    sqi_filter: &mut SqiFilter,
) -> Biometrics {
    let eval = sqi_filter.evaluate_row_detailed(row);
    biometrics_with_signal_quality(row, scenario, &eval)
}

/// Fonde una riga con eventuale `rmssd_ms` da stream beat-to-beat R-R o override esplicito.
#[inline]
pub fn merge_biometrics_with_rmssd(
    row: &BidmcNumericRow,
    scenario: &StressTestScenarioInput,
    sqi_filter: &mut SqiFilter,
    raw_rmssd_ms: Option<f64>,
) -> Biometrics {
    let eval = sqi_filter.evaluate_row_with_rmssd(row, raw_rmssd_ms);
    biometrics_with_signal_quality(row, scenario, &eval)
}

/// Applica gli input di scenario usando una valutazione `SqiEvaluation` gia calcolata
/// sul campione nativo a 1 Hz (garantendo invarianza a tick 20 Hz e What-If).
#[inline]
pub fn biometrics_with_signal_quality(
    row: &BidmcNumericRow,
    scenario: &StressTestScenarioInput,
    eval: &SqiEvaluation,
) -> Biometrics {
    let rmssd_ms = eval.rmssd_ms;
    let sdnn_ms = rmssd_ms.map(|r| (r * 1.32).clamp(15.0, 110.0));
    let pnn50_pct = rmssd_ms.map(|r| ((r - 12.0) * 0.65).clamp(1.0, 48.0));
    let lf_hf_ratio = rmssd_ms.map(|r| (110.0 / r.max(10.0)).clamp(0.8, 6.5));

    let mut missing_channels = row.missing_channels.clone();
    let hrv_unavailable_reason = if rmssd_ms.is_none() {
        for ch in HRV_CHANNELS {
            if !missing_channels.iter().any(|existing| existing == ch) {
                missing_channels.push(ch.to_string());
            }
        }
        Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
    } else {
        None
    };

    Biometrics {
        heart_rate_bpm: row.hr_bpm.filter(|v| v.is_finite()),
        pulse_rate_bpm: row.pulse_bpm.filter(|v| v.is_finite()),
        resp_rate_brpm: row.resp_brpm.filter(|v| v.is_finite()),
        spo2_pct: row.spo2_pct.filter(|v| v.is_finite()),
        rmssd_ms,
        hrv_unavailable_reason,
        sdnn_ms,
        pnn50_pct,
        lf_hf_ratio,
        vocal_f0_hz: Some(118.5),
        vocal_jitter_pct: Some(0.62),
        radiation_dose_rate_msv_d: scenario.radiation_dose_rate_msv_d.clamp(0.0, 50.0),
        sqi_score: eval.sqi_score,
        missing_channels,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_biometrics_preserves_nulls_and_flags_unavailable_hrv() {
        let row = BidmcNumericRow {
            record_id: "bidmc_01".to_string(),
            relative_time_s: 42.0,
            hr_bpm: Some(88.0),
            pulse_bpm: None,
            resp_brpm: Some(19.0),
            spo2_pct: None,
            missing_channels: vec!["pulse_rate_bpm".to_string(), "spo2_pct".to_string()],
        };
        let scenario = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 90,
            ared_daily_load_kgf: 125.0,
            radiation_dose_rate_msv_d: 1.8,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 0.0,
        };
        let mut sqi_filter = SqiFilter::new();
        let bio = merge_biometrics_with_scenario(&row, &scenario, &mut sqi_filter);

        assert_eq!(bio.heart_rate_bpm, Some(88.0));
        assert_eq!(bio.pulse_rate_bpm, None);
        assert_eq!(bio.spo2_pct, None);
        assert_eq!(bio.missing_channels.len(), 6);
        assert!(bio.missing_channels.iter().any(|c| c == "rmssd_ms"));
        assert!((bio.radiation_dose_rate_msv_d - 1.8).abs() < f64::EPSILON);
        assert!(bio.sqi_score > 0.60);
    }

    #[test]
    fn test_merge_biometrics_with_explicit_rmssd_populates_hrv_metrics() {
        let row = BidmcNumericRow {
            record_id: "rr_stream".to_string(),
            relative_time_s: 10.0,
            hr_bpm: Some(68.0),
            pulse_bpm: Some(68.0),
            resp_brpm: Some(14.0),
            spo2_pct: Some(98.0),
            missing_channels: Vec::new(),
        };
        let scenario = StressTestScenarioInput {
            source_record_id: "rr_stream".to_string(),
            flight_day: 45,
            ared_daily_load_kgf: 125.0,
            radiation_dose_rate_msv_d: 0.4,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 0.0,
        };
        let mut sqi_filter = SqiFilter::new();
        let bio = merge_biometrics_with_rmssd(&row, &scenario, &mut sqi_filter, Some(44.0));
        assert_eq!(bio.rmssd_ms, Some(44.0));
        assert_eq!(bio.hrv_unavailable_reason, None);
        assert!(bio.sdnn_ms.is_some());
        assert!(bio.pnn50_pct.is_some());
        assert!(bio.lf_hf_ratio.is_some());
        assert!(bio.missing_channels.is_empty());
    }
}
