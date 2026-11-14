# ARES cockpit visual refresh

## Brief and references

The user requests a substantial frontend redesign inspired by health-related
Awwwards entries. Build a working local version on `work/MiServeRDC` for visual
review. Preserve current telemetry, provenance, clinical gates and anatomy tools.

References reviewed on 2026-11-14:
- [Impilo Health Care](https://www.awwwards.com/sites/impilo-health-care/): medical-device line illustration and deep-blue composition.
- [Heureka Health](https://www.awwwards.com/sites/heureka-health/): legible hierarchy, generous spacing and clear navigation.

These are visual references only. Do not copy their code, graphics or branding.
The local UI/UX search returned a generic health marketing-page pattern; use its
accessibility checklist, but replace that pattern with an operational workspace.

## Visual decisions

- Palette: OLED `#000000`, surface `#0b101b`, elevated surface `#121d30`, line
  `#29364c`, medical blue `#9abfff`, primary text `#f1f5fc`. Semantic warning,
  critical and unavailable colors remain distinct from the blue navigation.
- Type: locally available Avenir Next / Segoe UI / system sans for interface and
  headings. Monospace is reserved for clocks and measurements. No remote fonts.
- Layout: quiet application chrome, a prominent page title and three-step
  Gather/Evaluate/Act navigation; a large primary workspace with a calmer context
  sidebar. The anatomical atlas remains the memorable visual element.
- Replace the equal-weight terminal panels with explicit panel headings, clearer
  spacing, readable controls and distinct secondary/system information.
- Preserve pure-black canvas for OLED; no decorative animation or fabricated
  waveforms, measurements, clinical assurances or patient identities.

## Implementation

1. Restyle shared tokens, application layout, cards, vitals and navigation.
2. Keep all existing React state, event handlers, transports and data gates.
3. Keep system diagnostics available behind a native details disclosure, with
   current data-mode/provenance information still visible in the workspace.
4. Preserve body layers, sex-profile behavior, manual notes/photos, existing tabs,
   What-If controls, playbooks and command palette.
5. Make mobile content scroll naturally, keep touch targets and visible focus,
   and honor reduced-motion preferences.

## Review and verification

Run frontend lint/build. Inspect local browser screenshots on desktop and mobile,
check all three phases, anatomy controls, scenario controls and command palette.
Check missing-value and pure-replay behavior with existing contract fixtures.
Update the memory bank with the actual results. No backend modifications,
automatic merge, hosted Actions, runtime CDN dependencies or public deployment.

## Integration onto current main

The reviewed preview was based on an older branch. The integration starts from
main `e8c2927` and ports the visual changes, retaining the current detector,
voice copilot, ground portal, recording studio, audit modal, keyboard shortcuts,
UBERON/GLB mapping and updated anatomy callbacks. Do not merge the old branch
wholesale or replace current App/BodyHeatmap logic with preview files.

Preserve main system/interlock status visibility in the disclosure summary.
Use an independent worktree/target and verify frontend lint, build, existing Node
tests, local fast agent probe and browser interactions before PR merge.

## Integrated verification

- `npm run lint`: passed.
- `npm run build`: passed, with the existing large-bundle warning.
- `node --experimental-strip-types --test tests/*.test.ts`: 21 tests passed in 7 suites.
- `bash scripts/agent_probe.sh --fast`: passed, including workspace check/Clippy.
- Browser: three phase pages, ground portal, studio, audit and shortcut overlays
  worked; no page errors. Inspected screenshots at 1440px and 390px; no horizontal
  page overflow. All verification ran locally; no hosted workflow was invoked.
