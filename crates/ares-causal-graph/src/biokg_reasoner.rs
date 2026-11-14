//! Fase 19 (Blocco I2): `ARES-HyperGraph` Layer 3 (`ARES-BioKG`).
//!
//! 1. **16-Byte Hardware-Aligned `BiomedicalEvidenceDescriptor`:** `#[repr(C, align(16))]`
//!    stack-allocated descriptor packing dataset ID, `NASA-STD-3001` clause ID, LOINC
//!    biomarker code, `UBERON:` anatomical ID, Q8.8 Cohen's d effect size, sample size,
//!    evidence grade, countermeasure ID, deontic gate flags, and a CRC-8 integrity tag.
//! 2. **Multi-Modal Noisy-OR `EpistemicProvenance`:** Fuses independent evidence
//!    channels (`Telemetry`, `Pocus`, `OmicsPrior`, `NormativeStandard`) via
//!    `P = 1 - prod_i (1 - c_i * w_i)`.
//! 3. **`ClinicalAnswerabilityGate`:** Enforces pre-execution answerability across
//!    `Answerable`, `UncertainWithCaveat`, and `AbstainInsufficientData` (blocking
//!    unverified anticoagulation under `NASA OCHMO MTB-007` and missing-channel states).
//! 4. **O(1) Normative & Clinical Grounding:** Maps `AdhgNodeKind` physiological
//!    states directly to `NASA-STD-3001 Vol. 1 & Vol. 2` clauses (`[V1 3001]`-`[V2 10001]`),
//!    `MTB-007`, and `PLAYBOOK_01`..`PLAYBOOK_05`.

use crate::adhg_graph::AdhgNodeKind;
use crate::error::CausalGraphError;
use crate::hypergraph_spatial::{AnatomicalRegionId, HabitatZoneId};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// Deterministic 64-bit FNV-1a hash evaluated at compile time (`const fn`).
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

/// Bitmasks for `BiomedicalEvidenceDescriptor::deontic_flags`.
pub mod deontic_flags {
    /// Safety Gate 1: Anticoagulant lock active unless POCUS thrombus is confirmed.
    pub const GATE1_ANTICOAGULANT_LOCK: u8 = 1 << 0;
    /// Safety Gate 2: LBNP chamber auto-vent armed (2700 s max dwell / SBP drop <= 15 mmHg).
    pub const GATE2_LBNP_AUTO_VENT: u8 = 1 << 1;
    /// Safety Gate 3: Martian 0.38 g EVA suit ankle damping required when GAI > 12%.
    pub const GATE3_EVA_SUIT_DAMPING: u8 = 1 << 2;
    /// Mandatory episodic B-mode POCUS verification before pharmacological unlock.
    pub const REQUIRES_POCUS_CONFIRMATION: u8 = 1 << 3;
    /// Mandatory Storm Shelter relocation when radiation > 1.5 mSv/day (`[V1 4001]`).
    pub const MANDATORY_STORM_SHELTER: u8 = 1 << 4;
}

/// Epistemic modality / substrate classification (BioHarness arXiv:2606.19396).
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EpistemicModality {
    /// Continuous or episodic physiological telemetry (e.g., BIDMC CSV, wearable PPG/ECG).
    Telemetry = 0,
    /// Episodic point-of-care ultrasound B-mode / Doppler verification (POCUS).
    Pocus = 1,
    /// Multi-agency spaceflight / HDBR omics or longitudinal prior (NASA OSDR / SPOKE).
    OmicsPrior = 2,
    /// Mandatory aerospace medical standard (`NASA-STD-3001`, `OCHMO MTB-007`).
    NormativeStandard = 3,
}

impl EpistemicModality {
    /// Default substrate reliability weight `w_i in (0, 1]` for Noisy-OR fusion.
    #[inline]
    pub const fn default_weight(self) -> f64 {
        match self {
            Self::NormativeStandard => 1.00,
            Self::Pocus => 0.96,
            Self::Telemetry => 0.90,
            Self::OmicsPrior => 0.85,
        }
    }

    #[inline]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Telemetry => "Telemetry",
            Self::Pocus => "POCUS",
            Self::OmicsPrior => "OmicsPrior",
            Self::NormativeStandard => "NormativeStandard",
        }
    }
}

/// Evidence quality grade (GRADE-aligned, stored in `BiomedicalEvidenceDescriptor::evidence_grade`).
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EvidenceGrade {
    VeryLow = 1,
    Low = 2,
    Moderate = 3,
    High = 4,
    NormativeMandatory = 5,
}

