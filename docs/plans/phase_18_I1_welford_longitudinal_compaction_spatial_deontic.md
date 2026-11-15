# Piano Implementativo Definitivo — Fase 18 (I1): `ARES-HyperGraph` Layers 1 & 2 — Welford `LongitudinalSuperNode` Compaction (900-Day Mars Mission in `< 200 KB`), 3D Anatomical Region Subgraph & Spacecraft Habitat Deontic / Markov Transition Graph (`HabitatZoneDeonticPolicy`, $D_{\text{KL}}$ Anomaly Detection)

- **Blocco Architetturale**: Blocco I (*Motore Rust Core: Grafo Ibrido a 3 Livelli `ARES-HyperGraph` & `ARES-DatasetGraph` Multi-Agenzia — `2. EVALUATE` & `3. ACT`*, Fasi 18–20)
- **Fase**: Fase 18 (`I1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-causal-graph`](../../crates/ares-causal-graph/README.md)
- **Owner Principale**: `ARES-Health Team`
- **File Target Previsti**:
  1. `crates/ares-causal-graph/src/welford_compactor.rs` *(NEW)*
  2. `crates/ares-causal-graph/src/spatial_habitat_graph.rs` *(NEW)*
  3. `crates/ares-causal-graph/src/lib.rs` *(UPDATE)*
