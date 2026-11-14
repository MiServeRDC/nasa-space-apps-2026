# Piano Implementativo Definitivo — Fase 11 (E2): State Machine of the 3 Hard Clinical Safety Gates

- **Blocco Architetturale**: Blocco E (*Motore Decisionale MedOps Playbooks & I 3 Hard Clinical Safety Gates — `3. ACT`*, Fasi 10–11)
- **Fase**: Fase 11 (`E2`)
- **Stato**: PIANO DEFINITIVO APPROVATO PER IMPLEMENTAZIONE (`READY FOR IMPLEMENTATION`)
- **Crate Principale**: [`crates/ares-medops-playbooks`](../../crates/ares-medops-playbooks/README.md)
- **Owner Principale**: `@fertech02` (con validazione Flight Surgeon `@fabiomalagutti27-droid`)
- **File Target Previsti**:
  1. `crates/ares-medops-playbooks/src/safety_gates.rs` *(NEW)*
- **Budget Latenza Hot-Path**: $< 5\,\mu\text{s}$ per applicazione deterministica dei 3 cancelli di sicurezza clinica.
- **Politica Rust 2024 Strict Mode**: Zero `.unwrap()`, zero `.expect()`, invarianti salvavita `Entry 002` ed `Entry 003` garantiti per costruzione.

---

## 1. Executive Summary, Visione d'Insieme & Grounding Scientifico (`deep-scholar`)

### 1.1 Visione Architetturale: I 3 Hard Clinical Safety Gates
In medicina spaziale operativa, una contromisura applicata senza guardia di sicurezza può uccidere l'astronauta più rapidamente della patologia stessa:
1. **Hard Safety Gate 1 (Blocco Anticoagulanti Empirici — `Entry 002`):** Prescrivere Apixaban o Enoxaparina sulla sola base di un flusso giugulare rallentato ($v_{\max} < 5.0\text{ cm/s}$) espone l'astronauta al rischio di emorragia intracranica/subdurale fatale in caso di urto cranico minore durante il fluttuamento o in tuta EVA. Il Gate 1 **rimuove a livello di codice** qualsiasi azione farmacologica anticoagulante se `pocus_thrombus_confirmed == false`.
2. **Hard Safety Gate 2 (Auto-Vent Anti-Sincope Camera `LBNP` — `Entry 003`):** Una depressione di $-30\text{ mmHg}$ richiama $> 500\text{ mL}$ di sangue negli arti inferiori; se il tono vasomotore è decondizionato (`NLSP Neuroendocrine Tilt`), l'astronauta può andare incontro a sincope ipotensiva dentro la camera. Se il calo di pressione sistolica supera $15\text{ mmHg}$ o la frequenza cardiaca supera $115\text{ bpm}$, il Gate 2 inietta in cima alla lista l'azione di emergenza `ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG`.
3. **Hard Safety Gate 3 (Smorzamento Caviglia Tuta EVA a $0.38g$):** Se il Gait Asymmetry Index ($\text{GAI}$) supera il $12.0\%$, il Gate 3 attiva `eva_suit_damping_active = true` e prescrive la calibrazione dell'articolazione di caviglia della tuta marziana per prevenire la rottura del tendine d'Achille.

---

## 2. Tabella Moduli e File Rust Coinvolti

| File / Modulo | Azione | Responsabilita Architetturale nella Fase 11 (`E2`) |
| :--- | :--- | :--- |
| `crates/ares-medops-playbooks/src/safety_gates.rs` | **CREATE** | Funzione pura `enforce_hard_clinical_safety_gates` che filtra e arricchisce `ActivePlaybook` applicando i 3 Safety Gates. |

---

## 3. Architettura di `safety_gates.rs` in Puro Rust 2024

