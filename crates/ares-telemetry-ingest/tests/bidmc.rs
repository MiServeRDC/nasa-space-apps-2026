use ares_telemetry_ingest::{BidmcRecord, BidmcReplay};

#[test]
fn replays_all_records_without_filling_missing_values() -> Result<(), Box<dyn std::error::Error>> {
    for (record, missing_count) in [
        (BidmcRecord::Bidmc01, 13),
        (BidmcRecord::Bidmc02, 0),
        (BidmcRecord::Bidmc03, 0),
    ] {
        let replay = BidmcReplay::load(record)?;
        assert_eq!(replay.samples().len(), 481);
        for (second, sample) in replay.samples().iter().enumerate() {
            assert_eq!(sample.relative_recording_time_s, second);
            assert_eq!(sample.source_record_id, record);
            assert!(sample.heart_rate_bpm.is_some());
            assert!(sample.resp_rate_brpm.is_some());
        }
        let mut missing = 0;
        for sample in replay.samples() {
            if sample.pulse_rate_bpm.is_none() || sample.spo2_pct.is_none() {
                missing += 1;
                assert_eq!(sample.missing_channels, ["pulse_rate_bpm", "spo2_pct"]);
                let json = serde_json::to_value(sample)?;
                assert!(
                    json.get("pulse_rate_bpm")
                        .is_some_and(|value| value.is_null())
                );
                assert!(json.get("spo2_pct").is_some_and(|value| value.is_null()));
            }
        }
        assert_eq!(missing, missing_count);
    }
    Ok(())
}

#[test]
fn ui_holds_native_sample_and_wraps_at_record_boundary() -> Result<(), Box<dyn std::error::Error>> {
    let replay = BidmcReplay::load(BidmcRecord::Bidmc01)?;
    assert_eq!(replay.sample_at(0).heart_rate_bpm, Some(94.0));
    assert_eq!(replay.sample_for_ui_frame(19), replay.sample_at(0));
    assert_eq!(replay.sample_for_ui_frame(20), replay.sample_at(1));
    assert_eq!(replay.sample_for_ui_frame(9619), replay.sample_at(480));
    assert_eq!(replay.sample_for_ui_frame(9620), replay.sample_at(0));
    Ok(())
}
