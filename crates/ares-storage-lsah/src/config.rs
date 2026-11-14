use crate::error::LsahStorageError;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

/// Forbidden URI schemes that violate air-gapped onboard Mars transit execution.
const FORBIDDEN_SCHEMES: &[&str] = &[
    "s3://",
    "gs://",
    "az://",
    "http://",
    "https://",
    "db://",
    "lance+rest://",
    "ftp://",
    "ws://",
    "wss://",
];

/// Configuration for the 3-tier LSAH persistence engine.
#[derive(Debug, Clone)]
pub struct LsahStorageConfig {
    pub root_dir: PathBuf,
    pub hot_capacity_frames: usize,
    pub warm_batch_size: usize,
    pub warm_flush_interval_ms: u64,
    pub pocus_embedding_dim: usize,
    pub key_epoch_id: u16,
    pub zstd_warm_level: i32,
    pub zstd_cold_level: i32,
}

impl Default for LsahStorageConfig {
    fn default() -> Self {
        Self {
            root_dir: PathBuf::from("./data/ares_storage"),
            hot_capacity_frames: 2_400,
            warm_batch_size: 150,
            warm_flush_interval_ms: 5_000,
            pocus_embedding_dim: 128,
            key_epoch_id: 1,
            zstd_warm_level: 3,
            zstd_cold_level: 6,
        }
    }
}

impl LsahStorageConfig {
    /// Creates a default configuration rooted at `root_dir`.
    pub fn with_root_dir(root_dir: impl Into<PathBuf>) -> Self {
        Self {
            root_dir: root_dir.into(),
            ..Self::default()
        }
    }

    /// Validates all configuration bounds and enforces the air-gapped local path guard.
    pub fn validate(&self) -> Result<PathBuf, LsahStorageError> {
        let validated_dir = validate_airgapped_lsah_dir(&self.root_dir)?;
        if !(1_200..=6_000).contains(&self.hot_capacity_frames) {
            return Err(LsahStorageError::InvalidConfig(format!(
                "hot_capacity_frames {} outside [1200, 6000]",
                self.hot_capacity_frames
            )));
        }
        if self.warm_batch_size == 0 || self.warm_batch_size > 2_000 {
            return Err(LsahStorageError::InvalidConfig(format!(
                "warm_batch_size {} outside [1, 2000]",
                self.warm_batch_size
            )));
        }
        if self.warm_flush_interval_ms == 0 {
            return Err(LsahStorageError::InvalidConfig(
                "warm_flush_interval_ms must be > 0".to_string(),
            ));
        }
        if self.pocus_embedding_dim != 128 && self.pocus_embedding_dim != 256 {
            return Err(LsahStorageError::InvalidConfig(format!(
                "pocus_embedding_dim {} must be 128 or 256",
                self.pocus_embedding_dim
            )));
        }
        Ok(validated_dir)
    }
}

/// Validates that a storage directory path is strictly local and contains no remote URI schemes
/// or parent directory traversal (`..`) components.
pub fn validate_airgapped_lsah_dir(path: &Path) -> Result<PathBuf, LsahStorageError> {
    let raw = path.to_string_lossy();
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(LsahStorageError::ForbiddenStoragePath(
            "<empty>".to_string(),
        ));
    }

    let lower = trimmed.to_ascii_lowercase();
    for scheme in FORBIDDEN_SCHEMES {
        if lower.starts_with(scheme) || lower.contains(scheme) {
            return Err(LsahStorageError::ForbiddenStoragePath(trimmed.to_string()));
        }
    }
    if lower.contains("://") {
        return Err(LsahStorageError::ForbiddenStoragePath(trimmed.to_string()));
    }

    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err(LsahStorageError::ForbiddenStoragePath(trimmed.to_string()));
        }
    }

    Ok(path.to_path_buf())
}

/// Crash-atomic file write discipline: `write(.tmp) -> sync_all -> rename -> parent_dir.sync_all()`.
pub fn atomic_write_bytes(target: &Path, bytes: &[u8]) -> Result<(), LsahStorageError> {
    let parent = target.parent().ok_or_else(|| {
        LsahStorageError::InvalidConfig(format!(
            "target path '{}' has no parent directory",
            target.display()
        ))
    })?;
    fs::create_dir_all(parent)?;

    let file_name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| {
            LsahStorageError::InvalidConfig(format!(
                "target path '{}' has no file name",
                target.display()
            ))
        })?;
    let tmp_path = parent.join(format!("{file_name}.tmp"));

    {
        let mut file = File::create(&tmp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }

    fs::rename(&tmp_path, target)?;

    if let Ok(dir_handle) = File::open(parent) {
        let _ = dir_handle.sync_all();
    }

    Ok(())
}

/// Computes IEEE 802.3 CRC-32 (the canonical algorithm historically used by ARES-Health LSAH storage files).
#[inline]
pub fn compute_storage_crc32_ieee(data: &[u8]) -> u32 {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(data);
    hasher.finalize()
}

/// Computes true Castagnoli CRC-32C (polynomial 0x82F6_3B78 reflected), matching the 128-byte binary IPC protocol.
#[inline]
pub fn compute_storage_crc32c_castagnoli(bytes: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in bytes {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0x82F6_3B78 & mask);
        }
    }
    !crc
}

/// Compatibility alias preserving the legacy storage checksum signature (IEEE 802.3 CRC-32 via `crc32fast`).
#[inline]
pub fn compute_crc32c(data: &[u8]) -> u32 {
    compute_storage_crc32_ieee(data)
}

/// Verifies a segment's checksum against either canonical IEEE 802.3 CRC-32 or Castagnoli CRC-32C.
/// Returns true if either polynomial matches the recorded expected checksum.
#[inline]
pub fn verify_segment_checksum(data: &[u8], expected: u32) -> bool {
    let ieee = compute_storage_crc32_ieee(data);
    if ieee == expected {
        return true;
    }
    let castagnoli = compute_storage_crc32c_castagnoli(data);
    castagnoli == expected
}
