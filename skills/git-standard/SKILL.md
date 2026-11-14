---
name: git-standard
description: Conventional commits standard and clean git branching model for team repositories and hackathon collaborative workflows.
triggers:
  - git commit
  - conventional commits
  - git branching
  - git workflow
  - pull request
---

# Git Standard: Conventional Commits & Clean Branching

This skill enforces strict, clean git commit messaging and branching hygiene across all contributors.

## 1. Commit Message Structure (Conventional Commits 1.0.0)

Format:
```
<type>(<scope>): <short summary in present tense>

[optional body explaining why, not what]

[optional footer(s)]
```

### Allowed Types
* `feat`: A new user-facing feature or algorithmic capability.
* `fix`: A bug fix or mathematical correction.
* `docs`: Documentation updates (markdown files, architecture specs).
* `style`: Formatting, whitespace adjustments (zero logic change).
* `refactor`: Code restructuring without fixing a bug or adding a feature.
* `perf`: Performance optimizations (e.g. O(1) algorithms, zero-copy).
* `test`: Adding or correcting unit/integration tests.
* `chore`: Build tooling, dependency bumps (`Cargo.toml`, `package.json`).

### Scope Examples
* `feat(rust-core)`: Add Two-Stage Bayesian POCUS state observer.
* `fix(math)`: Correct Hagen-Poiseuille wall shear stress dimension to dyn/cm2.
* `feat(cockpit-3d)`: Implement emissive anatomical nodes with react-three-fiber.
* `docs(readme)`: Update task allocation for 5-person hackathon team.

## 2. Invariants
* Never commit compiled binaries, `target/` folders, or `node_modules/`.
* Write concise, informative commit messages in English.
