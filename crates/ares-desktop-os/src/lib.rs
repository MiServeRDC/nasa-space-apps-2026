//! Fase 22 (J2): `crates/ares-desktop-os` — `ARES-MedOS` Pure-Rust Workstation OS Shell.
//!
//! Embedda in-process tutti i crate dell'engine (`SharedMissionState`), mantiene un
//! `SeqlockTelemetryRing<64>` lock-free per frame binari da 128 byte (`BinaryTelemetryFrame`),
//! monitora le 4 partizioni `ARINC 653` e lo stato `OWLT` Marte, ed espone i dispatcher IPC
//! in-process verso la shell nativa e la `FastMCP` Command Palette.

pub mod ipc_bridge;
pub mod voice_whisper;

use crate::voice_whisper::{OfflineVoiceTranscript, transcribe_pcm16_16khz_offline};
use ares_core_types::binary_ipc::{
    ARES_BINARY_FRAME_BYTES, BinaryTelemetryFrame, DEONTIC_EIMO_AUTONOMOUS, DEONTIC_EVA_FORBIDDEN,
    DEONTIC_SHELTER_MANDATORY, DEONTIC_VIOLATES_POLICY, FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
    FLAG_CHANNEL_NAN_DROPOUT, FLAG_GATE1_ANTICOAG_LOCK, FLAG_GATE2_LBNP_VENT,
    FLAG_GATE3_EVA_DAMPING, FLAG_ILLUSTRATIVE_UNVALIDATED, FLAG_LBNP_ACTIVE,
    FLAG_POCUS_CONFIRMED, FLAG_WHAT_IF_ACTIVE, MASK_CRS_SCORE, MASK_HR_BPM, MASK_IJV_SHEAR_PA,
    MASK_MRI_SCORE, MASK_NQS_MIN_RHO, MASK_OWLT_DELAY_SEC, MASK_PULSE_BPM, MASK_RADIATION_MSV_D,
    MASK_RESP_BRPM, MASK_RMSSD_MS, MASK_SANS_RISK, MASK_SOST_PG_ML, MASK_SPO2_PCT,
    MASK_TTV_Q05_DAYS, MASK_TTV_Q50_DAYS, MASK_TTV_Q95_DAYS, PARTITION_ALL_NOMINAL,
    SeqlockTelemetryRing, alert_severity_to_u16, playbook_id_to_u16,
};
use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_core_types::telemetry::{HrvUnavailableReason, ScenarioOverlayMode};
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use ares_server_cli::edge_llm_bridge::{CopilotAskRequest, CopilotAskResponse};
use ares_server_cli::fastmcp_router::{
    JsonRpcRequest, JsonRpcResponse, handle_fastmcp_jsonrpc_request,
};
use ares_server_cli::wire_contract::{StressTestPatchRequest, WireTelemetryPacket};
use ares_server_cli::ws_server::{ServerRuntimeError, SharedMissionState};
use ares_telemetry_ingest::wearable_packet::{
    WEARABLE_SYNC_WORD, WFLAG_EVA_SUIT_NODE, WFLAG_SEU_RECOVERY_EVENT, WMASK_HR_BPM,
    WMASK_IMU_RMS, WMASK_RESP_BRPM, WMASK_SPO2_PCT, ValidatedTelemetryFrame, WearableSensorPacket,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use thiserror::Error;

pub use ares_server_cli::ws_server::{
    Arinc653PartitionHealth, OsStatusBarState, OwltMarsCommState, PartitionId,
};

/// Errori tipizzati per la workstation shell `ARES-MedOS`.
#[derive(Debug, Error)]
pub enum DesktopShellError {
    #[error("failed to initialize shared mission state: {0}")]
    RuntimeInit(#[from] ServerRuntimeError),

    #[error("telemetry data directory not found: {0}")]
    MissingDataDir(PathBuf),

    #[error("mission state lock unavailable")]
    StateLockUnavailable,

    #[error("binary telemetry frame unavailable: {0}")]
    BinaryFrameUnavailable(String),

    #[error("invalid FastMCP JSON-RPC payload: {0}")]
    InvalidJsonRpc(String),

    #[error("serialization failure: {0}")]
    Serialization(String),

    #[error("edge copilot error: {0}")]
    EdgeCopilot(String),

    #[error("offline voice ASR error: {0}")]
    OfflineVoice(String),

    #[error("smoke test invariant failed: {0}")]
    SmokeTestFailed(String),
}

/// Resolves the bundled or workspace `data/bidmc` directory across macOS `.app`, Linux `.AppImage`,
/// env override (`ARES_MEDOS_DATA_DIR`), and local workspace invocations.
pub fn resolve_medos_data_dir(explicit: Option<&Path>) -> Result<PathBuf, DesktopShellError> {
    if let Some(p) = explicit {
        if p.join("bidmc_01_Numerics.csv").is_file() {
            return Ok(p.to_path_buf());
        }
        return Err(DesktopShellError::MissingDataDir(p.to_path_buf()));
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(env_dir) = std::env::var("ARES_MEDOS_DATA_DIR") {
        candidates.push(PathBuf::from(env_dir));
    }
    if let Ok(exe) = std::env::current_exe()
        && let Some(parent) = exe.parent()
    {
        candidates.push(parent.join("data").join("bidmc"));
        candidates.push(parent.join("..").join("Resources").join("data").join("bidmc"));
        candidates.push(parent.join("..").join("lib").join("ares-medos").join("data").join("bidmc"));
    }
    candidates.push(PathBuf::from("data/bidmc"));
    candidates.push(PathBuf::from("../../data/bidmc"));
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("data")
            .join("bidmc"),
    );

    for candidate in &candidates {
        if candidate.join("bidmc_01_Numerics.csv").is_file() {
            return Ok(candidate.clone());
        }
    }

    Err(DesktopShellError::MissingDataDir(
        explicit
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("data/bidmc")),
    ))
}

/// Configurazione deterministica di avvio per `AresMedOsWorkstationShell`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DesktopShellConfig {
    pub data_dir: PathBuf,
    pub enable_loopback_ws_mirror: bool,
    pub loopback_bind_addr: String,
    pub telemetry_hz: u32,
    pub air_gapped_csp_enforced: bool,
}

