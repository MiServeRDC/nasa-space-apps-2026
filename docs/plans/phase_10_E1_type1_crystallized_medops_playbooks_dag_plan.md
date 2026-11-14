# Piano Implementativo Definitivo — Fase 10 (E1): Type-1 Crystallized MedOps Playbooks DAG (`#01–#05`) & Impact-Ranked Countermeasures

- **Blocco Architetturale**: Blocco E (*Motore Decisionale MedOps Playbooks & I 3 Hard Clinical Safety Gates — `3. ACT`*, Fasi 10–11)
- **Fase**: Fase 10 (`E1`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-medops-playbooks`](../../crates/ares-medops-playbooks/README.md)
- **Owner Principale**: `@fertech02` (con integrazione scientifica `@fabiomalagutti27-droid`)
- **File Target Previsti**:
  1. `crates/ares-medops-playbooks/Cargo.toml` *(NEW)*
  2. `crates/ares-medops-playbooks/src/lib.rs` *(NEW)*
  3. `crates/ares-medops-playbooks/src/playbooks.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 20\,\mu\text{s}$ per selezione e ordinamento deterministico del Playbook attivo (0 token LLM richiesti).
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, esecuzione deterministica *Type-1 Crystallized DAG* (`Entry 007`).

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale (`3. ACT`)
Con un ritardo radio Terra-Marte da 8 a 48 minuti (fino al blackout completo di 14 giorni durante la congiunzione solare), il Crew Medical Officer non può attendere né il consulto vocale da Houston né la generazione stocastica multi-turn di un LLM (che potrebbe dimenticare un controllo di sicurezza critico).

Ispirandosi direttamente alla **Fase 162 (`AO1`)** di `spatiotemporal-mcp-engine`, la **Fase 10 (`E1`)** compila i **5 Playbook Operativi MedOps (`#01–#05`)** come **DAG deterministici Type-1 in puro Rust**:
* **Playbook `#01` (`PLAYBOOK_01_VENOUS_STASIS_LBNP`):** Stasi venosa giugulare ($\hat{\rho}_{\tau_w} < 0$) senza trombo confermato $\rightarrow$ camera `LBNP` a $-30\text{ mmHg}$, contrazioni attive del soleo/NMES, ispezione ecografica POCUS B-mode.
* **Playbook `#02` (`PLAYBOOK_02_CONFIRMED_IJV_THROMBUS`):** Trombo endoluminale non comprimibile confermato al POCUS (`pocus_thrombus_confirmed == true`) $\rightarrow$ sblocco autorizzato del protocollo anticoagulante mirato (Enoxaparina/Apixaban) + sospensione manovre di Valsalva sull'`ARED`.
* **Playbook `#03` (`PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED`):** Deficit di carico meccanico ($\hat{\rho}_{\text{ARED}} < 0$ o $\hat{\rho}_{\text{SOST}} < 0$) $\rightarrow$ ricalibrazione carico resistivo `ARED` sopra la soglia di Frost ($\ge 125\text{ kgf} \implies > 1000\ \mu\varepsilon$) + idratazione anti-nefrolitiasi (`2.8 L/d`).
* **Playbook `#04` (`PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION`):** Rischio neuro-oculare `SANS` ($\hat{\rho}_{\text{SANS}} < 0$) $\rightarrow$ applicazione `Thigh Cuffs` venosi + sessione `LBNP` notturna + integrazione cofattori folati/`B-Complex`.
* **Playbook `#05` (`PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS`):** Evento solare particellare (`CSA CANS` $\dot{D}_{\text{rad}} > 1.5\text{ mSv/d}$) $\rightarrow$ ingresso immediato nello storm shelter schermato a polietilene/acqua + protocollo antiossidante endoteliale.

### 1.2 Riferimenti Scientifici (`deep-scholar`)
1. **Arun Malik:** *"Progressive Crystallization: Turning Agent Exploration into Deterministic, Lower-Cost Workflows in Production"*, `arXiv:2607.07052v1`, Luglio 2026 | **DOI:** `10.48550/arXiv.2607.07052`.
2. **Songyuan Li, Ahmed M. Abdelmoniem, Shiqiang Wang:** *"ProgRouter: Online Progress-Guided Orchestration for Multi-Agent LLM Workflows under Quality-Cost Tradeoffs"*, *Findings of ACL: EMNLP 2026*, `arXiv:2608.25992v2` | **DOI:** `10.48550/arXiv.2608.25992`.

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 10 (`E1`) |
| :--- | :--- | :--- |
| `crates/ares-medops-playbooks/Cargo.toml` | **CREATE** | Dipendenze `ares-core-types`, `ares-causal-graph`, `ares-nqs-stl`, `serde`, `thiserror`. |
| `crates/ares-medops-playbooks/src/playbooks.rs` | **CREATE** | Selettore deterministico `select_candidate_playbook` per i Playbook `#01–#05` con azioni ordinate per $\Delta\hat{\rho}/\text{ora}$. |
| `crates/ares-medops-playbooks/src/lib.rs` | **CREATE** | Esporta `playbooks` e `safety_gates`. |

---

## 3. Architettura di `playbooks.rs` in Puro Rust 2024

```rust
//! Fase 10 (E1): Esecutore deterministico Type-1 Crystallized dei 5 Playbook MedOps (#01-#05).

use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularHemodynamics, Musculoskeletal,
    NqsStlMargins, SafetyGates,
};

/// Seleziona deterministicamente il Playbook candidato prima dell'applicazione finale dei Safety Gates.
#[inline]
pub fn select_candidate_playbook(
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    nqs: &NqsStlMargins,
    causal_chain_summary: Vec<String>,
) -> ActivePlaybook {
    let default_gates = SafetyGates {
        anticoagulant_lock_active: !jugular.pocus_thrombus_confirmed,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active: musculo.gai_pct > 12.0,
    };

    // Priorita 1: Trombo giugulare confermato al POCUS B-Mode (#02)
    if jugular.pocus_thrombus_confirmed {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_02_CONFIRMED_IJV_THROMBUS".to_string(),
            title: "Playbook #02: POCUS-Confirmed IJV Thrombosis Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_ANTICOAG_ENOXAPARIN".to_string(),
                    label: "Initiate weight-adjusted Enoxaparin / Apixaban (POCUS thrombus verified)".to_string(),
                    category: "PHARMACOLOGICAL_UNLOCKED".to_string(),
                    delta_rho_per_hour: 0.22,
                },
                CountermeasureAction {
                    action_id: "ACT_SUSPEND_VALSALVA_ARED".to_string(),
                    label: "Suspend high-Valsalva heavy ARED squats to prevent thrombus embolization".to_string(),
                    category: "MECHANICAL_RESTRICTION".to_string(),
                    delta_rho_per_hour: 0.15,
                },
            ],
        };
    }

    // Priorita 2: Allerta Radiazioni Solari CSA CANS (#05)
    if biometrics.radiation_dose_rate_msv_d > 1.5 {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_05_SPE_RADIATION_SHELTER_CANS".to_string(),
            title: "Playbook #05: CSA CANS Solar Particle Event Storm Shelter Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_STORM_SHELTER_INGRESS".to_string(),
                    label: "Relocate crew to polyethylene/water-shielded habitat core immediately".to_string(),
                    category: "RADIATION_ALARA".to_string(),
                    delta_rho_per_hour: 0.28,
                },
                CountermeasureAction {
                    action_id: "ACT_ENDOTHELIAL_ANTIOXIDANT".to_string(),
                    label: "Administer endothelial antioxidant & B-Complex radioprotective protocol".to_string(),
                    category: "METABOLIC_COUNTERMEASURE".to_string(),
                    delta_rho_per_hour: 0.09,
                },
            ],
        };
    }

    // Priorita 3: Stasi Venosa Giugulare / Shear Stress Critico senza trombo (#01)
    if nqs.rho_tau_w < 0.15 {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_01_VENOUS_STASIS_LBNP".to_string(),
            title: "Playbook #01: Non-Pharmacological IJV Stasis Reversal (LBNP + Calf Pump)".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_LBNP_MINUS_30_MMHG".to_string(),
                    label: "Activate Lower Body Negative Pressure (LBNP) at -30 mmHg for 45 min with active calf contractions".to_string(),
                    category: "PHYSICAL_HEMODYNAMIC".to_string(),
                    delta_rho_per_hour: 0.19,
                },
                CountermeasureAction {
                    action_id: "ACT_POCUS_NECK_SCAN".to_string(),
                    label: "Perform bilateral B-Mode & Doppler POCUS compression exam of Internal Jugular Vein".to_string(),
                    category: "DIAGNOSTIC_VERIFICATION".to_string(),
                    delta_rho_per_hour: 0.12,
                },
            ],
        };
    }

    // Priorita 4: Rischio Neuro-Oculare SANS (#04)
    if nqs.rho_sans < 0.20 {
        return ActivePlaybook {
            playbook_id: "PLAYBOOK_04_SANS_TRANSLAMINAR_MITIGATION".to_string(),
            title: "Playbook #04: SANS Translaminar Pressure & Venous Decongestion Protocol".to_string(),
            causal_chain_summary,
            safety_gates: default_gates,
            actions: vec![
                CountermeasureAction {
                    action_id: "ACT_VENOUS_THIGH_CUFFS".to_string(),
                    label: "Apply calibrated lower-extremity Venous Thigh Cuffs (50 mmHg) + nocturnal LBNP".to_string(),
                    category: "PHYSICAL_HEMODYNAMIC".to_string(),
                    delta_rho_per_hour: 0.14,
                },
            ],
        };
    }

    // Default / Priorita 5: Ottimizzazione Meccanotrasduzione ARED & Osso (#03)
    ActivePlaybook {
        playbook_id: "PLAYBOOK_03_SARCOPENIA_OSTEOPENIA_ARED".to_string(),
        title: "Playbook #03: Frost Mechanostat ARED Loading & Renal Stone Prevention".to_string(),
        causal_chain_summary,
        safety_gates: default_gates,
        actions: vec![
            CountermeasureAction {
                action_id: "ACT_ARED_FROST_LOAD".to_string(),
                label: "Maintain ARED resistive squat/heel-raise load >= 125 kgf (> 1000 microstrain)".to_string(),
                category: "MECHANICAL_COUNTERMEASURE".to_string(),
                delta_rho_per_hour: 0.11,
            },
            CountermeasureAction {
                action_id: "ACT_HYDRATION_CITRATE".to_string(),
                label: "Maintain fluid intake >= 2.8 L/day + potassium citrate to buffer urinary calcium".to_string(),
                category: "METABOLIC_COUNTERMEASURE".to_string(),
                delta_rho_per_hour: 0.07,
            },
        ],
    }
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 10 (`E1`)

1. **`test_playbook_01_selected_on_low_tau_w_without_thrombus`:** Verifica che per $\tau_w = 0.85\text{ dyn/cm}^2$ e `pocus_thrombus_confirmed = false` venga selezionato `PLAYBOOK_01_VENOUS_STASIS_LBNP`.
2. **`test_playbook_02_selected_only_when_pocus_thrombus_confirmed`:** Verifica che `PLAYBOOK_02_CONFIRMED_IJV_THROMBUS` venga attivato esclusivamente quando `pocus_thrombus_confirmed == true`.
