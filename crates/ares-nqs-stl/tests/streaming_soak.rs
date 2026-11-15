use ares_nqs_stl::{AresMultivariateSample, EwmaResidualForecaster, VitalsAnomalyDetector};

#[test]
fn hour_of_blackouts_does_not_grow_baseline_or_forecaster_history() {
    let mut detector = VitalsAnomalyDetector::default();
    let mut forecast = EwmaResidualForecaster::default();
    for t in 0..3600 {
        // One sensor never starts; the other two must not accumulate unbounded baseline rows.
        detector.update(t as f64, [Some(72.0), None, Some(16.0)]);
        assert!(detector.retained_baseline_samples() <= 3 * 480);
        let missing = t % 600 >= 300 && t % 600 < 340;
        let mut values = [0.0; 12];
        values[0] = 72.0 + (t % 7) as f64;
        values[2] = 16.0 + (t % 3) as f64;
        let s = AresMultivariateSample {
            recording_time_s: t as f64,
            values,
            observed_mask: if missing { 0 } else { 5 },
            sqi_score: if missing { 0.0 } else { 1.0 },
        };
        let snapshot = forecast.ingest_sample_1hz(&s);
        assert!(forecast.retained_sample_count() <= 12 * (120 + 5 * 240 + 225));
        if t % 600 >= 311 && t % 600 < 340 {
            assert!(snapshot.short_horizon_cones.is_empty());
            assert!(snapshot.abstention_certificate.abstained);
        }
        if t % 600 == 340 {
            assert!(
                snapshot
                    .short_horizon_cones
                    .iter()
                    .all(|c| c.horizon_60s.is_none()),
                "one sample must not revive a stale long-horizon forecast"
            );
        }
    }
}