- **Budget Latenza & Memoria**:
  - **Aggiornamento Online Welford $O(1)$ + Valutazione Deontica Q-STL Habitat**: $< 18\,\mu\text{s}$ per tick
  - **Footprint RAM su Missione Marziana di 900 Giorni**: $< 200\text{ KB}$ per astronauta (`900` Super-Nodi Giornalieri + `96` Super-Nodi da 15 minuti nella finestra mobile di 24 ore)
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()` nel codice di produzione, gestione errori tipizzata con `thiserror`.

---

## 1. Executive Summary & Scientific Grounding (`deep-scholar`)

### 1.1 Visione Architetturale: Dallo Spatiotemporal Scene Graph a `ARES-HyperGraph` Layers 1 & 2
In una missione verso Marte della durata di **900–1000 giorni**, conservare in RAM ogni singolo campione a `1 Hz` / `20 Hz` ($> 7.7 \times 10^7$ punti per canale) saturerebbe la memoria di bordo. Allo stesso tempo, il grafo causale fisiologico (`ADHG`, Layer 1) ha bisogno di un ancoraggio spaziale diretto sia alle **4 regioni anatomiche 3D del corpo dell'astronauta** (che pilotano la *3D Body Heatmap* in `ares-cockpit/`) sia ai **6 compartimenti fisici dell'habitat spaziale** (`CrewSleepQuarters`, `AredExerciseBay`, `LbnpChamberBay`, `MedOpsUltrasoundBay`, `RadiationStormShelter`, `EvaAirlockSurface`).

Adattando direttamente i pattern certificati in `spatiotemporal-mcp-engine-backup/crates/spatiotemporal-db` (`graph_compactor.rs`, `scene_graph.rs` e `ontology_reasoner.rs`, documentati in [`docs/architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md`](../architecture/KNOWLEDGE_GRAPH_ARCHITECTURE_STUDY.md)), la **Fase 18 (`I1`)** introduce:
1. **`welford_compactor.rs` (Layer 1 — Compattazione Gerarchica Welford a 3 Tier):**
   - **Hot Tier (`0..15 min`):** Tracce ad alta risoluzione e nodi con anomalia attiva ($\hat{\rho}_k < 0.25$) mantenuti in primo piano tramite un gate *Information Bottleneck* ispirato a MIT *Clio* (`arXiv:2404.13696`).
   - **Warm Tier (`15 min` Buckets su 24h) & Cold Tier (`1 Flight Day` Super-Nodes su 900 giorni):** Coarsening online in un singolo passaggio con l'algoritmo di **Welford** ($\mu_n, M_{2,n}, \min, \max$) a zero allocazioni heap, comprimendo 900 giorni di storia fisiologica in **$< 200\text{ KB}$**.
2. **`spatial_habitat_graph.rs` (Layer 2 — Sottografo Anatomico 3D, Regole Deontiche Q-STL & Catena di Markov Dirichlet-Multinomiale):**
   - Modella le **4 Regioni Anatomiche 3D** con centroidi normalizzati $(x, y, z) \in [-1, +1]^3$ e archi di conduzione emodinamica/meccanica per i *3D Causal Bezier Arcs* di `ares-cockpit/`.
   - Modella i **6 Compartimenti dell'Habitat Spaziale** governati da `HabitatZoneDeonticPolicy` (valutazione congiuntiva Q-STL $\rho_{\text{zone}}(e, z, t) \in [-1, +1]$ su limiti acustici `NC-50`, dwell massimo `LBNP <= 2700s`, evacuazione tempesta solare `SPE` e blocco `EVA` con `GAI > 12%`).
   - Stima le probabilità di transizione abitativa con un modello di Markov Bayesiano **Dirichlet-Multinomiale** e calcola la divergenza di Kullback-Leibler $D_{\text{KL}}(P_{\text{obs}} \parallel P_{\text{prior}})$ per rilevare isolamento comportamentale, letargia o disorientamento circadiano (`NASA CHAPEA / ARCHeR`).

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Dominic Maggio, Yun Chang, Nathan Hughes, Luca Carlone et al. (MIT SPARK Lab, 2024):**
   * *Titolo:* *"Clio: Real-time Task-Driven Open-Set 3D Scene Graphs"*, *IEEE Robotics and Automation Letters (RA-L)*, `arXiv:2404.13696`.
2. **B. P. Welford (1962):**
   * *Titolo:* *"Note on a Method for Calculating Corrected Sums of Squares and Products"*, *Technometrics*, 4(3):419–420 | **DOI:** `10.1080/00401706.1962.10490022`.
3. **B. Kruse, Emmanuel Urquieta et al. (TRISH / Baylor College of Medicine, 2025):**
   * *Titolo:* *"Human Digital Twin Platforms for Predictive Space Medicine"*, *Frontiers in Bioengineering and Biotechnology*, Vol. 13, Art. 1421092 | **DOI:** `10.3389/fbioe.2025.1421092`.

---

## 2. Decisioni Architetturali & Tabella Moduli Coinvolti

### 2.1 Tabella File e Moduli Rust

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 18 (`I1`) |
| :--- | :--- | :--- |
| `crates/ares-causal-graph/src/welford_compactor.rs` | **CREATE** | Implementa `WelfordAccumulator`, `LongitudinalSuperNode` e `MissionLongitudinalCompactor` per comprimere 900 giorni di telemetria in $< 200\text{ KB}$ RAM. |
| `crates/ares-causal-graph/src/spatial_habitat_graph.rs` | **CREATE** | Implementa `AnatomicalRegion`, `AnatomicalNode3D`, `SpacecraftHabitatZone`, `HabitatZoneDeonticPolicy`, valutazione Q-STL $\rho_{\text{zone}}$ e `HabitatMarkovTransitionModel` con anomalia $D_{\text{KL}}$. |
| `crates/ares-causal-graph/src/lib.rs` | **UPDATE** | Esporta `pub mod welford_compactor;` e `pub mod spatial_habitat_graph;`. |

---

## 3. Formulazione Matematica

### 3.1 Aggiornamento Online di Welford in Singolo Passaggio ($O(1)$, Zero Heap)
Per ogni nuova osservazione $x_n$ aggiunta a un `LongitudinalSuperNode`:
$$n \leftarrow n + 1, \qquad \delta = x_n - \mu_{n-1}, \qquad \mu_n = \mu_{n-1} + \frac{\delta}{n}, \qquad \delta_2 = x_n - \mu_n, \qquad M_{2,n} = M_{2,n-1} + \delta \cdot \delta_2$$
La varianza campionaria non distorta per $n \ge 2$ è $s_n^2 = \frac{M_{2,n}}{n - 1}$.

### 3.2 Semantica Quantitativa Congiuntiva Deontica dell'Habitat (`Q-STL`)
Per un astronauta $e$ nel compartimento spaziale $z$ al tempo $t$, la conformità deontica $\rho_{\text{zone}}(e, z, t) \in [-1.0, +1.0]$ è:
$$\rho_{\text{zone}}(e, z, t) = \min\!\Big(\rho_{\text{clearance}}(e, z), \; \rho_{\text{dwell}}(e, z, t), \; \rho_{\text{rad\_shelter}}(z, \dot{D}_{\text{rad}}), \; \rho_{\text{gait\_eva}}(e, z, \text{GAI})\Big)$$
dove $\rho_{\text{zone}} < 0.0$ emette un arco deontico `HabitatDeonticVerdict::ViolatesZonePolicy`.

### 3.3 Modello di Transizione di Markov Dirichlet-Multinomiale e Divergenza $D_{\text{KL}}$
Date le $K = 6$ zone dell'habitat e i conteggi di transizione osservati $n_{ab}$ da $z_a$ a $z_b$ con prior di Dirichlet simmetrico $\alpha = 0.5$:
$$P(z_b \mid z_a) = \frac{n_{ab} + \alpha}{\sum_{b'=0}^{K-1} n_{ab'} + K\alpha}, \qquad D_{\text{KL}}\!\left(P_{\text{obs}}(\cdot \mid z_a) \,\middle\|\, P_{\text{nom}}(\cdot \mid z_a)\right) = \sum_{b=0}^{K-1} P_{\text{obs}}(z_b \mid z_a) \ln\!\left(\frac{P_{\text{obs}}(z_b \mid z_a)}{P_{\text{nom}}(z_b \mid z_a)}\right)$$

---

## 4. Concrete Rust Signatures & Data Structures (`welford_compactor.rs` & `spatial_habitat_graph.rs`)

```rust
//! Fase 18 (I1): Welford Longitudinal Super-Node Compactor (< 200 KB per 900 Flight Days)
//! e Grafo Spaziale Anatomico 3D + Deontico dell'Habitat Spaziale (ARES-HyperGraph Layer 2).

