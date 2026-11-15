//! Phase 20 (Block I3): Unified Multi-Dataset Knowledge Graph Builder (`ARES-DatasetGraph`).
//!
//! Integrates all 5 reference architectures in pure safe Rust:
//! 1. **NASA OSDR / GeneLab + UCSF SPOKE (`BaranziniLab/SPOKE`, `nasa/GeneLab_Data_Processing`):**
//!    Links spaceflight studies (`OSD-51`, `OSD-195`, `OSD-818`, `OSD-570`, `OSD-635`,
//!    `OSD-379`, `OSD-48`) to anatomical structures, DEGs/proteins (`SOST`, `RANKL`,
//!    `VEGFA`, `ICAM1`, `NOS3`, `HIF1A`, `IL6`, `COL1A1`, `ACTA1`, `MYH7`, `PPARGC1A`,
//!    `BDNF`), and spaceflight phenotypes.
//! 2. **BioCypher & OntoWeaver (`biocypher/biocypher`):** Modular `DatasetGraphAdapter`
//!    ingestion + formal ontology CURIEs (`UBERON:`, `LOINC:`, `MONDO:`, `HP:`, `HGNC:`).
//! 3. **PrimeKG (`mims-harvard/PrimeKG`):** Nine precision-medicine node categories
//!    (`Dataset`, `SubjectCohort`, `TimeWindowSlice`, `Biomarker`, `GeneProtein`,
//!    `AnatomicalStructure`, `PathologyPhenotype`, `Countermeasure`, `NormativeClause`).
//! 4. **Biolink Model (`biolink/biolink-model`):** Standardized Biolink predicates on
//!    every directed edge (`biolink:measures_biomarker`, `biolink:shows_effect_size`,
//!    `biolink:causally_drives`, `biolink:correlated_with`, `biolink:expressed_in`,
//!    `biolink:mitigated_by`, `biolink:governed_by_shall`, `biolink:has_time_window_slice`).
//! 5. **Pure-Rust `petgraph` + `graphify` Exporter:** `StableDiGraph` over all 24
//!    cataloged datasets plus real `data/bidmc/bidmc_01..03_Numerics.csv` 60 s Welford
//!    window slices (`slice://bidmc/01/t_0000_0060`), community detection, degree
//!    centrality `god_nodes`, `< 1 ms` keyword & shortest-path queries (`< 150` tokens),
//!    and `export_graphify_bundle(repo_root)`.

use crate::adhg_graph::AdhgNodeKind;
use crate::biokg_reasoner::{
    BiomedicalEvidenceDescriptor, EpistemicModality, EvidenceGrade, NormativeClauseId, deontic_flags,
};
use crate::error::CausalGraphError;
use crate::hypergraph_spatial::{AnatomicalRegionId, WelfordAccumulator};
use petgraph::Direction;
use petgraph::stable_graph::{NodeIndex, StableDiGraph};
use petgraph::visit::{EdgeRef, IntoEdgeReferences};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::fs;
use std::path::Path;
use std::time::Instant;

// ---------------------------------------------------------------------------
// Biolink Model predicates & Graphify confidence tiers
// ---------------------------------------------------------------------------

/// Standardized Biolink Model predicates (`https://github.com/biolink/biolink-model`).
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BiolinkPredicate {
    MeasuresBiomarker = 0,
    ShowsEffectSize = 1,
    CausallyDrives = 2,
    CorrelatedWith = 3,
    ExpressedIn = 4,
    MitigatedBy = 5,
    GovernedByShall = 6,
    HasTimeWindowSlice = 7,
}

impl BiolinkPredicate {
    #[inline]
    pub const fn curie(self) -> &'static str {
        match self {
            Self::MeasuresBiomarker => "biolink:measures_biomarker",
            Self::ShowsEffectSize => "biolink:shows_effect_size",
            Self::CausallyDrives => "biolink:causally_drives",
            Self::CorrelatedWith => "biolink:correlated_with",
            Self::ExpressedIn => "biolink:expressed_in",
            Self::MitigatedBy => "biolink:mitigated_by",
            Self::GovernedByShall => "biolink:governed_by_shall",
            Self::HasTimeWindowSlice => "biolink:has_time_window_slice",
        }
    }

    #[inline]
    pub const fn graphify_relation(self) -> &'static str {
        match self {
            Self::MeasuresBiomarker | Self::HasTimeWindowSlice => "shares_data_with",
            Self::ShowsEffectSize | Self::GovernedByShall => "references",
            Self::CausallyDrives | Self::ExpressedIn | Self::MitigatedBy => "conceptually_related_to",
            Self::CorrelatedWith => "semantically_similar_to",
        }
    }
}

/// Graphify confidence tier (never uses 0.5 default).
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GraphifyConfidenceTier {
    Extracted = 0,
    InferredDirect = 1,
    InferredStrong = 2,
    InferredReasonable = 3,
    Ambiguous = 4,
}

impl GraphifyConfidenceTier {
    #[inline]
    pub const fn score(self) -> f32 {
        match self {
            Self::Extracted => 1.00,
            Self::InferredDirect => 0.95,
            Self::InferredStrong => 0.85,
            Self::InferredReasonable => 0.75,
            Self::Ambiguous => 0.25,
        }
    }

    #[inline]
    pub const fn as_graphify_str(self) -> &'static str {
        match self {
            Self::Extracted => "EXTRACTED",
            Self::InferredDirect | Self::InferredStrong | Self::InferredReasonable => "INFERRED",
            Self::Ambiguous => "AMBIGUOUS",
        }
    }
}

/// PrimeKG multimodal precision-medicine node categories (`mims-harvard/PrimeKG`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum PrimeKgCategory {
    Dataset,
    SubjectCohort,
    TimeWindowSlice,
    Biomarker,
    GeneProtein,
    AnatomicalStructure,
    PathologyPhenotype,
    Countermeasure,
    NormativeClause,
}

impl PrimeKgCategory {
    #[inline]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Dataset => "Dataset",
            Self::SubjectCohort => "SubjectCohort",
            Self::TimeWindowSlice => "TimeWindowSlice",
            Self::Biomarker => "Biomarker",
            Self::GeneProtein => "GeneProtein",
            Self::AnatomicalStructure => "AnatomicalStructure",
            Self::PathologyPhenotype => "PathologyPhenotype",
            Self::Countermeasure => "Countermeasure",
            Self::NormativeClause => "NormativeClause",
        }
    }

    #[inline]
    pub const fn graphify_file_type(self) -> &'static str {
        match self {
            Self::Dataset | Self::SubjectCohort | Self::TimeWindowSlice => "document",
            Self::NormativeClause => "rationale",
            Self::Countermeasure => "code",
            Self::Biomarker
            | Self::GeneProtein
            | Self::AnatomicalStructure
            | Self::PathologyPhenotype => "concept",
        }
    }
}

// ---------------------------------------------------------------------------
// Node & Edge structures
// ---------------------------------------------------------------------------

/// Per-channel Welford summary inside a `TimeWindowSlice` node.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ChannelWindowStats {
    pub count: u32,
    pub missing_count: u32,
    pub mean: f64,
    pub std_dev: f64,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

impl ChannelWindowStats {
    pub fn from_welford(acc: &WelfordAccumulator, missing_count: u32) -> Self {
        Self {
            count: acc.count as u32,
            missing_count,
            mean: if acc.count > 0 { acc.mean } else { 0.0 },
            std_dev: acc.sample_std_dev(),
            min: acc.min_value(),
            max: acc.max_value(),
        }
    }
}

/// Typed payload across all 9 PrimeKG categories.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[allow(clippy::large_enum_variant)]
pub enum UnifiedNodePayload {
    Dataset {
        dataset_index: u16,
        code: String,
        agency: String,
        modality: EpistemicModality,
        gravity_regime: String,
        source_url_or_doi: String,
    },
    SubjectCohort {
        dataset_code: String,
        cohort_id: String,
        subject_count: u32,
        duration_days: f32,
        accession_alias: Option<String>,
    },
    TimeWindowSlice {
        record_id: String,
        slice_uri: String,
        start_s: u32,
        end_s: u32,
        hr: ChannelWindowStats,
        pulse: ChannelWindowStats,
        resp: ChannelWindowStats,
        spo2: ChannelWindowStats,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        extra_channels: BTreeMap<String, ChannelWindowStats>,
        #[serde(default)]
        beat_intervals_present: bool,
    },
    Biomarker {
        loinc_curie: String,
        unit: String,
        nominal_baseline: f64,
        critical_threshold: f64,
        bound_adhg_node: Option<AdhgNodeKind>,
    },
    GeneProtein {
        hgnc_curie: String,
        symbol: String,
        aliases: Vec<String>,
        log2_fold_change: f32,
        adj_p_value: f32,
    },
    AnatomicalStructure {
        uberon_curie: String,
        region_id: Option<AnatomicalRegionId>,
        centroid_xyz: [f64; 3],
    },
    PathologyPhenotype {
        ontology_curie: String,
        severity_note: String,
    },
    Countermeasure {
        playbook_id: String,
        playbook_number: u8,
        target_protocol: String,
    },
    NormativeClause {
        clause_id: NormativeClauseId,
        official_code: String,
        shall_summary: String,
    },
}

/// Vertex in `AresUnifiedDatasetGraph`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UnifiedDatasetNode {
    /// Deterministic lowercase `[a-z0-9_]` identifier for `graphify` compatibility.
    pub id: String,
    pub label: String,
    pub category: PrimeKgCategory,
    pub ontology_curie: Option<String>,
    pub file_type: String,
    pub source_file: String,
    pub source_location: Option<String>,
    pub community_id: u16,
    pub descriptor: Option<BiomedicalEvidenceDescriptor>,
    pub payload: UnifiedNodePayload,
}

/// Directed Biolink-typed edge in `AresUnifiedDatasetGraph`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UnifiedDatasetEdge {
    pub predicate: BiolinkPredicate,
    pub predicate_curie: String,
    pub graphify_relation: String,
    pub confidence_tier: GraphifyConfidenceTier,
    pub confidence_score: f32,
    pub effect_size: f32,
    pub source_dataset_id: String,
    pub source_file: String,
}

// ---------------------------------------------------------------------------
// BioCypher-style declarative adapter trait
// ---------------------------------------------------------------------------

/// BioCypher/OntoWeaver-style adapter stats emitted after ingesting a dataset source.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdapterIngestionStats {
    pub nodes_added: usize,
    pub edges_added: usize,
    pub slices_parsed: usize,
    pub missing_samples_observed: usize,
}

/// Declarative BioCypher adapter contract mapping raw files into `AresUnifiedDatasetGraph`.
pub trait DatasetGraphAdapter {
    fn adapter_name(&self) -> &'static str;
    fn ingest(
        &self,
        graph: &mut AresUnifiedDatasetGraph,
    ) -> Result<AdapterIngestionStats, CausalGraphError>;
}

/// Adapter for PhysioNet `BIDMC v1.0.0` numerics CSVs (`bidmc_01..03_Numerics.csv`).
pub struct BidmcCsvAdapter<'a> {
    pub bidmc_dir: &'a Path,
    pub window_seconds: u32,
}

impl<'a> DatasetGraphAdapter for BidmcCsvAdapter<'a> {
    fn adapter_name(&self) -> &'static str {
        "biocypher_bidmc_numerics_csv_v1"
    }

    fn ingest(
        &self,
        graph: &mut AresUnifiedDatasetGraph,
    ) -> Result<AdapterIngestionStats, CausalGraphError> {
        graph.ingest_bidmc_directory(self.bidmc_dir, self.window_seconds)
    }
}

