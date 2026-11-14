//! Fase 07 (C3): Grafo Causale Eterogeneo ADHG (`petgraph::stable_graph::StableDiGraph`).

pub use crate::bayesian_pocus::{
    BayesianPocusObserver, PocusPosteriorEstimate, evaluate_two_stage_bayesian_pocus,
};
use ares_core_types::telemetry::{JugularHemodynamics, Musculoskeletal, SansOcular};
use petgraph::stable_graph::{NodeIndex, StableDiGraph};
use serde::{Deserialize, Serialize};

/// Identificativo dei nodi fisiologici nell'Astronaut Digital Health Graph (ADHG).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AdhgNodeKind {
    AredMechanicalLoad,
    SoleusMuscleQualityMqi,
    OsteocyteSclerostinSost,
    EndothelialProtectiveSecretome,
    CansRadiationOxidativeStress,
    IjvVenousStasisShearStress,
    PocusThrombusPosterior,
    SansTranslaminarGradient,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdhgNodeState {
    pub kind: AdhgNodeKind,
    pub label: &'static str,
    pub anomaly_severity: f64, // 0.0 (nominale) .. 1.0 (critico)
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AdhgCausalEdge {
    pub mechanism: &'static str,
    pub causal_weight: f64,
}

/// Grafo Causale Eterogeneo ADHG basato su `petgraph::stable_graph::StableDiGraph`.
pub struct AdhgCausalEngine {
    graph: StableDiGraph<AdhgNodeState, AdhgCausalEdge>,
    n_ared: NodeIndex,
    n_mqi: NodeIndex,
    n_sost: NodeIndex,
    n_secretome: NodeIndex,
    n_rad: NodeIndex,
    n_ijv: NodeIndex,
    n_pocus: NodeIndex,
    n_sans: NodeIndex,
}

/// Alias di compatibilita per `AdhgCausalEngine`.
pub type AdhgGraph = AdhgCausalEngine;

impl Default for AdhgCausalEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AdhgCausalEngine {
    pub fn new() -> Self {
        let mut graph = StableDiGraph::with_capacity(8, 10);
        let n_ared = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::AredMechanicalLoad,
            label: "ARED Resistive Load Deficit",
            anomaly_severity: 0.0,
        });
        let n_mqi = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::SoleusMuscleQualityMqi,
            label: "Soleus Type-I Atrophy & MQI Drop",
            anomaly_severity: 0.0,
        });
        let n_sost = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::OsteocyteSclerostinSost,
            label: "Sclerostin (SOST) Up-Regulation & Hypercalciuria",
            anomaly_severity: 0.0,
        });
        let n_secretome = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::EndothelialProtectiveSecretome,
            label: "Irisin / miR-126-3p Depletion & Weibel-Palade Exocytosis",
            anomaly_severity: 0.0,
        });
        let n_rad = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::CansRadiationOxidativeStress,
            label: "CSA CANS Deep-Space Radiation Endothelial ROS",
            anomaly_severity: 0.0,
        });
        let n_ijv = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::IjvVenousStasisShearStress,
            label: "Internal Jugular Vein Stasis (tau_w < 1.2 dyn/cm^2)",
            anomaly_severity: 0.0,
        });
        let n_pocus = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::PocusThrombusPosterior,
            label: "Two-Stage Bayesian IJV Thrombus Risk",
            anomaly_severity: 0.0,
        });
        let n_sans = graph.add_node(AdhgNodeState {
            kind: AdhgNodeKind::SansTranslaminarGradient,
            label: "SANS Optic Nerve Sheath & Choroidal Engorgement",
            anomaly_severity: 0.0,
        });

        graph.add_edge(
            n_ared,
            n_mqi,
            AdhgCausalEdge {
                mechanism: "Unloading -> Soleus atrophy",
                causal_weight: 0.85,
            },
        );
        graph.add_edge(
            n_ared,
            n_sost,
            AdhgCausalEdge {
                mechanism: "Strain < 1000 ue -> SOST release",
                causal_weight: 0.90,
            },
        );
        graph.add_edge(
            n_mqi,
            n_secretome,
            AdhgCausalEdge {
                mechanism: "Reduced Irisin/miR-126-3p",
                causal_weight: 0.80,
            },
        );
        graph.add_edge(
            n_mqi,
            n_ijv,
            AdhgCausalEdge {
                mechanism: "Loss of calf venous capacitance pump",
                causal_weight: 0.78,
            },
        );
        graph.add_edge(
            n_secretome,
            n_ijv,
            AdhgCausalEdge {
                mechanism: "vWF/P-selectin endothelial activation",
                causal_weight: 0.75,
            },
        );
        graph.add_edge(
            n_rad,
            n_ijv,
            AdhgCausalEdge {
                mechanism: "Neutron ROS glycocalyx injury",
                causal_weight: 0.65,
            },
        );
        graph.add_edge(
            n_ijv,
            n_pocus,
            AdhgCausalEdge {
                mechanism: "Virchow triad hypercoagulability",
                causal_weight: 0.88,
            },
        );
        graph.add_edge(
            n_ijv,
            n_sans,
            AdhgCausalEdge {
                mechanism: "Cephalad venous outflow impedance",
                causal_weight: 0.82,
            },
        );

        Self {
            graph,
            n_ared,
            n_mqi,
            n_sost,
            n_secretome,
            n_rad,
            n_ijv,
            n_pocus,
            n_sans,
        }
    }

    /// Restituisce un riferimento immutabile al grafo `petgraph` sottostante.
    #[inline]
    pub fn graph(&self) -> &StableDiGraph<AdhgNodeState, AdhgCausalEdge> {
        &self.graph
    }

    /// Aggiorna lo stato dei nodi nel grafo `petgraph` e restituisce la sintesi causale attiva.
    pub fn update_and_extract_causal_chain(
        &mut self,
        musculo: &Musculoskeletal,
        jugular: &JugularHemodynamics,
        sans: &SansOcular,
        radiation_msv_d: f64,
    ) -> (PocusPosteriorEstimate, Vec<String>) {
        let pocus = evaluate_two_stage_bayesian_pocus(jugular, musculo, radiation_msv_d);

        if let Some(n) = self.graph.node_weight_mut(self.n_ared) {
            n.anomaly_severity = ((125.0 - musculo.ared_daily_load_kgf) / 70.0).clamp(0.0, 1.0);
        }
        if let Some(n) = self.graph.node_weight_mut(self.n_mqi) {
            n.anomaly_severity = (1.0 - musculo.mqi_index).clamp(0.0, 1.0);
        }
        if let Some(n) = self.graph.node_weight_mut(self.n_sost) {
            n.anomaly_severity = ((musculo.sclerostin_pmol_l - 24.0) / 31.0).clamp(0.0, 1.0);
        }
        if let Some(n) = self.graph.node_weight_mut(self.n_secretome) {
            n.anomaly_severity = (1.0 - musculo.mqi_index).clamp(0.0, 1.0);
        }
        if let Some(n) = self.graph.node_weight_mut(self.n_rad) {
            n.anomaly_severity = ((radiation_msv_d - 0.6) / 3.0).clamp(0.0, 1.0);
        }
        if let Some(n) = self.graph.node_weight_mut(self.n_ijv) {
            n.anomaly_severity = ((2.8 - jugular.tau_w_dyn_cm2) / 1.6).clamp(0.0, 1.0);
        }
        if let Some(n) = self.graph.node_weight_mut(self.n_pocus) {
            n.anomaly_severity = pocus.thrombus_posterior;
        }
        if let Some(n) = self.graph.node_weight_mut(self.n_sans) {
            n.anomaly_severity = sans.sans_risk_index;
        }

        let mut chain = Vec::with_capacity(4);
        chain.push(format!(
            "ARED Load {:.0} kgf -> Soleus MQI {:.2} & SOST {:.1} pmol/L",
            musculo.ared_daily_load_kgf, musculo.mqi_index, musculo.sclerostin_pmol_l
        ));
        chain.push(format!(
            "IJV CSA {:.1} mm^2 & vmax {:.1} cm/s -> Shear Stress tau_w {:.2} dyn/cm^2 ({:?})",
            jugular.ijv_csa_mm2, jugular.ijv_vmax_cm_s, jugular.tau_w_dyn_cm2, jugular.flow_grade
        ));
        chain.push(format!(
            "Illustrative stasis score {:.2} | Thrombus model score {:.2} (scenario POCUS flag: {})",
            pocus.stasis_probability,
            pocus.thrombus_posterior,
            jugular.pocus_thrombus_confirmed
        ));
        chain.push(format!(
            "Illustrative SANS index {:.2} (ONSD {:.2} mm, Choroidal Delta +{:.0} um)",
            sans.sans_risk_index, sans.onsd_mm, sans.choroidal_delta_um
        ));

        (pocus, chain)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hemodynamics::compute_jugular_and_sans_state;
    use crate::mechanotransduction::compute_musculoskeletal_state;
    use ares_core_types::telemetry::StressTestScenarioInput;

    #[test]
    fn test_adhg_graph_updates_nodes_and_builds_causal_chain() {
        let mut engine = AdhgCausalEngine::new();
        assert_eq!(engine.graph().node_count(), 8);
        assert_eq!(engine.graph().edge_count(), 8);

        let musculo = compute_musculoskeletal_state(90, 0.0);
        let scenario = StressTestScenarioInput {
            source_record_id: "bidmc_01".to_string(),
            flight_day: 90,
            ared_daily_load_kgf: 0.0,
            radiation_dose_rate_msv_d: 2.2,
            lbnp_active: false,
            lbnp_pressure_mmhg: 0.0,
            pocus_thrombus_confirmed: false,
            systolic_bp_drop_mmhg: 2.0,
        };
        let (jugular, sans) = compute_jugular_and_sans_state(&musculo, &scenario);
        let (pocus, chain) = engine.update_and_extract_causal_chain(
            &musculo,
            &jugular,
            &sans,
            scenario.radiation_dose_rate_msv_d,
        );

        assert!(pocus.thrombus_posterior <= 0.45);
        assert_eq!(chain.len(), 4);
        assert!(chain[0].contains("ARED Load"));
        assert!(chain[1].contains("Shear Stress tau_w"));
        assert!(chain[2].contains("Illustrative stasis score"));
        assert!(chain[3].contains("Illustrative SANS index"));
    }
}
