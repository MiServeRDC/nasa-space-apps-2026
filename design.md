# ARES Health cockpit

Reference: *Aether — Centralized Network Console*, by Samnang Aing, supplied as a Markdown design reference. The HTML named in that document was unavailable. This implementation adapts its visual system to the existing ARES flight workspace.

## Visual system

| Role | Value |
| --- | --- |
| Background | #040607 |
| Recessed controls | #000000 |
| Raised panels | #111615 |
| Panel edges | #373b34, with #817b6e for emphasis |
| Primary controls and working selection | #d8a85f |
| Active telemetry and focus | #5fcbb9 |
| Text and metadata | #ffffff and #a1a1aa |

Space Grotesk headlines carry the hierarchy. IBM Plex Mono labels, data and numeric inputs use locally bundled fonts. Controls use an 8 px radius and panels use a 16 px radius. Amber marks working selection and teal marks focus and active links. The existing warning and critical colors retain their semantic roles.

## Workspace

The navigation splits brand, phase controls and crew tools. The masthead pairs a wide task title with mission applications and connection controls. The header has a shared Data provenance disclosure. Opening it pushes the workspace down, so no status card can cover the table. The primary navigation exposes Tools and a labeled Shortcuts button. Narrow screens stack these regions in reading order. The atlas fills a compact, portrait-oriented panel alongside the forecast. The full figure is visible initially. Mouse-wheel and trackpad zoom follow the pointer.

The cockpit uses one anatomy atlas with paired male and female meshes from the working copy of `work/LelloXV`. The body profile selector changes the displayed anatomy and preserves the simulation inputs. Four visible layer buttons can combine Skin, Muscles, Organs and vessels, and Skeleton. Outer layers turn translucent over deeper layers. Materials use a muted anatomical palette. Add marker lets the crew pick a point directly on the model. The taller viewport and side-by-side forecast are designed for desktop and laptop screens. Asset provenance is in `ares-cockpit/public/anatomy/ATTRIBUTION-PAIRED.md`.

## Motion and operation

GSAP animates the masthead entrance and scrubs only atmospheric lighting as it scrolls away. CSS handles focus and hover states. Reduced-motion mode skips both animation effects. Fonts, models and motion code ship locally. Provenance, alarms, playbook gates, telemetry and scenario logic use the existing application behavior. The interface keeps critical controls visible in an operational layout.

## Integration with the flight workspace

The implementation keeps `main` as the source for telemetry validation, anomaly injection, 15 playbooks, safety gates and mission tools. Gather opens on the compact monitor with signal coverage and 30-second ranges from `work/LelloXV`. Signal coverage sits directly below Mission readiness. The historical BIDMC chart and anomaly panel keep their place in the main column. In local simulation, the chart explains how to connect a replay.

Evaluate opens with a horizontal row of scenario inputs on desktop. The paired anatomical atlas and the full 14-day forecast sit side by side below it. Narrow screens stack those panels. The atlas provides body profile selection, layer controls and photo attachment in the open. The ultrasound section follows the comparison. The ocular scan timer is an explicit local simulation control. Short-term forecasts and muscle and bone estimates remain expandable. The short-term forecast uses the same chart palette and separation of technical details as the main forecast.

Act puts the current instruction and its confirmation controls before the numbered checklist and the procedure library. The monitoring status follows incoming readings independently of checklist completion. Supporting explanations and sources stay behind a disclosure.

Native selects and disclosures use Phosphor carets. Cockpit overlays use the same Phosphor X button with a Close label. A critical margin or a vital-sign alarm shows a sticky, labeled alert with a direct route to Act. Simulated alarms are labeled as such.

The mission selector distinguishes orbit, transit, lunar surface, Mars rover and solar conjunction. Evaluate offers an explicit example cabin CO₂ preset for each mission and shows NASA aerobic capacity references only for applicable EVA types. Crew activity adds interpretation for rest or exercise without changing alarm thresholds. The alarm stays visible when an active incident loses telemetry and clears when updated data confirms the critical condition has ended. Act distinguishes completion of the checklist from recovery.