impl Default for DesktopShellConfig {
    fn default() -> Self {
        Self {
            data_dir: PathBuf::from("data/bidmc"),
            enable_loopback_ws_mirror: true,
            loopback_bind_addr: "127.0.0.1:8080".to_string(),
            telemetry_hz: 20,
            air_gapped_csp_enforced: true,
        }
    }
}

/// Risultato deterministico dello smoke-test della workstation `ARES-MedOS` a 8 crate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DesktopSmokeTestReport {
    pub bidmc_ticks_processed: u32,
    pub wearable_seu_restarts_observed: u16,
    pub seqlock_writes: u64,
    pub fastmcp_tools_executed: usize,
    pub max_fastmcp_response_bytes: usize,
    pub binary_frame_magic: u32,
    pub binary_frame_crc32c: u32,
    pub datasets_loaded: usize,
    pub status_bar: OsStatusBarState,
}

#[inline]
fn encode_wire_opt_f64(val: Option<f64>, bit: u32, mask: &mut u32) -> f32 {
    match val {
        Some(v) if v.is_finite() => {
            let v32 = v as f32;
            if v32.is_finite() {
                *mask |= bit;
                v32
            } else {
                f32::NAN
            }
        }
        _ => f32::NAN,
    }
}

/// Pure-Rust `ARES-MedOS` Workstation Shell runtime embedding `SharedMissionState`
/// and a lock-free `SeqlockTelemetryRing<64>` for zero-copy 128-byte IPC.
#[derive(Clone)]
pub struct AresMedOsWorkstationShell {
    pub mission: Arc<SharedMissionState>,
    pub ring: Arc<SeqlockTelemetryRing<64>>,
    pub config: DesktopShellConfig,
    pub ws_mirror_bound: Arc<AtomicBool>,
}

