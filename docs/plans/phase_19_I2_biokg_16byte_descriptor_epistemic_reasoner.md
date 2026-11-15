# Piano Implementativo Definitivo — Fase 19 (I2): `ARES-HyperGraph` Layer 3 (`ARES-BioKG`) — `16-byte #[repr(C)] BiomedicalEvidenceDescriptor`, Noisy-OR `EpistemicProvenance`, `ClinicalAnswerabilityGate` & $O(1)$ Normative Grounding (`NASA-STD-3001` Clauses `[V1 3001]..[V2 10001]`)

- **Blocco Architetturale**: Blocco I (*Motore Rust Core: Grafo Ibrido a 3 Livelli `ARES-HyperGraph` & `ARES-DatasetGraph` Multi-Agenzia — `2. EVALUATE` & `3. ACT`*, Fasi 18–20)
- **Fase**: Fase 19 (`I2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principali**: [`crates/ares-causal-graph`](../../crates/ares-causal-graph/README.md) & [`crates/ares-medops-playbooks`](../../crates/ares-medops-playbooks/README.md)
- **Owner Principale**: `ARES-Health Team` (con integrazione Playbooks `ARES-Health Team`)
- **File Target Previsti**:
  1. `crates/ares-causal-graph/src/biokg_ontology.rs` *(NEW)*
  2. `crates/ares-causal-graph/src/lib.rs` *(UPDATE)*
  3. `crates/ares-medops-playbooks/src/playbooks.rs` *(UPDATE opzionale/arricchimento)*
- **Budget Latenza Hot-Path**: $< 5\,\mu\text{s}$ per attraversamento $O(1)$ dei descrittori di evidenza stack-allocated (`16 byte` `#[repr(C)]`, zero allocazioni heap) e valutazione `ClinicalAnswerabilityGate`.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, asserzione statica a tempo di compilazione `assert!(std::mem::size_of::<BiomedicalEvidenceDescriptor>() == 16)`.

---

## 1. Executive Summary & Scientific Grounding (`deep-scholar`)

### 1.1 Visione Architetturale: Provenienza Epistemica Stack-Allocated e Prevenzione delle Allucinazioni
Uno dei rischi piu gravi nell'impiego di assistenti AI in medicina aerospaziale autonoma (*Earth-Independent Medical Operations*, `EIMO`) è la confusione tra substrati di dati eterogenei: mescolare forme d'onda cliniche registrate (`RECORDED_TERRESTRIAL_BIDMC_CSV`), modelli biofisici derivati (`DERIVED_COMPUTED`), prior trascrittomici da studi multi-omici spaziali (`OSD-51`, `OSD-195`, `OSD-818`) e parametri di simulazione *What-If* (`SIMULATED_SCENARIO_INPUT`), oppure emettere diagnosi quando canali critici sono `None` o l'ecografia `POCUS` non è ancora stata acquisita.

Ispirandosi direttamente a `crates/core-types/src/ontology.rs` e `m5_ultra_hyperscale.rs` di `spatiotemporal-mcp-engine-backup` (e alla letteratura 2024–2026: **NASA GeneLab-SPOKE**, **Harvard PrimeKG-Plus**, **BioHarness `arXiv:2606.19396v1`** e **BMC Anesthesiology 2026**), la **Fase 19 (`I2`)** costruisce il **Layer 3 (`ARES-BioKG`)** di `ARES-HyperGraph`:
1. **`BiomedicalEvidenceDescriptor` (`16 byte` `#[repr(C)]`):** Tag immutabile allocato sullo stack che lega in $O(1)$ qualsiasi nodo fisiologico `ADHG` o azione di Playbook all'hash FNV-1a a 64 bit del dataset ufficiale (`OSD-51`, `BIDMC_V1`, `CSA_CANS_2026`, ecc.), alla confidenza quantizzata in basis points (`0..=1000`), al substrato di provenienza (`ProvenanceSubstrate`), alla regione anatomica 3D, alla zona dell'habitat, alla clausola normativa **`NASA-STD-3001` (`[V1 3001]..[V2 10001]` / `MTB-007`)** e alla bitmask dei **3 Hard Clinical Safety Gates**.
2. **Fusione Epistemica Multi-Modale `Noisy-OR` (`EpistemicProvenance`):** Calcola la confidenza congiunta di più fonti indipendenti (es. stasi Doppler + deficit `MQI` + spettrometro neutronico `CANS`) pesata per l'affidabilità del substrato.
3. **`ClinicalAnswerabilityGate` Pre-Esecuzione:** Verifica prima di qualsiasi risposta `FastMCP` o sblocco terapeutico se i prerequisiti osservazionali sono soddisfatti, restituendo `ClinicalAnswerabilityVerdict::Answerable`, `PartiallyAnswerableWithMissingChannels` o `BlockedByMissingEpisodicVerification` (es. quando si richiede terapia anticoagulante senza conferma ecografica B-Mode `pocus_thrombus_confirmed`).

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Meng Xiao, Chuan Qin, Jinmiao Chen et al. (Giugno 2026):**
   * *Titolo:* *"BioHarness: Substrate-Aware Evidence Assembly Across Literature, Knowledge Bases, and Biological Atlases"*, `arXiv:2606.19396v1`.
2. **Payal Chandak, Kexin Huang, Marinka Zitnik (Harvard Medical School, 2023–2026):**
   * *Titolo:* *"Building a knowledge graph to enable precision medicine (PrimeKG)"*, *Scientific Data (Nature)*, Vol. 10, Art. 67 | **DOI:** `10.1038/s41597-023-01960-3`.
3. **Mete Ucdal, Evren Ekingen, Ali Niyazi Kurtcebe (2026):**
   * *Titolo:* *"A neuro-symbolic clinical decision support system using structured derivation traces, adaptive compute, and knowledge graph constraint checking"*, *BMC Anesthesiology* | **DOI:** `10.1186/s12871-026-04316-7`.

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

### 2.1 Layout di Memoria a 16 Byte Esatti (`#[repr(C)]`)

| Campo | Tipo Rust | Offset (Byte) | Dimensione | Significato Architetturale |
| :--- | :--- | :---: | :---: | :--- |
| `dataset_tag_hash` | `u64` | `0..8` | `8 B` | Hash FNV-1a deterministico `const fn` dell'ID dataset (es. `"DS_04_NASA_OSDR_OSD_51"`). |
| `confidence_bp` | `u16` | `8..10` | `2 B` | Confidenza epistemica quantizzata in basis points (`0..=1000` $\leftrightarrow 0.000..=1.000$). |
| `substrate` | `ProvenanceSubstrate` (`u8`) | `10` | `1 B` | Classificazione BioHarness del substrato (`RecordedBidmcCsv`, `DerivedBiophysicalModel`, ecc.). |
| `anatomy` | `AnatomicalRegion` (`u8`) | `11` | `1 B` | Regione anatomica 3D associata (`HeadOcularSans`, `NeckInternalJugularVein`, ecc.). |
| `habitat_zone` | `SpacecraftHabitatZone` (`u8`) | `12` | `1 B` | Compartimento dell'habitat spaziale in cui avviene la misura o contromisura. |
| `normative_clause` | `NormativeClauseId` (`u8`) | `13` | `1 B` | Clausola `NASA-STD-3001 Vol. 1 / Vol. 2` o protocollo `OCHMO MTB-007`. |
| `safety_gate_mask` | `u8` | `14` | `1 B` | Bitmask dei 3 Hard Clinical Safety Gates (`bit 0 = Gate 1`, `bit 1 = Gate 2`, `bit 2 = Gate 3`). |
| `reserved` | `u8` | `15` | `1 B` | Padding esplicito di allineamento per garantire `size_of == 16`. |

### 2.2 Tabella File e Moduli Rust

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 19 (`I2`) |
| :--- | :--- | :--- |
| `crates/ares-causal-graph/src/biokg_ontology.rs` | **CREATE** | Implementa `fnv1a_hash64`, `ProvenanceSubstrate`, `NormativeClauseId`, `BiomedicalEvidenceDescriptor` (`16 B`), `compute_noisy_or_epistemic_confidence` e `ClinicalAnswerabilityGate`. |
| `crates/ares-causal-graph/src/lib.rs` | **UPDATE** | Esporta `pub mod biokg_ontology;`. |

---

## 3. Formulazione Matematica

### 3.1 Hash Deterministico `const fn` FNV-1a a 64 Bit
Per ogni stringa identificativa di dataset $S = (b_0, \dots, b_{m-1})$, l'hash a tempo di compilazione è:
$$h_0 = \text{0xcbf29ce484222325}_{16}, \qquad h_{k+1} = (h_k \oplus b_k) \times \text{0x100000001b3}_{16} \pmod{2^{64}}$$

### 3.2 Fusione Epistemica Multi-Modale `Noisy-OR`
Dato un insieme di $M$ descrittori di evidenza indipendenti $\mathcal{D} = \{d_1, \dots, d_M\}$ con confidenze normalizzate $c_m = \frac{\text{confidence\_bp}_m}{1000.0} \in [0, 1]$ e pesi di affidabilità del substrato $w(s_m) \in (0, 1]$:
$$C_{\text{Noisy-OR}}(\mathcal{D}) = 1.0 - \prod_{m=1}^{M} \Big(1.0 - w(s_m) \cdot c_m\Big)$$

---

## 4. Concrete Rust Signatures & Data Structures (`crates/ares-causal-graph/src/biokg_ontology.rs`)

```rust
//! Fase 19 (I2): ARES-BioKG Layer 3 — 16-Byte #[repr(C)] BiomedicalEvidenceDescriptor,
//! Noisy-OR EpistemicProvenance, ClinicalAnswerabilityGate e Grounding Normativo NASA-STD-3001.

use crate::spatial_habitat_graph::{AnatomicalRegion, SpacecraftHabitatZone};
use serde::{Deserialize, Serialize};

/// Hash FNV-1a a 64 bit valutabile a tempo di compilazione (`const fn`).
#[inline]
pub const fn fnv1a_hash64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut i = 0;
    while i < bytes.len() {
        hash ^= bytes[i] as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
        i += 1;
    }
    hash
}

/// Classificazione del substrato di provenienza (BioHarness arXiv:2606.19396 & Issue #4 Invariant).
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProvenanceSubstrate {
    RecordedTerrestrialBidmcCsv = 0,
    DerivedBiophysicalModel = 1,
    SimulatedScenarioInput = 2,
    MechanisticAgencyPrior = 3,
    NormativeNasaStd3001 = 4,
}

impl ProvenanceSubstrate {
    /// Peso di affidabilita epistemica intrinseca del substrato per la fusione Noisy-OR.
    #[inline]
    pub const fn reliability_weight(self) -> f64 {
        match self {
            Self::RecordedTerrestrialBidmcCsv => 1.00,
            Self::NormativeNasaStd3001 => 1.00,
            Self::DerivedBiophysicalModel => 0.92,
            Self::MechanisticAgencyPrior => 0.88,
            Self::SimulatedScenarioInput => 0.75,
        }
    }
}

/// Identificativo delle clausole normative NASA-STD-3001 Vol. 1 / Vol. 2 e protocolli OCHMO.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NormativeClauseId {
    V1_3001_CrewHealth = 0,
    V1_3002_MusculoskeletalAred = 1,
    V1_3003_PreventiveMonitoring = 2,
    V1_3006_AutonomousCmoSupport = 3,
    V1_4001_RadiationProtection = 4,
    V2_6001_AcousticAndCo2Limits = 5,
    V2_6026_RenalStoneHydration = 6,
    V2_7043_MedicalCapability = 7,
    V2_10001_CrewInterfaceUsability = 8,
    OchmoMtb007VenousThrombosis = 9,
}

impl NormativeClauseId {
    #[inline]
    pub const fn official_code(self) -> &'static str {
        match self {
            Self::V1_3001_CrewHealth => "NASA-STD-3001 [V1 3001]",
            Self::V1_3002_MusculoskeletalAred => "NASA-STD-3001 [V1 3002]",
            Self::V1_3003_PreventiveMonitoring => "NASA-STD-3001 [V1 3003]",
            Self::V1_3006_AutonomousCmoSupport => "NASA-STD-3001 [V1 3006]",
            Self::V1_4001_RadiationProtection => "NASA-STD-3001 [V1 4001]",
            Self::V2_6001_AcousticAndCo2Limits => "NASA-STD-3001 [V2 6001]",
            Self::V2_6026_RenalStoneHydration => "NASA-STD-3001 [V2 6026]",
            Self::V2_7043_MedicalCapability => "NASA-STD-3001 [V2 7043]",
            Self::V2_10001_CrewInterfaceUsability => "NASA-STD-3001 [V2 10001]",
            Self::OchmoMtb007VenousThrombosis => "NASA OCHMO MTB-007",
        }
    }
}

/// Descrittore di evidenza biomedica da 16 byte esatti allocato sullo stack (`#[repr(C)]`).
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BiomedicalEvidenceDescriptor {
    pub dataset_tag_hash: u64,
    pub confidence_bp: u16,
    pub substrate: ProvenanceSubstrate,
    pub anatomy: AnatomicalRegion,
    pub habitat_zone: SpacecraftHabitatZone,
    pub normative_clause: NormativeClauseId,
    pub safety_gate_mask: u8,
    pub reserved: u8,
}

const _: () = assert!(
    std::mem::size_of::<BiomedicalEvidenceDescriptor>() == 16,
    "BiomedicalEvidenceDescriptor must occupy exactly 16 bytes"
);

impl BiomedicalEvidenceDescriptor {
    #[inline]
    pub const fn new(
        dataset_id: &str,
        confidence_bp: u16,
        substrate: ProvenanceSubstrate,
        anatomy: AnatomicalRegion,
        habitat_zone: SpacecraftHabitatZone,
        normative_clause: NormativeClauseId,
        safety_gate_mask: u8,
    ) -> Self {
        let clamped_bp = if confidence_bp > 1000 {
            1000
        } else {
            confidence_bp
        };
        Self {
            dataset_tag_hash: fnv1a_hash64(dataset_id.as_bytes()),
            confidence_bp: clamped_bp,
            substrate,
            anatomy,
            habitat_zone,
            normative_clause,
            safety_gate_mask,
            reserved: 0,
        }
    }

    #[inline]
    pub fn normalized_confidence(&self) -> f64 {
        (self.confidence_bp as f64 / 1000.0).clamp(0.0, 1.0)
    }
}

/// Calcola la confidenza epistemica combinata Noisy-OR su una slice di descrittori.
#[inline]
pub fn compute_noisy_or_epistemic_confidence(descriptors: &[BiomedicalEvidenceDescriptor]) -> f64 {
    if descriptors.is_empty() {
        return 0.0;
    }
    let mut prod_complement = 1.0;
    for d in descriptors {
        let weighted_c =
            (d.normalized_confidence() * d.substrate.reliability_weight()).clamp(0.0, 1.0);
        prod_complement *= 1.0 - weighted_c;
    }
    (1.0 - prod_complement).clamp(0.0, 1.0)
}

/// Verdetto del gate di rispondiibilita clinica pre-esecuzione (AnswerabilityGate).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClinicalAnswerabilityVerdict {
    /// Tutte le modalita richieste sono presenti e verificate.
    Answerable { combined_confidence_bp: u16 },
    /// Alcuni canali biometrici sono None (es. PULSE/SpO2 in bidmc_01), ma i modelli causali sono attivi.
    PartiallyAnswerableWithMissingChannels {
        missing_count: usize,
        combined_confidence_bp: u16,
    },
    /// Azione o diagnosi bloccata per assenza di verifica episodica obbligatoria (es. POCUS B-mode).
    BlockedByMissingEpisodicVerification {
        required_modality: &'static str,
        enforced_clause: &'static str,
    },
}