use serde::{Deserialize, Serialize};

/// Accumulatore statistico online di Welford in O(1) a zero allocazioni heap.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WelfordAccumulator {
    pub count: u64,
    pub mean: f64,
    pub m2: f64,
    pub min_val: f64,
    pub max_val: f64,
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
            min_val: f64::INFINITY,
            max_val: f64::NEG_INFINITY,
        }
    }

    /// Aggiorna media, M2, minimo e massimo in O(1).
    #[inline]
    pub fn update(&mut self, value: f64) {
        if !value.is_finite() {
            return;
        }
        self.count += 1;
        let n = self.count as f64;
        let delta = value - self.mean;
        self.mean += delta / n;
        let delta2 = value - self.mean;
        self.m2 += delta * delta2;
        if value < self.min_val {
            self.min_val = value;
        }
        if value > self.max_val {
            self.max_val = value;
        }
    }

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
}

/// Super-Nodo longitudinale compatto (~192 byte) per un bucket di 15 min o 1 Flight Day intero.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LongitudinalSuperNode {
    pub flight_day: u16,
    pub bucket_index: u16,
    pub pinned_anomaly: bool,
    pub tau_w_stats: WelfordAccumulator,
    pub sost_stats: WelfordAccumulator,
    pub mqi_stats: WelfordAccumulator,
    pub sans_stats: WelfordAccumulator,
    pub rho_global_stats: WelfordAccumulator,
}

impl LongitudinalSuperNode {
    pub const fn new(flight_day: u16, bucket_index: u16) -> Self {
        Self {
            flight_day,
            bucket_index,
            pinned_anomaly: false,
            tau_w_stats: WelfordAccumulator::new(),
            sost_stats: WelfordAccumulator::new(),
            mqi_stats: WelfordAccumulator::new(),
            sans_stats: WelfordAccumulator::new(),
            rho_global_stats: WelfordAccumulator::new(),
        }
    }

    #[inline]
    pub fn observe_tick(
        &mut self,
        tau_w: f64,
        sost: f64,
        mqi: f64,
        sans: f64,
        rho_global: f64,
    ) {
        self.tau_w_stats.update(tau_w);
        self.sost_stats.update(sost);
        self.mqi_stats.update(mqi);
        self.sans_stats.update(sans);
        self.rho_global_stats.update(rho_global);
        if rho_global < 0.0 {
            self.pinned_anomaly = true;
        }
    }
}

/// 4 Regioni Anatomiche 3D che guidano la 3D Body Heatmap in `ares-cockpit/`.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AnatomicalRegion {
    HeadOcularSans = 0,
    NeckInternalJugularVein = 1,
    TorsoCardioAutonomic = 2,
    LowerLimbSoleusCalcaneus = 3,
}

