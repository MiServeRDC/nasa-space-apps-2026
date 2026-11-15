# Piano Implementativo Definitivo — Fase 05 (C1): Frost-Hargens RK4 Sclerostin ODE, Ultrasound Muscle Quality Index (`MQI`) & Martian Gait Asymmetry Index (`GAI` at $0.38g$)

- **Blocco Architetturale**: Blocco C (*Motore Rust Core: Fisiopatologia Differenziale & Grafo Causale `ADHG` — `2. EVALUATE` Parte 1*, Fasi 05–07)
- **Fase**: Fase 05 (`C1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-causal-graph`](../../crates/ares-causal-graph/README.md)
- **Owner Principale**: `ARES-Health Team`
- **File Target Previsti**:
  1. `crates/ares-causal-graph/Cargo.toml` *(NEW)*
  2. `crates/ares-causal-graph/src/lib.rs` *(NEW)*
  3. `crates/ares-causal-graph/src/mechanotransduction.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 10\,\mu\text{s}$ per passo d'integrazione Runge-Kutta di 4° ordine (**RK4**) e valutazione `MQI`/`GAI` (zero allocazioni heap).
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, protezione da divisione per zero nella funzione di Hill regolarizzata.

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale nella Cascata Causale
Nella microgravità dello spazio profondo, il primo evento scatenante della cascata multi-sistemica è la **deprivazione di carico meccanico sugli arti inferiori** (`ARED`). La **Fase 05 (`C1`)** modella matematicamente questo primo stadio nel Motore Rust Core (`crates/ares-causal-graph/src/mechanotransduction.rs`):
1. **Meccanostato di Frost e ODE della Sclerostina ($\text{SOST}$):** Quando il carico giornaliero sull'`ARED` scende sotto la soglia di deformazione ossea ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$), gli osteociti aumentano la secrezione di Sclerostina, inibendo la via $\text{Wnt}/\beta\text{-catenina}$ e provocando riassorbimento osseo con ipercalciuria renale ($\text{Ca}^{2+}$ urinario).
2. **Muscle Quality Index ($\text{MQI}$) Ecografico del Soleo:** Quantifica contemporaneamente l'atrofia trasversa delle fibre lente di Tipo I ($\text{CSA}_{\text{soleus}}$) e l'infiltrazione mio-steatosica misurata dall'ecogenicità ultrasonografica ($E_{\text{echo}}$), che riducono la pompa venosa crurale e il rilascio di miochine endotelio-protettive (Irisina e `miR-126-3p`).
3. **Gait Asymmetry Index ($\text{GAI}$) per l'Atterraggio Marziano a $0.38g$:** Calcola l'asimmetria biomeccanica dell'appoggio che governa il **Hard Clinical Safety Gate 3** (calibrazione dello smorzamento di caviglia della tuta EVA marziana quando $\text{GAI} > 12\%$).

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Harold M. Frost:** *"Bone's Mechanostat: A 2003 Update"*, *The Anatomical Record Part A*, 275A(2):1081–1101, 2003 ($\varepsilon_{\text{Frost}} = 1000\ \mu\varepsilon$).
2. **Alexander G. Robling et al.:** *"Mechanical stimulation of bone in vivo reduces osteocyte expression of Sost/sclerostin"*, *Journal of Biological Chemistry*, 283(9):5866–5875, 2008.
3. **NASA OSDR `OSD-195` & NASA NLSP `SMCCP` / `BRSMFSR` (`NASA-0000100`):** Atrofia delle fibre del soleo/vasto laterale e perdita di forza dopo volo spaziale e bed-rest.
4. **Prof. Francesco Pegreffi et al.:** Biomarcatori ecografici muscoloscheletrici (*Muscle Quality Index* $\text{MQI}$ ed ecogenicità mio-steatosica) e prevenzione dell'asimmetria del passo ($\text{GAI}$).

### 1.3 Equazioni Differenziali e Algebriche
1. **ODE Regolarizzata di Frost-Hargens per la Sclerostina ($\text{SOST}$, integrata via RK4):**
   $$\frac{d[\text{SOST}]}{dt} = k_{\text{prod}} \cdot \frac{1}{1 + \left(\frac{\varepsilon_{\text{mech}}(t)}{\varepsilon_{\text{Frost}}}\right)^\gamma} - k_{\text{deg}} \cdot [\text{SOST}](t)$$
   con $\varepsilon_{\text{mech}}(t) = 11.2 \cdot F_{\text{ARED}}(t)\ [\mu\varepsilon]$, $\varepsilon_{\text{Frost}} = 1000.0\ \mu\varepsilon$, $\gamma = 2.0$, $k_{\text{prod}} = 18.5\text{ pmol/(L}\cdot\text{d)}$, $k_{\text{deg}} = 0.28\text{ d}^{-1}$.
2. **Muscle Quality Index ($\text{MQI} \in [0.0, 1.0]$):**
   $$\text{MQI}(t) = \text{clamp}\!\left(1.0 - 0.35 \cdot \frac{E_{\text{echo}}(t) - E_0}{E_{\text{crit}} - E_0} - 0.65 \cdot \frac{100.0 - \text{CSA}_{\text{soleus},\%}(t)}{100.0 - \text{CSA}_{\text{crit},\%}}, \; 0.0, \; 1.0\right)$$

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 05 (`C1`) |
| :--- | :--- | :--- |
| `crates/ares-causal-graph/Cargo.toml` | **CREATE** | Dipendenze `ares-core-types`, `petgraph = "0.7"`, `serde = { version = "1.0", features = ["derive"] }`, `thiserror = "2.0"`. |
| `crates/ares-causal-graph/src/mechanotransduction.rs` | **CREATE** | Integratore RK4 `step_sclerostin_rk4`, calcolatore `compute_musculoskeletal_state` e stima del secretoma muscolare (`irisin_protective_factor`). |
| `crates/ares-causal-graph/src/lib.rs` | **CREATE** | Esporta `mechanotransduction`, `hemodynamics`, `adhg_graph` e `bayesian_pocus`. |

---

## 3. Architettura di `mechanotransduction.rs` in Puro Rust 2024

```rust
//! Fase 05 (C1): Meccanotrasduzione muscolo-osso, ODE RK4 di Frost-Hargens per la Sclerostina (SOST),
//! Ultrasound Muscle Quality Index (MQI) e Gait Asymmetry Index (GAI a 0.38g).

