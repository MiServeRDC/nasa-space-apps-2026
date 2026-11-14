---
description: Run the deterministic ARES-Health verification probe (zero-panic check, JSON schema validation, Memory Bank integrity, and Cargo/Frontend checks)
---

1. Execute `./scripts/agent_probe.sh --fast` in the project root.
2. If any `.unwrap()`/`.expect()` violation, JSON schema error, or missing `memory-bank/` file is reported, fix it immediately before staging or pushing commits.