// ---------------------------------------------------------------------------
// Canonical 24-Dataset Catalog
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
struct DatasetSpec {
    index: u16,
    id: &'static str,
    code: &'static str,
    label: &'static str,
    agency: &'static str,
    modality: EpistemicModality,
    gravity_regime: &'static str,
    url: &'static str,
    source_file: &'static str,
    clause: NormativeClauseId,
    region: AnatomicalRegionId,
    loinc_num: u16,
    cohen_d_q8: i16,
    sample_n: u16,
    grade: EvidenceGrade,
    playbook_num: u8,
    flags: u8,
}

const CANONICAL_24_DATASETS: [DatasetSpec; 24] = [
    DatasetSpec {
        index: 1,
        id: "ds_01_osd_51",
        code: "OSD-51",
        label: "OSD-51 (60d HDBR Soleus/VL Transcriptome)",
        agency: "NASA OSDR",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "-6 deg HDBR",
        url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-51",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3002_MusculoskeletalAred,
        region: AnatomicalRegionId::SoleusCalcaneus,
        loinc_num: 8051,
        cohen_d_q8: 282,
        sample_n: 24,
        grade: EvidenceGrade::High,
        playbook_num: 3,
        flags: deontic_flags::GATE3_EVA_SUIT_DAMPING,
    },
    DatasetSpec {
        index: 2,
        id: "ds_02_osd_195",
        code: "OSD-195",
        label: "OSD-195 (21d BedRest Skeletal Muscle Microarray)",
        agency: "NASA OSDR",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "-6 deg HDBR",
        url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-195",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3002_MusculoskeletalAred,
        region: AnatomicalRegionId::SoleusCalcaneus,
        loinc_num: 8053,
        cohen_d_q8: 218,
        sample_n: 24,
        grade: EvidenceGrade::Moderate,
        playbook_num: 3,
        flags: 0,
    },
    DatasetSpec {
        index: 3,
        id: "ds_03_osd_818",
        code: "OSD-818",
        label: "OSD-818 (Ex Vivo Translaminar SANS Model)",
        agency: "NASA OSDR",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "Ex Vivo Translaminar",
        url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-818",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3003_PreventiveMonitoring,
        region: AnatomicalRegionId::EyeOcularSans,
        loinc_num: 8057,
        cohen_d_q8: 294,
        sample_n: 28,
        grade: EvidenceGrade::High,
        playbook_num: 4,
        flags: deontic_flags::GATE2_LBNP_AUTO_VENT,
    },
    DatasetSpec {
        index: 4,
        id: "ds_04_osd_570",
        code: "OSD-570",
        label: "OSD-570 (SpaceX Inspiration4 SOMA Proteomics & cf-mtDNA)",
        agency: "NASA OSDR / Nature SOMA",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "0g Orbital",
        url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-570",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V1_4001_RadiationProtection,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 8054,
        cohen_d_q8: 243,
        sample_n: 4,
        grade: EvidenceGrade::High,
        playbook_num: 5,
        flags: 0,
    },
    DatasetSpec {
        index: 5,
        id: "ds_05_osd_635",
        code: "OSD-635",
        label: "OSD-635 (Spaceflight cfRNA & Endothelial Oxidative Atlas)",
        agency: "NASA OSDR / Nature SOMA",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "0g Orbital",
        url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-635",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V1_3003_PreventiveMonitoring,
        region: AnatomicalRegionId::InternalJugularVein,
        loinc_num: 8055,
        cohen_d_q8: 230,
        sample_n: 12,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: deontic_flags::GATE1_ANTICOAGULANT_LOCK,
    },
    DatasetSpec {
        index: 6,
        id: "ds_06_nasa_0000100",
        code: "NASA-0000100",
        label: "NASA-0000100 (NLSP SMCCP, BRSMFSR, BRSMPT & Tilt)",
        agency: "NASA NLSP",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "0g / HDBR / Tilt",
        url: "https://data.nasa.gov/dataset/NASA-0000100",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V1_3002_MusculoskeletalAred,
        region: AnatomicalRegionId::SoleusCalcaneus,
        loinc_num: 8050,
        cohen_d_q8: 256,
        sample_n: 60,
        grade: EvidenceGrade::High,
        playbook_num: 3,
        flags: deontic_flags::GATE2_LBNP_AUTO_VENT | deontic_flags::GATE3_EVA_SUIT_DAMPING,
    },
    DatasetSpec {
        index: 7,
        id: "ds_07_csa_cans",
        code: "CSA CANS",
        label: "CSA CANS (Compact Autonomous Neutron Spectrometer 2026)",
        agency: "Canadian Space Agency",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "0g ISS / Deep Space",
        url: "https://www.asc-csa.gc.ca/eng/sciences/cans.asp",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V1_4001_RadiationProtection,
        region: AnatomicalRegionId::BrainVestibularCns,
        loinc_num: 8054,
        cohen_d_q8: 346,
        sample_n: 32,
        grade: EvidenceGrade::NormativeMandatory,
        playbook_num: 5,
        flags: deontic_flags::MANDATORY_STORM_SHELTER,
    },
    DatasetSpec {
        index: 8,
        id: "ds_08_bidmc_v1",
        code: "BIDMC v1.0.0",
        label: "BIDMC PPG and Respiration Dataset v1.0.0",
        agency: "PhysioNet (ODC-By-1.0)",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Terrestrial Clinical",
        url: "https://doi.org/10.13026/C2XW26",
        source_file: "data/bidmc/MANIFEST.json",
        clause: NormativeClauseId::V1_3003_PreventiveMonitoring,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 8867,
        cohen_d_q8: 128,
        sample_n: 53,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: 0,
    },
    DatasetSpec {
        index: 9,
        id: "ds_09_mit_bih_arrhythmia",
        code: "MIT-BIH Arrhythmia",
        label: "MIT-BIH Arrhythmia Database (ECG / HRV Benchmark)",
        agency: "PhysioNet",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Terrestrial Clinical",
        url: "https://physionet.org/content/mitdb/1.0.0/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3003_PreventiveMonitoring,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 8040,
        cohen_d_q8: 192,
        sample_n: 47,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: 0,
    },
    DatasetSpec {
        index: 10,
        id: "ds_10_hirid_icu",
        code: "HiRID ICU",
        label: "HiRID High Time-Resolution ICU Deterioration Cohort",
        agency: "PhysioNet / ETH Zurich",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Terrestrial ICU",
        url: "https://physionet.org/content/hirid/1.1.1/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3006_AutonomousCmoSupport,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 8867,
        cohen_d_q8: 256,
        sample_n: 33000,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: 0,
    },
    DatasetSpec {
        index: 11,
        id: "ds_11_mesa_sleep",
        code: "MESA Sleep",
        label: "MESA Multi-Ethnic Study of Atherosclerosis Sleep Cohort",
        agency: "NHLBI / NSRR",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Nocturnal Sleep",
        url: "https://sleepdata.org/datasets/mesa",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V2_6001_AcousticAndCo2Limits,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 2708,
        cohen_d_q8: 154,
        sample_n: 2056,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: 0,
    },
    DatasetSpec {
        index: 12,
        id: "ds_12_shhs",
        code: "SHHS",
        label: "SHHS Sleep Heart Health Study Cardiorespiratory Coupling",
        agency: "NHLBI / NSRR",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Nocturnal Sleep",
        url: "https://sleepdata.org/datasets/shhs",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V2_6001_AcousticAndCo2Limits,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 9279,
        cohen_d_q8: 166,
        sample_n: 5804,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: 0,
    },
    DatasetSpec {
        index: 13,
        id: "ds_13_mars_500",
        code: "MARS-500",
        label: "MARS-500 520-Day Confinement & Circadian Autonomic Analog",
        agency: "IBMP / ESA",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "1g Mars Isolation Analog",
        url: "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Mars500",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3006_AutonomousCmoSupport,
        region: AnatomicalRegionId::BrainVestibularCns,
        loinc_num: 8040,
        cohen_d_q8: 205,
        sample_n: 6,
        grade: EvidenceGrade::Moderate,
        playbook_num: 5,
        flags: 0,
    },
    DatasetSpec {
        index: 14,
        id: "ds_14_sirius_19_21",
        code: "SIRIUS-19/21",
        label: "SIRIUS-19/21 Lunar Isolation Habitat Behavioral & Immune Cohort",
        agency: "NASA HRP / IBMP",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "1g Isolation Analog",
        url: "https://humanresearchroadmap.nasa.gov/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3006_AutonomousCmoSupport,
        region: AnatomicalRegionId::BrainVestibularCns,
        loinc_num: 8040,
        cohen_d_q8: 192,
        sample_n: 12,
        grade: EvidenceGrade::Moderate,
        playbook_num: 5,
        flags: 0,
    },
    DatasetSpec {
        index: 15,
        id: "ds_15_esa_hdbr",
        code: "ESA Head-Down BedRest",
        label: "ESA Head-Down BedRest (BRACE / AGBRESA / Myotones)",
        agency: "ESA / DLR / MEDES",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "-6 deg HDBR + LBNP",
        url: "https://www.esa.int/",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V1_3002_MusculoskeletalAred,
        region: AnatomicalRegionId::SoleusCalcaneus,
        loinc_num: 8051,
        cohen_d_q8: 295,
        sample_n: 48,
        grade: EvidenceGrade::High,
        playbook_num: 4,
        flags: deontic_flags::GATE2_LBNP_AUTO_VENT | deontic_flags::GATE3_EVA_SUIT_DAMPING,
    },
    DatasetSpec {
        index: 16,
        id: "ds_16_look_ahead",
        code: "Look AHEAD",
        label: "Look AHEAD Metabolic & Vascular Aging Baseline",
        agency: "NIDDK / NIH",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "1g Longitudinal Metabolic",
        url: "https://repository.niddk.nih.gov/studies/look-ahead/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3001_CrewHealth,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 8053,
        cohen_d_q8: 140,
        sample_n: 5145,
        grade: EvidenceGrade::High,
        playbook_num: 3,
        flags: 0,
    },
    DatasetSpec {
        index: 17,
        id: "ds_17_gtea",
        code: "GTEA",
        label: "GTEA Egocentric Procedural Activity Benchmark (MedOps ADL)",
        agency: "Georgia Tech",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Procedural Activity",
        url: "https://cbs.ic.gatech.edu/fpv/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V2_10001_CrewInterfaceUsability,
        region: AnatomicalRegionId::BrainVestibularCns,
        loinc_num: 8050,
        cohen_d_q8: 115,
        sample_n: 32,
        grade: EvidenceGrade::Moderate,
        playbook_num: 2,
        flags: 0,
    },
    DatasetSpec {
        index: 18,
        id: "ds_18_ptb_xl",
        code: "PTB-XL",
        label: "PTB-XL Large 12-Lead Electrocardiography Dataset",
        agency: "PhysioNet / PTB",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Clinical 12-Lead ECG",
        url: "https://physionet.org/content/ptb-xl/1.0.3/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3003_PreventiveMonitoring,
        region: AnatomicalRegionId::HeartCardioAutonomic,
        loinc_num: 8867,
        cohen_d_q8: 179,
        sample_n: 18885,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: 0,
    },
    DatasetSpec {
        index: 19,
        id: "ds_19_mimic_iv_demo",
        code: "MIMIC-IV Demo",
        label: "MIMIC-IV Clinical Database Demo (POCUS / Vascular Benchmark)",
        agency: "PhysioNet / MIT LCP",
        modality: EpistemicModality::Pocus,
        gravity_regime: "1g Terrestrial Clinical",
        url: "https://physionet.org/content/mimic-iv-demo/2.2/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::OchmoMtb007VenousThrombosis,
        region: AnatomicalRegionId::InternalJugularVein,
        loinc_num: 8056,
        cohen_d_q8: 310,
        sample_n: 100,
        grade: EvidenceGrade::High,
        playbook_num: 2,
        flags: deontic_flags::GATE1_ANTICOAGULANT_LOCK | deontic_flags::REQUIRES_POCUS_CONFIRMATION,
    },
    DatasetSpec {
        index: 20,
        id: "ds_20_physionet_tilt_table",
        code: "PhysioNet Tilt Table",
        label: "PhysioNet Autonomic & Orthostatic Tilt Table Hemodynamics",
        agency: "PhysioNet",
        modality: EpistemicModality::Telemetry,
        gravity_regime: "1g Head-Up Tilt",
        url: "https://physionet.org/",
        source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
        clause: NormativeClauseId::V1_3003_PreventiveMonitoring,
        region: AnatomicalRegionId::InternalJugularVein,
        loinc_num: 8055,
        cohen_d_q8: 268,
        sample_n: 40,
        grade: EvidenceGrade::High,
        playbook_num: 1,
        flags: deontic_flags::GATE2_LBNP_AUTO_VENT,
    },
    DatasetSpec {
        index: 21,
        id: "ds_21_osdr_rodent_research",
        code: "OSDR Rodent Research RR-1..RR-10",
        label: "OSDR Rodent Research RR-1..RR-10 (incl. OSD-48 & OSD-379)",
        agency: "NASA OSDR",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "0g ISS Rodent",
        url: "https://osdr.nasa.gov/bio/repo/",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V1_3002_MusculoskeletalAred,
        region: AnatomicalRegionId::SoleusCalcaneus,
        loinc_num: 8052,
        cohen_d_q8: 333,
        sample_n: 80,
        grade: EvidenceGrade::High,
        playbook_num: 3,
        flags: 0,
    },
    DatasetSpec {
        index: 22,
        id: "ds_22_lsah_longitudinal",
        code: "LSAH Longitudinal",
        label: "LSAH Longitudinal Study of Astronaut Health (DXA, FRAX, SANS)",
        agency: "NASA JSC",
        modality: EpistemicModality::NormativeStandard,
        gravity_regime: "0g ISS / Shuttle Longitudinal",
        url: "https://lsda.jsc.nasa.gov/",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V2_6026_RenalStoneHydration,
        region: AnatomicalRegionId::SoleusCalcaneus,
        loinc_num: 8052,
        cohen_d_q8: 269,
        sample_n: 360,
        grade: EvidenceGrade::NormativeMandatory,
        playbook_num: 3,
        flags: 0,
    },
    DatasetSpec {
        index: 23,
        id: "ds_23_nsrl_gcr",
        code: "NSRL Galactic Cosmic Ray",
        label: "NSRL Galactic Cosmic Ray (GCR) Sim & Vascular Endothelial Damage",
        agency: "NASA Space Radiation Lab (BNL)",
        modality: EpistemicModality::OmicsPrior,
        gravity_regime: "GCR / SPE Heavy-Ion Beam",
        url: "https://www.bnl.gov/nsrl/",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V1_4001_RadiationProtection,
        region: AnatomicalRegionId::BrainVestibularCns,
        loinc_num: 8054,
        cohen_d_q8: 320,
        sample_n: 96,
        grade: EvidenceGrade::High,
        playbook_num: 5,
        flags: deontic_flags::MANDATORY_STORM_SHELTER,
    },
    DatasetSpec {
        index: 24,
        id: "ds_24_iss_acoustic_env",
        code: "ISS Acoustic/Environmental",
        label: "ISS Acoustic / Environmental (NASA-STD-3001 Vol. 2 & MTB-007)",
        agency: "NASA OCHMO / ISS",
        modality: EpistemicModality::NormativeStandard,
        gravity_regime: "0g ISS Habitability",
        url: "https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2",
        source_file: "docs/scientific_references.md",
        clause: NormativeClauseId::V2_6001_AcousticAndCo2Limits,
        region: AnatomicalRegionId::BrainVestibularCns,
        loinc_num: 8055,
        cohen_d_q8: 256,
        sample_n: 120,
        grade: EvidenceGrade::NormativeMandatory,
        playbook_num: 1,
        flags: deontic_flags::GATE1_ANTICOAGULANT_LOCK | deontic_flags::GATE2_LBNP_AUTO_VENT,
    },
];

