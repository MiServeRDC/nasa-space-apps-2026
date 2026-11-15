use crate::config::{atomic_write_bytes, compute_crc32c};
use crate::error::LsahStorageError;
use crate::pocus_signature::l2_norm;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::fs;
use std::path::Path;

const HNSW_M: usize = 16;
const HNSW_M_MAX0: usize = 32;
const HNSW_EF_CONSTRUCTION: usize = 64;
const HNSW_EF_SEARCH: usize = 32;
const HNSW_BIN_MAGIC: &[u8; 8] = b"ARESHNSW";
const HNSW_BIN_VERSION: u32 = 1;

/// Optional predicate filter for HNSW ANN searches (e.g., Sol 180 vs Sol 1..=7 baseline).
#[derive(Debug, Clone, Default)]
pub struct HnswFilter {
    pub crew_id: Option<String>,
    pub anatomical_target_uberon: Option<String>,
    pub sol_min: Option<u16>,
    pub sol_max: Option<u16>,
}

impl HnswFilter {
    pub fn matches(&self, node: &HnswNode) -> bool {
        if let Some(crew) = &self.crew_id
            && &node.crew_id != crew
        {
            return false;
        }
        if let Some(target) = &self.anatomical_target_uberon
            && &node.anatomical_target_uberon != target
        {
            return false;
        }
        if let Some(min_s) = self.sol_min
            && node.mission_sol < min_s
        {
            return false;
        }
        if let Some(max_s) = self.sol_max
            && node.mission_sol > max_s
        {
            return false;
        }
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HnswNode {
    pub id: u64,
    pub mission_sol: u16,
    pub crew_id: String,
    pub anatomical_target_uberon: String,
    pub level: usize,
    pub vector: Vec<f32>,
    pub neighbors: Vec<Vec<usize>>,
}

#[derive(Clone, Copy, PartialEq)]
struct Candidate {
    sim: f32,
    idx: usize,
}

impl Eq for Candidate {}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> Ordering {
        self.sim
            .total_cmp(&other.sim)
            .then_with(|| other.idx.cmp(&self.idx))
    }
}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Copy, PartialEq)]
struct MinCandidate {
    sim: f32,
    idx: usize,
}

impl Eq for MinCandidate {}

impl Ord for MinCandidate {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .sim
            .total_cmp(&self.sim)
            .then_with(|| self.idx.cmp(&other.idx))
    }
}

impl PartialOrd for MinCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Pure-Rust deterministic HNSW index (Malkov & Yashunin, IEEE TPAMI 2018) with SplitMix64
/// level sampling and atomic CRC-32C `.hnsw.bin` persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HnswVectorIndex {
    dim: usize,
    entry_point: Option<usize>,
    max_level: usize,
    nodes: Vec<HnswNode>,
    id_to_idx: HashMap<u64, usize>,
}

impl HnswVectorIndex {
    /// Creates an empty HNSW index for unit-normalized vectors of dimension `dim` (`128` or `256`).
    pub fn new(dim: usize) -> Result<Self, LsahStorageError> {
        if dim != 128 && dim != 256 {
            return Err(LsahStorageError::EmbeddingDimensionMismatch {
                expected: 128,
                actual: dim,
            });
        }
        Ok(Self {
            dim,
            entry_point: None,
            max_level: 0,
            nodes: Vec::new(),
            id_to_idx: HashMap::new(),
        })
    }