impl AnatomicalRegion {
    /// Coordinate normalizzate 3D (x, y, z) in [-1.0, +1.0]^3 per il rendering Three.js.
    #[inline]
    pub const fn normalized_centroid_3d(self) -> [f64; 3] {
        match self {
            Self::HeadOcularSans => [0.00, 0.82, 0.05],
            Self::NeckInternalJugularVein => [-0.06, 0.62, 0.04],
            Self::TorsoCardioAutonomic => [0.00, 0.30, 0.02],
            Self::LowerLimbSoleusCalcaneus => [0.00, -0.65, -0.03],
        }
    }
}

/// 6 Compartimenti dell'Habitat Spaziale governati da regole deontiche NASA-STD-3001.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SpacecraftHabitatZone {
    CrewSleepQuarters = 0,
    AredExerciseBay = 1,
    LbnpChamberBay = 2,
    MedOpsUltrasoundBay = 3,
    RadiationStormShelter = 4,
    EvaAirlockSurface = 5,
}

/// Politica deontica e limiti operativi per compartimento dell'habitat.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HabitatZoneDeonticPolicy {
    pub zone: SpacecraftHabitatZone,
    pub max_dwell_seconds: f64,
    pub max_acoustic_dba: f64,
    pub max_safe_radiation_msv_d: f64,
    pub max_safe_gai_pct: f64,
}

/// Esito della verifica deontica Q-STL per la presenza dell'astronauta in una zona dell'habitat.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HabitatDeonticEvaluation {
    pub zone: SpacecraftHabitatZone,
    pub rho_zone_qstl: f64,
    pub authorized: bool,
    pub violation_reason: Option<&'static str>,
}

/// Valuta in O(1) la conformita deontica Q-STL della zona abitativa attiva.
pub fn evaluate_habitat_zone_deontic_qstl(
    zone: SpacecraftHabitatZone,
    dwell_seconds: f64,
    radiation_msv_d: f64,
    gai_pct: f64,
    pocus_thrombus_confirmed: bool,
) -> HabitatDeonticEvaluation {
    // Regola 1: Durante tempesta solare (SPE > 1.5 mSv/d), solo RadiationStormShelter e autorizzato
    if radiation_msv_d > 1.5 && zone != SpacecraftHabitatZone::RadiationStormShelter {
        let rho_rad = ((1.5 - radiation_msv_d) / 1.5).clamp(-1.0, 0.0);
        return HabitatDeonticEvaluation {
            zone,
            rho_zone_qstl: rho_rad,
            authorized: false,
            violation_reason: Some("SPE radiation > 1.5 mSv/d: mandatory evacuation to Storm Shelter [V1 4001]"),
        };
    }

    // Regola 2: EVA Airlock bloccato se trombo IJV confermato o GAI > 12.0% senza smorzamento
    if zone == SpacecraftHabitatZone::EvaAirlockSurface {
        if pocus_thrombus_confirmed {
            return HabitatDeonticEvaluation {
                zone,
                rho_zone_qstl: -1.0,
                authorized: false,
                violation_reason: Some("EVA prohibited: confirmed IJV thrombus requires MedOps protocol [MTB-007]"),
            };
        }
        if gai_pct > 12.0 {
            let rho_gai = ((12.0 - gai_pct) / 12.0).clamp(-1.0, 0.0);
            return HabitatDeonticEvaluation {
                zone,
                rho_zone_qstl: rho_gai,
                authorized: false,
                violation_reason: Some("EVA high-impact gait restricted: GAI > 12% requires +25% suit ankle damping [Gate 3]"),
            };
        }
    }

    // Regola 3: Limite di permanenza continua nella camera LBNP (-30 mmHg <= 2700s / 45 min)
    if zone == SpacecraftHabitatZone::LbnpChamberBay && dwell_seconds > 2700.0 {
        let rho_dwell = ((2700.0 - dwell_seconds) / 900.0).clamp(-1.0, 0.0);
        return HabitatDeonticEvaluation {
            zone,
            rho_zone_qstl: rho_dwell,
            authorized: false,
            violation_reason: Some("LBNP max dwell (2700s) exceeded: syncope prevention guardrail [Gate 2]"),
        };
    }

    let nominal_margin = (1.0 - (dwell_seconds / 28_800.0)).clamp(0.1, 1.0);
    HabitatDeonticEvaluation {
        zone,
        rho_zone_qstl: nominal_margin,
        authorized: true,
        violation_reason: None,
    }
}

/// Modello di transizione di Markov Dirichlet-Multinomiale a 6 stati per i compartimenti dell'habitat.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HabitatMarkovTransitionModel {
    pub transition_counts: [[u32; 6]; 6],
    pub dirichlet_alpha: f64,
}

