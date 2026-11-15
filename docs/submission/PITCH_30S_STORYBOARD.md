# ARES-Health: 30-Second Pitch Video Storyboard (Format Option A)

- **Format Target:** NASA Space Apps Challenge 2026 Format Option A (Strictly `<= 30.000 s` total runtime)
- **Frame Rate & Resolution:** `1920x1080 @ 60 fps` (`1,800` frames max; final subtitle & audio close at `00:00:29,800` / frame `1,788` with `200 ms` black tail before hard cut at `00:00:30,000`)
- **Visual Palette:** Pure OLED `#000000` (`NASA-STD-3001 [V2 10001]`), Cyan `#06B6D4`, Amber `#F59E0B`, Critical Red `#EF4444`, Verified Green `#4ADE80`
- **Subtitle Track:** [PITCH_30S_SUBTITLES_EN.srt](PITCH_30S_SUBTITLES_EN.srt) (English SubRip, strictly `<= 00:00:30,000`)
- **Evidence Honesty Guard (Issue #12):** Persistent `ILLUSTRATIVE_UNVALIDATED` status badge visible in [OsSystemStatusBar.tsx](../../ares-cockpit/src/modules/os-shell/OsSystemStatusBar.tsx); `rmssd_ms` shown as `BEAT_INTERVALS_NOT_AVAILABLE` on `1 Hz` `BIDMC` numeric replay.

---

## Pre-Capture Runtime Launch

```bash
cd /Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026
./scripts/launch_ares_medos.sh --desktop
# Browser fallback: ./scripts/launch_ares_medos.sh --web (http://127.0.0.1:5173)
```

---

## Frame-by-Frame Choreography (`00:00.000` - `00:29.800`)

| Window (`s`) | Frames (`@60fps`) | Live Capture Source (`ARES-MedOS`) | UI Action / Compositing Overlay | Spoken Voiceover (Matched to `.srt`) |
| :--- | :---: | :--- | :--- | :--- |
| **`00.00 - 05.00`** | `0000 - 0300` | Macro zoom on [OsSystemStatusBar.tsx](../../ares-cockpit/src/modules/os-shell/OsSystemStatusBar.tsx) running natively (`128B BIN #...`, `ARINC-653 HM: 4/4 PARTITIONS NOMINAL`). | Cyan/amber highlight on `OWLT: 14m 12s (EIMO AUTONOMOUS) [V1 3006]` and `ILLUSTRATIVE_UNVALIDATED` badge. | *"En route to Mars, a 48-minute round-trip radio delay blocks cloud telemedicine. Astronauts need autonomous, air-gapped decision support directly on board."* |
| **`05.00 - 15.00`** | `0300 - 0900` | Split transition from `GATHER` view ([App.tsx](../../ares-cockpit/src/App.tsx)) replaying `bidmc_01_Numerics.csv` (`RECORDED BIDMC`, `13` missing samples preserved as `MISSING`, `BEAT_INTERVALS_NOT_AVAILABLE`) to `EVALUATE -> BODY_3D` ([BodyHeatmap.tsx](../../ares-cockpit/src/modules/body-3d-heatmap/BodyHeatmap.tsx)), then `Alt+Space` opening [OsCommandPalette.tsx](../../ares-cockpit/src/modules/os-shell/OsCommandPalette.tsx). | Lower-third technical bar: `9-CRATE SAFE RUST | 128B SEQLOCK IPC (42 ns) | FASTMCP <= 600 B (< 150 TOKENS)`. | *"ARES-Health runs 100% offline in Safe Rust, replaying recorded BIDMC telemetry at 1 Hz with strict null honesty and a 3D OLED cockpit backed by FastMCP (<150 tokens)."* |
| **`15.00 - 25.00`** | `0900 - 1500` | Live drag of [WhatIfConsole.tsx](../../ares-cockpit/src/modules/whatif-console/WhatIfConsole.tsx) sliders (`OVERLAY: ON`, `Mission Day = 180 d`, `ARED Exercise Load = 35%`), switching to `EVALUATE -> FORECAST` (`StlChart` + `PredicateBars` showing `tau_w`, `NQS-STL`, and `Timestral` cone `[q05, q50, q95]` tagged `ILLUSTRATIVE_SCENARIO_RANGE`). | Equation callout: `tau_w = 2*mu*vmax*sqrt(pi/CSA) [dyn/cm2] | O(1) Lemire NQS-STL | Timestral [q05, q50, q95]`. | *"Sub-millisecond What-If sliders evaluate coupled muscle-bone-jugular scenario ODEs, O(1) Signal Temporal Logic margins, and non-crossing Timestral forecast cones."* |
| **`25.00 - 29.800`** | `1500 - 1788` | Switch to `ACT` tab ([PlaybookRunner.tsx](../../ares-cockpit/src/modules/playbook-runner/PlaybookRunner.tsx)): show `GATE 1 ANTICOAG: LOCKED`, `GATE 2 AUTO-VENT`, `GATE 3 EVA DAMPING`, `GATE 4A DECOMPRESSION LOCK`, and `GATE 4B EVA NO-GO` across 15 MedOps Playbooks, followed by end-card `GATHER -> EVALUATE -> ACT`. | End-card overlay: `ARES-HEALTH | MiServeRDC/nasa-space-apps-2026 | MIT OR Apache-2.0`. Hard cut to black at `00:00:30,000`. | *"15 MedOps playbooks enforce 4 hard clinical safety gates including POCUS clot locks, LBNP auto-venting, and EVA fitness. ARES-Health: Gather, Evaluate, Act."* |
