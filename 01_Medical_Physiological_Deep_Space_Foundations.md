# 01. Medical & Physiological Deep Space Foundations
## Grounding Clinical Models: Physiatry, Musculoskeletal Degeneration, Vascular Stasis & Spaceflight Pathology

**Candidate & Lead Architect:** Fabio Malagutti (Computer Engineer • M.Sc. Student @ University of Bologna)  
**Clinical Focus:** Physical & Rehabilitation Medicine (Physiatry), Space Physiology, Aerospace Hematology  
**Reference Framework:** NASA Human Research Program (HRP) Evidence Books, NASA-STD-3001  

---

## 1. Introduction: The Physiatric Perspective on Microgravity

In terrestrial clinical medicine, **Physiatry (Medicina Fisica e Riabilitativa)** examines the holistic functional unit comprising muscle, bone, joints, and peripheral vascular circulation. 

In microgravity, this functional unit undergoes accelerated pathological deconditioning:
* Skeletal muscle is not just a contractile organ for locomotion; it is a **primary endocrine organ**, a **mechanical transducer for bone remodeling**, and the **essential hemodynamic pump for venous return**.
* When mechanical loading is removed in deep space, muscle degradation (*sarcopenia*) acts as the primary trigger that precipitates bone mineral loss (*osteopenia*) and systemic vascular stasis (*thrombotic risk*).

---

## 2. The Musculoskeletal Cascade: Sarcopenia, Osteopenia & Crosstalk

```
                  +-----------------------------------+
                  |     MICROGRAVITY / UNLOADING      |
                  +-----------------------------------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
         [Skeletal Muscle Disuse]          [Direct Skeletal Unloading]
                    |                               |
                    v                               v
         Accelerated Sarcopenia            Decreased Strain on Osteocytes
         (Soleus/Gastrocnemius Atrophy)    (Sclerostin SOST Overexpression)
                    |                               |
                    +---------------+---------------+
                                    |
                                    v
                     [Disrupted Muscle-Bone Crosstalk]
                     * Drop in Myokines (Irisin, IL-15)
                     * Loss of Periosteal Strain
                                    |
                                    v
                     Accelerated Osteopenia
                     (1.0 - 1.5% BMD Loss / Month)
                                    |
                                    v
                     Severe Hypercalciuria
                     (High Risk: Nephrolithiasis / Kidney Stones)
```

### 2.1 Spaceflight-Induced Sarcopenia
In microgravity, muscles no longer counteract Earth's 1g gravitational acceleration:
* **Selective Fiber Atrophy:** Disuse atrophy predominantly targets **anti-gravity, postural slow-twitch (Type I, oxidative) muscle fibers**, specifically the **soleus**, **gastrocnemius**, **quadriceps vastus lateralis**, and **spinal erectors (multifidus)**.
* **Fiber Type Shifting:** Slow-twitch endurance fibers shift toward fast-twitch glycolytic (Type IIx) phenotypes, causing rapid muscle fatigue even during minimal exertion.
* **Kinetic Impact:** Astronauts can lose up to **20% of muscle volume in 11 days** of total unloading if resistive countermeasures are not executed, leading to severe postural instability upon planetary landing.

### 2.2 Spaceflight Osteopenia & Osteoporosis
Bone is a dynamic crystalline structure maintained by constant remodeling between **osteoblasts** (bone-forming cells) and **osteoclasts** (bone-resorbing cells):
* **Rate of Loss:** In weight-bearing bones (calcaneus, femoral head, femoral neck, pelvis, lumbar vertebrae $L1-L4$), bone mineral density (BMD) declines at a rate of **1.0% to 1.5% per month**. This is roughly **10 times faster** than post-menopausal osteoporosis on Earth.
* **Mechanobiology & Sclerostin:** Osteocytes embedded in the bone matrix act as strain sensors. In microgravity, the absence of fluid shear stress inside the canaliculi causes osteocytes to overproduce **sclerostin (SOST)**, which antagonizes the $Wnt/\beta\text{-catenin}$ pathway, suppressing osteoblast proliferation while stimulating osteoclast-mediated osteolysis.
* **Secondary Renal Complication (Hypercalciuria):** The rapid resorption of calcium phosphate into the bloodstream floods the renal tubules with free ionic calcium. Without high hydration and potassium citrate countermeasures, astronauts face a critical incidence of **nephrolithiasis (calcium oxalate/phosphate kidney stones)**, which represents a catastrophic surgical emergency in deep space.

