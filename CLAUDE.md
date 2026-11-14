# CLAUDE.md: Claude Code Entry Point for ARES-Health

This file configures Claude Code for the ARES-Health project. It references the universal root specification defined in `AGENTS.md`.

## Core Guidelines
* **Read First:** Refer to `AGENTS.md`, `PANORAMICA_GENERALE_PROGETTO.md`, and `09_NASA_Space_Apps_Official_Rules_and_Judging_Guide.md` for architecture, mission domain, hackathon rules, and team roles.
* **Telemetry Contract:** All biometrics exchanged between Rust and React must adhere to `contracts/telemetry_schema.json`.
* **Invariant:** 100% offline edge execution, strict dimensional math, zero external cloud dependencies.
* **Invariant:** STRICTLY ZERO EMOJIS anywhere in output, code, or documentation.

## Primary Commands
```bash
# Rust Core
cargo check --workspace
cargo test --workspace -- --nocapture
cargo clippy --workspace -- -D warnings
cargo run --bin ares-engine

# Frontend Cockpit
npm install
npm run lint
npm run build
npm run dev

# Literature Research Skill
python3 .agents/skills/deep-scholar/scripts/search_academic.py --engine arxiv --query "space medicine" --limit 5
```

## Agent Skills
Skills are available in `.agents/skills/` (and mirrored in `.claude/skills/`):
* `deep-scholar`: Query arXiv and Crossref for peer-reviewed literature grounding.
* `rust-pro`: Advanced Safe Rust systems engineering, zero-copy, and Tokio concurrency.
* `frontend-design`: High-contrast OLED UI, React, Tailwind, Three.js 3D.
* `git-standard`: Conventional commits format.