impl EvidenceGrade {
    #[inline]
    pub const fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(Self::VeryLow),
            2 => Some(Self::Low),
            3 => Some(Self::Moderate),
            4 => Some(Self::High),
            5 => Some(Self::NormativeMandatory),
            _ => None,
        }
    }
}

/// Normative clauses from `NASA-STD-3001 Vol. 1 Rev C`, `Vol. 2 Rev F`, and `OCHMO MTB-007`.
#[repr(u16)]
#[allow(non_camel_case_types)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NormativeClauseId {
    V1_3001_CrewHealth = 3001,
    V1_3002_MusculoskeletalAred = 3002,
    V1_3003_PreventiveMonitoring = 3003,
    V1_3006_AutonomousCmoSupport = 3006,
    V1_4001_RadiationProtection = 4001,
    V2_6001_AcousticAndCo2Limits = 6001,
    V2_6026_RenalStoneHydration = 6026,
    V2_7043_MedicalCapability = 7043,
    V2_10001_CrewInterfaceUsability = 10001,
    OchmoMtb007VenousThrombosis = 7,
}

impl NormativeClauseId {
    pub const ALL: [Self; 10] = [
        Self::V1_3001_CrewHealth,
        Self::V1_3002_MusculoskeletalAred,
        Self::V1_3003_PreventiveMonitoring,
        Self::V1_3006_AutonomousCmoSupport,
        Self::V1_4001_RadiationProtection,
        Self::V2_6001_AcousticAndCo2Limits,
        Self::V2_6026_RenalStoneHydration,
        Self::V2_7043_MedicalCapability,
        Self::V2_10001_CrewInterfaceUsability,
        Self::OchmoMtb007VenousThrombosis,
    ];

    #[inline]
    pub const fn numeric_id(self) -> u16 {
        self as u16
    }

    #[inline]
    pub const fn from_numeric_id(id: u16) -> Option<Self> {
        match id {
            3001 => Some(Self::V1_3001_CrewHealth),
            3002 => Some(Self::V1_3002_MusculoskeletalAred),
            3003 => Some(Self::V1_3003_PreventiveMonitoring),
            3006 => Some(Self::V1_3006_AutonomousCmoSupport),
            4001 => Some(Self::V1_4001_RadiationProtection),
            6001 => Some(Self::V2_6001_AcousticAndCo2Limits),
            6026 => Some(Self::V2_6026_RenalStoneHydration),
            7043 => Some(Self::V2_7043_MedicalCapability),
            10001 => Some(Self::V2_10001_CrewInterfaceUsability),
            7 => Some(Self::OchmoMtb007VenousThrombosis),
            _ => None,
        }
    }

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

    #[inline]
    pub const fn summary(self) -> &'static str {
        match self {
            Self::V1_3001_CrewHealth => "Crew health maintenance, fitness-for-duty and clinical risk governance",
            Self::V1_3002_MusculoskeletalAred => "Resistive loading and bone/muscle countermeasure sufficiency (ARED)",
            Self::V1_3003_PreventiveMonitoring => "Continuous preventive medical monitoring and vascular/ocular surveillance",
            Self::V1_3006_AutonomousCmoSupport => "Earth-independent autonomous Crew Medical Officer decision support",
            Self::V1_4001_RadiationProtection => "ALARA solar particle event protection and neutron radiation limits",
            Self::V2_6001_AcousticAndCo2Limits => "Habitability acoustic ceiling (<= 50 dBA sleep) and ppCO2 bounds",
            Self::V2_6026_RenalStoneHydration => "Renal stone mitigation via hydration and potassium citrate buffering",
            Self::V2_7043_MedicalCapability => "In-flight ultrasound, telemetry and countermeasure capability readiness",
            Self::V2_10001_CrewInterfaceUsability => "Medical display clarity, uncertainty disclosure and non-deceptive UI",
            Self::OchmoMtb007VenousThrombosis => "IJV stasis/thrombosis diagnostic gating requiring B-mode POCUS before anticoagulation",
        }
    }
}

/// 16-byte hardware-aligned biomedical evidence descriptor (`#[repr(C, align(16))]`).
#[repr(C, align(16))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BiomedicalEvidenceDescriptor {
    pub dataset_id: u16,
    pub nasa_std_clause_id: u16,
    pub biomarker_loinc_code: u16,
    pub anatomical_uberon_id: u16,
    /// Signed Q8.8 fixed-point Cohen's d effect size (value * 256).
    pub effect_size_cohen_d_q8: i16,
    pub sample_size_n: u16,
    pub evidence_grade: u8,
    pub countermeasure_id: u8,
    pub deontic_flags: u8,
    /// CRC-8-CCITT (poly 0x07) over the preceding 15 little-endian bytes.
    pub reserved_crc: u8,
}

