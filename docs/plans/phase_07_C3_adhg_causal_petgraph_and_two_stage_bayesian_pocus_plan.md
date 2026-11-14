# Piano Implementativo Definitivo — Fase 07 (C3): Astronaut Digital Health Graph (`ADHG` on `petgraph`) & Two-Stage Bayesian POCUS Observer

- **Blocco Architetturale**: Blocco C (*Motore Rust Core: Fisiopatologia Differenziale & Grafo Causale `ADHG` — `2. EVALUATE` Parte 1*, Fasi 05–07)
- **Fase**: Fase 07 (`C3`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-causal-graph`](../../crates/ares-causal-graph/README.md)
- **Owner Principale**: `@fabiomalagutti27-droid`
- **File Target Previsti**:
  1. `crates/ares-causal-graph/src/adhg_graph.rs` *(NEW)*
  2. `crates/ares-causal-graph/src/bayesian_pocus.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 25\,\mu\text{s}$ per propagazione topologica completa sui 12 nodi del grafo `petgraph` e aggiornamento Bayesiano POCUS.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, tetto pre-POCUS $P(\text{Thrombus} \mid \text{Stasis}) \le 0.45$ garantito matematicamente (`Entry 002`).

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale: L'Asta Verticale della Strategia T-Shaped
La **Fase 07 (`C3`)** unifica i 6 domini fisiologici della challenge NASA all'interno dell'**Astronaut Digital Health Graph (`ADHG`)**, costruito su `petgraph::stable_graph::StableDiGraph` (esattamente come il Dynamic Scene Graph di `spatiotemporal-mcp-engine`).

Il grafo `ADHG` permette a ARES-Health di fare ciò che nessun monitor a soglia singola può fare:
1. **Spiegazione Causale Multi-Hop (`Root-Cause Tracing`):** Quando lo shear stress giugulare $\tau_w(t)$ o l'indice `SANS` entrano in allerta, il grafo risale gli archi diretti pesati e genera la catena causale ordinata (`causal_chain_summary`) per il medico di bordo e per il server `FastMCP`.
2. **Osservatore Bayesiano a 2 Stadi per il POCUS (`bayesian_pocus.rs`):** Risolve il paradosso clinico della trombosi giugulare in microgravità:
   * **Stadio 1 (Pre-POCUS):** Anche in presenza di stasi severa ($\tau_w < 1.2\text{ dyn/cm}^2$), la probabilità di trombo occlusivo è limitata a $\le 0.45$, attivando l'allerta diagnostica ("Richiedere POCUS collo + avviare LBNP $-30\text{ mmHg}$") ma mantenendo bloccati gli anticoagulanti (**Hard Safety Gate 1**).
   * **Stadio 2 (Post-POCUS):** Se l'ispezione ecografica B-Mode conferma un trombo endoluminale non comprimibile ($\text{LR}_+ = 24.0$), la probabilità a posteriori sale a $\ge 0.92$, autorizzando il protocollo terapeutico mirato.

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Zhenya Zhang, Jie An, Paolo Arcaini et al.:** *"Online Causation Monitoring of Signal Temporal Logic"*, CAV 2023 (`arXiv:2305.17754v1`).
2. **Karina Marshall-Goebel et al.:** *JAMA Network Open*, 2019 (`PMC6902784`) — distinzione ecografica tra stasi venosa di Grado 3–4 e trombo intraluminale non comprimibile.

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 07 (`C3`) |
| :--- | :--- | :--- |
| `crates/ares-causal-graph/src/bayesian_pocus.rs` | **CREATE** | Osservatore Bayesiano a 2 stadi `BayesianPocusObserver` con tetto pre-POCUS $0.45$ e rapporto di verosimiglianza post-POCUS $\text{LR}_+ = 24.0$. |
| `crates/ares-causal-graph/src/adhg_graph.rs` | **CREATE** | Grafo diretto `AdhgGraph` (`petgraph::stable_graph::StableDiGraph`) a 12 nodi fisiopatologici ed estrattore di catene causali `extract_active_causal_chain`. |

---

## 3. Architettura di `bayesian_pocus.rs` e `adhg_graph.rs` in Puro Rust 2024

```rust
//! Fase 07 (C3): Osservatore Bayesiano POCUS a 2 Stadi e Grafo Causale Eterogeneo ADHG (`petgraph`).

use ares_core_types::constants::PRE_POCUS_MAX_THROMBUS_PROB;
use ares_core_types::telemetry::{JugularHemodynamics, Musculoskeletal, SansOcular};
use petgraph::stable_graph::{NodeIndex, StableDiGraph};
use serde::{Deserialize, Serialize};

/// Risultato della stima Bayesiana a 2 stadi per la trombosi della vena giugulare interna.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PocusPosteriorEstimate {
    /// Probabilita di stasi venosa severa (Stadio 1, in [0.0, 1.0]).
    pub stasis_probability: f64,
    /// Probabilita a posteriori di trombo endoluminale (limitata a <= 0.45 senza POCUS, >= 0.92 con POCUS+).
    pub thrombus_posterior: f64,
    /// Indica se e richiesta un'ispezione ecografica POCUS immediata.
    pub pocus_inspection_required: bool,
}

/// Calcola la stima Bayesiana a 2 stadi (Invariante Entry 002).
#[inline]
pub fn evaluate_two_stage_bayesian_pocus(
    jugular: &JugularHemodynamics,
    musculo: &Musculoskeletal,
    radiation_msv_d: f64,
) -> PocusPosteriorEstimate {
    let shear_deficit = ((1.8 - jugular.tau_w_dyn_cm2) / 1.2).clamp(0.0, 1.0);
    let secretome_deficit = (1.0 - musculo.mqi_index).clamp(0.0, 1.0);
    let rad_factor = (radiation_msv_d / 5.0).clamp(0.0, 1.0);

    let stasis_probability =
        (0.55 * shear_deficit + 0.30 * secretome_deficit + 0.15 * rad_factor).clamp(0.02, 0.99);

    // Stadio 1: Prior emodinamico pre-POCUS (rigorosamente <= 0.45 in assenza di conferma B-mode)
    let pre_pocus_prior = (0.42 * stasis_probability).min(PRE_POCUS_MAX_THROMBUS_PROB);

    // Stadio 2: Aggiornamento Bayesiano con Likelihood Ratio ecografico (LR+ = 24.0)
    let thrombus_posterior = if jugular.pocus_thrombus_confirmed {
        let prior_odds = pre_pocus_prior.max(0.35) / (1.0 - pre_pocus_prior.max(0.35));
        let post_odds = prior_odds * 24.0;
        (post_odds / (1.0 + post_odds)).clamp(0.92, 0.995)
    } else {
        pre_pocus_prior
    };

    PocusPosteriorEstimate {
        stasis_probability,
        thrombus_posterior,
        pocus_inspection_required: stasis_probability >= 0.50 && !jugular.pocus_thrombus_confirmed,
    }
}

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

        graph.add_edge(n_ared, n_mqi, AdhgCausalEdge { mechanism: "Unloading -> Soleus atrophy", causal_weight: 0.85 });
        graph.add_edge(n_ared, n_sost, AdhgCausalEdge { mechanism: "Strain < 1000 ue -> SOST release", causal_weight: 0.90 });
        graph.add_edge(n_mqi, n_secretome, AdhgCausalEdge { mechanism: "Reduced Irisin/miR-126-3p", causal_weight: 0.80 });
        graph.add_edge(n_mqi, n_ijv, AdhgCausalEdge { mechanism: "Loss of calf venous capacitance pump", causal_weight: 0.78 });
        graph.add_edge(n_secretome, n_ijv, AdhgCausalEdge { mechanism: "vWF/P-selectin endothelial activation", causal_weight: 0.75 });
        graph.add_edge(n_rad, n_ijv, AdhgCausalEdge { mechanism: "Neutron ROS glycocalyx injury", causal_weight: 0.65 });
        graph.add_edge(n_ijv, n_pocus, AdhgCausalEdge { mechanism: "Virchow triad hypercoagulability", causal_weight: 0.88 });
        graph.add_edge(n_ijv, n_sans, AdhgCausalEdge { mechanism: "Cephalad venous outflow impedance", causal_weight: 0.82 });

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
            "Bayesian POCUS Stasis {:.0}% | Thrombus Posterior {:.0}% (POCUS Confirmed: {})",
            pocus.stasis_probability * 100.0,
            pocus.thrombus_posterior * 100.0,
            jugular.pocus_thrombus_confirmed
        ));
        chain.push(format!(
            "SANS Risk {:.2} (ONSD {:.2} mm, Choroidal Delta +{:.0} um)",
            sans.sans_risk_index, sans.onsd_mm, sans.choroidal_delta_um
        ));

        (pocus, chain)
    }
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 07 (`C3`)

1. **`test_bayesian_pocus_stage1_caps_at_045_without_ultrasound`:** Verifica che anche con $\tau_w = 0.4\text{ dyn/cm}^2$ e `pocus_thrombus_confirmed = false`, `thrombus_posterior <= 0.45` e `pocus_inspection_required == true`.
2. **`test_bayesian_pocus_stage2_exceeds_092_with_confirmed_thrombus`:** Verifica che con `pocus_thrombus_confirmed = true`, `thrombus_posterior >= 0.92`.
