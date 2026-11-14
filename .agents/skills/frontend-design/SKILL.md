---
name: frontend-design
description: Modern frontend architecture, microgravity-optimized high-contrast OLED UI, React, TypeScript, Tailwind CSS, WebGL 3D rendering with Three.js / React-Three-Fiber, and real-time WebSocket state synchronization.
triggers:
  - frontend design
  - react three fiber
  - threejs 3d
  - oled dark mode
  - tailwind css
  - websocket real-time
  - data visualization
  - cockpit ui
---

# Frontend Design: Aerospace Cockpit, React 3D & Real-Time HSI

This skill guides the design and implementation of microgravity-optimized, high-contrast, accessible user interfaces for aerospace cockpits and mission-critical health dashboards.

## 1. Ergonomic Design Principles for Microgravity (NASA-STD-3001)

### A. Pure Black OLED Styling (`#000000`)
- Pure black backgrounds reduce battery consumption on portable crew tablets and minimize circadian disruption during night-time checks.
- High-contrast visual hierarchy:
  - Nominal / Optimal State: Emerald Green (`#10B981`)
  - Early Warning / Latent Drift: Amber (`#F59E0B`)
  - Critical Safety Violation: High-visibility Red (`#EF4444`)
  - Accent / Causal Pathways: Neon Cyan (`#06B6D4`) and Magenta (`#EC4899`)

### B. Tactile & Cognitive Accessibility
- Large touch targets (minimum $48 \times 48\text{ px}$) to accommodate degraded fine motor control during postural floating or suit pressure.
- No microscopic fonts: minimum body text size $14\text{ px}$, key scalar indicators $24-36\text{ px}$.
- Tri-Phase Workflow Bar clearly displayed at the top: `[1. GATHER] -> [2. EVALUATE] -> [3. ACT]`.

## 2. Technical Stack & 3D WebGL Implementation

### A. React + TypeScript + Tailwind CSS
- Use declarative components with strict TypeScript interfaces.
- Separate state management (Zustand or React Context) from presentation components.
- Establish WebSocket connections with auto-reconnect backoff to `ws://127.0.0.1:8080/ws`.

### B. 3D Anatomical Heatmap (`pmndrs/react-three-fiber` + `three.js`)
- Load low-poly wireframe humanoid mesh using `useGLTF`.
- Place 5 emissive anatomical nodes (Skull, Neck/IJV, Chest, Calf, Calcaneus) whose material `emissiveIntensity` is directly bound to normalized robustness margins:
  $$\text{emissiveColor} = \hat{\rho}_k(t) < 0 \ ? \ \text{RED} : (\hat{\rho}_k(t) < 0.3 \ ? \ \text{AMBER} : \text{GREEN})$$
- Render causal interaction arcs using `CubicBezierCurve3` with flowing dashed particle shaders.
