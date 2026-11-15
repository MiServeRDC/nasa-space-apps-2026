use crate::config::{
    atomic_write_bytes, compute_crc32c, validate_airgapped_lsah_dir,
    verify_crc32c_with_v1_ieee_fallback,
};
use crate::error::LsahStorageError;
use ares_core_types::security::{AuditChainRecord, CrewRole, MedOpsAuditLogger};
use ares_security_privacy::{EphemeralDsnKey, Sha256AuditLogger};
use arrow_array::RecordBatch;
use arrow_ipc::reader::FileReader;
use arrow_ipc::writer::FileWriter;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub const COLD_HEADER_BYTES: usize = 144;
pub const COLD_MAGIC: &[u8; 8] = b"ARESLSAH";
pub const COLD_FORMAT_VERSION_LEGACY_V1: u8 = 1;
pub const COLD_FORMAT_VERSION_V2: u8 = 2;
pub const COLD_FORMAT_VERSION: u16 = COLD_FORMAT_VERSION_V2 as u16;
pub const COLD_CODEC_ARROW_IPC_ZSTD_L6: u16 = 1;

/// Exact 144-byte Cold chunk header authenticated as ChaCha20-Poly1305 AAD.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColdChunkHeader {
    pub magic: [u8; 8],
    pub format_version: u16,
    pub compression_codec: u16,
    pub key_epoch_id: u16,
    pub mission_sol: u16,
    pub chunk_seq: u64,
    pub nonce_96: [u8; 12],
    pub audit_seq: u64,
    pub audit_chain_hash_ascii: [u8; 64],
    pub uncompressed_arrow_bytes: u64,
    pub ciphertext_plus_tag_bytes: u64,
    pub row_count: u64,
    pub created_unix_ms: i64,
    pub header_crc32c: u32,
}

impl ColdChunkHeader {
    /// Deterministic RFC 8439 / DATE 2017 96-bit nonce:
    /// `key_epoch_id (u16 LE) || mission_sol (u16 LE) || chunk_seq (u64 LE)`.
    #[inline]
    pub fn build_deterministic_nonce(key_epoch_id: u16, mission_sol: u16, chunk_seq: u64) -> [u8; 12] {
        let mut nonce = [0u8; 12];
        nonce[0..2].copy_from_slice(&key_epoch_id.to_le_bytes());
        nonce[2..4].copy_from_slice(&mission_sol.to_le_bytes());
        nonce[4..12].copy_from_slice(&chunk_seq.to_le_bytes());
        nonce
    }

    pub fn audit_chain_hash_hex(&self) -> Result<&str, LsahStorageError> {
        std::str::from_utf8(&self.audit_chain_hash_ascii)
            .map_err(|_| LsahStorageError::InvalidColdHeader("non-UTF8 audit hash".to_string()))
    }

    /// Serializes the 144-byte header and writes `header_crc32c` over bytes `[0..140]`.
    pub fn to_bytes(&mut self) -> [u8; COLD_HEADER_BYTES] {
        let mut out = [0u8; COLD_HEADER_BYTES];
        out[0..8].copy_from_slice(&self.magic);
        out[8..10].copy_from_slice(&self.format_version.to_le_bytes());
        out[10..12].copy_from_slice(&self.compression_codec.to_le_bytes());
        out[12..14].copy_from_slice(&self.key_epoch_id.to_le_bytes());
        out[14..16].copy_from_slice(&self.mission_sol.to_le_bytes());
        out[16..24].copy_from_slice(&self.chunk_seq.to_le_bytes());
        out[24..36].copy_from_slice(&self.nonce_96);
        out[36..44].copy_from_slice(&self.audit_seq.to_le_bytes());
        out[44..108].copy_from_slice(&self.audit_chain_hash_ascii);
        out[108..116].copy_from_slice(&self.uncompressed_arrow_bytes.to_le_bytes());
        out[116..124].copy_from_slice(&self.ciphertext_plus_tag_bytes.to_le_bytes());
        out[124..132].copy_from_slice(&self.row_count.to_le_bytes());
        out[132..140].copy_from_slice(&self.created_unix_ms.to_le_bytes());
        let crc = compute_crc32c(&out[0..140]);
        self.header_crc32c = crc;
        out[140..144].copy_from_slice(&crc.to_le_bytes());
        out
    }