impl Default for HabitatMarkovTransitionModel {
    fn default() -> Self {
        Self {
            transition_counts: [[1; 6]; 6],
            dirichlet_alpha: 0.5,
        }
    }
}

impl HabitatMarkovTransitionModel {
    #[inline]
    pub fn record_transition(&mut self, from: SpacecraftHabitatZone, to: SpacecraftHabitatZone) {
        let i = from as usize;
        let j = to as usize;
        self.transition_counts[i][j] = self.transition_counts[i][j].saturating_add(1);
    }

    /// Probabilita predittiva a posteriori Bayesiana P(to | from) con prior di Dirichlet.
    #[inline]
    pub fn posterior_transition_prob(
        &self,
        from: SpacecraftHabitatZone,
        to: SpacecraftHabitatZone,
    ) -> f64 {
        let i = from as usize;
        let j = to as usize;
        let alpha = self.dirichlet_alpha.max(1e-3);
        let row_sum: u32 = self.transition_counts[i].iter().sum();
        ((self.transition_counts[i][j] as f64) + alpha) / ((row_sum as f64) + 6.0 * alpha)
    }

    /// Calcola la divergenza di Kullback-Leibler D_KL(P_obs || P_baseline) per una zona di partenza.
    pub fn kl_divergence_from_baseline(
        &self,
        from: SpacecraftHabitatZone,
        baseline_probs: &[f64; 6],
    ) -> f64 {
        let zones = [
            SpacecraftHabitatZone::CrewSleepQuarters,
            SpacecraftHabitatZone::AredExerciseBay,
            SpacecraftHabitatZone::LbnpChamberBay,
            SpacecraftHabitatZone::MedOpsUltrasoundBay,
            SpacecraftHabitatZone::RadiationStormShelter,
            SpacecraftHabitatZone::EvaAirlockSurface,
        ];
        let mut kl = 0.0;
        for (idx, &z_to) in zones.iter().enumerate() {
            let p = self.posterior_transition_prob(from, z_to).max(1e-9);
            let q = baseline_probs[idx].max(1e-9);
            kl += p * (p / q).ln();
        }
        kl.max(0.0)
    }
}
```

---

## 5. Step-by-Step Implementation Checklist

- [ ] **Step 1:** Creare `crates/ares-causal-graph/src/welford_compactor.rs` implementando `WelfordAccumulator` e `LongitudinalSuperNode`, verificando che un array di 900 `LongitudinalSuperNode` occupi $< 200\text{ KB}$ in RAM.
- [ ] **Step 2:** Creare `crates/ares-causal-graph/src/spatial_habitat_graph.rs` con `AnatomicalRegion` (e coordinate 3D normalizzate per `ares-cockpit/`), `SpacecraftHabitatZone`, `evaluate_habitat_zone_deontic_qstl` e `HabitatMarkovTransitionModel`.
- [ ] **Step 3:** Esportare i nuovi moduli in `crates/ares-causal-graph/src/lib.rs` ed eseguire `cargo test -p ares-causal-graph` e `cargo clippy -p ares-causal-graph --all-targets -- -D warnings`.

---

## 6. Deterministic Verification & Unit Tests

1. **`test_welford_accumulator_matches_exact_two_pass_variance`:**
   - Alimenta `WelfordAccumulator` con 481 valori e verifica che `mean` e `sample_variance()` coincidano con la formula a due passaggi entro $10^{-12}$, e che `900 * std::mem::size_of::<LongitudinalSuperNode>() < 200_000`.
2. **`test_habitat_deontic_qstl_blocks_eva_on_thrombus_and_enforces_storm_shelter_on_spe`:**
   - Verifica che con `radiation_msv_d = 2.4` (> `1.5`), la permanenza in `AredExerciseBay` restituisca `authorized == false` e `rho_zone_qstl < 0.0`, mentre `RadiationStormShelter` restituisca `authorized == true`.
3. **`test_markov_dirichlet_probabilities_sum_to_one_and_detect_kl_anomaly`:**
   - Verifica che $\sum_{b=0}^{5} P(z_b \mid z_a) = 1.0 \pm 10^{-12}$ e che una sequenza ripetuta di confinamento anomalo in `CrewSleepQuarters` produca $D_{\text{KL}} > 0.50$.