const _: () = assert!(core::mem::size_of::<BiomedicalEvidenceDescriptor>() == 16);
const _: () = assert!(core::mem::align_of::<BiomedicalEvidenceDescriptor>() == 16);

impl BiomedicalEvidenceDescriptor {
    /// Deterministic CRC-8-CCITT (polynomial 0x07) over the 15 payload bytes.
    #[inline]
    #[allow(clippy::too_many_arguments)]
    pub const fn compute_crc8(
        dataset_id: u16,
        nasa_std_clause_id: u16,
        biomarker_loinc_code: u16,
        anatomical_uberon_id: u16,
        effect_size_cohen_d_q8: i16,
        sample_size_n: u16,
        evidence_grade: u8,
        countermeasure_id: u8,
        deontic_flags: u8,
    ) -> u8 {
        let d_le = dataset_id.to_le_bytes();
        let c_le = nasa_std_clause_id.to_le_bytes();
        let l_le = biomarker_loinc_code.to_le_bytes();
        let u_le = anatomical_uberon_id.to_le_bytes();
        let e_le = effect_size_cohen_d_q8.to_le_bytes();
        let n_le = sample_size_n.to_le_bytes();
        let bytes: [u8; 15] = [
            d_le[0], d_le[1],
            c_le[0], c_le[1],
            l_le[0], l_le[1],
            u_le[0], u_le[1],
            e_le[0], e_le[1],
            n_le[0], n_le[1],
            evidence_grade,
            countermeasure_id,
            deontic_flags,
        ];
        let mut crc: u8 = 0x00;
        let mut i = 0;
        while i < bytes.len() {
            crc ^= bytes[i];
            let mut b = 0;
            while b < 8 {
                if (crc & 0x80) != 0 {
                    crc = (crc << 1) ^ 0x07;
                } else {
                    crc <<= 1;
                }
                b += 1;
            }
            i += 1;
        }
        crc
    }

    /// Constructs a descriptor with a valid CRC-8 seal at compile time or runtime.
    #[inline]
    #[allow(clippy::too_many_arguments)]
    pub const fn new(
        dataset_id: u16,
        nasa_std_clause_id: u16,
        biomarker_loinc_code: u16,
        anatomical_uberon_id: u16,
        effect_size_cohen_d_q8: i16,
        sample_size_n: u16,
        evidence_grade: u8,
        countermeasure_id: u8,
        deontic_flags: u8,
    ) -> Self {
        let reserved_crc = Self::compute_crc8(
            dataset_id,
            nasa_std_clause_id,
            biomarker_loinc_code,
            anatomical_uberon_id,
            effect_size_cohen_d_q8,
            sample_size_n,
            evidence_grade,
            countermeasure_id,
            deontic_flags,
        );
        Self {
            dataset_id,
            nasa_std_clause_id,
            biomarker_loinc_code,
            anatomical_uberon_id,
            effect_size_cohen_d_q8,
            sample_size_n,
            evidence_grade,
            countermeasure_id,
            deontic_flags,
            reserved_crc,
        }
    }

    /// Quantizes a floating-point Cohen's d into Q8.8 (`i16`) with clamping.
    #[inline]
    pub fn cohen_d_to_q8(d: f64) -> i16 {
        if !d.is_finite() {
            return 0;
        }
        (d * 256.0).round().clamp(i16::MIN as f64, i16::MAX as f64) as i16
    }

    /// Decodes `effect_size_cohen_d_q8` back to `f64`.
    #[inline]
    pub fn cohen_d(&self) -> f64 {
        (self.effect_size_cohen_d_q8 as f64) / 256.0
    }

    /// Verifies the embedded CRC-8 against the 15 payload bytes.
    #[inline]
    pub fn verify_crc(&self) -> Result<(), CausalGraphError> {
        let expected = Self::compute_crc8(
            self.dataset_id,
            self.nasa_std_clause_id,
            self.biomarker_loinc_code,
            self.anatomical_uberon_id,
            self.effect_size_cohen_d_q8,
            self.sample_size_n,
            self.evidence_grade,
            self.countermeasure_id,
            self.deontic_flags,
        );
        if self.reserved_crc == expected {
            Ok(())
        } else {
            Err(CausalGraphError::DescriptorCrcMismatch {
                stored: self.reserved_crc,
                computed: expected,
            })
        }
    }

