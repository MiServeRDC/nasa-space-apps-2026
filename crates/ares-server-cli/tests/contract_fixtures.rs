//! The server-cockpit contract: `contracts/telemetry_schema.json` is the public
//! wire format, and `contracts/fixtures/` holds two real engine outputs that
//! both sides validate against.
//!
//! This is the server half of the joint verification agreed in issue #11:
//!
//! 1. Both fixtures validate against the JSON Schema.
//! 2. `bidmc_01` reports PULSE and SpO2 as unavailable for 111-123 s, with the
//!    channels named and the alarm tier degraded.
//! 3. A pure replay claims nothing simulated and no indicator the record cannot
//!    support.
//! 4. A What-If input never rewrites a recorded channel and never advances the
//!    replay.
//!
//! The fixtures are generated, not hand-written: run
//! `ARES_WRITE_FIXTURES=1 cargo test --test contract_fixtures` to refresh them
//! after an intentional contract change, then commit the diff.

#![allow(clippy::panic, clippy::unwrap_used, clippy::expect_used)]

use std::fs;
use std::path::{Path, PathBuf};

use ares_server_cli::mission::{MissionState, StressTestRequest};
use ares_server_cli::replay::BidmcRecord;
use serde_json::Value;

/// Pinned emission timestamp so a fixture is byte-stable across runs:
/// 2026-11-14T12:00:00Z. The contract keeps this clock separate from
/// `relative_recording_time_s`, and this is the only field we pin.
const FIXTURE_TIMESTAMP_MS: u64 = 1_794_657_600_000;

/// The recorded second used for the replay fixture: inside the 111-123 s gap of
/// `bidmc_01`, so the fixture carries the missing-channel case by construction.
const DEGRADED_SECOND: usize = 111;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn bidmc_01() -> BidmcRecord {
    BidmcRecord::load(&repo_root().join("data/bidmc"), "bidmc_01")
        .expect("bidmc_01 must load and match its MANIFEST.json digest")
}

fn schema() -> Value {
    let path = repo_root().join("contracts/telemetry_schema.json");
    let text =
        fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    serde_json::from_str(&text).expect("telemetry_schema.json must be valid JSON")
}

/// Validates against the contract, reporting every error rather than the first.
fn assert_valid(packet: &Value, label: &str) {
    let schema = schema();
    let validator =
        jsonschema::validator_for(&schema).expect("telemetry_schema.json must be a valid schema");
    let errors: Vec<String> = validator
        .iter_errors(packet)
        .map(|error| format!("  {}: {error}", error.instance_path()))
        .collect();
    assert!(
        errors.is_empty(),
        "{label} does not satisfy contracts/telemetry_schema.json:\n{}",
        errors.join("\n")
    );
}

/// Compares the freshly built packet with the committed fixture, or rewrites it
/// when `ARES_WRITE_FIXTURES=1`.
fn assert_matches_fixture(packet: &Value, name: &str) {
    let dir = repo_root().join("contracts/fixtures");
    let path = dir.join(name);
    let serialized = format!(
        "{}\n",
        serde_json::to_string_pretty(packet).expect("packet must serialize")
    );

    if std::env::var_os("ARES_WRITE_FIXTURES").is_some() {
        fs::create_dir_all(&dir).unwrap_or_else(|error| panic!("{}: {error}", dir.display()));
        fs::write(&path, &serialized).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        return;
    }

    let committed = fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!(
            "{}: {error}\nrun `ARES_WRITE_FIXTURES=1 cargo test --test contract_fixtures` \
             to generate it",
            path.display()
        )
    });
    let committed: Value =
        serde_json::from_str(&committed).unwrap_or_else(|error| panic!("{name}: {error}"));
    assert_eq!(
        &committed, packet,
        "{name} is stale: the engine output changed. If the change is intended, \
         rerun with ARES_WRITE_FIXTURES=1 and agree the new format on the issue."
    );
}

/// A pure terrestrial replay of `bidmc_01` at a degraded second.
fn pure_replay_packet() -> Value {
    let mission = MissionState::with_recorded_source(bidmc_01()).expect("playbooks compile");
    let packet = mission
        .packet_for_second(DEGRADED_SECOND, FIXTURE_TIMESTAMP_MS)
        .expect("recorded second exists");
    serde_json::to_value(&packet).expect("packet must serialize")
}

