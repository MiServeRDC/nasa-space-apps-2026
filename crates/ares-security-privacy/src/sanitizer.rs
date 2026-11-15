//! Phase 12 (F1): Strict FastMCP anti-Prompt-Injection and anti-DoS sanitizer.

use ares_core_types::error::AresCoreError;
use ares_core_types::security::McpInputSanitizer;

const MAX_MCP_QUERY_BYTES: usize = 65_536;

/// Strict sanitizer for JSON-RPC queries and telemetry observations.
#[derive(Debug, Default, Clone, Copy)]
pub struct StrictMcpSanitizer;

impl McpInputSanitizer for StrictMcpSanitizer {
    fn sanitize_mcp_query(&self, raw_input: &str) -> Result<String, AresCoreError> {
        if raw_input.len() > MAX_MCP_QUERY_BYTES {
            return Err(AresCoreError::SecurityViolation {
                reason: format!("query MCP eccede il limite di {MAX_MCP_QUERY_BYTES} byte"),
            });
        }
        let lower = raw_input.to_ascii_lowercase();
        if lower.contains("<|im_start|>")
            || lower.contains("ignore previous instructions")
            || lower.contains("disregard safety gates")
        {
            return Err(AresCoreError::SecurityViolation {
                reason: "rilevato tentativo di prompt injection nella query MCP".to_string(),
            });
        }

        let cleaned: String = raw_input
            .chars()
            .filter(|&c| !c.is_control() || c == '\n' || c == '\t')
            .collect();
        Ok(cleaned.trim().to_string())
    }

    fn wrap_untrusted_observation(&self, observation: &str) -> String {
        let escaped = observation.replace('<', "&lt;").replace('>', "&gt;");
        format!("<untrusted_telemetry_observation>{escaped}</untrusted_telemetry_observation>")
    }
}