// ---------------------------------------------------------------------------
// Graphify export structures & compact FastMCP responses
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphifyNodeJson {
    pub id: String,
    pub label: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ontology_curie: Option<String>,
    pub file_type: String,
    pub source_file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_location: Option<String>,
    pub community: u16,
    pub degree: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphifyLinkJson {
    pub source: String,
    pub target: String,
    pub predicate: String,
    pub relation: String,
    pub confidence: String,
    pub confidence_score: f32,
    pub effect_size: f32,
    pub source_file: String,
    pub weight: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GodNodeSummary {
    pub id: String,
    pub label: String,
    pub category: String,
    pub degree: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphifyExportJson {
    pub directed: bool,
    pub multigraph: bool,
    pub graph: BTreeMap<String, String>,
    pub nodes: Vec<GraphifyNodeJson>,
    pub links: Vec<GraphifyLinkJson>,
    pub communities: BTreeMap<String, Vec<String>>,
    pub god_nodes: Vec<GodNodeSummary>,
    pub hyperedges: Vec<BTreeMap<String, serde_json::Value>>,
}

/// Statistics returned by `.export_graphify_bundle(repo_root)`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GraphifyExportStats {
    pub node_count: usize,
    pub edge_count: usize,
    pub dataset_count: usize,
    pub community_count: usize,
    pub time_window_slice_count: usize,
    pub god_node_ids: Vec<String>,
    pub json_bytes: usize,
}

/// Compact `< 150`-token query result for `FastMCP`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompactGraphQueryResult {
    pub query: String,
    pub latency_us: u64,
    pub matched_id: Option<String>,
    pub category: Option<String>,
    pub ontology_curie: Option<String>,
    pub neighbors: Vec<String>,
    pub slice_uris: Vec<String>,
    pub clauses: Vec<String>,
}

impl CompactGraphQueryResult {
    pub fn to_compact_json(&self) -> Result<String, CausalGraphError> {
        Ok(serde_json::to_string(self)?)
    }
}

/// Compact `< 150`-token shortest-path explanation for `FastMCP`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompactPathExplanation {
    pub from: String,
    pub to: String,
    pub hops: usize,
    pub latency_us: u64,
    pub path_steps: Vec<String>,
}

impl CompactPathExplanation {
    pub fn to_compact_json(&self) -> Result<String, CausalGraphError> {
        Ok(serde_json::to_string(self)?)
    }
}

// ---------------------------------------------------------------------------
// AresUnifiedDatasetGraph
// ---------------------------------------------------------------------------

/// Unified 24-dataset Knowledge Graph on `petgraph::stable_graph::StableDiGraph`.
#[derive(Debug, Clone)]
pub struct AresUnifiedDatasetGraph {
    pub graph: StableDiGraph<UnifiedDatasetNode, UnifiedDatasetEdge>,
    id_index: HashMap<String, NodeIndex>,
    dataset_nodes: Vec<NodeIndex>,
    god_nodes: Vec<GodNodeSummary>,
}

impl Default for AresUnifiedDatasetGraph {
    fn default() -> Self {
        Self::build_core()
    }
}

impl AresUnifiedDatasetGraph {
    /// Builds the unified 24-dataset graph with SPOKE/BioCypher/PrimeKG/Biolink layers
    /// without scanning external CSVs.
    pub fn build_core() -> Self {
        let mut g = Self {
            graph: StableDiGraph::with_capacity(160, 400),
            id_index: HashMap::with_capacity(160),
            dataset_nodes: Vec::with_capacity(24),
            god_nodes: Vec::new(),
        };
        g.populate_core_knowledge_graph();
        g.recompute_communities_and_god_nodes();
        g
    }

    /// Builds the unified 24-dataset graph and dynamically ingests real `bidmc_01..03`
    /// CSV files from `bidmc_dir` (when provided) into `TimeWindowSlice` nodes.
    pub fn build_with_bidmc_dir(bidmc_dir: Option<&Path>) -> Result<Self, CausalGraphError> {
        let mut g = Self::build_core();
        if let Some(dir) = bidmc_dir {
            let adapter = BidmcCsvAdapter {
                bidmc_dir: dir,
                window_seconds: 60,
            };
            adapter.ingest(&mut g)?;
        }
        g.recompute_communities_and_god_nodes();
        Ok(g)
    }

    /// Convenience constructor starting from the repository root (`<repo>/data/bidmc`).
    pub fn build_from_repo_root(repo_root: &Path) -> Result<Self, CausalGraphError> {
        let bidmc_dir = repo_root.join("data").join("bidmc");
        if bidmc_dir.is_dir() {
            Self::build_with_bidmc_dir(Some(&bidmc_dir))
        } else {
            Ok(Self::build_core())
        }
    }

    #[inline]
    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    #[inline]
    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    #[inline]
    pub fn dataset_count(&self) -> usize {
        self.dataset_nodes.len()
    }

    #[inline]
    pub fn god_nodes(&self) -> &[GodNodeSummary] {
        &self.god_nodes
    }

    pub fn dataset_codes(&self) -> Vec<String> {
        self.dataset_nodes
            .iter()
            .filter_map(|&idx| match &self.graph.node_weight(idx)?.payload {
                UnifiedNodePayload::Dataset { code, .. } => Some(code.clone()),
                _ => None,
            })
            .collect()
    }

    pub fn time_window_slice_nodes(&self) -> Vec<&UnifiedDatasetNode> {
        self.graph
            .node_weights()
            .filter(|n| n.category == PrimeKgCategory::TimeWindowSlice)
            .collect()
    }

    /// Looks up a node in the graph by its deterministic string ID.
    #[inline]
    pub fn node_by_id(&self, id: &str) -> Option<&UnifiedDatasetNode> {
        let &idx = self.id_index.get(id)?;
        self.graph.node_weight(idx)
    }

    /// Inserts a new node or updates the existing node payload when `node.id` is already present.
    pub fn upsert_node(&mut self, node: UnifiedDatasetNode) -> NodeIndex {
        if let Some(&existing) = self.id_index.get(&node.id) {
            if let Some(slot) = self.graph.node_weight_mut(existing) {
                let was_ds = slot.category == PrimeKgCategory::Dataset;
                let is_ds = node.category == PrimeKgCategory::Dataset;
                *slot = node;
                if !was_ds && is_ds && !self.dataset_nodes.contains(&existing) {
                    self.dataset_nodes.push(existing);
                }
            }
            return existing;
        }
        self.insert_node(node)
    }

    /// Links two existing nodes identified by string ID using a Biolink-typed edge.
    #[allow(clippy::too_many_arguments)]
    pub fn link_nodes(
        &mut self,
        from_id: &str,
        to_id: &str,
        predicate: BiolinkPredicate,
        tier: GraphifyConfidenceTier,
        effect_size: f32,
        source_dataset_id: &str,
        source_file: &str,
    ) -> Result<(), CausalGraphError> {
        let from = self
            .id_index
            .get(from_id)
            .copied()
            .ok_or_else(|| CausalGraphError::UnknownNode(from_id.to_string()))?;
        let to = self
            .id_index
            .get(to_id)
            .copied()
            .ok_or_else(|| CausalGraphError::UnknownNode(to_id.to_string()))?;
        self.link(
            from,
            to,
            predicate,
            tier,
            effect_size,
            source_dataset_id,
            source_file,
        );
        Ok(())
    }