/// The same replay with the What-If console engaged.
fn whatif_packet() -> Value {
    let mut mission = MissionState::with_recorded_source(bidmc_01()).expect("playbooks compile");
    mission
        .apply_stress_test(&StressTestRequest {
            cabin_ppco2_mmhg: Some(5.4),
            ared_workload_pct: Some(40.0),
            lbnp_pressure_mmhg: Some(-35.0),
            mission_elapsed_days: Some(184.0),
            clinical_state: None,
        })
        .expect("console values are inside the accepted ranges");
    let packet = mission
        .packet_for_second(DEGRADED_SECOND, FIXTURE_TIMESTAMP_MS)
        .expect("recorded second exists");
    serde_json::to_value(&packet).expect("packet must serialize")
}

#[test]
fn pure_replay_fixture_satisfies_the_contract() {
    let packet = pure_replay_packet();
    assert_valid(&packet, "contracts/fixtures/telemetry_bidmc_replay.json");
    assert_matches_fixture(&packet, "telemetry_bidmc_replay.json");
}

#[test]
fn whatif_fixture_satisfies_the_contract() {
    let packet = whatif_packet();
    assert_valid(&packet, "contracts/fixtures/telemetry_whatif_overlay.json");
    assert_matches_fixture(&packet, "telemetry_whatif_overlay.json");
}

/// Issue #4: the recording's own provenance, never dressed up as spaceflight.
#[test]
fn pure_replay_declares_terrestrial_bidmc_provenance() {
    let packet = pure_replay_packet();
    let manifest = &packet["provenance_manifest"];

    assert_eq!(packet["source_record_id"], "bidmc_01");
    assert_eq!(packet["astronaut_id"], "BIDMC-SUBJECT-01");
    assert_eq!(
        manifest["biometrics_source"],
        "RECORDED_TERRESTRIAL_BIDMC_CSV"
    );
    assert_eq!(manifest["scenario_overlay_mode"], "NONE_PURE_REPLAY");
    // A 1 Hz recording is never reported as a 20 Hz acquisition.
    assert_eq!(manifest["biometrics_native_rate_hz"], 1.0);
    assert_eq!(manifest["ui_refresh_rate_hz"], 20.0);
    // The emission clock and the recording clock stay separate.
    assert_eq!(packet["timestamp_ms"], FIXTURE_TIMESTAMP_MS);
    assert_eq!(packet["relative_recording_time_s"], 111.0);
}

/// Nothing simulated, and no indicator the record cannot support.
#[test]
fn pure_replay_leaves_unsupported_blocks_null() {
    let packet = pure_replay_packet();

    assert!(
        packet["hemodynamics"].is_null(),
        "no jugular in a numerics CSV"
    );
    assert!(
        packet["musculoskeletal"].is_null(),
        "no soleus in a numerics CSV"
    );
    assert!(
        packet["environment"].is_null(),
        "no cabin in a numerics CSV"
    );
    assert!(
        packet["mission_elapsed_days"].is_null(),
        "a terrestrial recording has no mission day"
    );

    let margins = &packet["safety_margins"];
    assert_eq!(margins["provenance"], "DERIVED_FROM_RECORDED_BIDMC");
    assert!(
        margins["time_to_violation_days"].is_null(),
        "8 minutes cannot support a horizon in days"
    );
    assert!(margins["med_stl_rho_robustness"].is_null());
    assert!(margins["mission_readiness_index"].is_null());

    let biometrics = &packet["biometrics"];
    assert!(
        biometrics["rr_interval_ms"].is_null() && biometrics["hrv_rmssd_ms"].is_null(),
        "1 Hz numerics carry no beat-to-beat information"
    );
    assert!(biometrics["core_temp_celsius"].is_null());
}

/// The browser check Lello asked for, asserted here on the server side.
#[test]
fn the_missing_seconds_are_null_named_and_degrade_the_alarm() {
    let mission = MissionState::with_recorded_source(bidmc_01()).expect("playbooks compile");

    for second in 111..=123 {
        let packet = serde_json::to_value(
            mission
                .packet_for_second(second, FIXTURE_TIMESTAMP_MS)
                .expect("recorded second exists"),
        )
        .expect("packet must serialize");
        let biometrics = &packet["biometrics"];

        assert!(
            biometrics["pulse_rate_bpm"].is_null(),
            "PULSE at {second} s must stay unavailable"
        );
        assert!(
            biometrics["spo2_percent"].is_null(),
            "SpO2 at {second} s must stay unavailable"
        );
        assert_eq!(
            biometrics["missing_channels"],
            serde_json::json!(["pulse_rate_bpm", "spo2_percent"]),
            "the cockpit needs the channel names to label them at {second} s"
        );
        // Recorded channels that are present are untouched by the gap.
        assert_eq!(biometrics["heart_rate_bpm"], 92.0);
        assert!(biometrics["respiration_rate_brpm"].is_number());

        assert_eq!(
            packet["safety_margins"]["alarm_level"], "DATA_DEGRADED_MISSING_CHANNELS",
            "a null engine input must show as degraded, not as nominal, at {second} s"
        );
    }

    // The second before and the second after the gap are fully recorded.
    for second in [110_usize, 124] {
        let packet = serde_json::to_value(
            mission
                .packet_for_second(second, FIXTURE_TIMESTAMP_MS)
                .expect("recorded second exists"),
        )
        .expect("packet must serialize");
        assert!(
            packet["biometrics"]["spo2_percent"].is_number(),
            "SpO2 at {second} s is recorded"
        );
        assert_eq!(
            packet["biometrics"]["missing_channels"],
            serde_json::json!([]),
            "no channel is missing at {second} s"
        );
    }
}