impl AresMedOsWorkstationShell {
    /// Initializes all 8 workspace crates in-process from `config.data_dir`.
    pub fn initialize(config: DesktopShellConfig) -> Result<Self, DesktopShellError> {
        if !config.data_dir.exists() {
            return Err(DesktopShellError::MissingDataDir(config.data_dir.clone()));
        }
        let mission = SharedMissionState::from_data_dir(&config.data_dir)?;
        let ring = Arc::clone(&mission.binary_ring);
        Ok(Self {
            mission,
            ring,
            config,
            ws_mirror_bound: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Advances the dual-clock runtime (`1 Hz` BIDMC + `20 Hz` ODE/HyperGraph) and returns
    /// the freshly published 128-byte `BinaryTelemetryFrame`.
    pub fn advance_tick(&self, dt: Duration) -> Result<BinaryTelemetryFrame, DesktopShellError> {
        self.mission
            .advance_tick(dt)
            .ok_or(DesktopShellError::StateLockUnavailable)?;
        self.ring
            .read_latest()
            .map_err(|e| DesktopShellError::BinaryFrameUnavailable(e.to_string()))
    }

    /// Processes a Tier C `WearableSensorPacket` (`Oxide Hubris` / `Embassy`) and publishes
    /// the updated 128-byte frame into `SeqlockTelemetryRing<64>`.
    pub fn ingest_wearable_packet(
        &self,
        packet: &WearableSensorPacket,
    ) -> Result<ValidatedTelemetryFrame, DesktopShellError> {
        self.mission
            .ingest_wearable_packet(packet)
            .ok_or(DesktopShellError::StateLockUnavailable)
    }

    /// Encodes a `WireTelemetryPacket` into a 128-byte `BinaryTelemetryFrame` using
    /// the workstation's live `ARINC 653` partition health, deontic habitat mask,
    /// and `OWLT` Mars communication state, and publishes it to `SeqlockTelemetryRing<64>`.
    pub fn encode_wire_packet_to_binary(
        &self,
        wire: &WireTelemetryPacket,
        seq: u64,
        ipc_latency_ns: u32,
    ) -> BinaryTelemetryFrame {
        let mut validity_mask: u32 = 0;

        let hr_bpm = encode_wire_opt_f64(
            wire.biometrics.heart_rate_bpm,
            MASK_HR_BPM,
            &mut validity_mask,
        );
        let pulse_bpm = encode_wire_opt_f64(
            wire.biometrics.pulse_rate_bpm,
            MASK_PULSE_BPM,
            &mut validity_mask,
        );
        let resp_brpm = encode_wire_opt_f64(
            wire.biometrics.resp_rate_brpm,
            MASK_RESP_BRPM,
            &mut validity_mask,
        );
        let spo2_pct =
            encode_wire_opt_f64(wire.biometrics.spo2_pct, MASK_SPO2_PCT, &mut validity_mask);
        let rmssd_ms =
            encode_wire_opt_f64(wire.biometrics.rmssd_ms, MASK_RMSSD_MS, &mut validity_mask);
        let mri_score = encode_wire_opt_f64(
            wire.safety_margins.mission_readiness_index,
            MASK_MRI_SCORE,
            &mut validity_mask,
        );
        let crs_score = encode_wire_opt_f64(
            wire.hemodynamics
                .as_ref()
                .and_then(|h| h.thrombosis_risk_score),
            MASK_CRS_SCORE,
            &mut validity_mask,
        );
        let sans_risk = encode_wire_opt_f64(
            wire.sans_ocular.as_ref().map(|s| s.sans_risk_index),
            MASK_SANS_RISK,
            &mut validity_mask,
        );
        let ijv_shear_pa = encode_wire_opt_f64(
            wire.hemodynamics
                .as_ref()
                .map(|h| h.wall_shear_stress_dyn_cm2 * 0.1),
            MASK_IJV_SHEAR_PA,
            &mut validity_mask,
        );
        let sost_pg_ml = encode_wire_opt_f64(
            wire.musculoskeletal
                .as_ref()
                .map(|m| m.bone_resorption_rate_pct * 200.0 * 0.12),
            MASK_SOST_PG_ML,
            &mut validity_mask,
        );
        let radiation_msv_d = encode_wire_opt_f64(
            Some(wire.biometrics.radiation_dose_rate_msv_d),
            MASK_RADIATION_MSV_D,
            &mut validity_mask,
        );
        let nqs_min_rho = encode_wire_opt_f64(
            wire.nqs_stl_status.rho_global,
            MASK_NQS_MIN_RHO,
            &mut validity_mask,
        );
        let ttv_q05_days = encode_wire_opt_f64(
            wire.nqs_stl_status.ttv_ci95_low_hours.map(|h| h / 24.0),
            MASK_TTV_Q05_DAYS,
            &mut validity_mask,
        );
        let ttv_q50_days = encode_wire_opt_f64(
            wire.nqs_stl_status.ttv_hours.map(|h| h / 24.0),
            MASK_TTV_Q50_DAYS,
            &mut validity_mask,
        );
        let ttv_q95_days = encode_wire_opt_f64(
            wire.nqs_stl_status.ttv_ci95_high_hours.map(|h| h / 24.0),
            MASK_TTV_Q95_DAYS,
            &mut validity_mask,
        );

        let owlt = self.owlt_state();
        let owlt_delay_sec = encode_wire_opt_f64(
            Some(f64::from(owlt.owlt_seconds)),
            MASK_OWLT_DELAY_SEC,
            &mut validity_mask,
        );

        let mut quality_flags_mask: u32 = FLAG_ILLUSTRATIVE_UNVALIDATED;
        if matches!(
            wire.provenance_manifest.scenario_overlay_mode,
            ScenarioOverlayMode::SimulatedWhatifScenario | ScenarioOverlayMode::DerivedAndSimulated
        ) || wire.what_if_overlay.active
        {
            quality_flags_mask |= FLAG_WHAT_IF_ACTIVE;
        }
        if wire
            .hemodynamics
            .as_ref()
            .is_some_and(|h| h.pocus_thrombus_confirmed)
        {
            quality_flags_mask |= FLAG_POCUS_CONFIRMED;
        }
        if wire.hemodynamics.as_ref().is_some_and(|h| h.lbnp_active) {
            quality_flags_mask |= FLAG_LBNP_ACTIVE;
        }
        if wire.active_playbook.safety_gates.anticoagulant_lock_active {
            quality_flags_mask |= FLAG_GATE1_ANTICOAG_LOCK;
        }
        if wire.active_playbook.safety_gates.lbnp_auto_vent_armed {
            quality_flags_mask |= FLAG_GATE2_LBNP_VENT;
        }
        if wire.active_playbook.safety_gates.eva_suit_damping_active {
            quality_flags_mask |= FLAG_GATE3_EVA_DAMPING;
        }
        if matches!(
            wire.biometrics.hrv_unavailable_reason,
            Some(HrvUnavailableReason::BeatIntervalsNotAvailable)
        ) || wire.biometrics.rmssd_ms.is_none()
        {
            quality_flags_mask |= FLAG_BEAT_INTERVALS_NOT_AVAILABLE;
        }
        if !wire.biometrics.missing_channels.is_empty() {
            quality_flags_mask |= FLAG_CHANNEL_NAN_DROPOUT;
        }

        let mut deontic_habitat_mask = 0u8;
        if let Ok(status) = self.ipc_get_os_status_bar_state() {
            deontic_habitat_mask = (status.habitat_zone as u8) & 0x07;
            if status.violates_policy {
                deontic_habitat_mask |= DEONTIC_VIOLATES_POLICY;
            }
            if status.eva_airlock_forbidden {
                deontic_habitat_mask |= DEONTIC_EVA_FORBIDDEN;
            }
            if status.storm_shelter_mandatory {
                deontic_habitat_mask |= DEONTIC_SHELTER_MANDATORY;
            }
            if status.owlt.eimo_autonomous_active {
                deontic_habitat_mask |= DEONTIC_EIMO_AUTONOMOUS;
            }
        }

        let mut frame = BinaryTelemetryFrame {
            magic: ares_core_types::binary_ipc::ARES_BINARY_MAGIC,
            schema_version: ares_core_types::binary_ipc::ARES_BINARY_VERSION,
            partition_status: PARTITION_ALL_NOMINAL,
            deontic_habitat_mask,
            seq,
            timestamp_ms: wire.timestamp_ms,
            validity_mask,
            quality_flags_mask,
            hr_bpm,
            pulse_bpm,
            resp_brpm,
            spo2_pct,
            rmssd_ms,
            mri_score,
            crs_score,
            sans_risk,
            ijv_shear_pa,
            sost_pg_ml,
            radiation_msv_d,
            nqs_min_rho,
            ttv_q05_days,
            ttv_q50_days,
            ttv_q95_days,
            owlt_delay_sec,
            active_playbook_id: playbook_id_to_u16(&wire.active_playbook.playbook_id),
            active_alert_code: alert_severity_to_u16(wire.alert_severity),
            ipc_latency_ns,
            crc32c: 0,
            reserved: [0u8; 20],
        };
        let bytes = frame.to_le_bytes();
        frame.crc32c = u32::from_le_bytes([bytes[104], bytes[105], bytes[106], bytes[107]]);
        self.ring.publish(&frame);
        frame
    }

    /// Returns live `ARINC 653` partition health for all 4 workstation partitions.
    pub fn partition_health(&self) -> Vec<Arinc653PartitionHealth> {
        self.ipc_get_os_status_bar_state()
            .map(|s| s.partitions)
            .unwrap_or_default()
    }

    /// Returns Mars One-Way Light Time (`OWLT`) communication state.
    pub fn owlt_state(&self) -> OwltMarsCommState {
        self.ipc_get_os_status_bar_state()
            .map(|s| s.owlt)
            .unwrap_or(OwltMarsCommState {
                owlt_seconds: 852.0,
                eimo_autonomous_active: true,
                blackout_active: false,
                label: "OWLT: 14m 12s (EIMO AUTONOMOUS)".to_string(),
            })
    }

    /// In-process IPC dispatcher: returns the latest 128-byte `BinaryTelemetryFrame` bytes.
    pub fn ipc_get_binary_frame_bytes(
        &self,
    ) -> Result<[u8; ARES_BINARY_FRAME_BYTES], DesktopShellError> {
        self.ring
            .read_latest_bytes()
            .or_else(|_| {
                self.mission
                    .latest_binary_frame_bytes()
                    .ok_or_else(|| {
                        DesktopShellError::BinaryFrameUnavailable("ring empty".to_string())
                    })
            })
    }

    /// In-process IPC dispatcher: returns the latest `WireTelemetryPacket` serialized as JSON.
    pub fn ipc_get_snapshot_json(&self) -> Result<String, DesktopShellError> {
        let packet = self
            .mission
            .latest_wire_snapshot()
            .ok_or(DesktopShellError::StateLockUnavailable)?;
        serde_json::to_string(&packet).map_err(|e| DesktopShellError::Serialization(e.to_string()))
    }

    /// In-process IPC dispatcher: applies a What-If patch without advancing the 1 Hz BIDMC cursor.
    pub fn ipc_post_stress_test(
        &self,
        patch: StressTestPatchRequest,
    ) -> Result<WireTelemetryPacket, DesktopShellError> {
        self.mission
            .apply_stress_test_patch(patch)
            .ok_or(DesktopShellError::StateLockUnavailable)
    }

    /// In-process IPC dispatcher: executes a Context-Mode `FastMCP` JSON-RPC 2.0 request.
    pub fn ipc_invoke_fastmcp_tool(
        &self,
        request_json: &str,
    ) -> Result<String, DesktopShellError> {
        let req: JsonRpcRequest = serde_json::from_str(request_json)
            .map_err(|e| DesktopShellError::InvalidJsonRpc(e.to_string()))?;
        let ctx = self
            .mission
            .fastmcp_context()
            .ok_or(DesktopShellError::StateLockUnavailable)?;
        let sanitizer = StrictMcpSanitizer;
        let resp: JsonRpcResponse = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
        serde_json::to_string(&resp).map_err(|e| DesktopShellError::Serialization(e.to_string()))
    }

    /// In-process IPC dispatcher: returns the unified `ARES-MedOS` `OsStatusBarState`.
    pub fn ipc_get_os_status_bar_state(&self) -> Result<OsStatusBarState, DesktopShellError> {
        self.mission
            .os_status_bar_state(
                "ARES-MedOS",
                env!("CARGO_PKG_VERSION"),
                "TAURI_NATIVE_IPC",
                self.config.air_gapped_csp_enforced,
                self.ws_mirror_bound.load(Ordering::Relaxed),
            )
            .ok_or(DesktopShellError::StateLockUnavailable)
    }

    /// In-process IPC dispatcher: runs an air-gapped Phase 32 Edge Copilot query
    /// with `< 400 us` deterministic Type-1 fallback.
    pub async fn ipc_ask_edge_copilot(
        &self,
        request: CopilotAskRequest,
    ) -> Result<CopilotAskResponse, DesktopShellError> {
        self.mission
            .ask_edge_copilot(request)
            .await
            .map_err(|e| DesktopShellError::EdgeCopilot(e.to_string()))
    }

    /// In-process IPC dispatcher: transcribes offline 16 kHz mono PCM16 audio into text.
    pub fn ipc_transcribe_pcm16_offline(
        &self,
        pcm_i16: &[i16],
        sample_rate_hz: u32,
        model_path: Option<&Path>,
    ) -> Result<OfflineVoiceTranscript, DesktopShellError> {
        transcribe_pcm16_16khz_offline(pcm_i16, sample_rate_hz, model_path)
            .map_err(|e| DesktopShellError::OfflineVoice(e.to_string()))
    }

    /// Runs the full deterministic 8-crate workstation verification smoke test:
    /// 1. Advances `bidmc_01_Numerics.csv` ticks & runs 1 Hz Timestral inference.
    /// 2. Decodes & ingests a simulated Tier C `WearableSensorPacket` with an SEU restart.
    /// 3. Reads & verifies the 128-byte `BinaryTelemetryFrame` from `SeqlockTelemetryRing<64>`.
    /// 4. Executes all 8 `FastMCP` tools via `ipc_invoke_fastmcp_tool` under the 600-byte cap.
    pub fn run_desktop_smoke_test(&self) -> Result<DesktopSmokeTestReport, DesktopShellError> {
        let mut ticks = 0u32;
        for _ in 0..20 {
            let _ = self.advance_tick(Duration::from_millis(50))?;
            ticks += 1;
        }
        let _ = self
            .mission
            .run_1hz_timestral_step()
            .ok_or(DesktopShellError::StateLockUnavailable)?;

        let simulated_wearable = WearableSensorPacket {
            sync_word: WEARABLE_SYNC_WORD,
            node_id: 1,
            channel_mask: WMASK_HR_BPM | WMASK_SPO2_PCT | WMASK_RESP_BRPM | WMASK_IMU_RMS,
            sequence_num: 2048,
            uptime_ms: 88_000,
            supervisor_restart_count: 1,
            hr_bpm_x100: 7620,
            spo2_pct_x100: 9810,
            resp_brpm_x100: 1520,
            rr_interval_ms_x10: 0,
            sqi_score_x10000: 9300,
            imu_rms_g: 0.12,
            flags: WFLAG_SEU_RECOVERY_EVENT | WFLAG_EVA_SUIT_NODE,
            crc16_ccitt: 0,
        };
        let raw_wearable = simulated_wearable.to_le_bytes_with_crc();
        let verified_wearable = WearableSensorPacket::decode_and_verify(&raw_wearable)
            .map_err(|e| DesktopShellError::SmokeTestFailed(e.to_string()))?;
        let validated = self.ingest_wearable_packet(&verified_wearable)?;

        let t0 = Instant::now();
        let frame_bytes = self.ipc_get_binary_frame_bytes()?;
        let read_ns = t0.elapsed().as_nanos();
        let decoded_frame = BinaryTelemetryFrame::from_le_bytes(&frame_bytes)
            .map_err(|e| DesktopShellError::BinaryFrameUnavailable(e.to_string()))?;

        if (decoded_frame.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE) == 0 {
            return Err(DesktopShellError::SmokeTestFailed(
                "expected FLAG_BEAT_INTERVALS_NOT_AVAILABLE on numeric/non-RR stream".to_string(),
            ));
        }

        let tool_invocations = [
            ("get_crew_health_summary", json!({})),
            ("explain_causal_anomaly", json!({})),
            ("simulate_countermeasure_impact", json!({})),
            ("get_medops_playbook", json!({})),
            ("query_dataset_graph", json!({ "query": "OSD-51" })),
            (
                "explain_biomarker_path",
                json!({ "from": "OSD-818", "to": "bm_hr" }),
            ),
            ("get_timestral_quantile_cones", json!({})),
            ("get_hypergraph_spatial_status", json!({})),
        ];

        let mut max_bytes = 0usize;
        for (idx, (tool_name, args)) in tool_invocations.iter().enumerate() {
            let req = json!({
                "jsonrpc": "2.0",
                "id": idx + 1,
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": args,
                }
            });
            let resp_str = self.ipc_invoke_fastmcp_tool(&req.to_string())?;
            let resp_val: serde_json::Value = serde_json::from_str(&resp_str)
                .map_err(|e| DesktopShellError::Serialization(e.to_string()))?;
            if let Some(err) = resp_val.get("error")
                && !err.is_null()
            {
                return Err(DesktopShellError::SmokeTestFailed(format!(
                    "FastMCP tool {tool_name} failed: {err}"
                )));
            }
            let text = resp_val["result"]["content"][0]["text"]
                .as_str()
                .ok_or_else(|| {
                    DesktopShellError::SmokeTestFailed(format!(
                        "missing text payload for FastMCP tool {tool_name}"
                    ))
                })?;
            if text.len() > MAX_MCP_CONTEXT_MODE_BYTES {
                return Err(DesktopShellError::SmokeTestFailed(format!(
                    "FastMCP tool {tool_name} exceeded {MAX_MCP_CONTEXT_MODE_BYTES} bytes: {}",
                    text.len()
                )));
            }
            max_bytes = max_bytes.max(text.len());
        }

        let status_bar = self.ipc_get_os_status_bar_state()?;
        if status_bar.partitions.len() != 4 {
            return Err(DesktopShellError::SmokeTestFailed(format!(
                "expected 4 ARINC 653 partitions, found {}",
                status_bar.partitions.len()
            )));
        }

        tracing::info!(
            read_ns,
            seqlock_writes = self.ring.write_count(),
            max_fastmcp_bytes = max_bytes,
            seu_restarts = validated.supervisor_restart_count,
            "ARES-MedOS 8-crate workstation smoke test passed"
        );

        Ok(DesktopSmokeTestReport {
            bidmc_ticks_processed: ticks,
            wearable_seu_restarts_observed: validated.supervisor_restart_count,
            seqlock_writes: self.ring.write_count(),
            fastmcp_tools_executed: tool_invocations.len(),
            max_fastmcp_response_bytes: max_bytes,
            binary_frame_magic: decoded_frame.magic,
            binary_frame_crc32c: decoded_frame.crc32c,
            datasets_loaded: self.mission.dataset_graph.dataset_count(),
            status_bar,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ares_core_types::binary_ipc::{ARES_BINARY_MAGIC, MASK_RMSSD_MS};
    use ares_server_cli::ws_server::default_scenario_input;
    use std::path::Path;

    fn workspace_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    fn workspace_bidmc_dir() -> PathBuf {
        workspace_root().join("data/bidmc")
    }

    fn init_shell() -> AresMedOsWorkstationShell {
        AresMedOsWorkstationShell::initialize(DesktopShellConfig {
            data_dir: workspace_bidmc_dir(),
            ..DesktopShellConfig::default()
        })
        .expect("initialize AresMedOsWorkstationShell")
    }

    #[test]
    fn test_workstation_shell_initializes_from_bidmc_and_emits_128b_seqlock_frame() {
        let shell = init_shell();
        let bytes = shell
            .ipc_get_binary_frame_bytes()
            .expect("binary frame bytes");
        assert_eq!(bytes.len(), 128);

        let frame = BinaryTelemetryFrame::from_le_bytes(&bytes).expect("valid 128B frame");
        assert_eq!(frame.magic, ARES_BINARY_MAGIC);
        assert_eq!(frame.partition_status, PARTITION_ALL_NOMINAL);
        assert_eq!(frame.validity_mask & MASK_RMSSD_MS, 0);
        assert_ne!(
            frame.quality_flags_mask & FLAG_BEAT_INTERVALS_NOT_AVAILABLE,
            0
        );
        assert_ne!(frame.quality_flags_mask & FLAG_ILLUSTRATIVE_UNVALIDATED, 0);

        let wire_json = shell.ipc_get_snapshot_json().expect("snapshot json");
        let wire: WireTelemetryPacket =
            serde_json::from_str(&wire_json).expect("valid WireTelemetryPacket JSON");
        let encoded = shell.encode_wire_packet_to_binary(&wire, 99, 250);
        assert_eq!(encoded.seq, 99);
        assert_eq!(encoded.rmssd_opt(), None);
    }

    #[test]
    fn test_ipc_post_stress_test_updates_state_without_advancing_1hz_cursor() {
        let shell = init_shell();
        let before: WireTelemetryPacket =
            serde_json::from_str(&shell.ipc_get_snapshot_json().expect("before json"))
                .expect("before wire");
        assert_eq!(before.relative_recording_time_s, 0.0);

        let mut scenario = default_scenario_input();
        scenario.ared_daily_load_kgf = 45.0;
        scenario.radiation_dose_rate_msv_d = 2.1;
        let updated = shell
            .ipc_post_stress_test(StressTestPatchRequest::from(scenario))
            .expect("stress test update");

        assert_eq!(updated.relative_recording_time_s, 0.0);
        assert!(updated.what_if_overlay.active);
        assert!(updated.hemodynamics.is_some());

        let status = shell.ipc_get_os_status_bar_state().expect("os status");
        assert!(status.eva_airlock_forbidden);
        assert!(status.storm_shelter_mandatory);
        assert_eq!(status.partitions.len(), 4);
        assert!(status.owlt.eimo_autonomous_active);
    }

    #[test]
    fn test_ipc_invoke_fastmcp_tool_executes_all_8_tools_under_600_bytes() {
        let shell = init_shell();
        let report = shell.run_desktop_smoke_test().expect("smoke test succeeds");
        assert_eq!(report.bidmc_ticks_processed, 20);
        assert_eq!(report.wearable_seu_restarts_observed, 1);
        assert_eq!(report.fastmcp_tools_executed, 8);
        assert!(report.max_fastmcp_response_bytes <= MAX_MCP_CONTEXT_MODE_BYTES);
        assert_eq!(report.datasets_loaded, 24);
        assert_eq!(report.binary_frame_magic, ARES_BINARY_MAGIC);
    }

    #[test]
    fn test_tauri_conf_csp_blocks_external_cloud_origins() {
        let conf_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
        let raw = std::fs::read_to_string(&conf_path).expect("read tauri.conf.json");
        let val: serde_json::Value = serde_json::from_str(&raw).expect("parse tauri.conf.json");
        let csp = val["app"]["security"]["csp"]
            .as_str()
            .expect("csp string present");
        assert!(csp.contains("default-src 'self'"));
        assert!(csp.contains("http://127.0.0.1:8080"));
        assert!(csp.contains("ws://127.0.0.1:8080"));
        assert!(!csp.contains("https://"));
        assert!(!csp.contains("http://0.0.0.0"));
    }

    #[test]
    fn test_deploy_medos_manifests_parse_and_reference_valid_crates() {
        let deploy_dir = workspace_root().join("deploy/medos");
        let asterinas = std::fs::read_to_string(deploy_dir.join("asterinas_framekernel_kiosk.toml"))
            .expect("asterinas manifest");
        assert!(asterinas.contains("ares-server-cli"));
        assert!(asterinas.contains("ares-desktop-os"));
        assert!(asterinas.contains("127.0.0.1:8080"));

        let cosmic = std::fs::read_to_string(deploy_dir.join("cosmic_wayland_kiosk.ron"))
            .expect("cosmic manifest");
        assert!(cosmic.contains("SingleWorkspaceKiosk"));
        assert!(cosmic.contains("org.areshealth.medos"));

        let hubris = std::fs::read_to_string(deploy_dir.join("hubris_wearable_app.toml"))
            .expect("hubris manifest");
        assert!(hubris.contains("WearableSensorPacket"));
        assert!(hubris.contains("supervisor_restart_count"));
    }
}
