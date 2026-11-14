use ares_core_types::constants::SQI_MIN_VALID_THRESHOLD;
use ares_core_types::telemetry::{HrvUnavailableReason, StressTestScenarioInput};
use ares_telemetry_ingest::bidmc_replayer::{BidmcNumericRow, BidmcReplayer, IngestError};
use ares_telemetry_ingest::scenario_overlay::{
    biometrics_with_signal_quality, merge_biometrics_with_scenario,
};
use ares_telemetry_ingest::sqi_filter::{SqiFilter, ZOH_MAX_HOLD_SECONDS};
use ares_telemetry_ingest::wearable_packet::{
    WEARABLE_PACKET_BYTES, WEARABLE_SYNC_WORD, WFLAG_EVA_SUIT_NODE, WFLAG_SEU_RECOVERY_EVENT,
    WMASK_HR_BPM, WMASK_IMU_RMS, WMASK_RESP_BRPM, WMASK_SPO2_PCT, WearableSensorPacket,
};
use core::mem::{align_of, size_of};
use std::io::Cursor;
use std::path::PathBuf;

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    #[inline]
    fn next_range_usize(&mut self, upper: usize) -> usize {
        (self.next_u64() % (upper as u64)) as usize
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

#[test]
fn k2_multichannel_nan_inf_dropout_and_30s_zoh_expiration() {
    assert!((ZOH_MAX_HOLD_SECONDS - 30.0).abs() < 1e-12);

    // 1. CSV parsing chaos: NaN, Inf, -Inf, empty cells across HR, PULSE, RESP, SpO2.
    let csv_payload = "\
Time [s], HR, PULSE, RESP, SpO2
0, 72.0, 72.0, 15.0, 98.0
1, NaN, Inf, -Inf,
2, , nan, infinity, -infinity
3, bad_text, 74.0, NaN, 97.5
";
    let replayer = BidmcReplayer::from_buf_read(
        "chaos_csv",
        "in_memory_chaos.csv",
        Cursor::new(csv_payload),
    )
    .unwrap_or_else(|e| panic!("CSV parse failed: {e}"));
    assert_eq!(replayer.len(), 4);

    assert_eq!(replayer.row_at_second(0).hr_bpm, Some(72.0));
    assert_eq!(replayer.row_at_second(1).hr_bpm, None);
    assert_eq!(replayer.row_at_second(1).pulse_bpm, None);
    assert_eq!(replayer.row_at_second(1).resp_brpm, None);
    assert_eq!(replayer.row_at_second(1).spo2_pct, None);
    assert_eq!(replayer.row_at_second(2).hr_bpm, None);
    assert_eq!(replayer.row_at_second(2).pulse_bpm, None);
    assert_eq!(replayer.row_at_second(2).resp_brpm, None);
    assert_eq!(replayer.row_at_second(2).spo2_pct, None);
    assert_eq!(replayer.row_at_second(3).hr_bpm, None);
    assert_eq!(replayer.row_at_second(3).pulse_bpm, Some(74.0));
    assert_eq!(replayer.row_at_second(3).resp_brpm, None);
    assert_eq!(replayer.row_at_second(3).spo2_pct, Some(97.5));

    // 2. Direct non-finite values in BidmcNumericRow + 30s ZOH lifecycle.
    let mut sqi = SqiFilter::new();
    let scenario = default_scenario();

    // At t = 10.0 s, clean signal with explicit R-R derived RMSSD = 43.2 ms establishes ZOH anchor.
    let clean_row = BidmcNumericRow {
        record_id: "rr_stream".to_string(),
        relative_time_s: 10.0,
        hr_bpm: Some(72.0),
        pulse_bpm: Some(72.0),
        resp_brpm: Some(15.0),
        spo2_pct: Some(98.0),
        missing_channels: Vec::new(),
    };
    let anchor = sqi.evaluate_row_with_rmssd(&clean_row, Some(43.2));
    assert!(anchor.sqi_score >= SQI_MIN_VALID_THRESHOLD);
    assert_eq!(anchor.rmssd_ms, Some(43.2));

    // Inject severe multi-channel dropout (NaN, +Inf, -Inf, None) from t = 11.0..=40.0 (within 30s).
    for sec in 11..=40u32 {
        let degraded = BidmcNumericRow {
            record_id: "rr_stream".to_string(),
            relative_time_s: f64::from(sec),
            hr_bpm: if sec % 3 == 0 { Some(f64::NAN) } else { None },
            pulse_bpm: Some(f64::INFINITY),
            resp_brpm: Some(f64::NEG_INFINITY),
            spo2_pct: None,
            missing_channels: vec![
                "heart_rate_bpm".to_string(),
                "pulse_rate_bpm".to_string(),
                "resp_rate_brpm".to_string(),
                "spo2_pct".to_string(),
            ],
        };
        let eval = sqi.evaluate_row_with_rmssd(&degraded, None);
        assert!(eval.sqi_score.is_finite() && (0.0..=1.0).contains(&eval.sqi_score));
        assert!(
            eval.sqi_score < SQI_MIN_VALID_THRESHOLD,
            "expected SQI < 0.70 at t={sec}, got {}",
            eval.sqi_score
        );
        assert!(eval.quality_flags.contains(&"HOLD_LAST_VALID".to_string()));
        assert_eq!(
            eval.rmssd_ms,
            Some(43.2),
            "ZOH should hold within 30s at t={sec} (elapsed={}s)",
            sec - 10
        );

        let bio = biometrics_with_signal_quality(&degraded, &scenario, &eval);
        assert_eq!(bio.heart_rate_bpm, None);
        assert_eq!(bio.pulse_rate_bpm, None);
        assert_eq!(bio.resp_rate_brpm, None);
        assert_eq!(bio.spo2_pct, None);
    }

    // At t = 40.5 s (elapsed = 30.5 s > 30.0 s), ZOH MUST expire cleanly and NEVER hallucinate data.
    let expired_row = BidmcNumericRow {
        record_id: "rr_stream".to_string(),
        relative_time_s: 40.5,
        hr_bpm: Some(f64::NAN),
        pulse_bpm: Some(f64::NEG_INFINITY),
        resp_brpm: Some(f64::INFINITY),
        spo2_pct: None,
        missing_channels: vec![
            "heart_rate_bpm".to_string(),
            "pulse_rate_bpm".to_string(),
            "resp_rate_brpm".to_string(),
            "spo2_pct".to_string(),
        ],
    };
    let expired_eval = sqi.evaluate_row_with_rmssd(&expired_row, None);
    assert!(expired_eval.sqi_score.is_finite());
    assert!(expired_eval.sqi_score < SQI_MIN_VALID_THRESHOLD);
    assert_eq!(
        expired_eval.rmssd_ms, None,
        "ZOH must expire cleanly after 30s without hallucinating RMSSD"
    );
    assert!(expired_eval.quality_flags.contains(&"ZOH_EXPIRED".to_string()));
    assert!(
        expired_eval
            .quality_flags
            .contains(&"BEAT_INTERVALS_NOT_AVAILABLE".to_string())
    );

    // Subsequent degraded ticks remain None (ZOH remains cleared until a new valid anchor arrives).
    let post_expiry_eval = sqi.evaluate_row_with_rmssd(
        &BidmcNumericRow {
            relative_time_s: 45.0,
            ..expired_row
        },
        None,
    );
    assert_eq!(post_expiry_eval.rmssd_ms, None);
}

#[test]
fn k2_honest_bidmc_01_numeric_replay_preserves_beat_intervals_not_available() {
    let csv_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc/bidmc_01_Numerics.csv");
    let replayer = BidmcReplayer::from_csv_path("bidmc_01", &csv_path)
        .unwrap_or_else(|e| panic!("failed to load bidmc_01_Numerics.csv: {e}"));
    assert_eq!(replayer.len(), 481);

    let scenario = default_scenario();
    let mut sqi = SqiFilter::new();
    let mut missing_pulse_spo2_rows = 0usize;

    for row in replayer.rows() {
        let eval = sqi.evaluate_row_detailed(row);
        assert!(eval.sqi_score.is_finite());
        assert_eq!(eval.rmssd_ms, None);
        assert!(
            eval.quality_flags
                .contains(&"BEAT_INTERVALS_NOT_AVAILABLE".to_string())
        );

        let bio = merge_biometrics_with_scenario(row, &scenario, &mut sqi);
        assert_eq!(bio.rmssd_ms, None);
        assert_eq!(bio.sdnn_ms, None);
        assert_eq!(bio.pnn50_pct, None);
        assert_eq!(bio.lf_hf_ratio, None);
        assert_eq!(
            bio.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        );
        assert!(bio.missing_channels.contains(&"rmssd_ms".to_string()));

        if row.pulse_bpm.is_none() && row.spo2_pct.is_none() {
            missing_pulse_spo2_rows += 1;
            assert_eq!(bio.pulse_rate_bpm, None);
            assert_eq!(bio.spo2_pct, None);
            assert!(bio.missing_channels.contains(&"pulse_rate_bpm".to_string()));
            assert!(bio.missing_channels.contains(&"spo2_pct".to_string()));
        }
    }

    assert_eq!(missing_pulse_spo2_rows, 13);
}

#[test]
fn k2_wearable_packet_32b_exhaustive_256_bit_seu_chaos_and_hubris_restarts() {
    assert_eq!(size_of::<WearableSensorPacket>(), 32);
    assert_eq!(align_of::<WearableSensorPacket>(), 4);
    assert_eq!(WEARABLE_PACKET_BYTES, 32);

    let mut rng = SplitMix64::new(0x32B0_C816_5E00_0001);

    // 1. Exhaustive single-bit flip across all 256 bit positions (32 bytes x 8 bits).
    for sample_idx in 0..8usize {
        let pkt = WearableSensorPacket {
            sync_word: WEARABLE_SYNC_WORD,
            node_id: (sample_idx as u8) + 1,
            channel_mask: WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM | WMASK_IMU_RMS,
            sequence_num: 100 + sample_idx as u32,
            uptime_ms: 60_000 + (sample_idx as u32) * 1_000,
            supervisor_restart_count: sample_idx as u16,
            hr_bpm_x100: 7100 + (sample_idx as u16) * 125,
            spo2_pct_x100: 9800,
            resp_brpm_x100: 1500,
            rr_interval_ms_x10: 0,
            sqi_score_x10000: 9350,
            imu_rms_g: 0.09,
            flags: WFLAG_EVA_SUIT_NODE | WFLAG_SEU_RECOVERY_EVENT,
            crc16_ccitt: 0,
        };
        let wire = pkt.to_le_bytes_with_crc();

        for bit_pos in 0..256usize {
            let byte_idx = bit_pos / 8;
            let bit_idx = bit_pos % 8;
            let mut corrupted = wire;
            corrupted[byte_idx] ^= 1u8 << bit_idx;
            let res = WearableSensorPacket::decode_and_verify(&corrupted);
            assert!(
                res.is_err(),
                "sample {sample_idx}: SEU bit-flip at byte={byte_idx} bit={bit_idx} escaped CRC-16-CCITT"
            );
            if byte_idx < 2 {
                assert!(matches!(res, Err(IngestError::InvalidWearableSyncWord { .. })));
            } else {
                assert!(matches!(res, Err(IngestError::InvalidWearableCrc { .. })));
            }
        }
    }

    // 2. 1,024+ randomized multi-bit SEU trials + wrong packet length rejections.
    let base_pkt = WearableSensorPacket {
        sync_word: WEARABLE_SYNC_WORD,
        node_id: 3,
        channel_mask: WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM,
        sequence_num: 42,
        uptime_ms: 120_500,
        supervisor_restart_count: 1,
        hr_bpm_x100: 7450,
        spo2_pct_x100: 9850,
        resp_brpm_x100: 1520,
        rr_interval_ms_x10: 0,
        sqi_score_x10000: 9400,
        imu_rms_g: 0.08,
        flags: WFLAG_SEU_RECOVERY_EVENT,
        crc16_ccitt: 0,
    };
    let wire = base_pkt.to_le_bytes_with_crc();
    for trial in 0..1_024usize {
        let mut corrupted = wire;
        let flips = 1 + rng.next_range_usize(3);
        let mut used = [usize::MAX; 3];
        for idx in 0..flips {
            loop {
                let bit = rng.next_range_usize(256);
                if !used[..idx].contains(&bit) {
                    used[idx] = bit;
                    corrupted[bit / 8] ^= 1u8 << (bit % 8);
                    break;
                }
            }
        }
        assert!(
            WearableSensorPacket::decode_and_verify(&corrupted).is_err(),
            "randomized SEU trial {trial} escaped CRC-16-CCITT verification"
        );
    }
    for bad_len in [0usize, 1, 16, 31, 33, 64] {
        let buf = vec![0u8; bad_len];
        assert!(matches!(
            WearableSensorPacket::decode_and_verify(&buf),
            Err(IngestError::InvalidWearablePacketLength {
                expected: 32,
                actual
            }) if actual == bad_len
        ));
    }

    // 3. Simulated Oxide Hubris MPU task restart sequence tracking supervisor_restart_count.
    let scenario = default_scenario();
    let mut sqi = SqiFilter::new();
    let mut prev_restarts = 0u16;
    for restart in 1..=5u16 {
        let pkt = WearableSensorPacket {
            sync_word: WEARABLE_SYNC_WORD,
            node_id: 7,
            channel_mask: WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM | WMASK_IMU_RMS,
            sequence_num: u32::from(restart) * 10,
            uptime_ms: u32::from(restart) * 15_000,
            supervisor_restart_count: restart,
            hr_bpm_x100: 7600,
            spo2_pct_x100: 9790,
            resp_brpm_x100: 1580,
            rr_interval_ms_x10: 0,
            sqi_score_x10000: 9100,
            imu_rms_g: 0.12,
            flags: WFLAG_SEU_RECOVERY_EVENT | WFLAG_EVA_SUIT_NODE,
            crc16_ccitt: 0,
        };
        let bytes = pkt.to_le_bytes_with_crc();
        let decoded = WearableSensorPacket::decode_and_verify(&bytes)
            .unwrap_or_else(|e| panic!("valid recovery packet failed at restart {restart}: {e}"));
        let validated = decoded.to_validated_frame("hubris_node_7", &scenario, &mut sqi);
        assert_eq!(validated.supervisor_restart_count, prev_restarts + 1);
        prev_restarts = validated.supervisor_restart_count;
        assert!(validated.seu_recovery_event);
        assert!(validated.eva_suit_node);
        assert!(
            validated
                .sqi_evaluation
                .quality_flags
                .contains(&"HUBRIS_SEU_SUPERVISOR_RECOVERY".to_string())
        );
        assert_eq!(validated.biometrics.rmssd_ms, None);
        assert_eq!(
            validated.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        );
    }
}
