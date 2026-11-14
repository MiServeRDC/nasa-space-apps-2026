//! Phase 30 (L2) & Phase 32 (L4): Tauri v2 Native IPC Bridge & Zero-Copy 128-Byte Binary Sink.
//!
//! Provides:
//! - `RawBinaryFrameSink`: zero-JSON-serialization trait emitting exact 128-byte `BinaryTelemetryFrame` bytes.
//! - `emit_next_seqlock_frame`: reads `SeqlockTelemetryRing<N>` and validates exact `ARES_BINARY_FRAME_BYTES` length.
//! - `HeadlessTauriBridge` (`--features tauri-runtime`): full parity IPC dispatcher across
//!   telemetry snapshots, OS status bar, What-If patching, FastMCP tool calls, 128B binary streaming,
//!   air-gapped Edge Copilot (`ipc_ask_edge_copilot`), and offline 16 kHz voice ASR.
//! - `tauri_commands` (`--features tauri-native`): pure-Rust command binding descriptor table
//!   ready for `tauri::generate_handler!` without requiring online `crates.io` downloads.

use crate::DesktopShellError;
use ares_core_types::binary_ipc::{ARES_BINARY_FRAME_BYTES, SeqlockTelemetryRing};
use std::sync::{Arc, Mutex};

/// Zero-JSON raw binary sink matching `tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>`.
pub trait RawBinaryFrameSink: Send + Sync {
    fn emit_raw_frame(&self, bytes: &[u8]) -> Result<(), DesktopShellError>;
}

/// Deterministic in-memory capture sink used in headless smoke tests and `tauri-runtime` tests.
#[derive(Debug, Default, Clone)]
pub struct RecordingBinaryFrameSink {
    frames: Arc<Mutex<Vec<Vec<u8>>>>,
}

impl RecordingBinaryFrameSink {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn captured_frames(&self) -> Result<Vec<Vec<u8>>, DesktopShellError> {
        let guard = self
            .frames
            .lock()
            .map_err(|_| DesktopShellError::StateLockUnavailable)?;
        Ok(guard.clone())
    }
}

impl RawBinaryFrameSink for RecordingBinaryFrameSink {
    fn emit_raw_frame(&self, bytes: &[u8]) -> Result<(), DesktopShellError> {
        if bytes.len() != ARES_BINARY_FRAME_BYTES {
            return Err(DesktopShellError::BinaryFrameUnavailable(format!(
                "expected {ARES_BINARY_FRAME_BYTES} raw bytes, received {}",
                bytes.len()
            )));
        }
        let mut guard = self
            .frames
            .lock()
            .map_err(|_| DesktopShellError::StateLockUnavailable)?;
        guard.push(bytes.to_vec());
        Ok(())
    }
}

/// Reads the latest 128-byte frame from `SeqlockTelemetryRing<N>` and emits raw bytes directly
/// without JSON conversion or floating-point re-formatting.
pub fn emit_next_seqlock_frame<const N: usize>(
    ring: &SeqlockTelemetryRing<N>,
    sink: &dyn RawBinaryFrameSink,
) -> Result<usize, DesktopShellError> {
    let raw = ring
        .read_latest_bytes()
        .map_err(|e| DesktopShellError::BinaryFrameUnavailable(e.to_string()))?;
    if raw.len() != ARES_BINARY_FRAME_BYTES {
        return Err(DesktopShellError::BinaryFrameUnavailable(format!(
            "seqlock frame size mismatch: {} != {ARES_BINARY_FRAME_BYTES}",
            raw.len()
        )));
    }
    sink.emit_raw_frame(&raw)?;
    Ok(raw.len())
}

#[cfg(feature = "tauri-runtime")]
pub use headless_bridge::HeadlessTauriBridge;

#[cfg(feature = "tauri-runtime")]
mod headless_bridge {
    use super::{RawBinaryFrameSink, emit_next_seqlock_frame};
    use crate::voice_whisper::OfflineVoiceTranscript;
    use crate::{AresMedOsWorkstationShell, DesktopShellError, OsStatusBarState};
    use ares_server_cli::edge_llm_bridge::{CopilotAskRequest, CopilotAskResponse};
    use ares_server_cli::wire_contract::{
        AnomalyInjectionRequest, StressTestPatchRequest, WireTelemetryPacket,
    };
    use std::path::Path;
    use std::sync::Arc;