/// The What-If overlay is shown beside the recording, not instead of it.
#[test]
fn whatif_overlay_adds_simulated_blocks_without_relabelling_the_recording() {
    let packet = whatif_packet();
    let manifest = &packet["provenance_manifest"];

    // The biometrics are still the recorded ones, at their real rate.
    assert_eq!(
        manifest["biometrics_source"],
        "RECORDED_TERRESTRIAL_BIDMC_CSV"
    );
    assert_eq!(manifest["biometrics_native_rate_hz"], 1.0);
    // But the frame now admits that simulated inputs sit beside them.
    assert_eq!(
        manifest["scenario_overlay_mode"],
        "SIMULATED_WHATIF_SCENARIO"
    );
    assert_eq!(
        packet["safety_margins"]["provenance"],
        "DERIVED_FROM_HYBRID_SCENARIO"
    );

    for block in ["hemodynamics", "musculoskeletal", "environment"] {
        assert_eq!(
            packet[block]["provenance"], "SIMULATED_SCENARIO_INPUT",
            "{block} must be tagged as simulated"
        );
    }
    assert_eq!(packet["mission_elapsed_days"], 184.0);
    assert_eq!(packet["environment"]["cabin_ppco2_mmhg"], 5.4);

    // The recorded gap is still a gap: the overlay invents no PPG.
    assert!(packet["biometrics"]["pulse_rate_bpm"].is_null());
    assert!(packet["biometrics"]["spo2_percent"].is_null());
}

/// A console patch must not be able to rewrite recorded history.
#[test]
fn a_console_patch_cannot_overwrite_a_recorded_channel() {
    let mut mission = MissionState::with_recorded_source(bidmc_01()).expect("playbooks compile");

    let before = serde_json::to_value(
        mission
            .packet_for_second(0, FIXTURE_TIMESTAMP_MS)
            .expect("second 0 exists"),
    )
    .expect("packet must serialize");
    assert_eq!(before["biometrics"]["heart_rate_bpm"], 94.0);

    // The console tries a full state replacement with fabricated vitals.
    let mut forged = ares_medops_playbooks::state::ClinicalState::default();
    forged.vitals.heart_rate_bpm = Some(210.0);
    forged.vitals.spo2_percent = Some(55.0);
    forged.vitals.respiration_rate_brpm = Some(44.0);
    mission
        .apply_stress_test(&StressTestRequest {
            clinical_state: Some(forged),
            ..StressTestRequest::default()
        })
        .expect("a full state replacement is an accepted console request");

    let after = serde_json::to_value(
        mission
            .packet_for_second(0, FIXTURE_TIMESTAMP_MS)
            .expect("second 0 exists"),
    )
    .expect("packet must serialize");

    assert_eq!(
        after["biometrics"]["heart_rate_bpm"], 94.0,
        "the recorded HR is owned by the replayer, not by the console"
    );
    assert_eq!(after["biometrics"]["spo2_percent"], 97.0);
    assert_eq!(after["biometrics"]["respiration_rate_brpm"], 25.0);
    assert_eq!(
        after["relative_recording_time_s"], 0.0,
        "a console patch must not advance the replay"
    );
}

/// Simulated-only mode must never claim to be a recording.
#[test]
fn simulated_only_mode_is_tagged_as_simulated() {
    let mission = MissionState::new("ASTRO-01", "SIM-WHATIF-CONSOLE").expect("playbooks compile");
    let packet = serde_json::to_value(mission.packet()).expect("packet must serialize");

    assert_valid(&packet, "simulated-only packet");
    assert_eq!(
        packet["provenance_manifest"]["biometrics_source"],
        "SIMULATED_SCENARIO_INPUT"
    );
    assert!(
        packet["biometrics"]["pulse_rate_bpm"].is_null(),
        "the scenario generator does not model PPG"
    );
    assert!(
        mission.packet_for_second(0, FIXTURE_TIMESTAMP_MS).is_none(),
        "there is no recorded second to render in simulated-only mode"
    );
}
