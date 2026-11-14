//! Fase 18 (Blocco I1): `ARES-HyperGraph` Layers 1 and 2.
//!
//! 1. **Layer 1 - Welford Longitudinal Compaction.** `WelfordAccumulator` keeps
//!    `(count, mean, m2, min, max)` in O(1) per sample (Welford 1962,
//!    DOI 10.1080/00401706.1962.10490022). `LongitudinalSuperNode` compacts one
//!    Martian Sol (88,775.244 s) of physiological ticks, and
//!    `MissionLongitudinalCompactor` stores a 900-Sol mission plus the 96 warm
//!    buckets of the current Sol in less than 200 KB.
//! 2. **Layer 2a - 3D Anatomical Region Subgraph.** Five `UBERON:` grounded body
//!    regions with normalized centroids in `[-1, +1]^3` and hemodynamic /
//!    neuro-mechanical conduction arcs drive the 3D Body Heatmap of `ares-cockpit/`.
//! 3. **Layer 2b - Spacecraft Habitat Deontic and Markov Subgraph.** Six habitat
//!    zones governed by `HabitatZoneDeonticPolicy` (Q-STL robustness per zone) and a
//!    Dirichlet-Multinomial `ZoneTransitionMarkovModel` (alpha = 0.10) with
//!    Kullback-Leibler behavioral anomaly detection.
//!
//! Ontology note: the internal jugular vein is `UBERON:0001586`. The identifier
//! `UBERON:0001585` (quoted in some planning documents) denotes the anterior vena
//! cava and is therefore NOT used here.

use crate::error::CausalGraphError;
use ares_core_types::constants::{
    GAI_MAX_SAFE_PCT, RMSSD_CRITICAL_MS, RMSSD_NOMINAL_MS, SANS_CRITICAL_INDEX, SANS_NOMINAL_INDEX,
    SOST_CRITICAL_PMOL_L, SOST_NOMINAL_PMOL_L, TAU_W_CRITICAL_DYN_CM2, TAU_W_NOMINAL_DYN_CM2,
};
use petgraph::stable_graph::{NodeIndex, StableDiGraph};
use petgraph::visit::{EdgeRef, IntoEdgeReferences};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

// ---------------------------------------------------------------------------
// Layer 1: Welford longitudinal compaction
// ---------------------------------------------------------------------------

/// Duration of one Martian solar day (Sol) in SI seconds.
pub const MARS_SOL_SECONDS: f64 = 88_775.244;
/// Nominal Mars conjunction-class mission length used for memory budgeting.
pub const MARS_MISSION_SOLS: u32 = 900;
/// Hard upper bound on the preallocated mission capacity.
pub const MAX_MISSION_CAPACITY_SOLS: u32 = 1_100;
/// Number of warm buckets per Sol (Sol / 96 = 924.74 s, the Martian analogue of 15 min).
pub const WARM_BUCKETS_PER_SOL: usize = 96;
/// Memory budget for one astronaut's longitudinal compaction (900 Sols + 96 warm buckets).
pub const LONGITUDINAL_MEMORY_BUDGET_BYTES: usize = 200_000;

/// Online single-pass Welford accumulator (O(1), zero heap allocation).
///
/// `mean` and `m2` are kept in `f64` for numerical exactness; `min` / `max` are
/// stored in `f32` so that a five-channel super-node fits in 168 bytes.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WelfordAccumulator {
    pub count: u64,
    pub mean: f64,
    pub m2: f64,
    pub min: f32,
    pub max: f32,
}

impl Default for WelfordAccumulator {
    fn default() -> Self {
        Self::new()
    }
}

impl WelfordAccumulator {
    #[inline]
    pub const fn new() -> Self {
        Self {
            count: 0,
            mean: 0.0,
            m2: 0.0,
            min: f32::INFINITY,
            max: f32::NEG_INFINITY,
        }
    }

    /// Updates `count`, `mean`, `m2`, `min`, `max` in O(1). Non-finite samples are
    /// rejected (they represent missing channels and must never be imputed).
    #[inline]
    pub fn update(&mut self, value: f64) -> bool {
        if !value.is_finite() {
            return false;
        }
        self.count += 1;
        let n = self.count as f64;
        let delta = value - self.mean;
        self.mean += delta / n;
        let delta2 = value - self.mean;
        self.m2 += delta * delta2;
        let v32 = value as f32;
        if v32 < self.min {
            self.min = v32;
        }
        if v32 > self.max {
            self.max = v32;
        }
        true
    }

    /// Chan-Golub-LeVeque parallel merge of two accumulators (used for roll-ups).
    #[inline]
    pub fn merge(&mut self, other: &Self) {
        if other.count == 0 {
            return;
        }
        if self.count == 0 {
            *self = *other;
            return;
        }
        let n_a = self.count as f64;
        let n_b = other.count as f64;
        let n = n_a + n_b;
        let delta = other.mean - self.mean;
        self.mean += delta * n_b / n;
        self.m2 += other.m2 + delta * delta * n_a * n_b / n;
        self.count += other.count;
        self.min = self.min.min(other.min);
        self.max = self.max.max(other.max);
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    /// Unbiased sample variance `m2 / (n - 1)` (0 for `n < 2`).
    #[inline]
    pub fn sample_variance(&self) -> f64 {
        if self.count < 2 {
            0.0
        } else {
            (self.m2 / ((self.count - 1) as f64)).max(0.0)
        }
    }

    #[inline]
    pub fn sample_std_dev(&self) -> f64 {
        self.sample_variance().sqrt()
    }

    /// Minimum as `Option` (`None` when no finite sample was observed).
    #[inline]
    pub fn min_value(&self) -> Option<f64> {
        (self.count > 0).then_some(self.min as f64)
    }

    /// Maximum as `Option` (`None` when no finite sample was observed).
    #[inline]
    pub fn max_value(&self) -> Option<f64> {
        (self.count > 0).then_some(self.max as f64)
    }
}

/// One physiological tick routed into the longitudinal compactor.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PhysiologicalTick {
    /// Internal jugular vein wall shear stress `tau_w` [dyn/cm^2].
    pub tau_w_dyn_cm2: f64,
    /// Serum sclerostin [pmol/L].
    pub sost_pmol_l: f64,
    /// Ultrasound Muscle Quality Index (dimensionless).
    pub mqi: f64,
    /// SANS translaminar index (dimensionless, 0..1).
    pub sans_index: f64,
    /// Global NQS-STL robustness `rho` in `[-1, +1]`.
    pub rho_global: Option<f64>,
}

/// Compact super-node (168 bytes) for one Sol or one warm bucket.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LongitudinalSuperNode {
    pub sol: u16,
    pub bucket_index: u16,
    pub pinned_anomaly: bool,
    pub tau_w_stats: WelfordAccumulator,
    pub sost_stats: WelfordAccumulator,
    pub mqi_stats: WelfordAccumulator,
    pub sans_stats: WelfordAccumulator,
    pub rho_global_stats: WelfordAccumulator,
}