    /// Maps `evidence_grade` (1..=5) to a normalized `[0, 1]` confidence prior.
    #[inline]
    pub fn normalized_grade_confidence(&self) -> f64 {
        match self.evidence_grade {
            5 => 1.00,
            4 => 0.90,
            3 => 0.78,
            2 => 0.60,
            1 => 0.40,
            _ => 0.25,
        }
    }

    /// Resolves the `NormativeClauseId` in O(1) when recognized.
    #[inline]
    pub const fn normative_clause(&self) -> Option<NormativeClauseId> {
        NormativeClauseId::from_numeric_id(self.nasa_std_clause_id)
    }

    /// Resolves the `AnatomicalRegionId` in O(1) when recognized.
    #[inline]
    pub const fn anatomical_region(&self) -> Option<AnatomicalRegionId> {
        AnatomicalRegionId::from_uberon_numeric(self.anatomical_uberon_id)
    }
}

/// One independent evidence contribution in `EpistemicProvenance`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct EvidenceContribution {
    pub modality: EpistemicModality,
    /// Raw observation confidence `c_i in [0, 1]`.
    pub confidence: f64,
    /// Modality reliability weight `w_i in [0, 1]`.
    pub weight: f64,
}

impl EvidenceContribution {
    #[inline]
    pub fn new(modality: EpistemicModality, confidence: f64) -> Self {
        Self {
            modality,
            confidence: if confidence.is_finite() {
                confidence.clamp(0.0, 1.0)
            } else {
                0.0
            },
            weight: modality.default_weight(),
        }
    }

    #[inline]
    pub fn with_weight(modality: EpistemicModality, confidence: f64, weight: f64) -> Self {
        Self {
            modality,
            confidence: if confidence.is_finite() {
                confidence.clamp(0.0, 1.0)
            } else {
                0.0
            },
            weight: if weight.is_finite() {
                weight.clamp(0.0, 1.0)
            } else {
                0.0
            },
        }
    }
}

/// Multi-modal epistemic provenance implementing Noisy-OR fusion
/// `P = 1 - prod_i (1 - c_i * w_i)` across Telemetry, POCUS, Omics Prior, and Normative Standard.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct EpistemicProvenance {
    pub telemetry_confidence: Option<f64>,
    pub pocus_confidence: Option<f64>,
    pub omics_prior_confidence: Option<f64>,
    pub normative_standard_confidence: Option<f64>,
    pub extra_contributions: Vec<EvidenceContribution>,
}

impl EpistemicProvenance {
    #[inline]
    pub fn from_modalities(
        telemetry: Option<f64>,
        pocus: Option<f64>,
        omics_prior: Option<f64>,
        normative_standard: Option<f64>,
    ) -> Self {
        Self {
            telemetry_confidence: telemetry,
            pocus_confidence: pocus,
            omics_prior_confidence: omics_prior,
            normative_standard_confidence: normative_standard,
            extra_contributions: Vec::new(),
        }
    }

    /// Collects all active finite contributions with their modality weights.
    pub fn active_contributions(&self) -> Vec<EvidenceContribution> {
        let mut out = Vec::with_capacity(4 + self.extra_contributions.len());
        let base = [
            (EpistemicModality::Telemetry, self.telemetry_confidence),
            (EpistemicModality::Pocus, self.pocus_confidence),
            (EpistemicModality::OmicsPrior, self.omics_prior_confidence),
            (
                EpistemicModality::NormativeStandard,
                self.normative_standard_confidence,
            ),
        ];
        for (modality, val) in base {
            if let Some(c) = val.filter(|v| v.is_finite()) {
                out.push(EvidenceContribution::new(modality, c));
            }
        }
        out.extend_from_slice(&self.extra_contributions);
        out
    }

    /// Adds a `BiomedicalEvidenceDescriptor` as an `OmicsPrior` or `NormativeStandard`
    /// evidence contribution, verifying its CRC-8 first.
    pub fn add_descriptor(
        &mut self,
        descriptor: &BiomedicalEvidenceDescriptor,
    ) -> Result<(), CausalGraphError> {
        descriptor.verify_crc()?;
        let modality = if descriptor.evidence_grade >= EvidenceGrade::NormativeMandatory as u8 {
            EpistemicModality::NormativeStandard
        } else {
            EpistemicModality::OmicsPrior
        };
        self.extra_contributions.push(EvidenceContribution::new(
            modality,
            descriptor.normalized_grade_confidence(),
        ));
        Ok(())
    }