    fn insert_node(&mut self, node: UnifiedDatasetNode) -> NodeIndex {
        if let Some(&existing) = self.id_index.get(&node.id) {
            return existing;
        }
        let id = node.id.clone();
        let is_ds = node.category == PrimeKgCategory::Dataset;
        let idx = self.graph.add_node(node);
        self.id_index.insert(id, idx);
        if is_ds {
            self.dataset_nodes.push(idx);
        }
        idx
    }

    #[allow(clippy::too_many_arguments)]
    fn link(
        &mut self,
        from: NodeIndex,
        to: NodeIndex,
        predicate: BiolinkPredicate,
        tier: GraphifyConfidenceTier,
        effect_size: f32,
        source_dataset_id: &str,
        source_file: &str,
    ) {
        self.graph.add_edge(
            from,
            to,
            UnifiedDatasetEdge {
                predicate,
                predicate_curie: predicate.curie().to_string(),
                graphify_relation: predicate.graphify_relation().to_string(),
                confidence_tier: tier,
                confidence_score: tier.score(),
                effect_size,
                source_dataset_id: source_dataset_id.to_string(),
                source_file: source_file.to_string(),
            },
        );
    }

    fn populate_core_knowledge_graph(&mut self) {
        // 1. All 24 cataloged datasets.
        let mut ds_by_code: HashMap<&'static str, NodeIndex> = HashMap::with_capacity(24);
        for spec in CANONICAL_24_DATASETS {
            let desc = BiomedicalEvidenceDescriptor::new(
                spec.index,
                spec.clause.numeric_id(),
                spec.loinc_num,
                spec.region.uberon_numeric(),
                spec.cohen_d_q8,
                spec.sample_n,
                spec.grade as u8,
                spec.playbook_num,
                spec.flags,
            );
            let idx = self.insert_node(UnifiedDatasetNode {
                id: spec.id.to_string(),
                label: spec.label.to_string(),
                category: PrimeKgCategory::Dataset,
                ontology_curie: Some(format!("ARES_DS:{:02}", spec.index)),
                file_type: PrimeKgCategory::Dataset.graphify_file_type().to_string(),
                source_file: spec.source_file.to_string(),
                source_location: Some(spec.url.to_string()),
                community_id: 0,
                descriptor: Some(desc),
                payload: UnifiedNodePayload::Dataset {
                    dataset_index: spec.index,
                    code: spec.code.to_string(),
                    agency: spec.agency.to_string(),
                    modality: spec.modality,
                    gravity_regime: spec.gravity_regime.to_string(),
                    source_url_or_doi: spec.url.to_string(),
                },
            });
            ds_by_code.insert(spec.code, idx);
        }

        // 2. Anatomical structures (UBERON: grounded).
        let mut anat_nodes: HashMap<&'static str, NodeIndex> = HashMap::new();
        for region in AnatomicalRegionId::ALL {
            let id = format!("anat_{}", region.heatmap_key());
            let curie = region.uberon_curie();
            let idx = self.insert_node(UnifiedDatasetNode {
                id,
                label: format!("{} ({curie})", region.label()),
                category: PrimeKgCategory::AnatomicalStructure,
                ontology_curie: Some(curie.to_string()),
                file_type: PrimeKgCategory::AnatomicalStructure.graphify_file_type().to_string(),
                source_file: "crates/ares-causal-graph/src/hypergraph_spatial.rs".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::AnatomicalStructure {
                    uberon_curie: curie.to_string(),
                    region_id: Some(region),
                    centroid_xyz: region.normalized_centroid_3d(),
                },
            });
            anat_nodes.insert(curie, idx);
        }
        for (id, label, curie, xyz) in [
            ("anat_calcaneus", "Calcaneus Bone (UBERON:0001450)", "UBERON:0001450", [0.0, -0.78, -0.05]),
            ("anat_optic_nerve_sheath", "Optic Nerve Sheath (UBERON:0000964)", "UBERON:0000964", [0.0, 0.83, 0.02]),
            ("anat_bone_marrow", "Bone Marrow (UBERON:0002371)", "UBERON:0002371", [0.0, 0.10, -0.02]),
            ("anat_kidney", "Kidney / Renal Pelvis (UBERON:0002113)", "UBERON:0002113", [0.08, 0.15, -0.04]),
        ] {
            let idx = self.insert_node(UnifiedDatasetNode {
                id: id.to_string(),
                label: label.to_string(),
                category: PrimeKgCategory::AnatomicalStructure,
                ontology_curie: Some(curie.to_string()),
                file_type: PrimeKgCategory::AnatomicalStructure.graphify_file_type().to_string(),
                source_file: "crates/ares-causal-graph/src/dataset_graph.rs".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::AnatomicalStructure {
                    uberon_curie: curie.to_string(),
                    region_id: None,
                    centroid_xyz: xyz,
                },
            });
            anat_nodes.insert(curie, idx);
        }

        // 3. Clinical biomarkers (LOINC: grounded).
        let mut bm_nodes: HashMap<&'static str, NodeIndex> = HashMap::new();
        for (id, label, loinc, unit, nom, crit, adhg, anat_curie) in [
            ("bm_hr", "Heart Rate (HR)", "LOINC:8867-4", "bpm", 68.0, 115.0, None, "UBERON:0000948"),
            ("bm_pulse", "Pulse Rate (PULSE)", "LOINC:8889-8", "bpm", 68.0, 115.0, None, "UBERON:0000948"),
            ("bm_resp", "Respiratory Rate (RESP)", "LOINC:9279-1", "brpm", 14.0, 28.0, None, "UBERON:0000948"),
            ("bm_spo2", "Oxygen Saturation (SpO2)", "LOINC:2708-6", "%", 98.0, 90.0, None, "UBERON:0000948"),
            ("bm_rmssd", "HRV RMSSD", "LOINC:80404-7", "ms", 48.0, 20.0, None, "UBERON:0000948"),
            ("bm_tau_w", "IJV Wall Shear Stress (tau_w)", "LOINC:99001-1", "dyn/cm^2", 2.8, 1.2, Some(AdhgNodeKind::IjvVenousStasisShearStress), "UBERON:0001586"),
            ("bm_sost", "Serum Sclerostin (SOST)", "LOINC:99002-9", "pmol/L", 24.0, 55.0, Some(AdhgNodeKind::OsteocyteSclerostinSost), "UBERON:0001450"),
            ("bm_mqi", "Soleus Muscle Quality Index (MQI)", "LOINC:99003-7", "ratio", 0.90, 0.55, Some(AdhgNodeKind::SoleusMuscleQualityMqi), "UBERON:0001389"),
            ("bm_sans_onsd", "SANS Optic Nerve Sheath / Translaminar Index", "LOINC:99004-5", "index", 0.15, 0.70, Some(AdhgNodeKind::SansTranslaminarGradient), "UBERON:0000970"),
            ("bm_cans_rad", "CSA CANS Neutron Dose Rate", "LOINC:99005-2", "mSv/d", 0.40, 1.50, Some(AdhgNodeKind::CansRadiationOxidativeStress), "UBERON:0000955"),
            ("bm_gai", "Martian 0.38g Gait Asymmetry Index (GAI)", "LOINC:99006-0", "%", 2.0, 12.0, Some(AdhgNodeKind::AredMechanicalLoad), "UBERON:0001389"),
        ] {
            let idx = self.insert_node(UnifiedDatasetNode {
                id: id.to_string(),
                label: label.to_string(),
                category: PrimeKgCategory::Biomarker,
                ontology_curie: Some(loinc.to_string()),
                file_type: PrimeKgCategory::Biomarker.graphify_file_type().to_string(),
                source_file: "crates/ares-core-types/src/constants.rs".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::Biomarker {
                    loinc_curie: loinc.to_string(),
                    unit: unit.to_string(),
                    nominal_baseline: nom,
                    critical_threshold: crit,
                    bound_adhg_node: adhg,
                },
            });
            bm_nodes.insert(id, idx);
            if let Some(&anat_idx) = anat_nodes.get(anat_curie) {
                self.link(
                    idx,
                    anat_idx,
                    BiolinkPredicate::CorrelatedWith,
                    GraphifyConfidenceTier::Extracted,
                    1.0,
                    "ARES_CORE",
                    "crates/ares-causal-graph/src/dataset_graph.rs",
                );
            }
        }

        // 4. Spaceflight Pathologies / Phenotypes (MONDO: / HP: grounded).
        let mut pheno_nodes: HashMap<&'static str, NodeIndex> = HashMap::new();
        for (id, label, curie, note, anat_curie) in [
            ("pheno_ijv_thrombosis", "Internal Jugular Venous Thrombosis (HP:0004936)", "HP:0004936", "Stagnant/retrograde IJV flow in 0g (Marshall-Goebel 2019)", "UBERON:0001586"),
            ("pheno_sans_papilledema", "SANS / Optic Disc Edema (HP:0001085)", "HP:0001085", "Cephalad fluid shift & translaminar gradient (OSD-818)", "UBERON:0000970"),
            ("pheno_sarcopenia", "Soleus Skeletal Muscle Atrophy (HP:0003202)", "HP:0003202", "Type-I myofiber unloading (OSD-51 / Myotones)", "UBERON:0001389"),
            ("pheno_osteopenia", "Microgravity Osteoporosis / Osteopenia (MONDO:0005298)", "MONDO:0005298", "Frost mechanostat < 1000 ue -> SOST up-regulation", "UBERON:0001450"),
            ("pheno_nephrolithiasis", "Hypercalciuric Nephrolithiasis (MONDO:0005525)", "MONDO:0005525", "Osteocytic calcium efflux -> renal stone risk", "UBERON:0002113"),
            ("pheno_vestibular_ataxia", "Vestibular Reweighting & Gait Asymmetry (HP:0002321)", "HP:0002321", "0.38g surface transition gait instability (GAI > 12%)", "UBERON:0000955"),
            ("pheno_orthostatic_intolerance", "Post-Flight Orthostatic Intolerance (HP:0001278)", "HP:0001278", "Autonomic & venous compliance shift", "UBERON:0000948"),
            ("pheno_radiation_ros", "Space Radiation Endothelial Oxidative Stress (MONDO:0005083)", "MONDO:0005083", "Neutron / GCR ROS & glycocalyx degradation", "UBERON:0001586"),
        ] {
            let idx = self.insert_node(UnifiedDatasetNode {
                id: id.to_string(),
                label: label.to_string(),
                category: PrimeKgCategory::PathologyPhenotype,
                ontology_curie: Some(curie.to_string()),
                file_type: PrimeKgCategory::PathologyPhenotype.graphify_file_type().to_string(),
                source_file: "docs/scientific_references.md".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::PathologyPhenotype {
                    ontology_curie: curie.to_string(),
                    severity_note: note.to_string(),
                },
            });
            pheno_nodes.insert(id, idx);
            if let Some(&anat_idx) = anat_nodes.get(anat_curie) {
                self.link(
                    idx,
                    anat_idx,
                    BiolinkPredicate::CorrelatedWith,
                    GraphifyConfidenceTier::Extracted,
                    0.95,
                    "ARES_BIOPATH",
                    "docs/scientific_references.md",
                );
            }
        }

        // 5. Differentially Expressed Genes / Proteins (HGNC: grounded, SPOKE + GeneLab).
        struct GeneSpec {
            id: &'static str,
            symbol: &'static str,
            aliases: &'static [&'static str],
            hgnc: &'static str,
            log2fc: f32,
            fdr: f32,
            studies: &'static [&'static str],
            anat: &'static str,
            pheno: &'static str,
        }
        let genes = [
            GeneSpec { id: "gene_sost", symbol: "SOST", aliases: &["Sclerostin"], hgnc: "HGNC:13771", log2fc: 1.85, fdr: 0.002, studies: &["OSD-51", "OSDR Rodent Research RR-1..RR-10", "LSAH Longitudinal"], anat: "UBERON:0001450", pheno: "pheno_osteopenia" },
            GeneSpec { id: "gene_rankl", symbol: "RANKL", aliases: &["TNFSF11"], hgnc: "HGNC:11926", log2fc: 1.62, fdr: 0.004, studies: &["OSD-51", "OSDR Rodent Research RR-1..RR-10"], anat: "UBERON:0001450", pheno: "pheno_osteopenia" },
            GeneSpec { id: "gene_vegfa", symbol: "VEGFA", aliases: &["VEGF"], hgnc: "HGNC:12680", log2fc: 1.38, fdr: 0.008, studies: &["OSD-818", "OSD-570", "OSD-635"], anat: "UBERON:0000970", pheno: "pheno_sans_papilledema" },
            GeneSpec { id: "gene_icam1", symbol: "ICAM1", aliases: &["CD54"], hgnc: "HGNC:5344", log2fc: 1.54, fdr: 0.003, studies: &["OSD-570", "OSD-635", "NSRL Galactic Cosmic Ray"], anat: "UBERON:0001586", pheno: "pheno_ijv_thrombosis" },
            GeneSpec { id: "gene_nos3", symbol: "NOS3", aliases: &["eNOS"], hgnc: "HGNC:7876", log2fc: -1.41, fdr: 0.006, studies: &["OSD-195", "OSD-635", "NSRL Galactic Cosmic Ray"], anat: "UBERON:0001586", pheno: "pheno_ijv_thrombosis" },
            GeneSpec { id: "gene_hif1a", symbol: "HIF1A", aliases: &["HIF-1alpha"], hgnc: "HGNC:4910", log2fc: 1.47, fdr: 0.005, studies: &["OSD-818", "OSD-570", "CSA CANS"], anat: "UBERON:0000970", pheno: "pheno_sans_papilledema" },
            GeneSpec { id: "gene_il6", symbol: "IL6", aliases: &["IL-6"], hgnc: "HGNC:6018", log2fc: 1.72, fdr: 0.002, studies: &["OSD-570", "OSD-635", "SIRIUS-19/21"], anat: "UBERON:0000948", pheno: "pheno_radiation_ros" },
            GeneSpec { id: "gene_col1a1", symbol: "COL1A1", aliases: &["Collagen-1A1"], hgnc: "HGNC:2197", log2fc: -1.29, fdr: 0.011, studies: &["OSD-51", "OSD-195", "OSDR Rodent Research RR-1..RR-10"], anat: "UBERON:0001450", pheno: "pheno_osteopenia" },
            GeneSpec { id: "gene_acta1", symbol: "ACTA1", aliases: &["Skeletal Actin"], hgnc: "HGNC:129", log2fc: -1.58, fdr: 0.004, studies: &["OSD-51", "OSD-195", "ESA Head-Down BedRest"], anat: "UBERON:0001389", pheno: "pheno_sarcopenia" },
            GeneSpec { id: "gene_myh7", symbol: "MYH7", aliases: &["Slow Myosin Heavy Chain"], hgnc: "HGNC:7577", log2fc: -1.94, fdr: 0.001, studies: &["OSD-51", "ESA Head-Down BedRest"], anat: "UBERON:0001389", pheno: "pheno_sarcopenia" },
            GeneSpec { id: "gene_ppargc1a", symbol: "PPARGC1A", aliases: &["PGC-1alpha"], hgnc: "HGNC:9237", log2fc: -1.65, fdr: 0.003, studies: &["OSD-51", "OSD-195", "Look AHEAD"], anat: "UBERON:0001389", pheno: "pheno_sarcopenia" },
            GeneSpec { id: "gene_bdnf", symbol: "BDNF", aliases: &["Brain-Derived Neurotrophic Factor"], hgnc: "HGNC:1033", log2fc: -1.22, fdr: 0.014, studies: &["MARS-500", "SIRIUS-19/21", "OSDR Rodent Research RR-1..RR-10"], anat: "UBERON:0000955", pheno: "pheno_vestibular_ataxia" },
        ];
        for g in genes {
            let g_idx = self.insert_node(UnifiedDatasetNode {
                id: g.id.to_string(),
                label: format!("{} ({})", g.symbol, g.hgnc),
                category: PrimeKgCategory::GeneProtein,
                ontology_curie: Some(g.hgnc.to_string()),
                file_type: PrimeKgCategory::GeneProtein.graphify_file_type().to_string(),
                source_file: "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::GeneProtein {
                    hgnc_curie: g.hgnc.to_string(),
                    symbol: g.symbol.to_string(),
                    aliases: g.aliases.iter().map(|s| (*s).to_string()).collect(),
                    log2_fold_change: g.log2fc,
                    adj_p_value: g.fdr,
                },
            });
            for study_code in g.studies {
                if let Some(&ds_idx) = ds_by_code.get(study_code) {
                    self.link(
                        ds_idx,
                        g_idx,
                        BiolinkPredicate::ShowsEffectSize,
                        GraphifyConfidenceTier::Extracted,
                        g.log2fc,
                        study_code,
                        "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
                    );
                }
            }
            if let Some(&anat_idx) = anat_nodes.get(g.anat) {
                self.link(
                    g_idx,
                    anat_idx,
                    BiolinkPredicate::ExpressedIn,
                    GraphifyConfidenceTier::Extracted,
                    g.log2fc.abs(),
                    "NASA_OSDR_SPOKE",
                    "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
                );
            }
            if let Some(&pheno_idx) = pheno_nodes.get(g.pheno) {
                self.link(
                    g_idx,
                    pheno_idx,
                    BiolinkPredicate::CausallyDrives,
                    GraphifyConfidenceTier::InferredStrong,
                    g.log2fc.abs(),
                    "NASA_OSDR_SPOKE",
                    "docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md",
                );
            }
        }

        // 6. SubjectCohort nodes including OSD-48 and OSD-379 (GeneLab / RR-1..RR-10).
        for (id, label, ds_code, cohort_id, subj_n, days, alias) in [
            ("cohort_osd_48", "OSDR Study OSD-48 (RR-1 Rodent Soleus & Bone)", "OSDR Rodent Research RR-1..RR-10", "OSD-48", 20, 37.0, Some("OSD-48")),
            ("cohort_osd_379", "OSDR Study OSD-379 (RR-10 Osteocyte & Vascular)", "OSDR Rodent Research RR-1..RR-10", "OSD-379", 20, 30.0, Some("OSD-379")),
            ("cohort_osd_51_wise", "OSD-51 WISE-2005 60d Female HDBR Cohort", "OSD-51", "WISE-60d", 24, 60.0, None),
            ("cohort_bidmc_01_03", "BIDMC v1.0.0 Recorded ICU Validation Cohort (01..03)", "BIDMC v1.0.0", "bidmc_01..03", 3, 0.0056, None),
        ] {
            let c_idx = self.insert_node(UnifiedDatasetNode {
                id: id.to_string(),
                label: label.to_string(),
                category: PrimeKgCategory::SubjectCohort,
                ontology_curie: alias.map(|a| format!("OSDR:{a}")),
                file_type: PrimeKgCategory::SubjectCohort.graphify_file_type().to_string(),
                source_file: "docs/scientific_references.md".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::SubjectCohort {
                    dataset_code: ds_code.to_string(),
                    cohort_id: cohort_id.to_string(),
                    subject_count: subj_n,
                    duration_days: days,
                    accession_alias: alias.map(str::to_string),
                },
            });
            if let Some(&ds_idx) = ds_by_code.get(ds_code) {
                self.link(
                    ds_idx,
                    c_idx,
                    BiolinkPredicate::CorrelatedWith,
                    GraphifyConfidenceTier::Extracted,
                    1.0,
                    ds_code,
                    "docs/scientific_references.md",
                );
            }
        }
        // Connect OSD-48 and OSD-379 cohorts directly to SOST & ACTA1.
        if let (Some(c48), Some(acta)) = (self.id_index.get("cohort_osd_48").copied(), self.id_index.get("gene_acta1").copied()) {
            self.link(c48, acta, BiolinkPredicate::ShowsEffectSize, GraphifyConfidenceTier::Extracted, -1.58, "OSD-48", "docs/scientific_references.md");
        }
        if let (Some(c379), Some(sost)) = (self.id_index.get("cohort_osd_379").copied(), self.id_index.get("gene_sost").copied()) {
            self.link(c379, sost, BiolinkPredicate::ShowsEffectSize, GraphifyConfidenceTier::Extracted, 1.85, "OSD-379", "docs/scientific_references.md");
        }

        // 7. Countermeasures (MedOps Playbooks #01-#05).
        let mut pb_nodes: HashMap<u8, NodeIndex> = HashMap::new();
        for (num, id, pb_id, label, target, pheno_id) in [
            (1u8, "cm_playbook_01", "PLAYBOOK_01_VENOUS_STASIS_LBNP", "Playbook #01: IJV Stasis LBNP (-30 mmHg) + Calf Pump", "LBNP -30 mmHg <= 45 min + bilateral POCUS check", "pheno_ijv_thrombosis"),
            (2u8, "cm_playbook_02", "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS", "Playbook #02: POCUS-Confirmed IJV Thrombus Anticoagulation", "Weight-adjusted Enoxaparin/Apixaban (Gate 1 unlocked)", "pheno_ijv_thrombosis"),
            (3u8, "cm_playbook_03", "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED", "Playbook #03: ARED >= 125 kgf + Hydration/Citrate", "Frost > 1000 ue loading + 2.8 L/d potassium citrate", "pheno_osteopenia"),
            (4u8, "cm_playbook_04", "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION", "Playbook #04: SANS Venous Thigh Cuffs + Nocturnal LBNP", "50 mmHg thigh cuffs + translaminar decongestion", "pheno_sans_papilledema"),
            (5u8, "cm_playbook_05", "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS", "Playbook #05: CSA CANS SPE Storm Shelter Protocol", "Mandatory Storm Shelter relocation + endothelial antioxidant", "pheno_radiation_ros"),
        ] {
            let idx = self.insert_node(UnifiedDatasetNode {
                id: id.to_string(),
                label: label.to_string(),
                category: PrimeKgCategory::Countermeasure,
                ontology_curie: Some(format!("ARES_PB:{pb_id}")),
                file_type: PrimeKgCategory::Countermeasure.graphify_file_type().to_string(),
                source_file: "crates/ares-medops-playbooks/src/playbooks.rs".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::Countermeasure {
                    playbook_id: pb_id.to_string(),
                    playbook_number: num,
                    target_protocol: target.to_string(),
                },
            });
            pb_nodes.insert(num, idx);
            if let Some(&pheno_idx) = pheno_nodes.get(pheno_id) {
                self.link(
                    pheno_idx,
                    idx,
                    BiolinkPredicate::MitigatedBy,
                    GraphifyConfidenceTier::Extracted,
                    0.90,
                    pb_id,
                    "crates/ares-medops-playbooks/src/playbooks.rs",
                );
            }
        }

        // 8. Normative Clauses (NASA-STD-3001 Vol. 1 & 2 + MTB-007).
        let mut clause_nodes: HashMap<NormativeClauseId, NodeIndex> = HashMap::new();
        for clause in NormativeClauseId::ALL {
            let id = format!("std_clause_{}", clause.numeric_id());
            let code = clause.official_code();
            let idx = self.insert_node(UnifiedDatasetNode {
                id,
                label: format!("{code}: {}", clause.summary()),
                category: PrimeKgCategory::NormativeClause,
                ontology_curie: Some(code.to_string()),
                file_type: PrimeKgCategory::NormativeClause.graphify_file_type().to_string(),
                source_file: "crates/ares-causal-graph/src/biokg_reasoner.rs".to_string(),
                source_location: None,
                community_id: 0,
                descriptor: None,
                payload: UnifiedNodePayload::NormativeClause {
                    clause_id: clause,
                    official_code: code.to_string(),
                    shall_summary: clause.summary().to_string(),
                },
            });
            clause_nodes.insert(clause, idx);
        }

        // 9. Connect every one of the 24 datasets to its biomarkers, anatomical organ,
        //    normative clause, and Playbook so no dataset is isolated.
        for spec in CANONICAL_24_DATASETS {
            let Some(&ds_idx) = ds_by_code.get(spec.code) else {
                continue;
            };
            if let Some(&anat_idx) = anat_nodes.get(spec.region.uberon_curie()) {
                self.link(
                    ds_idx,
                    anat_idx,
                    BiolinkPredicate::CorrelatedWith,
                    GraphifyConfidenceTier::Extracted,
                    (spec.cohen_d_q8 as f32) / 256.0,
                    spec.code,
                    spec.source_file,
                );
            }
            if let Some(&clause_idx) = clause_nodes.get(&spec.clause) {
                self.link(
                    ds_idx,
                    clause_idx,
                    BiolinkPredicate::GovernedByShall,
                    GraphifyConfidenceTier::Extracted,
                    1.0,
                    spec.code,
                    spec.source_file,
                );
            }
            if let Some(&pb_idx) = pb_nodes.get(&spec.playbook_num) {
                self.link(
                    ds_idx,
                    pb_idx,
                    BiolinkPredicate::MitigatedBy,
                    GraphifyConfidenceTier::InferredDirect,
                    (spec.cohen_d_q8 as f32) / 256.0,
                    spec.code,
                    spec.source_file,
                );
            }
            let bm_key = match spec.loinc_num {
                8867 => "bm_hr",
                8889 => "bm_pulse",
                9279 => "bm_resp",
                2708 => "bm_spo2",
                8040 => "bm_rmssd",
                8050 => "bm_gai",
                8051 => "bm_mqi",
                8052 => "bm_sost",
                8054 => "bm_cans_rad",
                8057 => "bm_sans_onsd",
                _ => "bm_tau_w",
            };
            if let Some(&bm_idx) = bm_nodes.get(bm_key) {
                self.link(
                    ds_idx,
                    bm_idx,
                    BiolinkPredicate::MeasuresBiomarker,
                    GraphifyConfidenceTier::Extracted,
                    (spec.cohen_d_q8 as f32) / 256.0,
                    spec.code,
                    spec.source_file,
                );
            }
        }

        // Link BIDMC v1.0.0 specifically to all 4 bedside waveform channels (HR, PULSE, RESP, SpO2).
        if let Some(&bidmc_idx) = ds_by_code.get("BIDMC v1.0.0") {
            for bm in ["bm_pulse", "bm_resp", "bm_spo2"] {
                if let Some(&bm_idx) = bm_nodes.get(bm) {
                    self.link(
                        bidmc_idx,
                        bm_idx,
                        BiolinkPredicate::MeasuresBiomarker,
                        GraphifyConfidenceTier::Extracted,
                        1.0,
                        "BIDMC v1.0.0",
                        "data/bidmc/MANIFEST.json",
                    );
                }
            }
        }

        // Cross-phenotype causal drives for shortest-path clinical reasoning.
        if let (Some(sarc), Some(osteo)) = (pheno_nodes.get("pheno_sarcopenia").copied(), pheno_nodes.get("pheno_osteopenia").copied()) {
            self.link(sarc, osteo, BiolinkPredicate::CausallyDrives, GraphifyConfidenceTier::InferredStrong, 0.85, "OSD-51", "docs/scientific_references.md");
        }
        if let (Some(osteo), Some(neph)) = (pheno_nodes.get("pheno_osteopenia").copied(), pheno_nodes.get("pheno_nephrolithiasis").copied()) {
            self.link(osteo, neph, BiolinkPredicate::CausallyDrives, GraphifyConfidenceTier::Extracted, 0.88, "LSAH Longitudinal", "docs/scientific_references.md");
        }
        if let (Some(rad), Some(thromb)) = (pheno_nodes.get("pheno_radiation_ros").copied(), pheno_nodes.get("pheno_ijv_thrombosis").copied()) {
            self.link(rad, thromb, BiolinkPredicate::CausallyDrives, GraphifyConfidenceTier::InferredStrong, 0.80, "CSA CANS", "docs/scientific_references.md");
        }
        if let (Some(thromb), Some(sans)) = (pheno_nodes.get("pheno_ijv_thrombosis").copied(), pheno_nodes.get("pheno_sans_papilledema").copied()) {
            self.link(thromb, sans, BiolinkPredicate::CausallyDrives, GraphifyConfidenceTier::InferredDirect, 0.82, "OSD-818", "docs/scientific_references.md");
        }
    }

    /// Dynamically parses `bidmc_01_Numerics.csv`, `bidmc_02_Numerics.csv`, and
    /// `bidmc_03_Numerics.csv` in `bidmc_dir` into `window_seconds` Welford slices.
    pub fn ingest_bidmc_directory(
        &mut self,
        bidmc_dir: &Path,
        window_seconds: u32,
    ) -> Result<AdapterIngestionStats, CausalGraphError> {
        if window_seconds == 0 {
            return Err(CausalGraphError::InvalidArgument {
                name: "window_seconds",
                reason: "must be > 0".to_string(),
            });
        }
        let mut stats = AdapterIngestionStats::default();
        let bidmc_ds_idx = self.id_index.get("ds_08_bidmc_v1").copied();

        for rec in ["01", "02", "03"] {
            let filename = format!("bidmc_{rec}_Numerics.csv");
            let file_path = bidmc_dir.join(&filename);
            if !file_path.exists() {
                continue;
            }
            let content = fs::read_to_string(&file_path)
                .map_err(|e| CausalGraphError::io(&file_path, e))?;
            let rows = parse_bidmc_numerics_csv(&filename, &content)?;
            let mut by_window: BTreeMap<u32, Vec<BidmcRow>> = BTreeMap::new();
            for r in rows {
                let w_idx = r.time_s / window_seconds;
                by_window.entry(w_idx).or_default().push(r);
            }

            let source_rel = format!("data/bidmc/{filename}");
            for (w_idx, w_rows) in by_window {
                let start_s = w_idx * window_seconds;
                let end_s = start_s + window_seconds;
                let mut hr_acc = WelfordAccumulator::new();
                let mut pulse_acc = WelfordAccumulator::new();
                let mut resp_acc = WelfordAccumulator::new();
                let mut spo2_acc = WelfordAccumulator::new();
                let (mut hr_miss, mut pulse_miss, mut resp_miss, mut spo2_miss) = (0u32, 0u32, 0u32, 0u32);

                for row in &w_rows {
                    match row.hr { Some(v) => { hr_acc.update(v); } None => { hr_miss += 1; } }
                    match row.pulse { Some(v) => { pulse_acc.update(v); } None => { pulse_miss += 1; } }
                    match row.resp { Some(v) => { resp_acc.update(v); } None => { resp_miss += 1; } }
                    match row.spo2 { Some(v) => { spo2_acc.update(v); } None => { spo2_miss += 1; } }
                }
                let missing_total = (hr_miss + pulse_miss + resp_miss + spo2_miss) as usize;
                stats.missing_samples_observed += missing_total;

                let node_id = format!("slice_bidmc_{rec}_t_{start_s:04}_{end_s:04}");
                let slice_uri = format!("slice://bidmc/{rec}/t_{start_s:04}_{end_s:04}");
                let node_idx = self.insert_node(UnifiedDatasetNode {
                    id: node_id,
                    label: format!("BIDMC {rec} [{start_s}..{end_s}s] ({slice_uri})"),
                    category: PrimeKgCategory::TimeWindowSlice,
                    ontology_curie: Some(slice_uri.clone()),
                    file_type: PrimeKgCategory::TimeWindowSlice.graphify_file_type().to_string(),
                    source_file: source_rel.clone(),
                    source_location: Some(slice_uri.clone()),
                    community_id: 0,
                    descriptor: None,
                    payload: UnifiedNodePayload::TimeWindowSlice {
                        record_id: format!("bidmc_{rec}"),
                        slice_uri,
                        start_s,
                        end_s,
                        hr: ChannelWindowStats::from_welford(&hr_acc, hr_miss),
                        pulse: ChannelWindowStats::from_welford(&pulse_acc, pulse_miss),
                        resp: ChannelWindowStats::from_welford(&resp_acc, resp_miss),
                        spo2: ChannelWindowStats::from_welford(&spo2_acc, spo2_miss),
                        extra_channels: BTreeMap::new(),
                        beat_intervals_present: false,
                    },
                });
                stats.nodes_added += 1;
                stats.slices_parsed += 1;

                if let Some(ds_idx) = bidmc_ds_idx {
                    self.link(
                        ds_idx,
                        node_idx,
                        BiolinkPredicate::HasTimeWindowSlice,
                        GraphifyConfidenceTier::Extracted,
                        1.0,
                        "BIDMC v1.0.0",
                        &source_rel,
                    );
                    stats.edges_added += 1;
                }
                for (bm_id, miss) in [
                    ("bm_hr", hr_miss),
                    ("bm_pulse", pulse_miss),
                    ("bm_resp", resp_miss),
                    ("bm_spo2", spo2_miss),
                ] {
                    if let Some(&bm_idx) = self.id_index.get(bm_id) {
                        let tier = if miss > 0 {
                            GraphifyConfidenceTier::InferredDirect
                        } else {
                            GraphifyConfidenceTier::Extracted
                        };
                        self.link(
                            node_idx,
                            bm_idx,
                            BiolinkPredicate::MeasuresBiomarker,
                            tier,
                            1.0,
                            "BIDMC v1.0.0",
                            &source_rel,
                        );
                        stats.edges_added += 1;
                    }
                }
            }
        }
        Ok(stats)
    }

    /// Assigns community IDs via deterministic synchronous label propagation (undirected
    /// projection) and ranks `god_nodes` by total degree centrality (`in_degree + out_degree`).
    pub fn recompute_communities_and_god_nodes(&mut self) {
        let indices: Vec<NodeIndex> = self.graph.node_indices().collect();
        if indices.is_empty() {
            self.god_nodes.clear();
            return;
        }
        let mut labels: HashMap<NodeIndex, u16> = HashMap::with_capacity(indices.len());
        for (pos, &idx) in indices.iter().enumerate() {
            labels.insert(idx, pos as u16);
        }

        // 8 passes of deterministic label propagation using neighbor majority (tie-break smallest ID).
        for _ in 0..8 {
            let mut next = labels.clone();
            let mut changed = false;
            for &idx in &indices {
                let mut counts: BTreeMap<u16, usize> = BTreeMap::new();
                for n in self.graph.neighbors_undirected(idx) {
                    if let Some(&lbl) = labels.get(&n) {
                        *counts.entry(lbl).or_insert(0) += 1;
                    }
                }
                if let Some((&best_lbl, _)) = counts
                    .iter()
                    .max_by(|(la, ca), (lb, cb)| ca.cmp(cb).then_with(|| lb.cmp(la)))
                    && labels.get(&idx).copied() != Some(best_lbl)
                {
                    next.insert(idx, best_lbl);
                    changed = true;
                }
            }
            labels = next;
            if !changed {
                break;
            }
        }

        // Normalize community IDs to dense 0..K ordered by size descending.
        let mut by_raw: BTreeMap<u16, Vec<NodeIndex>> = BTreeMap::new();
        for &idx in &indices {
            let raw = labels.get(&idx).copied().unwrap_or(0);
            by_raw.entry(raw).or_default().push(idx);
        }
        let mut groups: Vec<Vec<NodeIndex>> = by_raw.into_values().collect();
        groups.sort_by_key(|a| std::cmp::Reverse(a.len()));
        for (cid, group) in groups.iter().enumerate() {
            for &idx in group {
                if let Some(w) = self.graph.node_weight_mut(idx) {
                    w.community_id = cid as u16;
                }
            }
        }

        // Rank god_nodes by total degree centrality.
        let mut deg_list: Vec<GodNodeSummary> = indices
            .iter()
            .filter_map(|&idx| {
                let w = self.graph.node_weight(idx)?;
                let deg = self.graph.neighbors_directed(idx, Direction::Incoming).count()
                    + self.graph.neighbors_directed(idx, Direction::Outgoing).count();
                Some(GodNodeSummary {
                    id: w.id.clone(),
                    label: w.label.clone(),
                    category: w.category.label().to_string(),
                    degree: deg,
                })
            })
            .collect();
        deg_list.sort_by(|a, b| b.degree.cmp(&a.degree).then_with(|| a.id.cmp(&b.id)));
        deg_list.truncate(10);
        self.god_nodes = deg_list;
    }

    /// Exports the `graphify`-compatible JSON bundle and Markdown report to both
    /// `data/knowledge_graph/` and `graphify-out/` under `repo_root`.
    pub fn export_graphify_bundle(
        &self,
        repo_root: &Path,
    ) -> Result<GraphifyExportStats, CausalGraphError> {
        let (json_doc, stats) = self.to_graphify_export_json();
        let json_str = serde_json::to_string_pretty(&json_doc)?;
        let report_md = self.render_graph_report_markdown(&json_doc, &stats);

        let kg_dir = repo_root.join("data").join("knowledge_graph");
        let graphify_dir = repo_root.join("graphify-out");
        fs::create_dir_all(&kg_dir).map_err(|e| CausalGraphError::io(&kg_dir, e))?;
        fs::create_dir_all(&graphify_dir).map_err(|e| CausalGraphError::io(&graphify_dir, e))?;

        let targets = [
            (kg_dir.join("ares_dataset_graph.json"), json_str.as_str()),
            (kg_dir.join("GRAPH_REPORT.md"), report_md.as_str()),
            (graphify_dir.join("graph.json"), json_str.as_str()),
            (graphify_dir.join("GRAPH_REPORT.md"), report_md.as_str()),
        ];
        for (path, body) in targets {
            fs::write(&path, body).map_err(|e| CausalGraphError::io(&path, e))?;
        }

        Ok(GraphifyExportStats {
            json_bytes: json_str.len(),
            ..stats
        })
    }

    /// Builds the in-memory `graphify` `node_link_graph` JSON struct.
    pub fn to_graphify_export_json(&self) -> (GraphifyExportJson, GraphifyExportStats) {
        let mut nodes_out = Vec::with_capacity(self.graph.node_count());
        let mut communities: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut slice_count = 0usize;

        let mut sorted_indices: Vec<NodeIndex> = self.graph.node_indices().collect();
        sorted_indices.sort_by(|&a, &b| {
            let na = self.graph.node_weight(a).map(|n| n.id.as_str()).unwrap_or("");
            let nb = self.graph.node_weight(b).map(|n| n.id.as_str()).unwrap_or("");
            na.cmp(nb)
        });

        for idx in sorted_indices {
            let Some(n) = self.graph.node_weight(idx) else {
                continue;
            };
            if n.category == PrimeKgCategory::TimeWindowSlice {
                slice_count += 1;
            }
            let degree = self.graph.neighbors_directed(idx, Direction::Incoming).count()
                + self.graph.neighbors_directed(idx, Direction::Outgoing).count();
            communities
                .entry(n.community_id.to_string())
                .or_default()
                .push(n.id.clone());
            nodes_out.push(GraphifyNodeJson {
                id: n.id.clone(),
                label: n.label.clone(),
                category: n.category.label().to_string(),
                ontology_curie: n.ontology_curie.clone(),
                file_type: n.file_type.clone(),
                source_file: n.source_file.clone(),
                source_location: n.source_location.clone(),
                community: n.community_id,
                degree,
            });
        }

        let mut links_out = Vec::with_capacity(self.graph.edge_count());
        for e in self.graph.edge_references() {
            let (Some(src), Some(dst)) = (
                self.graph.node_weight(e.source()),
                self.graph.node_weight(e.target()),
            ) else {
                continue;
            };
            let w = e.weight();
            links_out.push(GraphifyLinkJson {
                source: src.id.clone(),
                target: dst.id.clone(),
                predicate: w.predicate_curie.clone(),
                relation: w.graphify_relation.clone(),
                confidence: w.confidence_tier.as_graphify_str().to_string(),
                confidence_score: w.confidence_score,
                effect_size: w.effect_size,
                source_file: w.source_file.clone(),
                weight: w.confidence_score,
            });
        }

        let mut meta = BTreeMap::new();
        meta.insert("name".to_string(), "ARES-DatasetGraph".to_string());
        meta.insert("schema".to_string(), "SPOKE+BioCypher+PrimeKG+Biolink".to_string());
        meta.insert("total_datasets".to_string(), self.dataset_count().to_string());

        let doc = GraphifyExportJson {
            directed: true,
            multigraph: false,
            graph: meta,
            nodes: nodes_out,
            links: links_out,
            communities,
            god_nodes: self.god_nodes.clone(),
            hyperedges: Vec::new(),
        };

        let stats = GraphifyExportStats {
            node_count: self.graph.node_count(),
            edge_count: self.graph.edge_count(),
            dataset_count: self.dataset_count(),
            community_count: doc.communities.len(),
            time_window_slice_count: slice_count,
            god_node_ids: self.god_nodes.iter().map(|g| g.id.clone()).collect(),
            json_bytes: 0,
        };
        (doc, stats)
    }

    fn render_graph_report_markdown(
        &self,
        doc: &GraphifyExportJson,
        stats: &GraphifyExportStats,
    ) -> String {
        let mut md = String::with_capacity(4096);
        md.push_str("# ARES-DatasetGraph Knowledge Graph Report\n\n");
        md.push_str(&format!(
            "- **Nodes:** {}\n- **Edges:** {}\n- **Cataloged Datasets:** {}\n- **TimeWindowSlices:** {}\n- **Communities:** {}\n\n",
            stats.node_count, stats.edge_count, stats.dataset_count, stats.time_window_slice_count, stats.community_count
        ));
        md.push_str("## God Nodes (Top Degree Centrality Hubs)\n\n");
        md.push_str("| Rank | Node ID | Category | Label | Degree |\n| ---: | :--- | :--- | :--- | ---: |\n");
        for (i, g) in doc.god_nodes.iter().enumerate() {
            md.push_str(&format!(
                "| {} | `{}` | {} | {} | {} |\n",
                i + 1,
                g.id,
                g.category,
                g.label,
                g.degree
            ));
        }
        md.push_str("\n## Cataloged Datasets (24 Sources)\n\n");
        md.push_str("| # | Code | Agency | Gravity Regime |\n| ---: | :--- | :--- | :--- |\n");
        for spec in CANONICAL_24_DATASETS {
            md.push_str(&format!(
                "| {} | `{}` | {} | {} |\n",
                spec.index, spec.code, spec.agency, spec.gravity_regime
            ));
        }
        md
    }

    // -----------------------------------------------------------------------
    // Sub-millisecond FastMCP query & shortest-path explanation
    // -----------------------------------------------------------------------

    fn resolve_node(&self, keyword_or_id: &str) -> Option<NodeIndex> {
        let q = keyword_or_id.trim().to_ascii_lowercase();
        if q.is_empty() {
            return None;
        }
        if let Some(&exact) = self.id_index.get(&q) {
            return Some(exact);
        }
        let mut best: Option<(u8, usize, NodeIndex)> = None;
        for idx in self.graph.node_indices() {
            let Some(n) = self.graph.node_weight(idx) else {
                continue;
            };
            let id_l = n.id.to_ascii_lowercase();
            let lbl_l = n.label.to_ascii_lowercase();
            let curie_l = n
                .ontology_curie
                .as_deref()
                .unwrap_or("")
                .to_ascii_lowercase();
            let code_l = match &n.payload {
                UnifiedNodePayload::Dataset { code, .. } => code.to_ascii_lowercase(),
                UnifiedNodePayload::GeneProtein { symbol, .. } => symbol.to_ascii_lowercase(),
                UnifiedNodePayload::SubjectCohort { cohort_id, .. } => cohort_id.to_ascii_lowercase(),
                _ => String::new(),
            };
            let rank = if code_l == q || curie_l == q || id_l == q {
                0
            } else if id_l.contains(&q) || code_l.contains(&q) || curie_l.contains(&q) {
                1
            } else if lbl_l.contains(&q) {
                2
            } else {
                continue;
            };
            let deg = self.graph.neighbors_undirected(idx).count();
            if best.is_none_or(|(br, bd, _)| rank < br || (rank == br && deg > bd)) {
                best = Some((rank, deg, idx));
            }
        }
        best.map(|(_, _, idx)| idx)
    }

    /// Queries the unified graph in `< 1 ms` by node ID, ontology CURIE, gene symbol,
    /// dataset code, or keyword, returning a compact `< 150`-token summary.
    pub fn query_by_keyword_or_id(
        &self,
        query: &str,
        max_neighbors: usize,
    ) -> CompactGraphQueryResult {
        let t0 = Instant::now();
        let limit = max_neighbors.clamp(1, 6);
        let Some(root) = self.resolve_node(query) else {
            return CompactGraphQueryResult {
                query: query.to_string(),
                latency_us: t0.elapsed().as_micros() as u64,
                matched_id: None,
                category: None,
                ontology_curie: None,
                neighbors: Vec::new(),
                slice_uris: Vec::new(),
                clauses: Vec::new(),
            };
        };
        let Some(root_w) = self.graph.node_weight(root) else {
            return CompactGraphQueryResult {
                query: query.to_string(),
                latency_us: t0.elapsed().as_micros() as u64,
                matched_id: None,
                category: None,
                ontology_curie: None,
                neighbors: Vec::new(),
                slice_uris: Vec::new(),
                clauses: Vec::new(),
            };
        };

        let mut neighbors = Vec::new();
        let mut slice_uris = Vec::new();
        let mut clauses = Vec::new();
        let mut seen = HashSet::new();

        for e in self.graph.edges_directed(root, Direction::Outgoing) {
            let Some(dst) = self.graph.node_weight(e.target()) else {
                continue;
            };
            if !seen.insert(dst.id.clone()) {
                continue;
            }
            match &dst.payload {
                UnifiedNodePayload::TimeWindowSlice { slice_uri, .. } => {
                    if slice_uris.len() < 3 {
                        slice_uris.push(slice_uri.clone());
                    }
                }
                UnifiedNodePayload::NormativeClause { official_code, .. } => {
                    if clauses.len() < 3 {
                        clauses.push(official_code.clone());
                    }
                }
                _ => {
                    if neighbors.len() < limit {
                        neighbors.push(format!("{}({})", dst.id, e.weight().predicate_curie));
                    }
                }
            }
        }
        for e in self.graph.edges_directed(root, Direction::Incoming) {
            if neighbors.len() >= limit {
                break;
            }
            let Some(src) = self.graph.node_weight(e.source()) else {
                continue;
            };
            if seen.insert(src.id.clone()) {
                neighbors.push(format!("{}<-{}", src.id, e.weight().predicate_curie));
            }
        }

        CompactGraphQueryResult {
            query: query.to_string(),
            latency_us: t0.elapsed().as_micros() as u64,
            matched_id: Some(root_w.id.clone()),
            category: Some(root_w.category.label().to_string()),
            ontology_curie: root_w.ontology_curie.clone(),
            neighbors,
            slice_uris,
            clauses,
        }
    }

    /// Finds the shortest undirected path between two entities in `< 1 ms` via BFS.
    pub fn explain_shortest_path(
        &self,
        from_query: &str,
        to_query: &str,
    ) -> Result<CompactPathExplanation, CausalGraphError> {
        let t0 = Instant::now();
        let start = self
            .resolve_node(from_query)
            .ok_or_else(|| CausalGraphError::UnknownNode(from_query.to_string()))?;
        let goal = self
            .resolve_node(to_query)
            .ok_or_else(|| CausalGraphError::UnknownNode(to_query.to_string()))?;

        let mut queue = VecDeque::new();
        let mut prev: HashMap<NodeIndex, (NodeIndex, String)> = HashMap::new();
        let mut visited = HashSet::new();
        visited.insert(start);
        queue.push_back(start);

        let mut found = start == goal;
        while let Some(cur) = queue.pop_front() {
            if cur == goal {
                found = true;
                break;
            }
            for e in self.graph.edges_directed(cur, Direction::Outgoing) {
                let nxt = e.target();
                if visited.insert(nxt) {
                    prev.insert(nxt, (cur, e.weight().predicate_curie.clone()));
                    queue.push_back(nxt);
                }
            }
            for e in self.graph.edges_directed(cur, Direction::Incoming) {
                let nxt = e.source();
                if visited.insert(nxt) {
                    prev.insert(nxt, (cur, format!("inv:{}", e.weight().predicate_curie)));
                    queue.push_back(nxt);
                }
            }
        }

        if !found {
            return Err(CausalGraphError::NoPath {
                from: from_query.to_string(),
                to: to_query.to_string(),
            });
        }

        let mut steps = Vec::new();
        let mut cursor = goal;
        while cursor != start {
            let Some((p, pred)) = prev.get(&cursor).cloned() else {
                break;
            };
            let to_id = self
                .graph
                .node_weight(cursor)
                .map(|n| n.id.as_str())
                .unwrap_or("?");
            steps.push(format!("--[{pred}]--> {to_id}"));
            cursor = p;
        }
        let start_id = self
            .graph
            .node_weight(start)
            .map(|n| n.id.clone())
            .unwrap_or_default();
        let goal_id = self
            .graph
            .node_weight(goal)
            .map(|n| n.id.clone())
            .unwrap_or_default();
        steps.reverse();
        let hops = steps.len();
        let mut full_steps = Vec::with_capacity(hops + 1);
        full_steps.push(start_id.clone());
        full_steps.extend(steps);

        Ok(CompactPathExplanation {
            from: start_id,
            to: goal_id,
            hops,
            latency_us: t0.elapsed().as_micros() as u64,
            path_steps: full_steps,
        })
    }
}

