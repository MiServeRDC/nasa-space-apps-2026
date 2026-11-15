---
version: alpha
name: ARES-Health Aerospace Clinical Cockpit
description: High-contrast OLED dark-mode clinical telemetry and 3D biodigital twin design system for deep-space autonomous medical operations.
colors:
  background: "#000000"
  oled: "#000000"
  void: "#000000"
  panel: "#080d15"
  panel-headings: "#0b1321"
  panel-borders: "#27364b"
  surface: "oklch(0.13 0.008 250)"
  surface-l1: "oklch(0.13 0.008 250)"
  surface-l2: "oklch(0.17 0.012 250)"
  surface-l3: "oklch(0.10 0.006 250)"
  surfaceElevated: "oklch(0.17 0.012 250)"
  primary: "#e2e8f0"
  secondary: "#94a3b8"
  ink-display: "#ffffff"
  ink-body: "#e2e8f0"
  ink-meta: "#94a3b8"
  ink-muted: "#64748b"
  accent: "#38bdf8"
  accent-spatial: "#38bdf8"
  nominal: "#22c55e"
  status-nominal: "#22c55e"
  warning: "#eab308"
  status-caution: "#eab308"
  critical: "#f43f5e"
  status-critical: "#f43f5e"
  simulated: "#a855f7"
  status-simulated: "#a855f7"
  border: "#334155"
  border-active: "#38bdf8"
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

# ARES-Health Aerospace Clinical Cockpit & Biodigital Twin

The desktop cockpit adopts the OLED visual system from `work/MiServeRDC` at `cfcb41a` combined with the 3 NASA operational steps (Gather, Evaluate, Act) and the dual-mode switch between vertical scrollytelling and the 100dvh operational workbench. Existing data, anatomy, controls and workflows carry through the visual refresh.

## Visual System

| Role | Value | Description |
| --- | --- | --- |
| Background | #000000 | Absolute OLED pitch black |
| Panels | #080d15 | Dark slate glass surface with 75% opacity and blur |
| Panel headings | #0b1321 | Header strip background |
| Panel borders | #27364b | Restrained blue-slate edges (334155/60) |
| Working selection & focus | #38bdf8 | Cyan spatial highlight and primary flight-deck cues |
| Primary text | #e2e8f0 | High-contrast Geist display and body |
| Metadata & muted | #94a3b8 / #64748b | Monospace telemetry and provenance indicators |
| Status Nominal | #22c55e | Empirical observed status and cleared safety gates |
| Status Caution | #eab308 | Advisory states, missing-channel diagonal hatch |
| Status Critical | #f43f5e | Critical alarms and locked hard safety interlocks |

Locally bundled Geist sets the interface and display type. Geist Mono is used for telemetry, mission identity and navigation. Panels use restrained blue-slate edges and a compact radius. Cyan marks controls and selection, while warning and critical colors keep their operational meaning.

## Workspace & 3 NASA Steps

- **Gather**: Opens on the bedside monitor with 20 Hz Lead-II ECG strip, POCUS IJV ultrasound, signal coverage, 30-second rolling ranges, and cabin ECLSS telemetry. Signal coverage sits with honest missingness (`.ares-missing-hatch`). The historical BIDMC chart and anomaly panel keep their place in the telemetry column.
- **Evaluate**: Features the interactive 3D humanoid twin (`open-anatomy-3d` paired male/female GLBs) with 4-strata layer controls, neuro-ocular SANS ONSD caliper, AI injury inspector, 14-day STL robust forecast, and the short-term forecast (`TimestralQuantileConePanel`) with readable signal names, units, median/quantile legends, and model limitations disclosure.
- **Act**: Autonomous clinical decision support with 10 hard safety interlocks (Gates 1..7, 5A..5C), 30 Aerospace 360 flight playbooks across 4 mission domains, and physical crew confirmation (`PRESS & HOLD 1.5S TO ENGAGE ACTION`) committing immutable SHA-256 audit records.

## Invariants

- **Honest Missingness (`.ares-missing-hatch`)**: Missing or uncalibrated channels (`null`, `NaN`, unavailable HRV RMSSD) render a `-45deg` amber diagonal hatch with `--` sentinel and provenance tooltip—never synthetic zeros.
- **Strict Zero-Emoji Policy**: Strictly zero emojis in code, comments, logs, and user interface.
- **Dual-Mode Switch**: Seamless transition between `VIEW: NARRATIVE (SCROLL)` and `VIEW: WORKBENCH (COCKPIT)`.