    /// Noisy-OR fused epistemic confidence `P = 1 - prod_i (1 - c_i * w_i)` in `[0, 1]`.
    pub fn noisy_or_confidence(&self) -> f64 {
        let contribs = self.active_contributions();
        if contribs.is_empty() {
            return 0.0;
        }
        let mut complement = 1.0_f64;
        for c in contribs {
            let term = (c.confidence * c.weight).clamp(0.0, 1.0);
            complement *= 1.0 - term;
        }
        (1.0 - complement).clamp(0.0, 1.0)
    }

    /// Number of distinct primary modalities present among the 4 core channels.
    #[inline]
    pub fn active_primary_modalities(&self) -> usize {
        [
            self.telemetry_confidence,
            self.pocus_confidence,
            self.omics_prior_confidence,
            self.normative_standard_confidence,
        ]
        .iter()
        .filter(|v| v.is_some_and(f64::is_finite))
        .count()
    }
}

/// Pre-execution clinical answerability verdict returned by `ClinicalAnswerabilityGate`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ClinicalAnswerabilityGate {
    /// All required observational prerequisites are present and epistemic confidence
    /// exceeds the configured threshold.
    Answerable {
        combined_confidence: f64,
        active_modalities: usize,
        rationale: Cow<'static, str>,
    },
    /// Core inference can proceed, but missing telemetry channels or incomplete
    /// corroboration require an explicit epistemic caveat under `[V2 10001]`.
    UncertainWithCaveat {
        combined_confidence: f64,
        missing_channels: usize,
        caveat: Cow<'static, str>,
        enforced_clause: Cow<'static, str>,
    },
    /// Mandatory observational verification is absent or epistemic confidence is too
    /// low; the engine must abstain from clinical recommendation.
    AbstainInsufficientData {
        combined_confidence: f64,
        reason: Cow<'static, str>,
        required_modality: Cow<'static, str>,
        enforced_clause: Cow<'static, str>,
    },
}

/// Evaluates `ClinicalAnswerabilityGate` prior to FastMCP response or playbook unlock.
pub fn evaluate_clinical_answerability_gate(
    provenance: &EpistemicProvenance,
    missing_channels_count: usize,
    requests_anticoagulation: bool,
    pocus_thrombus_confirmed: bool,
    min_confidence_threshold: f64,
) -> ClinicalAnswerabilityGate {
    let combined = provenance.noisy_or_confidence();
    let active = provenance.active_primary_modalities();

    if requests_anticoagulation && !pocus_thrombus_confirmed {
        return ClinicalAnswerabilityGate::AbstainInsufficientData {
            combined_confidence: combined,
            reason: Cow::Borrowed("Anticoagulant therapy prohibited without B-mode POCUS thrombus confirmation"),
            required_modality: Cow::Borrowed("POCUS_B_MODE_IJV_COMPRESSION"),
            enforced_clause: Cow::Borrowed(NormativeClauseId::OchmoMtb007VenousThrombosis.official_code()),
        };
    }

    let threshold = if min_confidence_threshold.is_finite() {
        min_confidence_threshold.clamp(0.0, 1.0)
    } else {
        0.55
    };

    if active == 0 || combined < threshold {
        return ClinicalAnswerabilityGate::AbstainInsufficientData {
            combined_confidence: combined,
            reason: Cow::Borrowed("Insufficient multi-modal epistemic support for autonomous clinical guidance"),
            required_modality: Cow::Borrowed("TELEMETRY_OR_POCUS_VERIFICATION"),
            enforced_clause: Cow::Borrowed(NormativeClauseId::V2_10001_CrewInterfaceUsability.official_code()),
        };
    }

    if missing_channels_count > 0 || active < 2 {
        return ClinicalAnswerabilityGate::UncertainWithCaveat {
            combined_confidence: combined,
            missing_channels: missing_channels_count,
            caveat: Cow::Borrowed("Missing channels or single-modality support; disclose uncertainty and keep Safety Gates armed"),
            enforced_clause: Cow::Borrowed(NormativeClauseId::V2_10001_CrewInterfaceUsability.official_code()),
        };
    }

    ClinicalAnswerabilityGate::Answerable {
        combined_confidence: combined,
        active_modalities: active,
        rationale: Cow::Borrowed("Multi-modal Noisy-OR threshold satisfied with episodic/normative grounding"),
    }
}

/// Canonical O(1) normative and clinical grounding record for an `AdhgNodeKind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormativeClinicalGrounding {
    pub adhg_node: AdhgNodeKind,
    pub normative_clause: NormativeClauseId,
    pub anatomical_region: AnatomicalRegionId,
    pub habitat_zone: HabitatZoneId,
    pub playbook_id: &'static str,
    pub playbook_number: u8,
    pub descriptor: BiomedicalEvidenceDescriptor,
}