impl LongitudinalSuperNode {
    pub const fn new(sol: u16, bucket_index: u16) -> Self {
        Self {
            sol,
            bucket_index,
            pinned_anomaly: false,
            tau_w_stats: WelfordAccumulator::new(),
            sost_stats: WelfordAccumulator::new(),
            mqi_stats: WelfordAccumulator::new(),
            sans_stats: WelfordAccumulator::new(),
            rho_global_stats: WelfordAccumulator::new(),
        }
    }

    /// Folds one tick into the five Welford channels. A negative global
    /// robustness pins the node (Information-Bottleneck anomaly retention).
    #[inline]
    pub fn observe_tick(&mut self, tick: &PhysiologicalTick) {
        self.tau_w_stats.update(tick.tau_w_dyn_cm2);
        self.sost_stats.update(tick.sost_pmol_l);
        self.mqi_stats.update(tick.mqi);
        self.sans_stats.update(tick.sans_index);
        if let Some(rho) = tick.rho_global {
            self.rho_global_stats.update(rho);
        }
        if tick
            .rho_global
            .is_some_and(|rho| rho.is_finite() && rho < 0.0)
        {
            self.pinned_anomaly = true;
        }
    }

    /// Merges another super-node (e.g. warm bucket into a Sol roll-up).
    #[inline]
    pub fn merge(&mut self, other: &Self) {
        self.tau_w_stats.merge(&other.tau_w_stats);
        self.sost_stats.merge(&other.sost_stats);
        self.mqi_stats.merge(&other.mqi_stats);
        self.sans_stats.merge(&other.sans_stats);
        self.rho_global_stats.merge(&other.rho_global_stats);
        self.pinned_anomaly |= other.pinned_anomaly;
    }

    #[inline]
    pub fn tick_count(&self) -> u64 {
        self.rho_global_stats.count
    }
}

/// Three-tier longitudinal compactor: preallocated Sol super-nodes (cold tier)
/// plus 96 warm buckets for the Sol in progress. Every update is O(1) with no
/// allocation after construction.
#[derive(Debug, Clone, PartialEq)]
pub struct MissionLongitudinalCompactor {
    daily: Box<[LongitudinalSuperNode]>,
    warm: [LongitudinalSuperNode; WARM_BUCKETS_PER_SOL],
    current_sol: u32,
    observed_any: bool,
}

impl MissionLongitudinalCompactor {
    /// Allocates the mission store once (`1..=MAX_MISSION_CAPACITY_SOLS`).
    pub fn new(capacity_sols: u32) -> Result<Self, CausalGraphError> {
        if capacity_sols == 0 || capacity_sols > MAX_MISSION_CAPACITY_SOLS {
            return Err(CausalGraphError::InvalidArgument {
                name: "capacity_sols",
                reason: format!("must be in 1..={MAX_MISSION_CAPACITY_SOLS}, got {capacity_sols}"),
            });
        }
        let daily: Vec<LongitudinalSuperNode> = (0..capacity_sols)
            .map(|s| LongitudinalSuperNode::new(s as u16, u16::MAX))
            .collect();
        Ok(Self {
            daily: daily.into_boxed_slice(),
            warm: Self::fresh_warm_ring(0),
            current_sol: 0,
            observed_any: false,
        })
    }

    fn fresh_warm_ring(sol: u32) -> [LongitudinalSuperNode; WARM_BUCKETS_PER_SOL] {
        let mut ring = [LongitudinalSuperNode::new(sol as u16, 0); WARM_BUCKETS_PER_SOL];
        for (idx, node) in ring.iter_mut().enumerate() {
            node.bucket_index = idx as u16;
        }
        ring
    }

    /// Width of one warm bucket in seconds (Sol / 96).
    #[inline]
    pub const fn warm_bucket_seconds() -> f64 {
        MARS_SOL_SECONDS / WARM_BUCKETS_PER_SOL as f64
    }

    #[inline]
    pub fn capacity_sols(&self) -> u32 {
        self.daily.len() as u32
    }

    #[inline]
    pub fn current_sol(&self) -> u32 {
        self.current_sol
    }

    /// Routes one tick observed at `mission_elapsed_s` into the warm bucket and
    /// the Sol super-node in O(1).
    pub fn observe(
        &mut self,
        mission_elapsed_s: f64,
        tick: &PhysiologicalTick,
    ) -> Result<(), CausalGraphError> {
        if !mission_elapsed_s.is_finite() || mission_elapsed_s < 0.0 {
            return Err(CausalGraphError::InvalidArgument {
                name: "mission_elapsed_s",
                reason: format!("must be finite and >= 0, got {mission_elapsed_s}"),
            });
        }
        let sol_f = (mission_elapsed_s / MARS_SOL_SECONDS).floor();
        let capacity = self.capacity_sols();
        if sol_f >= capacity as f64 {
            return Err(CausalGraphError::MissionCapacityExceeded {
                sol: sol_f.min(u32::MAX as f64) as u32,
                capacity,
            });
        }
        let sol = sol_f as u32;
        if self.observed_any && sol < self.current_sol {
            return Err(CausalGraphError::NonMonotonicSol {
                sol,
                last_sol: self.current_sol,
            });
        }
        if sol != self.current_sol || !self.observed_any {
            if sol != self.current_sol {
                self.warm = Self::fresh_warm_ring(sol);
            }
            self.current_sol = sol;
            self.observed_any = true;
        }
        let seconds_into_sol = mission_elapsed_s - sol_f * MARS_SOL_SECONDS;
        let bucket = ((seconds_into_sol / Self::warm_bucket_seconds()).floor() as usize)
            .min(WARM_BUCKETS_PER_SOL - 1);
        self.warm[bucket].observe_tick(tick);
        if let Some(day) = self.daily.get_mut(sol as usize) {
            day.observe_tick(tick);
        }
        Ok(())
    }

    /// Cold-tier Sol super-nodes from Sol 0 up to the current Sol (inclusive).
    pub fn daily_super_nodes(&self) -> &[LongitudinalSuperNode] {
        if !self.observed_any {
            return &[];
        }
        let end = (self.current_sol as usize + 1).min(self.daily.len());
        &self.daily[..end]
    }

    /// Warm-tier buckets of the Sol in progress.
    pub fn warm_buckets(&self) -> &[LongitudinalSuperNode; WARM_BUCKETS_PER_SOL] {
        &self.warm
    }

    /// Roll-up of the warm ring (must equal the current Sol super-node).
    pub fn warm_rollup(&self) -> LongitudinalSuperNode {
        let mut acc = LongitudinalSuperNode::new(self.current_sol as u16, u16::MAX);
        for bucket in &self.warm {
            acc.merge(bucket);
        }
        acc
    }