    /// Parses and validates a 144-byte Cold chunk header (magic, version, CRC-32C, and nonce binding).
    pub fn from_bytes(raw: &[u8]) -> Result<Self, LsahStorageError> {
        if raw.len() < COLD_HEADER_BYTES {
            return Err(LsahStorageError::InvalidColdHeader(format!(
                "expected at least {COLD_HEADER_BYTES} bytes, got {}",
                raw.len()
            )));
        }

        let mut magic = [0u8; 8];
        magic.copy_from_slice(&raw[0..8]);
        if &magic != COLD_MAGIC {
            return Err(LsahStorageError::InvalidColdHeader(
                "invalid Cold chunk magic".to_string(),
            ));
        }

        let format_version = u16::from_le_bytes([raw[8], raw[9]]);
        let allow_legacy_ieee = match format_version {
            v if v == u16::from(COLD_FORMAT_VERSION_V2) => false,
            v if v == u16::from(COLD_FORMAT_VERSION_LEGACY_V1) => true,
            _ => {
                return Err(LsahStorageError::InvalidColdHeader(format!(
                    "unsupported Cold format_version {format_version}"
                )));
            }
        };

        let expected_crc = u32::from_le_bytes([raw[140], raw[141], raw[142], raw[143]]);
        if let Err(err) = verify_crc32c_with_v1_ieee_fallback(&raw[0..140], expected_crc, allow_legacy_ieee) {
            return Err(match err {
                LsahStorageError::CrcMismatch { expected, computed, .. } => {
                    LsahStorageError::CrcMismatch {
                        artifact: "ColdChunkHeader".to_string(),
                        expected,
                        computed,
                    }
                }
                other => other,
            });
        }

        let compression_codec = u16::from_le_bytes([raw[10], raw[11]]);
        let key_epoch_id = u16::from_le_bytes([raw[12], raw[13]]);
        let mission_sol = u16::from_le_bytes([raw[14], raw[15]]);
        let chunk_seq = u64::from_le_bytes([
            raw[16], raw[17], raw[18], raw[19], raw[20], raw[21], raw[22], raw[23],
        ]);
        let mut nonce_96 = [0u8; 12];
        nonce_96.copy_from_slice(&raw[24..36]);

        let expected_nonce = Self::build_deterministic_nonce(key_epoch_id, mission_sol, chunk_seq);
        if nonce_96 != expected_nonce {
            return Err(LsahStorageError::ColdAeadAuthenticationFailed);
        }

        let audit_seq = u64::from_le_bytes([
            raw[36], raw[37], raw[38], raw[39], raw[40], raw[41], raw[42], raw[43],
        ]);
        let mut audit_chain_hash_ascii = [0u8; 64];
        audit_chain_hash_ascii.copy_from_slice(&raw[44..108]);

        let uncompressed_arrow_bytes = u64::from_le_bytes([
            raw[108], raw[109], raw[110], raw[111], raw[112], raw[113], raw[114], raw[115],
        ]);
        let ciphertext_plus_tag_bytes = u64::from_le_bytes([
            raw[116], raw[117], raw[118], raw[119], raw[120], raw[121], raw[122], raw[123],
        ]);
        let row_count = u64::from_le_bytes([
            raw[124], raw[125], raw[126], raw[127], raw[128], raw[129], raw[130], raw[131],
        ]);
        let created_unix_ms = i64::from_le_bytes([
            raw[132], raw[133], raw[134], raw[135], raw[136], raw[137], raw[138], raw[139],
        ]);

        Ok(Self {
            magic,
            format_version,
            compression_codec,
            key_epoch_id,
            mission_sol,
            chunk_seq,
            nonce_96,
            audit_seq,
            audit_chain_hash_ascii,
            uncompressed_arrow_bytes,
            ciphertext_plus_tag_bytes,
            row_count,
            created_unix_ms,
            header_crc32c: expected_crc,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ColdWatermarkPayload {
    key_epoch_id: u16,
    highest_sealed_chunk_seq: u64,
}

fn default_cold_watermark_v1() -> u8 {
    COLD_FORMAT_VERSION_LEGACY_V1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SignedColdWatermark {
    #[serde(default = "default_cold_watermark_v1")]
    version: u8,
    payload: ColdWatermarkPayload,
    crc32c: u32,
}

/// Output summary produced when sealing a Sol into a Cold AEAD archive chunk.
#[derive(Debug, Clone)]
pub struct ColdSealResult {
    pub chunk_path: PathBuf,
    pub chunk_filename: String,
    pub header: ColdChunkHeader,
    pub total_file_bytes: u64,
}

/// Decrypted and verified Cold archive chunk.
#[derive(Debug, Clone)]
pub struct OpenedColdChunk {
    pub header: ColdChunkHeader,
    pub batches: Vec<RecordBatch>,
}

/// Tamper-evident Cold AEAD archiver using ChaCha20-Poly1305, monotonic persisted 96-bit
/// nonces, and bidirectional `Sha256AuditLogger` AAD binding.
pub struct ColdTierArchiver {
    cold_dir: PathBuf,
    watermark_path: PathBuf,
    key_epoch_id: u16,
    zstd_level: i32,
    highest_sealed_chunk_seq: u64,
}

impl ColdTierArchiver {
    /// Opens or initializes `ColdTierArchiver`, loading and verifying `cold_watermark.json`.
    pub fn open(
        root_dir: &Path,
        key_epoch_id: u16,
        zstd_level: i32,
    ) -> Result<Self, LsahStorageError> {
        let root = validate_airgapped_lsah_dir(root_dir)?;
        let cold_dir = root.join("cold");
        fs::create_dir_all(&cold_dir)?;
        let watermark_path = cold_dir.join("cold_watermark.json");

        let highest_sealed_chunk_seq = if watermark_path.exists() {
            let raw = fs::read(&watermark_path)?;
            let signed: SignedColdWatermark = serde_json::from_slice(&raw)?;
            let allow_legacy_ieee = match signed.version {
                COLD_FORMAT_VERSION_V2 => false,
                COLD_FORMAT_VERSION_LEGACY_V1 => true,
                other => {
                    return Err(LsahStorageError::InvalidColdHeader(format!(
                        "unsupported cold_watermark version {other}"
                    )));
                }
            };
            let payload_bytes = serde_json::to_vec(&signed.payload)?;
            if let Err(err) =
                verify_crc32c_with_v1_ieee_fallback(&payload_bytes, signed.crc32c, allow_legacy_ieee)
            {
                return Err(match err {
                    LsahStorageError::CrcMismatch { expected, computed, .. } => {
                        LsahStorageError::CrcMismatch {
                            artifact: watermark_path.display().to_string(),
                            expected,
                            computed,
                        }
                    }
                    other => other,
                });
            }
            if signed.payload.key_epoch_id == key_epoch_id {
                signed.payload.highest_sealed_chunk_seq
            } else {
                0
            }
        } else {
            0
        };

        Ok(Self {
            cold_dir,
            watermark_path,
            key_epoch_id,
            zstd_level,
            highest_sealed_chunk_seq,
        })
    }

    pub fn highest_sealed_chunk_seq(&self) -> u64 {
        self.highest_sealed_chunk_seq
    }

    pub fn next_chunk_seq(&self) -> u64 {
        self.highest_sealed_chunk_seq + 1
    }

    pub fn cold_dir(&self) -> &Path {
        &self.cold_dir
    }

    pub fn key_epoch_id(&self) -> u16 {
        self.key_epoch_id
    }

    fn persist_watermark(&mut self, new_seq: u64) -> Result<(), LsahStorageError> {
        let payload = ColdWatermarkPayload {
            key_epoch_id: self.key_epoch_id,
            highest_sealed_chunk_seq: new_seq,
        };
        let payload_bytes = serde_json::to_vec(&payload)?;
        let crc32c = compute_crc32c(&payload_bytes);
        let signed = SignedColdWatermark {
            version: COLD_FORMAT_VERSION_V2,
            payload,
            crc32c,
        };
        let encoded = serde_json::to_vec_pretty(&signed)?;
        atomic_write_bytes(&self.watermark_path, &encoded)?;
        self.highest_sealed_chunk_seq = new_seq;
        Ok(())
    }

    /// Seals one or more `RecordBatch`es for `mission_sol` into an encrypted `.lsah.cold.aead` chunk.
    /// Persists the monotonic nonce watermark BEFORE encrypting, and binds the `Sha256AuditLogger`
    /// entry inside the 144-byte `ColdChunkHeader` AAD.
    pub fn seal_sol_to_cold_archive(
        &mut self,
        mission_sol: u16,
        batches: &[RecordBatch],
        key: &EphemeralDsnKey,
        audit_logger: &Sha256AuditLogger,
        forced_chunk_seq: Option<u64>,
        created_unix_ms: i64,
    ) -> Result<ColdSealResult, LsahStorageError> {
        if batches.is_empty() {
            return Err(LsahStorageError::InvalidConfig(
                "cannot seal empty batch slice to Cold archive".to_string(),
            ));
        }

        let chunk_seq = forced_chunk_seq.unwrap_or_else(|| self.next_chunk_seq());
        if chunk_seq <= self.highest_sealed_chunk_seq {
            return Err(LsahStorageError::NonceReuseDetected {
                epoch: self.key_epoch_id,
                attempted: chunk_seq,
                watermark: self.highest_sealed_chunk_seq,
            });
        }

        // Persist updated watermark BEFORE encryption so crash-restart can never reuse a nonce.
        self.persist_watermark(chunk_seq)?;

        // Serialize batches to Arrow IPC File v2 + Zstd(level).
        let mut arrow_buf = Vec::new();
        let schema = batches[0].schema();
        {
            let mut writer = FileWriter::try_new(&mut arrow_buf, &schema)?;
            for b in batches {
                writer.write(b)?;
            }
            writer.finish()?;
        }
        let uncompressed_arrow_bytes = arrow_buf.len() as u64;
        let row_count: u64 = batches.iter().map(|b| b.num_rows() as u64).sum();

        let compressed_arrow = zstd::encode_all(Cursor::new(&arrow_buf), self.zstd_level)?;
        let plaintext_sha256 = {
            let mut hasher = Sha256::new();
            hasher.update(&arrow_buf);
            format!("{:x}", hasher.finalize())
        };

        let action = format!(
            "LSAH_COLD_SEAL|sol={mission_sol};chunk={chunk_seq};rows={row_count};plain_sha256={plaintext_sha256}"
        );
        let audit_rec = audit_logger.append_audit_event(CrewRole::CrewMedicalOfficer, &action)?;

        let hash_bytes = audit_rec.current_hash_hex.as_bytes();
        if hash_bytes.len() != 64 {
            return Err(LsahStorageError::AuditTamperDetected(
                "audit record hash length != 64".to_string(),
            ));
        }
        let mut audit_chain_hash_ascii = [0u8; 64];
        audit_chain_hash_ascii.copy_from_slice(hash_bytes);

        let nonce_96 =
            ColdChunkHeader::build_deterministic_nonce(self.key_epoch_id, mission_sol, chunk_seq);
        let ciphertext_len = (compressed_arrow.len() + 16) as u64;

        let mut header = ColdChunkHeader {
            magic: *COLD_MAGIC,
            format_version: COLD_FORMAT_VERSION,
            compression_codec: COLD_CODEC_ARROW_IPC_ZSTD_L6,
            key_epoch_id: self.key_epoch_id,
            mission_sol,
            chunk_seq,
            nonce_96,
            audit_seq: audit_rec.sequence_index,
            audit_chain_hash_ascii,
            uncompressed_arrow_bytes,
            ciphertext_plus_tag_bytes: ciphertext_len,
            row_count,
            created_unix_ms,
            header_crc32c: 0,
        };
        let header_bytes = header.to_bytes();

        let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));
        let nonce = Nonce::from_slice(&nonce_96);
        let ciphertext = cipher
            .encrypt(
                nonce,
                Payload {
                    msg: &compressed_arrow,
                    aad: &header_bytes,
                },
            )
            .map_err(|_| LsahStorageError::ColdAeadAuthenticationFailed)?;

        let chunk_filename = format!("sol_{mission_sol:04}_chunk_{chunk_seq:012}.lsah.cold.aead");
        let chunk_path = self.cold_dir.join(&chunk_filename);

        let mut file_bytes = Vec::with_capacity(COLD_HEADER_BYTES + ciphertext.len());
        file_bytes.extend_from_slice(&header_bytes);
        file_bytes.extend_from_slice(&ciphertext);
        atomic_write_bytes(&chunk_path, &file_bytes)?;

        Ok(ColdSealResult {
            chunk_path,
            chunk_filename,
            header,
            total_file_bytes: file_bytes.len() as u64,
        })
    }

    /// Opens and cryptographically verifies a Cold archive chunk against `key` and `audit_logger`.
    pub fn open_cold_archive_chunk_verified(
        chunk_path: &Path,
        key: &EphemeralDsnKey,
        audit_logger: &Sha256AuditLogger,
    ) -> Result<OpenedColdChunk, LsahStorageError> {
        let records = audit_logger.records()?;
        Self::open_cold_archive_chunk_verified_with_records(chunk_path, key, &records)
    }

    /// Opens and cryptographically verifies a Cold archive chunk against `key` and an explicit
    /// `AuditChainRecord` slice (supporting bidirectional tamper verification).
    pub fn open_cold_archive_chunk_verified_with_records(
        chunk_path: &Path,
        key: &EphemeralDsnKey,
        audit_records: &[AuditChainRecord],
    ) -> Result<OpenedColdChunk, LsahStorageError> {
        if !Sha256AuditLogger::verify_external_slice(audit_records) {
            return Err(LsahStorageError::AuditTamperDetected(
                "SHA-256 audit chain integrity check failed".to_string(),
            ));
        }

        let raw = fs::read(chunk_path)?;
        if raw.len() < COLD_HEADER_BYTES + 16 {
            return Err(LsahStorageError::InvalidColdHeader(
                "Cold chunk truncated".to_string(),
            ));
        }

        let header_slice = &raw[..COLD_HEADER_BYTES];
        let header = ColdChunkHeader::from_bytes(header_slice)?;
        let ciphertext = &raw[COLD_HEADER_BYTES..];

        // Verify bidirectional linkage to Sha256AuditLogger record at `header.audit_seq`.
        let matching_rec = audit_records
            .iter()
            .find(|r| r.sequence_index == header.audit_seq)
            .ok_or_else(|| {
                LsahStorageError::AuditTamperDetected(format!(
                    "missing audit_seq {} in Sha256AuditLogger",
                    header.audit_seq
                ))
            })?;

        if matching_rec.current_hash_hex != header.audit_chain_hash_hex()? {
            return Err(LsahStorageError::AuditTamperDetected(format!(
                "audit_seq {} hash mismatch vs ColdChunkHeader AAD",
                header.audit_seq
            )));
        }

        let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));
        let nonce = Nonce::from_slice(&header.nonce_96);
        let compressed_arrow = cipher
            .decrypt(
                nonce,
                Payload {
                    msg: ciphertext,
                    aad: header_slice,
                },
            )
            .map_err(|_| LsahStorageError::ColdAeadAuthenticationFailed)?;

        let arrow_bytes = zstd::decode_all(Cursor::new(&compressed_arrow))?;
        let reader = FileReader::try_new(Cursor::new(&arrow_bytes), None)?;
        let mut batches = Vec::new();
        for item in reader {
            batches.push(item?);
        }

        Ok(OpenedColdChunk { header, batches })
    }

    /// Lists sealed Cold chunk files currently present in `cold_dir`.
    pub fn list_cold_chunks(&self) -> Result<Vec<PathBuf>, LsahStorageError> {
        let mut out = Vec::new();
        if self.cold_dir.exists() {
            for entry in fs::read_dir(&self.cold_dir)? {
                let path = entry?.path();
                if path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.ends_with(".lsah.cold.aead"))
                {
                    out.push(path);
                }
            }
        }
        out.sort();
        Ok(out)
    }
}
