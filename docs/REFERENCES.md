# Research reading list

Reviewed November 13, 2026. This list supports preparation; it does not prescribe the team's solution. Repository documentation and declared licenses were reviewed, but these dependencies have not been installed or runtime-tested for this project.

## Official challenge resources

- [Challenge statement](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
- [Challenge resources](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources)
- [NASA: five hazards of human spaceflight](https://www.nasa.gov/hrp/hazards/)
- [NASA: human spaceflight risks](https://www.nasa.gov/hrp/risks/)
- [NASA: ongoing HRP research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)
- [Why do we conduct science experiments in space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)

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

Choose dependencies only after the team selects its stack and needs. Check the exact version, dependencies, models, and dataset terms before reuse.

VitalAgent's [VitalBench license](https://github.com/DKSEZD/VitalAgent/blob/main/dataset/vitalbench/LICENSE) is CC BY-NC-SA 4.0 and preserves source-dataset restrictions. The repository's MIT code license does not cover everything it references.

[rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox) is a possible camera-sensing research reference, but uses a [specific restricted source-code license](https://github.com/ubicomplab/rPPG-Toolbox/blob/main/LICENSE); do not assume MIT/OSI terms.

## Candidate terrestrial dataset

[PPG-DaLiA](https://archive.ics.uci.edu/dataset/495/ppg+dalia), DOI [10.24432/C53890](https://doi.org/10.24432/C53890): physiological and movement data from 15 participants, with an ECG heart-rate reference. UCI declares CC BY 4.0. The full archive is about 2.7 GB.

It may support technical evaluation, but is not astronaut data and does not replace documented NASA resource use.

## Attribution

For anything actually used, record the source URL, version/commit or dataset identifier, applicable license, changes made, and where it appears in the project. Cite the source in the official submission as required.

This preparation document was assembled with AI assistance for literature/repository discovery, summarization, and formatting. The team must verify references and independently choose its project idea.