    /// Sols whose super-node contains at least one negative-robustness tick.
    pub fn pinned_anomaly_sols(&self) -> impl Iterator<Item = u16> + '_ {
        self.daily_super_nodes()
            .iter()
            .filter(|n| n.pinned_anomaly)
            .map(|n| n.sol)
    }

    /// Exact resident footprint of the compactor (inline ring + boxed Sol store).
    pub fn memory_footprint_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            + self.daily.len() * std::mem::size_of::<LongitudinalSuperNode>()
    }
}

// ---------------------------------------------------------------------------
// Layer 2a: 3D anatomical region subgraph (UBERON grounded)
// ---------------------------------------------------------------------------

/// Five body regions of the `ares-cockpit/` 3D Body Heatmap.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum AnatomicalRegionId {
    /// Eye / ocular SANS (`UBERON:0000970`).
    EyeOcularSans = 0,
    /// Internal jugular vein (`UBERON:0001586`).
    InternalJugularVein = 1,
    /// Heart / cardio-autonomic (`UBERON:0000948`).
    HeartCardioAutonomic = 2,
    /// Soleus muscle and calcaneus (`UBERON:0001389`, calcaneus `UBERON:0001450`).
    SoleusCalcaneus = 3,
    /// Brain / vestibular CNS (`UBERON:0000955`).
    BrainVestibularCns = 4,
}

impl AnatomicalRegionId {
    pub const ALL: [Self; 5] = [
        Self::EyeOcularSans,
        Self::InternalJugularVein,
        Self::HeartCardioAutonomic,
        Self::SoleusCalcaneus,
        Self::BrainVestibularCns,
    ];

    /// Canonical `UBERON:` CURIE.
    #[inline]
    pub const fn uberon_curie(self) -> &'static str {
        match self {
            Self::EyeOcularSans => "UBERON:0000970",
            Self::InternalJugularVein => "UBERON:0001586",
            Self::HeartCardioAutonomic => "UBERON:0000948",
            Self::SoleusCalcaneus => "UBERON:0001389",
            Self::BrainVestibularCns => "UBERON:0000955",
        }
    }

    /// Numeric local identifier of the UBERON CURIE (fits the 16-byte descriptor).
    #[inline]
    pub const fn uberon_numeric(self) -> u16 {
        match self {
            Self::EyeOcularSans => 970,
            Self::InternalJugularVein => 1586,
            Self::HeartCardioAutonomic => 948,
            Self::SoleusCalcaneus => 1389,
            Self::BrainVestibularCns => 955,
        }
    }

    #[inline]
    pub const fn label(self) -> &'static str {
        match self {
            Self::EyeOcularSans => "Eye / Ocular SANS",
            Self::InternalJugularVein => "Internal Jugular Vein",
            Self::HeartCardioAutonomic => "Heart / Cardio-Autonomic",
            Self::SoleusCalcaneus => "Soleus Muscle / Calcaneus",
            Self::BrainVestibularCns => "Brain / Vestibular CNS",
        }
    }

    /// Stable key consumed by the Three.js heatmap in `ares-cockpit/`.
    #[inline]
    pub const fn heatmap_key(self) -> &'static str {
        match self {
            Self::EyeOcularSans => "eye_ocular_sans",
            Self::InternalJugularVein => "internal_jugular_vein",
            Self::HeartCardioAutonomic => "heart_cardio_autonomic",
            Self::SoleusCalcaneus => "soleus_calcaneus",
            Self::BrainVestibularCns => "brain_vestibular_cns",
        }
    }

    /// Normalized centroid `(x, y, z)` in `[-1, +1]^3` for Three.js rendering.
    #[inline]
    pub const fn normalized_centroid_3d(self) -> [f64; 3] {
        match self {
            Self::EyeOcularSans => [0.00, 0.82, 0.05],
            Self::InternalJugularVein => [-0.06, 0.62, 0.04],
            Self::HeartCardioAutonomic => [0.00, 0.30, 0.02],
            Self::SoleusCalcaneus => [0.00, -0.65, -0.03],
            Self::BrainVestibularCns => [0.00, 0.90, -0.02],
        }
    }

    /// Map from a UBERON numeric id back to the region (O(1)).
    #[inline]
    pub const fn from_uberon_numeric(id: u16) -> Option<Self> {
        match id {
            970 => Some(Self::EyeOcularSans),
            1586 => Some(Self::InternalJugularVein),
            948 => Some(Self::HeartCardioAutonomic),
            1389 | 1450 => Some(Self::SoleusCalcaneus),
            955 => Some(Self::BrainVestibularCns),
            _ => None,
        }
    }
}

/// Vertex of the anatomical subgraph.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnatomicalRegionNode {
    pub region: AnatomicalRegionId,
    pub uberon_curie: Cow<'static, str>,
    pub centroid: [f64; 3],
    /// Local (pre-propagation) normalized risk intensity in `[0, 1]`.
    pub risk_intensity: f64,
}

/// Directed conduction arc (rendered as a 3D causal Bezier arc in the cockpit).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AnatomicalConductionEdge {
    pub mechanism: &'static str,
    pub coupling_weight: f64,
}

/// Raw physiological readings feeding the heatmap. `None` = channel unavailable;
/// unavailable channels yield intensity 0 with `observed == false` (never imputed).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct AnatomicalRiskInputs {
    pub sans_index: Option<f64>,
    pub tau_w_dyn_cm2: Option<f64>,
    pub rmssd_ms: Option<f64>,
    pub sost_pmol_l: Option<f64>,
    /// Fractional soleus MQI deficit vs pre-flight baseline (0..1).
    pub mqi_deficit_fraction: Option<f64>,
    /// Martian 0.38 g gait asymmetry index [%].
    pub gai_pct: Option<f64>,
}

/// Nominal GAI used as the zero-risk anchor of the vestibular region [%].
pub const GAI_NOMINAL_PCT: f64 = 2.0;

/// One heatmap cell exported to `ares-cockpit/`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeatmapCell {
    pub region: AnatomicalRegionId,
    pub key: Cow<'static, str>,
    pub uberon_curie: Cow<'static, str>,
    pub centroid: [f64; 3],
    pub local_intensity: f64,
    pub propagated_intensity: f64,
    pub observed: bool,
}

/// Normalized 3D Body Heatmap (all intensities in `[0, 1]`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BodyHeatmap {
    pub cells: [HeatmapCell; 5],
    pub hottest_region: AnatomicalRegionId,
}

impl BodyHeatmap {
    #[inline]
    pub fn cell(&self, region: AnatomicalRegionId) -> &HeatmapCell {
        &self.cells[region as usize]
    }
}

#[inline]
fn normalize_rising(value: f64, nominal: f64, critical: f64) -> f64 {
    let span = critical - nominal;
    if !value.is_finite() || span.abs() < f64::EPSILON {
        return 0.0;
    }
    ((value - nominal) / span).clamp(0.0, 1.0)
}

/// Anatomical subgraph on `petgraph::StableDiGraph`.
#[derive(Debug, Clone)]
pub struct AnatomicalRegionSubgraph {
    graph: StableDiGraph<AnatomicalRegionNode, AnatomicalConductionEdge>,
    index: [NodeIndex; 5],
}