// ---------------------------------------------------------------------------
// BIDMC CSV Parser (Zero-Unwrap, missing-data preserving)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
struct BidmcRow {
    time_s: u32,
    hr: Option<f64>,
    pulse: Option<f64>,
    resp: Option<f64>,
    spo2: Option<f64>,
}

fn parse_optional_f64(cell: &str, file: &str, line: usize) -> Result<Option<f64>, CausalGraphError> {
    let trimmed = cell.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("nan") || trimmed.eq_ignore_ascii_case("na")
    {
        return Ok(None);
    }
    let v: f64 = trimmed.parse().map_err(|_| CausalGraphError::CsvParse {
        file: file.to_string(),
        line,
        reason: format!("invalid float `{trimmed}`"),
    })?;
    Ok(v.is_finite().then_some(v))
}

fn parse_bidmc_numerics_csv(
    file: &str,
    content: &str,
) -> Result<Vec<BidmcRow>, CausalGraphError> {
    let mut rows = Vec::with_capacity(512);
    let mut lines = content.lines().enumerate();
    let Some((_, header)) = lines.next() else {
        return Err(CausalGraphError::CsvParse {
            file: file.to_string(),
            line: 1,
            reason: "empty CSV file".to_string(),
        });
    };
    let cols: Vec<&str> = header.split(',').map(str::trim).collect();
    if cols.len() < 5 || cols[0] != "Time [s]" {
        return Err(CausalGraphError::CsvParse {
            file: file.to_string(),
            line: 1,
            reason: format!("unexpected header `{header}`"),
        });
    }

    for (idx, line) in lines {
        let line_no = idx + 1;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() < 5 {
            return Err(CausalGraphError::CsvParse {
                file: file.to_string(),
                line: line_no,
                reason: format!("expected 5 columns, got {}", parts.len()),
            });
        }
        let time_f: f64 = parts[0].trim().parse().map_err(|_| CausalGraphError::CsvParse {
            file: file.to_string(),
            line: line_no,
            reason: format!("invalid time `{}`", parts[0]),
        })?;
        rows.push(BidmcRow {
            time_s: time_f.max(0.0).round() as u32,
            hr: parse_optional_f64(parts[1], file, line_no)?,
            pulse: parse_optional_f64(parts[2], file, line_no)?,
            resp: parse_optional_f64(parts[3], file, line_no)?,
            spo2: parse_optional_f64(parts[4], file, line_no)?,
        });
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf()
    }

    #[test]
    fn test_dataset_graph_contains_all_24_datasets_and_all_9_primekg_categories() {
        let g = AresUnifiedDatasetGraph::build_from_repo_root(&repo_root()).unwrap();
        assert_eq!(g.dataset_count(), 24);
        let codes: HashSet<String> = g.dataset_codes().into_iter().collect();
        for required in [
            "OSD-51",
            "OSD-195",
            "OSD-818",
            "OSD-570",
            "OSD-635",
            "NASA-0000100",
            "CSA CANS",
            "BIDMC v1.0.0",
            "MIT-BIH Arrhythmia",
            "HiRID ICU",
            "MESA Sleep",
            "SHHS",
            "MARS-500",
            "SIRIUS-19/21",
            "ESA Head-Down BedRest",
            "Look AHEAD",
            "GTEA",
            "PTB-XL",
            "MIMIC-IV Demo",
            "PhysioNet Tilt Table",
            "OSDR Rodent Research RR-1..RR-10",
            "LSAH Longitudinal",
            "NSRL Galactic Cosmic Ray",
            "ISS Acoustic/Environmental",
        ] {
            assert!(codes.contains(required), "missing dataset {required}");
        }

        // Verify all 9 PrimeKG categories and all 12 SPOKE/GeneLab DEGs are present.
        let present_cats: HashSet<PrimeKgCategory> =
            g.graph.node_weights().map(|n| n.category).collect();
        assert_eq!(present_cats.len(), 9);
        for gene in [
            "SOST", "RANKL", "VEGFA", "ICAM1", "NOS3", "HIF1A", "IL6", "COL1A1", "ACTA1", "MYH7",
            "PPARGC1A", "BDNF",
        ] {
            let res = g.query_by_keyword_or_id(gene, 4);
            assert!(res.matched_id.is_some(), "missing gene {gene}");
        }
        assert!(g.query_by_keyword_or_id("OSD-379", 3).matched_id.is_some());
        assert!(g.query_by_keyword_or_id("OSD-48", 3).matched_id.is_some());
    }

    #[test]
    fn test_real_bidmc_csv_window_ingestion_and_missingness_preservation() {
        let bidmc_dir = repo_root().join("data").join("bidmc");
        let g = AresUnifiedDatasetGraph::build_with_bidmc_dir(Some(&bidmc_dir)).unwrap();
        let slices = g.time_window_slice_nodes();
        // 481 rows (0..480s) -> 9 60-second windows per file (0..60, ..., 480..540) => 27 slices total.
        assert_eq!(slices.len(), 27);

        let mut bidmc01_pulse_missing = 0u32;
        let mut bidmc01_spo2_missing = 0u32;
        let mut found_t_0000_0060 = false;
        for s in slices {
            if let UnifiedNodePayload::TimeWindowSlice {
                record_id,
                slice_uri,
                pulse,
                spo2,
                ..
            } = &s.payload
            {
                if slice_uri == "slice://bidmc/01/t_0000_0060" {
                    found_t_0000_0060 = true;
                }
                if record_id == "bidmc_01" {
                    bidmc01_pulse_missing += pulse.missing_count;
                    bidmc01_spo2_missing += spo2.missing_count;
                }
            }
        }
        assert!(found_t_0000_0060);
        // MANIFEST.json invariant: bidmc_01 has exactly 13 missing PULSE and 13 missing SpO2 values.
        assert_eq!(bidmc01_pulse_missing, 13);
        assert_eq!(bidmc01_spo2_missing, 13);
    }

    #[test]
    fn test_biolink_predicates_query_shortest_path_and_json_export() {
        let g = AresUnifiedDatasetGraph::build_from_repo_root(&repo_root()).unwrap();
        // Every edge uses a formal biolink: predicate and never 0.5 confidence.
        for e in g.graph.edge_weights() {
            assert!(e.predicate_curie.starts_with("biolink:"));
            assert_ne!(e.confidence_score, 0.5);
        }
        assert!(!g.god_nodes().is_empty());

        let q = g.query_by_keyword_or_id("SOST", 4);
        assert!(q.latency_us < 10_000);
        let q_json = q.to_compact_json().unwrap();
        assert!(q_json.len() < 600, "compact query exceeded 600 bytes: {}", q_json.len());

        let path = g.explain_shortest_path("OSD-818", "BIDMC v1.0.0").unwrap();
        assert!(path.hops >= 2);
        assert!(path.latency_us < 10_000);
        let p_json = path.to_compact_json().unwrap();
        assert!(p_json.len() < 600, "compact path exceeded 600 bytes: {}", p_json.len());

        let (export, stats) = g.to_graphify_export_json();
        assert_eq!(stats.dataset_count, 24);
        assert!(export.directed);
        assert!(!export.nodes.is_empty());
        assert!(!export.links.is_empty());
        let serialized = serde_json::to_string(&export).unwrap();
        let reparsed: GraphifyExportJson = serde_json::from_str(&serialized).unwrap();
        assert_eq!(reparsed.nodes.len(), export.nodes.len());

        let tmp_dir = std::env::temp_dir().join(format!("ares_kg_test_{}", std::process::id()));
        let bundle_stats = g.export_graphify_bundle(&tmp_dir).unwrap();
        assert_eq!(bundle_stats.dataset_count, 24);
        assert!(tmp_dir.join("data/knowledge_graph/ares_dataset_graph.json").is_file());
        assert!(tmp_dir.join("data/knowledge_graph/GRAPH_REPORT.md").is_file());
        assert!(tmp_dir.join("graphify-out/graph.json").is_file());
        assert!(tmp_dir.join("graphify-out/GRAPH_REPORT.md").is_file());
        let _ = fs::remove_dir_all(&tmp_dir);
    }
}