/// Valuta se una query clinica o contromisura e autorizzata dal profilo di evidenza disponibile.
pub fn evaluate_clinical_answerability_gate(
    descriptors: &[BiomedicalEvidenceDescriptor],
    missing_channels_count: usize,
    requests_anticoagulation: bool,
    pocus_thrombus_confirmed: bool,
) -> ClinicalAnswerabilityVerdict {
    if requests_anticoagulation && !pocus_thrombus_confirmed {
        return ClinicalAnswerabilityVerdict::BlockedByMissingEpisodicVerification {
            required_modality: "POCUS_B_MODE_IJV_COMPRESSION",
            enforced_clause: NormativeClauseId::OchmoMtb007VenousThrombosis.official_code(),
        };
    }

    let conf = compute_noisy_or_epistemic_confidence(descriptors);
    let conf_bp = (conf * 1000.0).round() as u16;

    if missing_channels_count > 0 {
        ClinicalAnswerabilityVerdict::PartiallyAnswerableWithMissingChannels {
            missing_count: missing_channels_count,
            combined_confidence_bp: conf_bp,
        }
    } else {
        ClinicalAnswerabilityVerdict::Answerable {
            combined_confidence_bp: conf_bp,
        }
    }
}
```

---

## 5. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Creare `crates/ares-causal-graph/src/biokg_ontology.rs` con `fnv1a_hash64`, `ProvenanceSubstrate`, `NormativeClauseId` e `BiomedicalEvidenceDescriptor` (`#[repr(C)]`, `16 byte` verificati a compile-time).
- [ ] **Step 2:** Implementare `compute_noisy_or_epistemic_confidence` e `evaluate_clinical_answerability_gate` per intercettare richieste di anticoagulazione prive di conferma POCUS (`BlockedByMissingEpisodicVerification`) e segnalare i canali `None` (`PartiallyAnswerableWithMissingChannels`).
- [ ] **Step 3:** Esportare `pub mod biokg_ontology;` in `crates/ares-causal-graph/src/lib.rs` ed eseguire `cargo test -p ares-causal-graph` e `cargo clippy -p ares-causal-graph --all-targets -- -D warnings`.

---

## 6. Deterministic Verification & Unit Tests

1. **`test_biomedical_evidence_descriptor_is_exactly_16_bytes`:**
   - Verifica a runtime e compile-time `std::mem::size_of::<BiomedicalEvidenceDescriptor>() == 16` e che `fnv1a_hash64(b"DS_04_NASA_OSDR_OSD_51")` sia deterministico e diverso da `"DS_07_NASA_OSDR_OSD_818"`.
2. **`test_noisy_or_epistemic_confidence_increases_monotonically_with_independent_evidence`:**
   - Verifica che combinando un descrittore `RecordedTerrestrialBidmcCsv` ($c = 0.80$) con un descrittore `MechanisticAgencyPrior` ($c = 0.75$) la confidenza `Noisy-OR` superi ciascuna confidenza singola e resti $\le 1.0$.
3. **`test_clinical_answerability_gate_blocks_anticoagulation_without_pocus`:**
   - Verifica che con `requests_anticoagulation = true` e `pocus_thrombus_confirmed = false`, il gate restituisca `BlockedByMissingEpisodicVerification { required_modality: "POCUS_B_MODE_IJV_COMPRESSION", enforced_clause: "NASA OCHMO MTB-007" }`.