impl Default for AnatomicalRegionSubgraph {
    fn default() -> Self {
        Self::new()
    }
}

impl AnatomicalRegionSubgraph {
    pub fn new() -> Self {
        let mut graph = StableDiGraph::with_capacity(5, 6);
        let index = AnatomicalRegionId::ALL.map(|region| {
            graph.add_node(AnatomicalRegionNode {
                region,
                uberon_curie: Cow::Borrowed(region.uberon_curie()),
                centroid: region.normalized_centroid_3d(),
                risk_intensity: 0.0,
            })
        });
        let arcs: [(AnatomicalRegionId, AnatomicalRegionId, &'static str, f64); 6] = [
            (
                AnatomicalRegionId::InternalJugularVein,
                AnatomicalRegionId::EyeOcularSans,
                "Cephalad venous congestion -> translaminar gradient (SANS)",
                0.55,
            ),
            (
                AnatomicalRegionId::InternalJugularVein,
                AnatomicalRegionId::BrainVestibularCns,
                "Impaired cerebral venous outflow -> CNS fluid shift",
                0.40,
            ),
            (
                AnatomicalRegionId::HeartCardioAutonomic,
                AnatomicalRegionId::InternalJugularVein,
                "Central venous pressure / autonomic tone -> IJV stasis",
                0.35,
            ),
            (
                AnatomicalRegionId::SoleusCalcaneus,
                AnatomicalRegionId::HeartCardioAutonomic,
                "Calf muscle-pump deconditioning -> orthostatic intolerance",
                0.30,
            ),
            (
                AnatomicalRegionId::BrainVestibularCns,
                AnatomicalRegionId::SoleusCalcaneus,
                "Vestibulo-spinal reweighting -> 0.38 g gait loading asymmetry",
                0.25,
            ),
            (
                AnatomicalRegionId::BrainVestibularCns,
                AnatomicalRegionId::EyeOcularSans,
                "Intracranial pressure redistribution -> optic nerve sheath",
                0.30,
            ),
        ];
        for (from, to, mechanism, coupling_weight) in arcs {
            graph.add_edge(
                index[from as usize],
                index[to as usize],
                AnatomicalConductionEdge {
                    mechanism,
                    coupling_weight,
                },
            );
        }
        Self { graph, index }
    }

    #[inline]
    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    #[inline]
    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    /// Conduction arcs as `(from, to, edge)` triples for cockpit Bezier rendering.
    pub fn conduction_arcs(
        &self,
    ) -> Vec<(
        AnatomicalRegionId,
        AnatomicalRegionId,
        AnatomicalConductionEdge,
    )> {
        self.graph
            .edge_references()
            .filter_map(|e| {
                let a = self.graph.node_weight(e.source())?;
                let b = self.graph.node_weight(e.target())?;
                Some((a.region, b.region, *e.weight()))
            })
            .collect()
    }

    /// Computes local intensities, stores them on the nodes, and propagates one hop
    /// along conduction arcs with max-product semantics:
    /// `I_i = max(L_i, max_j w_ji * L_j)`, all clamped to `[0, 1]`.
    pub fn compute_body_heatmap(&mut self, inputs: &AnatomicalRiskInputs) -> BodyHeatmap {
        let local: [(f64, bool); 5] = [
            Self::opt(inputs.sans_index, |v| {
                normalize_rising(v, SANS_NOMINAL_INDEX, SANS_CRITICAL_INDEX)
            }),
            Self::opt(inputs.tau_w_dyn_cm2, |v| {
                normalize_rising(v, TAU_W_NOMINAL_DYN_CM2, TAU_W_CRITICAL_DYN_CM2)
            }),
            Self::opt(inputs.rmssd_ms, |v| {
                normalize_rising(v, RMSSD_NOMINAL_MS, RMSSD_CRITICAL_MS)
            }),
            {
                let sost = inputs
                    .sost_pmol_l
                    .filter(|v| v.is_finite())
                    .map(|v| normalize_rising(v, SOST_NOMINAL_PMOL_L, SOST_CRITICAL_PMOL_L));
                let mqi = inputs
                    .mqi_deficit_fraction
                    .filter(|v| v.is_finite())
                    .map(|v| v.clamp(0.0, 1.0));
                match (sost, mqi) {
                    (None, None) => (0.0, false),
                    (a, b) => (a.unwrap_or(0.0).max(b.unwrap_or(0.0)), true),
                }
            },
            Self::opt(inputs.gai_pct, |v| {
                normalize_rising(v, GAI_NOMINAL_PCT, GAI_MAX_SAFE_PCT)
            }),
        ];

        for region in AnatomicalRegionId::ALL {
            if let Some(node) = self.graph.node_weight_mut(self.index[region as usize]) {
                node.risk_intensity = local[region as usize].0;
            }
        }

        let mut propagated = local.map(|(v, _)| v);
        for e in self.graph.edge_references() {
            let (Some(src), Some(dst)) = (
                self.graph.node_weight(e.source()),
                self.graph.node_weight(e.target()),
            ) else {
                continue;
            };
            let induced = (e.weight().coupling_weight * src.risk_intensity).clamp(0.0, 1.0);
            let slot = &mut propagated[dst.region as usize];
            if induced > *slot {
                *slot = induced;
            }
        }

        let cells = AnatomicalRegionId::ALL.map(|region| {
            let i = region as usize;
            HeatmapCell {
                region,
                key: Cow::Borrowed(region.heatmap_key()),
                uberon_curie: Cow::Borrowed(region.uberon_curie()),
                centroid: region.normalized_centroid_3d(),
                local_intensity: local[i].0,
                propagated_intensity: propagated[i].clamp(0.0, 1.0),
                observed: local[i].1,
            }
        });
        let mut hottest_region = AnatomicalRegionId::EyeOcularSans;
        let mut best = f64::NEG_INFINITY;
        for cell in &cells {
            if cell.propagated_intensity > best {
                best = cell.propagated_intensity;
                hottest_region = cell.region;
            }
        }
        BodyHeatmap {
            cells,
            hottest_region,
        }
    }

    #[inline]
    fn opt(value: Option<f64>, f: impl Fn(f64) -> f64) -> (f64, bool) {
        match value.filter(|v| v.is_finite()) {
            Some(v) => (f(v), true),
            None => (0.0, false),
        }
    }
}

// ---------------------------------------------------------------------------
// Layer 2b: spacecraft habitat deontic and Markov subgraph
// ---------------------------------------------------------------------------

/// Six physical compartments of the transit / surface habitat.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum HabitatZoneId {
    SleepQuarters = 0,
    AredExerciseBay = 1,
    LbnpChamber = 2,
    MedOpsUltrasoundBay = 3,
    RadiationStormShelter = 4,
    EvaAirlock = 5,
}

impl HabitatZoneId {
    pub const COUNT: usize = 6;
    pub const ALL: [Self; 6] = [
        Self::SleepQuarters,
        Self::AredExerciseBay,
        Self::LbnpChamber,
        Self::MedOpsUltrasoundBay,
        Self::RadiationStormShelter,
        Self::EvaAirlock,
    ];

