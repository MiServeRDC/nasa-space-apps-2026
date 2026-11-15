//! Multi-organ Point-of-Care Ultrasound (POCUS) clinical structures and evaluation.
//!
//! Covers the 4 core exploration domains:
//! 1. Vascular (Internal Jugular Vein)
//! 2. Ocular Optic Nerve (SANS)
//! 3. Renal & Bladder (Nephrolithiasis, Twinkling, Hydronephrosis, Retention)
//! 4. Extended Focused Assessment with Sonography for Trauma (eFAST: RUQ, LUQ, pelvic, subxiphoid, thoracic)

pub use ares_core_types::medical_360::PocusPelvicScan;
use ares_core_types::telemetry::ModelValidationStatus;
use serde::{Deserialize, Serialize};

/// Point-of-Care Ultrasound anatomical target indexed in the LSAH database.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum PocusAnatomicalTarget {
    IjvVascular = 1,
    OcularOpticNerve = 2,
    RenalBladder = 3,
    ThoracicAbdominalEfast = 4,
    PelvicUrogyn = 5,
}

impl PocusAnatomicalTarget {
    #[inline]
    pub const fn uberon_curie(&self) -> &'static str {
        match self {
            Self::IjvVascular => "UBERON:0001496",
            Self::OcularOpticNerve => "UBERON:0001793",
            Self::RenalBladder => "UBERON:0002113",
            Self::ThoracicAbdominalEfast => "UBERON:0002048",
            Self::PelvicUrogyn => "UBERON:0000992",
        }
    }

    #[inline]
    pub const fn label(&self) -> &'static str {
        match self {
            Self::IjvVascular => "Internal Jugular Vein (Vascular)",
            Self::OcularOpticNerve => "Optic Nerve & Retina (SANS)",
            Self::RenalBladder => "Kidneys & Urinary Bladder (Renal)",
            Self::ThoracicAbdominalEfast => "eFAST 5-Window Trauma",
            Self::PelvicUrogyn => "Pelvic & Urogynecologic (Ovarian/Ectopic/UTI)",
        }
    }
}

/// Ocular POCUS scan result (SANS / ICP).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PocusOcularScan {
    pub onsd_mm: f64,
    pub optic_disc_elevation_mm: f64,
    pub choroidal_folds_present: bool,
    pub posterior_globe_flattening: bool,
    pub intraocular_pressure_mmhg: f64,
    pub validation_status: ModelValidationStatus,
}