```rust
//! Fase 11 (E2): Macchina a stati deterministica dei 3 Hard Clinical Safety Gates.

use ares_core_types::constants::{
    GAI_MAX_SAFE_PCT, LBNP_MAX_SAFE_HR_BPM, LBNP_MAX_SYS_BP_DROP_MMHG,
};
use ares_core_types::telemetry::{
    ActivePlaybook, Biometrics, CountermeasureAction, JugularHemodynamics, Musculoskeletal,
    SafetyGates, StressTestScenarioInput,
};

/// Applica in modo inflessibile i 3 Hard Clinical Safety Gates al Playbook candidato.
#[inline]
pub fn enforce_hard_clinical_safety_gates(
    mut playbook: ActivePlaybook,
    biometrics: &Biometrics,
    musculo: &Musculoskeletal,
    jugular: &JugularHemodynamics,
    scenario: &StressTestScenarioInput,
) -> ActivePlaybook {
    let anticoagulant_lock_active = !jugular.pocus_thrombus_confirmed;
    let hr = biometrics.heart_rate_bpm.unwrap_or(72.0);
    let pre_syncope_detected = jugular.lbnp_active
        && (scenario.systolic_bp_drop_mmhg > LBNP_MAX_SYS_BP_DROP_MMHG
            || hr > LBNP_MAX_SAFE_HR_BPM);
    let eva_suit_damping_active = musculo.gai_pct > GAI_MAX_SAFE_PCT;

    playbook.safety_gates = SafetyGates {
        anticoagulant_lock_active,
        lbnp_auto_vent_armed: true,
        eva_suit_damping_active,
    };

    // Gate 1: Rimuove categoricamente qualsiasi farmaco anticoagulante se POCUS non conferma trombo
    if anticoagulant_lock_active {
        playbook.actions.retain(|a| {
            !a.action_id.contains("ANTICOAG") && !a.category.contains("PHARMACOLOGICAL")
        });
    }

    // Gate 2: Se viene rilevato rischio pre-sincopale durante LBNP, sfiata immediatamente a 0 mmHg
    if pre_syncope_detected {
        playbook.actions.insert(
            0,
            CountermeasureAction {
                action_id: "ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG".to_string(),
                label: format!(
                    "SAFETY GATE 2 TRIGGERED: Auto-vent LBNP chamber to 0 mmHg immediately (SBP drop {:.1} mmHg / HR {:.0} bpm)",
                    scenario.systolic_bp_drop_mmhg, hr
                ),
                category: "HARD_SAFETY_GATE_OVERRIDE".to_string(),
                delta_rho_per_hour: 0.35,
            },
        );
    }

    // Gate 3: Se GAI > 12%, aggiunge vincolo di smorzamento caviglia tuta EVA a 0.38g
    if eva_suit_damping_active {
        playbook.actions.push(CountermeasureAction {
            action_id: "ACT_EVA_SUIT_ANKLE_DAMPING_038G".to_string(),
            label: format!(
                "SAFETY GATE 3 ACTIVE: Lock plyometric impact & set Martian EVA suit ankle damping +25% (GAI = {:.1}% > 12.0%)",
                musculo.gai_pct
            ),
            category: "BIOMECHANICAL_SAFETY_GATE".to_string(),
            delta_rho_per_hour: 0.10,
        });
    }

    playbook
}
```

---

## 4. Strategia di Test e Gate di Verifica della Fase 11 (`E2`)

1. **`test_gate1_strips_anticoagulants_when_pocus_is_false`:** Inietta artificialmente un'azione `ACT_ANTICOAG_ENOXAPARIN` con `pocus_thrombus_confirmed = false` e verifica che `enforce_hard_clinical_safety_gates` la rimuova al $100\%$.
2. **`test_gate2_injects_auto_vent_when_sbp_drops_over_15_mmhg`:** Verifica che con `lbnp_active = true` e `systolic_bp_drop_mmhg = 18.5` la prima azione in `playbook.actions[0]` sia `ACT_EMERGENCY_LBNP_AUTO_VENT_0_MMHG`.
