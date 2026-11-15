---
version: alpha
name: ARES-Health Aerospace Clinical Cockpit
description: High-contrast OLED dark-mode clinical telemetry and 3D biodigital twin design system for deep-space autonomous medical operations.
colors:
  background: "#000000"
  surface: "#0a0a0a"
  surfaceElevated: "#14161a"
  primary: "#e8eef5"
  secondary: "#94a3b8"
  accent: "#38bdf8"
  nominal: "#22c55e"
  warning: "#f59e0b"
  critical: "#ef4444"
  border: "#1e293b"
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
---

# Overview

ARES-Health is an autonomous aerospace medical decision-support cockpit operating over air-gapped 20 Hz physiological telemetry and a 3D React Three Fiber anatomical digital twin. Every visual choice prioritizes rapid clinical triage under sleep deprivation and strict non-fabrication of missing sensor channels.

# Colors

- **Background (`#000000`) & Surface (`#0a0a0a`)**: Pure OLED black void keeps 3D anatomical overlays legible and prevents glare in dim spacecraft lighting.
- **Clinical Status Accents**: Semantic colors (`#22c55e` nominal, `#f59e0b` caution, `#ef4444` critical, `#38bdf8` telemetry highlight) are reserved strictly for clinical state, safety gates, and active selection—never decorative gradients.
- **Contrast**: Body text (`#e8eef5` on `#000000` / `#0a0a0a`) exceeds WCAG AAA contrast; secondary metadata (`#94a3b8`) exceeds WCAG AA.

# Typography

- **Primary UI (`Geist Variable`)**: Self-hosted variable font with metric-matched fallback (`Geist-Fallback`) for zero CLS.
- **Telemetry Numerals (`Geist Mono Variable`)**: Tabular monospace numerals (`tabular-nums`) are mandatory for all vitals, timestamps, radiation doses, and safety-gate thresholds.

# Layout & Components

- **Full-Viewport Spatial Workbench**: Fixed `100dvh` cockpit with 3-phase clinical deck (`Gather -> Evaluate -> Act`), persistent HorizonBar, and 3D anatomical canvas.
- **Honest Missingness**: Missing or uncalibrated channels (`null`, `NaN`, unavailable HRV RMSSD) must render explicit unavailable/placeholder states and never substitute synthetic defaults.
- **Zero-Emoji Policy**: Strictly zero emojis in UI copy, logs, and code.

# Do's and Don'ts

- **Do**: Verify rendered layouts, WebGL canvas bounds, and console errors in live Chrome via `chrome-devtools-mcp` before shipping UI changes.
- **Do**: Keep animations subtle, deterministic, and non-blocking on the main thread (honoring `prefers-reduced-motion`).
- **Don't**: Add marketing landing-page effects (neon border beams, confetti, saturated purple gradients, or scroll-jacking) inside clinical telemetry panels.