impl Default for PocusOcularScan {
    fn default() -> Self {
        Self {
            onsd_mm: 4.8,
            optic_disc_elevation_mm: 0.0,
            choroidal_folds_present: false,
            posterior_globe_flattening: false,
            intraocular_pressure_mmhg: 15.0,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

impl PocusOcularScan {
    #[inline]
    pub fn is_sans_risk(&self) -> bool {
        self.onsd_mm > 5.8
            || self.optic_disc_elevation_mm > 0.25
            || self.choroidal_folds_present
            || self.posterior_globe_flattening
            || self.intraocular_pressure_mmhg > 21.0
    }
}

/// Renal and bladder POCUS scan result.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PocusRenalBladderScan {
    /// 0 = None, 1 = Mild, 2 = Moderate, 3 = Severe
    pub hydronephrosis_grade: u8,
    pub calculus_detected: bool,
    pub calculus_diameter_mm: f64,
    pub acoustic_shadowing_present: bool,
    pub twinkling_artifact_present: bool,
    /// 1.0 = symmetric, < 0.30 = severe ureteral obstruction
    pub ureteral_jet_symmetry_ratio: f64,
    /// Acute urinary retention if > 500.0 mL
    pub post_void_bladder_volume_ml: f64,
    pub validation_status: ModelValidationStatus,
}

impl Default for PocusRenalBladderScan {
    fn default() -> Self {
        Self {
            hydronephrosis_grade: 0,
            calculus_detected: false,
            calculus_diameter_mm: 0.0,
            acoustic_shadowing_present: false,
            twinkling_artifact_present: false,
            ureteral_jet_symmetry_ratio: 1.0,
            post_void_bladder_volume_ml: 50.0,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

impl PocusRenalBladderScan {
    #[inline]
    pub fn is_colic_risk(&self) -> bool {
        self.calculus_detected
            || self.hydronephrosis_grade >= 1
            || self.twinkling_artifact_present
            || self.ureteral_jet_symmetry_ratio < 0.35
    }

    #[inline]
    pub fn is_urinary_retention(&self) -> bool {
        self.post_void_bladder_volume_ml >= 500.0
    }
}

/// 5-window thoraco-abdominal eFAST scan result.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PocusEfastScan {
    pub morison_pouch_free_fluid: bool,
    pub splenorenal_free_fluid: bool,
    pub suprapubic_pelvic_free_fluid: bool,
    pub subxiphoid_pericardial_effusion: bool,
    pub lung_sliding_absent: bool,
    pub lung_point_confirmed: bool,
    pub m_mode_barcode_sign_confirmed: bool,
    pub validation_status: ModelValidationStatus,
}

impl Default for PocusEfastScan {
    fn default() -> Self {
        Self {
            morison_pouch_free_fluid: false,
            splenorenal_free_fluid: false,
            suprapubic_pelvic_free_fluid: false,
            subxiphoid_pericardial_effusion: false,
            lung_sliding_absent: false,
            lung_point_confirmed: false,
            m_mode_barcode_sign_confirmed: false,
            validation_status: ModelValidationStatus::IllustrativeUnvalidated,
        }
    }
}

impl PocusEfastScan {
    #[inline]
    pub fn has_abdominal_free_fluid(&self) -> bool {
        self.morison_pouch_free_fluid
            || self.splenorenal_free_fluid
            || self.suprapubic_pelvic_free_fluid
    }

    #[inline]
    pub fn has_pericardial_tamponade_risk(&self) -> bool {
        self.subxiphoid_pericardial_effusion
    }

    /// Pneumothorax is confirmed when lung sliding is absent AND either
    /// M-mode barcode sign or a distinct lung point is identified.
    #[inline]
    pub fn is_pneumothorax_verified(&self) -> bool {
        self.lung_sliding_absent && (self.m_mode_barcode_sign_confirmed || self.lung_point_confirmed)
    }

    #[inline]
    pub fn has_any_trauma_finding(&self) -> bool {
        self.has_abdominal_free_fluid()
            || self.has_pericardial_tamponade_risk()
            || self.is_pneumothorax_verified()
    }
}

/// Primary diagnostic differential for female pelvic/urogynecologic POCUS (`PLAYBOOK_30`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PelvicPocusDifferential {
    NominalOrNotPerformed,
    EctopicPregnancyEmergency,
    OvarianTorsionSuspected,
    RupturedHemorrhagicCyst,
    UncomplicatedUtiOrPyelonephritisRisk,
}

/// Structured evaluation of `PocusPelvicScan` with explicit epistemic validation status.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PelvicPocusEvaluation {
    pub differential: PelvicPocusDifferential,
    pub urgent_surgical_or_evac_consult: bool,
    pub validation_status: ModelValidationStatus,
}

/// Evaluates female pelvic and urogynecologic POCUS differential (`PLAYBOOK_30`).
pub fn evaluate_pelvic_pocus_differential(scan: &PocusPelvicScan) -> PelvicPocusEvaluation {
    let differential = if scan.is_ectopic_pregnancy_emergency() {
        PelvicPocusDifferential::EctopicPregnancyEmergency
    } else if scan.is_ovarian_torsion_suspected() {
        PelvicPocusDifferential::OvarianTorsionSuspected
    } else if scan.is_ruptured_hemorrhagic_cyst() {
        PelvicPocusDifferential::RupturedHemorrhagicCyst
    } else if scan.urine_leukocyte_nitrite_positive {
        PelvicPocusDifferential::UncomplicatedUtiOrPyelonephritisRisk
    } else {
        PelvicPocusDifferential::NominalOrNotPerformed
    };

    let urgent = matches!(
        differential,
        PelvicPocusDifferential::EctopicPregnancyEmergency
            | PelvicPocusDifferential::OvarianTorsionSuspected
    );

    PelvicPocusEvaluation {
        differential,
        urgent_surgical_or_evac_consult: urgent,
        validation_status: ModelValidationStatus::IllustrativeUnvalidated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pocus_anatomical_target_uberon_curies() {
        assert_eq!(PocusAnatomicalTarget::IjvVascular.uberon_curie(), "UBERON:0001496");
        assert_eq!(PocusAnatomicalTarget::OcularOpticNerve.uberon_curie(), "UBERON:0001793");
        assert_eq!(PocusAnatomicalTarget::RenalBladder.uberon_curie(), "UBERON:0002113");
        assert_eq!(PocusAnatomicalTarget::ThoracicAbdominalEfast.uberon_curie(), "UBERON:0002048");
        assert_eq!(PocusAnatomicalTarget::PelvicUrogyn.uberon_curie(), "UBERON:0000992");
    }

    #[test]
    fn test_pocus_efast_trauma_logic() {
        let efast_nominal = PocusEfastScan::default();
        assert!(!efast_nominal.has_any_trauma_finding());

        let efast_pneumo = PocusEfastScan {
            lung_sliding_absent: true,
            m_mode_barcode_sign_confirmed: true,
            ..Default::default()
        };
        assert!(efast_pneumo.is_pneumothorax_verified());
        assert!(efast_pneumo.has_any_trauma_finding());
    }

    #[test]
    fn test_pocus_renal_colic_and_retention() {
        let renal_nominal = PocusRenalBladderScan::default();
        assert!(!renal_nominal.is_colic_risk());
        assert!(!renal_nominal.is_urinary_retention());

        let renal_colic = PocusRenalBladderScan {
            twinkling_artifact_present: true,
            ..Default::default()
        };
        assert!(renal_colic.is_colic_risk());

        let renal_retention = PocusRenalBladderScan {
            post_void_bladder_volume_ml: 550.0,
            ..Default::default()
        };
        assert!(renal_retention.is_urinary_retention());
    }

    #[test]
    fn test_pocus_pelvic_scan_predicates_and_differential() {
        let nominal = PocusPelvicScan::default();
        assert!(!nominal.is_ovarian_torsion_suspected());
        assert!(!nominal.is_ectopic_pregnancy_emergency());
        assert!(!nominal.is_ruptured_hemorrhagic_cyst());
        let eval_nominal = evaluate_pelvic_pocus_differential(&nominal);
        assert_eq!(
            eval_nominal.differential,
            PelvicPocusDifferential::NominalOrNotPerformed
        );
        assert!(!eval_nominal.urgent_surgical_or_evac_consult);
        assert_eq!(
            eval_nominal.validation_status,
            ModelValidationStatus::IllustrativeUnvalidated
        );

        // Whirlpool sign without performed=true must NOT trigger torsion
        let unperformed = PocusPelvicScan {
            performed: false,
            adnexal_whirlpool_sign: true,
            ..Default::default()
        };
        assert!(!unperformed.is_ovarian_torsion_suspected());

        // Absent Doppler + enlarged ovary (>15 mL) triggers torsion
        let torsion_enlarged = PocusPelvicScan {
            performed: true,
            left_ovary_volume_ml: Some(18.5),
            ovarian_doppler_flow_absent: true,
            ..Default::default()
        };
        assert!(torsion_enlarged.is_ovarian_torsion_suspected());
        assert_eq!(
            evaluate_pelvic_pocus_differential(&torsion_enlarged).differential,
            PelvicPocusDifferential::OvarianTorsionSuspected
        );

        // Absent Doppler with normal ovary (<=15 mL) and no whirlpool does NOT trigger torsion
        let no_torsion_small = PocusPelvicScan {
            performed: true,
            right_ovary_volume_ml: Some(12.0),
            ovarian_doppler_flow_absent: true,
            ..Default::default()
        };
        assert!(!no_torsion_small.is_ovarian_torsion_suspected());

        // Ectopic pregnancy emergency: beta-hCG+ with complex cul-de-sac free fluid
        let ectopic = PocusPelvicScan {
            performed: true,
            point_of_care_beta_hcg_positive: Some(true),
            cul_de_sac_free_fluid_complex: true,
            ..Default::default()
        };
        assert!(ectopic.is_ectopic_pregnancy_emergency());
        let eval_ectopic = evaluate_pelvic_pocus_differential(&ectopic);
        assert_eq!(
            eval_ectopic.differential,
            PelvicPocusDifferential::EctopicPregnancyEmergency
        );
        assert!(eval_ectopic.urgent_surgical_or_evac_consult);

        // Ruptured hemorrhagic cyst: beta-hCG- with complex free fluid and no torsion
        let cyst = PocusPelvicScan {
            performed: true,
            point_of_care_beta_hcg_positive: Some(false),
            cul_de_sac_free_fluid_complex: true,
            ..Default::default()
        };
        assert!(cyst.is_ruptured_hemorrhagic_cyst());
        assert_eq!(
            evaluate_pelvic_pocus_differential(&cyst).differential,
            PelvicPocusDifferential::RupturedHemorrhagicCyst
        );
    }
}