use ares_core_types::constants::{
    ARED_NOMINAL_LOAD_KGF, FROST_MECHANOSTAT_STRAIN_UE, SOST_HILL_EXPONENT, sanitize_f64,
};
use ares_core_types::telemetry::Musculoskeletal;

const K_PROD_SOST: f64 = 18.5; // pmol/(L * day)
const K_DEG_SOST: f64 = 0.28;  // 1 / day
const ARED_TO_MICROSTRAIN: f64 = 11.2; // 125 kgf -> 1400 microstrain (> 1000 ue Frost threshold)

/// Derivata temporale d[SOST]/dt (in pmol/(L * day)) secondo il modello regolarizzato di Frost-Hargens.
#[inline]
pub fn sost_ode_rhs(sost_pmol_l: f64, ared_load_kgf: f64) -> f64 {
    let load = sanitize_f64(ared_load_kgf, 0.0).max(0.0);
    let strain_ue = ARED_TO_MICROSTRAIN * load;
    let ratio = (strain_ue / FROST_MECHANOSTAT_STRAIN_UE).powf(SOST_HILL_EXPONENT);
    let hill_suppression = 1.0 / (1.0 + ratio);
    K_PROD_SOST * hill_suppression - K_DEG_SOST * sost_pmol_l.max(0.0)
}