### 2.3 Muscle-Bone Crosstalk: The Mechanobiological Axis
The physiatric model proves that bone cannot be protected merely by administering calcium and Vitamin D; **it requires mechanical muscle coupling**:
1. **Mechanical Strain Coupling (Wolff's Law):** Muscle contractions apply high-magnitude mechanical strain to bone via tendons, the periosteum, and Sharpey's fibers. This mechanical deformation generates interstitial fluid flow within the lacuno-canalicular network, signaling osteocytes to suppress sclerostin and sustain bone density.
2. **Biochemical / Endocrine Crosstalk (Myokines vs. Osteokines):**
   * **Irisin (cleaved from FNDC5):** Secreted by active skeletal muscle during resistive contraction. Irisin crosses the periosteum, binds to $\alpha V$ integrins on osteocytes and osteoblasts, stimulating cortical bone mass and osteoblast differentiation. In sarcopenia, circulating irisin drops, accelerating bone breakdown.
   * **Osteocalcin:** Secreted by mature osteoblasts, undercarboxylated osteocalcin acts as a hormone that enhances muscle glucose uptake and increases muscle strength.
   * **Interleukin-6 (IL-6) & Follistatin:** Regulate the balance between muscle protein synthesis and osteoclastic bone resorption.

---

## 3. Vascular Hemodynamics & Thrombotic Risk: The Calf Muscle Pump and Jugular Stasis

One of the most consequential clinical discoveries in recent space medicine (Marshall-Goebel et al., *JAMA Network Open*, 2019; NASA Cardiovascular Laboratory) is the unexpected emergence of **venous stasis and occlusive thrombosis** during long-duration orbital missions.

```
+---------------------------------------------------------------------------------+
|                                VIRCHOW'S TRIAD IN DEEP SPACE                    |
+---------------------------------------------------------------------------------+
| 1. VENOUS STASIS:                                                              |
|    - Cephalic fluid shift (~2 Liters of fluid moves headward).                 |
|    - Internal Jugular Veins (IJV) become chronically distended and tortuous.   |
|    - Flow velocity drops to near-zero; occurrence of retrograde / stagnant flow.|
|    - Loss of the "Calf Muscle Pump" (soleus/gastrocnemius inactivity).         |
+---------------------------------------------------------------------------------+
| 2. ENDOTHELIAL STRESS & INJURY:                                                |
|    - Chronic venous mechanical over-distension.                                |
|    - Micro-vascular endothelial damage from Galactic Cosmic Rays (GCR).        |
+---------------------------------------------------------------------------------+
| 3. HYPERCOAGULABILITY:                                                         |
|    - Elevated circulating pro-thrombotic microparticles.                       |
|    - Hemoconcentration fluctuations and mild spaceflight dehydration.           |
|    - High free serum calcium and bone matrix resorption by-products.            |
+---------------------------------------------------------------------------------+
                                      |
                                      v
           [High Risk: Internal Jugular Vein Thrombosis & Pulmonary Embolism]
```

### 3.1 The Cephalic Fluid Shift
On Earth, gravity pulls roughly 2 liters of blood and interstitial fluid into the vascular beds of the lower extremities. In microgravity, this hydrostatic column collapses immediately:
* Fluids redistribute headward toward the chest, neck, and head.
* Central venous pressure increases acutely, driving facial puffiness, nasal congestion, and expansion of the internal jugular veins.

### 3.2 Pathophysiology of the Soleus-Venous Axis (Beyond the Terrestrial Calf Pump)
On Earth ($1g$), contraction of the **soleus and gastrocnemius muscles** acts as a peripheral mechanical heart (the *calf muscle pump*), propelling venous blood against the hydrostatic gravitational gradient toward the right atrium. In microgravity ($0g$), where hydrostatic pressure gradients vanish and cephalic venous engorgement is already present, tricipital muscle atrophy drives internal jugular vein (IJV) stasis through **three coupled pathophysiological mechanisms**:

1. **Peripheral Crural Venous Capacitance Remodeling:**
   * The deep intramuscular venous sinusoids of the soleus represent the primary elastic capacitance reservoir of the lower extremities.
   * Selective disuse atrophy of slow-twitch Type I fibers and loss of deep fascial tension cause structural collapse and concentric remodeling of these crural venous sinuses.
   * Consequently, the lower limbs lose their vascular compliance and can no longer sequester blood volume, trapping roughly $2\text{ Liters}$ of fluid within the thoraco-cephalic compartment and chronically over-distending the internal jugular vein ($\text{IJV-CSA} > 2.5\text{ cm}^2$).
2. **Depletion of the Myogenic Endothelial-Protective Secretome:**
   * Contracting skeletal muscle secretes systemic vasoprotective myokines (**Irisin**), prostacyclins ($PGI_2$), nitric oxide synthase activators, and extracellular vesicles enriched with **miR-126-3p**.
   * During spaceflight sarcopenia, the sharp decline in circulating Irisin and exosomal miR-126-3p deprives the jugular endothelium—already exposed to low hydrodynamic shear stress—of its anti-thrombotic biochemical shield, accelerating **Weibel-Palade body exocytosis** and releasing **von Willebrand Factor (vWF)** and **P-selectin** into the stagnant lumen.
3. **Active Hemodynamic Synergy with Lower Body Negative Pressure (LBNP):**
   * During LBNP decompression countermeasures ($-30\text{ mmHg}$), negative pressure draws cephalic blood caudally into the lower extremities.
   * Without active rhythmic soleus contraction (or Neuromuscular Electrical Stimulation, NMES) to regulate transmural capillary-venular filtration and maintain venous tone, passive pooling in an atrophic calf triggers sudden drops in mean arterial pressure and vasovagal syncope. Rhythmic calf activation stabilizes the hemodynamic loop, enabling sustained LBNP sessions that restore laminar jugular outflow ($v_{\text{IJV}} > 15\text{ cm/s}$).

### 3.3 Internal Jugular Vein Thrombosis (IJV Thrombosis)
Ultrasound studies aboard the ISS revealed that chronic distension of the internal jugular veins causes **blood flow stagnation, vortex formation, retrograde atrial wave inversion (elevated Jugular Venous Pulsatility Index, JVPI), and intermittent stagnant flow** in a majority of tested crew members.
* During an ISS mission, a routine ultrasound examination revealed an asymptomatic **completely occlusive thrombus in the left internal jugular vein**, requiring emergency subcutaneous anticoagulation therapy (Enoxaparin) followed by oral Apixaban.
* In a 1000-day Mars mission, an untreated jugular thrombus or deep vein thrombosis (DVT) carrying the risk of a **fatal pulmonary embolism** is an existential mission-ending catastrophe.

---

## 4. Other Spaceflight Environmental Pathology & Multi-Agency Research Grounding

### 4.1 Spaceflight-Associated Neuro-Ocular Syndrome (SANS) & NASA HRP Brain Fluid Pressure / B-Complex
* **Etiology:** Headward fluid shift elevates intracranial pressure (ICP), altering the translaminar pressure gradient (**NASA OSDR Study OSD-818**, https://osdr.nasa.gov/bio/repo/data/studies/OSD-818), while elevated cabin $CO_2$ ($3000-5000\text{ ppm}$) induces cerebral vasodilation.
* **Manifestation & NASA HRP Ongoing Countermeasures:** Optic disc edema (papilledema), globe flattening, choroidal folds, and hyperopic refractive shift. Grounded in **NASA HRP Ongoing Research (`Brain Fluid Pressure`, `Spinal Fluid Biomarkers`, `Thigh Cuff`, and `B-Complex`**, https://www.nasa.gov/hrp/ongoing-hrp-research/), ARES-Health couples $\text{ONSD} > 5.8\text{ mm}$ and $ppCO_2 > 3.0\text{ mmHg}$ to ECLSS $CO_2$ scrubbing, venoconstrictive Thigh Cuff / LBNP fluid sequestration, and B-complex vitamin (folate/B12/B6) endothelial supplementation.

### 4.2 Deep Space Radiation: GCR, SPE & CSA CANS Autonomous Neutron Dosimetry (2026)
* **Galactic Cosmic Rays (GCR) & Solar Particle Events (SPE):** High-energy heavy ions ($HZE$ nuclei) and solar proton fluxes induce DNA double-strand breaks, cell-free mitochondrial DNA release (**NASA OSDR Studies OSD-570 / OSD-571**), and accelerated endothelial senescence.
* **Secondary Neutron Radiation & CSA CANS (Canadian Space Agency, Feb 26, 2026):** As documented in the official CSA announcement (https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), secondary **neutron radiation** generated by cosmic ray interactions with spacecraft shielding accounts for **approximately 30% of total spacecraft radiation exposure** and possesses a disproportionately high Relative Biological Effectiveness (RBE) for cellular and hematopoietic damage. ARES-Health directly integrates the autonomous, real-time telemetry model of the **Canadian Active Neutron Spectrometer (CANS)** to monitor continuous time-stamped neutron dosimetry alongside charged-particle dose.

### 4.3 Accelerated Vascular Aging & Bone Marrow Adipogenesis (CSA Vascular Series & MARROW)
* **Arterial Stiffening & Insulin Resistance (CSA `Vascular Echo` & `Vascular Aging`):** As established by the Canadian Space Agency (https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp and https://www.asc-csa.gc.ca/eng/sciences/vascular.asp), six months in weightlessness induces carotid and femoral arterial wall thickening and stiffening equivalent to **10 to 20 years of terrestrial aging**, accompanied by sub-clinical insulin resistance.
* **Bone Marrow Fat Conversion & Space Anemia (CSA `MARROW`):** Unloading of weight-bearing bones converts hematopoietic marrow into adipose tissue, accelerating erythrocyte hemolysis ("space anemia", tracked via exosomal `miR-144` and `CTX-I/P1NP`).

### 4.4 Achilles Tendon Stiffness Collapse vs. Soleus Tone (ESA `Myotones` 2026 & NASA `OSD-51` / `Zero T2`)
* **Osteotendinous Biomechanical Mismatch:** Data from the **ESA `Myotones` ISS investigation** (https://www.esa.int/ESA_Multimedia/Images/2026/09/Myotones_Studying_muscle_adaptation_to_weightlessness, Sept 2026) and **NASA OSDR Study OSD-51** (https://osdr.nasa.gov/bio/repo/data/studies/OSD-51) demonstrate that during microgravity unloading, **Achilles tendon mechanical stiffness ($\text{N/m}$) decays quadratically**, while soleus and gastrocnemius fibers undergo divergent tone remodeling. Under treadmill-independent deep-space exercise regimens (**NASA HRP `Zero T2`**, https://www.nasa.gov/hrp/ongoing-hrp-research/), ARES-Health combines digital myotonometry stiffness with **Prof. Francesco Pegreffi's Ultrasound Muscle Quality Index ($\text{MQI}$)** to prevent Achilles tendon rupture upon return to planetary gravity ($0.38g$).

### 4.5 Behavioral Health, Circadian Disruption & NASA Artemis II `ARCHeR`
* **Mechanisms & Deep Space Monitoring:** Grounded in **NASA HRP Risks** (https://www.nasa.gov/hrp/risks/) and the **Artemis II `ARCHeR` & `Standard Measures` investigations**, lack of a 24-hour solar cycle and continuous ECLSS acoustic noise ($>60\text{ dBA}$) degrade Slow-Wave N3 sleep, cognitive reaction speed (PVT-B), and vocal formant dispersion.

---

## 5. Master Catalog of Clinical Metrics for ARES-Health (Multi-Agency Grounded)

The following metrics are defined as the core clinical indicators that ARES-Health ingests, evaluates, and acts upon:

| Category | Metric / Biomarker | Normal Earth Range | Spaceflight Target / Critical Threshold | Agency Source & Clinical Risk Addressed |
| :--- | :--- | :--- | :--- | :--- |
| **Musculoskeletal** | Ultrasound Muscle Quality Index ($\text{MQI}$: $\text{MT}, \theta_{\text{penn}}, \text{EI}$) | $1.00$ ($\theta_{\text{penn}} \ge 20^\circ$) | Drop $> 5.0\%$ or $\theta_{\text{penn}} < 15^\circ$ | NASA `OSD-51` & Pegreffi (2026): Soleus sarcopenia & myosteatosis. |
| **Musculoskeletal** | Achilles Tendon Dynamic Stiffness (`Myotones`) | $750 - 900\text{ N/m}$ | $< 580\text{ N/m}$ (Quadratic drop) | ESA `Myotones` (2026): Tendon laxity & $0.38g$ landing rupture risk. |
| **Musculoskeletal** | ARED / `Zero T2` Periosteal Strain ($\varepsilon_{\text{ARED}}$) | $> 1000\ \mu\varepsilon$ | $< 800\ \mu\varepsilon$ (Frost threshold) | NASA HRP `Zero T2` & `Spinal Health`: Loss of osteocyte loading. |
| **Musculoskeletal** | Bone Remodeling Ratio ($\text{CTX-I} / \text{P1NP}$) & Calcaneus BMD | Ratio $0.80 - 1.15$ | Ratio $> 1.65$ / BMD Loss $> 1.2\%/\text{mo}$ | NASA HRP `Bone Changes` & `CIPHER`: Uncoupled osteoclastic lysis. |
| **Musculoskeletal** | Urinary Free Calcium / Citrate Ratio | $< 0.40$ | $> 0.65\text{ mg/mg}$ | NASA HRP `Bone Changes`: Hypercalciuria & nephrolithiasis risk. |
| **Vascular / Hemodynamic** | IJV Peak Velocity ($v_{\max}$) & Shear Stress ($\tau_w$) | $25 - 45\text{ cm/s}$ / $> 3.5\text{ dyn/cm}^2$ | $< 5.0\text{ cm/s}$ / $\tau_w < 4.0\text{ dyn/cm}^2$ | NASA-ESA `Venous Haemostasis`: Jugular stasis ($0.31\text{ dyn/cm}^2$). |
| **Vascular / Hemodynamic** | IJV Cross-Sectional Area & Pulsatility ($\text{JVPI}$) | $0.8 - 1.4\text{ cm}^2$ / $\text{JVPI} < 0.85$ | $> 2.5\text{ cm}^2$ / $\text{JVPI} > 1.35$ | NASA OCHMO MTB-007: Venous distension & retrograde atrial wave. |
| **Vascular / Hemodynamic** | Arterial Pulse Wave Velocity (`PWV` Vascular Aging) | $6.0 - 7.5\text{ m/s}$ | $> 9.2\text{ m/s}$ ($+10-20\text{ yr}$ aging) | CSA `Vascular Echo` & `Vascular Aging`: Accelerated arterial stiffness. |
| **Vascular / Hemodynamic** | Resting HR & HRV (RMSSD via Nocturnal Radar / `Bio-Monitor`) | $50 - 70\text{ bpm}$ / $35 - 75\text{ ms}$ | $> 78\text{ bpm}$ / RMSSD $< 18\text{ ms}$ | CSA `Bio-Monitor` & NASA `ARCHeR`: Autonomic deconditioning. |
| **Neuro-Ocular (SANS)** | Optic Nerve Sheath Diameter ($\text{ONSD}$) & Visual Acuity | $4.5 - 5.5\text{ mm}$ / $0.0\text{ LogMAR}$ | $> 5.8\text{ mm}$ / $> +0.20\text{ LogMAR}$ | NASA HRP `Brain Fluid Pressure` & `OSD-818`: Elevated ICP & SANS. |
| **Radiation & Multi-Omics** | CSA `CANS` Autonomous Neutron Dose & Total Dose | $< 2.0\text{ mGy/yr}$ | Neutron fraction $\sim 30\%$ / Total $> 100\text{ mGy}$ | CSA `CANS` (2026) & NASA `OSD-570/571`: High-LET DNA/cf-mtDNA stress. |
| **Environmental** | Cabin $CO_2$ Partial Pressure ($ppCO_2$) | $< 0.4\text{ mmHg}$ | $> 3.0\text{ mmHg (3900 ppm)}$ | NASA HRP `Hostile Closed Environment`: Cerebral vasodilation & SANS. |
| **Behavioral & Gait** | Nocturnal Slow-Wave Sleep ($\%$) & $0.38g$ Gait Asymmetry ($\text{GAI}$) | N3 $> 20\%$ / $\text{GAI} < 5\%$ | N3 $< 8\%$ / $\text{GAI} > 12\%$ | NASA `ARCHeR`, ESA `BRACE` & Pegreffi (2025): Cognitive & fall risk. |

---

## 6. Physiatric Countermeasure Prescription Protocols (The "Act" Layer)

To satisfy NASA's mandate that the software enables astronauts to **act**, ARES-Health embeds specific Physiatric Countermeasure Algorithms:

### Protocol 1: Sarcopenia & Bone Loss Coupling Protocol
* *Trigger:* Sarcopenia index indicates $> 3\%$ reduction in soleus volume OR estimated calcaneus BMD loss exceeds $1.0\%/\text{month}$.
* *Action:*
  1. Recalibrates ARED (Advanced Resistive Exercise Device) prescription: elevates eccentric loading by $+12\%$ on deadlifts and heel-raises to maximize periosteal shear stress.
  2. Schedules oral Bisphosphonates (Alendronate) or Teriparatide if bone turnover markers remain elevated.
  3. Prescribes oral Potassium Citrate ($30\text{ mEq/day}$) to alkalinize urine and prevent calcium phosphate precipitation into kidney stones.

### Protocol 2: Venous Stasis & Thrombosis Prevention Protocol (With Hard Clinical Safety Gates)
* *Trigger:* Nocturnal resting HR elevated + physical inactivity $> 48\text{ hours}$ OR estimated/measured IJV peak velocity $< 5.0\text{ cm/s}$ ($\tau_w < 4.0\text{ dyn/cm}^2$).
* *Hard Clinical Safety Gate 1 (Strict Prohibition of Empirical Anticoagulation in Isolated Stasis):*
  * **Empirical administration of systemic anticoagulants (Apixaban or Enoxaparin) in the presence of reduced venous flow velocity alone ($v_{\text{IJV}} < 5.0\text{ cm/s}$) is strictly prohibited.** Administering anticoagulants without an imaging-confirmed thrombus exposes the astronaut to a catastrophic risk of fatal intracranial or subdural hemorrhage resulting from minor mechanical impacts in microgravity or during Extravehicular Activity (EVA).
* *Action Track A — Isolated Venous Stasis (Compressible Lumen, No Intraluminal Thrombus on POCUS):*
  1. Prescribes a purely physical, non-pharmacological countermeasure regimen: daily Lower Body Negative Pressure (LBNP) decompression at **$-30\text{ mmHg}$ for $45\text{ minutes/day}$** (Pappas et al., 2026) to draw pooled cephalic blood caudally and restore laminar jugular shear stress ($\tau_w > 4.0\text{ dyn/cm}^2$).
  2. Enforces an automated **Anti-Syncope Hemodynamic Guardrail** during LBNP: continuous monitoring of arterial pressure and heart rate, with immediate chamber venting to $0\text{ mmHg}$ if systolic blood pressure drops by $> 15\text{ mmHg}$ or heart rate exceeds $115\text{ bpm}$.
  3. Prescribes rhythmic isometric calf contractions or Neuromuscular Electrical Stimulation (NMES at $25 - 35\text{ Hz}$) coupled with controlled oral hydration to restore crural venous capacitance and endothelial miR-126/Irisin signaling.
* *Action Track B — Confirmed Intraluminal Thrombosis (Non-Compressible Venous Segment or Echogenic Thrombus on POCUS):*
  1. Initiates therapeutic anticoagulation strictly per NASA OCHMO MTB-007 protocol (subcutaneous Enoxaparin $1\text{ mg/kg}$ every $12\text{ hours}$ transitioning to oral Apixaban), only after mandatory verification of normal platelet count and absence of active bleeding.
  2. Automatically revokes EVA suit clearance (`EVA_CLEARANCE = REVOKED`) and high-impact exercise to prevent traumatic hemorrhage or thrombus embolization, while logging an encrypted priority medical packet for asynchronous Flight Surgeon review.

---

## 7. Deep Space Clinical Grounding: 2026 Literature & Official NASA Archive Linkage

All pathophysiological pathways, threshold constants, and countermeasure protocols in this specification are grounded in peer-reviewed 2025–2026 clinical literature and official NASA/CSA/ESA archives:
* **Federated NASA Open Science Data Repository (`cgene`, `alsda`, `esa`):** https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study (`OSD-51` 60-day HDBR Soleus/Vastus Lateralis muscle dataset, `OSD-195` 21-day bed rest muscle dataset, `OSD-570`/`OSD-571` Inspiration4/SOMA `cf-mtDNA` & `cfRNA`, and `OSD-818` SANS translaminar pressure).
* **NASA Life Sciences Portal (NLSP) & Open Data Catalog (`NASA-0000100`):** https://nlsp.nasa.gov/explore?dataType=EXPERIMENTS&sortBy=dateAdded_desc&page=1&limit=25&view=table and https://data.nasa.gov/dataset/nasa-life-sciences-portal-nlsp (`Flight Analogs Project [FAP]`, `BRSMFSR` Functional Stretch Reflex, `BRSMPT` Performance Testing, and *Neuroendocrine and Cardiovascular Response to Tilt* calibrating the LBNP $-30\text{ mmHg}$ anti-syncope blood pressure guardrail).
* **NASA Lifetime Surveillance of Astronaut Health (LSAH):** https://nlsp.nasa.gov/resources/lsah (Longitudinal epidemiological baselines for post-flight incomplete femoral/lumbar DXA bone recovery, FRAX fracture risk, persistent SANS choroidal folds, GCR cataracts, and cardiovascular aging).
* **Official NASA-STD-3001 Technical Standards (Volumes 1 & 2):** https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1 (`[V1 3001]`, `[V1 3002]`, `[V1 3003]`, `[V1 3006]`, `[V1 4001]`), https://www.nasa.gov/reference/nasa-std-3001v1/, and https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2 (`[V2 6001]`, `[V2 6026]`, `[V2 7043]`, `[V2 10001]`).
* **Systematic 2025–2026 Literature Review:** [07_Recent_2026_Literature_Physiatry_Biomedical_Engineering.md](file:///Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/07_Recent_2026_Literature_Physiatry_Biomedical_Engineering.md)

