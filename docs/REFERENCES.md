# Research reading list

Reviewed November 13, 2026. This list supports preparation; it does not prescribe the team's solution. Repository documentation and declared licenses were reviewed, but these dependencies have not been installed or runtime-tested for this project.

## Official challenge resources

- [Challenge statement](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
- [Challenge resources](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources)
- [Official Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)
- [NASA: five hazards of human spaceflight](https://www.nasa.gov/hrp/hazards/)
- [NASA: human spaceflight risks](https://www.nasa.gov/hrp/risks/)
- [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)
- [Why do we conduct science experiments in space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)
- [NASA: ongoing HRP research (`ARCHeR`, `Venous Haemostasis`, `Zero T2`, `CIPHER`, `Thigh Cuff`, `B-Complex`)](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- [NASA OSDR Federated Multi-Agency Search (`cgene`, `alsda`, `esa`: `OSD-51`, `OSD-195`, `OSD-570/571`, `OSD-818`)](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
- [NASA Life Sciences Portal (NLSP) — Experiments Explorer (`FAP`, `SMCCP`, `BRSMFSR`, `BRSMPT`)](https://nlsp.nasa.gov/explore?dataType=EXPERIMENTS&sortBy=dateAdded_desc&page=1&limit=25&view=table)
- [NASA Open Data Portal Catalog for NLSP (`NASA-0000100`)](https://data.nasa.gov/dataset/nasa-life-sciences-portal-nlsp)
- [NASA Lifetime Surveillance of Astronaut Health (`LSAH`)](https://nlsp.nasa.gov/resources/lsah)
- [NASA-STD-3001 Volume 1 Rev C: Crew Health (`[V1 3001]–[V1 4001]`)](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1) and [NASA Reference Page](https://www.nasa.gov/reference/nasa-std-3001v1/)
- [NASA-STD-3001 Volume 2 Rev F (Jul 2026): Human Factors, Habitability, and Environmental Health (`[V2 6001]–[V2 10001]`)](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2)
- [CSA CANS (Feb 26, 2026): Monitoring Radiation for Astronaut Health (Canadian Active Neutron Spectrometer)](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)
- [CSA ISS Science: Accelerated Aging, `Bio-Monitor`, `Vascular Aging` & `MARROW`](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)
- [ESA `Myotones` (Sept 2026, ISS Expedition 75) & `BRACE` 60-Day HDBR](https://www.esa.int/ESA_Multimedia/Images/2026/09/Myotones_Studying_muscle_adaptation_to_weightlessness)
- [NASA `CHAPEA` 378-Day Mars Habitat Simulation (Missions 1 & 2)](https://www.nasa.gov/humans-in-space/chapea/) and [NASA `HERA`](https://www.nasa.gov/mission/hera/)
- [DLR `:envihab` Joint NASA-ESA-DLR `AGBRESA` & `SANS-CM` Bed Rest Studies](https://www.nasa.gov/mission/envihab/)
- [NASA TRISH `EXPAND` Commercial Spaceflight Database & `HERMES` Platform (Opened March 2026)](https://www.nasa.gov/hrp/the-translational-research-institute-for-space-health-trish/)
- [Joint NASA-JAXA `Bisphosphonates` Bone Loss Countermeasure Study](https://humans-in-space.jaxa.jp/en/biz-lab/experiment/theme/detail/000626.html)
- [PhysioNet `CEBS` (ECG, Breathing & Seismocardiograms) & `Fantasia`](https://physionet.org/content/cebsdb/1.0.0/)

## Papers

| Reference                                                                                                   | Why read it                                                        | Evidence boundary                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [Ebert et al., AMOS software demonstrations, 2026](https://doi.org/10.1177/15305627261422798)               | Autonomous procedural guidance and interface design on the ISS.    | Two analyzed sessions and specific ultrasound procedures, not general diagnostic validation. |
| [Balali et al., wearable cardiovascular monitoring, 2025](https://doi.org/10.1038/s41526-025-00522-8)       | Measurement context and choice of baseline posture.                | Study of 17 cosmonauts using specialist equipment.                                           |
| [Davis-Wilson et al., missing smartwatch data and HRV, 2025](https://doi.org/10.2196/53645)                 | Quality and missingness affect calculated metrics.                 | Terrestrial study; no universal astronaut threshold follows.                                 |
| [Zhu et al., VitalAgent, 2026](https://arxiv.org/abs/2605.29483)                                            | Signal-analysis tools, longitudinal context, and agent evaluation. | Preprint and terrestrial benchmarks, not spaceflight or clinical validation.                 |
| [De Martino et al., interconnected physiological systems, 2026](https://doi.org/10.3389/fnetp.2026.1867627) | Context across sleep, stress, and physiology.                      | Perspective article, not a validated decision algorithm.                                     |
| [Overbey et al., SOMA, 2024](https://doi.org/10.1038/s41586-024-07639-y)                                    | Space biomedical research and available data collections.          | Access and usability vary by collection.                                                     |

## Candidate repositories

| Repository                                               | Use                                                       | Declared license                        |
| -------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| [NeuroKit2](https://github.com/neuropsychology/NeuroKit) | Physiological processing and synthetic signals in Python. | MIT                                     |
| [WFDB Python](https://github.com/MIT-LCP/wfdb-python)    | WFDB physiological recordings and annotations.            | MIT                                     |
| [VitalAgent](https://github.com/DKSEZD/VitalAgent)       | Research implementation and evaluation reference.         | Code MIT; VitalBench has separate terms |
| [Plotly.js](https://github.com/plotly/plotly.js)         | Interactive visualizations in JavaScript.                 | MIT                                     |
| [Dexie.js](https://github.com/dexie/Dexie.js)            | Browser-local IndexedDB storage.                          | Apache-2.0                              |
| [Papa Parse](https://github.com/mholt/PapaParse)         | Browser CSV import/export.                                | MIT                                     |
| [physioKIT](https://github.com/AmbiqAI/physiokit)        | Physiological signal processing and synthesis.            | BSD-3-Clause                            |
| [OpenScreen](https://github.com/getopenscreen/openscreen) | Desktop screen recording and editing for cockpit demos, walkthroughs and pitch videos. | MIT |
| [Vercel UI SDK](https://github.com/vercel-labs/ui) | Framework-independent interaction behaviors with React adapters: keyboard navigation, focus, selection, popups, drag-and-drop and ARIA. | Apache-2.0; beta terms also referenced upstream |

Choose dependencies only after the team selects its stack and needs. Check the exact version, dependencies, models, and dataset terms before reuse.

### Demo production and UI interaction resources

Added at the user's request; upstream README and LICENSE files reviewed November 14, 2026. These are references for evaluation, not installed dependencies or completed integrations.

- **OpenScreen:** useful for recording the detailed anatomy view, changing scenario parameters, showing manual markers and producing a short product walkthrough. Its README documents desktop capture/editing, MP4/GIF export and a CLI. Use it as a development/presentation tool outside the medical runtime. Its optional external-provider AI editing features are not part of ARES's offline architecture. [README](https://github.com/getopenscreen/openscreen/blob/main/README.md), [MIT licence](https://github.com/getopenscreen/openscreen/blob/main/LICENSE). Reviewed README blob: `e0eb475b0b9ea6f31c8f90528a713c629db92847`.
- **Vercel UI SDK:** a possible reference for improving keyboard/focus behavior in anatomical-region controls, layer selectors, evidence drawers and the command palette. The React packages documented upstream are `@ui-sdk/core` and `@ui-sdk/react`. Evaluate a small interaction before adopting it across the cockpit; upstream explicitly marks it beta and links additional beta terms, so API stability and applicable terms need review before integration. It does not supply anatomical models or clinical inference. [README](https://github.com/vercel-labs/ui/blob/main/README.md), [Apache-2.0 licence](https://github.com/vercel-labs/ui/blob/main/LICENSE), [beta terms linked upstream](https://vercel.com/docs/release-phases/public-beta-agreement). Reviewed README blob: `c10e8fdb524548c52a813b27ee57de0902ef416a`.

VitalAgent's [VitalBench license](https://github.com/DKSEZD/VitalAgent/blob/main/dataset/vitalbench/LICENSE) is CC BY-NC-SA 4.0 and preserves source-dataset restrictions. The repository's MIT code license does not cover everything it references.

[rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox) is a possible camera-sensing research reference, but uses a [specific restricted source-code license](https://github.com/ubicomplab/rPPG-Toolbox/blob/main/LICENSE); do not assume MIT/OSI terms.

## Candidate terrestrial dataset

[PPG-DaLiA](https://archive.ics.uci.edu/dataset/495/ppg+dalia), DOI [10.24432/C53890](https://doi.org/10.24432/C53890): physiological and movement data from 15 participants, with an ECG heart-rate reference. UCI declares CC BY 4.0. The full archive is about 2.7 GB.

It may support technical evaluation, but is not astronaut data and does not replace documented NASA resource use.

## Attribution

For anything actually used, record the source URL, version/commit or dataset identifier, applicable license, changes made, and where it appears in the project. Cite the source in the official submission as required.

This preparation document was assembled with AI assistance for literature/repository discovery, summarization, and formatting. The team must verify references and independently choose its project idea.
