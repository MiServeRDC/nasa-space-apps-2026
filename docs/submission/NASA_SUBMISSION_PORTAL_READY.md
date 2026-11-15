# ARES-Health submission copy and release status

Prepared in English for team review before pasting into the submission portal.
The project and demo links should open without requiring reviewer sign-in.

## Current delivery: GitHub source repository

Use the [public GitHub repository](https://github.com/MiServeRDC/nasa-space-apps-2026) as the source link.
Reviewers can follow the [README run instructions](../../README.md#run-the-demo)
and [judge walkthrough](JUDGES_START_HERE.md) to launch the cockpit and engine
locally. The online video is a separate submission link.

<<<<<<< Updated upstream
## Project title
=======
- **Project Title:** `ARES-Health: Autonomous Resilient Edge-native System for Astronaut Health`
- **Official Challenge Track:** *Create Health Monitoring Software for Astronauts on Space Missions*
- **Challenge Portal:** https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/
- **Open-Source Repository:** https://github.com/MiServeRDC/nasa-space-apps-2026
- **License:** `MIT OR Apache-2.0` (OSI-approved dual permissive license)
- **Team (`MiServeRDC/nasa-space-apps-2026`):** ARES-Health Core Engineering Team, `ARES-Health Team`, `ARES-Health Team`, `ARES-Health Team`, `@MiServeRDC`
>>>>>>> Stashed changes

ARES-Health: offline astronaut health monitoring and guided response

## Short summary

ARES-Health is a software prototype that helps a crew member gather health
indicators, evaluate changes and follow an explainable response checklist without
an external inference service. A Rust engine feeds a React cockpit using recorded
PhysioNet BIDMC vital signs and explicitly labeled scenario inputs. Personal
baseline monitoring detects injected deviations, keeps missing measurements
unavailable and selects a relevant illustrative playbook. The interface separates
recorded data, derived values and simulation, preserves checklist progress and
recovers when the backend reconnects. It is an engineering demonstration, not a
clinically validated flight-medicine system.

## What judges can actually try

GATHER displays recorded heart rate, pulse, respiration and oxygen saturation with
source and missing-data labels. The engine learns a personal baseline over 120
real seconds; the UI does not bypass this interval. An explicitly synthetic event
can then be injected into the recording. A sustained detector alarm selects an
illustrative ACT checklist, whose progress is separate from physiological recovery.

EVALUATE offers an anatomical view and What-If scenario controls. Enabling that
overlay explicitly runs illustrative organ models. It does not supply missing
beat-to-beat intervals or turn an ICU recording into astronaut measurements. The
numeric dataset lacks R-R intervals, so HRV and dependent global MRI/TTV stay
unavailable. ECG display is illustrative. Short-horizon vital forecasts and longer
scenario trajectories must not be presented as trained clinical prediction or
calibrated individual risk.

The release runs one Rust HTTP/WebSocket server serving the built cockpit from
the same origin. Native local use needs no development toolchain after packaging;
hosted use needs a real container/server platform with TLS and WebSocket support.
An optional hosted judging copy would be a shared replay sandbox with no physical
sensors and recording disabled. Default Arrow is the selected storage infrastructure; the
optional LanceDB adapter remains experimental and is not a release dependency.

## NASA resources and other data: distinguish their roles

- NASA Human Research Program: https://www.nasa.gov/hrp/ — research context for
  organizing the hazards and physiological domains in the scenario models.
- NASA OSDR: https://osdr.nasa.gov/ — cited biological research/context metadata,
  not the source of the replayed vital signs and not evidence of clinical training.
- NASA-STD-3001 human-system standards: https://standards.nasa.gov/ — reference context for
  documented prototype requirements/policies. A citation does not certify ARES.
- NASA JSC ISS bone kinetics study (Gabel, Sibonga, Smith et al., 2022; DOI 10.1136/bjsports-2020-103602):
  peer-reviewed literature context motivating mechanostat loading thresholds and early
  FD15 hypercalciuria coupling; does not constitute clinical trial validation of the software.
- PhysioNet BIDMC PPG and Respiration Dataset v1.0.0:
  https://physionet.org/content/bidmc/1.0.0/ (DOI 10.13026/C2XW26) — the actual
  de-identified terrestrial numeric replay. File hashes and limits are documented
  in data/bidmc/README.md. No private astronaut medical data are claimed.
- Anatomy/font/software sources retain their own credits and licenses. See
  frontend/anatomy/ATTRIBUTION*.md in a built package and its third-party notices.

## AI assistance disclosure

OpenAI Codex assisted code implementation/review, integration testing, documentation
and release preparation. Humans retain responsibility for scientific claims,
resource citations and the final submission. This records assistance known from
this collaboration, not an assertion about every teammate's tools: the team lead
must add any other assistants actually used by team members. Do not imply that AI
output or software tests clinically validated the models.

## Links to supply at publication

- Final project and source: [https://github.com/MiServeRDC/nasa-space-apps-2026](https://github.com/MiServeRDC/nasa-space-apps-2026), checked without authentication.
- Demo: the team's later public video link. Do not submit the older Timestral-focused
  draft as evidence of the currently verified release without updating it.

Support guidance checked 2026-11-15:
https://github.com/nasa/spaceapps/discussions/1991 explains public final-project and
separate video/demo links; https://github.com/nasa/spaceapps/discussions/2025
explains that simulations should be labeled and research context is not clinical
validation. Check the actual portal fields and deadline at submission time.
