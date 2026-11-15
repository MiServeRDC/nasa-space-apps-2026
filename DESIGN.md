# ARES Health cockpit

The desktop cockpit adopts the OLED visual system from `work/MiServeRDC` at `cfcb41a`. Gather, Evaluate and Act remain separately selected screens. Existing data, anatomy, controls and workflows carry through the visual refresh.

## Visual system

| Role | Value |
| --- | --- |
| Background | #000000 |
| Panels | #080d15 |
| Panel headings | #0b1321 |
| Panel borders | #27364b |
| Working selection and focus | #38bdf8 |
| Primary text | #e2e8f0 |

Locally bundled Geist sets the interface and display type. Geist Mono is used for telemetry, mission identity and navigation. Panels use restrained blue-slate edges and a compact radius. Cyan marks controls and selection, while warning and critical colors keep their operational meaning.

## Workspace

The navigation splits brand, phase controls and crew tools. The masthead pairs a wide task title with mission applications and connection controls. The header has a shared Data provenance disclosure. Opening it pushes the workspace down, so no status card can cover the table. The primary navigation exposes Tools and a labeled Shortcuts button. Narrow screens stack these regions in reading order. The atlas fills a compact, portrait-oriented panel alongside the forecast. The full figure is visible initially. Mouse-wheel and trackpad zoom follow the pointer.

The cockpit uses one anatomy atlas with paired male and female meshes from the working copy of `work/ARES-Health Team`. The body profile selector changes the displayed anatomy and preserves the simulation inputs. Four visible layer buttons can combine Skin, Muscles, Organs and vessels, and Skeleton. Outer layers turn translucent over deeper layers. Materials use a muted anatomical palette. Add marker lets the crew pick a point directly on the model. The taller viewport and side-by-side forecast are designed for desktop and laptop screens. Asset provenance is in `ares-cockpit/public/anatomy/ATTRIBUTION-PAIRED.md`.

## Motion and operation

GSAP animates the masthead entrance and scrubs only atmospheric lighting as it scrolls away. CSS handles focus and hover states. Reduced-motion mode skips both animation effects. Fonts, models and motion code ship locally. Provenance, alarms, playbook gates, telemetry and scenario logic use the existing application behavior. The interface keeps critical controls visible in an operational layout.

## Integration with the flight workspace

The implementation keeps `main` as the source for telemetry validation, anomaly injection, 15 playbooks, safety gates and mission tools. Gather opens on the compact monitor with signal coverage and 30-second ranges from `work/ARES-Health Team`. Signal coverage sits directly below Mission readiness. The historical BIDMC chart and anomaly panel keep their place in the main column. In local simulation, the chart explains how to connect a replay.

Evaluate opens with a horizontal row of scenario inputs on desktop. The paired anatomical atlas and the full 14-day forecast sit side by side below it. Narrow screens stack those panels. The atlas provides body profile selection, layer controls and photo attachment in the open. The ultrasound section follows the comparison. The ocular scan timer is an explicit local simulation control. Short-term forecasts and muscle and bone estimates remain expandable. The short-term forecast uses the OLED panel palette, human-readable signal labels, units on the chart and summaries, and a separate disclosure for model details. Amber marks a deterministic fallback.

Act puts the current instruction and its confirmation controls before the numbered checklist and the procedure library. The monitoring status follows incoming readings independently of checklist completion. Supporting explanations and sources stay behind a disclosure.

Native selects and disclosures use Phosphor carets. Cockpit overlays use the same Phosphor X button with a Close label. A critical margin or a vital-sign alarm shows a sticky, labeled alert with a direct route to Act. Simulated alarms are labeled as such.

The mission selector distinguishes orbit, transit, lunar surface, Mars rover and solar conjunction. Selecting a mission applies its example cabin CO₂ automatically and shows NASA aerobic capacity references only for applicable EVA types. Crew activity adds interpretation for rest or exercise without changing alarm thresholds. The alarm stays visible when an active incident loses telemetry and clears when updated data confirms the critical condition has ended. Act keeps the incident checklist open until the suggested procedure is complete and fresh readings confirm recovery. When readings recover first, the workspace keeps an amber reminder until the remaining steps are confirmed. System details separate the simulated Earth link from the local engine connection.