/// Integratore Runge-Kutta di 4° ordine (RK4) a passo fisso `dt_days` per la Sclerostina.
#[inline]
pub fn step_sclerostin_rk4(current_sost: f64, ared_load_kgf: f64, dt_days: f64) -> f64 {
    let dt = sanitize_f64(dt_days, 0.1).clamp(0.0, 5.0);
    let y0 = sanitize_f64(current_sost, 24.0).clamp(10.0, 120.0);

    let k1 = sost_ode_rhs(y0, ared_load_kgf);
    let k2 = sost_ode_rhs(y0 + 0.5 * dt * k1, ared_load_kgf);
    let k3 = sost_ode_rhs(y0 + 0.5 * dt * k2, ared_load_kgf);
    let k4 = sost_ode_rhs(y0 + dt * k3, ared_load_kgf);

    (y0 + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)).clamp(12.0, 95.0)
}

/// Calcola lo stato muscoloscheletrico completo (`Musculoskeletal`) in funzione del giorno di volo
/// (`flight_day`) e del carico giornaliero `ARED` (`ared_daily_load_kgf`).
#[inline]
pub fn compute_musculoskeletal_state(
    flight_day: u32,
    ared_daily_load_kgf: f64,
) -> Musculoskeletal {
    let load = sanitize_f64(ared_daily_load_kgf, ARED_NOMINAL_LOAD_KGF).clamp(0.0, 250.0);
    let load_deficit_ratio = ((ARED_NOMINAL_LOAD_KGF - load) / ARED_NOMINAL_LOAD_KGF).clamp(0.0, 1.0);
    let fd = (flight_day as f64).clamp(1.0, 1000.0);
    let exposure_factor = 1.0 - (-fd / 45.0).exp();

    // Area trasversa del soleo (% rispetto alla baseline pre-volo)
    let soleus_csa_pct = (100.0 - 28.0 * load_deficit_ratio * exposure_factor).clamp(65.0, 100.0);

    // Ecogenicita ultrasonografica mio-steatosica (scala 0..255 AU, baseline = 48 AU)
    let echo_intensity_au = (48.0 + 46.0 * load_deficit_ratio * exposure_factor).clamp(40.0, 140.0);

    // Muscle Quality Index (MQI in [0.0, 1.0], Prof. Pegreffi)
    let echo_penalty = ((echo_intensity_au - 48.0) / (110.0 - 48.0)).clamp(0.0, 1.0);
    let csa_penalty = ((100.0 - soleus_csa_pct) / (100.0 - 70.0)).clamp(0.0, 1.0);
    let mqi_index = (1.0 - 0.35 * echo_penalty - 0.65 * csa_penalty).clamp(0.15, 1.0);

    // Integrazione RK4 della Sclerostina sul tempo di missione equivalente
    let mut sost = 22.5;
    let steps = 12;
    let dt = (fd / steps as f64).clamp(0.2, 5.0);
    for _ in 0..steps {
        sost = step_sclerostin_rk4(sost, load, dt);
    }

    // Calciuria renale secondaria al riassorbimento osseo (mg/d)
    let urinary_calcium_mg_d = (175.0 + 4.2 * (sost - 22.5).max(0.0)).clamp(140.0, 420.0);

    // Gait Asymmetry Index (GAI %) per l'atterraggio a 0.38g (Hard Safety Gate 3 se > 12%)
    let gai_pct = (3.5 + 16.5 * (1.0 - mqi_index)).clamp(2.0, 28.0);

    Musculoskeletal {
        ared_daily_load_kgf: load,
        soleus_csa_pct,
        echo_intensity_au,
        mqi_index,
        sclerostin_pmol_l: sost,
        urinary_calcium_mg_d,
        gai_pct,
    }
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 05 (`C1`)

1. **`test_sclerostin_rises_when_ared_load_drops_below_frost_threshold`:** Verifica che con `ared_daily_load_kgf = 0.0` a `FD90` la Sclerostina superi la soglia critica ($> 55\text{ pmol/L}$), mentre con `135.0 kgf` rimanga in fascia nominale ($< 30\text{ pmol/L}$).
2. **`test_gai_exceeds_12_pct_under_severe_soleus_atrophy`:** Verifica che un deficit prolungato di carico porti `mqi_index < 0.50` e `gai_pct > 12.0%`, innescando il **Hard Safety Gate 3**.
