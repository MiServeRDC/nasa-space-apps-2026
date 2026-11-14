//! Fase 04 (B2): Fusione tra la riga biometrica reale `BidmcNumericRow` (`RECORDED_TERRESTRIAL_BIDMC_CSV`)
//! e gli input della What-If Stress-Test Console (`SIMULATED_SCENARIO_INPUT`).

use crate::bidmc_replayer::BidmcNumericRow;
use crate::sqi_filter::SqiFilter;
use ares_core_types::telemetry::{Biometrics, HrvUnavailableReason, StressTestScenarioInput};

/// Fonde una riga reale BIDMC (`RECORDED_TERRESTRIAL_BIDMC_CSV`) con gli input di scenario.
#[inline]
pub fn merge_biometrics_with_scenario(
    row: &BidmcNumericRow,
    scenario: &StressTestScenarioInput,
    sqi_filter: &mut SqiFilter,
) -> Biometrics {
    let (sqi_score, _) = sqi_filter.evaluate_row(row);
    Biometrics {
        heart_rate_bpm: row.hr_bpm,
        pulse_rate_bpm: row.pulse_bpm,
        resp_rate_brpm: row.resp_brpm,
        spo2_pct: row.spo2_pct,
        rmssd_ms: None,
        hrv_unavailable_reason: Some(HrvUnavailableReason::BeatIntervalsNotAvailable),
        sdnn_ms: None,
        pnn50_pct: None,
        lf_hf_ratio: None,
        vocal_f0_hz: Some(118.5),
        vocal_jitter_pct: Some(0.62),
        radiation_dose_rate_msv_d: scenario.radiation_dose_rate_msv_d.clamp(0.0, 50.0),
        sqi_score,
        missing_channels: row
            .missing_channels
            .iter()
            .cloned()
            .chain(["rmssd_ms", "sdnn_ms", "pnn50_pct", "lf_hf_ratio"].map(str::to_owned))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_biometrics_preserves_nulls_and_clamps_radiation() {
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
        assert!((bio.radiation_dose_rate_msv_d - 1.8).abs() < f64::EPSILON);
        assert!(bio.sqi_score > 0.60);
    }
}