const GROUNDING_TABLE: [NormativeClinicalGrounding; 8] = [
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::AredMechanicalLoad,
        normative_clause: NormativeClauseId::V1_3002_MusculoskeletalAred,
        anatomical_region: AnatomicalRegionId::SoleusCalcaneus,
        habitat_zone: HabitatZoneId::AredExerciseBay,
        playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED",
        playbook_number: 3,
        descriptor: BiomedicalEvidenceDescriptor::new(
            13, // DS_13 Zero T2 & CIPHER
            NormativeClauseId::V1_3002_MusculoskeletalAred.numeric_id(),
            8050,
            AnatomicalRegionId::SoleusCalcaneus.uberon_numeric(),
            307, // d = +1.20
            48,
            EvidenceGrade::High as u8,
            3,
            deontic_flags::GATE3_EVA_SUIT_DAMPING,
        ),
    },
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::SoleusMuscleQualityMqi,
        normative_clause: NormativeClauseId::V1_3002_MusculoskeletalAred,
        anatomical_region: AnatomicalRegionId::SoleusCalcaneus,
        habitat_zone: HabitatZoneId::AredExerciseBay,
        playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED",
        playbook_number: 3,
        descriptor: BiomedicalEvidenceDescriptor::new(
            1, // DS_01 OSD-51
            NormativeClauseId::V1_3002_MusculoskeletalAred.numeric_id(),
            8051,
            AnatomicalRegionId::SoleusCalcaneus.uberon_numeric(),
            -282, // d = -1.10
            24,
            EvidenceGrade::High as u8,
            3,
            deontic_flags::GATE3_EVA_SUIT_DAMPING,
        ),
    },
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::OsteocyteSclerostinSost,
        normative_clause: NormativeClauseId::V2_6026_RenalStoneHydration,
        anatomical_region: AnatomicalRegionId::SoleusCalcaneus,
        habitat_zone: HabitatZoneId::MedOpsUltrasoundBay,
        playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED",
        playbook_number: 3,
        descriptor: BiomedicalEvidenceDescriptor::new(
            22, // LSAH Longitudinal
            NormativeClauseId::V2_6026_RenalStoneHydration.numeric_id(),
            8052,
            AnatomicalRegionId::SoleusCalcaneus.uberon_numeric(),
            269, // d = +1.05
            120,
            EvidenceGrade::High as u8,
            3,
            0,
        ),
    },
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::EndothelialProtectiveSecretome,
        normative_clause: NormativeClauseId::V1_3006_AutonomousCmoSupport,
        anatomical_region: AnatomicalRegionId::HeartCardioAutonomic,
        habitat_zone: HabitatZoneId::AredExerciseBay,
        playbook_id: "PLAYBOOK_01_VENOUS_STASIS_LBNP",
        playbook_number: 1,
        descriptor: BiomedicalEvidenceDescriptor::new(
            2, // OSD-195
            NormativeClauseId::V1_3006_AutonomousCmoSupport.numeric_id(),
            8053,
            AnatomicalRegionId::HeartCardioAutonomic.uberon_numeric(),
            -218, // d = -0.85
            24,
            EvidenceGrade::Moderate as u8,
            1,
            deontic_flags::GATE1_ANTICOAGULANT_LOCK | deontic_flags::GATE2_LBNP_AUTO_VENT,
        ),
    },
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::CansRadiationOxidativeStress,
        normative_clause: NormativeClauseId::V1_4001_RadiationProtection,
        anatomical_region: AnatomicalRegionId::BrainVestibularCns,
        habitat_zone: HabitatZoneId::RadiationStormShelter,
        playbook_id: "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS",
        playbook_number: 5,
        descriptor: BiomedicalEvidenceDescriptor::new(
            7, // CSA CANS
            NormativeClauseId::V1_4001_RadiationProtection.numeric_id(),
            8054,
            AnatomicalRegionId::BrainVestibularCns.uberon_numeric(),
            346, // d = +1.35
            32,
            EvidenceGrade::NormativeMandatory as u8,
            5,
            deontic_flags::MANDATORY_STORM_SHELTER,
        ),
    },
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::IjvVenousStasisShearStress,
        normative_clause: NormativeClauseId::OchmoMtb007VenousThrombosis,
        anatomical_region: AnatomicalRegionId::InternalJugularVein,
        habitat_zone: HabitatZoneId::LbnpChamber,
        playbook_id: "PLAYBOOK_01_VENOUS_STASIS_LBNP",
        playbook_number: 1,
        descriptor: BiomedicalEvidenceDescriptor::new(
            6, // NASA-0000100 / Venous Haemostasis
            NormativeClauseId::OchmoMtb007VenousThrombosis.numeric_id(),
            8055,
            AnatomicalRegionId::InternalJugularVein.uberon_numeric(),
            -320, // d = -1.25
            36,
            EvidenceGrade::NormativeMandatory as u8,
            1,
            deontic_flags::GATE1_ANTICOAGULANT_LOCK
                | deontic_flags::GATE2_LBNP_AUTO_VENT
                | deontic_flags::REQUIRES_POCUS_CONFIRMATION,
        ),
    },
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::PocusThrombusPosterior,
        normative_clause: NormativeClauseId::OchmoMtb007VenousThrombosis,
        anatomical_region: AnatomicalRegionId::InternalJugularVein,
        habitat_zone: HabitatZoneId::MedOpsUltrasoundBay,
        playbook_id: "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS",
        playbook_number: 2,
        descriptor: BiomedicalEvidenceDescriptor::new(
            24, // OCHMO MTB-007 / NASA-STD-3001
            NormativeClauseId::OchmoMtb007VenousThrombosis.numeric_id(),
            8056,
            AnatomicalRegionId::InternalJugularVein.uberon_numeric(),
            410, // d = +1.60
            64,
            EvidenceGrade::NormativeMandatory as u8,
            2,
            deontic_flags::GATE1_ANTICOAGULANT_LOCK | deontic_flags::REQUIRES_POCUS_CONFIRMATION,
        ),
    },
    NormativeClinicalGrounding {
        adhg_node: AdhgNodeKind::SansTranslaminarGradient,
        normative_clause: NormativeClauseId::V1_3003_PreventiveMonitoring,
        anatomical_region: AnatomicalRegionId::EyeOcularSans,
        habitat_zone: HabitatZoneId::MedOpsUltrasoundBay,
        playbook_id: "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION",
        playbook_number: 4,
        descriptor: BiomedicalEvidenceDescriptor::new(
            3, // OSD-818
            NormativeClauseId::V1_3003_PreventiveMonitoring.numeric_id(),
            8057,
            AnatomicalRegionId::EyeOcularSans.uberon_numeric(),
            294, // d = +1.15
            28,
            EvidenceGrade::High as u8,
            4,
            deontic_flags::GATE2_LBNP_AUTO_VENT,
        ),
    },
];

