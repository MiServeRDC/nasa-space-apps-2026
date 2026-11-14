# Piano Implementativo Definitivo — Fase 20 (I3): Unified Multi-Dataset Knowledge Graph Builder (`ARES-DatasetGraph` Linking All 24 Datasets, Cross-Dataset Priors, `graphify`-Compatible JSON Exporter `data/knowledge_graph/ares_dataset_graph.json` & `FastMCP` Graph Query Tools)

- **Blocco Architetturale**: Blocco I (*Motore Rust Core: Grafo Ibrido a 3 Livelli `ARES-HyperGraph` & `ARES-DatasetGraph` Multi-Agenzia — `2. EVALUATE` & `3. ACT`*, Fasi 18–20)
- **Fase**: Fase 20 (`I3`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principali**: [`crates/ares-causal-graph`](../../crates/ares-causal-graph/README.md) & [`crates/ares-server-cli`](../../crates/ares-server-cli/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid` & `@fertech02`
- **File Target Previsti**:
  1. `crates/ares-causal-graph/src/unified_dataset_graph.rs` *(NEW)*
  2. `crates/ares-server-cli/src/mcp_stdio.rs` *(UPDATE — aggiunta query di provenienza grafo)*
  3. `data/knowledge_graph/ares_dataset_graph.json` *(NEW — artefatto statico compatibile `graphify`)*
- **Budget Latenza & Token**:
  - **Attraversamento Grafo Multi-Dataset (`query_dataset_provenance_for_node`)**: $< 12\,\mu\text{s}$
  - **Risposta Tool `FastMCP` Context-Mode**: Rigorosamente $< 150\text{ token}$ ($\le 600\text{ byte}$ JSON serializzato)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, separazione rigorosa dei substrati per non fondere mai serie temporali incompatibili (**Invariante BioHarness & `Entry 006`**).

---

## 1. Executive Summary & Scientific Grounding (`deep-scholar`)

### 1.1 Visione Architetturale: Unificare Tutti i 24 Dataset Ufficiali senza Corrompere la Provenienza
Una domanda fondamentale della sfida **NASA Space Apps 2026** è: *"Come possiamo collegare in un unico grafo computazionale tutti i 24 dataset multi-agenzia (NASA OSDR, NASA HRP, NASA NLSP, NASA LSAH, NASA-STD-3001, CSA, ESA, DLR, JAXA, TRISH e PhysioNet) che hanno risoluzioni temporali e substrati completamente diversi (`1 Hz` CSV numerici vs. trascrittomica post-HDBR a 60 giorni vs. epidemiologia longitudinale)?"*

Come dimostrato in [`docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md`](../architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md) e nello studio di fattibilità dedicato [`docs/architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md`](../architecture/UNIFIED_DATASET_GRAPH_FEASIBILITY_STUDY.md):
- **Fondere le serie grezze in un'unica tabella piatta (`flat CSV merge`) è scientificamente errato** perché distrugge la frequenza nativa (`1 Hz` di `BIDMC v1.0.0`) e viola il `ProvenanceManifest`.
- **Adottare il pattern Hybrid Dual-Representation (`ARES-DatasetGraph` su `petgraph::stable_graph::StableDiGraph` + puntatori `slice://` a Parquet/CSV verificati) è la soluzione stato dell'arte assoluta** (allineata con **NASA GeneLab-SPOKE**, **BioCypher**, **Harvard PrimeKG** e **Monarch Biolink Model**):
  - **In-RAM Graph (`~8.40 MB`, `14,623` nodi, `112,400` archi):** Indicizza `DatasetNode` (`24`), `CohortSubjectNode` (`1,200`), `TimeWindowSummaryNode` (`8,500` con statistiche di Welford $(\mu, \sigma, q_{0.05}, q_{0.50}, q_{0.95})$ e puntatori `slice://`), `BiomarkerFeatureNode` (`180`), `OmicsGeneProteinNode` (`4,500`), `AnatomicalStructureNode` (`64 UBERON`), `CountermeasureProtocolNode` (`35`) e `NasaStdClauseNode` (`120`).
  - **On-Disk `graphify` Artifact (`~14.23 MB`):** Esporta `data/knowledge_graph/ares_dataset_graph.json` per consultazione istantanea `< 1 ms` tramite `/graphify query`, `/graphify path` e `/graphify explain`.

La **Fase 20 (`I3`)** implementa in `crates/ares-causal-graph/src/unified_dataset_graph.rs`:
1. **`AresUnifiedDatasetGraph` (`petgraph::stable_graph::StableDiGraph`):** Indicizza in memoria tutti i **24 dataset ufficiali** (`DS_01`..`DS_24`), gli **8 nodi causali `ADHG`**, le **4 regioni anatomiche 3D**, le **6 zone dell'habitat** e i **5 MedOps Playbooks**, supportando il pooling Bayesiano empirico cross-dataset (`CrossDatasetPriorQuery` $\to$ `CrossDatasetPriorResponse`) in $< 12\,\mu\text{s}$.
2. **Esportatore JSON Compatibile `graphify` (`export_graphify_compatible_json`):** Genera la topologia completa `{ "nodes": [...], "edges": [...], "communities": [...] }` per l'ispezione visuale e per `data/knowledge_graph/ares_dataset_graph.json`.
3. **Integrazione `FastMCP` Context-Mode (`query_unified_dataset_graph`, `< 150 token`):** Arricchisce il server `stdio` in `crates/ares-server-cli/src/mcp_stdio.rs` permettendo all'agente di bordo di interrogare istantaneamente i prior cross-dataset, i puntatori `slice://` e le clausole `NASA-STD-3001` che giustificano qualsiasi anomalia o Playbook.

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Charlotte A. Nelson, Sergio E. Baranzini, Lauren M. Sanders, Sylvain V. Costes et al. (UCSF & NASA Ames Research Center, 2021–2026):**
   * *Titolo:* *"SPOKE: A Scalable Precision Medicine Open Knowledge Engine bridging NASA Open Science Data Repository (OSDR / GeneLab) multi-omics with clinical phenotypes"*, NSF Proto-OKN & NASA OSDR Data Fabric (`BaranziniLab/SPOKE`, Morris et al. 2023).
2. **Sebastian Lobentanzer, Patrick Aloy, Julio Saez-Rodriguez et al. (2023) & Johann Dreo et al. (2024):**
   * *Titoli:* *"Democratizing knowledge representation with BioCypher"*, *Nature Biotechnology*, 41:1056–1059 | **DOI:** `10.1038/s41587-023-01848-y` & *"OntoWeaver: declarative weaving of tabular biomedical data into BioCypher knowledge graphs"* (2024).
3. **Payal Chandak, Kexin Huang, Marinka Zitnik (Harvard Medical School, 2023):**
   * *Titolo:* *"Building a knowledge graph to enable precision medicine (PrimeKG)"*, *Scientific Data (Nature)*, 10:67 | **DOI:** `10.1038/s41597-023-01960-3`.
4. **Deepak R. Unni, Sierra A. T. Moxon, Chris Mungall et al. (Monarch Initiative, 2022):**
   * *Titolo:* *"Biolink Model: A universal schema for knowledge graphs in clinical, biomedical, and translational science"*, *Clinical and Translational Science*, 15(8):1848–1855 | **DOI:** `10.1111/cts.13302`.
5. **Meng Xiao et al. (2026):**
   * *Titolo:* *"BioHarness: Substrate-Aware Evidence Assembly Across Literature, Knowledge Bases, and Biological Atlases"*, `arXiv:2606.19396v1`.

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

### 2.1 Catalogo Completo dei 24 Nodi Dataset in `ARES-DatasetGraph`

| Codice Nodo | Agenzia | Nome Ufficiale / Accession ID | Substrato (`ProvenanceSubstrate`) | Nodo Primario `ADHG` Collegato |
| :--- | :--- | :--- | :--- | :--- |
| `DS_01` | PhysioNet | `BIDMC PPG & Respiration v1.0.0` (`bidmc_01..03`) | `RecordedTerrestrialBidmcCsv` | `TorsoCardioAutonomic` / `Biometrics` |
| `DS_02` | PhysioNet | `CEBS & Fantasia Database` | `DerivedBiophysicalModel` | `TorsoCardioAutonomic` (`CrewSleepQuarters`) |
| `DS_03` | UCI ML | `PPG-DaLiA Motion Artifact Dataset` | `DerivedBiophysicalModel` | `SqiFilter` (`SQI >= 0.70`) |
| `DS_04` | NASA OSDR | `OSD-51` (60d HDBR Soleus/VL Transcriptome) | `MechanisticAgencyPrior` | `SoleusMuscleQualityMqi` |
| `DS_05` | NASA OSDR | `OSD-195` (21d Bed Rest Skeletal Microarray) | `MechanisticAgencyPrior` | `EndothelialProtectiveSecretome` |
| `DS_06` | NASA OSDR | `OSD-570 / OSD-571` (`Nature SOMA` cf-mtDNA) | `MechanisticAgencyPrior` | `CansRadiationOxidativeStress` |
| `DS_07` | NASA OSDR | `OSD-818` (*Ex Vivo* Translaminar SANS Model) | `MechanisticAgencyPrior` | `SansTranslaminarGradient` |
| `DS_08` | NASA NLSP | `NASA-0000100` (`SMCCP`, `BRSMFSR`, *Tilt*) | `MechanisticAgencyPrior` | `LbnpChamberBay` (Gate 2) & `GAI` |
| `DS_09` | NASA JSC | `LSAH` (Longitudinal Study of Astronaut Health) | `MechanisticAgencyPrior` | `OsteocyteSclerostinSost` |
| `DS_10` | NASA HRP | `HRP Integrated Research Plan (RIDGE Risks)` | `NormativeNasaStd3001` | Tutti gli 8 nodi `AdhgNodeKind` |
| `DS_11` | NASA HRP | `Artemis II ARCHeR` (Sleep & Cognition) | `MechanisticAgencyPrior` | `CrewSleepQuarters` |
| `DS_12` | NASA-ESA | `Venous Haemostasis & Thigh Cuff Study` | `MechanisticAgencyPrior` | `IjvVenousStasisShearStress` |
| `DS_13` | NASA HRP | `Zero T2 & CIPHER` (Treadmill-Independent ARED) | `MechanisticAgencyPrior` | `AredMechanicalLoad` |
| `DS_14` | NASA HRP | `Brain Fluid & B-Complex SANS Countermeasure` | `MechanisticAgencyPrior` | `SansTranslaminarGradient` |
| `DS_15` | CSA | `CANS 2026` (Autonomous Neutron Spectrometer) | `DerivedBiophysicalModel` | `CansRadiationOxidativeStress` |
| `DS_16` | CSA | `Bio-Monitor & Vascular Aging` | `MechanisticAgencyPrior` | `IjvVenousStasisShearStress` |
| `DS_17` | CSA | `MARROW` (Bone Marrow Adipogenesis & Anemia) | `MechanisticAgencyPrior` | `OsteocyteSclerostinSost` |
| `DS_18` | ESA | `Myotones 2026` (Soleus/Achilles Myotonometry) | `MechanisticAgencyPrior` | `SoleusMuscleQualityMqi` |
| `DS_19` | ESA | `BRACE` (60d HDBR Artificial Gravity + Cycling) | `MechanisticAgencyPrior` | `SoleusMuscleQualityMqi` |
| `DS_20` | DLR | `:envihab AGBRESA & SANS-CM` (HDT + LBNP `-25 mmHg`) | `MechanisticAgencyPrior` | `SansTranslaminarGradient` |
| `DS_21` | NASA JSC | `CHAPEA (378d Mars) & HERA` | `MechanisticAgencyPrior` | `CrewSleepQuarters` |
| `DS_22` | NASA TRISH | `EXPAND Commercial Biobank & HERMES EIMO` | `NormativeNasaStd3001` | `FastMCP` CDSS Copilot |
| `DS_23` | NASA-JAXA | `Bisphosphonates + ARED Bone Countermeasure` | `MechanisticAgencyPrior` | `OsteocyteSclerostinSost` |
| `DS_24` | NASA OCHMO | `NASA-STD-3001 Vol. 1 C & Vol. 2 F + MTB-007` | `NormativeNasaStd3001` | Tutti i `SafetyGates` e `Playbooks` |

### 2.2 Tabella File e Moduli Rust

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 20 (`I3`) |
| :--- | :--- | :--- |
| `crates/ares-causal-graph/src/unified_dataset_graph.rs` | **CREATE** | Costruisce `AresUnifiedDatasetGraph` con i 24 dataset, espone `query_evidence_for_adhg_node` in $< 12\,\mu\text{s}$ e serializza il grafo nel formato JSON compatibile `graphify`. |
| `crates/ares-server-cli/src/mcp_stdio.rs` | **UPDATE** | Espone la provenienza multi-dataset compatta (`< 150 token`) nelle risposte JSON-RPC 2.0. |

---

## 3. Formulazione Matematica

### 3.1 Grafo Bipartito-Eterogeneo Tipizzato $\mathcal{G}_{\text{ARES}} = (\mathcal{V}_D \cup \mathcal{V}_P \cup \mathcal{V}_S \cup \mathcal{V}_M, \; \mathcal{E})$
L'insieme dei vertici $\mathcal{V}$ è partizionato in 4 famiglie disgiunte:
- $\mathcal{V}_D$ ($|\mathcal{V}_D| = 24$): Nodi Dataset & Standard Multi-Agenzia (`DS_01`..`DS_24`);
- $\mathcal{V}_P$ ($|\mathcal{V}_P| = 8$): Nodi Fisiopatologici `ADHG` (Layer 1);
- $\mathcal{V}_S$ ($|\mathcal{V}_S| = 10$): Nodi Spaziali (`4` Regioni Anatomiche 3D + `6` Zone Habitat, Layer 2);
- $\mathcal{V}_M$ ($|\mathcal{V}_M| = 5$): Nodi MedOps Playbook (`PLAYBOOK_01`..`PLAYBOOK_05`).

Per ogni nodo fisiologico attivo $v_p \in \mathcal{V}_P$, la query di attribuzione epistemica a 1 salto restituisce l'insieme ordinato per rilevanza:
$$\mathcal{N}_D(v_p) = \left\{ (d_i, e_{ip}) \in \mathcal{V}_D \times \mathcal{E} \;\middle|\; (d_i \xrightarrow{e_{ip}} v_p) \in \mathcal{E} \right\}$$
in tempo $O(\deg^-(v_p)) = O(1)$ (poiché $\deg^-(v_p) \le 6$).

---

## 4. Concrete Rust Signatures & Data Structures (`crates/ares-causal-graph/src/unified_dataset_graph.rs`)

```rust
//! Fase 20 (I3): Unified Multi-Dataset Knowledge Graph Builder (`ARES-DatasetGraph`)
//! che collega tutti i 24 dataset ufficiali NASA/CSA/ESA/DLR/JAXA/TRISH/PhysioNet
//! ai nodi fisiologici ADHG, alle regioni anatomiche 3D e ai Playbook MedOps.

use crate::adhg_graph::AdhgNodeKind;
use crate::biokg_ontology::{
    BiomedicalEvidenceDescriptor, NormativeClauseId, ProvenanceSubstrate, fnv1a_hash64,
};
use crate::spatial_habitat_graph::{AnatomicalRegion, SpacecraftHabitatZone};
use petgraph::Direction;
use petgraph::stable_graph::{NodeIndex, StableDiGraph};
use serde::{Deserialize, Serialize};

/// Relazione semantica tipizzata nel grafo multi-dataset ARES-DatasetGraph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DatasetGraphRelation {
    StreamsNativeWaveform,
    CalibratesOdeParameter,
    ProvidesMechanisticPrior,
    DefinesNormativeThreshold,
    ValidatesCountermeasure,
    SharesBiomarkerPathway,
}

/// Metadati immutabili di uno dei 24 dataset ufficiali nel catalogo ARES-BioKG.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DatasetCatalogEntry {
    pub code: &'static str,
    pub agency: &'static str,
    pub title: &'static str,
    pub descriptor: BiomedicalEvidenceDescriptor,
    pub primary_adhg_target: AdhgNodeKind,
    pub relation: DatasetGraphRelation,
}

/// Nodo eterogeneo del grafo unificato ARES-DatasetGraph.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum UnifiedGraphNode {
    Dataset(DatasetCatalogEntry),
    PhysiologicalAdhg(AdhgNodeKind),
}

/// Arco orientato nel grafo unificato ARES-DatasetGraph.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct UnifiedGraphEdge {
    pub relation: DatasetGraphRelation,
    pub weight: f64,
}

/// Formato di esportazione JSON compatibile con `graphify` (`data/knowledge_graph/ares_dataset_graph.json`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphifyExportBundle {
    pub graph_name: &'static str,
    pub total_datasets: usize,
    pub nodes: Vec<String>,
    pub edges: Vec<(String, String, DatasetGraphRelation)>,
}

/// Costruisce il catalogo statico completo dei 24 dataset multi-agenzia.
pub fn canonical_24_datasets_catalog() -> [DatasetCatalogEntry; 24] {
    [
        DatasetCatalogEntry {
            code: "DS_01_PHYSIONET_BIDMC",
            agency: "PhysioNet (ODC-By-1.0)",
            title: "BIDMC PPG and Respiration Dataset v1.0.0 (1 Hz, bidmc_01..03)",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_01_PHYSIONET_BIDMC",
                1000,
                ProvenanceSubstrate::RecordedTerrestrialBidmcCsv,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V1_3003_PreventiveMonitoring,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::IjvVenousStasisShearStress,
            relation: DatasetGraphRelation::StreamsNativeWaveform,
        },
        DatasetCatalogEntry {
            code: "DS_02_PHYSIONET_CEBS",
            agency: "PhysioNet",
            title: "CEBS & Fantasia Nocturnal Cardiorespiratory Baseline",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_02_PHYSIONET_CEBS",
                900,
                ProvenanceSubstrate::DerivedBiophysicalModel,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::CrewSleepQuarters,
                NormativeClauseId::V2_6001_AcousticAndCo2Limits,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::IjvVenousStasisShearStress,
            relation: DatasetGraphRelation::CalibratesOdeParameter,
        },
        DatasetCatalogEntry {
            code: "DS_03_UCI_PPG_DALIA",
            agency: "UCI ML Repository",
            title: "PPG-DaLiA Spectral Entropy Motion Artifact SQI >= 0.70",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_03_UCI_PPG_DALIA",
                920,
                ProvenanceSubstrate::DerivedBiophysicalModel,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::AredExerciseBay,
                NormativeClauseId::V1_3003_PreventiveMonitoring,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::AredMechanicalLoad,
            relation: DatasetGraphRelation::DefinesNormativeThreshold,
        },
        DatasetCatalogEntry {
            code: "DS_04_NASA_OSDR_OSD_51",
            agency: "NASA OSDR",
            title: "OSD-51: 60-Day HDBR Soleus & Vastus Lateralis Transcriptome",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_04_NASA_OSDR_OSD_51",
                950,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::AredExerciseBay,
                NormativeClauseId::V1_3002_MusculoskeletalAred,
                0b100,
            ),
            primary_adhg_target: AdhgNodeKind::SoleusMuscleQualityMqi,
            relation: DatasetGraphRelation::ProvidesMechanisticPrior,
        },
        DatasetCatalogEntry {
            code: "DS_05_NASA_OSDR_OSD_195",
            agency: "NASA OSDR",
            title: "OSD-195: 21-Day Bed Rest & Whey Protein Skeletal Muscle Microarray",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_05_NASA_OSDR_OSD_195",
                930,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::AredExerciseBay,
                NormativeClauseId::V1_3002_MusculoskeletalAred,
                0b100,
            ),
            primary_adhg_target: AdhgNodeKind::EndothelialProtectiveSecretome,
            relation: DatasetGraphRelation::ProvidesMechanisticPrior,
        },
        DatasetCatalogEntry {
            code: "DS_06_NASA_OSDR_OSD_570_571",
            agency: "NASA OSDR (Nature SOMA)",
            title: "OSD-570/571: Spaceflight cf-mtDNA, cfRNA & Cytokine Profiling",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_06_NASA_OSDR_OSD_570_571",
                940,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::RadiationStormShelter,
                NormativeClauseId::V1_4001_RadiationProtection,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::CansRadiationOxidativeStress,
            relation: DatasetGraphRelation::ProvidesMechanisticPrior,
        },
        DatasetCatalogEntry {
            code: "DS_07_NASA_OSDR_OSD_818",
            agency: "NASA OSDR",
            title: "OSD-818: Ex Vivo Translaminar Pressure Model for SANS",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_07_NASA_OSDR_OSD_818",
                960,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::HeadOcularSans,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V1_3003_PreventiveMonitoring,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::SansTranslaminarGradient,
            relation: DatasetGraphRelation::CalibratesOdeParameter,
        },
        DatasetCatalogEntry {
            code: "DS_08_NASA_NLSP_0000100",
            agency: "NASA NLSP",
            title: "NASA-0000100: SMCCP, BRSMFSR, BRSMPT & Neuroendocrine Tilt",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_08_NASA_NLSP_0000100",
                950,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::LbnpChamberBay,
                NormativeClauseId::V1_3002_MusculoskeletalAred,
                0b110,
            ),
            primary_adhg_target: AdhgNodeKind::SoleusMuscleQualityMqi,
            relation: DatasetGraphRelation::DefinesNormativeThreshold,
        },
        DatasetCatalogEntry {
            code: "DS_09_NASA_LSAH",
            agency: "NASA JSC",
            title: "Lifetime Surveillance of Astronaut Health (DXA, FRAX & SANS)",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_09_NASA_LSAH",
                970,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V2_6026_RenalStoneHydration,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::OsteocyteSclerostinSost,
            relation: DatasetGraphRelation::CalibratesOdeParameter,
        },
        DatasetCatalogEntry {
            code: "DS_10_NASA_HRP_RISKS",
            agency: "NASA HRP",
            title: "NASA Human Research Program 5 RIDGE Hazards & 30+ Clinical Risks",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_10_NASA_HRP_RISKS",
                1000,
                ProvenanceSubstrate::NormativeNasaStd3001,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V1_3001_CrewHealth,
                0b111,
            ),
            primary_adhg_target: AdhgNodeKind::PocusThrombusPosterior,
            relation: DatasetGraphRelation::DefinesNormativeThreshold,
        },
        DatasetCatalogEntry {
            code: "DS_11_NASA_HRP_ARCHER",
            agency: "NASA HRP",
            title: "Artemis II ARCHeR Sleep, Actigraphy & Cognitive Readiness",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_11_NASA_HRP_ARCHER",
                910,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::CrewSleepQuarters,
                NormativeClauseId::V2_6001_AcousticAndCo2Limits,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::CansRadiationOxidativeStress,
            relation: DatasetGraphRelation::ProvidesMechanisticPrior,
        },
        DatasetCatalogEntry {
            code: "DS_12_NASA_VENOUS_HAEMOSTASIS",
            agency: "NASA-ESA ISS",
            title: "ISS Venous Haemostasis, IJV Stasis (Marshall-Goebel) & Thigh Cuff",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_12_NASA_VENOUS_HAEMOSTASIS",
                990,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::NeckInternalJugularVein,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::OchmoMtb007VenousThrombosis,
                0b001,
            ),
            primary_adhg_target: AdhgNodeKind::IjvVenousStasisShearStress,
            relation: DatasetGraphRelation::CalibratesOdeParameter,
        },
        DatasetCatalogEntry {
            code: "DS_13_NASA_ZERO_T2_CIPHER",
            agency: "NASA HRP",
            title: "Zero T2 & CIPHER Treadmill-Independent Resistive Exercise",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_13_NASA_ZERO_T2_CIPHER",
                960,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::AredExerciseBay,
                NormativeClauseId::V1_3002_MusculoskeletalAred,
                0b100,
            ),
            primary_adhg_target: AdhgNodeKind::AredMechanicalLoad,
            relation: DatasetGraphRelation::ValidatesCountermeasure,
        },
        DatasetCatalogEntry {
            code: "DS_14_NASA_B_COMPLEX_FLUID",
            agency: "NASA HRP",
            title: "Brain Fluid & B-Complex Endothelial One-Carbon SANS Countermeasure",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_14_NASA_B_COMPLEX_FLUID",
                900,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::HeadOcularSans,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V1_3003_PreventiveMonitoring,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::SansTranslaminarGradient,
            relation: DatasetGraphRelation::ValidatesCountermeasure,
        },
        DatasetCatalogEntry {
            code: "DS_15_CSA_CANS_2026",
            agency: "CSA (2026)",
            title: "Compact Autonomous Neutron Spectrometer (~30% ISS Dose Fraction)",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_15_CSA_CANS_2026",
                980,
                ProvenanceSubstrate::DerivedBiophysicalModel,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::RadiationStormShelter,
                NormativeClauseId::V1_4001_RadiationProtection,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::CansRadiationOxidativeStress,
            relation: DatasetGraphRelation::CalibratesOdeParameter,
        },
        DatasetCatalogEntry {
            code: "DS_16_CSA_BIOMONITOR_VASC",
            agency: "CSA",
            title: "CSA Bio-Monitor Wearable Telemetry & Vascular Aging PWV",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_16_CSA_BIOMONITOR_VASC",
                930,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::NeckInternalJugularVein,
                SpacecraftHabitatZone::AredExerciseBay,
                NormativeClauseId::V1_3003_PreventiveMonitoring,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::IjvVenousStasisShearStress,
            relation: DatasetGraphRelation::ProvidesMechanisticPrior,
        },
        DatasetCatalogEntry {
            code: "DS_17_CSA_MARROW",
            agency: "CSA",
            title: "CSA MARROW Bone Marrow Adipogenesis & Space Anemia (miR-144)",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_17_CSA_MARROW",
                920,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V1_3002_MusculoskeletalAred,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::OsteocyteSclerostinSost,
            relation: DatasetGraphRelation::ProvidesMechanisticPrior,
        },
        DatasetCatalogEntry {
            code: "DS_18_ESA_MYOTONES_2026",
            agency: "ESA (2026)",
            title: "ESA Myotones ISS Expedition 75 Soleus & Achilles Biomechanics",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_18_ESA_MYOTONES_2026",
                960,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::AredExerciseBay,
                NormativeClauseId::V1_3002_MusculoskeletalAred,
                0b100,
            ),
            primary_adhg_target: AdhgNodeKind::SoleusMuscleQualityMqi,
            relation: DatasetGraphRelation::CalibratesOdeParameter,
        },
        DatasetCatalogEntry {
            code: "DS_19_ESA_BRACE_HDBR",
            agency: "ESA / MEDES",
            title: "ESA BRACE 60-Day HDBR Artificial Gravity & Cycle Ergometer",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_19_ESA_BRACE_HDBR",
                940,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::EvaAirlockSurface,
                NormativeClauseId::V1_3002_MusculoskeletalAred,
                0b100,
            ),
            primary_adhg_target: AdhgNodeKind::SoleusMuscleQualityMqi,
            relation: DatasetGraphRelation::ValidatesCountermeasure,
        },
        DatasetCatalogEntry {
            code: "DS_20_DLR_ENVIHAB_AGBRESA",
            agency: "DLR / NASA / ESA",
            title: "DLR :envihab AGBRESA & SANS-CM Head-Down Tilt + LBNP (-25 mmHg)",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_20_DLR_ENVIHAB_AGBRESA",
                970,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::HeadOcularSans,
                SpacecraftHabitatZone::LbnpChamberBay,
                NormativeClauseId::V1_3003_PreventiveMonitoring,
                0b010,
            ),
            primary_adhg_target: AdhgNodeKind::SansTranslaminarGradient,
            relation: DatasetGraphRelation::ValidatesCountermeasure,
        },
        DatasetCatalogEntry {
            code: "DS_21_NASA_CHAPEA_HERA",
            agency: "NASA JSC",
            title: "NASA CHAPEA (378d Mars Habitat) & HERA Behavioral/Vocal Analog",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_21_NASA_CHAPEA_HERA",
                910,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::TorsoCardioAutonomic,
                SpacecraftHabitatZone::CrewSleepQuarters,
                NormativeClauseId::V1_3006_AutonomousCmoSupport,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::EndothelialProtectiveSecretome,
            relation: DatasetGraphRelation::ProvidesMechanisticPrior,
        },
        DatasetCatalogEntry {
            code: "DS_22_TRISH_EXPAND_HERMES",
            agency: "NASA TRISH (2026)",
            title: "TRISH EXPAND Commercial Spaceflight Biobank & HERMES EIMO Platform",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_22_TRISH_EXPAND_HERMES",
                950,
                ProvenanceSubstrate::NormativeNasaStd3001,
                AnatomicalRegion::NeckInternalJugularVein,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V1_3006_AutonomousCmoSupport,
                0b001,
            ),
            primary_adhg_target: AdhgNodeKind::PocusThrombusPosterior,
            relation: DatasetGraphRelation::DefinesNormativeThreshold,
        },
        DatasetCatalogEntry {
            code: "DS_23_NASA_JAXA_BISPHOS",
            agency: "NASA-JAXA",
            title: "NASA-JAXA Alendronate + ARED + Potassium Citrate Bone/Renal Protocol",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_23_NASA_JAXA_BISPHOS",
                970,
                ProvenanceSubstrate::MechanisticAgencyPrior,
                AnatomicalRegion::LowerLimbSoleusCalcaneus,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::V2_6026_RenalStoneHydration,
                0b000,
            ),
            primary_adhg_target: AdhgNodeKind::OsteocyteSclerostinSost,
            relation: DatasetGraphRelation::ValidatesCountermeasure,
        },
        DatasetCatalogEntry {
            code: "DS_24_NASA_STD_3001_V1_V2",
            agency: "NASA OCHMO",
            title: "NASA-STD-3001 Vol. 1 Rev C & Vol. 2 Rev F (Jul 2026) + MTB-007",
            descriptor: BiomedicalEvidenceDescriptor::new(
                "DS_24_NASA_STD_3001_V1_V2",
                1000,
                ProvenanceSubstrate::NormativeNasaStd3001,
                AnatomicalRegion::NeckInternalJugularVein,
                SpacecraftHabitatZone::MedOpsUltrasoundBay,
                NormativeClauseId::OchmoMtb007VenousThrombosis,
                0b111,
            ),
            primary_adhg_target: AdhgNodeKind::PocusThrombusPosterior,
            relation: DatasetGraphRelation::DefinesNormativeThreshold,
        },
    ]
}
```

---

## 5. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Creare `crates/ares-causal-graph/src/unified_dataset_graph.rs` con `canonical_24_datasets_catalog()`, `AresUnifiedDatasetGraph` (`StableDiGraph<UnifiedGraphNode, UnifiedGraphEdge>`), e `query_datasets_for_adhg_node(kind: AdhgNodeKind) -> Vec<DatasetCatalogEntry>`.
- [ ] **Step 2:** Implementare `export_graphify_compatible_bundle(&self) -> GraphifyExportBundle` e generare `data/knowledge_graph/ares_dataset_graph.json`.
- [ ] **Step 3:** Aggiornare `crates/ares-server-cli/src/mcp_stdio.rs` per includere i codici dei dataset di grounding nella risposta Context-Mode (`<= 600 byte` / `< 150 token`).
- [ ] **Step 4:** Eseguire `./scripts/agent_probe.sh --fast` verificando 0 errori e 0 warning su tutto il workspace.

---

## 6. Deterministic Verification & Unit Tests

1. **`test_unified_dataset_graph_contains_all_24_unique_official_datasets`:**
   - Verifica che `canonical_24_datasets_catalog()` contenga esattamente 24 dataset con hash `dataset_tag_hash` tutti distinti a coppie (zero collisioni FNV-1a) e che ogni `AdhgNodeKind` abbia almeno 2 dataset collegati nel grafo `StableDiGraph`.
2. **`test_graphify_export_bundle_serializes_valid_json`:**
   - Verifica che `export_graphify_compatible_bundle()` produca un JSON valido con 32 nodi (`24` dataset + `8` nodi `ADHG`) e tutti gli archi cross-layer.
3. **`test_fastmcp_dataset_provenance_query_stays_under_600_bytes`:**
   - Verifica che la sintesi di provenienza per `IjvVenousStasisShearStress` (`DS_01`, `DS_12`, `DS_16`, `DS_24`) serializzata via `FastMCP` rispetti rigorosamente il tetto di `600` byte (`< 150 token`).