    /// Canonical list of all Tauri v2 IPC command names exposed to `ares-cockpit`.
    pub const TAURI_IPC_COMMAND_NAMES: [&str; 8] = [
        "get_full_wire_snapshot",
        "get_os_status_bar_state",
        "apply_what_if_patch",
        "ipc_inject_anomaly",
        "invoke_fastmcp_tool",
        "subscribe_binary_telemetry",
        "ipc_ask_edge_copilot",
        "ipc_transcribe_pcm16_offline",
    ];

    /// Pure-Rust Tauri v2 IPC dispatcher usable both headlessly and inside native window shells.
    #[derive(Clone)]
    pub struct HeadlessTauriBridge {
        pub shell: Arc<AresMedOsWorkstationShell>,
    }

    impl HeadlessTauriBridge {
        pub fn new(shell: Arc<AresMedOsWorkstationShell>) -> Self {
            Self { shell }
        }

        pub fn command_names(&self) -> &'static [&'static str] {
            &TAURI_IPC_COMMAND_NAMES
        }

        pub fn get_full_wire_snapshot(&self) -> Result<WireTelemetryPacket, DesktopShellError> {
            self.shell
                .mission
                .latest_wire_snapshot()
                .ok_or(DesktopShellError::StateLockUnavailable)
        }

        pub fn get_os_status_bar_state(&self) -> Result<OsStatusBarState, DesktopShellError> {
            self.shell.ipc_get_os_status_bar_state()
        }

        pub fn apply_what_if_patch(
            &self,
            patch: StressTestPatchRequest,
        ) -> Result<WireTelemetryPacket, DesktopShellError> {
            self.shell.ipc_post_stress_test(patch)
        }

        pub fn ipc_inject_anomaly(
            &self,
            request: AnomalyInjectionRequest,
        ) -> Result<WireTelemetryPacket, DesktopShellError> {
            self.shell.ipc_inject_anomaly(request)
        }

        pub fn invoke_fastmcp_tool(&self, request_json: &str) -> Result<String, DesktopShellError> {
            self.shell.ipc_invoke_fastmcp_tool(request_json)
        }

        pub fn subscribe_binary_telemetry(
            &self,
            sink: &dyn RawBinaryFrameSink,
        ) -> Result<usize, DesktopShellError> {
            emit_next_seqlock_frame(&self.shell.ring, sink)
        }

        pub async fn ipc_ask_edge_copilot(
            &self,
            request: CopilotAskRequest,
        ) -> Result<CopilotAskResponse, DesktopShellError> {
            self.shell.ipc_ask_edge_copilot(request).await
        }

        pub fn ipc_transcribe_pcm16_offline(
            &self,
            pcm_i16: &[i16],
            sample_rate_hz: u32,
            model_path: Option<&Path>,
        ) -> Result<OfflineVoiceTranscript, DesktopShellError> {
            self.shell
                .ipc_transcribe_pcm16_offline(pcm_i16, sample_rate_hz, model_path)
        }
    }
}

#[cfg(feature = "tauri-native")]
pub mod tauri_commands {
    //! Native Tauri v2 command registry and descriptor wrapper (`tauri-native` feature).
    use super::HeadlessTauriBridge;
    use crate::AresMedOsWorkstationShell;
    use crate::DesktopShellError;
    use std::sync::Arc;

    /// Native desktop window metadata bound to `tauri.conf.json` (`medos-primary`).
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct NativeWindowSpec {
        pub label: &'static str,
        pub title: &'static str,
        pub width: u32,
        pub height: u32,
        pub air_gapped_csp: bool,
        pub registered_commands: usize,
    }

    pub fn build_native_window_spec(shell: &Arc<AresMedOsWorkstationShell>) -> NativeWindowSpec {
        let bridge = HeadlessTauriBridge::new(Arc::clone(shell));
        NativeWindowSpec {
            label: "medos-primary",
            title: "ARES-MedOS Mission Workstation",
            width: 1440,
            height: 900,
            air_gapped_csp: shell.config.air_gapped_csp_enforced,
            registered_commands: bridge.command_names().len(),
        }
    }

    pub fn verify_native_shell_ready(
        shell: &Arc<AresMedOsWorkstationShell>,
    ) -> Result<NativeWindowSpec, DesktopShellError> {
        let bridge = HeadlessTauriBridge::new(Arc::clone(shell));
        let _ = bridge.get_os_status_bar_state()?;
        let _ = bridge.get_full_wire_snapshot()?;
        Ok(build_native_window_spec(shell))
    }
}
