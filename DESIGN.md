---
version: alpha
name: ARES-Health Aerospace Clinical Cockpit
description: High-contrast OLED dark-mode clinical telemetry and 3D biodigital twin design system for deep-space autonomous medical operations.
colors:
  background: "#000000"
  oled: "#000000"
  void: "#000000"
  panel: "#0a0a0a"
  surface: "oklch(0.13 0.008 250)"
  surface-l1: "oklch(0.13 0.008 250)"
  surface-l2: "oklch(0.17 0.012 250)"
  surface-l3: "oklch(0.10 0.006 250)"
  surfaceElevated: "oklch(0.17 0.012 250)"
  primary: "oklch(0.96 0.002 250)"
  secondary: "oklch(0.65 0.008 250)"
  ink-display: "oklch(0.96 0.002 250)"
  ink-body: "oklch(0.85 0.004 250)"
  ink-meta: "oklch(0.65 0.008 250)"
  ink-muted: "oklch(0.48 0.010 250)"
  accent: "oklch(0.72 0.16 235)"
  accent-spatial: "oklch(0.72 0.16 235)"
  nominal: "oklch(0.72 0.17 152)"
  status-nominal: "oklch(0.72 0.17 152)"
  warning: "oklch(0.78 0.16 75)"
  status-caution: "oklch(0.78 0.16 75)"
  critical: "oklch(0.64 0.22 25)"
  status-critical: "oklch(0.64 0.22 25)"
  simulated: "oklch(0.68 0.17 300)"
  status-simulated: "oklch(0.68 0.17 300)"
  border: "oklch(1 0 0 / 0.09)"
  border-active: "oklch(1 0 0 / 0.16)"
typography:
  h1:
    fontFamily: Geist Variable
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
  h2:
    fontFamily: Geist Variable
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  body:
    fontFamily: Geist Variable
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: Geist Mono Variable
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  micro:
    fontFamily: Geist Mono Variable
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.08em
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  horizon-min: 36px
  horizon-max: 44px
  rail-left-min: 280px
  rail-left-max: 310px
  rail-right-min: 300px
  rail-right-max: 340px
  touch-target: 48px
rounded:
  none: 0px
  micro: 2px
  sm: 4px
  md: 8px
  lg: 12px
  shell: 14px
  full: 9999px
---

## Overview

ARES-Health is an autonomous aerospace medical decision-support cockpit operating over air-gapped 20 Hz physiological telemetry and a 3D React Three Fiber anatomical digital twin. Every visual choice prioritizes rapid clinical triage under sleep deprivation and strict non-fabrication of missing sensor channels.

## Colors

- **L0 OLED Void (`#000000`) & L1..L3 Elevation (`oklch(0.13 0.008 250)` / `oklch(0.17 0.012 250)` / `oklch(0.10 0.006 250)`)**: Pure `#000000` behind the 3D aperture and root canvas so dark space recedes completely behind bioluminescent organs and telemetry curves.
- **Specular Hairline Borders (`oklch(1 0 0 / 0.09)` resting, `oklch(1 0 0 / 0.16)` active/focus)**: Zero heavy slate frames and zero blurred outer drop shadows.
- **Semantic & Epistemic Accents**:
  - **Spatial / Focus Cyan (`oklch(0.72 0.16 235)`)**: Active selection, 3D aperture focus, and primary flight-deck telemetry cues.
  - **Nominal Emerald (`oklch(0.72 0.17 152)`)**: Empirical observed status and cleared safety gates.
  - **Caution / Epistemic Amber (`oklch(0.78 0.16 75)`)**: Advisory state, missing-channel 45-degree diagonal hatch, and degraded telemetry provenance.
  - **Critical / Gate-Trip Crimson (`oklch(0.64 0.22 25)`)**: Critical clinical alarms and locked hard safety interlocks.
  - **Counterfactual Simulated Violet (`oklch(0.68 0.17 300)`)**: Strict Issue #12 separation for counterfactual What-If projections (`ILLUSTRATIVE_UNVALIDATED`).
- **Contrast**: Primary ink (`oklch(0.96 0.002 250)`) on `#000000` / `L1` exceeds WCAG AAA contrast; secondary metadata (`oklch(0.65 0.008 250)`) exceeds WCAG AA.

## Typography

- **Primary UI (`Geist Variable`)**: Self-hosted variable font (`/fonts/Geist-Variable.woff2`) with metric-matched fallback (`Geist-Fallback`) for zero CLS.
- **Telemetry Numerals (`Geist Mono Variable`)**: Self-hosted `/fonts/GeistMono-Variable.woff2` enforcing `tabular-nums slashed-zero` (`.ares-tabular-metric`) for all vitals, timestamps, radiation doses, and safety-gate countdowns.

## Layout & Spacing

- **4px Base Grid**: Core rhythm steps (`4px`, `8px`, `12px`, `16px`, `24px`) organize peripheral telemetry rails around the central 3D aperture.
- **Full-Viewport Spatial Bento (`100dvh`)**: Desktop flight-deck pairs a single-row `36px` to `44px` `HorizonBar` with a `280-310px` left rail, a `55-65%` central 3D biodigital twin aperture, and a `300-340px` right diagnostic/playbook rail.
- **Scoped Touch Floor (`48px`)**: `48px` minimum control height applies strictly to touch viewports (`@media (pointer: coarse), (max-width: 1023px)`) and explicit primary confirmation actions (such as `HOLD 1.5S`) so desktop chrome remains compact.

## Elevation & Depth

- **Zero Outer Drop Shadows**: Visual separation uses tonal OKLCH steps (`L0` void -> `L1` rail -> `L2` elevated interactive control -> `L3` recessed inner well) plus `1px` specular borders and Houdini `@property` directional highlights.
- **Glassmorphism 2.0 Budget (`<= 4` Blur Surfaces)**: At most four concurrent `backdrop-filter: blur(12px)` root containers; zero nested blur wells and zero blur on `HorizonBar` or continuous waveform rails.

## Shapes

- **Instrumentation Micro-Radius (`2px`)**: Micro status tags, keycap hints, and telemetry tick badges.
- **Control & Bento Radius (`8px` - `14px`)**: `8px` for tactile controls and bento cards; `12px` to `14px` (`shell`) for primary rails and floating HUD shells.
- **Status Pill (`9999px`)**: Epistemic badges, live telemetry dots, and alarm pills.

## Components

- **Radix / shadcn OLED Primitives (`src/components/ui/`)**: Accessible `Button`, `Command`, `Sheet`, `Tabs`, `Tooltip`, and `Badge` primitives themed in `L0..L3` OKLCH tokens with `1px` specular borders and zero shadows.
- **Honest Missingness (`.ares-missing-hatch`)**: Missing or uncalibrated channels (`null`, `NaN`, unavailable HRV RMSSD) render a `-45deg` amber diagonal hatch with `--` sentinel and provenance tooltip—never synthetic zeros.
- **Zero-Emoji Policy**: Strictly zero emojis in UI copy, logs, and code.

## Do's and Don'ts

- **Do**: Verify rendered layouts, WebGL canvas bounds, Core Web Vitals, and console errors in live Chrome via `chrome-devtools-mcp` before shipping UI changes.
- **Do**: Keep animations subtle, deterministic, and wrapped in `gsap.context()` with `prefers-reduced-motion` immediate snap fallback.
- **Don't**: Add marketing landing-page effects (neon border beams, confetti, saturated purple gradients, or scroll-jacking) inside clinical telemetry panels.
