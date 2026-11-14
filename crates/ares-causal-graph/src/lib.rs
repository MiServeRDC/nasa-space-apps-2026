//! `ares-causal-graph` — Blocco C (Fasi 05 C1, 06 C2, 07 C3):
//! Fisiopatologia differenziale (RK4 Frost-Hargens Sclerostin ODE, Ultrasound MQI, Martian GAI at 0.38g),
//! emodinamica venosa giugulare dimensionalmente esatta (`tau_w` in `dyn/cm^2`), risposta dose-dipendente
//! LBNP, accoppiamento translaminare SANS, Osservatore Bayesiano POCUS a 2 stadi e Grafo Causale Eterogeneo
//! Astronaut Digital Health Graph (`ADHG` su `petgraph`).

pub mod adhg_graph;
pub mod bayesian_pocus;
pub mod biokg_reasoner;
pub mod dataset_graph;
pub mod error;
pub mod hemodynamics;
pub mod hypergraph_spatial;
pub mod mechanotransduction;