/// O(1) lookup connecting any `AdhgNodeKind` to its normative `NASA-STD-3001` /
/// `MTB-007` clause, UBERON anatomical region, habitat zone, Playbook ID, and
/// 16-byte `BiomedicalEvidenceDescriptor`.
#[inline]
pub const fn ground_adhg_node_o1(kind: AdhgNodeKind) -> &'static NormativeClinicalGrounding {
    let idx = match kind {
        AdhgNodeKind::AredMechanicalLoad => 0,
        AdhgNodeKind::SoleusMuscleQualityMqi => 1,
        AdhgNodeKind::OsteocyteSclerostinSost => 2,
        AdhgNodeKind::EndothelialProtectiveSecretome => 3,
        AdhgNodeKind::CansRadiationOxidativeStress => 4,
        AdhgNodeKind::IjvVenousStasisShearStress => 5,
        AdhgNodeKind::PocusThrombusPosterior => 6,
        AdhgNodeKind::SansTranslaminarGradient => 7,
    };
    &GROUNDING_TABLE[idx]
}

/// Returns the entire static 8-entry normative grounding table.
#[inline]
pub const fn all_normative_groundings() -> &'static [NormativeClinicalGrounding; 8] {
    &GROUNDING_TABLE
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_biomedical_evidence_descriptor_is_exactly_16_bytes_and_crc_valid() {
        assert_eq!(core::mem::size_of::<BiomedicalEvidenceDescriptor>(), 16);
        assert_eq!(core::mem::align_of::<BiomedicalEvidenceDescriptor>(), 16);

        let desc = BiomedicalEvidenceDescriptor::new(
            1,
            NormativeClauseId::OchmoMtb007VenousThrombosis.numeric_id(),
            8867,
            AnatomicalRegionId::InternalJugularVein.uberon_numeric(),
            BiomedicalEvidenceDescriptor::cohen_d_to_q8(1.25),
            42,
            EvidenceGrade::High as u8,
            1,
            deontic_flags::GATE1_ANTICOAGULANT_LOCK,
        );
        assert!(desc.verify_crc().is_ok());
        assert!((desc.cohen_d() - 1.25).abs() < 1e-6);
        assert_eq!(
            desc.normative_clause(),
            Some(NormativeClauseId::OchmoMtb007VenousThrombosis)
        );
        assert_eq!(
            desc.anatomical_region(),
            Some(AnatomicalRegionId::InternalJugularVein)
        );

        let mut corrupted = desc;
        corrupted.sample_size_n = 999;
        assert!(matches!(
            corrupted.verify_crc(),
            Err(CausalGraphError::DescriptorCrcMismatch { .. })
        ));
    }

    #[test]
    fn test_fnv1a_hash64_is_deterministic_and_distinct() {
        let h1 = fnv1a_hash64(b"OSD-51");
        let h2 = fnv1a_hash64(b"OSD-818");
        assert_ne!(h1, 0);
        assert_ne!(h1, h2);
        assert_eq!(h1, fnv1a_hash64(b"OSD-51"));
    }

    #[test]
    fn test_noisy_or_epistemic_fusion_formula_and_monotonicity() {
        let empty = EpistemicProvenance::default();
        assert_eq!(empty.noisy_or_confidence(), 0.0);

        let p = EpistemicProvenance::from_modalities(Some(0.80), Some(0.90), Some(0.70), None);
        // Expected: 1 - (1 - 0.80*0.90)*(1 - 0.90*0.96)*(1 - 0.70*0.85)
        let expected = 1.0 - (1.0 - 0.72) * (1.0 - 0.864) * (1.0 - 0.595);
        assert!((p.noisy_or_confidence() - expected).abs() < 1e-12);
        assert!(p.noisy_or_confidence() > 0.864);
        assert!(p.noisy_or_confidence() <= 1.0);
    }

    #[test]
    fn test_clinical_answerability_gate_all_three_verdicts() {
        let strong = EpistemicProvenance::from_modalities(Some(0.85), Some(0.90), Some(0.75), Some(1.0));
        // Anticoagulation without POCUS confirmation -> AbstainInsufficientData (MTB-007)
        let blocked = evaluate_clinical_answerability_gate(&strong, 0, true, false, 0.70);
        match blocked {
            ClinicalAnswerabilityGate::AbstainInsufficientData {
                enforced_clause, ..
            } => assert_eq!(enforced_clause, "NASA OCHMO MTB-007"),
            other => panic!("unexpected verdict: {other:?}"),
        }

        // Missing channels -> UncertainWithCaveat
        let caveat = evaluate_clinical_answerability_gate(&strong, 2, false, false, 0.70);
        assert!(matches!(
            caveat,
            ClinicalAnswerabilityGate::UncertainWithCaveat {
                missing_channels: 2,
                ..
            }
        ));

        // Weak single source -> AbstainInsufficientData
        let weak = EpistemicProvenance::from_modalities(Some(0.30), None, None, None);
        let abstain = evaluate_clinical_answerability_gate(&weak, 0, false, false, 0.60);
        assert!(matches!(
            abstain,
            ClinicalAnswerabilityGate::AbstainInsufficientData { .. }
        ));

        // Full multi-modal confirmation -> Answerable
        let ok = evaluate_clinical_answerability_gate(&strong, 0, true, true, 0.70);
        assert!(matches!(
            ok,
            ClinicalAnswerabilityGate::Answerable {
                active_modalities: 4,
                ..
            }
        ));
    }

    #[test]
    fn test_o1_normative_grounding_covers_all_adhg_nodes_and_clauses() {
        let all_nodes = [
            AdhgNodeKind::AredMechanicalLoad,
            AdhgNodeKind::SoleusMuscleQualityMqi,
            AdhgNodeKind::OsteocyteSclerostinSost,
            AdhgNodeKind::EndothelialProtectiveSecretome,
            AdhgNodeKind::CansRadiationOxidativeStress,
            AdhgNodeKind::IjvVenousStasisShearStress,
            AdhgNodeKind::PocusThrombusPosterior,
            AdhgNodeKind::SansTranslaminarGradient,
        ];
        for k in all_nodes {
            let g = ground_adhg_node_o1(k);
            assert_eq!(g.adhg_node, k);
            assert!(g.descriptor.verify_crc().is_ok());
            assert!(g.playbook_id.starts_with("PLAYBOOK_0"));
        }
        assert_eq!(
            NormativeClauseId::V1_3001_CrewHealth.official_code(),
            "NASA-STD-3001 [V1 3001]"
        );
        assert_eq!(
            NormativeClauseId::V2_10001_CrewInterfaceUsability.official_code(),
            "NASA-STD-3001 [V2 10001]"
        );
    }
}