    #[inline]
    pub const fn label(self) -> &'static str {
        match self {
            Self::SleepQuarters => "Crew Sleep Quarters",
            Self::AredExerciseBay => "ARED Exercise Bay",
            Self::LbnpChamber => "LBNP Chamber",
            Self::MedOpsUltrasoundBay => "MedOps Ultrasound Bay",
            Self::RadiationStormShelter => "Radiation Storm Shelter",
            Self::EvaAirlock => "EVA Airlock",
        }
    }

    #[inline]
    pub const fn from_index(i: usize) -> Option<Self> {
        match i {
            0 => Some(Self::SleepQuarters),
            1 => Some(Self::AredExerciseBay),
            2 => Some(Self::LbnpChamber),
            3 => Some(Self::MedOpsUltrasoundBay),
            4 => Some(Self::RadiationStormShelter),
            5 => Some(Self::EvaAirlock),
            _ => None,
        }
    }
}

/// Deontic modality of a habitat zone (Standard Deontic Logic O / P / F).
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DeonticModality {
    Permitted = 0,
    Restricted = 1,
    Forbidden = 2,
    Mandatory = 3,
}

impl DeonticModality {
    /// Strictness lattice used to combine rules: Permitted < Restricted < Mandatory < Forbidden.
    #[inline]
    pub const fn strictness(self) -> u8 {
        match self {
            Self::Permitted => 0,
            Self::Restricted => 1,
            Self::Mandatory => 2,
            Self::Forbidden => 3,
        }
    }
}

/// Environmental and clinical state evaluated by the deontic policy.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HabitatEnvironmentState {
    pub current_zone: HabitatZoneId,
    /// CSA CANS neutron + charged particle dose rate [mSv/day].
    pub radiation_dose_rate_msv_d: f64,
    pub gai_pct: f64,
    pub pocus_thrombus_confirmed: bool,
    /// Continuous dwell in the LBNP chamber [s].
    pub lbnp_dwell_s: f64,
    /// Continuous A-weighted noise level in the sleep quarters [dBA].
    pub sleep_quarters_noise_dba: f64,
}

/// Per-zone deontic verdict with Q-STL robustness `rho in [-1, +1]` of the
/// proposition "an astronaut present in this zone is compliant".
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ZoneDeonticVerdict {
    pub zone: HabitatZoneId,
    pub modality: DeonticModality,
    pub rho_qstl: f64,
    pub rule_id: Cow<'static, str>,
    pub governing_clause: Cow<'static, str>,
}

/// Full deontic assessment of the habitat for one astronaut.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HabitatDeonticAssessment {
    pub verdicts: [ZoneDeonticVerdict; 6],
    pub current_zone: HabitatZoneId,
    /// Q-STL robustness of the astronaut's current location (conjunctive min).
    pub rho_current_location: f64,
    pub violates_policy: bool,
    pub mandatory_zone: Option<HabitatZoneId>,
}

impl HabitatDeonticAssessment {
    #[inline]
    pub fn verdict(&self, zone: HabitatZoneId) -> &ZoneDeonticVerdict {
        &self.verdicts[zone as usize]
    }
}

/// Deontic policy thresholds (defaults from NASA-STD-3001, CSA CANS and the 3 Safety Gates).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HabitatZoneDeonticPolicy {
    pub spe_dose_rate_threshold_msv_d: f64,
    pub lbnp_max_dwell_s: f64,
    pub gai_max_safe_pct: f64,
    pub sleep_quarters_max_noise_dba: f64,
}

impl Default for HabitatZoneDeonticPolicy {
    fn default() -> Self {
        Self {
            spe_dose_rate_threshold_msv_d: 1.5,
            lbnp_max_dwell_s: 2_700.0,
            gai_max_safe_pct: GAI_MAX_SAFE_PCT,
            sleep_quarters_max_noise_dba: 50.0,
        }
    }
}

#[inline]
fn apply_zone_verdict(
    v: &mut [ZoneDeonticVerdict; 6],
    zone: HabitatZoneId,
    modality: DeonticModality,
    rho: f64,
    rule_id: &'static str,
    clause: &'static str,
) {
    let slot = &mut v[zone as usize];
    if modality.strictness() >= slot.modality.strictness() {
        *slot = ZoneDeonticVerdict {
            zone,
            modality,
            rho_qstl: rho.clamp(-1.0, 1.0),
            rule_id: Cow::Borrowed(rule_id),
            governing_clause: Cow::Borrowed(clause),
        };
    }
}