    pub fn dim(&self) -> usize {
        self.dim
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    /// Deterministic SplitMix64 level assignment (100% bit-reproducible across platforms/runs).
    #[inline]
    fn deterministic_level(signature_id: u64) -> usize {
        let mut x = signature_id ^ 0x9E37_79B9_7F4A_7C15;
        x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        x ^= x >> 31;
        let u = ((x >> 11) as f64) / ((1_u64 << 53) as f64);
        let u_clamped = u.clamp(1e-12, 1.0 - 1e-12);
        let m_l = 1.0 / (HNSW_M as f64).ln();
        ((-u_clamped.ln()) * m_l).floor().min(12.0) as usize
    }

    #[inline]
    fn cosine_sim(a: &[f32], b: &[f32]) -> f32 {
        a.iter().zip(b.iter()).map(|(&x, &y)| x * y).sum()
    }

    fn normalize_and_validate(&self, vec: &[f32]) -> Result<Vec<f32>, LsahStorageError> {
        if vec.len() != self.dim {
            return Err(LsahStorageError::EmbeddingDimensionMismatch {
                expected: self.dim,
                actual: vec.len(),
            });
        }
        for (i, &v) in vec.iter().enumerate() {
            if !v.is_finite() {
                return Err(LsahStorageError::NonFiniteEmbeddingValue { index: i });
            }
        }
        let norm = l2_norm(vec).max(1e-12);
        Ok(vec.iter().map(|&v| v / norm).collect())
    }

    /// Inserts or updates a signature vector in the deterministic HNSW graph.
    pub fn insert(
        &mut self,
        id: u64,
        mission_sol: u16,
        crew_id: impl Into<String>,
        anatomical_target_uberon: impl Into<String>,
        vector: Vec<f32>,
    ) -> Result<(), LsahStorageError> {
        let normalized = self.normalize_and_validate(&vector)?;
        let crew_id = crew_id.into();
        let target = anatomical_target_uberon.into();

        if let Some(&existing_idx) = self.id_to_idx.get(&id) {
            self.nodes[existing_idx].mission_sol = mission_sol;
            self.nodes[existing_idx].crew_id = crew_id;
            self.nodes[existing_idx].anatomical_target_uberon = target;
            self.nodes[existing_idx].vector = normalized;
            return Ok(());
        }

        let level = Self::deterministic_level(id);
        let new_idx = self.nodes.len();
        self.nodes.push(HnswNode {
            id,
            mission_sol,
            crew_id,
            anatomical_target_uberon: target,
            level,
            vector: normalized,
            neighbors: vec![Vec::new(); level + 1],
        });
        self.id_to_idx.insert(id, new_idx);

        let Some(mut curr_ep) = self.entry_point else {
            self.entry_point = Some(new_idx);
            self.max_level = level;
            return Ok(());
        };

        let curr_max = self.max_level;
        // Phase 1: Greedy descent from top level down to `level + 1`.
        for lc in (level + 1..=curr_max).rev() {
            curr_ep = self.greedy_search_layer(&self.nodes[new_idx].vector, curr_ep, lc);
        }

        // Phase 2: Beam search + bidirectional link insertion for layers `min(level, curr_max)..=0`.
        let top_connect = level.min(curr_max);
        for lc in (0..=top_connect).rev() {
            let candidates =
                self.search_layer(&self.nodes[new_idx].vector, curr_ep, HNSW_EF_CONSTRUCTION, lc);
            let m_max = if lc == 0 { HNSW_M_MAX0 } else { HNSW_M };
            let selected: Vec<usize> = candidates.iter().take(m_max).map(|c| c.idx).collect();

            if let Some(first) = candidates.first() {
                curr_ep = first.idx;
            }

            self.nodes[new_idx].neighbors[lc] = selected.clone();
            for &nb_idx in &selected {
                if lc < self.nodes[nb_idx].neighbors.len() {
                    if !self.nodes[nb_idx].neighbors[lc].contains(&new_idx) {
                        self.nodes[nb_idx].neighbors[lc].push(new_idx);
                    }
                    if self.nodes[nb_idx].neighbors[lc].len() > m_max {
                        let nb_vec = self.nodes[nb_idx].vector.clone();
                        let mut scored: Vec<(usize, f32)> = self.nodes[nb_idx].neighbors[lc]
                            .iter()
                            .map(|&other| (other, Self::cosine_sim(&nb_vec, &self.nodes[other].vector)))
                            .collect();
                        scored.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
                        scored.truncate(m_max);
                        self.nodes[nb_idx].neighbors[lc] =
                            scored.into_iter().map(|(i, _)| i).collect();
                    }
                }
            }
        }

        if level > self.max_level {
            self.entry_point = Some(new_idx);
            self.max_level = level;
        }

        Ok(())
    }

    fn greedy_search_layer(&self, query: &[f32], mut ep: usize, level: usize) -> usize {
        let mut best_sim = Self::cosine_sim(query, &self.nodes[ep].vector);
        loop {
            let mut improved = false;
            if level < self.nodes[ep].neighbors.len() {
                for &nb in &self.nodes[ep].neighbors[level] {
                    let sim = Self::cosine_sim(query, &self.nodes[nb].vector);
                    if sim > best_sim {
                        best_sim = sim;
                        ep = nb;
                        improved = true;
                    }
                }
            }
            if !improved {
                break;
            }
        }
        ep
    }

    fn search_layer(&self, query: &[f32], ep: usize, ef: usize, level: usize) -> Vec<Candidate> {
        let ep_sim = Self::cosine_sim(query, &self.nodes[ep].vector);
        let mut visited = HashSet::with_capacity(ef * 2);
        visited.insert(ep);

        let mut candidates = BinaryHeap::new();
        candidates.push(Candidate {
            sim: ep_sim,
            idx: ep,
        });

        let mut results = BinaryHeap::new();
        results.push(MinCandidate {
            sim: ep_sim,
            idx: ep,
        });

        while let Some(curr) = candidates.pop() {
            let worst_res_sim = results.peek().map(|r| r.sim).unwrap_or(f32::NEG_INFINITY);
            if curr.sim < worst_res_sim && results.len() >= ef {
                break;
            }

            if level < self.nodes[curr.idx].neighbors.len() {
                for &nb in &self.nodes[curr.idx].neighbors[level] {
                    if !visited.insert(nb) {
                        continue;
                    }
                    let sim = Self::cosine_sim(query, &self.nodes[nb].vector);
                    let current_worst = results.peek().map(|r| r.sim).unwrap_or(f32::NEG_INFINITY);
                    if results.len() < ef || sim > current_worst {
                        candidates.push(Candidate { sim, idx: nb });
                        results.push(MinCandidate { sim, idx: nb });
                        if results.len() > ef {
                            results.pop();
                        }
                    }
                }
            }
        }

        let mut sorted: Vec<Candidate> = results
            .into_iter()
            .map(|m| Candidate {
                sim: m.sim,
                idx: m.idx,
            })
            .collect();
        sorted.sort_by(|a, b| b.sim.total_cmp(&a.sim).then_with(|| a.idx.cmp(&b.idx)));
        sorted
    }

    /// Executes O(log N) ANN Cosine similarity search returning `(signature_id, cosine_similarity)`.
    pub fn search(
        &self,
        query_vec: &[f32],
        top_k: usize,
        filter: Option<&HnswFilter>,
    ) -> Result<Vec<(u64, f32)>, LsahStorageError> {
        let q = self.normalize_and_validate(query_vec)?;
        if top_k == 0 || self.nodes.is_empty() {
            return Ok(Vec::new());
        }
        let Some(mut ep) = self.entry_point else {
            return Ok(Vec::new());
        };

        for lc in (1..=self.max_level).rev() {
            ep = self.greedy_search_layer(&q, ep, lc);
        }

        let ef = if filter.is_some() {
            (HNSW_EF_SEARCH * 4).max(top_k * 8).min(self.nodes.len())
        } else {
            HNSW_EF_SEARCH.max(top_k)
        };
        let layer0 = self.search_layer(&q, ep, ef, 0);

        let mut hits: Vec<(u64, f32)> = layer0
            .into_iter()
            .filter_map(|c| {
                let node = &self.nodes[c.idx];
                if filter.is_none_or(|f| f.matches(node)) {
                    Some((node.id, c.sim.clamp(-1.0, 1.0)))
                } else {
                    None
                }
            })
            .collect();

        // If a tight predicate filter (e.g., Sol 1..=7 baseline on 500 scans) yielded fewer than
        // `top_k` hits in the local graph neighborhood, scan filtered nodes deterministically.
        if let Some(f) = filter
            && hits.len() < top_k
        {
            let seen: HashSet<u64> = hits.iter().map(|&(id, _)| id).collect();
            for node in &self.nodes {
                if !seen.contains(&node.id) && f.matches(node) {
                    let sim = Self::cosine_sim(&q, &node.vector).clamp(-1.0, 1.0);
                    hits.push((node.id, sim));
                }
            }
        }

        hits.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        hits.truncate(top_k);
        Ok(hits)
    }

    /// Retrieves node metadata + vector by `signature_id`.
    pub fn get_node(&self, id: u64) -> Option<&HnswNode> {
        self.id_to_idx.get(&id).and_then(|&idx| self.nodes.get(idx))
    }

    /// Atomically persists the HNSW graph + vectors with a CRC-32C trailer.
    pub fn save_atomic(&self, path: &Path) -> Result<(), LsahStorageError> {
        let json_bytes = serde_json::to_vec(self)?;
        let mut payload = Vec::with_capacity(8 + 4 + json_bytes.len() + 4);
        payload.extend_from_slice(HNSW_BIN_MAGIC);
        payload.extend_from_slice(&HNSW_BIN_VERSION.to_le_bytes());
        payload.extend_from_slice(&json_bytes);
        let crc = compute_crc32c(&payload);
        payload.extend_from_slice(&crc.to_le_bytes());
        atomic_write_bytes(path, &payload)
    }

    /// Loads and CRC-32C-verifies an `.hnsw.bin` index snapshot from disk.
    pub fn load_verified(path: &Path) -> Result<Self, LsahStorageError> {
        let bytes = fs::read(path)?;
        if bytes.len() < 16 {
            return Err(LsahStorageError::CrcMismatch {
                artifact: path.display().to_string(),
                expected: 0,
                computed: 0,
            });
        }
        let split = bytes.len() - 4;
        let expected_crc = u32::from_le_bytes([
            bytes[split],
            bytes[split + 1],
            bytes[split + 2],
            bytes[split + 3],
        ]);
        let computed_crc = compute_crc32c(&bytes[..split]);
        if expected_crc != computed_crc {
            return Err(LsahStorageError::CrcMismatch {
                artifact: path.display().to_string(),
                expected: expected_crc,
                computed: computed_crc,
            });
        }
        if &bytes[..8] != HNSW_BIN_MAGIC {
            return Err(LsahStorageError::InvalidColdHeader(
                "invalid HNSW magic header".to_string(),
            ));
        }
        let version = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        if version != HNSW_BIN_VERSION {
            return Err(LsahStorageError::InvalidColdHeader(format!(
                "unsupported HNSW version {version}"
            )));
        }
        let index: Self = serde_json::from_slice(&bytes[12..split])?;
        Ok(index)
    }
}