impl HabitatZoneDeonticPolicy {
    /// Evaluates all six zones in O(1). Rule order: nominal -> acoustic -> LBNP
    /// dwell -> gait -> thrombus -> SPE (hard override, applied last).
    pub fn evaluate(&self, s: &HabitatEnvironmentState) -> HabitatDeonticAssessment {
        let mut v = HabitatZoneId::ALL.map(|zone| ZoneDeonticVerdict {
            zone,
            modality: DeonticModality::Permitted,
            rho_qstl: 1.0,
            rule_id: Cow::Borrowed("NOMINAL"),
            governing_clause: Cow::Borrowed("NASA-STD-3001 [V1 3001]"),
        });

        // Acoustic ceiling in the sleep quarters.
        let noise = s.sleep_quarters_noise_dba;
        if noise.is_finite() && noise > self.sleep_quarters_max_noise_dba {
            let rho =
                (self.sleep_quarters_max_noise_dba - noise) / self.sleep_quarters_max_noise_dba;
            apply_zone_verdict(
                &mut v,
                HabitatZoneId::SleepQuarters,
                DeonticModality::Restricted,
                rho.min(-0.01),
                "ACOUSTIC_SLEEP_CEILING",
                "NASA-STD-3001 [V2 6001]",
            );
        }

        // LBNP dwell guardrail (Safety Gate 2).
        let dwell = if s.lbnp_dwell_s.is_finite() {
            s.lbnp_dwell_s.max(0.0)
        } else {
            0.0
        };
        if dwell > self.lbnp_max_dwell_s {
            apply_zone_verdict(
                &mut v,
                HabitatZoneId::LbnpChamber,
                DeonticModality::Forbidden,
                ((self.lbnp_max_dwell_s - dwell) / 900.0).clamp(-1.0, -0.01),
                "GATE2_LBNP_MAX_DWELL",
                "NASA-STD-3001 [V1 3003]",
            );
        } else {
            let slot = &mut v[HabitatZoneId::LbnpChamber as usize];
            slot.rho_qstl =
                ((self.lbnp_max_dwell_s - dwell) / self.lbnp_max_dwell_s).clamp(0.0, 1.0);
        }

        // Martian gait asymmetry (Safety Gate 3).
        if s.gai_pct.is_finite() && s.gai_pct > self.gai_max_safe_pct {
            apply_zone_verdict(
                &mut v,
                HabitatZoneId::EvaAirlock,
                DeonticModality::Restricted,
                ((self.gai_max_safe_pct - s.gai_pct) / self.gai_max_safe_pct).clamp(-1.0, -0.01),
                "GATE3_GAI_SUIT_DAMPING_REQUIRED",
                "NASA-STD-3001 [V1 3002]",
            );
        }

        // POCUS-confirmed IJV thrombus (Safety Gate 1 / MTB-007).
        if s.pocus_thrombus_confirmed {
            apply_zone_verdict(
                &mut v,
                HabitatZoneId::EvaAirlock,
                DeonticModality::Forbidden,
                -1.0,
                "MTB007_EVA_PROHIBITED_THROMBUS",
                "NASA OCHMO MTB-007",
            );
            apply_zone_verdict(
                &mut v,
                HabitatZoneId::AredExerciseBay,
                DeonticModality::Restricted,
                -0.5,
                "MTB007_SUSPEND_VALSALVA_ARED",
                "NASA OCHMO MTB-007",
            );
            apply_zone_verdict(
                &mut v,
                HabitatZoneId::MedOpsUltrasoundBay,
                DeonticModality::Mandatory,
                1.0,
                "MTB007_MEDOPS_FOLLOW_UP",
                "NASA OCHMO MTB-007",
            );
        }

        // Solar particle event: hard override of every zone.
        let rate = s.radiation_dose_rate_msv_d;
        if rate.is_finite() && rate > self.spe_dose_rate_threshold_msv_d {
            let rho_rad = ((self.spe_dose_rate_threshold_msv_d - rate)
                / self.spe_dose_rate_threshold_msv_d)
                .clamp(-1.0, -0.01);
            for zone in HabitatZoneId::ALL {
                let (modality, rho, rule) = match zone {
                    HabitatZoneId::RadiationStormShelter => (
                        DeonticModality::Mandatory,
                        1.0,
                        "SPE_STORM_SHELTER_MANDATORY",
                    ),
                    HabitatZoneId::EvaAirlock => (
                        DeonticModality::Forbidden,
                        rho_rad.min(-0.5),
                        "SPE_EVA_FORBIDDEN",
                    ),
                    _ => (
                        DeonticModality::Restricted,
                        rho_rad,
                        "SPE_EVACUATE_TO_SHELTER",
                    ),
                };
                v[zone as usize] = ZoneDeonticVerdict {
                    zone,
                    modality,
                    rho_qstl: rho,
                    rule_id: Cow::Borrowed(rule),
                    governing_clause: Cow::Borrowed("NASA-STD-3001 [V1 4001]"),
                };
            }
        }

        let mandatory_zone = v
            .iter()
            .find(|x| x.modality == DeonticModality::Mandatory)
            .map(|x| x.zone);
        let mut rho_current = v[s.current_zone as usize].rho_qstl;
        if let Some(mz) = mandatory_zone
            && mz != s.current_zone
        {
            // Obligation O(be in mz) is violated while the astronaut is elsewhere.
            rho_current = rho_current.min(-0.25);
        }
        HabitatDeonticAssessment {
            verdicts: v,
            current_zone: s.current_zone,
            rho_current_location: rho_current,
            violates_policy: rho_current < 0.0,
            mandatory_zone,
        }
    }
}

/// Default symmetric Dirichlet concentration of the zone transition model.
pub const ZONE_DIRICHLET_ALPHA: f64 = 0.10;
/// Default KL divergence threshold [nats] for a behavioral anomaly.
pub const ZONE_KL_ANOMALY_THRESHOLD_NATS: f64 = 0.50;

/// Behavioral anomaly raised by the Markov transition model.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BehavioralAnomaly {
    pub from_zone: HabitatZoneId,
    pub kl_divergence_nats: f64,
    pub observed_transitions: u32,
}

/// Six-state Dirichlet-Multinomial habitat transition model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ZoneTransitionMarkovModel {
    pub transition_counts: [[u32; 6]; 6],
    pub dirichlet_alpha: f64,
}

impl Default for ZoneTransitionMarkovModel {
    fn default() -> Self {
        Self {
            transition_counts: [[0; 6]; 6],
            dirichlet_alpha: ZONE_DIRICHLET_ALPHA,
        }
    }
}

impl ZoneTransitionMarkovModel {
    pub fn with_alpha(alpha: f64) -> Result<Self, CausalGraphError> {
        if !alpha.is_finite() || alpha <= 0.0 {
            return Err(CausalGraphError::InvalidArgument {
                name: "dirichlet_alpha",
                reason: format!("must be finite and > 0, got {alpha}"),
            });
        }
        Ok(Self {
            transition_counts: [[0; 6]; 6],
            dirichlet_alpha: alpha,
        })
    }

    #[inline]
    pub fn record_transition(&mut self, from: HabitatZoneId, to: HabitatZoneId) {
        let c = &mut self.transition_counts[from as usize][to as usize];
        *c = c.saturating_add(1);
    }

    /// Records every consecutive pair of a zone trajectory.
    pub fn record_sequence(&mut self, zones: &[HabitatZoneId]) {
        for pair in zones.windows(2) {
            self.record_transition(pair[0], pair[1]);
        }
    }

    #[inline]
    pub fn row_total(&self, from: HabitatZoneId) -> u32 {
        self.transition_counts[from as usize]
            .iter()
            .fold(0u32, |acc, &c| acc.saturating_add(c))
    }

    /// Posterior predictive `P(to | from) = (n_ab + alpha) / (sum_b n_ab + K alpha)`.
    #[inline]
    pub fn posterior_transition_prob(&self, from: HabitatZoneId, to: HabitatZoneId) -> f64 {
        let alpha = self.dirichlet_alpha.max(1e-6);
        let n_ab = self.transition_counts[from as usize][to as usize] as f64;
        (n_ab + alpha) / (self.row_total(from) as f64 + HabitatZoneId::COUNT as f64 * alpha)
    }

    pub fn posterior_row(&self, from: HabitatZoneId) -> [f64; 6] {
        HabitatZoneId::ALL.map(|to| self.posterior_transition_prob(from, to))
    }

    /// `D_KL(P_obs(.|from) || P_baseline(.|from))` in nats.
    pub fn kl_divergence_from_baseline(
        &self,
        from: HabitatZoneId,
        baseline: &[f64; 6],
    ) -> Result<f64, CausalGraphError> {
        let sum: f64 = baseline.iter().sum();
        if baseline.iter().any(|q| !q.is_finite() || *q < 0.0) || (sum - 1.0).abs() > 1e-6 {
            return Err(CausalGraphError::InvalidArgument {
                name: "baseline",
                reason: format!("must be a finite probability vector summing to 1 (sum = {sum})"),
            });
        }
        let p_row = self.posterior_row(from);
        let mut kl = 0.0;
        for (p, q) in p_row.iter().zip(baseline.iter()) {
            let p = p.max(1e-12);
            let q = q.max(1e-12);
            kl += p * (p / q).ln();
        }
        Ok(kl.max(0.0))
    }

    /// Returns the worst row whose KL divergence exceeds `threshold_nats`, considering
    /// only rows with at least `min_transitions` observations.
    pub fn detect_behavioral_anomaly(
        &self,
        baseline: &[[f64; 6]; 6],
        threshold_nats: f64,
        min_transitions: u32,
    ) -> Result<Option<BehavioralAnomaly>, CausalGraphError> {
        let mut worst: Option<BehavioralAnomaly> = None;
        for zone in HabitatZoneId::ALL {
            let n = self.row_total(zone);
            if n < min_transitions {
                continue;
            }
            let kl = self.kl_divergence_from_baseline(zone, &baseline[zone as usize])?;
            if kl > threshold_nats && worst.is_none_or(|w| kl > w.kl_divergence_nats) {
                worst = Some(BehavioralAnomaly {
                    from_zone: zone,
                    kl_divergence_nats: kl,
                    observed_transitions: n,
                });
            }
        }
        Ok(worst)
    }

    /// Engineering prior of a nominal crew day (rows sum to 1). This is a design
    /// baseline for anomaly scoring, not an empirically fitted CHAPEA matrix.
    pub const fn nominal_crew_baseline() -> [[f64; 6]; 6] {
        [
            [0.30, 0.25, 0.10, 0.20, 0.05, 0.10],
            [0.30, 0.10, 0.20, 0.25, 0.05, 0.10],
            [0.25, 0.20, 0.05, 0.40, 0.05, 0.05],
            [0.35, 0.25, 0.15, 0.10, 0.05, 0.10],
            [0.40, 0.15, 0.05, 0.25, 0.10, 0.05],
            [0.20, 0.10, 0.05, 0.50, 0.05, 0.10],
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_welford_accumulator_matches_exact_two_pass_variance() {
        let xs: Vec<f64> = (0..481)
            .map(|i| 60.0 + ((i as f64) * 0.37).sin() * 12.5 + (i % 7) as f64)
            .collect();
        let mut acc = WelfordAccumulator::new();
        for &x in &xs {
            assert!(acc.update(x));
        }
        let n = xs.len() as f64;
        let mean = xs.iter().sum::<f64>() / n;
        let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
        assert_eq!(acc.count, 481);
        assert!((acc.mean - mean).abs() < 1e-12);
        assert!((acc.sample_variance() - var).abs() < 1e-9);
        assert!((acc.sample_std_dev() - var.sqrt()).abs() < 1e-9);
        let min = xs.iter().cloned().fold(f64::INFINITY, f64::min);
        assert!((acc.min_value().unwrap() - min).abs() < 1e-4);
        assert!(!acc.update(f64::NAN));
        assert_eq!(acc.count, 481);
    }

    #[test]
    fn test_welford_merge_equals_sequential() {
        let mut a = WelfordAccumulator::new();
        let mut b = WelfordAccumulator::new();
        let mut all = WelfordAccumulator::new();
        for i in 0..200 {
            let x = (i as f64 * 1.3).cos() * 4.0 + 10.0;
            if i < 77 {
                a.update(x);
            } else {
                b.update(x);
            }
            all.update(x);
        }
        a.merge(&b);
        assert_eq!(a.count, all.count);
        assert!((a.mean - all.mean).abs() < 1e-12);
        assert!((a.sample_variance() - all.sample_variance()).abs() < 1e-9);
        assert_eq!(a.min, all.min);
        assert_eq!(a.max, all.max);
    }

    #[test]
    fn test_900_sol_mission_fits_under_200_kb() {
        assert!(std::mem::size_of::<LongitudinalSuperNode>() <= 168);
        let compactor = MissionLongitudinalCompactor::new(MARS_MISSION_SOLS).unwrap();
        let bytes = compactor.memory_footprint_bytes();
        assert!(
            bytes < LONGITUDINAL_MEMORY_BUDGET_BYTES,
            "footprint {bytes} B"
        );
    }

    #[test]
    fn test_compactor_rolls_sols_pins_anomalies_and_matches_warm_rollup() {
        let mut c = MissionLongitudinalCompactor::new(10).unwrap();
        let step = 600.0;
        let mut t = 0.0;
        while t < 3.0 * MARS_SOL_SECONDS {
            let sol = (t / MARS_SOL_SECONDS).floor() as u32;
            let rho = if sol == 1 && (t % MARS_SOL_SECONDS) < 3_000.0 {
                -0.2
            } else {
                0.4
            };
            c.observe(
                t,
                &PhysiologicalTick {
                    tau_w_dyn_cm2: 2.4,
                    sost_pmol_l: 30.0,
                    mqi: 0.8,
                    sans_index: 0.2,
                    rho_global: Some(rho),
                },
            )
            .unwrap();
            t += step;
        }
        assert_eq!(c.current_sol(), 2);
        assert_eq!(c.daily_super_nodes().len(), 3);
        let pinned: Vec<u16> = c.pinned_anomaly_sols().collect();
        assert_eq!(pinned, vec![1]);
        let roll = c.warm_rollup();
        let day = c.daily_super_nodes()[2];
        assert_eq!(roll.tick_count(), day.tick_count());
        assert!((roll.rho_global_stats.mean - day.rho_global_stats.mean).abs() < 1e-12);
        // Monotonicity and capacity guards.
        assert!(matches!(
            c.observe(
                10.0,
                &PhysiologicalTick {
                    tau_w_dyn_cm2: 1.0,
                    sost_pmol_l: 1.0,
                    mqi: 1.0,
                    sans_index: 0.0,
                    rho_global: Some(0.0)
                }
            ),
            Err(CausalGraphError::NonMonotonicSol { .. })
        ));
        assert!(matches!(
            c.observe(
                11.0 * MARS_SOL_SECONDS,
                &PhysiologicalTick {
                    tau_w_dyn_cm2: 1.0,
                    sost_pmol_l: 1.0,
                    mqi: 1.0,
                    sans_index: 0.0,
                    rho_global: Some(0.0)
                }
            ),
            Err(CausalGraphError::MissionCapacityExceeded { .. })
        ));
        assert!(MissionLongitudinalCompactor::new(0).is_err());
    }

    #[test]
    fn test_anatomical_subgraph_uberon_and_heatmap_bounds() {
        let mut g = AnatomicalRegionSubgraph::new();
        assert_eq!(g.node_count(), 5);
        assert_eq!(g.edge_count(), 6);
        assert_eq!(
            AnatomicalRegionId::EyeOcularSans.uberon_curie(),
            "UBERON:0000970"
        );
        assert_eq!(
            AnatomicalRegionId::InternalJugularVein.uberon_curie(),
            "UBERON:0001586"
        );
        assert_eq!(
            AnatomicalRegionId::HeartCardioAutonomic.uberon_curie(),
            "UBERON:0000948"
        );
        assert_eq!(
            AnatomicalRegionId::SoleusCalcaneus.uberon_curie(),
            "UBERON:0001389"
        );
        assert_eq!(
            AnatomicalRegionId::BrainVestibularCns.uberon_curie(),
            "UBERON:0000955"
        );
        for r in AnatomicalRegionId::ALL {
            assert_eq!(
                AnatomicalRegionId::from_uberon_numeric(r.uberon_numeric()),
                Some(r)
            );
            assert!(
                r.normalized_centroid_3d()
                    .iter()
                    .all(|c| (-1.0..=1.0).contains(c))
            );
        }

        // Severe IJV stasis only: IJV is hottest and propagates to eye and brain.
        let hm = g.compute_body_heatmap(&AnatomicalRiskInputs {
            tau_w_dyn_cm2: Some(0.9),
            ..Default::default()
        });
        assert_eq!(hm.hottest_region, AnatomicalRegionId::InternalJugularVein);
        assert!(
            (hm.cell(AnatomicalRegionId::InternalJugularVein)
                .local_intensity
                - 1.0)
                .abs()
                < 1e-12
        );
        assert!(
            (hm.cell(AnatomicalRegionId::EyeOcularSans)
                .propagated_intensity
                - 0.55)
                .abs()
                < 1e-12
        );
        assert!(!hm.cell(AnatomicalRegionId::EyeOcularSans).observed);
        for c in &hm.cells {
            assert!((0.0..=1.0).contains(&c.local_intensity));
            assert!((0.0..=1.0).contains(&c.propagated_intensity));
        }

        // Nominal readings -> all zero.
        let nominal = g.compute_body_heatmap(&AnatomicalRiskInputs {
            sans_index: Some(SANS_NOMINAL_INDEX),
            tau_w_dyn_cm2: Some(3.5),
            rmssd_ms: Some(60.0),
            sost_pmol_l: Some(20.0),
            mqi_deficit_fraction: Some(0.0),
            gai_pct: Some(1.0),
        });
        assert!(
            nominal
                .cells
                .iter()
                .all(|c| c.propagated_intensity == 0.0 && c.observed)
        );
        assert_eq!(g.conduction_arcs().len(), 6);
    }

    fn state(zone: HabitatZoneId) -> HabitatEnvironmentState {
        HabitatEnvironmentState {
            current_zone: zone,
            radiation_dose_rate_msv_d: 0.4,
            gai_pct: 5.0,
            pocus_thrombus_confirmed: false,
            lbnp_dwell_s: 0.0,
            sleep_quarters_noise_dba: 40.0,
        }
    }

    #[test]
    fn test_habitat_deontic_spe_forbids_eva_and_mandates_storm_shelter() {
        let policy = HabitatZoneDeonticPolicy::default();
        let nominal = policy.evaluate(&state(HabitatZoneId::AredExerciseBay));
        assert!(!nominal.violates_policy);
        assert!(
            nominal
                .verdicts
                .iter()
                .all(|v| v.modality == DeonticModality::Permitted)
        );

        let mut spe = state(HabitatZoneId::AredExerciseBay);
        spe.radiation_dose_rate_msv_d = 2.4;
        let a = policy.evaluate(&spe);
        assert_eq!(
            a.verdict(HabitatZoneId::EvaAirlock).modality,
            DeonticModality::Forbidden
        );
        assert_eq!(
            a.verdict(HabitatZoneId::RadiationStormShelter).modality,
            DeonticModality::Mandatory
        );
        assert_eq!(a.mandatory_zone, Some(HabitatZoneId::RadiationStormShelter));
        assert!(a.violates_policy);
        assert!(a.rho_current_location < 0.0);

        spe.current_zone = HabitatZoneId::RadiationStormShelter;
        let sheltered = policy.evaluate(&spe);
        assert!(!sheltered.violates_policy);
        assert!(sheltered.rho_current_location > 0.0);
    }

    #[test]
    fn test_habitat_deontic_thrombus_gai_and_lbnp_rules() {
        let policy = HabitatZoneDeonticPolicy::default();
        let mut s = state(HabitatZoneId::EvaAirlock);
        s.gai_pct = 15.0;
        let a = policy.evaluate(&s);
        assert_eq!(
            a.verdict(HabitatZoneId::EvaAirlock).modality,
            DeonticModality::Restricted
        );
        assert!(a.violates_policy);

        s.pocus_thrombus_confirmed = true;
        let b = policy.evaluate(&s);
        assert_eq!(
            b.verdict(HabitatZoneId::EvaAirlock).modality,
            DeonticModality::Forbidden
        );
        assert_eq!(b.verdict(HabitatZoneId::EvaAirlock).rho_qstl, -1.0);
        assert_eq!(
            b.verdict(HabitatZoneId::MedOpsUltrasoundBay).modality,
            DeonticModality::Mandatory
        );

        let mut l = state(HabitatZoneId::LbnpChamber);
        l.lbnp_dwell_s = 3_000.0;
        let c = policy.evaluate(&l);
        assert_eq!(
            c.verdict(HabitatZoneId::LbnpChamber).modality,
            DeonticModality::Forbidden
        );
        assert!(c.rho_current_location < 0.0);
        l.lbnp_dwell_s = 1_350.0;
        let d = policy.evaluate(&l);
        assert!((d.verdict(HabitatZoneId::LbnpChamber).rho_qstl - 0.5).abs() < 1e-12);
    }

    #[test]
    fn test_markov_dirichlet_probabilities_sum_to_one_and_detect_kl_anomaly() {
        let mut m = ZoneTransitionMarkovModel::default();
        assert_eq!(m.dirichlet_alpha, 0.10);
        for zone in HabitatZoneId::ALL {
            let s: f64 = m.posterior_row(zone).iter().sum();
            assert!((s - 1.0).abs() < 1e-12);
        }
        let confinement = vec![HabitatZoneId::SleepQuarters; 41];
        m.record_sequence(&confinement);
        let row: f64 = m.posterior_row(HabitatZoneId::SleepQuarters).iter().sum();
        assert!((row - 1.0).abs() < 1e-12);
        let base = ZoneTransitionMarkovModel::nominal_crew_baseline();
        for r in &base {
            assert!((r.iter().sum::<f64>() - 1.0).abs() < 1e-12);
        }
        let kl = m
            .kl_divergence_from_baseline(HabitatZoneId::SleepQuarters, &base[0])
            .unwrap();
        assert!(kl > 0.50, "kl = {kl}");
        let anomaly = m
            .detect_behavioral_anomaly(&base, ZONE_KL_ANOMALY_THRESHOLD_NATS, 10)
            .unwrap()
            .unwrap();
        assert_eq!(anomaly.from_zone, HabitatZoneId::SleepQuarters);
        assert_eq!(anomaly.observed_transitions, 40);
        assert!(
            m.kl_divergence_from_baseline(HabitatZoneId::SleepQuarters, &[0.5; 6])
                .is_err()
        );
        assert!(ZoneTransitionMarkovModel::with_alpha(0.0).is_err());
    }
}
